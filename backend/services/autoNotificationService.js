const notificationService = require('./notificationService');
const User = require('../models/User');

/**
 * Helper to identify database network errors
 */
const isNetworkError = (error) => {
  return (
    error &&
    (error.name === 'MongoNetworkError' ||
      error.name === 'MongoServerSelectionError' ||
      error.code === 'ENOTFOUND' ||
      error.code === 'ECONNRESET' ||
      error.message?.includes('getaddrinfo') ||
      error.message?.includes('connection') ||
      error.message?.includes('socket') ||
      error.message?.includes('ECONNRESET'))
  );
};

/**
 * Handle errors cleanly, avoiding huge stack traces for connection resets/network offline
 */
const handleAutoNotifError = (actionName, error) => {
  if (isNetworkError(error)) {
    console.warn(`⏰ Auto-notification: MongoDB connection offline or reset during ${actionName}.`);
  } else {
    console.error(`Error in ${actionName} auto-notification:`, error);
  }
};

/**
 * Service to handle automated notifications triggered by system events
 */

const Attendance = require('../models/Attendance');
const Notification = require('../models/Notification');
const EmployeeNotification = require('../models/EmployeeNotification');

/**
 * 1. Late Arrival Warning ⏰
 * Strictly sent ONLY to employees who clocked in with 'Late' status.
 */
const triggerLateArrival = async (employeeId, minutesLate, io = null) => {
  try {
    const employee = await User.findById(employeeId);
    if (!employee) return null;

    // Strict validation: Ensure user has clocked in today and status is 'Late'
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);

    const attendance = await Attendance.findOne({
      user: employeeId,
      date: { $gte: todayStart, $lte: todayEnd }
    });

    if (!attendance || (!attendance.isLate && attendance.status !== 'Late')) {
      return null;
    }

    const companyId = employee.companyId || employee.company || null;

    return await notificationService.createAndSendNotification({
      title: 'Late Arrival Warning ⏰',
      description: `You checked in late today for your scheduled shift (late by ${minutesLate || attendance.lateTime || 15} mins). Please maintain shift punctuality.`,
      type: 'attendance notification',
      autoType: 'Employee late by grace time',
      frequency: 'Instant',
      targetType: 'All Employees',
      employees: [employeeId],
      companyId,
      isAuto: true
    }, io);
  } catch (error) {
    handleAutoNotifError('triggerLateArrival', error);
  }
};

// In-memory cooldown tracking: employeeId (string) -> timestamp (ms)
const geofenceExitCooldown = new Map();
const geofenceEntryCooldown = new Map();
const ONE_HOUR_MS = 60 * 60 * 1000; // 1 hour cooldown for exit
const FIFTEEN_MIN_MS = 15 * 60 * 1000; // 15 min cooldown for entry

/**
 * 2. Geofence Exit Alert 📍
 * Rules:
 *  - STRICTLY requires employee to be actively punched in (clocked in today without punch out).
 *  - Rate-limited to at most ONCE per hour per employee.
 */
