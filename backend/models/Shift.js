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
  halfDayLimit: {
    type: Number, // in hours
    default: 4,
  },
  lateRules: {
    type: String,
  }
}, {
  timestamps: true,
});

module.exports = mongoose.model('Shift', ShiftSchema);
