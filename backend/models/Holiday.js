const mongoose = require('mongoose');

const HolidaySchema = new mongoose.Schema({
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: [true, 'Holiday must belong to a company'],
    index: true,
  },
  holiday_date: {
    type: Date,
    required: [true, 'Please add a holiday date'],
  },
  holiday_name: {
    type: String,
    required: [true, 'Please add a holiday name'],
    trim: true,
  },
  holiday_type: {
    type: String,
    enum: ['d', 'op', 'rh'], // d = mandatory, op = optional, rh = restricted
    default: 'd',
  },
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active',
  },
}, {
  timestamps: true,
});

HolidaySchema.index({ companyId: 1, holiday_date: 1, holiday_name: 1 }, { unique: true });

module.exports = mongoose.model('Holiday', HolidaySchema);
