const Attendance = require('../models/Attendance');
const User = require('../models/User');

// @desc    Get daily attendance report
// @route   GET /api/reports/daily
// @access  Private/Admin
exports.getDailyReport = async (req, res, next) => {
  try {
    const date = req.query.date ? new Date(req.query.date) : new Date();
    date.setHours(0, 0, 0, 0);

    const attendance = await Attendance.find({ date }).populate('user', 'name email department');
    
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
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const presentToday = await Attendance.countDocuments({ date: today });
    
    // For demo/simplicity, late today count
    const lateToday = await Attendance.countDocuments({ date: today, status: 'Late' });
    
    // Pending leaves (placeholder if Leave model exists)
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
