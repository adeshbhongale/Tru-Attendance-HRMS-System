const Leave = require('../models/Leave');
const LeaveType = require('../models/LeaveType');
const LeaveBalance = require('../models/LeaveBalance');
const periodService = require('./leave/periodService');
const policyService = require('./leave/policyService');
const ledgerService = require('./leave/ledgerService');
const validationService = require('./leave/validationService');
const daysService = require('./leave/daysService');

// Re-export the day/context helpers (used by controllers and other services).
exports.getCompanyLeaveContext = daysService.getCompanyLeaveContext;
exports.calculateLeaveDays = daysService.calculateLeaveDays;
exports.getPeriodWindow = periodService.getPeriodWindow;
exports.resolveLeaveType = validationService.resolveLeaveType;

const restructureDate = (date) => daysService.getStartOfDayIST(new Date(date));

// Load per-employee custom leave allowances for one (or many) users.
// Returns a Map: userKey -> Map(leaveTypeRef|code -> LeaveBalance doc)
exports.getBalanceOverrides = async (userIds, companyId) => {
  if (!userIds || (Array.isArray(userIds) && userIds.length === 0)) return new Map();
  const list = Array.isArray(userIds) ? userIds : [userIds];
  const docs = await LeaveBalance.find({
    userId: { $in: list },
    ...(companyId ? { companyId } : {}),
  }).lean();

  const byUser = new Map();
  docs.forEach((doc) => {
    const key = doc.userId.toString();
    if (!byUser.has(key)) byUser.set(key, new Map());
    const inner = byUser.get(key);
    inner.set(doc.leaveTypeRef ? doc.leaveTypeRef.toString() : doc.code, doc);
    if (doc.code) inner.set(doc.code, doc);
  });
  return byUser;
};

// Effective limit for a leave type: custom allowance if HR set one, else type default.
const effectiveLimit = (lt, overrideMap, userKey) => {
  if (overrideMap && userKey && overrideMap.has(userKey)) {
    const inner = overrideMap.get(userKey);
    const override = (lt._id && inner.get(lt._id.toString())) || (inner.get(lt.code) || null);
    if (override && typeof override.limit === 'number') return override.limit;
  }
  return lt.limit;
};

// Given a leave and a period, decide whether it belongs to that period (by start date).
const inPeriod = (l, period) => {
  const d = restructureDate(l.startDate);
  return d >= period.start && d <= period.end;
};

// Sum working days of leaves filtered to a given type + period.
const sumDays = (leaves, context, lt, period) =>
  leaves
    .filter((l) => {
      const nameA = (l.leaveType || '').toLowerCase().trim();
      const nameB = (lt.name || '').toLowerCase().trim();
      const codeB = (lt.code || '').toLowerCase().trim();
      const sameType =
        nameA === nameB ||
        nameA === codeB ||
        (nameA && nameB && (nameA.includes(nameB) || nameB.includes(nameA))) ||
        (l.leaveTypeRef && lt._id && l.leaveTypeRef.toString() === lt._id.toString());
      return sameType;
    })
    .reduce((acc, l) => acc + exports.calculateLeaveDays(l, context), 0);

