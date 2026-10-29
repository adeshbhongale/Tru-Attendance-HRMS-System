const mongoose = require('mongoose');
const User = require('../../../../models/User');
const Attendance = require('../../../../models/Attendance');
const ExpenseClaim = require('../models/ExpenseClaim');
const ExpensePolicy = require('../models/ExpensePolicy');
const ExpenseEntitlement = require('../models/ExpenseEntitlement');
const { getActivePolicy, findEntitlement, getEmployeeLevelNumber, getEmployeeGradeCode } = require('./policyEngine');
const { calculateItem, round2 } = require('./calculationEngine');
const { getISTDateComponents, createDateFromIST } = require('../../../../utils/timezone');

/**
 * Expense claim rule engine.
 *
 * NORMAL claims  (Food / Travel / Local Conveyance / Other) -> every rule uses `claimDate`.
 * LODGING claims (Lodging)                                 -> every rule uses `fromDate` -> `toDate`.
 * The two flows never share date logic: normalizeInput() drops the dates that do not
 * belong to the selected mode, so a Lodging claim can never be evaluated on claimDate.
 *
 * Pure helpers (normalizeInput, validateClaimInput, splitAmount, computePayable,
 * routeSubmission, deadline maths) are unit-tested in ../tests/claimRules.test.js.
 */

const DAY_MS = 86400000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Claims in these statuses never block a new claim (duplicate / overlap checks)
const NON_BLOCKING_STATUSES = ['DRAFT', 'RETURNED', 'HR_REJECTED', 'ACCOUNTS_REJECTED', 'REJECTED', 'CANCELLED'];

const DEFAULT_CLAIM_RULES = {
  remarkMinLength: 5,
  remarkMaxLength: 500,
  maxEmployeesPerClaim: 20,
  allowFutureDates: false,
  maxLodgingNights: 30,
  deadlineOverrideAllowed: true,
};
const DEFAULT_RECEIPT_RULES = {
  required: true,
  maxFiles: 10,
  maxFileSizeMb: 10,
  allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'],
};
// Full payment is approved in-app by a selected Management user (no proof upload).
const DEFAULT_FULL_PAYMENT_RULES = { enabled: true, approvalRequired: true, proofRequired: false };

const MAX_AMOUNT = 10000000; // sanity ceiling (₹1 crore) for a single claim
const MAX_TEXT = { customerName: 150, destinationCity: 100, fullPaymentReason: 500 };

// Lodging Stay Type (employee-selected on every new lodging claim)
const STAY_TYPES = ['IN_HOTEL', 'WITH_RELATIVE'];

/**
 * Strictly parse a relative-stay percentage (0-100 inclusive, max 2 decimals).
 * Accepts a finite number or a plain numeric string; anything else returns null.
 */
function parseRelativeStayPercent(value) {
  let n;
  if (typeof value === 'number') n = value;
  else if (typeof value === 'string' && /^\s*\d+(\.\d{1,2})?\s*$/.test(value)) n = Number(value);
  else return null;
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
  return round2(n);
}

/** Configured relative-stay percentage of the policy, or null when missing / invalid. */
function resolveRelativeStayPercent(policy) {
  return parseRelativeStayPercent(policy?.relativeStayPercent);
}

/**
 * Apply the relative-stay percentage ONCE to an already-computed lodging stay budget
 * (output of computeLodgingPolicyLimit). Per-employee limits are scaled and the last one
 * absorbs paise rounding so they still add up to the new total.
 */
function applyRelativeStayPercent(result, percent) {
  const base = result.totalPolicyLimit;
  const totalPolicyLimit = round2(base * (percent / 100));
  const n = result.effectiveLimits.length;
  let acc = 0;
  const effectiveLimits = result.effectiveLimits.map((lim, i) => {
    if (i === n - 1) return Math.max(0, round2(totalPolicyLimit - acc));
    const v = round2(lim * (percent / 100));
    acc = round2(acc + v);
    return v;
  });
  return {
    ...result,
    totalPolicyLimit,
    effectiveLimits,
    baseTotalPolicyLimit: base,
    baseEffectiveLimits: result.effectiveLimits,
    relativeStayPercent: percent,
    ruleCode: `${result.ruleCode}_RELATIVE_${percent}_PCT`,
    ruleDescription: `${result.ruleDescription} -> Stay with relative: ${percent}% of entitlement`,
    formula: `${result.formula}. Stay with relative: ${percent}% × ${formatINR(base)} = ${formatINR(totalPolicyLimit)}`,
  };
}

/**
 * Compute lodging stay budget when Stay Type = WITH_RELATIVE:
 * - Does NOT apply hotel multi-employee room-sharing rules (75% combined, Higher Only,
 *   Highest + Lowest, or Split in pairs 75%).
 * - For 1 or multiple employees:
 *   totalPolicyLimit = days * (emp1_oneDayAllowed * percent/100 + emp2_oneDayAllowed * percent/100 + ...)
 */
function computeRelativeStayPolicyLimit({ empLimits, ordered, days, percent }) {
  const n = Math.max(1, ordered ? ordered.length : empLimits.length);
  const effectiveDays = days > 0 ? days : 1;
  const perDays = Array.from({ length: n }, (_, i) => {
    const lim = Number(empLimits[i] || 0);
    return effectiveDays > 0 ? round2(lim / effectiveDays) : lim;
  });
  const oneDayRelativeLimits = perDays.map((perDay) => round2(perDay * (percent / 100)));
  const combinedOneDayRelative = round2(oneDayRelativeLimits.reduce((s, v) => s + v, 0));
  const totalPolicyLimit = round2(effectiveDays * combinedOneDayRelative);
  const baseEffectiveLimits = Array.from({ length: n }, (_, i) => round2(Number(empLimits[i] || 0)));
  const baseTotalPolicyLimit = round2(baseEffectiveLimits.reduce((s, v) => s + v, 0));

  let acc = 0;
  const effectiveLimits = oneDayRelativeLimits.map((oneDayRel, i) => {
    if (i === n - 1) return Math.max(0, round2(totalPolicyLimit - acc));
    const v = round2(effectiveDays * oneDayRel);
    acc = round2(acc + v);
    return v;
  });

  if (n <= 1) {
    const perDay = perDays[0] || 0;
    const oneDayRel = oneDayRelativeLimits[0] || 0;
    const baseFormula = effectiveDays > 1
      ? `Stay budget: 100% of individual entitlement = ${formatINR(perDay)}/day × ${effectiveDays} days = ${formatINR(baseTotalPolicyLimit)}`
      : `Stay budget: 100% of individual entitlement = ${formatINR(perDay)}/day`;
    const relFormula = effectiveDays > 1
      ? `${effectiveDays} days × (${percent}% of ${formatINR(perDay)}/day = ${formatINR(oneDayRel)}/day) = ${formatINR(totalPolicyLimit)}`
      : `${percent}% × ${formatINR(baseTotalPolicyLimit)} = ${formatINR(totalPolicyLimit)}`;
    return {
      totalPolicyLimit,
      effectiveLimits,
      baseTotalPolicyLimit,
      baseEffectiveLimits,
      oneDayRelativeLimits,
      combinedOneDayRelative,
      relativeStayPercent: percent,
      ruleCode: `SINGLE_EMPLOYEE_RELATIVE_${percent}_PCT`,
      ruleDescription: `Single employee stay budget (100% individual category entitlement) -> Stay with relative: ${percent}% of entitlement`,
      formula: `${baseFormula}. Stay with relative: ${relFormula}`,
    };
  }

  const oneDayParts = oneDayRelativeLimits.map((v, i) => `${percent}% of ${formatINR(perDays[i])} (${formatINR(v)})`);
  return {
    totalPolicyLimit,
    effectiveLimits,
    baseTotalPolicyLimit,
    baseEffectiveLimits,
    oneDayRelativeLimits,
    combinedOneDayRelative,
    relativeStayPercent: percent,
    ruleCode: `MULTI_EMPLOYEE_RELATIVE_${percent}_PCT`,
    ruleDescription: `Stay with relative (${n} employees): ${effectiveDays} day${effectiveDays > 1 ? 's' : ''} × (${oneDayParts.join(' + ')})`,
    formula: `Stay with relative: ${effectiveDays} day${effectiveDays > 1 ? 's' : ''} × (${oneDayParts.join(' + ')}) = ${formatINR(totalPolicyLimit)}`,
  };
}

// ─── Dates ──────────────────────────────────────────────────────────────────

/** Calendar date stored as UTC midnight (same convention as Attendance.date). */
function parseDateOnly(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'string') {
    const m = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m && value.length <= 10) {
      const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
      return d.getUTCMonth() === +m[2] - 1 ? d : null; // rejects 2026-02-31
    }
  }
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return null;
  if (d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0) return d;
  const ist = getISTDateComponents(d);
  return new Date(Date.UTC(ist.year, ist.month, ist.date));
}

function todayDateOnly(now = new Date()) {
  const ist = getISTDateComponents(now);
  return new Date(Date.UTC(ist.year, ist.month, ist.date));
}

const addDays = (d, n) => new Date(d.getTime() + n * DAY_MS);

