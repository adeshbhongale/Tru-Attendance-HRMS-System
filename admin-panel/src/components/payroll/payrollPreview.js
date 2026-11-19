/**
 * Single column configuration array (19-column order, left-to-right)
 * and pure client-side row preview calculator mirroring backend payrollCalculator.js (Section 3.2-3.5).
 * Server response remains the authoritative source of truth after each PATCH.
 */

export const PAYROLL_COLUMNS = [
  { key: 'serial', label: 'Sr. No.', stickyLeft: 0, widthClass: 'w-[60px] min-w-[60px]', align: 'center', editable: false },
  { key: 'employeeId', label: 'Employee ID', stickyLeft: 60, widthClass: 'w-[120px] min-w-[120px]', align: 'left', editable: false },
  { key: 'name', label: 'Name', stickyLeft: 180, widthClass: 'w-[190px] min-w-[190px]', align: 'left', editable: false, lastSticky: true },
  { key: 'designation', label: 'Designation', widthClass: 'min-w-[140px]', align: 'left', editable: false },
  { key: 'department', label: 'Department', widthClass: 'min-w-[130px]', align: 'left', editable: false },
  { key: 'dateOfJoining', label: 'Date of Joining', widthClass: 'min-w-[120px]', align: 'center', editable: false },
  { key: 'uan', label: 'UAN No.', widthClass: 'min-w-[145px]', align: 'left', editable: true },
  { key: 'basicPay', label: 'Basic Pay', widthClass: 'min-w-[125px]', align: 'right', editable: true, sumInTotals: true },
  { key: 'daysOfMonth', label: 'Days of Month', widthClass: 'min-w-[95px]', align: 'center', editable: false },
  { key: 'sunday', label: 'Sunday', widthClass: 'min-w-[80px]', align: 'center', editable: false },
  { key: 'payPerDay', label: 'Pay Per Day', widthClass: 'min-w-[105px]', align: 'right', editable: false },
  { key: 'workingDays', label: 'Working Days', widthClass: 'min-w-[100px]', align: 'center', editable: false },
  { key: 'total', label: 'Total', widthClass: 'min-w-[115px]', align: 'right', editable: false, sumInTotals: true },
  { key: 'leaves', label: 'Leaves', widthClass: 'min-w-[105px]', align: 'center', editable: true },
  { key: 'halfDaysCount', label: 'Half Days', widthClass: 'min-w-[105px]', align: 'center', editable: false },
  { key: 'lateMarksCount', label: 'Late Marks', widthClass: 'min-w-[105px]', align: 'center', editable: false },
  { key: 'leaveDeduction', label: 'Leave', group: 'Deduction', widthClass: 'min-w-[105px]', align: 'right', editable: false, sumInTotals: true },
  { key: 'lateDeduction', label: 'Late Marks', group: 'Deduction', widthClass: 'min-w-[145px]', align: 'right', editable: true, sumInTotals: true },
  { key: 'netPay', label: 'Net Pay', widthClass: 'min-w-[120px]', align: 'right', editable: false, sumInTotals: true },
];

const LATE_FLAT_AMOUNT = 300;
const PAY_PER_DAY_DIVISOR = 26;

function roundUpRupee(val) {
  const n = Number(val);
  if (!Number.isFinite(n)) return 0;
  return Math.ceil(Math.round(n * 1e6) / 1e6);
}

