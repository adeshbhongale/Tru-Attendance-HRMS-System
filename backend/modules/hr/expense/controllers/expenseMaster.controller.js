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
const { ensureExpenseMasters } = require('../services/seedExpenseMasters');
const { getActivePolicy, resolveCityClass, getExpenseTypes } = require('../services/policyEngine');

const access = require('../services/expenseAccess');

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
const ownsDoc = async (req, doc) => !doc.companyId || String(doc.companyId) === String(await resolveTenantCompanyId(req));

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
  return out;
}

/** Per-type claim behaviour configured by Super Admin. */
function sanitizeTypeRules(body) {
  const out = {};
  if (['NORMAL', 'LOGGING'].includes(body.claimMode)) out.claimMode = body.claimMode;
  if (body.sameDateLimit !== undefined && body.sameDateLimit !== '') out.sameDateLimit = num(body.sameDateLimit, 0, 50, 0);
  if (body.allowOverlap !== undefined) out.allowOverlap = !!body.allowOverlap;
  if (body.maxClaimAmount !== undefined && body.maxClaimAmount !== '') out.maxClaimAmount = num(body.maxClaimAmount, 0, 10000000, 0);
  if (body.requiresOutstation !== undefined) out.requiresOutstation = !!body.requiresOutstation;
  return out;
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
    res.json({ success: true, data: policy });
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
    if (!body.name || !body.code) {
      return res.status(400).json({ success: false, message: 'Policy name and code are required.' });
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
      lodgingRules: body.lodgingRules,
      conveyanceRates: body.conveyanceRates,
      localTravelFoodAllowed: body.localTravelFoodAllowed,
      deadlineRules: body.deadlineRules || [],
      sharedLodgingConfig: body.sharedLodgingConfig,
      ...sanitizePolicyRules(body),
      createdBy: req.user?._id || null,
    });
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
    res.json({ success: true, data: type });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * DELETE /api/expense/types/:id — deactivate expense type
 */
