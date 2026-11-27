/**
 * Payroll orchestration service:
 * 1. Syncs real company staff from the existing Employee Master (`User` collection)
 *    into `Employee` (preserving `uan` and `basicPay`), excluding system console role logins.
 * 2. Loads eligible employees, `PayrollEntry` docs, `CompanySetting`, Approved `Leave` days,
 *    and `Attendance` punch-in late marks, then computes each row via `payrollCalculator`.
 */

const Employee = require('../../../../models/Employee');
const User = require('../../../../models/User');
const Department = require('../../../../models/Department');
const Designation = require('../../../../models/Designation');
const CompanySetting = require('../../../../models/CompanySetting');
require('../../../../models/Shift');
const PayrollEntry = require('../models/PayrollEntry');
const {
  getDaysInMonth,
  getCountedPeriod,
  countSundays,
  getISTMonthBoundaries,
} = require('./calendarService');
const {
  resolveEmployeeUsers,
  computeLateMarksForEmployees,
} = require('./lateMarkService');
const { computeLeavesForEmployees } = require('./leavePayrollService');
const { calculateRow, computeDisplayHalfDays, resolveSettings } = require('./payrollCalculator');

// Dedicated system/console login roles (not regular staff payroll records)
const SYSTEM_CONSOLE_ROLES = [
  'superadmin',
  'super_admin',
  'company_admin',
  'companyadmin',
  'hr_admin',
  'store_admin',
  'account_admin',
  'accounts_admin',
];

const SYSTEM_CONSOLE_ROLE_CODES = [
  'TCSA1',
  'SUPERADMIN',
  'SUPER_ADMIN',
  'TCCA1',
  'COMPANY_ADMIN',
  'COMPANYADMIN',
  'HR_ADMIN',
  'STORE_ADMIN',
  'TCSTR1',
  'ACCOUNT_ADMIN',
  'ACCOUNTS_ADMIN',
  'TCACC1',
];

function isSystemConsoleUser(userDoc) {
  if (!userDoc) return false;
  if (userDoc.scope === 'GLOBAL') return true;
  const role = String(userDoc.role || '').trim().toLowerCase();
  const roleCode = String(userDoc.roleCode || '').trim().toUpperCase();
  return (
    SYSTEM_CONSOLE_ROLES.includes(role) ||
    SYSTEM_CONSOLE_ROLE_CODES.includes(roleCode)
  );
}

/**
 * Natural sort comparator for employeeId strings.
 * Handles serial-suffixed codes like TCDI1A_001 .. TCHR11C_034 in numeric serial order,
 * and standard codes like EMP1, EMP2, EMP10 via natural alphanumeric sort.
 */
function naturalSort(a, b) {
  const strA = String(a || '').trim();
  const strB = String(b || '').trim();
  const suffixA = strA.match(/_(\d+)$/);
  const suffixB = strB.match(/_(\d+)$/);
  if (suffixA && suffixB) {
    const diff = parseInt(suffixA[1], 10) - parseInt(suffixB[1], 10);
    if (diff !== 0) return diff;
  }
  return strA.localeCompare(strB, undefined, {
    numeric: true,
    sensitivity: 'base',
  });
}

function normalizeEmployeeStatus(status) {
  const s = String(status || 'ACTIVE').trim().toUpperCase();
  if (['INACTIVE', 'DISABLED', 'SUSPENDED', 'LOCKED'].includes(s)) return 'INACTIVE';
  if (s === 'TERMINATED') return 'TERMINATED';
  return 'ACTIVE';
}

/**
 * Sync real staff members from `User` (Employee Master) into `Employee` for this company.
 * Never overwrites `uan` or `basicPay` on existing `Employee` documents.
 */
