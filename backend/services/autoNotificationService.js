const notificationService = require('./notificationService');
const User = require('../models/User');

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
      type: 'Late Coming',
      autoType: 'Employee late by grace time',
      frequency: 'Instant',
      targetType: 'Specific Employees',
      employees: [employeeId],
      isAuto: true
    }, io);
  } catch (error) {
    console.error('Error in triggerLateArrival auto-notification:', error);
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
      type: 'Geofence Exited',
      autoType: 'Employee outside geofence',
      frequency: 'Instant',
      targetType: 'Specific Employees',
      employees: [employeeId],
      isAuto: true
    }, io);
  } catch (error) {
    console.error('Error in triggerOutsideGeofence auto-notification:', error);
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
      type: 'Attendance Alert',
      autoType: 'Employee absent',
      frequency: 'Instant',
      targetType: 'Specific Employees',
      employees: [employeeId],
      isAuto: true
    }, io);
  } catch (error) {
    console.error('Error in triggerEmployeeAbsent auto-notification:', error);
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
      type: 'Leave Approved',
      autoType: 'Leave approved',
      frequency: 'Instant',
      targetType: 'Specific Employees',
      employees: [employeeId],
      isAuto: true
    }, io);
  } catch (error) {
    console.error('Error in triggerLeaveApproved auto-notification:', error);
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
      description: `Your shift (${shiftName}) is ending in 30 minutes. Please remember to clock out of your attendance tracking.`,
      type: 'Punch Out Reminder',
      autoType: 'Punch out reminder',
      frequency: 'Instant',
      targetType: 'Specific Employees',
      employees: [employeeId],
      isAuto: true
    }, io);
  } catch (error) {
    console.error('Error in triggerPunchOutReminder auto-notification:', error);
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
      type: 'Shift Change Notification',
      autoType: 'Shift change reminder',
      frequency: 'Instant',
      targetType: 'Specific Employees',
      employees: [employeeId],
      isAuto: true
    }, io);
  } catch (error) {
    console.error('Error in triggerShiftStartingReminder auto-notification:', error);
  }
};

/**
 * Triggers generic punch in confirmation
 */
const triggerPunchIn = async (employeeId, timeStr, io = null) => {
  try {
    return await notificationService.createAndSendNotification({
      title: 'Punch-In Successful ✅',
      description: `You clocked in successfully at ${timeStr}. Have a great shift!`,
      type: 'Punch In Reminder',
      frequency: 'Instant',
      targetType: 'Specific Employees',
      employees: [employeeId],
      isAuto: true
    }, io);
  } catch (err) {
    console.error('Error in triggerPunchIn auto-notification:', err);
  }
};

/**
 * Triggers generic punch out confirmation
 */
const triggerPunchOut = async (employeeId, timeStr, io = null) => {
  try {
    return await notificationService.createAndSendNotification({
      title: 'Punch-Out Successful 👋',
      description: `You clocked out successfully at ${timeStr}. See you next time!`,
      type: 'Punch Out Reminder',
      frequency: 'Instant',
      targetType: 'Specific Employees',
      employees: [employeeId],
      isAuto: true
    }, io);
  } catch (err) {
    console.error('Error in triggerPunchOut auto-notification:', err);
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
      type: 'Geofence Entered',
      frequency: 'Instant',
      targetType: 'Specific Employees',
      employees: [employeeId],
      isAuto: true
    }, io);
  } catch (err) {
    console.error('Error in triggerGeofenceEntry auto-notification:', err);
  }
};

/**
 * Triggers notification when employee requests leave (Notify HR/Admins)
 */
const triggerLeaveRequest = async (employeeId, leaveType = 'Leave', io = null) => {
  try {
    const employee = await User.findById(employeeId);
    if (!employee) return null;

    // Find active admins to notify
    const admins = await User.find({ role: 'admin', status: 'active' });
    const adminIds = admins.map(a => a._id);

    if (adminIds.length === 0) return null;

    return await notificationService.createAndSendNotification({
      title: 'New Leave Request 📄',
      description: `${employee.name} has submitted a new leave request for ${leaveType}.`,
      type: 'Leave Applied',
      frequency: 'Instant',
      targetType: 'Specific Employees',
      employees: adminIds,
      isAuto: true
    }, io);
  } catch (err) {
    console.error('Error in triggerLeaveRequest auto-notification:', err);
  }
};

/**
 * Triggers notification when employee's leave request is rejected
 */
const triggerLeaveRejected = async (employeeId, leaveType = 'Leave', io = null) => {
  try {
    return await notificationService.createAndSendNotification({
      title: 'Leave Request Rejected ❌',
      description: `Your leave request for ${leaveType} was rejected. Please contact your manager/HR for details.`,
      type: 'Leave Rejected',
      frequency: 'Instant',
      targetType: 'Specific Employees',
      employees: [employeeId],
      isAuto: true
    }, io);
  } catch (err) {
    console.error('Error in triggerLeaveRejected auto-notification:', err);
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
      type: 'Attendance Alert',
      frequency: 'Instant',
      targetType: 'Specific Employees',
      employees: [employeeId],
      isAuto: true
    }, io);
  } catch (err) {
    console.error('Error in triggerAttendanceMissing auto-notification:', err);
  }
};

module.exports = {
  triggerLateArrival,
  triggerOutsideGeofence,
  triggerEmployeeAbsent,
  triggerLeaveApproved,
  triggerPunchOutReminder,
  triggerShiftStartingReminder,
  triggerPunchIn,
  triggerPunchOut,
  triggerGeofenceEntry,
  triggerLeaveRequest,
  triggerLeaveRejected,
  triggerAttendanceMissing,
};
