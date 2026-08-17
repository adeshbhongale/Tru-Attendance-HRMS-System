const mongoose = require('mongoose');

// Entitlement rules for a leave policy. `scopeType` selects the resolution
// priority:
//   employee  -> scopeRef = User._id          (highest priority)
//   role      -> scopeCode = roleCode (e.g. SOFTWARE_ENGINEER)
//   level     -> scopeRef = Level._id
//   grade     -> scopeRef = Grade._id
//   department-> scopeRef = Department._id
//   company   -> scopeCode = '_default' (global default entitlement)
const LeavePolicyRuleSchema = new mongoose.Schema({
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: [true, 'Rule must belong to a company'],
    index: true,
  },
  policyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'LeavePolicy',
    required: true,
    index: true,
  },
  scopeType: {
    type: String,
    enum: ['employee', 'role', 'level', 'grade', 'department', 'company'],
    required: true,
  },
  scopeRef: {
    type: mongoose.Schema.Types.ObjectId,
    default: null,
  },
  scopeCode: {
    type: String,
    uppercase: true,
    trim: true,
    default: null,
  },
  days: {
    type: Number,
    required: [true, 'Please provide the entitlement days'],
    min: 0,
  },
}, {
  timestamps: true,
});

// One rule per (policy, scopeType, scopeRef/scopeCode) pair.
LeavePolicyRuleSchema.index(
  { policyId: 1, scopeType: 1, scopeRef: 1, scopeCode: 1 },
  { unique: true, partialFilterExpression: { scopeCode: { $ne: null } } }
);
LeavePolicyRuleSchema.index({ policyId: 1, scopeType: 1, scopeRef: 1 });

module.exports = mongoose.model('LeavePolicyRule', LeavePolicyRuleSchema);