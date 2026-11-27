/**
 * Single column configuration array (19-column order, left-to-right)
 * and pure client-side row preview calculator mirroring backend payrollCalculator.js (Section 3.2-3.5).
 * Server response remains the authoritative source of truth after each PATCH.
 */

export const PAYROLL_COLUMNS = [
  { key: 'serial', label: 'Sr.', stickyLeft: 0, widthClass: 'w-[46px] min-w-[46px]', align: 'center', editable: false },
  { key: 'employeeId', label: 'Employee ID', stickyLeft: 46, widthClass: 'w-[104px] min-w-[104px]', align: 'left', editable: false },
  { key: 'name', label: 'Name', stickyLeft: 150, widthClass: 'w-[145px] min-w-[145px]', align: 'left', editable: false, lastSticky: true },
  { key: 'designation', label: 'Designation', widthClass: 'min-w-[105px] max-w-[135px]', align: 'left', editable: false },
  { key: 'department', label: 'Department', widthClass: 'min-w-[95px] max-w-[125px]', align: 'left', editable: false },
  { key: 'dateOfJoining', label: 'Date of Joining', widthClass: 'min-w-[88px]', align: 'center', editable: false },
  { key: 'uan', label: 'UAN No.', widthClass: 'min-w-[115px]', align: 'left', editable: true },
  { key: 'basicPay', label: 'Basic Pay', widthClass: 'min-w-[105px]', align: 'right', editable: true, sumInTotals: true },
  { key: 'daysOfMonth', label: 'Days of Month', widthClass: 'min-w-[66px]', align: 'center', editable: false },
  { key: 'sunday', label: 'Sunday', widthClass: 'min-w-[54px]', align: 'center', editable: false },
  { key: 'workingDays', label: 'Working Days', widthClass: 'min-w-[68px]', align: 'center', editable: false },
  { key: 'payPerDay', label: 'Pay Per Day', widthClass: 'min-w-[78px]', align: 'right', editable: false },
  { key: 'total', label: 'Total', widthClass: 'min-w-[82px]', align: 'right', editable: false, sumInTotals: true },
  { key: 'leaves', label: 'Leaves', widthClass: 'min-w-[88px]', align: 'center', editable: true },
  { key: 'halfDaysCount', label: 'Half Days', widthClass: 'min-w-[82px]', align: 'center', editable: false },
  { key: 'lateMarksCount', label: 'Late Marks', widthClass: 'min-w-[82px]', align: 'center', editable: false },
  { key: 'leaveDeduction', label: 'Leave', group: 'Deduction', widthClass: 'min-w-[76px]', align: 'right', editable: false, sumInTotals: true },
  { key: 'halfDayDeduction', label: 'Half Day', group: 'Deduction', widthClass: 'min-w-[96px]', align: 'right', editable: true, sumInTotals: true },
  { key: 'lateDeduction', label: 'Late Marks', group: 'Deduction', widthClass: 'min-w-[115px]', align: 'right', editable: true, sumInTotals: true },
  { key: 'otherDeduction', label: 'Other', group: 'Deduction', widthClass: 'min-w-[86px]', align: 'right', editable: true, sumInTotals: true },
  { key: 'netPay', label: 'Net Pay', widthClass: 'min-w-[88px]', align: 'right', editable: false, sumInTotals: true },
  { key: 'pf', label: 'PF', group: 'Statutory', widthClass: 'min-w-[86px]', align: 'right', editable: true, sumInTotals: true },
  { key: 'esic', label: 'ESIC', group: 'Statutory', widthClass: 'min-w-[86px]', align: 'right', editable: true, sumInTotals: true },
  { key: 'pt', label: 'PT', group: 'Statutory', widthClass: 'min-w-[82px]', align: 'right', editable: true, sumInTotals: true },
  { key: 'statutoryTotal', label: 'Total', group: 'Statutory', widthClass: 'min-w-[104px]', align: 'right', editable: true, sumInTotals: true },
  { key: 'finalPay', label: 'Final Pay', widthClass: 'min-w-[92px]', align: 'right', editable: false, sumInTotals: true },
  { key: 'retention', label: 'Retention', widthClass: 'min-w-[104px]', align: 'right', editable: true, sumInTotals: true },
  { key: 'advance', label: 'Advance', widthClass: 'min-w-[88px]', align: 'right', editable: true, sumInTotals: true },
  { key: 'loan', label: 'Loan', widthClass: 'min-w-[88px]', align: 'right', editable: true, sumInTotals: true },
  { key: 'bankPay', label: 'Bank Pay', widthClass: 'min-w-[96px]', align: 'right', editable: false, sumInTotals: true },
  { key: 'verified', label: 'Status', widthClass: 'min-w-[126px]', align: 'center', editable: true },
];

const LATE_FLAT_AMOUNT = 300;
const PAY_PER_DAY_DIVISOR = 26;