// Compute per-type quotas (used/balance/pending) for an employee in the
// period of a reference date (defaults to today).
// Policy-aware: entitlement comes from leave policy rules when configured;
// otherwise falls back to legacy LeaveType.limit / HR LeaveBalance override.
exports.getEmployeeQuotas = async (userId, companyId, refDate = new Date()) => {
  const user = await require('../models/User').findById(userId).lean();
  let [context, activeTypes, approvedLeaves, pendingLeaves, overrides] = await Promise.all([
    exports.getCompanyLeaveContext(companyId),
    LeaveType.find({ status: 'active', ...(companyId ? { companyId } : {}) }).lean(),
    Leave.find({ user: userId, status: 'Approved' }).lean(),
    Leave.find({ user: userId, status: 'Pending' }).lean(),
    exports.getBalanceOverrides(userId, companyId),
  ]);

  if (!activeTypes || activeTypes.length === 0) {
    activeTypes = await LeaveType.find({ status: 'active' }).lean();
  }
  if (!activeTypes || activeTypes.length === 0) {
    activeTypes = await LeaveType.find({}).lean();
  }

  // Fallback default leave types if database contains no LeaveType records
  if (!activeTypes || activeTypes.length === 0) {
    const userBalance = Math.max(0, user?.leaveBalance ?? 12);
    activeTypes = [
      { name: 'Casual Leave', code: 'CL', limit: userBalance, limitType: 'Yearly' },
      { name: 'Sick Leave', code: 'SL', limit: 10, limitType: 'Yearly' },
      { name: 'Paid Leave', code: 'PL', limit: 15, limitType: 'Yearly' },
    ];
  }

  const userKey = userId.toString();
  const rows = [];

  for (const lt of activeTypes) {
    const policy = lt._id ? await policyService.policyForType(companyId, lt._id) : null;
    let period;
    let limit;

    let isIneligible = false;
    if (policy) {
      const rules = await policyService.rulesForPolicies([policy._id]);
      const hasTargetRules = rules && rules.some(r => r.scopeType !== 'company');
      const resolved = await policyService.effectiveEntitlement(user, companyId, lt._id, policy, rules, refDate);
      period = periodService.getPeriodWindow(policy.periodType, refDate);
      if (hasTargetRules && !resolved) {
        limit = 0;
        isIneligible = true;
      } else {
        limit = Math.max(0, resolved ? resolved.days : effectiveLimit(lt, overrides, userKey));
      }
    } else {
      period = periodService.getPeriodWindow(
        lt.limitType === 'Monthly' ? 'MONTHLY' : 'YEARLY',
        refDate
      );
      limit = Math.max(0, effectiveLimit(lt, overrides, userKey));
    }

    const cleanLimit = Math.round((Number(limit) || 0) * 2) / 2;
    const cleanUsed = Math.round((Number(sumDays(approvedLeaves, context, lt, period)) || 0) * 2) / 2;
    const cleanPending = Math.round((Number(sumDays(pendingLeaves, context, lt, period)) || 0) * 2) / 2;
    const cleanBalance = Math.max(0, Math.round((cleanLimit - cleanUsed) * 2) / 2);

    rows.push({
      name: lt.name,
      code: lt.code,
      limit: cleanLimit,
      limitType: policy ? (policy.periodType === 'MONTHLY' ? 'Monthly' : policy.periodType === 'QUARTERLY' ? 'Quarterly' : 'Yearly') : (lt.limitType || 'Yearly'),
      periodType: policy ? policy.periodType : (lt.limitType === 'Monthly' ? 'MONTHLY' : 'YEARLY'),
      genderRestriction: lt.genderRestriction,
      allowedDurations: lt.allowedDurations || ['Full Day', 'Half Day', 'Multiple Days'],
      allowFullDay: lt.allowFullDay !== false,
      allowHalfDay: lt.allowHalfDay !== false,
      allowMultipleDays: lt.allowMultipleDays !== false,
      leaveTypeRef: lt._id || null,
      periodStart: period.start,
      periodEnd: period.end,
      periodKey: period.periodKey,
      used: cleanUsed,
      pending: cleanPending,
      balance: cleanBalance,
      ineligible: isIneligible,
    });
  }

  return rows;
};

// Bulk compute per-employee quotas for many employees at once (used by the
// leave dashboard). Returns a Map keyed by userId.
exports.getEmployeesQuotasMap = async (userIds, companyId, refDate = new Date()) => {
  const context = await exports.getCompanyLeaveContext(companyId);
  const [activeTypes, approvedLeaves, pendingLeaves, overrides] = await Promise.all([
    LeaveType.find({ status: 'active', ...(companyId ? { companyId } : {}) }).lean(),
    Leave.find({
      user: { $in: userIds },
      ...(companyId ? { companyId } : {}),
      status: 'Approved',
    }).lean(),
    Leave.find({
      user: { $in: userIds },
      ...(companyId ? { companyId } : {}),
      status: 'Pending',
    }).lean(),
    exports.getBalanceOverrides(userIds, companyId),
  ]);

  const users = await require('../models/User').find({ _id: { $in: userIds } }).lean();
  const usersById = new Map(users.map((u) => [u._id.toString(), u]));

  const policiesByType = {};
  const rulesCache = {};

  const quotasMap = new Map();
  for (const uid of userIds) {
    const key = uid.toString();
    const user = usersById.get(key);
    const rows = [];

    for (const lt of activeTypes) {
      if (!policiesByType[lt._id.toString()]) {
        policiesByType[lt._id.toString()] = await policyService.policyForType(companyId, lt._id);
      }
      const policy = policiesByType[lt._id.toString()];
      let period;
      let limit;

      let isIneligible = false;
      if (policy) {
        if (!rulesCache[policy._id.toString()]) {
          rulesCache[policy._id.toString()] = await policyService.rulesForPolicies([policy._id]);
        }
        const rules = rulesCache[policy._id.toString()] || [];
        const hasTargetRules = rules && rules.some(r => r.scopeType !== 'company');
        const resolved = user ? await policyService.effectiveEntitlement(user, companyId, lt._id, policy, rules, refDate) : null;
        period = periodService.getPeriodWindow(policy.periodType, refDate);
        if (hasTargetRules && !resolved) {
          limit = 0;
          isIneligible = true;
        } else {
          limit = Math.max(0, resolved ? resolved.days : effectiveLimit(lt, overrides, key));
        }
      } else {
        period = periodService.getPeriodWindow(
          lt.limitType === 'Monthly' ? 'MONTHLY' : 'YEARLY',
          refDate
        );
        limit = effectiveLimit(lt, overrides, key);
      }

      const userApproved = approvedLeaves.filter((l) => l.user && l.user.toString() === key);
      const userPending = pendingLeaves.filter((l) => l.user && l.user.toString() === key);

      const cleanLimit = Math.round((Number(limit) || 0) * 2) / 2;
      const cleanUsed = Math.round((Number(sumDays(userApproved, context, lt, period)) || 0) * 2) / 2;
      const cleanPending = Math.round((Number(sumDays(userPending, context, lt, period)) || 0) * 2) / 2;
      const cleanBalance = Math.max(0, Math.round((cleanLimit - cleanUsed) * 2) / 2);

      rows.push({
        name: lt.name,
        code: lt.code,
        limit: cleanLimit,
        limitType: policy ? (policy.periodType === 'MONTHLY' ? 'Monthly' : policy.periodType === 'QUARTERLY' ? 'Quarterly' : 'Yearly') : lt.limitType,
        periodType: policy ? policy.periodType : (lt.limitType === 'Monthly' ? 'MONTHLY' : 'YEARLY'),
        allowedDurations: lt.allowedDurations || ['Full Day', 'Half Day', 'Multiple Days'],
        allowFullDay: lt.allowFullDay !== false,
        allowHalfDay: lt.allowHalfDay !== false,
        allowMultipleDays: lt.allowMultipleDays !== false,
        used: cleanUsed,
        pending: cleanPending,
        balance: cleanBalance,
        ineligible: isIneligible,
      });
    }
    quotasMap.set(key, rows);
  }

  return quotasMap;
};

