const mongoose = require('mongoose');

const MaterialSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: [true, 'Material must belong to a company'],
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Please add a material name'],
      trim: true,
    },
    code: {
      type: String,
      required: [true, 'Please add a material code'],
      uppercase: true,
      trim: true,
    },
    category: {
      type: String,
      trim: true,
      default: 'Raw Material',
    },
    uom: {
      type: String,
      trim: true,
      default: 'Units',
    },
    barcode: {
      type: String,
      trim: true,
      default: '',
    },
    imageUrl: {
      type: String,
      trim: true,
      default: '',
    },
    preferredVendors: [
      {
        type: mongoose.Schema.ObjectId,
        ref: 'Vendor',
      },
    ],
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

MaterialSchema.index({ companyId: 1, code: 1 }, { unique: true });

module.exports = mongoose.model('Material', MaterialSchema);