async function syncCompanyEmployeesFromUsers(companyId) {
  const [staffUsers, existingEmployees, departments, designations] = await Promise.all([
    User.find({
      $or: [{ companyId }, { company: companyId }],
      scope: { $ne: 'GLOBAL' },
      role: { $nin: SYSTEM_CONSOLE_ROLES },
      roleCode: { $nin: SYSTEM_CONSOLE_ROLE_CODES },
    })
      .select(
        '_id name email mobile employeeIdCode department designation gender joiningDate status employmentStatus createdAt updatedAt'
      )
      .lean(),
    Employee.find({ companyId })
      .select('_id userId employeeId name email phone gender departmentId designationId joiningDate status employmentStatus updatedAt')
      .lean(),
    Department.find({ companyId }).select('_id name').lean(),
    Designation.find({ companyId }).select('_id name').lean(),
  ]);

  if (!staffUsers.length) return;

  const deptByName = new Map();
  for (const d of departments) {
    if (d.name) deptByName.set(String(d.name).trim().toLowerCase(), d._id);
  }
  const desigByName = new Map();
  for (const d of designations) {
    if (d.name) desigByName.set(String(d.name).trim().toLowerCase(), d._id);
  }

  const byUserId = new Map();
  const byEmpCode = new Map();
  for (const emp of existingEmployees) {
    if (emp.userId) byUserId.set(String(emp.userId), emp);
    if (emp.employeeId) byEmpCode.set(String(emp.employeeId).trim().toUpperCase(), emp);
  }

  const bulkOps = [];

  for (const u of staffUsers) {
    const uidStr = String(u._id);
    const empCode = String(
      u.employeeIdCode || u.mobile || uidStr.slice(-6)
    )
      .trim()
      .toUpperCase();
    if (!empCode || !u.name || !u.email) continue;

    const deptId = u.department
      ? deptByName.get(String(u.department).trim().toLowerCase()) || null
      : null;
    const desigId = u.designation
      ? desigByName.get(String(u.designation).trim().toLowerCase()) || null
      : null;
    const mappedStatus = normalizeEmployeeStatus(u.status);

    const existing = byUserId.get(uidStr) || byEmpCode.get(empCode);

    if (!existing) {
      bulkOps.push({
        updateOne: {
          filter: { companyId, employeeId: empCode },
          update: {
            $set: {
              userId: u._id,
              name: u.name.trim(),
              email: u.email.trim().toLowerCase(),
              phone: u.mobile || '',
              departmentId: deptId,
              designationId: desigId,
              joiningDate: u.joiningDate || u.createdAt || new Date(),
              gender: u.gender || '',
              status: mappedStatus,
              employmentStatus: u.employmentStatus || 'Training',
            },
            $setOnInsert: {
              companyId,
              employeeId: empCode,
              uan: '',
              basicPay: 0,
              payPerDay: 0,
            },
          },
          upsert: true,
        },
      });
    } else {
      const updates = {};
      if (!existing.userId) {
        // Keep unpopulated link intact only if already matched; link when missing in production
        if (u.updatedAt && existing.updatedAt && new Date(u.updatedAt) >= new Date(existing.updatedAt)) {
          updates.userId = u._id;
        }
      }
      if (existing.userId && String(existing.userId) === uidStr) {
        if (u.name && u.name.trim() !== existing.name) updates.name = u.name.trim();
        if (deptId && String(existing.departmentId || '') !== String(deptId)) {
          updates.departmentId = deptId;
        }
        if (desigId && String(existing.designationId || '') !== String(desigId)) {
          updates.designationId = desigId;
        }
        if (u.employmentStatus && u.employmentStatus !== existing.employmentStatus) {
          updates.employmentStatus = u.employmentStatus;
        }
        if (u.gender && u.gender !== existing.gender) {
          updates.gender = u.gender;
        }
        if (
          u.joiningDate &&
          u.updatedAt &&
          existing.updatedAt &&
          new Date(u.updatedAt) > new Date(existing.updatedAt)
        ) {
          updates.joiningDate = u.joiningDate;
        }
      }

      if (Object.keys(updates).length > 0) {
        bulkOps.push({
          updateOne: {
            filter: { _id: existing._id, companyId },
            update: { $set: updates },
          },
        });
      }
    }
  }

  if (bulkOps.length > 0) {
    await Employee.bulkWrite(bulkOps, { ordered: false }).catch(() => { });
  }
}

