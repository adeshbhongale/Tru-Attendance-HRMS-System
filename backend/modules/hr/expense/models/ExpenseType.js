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
