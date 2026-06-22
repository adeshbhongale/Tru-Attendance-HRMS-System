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
const { RawTrackingPoint, LiveEmployeeStatus } = require('../models/Tracking');

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

const getSingleDateRangeQuery = (targetDate) => {
  const start = new Date(targetDate.getTime() - 6 * 60 * 60 * 1000);
  const end = new Date(targetDate.getTime() + 6 * 60 * 60 * 1000);
  return { $gte: start, $lte: end };
};

const resolveMissingAddresses = (logs) => {
  if (!logs || logs.length === 0) return [];

  const resolvedLogs = logs.map(log => {
    const item = typeof log.toObject === 'function' ? log.toObject() : { ...log };
    return item;
  });

  for (let i = 0; i < resolvedLogs.length; i++) {
    const current = resolvedLogs[i];
    const isInvalid = !current.address || 
                      current.address === 'Address not resolved' || 
                      current.address === 'Live Tracking...' || 
                      current.address === 'Address not found';
    
    if (isInvalid) {
      let closestAddress = null;
      let minTimeDiff = Infinity;
      const currentLat = current.latitude || current.snappedLatitude || (current.location?.coordinates && current.location.coordinates[1]) || 0;
      const currentLng = current.longitude || current.snappedLongitude || (current.location?.coordinates && current.location.coordinates[0]) || 0;
      const currentTime = current.time || current.timestamp || current.processedTime;

      for (let j = 0; j < resolvedLogs.length; j++) {
        const candidate = resolvedLogs[j];
        const isValid = candidate.address && 
                        candidate.address !== 'Address not resolved' && 
                        candidate.address !== 'Live Tracking...' && 
                        candidate.address !== 'Address not found';

        if (isValid) {
          const candidateLat = candidate.latitude || candidate.snappedLatitude || (candidate.location?.coordinates && candidate.location.coordinates[1]) || 0;
          const candidateLng = candidate.longitude || candidate.snappedLongitude || (candidate.location?.coordinates && candidate.location.coordinates[0]) || 0;
          const candidateTime = candidate.time || candidate.timestamp || candidate.processedTime;

          const timeDiff = Math.abs(new Date(currentTime).getTime() - new Date(candidateTime).getTime());
          
          // Spatial check: approximate degree difference (0.009 degrees is ~1km)
          const latDiff = Math.abs(currentLat - candidateLat);
          const lngDiff = Math.abs(currentLng - candidateLng);
          const isNearby = latDiff < 0.009 && lngDiff < 0.009;

          if (isNearby && timeDiff < 600000) { // 10 minutes
            if (timeDiff < minTimeDiff) {
              minTimeDiff = timeDiff;
              closestAddress = candidate.address;
            }
          }
        }
      }

      if (closestAddress) {
        current.address = closestAddress;
      } else {
        current.address = `Location near ${currentLat.toFixed(6)}, ${currentLng.toFixed(6)}`;
      }
    }
  }

  return resolvedLogs;
};


