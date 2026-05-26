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
 * Triggers notification when employee is late by X minutes
 */
const triggerLateArrival = async (employeeId, minutesLate, io = null) => {
  try {
    const employee = await User.findById(employeeId);
    if (!employee) return null;

    return await notificationService.createAndSendNotification({
      title: 'Late Arrival Alert ⏰',
      description: `You checked in late by ${minutesLate} minutes today. Please maintain your shift schedule.`,
      type: 'attendance notification',
      autoType: 'Employee late by grace time',
      frequency: 'Instant',
      targetType: 'Specific Employees',
      employees: [employeeId],
      isAuto: true
    }, io);
  } catch (error) {
    handleAutoNotifError('triggerLateArrival', error);
  }
};

/**
 * Triggers notification when employee exits office geofence boundaries
 */
const triggerOutsideGeofence = async (employeeId, locationName = 'Office', io = null) => {
  try {
    const employee = await User.findById(employeeId);
    if (!employee) return null;

    return await notificationService.createAndSendNotification({
      title: 'Geofence Exit Alert 📍',
      description: `You have exited the designated geofence boundary for ${locationName}. Please stay inside the tracking zone during shift hours.`,
      type: 'tracing notification',
      autoType: 'Employee outside geofence',
      frequency: 'Instant',
      targetType: 'Specific Employees',
      employees: [employeeId],
      isAuto: true
    }, io);
  } catch (error) {
    handleAutoNotifError('triggerOutsideGeofence', error);
  }
};

/**
 * Triggers notification when employee is marked absent
 */
const triggerEmployeeAbsent = async (employeeId, dateStr, io = null) => {
  try {
    const employee = await User.findById(employeeId);
    if (!employee) return null;

    return await notificationService.createAndSendNotification({
      title: 'Absent Notification 🔴',
      description: `You have been marked ABSENT for ${dateStr}. If this is a mistake, please contact HR or regularize your punch times.`,
      type: 'attendance notification',
      autoType: 'Employee absent',
      frequency: 'Instant',
      targetType: 'Specific Employees',
      employees: [employeeId],
      isAuto: true
    }, io);
  } catch (error) {
    handleAutoNotifError('triggerEmployeeAbsent', error);
  }
};

/**
 * Triggers notification when employee's leave request is approved
 */
const triggerLeaveApproved = async (employeeId, leaveType = 'Leave', io = null) => {
  try {
    const employee = await User.findById(employeeId);
    if (!employee) return null;

    return await notificationService.createAndSendNotification({
      title: 'Leave Approved! 🎉',
      description: `Good news! Your leave request for ${leaveType} has been approved by the management.`,
      type: 'general notification',
      autoType: 'Leave approved',
      frequency: 'Instant',
      targetType: 'Specific Employees',
      employees: [employeeId],
      isAuto: true
    }, io);
  } catch (error) {
    handleAutoNotifError('triggerLeaveApproved', error);
  }
};

/**
 * Triggers notification to remind employee to punch out (Shift ending reminder)
 */
const triggerPunchOutReminder = async (employeeId, shiftName = 'Shift', io = null) => {
  try {
    const employee = await User.findById(employeeId);
    if (!employee) return null;

    return await notificationService.createAndSendNotification({
      title: 'Punch Out Reminder 🕒',
      description: `Your shift (${shiftName}) ended 1 hour ago and you missed your punch out. Please punch out to record your attendance.`,
      type: 'attendance notification',
      autoType: 'Employee punch out reminder',
      frequency: 'Instant',
      targetType: 'Specific Employees',
      employees: [employeeId],
      isAuto: true
    }, io);
  } catch (error) {
    handleAutoNotifError('triggerPunchOutReminder', error);
  }
};

/**
 * Triggers notification when employee shift is starting
 */
const triggerShiftStartingReminder = async (employeeId, timeStr = 'soon', io = null) => {
  try {
    const employee = await User.findById(employeeId);
    if (!employee) return null;

    return await notificationService.createAndSendNotification({
      title: 'Shift Schedule Updated 🚀',
      description: 'Your work shift schedule has been updated. Please verify your new timing.',
      type: 'general notification',
      autoType: 'Shift change reminder',
      frequency: 'Instant',
      targetType: 'Specific Employees',
      employees: [employeeId],
      isAuto: true
    }, io);
  } catch (error) {
    handleAutoNotifError('triggerShiftStartingReminder', error);
  }
};

/**
 * Triggers notification when employee enters office geofence boundaries
 */
const triggerGeofenceEntry = async (employeeId, locationName = 'Office', io = null) => {
  try {
    return await notificationService.createAndSendNotification({
      title: 'Geofence Entry Recorded 📍',
      description: `You have entered the designated geofence boundary for ${locationName}.`,
      type: 'tracing notification',
      autoType: 'Employee inside geofence area',
      frequency: 'Instant',
      targetType: 'Specific Employees',
      employees: [employeeId],
      isAuto: true
    }, io);
  } catch (err) {
    handleAutoNotifError('triggerGeofenceEntry', err);
  }
};

/**
 * Triggers missing attendance warning
 */
const triggerAttendanceMissing = async (employeeId, dateStr, io = null) => {
  try {
    return await notificationService.createAndSendNotification({
      title: 'Missing Attendance Check ❓',
      description: `You did not record attendance for ${dateStr}. Please complete your logs.`,
      type: 'attendance notification',
      frequency: 'Instant',
      targetType: 'Specific Employees',
      employees: [employeeId],
      isAuto: true
    }, io);
  } catch (err) {
    handleAutoNotifError('triggerAttendanceMissing', err);
  }
};

module.exports = {
  triggerLateArrival,
  triggerOutsideGeofence,
  triggerEmployeeAbsent,
  triggerLeaveApproved,
  triggerPunchOutReminder,
  triggerShiftStartingReminder,
  triggerGeofenceEntry,
  triggerAttendanceMissing,
};
