const express = require('express');
const router = express.Router();
const reportController = require('../controllers/report.controller');
const { protect } = require('../../../middleware/auth');
const { requirePermission } = require('../../../middleware/rbac');

router.use(protect);

router.get('/transactions', requirePermission('report:view'), reportController.getTransactionReport);
router.get('/transactions/export', requirePermission('report:export'), reportController.exportTransactionReport);
router.get('/dc-employee/export', requirePermission('report:export'), reportController.exportDcEmployeeReport);
router.get('/', requirePermission('report:view'), reportController.getTransactionReport);
router.get('/export', requirePermission('report:export'), reportController.exportTransactionReport);

module.exports = router;
