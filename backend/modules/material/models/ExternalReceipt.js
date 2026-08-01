const mongoose = require('mongoose');

const materialSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  quantity: { type: Number, required: true, min: 0 },
  qty: { type: Number, default: 0, min: 0 },
  unit: { type: String, required: true, trim: true },
  price: { type: Number, default: 0, min: 0 },
  total: { type: Number, default: 0 },
  barcode: { type: String, default: '' },
});

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
  },
});

const externalReceiptSchema = new mongoose.Schema(
  {
    receiptId: {
      type: String,
      unique: true,
      index: true,
    },
    type: {
      type: String,
      enum: ['vendor', 'customer'],
      required: true,
    },
    // Vendor fields
    vendorName: { type: String, default: '' },
    vendorAddress: { type: String, default: '' },
    prNumber: { type: String, default: '' },
    poNumber: { type: String, default: '' },
    // Customer fields
    customerName: { type: String, default: '' },
    customerAddress: { type: String, default: '' },
    documentNumber: { type: String, default: '' },
    documentDescription: { type: String, default: '' },
    // Common fields
    orderedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    receiver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    materials: [materialSchema],
    photos: [photoSchema],
    remarks: { type: String, default: '' },
    receiverGeo: {
      lat: Number,
      lng: Number,
      accuracy: Number,
      address: String,
    },
    grandTotal: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// Auto generate receipt ID
externalReceiptSchema.pre('save', async function (next) {
  if (!this.receiptId) {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const count = await mongoose.model('ExternalReceipt').countDocuments({
      createdAt: { $gte: startOfDay },
    });
    this.receiptId = `EXT-${dateStr}-${String(count + 1).padStart(6, '0')}`;
  }
  next();
});

module.exports = mongoose.model('ExternalReceipt', externalReceiptSchema);
