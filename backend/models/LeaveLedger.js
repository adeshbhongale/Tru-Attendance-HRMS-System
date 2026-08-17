const mongoose = require('mongoose');

// Ledger — the single audit source for leave balancing. Every movement is an
// entry here (GRANT / APPROVE / CANCEL / ADJUST / ENCASH). The "used" and
// "balance" of an employee are computed by summing ledger quantities for the
// employee + leave type + period, so cancelled/pending/rejected never affect
// the used figure (CANcel credits back what an APPROVE consumed).
const LeaveLedgerSchema = new mongoose.Schema({
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: [true, 'Ledger entry must belong to a company'],
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
    index: true,
  },
  periodKey: {
    type: String,
    required: true,
    index: true,
  },
  entryType: {
    type: String,
    enum: ['GRANT', 'APPROVE', 'CANCEL', 'ADJUST', 'ENCASH'],
    required: true,
  },
  quantity: {
    // Signed: positive adds to balance, negative reduces it.
    type: Number,
    required: true,
  },
  balanceAfter: {
    type: Number,
    default: null,
  },
  sourceRef: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Leave',
    default: null,
  },
  note: {
    type: String,
    default: '',
  },
}, {
  timestamps: true,
});

LeaveLedgerSchema.index({ companyId: 1, userId: 1, leaveTypeRef: 1, periodKey: 1 });
LeaveLedgerSchema.index({ companyId: 1, sourceRef: 1 });

module.exports = mongoose.model('LeaveLedger', LeaveLedgerSchema);