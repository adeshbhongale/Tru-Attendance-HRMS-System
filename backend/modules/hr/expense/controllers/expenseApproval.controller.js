const mongoose = require('mongoose');
const ExpenseClaim = require('../models/ExpenseClaim');
const access = require('../services/expenseAccess');
const approvers = require('../services/approverService');
const { computePayable, formatINR } = require('../services/claimRules');
const { round2 } = require('../services/calculationEngine');
const pettyCash = require('../services/pettyCashService');
const finance = require('../services/financeApprovalService');

/**
 * In-app approval stage (mobile "Other Approvals"):
 * APPROVAL_PENDING --approve--> SUBMITTED (Accounts Pending)
 * APPROVAL_PENDING --reject---> REJECTED
 * Only the approver the employee selected on the claim can see / decide it.
 *
 * Full Payment / Stock Purchase claims have a 2-step approval:
 * 1st approval: Reporting Manager (managerApproval) -> 2nd approval: CFO / Finance Head
 * (financeApproval, configured per company) -> SUBMITTED (Accounts Pending).
 * The claim stays APPROVAL_PENDING until the 2nd approval; either approver can reject it.
 */

const fail = (res, status, message) => res.status(status).json({ success: false, message });
const str = (v, max) => String(v === undefined || v === null ? '' : v).trim().slice(0, max);
const KINDS = ['FULL_PAYMENT', 'OTHER_EXPENSE'];