/**
 * Shared row builder for a given array of populated Employee documents.
 */
async function buildRowsForEmployees({ companyId, employees, month, year }) {
  const daysOfMonth = getDaysInMonth(year, month);
  const companySetting = await CompanySetting.findOne({ companyId }).lean();
  const resolvedSettings = resolveSettings(companySetting?.payroll || {});
  const payrollSettings = {
    lateStartTime: resolvedSettings.lateStartTime,
    halfDayTime: resolvedSettings.halfDayTime,
    lateFlatAmount: resolvedSettings.lateFlatAmount,
    approvedLeaveMultiplier: resolvedSettings.approvedLeaveMultiplier,
    uninformedAbsentMultiplier: resolvedSettings.uninformedAbsentMultiplier,
    rejectedLeaveAbsentMultiplier: resolvedSettings.rejectedLeaveAbsentMultiplier,
  };

  if (!employees.length) {
    return {
      daysOfMonth,
      settings: payrollSettings,
      rows: [],
      totals: {
        basicPay: 0,
        total: 0,
        leaveDeduction: 0,
        halfDayDeduction: 0,
        lateDeduction: 0,
        otherDeduction: 0,
        netPay: 0,
        pf: 0,
        esic: 0,
        pt: 0,
        statutoryTotal: 0,
        finalPay: 0,
        retention: 0,
        advance: 0,
        loan: 0,
        bankPay: 0,
      },
    };
  }

  const employeeIds = employees.map((e) => e._id);

  const [entries, resolvedUsers] = await Promise.all([
    PayrollEntry.find({
      companyId,
      employee: { $in: employeeIds },
      month,
      year,
    }).lean(),
    resolveEmployeeUsers(companyId, employees),
  ]);

  const entryMap = new Map();
  for (const entry of entries) {
    entryMap.set(String(entry.employee), entry);
  }

  const periodsByEmployee = new Map();
  for (const emp of employees) {
    periodsByEmployee.set(
      String(emp._id),
      getCountedPeriod({
        year,
        month,
        joiningDate: emp.joiningDate,
        leavingDate: emp.leavingDate,
      })
    );
  }

  // Fetch Approved Leaves + Absent (with/without Rejected Leave) rules
  const {
    leavesMap,
    halfDaySessionsByUser,
    halfDayLeaveCounts,
    leaveBreakdowns,
  } = await computeLeavesForEmployees({
    companyId,
    employees,
    year,
    month,
    periodsByEmployee,
    resolvedUsers,
    settings: payrollSettings,
  });

  // Compute late marks using Attendance + Shift sessions + Half-Day leave sessions
  const lateMarksMap = await computeLateMarksForEmployees({
    companyId,
    employees,
    year,
    month,
    periodsByEmployee,
    resolvedUsers,
    halfDaySessionsByUser,
    settings: payrollSettings,
  });

  const rows = [];
  const totals = {
    basicPay: 0,
    total: 0,
    leaveDeduction: 0,
    halfDayDeduction: 0,
    lateDeduction: 0,
    otherDeduction: 0,
    netPay: 0,
    pf: 0,
    esic: 0,
    pt: 0,
    statutoryTotal: 0,
    finalPay: 0,
    retention: 0,
    advance: 0,
    loan: 0,
    bankPay: 0,
  };

  for (const emp of employees) {
    const empKey = String(emp._id);
    const period = periodsByEmployee.get(empKey);
    const sunday = countSundays(period.start, period.end);

    const entry = entryMap.get(empKey);
    const leavesComputedExact = leavesMap.get(empKey) ?? 0;
    const leavesComputed = Math.max(0, Math.floor(leavesComputedExact));
    const leavesOverridden =
      entry?.leaves !== null &&
      entry?.leaves !== undefined &&
      Number.isFinite(Number(entry.leaves));
    const effectiveLeaves = leavesOverridden ? Math.max(0, Math.floor(Number(entry.leaves))) : leavesComputed;
    const leaveUnitsExact = leavesOverridden ? effectiveLeaves : leavesComputedExact;

    const lateDeductionOverride = entry?.lateDeductionOverride ?? null;
    const halfDayDeductionOverride = entry?.halfDayDeductionOverride ?? null;
    const empLateCounts = lateMarksMap.get(empKey) || { flatDays: 0, halfDays: 0 };
    const halfDayLeaves = halfDayLeaveCounts.get(empKey) || { session1: 0, session2: 0, total: 0 };
    const userDoc = resolvedUsers.get(empKey)?.userDoc || null;
    const employmentStatus = userDoc?.employmentStatus || emp.employmentStatus || 'Training';
    const gender = userDoc?.gender || emp.gender || 'Male';

    const rowCalc = calculateRow({
      basicPay: emp.basicPay ?? 0,
      daysOfMonth,
      countedDays: period.countedDays,
      sunday,
      leaves: effectiveLeaves,
      leaveUnitsExact,
      flatDays: empLateCounts.flatDays,
      halfDays: empLateCounts.halfDays,
      approvedHalfDays: halfDayLeaves.total,
      lateDeductionOverride,
      halfDayDeductionOverride,
      otherDeduction: entry?.otherDeduction ?? 0,
      employmentStatus,
      gender,
      month,
      pf: entry?.pf ?? 0,
      esic: entry?.esic ?? 0,
      ptOverride: entry?.ptOverride ?? null,
      statutoryTotalOverride: entry?.statutoryTotalOverride ?? null,
      retentionOverride: entry?.retentionOverride ?? null,
      advance: entry?.advance ?? 0,
      loan: entry?.loan ?? 0,
      settings: payrollSettings,
    });

    let designation = '';
    if (emp.designationId?.name) {
      designation = emp.designationId.name;
    } else if (userDoc?.designation) {
      designation =
        typeof userDoc.designation === 'object'
          ? userDoc.designation.name || ''
          : String(userDoc.designation);
    }

    let department = '';
    if (emp.departmentId?.name) {
      department = emp.departmentId.name;
    } else if (userDoc?.department) {
      department =
        typeof userDoc.department === 'object'
          ? userDoc.department.name || ''
          : String(userDoc.department);
    }

    const { extraLeaveHalfDays, totalHalfDays } = computeDisplayHalfDays({
      lateHalfDays: empLateCounts.halfDays,
      shiftHalfDays: halfDayLeaves.total,
      leavesComputedExact,
      leavesOverridden,
    });

    const row = {
      employeeObjectId: empKey,
      employeeId: emp.employeeId || userDoc?.employeeIdCode || '',
      name: emp.name || userDoc?.name || '',
      designation,
      department,
      dateOfJoining: emp.joiningDate || userDoc?.joiningDate || null,
      gender,
      month,
      uan: String(employmentStatus).trim().toLowerCase() === 'permanent' ? (emp.uan || '') : '',
      ...rowCalc,
      leavesComputed,
      leavesComputedExact,
      leavesOverridden,
      halfDayLeaves,
      extraLeaveHalfDays,
      totalHalfDays,
      leaveBreakdown: leaveBreakdowns.get(empKey) || {
        approvedLeaveDays: 0,
        uninformedAbsentDays: 0,
        rejectedLeaveAbsentDays: 0,
      },
      lateRuleWindow: {
        lateStartTime: userDoc?.shift?.payrollLateStartTime || payrollSettings.lateStartTime,
        halfDayTime: userDoc?.shift?.payrollHalfDayTime || payrollSettings.halfDayTime,
      },
      verified: Boolean(entry?.verified),
    };

    rows.push(row);

    totals.basicPay += rowCalc.basicPay;
    totals.total += rowCalc.total;
    totals.leaveDeduction += rowCalc.leaveDeduction;
    totals.halfDayDeduction += rowCalc.halfDayDeduction;
    totals.lateDeduction += rowCalc.lateDeduction;
    totals.otherDeduction += rowCalc.otherDeduction;
    totals.netPay += rowCalc.netPay;
    totals.pf += rowCalc.pf;
    totals.esic += rowCalc.esic;
    totals.pt += rowCalc.pt;
    totals.statutoryTotal += rowCalc.statutoryTotal;
    totals.finalPay += rowCalc.finalPay;
    totals.retention += rowCalc.retention;
    totals.advance += rowCalc.advance;
    totals.loan += rowCalc.loan;
    totals.bankPay += rowCalc.bankPay;
  }

  return { daysOfMonth, settings: payrollSettings, rows, totals };
}

