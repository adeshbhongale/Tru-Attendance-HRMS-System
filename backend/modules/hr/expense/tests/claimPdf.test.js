const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Writable } = require('node:stream');
const { generateClaimPdf, formatINR, formatDate, formatDateTime } = require('../services/claimPdfGenerator');

test('formatINR formats numbers correctly in Indian format', () => {
  assert.equal(formatINR(1000), '1,000.00');
  assert.equal(formatINR(125000), '1,25,000.00');
  assert.equal(formatINR(0), '0.00');
});

test('generateClaimPdf generates valid PDF bytes without crashing', async () => {
  const dummyClaim = {
    _id: '507f1f77bcf86cd799439011',
    claimNumber: 'EXP-CLAIM-2026-0001',
    status: 'PAID',
    paymentStatus: 'PAID',
    claimType: 'LODGING',
    claimMode: 'LODGING',
    fromDate: new Date('2026-10-10'),
    toDate: new Date('2026-10-12'),
    numberOfNights: 2,
    grandRequested: 5000,
    grandAllowed: 4000,
    grandExcess: 1000,
    payableAmount: 4000,
    paidAmount: 4000,
    submittedBy: {
      name: 'John Doe',
      employeeIdCode: 'EMP1001',
      department: 'Engineering',
      designation: 'Senior Developer',
      email: 'john@example.com',
      phone: '9876543210',
    },
    trip: {
      destination: 'Mumbai',
      destinationClass: 'A',
      customerName: 'Acme Corp',
      purpose: 'Client onsite technical review',
    },
    managerApproval: {
      approverName: 'Jane Smith',
      approverRole: 'MANAGEMENT',
      status: 'APPROVED',
      decidedAt: new Date('2026-10-13T10:00:00Z'),
      remarks: 'Lodging approved per policy',
    },
    disbursement: {
      amount: 4000,
      paymentMethod: 'Bank Transfer (NEFT)',
      paymentReference: 'UTR9988776655',
      paymentDate: new Date('2026-10-14T12:00:00Z'),
    },
    entries: [
      {
        expenseType: 'LODGING',
        description: 'Hotel Stay 2 nights',
        requestedAmount: 5000,
        allowedAmount: 4000,
        excessAmount: 1000,
      },
    ],
    receipts: [
      { name: 'hotel_bill.pdf', size: 102400 },
    ],
  };

  const chunks = [];
  const mockRes = new Writable({
    write(chunk, encoding, callback) {
      chunks.push(chunk);
      callback();
    },
  });

  await new Promise((resolve, reject) => {
    mockRes.on('finish', resolve);
    mockRes.on('error', reject);
    generateClaimPdf(dummyClaim, mockRes);
  });

  const buffer = Buffer.concat(chunks);
  assert.ok(buffer.length > 500, 'PDF buffer should be non-empty');
  // Check PDF signature %PDF-
  assert.equal(buffer.slice(0, 5).toString('ascii'), '%PDF-');

  // Verify that signature boxes are NOT present in the PDF
  const pdfString = buffer.toString('latin1');
  assert.ok(!pdfString.includes('Claimant Signature'), 'Should not contain Claimant Signature');
  assert.ok(!pdfString.includes('Finance Officer'), 'Should not contain Finance Officer signature');
});

test('access.canViewClaim succeeds with populated companyId object (preventing 403)', () => {
  const access = require('../services/expenseAccess');
  const companyId = '65a000000000000000000001';
  const populatedClaim = {
    _id: '65b000000000000000000001',
    companyId: {
      _id: companyId,
      name: 'Trucode Technologies Pvt Ltd',
      legalName: 'Trucode Technologies',
    },
    submittedBy: '65c000000000000000000001',
    status: 'SUBMITTED',
    employeeClaims: [],
  };

  const hrReq = {
    user: { _id: '65d000000000000000000001', role: 'hr_admin', companyId },
    tenant: { companyId },
    headers: {},
    query: {},
  };

  const canView = access.canViewClaim(hrReq, populatedClaim);
  assert.equal(canView, true, 'HR user should be authorized to view/download populated claim');

  const adminReq = {
    user: { _id: '65d000000000000000000002', role: 'company_admin', companyId },
    tenant: { companyId },
    headers: {},
    query: {},
  };
  assert.equal(access.canViewClaim(adminReq, populatedClaim), true, 'Admin should be authorized to view/download');
});

function extractPdfText(buffer) {
  const str = buffer.toString('latin1');
  const tjBlocks = str.match(/\[(.*?)\]\s*TJ/gs) || [];
  return tjBlocks.map((b) => {
    const hexParts = b.match(/<([0-9a-fA-F]+)>/g) || [];
    return hexParts.map((h) => Buffer.from(h.slice(1, -1), 'hex').toString('latin1')).join('');
  }).join(' ');
}

