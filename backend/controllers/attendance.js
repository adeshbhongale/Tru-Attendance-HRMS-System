const Attendance = require('../models/Attendance');
const User = require('../models/User');
const Location = require('../models/Location');
const Leave = require('../models/Leave');
const { getISTDateComponents, createDateFromIST, getStartOfDayIST, getEndOfDayIST, matchShift } = require('../utils/timezone');
// SINGLE SOURCE OF TRUTH — all calculations via canonical service
const statsService = require('../services/employeeStatsService');
const geoService = require('../services/geoTrackingService');
const Shift = require('../models/Shift');
const { calculateDistance } = require('../utils/geofence');
const { uploadToCloudinary } = require('../utils/cloudinary');
const { getGoogleRoadDistance } = require('../utils/googleMaps');
const enterpriseTracking = require('../services/enterpriseTrackingService');
const CompanySetting = require('../models/CompanySetting');
const Holiday = require('../models/Holiday');
const { RawTrackingPoint, LiveEmployeeStatus } = require('../models/Tracking');
const { reverseGeocodeAsync } = require('../services/enterpriseTrackingService');

// @desc    Track location batch
// @route   POST /api/attendance/track-batch
// @access  Private
exports.trackBatch = async (req, res, next) => {
  try {
    const { userId, batch } = req.body;
    const io = req.app.get('io');

    const mongoose = require('mongoose');
    let targetUserId = req.user.id;
    if (userId && mongoose.Types.ObjectId.isValid(userId)) {
      targetUserId = userId;
    }

    const result = await enterpriseTracking.processTrackingBatch(targetUserId, batch, io);
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

    // Parallelize time-consuming operations: DB Queries (Selfie upload moved to background)
    const [officeMain, user, settings] = await Promise.all([
      Location.findOne({ name: 'Office Main' }).then(loc => loc || Location.findOne()),
      User.findById(userId).populate('shift').populate('workingPlace'),
      CompanySetting.findOne()
    ]);

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    let targetDate = getStartOfDayIST(now);
    let matchedShift = null;

    if (user.shift) {
      const matchResult = matchShift(now, user.shift, (now - new Date(user.createdAt)) < (48 * 60 * 60 * 1000));
      if (matchResult.matched) {
        matchedShift = matchResult;
        targetDate = matchResult.date;
      } else {
        if (matchResult.closestFutureShift) {
          const allowedTime = new Date(matchResult.closestFutureShift.getTime() - (60 * 60 * 1000));
          const allowedIST = getISTDateComponents(allowedTime);
          const hrVal = allowedIST.hour % 12 || 12;
          const ampm = allowedIST.hour >= 12 ? 'pm' : 'am';
          const formattedTime = `${hrVal.toString().padStart(2, '0')}:${allowedIST.minute.toString().padStart(2, '0')} ${ampm}`;

          return res.status(400).json({
            success: false,
            message: `Too early. You can only punch in after ${formattedTime}.`
          });
        }

        return res.status(400).json({
          success: false,
          message: 'Shift has already ended. You cannot punch in now.'
        });
      }
    }

    // ── Check for Week Offs and Holidays ──
    const targetIST = getISTDateComponents(targetDate);
    const dayName = targetIST.dayName;
    const holiday = await Holiday.findOne({ holiday_date: targetDate });

    if (settings?.weeklyOffs?.includes(dayName)) {
      return res.status(400).json({ success: false, message: `Today is ${dayName} (Weekly Off). Attendance is not required.` });
    }

    if (holiday) {
      return res.status(400).json({ success: false, message: `Today is ${holiday.holiday_name} (Holiday). Attendance is not required.` });
    }

    let existingAttendance = await Attendance.findOne({
      user: userId,
      date: targetDate
    });

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

    const office = user?.workingPlace || officeMain;

    if (!office) {
      return res.status(500).json({ success: false, message: 'Office location not set by admin' });
    }

    const distance = calculateDistance(latitude, longitude, office.latitude, office.longitude);
    const isOutside = distance > office.radius;

    let isLate = false;
    let lateTime = 0;
    let isHalfDay = false;
    let status = 'Present';

    const tempAttendance = {
      date: targetDate,
      punchIn: { time: now },
      status: 'Present',
      shiftInfo: user.shift
    };

    status = statsService.resolveStatus(tempAttendance, user);
    isHalfDay = status === 'Half Day';
    isLate = status === 'Late';
    lateTime = isLate ? statsService.calculateLateTime({ date: targetDate, punchIn: { time: now } }, user.shift) : 0;

    const attendance = await Attendance.create({
      user: userId,
      date: targetDate,
      punchIn: {
        time: now,
        location: { latitude, longitude, address },
        selfie: null, // Asynchronously uploaded in background
        isOutside: isOutside
      },
      status,
      isLate,
      lateTime,
      isHalfDay,
      isOutside,
      shiftInfo: user.shift ? {
        name: user.shift.name,
        startTime: user.shift.startTime,
        endTime: user.shift.endTime,
        requiredHours: user.shift.workingHours,
        gracePeriod: user.shift.gracePeriod,
        halfDayAfter: user.shift.halfDayAfter
      } : undefined
    });

    res.status(201).json({
      success: true,
      message: 'Punched in successfully',
      data: attendance,
    });

    // Run selfie upload in the background
    if (selfie && selfie !== 'skipped') {
      const { uploadToCloudinary } = require('../utils/cloudinary');
      uploadToCloudinary(selfie, 'hrms/attendance/selfies')
        .then(async (selfieData) => {
          if (selfieData?.url) {
            await Attendance.updateOne(
              { _id: attendance._id },
              { $set: { "punchIn.selfie": selfieData.url } }
            );
            console.log('Background selfie punch-in upload completed:', selfieData.url);
          }
        })
        .catch(err => {
          console.error('Background selfie punch-in upload failed:', err.message);
        });
    }

    // Hook in automated notifications
    try {
      const autoNotif = require('../services/autoNotificationService');
      const io = req.app.get('io');
      if (attendance.isLate) {
        autoNotif.triggerLateArrival(userId, attendance.lateTime, io);
      }
    } catch (e) {
      console.error('Punch in notification hook failed:', e);
    }
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.punchOut = async (req, res, next) => {
  try {
    const { latitude, longitude, address, selfie } = req.body;
    const userId = req.user.id;

    // Parallelize DB lookups (Selfie upload moved to background)
    const [attendance, officeMain, user] = await Promise.all([
      Attendance.findOne({
        user: userId,
        "punchOut.time": { $exists: false }
      }).sort('-date'),
      Location.findOne({ name: 'Office Main' }).then(loc => loc || Location.findOne()),
      User.findById(userId).populate('shift').populate('workingPlace')
    ]);

    if (!attendance) {
      return res.status(400).json({ success: false, message: 'No active punch-in session found' });
    }

    const office = user?.workingPlace || officeMain;

    if (!office) {
      return res.status(500).json({ success: false, message: 'Office location not set by admin' });
    }

    const outDistance = calculateDistance(latitude, longitude, office.latitude, office.longitude);
    const outOutside = outDistance > office.radius;

    attendance.punchOut = {
      time: new Date(),
      location: { latitude, longitude, address },
      selfie: null, // Asynchronously uploaded in background
      isOutside: outOutside
    };

    attendance.isOutside = attendance.isOutside || outOutside;

    // Recalculate status with 90% Rule upon Punch Out
    const finalStatus = statsService.resolveStatus(attendance, user);
    attendance.status = finalStatus;
    attendance.isHalfDay = finalStatus === 'Half Day';
    attendance.isLate = finalStatus === 'Late';

    // Sort and deduplicate logs on punch out to ensure absolute accuracy
    if (attendance.trackingLogs && attendance.trackingLogs.length > 0) {
      attendance.trackingLogs.sort((a, b) => new Date(a.time) - new Date(b.time));
      const deduplicatedLogs = [];
      const seenTimes = new Set();
      for (const log of attendance.trackingLogs) {
        const timeMs = new Date(log.time).getTime();
        if (!seenTimes.has(timeMs)) {
          seenTimes.add(timeMs);
          deduplicatedLogs.push(log);
        }
      }
      attendance.trackingLogs = deduplicatedLogs;
    }

    // Calculate Net Working Hours and Distance using Centralized Services
    attendance.workingHours = statsService.calculateWorkingHours(attendance);
    attendance.distance = geoService.calculateTotalDistance(attendance.trackingLogs);
    attendance.totalDistance = attendance.distance;

    await attendance.save();

    res.status(200).json({
      success: true,
      message: 'Punched out successfully',
      data: attendance,
    });

    // Run selfie upload in the background
    if (selfie && selfie !== 'skipped') {
      const { uploadToCloudinary } = require('../utils/cloudinary');
      uploadToCloudinary(selfie, 'hrms/attendance/selfies')
        .then(async (selfieData) => {
          if (selfieData?.url) {
            await Attendance.updateOne(
              { _id: attendance._id },
              { $set: { "punchOut.selfie": selfieData.url } }
            );
            console.log('Background selfie punch-out upload completed:', selfieData.url);
          }
        })
        .catch(err => {
          console.error('Background selfie punch-out upload failed:', err.message);
        });
    }

    // Hook in automated notifications (Punch-Out notification is now scheduled automatically after shift instead of instant)
    /* try {
      const autoNotif = require('../services/autoNotificationService');
      const io = req.app.get('io');
      const timeStr = new Date(attendance.punchOut.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      autoNotif.triggerPunchOut(userId, timeStr, io);
    } catch (e) {
      console.error('Punch out notification hook failed:', e);
    } */
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
    }).populate({
      path: 'user',
      populate: { path: 'shift' }
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
    let start, end;

    if (date) {
      const [year, month, day] = date.split('-').map(Number);
      start = createDateFromIST(year, month - 1, day, 0, 0, 0, 0);
      end = createDateFromIST(year, month - 1, day, 23, 59, 59, 999);

      query.date = { $gte: start, $lte: end };
      searchDate = start;
    } else {
      const now = new Date();
      start = getStartOfDayIST(now);
      end = getEndOfDayIST(now);

      query.date = { $gte: start, $lte: end };
      searchDate = start;
    }

    const attendanceRaw = await Attendance.find(query)
      .populate({
        path: 'user',
        select: 'name email mobile department designation profileImage shift createdAt joiningDate',
        populate: { path: 'shift' }
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

    const Holiday = require('../models/Holiday');
    const targetIST = getISTDateComponents(searchDate);
    const searchDateStart = new Date(Date.UTC(targetIST.year, targetIST.month, targetIST.date, 0, 0, 0, 0));
    const searchDateEnd = new Date(Date.UTC(targetIST.year, targetIST.month, targetIST.date, 23, 59, 59, 999));

    const [isHoliday, approvedLeaves, settings] = await Promise.all([
      Holiday.findOne({ holiday_date: { $gte: searchDateStart, $lte: searchDateEnd }, status: 'active' }),
      Leave.find({
        status: 'Approved',
        startDate: { $lte: searchDateEnd },
        endDate: { $gte: searchDateStart }
      }),
      CompanySetting.findOne()
    ]);

    const leaveUserIdsSet = new Set(approvedLeaves.map(l => l.user.toString()));
    const allUsers = await User.find({ role: { $ne: 'admin' } }).populate('shift', 'name startTime endTime');
    const presentUserIds = new Set(attendance.map(a => a.user?._id?.toString()));

    const now = new Date();

    const absentRecords = allUsers
      .filter(user => !presentUserIds.has(user._id.toString()))
      .filter(user => {
        const joined = new Date(user.joiningDate || user.createdAt);
        joined.setUTCHours(0, 0, 0, 0);

        // If user joined AFTER the search date, they don't exist yet
        if (joined > searchDateStart) return false;

        return true;
      })
      .map(user => {
        const userCreated = new Date(user.createdAt);
        userCreated.setUTCHours(0, 0, 0, 0);

        const weeklyOffs = settings?.weeklyOffs || ['Sunday'];
        const dayName = getISTDateComponents(searchDate).dayName;

        let status = 'Absent';
        if (leaveUserIdsSet.has(user._id.toString())) {
          status = 'On Leave';
        } else if (weeklyOffs.includes(dayName) || isHoliday) {
          status = 'Not Punched In';
        } else {
          if (userCreated.getTime() === searchDateStart.getTime()) {
            status = 'Not Punched In';
          } else {
            // Check if shift is ended
            let isShiftEnded = false;
            if (searchDateEnd < now) {
              isShiftEnded = true;
            } else {
              if (user.shift) {
                const [eH, eM] = user.shift.endTime.split(':').map(Number);
                const [sH, sM] = user.shift.startTime.split(':').map(Number);
                const searchIST = getISTDateComponents(searchDate);
                let shiftEnd = createDateFromIST(searchIST.year, searchIST.month, searchIST.date, eH, eM);
                if (eH < sH || (eH === sH && eM < sM)) {
                  shiftEnd = createDateFromIST(searchIST.year, searchIST.month, searchIST.date + 1, eH, eM);
                }
                if (now >= shiftEnd) {
                  isShiftEnded = true;
                }
              } else {
                const nowIST = getISTDateComponents(now);
                if (nowIST.hour >= 23) {
                  isShiftEnded = true;
                }
              }
            }

            if (isShiftEnded) {
              status = 'Absent';
            } else {
              status = 'Not Punched In';
            }
          }
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
    const { latitude, longitude, accuracy, speed, altitude, heading, battery } = req.body;
    const userId = req.user.id;

    const now = new Date();
    const attendance = await Attendance.findOne({
      user: userId,
      "punchOut.time": { $exists: false }
    }).sort('-date');

    if (!attendance) {
      return res.status(404).json({ success: false, message: 'No active session found to track' });
    }

    const user = await User.findById(userId).populate('workingPlace');
    const office = user?.workingPlace || (await Location.findOne({ name: 'Office Main' }) || await Location.findOne());

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

    // Enterprise validation check
    const validation = geoService.validateLocation(lastPoint, {
      latitude,
      longitude,
      accuracy,
      time: now
    });

    const isOutside = office ? (calculateDistance(latitude, longitude, office.latitude, office.longitude) > office.radius) : false;

    // Determine status of point
    let pointStatus = 'valid';
    let incrementalDistance = 0;

    if (validation.isRecovery) {
      pointStatus = 'valid';
      // Recovery starts fresh segment, incrementalDistance is 0
    } else if (validation.isWeak) {
      pointStatus = 'weak';
    } else if (validation.isSuspicious) {
      pointStatus = 'suspicious';
    } else if (validation.status === 'idle' || (!validation.isValid && !validation.isSuspicious)) {
      pointStatus = 'idle';
    } else {
      incrementalDistance = validation.distance;
    }

    const previousOutside = attendance.isOutside;

    attendance.isOutside = isOutside;
    attendance.lastTrackedLocation = { latitude, longitude, time: now };
    attendance.lastTrackingTime = now;
    if (battery) attendance.battery = battery;

    const isDuplicate = attendance.trackingLogs.some(log => 
      new Date(log.time).getTime() === now.getTime()
    );

    if (!isDuplicate) {
      const newLogEntry = {
        time: now,
        latitude,
        longitude,
        isSuspicious: validation.isSuspicious || pointStatus === 'suspicious' || pointStatus === 'idle',
        isMocked: req.body.isMocked,
        accuracy,
        speed,
        altitude,
        heading
      };

      attendance.trackingLogs.push(newLogEntry);
      attendance.trackingLogs.sort((a, b) => new Date(a.time) - new Date(b.time));

      const deduplicatedLogs = [];
      const seenTimes = new Set();
      for (const log of attendance.trackingLogs) {
        const timeMs = new Date(log.time).getTime();
        if (!seenTimes.has(timeMs)) {
          seenTimes.add(timeMs);
          deduplicatedLogs.push(log);
        }
      }

      let accumulatedDistance = 0;
      for (let i = 0; i < deduplicatedLogs.length; i++) {
        if (i === 0) {
          deduplicatedLogs[i].distanceFromPrevious = 0;
          deduplicatedLogs[i].totalDistanceTillNow = 0;
        } else {
          const prev = deduplicatedLogs[i - 1];
          const curr = deduplicatedLogs[i];
          const dist = geoService.calculateDistance(
            prev.latitude,
            prev.longitude,
            curr.latitude,
            curr.longitude
          );
          
          const isPointSuspicious = curr.isSuspicious || curr.status === 'suspicious' || curr.status === 'idle';
          const validDist = (dist >= 0.005 && !isPointSuspicious) ? dist : 0;
          
          deduplicatedLogs[i].distanceFromPrevious = parseFloat((validDist * 1000).toFixed(2));
          accumulatedDistance += validDist;
          deduplicatedLogs[i].totalDistanceTillNow = parseFloat(accumulatedDistance.toFixed(6));
        }
      }

      attendance.trackingLogs = deduplicatedLogs;
      attendance.totalDistance = parseFloat(accumulatedDistance.toFixed(6));
      attendance.distance = attendance.totalDistance;
    }
    await attendance.save();

    // Also write to RawTrackingPoint (Enterprise tracking history)
    const rawPoint = await RawTrackingPoint.create({
      userId,
      location: { type: 'Point', coordinates: [longitude, latitude] },
      accuracy,
      speed,
      heading,
      altitude,
      timestamp: now,
      status: pointStatus,
      isMock: req.body.isMocked
    });

    // Update Live Status
    let liveStatus = await LiveEmployeeStatus.findOne({ userId });
    if (!liveStatus) {
      liveStatus = new LiveEmployeeStatus({ userId });
    }
    
    liveStatus.lastLocation = rawPoint.location;
    liveStatus.currentSpeed = speed || 0;
    liveStatus.lastUpdate = now;
    liveStatus.totalDistanceToday = attendance.totalDistance;
    
    // Detect movement state based on speed
    const speedMs = speed || 0;
    const speedKmh = speedMs * 3.6;
    let moveState = 'Idle';
    if (speedKmh < 1) moveState = 'Idle';
    else if (speedKmh < 6) moveState = 'Walking';
    else if (speedKmh < 25) moveState = 'Bike';
    else if (speedKmh < 100) moveState = 'Vehicle';
    else moveState = 'Suspicious';
    
    liveStatus.movementState = moveState;
    liveStatus.currentStatus = 'online';
    if (battery) liveStatus.batteryLevel = battery;

    // Background Geocoding Check
    const currentCoords = rawPoint.location.coordinates;
    let shouldGeocode = false;

    if (!liveStatus.lastAddress) {
      shouldGeocode = true;
    } else {
      const lastGeocodedCoords = liveStatus.lastGeocodedLocation?.coordinates || liveStatus.lastLocation?.coordinates;
      if (lastGeocodedCoords) {
        const distSinceLastGeocode = geoService.calculateDistance(
          lastGeocodedCoords[1], lastGeocodedCoords[0],
          currentCoords[1], currentCoords[0]
        );
        const timeSinceLastGeocode = liveStatus.lastGeocodeTime ? (Date.now() - new Date(liveStatus.lastGeocodeTime).getTime()) / 1000 : Infinity;

        if (distSinceLastGeocode > 0.1 || timeSinceLastGeocode > 300) {
          shouldGeocode = true;
        }
      } else {
        shouldGeocode = true;
      }
    }

    if (shouldGeocode) {
      reverseGeocodeAsync(userId, rawPoint).catch(err => {
        console.error('[EnterpriseTracking] Background geocode from trackLocation failed:', err);
      });
    }

    await liveStatus.save();

    // Hook in automated notifications for geofence exit/entry
    try {
      const autoNotif = require('../services/autoNotificationService');
      const io = req.app.get('io');
      if (isOutside && !previousOutside) {
        autoNotif.triggerOutsideGeofence(userId, office?.name || 'Office Main', io);
      } else if (!isOutside && previousOutside) {
        autoNotif.triggerGeofenceEntry(userId, office?.name || 'Office Main', io);
      }
    } catch (e) {
      console.error('Geofence tracking notification hook failed:', e);
    }

    const io = req.app.get('io');
    if (io) {
      io.emit('locationUpdated', {
        userId,
        userName: req.user.name,
        latitude,
        longitude,
        address: liveStatus.lastAddress || 'Live Tracking...',
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

    const joiningDate = user.createdAt ? getStartOfDayIST(new Date(user.createdAt)) : new Date(0);

    const startDate = createDateFromIST(parseInt(year), parseInt(month) - 1, 1, 0, 0, 0, 0);
    const endDate = createDateFromIST(parseInt(year), parseInt(month), 1, 0, 0, 0, 0);

    const attendance = await Attendance.find({
      user: userId,
      date: { $gte: startDate, $lt: endDate }
    }).sort('date');

    const summary = { present: 0, late: 0, halfDay: 0, absent: 0, onLeave: 0, totalWorkedHours: 0, totalBreakMinutes: 0 };


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

    const [settings, monthHolidays] = await Promise.all([
      CompanySetting.findOne(),
      Holiday.find({
        holiday_date: {
          $gte: startDate.toISOString().split('T')[0],
          $lt: endDate.toISOString().split('T')[0]
        }
      })
    ]);

    const holidayMap = {};
    monthHolidays.forEach(h => {
      const d = new Date(h.holiday_date).getUTCDate();
      holidayMap[d] = h.holiday_name;
    });

    for (let i = 1; i <= daysInMonth; i++) {
      const d = new Date(Date.UTC(year, month - 1, i));
      const dayName = d.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
      const isWeekOff = settings?.weeklyOffs?.includes(dayName);
      const holidayName = holidayMap[i];

      const nowIST = getISTDateComponents(now);
      const isFuture = (parseInt(year) > nowIST.year) ||
        (parseInt(year) === nowIST.year && parseInt(month) > (nowIST.month + 1)) ||
        (parseInt(year) === nowIST.year && parseInt(month) === (nowIST.month + 1) && i > nowIST.date);

      const isToday = (parseInt(year) === nowIST.year && parseInt(month) === (nowIST.month + 1) && i === nowIST.date);
      const isBeforeJoining = d.getTime() < joiningDate.getTime();

      let status = 'Absent';
      if (isFuture) status = 'Future';
      else if (isToday) status = 'Today';
      else if (isBeforeJoining) status = 'BeforeJoining';
      else if (holidayName) status = 'Holiday';
      else if (isWeekOff) status = 'Week Off';

      let color = (isWeekOff || holidayName || isFuture || isBeforeJoining || isToday) ? 'transparent' : '#f43f5e';
      if (holidayName) color = '#8b5cf6'; // Violet for holidays
      if (isWeekOff) color = '#94a3b8'; // Slate for week offs

      dailyStatus[i] = { status, color, isWeekOff, isHoliday: !!holidayName, holidayName, isFuture, isToday, isBeforeJoining };
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
      const day = getISTDateComponents(new Date(record.date)).date;
      const recordObj = record.toObject();
      let status = statsService.resolveStatus(recordObj, user);
      let color = '#10b981';
      if (status === 'Late' || status === 'Half Day') color = '#f59e0b';

      if (dailyStatus[day]) {
        dailyStatus[day] = { ...dailyStatus[day], status, color, isFuture: false, isBeforeJoining: false, punchIn: record.punchIn?.time, punchOut: record.punchOut?.time };
        if (status === 'Present') summary.present++;
        else if (status === 'Late') summary.late++;
        else if (status === 'Half Day') summary.halfDay++;
        summary.totalWorkedHours += statsService.calculateWorkingHours(recordObj);
        summary.totalBreakMinutes += record.breaks?.reduce((acc, b) => acc + (b.duration || 0), 0) || 0;
      }
    });

    summary.absent = 0;
    for (let i = 1; i <= daysInMonth; i++) {
      const dayStatus = dailyStatus[i];
      if (dayStatus.status === 'Absent' && !dayStatus.isWeekOff && !dayStatus.isHoliday && !dayStatus.isBeforeJoining && !dayStatus.isFuture && !dayStatus.isToday) {
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

// @desc    Admin edit attendance record (punch-in time, punch-out time, status)
// @route   PUT /api/attendance/admin-edit/:attendanceId
// @access  Private/Admin
exports.adminEditAttendance = async (req, res) => {
  try {
    const { attendanceId } = req.params;
    const { punchInTime, punchOutTime, status, userId } = req.body;

    // Validate at least one field is being changed
    if (!punchInTime && !punchOutTime && !status) {
      return res.status(400).json({ success: false, message: 'No changes provided. Supply punchInTime, punchOutTime or status.' });
    }

    let attendance;
    const isSynthetic = attendanceId.startsWith('synthetic-');

    if (isSynthetic) {
      const dateStr = attendanceId.replace('synthetic-', '');
      const targetDate = new Date(dateStr + 'T00:00:00.000Z');
      const targetUserId = userId || req.user.id;

      attendance = await Attendance.findOne({ user: targetUserId, date: targetDate }).populate({
        path: 'user',
        populate: { path: 'shift' }
      });

      if (!attendance) {
        const User = require('../models/User');
        const user = await User.findById(targetUserId).populate('shift');
        if (!user) {
          return res.status(404).json({ success: false, message: 'User not found' });
        }

        attendance = new Attendance({
          user: user, // Keep it populated for resolveStatus and calculateWorkingHours calls
          date: targetDate,
          status: status || 'Present',
          shiftInfo: user.shift ? {
            name: user.shift.name,
            startTime: user.shift.startTime,
            endTime: user.shift.endTime,
            requiredHours: user.shift.workingHours,
            gracePeriod: user.shift.gracePeriod,
            halfDayAfter: user.shift.halfDayAfter
          } : undefined
        });
      }
    } else {
      const mongoose = require('mongoose');
      if (!mongoose.Types.ObjectId.isValid(attendanceId)) {
        return res.status(400).json({ success: false, message: 'Invalid attendance ID' });
      }

      attendance = await Attendance.findById(attendanceId).populate({
        path: 'user',
        populate: { path: 'shift' }
      });
    }

    if (!attendance) {
      return res.status(404).json({ success: false, message: 'Attendance record not found' });
    }

    // --- Apply punch-in time change ---
    if (punchInTime) {
      // punchInTime arrives as "HH:mm" (24-hour) on the attendance date in IST
      const [h, m] = punchInTime.split(':').map(Number);
      if (isNaN(h) || isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) {
        return res.status(400).json({ success: false, message: 'Invalid punch-in time format. Use HH:mm (24-hour).' });
      }

      // Build a full IST datetime for that attendance date at HH:mm
      const attDate = new Date(attendance.date);
      const istComponents = getISTDateComponents(attDate);
      const newPunchIn = createDateFromIST(istComponents.year, istComponents.month, istComponents.date, h, m, 0, 0);

      if (!attendance.punchIn) attendance.punchIn = {};
      attendance.punchIn.time = newPunchIn;
      attendance.markModified('punchIn');
    }

    // --- Apply punch-out time change ---
    if (punchOutTime) {
      const [h, m] = punchOutTime.split(':').map(Number);
      if (isNaN(h) || isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) {
        return res.status(400).json({ success: false, message: 'Invalid punch-out time format. Use HH:mm (24-hour).' });
      }

      const attDate = new Date(attendance.date);
      const istComponents = getISTDateComponents(attDate);
      let newPunchOut = createDateFromIST(istComponents.year, istComponents.month, istComponents.date, h, m, 0, 0);

      // If punch-out appears to be before punch-in (night shift / next-day scenario), push to next day
      if (attendance.punchIn?.time && newPunchOut <= new Date(attendance.punchIn.time)) {
        newPunchOut = new Date(newPunchOut.getTime() + 24 * 60 * 60 * 1000);
      }

      if (!attendance.punchOut) attendance.punchOut = {};
      attendance.punchOut.time = newPunchOut;
      attendance.markModified('punchOut');
    }

    // --- IMPORTANT: capture recordObj AFTER all time mutations so recalculations use new values ---
    const user = attendance.user;
    const recordObj = attendance.toObject();
    const ALL_STATUSES = ['Present', 'Late', 'Half Day', 'Absent', 'Leave', 'Leave(Half)', 'Holiday', 'Week Off', 'Neutral'];

    if (status && ALL_STATUSES.includes(status)) {
      // Admin explicitly overrides status — honour it directly
      attendance.status = status;
      attendance.isLate = status === 'Late';
      attendance.isHalfDay = status === 'Half Day' || status === 'Leave(Half)';
    } else if (attendance.punchIn?.time) {
      // Auto-recalculate status from updated times using canonical service
      const resolvedStatus = statsService.resolveStatus(recordObj, user);
      attendance.status = resolvedStatus;
      attendance.isLate = resolvedStatus === 'Late';
      attendance.isHalfDay = resolvedStatus === 'Half Day';
    }

    // Recalculate working hours using canonical service (with updated punchIn/punchOut)
    attendance.workingHours = statsService.calculateWorkingHours(recordObj);

    // Update lateTime field
    if (attendance.isLate && statsService.calculateLateTime) {
      attendance.lateTime = statsService.calculateLateTime(recordObj, user?.shift);
    } else {
      attendance.lateTime = 0;
    }

    await attendance.save();

    // Re-fetch the full record with populated relations to return fresh data
    const updated = await Attendance.findById(attendance._id).populate({
      path: 'user',
      select: 'name email mobile department designation profileImage shift',
      populate: { path: 'shift' }
    });

    return res.status(200).json({
      success: true,
      message: 'Attendance record updated successfully. All stats and reports have been recalculated.',
      data: updated
    });

  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    Update GPS status and notify admin if disabled
// @route   POST /api/attendance/gps-status
// @access  Private
exports.gpsStatusUpdate = async (req, res, next) => {
  try {
    const { gpsEnabled } = req.body;
    const userId = req.user.id;
    const io = req.app.get('io');

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Update LiveEmployeeStatus signal quality/status
    const liveStatus = await LiveEmployeeStatus.findOne({ userId });
    if (liveStatus) {
      liveStatus.signalQuality = gpsEnabled ? 'strong' : 'lost';
      liveStatus.currentStatus = gpsEnabled ? 'online' : 'offline';
      liveStatus.lastUpdate = new Date();
      await liveStatus.save();
    }

    if (!gpsEnabled) {
      // Trigger notification to admin
      const notificationService = require('../services/notificationService');
      await notificationService.createAndSendNotification({
        title: 'Location Service Disabled 🚨',
        description: `Employee ${user.name} (${user.email}) has turned off their device location service or revoked permissions.`,
        type: 'emergancy notification',
        frequency: 'Instant',
        targetType: 'Role-based Employees',
        targetRole: 'admin',
        isAuto: false
      }, io);
    }

    res.status(200).json({ success: true });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};