const POPULATE = [
  { path: 'submittedBy', select: 'name employeeIdCode department designation role roleCode' },
  { path: 'employeeClaims.employee.employeeId', select: 'name employeeIdCode department designation' },
  { path: 'managerApproval.approver', select: 'name employeeIdCode department designation role roleCode' },
  { path: 'financeApproval.approver', select: 'name employeeIdCode department designation role roleCode' },
  { path: 'accountsApproval.approvedBy', select: 'name employeeIdCode department designation role roleCode' },
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
    const rawExclude = req.query.excludeIds || req.query.employeeIds || '';
    const extraExcludeIds = Array.isArray(rawExclude)
      ? rawExclude.map((id) => String(id).trim()).filter(Boolean)
      : String(rawExclude)
          .split(',')
          .map((id) => id.trim())
          .filter(Boolean);
    const excludeIdsList = [...new Set([String(req.user._id), ...extraExcludeIds])];
    const effectiveListKind = (kind === 'FULL_PAYMENT' || kind === 'OTHER_EXPENSE') ? 'OTHER_EXPENSE' : kind;
    const data = await approvers.listApprovers({ companyId, kind: effectiveListKind, excludeIds: excludeIdsList, search: str(req.query.search, 100) });
    let defaultApprover = null;
    if (kind === 'OTHER_EXPENSE' || kind === 'FULL_PAYMENT') {
      const amount = req.query.amount !== undefined && req.query.amount !== '' ? Number(req.query.amount) : undefined;
      const meta = await approvers.resolveEmployeeReportingManagerWithMeta(req.user, companyId, excludeIdsList, { amount });
      defaultApprover = meta.approver || null;
      req._approvalLimitRules = meta.approvalLimitRules || [];
      req._directLimit = meta.directLimit ?? null;
      req._matchedRule = meta.matchedRule || null;
      req._exceededRules = meta.exceededRules || [];
      if (defaultApprover) {
        const idx = data.findIndex((u) => String(u._id) === String(defaultApprover._id));
        if (idx > 0) {
          const [matched] = data.splice(idx, 1);
          data.unshift(matched);
        } else if (idx === -1) {
          data.unshift(defaultApprover);
        }
      }
    }
    res.json({
      success: true,
      data,
      defaultApprover,
      approvalLimitRules: req._approvalLimitRules || [],
      directLimit: req._directLimit ?? null,
      matchedRule: req._matchedRule || null,
      exceededRules: req._exceededRules || [],
    });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
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

    const base = {};
    if (companyId && companyId !== 'ALL') base.companyId = companyId;
    const decided = String(req.query.status || 'PENDING').toUpperCase() === 'DECIDED';
    // 1st approval (Reporting Manager) is pending until the claim moves to the CFO / Finance Head;
    // 2nd approval (CFO / Finance Head) is pending while financeApproval.status is PENDING.
    const pendingFilter = {
      ...base,
      status: 'APPROVAL_PENDING',
      $or: [
        { 'managerApproval.approver': uid, 'financeApproval.status': { $ne: 'PENDING' } },
        { 'financeApproval.approver': uid, 'financeApproval.status': 'PENDING' },
      ],
    };
    const filter = decided
      ? {
        ...base,
        $or: [
          { 'managerApproval.approver': uid, 'managerApproval.status': { $in: ['APPROVED', 'REJECTED'] } },
          { 'financeApproval.approver': uid, 'financeApproval.status': { $in: ['APPROVED', 'REJECTED'] } },
        ],
      }
      : pendingFilter;

    const [claims, pendingCount, isApprover, isFinanceHead, headRec] = await Promise.all([
      ExpenseClaim.find(filter)
        .populate(POPULATE)
        .sort(decided ? { 'financeApproval.decidedAt': -1, 'managerApproval.decidedAt': -1, updatedAt: -1 } : { submittedAt: 1, createdAt: 1 })
        .limit(decided ? 100 : 500)
        .lean(),
      ExpenseClaim.countDocuments(pendingFilter),
      approvers.isPotentialApprover(req.user, companyId),
      finance.isFinanceHeadUser(uid, companyId),
      companyId && companyId !== 'ALL' ? finance.getFinanceHeadRecord(companyId).catch(() => null) : Promise.resolve(null),
    ]);
    const data = claims.map((c) => {
      const needsSecond = Boolean(
        finance.needsFinanceApproval(c, { financeHead: headRec }) ||
        (c.financeApproval?.status && c.financeApproval.status !== 'NOT_REQUIRED') ||
        c.financeApproval?.approver ||
        c.financeApproval?.approverName
      );
      const fin = c.financeApproval || {};
      const enrichedFin = needsSecond && !fin.approver && !fin.approverName && headRec?.employee
        ? { ...fin, status: fin.status || 'NOT_REQUIRED', approver: headRec.employee, approverName: headRec.employee.name || '' }
        : fin;
      return {
        ...withPermissions(req, { ...c, financeApproval: enrichedFin }),
        requiresSecondApproval: needsSecond,
        // Which approval this user gives on the claim: MANAGER (1st) or FINANCE (2nd, CFO / Finance Head)
        myApprovalStage: access.isFinanceApprover(c, uid) ? 'FINANCE' : 'MANAGER',
      };
    });
    res.json({ success: true, data, pendingCount, isApprover: isApprover || isFinanceHead || pendingCount > 0 });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

async function loadForDecision(req, res) {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) { fail(res, 404, 'Claim not found'); return null; }
  const claim = await ExpenseClaim.findById(req.params.id);
  if (!claim || !access.canViewClaim(req, claim)) { fail(res, 404, 'Claim not found'); return null; }
  const perms = access.claimPermissions(req, claim);
  if (!perms.canApprove) {
    if (!access.isCurrentStageApprover(claim, access.userId(req)) && !access.isCompanyAdmin(req.user)) {
      fail(res, 403, access.isFinanceStage(claim)
        ? 'This claim is waiting for the CFO / Finance Head approval.'
        : 'Only the approver selected on this claim can decide it.');
    }
    else if (!perms.awaitingApproval) fail(res, 409, 'This claim is no longer waiting for approval.');
    else fail(res, 403, 'You cannot approve a claim you are part of.');
    return null;
  }
  return claim;
}

const { isStockPurchaseClaim } = finance;

const kindLabel = (ma, claim) => {
  if (ma?.kind === 'FULL_PAYMENT' || claim?.fullPayment?.requested || claim?.requestFullPayment) return 'Full payment';
  if (isStockPurchaseClaim(claim)) return 'Stock purchase';
  const ct = String(claim?.claimType || claim?.expenseType || '').toUpperCase();
  if (ct === 'LODGING') return 'Lodging';
  if (ct === 'TRAVEL') return 'Travel';
  if (ct === 'CONVEYANCE') return 'Local conveyance';
  if (ct === 'FOOD') return 'Food';
  if (ct === 'COMBINE' || ct === 'COMBINED') return 'Combined expense';
  return 'Other expense';
};

