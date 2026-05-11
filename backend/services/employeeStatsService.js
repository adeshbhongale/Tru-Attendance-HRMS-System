/**
 * ============================================================
 *  EMPLOYEE STATS SERVICE — SINGLE SOURCE OF TRUTH
 * ============================================================
 * ALL employee statistics are calculated HERE and ONLY HERE.
 * Admin panel, mobile app, reports and analytics MUST import
 * from this file. Never calculate business stats in frontend.
 * ============================================================
 */

const Attendance = require('../models/Attendance');
const Leave = require('../models/Leave');
const User = require('../models/User');

/**
 * Calculate net working hours for a single attendance record (decimal hours).
 * This is the canonical working-hours formula for the entire system.
 */
const calculateWorkingHours = (attendance) => {
  try {
    if (!attendance || !attendance.punchIn || !attendance.punchIn.time) return 0;

    const startTime = new Date(attendance.punchIn.time);
    if (isNaN(startTime.getTime())) return 0;

    let endTime;
    if (attendance.punchOut && attendance.punchOut.time) {
      endTime = new Date(attendance.punchOut.time);
    } else {
      const recordDate = new Date(attendance.date);
      if (isNaN(recordDate.getTime())) return 0;
      const today = new Date();
      const isToday =
        recordDate.toISOString().split('T')[0] === today.toISOString().split('T')[0];
      if (isToday) {
        endTime = new Date();
      } else {
        return 0;
      }
    }

    if (isNaN(endTime.getTime())) return 0;

    let totalMinutes = (endTime.getTime() - startTime.getTime()) / 60000;

    // Handle cross-midnight shifts (e.g., Night Shift)
    // If punch-out is earlier in the clock than punch-in, it happened the next day
    if (totalMinutes < 0) {
      totalMinutes += 24 * 60;
    }

    const breaks = attendance.breaks || [];
    let completedBreakMinutes = 0;
    let activeBreakMinutes = 0;

    breaks.forEach((b) => {
      if (b.endTime) {
        completedBreakMinutes += b.duration || 0;
      } else if (b.startTime) {
        const bStart = new Date(b.startTime);
        if (!isNaN(bStart.getTime())) {
          activeBreakMinutes += (new Date().getTime() - bStart.getTime()) / 60000;
        }
      }
    });

    const netMinutes = Math.max(0, totalMinutes - completedBreakMinutes - activeBreakMinutes);
    return parseFloat((netMinutes / 60).toFixed(2));
  } catch {
    return 0;
  }
};

/**
 * Calculate late time in minutes for a single attendance record.
 */
const calculateLateTime = (attendance, shift) => {
  if (!attendance.punchIn?.time || !shift?.startTime) return 0;

  const punchIn = new Date(attendance.punchIn.time);
  const [sHour, sMin] = shift.startTime.split(':').map(Number);

  const shiftStart = new Date(punchIn);
  shiftStart.setHours(sHour, sMin, 0, 0);

  return punchIn > shiftStart ? Math.floor((punchIn - shiftStart) / 60000) : 0;
};

/**
 * Calculate total break minutes for a single attendance record.
 */
const calculateBreakMinutes = (attendance) => {
  if (!attendance.breaks || !Array.isArray(attendance.breaks)) return 0;
  return attendance.breaks.reduce((acc, b) => acc + (b.duration || 0), 0);
};

/**
 * Master aggregated stats calculator.
 * Returns the standardized DTO consumed by ALL APIs.
 *
 * @param {Array}  records       - Attendance records for the employee
 * @param {Object} user          - User document (with shift populated)
 * @param {Array}  approvedLeaves - Approved Leave documents
 * @param {Date|null} customStart - Optional range start
 * @param {Date|null} customEnd   - Optional range end
 * @returns {Object} Standardized stats DTO
 */
