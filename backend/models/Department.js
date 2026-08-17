const mongoose = require('mongoose');

const DepartmentSchema = new mongoose.Schema({
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: [true, 'Department must belong to a company'],
    index: true,
  },
  name: {
    type: String,
    required: [true, 'Please add a department name'],
    trim: true,
  },
  prefix: {
    type: String,
    required: [true, 'Please add a department prefix code (2 letters)'],
    uppercase: true,
    trim: true,
    minlength: [2, 'Prefix must be exactly 2 characters'],
    maxlength: [2, 'Prefix must be exactly 2 characters'],
    match: [/^[A-Z]{2}$/, 'Prefix must be 2 uppercase letters'],
  },
  description: {
    type: String,
    maxlength: [500, 'Description can not be more than 500 characters'],
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'ACTIVE', 'INACTIVE'],
    default: 'active',
  },
}, {
  timestamps: true,
});

DepartmentSchema.index({ companyId: 1, name: 1 }, { unique: true });
DepartmentSchema.index({ companyId: 1, prefix: 1 }, { unique: true });

module.exports = mongoose.model('Department', DepartmentSchema);

