const Holiday = require('../models/Holiday');

// @desc    Get all holidays
// @route   GET /api/holidays
// @access  Private
exports.getHolidays = async (req, res, next) => {
  try {
    const holidays = await Holiday.find().sort('holiday_date');
    res.status(200).json({ success: true, count: holidays.length, data: holidays });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    Create holiday
// @route   POST /api/holidays
// @access  Private/Admin
exports.createHoliday = async (req, res, next) => {
  try {
    const holiday = await Holiday.create(req.body);
    res.status(201).json({ success: true, data: holiday });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    Update holiday
// @route   PUT /api/holidays/:id
// @access  Private/Admin
exports.updateHoliday = async (req, res, next) => {
  try {
    const holiday = await Holiday.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!holiday) return res.status(404).json({ success: false, message: 'Holiday not found' });
    res.status(200).json({ success: true, data: holiday });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    Delete holiday
// @route   DELETE /api/holidays/:id
// @access  Private/Admin
exports.deleteHoliday = async (req, res, next) => {
  try {
    const holiday = await Holiday.findByIdAndDelete(req.params.id);
    if (!holiday) return res.status(404).json({ success: false, message: 'Holiday not found' });
    res.status(200).json({ success: true, data: {} });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    Import holidays from JSON
// @route   POST /api/holidays/import
// @access  Private/Admin
exports.importHolidays = async (req, res, next) => {
  try {
    const holidays = req.body; // Expecting array of { holiday_date, holiday_name, holiday_type }
    if (!Array.isArray(holidays)) {
      return res.status(400).json({ success: false, message: 'Please provide an array of holidays' });
    }
    const createdHolidays = await Holiday.insertMany(holidays);
    res.status(201).json({ success: true, count: createdHolidays.length, data: createdHolidays });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};
