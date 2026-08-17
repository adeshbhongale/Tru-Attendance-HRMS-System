const express = require('express');
const router = express.Router();
const txnController = require('../controllers/transaction.controller');
const { protect } = require('../../../middleware/auth');
const { tenantContext, sanitizeTenantPayload } = require('../../../middleware/tenantMiddleware');
const { requirePermission } = require('../../../middleware/rbac');

router.use(protect);
router.use(tenantContext, sanitizeTenantPayload);

router.post('/', requirePermission('transaction:create'), txnController.createTransaction);
router.get('/', requirePermission('transaction:view_own', 'transaction:view_all', 'transaction:view_department', 'transaction:view_team'), txnController.getTransactions);
router.get('/pending-approvals', requirePermission('approval:view'), txnController.getPendingApprovals);
router.get('/workflow-context', txnController.getWorkflowContext);
router.get('/:id/workflow-context', txnController.getWorkflowContext);
router.get('/:id', requirePermission('transaction:view_own', 'transaction:view_all'), txnController.getTransaction);
router.put('/:id', requirePermission('transaction:create', 'transaction:view_own'), txnController.updateTransaction);
router.put('/:id/approve', requirePermission('approval:approve'), txnController.approveTransaction);
router.put('/:id/reject', requirePermission('approval:reject'), txnController.rejectTransaction);
router.put('/:id/store-accept', requirePermission('store:accept'), txnController.storeAccept);
router.put('/:id/assign-handler', requirePermission('store:assign_handler', 'transaction:view_own'), txnController.assignHandler);
router.patch('/:id/store-action', requirePermission('store:accept', 'store:assign_handler'), txnController.storeAction);
router.patch('/:id/handler-action', requirePermission('store:assign_handler', 'transaction:create', 'transaction:view_own'), txnController.handlerAction);
router.patch('/:id/receive', requirePermission('transaction:create', 'transaction:view_own'), txnController.receiveTransaction);
router.patch('/:id/reject-receipt', requirePermission('transaction:create', 'transaction:view_own'), txnController.rejectReceipt);
router.put('/:id/assign-management', requirePermission('transaction:create', 'transaction:view_own'), txnController.assignManagementApprover);
router.put('/:id/cancel', requirePermission('transaction:cancel'), txnController.cancelTransaction);
router.delete('/:id', requirePermission('transaction:create', 'transaction:view_own'), txnController.deleteTransaction);
router.post('/:transactionId/store-dispatch', txnController.storeDispatchTransaction);
router.get('/:id/export', requirePermission('transaction:view_own', 'transaction:view_all'), txnController.exportTransactionToExcel);
router.get('/:id/export/pdf', requirePermission('transaction:view_own', 'transaction:view_all'), txnController.exportTransactionToPDF);

module.exports = router;
