const mongoose = require('mongoose');

// Defines how a company allocates a leave type: the allocation period,
// carry-forward rules, and new-joiner proration. Entitlement amounts live in
// LeavePolicyRule (per employee / role / level / grade / department / company).
// Effective entitlement is resolved by scope priority:
//   Employee > Role > Level > Department > Company default.
const LeavePolicySchema = new mongoose.Schema({
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: [true, 'Leave policy must belong to a company'],
    index: true,
  },
  leaveTypeRef: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'LeaveType',
    required: true,
    index: true,
  },
  name: {
    type: String,
    trim: true,
  },
  periodType: {
    type: String,
    enum: ['MONTHLY', 'QUARTERLY', 'YEARLY'],
    default: 'YEARLY',
    required: [true, 'Please select an allocation period'],
  },
  carryForward: {
    type: Boolean,
    default: false,
  },
  maxCarryForward: {
    type: Number,
    min: 0,
    default: 0,
  },
  prorateNewJoiner: {
    type: Boolean,
    default: true,
  },
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active',
  },
}, {
  timestamps: true,
});

LeavePolicySchema.index({ companyId: 1, leaveTypeRef: 1 }, { unique: true });

module.exports = mongoose.model('LeavePolicy', LeavePolicySchema);