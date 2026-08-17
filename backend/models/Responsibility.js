const mongoose = require('mongoose');

const ResponsibilitySchema = new mongoose.Schema({
  code: {
    type: String,
    required: [true, 'Please add a responsibility code'],
    uppercase: true,
    trim: true,
    index: true,
  },
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    default: null,
    index: true,
  },
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    default: null,
  },
  name: {
    type: String,
    required: [true, 'Please add a responsibility name'],
    trim: true,
  },
  module: {
    type: String,
    enum: ['HRMS', 'Material', 'Finance', 'Leave', 'Attendance', 'Expenses', 'Purchase', 'Sales', 'CRM', 'Projects', 'General'],
    default: 'General',
  },
  description: {
    type: String,
    default: '',
  },
  assignedEmployees: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  }],
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active',
  },
}, {
  timestamps: true,
});

module.exports = mongoose.model('Responsibility', ResponsibilitySchema);
