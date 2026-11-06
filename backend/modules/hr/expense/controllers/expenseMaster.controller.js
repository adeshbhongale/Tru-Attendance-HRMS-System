const mongoose = require('mongoose');
const ExpensePolicy = require('../models/ExpensePolicy');
const ExpenseClaim = require('../models/ExpenseClaim');
const ExpenseType = require('../models/ExpenseType');
const CityClassification = require('../models/CityClassification');
const ExpenseEntitlement = require('../models/ExpenseEntitlement');
const TravelMode = require('../models/TravelMode');
const User = require('../../../../models/User');
const Company = require('../../../../models/Company');
const Level = require('../../../../models/Level');
const Grade = require('../../../../models/Grade');
const Designation = require('../../../../models/Designation');
const { ensureExpenseMasters, ensureEntitlementIndexes } = require('../services/seedExpenseMasters');
const { getActivePolicy, resolveCityClass, getExpenseTypes } = require('../services/policyEngine');

const access = require('../services/expenseAccess');
const { parseRelativeStayPercent } = require('../services/claimRules');

// Trusted company: tenant middleware value (only global users may pick another company).
const resolveTenantCompanyId = async (req) => {
  let companyId = access.resolveCompanyId(req);
  if (!companyId && access.isSuperAdmin(req.user)) {
    const firstComp = await Company.findOne({ status: { $nin: ['SUSPENDED', 'INACTIVE', 'inactive'] } }).select('_id');
    if (firstComp) companyId = firstComp._id;
  }
  return companyId;
};

// Master documents may only be changed inside the caller's company.
const ownsDoc = async (req, doc) => {
  if (!doc) return false;
  const docComp = doc.companyId?._id || doc.companyId || doc.company?._id || doc.company || null;
  const callerComp = await resolveTenantCompanyId(req);
  return String(docComp || '') === String(callerComp || '');
};

const num = (v, min, max, d) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return d;
  return Math.min(max, Math.max(min, n));
};

/** Whitelisted + range-checked Super Admin claim settings. */
function sanitizePolicyRules(body) {
  const out = {};
  if (body.claimRules && typeof body.claimRules === 'object') {
    const c = body.claimRules;
    out.claimRules = {
      remarkMinLength: num(c.remarkMinLength, 0, 200, 5),
      remarkMaxLength: num(c.remarkMaxLength, 20, 2000, 500),
      maxEmployeesPerClaim: num(c.maxEmployeesPerClaim, 1, 100, 20),
      allowFutureDates: !!c.allowFutureDates,
      maxLodgingNights: num(c.maxLodgingNights, 1, 365, 30),
      deadlineOverrideAllowed: c.deadlineOverrideAllowed !== false,
    };
  }
  if (body.receiptRules && typeof body.receiptRules === 'object') {
    const r = body.receiptRules;
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'];
    const mimes = Array.isArray(r.allowedMimeTypes) ? r.allowedMimeTypes.filter((m) => allowedTypes.includes(m)) : [];
    out.receiptRules = {
      required: r.required !== false,
      maxFiles: num(r.maxFiles, 1, 30, 10),
      maxFileSizeMb: num(r.maxFileSizeMb, 1, 25, 10),
      allowedMimeTypes: mimes.length ? mimes : allowedTypes,
    };
  }
  if (body.fullPaymentRules && typeof body.fullPaymentRules === 'object') {
    const f = body.fullPaymentRules;
    out.fullPaymentRules = {
      enabled: f.enabled !== false,
      approvalRequired: f.approvalRequired !== false,
      proofRequired: f.proofRequired !== false,
    };
  }
  if (Array.isArray(body.deadlineRules)) {
    out.deadlineRules = body.deadlineRules.slice(0, 10).map((r) => ({
      ruleName: String(r.ruleName || '').slice(0, 100),
      days: num(r.days, 0, 365, 3),
      action: r.action === 'blocking' ? 'blocking' : 'warning',
      description: String(r.description || '').slice(0, 300),
    }));
  }
  if (Array.isArray(body.approvalLimitRules)) {
    out.approvalLimitRules = body.approvalLimitRules
      .filter((r) => r && String(r.roleName || '').trim())
      .slice(0, 50)
      .map((r) => {
        const roleName = String(r.roleName || '').trim().slice(0, 100);
        const roleKey = String(r.roleKey || roleName)
          .trim()
          .toUpperCase()
          .replace(/[^A-Z0-9]+/g, '_')
          .replace(/^_+|_+$/g, '')
          .slice(0, 50);
        const levelId = r.levelId && mongoose.Types.ObjectId.isValid(String(r.levelId))
          ? new mongoose.Types.ObjectId(String(r.levelId))
          : null;
        const rawLvl = r.levelNumber !== undefined && r.levelNumber !== null && r.levelNumber !== ''
          ? Number(r.levelNumber)
          : null;
        const levelNumber = Number.isFinite(rawLvl) && rawLvl > 0 ? Math.round(rawLvl) : null;
        const rawMin = r.minAmount !== undefined && r.minAmount !== null && r.minAmount !== ''
          ? Number(r.minAmount)
          : 0;
        const minAmount = Number.isFinite(rawMin) && rawMin >= 0 ? Math.round(rawMin * 100) / 100 : 0;
        const rawMax = r.maxAmount !== undefined && r.maxAmount !== null && r.maxAmount !== ''
          ? Number(r.maxAmount)
          : null;
        const maxAmount = rawMax !== null && Number.isFinite(rawMax) && rawMax >= 0
          ? Math.round(rawMax * 100) / 100
          : null;
        return {
          ...(r._id && mongoose.Types.ObjectId.isValid(String(r._id)) ? { _id: r._id } : {}),
          roleName,
          roleKey,
          levelId,
          levelNumber,
          minAmount,
          maxAmount,
          description: String(r.description || '').trim().slice(0, 300),
          status: r.status === 'inactive' ? 'inactive' : 'active',
        };
      });
  }
  if (body.payLimitConfig && typeof body.payLimitConfig === 'object') {
    const p = body.payLimitConfig;
    const applicableClaimTypes = Array.isArray(p.applicableClaimTypes)
      ? [...new Set(p.applicableClaimTypes.map((c) => String(c || '').trim().toUpperCase()).filter(Boolean))]
      : ['OTHER'];
    out.payLimitConfig = {
      enabled: p.enabled !== false,
      applicableClaimTypes,
    };
  }
  if (body.cfoApprovalConfig && typeof body.cfoApprovalConfig === 'object') {
    const cf = body.cfoApprovalConfig;
    const applicableClaimTypes = Array.isArray(cf.applicableClaimTypes)
      ? [...new Set(cf.applicableClaimTypes.map((c) => String(c || '').trim().toUpperCase()).filter(Boolean))]
      : ['STOCK_PURCHASE'];
    out.cfoApprovalConfig = {
      enabled: cf.enabled !== false,
      applyOnFullPayment: cf.applyOnFullPayment !== false,
      applicableClaimTypes,
    };
  }
  return out;
}

/** Per-type claim behaviour configured by Super Admin. */
function sanitizeTypeRules(body) {
  const out = {};
  if (['NORMAL', 'LODGING'].includes(body.claimMode)) out.claimMode = body.claimMode;
  if (body.sameDateLimit !== undefined && body.sameDateLimit !== '') out.sameDateLimit = num(body.sameDateLimit, 0, 50, 0);
  if (body.allowOverlap !== undefined) out.allowOverlap = !!body.allowOverlap;
  if (body.maxClaimAmount !== undefined && body.maxClaimAmount !== '') out.maxClaimAmount = num(body.maxClaimAmount, 0, 10000000, 0);
  if (body.requiresOutstation !== undefined) out.requiresOutstation = !!body.requiresOutstation;
  if (body.payLimitEnabled !== undefined) out.payLimitEnabled = !!body.payLimitEnabled;
  if (body.cfoApprovalRequired !== undefined) out.cfoApprovalRequired = !!body.cfoApprovalRequired;
  if (body.managerApprovalRequired !== undefined) out.managerApprovalRequired = !!body.managerApprovalRequired;
  return out;
}

async function syncCompanyRuleFlagsFromPolicy(companyId, policy) {
  if (!companyId || !policy) return;
  try {
    if (policy.payLimitConfig && Array.isArray(policy.payLimitConfig.applicableClaimTypes)) {
      const payTypes = policy.payLimitConfig.applicableClaimTypes.map((c) => String(c || '').trim().toUpperCase()).filter(Boolean);
      await ExpenseType.updateMany({ companyId, code: { $in: payTypes } }, { $set: { payLimitEnabled: true } });
      await ExpenseType.updateMany({ companyId, code: { $nin: payTypes } }, { $set: { payLimitEnabled: false } });
    }
    if (policy.cfoApprovalConfig && Array.isArray(policy.cfoApprovalConfig.applicableClaimTypes)) {
      const cfoTypes = policy.cfoApprovalConfig.applicableClaimTypes.map((c) => String(c || '').trim().toUpperCase()).filter(Boolean);
      await ExpenseType.updateMany({ companyId, code: { $in: cfoTypes } }, { $set: { cfoApprovalRequired: true } });
      await ExpenseType.updateMany({ companyId, code: { $nin: cfoTypes } }, { $set: { cfoApprovalRequired: false } });
      const ExpenseFinanceHead = mongoose.models.ExpenseFinanceHead || require('../models/ExpenseFinanceHead');
      await ExpenseFinanceHead.updateOne(
        { companyId },
        {
          $set: {
            applyOnFullPayment: policy.cfoApprovalConfig.applyOnFullPayment !== false,
            applicableClaimTypes: cfoTypes,
          },
        }
      );
    }
  } catch (_) {
    // Non-fatal sync
  }
}

