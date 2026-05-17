const mongoose = require('mongoose');

const ShiftSchema = new mongoose.Schema({
  shiftName: {
    type: String,
    required: [true, 'Please add a shift name'],
    unique: true,
  },
  startTime: {
    type: String, // HH:mm format
    required: true,
  },
  endTime: {
    type: String, // HH:mm format
    required: true,
  },
  graceMinutes: {
    type: Number, // in minutes
    default: 15,
  },
  halfDayAfter: {
    type: String, // HH:mm format - Punching in after this marks Half Day
    default: "11:00",
  },
  minHoursFullDay: {
    type: Number, // in hours
    default: 8,
  },
  minHoursHalfDay: {
    type: Number, // in hours
    default: 4,
  },
  weeklyOffs: {
    type: [String],
    default: ['Sunday'],
    enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
  },
  isNightShift: {
    type: Boolean,
    default: false,
  },
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active',
  },
}, {
  timestamps: true,
});

module.exports = mongoose.model('Shift', ShiftSchema);
