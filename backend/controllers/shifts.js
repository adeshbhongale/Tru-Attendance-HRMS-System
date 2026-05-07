const Shift = require('../models/Shift');

// @desc    Get all shifts
// @route   GET /api/shifts
// @access  Private
exports.getShifts = async (req, res, next) => {
  try {
    let shifts = await Shift.find();
    
    // Seed default shifts if database is empty
    if (shifts.length === 0) {
      await Shift.create([
        { name: 'Day Shift', startTime: '09:00', endTime: '18:00', gracePeriod: 15, halfDayLimit: 4 },
        { name: 'Night Shift', startTime: '21:00', endTime: '06:00', gracePeriod: 15, halfDayLimit: 4 },
        { name: 'Half Day', startTime: '09:00', endTime: '13:00', gracePeriod: 10, halfDayLimit: 2 }
      ]);
      shifts = await Shift.find();
    }

    const User = require('../models/User');
    const shiftsWithStats = await Promise.all(shifts.map(async (shift) => {
      const userCount = await User.countDocuments({ shift: shift._id });
      return { ...shift.toObject(), assignedEmployees: userCount };
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
    const shift = await Shift.create(req.body);
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
    const shift = await Shift.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
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
    const User = require('../models/User');
    const assignedCount = await User.countDocuments({ shift: req.params.id });
    if (assignedCount > 0) {
      return res.status(400).json({ 
        success: false, 
        message: `Cannot delete shift: ${assignedCount} employees are currently assigned to it.` 
      });
    }

    await Shift.findByIdAndDelete(req.params.id);
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
    const User = require('../models/User');

    if (department) {
      await User.updateMany({ department }, { shift: shiftId });
    } else if (userIds && userIds.length > 0) {
      await User.updateMany({ _id: { $in: userIds } }, { shift: shiftId });
    } else {
      return res.status(400).json({ success: false, message: 'Please provide userIds or department' });
    }

    res.status(200).json({
      success: true,
      message: 'Shift assigned successfully'
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};
