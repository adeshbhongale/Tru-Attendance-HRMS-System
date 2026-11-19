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
 * Round up any fractional rupee value (e.g. 86.2 -> 87) while guarding against
 * binary floating-point noise (e.g. 100.00000000000001 -> 100).
 */
function roundUpRupee(val) {
  const n = Number(val);
  if (!Number.isFinite(n)) return 0;
  return Math.ceil(Math.round(n * 1e6) / 1e6);
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
  const windowWidth = Math.max(0, base.halfDayMinutes - base.lateStartMinutes);
  const halfDaySession = context?.halfDaySession || null;
  const shift = context?.shift || null;

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
    const s1Start = shift?.firstSession?.startTime || base.lateStartTime || '09:30';
    const lateStartMinutes = parseTime(s1Start, base.lateStartTime);
    return {
      lateStartMinutes,
      halfDayMinutes: lateStartMinutes + windowWidth,
    };
  }

  return {
    lateStartMinutes: base.lateStartMinutes,
    halfDayMinutes: base.halfDayMinutes,
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
  lateDeductionOverride = null,
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

  const { lateFlatAmount } = resolveSettings(settings);

  const workingDays = Math.max(0, safeCountedDays - safeSunday);

  // Full precision internal pay per day (Basic Pay / static 26 working days)
  const payPerDayExact = safeBasicPay / PAY_PER_DAY_DIVISOR;

  // Displayed pay per day (rounded up integer)
  const payPerDay = roundUpRupee(payPerDayExact);

  // Gross pay (Pay Per Day * Working Days)
  const total = workingDays > 0 ? roundUpRupee(payPerDay * workingDays) : 0;

  // Leave deduction (uses exact leave units when auto-computed from half-day / 2.5x rules, or integer safeLeaves when manually entered)
  const leaveDeduction = roundUpRupee(effectiveLeaveUnits * payPerDayExact);

  // Computed late-marks deduction (sum exact half-day amounts, round up once)
  const lateDeductionComputed = roundUpRupee(
    safeFlatDays * lateFlatAmount + (safeHalfDays * payPerDayExact) / 2
  );

  // Override handling
  const lateDeductionOverridden =
    lateDeductionOverride !== null &&
    lateDeductionOverride !== undefined &&
    Number.isFinite(Number(lateDeductionOverride)) &&
    Number(lateDeductionOverride) >= 0;

  const lateDeduction = lateDeductionOverridden
    ? roundUpRupee(Number(lateDeductionOverride))
    : lateDeductionComputed;

  // Net pay uses rounded displayed values so every row visibly adds up; never clamped to 0
  const netPay = total - leaveDeduction - lateDeduction;

  return {
    basicPay: safeBasicPay,
    daysOfMonth: safeDaysOfMonth,
    payPerDay,
    sunday: safeSunday,
    leaves: safeLeaves,
    workingDays,
    total,
    leaveDeduction,
    lateDeduction,
    lateDeductionComputed,
    lateDeductionOverridden,
    lateCounts: {
      flatDays: safeFlatDays,
      halfDays: safeHalfDays,
    },
    netPay,
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
  computeDisplayHalfDays,
  classifyPunchIn,
  summarizePunchIns,
  resolveSettings,
  parseTime,
  roundUpRupee,
  DEFAULT_SETTINGS,
  PAY_PER_DAY_DIVISOR,
};