const getAggregatedStats = (records, user, approvedLeaves = [], customStart = null, customEnd = null) => {
  // ── 1. Filter records to the requested date range ────────────────
  let filteredRecords = records;
  if (customStart && customEnd) {
    const s = new Date(customStart);
    const e = new Date(customEnd);
    s.setHours(0, 0, 0, 0);
    e.setHours(23, 59, 59, 999);
    filteredRecords = records.filter((r) => {
      const d = new Date(r.date);
      return d >= s && d <= e;
    });
  }

  // ── 2. Count status types ─────────────────────────────────────────
  const presentOnly = filteredRecords.filter((r) => r.status === 'Present').length;
  const lateDays = filteredRecords.filter((r) => r.status === 'Late').length;
  const halfDayCount = filteredRecords.filter((r) => r.status === 'Half Day').length;
  const workingDays = presentOnly + lateDays + halfDayCount;

  // ── 3. Leave count (already filtered by caller or global) ─────────
  const leaveCount = approvedLeaves.length;

  // ── 4. Absent days (business-day logic, excluding Sundays & leaves) ─
  const joinDate = new Date(user.createdAt || new Date());
  const joinDay = new Date(joinDate.getFullYear(), joinDate.getMonth(), joinDate.getDate());

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const rangeStart = customStart ? new Date(customStart) : joinDay;
  const rangeEnd = customEnd ? new Date(customEnd) : today;

  const actualStart = rangeStart < joinDay ? joinDay : rangeStart;
  actualStart.setHours(0, 0, 0, 0);
  rangeEnd.setHours(0, 0, 0, 0);

  const shiftCutoff = user.shift?.punchInCutoff || '14:00';
  const [cutoffHour, cutoffMin] = shiftCutoff.split(':').map(Number);

  const recordDates = new Set(filteredRecords.map((r) => new Date(r.date).toDateString()));

  const isOnLeave = (date) =>
    approvedLeaves.some((l) => {
      const start = new Date(l.startDate);
      const end = new Date(l.endDate);
      start.setHours(0, 0, 0, 0);
      end.setHours(0, 0, 0, 0);
      const d = new Date(date);
      d.setHours(0, 0, 0, 0);
      return d >= start && d <= end;
    });

  let absentDays = 0;
  let curr = new Date(actualStart);

  while (curr <= rangeEnd && curr <= today) {
    const isSunday = curr.getDay() === 0;
    const dateStr = curr.toDateString();
    const hasRecord = recordDates.has(dateStr);
    const isToday = dateStr === today.toDateString();

    if (!isSunday) {
      if (isToday) {
        if (!hasRecord) {
          const cutoffTime = new Date(now);
          cutoffTime.setHours(cutoffHour, cutoffMin, 0, 0);
          if (now > cutoffTime && !isOnLeave(curr)) absentDays++;
        }
      } else {
        if (!hasRecord && !isOnLeave(curr)) {
          absentDays++;
        } else if (hasRecord) {
          const rec = records.find((r) => new Date(r.date).toDateString() === dateStr);
          if (rec && rec.status === 'Absent') absentDays++;
        }
      }
    }
    curr.setDate(curr.getDate() + 1);
  }

  // ── 5. Aggregated hours & distance (using canonical formula) ──────
  const totalWorkedHours = filteredRecords.reduce(
    (acc, r) => acc + calculateWorkingHours(r), 0
  );

  const totalBreakMinutes = filteredRecords.reduce(
    (acc, r) => acc + calculateBreakMinutes(r), 0
  );

  const totalDistanceKm = parseFloat(
    filteredRecords.reduce((acc, r) => acc + (r.distance || r.totalDistance || 0), 0).toFixed(2)
  );

  // ── 6. Total non-Sunday days in range ────────────────────────────
  let totalDaysInRange = 0;
  const dayCheck = new Date(actualStart);
  dayCheck.setHours(0, 0, 0, 0);

  const endLimit = new Date(rangeEnd);
  if (endLimit > today) endLimit.setTime(today.getTime());
  endLimit.setHours(23, 59, 59, 999);

  while (dayCheck <= endLimit) {
    if (dayCheck.getDay() !== 0) totalDaysInRange++;
    dayCheck.setDate(dayCheck.getDate() + 1);
  }

  // ── 7. Build standardized DTO ─────────────────────────────────────
  const dto = {
    // Counts
    totalDays: totalDaysInRange,
    workingDays: workingDays,
    presentDays: presentOnly,
    lateDays: lateDays,
    halfDayCount: halfDayCount,
    absentDays: absentDays,
    leaveDays: leaveCount,
    // Leave meta
    leaveBalance: user.leaveBalance ?? 0,
    monthlyLimit: user.monthlyLeaveLimit ?? 0,
    // Time
    totalWorkedHours: parseFloat(totalWorkedHours.toFixed(2)),
    totalBreakMinutes: totalBreakMinutes,
    // Distance
    totalDistanceKm: totalDistanceKm,
  };

  return dto;
};

/**
 * Convenience async method: fetch everything for one employee and return stats.
 * Use this when a single employeeId is known (saves callers from repeating DB queries).
 *
 * @param {string}     employeeId
 * @param {Date|null}  startDate
 * @param {Date|null}  endDate
 * @returns {Object}   { user, stats, todayRecord }
 */
const getEmployeeFullStats = async (employeeId, startDate = null, endDate = null) => {
  const user = await User.findById(employeeId).populate('shift');
  if (!user) throw new Error('User not found');

  const recordQuery = { user: employeeId };
  if (startDate && endDate) {
    recordQuery.date = {
      $gte: new Date(startDate),
      $lte: new Date(endDate)
    };
  }

  const records = await Attendance.find(recordQuery).sort({ date: -1 });
  const allRecords = startDate ? await Attendance.find({ user: employeeId }) : records;

  const leaveQuery = { user: employeeId, status: 'Approved' };
  if (startDate && endDate) {
    leaveQuery.$or = [
      { startDate: { $gte: new Date(startDate), $lte: new Date(endDate) } },
      { endDate: { $gte: new Date(startDate), $lte: new Date(endDate) } }
    ];
  }
  const leaves = await Leave.find(leaveQuery);

  const stats = getAggregatedStats(
    startDate ? records : allRecords,
    user,
    leaves,
    startDate,
    endDate
  );

  // Today's record for "Current" fields
  const now = new Date();
  const todayUTC = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const endUTC = new Date(todayUTC);
  endUTC.setUTCDate(endUTC.getUTCDate() + 1);

  const todayRecord = await Attendance.findOne({
    user: employeeId,
    date: { $gte: todayUTC, $lt: endUTC }
  });

  // Current-day computed values (backend-only)
  const currentWorkingHours = todayRecord ? calculateWorkingHours(todayRecord) : 0;
  const currentBreakMinutes = todayRecord ? calculateBreakMinutes(todayRecord) : 0;
  const currentDistanceKm = todayRecord
    ? parseFloat((todayRecord.distance || todayRecord.totalDistance || 0).toFixed(2))
    : 0;

  return {
    user,
    stats,
    todayRecord,
    currentWorkingHours: parseFloat(currentWorkingHours.toFixed(2)),
    currentBreakMinutes,
    currentDistanceKm,
  };
};

module.exports = {
  calculateWorkingHours,
  calculateLateTime,
  calculateBreakMinutes,
  getAggregatedStats,
  getEmployeeFullStats,
};
