const mongoose = require('mongoose');
const ExpenseClaim = require('../models/ExpenseClaim');

/**
 * Shared food entitlement service.
 *
 * ONE source of truth for "how much of the daily food allowance is still available" used by
 * normal Food claims AND the Food section of Lodging claims (and any future claim type that
 * books FOOD items). Everything is date-wise:
 *
 *   Remaining Daily Entitlement = max(0, Daily Limit(date) − Existing Eligible Food Consumption(date))
 *   Remaining Food Entitlement  = Σ Remaining Daily Entitlement over the selected dates
 *
 * Consumption = the policy-recognised (allowed) amount of FOOD items on claims whose status
 * reserves entitlement. Draft / Returned / Rejected / Cancelled claims never consume, so a
 * rejection or cancellation automatically releases the reservation.
 *
 * Dates are calendar dates stored as UTC midnight (same convention as claimDate / fromDate).
 */

const DAY_MS = 86400000;

// Claims in these statuses neither block nor consume entitlement (single list shared with claimRules).
const NON_CONSUMING_STATUSES = ['DRAFT', 'RETURNED', 'HR_REJECTED', 'ACCOUNTS_REJECTED', 'REJECTED', 'CANCELLED'];

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const toTime = (d) => (d instanceof Date ? d.getTime() : new Date(d).getTime());

/** YYYY-MM-DD of a UTC-midnight calendar date. */
const dateKey = (d) => new Date(toTime(d)).toISOString().slice(0, 10);

/** Calendar date of a stored item date (legacy items may carry an IST timestamp). */
function calendarDate(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return null;
  if (d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0) return d;
  const ist = new Date(d.getTime() + 330 * 60000);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()));
}

/** Lodging nights: checkout − checkin. 28 → 30 Oct = 2 nights; same day = 0 nights. */
function lodgingNights(from, to) {
  if (!from || !to) return 0;
  const f = toTime(from);
  const t = toTime(to);
  if (isNaN(f) || isNaN(t)) return 0;
  return Math.max(0, Math.round((t - f) / DAY_MS));
}

/** Food days: inclusive calendar days. 28 → 30 Oct = 3 days; same day = 1 day; invalid = 0. */
function foodDays(from, to) {
  if (!from || !to) return 0;
  const f = toTime(from);
  const t = toTime(to);
  if (isNaN(f) || isNaN(t)) return 0;
  const diff = Math.round((t - f) / DAY_MS);
  return diff < 0 ? 0 : diff + 1;
}

/** Every calendar date from `from` to `to` inclusive (month / year transitions are plain UTC maths). */
function enumerateDates(from, to, max = 400) {
  const n = Math.min(foodDays(from, to), max);
  const start = toTime(from);
  return Array.from({ length: n }, (_, i) => new Date(start + i * DAY_MS));
}

/**
 * Pure allocation of a requested food amount against per-employee, per-date remaining entitlement.
 *
 * employees: [{ rows: [{ date, dailyLimit, priorConsumed }] }]  (rows in date order)
 * Allowed = min(requested, Σ remaining). The allowed amount is shared between employees in
 * proportion to their remaining entitlement and, inside an employee, consumes dates in order.
 * Excess is split equally between employees (same convention as the existing combined claims).
 */
function allocateFood({ requested, employees }) {
  const req = round2(Math.max(0, Number(requested) || 0));
  const emps = (employees || []).map((e) => {
    const rows = (e.rows || []).map((r) => {
      const dailyLimit = round2(Math.max(0, Number(r.dailyLimit) || 0));
      const priorConsumed = round2(Math.max(0, Number(r.priorConsumed) || 0));
      return { date: r.date, dailyLimit, priorConsumed, remaining: round2(Math.max(0, dailyLimit - priorConsumed)), allowed: 0 };
    });
    const sum = (k) => round2(rows.reduce((s, r) => s + r[k], 0));
    return { rows, entitlement: sum('dailyLimit'), priorConsumed: sum('priorConsumed'), remainingBefore: sum('remaining') };
  });

  const totalRemaining = round2(emps.reduce((s, e) => s + e.remainingBefore, 0));
  const allowed = round2(Math.min(req, totalRemaining));
  const excess = round2(Math.max(0, req - allowed));
  const n = emps.length || 1;

  // Proportional split of the allowed amount between employees (last absorbs paise rounding)
  let acc = 0;
  const allowedShares = emps.map((e, i) => {
    if (i === emps.length - 1) return round2(Math.min(e.remainingBefore, Math.max(0, allowed - acc)));
    const share = totalRemaining > 0 ? round2(allowed * (e.remainingBefore / totalRemaining)) : 0;
    acc = round2(acc + share);
    return share;
  });
  const excessBase = Math.floor(Math.round(excess * 100) / n);
  const excessShares = emps.map((_, i) => (i === n - 1 ? Math.round(excess * 100) - excessBase * (n - 1) : excessBase) / 100);

  const employeesOut = emps.map((e, i) => {
    let left = allowedShares[i];
    e.rows.forEach((r) => {
      const take = round2(Math.min(r.remaining, left));
      r.allowed = take;
      left = round2(left - take);
    });
    const empAllowed = round2(e.rows.reduce((s, r) => s + r.allowed, 0));
    return {
      requested: round2(empAllowed + excessShares[i]),
      allowed: empAllowed,
      excess: excessShares[i],
      entitlement: e.entitlement,
      priorConsumed: e.priorConsumed,
      remainingBefore: e.remainingBefore,
      remainingAfter: round2(e.remainingBefore - empAllowed),
      dailyAllocations: e.rows,
    };
  });

  return {
    requested: req,
    allowed,
    excess,
    entitlement: round2(emps.reduce((s, e) => s + e.entitlement, 0)),
    priorConsumed: round2(emps.reduce((s, e) => s + e.priorConsumed, 0)),
    remainingBefore: totalRemaining,
    remainingAfter: round2(totalRemaining - allowed),
    employees: employeesOut,
  };
}

