const mongoose = require('mongoose');

const DesignationSchema = new mongoose.Schema({
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: [true, 'Designation must belong to a company'],
    index: true,
  },
  name: {
    type: String,
    required: [true, 'Please add a designation name'],
    trim: true,
  },
  level: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Level',
  },
  department: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Department',
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

DesignationSchema.index({ companyId: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('Designation', DesignationSchema);

