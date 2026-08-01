const express = require('express');
const router = express.Router();
const { protect } = require('../../../middleware/auth');
const {
  getInternalReceipts, createInternalReceipt,
  getExternalReceipts, createExternalReceipt, getReceipt,
  exportReceiptToExcel, exportReceiptToPDF,
} = require('../controllers/receiving.controller');

const { requirePermission } = require('../../../middleware/rbac');

router.use(protect);

router.get('/internal', requirePermission('receiving:receive'), getInternalReceipts);
router.post('/internal', requirePermission('receiving:receive'), createInternalReceipt);
router.get('/external', requirePermission('receiving:receive'), getExternalReceipts);
router.post('/external', requirePermission('receiving:receive'), createExternalReceipt);
router.get('/:id', requirePermission('receiving:receive'), getReceipt);
router.get('/:id/export/excel', requirePermission('receiving:receive'), exportReceiptToExcel);
router.get('/:id/export/pdf', requirePermission('receiving:receive'), exportReceiptToPDF);

module.exports = router;
