const mongoose = require('mongoose');
try { require('../../../../models/Company'); } catch (_) {}
try { require('../../../../models/User'); } catch (_) {}
const ExpenseClaim = require('../models/ExpenseClaim');
const ExpenseAuditLog = require('../models/ExpenseAuditLog');
const access = require('../services/expenseAccess');
const { computePayable, formatINR } = require('../services/claimRules');
const { round2 } = require('../services/calculationEngine');

/**
 * HR / Full-payment / Accounts workflow on top of the existing statuses:
 * HR_PENDING -> (FULL_PAYMENT_PENDING) -> ACCOUNTS_PENDING -> PAID (locked)
 */

const resolveTenantCompanyId = async (req) => access.resolveCompanyId(req, { allowAll: true });
const { isHR, isAccounts } = access;

const fail = (res, status, message) => res.status(status).json({ success: false, message });

async function loadClaim(req, res) {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) { fail(res, 404, 'Claim not found'); return null; }
  const claim = await ExpenseClaim.findById(req.params.id);
  if (!claim) { fail(res, 404, 'Claim not found'); return null; }
  if (!access.sameCompany(claim, await resolveTenantCompanyId(req))) { fail(res, 404, 'Claim not found'); return null; }
  return claim;
}

const POPULATE_QUEUE = [
  { path: 'submittedBy', select: 'name employeeIdCode department' },
  { path: 'companyId', select: 'name code' },
];

/**
 * GET /api/expense/hr/pending — HR queue (HR review + full-payment approvals)
 */
