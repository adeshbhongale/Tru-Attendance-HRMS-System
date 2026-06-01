const Location = require('../models/Location');
const CompanySetting = require('../models/CompanySetting');
const User = require('../models/User');

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

    // Check if logged-in user is an employee and has an assigned workingPlace
    const user = await User.findById(req.user.id).populate('workingPlace');
    let responseData = {};

    if (user && user.workingPlace) {
      responseData = {
        _id: user.workingPlace._id,
        name: user.workingPlace.name || 'Office Main',
        latitude: user.workingPlace.latitude,
        longitude: user.workingPlace.longitude,
        address: user.workingPlace.address || '',
        radius: user.workingPlace.radius || 200,
        geofenceEnabled: user.workingPlace.geofenceEnabled !== undefined ? user.workingPlace.geofenceEnabled : true,
        weeklyOffs: office.weeklyOffs,
        globalHolidays: office.globalHolidays,
        leaveTypesEnabled: office.leaveTypesEnabled,
        androidApkUrl: office.androidApkUrl || process.env.ANDROID_APK_URL || '',
        iosAppUrl: office.iosAppUrl || process.env.IOS_APP_URL || '',
      };
    } else {
      responseData = {
        _id: office._id,
        name: 'Primary Office',
        latitude: office.officeLocation?.latitude || 18.5204,
        longitude: office.officeLocation?.longitude || 73.8567,
        address: office.officeLocation?.address || 'Pune, Maharashtra, India',
        radius: office.officeLocation?.radius || 200,
        geofenceEnabled: office.officeLocation?.geofenceEnabled !== undefined ? office.officeLocation.geofenceEnabled : true,
        weeklyOffs: office.weeklyOffs,
        globalHolidays: office.globalHolidays,
        leaveTypesEnabled: office.leaveTypesEnabled,
        androidApkUrl: office.androidApkUrl || process.env.ANDROID_APK_URL || '',
        iosAppUrl: office.iosAppUrl || process.env.IOS_APP_URL || '',
      };
    }

    res.status(200).json({
      success: true,
      data: responseData,
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

// @desc    Seed comprehensive database
// @route   POST /api/settings/seed-db
// @access  Private/Admin
exports.seedDatabase = async (req, res, next) => {
  try {
    const { fork } = require('child_process');
    const path = require('path');
    const scriptPath = path.join(__dirname, '../scripts/seed_comprehensive.js');

    const child = fork(scriptPath, [], {
      env: { ...process.env }
    });

    child.on('error', (err) => {
      console.error('Seed process error:', err);
    });

    const exitCode = await new Promise((resolve) => {
      child.on('exit', (code) => {
        resolve(code);
      });
    });

    if (exitCode === 0) {
      res.status(200).json({
        success: true,
        message: 'Database seeded successfully.'
      });
    } else {
      res.status(500).json({
        success: false,
        message: `Database seeding failed with exit code ${exitCode}.`
      });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
