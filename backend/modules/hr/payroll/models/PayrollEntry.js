const mongoose = require('mongoose');

const PayrollEntrySchema = new mongoose.Schema({
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true,
    index: true,
  },
  employee: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    required: true,
  },
  month: {
    type: Number,
    required: true,
    min: 1,
    max: 12,
  },
  year: {
    type: Number,
    required: true,
  },
  // null = use approved leaves fetched automatically from Leave collection;
  // number >= 0 = manual HR override for this month
  leaves: {
    type: Number,
    default: null,
    min: 0,
  },
  lateDeductionOverride: {
    type: Number,
    default: null,
    min: 0,
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
}, {
  timestamps: true,
});

// Unique compound index: one entry per employee per month per company
PayrollEntrySchema.index(
  { companyId: 1, employee: 1, month: 1, year: 1 },
  { unique: true }
);

module.exports = mongoose.model('PayrollEntry', PayrollEntrySchema);
