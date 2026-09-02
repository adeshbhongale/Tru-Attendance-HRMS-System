const mongoose = require('mongoose');

const transferSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      index: true,
      default: null,
    },
    transactionId: { type: String, required: true, index: true },
    barcode: { type: String, required: true, index: true },
    fromUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    toUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    fromDepartment: { type: mongoose.Schema.Types.Mixed, ref: 'Department' },
    toDepartment: { type: mongoose.Schema.Types.Mixed, ref: 'Department' },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'completed'],
      default: 'pending',
    },
    type: {
      type: String,
      enum: ['internal', 'cross_department', 'handler_transfer'],
      default: 'internal',
    },
    requiresApproval: { type: Boolean, default: false },
    managementApprover: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedAt: { type: Date },
    rejectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    rejectionReason: { type: String, default: '' },
    remarks: { type: String, default: '' },
    gps: {
      lat: Number,
      lng: Number,
      address: String,
    },
    photos: [{ url: String, capturedAt: Date }],
    materialCondition: {
      type: String,
      enum: ['good', 'damaged', 'needs_repair'],
      default: 'good',
    },
    documents: [
      {
        url: String,
        name: String,
        type: String,
        mime: String,
        uploadedAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model('Transfer', transferSchema);
