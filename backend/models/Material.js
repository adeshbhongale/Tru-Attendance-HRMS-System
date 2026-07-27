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
      enum: ['raw_material', 'wip', 'finished_goods', 'consumable'],
      default: 'raw_material',
    },
    uom: {
      type: String,
      trim: true,
      default: 'Units',
    },
    safetyStock: {
      type: Number,
      default: 0,
    },
    imageUrl: {
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

module.exports = mongoose.model('Material', MaterialSchema);