test('generateClaimPdf correctly audits multi-entry line items matching total allowed and excess values', async () => {
  // Exact user scenario:
  // 1 FOOD Expense item Rs. 160.00 Rs. 160.00 Rs. 0.00
  // 2 FOOD Expense item Rs. 100.00 Rs. 100.00 Rs. 0.00
  // 3 FOOD Expense item Rs. 481.00 Rs. 240.00 Rs. 241.00
  // TOTAL AUDITED VALUES: Rs. 741.00 Rs. 500.00 Rs. 241.00
  const multiEntryClaim = {
    _id: '65e000000000000000000001',
    claimNumber: 'EXP-FOOD-2026-0042',
    status: 'SUBMITTED',
    paymentStatus: 'UNPAID',
    claimType: 'FOOD',
    claimMode: 'NORMAL',
    claimDate: new Date('2026-10-20'),
    grandRequested: 741,
    grandAllowed: 500,
    grandExcess: 241,
    payableAmount: 500,
    submittedBy: {
      name: 'Adesh Bhongale',
      employeeIdCode: 'EMP1002',
      department: 'Engineering',
    },
    entries: [
      { expenseType: 'FOOD', requestedAmount: 160, description: 'Breakfast' },
      { expenseType: 'FOOD', requestedAmount: 100, description: 'Tea & Snacks' },
      { expenseType: 'FOOD', requestedAmount: 481, description: 'Team Dinner' },
    ],
    employeeClaims: [
      {
        employee: { name: 'Adesh Bhongale' },
        requestedTotal: 741,
        allowedTotal: 500,
        excessTotal: 241,
        items: [
          { expenseType: 'FOOD', requestedAmount: 160, allowedAmount: 160, excessAmount: 0 },
          { expenseType: 'FOOD', requestedAmount: 100, allowedAmount: 100, excessAmount: 0 },
          { expenseType: 'FOOD', requestedAmount: 481, allowedAmount: 240, excessAmount: 241 },
        ],
      },
    ],
    receipts: [
      { name: 'dinner_receipt.pdf', size: 120500 },
    ],
  };

  const chunks = [];
  const mockRes = new Writable({
    write(chunk, encoding, callback) {
      chunks.push(chunk);
      callback();
    },
  });

  await generateClaimPdf(multiEntryClaim, mockRes);
  const buffer = Buffer.concat(chunks);
  const text = extractPdfText(buffer);

  // Verify that individual audited amounts are present in the PDF output
  assert.ok(text.includes('160.00'), 'Should contain 160.00');
  assert.ok(text.includes('100.00'), 'Should contain 100.00');
  assert.ok(text.includes('481.00'), 'Should contain 481.00 claimed');
  assert.ok(text.includes('240.00'), 'Should contain 240.00 allowed for entry 3');
  assert.ok(text.includes('241.00'), 'Should contain 241.00 excess for entry 3');
  assert.ok(text.includes('500.00'), 'Should contain 500.00 total allowed');
  assert.ok(text.includes('741.00'), 'Should contain 741.00 total claimed');
  assert.ok(text.includes('ATTACHED PROOFS & PHOTO DOCUMENTATION'), 'Should contain attached proofs documentation section');
});

test('generateClaimPdf includes conveyance photo proofs and receipts without duplication', async () => {
  const conveyanceClaim = {
    _id: '65e000000000000000000002',
    claimNumber: 'EXP-CONV-2026-0099',
    status: 'SUBMITTED',
    paymentStatus: 'UNPAID',
    claimType: 'CONVEYANCE',
    claimMode: 'NORMAL',
    claimDate: new Date('2026-10-21'),
    grandRequested: 400,
    grandAllowed: 400,
    grandExcess: 0,
    payableAmount: 400,
    submittedBy: {
      name: 'Rohan Sharma',
      employeeIdCode: 'EMP1003',
      department: 'Field Service',
    },
    entries: [
      {
        expenseType: 'CONVEYANCE',
        vehicle: 'twoWheeler',
        distanceKm: 40,
        startKm: 12400,
        endKm: 12440,
        requestedAmount: 400,
        allowedAmount: 400,
        excessAmount: 0,
        numberPlatePhotos: [{ name: 'bike_plate.jpg', size: 1045000 }],
        startKmPhotos: [{ name: 'odo_start.jpg', size: 2614000 }],
        endKmPhotos: [{ name: 'odo_end.jpg', size: 2876000 }],
      },
    ],
    employeeClaims: [
      {
        employee: { name: 'Rohan Sharma' },
        requestedTotal: 400,
        allowedTotal: 400,
        excessTotal: 0,
        items: [
          {
            expenseType: 'CONVEYANCE',
            vehicle: 'twoWheeler',
            distanceKm: 40,
            requestedAmount: 400,
            allowedAmount: 400,
            excessAmount: 0,
          },
        ],
      },
    ],
    receipts: [],
  };

  const chunks = [];
  const mockRes = new Writable({
    write(chunk, encoding, callback) {
      chunks.push(chunk);
      callback();
    },
  });

  await generateClaimPdf(conveyanceClaim, mockRes);
  const buffer = Buffer.concat(chunks);
  const text = extractPdfText(buffer);

  assert.ok(text.includes('Start KM Odometer Photo (12400 km)'), 'Should contain start reading info');
  assert.ok(text.includes('End KM Odometer Photo (12440 km)'), 'Should contain end reading info');
  assert.ok(text.includes('Vehicle Photo'), 'Should contain vehicle photo info');
  assert.ok(text.includes('Page 2 of 2'), 'Should contain Page 2 of 2 in multi-page PDF');
});

function getPageCount(buffer) {
  const str = buffer.toString('latin1');
  const matches = str.match(/\/Type\s*\/Page\b/g);
  return matches ? matches.length : 0;
}

test('Strict page count verification: single-entry claim without proofs generates strictly 1 page', async () => {
  const claim = {
    _id: '65e000000000000000000010',
    claimNumber: 'EXP-1PAGE-001',
    status: 'APPROVED',
    paymentStatus: 'UNPAID',
    claimType: 'FOOD',
    claimMode: 'NORMAL',
    submittedBy: { name: 'Adesh Bhongale', employeeIdCode: 'EMP1002', department: 'Engineering' },
    entries: [{ expenseType: 'FOOD', requestedAmount: 350, allowedAmount: 350, excessAmount: 0, description: 'Lunch' }],
    receipts: [],
  };

  const chunks = [];
  const mockRes = new Writable({
    write(chunk, encoding, callback) {
      chunks.push(chunk);
      callback();
    },
  });

  await generateClaimPdf(claim, mockRes);
  const buffer = Buffer.concat(chunks);
  const pages = getPageCount(buffer);
  assert.equal(pages, 1, `Single-entry claim without proofs must generate exactly 1 page, got ${pages}`);

  const text = extractPdfText(buffer);
  assert.ok(text.includes('This is an official computer-generated voucher issued by Gatimaan. Confidential.'), 'Footer text must be present');
  assert.ok(text.includes('Page 1 of 1'), 'Page number must show Page 1 of 1');
});

