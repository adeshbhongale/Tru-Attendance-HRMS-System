const Leave = require('../models/Leave');

// @desc    Apply for leave
// @route   POST /api/leaves
// @access  Private
exports.applyLeave = async (req, res, next) => {
  try {
    const userId = req.user.id;
    
    // Check current month's leave count (Approved or Pending)
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const endOfMonth = new Date(startOfMonth);
    endOfMonth.setMonth(endOfMonth.getMonth() + 1);

    const monthlyCount = await Leave.countDocuments({
      user: userId,
      startDate: { $gte: startOfMonth, $lt: endOfMonth },
      status: { $in: ['Approved', 'Pending'] }
    });

    if (monthlyCount >= 5) {
      return res.status(400).json({ 
        success: false, 
        message: 'Monthly leave limit reached (Max 5 leaves per month).' 
      });
    }

    req.body.user = userId;
    const leave = await Leave.create(req.body);

    res.status(201).json({
      success: true,
      data: leave,
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    Get user leave history
// @route   GET /api/leaves/my-leaves
// @access  Private
exports.getMyLeaves = async (req, res, next) => {
  try {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const endOfMonth = new Date(startOfMonth);
    endOfMonth.setMonth(endOfMonth.getMonth() + 1);

    const leaves = await Leave.find({ user: req.user.id }).sort('-createdAt');
    
    const monthlyApprovedCount = await Leave.countDocuments({
      user: req.user.id,
      startDate: { $gte: startOfMonth, $lt: endOfMonth },
      status: { $in: ['Approved', 'Pending'] }
    });

    res.status(200).json({
      success: true,
      count: leaves.length,
      monthlyLimit: 5,
      monthlyUsed: monthlyApprovedCount,
      balance: Math.max(0, 5 - monthlyApprovedCount),
      data: leaves,
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    Get all leaves (Admin)
// @route   GET /api/leaves
// @access  Private/Admin
exports.getAllLeaves = async (req, res, next) => {
  try {
    const leaves = await Leave.find().populate('user', 'name email department').sort('-createdAt');
    res.status(200).json({
      success: true,
      count: leaves.length,
      data: leaves,
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    Update leave status (Admin)
// @route   PATCH /api/leaves/:id
// @access  Private/Admin
exports.updateLeaveStatus = async (req, res, next) => {
  try {
    console.log(`[LEAVES] Updating status for ID: ${req.params.id} to ${req.body.status}`);
    const leave = await Leave.findById(req.params.id);

    if (!leave) {
      console.log(`[LEAVES] Leave record not found for ID: ${req.params.id}`);
      return res.status(404).json({ success: false, message: `Leave record ${req.params.id} not found` });
    }

    const oldStatus = leave.status;
    leave.status = req.body.status;
    leave.adminNote = req.body.adminNote;
    await leave.save();

    // If newly approved, decrement user's leave balance
    if (req.body.status === 'Approved' && oldStatus !== 'Approved') {
      const User = require('../models/User');
      const user = await User.findById(leave.user);
      if (user) {
        user.leaveBalance = Math.max(0, user.leaveBalance - 1);
        await user.save();
      }
    }

    res.status(200).json({
      success: true,
      data: leave,
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};
