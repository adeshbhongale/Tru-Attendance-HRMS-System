/**
 * Leave & Absent deduction aggregation service for payroll:
 * - Approved Leave: approvedLeaveMultiplier (default 1x) day pay deduction per leave day
 * - Absent without leave (no approval): uninformedAbsentMultiplier (default 2x) day pay deduction per absent day
 * - Absent with Rejected Leave: rejectedLeaveAbsentMultiplier (default 2.5x) day pay deduction per absent day
 *
 * Uses 1 Leave query + 1 Attendance (Absent) query for all employees.
 */

const Leave = require('../../../../models/Leave');
const Attendance = require('../../../../models/Attendance');
const {
  getISTMonthBoundaries,
  getCountedPeriod,
  getISTDate,
  getISTDateKey,
  isSundayIST,
} = require('./calendarService');
const { resolveSettings } = require('./payrollCalculator');

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Resolve Session 1 / Session 2 for a Half Day leave using the same convention as controllers/attendance.js.
 */
function resolveLeaveHalfDaySession(lv) {
  if (!lv || lv.duration !== 'Half Day') return null;
  if (lv.session === 'Session 1' || lv.session === 'Session 2') return lv.session;
  return lv.startTime && lv.startTime >= '13:00' ? 'Session 2' : 'Session 1';
}

/**
 * Pure helper: calculate leave days & absent-with/without-rejected-leave days inside [periodStart, periodEnd] (IST).
 */
function summarizeApprovedLeavesDetailed(
  leaveDocs = [],
  { periodStart = null, periodEnd = null, absentDates = [], settings = {} } = {}
) {
  const halfDaySessionsByDay = new Map();
  const halfDayCounts = { session1: 0, session2: 0, total: 0 };
  const approvedFullDayKeys = new Set();
  const rejectedDayKeys = new Set();

  if (!periodStart || !periodEnd) {
    return {
      totalLeaves: 0,
      halfDaySessionsByDay,
      halfDayCounts,
      leaveBreakdown: { approvedLeaveDays: 0, uninformedAbsentDays: 0, rejectedLeaveAbsentDays: 0 },
    };
  }

  let approvedLeaveDays = 0;

  for (const lv of Array.isArray(leaveDocs) ? leaveDocs : []) {
    if (!lv?.startDate) continue;
    const status = String(lv.status || '');
    const startIST = getISTDate(lv.startDate);
    const endIST = getISTDate(lv.endDate || lv.startDate);
    if (Number.isNaN(startIST.getTime()) || Number.isNaN(endIST.getTime())) continue;

    if (status === 'Rejected') {
      const clippedStart = startIST.getTime() > periodStart.getTime() ? startIST : periodStart;
      const clippedEnd = endIST.getTime() < periodEnd.getTime() ? endIST : periodEnd;
      if (clippedStart.getTime() <= clippedEnd.getTime()) {
        for (let ts = clippedStart.getTime(); ts <= clippedEnd.getTime(); ts += ONE_DAY_MS) {
          const d = new Date(ts);
          if (!isSundayIST(d)) {
            rejectedDayKeys.add(getISTDateKey(d));
          }
        }
      }
      continue;
    }

    if (status !== 'Approved') continue;

    if (lv.duration === 'Half Day') {
      if (
        startIST.getTime() >= periodStart.getTime() &&
        startIST.getTime() <= periodEnd.getTime() &&
        !isSundayIST(startIST)
      ) {
        approvedLeaveDays += 0.5;
        const sess = resolveLeaveHalfDaySession(lv);
        const dayKey = getISTDateKey(startIST);
        if (sess && !halfDaySessionsByDay.has(dayKey)) {
          halfDaySessionsByDay.set(dayKey, sess);
          if (sess === 'Session 1') halfDayCounts.session1 += 1;
          else if (sess === 'Session 2') halfDayCounts.session2 += 1;
          halfDayCounts.total += 1;
        }
      }
      continue;
    }

    // Full Day or Multiple Days: clip range to employee's counted period in this month
    const clippedStart = startIST.getTime() > periodStart.getTime() ? startIST : periodStart;
    const clippedEnd = endIST.getTime() < periodEnd.getTime() ? endIST : periodEnd;

    if (clippedStart.getTime() > clippedEnd.getTime()) continue;

    for (let ts = clippedStart.getTime(); ts <= clippedEnd.getTime(); ts += ONE_DAY_MS) {
      const d = new Date(ts);
      if (!isSundayIST(d)) {
        approvedLeaveDays += 1;
        approvedFullDayKeys.add(getISTDateKey(d));
      }
    }
  }

  // Deduplicate Absent days by IST date key
  const seenAbsentKeys = new Set();
  let uninformedAbsentDays = 0;
  let rejectedLeaveAbsentDays = 0;

  for (const rawDate of Array.isArray(absentDates) ? absentDates : []) {
    if (!rawDate) continue;
    const absIST = getISTDate(rawDate);
    if (Number.isNaN(absIST.getTime())) continue;
    if (isSundayIST(absIST)) continue;
    if (absIST.getTime() < periodStart.getTime() || absIST.getTime() > periodEnd.getTime()) {
      continue;
    }

    const dayKey = getISTDateKey(absIST);
    if (seenAbsentKeys.has(dayKey)) continue;
    seenAbsentKeys.add(dayKey);

    // If covered by an Approved full-day leave, do not double-count as Absent
    if (approvedFullDayKeys.has(dayKey)) continue;

    if (rejectedDayKeys.has(dayKey)) {
      rejectedLeaveAbsentDays += 1;
    } else {
      uninformedAbsentDays += 1;
    }
  }

  const {
    approvedLeaveMultiplier,
    uninformedAbsentMultiplier,
    rejectedLeaveAbsentMultiplier,
  } = resolveSettings(settings);

  const totalLeaves =
    Math.round(
      (approvedLeaveDays * approvedLeaveMultiplier +
        uninformedAbsentDays * uninformedAbsentMultiplier +
        rejectedLeaveAbsentDays * rejectedLeaveAbsentMultiplier) *
        100
    ) / 100;

  return {
    totalLeaves,
    halfDaySessionsByDay,
    halfDayCounts,
    leaveBreakdown: {
      approvedLeaveDays: Math.round(approvedLeaveDays * 100) / 100,
      uninformedAbsentDays,
      rejectedLeaveAbsentDays,
    },
  };
}