test('Strict page count verification: multi-entry claim with 8 entries without proofs generates strictly 1 page', async () => {
  const claim = {
    _id: '65e000000000000000000011',
    claimNumber: 'EXP-MULTI-008',
    status: 'SUBMITTED',
    paymentStatus: 'UNPAID',
    claimType: 'FOOD',
    claimMode: 'NORMAL',
    submittedBy: { name: 'Adesh Bhongale', employeeIdCode: 'EMP1002', department: 'Engineering' },
    entries: Array.from({ length: 8 }, (_, i) => ({
      expenseType: 'FOOD',
      requestedAmount: 100,
      allowedAmount: 100,
      excessAmount: 0,
      description: `Daily Meal Item #${i + 1}`,
    })),
    receipts: [],
  };

  const chunks = [];
  const mockRes = new Writable({
    write(chunk, encoding, callback) {
      chunks.push(chunk);
      callback();
    },
  });

  await generateClaimPdf(claim, mockRes);
  const buffer = Buffer.concat(chunks);
  const pages = getPageCount(buffer);
  assert.equal(pages, 1, `Multi-entry claim with 8 items without proofs must generate strictly 1 page, got ${pages}`);

  const text = extractPdfText(buffer);
  assert.ok(text.includes('Page 1 of 1'), 'Page number must show Page 1 of 1');
});

test('Strict page count verification: claim with 2 to 4 photo proofs generates strictly 2 pages', async () => {
  const claim = {
    _id: '65e000000000000000000012',
    claimNumber: 'EXP-PROOFS-002',
    status: 'APPROVED',
    paymentStatus: 'UNPAID',
    claimType: 'FOOD',
    claimMode: 'NORMAL',
    submittedBy: { name: 'Adesh Bhongale', employeeIdCode: 'EMP1002', department: 'Engineering' },
    entries: [{ expenseType: 'FOOD', requestedAmount: 500, allowedAmount: 500, excessAmount: 0, description: 'Client Dinner' }],
    receipts: [
      { name: 'bill_receipt_1.jpg', size: 250000 },
      { name: 'bill_receipt_2.jpg', size: 310000 },
      { name: 'payment_slip.jpg', size: 180000 },
    ],
  };

  const chunks = [];
  const mockRes = new Writable({
    write(chunk, encoding, callback) {
      chunks.push(chunk);
      callback();
    },
  });

  await generateClaimPdf(claim, mockRes);
  const buffer = Buffer.concat(chunks);
  const pages = getPageCount(buffer);
  assert.equal(pages, 2, `Claim with 3 photo proofs must generate strictly 2 pages, got ${pages}`);

  const text = extractPdfText(buffer);
  assert.ok(text.includes('Page 1 of 2'), 'Must contain Page 1 of 2');
  assert.ok(text.includes('Page 2 of 2'), 'Must contain Page 2 of 2');
  assert.ok(text.includes('ATTACHED PROOFS & PHOTO DOCUMENTATION'), 'Must contain proof gallery section');
});

test('Strict page count verification: claim with 8 proofs generates strictly 3 pages with continuation header', async () => {
  const claim = {
    _id: '65e000000000000000000013',
    claimNumber: 'EXP-MANY-PROOFS',
    status: 'APPROVED',
    paymentStatus: 'PAID',
    claimType: 'LODGING',
    claimMode: 'LODGING',
    fromDate: new Date('2026-10-15'),
    toDate: new Date('2026-10-18'),
    numberOfNights: 3,
    grandRequested: 9000,
    grandAllowed: 9000,
    grandExcess: 0,
    payableAmount: 9000,
    paidAmount: 9000,
    submittedBy: { name: 'Adesh Bhongale', employeeIdCode: 'EMP1002', department: 'Engineering' },
    trip: { customerName: 'Apex Industries', destination: 'Pune', destinationClass: 'B' },
    entries: [{ expenseType: 'LODGING', requestedAmount: 9000, allowedAmount: 9000, excessAmount: 0, description: 'Hotel Stay' }],
    receipts: Array.from({ length: 8 }, (_, i) => ({
      name: `lodging_bill_page_${i + 1}.jpg`,
      size: 500000,
    })),
  };

  const chunks = [];
  const mockRes = new Writable({
    write(chunk, encoding, callback) {
      chunks.push(chunk);
      callback();
    },
  });

  await generateClaimPdf(claim, mockRes);
  const buffer = Buffer.concat(chunks);
  const pages = getPageCount(buffer);
  assert.equal(pages, 3, `Claim with 8 proofs must generate strictly 3 pages, got ${pages}`);

  const text = extractPdfText(buffer);
  assert.ok(text.includes('ATTACHED PROOFS & PHOTO DOCUMENTATION (CONTINUED)'), 'Must contain continuation header on page 3');
  assert.ok(text.includes('Page 1 of 3'), 'Must contain Page 1 of 3');
  assert.ok(text.includes('Page 2 of 3'), 'Must contain Page 2 of 3');
  assert.ok(text.includes('Page 3 of 3'), 'Must contain Page 3 of 3');
});

test('Applicant mobile number and contact info are fetched and rendered in PDF', async () => {
  const claim = {
    _id: '65e000000000000000000014',
    claimNumber: 'EXP-MOBILE-001',
    status: 'APPROVED',
    paymentStatus: 'UNPAID',
    claimType: 'FOOD',
    claimMode: 'NORMAL',
    submittedBy: {
      name: 'Adesh Bhongale',
      employeeIdCode: 'EMP1002',
      department: 'Engineering',
      designation: 'Tech Lead',
      mobile: '9876543210',
      email: 'adesh@trucode.in',
    },
    entries: [{ expenseType: 'FOOD', requestedAmount: 500, allowedAmount: 500, excessAmount: 0 }],
    receipts: [],
  };

  const chunks = [];
  const mockRes = new Writable({
    write(chunk, encoding, callback) {
      chunks.push(chunk);
      callback();
    },
  });

  await generateClaimPdf(claim, mockRes);
  const buffer = Buffer.concat(chunks);
  const text = extractPdfText(buffer);

  assert.ok(text.includes('9876543210'), 'PDF should include applicant mobile number');
  assert.ok(text.includes('adesh@trucode.in'), 'PDF should include applicant email');
  assert.ok(text.includes('Mobile / Contact:'), 'PDF should include Mobile / Contact label');
});

