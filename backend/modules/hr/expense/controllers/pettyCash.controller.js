const mongoose = require('mongoose');
const User = require('../../../../models/User');
const {
  PettyCashWallet,
  PettyCashTransaction,
  PettyCashRequest,
  PettyCashReturnRequest,
  TXN_TYPES,
  TXN_SOURCES,
  TXN_CATEGORIES,
  RETURN_REQUEST_STATUSES,
} = require('../models/PettyCash');
const svc = require('../services/pettyCashService');
const access = require('../services/expenseAccess');

/**
 * Petty Cash Wallet API (mounted under /api/expense/petty-cash).
 * Employee endpoints always use req.user (never a client-supplied employee id).
 * Admin endpoints require the Accounts role (Accounts / Company Admin / Super Admin)
 * and only act on employees of the caller's company.
 */

const { toPaise, fromPaise, PettyCashError } = svc;
const MAX_AMOUNT_RUPEES = 1000000; // ₹10,00,000 per transaction
const isOid = (v) => mongoose.Types.ObjectId.isValid(String(v || '')) && String(v).length === 24;
const oid = (v) => new mongoose.Types.ObjectId(String(v));
const str = (v, max) => String(v === undefined || v === null ? '' : v).trim().slice(0, max);
const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const handle = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (err) {
    if (svc.isDuplicateKey(err)) return res.status(409).json({ success: false, message: 'This transaction was already processed.' });
    const status = err instanceof PettyCashError ? err.status : (err.status || 500);
    res.status(status).json({ success: false, message: err.message });
  }
};

/** Positive rupee amount with at most 2 decimals -> integer paise. */
function parseAmount(value, label = 'Amount') {
  const n = Number(value);
  if (value === '' || value === null || value === undefined || !Number.isFinite(n) || n <= 0) throw new PettyCashError(422, `${label} must be greater than zero.`);
  if (Math.abs(n * 100 - Math.round(n * 100)) > 1e-6) throw new PettyCashError(422, `${label} can have at most 2 decimal places.`);
  if (n > MAX_AMOUNT_RUPEES) throw new PettyCashError(422, `${label} cannot exceed ₹${MAX_AMOUNT_RUPEES.toLocaleString('en-IN')}.`);
  return toPaise(n);
}

function companyOf(req) {
  const companyId = access.resolveCompanyId(req);
  if (!companyId || companyId === 'ALL' || !isOid(companyId)) throw new PettyCashError(400, 'Select a company first.');
  return companyId;
}

function requireAccounts(req) {
  if (!access.isAccounts(req.user)) throw new PettyCashError(403, 'Only Accounts, Company Admin or Super Admin can manage petty cash.');
}

function canReverseLedger(user) {
  if (!user) return false;
  if (access.isSuperAdmin(user)) return true;
  const deptType = String(user.departmentAdminType || user.adminType || '').trim().toLowerCase();
  if (['accounts', 'account', 'finance', 'hr', 'store'].includes(deptType)) return false;
  const r = String(user.role || '').trim().toLowerCase().replace(/[-\s]/g, '_');
  const rc = String(user.roleCode || '').trim().toUpperCase().replace(/[-\s]/g, '_');
  if (['accounts', 'account_admin', 'accounts_admin', 'finance', 'finance_admin', 'dept:finance_admin', 'accountant', 'hr', 'hr_admin', 'store', 'store_admin'].includes(r)) return false;
  if (['TCACC1', 'TCACC2', 'ACCOUNT_ADMIN', 'ACCOUNTS_ADMIN', 'TCSF2A', 'TCSFA', 'HR_ADMIN', 'TCSTR1', 'STORE_ADMIN'].includes(rc)) return false;
  return access.isCompanyAdmin(user);
}

function requireReverseAdmin(req) {
  if (!canReverseLedger(req.user)) throw new PettyCashError(403, 'Only Super Admin or Company Admin can reverse ledger transactions.');
}

async function companyEmployee(companyId, employeeId) {
  if (!isOid(employeeId)) throw new PettyCashError(404, 'Employee not found.');
  const emp = await User.findOne({ _id: employeeId, companyId }).select('name employeeIdCode department designation').lean();
  if (!emp) throw new PettyCashError(404, 'Employee not found in this company.');
  return emp;
}

function idempotencyKeyFrom(req) {
  const key = str(req.body?.idempotencyKey || req.headers['idempotency-key'], 100);
  if (!/^[A-Za-z0-9_.:-]{8,100}$/.test(key)) throw new PettyCashError(422, 'A valid idempotencyKey (8-100 chars) is required.');
  return key;
}

function pageOpts(q, maxLimit = 100) {
  const page = Math.max(1, parseInt(q.page, 10) || 1);
  const limit = Math.min(maxLimit, Math.max(1, parseInt(q.limit, 10) || 20));
  return { page, limit, skip: (page - 1) * limit };
}

