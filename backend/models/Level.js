const mongoose = require('mongoose');

const LevelSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please add a level name'],
    trim: true,
  },
  levelNumber: {
    type: Number,
    required: [true, 'Please add a level number (auto-assigned, lower = higher authority)'],
    unique: true,
    index: true,
  },
  category: {
    type: String,
    enum: ['DIRECTOR', 'MANAGEMENT', 'LEADERSHIP', 'STAFF', 'TRAINEE'],
    required: [true, 'Please add a category'],
  },
  categoryPrefix: {
    type: String,
    enum: ['DI', 'MN', 'LD', null],
    default: null,
  },
  usesDepartmentPrefix: {
    type: Boolean,
    default: false,
  },
  defaultDataScope: {
    type: String,
    enum: ['SELF', 'TEAM', 'SUB_DEPARTMENT', 'DEPARTMENT', 'BRANCH', 'COMPANY', 'ALL'],
    default: 'SELF',
  },
  canApprove: {
    type: Boolean,
    default: false,
  },
  canAssign: {
    type: Boolean,
    default: false,
  },
  canViewDown: {
    type: Boolean,
    default: false,
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