/** POST /api/expense/claims/:id/approve — Body: { remarks? } */
exports.approveClaim = async (req, res) => {
  try {
    const claim = await loadForDecision(req, res);
    if (!claim) return;
    const remarks = str(req.body?.remarks || req.body?.adminNote || req.body?.reason, 500);
    if (!remarks) return fail(res, 422, 'Approval remark is required.');
    const now = new Date();
    const name = req.user.name || '';
    const before = access.snapshot(claim);
    const isFull = !!claim.fullPayment?.requested;
    const financeStage = access.isFinanceStage(claim);

    // 1st approval of a Full Payment / Stock Purchase claim: forward to the company's
    // CFO / Finance Head for the 2nd approval (skipped when none is configured, or when
    // the Finance Head is on the claim / is the approver who just approved it).
    let financeHead = null;
    const claimCompanyId = claim.companyId?._id || claim.companyId || claim.company?._id || claim.company || access.resolveCompanyId(req);
    if (!financeStage) {
      const headRec = await finance.getFinanceHeadRecord(claimCompanyId).catch(() => null);
      if (finance.needsFinanceApproval(claim, { financeHead: headRec })) {
        const head = headRec?.employee || await finance.getFinanceHead(claimCompanyId).catch(() => null);
        const headId = head ? String(head._id) : '';
        const managerId = String(claim.managerApproval?.approver?._id || claim.managerApproval?.approver || '');
        const headOnClaim = headId && (access.isCreator(claim, headId) || access.isOnClaim(claim, headId));
        if (headId && !headOnClaim && headId !== managerId && headId !== String(req.user._id)) financeHead = head;
      }
    }

    if (financeHead) {
      const fwdQuery = {
        _id: claim._id,
        ...(claim.companyId ? { companyId: claim.companyId } : {}),
        status: 'APPROVAL_PENDING',
        'financeApproval.status': { $ne: 'PENDING' },
      };
      if (!access.isCompanyAdmin(req.user)) fwdQuery['managerApproval.approver'] = req.user._id;
      const headName = financeHead.name || 'CFO / Finance Head';
      const forwarded = await ExpenseClaim.findOneAndUpdate(
        fwdQuery,
        {
          $set: {
            'managerApproval.status': 'APPROVED',
            'managerApproval.decidedAt': now,
            'managerApproval.remarks': remarks,
            financeApproval: {
              approver: financeHead._id,
              approverName: financeHead.name || '',
              status: 'PENDING',
              requestedAt: now,
              decidedAt: null,
              remarks: '',
            },
          },
          $push: {
            approvalHistory: { user: req.user._id, role: req.user.role, action: 'approved', timestamp: now, remarks },
            timeline: {
              action: 'APPROVED',
              description: `${kindLabel(claim.managerApproval, claim)} approved by ${name || 'approver'} (1st approval)${remarks ? `: ${remarks}` : ''}. Awaiting 2nd approval from ${headName} (CFO / Finance Head).`,
              user: req.user._id,
              timestamp: now,
            },
          },
        },
        { new: true }
      );
      if (!forwarded) return fail(res, 409, 'This claim was already processed.');

      await access.audit({
        req,
        action: 'FINANCE_APPROVAL_REQUESTED',
        claim: forwarded,
        description: `${kindLabel(forwarded.managerApproval, forwarded)} 1st approval by ${name} on ${forwarded.claimNumber}. 2nd approval requested from ${headName} (CFO / Finance Head).`,
        before,
        after: access.snapshot(forwarded),
        metadata: { remarks, financeApprover: financeHead._id },
      });
      return res.json({ success: true, data: withPermissions(req, forwarded) });
    }

    const set = financeStage
      ? {
        status: 'SUBMITTED',
        paymentStatus: 'PENDING',
        'financeApproval.status': 'APPROVED',
        'financeApproval.decidedAt': now,
        'financeApproval.remarks': remarks,
      }
      : {
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
    const query = {
      _id: claim._id,
      ...(claim.companyId ? { companyId: claim.companyId } : {}),
      status: 'APPROVAL_PENDING',
    };
    query['financeApproval.status'] = financeStage ? 'PENDING' : { $ne: 'PENDING' };
    if (!access.isCompanyAdmin(req.user)) {
      query[financeStage ? 'financeApproval.approver' : 'managerApproval.approver'] = req.user._id;
    }
    const stageSuffix = financeStage ? ' (2nd approval - CFO / Finance Head)' : '';
    const updated = await ExpenseClaim.findOneAndUpdate(
      query,
      {
        $set: set,
        $push: {
          approvalHistory: { user: req.user._id, role: req.user.role, action: 'approved', timestamp: now, remarks },
          timeline: {
            action: 'APPROVED',
            description: `${kindLabel(claim.managerApproval, claim)} approved by ${name || 'approver'}${stageSuffix}${remarks ? `: ${remarks}` : ''}. Sent to Accounts${isFull ? ` (payable ${formatINR(claim.grandRequested)})` : ''}.`,
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
      description: `${kindLabel(updated.managerApproval, updated)} approved on ${updated.claimNumber} by ${name}${stageSuffix}.`,
      before,
      after: access.snapshot(updated),
      metadata: { remarks },
    });
    res.json({ success: true, data: withPermissions(req, updated) });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
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
    const financeStage = access.isFinanceStage(claim);

    const set = {
      status: 'REJECTED',
      paymentStatus: 'REJECTED',
      accountsRemarks: reason,
      rejection: { reason, rejectedAt: now, rejectedBy: req.user._id, rejectedByName: name },
    };
    if (financeStage) {
      // 2nd approval (CFO / Finance Head) rejected: the Reporting Manager approval stays as decided.
      Object.assign(set, {
        'financeApproval.status': 'REJECTED',
        'financeApproval.decidedAt': now,
        'financeApproval.remarks': reason,
      });
    } else {
      Object.assign(set, {
        'managerApproval.status': 'REJECTED',
        'managerApproval.decidedAt': now,
        'managerApproval.remarks': reason,
      });
    }
    if (claim.fullPayment?.requested) {
      Object.assign(set, {
        'fullPayment.status': 'REJECTED',
        'fullPayment.decidedBy': req.user._id,
        'fullPayment.decidedByName': name,
        'fullPayment.decidedAt': now,
        'fullPayment.decisionRemarks': reason,
      });
    }

    const query = {
      _id: claim._id,
      ...(claim.companyId ? { companyId: claim.companyId } : {}),
      status: 'APPROVAL_PENDING',
    };
    query['financeApproval.status'] = financeStage ? 'PENDING' : { $ne: 'PENDING' };
    if (!access.isCompanyAdmin(req.user)) {
      query[financeStage ? 'financeApproval.approver' : 'managerApproval.approver'] = req.user._id;
    }
    const rejectSuffix = financeStage ? ' (2nd approval - CFO / Finance Head)' : '';
    // Rejection + reversal of the submitter's petty cash debit, atomically.
    const updated = await pettyCash.runAtomic(async (session) => {
      const u = await ExpenseClaim.findOneAndUpdate(
        query,
        {
          $set: set,
          $push: {
            approvalHistory: { user: req.user._id, role: req.user.role, action: 'rejected', timestamp: now, remarks: reason },
            timeline: { action: 'REJECTED', description: `${kindLabel(claim.managerApproval, claim)} rejected by ${name || 'approver'}${rejectSuffix}: ${reason}`, user: req.user._id, timestamp: now },
          },
        },
        { new: true, session: session || undefined }
      );
      if (u) await pettyCash.syncClaimDebit(u, { session, req });
      return u;
    });
    if (!updated) return fail(res, 409, 'This claim was already processed.');

    await access.audit({
      req,
      action: 'APPROVAL_REJECTED',
      claim: updated,
      description: `${kindLabel(updated.managerApproval, updated)} rejected on ${updated.claimNumber} by ${name}${rejectSuffix}: ${reason}`,
      before,
      after: access.snapshot(updated),
      metadata: { reason },
    });
    res.json({ success: true, data: withPermissions(req, updated) });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
};
