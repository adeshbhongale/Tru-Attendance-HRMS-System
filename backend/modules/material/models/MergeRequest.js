const mongoose = require('mongoose');

const mergeRequestSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null, index: true },
    transactionId: { type: String },
    mergeBarcodes: [{ type: String, required: true }],
    parentBarcodeMode: {
      type: String,
      enum: ['existing', 'new'],
      required: true,
    },
    selectedParentBarcode: { type: String },
    requestedMaterialName: { type: String },
    requester: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    reason: { type: String, required: true },
    gps: {
      lat: Number,
      lng: Number,
      address: String,
    },
    photos: [{ url: String, capturedAt: { type: Date, default: Date.now } }],
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
    },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedAt: { type: Date },
    finalParentBarcode: { type: String },
    storeRemark: { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('MergeRequest', mergeRequestSchema);
