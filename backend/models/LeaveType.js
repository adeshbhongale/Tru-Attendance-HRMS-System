const mongoose = require('mongoose');

const LeaveTypeSchema = new mongoose.Schema({
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: [true, 'Leave type must belong to a company'],
    index: true,
  },
  name: {
    type: String,
    required: [true, 'Please add a leave name'],
    trim: true,
  },
  code: {
    type: String,
    required: [true, 'Please add a leave code'],
    trim: true,
  },
  limit: {
    type: Number,
    required: [true, 'Please add a yearly limit'],
    default: 0,
  },
  limitType: {
    type: String,
    enum: ['Monthly', 'Yearly'],
    default: 'Yearly',
  },
  genderRestriction: {
    type: String,
    enum: ['All', 'Male', 'Female', 'Other'],
    default: 'All',
  },
  allowedDurations: {
    type: [String],
    default: ['Full Day', 'Half Day', 'Multiple Days'],
  },
  allowFullDay: {
    type: Boolean,
    default: true,
  },
  allowHalfDay: {
    type: Boolean,
    default: true,
  },
  allowMultipleDays: {
    type: Boolean,
    default: true,
  },
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active',
  },
}, {
  timestamps: true,
});

LeaveTypeSchema.index({ companyId: 1, name: 1 }, { unique: true });
LeaveTypeSchema.index({ companyId: 1, code: 1 }, { unique: true });

module.exports = mongoose.model('LeaveType', LeaveTypeSchema);
