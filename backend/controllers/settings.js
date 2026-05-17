const Location = require('../models/Location');
const CompanySetting = require('../models/CompanySetting');

// @desc    Get office settings
// @route   GET /api/settings/office
// @access  Private
exports.getOfficeSettings = async (req, res, next) => {
  try {
    let office = await CompanySetting.findOne();
    
    if (!office) {
      // Create default if not exists
      office = await CompanySetting.create({
        officeLocation: {
          latitude: 18.5204,
          longitude: 73.8567,
          address: 'Pune, Maharashtra, India',
          radius: 200,
          geofenceEnabled: true
        }
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
    let office = await CompanySetting.findOneAndUpdate(
      {},
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

// @desc    Get all working places
// @route   GET /api/settings/locations
// @access  Private/Admin
exports.getLocations = async (req, res, next) => {
  try {
    const locations = await Location.find();
    res.status(200).json({ success: true, count: locations.length, data: locations });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    Create working place
// @route   POST /api/settings/locations
// @access  Private/Admin
exports.createLocation = async (req, res, next) => {
  try {
    const location = await Location.create(req.body);
    res.status(201).json({ success: true, data: location });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    Update working place
// @route   PUT /api/settings/locations/:id
// @access  Private/Admin
exports.updateLocation = async (req, res, next) => {
  try {
    const location = await Location.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!location) return res.status(404).json({ success: false, message: 'Location not found' });
    res.status(200).json({ success: true, data: location });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    Delete working place
// @route   DELETE /api/settings/locations/:id
// @access  Private/Admin
exports.deleteLocation = async (req, res, next) => {
  try {
    const location = await Location.findByIdAndDelete(req.params.id);
    if (!location) return res.status(404).json({ success: false, message: 'Location not found' });
    res.status(200).json({ success: true, data: {} });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};
