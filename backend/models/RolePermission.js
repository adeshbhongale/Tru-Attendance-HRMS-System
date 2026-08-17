const mongoose = require('mongoose');

const RolePermissionSchema = new mongoose.Schema({
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    default: null,
    index: true,
  },
  permissionKey: {
    type: String,
    required: [true, 'Please add a permission key'],
    trim: true,
    index: true,
  },
  category: {
    type: String,
    required: [true, 'Please add a category'],
    trim: true,
  },
  description: {
    type: String,
    trim: true,
    default: '',
  },
  usedIn: {
    type: String,
    trim: true,
    default: '',
  },
  usagePurpose: {
    type: String,
    trim: true,
    default: '',
  },
  allowedRoles: {
    type: [String],
    default: [],
  },
  allowedRoleCodes: {
    type: [String],
    default: [],
  },
  minLevelNumber: {
    type: Number,
    default: null,
  },
  allowedCategories: {
    type: [String],
    enum: ['DIRECTOR', 'MANAGEMENT', 'LEADERSHIP', 'STAFF', 'TRAINEE'],
    default: [],
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'ACTIVE', 'INACTIVE'],
    default: 'active',
  },
}, {
  timestamps: true,
});

RolePermissionSchema.index({ companyId: 1, permissionKey: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('RolePermission', RolePermissionSchema);

