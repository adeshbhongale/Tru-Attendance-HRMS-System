const Attendance = require('../models/Attendance');
const Location = require('../models/Location');
const User = require('../models/User');
const Shift = require('../models/Shift');
const { calculateDistance } = require('../utils/geofence');
const { uploadToCloudinary } = require('../utils/cloudinary');

// @desc    Punch In
// @route   POST /api/attendance/punch-in
// @access  Private
exports.punchIn = async (req, res, next) => {
  try {
    const { latitude, longitude, address, selfie } = req.body;
    const userId = req.user.id;

    // Upload selfie to Cloudinary if provided
    let selfieData = null;
    if (selfie && selfie !== 'skipped') {
      try {
        selfieData = await uploadToCloudinary(selfie, 'hrms/attendance/selfies');
      } catch (err) {
        console.log('Selfie upload warning:', err.message);
        // Continue without selfie if upload fails
      }
    }

    const now = new Date();
    const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));

    const startOfDay = new Date(today);
    const endOfDay = new Date(today);
    endOfDay.setUTCDate(endOfDay.getUTCDate() + 1);

    let existingAttendance = await Attendance.findOne({
      user: userId,
      $or: [
        { date: { $gte: startOfDay, $lt: endOfDay } },
        { "punchOut.time": { $gte: startOfDay, $lt: endOfDay } }
      ]
    });

    if (existingAttendance) {
      if (!existingAttendance.punchOut?.time) {
        return res.status(400).json({ success: false, message: 'You already have an active session. Please punch out first.' });
      } else {
        return res.status(400).json({ success: false, message: 'You have already completed your attendance for today.' });
      }
    }

    const office = await Location.findOne({ name: 'Office Main' }) || await Location.findOne();
    if (!office) {
      return res.status(500).json({ success: false, message: 'Office location not set by admin' });
    }

    const distance = calculateDistance(latitude, longitude, office.latitude, office.longitude);
    const isOutside = distance > office.radius;

    const user = await User.findById(userId).populate('shift');
    let isLate = false;
    let isHalfDay = false;
    let status = 'Present';

    if (user.shift) {
      const nowTime = new Date();
      
      // Calculate Late Status
      const [sHour, sMin] = user.shift.startTime.split(':').map(Number);
      const shiftStart = new Date(nowTime);
      shiftStart.setHours(sHour, sMin, 0, 0);
      const graceTime = new Date(shiftStart.getTime() + (user.shift.gracePeriod || 0) * 60000);
      
      if (nowTime > graceTime) {
        isLate = true;
        status = 'Late';
      }

      // Calculate Half Day Status
      if (user.shift.halfDayAfter) {
        const [hHour, hMin] = user.shift.halfDayAfter.split(':').map(Number);
        const halfDayTime = new Date(nowTime);
        halfDayTime.setHours(hHour, hMin, 0, 0);
        if (nowTime > halfDayTime) {
          isHalfDay = true;
          status = 'Half Day';
        }
      }
    }

    // Location status is recorded via isOutside, status remains Present or Late

    attendance = await Attendance.create({
      user: userId,
      date: today,
      punchIn: {
        time: new Date(),
        location: { latitude, longitude, address },
        selfie: selfieData ? selfieData.url : null,
      },
      status,
      isLate,
      isHalfDay,
      isOutside,
    });

    res.status(201).json({
      success: true,
      message: 'Punched in successfully',
      data: attendance,
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.punchOut = async (req, res, next) => {
  try {
    const { latitude, longitude, address } = req.body;
    const userId = req.user.id;

    let attendance = await Attendance.findOne({
      user: userId,
      "punchOut.time": { $exists: false }
    }).sort('-date');

    if (!attendance) {
      return res.status(400).json({ success: false, message: 'No active punch-in session found' });
    }

    attendance.punchOut = {
      time: new Date(),
      location: { latitude, longitude, address },
    };

    const diff = attendance.punchOut.time - attendance.punchIn.time;
    const hours = diff / (1000 * 60 * 60);
    attendance.workingHours = parseFloat(hours.toFixed(2));

    const user = await User.findById(userId).populate('shift');
    
    // Overtime Calculation
    if (user.shift) {
      const [eHour, eMin] = user.shift.endTime.split(':').map(Number);
      const shiftEnd = new Date(attendance.date);
      shiftEnd.setHours(eHour, eMin, 0, 0);
      
      // If night shift, end time is next day
      if (user.shift.isNightShift && eHour < 12) {
        shiftEnd.setDate(shiftEnd.getDate() + 1);
      }
      
      if (attendance.punchOut.time > shiftEnd) {
        const otDiff = attendance.punchOut.time - shiftEnd;
        attendance.overtime = parseFloat((otDiff / (1000 * 60 * 60)).toFixed(2));
      }

      // Half day check based on working hours if punch-in wasn't already half-day
      if (!attendance.isHalfDay && hours < (user.shift.workingHours / 2)) {
        attendance.isHalfDay = true;
        attendance.status = 'Half Day';
      }
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
    const { date } = req.query;
    let query = {};
    let searchDate = new Date();

    if (date) {
      // Create a range for the entire day using UTC components to match the new storage format
      const [year, month, day] = date.split('-').map(Number);
      const start = new Date(Date.UTC(year, month - 1, day));
      const end = new Date(Date.UTC(year, month - 1, day));
      end.setUTCDate(end.getUTCDate() + 1);

      query.date = { $gte: start, $lt: end };
      searchDate = start;
    } else {
      const now = new Date();
      const start = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
      const end = new Date(start);
      end.setUTCDate(end.getUTCDate() + 1);
      
      query.date = { $gte: start, $lt: end };
      searchDate = start;
    }

    const attendance = await Attendance.find(query)
      .populate({
        path: 'user',
        select: 'name email department shift',
        populate: { path: 'shift', select: 'name' }
      })
      .sort('-date');

    const allUsers = await User.find({ role: { $ne: 'admin' } }).populate('shift', 'name');
    const presentUserIds = new Set(attendance.map(a => a.user?._id?.toString()));
    
    const absentRecords = allUsers
      .filter(user => !presentUserIds.has(user._id.toString()))
      .map(user => ({
        _id: `absent_${user._id}`,
        user: user,
        date: searchDate,
        status: 'Absent',
        punchIn: null,
        punchOut: null,
        isLate: false,
        isHalfDay: false,
        isOutside: false,
        workingHours: 0,
        trackingLogs: [],
        totalDistance: 0
      }));

    const finalData = [...attendance, ...absentRecords];

    res.status(200).json({
      success: true,
      count: finalData.length,
      data: finalData,
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    Track Live Location
// @route   POST /api/attendance/track
// @access  Private
exports.trackLocation = async (req, res, next) => {
  try {
    const { latitude, longitude, address } = req.body;
    const userId = req.user.id;

    const now = new Date();
    const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    const startOfDay = new Date(today);
    const endOfDay = new Date(today);
    endOfDay.setUTCDate(endOfDay.getUTCDate() + 1);

    const attendance = await Attendance.findOne({
      user: userId,
      date: { $gte: startOfDay, $lt: endOfDay },
      "punchOut.time": { $exists: false }
    });

    if (!attendance) {
      return res.status(404).json({ success: false, message: 'No active session found to track' });
    }

    if (attendance.punchOut?.time) {
      return res.status(400).json({ success: false, message: 'Shift already ended' });
    }

    const office = await Location.findOne({ name: 'Office Main' }) || await Location.findOne();
    const distance = calculateDistance(latitude, longitude, office.latitude, office.longitude);
    const isOutside = distance > office.radius;

    // Calculate distance from last point
    let incrementalDistance = 0;
    if (attendance.trackingLogs.length > 0) {
      const lastPoint = attendance.trackingLogs[attendance.trackingLogs.length - 1];
      incrementalDistance = calculateDistance(latitude, longitude, lastPoint.latitude, lastPoint.longitude);
    } else {
      // First log, calculate distance from punch-in
      incrementalDistance = calculateDistance(latitude, longitude, attendance.punchIn.location.latitude, attendance.punchIn.location.longitude);
    }

    attendance.totalDistance = (attendance.totalDistance || 0) + incrementalDistance;

    attendance.trackingLogs.push({
      time: new Date(),
      latitude,
      longitude,
      address,
      isOutside
    });

    await attendance.save();

    res.status(200).json({
      success: true,
      message: 'Location tracked',
      isOutside
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};
