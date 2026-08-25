const mongoose = require('mongoose');
const User = require('../../../../models/User');
const Company = require('../../../../models/Company');
const ApprovalWorkflow = require('../../../../models/ApprovalWorkflow');
const ExpenseClaim = require('../models/ExpenseClaim');
const ExpenseAuditLog = require('../models/ExpenseAuditLog');
const ExpenseType = require('../models/ExpenseType');
const { ensureExpenseMasters } = require('../services/seedExpenseMasters');
const {
  getActivePolicy,
  getExpenseTypes,
  resolveCityClass,
  getEntitlements,
  findEntitlement,
  getEmployeeLevelNumber,
  getEmployeeGradeCode,
} = require('../services/policyEngine');
const { calculateItem, calculateEmployeeItems, round2 } = require('../services/calculationEngine');

const resolveTenantCompanyId = async (req) => {
  let companyId = req.headers['x-company-id'] || req.query.companyId || req.body?.companyId || req.tenant?.companyId || req.companyId || req.user?.companyId || req.user?.company || null;
  if (companyId && typeof companyId === 'object' && companyId._id) {
    companyId = companyId._id;
  }
  if (!companyId && (req.user?.role === 'superadmin' || req.user?.role === 'super_admin' || req.user?.roleCode === 'TCSA1' || req.user?.scope === 'GLOBAL')) {
    const firstComp = await Company.findOne({ status: { $nin: ['SUSPENDED', 'INACTIVE', 'inactive'] } }).select('_id');
    if (firstComp) companyId = firstComp._id;
  }
  return companyId;
};

const AUDIT = {
  async log({ req, action, claim, description, metadata }) {
    try {
      const companyId = await resolveTenantCompanyId(req);
      await ExpenseAuditLog.create({
        companyId: companyId || (claim && claim.companyId) || null,
        company: companyId || (claim && claim.companyId) || null,
        action,
        entity: 'ExpenseClaim',
        entityId: claim ? claim._id.toString() : '',
        claimNumber: claim ? claim.claimNumber : '',
        user: req.user?._id || req.user?.id || null,
        userName: req.user?.name || '',
        description: description || action,
        metadata: metadata || {},
      });
    } catch (err) { /* audit must never break the flow */ }
  },
};

/**
 * GET /api/expense/claims?status=&page=&limit=&scope=
 * Combined claims list with strict privacy and draft isolation:
 * - Employees only see their own claims OR submitted claims where tagged as co-claimant.
 * - Drafts are strictly private to the creator (hidden from other employees, HR, and Accounts).
 */
