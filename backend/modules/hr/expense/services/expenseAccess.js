const ExpenseAuditLog = require('../models/ExpenseAuditLog');

/**
 * Shared access helpers for the expense module: role checks, trusted company
 * resolution and audit lodging. Company scope always comes from the tenant
 * middleware; only global (Super Admin) users may pick another company.
 */

const norm = (v) => String(v || '').trim().toLowerCase();

function isRole(user, targets) {
  if (!user) return false;
  const role = norm(user.role);
  const roleCode = norm(user.roleCode);
  return targets.some((t) => role === norm(t) || roleCode === norm(t));
}

const SUPER_ADMIN_ROLES = ['superadmin', 'super_admin', 'tcsa1'];
const COMPANY_ADMIN_ROLES = [
  'admin', 'company_admin', 'companyadmin', 'tcca1',
  'dept:management_admin', 'management_admin', 'director', 'ceo'
];
const HR_ROLES = ['hr', 'hr_admin', 'dept:hr_admin', 'tcsf2a', 'tcsfa'];
const ACCOUNTS_ROLES = [
  'accounts', 'account_admin', 'accounts_admin', 'finance', 'finance_admin',
  'dept:finance_admin', 'tcacc1', 'tcacc2', 'accountant'
];

const isSuperAdmin = (u) => !!u && (u.scope === 'GLOBAL' || isRole(u, SUPER_ADMIN_ROLES));
const isCompanyAdmin = (u) => isSuperAdmin(u) || isRole(u, COMPANY_ADMIN_ROLES) ||
  (norm(u?.role) === 'department_admin' && ['management', ''].includes(norm(u?.departmentAdminType || u?.adminType)));
const isHR = (u) => isCompanyAdmin(u) || isRole(u, HR_ROLES) ||
  (norm(u?.role) === 'department_admin' && ['hr'].includes(norm(u?.departmentAdminType || u?.adminType)));
const isAccounts = (u) => isCompanyAdmin(u) || isRole(u, ACCOUNTS_ROLES) ||
  (norm(u?.role) === 'department_admin' && ['accounts', 'finance'].includes(norm(u?.departmentAdminType || u?.adminType)));
const isStaff = (u) => isHR(u) || isAccounts(u);
// Full-payment approvers (same definition used across the codebase for "Management")
const MANAGEMENT_ROLES = ['management', 'company_admin', 'companyadmin', 'admin', 'super_admin', 'superadmin', 'tcca1', 'tcsa1', 'tcmgt', 'tcdr1a', 'tcdr2a', 'vp', 'avp', 'general_manager', 'director', 'ceo'];
const isManagementUser = (u) => {
  if (!u) return false;
  if (isRole(u, MANAGEMENT_ROLES)) return true;
  const role = norm(u?.role);
  const roleCode = String(u?.roleCode || '').trim().toUpperCase();
  const desig = norm(u?.designation);
  const dept = norm(u?.department);
  const cat = String(u?.levelRef?.category || u?.effectiveCategory || '').trim().toUpperCase();
  const deptAdminType = norm(u?.departmentAdminType || u?.adminType);
  if (cat === 'MANAGEMENT') return true;
  if (['management', 'general_manager', 'vp', 'avp', 'ceo', 'director'].includes(role)) return true;
  if (/^(TC(MN)|MANAGEMENT|TCMGT|VP|AVP|GM|CEO|TCCA|TCSA|TCDR|TCDI)/i.test(roleCode)) return true;
  if (deptAdminType === 'management') return true;
  if (/^(management|executive|director|directors|board of directors|bod)$/i.test(dept) || /management/i.test(dept)) return true;
  if (/(ceo|vp|vice president|general manager|president|chairman|director|^management$)/i.test(desig)) return true;
  const resp = Array.isArray(u?.responsibilityCodes)
    ? u.responsibilityCodes
    : (u?.responsibilityCodes ? [String(u.responsibilityCodes)] : []);
  if (resp.some((r) => String(r).toUpperCase().trim() === 'MANAGEMENT_APPROVER')) return true;
  return false;
};
// Expense masters / policy configuration
const canConfigure = (u) => isHR(u);