test('Calculation breakdown displays accurate whole-claim figures and never produces ¹ symbol or single-item mismatch', async () => {
  // Scenario: 3 food items (160, 100, 481 = 741 claimed, 500 allowed, 241 excess)
  // Entry 0 had a stale explanation saying "claimed bill is 160. Since your bill is within your daily limit, 160 is fully allowed."
  const claim = {
    _id: '65e000000000000000000015',
    claimNumber: 'EXP-CORRECT-CALC',
    status: 'SUBMITTED',
    paymentStatus: 'UNPAID',
    claimType: 'FOOD',
    claimMode: 'NORMAL',
    grandRequested: 741,
    grandAllowed: 500,
    grandExcess: 241,
    payableAmount: 500,
    submittedBy: { name: 'Adesh Bhongale', employeeIdCode: 'EMP1002', mobile: '9988776655' },
    entries: [
      { expenseType: 'FOOD', requestedAmount: 160, allowedAmount: 160, excessAmount: 0, plainExplanation: 'Your daily food limit is ₹500/day and your claimed bill is ₹160. Since your bill is within your daily limit, ₹160 is fully allowed.' },
      { expenseType: 'FOOD', requestedAmount: 100, allowedAmount: 100, excessAmount: 0 },
      { expenseType: 'FOOD', requestedAmount: 481, allowedAmount: 240, excessAmount: 241 },
    ],
    receipts: [],
  };

  const chunks = [];
  const mockRes = new Writable({
    write(chunk, encoding, callback) {
      chunks.push(chunk);
      callback();
    },
  });

  await generateClaimPdf(claim, mockRes);
  const buffer = Buffer.concat(chunks);
  const text = extractPdfText(buffer);

  // Must NOT contain the corrupted "¹" glyph or state that only 160 is claimed/allowed
  assert.ok(!text.includes('¹'), 'PDF should never render corrupted ¹ symbol');
  assert.ok(!text.includes('claimed bill is Rs. 160.00. Since your bill is within your daily limit, Rs. 160.00 is fully allowed'), 'Must not report single item 160 as fully allowed when claim total is 741');

  // Must contain accurate total claimed 741.00, allowed 500.00, and excess 241.00
  assert.ok(text.includes('741.00'), 'Should contain 741.00 total claimed');
  assert.ok(text.includes('500.00'), 'Should contain 500.00 total allowed');
  assert.ok(text.includes('241.00'), 'Should contain 241.00 total excess');
  assert.ok(text.includes('Combined claimed bill across 3 items is Rs. 741.00'), 'Explanation must accurately reflect all 3 items and total 741.00');
});

test('Full Payment for Management User in PDF: not in pending status, shows not applicable and direct Accounts routing', async () => {
  const claim = {
    _id: '65e000000000000000000021',
    claimNumber: 'EXP-MGMT-FP-01',
    status: 'SUBMITTED',
    paymentStatus: 'UNPAID',
    claimType: 'FOOD',
    claimMode: 'NORMAL',
    submittedBy: { name: 'Adesh Bhongale', employeeIdCode: 'MGT101', department: 'Management', designation: 'Director' },
    fullPayment: { requested: true, reason: 'High-level client board dinner' },
    grandRequested: 2500,
    grandAllowed: 1000,
    grandExcess: 1500,
    entries: [{ expenseType: 'FOOD', requestedAmount: 2500, allowedAmount: 1000, excessAmount: 1500, description: 'Client Dinner' }],
    receipts: [],
  };

  const chunks = [];
  const mockRes = new Writable({
    write(chunk, encoding, cb) { chunks.push(chunk); cb(); }
  });

  await generateClaimPdf(claim, mockRes);
  const buffer = Buffer.concat(chunks);
  const text = extractPdfText(buffer);

  // Must NOT show PENDING status in approval
  assert.ok(!text.includes('Approval Decision: PENDING'), 'Approval decision must NOT be PENDING for management user');
  // Must show NOT APPLICABLE badge and status
  assert.ok(text.includes('NOT APPLICABLE'), 'Must display NOT APPLICABLE badge');
  assert.ok(text.includes('This approval is not applicable for management user.'), 'Must state This approval is not applicable for management user.');
  assert.ok(!text.includes('Self-approved'), 'Must NOT include Self-approved in PDF');
  assert.ok(/forwarded directly to\s+Accounts/.test(text), 'Must clearly state direct routing to Accounts');
  assert.ok(text.includes('High-level client board dinner'), 'Must display full payment justification reason');
});

test('Full Payment for Regular Employee in PDF: clearly shows designated approver, status, and approval requirement', async () => {
  const claim = {
    _id: '65e000000000000000000022',
    claimNumber: 'EXP-REG-FP-02',
    status: 'APPROVAL_PENDING',
    paymentStatus: 'UNPAID',
    claimType: 'FOOD',
    claimMode: 'NORMAL',
    submittedBy: { name: 'Siddhesh Shinde', employeeIdCode: 'EMP301', department: 'Engineering', designation: 'Software Engineer' },
    fullPayment: { requested: true, reason: 'Project milestone celebration' },
    managerApproval: {
      kind: 'FULL_PAYMENT',
      approver: { name: 'Adesh Bhongale', employeeIdCode: 'MGT101', designation: 'Director', department: 'Management' },
      approverRole: 'MANAGEMENT',
      status: 'PENDING',
    },
    grandRequested: 3000,
    grandAllowed: 1000,
    grandExcess: 2000,
    entries: [{ expenseType: 'FOOD', requestedAmount: 3000, allowedAmount: 1000, excessAmount: 2000, description: 'Milestone dinner' }],
    receipts: [],
  };

  const chunks = [];
  const mockRes = new Writable({
    write(chunk, encoding, cb) { chunks.push(chunk); cb(); }
  });

  await generateClaimPdf(claim, mockRes);
  const buffer = Buffer.concat(chunks);
  const text = extractPdfText(buffer);

  // Must clearly show full payment request, designated approver, and approval status
  assert.ok(text.includes('PENDING MANAGEMENT APPROVAL'), 'Must show PENDING MANAGEMENT APPROVAL badge');
  assert.ok(text.includes('Adesh Bhongale [MGT101]'), 'Must show designated approver with code');
  assert.ok(/Management Approver\s+\(Full Payment\)/.test(text), 'Must show Management Approver role');
  assert.ok(text.includes('Project milestone celebration'), 'Must show full payment reason');
  assert.ok(text.includes('Awaiting special approval from designated Management authority'), 'Must explain full payment approval condition');
});

