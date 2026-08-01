const mongoose = require('mongoose');

const photoSchema = new mongoose.Schema({
  url: { type: String, required: true },
  metadata: {
    lat: Number,
    lng: Number,
    accuracy: Number,
    address: String,
    date: String,
    time: String,
    device: String,
    employeeName: String,
    capturedAt: Date,
  },
});

const internalReceiptSchema = new mongoose.Schema(
  {
    transaction: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Transaction',
      required: true,
    },
    receiver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    receiverPhoto: photoSchema,
    receiverDocumentPhotos: [photoSchema],
    receiverMaterialPhotos: [{
      materialIndex: { type: Number, required: true },
      photos: [photoSchema],
    }],
    materialCondition: {
      type: String,
      default: '',
    },
    remarks: {
      type: String,
      default: '',
    },
    receiverGeo: {
      lat: Number,
      lng: Number,
      accuracy: Number,
      address: String,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('InternalReceipt', internalReceiptSchema);
