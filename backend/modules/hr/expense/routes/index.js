const express = require('express');
const router = express.Router();

const master = require('../controllers/expenseMaster.controller');
const claim = require('../controllers/expenseClaim.controller');
const workflow = require('../controllers/expenseWorkflow.controller');
const upload = require('../controllers/expenseUpload.controller');
const approval = require('../controllers/expenseApproval.controller');
const petty = require('../controllers/pettyCash.controller');
const financeHead = require('../controllers/expenseFinanceHead.controller');
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
router.get('/levels', master.listLevels);
router.get('/grades', master.listGrades);
router.get('/employees', master.employeeOptions);

// Mobile form configuration (types per mode, receipt / remark / full-payment limits)
router.get('/claim-config', claim.getClaimConfig);
// Travel modes + subtypes with the employee's Level Entitlement for each (all modes visible to all)
router.get('/travel-config', claim.getTravelConfig);

// Proof document uploads
router.post('/uploads', upload.uploadMiddleware, upload.uploadProofFile);
router.post('/uploads/base64', upload.uploadProofBase64);

// Claims
router.get('/claims', claim.listClaims);
router.get('/claims/my', claim.myClaims);
router.get('/claims/by-request/:requestId', claim.getClaimByRequestId);
router.get('/claims/:id', claim.getClaim);
router.get('/claims/:id/pdf', claim.downloadClaimPdf);
router.post('/claims/preview', claim.previewClaim);
// Lodging nights / food days + date-wise remaining shared food entitlement
router.post('/claims/food-entitlement', claim.foodEntitlement);
router.post('/claims', claim.createClaim);
router.put('/claims/:id', claim.updateClaim);
router.delete('/claims/:id', claim.deleteClaim);
router.post('/claims/:id/submit', claim.submitClaim);

// Approval stage (Full Payment -> Management, OTHER expense -> Reporting Manager), before Accounts
router.get('/approvers', approval.listApprovers);
router.get('/approvals', approval.myApprovals);
router.post('/claims/:id/approve', approval.approveClaim);
router.post('/claims/:id/approval-reject', approval.rejectApproval);

// CFO / Finance Head (2nd approval for Full Payment / Stock Purchase), one per company.
// View: HR Admin / Company Admin / Super Admin; change: Company Admin / Super Admin (checked in handler)
router.get('/finance-head', financeHead.getFinanceHead);
router.put('/finance-head', financeHead.setFinanceHead);

// Decisions: an approved / Pending claim is marked Paid or Rejected by Accounts
router.get('/accounts/pending', workflow.pendingQueue);
router.post('/claims/:id/accounts-approve', workflow.accountsApproveClaim);
router.post('/claims/:id/payment', workflow.markPaid);
router.post('/claims/:id/reject', workflow.rejectClaim);
router.post('/claims/:id/reopen', workflow.reopenClaim);

// Reports / audit
router.get('/reports', workflow.getExpenseReports);
router.get('/reports/summary', workflow.getExpenseReportsSummary);
router.get('/reports/filter-options', workflow.getReportFilterOptions);
router.get('/reports/export', workflow.exportExpenseReportsCSV);
router.get('/audit', workflow.auditLogs);
router.get('/dashboard-analytics', workflow.getExpenseDashboardAnalytics);

// Petty cash wallet: employee (own wallet only; identity from the auth token)
router.get('/petty-cash/wallet', petty.myWallet);
router.get('/petty-cash/transactions', petty.myTransactions);
router.get('/petty-cash/requests', petty.myRequests);
router.post('/petty-cash/requests', petty.createRequest);
router.get('/petty-cash/return-requests', petty.myReturnRequests);
router.post('/petty-cash/return-requests', petty.createReturnRequest);


// Petty cash wallet: Accounts Admin (role checked in every handler)
router.get('/petty-cash/admin/summary', petty.adminSummary);
router.get('/petty-cash/admin/wallets', petty.adminWallets);
router.get('/petty-cash/admin/wallets/:employeeId', petty.adminWalletDetail);
router.post('/petty-cash/admin/wallets/:employeeId/enable', petty.setEnabled);
router.post('/petty-cash/admin/wallets/:employeeId/base-limit', petty.setBaseLimit);
router.post('/petty-cash/admin/wallets/:employeeId/topup', petty.topUp);
router.post('/petty-cash/admin/wallets/:employeeId/adjust', petty.adjust);
router.get('/petty-cash/admin/transactions/:id', petty.transactionDetail);
router.post('/petty-cash/admin/transactions/:id/reverse', petty.reverse);
router.get('/petty-cash/admin/requests', petty.adminRequests);
router.post('/petty-cash/admin/requests/:id/approve', petty.approveRequest);
router.post('/petty-cash/admin/requests/:id/reject', petty.rejectRequest);
router.post('/petty-cash/admin/requests/:id/fulfil', petty.fulfilRequest);
router.get('/petty-cash/admin/return-requests', petty.adminReturnRequests);
router.get('/petty-cash/admin/return-requests/:id', petty.adminReturnRequestDetail);
router.post('/petty-cash/admin/return-requests/:id/approve', petty.approveReturnRequest);
router.post('/petty-cash/admin/return-requests/:id/reject', petty.rejectReturnRequest);
router.get('/petty-cash/admin/reports', petty.reports);
router.get('/petty-cash/admin/reports/export', petty.exportReport);

module.exports = router;
