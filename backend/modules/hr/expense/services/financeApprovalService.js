const mongoose = require('mongoose');
const ExpenseFinanceHead = require('../models/ExpenseFinanceHead');
const User = require('../../../../models/User');
const { ACTIVE_USER_EXCLUDED, normalizeClaimTypeCode, resolveCfoApprovalConfig } = require('./claimRules');

/**
 * 2nd approval stage (CFO / Finance Head) for claims configured to require CFO approval
 * (by default Full Payment and Stock Purchase claims, or any claim types selected by Admin).
 * Flow: Reporting Manager (1st approval) -> CFO / Finance Head (2nd approval) -> Accounts Admin.
 * The Finance Head is configured strictly per company on the Expense Management page.
 */

const isStockPurchaseClaim = (claim) => {
  if (!claim) return false;
  const isSp = (t, sub) => normalizeClaimTypeCode(t, sub) === 'STOCK_PURCHASE';
  if (isSp(claim.claimType, claim.otherSubType)) return true;
  if (isSp(claim.expenseType, claim.otherSubType)) return true;
  if (Array.isArray(claim.entries) && claim.entries.some((e) => isSp(e?.expenseType, e?.otherSubType))) return true;
  return Array.isArray(claim.employeeClaims)
    && claim.employeeClaims.some((ec) => Array.isArray(ec?.items) && ec.items.some((it) => isSp(it?.expenseType, it?.otherSubType)));
};

/**
 * Extract all normalized claim/entry type codes present on a claim.
 */
const extractClaimTypeCodes = (claim) => {
  if (!claim) return [];
  const codes = new Set();
  const add = (t, sub) => {
    const c = normalizeClaimTypeCode(t, sub);
    if (c && c !== 'COMBINE' && c !== 'COMBINED') codes.add(c);
  };
  add(claim.claimType, claim.otherSubType);
  add(claim.expenseType, claim.otherSubType);
  if (String(claim.claimMode || '').toUpperCase() === 'LODGING') {
    codes.add('LODGING');
    if (claim.includeFood) codes.add('FOOD');
  }
  if (Array.isArray(claim.entries)) {
    claim.entries.forEach((e) => e && add(e.expenseType || e.claimType, e.otherSubType));
  }
  if (Array.isArray(claim.employeeClaims)) {
    claim.employeeClaims.forEach((ec) => {
      if (Array.isArray(ec?.items)) {
        ec.items.forEach((it) => it && add(it.expenseType || it.claimType, it.otherSubType));
      }
    });
  }
  return [...codes];
};

/**
 * Check whether a claim requires CFO / Finance Head 2nd approval based on dynamic configuration.
 * Only claims selected in `cfoApprovalConfig` (Full Payment if `applyOnFullPayment` is true,
 * and claim types in `applicableClaimTypes`) require CFO 2nd approval.
 */
const needsFinanceApproval = (claim, options = {}) => {
  if (!claim) return false;
  const finStatus = String(claim?.financeApproval?.status || '').toUpperCase();
  if (finStatus === 'PENDING' || finStatus === 'APPROVED' || finStatus === 'REJECTED') {
    return true;
  }

  const cfoCfg = resolveCfoApprovalConfig(claim, options);
  if (cfoCfg.enabled === false) return false;

  if (Boolean(claim?.fullPayment?.requested || claim?.requestFullPayment)) {
    return cfoCfg.applyOnFullPayment !== false;
  }

  // If the claim bypassed 1st approval via a direct payment limit rule, it goes straight to Accounts
  const mgrKind = String(claim?.managerApproval?.kind || '').toUpperCase();
  const mgrStatus = String(claim?.managerApproval?.status || '').toUpperCase();
  if (
    mgrKind === 'NONE' &&
    mgrStatus === 'NOT_REQUIRED' &&
    !claim?.managerApproval?.decidedAt &&
    String(claim?.status || '').toUpperCase() === 'SUBMITTED'
  ) {
    return false;
  }

  const cfoTypes = new Set(
    (cfoCfg.applicableClaimTypes || []).map((t) => normalizeClaimTypeCode(t)).filter(Boolean)
  );
  if (cfoTypes.size === 0) return false;

  const claimCodes = extractClaimTypeCodes(claim);
  return claimCodes.some((code) => cfoTypes.has(code));
};

/** Claim is currently waiting for the CFO / Finance Head (2nd approval). */
const isFinanceStage = (claim) =>
  String(claim?.status || '').toUpperCase() === 'APPROVAL_PENDING'
  && String(claim?.financeApproval?.status || '').toUpperCase() === 'PENDING';

const toObjectIdOrNull = (id) => {
  if (!id) return null;
  if (id instanceof mongoose.Types.ObjectId || id._bsontype === 'ObjectId') return id;
  const raw = typeof id === 'object' ? (id._id || id.id || null) : id;
  if (!raw) return null;
  if (raw instanceof mongoose.Types.ObjectId || raw._bsontype === 'ObjectId') return raw;
  if (typeof raw === 'object') return null;
  const str = String(raw).trim();
  return mongoose.Types.ObjectId.isValid(str) ? new mongoose.Types.ObjectId(str) : null;
};

const belongsToCompany = (emp, companyId) => {
  const cid = toObjectIdOrNull(companyId);
  if (!emp || !cid) return false;
  const empComp = toObjectIdOrNull(emp.companyId) || toObjectIdOrNull(emp.company);
  return Boolean(empComp && String(empComp) === String(cid));
};

/** Configured Finance Head record of the company (populated employee), or null. */
async function getFinanceHeadRecord(companyId) {
  const cid = toObjectIdOrNull(companyId);
  if (!cid) return null;
  const rec = await ExpenseFinanceHead.findOne({ companyId: cid })
    .populate('employee', 'name employeeIdCode department designation email status companyId company')
    .lean();
  if (!rec || !rec.employee || !belongsToCompany(rec.employee, cid)) return null;
  return rec;
}

/** Active Finance Head user of the company, or null when not configured / inactive. */
async function getFinanceHead(companyId) {
  const rec = await getFinanceHeadRecord(companyId);
  const emp = rec?.employee;
  if (!emp || !emp._id) return null;
  if (ACTIVE_USER_EXCLUDED.includes(emp.status)) return null;
  return emp;
}

/** Is this user the Finance Head of the given company? (Strictly company-wise) */
async function isFinanceHeadUser(userId, companyId) {
  const uid = toObjectIdOrNull(userId);
  const cid = toObjectIdOrNull(companyId);
  if (!uid || !cid) return false;
  return Boolean(await ExpenseFinanceHead.exists({ companyId: cid, employee: uid }));
}

/** Active employee of the company that can be selected as Finance Head. */
async function findSelectableEmployee(companyId, employeeId) {
  const cid = toObjectIdOrNull(companyId);
  const eid = toObjectIdOrNull(employeeId);
  if (!cid || !eid) return null;
  return User.findOne({
    _id: eid,
    $or: [{ companyId: cid }, { company: cid }],
    status: { $nin: ACTIVE_USER_EXCLUDED },
    role: { $nin: ['superadmin', 'super_admin', 'TCSA1'] },
  }).select('name employeeIdCode department designation email status companyId company').lean();
}

module.exports = {
  isStockPurchaseClaim,
  extractClaimTypeCodes,
  needsFinanceApproval,
  isFinanceStage,
  getFinanceHeadRecord,
  getFinanceHead,
  isFinanceHeadUser,
  findSelectableEmployee,
};