const triggerOutsideGeofence = async (employeeId, locationName = 'Office', io = null) => {
  try {
    if (!employeeId) return null;
    const empIdStr = employeeId.toString();

    // ── Rule 1: 1-Hour Cooldown (Memory + DB Fallback) ──
    const lastSent = geofenceExitCooldown.get(empIdStr);
    if (lastSent && (Date.now() - lastSent) < ONE_HOUR_MS) {
      return null;
    }

    const oneHourAgo = new Date(Date.now() - ONE_HOUR_MS);
    const recentNotif = await EmployeeNotification.findOne({
      employeeId: employeeId,
      autoType: 'Employee outside geofence',
      createdAt: { $gte: oneHourAgo }
    }).select('_id createdAt').lean();

    if (recentNotif) {
      geofenceExitCooldown.set(empIdStr, new Date(recentNotif.createdAt).getTime());
      return null;
    }

    // ── Rule 2: Punch-In Check (Must be actively clocked in right now) ──
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);

    const activeAttendance = await Attendance.findOne({
      user: employeeId,
      'punchIn.time': { $exists: true, $ne: null },
      $or: [
        { 'punchOut.time': { $exists: false } },
        { 'punchOut.time': null }
      ],
      date: { $gte: todayStart, $lte: todayEnd }
    }).select('_id status punchIn punchOut').lean();

    if (!activeAttendance) {
      // Employee has NOT punched in today or has already punched out -> DO NOT send alert
      return null;
    }

    const employee = await User.findById(employeeId).select('companyId company name').lean();
    if (!employee) return null;

    const companyId = employee.companyId || employee.company || null;

    // Record cooldown timestamp immediately to prevent concurrent batch alerts
    geofenceExitCooldown.set(empIdStr, Date.now());

    // Send alert strictly to that specific employee
    const empResult = await notificationService.createAndSendNotification({
      title: 'Geofence Exit Alert 📍',
      description: `You have exited the designated geofence boundary during shift hours. Please return to the workplace zone (${locationName}).`,
      type: 'tracing notification',
      autoType: 'Employee outside geofence',
      frequency: 'Instant',
      targetType: 'All Employees',
      employees: [employeeId],
      companyId,
      isAuto: true
    }, io);

    // Also notify Admins in Admin Notifications feed
    await notificationService.createAndSendNotification({
      title: 'Employee Outside Geofence ⚠️',
      description: `Employee ${employee.name || 'Staff'} has exited the designated geofence boundary (${locationName}) during shift hours.`,
      type: 'tracing notification',
      autoType: 'Employee outside geofence',
      frequency: 'Instant',
      targetType: 'Role-based Employees',
      targetRole: 'admin',
      companyId,
      isAuto: true
    }, io);

    return empResult;
  } catch (error) {
    handleAutoNotifError('triggerOutsideGeofence', error);
  }
};

/**
 * 3. Geofence Entry Recorded 📍
 * Rules:
 *  - Rate-limited to at most ONCE per 15 mins per employee.
 *  - Strictly requires employee to be actively punched in today.
 */
const triggerGeofenceEntry = async (employeeId, locationName = 'Office', io = null) => {
  try {
    if (!employeeId) return null;
    const empIdStr = employeeId.toString();

    // ── Cooldown Check ──
    const lastSent = geofenceEntryCooldown.get(empIdStr);
    if (lastSent && (Date.now() - lastSent) < FIFTEEN_MIN_MS) {
      return null;
    }

    const fifteenMinAgo = new Date(Date.now() - FIFTEEN_MIN_MS);
    const recentNotif = await EmployeeNotification.findOne({
      employeeId: employeeId,
      autoType: 'Employee inside geofence area',
      createdAt: { $gte: fifteenMinAgo }
    }).select('_id createdAt').lean();

    if (recentNotif) {
      geofenceEntryCooldown.set(empIdStr, new Date(recentNotif.createdAt).getTime());
      return null;
    }

    // ── Punch-In Check (Must be clocked in today) ──
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);

    const activeAttendance = await Attendance.findOne({
      user: employeeId,
      'punchIn.time': { $exists: true, $ne: null },
      $or: [
        { 'punchOut.time': { $exists: false } },
        { 'punchOut.time': null }
      ],
      date: { $gte: todayStart, $lte: todayEnd }
    }).select('_id status punchIn punchOut').lean();

    if (!activeAttendance) {
      return null;
    }

    const employee = await User.findById(employeeId).select('companyId company name').lean();
    if (!employee) return null;

    const companyId = employee.companyId || employee.company || null;
    geofenceEntryCooldown.set(empIdStr, Date.now());

    // Send alert strictly to that specific employee
    const empResult = await notificationService.createAndSendNotification({
      title: 'Geofence Entry Recorded 📍',
      description: `You have entered the designated geofence boundary for ${locationName}.`,
      type: 'tracing notification',
      autoType: 'Employee inside geofence area',
      frequency: 'Instant',
      targetType: 'All Employees',
      employees: [employeeId],
      companyId,
      isAuto: true
    }, io);

    // Also notify Admins in Admin Notifications feed
    await notificationService.createAndSendNotification({
      title: 'Employee Inside Geofence 📍',
      description: `Employee ${employee.name || 'Staff'} has entered the designated geofence boundary for ${locationName}.`,
      type: 'tracing notification',
      autoType: 'Employee inside geofence area',
      frequency: 'Instant',
      targetType: 'Role-based Employees',
      targetRole: 'admin',
      companyId,
      isAuto: true
    }, io);

    return empResult;
  } catch (err) {
    handleAutoNotifError('triggerGeofenceEntry', err);
  }
};

