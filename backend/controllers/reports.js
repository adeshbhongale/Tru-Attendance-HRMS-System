/**
 * Reports Controller
 * ─────────────────────────────────────────────────────────────
 * SINGLE SOURCE OF TRUTH — All statistics are calculated by
 * employeeStatsService. No business logic lives in this file.
 */

const Attendance = require('../models/Attendance');
const User       = require('../models/User');
const Leave      = require('../models/Leave');
const Shift      = require('../models/Shift');
const statsService = require('../services/employeeStatsService');

// ─────────────────────────────────────────────────────────────
// Helper – build a UTC-midnight Date from a YYYY-MM-DD string
// ─────────────────────────────────────────────────────────────
const parseUTCDate = (str) => {
  if (!str) return null;
  const [y, m, d] = str.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};

const todayUTC = () => {
  const n = new Date();
  return new Date(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()));
};

// ─────────────────────────────────────────────────────────────
// GET /api/reports/daily
// ─────────────────────────────────────────────────────────────
exports.getDailyReport = async (req, res) => {
  try {
    const targetDate = req.query.date ? parseUTCDate(req.query.date) : todayUTC();
    const attendance = await Attendance.find({ date: targetDate })
      .populate('user', 'name email department');

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
    const endDate   = new Date(year, month, 0);

    const attendance = await Attendance.find({
      date: { $gte: startDate, $lte: endDate }
    }).populate('user', 'name email department');

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
    const targetDate    = req.query.date ? parseUTCDate(req.query.date) : todayUTC();
    const totalEmployees = await User.countDocuments({ role: 'employee' });
    const presentToday  = await Attendance.countDocuments({ date: targetDate });
    const lateToday     = await Attendance.countDocuments({ date: targetDate, status: 'Late' });
    const pendingLeaves = await Leave.countDocuments({ status: 'Pending' });

    // Department attendance breakdown
    const departmentStats = await Attendance.aggregate([
      { $match: { date: targetDate } },
      { $lookup: { from: 'users', localField: 'user', foreignField: '_id', as: 'userInfo' } },
      { $unwind: '$userInfo' },
      { $group: { _id: '$userInfo.department', count: { $sum: 1 } } }
    ]);

    // 7-day trend
    const attendanceTrend = [];
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    for (let i = 6; i >= 0; i--) {
      const date       = new Date(targetDate);
      date.setDate(date.getDate() - i);
      const startOfDay = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
      const endOfDay   = new Date(startOfDay);
      endOfDay.setUTCDate(endOfDay.getUTCDate() + 1);

      const dayAttendance = await Attendance.countDocuments({
        date: { $gte: startOfDay, $lt: endOfDay }
      });
      attendanceTrend.push({ name: dayNames[date.getDay()], attendance: dayAttendance });
    }

    res.json({
      success: true,
      data: {
        totalEmployees,
        presentToday,
        lateToday,
        pendingLeaves,
        attendanceRate: totalEmployees > 0
          ? ((presentToday / totalEmployees) * 100).toFixed(2) : 0,
        departmentStats: departmentStats.map(d => ({ name: d._id || 'Other', value: d.count })),
        attendanceTrend
      }
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────
// GET /api/reports/my-stats   (employee mobile app)
// SINGLE SOURCE OF TRUTH — uses employeeStatsService
// ─────────────────────────────────────────────────────────────
exports.getEmployeeStats = async (req, res) => {
  try {
    const userId = req.user.id;
    const { startDate, endDate } = req.query;

    // Default: current month
    const now = new Date();
    const defaultStart = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
    const defaultEnd   = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59));

    const result = await statsService.getEmployeeFullStats(
      userId,
      startDate || defaultStart,
      endDate   || defaultEnd
    );

    // Standardized response DTO consumed by BOTH mobile app & admin
    res.json({
      success: true,
      data: {
        ...result.stats,
        // Current-day fields (live values from backend)
        currentWorkingHours: result.currentWorkingHours,
        currentBreakMinutes: result.currentBreakMinutes,
        currentDistanceKm:   result.currentDistanceKm,
        // Shift info
        currentShift: result.user?.shift?.name || 'Not Assigned',
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────
// GET /api/reports/employee-stats/:userId   (admin — same service)
// SINGLE SOURCE OF TRUTH — identical service as mobile endpoint
// ─────────────────────────────────────────────────────────────
exports.getAdminEmployeeStats = async (req, res) => {
  try {
    const { userId }            = req.params;
    const { startDate, endDate } = req.query;

    const result = await statsService.getEmployeeFullStats(userId, startDate, endDate);

    // Validation check: compare with a fresh all-time calculation
    if (startDate && endDate) {
      const fullResult = await statsService.getEmployeeFullStats(userId);
      const fullStats  = fullResult.stats;
      const rangeStats = result.stats;

      if (rangeStats.workingDays > fullStats.workingDays) {
        console.warn(
          `[Reports] ⚠ Consistency alert for user ${userId}: ` +
          `range workingDays(${rangeStats.workingDays}) > alltime workingDays(${fullStats.workingDays})`
        );
      }
    }

    res.json({
      success: true,
      data: {
        ...result.stats,
        currentWorkingHours: result.currentWorkingHours,
        currentBreakMinutes: result.currentBreakMinutes,
        currentDistanceKm:   result.currentDistanceKm,
        currentShift:        result.user?.shift?.name || 'Not Assigned',
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────
// GET /api/reports/tracking   (admin tracking dashboard)
// ─────────────────────────────────────────────────────────────
exports.getTrackingStats = async (req, res) => {
  try {
    const targetDate     = req.query.date ? parseUTCDate(req.query.date) : todayUTC();
    const totalEmployees = await User.countDocuments({ role: 'employee' });
    const attendance     = await Attendance.find({ date: targetDate })
      .populate('user', 'name email department mobile designation profileImage isOnline');

    const presentCount = attendance.length;

    const onLeaveCount = await Leave.countDocuments({
      status: 'Approved',
      startDate: { $lte: targetDate },
      endDate:   { $gte: targetDate }
    });

    const absentCount = Math.max(0, totalEmployees - presentCount - onLeaveCount);

    const employeesData = attendance
      .filter(att => att.user)
      .map(att => {
        const latestLog = att.trackingLogs?.length > 0
          ? att.trackingLogs[att.trackingLogs.length - 1]
          : null;

        return {
          id:   att._id,
          user: att.user,
          lastKnownLocation: latestLog ? {
            address:   latestLog.address || 'Address not found',
            time:      latestLog.time,
            latitude:  latestLog.latitude,
            longitude: latestLog.longitude
          } : {
            address:   att.punchIn?.location?.address || 'No location data',
            time:      att.punchIn?.time || att.date,
            latitude:  att.punchIn?.location?.latitude,
            longitude: att.punchIn?.location?.longitude
          },
          // Standardized field: prioritize totalDistance (live) then distance (final)
          distance: parseFloat((att.totalDistance || att.distance || 0).toFixed(2)),
          workingHours:     statsService.calculateWorkingHours(att),
          status:           att.user.isOnline ? 'online' : 'offline',
          attendanceStatus: att.status
        };
      });

    res.json({
      success: true,
      data: {
        stats: {
          total:       totalEmployees,
          tracking:    { enabled: totalEmployees, disabled: 0 },
          presence:    { present: presentCount, absent: absentCount, onLeave: onLeaveCount },
          permissions: { granted: presentCount, denied: 0 }
        },
        employees: employeesData
      }
    });
  } catch (err) {
    console.error('getTrackingStats Error:', err);
    res.status(400).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────
// GET /api/reports/attendance-dashboard   (admin detail view)
// ─────────────────────────────────────────────────────────────
exports.getAttendanceDashboard = async (req, res) => {
  try {
    const targetDate     = req.query.date ? parseUTCDate(req.query.date) : todayUTC();
    const totalEmployees = await User.countDocuments({ role: 'employee' });
    const attendance     = await Attendance.find({ date: targetDate })
      .populate('user', 'name department');

    const onLeaveCount   = await Leave.countDocuments({
      status: 'Approved',
      startDate: { $lte: targetDate },
      endDate:   { $gte: targetDate }
    });

    const presentRecords = attendance.filter(a => ['Present', 'Late', 'Half Day'].includes(a.status));
    const presentCount   = presentRecords.length;
    const absentCount    = Math.max(0, totalEmployees - presentCount - onLeaveCount);

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
        const groupEmployees   = await User.find(query);
        const groupEmployeeIds = groupEmployees.map(e => e._id.toString());
        const groupAttendance  = attendance.filter(a => groupEmployeeIds.includes(a.user?._id?.toString()));
        const groupPresent     = groupAttendance.filter(a => ['Present', 'Late', 'Half Day'].includes(a.status)).length;
        const groupLate        = groupAttendance.filter(a => a.status === 'Late').length;
        const groupDeviators   = groupAttendance.filter(a => a.isOutside).length;

        const groupOnLeave = await Leave.countDocuments({
          user: { $in: groupEmployees.map(e => e._id) },
          status: 'Approved',
          startDate: { $lte: targetDate },
          endDate:   { $gte: targetDate }
        });

        return {
          name:          group.name,
          total:         groupEmployees.length,
          present:       groupPresent,
          absent:        Math.max(0, groupEmployees.length - groupPresent - groupOnLeave),
          onLeave:       groupOnLeave,
          upcomingShift: 0,
          lateComers:    groupLate,
          earlyLeavers:  0,
          deviators:     groupDeviators,
          avgWorkingHours: groupPresent > 0
            ? groupAttendance.reduce((acc, a) => acc + statsService.calculateWorkingHours(a), 0) / groupPresent
            : 0
        };
      }));
    };

    const departmentStats = await getStatsByField('department');
    const shiftStats      = await getStatsByField('shift', true);

    const totalUpcoming = departmentStats.reduce((acc, curr) => acc + curr.upcomingShift, 0);
    const finalAbsent = Math.max(0, totalEmployees - presentCount - onLeaveCount - totalUpcoming);

    res.json({
      success: true,
      data: {
        attendanceDetails: { present: presentCount, absent: finalAbsent, onLeave: onLeaveCount, upcomingShift: totalUpcoming, total: totalEmployees },
        departmentStats,
        shiftStats
      }
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────
// GET /api/reports/employee-reports   (admin timesheet/present table)
// ─────────────────────────────────────────────────────────────
exports.getEmployeeReports = async (req, res) => {
  try {
    const { date, search = '' } = req.query;
    const targetDate = date ? parseUTCDate(date) : todayUTC();

    const employees  = await User.find({ role: 'employee' })
      .select('name email mobile department designation shift profileImage')
      .populate('shift', 'name');

    const attendance = await Attendance.find({ date: targetDate });

    let filteredEmployees = employees;
    if (search) {
      filteredEmployees = employees.filter(e =>
        e.name.toLowerCase().includes(search.toLowerCase()) ||
        (e.mobile || '').includes(search)
      );
    }

    const reportData = await Promise.all(filteredEmployees.map(async (emp) => {
      const allRecords = await Attendance.find({ user: emp._id });
      const allLeaves  = await Leave.find({ user: emp._id, status: 'Approved' });
      // Career stats via canonical service
      const careerStats = statsService.getAggregatedStats(allRecords, emp, allLeaves);

      const a = attendance.find(att => att.user.toString() === emp._id.toString());

      if (!a) {
        return {
          id:                  `absent-${emp._id}`,
          userId:              emp._id,
          name:                emp.name,
          mobile:              emp.mobile,
          department:          emp.department,
          designation:         emp.designation,
          shift:               emp.shift?.name || 'NA',
          timeIn:              null,
          timeOut:             null,
          // ── Hour fields — all aliases so frontend reads never return undefined ──
          loggedHours:         0,
          workingHours:        0,
          totalHoursWorked:    0,   // Reports.jsx: row.totalHoursWorked
          breaksTaken:         0,
          totalBreakTime:      0,
          // ── Distance fields — all aliases ────────────────────────────────────
          distance:            0,
          totalDistance:       0,   // Reports.jsx: row.totalDistance
          careerTotalHours:    careerStats.totalWorkedHours,
          careerTotalDistance: careerStats.totalDistanceKm,
          profileImage:        emp.profileImage,
          status:              'Absent'
        };
      }

      const totalBreakTime  = statsService.calculateBreakMinutes(a);
      const computedWorkingHours = statsService.calculateWorkingHours(a);
      
      // ── Fallback logic: Use stored DB value if computation is 0 (prevents 0-value bugs)
      const dayWorkingHours = computedWorkingHours > 0 ? computedWorkingHours : (a.workingHours || 0);
      
      const computedDistKm = parseFloat((a.distance || a.totalDistance || 0).toFixed(2));
      const distKm = computedDistKm > 0 ? computedDistKm : (a.distance || a.totalDistance || 0);

      return {
        id:                  a._id,
        userId:              emp._id,
        name:                emp.name,
        mobile:              emp.mobile,
        department:          emp.department,
        designation:         emp.designation,
        shift:               emp.shift?.name || 'NA',
        timeIn:              a.punchIn?.time,
        timeInLocation:      a.punchIn?.location?.address,
        timeInSelfie:        a.punchIn?.selfie,
        timeInOutside:       a.punchIn?.isOutside,
        timeOut:             a.punchOut?.time,
        timeOutLocation:     a.punchOut?.location?.address,
        timeOutSelfie:       a.punchOut?.selfie,
        timeOutOutside:      a.punchOut?.isOutside,
        // ── Hour fields — all aliases so frontend reads never return undefined ──
        loggedHours:         dayWorkingHours,
        workingHours:        dayWorkingHours,
        totalHoursWorked:    dayWorkingHours,   // Reports.jsx: row.totalHoursWorked
        breaksTaken:         a.breaks?.length || 0,
        totalBreakTime:      totalBreakTime,
        breaks:              a.breaks || [],
        // ── Distance fields — all aliases ────────────────────────────────────
        distance:            distKm,
        totalDistance:       distKm,            // Reports.jsx: row.totalDistance
        careerTotalHours:    careerStats.totalWorkedHours,
        careerTotalDistance: careerStats.totalDistanceKm,
        profileImage:        emp.profileImage,
        status:              a.status
      };
    }));

    res.json({
      success: true,
      count: reportData.length,
      data: reportData,
      generatedOn: new Date().toISOString()
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────
// GET /api/reports/employee-details/:userId   (admin employee detail page)
// SINGLE SOURCE OF TRUTH — uses employeeStatsService
// ─────────────────────────────────────────────────────────────
exports.getEmployeePersonalDetails = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const { userId }             = req.params;

    const result = await statsService.getEmployeeFullStats(userId, startDate, endDate);
    const { user, stats, todayRecord } = result;

    // Build attendance history items using canonical working-hours formula
    let records = await require('../models/Attendance').find({ user: userId }).sort({ date: -1 });

    if (startDate && endDate) {
      records = records.filter(r => {
        const d = new Date(r.date);
        return d >= new Date(startDate) && d <= new Date(endDate);
      });
    }

    const attendanceDetails = records
      .filter(r => r.status !== 'Absent')
      .map(a => {
        const computedHrs  = statsService.calculateWorkingHours(a);
        const hrs = computedHrs > 0 ? computedHrs : (a.workingHours || 0);
        
        const computedDist = parseFloat((a.distance || a.totalDistance || 0).toFixed(2));
        const dist = computedDist > 0 ? computedDist : (a.distance || a.totalDistance || 0);

        return {
          id:           a._id,
          date:         a.date,
          status:       a.status,
          punchIn:      a.punchIn,
          punchOut:     a.punchOut,
          isOutside:    a.isOutside,
          breaks:       a.breaks,
          // ── Hour aliases ──
          workingHours:    hrs,
          loggedHours:     hrs,     // CSV alias
          totalHoursWorked: hrs,    // UI alias
          lateTime:        a.lateTime || 0,
          // ── Distance aliases ──
          distance:        dist,
          totalDistance:   dist,    // UI/CSV alias
        };
      });

    // Consistency validation
    const historyTotal = attendanceDetails.reduce((acc, r) => acc + r.workingHours, 0);
    if (stats.totalWorkedHours > 0 && Math.abs(historyTotal - stats.totalWorkedHours) > 1) {
      console.warn(
        `[Reports] ⚠ WorkedHours mismatch for user ${userId}: ` +
        `stats=${stats.totalWorkedHours} historySum=${historyTotal.toFixed(2)}`
      );
    }

    res.json({
      success: true,
      data: {
        employee:          user,
        summary:           {
          ...stats,
          // Current-day extras for admin detail view
          currentWorkingHours: result.currentWorkingHours,
          currentBreakMinutes: result.currentBreakMinutes,
          currentDistanceKm:   result.currentDistanceKm,
        },
        attendanceDetails,
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────
// GET /api/reports/track-details/:userId   (admin track route)
// ─────────────────────────────────────────────────────────────
exports.getEmployeeTrackDetails = async (req, res) => {
  try {
    const { date }   = req.query;
    const targetDate = date ? parseUTCDate(date) : todayUTC();

    const attendance = await Attendance.findOne({
      user: req.params.userId,
      date: targetDate
    }).populate({
      path: 'user',
      select: 'name department designation shift battery signalStatus mobile profileImage',
      populate: { path: 'shift', select: 'name' }
    });

    if (!attendance) {
      return res.json({ success: true, data: { exists: false, message: 'No tracking data for this date' } });
    }

    const { calculateDistance } = require('../utils/geofence');
    const logs = (attendance.trackingLogs || []).map((log, index) => {
      let distanceFromPrevious = 0;
      if (index > 0) {
        const prev = attendance.trackingLogs[index - 1];
        distanceFromPrevious = calculateDistance(log.latitude, log.longitude, prev.latitude, prev.longitude) * 1000;
      } else if (attendance.punchIn?.location) {
        distanceFromPrevious = calculateDistance(
          log.latitude, log.longitude,
          attendance.punchIn.location.latitude, attendance.punchIn.location.longitude
        ) * 1000;
      }
      return {
        ...(log.toObject ? log.toObject() : log),
        distanceFromPrevious: log.distanceFromPrevious || distanceFromPrevious
      };
    });

    res.json({
      success: true,
      data: {
        exists:   true,
        employee: attendance.user,
        summary: {
          // Standardized field: `distance` (km)
          distance:          parseFloat((attendance.distance || attendance.totalDistance || 0).toFixed(4)),
          workingHours:      statsService.calculateWorkingHours(attendance),
          lastKnownLocation: attendance.trackingLogs?.length > 0
            ? attendance.trackingLogs[attendance.trackingLogs.length - 1]
            : attendance.punchIn?.location
        },
        logs,
        punchIn:  attendance.punchIn,
        punchOut: attendance.punchOut
      }
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};