/**
 * Load and compute payroll for all eligible employees of companyId in (month, year).
 */
async function getPayrollData({ companyId, month, year }) {
  // Ensure all real staff from Employee Master (`User`) are synced into `Employee`
  await syncCompanyEmployeesFromUsers(companyId);

  const { monthStart, monthEnd } = getISTMonthBoundaries(year, month);

  const candidates = await Employee.find({
    companyId,
    $and: [
      {
        $or: [
          { joiningDate: { $lt: monthEnd } },
          { joiningDate: null },
          { joiningDate: { $exists: false } },
        ],
      },
      {
        $or: [
          { leavingDate: null },
          { leavingDate: { $exists: false } },
          { leavingDate: { $gte: monthStart } },
        ],
      },
    ],
  })
    .populate('departmentId', 'name')
    .populate('designationId', 'name')
    .populate({
      path: 'userId',
      select: '_id name employeeIdCode role roleCode scope department designation gender joiningDate employmentStatus shift',
      populate: {
        path: 'shift',
        select: 'name startTime endTime firstSession secondSession halfDayAfter payrollLateStartTime payrollHalfDayTime',
      },
    })
    .lean();

  const eligibleEmployees = candidates.filter((emp) => {
    // Exclude dedicated system console login accounts (ADM001, HR001, STR001, ACC001, etc.)
    if (emp.userId && typeof emp.userId === 'object' && isSystemConsoleUser(emp.userId)) {
      return false;
    }

    const statusUpper = String(emp.status || 'ACTIVE').trim().toUpperCase();
    if (statusUpper === 'INACTIVE' || statusUpper === 'TERMINATED') {
      if (!emp.leavingDate) return false;
      const leavingTime = new Date(emp.leavingDate).getTime();
      if (Number.isNaN(leavingTime) || leavingTime < monthStart.getTime()) {
        return false;
      }
    }
    const period = getCountedPeriod({
      year,
      month,
      joiningDate: emp.joiningDate,
      leavingDate: emp.leavingDate,
    });
    return period.countedDays > 0;
  });

  eligibleEmployees.sort((a, b) => naturalSort(a.employeeId, b.employeeId));

  const { daysOfMonth, settings, rows, totals } = await buildRowsForEmployees({
    companyId,
    employees: eligibleEmployees,
    month,
    year,
  });

  return { month, year, daysOfMonth, settings, rows, totals };
}

/**
 * Recalculate a single employee's payroll row after an edit.
 */
async function recalculateSingleRow({ companyId, employeeId, month, year }) {
  const emp = await Employee.findOne({ _id: employeeId, companyId })
    .populate('departmentId', 'name')
    .populate('designationId', 'name')
    .populate({
      path: 'userId',
      select: '_id name employeeIdCode role roleCode scope department designation gender joiningDate employmentStatus shift',
      populate: {
        path: 'shift',
        select: 'name startTime endTime firstSession secondSession halfDayAfter payrollLateStartTime payrollHalfDayTime',
      },
    })
    .lean();

  if (!emp) return null;

  const { rows } = await buildRowsForEmployees({
    companyId,
    employees: [emp],
    month,
    year,
  });

  return rows[0] || null;
}

module.exports = {
  getPayrollData,
  recalculateSingleRow,
  syncCompanyEmployeesFromUsers,
  naturalSort,
};
