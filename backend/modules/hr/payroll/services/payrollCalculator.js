/**
 * Pure payroll calculator — no DB, no Date.now().
 * Single source of truth for all payroll calculations.
 *
 * All currency values are whole rupees (integers).
 * Leaves is the only value that may have decimals (up to 2).
 */

const { isSundayIST, getISTMinutes, getISTDate, getISTDateKey } = require('./calendarService');

const PAY_PER_DAY_DIVISOR = 26;

/**
 * Round any fractional rupee value to the nearest whole rupee
 * (< 0.5 rounds down, >= 0.5 rounds up; e.g. 2.3 -> 2, 2.6 -> 3),
 * while guarding against binary floating-point noise.
 */
function roundUpRupee(val) {
  const n = Number(val);
  if (!Number.isFinite(n)) return 0;
  return Math.round(Math.round(n * 1e6) / 1e6);
}

const DEFAULT_SETTINGS = {
  lateStartTime: '09:30', // m <= 570 -> on time
  halfDayTime: '10:30',   // 571..630 -> flat amount; >= 631 -> half day
  lateFlatAmount: 300,
  approvedLeaveMultiplier: 1,
  uninformedAbsentMultiplier: 2,
  rejectedLeaveAbsentMultiplier: 2.5,
};

/**
 * Parse 'HH:MM' string into minutes since midnight.
 */