exports.deleteType = async (req, res) => {
  try {
    const type = await ExpenseType.findById(req.params.id);
    if (!type || !(await ownsDoc(req, type))) return res.status(404).json({ success: false, message: 'Type not found' });
    type.status = 'inactive';
    await type.save();
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
    if (!city) return res.status(404).json({ success: false, message: 'City not found' });
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
 * DELETE /api/expense/cities/:id — deactivate city
 */
exports.deleteCity = async (req, res) => {
  try {
    const city = await CityClassification.findById(req.params.id);
    if (!city) return res.status(404).json({ success: false, message: 'City not found' });
    city.status = 'inactive';
    await city.save();
    res.json({ success: true, data: city });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * GET /api/expense/entitlements
 */
exports.listEntitlements = async (req, res) => {
  try {
    const companyId = await resolveTenantCompanyId(req);
    await ensureExpenseMasters(companyId);
    let { policyId } = req.query;
    if (!policyId) {
      const policy = await getActivePolicy(companyId);
      if (!policy) return res.json({ success: true, data: [] });
      policyId = policy._id;
    }
    const entitlements = await ExpenseEntitlement.find({ companyId, policyId, status: 'active' })
      .sort({ levelNumber: 1, expenseTypeCode: 1, cityClass: 1, updatedAt: -1 })
      .lean();
    res.json({ success: true, data: entitlements });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * GET /api/expense/entitlements/all — all entitlements (incl. inactive)
 */
exports.listAllEntitlements = async (req, res) => {
  try {
    const companyId = await resolveTenantCompanyId(req);
    await ensureExpenseMasters(companyId);
    let { policyId } = req.query;
    if (!policyId) {
      const activePol = await getActivePolicy(companyId);
      if (activePol) policyId = activePol._id;
    }
    const filter = { companyId };
    if (policyId) filter.policyId = policyId;
    const entitlements = await ExpenseEntitlement.find(filter)
      .sort({ levelNumber: 1, expenseTypeCode: 1, cityClass: 1, updatedAt: -1 })
      .lean();
    res.json({ success: true, data: entitlements });
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
    const body = req.body || {};
    if (body.levelNumber === undefined || body.levelNumber === null || !body.expenseTypeCode || !body.cityClass || body.amount === undefined || body.amount === null) {
      return res.status(400).json({ success: false, message: 'levelNumber, expenseTypeCode, cityClass and amount are required.' });
    }
    const policy = await getActivePolicy(companyId);
    const policyId = body.policyId || (policy && policy._id) || null;
    const levelNumber = Number(body.levelNumber);
    const expenseTypeCode = String(body.expenseTypeCode).toUpperCase().trim();
    const cityClass = String(body.cityClass || 'ALL').toUpperCase().trim();
    const gradeCode = String(body.gradeCode || '').toLowerCase().trim();

    // Resolve Level ref & name
    let levelRef = body.levelRef || null;
    let levelName = body.levelName || '';
    if (!levelRef || !levelName) {
      const lvlDoc = await Level.findOne({ companyId, levelNumber });
      if (lvlDoc) {
        levelRef = lvlDoc._id;
        levelName = lvlDoc.name;
      }
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

    const filter = {
      companyId,
      policyId,
      levelNumber,
      gradeCode,
      cityClass,
      expenseTypeCode,
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
        amount: Number(body.amount),
        unit: body.unit || 'per_day',
        formula: body.formula || '',
        ruleCode: body.ruleCode || '',
        status: body.status || 'active',
        createdBy: req.user?._id || null,
      }
    };

    const entitlement = await ExpenseEntitlement.findOneAndUpdate(filter, updateDoc, {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    });

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
    const ent = await ExpenseEntitlement.findById(req.params.id);
    if (!ent) return res.status(404).json({ success: false, message: 'Entitlement not found' });

    const companyId = ent.companyId;
    const body = req.body || {};

    const targetLevelNumber = body.levelNumber !== undefined ? Number(body.levelNumber) : ent.levelNumber;
    const targetTypeCode = body.expenseTypeCode !== undefined ? String(body.expenseTypeCode).toUpperCase().trim() : ent.expenseTypeCode;
    const targetCityClass = body.cityClass !== undefined ? String(body.cityClass).toUpperCase().trim() : ent.cityClass;
    const targetGradeCode = body.gradeCode !== undefined ? String(body.gradeCode).toLowerCase().trim() : (ent.gradeCode || '');
    const targetPolicyId = body.policyId || ent.policyId;

    // Check if key fields changed and if it collides with another existing document
    const isKeyChanged = targetLevelNumber !== ent.levelNumber ||
      targetTypeCode !== ent.expenseTypeCode ||
      targetCityClass !== ent.cityClass ||
      targetGradeCode !== (ent.gradeCode || '');

    if (isKeyChanged) {
      const existing = await ExpenseEntitlement.findOne({
        _id: { $ne: ent._id },
        companyId,
        policyId: targetPolicyId,
        levelNumber: targetLevelNumber,
        gradeCode: targetGradeCode,
        cityClass: targetCityClass,
        expenseTypeCode: targetTypeCode,
      });

      if (existing) {
        existing.amount = body.amount !== undefined ? Number(body.amount) : ent.amount;
        if (body.unit !== undefined) existing.unit = body.unit;
        if (body.formula !== undefined) existing.formula = body.formula;
        if (body.ruleCode !== undefined) existing.ruleCode = body.ruleCode;
        if (body.status !== undefined) existing.status = body.status;
        await existing.save();
        await ExpenseEntitlement.findByIdAndDelete(ent._id);
        return res.json({ success: true, data: existing });
      }
    }

    if (body.levelNumber !== undefined) {
      ent.levelNumber = targetLevelNumber;
      const lvlDoc = await Level.findOne({ companyId, levelNumber: targetLevelNumber });
      if (lvlDoc) {
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

    await ent.save();
    res.json({ success: true, data: ent });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * DELETE /api/expense/entitlements/:id — deactivate entitlement
 */
exports.deleteEntitlement = async (req, res) => {
  try {
    const ent = await ExpenseEntitlement.findById(req.params.id);
    if (!ent) return res.status(404).json({ success: false, message: 'Entitlement not found' });
    ent.status = 'inactive';
    await ent.save();
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
      .select('name employeeIdCode department designation workingPlace role roleCode levelRef gradeRef email')
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
 * GET /api/expense/travel-modes/all — all travel modes (incl. inactive)
 */
exports.listAllTravelModes = async (req, res) => {
  try {
    const companyId = await resolveTenantCompanyId(req);
    await ensureExpenseMasters(companyId);
    const modes = await TravelMode.find({ companyId }).sort({ order: 1, name: 1 }).lean();
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

    const mode = await TravelMode.create({
      companyId,
      company: companyId,
      code,
      name: body.name,
      description: body.description || '',
      status: body.status || 'active',
      order: Number(body.order) || 0,
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
    if (!mode) return res.status(404).json({ success: false, message: 'Travel mode not found' });
    const allowed = ['name', 'code', 'description', 'status', 'order'];
    allowed.forEach(k => {
      if (req.body[k] !== undefined) mode[k] = req.body[k];
    });
    await mode.save();
    res.json({ success: true, data: mode });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * DELETE /api/expense/travel-modes/:id — deactivate travel mode
 */
exports.deleteTravelMode = async (req, res) => {
  try {
    const mode = await TravelMode.findById(req.params.id);
    if (!mode) return res.status(404).json({ success: false, message: 'Travel mode not found' });
    mode.status = 'inactive';
    await mode.save();
    res.json({ success: true, data: mode });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
