/**
 * Integration tests for lateMarkService, payroll endpoints, RBAC, Excel export,
 * and non-HR salary-field non-leakage (Section 0.1 & Section 6).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const express = require('express');
const request = require('supertest');
const ExcelJS = require('exceljs');

let MongoMemoryServer;
try {
  ({ MongoMemoryServer } = require('mongodb-memory-server'));
} catch (_) {
  /* optional */
}

const Employee = require('../../../../models/Employee');
const User = require('../../../../models/User');
const Attendance = require('../../../../models/Attendance');
const Department = require('../../../../models/Department');
const Designation = require('../../../../models/Designation');
const CompanySetting = require('../../../../models/CompanySetting');
require('../../../../models/Shift');
require('../../../../models/Location');
require('../../../../models/Company');
require('../../../../models/Level');
require('../../../../models/Grade');
require('../../../../models/Responsibility');
const Leave = require('../../../../models/Leave');
const PayrollEntry = require('../models/PayrollEntry');
const { computeLateMarksForEmployees } = require('../services/lateMarkService');
const payrollRoutes = require('../routes');
const employeesController = require('../../../../controllers/employees');
const authController = require('../../../../controllers/auth');
const expenseMasterController = require('../../expense/controllers/expenseMaster.controller');

let mongod;
let app;
let skipReason = null;

const companyA = new mongoose.Types.ObjectId();
const companyB = new mongoose.Types.ObjectId();

const testUsers = {
  hr: { _id: new mongoose.Types.ObjectId(), name: 'HR Admin', role: 'hr_admin', roleCode: 'HR_ADMIN', companyId: companyA },
  companyAdmin: { _id: new mongoose.Types.ObjectId(), name: 'Company Admin', role: 'company_admin', roleCode: 'TCCA1', companyId: companyA },
  superAdmin: { _id: new mongoose.Types.ObjectId(), name: 'Super Admin', role: 'super_admin', roleCode: 'TCSA1', scope: 'GLOBAL', companyId: companyA },
  employee: { _id: new mongoose.Types.ObjectId(), name: 'Regular Emp', role: 'employee', roleCode: 'TCSF6A', companyId: companyA },
  manager: { _id: new mongoose.Types.ObjectId(), name: 'Reporting Mgr', role: 'manager', roleCode: 'TCMN3A', companyId: companyA },
  teamLead: { _id: new mongoose.Types.ObjectId(), name: 'Team Lead', role: 'team_lead', roleCode: 'TCLD5A', companyId: companyA },
  accounts: { _id: new mongoose.Types.ObjectId(), name: 'Accounts Admin', role: 'account_admin', roleCode: 'ACCOUNT_ADMIN', companyId: companyA },
  store: { _id: new mongoose.Types.ObjectId(), name: 'Store Admin', role: 'store_admin', roleCode: 'STORE_ADMIN', companyId: companyA },
};

test.before(async () => {
  if (!MongoMemoryServer) {
    skipReason = 'mongodb-memory-server not available';
    return;
  }
  try {
    mongod = await MongoMemoryServer.create();
  } catch (err) {
    skipReason = `could not start MongoMemoryServer: ${err.message}`;
    return;
  }

  await mongoose.connect(mongod.getUri(), { dbName: 'payroll_test' });
  await Promise.all([
    Employee.init(),
    User.init(),
    Attendance.init(),
    Department.init(),
    Designation.init(),
    CompanySetting.init(),
    PayrollEntry.init(),
  ]);

  app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    const key = req.headers['x-test-user'] || 'hr';
    const u = testUsers[key];
    if (!u) return res.status(401).json({ success: false });
    req.user = u;
    req.companyId = u.companyId;
    req.tenant = { companyId: u.companyId };
    next();
  });
  app.use('/api/payroll', payrollRoutes);
  app.get('/api/employees', employeesController.getEmployees);
  app.get('/api/expense/employees', expenseMasterController.employeeOptions);
  app.get('/api/auth/me', authController.getMe);
});

