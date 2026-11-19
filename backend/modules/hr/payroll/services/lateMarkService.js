/**
 * Late-mark service: resolves Employee -> User links (Employee.userId with fallback
 * to User.employeeIdCode === Employee.employeeId in the same company) and aggregates
 * Attendance punch-in times in a single query to compute { flatDays, halfDays }.
 */

const Attendance = require('../../../../models/Attendance');
const User = require('../../../../models/User');
const { getISTMonthBoundaries, getCountedPeriod } = require('./calendarService');
const { summarizePunchIns } = require('./payrollCalculator');

/**
 * Resolve linked User info for a list of Employee docs in at most one DB query.
 * Primary link: Employee.userId.
 * Fallback when userId is missing: User.employeeIdCode === Employee.employeeId within companyId.
 *
 * @param {string|Object} companyId
 * @param {Array<Object>} employees
 * @returns {Promise<Map<string, { userId: string, userDoc: Object|null }>>} keyed by String(emp._id)
 */
async function resolveEmployeeUsers(companyId, employees = []) {
  const resolved = new Map();
  const missingCodeEmployees = [];

  for (const emp of employees) {
    const empKey = String(emp._id);
    if (emp.userId) {
      if (typeof emp.userId === 'object' && emp.userId._id) {
        resolved.set(empKey, {
          userId: String(emp.userId._id),
          userDoc: emp.userId,
        });
        continue;
      } else if (typeof emp.userId !== 'object' || emp.userId.toString) {
        // Unpopulated ObjectId or string
        const rawId = String(emp.userId);
        if (rawId && rawId !== 'null' && rawId !== 'undefined' && rawId !== '[object Object]') {
          resolved.set(empKey, {
            userId: rawId,
            userDoc: null,
          });
          continue;
        }
      }
    }

    // userId missing or null after populate -> queue for employeeIdCode fallback
    const code = String(emp.employeeId || '').trim().toUpperCase();
    if (code) {
      missingCodeEmployees.push({ empKey, code });
    }
  }

  if (missingCodeEmployees.length > 0) {
    const uniqueCodes = [...new Set(missingCodeEmployees.map((x) => x.code))];
    const fallbackUsers = await User.find({
      companyId,
      employeeIdCode: { $in: uniqueCodes },
    })
      .select('_id employeeIdCode department designation shift')
      .populate('shift', 'name startTime endTime firstSession secondSession halfDayAfter')
      .lean();

    const userByCode = new Map();
    for (const u of fallbackUsers) {
      const code = String(u.employeeIdCode || '').trim().toUpperCase();
      if (code && !userByCode.has(code)) {
        userByCode.set(code, u);
      }
    }

    for (const { empKey, code } of missingCodeEmployees) {
      const matched = userByCode.get(code);
      if (matched) {
        resolved.set(empKey, {
          userId: String(matched._id),
          userDoc: matched,
        });
      }
    }
  }

  return resolved;
}

/**
 * Compute { flatDays, halfDays } per employee (keyed by String(emp._id)) in ONE Attendance query.
 *
 * @param {Object} params
 * @param {string|Object} params.companyId
 * @param {Array<Object>} params.employees - Employee documents
 * @param {number} params.year
 * @param {number} params.month - 1-12
 * @param {Map<string, { start: Date|null, end: Date|null }>} [params.periodsByEmployee]
 * @param {Map<string, { userId: string, userDoc: Object|null }>} [params.resolvedUsers]
 * @param {Object} [params.settings]
 * @returns {Promise<Map<string, { flatDays: number, halfDays: number }>>}
 */
async function computeLateMarksForEmployees({
  companyId,
  employees = [],
  year,
  month,
  periodsByEmployee = null,
  resolvedUsers = null,
  halfDaySessionsByUser = null,
  settings = {},
}) {
  const result = new Map();
  for (const emp of employees) {
    result.set(String(emp._id), { flatDays: 0, halfDays: 0 });
  }
  if (!employees.length) return result;

  const userLinks = resolvedUsers || (await resolveEmployeeUsers(companyId, employees));

  const uniqueUserIds = [
    ...new Set(Array.from(userLinks.values()).map((v) => v.userId).filter(Boolean)),
  ];

  if (uniqueUserIds.length === 0) {
    return result;
  }

  const { monthStart, monthEnd } = getISTMonthBoundaries(year, month);

  // Single DB query across all linked users for the IST month window
  const attendanceRecords = await Attendance.find({
    companyId,
    user: { $in: uniqueUserIds },
    'punchIn.time': { $gte: monthStart, $lt: monthEnd },
  })
    .select('user punchIn.time halfDaySession shiftInfo')
    .lean();

  const punchesByUser = new Map();
  for (const rec of attendanceRecords) {
    const punchTime = rec?.punchIn?.time;
    if (!punchTime || !rec?.user) continue;
    const uid = String(rec.user);
    if (!punchesByUser.has(uid)) {
      punchesByUser.set(uid, []);
    }
    punchesByUser.get(uid).push({
      punchInTime: punchTime,
      halfDaySession: rec.halfDaySession || null,
      shiftInfo: rec.shiftInfo || null,
    });
  }

  for (const emp of employees) {
    const empKey = String(emp._id);
    const link = userLinks.get(empKey);
    if (!link?.userId) continue;

    const punches = punchesByUser.get(link.userId);
    if (!punches || punches.length === 0) continue;

    const period = periodsByEmployee?.get(empKey) || getCountedPeriod({
      year,
      month,
      joiningDate: emp.joiningDate,
      leavingDate: emp.leavingDate,
    });

    const userShift = link.userDoc?.shift && typeof link.userDoc.shift === 'object' ? link.userDoc.shift : null;

    const counts = summarizePunchIns(punches, {
      periodStart: period.start,
      periodEnd: period.end,
      settings,
      userShift,
      halfDayLeaveSessionsByDay: halfDaySessionsByUser?.get(link.userId) || null,
    });
    result.set(empKey, counts);
  }

  return result;
}

module.exports = {
  resolveEmployeeUsers,
  computeLateMarksForEmployees,
};
