const Attendance = require('../models/Attendance');
const User = require('../models/User');
const Location = require('../models/Location');
// SINGLE SOURCE OF TRUTH — all calculations via canonical service
const statsService = require('../services/employeeStatsService');
const geoService = require('../services/geoTrackingService');
const Shift = require('../models/Shift');
const { calculateDistance } = require('../utils/geofence');
const { uploadToCloudinary } = require('../utils/cloudinary');
const { getGoogleRoadDistance } = require('../utils/googleMaps');
const enterpriseTracking = require('../services/enterpriseTrackingService');

// @desc    Track location batch
// @route   POST /api/attendance/track-batch
// @access  Private
exports.trackBatch = async (req, res, next) => {
  try {
    const { userId, batch } = req.body;
    const io = req.app.get('io');
    const result = await enterpriseTracking.processTrackingBatch(userId || req.user.id, batch, io);
    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// @desc    Punch In
// @route   POST /api/attendance/punch-in
// @access  Private
exports.punchIn = async (req, res, next) => {
  try {
    const { latitude, longitude, address, selfie } = req.body;
    const userId = req.user.id;

    const now = new Date();
    // Use local date for "today" to ensure consistency with user perspective
    const todayStr = now.toISOString().split('T')[0];
    const startOfDay = new Date(todayStr + "T00:00:00.000Z");
    const endOfDay = new Date(todayStr + "T23:59:59.999Z");

    // Parallelize time-consuming operations: Selfie upload + DB Queries
    const [selfieData, existingAttendance, office, user] = await Promise.all([
      selfie && selfie !== 'skipped' ? uploadToCloudinary(selfie, 'hrms/attendance/selfies').catch(err => {
        console.log('Selfie upload warning:', err.message);
        return null;
      }) : Promise.resolve(null),
      Attendance.findOne({
        user: userId,
        date: { $gte: startOfDay, $lte: endOfDay }
      }),
      Location.findOne({ name: 'Office Main' }) || Location.findOne(),
      User.findById(userId).populate('shift')
    ]);

    if (existingAttendance) {
      // If it's an 'Absent' placeholder, we allow overwriting it with a real punch-in
      if (existingAttendance.status === 'Absent') {
         await Attendance.deleteOne({ _id: existingAttendance._id });
         existingAttendance = null; 
      } else if (!existingAttendance.punchOut?.time) {
        return res.status(400).json({ success: false, message: 'You already have an active session. Please punch out first.' });
      } else {
        return res.status(400).json({ success: false, message: 'You have already completed your attendance for today.' });
      }
    }

    if (!office) {
      return res.status(500).json({ success: false, message: 'Office location not set by admin' });
    }

    const distance = calculateDistance(latitude, longitude, office.latitude, office.longitude);
    const isOutside = distance > office.radius;

    let isLate = false;
    let lateTime = 0;
    let isHalfDay = false;
    let status = 'Present';

    if (user.shift) {
      // ── Block Future Shifts ──
      const [sH, sM] = user.shift.startTime.split(':').map(Number);
      const [eH, eM] = user.shift.endTime.split(':').map(Number);
      
      const shiftStart = new Date(now);
      shiftStart.setHours(sH, sM, 0, 0);
      
      const shiftEnd = new Date(now);
      shiftEnd.setHours(eH, eM, 0, 0);
      if (eH < sH || user.shift.isNightShift) shiftEnd.setDate(shiftEnd.getDate() + 1);

      // Block punch in only if shift has already ended
      if (now > shiftEnd) {
        return res.status(400).json({ 
          success: false, 
          message: 'Shift has already ended. You cannot punch in now.' 
        });
      }

      // Allow punch in only up to 60 minutes before shift starts
      // EXCEPTION: New employees (created within last 48h) can punch in anytime on their first shifts
      const joinDate = new Date(user.createdAt);
      const isNewEmployee = (now - joinDate) < (48 * 60 * 60 * 1000); 

      const earlyBuffer = 60 * 60 * 1000; 
      if (!isNewEmployee && now < new Date(shiftStart.getTime() - earlyBuffer)) {
        return res.status(400).json({ 
          success: false, 
          message: `Too early. You can only punch in after ${new Date(shiftStart.getTime() - earlyBuffer).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.` 
        });
      }
    }

    const tempAttendance = {
      punchIn: { time: now },
      status: 'Present',
      shiftInfo: user.shift
    };

    status = statsService.resolveStatus(tempAttendance, user);
    isHalfDay = status === 'Half Day';
    isLate = status === 'Late';
    lateTime = isLate ? statsService.calculateLateTime({ punchIn: { time: now } }, user.shift) : 0;

    const attendance = await Attendance.create({
      user: userId,
      date: startOfDay,
      punchIn: {
        time: now,
        location: { latitude, longitude, address },
        selfie: selfieData ? selfieData.url : null,
        isOutside: isOutside
      },
      status,
      isLate,
      lateTime,
      isHalfDay,
      isOutside,
      shiftInfo: {
        name: user.shift.name,
        startTime: user.shift.startTime,
        endTime: user.shift.endTime,
        requiredHours: user.shift.workingHours
      }
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
    const { latitude, longitude, address, selfie } = req.body;
    const userId = req.user.id;

    // Parallelize selfie upload and DB lookups
    const [selfieData, attendance, office, user] = await Promise.all([
      selfie && selfie !== 'skipped' ? uploadToCloudinary(selfie, 'hrms/attendance/selfies').catch(err => {
        console.log('Selfie upload warning:', err.message);
        return null;
      }) : Promise.resolve(null),
      Attendance.findOne({
        user: userId,
        "punchOut.time": { $exists: false }
      }).sort('-date'),
      Location.findOne({ name: 'Office Main' }) || Location.findOne(),
      User.findById(userId).populate('shift')
    ]);

    if (!attendance) {
      return res.status(400).json({ success: false, message: 'No active punch-in session found' });
    }

    const outDistance = calculateDistance(latitude, longitude, office.latitude, office.longitude);
    const outOutside = outDistance > office.radius;

    attendance.punchOut = {
      time: new Date(),
      location: { latitude, longitude, address },
      selfie: selfieData ? selfieData.url : null,
      isOutside: outOutside
    };

    // Recalculate status with 90% Rule upon Punch Out
    const finalStatus = statsService.resolveStatus(attendance, user);
    attendance.status = finalStatus;
    attendance.isHalfDay = finalStatus === 'Half Day';
    attendance.isLate = finalStatus === 'Late';

    // Calculate Net Working Hours and Distance using Centralized Services
    attendance.workingHours = statsService.calculateWorkingHours(attendance);
    attendance.distance = geoService.calculateTotalDistance(attendance.trackingLogs);

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
    const attendanceRaw = await Attendance.find({ 
      user: req.user.id,
      "punchIn.time": { $exists: true }
    }).sort('-date');

    const attendance = attendanceRaw.map(a => {
      const record = a.toObject();
      return { 
        ...record, 
        workingHours: statsService.calculateWorkingHours(record),
        status: statsService.resolveStatus(record, record.user)
      };
    });

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

    const attendanceRaw = await Attendance.find(query)
      .populate({
        path: 'user',
        select: 'name email department shift createdAt',
        populate: { path: 'shift', select: 'name startTime endTime' }
      })
      .sort('-date');

    const attendance = attendanceRaw.map(a => {
      const record = a.toObject();
      return {
        ...record,
        workingHours: statsService.calculateWorkingHours(record),
        status: statsService.resolveStatus(record, record.user)
      };
    });

    const allUsers = await User.find({ role: { $ne: 'admin' } }).populate('shift', 'name startTime endTime');
    const presentUserIds = new Set(attendance.map(a => a.user?._id?.toString()));
    
    const now = new Date();
    const isToday = searchDate.getUTCDate() === now.getUTCDate() && 
                    searchDate.getUTCMonth() === now.getUTCMonth() && 
                    searchDate.getUTCFullYear() === now.getUTCFullYear();
    
    // Define End of Day as 11:00 PM (23:00) or later
    const isEndOfDay = now.getHours() >= 23; 

    const absentRecords = allUsers
      .filter(user => !presentUserIds.has(user._id.toString()))
      .filter(user => {
        const userCreated = new Date(user.createdAt);
        userCreated.setUTCHours(0, 0, 0, 0);
        
        // 1. If user was created AFTER the search date, they don't exist yet
        if (userCreated > searchDate) return false;

        return true;
      })
      .map(user => {
        const userCreated = new Date(user.createdAt);
        userCreated.setUTCHours(0, 0, 0, 0);

        let status = 'Absent';
        
        // Condition: Never absent on joining day
        if (userCreated.getTime() === searchDate.getTime()) {
          status = 'Neutral';
        } else if (isToday && !isEndOfDay) {
          // If it's today and not end of day, keep as neutral
          status = 'Neutral';
        }

        return {
          _id: `absent_${user._id}`,
          user: user,
          date: searchDate,
          status: status,
          punchIn: null,
          punchOut: null,
          isLate: false,
          isHalfDay: false,
          isOutside: false,
          workingHours: 0,
          trackingLogs: [],
          totalDistance: 0
        };
      });

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
    const { latitude, longitude, address, accuracy, speed, altitude, heading, battery } = req.body;
    const userId = req.user.id;

    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const startOfDay = new Date(todayStr + "T00:00:00.000Z");

    const attendance = await Attendance.findOne({
      user: userId,
      date: { $gte: startOfDay },
      "punchOut.time": { $exists: false }
    });

    if (!attendance) {
      return res.status(404).json({ success: false, message: 'No active session found to track' });
    }

    const office = await Location.findOne({ name: 'Office Main' }) || await Location.findOne();
    
    let lastPoint = null;
    if (attendance.trackingLogs.length > 0) {
      lastPoint = attendance.trackingLogs[attendance.trackingLogs.length - 1];
    } else {
      lastPoint = {
        latitude: attendance.punchIn.location.latitude,
        longitude: attendance.punchIn.location.longitude,
        time: attendance.punchIn.time
      };
    }

    const validation = geoService.validateLocation(lastPoint, {
      latitude,
      longitude,
      time: now
    });

    const isOutside = office ? (calculateDistance(latitude, longitude, office.latitude, office.longitude) > office.radius) : false;

    if (validation.isSuspicious) {
      attendance.trackingLogs.push({
        time: now,
        latitude,
        longitude,
        address,
        isSuspicious: true,
        isMocked: req.body.isMocked,
        accuracy,
        speed,
        altitude,
        heading,
        distanceFromPrevious: 0
      });
      await attendance.save();
      return res.status(200).json({ success: true, message: 'Location marked as suspicious', isSuspicious: true, retry: true });
    }

    const incrementalDistance = validation.distance;
    const totalDistanceTillNow = (attendance.totalDistance || 0) + incrementalDistance;

    attendance.totalDistance = parseFloat(totalDistanceTillNow.toFixed(6));
    attendance.distance = attendance.totalDistance;
    attendance.isOutside = isOutside;

    attendance.lastTrackedLocation = { latitude, longitude, address, time: now };
    attendance.lastTrackingTime = now;
    if (battery) attendance.battery = battery;

    attendance.trackingLogs.push({
      time: now,
      latitude,
      longitude,
      address,
      distanceFromPrevious: parseFloat((incrementalDistance * 1000).toFixed(2)),
      totalDistanceTillNow: parseFloat(totalDistanceTillNow.toFixed(6)),
      isSuspicious: false,
      accuracy,
      speed,
      isMocked: req.body.isMocked,
      altitude,
      heading
    });

    await attendance.save();

    const io = req.app.get('io');
    if (io) {
      io.emit('locationUpdated', {
        userId,
        userName: req.user.name,
        latitude,
        longitude,
        address,
        time: now,
        totalDistance: attendance.totalDistance,
        isOutside
      });
    }

    res.status(200).json({ success: true, message: 'Location tracked', isOutside, totalDistance: attendance.totalDistance });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    Get monthly attendance view
exports.getMonthlyView = async (req, res, next) => {
  try {
    const { month, year } = req.query;
    const userId = req.user.id;

    if (!month || !year) {
      return res.status(400).json({ success: false, message: 'Please provide month and year' });
    }

    const user = await User.findById(userId).select('+createdAt');
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    
    const joiningDate = user.createdAt ? new Date(user.createdAt) : new Date(0);
    joiningDate.setUTCHours(0, 0, 0, 0);

    const startDate = new Date(Date.UTC(year, month - 1, 1));
    const endDate = new Date(Date.UTC(year, month, 1));

    const attendance = await Attendance.find({
      user: userId,
      date: { $gte: startDate, $lt: endDate }
    }).sort('date');

    const summary = { present: 0, late: 0, halfDay: 0, absent: 0, onLeave: 0, totalWorkedHours: 0, totalBreakMinutes: 0 };

    const Leave = require('../models/Leave');
    const leaves = await Leave.find({
      user: userId,
      status: 'Approved',
      $or: [
        { startDate: { $gte: startDate, $lt: endDate } },
        { endDate: { $gte: startDate, $lt: endDate } }
      ]
    });

    const daysInMonth = new Date(year, month, 0).getDate();
    const dailyStatus = {};
    const now = new Date();

    for (let i = 1; i <= daysInMonth; i++) {
      const d = new Date(Date.UTC(year, month - 1, i));
      const isSunday = d.getUTCDay() === 0;
      const isFuture = (parseInt(year) > now.getUTCFullYear()) || 
                      (parseInt(year) === now.getUTCFullYear() && parseInt(month) > (now.getUTCMonth() + 1)) ||
                      (parseInt(year) === now.getUTCFullYear() && parseInt(month) === (now.getUTCMonth() + 1) && i > now.getUTCDate());

      const isToday = (parseInt(year) === now.getUTCFullYear() && parseInt(month) === (now.getUTCMonth() + 1) && i === now.getUTCDate());
      const isBeforeJoining = d.getTime() < joiningDate.getTime();

      let status = 'Absent';
      if (isFuture) status = 'Future';
      else if (isToday) status = 'Today';
      else if (isBeforeJoining) status = 'BeforeJoining';

      let color = (isSunday || isFuture || isBeforeJoining || isToday) ? 'transparent' : '#f43f5e';

      dailyStatus[i] = { status, color, isSunday, isFuture, isToday, isBeforeJoining };
    }

    leaves.forEach(leave => {
      let start = new Date(leave.startDate);
      let end = new Date(leave.endDate);
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        if (d.getUTCMonth() + 1 === parseInt(month) && d.getUTCFullYear() === parseInt(year)) {
          const day = d.getUTCDate();
          if (dailyStatus[day] && !dailyStatus[day].isBeforeJoining) {
            dailyStatus[day] = { ...dailyStatus[day], status: 'On Leave', color: '#f59e0b', isFuture: false }; 
            summary.onLeave++;
          }
        }
      }
    });

    attendance.forEach(record => {
      const day = new Date(record.date).getUTCDate();
      let status = record.status || 'Present';
      let color = '#10b981';
      if (status === 'Late' || status === 'Half Day') color = '#f59e0b';

      if (dailyStatus[day]) {
        dailyStatus[day] = { ...dailyStatus[day], status, color, isFuture: false, isBeforeJoining: false, punchIn: record.punchIn?.time, punchOut: record.punchOut?.time };
        if (status === 'Present') summary.present++;
        else if (status === 'Late') summary.late++;
        else if (status === 'Half Day') summary.halfDay++;
        summary.totalWorkedHours += statsService.calculateWorkingHours(record);
        summary.totalBreakMinutes += record.breaks?.reduce((acc, b) => acc + (b.duration || 0), 0) || 0;
      }
    });

    summary.absent = 0;
    for (let i = 1; i <= daysInMonth; i++) {
       const dayStatus = dailyStatus[i];
       if (dayStatus.status === 'Absent' && !dayStatus.isSunday && !dayStatus.isBeforeJoining && !dayStatus.isFuture && !dayStatus.isToday) {
         summary.absent++;
       }
    }

    res.status(200).json({ success: true, data: { summary, dailyStatus, daysInMonth, monthName: new Date(year, month - 1).toLocaleString('default', { month: 'long' }) } });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.toggleBreak = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const attendance = await Attendance.findOne({ user: userId, "punchOut.time": { $exists: false } }).sort('-date');
    if (!attendance) return res.status(400).json({ success: false, message: 'No active punch-in session found' });

    const activeBreakIndex = attendance.breaks.findIndex(b => !b.endTime);
    if (activeBreakIndex !== -1) {
      attendance.breaks[activeBreakIndex].endTime = new Date();
      const diff = attendance.breaks[activeBreakIndex].endTime - attendance.breaks[activeBreakIndex].startTime;
      attendance.breaks[activeBreakIndex].duration = Math.round(diff / (1000 * 60));
    } else {
      attendance.breaks.push({ startTime: new Date() });
    }
    await attendance.save();
    res.status(200).json({ success: true, message: activeBreakIndex !== -1 ? 'Break ended' : 'Break started', data: attendance });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};
