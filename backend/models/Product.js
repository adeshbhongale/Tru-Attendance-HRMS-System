const mongoose = require('mongoose');

const ProductModelSchema = new mongoose.Schema({
  modelName: {
    type: String,
    required: [true, 'Please add a model name'],
    trim: true,
  },
  description: {
    type: String,
    trim: true,
    default: '',
  },
  installationDate: {
    type: Date,
  },
  serialNumbers: [
    {
      type: String,
      trim: true,
    },
  ],
});

const ProductSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Please add a product name'],
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
    imageUrl: {
      type: String,
      trim: true,
      default: '',
    },
    models: [ProductModelSchema],
    createdBy: {
      type: mongoose.Schema.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Product', ProductSchema);
