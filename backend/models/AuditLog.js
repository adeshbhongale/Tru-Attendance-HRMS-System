const mongoose = require('mongoose');

const AuditLogSchema = new mongoose.Schema({
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    default: null,
    index: true,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  employeeId: {
    type: String,
    trim: true,
  },
  action: {
    type: String,
    required: true,
    trim: true,
  },
  module: {
    type: String,
    required: true,
    trim: true,
  },
  entityId: {
    type: String,
    default: null,
  },
  oldValue: {
    type: mongoose.Schema.Types.Mixed,
    default: null,
  },
  newValue: {
    type: mongoose.Schema.Types.Mixed,
    default: null,
  },
  ipAddress: String,
  userAgent: String,
}, {
  timestamps: true,
});

module.exports = mongoose.models.AuditLog || mongoose.model('AuditLog', AuditLogSchema);
