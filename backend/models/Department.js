const mongoose = require('mongoose');

const DepartmentSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please add a department name'],
    unique: true,
    trim: true,
  },
  prefix: {
    type: String,
    required: [true, 'Please add a department prefix code (2 letters)'],
    unique: true,
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
    enum: ['active', 'inactive'],
    default: 'active',
  },
  roleLevels: {
    type: [{
      level: { type: Number, required: true },
      name: { type: String, required: true },
    }],
    default: [
      { level: 1, name: 'Level 1' },
      { level: 2, name: 'Level 2' },
      { level: 3, name: 'Level 3' },
      { level: 4, name: 'Level 4' },
      { level: 5, name: 'Level 5' },
    ],
  },
  roleGrades: {
    type: [{
      grade: { type: String, required: true },
      name: { type: String, required: true },
    }],
    default: [
      { grade: 'a', name: 'Grade A' },
      { grade: 'b', name: 'Grade B' },
      { grade: 'c', name: 'Grade C' },
    ],
  },
}, {
  timestamps: true,
});

module.exports = mongoose.model('Department', DepartmentSchema);
