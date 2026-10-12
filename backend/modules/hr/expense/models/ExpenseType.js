const mongoose = require('mongoose');

const ExpenseTypeSchema = new mongoose.Schema({
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    default: null,
    index: true,
  },
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    default: null,
  },
  code: {
    type: String,
    required: true,
    trim: true,
    uppercase: true,
    unique: false,
  },
  name: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  category: {
    type: String,
    enum: ['LODGING', 'FOOD', 'CONVEYANCE', 'TRAVEL', 'OTHER'],
    default: 'OTHER',
  },
  // dynamic field configuration
  fields: [{
    key: { type: String, required: true },
    label: { type: String, default: '' },
    type: {
      type: String,
      enum: ['text', 'number', 'date', 'select', 'textarea'],
      default: 'text',
    },
    options: [{ type: String }],
    required: { type: Boolean, default: false },
  }],
  calculationMethod: {
    type: String,
    enum: ['ENTITLEMENT_CAP', 'KM_RATE', 'RULE_BASED', 'ACTUAL'],
    default: 'ENTITLEMENT_CAP',
  },
  proofRequired: { type: Boolean, default: true },
  selfAttestationAllowed: { type: Boolean, default: true },
  hrApprovalRequired: { type: Boolean, default: false },
  eligibilityRule: { type: String, default: '' },

  // ── Claim rules (Super Admin configurable) ──
  // NORMAL: appears in "Expense Claim" (rules on claim date)
  // LOGGING: appears in "Logging Expense Claim" (rules on from/to date range)
  claimMode: { type: String, enum: ['NORMAL', 'LOGGING'] },
  // Max valid claims of this type per employee per claim date (0 = unlimited)
  sameDateLimit: { type: Number, min: 0 },
  // LOGGING only: allow date ranges overlapping an existing claim of this type
  allowOverlap: { type: Boolean },
  // Hard ceiling for a single claim's requested amount (0 = no ceiling)
  maxClaimAmount: { type: Number, min: 0 },
  // Only claimable when attendance/GPS recorded outstation duty for the date(s)
  requiresOutstation: { type: Boolean },
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active',
  },
  order: { type: Number, default: 0 },
}, {
  timestamps: true,
});

ExpenseTypeSchema.index({ companyId: 1, code: 1 }, { unique: true });

module.exports = mongoose.models.ExpenseType || mongoose.model('ExpenseType', ExpenseTypeSchema);
