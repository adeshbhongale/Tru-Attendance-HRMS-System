const test = require('node:test');
const assert = require('node:assert/strict');
const policyService = require('./policyService');
const approvalService = require('./approvalService');
const { validateAdvanceDaysForRange } = require('../../controllers/leaves');

test('resolveMaxAdvanceDays defaults only Casual Leave to 7 and respects policy overrides', () => {
  const cl = { name: 'Casual Leave', code: 'CL', maxAdvanceDays: null };
  const sl = { name: 'Sick Leave', code: 'SL', maxAdvanceDays: null };

  assert.equal(policyService.resolveMaxAdvanceDays(cl, null, null), 7);
  assert.equal(policyService.resolveMaxAdvanceDays(sl, null, null), 0);

  // Policy explicitly disabling or changing Casual Leave advance limit
  assert.equal(policyService.resolveMaxAdvanceDays(cl, { maxAdvanceDays: 0 }, null), 0);
  assert.equal(policyService.resolveMaxAdvanceDays(cl, { maxAdvanceDays: 14 }, null), 14);

  // Policy enabling advance limit on another leave type
  assert.equal(policyService.resolveMaxAdvanceDays(sl, { maxAdvanceDays: 5 }, null), 5);

  // Rule without override inherits policy limit
  assert.equal(policyService.resolveMaxAdvanceDays(cl, { maxAdvanceDays: 7 }, { maxAdvanceDays: null }), 7);
});

test('validateAdvanceDaysForRange blocks next Saturday until beyond current Saturday', () => {
  // Tue 17 Nov 2026 -> window is 17 Nov .. 23 Nov (7 days)
  const tue = '2026-11-17';
  assert.equal(validateAdvanceDaysForRange('2026-11-21', '2026-11-21', 7, 'Casual Leave', tue), null); // Current Sat allowed
  assert.match(validateAdvanceDaysForRange('2026-11-28', '2026-11-28', 7, 'Casual Leave', tue), /within 7 day\(s\)/); // Next Sat blocked

  // Sat 21 Nov 2026 (current Saturday) -> window is 21 Nov .. 27 Nov -> Next Sat (28 Nov) still blocked!
  const currentSat = '2026-11-21';
  assert.equal(validateAdvanceDaysForRange('2026-11-21', '2026-11-21', 7, 'Casual Leave', currentSat), null);
  assert.match(validateAdvanceDaysForRange('2026-11-28', '2026-11-28', 7, 'Casual Leave', currentSat), /within 7 day\(s\)/);

  // Sun 22 Nov 2026 (beyond current Saturday) -> window is 22 Nov .. 28 Nov -> Next Sat (28 Nov) unlocked!
  const sundayAfter = '2026-11-22';
  assert.equal(validateAdvanceDaysForRange('2026-11-28', '2026-11-28', 7, 'Casual Leave', sundayAfter), null);
  assert.match(validateAdvanceDaysForRange('2026-12-05', '2026-12-05', 7, 'Casual Leave', sundayAfter), /within 7 day\(s\)/);

  // Multi-day endDate exceeding window is blocked; 0 = unlimited
  assert.match(validateAdvanceDaysForRange('2026-11-21', '2026-11-28', 7, 'Casual Leave', currentSat), /within 7 day\(s\)/);
  assert.equal(validateAdvanceDaysForRange('2026-12-25', '2026-12-26', 0, 'Sick Leave', tue), null);
});

test('isPrivilegedLeaveAdmin allows Super Admin, Company Admin, and HR Admin only', () => {
  assert.equal(approvalService.isPrivilegedLeaveAdmin({ role: 'superadmin' }), true);
  assert.equal(approvalService.isPrivilegedLeaveAdmin({ role: 'super_admin' }), true);
  assert.equal(approvalService.isPrivilegedLeaveAdmin({ role: 'company_admin' }), true);
  assert.equal(approvalService.isPrivilegedLeaveAdmin({ role: 'hr_admin' }), true);
  assert.equal(approvalService.isPrivilegedLeaveAdmin({ role: 'department_admin', departmentAdminType: 'hr' }), true);
  assert.equal(approvalService.isPrivilegedLeaveAdmin({ role: 'store_admin' }), false);
  assert.equal(approvalService.isPrivilegedLeaveAdmin({ role: 'account_admin' }), false);
  assert.equal(approvalService.isPrivilegedLeaveAdmin({ role: 'department_admin', departmentAdminType: 'store' }), false);
  assert.equal(approvalService.isPrivilegedLeaveAdmin({ role: 'employee' }), false);
});
