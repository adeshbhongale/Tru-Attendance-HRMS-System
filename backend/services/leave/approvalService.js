const User = require('../../models/User');
const ledgerService = require('./ledgerService');
const periodService = require('./periodService');

// ── Approval guard ───────────────────────────────────────────────────────────
// Only the employee's direct reporting manager OR Super Admin / Company Admin /
// HR Admin may approve or reject a pending leave.
exports.isPrivilegedLeaveAdmin = (actor) => {
  if (!actor) return false;
  const role = String(actor.role || '').trim().toLowerCase().replace(/[-\s]/g, '_');
  const roleCode = String(actor.roleCode || '').trim().toUpperCase().replace(/[-\s]/g, '_');
  const deptAdminType = String(actor.departmentAdminType || actor.adminType || '').trim().toLowerCase();

  if (['store', 'store_admin', 'store_manager', 'accounts', 'account_admin', 'accounts_admin', 'finance'].includes(role)) return false;
  if (['STORE_ADMIN', 'TCSTR1', 'TCST7A', 'ACCOUNT_ADMIN', 'ACCOUNTS_ADMIN', 'TCACC1', 'TCACC2'].includes(roleCode)) return false;
  if (['store', 'accounts', 'account', 'finance'].includes(deptAdminType)) return false;

  if (role === 'superadmin' || role === 'super_admin' || roleCode === 'TCSA1' || roleCode === 'SUPER_ADMIN' || roleCode === 'SUPERADMIN' || actor.scope === 'GLOBAL') return true;
  if (role === 'company_admin' || role === 'companyadmin' || role === 'admin' || roleCode === 'TCCA1' || roleCode === 'COMPANY_ADMIN' || roleCode === 'COMPANYADMIN') return true;
  if (role === 'hr_admin' || role === 'hr' || roleCode === 'HR_ADMIN' || roleCode === 'TCSF2A' || roleCode === 'TCSFA' || deptAdminType === 'hr') return true;

  return false;
};

exports.assertApprover = async (leave, actor) => {
  const requester = await User.findById(leave.user).select(
    'reportsTo approver companyId role'
  ).lean();

  const actorId = String(actor?._id || actor?.id || '');
  const approverId = requester?.reportsTo || requester?.approver || null;
  const isRequester = leave.user.toString() === actorId;
  const isReportingManager = approverId && approverId.toString() === actorId;

  if (isRequester) {
    const err = new Error('You cannot approve your own leave request');
    err.statusCode = 400;
    throw err;
  }

  if (!isReportingManager && !exports.isPrivilegedLeaveAdmin(actor)) {
    const err = new Error('Only Super Admin, Company Admin, HR Admin, or the employee\'s direct reporting manager can approve or reject this request');
    err.statusCode = 403;
    throw err;
  }
  return approverId;
};

// Record ledger movement for a status transition.
// Returns `true` if a ledger entry was posted (so the caller can flag the
// leave as ledgerPosted).
exports.recordTransition = async (leave, status, companyId) => {
  const period = leave.periodKey
    ? await periodService.resolvePeriod(companyId, leave.periodKey)
    : null;
  const periodKey = period?.periodKey || null;
  if (!periodKey) return false;

  if (status === 'Approved' && !leave.ledgerPosted) {
    // Approving posts the consumption.
    await ledgerService.postEntry({
      companyId,
      userId: leave.user,
      leaveTypeRef: leave.leaveTypeRef,
      periodKey,
      entryType: ledgerService.APPROVE,
      quantity: -(leave.durationDays || 0),
      sourceRef: leave._id,
      note: `Leave approved: ${leave.leaveType}`,
    });
    return true;
  }
  if (status === 'Cancelled' && leave.status === 'Approved' && leave.ledgerPosted) {
    // Cancelling an approved leave credits the consumption back.
    await ledgerService.postEntry({
      companyId,
      userId: leave.user,
      leaveTypeRef: leave.leaveTypeRef,
      periodKey,
      entryType: ledgerService.CANCEL,
      quantity: +(leave.durationDays || 0),
      sourceRef: leave._id,
      note: `Leave cancelled after approval: ${leave.leaveType}`,
    });
    return true;
  }
  return false;
};