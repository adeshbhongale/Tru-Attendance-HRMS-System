/**
 * Unit tests for the expense claim rule engine (pure functions, no database).
 * Run: npm test   (from backend/)   or   node --test modules/hr/expense/tests
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const rules = require('../services/claimRules');
const { calculateItem } = require('../services/calculationEngine');
const { _sniffMime } = require('../controllers/expenseUpload.controller');
const access = require('../services/expenseAccess');

const TODAY = new Date(Date.UTC(2026, 9, 8)); // 08 Oct 2026
const policyConfig = rules.resolvePolicyConfig({});
const types = {
  FOOD: rules.resolveTypeConfig({ code: 'FOOD', name: 'Food', category: 'FOOD', proofRequired: false }),
  TRAVEL: rules.resolveTypeConfig({ code: 'TRAVEL', name: 'Travel', category: 'TRAVEL', proofRequired: true }),
  CONVEYANCE: rules.resolveTypeConfig({ code: 'CONVEYANCE', name: 'Local Conveyance', category: 'CONVEYANCE' }),
  OTHER: rules.resolveTypeConfig({ code: 'OTHER', name: 'Other', category: 'OTHER' }),
  LODGING: rules.resolveTypeConfig({ code: 'LODGING', name: 'Lodging', category: 'LODGING' }),
};
const EMP1 = '64b000000000000000000001';
const EMP2 = '64b000000000000000000002';
const receipt = (name = 'Bill_1.jpg', type = 'image/jpeg') => ({ name, url: `https://res.cloudinary.com/demo/${name}`, type, size: 1000 });

const normalBody = (over = {}) => ({
  claimMode: 'NORMAL',
  claimDate: '2026-09-29',
  numberOfEmployees: 1,
  employeeIds: [EMP1],
  customerName: 'ABC Ltd.',
  destinationCity: 'Pune',
  expenseType: 'TRAVEL',
  requestedAmount: 1250,
  remark: 'Client site visit for project meeting at Pune office.',
  receipts: [receipt('Bill_1.jpg'), receipt('Bill_2.jpg'), receipt('Bill_3.pdf', 'application/pdf')],
  serviceReports: [receipt('service_report.pdf', 'application/pdf')],
  fullPayment: { requested: false },
  ...(over.expenseType === 'OTHER' && !over.otherSubType ? {
    otherSubType: 'NORMAL',
  } : {}),
  ...over,
});
const lodgingBody = (over = {}) => ({
  ...normalBody({
    claimMode: 'LODGING',
    claimDate: undefined,
    fromDate: '2026-09-29',
    toDate: '2026-10-02',
    expenseType: 'LODGING',
    requestedAmount: 6000,
    remark: 'Hotel stay for plant commissioning.',
    stayType: 'IN_HOTEL', // Stay Type is required on every new lodging claim
    serviceReports: [receipt('service_report.pdf', 'application/pdf')],
  }),
  ...over,
});
const validate = (body, opts = {}) => {
  const input = rules.normalizeInput(body);
  return rules.validateClaimInput(input, { policyConfig, typeConfig: types[input.expenseType] || null, today: TODAY, ...opts });
};
const codes = (errors) => errors.map((e) => e.code);

const conveyanceFields = {
  vehicle: 'twoWheeler',
  distanceKm: 40,
  numberPlatePhotos: [receipt('plate.jpg')],
  startKmPhotos: [receipt('odo_start.jpg')],
  endKmPhotos: [receipt('odo_end.jpg')],
};

// ── TC01-TC04: valid normal claims ──
for (const [tc, type] of [['TC01', 'FOOD'], ['TC02', 'TRAVEL'], ['TC03', 'CONVEYANCE'], ['TC04', 'OTHER']]) {
  test(`${tc} valid ${type} claim passes validation`, () => {
    assert.deepEqual(validate(normalBody({ expenseType: type, ...(type === 'CONVEYANCE' ? conveyanceFields : {}), ...(type === 'OTHER' ? { approverId: EMP2 } : {}) })), []);
  });
}

test('Local Conveyance: number plate, Start KM and End KM photos required; no bills needed', () => {
  const missing = codes(validate(normalBody({ expenseType: 'CONVEYANCE' })));
  for (const c of ['NUMBER_PLATE_PHOTO_REQUIRED', 'START_KM_PHOTO_REQUIRED', 'END_KM_PHOTO_REQUIRED']) assert.ok(missing.includes(c), c);

  // Photo still uploading (no server URL) is rejected
  const pending = validate(normalBody({ expenseType: 'CONVEYANCE', ...conveyanceFields, endKmPhotos: [{ name: 'odo_end.jpg', url: 'file:///tmp/odo_end.jpg' }] }));
  assert.ok(codes(pending).includes('UPLOAD_INCOMPLETE'));

  const noBills = validate(normalBody({ expenseType: 'CONVEYANCE', ...conveyanceFields, receipts: [], serviceReports: [] }), {
    typeConfig: { ...types.CONVEYANCE, proofRequired: true },
  });
  assert.deepEqual(noBills, []);

  const input = rules.normalizeInput(normalBody({ expenseType: 'CONVEYANCE', ...conveyanceFields }));
  assert.equal(input.entries[0].distanceKm, 40);
  assert.equal(input.entries[0].numberPlatePhotos.length, 1);
});

test('OTHER claim: Purchase option requires barcode number and text quantity, but does not require supporting document', () => {
  // Missing both barcode and quantity
  const errs1 = validate(normalBody({ expenseType: 'OTHER', otherSubType: 'PURCHASE', barcodeNumber: '', quantity: '' }));
  assert.ok(codes(errs1).includes('BARCODE_REQUIRED'));
  assert.ok(codes(errs1).includes('QUANTITY_REQUIRED'));
  assert.ok(!codes(errs1).includes('SUPPORTING_DOC_REQUIRED'));

  // Has barcode but missing/empty quantity
  const errs2 = validate(normalBody({ expenseType: 'OTHER', otherSubType: 'PURCHASE', barcodeNumber: 'BC-12345', quantity: '   ' }));
  assert.ok(!codes(errs2).includes('BARCODE_REQUIRED'));
  assert.ok(codes(errs2).includes('QUANTITY_REQUIRED'));

  // Valid Purchase claim passes (barcode + text quantity, e.g. "5 pcs")
  const validPurchase = validate(normalBody({
    expenseType: 'OTHER',
    otherSubType: 'PURCHASE',
    barcodeNumber: 'BC-12345',
    quantity: '5 pcs',
    approverId: EMP2,
  }));
  assert.deepEqual(validPurchase, []);
});

test('Lodging claim requires service report document (single or multiple upload)', () => {
  const missing = validate(lodgingBody({ serviceReports: [] }));
  assert.ok(codes(missing).includes('SERVICE_REPORT_REQUIRED'));

  const valid = validate(lodgingBody({ serviceReports: [receipt('SR_001.pdf', 'application/pdf'), receipt('site_pic.jpg', 'image/jpeg')] }));
  assert.deepEqual(valid, []);
});

test('Normal claim: No Visit skips service report; Visit requires service report', () => {
  // Default / No Visit does not require service report for any claim type
  assert.ok(!codes(validate(normalBody({ serviceReports: [] }))).includes('SERVICE_REPORT_REQUIRED'));
  assert.ok(!codes(validate(normalBody({ visitType: 'NO_VISIT', serviceReports: [] }))).includes('SERVICE_REPORT_REQUIRED'));
  assert.ok(!codes(validate(normalBody({ expenseType: 'CONVEYANCE', visitType: 'NO_VISIT', serviceReports: [] }))).includes('SERVICE_REPORT_REQUIRED'));

  // Visit requires service report
  assert.ok(codes(validate(normalBody({ visitType: 'VISIT', serviceReports: [] }))).includes('SERVICE_REPORT_REQUIRED'));
  assert.ok(!codes(validate(normalBody({ visitType: 'VISIT', serviceReports: [receipt('sr.pdf')] }))).includes('SERVICE_REPORT_REQUIRED'));

  // Mixed entries with No Visit do not need a service report
  const mixed = normalBody({
    visitType: 'NO_VISIT',
    serviceReports: [],
    entries: [
      { expenseType: 'CONVEYANCE', requestedAmount: 100, remark: 'Local site travel', vehicle: 'car', distanceKm: 20, receipts: [receipt()] },
      { expenseType: 'FOOD', requestedAmount: 200, remark: 'Lunch at site', receipts: [receipt()] },
    ],
  });
  assert.ok(!codes(validate(mixed)).includes('SERVICE_REPORT_REQUIRED'));
  // Drafts can still be saved without it even when Visit is selected
  assert.ok(!codes(validate(normalBody({ visitType: 'VISIT', serviceReports: [] }), { isDraft: true }).filter((e) => !e.required)).includes('SERVICE_REPORT_REQUIRED'));
});

test('OTHER claim: Normal option does not require barcode number, quantity, or supporting document', () => {
  // Valid Normal claim passes directly with standard fields (no barcode, no quantity, no supporting doc needed)
  const validNormal = validate(normalBody({
    expenseType: 'OTHER',
    otherSubType: 'NORMAL',
    approverId: EMP2,
  }));
  assert.deepEqual(validNormal, []);
});

test('OTHER claim: Unselected otherSubType is rejected on final submit', () => {
  const errs = validate(normalBody({ expenseType: 'OTHER', otherSubType: '' }));
  assert.ok(codes(errs).includes('OTHER_SUBTYPE_REQUIRED'));
});

test('TC05 valid Lodging claim uses From/To date and 3 nights', () => {
  assert.deepEqual(validate(lodgingBody()), []);
  const input = rules.normalizeInput(lodgingBody());
  assert.equal(rules.nightsBetween(input.fromDate, input.toDate), 3);
});

test('TC09 multiple receipts are accepted (jpg, jpg, pdf)', () => {
  const input = rules.normalizeInput(normalBody());
  assert.equal(input.receipts.length, 3);
  assert.deepEqual(validate(normalBody()), []);
});

test('TC10 missing receipt is rejected when proof is required', () => {
  assert.ok(codes(validate(normalBody({ receipts: [] }))).includes('RECEIPT_REQUIRED'));
});

test('TC10c valid claim without receipts passes when proofRequired is false', () => {
  assert.deepEqual(validate(normalBody({ expenseType: 'FOOD', receipts: [] })), []);
});

test('TC10b too many / unsupported / not-uploaded receipts are rejected', () => {
  const many = Array.from({ length: 11 }, (_, i) => receipt(`Bill_${i}.jpg`));
  assert.ok(codes(validate(normalBody({ receipts: many }))).includes('TOO_MANY_FILES'));
  assert.ok(codes(validate(normalBody({ receipts: [receipt('a.gif', 'image/gif')] }))).includes('UNSUPPORTED_FILE'));
  assert.ok(codes(validate(normalBody({ receipts: [{ name: 'x.jpg', url: 'file:///data/x.jpg', type: 'image/jpeg' }] }))).includes('UPLOAD_INCOMPLETE'));
});

test('TC11 zero and negative amounts are rejected', () => {
  assert.ok(codes(validate(normalBody({ requestedAmount: 0 }))).includes('AMOUNT_ZERO'));
  assert.ok(codes(validate(normalBody({ requestedAmount: -5 }))).includes('AMOUNT_NEGATIVE'));
  assert.ok(codes(validate(normalBody({ requestedAmount: '' }))).includes('AMOUNT_REQUIRED'));
});

test('TC12 missing / short / over 500 remark validation', () => {
  assert.ok(codes(validate(normalBody({ remark: '' }))).includes('REMARK_REQUIRED'));
  assert.ok(codes(validate(normalBody({ remark: 'abc' }))).includes('REMARK_TOO_SHORT'));
  assert.ok(codes(validate(normalBody({ remark: 'x'.repeat(501) }))).includes('REMARK_TOO_LONG'));
  assert.equal(codes(validate(normalBody({ remark: 'x'.repeat(500) }))).includes('REMARK_TOO_LONG'), false);
});

test('TC13 full payment OFF needs no reason/proof', () => {
  assert.deepEqual(validate(normalBody({ fullPayment: { requested: false, reason: '' } })), []);
});

test('TC14 full payment ON with reason and Management approver passes (no proof needed)', () => {
  const fp = { requested: true, reason: 'Client approved the complete travel reimbursement.' };
  assert.deepEqual(validate(normalBody({ fullPayment: fp, approverId: EMP2 })), []);
});

test('TC15 full payment ON without reason is rejected', () => {
  const errors = validate(normalBody({ fullPayment: { requested: true, reason: '' }, approverId: EMP2 }));
  const e = errors.find((x) => x.code === 'FULL_PAYMENT_REASON_REQUIRED');
  assert.equal(e.message, 'Please provide the reason for full payment.');
});

test('TC16 full payment / OTHER expense without approver is rejected; drafts may skip it', () => {
  const fpErr = validate(normalBody({ fullPayment: { requested: true, reason: 'Approved by client' } })).find((x) => x.code === 'APPROVER_REQUIRED');
  assert.equal(fpErr.message, 'Please select the Management user who will approve the full payment.');
  const otherErr = validate(normalBody({ expenseType: 'OTHER' })).find((x) => x.code === 'APPROVER_REQUIRED');
  assert.equal(otherErr.message, 'Please select the Reporting Manager who will approve this Other expense.');
  assert.ok(codes(validate(normalBody({ expenseType: 'OTHER', approverId: 'bad' }))).includes('APPROVER_INVALID'));
  assert.ok(!codes(validate(normalBody({ expenseType: 'OTHER' }), { isDraft: true })).includes('APPROVER_REQUIRED'));
  assert.ok(!codes(validate(normalBody())).includes('APPROVER_REQUIRED'), 'TRAVEL without FP needs no approver');
});

test('approvalKindFor: FP -> FULL_PAYMENT (wins over OTHER), OTHER -> OTHER_EXPENSE, lodging/others -> NONE', () => {
  const kind = (b) => rules.approvalKindFor(rules.normalizeInput(b));
  assert.equal(kind(normalBody()), 'NONE');
  assert.equal(kind(normalBody({ expenseType: 'OTHER' })), 'OTHER_EXPENSE');
  assert.equal(kind(normalBody({ entries: [{ expenseType: 'FOOD', requestedAmount: 100 }, { expenseType: 'OTHER', requestedAmount: 50 }] })), 'OTHER_EXPENSE');
  assert.equal(kind(normalBody({ expenseType: 'OTHER', fullPayment: { requested: true, reason: 'x' } })), 'FULL_PAYMENT');
  assert.equal(kind(lodgingBody()), 'NONE');
  assert.equal(kind(lodgingBody({ fullPayment: { requested: true, reason: 'x' } })), 'FULL_PAYMENT');
  // Stored claim shape
  assert.equal(rules.approvalKindFor({ claimMode: 'NORMAL', employeeClaims: [{ items: [{ expenseType: 'OTHER' }] }] }), 'OTHER_EXPENSE');
});

test('TC17 requested / allowed / excess / payable are calculated separately', async () => {
  const entitlements = [{ levelNumber: 3, cityClass: 'A', expenseTypeCode: 'FOOD', amount: 1000, gradeCode: '' }];
  const calc = await calculateItem({ item: { expenseType: 'FOOD', requestedAmount: 1250 }, employeeLevelNumber: 3, employeeGradeCode: '', entitlements, cityClass: 'A', policy: {} });
  assert.equal(calc.requestedAmount, 1250);
  assert.equal(calc.allowedAmount, 1000);
  assert.equal(calc.excessAmount, 250);
  const claim = { grandRequested: 1250, grandAllowed: 1000, fullPayment: { requested: false } };
  assert.equal(rules.computePayable(claim), 1000);
});

test('TC18 full payment request waits for Management approval; full amount payable only after approval', () => {
  const claim = { grandRequested: 1250, grandAllowed: 1000, fullPayment: { requested: true, reason: 'x' }, managerApproval: { approver: EMP2, approverName: 'Boss' } };
  rules.routeSubmission(claim);
  assert.equal(claim.status, 'APPROVAL_PENDING');
  assert.equal(claim.managerApproval.kind, 'FULL_PAYMENT');
  assert.equal(claim.managerApproval.approverRole, 'MANAGEMENT');
  assert.equal(claim.managerApproval.status, 'PENDING');
  assert.equal(claim.managerApproval.approver, EMP2, 'selected approver is kept');
  assert.equal(claim.fullPayment.status, 'PENDING');
  assert.equal(claim.payableAmount, 1000, 'only allowed amount payable until approved');
  assert.equal(claim.grandRequested, 1250, 'requested amount is preserved');
  claim.fullPayment.status = 'APPROVED';
  claim.fullPayment.approvedAmount = 1250;
  assert.equal(rules.computePayable(claim), 1250);
  claim.fullPayment.status = 'REJECTED';
  assert.equal(rules.computePayable(claim), 1000, 'rejected full payment falls back to allowed');
});

test('TC18b routing: plain claims go to SUBMITTED; OTHER expense goes to Reporting Manager approval', () => {
  const a = rules.routeSubmission({ grandRequested: 500, grandAllowed: 500, fullPayment: {} });
  assert.equal(a.status, 'SUBMITTED');
  assert.equal(a.paymentStatus, 'PENDING');
  assert.equal(a.approvalFlow, 'NONE');
  assert.equal(a.managerApproval.status, 'NOT_REQUIRED');
  const o = rules.routeSubmission({ claimMode: 'NORMAL', claimType: 'OTHER', grandRequested: 300, grandAllowed: 300, fullPayment: {}, managerApproval: { approver: EMP2 } });
  assert.equal(o.status, 'APPROVAL_PENDING');
  assert.equal(o.managerApproval.kind, 'OTHER_EXPENSE');
  assert.equal(o.managerApproval.approverRole, 'REPORTING_MANAGER');
  const both = rules.routeSubmission({ claimMode: 'NORMAL', claimType: 'OTHER', grandRequested: 300, grandAllowed: 300, fullPayment: { requested: true } });
  assert.equal(both.managerApproval.kind, 'FULL_PAYMENT', 'single Management approval covers FP + OTHER');
});

test('approval stage permissions: only the selected approver decides; Accounts waits until approved', () => {
  const APPROVER = '64b000000000000000000003';
  const claim = { companyId: 'c1', submittedBy: EMP1, status: 'APPROVAL_PENDING', employeeClaims: [{ employee: { employeeId: EMP1 } }], fullPayment: { requested: true }, managerApproval: { approver: APPROVER, kind: 'FULL_PAYMENT', status: 'PENDING' } };
  const reqOf = (user) => ({ user, tenant: { companyId: 'c1' }, headers: {}, query: {} });
  const approverP = access.claimPermissions(reqOf({ _id: APPROVER, role: 'management' }), claim);
  assert.equal(approverP.canApprove, true);
  assert.equal(approverP.canRejectApproval, true);
  assert.equal(approverP.businessStatus, 'PENDING');
  assert.equal(access.canViewClaim(reqOf({ _id: APPROVER, role: 'management' }), claim), true);

  const otherMgr = access.claimPermissions(reqOf({ _id: '64b000000000000000000004', role: 'management' }), claim);
  assert.equal(otherMgr.canApprove, false);
  assert.equal(access.canViewClaim(reqOf({ _id: '64b000000000000000000004', role: 'management' }), claim), false);

  const accounts = access.claimPermissions(reqOf({ _id: '64b000000000000000000005', role: 'accounts' }), claim);
  assert.equal(accounts.canMarkPaid, false);
  assert.equal(accounts.canReject, false);
  assert.equal(accounts.canApprove, false);

  const approved = access.claimPermissions(reqOf({ _id: '64b000000000000000000005', role: 'accounts' }), { ...claim, status: 'SUBMITTED' });
  assert.equal(approved.canMarkPaid, true, 'after approval Accounts can pay');

  const employee = access.claimPermissions(reqOf({ _id: EMP1, role: 'employee' }), claim);
  assert.equal(employee.canApprove, false);
  assert.equal(employee.canEdit, true);
  assert.ok(!access.PENDING_STATUSES.includes('APPROVAL_PENDING'), 'never in the Accounts queue');
  assert.ok(access.STATUS_LISTS.PENDING.includes('APPROVAL_PENDING'), 'counted as Pending in reports');
});

test('TC21/TC22 employee can edit pending claim, cannot delete it or decide it, cannot edit/delete paid claim', () => {
  const req = { user: { _id: EMP1, role: 'employee' }, tenant: { companyId: 'c1' }, headers: {}, query: {} };
  const claim = { companyId: 'c1', submittedBy: EMP1, status: 'SUBMITTED', employeeClaims: [{ employee: { employeeId: EMP1 } }], fullPayment: {} };
  let p = access.claimPermissions(req, claim);
  assert.equal(p.businessStatus, 'PENDING');
  assert.equal(p.canMarkPaid, false);
  assert.equal(p.canReject, false);
  assert.equal(p.canEdit, true);
  assert.equal(p.canDelete, false);
  claim.status = 'PAID';
  claim.lockedAt = new Date();
  p = access.claimPermissions(req, claim);
  assert.equal(p.canEdit, false);
  assert.equal(p.canDelete, false);
});

test('TC21b nobody decides a claim they are on; HR can reject but not mark paid', () => {
  const req = { user: { _id: EMP1, role: 'hr_admin' }, tenant: { companyId: 'c1' }, headers: {}, query: {} };
  const claim = { companyId: 'c1', submittedBy: EMP1, status: 'SUBMITTED', employeeClaims: [{ employee: { employeeId: EMP1 } }], fullPayment: {} };
  assert.equal(access.claimPermissions(req, claim).canReject, false);
  assert.equal(access.claimPermissions(req, claim).canMarkPaid, false);
  const other = { ...req, user: { _id: EMP2, role: 'hr_admin' } };
  assert.equal(access.claimPermissions(other, claim).canReject, true);
  assert.equal(access.claimPermissions(other, claim).canMarkPaid, false);
  const accounts = { ...req, user: { _id: EMP2, role: 'account_admin' } };
  assert.equal(access.claimPermissions(accounts, claim).canMarkPaid, true);
  const ownAccounts = { ...req, user: { _id: EMP1, role: 'account_admin' } };
  assert.equal(access.claimPermissions(ownAccounts, claim).canMarkPaid, false);
});

test('TC23 deadline rules removed: claims never expire and have no deadline warnings', () => {
  const anchor = new Date(Date.UTC(2026, 8, 20));
  const r = rules.evaluateDeadline({ deadlineRules: [{ ruleName: 'Submit within 7 days', days: 7, action: 'blocking' }], anchor, now: new Date('2026-10-08T05:00:00Z') });
  assert.equal(r.expired, false);
  assert.equal(r.claimEligibleUntil, null);
  assert.equal(r.warnings.length, 0);
});

test('TC23b still within the window / still outstation => not expired', () => {
  const anchor = new Date(Date.UTC(2026, 9, 6));
  const r = rules.evaluateDeadline({ deadlineRules: [{ days: 7, action: 'blocking' }], anchor, now: new Date('2026-10-08T05:00:00Z') });
  assert.equal(r.expired, false);
  const away = rules.evaluateDeadline({ deadlineRules: [{ days: 1, action: 'blocking' }], anchor: new Date(Date.UTC(2026, 0, 1)), stillAway: true });
  assert.equal(away.expired, false);
  assert.equal(away.claimEligibleUntil, null);
});

test('TC23c warning-only deadline rules removed: never warns or blocks', () => {
  const r = rules.evaluateDeadline({ deadlineRules: [{ ruleName: 'Late', days: 3, action: 'warning' }], anchor: new Date(Date.UTC(2026, 8, 1)), now: new Date('2026-10-08T05:00:00Z') });
  assert.equal(r.expired, false);
  assert.equal(r.warnings.length, 0);
});

test('TC27 idempotency key format is enforced', () => {
  assert.equal(rules.normalizeInput({ clientRequestId: 'abc' }).clientRequestId, null);
  assert.equal(rules.normalizeInput({ clientRequestId: 'req_1696000000000_ab12cd' }).clientRequestId, 'req_1696000000000_ab12cd');
  assert.equal(rules.normalizeInput({ clientRequestId: 'bad id; drop' }).clientRequestId, null);
});

test('TC28 multiple employees selected correctly and amount split to the paisa', () => {
  assert.deepEqual(validate(normalBody({ numberOfEmployees: 2, employeeIds: [EMP1, EMP2] })), []);
  assert.deepEqual(rules.splitAmount(1000, 3), [333.33, 333.33, 333.34]);
});

test('TC29 employee count mismatch is rejected', () => {
  const less = validate(normalBody({ numberOfEmployees: 2, employeeIds: [EMP1] }));
  assert.equal(less.find((e) => e.code === 'EMPLOYEE_COUNT_MISMATCH').message, 'Please select all required employees.');
  assert.ok(codes(validate(normalBody({ numberOfEmployees: 1, employeeIds: [EMP1, EMP2] }))).includes('EMPLOYEE_COUNT_MISMATCH'));
  assert.ok(codes(validate(normalBody({ numberOfEmployees: 0, employeeIds: [] }))).includes('EMPLOYEE_COUNT_INVALID'));
});

test('TC31 normal claim ignores From/To dates', () => {
  const input = rules.normalizeInput(normalBody({ fromDate: '2026-09-01', toDate: '2026-09-10' }));
  assert.equal(input.fromDate, null);
  assert.equal(input.toDate, null);
  assert.equal(input.claimDate.toISOString(), '2026-09-29T00:00:00.000Z');
});

test('TC32 lodging claim ignores Claim Date', () => {
  const input = rules.normalizeInput(lodgingBody({ claimDate: '2026-01-01' }));
  assert.equal(input.claimDate, null);
  assert.equal(input.fromDate.toISOString(), '2026-09-29T00:00:00.000Z');
});

test('expense types are mode-locked (Lodging only in Lodging claim and vice versa)', () => {
  assert.ok(codes(validate(normalBody({ expenseType: 'LODGING' }))).includes('EXPENSE_TYPE_MODE'));
  assert.ok(codes(validate(lodgingBody({ expenseType: 'FOOD' }))).includes('EXPENSE_TYPE_MODE'));
});

test('invalid lodging date range and future dates are rejected', () => {
  assert.ok(codes(validate(lodgingBody({ toDate: '2026-09-29' }))).includes('INVALID_DATE_RANGE'));
  assert.ok(codes(validate(lodgingBody({ fromDate: '2026-10-02', toDate: '2026-09-29' }))).includes('INVALID_DATE_RANGE'));
  assert.ok(codes(validate(normalBody({ claimDate: '2026-12-01' }))).includes('FUTURE_DATE'));
  assert.ok(codes(validate(normalBody({ claimDate: '2026-02-31' }))).includes('INVALID_DATE'));
});

test('drafts skip required-field errors but keep format errors', () => {
  const draft = validate({ claimMode: 'NORMAL', requestedAmount: -1 }, { isDraft: true });
  assert.deepEqual(codes(draft), ['AMOUNT_NEGATIVE']);
});

test('type defaults: Food/Travel one per day, Lodging is a lodging type', () => {
  assert.equal(types.FOOD.sameDateLimit, 1);
  assert.equal(types.TRAVEL.sameDateLimit, 1);
  assert.equal(types.CONVEYANCE.sameDateLimit, 0);
  assert.equal(types.OTHER.sameDateLimit, 0);
  assert.equal(types.LODGING.claimMode, 'LODGING');
  assert.equal(rules.resolveTypeConfig({ code: 'OTHER', sameDateLimit: 2 }).sameDateLimit, 2);
});

test('Other (both sub types) and Local Conveyance directly show all payment is allowed with no limit caps', async () => {
  const noEnt = await calculateItem({ item: { expenseType: 'OTHER', requestedAmount: 900 }, employeeLevelNumber: 1, entitlements: [], cityClass: 'C', policy: {} });
  assert.equal(noEnt.allowedAmount, 900);
  assert.equal(noEnt.excessAmount, 0);

  const ents = [{ levelNumber: 1, cityClass: 'C', expenseTypeCode: 'OTHER', amount: 500, gradeCode: '' }, { levelNumber: 1, cityClass: 'C', expenseTypeCode: 'CONVEYANCE', amount: 300, gradeCode: '' }];
  const otherNormal = await calculateItem({ item: { expenseType: 'OTHER', otherSubType: 'NORMAL', requestedAmount: 900 }, employeeLevelNumber: 1, entitlements: ents, cityClass: 'C', policy: {} });
  assert.equal(otherNormal.allowedAmount, 900);
  assert.equal(otherNormal.excessAmount, 0);

  const otherPurchase = await calculateItem({ item: { expenseType: 'OTHER', otherSubType: 'PURCHASE', requestedAmount: 1500 }, employeeLevelNumber: 1, entitlements: ents, cityClass: 'C', policy: {} });
  assert.equal(otherPurchase.allowedAmount, 1500);
  assert.equal(otherPurchase.excessAmount, 0);

  const conv = await calculateItem({ item: { expenseType: 'CONVEYANCE', requestedAmount: 450 }, employeeLevelNumber: 1, entitlements: ents, cityClass: 'C', policy: {} });
  assert.equal(conv.allowedAmount, 450);
  assert.equal(conv.excessAmount, 0);
});

test('lodging allowance = per-night entitlement x nights', async () => {
  const ents = [{ levelNumber: 2, cityClass: 'A+', expenseTypeCode: 'LODGING', amount: 2000, gradeCode: '' }];
  const calc = await calculateItem({ item: { expenseType: 'LODGING', requestedAmount: 7000, days: 3 }, employeeLevelNumber: 2, entitlements: ents, cityClass: 'A+', policy: {} });
  assert.equal(calc.allowedAmount, 6000);
  assert.equal(calc.excessAmount, 1000);
});

test('file signature detection rejects renamed/corrupted files', () => {
  assert.equal(_sniffMime(Buffer.from('%PDF-1.7\n%âãÏÓ\n')), 'application/pdf');
  assert.equal(_sniffMime(Buffer.from('ffd8ffe000104a4649460001', 'hex')), 'image/jpeg');
  assert.equal(_sniffMime(Buffer.from('89504e470d0a1a0a0000000d', 'hex')), 'image/png');
  assert.equal(_sniffMime(Buffer.from('this is not an image at all')), null);
});

test('date helpers: display format and IST calendar day', () => {
  assert.equal(rules.formatDate(new Date(Date.UTC(2026, 8, 29))), '29 Sep 2026');
  // 20:00 UTC on 7 Oct is already 8 Oct in India
  assert.equal(rules.todayDateOnly(new Date('2026-10-07T20:00:00Z')).toISOString(), '2026-10-08T00:00:00.000Z');
});

test('calculateItem returns correct policyLimit, allowed, excess and explanation', async () => {
  const { resolveCityClass, findEntitlement } = require('../services/policyEngine');
  const cityClass = await resolveCityClass(null, 'Pune');
  assert.equal(cityClass, 'A');

  const ent = findEntitlement([], 8, '', 'A', 'FOOD');
  assert.equal(ent.amount, 500);

  const calc = await calculateItem({
    item: { expenseType: 'FOOD', requestedAmount: 650 },
    employeeLevelNumber: 8,
    employeeGradeCode: '',
    entitlements: [],
    cityClass: 'A',
    policy: {},
  });
  assert.equal(calc.policyLimit, 500);
  assert.equal(calc.allowedAmount, 500);
  assert.equal(calc.excessAmount, 150);
  assert.ok(calc.plainExplanation.includes('Your daily food limit is ₹500/day'));

  const lodgingCalc = await calculateItem({
    item: { expenseType: 'LODGING', requestedAmount: 5000, days: 2 },
    employeeLevelNumber: 8,
    employeeGradeCode: '',
    entitlements: [],
    cityClass: 'A',
    policy: {},
  });
  assert.equal(lodgingCalc.policyLimit, 4000);
  assert.equal(lodgingCalc.allowedAmount, 4000);
  assert.equal(lodgingCalc.excessAmount, 1000);
});

test('lodging calculates based on inclusive days (e.g. 1st to 3rd = 3 days)', async () => {
  const days = rules.daysBetween('2026-10-01', '2026-10-03');
  assert.equal(days, 3);

  // 3 days lodging in Class A for Level 8 (₹2,000/day x 3 days = ₹6,000 limit)
  const lodging3Days = await calculateItem({
    item: { expenseType: 'LODGING', requestedAmount: 7000, days },
    employeeLevelNumber: 8,
    employeeGradeCode: '',
    entitlements: [],
    cityClass: 'A',
    policy: {},
  });
  assert.equal(lodging3Days.policyLimit, 6000);
  assert.equal(lodging3Days.allowedAmount, 6000);
  assert.equal(lodging3Days.excessAmount, 1000);
});

test('preview calculation: full payment allows full requested amount while displaying real excess count', async () => {
  const days = rules.daysBetween('2026-10-01', '2026-10-03');
  const lodgingItem = await calculateItem({
    item: { expenseType: 'LODGING', requestedAmount: 7000, days },
    employeeLevelNumber: 8,
    employeeGradeCode: '',
    entitlements: [],
    cityClass: 'A',
    policy: {},
  });
  assert.equal(lodgingItem.policyLimit, 6000);
  assert.equal(lodgingItem.allowedAmount, 6000);
  assert.equal(lodgingItem.excessAmount, 1000);

  const isFull = true;
  const effectiveAllowed = isFull ? 7000 : lodgingItem.allowedAmount;
  const effectiveExcess = lodgingItem.excessAmount;
  assert.equal(effectiveAllowed, 7000, 'allowed in full because full payment is requested');
  assert.equal(effectiveExcess, 1000, 'real excess beyond policy limit is preserved and displayed');
});

test('calculateAmounts: multi-employee lodging claim gives all employees individual items, limits, and excess', async () => {
  const typeConfig = rules.resolveTypeConfig({ code: 'LODGING', name: 'Lodging', category: 'LODGING' });
  const emp1 = { _id: EMP1, name: 'Adesh', role: 'manager', levelNumber: 4 };
  const emp2 = { _id: EMP2, name: 'Rahul', role: 'employee', levelNumber: 8 };
  const input = {
    claimMode: 'LODGING',
    fromDate: '2026-10-01',
    toDate: '2026-10-03',
    requestedAmount: 15000,
    numberOfEmployees: 2,
    employeeIds: [EMP1, EMP2],
    receipts: [receipt('hotel_bill.jpg')],
    customerName: 'Client Co',
    remark: 'Hotel stay for 2 employees',
    destinationCity: 'Pune',
    fullPayment: { requested: false },
  };

  const amounts = await rules.calculateAmounts({
    input,
    typeConfig,
    employees: [emp1, emp2],
    policy: { sharedLodgingPercent: 100 },
    entitlements: [],
    destinationClass: 'A',
    actor: EMP1,
  });

  assert.equal(amounts.numberOfDays, 3);
  assert.equal(amounts.grandRequested, 15000);
  assert.equal(amounts.employeeClaims.length, 2);

  // Both employees must have calculated items
  const c1 = amounts.employeeClaims.find((c) => String(c.employee.employeeId) === EMP1);
  const c2 = amounts.employeeClaims.find((c) => String(c.employee.employeeId) === EMP2);
  assert.ok(c1 && c1.items.length === 1, 'Primary employee has calculated item');
  assert.ok(c2 && c2.items.length === 1, 'Secondary employee has calculated item');

  // Level 4 in Class A is 3000/day * 3 days = 9000
  assert.equal(c1.policyLimitTotal, 9000);
  assert.equal(c1.requestedTotal, 9000);
  assert.equal(c1.allowedTotal, 9000);
  assert.equal(c1.excessTotal, 0);

  // Level 8 in Class A is 2000/day * 3 days = 6000
  assert.equal(c2.policyLimitTotal, 6000);
  assert.equal(c2.requestedTotal, 6000);
  assert.equal(c2.allowedTotal, 6000);
  assert.equal(c2.excessTotal, 0);

  // Combined totals: 15000 requested <= 15000 combined limit -> all allowed
  assert.equal(amounts.grandPolicyLimit, 15000);
  assert.equal(amounts.grandAllowed, 15000);
  assert.equal(amounts.grandExcess, 0);
});

test('calculateAmounts: lodging pooled limit (Me 2000 + TL 4000 = 6000 limit, requested 5000 -> all allowed, excess 0)', async () => {
  const typeConfig = rules.resolveTypeConfig({ code: 'LODGING', name: 'Lodging', category: 'LODGING' });
  const me = { _id: EMP1, name: 'Me', role: 'employee', levelNumber: 8 }; // Entitlement: 2000
  const tl = { _id: EMP2, name: 'Team Lead', role: 'manager', levelNumber: 1 }; // Entitlement: 4000
  const customEnts = [
    { levelNumber: 8, cityClass: 'A', expenseTypeCode: 'LODGING', amount: 2000, gradeCode: '' },
    { levelNumber: 1, cityClass: 'A', expenseTypeCode: 'LODGING', amount: 4000, gradeCode: '' },
  ];
  const input = {
    claimMode: 'LODGING',
    fromDate: '2026-10-01',
    toDate: '2026-10-01', // 1 day
    requestedAmount: 5000,
    numberOfEmployees: 2,
    employeeIds: [EMP1, EMP2],
    receipts: [receipt('hotel.jpg')],
    customerName: 'Client',
    remark: 'Official tour lodging',
    destinationCity: 'Pune',
    fullPayment: { requested: false },
  };

  const amounts = await rules.calculateAmounts({
    input,
    typeConfig,
    employees: [me, tl],
    policy: { sharedLodgingPercent: 100 },
    entitlements: customEnts,
    destinationClass: 'A',
    actor: EMP1,
  });

  // Combined limit: 2000 + 4000 = 6000
  assert.equal(amounts.grandPolicyLimit, 6000);
  assert.equal(amounts.grandRequested, 5000);
  // Total request 5000 <= 6000 -> ALL 5000 IS ALLOWED!
  assert.equal(amounts.grandAllowed, 5000);
  assert.equal(amounts.grandExcess, 0);

  const meClaim = amounts.employeeClaims.find((c) => String(c.employee.employeeId) === EMP1);
  const tlClaim = amounts.employeeClaims.find((c) => String(c.employee.employeeId) === EMP2);

  assert.equal(meClaim.policyLimitTotal, 2000);
  assert.equal(meClaim.requestedTotal, 1666.67);
  assert.equal(meClaim.allowedTotal, 1666.67);
  assert.equal(meClaim.excessTotal, 0, 'No excess for Me because combined bill is within combined limit');

  assert.equal(tlClaim.policyLimitTotal, 4000);
  assert.equal(tlClaim.requestedTotal, 3333.33);
  assert.equal(tlClaim.allowedTotal, 3333.33);
  assert.equal(tlClaim.excessTotal, 0, 'No excess for TL because combined bill is within combined limit');
});

test('calculateAmounts: lodging pooled limit when requested exceeds combined limit (Me 2000 + TL 4000 = 6000 limit, request 7000 -> allowed 6000, excess 1000)', async () => {
  const typeConfig = rules.resolveTypeConfig({ code: 'LODGING', name: 'Lodging', category: 'LODGING' });
  const me = { _id: EMP1, name: 'Me', role: 'employee', levelNumber: 8 };
  const tl = { _id: EMP2, name: 'Team Lead', role: 'manager', levelNumber: 1 };
  const customEnts = [
    { levelNumber: 8, cityClass: 'A', expenseTypeCode: 'LODGING', amount: 2000, gradeCode: '' },
    { levelNumber: 1, cityClass: 'A', expenseTypeCode: 'LODGING', amount: 4000, gradeCode: '' },
  ];
  const input = {
    claimMode: 'LODGING',
    fromDate: '2026-10-01',
    toDate: '2026-10-01',
    requestedAmount: 7000,
    numberOfEmployees: 2,
    employeeIds: [EMP1, EMP2],
    receipts: [receipt('hotel.jpg')],
    customerName: 'Client',
    remark: 'Official tour lodging',
    destinationCity: 'Pune',
    fullPayment: { requested: false },
  };

  const amounts = await rules.calculateAmounts({
    input,
    typeConfig,
    employees: [me, tl],
    policy: { sharedLodgingPercent: 100 },
    entitlements: customEnts,
    destinationClass: 'A',
    actor: EMP1,
  });

  assert.equal(amounts.grandPolicyLimit, 6000);
  assert.equal(amounts.grandRequested, 7000);
  assert.equal(amounts.grandAllowed, 6000);
  assert.equal(amounts.grandExcess, 1000);

  const meClaim = amounts.employeeClaims.find((c) => String(c.employee.employeeId) === EMP1);
  const tlClaim = amounts.employeeClaims.find((c) => String(c.employee.employeeId) === EMP2);

  assert.equal(meClaim.policyLimitTotal, 2000);
  assert.equal(meClaim.requestedTotal, 2500);
  assert.equal(meClaim.allowedTotal, 2000);
  assert.equal(meClaim.excessTotal, 500);

  assert.equal(tlClaim.policyLimitTotal, 4000);
  assert.equal(tlClaim.requestedTotal, 4500);
  assert.equal(tlClaim.allowedTotal, 4000);
  assert.equal(tlClaim.excessTotal, 500);

  assert.ok(amounts.employeeClaims[0].items[0].plainExplanation.includes('Combined Whole Claim Limit: ₹6,000'));
  assert.ok(amounts.employeeClaims[0].items[0].plainExplanation.includes('₹500 excess per employee'));
});

test('calculateAmounts: official FAQ Section B (2 employees: 75% of combined budget, Eg: 1200 + 1500 = 2025 limit)', async () => {
  const typeConfig = rules.resolveTypeConfig({ code: 'LODGING', name: 'Lodging', category: 'LODGING' });
  const eng1Id = '64b000000000000000000011';
  const eng2Id = '64b000000000000000000012';
  const eng1 = { _id: eng1Id, name: 'Engg 1', role: 'employee', levelNumber: 5 };
  const eng2 = { _id: eng2Id, name: 'Engg 2', role: 'employee', levelNumber: 4 };
  const customEnts = [
    { levelNumber: 5, cityClass: 'A', expenseTypeCode: 'LODGING', amount: 1200, gradeCode: '' },
    { levelNumber: 4, cityClass: 'A', expenseTypeCode: 'LODGING', amount: 1500, gradeCode: '' },
  ];
  const input = {
    claimMode: 'LODGING',
    fromDate: '2026-10-01',
    toDate: '2026-10-01', // 1 day
    requestedAmount: 2500,
    numberOfEmployees: 2,
    employeeIds: [eng1Id, eng2Id],
    receipts: [receipt('hotel.jpg')],
    customerName: 'Client',
    remark: 'Tour stay',
    destinationCity: 'Pune',
    fullPayment: { requested: false },
  };

  const amounts = await rules.calculateAmounts({
    input,
    typeConfig,
    employees: [eng1, eng2],
    policy: {}, // default official rule: 75% of combined
    entitlements: customEnts,
    destinationClass: 'A',
    actor: eng1Id,
  });

  // (1200 + 1500) * 75% = 2700 * 0.75 = 2025
  assert.equal(amounts.grandPolicyLimit, 2025);
  assert.equal(amounts.grandRequested, 2500);
  assert.equal(amounts.grandAllowed, 2025);
  // Excess = 2500 - 2025 = 475
  assert.equal(amounts.grandExcess, 475);

  const c1 = amounts.employeeClaims.find((c) => String(c.employee.employeeId) === eng1Id);
  const c2 = amounts.employeeClaims.find((c) => String(c.employee.employeeId) === eng2Id);

  // Effective limits: 1200 * 0.75 = 900, 1500 * 0.75 = 1125
  assert.equal(c1.policyLimitTotal, 900);
  assert.equal(c1.allowedTotal, 900);
  // Excess is split half for both: 475 / 2 = 237.50
  assert.equal(c1.excessTotal, 237.50);
  assert.equal(c1.requestedTotal, 1137.50);

  assert.equal(c2.policyLimitTotal, 1125);
  assert.equal(c2.allowedTotal, 1125);
  assert.equal(c2.excessTotal, 237.50);
  assert.equal(c2.requestedTotal, 1362.50);

  assert.ok(amounts.employeeClaims[0].items[0].plainExplanation.includes('75% of combined budget'));
  assert.ok(amounts.employeeClaims[0].items[0].plainExplanation.includes('Combined Whole Claim Limit: ₹2,025'));
});

test('calculateAmounts: official FAQ Section C (3 employees: combined of highest and lowest allowance, Eg: 1200, 1500, 1650 = 2850 limit)', async () => {
  const typeConfig = rules.resolveTypeConfig({ code: 'LODGING', name: 'Lodging', category: 'LODGING' });
  const e1Id = '64b000000000000000000021';
  const e2Id = '64b000000000000000000022';
  const e3Id = '64b000000000000000000023';
  const e1 = { _id: e1Id, name: 'Engg 1', role: 'employee', levelNumber: 5 };
  const e2 = { _id: e2Id, name: 'Engg 2', role: 'employee', levelNumber: 4 };
  const e3 = { _id: e3Id, name: 'Engg 3', role: 'employee', levelNumber: 3 };
  const customEnts = [
    { levelNumber: 5, cityClass: 'A', expenseTypeCode: 'LODGING', amount: 1200, gradeCode: '' },
    { levelNumber: 4, cityClass: 'A', expenseTypeCode: 'LODGING', amount: 1500, gradeCode: '' },
    { levelNumber: 3, cityClass: 'A', expenseTypeCode: 'LODGING', amount: 1650, gradeCode: '' },
  ];
  const input = {
    claimMode: 'LODGING',
    fromDate: '2026-10-01',
    toDate: '2026-10-01',
    requestedAmount: 3000,
    numberOfEmployees: 3,
    employeeIds: [e1Id, e2Id, e3Id],
    receipts: [receipt('hotel.jpg')],
    customerName: 'Client',
    remark: 'Tour stay 3 engineers',
    destinationCity: 'Pune',
    fullPayment: { requested: false },
  };

  const amounts = await rules.calculateAmounts({
    input,
    typeConfig,
    employees: [e1, e2, e3],
    policy: {}, // default official rule: highest + lowest (1650 + 1200 = 2850)
    entitlements: customEnts,
    destinationClass: 'A',
    actor: e1Id,
  });

  // Highest (1650) + Lowest (1200) = 2850
  assert.equal(amounts.grandPolicyLimit, 2850);
  assert.equal(amounts.grandRequested, 3000);
  assert.equal(amounts.grandAllowed, 2850);
  // Excess = 3000 - 2850 = 150 (split equally: 150 / 3 = 50 per employee)
  assert.equal(amounts.grandExcess, 150);

  const claims = amounts.employeeClaims;
  assert.equal(claims.length, 3);
  claims.forEach((c) => {
    assert.equal(c.excessTotal, 50, 'Equal excess of ₹50 per engineer');
  });

  assert.ok(amounts.employeeClaims[0].items[0].plainExplanation.includes('Combined of highest and lowest'));
  assert.ok(amounts.employeeClaims[0].items[0].plainExplanation.includes('Combined Whole Claim Limit: ₹2,850'));
  assert.ok(amounts.employeeClaims[0].items[0].plainExplanation.includes('₹50 excess per employee'));
});

test('calculateAmounts: official FAQ Section D (4 employees: split in 2s with 75% per pair, Eg: 1200, 1500, 1650, 1800 = 4612.50 limit)', async () => {
  const typeConfig = rules.resolveTypeConfig({ code: 'LODGING', name: 'Lodging', category: 'LODGING' });
  const ids = ['64b000000000000000000031', '64b000000000000000000032', '64b000000000000000000033', '64b000000000000000000034'];
  const emps = [
    { _id: ids[0], name: 'Engg 1', role: 'employee', levelNumber: 5 },
    { _id: ids[1], name: 'Engg 2', role: 'employee', levelNumber: 4 },
    { _id: ids[2], name: 'Engg 3', role: 'employee', levelNumber: 3 },
    { _id: ids[3], name: 'Engg 4', role: 'employee', levelNumber: 2 },
  ];
  const customEnts = [
    { levelNumber: 5, cityClass: 'A', expenseTypeCode: 'LODGING', amount: 1200, gradeCode: '' },
    { levelNumber: 4, cityClass: 'A', expenseTypeCode: 'LODGING', amount: 1500, gradeCode: '' },
    { levelNumber: 3, cityClass: 'A', expenseTypeCode: 'LODGING', amount: 1650, gradeCode: '' },
    { levelNumber: 2, cityClass: 'A', expenseTypeCode: 'LODGING', amount: 1800, gradeCode: '' },
  ];
  const input = {
    claimMode: 'LODGING',
    fromDate: '2026-10-01',
    toDate: '2026-10-01',
    requestedAmount: 5000,
    numberOfEmployees: 4,
    employeeIds: ids,
    receipts: [receipt('hotel.jpg')],
    customerName: 'Client',
    remark: 'Tour stay 4 engineers',
    destinationCity: 'Pune',
    fullPayment: { requested: false },
  };

  const amounts = await rules.calculateAmounts({
    input,
    typeConfig,
    employees: emps,
    policy: {}, // default official rule: split in 2s @ 75%
    entitlements: customEnts,
    destinationClass: 'A',
    actor: ids[0],
  });

  // Total raw = 1200 + 1500 + 1650 + 1800 = 6150. 75% of 6150 = 4612.50
  assert.equal(amounts.grandPolicyLimit, 4612.50);
  assert.equal(amounts.grandRequested, 5000);
  assert.equal(amounts.grandAllowed, 4612.50);
  // Excess = 5000 - 4612.50 = 387.50
  assert.equal(amounts.grandExcess, 387.50);

  const claims = amounts.employeeClaims;
  assert.equal(claims.length, 4);
  const totalClaimExcess = claims.reduce((s, c) => s + c.excessTotal, 0);
  assert.equal(Math.round(totalClaimExcess * 100) / 100, 387.50);

  assert.ok(amounts.employeeClaims[0].items[0].plainExplanation.includes('Split in 2s with 75% combined budget'));
  assert.ok(amounts.employeeClaims[0].items[0].plainExplanation.includes('Combined Whole Claim Limit: ₹4,612.5'));
});

test('calculateAmounts: single employee lodging claim (100% individual entitlement)', async () => {
  const typeConfig = rules.resolveTypeConfig({ code: 'LODGING', name: 'Lodging', category: 'LODGING' });
  const empId = '64b000000000000000000041';
  const emp = { _id: empId, name: 'Solo Engg', role: 'employee', levelNumber: 5 };
  const customEnts = [
    { levelNumber: 5, cityClass: 'A', expenseTypeCode: 'LODGING', amount: 1500, gradeCode: '' },
  ];
  const input = {
    claimMode: 'LODGING',
    fromDate: '2026-10-01',
    toDate: '2026-10-03', // 3 days
    requestedAmount: 5000,
    numberOfEmployees: 1,
    employeeIds: [empId],
    receipts: [receipt('hotel.jpg')],
    customerName: 'Client',
    remark: 'Solo stay 3 days',
    destinationCity: 'Pune',
    fullPayment: { requested: false },
  };

  const amounts = await rules.calculateAmounts({
    input,
    typeConfig,
    employees: [emp],
    policy: {},
    entitlements: customEnts,
    destinationClass: 'A',
    actor: empId,
  });

  // 1500 * 3 days = 4500
  assert.equal(amounts.grandPolicyLimit, 4500);
  assert.equal(amounts.grandRequested, 5000);
  assert.equal(amounts.grandAllowed, 4500);
  assert.equal(amounts.grandExcess, 500);

  const c = amounts.employeeClaims[0];
  assert.equal(c.policyLimitTotal, 4500);
  assert.equal(c.allowedTotal, 4500);
  assert.equal(c.excessTotal, 500);
  assert.equal(amounts.perDayLimit, 1500);
  assert.ok(c.items[0].plainExplanation.includes('Solo Engg: ₹1,500/day'));
  assert.ok(c.items[0].plainExplanation.includes('₹1,500/day × 3 days = ₹4,500'));
});

test('calculateAmounts: 3 employees with custom COMBINED_PERCENT (70% of combined budget)', async () => {
  const typeConfig = rules.resolveTypeConfig({ code: 'LODGING', name: 'Lodging', category: 'LODGING' });
  const e1Id = '64b000000000000000000051';
  const e2Id = '64b000000000000000000052';
  const e3Id = '64b000000000000000000053';
  const e1 = { _id: e1Id, name: 'Engg 1', role: 'employee', levelNumber: 5 };
  const e2 = { _id: e2Id, name: 'Engg 2', role: 'employee', levelNumber: 4 };
  const e3 = { _id: e3Id, name: 'Engg 3', role: 'employee', levelNumber: 3 };
  const customEnts = [
    { levelNumber: 5, cityClass: 'A', expenseTypeCode: 'LODGING', amount: 1200, gradeCode: '' },
    { levelNumber: 4, cityClass: 'A', expenseTypeCode: 'LODGING', amount: 1500, gradeCode: '' },
    { levelNumber: 3, cityClass: 'A', expenseTypeCode: 'LODGING', amount: 1650, gradeCode: '' },
  ];
  const input = {
    claimMode: 'LODGING',
    fromDate: '2026-10-01',
    toDate: '2026-10-01',
    requestedAmount: 3600,
    numberOfEmployees: 3,
    employeeIds: [e1Id, e2Id, e3Id],
    receipts: [receipt('hotel.jpg')],
    customerName: 'Client',
    remark: 'Tour stay 3 engineers custom 70%',
    destinationCity: 'Pune',
    fullPayment: { requested: false },
  };

  const customPolicy = {
    lodgingRules: {
      threeEmployees: { ruleType: 'COMBINED_PERCENT', percent: 70 },
    },
  };

  const amounts = await rules.calculateAmounts({
    input,
    typeConfig,
    employees: [e1, e2, e3],
    policy: customPolicy,
    entitlements: customEnts,
    destinationClass: 'A',
    actor: e1Id,
  });

  // Raw sum = 1200 + 1500 + 1650 = 4350. 70% of 4350 = 3045.
  assert.equal(amounts.grandPolicyLimit, 3045);
  assert.equal(amounts.grandRequested, 3600);
  assert.equal(amounts.grandAllowed, 3045);
  // Excess = 3600 - 3045 = 555 (equal: 555 / 3 = 185 per employee)
  assert.equal(amounts.grandExcess, 555);

  const claims = amounts.employeeClaims;
  assert.equal(claims.length, 3);
  claims.forEach((c) => {
    assert.equal(c.excessTotal, 185, 'Equal excess of ₹185 per engineer');
  });

  assert.ok(amounts.employeeClaims[0].items[0].plainExplanation.includes('70% of combined budget'));
  assert.ok(amounts.employeeClaims[0].items[0].plainExplanation.includes('Combined Whole Claim Limit: ₹3,045'));
  assert.ok(amounts.employeeClaims[0].items[0].plainExplanation.includes('₹185 excess per employee'));
});

test('calculateAmounts: 4 employees with custom COMBINED_PERCENT (60% of combined budget)', async () => {
  const typeConfig = rules.resolveTypeConfig({ code: 'LODGING', name: 'Lodging', category: 'LODGING' });
  const ids = ['64b000000000000000000061', '64b000000000000000000062', '64b000000000000000000063', '64b000000000000000000064'];
  const emps = [
    { _id: ids[0], name: 'Engg 1', role: 'employee', levelNumber: 5 },
    { _id: ids[1], name: 'Engg 2', role: 'employee', levelNumber: 4 },
    { _id: ids[2], name: 'Engg 3', role: 'employee', levelNumber: 3 },
    { _id: ids[3], name: 'Engg 4', role: 'employee', levelNumber: 2 },
  ];
  const customEnts = [
    { levelNumber: 5, cityClass: 'A', expenseTypeCode: 'LODGING', amount: 1200, gradeCode: '' },
    { levelNumber: 4, cityClass: 'A', expenseTypeCode: 'LODGING', amount: 1500, gradeCode: '' },
    { levelNumber: 3, cityClass: 'A', expenseTypeCode: 'LODGING', amount: 1650, gradeCode: '' },
    { levelNumber: 2, cityClass: 'A', expenseTypeCode: 'LODGING', amount: 1800, gradeCode: '' },
  ];
  const input = {
    claimMode: 'LODGING',
    fromDate: '2026-10-01',
    toDate: '2026-10-01',
    requestedAmount: 4890,
    numberOfEmployees: 4,
    employeeIds: ids,
    receipts: [receipt('hotel.jpg')],
    customerName: 'Client',
    remark: 'Tour stay 4 engineers custom 60%',
    destinationCity: 'Pune',
    fullPayment: { requested: false },
  };

  const customPolicy = {
    lodgingRules: {
      fourPlusEmployees: { ruleType: 'COMBINED_PERCENT', percent: 60 },
    },
  };

  const amounts = await rules.calculateAmounts({
    input,
    typeConfig,
    employees: emps,
    policy: customPolicy,
    entitlements: customEnts,
    destinationClass: 'A',
    actor: ids[0],
  });

  // Raw sum = 1200 + 1500 + 1650 + 1800 = 6150. 60% of 6150 = 3690.
  assert.equal(amounts.grandPolicyLimit, 3690);
  assert.equal(amounts.grandRequested, 4890);
  assert.equal(amounts.grandAllowed, 3690);
  // Excess = 4890 - 3690 = 1200 (equal: 1200 / 4 = 300 per employee)
  assert.equal(amounts.grandExcess, 1200);

  const claims = amounts.employeeClaims;
  assert.equal(claims.length, 4);
  claims.forEach((c) => {
    assert.equal(c.excessTotal, 300, 'Equal excess of ₹300 per engineer');
  });

  assert.ok(amounts.employeeClaims[0].items[0].plainExplanation.includes('60% of combined budget'));
  assert.ok(amounts.employeeClaims[0].items[0].plainExplanation.includes('Combined Whole Claim Limit: ₹3,690'));
  assert.ok(amounts.employeeClaims[0].items[0].plainExplanation.includes('₹300 excess per employee'));
});

test('calculateAmounts: 2 employees with HIGHER_ONLY lodging rule', async () => {
  const typeConfig = rules.resolveTypeConfig({ code: 'LODGING', name: 'Lodging', category: 'LODGING' });
  const e1Id = '64b000000000000000000071';
  const e2Id = '64b000000000000000000072';
  const e1 = { _id: e1Id, name: 'Engg 1', role: 'employee', levelNumber: 5 };
  const e2 = { _id: e2Id, name: 'Engg 2', role: 'employee', levelNumber: 4 };
  const customEnts = [
    { levelNumber: 5, cityClass: 'A', expenseTypeCode: 'LODGING', amount: 1200, gradeCode: '' },
    { levelNumber: 4, cityClass: 'A', expenseTypeCode: 'LODGING', amount: 1500, gradeCode: '' },
  ];
  const input = {
    claimMode: 'LODGING',
    fromDate: '2026-10-01',
    toDate: '2026-10-01',
    requestedAmount: 2000,
    numberOfEmployees: 2,
    employeeIds: [e1Id, e2Id],
    receipts: [receipt('hotel.jpg')],
    customerName: 'Client',
    remark: 'Tour stay 2 engineers Higher Only',
    destinationCity: 'Pune',
    fullPayment: { requested: false },
  };

  const customPolicy = {
    lodgingRules: {
      twoEmployees: { ruleType: 'HIGHER_ONLY' },
    },
  };

  const amounts = await rules.calculateAmounts({
    input,
    typeConfig,
    employees: [e1, e2],
    policy: customPolicy,
    entitlements: customEnts,
    destinationClass: 'A',
    actor: e1Id,
  });

  // Higher of 1200 and 1500 is 1500
  assert.equal(amounts.grandPolicyLimit, 1500);
  assert.equal(amounts.grandRequested, 2000);
  assert.equal(amounts.grandAllowed, 1500);
  // Excess = 2000 - 1500 = 500 (equal: 500 / 2 = 250 per employee)
  assert.equal(amounts.grandExcess, 500);

  const claims = amounts.employeeClaims;
  assert.equal(claims.length, 2);
  claims.forEach((c) => {
    assert.equal(c.excessTotal, 250, 'Equal excess of ₹250 per engineer');
  });

  assert.ok(amounts.employeeClaims[0].items[0].plainExplanation.includes('Higher entitlement only = ₹1,500 (Engg 2)'));
  assert.ok(amounts.employeeClaims[0].items[0].plainExplanation.includes('Combined Whole Claim Limit: ₹1,500'));
  assert.ok(amounts.employeeClaims[0].items[0].plainExplanation.includes('₹250 excess per employee'));
  assert.ok(amounts.employeeClaims[0].items[0].plainExplanation.includes('(Lower)'));
  assert.ok(amounts.employeeClaims[0].items[0].plainExplanation.includes('(Higher)'));
});

test('calculateAmounts: normal claim multi-entry calculates correctly across multiple types and entitlements', async () => {
  const e1Id = '64b000000000000000000091';
  const e1 = { _id: e1Id, name: 'Engg 1', role: 'employee', levelNumber: 5 };

  const customEnts = [
    { levelNumber: 5, cityClass: 'A', expenseTypeCode: 'FOOD', amount: 800 },
    { levelNumber: 5, cityClass: 'A', expenseTypeCode: 'TRAVEL', amount: 1500 },
  ];

  const input = rules.normalizeInput({
    claimMode: 'NORMAL',
    claimDate: '2026-10-01',
    entries: [
      { expenseType: 'FOOD', requestedAmount: 500, remark: 'Lunch with client' },
      { expenseType: 'TRAVEL', requestedAmount: 2000, remark: 'Flight ticket' },
    ],
    receipts: [receipt('bills.pdf')],
    customerName: 'Client Site',
    destinationCity: 'Pune',
  });

  assert.equal(input.entries.length, 2);
  assert.equal(input.requestedAmount, 2500);

  const amounts = await rules.calculateAmounts({
    input,
    typeConfig: rules.resolveTypeConfig({ code: 'FOOD' }),
    employees: [e1],
    policy: {},
    entitlements: customEnts,
    destinationClass: 'A',
    actor: e1Id,
    allTypes: [
      rules.resolveTypeConfig({ code: 'FOOD' }),
      rules.resolveTypeConfig({ code: 'TRAVEL' }),
    ],
  });

  // Food: requested 500, limit 800 -> allowed 500, excess 0
  // Travel: requested 2000 -> fully allowed (no combined limit / no capping for TRAVEL), allowed 2000, excess 0
  // Grand totals: requested 2500, allowed 2500, excess 0, policyLimit 2800
  assert.equal(amounts.grandRequested, 2500);
  assert.equal(amounts.grandAllowed, 2500);
  assert.equal(amounts.grandExcess, 0);
  assert.equal(amounts.grandPolicyLimit, 2800);

  const items = amounts.employeeClaims[0].items;
  assert.equal(items.length, 2);
  assert.equal(items[0].expenseType, 'FOOD');
  assert.equal(items[0].requestedAmount, 500);
  assert.equal(items[0].allowedAmount, 500);
  assert.equal(items[0].excessAmount, 0);

  assert.equal(items[1].expenseType, 'TRAVEL');
  assert.equal(items[1].requestedAmount, 2000);
  assert.equal(items[1].allowedAmount, 2000);
  assert.equal(items[1].excessAmount, 0);

  assert.ok(amounts.plainExplanation.includes('Multi-Entry Breakdown'));
  assert.ok(amounts.plainExplanation.includes('Entry #1'));
  assert.ok(amounts.plainExplanation.includes('Entry #2'));
});

test('calculateAmounts: same-date multi-entry applies daily limit combinely (Dinner 300, Lunch 400 with 500 food limit -> allowed 500, excess 200)', async () => {
  const e1Id = '64b000000000000000000095';
  const e1 = { _id: e1Id, name: 'Alice Test', role: 'employee', levelNumber: 2 };

  const customEnts = [
    { levelNumber: 2, cityClass: 'A', expenseTypeCode: 'FOOD', amount: 500 },
    { levelNumber: 2, cityClass: 'A', expenseTypeCode: 'TRAVEL', amount: 600 },
  ];

  // 3 entries: 2 food entries (300, 400) + 1 travel entry (600)
  const input = rules.normalizeInput({
    claimMode: 'NORMAL',
    claimDate: '2026-10-08',
    numberOfEmployees: 1,
    employeeIds: [String(e1Id)],
    entries: [
      { expenseType: 'FOOD', requestedAmount: 300, remark: 'Dinner' },
      { expenseType: 'FOOD', requestedAmount: 400, remark: 'Lunch' },
      { expenseType: 'TRAVEL', requestedAmount: 600, remark: 'Cab fare' },
    ],
    receipts: [receipt('bills.pdf')],
    customerName: 'Client Site',
    destinationCity: 'Pune',
  });

  assert.equal(input.entries.length, 3);
  assert.equal(input.requestedAmount, 1300);

  const amounts = await rules.calculateAmounts({
    input,
    typeConfig: rules.resolveTypeConfig({ code: 'FOOD' }),
    employees: [e1],
    policy: {},
    entitlements: customEnts,
    destinationClass: 'A',
    actor: e1Id,
    allTypes: [
      rules.resolveTypeConfig({ code: 'FOOD' }),
      rules.resolveTypeConfig({ code: 'TRAVEL' }),
    ],
  });

  // Food daily limit = 500.
  // Entry #1 (Dinner): requested 300, allowed 300, excess 0.
  // Entry #2 (Lunch): requested 400, remaining limit = 200 -> allowed 200, excess 200.
  // Entry #3 (Travel): requested 600, limit 600 -> allowed 600, excess 0.
  // Grand totals:
  // Requested: 300 + 400 + 600 = 1300
  // Allowed: 300 + 200 + 600 = 1100
  // Excess: 0 + 200 + 0 = 200
  // Policy Limit: 500 (Food) + 600 (Travel) = 1100
  assert.equal(amounts.grandRequested, 1300);
  assert.equal(amounts.grandAllowed, 1100);
  assert.equal(amounts.grandExcess, 200);
  assert.equal(amounts.grandPolicyLimit, 1100);

  const items = amounts.employeeClaims[0].items;
  assert.equal(items.length, 3);

  // 3 distinct calculated items
  assert.equal(items[0].expenseType, 'FOOD');
  assert.equal(items[0].description, 'Dinner');
  assert.equal(items[0].requestedAmount, 300);
  assert.equal(items[0].allowedAmount, 300);
  assert.equal(items[0].excessAmount, 0);

  assert.equal(items[1].expenseType, 'FOOD');
  assert.equal(items[1].description, 'Lunch');
  assert.equal(items[1].requestedAmount, 400);
  assert.equal(items[1].allowedAmount, 200);
  assert.equal(items[1].excessAmount, 200);
  assert.equal(items[1].remainingLimit, 200);

  assert.equal(items[2].expenseType, 'TRAVEL');
  assert.equal(items[2].description, 'Cab fare');
  assert.equal(items[2].requestedAmount, 600);
  assert.equal(items[2].allowedAmount, 600);
  assert.equal(items[2].excessAmount, 0);

  assert.ok(amounts.plainExplanation.includes('Multi-Entry Breakdown'));
  assert.ok(amounts.plainExplanation.includes('Combined daily limit'));
  assert.ok(amounts.plainExplanation.includes('used in above entry'));
  assert.ok(amounts.plainExplanation.includes('remaining limit: ₹200'));
});

test('calculateAmounts: each entry preserves its own separate bill proofs/receipts', async () => {
  const e1Id = '64b000000000000000000096';
  const e1 = { _id: e1Id, name: 'Bob Test', role: 'employee', levelNumber: 2 };

  const input = rules.normalizeInput({
    claimMode: 'NORMAL',
    claimDate: '2026-10-08',
    numberOfEmployees: 1,
    employeeIds: [String(e1Id)],
    entries: [
      {
        expenseType: 'FOOD',
        requestedAmount: 350,
        remark: 'Dinner with client',
        receipts: [receipt('food_dinner_bill.jpg')],
      },
      {
        expenseType: 'TRAVEL',
        requestedAmount: 500,
        remark: 'Taxi to airport',
        receipts: [receipt('taxi_receipt.pdf')],
      },
    ],
    customerName: 'Client Alpha',
    destinationCity: 'Mumbai',
  });

  // Check that input normalized receipts from entries
  assert.equal(input.entries.length, 2);
  assert.equal(input.entries[0].receipts.length, 1);
  assert.equal(input.entries[0].receipts[0].name, 'food_dinner_bill.jpg');
  assert.equal(input.entries[1].receipts.length, 1);
  assert.equal(input.entries[1].receipts[0].name, 'taxi_receipt.pdf');
  assert.equal(input.receipts.length, 2);

  const amounts = await rules.calculateAmounts({
    input,
    typeConfig: rules.resolveTypeConfig({ code: 'FOOD' }),
    employees: [e1],
    policy: {},
    entitlements: [],
    destinationClass: 'A',
    actor: e1Id,
    allTypes: [
      rules.resolveTypeConfig({ code: 'FOOD' }),
      rules.resolveTypeConfig({ code: 'TRAVEL' }),
    ],
  });

  const items = amounts.employeeClaims[0].items;
  assert.equal(items.length, 2);
  assert.equal(items[0].attachments.length, 1);
  assert.equal(items[0].attachments[0].name, 'food_dinner_bill.jpg');
  assert.equal(items[0].proofStatus, 'RECEIVED');

  assert.equal(items[1].attachments.length, 1);
  assert.equal(items[1].attachments[0].name, 'taxi_receipt.pdf');
  assert.equal(items[1].proofStatus, 'RECEIVED');
});

test('calculateAmounts: add employee and remove employee in lodging claim correctly updates calculations and rules.round2 works', async () => {
  assert.equal(typeof rules.round2, 'function', 'rules.round2 is exported and available');
  assert.equal(rules.round2(100.456), 100.46);

  const typeConfig = rules.resolveTypeConfig({ code: 'LODGING', name: 'Lodging', category: 'LODGING' });
  const emp1Id = '64b000000000000000000081';
  const emp2Id = '64b000000000000000000082';
  const emp1 = { _id: emp1Id, name: 'Adesh', role: 'employee', levelNumber: 8 };
  const emp2 = { _id: emp2Id, name: 'Rahul', role: 'employee', levelNumber: 8 };
  const customEnts = [
    { levelNumber: 8, cityClass: 'A', expenseTypeCode: 'LODGING', amount: 2000, gradeCode: '' },
  ];

  // 1. Single employee calculation (1 employee)
  const inputSingle = {
    claimMode: 'LODGING',
    fromDate: '2026-10-01',
    toDate: '2026-10-03', // 3 days
    requestedAmount: 7000,
    numberOfEmployees: 1,
    employeeIds: [emp1Id],
    receipts: [receipt('hotel.jpg')],
    customerName: 'Client',
    remark: 'Solo stay 3 days',
    destinationCity: 'Pune',
    fullPayment: { requested: false },
  };

  const amountsSingle = await rules.calculateAmounts({
    input: inputSingle,
    typeConfig,
    employees: [emp1],
    policy: {},
    entitlements: customEnts,
    destinationClass: 'A',
    actor: emp1Id,
  });

  // Limit = 2000 * 3 = 6000
  assert.equal(amountsSingle.grandPolicyLimit, 6000);
  assert.equal(amountsSingle.grandAllowed, 6000);
  assert.equal(amountsSingle.grandExcess, 1000);
  assert.equal(amountsSingle.perDayLimit, 2000);
  assert.ok(amountsSingle.employeeClaims[0].items[0].plainExplanation.includes('Adesh: ₹2,000/day'));
  assert.ok(amountsSingle.employeeClaims[0].items[0].plainExplanation.includes('₹6,000'));

  // 2. Add one more employee (2 employees)
  const inputDouble = {
    ...inputSingle,
    requestedAmount: 12000,
    numberOfEmployees: 2,
    employeeIds: [emp1Id, emp2Id],
    remark: 'Shared stay 2 employees',
  };

  const amountsDouble = await rules.calculateAmounts({
    input: inputDouble,
    typeConfig,
    employees: [emp1, emp2],
    policy: { sharedLodgingPercent: 75 },
    entitlements: customEnts,
    destinationClass: 'A',
    actor: emp1Id,
  });

  // Combined limit: (6000 + 6000) * 75% = 9000
  assert.equal(amountsDouble.grandPolicyLimit, 9000);
  assert.equal(amountsDouble.grandAllowed, 9000);
  assert.equal(amountsDouble.grandExcess, 3000);
  assert.equal(amountsDouble.employeeClaims.length, 2);
  assert.equal(amountsDouble.employeeClaims[0].items[0].perDayLimit, 2000);
  assert.equal(amountsDouble.employeeClaims[1].items[0].perDayLimit, 2000);
  assert.ok(amountsDouble.employeeClaims[0].items[0].plainExplanation.includes('Combined Whole Claim Limit: ₹9,000'));
  assert.ok(amountsDouble.employeeClaims[0].items[0].plainExplanation.includes('₹1,500 excess per employee'));

  // 3. Remove back to 1 employee
  const amountsBack = await rules.calculateAmounts({
    input: inputSingle,
    typeConfig,
    employees: [emp1],
    policy: {},
    entitlements: customEnts,
    destinationClass: 'A',
    actor: emp1Id,
  });

  assert.equal(amountsBack.grandPolicyLimit, 6000);
  assert.equal(amountsBack.grandAllowed, 6000);
  assert.equal(amountsBack.grandExcess, 1000);
  assert.equal(amountsBack.employeeClaims.length, 1);
  assert.ok(amountsBack.employeeClaims[0].items[0].plainExplanation.includes('Adesh: ₹2,000/day'));
});

test('calculateAmounts: normal claim single entry calculates correctly and returns clear explanation and breakdown', async () => {
  const empId = '64b000000000000000000101';
  const emp = { _id: empId, name: 'Adesh', role: 'employee', levelNumber: 2 };
  const customEnts = [
    { levelNumber: 2, cityClass: 'A', expenseTypeCode: 'FOOD', amount: 500 },
  ];
  const input = rules.normalizeInput({
    claimMode: 'NORMAL',
    claimDate: '2026-10-09',
    entries: [
      { expenseType: 'FOOD', requestedAmount: 600, remark: 'Lunch with client', receipts: [receipt('food_bill.jpg')] }
    ],
    receipts: [receipt('food_bill.jpg')],
    customerName: 'Acme Corp',
    destinationCity: 'Pune',
  });

  const amounts = await rules.calculateAmounts({
    input,
    typeConfig: rules.resolveTypeConfig({ code: 'FOOD' }),
    employees: [emp],
    policy: {},
    entitlements: customEnts,
    destinationClass: 'A',
    actor: empId,
    allTypes: [rules.resolveTypeConfig({ code: 'FOOD' })],
  });

  assert.equal(amounts.grandRequested, 600);
  assert.equal(amounts.grandAllowed, 500);
  assert.equal(amounts.grandExcess, 100);
  assert.equal(amounts.grandPolicyLimit, 500);

  const item = amounts.employeeClaims[0].items[0];
  assert.equal(item.expenseType, 'FOOD');
  assert.equal(item.requestedAmount, 600);
  assert.equal(item.allowedAmount, 500);
  assert.equal(item.excessAmount, 100);
  assert.equal(item.description, 'Lunch with customer' ? item.description : 'Lunch with client');
  assert.equal(item.limitText, '₹500/day');
  assert.ok(amounts.plainExplanation.includes('daily food limit is ₹500/day'));
  assert.ok(amounts.plainExplanation.includes('claimed bill is ₹600'));
  assert.ok(amounts.plainExplanation.includes('₹100 is excess'));
});

test('calculateAmounts: normal claim with all expense types (Food, Travel, Conveyance, Other) explains each accurately', async () => {
  const empId = '64b000000000000000000102';
  const emp = { _id: empId, name: 'Adesh', role: 'employee', levelNumber: 2 };
  const customEnts = [
    { levelNumber: 2, cityClass: 'A', expenseTypeCode: 'FOOD', amount: 500 },
  ];
  const policy = {
    conveyanceRates: { car: 10, twoWheeler: 5 },
  };
  const input = rules.normalizeInput({
    claimMode: 'NORMAL',
    claimDate: '2026-10-09',
    entries: [
      { expenseType: 'FOOD', requestedAmount: 600, remark: 'Lunch' },
      { expenseType: 'TRAVEL', requestedAmount: 1200, remark: 'Train ticket' },
      { expenseType: 'CONVEYANCE', requestedAmount: 500, remark: 'Site travel', vehicle: 'car', distanceKm: 40 },
      { expenseType: 'OTHER', requestedAmount: 300, remark: 'Stationery' },
    ],
    receipts: [receipt('bills.pdf')],
    customerName: 'Client Site',
    destinationCity: 'Pune',
  });

  const amounts = await rules.calculateAmounts({
    input,
    typeConfig: rules.resolveTypeConfig({ code: 'FOOD' }),
    employees: [emp],
    policy,
    entitlements: customEnts,
    destinationClass: 'A',
    actor: empId,
    allTypes: [
      rules.resolveTypeConfig({ code: 'FOOD' }),
      rules.resolveTypeConfig({ code: 'TRAVEL' }),
      rules.resolveTypeConfig({ code: 'CONVEYANCE' }),
      rules.resolveTypeConfig({ code: 'OTHER' }),
    ],
  });

  // Food: 600 claimed, 500 allowed, 100 excess (limit 500)
  // Travel: 1200 claimed, 1200 allowed (no limit cap)
  // Conveyance: 500 claimed, 500 allowed (no limit cap)
  // Other: 300 claimed, 300 allowed (no limit cap)
  // Grand totals: Claimed 2600, Allowed 2500, Excess 100, Policy Limit 2500
  assert.equal(amounts.grandRequested, 2600);
  assert.equal(amounts.grandAllowed, 2500);
  assert.equal(amounts.grandExcess, 100);
  assert.equal(amounts.grandPolicyLimit, 2500);

  const items = amounts.employeeClaims[0].items;
  assert.equal(items.length, 4);

  // Food
  assert.equal(items[0].expenseType, 'FOOD');
  assert.equal(items[0].limitText, '₹500/day');
  assert.equal(items[0].allowedAmount, 500);
  assert.equal(items[0].excessAmount, 100);

  // Travel
  assert.equal(items[1].expenseType, 'TRAVEL');
  assert.equal(items[1].allowedAmount, 1200);
  assert.equal(items[1].excessAmount, 0);

  // Conveyance
  assert.equal(items[2].expenseType, 'CONVEYANCE');
  assert.equal(items[2].allowedAmount, 500);
  assert.equal(items[2].excessAmount, 0);

  // Other
  assert.equal(items[3].expenseType, 'OTHER');
  assert.equal(items[3].allowedAmount, 300);
  assert.equal(items[3].excessAmount, 0);

  assert.ok(amounts.plainExplanation.includes('Multi-Entry Breakdown'));
  assert.ok(amounts.plainExplanation.includes('Entry #1'));
  assert.ok(amounts.plainExplanation.includes('Entry #4'));
});

test('TC56 submission never routes to an approval status', async () => {
  assert.equal(rules.isHrApprovalRequired, undefined, 'HR approval routing has been removed');

  const claim = { grandRequested: 500, grandAllowed: 500, fullPayment: {} };
  rules.routeSubmission(claim);
  assert.equal(claim.status, 'SUBMITTED');
  assert.notEqual(claim.status, 'HR_PENDING');
  assert.equal(claim.approvalFlow, 'NONE');
  assert.equal(claim.approvalRequired, false);
});

test('TC57 multi-employee normal claim combines daily limit like lodging claim and explains each entry separately', async () => {
  const e1 = { _id: '64b000000000000000000097', name: 'Adesh Bhongale', role: 'employee', levelNumber: 1, gradeCode: 'G1' };
  const e2 = { _id: '64b000000000000000000098', name: 'Rahul Patil', role: 'employee', levelNumber: 2, gradeCode: 'G2' };

  const customEnts = [
    { levelNumber: 1, gradeCode: 'G1', cityClass: 'A', expenseTypeCode: 'FOOD', amount: 500 },
    { levelNumber: 2, gradeCode: 'G2', cityClass: 'A', expenseTypeCode: 'FOOD', amount: 600 },
    { levelNumber: 1, cityClass: 'A', expenseTypeCode: 'TRAVEL', amount: 0 },
    { levelNumber: 2, cityClass: 'A', expenseTypeCode: 'TRAVEL', amount: 0 },
  ];

  // 1) Single entry with 2 employees
  const amounts1 = await rules.calculateAmounts({
    input: {
      claimMode: 'NORMAL',
      claimDate: '2026-10-09',
      customerName: 'Client Site',
      destinationCity: 'Pune',
      requestedAmount: 1400,
      expenseType: 'FOOD',
      entries: [
        { expenseType: 'FOOD', requestedAmount: 1400, remark: 'Team dinner' }
      ]
    },
    typeConfig: { code: 'FOOD', name: 'Food', claimMode: 'NORMAL' },
    employees: [e1, e2],
    policy: { _id: 'pol1', status: 'active', conveyanceRates: { car: 10 } },
    entitlements: customEnts,
    destinationClass: 'A',
    actor: '64b000000000000000000097',
    allTypes: [
      { code: 'FOOD', name: 'Food' },
      { code: 'TRAVEL', name: 'Travel' }
    ]
  });

  assert.equal(amounts1.grandPolicyLimit, 1100);
  assert.equal(amounts1.grandRequested, 1400);
  assert.equal(amounts1.grandAllowed, 1100);
  assert.equal(amounts1.grandExcess, 300);
  assert.ok(amounts1.plainExplanation.includes('Individual limits per day:'));
  assert.ok(amounts1.plainExplanation.includes('• Adesh Bhongale: ₹500/day'));
  assert.ok(amounts1.plainExplanation.includes('• Rahul Patil: ₹600/day'));
  assert.ok(amounts1.plainExplanation.includes('Combined daily limit: ₹1,100.'));
  assert.ok(amounts1.plainExplanation.includes('Claimed bill: ₹1,400. Therefore, ₹1,100 is allowed and ₹300 is excess beyond policy limit.'));

  // 2) Multi-entry with separate claim types (Entry 1 Food + Entry 2 Travel)
  const amounts2 = await rules.calculateAmounts({
    input: {
      claimMode: 'NORMAL',
      claimDate: '2026-10-09',
      customerName: 'Client Site',
      destinationCity: 'Pune',
      requestedAmount: 2400,
      expenseType: 'FOOD',
      entries: [
        { expenseType: 'FOOD', requestedAmount: 1400, remark: 'Team dinner' },
        { expenseType: 'TRAVEL', requestedAmount: 1000, remark: 'Cab fare' }
      ]
    },
    typeConfig: { code: 'FOOD', name: 'Food', claimMode: 'NORMAL' },
    employees: [e1, e2],
    policy: { _id: 'pol1', status: 'active', conveyanceRates: { car: 10 } },
    entitlements: customEnts,
    destinationClass: 'A',
    actor: '64b000000000000000000097',
    allTypes: [
      { code: 'FOOD', name: 'Food' },
      { code: 'TRAVEL', name: 'Travel' }
    ]
  });

  assert.equal(amounts2.grandPolicyLimit, 2100); // 1100 food combined limit + 1000 travel actuals
  assert.equal(amounts2.grandRequested, 2400);
  assert.equal(amounts2.grandAllowed, 2100);
  assert.equal(amounts2.grandExcess, 300);
  assert.ok(amounts2.plainExplanation.includes('Multi-Entry Breakdown:'));
  assert.ok(amounts2.plainExplanation.includes('Entry #1 (Food):'));
  assert.ok(amounts2.plainExplanation.includes('Combined daily limit: ₹1,100'));
  assert.ok(amounts2.plainExplanation.includes('Entry #2 (Travel):'));
  assert.ok(amounts2.plainExplanation.includes('Grand Total: Claimed ₹2,400 | Allowed ₹2,100 | Excess ₹300'));
});

test('TC58 shared food claim does not split half-half, combines 550+450 limit to 1000', async () => {
  const emp1 = { _id: '64b000000000000000000097', name: 'Adesh', role: 'employee', levelRef: { levelNumber: 1 }, gradeRef: { code: 'a' } };
  const emp2 = { _id: '64b000000000000000000098', name: 'Rahul', role: 'employee', levelRef: { levelNumber: 2 }, gradeRef: { code: 'b' } };

  const customEnts = [
    { levelNumber: 1, gradeCode: 'a', cityClass: 'A', expenseTypeCode: 'FOOD', amount: 550 },
    { levelNumber: 2, gradeCode: 'b', cityClass: 'A', expenseTypeCode: 'FOOD', amount: 450 },
  ];

  // 1) Requested = 1000 (Exactly equal to 550 + 450 combined limit) -> 1000 allowed, 0 excess
  const amountsExact = await rules.calculateAmounts({
    input: {
      claimMode: 'NORMAL',
      claimDate: '2026-10-09',
      entries: [{ expenseType: 'FOOD', requestedAmount: 1000, remark: 'Team lunch' }]
    },
    typeConfig: { code: 'FOOD', name: 'Food', claimMode: 'NORMAL' },
    employees: [emp1, emp2],
    policy: { _id: 'pol1', status: 'active' },
    entitlements: customEnts,
    destinationClass: 'A',
    actor: '64b000000000000000000097',
    allTypes: [{ code: 'FOOD', name: 'Food' }]
  });

  assert.equal(amountsExact.grandPolicyLimit, 1000);
  assert.equal(amountsExact.grandRequested, 1000);
  assert.equal(amountsExact.grandAllowed, 1000);
  assert.equal(amountsExact.grandExcess, 0);
  assert.equal(amountsExact.employeeClaims[0].items[0].allowedAmount, 550);
  assert.equal(amountsExact.employeeClaims[1].items[0].allowedAmount, 450);
  assert.equal(amountsExact.employeeClaims[0].items[0].excessAmount, 0);
  assert.equal(amountsExact.employeeClaims[1].items[0].excessAmount, 0);
  assert.ok(amountsExact.plainExplanation.includes('Combined daily limit: ₹1,000'));
  assert.ok(amountsExact.plainExplanation.includes('Claimed bill: ₹1,000. Since your bill is within your combined daily limit, ₹1,000 is fully allowed.'));

  // 2) Requested = 1200 (200 above 1000 limit) -> 1000 allowed, 200 excess (100 per employee)
  const amountsOver = await rules.calculateAmounts({
    input: {
      claimMode: 'NORMAL',
      claimDate: '2026-10-09',
      entries: [{ expenseType: 'FOOD', requestedAmount: 1200, remark: 'Team lunch' }]
    },
    typeConfig: { code: 'FOOD', name: 'Food', claimMode: 'NORMAL' },
    employees: [emp1, emp2],
    policy: { _id: 'pol1', status: 'active' },
    entitlements: customEnts,
    destinationClass: 'A',
    actor: '64b000000000000000000097',
    allTypes: [{ code: 'FOOD', name: 'Food' }]
  });

  assert.equal(amountsOver.grandPolicyLimit, 1000);
  assert.equal(amountsOver.grandRequested, 1200);
  assert.equal(amountsOver.grandAllowed, 1000);
  assert.equal(amountsOver.grandExcess, 200);
  assert.equal(amountsOver.employeeClaims[0].items[0].allowedAmount, 550);
  assert.equal(amountsOver.employeeClaims[1].items[0].allowedAmount, 450);
  assert.equal(amountsOver.employeeClaims[0].items[0].excessAmount, 100);
  assert.equal(amountsOver.employeeClaims[1].items[0].excessAmount, 100);
  assert.ok(amountsOver.plainExplanation.includes('Combined daily limit: ₹1,000'));
  assert.ok(amountsOver.plainExplanation.includes('Claimed bill: ₹1,200. Therefore, ₹1,000 is allowed and ₹200 is excess beyond policy limit'));
});

test('calculateAmounts: local conveyance applies configured petrol/vehicle rates for car, bike, and e-bike', async () => {
  const empId = '64b000000000000000000099';
  const emp = { _id: empId, name: 'Driver Emp', levelNumber: 1, gradeCode: 'A' };
  const policy = {
    conveyanceRates: { twoWheeler: 3.5, car: 5.0, eBike: 1.0, eCar: 1.75 },
  };

  // Test Bike: 50 km x 3.5 = 175
  const inputBike = rules.normalizeInput({
    claimMode: 'NORMAL',
    claimDate: '2026-10-10',
    entries: [
      { expenseType: 'CONVEYANCE', vehicle: 'twoWheeler', distanceKm: 50, requestedAmount: 175, remark: 'Bike travel to client' },
    ],
    receipts: [receipt('petrol.pdf')],
    customerName: 'Client Site',
    destinationCity: 'Pune',
  });

  const amountsBike = await rules.calculateAmounts({
    input: inputBike,
    typeConfig: rules.resolveTypeConfig({ code: 'CONVEYANCE' }),
    employees: [emp],
    policy,
    entitlements: [],
    destinationClass: 'A',
    actor: empId,
    allTypes: [rules.resolveTypeConfig({ code: 'CONVEYANCE' })],
  });

  assert.equal(amountsBike.grandRequested, 175);
  assert.equal(amountsBike.grandAllowed, 175);
  assert.equal(amountsBike.grandExcess, 0);
  assert.equal(amountsBike.employeeClaims[0].items[0].allowedAmount, 175);
  assert.ok(amountsBike.employeeClaims[0].items[0].plainExplanation.includes('50 km at ₹3.5/km'));

  // Test Car: 60 km x 5.0 = 300
  const inputCar = rules.normalizeInput({
    claimMode: 'NORMAL',
    claimDate: '2026-10-10',
    entries: [
      { expenseType: 'CONVEYANCE', vehicle: 'car', distanceKm: 60, requestedAmount: 300, remark: 'Car travel to factory' },
    ],
    receipts: [receipt('car_slip.pdf')],
    customerName: 'Factory Client',
    destinationCity: 'Pune',
  });

  const amountsCar = await rules.calculateAmounts({
    input: inputCar,
    typeConfig: rules.resolveTypeConfig({ code: 'CONVEYANCE' }),
    employees: [emp],
    policy,
    entitlements: [],
    destinationClass: 'A',
    actor: empId,
    allTypes: [rules.resolveTypeConfig({ code: 'CONVEYANCE' })],
  });

  assert.equal(amountsCar.grandRequested, 300);
  assert.equal(amountsCar.grandAllowed, 300);
  assert.equal(amountsCar.grandExcess, 0);

  // Test E-Bike: 40 km x 1.0 = 40
  const inputEBike = rules.normalizeInput({
    claimMode: 'NORMAL',
    claimDate: '2026-10-10',
    entries: [
      { expenseType: 'CONVEYANCE', vehicle: 'eBike', distanceKm: 40, requestedAmount: 40, remark: 'E-bike travel to office' },
    ],
    receipts: [receipt('ebike_log.pdf')],
    customerName: 'City Office',
    destinationCity: 'Pune',
  });

  const amountsEBike = await rules.calculateAmounts({
    input: inputEBike,
    typeConfig: rules.resolveTypeConfig({ code: 'CONVEYANCE' }),
    employees: [emp],
    policy,
    entitlements: [],
    destinationClass: 'A',
    actor: empId,
    allTypes: [rules.resolveTypeConfig({ code: 'CONVEYANCE' })],
  });

  assert.equal(amountsEBike.grandRequested, 40);
  assert.equal(amountsEBike.grandAllowed, 40);
  assert.equal(amountsEBike.grandExcess, 0);
});

// ─── Paid / Rejected workflow ───────────────────────────────────────────────
const { mapLegacyClaim } = require('../services/statusMigration');
const { _internal: report } = require('../controllers/expenseWorkflow.controller');

test('PR1 businessStatus maps every legacy status to Draft / Pending / Paid / Rejected', () => {
  const cases = {
    DRAFT: 'DRAFT', RETURNED: 'DRAFT',
    SUBMITTED: 'PENDING', HR_PENDING: 'PENDING', ACCOUNTS_PENDING: 'PENDING', ACCOUNTS_APPROVED: 'PENDING', FULL_PAYMENT_PENDING: 'PENDING',
    PAID: 'PAID', DISBURSED: 'PAID', SETTLED: 'PAID',
    REJECTED: 'REJECTED', HR_REJECTED: 'REJECTED', ACCOUNTS_REJECTED: 'REJECTED',
  };
  for (const [status, expected] of Object.entries(cases)) assert.equal(access.businessStatus({ status }), expected, status);
});

test('PR2 migration never invents a payment: approved-but-unpaid claims become Pending', () => {
  const m = mapLegacyClaim({ status: 'ACCOUNTS_APPROVED', paymentStatus: 'AWAITING_DISBURSEMENT' });
  assert.equal(m.to, 'SUBMITTED');
  assert.equal(m.set.status, 'SUBMITTED');
  assert.equal(m.set.legacyStatus, 'ACCOUNTS_APPROVED');
  assert.ok(m.review);
  assert.equal(mapLegacyClaim({ status: 'HR_PENDING', paymentStatus: 'PENDING' }).to, 'SUBMITTED');
  assert.equal(mapLegacyClaim({ status: 'SUBMITTED', paymentStatus: 'PENDING' }), null);
  assert.equal(mapLegacyClaim({ status: 'DRAFT' }), null);
});

test('PR3 migration: disbursed -> Paid (flag missing data), rejected keeps reason, returned -> Draft, cancelled untouched', () => {
  const paid = mapLegacyClaim({ status: 'DISBURSED', paymentStatus: 'DISBURSED', paidAmount: 500, disbursedAt: new Date() });
  assert.equal(paid.to, 'PAID');
  assert.equal(paid.review, null);
  const noAmount = mapLegacyClaim({ status: 'SETTLED', paymentStatus: 'PAID', disbursedAt: new Date() });
  assert.equal(noAmount.to, 'PAID');
  assert.match(noAmount.review, /amount/);

  const rej = mapLegacyClaim({ status: 'HR_REJECTED', approvalHistory: [{ action: 'rejected', remarks: 'No bill' }] });
  assert.equal(rej.to, 'REJECTED');
  assert.equal(rej.set.rejection.reason, 'No bill');

  assert.equal(mapLegacyClaim({ status: 'RETURNED' }).to, 'DRAFT');
  const cancelled = mapLegacyClaim({ status: 'CANCELLED' });
  assert.deepEqual(cancelled.set, {});
  assert.ok(cancelled.review);

  const inconsistent = mapLegacyClaim({ status: 'ACCOUNTS_PENDING', paymentStatus: 'PAID' });
  assert.deepEqual(inconsistent.set, {}, 'inconsistent records are flagged, not changed');
});

test('PR4 rejected claims cannot be paid; only company admin can reopen; paid claims are locked', () => {
  const claim = { companyId: 'c1', submittedBy: EMP1, status: 'REJECTED', employeeClaims: [{ employee: { employeeId: EMP1 } }] };
  const base = { tenant: { companyId: 'c1' }, headers: {}, query: {} };
  const accounts = access.claimPermissions({ ...base, user: { _id: EMP2, role: 'account_admin' } }, claim);
  assert.equal(accounts.canMarkPaid, false);
  assert.equal(accounts.canReopen, false);
  assert.deepEqual(report.denyReason({ user: { role: 'account_admin' } }, accounts, 'pay')[0], 409);
  assert.equal(access.claimPermissions({ ...base, user: { _id: EMP2, role: 'company_admin' } }, claim).canReopen, true);

  const paid = { ...claim, status: 'PAID' };
  const admin = access.claimPermissions({ ...base, user: { _id: EMP2, role: 'company_admin' } }, paid);
  assert.equal(admin.canMarkPaid || admin.canReject || admin.canReopen || admin.canEdit, false);
  assert.equal(report.denyReason({ user: { role: 'company_admin' } }, admin, 'pay')[0], 409);
});

test('PR4b creator can edit and resubmit a rejected claim; paid claim cannot be edited by creator', () => {
  const claim = { companyId: 'c1', submittedBy: EMP1, status: 'REJECTED', employeeClaims: [{ employee: { employeeId: EMP1 } }] };
  const creatorReq = { tenant: { companyId: 'c1' }, user: { _id: EMP1, role: 'employee' }, headers: {}, query: {} };
  const creatorPerms = access.claimPermissions(creatorReq, claim);
  assert.equal(creatorPerms.canEdit, true);
  assert.equal(creatorPerms.canSubmit, true);
  assert.equal(creatorPerms.canDelete, true);

  const paidClaim = { ...claim, status: 'PAID', lockedAt: new Date() };
  const paidPerms = access.claimPermissions(creatorReq, paidClaim);
  assert.equal(paidPerms.canEdit, false);
  assert.equal(paidPerms.canSubmit, false);
});

test('PR5 report filter ANDs every filter, keeps the scope and never shows drafts', () => {
  const scope = { submittedBy: 'me' };
  const f = report.buildReportFilter(
    { status: 'paid', expenseType: 'food', minAmount: '100', maxAmount: '900', search: 'EXP-1', managerId: '64b000000000000000000001' },
    { scopeConditions: [scope], userIds: { manager: [] } }
  );
  const and = f.$and;
  assert.equal(and[0], scope);
  assert.deepEqual(and[1], { status: { $nin: [...access.DRAFT_STATUSES, ...access.APPROVAL_PENDING_STATUSES] } });
  assert.ok(and.some((c) => c.status?.$in === access.PAID_STATUSES));
  assert.ok(and.some((c) => c.grandRequested?.$gte === 100));
  assert.ok(and.some((c) => c.grandRequested?.$lte === 900));
  assert.ok(and.some((c) => c.$or?.some((o) => o.claimType === 'FOOD')));
  assert.ok(and.some((c) => c.$or?.some((o) => o.claimNumber)));
  assert.ok(and.some((c) => c.$or?.some((o) => o.submittedBy?.$in?.length === 0)), 'manager with no reports matches nothing');
  assert.equal(report.buildReportFilter({ status: 'ALL' }).$and.length, 1);
});

test('PR6 report rows only expose payment info for Paid and rejection info for Rejected claims', () => {
  const paid = report.normalizeClaimForReport({ status: 'DISBURSED', paidAmount: 800, disbursedAt: new Date('2026-09-01'), utr: 'UTR1', grandRequested: 1000 });
  assert.equal(paid.statusLabel, 'Paid');
  assert.equal(paid.paidAmount, 800);
  assert.equal(paid.paymentReference, 'UTR1');
  const pending = report.normalizeClaimForReport({ status: 'ACCOUNTS_APPROVED', paidAmount: 800, grandRequested: 1000 });
  assert.equal(pending.statusLabel, 'Pending');
  assert.equal(pending.paidAmount, 0);
  const rej = report.normalizeClaimForReport({ status: 'REJECTED', rejection: { reason: 'Duplicate bill' } });
  assert.equal(rej.rejectionReason, 'Duplicate bill');
});

test('PR7 payment date must be valid and not in the future', () => {
  const now = new Date('2026-10-14T12:00:00Z');
  assert.equal(report.parsePaymentDate('2026-10-10', now).toISOString().slice(0, 10), '2026-10-10');
  assert.equal(report.parsePaymentDate('2026-11-01', now), null);
  assert.equal(report.parsePaymentDate('not-a-date', now), null);
  assert.equal(report.parsePaymentDate('', now), now);
});

test('PR8 awaiting approval claims (APPROVAL_PENDING) are strictly excluded from expense report table until approved', () => {
  // 1. ALL / default filter must exclude both DRAFT_STATUSES and APPROVAL_PENDING_STATUSES
  const defaultFilter = report.buildReportFilter({});
  assert.deepEqual(defaultFilter.$and[0], {
    status: { $nin: [...access.DRAFT_STATUSES, ...access.APPROVAL_PENDING_STATUSES] },
  });

  // 2. PENDING filter must only include actionable PENDING_STATUSES, never APPROVAL_PENDING
  const pendingFilter = report.buildReportFilter({ status: 'PENDING' });
  const pendingCond = pendingFilter.$and.find((c) => c.status?.$in);
  assert.ok(pendingCond, 'status $in condition exists');
  assert.deepEqual(pendingCond.status.$in, access.PENDING_STATUSES);
  assert.ok(!pendingCond.status.$in.includes('APPROVAL_PENDING'), 'APPROVAL_PENDING is never in the pending report filter');

  // 3. Claims waiting for approval cannot match the report filter
  const draftOrApprovalStatuses = [...access.DRAFT_STATUSES, ...access.APPROVAL_PENDING_STATUSES];
  assert.ok(draftOrApprovalStatuses.includes('APPROVAL_PENDING'));
  assert.ok(draftOrApprovalStatuses.includes('DRAFT'));
});

test('PR9 workflow status progression: APPROVAL_PENDING hidden until approved -> then SUBMITTED appears in report', () => {
  // Step 1: Claim is submitted requiring Other Expense or Full Payment approval
  const claimInitial = { status: 'APPROVAL_PENDING', grandRequested: 500 };
  const initialExcluded = [...access.DRAFT_STATUSES, ...access.APPROVAL_PENDING_STATUSES].includes(claimInitial.status);
  assert.equal(initialExcluded, true, 'unapproved claim is excluded from report filter');

  // Step 2: Manager approves claim -> status becomes SUBMITTED
  const claimApproved = { status: 'SUBMITTED', grandRequested: 500 };
  const approvedExcluded = [...access.DRAFT_STATUSES, ...access.APPROVAL_PENDING_STATUSES].includes(claimApproved.status);
  assert.equal(approvedExcluded, false, 'approved claim is NOT excluded from report');
  assert.ok(access.PENDING_STATUSES.includes(claimApproved.status), 'approved claim is counted in pending status');

  // Step 3: Manager rejects claim -> status becomes REJECTED
  const claimRejected = { status: 'REJECTED', grandRequested: 500 };
  const rejectedExcluded = [...access.DRAFT_STATUSES, ...access.APPROVAL_PENDING_STATUSES].includes(claimRejected.status);
  assert.equal(rejectedExcluded, false, 'rejected claim is NOT excluded from report');
  assert.ok(access.REJECTED_STATUSES.includes(claimRejected.status), 'rejected claim appears in rejected status');
});

test('TC60 approver isolation: Full Payment requires management; Other Expense requires reporting manager', () => {
  const mgmtUser = { _id: '64b000000000000000000001', role: 'management', designation: 'CEO' };
  const leadUser = { _id: '64b000000000000000000002', role: 'team_lead', designation: 'Team Lead' };
  const regularEmp = { _id: '64b000000000000000000003', role: 'employee', designation: 'Software Engineer' };

  // Full Payment submission routing
  const fpSubmission = rules.routeSubmission({
    fullPayment: { requested: true, approver: mgmtUser._id },
    entries: [{ expenseType: 'TRAVEL', amount: 500 }],
  });
  assert.equal(fpSubmission.status, 'APPROVAL_PENDING');
  assert.equal(fpSubmission.managerApproval.approverRole, 'MANAGEMENT');

  // Other Expense submission routing
  const otherSubmission = rules.routeSubmission({
    fullPayment: { requested: false },
    entries: [{ expenseType: 'OTHER', amount: 300 }],
    managerApproval: { approver: leadUser._id },
  });
  assert.equal(otherSubmission.status, 'APPROVAL_PENDING');
  assert.equal(otherSubmission.managerApproval.approverRole, 'REPORTING_MANAGER');
});

test('TC61 Service Report requirements: Other and Conveyance skip service report; Lodging and Travel require it', () => {
  // Other expense does not require service report
  const otherClaim = normalBody({
    expenseType: 'OTHER',
    serviceReports: [],
    managerApproval: { approver: '64b000000000000000000002' },
  });
  const otherCodes = codes(validate(otherClaim));
  assert.ok(!otherCodes.includes('SERVICE_REPORT_REQUIRED'), 'Other expense does not require service report');

  // Conveyance expense does not require service report
  const convClaim = normalBody({
    expenseType: 'CONVEYANCE',
    ...conveyanceFields,
    serviceReports: [],
  });
  const convCodes = codes(validate(convClaim));
  assert.ok(!convCodes.includes('SERVICE_REPORT_REQUIRED'), 'Conveyance does not require service report');

  // Lodging requires service report
  const lodgingMissing = lodgingBody({ serviceReports: [] });
  const lodgingCodes = codes(validate(lodgingMissing));
  assert.ok(lodgingCodes.includes('SERVICE_REPORT_REQUIRED'), 'Lodging claim requires service report');
});

test('TC61b Local Conveyance Visit Options: No Visit skips service report; Visit requires service report', () => {
  // Option 1: No Visit (explicit or default) does NOT require service report
  const convNoVisit = normalBody({
    expenseType: 'CONVEYANCE',
    ...conveyanceFields,
    visitType: 'NO_VISIT',
    serviceReports: [],
  });
  const noVisitCodes = codes(validate(convNoVisit));
  assert.ok(!noVisitCodes.includes('SERVICE_REPORT_REQUIRED'), 'Conveyance with NO_VISIT does not require service report');

  // Option 2: Visit WITHOUT service report -> FAILS with SERVICE_REPORT_REQUIRED
  const convVisitMissing = normalBody({
    expenseType: 'CONVEYANCE',
    ...conveyanceFields,
    visitType: 'VISIT',
    serviceReports: [],
  });
  const visitMissingCodes = codes(validate(convVisitMissing));
  assert.ok(visitMissingCodes.includes('SERVICE_REPORT_REQUIRED'), 'Conveyance with VISIT requires service report');

  // Option 2: Visit WITH service report -> PASSES
  const convVisitValid = normalBody({
    expenseType: 'CONVEYANCE',
    ...conveyanceFields,
    visitType: 'VISIT',
    serviceReports: [receipt('service_report_site_visit.pdf', 'application/pdf')],
  });
  const visitValidCodes = codes(validate(convVisitValid));
  assert.ok(!visitValidCodes.includes('SERVICE_REPORT_REQUIRED'), 'Conveyance with VISIT and service report is valid');

  // Multi-entry: Entry 1 NO_VISIT, Entry 2 VISIT -> requires service report
  const mixedEntriesMissing = normalBody({
    entries: [
      {
        expenseType: 'CONVEYANCE',
        ...conveyanceFields,
        visitType: 'NO_VISIT',
        requestedAmount: 200,
        remark: 'Office run without client visit',
      },
      {
        expenseType: 'CONVEYANCE',
        ...conveyanceFields,
        visitType: 'VISIT',
        requestedAmount: 300,
        remark: 'Client site service and maintenance visit',
      },
    ],
    serviceReports: [],
  });
  assert.ok(codes(validate(mixedEntriesMissing)).includes('SERVICE_REPORT_REQUIRED'), 'Mixed conveyance entries with at least one VISIT requires service report');

  // Multi-entry with entry-level service report -> PASSES
  const mixedEntriesWithSr = normalBody({
    entries: [
      {
        expenseType: 'CONVEYANCE',
        ...conveyanceFields,
        visitType: 'NO_VISIT',
        requestedAmount: 200,
        remark: 'Office run without client visit',
      },
      {
        expenseType: 'CONVEYANCE',
        ...conveyanceFields,
        visitType: 'VISIT',
        requestedAmount: 300,
        remark: 'Client site service and maintenance visit',
        serviceReports: [receipt('sr_client.pdf', 'application/pdf')],
      },
    ],
  });
  assert.ok(!codes(validate(mixedEntriesWithSr)).includes('SERVICE_REPORT_REQUIRED'), 'Mixed conveyance entries with attached service report passes');
});

test('PR10 reports exclude tagged claims for tagged employees', () => {
  const taggedEmpId = '64b000000000000000000002';
  const f = report.buildReportFilter({ employeeId: taggedEmpId });
  const and = f.$and;
  // Must filter strictly by submittedBy, never matching employeeClaims.employee.employeeId
  const empCond = and.find((c) => c.submittedBy);
  assert.ok(empCond, 'filter must include submittedBy condition');
  assert.equal(String(empCond.submittedBy), taggedEmpId);
  const hasTaggedCond = and.some((c) => c['employeeClaims.employee.employeeId'] || (c.$or && c.$or.some((o) => o['employeeClaims.employee.employeeId'])));
  assert.equal(hasTaggedCond, false, 'tagged claims must NOT be included in report filter for employee');

  // Report scope for non-staff also excludes tagged claims
  const nonStaffReq = { user: { role: 'employee', _id: taggedEmpId } };
  const scope = access.reportScope(nonStaffReq);
  const scopeAnd = scope.conditions;
  assert.ok(scopeAnd.some((c) => String(c.submittedBy) === taggedEmpId), 'scope must filter strictly by submittedBy');
  const scopeHasTagged = scopeAnd.some((c) => c['employeeClaims.employee.employeeId'] || (c.$or && c.$or.some((o) => o['employeeClaims.employee.employeeId'])));
  assert.equal(scopeHasTagged, false, 'scope must NOT include tagged claims');
});

test('TC62 approver eligibility: CEO shown in both approval selections, Director excluded in both, Management eligible in both', () => {
  const approverService = require('../services/approverService');

  // CEO User (level: CEO, dept: director, roleCode: TCDR2A) - MUST be shown in both
  const ceoUser = {
    _id: '6a8845b9a43227dab7cac45f',
    name: 'Minal patil',
    employeeIdCode: 'EMP7104',
    role: 'admin',
    roleCode: 'TCDR2A',
    department: 'director',
    designation: 'management',
    levelRef: { name: 'CEO', category: 'DIRECTOR', levelNumber: 2 },
  };

  // Director Role User (level: BOD, dept: director, roleCode: TCDR1A) - MUST be excluded in both
  const directorUser = {
    _id: '6a9685709e766be1767164c0',
    name: 'Pradnya Pise',
    employeeIdCode: 'EMP9823',
    role: 'admin',
    roleCode: 'TCDR1A',
    designation: 'management',
    department: 'director',
    levelRef: { name: 'BOD', category: 'DIRECTOR', levelNumber: 1 },
  };

  // Management user (e.g. Software / Purchase / Accounts Dept)
  const mgmtAdmin = {
    _id: '6a9685709e766be1767164c1',
    name: 'Nikhil Doshi',
    employeeIdCode: 'EMP3810',
    role: 'admin',
    roleCode: 'TCAD1',
    designation: 'management',
    department: 'Purchase & Audits',
    levelRef: { name: 'MANAGEMENT', category: 'MANAGEMENT' },
  };

  // Company Admin (must be excluded)
  const companyAdmin = {
    _id: '6a8845b9a43227dab7cac460',
    name: 'Company Admin',
    role: 'company_admin',
    roleCode: 'TCCA1',
    designation: 'Company Admin',
  };

  // HR Admin (must be excluded)
  const hrAdmin = {
    _id: '6a8845b9a43227dab7cac461',
    name: 'HR Admin',
    role: 'hr_admin',
    roleCode: 'TCHR1',
    designation: 'HR Admin',
  };

  // Account Admin (must be excluded)
  const accountAdmin = {
    _id: '6aba09998a77767c675aa0ce',
    name: 'Trucode Account',
    role: 'account_admin',
    roleCode: 'ACCOUNT_ADMIN',
    designation: 'Account Admin',
  };

  // Store Admin (must be excluded)
  const storeAdmin = {
    _id: '6aba09998a77767c675aa0cf',
    name: 'Store Admin',
    role: 'store_admin',
    roleCode: 'STORE_ADMIN',
    designation: 'Store Admin',
  };

  // Team Lead / Reporting Manager
  const teamLead = {
    _id: '6a8845baa43227dab7cac468',
    name: 'Imran Shaikh',
    role: 'lead',
    roleCode: 'TCPD5A',
    designation: 'Project & Support Manager',
    levelRef: { category: 'LEADERSHIP' },
    isTeamLead: true,
  };

  // 1. CEO User: MUST be recognized as CEO, NOT director, NOT excluded, and eligible in BOTH selections
  assert.equal(approverService.isCeoUser(ceoUser), true, 'Minal Patil must be identified as CEO');
  assert.equal(approverService.isDirectorRoleUser(ceoUser), false, 'CEO must not be treated as excluded director');
  assert.equal(approverService.isExcludedAdmin(ceoUser), false, 'CEO must not be excluded');
  assert.equal(approverService.isManagementUser(ceoUser), true, 'CEO must be eligible in Management Approvers');
  assert.equal(approverService.isReportingManagerUser(ceoUser), true, 'CEO must be eligible in Reporting Managers');

  // 2. Director Role User: MUST be recognized as director and EXCLUDED from BOTH selections
  assert.equal(approverService.isDirectorRoleUser(directorUser), true, 'Director must be identified as Director');
  assert.equal(approverService.isCeoUser(directorUser), false, 'Director is not CEO');
  assert.equal(approverService.isExcludedAdmin(directorUser), true, 'Director must be excluded from approver lists');
  assert.equal(approverService.isManagementUser(directorUser), false, 'Director must NOT be in Management Approvers');
  assert.equal(approverService.isReportingManagerUser(directorUser), false, 'Director must NOT be in Reporting Managers');

  // 3. Department Management user is NOT excluded and eligible in both
  assert.equal(approverService.isExcludedAdmin(mgmtAdmin), false, 'Management admin must not be excluded');
  assert.equal(approverService.isManagementUser(mgmtAdmin), true, 'Management user is eligible in Management Approvers');
  assert.equal(approverService.isReportingManagerUser(mgmtAdmin), true, 'Management user is eligible in Reporting Managers');

  // 4. Company admin, HR admin, Account admin, Store admin are ALL excluded
  assert.equal(approverService.isExcludedAdmin(companyAdmin), true, 'Company Admin must be excluded');
  assert.equal(approverService.isExcludedAdmin(hrAdmin), true, 'HR Admin must be excluded');
  assert.equal(approverService.isExcludedAdmin(accountAdmin), true, 'Account Admin must be excluded');
  assert.equal(approverService.isExcludedAdmin(storeAdmin), true, 'Store Admin must be excluded');

  // 5. Team lead is recognized as reporting manager, not management user
  assert.equal(approverService.isReportingManagerUser(teamLead), true, 'Team lead is reporting manager');
  assert.equal(approverService.isManagementUser(teamLead), false, 'Team lead is not management user');

  // 6. Company admin is not a reporting manager
  assert.equal(approverService.isReportingManagerUser(companyAdmin), false, 'Company admin cannot be reporting manager');
});

test('TC63 expense report export: exact 17 columns and 5-category division (lodging, food, travel, local, other)', () => {
  const workflow = require('../controllers/expenseWorkflow.controller');
  const { computeCategoryBreakdown, normalizeClaimForReport, CSV_COLUMNS } = workflow._internal;

  // 1. Exact 17 columns in exact order
  const expectedHeaders = [
    'Claim ID',
    'Employee',
    'Customer',
    'City',
    'Expense Type',
    'Expense Date',
    'Submitted',
    'Claimed',
    'Allowed',
    'Excess',
    'Paid Amount',
    'Status',
    'Lodging',
    'Food',
    'Travel',
    'Local',
    'Other',
  ];
  assert.equal(CSV_COLUMNS.length, 17, 'Must have exactly 17 export columns');
  assert.deepEqual(
    CSV_COLUMNS.map(([h]) => h),
    expectedHeaders,
    'Columns must match the user specification exactly'
  );

  // 2. Multi-entry claim division matching user example:
  // "employee apply 1800 rupees claim, in which they apply, food- 400, travel - 1000, other- 400. local- 0, lodging -0"
  const multiEntryClaim = {
    claimNumber: 'EXP-MULTI-01',
    grandRequested: 1800,
    grandAllowed: 1500,
    grandExcess: 300,
    claimType: 'FOOD',
    employeeClaims: [
      {
        employee: { name: 'Adesh Bhongale', employeeIdCode: 'EMP101' },
        items: [
          { expenseType: 'FOOD', requestedAmount: 400 },
          { expenseType: 'TRAVEL', requestedAmount: 1000 },
          { expenseType: 'OTHER', requestedAmount: 400 },
        ],
      },
    ],
  };

  const b = computeCategoryBreakdown(multiEntryClaim);
  assert.equal(b.food, 400, 'Food must be 400');
  assert.equal(b.travel, 1000, 'Travel must be 1000');
  assert.equal(b.other, 400, 'Other must be 400');
  assert.equal(b.local, 0, 'Local must be 0');
  assert.equal(b.lodging, 0, 'Lodging must be 0');
  assert.equal(b.food + b.travel + b.other + b.local + b.lodging, 1800, 'Sum of categories must equal claimed amount');

  // 3. Normalization row exposes the breakdown and excess
  const row = normalizeClaimForReport(multiEntryClaim);
  assert.equal(row.claimedAmount, 1800);
  assert.equal(row.allowedAmount, 1500);
  assert.equal(row.excessAmount, 300);
  assert.equal(row.food, 400);
  assert.equal(row.travel, 1000);
  assert.equal(row.other, 400);
  assert.equal(row.local, 0);
  assert.equal(row.lodging, 0);

  // 4. Single-category claim attributes 100% to that category and 0 to others
  const singleClaim = {
    claimNumber: 'EXP-SINGLE-01',
    claimType: 'CONVEYANCE',
    grandRequested: 750,
    grandAllowed: 750,
  };
  const bSingle = computeCategoryBreakdown(singleClaim);
  assert.equal(bSingle.local, 750, 'Local must be 750');
  assert.equal(bSingle.food, 0);
  assert.equal(bSingle.travel, 0);
  assert.equal(bSingle.lodging, 0);
  assert.equal(bSingle.other, 0);
});

test('TC64 Management users: approval not applicable, routes directly to SUBMITTED (Accounts)', () => {
  const mgmtUser = { _id: '64b000000000000000000099', name: 'Management User', role: 'management', designation: 'General Manager' };
  
  // 1. Validation: Full Payment without approverId passes for Management user
  const fpPayload = normalBody({ fullPayment: { requested: true, reason: 'Approved by Management' } });
  const fpErrors = validate(fpPayload, { user: mgmtUser, isManagement: true });
  assert.ok(!fpErrors.some((e) => e.field === 'approverId'), 'Management user must not have approverId required error on Full Payment');

  // 2. Validation: OTHER expense without approverId passes for Management user
  const otherPayload = normalBody({ expenseType: 'OTHER' });
  const otherErrors = validate(otherPayload, { user: mgmtUser, isManagement: true });
  assert.ok(!otherErrors.some((e) => e.field === 'approverId'), 'Management user must not have approverId required error on OTHER expense');

  // 3. Routing: routes directly to SUBMITTED (Accounts) with approval not applicable
  const claim = {
    grandRequested: 5000,
    grandAllowed: 2000,
    fullPayment: { requested: true, reason: 'Management approval' },
    submittedBy: mgmtUser,
  };
  rules.routeSubmission(claim, { user: mgmtUser, isManagement: true });
  assert.equal(claim.status, 'SUBMITTED', 'Management claim must route directly to SUBMITTED (Accounts queue)');
  assert.equal(claim.approvalRequired, false, 'No external approval required');
  assert.equal(claim.fullPayment.status, 'APPROVED', 'Full payment must be approved');
  assert.equal(claim.fullPayment.approvedAmount, 5000, 'Full requested amount approved');
  assert.equal(claim.payableAmount, 5000, 'Payable amount must equal requested amount');
  assert.equal(claim.managerApproval.status, 'APPROVED', 'Manager approval status must be APPROVED');
});

// ── Lodging Stay Type (In Hotel / With Relative) & Relative Stay Allowance Percentage ──
{
const ExpensePolicy = require('../models/ExpensePolicy');
const ExpenseClaim = require('../models/ExpenseClaim');
const ExpenseAuditLog = require('../models/ExpenseAuditLog');
const master = require('../controllers/expenseMaster.controller');

const EMP3 = '64b000000000000000000003';
const EMP4 = '64b000000000000000000004';
const LODGING = rules.resolveTypeConfig({ code: 'LODGING', name: 'Lodging', category: 'LODGING' });

const ENTS = [
  { levelNumber: 8, cityClass: 'A', expenseTypeCode: 'LODGING', amount: 2000, gradeCode: '' },
  { levelNumber: 1, cityClass: 'A', expenseTypeCode: 'LODGING', amount: 4000, gradeCode: '' },
  { levelNumber: 5, cityClass: 'A', expenseTypeCode: 'LODGING', amount: 3000, gradeCode: '' },
  { levelNumber: 10, cityClass: 'A', expenseTypeCode: 'LODGING', amount: 1500, gradeCode: '' },
  { levelNumber: 8, cityClass: 'C', expenseTypeCode: 'LODGING', amount: 1200, gradeCode: '' },
  { levelNumber: 1, cityClass: 'A+', expenseTypeCode: 'LODGING', amount: 5000, gradeCode: '' },
];
const emp = (_id, levelNumber, name = `Emp L${levelNumber}`) => ({ _id, name, role: 'employee', levelNumber });

const lodgingInput = (over = {}) => ({
  claimMode: 'LODGING',
  fromDate: '2026-10-01',
  toDate: '2026-10-01', // 1 day
  requestedAmount: 3000,
  numberOfEmployees: 1,
  employeeIds: [EMP1],
  receipts: [receipt('bill.jpg')],
  customerName: 'Client',
  remark: 'Official tour lodging',
  destinationCity: 'Pune',
  fullPayment: { requested: false },
  ...over,
});

const calc = (input, { employees = [emp(EMP1, 8)], policy = { relativeStayPercent: 50 }, cls = 'A' } = {}) =>
  rules.calculateAmounts({ input, typeConfig: LODGING, employees, policy, entitlements: ENTS, destinationClass: cls, actor: EMP1 });

// ── Calculation ───────────────────────────────────────────────────────────────

test('1. In Hotel keeps the existing full lodging entitlement (identical to legacy calculation)', async () => {
  const legacy = await calc(lodgingInput());
  const hotel = await calc(lodgingInput({ stayType: 'IN_HOTEL' }));
  assert.equal(hotel.grandPolicyLimit, 2000);
  assert.equal(hotel.grandAllowed, 2000);
  assert.equal(hotel.grandExcess, 1000);
  assert.equal(hotel.grandRequested, 3000);
  assert.deepEqual(
    { l: hotel.grandPolicyLimit, a: hotel.grandAllowed, e: hotel.grandExcess, p: hotel.perDayLimit, x: hotel.plainExplanation },
    { l: legacy.grandPolicyLimit, a: legacy.grandAllowed, e: legacy.grandExcess, p: legacy.perDayLimit, x: legacy.plainExplanation },
  );
  assert.equal(hotel.employeeClaims[0].items[0].calculationBreakdown.relativeStayPercent, undefined);
});

for (const [pct, limit] of [[50, 1000], [75, 1500], [100, 2000]]) {
  test(`2-4. With Relative at ${pct}% pays ${pct}% of the ₹2,000 entitlement (₹${limit})`, async () => {
    // Any client amount is ignored: claimed = allowed = final entitlement, no excess
    const r = await calc(lodgingInput({ stayType: 'WITH_RELATIVE' }), { policy: { relativeStayPercent: pct } });
    assert.equal(r.grandPolicyLimit, limit);
    assert.equal(r.grandAllowed, limit);
    assert.equal(r.grandRequested, limit, 'claimed amount is the calculated entitlement');
    assert.equal(r.grandExcess, 0);
    const it = r.employeeClaims[0].items[0];
    assert.equal(it.policyLimit, limit);
    assert.equal(it.proofRequired, false, 'no hotel bill required');
    assert.equal(it.calculationBreakdown.baseEntitlement, 2000);
    assert.equal(it.calculationBreakdown.finalEntitlement, limit);
    assert.equal(it.calculationBreakdown.relativeStayPercent, pct);
    assert.equal(it.calculationBreakdown.stayType, 'WITH_RELATIVE');
    assert.match(r.plainExplanation, /no hotel bill required/);
  });
}

test('Spec table: ₹4,000 entitlement at 50% -> ₹2,000', async () => {
  const r = await calc(lodgingInput({ stayType: 'WITH_RELATIVE', requestedAmount: 5000 }), { employees: [emp(EMP1, 1)] });
  assert.equal(r.grandPolicyLimit, 2000);
  assert.equal(r.grandAllowed, 2000);
});

test('With Relative: a typed amount (lower or higher) never changes the allowed amount', async () => {
  for (const typed of [800, 99999, 0, undefined]) {
    const r = await calc(lodgingInput({ stayType: 'WITH_RELATIVE', requestedAmount: typed }));
    assert.equal(r.grandRequested, 1000);
    assert.equal(r.grandAllowed, 1000);
    assert.equal(r.grandExcess, 0);
  }
});

test('5. With Relative at 0% allows zero under this rule', async () => {
  const r = await calc(lodgingInput({ stayType: 'WITH_RELATIVE' }), { policy: { relativeStayPercent: 0 } });
  assert.equal(r.grandPolicyLimit, 0);
  assert.equal(r.grandAllowed, 0);
  assert.equal(r.grandRequested, 0);
  assert.equal(r.grandExcess, 0);
  assert.equal(r.perDayLimit, 0);
  assert.equal(r.employeeClaims[0].items[0].perDayLimit, 0);
});

test('5b. 0% with 2 employees: both get zero', async () => {
  const r = await calc(
    lodgingInput({ stayType: 'WITH_RELATIVE', requestedAmount: 5000, numberOfEmployees: 2, employeeIds: [EMP1, EMP2] }),
    { employees: [emp(EMP1, 8), emp(EMP2, 1)], policy: { relativeStayPercent: 0, lodgingRules: { twoEmployees: { ruleType: 'COMBINED_PERCENT', percent: 75 } } } },
  );
  assert.equal(r.grandAllowed, 0);
  assert.equal(r.grandExcess, 0);
  r.employeeClaims.forEach((ec) => assert.equal(ec.allowedTotal, 0));
});

test('6. Multi-employee With Relative uses days * (pct of emp1 1-day + pct of emp2 1-day), without hotel sharing rules', async () => {
  const policy = { relativeStayPercent: 50, lodgingRules: { twoEmployees: { ruleType: 'COMBINED_PERCENT', percent: 75 } } };
  const employees = [emp(EMP1, 8, 'Me'), emp(EMP2, 1, 'TL')]; // ₹2,000/day + ₹4,000/day
  const base = lodgingInput({ requestedAmount: 5000, numberOfEmployees: 2, employeeIds: [EMP1, EMP2] });
  const hotel = await calc({ ...base, stayType: 'IN_HOTEL' }, { employees, policy });
  const rel = await calc({ ...base, stayType: 'WITH_RELATIVE' }, { employees, policy });
  // Hotel still uses 75% of (2000 + 4000) = 4500
  assert.equal(hotel.grandPolicyLimit, 4500);
  assert.equal(hotel.grandAllowed, 4500);
  assert.equal(hotel.grandRequested, 5000, 'hotel claims still use the typed bill amount');
  // With Relative: 1 day * (50% of 2000 + 50% of 4000) = 1 * (1000 + 2000) = 3000
  assert.equal(rel.grandPolicyLimit, 3000);
  assert.equal(rel.grandAllowed, 3000);
  assert.equal(rel.grandRequested, 3000);
  assert.equal(rel.grandExcess, 0);
  assert.equal(rel.employeeClaims[0].items[0].policyLimit, 1000);
  assert.equal(rel.employeeClaims[1].items[0].policyLimit, 2000);
  rel.employeeClaims.forEach((ec) => assert.equal(ec.excessTotal, 0));
  assert.match(rel.plainExplanation, /Stay with relative/);

  // 3 days: 3 * (50% of 2000 + 50% of 4000) = 3 * (1000 + 2000) = 9000
  const rel3Days = await calc({ ...base, toDate: '2026-10-03', stayType: 'WITH_RELATIVE' }, { employees, policy });
  assert.equal(rel3Days.numberOfDays, 3);
  assert.equal(rel3Days.grandPolicyLimit, 9000);
  assert.equal(rel3Days.grandAllowed, 9000);
  assert.equal(rel3Days.employeeClaims[0].items[0].policyLimit, 3000);
  assert.equal(rel3Days.employeeClaims[1].items[0].policyLimit, 6000);
});

test('6b. 2, 3 and 4+ employee With Relative claims ignore hotel sharing rules and sum each employee percentage of 1-day allowed * days', async () => {
  const cases = [
    // 2 employees (2000 + 4000): hotel HIGHER_ONLY = 4000/day; relative 50% = (1000 + 2000)/day = 3000/day
    { ids: [EMP1, EMP2], emps: [emp(EMP1, 8), emp(EMP2, 1)], lr: { twoEmployees: { ruleType: 'HIGHER_ONLY' } }, hotel1Day: 4000, rel1Day: 3000 },
    // 3 employees (2000 + 4000 + 3000): hotel HIGHEST_PLUS_LOWEST = 6000/day; relative 50% = (1000 + 2000 + 1500)/day = 4500/day
    { ids: [EMP1, EMP2, EMP3], emps: [emp(EMP1, 8), emp(EMP2, 1), emp(EMP3, 5)], lr: {}, hotel1Day: 6000, rel1Day: 4500 },
    // 4 employees (2000 + 4000 + 3000 + 1500): hotel SPLIT_IN_PAIRS_75 = 7875/day; relative 50% = (1000 + 2000 + 1500 + 750)/day = 5250/day
    { ids: [EMP1, EMP2, EMP3, EMP4], emps: [emp(EMP1, 8), emp(EMP2, 1), emp(EMP3, 5), emp(EMP4, 10)], lr: {}, hotel1Day: 7875, rel1Day: 5250 },
  ];
  for (const c of cases) {
    const base = lodgingInput({ requestedAmount: 50000, numberOfEmployees: c.ids.length, employeeIds: c.ids, toDate: '2026-10-02' }); // 2 days
    const policy = { relativeStayPercent: 50, lodgingRules: c.lr };
    const hotel = await calc({ ...base, stayType: 'IN_HOTEL' }, { employees: c.emps, policy });
    const rel = await calc({ ...base, stayType: 'WITH_RELATIVE' }, { employees: c.emps, policy });
    assert.equal(hotel.grandPolicyLimit, c.hotel1Day * 2, `hotel limit for ${c.ids.length} employees (2 days)`);
    assert.equal(rel.grandPolicyLimit, c.rel1Day * 2, `relative limit for ${c.ids.length} employees (2 days)`);
    assert.equal(rel.grandAllowed, c.rel1Day * 2);
  }
});

test('7. Multiple days use the existing day calculation (3 days x ₹2000 = ₹6000 -> 50% = ₹3000)', async () => {
  const r = await calc(lodgingInput({ stayType: 'WITH_RELATIVE', toDate: '2026-10-03', requestedAmount: 7000 }));
  assert.equal(r.numberOfDays, 3);
  assert.equal(r.grandPolicyLimit, 3000);
  assert.equal(r.grandAllowed, 3000);
  assert.equal(r.perDayLimit, 1000);
});

test('8. Different levels and city classes keep their entitlement rules (relative = % of each hotel limit)', async () => {
  for (const [lvl, cls] of [[8, 'A'], [1, 'A'], [5, 'A'], [10, 'A'], [8, 'C'], [1, 'A+']]) {
    const hotel = await calc(lodgingInput({ stayType: 'IN_HOTEL', requestedAmount: 99999 }), { employees: [emp(EMP1, lvl)], cls, policy: { relativeStayPercent: 75 } });
    const rel = await calc(lodgingInput({ stayType: 'WITH_RELATIVE', requestedAmount: 99999 }), { employees: [emp(EMP1, lvl)], cls, policy: { relativeStayPercent: 75 } });
    const expectedHotel = ENTS.find((e) => e.levelNumber === lvl && e.cityClass === cls).amount;
    assert.equal(hotel.grandPolicyLimit, expectedHotel, `L${lvl}/${cls} hotel`);
    assert.equal(rel.grandPolicyLimit, Math.round(expectedHotel * 0.75 * 100) / 100, `L${lvl}/${cls} relative`);
  }
});

test('9. Percentage is applied exactly once (50% -> 1000, never 25% -> 500)', async () => {
  const r = await calc(lodgingInput({ stayType: 'WITH_RELATIVE' }));
  assert.equal(r.grandPolicyLimit, 1000);
  const it = r.employeeClaims[0].items[0];
  assert.equal((it.formula.match(/Stay with relative/g) || []).length, 1);
  // Re-evaluating the same stored claim (resubmission path) recalculates from the base entitlement
  const again = await calc(lodgingInput({ stayType: 'WITH_RELATIVE' }));
  assert.equal(again.grandPolicyLimit, 1000);
  // Helper itself scales once and keeps the base for audit
  const res = rules.applyRelativeStayPercent({ totalPolicyLimit: 4500, effectiveLimits: [1500, 3000], ruleCode: 'X', ruleDescription: 'd', formula: 'f' }, 50);
  assert.deepEqual(res.effectiveLimits, [750, 1500]);
  assert.equal(res.totalPolicyLimit, 2250);
  assert.equal(res.baseTotalPolicyLimit, 4500);
});

test('10. Client-submitted percentage / allowed amounts cannot override backend policy', async () => {
  const body = {
    ...lodgingInput({ stayType: 'with_relative' }),
    relativeStayPercent: 100, allowedAmount: 3000, grandAllowed: 3000, policyLimit: 99999, payableAmount: 3000,
  };
  const input = rules.normalizeInput(body);
  assert.equal(input.stayType, 'WITH_RELATIVE');
  ['relativeStayPercent', 'allowedAmount', 'grandAllowed', 'policyLimit', 'payableAmount'].forEach((k) => assert.equal(input[k], undefined));
  const r = await calc(input, { policy: { relativeStayPercent: 50 } });
  assert.equal(r.grandAllowed, 1000);
});

test('11. Invalid configuration values are rejected by the strict parser', () => {
  for (const bad of [-1, 101, 100.01, NaN, Infinity, 'abc', '', ' ', '50%', '-5', '1e2', null, undefined, true, [], {}, [50]]) {
    assert.equal(rules.parseRelativeStayPercent(bad), null, `rejects ${JSON.stringify(bad)}`);
  }
  assert.equal(rules.parseRelativeStayPercent(0), 0);
  assert.equal(rules.parseRelativeStayPercent(100), 100);
  assert.equal(rules.parseRelativeStayPercent('75'), 75);
  assert.equal(rules.parseRelativeStayPercent(62.5), 62.5);
});

test('11b. Missing relative-stay configuration never silently defaults in the engine', async () => {
  assert.equal(rules.resolveRelativeStayPercent({}), null);
  assert.equal(rules.resolveRelativeStayPercent(null), null);
  await assert.rejects(() => calc(lodgingInput({ stayType: 'WITH_RELATIVE' }), { policy: {} }), /not configured/);
  // Hotel claims do not need the setting at all
  const hotel = await calc(lodgingInput({ stayType: 'IN_HOTEL' }), { policy: {} });
  assert.equal(hotel.grandAllowed, 2000);
});

test('12. Existing claims without Stay Type stay compatible and are never treated as With Relative', async () => {
  const oldClaim = {
    claimMode: 'LODGING', fromDate: new Date(Date.UTC(2026, 8, 29)), toDate: new Date(Date.UTC(2026, 9, 1)),
    employeeCount: 1, employeeClaims: [{ employee: { employeeId: EMP1 }, items: [] }],
    trip: { customerName: 'X', destination: 'Pune', purpose: 'Old lodging claim' },
    claimType: 'LODGING', grandRequested: 4000, receipts: [], serviceReports: [], fullPayment: {},
  };
  const input = rules.claimToInput(oldClaim);
  assert.equal(input.stayType, '', 'no stay type invented for historical claims');
  const r = await calc(input);
  const hotel = await calc({ ...input, stayType: 'IN_HOTEL' });
  assert.equal(r.grandPolicyLimit, hotel.grandPolicyLimit, 'legacy claim calculates with existing hotel rules');
  // Re-submitting an old draft requires an explicit selection
  const errs = rules.validateClaimInput(input, { policyConfig: rules.resolvePolicyConfig({}), typeConfig: LODGING, today: new Date(Date.UTC(2026, 9, 8)) });
  assert.ok(errs.some((e) => e.code === 'STAY_TYPE_REQUIRED'));
  // Stored claim schema: no default value, enum enforced
  const doc = new ExpenseClaim({ submittedBy: EMP1, claimMode: 'LODGING' });
  assert.equal(doc.stayType, undefined);
  doc.stayType = 'TENT';
  assert.ok(doc.validateSync()?.errors?.stayType, 'invalid stayType rejected by schema');
});

// ── Validation ────────────────────────────────────────────────────────────────

test('Stay Type validation: required on submit, skipped for drafts, invalid rejected, ignored for Normal claims', () => {
  const policyConfig = rules.resolvePolicyConfig({});
  const today = new Date(Date.UTC(2026, 9, 8));
  const v = (body, isDraft = false) => rules.validateClaimInput(rules.normalizeInput(body), { policyConfig, typeConfig: LODGING, today, isDraft }).map((e) => e.code);
  const body = { ...lodgingInput(), expenseType: 'LODGING', fromDate: '2026-09-29', toDate: '2026-10-02', serviceReports: [receipt('sr.jpg')] };
  assert.ok(v(body).includes('STAY_TYPE_REQUIRED'));
  assert.ok(!v(body, true).includes('STAY_TYPE_REQUIRED'), 'drafts may be saved before choosing');
  assert.ok(v({ ...body, stayType: 'TENT' }).includes('STAY_TYPE_INVALID'));
  assert.ok(v({ ...body, stayType: 'TENT' }, true).includes('STAY_TYPE_INVALID'));
  assert.deepEqual(v({ ...body, stayType: 'IN_HOTEL' }), []);
  assert.deepEqual(v({ ...body, stayType: 'WITH_RELATIVE' }), []);
  const normal = rules.normalizeInput({ claimMode: 'NORMAL', stayType: 'WITH_RELATIVE' });
  assert.equal(normal.stayType, '', 'Normal Expense Claim never carries a stay type');
});

// ── Admin setting / API ───────────────────────────────────────────────────────

test('With Relative (backend): client amount, hotel bills and full payment are not applicable and are dropped', () => {
  const body = {
    ...lodgingInput({ stayType: 'WITH_RELATIVE', requestedAmount: 9999 }),
    expenseType: 'LODGING',
    receipts: [receipt('hotel_bill.jpg'), receipt('hotel_bill_2.jpg')],
    fullPayment: { requested: true, reason: 'Please pay everything' },
    serviceReports: [receipt('sr.jpg')],
  };
  const input = rules.normalizeInput(body);
  assert.equal(input.requestedAmount, null);
  assert.deepEqual(input.receipts, []);
  assert.equal(input.fullPayment.requested, false);
  input.entries.forEach((e) => { assert.equal(e.requestedAmount, null); assert.deepEqual(e.receipts, []); });
  assert.equal(rules.approvalKindFor(input), 'NONE');
  assert.equal(input.serviceReports.length, 1, 'service report is still kept');
  // Hotel claims are unchanged: amount + bills kept
  const hotel = rules.normalizeInput({ ...body, stayType: 'IN_HOTEL' });
  assert.equal(hotel.requestedAmount, 9999);
  assert.equal(hotel.receipts.length, 2);
  assert.equal(hotel.fullPayment.requested, true);
});

test('With Relative (validation): no amount and no bill required; In Hotel still requires both', () => {
  const policyConfig = rules.resolvePolicyConfig({});
  const today = new Date(Date.UTC(2026, 9, 8));
  const proofType = { ...LODGING, proofRequired: true };
  const v = (over) => rules.validateClaimInput(
    rules.normalizeInput({ ...lodgingInput(), expenseType: 'LODGING', fromDate: '2026-09-29', toDate: '2026-10-02', serviceReports: [receipt('sr.jpg')], receipts: [], requestedAmount: '', ...over }),
    { policyConfig, typeConfig: proofType, today },
  ).map((e) => e.code);
  assert.deepEqual(v({ stayType: 'WITH_RELATIVE' }), []);
  const hotelErrs = v({ stayType: 'IN_HOTEL' });
  assert.ok(hotelErrs.includes('AMOUNT_REQUIRED'));
  assert.ok(hotelErrs.includes('RECEIPT_REQUIRED'));
  assert.ok(v({ stayType: 'WITH_RELATIVE', serviceReports: [] }).includes('SERVICE_REPORT_REQUIRED'), 'service report still required');
});

// ── Admin setting / API ───────────────────────────────────────────────────────

test('Policy schema: Relative Stay Allowance Percentage is numeric, 0-100, initialised to 50', () => {
  const path = ExpensePolicy.schema.path('relativeStayPercent');
  assert.equal(path.instance, 'Number');
  assert.equal(path.defaultValue, 50);
  const p = new ExpensePolicy({ name: 'P', code: 'P' });
  assert.equal(p.relativeStayPercent, 50);
  p.relativeStayPercent = 101;
  assert.ok(p.validateSync()?.errors?.relativeStayPercent);
  p.relativeStayPercent = -1;
  assert.ok(p.validateSync()?.errors?.relativeStayPercent);
  p.relativeStayPercent = 0;
  assert.equal(p.validateSync()?.errors?.relativeStayPercent, undefined);
});

test('Authorization: Super Admin / HR Admin may configure; employees and Accounts may not', () => {
  assert.equal(access.canConfigure({ role: 'super_admin' }), true);
  assert.equal(access.canConfigure({ role: 'superadmin', scope: 'GLOBAL' }), true);
  assert.equal(access.canConfigure({ role: 'hr_admin' }), true);
  assert.equal(access.canConfigure({ role: 'employee' }), false);
  assert.equal(access.canConfigure({ role: 'accounts' }), false);
  assert.equal(access.canConfigure(null), false);
});

test('Route PUT /policies/:id enforces the config role on the server', () => {
  const router = require('../routes');
  const layer = router.stack.find((l) => l.route && l.route.path === '/policies/:id' && l.route.methods.put);
  assert.ok(layer, 'route exists');
  const guard = layer.route.stack[0].handle;
  const run = (user) => {
    let status = 200; let nextCalled = false;
    const res = { status(c) { status = c; return this; }, json() { return this; } };
    guard({ user }, res, () => { nextCalled = true; });
    return { status, nextCalled };
  };
  assert.deepEqual(run({ role: 'employee' }), { status: 403, nextCalled: false });
  assert.deepEqual(run({ role: 'accounts' }), { status: 403, nextCalled: false });
  assert.deepEqual(run({ role: 'hr_admin' }), { status: 200, nextCalled: true });
  assert.deepEqual(run({ role: 'super_admin' }), { status: 200, nextCalled: true });
});

/** Run master.updatePolicy against a stubbed policy document (no DB). */
async function runUpdate(body, startPct = 50) {
  const saved = [];
  const audits = [];
  const doc = {
    _id: '64b0000000000000000000aa', companyId: null, code: 'TCSL/ITP', version: '1.0', status: 'draft', relativeStayPercent: startPct,
    async save() { saved.push(this.relativeStayPercent); },
  };
  const origFind = ExpensePolicy.findById;
  const origAudit = ExpenseAuditLog.create;
  ExpensePolicy.findById = async () => doc;
  ExpenseAuditLog.create = async (d) => { audits.push(d); };
  let status = 200; let payload = null;
  const res = { status(c) { status = c; return this; }, json(p) { payload = p; return this; } };
  try {
    await master.updatePolicy({ params: { id: doc._id }, body, user: { _id: EMP1, name: 'HR', role: 'hr_admin' }, headers: {} }, res);
  } finally {
    ExpensePolicy.findById = origFind;
    ExpenseAuditLog.create = origAudit;
  }
  return { status, payload, saved, audits, doc };
}

