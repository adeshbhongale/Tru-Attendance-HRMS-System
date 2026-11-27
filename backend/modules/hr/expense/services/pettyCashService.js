const mongoose = require('mongoose');
const { PettyCashWallet, PettyCashTransaction, PettyCashRequest, PettyCashReturnRequest } = require('../models/PettyCash');
const access = require('./expenseAccess');

/**
 * Petty cash wallet service: the ONLY code that changes a wallet balance.
 *
 * Every balance change = one `$inc` on the wallet + one append-only ledger row, written
 * inside a MongoDB transaction (Atlas replica set). Each ledger row carries a unique
 * (companyId, idempotencyKey), so retries / double clicks / duplicate callbacks can never
 * post the same movement twice.
 *
 * Claim integration (decisions D1-D6):
 *  - only the submitter's wallet, only when Accounts has enabled it (first debit)
 *  - debit = full requested amount (grandRequested) when Full Payment is requested,
 *    otherwise policy-allowed amount (grandAllowed)
 *  - edits post the delta; Rejected / Deleted reverse the net debit; resubmit debits again
 *  - payment credits min(paidAmount, net debited) exactly once
 */

const toPaise = (rupees) => Math.round((Number(rupees) || 0) * 100);
const fromPaise = (paise) => Math.round(Number(paise) || 0) / 100;
const oid = (v) => new mongoose.Types.ObjectId(String(v?._id || v));

class PettyCashError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// ─── Transactions ────────────────────────────────────────────────────────────
let txnSupported = null; // null = unknown, false = standalone server (dev only)
const isNoTxnError = (err) => err && (err.code === 20 || /Transaction numbers are only allowed|replica set|does not support transactions/i.test(err.message || ''));

/** Run fn(session) atomically. Falls back to no-session only on a standalone (non replica set) server. */
async function runAtomic(fn) {
  if (txnSupported === false) return fn(null);
  try {
    const result = await mongoose.connection.transaction((session) => fn(session));
    txnSupported = true;
    return result;
  } catch (err) {
    if (isNoTxnError(err) && txnSupported !== true) {
      txnSupported = false;
      console.warn('[PettyCash] MongoDB transactions unavailable (standalone server). Running without transactions; use a replica set in production.');
      return fn(null);
    }
    throw err;
  }
}

const isDuplicateKey = (err) => err && err.code === 11000 && /idempotencyKey/.test(JSON.stringify(err.keyPattern || err.message || ''));

// ─── Wallets ────────────────────────────────────────────────────────────────
/** Create the wallet if missing (never duplicates: unique index + upsert, retried on a race). Run OUTSIDE a transaction. */
async function ensureWallet(companyId, employeeId) {
  const filter = { companyId: oid(companyId), employeeId: oid(employeeId) };
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await PettyCashWallet.findOneAndUpdate(filter, { $setOnInsert: filter }, { upsert: true, new: true, setDefaultsOnInsert: true });
    } catch (err) {
      if (err.code !== 11000 || attempt) throw err;
    }
  }
  return null;
}

const ADMIN_ROLES_EXCLUDED = [
  'superadmin', 'super_admin',
  'company_admin', 'companyadmin',
  'hr', 'hr_admin', 'dept:hr_admin',
  'store', 'store_admin', 'storeadmin', 'store_manager',
  'accounts', 'account_admin', 'accounts_admin', 'finance', 'finance_admin', 'dept:finance_admin', 'accountant',
  'department_admin', 'dept:management_admin', 'management_admin',
];
const ADMIN_ROLE_CODES_EXCLUDED = [
  'TCSA1', 'SUPER_ADMIN', 'SUPERADMIN',
  'TCCA1', 'COMPANY_ADMIN', 'COMPANYADMIN', 'APEXCA1', 'ADMIN',
  'TCSF2A', 'TCSFA', 'HR_ADMIN',
  'TCSTR1', 'STORE_ADMIN',
  'TCACC1', 'TCACC2', 'ACCOUNT_ADMIN', 'ACCOUNTS_ADMIN',
];

const ACTIVE_EMPLOYEE_FILTER = {
  scope: { $ne: 'GLOBAL' },
  status: { $nin: ['INACTIVE', 'inactive', 'DISABLED', 'disabled', 'TERMINATED', 'terminated', 'SUSPENDED', 'suspended', 'LOCKED', 'locked'] },
  role: { $nin: ADMIN_ROLES_EXCLUDED },
  roleCode: { $nin: ADMIN_ROLE_CODES_EXCLUDED },
  departmentAdminType: { $nin: ['store', 'accounts', 'account', 'finance', 'hr', 'admin'] },
  adminType: { $nin: ['store', 'accounts', 'account', 'finance', 'hr', 'admin'] },
};

/** Create wallets for every active non-admin employee of the company and remove any unused admin/inactive wallets. */
async function ensureCompanyWallets(companyId) {
  const User = require('../../../../models/User');
  const cid = oid(companyId);
  const users = await User.find({ companyId: cid, ...ACTIVE_EMPLOYEE_FILTER }).select('_id').lean();
  const validIds = users.map((u) => u._id);
  await PettyCashWallet.deleteMany({ companyId: cid, employeeId: { $nin: validIds }, balancePaise: 0 }).catch(() => {});
  if (!users.length) return 0;
  const ops = users.map((u) => ({
    updateOne: {
      filter: { companyId: cid, employeeId: u._id },
      update: {
        $setOnInsert: {
          companyId: cid,
          employeeId: u._id,
          baseLimitPaise: 0,
          balancePaise: 0,
          totalAllocationPaise: 0,
          totalReturnPaise: 0,
          totalCreditPaise: 0,
          totalDebitPaise: 0,
          currency: 'INR',
          enabled: false,
          status: 'ACTIVE',
        },
      },
      upsert: true,
    },
  }));
  const res = await PettyCashWallet.bulkWrite(ops, { ordered: false }).catch((err) => err.result || { upsertedCount: 0 });
  await backfillCompanyBaseLimits(cid).catch(() => {});
  return res.upsertedCount || 0;
}

/**
 * Idempotently backfill `baseLimitPaise`, `totalAllocationPaise`, and `totalReturnPaise` on legacy wallets
 * that had historical allocations (TOPUP / TOPUP_REQUEST) before the Base Limit field was introduced.
 * Never derives Base Limit from `balancePaise`; only sums explicit allocation & return ledger rows.
 */
async function backfillCompanyBaseLimits(companyId) {
  const cid = oid(companyId);
  const legacyWallets = await PettyCashWallet.find({
    companyId: cid,
    $or: [{ baseLimitPaise: 0 }, { baseLimitPaise: { $exists: false } }],
    totalCreditPaise: { $gt: 0 },
    $and: [{ $or: [{ totalAllocationPaise: 0 }, { totalAllocationPaise: { $exists: false } }] }],
  }).select('_id employeeId').lean();
  if (!legacyWallets.length) return 0;

  const walletIds = legacyWallets.map((w) => w._id);
  const agg = await PettyCashTransaction.aggregate([
    {
      $match: {
        companyId: cid,
        walletId: { $in: walletIds },
        source: { $in: ['TOPUP', 'PETTY_CASH_RETURN'] },
        reversedBy: null,
      },
    },
    {
      $group: {
        _id: '$walletId',
        allocPaise: {
          $sum: {
            $cond: [
              { $and: [{ $eq: ['$source', 'TOPUP'] }, { $eq: ['$direction', 'CR'] }] },
              '$amountPaise',
              0,
            ],
          },
        },
        returnPaise: {
          $sum: {
            $cond: [{ $eq: ['$source', 'PETTY_CASH_RETURN'] }, '$amountPaise', 0],
          },
        },
      },
    },
  ]);
  if (!agg.length) return 0;
  const ops = agg
    .filter((g) => g.allocPaise > 0 || g.returnPaise > 0)
    .map((g) => ({
      updateOne: {
        filter: { _id: g._id, $or: [{ baseLimitPaise: 0 }, { baseLimitPaise: { $exists: false } }] },
        update: {
          $set: {
            baseLimitPaise: Math.max(0, g.allocPaise),
            totalAllocationPaise: g.allocPaise,
            totalReturnPaise: g.returnPaise,
          },
        },
      },
    }));
  if (!ops.length) return 0;
  const res = await PettyCashWallet.bulkWrite(ops, { ordered: false }).catch(() => ({ modifiedCount: 0 }));
  return res.modifiedCount || 0;
}

