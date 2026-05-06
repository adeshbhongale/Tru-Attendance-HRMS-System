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

    res.status(200).json({
      success: true,
      data: shifts,
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
    await Shift.findByIdAndDelete(req.params.id);
    res.status(200).json({
      success: true,
      data: {},
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};
