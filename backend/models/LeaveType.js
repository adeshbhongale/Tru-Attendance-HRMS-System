const mongoose = require('mongoose');

const LeaveTypeSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please add a leave name'],
    unique: true,
    trim: true,
  },
  code: {
    type: String,
    required: [true, 'Please add a leave code'],
    unique: true,
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
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active',
  },
}, {
  timestamps: true,
});

module.exports = mongoose.model('LeaveType', LeaveTypeSchema);
