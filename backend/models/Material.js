const mongoose = require('mongoose');

const MaterialSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Please add a material name'],
      trim: true,
    },
    code: {
      type: String,
      required: [true, 'Please add a material code'],
      unique: true,
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

module.exports = mongoose.model('Material', MaterialSchema);