function parseTime(timeStr, fallbackStr) {
  const raw = typeof timeStr === 'string' && /^\d{1,2}:\d{2}$/.test(timeStr.trim())
    ? timeStr.trim()
    : fallbackStr;
  const [h, m] = raw.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Resolve late-mark threshold settings with safe defaults.
 */
function resolveSettings(settings = {}) {
  const lateStartMinutes = parseTime(settings?.lateStartTime, DEFAULT_SETTINGS.lateStartTime);
  const halfDayMinutes = parseTime(settings?.halfDayTime, DEFAULT_SETTINGS.halfDayTime);
  const pickNonNeg = (val, fallback) =>
    val !== undefined && val !== null && Number.isFinite(Number(val)) && Number(val) >= 0
      ? Number(val)
      : fallback;

  const lateFlatAmount = pickNonNeg(settings?.lateFlatAmount, DEFAULT_SETTINGS.lateFlatAmount);
  const approvedLeaveMultiplier = pickNonNeg(
    settings?.approvedLeaveMultiplier,
    DEFAULT_SETTINGS.approvedLeaveMultiplier
  );
  const uninformedAbsentMultiplier = pickNonNeg(
    settings?.uninformedAbsentMultiplier,
    DEFAULT_SETTINGS.uninformedAbsentMultiplier
  );
  const rejectedLeaveAbsentMultiplier = pickNonNeg(
    settings?.rejectedLeaveAbsentMultiplier,
    DEFAULT_SETTINGS.rejectedLeaveAbsentMultiplier
  );

  return {
    lateStartTime: settings?.lateStartTime || DEFAULT_SETTINGS.lateStartTime,
    halfDayTime: settings?.halfDayTime || DEFAULT_SETTINGS.halfDayTime,
    lateStartMinutes,
    halfDayMinutes,
    lateFlatAmount,
    approvedLeaveMultiplier,
    uninformedAbsentMultiplier,
    rejectedLeaveAbsentMultiplier,
  };
}

/**
 * Resolve effective { lateStartMinutes, halfDayMinutes } for a day, reusing Shift's
 * firstSession / secondSession when the employee has a Session 1 or Session 2 half-day leave.
 */
function resolveDayThresholds(settings = {}, context = {}) {
  const base = resolveSettings(settings);
  const halfDaySession = context?.halfDaySession || null;
  const shift = context?.shift || null;

  const effectiveBaseLate = shift?.payrollLateStartTime
    ? parseTime(shift.payrollLateStartTime, base.lateStartTime)
    : base.lateStartMinutes;
  const effectiveBaseHalf = shift?.payrollHalfDayTime
    ? parseTime(shift.payrollHalfDayTime, base.halfDayTime)
    : base.halfDayMinutes;
  const windowWidth = Math.max(0, effectiveBaseHalf - effectiveBaseLate);

  if (halfDaySession === 'Session 1') {
    // 1st shift on half-day leave -> working window is 2nd shift
    const s2Start = shift?.secondSession?.startTime || '14:00';
    const lateStartMinutes = parseTime(s2Start, '14:00');
    return {
      lateStartMinutes,
      halfDayMinutes: lateStartMinutes + windowWidth,
    };
  }

  if (halfDaySession === 'Session 2') {
    // 2nd shift on half-day leave -> working window is 1st shift
    const s1Start = shift?.firstSession?.startTime || shift?.payrollLateStartTime || base.lateStartTime || '09:30';
    const lateStartMinutes = parseTime(s1Start, base.lateStartTime);
    return {
      lateStartMinutes,
      halfDayMinutes: lateStartMinutes + windowWidth,
    };
  }

  return {
    lateStartMinutes: effectiveBaseLate,
    halfDayMinutes: effectiveBaseHalf,
  };
}

/**
 * Classify a punch-in timestamp (Date or ISO string) into 'NONE' | 'FLAT' | 'HALF_DAY'
 * using IST hour:minute (seconds truncated, never rounded). No grace period.
 */
function classifyPunchIn(punchInTime, settings = {}, context = {}) {
  if (!punchInTime) return 'NONE';
  const d = punchInTime instanceof Date ? punchInTime : new Date(punchInTime);
  if (Number.isNaN(d.getTime())) return 'NONE';

  const { lateStartMinutes, halfDayMinutes } = resolveDayThresholds(settings, context);
  const m = getISTMinutes(d);

  if (m <= lateStartMinutes) return 'NONE';
  if (m <= halfDayMinutes) return 'FLAT';
  return 'HALF_DAY';
}

/**
 * Pure helper to aggregate an array of punch-in timestamps (or { punchInTime, halfDaySession, shiftInfo } objects)
 * for one employee into { flatDays, halfDays }, ignoring Sundays (IST), dates outside [periodStart, periodEnd],
 * invalid/missing timestamps, and evaluating at most one punch-in per IST calendar day.
 */
function summarizePunchIns(
  punchInEntries = [],
  {
    periodStart = null,
    periodEnd = null,
    settings = {},
    userShift = null,
    halfDayLeaveSessionsByDay = null,
  } = {}
) {
  let flatDays = 0;
  let halfDays = 0;

  if (!Array.isArray(punchInEntries) || punchInEntries.length === 0) {
    return { flatDays, halfDays };
  }
  if (periodStart === null || periodEnd === null) {
    return { flatDays, halfDays };
  }

  // Deduplicate to earliest valid punch-in per IST calendar day
  const earliestByDay = new Map();
  for (const entry of punchInEntries) {
    if (!entry) continue;
    const isObj = typeof entry === 'object' && !(entry instanceof Date) && 'punchInTime' in entry;
    const raw = isObj ? entry.punchInTime : entry;
    if (!raw) continue;
    const d = raw instanceof Date ? raw : new Date(raw);
    if (Number.isNaN(d.getTime())) continue;

    if (isSundayIST(d)) continue;

    const istDate = getISTDate(d);
    if (istDate.getTime() < periodStart.getTime() || istDate.getTime() > periodEnd.getTime()) {
      continue;
    }

    const dayKey = getISTDateKey(d);
    const prev = earliestByDay.get(dayKey);
    if (!prev || d.getTime() < prev.d.getTime()) {
      earliestByDay.set(dayKey, {
        d,
        halfDaySession: (isObj ? entry.halfDaySession : null) || halfDayLeaveSessionsByDay?.get(dayKey) || null,
        shift: (isObj ? entry.shiftInfo : null) || userShift || null,
      });
    }
  }

  for (const item of earliestByDay.values()) {
    const tier = classifyPunchIn(item.d, settings, {
      halfDaySession: item.halfDaySession,
      shift: item.shift,
    });
    if (tier === 'FLAT') flatDays += 1;
    else if (tier === 'HALF_DAY') halfDays += 1;
  }

  return { flatDays, halfDays };
}

/**
 * Calculate Maharashtra Professional Tax (PT) per Maharashtra State Tax on
 * Professions, Trades, Callings and Employments Act, 1975, Schedule I, Entry 1
 * (amended w.e.f. 1 April 2023).
 *
 * Male:
 * - <= 7,500          : 0
 * - > 7,500 .. 10,000 : 175 / month
 * - > 10,000          : 200 / month (300 in February)
 *
 * Female:
 * - <= 25,000         : 0
 * - > 25,000          : 200 / month (300 in February)
 */
function calculateMaharashtraPT({ salary = 0, gender = 'Male', month = 1 } = {}) {
  const safeSalary = Number.isFinite(Number(salary)) && Number(salary) > 0 ? Number(salary) : 0;
  if (safeSalary <= 0) return 0;

  const isFebruary = Number(month) === 2;
  const isFemale = String(gender || '').trim().toLowerCase() === 'female';

  if (isFemale) {
    if (safeSalary <= 25000) return 0;
    return isFebruary ? 300 : 200;
  }

  if (safeSalary <= 7500) return 0;
  if (safeSalary <= 10000) return 175;
  return isFebruary ? 300 : 200;
}

/**
 * Calculate a single payroll row.
 *
 * @param {Object} params
 * @param {number} [params.basicPay=0]
 * @param {number} params.daysOfMonth - Calendar days in the selected month (28..31)
 * @param {number} [params.countedDays=0] - Employed days in the month
 * @param {number} [params.sunday=0] - Sundays inside the counted period
 * @param {number} [params.leaves=0] - Manual leaves (>= 0, up to 2 decimals)
 * @param {number} [params.flatDays=0] - Days in flat late tier
 * @param {number} [params.halfDays=0] - Days in half-day late tier
 * @param {number|null} [params.lateDeductionOverride=null] - Integer >= 0 or null
 * @param {Object} [params.settings={}] - Optional late-mark threshold overrides
 */
function calculateRow({
  basicPay = 0,
  daysOfMonth,
  countedDays = 0,
  sunday = 0,
  leaves = 0,
  leaveUnitsExact = null,
  flatDays = 0,
  halfDays = 0,
  approvedHalfDays = 0,
  lateDeductionOverride = null,
  halfDayDeductionOverride = null,
  otherDeduction = 0,
  employmentStatus = 'Training',
  gender = 'Male',
  month = 1,
  pf = 0,
  esic = 0,
  pt = null,
  ptOverride = null,
  statutoryTotalOverride = null,
  retentionOverride = null,
  advance = 0,
  loan = 0,
  settings = {},
} = {}) {
  const safeBasicPay = Number.isFinite(Number(basicPay)) && Number(basicPay) > 0
    ? roundUpRupee(Number(basicPay))
    : 0;
  const safeDaysOfMonth = Number.isFinite(Number(daysOfMonth)) && Number(daysOfMonth) > 0
    ? Math.round(Number(daysOfMonth))
    : 0;
  const safeCountedDays = Number.isFinite(Number(countedDays)) && Number(countedDays) > 0
    ? Math.round(Number(countedDays))
    : 0;
  const safeSunday = Number.isFinite(Number(sunday)) && Number(sunday) > 0
    ? Math.round(Number(sunday))
    : 0;
  // Leaves displayed/entered in the table are always non-negative integers (0, 1, 2, 3, ...)
  const safeLeaves = Number.isFinite(Number(leaves)) && Number(leaves) > 0
    ? Math.floor(Number(leaves))
    : 0;
  const effectiveLeaveUnits =
    leaveUnitsExact !== null &&
    leaveUnitsExact !== undefined &&
    Number.isFinite(Number(leaveUnitsExact)) &&
    Number(leaveUnitsExact) >= 0
      ? Number(leaveUnitsExact)
      : safeLeaves;
  const safeFlatDays = Number.isFinite(Number(flatDays)) && Number(flatDays) > 0
    ? Math.round(Number(flatDays))
    : 0;
  const safeHalfDays = Number.isFinite(Number(halfDays)) && Number(halfDays) > 0
    ? Math.round(Number(halfDays))
    : 0;
  const safeApprovedHalfDays = Number.isFinite(Number(approvedHalfDays)) && Number(approvedHalfDays) > 0
    ? Math.round(Number(approvedHalfDays))
    : 0;

  const { lateFlatAmount } = resolveSettings(settings);

  const workingDays = Math.max(0, safeCountedDays - safeSunday);

  // Full precision internal pay per day (Basic Pay / static 26 working days)
  const payPerDayExact = safeBasicPay / PAY_PER_DAY_DIVISOR;

  // Displayed pay per day (rounded up integer)
  const payPerDay = roundUpRupee(payPerDayExact);

  // Gross pay (exact Pay Per Day * Working Days, rounded up to whole rupee)
  const total = workingDays > 0 ? roundUpRupee(payPerDayExact * workingDays) : 0;

  // Leave deduction (uses exact leave units when auto-computed from half-day / 2.5x rules, or integer safeLeaves when manually entered)
  const leaveDeduction = roundUpRupee(effectiveLeaveUnits * payPerDayExact);

  // Computed half-day deduction (approved half-day leaves + late-arrival half-days)
  const halfDayDeductionComputed = roundUpRupee(
    ((safeHalfDays + safeApprovedHalfDays) * payPerDayExact) / 2
  );
  const halfDayDeductionOverridden =
    halfDayDeductionOverride !== null &&
    halfDayDeductionOverride !== undefined &&
    Number.isFinite(Number(halfDayDeductionOverride)) &&
    Number(halfDayDeductionOverride) >= 0;
  const halfDayDeduction = halfDayDeductionOverridden
    ? roundUpRupee(Number(halfDayDeductionOverride))
    : halfDayDeductionComputed;

  // Computed late-marks deduction (flat late marks only; half-days are in Half Day column)
  const lateDeductionComputed = roundUpRupee(safeFlatDays * lateFlatAmount);

  // Override handling
  const lateDeductionOverridden =
    lateDeductionOverride !== null &&
    lateDeductionOverride !== undefined &&
    Number.isFinite(Number(lateDeductionOverride)) &&
    Number(lateDeductionOverride) >= 0;

  const lateDeduction = lateDeductionOverridden
    ? roundUpRupee(Number(lateDeductionOverride))
    : lateDeductionComputed;

  // Other deduction (manual rupee deduction subtracted from Net Pay)
  const safeOtherDeduction = Number.isFinite(Number(otherDeduction)) && Number(otherDeduction) > 0
    ? roundUpRupee(Number(otherDeduction))
    : 0;

  // Net pay uses rounded displayed values so every row visibly adds up; never clamped to 0
  const netPay = total - leaveDeduction - halfDayDeduction - lateDeduction - safeOtherDeduction;

  // Employment status rule:
  // - Training / Probation -> Retention applies (5% of Basic Pay, editable); NO PF / ESIC / PT
  // - Permanent -> PF / ESIC / PT / Statutory Total apply (editable); NO Retention
  const normalizedEmploymentStatus = (() => {
    const s = String(employmentStatus || '').trim().toLowerCase();
    if (s === 'permanent') return 'Permanent';
    if (s === 'probation') return 'Probation';
    return 'Training';
  })();
  const isPermanent = normalizedEmploymentStatus === 'Permanent';

  // Statutory fields (only applicable for Permanent employees)
  const safePf = isPermanent && Number.isFinite(Number(pf)) && Number(pf) > 0 ? roundUpRupee(Number(pf)) : 0;
  const safeEsic = isPermanent && Number.isFinite(Number(esic)) && Number(esic) > 0 ? roundUpRupee(Number(esic)) : 0;

  // Maharashtra PT (auto-calculated for Permanent employees; editable via ptOverride)
  const ptComputed = isPermanent
    ? calculateMaharashtraPT({ salary: safeBasicPay, gender, month })
    : 0;
  const effectivePtOverride =
    ptOverride !== null && ptOverride !== undefined
      ? ptOverride
      : pt !== null && pt !== undefined
      ? pt
      : null;
  const ptOverridden =
    isPermanent &&
    effectivePtOverride !== null &&
    effectivePtOverride !== undefined &&
    Number.isFinite(Number(effectivePtOverride)) &&
    Number(effectivePtOverride) >= 0;
  const safePt = isPermanent
    ? ptOverridden
      ? roundUpRupee(Number(effectivePtOverride))
      : ptComputed
    : 0;

  const statutoryTotalComputed = isPermanent ? safePf + safeEsic + safePt : 0;
  const statutoryTotalOverridden =
    isPermanent &&
    statutoryTotalOverride !== null &&
    statutoryTotalOverride !== undefined &&
    Number.isFinite(Number(statutoryTotalOverride)) &&
    Number(statutoryTotalOverride) >= 0;
  const statutoryTotal = isPermanent
    ? statutoryTotalOverridden
      ? roundUpRupee(Number(statutoryTotalOverride))
      : statutoryTotalComputed
    : 0;

  // Final Pay = Net Pay - Statutory Total
  const finalPay = netPay - statutoryTotal;

  // Retention (only applicable for Training / Probation employees: 5% of whole Total, editable)
  const retentionComputed = isPermanent ? 0 : roundUpRupee(Math.max(0, total) * 0.05);
  const retentionOverridden =
    !isPermanent &&
    retentionOverride !== null &&
    retentionOverride !== undefined &&
    Number.isFinite(Number(retentionOverride)) &&
    Number(retentionOverride) >= 0;
  const retention = isPermanent
    ? 0
    : retentionOverridden
    ? roundUpRupee(Number(retentionOverride))
    : retentionComputed;

  // Advance & Loan
  const safeAdvance = Number.isFinite(Number(advance)) && Number(advance) > 0
    ? roundUpRupee(Number(advance))
    : 0;
  const safeLoan = Number.isFinite(Number(loan)) && Number(loan) > 0
    ? roundUpRupee(Number(loan))
    : 0;

  // Bank Pay = Final Pay - Retention - Advance - Loan
  const bankPay = finalPay - retention - safeAdvance - safeLoan;

  return {
    basicPay: safeBasicPay,
    daysOfMonth: safeDaysOfMonth,
    payPerDay,
    sunday: safeSunday,
    leaves: safeLeaves,
    workingDays,
    total,
    leaveDeduction,
    halfDayDeduction,
    halfDayDeductionComputed,
    halfDayDeductionOverridden,
    lateDeduction,
    lateDeductionComputed,
    lateDeductionOverridden,
    otherDeduction: safeOtherDeduction,
    lateCounts: {
      flatDays: safeFlatDays,
      halfDays: safeHalfDays,
    },
    netPay,
    employmentStatus: normalizedEmploymentStatus,
    pf: safePf,
    esic: safeEsic,
    pt: safePt,
    ptComputed,
    ptOverridden,
    statutoryTotal,
    statutoryTotalComputed,
    statutoryTotalOverridden,
    finalPay,
    retention,
    retentionComputed,
    retentionOverridden,
    advance: safeAdvance,
    loan: safeLoan,
    bankPay,
  };
}

/**
 * Compute displayed half-day counts combining late-arrival half-days,
 * shift half-day leaves, and any remaining 0.5 fractional leave rule (e.g. 2.5x rejected absent).
 */
function computeDisplayHalfDays({
  lateHalfDays = 0,
  shiftHalfDays = 0,
  leavesComputedExact = 0,
  leavesOverridden = false,
} = {}) {
  const safeLate = Number.isFinite(Number(lateHalfDays)) && Number(lateHalfDays) > 0 ? Math.round(Number(lateHalfDays)) : 0;
  const safeShift = Number.isFinite(Number(shiftHalfDays)) && Number(shiftHalfDays) > 0 ? Math.round(Number(shiftHalfDays)) : 0;
  let extraLeaveHalfDays = 0;

  if (!leavesOverridden) {
    const exact = Number.isFinite(Number(leavesComputedExact)) && Number(leavesComputedExact) > 0
      ? Number(leavesComputedExact)
      : 0;
    const frac = Math.round((exact - Math.floor(exact)) * 100) / 100;
    const fracHalfDays = frac >= 0.5 ? Math.round(frac * 2) : 0;
    extraLeaveHalfDays = Math.max(0, fracHalfDays - safeShift);
  }

  return {
    extraLeaveHalfDays,
    totalHalfDays: safeLate + safeShift + extraLeaveHalfDays,
  };
}

module.exports = {
  calculateRow,
  calculateMaharashtraPT,
  computeDisplayHalfDays,
  classifyPunchIn,
  summarizePunchIns,
  resolveSettings,
  parseTime,
  roundUpRupee,
  DEFAULT_SETTINGS,
  PAY_PER_DAY_DIVISOR,
};
