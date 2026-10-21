const mongoose = require('mongoose');
try { require('../../../../models/Company'); } catch (_) {}
try { require('../../../../models/User'); } catch (_) {}
try { require('../../../../models/Location'); } catch (_) {}
const User = require('../../../../models/User');
const ExpenseClaim = require('../models/ExpenseClaim');
const ExpenseAuditLog = require('../models/ExpenseAuditLog');
const CityClassification = require('../models/CityClassification');
const { ensureExpenseMasters } = require('../services/seedExpenseMasters');
const access = require('../services/expenseAccess');
const { computePayable, formatINR, approvalKindFor } = require('../services/claimRules');
const { round2 } = require('../services/calculationEngine');

/**
 * Expense claim decisions + reporting.
 * Workflow: DRAFT -> SUBMITTED ("Pending") -> PAID | REJECTED.
 * An authorised user marks a Pending claim Paid or Rejected directly; there is no
 * approval or disbursement stage. Rejected claims can only be reopened (to Pending)
 * by a Company Admin / Super Admin through the audited /reopen endpoint.
 */

const resolveTenantCompanyId = async (req) => access.resolveCompanyId(req, { allowAll: true });
const { isHR, isAccounts } = access;

const fail = (res, status, message) => res.status(status).json({ success: false, message });
const str = (v, max) => String(v === undefined || v === null ? '' : v).trim().slice(0, max);

async function loadClaim(req, res) {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) { fail(res, 404, 'Claim not found'); return null; }
  const claim = await ExpenseClaim.findById(req.params.id);
  if (!claim) { fail(res, 404, 'Claim not found'); return null; }
  if (!access.sameCompany(claim, await resolveTenantCompanyId(req))) { fail(res, 404, 'Claim not found'); return null; }
  return claim;
}

const POPULATE_QUEUE = [
  { path: 'submittedBy', select: 'name employeeIdCode department designation' },
  { path: 'companyId', select: 'name code' },
  { path: 'managerApproval.approver', select: 'name employeeIdCode department designation role roleCode' },
  { path: 'fullPayment.decidedBy', select: 'name employeeIdCode department designation' },
];

const withPermissions = (req, claim) => {
  const c = claim.toObject ? claim.toObject() : claim;
  return { ...c, permissions: access.claimPermissions(req, c) };
};

/**
 * GET /api/expense/accounts/pending — Pending claims waiting for a Paid / Rejected decision.
 */
