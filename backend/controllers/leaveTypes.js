const LeaveType = require('../models/LeaveType');

// @desc    Get all leave types
// @route   GET /api/leave-types
// @access  Private
exports.getLeaveTypes = async (req, res, next) => {
  try {
    const leaveTypes = await LeaveType.find();
    res.status(200).json({ success: true, count: leaveTypes.length, data: leaveTypes });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    Create leave type
// @route   POST /api/leave-types
// @access  Private/Admin
exports.createLeaveType = async (req, res, next) => {
  try {
    const leaveType = await LeaveType.create(req.body);
    res.status(201).json({ success: true, data: leaveType });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    Update leave type
// @route   PUT /api/leave-types/:id
// @access  Private/Admin
exports.updateLeaveType = async (req, res, next) => {
  try {
    const leaveType = await LeaveType.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!leaveType) return res.status(404).json({ success: false, message: 'Leave type not found' });
    res.status(200).json({ success: true, data: leaveType });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    Delete leave type
// @route   DELETE /api/leave-types/:id
// @access  Private/Admin
exports.deleteLeaveType = async (req, res, next) => {
  try {
    const leaveType = await LeaveType.findByIdAndDelete(req.params.id);
    if (!leaveType) return res.status(404).json({ success: false, message: 'Leave type not found' });
    res.status(200).json({ success: true, data: {} });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};