exports.listClaims = async (req, res) => {
  try {
    const companyId = await resolveTenantCompanyId(req);
    const { status, page = 1, limit = 20, scope } = req.query;
    const filter = {};
    if (companyId) filter.companyId = companyId;
    if (status && status !== 'ALL') filter.status = status;

    if (req.query.startDate || req.query.endDate) {
      filter.createdAt = {};
      if (req.query.startDate) {
        filter.createdAt.$gte = new Date(req.query.startDate);
      }
      if (req.query.endDate) {
        const e = new Date(req.query.endDate);
        e.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = e;
      }
    }

    const isStaff = ['admin', 'superadmin', 'company_admin', 'companyadmin', 'super_admin', 'tcsa1', 'hr', 'hr_admin', 'accounts', 'account_admin', 'finance', 'tcacc1'].some(
      r => String(r).toLowerCase() === String(req.user.role || '').toLowerCase() || String(req.user.roleCode || '').toLowerCase() === String(r).toLowerCase()
    );

    const isMyScope = scope === 'my' || !isStaff;

    if (isMyScope) {
      // Employee / "My Claims" view:
      // Only show claims submitted by user OR submitted claims where user is tagged.
      // DRAFTS from other users are NEVER visible even if tagged!
      filter.$and = filter.$and || [];
      filter.$and.push({
        $or: [
          { submittedBy: req.user._id },
          { 'employeeClaims.employee.employeeId': req.user._id, status: { $ne: 'DRAFT' } },
        ]
      });
    } else {
      // Staff (HR / Accounts / Admin) company-wide approval view:
      // Can see all submitted/processed claims in company, BUT only their own DRAFT claims.
      if (status === 'DRAFT') {
        filter.submittedBy = req.user._id;
      } else if (!status || status === 'ALL') {
        filter.$and = filter.$and || [];
        filter.$and.push({
          $or: [
            { status: { $ne: 'DRAFT' } },
            { submittedBy: req.user._id },
          ]
        });
      }
    }

    const [claims, total] = await Promise.all([
      ExpenseClaim.find(filter)
        .populate('submittedBy', 'name employeeIdCode department')
        .populate('employeeClaims.employee.employeeId', 'name employeeIdCode department')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(parseInt(limit))
        .lean(),
      ExpenseClaim.countDocuments(filter),
    ]);

    const claimsWithShare = claims.map(c => {
      const isApplicant = String(c.submittedBy?._id || c.submittedBy) === String(req.user._id);
      let userRequested = 0;
      let userAllowed = 0;
      let userExcess = 0;
      let isLodgingCoveredByOther = false;

      const myEc = (c.employeeClaims || []).find(ec => {
        const empId = ec.employee?.employeeId?._id || ec.employee?.employeeId;
        return String(empId) === String(req.user._id);
      });

      if (isApplicant) {
        userRequested = c.grandRequested || 0;
        userAllowed = c.grandAllowed || 0;
        userExcess = c.grandExcess || 0;
      } else if (myEc) {
        const nonLodgingItems = (myEc.items || []).filter(it => String(it.expenseType || '').toUpperCase() !== 'LODGING');
        userRequested = round2(nonLodgingItems.reduce((s, i) => s + (i.requestedAmount || 0), 0));
        userAllowed = round2(nonLodgingItems.reduce((s, i) => s + (i.allowedAmount || 0), 0));
        userExcess = round2(nonLodgingItems.reduce((s, i) => s + (i.excessAmount || 0), 0));
        
        const isLodgingClaim = c.claimType === 'LODGING' || (myEc.items || []).some(it => String(it.expenseType || '').toUpperCase() === 'LODGING');
        if (isLodgingClaim && nonLodgingItems.length === 0) {
          isLodgingCoveredByOther = true;
        }
      }

      return {
        ...c,
        isApplicant,
        userRequested,
        userAllowed,
        userExcess,
        isLodgingCoveredByOther,
      };
    });

    res.json({
      success: true,
      data: claimsWithShare,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * GET /api/expense/claims/:id
 * Secure claim detail fetch with strict permission checks:
 * - DRAFT claims can ONLY be viewed by the creator.
 * - Submitted claims can only be viewed by the creator, tagged employees, or company staff.
 */
exports.getClaim = async (req, res) => {
  try {
    const claim = await ExpenseClaim.findById(req.params.id)
      .populate('submittedBy', 'name employeeIdCode department')
      .populate('employeeClaims.employee.employeeId', 'name employeeIdCode department')
      .populate('employeeClaims.claimedBy', 'name')
      .lean();
    if (!claim) return res.status(404).json({ success: false, message: 'Claim not found' });

    const userIdStr = String(req.user._id || req.user.id);
    const creatorIdStr = String(claim.submittedBy?._id || claim.submittedBy);
    const isCreator = creatorIdStr === userIdStr;

    // Strict Draft Isolation: ONLY the creator can ever view a DRAFT claim
    if (claim.status === 'DRAFT') {
      if (!isCreator) {
        return res.status(403).json({
          success: false,
          message: 'Draft claims are private and can only be viewed by the creator.'
        });
      }
      return res.json({ success: true, data: claim });
    }

    // For submitted / processed claims:
    const isTaggedEmployee = (claim.employeeClaims || []).some(ec => {
      const empId = ec.employee?.employeeId?._id || ec.employee?.employeeId;
      return String(empId) === userIdStr;
    });

    const isStaff = ['admin', 'superadmin', 'company_admin', 'companyadmin', 'super_admin', 'tcsa1', 'hr', 'hr_admin', 'accounts', 'account_admin', 'finance', 'tcacc1'].some(
      r => String(r).toLowerCase() === String(req.user.role || '').toLowerCase() || String(req.user.roleCode || '').toLowerCase() === String(r).toLowerCase()
    );

    if (!isCreator && !isTaggedEmployee && !isStaff) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to view this expense claim.'
      });
    }

    res.json({ success: true, data: claim });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * POST /api/expense/claims/preview
 * Preview calculation for a combined multi-employee claim WITHOUT saving.
 * body: { trip: {...}, employeeClaims: [{ employeeId, items: [...] }] }
 */
function calculateDaysBetween(startDate, endDate) {
  if (!startDate || !endDate) return 1;
  const start = new Date(startDate).getTime();
  const end = new Date(endDate).getTime();
  if (isNaN(start) || isNaN(end) || end < start) return 1;
  return Math.max(1, Math.floor((end - start) / 86400000) + 1);
}

exports.previewClaim = async (req, res) => {
  try {
    const companyId = await resolveTenantCompanyId(req);
    await ensureExpenseMasters(companyId);
    const policy = await getActivePolicy(companyId);
    if (!policy) return res.status(400).json({ success: false, message: 'No active expense policy. Configure one first.' });

    const types = await getExpenseTypes(companyId);
    const body = req.body || {};
    const trip = body.trip || {};
    const defaultDays = calculateDaysBetween(trip.startDate, trip.endDate);
    const employeeClaims = body.employeeClaims || [];

    if (!Array.isArray(employeeClaims) || employeeClaims.length === 0) {
      return res.status(400).json({ success: false, message: 'At least one employee claim is required.' });
    }

    const getRawEmployeeId = (val) => {
      if (!val) return null;
      if (typeof val === 'object') return val._id ? String(val._id) : (val.employeeId ? String(val.employeeId) : null);
      return String(val);
    };

    const employeeIds = employeeClaims.map(ec => getRawEmployeeId(ec.employeeId)).filter(Boolean);
    const employees = await User.find({ _id: { $in: employeeIds } })
      .populate('levelRef')
      .populate('gradeRef')
      .lean();
    const employeesById = {};
    employees.forEach(e => { employeesById[e._id.toString()] = e; });

    const destinationClass = await resolveCityClass(companyId, trip.destination || body.destination || body.city || '');
    const entitlements = await getEntitlements(companyId, policy._id, types.map(t => t.code), destinationClass);

    // Detect shared lodging
    const isSharedLodgingClaim = !!body.isSharedLodging || (
      (body.claimType === 'LODGING' || employeeClaims.some(ec => (ec.items || []).some(it => it.expenseType === 'LODGING')))
      && employees.length >= 2
    );

    let sharedHigherEnt = null;
    let sharedLowerEnt = null;
    if (isSharedLodgingClaim && employees.length >= 2) {
      const lodgingEnts = employees.map(emp => {
        const ln = getEmployeeLevelNumber(emp);
        const gc = getEmployeeGradeCode(emp);
        const ent = findEntitlement(entitlements, ln, gc, destinationClass, 'LODGING');
        return ent ? ent.amount : 0;
      }).sort((a, b) => b - a);

      sharedHigherEnt = lodgingEnts[0] || 0;
      sharedLowerEnt = lodgingEnts.length > 1 ? lodgingEnts[1] : lodgingEnts[0] || 0;
    }

    const results = [];
    for (const ec of employeeClaims) {
      const rawEmpId = getRawEmployeeId(ec.employeeId);
      const emp = employeesById[rawEmpId];
      if (!emp) {
        results.push({ employeeId: ec.employeeId, error: 'Employee not found' });
        continue;
      }
      const levelNumber = getEmployeeLevelNumber(emp);
      const gradeCode = getEmployeeGradeCode(emp);

      const isLodgingItem = body.claimType === 'LODGING' || (ec.items || []).some(i => i.expenseType === 'LODGING');
      const items = await calculateEmployeeItems({
        items: ec.items || [],
        employeeLevelNumber: levelNumber,
        employeeGradeCode: gradeCode,
        entitlements,
        cityClass: destinationClass,
        policy,
        defaultDays,
        isSharedLodgingClaim,
        sharedHigherEnt: isLodgingItem && isSharedLodgingClaim ? (ec.sharedLodgingHigherEntitlement ?? sharedHigherEnt) : null,
        sharedLowerEnt: isLodgingItem && isSharedLodgingClaim ? (ec.sharedLodgingLowerEntitlement ?? sharedLowerEnt) : null,
      });

      const requestedTotal = round2(items.reduce((s, i) => s + (i.requestedAmount || 0), 0));
      const allowedTotal = round2(items.reduce((s, i) => s + (i.allowedAmount || 0), 0));
      const excessTotal = round2(items.reduce((s, i) => s + (i.excessAmount || 0), 0));

      const ownLodgingEnt = findEntitlement(entitlements, levelNumber, gradeCode, destinationClass, 'LODGING');
      const ownFoodEnt = findEntitlement(entitlements, levelNumber, gradeCode, destinationClass, 'FOOD');

      results.push({
        employeeId: ec.employeeId,
        employee: {
          name: emp.name,
          employeeIdCode: emp.employeeIdCode,
          levelName: emp.levelRef?.name || '',
          levelNumber,
          gradeCode,
          department: emp.department,
          entitlementSummary: {
            lodgingPerDay: ownLodgingEnt ? ownLodgingEnt.amount : 0,
            foodPerDay: ownFoodEnt ? ownFoodEnt.amount : 0,
          },
        },
        items,
        requestedTotal,
        allowedTotal,
        excessTotal,
        itemCount: items.length,
        isCoClaimant: isSharedLodgingClaim && items.length === 0,
      });
    }

    const grandRequested = round2(results.reduce((s, r) => s + (r.requestedTotal || 0), 0));
    const grandAllowed = round2(results.reduce((s, r) => s + (r.allowedTotal || 0), 0));
    const grandExcess = round2(results.reduce((s, r) => s + (r.excessTotal || 0), 0));

    res.json({
      success: true,
      data: {
        policy: { code: policy.code, version: policy.version, source: policy.source },
        approvalRequired: policy.approvalRequired,
        approvalEngine: policy.approvalEngine,
        sharedLodgingRule: policy.sharedLodgingRule,
        isSharedLodging: isSharedLodgingClaim,
        destinationClass,
        employeeResults: results,
        employeeClaims: results,
        results,
        grandRequested,
        grandAllowed,
        grandExcess,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * POST /api/expense/claims
 * Create a combined multi-employee claim. The login user may file for
 * themselves (1 employee) or for several employees (2, 3, ...).
 * body: { trip: {...}, employeeClaims: [{ employeeId, items: [...] }] }
 */
exports.createClaim = async (req, res) => {
  try {
    const companyId = await resolveTenantCompanyId(req);
    await ensureExpenseMasters(companyId);
    const policy = await getActivePolicy(companyId);
    if (!policy) return res.status(400).json({ success: false, message: 'No active expense policy. Configure one first.' });

    const body = req.body || {};
    const trip = body.trip || {};
    const defaultDays = calculateDaysBetween(trip.startDate, trip.endDate);
    const employeeClaimsInput = body.employeeClaims || [];

    if (!Array.isArray(employeeClaimsInput) || employeeClaimsInput.length === 0) {
      return res.status(400).json({ success: false, message: 'At least one employee claim is required.' });
    }
    if (employeeClaimsInput.length > 20) {
      return res.status(400).json({ success: false, message: 'Maximum 20 employees per combined claim.' });
    }

    const getRawEmployeeId = (val) => {
      if (!val) return null;
      if (typeof val === 'object') return val._id ? String(val._id) : (val.employeeId ? String(val.employeeId) : null);
      return String(val);
    };

    const employeeIds = employeeClaimsInput.map(ec => getRawEmployeeId(ec.employeeId)).filter(Boolean);
    const employees = await User.find({ _id: { $in: employeeIds } })
      .populate('levelRef')
      .populate('gradeRef')
      .lean();
    const employeesById = {};
    employees.forEach(e => { employeesById[e._id.toString()] = e; });

    const destinationClass = await resolveCityClass(companyId, trip.destination || body.destination || body.city || '');
    const types = await getExpenseTypes(companyId);
    const entitlements = await getEntitlements(companyId, policy._id, types.map(t => t.code), destinationClass);

    // Detect shared lodging
    const isSharedLodgingClaim = !!body.isSharedLodging || (
      (body.claimType === 'LODGING' || employeeClaimsInput.some(ec => (ec.items || []).some(it => it.expenseType === 'LODGING')))
      && employees.length >= 2
    );

    let sharedHigherEnt = null;
    let sharedLowerEnt = null;
    if (isSharedLodgingClaim && employees.length >= 2) {
      const lodgingEnts = employees.map(emp => {
        const ln = getEmployeeLevelNumber(emp);
        const gc = getEmployeeGradeCode(emp);
        const ent = findEntitlement(entitlements, ln, gc, destinationClass, 'LODGING');
        return ent ? ent.amount : 0;
      }).sort((a, b) => b - a);

      sharedHigherEnt = lodgingEnts[0] || 0;
      sharedLowerEnt = lodgingEnts.length > 1 ? lodgingEnts[1] : lodgingEnts[0] || 0;
    }

    const employeeClaims = [];
    for (const ec of employeeClaimsInput) {
      const rawEmpId = getRawEmployeeId(ec.employeeId);
      const emp = employeesById[rawEmpId];
      if (!emp) {
        return res.status(400).json({ success: false, message: `Employee ${ec.employeeId} not found in this company.` });
      }
      const levelNumber = getEmployeeLevelNumber(emp);
      const gradeCode = getEmployeeGradeCode(emp);

      const isLodgingItem = body.claimType === 'LODGING' || (ec.items || []).some(i => i.expenseType === 'LODGING');
      const items = await calculateEmployeeItems({
        items: ec.items || [],
        employeeLevelNumber: levelNumber,
        employeeGradeCode: gradeCode,
        entitlements,
        cityClass: destinationClass,
        policy,
        defaultDays,
        isSharedLodgingClaim,
        sharedHigherEnt: isLodgingItem && isSharedLodgingClaim ? (ec.sharedLodgingHigherEntitlement ?? sharedHigherEnt) : null,
        sharedLowerEnt: isLodgingItem && isSharedLodgingClaim ? (ec.sharedLodgingLowerEntitlement ?? sharedLowerEnt) : null,
      });

      const requestedTotal = round2(items.reduce((s, i) => s + (i.requestedAmount || 0), 0));
      const allowedTotal = round2(items.reduce((s, i) => s + (i.allowedAmount || 0), 0));
      const excessTotal = round2(items.reduce((s, i) => s + (i.excessAmount || 0), 0));

      employeeClaims.push({
        employee: {
          employeeId: emp._id,
          name: emp.name,
          employeeIdCode: emp.employeeIdCode,
          department: emp.department,
          levelName: emp.levelRef?.name || '',
          levelNumber,
          levelRef: emp.levelRef?._id || null,
          gradeCode,
          gradeRef: emp.gradeRef?._id || null,
          role: emp.role,
        },
        claimedBy: req.user._id,
        items,
        requestedTotal,
        allowedTotal,
        excessTotal,
        itemCount: items.length,
      });
    }

    const grandRequested = round2(employeeClaims.reduce((s, c) => s + c.requestedTotal, 0));
    const grandAllowed = round2(employeeClaims.reduce((s, c) => s + c.allowedTotal, 0));
    const grandExcess = round2(employeeClaims.reduce((s, c) => s + c.excessTotal, 0));

    // Deadline warnings (configurable, never auto-reject)
    const deadlineWarnings = [];
    if (trip.endDate) {
      const daysSince = Math.floor((Date.now() - new Date(trip.endDate).getTime()) / 86400000);
      const rules = policy.deadlineRules || [];
      rules.forEach(rule => {
        if (rule.action === 'blocking') return; // blocking is opt-in future
        if (daysSince > rule.days) {
          deadlineWarnings.push(`${rule.ruleName || 'Deadline rule'} exceeded by ${daysSince - rule.days} day(s).`);
        }
      });
    }

    const claimTypeCode = body.claimType || (employeeClaimsInput[0]?.items?.[0]?.expenseType) || '';

    // Idempotency & Duplicate Guard: Check if an identical DRAFT was created in the last 15 seconds by this user
    const recentDuplicateDraft = await ExpenseClaim.findOne({
      companyId,
      submittedBy: req.user._id,
      claimType: claimTypeCode,
      grandRequested,
      employeeCount: employeeClaims.length,
      status: 'DRAFT',
      createdAt: { $gte: new Date(Date.now() - 15000) }
    });

    let claim;
    if (recentDuplicateDraft) {
      // Reuse and update the existing draft rather than creating a duplicate
      recentDuplicateDraft.employeeClaims = employeeClaims;
      recentDuplicateDraft.employeeCount = employeeClaims.length;
      recentDuplicateDraft.trip = {
        customerName: trip.customerName || '',
        purpose: trip.purpose || '',
        destination: trip.destination || '',
        destinationClass,
        startDate: trip.startDate || null,
        endDate: trip.endDate || null,
        travelMode: trip.travelMode || '',
        tourSanctioned: trip.tourSanctioned !== false,
      };
      recentDuplicateDraft.grandRequested = grandRequested;
      recentDuplicateDraft.grandAllowed = grandAllowed;
      recentDuplicateDraft.grandExcess = grandExcess;
      recentDuplicateDraft.deadlineWarnings = deadlineWarnings;
      claim = await recentDuplicateDraft.save();
    } else {
      claim = await ExpenseClaim.create({
        companyId,
        company: companyId,
        submittedBy: req.user._id,
        submittedByName: req.user.name || '',
        claimType: claimTypeCode,
        employeeClaims,
        employeeCount: employeeClaims.length,
        trip: {
          customerName: trip.customerName || '',
          purpose: trip.purpose || '',
          destination: trip.destination || '',
          destinationClass,
          startDate: trip.startDate || null,
          endDate: trip.endDate || null,
          travelMode: trip.travelMode || '',
          tourSanctioned: trip.tourSanctioned !== false,
        },
        policyId: policy._id,
        policyVersion: policy.version || '1.0',
        policyCode: policy.code || '',
        policySnapshot: {
          code: policy.code,
          version: policy.version,
          source: policy.source,
          approvalRequired: policy.approvalRequired,
          sharedLodgingRule: policy.sharedLodgingRule,
          conveyanceRates: policy.conveyanceRates,
          effectiveFrom: policy.effectiveFrom,
        },
        approvalRequired: policy.approvalRequired,
        approvalFlow: policy.approvalRequired ? 'HR' : 'NONE',
        grandRequested,
        grandAllowed,
        grandExcess,
        status: 'DRAFT',
        paymentStatus: 'PENDING',
        deadlineWarnings,
        timeline: [{
          action: 'CREATED',
          description: isSharedLodgingClaim
            ? `Shared lodging claim draft created for ${employeeClaims.length} employee(s) by ${req.user.name || 'employee'}.`
            : `Combined claim draft created for ${employeeClaims.length} employee(s) by ${req.user.name || 'employee'}.`,
          user: req.user._id,
          timestamp: new Date(),
        }],
      });
    }

    await AUDIT.log({
      req,
      action: 'CLAIM_CREATED',
      claim,
      description: `Claim ${claim.claimNumber} created (${employeeClaims.length} employees, requested ${grandRequested}).`,
      metadata: { employeeCount: employeeClaims.length, grandRequested, isSharedLodging: isSharedLodgingClaim },
    });

    res.status(201).json({ success: true, data: claim });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * PUT /api/expense/claims/:id
 * Update an existing draft claim.
 * Only DRAFT or RETURNED claims are editable. Pending / paid claims cannot be modified.
 */
exports.updateClaim = async (req, res) => {
  try {
    const claim = await ExpenseClaim.findById(req.params.id);
    if (!claim) return res.status(404).json({ success: false, message: 'Claim not found' });

    const EDITABLE_STATUSES = ['DRAFT', 'RETURNED', 'REJECTED', 'ACCOUNTS_REJECTED', 'HR_REJECTED'];
    if (!EDITABLE_STATUSES.includes(claim.status)) {
      return res.status(400).json({
        success: false,
        message: 'Only draft or rejected claims can be edited. Pending or paid claims cannot be modified.',
      });
    }

    const requesterIsOwner = String(claim.submittedBy) === String(req.user._id);
    const isStaff = ['admin', 'superadmin', 'company_admin', 'companyadmin', 'super_admin', 'tcsa1', 'hr', 'hr_admin', 'accounts', 'account_admin', 'finance', 'tcacc1'].some(
      r => String(r).toLowerCase() === String(req.user.role || '').toLowerCase() || String(req.user.roleCode || '').toLowerCase() === String(r).toLowerCase()
    );
    if (!requesterIsOwner && !isStaff) {
      return res.status(403).json({ success: false, message: 'Only the claim owner can edit this claim.' });
    }

    const companyId = req.tenant?.companyId || req.companyId || claim.companyId;
    const policy = await getActivePolicy(companyId);
    if (!policy) return res.status(400).json({ success: false, message: 'No active expense policy.' });

    const body = req.body || {};
    const trip = body.trip || {};
    const defaultDays = calculateDaysBetween(trip.startDate, trip.endDate);
    const employeeClaimsInput = body.employeeClaims || [];

    if (!Array.isArray(employeeClaimsInput) || employeeClaimsInput.length === 0) {
      return res.status(400).json({ success: false, message: 'At least one employee claim is required.' });
    }

    const getRawEmployeeId = (val) => {
      if (!val) return null;
      if (typeof val === 'object') return val._id ? String(val._id) : (val.employeeId ? String(val.employeeId) : null);
      return String(val);
    };

    const employeeIds = employeeClaimsInput.map(ec => getRawEmployeeId(ec.employeeId)).filter(Boolean);
    const employees = await User.find({ _id: { $in: employeeIds } })
      .populate('levelRef')
      .populate('gradeRef')
      .lean();
    const employeesById = {};
    employees.forEach(e => { employeesById[e._id.toString()] = e; });

    const destinationClass = await resolveCityClass(companyId, trip.destination || body.destination || body.city || '');
    const types = await getExpenseTypes(companyId);
    const entitlements = await getEntitlements(companyId, policy._id, types.map(t => t.code), destinationClass);

    const isSharedLodgingClaim = !!body.isSharedLodging || (
      (body.claimType === 'LODGING' || employeeClaimsInput.some(ec => (ec.items || []).some(it => it.expenseType === 'LODGING')))
      && employees.length >= 2
    );

    let sharedHigherEnt = null;
    let sharedLowerEnt = null;
    if (isSharedLodgingClaim && employees.length >= 2) {
      const lodgingEnts = employees.map(emp => {
        const ln = getEmployeeLevelNumber(emp);
        const gc = getEmployeeGradeCode(emp);
        const ent = findEntitlement(entitlements, ln, gc, destinationClass, 'LODGING');
        return ent ? ent.amount : 0;
      }).sort((a, b) => b - a);

      sharedHigherEnt = lodgingEnts[0] || 0;
      sharedLowerEnt = lodgingEnts.length > 1 ? lodgingEnts[1] : lodgingEnts[0] || 0;
    }

    const employeeClaims = [];
    for (const ec of employeeClaimsInput) {
      const rawEmpId = getRawEmployeeId(ec.employeeId);
      const emp = employeesById[rawEmpId];
      if (!emp) {
        return res.status(400).json({ success: false, message: `Employee ${ec.employeeId} not found in this company.` });
      }
      const levelNumber = getEmployeeLevelNumber(emp);
      const gradeCode = getEmployeeGradeCode(emp);

      const isLodgingItem = body.claimType === 'LODGING' || (ec.items || []).some(i => i.expenseType === 'LODGING');
      const items = await calculateEmployeeItems({
        items: ec.items || [],
        employeeLevelNumber: levelNumber,
        employeeGradeCode: gradeCode,
        entitlements,
        cityClass: destinationClass,
        policy,
        defaultDays,
        isSharedLodgingClaim,
        sharedHigherEnt: isLodgingItem && isSharedLodgingClaim ? (ec.sharedLodgingHigherEntitlement ?? sharedHigherEnt) : null,
        sharedLowerEnt: isLodgingItem && isSharedLodgingClaim ? (ec.sharedLodgingLowerEntitlement ?? sharedLowerEnt) : null,
      });

      const requestedTotal = round2(items.reduce((s, i) => s + (i.requestedAmount || 0), 0));
      const allowedTotal = round2(items.reduce((s, i) => s + (i.allowedAmount || 0), 0));
      const excessTotal = round2(items.reduce((s, i) => s + (i.excessAmount || 0), 0));

      employeeClaims.push({
        employee: {
          employeeId: emp._id,
          name: emp.name,
          employeeIdCode: emp.employeeIdCode,
          department: emp.department,
          levelName: emp.levelRef?.name || '',
          levelNumber,
          levelRef: emp.levelRef?._id || null,
          gradeCode,
          gradeRef: emp.gradeRef?._id || null,
          role: emp.role,
        },
        claimedBy: req.user._id,
        items,
        requestedTotal,
        allowedTotal,
        excessTotal,
        itemCount: items.length,
      });
    }

    const grandRequested = round2(employeeClaims.reduce((s, c) => s + c.requestedTotal, 0));
    const grandAllowed = round2(employeeClaims.reduce((s, c) => s + c.allowedTotal, 0));
    const grandExcess = round2(employeeClaims.reduce((s, c) => s + c.excessTotal, 0));

    claim.claimType = body.claimType || (employeeClaimsInput[0]?.items?.[0]?.expenseType) || claim.claimType || '';
    claim.employeeClaims = employeeClaims;
    claim.employeeCount = employeeClaims.length;
    claim.trip = {
      customerName: trip.customerName || '',
      purpose: trip.purpose || '',
      destination: trip.destination || '',
      destinationClass,
      startDate: trip.startDate || null,
      endDate: trip.endDate || null,
      travelMode: trip.travelMode || '',
      tourSanctioned: trip.tourSanctioned !== false,
    };
    claim.grandRequested = grandRequested;
    claim.grandAllowed = grandAllowed;
    claim.grandExcess = grandExcess;
    claim.status = 'DRAFT'; // Reset to draft when edited so employee can resubmit

    claim.timeline.push({
      action: 'UPDATED',
      description: `Claim modified/updated by ${req.user.name || 'employee'}. Status reset to Draft.`,
      user: req.user._id,
      timestamp: new Date(),
    });

    await claim.save();

    await AUDIT.log({
      req,
      action: 'CLAIM_UPDATED',
      claim,
      description: `Claim ${claim.claimNumber} updated and ready for submission.`,
      metadata: { grandRequested, grandAllowed, grandExcess },
    });

    res.json({ success: true, data: claim });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * POST /api/expense/claims/:id/submit
 * Validate + submit. Routes per approval switch:
 *  approvalRequired=false -> SUBMITTED -> ACCOUNTS_PENDING
 *  approvalRequired=true  -> SUBMITTED -> HR_PENDING -> ACCOUNTS_PENDING
 *  If previously ACCOUNTS_REJECTED -> routes directly to ACCOUNTS_PENDING (no HR queue)
 */
exports.submitClaim = async (req, res) => {
  try {
    const claim = await ExpenseClaim.findById(req.params.id);
    if (!claim) return res.status(404).json({ success: false, message: 'Claim not found' });

    const SUBMITTABLE_STATUSES = ['DRAFT', 'RETURNED', 'REJECTED', 'ACCOUNTS_REJECTED', 'HR_REJECTED'];
    if (!SUBMITTABLE_STATUSES.includes(claim.status)) {
      return res.status(400).json({ success: false, message: `Claim is already ${claim.status}.` });
    }

    const requesterIsOwner = String(claim.submittedBy) === String(req.user._id);
    const isStaff = ['admin', 'superadmin', 'company_admin', 'companyadmin', 'super_admin', 'tcsa1', 'hr', 'hr_admin', 'accounts', 'account_admin', 'finance', 'tcacc1'].some(
      r => String(r).toLowerCase() === String(req.user.role || '').toLowerCase() || String(req.user.roleCode || '').toLowerCase() === String(r).toLowerCase()
    );
    if (!requesterIsOwner && !isStaff) {
      return res.status(403).json({ success: false, message: 'Only the claim owner can submit this claim.' });
    }

    // Re-run validation (never auto-reject because requested > allowed)
    const validation = [];
    const totalItemsCount = (claim.employeeClaims || []).reduce((sum, ec) => sum + (ec.items?.length || 0), 0);
    if (totalItemsCount === 0) {
      validation.push('Claim must contain at least one expense item.');
    }

    claim.employeeClaims.forEach((ec, idx) => {
      (ec.items || []).forEach((item, iIdx) => {
        if (!item.expenseType) validation.push(`Employee #${idx + 1} item #${iIdx + 1} missing expense type.`);
        if (!item.requestedAmount || Number(item.requestedAmount) <= 0) {
          validation.push(`Employee #${idx + 1} item #${iIdx + 1} amount must be greater than 0.`);
        }
      });
    });

    if (validation.length > 0) {
      return res.status(400).json({ success: false, message: 'Validation failed', validation });
    }

    // Dynamically evaluate company-level active policy
    const activePolicy = await getActivePolicy(claim.companyId);
    
    // By default, check if the particular company has chosen HR approval to be enabled (true/false)
    let hrApprovalRequired = activePolicy ? Boolean(activePolicy.approvalRequired) : false;

    // Check if the company has a company-scoped custom ApprovalWorkflow for Expense
    const customExpenseWorkflow = await ApprovalWorkflow.findOne({
      module: { $regex: /^expense$/i },
      status: 'active',
      $or: [
        { company: claim.companyId },
        { companyId: claim.companyId },
      ]
    }).sort({ priorityOrder: 1 }).lean();

    if (customExpenseWorkflow && Array.isArray(customExpenseWorkflow.steps) && customExpenseWorkflow.steps.length > 0) {
      const hasHrStep = customExpenseWorkflow.steps.some(st => 
        (st.approverRule && ['HR_ADMIN', 'HR', 'HR ADMIN'].includes(st.approverRule.toUpperCase())) ||
        (st.approverType && ['HR_ADMIN', 'HR', 'HR ADMIN'].includes(st.approverType.toUpperCase()))
      );
      if (activePolicy && activePolicy.approvalRequired !== undefined) {
        hrApprovalRequired = Boolean(activePolicy.approvalRequired);
      } else {
        hrApprovalRequired = hasHrStep;
      }
    }

    claim.status = 'SUBMITTED';

    // Route according to company HR approval requirement
    if (hrApprovalRequired) {
      claim.status = 'HR_PENDING';
      claim.approvalFlow = 'HR';
      claim.approvalRequired = true;
    } else {
      claim.status = 'ACCOUNTS_PENDING';
      claim.approvalFlow = 'NONE';
      claim.approvalRequired = false;
    }

    claim.submittedAt = new Date();
    claim.timeline.push({
      action: claim.status,
      description: claim.status === 'HR_PENDING'
        ? 'Claim submitted. HR approval required before Accounts disbursement.'
        : 'Claim submitted. Routed directly to Accounts for payment / verification.',
      user: req.user._id,
      timestamp: new Date(),
    });

    await claim.save();

    await AUDIT.log({
      req,
      action: claim.status === 'HR_PENDING' ? 'CLAIM_SUBMITTED_HR' : 'CLAIM_SUBMITTED_ACCOUNTS',
      claim,
      description: `Claim ${claim.claimNumber} submitted -> ${claim.status}.`,
      metadata: { grandRequested: claim.grandRequested, grandAllowed: claim.grandAllowed, grandExcess: claim.grandExcess, hrApprovalRequired },
    });

    res.json({ success: true, data: claim });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * GET /api/expense/claims/my — convenience list for the login user.
 */
exports.myClaims = async (req, res) => {
  try {
    const companyId = await resolveTenantCompanyId(req);
    const filter = {
      $or: [
        { submittedBy: req.user._id },
        { 'employeeClaims.employee.employeeId': req.user._id, status: { $ne: 'DRAFT' } },
      ],
    };
    if (companyId) filter.companyId = companyId;
    const claims = await ExpenseClaim.find(filter)
      .populate('submittedBy', 'name employeeIdCode department')
      .populate('employeeClaims.employee.employeeId', 'name employeeIdCode department')
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    const claimsWithShare = claims.map(c => {
      const isApplicant = String(c.submittedBy?._id || c.submittedBy) === String(req.user._id);
      let userRequested = 0;
      let userAllowed = 0;
      let userExcess = 0;
      let isLodgingCoveredByOther = false;

      const myEc = (c.employeeClaims || []).find(ec => {
        const empId = ec.employee?.employeeId?._id || ec.employee?.employeeId;
        return String(empId) === String(req.user._id);
      });

      if (isApplicant) {
        userRequested = c.grandRequested || 0;
        userAllowed = c.grandAllowed || 0;
        userExcess = c.grandExcess || 0;
      } else if (myEc) {
        const nonLodgingItems = (myEc.items || []).filter(it => String(it.expenseType || '').toUpperCase() !== 'LODGING');
        userRequested = round2(nonLodgingItems.reduce((s, i) => s + (i.requestedAmount || 0), 0));
        userAllowed = round2(nonLodgingItems.reduce((s, i) => s + (i.allowedAmount || 0), 0));
        userExcess = round2(nonLodgingItems.reduce((s, i) => s + (i.excessAmount || 0), 0));
        
        const isLodgingClaim = c.claimType === 'LODGING' || (myEc.items || []).some(it => String(it.expenseType || '').toUpperCase() === 'LODGING');
        if (isLodgingClaim && nonLodgingItems.length === 0) {
          isLodgingCoveredByOther = true;
        }
      }

      return {
        ...c,
        isApplicant,
        userRequested,
        userAllowed,
        userExcess,
        isLodgingCoveredByOther,
      };
    });

    res.json({ success: true, data: claimsWithShare });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * DELETE /api/expense/claims/:id — Delete draft or rejected claim
 */
exports.deleteClaim = async (req, res) => {
  try {
    const claim = await ExpenseClaim.findById(req.params.id);
    if (!claim) {
      return res.status(404).json({ success: false, message: 'Claim not found.' });
    }

    const DELETABLE_STATUSES = ['DRAFT', 'RETURNED', 'REJECTED', 'ACCOUNTS_REJECTED', 'HR_REJECTED', 'CANCELLED'];
    if (!DELETABLE_STATUSES.includes(claim.status)) {
      return res.status(400).json({
        success: false,
        message: `Only draft or rejected claims can be deleted. Current status: ${claim.status}`,
      });
    }

    const isOwner = String(claim.submittedBy) === String(req.user._id);
    const isAdmin = ['admin', 'superadmin', 'Super Admin', 'Admin', 'hr', 'accounts'].includes(req.user.role);
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ success: false, message: 'Not authorized to delete this claim.' });
    }

    const claimNumber = claim.claimNumber;
    await claim.deleteOne();

    await AUDIT.log({
      req,
      action: 'CLAIM_DELETED',
      claim: { _id: req.params.id, claimNumber, companyId: claim.companyId },
      description: `Claim ${claimNumber} deleted by ${req.user.name || req.user.email || req.user._id}.`,
      metadata: { deletedStatus: claim.status },
    });

    res.json({ success: true, message: 'Claim deleted successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
