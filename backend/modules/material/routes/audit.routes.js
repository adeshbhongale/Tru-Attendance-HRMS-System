const express = require('express');
const router = express.Router();
const auditController = require('../controllers/audit.controller');
const { protect } = require('../../../middleware/auth');
const { requirePermission } = require('../../../middleware/rbac');

router.get('/', protect, requirePermission('audit:view'), auditController.getAuditLogs);
router.get('/activities', protect, auditController.getMaterialMovementActivities);

module.exports = router;
