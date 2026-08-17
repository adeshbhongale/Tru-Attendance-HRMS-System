const LeavePolicy = require('../models/LeavePolicy');
const LeavePolicyRule = require('../models/LeavePolicyRule');
const LeavePeriod = require('../models/LeavePeriod');
const LeaveLedger = require('../models/LeaveLedger');
const LeaveType = require('../models/LeaveType');
const User = require('../models/User');
const Leave = require('../models/Leave');
const periodService = require('../services/leave/periodService');
const policyService = require('../services/leave/policyService');
const ledgerService = require('../services/leave/ledgerService');
const leaveBalanceService = require('../services/leaveBalanceService');
const { getISTDateComponents } = require('../utils/timezone');

// @desc    List leave policies (with their rules)
// @route   GET /api/leave/policies
// @access  Private/Admin
exports.getPolicies = async (req, res, next) => {
  try {
    const companyId = req.tenant?.companyId || null;
    const policies = await LeavePolicy.find(companyId ? { companyId } : {}).lean();
    const rules = await policyService.rulesForPolicies(policies.map((p) => p._id));

    const data = policies.map((p) => ({
      ...p,
      rules: rules.filter((r) => r.policyId.toString() === p._id.toString()),
    }));

    res.status(200).json({ success: true, count: data.length, data });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    Create a leave policy
// @route   POST /api/leave/policies
// @access  Private/Admin
exports.createPolicy = async (req, res, next) => {
  try {
    const companyId = req.tenant?.companyId || null;
    const { leaveTypeRef, periodType, carryForward, maxCarryForward, prorateNewJoiner, name } = req.body;

    if (!leaveTypeRef) {
      return res.status(400).json({ success: false, message: 'leaveTypeRef is required' });
    }

    const existing = await LeavePolicy.findOne({ companyId, leaveTypeRef });
    if (existing) {
      return res.status(400).json({ success: false, message: 'A policy already exists for this leave type' });
    }

    const policy = await LeavePolicy.create({
      companyId,
      leaveTypeRef,
      name: name || undefined,
      periodType: periodType || 'YEARLY',
      carryForward: carryForward || false,
      maxCarryForward: maxCarryForward || 0,
      prorateNewJoiner: prorateNewJoiner !== undefined ? prorateNewJoiner : true,
    });

    res.status(201).json({ success: true, data: policy });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    Update a leave policy
// @route   PUT /api/leave/policies/:id
// @access  Private/Admin
exports.updatePolicy = async (req, res, next) => {
  try {
    const companyId = req.tenant?.companyId || null;
    const { periodType, carryForward, maxCarryForward, prorateNewJoiner, name, status } = req.body;

    const policy = await LeavePolicy.findOne({ _id: req.params.id, ...(companyId ? { companyId } : {}) });
    if (!policy) return res.status(404).json({ success: false, message: 'Policy not found' });

    if (periodType !== undefined) policy.periodType = periodType;
    if (carryForward !== undefined) policy.carryForward = carryForward;
    if (maxCarryForward !== undefined) policy.maxCarryForward = maxCarryForward;
    if (prorateNewJoiner !== undefined) policy.prorateNewJoiner = prorateNewJoiner;
    if (name !== undefined) policy.name = name;
    if (status !== undefined) policy.status = status;

    await policy.save();
    res.status(200).json({ success: true, data: policy });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    Delete a leave policy (and its rules)
// @route   DELETE /api/leave/policies/:id
// @access  Private/Admin
exports.deletePolicy = async (req, res, next) => {
  try {
    const companyId = req.tenant?.companyId || null;
    const policy = await LeavePolicy.findOne({ _id: req.params.id, ...(companyId ? { companyId } : {}) });
    if (!policy) return res.status(404).json({ success: false, message: 'Policy not found' });

    await LeavePolicyRule.deleteMany({ policyId: policy._id });
    await policy.deleteOne();
    res.status(200).json({ success: true, message: 'Policy deleted' });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    Add a rule to a policy
// @route   POST /api/leave/policies/:id/rules
// @access  Private/Admin
exports.addRule = async (req, res, next) => {
  try {
    const companyId = req.tenant?.companyId || null;
    const { scopeType, scopeRef, scopeCode, days } = req.body;

    const policy = await LeavePolicy.findOne({ _id: req.params.id, ...(companyId ? { companyId } : {}) });
    if (!policy) return res.status(404).json({ success: false, message: 'Policy not found' });

    if (!['employee', 'role', 'level', 'grade', 'department', 'company'].includes(scopeType)) {
      return res.status(400).json({ success: false, message: 'Invalid scopeType' });
    }
    if (scopeType === 'company' && scopeCode === undefined) {
      // company default rule key
    }

    const rule = await LeavePolicyRule.create({
      companyId,
      policyId: policy._id,
      scopeType,
      scopeRef: scopeRef || null,
      scopeCode: scopeCode || null,
      days: Number(days),
    });

    res.status(201).json({ success: true, data: rule });
  } catch (err) {
    res.status(err.code === 11000 ? 400 : 400).json({
      success: false,
      message: err.code === 11000 ? 'A rule with this scope already exists for this policy' : err.message,
    });
  }
};

// @desc    Update a rule
// @route   PUT /api/leave/policies/:id/rules/:ruleId
// @access  Private/Admin
exports.updateRule = async (req, res, next) => {
  try {
    const companyId = req.tenant?.companyId || null;
    const { scopeType, scopeRef, scopeCode, days } = req.body;

    const rule = await LeavePolicyRule.findOne({
      _id: req.params.ruleId,
      policyId: req.params.id,
      ...(companyId ? { companyId } : {}),
    });
    if (!rule) return res.status(404).json({ success: false, message: 'Rule not found' });

    if (scopeType !== undefined) rule.scopeType = scopeType;
    if (scopeRef !== undefined) rule.scopeRef = scopeRef;
    if (scopeCode !== undefined) rule.scopeCode = scopeCode;
    if (days !== undefined) rule.days = Number(days);

    await rule.save();
    res.status(200).json({ success: true, data: rule });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    Delete a rule
// @route   DELETE /api/leave/policies/:id/rules/:ruleId
// @access  Private/Admin
exports.deleteRule = async (req, res, next) => {
  try {
    const companyId = req.tenant?.companyId || null;
    const rule = await LeavePolicyRule.findOne({
      _id: req.params.ruleId,
      policyId: req.params.id,
      ...(companyId ? { companyId } : {}),
    });
    if (!rule) return res.status(404).json({ success: false, message: 'Rule not found' });

    await rule.deleteOne();
    res.status(200).json({ success: true, message: 'Rule deleted' });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    List materialised periods for a policy/periodType
// @route   GET /api/leave/periods?periodType=YEARLY&year=2026
// @access  Private/Admin
exports.getPeriods = async (req, res, next) => {
  try {
    const companyId = req.tenant?.companyId || null;
    const { periodType, year } = req.query;

    const filter = { ...(companyId ? { companyId } : {}) };
    if (periodType) filter.periodType = periodType;
    if (year) filter.year = Number(year);

    const periods = await LeavePeriod.find(filter).sort('-startDate').lean();
    res.status(200).json({ success: true, count: periods.length, data: periods });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    Get the ledger for an employee (optionally periodKey-filtered)
// @route   GET /api/leave/ledger?userId=xxx&periodKey=2026-YEARLY
// @access  Private/Admin
exports.getLedger = async (req, res, next) => {
  try {
    const companyId = req.tenant?.companyId || null;
    const { userId, periodKey } = req.query;
    if (!userId) return res.status(400).json({ success: false, message: 'userId is required' });

    const entries = await ledgerService.entriesFor({
      companyId,
      userId,
      ...(periodKey ? { periodKey } : {}),
    });

    res.status(200).json({ success: true, count: entries.length, data: entries });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    Post a manual ledger adjustment (Admin) — the single source of truth
// @route   POST /api/leave/ledger/adjust
// @access  Private/Admin
exports.adjustBalance = async (req, res, next) => {
  try {
    const companyId = req.tenant?.companyId || null;
    const { userId, leaveTypeRef, periodKey, quantity, note } = req.body;

    if (!userId || !leaveTypeRef || !periodKey) {
      return res.status(400).json({ success: false, message: 'userId, leaveTypeRef and periodKey are required' });
    }
    if (typeof quantity !== 'number' || Number.isNaN(quantity)) {
      return res.status(400).json({ success: false, message: 'quantity must be a number' });
    }

    const entry = await ledgerService.postEntry({
      companyId,
      userId,
      leaveTypeRef,
      periodKey,
      entryType: ledgerService.ADJUST,
      quantity,
      note: note || 'Manual adjustment',
    });

    res.status(201).json({ success: true, data: entry });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    Get policy-aware balances for one employee (with ledger summary)
// @route   GET /api/leave/balances?userId=xxx&refDate=YYYY-MM-DD
// @access  Private/Admin
exports.getPolicyBalances = async (req, res, next) => {
  try {
    const companyId = req.tenant?.companyId || null;
    const userId = req.query.userId;
    if (!userId) return res.status(400).json({ success: false, message: 'userId is required' });

    const user = await User.findById(userId).lean();
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const quotas = await leaveBalanceService.getEmployeeQuotas(userId, companyId, req.query.refDate ? new Date(req.query.refDate) : new Date());
    const periodKey = req.query.periodKey;

    const rows = [];
    for (const q of quotas) {
      const ledger = periodKey
        ? await ledgerService.summarize(companyId, userId, q.leaveTypeRef, periodKey)
        : null;
      rows.push({ ...q, ledger: ledger ? {
        granted: ledger.granted,
        adjusted: ledger.adjusted,
        used: ledger.used,
        encashed: ledger.encashed,
        cancelled: ledger.cancelled,
        balance: ledger.balance,
      } : null });
    }

    res.status(200).json({ success: true, data: { user, quotas: rows } });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    Get the dropdown options used to build policy rules
// @route   GET /api/leave/policies/meta
// @access  Private/Admin
exports.getPolicyMeta = async (req, res, next) => {
  try {
    const companyId = req.tenant?.companyId || null;
    const [levels, grades, departments, roles, employees] = await Promise.all([
      require('../models/Level').find(companyId ? { companyId } : {}).select('_id name').lean(),
      require('../models/Grade').find(companyId ? { companyId } : {}).select('_id name').lean(),
      require('../models/Department').find(companyId ? { companyId } : {}).select('_id name').lean(),
      User.aggregate([
        {
          $match: {
            roleCode: { $ne: null, $nin: ['TCSA1', 'TCCA1', 'SUPER_ADMIN', 'SUPERADMIN', 'COMPANY_ADMIN', 'COMPANYADMIN', 'ADMIN', 'HR', 'HR_ADMIN', 'STORE_ADMIN', 'ACCOUNTS_ADMIN', 'FINANCE', 'MANAGEMENT'] },
            role: { $nin: ['superadmin', 'super_admin', 'company_admin', 'companyadmin', 'admin', 'hr', 'hr_admin', 'store', 'store_admin', 'accounts', 'account_admin', 'finance', 'management', 'department_admin'] },
            ...(companyId ? { companyId } : {})
          }
        },
        { $group: { _id: '$roleCode' } },
        { $sort: { _id: 1 } },
      ]),
      User.find({
        role: { $nin: ['superadmin', 'super_admin', 'company_admin', 'companyadmin', 'admin', 'hr', 'hr_admin', 'store', 'store_admin', 'accounts', 'account_admin', 'finance', 'management', 'department_admin'] },
        roleCode: { $nin: ['TCSA1', 'TCCA1', 'SUPER_ADMIN', 'SUPERADMIN', 'COMPANY_ADMIN', 'COMPANYADMIN', 'ADMIN', 'HR', 'HR_ADMIN', 'STORE_ADMIN', 'ACCOUNTS_ADMIN', 'FINANCE', 'MANAGEMENT'] },
        ...(companyId ? { companyId } : {})
      })
        .select('name designation department roleCode')
        .sort('name')
        .lean(),
    ]);

    res.status(200).json({
      success: true,
      data: {
        levels,
        grades,
        departments,
        roles: roles.map((r) => r._id),
        employees,
      },
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};