test.after(async () => {
  if (mongoose.connection.readyState) await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

const it = (name, fn) =>
  test(name, async (t) => {
    if (skipReason) return t.skip(skipReason);
    await fn(t);
  });

it('lateMarkService: ignores Sunday punches, missing punchIn.time, outside counted period, resolves userId & employeeIdCode fallback, and executes ONE Attendance query', async () => {
  await Promise.all([
    User.deleteMany({}),
    Employee.deleteMany({}),
    Attendance.deleteMany({}),
  ]);

  // User 1: linked via Employee.userId
  const u1 = await User.create({
    name: 'Worked Example Emp',
    email: 'emp1@test.com',
    mobile: '9000000001',
    employeeIdCode: 'EMP001',
    companyId: companyA,
    department: 'Engineering',
    designation: 'Developer',
    status: 'ACTIVE',
  });

  // User 2: linked via fallback Employee.employeeId === User.employeeIdCode (mid-month joiner 20-Nov-2026)
  const u2 = await User.create({
    name: 'Fallback Link Emp',
    email: 'emp2@test.com',
    mobile: '9000000002',
    employeeIdCode: 'EMP002',
    companyId: companyA,
    department: 'Sales',
    designation: 'Executive',
    status: 'ACTIVE',
  });

  const emp1 = await Employee.create({
    companyId: companyA,
    employeeId: 'EMP001',
    userId: u1._id,
    name: 'Worked Example Emp',
    email: 'emp1@test.com',
    joiningDate: new Date('2026-04-20T00:00:00+05:30'),
    basicPay: 15000,
    status: 'ACTIVE',
  });

  const emp2 = await Employee.create({
    companyId: companyA,
    employeeId: 'EMP002',
    // userId intentionally omitted to test employeeIdCode fallback!
    name: 'Fallback Link Emp',
    email: 'emp2@test.com',
    joiningDate: new Date('2026-11-20T00:00:00+05:30'),
    basicPay: 15000,
    status: 'ACTIVE',
  });

  const emp3NoUser = await Employee.create({
    companyId: companyA,
    employeeId: 'EMP003',
    name: 'Unlinked Emp',
    email: 'emp3@test.com',
    joiningDate: new Date('2026-01-01T00:00:00+05:30'),
    basicPay: 12000,
    status: 'ACTIVE',
  });

  await Attendance.insertMany([
    // u1: Sunday Nov 1 at 11:00 IST -> MUST BE IGNORED (Sunday)
    {
      companyId: companyA,
      user: u1._id,
      date: new Date('2026-11-01T00:00:00+05:30'),
      punchIn: { time: new Date('2026-11-01T11:00:00+05:30') },
      status: 'Present',
    },
    // u1: Mon Nov 2 no punchIn.time (Absent placeholder) -> MUST BE IGNORED
    {
      companyId: companyA,
      user: u1._id,
      date: new Date('2026-11-02T00:00:00+05:30'),
      status: 'Absent',
    },
    // u1: Tue Nov 3 at 09:30:59 IST -> ON TIME (seconds truncated)
    {
      companyId: companyA,
      user: u1._id,
      date: new Date('2026-11-03T00:00:00+05:30'),
      punchIn: { time: new Date('2026-11-03T09:30:59+05:30') },
      status: 'Present',
    },
    // u1: Wed Nov 4 at 09:45:00 IST -> FLAT (Rs 300)
    {
      companyId: companyA,
      user: u1._id,
      date: new Date('2026-11-04T00:00:00+05:30'),
      punchIn: { time: new Date('2026-11-04T09:45:00+05:30') },
      status: 'Late',
    },
    // u1: Thu Nov 5 at 10:45:00 IST -> HALF_DAY
    {
      companyId: companyA,
      user: u1._id,
      date: new Date('2026-11-05T00:00:00+05:30'),
      punchIn: { time: new Date('2026-11-05T10:45:00+05:30') },
      status: 'Half Day',
    },
    // u1: 2026-11-30T19:00:00Z = 01-Dec 00:30 IST -> December, NOT November
    {
      companyId: companyA,
      user: u1._id,
      date: new Date('2026-12-01T00:00:00+05:30'),
      punchIn: { time: new Date('2026-11-30T19:00:00Z') },
      status: 'Present',
    },
    // u2 (joined Nov 20): punch on Nov 10 at 10:00 IST -> BEFORE counted period, MUST BE IGNORED
    {
      companyId: companyA,
      user: u2._id,
      date: new Date('2026-11-10T00:00:00+05:30'),
      punchIn: { time: new Date('2026-11-10T10:00:00+05:30') },
      status: 'Late',
    },
    // u2 (joined Nov 20): punch on Fri Nov 20 at 09:50 IST -> INSIDE counted period -> FLAT
    {
      companyId: companyA,
      user: u2._id,
      date: new Date('2026-11-20T00:00:00+05:30'),
      punchIn: { time: new Date('2026-11-20T09:50:00+05:30') },
      status: 'Late',
    },
  ]);

  // Spy on Attendance.find to verify single query for all users
  let attendanceFindCalls = 0;
  const origFind = Attendance.find.bind(Attendance);
  Attendance.find = (...args) => {
    attendanceFindCalls += 1;
    return origFind(...args);
  };

  let counts;
  try {
    counts = await computeLateMarksForEmployees({
      companyId: companyA,
      employees: [emp1.toObject(), emp2.toObject(), emp3NoUser.toObject()],
      year: 2026,
      month: 11,
    });
  } finally {
    Attendance.find = origFind;
  }

  assert.equal(attendanceFindCalls, 1, 'Must query Attendance once for all employees');
  assert.deepEqual(counts.get(String(emp1._id)), { flatDays: 1, halfDays: 1 });
  assert.deepEqual(counts.get(String(emp2._id)), { flatDays: 1, halfDays: 0 });
  assert.deepEqual(counts.get(String(emp3NoUser._id)), { flatDays: 0, halfDays: 0 });
});

it('Payroll API: worked example, PATCH persistence across months, override/reset, Excel export, RBAC & tenant isolation', async () => {
  const emp1 = await Employee.findOne({ companyId: companyA, employeeId: 'EMP001' });
  const otherCompanyEmp = await Employee.create({
    companyId: companyB,
    employeeId: 'EMP999',
    name: 'Other Tenant Emp',
    email: 'other@tenantb.com',
    basicPay: 50000,
    status: 'ACTIVE',
  });

  // Set leaves = 2 for Worked Example Emp in Nov 2026
  const patchLeaves = await request(app)
    .patch('/api/payroll/entry')
    .set('x-test-user', 'hr')
    .send({
      employeeObjectId: String(emp1._id),
      month: 11,
      year: 2026,
      leaves: 2,
      uan: '100200300400',
    });

  assert.equal(patchLeaves.status, 200);
  assert.equal(patchLeaves.body.success, true);
  const workedRow = patchLeaves.body.data;
  assert.equal(workedRow.daysOfMonth, 30);
  assert.equal(workedRow.payPerDay, 577);
  assert.equal(workedRow.sunday, 5);
  assert.equal(workedRow.leaves, 2);
  assert.equal(workedRow.workingDays, 25);
  assert.equal(workedRow.total, 14425);
  assert.equal(workedRow.leaveDeduction, 1154);
  assert.equal(workedRow.lateDeduction, 589);
  assert.equal(workedRow.netPay, 12682);
  assert.equal(workedRow.uan, '100200300400');

  // Override lateDeduction -> 200, then reset -> null
  const patchOverride = await request(app)
    .patch('/api/payroll/entry')
    .set('x-test-user', 'companyAdmin')
    .send({
      employeeObjectId: String(emp1._id),
      month: 11,
      year: 2026,
      lateDeductionOverride: 200,
    });
  assert.equal(patchOverride.status, 200);
  assert.equal(patchOverride.body.data.lateDeductionOverridden, true);
  assert.equal(patchOverride.body.data.lateDeduction, 200);
  assert.equal(patchOverride.body.data.lateDeductionComputed, 589);
  assert.equal(patchOverride.body.data.netPay, 13071);

  const patchReset = await request(app)
    .patch('/api/payroll/entry')
    .set('x-test-user', 'superAdmin')
    .send({
      employeeObjectId: String(emp1._id),
      month: 11,
      year: 2026,
      lateDeductionOverride: null,
    });
  assert.equal(patchReset.status, 200);
  assert.equal(patchReset.body.data.lateDeductionOverridden, false);
  assert.equal(patchReset.body.data.lateDeduction, 589);
  assert.equal(patchReset.body.data.netPay, 12682);

  // UAN & basicPay persist to December 2026 while Nov leaves do NOT bleed into Dec
  const decRes = await request(app)
    .get('/api/payroll?month=12&year=2026')
    .set('x-test-user', 'hr');
  assert.equal(decRes.status, 200);
  const decEmp1 = decRes.body.data.rows.find((r) => r.employeeId === 'EMP001');
  assert.equal(decEmp1.uan, '100200300400');
  assert.equal(decEmp1.basicPay, 15000);
  assert.equal(decEmp1.leaves, 0);
  // Tenant B's employee never appears in Tenant A
  assert.equal(decRes.body.data.rows.some((r) => r.employeeId === 'EMP999'), false);

  // Cross-tenant PATCH rejected with 404
  const crossPatch = await request(app)
    .patch('/api/payroll/entry')
    .set('x-test-user', 'hr')
    .send({
      employeeObjectId: String(otherCompanyEmp._id),
      month: 11,
      year: 2026,
      basicPay: 1,
    });
  assert.equal(crossPatch.status, 404);

  // Invalid month returns 400
  const badQuery = await request(app)
    .get('/api/payroll?month=13&year=2026')
    .set('x-test-user', 'hr');
  assert.equal(badQuery.status, 400);

  // Non-HR roles blocked with 403
  for (const forbiddenRole of ['employee', 'manager', 'teamLead', 'accounts', 'store']) {
    const res = await request(app)
      .get('/api/payroll?month=11&year=2026')
      .set('x-test-user', forbiddenRole);
    assert.equal(res.status, 403, `Role ${forbiddenRole} must receive 403`);
  }

  // Excel export returns valid .xlsx matching on-screen columns and values
  const exportRes = await request(app)
    .get('/api/payroll/export?month=11&year=2026')
    .set('x-test-user', 'hr')
    .buffer(true)
    .parse((res, cb) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    });

  assert.equal(exportRes.status, 200);
  assert.match(exportRes.headers['content-disposition'], /Payroll_2026-11\.xlsx/);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(exportRes.body);
  const ws = wb.worksheets[0];
  assert.equal(ws.getRow(1).getCell(10).value, 'Sunday');
  assert.equal(ws.getRow(1).getCell(11).value, 'Pay Per Day');
  assert.equal(ws.getRow(1).getCell(12).value, 'Working Days');
  assert.equal(ws.getRow(1).getCell(13).value, 'Total');
  assert.equal(ws.getRow(1).getCell(15).value, 'Half Days');
  assert.equal(ws.getRow(1).getCell(16).value, 'Late Marks');
  assert.equal(ws.getRow(1).getCell(17).value, 'Deduction');
  assert.equal(ws.getRow(2).getCell(17).value, 'Leave');
  assert.equal(ws.getRow(2).getCell(18).value, 'Late Marks');
  assert.equal(ws.getRow(1).getCell(19).value, 'Net Pay');

  // Row 3 is EMP001
  const excelEmp1 = ws.getRow(3);
  assert.equal(excelEmp1.getCell(2).value, 'EMP001');
  assert.equal(excelEmp1.getCell(6).value, '20-04-2026');
  assert.equal(excelEmp1.getCell(8).value, 15000);
  assert.equal(excelEmp1.getCell(10).value, 5);
  assert.equal(excelEmp1.getCell(11).value, 577);
  assert.equal(excelEmp1.getCell(12).value, 25);
  assert.equal(excelEmp1.getCell(13).value, 14425);
  assert.equal(excelEmp1.getCell(15).value, 1);
  assert.equal(excelEmp1.getCell(16).value, 1);
  assert.equal(excelEmp1.getCell(17).value, 1154);
  assert.equal(excelEmp1.getCell(18).value, 589);
  assert.equal(excelEmp1.getCell(19).value, 12682);
});

it('Rule 0.1.4: existing employee-list and profile endpoints used by mobile/non-HR users do NOT expose basicPay or uan', async () => {
  const u1 = await User.findOne({ companyId: companyA, employeeIdCode: 'EMP001' });
  testUsers.employee = {
    _id: u1._id,
    id: String(u1._id),
    name: u1.name,
    role: 'employee',
    roleCode: 'TCSF6A',
    companyId: companyA,
  };

  const empListRes = await request(app)
    .get('/api/employees')
    .set('x-test-user', 'employee');
  assert.equal(empListRes.status, 200);
  assert.ok(Array.isArray(empListRes.body.data));
  assert.ok(empListRes.body.data.length > 0);
  for (const item of empListRes.body.data) {
    assert.equal('basicPay' in item, false, '/api/employees must not expose basicPay');
    assert.equal('uan' in item, false, '/api/employees must not expose uan');
  }

  const expEmpRes = await request(app)
    .get('/api/expense/employees')
    .set('x-test-user', 'employee');
  assert.equal(expEmpRes.status, 200);
  for (const item of expEmpRes.body.data) {
    assert.equal('basicPay' in item, false, '/api/expense/employees must not expose basicPay');
    assert.equal('uan' in item, false, '/api/expense/employees must not expose uan');
  }

  const meRes = await request(app)
    .get('/api/auth/me')
    .set('x-test-user', 'employee');
  assert.equal(meRes.status, 200);
  assert.equal('basicPay' in (meRes.body.data || {}), false, '/api/auth/me must not expose basicPay');
  assert.equal('uan' in (meRes.body.data || {}), false, '/api/auth/me must not expose uan');
});

it('Employee Master User sync & Approved Leave auto-fetch: syncs real User staff (excluding system admin logins) and computes Approved leaves via POST /api/payroll/entry', async () => {
  await Leave.deleteMany({});

  // Create a real Employee Master User with NO pre-existing Employee doc + a system console admin User
  const realStaffUser = await User.create({
    name: 'Master Staff Member',
    email: 'masterstaff@test.com',
    mobile: '9000000099',
    employeeIdCode: 'EMP050',
    role: 'employee',
    roleCode: 'TCSF9A',
    companyId: companyA,
    department: 'Software and Systems',
    designation: 'Software Engineer',
    joiningDate: new Date('2026-06-06T00:00:00+05:30'),
    status: 'active',
  });

  const sysRoleAdmin = await User.create({
    name: 'System Console HR Login',
    email: 'sys_hr@test.com',
    mobile: '9000000088',
    employeeIdCode: 'HR001',
    role: 'hr_admin',
    roleCode: 'HR_ADMIN',
    companyId: companyA,
    department: 'HR',
    designation: 'HR Admin',
    status: 'ACTIVE',
  });
  await Employee.create({
    companyId: companyA,
    employeeId: 'HR001',
    userId: sysRoleAdmin._id,
    name: 'System Console HR Login',
    email: 'sys_hr@test.com',
    status: 'ACTIVE',
  });

  // Add 1 Full Day + 1 Half Day Approved Leave in Nov 2026 (plus 1 Pending leave that should NOT count)
  await Leave.insertMany([
    {
      companyId: companyA,
      user: realStaffUser._id,
      leaveType: 'Casual Leave',
      startDate: new Date('2026-11-10T00:00:00+05:30'),
      endDate: new Date('2026-11-10T00:00:00+05:30'),
      duration: 'Full Day',
      reason: 'Personal work',
      status: 'Approved',
    },
    {
      companyId: companyA,
      user: realStaffUser._id,
      leaveType: 'Sick Leave',
      startDate: new Date('2026-11-11T00:00:00+05:30'),
      endDate: new Date('2026-11-11T00:00:00+05:30'),
      duration: 'Half Day',
      reason: 'Doctor visit',
      status: 'Approved',
    },
    {
      companyId: companyA,
      user: realStaffUser._id,
      leaveType: 'Casual Leave',
      startDate: new Date('2026-11-12T00:00:00+05:30'),
      endDate: new Date('2026-11-12T00:00:00+05:30'),
      duration: 'Full Day',
      reason: 'Pending request',
      status: 'Pending',
    },
  ]);

  const res = await request(app)
    .get('/api/payroll?month=11&year=2026')
    .set('x-test-user', 'hr');
  assert.equal(res.status, 200);

  // System role login HR001 must NOT appear
  assert.equal(res.body.data.rows.some((r) => r.employeeId === 'HR001'), false);

  // Master Staff Member EMP050 MUST appear with synced joiningDate, department, designation & integer leaves = 1 (exact 1.5 for Half-Day leave deduction)
  const syncedRow = res.body.data.rows.find((r) => r.employeeId === 'EMP050');
  assert.ok(syncedRow, 'EMP050 from User Employee Master must appear in payroll');
  assert.equal(syncedRow.department, 'Software and Systems');
  assert.equal(syncedRow.designation, 'Software Engineer');
  assert.equal(syncedRow.leaves, 1);
  assert.equal(syncedRow.leavesComputed, 1);
  assert.equal(syncedRow.leavesComputedExact, 1.5);
  assert.equal(syncedRow.leavesOverridden, false);

  // Set Basic Pay = 15000 via POST /api/payroll/entry -> payPerDay = 577 saved on Employee, leaveDeduction = 865, netPay = 14135
  const postRes = await request(app)
    .post('/api/payroll/entry')
    .set('x-test-user', 'hr')
    .send({
      employeeObjectId: syncedRow.employeeObjectId,
      month: 11,
      year: 2026,
      basicPay: 15000,
      uan: '998877665544',
    });
  assert.equal(postRes.status, 200);
  assert.equal(postRes.body.data.basicPay, 15000);
  assert.equal(postRes.body.data.payPerDay, 577);
  assert.equal(postRes.body.data.uan, '998877665544');
  assert.equal(postRes.body.data.leaves, 1);
  assert.equal(postRes.body.data.leavesComputedExact, 1.5);
  assert.equal(postRes.body.data.leaveDeduction, 866);
  assert.equal(postRes.body.data.netPay, 13559);

  // Reject decimal or negative manual leaves with 400
  const decLeavesRes = await request(app)
    .post('/api/payroll/entry')
    .set('x-test-user', 'hr')
    .send({ employeeObjectId: syncedRow.employeeObjectId, month: 11, year: 2026, leaves: 1.5 });
  assert.equal(decLeavesRes.status, 400);
  const negLeavesRes = await request(app)
    .post('/api/payroll/entry')
    .set('x-test-user', 'hr')
    .send({ employeeObjectId: syncedRow.employeeObjectId, month: 11, year: 2026, leaves: -1 });
  assert.equal(negLeavesRes.status, 400);

  const savedEmp = await Employee.findById(syncedRow.employeeObjectId).lean();
  assert.equal(savedEmp.payPerDay, 577);
});

it('Payroll late-mark settings API: persists to CompanySetting.payroll, recalculates rows, validates, and enforces RBAC', async () => {
  // 1. Default settings returned in GET /api/payroll
  const initialRes = await request(app)
    .get('/api/payroll?month=11&year=2026')
    .set('x-test-user', 'hr');
  assert.equal(initialRes.status, 200);
  assert.deepEqual(initialRes.body.data.settings, {
    lateStartTime: '09:30',
    halfDayTime: '10:30',
    lateFlatAmount: 300,
    approvedLeaveMultiplier: 1,
    uninformedAbsentMultiplier: 2,
    rejectedLeaveAbsentMultiplier: 2.5,
  });

  // 2. Non-HR role gets 403
  const forbiddenRes = await request(app)
    .post('/api/payroll/settings')
    .set('x-test-user', 'employee')
    .send({ lateStartTime: '09:45', halfDayTime: '10:45', lateFlatAmount: 500 });
  assert.equal(forbiddenRes.status, 403);

  // 3. Invalid halfDayTime < lateStartTime gets 400
  const invalidRes = await request(app)
    .post('/api/payroll/settings')
    .set('x-test-user', 'hr')
    .send({ lateStartTime: '11:00', halfDayTime: '10:00', lateFlatAmount: 500 });
  assert.equal(invalidRes.status, 400);

  // 4. Valid update persists to CompanySetting.payroll and recalculates EMP001 (09:45 & 10:45 punches)
  // Changing lateStartTime -> '09:45', halfDayTime -> '10:30', lateFlatAmount -> 500:
  //   09:45 punch is now ON TIME (<= 09:45), 10:45 punch is still HALF_DAY (288)!
  const saveRes = await request(app)
    .post('/api/payroll/settings')
    .set('x-test-user', 'hr')
    .send({ lateStartTime: '09:45', halfDayTime: '10:30', lateFlatAmount: 500 });
  assert.equal(saveRes.status, 200);
  assert.deepEqual(saveRes.body.data, {
    lateStartTime: '09:45',
    halfDayTime: '10:30',
    lateFlatAmount: 500,
    approvedLeaveMultiplier: 1,
    uninformedAbsentMultiplier: 2,
    rejectedLeaveAbsentMultiplier: 2.5,
  });

  const dbSetting = await CompanySetting.findOne({ companyId: companyA }).lean();
  assert.equal(dbSetting.payroll.lateStartTime, '09:45');
  assert.equal(dbSetting.payroll.halfDayTime, '10:30');
  assert.equal(dbSetting.payroll.lateFlatAmount, 500);

  const afterRes = await request(app)
    .get('/api/payroll?month=11&year=2026')
    .set('x-test-user', 'hr');
  assert.equal(afterRes.status, 200);
  assert.deepEqual(afterRes.body.data.settings, {
    lateStartTime: '09:45',
    halfDayTime: '10:30',
    lateFlatAmount: 500,
    approvedLeaveMultiplier: 1,
    uninformedAbsentMultiplier: 2,
    rejectedLeaveAbsentMultiplier: 2.5,
  });
  const emp1After = afterRes.body.data.rows.find((r) => r.employeeId === 'EMP001');
  assert.deepEqual(emp1After.lateCounts, { flatDays: 0, halfDays: 1 });
  assert.equal(emp1After.lateDeductionComputed, 289);
});

it('Leave & Absent rules: 1x Approved Leave, 2x Absent (no leave), 2.5x Absent (rejected leave), and editable multipliers', async () => {
  await Promise.all([Leave.deleteMany({}), Attendance.deleteMany({})]);

  const emp50 = await Employee.findOne({ companyId: companyA, employeeId: 'EMP050' });
  const u50 = await User.findById(emp50.userId);

  // Reset multipliers to defaults (1, 2, 2.5)
  await request(app)
    .post('/api/payroll/settings')
    .set('x-test-user', 'hr')
    .send({
      approvedLeaveMultiplier: 1,
      uninformedAbsentMultiplier: 2,
      rejectedLeaveAbsentMultiplier: 2.5,
    });

  // 1 Approved Leave (Nov 10) -> 1 * 1 = 1
  // 1 Rejected Leave (Nov 11) + Absent (Nov 11) -> 1 * 2.5 = 2.5
  // 1 Uninformed Absent (Nov 12, no leave) -> 1 * 2 = 2
  // Total deductible leaves = 1 + 2.5 + 2 = 5.5
  await Leave.insertMany([
    {
      companyId: companyA,
      user: u50._id,
      leaveType: 'Casual Leave',
      startDate: new Date('2026-11-10T00:00:00+05:30'),
      endDate: new Date('2026-11-10T00:00:00+05:30'),
      duration: 'Full Day',
      reason: 'Approved day',
      status: 'Approved',
    },
    {
      companyId: companyA,
      user: u50._id,
      leaveType: 'Casual Leave',
      startDate: new Date('2026-11-11T00:00:00+05:30'),
      endDate: new Date('2026-11-11T00:00:00+05:30'),
      duration: 'Full Day',
      reason: 'Rejected day',
      status: 'Rejected',
    },
  ]);

  await Attendance.insertMany([
    {
      companyId: companyA,
      user: u50._id,
      date: new Date('2026-11-11T00:00:00+05:30'),
      status: 'Absent',
    },
    {
      companyId: companyA,
      user: u50._id,
      date: new Date('2026-11-12T00:00:00+05:30'),
      status: 'Absent',
    },
  ]);

  const res1 = await request(app)
    .get('/api/payroll?month=11&year=2026')
    .set('x-test-user', 'hr');
  assert.equal(res1.status, 200);
  const row1 = res1.body.data.rows.find((r) => r.employeeId === 'EMP050');
  assert.deepEqual(row1.leaveBreakdown, {
    approvedLeaveDays: 1,
    uninformedAbsentDays: 1,
    rejectedLeaveAbsentDays: 1,
  });
  assert.equal(row1.leavesComputed, 5);
  assert.equal(row1.leavesComputedExact, 5.5);
  assert.equal(row1.leaves, 5);

  // Edit leave multipliers: 1.5, 2.5, 3 -> 1*1.5 + 1*2.5 + 1*3 = 7
  const updRes = await request(app)
    .post('/api/payroll/settings')
    .set('x-test-user', 'hr')
    .send({
      approvedLeaveMultiplier: 1.5,
      uninformedAbsentMultiplier: 2.5,
      rejectedLeaveAbsentMultiplier: 3,
    });
  assert.equal(updRes.status, 200);

  const res2 = await request(app)
    .get('/api/payroll?month=11&year=2026')
    .set('x-test-user', 'hr');
  const row2 = res2.body.data.rows.find((r) => r.employeeId === 'EMP050');
  assert.equal(row2.leavesComputed, 7);
  assert.equal(row2.leaves, 7);
});
