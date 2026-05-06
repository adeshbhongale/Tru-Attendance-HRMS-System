const Location = require('../models/Location');

// @desc    Get office settings
// @route   GET /api/settings/office
// @access  Private
exports.getOfficeSettings = async (req, res, next) => {
  try {
    let office = await Location.findOne({ name: 'Office Main' });
    if (!office) {
      // Create default if not exists
      office = await Location.create({
        name: 'Office Main',
        latitude: 0,
        longitude: 0,
        radius: 200,
      });
    }
    res.status(200).json({
      success: true,
      data: office,
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    Update office settings
// @route   PUT /api/settings/office
// @access  Private/Admin
exports.updateOfficeSettings = async (req, res, next) => {
  try {
    let office = await Location.findOneAndUpdate(
      { name: 'Office Main' },
      req.body,
      { new: true, runValidators: true, upsert: true }
    );
    res.status(200).json({
      success: true,
      data: office,
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};