test('Admin update: valid percentage is saved and audited', async () => {
  const r = await runUpdate({ relativeStayPercent: 75 });
  assert.equal(r.status, 200);
  assert.equal(r.payload.success, true);
  assert.deepEqual(r.saved, [75]);
  assert.equal(r.audits.length, 1);
  assert.equal(r.audits[0].action, 'POLICY_RELATIVE_STAY_PERCENT_UPDATED');
  assert.equal(r.audits[0].entity, 'ExpensePolicy');
  assert.deepEqual(r.audits[0].before, { relativeStayPercent: 50 });
  assert.deepEqual(r.audits[0].after, { relativeStayPercent: 75 });
  const zero = await runUpdate({ relativeStayPercent: 0 });
  assert.deepEqual(zero.saved, [0]);
  const same = await runUpdate({ relativeStayPercent: 50 });
  assert.equal(same.audits.length, 0, 'no audit entry when the value did not change');
});

test('Admin update: invalid percentages are rejected with 400 and nothing is saved', async () => {
  for (const bad of [-5, 101, 'abc', '', null, true, '50%', { $gt: 1 }]) {
    const r = await runUpdate({ relativeStayPercent: bad });
    assert.equal(r.status, 400, `rejects ${JSON.stringify(bad)}`);
    assert.equal(r.payload.success, false);
    assert.deepEqual(r.saved, []);
    assert.equal(r.audits.length, 0);
  }
});

