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

/**
 * 1. Late Arrival Warning ⏰
 */
const triggerLateArrival = async (employeeId, minutesLate, io = null) => {
  try {
    const employee = await User.findById(employeeId);
    if (!employee) return null;

    const companyId = employee.companyId || employee.company || null;

    return await notificationService.createAndSendNotification({
      title: 'Late Arrival Warning ⏰',
      description: `You checked in late today for your scheduled shift (late by ${minutesLate} mins). Please maintain shift punctuality.`,
      type: 'attendance notification',
      autoType: 'Employee late by grace time',
      frequency: 'Instant',
      targetType: 'Specific Employees',
      employees: [employeeId],
      companyId,
      isAuto: true
    }, io);
  } catch (error) {
    handleAutoNotifError('triggerLateArrival', error);
  }
};

/**
 * 2. Geofence Exit Alert 📍
 */
const triggerOutsideGeofence = async (employeeId, locationName = 'Office', io = null) => {
  try {
    const employee = await User.findById(employeeId);
    if (!employee) return null;

    const companyId = employee.companyId || employee.company || null;

    const notifEmployee = await notificationService.createAndSendNotification({
      title: 'Geofence Exit Alert 📍',
      description: `You have exited the designated geofence boundary during shift hours. Please return to the workplace zone (${locationName}).`,
      type: 'tracing notification',
      autoType: 'Employee outside geofence',
      frequency: 'Instant',
      targetType: 'Specific Employees',
      employees: [employeeId],
      companyId,
      isAuto: true
    }, io);

    // Alert Admin
    await notificationService.createAndSendNotification({
      title: 'Employee Outside Geofence Alert 📍',
      description: `Employee ${employee.name} (${employee.email}) has exited the geofence boundary for ${locationName}.`,
      type: 'tracing notification',
      frequency: 'Instant',
      targetType: 'Role-based Employees',
      targetRole: 'admin',
      companyId,
      isAuto: false
    }, io);

    return notifEmployee;
  } catch (error) {
    handleAutoNotifError('triggerOutsideGeofence', error);
  }
};

/**
 * 3. Geofence Entry Recorded 📍
 */
const triggerGeofenceEntry = async (employeeId, locationName = 'Office', io = null) => {
  try {
    const employee = await User.findById(employeeId);
    if (!employee) return null;

    const companyId = employee.companyId || employee.company || null;

    const notifEmployee = await notificationService.createAndSendNotification({
      title: 'Geofence Entry Recorded 📍',
      description: `You have entered the designated geofence boundary for ${locationName}.`,
      type: 'tracing notification',
      autoType: 'Employee inside geofence area',
      frequency: 'Instant',
      targetType: 'Specific Employees',
      employees: [employeeId],
      companyId,
      isAuto: true
    }, io);

    // Alert Admin
    await notificationService.createAndSendNotification({
      title: 'Employee Inside Geofence Alert 📍',
      description: `Employee ${employee.name} (${employee.email}) has entered the geofence boundary for ${locationName}.`,
      type: 'tracing notification',
      frequency: 'Instant',
      targetType: 'Role-based Employees',
      targetRole: 'admin',
      companyId,
      isAuto: false
    }, io);

    return notifEmployee;
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
      targetType: 'Specific Employees',
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
      targetType: approverId ? 'Specific Employees' : 'Role-based Employees',
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
      targetType: 'Specific Employees',
      employees: [employeeId],
      companyId,
      isAuto: true
    }, io);
  } catch (error) {
    handleAutoNotifError('triggerLeaveApproved', error);
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
      description: `Your shift is ending shortly (${shiftName}). Please remember to clock out to record your working hours correctly.`,
      type: 'attendance notification',
      autoType: 'Employee punch out reminder',
      frequency: 'Instant',
      targetType: 'Specific Employees',
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
      targetType: 'Specific Employees',
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
      targetType: 'Specific Employees',
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
      targetType: 'Specific Employees',
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
      targetType: 'Specific Employees',
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
      targetType: 'Specific Employees',
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
  triggerPunchOutReminder,
  triggerShiftStartingReminder,
  triggerWorkplaceRelocated,
  triggerCustomerVisitCreated,
  triggerCustomerVisitCompleted,
  triggerAttendanceMissing,
};
