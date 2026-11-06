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
  // ── TRAVEL rows (expenseTypeCode = 'TRAVEL') ──
  // One row per Level × Grade × City Class × Travel Mode. levelNumber 0 = "All Levels" default row.
  travelModeId: { type: mongoose.Schema.Types.ObjectId, ref: 'TravelMode', default: null },
  travelModeCode: { type: String, default: '', uppercase: true, trim: true },
  travelModeName: { type: String, default: '' },
  // Subtypes this row permits, each with its own maximum (null = actuals / no cap, 0 = nothing payable).
  allowedSubtypes: {
    type: [new mongoose.Schema({
      subtypeId: { type: mongoose.Schema.Types.ObjectId, required: true },
      code: { type: String, default: '', uppercase: true, trim: true },
      name: { type: String, default: '' },
      maxAmount: { type: Number, default: null, min: 0 },
    }, { _id: false })],
    default: undefined,
  },
  // Modes without subtypes (e.g. Taxi/Auto): maximum per claim item (null = actuals / no cap).
  maxAmount: { type: Number, default: null, min: 0 },
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active',
  },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, {
  timestamps: true,
});

// v2 key adds travelModeCode so a level/class can hold one TRAVEL row per mode. The legacy
// 'uniq_entitlement_key' index is dropped once by ensureEntitlementIndexes() (seedExpenseMasters).
ExpenseEntitlementSchema.index({ companyId: 1, policyId: 1, levelNumber: 1, gradeCode: 1, cityClass: 1, expenseTypeCode: 1, travelModeCode: 1 }, { unique: true, name: 'uniq_entitlement_key_v2', background: true });
ExpenseEntitlementSchema.index({ companyId: 1, levelNumber: 1 });

module.exports = mongoose.models.ExpenseEntitlement || mongoose.model('ExpenseEntitlement', ExpenseEntitlementSchema);
