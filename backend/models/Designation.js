const mongoose = require('mongoose');

const DesignationSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please add a designation name'],
    unique: true,
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
    enum: ['active', 'inactive'],
    default: 'active',
  },
}, {
  timestamps: true,
});

module.exports = mongoose.model('Designation', DesignationSchema);