export function computeDisplayHalfDays({
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

/**
 * Instant client-side preview calculation for a row (mirrors backend Section 3.2-3.5).
 * @param {Object} row - Current row object from API
 * @param {Object} patch - Partial edit ({ basicPay?, uan?, leaves?, lateDeductionOverride? })
 * @returns {Object} Updated row object with recalculated integers
 */
export function recalculateRowPreview(row, patch = {}, settings = {}) {
  const nextUan = patch.uan !== undefined ? String(patch.uan) : (row.uan || '');

  const rawBasic = patch.basicPay !== undefined ? Number(patch.basicPay) : Number(row.basicPay);
  const basicPay = Number.isFinite(rawBasic) && rawBasic > 0 ? roundUpRupee(rawBasic) : 0;

  const workingDays = Number(row.workingDays) > 0 ? Math.round(Number(row.workingDays)) : 0;

  const leavesComputed = Number(row.leavesComputed) > 0
    ? Math.floor(Number(row.leavesComputed))
    : 0;
  const leavesComputedExact =
    row.leavesComputedExact !== undefined && Number.isFinite(Number(row.leavesComputedExact))
      ? Number(row.leavesComputedExact)
      : leavesComputed;
  let leavesOverridden = Boolean(row.leavesOverridden);
  let leaves = Number.isFinite(Number(row.leaves)) && Number(row.leaves) > 0
    ? Math.floor(Number(row.leaves))
    : 0;

  if ('leaves' in patch) {
    if (patch.leaves === null || patch.leaves === undefined) {
      leavesOverridden = false;
      leaves = leavesComputed;
    } else {
      const rawLeaves = Number(patch.leaves);
      leavesOverridden = true;
      leaves = Number.isFinite(rawLeaves) && rawLeaves > 0
        ? Math.floor(rawLeaves)
        : 0;
    }
  }

  const effectiveLeaveUnits = leavesOverridden ? leaves : leavesComputedExact;

  const flatDays = Number(row.lateCounts?.flatDays) || 0;
  const halfDays = Number(row.lateCounts?.halfDays) || 0;

  // 3.2 Pay (Pay Per Day = Basic Pay / static 26 working days)
  const payPerDayExact = basicPay / PAY_PER_DAY_DIVISOR;
  const payPerDay = roundUpRupee(payPerDayExact);
  const total = workingDays > 0 ? roundUpRupee(payPerDay * workingDays) : 0;

  // 3.3 Leave deduction
  const leaveDeduction = roundUpRupee(effectiveLeaveUnits * payPerDayExact);

  // 3.4 Late-marks deduction
  const flatAmount = Number.isFinite(Number(settings?.lateFlatAmount)) && Number(settings?.lateFlatAmount) >= 0
    ? Number(settings.lateFlatAmount)
    : LATE_FLAT_AMOUNT;
  const lateDeductionComputed = roundUpRupee(
    flatDays * flatAmount + (halfDays * payPerDayExact) / 2
  );

  let lateDeductionOverridden = Boolean(row.lateDeductionOverridden);
  let lateDeduction = lateDeductionOverridden ? roundUpRupee(Number(row.lateDeduction) || 0) : lateDeductionComputed;

  if ('lateDeductionOverride' in patch) {
    if (patch.lateDeductionOverride === null || patch.lateDeductionOverride === undefined) {
      lateDeductionOverridden = false;
      lateDeduction = lateDeductionComputed;
    } else {
      const ov = Number(patch.lateDeductionOverride);
      lateDeductionOverridden = true;
      lateDeduction = Number.isFinite(ov) && ov > 0 ? roundUpRupee(ov) : 0;
    }
  }

  // 3.5 Net pay (uses rounded displayed values; never clamped to 0)
  const netPay = total - leaveDeduction - lateDeduction;

  const shiftHalfDays = Number(row.halfDayLeaves?.total) || 0;
  const { extraLeaveHalfDays, totalHalfDays } = computeDisplayHalfDays({
    lateHalfDays: halfDays,
    shiftHalfDays,
    leavesComputedExact,
    leavesOverridden,
  });

  return {
    ...row,
    uan: nextUan,
    basicPay,
    payPerDay,
    leaves,
    leavesComputed,
    leavesOverridden,
    extraLeaveHalfDays,
    totalHalfDays,
    total,
    leaveDeduction,
    lateDeduction,
    lateDeductionComputed,
    lateDeductionOverridden,
    netPay,
  };
}

/**
 * Sum currency columns across a list of rows.
 */
export function computeTotals(rows = []) {
  return rows.reduce(
    (acc, r) => ({
      basicPay: acc.basicPay + (Number(r.basicPay) || 0),
      total: acc.total + (Number(r.total) || 0),
      leaveDeduction: acc.leaveDeduction + (Number(r.leaveDeduction) || 0),
      lateDeduction: acc.lateDeduction + (Number(r.lateDeduction) || 0),
      netPay: acc.netPay + (Number(r.netPay) || 0),
    }),
    { basicPay: 0, total: 0, leaveDeduction: 0, lateDeduction: 0, netPay: 0 }
  );
}

/**
 * Format integer rupees with Indian grouping (e.g. 15,000 or -800).
 */
export function formatRupees(val) {
  const n = Math.round(Number(val) || 0);
  return n.toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

/**
 * Format joiningDate as DD-MM-YYYY in IST (Asia/Kolkata).
 */
export function formatJoiningDateIST(dateVal) {
  if (!dateVal) return '-';
  const d = dateVal instanceof Date ? dateVal : new Date(dateVal);
  if (Number.isNaN(d.getTime())) return '-';
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).formatToParts(d);
  const day = parts.find((p) => p.type === 'day')?.value || '01';
  const month = parts.find((p) => p.type === 'month')?.value || '01';
  const year = parts.find((p) => p.type === 'year')?.value || '1970';
  return `${day}-${month}-${year}`;
}

/**
 * Human-readable tooltip explaining computed late-marks breakdown.
 */
export function buildLateTooltip(row, settings = {}) {
  const flatDays = Number(row.lateCounts?.flatDays) || 0;
  const halfDays = Number(row.lateCounts?.halfDays) || 0;
  const lateStartTime = settings?.lateStartTime || '09:30';
  const halfDayTime = settings?.halfDayTime || '10:30';
  const flatAmount = Number.isFinite(Number(settings?.lateFlatAmount)) && Number(settings?.lateFlatAmount) >= 0
    ? Number(settings.lateFlatAmount)
    : LATE_FLAT_AMOUNT;
  const halfDayUnit = Math.round((Number(row.basicPay) || 0) / PAY_PER_DAY_DIVISOR / 2);
  const computed = formatRupees(row.lateDeductionComputed || 0);

  if (flatDays === 0 && halfDays === 0) {
    return row.lateDeductionOverridden
      ? `Computed: ₹0 (0 late days) · Overridden to ₹${formatRupees(row.lateDeduction)}`
      : `0 late days (no punch-ins after ${lateStartTime} IST)`;
  }

  const segments = [];
  if (flatDays > 0) {
    segments.push(`${flatDays} day${flatDays === 1 ? '' : 's'} after ${lateStartTime} × ₹${formatRupees(flatAmount)}`);
  }
  if (halfDays > 0) {
    segments.push(`${halfDays} day${halfDays === 1 ? '' : 's'} after ${halfDayTime} × ₹${formatRupees(halfDayUnit)}`);
  }

  const base = `${segments.join(' + ')} = ₹${computed}`;
  return row.lateDeductionOverridden
    ? `${base} (Overridden to ₹${formatRupees(row.lateDeduction)})`
    : base;
}
