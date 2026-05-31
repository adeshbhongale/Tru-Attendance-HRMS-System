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
    isOutside: { type: Boolean, default: false }
  },
  punchOut: {
    time: Date,
    location: {
      latitude: Number,
      longitude: Number,
      address: String,
    },
    selfie: String,
    isOutside: { type: Boolean, default: false }
  },
  breaks: [{
    startTime: Date,
    endTime: Date,
    duration: Number // minutes
  }],
  status: {
    type: String,
    enum: ['Present', 'Late', 'Half Day', 'Absent', 'Leave', 'Leave(Half)', 'Holiday', 'Week Off', 'Neutral'],
    default: 'Absent',
  },
  workingHours: {
    type: Number,
    default: 0,
  },
  lateTime: {
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
  distance: {
    type: Number,
    default: 0,
  },
  trackingLogs: [{
    time: { type: Date, default: Date.now },
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
    address: String,
    distanceFromPrevious: { type: Number, default: 0 },
    totalDistanceTillNow: { type: Number, default: 0 },
    isSuspicious: { type: Boolean, default: false },
    accuracy: Number,
    speed: Number,
    altitude: Number,
    heading: Number
  }],
  totalDistance: {
    type: Number,
    default: 0
  },
  currentDistance: {
    type: Number,
    default: 0
  },
  lastTrackedLocation: {
    latitude: Number,
    longitude: Number,
    time: Date,
    address: String
  },
  lastTrackingTime: Date,
  battery: {
    type: Number,
    default: 100
  },
  signalStatus: {
    type: String,
    enum: ['online', 'offline'],
    default: 'online'
  },
  shiftInfo: {
    name: String,
    startTime: String, // HH:mm
    endTime: String,   // HH:mm
    requiredHours: Number,
    gracePeriod: Number,
    halfDayAfter: String
  }
}, {
  timestamps: true,
});

// Index for quick search
AttendanceSchema.index({ user: 1, date: 1 });
AttendanceSchema.index({ date: 1 });

module.exports = mongoose.model('Attendance', AttendanceSchema);
