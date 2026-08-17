const mongoose = require('mongoose');

// HR-controlled per-employee leave allowance per leave type.
// `used` is NOT stored here — it is derived from approved Leave records,
// so approving a leave automatically removes those working days from the
// employee's balance. This document only overrides the default LimitType.limit
// for a specific employee (each employee can have a different allowance).
const LeaveBalanceSchema = new mongoose.Schema({
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: [true, 'Leave balance must belong to a company'],
    index: true,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  leaveTypeRef: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'LeaveType',
    required: true,
  },
  leaveType: {
    type: String,
    required: true,
  },
  code: {
    type: String,
    required: true,
  },
  limit: {
    type: Number,
    required: [true, 'Please provide a leave allowance'],
    min: 0,
    default: 0,
  },
  limitType: {
    type: String,
    enum: ['Monthly', 'Yearly'],
    default: 'Yearly',
  },
}, {
  timestamps: true,
});

LeaveBalanceSchema.index({ companyId: 1, userId: 1, leaveTypeRef: 1 }, { unique: true });
LeaveBalanceSchema.index({ companyId: 1, userId: 1 });

module.exports = mongoose.model('LeaveBalance', LeaveBalanceSchema);