function roundUpRupee(val) {
  const n = Number(val);
  if (!Number.isFinite(n)) return 0;
  return Math.round(Math.round(n * 1e6) / 1e6);
}

/**
 * Maharashtra Professional Tax (PT) slabs w.e.f. 1 April 2023.
 */
export function calculateMaharashtraPT({ salary = 0, gender = 'Male', month = 1 } = {}) {
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

  // 3.2 Pay (Pay Per Day = Basic Pay / static 26 working days; Total uses exact decimal payPerDayExact * workingDays)
  const payPerDayExact = basicPay / PAY_PER_DAY_DIVISOR;
  const payPerDay = roundUpRupee(payPerDayExact);
  const total = workingDays > 0 ? roundUpRupee(payPerDayExact * workingDays) : 0;

  // 3.3 Leave deduction
  const leaveDeduction = roundUpRupee(effectiveLeaveUnits * payPerDayExact);

  // 3.4 Half-day deduction (approved half-day leaves + late-arrival half-days) & Late-marks deduction (flat only)
  const shiftHalfDays = Number(row.halfDayLeaves?.total) || 0;
  const halfDayDeductionComputed = roundUpRupee(((halfDays + shiftHalfDays) * payPerDayExact) / 2);
  let halfDayDeductionOverridden = Boolean(row.halfDayDeductionOverridden);
  let halfDayDeduction = halfDayDeductionOverridden
    ? roundUpRupee(Number(row.halfDayDeduction) || 0)
    : halfDayDeductionComputed;

  if ('halfDayDeductionOverride' in patch) {
    if (patch.halfDayDeductionOverride === null || patch.halfDayDeductionOverride === undefined) {
      halfDayDeductionOverridden = false;
      halfDayDeduction = halfDayDeductionComputed;
    } else {
      const ov = Number(patch.halfDayDeductionOverride);
      halfDayDeductionOverridden = true;
      halfDayDeduction = Number.isFinite(ov) && ov > 0 ? roundUpRupee(ov) : 0;
    }
  }

  const flatAmount = Number.isFinite(Number(settings?.lateFlatAmount)) && Number(settings?.lateFlatAmount) >= 0
    ? Number(settings.lateFlatAmount)
    : LATE_FLAT_AMOUNT;
  const lateDeductionComputed = roundUpRupee(flatDays * flatAmount);

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

  // 3.5 Other deduction & Net pay (uses rounded displayed values; never clamped to 0)
  const rawOther = 'otherDeduction' in patch ? Number(patch.otherDeduction) : Number(row.otherDeduction);
  const otherDeduction = Number.isFinite(rawOther) && rawOther > 0 ? roundUpRupee(rawOther) : 0;

  const netPay = total - leaveDeduction - halfDayDeduction - lateDeduction - otherDeduction;

  // 3.6 Employment Status Rule:
  // - Training / Probation -> Retention applies (5% of Basic Pay, editable); NO PF / ESIC / PT
  // - Permanent -> PF / ESIC / PT / Statutory Total apply (editable); NO Retention
  const isPermanent = String(row.employmentStatus || '').trim().toLowerCase() === 'permanent';

  const rawPf = 'pf' in patch ? Number(patch.pf) : Number(row.pf);
  const pf = isPermanent && Number.isFinite(rawPf) && rawPf > 0 ? roundUpRupee(rawPf) : 0;

  const rawEsic = 'esic' in patch ? Number(patch.esic) : Number(row.esic);
  const esic = isPermanent && Number.isFinite(rawEsic) && rawEsic > 0 ? roundUpRupee(rawEsic) : 0;

  const ptComputed = isPermanent
    ? calculateMaharashtraPT({ salary: basicPay, gender: row.gender || 'Male', month: row.month || 1 })
    : 0;
  let ptOverridden = isPermanent && Boolean(row.ptOverridden);
  let pt = isPermanent
    ? ptOverridden
      ? roundUpRupee(Number(row.pt) || 0)
      : ptComputed
    : 0;

  if (isPermanent && 'ptOverride' in patch) {
    if (patch.ptOverride === null || patch.ptOverride === undefined) {
      ptOverridden = false;
      pt = ptComputed;
    } else {
      const nextPt = Number(patch.ptOverride);
      ptOverridden = true;
      pt = Number.isFinite(nextPt) && nextPt > 0 ? roundUpRupee(nextPt) : 0;
    }
  }

  const statutoryTotalComputed = isPermanent ? pf + esic + pt : 0;
  let statutoryTotalOverridden = isPermanent && Boolean(row.statutoryTotalOverridden);
  let statutoryTotal = isPermanent
    ? statutoryTotalOverridden
      ? roundUpRupee(Number(row.statutoryTotal) || 0)
      : statutoryTotalComputed
    : 0;

  if (isPermanent && 'statutoryTotalOverride' in patch) {
    if (patch.statutoryTotalOverride === null || patch.statutoryTotalOverride === undefined) {
      statutoryTotalOverridden = false;
      statutoryTotal = statutoryTotalComputed;
    } else {
      const nextSt = Number(patch.statutoryTotalOverride);
      statutoryTotalOverridden = true;
      statutoryTotal = Number.isFinite(nextSt) && nextSt > 0 ? roundUpRupee(nextSt) : 0;
    }
  }

  const finalPay = netPay - statutoryTotal;

  const retentionComputed = isPermanent ? 0 : roundUpRupee(Math.max(0, total) * 0.05);
  let retentionOverridden = !isPermanent && Boolean(row.retentionOverridden);
  let retention = isPermanent
    ? 0
    : retentionOverridden
    ? roundUpRupee(Number(row.retention) || 0)
    : retentionComputed;

  if (!isPermanent && 'retentionOverride' in patch) {
    if (patch.retentionOverride === null || patch.retentionOverride === undefined) {
      retentionOverridden = false;
      retention = retentionComputed;
    } else {
      const nextRet = Number(patch.retentionOverride);
      retentionOverridden = true;
      retention = Number.isFinite(nextRet) && nextRet > 0 ? roundUpRupee(nextRet) : 0;
    }
  }

  const rawAdvance = 'advance' in patch ? Number(patch.advance) : Number(row.advance);
  const advance = Number.isFinite(rawAdvance) && rawAdvance > 0 ? roundUpRupee(rawAdvance) : 0;

  const rawLoan = 'loan' in patch ? Number(patch.loan) : Number(row.loan);
  const loan = Number.isFinite(rawLoan) && rawLoan > 0 ? roundUpRupee(rawLoan) : 0;

  const bankPay = finalPay - retention - advance - loan;

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
    halfDayDeduction,
    halfDayDeductionComputed,
    halfDayDeductionOverridden,
    lateDeduction,
    lateDeductionComputed,
    lateDeductionOverridden,
    otherDeduction,
    netPay,
    pf,
    esic,
    pt,
    ptComputed,
    ptOverridden,
    statutoryTotal,
    statutoryTotalComputed,
    statutoryTotalOverridden,
    finalPay,
    retention,
    retentionComputed,
    retentionOverridden: isPermanent ? false : retentionOverridden,
    advance,
    loan,
    bankPay,
    verified: patch.verified !== undefined ? Boolean(patch.verified) : Boolean(row.verified),
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
      halfDayDeduction: acc.halfDayDeduction + (Number(r.halfDayDeduction) || 0),
      lateDeduction: acc.lateDeduction + (Number(r.lateDeduction) || 0),
      otherDeduction: acc.otherDeduction + (Number(r.otherDeduction) || 0),
      netPay: acc.netPay + (Number(r.netPay) || 0),
      pf: acc.pf + (Number(r.pf) || 0),
      esic: acc.esic + (Number(r.esic) || 0),
      pt: acc.pt + (Number(r.pt) || 0),
      statutoryTotal: acc.statutoryTotal + (Number(r.statutoryTotal) || 0),
      finalPay: acc.finalPay + (Number(r.finalPay) || 0),
      retention: acc.retention + (Number(r.retention) || 0),
      advance: acc.advance + (Number(r.advance) || 0),
      loan: acc.loan + (Number(r.loan) || 0),
      bankPay: acc.bankPay + (Number(r.bankPay) || 0),
    }),
    {
      basicPay: 0,
      total: 0,
      leaveDeduction: 0,
      halfDayDeduction: 0,
      lateDeduction: 0,
      otherDeduction: 0,
      netPay: 0,
      pf: 0,
      esic: 0,
      pt: 0,
      statutoryTotal: 0,
      finalPay: 0,
      retention: 0,
      advance: 0,
      loan: 0,
      bankPay: 0,
    }
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
  const lateStartTime = row.lateRuleWindow?.lateStartTime || settings?.lateStartTime || '09:30';
  const halfDayTime = row.lateRuleWindow?.halfDayTime || settings?.halfDayTime || '10:30';
  const flatAmount = Number.isFinite(Number(settings?.lateFlatAmount)) && Number(settings?.lateFlatAmount) >= 0
    ? Number(settings.lateFlatAmount)
    : LATE_FLAT_AMOUNT;
  const computed = formatRupees(row.lateDeductionComputed || 0);

  if (flatDays === 0) {
    return row.lateDeductionOverridden
      ? `Computed: ₹0 (0 late days) · Overridden to ₹${formatRupees(row.lateDeduction)}`
      : `0 late days (${lateStartTime}–${halfDayTime} IST)`;
  }

  const base = `${flatDays} day${flatDays === 1 ? '' : 's'} (${lateStartTime}–${halfDayTime}) × ₹${formatRupees(flatAmount)} = ₹${computed}`;
  return row.lateDeductionOverridden
    ? `${base} (Overridden to ₹${formatRupees(row.lateDeduction)})`
    : base;
}