/** Split an allowed total across food entries in entry order (first bills are allowed first). */
function allocateEntries(entries, allowedTotal) {
  let left = round2(allowedTotal);
  return (entries || []).map((e) => {
    const amt = round2(Number(e.requestedAmount) || 0);
    const allowedAmount = round2(Math.min(amt, Math.max(0, left)));
    left = round2(left - allowedAmount);
    return { ...e, requestedAmount: amt, allowedAmount, excessAmount: round2(amt - allowedAmount) };
  });
}

const oid = (id) => (id instanceof mongoose.Types.ObjectId ? id : new mongoose.Types.ObjectId(String(id)));

/**
 * Existing eligible food consumption per employee and date, across every claim type.
 * Returns Map<employeeId, Map<YYYY-MM-DD, amount>>.
 */
async function getFoodConsumption({ companyId, employeeIds, from, to, excludeClaimId = null, session = null }) {
  const out = new Map();
  const ids = [...new Set((employeeIds || []).map(String))].filter((id) => mongoose.Types.ObjectId.isValid(id));
  ids.forEach((id) => out.set(id, new Map()));
  if (!ids.length || !from || !to) return out;

  const start = new Date(toTime(from));
  const end = new Date(toTime(to));
  const filter = {
    status: { $nin: NON_CONSUMING_STATUSES },
    'employeeClaims.employee.employeeId': { $in: ids.map(oid) },
    'employeeClaims.items.expenseType': 'FOOD',
    $or: [
      { claimDate: { $gte: start, $lte: end } },
      { fromDate: { $lte: end }, toDate: { $gte: start } },
      // Legacy claims (before claimDate existed): match on the item date
      { claimDate: null, fromDate: null, 'employeeClaims.items.expenseDate': { $gte: new Date(start.getTime() - 330 * 60000), $lt: new Date(end.getTime() + DAY_MS) } },
    ],
  };
  if (companyId) filter.companyId = oid(companyId);
  if (excludeClaimId) filter._id = { $ne: oid(excludeClaimId) };

  let query = ExpenseClaim.find(filter).select('employeeClaims claimDate fromDate toDate').lean();
  if (session) query = query.session(session);
  const claims = await query;

  const startKey = dateKey(start);
  const endKey = dateKey(end);
  const add = (empId, key, amount) => {
    if (!out.has(empId) || key < startKey || key > endKey) return;
    const m = out.get(empId);
    m.set(key, round2((m.get(key) || 0) + (Number(amount) || 0)));
  };

  for (const c of claims) {
    for (const ec of c.employeeClaims || []) {
      const empId = String(ec.employee?.employeeId || '');
      if (!out.has(empId)) continue;
      for (const it of ec.items || []) {
        if (String(it.expenseType || '').toUpperCase() !== 'FOOD') continue;
        if (Array.isArray(it.dailyAllocations) && it.dailyAllocations.length) {
          it.dailyAllocations.forEach((a) => add(empId, dateKey(a.date), a.allowed));
        } else {
          const d = c.claimDate || calendarDate(it.expenseDate);
          if (d) add(empId, dateKey(d), it.allowedAmount);
        }
      }
    }
  }
  return out;
}

module.exports = {
  DAY_MS,
  NON_CONSUMING_STATUSES,
  dateKey,
  calendarDate,
  lodgingNights,
  foodDays,
  enumerateDates,
  allocateFood,
  allocateEntries,
  getFoodConsumption,
};

