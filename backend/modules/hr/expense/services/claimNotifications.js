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

async function sendPettyCashNotice({ recipient, companyId, title, description, templateDescription, data, io }) {
  if (!recipient) return null;
  const notification = await notificationService.createAndSendNotification({
    title,
    description,
    type: 'general notification',
    autoType: null,
    frequency: 'Instant',
    targetType: 'Specific Employees',
    employees: [recipient],
    companyId: idOf(companyId) || null,
    isAuto: true,
    data,
  }, io);
  if (notification?._id && templateDescription) {
    await Notification.updateOne({ _id: notification._id }, { $set: { description: templateDescription } }).catch(() => {});
  }
  return notification;
}

/** Employee requested a petty cash advance from a designated Team Lead -> notify Team Lead (opens OtherApprovals). */
async function notifyTeamLeadAdvanceRequested(req, requestDoc, employeeNameStr) {
  try {
    if (!requestDoc || requestDoc.providerType !== 'TEAM_LEAD' || !requestDoc.providerEmployeeId) return;
    const amt = formatINR((Number(requestDoc.requestedAmountPaise) || 0) / 100);
    const who = employeeNameStr || req.user?.name || 'An employee';
    await sendPettyCashNotice({
      recipient: idOf(requestDoc.providerEmployeeId),
      companyId: requestDoc.companyId,
      title: 'Petty Cash Advance Request 💰',
      description: `${who} requested a petty cash advance of ${amt} from you. Reason: ${requestDoc.reason || '—'}. Open Other Approvals to respond.`,
      templateDescription: 'Sent automatically to a designated Team Lead when an employee requests a petty cash advance.',
      data: {
        screen: 'OtherApprovals',
        requestId: String(requestDoc._id),
        notifyKind: 'PETTY_CASH_TL_REQUEST',
      },
      io: req.app?.get?.('io') || null,
    });
  } catch (err) {
    console.error('[PettyCash Notification] TL request notify failed:', err.message);
  }
}

/** Team Lead submitted advance amount + proof + remark -> notify requesting Employee to accept (opens PettyCashWallet -> Enhancements). */
async function notifyEmployeeAdvanceSubmitted(req, requestDoc, teamLeadNameStr) {
  try {
    if (!requestDoc || !requestDoc.employeeId) return;
    const amt = formatINR((Number(requestDoc.approvedAmountPaise) || 0) / 100);
    const who = teamLeadNameStr || req.user?.name || requestDoc.providerEmployeeName || 'Team Lead';
    await sendPettyCashNotice({
      recipient: idOf(requestDoc.employeeId),
      companyId: requestDoc.companyId,
      title: 'Petty Cash Advance Ready to Accept ✅',
      description: `${who} sent you a petty cash advance of ${amt}${requestDoc.tlRemarks ? ` (${requestDoc.tlRemarks})` : ''}. Open Petty Cash Wallet to accept and receive it.`,
      templateDescription: 'Sent automatically to the employee when a Team Lead submits a petty cash advance for acceptance.',
      data: {
        screen: 'PettyCashWallet',
        tab: 'enhance_requests',
        requestId: String(requestDoc._id),
        notifyKind: 'PETTY_CASH_TL_SUBMITTED',
      },
      io: req.app?.get?.('io') || null,
    });
  } catch (err) {
    console.error('[PettyCash Notification] employee submit notify failed:', err.message);
  }
}

