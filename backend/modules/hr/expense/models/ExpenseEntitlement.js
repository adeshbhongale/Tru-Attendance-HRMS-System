const mongoose = require('mongoose');

const ExpenseEntitlementSchema = new mongoose.Schema({
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
  policyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ExpensePolicy',
    default: null,
    index: true,
  },
  policyVersionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ExpensePolicy',
    default: null,
  },
  // Level based (reuses existing Level master)
  levelNumber: { type: Number, default: null, index: true },
  levelRef: { type: mongoose.Schema.Types.ObjectId, ref: 'Level', default: null },
  levelName: { type: String, default: '' },
  // Grade based (optional refinement)
  gradeCode: { type: String, default: '', lowercase: true, trim: true },
  gradeRef: { type: mongoose.Schema.Types.ObjectId, ref: 'Grade', default: null },
  // Destination class A+/A/B/C
  cityClass: {
    type: String,
    enum: ['A+', 'A', 'B', 'C', 'ALL'],
    default: 'ALL',
  },
  expenseTypeCode: { type: String, default: '', uppercase: true, trim: true },
  expenseTypeRef: { type: mongoose.Schema.Types.ObjectId, ref: 'ExpenseType', default: null },
  // Entitlement value (per day / per item)
  amount: { type: Number, default: 0 },
  unit: { type: String, enum: ['per_day', 'per_km', 'per_item', 'percentage', 'flat'], default: 'per_day' },
  formula: { type: String, default: '' },
  ruleCode: { type: String, default: '' },
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active',
  },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, {
  timestamps: true,
});

ExpenseEntitlementSchema.index({ companyId: 1, policyId: 1, levelNumber: 1, cityClass: 1, expenseTypeCode: 1 }, { unique: false });
ExpenseEntitlementSchema.index({ companyId: 1, levelNumber: 1 });

module.exports = mongoose.models.ExpenseEntitlement || mongoose.model('ExpenseEntitlement', ExpenseEntitlementSchema);
