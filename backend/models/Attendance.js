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
    enum: ['Present', 'Late', 'Half Day', 'Outside Location', 'Absent'],
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
}, {
  timestamps: true,
});

// Index for quick search
AttendanceSchema.index({ user: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('Attendance', AttendanceSchema);