// ─── Core posting ────────────────────────────────────────────────────────────
/**
 * Determine how a transaction affects `baseLimitPaise`:
 *  - TOPUP (Initial allocation / Accounts Admin or Super Admin direct allocation): +amountPaise
 *  - TOPUP_REQUEST (Enhancement request): 0 (Base Limit stays unchanged; only Balance increases)
 *  - MANUAL / ALLOCATION_ADJUSTMENT (Account adjustment): 0 (Base Limit stays unchanged; only Balance changes)
 *  - PETTY_CASH_RETURN (Processed return request): 0 (Base Limit stays unchanged; only Balance decreases)
 *  - REVERSAL: reverses the original transaction's exact baseLimitDelta (passed via p.baseLimitDeltaOverride)
 *  - CLAIM_SUBMIT, CLAIM_EDIT, CLAIM_REJECT, CLAIM_DELETE, CLAIM_PAYMENT: 0 (no change)
 */
function computeBaseLimitDelta(p) {
  const amt = p.amountPaise;
  if (p.type === 'REVERSAL') {
    return Number.isInteger(p.baseLimitDeltaOverride) ? p.baseLimitDeltaOverride : 0;
  }
  if (p.source === 'TOPUP' && p.affectBaseLimit !== false) return amt;
  return 0;
}

function deriveTransactionCategory(p, baseLimitBeforePaise, totalAllocationBeforePaise) {
  if (p.transactionCategory) return p.transactionCategory;
  if (p.type === 'REVERSAL') return 'REVERSAL';
  if (p.source === 'TOPUP') {
    return (baseLimitBeforePaise === 0 && totalAllocationBeforePaise === 0)
      ? 'INITIAL_ALLOCATION'
      : 'ALLOCATION_ENHANCEMENT';
  }
  if (p.source === 'TOPUP_REQUEST') return 'ALLOCATION_ENHANCEMENT';
  if (p.source === 'TEAM_LEAD_ADVANCE_IN' || p.source === 'TEAM_LEAD_ADVANCE_OUT') return 'TEAM_LEAD_ADVANCE';
  if (p.source === 'ALLOCATION_ADJUSTMENT') return 'ALLOCATION_ADJUSTMENT';
  if (p.source === 'PETTY_CASH_RETURN' || p.source === 'TEAM_LEAD_RETURN_IN') return 'PETTY_CASH_RETURN';
  if (['CLAIM_SUBMIT', 'CLAIM_EDIT', 'CLAIM_REJECT', 'CLAIM_DELETE'].includes(p.source)) return 'EXPENSE_DEDUCTION';
  if (p.source === 'CLAIM_PAYMENT') return 'CLAIM_SETTLEMENT';
  return 'OTHER_ADJUSTMENT';
}

/**
 * Post one ledger movement and update the wallet balance (and Base Limit when applicable) atomically (inside `session`).
 * Idempotent: an existing row with the same key is returned instead of posting again.
 */
async function postTransaction(p, session) {
  const amountPaise = p.amountPaise;
  if (!Number.isInteger(amountPaise) || amountPaise <= 0) throw new PettyCashError(422, 'Amount must be greater than zero.');
  if (!['CR', 'DR'].includes(p.direction)) throw new PettyCashError(422, 'Invalid direction.');
  const companyId = oid(p.companyId);
  const employeeId = oid(p.employeeId);

  const existing = await PettyCashTransaction.findOne({ companyId, idempotencyKey: p.idempotencyKey }).session(session || null);
  if (existing) return { txn: existing, duplicate: true };

  const signed = p.direction === 'CR' ? amountPaise : -amountPaise;
  const baseLimitDelta = computeBaseLimitDelta(p);

  // Reversals and claim-edit reductions reduce the side they undo so Total Credits and Total Debits stay exact.
  let creditDelta = 0;
  let debitDelta = 0;
  if ((p.type === 'REVERSAL' && p.direction === 'CR') || (p.source === 'CLAIM_EDIT' && p.direction === 'CR')) {
    debitDelta = -amountPaise;
  } else if (p.type === 'REVERSAL' && p.direction === 'DR') {
    creditDelta = -amountPaise;
  } else if (p.direction === 'CR') {
    creditDelta = amountPaise;
  } else {
    debitDelta = amountPaise;
  }

  let allocDelta = 0;
  let returnDelta = 0;
  if (p.source === 'TOPUP' && baseLimitDelta > 0) {
    allocDelta = baseLimitDelta;
  } else if (p.source === 'PETTY_CASH_RETURN') {
    returnDelta = amountPaise;
  } else if (p.type === 'REVERSAL') {
    if (p.originalSource === 'PETTY_CASH_RETURN') {
      returnDelta = -amountPaise;
    } else if (baseLimitDelta < 0) {
      allocDelta = baseLimitDelta;
    }
  }

  const inc = { balancePaise: signed };
  if (baseLimitDelta) inc.baseLimitPaise = baseLimitDelta;
  if (allocDelta) inc.totalAllocationPaise = allocDelta;
  if (returnDelta) inc.totalReturnPaise = returnDelta;
  if (creditDelta) inc.totalCreditPaise = creditDelta;
  if (debitDelta) inc.totalDebitPaise = debitDelta;
  const updateOp = { $inc: inc };
  if (p.autoEnable) updateOp.$set = { enabled: true };
  const walletFilter = { companyId, employeeId, ...(p.requireActive ? { status: 'ACTIVE' } : {}) };
  if (Number.isInteger(p.minBalancePaise)) {
    walletFilter.balancePaise = { $gte: p.minBalancePaise };
  }
  const wallet = await PettyCashWallet.findOneAndUpdate(
    walletFilter,
    updateOp,
    { new: true, session: session || undefined }
  );
  if (!wallet) {
    if (Number.isInteger(p.minBalancePaise)) {
      const current = await PettyCashWallet.findOne({ companyId, employeeId }).session(session || null).lean();
      if (current) {
        if (p.requireActive && current.status !== 'ACTIVE') {
          throw new PettyCashError(409, 'Petty cash wallet is currently frozen and cannot be debited.');
        }
        throw new PettyCashError(
          422,
          p.insufficientBalanceMessage ||
            `Insufficient petty cash balance (${rupee(current.balancePaise)}). Transfer of ${rupee(p.minBalancePaise)} would make the balance negative.`
        );
      }
    }
    throw new PettyCashError(404, 'Petty cash wallet not found for this employee.');
  }

  const baseLimitAfterPaise = wallet.baseLimitPaise || 0;
  const baseLimitBeforePaise = baseLimitAfterPaise - baseLimitDelta;
  const totalAllocBeforePaise = (wallet.totalAllocationPaise || 0) - allocDelta;
  const transactionCategory = deriveTransactionCategory(p, baseLimitBeforePaise, totalAllocBeforePaise);

  const user = p.req?.user;
  const txnDoc = {
    ...(p._id ? { _id: oid(p._id) } : {}),
    companyId,
    walletId: wallet._id,
    employeeId,
    type: p.type,
    direction: p.direction,
    source: p.source,
    transactionCategory,
    amountPaise,
    baseLimitBeforePaise,
    baseLimitAfterPaise,
    balanceBeforePaise: wallet.balancePaise - signed,
    balanceAfterPaise: wallet.balancePaise,
    claimId: p.claimId || null,
    claimNumber: p.claimNumber || '',
    paymentReference: p.paymentReference || '',
    requestId: p.requestId || null,
    returnRequestId: p.returnRequestId || null,
    counterpartyEmployeeId: p.counterpartyEmployeeId ? oid(p.counterpartyEmployeeId) : null,
    pairedTxnId: p.pairedTxnId ? oid(p.pairedTxnId) : null,
    reversalOf: p.reversalOf || null,
    idempotencyKey: p.idempotencyKey,
    description: p.description || '',
    remarks: p.remarks || '',
    performedBy: user?._id || null,
    performedByName: user?.name || (user ? '' : 'System'),
    performedByRole: p.performedByRole || (user ? String(user.role || '') : 'SYSTEM'),
  };
  const [txn] = await PettyCashTransaction.create([txnDoc], { session: session || undefined });
  return { txn, wallet, duplicate: false };
}

