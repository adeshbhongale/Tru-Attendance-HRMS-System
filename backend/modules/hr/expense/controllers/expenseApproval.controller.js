const mongoose = require('mongoose');
const ExpenseClaim = require('../models/ExpenseClaim');
const access = require('../services/expenseAccess');
const approvers = require('../services/approverService');
const { computePayable, formatINR } = require('../services/claimRules');
const { round2 } = require('../services/calculationEngine');

/**
 * In-app approval stage (mobile "Other Approvals"):
 * APPROVAL_PENDING --approve--> SUBMITTED (Accounts Pending)
 * APPROVAL_PENDING --reject---> REJECTED
 * Only the approver the employee selected on the claim can see / decide it.
 */

const fail = (res, status, message) => res.status(status).json({ success: false, message });
const str = (v, max) => String(v === undefined || v === null ? '' : v).trim().slice(0, max);
const KINDS = ['FULL_PAYMENT', 'OTHER_EXPENSE'];

const POPULATE = [
  { path: 'submittedBy', select: 'name employeeIdCode department designation' },
  { path: 'employeeClaims.employee.employeeId', select: 'name employeeIdCode department designation' },
  { path: 'managerApproval.approver', select: 'name employeeIdCode department designation role roleCode' },
];

const withPermissions = (req, claim) => {
  const c = claim.toObject ? claim.toObject() : claim;
  return { ...c, permissions: access.claimPermissions(req, c) };
};

