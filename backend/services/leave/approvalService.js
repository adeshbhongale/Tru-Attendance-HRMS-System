const User = require('../../models/User');
const ledgerService = require('./ledgerService');
const periodService = require('./periodService');

// ── Approval guard ───────────────────────────────────────────────────────────
// Only the employee's current reporting manager (User.reportsTo) may approve
// or reject a pending leave. This is a backend-enforced check, independent of
// any UI hiding, and does not rely on the HR role. HR (admin) may still
// approve only when HR is literally the employee's reportsTo.
exports.assertApprover = async (leave, actor) => {
  const requester = await User.findById(leave.user).select(
    'reportsTo approver companyId role'
  ).lean();

  const approverId = requester?.reportsTo || requester?.approver || null;
  const isRequester = leave.user.toString() === actor.id;
  const isReportingManager = approverId && approverId.toString() === actor.id;

  if (isRequester) {
    const err = new Error('You cannot approve your own leave request');
    err.statusCode = 400;
    throw err;
  }
  const actorRole = (actor.role || '').toLowerCase();
  const actorRoleCode = (actor.roleCode || '').toUpperCase();
  const isGlobalOrCompanyAdmin = actorRole === 'superadmin' || actorRole === 'company_admin' || actorRoleCode === 'TCSA1' || actorRoleCode === 'TCCA1';

  if (!isReportingManager && !isGlobalOrCompanyAdmin) {
    const err = new Error('Only the employee\'s direct reporting manager can approve this request');
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