// Check whether an employee can apply for `requestedDays` of a leave type.
// Policy-aware: entitlement comes from policy rules when configured; otherwise
// falls back to legacy LeaveType.limit / HR LeaveBalance override.
exports.canApplyForLeave = async (userId, companyId, lt, requestedDays, refDate = new Date()) => {
  const user = await require('../models/User').findById(userId).lean();
  const context = await exports.getCompanyLeaveContext(companyId);

  const [approvedLeaves, pendingLeaves, overrides] = await Promise.all([
    Leave.find({ user: userId, ...(companyId ? { companyId } : {}), status: 'Approved' }).lean(),
    Leave.find({ user: userId, ...(companyId ? { companyId } : {}), status: 'Pending' }).lean(),
    exports.getBalanceOverrides(userId, companyId),
  ]);

  const policy = await policyService.policyForType(companyId, lt._id);
  let period;
  let limit;

  if (policy) {
    const rules = await policyService.rulesForPolicies([policy._id]);
    const hasTargetRules = rules && rules.some(r => r.scopeType !== 'company');
    const resolved = await policyService.effectiveEntitlement(user, companyId, lt._id, policy, rules, refDate);
    period = periodService.getPeriodWindow(policy.periodType, refDate);
    if (hasTargetRules && !resolved) {
      return {
        allowed: false,
        reason: 'ineligible',
        limit: 0,
        remaining: 0,
        message: `${lt.name} is not applicable for your level/role.`,
      };
    }
    limit = resolved ? resolved.days : effectiveLimit(lt, overrides, userId.toString());
  } else {
    period = periodService.getPeriodWindow(
      lt.limitType === 'Monthly' ? 'MONTHLY' : 'YEARLY',
      refDate
    );
    limit = effectiveLimit(lt, overrides, userId.toString());
  }

  const used = sumDays(approvedLeaves, context, lt, period);
  const pending = sumDays(pendingLeaves, context, lt, period);

  return {
    allowed: used + pending + requestedDays <= limit,
    limit,
    used,
    pending,
    remaining: limit - (used + pending),
    period,
  };
};

// Upsert an employee's custom leave allowance for a leave type.
exports.setEmployeeLeaveBalance = async (
  userId,
  companyId,
  leaveTypeId,
  limit
) => {
  const type = leaveTypeId
    ? await LeaveType.findOne({ _id: leaveTypeId, ...(companyId ? { companyId } : {}) }).lean()
    : null;
  if (!type) {
    const err = new Error('Leave type not found');
    err.statusCode = 404;
    throw err;
  }
  if (typeof limit !== 'number' || limit < 0) {
    const err = new Error('Leave allowance must be a non-negative number');
    err.statusCode = 400;
    throw err;
  }

  const doc = await LeaveBalance.findOneAndUpdate(
    { companyId, userId, leaveTypeRef: type._id },
    {
      $set: {
        leaveType: type.name,
        code: type.code,
        limit,
        limitType: type.limitType,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return doc;
};

// Seed default leave allowances for a user from active leave types (used when
// the admin opens the balance manager so every type is visible/editable).
exports.ensureEmployeeBalances = async (userId, companyId) => {
  const activeTypes = await LeaveType.find({ status: 'active', ...(companyId ? { companyId } : {}) }).lean();
  const existing = await LeaveBalance.find({ userId, ...(companyId ? { companyId } : {}) }).lean();
  const existingMap = new Map(
    existing.map((doc) => [doc.leaveTypeRef ? doc.leaveTypeRef.toString() : doc.code, doc])
  );

  for (const lt of activeTypes) {
    const key = lt._id.toString();
    if (existingMap.has(key)) continue;
    await LeaveBalance.create({
      companyId,
      userId,
      leaveTypeRef: lt._id,
      leaveType: lt.name,
      code: lt.code,
      limit: lt.limit,
      limitType: lt.limitType,
    });
  }
  return activeTypes.length;
};