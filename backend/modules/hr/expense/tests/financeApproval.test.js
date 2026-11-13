/**
 * 2-step approval (Reporting Manager -> CFO / Finance Head -> Accounts) for
 * Full Payment and Stock Purchase claims, including strict company-wise isolation.
 * Integration tests on an in-memory MongoDB.
 * Run: node --test modules/hr/expense/tests/financeApproval.test.js   (from backend/)
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const express = require('express');
const request = require('supertest');

let MongoMemoryReplSet;
try { ({ MongoMemoryReplSet } = require('mongodb-memory-server')); } catch (_) { /* optional */ }

const ExpenseClaim = require('../models/ExpenseClaim');
const ExpenseFinanceHead = require('../models/ExpenseFinanceHead');
const User = require('../../../../models/User');
const Level = require('../../../../models/Level');
const Designation = require('../../../../models/Designation');
const Grade = require('../../../../models/Grade');

const companyId = new mongoose.Types.ObjectId();
const otherCompanyId = new mongoose.Types.ObjectId();
const id = () => new mongoose.Types.ObjectId();
const ids = {
  gm: id(), rm: id(), emp: id(), emp2: id(), cfo: id(), cfo2: id(),
  bRm: id(), bEmp: id(), bCfo: id(),
};
const U = {
  gm: { _id: ids.gm, name: 'Gita GM', role: 'employee', designation: 'General Manager', department: 'Sales', companyId },
  rm: { _id: ids.rm, name: 'Ramesh RM', role: 'manager', designation: 'Sales Manager', department: 'Sales', reportsTo: ids.gm, companyId },
  emp: { _id: ids.emp, name: 'Esha Employee', role: 'employee', designation: 'Sales Engineer', department: 'Sales', reportsTo: ids.rm, companyId },
  emp2: { _id: ids.emp2, name: 'Eklavya Employee', role: 'employee', designation: 'Sales Engineer', department: 'Sales', reportsTo: ids.rm, companyId },
  cfo: { _id: ids.cfo, name: 'Chitra CFO', role: 'employee', designation: 'Chief Financial Officer', department: 'Finance', reportsTo: ids.gm, companyId },
  cfo2: { _id: ids.cfo2, name: 'Farhan Finance Head', role: 'employee', designation: 'Finance Head', department: 'Finance', reportsTo: ids.gm, companyId },
  hr: { _id: id(), name: 'Hema HR Admin', role: 'hr_admin', companyId },
  admin: { _id: id(), name: 'Arun Company Admin', role: 'company_admin', companyId },
  superadmin: { _id: id(), name: 'Super Admin', role: 'superadmin', scope: 'GLOBAL' },
  accounts: { _id: id(), name: 'Asha Accounts', role: 'accounts', companyId },
  // Company B users (strictly isolated from Company A)
  outsider: { _id: id(), name: 'Other Co Emp', role: 'employee', companyId: otherCompanyId },
  bAdmin: { _id: id(), name: 'Bala CoB Admin', role: 'company_admin', companyId: otherCompanyId },
  bHr: { _id: id(), name: 'Bhavna CoB HR', role: 'hr_admin', companyId: otherCompanyId },
  bRm: { _id: ids.bRm, name: 'Bharat CoB RM', role: 'manager', designation: 'Ops Manager', department: 'Ops', companyId: otherCompanyId },
  bEmp: { _id: ids.bEmp, name: 'Bina CoB Emp', role: 'employee', designation: 'Ops Exec', department: 'Ops', reportsTo: ids.bRm, companyId: otherCompanyId },
  bCfo: { _id: ids.bCfo, name: 'Brijesh CoB CFO', role: 'employee', designation: 'CFO', department: 'Finance', reportsTo: ids.bRm, companyId: otherCompanyId },
};

let replSet;
let app;
let skipReason = null;
const as = (who) => ({ 'x-test-user': who });
const it = (name, fn) => test(name, async (t) => { if (skipReason) return t.skip(skipReason); await fn(t); });

test.before(async () => {
  if (!MongoMemoryReplSet) { skipReason = 'mongodb-memory-server not installed'; return; }
  try {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  } catch (err) { skipReason = `could not start in-memory MongoDB: ${err.message}`; return; }
  await mongoose.connect(replSet.getUri(), { dbName: 'finance_approval_test' });
  await Promise.all([ExpenseClaim.init(), ExpenseFinanceHead.init()]);
  await User.collection.insertMany(Object.values(U).map((u, i) => ({ ...u, employeeIdCode: `EMP-${100 + i}`, mobile: `98765432${String(10 + i).padStart(2, '0')}`, email: `${u._id}@t.io`, status: 'active' })));

  app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    const u = U[req.headers['x-test-user']];
    if (!u) return res.status(401).json({ success: false });
    req.user = u;
    // tenant middleware: only global (Super Admin) users may pick another company with x-company-id
    const cid = u.scope === 'GLOBAL'
      ? (req.headers['x-company-id'] || req.query.companyId || '')
      : (u.companyId || '');
    req.tenant = { companyId: String(cid || '') || null };
    next();
  });
  app.use('/api/expense', require('../routes'));
});

test.after(async () => {
  if (mongoose.connection.readyState) await mongoose.disconnect();
  if (replSet) await replSet.stop();
});

const receipt = (name) => ({ name, url: `https://res.cloudinary.com/demo/${name}`, type: 'image/jpeg', size: 1000 });
let dayOffset = 1;
const nextDate = () => { const d = new Date('2026-11-04T00:00:00Z'); d.setUTCDate(d.getUTCDate() - (dayOffset++)); return d.toISOString().slice(0, 10); };
const body = (over = {}) => ({
  submit: true,
  claimMode: 'NORMAL',
  claimDate: nextDate(),
  numberOfEmployees: 1,
  employeeIds: ['self'],
  customerName: 'ABC Ltd.',
  destinationCity: 'Pune',
  expenseType: 'STOCK_PURCHASE',
  requestedAmount: 5000,
  materialName: 'Copper cable',
  barcodeNumber: 'BC-1001',
  quantity: '10 m',
  remark: 'Urgent stock purchase for customer site installation.',
  receipts: [receipt('bill.jpg')],
  fullPayment: { requested: false },
  ...over,
});

async function submit(who, over) {
  const r = await request(app).post('/api/expense/claims').set(as(who)).send(body(over));
  assert.equal(r.status < 300, true, `create failed: ${r.status} ${JSON.stringify(r.body?.errors || r.body?.message)}`);
  return r.body.data;
}
const approve = (who, cid, remarks = 'ok') => request(app).post(`/api/expense/claims/${cid}/approve`).set(as(who)).send({ remarks });
const reject = (who, cid, reason = 'Not justified') => request(app).post(`/api/expense/claims/${cid}/approval-reject`).set(as(who)).send({ reason });
const load = (cid) => ExpenseClaim.findById(cid).lean();
const pendingOf = async (who) => (await request(app).get('/api/expense/approvals?status=PENDING').set(as(who))).body;
const decidedOf = async (who) => (await request(app).get('/api/expense/approvals?status=DECIDED').set(as(who))).body;
const setHead = (who, employeeId, headers = {}) => request(app).put('/api/expense/finance-head').set({ ...as(who), ...headers }).send({ employeeId });