const userId = (req) => String(req.user?._id || req.user?.id || '');

/**
 * Trusted company for the request.
 * allowAll: Super Admin may request `x-company-id: ALL` for cross-company queues.
 */
function resolveCompanyId(req, { allowAll = false } = {}) {
  if (isSuperAdmin(req.user)) {
    const requested = req.headers?.['x-company-id'] || req.query?.companyId || req.body?.companyId;
    if (allowAll && (!requested || norm(requested) === 'all') && !req.tenant?.companyId) return 'ALL';
    if (allowAll && norm(requested) === 'all') return 'ALL';
    if (requested && norm(requested) !== 'all') return String(requested);
  }
  let companyId = req.tenant?.companyId || req.companyId || null;
  if (!companyId && !isSuperAdmin(req.user)) companyId = req.user?.companyId || req.user?.company || null;
  if (companyId && typeof companyId === 'object' && companyId._id) companyId = companyId._id;
  if (companyId && norm(companyId) === 'all') return allowAll && isSuperAdmin(req.user) ? 'ALL' : null;
  return companyId ? String(companyId) : null;
}

const sameCompany = (claim, companyId) => {
  const claimComp = claim?.companyId?._id || claim?.companyId || claim?.company?._id || claim?.company;
  return companyId === 'ALL' || !companyId || !claimComp || String(claimComp) === String(companyId);
};

function isOnClaim(claim, uid) {
  const id = String(uid);
  return (claim.employeeClaims || []).some((ec) => {
    const empId = ec.employee?.employeeId?._id || ec.employee?.employeeId || ec.claimedBy?._id || ec.claimedBy;
    return String(empId) === id;
  });
}

const isCreator = (claim, uid) => {
  const sub = claim.submittedBy?._id || claim.submittedBy;
  return !!sub && !!uid && String(sub) === String(uid);
};

const isAssignedApprover = (claim, uid) => {
  const a = claim?.managerApproval?.approver;
  return !!a && !!uid && String(a._id || a) === String(uid);
};

// CFO / Finance Head assigned for the 2nd approval (Full Payment / Stock Purchase).
const isFinanceApprover = (claim, uid) => {
  const a = claim?.financeApproval?.approver;
  return !!a && !!uid && String(a._id || a) === String(uid);
};

// Waiting for the 2nd approval (CFO / Finance Head): the 1st approval is already done.
const isFinanceStage = (claim) =>
  String(claim?.status || '').toUpperCase() === 'APPROVAL_PENDING'
  && String(claim?.financeApproval?.status || '').toUpperCase() === 'PENDING';

// The approver who decides the claim at its current approval stage.
const isCurrentStageApprover = (claim, uid) => (isFinanceStage(claim) ? isFinanceApprover(claim, uid) : isAssignedApprover(claim, uid));

// ─── Business status: DRAFT | PENDING | PAID | REJECTED ─────────────────────
// New claims only use DRAFT / APPROVAL_PENDING / SUBMITTED / PAID / REJECTED. Legacy statuses from the
// old approval + disbursement workflow are mapped so historical data reads correctly
// even before scripts/migrate_expense_paid_rejected.js has been run.
// Approved-but-unpaid legacy claims are PENDING (never treated as paid).
const DRAFT_STATUSES = ['DRAFT', 'RETURNED'];
// Accounts Step 1 pending statuses (awaiting Accounts Admin approval).
const ACCOUNTS_APPROVAL_PENDING_STATUSES = ['SUBMITTED', 'PENDING', 'HR_PENDING', 'FULL_PAYMENT_PENDING', 'ACCOUNTS_PENDING'];
// Accounts Step 2 pending statuses (approved by Accounts Admin, awaiting payment).
const ACCOUNTS_APPROVED_STATUSES = ['ACCOUNTS_APPROVED', 'APPROVED'];
// Accounts-actionable pending statuses (Accounts Pending queue / Mark Paid / Reject).
const PENDING_STATUSES = [...ACCOUNTS_APPROVAL_PENDING_STATUSES, ...ACCOUNTS_APPROVED_STATUSES];
// Waiting for the selected Management user / Reporting Manager / CFO; never visible to Accounts.
const APPROVAL_PENDING_STATUSES = ['APPROVAL_PENDING'];
const PAID_STATUSES = ['PAID', 'DISBURSED', 'SETTLED'];
const REJECTED_STATUSES = ['REJECTED', 'HR_REJECTED', 'ACCOUNTS_REJECTED', 'CANCELLED'];
const STATUS_LISTS = {
  DRAFT: DRAFT_STATUSES,
  PENDING: [...PENDING_STATUSES, ...APPROVAL_PENDING_STATUSES],
  PAID: PAID_STATUSES,
  REJECTED: REJECTED_STATUSES,
};

