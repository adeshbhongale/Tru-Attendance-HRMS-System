const mongoose = require('mongoose');

const sharedLodgingRuleSchema = new mongoose.Schema({
  code: {
    type: String,
    enum: ['RULE_75', 'RULE_50', 'HIGHER_ONLY'],
    required: true,
  },
  label: { type: String, default: '' },
  formula: { type: String, default: '' },
}, { _id: false });

const ExpensePolicySchema = new mongoose.Schema({
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
  name: { type: String, required: true, trim: true },
  code: { type: String, required: true, trim: true, uppercase: true },
  description: { type: String, default: '' },
  version: { type: String, default: '1.0' },
  policyVersion: { type: String, default: '1.0' },
  status: {
    type: String,
    enum: ['draft', 'active', 'inactive', 'archived'],
    default: 'draft',
    index: true,
  },
  effectiveFrom: { type: Date, default: null },
  effectiveTo: { type: Date, default: null },
  source: { type: String, default: 'TCSL/ITP/1.8.26' },

  // Super Admin controlled approval switch
  approvalRequired: { type: Boolean, default: false },

  // Super Admin / Company Admin selected shared-lodging rule
  sharedLodgingRule: {
    type: String,
    default: 'HIGHER_PLUS_LOWER',
  },
  sharedLodgingPercent: {
    type: Number,
    default: 75,
    min: 1,
    max: 100,
  },

  // Conveyance rates (per km)
  conveyanceRates: {
    twoWheeler: { type: Number, default: 3.5 },
    car: { type: Number, default: 5.0 },
    eBike: { type: Number, default: 1.0 },
    eCar: { type: Number, default: 1.75 },
  },

  // Local travel food not allowed
  localTravelFoodAllowed: { type: Boolean, default: false },

  // Deadline rules
  deadlineRules: [{
    ruleName: { type: String, default: '' },
    days: { type: Number, default: 3 },
    action: { type: String, enum: ['warning', 'blocking'], default: 'warning' },
    description: { type: String, default: '' },
  }],

  approvalEngine: {
    type: String,
    enum: ['NONE', 'HR'],
    default: 'NONE',
  },

  sharedLodgingRules: [sharedLodgingRuleSchema],

  // Expanded shared-lodging configuration for all three rules
  sharedLodgingConfig: {
    rule75: { enabled: { type: Boolean, default: true }, formula: { type: String, default: '(Higher + Lower) x 75%' } },
    rule50: { enabled: { type: Boolean, default: true }, formula: { type: String, default: '(Higher + Lower) x 50%' } },
    higherOnly: { enabled: { type: Boolean, default: true }, formula: { type: String, default: 'Higher only' } },
  },

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  publishedAt: { type: Date, default: null },
  publishedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, {
  timestamps: true,
});

ExpensePolicySchema.index({ companyId: 1, code: 1, version: 1 }, { unique: true });
ExpensePolicySchema.index({ companyId: 1, status: 1 });

module.exports = mongoose.models.ExpensePolicy || mongoose.model('ExpensePolicy', ExpensePolicySchema);