// ─── Serializers (paise -> rupees for the UI; paise kept for exactness) ─────
const walletOut = (w, extra = {}) => w && ({
  _id: w._id,
  employeeId: w.employeeId,
  baseLimit: fromPaise(w.baseLimitPaise),
  baseLimitPaise: w.baseLimitPaise || 0,
  balance: fromPaise(w.balancePaise),
  balancePaise: w.balancePaise || 0,
  totalAllocation: fromPaise(w.totalAllocationPaise),
  totalReturn: fromPaise(w.totalReturnPaise),
  totalCredit: fromPaise(w.totalCreditPaise),
  totalDebit: fromPaise(w.totalDebitPaise),
  currency: w.currency,
  enabled: !!w.enabled,
  enabledAt: w.enabledAt,
  status: w.status,
  negative: w.balancePaise < 0,
  updatedAt: w.updatedAt,
  ...extra,
});

const txnOut = (t) => t && ({
  _id: t._id,
  walletId: t.walletId,
  employeeId: t.employeeId,
  type: t.type,
  direction: t.direction,
  source: t.source,
  transactionCategory: t.transactionCategory || svc.deriveTransactionCategory(t, t.baseLimitBeforePaise || 0, 0),
  amount: fromPaise(t.amountPaise),
  amountPaise: t.amountPaise,
  baseLimitBefore: fromPaise(t.baseLimitBeforePaise),
  baseLimitAfter: fromPaise(t.baseLimitAfterPaise),
  balanceBefore: fromPaise(t.balanceBeforePaise),
  balanceAfter: fromPaise(t.balanceAfterPaise),
  claimId: t.claimId,
  claimNumber: t.claimNumber,
  paymentReference: t.paymentReference,
  requestId: t.requestId,
  returnRequestId: t.returnRequestId,
  reversalOf: t.reversalOf,
  reversedBy: t.reversedBy,
  description: t.description,
  remarks: t.remarks,
  performedBy: t.performedBy,
  performedByName: t.performedByName,
  performedByRole: t.performedByRole,
  createdAt: t.createdAt,
});

const requestOut = (r) => r && ({
  _id: r._id,
  employeeId: r.employeeId,
  requestedAmount: fromPaise(r.requestedAmountPaise),
  approvedAmount: fromPaise(r.approvedAmountPaise),
  reason: r.reason,
  status: r.status === 'PROCESSED' ? 'APPROVED' : r.status,
  reviewedBy: r.reviewedBy,
  reviewedByName: r.reviewedByName,
  reviewedAt: r.reviewedAt,
  creditedAt: r.creditedAt,
  creditTxnId: r.creditTxnId,
  remarks: r.remarks,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
});

const returnRequestOut = (r) => r && ({
  _id: r._id,
  walletId: r.walletId,
  employeeId: r.employeeId,
  requestedAmount: fromPaise(r.requestedAmountPaise),
  approvedAmount: fromPaise(r.approvedAmountPaise),
  processedAmount: fromPaise(r.processedAmountPaise),
  reason: r.reason || r.remarks || '',
  remarks: r.remarks || r.reason || '',
  employeeRemarks: r.remarks || r.reason || '',
  accountsRemarks: r.reviewRemarks || '',
  attachments: r.attachments || [],
  status: r.status === 'PROCESSED' ? 'APPROVED' : r.status,
  reviewedBy: r.reviewedBy,
  reviewedByName: r.reviewedByName,
  reviewedAt: r.reviewedAt,
  reviewRemarks: r.reviewRemarks,
  processedBy: r.processedBy,
  processedByName: r.processedByName,
  processedAt: r.processedAt,
  paymentReference: r.paymentReference,
  transactionId: r.transactionId,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
});

/** Ledger filter shared by employee history, admin history and reports. */
function ledgerFilter(q, base) {
  const f = { ...base };
  const type = str(q.type, 30).toUpperCase();
  if (type && type !== 'ALL') {
    if (!TXN_TYPES.includes(type)) throw new PettyCashError(422, 'Invalid transaction type.');
    f.type = type;
  }
  const source = str(q.source, 30).toUpperCase();
  if (source && source !== 'ALL') {
    if (!TXN_SOURCES.includes(source)) throw new PettyCashError(422, 'Invalid transaction source.');
    f.source = source;
  }
  const category = str(q.category, 40).toUpperCase();
  if (category && category !== 'ALL') {
    if (!TXN_CATEGORIES.includes(category)) throw new PettyCashError(422, 'Invalid transaction category.');
    f.transactionCategory = category;
  }
  const direction = str(q.direction, 2).toUpperCase();
  if (direction === 'CR' || direction === 'DR') f.direction = direction;
  const created = {};
  if (q.from) { const d = new Date(q.from); if (!isNaN(d)) created.$gte = d; }
  if (q.to) { const d = new Date(q.to); if (!isNaN(d)) { if (/^\d{4}-\d{2}-\d{2}$/.test(String(q.to))) d.setUTCHours(23, 59, 59, 999); created.$lte = d; } }
  if (Object.keys(created).length) f.createdAt = created;
  return f;
}

async function auditPetty(req, companyId, action, description, metadata, entityId) {
  await access.audit({ req, action, claim: { companyId }, description, metadata, entity: 'PettyCash', entityId: entityId ? String(entityId) : '' });
}

// ═══ Employee ═══════════════════════════════════════════════════════════════

