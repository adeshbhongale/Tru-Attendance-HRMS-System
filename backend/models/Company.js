const mongoose = require('mongoose');

const CompanySchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please add a company name'],
    unique: true,
    trim: true,
  },
  code: {
    type: String,
    required: [true, 'Please add a unique company code'],
    unique: true,
    uppercase: true,
    trim: true,
  },
  description: {
    type: String,
    default: '',
  },
  branches: [{
    name: { type: String, required: true },
    code: { type: String, required: true },
    city: String,
    address: String,
    isHeadquarters: { type: Boolean, default: false },
  }],
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active',
  },
}, {
  timestamps: true,
});

module.exports = mongoose.model('Company', CompanySchema);