/**
 * 4. Absent Notification 🔴
 */
const triggerEmployeeAbsent = async (employeeId, dateStr, io = null) => {
  try {
    const employee = await User.findById(employeeId);
    if (!employee) return null;

    const companyId = employee.companyId || employee.company || null;

    return await notificationService.createAndSendNotification({
      title: 'Absent Notification 🔴',
      description: `You have been marked ABSENT for your shift (${dateStr}). If this is a mistake, please contact HR immediately.`,
      type: 'attendance notification',
      autoType: 'Employee absent',
      frequency: 'Instant',
      targetType: 'All Employees',
      employees: [employeeId],
      companyId,
      isAuto: true
    }, io);
  } catch (error) {
    handleAutoNotifError('triggerEmployeeAbsent', error);
  }
};

/**
 * 5. Leave Request Created (Notify Approver / Manager) 📋
 */
const triggerLeaveRequested = async (approverId, employeeName = 'Staff', leaveType = 'Leave', io = null, companyId = null) => {
  try {
    return await notificationService.createAndSendNotification({
      title: 'New Leave Request 📋',
      description: `Employee ${employeeName} has submitted a pending leave request for ${leaveType}. Please review and take action.`,
      type: 'general notification',
      autoType: 'Leave requested',
      frequency: 'Instant',
      targetType: 'All Employees',
      targetRole: approverId ? null : 'admin',
      employees: approverId ? [approverId] : [],
      companyId,
      isAuto: true
    }, io);
  } catch (error) {
    handleAutoNotifError('triggerLeaveRequested', error);
  }
};

/**
 * 6. Leave Request Approved! 🎉
 */
const triggerLeaveApproved = async (employeeId, leaveType = 'Leave', io = null) => {
  try {
    const employee = await User.findById(employeeId);
    if (!employee) return null;

    const companyId = employee.companyId || employee.company || null;

    return await notificationService.createAndSendNotification({
      title: 'Leave Request Approved! 🎉',
      description: `Good news! Your leave request for ${leaveType} has been reviewed and approved by management.`,
      type: 'general notification',
      autoType: 'Leave approved',
      frequency: 'Instant',
      targetType: 'All Employees',
      employees: [employeeId],
      companyId,
      isAuto: true
    }, io);
  } catch (error) {
    handleAutoNotifError('triggerLeaveApproved', error);
  }
};

/**
 * Leave Request Rejected ❌
 */
const triggerLeaveRejected = async (employeeId, leaveType = 'Leave', reason = '', io = null) => {
  try {
    const employee = await User.findById(employeeId);
    if (!employee) return null;

    const companyId = employee.companyId || employee.company || null;

    return await notificationService.createAndSendNotification({
      title: 'Leave Request Rejected ❌',
      description: `Your leave request for ${leaveType} was not approved.${reason ? ` Reason: ${reason}` : ''}`,
      type: 'general notification',
      autoType: 'Leave rejected',
      frequency: 'Instant',
      targetType: 'All Employees',
      employees: [employeeId],
      companyId,
      isAuto: true
    }, io);
  } catch (error) {
    handleAutoNotifError('triggerLeaveRejected', error);
  }
};

/**
 * 7. Punch Out Reminder 🕒
 */
const triggerPunchOutReminder = async (employeeId, shiftName = 'Shift', io = null) => {
  try {
    const employee = await User.findById(employeeId);
    if (!employee) return null;

    const companyId = employee.companyId || employee.company || null;

    return await notificationService.createAndSendNotification({
      title: 'Punch Out Reminder 🕒',
      description: `Your shift has ended (${shiftName}). Please remember to clock out to record your working hours correctly.`,
      type: 'attendance notification',
      autoType: 'Employee punch out reminder',
      frequency: 'Instant',
      targetType: 'All Employees',
      employees: [employeeId],
      companyId,
      isAuto: true
    }, io);
  } catch (error) {
    handleAutoNotifError('triggerPunchOutReminder', error);
  }
};

/**
 * 8. Shift Schedule Updated 🚀
 */
