const mongoose = require('mongoose');

const AttendanceSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: true,
  },
  date: {
    type: Date,
    required: true,
  },
  punchIn: {
    time: Date,
    location: {
      latitude: Number,
      longitude: Number,
      address: String,
    },
    selfie: String,
  },
  punchOut: {
    time: Date,
    location: {
      latitude: Number,
      longitude: Number,
      address: String,
    },
  },
  status: {
    type: String,
    enum: ['Present', 'Late', 'Half Day', 'Absent'],
    default: 'Absent',
  },
  workingHours: {
    type: Number,
    default: 0,
  },
  isLate: {
    type: Boolean,
    default: false,
  },
  isHalfDay: {
    type: Boolean,
    default: false,
  },
  isOutside: {
    type: Boolean,
    default: false,
  },
  trackingLogs: [{
    time: { type: Date, default: Date.now },
    latitude: Number,
    longitude: Number,
    address: String,
    isOutside: Boolean
  }],
  totalDistance: {
    type: Number,
    default: 0
  },
  overtime: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true,
});

// Index for quick search
AttendanceSchema.index({ user: 1, date: 1 });

module.exports = mongoose.model('Attendance', AttendanceSchema);
