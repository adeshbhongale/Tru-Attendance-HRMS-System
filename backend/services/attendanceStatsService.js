/**
 * Attendance Statistics Service
 * Centralized logic for all attendance-related calculations
 */

/**
 * Calculates net working hours for an attendance record
 * @param {Object} attendance - The attendance record
 * @returns {Number} Working hours as a decimal
 */
exports.calculateWorkingHours = (attendance) => {
  try {
    if (!attendance || !attendance.punchIn || !attendance.punchIn.time) return 0;
    
    const startTime = new Date(attendance.punchIn.time);
    if (isNaN(startTime.getTime())) return 0;

    let endTime;
    if (attendance.punchOut && attendance.punchOut.time) {
      endTime = new Date(attendance.punchOut.time);
    } else {
      // No punch out - check if it's today
      const recordDate = new Date(attendance.date);
      if (isNaN(recordDate.getTime())) return 0;
      const today = new Date();
      
      // Compare dates (YYYY-MM-DD)
      const isToday = recordDate.toISOString().split('T')[0] === today.toISOString().split('T')[0];
      
      if (isToday) {
        endTime = new Date();
      } else {
        // Past record with no punch out - incomplete session
        return 0;
      }
    }
    
    if (isNaN(endTime.getTime())) return 0;
    
    // Calculate total duration in minutes
    let totalMinutes = (endTime.getTime() - startTime.getTime()) / 60000;
    
    // Subtract breaks
    const breaks = attendance.breaks || [];
    let breakMinutes = 0;
    let activeBreakMinutes = 0;
    
    breaks.forEach(b => {
      if (b.endTime) {
        // Completed break
        breakMinutes += (b.duration || 0);
      } else if (b.startTime) {
        // Active break - only if it's today
        const bStart = new Date(b.startTime);
        if (!isNaN(bStart.getTime())) {
          activeBreakMinutes += (new Date().getTime() - bStart.getTime()) / 60000;
        }
      }
    });

    const netWorkingMinutes = Math.max(0, totalMinutes - breakMinutes - activeBreakMinutes);
    return parseFloat((netWorkingMinutes / 60).toFixed(2));
  } catch (err) {
    console.error('Error calculating working hours:', err);
    return 0;
  }
};

/**
 * Calculates late time in minutes for an attendance record
 * @param {Object} attendance - The attendance record
 * @param {Object} shift - The shift information
 * @returns {Number} Late time in minutes
 */
exports.calculateLateTime = (attendance, shift) => {
  if (!attendance.punchIn?.time || !shift?.startTime) return 0;
  
  const punchIn = new Date(attendance.punchIn.time);
  const [sHour, sMin] = shift.startTime.split(':').map(Number);
  
  const shiftStart = new Date(punchIn);
  shiftStart.setHours(sHour, sMin, 0, 0);
  
  if (punchIn > shiftStart) {
    return Math.floor((punchIn - shiftStart) / 60000);
  }
  
  return 0;
};

/**
 * Aggregate statistics for a collection of attendance records
 * @param {Array} records - Array of attendance records
 * @param {Object} user - The user object (for join date and shift info)
 * @param {Array} approvedLeaves - Array of approved leaves
 * @param {Date} customStart - Optional custom start date
 * @param {Date} customEnd - Optional custom end date
 * @returns {Object} Calculated statistics
 */
exports.getAggregatedStats = (records, user, approvedLeaves = [], customStart = null, customEnd = null) => {
  // Filter records by date range if provided
  let filteredRecords = records;
  if (customStart && customEnd) {
    const s = new Date(customStart);
    const e = new Date(customEnd);
    s.setHours(0,0,0,0);
    e.setHours(23,59,59,999);
    filteredRecords = records.filter(r => {
      const d = new Date(r.date);
      return d >= s && d <= e;
    });
  }

  const presentOnly = filteredRecords.filter(r => r.status === 'Present').length;
  const lateDays = filteredRecords.filter(r => r.status === 'Late').length;
  const halfDayCount = filteredRecords.filter(r => r.status === 'Half Day').length;
  const workingDays = presentOnly + lateDays + halfDayCount;
  
  const leaveCount = approvedLeaves.length;
  
  // Calculate Absent Days within range
  const joinDate = new Date(user.createdAt || new Date());
  const joinDay = new Date(joinDate.getFullYear(), joinDate.getMonth(), joinDate.getDate());
  
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  const rangeStart = customStart ? new Date(customStart) : joinDay;
  const rangeEnd = customEnd ? new Date(customEnd) : today;
  
  // Ensure range doesn't start before joining
  const actualStart = rangeStart < joinDay ? joinDay : rangeStart;
  actualStart.setHours(0,0,0,0);
  rangeEnd.setHours(0,0,0,0);
  
  const shiftCutoff = user.shift?.punchInCutoff || "14:00";
  const [cutoffHour, cutoffMin] = shiftCutoff.split(':').map(Number);
  
  const recordDates = new Set(filteredRecords.map(r => new Date(r.date).toDateString()));
  
  const isOnLeave = (date) => {
    return approvedLeaves.some(l => {
      const start = new Date(l.startDate);
      const end = new Date(l.endDate);
      start.setHours(0,0,0,0);
      end.setHours(0,0,0,0);
      const d = new Date(date);
      d.setHours(0,0,0,0);
      return d >= start && d <= end;
    });
  };
  
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
          const rec = records.find(r => new Date(r.date).toDateString() === dateStr);
          if (rec && rec.status === 'Absent') absentDays++;
        }
      }
    }
    curr.setDate(curr.getDate() + 1);
  }
  
  const totalDistance = filteredRecords.reduce((acc, r) => acc + (r.distance || 0), 0);
  const totalWorkedHours = filteredRecords.reduce((acc, r) => acc + exports.calculateWorkingHours(r), 0);
  const totalBreakMinutes = filteredRecords.reduce((acc, r) => {
    return acc + (r.breaks?.reduce((sum, b) => sum + (b.duration || 0), 0) || 0);
  }, 0);
  
  // Calculate total non-Sunday days in the range
  let totalDaysInRange = 0;
  const dayCheck = new Date(actualStart);
  dayCheck.setHours(0, 0, 0, 0);
  
  const endLimit = new Date(rangeEnd);
  if (endLimit > today) endLimit.setTime(today.getTime());
  endLimit.setHours(23, 59, 59, 999);

  while (dayCheck <= endLimit) {
    if (dayCheck.getDay() !== 0) { // Not Sunday
      totalDaysInRange++;
    }
    dayCheck.setDate(dayCheck.getDate() + 1);
  }

  return {
    totalDays: totalDaysInRange,
    workingDays: workingDays,
    presentDays: presentOnly,
    lateDays: lateDays,
    halfDayCount: halfDayCount,
    absentDays,
    leaveDays: leaveCount,
    leaveBalance: user.leaveBalance,
    monthlyLimit: user.monthlyLeaveLimit,
    totalDistanceKm: parseFloat(totalDistance.toFixed(2)),
    totalWorkedHours: parseFloat(totalWorkedHours.toFixed(2)),
    totalBreakMinutes
  };
};
