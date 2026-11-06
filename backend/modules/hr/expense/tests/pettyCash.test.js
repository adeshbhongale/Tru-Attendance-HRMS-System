/**
 * Petty Cash Wallet integration tests (real MongoDB replica set in memory, so
 * multi-document transactions are exercised exactly as on Atlas).
 * Run: npm test   (from backend/)
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const express = require('express');
const request = require('supertest');

let MongoMemoryReplSet;
try { ({ MongoMemoryReplSet } = require('mongodb-memory-server')); } catch (_) { /* optional dev dependency */ }

const ExpenseClaim = require('../models/ExpenseClaim');
const { PettyCashWallet, PettyCashTransaction, PettyCashRequest, PettyCashReturnRequest } = require('../models/PettyCash');
const svc = require('../services/pettyCashService');
const User = require('../../../../models/User');

const companyId = new mongoose.Types.ObjectId();
const otherCompanyId = new mongoose.Types.ObjectId();
const U = {
  emp: { _id: new mongoose.Types.ObjectId(), name: 'Ravi Employee', role: 'employee', companyId },
  emp2: { _id: new mongoose.Types.ObjectId(), name: 'Sita Employee', role: 'employee', companyId },
  tagged: { _id: new mongoose.Types.ObjectId(), name: 'Tagged Colleague', role: 'employee', companyId },
  accounts: { _id: new mongoose.Types.ObjectId(), name: 'Asha Accounts', role: 'accounts', companyId },
  admin: { _id: new mongoose.Types.ObjectId(), name: 'Company Admin', role: 'admin', companyId },
  outsider: { _id: new mongoose.Types.ObjectId(), name: 'Other Co Emp', role: 'employee', companyId: otherCompanyId },
};

let replSet;
let app;
let skipReason = null;

const as = (who) => ({ 'x-test-user': who });
const balance = async (user = U.emp) => (await PettyCashWallet.findOne({ companyId, employeeId: user._id }).lean())?.balancePaise;
const key = () => `k-${new mongoose.Types.ObjectId()}`;

/** A saved draft claim (legacy shape: submitClaim keeps its stored calculation). */
async function draftClaim(user, allowed, requested = allowed, extra = {}) {
  return ExpenseClaim.create({
    companyId, company: companyId, submittedBy: user._id, submittedByName: user.name,
    claimType: 'FOOD',
    status: 'DRAFT', paymentStatus: 'PENDING',
    employeeClaims: [
      { employee: { employeeId: user._id, name: user.name }, items: [{ expenseType: 'FOOD' }], requestedTotal: requested, allowedTotal: allowed },
      { employee: { employeeId: U.tagged._id, name: U.tagged.name }, items: [{ expenseType: 'FOOD' }], requestedTotal: 0, allowedTotal: 0 },
    ],
    employeeCount: 2,
    grandRequested: requested, grandAllowed: allowed, grandExcess: requested - allowed, payableAmount: allowed,
    ...extra,
  });
}

async function enable(user, on = true) {
  return request(app).post(`/api/expense/petty-cash/admin/wallets/${user._id}/enable`).set(as('accounts')).send({ enabled: on });
}

test.before(async () => {
  if (!MongoMemoryReplSet) { skipReason = 'mongodb-memory-server not installed'; return; }
  try {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  } catch (err) {
    skipReason = `could not start in-memory MongoDB: ${err.message}`;
    return;
  }
  await mongoose.connect(replSet.getUri(), { dbName: 'pettycash_test' });
  await Promise.all([ExpenseClaim.init(), PettyCashWallet.init(), PettyCashTransaction.init(), PettyCashRequest.init(), PettyCashReturnRequest.init()]);
  await User.collection.insertMany(Object.values(U).map((u, idx) => ({ ...u, employeeIdCode: `EMP-00${idx + 1}`, mobile: `987654321${idx}`, email: `${u._id}@t.io`, status: 'active' })));

  app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    const u = U[req.headers['x-test-user']];
    if (!u) return res.status(401).json({ success: false });
    req.user = u;
    req.tenant = { companyId: String(u.companyId) };
    next();
  });
  app.use('/api/expense', require('../routes'));
});

test.after(async () => {
  if (mongoose.connection.readyState) await mongoose.disconnect();
  if (replSet) await replSet.stop();
});

const it = (name, fn) => test(name, async (t) => { if (skipReason) return t.skip(skipReason); await fn(t); });

// ── Initialisation ─────────────────────────────────────────────────────────
it('1-3. wallets are created once per employee at ₹0 and off by default; enabling keeps ₹0 balance', async () => {
  let r = await request(app).get('/api/expense/petty-cash/admin/wallets').set(as('accounts'));
  assert.equal(r.status, 200);
  await request(app).get('/api/expense/petty-cash/admin/wallets').set(as('accounts'));
  assert.equal(await PettyCashWallet.countDocuments({ companyId, employeeId: U.emp._id }), 1, 'no duplicate wallets');
  assert.equal(await balance(), 0, 'default balance is ₹0');

  r = await enable(U.emp);
  assert.equal(r.status, 200);
  assert.equal(await balance(), 0, 'enabling never moves money');
  await enable(U.emp, false);
  await enable(U.emp, true);
  assert.equal(await balance(), 0);

  // Add ₹5,000 via top-up for the subsequent scenarios
  await request(app).post(`/api/expense/petty-cash/admin/wallets/${U.emp._id}/topup`).set(as('accounts'))
    .send({ amount: 5000, reason: 'Initial advance', idempotencyKey: key() });

  r = await request(app).get('/api/expense/petty-cash/wallet').set(as('emp'));
  assert.equal(r.body.data.balance, 5000);
});

