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
  fullPayment: { requested: false },
  ...(over.expenseType === 'OTHER' && !over.otherSubType ? {
    otherSubType: 'NORMAL',
  } : {}),
  ...over,
});
const loggingBody = (over = {}) => ({
  ...normalBody({
    claimMode: 'LOGGING',
    claimDate: undefined,
    fromDate: '2026-09-29',
    toDate: '2026-10-02',
    expenseType: 'LODGING',
    requestedAmount: 6000,
    remark: 'Hotel stay for plant commissioning.',
    serviceReports: [receipt('service_report.pdf', 'application/pdf')],
  }),
  ...over,
});
const validate = (body, opts = {}) => {
  const input = rules.normalizeInput(body);
  return rules.validateClaimInput(input, { policyConfig, typeConfig: types[input.expenseType] || null, today: TODAY, ...opts });
};
const codes = (errors) => errors.map((e) => e.code);

// ── TC01-TC04: valid normal claims ──
for (const [tc, type] of [['TC01', 'FOOD'], ['TC02', 'TRAVEL'], ['TC03', 'CONVEYANCE'], ['TC04', 'OTHER']]) {
  test(`${tc} valid ${type} claim passes validation`, () => {
    assert.deepEqual(validate(normalBody({ expenseType: type })), []);
  });
}

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
  }));
  assert.deepEqual(validPurchase, []);
});

test('Logging claim requires service report document (single or multiple upload)', () => {
  const missing = validate(loggingBody({ serviceReports: [] }));
  assert.ok(codes(missing).includes('SERVICE_REPORT_REQUIRED'));

  const valid = validate(loggingBody({ serviceReports: [receipt('SR_001.pdf', 'application/pdf'), receipt('site_pic.jpg', 'image/jpeg')] }));
  assert.deepEqual(valid, []);
});

test('OTHER claim: Normal option does not require barcode number, quantity, or supporting document', () => {
  // Valid Normal claim passes directly with standard fields (no barcode, no quantity, no supporting doc needed)
  const validNormal = validate(normalBody({
    expenseType: 'OTHER',
    otherSubType: 'NORMAL',
  }));
  assert.deepEqual(validNormal, []);
});

test('OTHER claim: Unselected otherSubType is rejected on final submit', () => {
  const errs = validate(normalBody({ expenseType: 'OTHER', otherSubType: '' }));
  assert.ok(codes(errs).includes('OTHER_SUBTYPE_REQUIRED'));
});