function formatDate(d) {
  if (!d) return '';
  const date = d instanceof Date ? d : new Date(d);
  if (isNaN(date.getTime())) return '';
  return `${String(date.getUTCDate()).padStart(2, '0')} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

/** Lodging nights (checkout - checkin): 29 Sep -> 02 Oct = 3 nights. */
function nightsBetween(from, to) {
  if (!from || !to) return 0;
  const fTime = from instanceof Date ? from.getTime() : new Date(from).getTime();
  const tTime = to instanceof Date ? to.getTime() : new Date(to).getTime();
  if (isNaN(fTime) || isNaN(tTime)) return 0;
  return Math.max(0, Math.round((tTime - fTime) / DAY_MS));
}

/** Lodging days (inclusive calendar span): e.g. 1st to 3rd = 3 days, 1st to 1st = 1 day. */
function daysBetween(from, to) {
  if (!from || !to) return 0;
  const fTime = from instanceof Date ? from.getTime() : new Date(from).getTime();
  const tTime = to instanceof Date ? to.getTime() : new Date(to).getTime();
  if (isNaN(fTime) || isNaN(tTime)) return 0;
  const diff = Math.round((tTime - fTime) / DAY_MS);
  if (diff < 0) return 0;
  return diff + 1;
}

/** End of the IST calendar day that is `days` after `anchor`. */
function deadlineFrom(anchor, days) {
  return createDateFromIST(anchor.getUTCFullYear(), anchor.getUTCMonth(), anchor.getUTCDate() + Number(days || 0), 23, 59, 59, 999);
}

const formatINR = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

// ─── Config resolution ──────────────────────────────────────────────────────

const clean = (obj) => {
  const out = {};
  Object.entries(obj || {}).forEach(([k, v]) => { if (v !== undefined && v !== null) out[k] = v; });
  return out;
};

function resolvePolicyConfig(policy) {
  const p = policy || {};
  const receiptRules = { ...DEFAULT_RECEIPT_RULES, ...clean(p.receiptRules) };
  if (!Array.isArray(receiptRules.allowedMimeTypes) || receiptRules.allowedMimeTypes.length === 0) {
    receiptRules.allowedMimeTypes = DEFAULT_RECEIPT_RULES.allowedMimeTypes;
  }
  const claimRules = { ...DEFAULT_CLAIM_RULES, ...clean(p.claimRules) };
  if (!claimRules.remarkMaxLength || claimRules.remarkMaxLength < 500) {
    claimRules.remarkMaxLength = 500;
  }
  return {
    claimRules,
    receiptRules,
    fullPaymentRules: { ...DEFAULT_FULL_PAYMENT_RULES, ...clean(p.fullPaymentRules) },
    deadlineRules: Array.isArray(p.deadlineRules) ? p.deadlineRules : [],
    approvalRequired: !!p.approvalRequired,
  };
}

/** Per-type claim behaviour with code-level defaults for types created before these settings existed. */
function resolveTypeConfig(type, fallbackCode = '') {
  if (!type && !fallbackCode) return null;
  const rawCode = String(type?.code || fallbackCode || '').toUpperCase();
  const code = rawCode;
  const pick = (v, d) => (v === undefined || v === null ? d : v);
  return {
    code,
    name: type?.name || (code === 'FOOD' ? 'Food' : code === 'TRAVEL' ? 'Travel' : code === 'LODGING' ? 'Lodging' : code === 'CONVEYANCE' ? 'Local Conveyance' : code),
    category: type?.category || code,
    claimMode: pick(type?.claimMode, code === 'LODGING' || type?.category === 'LODGING' ? 'LODGING' : 'NORMAL'),
    sameDateLimit: Number(pick(type?.sameDateLimit, ['FOOD', 'TRAVEL'].includes(code) ? 1 : 0)),
    allowOverlap: !!pick(type?.allowOverlap, false),
    maxClaimAmount: Number(pick(type?.maxClaimAmount, 0)),
    requiresOutstation: !!pick(type?.requiresOutstation, false),
    proofRequired: type?.proofRequired !== false,
  };
}

/** Policy in force on the rule date (claimDate for NORMAL, fromDate for LODGING). */
async function getPolicyForDate(companyId, ruleDate) {
  const active = await getActivePolicy(companyId);
  if (!ruleDate || !active || !active.effectiveFrom || new Date(active.effectiveFrom) <= ruleDate) return active;
  const older = await ExpensePolicy.findOne({
    companyId,
    status: { $in: ['inactive', 'archived'] },
    publishedAt: { $ne: null },
    effectiveFrom: { $lte: ruleDate },
    $or: [{ effectiveTo: null }, { effectiveTo: { $gte: ruleDate } }],
  }).sort({ effectiveFrom: -1 }).lean();
  if (!older) return active;
  // Only use the historic policy if its entitlement matrix still exists.
  const hasRows = await ExpenseEntitlement.exists({ companyId, policyId: older._id, status: 'active' });
  return hasRows ? older : active;
}

// ─── Input normalisation + validation (pure) ────────────────────────────────

const toStr = (v, max = 1000) => String(v === undefined || v === null ? '' : v).trim().slice(0, max);

function sanitizeAttachment(a) {
  if (!a || typeof a !== 'object') return null;
  return {
    name: toStr(a.name, 200) || 'attachment',
    url: toStr(a.url, 2000),
    publicId: toStr(a.publicId, 300),
    type: toStr(a.type || a.mimeType, 100).toLowerCase(),
    size: Number(a.size) > 0 ? Number(a.size) : 0,
  };
}

/** Local Conveyance: typed distance + visit option (NO_VISIT vs VISIT) + photo proofs + optional visit service reports. */
const CONVEYANCE_PHOTO_FIELDS = ['numberPlatePhotos', 'startKmPhotos', 'endKmPhotos'];
function conveyanceKm(src = {}) {
  const files = (v) => (Array.isArray(v) ? v : []).map(sanitizeAttachment).filter(Boolean);
  const rawVt = String(src.visitType || (src.isVisit ? 'VISIT' : 'NO_VISIT') || 'NO_VISIT').toUpperCase().trim();
  const visitType = rawVt === 'VISIT' ? 'VISIT' : 'NO_VISIT';
  const isVisit = visitType === 'VISIT';
  return {
    distanceKm: Number(src.distanceKm || 0),
    visitType,
    isVisit,
    numberPlatePhotos: files(src.numberPlatePhotos),
    startKmPhotos: files(src.startKmPhotos),
    endKmPhotos: files(src.endKmPhotos),
    serviceReports: files(src.serviceReports),
  };
}

function normalizeInput(body = {}) {
  const claimMode = String(body.claimMode || '').toUpperCase();
  const fp = body.fullPayment || {};
  // Lodging Stay Type. With Relative: the amount is the server-calculated entitlement, so any
  // client amount, hotel bills and full-payment request are not applicable and are dropped.
  const lodgingStayType = claimMode === 'LODGING' ? toStr(body.stayType, 30).toUpperCase() : '';
  const isRelativeStay = lodgingStayType === 'WITH_RELATIVE';
  const rawIds = Array.isArray(body.employeeIds) ? body.employeeIds : [];
  const employeeIds = [...new Set(rawIds.map((id) => toStr(id && typeof id === 'object' ? id._id : id, 50)).filter(Boolean))];
  const rawEntries = Array.isArray(body.entries) ? body.entries : (Array.isArray(body.items) ? body.items : []);
  const rawBodyVt = String(body.visitType || (body.isVisit === true ? 'VISIT' : '')).toUpperCase().trim();
  const bodyVisitType = rawBodyVt === 'VISIT' ? 'VISIT' : (rawBodyVt === 'NO_VISIT' ? 'NO_VISIT' : '');

  const entries = rawEntries.map((e) => {
    const eSubType = toStr(e.otherSubType || e.subType || '', 20).toUpperCase();
    const isEPurchase = eSubType === 'PURCHASE';
    const rawEVt = String(e.visitType || (e.isVisit === true ? 'VISIT' : '') || bodyVisitType || 'NO_VISIT').toUpperCase().trim();
    const eVt = rawEVt === 'VISIT' ? 'VISIT' : 'NO_VISIT';
    return {
      expenseType: toStr(e.expenseType || e.claimType, 50).toUpperCase() || 'OTHER',
      otherSubType: eSubType,
      barcodeNumber: isEPurchase ? toStr(e.barcodeNumber || e.barcode || '', 100).trim() : '',
      quantity: isEPurchase ? toStr(e.quantity, 100).trim() : '',
      requestedAmount: e.requestedAmount === '' || e.requestedAmount === null || e.requestedAmount === undefined ? null : Number(e.requestedAmount),
      remark: toStr(e.remark || e.description, 1000),
      vehicle: toStr(e.vehicle, 50),
      ...conveyanceKm(e),
      visitType: eVt,
      isVisit: eVt === 'VISIT',
      receipts: (Array.isArray(e.receipts) ? e.receipts : (Array.isArray(e.attachments) ? e.attachments : [])).map(sanitizeAttachment).filter(Boolean),
    };
  }).filter((e) => e.requestedAmount !== null || e.remark || e.expenseType);

  const amount = body.requestedAmount === '' || body.requestedAmount === null || body.requestedAmount === undefined
    ? null : Number(body.requestedAmount);
  let finalAmount = amount === null ? null : round2(amount);
  let finalExpenseType = toStr(body.expenseType, 50).toUpperCase();
  let finalRemark = toStr(body.remark, 5000);

  if (entries.length > 0) {
    const totalEntriesAmt = round2(entries.reduce((s, e) => s + (Number(e.requestedAmount) || 0), 0));
    if (finalAmount === null || finalAmount === 0 || rawEntries.length > 1) {
      finalAmount = totalEntriesAmt;
    }
    if (!finalExpenseType && entries[0].expenseType) {
      finalExpenseType = entries[0].expenseType;
    }
    if (!finalRemark && entries.some(e => e.remark)) {
      finalRemark = entries.map(e => e.remark).filter(Boolean).join('; ');
    }
  } else if (finalAmount !== null || finalExpenseType) {
    const bodySubType = toStr(body.otherSubType || body.subType || '', 20).toUpperCase();
    const isBodyPurchase = bodySubType === 'PURCHASE';
    const rawBodyEntryVt = String(body.visitType || (body.isVisit ? 'VISIT' : 'NO_VISIT') || 'NO_VISIT').toUpperCase().trim();
    const bodyEntryVt = rawBodyEntryVt === 'VISIT' ? 'VISIT' : 'NO_VISIT';
    entries.push({
      expenseType: finalExpenseType || 'OTHER',
      otherSubType: bodySubType,
      barcodeNumber: isBodyPurchase ? toStr(body.barcodeNumber || body.barcode || '', 100).trim() : '',
      quantity: isBodyPurchase ? toStr(body.quantity, 100).trim() : '',
      requestedAmount: finalAmount,
      remark: finalRemark,
      vehicle: toStr(body.vehicle, 50),
      ...conveyanceKm(body),
      visitType: bodyEntryVt,
      isVisit: bodyEntryVt === 'VISIT',
      receipts: (Array.isArray(body.receipts) ? body.receipts : []).map(sanitizeAttachment).filter(Boolean),
    });
  }

  if (isRelativeStay) {
    finalAmount = null;
    entries.forEach((e) => { e.requestedAmount = null; e.receipts = []; });
  }

  const directReceipts = (Array.isArray(body.receipts) ? body.receipts : []).map(sanitizeAttachment).filter(Boolean);
  const entryReceiptsAll = entries.flatMap((e) => e.receipts || []);
  const finalReceipts = isRelativeStay ? [] : (directReceipts.length > 0 ? directReceipts : entryReceiptsAll);

  const directServiceReports = (Array.isArray(body.serviceReports) ? body.serviceReports : []).map(sanitizeAttachment).filter(Boolean);
  const entryServiceReportsAll = entries.flatMap((e) => e.serviceReports || []);
  const finalServiceReports = directServiceReports.length > 0 ? directServiceReports : entryServiceReportsAll;

  return {
    claimMode,
    // Each mode only ever sees its own date fields.
    claimDate: claimMode === 'NORMAL' ? parseDateOnly(body.claimDate) : null,
    fromDate: claimMode === 'LODGING' ? parseDateOnly(body.fromDate) : null,
    toDate: claimMode === 'LODGING' ? parseDateOnly(body.toDate) : null,
    // LODGING only. Kept as sent (upper-cased) so validation can reject unknown values.
    stayType: lodgingStayType,
    rawDates: { claimDate: body.claimDate, fromDate: body.fromDate, toDate: body.toDate },
    numberOfEmployees: body.numberOfEmployees === undefined ? employeeIds.length : Number(body.numberOfEmployees),
    employeeIds,
    customerName: toStr(body.customerName, 500),
    customerId: mongoose.Types.ObjectId.isValid(body.customerId) ? String(body.customerId) : null,
    destinationCity: toStr(body.destinationCity, 500),
    visitType: bodyVisitType || (entries.some((e) => e.visitType === 'VISIT' || e.isVisit) ? 'VISIT' : 'NO_VISIT'),
    isVisit: bodyVisitType === 'VISIT' || body.isVisit === true || entries.some((e) => e.visitType === 'VISIT' || e.isVisit),
    expenseType: finalExpenseType,
    requestedAmount: finalAmount,
    remark: finalRemark,
    entries,
    receipts: finalReceipts,
    serviceReports: finalServiceReports,
    fullPayment: {
      requested: !isRelativeStay && (fp.requested === true || fp.requested === 'true'),
      reason: toStr(fp.reason, 5000),
      proofs: [],
    },
    // Employee-selected approver (Management for full payment, Reporting Manager for OTHER expense)
    approverId: toStr(body.approverId && typeof body.approverId === 'object' ? body.approverId._id : body.approverId, 50),
    clientRequestId: /^[A-Za-z0-9_-]{8,64}$/.test(String(body.clientRequestId || '')) ? String(body.clientRequestId) : null,
  };
}

/**
 * Which in-app approval a claim needs before it reaches Accounts (pure).
 * Works on normalized input and on stored claims.
 * FULL_PAYMENT wins when both apply (single Management approval covers everything).
 */
function approvalKindFor(src = {}) {
  if (src.fullPayment?.requested) return 'FULL_PAYMENT';
  const isOther = (t) => String(t || '').toUpperCase() === 'OTHER';
  if (String(src.claimMode || '').toUpperCase() === 'LODGING') return 'NONE';
  if (isOther(src.expenseType) || isOther(src.claimType)) return 'OTHER_EXPENSE';
  if ((Array.isArray(src.entries) ? src.entries : []).some((e) => isOther(e?.expenseType))) return 'OTHER_EXPENSE';
  const items = (src.employeeClaims || []).flatMap((ec) => ec?.items || []);
  if (items.some((it) => isOther(it?.expenseType))) return 'OTHER_EXPENSE';
  return 'NONE';
}

const isValidFileUrl = (url) => /^https?:\/\/\S+$/i.test(url) || /^\/uploads\/\S+$/i.test(url);

/**
 * Field-level validation. Returns [{ field, code, message, required? }].
 * `required` errors are skipped for drafts so a half-filled form can be saved.
 */
function validateClaimInput(input, { policyConfig, typeConfig, today = todayDateOnly(), isDraft = false, user = null, isManagement = false }) {
  const errors = [];
  const add = (field, code, message, required = false) => errors.push({ field, code, message, required });
  const { claimRules, receiptRules, fullPaymentRules } = policyConfig;

  if (!['NORMAL', 'LODGING'].includes(input.claimMode)) {
    add('claimMode', 'INVALID_MODE', 'Invalid claim mode. Please choose Expense Claim or Lodging Expense Claim.');
  }

  // Dates
  if (input.claimMode === 'NORMAL') {
    if (!input.claimDate) {
      if (input.rawDates?.claimDate) add('claimDate', 'INVALID_DATE', 'Please select a valid claim date.');
      else add('claimDate', 'CLAIM_DATE_REQUIRED', 'Please select the claim date.', true);
    } else if (!claimRules.allowFutureDates && input.claimDate > today) {
      add('claimDate', 'FUTURE_DATE', 'Claim date cannot be in the future.');
    }
  }
  if (input.claimMode === 'LODGING') {
    if (!input.fromDate) {
      if (input.rawDates?.fromDate) add('fromDate', 'INVALID_DATE', 'Please select a valid From Date.');
      else add('fromDate', 'FROM_DATE_REQUIRED', 'Please select the From Date.', true);
    }
    if (!input.toDate) {
      if (input.rawDates?.toDate) add('toDate', 'INVALID_DATE', 'Please select a valid To Date.');
      else add('toDate', 'TO_DATE_REQUIRED', 'Please select the To Date.', true);
    }
    if (input.fromDate && input.toDate) {
      if (input.toDate <= input.fromDate) {
        add('toDate', 'INVALID_DATE_RANGE', 'To Date must be after From Date.');
      } else {
        const days = daysBetween(input.fromDate, input.toDate);
        if (claimRules.maxLodgingNights > 0 && days > claimRules.maxLodgingNights) {
          add('toDate', 'INVALID_DATE_RANGE', `A single lodging claim can cover at most ${claimRules.maxLodgingNights} days.`);
        }
      }
      if (!claimRules.allowFutureDates && (input.fromDate > today || input.toDate > today)) {
        if (input.fromDate > today) add('fromDate', 'FUTURE_DATE', 'From Date cannot be in the future.');
        if (input.toDate > today) add('toDate', 'FUTURE_DATE', 'To Date cannot be in the future.');
      }
    }
  }

  // Stay Type (LODGING only): must be explicitly chosen by the employee (no default)
  if (input.claimMode === 'LODGING') {
    if (!input.stayType) {
      add('stayType', 'STAY_TYPE_REQUIRED', 'Please select the Stay Type (In Hotel or With Relative).', true);
    } else if (!STAY_TYPES.includes(input.stayType)) {
      add('stayType', 'STAY_TYPE_INVALID', 'Stay Type must be either In Hotel or With Relative.');
    }
  }

  // Employees
  const maxEmp = Number(claimRules.maxEmployeesPerClaim) || 20;
  const n = input.numberOfEmployees;
  if (!Number.isInteger(n) || n < 1) {
    add('numberOfEmployees', 'EMPLOYEE_COUNT_INVALID', 'Number of employees must be at least 1.', n === 0);
  } else if (n > maxEmp) {
    add('numberOfEmployees', 'EMPLOYEE_COUNT_INVALID', `A claim can include at most ${maxEmp} employees.`);
  } else if (input.employeeIds.length > n) {
    add('employeeIds', 'EMPLOYEE_COUNT_MISMATCH', `You selected ${input.employeeIds.length} employees but No. of Employees is ${n}.`);
  } else if (input.employeeIds.length === 0) {
    add('employeeIds', 'EMPLOYEE_REQUIRED', 'Please select at least one employee.', true);
  } else if (input.employeeIds.length < n) {
    add('employeeIds', 'EMPLOYEE_COUNT_MISMATCH', 'Please select all required employees.', true);
  }
  if (input.employeeIds.some((id) => !mongoose.Types.ObjectId.isValid(id))) {
    add('employeeIds', 'EMPLOYEE_NOT_FOUND', 'One or more selected employees are invalid.');
  }

  // Customer / destination
  if (!input.customerName) add('customerName', 'CUSTOMER_REQUIRED', 'Please enter the customer name.', true);
  else if (input.customerName.length > MAX_TEXT.customerName) add('customerName', 'TOO_LONG', `Customer name can be at most ${MAX_TEXT.customerName} characters.`);
  if (!input.destinationCity) add('destinationCity', 'DESTINATION_REQUIRED', 'Please enter the destination city.', true);
  else if (input.destinationCity.length > MAX_TEXT.destinationCity) add('destinationCity', 'TOO_LONG', `Destination city can be at most ${MAX_TEXT.destinationCity} characters.`);

  // Expense type (must belong to this mode)
  if (!input.expenseType) {
    add('expenseType', 'EXPENSE_TYPE_REQUIRED', 'Please select the expense type.', true);
  } else if (!typeConfig) {
    add('expenseType', 'EXPENSE_TYPE_INVALID', 'The selected expense type is not available.');
  } else if (['NORMAL', 'LODGING'].includes(input.claimMode) && typeConfig.claimMode !== input.claimMode) {
    add('expenseType', 'EXPENSE_TYPE_MODE', typeConfig.claimMode === 'LODGING'
      ? `${typeConfig.name} must be claimed through Lodging Expense Claim.`
      : `${typeConfig.name} cannot be claimed in Lodging Expense Claim. Use Expense Claim instead.`);
  }

  // Amount
  const isRelativeStay = input.claimMode === 'LODGING' && input.stayType === 'WITH_RELATIVE';
  if (isRelativeStay) {
    // Amount is the server-calculated relative-stay entitlement; nothing is typed by the employee
  } else if (input.requestedAmount === null) {
    add('requestedAmount', 'AMOUNT_REQUIRED', 'Please enter the amount.', true);
  } else if (!Number.isFinite(input.requestedAmount)) {
    add('requestedAmount', 'AMOUNT_INVALID', 'Please enter a valid amount.');
  } else if (input.requestedAmount < 0) {
    add('requestedAmount', 'AMOUNT_NEGATIVE', 'Amount cannot be negative.');
  } else if (input.requestedAmount === 0) {
    add('requestedAmount', 'AMOUNT_ZERO', 'Amount must be greater than zero.', true);
  } else if (input.requestedAmount > MAX_AMOUNT) {
    add('requestedAmount', 'AMOUNT_TOO_HIGH', `Amount cannot exceed ${formatINR(MAX_AMOUNT)}.`);
  } else if (typeConfig && typeConfig.maxClaimAmount > 0 && input.requestedAmount > typeConfig.maxClaimAmount) {
    add('requestedAmount', 'AMOUNT_ABOVE_MAX', `${typeConfig.name} claims cannot exceed ${formatINR(typeConfig.maxClaimAmount)} per claim.`);
  }

  // Remark
  const minR = Number(claimRules.remarkMinLength) || 0;
  const maxR = Math.max(Number(claimRules.remarkMaxLength) || 500, 500);
  if (!input.remark) add('remark', 'REMARK_REQUIRED', 'Please enter the remark / purpose.', true);
  else if (input.remark.length < minR) add('remark', 'REMARK_TOO_SHORT', `Remark must be at least ${minR} characters.`);
  else if (input.remark.length > maxR) add('remark', 'REMARK_TOO_LONG', `Remark can be at most ${maxR} characters.`);

  // Receipts
  const allowed = receiptRules.allowedMimeTypes.map((t) => String(t).toLowerCase());
  const maxFiles = Number(receiptRules.maxFiles) || 10;
  const svcEntries = input.entries || [];
  const isConveyanceEntry = (e) => String(e.expenseType || '').toUpperCase() === 'CONVEYANCE';
  const allConveyance = svcEntries.length > 0 && svcEntries.every(isConveyanceEntry);
  // Local Conveyance has no bills/proofs (number plate + Start/End KM instead)
  const receiptsRequired = !isRelativeStay && !allConveyance && Boolean(typeConfig ? typeConfig.proofRequired === true : receiptRules.required);
  const checkFiles = (files, field) => {
    files.forEach((f) => {
      if (!isValidFileUrl(f.url)) add(field, 'UPLOAD_INCOMPLETE', `"${f.name}" has not finished uploading. Please retry or remove it.`);
      else if (field === 'receipts' && f.type && !allowed.includes(f.type)) add(field, 'UNSUPPORTED_FILE', `"${f.name}" is not a supported file type.`);
    });
  };
  if (receiptsRequired && input.receipts.length === 0) {
    add('receipts', 'RECEIPT_REQUIRED', 'Please attach at least one bill or receipt.', true);
  }
  if (input.receipts.length > maxFiles) add('receipts', 'TOO_MANY_FILES', `You can attach a maximum of ${maxFiles} receipts.`);
  checkFiles(input.receipts, 'receipts');

  // Local Conveyance: photo of Vehicle Number Plate, Start KM and End KM (odometer)
  if (input.claimMode === 'NORMAL') {
    const photoLabels = { numberPlatePhotos: 'vehicle number plate', startKmPhotos: 'Start KM (odometer)', endKmPhotos: 'End KM (odometer)' };
    const photoCodes = { numberPlatePhotos: 'NUMBER_PLATE_PHOTO_REQUIRED', startKmPhotos: 'START_KM_PHOTO_REQUIRED', endKmPhotos: 'END_KM_PHOTO_REQUIRED' };
    svcEntries.forEach((e, idx) => {
      if (!isConveyanceEntry(e)) return;
      const p = svcEntries.length > 1 ? `entries[${idx}].` : '';
      CONVEYANCE_PHOTO_FIELDS.forEach((field) => {
        const list = e[field] || [];
        if (list.length === 0) add(`${p}${field}`, photoCodes[field], `Please upload the ${photoLabels[field]} photo for Local Conveyance.`, true);
        else checkFiles(list, `${p}${field}`);
      });
    });
  }

  // Service Report (Required for Lodging claims, and for Normal claims when Visit is selected)
  const isClaimVisit = input.visitType === 'VISIT' || input.isVisit === true || svcEntries.some(e => e.visitType === 'VISIT' || e.isVisit === true);
  const requiresServiceReport = input.claimMode === 'LODGING' || (input.claimMode === 'NORMAL' && isClaimVisit);
  if (requiresServiceReport) {
    if (!input.serviceReports || input.serviceReports.length === 0) {
      const msg = input.claimMode === 'LODGING'
        ? 'Please upload at least one Service Report for lodging claim.'
        : 'Visit option is selected. Please upload at least one Service Report for your claim.';
      add('serviceReports', 'SERVICE_REPORT_REQUIRED', msg, true);
    } else {
      checkFiles(input.serviceReports, 'serviceReports');
    }
  }

  // Full payment (approval proof replaced by in-app Management approval)
  if (input.fullPayment.requested) {
    if (!fullPaymentRules.enabled) {
      add('fullPayment', 'FULL_PAYMENT_DISABLED', 'Full payment requests are not enabled for your company.');
    } else {
      if (!input.fullPayment.reason) add('fullPayment.reason', 'FULL_PAYMENT_REASON_REQUIRED', 'Please provide the reason for full payment.', true);
      else if (input.fullPayment.reason.length > MAX_TEXT.fullPaymentReason) add('fullPayment.reason', 'TOO_LONG', `Full payment reason can be at most ${MAX_TEXT.fullPaymentReason} characters.`);
    }
  }

  // Approver: Management user (full payment) or Reporting Manager (OTHER expense)
  // For Management users, approval is not applicable; claims route directly to Accounts.
  const isMgmt = Boolean(isManagement || (user && require('./expenseAccess').isManagementUser(user)));
  const approvalKind = isMgmt ? 'NONE' : approvalKindFor(input);
  if (approvalKind !== 'NONE') {
    if (!input.approverId) {
      add('approverId', 'APPROVER_REQUIRED', approvalKind === 'FULL_PAYMENT'
        ? 'Please select the Management user who will approve the full payment.'
        : 'Please select the Reporting Manager who will approve this Other expense.', true);
    } else if (!mongoose.Types.ObjectId.isValid(input.approverId)) {
      add('approverId', 'APPROVER_INVALID', 'The selected approver is invalid.');
    }
  }

  // Other expense sub-type validation in NORMAL claim mode
  const validateOtherEntry = (ent, prefix = '') => {
    const eType = String(ent.expenseType || '').toUpperCase();
    if (eType === 'OTHER') {
      const sub = String(ent.otherSubType || '').toUpperCase();
      if (!sub) {
        add(`${prefix}otherSubType`, 'OTHER_SUBTYPE_REQUIRED', 'Please select either Purchase or Normal for Other expense.', true);
      } else if (!['PURCHASE', 'NORMAL'].includes(sub)) {
        add(`${prefix}otherSubType`, 'INVALID_OTHER_SUBTYPE', 'Other expense type must be either Purchase or Normal.');
      } else if (sub === 'PURCHASE') {
        if (!ent.barcodeNumber || !ent.barcodeNumber.trim()) {
          add(`${prefix}barcodeNumber`, 'BARCODE_REQUIRED', 'Barcode number is required for purchase expense.', true);
        }
        if (!ent.quantity || !String(ent.quantity).trim()) {
          add(`${prefix}quantity`, 'QUANTITY_REQUIRED', 'Quantity is required for purchase expense.', true);
        }
      }
    }
  };

  if (input.claimMode === 'NORMAL') {
    if (Array.isArray(input.entries) && input.entries.length > 0) {
      input.entries.forEach((ent, idx) => {
        validateOtherEntry(ent, input.entries.length > 1 ? `entries[${idx}].` : '');
      });
    } else if (String(input.expenseType || '').toUpperCase() === 'OTHER') {
      validateOtherEntry(input, '');
    }
  }

  return isDraft ? errors.filter((e) => !e.required) : errors;
}

// ─── Amounts (pure) ─────────────────────────────────────────────────────────

/** Split an amount into n parts (paise accurate, remainder on the last part). */
function splitAmount(total, n) {
  const paise = Math.round(Number(total || 0) * 100);
  const base = Math.floor(paise / n);
  return Array.from({ length: n }, (_, i) => (i === n - 1 ? paise - base * (n - 1) : base) / 100);
}

/** Payable = policy-allowed amount, or the approved full-payment amount. */
function computePayable(claim) {
  const fp = claim.fullPayment || {};
  if (fp.requested && fp.status === 'APPROVED') return round2(fp.approvedAmount || claim.grandRequested || 0);
  return round2(claim.grandAllowed || 0);
}

/**
 * Status after a successful submit:
 * - Full Payment requested  -> APPROVAL_PENDING (selected Management user approves)
 * - OTHER expense (no FP)   -> APPROVAL_PENDING (selected Reporting Manager approves)
 * - otherwise               -> SUBMITTED ("Pending" in the Accounts queue)
 * After approval the claim moves to SUBMITTED; Accounts then marks it PAID or REJECTED.
 * Full payment amount only becomes payable once Management approves it.
 */
function routeSubmission(claim, { now = new Date(), isManagement = false, user = null } = {}) {
  const fp = claim.fullPayment || {};
  const isMgmt = Boolean(
    isManagement ||
    (user && require('./expenseAccess').isManagementUser(user)) ||
    (claim.submittedBy && require('./expenseAccess').isManagementUser(claim.submittedBy))
  );

  if (isMgmt) {
    if (fp.requested) {
      fp.requestedAt = fp.requestedAt || now;
      fp.status = 'APPROVED';
      fp.approvedAmount = round2(claim.grandRequested || 0);
      const subUser = user || claim.submittedBy || {};
      fp.decidedBy = subUser._id || null;
      fp.decidedByName = subUser.name || 'Management';
      fp.decidedAt = now;
      fp.decisionRemarks = 'Approval not applicable for Management user';
    } else {
      fp.status = 'NOT_REQUESTED';
      fp.approvedAmount = 0;
    }
    claim.fullPayment = fp;
    claim.managerApproval = {
      kind: 'NONE',
      approver: (user && user._id) || (claim.submittedBy && claim.submittedBy._id) || null,
      approverName: (user && user.name) || (claim.submittedBy && claim.submittedBy.name) || 'Management',
      approverRole: 'MANAGEMENT',
      status: 'APPROVED',
      requestedAt: now,
      decidedAt: now,
      remarks: 'Approval not applicable for Management user',
    };
    claim.status = 'SUBMITTED';
    claim.approvalRequired = false;
    claim.approvalFlow = 'NONE';
    claim.paymentStatus = 'PENDING';
    claim.payableAmount = computePayable(claim);
    claim.submittedAt = now;
    return claim;
  }

  const kind = approvalKindFor(claim);
  const prev = claim.managerApproval || {};
  if (fp.requested) {
    fp.requestedAt = fp.requestedAt || now;
    fp.status = 'PENDING';
    fp.approvedAmount = 0;
    fp.decidedBy = null;
    fp.decidedByName = '';
    fp.decidedAt = null;
    fp.decisionRemarks = '';
  } else {
    fp.status = 'NOT_REQUESTED';
    fp.approvedAmount = 0;
  }
  claim.fullPayment = fp;

  if (kind !== 'NONE') {
    claim.managerApproval = {
      kind,
      approver: prev.approver || null,
      approverName: prev.approverName || '',
      approverRole: kind === 'FULL_PAYMENT' ? 'MANAGEMENT' : 'REPORTING_MANAGER',
      status: 'PENDING',
      requestedAt: now,
      decidedAt: null,
      remarks: '',
    };
    claim.status = 'APPROVAL_PENDING';
    claim.approvalRequired = true;
  } else {
    claim.managerApproval = {
      kind: 'NONE', approver: null, approverName: '', approverRole: '', status: 'NOT_REQUIRED', requestedAt: null, decidedAt: null, remarks: '',
    };
    claim.status = 'SUBMITTED';
    claim.approvalRequired = false;
  }
  claim.approvalFlow = 'NONE';
  claim.paymentStatus = 'PENDING';
  claim.payableAmount = computePayable(claim);
  claim.submittedAt = now;
  return claim;
}

/**
 * Deadline evaluation (pure).
 * DEADLINE RULES have been removed from the expense management system — claims never expire.
 */
function evaluateDeadline({ deadlineRules, anchor, stillAway, now = new Date() }) {
  return { claimEligibleUntil: null, expired: false, warnings: [] };
}

// ─── DB-backed helpers ──────────────────────────────────────────────────────

const ACTIVE_USER_EXCLUDED = ['INACTIVE', 'inactive', 'DISABLED', 'TERMINATED', 'SUSPENDED', 'LOCKED'];

async function loadEmployees(companyId, ids) {
  if (!ids.length) return [];
  const filter = { _id: { $in: ids } };
  if (companyId) filter.companyId = companyId;
  const users = await User.find(filter)
    .select('name employeeIdCode department designation workingPlace levelRef gradeRef levelNumber gradeCode role status companyId')
    .populate('levelRef')
    .populate('gradeRef')
    .lean();
  const byId = new Map(users.map((u) => [String(u._id), u]));
  return ids.map((id) => byId.get(String(id))).filter(Boolean);
}

/** Outstation evidence from attendance/GPS (Attendance.wasOutstation is sticky per day). */
async function getOutstationInfo(employeeId, start, end) {
  const records = await Attendance.find({ user: employeeId, date: { $gte: start } })
    .sort({ date: 1 })
    .limit(120)
    .select('date isOutstation wasOutstation outstationReturnedAt')
    .lean();
  const isOut = (r) => !!(r.wasOutstation || r.isOutstation);
  const inRange = records.filter((r) => r.date <= end);
  const days = inRange.filter(isOut).length;
  const info = { verified: days > 0, days, returnDate: null, stillAway: false };
  if (!info.verified) return info;

  let sawOutstation = false;
  for (const r of records) {
    if (isOut(r)) {
      sawOutstation = true;
      // Returned to the work location on/after the claimed period -> period ends that day
      if (r.outstationReturnedAt && r.date >= end) {
        info.returnDate = parseDateOnly(r.outstationReturnedAt);
        return info;
      }
    } else if (sawOutstation && r.date > end) {
      info.returnDate = r.date; // first normal (in-office) attendance after the trip
      return info;
    }
  }
  const last = records[records.length - 1];
  info.stillAway = !!last && isOut(last) && !last.outstationReturnedAt;
  if (!info.stillAway) info.returnDate = end;
  return info;
}

const empLabel = (e) => `${e.name || 'Employee'}${e.employeeIdCode ? ` (${e.employeeIdCode})` : ''}`;

/**
 * Server-side business rules: duplicates (NORMAL), overlap (LODGING), outstation, deadline.
 */
async function evaluateBusinessRules({ companyId, input, typeConfig, employees, policyConfig, excludeClaimId, actor, actorIsSuperAdmin, now = new Date() }) {
  const errors = [];
  const add = (field, code, message, extra = {}) => errors.push({ field, code, message, ...extra });
  const code = typeConfig.code;
  const typeName = typeConfig.name;
  const isNormal = input.claimMode === 'NORMAL';
  const start = isNormal ? input.claimDate : input.fromDate;
  const end = isNormal ? input.claimDate : input.toDate;
  const base = { companyId, status: { $nin: NON_BLOCKING_STATUSES } };
  if (excludeClaimId) base._id = { $ne: excludeClaimId };
  const singleEmp = employees.length === 1 && String(employees[0]._id) === String(actor);

  for (const emp of employees) {
    const who = singleEmp ? '' : ` for ${empLabel(emp)}`;

    if (isNormal && typeConfig.sameDateLimit > 0) {
      const count = await ExpenseClaim.countDocuments({
        ...base,
        $or: [
          { claimType: code, claimDate: start, 'employeeClaims.employee.employeeId': emp._id },
          // Claims created before claimDate existed: match the item date
          {
            claimDate: null,
            employeeClaims: {
              $elemMatch: {
                'employee.employeeId': emp._id,
                items: { $elemMatch: { expenseType: code, expenseDate: { $gte: new Date(start.getTime() - 330 * 60000), $lt: addDays(start, 1) } } },
              },
            },
          },
        ],
      });
      if (count >= typeConfig.sameDateLimit) {
        add('expenseType', `DUPLICATE_${code}`, typeConfig.sameDateLimit === 1
          ? `${typeName} expense has already been claimed${who} for ${formatDate(start)}.`
          : `${typeName} expense can be claimed only ${typeConfig.sameDateLimit} times per day${who}; limit reached for ${formatDate(start)}.`);
      }
    }

    if (!isNormal && !typeConfig.allowOverlap) {
      const existing = await ExpenseClaim.findOne({
        ...base,
        claimMode: 'LODGING',
        claimType: code,
        'employeeClaims.employee.employeeId': emp._id,
        fromDate: { $lt: end },
        toDate: { $gt: start },
      }).select('claimNumber fromDate toDate').lean();
      if (existing) {
        add('fromDate', `${code}_OVERLAP`,
          `${typeName} claim overlaps with an existing ${typeName.toLowerCase()} claim${who} from ${formatDate(existing.fromDate)} to ${formatDate(existing.toDate)}.`,
          { claimNumber: existing.claimNumber });
      }
    }
  }

  // Outstation evidence: primary employee (filer if on the claim) drives the deadline anchor.
  const outstationByEmp = {};
  for (const emp of employees) {
    outstationByEmp[String(emp._id)] = await getOutstationInfo(emp._id, start, isNormal ? end : addDays(end, -1));
    if (typeConfig.requiresOutstation && !outstationByEmp[String(emp._id)].verified) {
      add('expenseType', 'OUTSTATION_REQUIRED', isNormal
        ? `Attendance does not show outstation duty${singleEmp ? '' : ` for ${empLabel(emp)}`} on ${formatDate(start)}. ${typeName} can only be claimed for outstation days.`
        : `Attendance does not show outstation duty${singleEmp ? '' : ` for ${empLabel(emp)}`} between ${formatDate(start)} and ${formatDate(end)}.`);
    }
  }
  const primary = employees.find((e) => String(e._id) === String(actor)) || employees[0];
  const outstation = outstationByEmp[String(primary._id)];

  const anchor = outstation.verified && outstation.returnDate && outstation.returnDate > end ? outstation.returnDate : end;
  const deadline = evaluateDeadline({ deadlineRules: policyConfig.deadlineRules, anchor, stillAway: outstation.verified && outstation.stillAway, now });
  let deadlineOverridden = false;
  if (deadline.expired) {
    if (actorIsSuperAdmin && policyConfig.claimRules.deadlineOverrideAllowed) {
      deadlineOverridden = true;
      deadline.warnings.push(`Submission period ended on ${formatDate(parseDateOnly(deadline.claimEligibleUntil))}; submitted with Super Admin override.`);
    } else {
      add('claimDate', 'CLAIM_EXPIRED', 'Your expense claim submission period has expired.', {
        hint: policyConfig.claimRules.deadlineOverrideAllowed ? 'Please contact Super Admin for an override.' : '',
      });
    }
  }

  return {
    errors,
    outstation: { verified: outstation.verified, days: outstation.days, returnDate: outstation.returnDate },
    claimEligibleUntil: deadline.claimEligibleUntil,
    deadlineWarnings: deadline.warnings,
    deadlineOverridden,
  };
}

/**
/**
 * Compute lodging stay budget according to official FAQ policy rules:
 * - 1 employee: 100% of individual entitlement
 * - 2 employees: 75% of combined allowed budget of both (Section B)
 * - 3 employees: combined of highest and lowest allowance amongst the 3 (Section C)
 * - 4 or more employees: split allowance in 2s (75% combined per pair) (Section D)
 */
function computeLodgingPolicyLimit({ empLimits, ordered, policy, days }) {
  const n = ordered.length;
  const lRules = policy?.lodgingRules || {};

  if (n <= 1) {
    const lim = empLimits[0] || 0;
    const perDay = days > 0 ? round2(lim / days) : lim;
    return {
      totalPolicyLimit: lim,
      effectiveLimits: [lim],
      ruleCode: 'SINGLE_EMPLOYEE',
      ruleDescription: 'Single employee stay budget (100% individual category entitlement)',
      formula: days > 1
        ? `Stay budget: 100% of individual entitlement = ${formatINR(perDay)}/day × ${days} days = ${formatINR(lim)}`
        : `Stay budget: 100% of individual entitlement = ${formatINR(perDay)}/day`,
    };
  }

  if (n === 2) {
    const ruleType = lRules.twoEmployees?.ruleType || (policy?.sharedLodgingRule === 'HIGHER_ONLY' ? 'HIGHER_ONLY' : 'COMBINED_PERCENT');
    if (ruleType === 'HIGHER_ONLY') {
      const higherIdx = empLimits[0] >= empLimits[1] ? 0 : 1;
      const lowerIdx = 1 - higherIdx;
      const totalPolicyLimit = Math.max(empLimits[0], empLimits[1]);
      const rawSum = round2(empLimits[0] + empLimits[1]) || 1;
      const eff0 = round2(totalPolicyLimit * (empLimits[0] / rawSum));
      const eff1 = round2(totalPolicyLimit - eff0);
      const higherName = ordered[higherIdx]?.name || 'Higher';
      return {
        totalPolicyLimit,
        effectiveLimits: [eff0, eff1],
        ruleCode: 'TWO_EMPLOYEES_HIGHER_ONLY',
        ruleDescription: 'Stay budget (2 employees): Higher entitlement only',
        formula: `Stay budget rule (2 employees): Higher entitlement only = ${formatINR(totalPolicyLimit)} (${higherName})`,
        meta: { higherIdx, lowerIdx },
      };
    }

    const rawSum = round2(empLimits[0] + empLimits[1]);
    const pct = lRules.twoEmployees?.percent !== undefined
      ? Number(lRules.twoEmployees.percent)
      : (policy?.sharedLodgingPercent !== undefined ? Number(policy.sharedLodgingPercent) : 75);
    const totalPolicyLimit = round2(rawSum * (pct / 100));
    const eff0 = round2(empLimits[0] * (pct / 100));
    const eff1 = round2(totalPolicyLimit - eff0);
    return {
      totalPolicyLimit,
      effectiveLimits: [eff0, eff1],
      ruleCode: `TWO_EMPLOYEES_${pct}_PCT`,
      ruleDescription: `Stay budget (2 employees): ${pct}% of combined allowed budget of both`,
      formula: `Stay budget rule (2 employees): ${pct}% of combined budget = ${pct}% × (${formatINR(empLimits[0])} + ${formatINR(empLimits[1])}) = ${formatINR(totalPolicyLimit)}`,
    };
  }

  if (n === 3) {
    const ruleType = lRules.threeEmployees?.ruleType || 'HIGHEST_PLUS_LOWEST';
    if (ruleType === 'COMBINED_PERCENT') {
      const pct = Number(lRules.threeEmployees?.percent) || 75;
      const rawSum = round2(empLimits.reduce((s, v) => s + v, 0));
      const totalPolicyLimit = round2(rawSum * (pct / 100));
      let acc = 0;
      const effectiveLimits = [];
      for (let i = 0; i < 3; i++) {
        if (i === 2) effectiveLimits.push(round2(totalPolicyLimit - acc));
        else {
          const el = round2(totalPolicyLimit * (empLimits[i] / rawSum));
          effectiveLimits.push(el);
          acc = round2(acc + el);
        }
      }
      return {
        totalPolicyLimit,
        effectiveLimits,
        ruleCode: `THREE_EMPLOYEES_${pct}_PCT`,
        ruleDescription: `Stay budget (3 employees): ${pct}% of combined budget`,
        formula: `Stay budget rule (3 employees): ${pct}% of combined budget = ${pct}% × ${formatINR(rawSum)} = ${formatINR(totalPolicyLimit)}`,
      };
    } else {
      // Default: HIGHEST_PLUS_LOWEST (FAQ Section C)
      const indexed = empLimits.map((lim, idx) => ({ lim, idx })).sort((a, b) => a.lim - b.lim);
      const lowest = indexed[0];
      const middle = indexed[1];
      const highest = indexed[2];
      const totalPolicyLimit = round2(lowest.lim + highest.lim);

      const rawSum = round2(empLimits.reduce((s, v) => s + v, 0)) || 1;
      let acc = 0;
      const effectiveLimits = [];
      for (let i = 0; i < 3; i++) {
        if (i === 2) effectiveLimits.push(round2(totalPolicyLimit - acc));
        else {
          const el = round2(totalPolicyLimit * (empLimits[i] / rawSum));
          effectiveLimits.push(el);
          acc = round2(acc + el);
        }
      }
      return {
        totalPolicyLimit,
        effectiveLimits,
        ruleCode: 'THREE_EMPLOYEES_HIGHEST_LOWEST',
        ruleDescription: 'Stay budget (3 employees): Combined of highest and lowest allowance amongst the 3',
        formula: `Stay budget rule (3 employees): Combined of highest and lowest = ${formatINR(highest.lim)} (${ordered[highest.idx]?.name || 'Highest'}) + ${formatINR(lowest.lim)} (${ordered[lowest.idx]?.name || 'Lowest'}) = ${formatINR(totalPolicyLimit)}`,
        meta: { lowestIdx: lowest.idx, highestIdx: highest.idx, middleIdx: middle.idx },
      };
    }
  }

  // n >= 4 (FAQ Section D)
  const ruleType = lRules.fourPlusEmployees?.ruleType || 'SPLIT_IN_PAIRS_75';
  const pct = Number(lRules.fourPlusEmployees?.percent) || 75;
  if (ruleType === 'COMBINED_PERCENT') {
    const rawSum = round2(empLimits.reduce((s, v) => s + v, 0));
    const totalPolicyLimit = round2(rawSum * (pct / 100));
    let acc = 0;
    const effectiveLimits = [];
    for (let i = 0; i < n; i++) {
      if (i === n - 1) effectiveLimits.push(round2(totalPolicyLimit - acc));
      else {
        const el = round2(totalPolicyLimit * (empLimits[i] / rawSum));
        effectiveLimits.push(el);
        acc = round2(acc + el);
      }
    }
    return {
      totalPolicyLimit,
      effectiveLimits,
      ruleCode: `FOUR_PLUS_${pct}_PCT`,
      ruleDescription: `Stay budget (${n} employees): ${pct}% of combined budget`,
      formula: `Stay budget rule (${n} employees): ${pct}% of combined budget = ${pct}% × ${formatINR(rawSum)} = ${formatINR(totalPolicyLimit)}`,
    };
  } else {
    // Default: SPLIT_IN_PAIRS_75 (FAQ Section D)
    const sorted = ordered
      .map((e, idx) => ({ emp: e, limit: empLimits[idx], origIdx: idx }))
      .sort((a, b) => b.limit - a.limit);

    let totalPolicyLimit = 0;
    const effByIndex = new Array(n).fill(0);
    const pairFormulas = [];
    for (let i = 0; i < sorted.length; i += 2) {
      if (i + 1 < sorted.length) {
        const a = sorted[i];
        const b = sorted[i + 1];
        const pairTotal = round2((a.limit + b.limit) * (pct / 100));
        totalPolicyLimit = round2(totalPolicyLimit + pairTotal);
        const effA = round2(a.limit * (pct / 100));
        const effB = round2(pairTotal - effA);
        effByIndex[a.origIdx] = effA;
        effByIndex[b.origIdx] = effB;
        pairFormulas.push(`Pair (${a.emp.name || 'Emp'}+${b.emp.name || 'Emp'}): ${pct}% × (${formatINR(a.limit)} + ${formatINR(b.limit)}) = ${formatINR(pairTotal)}`);
      } else {
        const lone = sorted[i];
        totalPolicyLimit = round2(totalPolicyLimit + lone.limit);
        effByIndex[lone.origIdx] = lone.limit;
        pairFormulas.push(`Single (${lone.emp.name || 'Emp'}): 100% = ${formatINR(lone.limit)}`);
      }
    }
    return {
      totalPolicyLimit,
      effectiveLimits: effByIndex,
      ruleCode: `FOUR_PLUS_SPLIT_PAIRS_${pct}`,
      ruleDescription: `Stay budget (${n} employees): Split allowance in 2s (${pct}% combined per pair)`,
      formula: `Stay budget rule (${n} employees): Split in 2s with ${pct}% combined budget = ${formatINR(totalPolicyLimit)}`,
      pairFormulas,
    };
  }
}

/**
 * Build employeeClaims[] + grand totals. One item per employee keeps the
 * existing analytics/reports working. Lodging with 2+ employees uses the
 * official tiered lodging rules (1, 2, 3, 4+ employees).
 */
async function calculateAmounts({ input, typeConfig, employees, policy, entitlements, destinationClass, actor, allTypes = [] }) {
  const code = typeConfig ? typeConfig.code : (input.expenseType || 'OTHER');
  const isLodgingMode = input.claimMode === 'LODGING';
  const isLodging = isLodgingMode && (code === 'LODGING' || typeConfig?.category === 'LODGING');
  const days = isLodgingMode ? daysBetween(input.fromDate, input.toDate) : 1;
  const ordered = [...employees].sort((a, b) => (String(a._id) === String(actor) ? -1 : String(b._id) === String(actor) ? 1 : 0));
  const shared = isLodging && ordered.length >= 2;

  // Handle Entries in NORMAL Expense Claim Mode (1 or more entries)
  const hasEntries = !isLodgingMode && Array.isArray(input.entries) && input.entries.length > 0;
  if (hasEntries) {
    const employeeClaims = [];

    // Pre-calculate count of each expense type to pass sameDateEntriesCount
    const typeCounts = {};
    for (const ent of input.entries) {
      const c = String(ent.expenseType || 'OTHER').toUpperCase();
      typeCounts[c] = (typeCounts[c] || 0) + 1;
    }

    const employeeItems = ordered.map(() => []);
    const priorAllowedPerEmp = ordered.map(() => ({}));
    const priorClaimedPerEmp = ordered.map(() => ({}));
    const entryIndexByType = {};

    for (let eIdx = 0; eIdx < input.entries.length; eIdx++) {
      const entry = input.entries[eIdx];
      const entryCode = String(entry.expenseType || 'OTHER').toUpperCase();
      const entryTypeConfig = (Array.isArray(allTypes) ? allTypes.find(t => String(t.code).toUpperCase() === entryCode) : null)
        || resolveTypeConfig({ code: entryCode });
      let entryReq = round2(Number(entry.requestedAmount || 0));
      if (entryCode === 'CONVEYANCE' && (!entryReq || entryReq === 0) && Number(entry.distanceKm) > 0) {
        const policyRates = (policy && policy.conveyanceRates) || {};
        const vClean = String(entry.vehicle || 'car').toLowerCase().replace(/[\s_-]/g, '');
        const rMap = {
          twowheeler: policyRates.twoWheeler,
          two_wheeler: policyRates.twoWheeler,
          'two-wheeler': policyRates.twoWheeler,
          bike: policyRates.twoWheeler,
          two: policyRates.twoWheeler,
          car: policyRates.car,
          fourwheeler: policyRates.car,
          four_wheeler: policyRates.car,
          'four-wheeler': policyRates.car,
          ebike: policyRates.eBike,
          e_bike: policyRates.eBike,
          'e-bike': policyRates.eBike,
          ecar: policyRates.eCar,
          e_car: policyRates.eCar,
          'e-car': policyRates.eCar,
        };
        const r = rMap[vClean] ?? rMap[entry.vehicle] ?? policyRates.car ?? 5;
        entryReq = round2(Number(entry.distanceKm) * r);
      }

      const currentTypeCount = typeCounts[entryCode] || 1;
      const currentTypeIndex = (entryIndexByType[entryCode] || 0) + 1;
      entryIndexByType[entryCode] = currentTypeIndex;

      const isCombinedLimitType = entryCode === 'FOOD' || entryCode === 'LODGING';

      // Find base daily entitlements for each employee (applicable for FOOD / LODGING)
      const empDailyCaps = ordered.map(emp => {
        if (!isCombinedLimitType) return 0;
        const ln = getEmployeeLevelNumber(emp);
        const gc = getEmployeeGradeCode(emp);
        const ent = findEntitlement(entitlements, ln, gc, destinationClass, entryCode);
        return (ent && ent.amount > 0) ? ent.amount : 0;
      });

      const entryReceipts = Array.isArray(entry.receipts) && entry.receipts.length > 0
        ? entry.receipts
        : (entryCode === 'CONVEYANCE' ? [] : (input.receipts || []));

      let reqShares = [];
      let allowedShares = [];
      let excessShares = [];

      if (ordered.length > 1) {
        const hasCaps = isCombinedLimitType && empDailyCaps.some(cap => cap > 0);
        if (hasCaps) {
          const remCaps = ordered.map((_, i) => Math.max(0, round2(empDailyCaps[i] - (priorAllowedPerEmp[i][entryCode] || 0))));
          const combinedRemaining = round2(remCaps.reduce((s, c) => s + c, 0));
          const entryAllowed = Math.min(entryReq, combinedRemaining);
          const entryExcess = Math.max(0, round2(entryReq - entryAllowed));

          if (entryAllowed === combinedRemaining) {
            allowedShares = remCaps;
          } else if (combinedRemaining > 0) {
            let allocated = 0;
            for (let i = 0; i < ordered.length; i++) {
              if (i === ordered.length - 1) {
                allowedShares.push(round2(entryAllowed - allocated));
              } else {
                const share = round2(entryAllowed * (remCaps[i] / combinedRemaining));
                allowedShares.push(share);
                allocated = round2(allocated + share);
              }
            }
          } else {
            allowedShares = ordered.map(() => 0);
          }

          if (entryExcess > 0) {
            excessShares = splitAmount(entryExcess, ordered.length);
          } else {
            excessShares = ordered.map(() => 0);
          }

          reqShares = ordered.map((_, i) => round2(allowedShares[i] + excessShares[i]));
        } else {
          // Actuals / No fixed cap (Directly all payment allowed for CONVEYANCE, TRAVEL, OTHER)
          const shares = splitAmount(entryReq, ordered.length);
          reqShares = shares;
          allowedShares = shares;
          excessShares = ordered.map(() => 0);
        }
      } else {
        reqShares = [entryReq];
        allowedShares = [entryReq];
        excessShares = [0];
      }

      for (let i = 0; i < ordered.length; i++) {
        const emp = ordered[i];
        const levelNumber = getEmployeeLevelNumber(emp);
        const gradeCode = getEmployeeGradeCode(emp);

        const isEntryOther = entryCode === 'OTHER';
        const isEntryPurchase = isEntryOther && ((entry.otherSubType || '').toUpperCase() === 'PURCHASE');
        const item = {
          expenseType: entryCode,
          expenseTypeName: isEntryPurchase ? 'Purchase' : (entryTypeConfig?.name || (isEntryOther ? 'Other Expense' : entryCode)),
          customerName: input.customerName,
          description: entry.remark || input.remark,
          expenseDate: input.claimDate,
          city: input.destinationCity,
          cityClass: destinationClass,
          days: 1,
          requestedAmount: reqShares[i],
          proofRequired: entryTypeConfig?.proofRequired === true,
          proofStatus: entryReceipts.length ? 'RECEIVED' : 'MISSING',
          vehicle: entryCode === 'CONVEYANCE' ? (entry.vehicle || '') : '',
          distanceKm: entryCode === 'CONVEYANCE' ? Number(entry.distanceKm || 0) : 0,
          visitType: (entry.visitType === 'VISIT' || entry.isVisit || input.visitType === 'VISIT' || input.isVisit) ? 'VISIT' : 'NO_VISIT',
          isVisit: Boolean(entry.isVisit || entry.visitType === 'VISIT' || input.isVisit || input.visitType === 'VISIT'),
          numberPlatePhotos: entryCode === 'CONVEYANCE' ? (entry.numberPlatePhotos || []) : [],
          startKmPhotos: entryCode === 'CONVEYANCE' ? (entry.startKmPhotos || []) : [],
          endKmPhotos: entryCode === 'CONVEYANCE' ? (entry.endKmPhotos || []) : [],
          serviceReports: entryCode === 'CONVEYANCE' ? (entry.serviceReports || []) : [],
          otherSubType: isEntryOther ? (entry.otherSubType || '') : '',
          barcodeNumber: isEntryPurchase ? (entry.barcodeNumber || '') : '',
          quantity: isEntryPurchase ? toStr(entry.quantity, 100).trim() : '',
          attachments: entryCode === 'CONVEYANCE' ? [] : entryReceipts,
        };

        const itemDateStr = typeof item.expenseDate === 'string'
          ? item.expenseDate.slice(0, 10)
          : (item.expenseDate instanceof Date && !isNaN(item.expenseDate.getTime()))
            ? item.expenseDate.toISOString().slice(0, 10)
            : new Date().toISOString().slice(0, 10);

        const priorAllowed = isCombinedLimitType ? (priorAllowedPerEmp[i][entryCode] || 0) : 0;
        const priorClaimed = isCombinedLimitType ? (priorClaimedPerEmp[i][entryCode] || 0) : 0;

        const calc = await calculateItem({
          item,
          employeeLevelNumber: levelNumber,
          employeeGradeCode: gradeCode,
          entitlements,
          cityClass: destinationClass,
          policy,
          itemDate: itemDateStr,
          priorAllowedOnDate: priorAllowed,
          priorClaimedOnDate: priorClaimed,
          sameDateEntryIndex: currentTypeIndex,
          sameDateEntriesCount: currentTypeCount,
        });

        if (ordered.length > 1) {
          if (isCombinedLimitType && empDailyCaps[i] > 0) {
            calc.policyLimit = empDailyCaps[i];
            calc.allowedAmount = allowedShares[i];
            calc.excessAmount = excessShares[i];
            calc.remainingLimit = Math.max(0, round2(empDailyCaps[i] - (priorAllowed + allowedShares[i])));
            calc.limitText = `${formatINR(empDailyCaps[i])}/day`;
          } else {
            // For CONVEYANCE, TRAVEL, OTHER: directly show all payment is allowed, no combined limit values
            calc.policyLimit = reqShares[i];
            calc.allowedAmount = reqShares[i];
            calc.excessAmount = 0;
            calc.remainingLimit = 0;
            calc.limitText = 'Actuals (Fully Allowed)';
          }
        } else if (!isCombinedLimitType) {
          calc.policyLimit = reqShares[0];
          calc.allowedAmount = reqShares[0];
          calc.excessAmount = 0;
        }

        if (isCombinedLimitType) {
          priorAllowedPerEmp[i][entryCode] = round2(priorAllowed + (calc.allowedAmount || 0));
          priorClaimedPerEmp[i][entryCode] = round2(priorClaimed + reqShares[i]);
        }

        employeeItems[i].push({ ...item, ...calc });
      }

      const entryAllowedTotal = round2(ordered.reduce((s, _, i) => s + (Number(employeeItems[i][eIdx]?.allowedAmount) || 0), 0));
      const entryExcessTotal = round2(ordered.reduce((s, _, i) => s + (Number(employeeItems[i][eIdx]?.excessAmount) || 0), 0));
      entry.allowedAmount = entryAllowedTotal;
      entry.excessAmount = entryExcessTotal;
    }

    for (let i = 0; i < ordered.length; i++) {
      const emp = ordered[i];
      const levelNumber = getEmployeeLevelNumber(emp);
      const gradeCode = getEmployeeGradeCode(emp);
      const items = employeeItems[i];
      const sum = (k) => round2(items.reduce((s, it) => s + (Number(it[k]) || 0), 0));

      // Calculate combined policy limit across entries for this employee
      let empPolicyLimitTotal = 0;
      const handledDailyTypes = new Set();
      for (const it of items) {
        if (it.expenseType === 'FOOD' || it.expenseType === 'LODGING') {
          if (!handledDailyTypes.has(it.expenseType)) {
            handledDailyTypes.add(it.expenseType);
            const ent = findEntitlement(entitlements, levelNumber, gradeCode, destinationClass, it.expenseType);
            const dailyCap = (ent && ent.amount > 0) ? ent.amount : (it.policyLimit > 0 ? it.policyLimit : (it.requestedAmount || 0));
            empPolicyLimitTotal = round2(empPolicyLimitTotal + dailyCap);
          }
        } else {
          const itemCap = (it.policyLimit && it.policyLimit > 0) ? it.policyLimit : (it.allowedAmount || it.requestedAmount || 0);
          empPolicyLimitTotal = round2(empPolicyLimitTotal + itemCap);
        }
      }

      employeeClaims.push({
        employee: {
          employeeId: emp._id,
          name: emp.name,
          employeeIdCode: emp.employeeIdCode,
          department: emp.department,
          levelName: emp.levelRef?.name || '',
          levelNumber,
          levelRef: emp.levelRef?._id || null,
          gradeCode,
          gradeRef: emp.gradeRef?._id || null,
          role: emp.role,
        },
        claimedBy: actor,
        items,
        requestedTotal: sum('requestedAmount'),
        allowedTotal: sum('allowedAmount'),
        excessTotal: sum('excessAmount'),
        policyLimitTotal: empPolicyLimitTotal,
        payableTotal: sum('allowedAmount'),
        itemCount: items.length,
      });
    }

    const grandRequested = round2(employeeClaims.reduce((s, ec) => s + ec.requestedTotal, 0));
    const grandAllowed = round2(employeeClaims.reduce((s, ec) => s + ec.allowedTotal, 0));
    const grandExcess = round2(employeeClaims.reduce((s, ec) => s + ec.excessTotal, 0));
    const grandPolicyLimit = round2(employeeClaims.reduce((s, ec) => s + ec.policyLimitTotal, 0));

    // Multi-entry / single-entry plain explanation
    const firstEmpItems = employeeClaims[0]?.items || [];
    let plainExplanation = '';
    if (input.entries.length === 1 && ordered.length === 1) {
      plainExplanation = firstEmpItems[0]?.plainExplanation || '';
    } else if (input.entries.length === 1 && ordered.length > 1) {
      const entryType = input.entries[0]?.expenseType || code;
      const isComb = entryType === 'FOOD' || entryType === 'LODGING';
      if (!isComb) {
        plainExplanation = `Claimed bill: ${formatINR(grandRequested)}. All payment of ${formatINR(grandAllowed)} is fully allowed across ${ordered.length} employees (${formatINR(round2(grandAllowed / ordered.length))} each).`;
      } else {
        const empLines = ordered.map((emp) => {
          const ln = getEmployeeLevelNumber(emp);
          const gc = getEmployeeGradeCode(emp);
          const ent = findEntitlement(entitlements, ln, gc, destinationClass, entryType);
          const cap = (ent && ent.amount > 0) ? ent.amount : 0;
          return cap > 0 ? `${emp.name}: ${formatINR(cap)}/day` : `${emp.name}: Actuals`;
        });
        const combinedLimitText = `Combined daily limit: ${formatINR(grandPolicyLimit)}`;
        if (grandExcess > 0) {
          plainExplanation = `Individual limits per day:\n• ${empLines.join('\n• ')}\n\n${combinedLimitText}.\n\nClaimed bill: ${formatINR(grandRequested)}. Therefore, ${formatINR(grandAllowed)} is allowed and ${formatINR(grandExcess)} is excess beyond policy limit.`;
        } else {
          plainExplanation = `Individual limits per day:\n• ${empLines.join('\n• ')}\n\n${combinedLimitText}.\n\nClaimed bill: ${formatINR(grandRequested)}. Since your bill is within your combined daily limit, ${formatINR(grandAllowed)} is fully allowed.`;
        }
      }
    } else {
      const runningPriorAllowed = {};
      const entrySummaries = input.entries.map((entry, idx) => {
        const entryCode = String(entry.expenseType || 'OTHER').toUpperCase();
        const entryName = (Array.isArray(allTypes) ? allTypes.find(t => String(t.code).toUpperCase() === entryCode)?.name : null) || entryCode;
        const entryReq = round2(Number(entry.requestedAmount || 0));
        const entryAllowed = round2(employeeClaims.reduce((s, ec) => s + (ec.items[idx]?.allowedAmount || 0), 0));
        const entryExcess = round2(employeeClaims.reduce((s, ec) => s + (ec.items[idx]?.excessAmount || 0), 0));
        const count = typeCounts[entryCode] || 1;
        const it = firstEmpItems[idx];
        const priorAllowedForType = runningPriorAllowed[entryCode] || 0;
        const isComb = entryCode === 'FOOD' || entryCode === 'LODGING';

        let resultLine = '';
        if (!isComb) {
          // For CONVEYANCE, TRAVEL, OTHER: no combined limit values, directly show all payment is allowed
          resultLine = `Entry #${idx + 1} (${entryName}):\n• Claimed: ${formatINR(entryReq)} -> Allowed: ${formatINR(entryAllowed)} (All payment allowed - no limit cap)`;
        } else if (ordered.length > 1) {
          const empCaps = ordered.map(emp => {
            const ln = getEmployeeLevelNumber(emp);
            const gc = getEmployeeGradeCode(emp);
            const ent = findEntitlement(entitlements, ln, gc, destinationClass, entryCode);
            const cap = (ent && ent.amount > 0) ? ent.amount : 0;
            return cap > 0 ? `${emp.name}: ${formatINR(cap)}/day` : `${emp.name}: Actuals`;
          });
          const combinedCap = round2(employeeClaims.reduce((s, ec) => s + (ec.items[idx]?.policyLimit || 0), 0));
          const remLimitBeforeEntry = Math.max(0, round2(combinedCap - priorAllowedForType));
          const limitStr = combinedCap > 0
            ? `Individual limits per day: ${empCaps.join(', ')} (Combined daily limit: ${formatINR(combinedCap)})`
            : `Policy limit: Actuals (No limit)`;

          if (priorAllowedForType > 0 && combinedCap > 0) {
            const usedText = `(${formatINR(priorAllowedForType)} used in above entry, remaining limit: ${formatINR(remLimitBeforeEntry)})`;
            if (entryExcess > 0) {
              resultLine = `Entry #${idx + 1} (${entryName}${count > 1 ? ' (Combined daily limit)' : ''}):\n• ${limitStr} ${usedText}\n• Claimed: ${formatINR(entryReq)} -> Since ${formatINR(priorAllowedForType)} was used in above entry, only ${formatINR(remLimitBeforeEntry)} was remaining today. Therefore, ${formatINR(entryAllowed)} is allowed and ${formatINR(entryExcess)} is excess beyond daily limit`;
            } else {
              resultLine = `Entry #${idx + 1} (${entryName}${count > 1 ? ' (Combined daily limit)' : ''}):\n• ${limitStr} ${usedText}\n• Claimed: ${formatINR(entryReq)} -> Allowed: ${formatINR(entryAllowed)} (100% fully allowed within remaining limit of ${formatINR(remLimitBeforeEntry)})`;
            }
          } else {
            if (entryExcess > 0) {
              resultLine = `Entry #${idx + 1} (${entryName}${count > 1 ? ' (Combined daily limit)' : ''}):\n• ${limitStr}\n• Claimed: ${formatINR(entryReq)} -> Allowed: ${formatINR(entryAllowed)}, Excess: ${formatINR(entryExcess)} beyond policy limit`;
            } else {
              resultLine = `Entry #${idx + 1} (${entryName}${count > 1 ? ' (Combined daily limit)' : ''}):\n• ${limitStr}\n• Claimed: ${formatINR(entryReq)} -> Allowed: ${formatINR(entryAllowed)} (100% fully allowed)`;
            }
          }
        } else {
          const limStr = it?.limitText || (it?.policyLimit > 0 ? formatINR(it.policyLimit) : 'Actuals (No limit)');
          const baseCap = it?.policyLimit > 0 ? it.policyLimit : 0;
          const remLimitBeforeEntry = Math.max(0, round2(baseCap - priorAllowedForType));

          if (priorAllowedForType > 0 && baseCap > 0) {
            const usedText = `(${formatINR(priorAllowedForType)} used in above entry, remaining limit: ${formatINR(remLimitBeforeEntry)})`;
            if (entryExcess > 0) {
              resultLine = `Entry #${idx + 1} (${entryName}${count > 1 ? ' (Combined daily limit)' : ''}):\n• Limit: ${limStr} ${usedText}\n• Claimed: ${formatINR(entryReq)} -> Since ${formatINR(priorAllowedForType)} was used in above entry, only ${formatINR(remLimitBeforeEntry)} was remaining today. Therefore, ${formatINR(entryAllowed)} is allowed and ${formatINR(entryExcess)} is excess beyond daily limit`;
            } else {
              resultLine = `Entry #${idx + 1} (${entryName}${count > 1 ? ' (Combined daily limit)' : ''}):\n• Limit: ${limStr} ${usedText}\n• Claimed: ${formatINR(entryReq)} -> Allowed: ${formatINR(entryAllowed)} (100% fully allowed within remaining limit of ${formatINR(remLimitBeforeEntry)})`;
            }
          } else {
            if (entryExcess > 0) {
              resultLine = `Entry #${idx + 1} (${entryName}${count > 1 ? ' (Combined daily limit)' : ''}):\n• Limit: ${limStr}\n• Claimed: ${formatINR(entryReq)} -> Allowed: ${formatINR(entryAllowed)}, Excess: ${formatINR(entryExcess)} beyond policy limit`;
            } else {
              resultLine = `Entry #${idx + 1} (${entryName}${count > 1 ? ' (Combined daily limit)' : ''}):\n• Limit: ${limStr}\n• Claimed: ${formatINR(entryReq)} -> Allowed: ${formatINR(entryAllowed)} (100% fully allowed)`;
            }
          }
        }

        if (isComb) {
          runningPriorAllowed[entryCode] = round2(priorAllowedForType + entryAllowed);
        }
        return resultLine;
      });

      plainExplanation = `Multi-Entry Breakdown:\n\n${entrySummaries.join('\n\n')}\n\nGrand Total: Claimed ${formatINR(grandRequested)} | Allowed ${formatINR(grandAllowed)}${grandExcess > 0 ? ` | Excess ${formatINR(grandExcess)}` : ''}.`;
    }

    if (employeeClaims[0]?.items?.[0]) {
      employeeClaims[0].items[0].plainExplanation = plainExplanation;
    }

    return {
      employeeClaims,
      grandRequested,
      grandAllowed,
      grandExcess,
      grandPolicyLimit,
      perDayLimit: ordered.length > 1 ? grandPolicyLimit : (firstEmpItems[0]?.policyLimit || grandPolicyLimit),
      payableAmount: grandAllowed,
      plainExplanation,
    };
  }

  // Compute individual base policy limits (perDay * days)
  const isComb = isLodging || code === 'FOOD';
  const empLimits = ordered.map((emp) => {
    if (!isComb) {
      return round2((input.requestedAmount || 0) / ordered.length);
    }
    const levelNumber = getEmployeeLevelNumber(emp);
    const gradeCode = getEmployeeGradeCode(emp);
    const ent = findEntitlement(entitlements, levelNumber, gradeCode, destinationClass, code);
    const perDay = ent ? ent.amount : 0;
    return round2(perDay * days);
  });

  // Calculate tiered stay budget for lodging, or raw sum for other types
  const baseLodgingResult = isLodging
    ? computeLodgingPolicyLimit({ empLimits, ordered, policy, days })
    : {
      totalPolicyLimit: isComb ? round2(empLimits.reduce((s, lim) => s + lim, 0)) : round2(input.requestedAmount || 0),
      effectiveLimits: empLimits,
      ruleCode: isComb ? 'CATEGORY_ALLOWANCE' : 'ACTUALS_FULLY_ALLOWED',
      formula: '',
    };

  // Stay with relative (LODGING only): reduce the final stay budget by the configured % ONCE,
  // AFTER every existing lodging rule (level, city class, days, employee-count sharing).
  const relativeStay = isLodging && input.stayType === 'WITH_RELATIVE';
  let relativeStayPercent = null;
  if (relativeStay) {
    relativeStayPercent = resolveRelativeStayPercent(policy);
    if (relativeStayPercent === null) throw new Error('Relative stay allowance percentage is not configured in the expense policy.');
  }
  const lodgingResult = relativeStay
    ? computeRelativeStayPolicyLimit({ empLimits, ordered, days, percent: relativeStayPercent })
    : baseLodgingResult;

  const totalPolicyLimit = lodgingResult.totalPolicyLimit;
  // Stay with relative: claimed amount = final entitlement (no bill amount is entered)
  const reqTotal = relativeStay ? lodgingResult.totalPolicyLimit : round2(input.requestedAmount || 0);
  const potentialExcess = isComb ? Math.max(0, round2(reqTotal - totalPolicyLimit)) : 0;

  // In multi-employee claims (lodging or food with 2+ employees):
  // - If bill <= combined limit, allocate requested share proportionally so no false excess is created
  // - If bill > combined limit, split the excess amount equally (half for both when 2, equal for N)
  const isMultiEmpShared = isComb && ordered.length >= 2 && totalPolicyLimit > 0;
  let shares = [];
  if (isMultiEmpShared) {
    if (potentialExcess > 0) {
      const excessShares = splitAmount(potentialExcess, ordered.length);
      shares = ordered.map((_, i) => round2(lodgingResult.effectiveLimits[i] + excessShares[i]));
    } else {
      let allocated = 0;
      for (let i = 0; i < ordered.length; i++) {
        if (i === ordered.length - 1) {
          shares.push(round2(reqTotal - allocated));
        } else {
          const share = round2(reqTotal * (lodgingResult.effectiveLimits[i] / totalPolicyLimit));
          shares.push(share);
          allocated = round2(allocated + share);
        }
      }
    }
  } else {
    shares = splitAmount(reqTotal, ordered.length);
  }

  const employeeClaims = [];
  for (let i = 0; i < ordered.length; i++) {
    const emp = ordered[i];
    const levelNumber = getEmployeeLevelNumber(emp);
    const gradeCode = getEmployeeGradeCode(emp);
    const items = [];
    const isOtherCode = code === 'OTHER';
    const isPurchaseCode = isOtherCode && ((input.entries?.[0]?.otherSubType || input.otherSubType || '').toUpperCase() === 'PURCHASE');
    const item = {
      expenseType: code,
      expenseTypeName: isPurchaseCode ? 'Purchase' : typeConfig.name,
      customerName: input.customerName,
      description: input.remark,
      expenseDate: isLodgingMode ? input.fromDate : input.claimDate,
      city: input.destinationCity,
      cityClass: destinationClass,
      days: isLodgingMode ? days : 1,
      requestedAmount: shares[i],
      proofRequired: relativeStay ? false : typeConfig.proofRequired,
      proofStatus: (input.receipts && input.receipts.length) ? 'RECEIVED' : 'MISSING',
      vehicle: code === 'CONVEYANCE' ? (input.entries?.[0]?.vehicle || input.vehicle || '') : '',
      distanceKm: code === 'CONVEYANCE' ? Number(input.entries?.[0]?.distanceKm || input.distanceKm || 0) : 0,
      visitType: input.entries?.[0]?.visitType || input.visitType || (input.entries?.[0]?.isVisit || input.isVisit ? 'VISIT' : 'NO_VISIT'),
      isVisit: Boolean(input.entries?.[0]?.isVisit || input.isVisit || input.entries?.[0]?.visitType === 'VISIT' || input.visitType === 'VISIT'),
      numberPlatePhotos: code === 'CONVEYANCE' ? (input.entries?.[0]?.numberPlatePhotos || []) : [],
      startKmPhotos: code === 'CONVEYANCE' ? (input.entries?.[0]?.startKmPhotos || []) : [],
      endKmPhotos: code === 'CONVEYANCE' ? (input.entries?.[0]?.endKmPhotos || []) : [],
      serviceReports: code === 'CONVEYANCE' ? (input.entries?.[0]?.serviceReports || input.serviceReports || []) : [],
      otherSubType: isOtherCode ? (input.entries?.[0]?.otherSubType || input.otherSubType || '') : '',
      barcodeNumber: isPurchaseCode ? (input.entries?.[0]?.barcodeNumber || input.barcodeNumber || '') : '',
      quantity: isPurchaseCode ? toStr(input.entries?.[0]?.quantity || input.quantity, 100).trim() : '',
    };
    const itemDateStr = typeof item.expenseDate === 'string'
      ? item.expenseDate.slice(0, 10)
      : (item.expenseDate instanceof Date && !isNaN(item.expenseDate.getTime()))
        ? item.expenseDate.toISOString().slice(0, 10)
        : new Date().toISOString().slice(0, 10);
    const calc = await calculateItem({
      item,
      employeeLevelNumber: levelNumber,
      employeeGradeCode: gradeCode,
      entitlements,
      cityClass: destinationClass,
      policy,
      itemDate: itemDateStr,
    });

    // In multi-employee claims, apply the combined effective policy limit & allowed/excess
    if ((isMultiEmpShared || relativeStay) && lodgingResult.effectiveLimits) {
      calc.policyLimit = lodgingResult.effectiveLimits[i];
      calc.allowedAmount = Math.min(shares[i], lodgingResult.effectiveLimits[i]);
      calc.excessAmount = Math.max(0, round2(shares[i] - calc.allowedAmount));
    } else if (!isComb) {
      calc.policyLimit = shares[i];
      calc.allowedAmount = shares[i];
      calc.excessAmount = 0;
      calc.limitText = 'Actuals (Fully Allowed)';
    }

    // Audit snapshot of the relative-stay adjustment applied to this item
    if (relativeStay) {
      const baseLimit = lodgingResult.baseEffectiveLimits ? lodgingResult.baseEffectiveLimits[i] : empLimits[i];
      const finalLimit = lodgingResult.effectiveLimits[i];
      calc.ruleCode = lodgingResult.ruleCode;
      calc.remainingLimit = null;
      calc.calculationBreakdown = {
        ...(calc.calculationBreakdown || {}),
        rule: lodgingResult.ruleCode,
        stayType: 'WITH_RELATIVE',
        relativeStayPercent,
        baseEntitlement: baseLimit,
        finalEntitlement: finalLimit,
        policyLimit: calc.policyLimit,
        allowedAmount: calc.allowedAmount,
        excessAmount: calc.excessAmount,
        steps: [
          ...((calc.calculationBreakdown && calc.calculationBreakdown.steps) || []),
          `Stay with relative: ${relativeStayPercent}% × base entitlement ${formatINR(baseLimit)} = ${formatINR(finalLimit)} -> MIN(${formatINR(shares[i])}, ${formatINR(finalLimit)}) = ${formatINR(calc.allowedAmount)}`,
        ],
      };
    }

    items.push({ ...item, ...calc });
    const sum = (k) => round2(items.reduce((s, it) => s + (it[k] || 0), 0));
    employeeClaims.push({
      employee: {
        employeeId: emp._id,
        name: emp.name,
        employeeIdCode: emp.employeeIdCode,
        department: emp.department,
        levelName: emp.levelRef?.name || '',
        levelNumber,
        levelRef: emp.levelRef?._id || null,
        gradeCode,
        gradeRef: emp.gradeRef?._id || null,
        role: emp.role,
      },
      claimedBy: actor,
      items,
      requestedTotal: sum('requestedAmount'),
      allowedTotal: sum('allowedAmount'),
      excessTotal: sum('excessAmount'),
      policyLimitTotal: sum('policyLimit'),
      itemCount: items.length,
    });
  }

  const grandRequested = round2(employeeClaims.reduce((s, c) => s + c.requestedTotal, 0));
  const grandAllowed = isComb
    ? round2(Math.min(grandRequested, employeeClaims.reduce((s, c) => s + c.allowedTotal, 0)))
    : grandRequested;
  const grandExcess = isComb
    ? round2(Math.max(0, grandRequested - grandAllowed))
    : 0;
  const grandPolicyLimit = isComb
    ? round2(
      employeeClaims.reduce((s, c) => s + (c.policyLimitTotal !== undefined ? c.policyLimitTotal : (c.items[0]?.policyLimit ?? c.allowedTotal)), 0)
    )
    : grandRequested;

  // If shared claim with pooled limits, update explanation on the primary item
  if ((isMultiEmpShared || (relativeStay && ordered.length >= 2)) && employeeClaims[0]?.items?.[0]) {
    const empLines = ordered.map((e, idx) => {
      const perDay = days > 0 ? round2(empLimits[idx] / days) : empLimits[idx];
      if (relativeStay) {
        const effLimit = lodgingResult.effectiveLimits[idx];
        const effPerDay = days > 0 ? round2(effLimit / days) : effLimit;
        return days > 1
          ? `${e.name || `Employee #${idx + 1}`}: ${formatINR(effPerDay)}/day (Total: ${formatINR(effLimit)} for ${days} days, ${relativeStayPercent}% of ${formatINR(perDay)}/day)`
          : `${e.name || `Employee #${idx + 1}`}: ${formatINR(effPerDay)}/day (${relativeStayPercent}% of ${formatINR(perDay)}/day)`;
      }
      let tag = '';
      if (ordered.length === 2 && lodgingResult.meta) {
        if (idx === lodgingResult.meta.higherIdx) tag = ' (Higher)';
        else if (idx === lodgingResult.meta.lowerIdx) tag = ' (Lower)';
      }
      if (ordered.length === 3 && lodgingResult.meta) {
        if (idx === lodgingResult.meta.lowestIdx) tag = ' (Lowest)';
        else if (idx === lodgingResult.meta.highestIdx) tag = ' (Highest)';
        else if (idx === lodgingResult.meta.middleIdx) tag = ' (Middle)';
      }
      return days > 1
        ? `${e.name || `Employee #${idx + 1}`}: ${formatINR(perDay)}/day (Total: ${formatINR(empLimits[idx])} for ${days} days)${tag}`
        : `${e.name || `Employee #${idx + 1}`}: ${formatINR(perDay)}/day${tag}`;
    });

    const combinedLimitText = isLodging
      ? `Combined Whole Claim Limit: ${formatINR(grandPolicyLimit)} (${days} day${days > 1 ? 's' : ''})`
      : `Combined daily limit: ${formatINR(grandPolicyLimit)}`;

    let combinedExplanation = '';
    const perEmpExcessText = ordered.length > 1 && grandExcess > 0
      ? ` (${formatINR(round2(grandExcess / ordered.length))} excess per employee)`
      : '';

    const formulaPrefix = (isLodging && lodgingResult.formula) ? `${lodgingResult.formula}.\n\n` : '';

    if (grandExcess > 0) {
      combinedExplanation = `Individual limits per day:\n• ${empLines.join('\n• ')}\n\n${formulaPrefix}${combinedLimitText}.\n\nClaimed bill: ${formatINR(grandRequested)}. Therefore, ${formatINR(grandAllowed)} is allowed and ${formatINR(grandExcess)} is excess beyond policy limit${perEmpExcessText}.`;
    } else {
      combinedExplanation = `Individual limits per day:\n• ${empLines.join('\n• ')}\n\n${formulaPrefix}${combinedLimitText}.\n\nClaimed bill: ${formatINR(grandRequested)}. Since your bill is within your ${isLodging ? 'combined whole claim limit' : 'combined daily limit'}, ${formatINR(grandAllowed)} is fully allowed.`;
    }

    if (relativeStay) {
      combinedExplanation = `Individual limits per day:\n• ${empLines.join('\n• ')}\n\n${formulaPrefix}${combinedLimitText}.\n\nStay with relative: no hotel bill required. ${formatINR(grandAllowed)} is allowed.`;
    }

    const combinedFormula = lodgingResult.formula;

    for (let i = 0; i < employeeClaims.length; i++) {
      const ec = employeeClaims[i];
      if (ec.items && ec.items[0]) {
        const perDay = days > 0 ? round2(empLimits[i] / days) : empLimits[i];
        ec.items[0].perDayLimit = relativeStay ? round2(perDay * (relativeStayPercent / 100)) : perDay;
        ec.items[0].plainExplanation = combinedExplanation;
        ec.items[0].formula = combinedFormula;
        ec.items[0].limitText = `${formatINR(grandPolicyLimit)} (${days} days combined)`;
        if (ec.items[0].calculationBreakdown) {
          ec.items[0].calculationBreakdown.plainExplanation = combinedExplanation;
          ec.items[0].calculationBreakdown.formula = combinedFormula;
        }
      }
    }
  } else if (isLodging && employeeClaims[0]?.items?.[0]) {
    const e = ordered[0];
    const perDay = days > 0 ? round2(empLimits[0] / days) : empLimits[0];
    const effLimit = lodgingResult.effectiveLimits[0];
    const effPerDay = days > 0 ? round2(effLimit / days) : effLimit;
    const empLine = relativeStay
      ? (days > 1
        ? `${e?.name || 'Employee'}: ${formatINR(effPerDay)}/day (Total: ${formatINR(effLimit)} for ${days} days, ${relativeStayPercent}% of ${formatINR(perDay)}/day)`
        : `${e?.name || 'Employee'}: ${formatINR(effPerDay)}/day (${relativeStayPercent}% of ${formatINR(perDay)}/day)`)
      : (days > 1
        ? `${e?.name || 'Employee'}: ${formatINR(perDay)}/day (Total: ${formatINR(empLimits[0])} for ${days} days)`
        : `${e?.name || 'Employee'}: ${formatINR(perDay)}/day`);

    const baseLimitText = days > 1
      ? `Whole Claim Limit: ${formatINR(grandPolicyLimit)} (${days} days at ${formatINR(perDay)}/day)`
      : `Whole Claim Limit: ${formatINR(grandPolicyLimit)} (${formatINR(perDay)}/day)`;

    const limitText = relativeStay
      ? `${baseLimitText} — stay with relative: ${relativeStayPercent}% of ${formatINR(lodgingResult.baseTotalPolicyLimit)}`
      : baseLimitText;

    let singleExplanation = '';
    if (grandExcess > 0) {
      singleExplanation = `Individual limit per day:\n• ${empLine}\n\n${lodgingResult.formula}.\n\n${limitText}.\n\nClaimed bill: ${formatINR(grandRequested)}. Therefore, ${formatINR(grandAllowed)} is allowed and ${formatINR(grandExcess)} is excess beyond policy limit.`;
    } else {
      singleExplanation = `Individual limit per day:\n• ${empLine}\n\n${lodgingResult.formula}.\n\n${limitText}.\n\nClaimed bill: ${formatINR(grandRequested)}. Since your bill is within your policy limit, ${formatINR(grandAllowed)} is fully allowed.`;
    }

    if (relativeStay) {
      singleExplanation = `Individual limit per day:\n• ${empLine}\n\n${lodgingResult.formula}.\n\n${limitText}.\n\nStay with relative: no hotel bill required. ${formatINR(grandAllowed)} is allowed.`;
    }

    const singleFormula = lodgingResult.formula;

    employeeClaims[0].items[0].plainExplanation = singleExplanation;
    employeeClaims[0].items[0].formula = singleFormula;
    employeeClaims[0].items[0].limitText = limitText;
    employeeClaims[0].items[0].perDayLimit = relativeStay ? round2(perDay * (relativeStayPercent / 100)) : perDay;
    if (employeeClaims[0].items[0].calculationBreakdown) {
      employeeClaims[0].items[0].calculationBreakdown.plainExplanation = singleExplanation;
      employeeClaims[0].items[0].calculationBreakdown.formula = singleFormula;
    }
  } else if (!isComb && ordered.length > 1 && employeeClaims[0]?.items?.[0]) {
    const expl = `Claimed bill: ${formatINR(grandRequested)}. All payment of ${formatINR(grandAllowed)} is fully allowed across ${ordered.length} employees (${formatINR(round2(grandAllowed / ordered.length))} each).`;
    for (const ec of employeeClaims) {
      if (ec.items && ec.items[0]) {
        ec.items[0].plainExplanation = expl;
      }
    }
  }

  const primaryPerDay = isLodging && empLimits.length > 0
    ? (days > 0 ? round2(empLimits[0] / days) : empLimits[0])
    : null;

  return {
    employeeClaims,
    numberOfDays: days,
    numberOfNights: days,
    isSharedLodging: shared,
    grandRequested,
    grandAllowed,
    grandExcess,
    grandPolicyLimit,
    perDayLimit: relativeStay && primaryPerDay !== null ? round2(primaryPerDay * (relativeStayPercent / 100)) : primaryPerDay,
    plainExplanation: employeeClaims[0]?.items?.[0]?.plainExplanation || null,
  };
}