// ─────────────────────────────────────────────────────────────
// GET /api/reports/daily
// ─────────────────────────────────────────────────────────────
exports.getDailyReport = async (req, res) => {
  try {
    const targetDate = req.query.date ? parseUTCDate(req.query.date) : todayUTC();
    const attendanceRaw = await Attendance.find({ date: getSingleDateRangeQuery(targetDate) })
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
      const start = new Date(parseUTCDate(startDate).getTime() - 6 * 60 * 60 * 1000);
      const end = new Date(parseUTCDate(endDate).getTime() + 6 * 60 * 60 * 1000);
      dateQuery = { date: { $gte: start, $lte: end } };
    } else {
      targetDate = date ? parseUTCDate(date) : todayUTC();
      dateQuery = { date: getSingleDateRangeQuery(targetDate) };
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
        date: {
          $gte: new Date(sDate.getTime() - 6 * 60 * 60 * 1000),
          $lte: new Date(eDate.getTime() + 6 * 60 * 60 * 1000)
        }
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
    
    // Auto-cleanup stale online users
    const nowTime = Date.now();
    const poorSignalCutoff = new Date(nowTime - 120000); // 2 minutes
    const offlineCutoff = new Date(nowTime - 300000); // 5 minutes

    // 1) Mark users who haven't updated in 5 minutes as 'offline'
    const staleOfflineUsers = await LiveEmployeeStatus.find({
      currentStatus: { $ne: 'offline' },
      lastUpdate: { $lt: offlineCutoff }
    });
    if (staleOfflineUsers.length > 0) {
      const offlineUserIds = staleOfflineUsers.map(u => u.userId);
      await User.updateMany({ _id: { $in: offlineUserIds } }, { isOnline: false });
      await LiveEmployeeStatus.updateMany(
        { userId: { $in: offlineUserIds } },
        { $set: { currentStatus: 'offline', trackingStatus: 'offline', signalQuality: 'lost' } }
      );
    }

    // 2) Mark users who haven't updated in 2 minutes (but less than 5 minutes) as 'poor signal'
    const stalePoorSignalUsers = await LiveEmployeeStatus.find({
      currentStatus: { $ne: 'poor signal' },
      lastUpdate: { $gte: offlineCutoff, $lt: poorSignalCutoff }
    });
    if (stalePoorSignalUsers.length > 0) {
      const poorSignalUserIds = stalePoorSignalUsers.map(u => u.userId);
      await LiveEmployeeStatus.updateMany(
        { userId: { $in: poorSignalUserIds } },
        { $set: { currentStatus: 'poor signal', signalQuality: 'weak' } }
      );
    }

    const [allEmployees, attendanceRaw, onLeaveUsers, settings, liveStatuses] = await Promise.all([
      User.find({ role: 'employee' }).populate('shift'),
      Attendance.find({ date: getSingleDateRangeQuery(targetDate) })
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
      CompanySetting.findOne(),
      LiveEmployeeStatus.find({})
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

        const liveStatus = liveStatuses.find(s => s.userId.toString() === att.user._id.toString());

        const logWithAddress = att.trackingLogs?.length > 0 
          ? [...att.trackingLogs].reverse().find(l => l.address) 
          : null;

        let resolvedAddress = (latestLog && latestLog.address && latestLog.address !== 'Address not resolved' && latestLog.address !== 'Live Tracking...')
          || (liveStatus && liveStatus.lastAddress && liveStatus.lastAddress !== 'Live Tracking...' && liveStatus.lastAddress !== 'Address not resolved')
          || (logWithAddress && logWithAddress.address && logWithAddress.address !== 'Address not resolved')
          || att.punchIn?.location?.address;

        if (!resolvedAddress || resolvedAddress === 'Address not found' || resolvedAddress === 'Address not resolved' || resolvedAddress === 'Live Tracking...') {
          if (latestLog) {
            resolvedAddress = `Location near ${latestLog.latitude.toFixed(6)}, ${latestLog.longitude.toFixed(6)}`;
          } else if (liveStatus && liveStatus.lastLocation?.coordinates) {
            resolvedAddress = `Location near ${liveStatus.lastLocation.coordinates[1].toFixed(6)}, ${liveStatus.lastLocation.coordinates[0].toFixed(6)}`;
          } else if (att.punchIn?.location?.latitude) {
            resolvedAddress = `Location near ${att.punchIn.location.latitude.toFixed(6)}, ${att.punchIn.location.longitude.toFixed(6)}`;
          } else {
            resolvedAddress = 'Address not resolved';
          }
        }


        // Calculate stops Count from trackingLogs as a fallback
        let stopsCount = 0;
        let idleStart = null;
        if (att.trackingLogs && att.trackingLogs.length > 0) {
          for (const log of att.trackingLogs) {
            const speedKmh = (log.speed || 0) * 3.6;
            if (speedKmh < 1) {
              if (!idleStart) idleStart = new Date(log.time);
            } else {
              if (idleStart) {
                const idleDuration = (new Date(log.time) - idleStart) / 60000;
                if (idleDuration >= 2) stopsCount++;
                idleStart = null;
              }
            }
          }
        }

        const finalStops = (liveStatus && liveStatus.stops > 0) ? liveStatus.stops : (stopsCount || 0);

        return {
          id: att._id,
          user: att.user,
          punchInTime: att.punchIn?.time || null,
          lastKnownLocation: latestLog ? {
            address: resolvedAddress,
            time: latestLog.time,
            latitude: latestLog.latitude,
            longitude: latestLog.longitude
          } : {
            address: resolvedAddress !== 'Address not found' ? resolvedAddress : (att.punchIn?.location?.address || 'No location data'),
            time: att.punchIn?.time || att.date,
            latitude: att.punchIn?.location?.latitude,
            longitude: att.punchIn?.location?.longitude
          },
          distance: parseFloat((att.totalDistance || att.distance || 0).toFixed(2)),
          workingHours: statsService.calculateWorkingHours(att),
          status: liveStatus ? liveStatus.currentStatus : (att.user.isOnline ? 'online' : 'offline'),
          attendanceStatus: att.status,
          isOutside: !!(att.isOutside || att.punchIn?.isOutside || att.punchOut?.isOutside),
          // Rich telemetry metadata from LiveEmployeeStatus
          currentSpeed: liveStatus ? parseFloat((liveStatus.currentSpeed * 3.6).toFixed(1)) : 0, // km/h
          batteryLevel: liveStatus?.batteryLevel || null,
          signalQuality: liveStatus?.signalQuality || 'strong',
          stops: finalStops,
          travelTime: liveStatus?.travelTime || 0,
          trackingStatus: liveStatus?.trackingStatus || 'offline',
          tripId: liveStatus?.tripId || null
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
          connectivity: {
            online: employeesData.filter(e => e.status === 'online').length,
            poorSignal: employeesData.filter(e => e.status === 'poor signal').length,
            offline: Math.max(0, totalActiveCount - employeesData.filter(e => e.status === 'online' || e.status === 'poor signal').length)
          },
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
      const start = new Date(parseUTCDate(startDate).getTime() - 6 * 60 * 60 * 1000);
      const end = new Date(parseUTCDate(endDate).getTime() + 6 * 60 * 60 * 1000);
      dateQuery = { date: { $gte: start, $lte: end } };
      targetDate = parseUTCDate(endDate);
    } else {
      targetDate = date ? parseUTCDate(date) : todayUTC();
      dateQuery = { date: getSingleDateRangeQuery(targetDate) };
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
      const start = new Date(parseUTCDate(startDate).getTime() - 6 * 60 * 60 * 1000);
      const end = new Date(parseUTCDate(endDate).getTime() + 6 * 60 * 60 * 1000);
      dateQuery = { date: { $gte: start, $lte: end } };
    } else {
      const targetDate = date ? parseUTCDate(date) : todayUTC();
      dateQuery = { date: getSingleDateRangeQuery(targetDate) };
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
    const { date, excludeLogs, onlyLogs } = req.query;
    const targetDate = date ? parseUTCDate(date) : todayUTC();
    const attendance = await Attendance.findOne({ user: req.params.userId, date: getSingleDateRangeQuery(targetDate) }).populate({
      path: 'user',
      select: 'name department designation shift battery signalStatus mobile profileImage',
      populate: { path: 'shift', select: 'name' }
    });
    const liveStatus = await LiveEmployeeStatus.findOne({ userId: req.params.userId });
    if (!attendance) return res.json({ success: true, data: { exists: false, message: 'No tracking data' } });

    if (onlyLogs === 'true') {
      return res.json({
        success: true,
        data: {
          exists: true,
          logs: resolveMissingAddresses(attendance.trackingLogs || [])
        }
      });
    }

    // Fetch RawTrackingPoints for high-fidelity path representation
    const startOfDay = new Date(targetDate);
    startOfDay.setUTCHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate);
    endOfDay.setUTCHours(23, 59, 59, 999);

    const rawPoints = await RawTrackingPoint.find({
      userId: req.params.userId,
      timestamp: { $gte: startOfDay, $lte: endOfDay },
      status: { $ne: 'suspicious' }
    }).sort('timestamp');

    const speeds = rawPoints.map(p => p.speed || 0).filter(s => s > 0);
    const avgSpeedMs = speeds.length > 0 ? speeds.reduce((a, b) => a + b, 0) / speeds.length : 0;
    const maxSpeedMs = speeds.length > 0 ? Math.max(...speeds) : 0;
    const avgSpeed = parseFloat((avgSpeedMs * 3.6).toFixed(1));
    const maxSpeed = parseFloat((maxSpeedMs * 3.6).toFixed(1));

    let stops = 0;
    let idleStart = null;
    for (const point of rawPoints) {
      const speedKmh = (point.speed || 0) * 3.6;
      if (speedKmh < 1) {
        if (!idleStart) idleStart = new Date(point.timestamp);
      } else {
        if (idleStart) {
          const idleDuration = (new Date(point.timestamp) - idleStart) / 60000;
          if (idleDuration >= 2) stops++;
          idleStart = null;
        }
      }
    }
    const provider = rawPoints.find(p => p.provider && p.provider !== 'none')?.provider || 'none';

    const rawPath = rawPoints.map(p => ({
      latitude: p.snappedLatitude || p.location.coordinates[1],
      longitude: p.snappedLongitude || p.location.coordinates[0],
      rawLatitude: p.rawLatitude || p.location.coordinates[1],
      rawLongitude: p.rawLongitude || p.location.coordinates[0],
      snappedLatitude: p.snappedLatitude || null,
      snappedLongitude: p.snappedLongitude || null,
      timestamp: p.timestamp,
      accuracy: p.accuracy,
      speed: p.speed,
      status: p.status,
      routeStatus: p.routeStatus || 'raw',
      provider: p.provider || 'none',
      isMock: p.isMock,
      address: p.address
    }));

    // Build separate snapped and raw routes
    const snappedRoute = rawPoints
      .map(p => ({
        latitude: p.snappedLatitude || p.rawLatitude || p.location.coordinates[1],
        longitude: p.snappedLongitude || p.rawLongitude || p.location.coordinates[0],
        timestamp: p.timestamp
      }))
      .filter(p => p.latitude !== undefined && p.longitude !== undefined && p.latitude !== null && p.longitude !== null);

    const routeReconstructService = require('../services/routeReconstructionService');
    let roadGeometry = [];
    let reconstructionSuccess = true;
    const pointsToReconstruct = snappedRoute.length >= 2 ? snappedRoute : rawPath;
    if (pointsToReconstruct && pointsToReconstruct.length >= 2) {
      try {
        const reconstruction = await routeReconstructService.reconstructRoute(pointsToReconstruct);
        roadGeometry = reconstruction.geometry || [];
        reconstructionSuccess = reconstruction.success;
      } catch (reconErr) {
        console.error('[Reports] Route reconstruction failed in track details:', reconErr.message);
        roadGeometry = pointsToReconstruct.map(p => ({
          latitude: p.latitude || p.lat,
          longitude: p.longitude || p.lng
        }));
        reconstructionSuccess = false;
      }
    }

    let lastKnownLocation = null;
    if (attendance.trackingLogs && attendance.trackingLogs.length > 0) {
      const mappedLogs = resolveMissingAddresses(attendance.trackingLogs);
      const logWithAddress = [...mappedLogs].reverse().find(l => l.address && l.address !== 'Live Tracking...' && l.address !== 'Address not resolved');
      const absoluteLastLog = mappedLogs[mappedLogs.length - 1];
      let addr = absoluteLastLog.address || logWithAddress?.address;
      if (!addr || addr === 'Live Tracking...' || addr === 'Address not resolved') {
        addr = `Location near ${absoluteLastLog.latitude.toFixed(6)}, ${absoluteLastLog.longitude.toFixed(6)}`;
      }
      lastKnownLocation = {
        time: absoluteLastLog.time,
        latitude: absoluteLastLog.latitude,
        longitude: absoluteLastLog.longitude,
        address: addr,
        speed: absoluteLastLog.speed,
        accuracy: absoluteLastLog.accuracy
      };
    } else {
      lastKnownLocation = attendance.punchIn?.location;
    }

    let employeeOffice = null;
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState === 1) {
      try {
        const Location = require('../models/Location');
        const User = require('../models/User');
        const userObj = await User.findById(req.params.userId).populate('workingPlace');
        employeeOffice = userObj?.workingPlace || (await Location.findOne({ name: 'Office Main' }) || await Location.findOne());
      } catch (dbErr) {
        console.error('[Reports] Failed to fetch employee office details:', dbErr.message);
      }
    }

    res.json({
      success: true,
      data: {
        exists: true,
        employee: attendance.user,
        office: employeeOffice,
        summary: {
          totalDistance: attendance.totalDistance || 0,
          workingHours: statsService.calculateWorkingHours(attendance),
          lastKnownLocation,
          avgSpeed,
          maxSpeed,
          stops,
          provider,
          currentStatus: liveStatus?.currentStatus || 'offline',
          signalQuality: liveStatus?.signalQuality || 'strong',
          batteryLevel: liveStatus?.batteryLevel || null
        },
        logs: excludeLogs === 'true' ? [] : resolveMissingAddresses(attendance.trackingLogs || []),
        rawPath: resolveMissingAddresses(rawPath),
        snappedRoute,
        roadGeometry,
        reconstructionSuccess,
        punchIn: attendance.punchIn,
        punchOut: attendance.punchOut
      }
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────
// GET /api/reports/track-details-me
// ─────────────────────────────────────────────────────────────
exports.getEmployeeTrackDetailsMe = async (req, res) => {
  try {
    const { date, excludeLogs, onlyLogs } = req.query;
    const targetDate = date ? parseUTCDate(date) : todayUTC();
    const attendance = await Attendance.findOne({ user: req.user.id, date: getSingleDateRangeQuery(targetDate) });
    const liveStatus = await LiveEmployeeStatus.findOne({ userId: req.user.id });
    if (!attendance) return res.json({ success: true, data: { exists: false, message: 'No tracking data' } });

    if (onlyLogs === 'true') {
      return res.json({
        success: true,
        data: {
          exists: true,
          logs: resolveMissingAddresses(attendance.trackingLogs || [])
        }
      });
    }

    const startOfDay = new Date(targetDate);
    startOfDay.setUTCHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate);
    endOfDay.setUTCHours(23, 59, 59, 999);

    const rawPoints = await RawTrackingPoint.find({
      userId: req.user.id,
      timestamp: { $gte: startOfDay, $lte: endOfDay },
      status: { $ne: 'suspicious' }
    }).sort('timestamp');

    const speeds = rawPoints.map(p => p.speed || 0).filter(s => s > 0);
    const avgSpeedMs = speeds.length > 0 ? speeds.reduce((a, b) => a + b, 0) / speeds.length : 0;
    const maxSpeedMs = speeds.length > 0 ? Math.max(...speeds) : 0;
    const avgSpeed = parseFloat((avgSpeedMs * 3.6).toFixed(1));
    const maxSpeed = parseFloat((maxSpeedMs * 3.6).toFixed(1));

    let stops = 0;
    let idleStart = null;
    for (const point of rawPoints) {
      const speedKmh = (point.speed || 0) * 3.6;
      if (speedKmh < 1) {
        if (!idleStart) idleStart = new Date(point.timestamp);
      } else {
        if (idleStart) {
          const idleDuration = (new Date(point.timestamp) - idleStart) / 60000;
          if (idleDuration >= 2) stops++;
          idleStart = null;
        }
      }
    }
    const provider = rawPoints.find(p => p.provider && p.provider !== 'none')?.provider || 'none';

    const rawPath = rawPoints.map(p => ({
      latitude: p.snappedLatitude || p.location.coordinates[1],
      longitude: p.snappedLongitude || p.location.coordinates[0],
      rawLatitude: p.rawLatitude || p.location.coordinates[1],
      rawLongitude: p.rawLongitude || p.location.coordinates[0],
      snappedLatitude: p.snappedLatitude || null,
      snappedLongitude: p.snappedLongitude || null,
      timestamp: p.timestamp,
      accuracy: p.accuracy,
      speed: p.speed,
      status: p.status,
      routeStatus: p.routeStatus || 'raw',
      provider: p.provider || 'none',
      isMock: p.isMock,
      address: p.address
    }));

    const snappedRoute = rawPoints
      .map(p => ({
        latitude: p.snappedLatitude || p.rawLatitude || p.location.coordinates[1],
        longitude: p.snappedLongitude || p.rawLongitude || p.location.coordinates[0],
        timestamp: p.timestamp
      }))
      .filter(p => p.latitude !== undefined && p.longitude !== undefined && p.latitude !== null && p.longitude !== null);

    const routeReconstructService = require('../services/routeReconstructionService');
    let roadGeometry = [];
    let reconstructionSuccess = true;
    const pointsToReconstruct = snappedRoute.length >= 2 ? snappedRoute : rawPath;
    if (pointsToReconstruct && pointsToReconstruct.length >= 2) {
      try {
        const reconstruction = await routeReconstructService.reconstructRoute(pointsToReconstruct);
        roadGeometry = reconstruction.geometry || [];
        reconstructionSuccess = reconstruction.success;
      } catch (reconErr) {
        console.error('[Reports] Route reconstruction failed in track details me:', reconErr.message);
        roadGeometry = pointsToReconstruct.map(p => ({
          latitude: p.latitude || p.lat,
          longitude: p.longitude || p.lng
        }));
        reconstructionSuccess = false;
      }
    }

    let lastKnownLocation = null;
    if (attendance.trackingLogs && attendance.trackingLogs.length > 0) {
      const mappedLogs = resolveMissingAddresses(attendance.trackingLogs);
      const logWithAddress = [...mappedLogs].reverse().find(l => l.address && l.address !== 'Live Tracking...' && l.address !== 'Address not resolved');
      const absoluteLastLog = mappedLogs[mappedLogs.length - 1];
      let addr = absoluteLastLog.address || logWithAddress?.address;
      if (!addr || addr === 'Live Tracking...' || addr === 'Address not resolved') {
        addr = `Location near ${absoluteLastLog.latitude.toFixed(6)}, ${absoluteLastLog.longitude.toFixed(6)}`;
      }
      lastKnownLocation = {
        time: absoluteLastLog.time,
        latitude: absoluteLastLog.latitude,
        longitude: absoluteLastLog.longitude,
        address: addr,
        speed: absoluteLastLog.speed,
        accuracy: absoluteLastLog.accuracy
      };
    } else {
      lastKnownLocation = attendance.punchIn?.location;
    }

    let employeeOffice = null;
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState === 1) {
      try {
        const Location = require('../models/Location');
        const User = require('../models/User');
        const userObj = await User.findById(req.user.id).populate('workingPlace');
        employeeOffice = userObj?.workingPlace || (await Location.findOne({ name: 'Office Main' }) || await Location.findOne());
      } catch (dbErr) {
        console.error('[Reports] Failed to fetch employee office details:', dbErr.message);
      }
    }

    res.json({
      success: true,
      data: {
        exists: true,
        office: employeeOffice,
        summary: {
          totalDistance: attendance.totalDistance || 0,
          workingHours: statsService.calculateWorkingHours(attendance),
          lastKnownLocation,
          avgSpeed,
          maxSpeed,
          stops,
          provider,
          currentStatus: liveStatus?.currentStatus || 'offline',
          signalQuality: liveStatus?.signalQuality || 'strong',
          batteryLevel: liveStatus?.batteryLevel || null
        },
        logs: excludeLogs === 'true' ? [] : resolveMissingAddresses(attendance.trackingLogs || []),
        rawPath: resolveMissingAddresses(rawPath),
        snappedRoute,
        roadGeometry,
        reconstructionSuccess,
        punchIn: attendance.punchIn,
        punchOut: attendance.punchOut
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────
// GET /api/reports/trips/:tripId — Route Playback
// ─────────────────────────────────────────────────────────────
exports.getTripDetails = async (req, res) => {
  try {
    const { tripId } = req.params;

    // Get all raw tracking points for this trip
    const rawPoints = await RawTrackingPoint.find({ tripId, status: { $ne: 'suspicious' } }).sort('timestamp');

    if (!rawPoints || rawPoints.length === 0) {
      return res.json({ success: true, data: { exists: false, message: 'No trip data found' } });
    }

    const firstPoint = rawPoints[0];
    const lastPoint = rawPoints[rawPoints.length - 1];

    // Build routes
    const rawRoute = rawPoints.map(p => ({
      latitude: p.rawLatitude || p.location.coordinates[1],
      longitude: p.rawLongitude || p.location.coordinates[0],
      timestamp: p.timestamp,
      speed: p.speed,
      accuracy: p.accuracy,
      status: p.status
    }));

    const snappedRoute = rawPoints
      .map(p => ({
        latitude: p.snappedLatitude || p.rawLatitude || p.location.coordinates[1],
        longitude: p.snappedLongitude || p.rawLongitude || p.location.coordinates[0],
        timestamp: p.timestamp,
        speed: p.speed
      }))
      .filter(p => p.latitude !== undefined && p.longitude !== undefined && p.latitude !== null && p.longitude !== null);

    // Calculate statistics
    const geoService = require('../services/geoTrackingService');
    const routeForDistance = snappedRoute.length >= 2 ? snappedRoute : rawRoute;
    const totalDistance = geoService.calculateTotalDistance(routeForDistance);

    const durationMs = new Date(lastPoint.timestamp) - new Date(firstPoint.timestamp);
    const durationMinutes = Math.round(durationMs / 60000);
    const hours = Math.floor(durationMinutes / 60);
    const minutes = durationMinutes % 60;

    const speeds = rawPoints.map(p => p.speed || 0).filter(s => s > 0);
    const avgSpeed = speeds.length > 0 ? speeds.reduce((a, b) => a + b, 0) / speeds.length : 0;
    const maxSpeed = speeds.length > 0 ? Math.max(...speeds) : 0;

    // Count stops (speed < 1 km/h for more than 2 minutes)
    let stops = 0;
    let idleStart = null;
    for (const point of rawPoints) {
      const speedKmh = (point.speed || 0) * 3.6;
      if (speedKmh < 1) {
        if (!idleStart) idleStart = new Date(point.timestamp);
      } else {
        if (idleStart) {
          const idleDuration = (new Date(point.timestamp) - idleStart) / 60000;
          if (idleDuration >= 2) stops++;
          idleStart = null;
        }
      }
    }

    const provider = rawPoints.find(p => p.provider && p.provider !== 'none')?.provider || 'none';

    const routeReconstructService = require('../services/routeReconstructionService');
    let roadGeometry = [];
    let reconstructionSuccess = true;
    const pointsToReconstruct = snappedRoute.length >= 2 ? snappedRoute : rawRoute;
    if (pointsToReconstruct && pointsToReconstruct.length >= 2) {
      try {
        const reconstruction = await routeReconstructService.reconstructRoute(pointsToReconstruct);
        roadGeometry = reconstruction.geometry || [];
        reconstructionSuccess = reconstruction.success;
      } catch (reconErr) {
        console.error('[Reports] Route reconstruction failed in trip details:', reconErr.message);
        roadGeometry = pointsToReconstruct.map(p => ({
          latitude: p.latitude || p.lat,
          longitude: p.longitude || p.lng
        }));
        reconstructionSuccess = false;
      }
    }

    res.json({
      success: true,
      data: {
        exists: true,
        tripId,
        startTime: firstPoint.timestamp,
        endTime: lastPoint.timestamp,
        startLocation: {
          latitude: firstPoint.rawLatitude || firstPoint.location.coordinates[1],
          longitude: firstPoint.rawLongitude || firstPoint.location.coordinates[0],
          address: firstPoint.address
        },
        endLocation: {
          latitude: lastPoint.rawLatitude || lastPoint.location.coordinates[1],
          longitude: lastPoint.rawLongitude || lastPoint.location.coordinates[0],
          address: lastPoint.address
        },
        rawRoute,
        snappedRoute,
        roadGeometry,
        reconstructionSuccess,
        totalDistance: parseFloat(totalDistance.toFixed(3)),
        duration: `${hours}h ${minutes}m`,
        durationMinutes,
        avgSpeed: parseFloat((avgSpeed * 3.6).toFixed(1)), // km/h
        maxSpeed: parseFloat((maxSpeed * 3.6).toFixed(1)), // km/h
        stops,
        totalPoints: rawPoints.length,
        snappedPoints: snappedRoute.length,
        provider
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
