const express = require('express');
const router = express.Router();
const {
  getPermissions,
  updatePermission,
  bulkUpdatePermissions,
  resetPermissionsToDefault,
} = require('../controllers/permissions');

const { requireRoleLevel, requireRole } = require('../middleware/rbac');
const { protect } = require('../middleware/auth');

router.use(protect);

router.get('/', getPermissions);
router.put('/:key', requireRoleLevel(1), updatePermission);
router.post('/bulk', requireRoleLevel(1), bulkUpdatePermissions);
router.post('/reset', requireRoleLevel(1), resetPermissionsToDefault);

module.exports = router;
