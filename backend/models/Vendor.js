const mongoose = require('mongoose');

const VendorSchema = new mongoose.Schema(
  {
    vendorName: {
      type: String,
      required: [true, 'Please add a vendor name'],
      trim: true,
    },
    vendorCode: {
      type: String,
      required: [true, 'Please add a vendor code'],
      unique: true,
      trim: true,
    },
    companyName: {
      type: String,
      trim: true,
      default: '',
    },
    contactPerson: {
      type: String,
      trim: true,
      default: '',
    },
    mobile: {
      type: String,
      trim: true,
      default: '',
    },
    email: {
      type: String,
      trim: true,
      default: '',
    },
    gstin: {
      type: String,
      trim: true,
      default: '',
    },
    paymentTerms: {
      type: String,
      trim: true,
      default: 'Net 30',
    },
    address: {
      type: String,
      trim: true,
      default: '',
    },
    notes: {
      type: String,
      trim: true,
      default: '',
    },
    createdBy: {
      type: mongoose.Schema.ObjectId,
      ref: 'User',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Vendor', VendorSchema);
