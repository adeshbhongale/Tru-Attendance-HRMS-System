const mongoose = require('mongoose');

const LevelSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please add a level name'],
    unique: true,
    trim: true,
  },
  priority: {
    type: Number,
    required: [true, 'Please add a priority level (Higher number = higher authority)'],
    unique: true,
    index: true,
  },
  canApprove: {
    type: Boolean,
    default: true,
  },
  canAssign: {
    type: Boolean,
    default: false,
  },
  canViewDown: {
    type: Boolean,
    default: true,
  },
  canViewAll: {
    type: Boolean,
    default: false,
  },
  canManageTeam: {
    type: Boolean,
    default: false,
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

module.exports = mongoose.model('Level', LevelSchema);
