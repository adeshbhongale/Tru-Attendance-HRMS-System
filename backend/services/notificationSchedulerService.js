const mongoose = require('mongoose');
const Notification = require('../models/Notification');
const NotificationLog = require('../models/NotificationLog');
const EmployeeNotification = require('../models/EmployeeNotification');
const User = require('../models/User');
const Leave = require('../models/Leave');
const Shift = require('../models/Shift');
const Holiday = require('../models/Holiday');
const Attendance = require('../models/Attendance');
const MobileAppConfig = require('../models/MobileAppConfig');
const { isAutoNotificationBlocked, isUserActive, isUserAttendanceBlocked } = require('../utils/accessControlHelper');
const { getISTDateComponents, createDateFromIST, getStartOfDayIST, getEndOfDayIST } = require('../utils/timezone');
const firebaseService = require('./firebaseService');
const { resolveTargetEmployees } = require('./notificationService');

let schedulerInterval = null;

/**
 * Dispatches a notification that has been previously saved in the database as scheduled
 */
const dispatchNotificationDocument = async (notification, io = null) => {
  if (mongoose.connection.readyState !== 1) {
    console.warn(`⏰ Notification scheduler: Database offline. Bypassing dispatch for campaign: "${notification.title}"`);
    return;
  }
  try {
    // 1. Resolve matching employees
    let targetUsers = await resolveTargetEmployees(notification.targetType, {
      departments: notification.departments,
      employees: notification.employees,
    }, notification.companyId || null);

    const mobileConfig = notification.companyId ? await MobileAppConfig.findOne({ companyId: notification.companyId }) : null;
    targetUsers = targetUsers.filter(user => {
      if (!isUserActive(user)) return false;
      if (notification.isAuto && isAutoNotificationBlocked(user, notification.type, notification.autoType, mobileConfig, user.levelRef)) {
        return false;
      }
      return true;
    });

    if (notification.isAuto && notification.autoType) {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);

      // Find employees who already received this automated workflow notification today
      const alreadyNotifiedEmpIds = await EmployeeNotification.find({
        autoType: notification.autoType,
        createdAt: { $gte: todayStart, $lte: todayEnd }
      }).distinct('employeeId');

      if (alreadyNotifiedEmpIds.length > 0) {
        const notifiedSet = new Set(alreadyNotifiedEmpIds.map(id => id.toString()));
        targetUsers = targetUsers.filter(user => !notifiedSet.has(user._id.toString()));
      }
    }

    if (targetUsers.length === 0) {
      if (notification.status !== 'draft') {
        notification.status = 'sent';
        await notification.save();
      }
      return;
    }

    // 2. Prepare data structures for bulk operations
    const logsToCreate = [];
    const inAppFeedsToCreate = [];
    const tokensToSend = [];
    const tokenToEmployeeMap = {};

    for (const user of targetUsers) {
      inAppFeedsToCreate.push({
        employeeId: user._id,
        notificationId: notification._id,
        title: notification.title,
        body: notification.description,
        type: notification.type,
        autoType: notification.autoType || null,
        isRead: false,
      });

      if (user.fcmToken) {
        tokensToSend.push(user.fcmToken);
        tokenToEmployeeMap[user.fcmToken] = user._id;
      } else {
        logsToCreate.push({
          notificationId: notification._id,
          companyId: notification.companyId || null,
          employeeId: user._id,
          fcmToken: null,
          sentAt: new Date(),
          deliveredAt: null,
          isRead: false,
          deliveryStatus: 'failed',
          deviceType: user.deviceType || 'Web',
          errorMessage: 'Device token not registered',
        });
      }
    }

    // Bulk create in-app feed records
    if (inAppFeedsToCreate.length > 0) {
      await EmployeeNotification.insertMany(inAppFeedsToCreate);
    }

    // 3. Dispatch FCM pushes
    if (tokensToSend.length > 0) {
      const fcmResult = await firebaseService.sendMulticast(tokensToSend, notification.title, notification.description, {
        notificationId: notification._id.toString(),
        type: notification.type,
      });

      if (fcmResult.success && fcmResult.responses) {
        fcmResult.responses.forEach((resp) => {
          const empId = tokenToEmployeeMap[resp.token];
          if (resp.success) {
            logsToCreate.push({
              notificationId: notification._id,
              companyId: notification.companyId || null,
              employeeId: empId,
              fcmToken: resp.token,
              sentAt: new Date(),
              deliveredAt: new Date(),
              isRead: false,
              deliveryStatus: 'delivered',
              deviceType: 'Mobile',
              errorMessage: null,
            });
          } else {
            logsToCreate.push({
              notificationId: notification._id,
              companyId: notification.companyId || null,
              employeeId: empId,
              fcmToken: resp.token,
              sentAt: new Date(),
              deliveredAt: null,
              isRead: false,
              deliveryStatus: 'failed',
              deviceType: 'Mobile',
              errorMessage: resp.error || 'FCM delivery failed',
            });
          }
        });
      } else {
        tokensToSend.forEach((tok) => {
          const empId = tokenToEmployeeMap[tok];
          logsToCreate.push({
            notificationId: notification._id,
            companyId: notification.companyId || null,
            employeeId: empId,
            fcmToken: tok,
            sentAt: new Date(),
            deliveredAt: null,
            isRead: false,
            deliveryStatus: 'failed',
            deviceType: 'Mobile',
            errorMessage: fcmResult.error || 'FCM connection error',
          });
        });
      }
    }

    // Bulk insert logs
    if (logsToCreate.length > 0) {
      await NotificationLog.insertMany(logsToCreate);
    }

    // Update main notification status or shift schedule if recurring
    if (notification.frequency && notification.frequency !== 'Instant' && notification.frequency !== 'Custom Schedule') {
      const nextDate = new Date(notification.scheduledAt || new Date());
      if (notification.frequency === 'Daily') {
        nextDate.setDate(nextDate.getDate() + 1);
      } else if (notification.frequency === 'Weekly') {
        nextDate.setDate(nextDate.getDate() + 7);
      } else if (notification.frequency === 'Monthly') {
        nextDate.setMonth(nextDate.getMonth() + 1);
      } else if (notification.frequency === 'Repeat Every X Hours') {
        nextDate.setHours(nextDate.getHours() + 2);
      }
      notification.scheduledAt = nextDate;
      notification.status = 'scheduled'; // Keep it active for the next automated execution
    } else {
      notification.status = 'sent';
    }
    await notification.save();

    // 4. Fire Socket.io real-time updates
    if (io) {
      targetUsers.forEach(user => {
        io.emit(`notificationBadgeUpdate:${user._id}`, { unreadCountIncrement: 1 });
      });

      io.emit('notificationLiveUpdate', {
        notificationId: notification._id,
        title: notification.title,
        type: notification.type,
        sentCount: logsToCreate.filter(l => l.deliveryStatus === 'delivered' || l.deliveryStatus === 'sent').length,
        failedCount: logsToCreate.filter(l => l.deliveryStatus === 'failed').length,
      });
    }

    console.log(`⏰ Scheduled Notification "${notification.title}" dispatched successfully to ${targetUsers.length} employees.`);
  } catch (error) {
    console.error(`Error dispatching scheduled notification ${notification._id}:`, error.message || error);
    if (mongoose.connection.readyState === 1) {
      try {
        if (notification.status !== 'draft') {
          notification.status = 'sent';
          await notification.save();
        }
      } catch (saveErr) { }
    }
  }
};