/** GET /petty-cash/wallet — my wallet, recent transactions, request summary. */
exports.myWallet = handle(async (req, res) => {
  const companyId = companyOf(req);
  await svc.ensureWallet(companyId, req.user._id);
  await svc.backfillCompanyBaseLimits(companyId).catch(() => {});
  const wallet = await PettyCashWallet.findOne({ companyId: oid(companyId), employeeId: oid(req.user._id) }).lean();
  const [recent, pendingRequests, availReturn] = await Promise.all([
    PettyCashTransaction.find({ walletId: wallet._id }).sort({ createdAt: -1, _id: -1 }).limit(5).lean(),
    PettyCashRequest.countDocuments({ companyId, employeeId: req.user._id, status: 'PENDING' }),
    svc.getAvailableForReturn(companyId, req.user._id),
  ]);
  res.json({
    success: true,
    data: {
      ...walletOut(wallet),
      recentTransactions: recent.map(txnOut),
      pendingRequests,
      pendingReturnRequests: availReturn.openCount,
      reservedReturnAmount: fromPaise(availReturn.reservedPaise),
      reservedReturn: fromPaise(availReturn.reservedPaise),
      excessAboveBaseLimit: fromPaise(availReturn.excessPaise),
      availableForReturn: fromPaise(availReturn.availablePaise),
    },
  });
});

