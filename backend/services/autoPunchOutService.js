const Attendance = require('../models/Attendance');
const User = require('../models/User');
const Shift = require('../models/Shift');
const { getISTDateComponents, createDateFromIST, getStartOfDayIST } = require('../utils/timezone');
const statsService = require('./employeeStatsService');

/**
 * Helper to determine shift working hours (in decimal hours)
 * Defaults to 8.5 hours if no shift is specified or configured
 */
const resolveShiftWorkingHours = (shift, user) => {
  const activeShift = shift || user?.shift;
  if (activeShift) {
    if (activeShift.workingHours && Number(activeShift.workingHours) > 0) {
      return Number(activeShift.workingHours);
    }
    if (activeShift.requiredHours && Number(activeShift.requiredHours) > 0) {
      return Number(activeShift.requiredHours);
    }
    if (activeShift.startTime && activeShift.endTime) {
      const [sH, sM] = String(activeShift.startTime).split(':').map(Number);
      const [eH, eM] = String(activeShift.endTime).split(':').map(Number);
      if (!isNaN(sH) && !isNaN(eH)) {
        let diffMins = (eH * 60 + (eM || 0)) - (sH * 60 + (sM || 0));
        if (diffMins < 0) diffMins += 24 * 60; // Cross midnight shift
        if (diffMins > 0) return parseFloat((diffMins / 60).toFixed(2));
      }
    }
  }
  return 8.5; // Default recent standard shift hours
};

/**
 * Helper to compute the auto punch out timestamp based on shift end or punch-in duration
 */
const resolveAutoPunchOutTime = (record, shift, shiftHours) => {
  const punchInTime = record.punchIn?.time ? new Date(record.punchIn.time) : new Date(record.date);
  const activeShift = shift || record.shiftInfo;

  if (activeShift?.endTime) {
    const [eH, eM] = String(activeShift.endTime).split(':').map(Number);
    const [sH, sM] = String(activeShift.startTime || '09:00').split(':').map(Number);
    const dIST = getISTDateComponents(record.date ? new Date(record.date) : punchInTime);

    if (!isNaN(eH)) {
      const isNightShift = eH < sH || (eH === sH && (eM || 0) < (sM || 0));
      return createDateFromIST(
        dIST.year,
        dIST.month,
        isNightShift ? dIST.date + 1 : dIST.date,
        eH,
        isNaN(eM) ? 0 : eM,
        0,
        0
      );
    }
  }

  // Fallback: punch-in time + shift hours
  return new Date(punchInTime.getTime() + shiftHours * 60 * 60 * 1000);
};

/**
 * Auto-close unclosed attendance sessions from past days
 * Ensures next day starts fresh with a Punch In button
 */
const closePriorDayAttendances = async (userId = null, companyId = null) => {
  try {
    const now = new Date();
    const todayStart = getStartOfDayIST(now);

    const query = {
      "punchIn.time": { $exists: true },
      "punchOut.time": { $exists: false },
      date: { $lt: todayStart }
    };

    if (userId) {
      query.user = userId;
    }
    if (companyId) {
      query.companyId = companyId;
    }

    const openRecords = await Attendance.find(query).populate({
      path: 'user',
      populate: { path: 'shift' }
    });

    if (!openRecords || openRecords.length === 0) {
      return 0;
    }

    let closedCount = 0;
    for (const record of openRecords) {
      const user = record.user;
      const shift = record.shiftInfo || user?.shift;
      const shiftHours = resolveShiftWorkingHours(shift, user);
      const autoPunchOutTime = resolveAutoPunchOutTime(record, shift, shiftHours);

      record.punchOut = {
        time: autoPunchOutTime,
        location: {
          latitude: record.punchIn?.location?.latitude || 0,
          longitude: record.punchIn?.location?.longitude || 0,
          address: 'Auto Punch Out (Day End)'
        },
        selfie: null,
        isOutside: false,
        isAutoPunchOut: true
      };

      record.isAutoPunchOut = true;
      record.workingHours = shiftHours;

      // Resolve final status
      const resolvedStatus = statsService.resolveStatus(record, user);
      record.status = resolvedStatus || 'Present';
      record.isLate = record.status === 'Late';
      record.isHalfDay = record.status === 'Half Day';

      await record.save();
      closedCount++;
    }

    return closedCount;
  } catch (err) {
    console.error('Error in closePriorDayAttendances:', err.message);
    return 0;
  }
};

/**
 * Watchdog cycle run by server interval
 */
const runAutoPunchOutCycle = async (io = null) => {
  try {
    const closedCount = await closePriorDayAttendances();
    if (closedCount > 0) {
      console.log(`[AutoPunchOut] Automatically punched out ${closedCount} unclosed prior day attendance session(s).`);
      if (io) {
        io.emit('attendanceUpdated', { autoPunchOut: true, count: closedCount });
      }
    }
  } catch (err) {
    console.error('[AutoPunchOut] Watchdog error:', err.message);
  }
};

module.exports = {
  closePriorDayAttendances,
  runAutoPunchOutCycle,
  resolveShiftWorkingHours,
  resolveAutoPunchOutTime
};
