const mongoose = require('mongoose');

const LeaveSchema = new mongoose.Schema({
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: [true, 'Leave must belong to a company'],
    index: true,
  },
  user: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: true,
  },
  leaveType: {
    type: String,
    required: true,
  },
  leaveTypeRef: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'LeaveType',
    index: true,
  },
  startDate: {
    type: Date,
    required: true,
  },
  endDate: {
    type: Date,
    required: true,
  },
  duration: {
    type: String,
    enum: ['Full Day', 'Half Day'],
    default: 'Full Day',
  },
  startTime: String, // For half-day: e.g. "09:00"
  endTime: String,   // For half-day: e.g. "13:00"
  reason: {
    type: String,
    required: true,
  },
  status: {
    type: String,
    enum: ['Pending', 'Approved', 'Rejected', 'Cancelled'],
    default: 'Pending',
  },
  // Reporting-manager who must approve. Frozen at request creation so the
  // approval chain is auditable even if the user's manager changes later.
  approverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
    index: true,
  },
  // Stable id of the allocation period this leave draws from
  // (e.g. "2026-MONTHLY-03", "2026-QUARTERLY-2", "2026-YEARLY").
  periodKey: {
    type: String,
    default: null,
    index: true,
  },
  // Snapshot of the policy/entitlement used at application time.
  policySnapshot: {
    type: mongoose.Schema.Types.Mixed,
    default: null,
  },
  // Calculated working days (0.5 for half day) at application time — the exact
  // amount that flows through the ledger on approve/cancel.
  durationDays: {
    type: Number,
    default: 0,
    min: 0,
  },
  // Whether the APPROVE ledger entry was already posted for this leave.
  ledgerPosted: {
    type: Boolean,
    default: false,
  },
  adminNote: String,
  appliedOn: {
    type: Date,
    default: Date.now,
  },
}, {
  timestamps: true,
});

LeaveSchema.index({ companyId: 1, user: 1, startDate: -1 });

module.exports = mongoose.model('Leave', LeaveSchema);
