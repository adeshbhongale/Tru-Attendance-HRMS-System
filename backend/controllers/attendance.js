const Attendance = require('../models/Attendance');
const Location = require('../models/Location');
const User = require('../models/User');
const Shift = require('../models/Shift');
const { calculateDistance } = require('../utils/geofence');

// @desc    Punch In
// @route   POST /api/attendance/punch-in
// @access  Private
exports.punchIn = async (req, res, next) => {
  try {
    const { latitude, longitude, address, selfie } = req.body;
    const userId = req.user.id;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Check if already punched in today
    let attendance = await Attendance.findOne({ user: userId, date: today });
    if (attendance && attendance.punchIn.time) {
      return res.status(400).json({ success: false, message: 'Already punched in for today' });
    }

    // Get office location for geo-fencing
    const office = await Location.findOne({ name: 'Office Main' });
    if (!office) {
      return res.status(500).json({ success: false, message: 'Office location not set by admin' });
    }

    // Calculate distance
    const distance = calculateDistance(latitude, longitude, office.latitude, office.longitude);
    const isOutside = distance > office.radius;

    // Get user shift info
    const user = await User.findById(userId).populate('shift');
    let isLate = false;
    let status = 'Present';

    if (user.shift) {
      const [shiftHour, shiftMin] = user.shift.startTime.split(':').map(Number);
      const shiftStartTime = new Date();
      shiftStartTime.setHours(shiftHour, shiftMin, 0, 0);
      
      const graceTime = new Date(shiftStartTime.getTime() + user.shift.gracePeriod * 60000);
      if (new Date() > graceTime) {
        isLate = true;
        status = 'Late';
      }
    }

    if (isOutside) {
      status = 'Outside Location';
    }

    attendance = await Attendance.create({
      user: userId,
      date: today,
      punchIn: {
        time: new Date(),
        location: { latitude, longitude, address },
        selfie,
      },
      status,
      isLate,
      isOutside,
    });

    res.status(201).json({
      success: true,
      message: isOutside ? 'Punched in (Outside Location)' : 'Punched in successfully',
      data: attendance,
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    Punch Out
// @route   POST /api/attendance/punch-out
// @access  Private
exports.punchOut = async (req, res, next) => {
  try {
    const { latitude, longitude, address } = req.body;
    const userId = req.user.id;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let attendance = await Attendance.findOne({ user: userId, date: today });
    if (!attendance) {
      return res.status(400).json({ success: false, message: 'No punch-in record found for today' });
    }
    if (attendance.punchOut && attendance.punchOut.time) {
      return res.status(400).json({ success: false, message: 'Already punched out for today' });
    }

    attendance.punchOut = {
      time: new Date(),
      location: { latitude, longitude, address },
    };

    // Calculate working hours
    const diff = attendance.punchOut.time - attendance.punchIn.time;
    const hours = diff / (1000 * 60 * 60);
    attendance.workingHours = parseFloat(hours.toFixed(2));

    // Check for half day
    const user = await User.findById(userId).populate('shift');
    if (user.shift && hours < user.shift.halfDayLimit) {
      attendance.isHalfDay = true;
      attendance.status = 'Half Day';
    }

    await attendance.save();

    res.status(200).json({
      success: true,
      message: 'Punched out successfully',
      data: attendance,
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    Get attendance history
// @route   GET /api/attendance/history
// @access  Private
exports.getHistory = async (req, res, next) => {
  try {
    const attendance = await Attendance.find({ user: req.user.id }).sort('-date');
    res.status(200).json({
      success: true,
      count: attendance.length,
      data: attendance,
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    Get all attendance for Admin
// @route   GET /api/attendance
// @access  Private/Admin
exports.getAllAttendance = async (req, res, next) => {
  try {
    const attendance = await Attendance.find().populate('user', 'name email department').sort('-date');
    res.status(200).json({
      success: true,
      count: attendance.length,
      data: attendance,
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};