exports.hrPending = async (req, res) => {
  try {
    if (!isHR(req.user)) return fail(res, 403, 'HR or Admin role required.');
    const companyId = await resolveTenantCompanyId(req);
    // HR only reviews standard claims; claims with full payment bypass HR and go directly to Accounts
    const filter = { status: 'HR_PENDING', 'fullPayment.requested': { $ne: true } };
    if (companyId && companyId !== 'ALL') filter.companyId = companyId;
    const claims = await ExpenseClaim.find(filter).populate(POPULATE_QUEUE).sort({ createdAt: 1 }).lean();
    res.json({ success: true, data: claims });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * POST /api/expense/claims/:id/full-payment/decision  { action: 'approved'|'rejected', remarks }
 * Approve => payable becomes the full requested amount. Reject => payable stays at the allowed amount.
 * Never allowed for anyone on the claim.
 */
exports.fullPaymentDecision = async (req, res) => {
  try {
    if (!isHR(req.user)) return fail(res, 403, 'Only HR / Admin can approve full payment requests.');
    const claim = await loadClaim(req, res);
    if (!claim) return;
    const perms = access.claimPermissions(req, claim);
    if (!perms.canDecideFullPayment) {
      if (access.isOnClaim(claim, access.userId(req)) || access.isCreator(claim, access.userId(req))) {
        return fail(res, 403, 'You cannot approve a full payment request on your own claim.');
      }
      return fail(res, 409, 'This claim has no full payment request waiting for approval.');
    }
    const action = req.body.action === 'rejected' ? 'rejected' : 'approved';
    const remarks = String(req.body.remarks || '').trim().slice(0, 500);
    if (action === 'rejected' && !remarks) return fail(res, 422, 'Please enter the reason for rejecting the full payment request.');

    const before = access.snapshot(claim);
    const fp = claim.fullPayment;
    fp.status = action === 'approved' ? 'APPROVED' : 'REJECTED';
    fp.approvedAmount = action === 'approved' ? claim.grandRequested : 0;
    fp.decidedBy = req.user._id;
    fp.decidedByName = req.user.name || '';
    fp.decidedAt = new Date();
    fp.decisionRemarks = remarks;
    claim.payableAmount = computePayable(claim);
    claim.status = 'ACCOUNTS_PENDING';
    claim.approvalHistory.push({ user: req.user._id, role: req.user.role, action, timestamp: new Date(), remarks: `Full payment ${action}${remarks ? `: ${remarks}` : ''}` });
    claim.timeline.push({
      action: action === 'approved' ? 'FULL_PAYMENT_APPROVED' : 'FULL_PAYMENT_REJECTED',
      description: action === 'approved'
        ? `Full payment approved. Payable amount is ${formatINR(claim.payableAmount)}.`
        : `Full payment rejected${remarks ? `: ${remarks}` : ''}. Payable amount stays at the allowed ${formatINR(claim.payableAmount)}.`,
      user: req.user._id,
      timestamp: new Date(),
    });
    await claim.save();

    await access.audit({
      req,
      action: action === 'approved' ? 'FULL_PAYMENT_APPROVED' : 'FULL_PAYMENT_REJECTED',
      claim,
      description: `Full payment ${action} for ${claim.claimNumber} (payable ${formatINR(claim.payableAmount)}).`,
      before,
      after: access.snapshot(claim),
      metadata: { remarks },
    });
    res.json({ success: true, data: { ...claim.toObject(), permissions: access.claimPermissions(req, claim) } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * POST /api/expense/claims/:id/hr-decision  { action: 'approved'|'rejected'|'returned', remarks }
 */
exports.hrDecision = async (req, res) => {
  try {
    if (!isHR(req.user)) return fail(res, 403, 'HR or Admin role required.');
    const claim = await loadClaim(req, res);
    if (!claim) return;
    // The HR queue also lists full-payment approvals; route those to the dedicated handler.
    if (claim.status === 'FULL_PAYMENT_PENDING') return exports.fullPaymentDecision(req, res);
    if (claim.status !== 'HR_PENDING') return fail(res, 409, `Claim is ${claim.status}, not waiting for HR review.`);
    if (!access.claimPermissions(req, claim).canHrDecide) return fail(res, 403, 'You cannot review a claim you are part of.');

    const action = ['rejected', 'returned'].includes(req.body.action) ? req.body.action : 'approved';
    const remarks = String(req.body.remarks || '').trim().slice(0, 500);
    if (action !== 'approved' && !remarks) return fail(res, 422, `Please enter the reason for ${action === 'rejected' ? 'rejecting' : 'returning'} the claim.`);
    const before = access.snapshot(claim);

    claim.approvalHistory.push({ user: req.user._id, role: req.user.role, action, timestamp: new Date(), remarks });
    claim.hrReviewedAt = new Date();
    claim.hrReviewedBy = req.user._id;
    claim.hrRemarks = remarks;

    if (action === 'rejected') {
      claim.status = 'HR_REJECTED';
      claim.paymentStatus = 'REJECTED';
      claim.timeline.push({ action: 'HR_REJECTED', description: `HR rejected claim: ${remarks}`, user: req.user._id, timestamp: new Date() });
    } else if (action === 'returned') {
      claim.status = 'RETURNED';
      claim.timeline.push({ action: 'RETURNED', description: `Returned to employee for correction: ${remarks}`, user: req.user._id, timestamp: new Date() });
    } else {
      if (claim.fullPayment?.requested) {
        claim.fullPayment.status = 'APPROVED';
        claim.fullPayment.approvedAmount = round2(claim.grandRequested);
      }
      claim.status = 'ACCOUNTS_PENDING';
      claim.timeline.push({ action: 'ACCOUNTS_PENDING', description: 'HR approved. Forwarded to Accounts.', user: req.user._id, timestamp: new Date() });
    }
    claim.payableAmount = computePayable(claim);
    await claim.save();

    await access.audit({
      req,
      action: { approved: 'CLAIM_APPROVED', rejected: 'CLAIM_REJECTED', returned: 'CLAIM_RETURNED' }[action],
      claim,
      description: `HR ${action} claim ${claim.claimNumber}.`,
      before,
      after: access.snapshot(claim),
      metadata: { remarks, stage: 'HR' },
    });
    res.json({ success: true, data: claim });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * GET /api/expense/accounts/pending — Accounts & Admin queue
 */
exports.accountsPending = async (req, res) => {
  try {
    if (!isAccounts(req.user)) return fail(res, 403, 'Accounts or Admin role required.');
    const companyId = await resolveTenantCompanyId(req);
    const filter = { status: { $in: access.PAYABLE_STATUSES } };
    if (companyId && companyId !== 'ALL') filter.companyId = companyId;
    const claims = await ExpenseClaim.find(filter).populate(POPULATE_QUEUE).sort({ createdAt: -1 }).lean();
    res.json({ success: true, data: claims });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * POST /api/expense/claims/:id/payment (alias /disburse)
 * Accounts records disbursement.
 * User only needs to provide paymentDate (defaults to current date).
 * No other inputs required (paymentMethod, utr, remarks are optional/defaulted).
 */
exports.disburseClaim = async (req, res) => {
  try {
    if (!isAccounts(req.user)) return fail(res, 403, 'Accounts or Admin role required.');
    const claim = await loadClaim(req, res);
    if (!claim) return;
    if (claim.status === 'FULL_PAYMENT_PENDING') {
      if (claim.fullPayment?.requested) {
        claim.fullPayment.status = 'APPROVED';
        claim.fullPayment.approvedAmount = round2(claim.grandRequested);
        claim.payableAmount = computePayable(claim);
      }
    }
    if (claim.paymentStatus === 'DISBURSED' || claim.status === 'PAID') {
      return fail(res, 409, 'This claim has already been disbursed.');
    }
    if (claim.approvalStatus === 'REJECTED' || ['REJECTED', 'HR_REJECTED', 'ACCOUNTS_REJECTED', 'CANCELLED'].includes(claim.status)) {
      return fail(res, 400, 'Rejected claims cannot be disbursed.');
    }
    if (!access.claimPermissions(req, claim).canPay) return fail(res, 403, 'You cannot disburse a claim you are part of.');

    const body = req.body || {};
    let paymentDate = new Date();
    if (body.paymentDate) {
      const parsed = new Date(body.paymentDate);
      if (!isNaN(parsed.getTime())) paymentDate = parsed;
    }

    const paidAmount = Number(body.paidAmount) > 0
      ? Number(body.paidAmount)
      : (claim.payableAmount > 0 ? claim.payableAmount : (computePayable(claim) || claim.grandAllowed || claim.grandRequested || 0));
    const paymentMethod = String(body.paymentMethod || 'Bank Transfer').slice(0, 60);
    const reference = String(body.paymentReference || body.utr || '').trim().slice(0, 100);
    const remarks = String(body.paymentRemarks || body.remarks || 'Disbursed by Accounts').trim().slice(0, 500);
    const now = new Date();
    const before = access.snapshot(claim);
    const isFull = claim.fullPayment?.requested && claim.fullPayment.status === 'APPROVED';

    await access.audit({ req, action: 'PAYMENT_INITIATED', claim, description: `Disbursement of ${formatINR(paidAmount)} initiated for ${claim.claimNumber}.`, metadata: { paymentDate, paymentMethod, reference } });

    const updated = await ExpenseClaim.findOneAndUpdate(
      { _id: claim._id, paymentStatus: { $ne: 'DISBURSED' } },
      {
        $set: {
          status: 'PAID',
          approvalStatus: 'APPROVED',
          paymentStatus: 'DISBURSED',
          paidAmount,
          payableAmount: paidAmount,
          disbursedAt: paymentDate,
          disbursedBy: req.user._id,
          paymentMethod,
          utr: reference,
          accountsRemarks: remarks,
          lockedAt: now,
          disbursement: {
            amount: paidAmount,
            paymentDate,
            paymentMethod,
            paymentReference: reference,
            recordedBy: req.user._id,
            recordedByName: req.user.name || 'Accounts Admin',
            remarks,
          }
        },
        $push: {
          approvalHistory: { user: req.user._id, role: req.user.role, action: 'disbursed', timestamp: now, remarks: `Disbursed on ${paymentDate.toLocaleDateString('en-GB')}` },
          timeline: {
            action: 'DISBURSED',
            description: `${isFull ? 'Approved full payment' : 'Payment'} of ${formatINR(paidAmount)} recorded on ${paymentDate.toLocaleDateString('en-GB')}.`,
            user: req.user._id,
            timestamp: now,
          },
        },
      },
      { new: true }
    );
    if (!updated) return fail(res, 409, 'This claim was already processed or disbursed.');

    await access.audit({
      req,
      action: 'PAYMENT_COMPLETED',
      claim: updated,
      description: `Claim ${updated.claimNumber} DISBURSED: ${formatINR(paidAmount)}${isFull ? ' (approved full payment)' : ''}.`,
      before,
      after: access.snapshot(updated),
      metadata: { paidAmount, paymentDate, paymentMethod, remarks, fullPayment: !!isFull },
    });
    await access.audit({ req, action: 'CLAIM_LOCKED', claim: updated, description: `Claim ${updated.claimNumber} locked after payment.` });

    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * POST /api/expense/claims/batch-disburse
 * Accounts records disbursement for multiple claims simultaneously.
 * Only input: { claimIds: [...], paymentDate: 'YYYY-MM-DD' }
 */
exports.batchDisburseClaims = async (req, res) => {
  try {
    if (!isAccounts(req.user)) return fail(res, 403, 'Accounts or Admin role required.');
    const { claimIds, paymentDate: reqDate } = req.body || {};
    if (!Array.isArray(claimIds) || claimIds.length === 0) {
      return fail(res, 400, 'Please select at least one claim to disburse.');
    }

    let paymentDate = new Date();
    if (reqDate) {
      const parsed = new Date(reqDate);
      if (!isNaN(parsed.getTime())) paymentDate = parsed;
    }

    const companyId = await resolveTenantCompanyId(req);
    const validIds = claimIds.filter(id => mongoose.Types.ObjectId.isValid(id));
    if (validIds.length === 0) return fail(res, 400, 'No valid claim IDs provided.');

    const filter = {
      _id: { $in: validIds },
      paymentStatus: { $ne: 'DISBURSED' },
      status: { $nin: ['REJECTED', 'HR_REJECTED', 'ACCOUNTS_REJECTED', 'CANCELLED'] },
    };
    if (companyId && companyId !== 'ALL') filter.companyId = companyId;

    const claimsToDisburse = await ExpenseClaim.find(filter);
    if (claimsToDisburse.length === 0) {
      return fail(res, 404, 'No eligible claims found for disbursement.');
    }

    const updatedClaims = [];
    const now = new Date();

    for (const claim of claimsToDisburse) {
      const paidAmount = claim.payableAmount > 0
        ? claim.payableAmount
        : (computePayable(claim) || claim.grandAllowed || claim.grandRequested || 0);

      const before = access.snapshot(claim);

      claim.status = 'PAID';
      claim.approvalStatus = 'APPROVED';
      claim.paymentStatus = 'DISBURSED';
      claim.paidAmount = paidAmount;
      claim.payableAmount = paidAmount;
      claim.disbursedAt = paymentDate;
      claim.disbursedBy = req.user._id;
      claim.paymentMethod = 'Bank Transfer';
      claim.utr = '';
      claim.accountsRemarks = 'Batch disbursement';
      claim.lockedAt = now;
      claim.disbursement = {
        amount: paidAmount,
        paymentDate,
        paymentMethod: 'Bank Transfer',
        paymentReference: '',
        recordedBy: req.user._id,
        recordedByName: req.user.name || 'Accounts Admin',
        remarks: 'Batch disbursement',
      };

      claim.approvalHistory.push({
        user: req.user._id,
        role: req.user.role,
        action: 'disbursed',
        timestamp: now,
        remarks: `Batch disbursed on ${paymentDate.toLocaleDateString('en-GB')}`,
      });

      claim.timeline.push({
        action: 'DISBURSED',
        description: `Batch disbursement of ${formatINR(paidAmount)} recorded on ${paymentDate.toLocaleDateString('en-GB')}.`,
        user: req.user._id,
        timestamp: now,
      });

      await claim.save();

      await access.audit({
        req,
        action: 'PAYMENT_COMPLETED',
        claim,
        description: `Claim ${claim.claimNumber} batch disbursed: ${formatINR(paidAmount)}.`,
        before,
        after: access.snapshot(claim),
        metadata: { paidAmount, paymentDate, batch: true },
      });

      updatedClaims.push(claim);
    }

    res.json({
      success: true,
      message: `Successfully disbursed ${updatedClaims.length} claim(s).`,
      count: updatedClaims.length,
      data: updatedClaims,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * GET /api/expense/accounts/awaiting-disbursement
 * Dedicated queue of approved claims awaiting disbursement.
 */
exports.awaitingDisbursement = async (req, res) => {
  try {
    if (!isAccounts(req.user)) return fail(res, 403, 'Accounts or Admin role required.');
    const companyId = await resolveTenantCompanyId(req);
    const filter = {
      $or: [
        { paymentStatus: 'AWAITING_DISBURSEMENT' },
        {
          $and: [
            { status: { $in: ['ACCOUNTS_APPROVED', 'APPROVED'] } },
            { paymentStatus: { $ne: 'DISBURSED' } }
          ]
        }
      ]
    };
    if (companyId && companyId !== 'ALL') filter.companyId = companyId;
    const claims = await ExpenseClaim.find(filter)
      .populate(POPULATE_QUEUE)
      .sort({ createdAt: -1 })
      .lean();
    res.json({ success: true, data: claims });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * POST /api/expense/claims/:id/accounts-decision  { action: 'approved'|'rejected', remarks }
 * Approving sets approvalStatus = APPROVED and paymentStatus = AWAITING_DISBURSEMENT.
 * Does NOT disburse or mark PAID automatically!
 */
exports.accountsDecision = async (req, res) => {
  try {
    if (!isAccounts(req.user)) return fail(res, 403, 'Accounts or Admin role required.');
    const action = req.body.action === 'rejected' ? 'rejected' : 'approved';

    const claim = await loadClaim(req, res);
    if (!claim) return;
    if (claim.status === 'HR_PENDING') return fail(res, 409, 'Claim requires HR Admin verification and approval before Accounts review.');

    if (action === 'approved') {
      if (claim.paymentStatus === 'DISBURSED' || access.PAID_STATUSES.includes(claim.status)) {
        return fail(res, 409, 'This claim has already been disbursed.');
      }
      const remarks = String(req.body.remarks || '').trim().slice(0, 500);
      const before = access.snapshot(claim);

      claim.status = 'ACCOUNTS_APPROVED';
      claim.approvalStatus = 'APPROVED';
      claim.paymentStatus = 'AWAITING_DISBURSEMENT';
      claim.payableAmount = computePayable(claim) || claim.grandAllowed || claim.grandRequested || 0;
      claim.approvalHistory.push({
        user: req.user._id,
        role: req.user.role,
        action: 'approved',
        timestamp: new Date(),
        remarks: remarks || 'Approved by Accounts / Company Admin. Ready for disbursement.'
      });
      claim.timeline.push({
        action: 'ACCOUNTS_APPROVED',
        description: `Approved by Accounts / Admin. Awaiting disbursement of ${formatINR(claim.payableAmount)}.${remarks ? ` Note: ${remarks}` : ''}`,
        user: req.user._id,
        timestamp: new Date()
      });
      await claim.save();

      await access.audit({
        req,
        action: 'CLAIM_APPROVED',
        claim,
        description: `Claim ${claim.claimNumber} approved. Awaiting disbursement.`,
        before,
        after: access.snapshot(claim),
        metadata: { remarks, stage: 'ACCOUNTS' }
      });

      return res.json({ success: true, data: claim });
    }

    // action === 'rejected'
    if (!access.claimPermissions(req, claim).canReject) {
      return fail(res, access.isLocked(claim) ? 423 : 403, access.isLocked(claim) ? 'Paid claims are locked.' : 'You cannot reject this claim.');
    }
    const remarks = String(req.body.remarks || '').trim().slice(0, 500);
    if (!remarks) return fail(res, 422, 'Please enter the reason for rejecting the claim.');
    const before = access.snapshot(claim);

    claim.status = 'ACCOUNTS_REJECTED';
    claim.approvalStatus = 'REJECTED';
    claim.paymentStatus = 'NOT_APPLICABLE';
    claim.accountsRemarks = remarks;
    claim.approvalHistory.push({ user: req.user._id, role: req.user.role, action: 'rejected', timestamp: new Date(), remarks });
    claim.timeline.push({ action: 'ACCOUNTS_REJECTED', description: `Accounts / Admin rejected claim: ${remarks}`, user: req.user._id, timestamp: new Date() });
    await claim.save();

    await access.audit({
      req,
      action: 'CLAIM_REJECTED',
      claim,
      description: `Accounts / Admin rejected claim ${claim.claimNumber}: ${remarks}`,
      before,
      after: access.snapshot(claim),
      metadata: { remarks, stage: 'ACCOUNTS' },
    });
    res.json({ success: true, data: claim });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * GET /api/expense/audit?claimId=&action=&limit=
 * With claimId: anyone who can view the claim. Without: HR / Accounts / Admin only.
 */
exports.auditLogs = async (req, res) => {
  try {
    const filter = {};
    if (req.query.claimId) {
      if (!mongoose.Types.ObjectId.isValid(req.query.claimId)) return fail(res, 404, 'Claim not found');
      const claim = await ExpenseClaim.findById(req.query.claimId).select('companyId submittedBy status employeeClaims.employee.employeeId').lean();
      if (!claim || !access.canViewClaim(req, claim)) return fail(res, 404, 'Claim not found');
      filter.entityId = String(req.query.claimId);
    } else {
      if (!access.isStaff(req.user)) return fail(res, 403, 'HR, Accounts or Admin role required.');
      const companyId = await resolveTenantCompanyId(req);
      if (companyId && companyId !== 'ALL') filter.companyId = companyId;
    }
    if (req.query.action) filter.action = String(req.query.action).toUpperCase();
    const logs = await ExpenseAuditLog.find(filter)
      .sort({ createdAt: -1 })
      .limit(Math.min(1000, parseInt(req.query.limit, 10) || 200))
      .lean();
    res.json({ success: true, data: logs });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * GET /api/expense/dashboard-analytics?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 * Aggregates summary KPIs, Employee-wise breakdown, and Project-wise breakdown
 */
exports.getExpenseDashboardAnalytics = async (req, res) => {
  try {
    const userRole = String(req.user?.role || '').trim().toLowerCase().replace(/[-\s]/g, '_');
    const userRoleCode = String(req.user?.roleCode || '').trim().toUpperCase().replace(/[-\s]/g, '_');

    const isStoreAdmin = userRole === 'store_admin' || userRole === 'store' || userRoleCode === 'STORE_ADMIN' || userRoleCode === 'TCSTR1';
    if (isStoreAdmin) {
      return res.status(403).json({ success: false, message: 'Access denied: Expense Dashboard is blocked for Store Admin.' });
    }

    const isSuperAdmin = ['superadmin', 'super_admin', 'tcsa1'].includes(userRole) || userRoleCode === 'TCSA1' || req.user?.scope === 'GLOBAL';
    const isCompanyAdmin = ['company_admin', 'companyadmin', 'admin'].includes(userRole) || userRoleCode === 'TCCA1';
    const isHRAdmin = userRole === 'hr_admin' || userRoleCode === 'HR_ADMIN';
    const isAccountAdmin = ['account_admin', 'accounts_admin', 'accounts', 'finance'].includes(userRole) || ['ACCOUNT_ADMIN', 'ACCOUNTS_ADMIN', 'TCACC1', 'TCACC2'].includes(userRoleCode);

    if (!isSuperAdmin && !isCompanyAdmin && !isHRAdmin && !isAccountAdmin) {
      return res.status(403).json({ success: false, message: 'Access denied: Only Company Admin, HR Admin, and Accounts Admin can access Expense Dashboard.' });
    }

    const companyId = await resolveTenantCompanyId(req);
    const { startDate, endDate } = req.query;

    const andConditions = [];
    if (companyId && companyId !== 'ALL') andConditions.push({ companyId });

    // Exclude Draft claims entirely from the Dashboard (only show submitted, pending, paid, rejected)
    andConditions.push({ status: { $nin: ['DRAFT', 'draft', 'CREATED'] } });

    if (startDate || endDate) {
      const dateRange = {};
      if (startDate) {
        const [sY, sM, sD] = startDate.split('-').map(Number);
        const startIST = new Date(Date.UTC(sY, sM - 1, sD, 0, 0, 0, 0));
        startIST.setMinutes(startIST.getMinutes() - 330);
        dateRange.$gte = startIST;
      }
      if (endDate) {
        const [eY, eM, eD] = endDate.split('-').map(Number);
        const endIST = new Date(Date.UTC(eY, eM - 1, eD, 23, 59, 59, 999));
        endIST.setMinutes(endIST.getMinutes() - 330);
        dateRange.$lte = endIST;
      }

      andConditions.push({
        $or: [
          { claimDate: dateRange },
          { fromDate: dateRange },
          { toDate: dateRange },
          {
            $and: [
              { claimDate: { $exists: false } },
              { fromDate: { $exists: false } },
              { createdAt: dateRange }
            ]
          }
        ]
      });
    }

    const filter = andConditions.length > 0 ? { $and: andConditions } : {};

    const claims = await ExpenseClaim.find(filter)
      .populate('submittedBy', 'name employeeIdCode department designation')
      .populate('employeeClaims.employee.employeeId', 'name employeeIdCode department designation')
      .sort({ createdAt: -1 })
      .lean();

    // Summary KPI calculation
    let totalSubmittedAmount = 0;
    let totalSubmittedCount = 0;
    let waitingApprovalAmount = 0;
    let waitingApprovalCount = 0;
    let waitingDisbursementAmount = 0;
    let waitingDisbursementCount = 0;
    let rejectedAmount = 0;
    let rejectedCount = 0;
    let settledAmount = 0;
    let settledCount = 0;
    let totalExcessAmount = 0;

    const employeeMap = {};
    const projectMap = {};

    claims.forEach(claim => {
      const status = (claim.status || '').toUpperCase();
      const reqAmt = claim.grandRequested || 0;
      const allowedAmt = claim.grandAllowed || 0;
      const excessAmt = claim.grandExcess || Math.max(0, reqAmt - allowedAmt);
      const paidAmt = claim.paidAmount || (['SETTLED', 'PAID', 'DISBURSED'].includes(status) ? (allowedAmt || reqAmt) : 0);

      const isWaitingApproval = ['SUBMITTED', 'HR_PENDING', 'FULL_PAYMENT_PENDING'].includes(status);
      const isWaitingDisbursement = ['ACCOUNTS_PENDING', 'ACCOUNTS_APPROVED'].includes(status);
      const isRejected = ['REJECTED', 'HR_REJECTED', 'ACCOUNTS_REJECTED', 'CANCELLED'].includes(status);
      const isSettled = ['SETTLED', 'PAID', 'DISBURSED'].includes(status);

      const effectiveExcessAmt = isSettled ? Math.max(0, reqAmt - paidAmt) : excessAmt;

      totalSubmittedAmount += reqAmt;
      totalSubmittedCount += 1;
      totalExcessAmount += effectiveExcessAmt;

      if (isWaitingApproval) {
        waitingApprovalAmount += allowedAmt;
        waitingApprovalCount += 1;
      } else if (isWaitingDisbursement) {
        waitingDisbursementAmount += allowedAmt;
        waitingDisbursementCount += 1;
      } else if (isRejected) {
        rejectedAmount += allowedAmt;
        rejectedCount += 1;
      } else if (isSettled) {
        settledAmount += paidAmt;
        settledCount += 1;
      }

      // Grouping by Employee:
      // Lodging expenses are attributed 100% to the applying user (submitter).
      // Tagged co-occupants receive 0 for lodging and only their own separate non-lodging items.
      const submitterId = String(claim.submittedBy?._id || claim.submittedBy || 'unknown');
      const empClaimList = (claim.employeeClaims && claim.employeeClaims.length > 0)
        ? claim.employeeClaims
        : [{
            employee: {
              employeeId: claim.submittedBy?._id || claim.submittedBy,
              name: claim.submittedBy?.name || claim.submittedByName || 'Unknown Employee',
              employeeIdCode: claim.submittedBy?.employeeIdCode || '',
              department: claim.submittedBy?.department || '',
              designation: claim.submittedBy?.designation || ''
            },
            items: [],
            requestedTotal: reqAmt,
            allowedTotal: allowedAmt,
            excessTotal: effectiveExcessAmt,
            itemCount: 1
          }];

      empClaimList.forEach(ec => {
        const emp = ec.employee || {};
        const empUser = (emp.employeeId && typeof emp.employeeId === 'object') ? emp.employeeId : null;
        const empId = String(empUser?._id || emp.employeeId || claim.submittedBy?._id || claim.submittedBy || 'unknown');
        const empName = empUser?.name || emp.name || claim.submittedBy?.name || claim.submittedByName || 'Unknown Employee';
        const empCode = empUser?.employeeIdCode || emp.employeeIdCode || claim.submittedBy?.employeeIdCode || '';
        const empDept = empUser?.department || emp.department || claim.submittedBy?.department || '';
        const empDesig = empUser?.designation || emp.designation || claim.submittedBy?.designation || '';

        const isSubmitter = empId === submitterId;

        // Calculate this employee's own items
        let ecReq = 0;
        let ecAllowed = 0;
        let ecExcess = 0;

        if (Array.isArray(ec.items) && ec.items.length > 0) {
          ec.items.forEach(it => {
            const isLodging = String(it.expenseType || '').toUpperCase() === 'LODGING';
            if (isLodging) {
              // Lodging expense only counts for the applicant who paid for the room
              if (isSubmitter) {
                ecReq += Number(it.requestedAmount || it.amount || 0);
                ecAllowed += Number(it.allowedAmount || it.requestedAmount || 0);
                ecExcess += Number(it.excessAmount || 0);
              }
            } else {
              // Non-lodging types (Food, Conveyance, Travel, etc.) count separately for this employee
              ecReq += Number(it.requestedAmount || it.amount || 0);
              ecAllowed += Number(it.allowedAmount || it.requestedAmount || 0);
              ecExcess += Number(it.excessAmount || 0);
            }
          });
        } else if (isSubmitter) {
          // Submitter with no item-level breakdown (e.g. single summary claim)
          ecReq = ec.requestedTotal !== undefined && ec.requestedTotal > 0 ? ec.requestedTotal : reqAmt;
          ecAllowed = ec.allowedTotal !== undefined && ec.allowedTotal > 0 ? ec.allowedTotal : allowedAmt;
          ecExcess = ec.excessTotal !== undefined && ec.excessTotal >= 0 ? ec.excessTotal : effectiveExcessAmt;
        } else {
          // Tagged co-occupant with 0 items (tagged only in shared lodging): 0 expense values
          ecReq = 0;
          ecAllowed = 0;
          ecExcess = 0;
        }

        // Only register employee in employeeWise if they have personal claims or are the submitter
        if (ecReq > 0 || isSubmitter) {
          if (!employeeMap[empId]) {
            employeeMap[empId] = {
              id: empId,
              employeeName: empName,
              employeeCode: empCode,
              department: empDept,
              designation: empDesig,
              expensesSubmitted: 0,
              totalSubmitted: 0,
              advanceAmount: 0,
              waitingForApproval: 0,
              waitingForDisbursement: 0,
              rejected: 0,
              settled: 0,
              excessAmount: 0,
            };
          }

          const ecPaid = isSettled ? (claim.paidAmount ? (ecReq > 0 ? (ecAllowed / (allowedAmt || 1)) * claim.paidAmount : 0) : (ecAllowed || ecReq)) : 0;

          employeeMap[empId].expensesSubmitted += 1;
          employeeMap[empId].totalSubmitted += ecReq;
          employeeMap[empId].excessAmount += ecExcess;

          if (isWaitingApproval) {
            employeeMap[empId].waitingForApproval += ecAllowed;
          } else if (isWaitingDisbursement) {
            employeeMap[empId].waitingForDisbursement += ecAllowed;
          } else if (isRejected) {
            employeeMap[empId].rejected += ecAllowed;
          } else if (isSettled) {
            employeeMap[empId].settled += ecPaid;
          }
        }
      });

      // Grouping by Project / Trip Purpose
      const projectName = claim.trip?.purpose || claim.trip?.customerName || claim.claimType || 'General Expenses';
      if (!projectMap[projectName]) {
        projectMap[projectName] = {
          projectName,
          destination: claim.trip?.destination || '',
          expensesSubmitted: 0,
          totalSubmitted: 0,
          advanceAmount: 0,
          waitingForApproval: 0,
          waitingForDisbursement: 0,
          rejected: 0,
          settled: 0,
          excessAmount: 0,
        };
      }
      projectMap[projectName].expensesSubmitted += 1;
      projectMap[projectName].totalSubmitted += reqAmt;
      projectMap[projectName].excessAmount += effectiveExcessAmt;
      if (isWaitingApproval) {
        projectMap[projectName].waitingForApproval += allowedAmt;
      } else if (isWaitingDisbursement) {
        projectMap[projectName].waitingForDisbursement += allowedAmt;
      } else if (isRejected) {
        projectMap[projectName].rejected += allowedAmt;
      } else if (isSettled) {
        projectMap[projectName].settled += paidAmt;
      }
    });

    const employeeWise = Object.values(employeeMap).map(e => ({
      ...e,
      totalSubmitted: Math.round(e.totalSubmitted * 100) / 100,
      advanceAmount: Math.round(e.advanceAmount * 100) / 100,
      waitingForApproval: Math.round(e.waitingForApproval * 100) / 100,
      waitingForDisbursement: Math.round(e.waitingForDisbursement * 100) / 100,
      rejected: Math.round(e.rejected * 100) / 100,
      settled: Math.round(e.settled * 100) / 100,
      excessAmount: Math.round(e.excessAmount * 100) / 100,
    })).sort((a, b) => b.totalSubmitted - a.totalSubmitted);

    const projectWise = Object.values(projectMap).map(p => ({
      ...p,
      totalSubmitted: Math.round(p.totalSubmitted * 100) / 100,
      advanceAmount: Math.round(p.advanceAmount * 100) / 100,
      waitingForApproval: Math.round(p.waitingForApproval * 100) / 100,
      waitingForDisbursement: Math.round(p.waitingForDisbursement * 100) / 100,
      rejected: Math.round(p.rejected * 100) / 100,
      settled: Math.round(p.settled * 100) / 100,
    })).sort((a, b) => b.totalSubmitted - a.totalSubmitted);

    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const day = pad(now.getDate());
    const month = pad(now.getMonth() + 1);
    const year = now.getFullYear();
    let hours = now.getHours();
    const minutes = pad(now.getMinutes());
    const ampm = hours >= 12 ? 'pm' : 'am';
    hours = hours % 12 || 12;
    const generatedOn = `${day}/${month}/${year} ${pad(hours)}:${minutes} ${ampm}`;

    const pendingTotalAmount = waitingApprovalAmount + waitingDisbursementAmount;
    const pendingTotalCount = waitingApprovalCount + waitingDisbursementCount;

    res.json({
      success: true,
      data: {
        summary: {
          totalSubmitted: { amount: Math.round(totalSubmittedAmount * 100) / 100, count: totalSubmittedCount },
          waitingForApproval: { amount: Math.round(pendingTotalAmount * 100) / 100, count: pendingTotalCount },
          pending: { amount: Math.round(pendingTotalAmount * 100) / 100, count: pendingTotalCount },
          rejected: { amount: Math.round(rejectedAmount * 100) / 100, count: rejectedCount },
          settled: { amount: Math.round(settledAmount * 100) / 100, count: settledCount },
          excess: { amount: Math.round(totalExcessAmount * 100) / 100 }
        },
        employeeWise,
        projectWise,
        generatedOn,
        dateRange: {
          startDate: startDate || '',
          endDate: endDate || ''
        }
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function normalizeClaimForReport(c) {
  const rawStatus = String(c.status || '').toUpperCase();
  const rawPayment = String(c.paymentStatus || '').toUpperCase();
  const rawApproval = String(c.approvalStatus || '').toUpperCase();

  let approvalStatus = 'PENDING';
  if (rawApproval === 'APPROVED' || ['ACCOUNTS_APPROVED', 'APPROVED', 'PAID', 'DISBURSED', 'SETTLED'].includes(rawStatus)) {
    approvalStatus = 'APPROVED';
  } else if (rawApproval === 'REJECTED' || ['HR_REJECTED', 'ACCOUNTS_REJECTED', 'REJECTED', 'CANCELLED'].includes(rawStatus)) {
    approvalStatus = 'REJECTED';
  }

  let paymentStatus = 'NOT_APPLICABLE';
  if (rawPayment === 'DISBURSED' || rawPayment === 'PAID' || ['PAID', 'DISBURSED', 'SETTLED'].includes(rawStatus)) {
    paymentStatus = 'DISBURSED';
  } else if (approvalStatus === 'APPROVED') {
    paymentStatus = 'AWAITING_DISBURSEMENT';
  }

  const approvalBadge = approvalStatus === 'APPROVED' ? 'Approved' : (approvalStatus === 'REJECTED' ? 'Rejected' : 'Pending');
  const paymentBadge = paymentStatus === 'DISBURSED' ? 'Disbursed' : (paymentStatus === 'AWAITING_DISBURSEMENT' ? 'Awaiting Disbursement' : '—');

  const submitter = c.submittedBy || {};
  const firstEmp = c.employeeClaims?.[0]?.employee || {};
  const empName = submitter.name || c.submittedByName || firstEmp.name || 'Employee';
  const empCode = submitter.employeeIdCode || firstEmp.employeeIdCode || c.claimNumber || 'EXP';
  const department = submitter.department || firstEmp.department || 'General';
  const managerName = submitter.reportsTo?.name || (c.hrReviewedBy?.name) || 'Reporting Manager';

  const claimedAmt = c.grandRequested || 0;
  const allowedAmt = c.grandAllowed || claimedAmt;
  const payableAmt = c.payableAmount || allowedAmt;
  const disbursedAmt = paymentStatus === 'DISBURSED' ? (c.paidAmount || c.disbursement?.amount || payableAmt) : 0;

  const city = c.trip?.destination || 'N/A';
  const expenseType = c.claimType || 'EXPENSE';
  const expenseDate = c.claimDate || c.fromDate || c.createdAt;
  const submissionDate = c.submittedAt || c.createdAt;
  const disbursementDate = c.disbursedAt || c.disbursement?.paymentDate || null;

  return {
    ...c,
    approvalStatus,
    paymentStatus,
    approvalBadge,
    paymentBadge,
    employeeName: empName,
    employeeCode: empCode,
    department,
    managerName,
    claimedAmount: claimedAmt,
    allowedAmount: allowedAmt,
    payableAmount: payableAmt,
    disbursedAmount: disbursedAmt,
    city,
    expenseType,
    expenseDate,
    submissionDate,
    disbursementDate,
    paymentMethod: c.paymentMethod || c.disbursement?.paymentMethod || 'Bank Transfer',
    paymentReference: c.utr || c.disbursement?.paymentReference || '',
  };
}

/** Helper to build MongoDB filter from report queries */
async function buildReportQueryFilter(req) {
  const companyId = await resolveTenantCompanyId(req);
  const {
    employeeId,
    employee,
    city,
    expenseType,
    approvalStatus,
    paymentStatus,
    dateBasis = 'expense',
    fromDate,
    toDate,
    minAmount,
    maxAmount,
    search,
  } = req.query;

  const andConditions = [];
  if (companyId && companyId !== 'ALL') {
    const compOid = mongoose.Types.ObjectId.isValid(companyId)
      ? new mongoose.Types.ObjectId(companyId)
      : null;
    andConditions.push({
      $or: compOid
        ? [{ companyId: compOid }, { companyId: String(companyId) }]
        : [{ companyId: String(companyId) }]
    });
  }

  // Exclude draft claims from reports
  andConditions.push({ status: { $nin: ['DRAFT', 'draft', 'CREATED'] } });

  // 1. Employee filter
  if (employeeId && mongoose.Types.ObjectId.isValid(employeeId)) {
    const empOid = new mongoose.Types.ObjectId(employeeId);
    andConditions.push({
      $or: [
        { submittedBy: empOid },
        { submittedBy: String(employeeId) },
        { 'employeeClaims.employee.employeeId': empOid },
        { 'employeeClaims.employee.employeeId': String(employeeId) }
      ]
    });
  } else if ((employeeId && employeeId !== 'ALL') || (employee && employee.trim() && employee.toUpperCase() !== 'ALL')) {
    const term = (employee || employeeId).trim();
    const empRx = new RegExp(escapeRegex(term), 'i');
    andConditions.push({
      $or: [
        { submittedByName: empRx },
        { 'submittedBy.name': empRx },
        { 'employeeClaims.employee.name': empRx }
      ]
    });
  }

  // 2. City / Destination filter
  if (city && city.trim() && city.toUpperCase() !== 'ALL') {
    const cityRegex = new RegExp(escapeRegex(city.trim()), 'i');
    andConditions.push({ 'trip.destination': cityRegex });
  }

  // 3. Expense Type filter
  if (expenseType && expenseType.trim() && expenseType.toUpperCase() !== 'ALL') {
    const typeStr = expenseType.trim().toUpperCase();
    andConditions.push({
      $or: [
        { claimType: typeStr },
        { 'employeeClaims.items.expenseType': typeStr }
      ]
    });
  }

  // 4. Approval Status filter
  if (approvalStatus && approvalStatus.trim() && approvalStatus.toUpperCase() !== 'ALL') {
    const appStat = approvalStatus.trim().toUpperCase();
    if (appStat === 'PENDING') {
      andConditions.push({
        $or: [
          { approvalStatus: 'PENDING' },
          { status: { $in: ['SUBMITTED', 'HR_PENDING', 'FULL_PAYMENT_PENDING', 'ACCOUNTS_PENDING'] } }
        ]
      });
    } else if (appStat === 'APPROVED') {
      andConditions.push({
        $or: [
          { approvalStatus: 'APPROVED' },
          { status: { $in: ['ACCOUNTS_APPROVED', 'APPROVED', 'PAID', 'DISBURSED', 'SETTLED'] } }
        ]
      });
    } else if (appStat === 'REJECTED') {
      andConditions.push({
        $or: [
          { approvalStatus: 'REJECTED' },
          { status: { $in: ['HR_REJECTED', 'ACCOUNTS_REJECTED', 'REJECTED', 'CANCELLED'] } }
        ]
      });
    }
  }

  // 5. Payment Status filter
  if (paymentStatus && paymentStatus.trim() && paymentStatus.toUpperCase() !== 'ALL') {
    const payStat = paymentStatus.trim().toUpperCase();
    if (payStat === 'AWAITING_DISBURSEMENT') {
      andConditions.push({
        $and: [
          {
            $or: [
              { approvalStatus: 'APPROVED' },
              { status: { $in: ['ACCOUNTS_APPROVED', 'APPROVED'] } }
            ]
          },
          {
            $or: [
              { paymentStatus: 'AWAITING_DISBURSEMENT' },
              { paymentStatus: { $nin: ['DISBURSED', 'PAID'] } }
            ]
          },
          { status: { $nin: ['PAID', 'DISBURSED', 'SETTLED', 'HR_REJECTED', 'ACCOUNTS_REJECTED', 'REJECTED', 'CANCELLED'] } }
        ]
      });
    } else if (payStat === 'DISBURSED') {
      andConditions.push({
        $or: [
          { paymentStatus: 'DISBURSED' },
          { paymentStatus: 'PAID' },
          { status: { $in: ['PAID', 'DISBURSED', 'SETTLED'] } }
        ]
      });
    } else if (payStat === 'NOT_APPLICABLE') {
      andConditions.push({
        $or: [
          { paymentStatus: 'NOT_APPLICABLE' },
          { status: { $in: ['HR_REJECTED', 'ACCOUNTS_REJECTED', 'REJECTED', 'CANCELLED', 'SUBMITTED', 'HR_PENDING', 'ACCOUNTS_PENDING'] } }
        ]
      });
    }
  }

  // 6. Date Basis Range filter (from/to)
  if (fromDate || toDate) {
    const dateRange = {};
    if (fromDate) {
      const [fY, fM, fD] = fromDate.split('-').map(Number);
      const startIST = new Date(Date.UTC(fY, fM - 1, fD, 0, 0, 0, 0));
      startIST.setMinutes(startIST.getMinutes() - 330);
      dateRange.$gte = startIST;
    }
    if (toDate) {
      const [tY, tM, tD] = toDate.split('-').map(Number);
      const endIST = new Date(Date.UTC(tY, tM - 1, tD, 23, 59, 59, 999));
      endIST.setMinutes(endIST.getMinutes() - 330);
      dateRange.$lte = endIST;
    }

    if (dateBasis === 'disbursement') {
      andConditions.push({
        $or: [
          { disbursedAt: dateRange },
          { 'disbursement.paymentDate': dateRange }
        ]
      });
    } else {
      // 'expense' (default): filter strictly on expense dates
      andConditions.push({
        $or: [
          { claimDate: dateRange },
          { fromDate: dateRange },
          { toDate: dateRange },
          {
            $and: [
              { claimDate: { $exists: false } },
              { fromDate: { $exists: false } },
              { createdAt: dateRange }
            ]
          }
        ]
      });
    }
  }

  // 7. Amount Range (min / max)
  if (minAmount !== undefined && minAmount !== '' && !isNaN(Number(minAmount))) {
    andConditions.push({ grandRequested: { $gte: Number(minAmount) } });
  }
  if (maxAmount !== undefined && maxAmount !== '' && !isNaN(Number(maxAmount))) {
    andConditions.push({ grandRequested: { $lte: Number(maxAmount) } });
  }

  // 8. Keyword Search
  if (search && search.trim()) {
    const rx = new RegExp(escapeRegex(search.trim()), 'i');
    andConditions.push({
      $or: [
        { claimNumber: rx },
        { submittedByName: rx },
        { 'submittedBy.name': rx },
        { 'employeeClaims.employee.name': rx },
        { 'employeeClaims.employee.employeeIdCode': rx },
        { 'trip.destination': rx },
        { 'trip.purpose': rx },
        { 'trip.customerName': rx },
      ]
    });
  }

  return andConditions.length > 0 ? { $and: andConditions } : {};
}

/**
 * GET /api/expense/reports
 * Complete claims report with advanced multi-filtering and pagination.
 */
exports.getExpenseReports = async (req, res) => {
  try {
    const filter = await buildReportQueryFilter(req);
    const {
      page: reqPage = 1,
      limit: reqLimit = 20,
      sortField = 'submittedAt',
      sortDirection = 'desc',
    } = req.query;

    const page = Math.max(1, parseInt(reqPage, 10) || 1);
    const limit = Math.min(500, Math.max(1, parseInt(reqLimit, 10) || 20));

    let sortObj = { createdAt: -1 };
    if (sortField === 'submittedAt') sortObj = { submittedAt: sortDirection === 'asc' ? 1 : -1, createdAt: sortDirection === 'asc' ? 1 : -1 };
    else if (sortField === 'claimedAmount' || sortField === 'grandRequested') sortObj = { grandRequested: sortDirection === 'asc' ? 1 : -1 };
    else if (sortField === 'approvedAmount' || sortField === 'grandAllowed') sortObj = { grandAllowed: sortDirection === 'asc' ? 1 : -1 };
    else if (sortField === 'disbursedAt') sortObj = { disbursedAt: sortDirection === 'asc' ? 1 : -1 };
    else if (sortField === 'claimNumber') sortObj = { claimNumber: sortDirection === 'asc' ? 1 : -1 };

    const [claims, total] = await Promise.all([
      ExpenseClaim.find(filter)
        .populate('submittedBy', 'name employeeIdCode department designation reportsTo')
        .populate('employeeClaims.employee.employeeId', 'name employeeIdCode department designation reportsTo')
        .populate('disbursedBy', 'name employeeIdCode')
        .populate('hrReviewedBy', 'name employeeIdCode')
        .populate('companyId', 'name code')
        .sort(sortObj)
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      ExpenseClaim.countDocuments(filter),
    ]);

    const normalizedClaims = claims.map(c => normalizeClaimForReport(c));

    // Summary calculation for the active filter set
    const aggregateTotals = await ExpenseClaim.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          totalClaims: { $sum: 1 },
          totalRequestedAmount: { $sum: { $ifNull: ['$grandRequested', 0] } },
          totalApprovedAmount: { $sum: { $ifNull: ['$grandAllowed', 0] } },
          totalDisbursedAmount: {
            $sum: {
              $cond: [
                {
                  $or: [
                    { $eq: ['$paymentStatus', 'DISBURSED'] },
                    { $eq: ['$paymentStatus', 'PAID'] },
                    { $in: ['$status', ['PAID', 'DISBURSED', 'SETTLED']] }
                  ]
                },
                { $ifNull: ['$paidAmount', { $ifNull: ['$payableAmount', '$grandAllowed'] }] },
                0
              ]
            }
          },
          pendingCount: {
            $sum: {
              $cond: [
                {
                  $or: [
                    { $eq: ['$approvalStatus', 'PENDING'] },
                    { $in: ['$status', ['SUBMITTED', 'HR_PENDING', 'FULL_PAYMENT_PENDING', 'ACCOUNTS_PENDING']] }
                  ]
                },
                1,
                0
              ]
            }
          },
          awaitingCount: {
            $sum: {
              $cond: [
                {
                  $or: [
                    { $eq: ['$paymentStatus', 'AWAITING_DISBURSEMENT'] },
                    {
                      $and: [
                        { $in: ['$status', ['ACCOUNTS_APPROVED', 'APPROVED']] },
                        { $not: [{ $in: ['$paymentStatus', ['DISBURSED', 'PAID']] }] }
                      ]
                    }
                  ]
                },
                1,
                0
              ]
            }
          },
          disbursedCount: {
            $sum: {
              $cond: [
                {
                  $or: [
                    { $eq: ['$paymentStatus', 'DISBURSED'] },
                    { $eq: ['$paymentStatus', 'PAID'] },
                    { $in: ['$status', ['PAID', 'DISBURSED', 'SETTLED']] }
                  ]
                },
                1,
                0
              ]
            }
          },
          rejectedCount: {
            $sum: {
              $cond: [
                {
                  $or: [
                    { $eq: ['$approvalStatus', 'REJECTED'] },
                    { $in: ['$status', ['HR_REJECTED', 'ACCOUNTS_REJECTED', 'REJECTED', 'CANCELLED']] }
                  ]
                },
                1,
                0
              ]
            }
          }
        }
      }
    ]);

    const summaryData = aggregateTotals[0] || {
      totalClaims: 0,
      totalRequestedAmount: 0,
      totalApprovedAmount: 0,
      totalDisbursedAmount: 0,
      pendingCount: 0,
      awaitingCount: 0,
      disbursedCount: 0,
      rejectedCount: 0,
    };

    res.json({
      success: true,
      data: normalizedClaims,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
      summary: {
        totalClaims: summaryData.totalClaims,
        totalRequestedAmount: Math.round(summaryData.totalRequestedAmount * 100) / 100,
        totalApprovedAmount: Math.round(summaryData.totalApprovedAmount * 100) / 100,
        totalDisbursedAmount: Math.round(summaryData.totalDisbursedAmount * 100) / 100,
        pendingCount: summaryData.pendingCount,
        awaitingCount: summaryData.awaitingCount,
        disbursedCount: summaryData.disbursedCount,
        rejectedCount: summaryData.rejectedCount,
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * GET /api/expense/reports/summary
 * Summary counts & amounts for cards.
 */
exports.getExpenseReportsSummary = async (req, res) => {
  try {
    // Summary cards reflect the overall breakdown across statuses for the selected filters (dates, employee, city, expense type, search)
    const queryClone = { ...req.query };
    delete queryClone.approvalStatus;
    delete queryClone.paymentStatus;
    const filter = await buildReportQueryFilter({ ...req, query: queryClone });
    const aggregateTotals = await ExpenseClaim.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          totalClaims: { $sum: 1 },
          totalRequestedAmount: { $sum: { $ifNull: ['$grandRequested', 0] } },
          totalApprovedAmount: { $sum: { $ifNull: ['$grandAllowed', 0] } },
          totalDisbursedAmount: {
            $sum: {
              $cond: [
                {
                  $or: [
                    { $eq: ['$paymentStatus', 'DISBURSED'] },
                    { $eq: ['$paymentStatus', 'PAID'] },
                    { $in: ['$status', ['PAID', 'DISBURSED', 'SETTLED']] }
                  ]
                },
                { $ifNull: ['$paidAmount', { $ifNull: ['$payableAmount', '$grandAllowed'] }] },
                0
              ]
            }
          },
          pendingAmount: {
            $sum: {
              $cond: [
                {
                  $or: [
                    { $eq: ['$approvalStatus', 'PENDING'] },
                    { $in: ['$status', ['SUBMITTED', 'HR_PENDING', 'FULL_PAYMENT_PENDING', 'ACCOUNTS_PENDING']] }
                  ]
                },
                { $ifNull: ['$grandAllowed', { $ifNull: ['$grandRequested', 0] }] },
                0
              ]
            }
          },
          awaitingAmount: {
            $sum: {
              $cond: [
                {
                  $or: [
                    { $eq: ['$paymentStatus', 'AWAITING_DISBURSEMENT'] },
                    {
                      $and: [
                        { $in: ['$status', ['ACCOUNTS_APPROVED', 'APPROVED']] },
                        { $not: [{ $in: ['$paymentStatus', ['DISBURSED', 'PAID']] }] }
                      ]
                    }
                  ]
                },
                { $ifNull: ['$payableAmount', { $ifNull: ['$grandAllowed', 0] }] },
                0
              ]
            }
          },
          rejectedAmount: {
            $sum: {
              $cond: [
                {
                  $or: [
                    { $eq: ['$approvalStatus', 'REJECTED'] },
                    { $in: ['$status', ['HR_REJECTED', 'ACCOUNTS_REJECTED', 'REJECTED', 'CANCELLED']] }
                  ]
                },
                { $ifNull: ['$grandRequested', 0] },
                0
              ]
            }
          },
          pendingCount: {
            $sum: {
              $cond: [
                {
                  $or: [
                    { $eq: ['$approvalStatus', 'PENDING'] },
                    { $in: ['$status', ['SUBMITTED', 'HR_PENDING', 'FULL_PAYMENT_PENDING', 'ACCOUNTS_PENDING']] }
                  ]
                },
                1,
                0
              ]
            }
          },
          awaitingCount: {
            $sum: {
              $cond: [
                {
                  $or: [
                    { $eq: ['$paymentStatus', 'AWAITING_DISBURSEMENT'] },
                    {
                      $and: [
                        { $in: ['$status', ['ACCOUNTS_APPROVED', 'APPROVED']] },
                        { $not: [{ $in: ['$paymentStatus', ['DISBURSED', 'PAID']] }] }
                      ]
                    }
                  ]
                },
                1,
                0
              ]
            }
          },
          disbursedCount: {
            $sum: {
              $cond: [
                {
                  $or: [
                    { $eq: ['$paymentStatus', 'DISBURSED'] },
                    { $eq: ['$paymentStatus', 'PAID'] },
                    { $in: ['$status', ['PAID', 'DISBURSED', 'SETTLED']] }
                  ]
                },
                1,
                0
              ]
            }
          },
          rejectedCount: {
            $sum: {
              $cond: [
                {
                  $or: [
                    { $eq: ['$approvalStatus', 'REJECTED'] },
                    { $in: ['$status', ['HR_REJECTED', 'ACCOUNTS_REJECTED', 'REJECTED', 'CANCELLED']] }
                  ]
                },
                1,
                0
              ]
            }
          }
        }
      }
    ]);

    const s = aggregateTotals[0] || {};
    res.json({
      success: true,
      data: {
        total: { count: s.totalClaims || 0, amount: Math.round((s.totalRequestedAmount || 0) * 100) / 100 },
        pendingApproval: { count: s.pendingCount || 0, amount: Math.round((s.pendingAmount || 0) * 100) / 100 },
        awaitingDisbursement: { count: s.awaitingCount || 0, amount: Math.round((s.awaitingAmount || 0) * 100) / 100 },
        disbursed: { count: s.disbursedCount || 0, amount: Math.round((s.totalDisbursedAmount || 0) * 100) / 100 },
        rejected: { count: s.rejectedCount || 0, amount: Math.round((s.rejectedAmount || 0) * 100) / 100 },
        totalApprovedAmount: Math.round((s.totalApprovedAmount || 0) * 100) / 100,
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * GET /api/expense/reports/export
 * Exports matching claims to CSV using active query filters.
 */
exports.exportExpenseReportsCSV = async (req, res) => {
  try {
    const filter = await buildReportQueryFilter(req);
    const claims = await ExpenseClaim.find(filter)
      .populate('submittedBy', 'name employeeIdCode department designation reportsTo')
      .populate('employeeClaims.employee.employeeId', 'name employeeIdCode department designation reportsTo')
      .populate('disbursedBy', 'name employeeIdCode')
      .populate('hrReviewedBy', 'name employeeIdCode')
      .sort({ createdAt: -1 })
      .limit(5000)
      .lean();

    const normalized = claims.map(c => normalizeClaimForReport(c));

    const headers = [
      'Claim ID',
      'Employee ID',
      'Employee Name',
      'Department',
      'Manager / Approver',
      'Expense Type',
      'City / Location',
      'Expense Date',
      'Submission Date',
      'Claimed Amount (Rs)',
      'Approved Amount (Rs)',
      'Approval Status',
      'Payment Status',
      'Disbursed Amount (Rs)',
      'Payment Date',
      'Payment Method',
      'Payment Reference / UTR',
      'Rejection / Remarks',
    ];

    const formatDateVal = (d) => {
      if (!d) return '';
      try {
        const date = new Date(d);
        return isNaN(date.getTime()) ? String(d) : date.toLocaleDateString('en-GB');
      } catch (_) {
        return '';
      }
    };

    const rows = normalized.map(c => [
      `"${(c.claimNumber || '').replace(/"/g, '""')}"`,
      `"${(c.employeeCode || '').replace(/"/g, '""')}"`,
      `"${(c.employeeName || '').replace(/"/g, '""')}"`,
      `"${(c.department || '').replace(/"/g, '""')}"`,
      `"${(c.managerName || '').replace(/"/g, '""')}"`,
      `"${(c.expenseType || '').replace(/"/g, '""')}"`,
      `"${(c.city || '').replace(/"/g, '""')}"`,
      formatDateVal(c.expenseDate),
      formatDateVal(c.submissionDate),
      c.claimedAmount || 0,
      c.allowedAmount || 0,
      `"${c.approvalBadge}"`,
      `"${c.paymentBadge}"`,
      c.disbursedAmount || 0,
      formatDateVal(c.disbursementDate),
      `"${(c.paymentMethod || '').replace(/"/g, '""')}"`,
      `"${(c.paymentReference || '').replace(/"/g, '""')}"`,
      `"${(c.accountsRemarks || c.hrRemarks || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(e => e.join(','))].join('\r\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=Expense_Claims_Report_${new Date().toISOString().slice(0, 10)}.csv`);
    return res.status(200).send(csvContent);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

