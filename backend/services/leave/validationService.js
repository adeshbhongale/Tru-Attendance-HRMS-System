const LeaveType = require('../../models/LeaveType');
const { getCompanyLeaveContext, calculateLeaveDays } = require('./daysService');
const periodService = require('./periodService');
const policyService = require('./policyService');
const ledgerService = require('./ledgerService');

// Resolve a LeaveType by code, _id, or name (name fallback for legacy records).
exports.resolveLeaveType = async (companyId, value) => {
  let lt = null;
  if (!value) return null;

  const baseFilter = { status: 'active', ...(companyId ? { companyId } : {}) };

  if (typeof value === 'string' && value.length >= 12 && /^[0-9a-fA-F]{24}$/.test(value)) {
    lt = await LeaveType.findOne({ ...baseFilter, _id: value }).lean();
  }
  if (!lt) {
    lt = await LeaveType.findOne({ ...baseFilter, code: value }).lean();
  }
  if (!lt) {
    lt = await LeaveType.findOne({ ...baseFilter, name: value }).lean();
  }
  return lt;
};

// Resolve the effective entitlement + period for a user + leave type.
// Prefers policy rules; falls back to legacy LeaveType.limit / HR override.
exports.entitlementFor = async (user, companyId, leaveTypeRef, overrides, refDate = new Date()) => {
  const lt = leaveTypeRef && leaveTypeRef._id
    ? leaveTypeRef
    : await exports.resolveLeaveType(companyId, leaveTypeRef);
  if (!lt) return null;

  const policy = await policyService.policyForType(companyId, lt._id);
  let period;
  let entitlement;
  let scopeType = null;

  if (policy) {
    const rules = await policyService.rulesForPolicies([policy._id]);
    const resolved = await policyService.effectiveEntitlement(user, companyId, lt._id, policy, rules, refDate);
    period = periodService.getPeriodWindow(policy.periodType, refDate);
    if (resolved) {
      entitlement = resolved.days;
      scopeType = resolved.scopeType;
    } else {
      entitlement = policyService.legacyEntitlement(lt, overrides, user._id.toString());
    }
  } else {
    period = periodService.getPeriodWindow(
      lt.limitType === 'Monthly' ? 'MONTHLY' : 'YEARLY',
      refDate
    );
    entitlement = policyService.legacyEntitlement(lt, overrides, user._id.toString());
  }

  return {
    lt,
    policy,
    period,
    entitlement,
    scopeType,
  };
};

// Compute a full quota row (entitled / used / pending / balance) for a leave
// type. Ledger holds approved consumption; pending is derived from Leave docs.
exports.quotaRow = async (
  user,
  companyId,
  lt,
  policy,
  period,
  entitlement,
  pendingLeaves,
  context
) => {
  const ledger = await ledgerService.summarize(companyId, user._id, lt._id, period.periodKey);
  const used = ledger.used;
  const pending = (pendingLeaves || [])
    .filter((l) => {
      const sameType =
        l.leaveType === lt.name ||
        l.leaveType === lt.code ||
        (l.leaveTypeRef && l.leaveTypeRef.toString() === lt._id.toString());
      if (!sameType) return false;
      if (l.periodKey) return l.periodKey === period.periodKey;
      const d = new Date(l.startDate).getTime();
      return d >= new Date(period.start).getTime() && d <= new Date(period.end).getTime();
    })
    .reduce((acc, l) => acc + calculateLeaveDays(l, context), 0);

  const cleanLimit = Math.round((Number(entitlement) || 0) * 2) / 2;
  const cleanUsed = Math.round((Number(used) || 0) * 2) / 2;
  const cleanPending = Math.round((Number(pending) || 0) * 2) / 2;
  const cleanBalance = Math.max(0, Math.round((cleanLimit - cleanUsed) * 2) / 2);

  return {
    name: lt.name,
    code: lt.code,
    limit: cleanLimit,
    limitType: policy?.periodType === 'MONTHLY' ? 'Monthly'
      : policy?.periodType === 'QUARTERLY' ? 'Quarterly' : 'Yearly',
    periodType: policy?.periodType || (lt.limitType === 'Monthly' ? 'MONTHLY' : 'YEARLY'),
    periodKey: period.periodKey,
    periodStart: period.start,
    periodEnd: period.end,
    used: cleanUsed,
    pending: cleanPending,
    balance: cleanBalance,
  };
};