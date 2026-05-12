const Leave = require('../models/Leave');
const User = require('../models/User');
// Helper to calculate total days for a leave record
const calculateLeaveDays = (leave) => {
  if (leave.duration === 'Half Day') return 0.5;
  const start = new Date(leave.startDate);
  const end = new Date(leave.endDate);
  const diffTime = Math.abs(end - start);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  return diffDays;
};

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
      status: 'Approved'
    });

    if (monthlyCount >= 3) {
      return res.status(400).json({
        success: false,
        message: 'Monthly leave limit reached (Max 3 leaves per month).'
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

    const monthlyLeaves = await Leave.find({
      user: req.user.id,
      startDate: { $gte: startOfMonth, $lt: endOfMonth },
      status: 'Approved'
    });

    const monthlyApprovedCount = monthlyLeaves.reduce((acc, l) => acc + calculateLeaveDays(l), 0);

    res.status(200).json({
      success: true,
      count: leaves.length,
      monthlyLimit: 3,
      monthlyUsed: monthlyApprovedCount,
      balance: Math.max(0, 3 - monthlyApprovedCount),
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
    const { startDate, endDate } = req.query;
    let filter = {};
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      const dateFilter = { $gte: start, $lte: end };
      filter.$or = [
        { createdAt: dateFilter },
        { appliedOn: dateFilter }
      ];
    }

    const allLeaves = await Leave.find(filter)
      .populate('user', 'name email department profileImage designation')
      .sort('-createdAt')
      .lean();

    const now = new Date();
    const leaves = allLeaves.map(l => {
      // Create a copy of the lean object
      const leaveData = { ...l };
      if (leaveData.status === 'Pending' && leaveData.startDate && new Date(leaveData.startDate) < now) {
        leaveData.status = 'Cancelled';
      }
      return leaveData;
    });

    res.status(200).json({
      success: true,
      count: leaves.length,
      data: leaves,
    });
  } catch (err) {
    console.error('GetAllLeaves Error:', err.message);
    res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    Update leave status (Admin)
// @route   PATCH /api/leaves/:id
// @access  Private/Admin
exports.updateLeaveStatus = async (req, res, next) => {
  try {
    const leave = await Leave.findById(req.params.id);

    if (!leave) {
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
        const leaveDays = calculateLeaveDays(leave);
        user.leaveBalance = Math.max(0, user.leaveBalance - leaveDays);
        await user.save();

        // Auto-cancel other pending requests for the same month if balance hits 0
        if (user.leaveBalance === 0) {
          const lDate = new Date(leave.startDate);
          const startOfMonth = new Date(lDate.getFullYear(), lDate.getMonth(), 1);
          const endOfMonth = new Date(lDate.getFullYear(), lDate.getMonth() + 1, 0);

          await Leave.updateMany({
            user: user._id,
            status: 'Pending',
            startDate: { $gte: startOfMonth, $lte: endOfMonth },
            _id: { $ne: leave._id }
          }, {
            status: 'Cancelled',
            adminNote: 'Auto-cancelled: Monthly leave limit reached.'
          });
        }
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

// @desc    Cancel my leave request (Employee)
// @route   PATCH /api/leaves/cancel/:id
// @access  Private
exports.cancelLeave = async (req, res, next) => {
  try {
    const leave = await Leave.findById(req.params.id);
    if (!leave) return res.status(404).json({ success: false, message: 'Leave not found' });
    if (leave.user.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(401).json({ success: false, message: 'Not authorized' });
    }
    leave.status = 'Cancelled';
    await leave.save();
    res.status(200).json({ success: true, data: leave });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    Update my leave request (Employee)
// @route   PUT /api/leaves/update/:id
// @access  Private
exports.updateLeave = async (req, res, next) => {
  try {
    const leave = await Leave.findById(req.params.id);
    if (!leave) return res.status(404).json({ success: false, message: 'Leave not found' });
    if (leave.user.toString() !== req.user.id) {
      return res.status(401).json({ success: false, message: 'Not authorized' });
    }
    if (leave.status !== 'Pending') {
      return res.status(400).json({ success: false, message: 'Can only update pending requests' });
    }

    const updated = await Leave.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    res.status(200).json({ success: true, data: updated });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};
// @desc    Get leave dashboard data (Admin)
// @route   GET /api/leaves/dashboard
// @access  Private/Admin
exports.getLeaveDashboard = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;

    let filter = {};
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      const dateFilter = { $gte: start, $lte: end };
      filter.$or = [
        { createdAt: dateFilter },
        { appliedOn: dateFilter }
      ];
    }

    const employees = await User.find({ role: 'employee' }).select('name designation department profileImage leaveBalance monthlyLeaveLimit');
    const allLeaves = await Leave.find(filter).lean();

    const dashboardData = employees.map(emp => {
      const empLeaves = allLeaves.filter(l => l.user.toString() === emp._id.toString()).map(l => {
        // Auto-cancel logic for dashboard data
        if (l.status === 'Pending' && new Date(l.startDate) < new Date()) {
          return { ...l, status: 'Cancelled' };
        }
        return l;
      });

      const stats = {
        pending: empLeaves.filter(l => l.status === 'Pending').length,
        approved: empLeaves.filter(l => l.status === 'Approved').length,
        rejected: empLeaves.filter(l => l.status === 'Rejected').length,
        cancelled: empLeaves.filter(l => l.status === 'Cancelled').length,

        casual: {
          total: 24,
          availed: empLeaves.filter(l => l.status === 'Approved' && l.leaveType === 'Casual Leave').reduce((acc, l) => acc + calculateLeaveDays(l), 0),
        },
        sick: {
          total: 24,
          availed: empLeaves.filter(l => l.status === 'Approved' && l.leaveType === 'Sick Leave').reduce((acc, l) => acc + calculateLeaveDays(l), 0),
        },
        paid: {
          total: 4,
          availed: empLeaves.filter(l => l.status === 'Approved' && l.leaveType === 'Paid Leave').reduce((acc, l) => acc + calculateLeaveDays(l), 0),
        },
        unpaid: {
          availed: empLeaves.filter(l => l.status === 'Approved' && l.leaveType === 'Unpaid Leave').reduce((acc, l) => acc + calculateLeaveDays(l), 0),
        },
        halfDays: empLeaves.filter(l => l.status === 'Approved' && l.duration === 'Half Day').length,
        fullDays: empLeaves.filter(l => l.status === 'Approved' && l.duration === 'Full Day').length,
      };

      return {
        _id: emp._id,
        name: emp.name,
        designation: emp.designation || 'N/A',
        department: emp.department || 'N/A',
        profileImage: emp.profileImage,
        stats
      };
    });

    // Recalculate summary with auto-cancel
    const finalLeaves = allLeaves.map(l => {
      if (l.status === 'Pending' && new Date(l.startDate) < new Date()) {
        return { ...l, status: 'Cancelled' };
      }
      return l;
    });

    res.status(200).json({
      success: true,
      data: dashboardData,
      summary: {
        pending: finalLeaves.filter(l => l.status === 'Pending').length,
        approved: finalLeaves.filter(l => l.status === 'Approved').length,
        rejected: finalLeaves.filter(l => l.status === 'Rejected').length,
        cancelled: finalLeaves.filter(l => l.status === 'Cancelled').length,
        unpaidApproved: finalLeaves.filter(l => l.status === 'Approved' && l.leaveType === 'Unpaid Leave').length,
        totalFullDays: finalLeaves.filter(l => l.status === 'Approved' && l.duration === 'Full Day').length,
        totalHalfDays: finalLeaves.filter(l => l.status === 'Approved' && l.duration === 'Half Day').length
      }
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};
