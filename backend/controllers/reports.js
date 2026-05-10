const Attendance = require('../models/Attendance');
const User = require('../models/User');
const statsService = require('../services/attendanceStatsService');

// @desc    Get daily attendance report
// @route   GET /api/reports/daily
// @access  Private/Admin
exports.getDailyReport = async (req, res, next) => {
  try {
    let targetDate;
    if (req.query.date) {
      const [year, month, day] = req.query.date.split('-').map(Number);
      targetDate = new Date(Date.UTC(year, month - 1, day));
    } else {
      const now = new Date();
      targetDate = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    }

    const attendance = await Attendance.find({ date: targetDate }).populate('user', 'name email department');

    res.status(200).json({
      success: true,
      count: attendance.length,
      data: attendance,
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    Get monthly attendance report
// @route   GET /api/reports/monthly
// @access  Private/Admin
exports.getMonthlyReport = async (req, res, next) => {
  try {
    const month = req.query.month; // 1-12
    const year = req.query.year;

    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);

    const attendance = await Attendance.find({
      date: { $gte: startDate, $lte: endDate }
    }).populate('user', 'name email department');

    res.status(200).json({
      success: true,
      count: attendance.length,
      data: attendance,
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    Get overall statistics
// @route   GET /api/reports/stats
// @access  Private/Admin
exports.getStats = async (req, res, next) => {
  try {
    const totalEmployees = await User.countDocuments({ role: 'employee' });

    let targetDate;
    if (req.query.date) {
      const [year, month, day] = req.query.date.split('-').map(Number);
      targetDate = new Date(Date.UTC(year, month - 1, day));
    } else {
      const now = new Date();
      targetDate = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    }

    const presentToday = await Attendance.countDocuments({ date: targetDate });

    // Late count for the target date
    const lateToday = await Attendance.countDocuments({ date: targetDate, status: 'Late' });

    // Pending leaves (Total pending, not necessarily date-bound, but we could filter if needed)
    let pendingLeaves = 0;
    try {
      const Leave = require('../models/Leave');
      pendingLeaves = await Leave.countDocuments({ status: 'Pending' });
    } catch (e) { }

    // Department attendance counts for targetDate
    const departmentStats = await Attendance.aggregate([
      { $match: { date: targetDate } },
      {
        $lookup: {
          from: 'users',
          localField: 'user',
          foreignField: '_id',
          as: 'userInfo'
        }
      },
      { $unwind: '$userInfo' },
      {
        $group: {
          _id: '$userInfo.department',
          count: { $sum: 1 }
        }
      }
    ]);

    // Calculate weekly attendance trend (last 7 days)
    const attendanceTrend = [];
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    for (let i = 6; i >= 0; i--) {
      const date = new Date(targetDate);
      date.setDate(date.getDate() - i);
      const startOfDay = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
      const endOfDay = new Date(startOfDay);
      endOfDay.setUTCDate(endOfDay.getUTCDate() + 1);

      const dayAttendance = await Attendance.countDocuments({
        date: { $gte: startOfDay, $lt: endOfDay }
      });

      attendanceTrend.push({
        name: dayNames[date.getDay()],
        attendance: dayAttendance
      });
    }

    res.status(200).json({
      success: true,
      data: {
        totalEmployees,
        presentToday,
        lateToday,
        pendingLeaves,
        attendanceRate: totalEmployees > 0 ? ((presentToday / totalEmployees) * 100).toFixed(2) : 0,
        departmentStats: departmentStats.map(d => ({ name: d._id || 'Other', value: d.count })),
        attendanceTrend
      }
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    Get employee specific dashboard statistics
// @route   GET /api/reports/my-stats
// @access  Private
exports.getEmployeeStats = async (req, res, next) => {
  try {
    delete require.cache[require.resolve('../services/attendanceStatsService')];
    const statsService = require('../services/attendanceStatsService');
    const userId = req.user.id;
    const user = await User.findById(userId).populate('shift');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Default to current month
    const now = new Date();
    const startOfMonth = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
    const endOfMonth = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999));

    const records = await Attendance.find({ 
      user: userId,
      date: { $gte: startOfMonth, $lte: endOfMonth }
    });
    
    const Leave = require('../models/Leave');
    const allApprovedLeaves = await Leave.find({
      user: userId,
      status: 'Approved',
      $or: [
        { startDate: { $gte: startOfMonth, $lte: endOfMonth } },
        { endDate: { $gte: startOfMonth, $lte: endOfMonth } }
      ]
    });

    const stats = statsService.getAggregatedStats(records, user, allApprovedLeaves, startOfMonth, endOfMonth);

    res.status(200).json({
      success: true,
      data: stats
    });
  } catch (err) {
    next(err);
  }
};

function daysInMonth(month, year) {
  return new Date(year, month, 0).getDate();
}

// @desc    Get tracking dashboard statistics
// @route   GET /api/reports/tracking
// @access  Private/Admin
exports.getTrackingStats = async (req, res, next) => {
  try {
    let targetDate;
    if (req.query.date) {
      const [year, month, day] = req.query.date.split('-').map(Number);
      targetDate = new Date(Date.UTC(year, month - 1, day));
    } else {
      const now = new Date();
      targetDate = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    }

    const totalEmployees = await User.countDocuments({ role: 'employee' });
    const attendance = await Attendance.find({ date: targetDate }).populate('user', 'name email department mobile designation profileImage isOnline');
    
    const presentCount = attendance.length;
    
    const Leave = require('../models/Leave');
    const onLeaveCount = await Leave.countDocuments({
      status: 'Approved',
      startDate: { $lte: targetDate },
      endDate: { $gte: targetDate }
    });

    const absentCount = Math.max(0, totalEmployees - presentCount - onLeaveCount);

    // Mocking tracking info
    const employeesData = attendance
      .filter(att => att.user) // Ensure user is not null
      .map(att => {
        const latestLog = att.trackingLogs && att.trackingLogs.length > 0 
          ? att.trackingLogs[att.trackingLogs.length - 1] 
          : null;

        return {
          id: att._id,
          user: att.user,
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
          distance: att.distance || att.totalDistance || 0,
          workingHours: statsService.calculateWorkingHours(att),
          status: att.user.isOnline ? 'online' : 'offline',
          attendanceStatus: att.status
        };
      });

    res.status(200).json({
      success: true,
      data: {
        stats: {
          total: totalEmployees,
          tracking: { enabled: totalEmployees, disabled: 0 },
          presence: { present: presentCount, absent: absentCount, onLeave: onLeaveCount },
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

// @desc    Get detailed attendance dashboard stats
// @route   GET /api/reports/attendance-dashboard
// @access  Private/Admin
exports.getAttendanceDashboard = async (req, res, next) => {
  try {
    let targetDate;
    if (req.query.date) {
      const [year, month, day] = req.query.date.split('-').map(Number);
      targetDate = new Date(Date.UTC(year, month - 1, day));
    } else {
      const now = new Date();
      targetDate = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    }

    const totalEmployees = await User.countDocuments({ role: 'employee' });
    const attendance = await Attendance.find({ date: targetDate }).populate('user', 'name department');
    
    const Leave = require('../models/Leave');
    const onLeaveCount = await Leave.countDocuments({
      status: 'Approved',
      startDate: { $lte: targetDate },
      endDate: { $gte: targetDate }
    });

    const presentRecords = attendance.filter(a => ['Present', 'Late', 'Half Day'].includes(a.status));
    const presentCount = presentRecords.length;
    const absentCount = Math.max(0, totalEmployees - presentCount - onLeaveCount);

    // Helper function to get stats by field
    const getStatsByField = async (field, isRef = false) => {
      let groups;
      if (isRef) {
        // For Shift which is a reference
        const Shift = require('../models/Shift');
        const allShifts = await Shift.find();
        groups = allShifts.map(s => ({ _id: s._id, name: s.name }));
      } else {
        const distinctValues = await User.distinct(field, { role: 'employee' });
        groups = distinctValues.map(v => ({ _id: v, name: v || 'Other' }));
      }

      return await Promise.all(groups.map(async (group) => {
        const query = { role: 'employee' };
        query[field] = group._id;
        const groupEmployees = await User.find(query);
        const groupEmployeeIds = groupEmployees.map(e => e._id.toString());
        
        const groupAttendance = attendance.filter(a => groupEmployeeIds.includes(a.user?._id?.toString()));
        const groupPresent = groupAttendance.filter(a => ['Present', 'Late', 'Half Day'].includes(a.status)).length;
        const groupLate = groupAttendance.filter(a => a.status === 'Late').length;
        const groupDeviators = groupAttendance.filter(a => a.isOutside).length;
        
        const groupOnLeave = await Leave.countDocuments({
          user: { $in: groupEmployees.map(e => e._id) },
          status: 'Approved',
          startDate: { $lte: targetDate },
          endDate: { $gte: targetDate }
        });

        return {
          name: group.name,
          total: groupEmployees.length,
          present: groupPresent,
          absent: Math.max(0, groupEmployees.length - groupPresent - groupOnLeave),
          onLeave: groupOnLeave,
          upcomingShift: 0,
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

    res.status(200).json({
      success: true,
      data: {
        attendanceDetails: {
          present: presentCount,
          absent: absentCount,
          onLeave: onLeaveCount,
          upcomingShift: 0,
          total: totalEmployees
        },
        departmentStats,
        shiftStats
      }
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    Get detailed employee reports (Timesheet/Present)
// @route   GET /api/reports/employee-reports
// @access  Private/Admin
exports.getEmployeeReports = async (req, res, next) => {
  try {
    const { type, date, search = '' } = req.query;
    let targetDate;
    if (date) {
      const [year, month, day] = date.split('-').map(Number);
      targetDate = new Date(Date.UTC(year, month - 1, day));
    } else {
      const now = new Date();
      targetDate = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    }

    const employees = await User.find({ role: 'employee' }).select('name email mobile department designation shift profileImage').populate('shift', 'name');
    const attendance = await Attendance.find({ date: targetDate });
    
    // Filtering logic if search is provided
    let filteredEmployees = employees;
    if (search) {
      filteredEmployees = employees.filter(e => 
        e.name.toLowerCase().includes(search.toLowerCase()) || 
        e.mobile.includes(search)
      );
    }

    const Leave = require('../models/Leave');

    const reportData = await Promise.all(filteredEmployees.map(async (emp) => {
      // 1. Get ALL records for this employee to calculate career total
      const allRecords = await Attendance.find({ user: emp._id });
      const allLeaves = await Leave.find({ user: emp._id, status: 'Approved' });
      const careerStats = statsService.getAggregatedStats(allRecords, emp, allLeaves);

      // 2. Find record for targetDate
      const a = attendance.find(att => att.user.toString() === emp._id.toString());
      
      if (!a) {
        return {
          id: `absent-${emp._id}`,
          userId: emp._id,
          name: emp.name,
          mobile: emp.mobile,
          department: emp.department,
          designation: emp.designation,
          shift: emp.shift?.name || 'NA',
          timeIn: null,
          timeOut: null,
          loggedHours: 0,
          breaksTaken: 0,
          totalBreakTime: 0,
          totalHoursWorked: 0, // Daily hours
          careerTotalHours: careerStats.totalWorkedHours,
          careerTotalDistance: careerStats.totalDistanceKm,
          profileImage: emp.profileImage,
          totalDistance: 0,
          status: 'Absent'
        };
      }

      const totalBreakTime = a.breaks?.reduce((acc, b) => acc + (b.duration || 0), 0) || 0;
      const dayWorkingHours = statsService.calculateWorkingHours(a);

      return {
        id: a._id,
        userId: emp._id,
        name: emp.name,
        mobile: emp.mobile,
        department: emp.department,
        designation: emp.designation,
        shift: emp.shift?.name || 'NA',
        timeIn: a.punchIn?.time,
        timeInLocation: a.punchIn?.location?.address,
        timeInSelfie: a.punchIn?.selfie,
        timeInOutside: a.punchIn?.isOutside,
        timeOut: a.punchOut?.time,
        timeOutLocation: a.punchOut?.location?.address,
        timeOutSelfie: a.punchOut?.selfie,
        timeOutOutside: a.punchOut?.isOutside,
        loggedHours: dayWorkingHours,
        breaksTaken: a.breaks?.length || 0,
        totalBreakTime: totalBreakTime,
        breaks: a.breaks || [],
        totalHoursWorked: dayWorkingHours, // This is for the day
        careerTotalHours: careerStats.totalWorkedHours,
        careerTotalDistance: careerStats.totalDistanceKm,
        profileImage: emp.profileImage,
        totalDistance: a.distance || 0,
        status: a.status
      };
    }));

    res.status(200).json({
      success: true,
      count: reportData.length,
      data: reportData,
      generatedOn: new Date().toISOString()
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    Get individual employee personal details & history
// @route   GET /api/reports/employee-details/:userId
// @access  Private/Admin
exports.getEmployeePersonalDetails = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    const user = await User.findById(req.params.userId).select('-password').populate('shift');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const records = await Attendance.find({ user: user._id }).sort({ date: -1 });
    const Leave = require('../models/Leave');
    
    let leaveQuery = { user: user._id, status: 'Approved' };
    if (startDate && endDate) {
      leaveQuery.$or = [
        { startDate: { $gte: new Date(startDate), $lte: new Date(endDate) } },
        { endDate: { $gte: new Date(startDate), $lte: new Date(endDate) } }
      ];
    }
    const leaves = await Leave.find(leaveQuery);

    const stats = statsService.getAggregatedStats(records, user, leaves, startDate, endDate);

    res.status(200).json({
      success: true,
      data: {
        employee: user,
        summary: stats,
        attendanceDetails: records
          .filter(r => {
            if (!startDate || !endDate) return true;
            const d = new Date(r.date);
            return d >= new Date(startDate) && d <= new Date(endDate);
          })
          .map(a => {
            return {
              id: a._id,
              date: a.date,
              status: a.status,
              punchIn: a.punchIn,
              punchOut: a.punchOut,
              isOutside: a.isOutside,
              breaks: a.breaks,
              workingHours: statsService.calculateWorkingHours(a),
              lateTime: a.lateTime || 0,
              distance: a.distance || 0
            };
          })
      }
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Get individual employee track route/data
// @route   GET /api/reports/track-details/:userId
// @access  Private/Admin
exports.getEmployeeTrackDetails = async (req, res, next) => {
  try {
    const { date } = req.query;
    let targetDate;
    if (date) {
      const [year, month, day] = date.split('-').map(Number);
      targetDate = new Date(Date.UTC(year, month - 1, day));
    } else {
      const now = new Date();
      targetDate = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    }

    const attendance = await Attendance.findOne({ user: req.params.userId, date: targetDate }).populate({
      path: 'user',
      select: 'name department designation shift battery signalStatus mobile profileImage',
      populate: {
        path: 'shift',
        select: 'name'
      }
    });
    
    if (!attendance) {
      return res.status(200).json({
        success: true,
        data: {
          exists: false,
          message: 'No tracking data for this date'
        }
      });
    }

    const { calculateDistance } = require('../utils/geofence');
    const logs = (attendance.trackingLogs || []).map((log, index) => {
      let distanceFromPrevious = 0;
      if (index > 0) {
        const prev = attendance.trackingLogs[index - 1];
        distanceFromPrevious = calculateDistance(log.latitude, log.longitude, prev.latitude, prev.longitude) * 1000; // Convert to meters
      } else if (attendance.punchIn) {
        distanceFromPrevious = calculateDistance(log.latitude, log.longitude, attendance.punchIn.location.latitude, attendance.punchIn.location.longitude) * 1000;
      }
      return {
        ...(log.toObject ? log.toObject() : log),
        distanceFromPrevious: log.distanceFromPrevious || distanceFromPrevious
      };
    });

    res.status(200).json({
      success: true,
      data: {
        exists: true,
        employee: attendance.user,
        summary: {
          totalDistance: attendance.totalDistance || 0,
          lastKnownLocation: attendance.trackingLogs?.length > 0 ? attendance.trackingLogs[attendance.trackingLogs.length - 1] : attendance.punchIn?.location
        },
        logs,
        punchIn: attendance.punchIn,
        punchOut: attendance.punchOut
      }
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};
