const mongoose = require('mongoose');
const Notification = require('../models/Notification');
const NotificationLog = require('../models/NotificationLog');
const EmployeeNotification = require('../models/EmployeeNotification');
const User = require('../models/User');
const Leave = require('../models/Leave');
const Shift = require('../models/Shift');
const Holiday = require('../models/Holiday');
const Attendance = require('../models/Attendance');
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
    });

    if (notification.isAuto) {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);

      // Find all automated notifications of this type sent today
      const autoNotificationIds = await Notification.find({
        isAuto: true,
        type: notification.type,
        createdAt: { $gte: todayStart, $lte: todayEnd }
      }).distinct('_id');

      if (autoNotificationIds.length > 0) {
        // Find employees who already received one of these notifications today
        const alreadyNotifiedEmpIds = await EmployeeNotification.find({
          notificationId: { $in: autoNotificationIds }
        }).distinct('employeeId');

        const notifiedSet = new Set(alreadyNotifiedEmpIds.map(id => id.toString()));
        targetUsers = targetUsers.filter(user => !notifiedSet.has(user._id.toString()));
      }
    }

    if (targetUsers.length === 0) {
      notification.status = 'failed';
      await notification.save();
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
        isRead: false,
      });

      if (user.fcmToken) {
        tokensToSend.push(user.fcmToken);
        tokenToEmployeeMap[user.fcmToken] = user._id;
      } else {
        logsToCreate.push({
          notificationId: notification._id,
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
    if (notification.frequency && notification.frequency !== 'Instant' && notification.frequency !== 'Custom Schedule' && notification.frequency !== 'Repeat Every X Hours') {
      const nextDate = new Date(notification.scheduledAt || new Date());
      if (notification.frequency === 'Daily') {
        nextDate.setDate(nextDate.getDate() + 1);
      } else if (notification.frequency === 'Weekly') {
        nextDate.setDate(nextDate.getDate() + 7);
      } else if (notification.frequency === 'Monthly') {
        nextDate.setMonth(nextDate.getMonth() + 1);
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
        notification.status = 'failed';
        await notification.save();
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
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);

    // Get current day name (e.g. "Monday")
    const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const currentDayName = daysOfWeek[now.getDay()];

    // 1. Fetch active holidays today
    const holidayToday = await Holiday.findOne({
      status: 'active',
      holiday_date: { $gte: todayStart, $lte: todayEnd }
    });
    if (holidayToday) {
      return; // Today is a public holiday
    }

    const autoNotif = require('./autoNotificationService');

    // 2. Fetch active employees with their shifts populated
    const employees = await User.find({ role: 'employee', status: 'active' }).populate('shift');

    for (const employee of employees) {
      if (!employee.shift) continue;

      const shift = employee.shift;

      // Skip checking if today is a designated weekly off day for their shift
      if (shift.weeklyOff && shift.weeklyOff.includes(currentDayName)) {
        continue;
      }

      // 3. Skip checking if the employee has an approved leave today
      const onLeave = await Leave.findOne({
        user: employee._id,
        status: 'Approved',
        startDate: { $lte: todayEnd },
        endDate: { $gte: todayStart }
      });
      if (onLeave) {
        continue;
      }

      // 4. Check if employee has punched in today
      const attendance = await Attendance.findOne({
        user: employee._id,
        date: { $gte: todayStart, $lte: todayEnd }
      });

      const hasPunchedIn = attendance && attendance.punchIn && attendance.punchIn.time;

      if (hasPunchedIn) {
        // "after late time over then this notification automatically gone"
        // If the employee punches in, dynamically mark any unread late arrival/attendance alerts sent today as read
        await EmployeeNotification.updateMany(
          {
            employeeId: employee._id,
            isRead: false,
            type: 'attendance notification',
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

          const shiftStart = new Date(now);
          shiftStart.setHours(startHour, startMin, 0, 0);

          const shiftEnd = new Date(now);
          shiftEnd.setHours(endHour, endMin, 0, 0);

          // Account for overnight shifts
          if (shiftEnd < shiftStart) {
            shiftEnd.setDate(shiftEnd.getDate() + 1);
          }

          // Check if 1 hour has passed since shift end
          const oneHourPastShiftEnd = new Date(shiftEnd.getTime() + 60 * 60 * 1000);
          if (now >= oneHourPastShiftEnd) {
            // Avoid double-sending punch out reminder today
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

      const shiftStart = new Date(now);
      shiftStart.setHours(startHour, startMin, 0, 0);

      const shiftEnd = new Date(now);
      shiftEnd.setHours(endHour, endMin, 0, 0);

      // Account for overnight shifts
      if (shiftEnd < shiftStart) {
        shiftEnd.setDate(shiftEnd.getDate() + 1);
      }

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
      const sentLateToday = await EmployeeNotification.findOne({
        employeeId: employee._id,
        autoType: 'Employee late by grace time',
        createdAt: { $gte: todayStart, $lte: todayEnd }
      });

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
      // B. Trigger LATE Coming Alert when grace time threshold has passed
      else if (now >= graceTimeThreshold) {
        if (!sentLateToday) {
          const diffMs = now.getTime() - shiftStart.getTime();
          const minutesLate = Math.round(diffMs / 60000);
          await autoNotif.triggerLateArrival(employee._id, minutesLate, io);
        }
      }
    }
  } catch (error) {
    const isNetworkError =
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
      error.name === 'MongoServerSelectionError' ||
      error.code === 'ENOTFOUND' ||
      error.code === 'ECONNRESET' ||
      error.message?.includes('getaddrinfo') ||
      error.message?.includes('connection') ||
      error.message?.includes('socket');

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
