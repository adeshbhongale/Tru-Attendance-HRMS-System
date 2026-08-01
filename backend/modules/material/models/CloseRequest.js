const mongoose = require('mongoose');

const closeRequestSchema = new mongoose.Schema(
  {
    transactionId: { type: String, required: true },
    barcode: { type: String, required: true },
    documentType: { type: String, required: true }, // 'DC Internal' or 'DC FOC'
    remarks: { type: String, default: '' },
    gps: {
      lat: Number,
      lng: Number,
      address: String,
    },
    photos: [{ url: String, capturedAt: { type: Date, default: Date.now } }],
    documents: [{
      name: String,
      url: String,
      type: String,
      size: Number,
      uploadedAt: { type: Date, default: Date.now }
    }],
    requester: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: {
      type: String,
      enum: ['pending', 'pending_accounts_approval', 'pending_store_acceptance', 'approved', 'rejected'],
      default: 'pending',
    },
    managementApprover: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    invoiceUrl: { type: String },
    customerName: { type: String },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedAt: { type: Date },
    rejectionReason: { type: String, default: '' },
    storeRemark: { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('CloseRequest', closeRequestSchema);