// ── A. CFO / Finance Head setting (Expense Management page) ─────────────────
it('A1. HR Admin sees the setting read-only, cannot change it; employees cannot see it', async () => {
  let r = await request(app).get('/api/expense/finance-head').set(as('hr'));
  assert.equal(r.status, 200);
  assert.equal(r.body.data, null);
  assert.equal(r.body.canEdit, false);
  r = await setHead('hr', String(ids.cfo));
  assert.equal(r.status, 403);
  r = await request(app).get('/api/expense/finance-head').set(as('emp'));
  assert.equal(r.status, 403);
  r = await setHead('emp', String(ids.cfo));
  assert.equal(r.status, 403);
});

it('A2. Company Admin adds the CFO; HR Admin then sees only the name; other-company employee rejected', async () => {
  let r = await setHead('admin', String(U.outsider._id));
  assert.equal(r.status, 422, 'employee of another company cannot be Finance Head');
  r = await setHead('admin', String(ids.cfo));
  assert.equal(r.status, 200);
  assert.equal(r.body.data.name, 'Chitra CFO');
  r = await request(app).get('/api/expense/finance-head').set(as('hr'));
  assert.equal(r.body.data.name, 'Chitra CFO');
  assert.equal(r.body.canEdit, false);
});

it('A3. Super Admin (company picked by x-company-id) changes / removes; still only one per company', async () => {
  const hdr = { 'x-company-id': String(companyId) };
  let r = await setHead('superadmin', String(ids.cfo2), hdr);
  assert.equal(r.status, 200);
  assert.equal(r.body.data.name, 'Farhan Finance Head');
  assert.equal(await ExpenseFinanceHead.countDocuments({ companyId }), 1);
  r = await setHead('superadmin', null, hdr);
  assert.equal(r.status, 200);
  assert.equal(r.body.data, null);
  assert.equal(await ExpenseFinanceHead.countDocuments({ companyId }), 0);
  r = await setHead('superadmin', String(ids.cfo), hdr);
  assert.equal(r.body.data.name, 'Chitra CFO');
  assert.equal(await ExpenseFinanceHead.countDocuments({ companyId }), 1);
});

// ── B. Stock Purchase: RM approve -> CFO approve -> Accounts ────────────────
let spClaimId;
it('B1. Stock Purchase submit goes to the Reporting Manager (1st approval), CFO not involved yet', async () => {
  const c = await submit('emp');
  spClaimId = c._id;
  const db = await load(spClaimId);
  assert.equal(db.status, 'APPROVAL_PENDING');
  assert.equal(String(db.managerApproval.approver), String(ids.rm));
  assert.equal(db.managerApproval.status, 'PENDING');
  assert.equal(db.financeApproval.status, 'NOT_REQUIRED');
  assert.equal((await pendingOf('cfo')).data.length, 0, 'CFO has nothing yet');
  assert.equal((await pendingOf('rm')).data.length, 1);
  const r = await approve('cfo', spClaimId);
  assert.equal(r.status, 404, 'CFO cannot even see / decide it before the RM approves');
  const pay = await request(app).post(`/api/expense/claims/${spClaimId}/payment`).set(as('accounts')).send({ paidAmount: 5000 });
  assert.equal(pay.status >= 400, true, 'Accounts cannot pay before approvals');
});

it('B2. RM approves -> claim moves to CFO (2nd approval), still hidden from Accounts', async () => {
  const r = await approve('rm', spClaimId, 'Looks fine');
  assert.equal(r.status, 200);
  assert.equal(r.body.data.status, 'APPROVAL_PENDING');
  assert.equal(r.body.data.financeApproval.status, 'PENDING');
  const db = await load(spClaimId);
  assert.equal(db.managerApproval.status, 'APPROVED');
  assert.equal(String(db.financeApproval.approver), String(ids.cfo));
  assert.equal(db.financeApproval.approverName, 'Chitra CFO');

  assert.equal((await approve('rm', spClaimId)).status, 403, 'RM cannot approve twice / give the 2nd approval');
  assert.equal((await pendingOf('rm')).data.length, 0, 'gone from RM pending');
  const rmHist = await decidedOf('rm');
  assert.equal(rmHist.data.length, 1);
  assert.equal(rmHist.data[0].financeApproval.status, 'PENDING', 'RM history shows awaiting 2nd approval');

  const cfoPending = await pendingOf('cfo');
  assert.equal(cfoPending.data.length, 1);
  assert.equal(cfoPending.pendingCount, 1);
  assert.equal(cfoPending.isApprover, true);
  assert.equal(cfoPending.data[0].myApprovalStage, 'FINANCE');
  assert.equal(cfoPending.data[0].permissions.canApprove, true);
  assert.equal(cfoPending.data[0].permissions.approvalStage, 'FINANCE');

  const pay = await request(app).post(`/api/expense/claims/${spClaimId}/payment`).set(as('accounts')).send({ paidAmount: 5000 });
  assert.equal(pay.status >= 400, true, 'Accounts still cannot pay');
  const reports = await request(app).get('/api/expense/accounts/pending').set(as('accounts'));
  const inQueue = (reports.body.data || []).some((c) => String(c._id) === String(spClaimId));
  assert.equal(inQueue, false, 'not in the Accounts queue during 2nd approval');
});

it('B3. Claim detail: CFO can decide, RM can view but not decide', async () => {
  const cfo = await request(app).get(`/api/expense/claims/${spClaimId}`).set(as('cfo'));
  assert.equal(cfo.status, 200);
  assert.equal(cfo.body.data.permissions.canApprove, true);
  const rm = await request(app).get(`/api/expense/claims/${spClaimId}`).set(as('rm'));
  assert.equal(rm.status, 200);
  assert.equal(rm.body.data.permissions.canApprove, false);
  assert.equal(rm.body.data.financeApproval.approver.name, 'Chitra CFO');
});

