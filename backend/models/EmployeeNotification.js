const mongoose = require('mongoose');

const EmployeeNotificationSchema = new mongoose.Schema({
  employeeId: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  notificationId: {
    type: mongoose.Schema.ObjectId,
    ref: 'Notification',
    default: null,
  },
  title: {
    type: String,
    required: true,
  },
  body: {
    type: String,
    required: true,
  },
  type: {
    type: String,
    required: true,
  },
  autoType: {
    type: String,
    default: null,
  },
  isRead: {
    type: Boolean,
    default: false,
  },
  readAt: {
    type: Date,
    default: null,
  }
}, {
  timestamps: true,
});

module.exports = mongoose.model('EmployeeNotification', EmployeeNotificationSchema);