test('Accompanied Employees in PDF: clearly shows all employee names, IDs, departments, and individual daily & stay limits', async () => {
  const claim = {
    _id: '65e000000000000000000023',
    claimNumber: 'EXP-ACCOMP-03',
    status: 'SUBMITTED',
    paymentStatus: 'UNPAID',
    claimType: 'LODGING',
    claimMode: 'LODGING',
    fromDate: '2026-10-22',
    toDate: '2026-10-24',
    numberOfNights: 2,
    numberOfEmployees: 2,
    submittedBy: { name: 'Adesh Bhongale', employeeIdCode: 'EMP1001', department: 'Engineering', designation: 'Tech Lead' },
    employeeClaims: [
      {
        employee: { name: 'Adesh Bhongale', employeeIdCode: 'EMP1001', department: 'Engineering', designation: 'Tech Lead' },
        items: [{ expenseType: 'LODGING', perDayLimit: 2000, requestedAmount: 3500, allowedAmount: 3500, excessAmount: 0 }],
      },
      {
        employee: { name: 'Prathemesh Joshi', employeeIdCode: 'EMP1002', department: 'Engineering', designation: 'QA Lead' },
        items: [{ expenseType: 'LODGING', perDayLimit: 1500, requestedAmount: 2500, allowedAmount: 2500, excessAmount: 0 }],
      },
    ],
    plainExplanation: 'Individual limits per day:\n• Adesh Bhongale: ₹2,000/day\n• Prathemesh Joshi: ₹1,500/day\nCombined Whole Claim Limit: ₹7,000 for 2 days',
    grandRequested: 6000,
    grandAllowed: 6000,
    grandExcess: 0,
    entries: [{ expenseType: 'LODGING', requestedAmount: 6000, allowedAmount: 6000, excessAmount: 0, description: 'Hotel 2 nights' }],
    receipts: [],
  };

  const chunks = [];
  const mockRes = new Writable({
    write(chunk, encoding, cb) { chunks.push(chunk); cb(); }
  });

  await generateClaimPdf(claim, mockRes);
  const buffer = Buffer.concat(chunks);
  const text = extractPdfText(buffer);

  // Must show Accompanied Employees section header
  assert.ok(text.includes('ACCOMPANIED EMPLOYEES & INDIVIDUAL POLICY LIMITS (2 EMPLOYEES)'), 'Must show accompanied employees section');
  // Must show both employee names (employee codes omitted in accompanied table per requirement)
  assert.ok(text.includes('Adesh Bhongale'), 'Must show primary claimant name');
  assert.ok(text.includes('Prathemesh Joshi'), 'Must show accompanied employee name');
  // Must show roles
  assert.ok(text.includes('#1 Primary Filer'), 'Must show #1 Primary Filer');
  assert.ok(text.includes('#2 Accompanied'), 'Must show #2 Accompanied');
  // Must show individual limits
  assert.ok(text.includes('2,000.00/day'), 'Must show primary daily limit of Rs. 2,000.00/day');
  assert.ok(text.includes('1,500.00/day'), 'Must show accompanied daily limit of Rs. 1,500.00/day');
  assert.ok(text.includes('4,000.00 (2 Days)'), 'Must show primary total stay limit of Rs. 4,000.00 (2 Days)');
  assert.ok(text.includes('3,000.00 (2 Days)'), 'Must show accompanied total stay limit of Rs. 3,000.00 (2 Days)');
});

test('Audit & Verification Box: Standard claim without Full Payment does NOT show audit box', async () => {
  const claim = {
    _id: '65e000000000000000000031',
    claimNumber: 'EXP-STD-FOOD-01',
    status: 'SUBMITTED',
    paymentStatus: 'UNPAID',
    claimType: 'FOOD',
    claimMode: 'NORMAL',
    submittedBy: { name: 'Adesh Bhongale', employeeIdCode: 'EMP1001', department: 'Engineering' },
    grandRequested: 400,
    grandAllowed: 400,
    grandExcess: 0,
    entries: [{ expenseType: 'FOOD', requestedAmount: 400, allowedAmount: 400, excessAmount: 0, description: 'Lunch' }],
    receipts: [],
  };

  const chunks = [];
  const mockRes = new Writable({
    write(chunk, encoding, cb) { chunks.push(chunk); cb(); }
  });

  await generateClaimPdf(claim, mockRes);
  const buffer = Buffer.concat(chunks);
  const text = extractPdfText(buffer);

  assert.ok(!text.includes('APPROVAL & VERIFICATION AUDIT'), 'Standard Food claim must NOT show Approval & Verification Audit box');
});

test('Audit & Verification Box: OTHER (Purchase/Normal) claim DOES show audit box with Reporting Manager', async () => {
  const claim = {
    _id: '65e000000000000000000032',
    claimNumber: 'EXP-OTHER-01',
    status: 'APPROVAL_PENDING',
    paymentStatus: 'UNPAID',
    claimType: 'OTHER',
    claimMode: 'NORMAL',
    submittedBy: { name: 'Siddhesh Shinde', employeeIdCode: 'EMP301', department: 'Engineering' },
    managerApproval: {
      kind: 'OTHER_EXPENSE',
      approver: { name: 'Rohit Patil', employeeIdCode: 'MGR201', designation: 'Engineering Manager', department: 'Engineering' },
      approverRole: 'REPORTING_MANAGER',
      status: 'PENDING',
    },
    grandRequested: 1200,
    grandAllowed: 1200,
    grandExcess: 0,
    entries: [{ expenseType: 'OTHER', otherSubType: 'PURCHASE', requestedAmount: 1200, allowedAmount: 1200, excessAmount: 0, description: 'Office hardware tools' }],
    receipts: [],
  };

  const chunks = [];
  const mockRes = new Writable({
    write(chunk, encoding, cb) { chunks.push(chunk); cb(); }
  });

  await generateClaimPdf(claim, mockRes);
  const buffer = Buffer.concat(chunks);
  const text = extractPdfText(buffer);

  assert.ok(!text.includes('APPROVAL & VERIFICATION AUDIT'), 'Must NOT contain legacy audit header');
  assert.ok(text.includes('1ST APPROVAL: REPORTING MANAGER APPROVAL'), 'OTHER claim must show 1st Approval Reporting Manager card');
  assert.ok(text.includes('Rohit Patil [MGR201]'), 'Must show Reporting Manager as designated approver');
  assert.ok(text.includes('Reporting Manager'), 'Must show Reporting Manager role');
  assert.ok(text.includes('AWAITING APPROVAL'), 'Must show Awaiting Approval status');
  assert.ok(text.includes('2ND APPROVAL'), 'Stock purchase OTHER claim must also show 2nd Approval CFO section');
  assert.ok(text.includes('ACCOUNTS ADMIN APPROVAL (STEP 1 VERIFICATION)'), 'Must also show Accounts Admin Step 1 approval section');
});