exports.pendingQueue = async (req, res) => {
  try {
    if (!isAccounts(req.user) && !isHR(req.user)) return fail(res, 403, 'Accounts, HR or Admin role required.');
    const companyId = await resolveTenantCompanyId(req);
    const filter = { status: { $in: access.PENDING_STATUSES } };
    if (companyId && companyId !== 'ALL') filter.companyId = companyId;
    const claims = await ExpenseClaim.find(filter).populate(POPULATE_QUEUE).sort({ submittedAt: 1, createdAt: 1 }).lean();
    res.json({ success: true, data: claims.map((c) => withPermissions(req, c)) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/** Why an action is not allowed, as an HTTP status + message. */
function denyReason(req, perms, action) {
  const bs = perms.businessStatus;
  if (bs === 'PAID') return [409, 'Payment has already been recorded for this claim. Paid claims are locked.'];
  if (action === 'pay' && bs === 'REJECTED') return [409, 'Rejected claims cannot be marked Paid. Reopen the claim first.'];
  if (action === 'reject' && bs === 'REJECTED') return [409, 'This claim has already been rejected.'];
  if (action === 'reopen' && bs !== 'REJECTED') return [409, 'Only rejected claims can be reopened.'];
  if (bs === 'DRAFT') return [409, 'Draft claims must be submitted first.'];
  if ((action === 'pay' || action === 'reject') && perms.awaitingApproval) {
    return [409, 'This claim is still waiting for approval from the selected Management user / Reporting Manager.'];
  }
  const roleOk = { pay: isAccounts(req.user), reject: isAccounts(req.user) || isHR(req.user), reopen: access.isCompanyAdmin(req.user) }[action];
  if (!roleOk) {
    return [403, {
      pay: 'Only Accounts, Company Admin or Super Admin can mark claims as Paid.',
      reject: 'Only Accounts, HR, Company Admin or Super Admin can reject claims.',
      reopen: 'Only Company Admin or Super Admin can reopen rejected claims.',
    }[action]];
  }
  return [403, 'You cannot process a claim you are part of.'];
}

/** Parse a YYYY-MM-DD (or ISO) payment date; null when invalid or in the future. */
function parsePaymentDate(value, now = new Date()) {
  if (!value) return now;
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  if (d.getTime() > now.getTime() + 24 * 3600 * 1000) return null;
  return d;
}

/**
 * POST /api/expense/claims/:id/payment — Mark as Paid.
 * Body: { paymentDate?, paidAmount?, paymentMethod?, paymentReference?, remarks? }
 */
exports.markPaid = async (req, res) => {
  try {
    const claim = await loadClaim(req, res);
    if (!claim) return;
    const perms = access.claimPermissions(req, claim);
    if (!perms.canMarkPaid) { const [code, msg] = denyReason(req, perms, 'pay'); return fail(res, code, msg); }

    const body = req.body || {};
    const paymentDate = parsePaymentDate(body.paymentDate);
    if (!paymentDate) return fail(res, 422, 'Please enter a valid payment date (not in the future).');

    const payable = round2(claim.payableAmount > 0 ? claim.payableAmount : (computePayable(claim) || claim.grandAllowed || claim.grandRequested || 0));
    let paidAmount = payable;
    if (body.paidAmount !== undefined && body.paidAmount !== null && body.paidAmount !== '') {
      paidAmount = round2(Number(body.paidAmount));
      if (!Number.isFinite(paidAmount) || paidAmount <= 0) return fail(res, 422, 'Paid amount must be greater than zero.');
      if (paidAmount > round2(claim.grandRequested || payable)) return fail(res, 422, `Paid amount cannot exceed the claimed amount (${formatINR(claim.grandRequested)}).`);
    }
    const paymentMethod = str(body.paymentMethod || 'Bank Transfer', 60);
    const reference = str(body.paymentReference || body.utr, 100);
    const remarks = str(body.remarks || body.paymentRemarks, 500);
    const now = new Date();
    const before = access.snapshot(claim);
    const recordedByName = req.user.name || '';

    // Atomic: only a still-Pending, not-yet-paid claim can be updated -> no duplicate payments.
    const updated = await ExpenseClaim.findOneAndUpdate(
      { _id: claim._id, status: { $in: access.PENDING_STATUSES }, paymentStatus: { $nin: ['PAID', 'DISBURSED'] } },
      {
        $set: {
          status: 'PAID',
          paymentStatus: 'PAID',
          paidAmount,
          disbursedAt: paymentDate,
          disbursedBy: req.user._id,
          paymentMethod,
          utr: reference,
          accountsRemarks: remarks,
          lockedAt: now,
          disbursement: {
            amount: paidAmount,
            paymentDate,
            paymentMethod,
            paymentReference: reference,
            recordedBy: req.user._id,
            recordedByName,
            remarks,
          },
        },
        $push: {
          approvalHistory: { user: req.user._id, role: req.user.role, action: 'paid', timestamp: now, remarks: remarks || `Paid ${formatINR(paidAmount)}` },
          timeline: {
            action: 'PAID',
            description: `Payment of ${formatINR(paidAmount)} recorded by ${recordedByName || 'Accounts'} (paid on ${paymentDate.toLocaleDateString('en-GB')})${reference ? `, ref ${reference}` : ''}.`,
            user: req.user._id,
            timestamp: now,
          },
        },
      },
      { new: true }
    );
    if (!updated) return fail(res, 409, 'This claim was already processed by someone else.');

    await access.audit({
      req,
      action: 'PAYMENT_COMPLETED',
      claim: updated,
      description: `Claim ${updated.claimNumber} marked PAID: ${formatINR(paidAmount)}.`,
      before,
      after: access.snapshot(updated),
      metadata: { paidAmount, payableAmount: payable, paymentDate, paymentMethod, paymentReference: reference, remarks },
    });
    if (paidAmount !== payable) {
      await access.audit({
        req,
        action: 'PAID_AMOUNT_ADJUSTED',
        claim: updated,
        description: `Paid amount ${formatINR(paidAmount)} differs from payable ${formatINR(payable)} on ${updated.claimNumber}.`,
        metadata: { paidAmount, payableAmount: payable, claimedAmount: updated.grandRequested },
      });
    }
    res.json({ success: true, data: withPermissions(req, updated) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/** POST /api/expense/claims/:id/reject — Reject Claim. Body: { reason } */
exports.rejectClaim = async (req, res) => {
  try {
    const claim = await loadClaim(req, res);
    if (!claim) return;
    const perms = access.claimPermissions(req, claim);
    if (!perms.canReject) { const [code, msg] = denyReason(req, perms, 'reject'); return fail(res, code, msg); }
    const reason = str(req.body?.reason || req.body?.remarks, 500);
    if (reason.length < 3) return fail(res, 422, 'Please enter the reason for rejecting the claim.');

    const now = new Date();
    const before = access.snapshot(claim);
    const rejectedByName = req.user.name || '';
    const updated = await ExpenseClaim.findOneAndUpdate(
      { _id: claim._id, status: { $in: access.PENDING_STATUSES }, paymentStatus: { $nin: ['PAID', 'DISBURSED'] } },
      {
        $set: {
          status: 'REJECTED',
          paymentStatus: 'REJECTED',
          accountsRemarks: reason,
          rejection: { reason, rejectedAt: now, rejectedBy: req.user._id, rejectedByName },
        },
        $push: {
          approvalHistory: { user: req.user._id, role: req.user.role, action: 'rejected', timestamp: now, remarks: reason },
          timeline: { action: 'REJECTED', description: `Rejected by ${rejectedByName || 'admin'}: ${reason}`, user: req.user._id, timestamp: now },
        },
      },
      { new: true }
    );
    if (!updated) return fail(res, 409, 'This claim was already processed by someone else.');

    await access.audit({
      req,
      action: 'CLAIM_REJECTED',
      claim: updated,
      description: `Claim ${updated.claimNumber} rejected: ${reason}`,
      before,
      after: access.snapshot(updated),
      metadata: { reason },
    });
    res.json({ success: true, data: withPermissions(req, updated) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/** POST /api/expense/claims/:id/reopen — audited correction: Rejected -> Pending. Body: { reason } */
exports.reopenClaim = async (req, res) => {
  try {
    const claim = await loadClaim(req, res);
    if (!claim) return;
    const perms = access.claimPermissions(req, claim);
    if (!perms.canReopen) { const [code, msg] = denyReason(req, perms, 'reopen'); return fail(res, code, msg); }
    const reason = str(req.body?.reason, 500);
    if (reason.length < 3) return fail(res, 422, 'Please enter the reason for reopening the claim.');

    const now = new Date();
    const before = access.snapshot(claim);
    const previousRejection = claim.rejection?.reason ? claim.rejection.toObject?.() || claim.rejection : { reason: claim.accountsRemarks || claim.hrRemarks || '' };
    // Full Payment / OTHER expense claims go back to their selected approver.
    const kind = approvalKindFor(claim);
    const needsApproval = kind !== 'NONE' && !!claim.managerApproval?.approver;
    const set = {
      status: needsApproval ? 'APPROVAL_PENDING' : 'SUBMITTED',
      paymentStatus: 'PENDING',
      rejection: { reason: '', rejectedAt: null, rejectedBy: null, rejectedByName: '' },
    };
    if (needsApproval) {
      Object.assign(set, {
        'managerApproval.kind': kind,
        'managerApproval.status': 'PENDING',
        'managerApproval.requestedAt': now,
        'managerApproval.decidedAt': null,
        'managerApproval.remarks': '',
      });
      if (claim.fullPayment?.requested) {
        Object.assign(set, { 'fullPayment.status': 'PENDING', 'fullPayment.approvedAmount': 0, payableAmount: round2(claim.grandAllowed || 0) });
      }
    }
    const updated = await ExpenseClaim.findOneAndUpdate(
      { _id: claim._id, status: { $in: access.REJECTED_STATUSES } },
      {
        $set: set,
        $push: {
          approvalHistory: { user: req.user._id, role: req.user.role, action: 'reopened', timestamp: now, remarks: reason },
          timeline: {
            action: 'REOPENED',
            description: `Rejection reversed by ${req.user.name || 'admin'}: ${reason}. ${needsApproval ? `Awaiting approval from ${claim.managerApproval.approverName || 'approver'} again.` : 'Claim is Pending again.'}`,
            user: req.user._id,
            timestamp: now,
            metadata: { previousRejection, previousStatus: claim.status },
          },
        },
      },
      { new: true }
    );
    if (!updated) return fail(res, 409, 'This claim was already processed by someone else.');

    await access.audit({
      req,
      action: 'CLAIM_REOPENED',
      claim: updated,
      description: `Claim ${updated.claimNumber} reopened (Rejected -> Pending): ${reason}`,
      before,
      after: access.snapshot(updated),
      metadata: { reason, previousRejection, previousStatus: claim.status },
    });
    res.json({ success: true, data: withPermissions(req, updated) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * GET /api/expense/audit?claimId=&action=&limit=
 * With claimId: anyone who can view the claim. Without: HR / Accounts / Admin only.
 */
exports.auditLogs = async (req, res) => {
  try {
    const filter = {};
    if (req.query.claimId) {
      if (!mongoose.Types.ObjectId.isValid(req.query.claimId)) return fail(res, 404, 'Claim not found');
      const claim = await ExpenseClaim.findById(req.query.claimId).select('companyId submittedBy status employeeClaims.employee.employeeId').lean();
      if (!claim || !access.canViewClaim(req, claim)) return fail(res, 404, 'Claim not found');
      filter.entityId = String(req.query.claimId);
    } else {
      if (!access.isStaff(req.user)) return fail(res, 403, 'HR, Accounts or Admin role required.');
      const companyId = await resolveTenantCompanyId(req);
      if (companyId && companyId !== 'ALL') filter.companyId = companyId;
    }
    if (req.query.action) filter.action = String(req.query.action).toUpperCase();
    const logs = await ExpenseAuditLog.find(filter)
      .sort({ createdAt: -1 })
      .limit(Math.min(1000, parseInt(req.query.limit, 10) || 200))
      .lean();
    res.json({ success: true, data: logs });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── Date helpers (IST calendar days) ───────────────────────────────────────

const IST_OFFSET_MIN = 330;
function istDayStart(ymd) {
  const m = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]) - IST_OFFSET_MIN * 60000);
}
function istDayEnd(ymd) {
  const s = istDayStart(ymd);
  return s ? new Date(s.getTime() + 86400000 - 1) : null;
}
function timeRange(from, to) {
  const r = {};
  const s = istDayStart(from);
  const e = istDayEnd(to);
  if (s) r.$gte = s;
  if (e) r.$lte = e;
  return Object.keys(r).length ? r : null;
}
/** Date-only fields are stored as UTC midnight (claimDate / fromDate / toDate). */
function dateOnly(ymd) {
  const m = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null;
}

/**
 * GET /api/expense/dashboard-analytics?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 * Summary KPIs (Total / Pending / Paid / Rejected), employee-wise and project-wise breakdown.
 */
exports.getExpenseDashboardAnalytics = async (req, res) => {
  try {
    const scope = access.reportScope(req);
    if (scope.blocked) return fail(res, 403, 'Access denied: Expense Dashboard is blocked for Store Admin.');
    if (!access.isStaff(req.user)) {
      return fail(res, 403, 'Access denied: Only Company Admin, HR Admin, and Accounts Admin can access Expense Dashboard.');
    }

    const { startDate, endDate } = req.query;
    const andConditions = [...scope.conditions, { status: { $nin: [...access.DRAFT_STATUSES, ...access.APPROVAL_PENDING_STATUSES] } }];
    const range = timeRange(startDate, endDate);
    if (range) {
      andConditions.push({
        $or: [
          { claimDate: range },
          { fromDate: range },
          { toDate: range },
          { $and: [{ claimDate: null }, { fromDate: null }, { createdAt: range }] },
        ],
      });
    }

    const claims = await ExpenseClaim.find({ $and: andConditions })
      .populate('submittedBy', 'name employeeIdCode department designation')
      .populate('employeeClaims.employee.employeeId', 'name employeeIdCode department designation')
      .sort({ createdAt: -1 })
      .lean();

    const totals = { submitted: { amount: 0, count: 0 }, pending: { amount: 0, count: 0 }, paid: { amount: 0, count: 0 }, rejected: { amount: 0, count: 0 }, excess: 0 };
    const employeeMap = {};
    const projectMap = {};
    const emptyRow = () => ({ expensesSubmitted: 0, totalSubmitted: 0, advanceAmount: 0, pending: 0, paid: 0, rejected: 0, excessAmount: 0 });
    const addTo = (row, bs, { req: r, pendingAmt, paidAmt, excess }) => {
      row.expensesSubmitted += 1;
      row.totalSubmitted += r;
      row.excessAmount += excess;
      if (bs === 'PENDING') row.pending += pendingAmt;
      else if (bs === 'PAID') row.paid += paidAmt;
      else if (bs === 'REJECTED') row.rejected += r;
    };

    claims.forEach((claim) => {
      const bs = access.businessStatus(claim);
      const reqAmt = claim.grandRequested || 0;
      const allowedAmt = claim.grandAllowed || 0;
      const payable = claim.payableAmount || allowedAmt;
      const paidAmt = bs === 'PAID' ? (claim.paidAmount || claim.disbursement?.amount || payable) : 0;
      const excessAmt = bs === 'PAID' ? Math.max(0, reqAmt - paidAmt) : (claim.grandExcess || Math.max(0, reqAmt - allowedAmt));

      totals.submitted.amount += reqAmt; totals.submitted.count += 1;
      totals.excess += excessAmt;
      if (bs === 'PENDING') { totals.pending.amount += payable; totals.pending.count += 1; }
      if (bs === 'PAID') { totals.paid.amount += paidAmt; totals.paid.count += 1; }
      if (bs === 'REJECTED') { totals.rejected.amount += reqAmt; totals.rejected.count += 1; }

      // Employee-wise: lodging is attributed to the submitter; tagged co-occupants get only their own non-lodging items.
      const submitterId = String(claim.submittedBy?._id || claim.submittedBy || 'unknown');
      const empClaimList = claim.employeeClaims?.length
        ? claim.employeeClaims
        : [{ employee: { employeeId: claim.submittedBy, name: claim.submittedByName }, items: [] }];

      empClaimList.forEach((ec) => {
        const emp = ec.employee || {};
        const empUser = emp.employeeId && typeof emp.employeeId === 'object' && emp.employeeId._id ? emp.employeeId : null;
        const empId = String(empUser?._id || emp.employeeId || submitterId);
        const isSubmitter = empId === submitterId;
        let ecReq = 0; let ecAllowed = 0; let ecExcess = 0;
        if (Array.isArray(ec.items) && ec.items.length) {
          ec.items.forEach((it) => {
            if (String(it.expenseType || '').toUpperCase() === 'LODGING' && !isSubmitter) return;
            ecReq += Number(it.requestedAmount || it.amount || 0);
            ecAllowed += Number(it.allowedAmount || it.requestedAmount || 0);
            ecExcess += Number(it.excessAmount || 0);
          });
        } else if (isSubmitter) {
          ecReq = ec.requestedTotal > 0 ? ec.requestedTotal : reqAmt;
          ecAllowed = ec.allowedTotal > 0 ? ec.allowedTotal : allowedAmt;
          ecExcess = ec.excessTotal >= 0 && ec.excessTotal !== undefined ? ec.excessTotal : excessAmt;
        }
        if (!(ecReq > 0 || isSubmitter)) return;
        if (!employeeMap[empId]) {
          const src = empUser || emp;
          const sub = isSubmitter && typeof claim.submittedBy === 'object' ? claim.submittedBy : {};
          employeeMap[empId] = {
            id: empId,
            employeeName: src.name || sub.name || claim.submittedByName || 'Unknown Employee',
            employeeCode: src.employeeIdCode || sub.employeeIdCode || '',
            department: src.department || sub.department || '',
            designation: src.designation || sub.designation || '',
            ...emptyRow(),
          };
        }
        const share = allowedAmt > 0 ? ecAllowed / allowedAmt : (isSubmitter ? 1 : 0);
        addTo(employeeMap[empId], bs, { req: ecReq, pendingAmt: ecAllowed, paidAmt: round2(paidAmt * share), excess: ecExcess });
      });

      const projectName = claim.trip?.purpose || claim.trip?.customerName || claim.claimType || 'General Expenses';
      if (!projectMap[projectName]) projectMap[projectName] = { projectName, destination: claim.trip?.destination || '', ...emptyRow() };
      addTo(projectMap[projectName], bs, { req: reqAmt, pendingAmt: payable, paidAmt, excess: excessAmt });
    });

    const roundRow = (r) => ({
      ...r,
      totalSubmitted: round2(r.totalSubmitted),
      advanceAmount: round2(r.advanceAmount),
      pending: round2(r.pending),
      paid: round2(r.paid),
      rejected: round2(r.rejected),
      excessAmount: round2(r.excessAmount),
    });
    const money = (o) => ({ amount: round2(o.amount), count: o.count });

    res.json({
      success: true,
      data: {
        summary: {
          totalSubmitted: money(totals.submitted),
          pending: money(totals.pending),
          paid: money(totals.paid),
          rejected: money(totals.rejected),
          excess: { amount: round2(totals.excess) },
        },
        employeeWise: Object.values(employeeMap).map(roundRow).sort((a, b) => b.totalSubmitted - a.totalSubmitted),
        projectWise: Object.values(projectMap).map(roundRow).sort((a, b) => b.totalSubmitted - a.totalSubmitted),
        generatedOn: new Date().toLocaleString('en-GB', { timeZone: 'Asia/Kolkata', hour12: true }),
        dateRange: { startDate: startDate || '', endDate: endDate || '' },
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── Expense Report ─────────────────────────────────────────────────────────

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const isSet = (v) => v !== undefined && v !== null && String(v).trim() !== '' && String(v).toUpperCase() !== 'ALL';
const toOid = (v) => (mongoose.Types.ObjectId.isValid(v) ? new mongoose.Types.ObjectId(String(v)) : null);
const anyEmployeeIn = (ids) => ({ $or: [{ submittedBy: { $in: ids } }] });

/**
 * Pure filter builder: every selected condition is ANDed.
 * `userIds` holds pre-resolved employee ids for manager / work-location / department filters.
 */
function buildReportFilter(q = {}, { scopeConditions = [], userIds = {} } = {}) {
  // Awaiting approval claims (APPROVAL_PENDING) do not show in expense report table until approved.
  const and = [...scopeConditions, { status: { $nin: [...access.DRAFT_STATUSES, ...access.APPROVAL_PENDING_STATUSES] } }];

  const status = String(q.status || '').toUpperCase();
  if (status === 'PENDING') {
    and.push({ status: { $in: access.PENDING_STATUSES } });
  } else if (['PAID', 'REJECTED'].includes(status)) {
    and.push({ status: { $in: access.STATUS_LISTS[status] } });
  }

  // Reports do not show tagged claims for tagged employees: filter strictly by submitter
  if (isSet(q.employeeId)) {
    const oid = toOid(q.employeeId);
    and.push(oid ? { submittedBy: oid } : { _id: null });
  }
  if (isSet(q.employeeCode)) {
    if (userIds.employeeCode) {
      and.push({ submittedBy: { $in: userIds.employeeCode } });
    } else {
      and.push({
        $or: [
          { submittedByName: { $regex: escapeRegex(String(q.employeeCode).trim()), $options: 'i' } },
        ],
      });
    }
  }
  if (isSet(q.city)) and.push({ 'trip.destination': { $regex: escapeRegex(String(q.city).trim()), $options: 'i' } });
  if (isSet(q.department)) {
    const dept = { $regex: `^${escapeRegex(String(q.department).trim())}$`, $options: 'i' };
    and.push({ $or: [{ 'employeeClaims.employee.department': dept }, { submittedBy: { $in: userIds.department || [] } }] });
  }
  if (isSet(q.managerId)) and.push(anyEmployeeIn(userIds.manager || []));
  if (isSet(q.workLocation)) and.push(anyEmployeeIn(userIds.workLocation || []));
  if (isSet(q.expenseType)) {
    const t = String(q.expenseType).trim().toUpperCase();
    and.push({ $or: [{ claimType: t }, { 'employeeClaims.items.expenseType': t }, { 'entries.expenseType': t }] });
  }

  const submitted = timeRange(q.submittedFrom, q.submittedTo);
  if (submitted) and.push({ submittedAt: submitted });

  const paid = timeRange(q.paidFrom, q.paidTo);
  if (paid) and.push({ $or: [{ disbursedAt: paid }, { 'disbursement.paymentDate': paid }] });

  const ef = dateOnly(q.expenseFrom);
  const et = dateOnly(q.expenseTo);
  if (ef || et) {
    const etEnd = et ? new Date(et.getTime() + 86400000 - 1) : null;
    const claimDate = {};
    if (ef) claimDate.$gte = ef;
    if (etEnd) claimDate.$lte = etEnd;

    const fromDate = {};
    if (ef) fromDate.$gte = ef;
    if (etEnd) fromDate.$lte = etEnd;

    const lodging = {
      $or: [
        { fromDate },
        {
          ...(etEnd ? { fromDate: { $lte: etEnd } } : {}),
          ...(ef ? { toDate: { $gte: ef } } : {}),
        },
      ],
    };

    and.push({ $or: [{ claimDate }, lodging] });
  }

  const min = Number(q.minAmount);
  const max = Number(q.maxAmount);
  if (isSet(q.minAmount) && Number.isFinite(min)) and.push({ grandRequested: { $gte: min } });
  if (isSet(q.maxAmount) && Number.isFinite(max)) and.push({ grandRequested: { $lte: max } });

  if (isSet(q.search)) {
    const rx = { $regex: escapeRegex(String(q.search).trim()), $options: 'i' };
    and.push({
      $or: [
        { claimNumber: rx },
        { submittedByName: rx },
        { 'employeeClaims.employee.name': rx },
        { 'employeeClaims.employee.employeeIdCode': rx },
        { 'trip.customerName': rx },
        { 'trip.purpose': rx },
        { 'trip.destination': rx },
        { 'employeeClaims.items.description': rx },
        { 'employeeClaims.items.barcodeNumber': rx },
        { 'entries.barcodeNumber': rx },
        { 'entries.remark': rx },
        { 'receipts.name': rx },
      ],
    });
  }
  return { $and: and };
}

/** Resolves manager / work-location / department filters to employee ids (within the tenant). */
async function resolveReportFilter(req) {
  const scope = access.reportScope(req);
  if (scope.blocked) return { blocked: true };
  const q = req.query || {};
  const companyId = access.resolveCompanyId(req, { allowAll: true });
  const userBase = companyId && companyId !== 'ALL' ? { companyId } : {};
  const idsWhere = async (cond) => (await User.find({ ...userBase, ...cond }).select('_id').lean()).map((u) => u._id);
  const userIds = {};
  if (isSet(q.employeeCode)) userIds.employeeCode = await idsWhere({ employeeIdCode: { $regex: escapeRegex(String(q.employeeCode).trim()), $options: 'i' } });
  if (isSet(q.managerId)) userIds.manager = toOid(q.managerId) ? await idsWhere({ reportsTo: toOid(q.managerId) }) : [];
  if (isSet(q.workLocation)) userIds.workLocation = toOid(q.workLocation) ? await idsWhere({ workingPlace: toOid(q.workLocation) }) : [];
  if (isSet(q.department)) userIds.department = await idsWhere({ department: { $regex: `^${escapeRegex(String(q.department).trim())}$`, $options: 'i' } });
  return { filter: buildReportFilter(q, { scopeConditions: scope.conditions, userIds }) };
}

const REPORT_POPULATE = [
  {
    path: 'submittedBy',
    select: 'name employeeIdCode department designation reportsTo workingPlace',
    populate: [{ path: 'reportsTo', select: 'name' }, { path: 'workingPlace', select: 'name' }],
  },
  { path: 'disbursedBy', select: 'name' },
  { path: 'companyId', select: 'name code' },
  { path: 'managerApproval.approver', select: 'name employeeIdCode department designation role roleCode' },
  { path: 'fullPayment.decidedBy', select: 'name employeeIdCode department designation' },
];

const SORT_FIELDS = {
  claimNumber: 'claimNumber',
  employeeName: 'submittedByName',
  submittedAt: 'submittedAt',
  expenseDate: 'claimDate',
  claimedAmount: 'grandRequested',
  paidAmount: 'paidAmount',
  paymentDate: 'disbursedAt',
  status: 'status',
  expenseType: 'claimType',
};

const STATUS_LABEL = { DRAFT: 'Draft', PENDING: 'Pending', PAID: 'Paid', REJECTED: 'Rejected' };

/**
 * Computes 5-category breakdown (lodging, food, travel, local, other) for a claim.
 * Unmentioned categories are set to 0.
 */
function computeCategoryBreakdown(claim) {
  const breakdown = {
    lodging: 0,
    food: 0,
    travel: 0,
    local: 0,
    other: 0,
  };

  if (!claim) return breakdown;

  let hasItems = false;
  // 1. Iterate employeeClaims[].items
  if (Array.isArray(claim.employeeClaims) && claim.employeeClaims.length > 0) {
    for (const ec of claim.employeeClaims) {
      if (Array.isArray(ec.items) && ec.items.length > 0) {
        for (const it of ec.items) {
          hasItems = true;
          const t = String(it.expenseType || '').toUpperCase().trim();
          const amt = Number(it.requestedAmount || it.amount || 0) || 0;
          if (t === 'LODGING') breakdown.lodging += amt;
          else if (t === 'FOOD') breakdown.food += amt;
          else if (t === 'TRAVEL') breakdown.travel += amt;
          else if (['CONVEYANCE', 'LOCAL', 'LOCAL_CONVEYANCE', 'LOCAL CONVEYANCE'].includes(t)) breakdown.local += amt;
          else breakdown.other += amt;
        }
      }
    }
  }

  // 2. If no items in employeeClaims, check claim.entries
  if (!hasItems && Array.isArray(claim.entries) && claim.entries.length > 0) {
    for (const en of claim.entries) {
      hasItems = true;
      const t = String(en.expenseType || '').toUpperCase().trim();
      const amt = Number(en.requestedAmount || en.amount || 0) || 0;
      if (t === 'LODGING') breakdown.lodging += amt;
      else if (t === 'FOOD') breakdown.food += amt;
      else if (t === 'TRAVEL') breakdown.travel += amt;
      else if (['CONVEYANCE', 'LOCAL', 'LOCAL_CONVEYANCE', 'LOCAL CONVEYANCE'].includes(t)) breakdown.local += amt;
      else breakdown.other += amt;
    }
  }

  // 3. Fallback: attribute to claimType
  if (!hasItems) {
    const t = String(claim.claimType || '').toUpperCase().trim();
    const total = Number(claim.grandRequested || claim.claimedAmount || 0) || 0;
    if (t === 'LODGING') breakdown.lodging = total;
    else if (t === 'FOOD') breakdown.food = total;
    else if (t === 'TRAVEL') breakdown.travel = total;
    else if (['CONVEYANCE', 'LOCAL', 'LOCAL_CONVEYANCE', 'LOCAL CONVEYANCE'].includes(t)) breakdown.local = total;
    else if (t === 'OTHER') breakdown.other = total;
    else breakdown.other = total;
  }

  return breakdown;
}

/** Flat report row (only Pending / Paid / Rejected labels). */
function normalizeClaimForReport(c) {
  const bs = access.businessStatus(c);
  const submitter = c.submittedBy && typeof c.submittedBy === 'object' ? c.submittedBy : {};
  const firstEmp = c.employeeClaims?.[0]?.employee || {};
  const claimed = c.grandRequested || 0;
  const allowed = c.grandAllowed !== undefined && c.grandAllowed !== null ? c.grandAllowed : 0;
  const excess = c.grandExcess !== undefined && c.grandExcess !== null ? c.grandExcess : Math.max(0, claimed - allowed);
  const payable = c.payableAmount || computePayable(c) || allowed;
  const breakdown = computeCategoryBreakdown(c);
  const lastRejection = [...(c.approvalHistory || [])].reverse().find((h) => h.action === 'rejected');
  return {
    _id: c._id,
    claimNumber: c.claimNumber,
    status: bs,
    statusLabel: STATUS_LABEL[bs],
    employeeId: submitter._id || c.submittedBy,
    employeeName: submitter.name || c.submittedByName || firstEmp.name || 'Employee',
    employeeCode: submitter.employeeIdCode || firstEmp.employeeIdCode || '',
    managerName: submitter.reportsTo?.name || '',
    department: submitter.department || firstEmp.department || '',
    city: c.trip?.destination || '',
    workLocation: submitter.workingPlace?.name || '',
    customerName: c.trip?.customerName || '',
    purpose: c.trip?.purpose || '',
    expenseType: c.claimType || '',
    claimMode: c.claimMode,
    expenseDate: c.claimDate || c.fromDate || null,
    fromDate: c.fromDate || null,
    toDate: c.toDate || null,
    submittedAt: c.submittedAt || c.createdAt,
    claimedAmount: claimed,
    allowedAmount: allowed,
    excessAmount: excess,
    payableAmount: payable,
    paidAmount: bs === 'PAID' ? (c.paidAmount || c.disbursement?.amount || 0) : 0,
    paymentDate: bs === 'PAID' ? (c.disbursedAt || c.disbursement?.paymentDate || null) : null,
    paymentMethod: bs === 'PAID' ? (c.disbursement?.paymentMethod || c.paymentMethod || '') : '',
    paymentReference: bs === 'PAID' ? (c.disbursement?.paymentReference || c.utr || '') : '',
    paidByName: bs === 'PAID' ? (c.disbursement?.recordedByName || c.disbursedBy?.name || '') : '',
    rejectionReason: bs === 'REJECTED' ? (c.rejection?.reason || lastRejection?.remarks || c.accountsRemarks || c.hrRemarks || '') : '',
    rejectedAt: bs === 'REJECTED' ? (c.rejection?.rejectedAt || lastRejection?.timestamp || null) : null,
    rejectedByName: bs === 'REJECTED' ? (c.rejection?.rejectedByName || '') : '',
    isFullPayment: !!c.fullPayment?.requested,
    employeeCount: c.employeeCount || c.employeeClaims?.length || 1,
    companyName: c.companyId?.name || '',
    legacyStatus: c.legacyStatus || '',
    lodging: breakdown.lodging,
    food: breakdown.food,
    travel: breakdown.travel,
    local: breakdown.local,
    other: breakdown.other,
    breakdown,
  };
}

/**
 * GET /api/expense/reports — paginated, filtered, sorted claims within the caller's scope.
 */
exports.getExpenseReports = async (req, res) => {
  try {
    const { blocked, filter } = await resolveReportFilter(req);
    if (blocked) return fail(res, 403, 'Access denied: expense reports are not available for your role.');
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const field = SORT_FIELDS[req.query.sortField] || 'submittedAt';
    const dir = req.query.sortDirection === 'asc' ? 1 : -1;

    const [claims, total] = await Promise.all([
      ExpenseClaim.find(filter)
        .populate(REPORT_POPULATE)
        .sort({ [field]: dir, _id: dir })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      ExpenseClaim.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: claims.map((c) => ({ ...normalizeClaimForReport(c), permissions: access.claimPermissions(req, c) })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/** Summary of the filtered claims. Paid amount = actual paidAmount of PAID claims only. */
async function summarize(filter) {
  const inList = (list) => ({ $in: ['$status', list] });
  const PENDING_ALL = access.PENDING_STATUSES;
  const [s = {}] = await ExpenseClaim.aggregate([
    { $match: filter },
    {
      $group: {
        _id: null,
        totalClaims: { $sum: 1 },
        totalClaimedAmount: { $sum: { $ifNull: ['$grandRequested', 0] } },
        pendingClaims: { $sum: { $cond: [inList(PENDING_ALL), 1, 0] } },
        paidClaims: { $sum: { $cond: [inList(access.PAID_STATUSES), 1, 0] } },
        rejectedClaims: { $sum: { $cond: [inList(access.REJECTED_STATUSES), 1, 0] } },
        totalPaidAmount: {
          $sum: { $cond: [inList(access.PAID_STATUSES), { $ifNull: ['$paidAmount', { $ifNull: ['$disbursement.amount', 0] }] }, 0] },
        },
        totalPaidClaimedAmount: { $sum: { $cond: [inList(access.PAID_STATUSES), { $ifNull: ['$grandRequested', 0] }, 0] } },
        totalRejectedAmount: { $sum: { $cond: [inList(access.REJECTED_STATUSES), { $ifNull: ['$grandRequested', 0] }, 0] } },
        totalPendingAmount: { $sum: { $cond: [inList(PENDING_ALL), { $ifNull: ['$grandRequested', 0] }, 0] } },
      },
    },
  ]);
  return {
    totalClaims: s.totalClaims || 0,
    totalClaimedAmount: round2(s.totalClaimedAmount || 0),
    pendingClaims: s.pendingClaims || 0,
    totalPendingAmount: round2(s.totalPendingAmount || 0),
    paidClaims: s.paidClaims || 0,
    totalPaidAmount: round2(s.totalPaidAmount || 0),
    totalPaidClaimedAmount: round2(s.totalPaidClaimedAmount || 0),
    rejectedClaims: s.rejectedClaims || 0,
    totalRejectedAmount: round2(s.totalRejectedAmount || 0),
  };
}

/** GET /api/expense/reports/summary — summary cards for the active filters. */
exports.getExpenseReportsSummary = async (req, res) => {
  try {
    const { blocked, filter } = await resolveReportFilter(req);
    if (blocked) return fail(res, 403, 'Access denied: expense reports are not available for your role.');
    res.json({ success: true, data: await summarize(filter) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const EXCLUDED_ADMIN_ROLES = new Set([
  'superadmin', 'super_admin',
  'admin', 'company_admin', 'companyadmin',
  'hr', 'hr_admin',
  'store', 'store_admin', 'storeadmin', 'store_manager', 'tcstr1',
  'accounts', 'account_admin', 'accounts_admin', 'finance', 'tcacc1', 'tcacc2',
  'department_admin', 'management',
]);

const EXCLUDED_ADMIN_ROLE_CODES = new Set([
  'SUPER_ADMIN', 'SUPERADMIN', 'TCSA1',
  'ADMIN', 'COMPANY_ADMIN', 'COMPANYADMIN', 'TCCA1',
  'HR_ADMIN', 'TCSF2A', 'TCSFA',
  'STORE_ADMIN', 'STORE', 'TCSTR1', 'TCST8A', 'TCST5A', 'TCST1', 'TCST7A',
  'ACCOUNTS_ADMIN', 'ACCOUNT_ADMIN', 'TCACC1', 'TCACC2', 'FINANCE',
  'MANAGEMENT', 'TCDR1A', 'TCDR2A',
]);

const EXCLUDED_DEPT_ADMIN_TYPES = new Set([
  'store', 'accounts', 'account', 'finance', 'hr', 'management', 'admin',
]);

const EXCLUDED_DESIGNATIONS = new Set([
  'super administrator', 'super admin',
  'company admin', 'company administrator',
  'hr admin', 'hr administrator',
  'account admin', 'accounts admin', 'finance admin',
  'store admin', 'store manager',
  'management',
]);

const EXCLUDED_USER_STATUSES = new Set([
  'INACTIVE', 'SUSPENDED', 'LOCKED', 'DISABLED', 'TERMINATED',
]);

function isExcludedAdminUser(user) {
  if (!user) return true;
  if (user.scope === 'GLOBAL') return true;

  const status = String(user.status || '').trim().toUpperCase();
  if (EXCLUDED_USER_STATUSES.has(status)) return true;

  const role = String(user.role || '').trim().toLowerCase();
  if (EXCLUDED_ADMIN_ROLES.has(role)) return true;

  const roleCode = String(user.roleCode || '').trim().toUpperCase();
  if (EXCLUDED_ADMIN_ROLE_CODES.has(roleCode)) return true;

  const deptAdminType = String(user.departmentAdminType || user.adminType || '').trim().toLowerCase();
  if (EXCLUDED_DEPT_ADMIN_TYPES.has(deptAdminType)) return true;

  const designation = String(user.designation || '').trim().toLowerCase();
  if (EXCLUDED_DESIGNATIONS.has(designation)) return true;

  if (role === 'admin') return true;

  return false;
}

/** GET /api/expense/reports/filter-options — dropdown values within the caller's scope. */
exports.getReportFilterOptions = async (req, res) => {
  try {
    const scope = access.reportScope(req);
    if (scope.blocked) return fail(res, 403, 'Access denied: expense reports are not available for your role.');
    const match = { $and: [...scope.conditions, { status: { $nin: [...access.DRAFT_STATUSES, ...access.APPROVAL_PENDING_STATUSES] } }] };

    const companyId = access.resolveCompanyId(req, { allowAll: true });

    // Ensure default expense masters (including city classifications) exist for this company
    if (companyId && companyId !== 'ALL') {
      try {
        await ensureExpenseMasters(companyId);
      } catch (_) {}
    }

    // 1. Fetch cities: all active cities from Expense Management (CityClassification) + any claim destinations
    const cityFilter = { status: { $ne: 'inactive' } };
    if (companyId && companyId !== 'ALL') {
      const cOid = mongoose.Types.ObjectId.isValid(companyId) ? new mongoose.Types.ObjectId(companyId) : null;
      const ids = [companyId];
      if (cOid) ids.push(cOid);
      cityFilter.$or = [
        { companyId: { $in: ids } },
        { company: { $in: ids } },
        { companyId: null },
        { companyId: { $exists: false } },
      ];
    }

    const [dbCities, claimCities, types] = await Promise.all([
      CityClassification.find(cityFilter).select('city').lean(),
      ExpenseClaim.distinct('trip.destination', match),
      ExpenseClaim.distinct('claimType', match),
    ]);

    const citySet = new Set();
    (dbCities || []).forEach((c) => {
      const name = String(c.city || '').trim();
      if (name) citySet.add(name);
    });
    (claimCities || []).forEach((c) => {
      const name = String(c || '').trim();
      if (name) citySet.add(name);
    });
    const sortedCities = Array.from(citySet).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

    // 2. Fetch employees: all active employees in the company scope, excluding admin roles:
    // (company admin, super admin, hr admin, store admin, account admin)
    const userFilter = {};
    if (companyId && companyId !== 'ALL') {
      const cOid = mongoose.Types.ObjectId.isValid(companyId) ? new mongoose.Types.ObjectId(companyId) : null;
      const ids = [companyId];
      if (cOid) ids.push(cOid);
      userFilter.$or = [
        { companyId: { $in: ids } },
        { company: { $in: ids } },
      ];
    }

    if (!access.isStaff(req.user)) {
      userFilter._id = req.user?._id || req.user?.id;
    } else {
      userFilter.scope = { $ne: 'GLOBAL' };
      userFilter.status = { $nin: ['INACTIVE', 'inactive', 'DISABLED', 'disabled', 'TERMINATED', 'terminated', 'SUSPENDED', 'suspended', 'LOCKED', 'locked'] };
    }

    const users = await User.find(userFilter)
      .select('name employeeIdCode department designation reportsTo workingPlace role roleCode departmentAdminType adminType status scope')
      .populate('reportsTo', 'name')
      .populate('workingPlace', 'name')
      .lean();

    const eligibleEmployees = users.filter((u) => !isExcludedAdminUser(u));

    const uniqBy = (arr, key) => [...new Map(arr.filter(Boolean).map((x) => [String(x[key]), x])).values()];
    const byName = (a, b) => String(a.name || '').localeCompare(String(b.name || ''));

    res.json({
      success: true,
      data: {
        employees: eligibleEmployees.map((u) => ({ _id: u._id, name: u.name, employeeIdCode: u.employeeIdCode || '' })).sort(byName),
        managers: uniqBy(eligibleEmployees.map((u) => (u.reportsTo?._id ? { _id: u.reportsTo._id, name: u.reportsTo.name } : null)), '_id').sort(byName),
        workLocations: uniqBy(eligibleEmployees.map((u) => (u.workingPlace?._id ? { _id: u.workingPlace._id, name: u.workingPlace.name } : null)), '_id').sort(byName),
        departments: [...new Set(eligibleEmployees.map((u) => u.department).filter(Boolean))].sort(),
        cities: sortedCities,
        expenseTypes: types.filter(Boolean).sort(),
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const CSV_COLUMNS = [
  ['Claim ID', (c) => c.claimNumber || ''],
  ['Employee', (c) => (c.employeeName ? `${c.employeeName}${c.employeeCode ? ` (${c.employeeCode})` : ''}` : '')],
  ['Customer', (c) => c.customerName || '-'],
  ['City', (c) => c.city || '-'],
  ['Expense Type', (c) => c.expenseType || '-'],
  ['Expense Date', (c) => (c.expenseDate ? (c.expenseDate instanceof Date ? c.expenseDate.toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata' }) : String(c.expenseDate).split('T')[0]) : '-')],
  ['Submitted', (c) => (c.submittedAt ? (c.submittedAt instanceof Date ? c.submittedAt.toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata' }) : String(c.submittedAt).split('T')[0]) : '-')],
  ['Claimed', (c) => c.claimedAmount ?? 0],
  ['Allowed', (c) => c.allowedAmount ?? 0],
  ['Excess', (c) => c.excessAmount ?? 0],
  ['Paid Amount', (c) => (c.status === 'PAID' ? (c.paidAmount ?? 0) : 0)],
  ['Status', (c) => c.statusLabel || c.status || ''],
  ['Lodging', (c) => c.lodging ?? 0],
  ['Food', (c) => c.food ?? 0],
  ['Travel', (c) => c.travel ?? 0],
  ['Local', (c) => c.local ?? 0],
  ['Other', (c) => c.other ?? 0],
];

const csvCell = (v) => {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata' });
  if (typeof v === 'number') return String(v);
  return `"${String(v).replace(/"/g, '""')}"`;
};

/** GET /api/expense/reports/export — CSV of every claim matching the active filters + scope. */
exports.exportExpenseReportsCSV = async (req, res) => {
  try {
    const { blocked, filter } = await resolveReportFilter(req);
    if (blocked) return fail(res, 403, 'Access denied: expense reports are not available for your role.');
    const field = SORT_FIELDS[req.query.sortField] || 'submittedAt';
    const dir = req.query.sortDirection === 'asc' ? 1 : -1;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=Expense_Claims_Report_${new Date().toISOString().slice(0, 10)}.csv`);
    res.write(`\uFEFF${CSV_COLUMNS.map(([h]) => h).join(',')}\r\n`);
    const cursor = ExpenseClaim.find(filter).populate(REPORT_POPULATE).sort({ [field]: dir, _id: dir }).lean().cursor();
    for await (const claim of cursor) {
      const row = normalizeClaimForReport(claim);
      res.write(`${CSV_COLUMNS.map(([, get]) => csvCell(get(row))).join(',')}\r\n`);
    }
    res.end();
  } catch (err) {
    if (res.headersSent) return res.end();
    res.status(500).json({ success: false, message: err.message });
  }
};

exports._internal = { buildReportFilter, normalizeClaimForReport, computeCategoryBreakdown, parsePaymentDate, denyReason, CSV_COLUMNS };