function businessStatus(claim) {
  const s = String(claim?.status || 'DRAFT').toUpperCase();
  return Object.keys(STATUS_LISTS).find((k) => STATUS_LISTS[k].includes(s)) || 'DRAFT';
}

const isAwaitingApproval = (claim) => APPROVAL_PENDING_STATUSES.includes(String(claim?.status || '').toUpperCase());

const isAccountsApproved = (claim) =>
  String(claim?.status || '').toUpperCase() === 'ACCOUNTS_APPROVED' ||
  String(claim?.paymentStatus || '').toUpperCase() === 'AWAITING_DISBURSEMENT';

/**
 * True once the 1st applicable approval on the claim has been approved:
 * - Reporting Manager (1st approval) approved (managerApproval.status === 'APPROVED' with kind !== 'NONE',
 *   or claim has advanced to CFO 2nd approval), OR
 * - Accounts Admin (Step 1) approved (for claims routed directly to Accounts or after manager approval).
 */
function isFirstApprovalApproved(claim) {
  if (!claim) return false;
  if (isAccountsApproved(claim)) return true;
  if (String(claim?.accountsApproval?.status || '').toUpperCase() === 'APPROVED') return true;
  const faStatus = String(claim?.financeApproval?.status || '').toUpperCase();
  if (faStatus === 'PENDING' || faStatus === 'APPROVED') return true;
  const maStatus = String(claim?.managerApproval?.status || '').toUpperCase();
  const maKind = String(claim?.managerApproval?.kind || 'NONE').toUpperCase();
  if (maStatus === 'APPROVED' && (maKind !== 'NONE' || !!claim?.managerApproval?.decidedAt || !!claim?.managerApproval?.approver)) {
    return true;
  }
  if (String(claim?.fullPayment?.status || '').toUpperCase() === 'APPROVED' && !isManagementUser(claim?.submittedBy)) {
    return true;
  }
  return false;
}

/** True only once the claim has cleared both Reporting Manager and CFO / Finance Head approvals (when required). */
function hasReachedAccounts(claim) {
  if (!claim) return false;
  const st = String(claim.status || '').toUpperCase();
  if (DRAFT_STATUSES.includes(st) || APPROVAL_PENDING_STATUSES.includes(st)) return false;
  const maStatus = String(claim.managerApproval?.status || '').toUpperCase();
  const faStatus = String(claim.financeApproval?.status || '').toUpperCase();
  if (maStatus === 'REJECTED' || faStatus === 'REJECTED') return false;
  return true;
}

/** View rules: drafts only for creator; otherwise creator, tagged employees, assigned approver, staff of same company. */
function canViewClaim(req, claim) {
  if (!sameCompany(claim, resolveCompanyId(req, { allowAll: true }))) return false;
  const uid = userId(req);
  if (isCreator(claim, uid)) return true;
  if (businessStatus(claim) === 'DRAFT') return false;
  if (isOnClaim(claim, uid)) return true;
  if (isAssignedApprover(claim, uid)) return true;
  if (isFinanceApprover(claim, uid)) return true;
  if (isAccounts(req.user) && !isCompanyAdmin(req.user) && !isHR(req.user)) {
    return hasReachedAccounts(claim);
  }
  return isStaff(req.user);
}

const isLocked = (claim) => !!claim.lockedAt || businessStatus(claim) === 'PAID';