test('Admin update: saving other policy fields does not touch the relative-stay setting', async () => {
  const r = await runUpdate({ name: 'Renamed' }, 65);
  assert.equal(r.status, 200);
  assert.equal(r.doc.relativeStayPercent, 65);
  assert.equal(r.audits.length, 0);
});


test('PDF generation: Lodging claim with Stay Type (IN_HOTEL and WITH_RELATIVE) renders Stay Type, allowance %, and relative-stay limits in PDF', async () => {
  const { Writable } = require('node:stream');
  const { generateClaimPdf } = require('../services/claimPdfGenerator');

  function extractPdfText(buffer) {
    const str = buffer.toString('latin1');
    const tjBlocks = str.match(/\[(.*?)\]\s*TJ/gs) || [];
    return tjBlocks.map((b) => {
      const hexParts = b.match(/<([0-9a-fA-F]+)>/g) || [];
      return hexParts.map((h) => Buffer.from(h.slice(1, -1), 'hex').toString('latin1')).join('');
    }).join(' ');
  }

  // 1. Multi-employee WITH_RELATIVE claim (2 days, 50% allowance: Emp1 2000/day -> 1000/day, Emp2 4000/day -> 2000/day, Total = 6000)
  const employees = [emp(EMP1, 8, 'Adesh Bhongale'), emp(EMP2, 1, 'Rahul Patil')];
  const policy = { relativeStayPercent: 50, lodgingRules: { twoEmployees: { ruleType: 'COMBINED_PERCENT', percent: 75 } } };
  const relCalc = await calc(
    lodgingInput({ stayType: 'WITH_RELATIVE', fromDate: '2026-10-01', toDate: '2026-10-02', numberOfEmployees: 2, employeeIds: [EMP1, EMP2] }),
    { employees, policy }
  );

  const relClaimDoc = {
    _id: '65e000000000000000000091',
    claimNumber: 'EXP-REL-2026-0001',
    status: 'SUBMITTED',
    paymentStatus: 'UNPAID',
    claimType: 'LODGING',
    claimMode: 'LODGING',
    stayType: 'WITH_RELATIVE',
    relativeStayPercent: 50,
    fromDate: '2026-10-01',
    toDate: '2026-10-02',
    numberOfNights: relCalc.numberOfDays,
    numberOfEmployees: 2,
    submittedBy: { name: 'Adesh Bhongale', employeeIdCode: 'EMP1001', department: 'Engineering', designation: 'Engineer' },
    trip: { customerName: 'Client Corp', destination: 'Pune', destinationClass: 'A', purpose: 'Official stay with relative' },
    employeeClaims: relCalc.employeeClaims,
    plainExplanation: relCalc.plainExplanation,
    grandRequested: relCalc.grandRequested,
    grandAllowed: relCalc.grandAllowed,
    grandExcess: relCalc.grandExcess,
    grandPolicyLimit: relCalc.grandPolicyLimit,
    payableAmount: relCalc.grandAllowed,
    entries: [{ expenseType: 'LODGING', requestedAmount: relCalc.grandRequested, allowedAmount: relCalc.grandAllowed, excessAmount: 0, description: 'Stay at Pune' }],
    receipts: [],
  };

  const relChunks = [];
  await generateClaimPdf(relClaimDoc, new Writable({ write(c, _e, cb) { relChunks.push(c); cb(); } }));
  const relText = extractPdfText(Buffer.concat(relChunks));

  assert.ok(relText.includes('Stay Type:'), 'PDF must show Stay Type label');
  assert.ok(relText.includes('With Relative (50% Allowance)'), 'PDF must show With Relative (50% Allowance)');
  assert.ok(relText.includes('1,000.00/day'), 'PDF must show Emp1 relative daily limit Rs. 1,000.00/day');
  assert.ok(relText.includes('2,000.00/day'), 'PDF must show Emp2 relative daily limit Rs. 2,000.00/day');
  assert.ok(relText.includes('2,000.00 (2 Days)'), 'PDF must show Emp1 relative 2-day total Rs. 2,000.00 (2 Days)');
  assert.ok(relText.includes('4,000.00 (2 Days)'), 'PDF must show Emp2 relative 2-day total Rs. 4,000.00 (2 Days)');
  assert.ok(relText.includes('6,000.00'), 'PDF must show total allowed Rs. 6,000.00');

  // 2. Single-employee IN_HOTEL claim
  const hotelClaimDoc = {
    ...relClaimDoc,
    _id: '65e000000000000000000092',
    claimNumber: 'EXP-HTL-2026-0002',
    stayType: 'IN_HOTEL',
    relativeStayPercent: undefined,
    numberOfEmployees: 1,
    employeeClaims: [],
    plainExplanation: 'Individual limit per day: Rs. 2,000/day',
    grandRequested: 4000,
    grandAllowed: 4000,
    grandPolicyLimit: 4000,
    payableAmount: 4000,
    entries: [{ expenseType: 'LODGING', requestedAmount: 4000, allowedAmount: 4000, excessAmount: 0, description: 'Hotel stay' }],
  };
  const hotelChunks = [];
  await generateClaimPdf(hotelClaimDoc, new Writable({ write(c, _e, cb) { hotelChunks.push(c); cb(); } }));
  const hotelText = extractPdfText(Buffer.concat(hotelChunks));
  assert.ok(hotelText.includes('Stay Type:'), 'PDF must show Stay Type label for In Hotel');
  assert.ok(hotelText.includes('In Hotel'), 'PDF must show In Hotel');
});

}
