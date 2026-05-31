const Notification = require('../models/Notification');
const NotificationLog = require('../models/NotificationLog');
const EmployeeNotification = require('../models/EmployeeNotification');
const User = require('../models/User');
const firebaseService = require('./firebaseService');

/**
 * Service to manage high-level notification delivery and targeting
 */

/**
 * Resolves the targeting query to return a list of matching Employee User documents
 */
const resolveTargetEmployees = async (targetType, criteria = {}) => {
  const query = { role: 'employee', status: 'active' };

  switch (targetType) {
    case 'All Employees':
      break; // No extra filters

    case 'Specific Department':
      if (criteria.departments && criteria.departments.length > 0) {
        query.department = { $in: criteria.departments };
      }
      break;

    case 'Specific Employees':
      if (criteria.employees && criteria.employees.length > 0) {
        query._id = { $in: criteria.employees };
      } else {
        return []; // No employees provided
      }
      break;

    case 'Shift-based Employees':
      if (criteria.shiftId) {
        query.shift = criteria.shiftId;
      }
      break;

    case 'Location-based Employees':
      if (criteria.locationId) {
        query.workingPlace = criteria.locationId;
      }
      break;

    case 'Role-based Employees':
      if (criteria.targetRole) {
        query.role = criteria.targetRole;
      }
      break;

    default:
      break;
  }

  return await User.find(query);
};

/**
 * Creates, dispatches, and logs a notification
 */
const createAndSendNotification = async (notificationData, ioInstance = null) => {
  const {
    title,
    description,
    type,
    autoType = null,
    frequency = 'Instant',
    targetType = 'All Employees',
    departments = [],
    employees = [],
    scheduledAt = null,
    createdBy = null,
    isAuto = false,
    shiftId = null,
    locationId = null,
    targetRole = null,
  } = notificationData;

  // 1. Create main Notification record
  const notification = await Notification.create({
    title,
    description,
    type,
    autoType,
    frequency,
    targetType,
    departments,
    employees: targetType === 'Specific Employees' ? employees : [],
    scheduledAt,
    status: frequency === 'Instant' ? 'sent' : 'scheduled',
    createdBy,
    isAuto,
  });

  // If scheduled, stop here, scheduler will pick it up
  if (frequency !== 'Instant' || scheduledAt) {
    return notification;
  }

  // 2. Resolve matching employees
  let targetUsers = await resolveTargetEmployees(targetType, {
    departments,
    employees,
    shiftId,
    locationId,
    targetRole
  });

  if (isAuto) {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    // Find all automated notifications of this type sent today
    const queryCond = {
      isAuto: true,
      createdAt: { $gte: todayStart, $lte: todayEnd }
    };
    if (autoType) {
      queryCond.autoType = autoType;
    } else {
      queryCond.type = type;
    }

    const autoNotificationIds = await Notification.find(queryCond).distinct('_id');

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
    return notification;
  }

  // 3. Prepare data lists for processing
  const logsToCreate = [];
  const inAppFeedsToCreate = [];
  const tokensToSend = [];
  const tokenToEmployeeMap = {};

  for (const user of targetUsers) {
    // A. In-app notification center entry
    inAppFeedsToCreate.push({
      employeeId: user._id,
      notificationId: notification._id,
      title: title,
      body: description,
      type: type,
      autoType: autoType || null,
      isRead: false,
    });

    // B. Push notification token list
    if (user.fcmToken) {
      tokensToSend.push(user.fcmToken);
      tokenToEmployeeMap[user.fcmToken] = user._id;
    } else {
      // Create failure log because user has no FCM token
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

  // Bulk create in-app feeds
  if (inAppFeedsToCreate.length > 0) {
    await EmployeeNotification.insertMany(inAppFeedsToCreate);
  }

  // 4. Dispatch FCM push notifications
  if (tokensToSend.length > 0) {
    const fcmResult = await firebaseService.sendMulticast(tokensToSend, title, description, {
      notificationId: notification._id.toString(),
      type: type,
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
            deviceType: 'Mobile', // mobile token pushes
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
      // Complete FCM failure
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

  // Bulk create delivery logs
  if (logsToCreate.length > 0) {
    await NotificationLog.insertMany(logsToCreate);
  }

  // 5. Emit socket events for real-time dashboards
  if (ioInstance) {
    // Notify employees who are online to refresh their badge count
    targetUsers.forEach(user => {
      ioInstance.emit(`notificationBadgeUpdate:${user._id}`, { unreadCountIncrement: 1 });
      ioInstance.emit(`notificationReceived:${user._id}`, {
        title,
        body: description,
        type,
        notificationId: notification._id
      });
    });

    // Notify admins about live status updates
    ioInstance.emit('notificationLiveUpdate', {
      notificationId: notification._id,
      title: notification.title,
      type: notification.type,
      sentCount: logsToCreate.filter(l => l.deliveryStatus === 'delivered' || l.deliveryStatus === 'sent').length,
      failedCount: logsToCreate.filter(l => l.deliveryStatus === 'failed').length,
    });
  }

  return notification;
};

/**
 * Marks a notification as read for a specific employee
 */
const markAsRead = async (employeeId, employeeNotificationId, ioInstance = null) => {
  const empNotif = await EmployeeNotification.findOneAndUpdate(
    { _id: employeeNotificationId, employeeId },
    { isRead: true, readAt: new Date() },
    { new: true }
  );

  if (!empNotif) return null;

  // Also update corresponding delivery logs if it has a reference
  if (empNotif.notificationId) {
    await NotificationLog.findOneAndUpdate(
      { notificationId: empNotif.notificationId, employeeId },
      { isRead: true, readAt: new Date(), deliveryStatus: 'read' }
    );

    // Notify Admin Dashboard dynamically about the read event
    if (ioInstance) {
      ioInstance.emit('notificationLiveUpdate', {
        notificationId: empNotif.notificationId,
        action: 'read',
        employeeId,
      });
    }
  }

  return empNotif;
};

/**
 * Marks all notifications as read for a specific employee
 */
const markAllAsRead = async (employeeId, ioInstance = null) => {
  const readDate = new Date();
  
  // Find all unread personal notifications
  const unreadNotifs = await EmployeeNotification.find({ employeeId, isRead: false });
  const notificationIds = unreadNotifs.map(n => n.notificationId).filter(id => !!id);

  await EmployeeNotification.updateMany(
    { employeeId, isRead: false },
    { isRead: true, readAt: readDate }
  );

  if (notificationIds.length > 0) {
    await NotificationLog.updateMany(
      { notificationId: { $in: notificationIds }, employeeId },
      { isRead: true, readAt: readDate, deliveryStatus: 'read' }
    );
  }

  if (ioInstance) {
    ioInstance.emit(`notificationBadgeUpdate:${employeeId}`, { unreadCount: 0 });
    notificationIds.forEach(id => {
      ioInstance.emit('notificationLiveUpdate', {
        notificationId: id,
        action: 'read-all',
        employeeId,
      });
    });
  }

  return { success: true };
};

/**
 * Deletes a notification from employee's in-app center
 */
const deleteEmployeeNotification = async (employeeId, employeeNotificationId) => {
  return await EmployeeNotification.findOneAndDelete({ _id: employeeNotificationId, employeeId });
};

module.exports = {
  createAndSendNotification,
  resolveTargetEmployees,
  markAsRead,
  markAllAsRead,
  deleteEmployeeNotification,
};
