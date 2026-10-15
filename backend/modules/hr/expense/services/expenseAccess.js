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
    const requested = req.headers?.['x-company-id'] || req.query?.companyId;
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

// ─── Business status: DRAFT | PENDING | PAID | REJECTED ─────────────────────
// New claims only use DRAFT / SUBMITTED / PAID / REJECTED. Legacy statuses from the
// old approval + disbursement workflow are mapped so historical data reads correctly
// even before scripts/migrate_expense_paid_rejected.js has been run.
// Approved-but-unpaid legacy claims are PENDING (never treated as paid).
const DRAFT_STATUSES = ['DRAFT', 'RETURNED'];
const PENDING_STATUSES = ['SUBMITTED', 'HR_PENDING', 'FULL_PAYMENT_PENDING', 'ACCOUNTS_PENDING', 'ACCOUNTS_APPROVED', 'APPROVED'];
const PAID_STATUSES = ['PAID', 'DISBURSED', 'SETTLED'];
const REJECTED_STATUSES = ['REJECTED', 'HR_REJECTED', 'ACCOUNTS_REJECTED', 'CANCELLED'];
const STATUS_LISTS = { DRAFT: DRAFT_STATUSES, PENDING: PENDING_STATUSES, PAID: PAID_STATUSES, REJECTED: REJECTED_STATUSES };

function businessStatus(claim) {
  const s = String(claim?.status || 'DRAFT').toUpperCase();
  return Object.keys(STATUS_LISTS).find((k) => STATUS_LISTS[k].includes(s)) || 'DRAFT';
}

/** View rules: drafts only for creator; otherwise creator, tagged employees, staff of same company. */
function canViewClaim(req, claim) {
  const uid = userId(req);
  if (isCreator(claim, uid)) return true;
  if (businessStatus(claim) === 'DRAFT') return false;
  if (isOnClaim(claim, uid)) return true;
  return isStaff(req.user) && sameCompany(claim, resolveCompanyId(req, { allowAll: true }));
}

const isLocked = (claim) => !!claim.lockedAt || businessStatus(claim) === 'PAID';

/** What the current user may do with this claim (enforced again in each endpoint). */
function claimPermissions(req, claim) {
  const uid = userId(req);
  const creator = isCreator(claim, uid);
  const involved = creator || isOnClaim(claim, uid);
  const superAdmin = isSuperAdmin(req.user);
  const companyOk = sameCompany(claim, resolveCompanyId(req, { allowAll: true }));
  const bs = businessStatus(claim);
  const notSelf = !involved || superAdmin;
  return {
    businessStatus: bs,
    // Employees edit while Draft, Pending, or Rejected; Paid claims are final.
    canEdit: creator && ['DRAFT', 'PENDING', 'REJECTED'].includes(bs) && !isLocked(claim),
    canSubmit: creator && ['DRAFT', 'PENDING', 'REJECTED'].includes(bs) && !isLocked(claim),
    canDelete: (bs === 'DRAFT' && creator) || (bs === 'REJECTED' && (creator || (isCompanyAdmin(req.user) && companyOk))),
    // Direct final decisions on a Pending claim. Nobody decides a claim they are on (Super Admin excepted).
    canMarkPaid: isAccounts(req.user) && companyOk && bs === 'PENDING' && notSelf,
    canReject: (isAccounts(req.user) || isHR(req.user)) && companyOk && bs === 'PENDING' && notSelf,
    // Audited correction: Rejected -> Pending. Paid claims are never reopened.
    canReopen: isCompanyAdmin(req.user) && companyOk && bs === 'REJECTED' && notSelf,
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
  if (!isStaff(req.user)) {
    const uid = new (require('mongoose').Types.ObjectId)(userId(req));
    conditions.push({ $or: [{ submittedBy: uid }, { 'employeeClaims.employee.employeeId': uid }] });
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
  businessStatus,
  reportScope,
  STATUS_LISTS,
  DRAFT_STATUSES,
  PENDING_STATUSES,
  PAID_STATUSES,
  REJECTED_STATUSES,
  snapshot,
  audit,
};
