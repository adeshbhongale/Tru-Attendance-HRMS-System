const mongoose = require('mongoose');

const ShiftSchema = new mongoose.Schema({
  name: {
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
  gracePeriod: {
    type: Number, // in minutes
    default: 15,
  },
  halfDayAfter: {
    type: String, // HH:mm format - Punching in after this marks Half Day
    default: "11:00",
  },
  punchInCutoff: {
    type: String, // HH:mm format - Cannot punch in after this time
    default: "14:00",
  },
  workingHours: {
    type: Number,
    default: 9,
  },
  weeklyOff: {
    type: [String],
    default: ['Sunday'],
    enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
  },
  isNightShift: {
    type: Boolean,
    default: false,
  }
}, {
  timestamps: true,
});

module.exports = mongoose.model('Shift', ShiftSchema);
