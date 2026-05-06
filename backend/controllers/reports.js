const Attendance = require('../models/Attendance');
const User = require('../models/User');

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
    } catch (e) {}

    // Department counts
    const departmentStats = await User.aggregate([
      { $match: { role: 'employee' } },
      { $group: { _id: '$department', count: { $sum: 1 } } }
    ]);

    res.status(200).json({
      success: true,
      data: {
        totalEmployees,
        presentToday,
        lateToday,
        pendingLeaves,
        attendanceRate: totalEmployees > 0 ? ((presentToday / totalEmployees) * 100).toFixed(2) : 0,
        departmentStats: departmentStats.map(d => ({ name: d._id || 'Other', value: d.count }))
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
    const userId = req.user.id;
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();
    
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);

    // 1. Days Present this month
    const presentDays = await Attendance.countDocuments({
      user: userId,
      date: { $gte: startDate, $lte: endDate },
      status: { $in: ['Present', 'Late'] }
    });

    // 2. Late counts this month
    const lateDays = await Attendance.countDocuments({
      user: userId,
      date: { $gte: startDate, $lte: endDate },
      status: 'Late'
    });

    // 3. Approved Leaves this month
    const Leave = require('../models/Leave');
    const approvedLeaves = await Leave.countDocuments({
      user: userId,
      status: 'Approved',
      startDate: { $gte: startDate },
      endDate: { $lte: endDate }
    });

    // 4. User data for balance
    const user = await User.findById(userId);

    res.status(200).json({
      success: true,
      data: {
        presentDays,
        lateDays,
        approvedLeaves,
        leaveBalance: user.leaveBalance,
        monthlyLimit: user.monthlyLeaveLimit
      }
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};
