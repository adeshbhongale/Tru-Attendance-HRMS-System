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
const { getISTDateComponents, createDateFromIST, getStartOfDayIST, getEndOfDayIST } = require('../utils/timezone');

/**
 * Resolve the "True" status of an attendance record dynamically.
 * Standardizes Half-Day detection across all APIs.
 */
const resolveStatus = (attendance, user) => {
  if (!attendance || !attendance.punchIn || !attendance.punchIn.time) return attendance?.status || 'Absent';

  const now = new Date();
  const shift = attendance.shiftInfo || user?.shift;

  // If shift is missing or not fully populated (is an ObjectId), we can't calculate timings
  if (!shift || typeof shift !== 'object' || !shift.startTime || !shift.endTime) {
    return attendance.status || 'NA';
  }

  const punchIn = new Date(attendance.punchIn.time);
  if (isNaN(punchIn.getTime())) return attendance.status || 'NA';

  const [sH, sM] = (shift.startTime || "00:00").split(':').map(Number);
  const [eH, eM] = (shift.endTime || "00:00").split(':').map(Number);

  if (isNaN(sH) || isNaN(eH)) return attendance.status || 'NA';

  // Get IST components of punchIn and target date
  const pIST = getISTDateComponents(punchIn);
  let rIST;

  if (attendance.date) {
    rIST = getISTDateComponents(new Date(attendance.date));
  } else {
    rIST = { ...pIST };
  }

  // By default, assume shift starts on the same IST day as rIST
  let start = createDateFromIST(rIST.year, rIST.month, rIST.date, sH, sM);
  let end = createDateFromIST(rIST.year, rIST.month, rIST.date, eH, eM);

  // Roll forward if shift starts early morning (< 04:00 AM), punch-in is late on previous day (>= 12:00 PM),
  // and start is currently the same calendar day as punchIn (in IST).
  const startIST = getISTDateComponents(start);
  if (sH < 4 && pIST.hour >= 12) {
    if (startIST.date === pIST.date && startIST.month === pIST.month && startIST.year === pIST.year) {
      start = createDateFromIST(startIST.year, startIST.month, startIST.date + 1, sH, sM);
      end = createDateFromIST(startIST.year, startIST.month, startIST.date + 1, eH, eM);
    }
  } else if (eH < sH || (eH === sH && eM < sM)) {
    if (attendance.date) {
      // If we already know the target shift date, the end time is simply on the next day
      end = createDateFromIST(rIST.year, rIST.month, rIST.date + 1, eH, eM);
    } else {
      // If punchIn happened after start time of the shift, it's night shift starting on target day
      if (pIST.hour > sH || (pIST.hour === sH && pIST.minute >= sM)) {
        end = createDateFromIST(pIST.year, pIST.month, pIST.date + 1, eH, eM);
      }
      // If punchIn happened before end time of the shift, it's night shift starting on yesterday
      else if (pIST.hour < eH || (pIST.hour === eH && pIST.minute < eM)) {
        start = createDateFromIST(pIST.year, pIST.month, pIST.date - 1, sH, sM);
      }
    }
  }

  // 1. Check Half Day based on Punch-In Time (Hard Cutoff)
  let halfDayAfterStr = shift.halfDayAfter || user?.shift?.halfDayAfter;
  if (!halfDayAfterStr || halfDayAfterStr === "00:00") {
    // Default to 3 hours after shift start
    const defH = (sH + 3) % 24;
    const defM = sM;
    halfDayAfterStr = `${defH.toString().padStart(2, '0')}:${defM.toString().padStart(2, '0')}`;
  }
  const [hH, hM] = halfDayAfterStr.split(':').map(Number);

  const sIST = getISTDateComponents(start);
  let halfDayCutoff = createDateFromIST(sIST.year, sIST.month, sIST.date, isNaN(hH) ? 11 : hH, isNaN(hM) ? 0 : hM);
  if (hH < sH) {
    halfDayCutoff = createDateFromIST(sIST.year, sIST.month, sIST.date + 1, isNaN(hH) ? 11 : hH, isNaN(hM) ? 0 : hM);
  }

  if (punchIn > halfDayCutoff) return 'Half Day';

  // 2. Check Half Day based on Working Hours (90% Rule)
  const workingHours = calculateWorkingHours(attendance);
  const shiftDurationMinutes = (end - start) / 60000;
  const workedMinutes = workingHours * 60;

  // If shift ended (punched out or time passed), check 90% rule
  if (attendance.punchOut?.time || now > end) {
    if (workedMinutes < (0.9 * shiftDurationMinutes)) {
      return 'Half Day';
    }
  }

  // 3. Check Late vs Present based on Grace Period
  const lateMinutes = Math.floor((punchIn - start) / 60000);
  const gracePeriod = shift.gracePeriod !== undefined ? shift.gracePeriod : (user?.shift?.gracePeriod !== undefined ? user.shift.gracePeriod : 15);

  if (lateMinutes > gracePeriod) {
    return 'Late';
  }

  return 'Present';
};

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
  const [eHour, eMin] = (shift.endTime || "00:00").split(':').map(Number);

  const pIST = getISTDateComponents(punchIn);
  let shiftStart;

  if (attendance.date) {
    const dIST = getISTDateComponents(new Date(attendance.date));
    shiftStart = createDateFromIST(dIST.year, dIST.month, dIST.date, sHour, sMin);
  } else {
    shiftStart = createDateFromIST(pIST.year, pIST.month, pIST.date, sHour, sMin);
  }

  // Roll forward if shift starts early morning (< 04:00 AM), punch-in is late on previous day (>= 12:00 PM),
  // and shiftStart is currently the same calendar day as punchIn (in IST).
  const sIST = getISTDateComponents(shiftStart);
  if (sHour < 4 && pIST.hour >= 12) {
    if (sIST.date === pIST.date && sIST.month === pIST.month && sIST.year === pIST.year) {
      shiftStart = createDateFromIST(sIST.year, sIST.month, sIST.date + 1, sHour, sMin);
    }
  } else if (eHour < sHour || (eHour === sHour && eMin < sMin)) {
    // Cross midnight shift
    if (pIST.hour < eHour || (pIST.hour === eHour && pIST.minute < eMin)) {
      if (sIST.date === pIST.date && sIST.month === pIST.month && sIST.year === pIST.year) {
        shiftStart = createDateFromIST(sIST.year, sIST.month, sIST.date - 1, sHour, sMin);
      }
    }
  }

  const lateMinutes = punchIn > shiftStart ? Math.floor((punchIn - shiftStart) / 60000) : 0;
  const gracePeriod = shift.gracePeriod || 15;

  return lateMinutes > gracePeriod ? lateMinutes : 0;
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
const getAggregatedStats = (records, user, approvedLeaves = [], customStart = null, customEnd = null, leavesForPresence = [], holidays = [], weeklyOffs = ['Sunday']) => {
  // Use leavesForPresence for the isOnLeave check if provided, otherwise fallback to approvedLeaves
  const presenceLeaves = (leavesForPresence && leavesForPresence.length > 0) ? leavesForPresence : approvedLeaves;
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
  // ── 2. Count status types (with dynamic recovery) ────────────────
  let presentOnly = 0;
  let lateDays = 0;
  let halfDayCount = 0;

  filteredRecords.forEach((r) => {
    const status = resolveStatus(r, user);

    if (status === 'Present') presentOnly++;
    else if (status === 'Late') lateDays++;
    else if (status === 'Half Day') halfDayCount++;
  });

  const workingDays = presentOnly + lateDays + halfDayCount;

  // ── 3. Leave count (already filtered by caller or global) ─────────
  const joinDate = new Date(user.joiningDate || user.createdAt || new Date());
  const joinDay = new Date(Date.UTC(joinDate.getUTCFullYear(), joinDate.getUTCMonth(), joinDate.getUTCDate()));
  const now = new Date();
  const today = getStartOfDayIST(now);

  let rangeStart = customStart ? new Date(customStart) : joinDay;
  let rangeEnd = customEnd ? new Date(customEnd) : today;

  // Validate dates - if invalid, fallback to sensible defaults
  if (isNaN(rangeStart.getTime())) rangeStart = joinDay;
  if (isNaN(rangeEnd.getTime())) rangeEnd = today;

  const actualStart = (rangeStart < joinDay) ? new Date(joinDay) : new Date(rangeStart);
  actualStart.setUTCHours(0, 0, 0, 0);
  rangeEnd.setUTCHours(23, 59, 59, 999);

  const recordDates = new Set(filteredRecords.map((r) => new Date(r.date).toISOString().split('T')[0]));

  const isOnLeave = (date) => {
    const dStr = new Date(date).toISOString().split('T')[0];
    return presenceLeaves.some((l) => {
      const sStr = new Date(l.startDate).toISOString().split('T')[0];
      const eStr = new Date(l.endDate).toISOString().split('T')[0];
      return dStr >= sStr && dStr <= eStr;
    });
  };

  const isFullLeave = (date) => {
    const dStr = new Date(date).toISOString().split('T')[0];
    return presenceLeaves.some((l) => {
      if (l.duration === 'Half Day') return false;
      const sStr = new Date(l.startDate).toISOString().split('T')[0];
      const eStr = new Date(l.endDate).toISOString().split('T')[0];
      return dStr >= sStr && dStr <= eStr;
    });
  };

  const isHoliday = (date) => {
    const currIST = getISTDateComponents(date);
    const dateStr = `${currIST.year}-${(currIST.month + 1).toString().padStart(2, '0')}-${currIST.date.toString().padStart(2, '0')}`;
    return holidays.some((h) => {
      const hIST = getISTDateComponents(h.holiday_date);
      const hStr = `${hIST.year}-${(hIST.month + 1).toString().padStart(2, '0')}-${hIST.date.toString().padStart(2, '0')}`;
      return dateStr === hStr;
    });
  };

  const nowIST = getISTDateComponents(now);
  const todayStrIST = `${nowIST.year}-${(nowIST.month + 1).toString().padStart(2, '0')}-${nowIST.date.toString().padStart(2, '0')}`;

  let leaveDaysCount = 0;
  let absentDays = 0;
  let curr = new Date(actualStart);

  // Separate loop for Leave days - count only Full Day leave days in the provided range
  let leaveCheck = new Date(actualStart);
  while (leaveCheck <= rangeEnd) {
    const checkIST = getISTDateComponents(leaveCheck);
    if (!weeklyOffs.includes(checkIST.dayName) && isFullLeave(leaveCheck)) {
      leaveDaysCount++;
    }
    leaveCheck.setTime(leaveCheck.getTime() + 24 * 60 * 60 * 1000);
  }

  // Loop for Attendance/Absence - only up to Today
  while (curr <= rangeEnd && curr <= today) {
    const currIST = getISTDateComponents(curr);
    const dateStr = `${currIST.year}-${(currIST.month + 1).toString().padStart(2, '0')}-${currIST.date.toString().padStart(2, '0')}`;
    const hasRecord = recordDates.has(dateStr);
    const isToday = dateStr === todayStrIST;

    if (!weeklyOffs.includes(currIST.dayName) && !isOnLeave(curr) && !isHoliday(curr)) {
      // 1. A user is NEVER absent on their joining day (day 1)
      // 2. If it's a past day (after joining day), count as absent if no record
      // 3. If it's today (after joining day), count as absent ONLY if shift has ended
      const userJoinDay = new Date(user.joiningDate || user.createdAt);
      userJoinDay.setUTCHours(0, 0, 0, 0);
      const currDay = new Date(curr);
      currDay.setUTCHours(0, 0, 0, 0);

      let shouldCheckAbsent = false;

      if (currDay >= userJoinDay) {
        if (!isToday) {
          shouldCheckAbsent = true;
        } else if (user.shift) {
          const [sH, sM] = user.shift.startTime.split(':').map(Number);
          const [eH, eM] = user.shift.endTime.split(':').map(Number);

          let shiftEnd = createDateFromIST(nowIST.year, nowIST.month, nowIST.date, eH, eM);

          // Handle night shift rollover
          if ((eH < sH || (eH === sH && eM < sM)) && eH < 12 && nowIST.hour > 12) {
            shiftEnd = createDateFromIST(nowIST.year, nowIST.month, nowIST.date + 1, eH, eM);
          }

          if (now > shiftEnd) shouldCheckAbsent = true;
        } else {
          // Fallback for today without shift
          if (nowIST.hour >= 23) shouldCheckAbsent = true;
        }
      }

      if (shouldCheckAbsent) {
        if (!hasRecord) {
          absentDays++;
        } else {
          const rec = records.find((r) => new Date(r.date).toISOString().split('T')[0] === dateStr);
          if (rec && resolveStatus(rec, user) === 'Absent') absentDays++;
        }
      }
    }
    curr.setTime(curr.getTime() + 24 * 60 * 60 * 1000);
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

  const endLimit = new Date(rangeEnd);
  if (endLimit > today) endLimit.setTime(today.getTime());

  while (dayCheck <= endLimit) {
    const checkIST = getISTDateComponents(dayCheck);
    if (!weeklyOffs.includes(checkIST.dayName)) totalDaysInRange++;
    dayCheck.setTime(dayCheck.getTime() + 24 * 60 * 60 * 1000);
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
    leaveDays: leaveDaysCount,
    unpaidLeaveDays: approvedLeaves.filter(l => l.leaveType === 'Unpaid Leave').length,
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
  const CompanySetting = require('../models/CompanySetting');
  const [user, settings] = await Promise.all([
    User.findById(employeeId).populate('shift').lean(),
    CompanySetting.findOne().lean()
  ]);

  if (!user) throw new Error('User not found');
  const weeklyOffs = settings?.weeklyOffs || ['Sunday'];

  const recordQuery = { user: employeeId };
  if (startDate && endDate) {
    const sIST = getISTDateComponents(new Date(startDate));
    const eIST = getISTDateComponents(new Date(endDate));
    const s = createDateFromIST(sIST.year, sIST.month, sIST.date, 0, 0, 0, 0);
    const e = createDateFromIST(eIST.year, eIST.month, eIST.date, 23, 59, 59, 999);
    recordQuery.date = { $gte: s, $lte: e };
  }

  const records = await Attendance.find(recordQuery).sort({ date: -1 }).lean();
  const allRecords = startDate ? await Attendance.find({ user: employeeId }).lean() : records;

  const leaveQuery = { user: employeeId, status: 'Approved' };
  if (startDate && endDate) {
    // BREAK POINTS: Use createdAt for the count of leaves in this period (as requested)
    leaveQuery.createdAt = { $gte: new Date(startDate), $lte: new Date(endDate) };
  }
  const leavesForCount = await Leave.find(leaveQuery).lean();

  // We still need leaves based on startDate/endDate for the 'isOnLeave' logic 
  // to avoid marking people absent during their time off.
  const presenceLeaveQuery = { user: employeeId, status: 'Approved' };
  if (startDate && endDate) {
    presenceLeaveQuery.$or = [
      { startDate: { $gte: new Date(startDate), $lte: new Date(endDate) } },
      { endDate: { $gte: new Date(startDate), $lte: new Date(endDate) } }
    ];
  }
  const leavesForPresence = await Leave.find(presenceLeaveQuery).lean();

  const Holiday = require('../models/Holiday');
  let holidays = [];
  if (startDate && endDate) {
    const sIST = getISTDateComponents(new Date(startDate));
    const eIST = getISTDateComponents(new Date(endDate));
    const s = createDateFromIST(sIST.year, sIST.month, sIST.date, 0, 0, 0, 0);
    const e = createDateFromIST(eIST.year, eIST.month, eIST.date, 23, 59, 59, 999);
    holidays = await Holiday.find({
      holiday_date: { $gte: s, $lte: e },
      status: 'active'
    }).lean();
  } else {
    holidays = await Holiday.find({ status: 'active' }).lean();
  }

  const stats = getAggregatedStats(
    startDate ? records : allRecords,
    user,
    leavesForCount, // Use createdAt-filtered leaves for the COUNTS
    startDate,
    endDate,
    leavesForPresence, // Pass extra leaves for presence check
    holidays, // Pass holidays
    weeklyOffs
  );

  // Today's record for "Current" fields
  const now = new Date();
  const todayUTC = getStartOfDayIST(now);
  const endUTC = getEndOfDayIST(now);

  const todayRecord = await Attendance.findOne({
    user: employeeId,
    date: { $gte: todayUTC, $lt: endUTC }
  }).lean();

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
    currentDistanceKm: parseFloat(currentDistanceKm.toFixed(2)),
  };
};

module.exports = {
  calculateWorkingHours,
  calculateLateTime,
  calculateBreakMinutes,
  getAggregatedStats,
  getEmployeeFullStats,
  resolveStatus,
};