/** Team Lead rejected the petty cash advance request -> notify requesting Employee. */
async function notifyTeamLeadAdvanceRejected(req, requestDoc, teamLeadNameStr) {
  try {
    if (!requestDoc || !requestDoc.employeeId) return;
    const amt = formatINR((Number(requestDoc.requestedAmountPaise) || 0) / 100);
    const who = teamLeadNameStr || req.user?.name || requestDoc.providerEmployeeName || 'Team Lead';
    await sendPettyCashNotice({
      recipient: idOf(requestDoc.employeeId),
      companyId: requestDoc.companyId,
      title: 'Petty Cash Advance Request Rejected ❌',
      description: `${who} rejected your petty cash advance request of ${amt}. Reason: ${requestDoc.tlRemarks || requestDoc.remarks || '—'}.`,
      templateDescription: 'Sent automatically to the employee when a Team Lead rejects a petty cash advance request.',
      data: {
        screen: 'PettyCashWallet',
        tab: 'enhance_requests',
        requestId: String(requestDoc._id),
        notifyKind: 'PETTY_CASH_TL_REJECTED',
      },
      io: req.app?.get?.('io') || null,
    });
  } catch (err) {
    console.error('[PettyCash Notification] TL reject notify failed:', err.message);
  }
}

/** Employee accepted the Team Lead advance -> notify both Team Lead (deducted) and Employee (credited). */
async function notifyAdvanceAccepted(req, requestDoc, { empName, tlName } = {}) {
  try {
    if (!requestDoc) return;
    const amt = formatINR((Number(requestDoc.approvedAmountPaise) || 0) / 100);
    const io = req.app?.get?.('io') || null;
    const eName = empName || req.user?.name || 'Employee';
    const tName = tlName || requestDoc.providerEmployeeName || 'Team Lead';

    await Promise.all([
      requestDoc.providerEmployeeId ? sendPettyCashNotice({
        recipient: idOf(requestDoc.providerEmployeeId),
        companyId: requestDoc.companyId,
        title: 'Petty Cash Advance Accepted 💸',
        description: `${eName} accepted your petty cash advance of ${amt}. ${amt} has been deducted from your Petty Cash Wallet.`,
        templateDescription: 'Sent automatically to the Team Lead when an employee accepts a petty cash advance.',
        data: {
          screen: 'PettyCashWallet',
          tab: 'ledger',
          requestId: String(requestDoc._id),
          notifyKind: 'PETTY_CASH_TL_ACCEPTED',
        },
        io,
      }) : null,
      requestDoc.employeeId ? sendPettyCashNotice({
        recipient: idOf(requestDoc.employeeId),
        companyId: requestDoc.companyId,
        title: 'Petty Cash Wallet Credited 💰',
        description: `${amt} petty cash advance from ${tName} has been credited to your Petty Cash Wallet.`,
        templateDescription: 'Sent automatically to the employee when a Team Lead petty cash advance is credited.',
        data: {
          screen: 'PettyCashWallet',
          tab: 'ledger',
          requestId: String(requestDoc._id),
          notifyKind: 'PETTY_CASH_EMP_CREDITED',
        },
        io,
      }) : null,
    ]);
  } catch (err) {
    console.error('[PettyCash Notification] accept notify failed:', err.message);
  }
}

/** Employee requested to return petty cash to a designated Team Lead -> notify Team Lead (opens OtherApprovals). */
async function notifyTeamLeadReturnRequested(req, returnDoc, employeeNameStr) {
  try {
    if (!returnDoc || returnDoc.recipientType !== 'TEAM_LEAD' || !returnDoc.recipientEmployeeId) return;
    const amt = formatINR((Number(returnDoc.requestedAmountPaise) || 0) / 100);
    const who = employeeNameStr || req.user?.name || 'An employee';
    await sendPettyCashNotice({
      recipient: idOf(returnDoc.recipientEmployeeId),
      companyId: returnDoc.companyId,
      title: 'Petty Cash Return Request ↩️',
      description: `${who} sent a petty cash return request of ${amt} to you with payment proof. Open Other Approvals to accept or reject.`,
      templateDescription: 'Sent automatically to a designated Team Lead when an employee submits a petty cash return request to them.',
      data: {
        screen: 'OtherApprovals',
        requestId: String(returnDoc._id),
        notifyKind: 'PETTY_CASH_TL_RETURN_REQUEST',
      },
      io: req.app?.get?.('io') || null,
    });
  } catch (err) {
    console.error('[PettyCash Notification] TL return request notify failed:', err.message);
  }
}