async function syncPolicyFromTypeRuleFlags(companyId, typeDoc, body = {}) {
  if (!companyId || !typeDoc) return;
  if (body.payLimitEnabled === undefined && body.cfoApprovalRequired === undefined) return;
  try {
    const code = String(typeDoc.code || '').trim().toUpperCase();
    if (!code) return;
    const activePol =
      (await ExpensePolicy.findOne({ companyId, status: 'active' }).sort({ createdAt: -1 })) ||
      (await ExpensePolicy.findOne({ companyId }).sort({ createdAt: -1 }));
    if (activePol) {
      if (body.payLimitEnabled !== undefined) {
        const cur = Array.isArray(activePol.payLimitConfig?.applicableClaimTypes)
          ? [...activePol.payLimitConfig.applicableClaimTypes]
          : ['OTHER'];
        const next = body.payLimitEnabled
          ? [...new Set([...cur, code])]
          : cur.filter((c) => String(c).toUpperCase() !== code);
        activePol.payLimitConfig = {
          enabled: activePol.payLimitConfig?.enabled !== false,
          applicableClaimTypes: next,
        };
      }
      if (body.cfoApprovalRequired !== undefined) {
        const cur = Array.isArray(activePol.cfoApprovalConfig?.applicableClaimTypes)
          ? [...activePol.cfoApprovalConfig.applicableClaimTypes]
          : ['STOCK_PURCHASE'];
        const next = body.cfoApprovalRequired
          ? [...new Set([...cur, code])]
          : cur.filter((c) => String(c).toUpperCase() !== code);
        activePol.cfoApprovalConfig = {
          enabled: activePol.cfoApprovalConfig?.enabled !== false,
          applyOnFullPayment: activePol.cfoApprovalConfig?.applyOnFullPayment !== false,
          applicableClaimTypes: next,
        };
        const ExpenseFinanceHead = mongoose.models.ExpenseFinanceHead || require('../models/ExpenseFinanceHead');
        await ExpenseFinanceHead.updateOne(
          { companyId },
          { $set: { applicableClaimTypes: next } }
        );
      }
      await activePol.save();
    }
  } catch (_) {
    // Non-fatal sync
  }
}

