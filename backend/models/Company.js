const mongoose = require('mongoose');

const CompanySchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please add a company name'],
    trim: true,
  },
  companyName: {
    type: String,
    trim: true,
  },
  code: {
    type: String,
    required: [true, 'Please add a unique company code'],
    uppercase: true,
    trim: true,
  },
  companyCode: {
    type: String,
    uppercase: true,
    trim: true,
  },
  legalName: { type: String, trim: true },
  gstNumber: { type: String, trim: true, uppercase: true },
  panNumber: { type: String, trim: true, uppercase: true },
  address: {
    addressLine1: String,
    addressLine2: String,
    city: String,
    state: String,
    country: { type: String, default: 'India' },
    pincode: String,
  },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
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
    enum: ['ACTIVE', 'INACTIVE', 'SUSPENDED', 'active', 'inactive'],
    default: 'ACTIVE',
  },
}, {
  timestamps: true,
});

CompanySchema.index({ code: 1 }, { unique: true });
CompanySchema.index({ companyCode: 1 }, { unique: true, sparse: true });

CompanySchema.pre('validate', function () {
  if (!this.companyName) this.companyName = this.name;
  if (!this.name) this.name = this.companyName;
  if (!this.companyCode) this.companyCode = this.code;
  if (!this.code) this.code = this.companyCode;
});

module.exports = mongoose.model('Company', CompanySchema);
