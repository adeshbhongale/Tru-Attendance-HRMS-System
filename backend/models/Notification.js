const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Please add a notification title'],
    trim: true,
  },
  description: {
    type: String,
    required: [true, 'Please add a notification description'],
  },
  type: {
    type: String,
    required: [true, 'Please specify the notification type'],
    enum: [
      'General Announcement',
      'Attendance Alert',
      'Late Coming',
      'Leave Applied',
      'Leave Approved',
      'Leave Rejected',
      'Geofence Entered',
      'Geofence Exited',
      'Shift Change Notification',
      'Punch In Reminder',
      'Punch Out Reminder',
      'Meeting Notification',
      'Emergency Alert',
      'HR Announcement'
    ],
  },
  autoType: {
    type: String,
    default: null,
    enum: [
      null,
      'general',
      'Employee late by grace time',
      'Employee outside geofence',
      'Employee absent',
      'Leave approved',
      'Punch out reminder',
      'Shift change reminder'
    ]
  },
  frequency: {
    type: String,
    required: [true, 'Please specify frequency'],
    enum: ['Instant', 'Daily', 'Weekly', 'Monthly', 'Custom Schedule', 'Repeat Every X Hours'],
    default: 'Instant',
  },
  targetType: {
    type: String,
    required: [true, 'Please specify target type'],
    enum: ['All Employees', 'Specific Department', 'Specific Employees', 'Shift-based Employees', 'Location-based Employees', 'Role-based Employees'],
    default: 'All Employees',
  },
  departments: [{
    type: String
  }],
  employees: [{
    type: mongoose.Schema.ObjectId,
    ref: 'User',
  }],
  scheduledAt: {
    type: Date,
    default: null,
  },
  status: {
    type: String,
    enum: ['draft', 'scheduled', 'sent', 'failed'],
    default: 'draft',
  },
  createdBy: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    default: null,
  },
  isAuto: {
    type: Boolean,
    default: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  }
}, {
  timestamps: true,
});

module.exports = mongoose.model('Notification', NotificationSchema);
