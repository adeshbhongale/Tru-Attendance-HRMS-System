const mongoose = require('mongoose');

const NotificationLogSchema = new mongoose.Schema({
  notificationId: {
    type: mongoose.Schema.ObjectId,
    ref: 'Notification',
    required: true,
  },
  companyId: {
    type: mongoose.Schema.ObjectId,
    ref: 'Company',
    default: null,
    index: true,
  },
  employeeId: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: true,
  },
  fcmToken: {
    type: String,
    default: null,
  },
  sentAt: {
    type: Date,
    default: Date.now,
  },
  deliveredAt: {
    type: Date,
    default: null,
  },
  readAt: {
    type: Date,
    default: null,
  },
  isRead: {
    type: Boolean,
    default: false,
  },
  deliveryStatus: {
    type: String,
    enum: ['sent', 'delivered', 'read', 'failed'],
    default: 'sent',
  },
  deviceType: {
    type: String,
    default: 'Web', // iOS, Android, Web
  },
  errorMessage: {
    type: String,
    default: null,
  }
}, {
  timestamps: true,
});

module.exports = mongoose.model('NotificationLog', NotificationLogSchema);
