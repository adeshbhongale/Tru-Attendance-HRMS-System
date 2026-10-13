const express = require('express');
const router = express.Router();

const master = require('../controllers/expenseMaster.controller');
const claim = require('../controllers/expenseClaim.controller');
const workflow = require('../controllers/expenseWorkflow.controller');
const upload = require('../controllers/expenseUpload.controller');
const { canConfigure } = require('../services/expenseAccess');

// Policy / master mutations: HR, Company Admin, Super Admin only
const requireConfigRole = (req, res, next) => (canConfigure(req.user)
  ? next()
  : res.status(403).json({ success: false, message: 'Only HR / Admin / Super Admin can change expense configuration.' }));

// Policy & master data
router.get('/policies', master.listPolicies);
router.get('/policies/active', master.getActivePolicy);
router.post('/policies', requireConfigRole, master.createPolicy);
router.put('/policies/:id', requireConfigRole, master.updatePolicy);
router.delete('/policies/:id', requireConfigRole, master.deletePolicy);
router.post('/policies/:id/publish', requireConfigRole, master.publishPolicy);

router.get('/types', master.getTypes);
router.post('/types', requireConfigRole, master.createType);
router.put('/types/:id', requireConfigRole, master.updateType);
router.delete('/types/:id', requireConfigRole, master.deleteType);
router.get('/cities', master.listCities);
router.post('/cities', requireConfigRole, master.createCity);
router.put('/cities/:id', requireConfigRole, master.updateCity);
router.delete('/cities/:id', requireConfigRole, master.deleteCity);
router.get('/cities/:city', master.resolveCity);
router.get('/entitlements', master.listEntitlements);
router.get('/entitlements/all', master.listAllEntitlements);
router.post('/entitlements', requireConfigRole, master.createEntitlement);
router.put('/entitlements/:id', requireConfigRole, master.updateEntitlement);
router.delete('/entitlements/:id', requireConfigRole, master.deleteEntitlement);
router.get('/travel-modes', master.listTravelModes);
router.get('/travel-modes/all', master.listAllTravelModes);
router.post('/travel-modes', requireConfigRole, master.createTravelMode);
router.put('/travel-modes/:id', requireConfigRole, master.updateTravelMode);
router.delete('/travel-modes/:id', requireConfigRole, master.deleteTravelMode);
router.get('/employees', master.employeeOptions);

// Mobile form configuration (types per mode, receipt / remark / full-payment limits)
router.get('/claim-config', claim.getClaimConfig);

// Proof document uploads
router.post('/uploads', upload.uploadMiddleware, upload.uploadProofFile);
router.post('/uploads/base64', upload.uploadProofBase64);

// Claims
router.get('/claims', claim.listClaims);
router.get('/claims/my', claim.myClaims);
router.get('/claims/by-request/:requestId', claim.getClaimByRequestId);
router.get('/claims/:id', claim.getClaim);
router.post('/claims/preview', claim.previewClaim);
router.post('/claims', claim.createClaim);
router.put('/claims/:id', claim.updateClaim);
router.delete('/claims/:id', claim.deleteClaim);
router.post('/claims/:id/submit', claim.submitClaim);

// Workflow (HR / Full payment / Accounts / audit)
router.get('/hr/pending', workflow.hrPending);
router.post('/claims/:id/hr-decision', workflow.hrDecision);
router.post('/claims/:id/full-payment/decision', workflow.fullPaymentDecision);
router.get('/accounts/pending', workflow.accountsPending);
router.post('/claims/:id/accounts-decision', workflow.accountsDecision);
router.post('/claims/:id/reject', workflow.accountsDecision);
router.post('/claims/:id/payment', workflow.disburseClaim);
router.post('/claims/:id/disburse', workflow.disburseClaim);
router.post('/claims/batch-disburse', workflow.batchDisburseClaims);
router.get('/accounts/awaiting-disbursement', workflow.awaitingDisbursement);
router.get('/reports', workflow.getExpenseReports);
router.get('/reports/summary', workflow.getExpenseReportsSummary);
router.get('/reports/export', workflow.exportExpenseReportsCSV);
router.get('/audit', workflow.auditLogs);
router.get('/dashboard-analytics', workflow.getExpenseDashboardAnalytics);

module.exports = router;