// ─── Claim integration ───────────────────────────────────────────────────────
const rupee = (paise) => `₹${fromPaise(paise).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const isFullPaymentClaim = (claim) => Boolean(claim?.fullPayment?.requested || claim?.requestFullPayment);

/**
 * Bring the claim's net wallet debit in line with its current state.
 *   PENDING  -> target = full requested amount (grandRequested) when Full Payment is requested,
 *               otherwise policy-allowed amount (grandAllowed) (first debit only if submitter's wallet is enabled)
 *   REJECTED / DRAFT / deleted (opts.deleted) -> target = 0 (reverse)
 *   PAID     -> unchanged (payment credit is separate)
 * Posts only the delta, guarded by `pettyCash.seq` so concurrent requests cannot double-post.
 * Must be called inside runAtomic AFTER the claim change has been written in the same session.
 */
async function syncClaimDebit(claim, { session, req, deleted = false } = {}) {
  if (!claim?.companyId || !claim?.submittedBy) return null;
  const pc = claim.pettyCash || {};
  const current = pc.debitedPaise || 0;
  const bs = access.businessStatus(claim);
  const isFullPayment = isFullPaymentClaim(claim);

  let target;
  if (deleted || bs === 'REJECTED' || bs === 'DRAFT') target = 0;
  else if (access.isAccountsApproved(claim)) return null;
  else if (bs === 'PENDING') {
    const debitAmount = isFullPayment ? (claim.grandRequested ?? claim.grandAllowed) : claim.grandAllowed;
    target = Math.max(0, toPaise(debitAmount));
  }
  else return null;

  const companyId = oid(claim.companyId);
  const employeeId = oid(claim.submittedBy);
  if (target > 0 && current === 0) {
    const wallet = await PettyCashWallet.findOne({ companyId, employeeId }).session(session || null).lean();
    if (!wallet || !wallet.enabled || wallet.status !== 'ACTIVE') return null; // D6: not a petty cash employee
  }
  const delta = target - current; // > 0 => more debit
  if (delta === 0) return null;

  const seq = (pc.seq || 0) + 1;
  // Optimistic guard: only the request that still sees the previous seq may post.
  const seqFilter = pc.seq
    ? { 'pettyCash.seq': pc.seq }
    : { $or: [{ 'pettyCash.seq': 0 }, { 'pettyCash.seq': null }, { 'pettyCash.seq': { $exists: false } }] };
  const guard = await mongoose.model('ExpenseClaim').updateOne(
    { _id: claim._id, ...seqFilter },
    { $set: { 'pettyCash.debitedPaise': target, 'pettyCash.seq': seq, 'pettyCash.lastSyncedAt': new Date() } },
    { session: session || undefined }
  );
  if (!guard.matchedCount) throw new PettyCashError(409, 'This claim was updated at the same time by another request. Please retry.');

  let type; let source; let description;
  const direction = delta > 0 ? 'DR' : 'CR';
  if (current === 0) {
    type = 'DEBIT';
    source = 'CLAIM_SUBMIT';
    description = isFullPayment
      ? `Claim ${claim.claimNumber} submitted (full payment requested ${rupee(target)}).`
      : `Claim ${claim.claimNumber} submitted (allowed ${rupee(target)}).`;
  } else if (target === 0) {
    type = 'REVERSAL';
    source = deleted ? 'CLAIM_DELETE' : 'CLAIM_REJECT';
    description = `Claim ${claim.claimNumber} ${deleted ? 'deleted' : 'rejected'}: debit of ${rupee(current)} reversed.`;
  } else {
    type = 'ADJUSTMENT';
    source = 'CLAIM_EDIT';
    description = isFullPayment
      ? `Claim ${claim.claimNumber} full payment amount changed ${rupee(current)} -> ${rupee(target)}.`
      : `Claim ${claim.claimNumber} allowed amount changed ${rupee(current)} -> ${rupee(target)}.`;
  }

  const res = await postTransaction({
    companyId, employeeId, type, direction, source,
    transactionCategory: 'EXPENSE_DEDUCTION',
    amountPaise: Math.abs(delta),
    idempotencyKey: `CLAIM:${claim._id}:${seq}`,
    claimId: claim._id, claimNumber: claim.claimNumber || '',
    description, req,
  }, session);

  if (claim.pettyCash) {
    claim.pettyCash.debitedPaise = target;
    claim.pettyCash.seq = seq;
    claim.pettyCash.walletId = res.txn.walletId;
  }
  await mongoose.model('ExpenseClaim').updateOne({ _id: claim._id }, { $set: { 'pettyCash.walletId': res.txn.walletId } }, { session: session || undefined });
  return res;
}

/**
 * Credit the submitter's wallet once ONLY when Accounts records the payment (status === 'PAID').
 * Never credits the wallet when the claim is only approved by Accounts Admin (ACCOUNTS_APPROVED / AWAITING_DISBURSEMENT).
 */
async function creditClaimPayment(claim, { session, req } = {}) {
  if (!claim?.companyId || !claim?.submittedBy) return null;
  const statusUpper = String(claim.status || '').toUpperCase();
  const paymentStatusUpper = String(claim.paymentStatus || '').toUpperCase();
  if (statusUpper !== 'PAID' || paymentStatusUpper !== 'PAID' || access.isAccountsApproved(claim)) return null;

  const pc = claim.pettyCash || {};
  const debited = pc.debitedPaise || 0;
  if (debited <= 0 || (pc.creditedPaise || 0) > 0) return null;
  const amountPaise = Math.min(toPaise(claim.paidAmount), debited);
  if (amountPaise <= 0) return null;

  const guard = await mongoose.model('ExpenseClaim').updateOne(
    {
      _id: claim._id,
      status: 'PAID',
      paymentStatus: 'PAID',
      'pettyCash.creditedPaise': { $in: [0, null] },
    },
    { $set: { 'pettyCash.creditedPaise': amountPaise, 'pettyCash.lastSyncedAt': new Date() } },
    { session: session || undefined }
  );
  if (!guard.matchedCount) return null; // already credited or not in PAID state

  const ref = claim.disbursement?.paymentReference || claim.utr || '';
  const res = await postTransaction({
    companyId: claim.companyId, employeeId: claim.submittedBy,
    type: 'CREDIT', direction: 'CR', source: 'CLAIM_PAYMENT',
    transactionCategory: 'CLAIM_SETTLEMENT',
    amountPaise,
    idempotencyKey: `CLAIM_PAY:${claim._id}`,
    claimId: claim._id, claimNumber: claim.claimNumber || '',
    paymentReference: ref,
    description: `Claim ${claim.claimNumber} paid: ${rupee(amountPaise)} credited back${ref ? ` (ref ${ref})` : ''}.`,
    req,
  }, session);
  if (claim.pettyCash) claim.pettyCash.creditedPaise = amountPaise;
  return res;
}

/** Ensure the submitter has a wallet before a claim transaction (wallet creation must not run inside it). */
async function prepareForClaim(claim) {
  if (!claim?.companyId || !claim?.submittedBy) return;
  await ensureWallet(claim.companyId, claim.submittedBy);
}

/** Wallet summary for the API (rupee values). */
async function walletBalanceOf(companyId, employeeId) {
  const w = await PettyCashWallet.findOne({ companyId: oid(companyId), employeeId: oid(employeeId) }).lean();
  return w ? {
    baseLimit: fromPaise(w.baseLimitPaise),
    balance: fromPaise(w.balancePaise),
    enabled: !!w.enabled,
    negative: w.balancePaise < 0,
  } : null;
}

// ─── Admin operations ───────────────────────────────────────────────────────
async function setWalletEnabled(companyId, employeeId, enabled, req) {
  await ensureWallet(companyId, employeeId);
  const wallet = await PettyCashWallet.findOneAndUpdate(
    { companyId: oid(companyId), employeeId: oid(employeeId) },
    { $set: enabled
      ? { enabled: true, enabledAt: new Date(), enabledBy: req?.user?._id || null }
      : { enabled: false } },
    { new: true }
  ).lean();
  return { wallet };
}

async function setAdvanceProvider(companyId, employeeId, isAdvanceProvider, req) {
  await ensureWallet(companyId, employeeId);
  const flag = !!isAdvanceProvider;
  const wallet = await PettyCashWallet.findOneAndUpdate(
    { companyId: oid(companyId), employeeId: oid(employeeId) },
    {
      $set: flag
        ? { isAdvanceProvider: true, advanceProviderSetAt: new Date(), advanceProviderSetBy: req?.user?._id || null }
        : { isAdvanceProvider: false },
    },
    { new: true }
  ).lean();
  return { wallet };
}

/**
 * Directly set/update an employee's Base Limit (Accounts Admin & Super Admin only).
 * Does not modify current Petty Cash Balance.
 */
async function setBaseLimit({ companyId, employeeId, baseLimitPaise, reason }) {
  if (!Number.isInteger(baseLimitPaise) || baseLimitPaise < 0) {
    throw new PettyCashError(422, 'Base Limit must be zero or a positive amount.');
  }
  await ensureWallet(companyId, employeeId);
  const wallet = await PettyCashWallet.findOneAndUpdate(
    { companyId: oid(companyId), employeeId: oid(employeeId) },
    {
      $set: {
        baseLimitPaise,
        totalAllocationPaise: baseLimitPaise,
      },
    },
    { new: true }
  ).lean();
  if (!wallet) throw new PettyCashError(404, 'Petty cash wallet not found for this employee.');
  return { wallet, reason: String(reason || '').trim() };
}

async function topUp({ companyId, employeeId, amountPaise, reason, reference, remarks, idempotencyKey, req }) {
  await ensureWallet(companyId, employeeId);
  return runAtomic((session) => postTransaction({
    companyId, employeeId, type: 'CREDIT', direction: 'CR', source: 'TOPUP',
    amountPaise, idempotencyKey: `TOPUP:${idempotencyKey}`,
    paymentReference: reference || '',
    description: `Petty cash added: ${rupee(amountPaise)}${reason ? ` (${reason})` : ''}.`,
    remarks: remarks || '', req, requireActive: true, autoEnable: true,
  }, session));
}

async function adjust({ companyId, employeeId, direction, amountPaise, reason, category, isAllocationIncrease, idempotencyKey, req }) {
  const isAlloc = String(category || '').toUpperCase() === 'ALLOCATION_ADJUSTMENT'
    || isAllocationIncrease === true
    || isAllocationIncrease === 'true';
  if (isAlloc && direction !== 'CR') {
    throw new PettyCashError(422, 'Allocation increase adjustment must be a Credit (CR).');
  }
  await ensureWallet(companyId, employeeId);
  return runAtomic((session) => postTransaction({
    companyId, employeeId,
    type: 'ADJUSTMENT',
    direction,
    source: isAlloc ? 'ALLOCATION_ADJUSTMENT' : 'MANUAL',
    transactionCategory: isAlloc ? 'ALLOCATION_ADJUSTMENT' : 'OTHER_ADJUSTMENT',
    amountPaise, idempotencyKey: `ADJ:${idempotencyKey}`,
    description: direction === 'CR'
      ? `Opening balance of ${rupee(amountPaise)}: ${reason}`
      : `Closing balance of ${rupee(amountPaise)}: ${reason}`,
    remarks: reason,
    req,
    autoEnable: isAlloc,
  }, session));
}

async function reverseSingleTxn(original, { companyId, reason, req, session }) {
  let origBaseDelta = 0;
  if (
    typeof original.baseLimitAfterPaise === 'number'
    && typeof original.baseLimitBeforePaise === 'number'
    && (original.baseLimitAfterPaise !== 0 || original.baseLimitBeforePaise !== 0)
  ) {
    origBaseDelta = original.baseLimitAfterPaise - original.baseLimitBeforePaise;
  } else if (original.source === 'TOPUP') {
    origBaseDelta = original.direction === 'CR' ? original.amountPaise : -original.amountPaise;
  }

  const res = await postTransaction({
    companyId, employeeId: original.employeeId,
    type: 'REVERSAL', direction: original.direction === 'CR' ? 'DR' : 'CR', source: 'REVERSAL',
    transactionCategory: 'REVERSAL',
    amountPaise: original.amountPaise,
    baseLimitDeltaOverride: -origBaseDelta,
    originalSource: original.source,
    idempotencyKey: `REV:${original._id}`,
    reversalOf: original._id,
    requestId: original.requestId || null,
    returnRequestId: original.returnRequestId || null,
    counterpartyEmployeeId: original.counterpartyEmployeeId || null,
    description: `Reversal of ${original.type} ${rupee(original.amountPaise)}: ${reason}`,
    remarks: reason, req,
  }, session);
  await PettyCashTransaction.updateOne({ _id: original._id, reversedBy: null }, { $set: { reversedBy: res.txn._id } }, { session: session || undefined });
  return res;
}

/** Reverse a manual / top-up / allocation / return / team-lead transfer transaction. Claim-linked rows are managed by the claim workflow. */
async function reverseTransaction({ companyId, txnId, reason, req }) {
  return runAtomic(async (session) => {
    const original = await PettyCashTransaction.findOne({ _id: oid(txnId), companyId: oid(companyId) }).session(session || null);
    if (!original) throw new PettyCashError(404, 'Transaction not found.');
    if (original.type === 'REVERSAL') throw new PettyCashError(409, 'A reversal cannot be reversed. Post an adjustment instead.');
    if (original.claimId) throw new PettyCashError(409, 'Claim-linked transactions are managed by the claim workflow (reject / delete the claim) and cannot be reversed manually.');
    if (original.reversedBy) throw new PettyCashError(409, 'This transaction has already been reversed.');

    const res = await reverseSingleTxn(original, { companyId, reason, req, session });

    // If this transaction is one leg of a Team Lead advance transfer, reverse its paired leg atomically too.
    let pairedRes = null;
    if (original.pairedTxnId) {
      const paired = await PettyCashTransaction.findOne({ _id: original.pairedTxnId, companyId: oid(companyId), reversedBy: null }).session(session || null);
      if (paired) {
        pairedRes = await reverseSingleTxn(paired, { companyId, reason, req, session });
      }
    }

    if (original.requestId) {
      await PettyCashRequest.updateOne({ _id: original.requestId }, { $set: { remarks: `Transfer/Credit reversed: ${reason}`.slice(0, 500) } }, { session: session || undefined });
    }
    if (original.returnRequestId) {
      await PettyCashReturnRequest.updateOne({ _id: original.returnRequestId }, { $set: { reviewRemarks: `Return reversed: ${reason}`.slice(0, 500) } }, { session: session || undefined });
    }
    return { ...res, pairedReversal: pairedRes?.txn || null };
  });
}

/** Credit an approved company top-up request (PENDING -> FULFILLED). */
async function fulfilRequest({ companyId, requestId, approvedAmountPaise, remarks, reference, req }) {
  const request = await PettyCashRequest.findOne({ _id: oid(requestId), companyId: oid(companyId) }).lean();
  if (!request) throw new PettyCashError(404, 'Request not found.');
  if (request.providerType === 'TEAM_LEAD') {
    throw new PettyCashError(409, 'Team Lead advance requests are handled by the assigned Team Lead, not Accounts Admin.');
  }
  if (request.status === 'FULFILLED') throw new PettyCashError(409, 'This request has already been credited.');
  if (request.status !== 'PENDING') throw new PettyCashError(409, 'This request was already reviewed.');
  const amountPaise = approvedAmountPaise || request.requestedAmountPaise;
  await ensureWallet(companyId, request.employeeId);
  return runAtomic(async (session) => {
    const now = new Date();
    const updated = await PettyCashRequest.findOneAndUpdate(
      { _id: request._id, status: 'PENDING', providerType: { $ne: 'TEAM_LEAD' } },
      {
        $set: {
          status: 'FULFILLED',
          approvedAmountPaise: amountPaise,
          reviewedBy: req?.user?._id || null,
          reviewedByName: req?.user?.name || '',
          reviewedAt: now,
          creditedAt: now,
          remarks: remarks || '',
        },
      },
      { new: true, session: session || undefined }
    );
    if (!updated) throw new PettyCashError(409, 'This request was already processed.');
    const res = await postTransaction({
      companyId, employeeId: request.employeeId, type: 'CREDIT', direction: 'CR', source: 'TOPUP_REQUEST',
      transactionCategory: 'ALLOCATION_ENHANCEMENT',
      amountPaise,
      idempotencyKey: `TOPUP_REQ:${request._id}`,
      requestId: request._id, paymentReference: reference || '',
      description: `Top-up request credited: ${rupee(amountPaise)}.`,
      remarks: request.reason, req, requireActive: true, autoEnable: true,
    }, session);
    await PettyCashRequest.updateOne({ _id: request._id }, { $set: { creditTxnId: res.txn._id } }, { session: session || undefined });
    return { request: { ...updated.toObject(), creditTxnId: res.txn._id }, ...res };
  });
}

// ─── Team Lead Petty Cash Advance Flow ───────────────────────────────────────

/** Available petty cash a Team Lead can transfer without going negative, accounting for unaccepted advances. */
async function getTeamLeadAvailableAdvance(companyId, teamLeadId, excludeRequestId = null, session = null) {
  const cid = oid(companyId);
  const tlId = oid(teamLeadId);
  const reqFilter = {
    companyId: cid,
    providerType: 'TEAM_LEAD',
    providerEmployeeId: tlId,
    status: 'AWAITING_EMPLOYEE_ACCEPTANCE',
  };
  if (excludeRequestId) reqFilter._id = { $ne: oid(excludeRequestId) };
  const [wallet, awaitingReqs] = await Promise.all([
    PettyCashWallet.findOne({ companyId: cid, employeeId: tlId }).session(session || null).lean(),
    PettyCashRequest.find(reqFilter).select('approvedAmountPaise').session(session || null).lean(),
  ]);
  const balancePaise = wallet ? (wallet.balancePaise || 0) : 0;
  const reservedPaise = (awaitingReqs || []).reduce((sum, r) => sum + (r.approvedAmountPaise || 0), 0);
  const availablePaise = Math.max(0, balancePaise - reservedPaise);
  return { wallet, balancePaise, reservedPaise, availablePaise };
}

/**
 * Team Lead accepts & submits a petty cash advance (PENDING -> AWAITING_EMPLOYEE_ACCEPTANCE).
 * Requires positive amount <= TL available balance (never allows TL to go negative), >= 1 proof, and remark.
 * Wallet balances are NOT moved until the requesting employee accepts.
 */
async function submitTeamLeadAdvance({ companyId, requestId, teamLeadId, approvedAmountPaise, proofs, remarks, req }) {
  const existing = await PettyCashRequest.findOne({ _id: oid(requestId), companyId: oid(companyId) }).lean();
  if (!existing) throw new PettyCashError(404, 'Enhancement request not found.');
  if (existing.providerType !== 'TEAM_LEAD') {
    throw new PettyCashError(409, 'This request is routed to Company (Accounts), not a Team Lead.');
  }
  if (String(existing.providerEmployeeId) !== String(teamLeadId)) {
    throw new PettyCashError(403, 'Only the selected Team Lead can respond to this request.');
  }
  if (existing.status !== 'PENDING') {
    throw new PettyCashError(409, 'This request has already been reviewed.');
  }
  if (!Number.isInteger(approvedAmountPaise) || approvedAmountPaise <= 0) {
    throw new PettyCashError(422, 'Advance amount must be greater than zero.');
  }
  const cleanProofs = Array.isArray(proofs)
    ? proofs.map((p) => (typeof p === 'string' ? p.trim() : String(p?.url || p?.uri || '').trim())).filter(Boolean).slice(0, 10)
    : [];
  if (!cleanProofs.length) {
    throw new PettyCashError(422, 'At least one proof photo is required to send the advance.');
  }
  const cleanRemarks = String(remarks || '').trim();
  if (cleanRemarks.length < 3) {
    throw new PettyCashError(422, 'Please enter a remark (at least 3 characters).');
  }

  const { balancePaise, reservedPaise, availablePaise } = await getTeamLeadAvailableAdvance(companyId, teamLeadId, existing._id);
  if (balancePaise <= 0) {
    throw new PettyCashError(422, `Your petty cash balance is ${rupee(balancePaise)}. You cannot transfer an advance while your balance is zero or negative.`);
  }
  if (availablePaise <= 0) {
    throw new PettyCashError(422, `Your available petty cash balance is ₹0.00 (${rupee(reservedPaise)} is awaiting employee acceptance).`);
  }
  if (approvedAmountPaise > availablePaise) {
    throw new PettyCashError(422, `Transfer amount (${rupee(approvedAmountPaise)}) cannot exceed your available petty cash balance (${rupee(availablePaise)}) so your balance does not go negative.`);
  }

  const now = new Date();
  const updated = await PettyCashRequest.findOneAndUpdate(
    { _id: existing._id, status: 'PENDING', providerType: 'TEAM_LEAD', providerEmployeeId: oid(teamLeadId) },
    {
      $set: {
        status: 'AWAITING_EMPLOYEE_ACCEPTANCE',
        approvedAmountPaise,
        tlProofs: cleanProofs,
        tlRemarks: cleanRemarks.slice(0, 500),
        tlSubmittedAt: now,
        reviewedBy: oid(teamLeadId),
        reviewedByName: req?.user?.name || existing.providerEmployeeName || '',
        reviewedAt: now,
        remarks: cleanRemarks.slice(0, 500),
      },
    },
    { new: true }
  ).lean();
  if (!updated) throw new PettyCashError(409, 'This request was already processed.');
  return { request: updated };
}

/** Team Lead rejects a petty cash advance request (PENDING -> REJECTED). Moves to History only. */
async function rejectTeamLeadAdvance({ companyId, requestId, teamLeadId, remarks, req }) {
  const existing = await PettyCashRequest.findOne({ _id: oid(requestId), companyId: oid(companyId) }).lean();
  if (!existing) throw new PettyCashError(404, 'Enhancement request not found.');
  if (existing.providerType !== 'TEAM_LEAD') {
    throw new PettyCashError(409, 'This request is routed to Company (Accounts), not a Team Lead.');
  }
  if (String(existing.providerEmployeeId) !== String(teamLeadId)) {
    throw new PettyCashError(403, 'Only the selected Team Lead can reject this request.');
  }
  if (existing.status !== 'PENDING') {
    throw new PettyCashError(409, 'This request has already been reviewed.');
  }
  const cleanRemarks = String(remarks || '').trim();
  if (cleanRemarks.length < 3) {
    throw new PettyCashError(422, 'Please provide a reason for rejecting the request (at least 3 characters).');
  }
  const now = new Date();
  const updated = await PettyCashRequest.findOneAndUpdate(
    { _id: existing._id, status: 'PENDING', providerType: 'TEAM_LEAD', providerEmployeeId: oid(teamLeadId) },
    {
      $set: {
        status: 'REJECTED',
        tlRemarks: cleanRemarks.slice(0, 500),
        reviewedBy: oid(teamLeadId),
        reviewedByName: req?.user?.name || existing.providerEmployeeName || '',
        reviewedAt: now,
        remarks: cleanRemarks.slice(0, 500),
      },
    },
    { new: true }
  ).lean();
  if (!updated) throw new PettyCashError(409, 'This request was already processed.');
  return { request: updated };
}

/**
 * Employee accepts a Team Lead advance (AWAITING_EMPLOYEE_ACCEPTANCE -> FULFILLED).
 * Atomically debits the Team Lead's wallet (guarded so TL balance never goes negative)
 * and credits the requesting Employee's wallet. Base Limits stay unchanged on both wallets.
 */
async function acceptTeamLeadAdvance({ companyId, requestId, employeeId, req }) {
  const existing = await PettyCashRequest.findOne({ _id: oid(requestId), companyId: oid(companyId) }).lean();
  if (!existing) throw new PettyCashError(404, 'Enhancement request not found.');
  if (existing.providerType !== 'TEAM_LEAD' || !existing.providerEmployeeId) {
    throw new PettyCashError(409, 'Only Team Lead advance requests require employee acceptance.');
  }
  if (String(existing.employeeId) !== String(employeeId)) {
    throw new PettyCashError(403, 'Only the requesting employee can accept this advance.');
  }
  if (existing.status === 'FULFILLED' || existing.employeeAcceptedAt) {
    throw new PettyCashError(409, 'This advance has already been accepted and credited.');
  }
  if (existing.status !== 'AWAITING_EMPLOYEE_ACCEPTANCE') {
    throw new PettyCashError(409, 'This request is not awaiting your acceptance.');
  }
  const amountPaise = existing.approvedAmountPaise;
  if (!Number.isInteger(amountPaise) || amountPaise <= 0) {
    throw new PettyCashError(422, 'Invalid advance amount.');
  }

  const User = require('../../../../models/User');
  const [empUser, tlUser] = await Promise.all([
    User.findById(existing.employeeId).select('name').lean(),
    User.findById(existing.providerEmployeeId).select('name').lean(),
  ]);
  const empName = empUser?.name || req?.user?.name || 'Employee';
  const tlName = tlUser?.name || existing.providerEmployeeName || 'Team Lead';

  await ensureWallet(companyId, existing.providerEmployeeId);
  await ensureWallet(companyId, existing.employeeId);

  const debitTxnId = new mongoose.Types.ObjectId();
  const creditTxnId = new mongoose.Types.ObjectId();

  return runAtomic(async (session) => {
    const now = new Date();
    const updated = await PettyCashRequest.findOneAndUpdate(
      {
        _id: existing._id,
        companyId: oid(companyId),
        employeeId: oid(employeeId),
        providerType: 'TEAM_LEAD',
        status: 'AWAITING_EMPLOYEE_ACCEPTANCE',
        employeeAcceptedAt: null,
      },
      {
        $set: {
          status: 'FULFILLED',
          employeeAcceptedAt: now,
          creditedAt: now,
          debitTxnId,
          creditTxnId,
        },
      },
      { new: true, session: session || undefined }
    );
    if (!updated) throw new PettyCashError(409, 'This advance was already accepted or processed.');

    const tlDebit = await postTransaction({
      _id: debitTxnId,
      companyId,
      employeeId: existing.providerEmployeeId,
      type: 'DEBIT',
      direction: 'DR',
      source: 'TEAM_LEAD_ADVANCE_OUT',
      transactionCategory: 'TEAM_LEAD_ADVANCE',
      amountPaise,
      minBalancePaise: amountPaise,
      insufficientBalanceMessage: `${tlName}'s current petty cash balance is less than ${rupee(amountPaise)}. Transfer cannot make Team Lead's balance negative.`,
      idempotencyKey: `TL_ADV_DR:${existing._id}`,
      requestId: existing._id,
      counterpartyEmployeeId: existing.employeeId,
      pairedTxnId: creditTxnId,
      description: `Petty cash advance given to ${empName}: ${rupee(amountPaise)}.`,
      remarks: existing.tlRemarks || existing.reason,
      req,
      requireActive: true,
    }, session);

    const empCredit = await postTransaction({
      _id: creditTxnId,
      companyId,
      employeeId: existing.employeeId,
      type: 'CREDIT',
      direction: 'CR',
      source: 'TEAM_LEAD_ADVANCE_IN',
      transactionCategory: 'TEAM_LEAD_ADVANCE',
      amountPaise,
      idempotencyKey: `TL_ADV_CR:${existing._id}`,
      requestId: existing._id,
      counterpartyEmployeeId: existing.providerEmployeeId,
      pairedTxnId: debitTxnId,
      description: `Petty cash advance received from ${tlName}: ${rupee(amountPaise)}.`,
      remarks: existing.tlRemarks || existing.reason,
      req,
      requireActive: true,
      autoEnable: true,
    }, session);

    return {
      request: updated.toObject(),
      debitTxn: tlDebit.txn,
      creditTxn: empCredit.txn,
      tlWallet: tlDebit.wallet,
      empWallet: empCredit.wallet,
      empName,
      tlName,
    };
  });
}

// ─── Petty Cash Return Requests ─────────────────────────────────────────────

/** Calculate available excess balance above Base Limit (`balance - baseLimit`) for return after reserving open return requests. */
async function getAvailableForReturn(companyId, employeeId, excludeReturnRequestId = null, session = null) {
  const cid = oid(companyId);
  const eid = oid(employeeId);
  const reqFilter = {
    companyId: cid,
    employeeId: eid,
    status: 'PENDING',
    transactionId: null,
  };
  if (excludeReturnRequestId) reqFilter._id = { $ne: oid(excludeReturnRequestId) };
  const [wallet, openReqs] = await Promise.all([
    PettyCashWallet.findOne({ companyId: cid, employeeId: eid }).session(session || null).lean(),
    PettyCashReturnRequest.find(reqFilter).session(session || null).lean(),
  ]);
  const balancePaise = wallet ? (wallet.balancePaise || 0) : 0;
  const baseLimitPaise = wallet ? (wallet.baseLimitPaise || 0) : 0;
  const excessPaise = Math.max(0, balancePaise - baseLimitPaise);
  const reservedPaise = (openReqs || []).reduce(
    (sum, r) => sum + (r.requestedAmountPaise || 0),
    0
  );
  const availablePaise = Math.max(0, excessPaise - reservedPaise);
  return {
    wallet,
    baseLimitPaise,
    balancePaise,
    excessPaise,
    reservedPaise,
    availablePaise,
    openCount: (openReqs || []).length,
  };
}

/** Employee creates a Return Request for excess petty cash above Base Limit (to Company or designated Team Lead). Requires payment proof. */
async function createReturnRequest({
  companyId,
  employeeId,
  requestedAmountPaise,
  reason,
  remarks,
  attachments = [],
  recipientType = 'COMPANY',
  recipientEmployeeId = null,
  recipientEmployeeName = '',
}) {
  if (!Number.isInteger(requestedAmountPaise) || requestedAmountPaise <= 0) {
    throw new PettyCashError(422, 'Return amount must be greater than zero.');
  }
  const cleanRemarks = String(remarks || reason || '').trim();
  if (cleanRemarks.length < 3) {
    throw new PettyCashError(422, 'Please provide a remark for returning petty cash (at least 3 characters).');
  }
  const cleanAttachments = Array.isArray(attachments)
    ? attachments
        .map((a) => (typeof a === 'string' ? a.trim() : String(a?.url || a?.uri || '').trim()))
        .filter(Boolean)
        .slice(0, 10)
    : [];
  if (!cleanAttachments.length) {
    throw new PettyCashError(422, 'At least one payment proof photo is required to submit a return request.');
  }
  const cleanReason = String(reason || cleanRemarks).trim();
  const wallet = await ensureWallet(companyId, employeeId);
  const { baseLimitPaise, balancePaise, excessPaise, reservedPaise, availablePaise, openCount } = await getAvailableForReturn(companyId, employeeId);
  if (openCount >= 3) {
    throw new PettyCashError(409, 'You already have 3 open return requests. Wait for them to be reviewed.');
  }
  if (balancePaise <= baseLimitPaise || excessPaise <= 0) {
    throw new PettyCashError(
      422,
      `Return request is only allowed when your Petty Cash Balance (${rupee(balancePaise)}) is greater than your Base Limit (${rupee(baseLimitPaise)}).`
    );
  }
  if (requestedAmountPaise > excessPaise) {
    throw new PettyCashError(
      422,
      `Return amount (${rupee(requestedAmountPaise)}) cannot exceed the extra amount above your Base Limit (${rupee(excessPaise)} = ${rupee(balancePaise)} − ${rupee(baseLimitPaise)}).`
    );
  }
  if (requestedAmountPaise > availablePaise) {
    throw new PettyCashError(
      422,
      `Return amount (${rupee(requestedAmountPaise)}) exceeds available returnable excess (${rupee(availablePaise)}) after accounting for pending return requests (${rupee(reservedPaise)}).`
    );
  }
  const doc = await PettyCashReturnRequest.create({
    companyId: oid(companyId),
    walletId: wallet._id,
    employeeId: oid(employeeId),
    recipientType: recipientType === 'TEAM_LEAD' ? 'TEAM_LEAD' : 'COMPANY',
    recipientEmployeeId: recipientType === 'TEAM_LEAD' && recipientEmployeeId ? oid(recipientEmployeeId) : null,
    recipientEmployeeName: recipientType === 'TEAM_LEAD' ? String(recipientEmployeeName || '').trim() : '',
    requestedAmountPaise,
    reason: cleanReason.slice(0, 500),
    remarks: cleanRemarks.slice(0, 500),
    attachments: cleanAttachments,
    status: 'PENDING',
  });
  return doc.toObject();
}

/**
 * Approve a Company Return Request (PENDING -> APPROVED) and deduct the return amount from Petty Cash Balance.
 * Accounts Admin can cut any positive return amount even if the employee submitted a claim while the return request was pending.
 * Requires a remark (`reviewRemarks`) of at least 3 characters.
 */
async function approveReturnRequest({ companyId, returnRequestId, approvedAmountPaise, reviewRemarks, reference, req }) {
  const existing = await PettyCashReturnRequest.findOne({ _id: oid(returnRequestId), companyId: oid(companyId) }).lean();
  if (!existing) throw new PettyCashError(404, 'Return request not found.');
  if (existing.recipientType === 'TEAM_LEAD') {
    throw new PettyCashError(409, 'Team Lead return requests are handled by the selected Team Lead, not Accounts Admin.');
  }
  if (existing.status === 'APPROVED' || existing.status === 'PROCESSED' || existing.transactionId) {
    throw new PettyCashError(409, 'This return request has already been approved.');
  }
  if (existing.status === 'REJECTED') {
    throw new PettyCashError(409, 'This return request was already rejected.');
  }

  const cleanRemarks = String(reviewRemarks || '').trim();
  if (cleanRemarks.length < 3) {
    throw new PettyCashError(422, 'Please provide a remark for approving the return request (at least 3 characters).');
  }

  const amountPaise = approvedAmountPaise !== undefined && approvedAmountPaise !== null
    ? approvedAmountPaise
    : existing.requestedAmountPaise;
  if (!Number.isInteger(amountPaise) || amountPaise <= 0) {
    throw new PettyCashError(422, 'Approved return amount must be greater than zero.');
  }

  await ensureWallet(companyId, existing.employeeId);
  return runAtomic(async (session) => {
    const now = new Date();
    const updated = await PettyCashReturnRequest.findOneAndUpdate(
      { _id: existing._id, status: 'PENDING', transactionId: null, recipientType: { $ne: 'TEAM_LEAD' } },
      {
        $set: {
          status: 'APPROVED',
          approvedAmountPaise: amountPaise,
          processedAmountPaise: amountPaise,
          reviewedBy: existing.reviewedBy || req?.user?._id || null,
          reviewedByName: existing.reviewedByName || req?.user?.name || '',
          reviewedAt: existing.reviewedAt || now,
          reviewRemarks: cleanRemarks.slice(0, 500),
          processedBy: req?.user?._id || null,
          processedByName: req?.user?.name || '',
          processedAt: now,
          paymentReference: String(reference || '').trim().slice(0, 100),
        },
      },
      { new: true, session: session || undefined }
    );
    if (!updated) throw new PettyCashError(409, 'This return request has already been approved.');

    const res = await postTransaction({
      companyId,
      employeeId: existing.employeeId,
      type: 'DEBIT',
      direction: 'DR',
      source: 'PETTY_CASH_RETURN',
      transactionCategory: 'PETTY_CASH_RETURN',
      amountPaise,
      idempotencyKey: `RETURN_REQ:${existing._id}`,
      returnRequestId: existing._id,
      paymentReference: String(reference || '').trim().slice(0, 100),
      description: `Petty cash return approved: ${rupee(amountPaise)} (${existing.remarks || existing.reason}).`,
      remarks: cleanRemarks.slice(0, 500),
      req,
    }, session);

    await PettyCashReturnRequest.updateOne(
      { _id: existing._id },
      { $set: { transactionId: res.txn._id, walletId: res.txn.walletId } },
      { session: session || undefined }
    );
    return { returnRequest: { ...updated.toObject(), transactionId: res.txn._id, walletId: res.txn.walletId }, ...res };
  });
}

/** Reject a Company Return Request (PENDING -> REJECTED). Never modifies Base Limit or Balance. */
async function rejectReturnRequest({ companyId, returnRequestId, reviewRemarks, req }) {
  const existing = await PettyCashReturnRequest.findOne({ _id: oid(returnRequestId), companyId: oid(companyId) }).lean();
  if (!existing) throw new PettyCashError(404, 'Return request not found.');
  if (existing.recipientType === 'TEAM_LEAD') {
    throw new PettyCashError(409, 'Team Lead return requests are handled by the selected Team Lead, not Accounts Admin.');
  }
  if (existing.status === 'APPROVED' || existing.status === 'PROCESSED' || existing.transactionId) {
    throw new PettyCashError(409, 'An approved return request cannot be rejected.');
  }
  if (existing.status === 'REJECTED') {
    throw new PettyCashError(409, 'This return request was already rejected.');
  }
  const cleanRemarks = String(reviewRemarks || '').trim();
  if (cleanRemarks.length < 3) {
    throw new PettyCashError(422, 'Please provide a reason for rejecting the return request.');
  }
  const updated = await PettyCashReturnRequest.findOneAndUpdate(
    { _id: existing._id, status: 'PENDING', transactionId: null, recipientType: { $ne: 'TEAM_LEAD' } },
    {
      $set: {
        status: 'REJECTED',
        reviewedBy: req?.user?._id || null,
        reviewedByName: req?.user?.name || '',
        reviewedAt: new Date(),
        reviewRemarks: cleanRemarks.slice(0, 500),
      },
    },
    { new: true }
  ).lean();
  if (!updated) throw new PettyCashError(409, 'This return request was already reviewed.');
  return { returnRequest: updated };
}

/**
 * Team Lead accepts a Return Request (PENDING -> APPROVED).
 * Atomically deducts the accepted return amount from the Employee's petty cash balance
 * and credits it to the Team Lead's petty cash balance. Base Limits stay unchanged on both wallets.
 */
async function approveTeamLeadReturnRequest({ companyId, returnRequestId, teamLeadId, approvedAmountPaise, reviewRemarks, req }) {
  const existing = await PettyCashReturnRequest.findOne({ _id: oid(returnRequestId), companyId: oid(companyId) }).lean();
  if (!existing) throw new PettyCashError(404, 'Return request not found.');
  if (existing.recipientType !== 'TEAM_LEAD' || !existing.recipientEmployeeId) {
    throw new PettyCashError(409, 'This return request is routed to Company (Accounts), not a Team Lead.');
  }
  if (String(existing.recipientEmployeeId) !== String(teamLeadId)) {
    throw new PettyCashError(403, 'Only the selected Team Lead can accept this return request.');
  }
  if (existing.status === 'APPROVED' || existing.status === 'PROCESSED' || existing.transactionId) {
    throw new PettyCashError(409, 'This return request has already been accepted.');
  }
  if (existing.status === 'REJECTED') {
    throw new PettyCashError(409, 'This return request was already rejected.');
  }

  const cleanRemarks = String(reviewRemarks || '').trim();
  if (cleanRemarks.length < 3) {
    throw new PettyCashError(422, 'Please provide a remark for accepting the return request (at least 3 characters).');
  }

  const amountPaise = approvedAmountPaise !== undefined && approvedAmountPaise !== null
    ? approvedAmountPaise
    : existing.requestedAmountPaise;
  if (!Number.isInteger(amountPaise) || amountPaise <= 0) {
    throw new PettyCashError(422, 'Accepted return amount must be greater than zero.');
  }

  const User = require('../../../../models/User');
  const [empUser, tlUser] = await Promise.all([
    User.findById(existing.employeeId).select('name').lean(),
    User.findById(existing.recipientEmployeeId).select('name').lean(),
  ]);
  const empName = empUser?.name || 'Employee';
  const tlName = tlUser?.name || req?.user?.name || existing.recipientEmployeeName || 'Team Lead';

  await ensureWallet(companyId, existing.employeeId);
  await ensureWallet(companyId, existing.recipientEmployeeId);

  const debitTxnId = new mongoose.Types.ObjectId();
  const creditTxnId = new mongoose.Types.ObjectId();

  return runAtomic(async (session) => {
    const now = new Date();
    const updated = await PettyCashReturnRequest.findOneAndUpdate(
      {
        _id: existing._id,
        companyId: oid(companyId),
        recipientType: 'TEAM_LEAD',
        recipientEmployeeId: oid(teamLeadId),
        status: 'PENDING',
        transactionId: null,
      },
      {
        $set: {
          status: 'APPROVED',
          approvedAmountPaise: amountPaise,
          processedAmountPaise: amountPaise,
          reviewedBy: oid(teamLeadId),
          reviewedByName: tlName,
          reviewedAt: now,
          reviewRemarks: cleanRemarks.slice(0, 500),
          processedBy: oid(teamLeadId),
          processedByName: tlName,
          processedAt: now,
          transactionId: debitTxnId,
          creditTxnId,
        },
      },
      { new: true, session: session || undefined }
    );
    if (!updated) throw new PettyCashError(409, 'This return request has already been processed.');

    const empDebit = await postTransaction({
      _id: debitTxnId,
      companyId,
      employeeId: existing.employeeId,
      type: 'DEBIT',
      direction: 'DR',
      source: 'PETTY_CASH_RETURN',
      transactionCategory: 'PETTY_CASH_RETURN',
      amountPaise,
      idempotencyKey: `RETURN_REQ:${existing._id}`,
      returnRequestId: existing._id,
      counterpartyEmployeeId: existing.recipientEmployeeId,
      pairedTxnId: creditTxnId,
      description: `Petty cash returned to ${tlName}: ${rupee(amountPaise)} (${existing.remarks || existing.reason}).`,
      remarks: cleanRemarks.slice(0, 500),
      req,
    }, session);

    const tlCredit = await postTransaction({
      _id: creditTxnId,
      companyId,
      employeeId: existing.recipientEmployeeId,
      type: 'CREDIT',
      direction: 'CR',
      source: 'TEAM_LEAD_RETURN_IN',
      transactionCategory: 'PETTY_CASH_RETURN',
      amountPaise,
      idempotencyKey: `TL_RET_CR:${existing._id}`,
      returnRequestId: existing._id,
      counterpartyEmployeeId: existing.employeeId,
      pairedTxnId: debitTxnId,
      description: `Petty cash return received from ${empName}: ${rupee(amountPaise)}.`,
      remarks: cleanRemarks.slice(0, 500),
      req,
      autoEnable: true,
    }, session);

    await PettyCashReturnRequest.updateOne(
      { _id: existing._id },
      { $set: { walletId: empDebit.txn.walletId } },
      { session: session || undefined }
    );

    return {
      returnRequest: { ...updated.toObject(), walletId: empDebit.txn.walletId },
      debitTxn: empDebit.txn,
      creditTxn: tlCredit.txn,
      empWallet: empDebit.wallet,
      tlWallet: tlCredit.wallet,
      empName,
      tlName,
    };
  });
}

/** Team Lead rejects a Return Request (PENDING -> REJECTED). Moves to History only; no balances changed. */
async function rejectTeamLeadReturnRequest({ companyId, returnRequestId, teamLeadId, reviewRemarks, req }) {
  const existing = await PettyCashReturnRequest.findOne({ _id: oid(returnRequestId), companyId: oid(companyId) }).lean();
  if (!existing) throw new PettyCashError(404, 'Return request not found.');
  if (existing.recipientType !== 'TEAM_LEAD' || !existing.recipientEmployeeId) {
    throw new PettyCashError(409, 'This return request is routed to Company (Accounts), not a Team Lead.');
  }
  if (String(existing.recipientEmployeeId) !== String(teamLeadId)) {
    throw new PettyCashError(403, 'Only the selected Team Lead can reject this return request.');
  }
  if (existing.status === 'APPROVED' || existing.status === 'PROCESSED' || existing.transactionId) {
    throw new PettyCashError(409, 'An approved return request cannot be rejected.');
  }
  if (existing.status === 'REJECTED') {
    throw new PettyCashError(409, 'This return request was already rejected.');
  }
  const cleanRemarks = String(reviewRemarks || '').trim();
  if (cleanRemarks.length < 3) {
    throw new PettyCashError(422, 'Please provide a reason for rejecting the return request (at least 3 characters).');
  }
  const updated = await PettyCashReturnRequest.findOneAndUpdate(
    { _id: existing._id, status: 'PENDING', transactionId: null, recipientType: 'TEAM_LEAD', recipientEmployeeId: oid(teamLeadId) },
    {
      $set: {
        status: 'REJECTED',
        reviewedBy: oid(teamLeadId),
        reviewedByName: req?.user?.name || existing.recipientEmployeeName || '',
        reviewedAt: new Date(),
        reviewRemarks: cleanRemarks.slice(0, 500),
      },
    },
    { new: true }
  ).lean();
  if (!updated) throw new PettyCashError(409, 'This return request was already reviewed.');
  return { returnRequest: updated };
}

module.exports = {
  toPaise,
  fromPaise,
  PettyCashError,
  runAtomic,
  isDuplicateKey,
  ensureWallet,
  ensureCompanyWallets,
  backfillCompanyBaseLimits,
  computeBaseLimitDelta,
  deriveTransactionCategory,
  postTransaction,
  syncClaimDebit,
  creditClaimPayment,
  prepareForClaim,
  walletBalanceOf,
  setWalletEnabled,
  setAdvanceProvider,
  setBaseLimit,
  topUp,
  adjust,
  reverseTransaction,
  fulfilRequest,
  getTeamLeadAvailableAdvance,
  submitTeamLeadAdvance,
  rejectTeamLeadAdvance,
  acceptTeamLeadAdvance,
  getAvailableForReturn,
  createReturnRequest,
  approveReturnRequest,
  rejectReturnRequest,
  approveTeamLeadReturnRequest,
  rejectTeamLeadReturnRequest,
  ACTIVE_EMPLOYEE_FILTER,
  _resetTxnSupport: () => { txnSupported = null; },
};
