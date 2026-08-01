const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    action: { type: String, required: true },
    entity: { type: String, required: true }, // 'Transaction', 'Barcode', 'User', 'Transfer', 'Return'
    entityId: { type: String, required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    userName: { type: String },
    description: { type: String, default: '' },
    before: { type: mongoose.Schema.Types.Mixed },
    after: { type: mongoose.Schema.Types.Mixed },
    ip: { type: String, default: '' },
    gps: {
      lat: Number,
      lng: Number,
      address: String,
    },
    device: { type: String, default: '' },
    browser: { type: String, default: '' },
  },
  {
    timestamps: true,
  }
);

auditLogSchema.index({ entity: 1, entityId: 1 });
auditLogSchema.index({ user: 1 });
auditLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