/** What the current user may do with this claim (enforced again in each endpoint). */
function claimPermissions(req, claim) {
  const uid = userId(req);
  const creator = isCreator(claim, uid);
  const involved = creator || isOnClaim(claim, uid);
  const superAdmin = isSuperAdmin(req.user);
  const companyAdmin = isCompanyAdmin(req.user);
  const companyOk = sameCompany(claim, resolveCompanyId(req, { allowAll: true }));
  const bs = businessStatus(claim);
  const notSelf = !involved || superAdmin || companyAdmin;
  const awaitingApproval = isAwaitingApproval(claim);
  const accountsApproved = isAccountsApproved(claim);
  const firstApprovalDone = bs === 'PENDING' && isFirstApprovalApproved(claim);
  const reachedAccounts = hasReachedAccounts(claim);
  // Accounts only acts once the claim has cleared the approval stage (Reporting Manager & CFO), OR admin override.
  const accountsStage = bs === 'PENDING' && ((reachedAccounts && !awaitingApproval) || superAdmin || companyAdmin);
  const approverCanDecide = awaitingApproval && companyOk && (isCurrentStageApprover(claim, uid) || superAdmin || companyAdmin) && notSelf;
  return {
    businessStatus: bs,
    awaitingApproval,
    isAccountsApproved: accountsApproved,
    isFirstApprovalApproved: firstApprovalDone,
    // MANAGER = 1st approval (Reporting Manager), FINANCE = 2nd approval (CFO / Finance Head)
    approvalStage: awaitingApproval ? (isFinanceStage(claim) ? 'FINANCE' : 'MANAGER') : null,
    // Employees edit while Draft, Rejected, or Pending before the 1st applicable approval is completed.
    canEdit: creator && ['DRAFT', 'PENDING', 'REJECTED'].includes(bs) && !isLocked(claim) && !accountsApproved && !firstApprovalDone,
    canSubmit: creator && ['DRAFT', 'PENDING', 'REJECTED'].includes(bs) && !isLocked(claim) && !accountsApproved && !firstApprovalDone,
    canDelete: (bs === 'DRAFT' && creator) || (bs === 'REJECTED' && (creator || (companyAdmin && companyOk))),
    // 2-step Accounts Admin workflow:
    // Step 1: Accounts Admin approves or rejects the claim (SUBMITTED -> ACCOUNTS_APPROVED | REJECTED).
    // Step 2: After Accounts approval (ACCOUNTS_APPROVED), Accounts Admin marks Paid with payment date.
    //         After Accounts approval, Reject is ONLY allowed for Super Admin (never Accounts Admin or Company Admin).
    canAccountsApprove: isAccounts(req.user) && companyOk && accountsStage && !accountsApproved && notSelf,
    canMarkPaid: isAccounts(req.user) && companyOk && accountsStage && accountsApproved && notSelf,
    canReject: companyOk && accountsStage && notSelf && (accountsApproved ? superAdmin : (isAccounts(req.user) || isHR(req.user))),
    // Approval stage: only the employee-selected approver decides (Super Admin and Company Admin can also decide).
    canApprove: approverCanDecide,
    canRejectApproval: approverCanDecide,
    // Audited correction: Rejected -> Pending. Paid claims are never reopened.
    canReopen: companyAdmin && companyOk && bs === 'REJECTED' && notSelf,
  };
}

/**
 * Mongo conditions limiting expense reports to the caller's access scope.
 * Staff (HR / Accounts / Admins) -> their company (Super Admin may pick ALL).
 * Store Admin -> blocked. Everyone else -> claims they submitted or are tagged on.
 * Returns { blocked: true } or { conditions: [...] }.
 */
