const notificationService = require('../../../../services/notificationService');
const Notification = require('../../../../models/Notification');
const EmployeeNotification = require('../../../../models/EmployeeNotification');
const finance = require('./financeApprovalService');
const { formatINR } = require('./claimRules');

/**
 * Approval notifications for expense claims (in-app feed + push).
 * - Submitted claim awaiting 1st approval  -> Reporting Manager (managerApproval.approver)
 * - 1st approval done, awaiting 2nd approval -> CFO / Finance Head (financeApproval.approver)
 * Covers Full Payment, Stock Purchase and Other expense claims.
 * Never throws: a notification failure must not break the claim workflow.
 */

const idOf = (v) => (v && (v._id || v)) || null;

function claimKindLabel(claim) {
  if (claim?.fullPayment?.requested || claim?.managerApproval?.kind === 'FULL_PAYMENT') return 'Full Payment';
  if (finance.isStockPurchaseClaim(claim)) return 'Stock Purchase';
  return 'Other Expense';
}

function employeeName(claim, fallback) {
  const sub = claim?.submittedBy;
  return (sub && typeof sub === 'object' && sub.name) || claim?.submittedByName || fallback || 'An employee';
}

async function send({ recipient, title, description, templateDescription, claim, stage, io }) {
  if (!recipient) return null;
  const notification = await notificationService.createAndSendNotification({
    title,
    description,
    type: 'general notification',
    autoType: null,
    frequency: 'Instant',
    targetType: 'Specific Employees',
    employees: [recipient],
    companyId: idOf(claim.companyId) || null,
    isAuto: true,
    data: {
      screen: 'OtherApprovals',
      claimId: String(claim._id),
      claimNumber: String(claim.claimNumber || ''),
      approvalStage: stage,
    },
  }, io);
  // The shared Office Setup record keeps a generic text; the claim-specific message lives only in the
  // recipient's own feed / push (the service copies the last message onto the shared record).
  if (notification?._id && templateDescription) {
    await Notification.updateOne({ _id: notification._id }, { $set: { description: templateDescription } }).catch(() => {});
  }
  return notification;
}

/** Claim submitted and waiting for the Reporting Manager's (1st) approval. */
async function notifyApprovalRequested(req, claim) {
  try {
    if (!claim || claim.status !== 'APPROVAL_PENDING') return;
    const ma = claim.managerApproval || {};
    if (ma.status !== 'PENDING') return;
    const recipient = idOf(ma.approver);
    if (!recipient || String(recipient) === String(req.user?._id)) return;
    const kind = claimKindLabel(claim);
    const amount = formatINR(claim.grandRequested || 0);
    const isFull = kind === 'Full Payment';
    await send({
      recipient,
      title: 'Expense Claim Approval Request 📋',
      description: `${employeeName(claim, req.user?.name)} submitted a ${kind} claim ${claim.claimNumber || ''} of ${amount}${isFull ? ` (policy allows ${formatINR(claim.grandAllowed || 0)})` : ''}. Please review and approve.`,
      templateDescription: 'Sent automatically to the Reporting Manager when a Full Payment / Stock Purchase / Other expense claim is submitted for approval.',
      claim,
      stage: 'MANAGER',
      io: req.app?.get?.('io') || null,
    });
  } catch (err) {
    console.error('[Expense Claim Notification] approval request failed:', err.message);
  }
}

/** Reporting Manager approved; claim forwarded to the CFO / Finance Head for the 2nd approval. */
async function notifyFinanceApprovalRequested(req, claim) {
  try {
    if (!claim) return;
    const fin = claim.financeApproval || {};
    if (fin.status !== 'PENDING') return;
    const recipient = idOf(fin.approver);
    if (!recipient) return;
    const kind = claimKindLabel(claim);
    await send({
      recipient,
      title: 'Expense Claim CFO Approval Request 📋',
      description: `${kind} claim ${claim.claimNumber || ''} of ${formatINR(claim.grandRequested || 0)} by ${employeeName(claim)} was approved by ${req.user?.name || 'the Reporting Manager'} (1st approval) and is awaiting your approval as CFO / Finance Head.`,
      templateDescription: 'Sent automatically to the CFO / Finance Head when a Full Payment / Stock Purchase claim is approved by the Reporting Manager and awaits the 2nd approval.',
      claim,
      stage: 'FINANCE',
      io: req.app?.get?.('io') || null,
    });
  } catch (err) {
    console.error('[Expense Claim Notification] CFO approval request failed:', err.message);
  }
}

/**
 * Lodging (accommodation) claim submitted with other employees added as accommodation partners:
 * each added employee (not the submitter) is told who added them and for which stay.
 * Sent once per employee per claim (employees newly added on a later resubmission are also notified).
 */
async function notifyAccommodationAdded(req, claim) {
  try {
    if (!claim || String(claim.claimMode || '').toUpperCase() !== 'LODGING') return;
    if (String(claim.status || '').toUpperCase() === 'DRAFT') return;
    const submitterId = String(idOf(claim.submittedBy) || req.user?._id || '');
    const recipients = [...new Set((claim.employeeClaims || [])
      .map((ec) => String(idOf(ec?.employee?.employeeId) || ''))
      .filter((id) => id && id !== submitterId))];
    if (!recipients.length) return;

    // Skip employees already notified for this claim
    const already = await EmployeeNotification.find({
      employeeId: { $in: recipients },
      'metadata.claimId': String(claim._id),
      'metadata.notifyKind': 'LODGING_ACCOMMODATION',
    }).distinct('employeeId');
    const done = new Set(already.map(String));
    const pending = recipients.filter((id) => !done.has(id));
    if (!pending.length) return;

    const fmt = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' }) : '');
    const from = fmt(claim.fromDate);
    const to = fmt(claim.toDate);
    const nights = Number(claim.lodgingNights ?? claim.numberOfNights) || 0;
    const place = String(claim.trip?.destination || '').trim();
    const stay = `${from && to ? ` for the stay ${from} to ${to}` : ''}${nights ? ` (${nights} night${nights > 1 ? 's' : ''})` : ''}${place ? ` at ${place}` : ''}`;
    const others = (claim.employeeClaims || [])
      .map((ec) => ec?.employee?.name)
      .filter(Boolean);

    await notificationService.createAndSendNotification({
      title: 'Added to Lodging Claim 🏨',
      description: `${employeeName(claim, req.user?.name)} added you as an accommodation partner in Lodging claim ${claim.claimNumber || ''}${stay}.${others.length > 1 ? ` Sharing with: ${others.join(', ')}.` : ''}`,
      type: 'general notification',
      autoType: null,
      frequency: 'Instant',
      targetType: 'Specific Employees',
      employees: pending,
      companyId: idOf(claim.companyId) || null,
      isAuto: true,
      data: {
        screen: 'ExpenseClaimDetail',
        claimId: String(claim._id),
        claimNumber: String(claim.claimNumber || ''),
        notifyKind: 'LODGING_ACCOMMODATION',
      },
    }, req.app?.get?.('io') || null).then(async (n) => {
      if (n?._id) {
        await Notification.updateOne({ _id: n._id }, {
          $set: { description: 'Sent automatically to employees added as accommodation partners when a Lodging claim is submitted.' },
        }).catch(() => {});
      }
    });
  } catch (err) {
    console.error('[Expense Claim Notification] accommodation notification failed:', err.message);
  }
}

module.exports = { notifyApprovalRequested, notifyFinanceApprovalRequested, notifyAccommodationAdded };
