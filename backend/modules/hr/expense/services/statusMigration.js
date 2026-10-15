const { PENDING_STATUSES, PAID_STATUSES, REJECTED_STATUSES } = require('./expenseAccess');

/**
 * Pure mapping used by scripts/migrate_expense_paid_rejected.js.
 * Maps a legacy claim to the Draft / Pending / Paid / Rejected workflow WITHOUT inventing
 * outcomes: approved-but-unpaid claims stay Pending, CANCELLED and inconsistent records
 * are left unchanged and flagged for manual reconciliation.
 *
 * Returns null (no change needed) or { from, to, set, review } where `set` is the $set
 * payload (may be empty when only a review flag is raised) and `review` is a reason
 * string for the reconciliation report (or null).
 */
function mapLegacyClaim(c) {
  const from = String(c.status || '').toUpperCase();
  const ps = String(c.paymentStatus || '').toUpperCase();
  const paidAmount = c.paidAmount || c.disbursement?.amount || 0;
  const paymentDate = c.disbursedAt || c.disbursement?.paymentDate || null;
  const keepLegacy = (to) => (to !== from ? { legacyStatus: from } : {});

  if (from === 'DRAFT') return null;

  if (from === 'RETURNED') {
    return {
      from, to: 'DRAFT', set: { status: 'DRAFT', paymentStatus: 'PENDING', legacyStatus: from },
      review: 'Returned for correction: moved back to Draft for the employee to resubmit.',
    };
  }

  if (from === 'CANCELLED') {
    return { from, to: from, set: {}, review: 'Cancelled claim: no Paid/Rejected decision recorded. Left unchanged.' };
  }

  if (PAID_STATUSES.includes(from)) {
    if (from === 'PAID' && ps === 'PAID' && paidAmount > 0) return null;
    const set = { status: 'PAID', paymentStatus: 'PAID', ...keepLegacy('PAID') };
    if (!c.paidAmount && paidAmount) set.paidAmount = paidAmount;
    const review = !paidAmount || !paymentDate
      ? `Marked ${from} but payment ${!paidAmount ? 'amount' : 'date'} is missing. Verify payment record.`
      : null;
    return { from, to: 'PAID', set, review };
  }

  if (REJECTED_STATUSES.includes(from)) {
    if (from === 'REJECTED' && ps === 'REJECTED' && c.rejection?.reason) return null;
    const lastRejection = [...(c.approvalHistory || [])].reverse().find((h) => h.action === 'rejected');
    const reason = c.rejection?.reason || lastRejection?.remarks || c.accountsRemarks || c.hrRemarks || '';
    const set = {
      status: 'REJECTED',
      paymentStatus: 'REJECTED',
      ...keepLegacy('REJECTED'),
      rejection: {
        reason: reason || 'Legacy rejection – reason not recorded',
        rejectedAt: c.rejection?.rejectedAt || lastRejection?.timestamp || c.hrReviewedAt || c.updatedAt || null,
        rejectedBy: c.rejection?.rejectedBy || lastRejection?.user || c.hrReviewedBy || null,
        rejectedByName: c.rejection?.rejectedByName || '',
      },
    };
    return { from, to: 'REJECTED', set, review: reason ? null : 'Rejected without a recorded reason.' };
  }

  if (PENDING_STATUSES.includes(from)) {
    if (['PAID', 'DISBURSED'].includes(ps)) {
      return { from, to: from, set: {}, review: `Status ${from} but payment status ${ps}. Inconsistent record: verify manually.` };
    }
    const wasApproved = ['ACCOUNTS_APPROVED', 'APPROVED'].includes(from) || ps === 'AWAITING_DISBURSEMENT';
    if (from === 'SUBMITTED' && ps === 'PENDING') return null;
    return {
      from,
      to: 'SUBMITTED',
      set: { status: 'SUBMITTED', paymentStatus: 'PENDING', ...keepLegacy('SUBMITTED') },
      review: wasApproved ? 'Previously approved, payment not confirmed: now Pending a Paid/Rejected decision.' : null,
    };
  }

  return { from, to: from, set: {}, review: `Unknown status "${from}". Left unchanged.` };
}

module.exports = { mapLegacyClaim };
