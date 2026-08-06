const mongoose = require('mongoose');

const returnSchema = new mongoose.Schema(
  {
    transactionId: { type: String, required: true, index: true },
    barcode: { type: String, required: true, index: true },
    fromUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    returnHandler: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    previousHandler: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    store: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    status: {
      type: String,
      enum: ['pending', 'handler_assigned', 'collected', 'store_received', 'completed', 'rejected'],
      default: 'pending',
    },
    reason: { type: String, default: '' },
    condition: { type: String, default: 'good' },
    remarks: { type: String, default: '' },
    gps: {
      lat: Number,
      lng: Number,
      address: String,
    },
    photos: [mongoose.Schema.Types.Mixed],
    documents: [mongoose.Schema.Types.Mixed],
    collectedAt: { type: Date },
    receivedAt: { type: Date },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Return', returnSchema);
