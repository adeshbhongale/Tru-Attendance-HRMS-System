const ExpensePolicy = require('../models/ExpensePolicy');
const ExpenseType = require('../models/ExpenseType');
const CityClassification = require('../models/CityClassification');
const ExpenseEntitlement = require('../models/ExpenseEntitlement');
const TravelMode = require('../models/TravelMode');
const User = require('../../../../models/User');
const Company = require('../../../../models/Company');
const { ensureExpenseMasters } = require('../services/seedExpenseMasters');
const { getActivePolicy, resolveCityClass, getExpenseTypes } = require('../services/policyEngine');

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
      sharedLodgingPercent: body.sharedLodgingPercent !== undefined ? Number(body.sharedLodgingPercent) : 75,
      conveyanceRates: body.conveyanceRates,
      localTravelFoodAllowed: body.localTravelFoodAllowed,
      deadlineRules: body.deadlineRules || [],
      sharedLodgingConfig: body.sharedLodgingConfig,
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
    if (!policy) return res.status(404).json({ success: false, message: 'Policy not found' });
    const allowed = [
      'name', 'description', 'version', 'policyVersion', 'status',
      'effectiveFrom', 'effectiveTo', 'approvalRequired', 'approvalEngine',
      'sharedLodgingRule', 'sharedLodgingPercent', 'conveyanceRates',
      'localTravelFoodAllowed', 'deadlineRules', 'sharedLodgingConfig',
    ];
    allowed.forEach(k => {
      if (req.body[k] !== undefined) policy[k] = req.body[k];
    });
    if (req.body.approvalRequired !== undefined) {
      policy.approvalEngine = req.body.approvalRequired ? 'HR' : 'NONE';
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
    const companyId = req.tenant?.companyId || req.companyId || null;
    const policy = await ExpensePolicy.findById(req.params.id);
    if (!policy) return res.status(404).json({ success: false, message: 'Policy not found' });

    // Deactivate other active policies of same code
    await ExpensePolicy.updateMany(
      { companyId, code: policy.code, _id: { $ne: policy._id }, status: 'active' },
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
    if (!type) return res.status(404).json({ success: false, message: 'Type not found' });
    const allowed = ['name', 'description', 'category', 'fields', 'calculationMethod', 'proofRequired', 'selfAttestationAllowed', 'hrApprovalRequired', 'eligibilityRule', 'status', 'order'];
    allowed.forEach(k => {
      if (req.body[k] !== undefined) type[k] = req.body[k];
    });
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
    if (!type) return res.status(404).json({ success: false, message: 'Type not found' });
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
    const allowed = ['cityClass', 'state', 'aliases', 'status'];
    allowed.forEach(k => {
      if (req.body[k] !== undefined) city[k] = req.body[k];
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
    const policy = await getActivePolicy(companyId);
    if (!policy) return res.json({ success: true, data: [] });
    const entitlements = await ExpenseEntitlement.find({ companyId, policyId: policy._id, status: 'active' }).lean();
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
    const { policyId } = req.query;
    const filter = { companyId };
    if (policyId) filter.policyId = policyId;
    const entitlements = await ExpenseEntitlement.find(filter).sort({ levelNumber: 1, cityClass: 1, expenseTypeCode: 1 }).lean();
    res.json({ success: true, data: entitlements });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * POST /api/expense/entitlements — create entitlement
 */
exports.createEntitlement = async (req, res) => {
  try {
    const companyId = await resolveTenantCompanyId(req);
    const body = req.body || {};
    if (!body.levelNumber || !body.expenseTypeCode || !body.cityClass || !body.amount) {
      return res.status(400).json({ success: false, message: 'levelNumber, expenseTypeCode, cityClass and amount are required.' });
    }
    const policy = await getActivePolicy(companyId);
    const entitlement = await ExpenseEntitlement.create({
      companyId,
      company: companyId,
      policyId: body.policyId || (policy && policy._id) || null,
      policyVersionId: body.policyVersionId || null,
      levelNumber: Number(body.levelNumber),
      levelRef: body.levelRef || null,
      levelName: body.levelName || '',
      gradeCode: body.gradeCode || '',
      gradeRef: body.gradeRef || null,
      cityClass: body.cityClass,
      expenseTypeCode: String(body.expenseTypeCode).toUpperCase(),
      expenseTypeRef: body.expenseTypeRef || null,
      amount: Number(body.amount),
      unit: body.unit || 'per_day',
      formula: body.formula || '',
      ruleCode: body.ruleCode || '',
      status: body.status || 'active',
      createdBy: req.user?._id || null,
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
    const allowed = ['policyId', 'levelNumber', 'levelRef', 'levelName', 'gradeCode', 'gradeRef', 'cityClass', 'expenseTypeCode', 'expenseTypeRef', 'amount', 'unit', 'formula', 'ruleCode', 'status'];
    allowed.forEach(k => {
      if (req.body[k] !== undefined) ent[k] = req.body[k];
    });
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
    const statusUpper = { $nin: ['INACTIVE', 'DISABLED', 'TERMINATED', 'SUSPENDED', 'LOCKED'] };
    filter.status = statusUpper;
    filter.$or = [
      { role: { $nin: ['superadmin', 'TCSA1'] } },
      { role: { $exists: false } },
    ];

    if (search) {
      const q = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$and = [
        { $or: [
          { name: { $regex: q, $options: 'i' } },
          { employeeIdCode: { $regex: q, $options: 'i' } },
          { email: { $regex: q, $options: 'i' } },
          { department: { $regex: q, $options: 'i' } },
        ] },
      ];
    }

    const employees = await User.find(filter)
      .populate('levelRef')
      .populate('gradeRef')
      .select('name employeeIdCode department role roleCode levelRef gradeRef email')
      .sort({ name: 1 })
      .limit(parseInt(req.query.limit) || 500)
      .lean();

    const data = employees.map(e => ({
      _id: e._id,
      name: e.name,
      employeeIdCode: e.employeeIdCode,
      department: e.department,
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
