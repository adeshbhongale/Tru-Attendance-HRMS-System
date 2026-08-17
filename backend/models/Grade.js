const mongoose = require('mongoose');

const GradeSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please add a grade name'],
    trim: true,
  },
  code: {
    type: String,
    required: [true, 'Please add a grade code'],
    lowercase: true,
    trim: true,
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
  gradeLabel: {
    type: String,
    default: '',
    trim: true,
  },
  order: {
    type: Number,
    default: 1,
  },
  gradeOrder: {
    type: Number,
    default: 1,
  },
  salaryMultiplier: {
    type: Number,
    default: 1.0,
  },
  promotionRule: {
    type: String,
    default: '',
  },
  description: {
    type: String,
    default: '',
  },
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active',
  },
}, {
  timestamps: true,
});

module.exports = mongoose.model('Grade', GradeSchema);
