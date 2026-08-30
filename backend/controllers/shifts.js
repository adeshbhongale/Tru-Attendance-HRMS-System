// Shift Controller: Handles CRUD operations, employee assignments, and shift statistics.
const Shift = require('../models/Shift');
const User = require('../models/User');

// @desc    Get all shifts
// @route   GET /api/shifts
// @access  Private
exports.getShifts = async (req, res, next) => {
  try {
    const shifts = await Shift.find({ companyId: req.tenant.companyId });
    // Efficiently aggregate user counts per shift in a single query
    const stats = await User.aggregate([
      { $match: { role: 'employee', companyId: req.tenant.companyId } },
      { $group: { _id: '$shift', count: { $sum: 1 } } }
    ]);

    const statsMap = stats.reduce((acc, curr) => {
      if (curr._id) acc[curr._id.toString()] = curr.count;
      return acc;
    }, {});

    const shiftsWithStats = shifts.map(shift => ({
      ...shift.toObject(),
      assignedEmployees: statsMap[shift._id.toString()] || 0
    }));

    res.status(200).json({
      success: true,
      data: shiftsWithStats,
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    Create shift
// @route   POST /api/shifts
// @access  Private/Admin
exports.createShift = async (req, res, next) => {
  try {
    const shift = await Shift.create({ ...req.body, companyId: req.tenant.companyId });
    res.status(201).json({
      success: true,
      data: shift,
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    Update shift
// @route   PUT /api/shifts/:id
// @access  Private/Admin
exports.updateShift = async (req, res, next) => {
  try {
    const shift = await Shift.findOneAndUpdate({ _id: req.params.id, companyId: req.tenant.companyId }, req.body, {
      new: true,
      runValidators: true,
    });

    if (req.body.status === 'inactive') {
      const otherActiveShift = await Shift.findOne({ companyId: req.tenant.companyId, status: 'active', _id: { $ne: req.params.id } });
      if (otherActiveShift) {
        await User.updateMany({ companyId: req.tenant.companyId, shift: req.params.id }, { shift: otherActiveShift._id });
      } else {
        await User.updateMany({ companyId: req.tenant.companyId, shift: req.params.id }, { shift: null });
      }
    }

    // Trigger notification to assigned employees about shift timing update
    try {
      const assignedEmployees = await User.find({ companyId: req.tenant.companyId, shift: shift._id }).select('_id');
      if (assignedEmployees.length > 0) {
        const autoNotif = require('../services/autoNotificationService');
        const io = req.app.get('io');
        const timingStr = `${shift.name} (${shift.startTime} - ${shift.endTime})`;
        for (const emp of assignedEmployees) {
          await autoNotif.triggerShiftStartingReminder(emp._id, timingStr, io);
        }
      }
    } catch (notifErr) {
      console.error('Shift update notification error:', notifErr.message);
    }

    res.status(200).json({
      success: true,
      data: shift,
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    Delete shift
// @route   DELETE /api/shifts/:id
// @access  Private/Admin
exports.deleteShift = async (req, res, next) => {
  try {
    const assignedCount = await User.countDocuments({ companyId: req.tenant.companyId, shift: req.params.id });
    if (assignedCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete shift: ${assignedCount} employees are currently assigned to it.`
      });
    }

    await Shift.findOneAndDelete({ _id: req.params.id, companyId: req.tenant.companyId });
    res.status(200).json({
      success: true,
      data: {},
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    Assign shift to employees
// @route   POST /api/shifts/assign
// @access  Private/Admin
exports.assignShift = async (req, res, next) => {
  try {
    const { shiftId, userIds, department } = req.body;

    if (department) {
      await User.updateMany({ companyId: req.tenant.companyId, department }, { shift: shiftId });
    } else if (userIds && userIds.length > 0) {
      await User.updateMany({ companyId: req.tenant.companyId, _id: { $in: userIds } }, { shift: shiftId });
    } else {
      return res.status(400).json({ success: false, message: 'Please provide userIds or department' });
    }

    // Notify assigned employees
    try {
      const shift = await Shift.findById(shiftId);
      if (shift && userIds && userIds.length > 0) {
        const autoNotif = require('../services/autoNotificationService');
        const io = req.app.get('io');
        const timingStr = `${shift.name} (${shift.startTime} - ${shift.endTime})`;
        for (const uid of userIds) {
          await autoNotif.triggerShiftStartingReminder(uid, timingStr, io);
        }
      }
    } catch (assignNotifErr) {
      console.error('Assign shift notification error:', assignNotifErr.message);
    }

    res.status(200).json({
      success: true,
      message: 'Shift assigned successfully'
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};
