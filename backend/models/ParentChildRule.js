const mongoose = require('mongoose');

const ParentChildRuleSchema = new mongoose.Schema({
  parentLevel: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Level',
    required: true,
    unique: true,
  },
  allowedChildLevels: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Level',
  }],
  maxDirectReports: {
    type: Number,
    default: 15,
  },
  minDirectReports: {
    type: Number,
    default: 1,
  },
  canManageMultipleDepartments: {
    type: Boolean,
    default: true,
  },
  canManageCrossDepartment: {
    type: Boolean,
    default: true,
  },
  approvalLevel: {
    type: Number,
    default: 1,
  },
  autoAssignNewEmployees: {
    type: Boolean,
    default: false,
  },
}, {
  timestamps: true,
});

module.exports = mongoose.model('ParentChildRule', ParentChildRuleSchema);