test('All Approvals & Disbursement in PDF: renders 1st Approval, 2nd Approval (CFO), Accounts Step 1 Approval, and Step 2 Payment with remarks', async () => {
  const claim = {
    _id: '65e000000000000000000033',
    claimNumber: 'EXP-ALL-APPROVALS-01',
    status: 'PAID',
    paymentStatus: 'PAID',
    claimType: 'FOOD',
    claimMode: 'NORMAL',
    submittedBy: { name: 'Siddhesh Shinde', employeeIdCode: 'EMP301', department: 'Engineering', designation: 'Engineer' },
    fullPayment: {
      requested: true,
      reason: 'Late night client deployment dinner',
      status: 'APPROVED',
      approvedAmount: 2500,
      decidedAt: new Date('2026-10-25T14:00:00Z'),
    },
    managerApproval: {
      kind: 'FULL_PAYMENT',
      approver: { name: 'Rohit Patil', employeeIdCode: 'MGR201', designation: 'Engineering Manager', department: 'Engineering' },
      approverRole: 'REPORTING_MANAGER',
      status: 'APPROVED',
      decidedAt: new Date('2026-10-25T11:30:00Z'),
      remarks: 'Verified client deployment attendance.',
    },
    financeApproval: {
      approver: { name: 'Vikram Deshmukh', employeeIdCode: 'CFO101', designation: 'CFO', department: 'Finance' },
      approverName: 'Vikram Deshmukh',
      status: 'APPROVED',
      decidedAt: new Date('2026-10-25T14:00:00Z'),
      remarks: 'Approved full payment exception as CFO.',
    },
    accountsApproval: {
      status: 'APPROVED',
      approvedBy: { name: 'Neha Kulkarni', employeeIdCode: 'ACC401', designation: 'Accounts Manager', department: 'Accounts' },
      approvedByName: 'Neha Kulkarni',
      approvedAt: new Date('2026-10-26T09:15:00Z'),
      remarks: 'Bills verified for GST compliance.',
    },
    disbursement: {
      amount: 2500,
      paymentDate: new Date('2026-10-26T16:30:00Z'),
      paymentMethod: 'Bank Transfer (NEFT)',
      paymentReference: 'UTR9988776655',
      recordedByName: 'Neha Kulkarni',
      remarks: 'Settled via corporate HDFC account.',
      paymentProofs: [{ name: 'neft_advice.jpg', size: 145000 }],
    },
    paidAmount: 2500,
    payableAmount: 2500,
    grandRequested: 2500,
    grandAllowed: 1000,
    grandExcess: 1500,
    entries: [{ expenseType: 'FOOD', requestedAmount: 2500, allowedAmount: 1000, excessAmount: 1500, description: 'Client deployment dinner' }],
    receipts: [],
  };

  const chunks = [];
  const mockRes = new Writable({
    write(chunk, encoding, cb) { chunks.push(chunk); cb(); }
  });

  await generateClaimPdf(claim, mockRes);
  const buffer = Buffer.concat(chunks);
  const text = extractPdfText(buffer);

  assert.ok(text.includes('Rohit Patil [MGR201]'), 'Must show 1st Approver name and code');
  assert.ok(text.includes('Verified client deployment attendance.'), 'Must show 1st Approval remark');
  assert.ok(text.includes('Vikram Deshmukh [CFO101]'), 'Must show 2nd Approver (CFO) name and code');
  assert.ok(text.includes('Approved full payment exception as CFO.'), 'Must show 2nd Approval (CFO) remark');
  assert.ok(text.includes('Neha Kulkarni [ACC401]'), 'Must show Accounts Step 1 Approver name and code');
  assert.ok(text.includes('Bills verified for GST compliance.'), 'Must show Accounts Step 1 approval remark');
  assert.ok(text.includes('Settled via corporate HDFC account.'), 'Must show Step 2 payment remark');
  assert.ok(text.includes('UTR9988776655'), 'Must show payment reference UTR');
  assert.ok(text.includes('PAYMENT CONFIRMATION PROOF'), 'Must include payment confirmation proof in proof gallery');
});

