const mongoose = require('mongoose');

const ShiftSchema = new mongoose.Schema({
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: [true, 'Shift must belong to a company'],
    index: true,
  },
  name: {
    type: String,
    required: [true, 'Please add a shift name'],
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
  workingHours: {
    type: Number, // in hours
    default: 9,
  },
  weeklyOff: {
    type: [String],
    default: ['Sunday'],
    enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
  },
  lateRules: {
    type: String,
  },
  halfDayRules: {
    type: String,
  },
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active',
  },
}, {
  timestamps: true,
});

ShiftSchema.index({ companyId: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('Shift', ShiftSchema);
