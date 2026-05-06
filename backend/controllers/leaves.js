const Leave = require('../models/Leave');

// @desc    Apply for leave
// @route   POST /api/leaves
// @access  Private
exports.applyLeave = async (req, res, next) => {
  try {
    req.body.user = req.user.id;
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
    const leaves = await Leave.find({ user: req.user.id }).sort('-createdAt');
    res.status(200).json({
      success: true,
      count: leaves.length,
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
    const leave = await Leave.findById(req.params.id);

    if (!leave) {
      return res.status(404).json({ success: false, message: 'Leave not found' });
    }

    leave.status = req.body.status;
    leave.adminNote = req.body.adminNote;
    await leave.save();

    res.status(200).json({
      success: true,
      data: leave,
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};