/**
 * Processes automated workflows for absent and late employees dynamically
 */
const processAutomaticWorkflows = async (io = null) => {
  try {
    if (mongoose.connection.readyState !== 1) return;

    const now = new Date();
    const todayStart = getStartOfDayIST(now);
    const todayEnd = getEndOfDayIST(now);
    const istNow = getISTDateComponents(now);
    const currentDayName = istNow.dayName;

    const autoNotif = require('./autoNotificationService');

    // 2. Fetch active employees with their shifts and level populated
    const employees = await User.find({
      status: { $in: ['ACTIVE', 'active'] },
      role: { $nin: ['superadmin', 'super_admin'] }
    }).populate('shift').populate('levelRef');

    const configCache = new Map();
    const getConfigForCompany = async (compId) => {
      if (!compId) return null;
      const key = compId.toString();
      if (!configCache.has(key)) {
        const cfg = await MobileAppConfig.findOne({ companyId: compId });
        configCache.set(key, cfg);
      }
      return configCache.get(key);
    };

    for (const employee of employees) {
      if (mongoose.connection.readyState !== 1) {
        console.warn('⏰ Background Scheduler: MongoDB connection lost mid-loop. Aborting automatic workflows check.');
        break;
      }
      if (!isUserActive(employee)) continue;
      if (!employee.shift) continue;

      const compId = employee.companyId || employee.company;
      const mobileConfig = await getConfigForCompany(compId);

      // If attendance is stopped/blocked for this employee by Super Admin, skip attendance workflows
      if (isUserAttendanceBlocked(employee, mobileConfig, employee.levelRef)) {
        continue;
      }

      const shift = employee.shift;

      // Skip checking if today is a designated weekly off day for their shift
      if (shift.weeklyOff && shift.weeklyOff.includes(currentDayName)) {
        continue;
      }

      // Check if today is an active holiday for this specific company
      const holidayToday = await Holiday.findOne({
        status: 'active',
        ...(compId ? { companyId: compId } : {}),
        holiday_date: { $gte: todayStart, $lte: todayEnd }
      });
      if (holidayToday) {
        continue; // Company holiday
      }

      // 3. Skip checking if the employee has an approved leave today
      const onLeave = await Leave.findOne({
        user: employee._id,
        status: 'Approved',
        startDate: { $lte: todayEnd },
        endDate: { $gte: todayStart }
      });
      if (onLeave) {
        if (onLeave.duration !== 'Half Day') {
          continue; // Full day leave
        }
        // If half day, skip only if current time falls within that half-day session
        const [startHour] = shift.startTime.split(':').map(Number);
        const [endHour] = shift.endTime.split(':').map(Number);
        const midHour = (startHour + endHour) / 2;
        const isSession1 = onLeave.session === 'Session 1' || (onLeave.startTime && onLeave.startTime < '13:00');
        if (isSession1 && now.getHours() < midHour) {
          continue;
        } else if (!isSession1 && now.getHours() >= midHour) {
          continue;
        }
      }

      // 4. Check if employee has punched in today
      const attendance = await Attendance.findOne({
        user: employee._id,
        date: { $gte: todayStart, $lte: todayEnd }
      });

      const hasPunchedIn = attendance && attendance.punchIn && attendance.punchIn.time;

      if (hasPunchedIn) {
        // If the employee punches in, dynamically mark any unread absent alerts sent today as read
        await EmployeeNotification.updateMany(
          {
            employeeId: employee._id,
            isRead: false,
            type: 'attendance notification',
            autoType: 'Employee absent',
            createdAt: { $gte: todayStart, $lte: todayEnd }
          },
          { isRead: true, readAt: new Date() }
        );

        // Check if employee forgot to punch out after shift ended
        const hasPunchedOut = attendance.punchOut && attendance.punchOut.time;
        if (!hasPunchedOut) {
          // Parse shift times
          const [startHour, startMin] = shift.startTime.split(':').map(Number);
          const [endHour, endMin] = shift.endTime.split(':').map(Number);

          const shiftStart = createDateFromIST(istNow.year, istNow.month, istNow.date, startHour, startMin || 0);
          const isNightShift = endHour < startHour || (endHour === startHour && (endMin || 0) < (startMin || 0));
          const shiftEnd = createDateFromIST(istNow.year, istNow.month, isNightShift ? istNow.date + 1 : istNow.date, endHour, endMin || 0);

          // Check if 2 hours have passed since shift end (e.g. shift ends 6:00 PM -> send reminder at 8:00 PM)
          const twoHoursPastShiftEnd = new Date(shiftEnd.getTime() + 2 * 60 * 60 * 1000);
          if (now >= twoHoursPastShiftEnd) {
            // Avoid double-sending punch out reminder today (send strictly once)
            const sentReminderToday = await EmployeeNotification.findOne({
              employeeId: employee._id,
              autoType: 'Employee punch out reminder',
              createdAt: { $gte: todayStart, $lte: todayEnd }
            });

            if (!sentReminderToday) {
              await autoNotif.triggerPunchOutReminder(employee._id, shift.name, io);
            }
          }
        }

        continue; // Employee is physically present, skip further alerts
      }

      // Parse shift startTime and endTime (format HH:mm)
      const [startHour, startMin] = shift.startTime.split(':').map(Number);
      const [endHour, endMin] = shift.endTime.split(':').map(Number);

      const shiftStart = createDateFromIST(istNow.year, istNow.month, istNow.date, startHour, startMin || 0);
      const isNightShift = endHour < startHour || (endHour === startHour && (endMin || 0) < (startMin || 0));
      const shiftEnd = createDateFromIST(istNow.year, istNow.month, isNightShift ? istNow.date + 1 : istNow.date, endHour, endMin || 0);

      // Calculate the late grace period threshold
      const gracePeriodMinutes = shift.gracePeriod || 15;
      const graceTimeThreshold = new Date(shiftStart.getTime() + gracePeriodMinutes * 60000);

      // Calculate shift duration and 70% threshold
      const shiftDurationMs = shiftEnd.getTime() - shiftStart.getTime();
      const absentThresholdTime = new Date(shiftStart.getTime() + shiftDurationMs * 0.7);

      // If their shift has not started yet today, wait
      if (now < shiftStart) {
        continue;
      }

      // Avoid double-sending notifications today
      const sentAbsentToday = await EmployeeNotification.findOne({
        employeeId: employee._id,
        autoType: 'Employee absent',
        createdAt: { $gte: todayStart, $lte: todayEnd }
      });

      // A. Trigger ABSENT Alert when shift time ends past 70% duration
      if (now >= absentThresholdTime) {
        if (!sentAbsentToday) {
          const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
          await autoNotif.triggerEmployeeAbsent(employee._id, dateStr, io);
        }
      }
    }
  } catch (error) {
    const isNetworkError =
      error.name === 'MongoNetworkError' ||
      error.name === 'MongoServerSelectionError' ||
      error.code === 'ENOTFOUND' ||
      error.code === 'ECONNRESET' ||
      error.message?.includes('getaddrinfo') ||
      error.message?.includes('connection') ||
      error.message?.includes('socket') ||
      error.message?.includes('ECONNRESET');

    if (isNetworkError) {
      console.warn('⏰ Background Scheduler: MongoDB connection reset or offline during automatic workflows check. Reconnecting...');
    } else {
      console.error('⏰ Background Scheduler: Error running automatic workflows check:', error.message || error);
    }
  }
};

