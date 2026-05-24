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

    // Parallelize time-consuming operations: Selfie upload + DB Queries
    const [selfieData, officeMain, user, settings] = await Promise.all([
      selfie && selfie !== 'skipped' ? uploadToCloudinary(selfie, 'hrms/attendance/selfies').catch(err => {
        console.log('Selfie upload warning:', err.message);
        return null;
      }) : Promise.resolve(null),
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
      date: targetDate,
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

    // Parallelize selfie upload and DB lookups
    const [selfieData, attendance, officeMain, user] = await Promise.all([
      selfie && selfie !== 'skipped' ? uploadToCloudinary(selfie, 'hrms/attendance/selfies').catch(err => {
        console.log('Selfie upload warning:', err.message);
        return null;
      }) : Promise.resolve(null),
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

    const [isHoliday, approvedLeaves] = await Promise.all([
      Holiday.findOne({ holiday_date: { $gte: searchDateStart, $lte: searchDateEnd }, status: 'active' }),
      Leave.find({
        status: 'Approved',
        startDate: { $lte: searchDateEnd },
        endDate: { $gte: searchDateStart }
      })
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

        let status = 'Absent';
        if (leaveUserIdsSet.has(user._id.toString())) {
          status = 'On Leave';
        } else if (getISTDateComponents(searchDate).dayName === 'Sunday' || isHoliday) {
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
    const { latitude, longitude, address, accuracy, speed, altitude, heading, battery } = req.body;
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

    const previousOutside = attendance.isOutside;

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