/** Team Lead accepted the petty cash return -> notify both Employee (deducted) and Team Lead (credited). */
async function notifyReturnAcceptedByTeamLead(req, returnDoc, { empName, tlName } = {}) {
  try {
    if (!returnDoc) return;
    const amt = formatINR((Number(returnDoc.approvedAmountPaise || returnDoc.requestedAmountPaise) || 0) / 100);
    const io = req.app?.get?.('io') || null;
    const eName = empName || 'Employee';
    const tName = tlName || req.user?.name || returnDoc.recipientEmployeeName || 'Team Lead';
    await Promise.all([
      returnDoc.employeeId ? sendPettyCashNotice({
        recipient: idOf(returnDoc.employeeId),
        companyId: returnDoc.companyId,
        title: 'Petty Cash Return Accepted ✅',
        description: `${tName} accepted your petty cash return of ${amt}. ${amt} has been deducted from your Petty Cash Wallet.`,
        templateDescription: 'Sent automatically to the employee when a Team Lead accepts their petty cash return request.',
        data: {
          screen: 'PettyCashWallet',
          tab: 'ledger',
          requestId: String(returnDoc._id),
          notifyKind: 'PETTY_CASH_TL_RETURN_ACCEPTED',
        },
        io,
      }) : null,
      returnDoc.recipientEmployeeId ? sendPettyCashNotice({
        recipient: idOf(returnDoc.recipientEmployeeId),
        companyId: returnDoc.companyId,
        title: 'Petty Cash Return Credited 💰',
        description: `${amt} returned by ${eName} has been added to your Petty Cash Wallet.`,
        templateDescription: 'Sent automatically to the Team Lead when a petty cash return from an employee is credited.',
        data: {
          screen: 'PettyCashWallet',
          tab: 'ledger',
          requestId: String(returnDoc._id),
          notifyKind: 'PETTY_CASH_TL_RETURN_CREDITED',
        },
        io,
      }) : null,
    ]);
  } catch (err) {
    console.error('[PettyCash Notification] TL return accept notify failed:', err.message);
  }
}

/** Team Lead rejected the petty cash return -> notify requesting Employee. */
async function notifyTeamLeadReturnRejected(req, returnDoc, tlName) {
  try {
    if (!returnDoc || !returnDoc.employeeId) return;
    const amt = formatINR((Number(returnDoc.requestedAmountPaise) || 0) / 100);
    const who = tlName || req.user?.name || returnDoc.recipientEmployeeName || 'Team Lead';
    await sendPettyCashNotice({
      recipient: idOf(returnDoc.employeeId),
      companyId: returnDoc.companyId,
      title: 'Petty Cash Return Rejected ❌',
      description: `${who} rejected your petty cash return request of ${amt}. Reason: ${returnDoc.reviewRemarks || '—'}.`,
      templateDescription: 'Sent automatically to the employee when a Team Lead rejects a petty cash return request.',
      data: {
        screen: 'PettyCashWallet',
        tab: 'return_requests',
        requestId: String(returnDoc._id),
        notifyKind: 'PETTY_CASH_TL_RETURN_REJECTED',
      },
      io: req.app?.get?.('io') || null,
    });
  } catch (err) {
    console.error('[PettyCash Notification] TL return reject notify failed:', err.message);
  }
}

module.exports = {
  notifyApprovalRequested,
  notifyFinanceApprovalRequested,
  notifyAccommodationAdded,
  notifyTeamLeadAdvanceRequested,
  notifyEmployeeAdvanceSubmitted,
  notifyTeamLeadAdvanceRejected,
  notifyAdvanceAccepted,
  notifyTeamLeadReturnRequested,
  notifyReturnAcceptedByTeamLead,
  notifyTeamLeadReturnRejected,
};
