const LeavePolicy = require('../../models/LeavePolicy');
const LeavePolicyRule = require('../../models/LeavePolicyRule');
const LeaveType = require('../../models/LeaveType');
const { getPeriodWindow } = require('./periodService');
const { getISTDateComponents } = require('../../utils/timezone');

// ── Policy engine ────────────────────────────────────────────────────────────
// Effective entitlement for an employee comes from leave policy rules resolved
// in priority order:
//   Employee-specific rule > Role (roleCode) > Level > Grade > Department >
//   Company default (scopeType=company, scopeCode='_default').
// If a leave type has NO policy at all, the legacy LeaveType.limit /
// limitType / HR LeaveBalance override still drives the entitlement so the
// existing system keeps working unchanged.

const EMPLOYEE_SCOPE = 'employee';
const ROLE_SCOPE = 'role';
const LEVEL_SCOPE = 'level';
const GRADE_SCOPE = 'grade';
const DEPARTMENT_SCOPE = 'department';
const COMPANY_SCOPE = 'company';

// Copy of getPeriodWindow: exact equality to user-facing keys (avoid import cycle)
exports.getPeriodWindow = getPeriodWindow;

exports.POLICY_SCOPE_PRIORITY = [
  EMPLOYEE_SCOPE,
  ROLE_SCOPE,
  LEVEL_SCOPE,
  GRADE_SCOPE,
  DEPARTMENT_SCOPE,
  COMPANY_SCOPE,
];

exports.policyForType = async (companyId, leaveTypeRef) => {
  if (!leaveTypeRef) return null;
  return LeavePolicy.findOne({
    companyId,
    leaveTypeRef,
    status: 'active',
  }).lean();
};

exports.policiesForCompany = async (companyId) => {
  return LeavePolicy.find(companyId ? { companyId } : {}).lean();
};

exports.rulesForPolicies = async (policyIds) => {
  if (!policyIds || policyIds.length === 0) return [];
  return LeavePolicyRule.find({ policyId: { $in: policyIds } }).lean();
};

// Build the candidate rule scopes for a user (in resolution priority order).
exports.userScopeKeys = (user) => {
  const keys = [];
  if (user._id) keys.push({ scopeType: EMPLOYEE_SCOPE, key: user._id.toString() });
  if (user.roleCode) keys.push({ scopeType: ROLE_SCOPE, key: user.roleCode.toUpperCase() });
  if (user.levelRef) {
    const lvlKey = typeof user.levelRef === 'object' && user.levelRef._id ? user.levelRef._id.toString() : user.levelRef.toString();
    keys.push({ scopeType: LEVEL_SCOPE, key: lvlKey });
  }
  if (user.gradeRef) {
    const grdKey = typeof user.gradeRef === 'object' && user.gradeRef._id ? user.gradeRef._id.toString() : user.gradeRef.toString();
    keys.push({ scopeType: GRADE_SCOPE, key: grdKey });
  }
  if (user.department) keys.push({ scopeType: DEPARTMENT_SCOPE, key: String(user.department).toUpperCase() });
  keys.push({ scopeType: COMPANY_SCOPE, key: '_default' });
  return keys;
};