test('Lodging claim with accompanied employees, full payment, all approvals, and 3 proofs generates strictly 2 pages without a blank intermediate page', async () => {
  const claim = {
    _id: '65e000000000000000000034',
    claimNumber: 'EXP-2026-000001',
    status: 'ACCOUNTS_APPROVED',
    paymentStatus: 'AWAITING_DISBURSEMENT',
    claimType: 'LODGING',
    claimMode: 'LOGGING',
    submittedAt: new Date('2026-10-12T17:06:00Z'),
    submittedBy: {
      name: 'Adesh Bhongale',
      employeeIdCode: 'TCSF11A_033',
      department: 'Software and Systems',
      designation: 'ERP Software Trainee',
      mobile: '8530471572',
      email: 'adeshbhongale@gmail.com',
    },
    trip: {
      customerName: 'New',
      destination: 'Pune',
      destinationClass: 'A',
      purpose: 'Tests',
    },
    employeeClaims: [
      {
        employee: { name: 'Adesh Bhongale', employeeIdCode: 'TCSF11A_033', department: 'Software and Systems', designation: 'ERP Software Trainee' },
        items: [{ expenseType: 'LODGING', perDayLimit: 1200, requestedAmount: 4250, allowedAmount: 4162.5, excessAmount: 87.5, quantity: 1 }],
      },
      {
        employee: { name: 'Abhay Mudgal', employeeIdCode: 'EMP202', department: 'Customer Support', designation: 'Customer Support Team Lead' },
        items: [{ expenseType: 'LODGING', perDayLimit: 2500, requestedAmount: 4250, allowedAmount: 4162.5, excessAmount: 87.5, quantity: 1 }],
      },
    ],
    plainExplanation: 'Individual limits per day: • Adesh Bhongale: Rs. 1,200/day (Total: Rs. 3,600 for 3 days) • Abhay Mudgal: Rs. 2,500/day (Total: Rs. 7,500 for 3 days) Stay budget rule (2 employees): 75% of combined budget = 75% × (Rs. 3,600 + Rs. 7,500) = Rs. 8,325. Combined Whole Claim Limit: Rs. 8,325 (3 days). Claimed bill: Rs. 8,500. Therefore, Rs. 8,325 is allowed and Rs. 175 is excess beyond policy limit (Rs. 87.5 excess per employee).',
    fullPayment: {
      requested: true,
      reason: 'I want all',
      status: 'APPROVED',
      approvedAmount: 8500,
      proofs: [{ name: '1000632158.jpg', size: 120000 }],
    },
    financeApproval: {
      status: 'NOT_REQUIRED',
      approverName: 'Preetam Dige',
      approver: { name: 'Preetam Dige', employeeIdCode: 'TCMN3A_003', designation: 'VP Accounts & Stores', department: 'Accounts and Purchase' },
    },
    accountsApproval: {
      status: 'APPROVED',
      approvedBy: { name: 'System Super Admin', employeeIdCode: 'SUPER001' },
      approvedByName: 'System Super Admin',
      approvedAt: new Date('2026-11-05T16:11:00Z'),
      remarks: 'yress',
    },
    grandRequested: 8500,
    grandAllowed: 8325,
    grandExcess: 175,
    payableAmount: 8500,
    entries: [{ expenseType: 'LODGING', requestedAmount: 8500, allowedAmount: 8325, excessAmount: 175, description: 'Tests', quantity: 1 }],
    receipts: [{ name: '1000632736.jpg', size: 180000 }],
    serviceReports: [{ name: '1000632736_sr.jpg', size: 180000 }],
  };

  const chunks = [];
  const mockRes = new Writable({
    write(chunk, encoding, cb) { chunks.push(chunk); cb(); }
  });

  await generateClaimPdf(claim, mockRes);
  const buffer = Buffer.concat(chunks);
  const pages = getPageCount(buffer);
  const text = extractPdfText(buffer);

  assert.equal(pages, 2, `Claim with 3 proofs must generate strictly 2 pages (no blank page 2), got ${pages}`);
  assert.ok(text.includes('Page 1 of 2'), 'Must contain Page 1 of 2');
  assert.ok(text.includes('Page 2 of 2'), 'Must contain Page 2 of 2');
  assert.ok(!text.includes('LODGING (LOGGING)'), 'Must normalize LOGGING typo to LODGING');
  assert.ok(!text.includes('Barcode: N/A'), 'Lodging item must not show stock purchase Barcode tag');
  assert.ok(!text.includes('Not Applicable (Management User)'), 'Trainee employee must not be marked as Management User');
  assert.ok(!text.includes('APPROVAL & VERIFICATION AUDIT'), 'Must NOT contain legacy audit header');
  assert.ok(!text.includes('AUDITED VALUES'), 'Must NOT contain AUDITED VALUES in Total Claim Amount bar');
  assert.ok(text.includes('Total Claim Amount (Payable: Rs. 8,500.00):'), 'Must show Total Claim Amount bar matching Claim Details UI');
  assert.ok(text.includes('5. FULL PAYMENT DETAILS'), 'Must include 5. FULL PAYMENT DETAILS card');
  assert.ok(text.includes('1ST APPROVAL: REPORTING MANAGER APPROVAL (FULL PAYMENT)'), 'Must include 1st Approval card');
  assert.ok(text.includes('2ND APPROVAL: CFO / FINANCE HEAD'), 'Must include 2nd Approval CFO card');
  assert.ok(!text.includes('AWAITING 2ND APPROVAL'), 'Already-approved claim must NOT show AWAITING 2ND APPROVAL');
  assert.ok(text.includes('APPROVED by Preetam Dige'), 'Must show APPROVED by Preetam Dige in status summary');
  assert.ok(text.includes('ACCOUNTS ADMIN APPROVAL (STEP 1 VERIFICATION) & PAYMENT'), 'Must include Accounts Admin Approval & Payment card');
  assert.ok(text.includes('6. CALCULATION BREAKDOWN & POLICY EXPLANATION'), 'Must include 6. CALCULATION BREAKDOWN card');
  assert.ok(text.includes('7. SERVICE REPORTS (1)'), 'Must include standalone 7. SERVICE REPORTS card');
  assert.ok(text.includes('8. CLAIM STATUS & APPROVAL JOURNEY'), 'Must include 8. CLAIM STATUS & APPROVAL JOURNEY section');
  assert.ok(text.includes('CLAIM JOURNEY'), 'Must include CLAIM JOURNEY timeline header');
  assert.ok(text.includes('Claim Submitted'), 'Must include Step 1 Claim Submitted');
  assert.ok(text.includes('1st Approval: Reporting Manager (Full Payment)'), 'Must include Step 2 Reporting Manager Approval');
  assert.ok(text.includes('2nd Approval: CFO / Finance Head'), 'Must include Step 3 CFO / Finance Head Approval');
  assert.ok(text.includes('Accounts Admin Approval (Step 1)'), 'Must include Step 4 Accounts Admin Approval (Step 1)');
  assert.ok(text.includes('Payment & Settlement (Step 2)'), 'Must include Step 5 Payment & Settlement (Step 2)');
});

