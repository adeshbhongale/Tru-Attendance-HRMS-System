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
  assert.ok(text.includes('This is an official computer-generated voucher issued by Trucode ERP HRMS System. Confidential.'), 'Footer text must be present');
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


