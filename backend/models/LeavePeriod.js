const mongoose = require('mongoose');

// Materialized allocation periods for a company + leave policy period type.
// periodKey (e.g. "2026-MONTHLY-03", "2026-QUARTERLY-2", "2026-YEARLY") is the
// stable id used across Leave (periodKey), LeaveLedger and balance reads, so no
// cron job is needed to roll over balances — the period is derived on read.
const LeavePeriodSchema = new mongoose.Schema({
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: [true, 'Leave period must belong to a company'],
    index: true,
  },
  periodType: {
    type: String,
    enum: ['MONTHLY', 'QUARTERLY', 'YEARLY'],
    required: true,
  },
  year: {
    type: Number,
    required: true,
  },
  month: {
    type: Number,
    min: 1,
    max: 12,
    default: null,
  },
  quarter: {
    type: Number,
    min: 1,
    max: 4,
    default: null,
  },
  periodKey: {
    type: String,
    required: true,
    index: true,
  },
  label: {
    type: String,
    required: true,
  },
  startDate: {
    type: Date,
    required: true,
  },
  endDate: {
    type: Date,
    required: true,
  },
}, {
  timestamps: true,
});

LeavePeriodSchema.index({ companyId: 1, periodType: 1, periodKey: 1 }, { unique: true });
LeavePeriodSchema.index({ companyId: 1, periodType: 1, year: 1 });

module.exports = mongoose.model('LeavePeriod', LeavePeriodSchema);