const triggerShiftStartingReminder = async (employeeId, timingStr = 'your shift', io = null) => {
  try {
    const employee = await User.findById(employeeId);
    if (!employee) return null;

    const companyId = employee.companyId || employee.company || null;

    return await notificationService.createAndSendNotification({
      title: 'Shift Schedule Updated 🚀',
      description: `Your work shift schedule has been updated (${timingStr}). Please verify your new timing in the app.`,
      type: 'general notification',
      autoType: 'Shift change reminder',
      frequency: 'Instant',
      targetType: 'All Employees',
      employees: [employeeId],
      companyId,
      isAuto: true
    }, io);
  } catch (error) {
    handleAutoNotifError('triggerShiftStartingReminder', error);
  }
};

/**
 * 9. Office/Working Relocation Update 🏢
 */
const triggerWorkplaceRelocated = async (employeeId, locationName = 'Main Office', io = null) => {
  try {
    const employee = await User.findById(employeeId);
    if (!employee) return null;

    const companyId = employee.companyId || employee.company || null;

    return await notificationService.createAndSendNotification({
      title: 'Office/working Relocation Update',
      description: `Please note that your working headquarters was changed to ${locationName}.`,
      type: 'general notification',
      autoType: 'Workplace relocated',
      frequency: 'Instant',
      targetType: 'All Employees',
      employees: [employeeId],
      companyId,
      isAuto: true
    }, io);
  } catch (error) {
    handleAutoNotifError('triggerWorkplaceRelocated', error);
  }
};

/**
 * 10. New Customer Visit Assigned 💼
 */
const triggerCustomerVisitCreated = async (employeeId, customerName = 'Client', scheduledDetails = '', io = null, companyId = null) => {
  try {
    const employee = await User.findById(employeeId);
    if (!employee) return null;

    const effectiveCompanyId = companyId || employee.companyId || employee.company || null;

    return await notificationService.createAndSendNotification({
      title: 'New Customer Visit Assigned 💼',
      description: `You have been assigned a new customer visit for ${customerName} (${scheduledDetails || 'meeting and inspection'}).`,
      type: 'customer visit notification',
      autoType: 'Customer visit created',
      frequency: 'Instant',
      targetType: 'All Employees',
      employees: [employeeId],
      companyId: effectiveCompanyId,
      isAuto: true
    }, io);
  } catch (error) {
    handleAutoNotifError('triggerCustomerVisitCreated', error);
  }
};

/**
 * 11. Customer Visit Completed ✅
 */
const triggerCustomerVisitCompleted = async (employeeId, customerName = 'Client', io = null, companyId = null) => {
  try {
    const employee = await User.findById(employeeId);
    if (!employee) return null;

    const effectiveCompanyId = companyId || employee.companyId || employee.company || null;

    return await notificationService.createAndSendNotification({
      title: 'Customer Visit Completed ✅',
      description: `Your customer visit report and check-out selfie for ${customerName} have been recorded successfully.`,
      type: 'customer visit notification',
      autoType: 'Customer visit completed',
      frequency: 'Instant',
      targetType: 'All Employees',
      employees: [employeeId],
      companyId: effectiveCompanyId,
      isAuto: true
    }, io);
  } catch (error) {
    handleAutoNotifError('triggerCustomerVisitCompleted', error);
  }
};

/**
 * 12. Missing Attendance Check ❓
 */
const triggerAttendanceMissing = async (employeeId, dateStr, io = null) => {
  try {
    const employee = await User.findById(employeeId);
    if (!employee) return null;

    const companyId = employee.companyId || employee.company || null;

    return await notificationService.createAndSendNotification({
      title: 'Missing Attendance Check ❓',
      description: `You did not record attendance for ${dateStr}. Please complete your logs.`,
      type: 'attendance notification',
      autoType: 'Attendance missing',
      frequency: 'Instant',
      targetType: 'All Employees',
      employees: [employeeId],
      companyId,
      isAuto: true
    }, io);
  } catch (err) {
    handleAutoNotifError('triggerAttendanceMissing', err);
  }
};

module.exports = {
  triggerLateArrival,
  triggerOutsideGeofence,
  triggerGeofenceEntry,
  triggerEmployeeAbsent,
  triggerLeaveRequested,
  triggerLeaveApproved,
  triggerLeaveRejected,
  triggerPunchOutReminder,
  triggerShiftStartingReminder,
  triggerWorkplaceRelocated,
  triggerCustomerVisitCreated,
  triggerCustomerVisitCompleted,
  triggerAttendanceMissing,
};