// ── Top-ups ────────────────────────────────────────────────────────────────
it('4-5. top-up adds to the balance (never overwrites); failed top-up changes nothing; retry is idempotent', async () => {
  const before = await balance();
  const k = key();
  let r = await request(app).post(`/api/expense/petty-cash/admin/wallets/${U.emp._id}/topup`).set(as('accounts'))
    .send({ amount: 3000, reason: 'Upcoming tour', idempotencyKey: k });
  assert.equal(r.status, 201);
  assert.equal(await balance(), before + 300000);
  r = await request(app).post(`/api/expense/petty-cash/admin/wallets/${U.emp._id}/topup`).set(as('accounts'))
    .send({ amount: 3000, reason: 'Upcoming tour', idempotencyKey: k });
  assert.equal(r.body.duplicate, true);
  assert.equal(await balance(), before + 300000, 'same key twice = one credit');

  for (const bad of [-5, 0, 'abc', 10.555, 20000000]) {
    r = await request(app).post(`/api/expense/petty-cash/admin/wallets/${U.emp._id}/topup`).set(as('accounts'))
      .send({ amount: bad, reason: 'x', idempotencyKey: key() });
    assert.equal(r.status, 422, `amount ${bad} rejected`);
  }
  assert.equal(await balance(), before + 300000);
  // reset to 5,000 for the following scenarios via an audited debit adjustment
  await request(app).post(`/api/expense/petty-cash/admin/wallets/${U.emp._id}/adjust`).set(as('accounts'))
    .send({ direction: 'DR', amount: 3000, reason: 'Test reset adjustment', idempotencyKey: key() });
  assert.equal(await balance(), 500000);
});

// ── Claim submission ───────────────────────────────────────────────────────
it('6, 8, D1, D2. submitting debits only the allowed amount from the submitter; balance can go negative', async () => {
  const c1 = await draftClaim(U.emp, 2000, 2600);
  let r = await request(app).post(`/api/expense/claims/${c1._id}/submit`).set(as('emp'));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(await balance(), 300000, '5,000 - 2,000 allowed (excess 600 not debited)');
  assert.equal(await balance(U.tagged), 0, 'tagged employee wallet untouched');

  const c2 = await draftClaim(U.emp, 4000);
  await request(app).post(`/api/expense/claims/${c2._id}/submit`).set(as('emp'));
  assert.equal(await balance(), -100000, 'negative balance -1,000 allowed');

  const debit = await PettyCashTransaction.findOne({ claimId: c2._id }).lean();
  assert.equal(debit.type, 'DEBIT');
  assert.equal(debit.balanceBeforePaise, 300000);
  assert.equal(debit.balanceAfterPaise, -100000);
});

it('12. double submit / retries debit once', async () => {
  const start = await balance();
  const c = await draftClaim(U.emp, 1500);
  const results = await Promise.all([1, 2, 3].map(() => request(app).post(`/api/expense/claims/${c._id}/submit`).set(as('emp'))));
  assert.ok(results.some((r) => r.status === 200));
  await request(app).post(`/api/expense/claims/${c._id}/submit`).set(as('emp'));
  assert.equal(await balance(), start - 150000);
  assert.equal(await PettyCashTransaction.countDocuments({ claimId: c._id }), 1);
});

it('7. a failed submission leaves the wallet unchanged (validation failure and transaction rollback)', async () => {
  const start = await balance();
  const bad = await draftClaim(U.emp, 0, 0, { employeeClaims: [] });
  const r = await request(app).post(`/api/expense/claims/${bad._id}/submit`).set(as('emp'));
  assert.equal(r.status, 422);
  assert.equal(await balance(), start);

  // claim save + debit inside one transaction, then a failure -> everything rolls back
  const c = await draftClaim(U.emp, 700);
  c.status = 'SUBMITTED';
  await assert.rejects(svc.runAtomic(async (session) => {
    await c.save({ session });
    await svc.syncClaimDebit(c, { session });
    throw new Error('simulated crash after debit');
  }));
  assert.equal(await balance(), start, 'debit rolled back');
  assert.equal((await ExpenseClaim.findById(c._id).lean()).status, 'DRAFT', 'claim change rolled back');
  assert.equal(await PettyCashTransaction.countDocuments({ claimId: c._id }), 0);
});

it('D6. employees not enabled by Accounts are never debited', async () => {
  const c = await draftClaim(U.emp2, 1000);
  const r = await request(app).post(`/api/expense/claims/${c._id}/submit`).set(as('emp2'));
  assert.equal(r.status, 200);
  assert.equal(await PettyCashTransaction.countDocuments({ claimId: c._id }), 0);
});