function summarizeApprovedLeaves(leaveDocs = [], opts = {}) {
  return summarizeApprovedLeavesDetailed(leaveDocs, opts).totalLeaves;
}

/**
 * Compute deductible leave days (Approved + Uninformed Absent + Rejected-Leave Absent)
 * and half-day session maps per employee in 1 Leave query + 1 Attendance (Absent) query.
 */
async function computeLeavesForEmployees({
  companyId,
  employees = [],
  year,
  month,
  periodsByEmployee = null,
  resolvedUsers = null,
  settings = {},
}) {
  const result = new Map();
  const halfDaySessionsByUser = new Map();
  const halfDayLeaveCounts = new Map();
  const leaveBreakdowns = new Map();

  for (const emp of employees) {
    const key = String(emp._id);
    result.set(key, 0);
    halfDayLeaveCounts.set(key, { session1: 0, session2: 0, total: 0 });
    leaveBreakdowns.set(key, {
      approvedLeaveDays: 0,
      uninformedAbsentDays: 0,
      rejectedLeaveAbsentDays: 0,
    });
  }
  if (!employees.length || !resolvedUsers) {
    return {
      leavesMap: result,
      halfDaySessionsByUser,
      halfDayLeaveCounts,
      leaveBreakdowns,
    };
  }

  const uniqueUserIds = [
    ...new Set(Array.from(resolvedUsers.values()).map((v) => v.userId).filter(Boolean)),
  ];
  if (!uniqueUserIds.length) {
    return {
      leavesMap: result,
      halfDaySessionsByUser,
      halfDayLeaveCounts,
      leaveBreakdowns,
    };
  }

  const { monthStart, monthEnd } = getISTMonthBoundaries(year, month);
  // 1-day buffer around IST boundaries so UTC-midnight stored dates are never missed before JS IST clipping
  const queryStart = new Date(monthStart.getTime() - ONE_DAY_MS);
  const queryEnd = new Date(monthEnd.getTime() + ONE_DAY_MS);

  const [leaveRecords, absentRecords] = await Promise.all([
    Leave.find({
      companyId,
      user: { $in: uniqueUserIds },
      status: { $in: ['Approved', 'Rejected'] },
      startDate: { $lte: queryEnd },
      endDate: { $gte: queryStart },
    })
      .select('user startDate endDate duration session startTime status')
      .lean(),
    Attendance.find({
      companyId,
      user: { $in: uniqueUserIds },
      status: 'Absent',
      $or: [{ 'punchIn.time': { $exists: false } }, { 'punchIn.time': null }],
      date: { $gte: queryStart, $lte: queryEnd },
    })
      .select('user date')
      .lean(),
  ]);

  const leavesByUser = new Map();
  for (const rec of leaveRecords) {
    if (!rec?.user) continue;
    const uid = String(rec.user);
    if (!leavesByUser.has(uid)) {
      leavesByUser.set(uid, []);
    }
    leavesByUser.get(uid).push(rec);
  }

  const absentsByUser = new Map();
  for (const rec of absentRecords) {
    if (!rec?.user || !rec?.date) continue;
    const uid = String(rec.user);
    if (!absentsByUser.has(uid)) {
      absentsByUser.set(uid, []);
    }
    absentsByUser.get(uid).push(rec.date);
  }

  for (const emp of employees) {
    const empKey = String(emp._id);
    const link = resolvedUsers.get(empKey);
    if (!link?.userId) continue;

    const userLeaves = leavesByUser.get(link.userId) || [];
    const userAbsents = absentsByUser.get(link.userId) || [];
    if (userLeaves.length === 0 && userAbsents.length === 0) continue;

    const period =
      periodsByEmployee?.get(empKey) ||
      getCountedPeriod({
        year,
        month,
        joiningDate: emp.joiningDate,
        leavingDate: emp.leavingDate,
      });

    const detail = summarizeApprovedLeavesDetailed(userLeaves, {
      periodStart: period.start,
      periodEnd: period.end,
      absentDates: userAbsents,
      settings,
    });
    result.set(empKey, detail.totalLeaves);
    halfDayLeaveCounts.set(empKey, detail.halfDayCounts);
    leaveBreakdowns.set(empKey, detail.leaveBreakdown);
    if (detail.halfDaySessionsByDay.size > 0) {
      halfDaySessionsByUser.set(link.userId, detail.halfDaySessionsByDay);
    }
  }

  return {
    leavesMap: result,
    halfDaySessionsByUser,
    halfDayLeaveCounts,
    leaveBreakdowns,
  };
}

module.exports = {
  summarizeApprovedLeaves,
  summarizeApprovedLeavesDetailed,
  computeLeavesForEmployees,
};