test('EXP-2026-000003 scenario: Management user Lodging claim with stayType HOTEL, Policy Limit column, and Full Payment renders cleanly without overlap or redundant LODGING (LODGING)', async () => {
  const claim = {
    _id: '65e000000000000000000035',
    claimNumber: 'EXP-2026-000003',
    status: 'SUBMITTED',
    paymentStatus: 'UNPAID',
    claimType: 'LODGING',
    claimMode: 'LODGING',
    stayType: 'HOTEL',
    fromDate: '2026-10-12',
    toDate: '2026-10-15',
    numberOfNights: 3,
    submittedAt: new Date('2026-10-12T17:19:00Z'),
    submittedBy: {
      name: 'Siddhesh Shinde',
      employeeIdCode: 'EMP009',
      department: 'Management',
      designation: 'Managing Director',
      mobile: '8551003526',
      email: 'siddhesh.shinde@trucode.in',
    },
    trip: {
      customerName: 'News',
      destination: 'Mumbai',
      destinationClass: 'A',
      purpose: 'Testing',
    },
    employeeClaims: [
      {
        employee: { name: 'Siddhesh Shinde', employeeIdCode: 'EMP009', department: 'Management', designation: 'Managing Director' },
        items: [{ expenseType: 'LODGING', perDayLimit: 2500, requestedAmount: 4250, allowedAmount: 4162.5, excessAmount: 87.5 }],
      },
      {
        employee: { name: 'Adesh Bhongale', employeeIdCode: 'TCSF11A_033', department: 'Software and Systems', designation: 'ERP Software Trainee' },
        items: [{ expenseType: 'LODGING', perDayLimit: 1200, requestedAmount: 4250, allowedAmount: 4162.5, excessAmount: 87.5 }],
      },
    ],
    fullPayment: {
      requested: true,
      reason: 'I want all payment now.',
      proofs: [{ name: '1000632158.jpg', size: 120000 }],
    },
    grandRequested: 8500,
    grandPolicyLimit: 8325,
    grandAllowed: 8325,
    grandExcess: 175,
    payableAmount: 8500,
    entries: [{ expenseType: 'LODGING', requestedAmount: 8500, policyLimit: 8325, allowedAmount: 8325, excessAmount: 175, description: 'Testing' }],
    receipts: [{ name: '1000632736.jpg', size: 180000 }],
    serviceReports: [{ name: '1000632736_sr.jpg', size: 180000 }],
  };

  const chunks = [];
  const mockRes = new Writable({
    write(chunk, encoding, cb) { chunks.push(chunk); cb(); }
  });

  await generateClaimPdf(claim, mockRes);
  const buffer = Buffer.concat(chunks);
  const pages = getPageCount(buffer);
  const text = extractPdfText(buffer);

  assert.equal(pages, 2, `EXP-2026-000003 with 3 proofs must generate strictly 2 pages, got ${pages}`);
  assert.ok(!text.includes('LODGING (LODGING)'), 'Must not print redundant LODGING (LODGING)');
  assert.ok(text.includes('Stay Type:'), 'Must include Stay Type field');
  assert.ok(text.includes('In Hotel'), 'Must display In Hotel for stayType HOTEL');
  assert.ok(text.includes('POLICY LIMIT'), 'Must include POLICY LIMIT metric box and table column');
  assert.ok(text.includes('ACCOUNTS ADMIN APPROVAL (STEP 1 VERIFICATION)'), 'Must include Accounts Admin Step 1 Verification section');
  assert.ok(text.includes('Rs. 8,500.00'), 'Section 4 table must format Claimed amount with Rs. prefix');
  assert.ok(text.includes('Rs. 8,325.00'), 'Section 4 table must format Policy Limit & Allowed amount with Rs. prefix');
  assert.ok(text.includes('Rs. 175.00'), 'Section 4 table must format Excess amount with Rs. prefix');
});

test('Multi-page table pagination: large accompanied employees list and multi-line expense items paginate cleanly with repeated headers', async () => {
  const claim = {
    _id: '65e000000000000000000036',
    claimNumber: 'EXP-PAGINATED-TABLE-01',
    status: 'APPROVED',
    paymentStatus: 'UNPAID',
    claimType: 'LODGING',
    claimMode: 'LODGING',
    fromDate: '2026-10-06',
    toDate: '2026-10-09',
    numberOfNights: 3,
    submittedBy: {
      name: 'Adesh Bhongale',
      employeeIdCode: 'TCSF11A_033',
      department: 'Software and Systems',
      designation: 'ERP Software Trainee',
    },
    employeeClaims: [
      {
        employee: { name: 'Adesh Bhongale', employeeIdCode: 'TCSF11A_033', department: 'Software and Systems', designation: 'ERP Software Trainee' },
        items: [{ expenseType: 'LODGING', perDayLimit: 1200, requestedAmount: 4250, allowedAmount: 4162.5, excessAmount: 87.5 }],
      },
      {
        employee: { name: 'Abhay Mudgal', employeeIdCode: 'TCCS7A_011', department: 'Customer Support', designation: 'Customer Support Team Lead' },
        items: [{ expenseType: 'LODGING', perDayLimit: 2500, requestedAmount: 4250, allowedAmount: 4162.5, excessAmount: 87.5 }],
      },
    ],
    entries: Array.from({ length: 28 }, (_, i) => ({
      expenseType: 'LODGING',
      requestedAmount: 1500,
      policyLimit: 1200,
      allowedAmount: 1200,
      excessAmount: 300,
      description: `Detailed accommodation & lodging entry #${i + 1} with long description text for wrapping verification`,
    })),
    grandRequested: 42000,
    grandPolicyLimit: 33600,
    grandAllowed: 33600,
    grandExcess: 8400,
    payableAmount: 33600,
    receipts: [],
  };

  const chunks = [];
  const mockRes = new Writable({
    write(chunk, encoding, cb) { chunks.push(chunk); cb(); }
  });

  await generateClaimPdf(claim, mockRes);
  const buffer = Buffer.concat(chunks);
  const pages = getPageCount(buffer);
  const text = extractPdfText(buffer);

  assert.ok(pages >= 2, `28 multi-line entries must paginate cleanly across multiple pages, got ${pages}`);
  assert.ok(/ERP Software Trainee.*Software and Systems/.test(text), 'Must include full designation and department for Employee #1 on single line');
  assert.ok(/Customer Support Team Lead.*Customer Support/.test(text), 'Must include full designation and department for Employee #2 on single line');
  assert.ok(text.includes('Total Claim Amount (Payable: Rs. 33,600.00):'), 'Must render Total Claim Amount footer after paginated rows');
});