/**
 * Runs a check for scheduled notifications whose scheduled time has arrived or passed
 */
const checkAndDispatchScheduled = async (io = null) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return;
    }
    const now = new Date();

    // 1. Process custom-composed scheduled announcements
    const pendingNotifications = await Notification.find({
      status: 'scheduled',
      scheduledAt: { $lte: now }
    });

    if (pendingNotifications.length > 0) {
      console.log(`⏰ Found ${pendingNotifications.length} pending scheduled notifications to dispatch.`);
      for (const notification of pendingNotifications) {
        await dispatchNotificationDocument(notification, io);
      }
    }

    // 2. Process automatic background workflows (absent/late grace alerts)
    await processAutomaticWorkflows(io);

  } catch (error) {
    const isNetworkError =
      error.name === 'MongoNetworkError' ||
      error.name === 'MongoServerSelectionError' ||
      error.code === 'ENOTFOUND' ||
      error.code === 'ECONNRESET' ||
      error.message?.includes('getaddrinfo') ||
      error.message?.includes('connection') ||
      error.message?.includes('socket') ||
      error.message?.includes('ECONNRESET');

    if (isNetworkError) {
      // Quiet warning for unreachable database, avoids flooding stack traces
      console.warn('⏰ Background Notification Scheduler: MongoDB host is currently offline or unreachable. Reconnection is in progress...');
    } else {
      console.error('Error running scheduled notification dispatcher check:', error.message || error);
    }
  }
};

/**
 * Starts the background scheduler loop
 */
const startScheduler = (io = null) => {
  if (schedulerInterval) return;

  console.log('⏰ Starting Background Notification Scheduler service...');

  // Run check immediately on start
  checkAndDispatchScheduled(io);

  // Set periodic timer (every 30 seconds)
  schedulerInterval = setInterval(() => {
    checkAndDispatchScheduled(io);
  }, 30000);
};

/**
 * Stops the background scheduler loop
 */
const stopScheduler = () => {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log('⏰ Background Notification Scheduler service stopped.');
  }
};

module.exports = {
  startScheduler,
  stopScheduler,
  checkAndDispatchScheduled,
  dispatchNotificationDocument
};