/** GET /api/expense/approvers?kind=FULL_PAYMENT|OTHER_EXPENSE&search= — picker for the claim form. */
exports.listApprovers = async (req, res) => {
  try {
    const kind = String(req.query.kind || '').toUpperCase();
    if (!KINDS.includes(kind)) return fail(res, 422, 'kind must be FULL_PAYMENT or OTHER_EXPENSE.');
    const companyId = access.resolveCompanyId(req);
    const data = await approvers.listApprovers({ companyId, kind, excludeIds: [req.user._id], search: str(req.query.search, 100) });
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/** GET /api/expense/approvals?status=PENDING|DECIDED — claims assigned to me for approval. */
exports.myApprovals = async (req, res) => {
  try {
    const uid = req.user._id;
    const companyId = access.resolveCompanyId(req);

    // Apply MobileAppConfig screen rules (like leaves approval)
    const isGlobalOrCompanyAdmin = access.isSuperAdmin(req.user) || access.isCompanyAdmin(req.user);
    if (!isGlobalOrCompanyAdmin && companyId) {
      try {
        const MobileAppConfig = require('../../../../models/MobileAppConfig');
        const Level = require('../../../../models/Level');
        const { getEffectiveLevelNumber, getEffectiveCategory } = require('../../../../middleware/rbac');

        const config = await MobileAppConfig.findOne({ companyId });
        if (config && config.screenRules) {
          const rule = config.screenRules.find((r) => r.screenKey === 'otherApprovals');
          if (rule) {
            if (!rule.enabled) {
              return res.json({ success: true, data: [], pendingCount: 0, isApprover: false, isAccessBlocked: true });
            }

            // Department restriction
            if (rule.departments && rule.departments.length > 0) {
              const uDept = (req.user.department || '').trim();
              if (!uDept || !rule.departments.includes(uDept)) {
                return res.json({ success: true, data: [], pendingCount: 0, isApprover: false, isAccessBlocked: true });
              }
            }

            // Level resolution
            let userLevel = null;
            if (req.user.levelRef) {
              userLevel = typeof req.user.levelRef === 'object' && req.user.levelRef.levelNumber !== undefined
                ? req.user.levelRef
                : await Level.findById(req.user.levelRef._id || req.user.levelRef);
            }
            let userLevelNumber = null;
            if (userLevel?.levelNumber != null) {
              userLevelNumber = Number(userLevel.levelNumber);
            } else if (req.user.roleLevel != null && req.user.roleLevel >= 1) {
              userLevelNumber = Number(req.user.roleLevel);
            } else {
              const lvl = getEffectiveLevelNumber(req.user);
              if (lvl && lvl !== 99) userLevelNumber = Number(lvl);
            }

            // Blocked levels check
            if (rule.blockedLevels && rule.blockedLevels.length > 0 && userLevelNumber != null) {
              if (rule.blockedLevels.map(Number).includes(userLevelNumber)) {
                return res.json({ success: true, data: [], pendingCount: 0, isApprover: false, isAccessBlocked: true });
              }
            }

            // Blocked categories check
            const userCat = userLevel?.category || getEffectiveCategory(req.user) || req.user.effectiveCategory;
            if (rule.blockedCategories && rule.blockedCategories.length > 0 && userCat) {
              if (rule.blockedCategories.map((c) => String(c).toUpperCase()).includes(String(userCat).toUpperCase())) {
                return res.json({ success: true, data: [], pendingCount: 0, isApprover: false, isAccessBlocked: true });
              }
            }

            // Blocked specific employees check
            if (rule.blockedEmployees && rule.blockedEmployees.length > 0) {
              const empIds = rule.blockedEmployees.map((id) => (id._id || id.id || id).toString());
              if (empIds.includes(req.user._id.toString())) {
                return res.json({ success: true, data: [], pendingCount: 0, isApprover: false, isAccessBlocked: true });
              }
            }
          }
        }
      } catch (confErr) {
        console.warn('[myApprovals] MobileAppConfig check error:', confErr.message);
      }
    }

    const base = { 'managerApproval.approver': uid };
    if (companyId) base.companyId = companyId;
    const decided = String(req.query.status || 'PENDING').toUpperCase() === 'DECIDED';
    const filter = decided
      ? { ...base, 'managerApproval.status': { $in: ['APPROVED', 'REJECTED'] } }
      : { ...base, status: 'APPROVAL_PENDING' };

    const [claims, pendingCount, isApprover] = await Promise.all([
      ExpenseClaim.find(filter)
        .populate(POPULATE)
        .sort(decided ? { 'managerApproval.decidedAt': -1 } : { submittedAt: 1, createdAt: 1 })
        .limit(decided ? 100 : 500)
        .lean(),
      ExpenseClaim.countDocuments({ ...base, status: 'APPROVAL_PENDING' }),
      approvers.isPotentialApprover(req.user, companyId),
    ]);
    res.json({ success: true, data: claims.map((c) => withPermissions(req, c)), pendingCount, isApprover: isApprover || pendingCount > 0 });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

async function loadForDecision(req, res) {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) { fail(res, 404, 'Claim not found'); return null; }
  const claim = await ExpenseClaim.findById(req.params.id);
  if (!claim || !access.canViewClaim(req, claim)) { fail(res, 404, 'Claim not found'); return null; }
  const perms = access.claimPermissions(req, claim);
  if (!perms.canApprove) {
    if (!access.isAssignedApprover(claim, access.userId(req)) && !access.isCompanyAdmin(req.user)) fail(res, 403, 'Only the approver selected on this claim can decide it.');
    else if (!perms.awaitingApproval) fail(res, 409, 'This claim is no longer waiting for approval.');
    else fail(res, 403, 'You cannot approve a claim you are part of.');
    return null;
  }
  return claim;
}

const kindLabel = (ma) => (ma?.kind === 'FULL_PAYMENT' ? 'Full payment' : 'Other expense');

/** POST /api/expense/claims/:id/approve — Body: { remarks? } */
exports.approveClaim = async (req, res) => {
  try {
    const claim = await loadForDecision(req, res);
    if (!claim) return;
    const remarks = str(req.body?.remarks || req.body?.adminNote || req.body?.reason, 500);
    const now = new Date();
    const name = req.user.name || '';
    const before = access.snapshot(claim);
    const isFull = !!claim.fullPayment?.requested;

    const set = {
      status: 'SUBMITTED',
      paymentStatus: 'PENDING',
      'managerApproval.status': 'APPROVED',
      'managerApproval.decidedAt': now,
      'managerApproval.remarks': remarks,
    };
    if (isFull) {
      const approvedAmount = round2(claim.grandRequested || 0);
      Object.assign(set, {
        'fullPayment.status': 'APPROVED',
        'fullPayment.approvedAmount': approvedAmount,
        'fullPayment.decidedBy': req.user._id,
        'fullPayment.decidedByName': name,
        'fullPayment.decidedAt': now,
        'fullPayment.decisionRemarks': remarks,
        payableAmount: computePayable({ ...claim.toObject(), fullPayment: { requested: true, status: 'APPROVED', approvedAmount } }),
      });
    }

    // Atomic: the assigned approver OR company/super admin, only while still awaiting approval.
    const query = { _id: claim._id, status: 'APPROVAL_PENDING' };
    if (!access.isCompanyAdmin(req.user)) {
      query['managerApproval.approver'] = req.user._id;
    }
    const updated = await ExpenseClaim.findOneAndUpdate(
      query,
      {
        $set: set,
        $push: {
          approvalHistory: { user: req.user._id, role: req.user.role, action: 'approved', timestamp: now, remarks },
          timeline: {
            action: 'APPROVED',
            description: `${kindLabel(claim.managerApproval)} approved by ${name || 'approver'}${remarks ? `: ${remarks}` : ''}. Sent to Accounts${isFull ? ` (payable ${formatINR(claim.grandRequested)})` : ''}.`,
            user: req.user._id,
            timestamp: now,
          },
        },
      },
      { new: true }
    );
    if (!updated) return fail(res, 409, 'This claim was already processed.');

    await access.audit({
      req,
      action: isFull ? 'FULL_PAYMENT_APPROVED' : 'OTHER_EXPENSE_APPROVED',
      claim: updated,
      description: `${kindLabel(updated.managerApproval)} approved on ${updated.claimNumber} by ${name}.`,
      before,
      after: access.snapshot(updated),
      metadata: { remarks },
    });
    res.json({ success: true, data: withPermissions(req, updated) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/** POST /api/expense/claims/:id/approval-reject — Body: { reason } */
exports.rejectApproval = async (req, res) => {
  try {
    const claim = await loadForDecision(req, res);
    if (!claim) return;
    const rawReason = str(
      req.body?.reason ||
      req.body?.rejectionReason ||
      req.body?.remarks ||
      req.body?.adminNote ||
      req.body?.note ||
      (typeof req.body === 'string' ? req.body : '') ||
      '',
      500
    );
    const reason = rawReason.length >= 3
      ? rawReason
      : (rawReason ? `${rawReason} - Rejected by Approver` : 'Rejected by Approver');
    const now = new Date();
    const name = req.user.name || '';
    const before = access.snapshot(claim);

    const set = {
      status: 'REJECTED',
      paymentStatus: 'REJECTED',
      accountsRemarks: reason,
      rejection: { reason, rejectedAt: now, rejectedBy: req.user._id, rejectedByName: name },
      'managerApproval.status': 'REJECTED',
      'managerApproval.decidedAt': now,
      'managerApproval.remarks': reason,
    };
    if (claim.fullPayment?.requested) {
      Object.assign(set, {
        'fullPayment.status': 'REJECTED',
        'fullPayment.decidedBy': req.user._id,
        'fullPayment.decidedByName': name,
        'fullPayment.decidedAt': now,
        'fullPayment.decisionRemarks': reason,
      });
    }

    const query = { _id: claim._id, status: 'APPROVAL_PENDING' };
    if (!access.isCompanyAdmin(req.user)) {
      query['managerApproval.approver'] = req.user._id;
    }
    const updated = await ExpenseClaim.findOneAndUpdate(
      query,
      {
        $set: set,
        $push: {
          approvalHistory: { user: req.user._id, role: req.user.role, action: 'rejected', timestamp: now, remarks: reason },
          timeline: { action: 'REJECTED', description: `${kindLabel(claim.managerApproval)} rejected by ${name || 'approver'}: ${reason}`, user: req.user._id, timestamp: now },
        },
      },
      { new: true }
    );
    if (!updated) return fail(res, 409, 'This claim was already processed.');

    await access.audit({
      req,
      action: 'APPROVAL_REJECTED',
      claim: updated,
      description: `${kindLabel(updated.managerApproval)} rejected on ${updated.claimNumber} by ${name}: ${reason}`,
      before,
      after: access.snapshot(updated),
      metadata: { reason },
    });
    res.json({ success: true, data: withPermissions(req, updated) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