// Find the most specific rule the user qualifies for.
exports.resolveRule = (user, rules) => {
  if (!rules || rules.length === 0) return null;

  // Check if policy has any specific targeted rules (non-company)
  const hasSpecificTargetRules = rules.some(r => r.scopeType !== COMPANY_SCOPE);

  const scopeKeys = exports.userScopeKeys(user);
  const scopeOrder = {};
  scopeKeys.forEach((s, i) => { scopeOrder[s.scopeType] = i; });

  let best = null;
  let bestRank = -1;
  rules.forEach((r) => {
    // If specific target rules exist on policy, do not fall back to company default
    if (hasSpecificTargetRules && r.scopeType === COMPANY_SCOPE) return;

    const rank = scopeOrder[r.scopeType];
    if (rank === undefined || (bestRank >= 0 && rank >= bestRank)) return;
    // Match by scopeRef or scopeCode.
    let matched = false;
    if (r.scopeType === EMPLOYEE_SCOPE && user._id && r.scopeRef) {
      matched = r.scopeRef.toString() === user._id.toString();
    } else if (r.scopeType === ROLE_SCOPE) {
      const uCode = (user.roleCode || '').toUpperCase();
      const uRole = (user.role || '').toUpperCase();
      const rCode = (r.scopeCode || '').toUpperCase();
      matched = rCode && (rCode === uCode || rCode === uRole);
    } else if (r.scopeType === LEVEL_SCOPE) {
      if (user.levelRef && r.scopeRef) {
        matched = r.scopeRef.toString() === user.levelRef.toString();
      }
      if (!matched && r.scopeCode && user.roleLevel !== undefined && user.roleLevel !== null) {
        matched = String(user.roleLevel).toUpperCase() === r.scopeCode.toUpperCase();
      }
    } else if (r.scopeType === GRADE_SCOPE) {
      if (user.gradeRef && r.scopeRef) {
        matched = r.scopeRef.toString() === user.gradeRef.toString();
      }
      if (!matched && r.scopeCode && user.roleGrade) {
        matched = String(user.roleGrade).toUpperCase() === r.scopeCode.toUpperCase();
      }
    } else if (r.scopeType === DEPARTMENT_SCOPE) {
      const uDept = String(user.department || '').toUpperCase();
      const rCode = (r.scopeCode || '').toUpperCase();
      matched = uDept && rCode && (uDept === rCode || uDept.includes(rCode) || rCode.includes(uDept));
    } else if (r.scopeType === COMPANY_SCOPE) {
      matched = (r.scopeCode || '_default') === '_default';
    }
    if (matched) {
      best = r;
      bestRank = rank;
    }
  });
  return best;
};

// Prorate the entitlement for a new joiner relative to the period window.
// The joiner gets the portion of the period remaining after their joining date.
exports.prorateDays = (entitlement, period, joiningDate) => {
  const startT = new Date(period.start).getTime();
  const endT = new Date(period.end).getTime();
  const joinT = Math.min(new Date(joiningDate).getTime(), endT);

  const total = endT - startT;
  const fraction = total <= 0 ? 1 : Math.min(1, Math.max(0, (endT - joinT) / total));
  return Math.round(entitlement * fraction * 2) / 2;
};

// Effective entitlement days for a user for a leave type in the current period.
exports.effectiveEntitlement = async (
  user,
  companyId,
  leaveTypeRef,
  policy,
  rules,
  refDate = new Date()
) => {
  if (policy && rules) {
    const rule = exports.resolveRule(user, rules);
    if (rule) {
      const period = getPeriodWindow(policy.periodType, refDate);
      const days = rule.days;
      if (policy.prorateNewJoiner && user.joiningDate) {
        const joinedC = getISTDateComponents(new Date(user.joiningDate));
        const inPeriod =
          new Date(user.joiningDate).getTime() >= period.start.getTime() &&
          new Date(user.joiningDate).getTime() <= period.end.getTime();
        if (inPeriod) {
          return {
            days: exports.prorateDays(days, period, user.joiningDate),
            policyId: policy._id?.toString() || policy._id,
            scopeType: rule.scopeType,
          };
        }
      }
      return {
        days: rule.days,
        policyId: policy._id?.toString() || policy._id,
        scopeType: rule.scopeType,
      };
    }
  }
  return null;
};

// Legacy fallback entitlement (LeaveType.limit / HR LeaveBalance override).
exports.legacyEntitlement = (lt, overrides, userKey) => {
  if (overrides && userKey && overrides.has(userKey)) {
    const inner = overrides.get(userKey);
    const override =
      (lt._id && inner.get(lt._id.toString())) || inner.get(lt.code) || null;
    if (override && typeof override.limit === 'number') return override.limit;
  }
  return typeof lt.limit === 'number' ? lt.limit : 0;
};

// Build a policySnapshot for a Leave document at application time.
exports.buildPolicySnapshot = async (user, companyId, leaveTypeRef, refDate = new Date()) => {
  const lt = await LeaveType.findById(leaveTypeRef).lean();
  if (!lt) return null;
  const policy = await exports.policyForType(companyId, leaveTypeRef);
  if (!policy) {
    return {
      policyId: null,
      periodType: lt.limitType === 'Monthly' ? 'MONTHLY' : 'YEARLY',
      entitlement: lt.limit || 0,
    };
  }
  const rules = await LeavePolicyRule.find({ policyId: policy._id }).lean();
  const entitlement = await exports.effectiveEntitlement(user, companyId, leaveTypeRef, policy, rules, refDate);
  return {
    policyId: policy._id?.toString() || policy._id,
    periodType: policy.periodType,
    entitlementDays: entitlement?.days ?? null,
    scopeType: entitlement?.scopeType || null,
  };
};