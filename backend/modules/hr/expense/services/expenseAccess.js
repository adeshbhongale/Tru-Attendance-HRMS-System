const ExpenseAuditLog = require('../models/ExpenseAuditLog');

/**
 * Shared access helpers for the expense module: role checks, trusted company
 * resolution and audit logging. Company scope always comes from the tenant
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
const COMPANY_ADMIN_ROLES = ['admin', 'company_admin', 'companyadmin', 'tcca1'];
const HR_ROLES = ['hr', 'hr_admin', 'tcsf2a', 'tcsfa'];
const ACCOUNTS_ROLES = ['accounts', 'account_admin', 'accounts_admin', 'finance', 'tcacc1', 'tcacc2'];

const isSuperAdmin = (u) => !!u && (u.scope === 'GLOBAL' || isRole(u, SUPER_ADMIN_ROLES));
const isCompanyAdmin = (u) => isSuperAdmin(u) || isRole(u, COMPANY_ADMIN_ROLES);
const isHR = (u) => isCompanyAdmin(u) || isRole(u, HR_ROLES);
const isAccounts = (u) => isCompanyAdmin(u) || isRole(u, ACCOUNTS_ROLES);
const isStaff = (u) => isHR(u) || isAccounts(u);
// Expense masters / policy configuration
const canConfigure = (u) => isHR(u);

const userId = (req) => String(req.user?._id || req.user?.id || '');

/**
 * Trusted company for the request.
 * allowAll: Super Admin may request `x-company-id: ALL` for cross-company queues.
 */
function resolveCompanyId(req, { allowAll = false } = {}) {
  if (isSuperAdmin(req.user)) {
    const requested = req.headers['x-company-id'] || req.query.companyId;
    if (allowAll && (!requested || norm(requested) === 'all') && !req.tenant?.companyId) return 'ALL';
    if (allowAll && norm(requested) === 'all') return 'ALL';
  }
  let companyId = req.tenant?.companyId || req.companyId || null;
  if (!companyId && !isSuperAdmin(req.user)) companyId = req.user?.companyId || req.user?.company || null;
  if (companyId && typeof companyId === 'object' && companyId._id) companyId = companyId._id;
  return companyId ? String(companyId) : null;
}

const sameCompany = (claim, companyId) =>
  companyId === 'ALL' || !companyId || !claim.companyId || String(claim.companyId) === String(companyId);

function isOnClaim(claim, uid) {
  const id = String(uid);
  return (claim.employeeClaims || []).some((ec) => {
    const empId = ec.employee?.employeeId?._id || ec.employee?.employeeId;
    return String(empId) === id;
  });
}

const isCreator = (claim, uid) => String(claim.submittedBy?._id || claim.submittedBy) === String(uid);

/** View rules: drafts only for creator; otherwise creator, tagged employees, staff of same company. */
function canViewClaim(req, claim) {
  const uid = userId(req);
  if (isCreator(claim, uid)) return true;
  if (claim.status === 'DRAFT') return false;
  if (isOnClaim(claim, uid)) return true;
  return isStaff(req.user) && sameCompany(claim, resolveCompanyId(req, { allowAll: true }));
}

// Users can edit submitted claims until approved ('ACCOUNTS_APPROVED', 'APPROVED', 'PAID', etc.)
const EDITABLE_STATUSES = [
  'DRAFT',
  'SUBMITTED',
  'HR_PENDING',
  'FULL_PAYMENT_PENDING',
  'ACCOUNTS_PENDING',
  'RETURNED',
  'REJECTED',
  'ACCOUNTS_REJECTED',
  'HR_REJECTED',
];
// Submitted claims CANNOT be deleted; only DRAFT, CANCELLED, RETURNED, or REJECTED claims can be deleted
const DELETABLE_STATUSES = [
  'DRAFT',
  'CANCELLED',
  'RETURNED',
  'REJECTED',
  'ACCOUNTS_REJECTED',
  'HR_REJECTED',
];
const PAYABLE_STATUSES = ['ACCOUNTS_PENDING', 'SUBMITTED', 'FULL_PAYMENT_PENDING'];
const PAID_STATUSES = ['PAID', 'DISBURSED', 'SETTLED', 'ACCOUNTS_APPROVED', 'APPROVED'];

const isLocked = (claim) => !!claim.lockedAt || PAID_STATUSES.includes(claim.status);

/** What the current user may do with this claim (enforced again in each endpoint). */
function claimPermissions(req, claim) {
  const uid = userId(req);
  const creator = isCreator(claim, uid);
  const involved = creator || isOnClaim(claim, uid);
  const superAdmin = isSuperAdmin(req.user);
  const companyOk = sameCompany(claim, resolveCompanyId(req, { allowAll: true }));
  const editable = EDITABLE_STATUSES.includes(claim.status) && !isLocked(claim);
  const fp = claim.fullPayment || {};
  return {
    canEdit: creator && editable,
    canSubmit: creator && editable,
    canDelete: DELETABLE_STATUSES.includes(claim.status) && (creator || (isCompanyAdmin(req.user) && companyOk && claim.status !== 'DRAFT')),
    canHrDecide: isHR(req.user) && companyOk && claim.status === 'HR_PENDING' && (!involved || superAdmin),
    // Full payment can never be approved by someone on the claim (incl. Super Admin)
    canDecideFullPayment: isHR(req.user) && companyOk && claim.status === 'FULL_PAYMENT_PENDING' && fp.status === 'PENDING' && !involved,
    canPay: isAccounts(req.user) && companyOk && PAYABLE_STATUSES.includes(claim.status) && (!involved || superAdmin),
    canReject: isAccounts(req.user) && companyOk && [...PAYABLE_STATUSES, 'FULL_PAYMENT_PENDING'].includes(claim.status) && (!involved || superAdmin),
  };
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
  return out;
}

async function audit({ req, action, claim, description, before, after, metadata }) {
  try {
    const cid = claim?.companyId || resolveCompanyId(req);
    await ExpenseAuditLog.create({
      companyId: cid && cid !== 'ALL' ? cid : null,
      company: cid && cid !== 'ALL' ? cid : null,
      action,
      entity: 'ExpenseClaim',
      entityId: claim?._id ? String(claim._id) : '',
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
  canConfigure,
  userId,
  resolveCompanyId,
  sameCompany,
  isOnClaim,
  isCreator,
  canViewClaim,
  claimPermissions,
  isLocked,
  EDITABLE_STATUSES,
  DELETABLE_STATUSES,
  PAYABLE_STATUSES,
  PAID_STATUSES,
  snapshot,
  audit,
};