test('TC05 valid Lodging claim uses From/To date and 3 nights', () => {
  assert.deepEqual(validate(loggingBody()), []);
  const input = rules.normalizeInput(loggingBody());
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

test('TC12 missing / short remark is rejected', () => {
  assert.ok(codes(validate(normalBody({ remark: '' }))).includes('REMARK_REQUIRED'));
  assert.ok(codes(validate(normalBody({ remark: 'abc' }))).includes('REMARK_TOO_SHORT'));
  assert.ok(codes(validate(normalBody({ remark: 'x'.repeat(301) }))).includes('REMARK_TOO_LONG'));
});

test('TC13 full payment OFF needs no reason/proof', () => {
  assert.deepEqual(validate(normalBody({ fullPayment: { requested: false, reason: '' } })), []);
});

test('TC14 full payment ON with reason and proof passes', () => {
  const fp = { requested: true, reason: 'Client approved the complete travel reimbursement.', proofs: [receipt('approval.pdf', 'application/pdf')] };
  assert.deepEqual(validate(normalBody({ fullPayment: fp })), []);
});

test('TC15 full payment ON without reason is rejected', () => {
  const errors = validate(normalBody({ fullPayment: { requested: true, reason: '', proofs: [receipt('approval.pdf', 'application/pdf')] } }));
  const e = errors.find((x) => x.code === 'FULL_PAYMENT_REASON_REQUIRED');
  assert.equal(e.message, 'Please provide the reason for full payment.');
});

test('TC16 full payment ON without proof is rejected', () => {
  const errors = validate(normalBody({ fullPayment: { requested: true, reason: 'Approved by client', proofs: [] } }));
  const e = errors.find((x) => x.code === 'FULL_PAYMENT_PROOF_REQUIRED');
  assert.equal(e.message, 'Please attach approval/supporting proof for full payment.');
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

test('TC18 full payment request routes directly to Accounts for full payment disbursement without HR approval', () => {
  const claim = { grandRequested: 1250, grandAllowed: 1000, fullPayment: { requested: true, reason: 'x', proofs: [{}] } };
  rules.routeSubmission(claim, { hrApprovalRequired: true, fullPaymentApprovalRequired: false });
  assert.equal(claim.status, 'ACCOUNTS_PENDING');
  assert.equal(claim.payableAmount, 1250, 'full requested amount payable directly by Accounts');
  assert.equal(rules.computePayable(claim), 1250);
  assert.equal(claim.grandRequested, 1250, 'requested amount is preserved');
  claim.fullPayment.status = 'REJECTED';
  assert.equal(rules.computePayable(claim), 1000, 'rejected full payment falls back to allowed');
});

test('TC18b routing: HR approval first, auto-approval when policy does not require it', () => {
  const a = rules.routeSubmission({ grandRequested: 500, grandAllowed: 500, fullPayment: {} }, { hrApprovalRequired: true, fullPaymentApprovalRequired: true });
  assert.equal(a.status, 'HR_PENDING');
  const b = rules.routeSubmission({ grandRequested: 500, grandAllowed: 500, fullPayment: {} }, { hrApprovalRequired: false, fullPaymentApprovalRequired: true });
  assert.equal(b.status, 'ACCOUNTS_PENDING');
  const c = rules.routeSubmission({ grandRequested: 1250, grandAllowed: 1000, fullPayment: { requested: true } }, { hrApprovalRequired: false, fullPaymentApprovalRequired: false });
  assert.equal(c.status, 'ACCOUNTS_PENDING');
  assert.equal(c.payableAmount, 1250);
});

test('TC21/TC22 employee can edit submitted claim until approved, cannot delete submitted claim, cannot edit/delete paid claim', () => {
  const req = { user: { _id: EMP1, role: 'employee' }, tenant: { companyId: 'c1' }, headers: {}, query: {} };
  const claim = { companyId: 'c1', submittedBy: EMP1, status: 'ACCOUNTS_PENDING', employeeClaims: [{ employee: { employeeId: EMP1 } }], fullPayment: {} };
  let p = access.claimPermissions(req, claim);
  assert.equal(p.canPay, false);
  assert.equal(p.canEdit, true);
  assert.equal(p.canDelete, false);
  claim.status = 'PAID';
  claim.lockedAt = new Date();
  p = access.claimPermissions(req, claim);
  assert.equal(p.canEdit, false);
  assert.equal(p.canDelete, false);
});

test('TC21b an HR admin on the claim cannot approve its full payment', () => {
  const req = { user: { _id: EMP1, role: 'hr_admin' }, tenant: { companyId: 'c1' }, headers: {}, query: {} };
  const claim = { companyId: 'c1', submittedBy: EMP1, status: 'FULL_PAYMENT_PENDING', employeeClaims: [{ employee: { employeeId: EMP1 } }], fullPayment: { status: 'PENDING' } };
  assert.equal(access.claimPermissions(req, claim).canDecideFullPayment, false);
  const other = { ...req, user: { _id: EMP2, role: 'hr_admin' } };
  assert.equal(access.claimPermissions(other, claim).canDecideFullPayment, true);
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

test('TC32 logging claim ignores Claim Date', () => {
  const input = rules.normalizeInput(loggingBody({ claimDate: '2026-01-01' }));
  assert.equal(input.claimDate, null);
  assert.equal(input.fromDate.toISOString(), '2026-09-29T00:00:00.000Z');
});

test('expense types are mode-locked (Lodging only in Logging claim and vice versa)', () => {
  assert.ok(codes(validate(normalBody({ expenseType: 'LODGING' }))).includes('EXPENSE_TYPE_MODE'));
  assert.ok(codes(validate(loggingBody({ expenseType: 'FOOD' }))).includes('EXPENSE_TYPE_MODE'));
});

test('invalid lodging date range and future dates are rejected', () => {
  assert.ok(codes(validate(loggingBody({ toDate: '2026-09-29' }))).includes('INVALID_DATE_RANGE'));
  assert.ok(codes(validate(loggingBody({ fromDate: '2026-10-02', toDate: '2026-09-29' }))).includes('INVALID_DATE_RANGE'));
  assert.ok(codes(validate(normalBody({ claimDate: '2026-12-01' }))).includes('FUTURE_DATE'));
  assert.ok(codes(validate(normalBody({ claimDate: '2026-02-31' }))).includes('INVALID_DATE'));
});

test('drafts skip required-field errors but keep format errors', () => {
  const draft = validate({ claimMode: 'NORMAL', requestedAmount: -1 }, { isDraft: true });
  assert.deepEqual(codes(draft), ['AMOUNT_NEGATIVE']);
});

test('type defaults: Food/Travel one per day, Lodging is a logging type', () => {
  assert.equal(types.FOOD.sameDateLimit, 1);
  assert.equal(types.TRAVEL.sameDateLimit, 1);
  assert.equal(types.CONVEYANCE.sameDateLimit, 0);
  assert.equal(types.OTHER.sameDateLimit, 0);
  assert.equal(types.LODGING.claimMode, 'LOGGING');
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

test('calculateAmounts: multi-employee logging claim gives all employees individual items, limits, and excess', async () => {
  const typeConfig = rules.resolveTypeConfig({ code: 'LODGING', name: 'Lodging', category: 'LODGING' });
  const emp1 = { _id: EMP1, name: 'Adesh', role: 'manager', levelNumber: 4 };
  const emp2 = { _id: EMP2, name: 'Rahul', role: 'employee', levelNumber: 8 };
  const input = {
    claimMode: 'LOGGING',
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
    claimMode: 'LOGGING',
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
    claimMode: 'LOGGING',
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
    claimMode: 'LOGGING',
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
    claimMode: 'LOGGING',
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
    claimMode: 'LOGGING',
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
    claimMode: 'LOGGING',
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
    claimMode: 'LOGGING',
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
    claimMode: 'LOGGING',
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
    claimMode: 'LOGGING',
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

test('calculateAmounts: add employee and remove employee in logging claim correctly updates calculations and rules.round2 works', async () => {
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
    claimMode: 'LOGGING',
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

test('TC56 approval OFF in policy strictly returns false and never routes to HR_PENDING', async () => {
  const policyOff = { approvalRequired: false, approvalEngine: 'NONE' };
  const reqOff = await rules.isHrApprovalRequired('comp1', policyOff);
  assert.equal(reqOff, false, 'Approval must be false when policy approvalRequired is false');

  const claim = { grandRequested: 500, grandAllowed: 500, fullPayment: {} };
  rules.routeSubmission(claim, { hrApprovalRequired: reqOff, fullPaymentApprovalRequired: true });
  assert.equal(claim.status, 'ACCOUNTS_PENDING');
  assert.notEqual(claim.status, 'HR_PENDING');
  assert.equal(claim.approvalFlow, 'NONE');
  assert.equal(claim.approvalRequired, false);
});

test('TC57 multi-employee normal claim combines daily limit like logging claim and explains each entry separately', async () => {
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












