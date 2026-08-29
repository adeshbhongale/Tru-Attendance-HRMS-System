const mongoose = require('mongoose');

const ownershipEntrySchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  department: { type: mongoose.Schema.Types.Mixed, ref: 'Department' },
  assignedAt: { type: Date, default: Date.now },
  releasedAt: { type: Date },
  action: { type: String }, // 'received', 'transferred', 'returned'
  remarks: { type: String, default: '' },
});

const historySchema = new mongoose.Schema({
  action: { type: String, required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  timestamp: { type: Date, default: Date.now },
  remarks: { type: String, default: '' },
  gps: {
    lat: Number,
    lng: Number,
    address: String,
  },
  photo: { type: String, default: '' },
  metadata: { type: mongoose.Schema.Types.Mixed },
});

const barcodeSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      index: true,
      default: null,
    },
    barcode: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    transactionId: {
      type: String,
      required: true,
      index: true,
    },
    transaction: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Transaction',
      index: true,
    },
    materialName: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ['Active', 'Returned', 'Closed', 'Cancelled', 'Split', 'pending_acceptance', 'Exchanged', 'Merged', 'Transfer Pending', 'Return Pending', 'Exchange Pending', 'Split Pending', 'Close Pending', 'Merge Pending', 'Pending', 'pending'],
      default: 'Active',
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    ownerDepartment: {
      type: mongoose.Schema.Types.Mixed,
      ref: 'Department',
    },
    // Ownership chain (recursive)
    ownershipHistory: [ownershipEntrySchema],

    // GPS location
    gps: {
      lat: Number,
      lng: Number,
      accuracy: Number,
      address: String,
    },

    // Photos
    photos: [
      {
        url: String,
        capturedAt: { type: Date, default: Date.now },
        lat: Number,
        lng: Number,
        address: String,
      },
    ],

    // Documents
    documents: [
      {
        name: String,
        url: String,
        type: { type: String },
        size: Number,
        uploadedAt: { type: Date, default: Date.now },
      },
    ],

    // Complete history
    history: [historySchema],

    // Split tracking
    parentBarcode: { type: String, default: null },
    childBarcodes: [{ type: String }],
    isSplit: { type: Boolean, default: false },

    // Transfer count
    transferCount: { type: Number, default: 0 },

    // Close / DC Conversion Request schema
    closeRequest: {
      documentType: { type: String, enum: ['DC Internal', 'DC FOC', 'Invoice'] },
      documentNumber: { type: String },
      remarks: { type: String },
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
      requester: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      managementApprover: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      customerName: { type: String },
      status: { type: String, enum: ['pending', 'pending_accounts_approval', 'pending_store_acceptance', 'approved', 'rejected'], default: 'pending' },
      rejectionReason: { type: String }
    }
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Barcode', barcodeSchema);