// ── Payment ────────────────────────────────────────────────────────────────
it('9, 11, 12. payment credits the paid amount exactly once', async () => {
  const c = await draftClaim(U.emp, 4000);
  await request(app).post(`/api/expense/claims/${c._id}/submit`).set(as('emp'));
  const afterSubmit = await balance();
  const appRes = await request(app).post(`/api/expense/claims/${c._id}/accounts-approve`).set(as('accounts')).send({ remarks: 'Approved' });
  assert.equal(appRes.status, 200);
  assert.equal(appRes.body.data.status, 'ACCOUNTS_APPROVED');
  assert.equal(appRes.body.data.pettyCashSummary.creditedAmount, 0, 'Petty cash is NOT credited when approved by Accounts Admin');
  assert.equal(await balance(), afterSubmit, 'Wallet balance must NOT increase on Accounts approval');
  assert.equal(await PettyCashTransaction.countDocuments({ claimId: c._id, source: 'CLAIM_PAYMENT' }), 0, 'No CLAIM_PAYMENT transaction on Accounts approval');
  // Even calling creditClaimPayment directly on an ACCOUNTS_APPROVED claim must return null and never credit
  const approvedDoc = await ExpenseClaim.findById(c._id);
  approvedDoc.paidAmount = 4000;
  assert.equal(await svc.creditClaimPayment(approvedDoc), null, 'creditClaimPayment refuses non-PAID claim');
  assert.equal(await balance(), afterSubmit, 'Wallet still unchanged before markPaid');

  let r = await request(app).post(`/api/expense/claims/${c._id}/payment`).set(as('accounts')).send({ paidAmount: 4000, paymentDate: '2026-10-10', paymentReference: 'UTR123', remarks: 'Paid via NEFT', paymentProof: { name: 'proof.jpg', url: 'https://res.cloudinary.com/demo/proof.jpg' } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(await balance(), afterSubmit + 400000);
  r = await request(app).post(`/api/expense/claims/${c._id}/payment`).set(as('accounts')).send({ paidAmount: 4000 });
  assert.equal(r.status, 409, 'second payment refused');
  assert.equal(await balance(), afterSubmit + 400000, 'no duplicate credit');
  const credit = await PettyCashTransaction.findOne({ claimId: c._id, source: 'CLAIM_PAYMENT' }).lean();
  assert.equal(credit.paymentReference, 'UTR123');

  // paid less than allowed -> only the paid amount is credited
  const c2 = await draftClaim(U.emp, 3000);
  await request(app).post(`/api/expense/claims/${c2._id}/submit`).set(as('emp'));
  const b2 = await balance();
  await request(app).post(`/api/expense/claims/${c2._id}/accounts-approve`).set(as('accounts')).send({ remarks: 'Approved' });
  await request(app).post(`/api/expense/claims/${c2._id}/payment`).set(as('accounts')).send({ paidAmount: 1200, paymentDate: '2026-10-10', remarks: 'Partial settlement', paymentProof: { name: 'proof2.jpg', url: 'https://res.cloudinary.com/demo/proof2.jpg' } });
  assert.equal(await balance(), b2 + 120000);
});

it('10, D3. rejection reverses the debit (no payment credit); resubmission debits again; deletion stays balanced', async () => {
  const start = await balance();
  const c = await draftClaim(U.emp, 2500);
  await request(app).post(`/api/expense/claims/${c._id}/submit`).set(as('emp'));
  assert.equal(await balance(), start - 250000);

  let r = await request(app).post(`/api/expense/claims/${c._id}/reject`).set(as('accounts')).send({ reason: 'Bills missing' });
  assert.equal(r.status, 200);
  assert.equal(await balance(), start, 'debit reversed on rejection');
  assert.equal(await PettyCashTransaction.countDocuments({ claimId: c._id, source: 'CLAIM_PAYMENT' }), 0, 'rejected claim never gets a payment credit');

  r = await request(app).post(`/api/expense/claims/${c._id}/payment`).set(as('accounts')).send({ paidAmount: 2500 });
  assert.equal(r.status, 409, 'rejected claims cannot be paid');
  assert.equal(await balance(), start);

  r = await request(app).post(`/api/expense/claims/${c._id}/submit`).set(as('emp'));
  assert.equal(r.status, 200);
  assert.equal(await balance(), start - 250000, 'resubmission debits again');

  await request(app).post(`/api/expense/claims/${c._id}/reject`).set(as('accounts')).send({ reason: 'Still wrong' });
  r = await request(app).delete(`/api/expense/claims/${c._id}`).set(as('emp'));
  assert.equal(r.status, 200);
  assert.equal(await balance(), start, 'deleted claim leaves no debit');

  // pending (unpaid) claims get no credit
  const p = await draftClaim(U.emp, 100);
  await request(app).post(`/api/expense/claims/${p._id}/submit`).set(as('emp'));
  assert.equal(await PettyCashTransaction.countDocuments({ claimId: p._id, direction: 'CR' }), 0);
});

// ── Requests ───────────────────────────────────────────────────────────────
it('top-up request: submitting approval credits the wallet directly once', async () => {
  let r = await request(app).post('/api/expense/petty-cash/requests').set(as('emp')).send({ amount: 2000, reason: 'Chennai tour next week' });
  assert.equal(r.status, 201);
  const id = r.body.data._id;
  const before = await balance();
  r = await request(app).post(`/api/expense/petty-cash/admin/requests/${id}/approve`).set(as('accounts')).send({ approvedAmount: 1500, reference: 'CASH-01' });
  assert.equal(r.status, 200);
  assert.equal(r.body.data.status, 'FULFILLED');
  assert.equal(await balance(), before + 150000, 'submitting approval credits approved amount directly to wallet');
  r = await request(app).post(`/api/expense/petty-cash/admin/requests/${id}/fulfil`).set(as('accounts'));
  assert.equal(r.status, 409);
  assert.equal(await balance(), before + 150000);
  r = await request(app).get('/api/expense/petty-cash/requests').set(as('emp'));
  assert.equal(r.body.data[0].status, 'FULFILLED');
});

// ── Concurrency ────────────────────────────────────────────────────────────
it('13. concurrent top-ups and claim debits keep the balance exact', async () => {
  const start = await balance();
  const claims = await Promise.all([1, 2, 3, 4, 5].map(() => draftClaim(U.emp, 100)));
  await Promise.all([
    ...Array.from({ length: 10 }, () => request(app).post(`/api/expense/petty-cash/admin/wallets/${U.emp._id}/topup`).set(as('accounts'))
      .send({ amount: 10, reason: 'Parallel', idempotencyKey: key() })),
    ...claims.map((c) => request(app).post(`/api/expense/claims/${c._id}/submit`).set(as('emp'))),
  ]);
  assert.equal(await balance(), start + 10 * 1000 - 5 * 10000);
});

// ── Authorization ──────────────────────────────────────────────────────────
it('14-15. employees cannot see other wallets or move money', async () => {
  for (const [method, url, body] of [
    ['get', '/api/expense/petty-cash/admin/wallets'],
    ['get', `/api/expense/petty-cash/admin/wallets/${U.emp._id}`],
    ['post', `/api/expense/petty-cash/admin/wallets/${U.emp2._id}/topup`, { amount: 100, reason: 'self', idempotencyKey: key() }],
    ['post', `/api/expense/petty-cash/admin/wallets/${U.emp2._id}/adjust`, { direction: 'CR', amount: 100, reason: 'self credit', idempotencyKey: key() }],
  ]) {
    const r = await request(app)[method](url).set(as('emp2')).send(body || {});
    assert.equal(r.status, 403, `${method} ${url}`);
  }
  const r = await request(app).get('/api/expense/petty-cash/wallet?employeeId=' + U.emp._id).set(as('emp2'));
  assert.equal(String(r.body.data.employeeId), String(U.emp2._id), 'client-supplied employeeId is ignored');
  const t = await request(app).get('/api/expense/petty-cash/transactions').set(as('emp2'));
  assert.ok(t.body.data.every((x) => String(x.employeeId) === String(U.emp2._id)));
  // Accounts of the same company cannot act on another company's employee
  const x = await request(app).post(`/api/expense/petty-cash/admin/wallets/${U.outsider._id}/topup`).set(as('accounts'))
    .send({ amount: 10, reason: 'x', idempotencyKey: key() });
  assert.equal(x.status, 404);
});

// ── Ledger integrity / reports ─────────────────────────────────────────────
it('16-17. reversals keep the audit trail; ledger reconciles; reports total correctly; ledger is immutable', async () => {
  const k = key();
  const top = await request(app).post(`/api/expense/petty-cash/admin/wallets/${U.emp._id}/topup`).set(as('accounts'))
    .send({ amount: 999, reason: 'Wrong employee', idempotencyKey: k });
  const before = await balance();
  let r = await request(app).post(`/api/expense/petty-cash/admin/transactions/${top.body.data._id}/reverse`).set(as('accounts')).send({ reason: 'Entered by mistake' });
  assert.equal(r.status, 403, 'Accounts Admin cannot reverse ledger transactions');
  r = await request(app).post(`/api/expense/petty-cash/admin/transactions/${top.body.data._id}/reverse`).set(as('admin')).send({ reason: 'Entered by mistake' });
  assert.equal(r.status, 200, 'Company Admin / Super Admin can reverse ledger transactions');
  assert.equal(await balance(), before - 99900);
  r = await request(app).post(`/api/expense/petty-cash/admin/transactions/${top.body.data._id}/reverse`).set(as('admin')).send({ reason: 'Entered by mistake' });
  assert.equal(r.status, 409, 'cannot reverse twice');
  const orig = await PettyCashTransaction.findById(top.body.data._id).lean();
  assert.ok(orig.reversedBy, 'original kept and linked to its reversal');

  const claimTxn = await PettyCashTransaction.findOne({ employeeId: U.emp._id, claimId: { $ne: null } }).lean();
  r = await request(app).post(`/api/expense/petty-cash/admin/transactions/${claimTxn._id}/reverse`).set(as('admin')).send({ reason: 'Manual try' });
  assert.equal(r.status, 409, 'claim-linked rows are managed by the claim workflow');

  await assert.rejects(PettyCashTransaction.deleteOne({ _id: orig._id }));
  await assert.rejects(PettyCashTransaction.updateOne({ _id: orig._id }, { $set: { amountPaise: 1 } }));

  r = await request(app).get(`/api/expense/petty-cash/admin/reports?employeeId=${U.emp._id}&limit=200`).set(as('accounts'));
  const w = await PettyCashWallet.findOne({ companyId, employeeId: U.emp._id }).lean();
  assert.equal(Math.round(r.body.totals.net * 100), w.balancePaise, 'report net equals wallet balance');

  r = await request(app).get('/api/expense/petty-cash/admin/summary').set(as('accounts'));
  assert.equal(r.status, 200);
  assert.ok(r.body.data.wallets >= 3);

  r = await request(app).get('/api/expense/petty-cash/admin/reports/export').set(as('accounts'));
  assert.equal(r.status, 200);
  assert.match(r.text, /Balance After/);
});

it('18. existing claim workflow still works for claims without a wallet (reopen + pay)', async () => {
  const c = await draftClaim(U.emp2, 800);
  await request(app).post(`/api/expense/claims/${c._id}/submit`).set(as('emp2'));
  let r = await request(app).post(`/api/expense/claims/${c._id}/reject`).set(as('accounts')).send({ reason: 'Need bill' });
  assert.equal(r.status, 200);
  r = await request(app).post(`/api/expense/claims/${c._id}/reopen`).set(as('admin')).send({ reason: 'Bill received' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  await request(app).post(`/api/expense/claims/${c._id}/accounts-approve`).set(as('accounts')).send({ remarks: 'Approved' });
  r = await request(app).post(`/api/expense/claims/${c._id}/payment`).set(as('accounts')).send({ paidAmount: 800, paymentDate: '2026-10-10', remarks: 'Paid after reopen', paymentProof: { name: 'proof3.jpg', url: 'https://res.cloudinary.com/demo/proof3.jpg' } });
  assert.equal(r.status, 200);
  assert.equal(r.body.data.status, 'PAID');
  assert.equal(await PettyCashTransaction.countDocuments({ claimId: c._id }), 0);
});

// ── Enhancement A: Base Limit & Return Request Workflow ─────────────────────
it('19. Base Limit lifecycle: initial allocation, enhancement, allocation adjustment, claim submit, claim payment, and return request', async () => {
  // Enable wallet for tagged employee (fresh wallet starting at ₹0 Base Limit, ₹0 Balance)
  await enable(U.tagged, true);
  let w = (await request(app).get(`/api/expense/petty-cash/admin/wallets/${U.tagged._id}`).set(as('accounts'))).body.data.wallet;
  assert.equal(w.baseLimit, 0);
  assert.equal(w.balance, 0);

  // 1) Initial Allocation of ₹3,000 -> Base Limit: ₹3,000, Balance: ₹3,000
  let r = await request(app).post(`/api/expense/petty-cash/admin/wallets/${U.tagged._id}/topup`).set(as('accounts'))
    .send({ amount: 3000, reason: 'Initial petty cash allocation', idempotencyKey: key() });
  assert.equal(r.status, 201);
  assert.equal(r.body.data.transactionCategory, 'INITIAL_ALLOCATION');
  assert.equal(r.body.data.baseLimitBefore, 0);
  assert.equal(r.body.data.baseLimitAfter, 3000);
  w = (await request(app).get('/api/expense/petty-cash/wallet').set(as('tagged'))).body.data;
  assert.equal(w.baseLimit, 3000);
  assert.equal(w.balance, 3000);

  // 2) Enhancement Request of ₹2,000 -> Base Limit stays ₹3,000, Balance becomes ₹5,000
  const reqRes = await request(app).post('/api/expense/petty-cash/requests').set(as('tagged'))
    .send({ amount: 2000, reason: 'Additional petty cash needed for outstation work' });
  assert.equal(reqRes.status, 201);
  const approveEnh = await request(app).post(`/api/expense/petty-cash/admin/requests/${reqRes.body.data._id}/approve`).set(as('accounts'))
    .send({ approvedAmount: 2000, reference: 'ENH-2000' });
  assert.equal(approveEnh.status, 200);
  w = (await request(app).get('/api/expense/petty-cash/wallet').set(as('tagged'))).body.data;
  assert.equal(w.baseLimit, 3000, 'Enhancement does NOT change Base Limit');
  assert.equal(w.balance, 5000, 'Enhancement increases Balance by ₹2,000');

  // 3) Account Adjustment (+₹1,000) -> Base Limit stays ₹3,000, Balance becomes ₹6,000
  r = await request(app).post(`/api/expense/petty-cash/admin/wallets/${U.tagged._id}/adjust`).set(as('accounts'))
    .send({ direction: 'CR', category: 'ALLOCATION_ADJUSTMENT', amount: 1000, reason: 'Authorized balance credit', idempotencyKey: key() });
  assert.equal(r.status, 201);
  assert.equal(r.body.data.baseLimitBefore, 3000);
  assert.equal(r.body.data.baseLimitAfter, 3000);
  w = (await request(app).get('/api/expense/petty-cash/wallet').set(as('tagged'))).body.data;
  assert.equal(w.baseLimit, 3000, 'Adjustment does NOT change Base Limit');
  assert.equal(w.balance, 6000);

  // 4) Normal Account Adjustment (OTHER_ADJUSTMENT) -> changes Balance ONLY, never Base Limit
  r = await request(app).post(`/api/expense/petty-cash/admin/wallets/${U.tagged._id}/adjust`).set(as('accounts'))
    .send({ direction: 'DR', category: 'OTHER_ADJUSTMENT', amount: 500, reason: 'Reconciliation correction', idempotencyKey: key() });
  assert.equal(r.status, 201);
  assert.equal(r.body.data.transactionCategory, 'OTHER_ADJUSTMENT');
  assert.equal(r.body.data.baseLimitBefore, 3000);
  assert.equal(r.body.data.baseLimitAfter, 3000);
  w = (await request(app).get('/api/expense/petty-cash/wallet').set(as('tagged'))).body.data;
  assert.equal(w.baseLimit, 3000, 'Normal adjustment does not change Base Limit');
  assert.equal(w.balance, 5500);

  // Credit back ₹500 via normal adjustment -> Base Limit still ₹3,000, Balance ₹6,000
  await request(app).post(`/api/expense/petty-cash/admin/wallets/${U.tagged._id}/adjust`).set(as('accounts'))
    .send({ direction: 'CR', category: 'OTHER_ADJUSTMENT', amount: 500, reason: 'Restore balance', idempotencyKey: key() });

  // 5) Expense Claim Submission of ₹2,000 -> Base Limit remains ₹3,000, Balance becomes ₹4,000
  const claim = await ExpenseClaim.create({
    companyId, company: companyId, submittedBy: U.tagged._id, submittedByName: U.tagged.name,
    claimType: 'FOOD', status: 'DRAFT', paymentStatus: 'PENDING',
    employeeClaims: [{ employee: { employeeId: U.tagged._id, name: U.tagged.name }, items: [{ expenseType: 'FOOD' }], requestedTotal: 2000, allowedTotal: 2000 }],
    employeeCount: 1, grandRequested: 2000, grandAllowed: 2000, grandExcess: 0, payableAmount: 2000,
  });
  r = await request(app).post(`/api/expense/claims/${claim._id}/submit`).set(as('tagged'));
  assert.equal(r.status, 200);
  w = (await request(app).get('/api/expense/petty-cash/wallet').set(as('tagged'))).body.data;
  assert.equal(w.baseLimit, 3000, 'Expense claim submission never changes Base Limit');
  assert.equal(w.balance, 4000, 'Expense claim submission deducts from Balance');

  // 6) Claim Settlement/Payment of ₹2,000 -> Base Limit remains ₹3,000, Balance becomes ₹6,000 (ONLY after Paid, NOT on Accounts approval)
  await request(app).post(`/api/expense/claims/${claim._id}/accounts-approve`).set(as('accounts')).send({ remarks: 'Approved' });
  w = (await request(app).get('/api/expense/petty-cash/wallet').set(as('tagged'))).body.data;
  assert.equal(w.balance, 4000, 'Accounts approval alone does NOT add amount to Petty Cash wallet');
  r = await request(app).post(`/api/expense/claims/${claim._id}/payment`).set(as('accounts'))
    .send({ paidAmount: 2000, paymentDate: '2026-10-10', paymentReference: 'SETTLE-2000', remarks: 'Settled petty cash claim', paymentProof: { name: 'proof4.jpg', url: 'https://res.cloudinary.com/demo/proof4.jpg' } });
  assert.equal(r.status, 200);
  w = (await request(app).get('/api/expense/petty-cash/wallet').set(as('tagged'))).body.data;
  assert.equal(w.baseLimit, 3000, 'Claim settlement never changes Base Limit');
  assert.equal(w.balance, 6000, 'Claim settlement restores Balance');

  // 7) Return Request: Balance is ₹6,000, Base Limit is ₹3,000 -> Excess above Base Limit is ₹3,000.
  // Employee requests return of ₹1,500 with required remarks and proof photo attachment
  const retRes = await request(app).post('/api/expense/petty-cash/return-requests').set(as('tagged'))
    .send({ amount: 1500, remarks: 'Handed over excess petty cash to Accounts', attachments: ['https://example.com/proof1.jpg'] });
  assert.equal(retRes.status, 201);
  const retId = retRes.body.data._id;
  assert.equal(retRes.body.data.status, 'PENDING');
  assert.equal(retRes.body.data.remarks, 'Handed over excess petty cash to Accounts');
  assert.deepEqual(retRes.body.data.attachments, ['https://example.com/proof1.jpg']);

  // While PENDING, neither Base Limit nor Balance changes; availableForReturn = (6000 - 3000) - 1500 = 1500
  w = (await request(app).get('/api/expense/petty-cash/wallet').set(as('tagged'))).body.data;
  assert.equal(w.baseLimit, 3000, 'Pending return request does not change Base Limit');
  assert.equal(w.balance, 6000, 'Pending return request does not change Balance');
  assert.equal(w.excessAboveBaseLimit, 3000, 'Excess above Base Limit is 6000 - 3000 = 3000');
  assert.equal(w.availableForReturn, 1500, 'Available for return reserves the ₹1,500 pending return from the ₹3,000 excess');

  // Accounts approving without remarks is rejected (422)
  const noRemarkApprove = await request(app).post(`/api/expense/petty-cash/admin/return-requests/${retId}/approve`).set(as('accounts'))
    .send({ approvedAmount: 1200, remarks: '' });
  assert.equal(noRemarkApprove.status, 422, 'Remark is required when approving a return request');

  // Accounts approves partial return of ₹1,200 with required remark -> status becomes APPROVED and Balance decreases
  const procRes = await request(app).post(`/api/expense/petty-cash/admin/return-requests/${retId}/approve`).set(as('accounts'))
    .send({ approvedAmount: 1200, remarks: 'Accepted ₹1,200 cash return' });
  assert.equal(procRes.status, 200);
  assert.equal(procRes.body.data.status, 'APPROVED');
  assert.equal(procRes.body.data.approvedAmount, 1200);
  assert.equal(procRes.body.data.accountsRemarks, 'Accepted ₹1,200 cash return');

  // Verify Balance decreased by ₹1,200 -> ₹4,800 while Base Limit stayed ₹3,000
  w = (await request(app).get('/api/expense/petty-cash/wallet').set(as('tagged'))).body.data;
  assert.equal(w.baseLimit, 3000, 'Approved return does NOT deduct from Base Limit');
  assert.equal(w.balance, 4800, 'Approved return reduces Balance by ₹1,200');
  assert.equal(w.totalAllocation, 3000);
  assert.equal(w.totalReturn, 1200);

  // 8) Only Accounts Admin / Super Admin can directly change Base Limit
  const empTryBase = await request(app).post(`/api/expense/petty-cash/admin/wallets/${U.tagged._id}/base-limit`).set(as('tagged'))
    .send({ baseLimit: 9000 });
  assert.equal(empTryBase.status, 403, 'Employee cannot change Base Limit');

  const accSetBase = await request(app).post(`/api/expense/petty-cash/admin/wallets/${U.tagged._id}/base-limit`).set(as('accounts'))
    .send({ baseLimit: 4000, reason: 'Authorized Base Limit update by Accounts Admin' });
  assert.equal(accSetBase.status, 200);
  assert.equal(accSetBase.body.data.baseLimit, 4000);
  assert.equal(accSetBase.body.data.balance, 4800);

  // Attempting to approve again is rejected (409) and never double-deducts
  const dupProc = await request(app).post(`/api/expense/petty-cash/admin/return-requests/${retId}/approve`).set(as('accounts'))
    .send({ approvedAmount: 1200, remarks: 'Duplicate approve attempt' });
  assert.equal(dupProc.status, 409);
  w = (await request(app).get('/api/expense/petty-cash/wallet').set(as('tagged'))).body.data;
  assert.equal(w.baseLimit, 4000);
  assert.equal(w.balance, 4800);
});

it('20. Return Request validation: blocks return > excess (balance - baseLimit), blocks when balance <= baseLimit, and rejected request changes nothing', async () => {
  // Currently U.tagged has Base Limit ₹4,000, Balance ₹4,800 -> Returnable excess is ₹800
  let r = await request(app).post('/api/expense/petty-cash/return-requests').set(as('tagged'))
    .send({ amount: 1000, remarks: 'Trying to return more than excess above base limit' });
  assert.equal(r.status, 422, 'Cannot return more than (balance - baseLimit)');

  // Submit valid return request of ₹800 (= 4800 - 4000) and reject it -> balances stay at Base ₹4,000, Balance ₹4,800
  r = await request(app).post('/api/expense/petty-cash/return-requests').set(as('tagged'))
    .send({ amount: 800, remarks: 'Return request to be rejected' });
  assert.equal(r.status, 201);
  const rejRes = await request(app).post(`/api/expense/petty-cash/admin/return-requests/${r.body.data._id}/reject`).set(as('accounts'))
    .send({ reason: 'Keep petty cash for next week tour' });
  assert.equal(rejRes.status, 200);
  assert.equal(rejRes.body.data.status, 'REJECTED');

  let w = (await request(app).get('/api/expense/petty-cash/wallet').set(as('tagged'))).body.data;
  assert.equal(w.baseLimit, 4000);
  assert.equal(w.balance, 4800);

  // Employee submits a PENDING return request of ₹500 (when excess is ₹800), then submits a ₹500 claim so excess drops to ₹300.
  // Accounts Admin still approves and cuts ₹500 without being blocked by the reduced excess!
  const pendingRet = await request(app).post('/api/expense/petty-cash/return-requests').set(as('tagged'))
    .send({ amount: 500, remarks: 'Returning ₹500 excess cash' });
  assert.equal(pendingRet.status, 201);

  const midClaim = await ExpenseClaim.create({
    companyId, company: companyId, submittedBy: U.tagged._id, submittedByName: U.tagged.name,
    claimType: 'FOOD', status: 'DRAFT', paymentStatus: 'PENDING',
    employeeClaims: [{ employee: { employeeId: U.tagged._id, name: U.tagged.name }, items: [{ expenseType: 'FOOD' }], requestedTotal: 500, allowedTotal: 500 }],
    employeeCount: 1, grandRequested: 500, grandAllowed: 500, grandExcess: 0, payableAmount: 500,
  });
  await request(app).post(`/api/expense/claims/${midClaim._id}/submit`).set(as('tagged'));

  // Now Balance is ₹4,300 and Base Limit is ₹4,000 (excess is only ₹300), but Accounts approves ₹500 return
  const appAfterClaim = await request(app).post(`/api/expense/petty-cash/admin/return-requests/${pendingRet.body.data._id}/approve`).set(as('accounts'))
    .send({ approvedAmount: 500, remarks: 'Cut ₹500 return even after claim submitted' });
  assert.equal(appAfterClaim.status, 200, 'Accounts can cut ₹500 even if employee submitted a claim while return was pending');
  assert.equal(appAfterClaim.body.data.status, 'APPROVED');

  w = (await request(app).get('/api/expense/petty-cash/wallet').set(as('tagged'))).body.data;
  assert.equal(w.baseLimit, 4000, 'Base Limit unchanged at ₹4,000');
  assert.equal(w.balance, 3800, 'Balance reduced from ₹4,300 by ₹500 to ₹3,800');

  // Set Base Limit to ₹3,800 so Balance == Base Limit -> Return Request must be blocked
  await request(app).post(`/api/expense/petty-cash/admin/wallets/${U.tagged._id}/base-limit`).set(as('accounts'))
    .send({ baseLimit: 3800, reason: 'Match balance' });
  const eqRet = await request(app).post('/api/expense/petty-cash/return-requests').set(as('tagged'))
    .send({ amount: 100, remarks: 'Try return when balance equals base limit' });
  assert.equal(eqRet.status, 422, 'Return request blocked when balance <= baseLimit');

  // Submit a large claim of ₹5,000 so Balance goes negative (-₹1,200) while Base Limit remains ₹3,800
  const bigClaim = await ExpenseClaim.create({
    companyId, company: companyId, submittedBy: U.tagged._id, submittedByName: U.tagged.name,
    claimType: 'FOOD', status: 'DRAFT', paymentStatus: 'PENDING',
    employeeClaims: [{ employee: { employeeId: U.tagged._id, name: U.tagged.name }, items: [{ expenseType: 'FOOD' }], requestedTotal: 5000, allowedTotal: 5000 }],
    employeeCount: 1, grandRequested: 5000, grandAllowed: 5000, grandExcess: 0, payableAmount: 5000,
  });
  await request(app).post(`/api/expense/claims/${bigClaim._id}/submit`).set(as('tagged'));

  w = (await request(app).get('/api/expense/petty-cash/wallet').set(as('tagged'))).body.data;
  assert.equal(w.baseLimit, 3800, 'Negative wallet balance never reduces Base Limit');
  assert.equal(w.balance, -1200, 'Wallet balance is negative -₹1,200');

  // Return request when balance is negative must be blocked
  const negRet = await request(app).post('/api/expense/petty-cash/return-requests').set(as('tagged'))
    .send({ amount: 100, remarks: 'Try return with negative balance' });
  assert.equal(negRet.status, 422, 'Return request blocked when balance <= 0');
});

it('21. Historical migration: migrateOtherPurchaseClaims converts OTHER+PURCHASE claims to STOCK_PURCHASE and preserves normal OTHER claims', async () => {
  const { migrateOtherPurchaseClaims } = require('../services/seedExpenseMasters');

  const purchaseClaim = await ExpenseClaim.create({
    companyId, company: companyId, submittedBy: U.emp._id, submittedByName: U.emp.name,
    claimType: 'OTHER', claimMode: 'NORMAL', status: 'PAID', paymentStatus: 'PAID',
    entries: [{
      expenseType: 'OTHER', otherSubType: 'PURCHASE', barcodeNumber: 'BC-MIG-99', quantity: '10 pcs',
      requestedAmount: 1500, allowedAmount: 1500, excessAmount: 0, remark: 'Bought connectors',
    }],
    employeeClaims: [{
      employee: { employeeId: U.emp._id, name: U.emp.name },
      items: [{
        expenseType: 'OTHER', expenseTypeName: 'Other (Purchase)', otherSubType: 'PURCHASE',
        barcodeNumber: 'BC-MIG-99', quantity: '10 pcs', requestedAmount: 1500, allowedAmount: 1500, excessAmount: 0,
      }],
      requestedTotal: 1500, allowedTotal: 1500,
    }],
    grandRequested: 1500, grandAllowed: 1500, payableAmount: 1500, paidAmount: 1500,
  });

  const normalOtherClaim = await ExpenseClaim.create({
    companyId, company: companyId, submittedBy: U.emp._id, submittedByName: U.emp.name,
    claimType: 'OTHER', claimMode: 'NORMAL', status: 'SUBMITTED', paymentStatus: 'PENDING',
    entries: [{
      expenseType: 'OTHER', otherSubType: 'NORMAL',
      requestedAmount: 400, allowedAmount: 400, excessAmount: 0, remark: 'Courier charges',
    }],
    employeeClaims: [{
      employee: { employeeId: U.emp._id, name: U.emp.name },
      items: [{
        expenseType: 'OTHER', expenseTypeName: 'Other Expense', otherSubType: 'NORMAL',
        requestedAmount: 400, allowedAmount: 400, excessAmount: 0,
      }],
      requestedTotal: 400, allowedTotal: 400,
    }],
    grandRequested: 400, grandAllowed: 400, payableAmount: 400,
  });

  const res = await migrateOtherPurchaseClaims(companyId, { force: true });
  assert.ok(res.migrated >= 1);

  const migratedDoc = await ExpenseClaim.findById(purchaseClaim._id).lean();
  assert.equal(migratedDoc.claimType, 'STOCK_PURCHASE');
  assert.equal(migratedDoc.entries[0].expenseType, 'STOCK_PURCHASE');
  assert.equal(migratedDoc.entries[0].barcodeNumber, 'BC-MIG-99');
  assert.equal(migratedDoc.entries[0].quantity, '10 pcs');
  assert.equal(migratedDoc.employeeClaims[0].items[0].expenseType, 'STOCK_PURCHASE');
  assert.equal(migratedDoc.employeeClaims[0].items[0].expenseTypeName, 'Stock Purchase');
  assert.equal(migratedDoc.paidAmount, 1500, 'Historical payment preserved');

  const normalDoc = await ExpenseClaim.findById(normalOtherClaim._id).lean();
  assert.equal(normalDoc.claimType, 'OTHER', 'Normal OTHER claim untouched');
  assert.equal(normalDoc.entries[0].expenseType, 'OTHER');
});