function reportScope(req) {
  if (isRole(req.user, ['store_admin', 'store', 'store_manager', 'tcstr1', 'tcst7a']) && !isCompanyAdmin(req.user)) {
    return { blocked: true };
  }
  const companyId = resolveCompanyId(req, { allowAll: true });
  const conditions = [];
  if (companyId && companyId !== 'ALL') conditions.push({ companyId: new (require('mongoose').Types.ObjectId)(companyId) });
  if (isAccounts(req.user) && !isCompanyAdmin(req.user) && !isHR(req.user)) {
    // Accounts Admin only sees claims after Reporting Manager and CFO / Finance Head have approved them
    conditions.push({
      status: { $nin: [...DRAFT_STATUSES, ...APPROVAL_PENDING_STATUSES] },
      'managerApproval.status': { $nin: ['PENDING', 'REJECTED'] },
      'financeApproval.status': { $nin: ['PENDING', 'REJECTED'] },
    });
  } else if (isStaff(req.user)) {
    conditions.push({
      'managerApproval.status': { $ne: 'PENDING' },
      'financeApproval.status': { $ne: 'PENDING' },
    });
  } else {
    const uid = new (require('mongoose').Types.ObjectId)(userId(req));
    // In reports, do not show tagged claims for tagged employees: only claims they submitted
    conditions.push({ submittedBy: uid });
  }
  return { conditions };
}

const AUDIT_FIELDS = [
  'status', 'paymentStatus', 'grandRequested', 'grandAllowed', 'grandExcess', 'payableAmount',
  'paidAmount', 'claimType', 'claimDate', 'fromDate', 'toDate',
];

/** Small before/after snapshot so audit entries stay compact. */
function snapshot(claim) {
  if (!claim) return undefined;
  const out = {};
  AUDIT_FIELDS.forEach((f) => { if (claim[f] !== undefined) out[f] = claim[f]; });
  if (claim.fullPayment) {
    out.fullPayment = { requested: claim.fullPayment.requested, status: claim.fullPayment.status, approvedAmount: claim.fullPayment.approvedAmount };
  }
  if (claim.managerApproval && claim.managerApproval.kind && claim.managerApproval.kind !== 'NONE') {
    out.managerApproval = {
      kind: claim.managerApproval.kind,
      approver: claim.managerApproval.approver,
      status: claim.managerApproval.status,
    };
  }
  if (claim.financeApproval && claim.financeApproval.status && claim.financeApproval.status !== 'NOT_REQUIRED') {
    out.financeApproval = {
      approver: claim.financeApproval.approver,
      status: claim.financeApproval.status,
    };
  }
  if (claim.accountsApproval && claim.accountsApproval.status && claim.accountsApproval.status !== 'NOT_REQUIRED') {
    out.accountsApproval = {
      approvedBy: claim.accountsApproval.approvedBy,
      status: claim.accountsApproval.status,
    };
  }
  return out;
}

async function audit({ req, action, claim, description, before, after, metadata, entity = 'ExpenseClaim', entityId }) {
  try {
    const cid = claim?.companyId || resolveCompanyId(req);
    await ExpenseAuditLog.create({
      companyId: cid && cid !== 'ALL' ? cid : null,
      company: cid && cid !== 'ALL' ? cid : null,
      action,
      entity,
      entityId: entityId || (claim?._id ? String(claim._id) : ''),
      claimNumber: claim?.claimNumber || '',
      user: req.user?._id || req.user?.id || null,
      userName: req.user?.name || '',
      description: description || action,
      before,
      after,
      metadata: metadata || {},
    });
  } catch (err) { /* audit must never break the flow */ }
}

module.exports = {
  isRole,
  isSuperAdmin,
  isCompanyAdmin,
  isHR,
  isAccounts,
  isStaff,
  isManagementUser,
  canConfigure,
  userId,
  resolveCompanyId,
  sameCompany,
  isOnClaim,
  isCreator,
  isAssignedApprover,
  isFinanceApprover,
  isFinanceStage,
  isCurrentStageApprover,
  isAwaitingApproval,
  isAccountsApproved,
  isFirstApprovalApproved,
  hasReachedAccounts,
  canViewClaim,
  claimPermissions,
  isLocked,
  businessStatus,
  reportScope,
  STATUS_LISTS,
  DRAFT_STATUSES,
  PENDING_STATUSES,
  ACCOUNTS_APPROVAL_PENDING_STATUSES,
  ACCOUNTS_APPROVED_STATUSES,
  APPROVAL_PENDING_STATUSES,
  PAID_STATUSES,
  REJECTED_STATUSES,
  snapshot,
  audit,
};
