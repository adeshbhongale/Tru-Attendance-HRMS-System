const mongoose = require('mongoose');

const ExpenseAuditLogSchema = new mongoose.Schema({
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
  action: { type: String, required: true },
  entity: { type: String, default: 'ExpenseClaim' },
  entityId: { type: String, default: '' },
  claimNumber: { type: String, default: '' },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  userName: { type: String, default: '' },
  description: { type: String, default: '' },
  before: { type: mongoose.Schema.Types.Mixed },
  after: { type: mongoose.Schema.Types.Mixed },
  metadata: { type: mongoose.Schema.Types.Mixed },
}, {
  timestamps: true,
});

ExpenseAuditLogSchema.index({ entity: 1, entityId: 1 });
ExpenseAuditLogSchema.index({ claimNumber: 1 });
ExpenseAuditLogSchema.index({ createdAt: -1 });

module.exports = mongoose.models.ExpenseAuditLog || mongoose.model('ExpenseAuditLog', ExpenseAuditLogSchema);
