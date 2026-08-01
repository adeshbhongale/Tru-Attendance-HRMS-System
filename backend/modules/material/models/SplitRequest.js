const mongoose = require('mongoose');

const splitRequestSchema = new mongoose.Schema(
  {
    transactionId: { type: String, required: true },
    barcode: { type: String, required: true },
    materialName: { type: String, required: true },
    requestedMaterialName: { type: String },
    batchId: { type: String, index: true },
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
    newBarcode: { type: String },
    newQuantity: { type: Number },
    storeRemark: { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('SplitRequest', splitRequestSchema);
