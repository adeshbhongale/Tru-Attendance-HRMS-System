const mongoose = require('mongoose');

const RolePermissionSchema = new mongoose.Schema({
  permissionKey: {
    type: String,
    required: [true, 'Please add a permission key'],
    unique: true,
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
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active',
  },
}, {
  timestamps: true,
});

module.exports = mongoose.model('RolePermission', RolePermissionSchema);