/** Rebuild the API input shape from a stored claim (used when submitting a saved draft). */
function claimToInput(claim) {
  const key = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '');
  const storedEntries = (Array.isArray(claim.entries) && claim.entries.length > 0)
    ? claim.entries
    : (claim.employeeClaims?.[0]?.items || []);
  const entries = storedEntries.map((e) => {
    const isStoredPurchase = String(e.otherSubType || '').toUpperCase() === 'PURCHASE';
    return {
      expenseType: e.expenseType,
      otherSubType: e.otherSubType || '',
      barcodeNumber: isStoredPurchase ? (e.barcodeNumber || '') : '',
      quantity: isStoredPurchase ? toStr(e.quantity, 100).trim() : '',
      requestedAmount: e.requestedAmount,
      remark: e.remark || e.description,
      vehicle: e.vehicle,
      distanceKm: e.distanceKm,
      visitType: (e.visitType === 'VISIT' || e.isVisit || claim.visitType === 'VISIT' || claim.isVisit) ? 'VISIT' : 'NO_VISIT',
      isVisit: Boolean(e.isVisit || e.visitType === 'VISIT' || claim.isVisit || claim.visitType === 'VISIT'),
      serviceReports: (e.serviceReports || []).map((r) => (r.toObject ? r.toObject() : r)),

      numberPlatePhotos: (e.numberPlatePhotos || []).map((r) => (r.toObject ? r.toObject() : r)),
      startKmPhotos: (e.startKmPhotos || []).map((r) => (r.toObject ? r.toObject() : r)),
      endKmPhotos: (e.endKmPhotos || []).map((r) => (r.toObject ? r.toObject() : r)),
      receipts: (e.receipts || e.attachments || []).map((r) => (r.toObject ? r.toObject() : r)),
    };
  });

  return normalizeInput({
    claimMode: claim.claimMode || 'NORMAL',
    visitType: claim.visitType || (claim.isVisit ? 'VISIT' : undefined),
    isVisit: claim.isVisit,
    claimDate: key(claim.claimDate),
    fromDate: key(claim.fromDate),
    toDate: key(claim.toDate),
    stayType: claim.stayType || '',
    numberOfEmployees: claim.employeeCount || (claim.employeeClaims || []).length,
    employeeIds: (claim.employeeClaims || []).map((ec) => String(ec.employee?.employeeId?._id || ec.employee?.employeeId)),
    customerName: claim.trip?.customerName,
    customerId: claim.trip?.customerId ? String(claim.trip.customerId) : null,
    destinationCity: claim.trip?.destination,
    expenseType: claim.claimType,
    requestedAmount: claim.grandRequested,
    remark: claim.trip?.purpose,
    entries,
    receipts: (claim.receipts || []).map((r) => (r.toObject ? r.toObject() : r)),
    serviceReports: (claim.serviceReports || []).map((r) => (r.toObject ? r.toObject() : r)),
    fullPayment: {
      requested: !!claim.fullPayment?.requested,
      reason: claim.fullPayment?.reason,
    },
    approverId: claim.managerApproval?.approver ? String(claim.managerApproval.approver._id || claim.managerApproval.approver) : '',
  });
}

module.exports = {
  round2,
  NON_BLOCKING_STATUSES,
  DEFAULT_CLAIM_RULES,
  DEFAULT_RECEIPT_RULES,
  DEFAULT_FULL_PAYMENT_RULES,
  parseDateOnly,
  todayDateOnly,
  addDays,
  formatDate,
  formatINR,
  daysBetween,
  nightsBetween,
  deadlineFrom,
  resolvePolicyConfig,
  resolveTypeConfig,
  getPolicyForDate,
  normalizeInput,
  validateClaimInput,
  splitAmount,
  computePayable,
  approvalKindFor,
  routeSubmission,
  evaluateDeadline,
  loadEmployees,
  getOutstationInfo,
  evaluateBusinessRules,
  calculateAmounts,
  claimToInput,
  STAY_TYPES,
  parseRelativeStayPercent,
  resolveRelativeStayPercent,
  applyRelativeStayPercent,
  computeRelativeStayPolicyLimit,
  computeLodgingPolicyLimit,
  ACTIVE_USER_EXCLUDED,
};