it('B4. CFO approves -> Accounts pending -> Accounts approves (Step 1) -> Accounts marks Paid (Step 2)', async () => {
  const r = await approve('cfo', spClaimId, 'Approved by finance');
  assert.equal(r.status, 200);
  let db = await load(spClaimId);
  assert.equal(db.status, 'SUBMITTED');
  assert.equal(db.financeApproval.status, 'APPROVED');
  assert.equal(db.financeApproval.remarks, 'Approved by finance');
  assert.equal(db.managerApproval.status, 'APPROVED');
  assert.equal((await pendingOf('cfo')).data.length, 0);
  assert.equal((await decidedOf('cfo')).data.length, 1);

  // Calling payment before Step 1 Accounts Approval must return 409
  const earlyPay = await request(app).post(`/api/expense/claims/${spClaimId}/payment`).set(as('accounts')).send({ paidAmount: 5000, paymentDate: '2026-11-05' });
  assert.equal(earlyPay.status, 409);

  // Step 1: Accounts Admin approves claim
  const accApp = await request(app).post(`/api/expense/claims/${spClaimId}/accounts-approve`).set(as('accounts')).send({ remarks: 'Verified bills' });
  assert.equal(accApp.status, 200, JSON.stringify(accApp.body));
  db = await load(spClaimId);
  assert.equal(db.status, 'ACCOUNTS_APPROVED');
  assert.equal(db.accountsApproval.status, 'APPROVED');
  assert.equal(db.paymentStatus, 'AWAITING_DISBURSEMENT');

  // Step 2: Accounts Admin marks Paid with payment date, remark, and payment confirmation proof
  const pay = await request(app).post(`/api/expense/claims/${spClaimId}/payment`).set(as('accounts')).send({
    paidAmount: 5000,
    paymentDate: '2026-11-05',
    remarks: 'Paid via NEFT',
    paymentProof: { name: 'neft.jpg', url: 'https://res.cloudinary.com/demo/neft.jpg', type: 'image/jpeg' },
  });
  assert.equal(pay.status, 200, JSON.stringify(pay.body));
  db = await load(spClaimId);
  assert.equal(db.status, 'PAID');
  assert.equal(db.paymentProofs.length, 1);
  assert.equal(db.paymentProofs[0].url, 'https://res.cloudinary.com/demo/neft.jpg');
  assert.equal(db.disbursement.remarks, 'Paid via NEFT');
});

// ── C. Full Payment: CFO rejects ────────────────────────────────────────────
let fpClaimId;
it('C1. Full Payment claim: RM approves -> CFO; full payment not approved yet', async () => {
  const c = await submit('emp', { expenseType: 'OTHER', otherSubType: 'NORMAL', materialName: undefined, barcodeNumber: undefined, quantity: undefined, requestedAmount: 3000, fullPayment: { requested: true, reason: 'Client asked for urgent work' } });
  fpClaimId = c._id;
  let db = await load(fpClaimId);
  assert.equal(db.status, 'APPROVAL_PENDING');
  assert.equal(db.managerApproval.kind, 'FULL_PAYMENT');
  assert.equal(db.fullPayment.status, 'PENDING');
  assert.equal(String(db.managerApproval.approver), String(ids.rm));
  assert.equal((await approve('rm', fpClaimId)).status, 200);
  db = await load(fpClaimId);
  assert.equal(db.status, 'APPROVAL_PENDING');
  assert.equal(db.financeApproval.status, 'PENDING');
  assert.equal(db.fullPayment.status, 'PENDING', 'full payment only approved after the CFO');
});

it('C2. CFO rejects -> claim Rejected; RM decision kept; full payment rejected', async () => {
  const r = await reject('cfo', fpClaimId, 'Budget not available');
  assert.equal(r.status, 200);
  const db = await load(fpClaimId);
  assert.equal(db.status, 'REJECTED');
  assert.equal(db.financeApproval.status, 'REJECTED');
  assert.equal(db.financeApproval.remarks, 'Budget not available');
  assert.equal(db.managerApproval.status, 'APPROVED');
  assert.equal(db.fullPayment.status, 'REJECTED');
  assert.equal(db.rejection.reason, 'Budget not available');
  assert.equal((await approve('cfo', fpClaimId)).status >= 400, true, 'cannot approve after rejection');
});