/** GET /petty-cash/transactions?type=&from=&to=&page=&limit= — my ledger. */
exports.myTransactions = handle(async (req, res) => {
  const companyId = companyOf(req);
  const filter = ledgerFilter(req.query, { companyId: oid(companyId), employeeId: oid(req.user._id) });
  const { page, limit, skip } = pageOpts(req.query);
  const [rows, total] = await Promise.all([
    PettyCashTransaction.find(filter).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit).lean(),
    PettyCashTransaction.countDocuments(filter),
  ]);
  res.json({ success: true, data: rows.map(txnOut), pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
});

/** GET /petty-cash/requests — my top-up requests. */
exports.myRequests = handle(async (req, res) => {
  const companyId = companyOf(req);
  const rows = await PettyCashRequest.find({ companyId, employeeId: req.user._id }).sort({ createdAt: -1 }).limit(100).lean();
  res.json({ success: true, data: rows.map(requestOut) });
});

/** POST /petty-cash/requests { amount, reason } */
exports.createRequest = handle(async (req, res) => {
  const companyId = companyOf(req);
  const requestedAmountPaise = parseAmount(req.body?.amount, 'Requested amount');
  const reason = str(req.body?.reason, 500);
  if (reason.length < 5) throw new PettyCashError(422, 'Please give a reason (at least 5 characters).');
  const open = await PettyCashRequest.countDocuments({ companyId, employeeId: req.user._id, status: 'PENDING' });
  if (open >= 3) throw new PettyCashError(409, 'You already have 3 pending requests. Wait for Accounts to review them.');
  await svc.ensureWallet(companyId, req.user._id);
  const doc = await PettyCashRequest.create({ companyId, employeeId: req.user._id, requestedAmountPaise, reason });
  await auditPetty(req, companyId, 'PETTY_CASH_REQUESTED', `Petty cash top-up of ₹${fromPaise(requestedAmountPaise)} requested.`, { reason }, doc._id);
  res.status(201).json({ success: true, data: requestOut(doc.toObject()) });
});

/** GET /petty-cash/return-requests — my return requests. */
exports.myReturnRequests = handle(async (req, res) => {
  const companyId = companyOf(req);
  const rows = await PettyCashReturnRequest.find({ companyId, employeeId: req.user._id }).sort({ createdAt: -1 }).limit(100).lean();
  res.json({ success: true, data: rows.map(returnRequestOut) });
});

/** POST /petty-cash/return-requests { amount, remarks, reason?, attachments? } */
exports.createReturnRequest = handle(async (req, res) => {
  const companyId = companyOf(req);
  const rawAmt = req.body?.amount !== undefined ? req.body.amount : req.body?.requestedAmount;
  const requestedAmountPaise = parseAmount(rawAmt, 'Return amount');
  const remarks = str(req.body?.remarks || req.body?.reason, 500);
  const reason = str(req.body?.reason || remarks, 500);
  if (remarks.length < 3) throw new PettyCashError(422, 'Please provide a remark for returning petty cash (at least 3 characters).');
  const rawAttachments = Array.isArray(req.body?.attachments) ? req.body.attachments : [];
  const attachments = rawAttachments
    .map((a) => (typeof a === 'string' ? a.trim() : str(a?.url || a?.uri, 1000)))
    .filter(Boolean);
  const doc = await svc.createReturnRequest({
    companyId,
    employeeId: req.user._id,
    requestedAmountPaise,
    reason,
    remarks,
    attachments,
  });
  await auditPetty(req, companyId, 'PETTY_CASH_RETURN_REQUESTED', `Petty cash return of ₹${fromPaise(requestedAmountPaise)} requested.`, { remarks, attachmentsCount: attachments.length }, doc._id);
  res.status(201).json({ success: true, data: returnRequestOut(doc) });
});

// ═══ Accounts Admin ═════════════════════════════════════════════════════════

/** GET /petty-cash/admin/summary */
exports.adminSummary = handle(async (req, res) => {
  requireAccounts(req);
  const companyId = companyOf(req);
  await svc.ensureCompanyWallets(companyId);
  const [agg] = await PettyCashWallet.aggregate([
    { $match: { companyId: oid(companyId) } },
    { $lookup: { from: User.collection.name, localField: 'employeeId', foreignField: '_id', as: 'emp', pipeline: [{ $match: svc.ACTIVE_EMPLOYEE_FILTER }, { $project: { _id: 1 } }] } },
    { $unwind: '$emp' },
    {
      $group: {
        _id: null,
        totalBaseLimit: { $sum: '$baseLimitPaise' },
        total: { $sum: '$balancePaise' },
        positive: { $sum: { $cond: [{ $gt: ['$balancePaise', 0] }, '$balancePaise', 0] } },
        negative: { $sum: { $cond: [{ $lt: ['$balancePaise', 0] }, '$balancePaise', 0] } },
        wallets: { $sum: 1 },
        enabled: { $sum: { $cond: ['$enabled', 1, 0] } },
        negativeCount: { $sum: { $cond: [{ $lt: ['$balancePaise', 0] }, 1, 0] } },
        totalAllocation: { $sum: '$totalAllocationPaise' },
        totalReturn: { $sum: '$totalReturnPaise' },
        totalCredit: { $sum: '$totalCreditPaise' },
        totalDebit: { $sum: '$totalDebitPaise' },
      },
    },
  ]);
  const [pendingRequests, pendingReturnRequests] = await Promise.all([
    PettyCashRequest.countDocuments({ companyId, status: 'PENDING' }),
    PettyCashReturnRequest.countDocuments({ companyId, status: 'PENDING' }),
  ]);
  const a = agg || {};
  res.json({
    success: true,
    data: {
      totalBaseLimit: fromPaise(a.totalBaseLimit),
      totalBalance: fromPaise(a.total),
      totalPositive: fromPaise(a.positive),
      totalNegative: fromPaise(a.negative),
      totalAllocation: fromPaise(a.totalAllocation),
      totalReturn: fromPaise(a.totalReturn),
      totalCredit: fromPaise(a.totalCredit),
      totalDebit: fromPaise(a.totalDebit),
      wallets: a.wallets || 0,
      enabledWallets: a.enabled || 0,
      negativeWallets: a.negativeCount || 0,
      pendingRequests,
      pendingReturnRequests,
      canReverse: canReverseLedger(req.user),
    },
  });
});

/** GET /petty-cash/admin/wallets?search=&balance=negative|positive|zero&enabled=true|false&page=&limit= */
exports.adminWallets = handle(async (req, res) => {
  requireAccounts(req);
  const companyId = companyOf(req);
  await svc.ensureCompanyWallets(companyId);
  const { page, limit, skip } = pageOpts(req.query, 200);
  const match = { companyId: oid(companyId) };
  const bal = str(req.query.balance, 10).toLowerCase();
  if (bal === 'negative') match.balancePaise = { $lt: 0 };
  else if (bal === 'positive') match.balancePaise = { $gt: 0 };
  else if (bal === 'zero') match.balancePaise = 0;
  if (req.query.enabled === 'true') match.enabled = true;
  if (req.query.enabled === 'false') match.enabled = false;

  const pipeline = [
    { $match: match },
    { $lookup: { from: User.collection.name, localField: 'employeeId', foreignField: '_id', as: 'employee', pipeline: [{ $match: svc.ACTIVE_EMPLOYEE_FILTER }, { $project: { name: 1, employeeIdCode: 1, department: 1, designation: 1, status: 1 } }] } },
    { $unwind: '$employee' },
  ];
  const search = str(req.query.search, 100);
  if (search) {
    const rx = { $regex: escapeRegex(search), $options: 'i' };
    pipeline.push({ $match: { $or: [{ 'employee.name': rx }, { 'employee.employeeIdCode': rx }, { 'employee.department': rx }] } });
  }
  const sortMap = {
    balance: { balancePaise: 1 },
    '-balance': { balancePaise: -1 },
    baseLimit: { baseLimitPaise: 1 },
    '-baseLimit': { baseLimitPaise: -1 },
  };
  const sortKey = sortMap[str(req.query.sort, 20)] || { 'employee.name': 1 };
  pipeline.push({ $facet: { rows: [{ $sort: sortKey }, { $skip: skip }, { $limit: limit }], total: [{ $count: 'n' }] } });
  const [out] = await PettyCashWallet.aggregate(pipeline);
  const total = out?.total?.[0]?.n || 0;
  res.json({
    success: true,
    data: (out?.rows || []).map((w) => walletOut(w, { employee: w.employee })),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

/** GET /petty-cash/admin/wallets/:employeeId — wallet + its transactions (paginated, filterable). */
exports.adminWalletDetail = handle(async (req, res) => {
  requireAccounts(req);
  const companyId = companyOf(req);
  const employee = await companyEmployee(companyId, req.params.employeeId);
  const wallet = await svc.ensureWallet(companyId, employee._id);
  const filter = ledgerFilter(req.query, { companyId: oid(companyId), employeeId: employee._id });
  const { page, limit, skip } = pageOpts(req.query);
  const [rows, total, requests, returnRequests] = await Promise.all([
    PettyCashTransaction.find(filter).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit).lean(),
    PettyCashTransaction.countDocuments(filter),
    PettyCashRequest.find({ companyId, employeeId: employee._id }).sort({ createdAt: -1 }).limit(20).lean(),
    PettyCashReturnRequest.find({ companyId, employeeId: employee._id }).sort({ createdAt: -1 }).limit(20).lean(),
  ]);
  res.json({
    success: true,
    data: {
      wallet: walletOut(wallet.toObject(), { employee }),
      transactions: rows.map(txnOut),
      requests: requests.map(requestOut),
      returnRequests: returnRequests.map(returnRequestOut),
    },
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

/** POST /petty-cash/admin/wallets/:employeeId/enable { enabled } — D6 per-employee switch. */
exports.setEnabled = handle(async (req, res) => {
  requireAccounts(req);
  const companyId = companyOf(req);
  const employee = await companyEmployee(companyId, req.params.employeeId);
  const enabled = req.body?.enabled === true || req.body?.enabled === 'true';
  const { wallet } = await svc.setWalletEnabled(companyId, employee._id, enabled, req);
  await auditPetty(req, companyId, enabled ? 'PETTY_CASH_ENABLED' : 'PETTY_CASH_DISABLED',
    `Petty cash ${enabled ? 'enabled' : 'disabled'} for ${employee.name}.`,
    { employeeId: employee._id }, wallet._id);
  res.json({ success: true, data: walletOut(wallet, { employee }) });
});

/** POST /petty-cash/admin/wallets/:employeeId/base-limit { baseLimit, reason? } — Accounts Admin / Super Admin only. */
exports.setBaseLimit = handle(async (req, res) => {
  requireAccounts(req);
  const companyId = companyOf(req);
  const employee = await companyEmployee(companyId, req.params.employeeId);
  const rawVal = req.body?.baseLimit !== undefined ? req.body.baseLimit : req.body?.amount;
  const n = Number(rawVal);
  if (rawVal === '' || rawVal === null || rawVal === undefined || !Number.isFinite(n) || n < 0) {
    throw new PettyCashError(422, 'Base Limit must be zero or a positive amount.');
  }
  if (Math.abs(n * 100 - Math.round(n * 100)) > 1e-6) {
    throw new PettyCashError(422, 'Base Limit can have at most 2 decimal places.');
  }
  if (n > MAX_AMOUNT_RUPEES) {
    throw new PettyCashError(422, `Base Limit cannot exceed ₹${MAX_AMOUNT_RUPEES.toLocaleString('en-IN')}.`);
  }
  const baseLimitPaise = toPaise(n);
  const reason = str(req.body?.reason || req.body?.remarks, 500);
  const { wallet } = await svc.setBaseLimit({ companyId, employeeId: employee._id, baseLimitPaise, reason });
  await auditPetty(
    req,
    companyId,
    'PETTY_CASH_BASE_LIMIT_UPDATED',
    `Base Limit updated to ₹${fromPaise(baseLimitPaise)} for ${employee.name}${reason ? ` (${reason})` : ''}.`,
    { employeeId: employee._id, baseLimit: fromPaise(baseLimitPaise), reason },
    wallet._id
  );
  res.json({ success: true, data: walletOut(wallet, { employee }) });
});

/** POST /petty-cash/admin/wallets/:employeeId/topup { amount, reason, reference?, remarks?, idempotencyKey } */
exports.topUp = handle(async (req, res) => {
  requireAccounts(req);
  const companyId = companyOf(req);
  const employee = await companyEmployee(companyId, req.params.employeeId);
  const amountPaise = parseAmount(req.body?.amount);
  const remarks = str(req.body?.remarks, 500);
  const reason = str(req.body?.reason || remarks, 120);
  if (!reason) throw new PettyCashError(422, 'Enter a remark for adding petty cash.');
  const idempotencyKey = idempotencyKeyFrom(req);
  const result = await svc.topUp({
    companyId, employeeId: employee._id, amountPaise, reason,
    reference: str(req.body?.reference, 100), remarks, idempotencyKey, req,
  });
  if (!result.duplicate) {
    await auditPetty(req, companyId, 'PETTY_CASH_TOPUP', `₹${fromPaise(amountPaise)} added to ${employee.name}'s petty cash (${reason}).`,
      { employeeId: employee._id, amount: fromPaise(amountPaise), baseLimitAfter: fromPaise(result.txn.baseLimitAfterPaise), balanceAfter: fromPaise(result.txn.balanceAfterPaise) }, result.txn._id);
  }
  res.status(result.duplicate ? 200 : 201).json({ success: true, duplicate: !!result.duplicate, data: txnOut(result.txn) });
});

/** POST /petty-cash/admin/wallets/:employeeId/adjust { direction: CR|DR, amount, reason, category?, isAllocationIncrease?, idempotencyKey } */
exports.adjust = handle(async (req, res) => {
  requireAccounts(req);
  const companyId = companyOf(req);
  const employee = await companyEmployee(companyId, req.params.employeeId);
  const direction = str(req.body?.direction, 2).toUpperCase();
  if (!['CR', 'DR'].includes(direction)) throw new PettyCashError(422, 'direction must be CR or DR.');
  const amountPaise = parseAmount(req.body?.amount);
  const reason = str(req.body?.reason, 500);
  if (reason.length < 5) throw new PettyCashError(422, 'A reason (at least 5 characters) is required for adjustments.');
  const category = str(req.body?.category, 40).toUpperCase();
  const isAllocationIncrease = req.body?.isAllocationIncrease === true || req.body?.isAllocationIncrease === 'true';
  const result = await svc.adjust({
    companyId,
    employeeId: employee._id,
    direction,
    amountPaise,
    reason,
    category,
    isAllocationIncrease,
    idempotencyKey: idempotencyKeyFrom(req),
    req,
  });
  if (!result.duplicate) {
    await auditPetty(req, companyId, 'PETTY_CASH_ADJUSTMENT', `${direction === 'CR' ? 'Credit' : 'Debit'} adjustment ₹${fromPaise(amountPaise)} on ${employee.name}: ${reason}`,
      { employeeId: employee._id, direction, category: result.txn.transactionCategory, amount: fromPaise(amountPaise) }, result.txn._id);
  }
  res.status(result.duplicate ? 200 : 201).json({ success: true, duplicate: !!result.duplicate, data: txnOut(result.txn) });
});

/** POST /petty-cash/admin/transactions/:id/reverse { reason } — Super Admin & Company Admin only */
exports.reverse = handle(async (req, res) => {
  requireReverseAdmin(req);
  const companyId = companyOf(req);
  if (!isOid(req.params.id)) throw new PettyCashError(404, 'Transaction not found.');
  const reason = str(req.body?.reason, 500);
  if (reason.length < 5) throw new PettyCashError(422, 'A reason (at least 5 characters) is required to reverse a transaction.');
  const result = await svc.reverseTransaction({ companyId, txnId: req.params.id, reason, req });
  await auditPetty(req, companyId, 'PETTY_CASH_REVERSAL', `Transaction ${req.params.id} reversed: ${reason}`, { reversalTxn: result.txn._id }, req.params.id);
  res.json({ success: true, data: txnOut(result.txn) });
});

/** GET /petty-cash/admin/transactions/:id */
exports.transactionDetail = handle(async (req, res) => {
  requireAccounts(req);
  const companyId = companyOf(req);
  if (!isOid(req.params.id)) throw new PettyCashError(404, 'Transaction not found.');
  const t = await PettyCashTransaction.findOne({ _id: req.params.id, companyId })
    .populate('employeeId', 'name employeeIdCode department').lean();
  if (!t) throw new PettyCashError(404, 'Transaction not found.');
  res.json({ success: true, data: { ...txnOut(t), employee: t.employeeId } });
});

/** GET /petty-cash/admin/requests?status= */
exports.adminRequests = handle(async (req, res) => {
  requireAccounts(req);
  const companyId = companyOf(req);
  const filter = { companyId };
  const status = str(req.query.status, 20).toUpperCase();
  if (status && status !== 'ALL') {
    if (!['PENDING', 'REJECTED', 'FULFILLED'].includes(status)) throw new PettyCashError(422, 'Invalid request status.');
    filter.status = status;
  }
  const { page, limit, skip } = pageOpts(req.query);
  const [rows, total] = await Promise.all([
    PettyCashRequest.find(filter).populate('employeeId', 'name employeeIdCode department designation').sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    PettyCashRequest.countDocuments(filter),
  ]);
  const walletMap = new Map((await PettyCashWallet.find({ companyId, employeeId: { $in: rows.map((r) => r.employeeId?._id).filter(Boolean) } }).lean())
    .map((w) => [String(w.employeeId), w]));
  res.json({
    success: true,
    data: rows.map((r) => {
      const w = walletMap.get(String(r.employeeId?._id));
      return {
        ...requestOut(r),
        employee: r.employeeId,
        walletBaseLimit: w ? fromPaise(w.baseLimitPaise) : 0,
        walletBalance: w ? fromPaise(w.balancePaise) : 0,
        walletEnabled: !!w?.enabled,
      };
    }),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

/** POST /petty-cash/admin/requests/:id/approve { approvedAmount?, remarks?, reference? } — PENDING -> FULFILLED and credits wallet directly. */
exports.approveRequest = handle(async (req, res) => {
  requireAccounts(req);
  const companyId = companyOf(req);
  if (!isOid(req.params.id)) throw new PettyCashError(404, 'Request not found.');
  const existing = await PettyCashRequest.findOne({ _id: req.params.id, companyId }).lean();
  if (!existing) throw new PettyCashError(404, 'Request not found.');
  const approvedAmountPaise = req.body?.approvedAmount !== undefined && req.body?.approvedAmount !== ''
    ? parseAmount(req.body.approvedAmount, 'Approved amount')
    : existing.requestedAmountPaise;
  const remarks = str(req.body?.remarks, 500);
  const credit = await svc.fulfilRequest({
    companyId, requestId: existing._id, approvedAmountPaise, remarks,
    reference: str(req.body?.reference, 100), req,
  });
  await auditPetty(req, companyId, 'PETTY_CASH_REQUEST_FULFILLED',
    `Top-up request fulfilled: ₹${fromPaise(credit.txn.amountPaise)} credited.`, { remarks, txnId: credit.txn._id }, existing._id);
  res.json({ success: true, data: requestOut(credit.request), credit: txnOut(credit.txn) });
});

/** POST /petty-cash/admin/requests/:id/reject { remarks } — PENDING -> REJECTED */
exports.rejectRequest = handle(async (req, res) => {
  requireAccounts(req);
  const companyId = companyOf(req);
  if (!isOid(req.params.id)) throw new PettyCashError(404, 'Request not found.');
  const existing = await PettyCashRequest.findOne({ _id: req.params.id, companyId }).lean();
  if (!existing) throw new PettyCashError(404, 'Request not found.');
  const remarks = str(req.body?.remarks, 500);
  if (remarks.length < 3) throw new PettyCashError(422, 'Please give a reason for rejecting the request.');
  const doc = await PettyCashRequest.findOneAndUpdate(
    { _id: existing._id, status: 'PENDING' },
    { $set: { status: 'REJECTED', reviewedBy: req.user._id, reviewedByName: req.user.name || '', reviewedAt: new Date(), remarks } },
    { new: true }
  ).lean();
  if (!doc) throw new PettyCashError(409, 'This request was already reviewed.');
  await auditPetty(req, companyId, 'PETTY_CASH_REQUEST_REJECTED', 'Top-up request rejected.', { remarks }, doc._id);
  res.json({ success: true, data: requestOut(doc) });
});

/** POST /petty-cash/admin/requests/:id/fulfil { reference? } — PENDING -> FULFILLED */
exports.fulfilRequest = handle(async (req, res) => {
  requireAccounts(req);
  const companyId = companyOf(req);
  if (!isOid(req.params.id)) throw new PettyCashError(404, 'Request not found.');
  const result = await svc.fulfilRequest({ companyId, requestId: req.params.id, reference: str(req.body?.reference, 100), req });
  await auditPetty(req, companyId, 'PETTY_CASH_REQUEST_FULFILLED', `Top-up request credited: ₹${fromPaise(result.txn.amountPaise)}.`, { txnId: result.txn._id }, req.params.id);
  res.json({ success: true, data: requestOut(result.request), credit: txnOut(result.txn) });
});

// ─── Accounts Admin: Return Requests ────────────────────────────────────────

/** GET /petty-cash/admin/return-requests?status= */
exports.adminReturnRequests = handle(async (req, res) => {
  requireAccounts(req);
  const companyId = companyOf(req);
  const filter = { companyId };
  const status = str(req.query.status, 20).toUpperCase();
  if (status && status !== 'ALL') {
    if (!RETURN_REQUEST_STATUSES.includes(status)) throw new PettyCashError(422, 'Invalid return request status.');
    filter.status = status === 'APPROVED' ? { $in: ['APPROVED', 'PROCESSED'] } : status;
  }
  const { page, limit, skip } = pageOpts(req.query);
  const [rows, total] = await Promise.all([
    PettyCashReturnRequest.find(filter)
      .populate('employeeId', 'name employeeIdCode department designation')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    PettyCashReturnRequest.countDocuments(filter),
  ]);
  const walletMap = new Map(
    (await PettyCashWallet.find({ companyId, employeeId: { $in: rows.map((r) => r.employeeId?._id).filter(Boolean) } }).lean())
      .map((w) => [String(w.employeeId), w])
  );
  res.json({
    success: true,
    data: rows.map((r) => {
      const w = walletMap.get(String(r.employeeId?._id));
      return {
        ...returnRequestOut(r),
        employee: r.employeeId,
        walletBaseLimit: w ? fromPaise(w.baseLimitPaise) : 0,
        walletBalance: w ? fromPaise(w.balancePaise) : 0,
        walletEnabled: !!w?.enabled,
      };
    }),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

/** GET /petty-cash/admin/return-requests/:id */
exports.adminReturnRequestDetail = handle(async (req, res) => {
  requireAccounts(req);
  const companyId = companyOf(req);
  if (!isOid(req.params.id)) throw new PettyCashError(404, 'Return request not found.');
  const r = await PettyCashReturnRequest.findOne({ _id: req.params.id, companyId })
    .populate('employeeId', 'name employeeIdCode department designation')
    .lean();
  if (!r) throw new PettyCashError(404, 'Return request not found.');
  const w = r.employeeId?._id
    ? await PettyCashWallet.findOne({ companyId, employeeId: r.employeeId._id }).lean()
    : null;
  res.json({
    success: true,
    data: {
      ...returnRequestOut(r),
      employee: r.employeeId,
      walletBaseLimit: w ? fromPaise(w.baseLimitPaise) : 0,
      walletBalance: w ? fromPaise(w.balancePaise) : 0,
      walletEnabled: !!w?.enabled,
    },
  });
});

/** POST /petty-cash/admin/return-requests/:id/approve { approvedAmount?, remarks } */
exports.approveReturnRequest = handle(async (req, res) => {
  requireAccounts(req);
  const companyId = companyOf(req);
  if (!isOid(req.params.id)) throw new PettyCashError(404, 'Return request not found.');
  const existing = await PettyCashReturnRequest.findOne({ _id: req.params.id, companyId }).lean();
  if (!existing) throw new PettyCashError(404, 'Return request not found.');
  const approvedAmountPaise = req.body?.approvedAmount !== undefined && req.body?.approvedAmount !== ''
    ? parseAmount(req.body.approvedAmount, 'Approved return amount')
    : existing.requestedAmountPaise;
  const reviewRemarks = str(req.body?.remarks || req.body?.reviewRemarks || req.body?.reason, 500);
  if (reviewRemarks.length < 3) {
    throw new PettyCashError(422, 'Please provide a remark for approving the return request (at least 3 characters).');
  }
  const reference = str(req.body?.reference, 100);

  const result = await svc.approveReturnRequest({
    companyId,
    returnRequestId: existing._id,
    approvedAmountPaise,
    reviewRemarks,
    reference,
    req,
  });
  await auditPetty(
    req,
    companyId,
    'PETTY_CASH_RETURN_APPROVED',
    `Petty cash return approved: ₹${fromPaise(approvedAmountPaise)} deducted from Balance (Base Limit unchanged).`,
    { reviewRemarks, txnId: result.txn?._id },
    existing._id
  );
  res.json({
    success: true,
    data: returnRequestOut(result.returnRequest),
    transaction: result.txn ? txnOut(result.txn) : null,
  });
});

/** POST /petty-cash/admin/return-requests/:id/reject { remarks } */
exports.rejectReturnRequest = handle(async (req, res) => {
  requireAccounts(req);
  const companyId = companyOf(req);
  if (!isOid(req.params.id)) throw new PettyCashError(404, 'Return request not found.');
  const reviewRemarks = str(req.body?.remarks || req.body?.reviewRemarks || req.body?.reason, 500);
  const result = await svc.rejectReturnRequest({
    companyId,
    returnRequestId: req.params.id,
    reviewRemarks,
    req,
  });
  await auditPetty(req, companyId, 'PETTY_CASH_RETURN_REJECTED', 'Petty cash return request rejected.', { reviewRemarks }, req.params.id);
  res.json({ success: true, data: returnRequestOut(result.returnRequest) });
});

async function reportQuery(req) {
  requireAccounts(req);
  const companyId = companyOf(req);
  const base = { companyId: oid(companyId) };
  if (req.query.employeeId) {
    if (!isOid(req.query.employeeId)) throw new PettyCashError(422, 'Invalid employee.');
    base.employeeId = oid(req.query.employeeId);
  }
  if (req.query.claimLinked === 'true') base.claimId = { $ne: null };
  return { companyId, filter: ledgerFilter(req.query, base) };
}

/** GET /petty-cash/admin/reports — ledger rows + totals by type / source for the filters. */
exports.reports = handle(async (req, res) => {
  const { filter } = await reportQuery(req);
  const { page, limit, skip } = pageOpts(req.query, 200);
  const [rows, total, byType] = await Promise.all([
    PettyCashTransaction.find(filter).populate('employeeId', 'name employeeIdCode department').sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit).lean(),
    PettyCashTransaction.countDocuments(filter),
    PettyCashTransaction.aggregate([
      { $match: filter },
      { $group: { _id: { source: '$source', direction: '$direction' }, amount: { $sum: '$amountPaise' }, count: { $sum: 1 } } },
    ]),
  ]);
  let credit = 0; let debit = 0;
  const bySource = byType.map((g) => {
    if (g._id.direction === 'CR') credit += g.amount; else debit += g.amount;
    return { source: g._id.source, direction: g._id.direction, amount: fromPaise(g.amount), count: g.count };
  });
  res.json({
    success: true,
    data: rows.map((t) => ({ ...txnOut(t), employee: t.employeeId })),
    totals: { credit: fromPaise(credit), debit: fromPaise(debit), net: fromPaise(credit - debit), bySource },
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

const csvCell = (v) => {
  const s = v === null || v === undefined ? '' : String(v);
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s; // CSV injection guard
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

/** GET /petty-cash/admin/reports/export — CSV of the filtered ledger (max 20,000 rows). */
exports.exportReport = handle(async (req, res) => {
  const { filter } = await reportQuery(req);
  const rows = await PettyCashTransaction.find(filter).populate('employeeId', 'name employeeIdCode department').sort({ createdAt: -1, _id: -1 }).limit(20000).lean();
  const header = ['Date', 'Employee', 'Employee ID', 'Department', 'Type', 'Source', 'Category', 'Direction', 'Amount', 'Base Limit Before', 'Base Limit After', 'Balance Before', 'Balance After', 'Claim No', 'Payment Ref', 'Description', 'Performed By'];
  const lines = rows.map((t) => [
    new Date(t.createdAt).toISOString(), t.employeeId?.name, t.employeeId?.employeeIdCode, t.employeeId?.department,
    t.type, t.source, t.transactionCategory || svc.deriveTransactionCategory(t, t.baseLimitBeforePaise || 0, 0), t.direction,
    fromPaise(t.amountPaise).toFixed(2),
    fromPaise(t.baseLimitBeforePaise).toFixed(2), fromPaise(t.baseLimitAfterPaise).toFixed(2),
    fromPaise(t.balanceBeforePaise).toFixed(2), fromPaise(t.balanceAfterPaise).toFixed(2),
    t.claimNumber, t.paymentReference, t.description, t.performedByName,
  ].map(csvCell).join(','));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="petty-cash-ledger-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(`\uFEFF${[header.join(','), ...lines].join('\n')}`);
});

exports._internal = { parseAmount, ledgerFilter, txnOut, walletOut, returnRequestOut };

