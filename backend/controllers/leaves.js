const Leave = require('../models/Leave');
const User = require('../models/User');
const LeaveType = require('../models/LeaveType');
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
    const { leaveType, startDate, endDate, reason, duration, startTime, endTime } = req.body;

    // Find Leave Type
    const lt = await LeaveType.findOne({ name: leaveType, status: 'active' });
    if (!lt) {
      return res.status(404).json({ success: false, message: 'Leave type not found or inactive' });
    }

    const start = new Date(startDate);
    let filter = {
      user: userId,
      leaveType: leaveType,
      status: 'Approved'
    };

    if (lt.limitType === 'Monthly') {
      const startOfMonth = new Date(start.getFullYear(), start.getMonth(), 1);
      const endOfMonth = new Date(start.getFullYear(), start.getMonth() + 1, 0, 23, 59, 59);
      filter.startDate = { $gte: startOfMonth, $lte: endOfMonth };
    } else {
      const startOfYear = new Date(start.getFullYear(), 0, 1);
      const endOfYear = new Date(start.getFullYear(), 11, 31, 23, 59, 59, 999);
      filter.startDate = { $gte: startOfYear, $lte: endOfYear };
    }

    const approvedLeaves = await Leave.find(filter);
    const usedCount = approvedLeaves.reduce((acc, l) => acc + calculateLeaveDays(l), 0);

    if (usedCount >= lt.limit) {
      return res.status(400).json({
        success: false,
        message: `${leaveType} limit reached (Max ${lt.limit} per ${lt.limitType.toLowerCase()}).`
      });
    }

    // Removed redundant declaration

    const leave = await Leave.create({
      user: userId,
      leaveType,
      startDate,
      endDate: duration === 'Half Day' ? startDate : endDate,
      reason,
      duration,
      startTime: duration === 'Half Day' ? startTime : undefined,
      endTime: duration === 'Half Day' ? endTime : undefined,
      status: 'Pending' // Force pending on application
    });

    // Trigger notification to admin
    try {
      const notificationService = require('../services/notificationService');
      const io = req.app.get('io');
      await notificationService.createAndSendNotification({
        title: 'New Leave Request 📋',
        description: `Employee ${req.user.name} (${req.user.email}) has submitted a pending leave request for ${leaveType} (${duration}).`,
        type: 'general notification',
        frequency: 'Instant',
        targetType: 'Role-based Employees',
        targetRole: 'admin',
        isAuto: false
      }, io);
    } catch (e) {
      console.error('[Leave Request Alert] Failed to send admin notification:', e.message);
    }

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
    const leaves = await Leave.find({ user: req.user.id }).sort('-createdAt');
    const activeLeaveTypes = await LeaveType.find({ status: 'active' });

    const now = new Date();
    const quotas = activeLeaveTypes.map(lt => {
      let filter = { user: req.user.id, leaveType: lt.name, status: 'Approved' };
      if (lt.limitType === 'Monthly') {
        const som = new Date(now.getFullYear(), now.getMonth(), 1);
        const eom = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
        filter.startDate = { $gte: som, $lte: eom };
      } else {
        const soy = new Date(now.getFullYear(), 0, 1);
        const eoy = new Date(now.getFullYear(), 11, 31, 23, 59, 59);
        filter.startDate = { $gte: soy, $lte: eoy };
      }

      const usedCount = leaves
        .filter(l => l.leaveType === lt.name && l.status === 'Approved')
        // We filter by date locally to be accurate for this specific quota
        .filter(l => {
          const d = new Date(l.startDate);
          if (lt.limitType === 'Monthly') {
            return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
          }
          return d.getFullYear() === now.getFullYear();
        })
        .reduce((acc, l) => acc + calculateLeaveDays(l), 0);

      return {
        name: lt.name,
        code: lt.code,
        limit: lt.limit,
        limitType: lt.limitType,
        used: usedCount,
        balance: Math.max(0, lt.limit - usedCount)
      };
    });

    res.status(200).json({
      success: true,
      count: leaves.length,
      quotas,
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
      filter.startDate = { $lte: end };
      filter.endDate = { $gte: start };
    }

    const allLeaves = await Leave.find(filter)
      .populate('user', 'name email department profileImage designation')
      .sort('-createdAt')
      .lean();

    const now = new Date();
    const leaves = allLeaves
      .filter(l => l.user) // Filter out leaves with missing/deleted users (orphans)
      .map(l => {
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
    const { status, adminNote } = req.body;

    if (status) leave.status = status;
    if (adminNote) leave.adminNote = adminNote;

    await leave.save();

    // If newly approved, decrement user's leave balance
    if (req.body.status === 'Approved' && oldStatus !== 'Approved') {

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

    // Hook in automated notifications
    try {
      const autoNotif = require('../services/autoNotificationService');
      const io = req.app.get('io');
      if (status === 'Approved') {
        autoNotif.triggerLeaveApproved(leave.user, leave.leaveType, io);
      }
    } catch (e) {
      console.error('Leave status update notification hook failed:', e);
    }
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

    const { leaveType, startDate, endDate, reason, duration, startTime, endTime } = req.body;
    const updateData = {};
    if (leaveType) updateData.leaveType = leaveType;
    if (startDate) updateData.startDate = startDate;
    if (endDate) updateData.endDate = duration === 'Half Day' ? (startDate || leave.startDate) : endDate;
    if (reason) updateData.reason = reason;
    if (duration) updateData.duration = duration;
    
    if (duration === 'Half Day') {
      updateData.startTime = startTime;
      updateData.endTime = endTime;
    } else if (duration === 'Full Day') {
      updateData.startTime = null;
      updateData.endTime = null;
    }

    const updated = await Leave.findByIdAndUpdate(req.params.id, updateData, { new: true, runValidators: true });
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
      filter.$or = [
        { startDate: { $lte: end }, endDate: { $gte: start } },
        { status: 'Pending' }
      ];
    }

    const employees = await User.find({ role: 'employee' }).select('name designation department profileImage leaveBalance monthlyLeaveLimit');
    const employeeIds = new Set(employees.map(emp => emp._id.toString()));
    const allLeaves = (await Leave.find(filter).lean()).filter(l => l.user && employeeIds.has(l.user.toString()));
    const activeLeaveTypes = await LeaveType.find({ status: 'active' }).lean();

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
        halfDays: empLeaves.filter(l => l.status === 'Approved' && l.duration === 'Half Day').length,
        fullDays: empLeaves.filter(l => l.status === 'Approved' && l.duration === 'Full Day').length,
        leaveTypes: {}
      };

      // Calculate availed leaves for each dynamic leave type
      activeLeaveTypes.forEach(lt => {
        const typeLeaves = empLeaves.filter(l => l.status === 'Approved' && l.leaveType === lt.name);
        stats.leaveTypes[lt.code] = {
          total: lt.limit,
          limitType: lt.limitType,
          availed: typeLeaves.reduce((acc, l) => acc + calculateLeaveDays(l), 0),
          fullCount: typeLeaves.filter(l => l.duration === 'Full Day').length,
          halfCount: typeLeaves.filter(l => l.duration === 'Half Day').length
        };
      });

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
      leaveTypes: activeLeaveTypes,
      summary: {
        pending: finalLeaves.filter(l => l.status === 'Pending').length,
        approved: finalLeaves.filter(l => l.status === 'Approved').length,
        rejected: finalLeaves.filter(l => l.status === 'Rejected').length,
        cancelled: finalLeaves.filter(l => l.status === 'Cancelled').length,
        totalFullDays: finalLeaves.filter(l => l.status === 'Approved' && l.duration === 'Full Day').length,
        totalHalfDays: finalLeaves.filter(l => l.status === 'Approved' && l.duration === 'Half Day').length
      }
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};