const RATE_KEYS = ['', 'twoWheeler', 'car', 'eBike', 'eCar'];
const toCode = (v) => String(v || '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 50);

/**
 * Vehicle Type configuration: the subtypes of a travel mode. Ids are preserved (matched by _id,
 * then by code). Subtypes removed by the Admin are deleted from the mode's subtype list.
 */
function sanitizeSubtypes(list, existing = []) {
  if (!Array.isArray(list)) return { subtypes: undefined };
  const out = [];
  const codes = new Set();
  const used = new Set();
  for (const [i, s] of list.slice(0, 50).entries()) {
    const name = String(s?.name || '').trim().slice(0, 100);
    if (!name) return { error: `Subtype #${i + 1}: name is required.` };
    const code = toCode(s.code || name);
    if (!code) return { error: `Subtype "${name}": code is required.` };
    if (codes.has(code)) return { error: `Duplicate subtype code ${code}.` };
    codes.add(code);
    const prev = (s._id && existing.find((e) => String(e._id) === String(s._id))) || existing.find((e) => e.code === code && !used.has(String(e._id)));
    if (prev) used.add(String(prev._id));
    const workflow = s.workflow === 'KM_RATE' ? 'KM_RATE' : 'STANDARD';
    const rawRateKey = s.conveyanceRateKey ?? s.rateKey ?? prev?.conveyanceRateKey ?? '';
    const conveyanceRateKey = RATE_KEYS.includes(rawRateKey) ? rawRateKey : '';
    const rawRate = s.ratePerKm !== undefined && s.ratePerKm !== null && s.ratePerKm !== '' ? Number(s.ratePerKm) : null;
    const ratePerKm = Number.isFinite(rawRate) && rawRate > 0 ? Math.round(rawRate * 100) / 100 : null;
    out.push({
      ...(prev ? { _id: prev._id } : {}),
      code,
      name,
      workflow,
      photosRequired: workflow === 'KM_RATE' ? s.photosRequired !== false : false,
      conveyanceRateKey,
      ratePerKm,
      status: s.status === 'inactive' ? 'inactive' : 'active',
      order: Number.isFinite(Number(s.order)) ? Number(s.order) : i + 1,
    });
  }
  return { subtypes: out };
}

/** null / '' = actuals (no cap); otherwise a non-negative amount. Returns undefined when invalid. */
function parseMaxAmount(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= 10000000 ? Math.round(n * 100) / 100 : undefined;
}

/**
 * Level Entitlements — TRAVEL row fields, validated against the company's real TravelMode and
 * subtype records (never a free-text list). Returns { fields } or { error }.
 */
async function buildTravelEntitlementFields(companyId, body, current = null) {
  const modeId = body.travelModeId !== undefined ? body.travelModeId : current?.travelModeId;
  if (!modeId || !mongoose.Types.ObjectId.isValid(String(modeId))) return { error: 'Please select the travel mode for this entitlement.' };
  const mode = await TravelMode.findOne({ _id: modeId, companyId }).lean();
  if (!mode) return { error: 'The selected travel mode does not exist in this company.' };
  const modeSubtypes = Array.isArray(mode.subtypes) ? mode.subtypes : [];

  let allowedSubtypes = current?.allowedSubtypes || [];
  if (body.allowedSubtypes !== undefined) {
    if (!Array.isArray(body.allowedSubtypes)) return { error: 'allowedSubtypes must be a list.' };
    allowedSubtypes = [];
    const seen = new Set();
    for (const a of body.allowedSubtypes) {
      const sid = String(a?.subtypeId || a?._id || '');
      const scode = String(a?.code || a?.subtypeCode || '').trim().toUpperCase();
      const st = modeSubtypes.find(
        (s) => (sid && String(s._id) === sid) || (scode && String(s.code || '').toUpperCase() === scode)
      );
      if (!st) return { error: `A selected subtype does not belong to ${mode.name}.` };
      const stIdStr = String(st._id);
      if (seen.has(stIdStr)) continue;
      seen.add(stIdStr);
      const maxAmount = parseMaxAmount(a.maxAmount);
      if (maxAmount === undefined) return { error: `Invalid maximum amount for ${st.name}.` };
      allowedSubtypes.push({ subtypeId: st._id, code: st.code, name: st.name, maxAmount });
    }
  }
  let maxAmount = current ? (current.maxAmount ?? null) : null;
  if (body.maxAmount !== undefined) {
    maxAmount = parseMaxAmount(body.maxAmount);
    if (maxAmount === undefined) return { error: 'Invalid maximum amount.' };
  }
  return {
    fields: {
      travelModeId: mode._id,
      travelModeCode: mode.code,
      travelModeName: mode.name,
      allowedSubtypes,
      maxAmount,
      amount: maxAmount || 0,
      unit: 'per_item',
      ruleCode: 'TRAVEL_ENTITLEMENT',
      formula: 'MIN(claimed, entitlement); not entitled -> excess',
    },
  };
}

/**
 * GET /api/expense/policies — all policies for the company
 */
exports.listPolicies = async (req, res) => {
  try {
    const companyId = await resolveTenantCompanyId(req);
    await ensureExpenseMasters(companyId);
    const policies = await ExpensePolicy.find({ companyId }).sort({ createdAt: -1 }).lean();
    res.json({ success: true, data: policies });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * GET /api/expense/policies/active
 */
exports.getActivePolicy = async (req, res) => {
  try {
    const companyId = await resolveTenantCompanyId(req);
    const policy = await getActivePolicy(companyId) || await ensureExpenseMasters(companyId);
    if (!policy) return res.status(404).json({ success: false, message: 'No active policy configured.' });
    const polObj = policy.toObject ? policy.toObject() : { ...policy };
    try {
      const uid = req.user?._id || req.user?.id;
      let effectiveUser = req.user;
      if (uid && mongoose.Types.ObjectId.isValid(String(uid))) {
        const empDoc = await User.findById(uid)
          .select('name employeeIdCode department designation role roleCode roleLevel isTeamLead levelRef levelNumber companyId')
          .populate('levelRef', 'name code category levelNumber canManageTeam canApprove')
          .lean();
        if (empDoc) {
          effectiveUser = { ...req.user, ...empDoc, levelRef: empDoc.levelRef || req.user?.levelRef };
        }
      }
      const { resolveDirectAccountLimit } = require('../services/approverService');
      polObj.directAccountLimit = resolveDirectAccountLimit(effectiveUser, polObj.approvalLimitRules || []);
    } catch (_) {
      // Non-fatal
    }
    res.json({ success: true, data: polObj });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * POST /api/expense/policies
 */
exports.createPolicy = async (req, res) => {
  try {
    const companyId = await resolveTenantCompanyId(req);
    const body = req.body || {};
    if (!body.name || !body.code) return res.status(400).json({ success: false, message: 'Policy name and code are required.' });
    let relativeStayPercent = 50;
    if (body.relativeStayPercent !== undefined && body.relativeStayPercent !== '') {
      const pct = parseRelativeStayPercent(body.relativeStayPercent);
      if (pct === null) {
        return res.status(400).json({ success: false, message: 'Relative Stay Allowance Percentage must be a number from 0 to 100.' });
      }
      relativeStayPercent = pct;
    }

    // Only one active policy can apply per company
    if (body.status === 'active') {
      await ExpensePolicy.updateMany(
        { companyId, status: 'active' },
        { $set: { status: 'inactive' } }
      );
    }

    const policy = await ExpensePolicy.create({
      companyId,
      company: companyId,
      name: body.name,
      code: body.code.toUpperCase(),
      description: body.description || '',
      version: body.version || '1.0',
      policyVersion: body.version || '1.0',
      status: body.status || 'draft',
      effectiveFrom: body.effectiveFrom || null,
      effectiveTo: body.effectiveTo || null,
      approvalRequired: !!body.approvalRequired,
      approvalEngine: body.approvalEngine || (body.approvalRequired ? 'HR' : 'NONE'),
      sharedLodgingRule: body.sharedLodgingRule || 'HIGHER_PLUS_LOWER',
      sharedLodgingPercent: body.sharedLodgingPercent !== undefined && body.sharedLodgingPercent !== '' ? Number(body.sharedLodgingPercent) : 75,
      relativeStayPercent,
      lodgingRules: body.lodgingRules,
      conveyanceRates: body.conveyanceRates,
      localTravelFoodAllowed: body.localTravelFoodAllowed,
      deadlineRules: body.deadlineRules || [],
      sharedLodgingConfig: body.sharedLodgingConfig,
      ...sanitizePolicyRules(body),
      createdBy: req.user?._id || null,
    });
    if (body.payLimitConfig || body.cfoApprovalConfig) {
      await syncCompanyRuleFlagsFromPolicy(companyId, policy);
    }
    res.status(201).json({ success: true, data: policy });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * PUT /api/expense/policies/:id
 */
exports.updatePolicy = async (req, res) => {
  try {
    const policy = await ExpensePolicy.findById(req.params.id);
    if (!policy || !(await ownsDoc(req, policy))) return res.status(404).json({ success: false, message: 'Policy not found' });
    const allowed = [
      'name', 'description', 'version', 'policyVersion', 'status',
      'effectiveFrom', 'effectiveTo', 'approvalRequired', 'approvalEngine',
      'sharedLodgingRule', 'sharedLodgingPercent', 'lodgingRules', 'conveyanceRates',
      'localTravelFoodAllowed', 'sharedLodgingConfig',
    ];
    allowed.forEach(k => {
      if (req.body[k] !== undefined) policy[k] = req.body[k];
    });
    Object.assign(policy, sanitizePolicyRules(req.body || {}));
    // Lodging Policy — Stay with Relative (strictly validated, never clamped)
    let relativeStayChange = null;
    if (req.body.relativeStayPercent !== undefined) {
      const pct = parseRelativeStayPercent(req.body.relativeStayPercent);
      if (pct === null) {
        return res.status(400).json({ success: false, message: 'Relative Stay Allowance Percentage must be a number from 0 to 100.' });
      }
      if (pct !== policy.relativeStayPercent) relativeStayChange = { relativeStayPercent: policy.relativeStayPercent ?? null };
      policy.relativeStayPercent = pct;
    }
    if (req.body.approvalRequired !== undefined) {
      policy.approvalEngine = req.body.approvalRequired ? 'HR' : 'NONE';
    }

    // Only one active policy can apply per company
    if (policy.status === 'active') {
      const companyId = policy.companyId || (await resolveTenantCompanyId(req));
      await ExpensePolicy.updateMany(
        { companyId, _id: { $ne: policy._id }, status: 'active' },
        { $set: { status: 'inactive' } }
      );
    }

    await policy.save();
    if (req.body?.payLimitConfig || req.body?.cfoApprovalConfig) {
      await syncCompanyRuleFlagsFromPolicy(policy.companyId, policy);
    }
    if (relativeStayChange) {
      await access.audit({
        req,
        action: 'POLICY_RELATIVE_STAY_PERCENT_UPDATED',
        entity: 'ExpensePolicy',
        entityId: String(policy._id),
        claim: { companyId: policy.companyId },
        description: `Relative Stay Allowance Percentage changed from ${relativeStayChange.relativeStayPercent != null ? `${relativeStayChange.relativeStayPercent}%` : 'not set'} to ${policy.relativeStayPercent}% (policy ${policy.code} v${policy.version}).`,
        before: relativeStayChange,
        after: { relativeStayPercent: policy.relativeStayPercent },
        metadata: { policyId: String(policy._id), policyCode: policy.code, policyVersion: policy.version },
      });
    }
    res.json({ success: true, data: policy });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * POST /api/expense/policies/:id/publish
 */
exports.publishPolicy = async (req, res) => {
  try {
    const companyId = req.tenant?.companyId || req.companyId || (await resolveTenantCompanyId(req));
    const policy = await ExpensePolicy.findById(req.params.id);
    if (!policy || !(await ownsDoc(req, policy))) return res.status(404).json({ success: false, message: 'Policy not found' });

    // Deactivate ALL other active policies for this company (strictly only one active policy allowed)
    await ExpensePolicy.updateMany(
      { companyId, _id: { $ne: policy._id }, status: 'active' },
      { $set: { status: 'inactive' } }
    );

    policy.status = 'active';
    policy.effectiveFrom = policy.effectiveFrom || new Date();
    policy.publishedAt = new Date();
    policy.publishedBy = req.user?._id || null;
    await policy.save();

    res.json({ success: true, data: policy });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * DELETE /api/expense/policies/:id — delete/deactivate expense policy
 */
exports.deletePolicy = async (req, res) => {
  try {
    const policy = await ExpensePolicy.findById(req.params.id);
    if (!policy || !(await ownsDoc(req, policy))) return res.status(404).json({ success: false, message: 'Policy not found' });

    // Check if claims are linked to this policy
    const ExpenseClaim = require('../models/ExpenseClaim');
    const linkedClaimsCount = await ExpenseClaim.countDocuments({ policyId: policy._id });

    if (linkedClaimsCount > 0) {
      // If claims exist, mark as inactive to preserve audit integrity
      policy.status = 'inactive';
      await policy.save();
      return res.json({ success: true, message: 'Policy marked inactive (linked claims preserved)', data: policy });
    }

    // Otherwise permanently remove the policy
    await ExpensePolicy.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Policy deleted successfully', data: {} });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * GET /api/expense/types
 */
exports.getTypes = async (req, res) => {
  try {
    const companyId = await resolveTenantCompanyId(req);
    await ensureExpenseMasters(companyId);
    const types = await getExpenseTypes(companyId);
    res.json({ success: true, data: types });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * POST /api/expense/types — create expense type
 */
exports.createType = async (req, res) => {
  try {
    const companyId = await resolveTenantCompanyId(req);
    const body = req.body || {};
    if (!body.code || !body.name) {
      return res.status(400).json({ success: false, message: 'Type code and name are required.' });
    }
    const code = String(body.code).trim().toUpperCase();
    const existing = await ExpenseType.findOne({ companyId, code });
    if (existing) return res.status(400).json({ success: false, message: `Type ${code} already exists.` });

    const type = await ExpenseType.create({
      companyId,
      company: companyId,
      code,
      name: body.name,
      description: body.description || '',
      category: body.category || 'OTHER',
      fields: body.fields || [],
      calculationMethod: body.calculationMethod || 'ENTITLEMENT_CAP',
      proofRequired: body.proofRequired !== false,
      selfAttestationAllowed: body.selfAttestationAllowed !== false,
      hrApprovalRequired: !!body.hrApprovalRequired,
      eligibilityRule: body.eligibilityRule || '',
      status: body.status || 'active',
      order: Number(body.order) || 0,
      ...sanitizeTypeRules(body),
    });
    await syncPolicyFromTypeRuleFlags(companyId, type, body);
    res.status(201).json({ success: true, data: type });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * PUT /api/expense/types/:id — update expense type
 */
exports.updateType = async (req, res) => {
  try {
    const type = await ExpenseType.findById(req.params.id);
    if (!type || !(await ownsDoc(req, type))) return res.status(404).json({ success: false, message: 'Type not found' });
    const allowed = ['name', 'description', 'category', 'fields', 'calculationMethod', 'proofRequired', 'selfAttestationAllowed', 'hrApprovalRequired', 'eligibilityRule', 'status', 'order'];
    allowed.forEach(k => {
      if (req.body[k] !== undefined) type[k] = req.body[k];
    });
    Object.assign(type, sanitizeTypeRules(req.body || {}));
    await type.save();
    await syncPolicyFromTypeRuleFlags(type.companyId, type, req.body || {});
    res.json({ success: true, data: type });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * DELETE /api/expense/types/:id — delete expense type
 */
exports.deleteType = async (req, res) => {
  try {
    const type = await ExpenseType.findById(req.params.id);
    if (!type || !(await ownsDoc(req, type))) return res.status(404).json({ success: false, message: 'Type not found' });
    await ExpenseType.findByIdAndDelete(type._id);
    res.json({ success: true, data: type });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * GET /api/expense/cities?city= or /api/expense/cities/:city
 */
exports.resolveCity = async (req, res) => {
  try {
    const companyId = await resolveTenantCompanyId(req);
    const city = req.params.city || req.query.city || '';
    const cityClass = await resolveCityClass(companyId, city);
    res.json({ success: true, data: { city, cityClass } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * GET /api/expense/cities
 */
exports.listCities = async (req, res) => {
  try {
    const companyId = await resolveTenantCompanyId(req);
    await ensureExpenseMasters(companyId);
    const cities = await CityClassification.find({ companyId, status: 'active' }).lean();
    const priority = { 'A+': 1, 'A': 2, 'B': 3, 'C': 4 };
    cities.sort((a, b) => (priority[a.cityClass] || 99) - (priority[b.cityClass] || 99) || (a.city || '').localeCompare(b.city || ''));
    res.json({ success: true, data: cities });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * POST /api/expense/cities — create/upsert city classification
 */
exports.createCity = async (req, res) => {
  try {
    const companyId = await resolveTenantCompanyId(req);
    const body = req.body || {};
    const city = String(body.city || '').trim().toUpperCase();
    if (!city) return res.status(400).json({ success: false, message: 'City name is required.' });
    if (!['A+', 'A', 'B', 'C'].includes(body.cityClass)) {
      return res.status(400).json({ success: false, message: 'cityClass must be A+, A, B or C.' });
    }

    let doc = await CityClassification.findOne({ companyId, city });
    if (doc) {
      doc.cityClass = body.cityClass;
      doc.state = body.state || doc.state || '';
      if (Array.isArray(body.aliases)) doc.aliases = body.aliases;
      doc.status = body.status || 'active';
      await doc.save();
      return res.json({ success: true, data: doc });
    }

    doc = await CityClassification.create({
      companyId,
      company: companyId,
      city,
      cityClass: body.cityClass,
      state: body.state || '',
      aliases: Array.isArray(body.aliases) ? body.aliases : [],
      status: body.status || 'active',
    });
    res.status(201).json({ success: true, data: doc });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * PUT /api/expense/cities/:id — update city classification
 */
exports.updateCity = async (req, res) => {
  try {
    const city = await CityClassification.findById(req.params.id);
    if (!city || !(await ownsDoc(req, city))) return res.status(404).json({ success: false, message: 'City not found' });
    const allowed = ['city', 'cityClass', 'state', 'aliases', 'status'];
    allowed.forEach(k => {
      if (req.body[k] !== undefined) {
        if (k === 'city') {
          city[k] = String(req.body[k] || '').trim().toUpperCase();
        } else {
          city[k] = req.body[k];
        }
      }
    });
    await city.save();
    res.json({ success: true, data: city });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * DELETE /api/expense/cities/:id — delete city
 */
exports.deleteCity = async (req, res) => {
  try {
    const city = await CityClassification.findById(req.params.id);
    if (!city || !(await ownsDoc(req, city))) return res.status(404).json({ success: false, message: 'City not found' });
    await CityClassification.findByIdAndDelete(city._id);
    res.json({ success: true, data: city });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * GET /api/expense/levels — company-scoped hierarchy levels & designations
 */
exports.listLevels = async (req, res) => {
  try {
    const companyId = await resolveTenantCompanyId(req);
    if (!companyId) return res.json({ success: true, count: 0, data: [], designations: [] });
    const scopeFilter = { $or: [{ companyId }, { company: companyId }] };
    const [levels, designations, empRoles] = await Promise.all([
      Level.find({ ...scopeFilter, status: { $ne: 'inactive' } }).sort({ levelNumber: 1 }).lean(),
      Designation.find({ companyId, status: { $nin: ['inactive', 'INACTIVE'] } })
        .populate('level', 'name levelNumber category')
        .sort({ name: 1 })
        .lean()
        .catch(() => []),
      User.find({
        $and: [
          scopeFilter,
          { $or: [{ role: { $nin: ['superadmin', 'TCSA1'] } }, { role: { $exists: false } }] },
        ],
        status: { $nin: ['INACTIVE', 'inactive', 'DISABLED', 'TERMINATED', 'SUSPENDED', 'LOCKED'] },
      })
        .populate('levelRef', 'name levelNumber')
        .select('designation roleLevel levelRef')
        .lean()
        .catch(() => []),
    ]);

    const employeeDesignations = [];
    const seenDesig = new Set();
    for (const u of empRoles || []) {
      const dName = String(u?.designation || '').trim();
      if (!dName || /super\s*admin/i.test(dName)) continue;
      const key = dName.toLowerCase();
      if (seenDesig.has(key)) continue;
      seenDesig.add(key);
      employeeDesignations.push({
        name: dName,
        levelNumber: u.levelRef?.levelNumber ?? u.roleLevel ?? null,
        levelId: u.levelRef?._id || null,
      });
    }

    res.json({
      success: true,
      count: levels.length,
      data: levels,
      designations: designations || [],
      employeeDesignations,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * GET /api/expense/grades — company-scoped grades
 */
exports.listGrades = async (req, res) => {
  try {
    const companyId = await resolveTenantCompanyId(req);
    if (!companyId) return res.json({ success: true, count: 0, data: [] });
    const scopeFilter = { $or: [{ companyId }, { company: companyId }] };
    const grades = await Grade.find({ ...scopeFilter, status: { $ne: 'inactive' } })
      .sort({ order: 1, gradeOrder: 1, code: 1 })
      .lean();
    res.json({ success: true, count: grades.length, data: grades });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

async function resolveCompanyLevelNumbersAndMap(companyId, providedLevels = []) {
  const [companyLevels, distinctEntLevels] = await Promise.all([
    Level.find({ $or: [{ companyId }, { company: companyId }], status: { $ne: 'inactive' } })
      .select('_id name levelNumber')
      .lean()
      .catch(() => []),
    ExpenseEntitlement.find({ companyId, status: { $ne: 'inactive' }, levelNumber: { $gt: 0 } })
      .distinct('levelNumber')
      .catch(() => []),
  ]);
  const levelByNum = new Map();
  const superAdminNums = new Set();
  for (const l of companyLevels || []) {
    const ln = Number(l.levelNumber);
    if (!Number.isInteger(ln) || ln <= 0) continue;
    if (/super\s*admin/i.test(String(l.name || ''))) {
      superAdminNums.add(ln);
      continue;
    }
    levelByNum.set(ln, l);
  }
  const numSet = new Set();
  for (const ln of levelByNum.keys()) numSet.add(ln);
  for (const raw of [...(distinctEntLevels || []), ...(Array.isArray(providedLevels) ? providedLevels : [])]) {
    const ln = Number(raw);
    if (Number.isInteger(ln) && ln > 0 && !superAdminNums.has(ln)) numSet.add(ln);
  }
  if (numSet.size === 0) {
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].forEach((n) => numSet.add(n));
  }
  return {
    targetLevels: Array.from(numSet).sort((a, b) => a - b),
    levelByNum,
    companyLevels: companyLevels || [],
  };
}

async function upsertTravelEntitlementForLevel({
  companyId,
  policyId,
  policyVersionId,
  levelNumber,
  levelRef,
  levelName,
  gradeCode,
  gradeRef,
  cityClass,
  expenseTypeRef,
  status,
  createdBy,
  travelFields,
}) {
  const matchKey = {
    companyId,
    levelNumber,
    gradeCode: gradeCode || '',
    cityClass: cityClass || 'ALL',
    expenseTypeCode: 'TRAVEL',
    travelModeCode: travelFields.travelModeCode,
  };
  const existingDocs = await ExpenseEntitlement.find(matchKey).sort({ updatedAt: -1 });
  if (existingDocs.length > 0) {
    const primary = existingDocs[0];
    primary.company = companyId;
    if (policyId) primary.policyId = policyId;
    if (policyVersionId || policyId) primary.policyVersionId = policyVersionId || policyId;
    primary.levelNumber = levelNumber;
    primary.levelRef = levelRef || primary.levelRef || null;
    primary.levelName = levelName || primary.levelName || `Level ${levelNumber}`;
    primary.gradeCode = gradeCode || '';
    primary.gradeRef = gradeRef || null;
    primary.cityClass = cityClass || 'ALL';
    primary.expenseTypeCode = 'TRAVEL';
    if (expenseTypeRef) primary.expenseTypeRef = expenseTypeRef;
    primary.status = status || 'active';
    Object.assign(primary, travelFields);
    await primary.save();
    if (existingDocs.length > 1) {
      const extraIds = existingDocs.slice(1).map((d) => d._id);
      await ExpenseEntitlement.deleteMany({ _id: { $in: extraIds } }).catch(() => {});
    }
    return primary;
  }

  const filter = {
    ...matchKey,
    policyId,
  };
  const updateDoc = {
    $set: {
      company: companyId,
      policyVersionId: policyVersionId || policyId,
      levelNumber,
      levelRef: levelRef || null,
      levelName: levelName || `Level ${levelNumber}`,
      gradeCode: gradeCode || '',
      gradeRef: gradeRef || null,
      cityClass: cityClass || 'ALL',
      expenseTypeCode: 'TRAVEL',
      expenseTypeRef: expenseTypeRef || null,
      status: status || 'active',
      createdBy: createdBy || null,
      ...travelFields,
    },
  };
  const runUpsert = () =>
    ExpenseEntitlement.findOneAndUpdate(filter, updateDoc, {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    });
  try {
    return await runUpsert();
  } catch (upErr) {
    if (upErr && (upErr.code === 11000 || /E11000|uniq_entitlement_key/i.test(String(upErr.message)))) {
      await ensureEntitlementIndexes(true);
      await ExpenseEntitlement.collection.dropIndex('uniq_entitlement_key').catch(() => {});
      return await runUpsert();
    }
    throw upErr;
  }
}

async function expandZeroLevelTravelEntitlements(companyId, policyId) {
  if (!companyId) return;
  const zeroEnts = await ExpenseEntitlement.find({
    companyId,
    levelNumber: 0,
    expenseTypeCode: 'TRAVEL',
    status: { $ne: 'inactive' },
  }).lean();
  if (!zeroEnts.length) return;

  const { targetLevels, levelByNum } = await resolveCompanyLevelNumbersAndMap(companyId);
  for (const ze of zeroEnts) {
    if (!ze.travelModeCode && !ze.travelModeId) continue;
    const travelFields = {
      travelModeId: ze.travelModeId || null,
      travelModeCode: ze.travelModeCode || '',
      travelModeName: ze.travelModeName || '',
      allowedSubtypes: Array.isArray(ze.allowedSubtypes) ? ze.allowedSubtypes : [],
      maxAmount: ze.maxAmount === undefined ? null : ze.maxAmount,
      amount: ze.maxAmount || 0,
      unit: ze.unit || 'per_item',
      ruleCode: ze.ruleCode || 'TRAVEL_ENTITLEMENT',
      formula: ze.formula || 'MIN(claimed, entitlement); not entitled -> excess',
    };
    for (const lvlNum of targetLevels) {
      const existingForLvl = await ExpenseEntitlement.exists({
        companyId,
        levelNumber: lvlNum,
        gradeCode: ze.gradeCode || '',
        cityClass: ze.cityClass || 'ALL',
        expenseTypeCode: 'TRAVEL',
        travelModeCode: ze.travelModeCode || '',
        status: { $ne: 'inactive' },
      });
      if (!existingForLvl) {
        const lvlDoc = levelByNum.get(lvlNum);
        // eslint-disable-next-line no-await-in-loop
        await upsertTravelEntitlementForLevel({
          companyId,
          policyId: ze.policyId || policyId || null,
          policyVersionId: ze.policyVersionId || ze.policyId || policyId || null,
          levelNumber: lvlNum,
          levelRef: lvlDoc?._id || null,
          levelName: lvlDoc?.name || `Level ${lvlNum}`,
          gradeCode: ze.gradeCode || '',
          gradeRef: ze.gradeRef || null,
          cityClass: ze.cityClass || 'ALL',
          expenseTypeRef: ze.expenseTypeRef || null,
          status: 'active',
          createdBy: ze.createdBy || null,
          travelFields,
        }).catch(() => {});
      }
    }
    // eslint-disable-next-line no-await-in-loop
    await ExpenseEntitlement.deleteMany({ _id: ze._id }).catch(() => {});
  }
}

/**
 * GET /api/expense/entitlements
 */
exports.listEntitlements = async (req, res) => {
  try {
    const companyId = await resolveTenantCompanyId(req);
    await ensureExpenseMasters(companyId);
    await ExpenseEntitlement.deleteMany({ companyId, status: 'inactive' }).catch(() => {});
    let { policyId } = req.query;
    if (policyId && mongoose.Types.ObjectId.isValid(String(policyId))) {
      const ownedPol = await ExpensePolicy.findOne({ _id: policyId, companyId }).select('_id').lean();
      if (!ownedPol) policyId = null;
    } else {
      policyId = null;
    }
    if (!policyId) {
      const policy = await getActivePolicy(companyId);
      if (!policy) return res.json({ success: true, data: [] });
      policyId = policy._id;
    }
    await expandZeroLevelTravelEntitlements(companyId, policyId).catch(() => {});
    const [entitlements, companyLevels] = await Promise.all([
      ExpenseEntitlement.find({
        companyId,
        status: 'active',
        $or: [{ policyId }, { expenseTypeCode: 'TRAVEL' }],
      })
        .sort({ levelNumber: 1, expenseTypeCode: 1, cityClass: 1, updatedAt: -1 })
        .lean(),
      Level.find({ $or: [{ companyId }, { company: companyId }] }).select('_id name levelNumber').lean(),
    ]);
    const levelByNum = new Map((companyLevels || []).map((l) => [Number(l.levelNumber), l]));
    const normalized = entitlements.map((e) => {
      const ln = Number(e.levelNumber || 0);
      if (ln === 0) return { ...e, levelName: 'All Levels' };
      const lvl = levelByNum.get(ln);
      return {
        ...e,
        levelName: lvl?.name || `Level ${ln}`,
        levelRef: lvl?._id || e.levelRef || null,
      };
    });
    res.json({ success: true, data: normalized });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * GET /api/expense/entitlements/all — all active entitlements
 */
exports.listAllEntitlements = async (req, res) => {
  try {
    const companyId = await resolveTenantCompanyId(req);
    await ensureExpenseMasters(companyId);
    // Clean up any legacy soft-deleted (inactive) entitlement rows so deleted rules never reappear
    await ExpenseEntitlement.deleteMany({ companyId, status: 'inactive' }).catch(() => {});
    let { policyId } = req.query;
    if (policyId && mongoose.Types.ObjectId.isValid(String(policyId))) {
      const ownedPol = await ExpensePolicy.findOne({ _id: policyId, companyId }).select('_id').lean();
      if (!ownedPol) policyId = null;
    } else {
      policyId = null;
    }
    if (!policyId) {
      const activePol = await getActivePolicy(companyId);
      if (activePol) policyId = activePol._id;
    }
    await expandZeroLevelTravelEntitlements(companyId, policyId).catch(() => {});
    const filter = { companyId, status: { $ne: 'inactive' } };
    if (policyId) {
      filter.$or = [{ policyId }, { expenseTypeCode: 'TRAVEL' }];
    }
    const [entitlements, companyLevels] = await Promise.all([
      ExpenseEntitlement.find(filter)
        .sort({ levelNumber: 1, expenseTypeCode: 1, cityClass: 1, updatedAt: -1 })
        .lean(),
      Level.find({ $or: [{ companyId }, { company: companyId }] }).select('_id name levelNumber').lean(),
    ]);
    const levelByNum = new Map((companyLevels || []).map((l) => [Number(l.levelNumber), l]));
    const normalized = entitlements.map((e) => {
      const ln = Number(e.levelNumber || 0);
      if (ln === 0) return { ...e, levelName: 'All Levels' };
      const lvl = levelByNum.get(ln);
      return {
        ...e,
        levelName: lvl?.name || `Level ${ln}`,
        levelRef: lvl?._id || e.levelRef || null,
      };
    });
    res.json({ success: true, data: normalized });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * POST /api/expense/entitlements — create or upsert entitlement
 */
exports.createEntitlement = async (req, res) => {
  try {
    const companyId = await resolveTenantCompanyId(req);
    await ensureEntitlementIndexes();
    const body = req.body || {};
    const isTravelRow = String(body.expenseTypeCode || '').toUpperCase().trim() === 'TRAVEL';
    if (body.levelNumber === undefined || body.levelNumber === null || body.levelNumber === '' || !body.expenseTypeCode || !body.cityClass
      || (!isTravelRow && (body.amount === undefined || body.amount === null))) {
      return res.status(400).json({ success: false, message: 'levelNumber, expenseTypeCode, cityClass and amount are required.' });
    }
    const policy = await getActivePolicy(companyId);
    const policyId = body.policyId || (policy && policy._id) || null;
    const levelNumber = Number(body.levelNumber);
    if (!Number.isInteger(levelNumber) || levelNumber < 0 || (levelNumber === 0 && !isTravelRow)) {
      return res.status(400).json({ success: false, message: 'Invalid level.' });
    }
    const expenseTypeCode = String(body.expenseTypeCode).toUpperCase().trim();
    const cityClass = String(body.cityClass || 'ALL').toUpperCase().trim();
    const gradeCode = String(body.gradeCode || '').toLowerCase().trim();
    let travel = null;
    if (isTravelRow) {
      travel = await buildTravelEntitlementFields(companyId, body);
      if (travel.error) return res.status(400).json({ success: false, message: travel.error });
    }

    // Resolve ExpenseType ref
    let expenseTypeRef = body.expenseTypeRef || null;
    if (!expenseTypeRef) {
      const typeDoc = await ExpenseType.findOne({ companyId, code: expenseTypeCode });
      if (typeDoc) expenseTypeRef = typeDoc._id;
    }

    // Resolve Grade ref
    let gradeRef = body.gradeRef || null;
    if (!gradeRef && gradeCode) {
      const grdDoc = await Grade.findOne({ companyId, code: { $regex: new RegExp(`^${gradeCode}$`, 'i') } });
      if (grdDoc) gradeRef = grdDoc._id;
    }

    if (isTravelRow) {
      const { targetLevels: allCompanyLevels, levelByNum } = await resolveCompanyLevelNumbersAndMap(
        companyId,
        Array.isArray(body.targetLevels) ? body.targetLevels : []
      );
      const levelsToApply = levelNumber === 0 ? allCompanyLevels : [levelNumber];

      if (Array.isArray(body.removeModeCodes) && body.removeModeCodes.length > 0) {
        const cleanRemoveCodes = body.removeModeCodes
          .map((c) => String(c || '').trim().toUpperCase())
          .filter(Boolean);
        if (cleanRemoveCodes.length > 0) {
          await ExpenseEntitlement.deleteMany({
            companyId,
            levelNumber: { $in: [...levelsToApply, 0] },
            gradeCode,
            cityClass,
            expenseTypeCode: 'TRAVEL',
            travelModeCode: { $in: cleanRemoveCodes },
          }).catch(() => {});
        }
      }

      // Remove any legacy levelNumber: 0 row for this travel mode so no separate "All Levels" section exists
      await ExpenseEntitlement.deleteMany({
        companyId,
        levelNumber: 0,
        gradeCode,
        cityClass,
        expenseTypeCode: 'TRAVEL',
        travelModeCode: travel.fields.travelModeCode,
      }).catch(() => {});

      let lastEntitlement = null;
      const savedEntitlements = [];
      for (const lvlNum of levelsToApply) {
        const lvlDoc = levelByNum.get(lvlNum);
        // eslint-disable-next-line no-await-in-loop
        const saved = await upsertTravelEntitlementForLevel({
          companyId,
          policyId,
          policyVersionId: body.policyVersionId || policyId,
          levelNumber: lvlNum,
          levelRef: lvlDoc?._id || (levelsToApply.length === 1 ? body.levelRef : null) || null,
          levelName: lvlDoc?.name || (levelsToApply.length === 1 && body.levelName ? body.levelName : `Level ${lvlNum}`),
          gradeCode,
          gradeRef,
          cityClass,
          expenseTypeRef,
          status: body.status || 'active',
          createdBy: req.user?._id || null,
          travelFields: travel.fields,
        });
        lastEntitlement = saved;
        savedEntitlements.push(saved);
      }

      if (lastEntitlement) {
        await access.audit({
          req,
          action: 'TRAVEL_ENTITLEMENT_SAVED',
          entity: 'ExpenseEntitlement',
          entityId: String(lastEntitlement._id),
          claim: { companyId },
          description: `Travel entitlement saved: ${levelNumber === 0 ? `All Levels (L${levelsToApply.join(', L')})` : `L${levelNumber}`} ${gradeCode || 'all grades'} class ${cityClass} ${travel.fields.travelModeName} (${travel.fields.allowedSubtypes.map((s) => s.name).join(', ') || 'no subtypes'}).`,
          after: { allowedSubtypes: travel.fields.allowedSubtypes, maxAmount: travel.fields.maxAmount, appliedLevels: levelsToApply },
        });
      }

      return res.status(201).json({
        success: true,
        data: lastEntitlement,
        appliedLevels: levelsToApply,
        records: savedEntitlements,
      });
    }

    // Standard non-TRAVEL entitlement (LODGING, FOOD, etc.)
    let levelRef = body.levelRef || null;
    let levelName = body.levelName || '';
    if (levelNumber > 0 && (!levelRef || !levelName)) {
      const lvlDoc = await Level.findOne({ $or: [{ companyId }, { company: companyId }], levelNumber });
      if (lvlDoc) {
        levelRef = lvlDoc._id;
        levelName = lvlDoc.name;
      }
    }

    const filter = {
      companyId,
      policyId,
      levelNumber,
      gradeCode,
      cityClass,
      expenseTypeCode,
      travelModeCode: '',
    };

    const updateDoc = {
      $set: {
        company: companyId,
        policyVersionId: body.policyVersionId || policyId,
        levelNumber,
        levelRef,
        levelName: levelName || `Level ${levelNumber}`,
        gradeCode,
        gradeRef,
        cityClass,
        expenseTypeCode,
        expenseTypeRef,
        amount: Number(body.amount) || 0,
        unit: body.unit || 'per_day',
        formula: body.formula || '',
        ruleCode: body.ruleCode || '',
        status: body.status || 'active',
        createdBy: req.user?._id || null,
      }
    };

    const runUpsert = () => ExpenseEntitlement.findOneAndUpdate(filter, updateDoc, {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    });
    let entitlement;
    try {
      entitlement = await runUpsert();
    } catch (upErr) {
      if (upErr && (upErr.code === 11000 || /E11000|uniq_entitlement_key/i.test(String(upErr.message)))) {
        await ensureEntitlementIndexes(true);
        await ExpenseEntitlement.collection.dropIndex('uniq_entitlement_key').catch(() => {});
        entitlement = await runUpsert();
      } else {
        throw upErr;
      }
    }

    res.status(201).json({ success: true, data: entitlement });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * PUT /api/expense/entitlements/:id — update entitlement
 */
exports.updateEntitlement = async (req, res) => {
  try {
    await ensureEntitlementIndexes();
    const ent = await ExpenseEntitlement.findById(req.params.id);
    if (!ent || !(await ownsDoc(req, ent))) return res.status(404).json({ success: false, message: 'Entitlement not found' });

    const companyId = ent.companyId;
    const body = req.body || {};

    const targetLevelNumber = body.levelNumber !== undefined ? Number(body.levelNumber) : ent.levelNumber;
    const targetTypeCode = body.expenseTypeCode !== undefined ? String(body.expenseTypeCode).toUpperCase().trim() : ent.expenseTypeCode;
    const targetCityClass = body.cityClass !== undefined ? String(body.cityClass).toUpperCase().trim() : ent.cityClass;
    const targetGradeCode = body.gradeCode !== undefined ? String(body.gradeCode).toLowerCase().trim() : (ent.gradeCode || '');
    const targetPolicyId = body.policyId || ent.policyId;

    // TRAVEL rows: mode + permitted subtypes (+ per-subtype maximum) validated against TravelMode
    let travel = null;
    if (targetTypeCode === 'TRAVEL') {
      travel = await buildTravelEntitlementFields(companyId, body, ent.expenseTypeCode === 'TRAVEL' ? ent : null);
      if (travel.error) return res.status(400).json({ success: false, message: travel.error });
    } else if (!Number.isInteger(targetLevelNumber) || targetLevelNumber < 1) {
      return res.status(400).json({ success: false, message: 'Invalid level.' });
    }
    const targetModeCode = travel ? travel.fields.travelModeCode : '';

    // If a TRAVEL entitlement is updated with "All Levels" (levelNumber === 0), connect/apply to all company levels
    if (targetTypeCode === 'TRAVEL' && targetLevelNumber === 0) {
      const { targetLevels: allCompanyLevels, levelByNum } = await resolveCompanyLevelNumbersAndMap(
        companyId,
        Array.isArray(body.targetLevels) ? body.targetLevels : []
      );
      let gradeRef = ent.gradeRef || null;
      if (targetGradeCode) {
        const grdDoc = await Grade.findOne({ companyId, code: { $regex: new RegExp(`^${targetGradeCode}$`, 'i') } });
        if (grdDoc) gradeRef = grdDoc._id;
      } else {
        gradeRef = null;
      }
      let lastEntitlement = null;
      for (const lvlNum of allCompanyLevels) {
        const lvlDoc = levelByNum.get(lvlNum);
        // eslint-disable-next-line no-await-in-loop
        const saved = await upsertTravelEntitlementForLevel({
          companyId,
          policyId: targetPolicyId,
          policyVersionId: targetPolicyId,
          levelNumber: lvlNum,
          levelRef: lvlDoc?._id || null,
          levelName: lvlDoc?.name || `Level ${lvlNum}`,
          gradeCode: targetGradeCode,
          gradeRef,
          cityClass: targetCityClass,
          expenseTypeRef: ent.expenseTypeRef || null,
          status: body.status || ent.status || 'active',
          createdBy: req.user?._id || ent.createdBy || null,
          travelFields: travel.fields,
        });
        lastEntitlement = saved;
      }
      if (Number(ent.levelNumber) === 0) {
        await ExpenseEntitlement.findByIdAndDelete(ent._id).catch(() => {});
      }
      return res.json({ success: true, data: lastEntitlement || ent, appliedLevels: allCompanyLevels });
    }

    // Check if key fields changed and if it collides with another existing document
    const isKeyChanged = targetLevelNumber !== ent.levelNumber ||
      targetTypeCode !== ent.expenseTypeCode ||
      targetCityClass !== ent.cityClass ||
      targetGradeCode !== (ent.gradeCode || '') ||
      targetModeCode !== (ent.travelModeCode || '');

    if (isKeyChanged) {
      const existingQuery = {
        _id: { $ne: ent._id },
        companyId,
        levelNumber: targetLevelNumber,
        gradeCode: targetGradeCode,
        cityClass: targetCityClass,
        expenseTypeCode: targetTypeCode,
        travelModeCode: targetModeCode,
      };
      if (targetTypeCode !== 'TRAVEL') existingQuery.policyId = targetPolicyId;
      const existing = await ExpenseEntitlement.findOne(existingQuery);

      if (existing) {
        existing.amount = body.amount !== undefined ? Number(body.amount) : ent.amount;
        if (body.unit !== undefined) existing.unit = body.unit;
        if (body.formula !== undefined) existing.formula = body.formula;
        if (body.ruleCode !== undefined) existing.ruleCode = body.ruleCode;
        if (body.status !== undefined) existing.status = body.status;
        if (travel) Object.assign(existing, travel.fields);
        await existing.save();
        await ExpenseEntitlement.findByIdAndDelete(ent._id);
        return res.json({ success: true, data: existing });
      }
    }

    if (body.levelNumber !== undefined) {
      ent.levelNumber = targetLevelNumber;
      const lvlDoc = targetLevelNumber > 0 ? await Level.findOne({ $or: [{ companyId }, { company: companyId }], levelNumber: targetLevelNumber }) : null;
      if (targetLevelNumber === 0) {
        ent.levelRef = null;
        ent.levelName = 'All Levels';
      } else if (lvlDoc) {
        ent.levelRef = lvlDoc._id;
        ent.levelName = lvlDoc.name;
      } else if (body.levelName) {
        ent.levelName = body.levelName;
      }
    }

    if (body.expenseTypeCode !== undefined) {
      ent.expenseTypeCode = targetTypeCode;
      const typeDoc = await ExpenseType.findOne({ companyId, code: targetTypeCode });
      if (typeDoc) ent.expenseTypeRef = typeDoc._id;
    }

    if (body.gradeCode !== undefined) {
      ent.gradeCode = targetGradeCode;
      if (targetGradeCode) {
        const grdDoc = await Grade.findOne({ companyId, code: { $regex: new RegExp(`^${targetGradeCode}$`, 'i') } });
        if (grdDoc) ent.gradeRef = grdDoc._id;
      } else {
        ent.gradeRef = null;
      }
    }

    if (body.cityClass !== undefined) ent.cityClass = targetCityClass;
    if (body.amount !== undefined) ent.amount = Number(body.amount);
    if (body.unit !== undefined) ent.unit = body.unit;
    if (body.formula !== undefined) ent.formula = body.formula;
    if (body.ruleCode !== undefined) ent.ruleCode = body.ruleCode;
    if (body.status !== undefined) ent.status = body.status;
    if (body.policyId !== undefined) ent.policyId = body.policyId;
    if (travel) Object.assign(ent, travel.fields);

    try {
      await ent.save();
    } catch (saveErr) {
      if (saveErr && (saveErr.code === 11000 || /E11000|uniq_entitlement_key/i.test(String(saveErr.message)))) {
        await ensureEntitlementIndexes(true);
        await ExpenseEntitlement.collection.dropIndex('uniq_entitlement_key').catch(() => {});
        await ent.save();
      } else {
        throw saveErr;
      }
    }
    if (travel) {
      await access.audit({
        req,
        action: 'TRAVEL_ENTITLEMENT_SAVED',
        entity: 'ExpenseEntitlement',
        entityId: String(ent._id),
        claim: { companyId },
        description: `Travel entitlement updated: L${ent.levelNumber || 'All'} class ${ent.cityClass} ${ent.travelModeName}.`,
        after: { allowedSubtypes: travel.fields.allowedSubtypes, maxAmount: travel.fields.maxAmount },
      });
    }
    res.json({ success: true, data: ent });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * DELETE /api/expense/entitlements/:id — delete entitlement
 */
exports.deleteEntitlement = async (req, res) => {
  try {
    const ent = await ExpenseEntitlement.findById(req.params.id);
    if (!ent || !(await ownsDoc(req, ent))) return res.status(404).json({ success: false, message: 'Entitlement not found' });
    await ExpenseEntitlement.deleteMany({
      companyId: ent.companyId,
      levelNumber: ent.levelNumber,
      gradeCode: ent.gradeCode || '',
      cityClass: ent.cityClass,
      expenseTypeCode: ent.expenseTypeCode,
      travelModeCode: ent.travelModeCode || '',
    });
    await ExpenseEntitlement.findByIdAndDelete(ent._id);
    res.json({ success: true, data: ent });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * GET /api/expense/employees?search=
 * Employee list with Level/Grade populated, for the combined-claim employee
 * dropdown (when user chooses to file for 2, 3, ... employees).
 */
exports.employeeOptions = async (req, res) => {
  try {
    const companyId = await resolveTenantCompanyId(req);
    const search = (req.query.search || '').trim();
    const filter = { companyId };
    const statusUpper = { $nin: ['INACTIVE', 'inactive', 'DISABLED', 'TERMINATED', 'SUSPENDED', 'LOCKED'] };
    filter.status = statusUpper;
    filter.$or = [
      { role: { $nin: ['superadmin', 'TCSA1'] } },
      { role: { $exists: false } },
    ];

    const staff = access.isStaff(req.user);
    if (search) {
      const q = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const searchable = [
        { name: { $regex: q, $options: 'i' } },
        { employeeIdCode: { $regex: q, $options: 'i' } },
        { department: { $regex: q, $options: 'i' } },
      ];
      if (staff) searchable.push({ email: { $regex: q, $options: 'i' } });
      filter.$and = [{ $or: searchable }];
    }

    const employees = await User.find(filter)
      .populate('levelRef')
      .populate('gradeRef')
      .populate('workingPlace', 'name')
      .select('name employeeIdCode department designation workingPlace role roleCode roleLevel isTeamLead reportsTo approver levelRef gradeRef email')
      .sort({ name: 1 })
      .limit(Math.min(1000, parseInt(req.query.limit) || 500))
      .lean();

    const data = employees.map(e => ({
      _id: e._id,
      name: e.name,
      employeeIdCode: e.employeeIdCode,
      department: e.department,
      designation: e.designation || '',
      workLocation: (e.workingPlace && typeof e.workingPlace === 'object' ? e.workingPlace.name : '') || '',
      ...(staff ? { email: e.email } : {}),
      role: e.role,
      roleCode: e.roleCode,
      roleLevel: e.roleLevel ?? null,
      isTeamLead: Boolean(e.isTeamLead || e.levelRef?.canManageTeam),
      canManageTeam: Boolean(e.levelRef?.canManageTeam),
      canApprove: Boolean(e.levelRef?.canApprove),
      reportsTo: e.reportsTo ? String(e.reportsTo._id || e.reportsTo) : null,
      approver: e.approver ? String(e.approver._id || e.approver) : null,
      levelName: e.levelRef?.name || '',
      levelNumber: e.levelRef?.levelNumber ?? e.roleLevel ?? null,
      levelRef: e.levelRef?._id || null,
      gradeCode: e.gradeRef?.code || e.roleGrade || '',
      gradeRef: e.gradeRef?._id || null,
    }));

    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * GET /api/expense/travel-modes
 */
exports.listTravelModes = async (req, res) => {
  try {
    const companyId = await resolveTenantCompanyId(req);
    await ensureExpenseMasters(companyId);
    const modes = await TravelMode.find({ companyId, status: 'active' })
      .sort({ order: 1, name: 1 })
      .lean();
    res.json({ success: true, data: modes });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * GET /api/expense/travel-modes/all — all active travel modes
 */
exports.listAllTravelModes = async (req, res) => {
  try {
    const companyId = await resolveTenantCompanyId(req);
    await ensureExpenseMasters(companyId);
    await TravelMode.deleteMany({ companyId, status: 'inactive' }).catch(() => {});
    const modes = await TravelMode.find({ companyId, status: { $ne: 'inactive' } }).sort({ order: 1, name: 1 }).lean();
    res.json({ success: true, data: modes });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * POST /api/expense/travel-modes
 */
exports.createTravelMode = async (req, res) => {
  try {
    const companyId = await resolveTenantCompanyId(req);
    const body = req.body || {};
    if (!body.name) {
      return res.status(400).json({ success: false, message: 'Travel mode name is required.' });
    }
    const code = String(body.code || body.name).trim().toUpperCase();
    const existing = await TravelMode.findOne({ companyId, code });
    if (existing) return res.status(400).json({ success: false, message: `Travel mode ${code} already exists.` });
    const { subtypes, error } = sanitizeSubtypes(body.subtypes || [], []);
    if (error) return res.status(400).json({ success: false, message: error });
    const rawModeRate = body.ratePerKm !== undefined && body.ratePerKm !== null && body.ratePerKm !== '' ? Number(body.ratePerKm) : null;
    let ratePerKm = Number.isFinite(rawModeRate) && rawModeRate > 0 ? Math.round(rawModeRate * 100) / 100 : null;
    if (ratePerKm > 0 && Array.isArray(subtypes)) {
      subtypes.forEach((s) => {
        if (s.workflow === 'KM_RATE' && !(Number(s.ratePerKm) > 0)) {
          s.ratePerKm = ratePerKm;
        }
      });
    } else if (!ratePerKm && Array.isArray(subtypes)) {
      const kmSubWithRate = subtypes.find((s) => s.workflow === 'KM_RATE' && Number(s.ratePerKm) > 0);
      if (kmSubWithRate) ratePerKm = kmSubWithRate.ratePerKm;
    }
    let conveyanceRateKey = RATE_KEYS.includes(body.conveyanceRateKey) ? body.conveyanceRateKey : '';
    if (subtypes.some((s) => s.workflow === 'KM_RATE' && s.status === 'active') && !conveyanceRateKey) {
      const subWithRateKey = subtypes.find((s) => s.workflow === 'KM_RATE' && s.conveyanceRateKey);
      conveyanceRateKey = subWithRateKey?.conveyanceRateKey || (code.includes('TWO') || code.includes('2W') || code.includes('BIKE') ? 'twoWheeler' : 'car');
    }

    const mode = await TravelMode.create({
      companyId,
      company: companyId,
      code,
      name: body.name,
      description: body.description || '',
      status: body.status || 'active',
      order: Number(body.order) || 0,
      subtypes,
      ratePerKm,
      conveyanceRateKey,
    });
    res.status(201).json({ success: true, data: mode });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * PUT /api/expense/travel-modes/:id
 */
exports.updateTravelMode = async (req, res) => {
  try {
    const mode = await TravelMode.findById(req.params.id);
    if (!mode || !(await ownsDoc(req, mode))) return res.status(404).json({ success: false, message: 'Travel mode not found' });
    const before = {
      subtypes: (mode.subtypes || []).map((s) => ({ _id: String(s._id), code: s.code, name: s.name, status: s.status, ratePerKm: s.ratePerKm })),
      ratePerKm: mode.ratePerKm,
      conveyanceRateKey: mode.conveyanceRateKey,
    };
    const allowed = ['name', 'description', 'status', 'order'];
    allowed.forEach(k => {
      if (req.body[k] !== undefined) mode[k] = req.body[k];
    });
    if (req.body.code !== undefined && String(req.body.code).trim().toUpperCase() !== mode.code) {
      const newCode = toCode(req.body.code);
      if (!newCode) return res.status(400).json({ success: false, message: 'Mode code is required.' });
      if (await TravelMode.exists({ companyId: mode.companyId, code: newCode, _id: { $ne: mode._id } })) {
        return res.status(400).json({ success: false, message: `Travel mode ${newCode} already exists.` });
      }
      mode.code = newCode;
    }
    if (req.body.conveyanceRateKey !== undefined) {
      if (!RATE_KEYS.includes(req.body.conveyanceRateKey)) return res.status(400).json({ success: false, message: 'Invalid per-km rate selection.' });
      mode.conveyanceRateKey = req.body.conveyanceRateKey;
    }
    const hasExplicitModeRate = req.body.ratePerKm !== undefined;
    if (hasExplicitModeRate) {
      const rawModeRate = req.body.ratePerKm !== null && req.body.ratePerKm !== '' ? Number(req.body.ratePerKm) : null;
      if (rawModeRate !== null && (!Number.isFinite(rawModeRate) || rawModeRate < 0)) {
        return res.status(400).json({ success: false, message: 'Invalid Own-Vehicle rate per km.' });
      }
      mode.ratePerKm = rawModeRate !== null && rawModeRate > 0 ? Math.round(rawModeRate * 100) / 100 : null;
    }
    if (req.body.subtypes !== undefined) {
      const { subtypes, error } = sanitizeSubtypes(req.body.subtypes, (mode.subtypes || []).map((s) => (s.toObject ? s.toObject() : s)));
      if (error) return res.status(400).json({ success: false, message: error });
      if (hasExplicitModeRate && mode.ratePerKm > 0) {
        subtypes.forEach((s) => {
          if (s.workflow === 'KM_RATE' && !(Number(s.ratePerKm) > 0)) {
            s.ratePerKm = mode.ratePerKm;
          }
        });
      }
      const kmSubWithRate = subtypes.find((s) => s.workflow === 'KM_RATE' && Number(s.ratePerKm) > 0);
      if (kmSubWithRate && !hasExplicitModeRate) {
        mode.ratePerKm = kmSubWithRate.ratePerKm;
      } else if (kmSubWithRate && hasExplicitModeRate && kmSubWithRate.ratePerKm !== mode.ratePerKm) {
        // Subtype ratePerKm in payload takes precedence if edited, or sync both
        mode.ratePerKm = kmSubWithRate.ratePerKm;
      }
      mode.subtypes = subtypes;
    } else if (hasExplicitModeRate && Array.isArray(mode.subtypes)) {
      mode.subtypes.forEach((s) => {
        if (s.workflow === 'KM_RATE' || String(s.code || '').toUpperCase() === 'OWN_VEHICLE') {
          s.ratePerKm = mode.ratePerKm;
        }
      });
    }
    if ((mode.subtypes || []).some((s) => s.workflow === 'KM_RATE' && s.status === 'active') && !mode.conveyanceRateKey) {
      const subWithRateKey = (mode.subtypes || []).find((s) => s.workflow === 'KM_RATE' && s.conveyanceRateKey);
      mode.conveyanceRateKey = subWithRateKey?.conveyanceRateKey || (mode.code.includes('TWO') || mode.code.includes('2W') || mode.code.includes('BIKE') ? 'twoWheeler' : 'car');
    }
    await mode.save();

    // Keep linked Level Entitlement rows synchronized with updated mode code/name and subtype list
    const validSubtypeMap = new Map((mode.subtypes || []).map((s) => [String(s._id), s]));
    const linkedEnts = await ExpenseEntitlement.find({ companyId: mode.companyId, travelModeId: mode._id });
    for (const entDoc of linkedEnts) {
      entDoc.travelModeCode = mode.code;
      entDoc.travelModeName = mode.name;
      if (Array.isArray(entDoc.allowedSubtypes) && entDoc.allowedSubtypes.length > 0) {
        entDoc.allowedSubtypes = entDoc.allowedSubtypes
          .filter((as) => validSubtypeMap.has(String(as.subtypeId)))
          .map((as) => {
            const subObj = validSubtypeMap.get(String(as.subtypeId));
            return {
              subtypeId: subObj._id,
              code: subObj.code,
              name: subObj.name,
              maxAmount: as.maxAmount === undefined ? null : as.maxAmount,
            };
          });
      }
      // eslint-disable-next-line no-await-in-loop
      await entDoc.save().catch(() => {});
    }

    if (req.body.subtypes !== undefined || req.body.conveyanceRateKey !== undefined || req.body.ratePerKm !== undefined) {
      await access.audit({
        req,
        action: 'TRAVEL_MODE_SUBTYPES_UPDATED',
        entity: 'TravelMode',
        entityId: String(mode._id),
        claim: { companyId: mode.companyId },
        description: `Vehicle type configuration of ${mode.name} updated (${(mode.subtypes || []).filter((s) => s.status === 'active').map((s) => s.name).join(', ') || 'no subtypes'}).`,
        before,
        after: { subtypes: (mode.subtypes || []).map((s) => ({ _id: String(s._id), code: s.code, name: s.name, status: s.status, ratePerKm: s.ratePerKm })), ratePerKm: mode.ratePerKm, conveyanceRateKey: mode.conveyanceRateKey },
      });
    }
    res.json({ success: true, data: mode });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * DELETE /api/expense/travel-modes/:id — delete travel mode and its linked travel entitlements
 */
exports.deleteTravelMode = async (req, res) => {
  try {
    const mode = await TravelMode.findById(req.params.id);
    if (!mode || !(await ownsDoc(req, mode))) return res.status(404).json({ success: false, message: 'Travel mode not found' });
    await ExpenseEntitlement.deleteMany({ companyId: mode.companyId, travelModeId: mode._id });
    await TravelMode.findByIdAndDelete(mode._id);
    res.json({ success: true, data: mode });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports._internal = { sanitizeSubtypes, parseMaxAmount, buildTravelEntitlementFields };
