/**
 * Reports Controller
 * ─────────────────────────────────────────────────────────────
 * SINGLE SOURCE OF TRUTH — All statistics are calculated by
 * employeeStatsService. No business logic lives in this file.
 */

const Attendance = require('../models/Attendance');
const User = require('../models/User');
const Leave = require('../models/Leave');
const Shift = require('../models/Shift');
const statsService = require('../services/employeeStatsService');
const { getISTDateComponents, createDateFromIST } = require('../utils/timezone');
const CompanySetting = require('../models/CompanySetting');

// ─────────────────────────────────────────────────────────────
// Helper – build a UTC-midnight Date from a YYYY-MM-DD string
// ─────────────────────────────────────────────────────────────
const parseUTCDate = (str) => {
  if (!str) return null;
  const [y, m, d] = str.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};

const todayUTC = () => {
  const ist = getISTDateComponents(new Date());
  return new Date(Date.UTC(ist.year, ist.month, ist.date));
};

// ─────────────────────────────────────────────────────────────
// GET /api/reports/daily
// ─────────────────────────────────────────────────────────────
exports.getDailyReport = async (req, res) => {
  try {
    const targetDate = req.query.date ? parseUTCDate(req.query.date) : todayUTC();
    const attendanceRaw = await Attendance.find({ date: targetDate })
      .populate({
        path: 'user',
        select: 'name email department shift',
        populate: { path: 'shift' }
      });

    const attendance = attendanceRaw.map(a => {
      const record = a.toObject();
      return {
        ...record,
        workingHours: statsService.calculateWorkingHours(record),
        status: statsService.resolveStatus(record, record.user)
      };
    });

    res.json({ success: true, count: attendance.length, data: attendance });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────
// GET /api/reports/monthly
// ─────────────────────────────────────────────────────────────
exports.getMonthlyReport = async (req, res) => {
  try {
    const { month, year } = req.query;
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);

    const attendanceRaw = await Attendance.find({
      date: { $gte: startDate, $lte: endDate }
    }).populate({
      path: 'user',
      select: 'name email department shift',
      populate: { path: 'shift' }
    });

    const attendance = attendanceRaw.map(a => {
      const record = a.toObject();
      return {
        ...record,
        workingHours: statsService.calculateWorkingHours(record),
        status: statsService.resolveStatus(record, record.user)
      };
    });

    res.json({ success: true, count: attendance.length, data: attendance });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────
// GET /api/reports/stats   (admin dashboard overview)
// ─────────────────────────────────────────────────────────────
exports.getStats = async (req, res) => {
  try {
    const { date, startDate, endDate } = req.query;
    let targetDate = todayUTC();
    let dateQuery = {};
    if (startDate && endDate) {
      dateQuery = { date: { $gte: parseUTCDate(startDate), $lte: parseUTCDate(endDate) } };
    } else {
      targetDate = date ? parseUTCDate(date) : todayUTC();
      dateQuery = { date: targetDate };
    }

    const startOfTargetDate = new Date(targetDate);
    startOfTargetDate.setUTCHours(0, 0, 0, 0);
    const endOfTargetDate = new Date(targetDate);
    endOfTargetDate.setUTCHours(23, 59, 59, 999);

    const now = new Date();
    const istNow = getISTDateComponents(now);
    const todayStr = `${istNow.year}-${String(istNow.month + 1).padStart(2, '0')}-${String(istNow.date).padStart(2, '0')}`;
    const isTargetToday = targetDate.toISOString().split('T')[0] === todayStr;

    const sDate = startDate ? parseUTCDate(startDate) : new Date(targetDate.getTime() - 6 * 24 * 60 * 60 * 1000);
    const eDate = endDate ? parseUTCDate(endDate) : targetDate;
    const diffDays = Math.min(31, Math.ceil((eDate - sDate) / (1000 * 60 * 60 * 24)) + 1);

    const [
      activeEmployees,
      attendanceRecordsRaw,
      approvedLeaves,
      leavesAppliedToday,
      approvedToday,
      pendingLeaves,
      trendRecordsRaw,
      settings
    ] = await Promise.all([
      User.find({
        role: 'employee',
        status: 'active'
      }).populate('shift'),
      Attendance.find(dateQuery).populate({ path: 'user', populate: { path: 'shift' } }),
      Leave.find({
        status: 'Approved',
        startDate: { $lte: targetDate },
        endDate: { $gte: targetDate }
      }),
      Leave.countDocuments({
        createdAt: { $gte: startOfTargetDate, $lte: endOfTargetDate }
      }),
      Leave.countDocuments({
        status: 'Approved',
        createdAt: { $gte: startOfTargetDate, $lte: endOfTargetDate }
      }),
      Leave.countDocuments({ status: 'Pending' }),
      Attendance.find({
        date: { $gte: sDate, $lte: eDate }
      }).populate({ path: 'user', populate: { path: 'shift' } }),
      CompanySetting.findOne()
    ]);

    const attendanceRecords = attendanceRecordsRaw.map(a => {
      const record = a.toObject();
      return {
        ...record,
        workingHours: statsService.calculateWorkingHours(record),
        status: statsService.resolveStatus(record, record.user)
      };
    });

    const trendRecords = trendRecordsRaw.map(a => {
      const record = a.toObject();
      return {
        ...record,
        status: statsService.resolveStatus(record, record.user)
      };
    });

    // In-memory aggregates for department stats
    const deptMap = {};
    attendanceRecords.forEach(a => {
      if (a.user && ['Present', 'Late', 'Half Day'].includes(a.status)) {
        const dept = a.user.department || 'Other';
        deptMap[dept] = (deptMap[dept] || 0) + 1;
      }
    });
    const departmentStats = Object.keys(deptMap).map(name => ({
      name,
      value: deptMap[name]
    }));

    // In-memory aggregates for trend data
    const trendMapTemp = {};
    trendRecords.forEach(a => {
      if (a.user && ['Present', 'Late', 'Half Day'].includes(a.status)) {
        const dateStr = new Date(a.date).toISOString().split('T')[0];
        trendMapTemp[dateStr] = (trendMapTemp[dateStr] || 0) + 1;
      }
    });
    const trendData = Object.keys(trendMapTemp).map(dateStr => ({
      _id: dateStr,
      count: trendMapTemp[dateStr]
    }));

    // Count as absent today if they haven't checked in, aren't on leave, and it's not a holiday/weekly off
    const Holiday = require('../models/Holiday');
    const targetDateStart = new Date(targetDate); targetDateStart.setUTCHours(0, 0, 0, 0);
    const targetDateEnd = new Date(targetDate); targetDateEnd.setUTCHours(23, 59, 59, 999);
    const isHoliday = await Holiday.findOne({ holiday_date: { $gte: targetDateStart, $lte: targetDateEnd }, status: 'active' });

    let presentToday = 0;
    let onLeaveToday = 0;
    let absentToday = 0;
    let totalEmployees = 0;

    // Count all approved leaves for the day (any type)
    let approvedLeavesToday = approvedLeaves.length;

    // For current day, if no one has punched in, set present, absent, leave counts to 0, but show total employees
    const isCurrentDay = isTargetToday;
    const anyPunchIn = attendanceRecords.some(a => ['Present', 'Late', 'Half Day', 'Absent'].includes(a.status));

    activeEmployees.forEach(user => {
      const empId = user._id.toString();
      const joined = new Date(user.joiningDate || user.createdAt);
      joined.setUTCHours(0, 0, 0, 0);
      if (joined > endOfTargetDate) {
        return; // joined in future, skip completely
      }
      totalEmployees++;
      if (isCurrentDay && !anyPunchIn) {
        // For current day, before any punch in, skip counting present/absent/leave
        return;
      }

      // Check if user has an attendance record on this target date
      const userAtt = attendanceRecords.find(a => a.user && (a.user._id || a.user).toString() === empId);

      // Check if on leave (any approved leave)
      const isOnLeave = approvedLeaves.some(l => l.user && l.user.toString() === empId);

      if (userAtt && ['Present', 'Late', 'Half Day'].includes(userAtt.status)) {
        presentToday++;
      } else if (isOnLeave) {
        onLeaveToday++;
      } else if (userAtt && userAtt.status === 'Absent') {
        absentToday++;
      } else {
        // No punch-in record (or has an empty/absent record where they didn't punch in)
        // Check if we should count them as Absent or skip them
        const dayName = targetDate.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
        const isWeekOff = (settings?.weeklyOffs || ['Sunday']).includes(dayName);
        if (isWeekOff || isHoliday) {
          // Sunday or Holiday -> skip, not counted in any stats
        } else {
          // Check if day is ended
          let isDayEnded = false;
          if (endOfTargetDate < now) {
            isDayEnded = true;
          } else {
            if (istNow.hour >= 23) {
              isDayEnded = true;
            }
          }

          if (isDayEnded) {
            absentToday++;
          } else {
            // Day has not ended yet -> skipped, do not count in any stats
          }
        }
      }
    });

    // Map trend data into the expected format for the last X days
    const attendanceTrend = [];
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const trendMap = trendData.reduce((acc, curr) => {
      acc[curr._id] = curr.count;
      return acc;
    }, {});

    for (let i = diffDays - 1; i >= 0; i--) {
      const date = new Date(eDate);
      date.setUTCDate(date.getUTCDate() - i);
      const dateStr = date.toISOString().split('T')[0];

      attendanceTrend.push({
        name: diffDays > 7 ? `${date.getUTCDate()}/${date.getUTCMonth() + 1}` : dayNames[date.getUTCDay()],
        attendance: trendMap[dateStr] || 0
      });
    }

    res.json({
      success: true,
      data: {
        totalEmployees,
        presentToday,
        onLeaveToday,
        absentToday,
        pendingLeaves,
        leavesAppliedToday,
        approvedToday,
        approvedLeavesToday, // all approved leaves for the day (any type)
        attendanceRate: totalEmployees > 0
          ? ((presentToday / (totalEmployees * diffDays)) * 100).toFixed(2) : 0,
        departmentStats,
        attendanceTrend
      }
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────
// GET /api/reports/my-stats
// ─────────────────────────────────────────────────────────────
exports.getEmployeeStats = async (req, res) => {
  try {
    const userId = req.user.id;
    const { startDate, endDate } = req.query;
    const now = new Date();
    const defaultStart = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
    const defaultEnd = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59));

    const result = await statsService.getEmployeeFullStats(
      userId,
      startDate || defaultStart,
      endDate || defaultEnd
    );

    res.json({
      success: true,
      data: {
        ...result.stats,
        currentWorkingHours: result.currentWorkingHours,
        currentBreakMinutes: result.currentBreakMinutes,
        currentDistanceKm: result.currentDistanceKm,
        visitsCount: result.stats.visitsCount || 0,
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────
// GET /api/reports/employee-stats/:userId
// ─────────────────────────────────────────────────────────────
// GET /api/reports/employee-stats/:userId
exports.getAdminEmployeeStats = async (req, res) => {
  try {
    const { userId } = req.params;
    const { startDate, endDate } = req.query;
    const result = await statsService.getEmployeeFullStats(userId, startDate, endDate);
    res.json({
      success: true,
      data: {
        ...result.stats,
        currentWorkingHours: result.currentWorkingHours,
        currentBreakMinutes: result.currentBreakMinutes,
        currentDistanceKm: result.currentDistanceKm,
        visitsCount: result.stats.visitsCount || 0,
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────
// GET /api/reports/tracking
// ─────────────────────────────────────────────────────────────
exports.getTrackingStats = async (req, res) => {
  try {
    const targetDate = req.query.date ? parseUTCDate(req.query.date) : todayUTC();
    
    const [allEmployees, attendanceRaw, onLeaveUsers, settings] = await Promise.all([
      User.find({ role: 'employee' }).populate('shift'),
      Attendance.find({ date: targetDate })
        .select({ trackingLogs: { $slice: -1 } })
        .populate({
          path: 'user',
          select: 'name email department mobile designation profileImage isOnline createdAt shift',
          populate: { path: 'shift' }
        }),
      Leave.find({
        status: 'Approved',
        startDate: { $lte: targetDate },
        endDate: { $gte: targetDate }
      }).distinct('user'),
      CompanySetting.findOne()
    ]);

    const attendance = attendanceRaw.map(a => {
      const record = a.toObject();
      return {
        ...record,
        workingHours: statsService.calculateWorkingHours(record),
        status: statsService.resolveStatus(record, record.user)
      };
    });

    const presentUserIds = new Set(
      attendance
        .filter(a => ['Present', 'Late', 'Half Day'].includes(a.status))
        .map(a => a.user?._id?.toString())
    );
    const absentUserIds = new Set(
      attendance
        .filter(a => a.status === 'Absent')
        .map(a => a.user?._id?.toString())
    );

    const onLeaveUserIdsSet = new Set(onLeaveUsers.map(id => id.toString()));

    const now = new Date();
    const istNow = getISTDateComponents(now);
    const todayStr = `${istNow.year}-${String(istNow.month + 1).padStart(2, '0')}-${String(istNow.date).padStart(2, '0')}`;
    const isToday = targetDate.toISOString().split('T')[0] === todayStr;
    const Holiday = require('../models/Holiday');
    const targetDateStart = new Date(targetDate); targetDateStart.setUTCHours(0, 0, 0, 0);
    const targetDateEnd = new Date(targetDate); targetDateEnd.setUTCHours(23, 59, 59, 999);
    const isHoliday = await Holiday.findOne({ holiday_date: { $gte: targetDateStart, $lte: targetDateEnd }, status: 'active' });

    let presentCount = 0;
    let onLeaveCount = 0;
    let absentCount = 0;
    let neutralCount = 0;

    allEmployees.forEach(user => {
      const empId = user._id.toString();

      const joined = new Date(user.joiningDate || user.createdAt);
      joined.setUTCHours(0, 0, 0, 0);
      if (joined > targetDate) return;

      if (presentUserIds.has(empId)) {
        presentCount++;
      } else if (onLeaveUserIdsSet.has(empId)) {
        onLeaveCount++;
      } else if (absentUserIds.has(empId)) {
        absentCount++;
      } else {
        const userCreated = new Date(user.createdAt);
        userCreated.setUTCHours(0, 0, 0, 0);

        const dayName = targetDate.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
        const isWeekOff = (settings?.weeklyOffs || ['Sunday']).includes(dayName);

        let isNeutral = false;
        if (isWeekOff || isHoliday) {
          isNeutral = true;
        } else if (userCreated.getTime() === targetDate.getTime()) {
          isNeutral = true;
        } else if (isToday) {
          const isEndOfDay = istNow.hour >= 23;
          if (!isEndOfDay) {
            isNeutral = true;
          } else if (user.shift) {
            const [eH, eM] = user.shift.endTime.split(':').map(Number);
            const [sH, sM] = user.shift.startTime.split(':').map(Number);
            let shiftEnd = createDateFromIST(istNow.year, istNow.month, istNow.date, eH, eM, 0, 0);
            if (eH < sH || (eH === sH && eM < sM)) {
              shiftEnd = new Date(shiftEnd.getTime() + 24 * 60 * 60 * 1000);
            }
            if (now < shiftEnd) {
              isNeutral = true;
            }
          }
        }

        if (isNeutral) {
          neutralCount++;
        } else {
          absentCount++;
        }
      }
    });

    const totalActiveCount = presentCount + onLeaveCount + absentCount + neutralCount;
    const onlineCount = await User.countDocuments({ role: 'employee', isOnline: true });
    const offlineCount = Math.max(0, totalActiveCount - onlineCount);

    const outsideCount = attendance.filter(a => a.isOutside || a.punchIn?.isOutside || a.punchOut?.isOutside).length;
    const insideCount = Math.max(0, presentCount - outsideCount);

    const employeesData = attendance
      .filter(att => att.user)
      .map(att => {
        const latestLog = att.trackingLogs?.length > 0
          ? att.trackingLogs[att.trackingLogs.length - 1]
          : null;

        return {
          id: att._id,
          user: att.user,
          punchInTime: att.punchIn?.time || null,
          lastKnownLocation: latestLog ? {
            address: latestLog.address || 'Address not found',
            time: latestLog.time,
            latitude: latestLog.latitude,
            longitude: latestLog.longitude
          } : {
            address: att.punchIn?.location?.address || 'No location data',
            time: att.punchIn?.time || att.date,
            latitude: att.punchIn?.location?.latitude,
            longitude: att.punchIn?.location?.longitude
          },
          distance: parseFloat((att.totalDistance || att.distance || 0).toFixed(2)),
          workingHours: statsService.calculateWorkingHours(att),
          status: att.user.isOnline ? 'online' : 'offline',
          attendanceStatus: att.status,
          isOutside: !!(att.isOutside || att.punchIn?.isOutside || att.punchOut?.isOutside)
        };
      })
      // Sort: online first, then by punch-in time (most recent first)
      .sort((a, b) => {
        if (a.status === 'online' && b.status !== 'online') return -1;
        if (b.status === 'online' && a.status !== 'online') return 1;
        const tA = a.punchInTime ? new Date(a.punchInTime).getTime() : 0;
        const tB = b.punchInTime ? new Date(b.punchInTime).getTime() : 0;
        return tB - tA;
      });

    res.json({
      success: true,
      data: {
        stats: {
          total: totalActiveCount,
          connectivity: { online: onlineCount, offline: offlineCount },
          presence: { present: presentCount, absent: absentCount, onLeave: onLeaveCount, neutral: neutralCount },
          geofence: { inside: insideCount, outside: outsideCount }
        },
        employees: employeesData,
        weeklyOffs: settings?.weeklyOffs || ['Sunday']
      }
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────
// GET /api/reports/attendance-dashboard
// ─────────────────────────────────────────────────────────────
exports.getAttendanceDashboard = async (req, res) => {
  try {
    const { date, startDate, endDate } = req.query;
    let dateQuery = {};
    let targetDate;
    if (startDate && endDate) {
      dateQuery = { date: { $gte: parseUTCDate(startDate), $lte: parseUTCDate(endDate) } };
      targetDate = parseUTCDate(endDate);
    } else {
      targetDate = date ? parseUTCDate(date) : todayUTC();
      dateQuery = { date: targetDate };
    }

    const Holiday = require('../models/Holiday');
    const holidays = await Holiday.find({ status: 'active' });
    const holidayDatesSet = new Set(
      holidays.map(h => new Date(h.holiday_date).toISOString().split('T')[0])
    );

    const sDate = startDate ? parseUTCDate(startDate) : (date ? parseUTCDate(date) : todayUTC());
    const eDate = endDate ? parseUTCDate(endDate) : sDate;

    const allEmployees = await User.find({ role: 'employee' }).populate('shift');
    const attendanceRaw = await Attendance.find(dateQuery).populate({
      path: 'user',
      select: 'name department createdAt shift',
      populate: { path: 'shift' }
    });

    const attendance = attendanceRaw.map(a => {
      const record = a.toObject();
      return {
        ...record,
        workingHours: statsService.calculateWorkingHours(record),
        status: statsService.resolveStatus(record, record.user)
      };
    });

    const [approvedLeaves, settings] = await Promise.all([
      Leave.find({
        status: 'Approved',
        $or: [
          { startDate: { $lte: targetDate }, endDate: { $gte: parseUTCDate(startDate) || targetDate } }
        ]
      }).populate('user'),
      CompanySetting.findOne()
    ]);

    let presentCount = 0;
    let onLeaveCount = 0;
    let absentCount = 0;
    let upcomingShiftCount = 0;
    let totalExpectedAttendance = 0;

    const now = new Date();
    const istNow = getISTDateComponents(now);
    const todayStr = `${istNow.year}-${String(istNow.month + 1).padStart(2, '0')}-${String(istNow.date).padStart(2, '0')}`;

    let tempDate = new Date(sDate);
    while (tempDate <= eDate) {
      const dateStr = tempDate.toISOString().split('T')[0];
      const dayName = tempDate.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
      const isSunday = (settings?.weeklyOffs || ['Sunday']).includes(dayName);
      const isHoliday = holidayDatesSet.has(dateStr);

      const dayMidnight = new Date(tempDate);
      dayMidnight.setUTCHours(23, 59, 59, 999);
      const dayStart = new Date(tempDate);
      dayStart.setUTCHours(0, 0, 0, 0);

      // Get present and absent users on this specific date
      const dayAttendance = attendance.filter(a => a.date.toISOString().split('T')[0] === dateStr);
      const presentUserIds = new Set(
        dayAttendance
          .filter(a => ['Present', 'Late', 'Half Day'].includes(a.status))
          .map(a => a.user?._id?.toString())
      );
      const absentUserIds = new Set(
        dayAttendance
          .filter(a => a.status === 'Absent')
          .map(a => a.user?._id?.toString())
      );

      // Get leave users on this specific date
      const activeLeaves = approvedLeaves.filter(leave => {
        if (!leave.user) return false;
        const joined = new Date(leave.user.joiningDate || leave.user.createdAt);
        joined.setUTCHours(0, 0, 0, 0);
        if (joined > dayMidnight) return false;

        const leaveStart = new Date(leave.startDate);
        leaveStart.setUTCHours(0, 0, 0, 0);
        const leaveEnd = new Date(leave.endDate);
        leaveEnd.setUTCHours(23, 59, 59, 999);

        return dayStart >= leaveStart && dayMidnight <= leaveEnd;
      });
      const leaveUserIds = new Set(activeLeaves.map(l => l.user?._id?.toString()));

      allEmployees.forEach(user => {
        const empId = user._id.toString();

        const joined = new Date(user.joiningDate || user.createdAt);
        joined.setUTCHours(0, 0, 0, 0);
        if (joined > dayMidnight) return;

        totalExpectedAttendance++;

        if (presentUserIds.has(empId)) {
          presentCount++;
        } else if (leaveUserIds.has(empId)) {
          onLeaveCount++;
        } else if (absentUserIds.has(empId)) {
          absentCount++;
        } else {
          const userCreated = new Date(user.createdAt);
          userCreated.setUTCHours(0, 0, 0, 0);

          let isUpcoming = false;
          if (isSunday || isHoliday) {
            isUpcoming = true;
          } else if (userCreated.getTime() === dayStart.getTime()) {
            isUpcoming = true;
          } else if (dateStr === todayStr) {
            const isEndOfDay = istNow.hour >= 23;
            if (!isEndOfDay) {
              isUpcoming = true;
            } else if (user.shift) {
              const [eH, eM] = user.shift.endTime.split(':').map(Number);
              const [sH, sM] = user.shift.startTime.split(':').map(Number);
              let shiftEnd = createDateFromIST(istNow.year, istNow.month, istNow.date, eH, eM, 0, 0);
              if (eH < sH || (eH === sH && eM < sM)) {
                shiftEnd = new Date(shiftEnd.getTime() + 24 * 60 * 60 * 1000);
              }
              if (now < shiftEnd) {
                isUpcoming = true;
              }
            }
          } else if (dayStart > now) {
            isUpcoming = true;
          }

          if (isUpcoming) {
            upcomingShiftCount++;
          } else {
            absentCount++;
          }
        }
      });

      tempDate.setUTCDate(tempDate.getUTCDate() + 1);
    }

    const getStatsByField = async (field, isRef = false) => {
      let groups;
      if (isRef) {
        const allShifts = await Shift.find();
        groups = allShifts.map(s => ({ _id: s._id, name: s.name }));
      } else {
        const distinctValues = await User.distinct(field, { role: 'employee' });
        groups = distinctValues.map(v => ({ _id: v, name: v || 'Other' }));
      }

      return Promise.all(groups.map(async (group) => {
        const query = { role: 'employee' };
        query[field] = group._id;
        const groupEmployees = await User.find(query).populate('shift');
        const groupEmployeeIds = groupEmployees.map(e => e._id.toString());
        const groupAttendance = attendance.filter(a => groupEmployeeIds.includes(a.user?._id?.toString()));
        const groupLate = groupAttendance.filter(a => a.status === 'Late').length;
        const groupDeviators = groupAttendance.filter(a => a.isOutside || a.punchIn?.isOutside || a.punchOut?.isOutside).length;

        let groupExpectedAttendance = 0;
        let groupPresent = 0;
        let groupOnLeave = 0;
        let groupAbsent = 0;
        let groupUpcomingShift = 0;

        let tempDate = new Date(sDate);
        while (tempDate <= eDate) {
          const dateStr = tempDate.toISOString().split('T')[0];
          const dayName = tempDate.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
          const isSunday = (settings?.weeklyOffs || ['Sunday']).includes(dayName);
          const isHoliday = holidayDatesSet.has(dateStr);

          const dayMidnight = new Date(tempDate);
          dayMidnight.setUTCHours(23, 59, 59, 999);
          const dayStart = new Date(tempDate);
          dayStart.setUTCHours(0, 0, 0, 0);

          const dayAttendance = groupAttendance.filter(a => a.date.toISOString().split('T')[0] === dateStr);
          const presentUserIds = new Set(
            dayAttendance
              .filter(a => ['Present', 'Late', 'Half Day'].includes(a.status))
              .map(a => a.user?._id?.toString())
          );
          const absentUserIds = new Set(
            dayAttendance
              .filter(a => a.status === 'Absent')
              .map(a => a.user?._id?.toString())
          );

          const activeLeaves = approvedLeaves.filter(leave => {
            if (!leave.user || !groupEmployeeIds.includes(leave.user._id.toString())) return false;
            const joined = new Date(leave.user.joiningDate || leave.user.createdAt);
            joined.setUTCHours(0, 0, 0, 0);
            if (joined > dayMidnight) return false;

            const leaveStart = new Date(leave.startDate);
            leaveStart.setUTCHours(0, 0, 0, 0);
            const leaveEnd = new Date(leave.endDate);
            leaveEnd.setUTCHours(23, 59, 59, 999);

            return dayStart >= leaveStart && dayMidnight <= leaveEnd;
          });
          const leaveUserIds = new Set(activeLeaves.map(l => l.user?._id?.toString()));

          groupEmployees.forEach(emp => {
            const empId = emp._id.toString();

            const joined = new Date(emp.joiningDate || emp.createdAt);
            joined.setUTCHours(0, 0, 0, 0);
            if (joined > dayMidnight) return;

            groupExpectedAttendance++;

            if (presentUserIds.has(empId)) {
              groupPresent++;
            } else if (leaveUserIds.has(empId)) {
              groupOnLeave++;
            } else if (absentUserIds.has(empId)) {
              groupAbsent++;
            } else {
              const userCreated = new Date(emp.createdAt);
              userCreated.setUTCHours(0, 0, 0, 0);

              let isUpcoming = false;
              if (isSunday || isHoliday) {
                isUpcoming = true;
              } else if (userCreated.getTime() === dayStart.getTime()) {
                isUpcoming = true;
              } else if (dateStr === todayStr) {
                const isEndOfDay = istNow.hour >= 23;
                if (!isEndOfDay) {
                  isUpcoming = true;
                } else if (emp.shift) {
                  const [eH, eM] = emp.shift.endTime.split(':').map(Number);
                  const [sH, sM] = emp.shift.startTime.split(':').map(Number);
                  let shiftEnd = createDateFromIST(istNow.year, istNow.month, istNow.date, eH, eM, 0, 0);
                  if (eH < sH || (eH === sH && eM < sM)) {
                    shiftEnd = new Date(shiftEnd.getTime() + 24 * 60 * 60 * 1000);
                  }
                  if (now < shiftEnd) {
                    isUpcoming = true;
                  }
                }
              } else if (dayStart > now) {
                isUpcoming = true;
              }

              if (isUpcoming) {
                groupUpcomingShift++;
              } else {
                groupAbsent++;
              }
            }
          });

          tempDate.setUTCDate(tempDate.getUTCDate() + 1);
        }

        return {
          name: group.name,
          total: groupExpectedAttendance,
          present: groupPresent,
          absent: Math.max(0, groupAbsent),
          onLeave: groupOnLeave,
          upcomingShift: groupUpcomingShift,
          lateComers: groupLate,
          earlyLeavers: 0,
          deviators: groupDeviators,
          avgWorkingHours: groupPresent > 0
            ? groupAttendance.reduce((acc, a) => acc + statsService.calculateWorkingHours(a), 0) / groupPresent
            : 0
        };
      }));
    };

    const departmentStats = await getStatsByField('department');
    const shiftStats = await getStatsByField('shift', true);

    res.json({
      success: true,
      data: {
        attendanceDetails: { present: presentCount, absent: absentCount, onLeave: onLeaveCount, upcomingShift: upcomingShiftCount, total: totalExpectedAttendance },
        departmentStats,
        shiftStats,
        weeklyOffs: settings?.weeklyOffs || ['Sunday']
      }
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────
// GET /api/reports/employee-reports
// ─────────────────────────────────────────────────────────────
exports.getEmployeeReports = async (req, res) => {
  try {
    const { date, startDate, endDate, search = '' } = req.query;
    let dateQuery = {};
    if (startDate && endDate) {
      dateQuery = { date: { $gte: parseUTCDate(startDate), $lte: parseUTCDate(endDate) } };
    } else {
      const targetDate = date ? parseUTCDate(date) : todayUTC();
      dateQuery = { date: targetDate };
    }

    const attendance = await Attendance.find(dateQuery).populate({
      path: 'user',
      select: 'name email mobile department designation shift profileImage',
      populate: { path: 'shift' }
    });

    let reportData = attendance.map(a => {
      if (!a.user) return null;
      const record = a.toObject();
      const hrs = statsService.calculateWorkingHours(record);
      const breakMins = statsService.calculateBreakMinutes(record);
      const resolvedStatus = statsService.resolveStatus(record, record.user);
      return {
        id: record._id, userId: record.user._id, name: record.user.name, mobile: record.user.mobile,
        profileImage: record.user.profileImage,
        department: record.user.department, designation: record.user.designation,
        shift: record.user.shift ? `${record.user.shift.name} (${record.user.shift.startTime} - ${record.user.shift.endTime})` : 'NA',
        date: record.date,
        timeIn: record.punchIn?.time,
        timeInLocation: record.punchIn?.location?.address,
        timeInSelfie: record.punchIn?.selfie,
        timeInOutside: record.punchIn?.isOutside || false,
        timeOut: record.punchOut?.time,
        timeOutLocation: record.punchOut?.location?.address,
        timeOutSelfie: record.punchOut?.selfie,
        timeOutOutside: record.punchOut?.isOutside || false,
        totalHoursWorked: hrs, status: resolvedStatus,
        breaks: record.breaks || [],
        breaksTaken: record.breaks?.length || 0,
        totalBreakTime: breakMins
      };
    }).filter(item => item !== null)
      // Sort by punch-in time: most recent first so latest attendees appear at the top
      .sort((a, b) => {
        const tA = a.timeIn ? new Date(a.timeIn).getTime() : 0;
        const tB = b.timeIn ? new Date(b.timeIn).getTime() : 0;
        return tB - tA;
      });

    if (search) {
      reportData = reportData.filter(item =>
        item.name.toLowerCase().includes(search.toLowerCase()) || (item.mobile || '').includes(search)
      );
    }

    const settings = await CompanySetting.findOne();
    res.json({
      success: true,
      count: reportData.length,
      data: reportData,
      weeklyOffs: settings?.weeklyOffs || ['Sunday']
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────
// GET /api/reports/employee-details/:userId
// ─────────────────────────────────────────────────────────────
exports.getEmployeePersonalDetails = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const { userId } = req.params;
    const result = await statsService.getEmployeeFullStats(userId, startDate, endDate);
    const { user, stats } = result;
    const recordsRaw = await Attendance.find({ user: userId }).sort({ date: -1 });

    const settings = await CompanySetting.findOne();
    const leaves = await Leave.find({ user: userId, status: 'Approved' }).lean();

    const getISTDateString = (date) => {
      if (!date) return null;
      const d = new Date(date);
      if (isNaN(d.getTime())) return null;
      const istTime = new Date(d.getTime() + (5.5 * 60 * 60 * 1000));
      const year = istTime.getUTCFullYear();
      const month = String(istTime.getUTCMonth() + 1).padStart(2, '0');
      const day = String(istTime.getUTCDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    const getApprovedLeaveOnDate = (dateStr) => {
      return leaves.find(l => {
        const start = getISTDateString(l.startDate);
        const end = getISTDateString(l.endDate);
        return dateStr >= start && dateStr <= end;
      });
    };

    const start = new Date(startDate);
    const end = new Date(endDate);
    const now = new Date();
    const todayStr = getISTDateString(now);

    const Holiday = require('../models/Holiday');
    const holidays = await Holiday.find({
      holiday_date: { $gte: start, $lte: end },
      status: 'active'
    }).lean();

    const isHolidayOnDate = (dateStr) => {
      return holidays.some(h => getISTDateString(h.holiday_date) === dateStr);
    };

    const dateList = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = getISTDateString(d);
      const dayName = d.toLocaleDateString('en-US', { weekday: 'long' });
      if ((settings?.weeklyOffs || ['Sunday']).includes(dayName)) continue;

      const joinDate = new Date(user.joiningDate || user.createdAt);
      joinDate.setHours(0, 0, 0, 0);
      const checkD = new Date(d);
      checkD.setHours(0, 0, 0, 0);
      if (checkD < joinDate) continue;

      dateList.push(new Date(d));
    }

    const attendanceDetails = dateList.map(d => {
      const dateStr = getISTDateString(d);
      const record = recordsRaw.find(r => getISTDateString(r.date) === dateStr);

      if (record) {
        const recordObj = record.toObject();
        const hrs = statsService.calculateWorkingHours(recordObj);
        const dist = parseFloat((recordObj.distance || recordObj.totalDistance || 0).toFixed(2));
        const breakMins = statsService.calculateBreakMinutes(recordObj);

        let status = statsService.resolveStatus(recordObj, user);
        const leaveObj = getApprovedLeaveOnDate(dateStr);
        if (leaveObj) {
          status = leaveObj.duration === 'Half Day' ? 'Leave(Half)' : 'Leave';
        }

        return {
          id: recordObj._id,
          date: recordObj.date,
          status,
          punchIn: recordObj.punchIn,
          punchOut: recordObj.punchOut,
          workingHours: hrs,
          totalHoursWorked: hrs,
          distance: dist,
          totalDistance: dist,
          breaks: recordObj.breaks || [],
          totalBreakTime: breakMins
        };
      } else {
        const leaveObj = getApprovedLeaveOnDate(dateStr);
        let status = 'Absent';

        if (isHolidayOnDate(dateStr)) {
          status = 'Holiday';
        } else if (leaveObj) {
          status = leaveObj.duration === 'Half Day' ? 'Leave(Half)' : 'Leave';
        } else {
          const isToday = dateStr === todayStr;
          const isFuture = d > now;

          if (isFuture) {
            status = 'Neutral';
          } else if (isToday) {
            let isEndOfDay = now.getHours() >= 23;
            if (user.shift) {
              const [eH, eM] = user.shift.endTime.split(':').map(Number);
              const [sH, sM] = user.shift.startTime.split(':').map(Number);
              const nowIST = new Date(now.getTime() + (5.5 * 60 * 60 * 1000));
              const year = nowIST.getUTCFullYear();
              const month = nowIST.getUTCMonth();
              const date = nowIST.getUTCDate();
              const { createDateFromIST } = require('../utils/timezone');
              let shiftEnd = createDateFromIST(year, month, date, eH, eM, 0, 0);
              if (eH < sH || (eH === sH && eM < sM)) {
                shiftEnd = new Date(shiftEnd.getTime() + 24 * 60 * 60 * 1000);
              }
              if (now < shiftEnd) {
                status = 'Neutral';
              }
            } else if (!isEndOfDay) {
              status = 'Neutral';
            }
          }
        }

        return {
          id: `synthetic-${dateStr}`,
          date: new Date(d),
          status,
          punchIn: null,
          punchOut: null,
          workingHours: 0,
          totalHoursWorked: 0,
          distance: 0,
          totalDistance: 0,
          breaks: [],
          totalBreakTime: 0
        };
      }
    });

    attendanceDetails.sort((a, b) => new Date(b.date) - new Date(a.date));

    res.json({ success: true, data: { employee: user, summary: { ...stats, currentWorkingHours: result.currentWorkingHours, currentBreakMinutes: result.currentBreakMinutes, currentDistanceKm: result.currentDistanceKm }, attendanceDetails } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────
// GET /api/reports/track-details/:userId
// ─────────────────────────────────────────────────────────────
exports.getEmployeeTrackDetails = async (req, res) => {
  try {
    const { date } = req.query;
    const targetDate = date ? parseUTCDate(date) : todayUTC();
    const attendance = await Attendance.findOne({ user: req.params.userId, date: targetDate }).populate({
      path: 'user',
      select: 'name department designation shift battery signalStatus mobile profileImage',
      populate: { path: 'shift', select: 'name' }
    });
    if (!attendance) return res.json({ success: true, data: { exists: false, message: 'No tracking data' } });
    res.json({ success: true, data: { exists: true, employee: attendance.user, summary: { totalDistance: attendance.totalDistance || 0, workingHours: statsService.calculateWorkingHours(attendance), lastKnownLocation: attendance.trackingLogs?.length > 0 ? attendance.trackingLogs[attendance.trackingLogs.length - 1] : attendance.punchIn?.location }, logs: attendance.trackingLogs || [], punchIn: attendance.punchIn, punchOut: attendance.punchOut } });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────
// GET /api/reports/track-details-me
// ─────────────────────────────────────────────────────────────
exports.getEmployeeTrackDetailsMe = async (req, res) => {
  try {
    const { date } = req.query;
    const targetDate = date ? parseUTCDate(date) : todayUTC();
    const attendance = await Attendance.findOne({ user: req.user.id, date: targetDate });
    if (!attendance) return res.json({ success: true, data: { exists: false, message: 'No tracking data' } });
    res.json({ success: true, data: { exists: true, summary: { totalDistance: attendance.totalDistance || 0, workingHours: statsService.calculateWorkingHours(attendance) }, logs: attendance.trackingLogs || [], punchIn: attendance.punchIn, punchOut: attendance.punchOut } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
