const RolePermission = require('../models/RolePermission');
const rbac = require('../middleware/rbac');

// @desc    Get all permissions (grouped by category)
// @route   GET /api/permissions
// @access  Private/Admin
exports.getPermissions = async (req, res) => {
  try {
    const permissions = await RolePermission.find({ status: 'active' }).sort({ category: 1, permissionKey: 1 });

    // Group by category
    const grouped = {};
    permissions.forEach(p => {
      if (!grouped[p.category]) {
        grouped[p.category] = [];
      }
      grouped[p.category].push(p);
    });

    res.status(200).json({
      success: true,
      count: permissions.length,
      grouped,
      data: permissions,
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    Update single permission key configuration
// @route   PUT /api/permissions/:key
// @access  Private/SuperAdmin
exports.updatePermission = async (req, res) => {
  try {
    const { allowedRoles, allowedRoleCodes, description, status } = req.body;
    const permissionKey = req.params.key;

    const permission = await RolePermission.findOneAndUpdate(
      { permissionKey },
      { allowedRoles, allowedRoleCodes, description, status },
      { new: true, runValidators: true, upsert: true }
    );

    // Refresh memory cache in RBAC middleware
    await rbac.syncPermissionsFromDB();

    res.status(200).json({ success: true, data: permission });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    Bulk update multiple permissions
// @route   POST /api/permissions/bulk
// @access  Private/SuperAdmin
exports.bulkUpdatePermissions = async (req, res) => {
  try {
    const { permissions } = req.body; // Array of { permissionKey, allowedRoles, allowedRoleCodes }

    if (!Array.isArray(permissions)) {
      return res.status(400).json({ success: false, message: 'Please provide an array of permission configurations' });
    }

    const bulkOps = permissions.map(p => ({
      updateOne: {
        filter: { permissionKey: p.permissionKey },
        update: {
          $set: {
            allowedRoles: p.allowedRoles || [],
            allowedRoleCodes: p.allowedRoleCodes || [],
            ...(p.description && { description: p.description }),
            ...(p.status && { status: p.status }),
          }
        },
        upsert: true,
      }
    }));

    await RolePermission.bulkWrite(bulkOps);

    // Refresh memory cache in RBAC middleware
    await rbac.syncPermissionsFromDB();

    res.status(200).json({ success: true, message: 'Permissions updated successfully' });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    Reset permissions to system default matrix
// @route   POST /api/permissions/reset
// @access  Private/SuperAdmin
exports.resetPermissionsToDefault = async (req, res) => {
  try {
    const seedPermissions = require('../scripts/seed_permissions');
    await seedPermissions.seedAllPermissions();

    // Refresh memory cache in RBAC middleware
    await rbac.syncPermissionsFromDB();

    res.status(200).json({ success: true, message: 'Permissions reset to system defaults successfully' });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};
