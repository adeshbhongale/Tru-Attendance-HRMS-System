const express = require('express');
const router = express.Router();

const master = require('../controllers/expenseMaster.controller');
const claim = require('../controllers/expenseClaim.controller');
const workflow = require('../controllers/expenseWorkflow.controller');
const upload = require('../controllers/expenseUpload.controller');

// Policy & master data
router.get('/policies', master.listPolicies);
router.get('/policies/active', master.getActivePolicy);
router.post('/policies', master.createPolicy);
router.put('/policies/:id', master.updatePolicy);
router.delete('/policies/:id', master.deletePolicy);
router.post('/policies/:id/publish', master.publishPolicy);

router.get('/types', master.getTypes);
router.post('/types', master.createType);
router.put('/types/:id', master.updateType);
router.delete('/types/:id', master.deleteType);
router.get('/cities', master.listCities);
router.post('/cities', master.createCity);
router.put('/cities/:id', master.updateCity);
router.delete('/cities/:id', master.deleteCity);
router.get('/cities/:city', master.resolveCity);
router.get('/entitlements', master.listEntitlements);
router.get('/entitlements/all', master.listAllEntitlements);
router.post('/entitlements', master.createEntitlement);
router.put('/entitlements/:id', master.updateEntitlement);
router.delete('/entitlements/:id', master.deleteEntitlement);
router.get('/travel-modes', master.listTravelModes);
router.get('/travel-modes/all', master.listAllTravelModes);
router.post('/travel-modes', master.createTravelMode);
router.put('/travel-modes/:id', master.updateTravelMode);
router.delete('/travel-modes/:id', master.deleteTravelMode);
router.get('/employees', master.employeeOptions);

// Proof document uploads
router.post('/uploads', upload.uploadMiddleware, upload.uploadProofFile);
router.post('/uploads/base64', upload.uploadProofBase64);

// Claims
router.get('/claims', claim.listClaims);
router.get('/claims/my', claim.myClaims);
router.get('/claims/:id', claim.getClaim);
router.post('/claims/preview', claim.previewClaim);
router.post('/claims', claim.createClaim);
router.put('/claims/:id', claim.updateClaim);
router.delete('/claims/:id', claim.deleteClaim);
router.post('/claims/:id/submit', claim.submitClaim);

// Workflow (HR / Accounts / audit)
router.get('/hr/pending', workflow.hrPending);
router.post('/claims/:id/hr-decision', workflow.hrDecision);
router.get('/accounts/pending', workflow.accountsPending);
router.post('/claims/:id/accounts-decision', workflow.accountsDecision);
router.post('/claims/:id/reject', workflow.accountsDecision);
router.post('/claims/:id/disburse', workflow.disburseClaim);
router.get('/audit', workflow.auditLogs);
router.get('/dashboard-analytics', workflow.getExpenseDashboardAnalytics);

module.exports = router;