it('C3. Admin reopens -> back to RM; RM approves -> CFO again; CFO approves full payment', async () => {
  let r = await request(app).post(`/api/expense/claims/${fpClaimId}/reopen`).set(as('admin')).send({ reason: 'Budget released' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  let db = await load(fpClaimId);
  assert.equal(db.status, 'APPROVAL_PENDING');
  assert.equal(db.managerApproval.status, 'PENDING');
  assert.equal(db.financeApproval.status, 'NOT_REQUIRED');
  assert.equal((await approve('rm', fpClaimId)).status, 200);
  assert.equal((await load(fpClaimId)).financeApproval.status, 'PENDING');
  r = await approve('cfo', fpClaimId);
  assert.equal(r.status, 200);
  db = await load(fpClaimId);
  assert.equal(db.status, 'SUBMITTED');
  assert.equal(db.fullPayment.status, 'APPROVED');
  assert.equal(db.fullPayment.decidedByName, 'Chitra CFO');
  assert.equal(db.payableAmount, db.grandRequested);
});

// ── D. RM rejects: CFO never involved ───────────────────────────────────────
it('D. RM rejects a Stock Purchase claim -> Rejected, never reaches CFO', async () => {
  const c = await submit('emp');
  assert.equal((await reject('rm', c._id)).status, 200);
  const db = await load(c._id);
  assert.equal(db.status, 'REJECTED');
  assert.equal(db.managerApproval.status, 'REJECTED');
  assert.equal(db.financeApproval.status, 'NOT_REQUIRED');
  assert.equal((await pendingOf('cfo')).data.length, 0);
});

// ── E. Tagging: RM tagged -> manager above gives the 1st approval ───────────
it('E. Reporting Manager tagged on the claim -> GM (above) approves 1st, then CFO', async () => {
  const c = await submit('emp', { numberOfEmployees: 2, employeeIds: ['self', String(ids.rm)] });
  let db = await load(c._id);
  assert.equal(String(db.managerApproval.approver), String(ids.gm), 'escalated to the manager above the tagged RM');
  assert.equal((await approve('rm', c._id)).status >= 400, true, 'tagged RM cannot approve');
  assert.equal((await approve('gm', c._id)).status, 200);
  db = await load(c._id);
  assert.equal(db.financeApproval.status, 'PENDING');
  assert.equal(String(db.financeApproval.approver), String(ids.cfo));
  assert.equal((await approve('cfo', c._id)).status, 200);
  assert.equal((await load(c._id)).status, 'SUBMITTED');
});

// ── F. Other expense (no full payment): unchanged single approval ──────────
it('F. Other expense without full payment: RM approval -> Accounts directly (no CFO)', async () => {
  const c = await submit('emp', { expenseType: 'OTHER', otherSubType: 'NORMAL', materialName: undefined, barcodeNumber: undefined, quantity: undefined, requestedAmount: 900 });
  const db0 = await load(c._id);
  assert.equal(db0.status, 'APPROVAL_PENDING');
  assert.equal((await approve('rm', c._id)).status, 200);
  const db = await load(c._id);
  assert.equal(db.status, 'SUBMITTED');
  assert.equal(db.financeApproval.status, 'NOT_REQUIRED');
});

// ── G/H. CFO on the claim: 2nd approval skipped ─────────────────────────────
it('G. CFO submits own Stock Purchase -> after 1st approval goes to Accounts (no self approval)', async () => {
  const c = await submit('cfo');
  const db0 = await load(c._id);
  assert.equal(db0.status, 'APPROVAL_PENDING');
  const first = String(db0.managerApproval.approver);
  const who = Object.keys(U).find((k) => String(U[k]._id) === first);
  assert.ok(who, 'has a 1st approver');
  assert.equal((await approve(who, c._id)).status, 200);
  const db = await load(c._id);
  assert.equal(db.status, 'SUBMITTED');
  assert.equal(db.financeApproval.status, 'NOT_REQUIRED');
});

it('H. CFO tagged on the claim -> 2nd approval skipped', async () => {
  const c = await submit('emp', { numberOfEmployees: 2, employeeIds: ['self', String(ids.cfo)] });
  const db0 = await load(c._id);
  const first = Object.keys(U).find((k) => String(U[k]._id) === String(db0.managerApproval.approver));
  assert.equal((await approve(first, c._id)).status, 200);
  const db = await load(c._id);
  assert.equal(db.status, 'SUBMITTED');
  assert.equal(db.financeApproval.status, 'NOT_REQUIRED');
});

// ── K. Admin override at the 2nd approval ───────────────────────────────────
it('K. Company Admin can give / reject the 2nd approval as override', async () => {
  const c = await submit('emp');
  await approve('rm', c._id);
  assert.equal((await load(c._id)).financeApproval.status, 'PENDING');
  assert.equal((await approve('admin', c._id, 'Admin override')).status, 200);
  let db = await load(c._id);
  assert.equal(db.status, 'SUBMITTED');
  assert.equal(db.financeApproval.status, 'APPROVED');

  const c2 = await submit('emp');
  await approve('rm', c2._id);
  assert.equal((await reject('admin', c2._id, 'Admin reject')).status, 200);
  db = await load(c2._id);
  assert.equal(db.status, 'REJECTED');
  assert.equal(db.financeApproval.status, 'REJECTED');
  assert.equal(db.managerApproval.status, 'APPROVED');
});

// ── I. No Finance Head configured: old behaviour ────────────────────────────
it('I. No CFO configured -> RM approval sends Stock Purchase straight to Accounts', async () => {
  await setHead('admin', null);
  const c = await submit('emp');
  assert.equal((await approve('rm', c._id)).status, 200);
  const db = await load(c._id);
  assert.equal(db.status, 'SUBMITTED');
  assert.equal(db.financeApproval.status, 'NOT_REQUIRED');
  await setHead('admin', String(ids.cfo));
});

// ── J. Changing the CFO: new requests go to the new CFO ─────────────────────
it('J. After the CFO is changed, new 2nd approvals go to the new Finance Head', async () => {
  await setHead('admin', String(ids.cfo2));
  const c = await submit('emp2');
  await approve('rm', c._id);
  const db = await load(c._id);
  assert.equal(String(db.financeApproval.approver), String(ids.cfo2));
  assert.equal((await approve('cfo', c._id)).status >= 400, true, 'old CFO cannot approve');
  assert.equal((await approve('cfo2', c._id)).status, 200);
  await setHead('admin', String(ids.cfo));
});

// ── L. Strict Company-Wise Isolation (Company A vs Company B) ───────────────
it('L1. Company B has its own independent CFO / Finance Head; admins cannot cross companies', async () => {
  // Initially Company B has no CFO configured even though Company A has Chitra CFO
  let r = await request(app).get('/api/expense/finance-head').set(as('bHr'));
  assert.equal(r.status, 200);
  assert.equal(r.body.data, null, 'Company B must not see Company A CFO');
  assert.equal(r.body.companyId, String(otherCompanyId));

  // Even if Company B Admin passes x-company-id of Company A, they stay locked to Company B
  r = await request(app)
    .get(`/api/expense/finance-head?companyId=${companyId}`)
    .set({ ...as('bAdmin'), 'x-company-id': String(companyId) });
  assert.equal(r.status, 200);
  assert.equal(r.body.data, null);
  assert.equal(r.body.companyId, String(otherCompanyId));

  // Company B Admin cannot pick Company A's employee as Company B's CFO
  r = await setHead('bAdmin', String(ids.cfo));
  assert.equal(r.status, 422);

  // Company B Admin sets Company B's own CFO (Brijesh CoB CFO)
  r = await setHead('bAdmin', String(ids.bCfo));
  assert.equal(r.status, 200);
  assert.equal(r.body.data.name, 'Brijesh CoB CFO');

  // Company A still has Chitra CFO, and Company B has Brijesh CoB CFO
  const rA = await request(app).get('/api/expense/finance-head').set(as('hr'));
  const rB = await request(app).get('/api/expense/finance-head').set(as('bHr'));
  assert.equal(rA.body.data.name, 'Chitra CFO');
  assert.equal(rB.body.data.name, 'Brijesh CoB CFO');
});

it('L2. Claims in Company A and Company B route strictly to their own company CFO and cannot be crossed', async () => {
  // Company B employee submits a Stock Purchase claim
  const claimB = await submit('bEmp');
  const claimA = await submit('emp');

  // Company A's RM or Admin cannot view or approve Company B's claim
  assert.equal((await request(app).get(`/api/expense/claims/${claimB._id}`).set(as('admin'))).status, 403);
  assert.equal((await approve('admin', claimB._id)).status, 404);

  // Company B's RM approves claimB -> goes to Company B's CFO (Brijesh), NOT Company A's CFO (Chitra)
  assert.equal((await approve('bRm', claimB._id)).status, 200);
  const dbB = await load(claimB._id);
  assert.equal(dbB.financeApproval.status, 'PENDING');
  assert.equal(String(dbB.financeApproval.approver), String(ids.bCfo));

  // Company A's RM approves claimA -> goes to Company A's CFO (Chitra), NOT Company B's CFO (Brijesh)
  assert.equal((await approve('rm', claimA._id)).status, 200);
  const dbA = await load(claimA._id);
  assert.equal(dbA.financeApproval.status, 'PENDING');
  assert.equal(String(dbA.financeApproval.approver), String(ids.cfo));

  // Each CFO sees ONLY their own company's pending 2nd approval
  const cfoAPending = await pendingOf('cfo');
  const cfoBPending = await pendingOf('bCfo');
  assert.equal(cfoAPending.data.length, 1);
  assert.equal(String(cfoAPending.data[0]._id), String(claimA._id));
  assert.equal(cfoBPending.data.length, 1);
  assert.equal(String(cfoBPending.data[0]._id), String(claimB._id));

  // Company A CFO cannot approve Company B claim, and vice-versa
  assert.equal((await approve('cfo', claimB._id)).status, 404);
  assert.equal((await approve('bCfo', claimA._id)).status, 404);

  // Each CFO approves their own company's claim -> both reach SUBMITTED
  assert.equal((await approve('cfo', claimA._id)).status, 200);
  assert.equal((await approve('bCfo', claimB._id)).status, 200);
  assert.equal((await load(claimA._id)).status, 'SUBMITTED');
  assert.equal((await load(claimB._id)).status, 'SUBMITTED');
});

it('L3. Expense Management levels, designations, and grades endpoints are strictly company-wise', async () => {
  const lvlA = await Level.create({ name: 'Team Lead CoA', code: 'L7_COA', levelNumber: 7, category: 'STAFF', companyId, company: companyId });
  const lvlB = await Level.create({ name: 'Zone Director CoB', code: 'L3_COB', levelNumber: 3, category: 'MANAGEMENT', companyId: otherCompanyId, company: otherCompanyId });
  await Designation.create({ name: 'Lead Engineer CoA', level: lvlA._id, companyId });
  await Designation.create({ name: 'Regional Head CoB', level: lvlB._id, companyId: otherCompanyId });
  await Grade.create({ name: 'G1-CoA', code: 'g1a', companyId, company: companyId });
  await Grade.create({ name: 'G9-CoB', code: 'g9b', companyId: otherCompanyId, company: otherCompanyId });

  // Company A admin / HR fetches /api/expense/levels and /api/expense/grades
  const lvlsARes = await request(app).get('/api/expense/levels').set(as('hr'));
  assert.equal(lvlsARes.status, 200);
  assert.deepEqual(lvlsARes.body.data.map(l => l.name), ['Team Lead CoA']);
  assert.deepEqual(lvlsARes.body.designations.map(d => d.name), ['Lead Engineer CoA']);
  assert.equal(lvlsARes.body.employeeDesignations.some(ed => ed.name === 'Ops Manager'), false, 'Must not include Company B employee designations');

  const gradesARes = await request(app).get('/api/expense/grades').set(as('hr'));
  assert.equal(gradesARes.status, 200);
  assert.deepEqual(gradesARes.body.data.map(g => g.name), ['G1-CoA']);

  // Company B admin / HR fetches /api/expense/levels and /api/expense/grades
  const lvlsBRes = await request(app).get('/api/expense/levels').set(as('bHr'));
  assert.equal(lvlsBRes.status, 200);
  assert.deepEqual(lvlsBRes.body.data.map(l => l.name), ['Zone Director CoB']);
  assert.deepEqual(lvlsBRes.body.designations.map(d => d.name), ['Regional Head CoB']);
  assert.equal(lvlsBRes.body.employeeDesignations.some(ed => ed.name === 'Sales Manager'), false, 'Must not include Company A employee designations');

  const gradesBRes = await request(app).get('/api/expense/grades').set(as('bHr'));
  assert.equal(gradesBRes.status, 200);
  assert.deepEqual(gradesBRes.body.data.map(g => g.name), ['G9-CoB']);
});

// ── M. Approval Priority (Full Payment > Stock Purchase > Other) & No Limit on Stock Purchase ──
it('M1. Stock Purchase ignores directAccountLimit / approvalLimitRules; priority is Full Payment > Stock Purchase > Other', async () => {
  const ExpensePolicy = require('../models/ExpensePolicy');
  const rules = require('../services/claimRules');

  // 1. Unit-level check on approvalKindFor with directLimit = 500
  assert.equal(
    rules.approvalKindFor(
      { claimMode: 'NORMAL', expenseType: 'OTHER', requestedAmount: 200, entries: [{ expenseType: 'OTHER', requestedAmount: 200 }] },
      { directLimit: 500 }
    ),
    'NONE',
    'OTHER within payment limit routes directly to Accounts (NONE)'
  );
  assert.equal(
    rules.approvalKindFor(
      { claimMode: 'NORMAL', expenseType: 'STOCK_PURCHASE', requestedAmount: 200, entries: [{ expenseType: 'STOCK_PURCHASE', requestedAmount: 200 }] },
      { directLimit: 500 }
    ),
    'OTHER_EXPENSE',
    'STOCK_PURCHASE must ignore directLimit and always require approval'
  );
  assert.equal(
    rules.approvalKindFor(
      {
        claimMode: 'NORMAL',
        expenseType: 'OTHER',
        requestedAmount: 400,
        entries: [
          { expenseType: 'OTHER', requestedAmount: 200 },
          { expenseType: 'STOCK_PURCHASE', requestedAmount: 200 },
        ],
      },
      { directLimit: 500 }
    ),
    'OTHER_EXPENSE',
    'Combined OTHER + STOCK_PURCHASE takes Stock Purchase priority and requires approval even when under directLimit'
  );
  assert.equal(
    rules.approvalKindFor(
      {
        claimMode: 'NORMAL',
        expenseType: 'STOCK_PURCHASE',
        requestedAmount: 200,
        fullPayment: { requested: true, reason: 'Full payment takes 1st priority' },
        entries: [
          { expenseType: 'OTHER', requestedAmount: 100 },
          { expenseType: 'STOCK_PURCHASE', requestedAmount: 100 },
        ],
      },
      { directLimit: 500 }
    ),
    'FULL_PAYMENT',
    'Full Payment always takes 1st priority over Stock Purchase and Other'
  );

  // 2. End-to-end check with active policy approvalLimitRules (limit = ₹500)
  await ExpensePolicy.updateMany(
    { companyId },
    { $set: { approvalLimitRules: [{ roleName: 'Team Lead', maxAmount: 500, levelNumber: 7, status: 'active' }] } }
  );

  // 2a. OTHER claim of ₹200 (within ₹500 limit) -> goes directly to Accounts (SUBMITTED)
  const otherWithin = await submit('emp', {
    expenseType: 'OTHER',
    otherSubType: 'NORMAL',
    materialName: undefined,
    barcodeNumber: undefined,
    quantity: undefined,
    requestedAmount: 200,
  });
  assert.equal((await load(otherWithin._id)).status, 'SUBMITTED', 'OTHER <= ₹500 goes directly to Accounts');

  // 2b. STOCK_PURCHASE claim of ₹200 (even though <= ₹500) -> goes to RM (1st) -> CFO (2nd) -> Accounts
  const spSmall = await submit('emp', {
    expenseType: 'STOCK_PURCHASE',
    requestedAmount: 200,
    materialName: 'Small connector',
    barcodeNumber: 'BC-SMALL-1',
    quantity: '2 pcs',
  });
  let dbSp = await load(spSmall._id);
  assert.equal(dbSp.status, 'APPROVAL_PENDING', 'STOCK_PURCHASE must never skip approval based on payment limit');
  assert.equal((await approve('rm', spSmall._id)).status, 200);
  dbSp = await load(spSmall._id);
  assert.equal(dbSp.status, 'APPROVAL_PENDING');
  assert.equal(dbSp.financeApproval.status, 'PENDING', 'STOCK_PURCHASE routes to CFO for 2nd approval');
  assert.equal((await approve('cfo', spSmall._id)).status, 200);
  assert.equal((await load(spSmall._id)).status, 'SUBMITTED');

  // 2c. Combined OTHER (₹150) + STOCK_PURCHASE (₹150) without Full Payment -> Stock Purchase priority (2-step approval)
  const mixed = await submit('emp', {
    expenseType: 'OTHER',
    requestedAmount: 300,
    entries: [
      {
        expenseType: 'OTHER',
        otherSubType: 'NORMAL',
        requestedAmount: 150,
        remark: 'Misc stationery item for site work',
        receipts: [receipt('other.jpg')],
      },
      {
        expenseType: 'STOCK_PURCHASE',
        materialName: 'Switch gear',
        barcodeNumber: 'BC-MIX-2',
        quantity: '1 unit',
        requestedAmount: 150,
        remark: 'Stock purchase switch gear for site',
        receipts: [receipt('sp.jpg')],
      },
    ],
  });
  let dbMix = await load(mixed._id);
  assert.equal(dbMix.status, 'APPROVAL_PENDING');
  assert.equal((await approve('rm', mixed._id)).status, 200);
  dbMix = await load(mixed._id);
  assert.equal(dbMix.financeApproval.status, 'PENDING', 'Mixed OTHER + STOCK_PURCHASE follows Stock Purchase 2-step flow');
  assert.equal((await approve('cfo', mixed._id)).status, 200);
  assert.equal((await load(mixed._id)).status, 'SUBMITTED');
});

// ── N. 2-Step Accounts Admin Workflow & Super Admin Reject Rule ─────────────
it('N1. 2-step Accounts Admin workflow: Step 1 Approve/Reject -> Step 2 Mark Paid; after Step 1 only Super Admin can reject', async () => {
  // 1. Submit a direct-to-Accounts claim (OTHER <= 500)
  const claim = await submit('emp', {
    expenseType: 'OTHER',
    otherSubType: 'NORMAL',
    materialName: undefined,
    barcodeNumber: undefined,
    quantity: undefined,
    requestedAmount: 250,
  });
  let db = await load(claim._id);
  assert.equal(db.status, 'SUBMITTED');

  // 2. Check permissions at Step 1 (SUBMITTED): Accounts can approve or reject, cannot mark paid yet
  const detailStep1 = await request(app).get(`/api/expense/claims/${claim._id}`).set(as('accounts'));
  assert.equal(detailStep1.status, 200);
  assert.equal(detailStep1.body.data.permissions.canAccountsApprove, true);
  assert.equal(detailStep1.body.data.permissions.canReject, true);
  assert.equal(detailStep1.body.data.permissions.canMarkPaid, false);

  // 3. Step 1: Accounts Admin approves the claim (missing remark must return 422)
  const missingRemarkApprove = await request(app)
    .post(`/api/expense/claims/${claim._id}/accounts-approve`)
    .set(as('accounts'))
    .send({ remarks: '' });
  assert.equal(missingRemarkApprove.status, 422);

  const step1Approve = await request(app)
    .post(`/api/expense/claims/${claim._id}/accounts-approve`)
    .set(as('accounts'))
    .send({ remarks: 'Accounts Step 1 approved' });
  assert.equal(step1Approve.status, 200);
  db = await load(claim._id);
  assert.equal(db.status, 'ACCOUNTS_APPROVED');
  assert.equal(db.accountsApproval.status, 'APPROVED');
  assert.equal(db.accountsApproval.remarks, 'Accounts Step 1 approved');
  assert.equal(db.paymentStatus, 'AWAITING_DISBURSEMENT');

  // Step 2 validation checks: missing paymentDate, missing remarks, or missing paymentProof must return 422
  const missingDatePay = await request(app)
    .post(`/api/expense/claims/${claim._id}/payment`)
    .set(as('accounts'))
    .send({ paidAmount: 250, remarks: 'Paid', paymentProof: { name: 'p.jpg', url: 'https://res.cloudinary.com/demo/p.jpg' } });
  assert.equal(missingDatePay.status, 422);

  const missingRemarkPay = await request(app)
    .post(`/api/expense/claims/${claim._id}/payment`)
    .set(as('accounts'))
    .send({ paidAmount: 250, paymentDate: '2026-11-05', paymentProof: { name: 'p.jpg', url: 'https://res.cloudinary.com/demo/p.jpg' } });
  assert.equal(missingRemarkPay.status, 422);

  const missingProofPay = await request(app)
    .post(`/api/expense/claims/${claim._id}/payment`)
    .set(as('accounts'))
    .send({ paidAmount: 250, paymentDate: '2026-11-05', remarks: 'Paid' });
  assert.equal(missingProofPay.status, 422);

  // 4. Check permissions at Step 2 (ACCOUNTS_APPROVED):
  // - Accounts Admin has canMarkPaid = true, canReject = false, canAccountsApprove = false
  const accDetailStep2 = await request(app).get(`/api/expense/claims/${claim._id}`).set(as('accounts'));
  assert.equal(accDetailStep2.body.data.permissions.canAccountsApprove, false);
  assert.equal(accDetailStep2.body.data.permissions.canMarkPaid, true);
  assert.equal(accDetailStep2.body.data.permissions.canReject, false, 'Accounts Admin must NOT see reject button after ACCOUNTS_APPROVED');

  // - Company Admin also has canReject = false after ACCOUNTS_APPROVED
  const adminDetailStep2 = await request(app).get(`/api/expense/claims/${claim._id}`).set(as('admin'));
  assert.equal(adminDetailStep2.body.data.permissions.canReject, false, 'Company Admin must NOT see reject button after ACCOUNTS_APPROVED');

  // - Super Admin has canReject = true after ACCOUNTS_APPROVED
  const saDetailStep2 = await request(app)
    .get(`/api/expense/claims/${claim._id}`)
    .set({ ...as('superadmin'), 'x-company-id': String(companyId) });
  assert.equal(saDetailStep2.body.data.permissions.canReject, true, 'Super Admin CAN see reject button after ACCOUNTS_APPROVED');

  // 5. Accounts Admin & Company Admin attempting to reject after ACCOUNTS_APPROVED must get 403
  const accRejectAttempt = await request(app)
    .post(`/api/expense/claims/${claim._id}/reject`)
    .set(as('accounts'))
    .send({ reason: 'Trying to reject after approval' });
  assert.equal(accRejectAttempt.status, 403);

  const adminRejectAttempt = await request(app)
    .post(`/api/expense/claims/${claim._id}/reject`)
    .set(as('admin'))
    .send({ reason: 'Company Admin trying to reject after approval' });
  assert.equal(adminRejectAttempt.status, 403);

  // 6. Super Admin CAN reject an ACCOUNTS_APPROVED claim
  const saReject = await request(app)
    .post(`/api/expense/claims/${claim._id}/reject`)
    .set({ ...as('superadmin'), 'x-company-id': String(companyId) })
    .send({ reason: 'Super Admin override rejection before disbursement' });
  assert.equal(saReject.status, 200);
  db = await load(claim._id);
  assert.equal(db.status, 'REJECTED');
  assert.equal(db.accountsApproval.status, 'REJECTED');
});

// ── O. Dynamic Pay Limit Set or Not & Selectable CFO Approval per Claim Type ──
it('O1. Pay Limit Set or Not applies only to selected claim types; CFO Approval applies only to selected claim types', async () => {
  const rules = require('../services/claimRules');
  const { needsFinanceApproval } = require('../services/financeApprovalService');

  // 1. Unit checks for Pay Limit Set or Not (payLimitConfig)
  // When TRAVEL has Pay Limit ON (directLimit = 500):
  // - TRAVEL ₹300 <= ₹500 -> NONE (Direct to Accounts)
  // - TRAVEL ₹800 > ₹500 -> OTHER_EXPENSE (Requires Reporting Manager approval)
  assert.equal(
    rules.approvalKindFor(
      { claimMode: 'NORMAL', expenseType: 'TRAVEL', requestedAmount: 300, entries: [{ expenseType: 'TRAVEL', requestedAmount: 300 }] },
      { directLimit: 500, payLimitConfig: { enabled: true, applicableClaimTypes: ['OTHER', 'TRAVEL'] } }
    ),
    'NONE'
  );
  assert.equal(
    rules.approvalKindFor(
      { claimMode: 'NORMAL', expenseType: 'TRAVEL', requestedAmount: 800, entries: [{ expenseType: 'TRAVEL', requestedAmount: 800 }] },
      { directLimit: 500, payLimitConfig: { enabled: true, applicableClaimTypes: ['OTHER', 'TRAVEL'] } }
    ),
    'OTHER_EXPENSE'
  );
  // When TRAVEL has Pay Limit OFF: TRAVEL ₹800 does NOT trigger Pay Limit approval
  assert.equal(
    rules.approvalKindFor(
      { claimMode: 'NORMAL', expenseType: 'TRAVEL', requestedAmount: 800, entries: [{ expenseType: 'TRAVEL', requestedAmount: 800 }] },
      { directLimit: 500, payLimitConfig: { enabled: true, applicableClaimTypes: ['OTHER'] } }
    ),
    'NONE'
  );

  // 2. Unit checks for Selectable CFO Approval (cfoApprovalConfig)
  assert.equal(
    needsFinanceApproval(
      { claimType: 'OTHER', employeeClaims: [{ items: [{ expenseType: 'OTHER' }] }] },
      { cfoApprovalConfig: { enabled: true, applyOnFullPayment: true, applicableClaimTypes: ['OTHER'] } }
    ),
    true,
    'OTHER requires CFO approval when selected in applicableClaimTypes'
  );
  assert.equal(
    needsFinanceApproval(
      { claimType: 'STOCK_PURCHASE', employeeClaims: [{ items: [{ expenseType: 'STOCK_PURCHASE' }] }] },
      { cfoApprovalConfig: { enabled: true, applyOnFullPayment: true, applicableClaimTypes: ['OTHER'] } }
    ),
    false,
    'STOCK_PURCHASE does NOT require CFO approval when deselected from applicableClaimTypes'
  );

  // 3. End-to-end check via PUT /api/expense/finance-head (rulesOnly: true)
  const updRes = await request(app)
    .put('/api/expense/finance-head')
    .set(as('admin'))
    .send({
      rulesOnly: true,
      cfoApprovalConfig: {
        enabled: true,
        applyOnFullPayment: true,
        applicableClaimTypes: ['OTHER'],
      },
    });
  assert.equal(updRes.status, 200);
  assert.deepEqual(updRes.body.cfoApprovalConfig.applicableClaimTypes, ['OTHER']);

  // Now submit an OTHER claim (₹900 > ₹500 limit) -> RM approves -> routes to CFO because OTHER is selected for CFO approval!
  const otherCfoClaim = await submit('emp', {
    expenseType: 'OTHER',
    otherSubType: 'NORMAL',
    materialName: undefined,
    barcodeNumber: undefined,
    quantity: undefined,
    requestedAmount: 900,
  });
  assert.equal((await load(otherCfoClaim._id)).status, 'APPROVAL_PENDING');
  assert.equal((await approve('rm', otherCfoClaim._id)).status, 200);
  let dbOther = await load(otherCfoClaim._id);
  assert.equal(dbOther.status, 'APPROVAL_PENDING');
  assert.equal(dbOther.financeApproval.status, 'PENDING', 'OTHER claim now routes to CFO because OTHER was selected');
  assert.equal((await approve('cfo', otherCfoClaim._id)).status, 200);
  assert.equal((await load(otherCfoClaim._id)).status, 'SUBMITTED');

  // Restore default CFO config (['STOCK_PURCHASE'])
  await request(app)
    .put('/api/expense/finance-head')
    .set(as('admin'))
    .send({
      rulesOnly: true,
      cfoApprovalConfig: {
        enabled: true,
        applyOnFullPayment: true,
        applicableClaimTypes: ['STOCK_PURCHASE'],
      },
    });
});

it('P. Edit lock after 1st applicable approval (Reporting Manager or Direct-to-Accounts)', async () => {
  const access = require('../services/expenseAccess');
  const reqEmp = { user: { _id: ids.emp, companyId: ids.company, role: 'employee' } };

  // 1. Claim requiring Reporting Manager (1st) approval -> editable while managerApproval.status === 'PENDING'
  const rmPendingClaim = {
    companyId: ids.company,
    submittedBy: ids.emp,
    status: 'APPROVAL_PENDING',
    managerApproval: { kind: 'OTHER_EXPENSE', status: 'PENDING', approver: ids.rm },
    financeApproval: { status: 'NOT_REQUIRED' },
  };
  assert.equal(access.claimPermissions(reqEmp, rmPendingClaim).canEdit, true, 'Editable before RM approves');

  // 2. Once RM approves and claim moves to CFO (2nd approval) -> NOT editable
  const cfoPendingClaim = {
    ...rmPendingClaim,
    managerApproval: { kind: 'OTHER_EXPENSE', status: 'APPROVED', approver: ids.rm, decidedAt: new Date() },
    financeApproval: { status: 'PENDING', approver: ids.cfo },
  };
  assert.equal(access.claimPermissions(reqEmp, cfoPendingClaim).canEdit, false, 'Not editable after RM approves (awaiting CFO)');

  // 3. Once RM approves and claim moves to Accounts (SUBMITTED) -> NOT editable
  const rmApprovedSubmittedClaim = {
    ...rmPendingClaim,
    status: 'SUBMITTED',
    managerApproval: { kind: 'OTHER_EXPENSE', status: 'APPROVED', approver: ids.rm, decidedAt: new Date() },
    financeApproval: { status: 'NOT_REQUIRED' },
  };
  assert.equal(access.claimPermissions(reqEmp, rmApprovedSubmittedClaim).canEdit, false, 'Not editable after RM approves (at Accounts)');

  // 4. Direct-to-Accounts claim (no RM approval required) -> editable while at SUBMITTED (before Accounts approves)
  const directAccountsClaim = {
    companyId: ids.company,
    submittedBy: ids.emp,
    status: 'SUBMITTED',
    managerApproval: { kind: 'NONE', status: 'NOT_REQUIRED' },
    financeApproval: { status: 'NOT_REQUIRED' },
    accountsApproval: { status: 'PENDING' },
  };
  assert.equal(access.claimPermissions(reqEmp, directAccountsClaim).canEdit, true, 'Editable when routed directly to Accounts before Accounts approves');

  // 5. Direct-to-Accounts claim after Accounts Step 1 approves -> NOT editable
  const accountsApprovedClaim = {
    ...directAccountsClaim,
    status: 'ACCOUNTS_APPROVED',
    paymentStatus: 'AWAITING_DISBURSEMENT',
    accountsApproval: { status: 'APPROVED', approvedAt: new Date() },
  };
  assert.equal(access.claimPermissions(reqEmp, accountsApprovedClaim).canEdit, false, 'Not editable after Accounts Step 1 approves');
});

it('Q. Submitting Travel Mode Entitlement with All Levels (levelNumber: 0) connects to each level without creating a separate level 0 row', async () => {
  const TravelMode = require('../models/TravelMode');
  const ExpenseEntitlement = require('../models/ExpenseEntitlement');

  const modesRes = await request(app).get('/api/expense/travel-modes/all').set(as('admin'));
  assert.equal(modesRes.status, 200);
  const trainMode = (modesRes.body.data || []).find((m) => m.code === 'TRAIN');
  assert.ok(trainMode, 'Train travel mode exists');

  const firstSubtype = trainMode.subtypes[0];
  const saveRes = await request(app)
    .post('/api/expense/entitlements')
    .set(as('admin'))
    .send({
      expenseTypeCode: 'TRAVEL',
      levelNumber: 0,
      targetLevels: [1, 2, 3],
      gradeCode: '',
      cityClass: 'ALL',
      travelModeId: trainMode._id,
      allowedSubtypes: [{ subtypeId: firstSubtype._id, maxAmount: 1800 }],
      maxAmount: null,
      status: 'active',
    });
  assert.equal(saveRes.status, 201);
  assert.ok(Array.isArray(saveRes.body.appliedLevels));
  assert.ok(saveRes.body.appliedLevels.includes(1) && saveRes.body.appliedLevels.includes(2) && saveRes.body.appliedLevels.includes(3));

  const zeroRowCount = await ExpenseEntitlement.countDocuments({
    companyId: ids.company,
    levelNumber: 0,
    expenseTypeCode: 'TRAVEL',
  });
  assert.equal(zeroRowCount, 0, 'No separate levelNumber 0 section row is stored');

  const entListRes = await request(app).get('/api/expense/entitlements/all').set(as('admin'));
  assert.equal(entListRes.status, 200);
  const travelEnts = (entListRes.body.data || []).filter(
    (e) => e.expenseTypeCode === 'TRAVEL' && e.travelModeCode === 'TRAIN'
  );
  assert.ok(travelEnts.some((e) => Number(e.levelNumber) === 1 && e.allowedSubtypes[0]?.maxAmount === 1800));
  assert.ok(travelEnts.some((e) => Number(e.levelNumber) === 2 && e.allowedSubtypes[0]?.maxAmount === 1800));
  assert.ok(travelEnts.some((e) => Number(e.levelNumber) === 3 && e.allowedSubtypes[0]?.maxAmount === 1800));
  assert.equal(travelEnts.some((e) => Number(e.levelNumber) === 0), false);
});

it('R. Multiple Travel Mode Entitlements per level persist permanently across startup deduplication, index sync, and master seeding', async () => {
  const { deduplicateEntitlements, ensureEntitlementIndexes, ensureExpenseMasters } = require('../services/seedExpenseMasters');

  const modesRes = await request(app).get('/api/expense/travel-modes/all').set(as('admin'));
  assert.equal(modesRes.status, 200);
  const modes = modesRes.body.data || [];
  const train = modes.find((m) => m.code === 'TRAIN');
  const bus = modes.find((m) => m.code === 'BUS');
  const flight = modes.find((m) => m.code === 'FLIGHT');
  const taxi = modes.find((m) => m.code === 'TAXI_AUTO');
  assert.ok(train && bus && flight && taxi, 'Default travel modes exist');

  for (const [m, cap] of [[train, 1800], [bus, 900], [flight, 5500], [taxi, 600]]) {
    const subs = (m.subtypes || []).map((s) => ({ subtypeId: s._id, maxAmount: cap }));
    // eslint-disable-next-line no-await-in-loop
    const res = await request(app)
      .post('/api/expense/entitlements')
      .set(as('admin'))
      .send({
        expenseTypeCode: 'TRAVEL',
        levelNumber: 2,
        gradeCode: '',
        cityClass: 'ALL',
        travelModeId: m._id,
        allowedSubtypes: subs,
        maxAmount: subs.length ? null : cap,
        status: 'active',
      });
    assert.equal(res.status, 201);
  }

  // Simulate server restart / wake-up migrations that previously wiped multiple TRAVEL rows per level
  await deduplicateEntitlements();
  await ensureEntitlementIndexes(true);
  await ensureExpenseMasters(ids.company);

  const entListRes = await request(app).get('/api/expense/entitlements/all').set(as('admin'));
  assert.equal(entListRes.status, 200);
  const lvl2TravelCodes = (entListRes.body.data || [])
    .filter((e) => e.expenseTypeCode === 'TRAVEL' && Number(e.levelNumber) === 2)
    .map((e) => e.travelModeCode)
    .sort();
  assert.deepEqual(lvl2TravelCodes, ['BUS', 'FLIGHT', 'TAXI_AUTO', 'TRAIN']);
});




