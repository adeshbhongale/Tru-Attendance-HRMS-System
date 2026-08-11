const express = require('express');
const router = express.Router();
const barcodeController = require('../controllers/barcode.controller');
const barcodeExportController = require('../controllers/barcodeExport.controller');
const tallyDcFocController = require('../controllers/tallyDcFoc.controller');
const { protect } = require('../../../middleware/auth');
const { requirePermission } = require('../../../middleware/rbac');

router.use(protect);

router.get('/store-available', barcodeController.getStoreAvailableBarcodes);
router.get('/', requirePermission('barcode:view'), barcodeController.listBarcodes);
router.get('/search', requirePermission('barcode:view'), barcodeController.searchBarcodes);
router.get('/pending/transfers', barcodeController.getPendingTransfers);
router.get('/list/transfers', barcodeController.getAllTransfers);
router.get('/list/returns', barcodeController.getAllReturns);
router.get('/list/splits', barcodeController.getAllSplitRequests);
router.get('/list/close-requests', barcodeController.getAllCloseRequests);
router.get('/list/exchange-requests', barcodeController.getAllExchangeRequests);
router.get('/split-requests/pending', requirePermission('approval:view'), barcodeController.getPendingSplitRequests);
router.get('/returns/pending', requirePermission('return:view'), barcodeController.getPendingReturns);
router.get('/close-requests/pending', requirePermission('approval:view'), barcodeController.getPendingCloseRequests);
router.get('/transaction/:transactionId', requirePermission('barcode:view'), barcodeController.getBarcodesByTransaction);
router.get('/tally/customers', requirePermission('barcode:view'), tallyDcFocController.getTallyCustomers);
router.get('/exchange-requests/pending', requirePermission('approval:view'), barcodeController.getPendingExchangeRequests);
router.get('/exchange-requests/transaction/:transactionId', requirePermission('barcode:view'), barcodeController.getExchangeRequestsByTransaction);
router.get('/my-active', barcodeController.getUserActiveBarcodes);
router.get('/list/merge-requests', barcodeController.getAllMergeRequests);
router.get('/merge-requests/pending', requirePermission('approval:view'), barcodeController.getPendingMergeRequests);

router.post('/transfer', requirePermission('transfer:create'), barcodeController.transferBarcode);
router.post('/handle-transfer', requirePermission('transfer:create', 'transfer:approve'), barcodeController.handleTransfer);
router.post('/return', barcodeController.returnBarcode);
router.post('/returns', barcodeController.returnBarcode);
router.post('/return-multiple', barcodeController.returnMultipleBarcodes);
router.post('/returns/bulk-accept', barcodeController.bulkAcceptReturns);
router.put('/return/:returnId/accept', barcodeController.acceptReturn);
router.put('/return/:returnId/handler-action', barcodeController.handleReturnHandlerAction);
router.put('/return/:returnId/assign-handler', barcodeController.assignReturnHandler);
router.post('/split-request', requirePermission('material:view'), barcodeController.createSplitRequest);
router.post('/approve-split', requirePermission('approval:approve'), barcodeController.approveSplitRequest);
router.post('/close-request', requirePermission('barcode:view'), barcodeController.createCloseRequest);
router.post('/close-requests/:requestId/respond', requirePermission('approval:approve'), barcodeController.handleCloseRequest);
router.post('/exchange-request', requirePermission('material:view'), barcodeController.createExchangeRequest);
router.post('/exchange-requests/:requestId/respond', requirePermission('approval:approve'), barcodeController.handleExchangeRequest);
router.post('/merge-request', requirePermission('material:view'), barcodeController.createMergeRequest);
router.post('/approve-merge', requirePermission('approval:approve'), barcodeController.approveMergeRequest);

// Parameterized routes (MUST be after static paths)
router.get('/:barcode', requirePermission('barcode:view'), barcodeController.getBarcodeDetail);
router.get('/:barcode/export/excel', requirePermission('barcode:view'), barcodeExportController.exportBarcodeToExcel);
router.get('/:barcode/export/pdf', requirePermission('barcode:view'), barcodeExportController.exportBarcodeToPDF);

module.exports = router;
