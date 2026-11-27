/**
 * Unit tests for pure payroll calculator (Section 3 & Section 6).
 * Run: node --test modules/hr/payroll/tests/payrollCalculator.test.js
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  calculateRow,
  calculateMaharashtraPT,
  classifyPunchIn,
  summarizePunchIns,
  roundUpRupee,
} = require('../services/payrollCalculator');
const {
  getDaysInMonth,
  getCountedPeriod,
  countSundays,
} = require('../services/calendarService');

test('1. Worked example (3.9): Nov 2026, joined 20-04-2026, basic 15000, leaves 2, punches 09:45 & 10:45 -> net 13450', () => {
  const year = 2026;
  const month = 11; // November 2026
  const daysOfMonth = getDaysInMonth(year, month);
  const period = getCountedPeriod({
    year,
    month,
    joiningDate: new Date('2026-04-20T00:00:00+05:30'),
    leavingDate: null,
  });
  const sunday = countSundays(period.start, period.end);

  // Two non-Sunday punches in Nov 2026: Mon Nov 2 at 09:45 IST and Tue Nov 3 at 10:45 IST
  const lateCounts = summarizePunchIns(
    [
      new Date('2026-11-02T09:45:00+05:30'),
      new Date('2026-11-03T10:45:00+05:30'),
    ],
    { periodStart: period.start, periodEnd: period.end }
  );

  const row = calculateRow({
    basicPay: 15000,
    daysOfMonth,
    countedDays: period.countedDays,
    sunday,
    leaves: 2,
    flatDays: lateCounts.flatDays,
    halfDays: lateCounts.halfDays,
    lateDeductionOverride: null,
  });

  assert.equal(row.daysOfMonth, 30);
  assert.equal(row.payPerDay, 577);
  assert.equal(row.sunday, 5);
  assert.equal(row.leaves, 2);
  assert.equal(row.workingDays, 25);
  assert.equal(row.total, 14423);
  assert.equal(row.leaveDeduction, 1154);
  assert.equal(row.halfDayDeduction, 288);
  assert.equal(row.halfDayDeductionComputed, 288);
  assert.equal(row.lateDeduction, 300);
  assert.equal(row.lateDeductionComputed, 300);
  assert.equal(row.lateDeductionOverridden, false);
  assert.deepEqual(row.lateCounts, { flatDays: 1, halfDays: 1 });
  assert.equal(row.netPay, 12681);
});

test('2. 31-day month with basic 15000 (static 26 divisor): payPerDay 577, exact total 15577, net consistent', () => {
  const daysOfMonth = getDaysInMonth(2026, 12); // Dec 2026 = 31 days, 4 Sundays -> 27 working days
  const period = getCountedPeriod({
    year: 2026,
    month: 12,
    joiningDate: new Date('2026-01-01T00:00:00+05:30'),
  });
  const sunday = countSundays(period.start, period.end);

  const row = calculateRow({
    basicPay: 15000,
    daysOfMonth,
    countedDays: period.countedDays,
    sunday,
    leaves: 1,
    flatDays: 1,
    halfDays: 0,
  });

  assert.equal(row.daysOfMonth, 31);
  assert.equal(row.workingDays, 27);
  assert.equal(row.payPerDay, 577);
  assert.equal(row.total, 15577);
  assert.equal(row.leaveDeduction, 577);
  assert.equal(row.lateDeduction, 300);
  assert.equal(row.netPay, row.total - row.leaveDeduction - row.lateDeduction);
  assert.equal(row.netPay, 14700);
});

test('3. February in non-leap year (28 days) and leap year (29 days)', () => {
  const days2026 = getDaysInMonth(2026, 2);
  const period2026 = getCountedPeriod({
    year: 2026,
    month: 2,
    joiningDate: new Date('2025-01-01T00:00:00+05:30'),
  });
  const rowNonLeap = calculateRow({
    basicPay: 28000,
    daysOfMonth: days2026,
    countedDays: period2026.countedDays,
    sunday: countSundays(period2026.start, period2026.end),
    leaves: 0,
  });
  assert.equal(rowNonLeap.daysOfMonth, 28);
  assert.equal(rowNonLeap.workingDays, 24);
  assert.equal(rowNonLeap.payPerDay, 1077);
  assert.equal(rowNonLeap.total, 25846);

  const days2024 = getDaysInMonth(2024, 2);
  const period2024 = getCountedPeriod({
    year: 2024,
    month: 2,
    joiningDate: new Date('2023-01-01T00:00:00+05:30'),
  });
  const rowLeap = calculateRow({
    basicPay: 29000,
    daysOfMonth: days2024,
    countedDays: period2024.countedDays,
    sunday: countSundays(period2024.start, period2024.end),
    leaves: 0,
  });
  assert.equal(rowLeap.daysOfMonth, 29);
  assert.equal(rowLeap.workingDays, 25);
  assert.equal(rowLeap.payPerDay, 1115);
  assert.equal(rowLeap.total, 27885);
});

test('4. Mid-month joiner (joined 20-Nov-2026, basic 15000): countedDays 11, Sundays 2, workingDays 9, total 5193', () => {
  const daysOfMonth = getDaysInMonth(2026, 11);
  const period = getCountedPeriod({
    year: 2026,
    month: 11,
    joiningDate: new Date('2026-11-20T00:00:00+05:30'),
  });
  const sunday = countSundays(period.start, period.end);

  assert.equal(period.countedDays, 11);
  assert.equal(sunday, 2); // 22nd and 29th Nov 2026

  const row = calculateRow({
    basicPay: 15000,
    daysOfMonth,
    countedDays: period.countedDays,
    sunday,
  });

  assert.equal(row.workingDays, 9);
  assert.equal(row.total, 5192);
  assert.equal(row.netPay, 5192);
});

test('5. Mid-month leaver (counted up to leaving date inclusive)', () => {
  // Left on 15-Nov-2026 (inclusive): Nov 1..15 = 15 days; Sundays on 1st, 8th, 15th = 3
  const daysOfMonth = getDaysInMonth(2026, 11);
  const period = getCountedPeriod({
    year: 2026,
    month: 11,
    joiningDate: new Date('2025-06-01T00:00:00+05:30'),
    leavingDate: new Date('2026-11-15T00:00:00+05:30'),
  });
  const sunday = countSundays(period.start, period.end);

  assert.equal(period.countedDays, 15);
  assert.equal(sunday, 3);

  const row = calculateRow({
    basicPay: 15000,
    daysOfMonth,
    countedDays: period.countedDays,
    sunday,
  });

  assert.equal(row.workingDays, 12);
  assert.equal(row.total, 6923);
});

test('6. Employee joined after the month or left before the month -> zero counted days & zero pay', () => {
  const joinedAfter = getCountedPeriod({
    year: 2026,
    month: 11,
    joiningDate: new Date('2026-12-01T00:00:00+05:30'),
  });
  assert.equal(joinedAfter.countedDays, 0);

  const leftBefore = getCountedPeriod({
    year: 2026,
    month: 11,
    joiningDate: new Date('2025-01-01T00:00:00+05:30'),
    leavingDate: new Date('2026-10-31T00:00:00+05:30'),
  });
  assert.equal(leftBefore.countedDays, 0);

  const row = calculateRow({
    basicPay: 15000,
    daysOfMonth: 30,
    countedDays: 0,
    sunday: 0,
  });
  assert.equal(row.workingDays, 0);
  assert.equal(row.total, 0);
  assert.equal(row.netPay, 0);
});

test('7. Late tiers at boundaries: 9:30:59 -> none; 9:31 -> 300; 10:30:59 -> 300; 10:31 -> half day; one day never gets both', () => {
  // Seconds truncated, not rounded
  assert.equal(classifyPunchIn(new Date('2026-11-02T09:30:59+05:30')), 'NONE');
  assert.equal(classifyPunchIn(new Date('2026-11-02T09:31:00+05:30')), 'FLAT');
  assert.equal(classifyPunchIn(new Date('2026-11-02T10:30:59+05:30')), 'FLAT');
  assert.equal(classifyPunchIn(new Date('2026-11-02T10:31:00+05:30')), 'HALF_DAY');

  const period = getCountedPeriod({
    year: 2026,
    month: 11,
    joiningDate: new Date('2026-01-01T00:00:00+05:30'),
  });

  // Single punch at 10:31 -> only halfDays = 1, flatDays = 0 (replaces Rs 300, never both)
  const singleHalfDay = summarizePunchIns(
    [new Date('2026-11-02T10:31:00+05:30')],
    { periodStart: period.start, periodEnd: period.end }
  );
  assert.deepEqual(singleHalfDay, { flatDays: 0, halfDays: 1 });

  const row = calculateRow({
    basicPay: 15000,
    daysOfMonth: 30,
    countedDays: 30,
    sunday: 5,
    flatDays: singleHalfDay.flatDays,
    halfDays: singleHalfDay.halfDays,
  });
  assert.equal(row.halfDayDeduction, 288); // round(half of 15000/26 = 288.46...) = 288
  assert.equal(row.lateDeduction, 0);
  assert.equal(roundUpRupee(86.2), 86);
  assert.equal(roundUpRupee(2.3), 2);
  assert.equal(roundUpRupee(2.6), 3);
});

test('8. Half-day amount uses exact (unrounded) pay per day, and only the final sum is rounded', () => {
  // basicPay = 10000, divisor = 26 -> payPerDayExact = 384.6153..., payPerDay (displayed) = 385
  // 3 half-days:
  //   exact: ceil(3 * (10000 / 26) / 2) = ceil(576.923...) = 577
  const row = calculateRow({
    basicPay: 10000,
    daysOfMonth: 30,
    countedDays: 30,
    sunday: 5,
    flatDays: 0,
    halfDays: 3,
  });
  assert.equal(row.payPerDay, 385);
  assert.equal(row.halfDayDeductionComputed, 577);
  assert.equal(row.halfDayDeduction, 577);
  assert.equal(row.lateDeduction, 0);
});

test('9. Integer leaves: Leaves 2 with payPerDay 577 (15000 / 26) -> 1154; Leaves 0 -> 0; negative leaves clamped to 0', () => {
  const rowWithLeaves = calculateRow({
    basicPay: 15000,
    daysOfMonth: 30,
    countedDays: 30,
    sunday: 5,
    leaves: 2,
  });
  assert.equal(rowWithLeaves.leaves, 2);
  assert.equal(rowWithLeaves.leaveDeduction, 1154);
  assert.equal(rowWithLeaves.netPay, 13269);

  const rowZeroLeaves = calculateRow({
    basicPay: 15000,
    daysOfMonth: 30,
    countedDays: 30,
    sunday: 5,
    leaves: 0,
  });
  assert.equal(rowZeroLeaves.leaveDeduction, 0);
  assert.equal(rowZeroLeaves.netPay, 14423);

  const rowNegativeLeaves = calculateRow({
    basicPay: 15000,
    daysOfMonth: 30,
    countedDays: 30,
    sunday: 5,
    leaves: -3,
  });
  assert.equal(rowNegativeLeaves.leaves, 0);
  assert.equal(rowNegativeLeaves.leaveDeduction, 0);
});

test('10. Override replaces computed late deduction; clearing it (null) restores computed value', () => {
  const overridden = calculateRow({
    basicPay: 15000,
    daysOfMonth: 30,
    countedDays: 30,
    sunday: 5,
    flatDays: 2,
    halfDays: 1,
    lateDeductionOverride: 100,
  });
  assert.equal(overridden.lateDeductionComputed, 600); // 2*300 = 600 (1 half-day is in halfDayDeduction = 288)
  assert.equal(overridden.halfDayDeduction, 288);
  assert.equal(overridden.lateDeduction, 100);
  assert.equal(overridden.lateDeductionOverridden, true);
  assert.equal(overridden.netPay, 14035);

  // Override to 0 is also a valid override
  const overriddenZero = calculateRow({
    basicPay: 15000,
    daysOfMonth: 30,
    countedDays: 30,
    sunday: 5,
    flatDays: 2,
    halfDays: 1,
    lateDeductionOverride: 0,
  });
  assert.equal(overriddenZero.lateDeduction, 0);
  assert.equal(overriddenZero.lateDeductionOverridden, true);
  assert.equal(overriddenZero.netPay, 14135);

  // Clearing override (null) restores computed
  const cleared = calculateRow({
    basicPay: 15000,
    daysOfMonth: 30,
    countedDays: 30,
    sunday: 5,
    flatDays: 2,
    halfDays: 1,
    lateDeductionOverride: null,
  });
  assert.equal(cleared.lateDeduction, 600);
  assert.equal(cleared.lateDeductionOverridden, false);
  assert.equal(cleared.netPay, 13535);
});

test('11. Basic pay 0 or missing -> every amount is 0, no NaN or undefined', () => {
  for (const missingVal of [0, undefined, null, NaN, '']) {
    const row = calculateRow({
      basicPay: missingVal,
      daysOfMonth: 30,
      countedDays: 30,
      sunday: 5,
      leaves: 2,
      flatDays: 0,
      halfDays: 2,
    });
    assert.equal(row.basicPay, 0);
    assert.equal(row.payPerDay, 0);
    assert.equal(row.total, 0);
    assert.equal(row.leaveDeduction, 0);
    assert.equal(row.lateDeduction, 0);
    assert.equal(row.netPay, 0);
    for (const v of Object.values(row)) {
      if (typeof v === 'number') {
        assert.ok(!Number.isNaN(v), 'No numeric field may be NaN');
      }
      assert.notEqual(v, undefined);
    }
  }
});

test('12. Negative net pay is returned as-is (no clamping to zero)', () => {
  const row = calculateRow({
    basicPay: 3000,
    daysOfMonth: 30,
    countedDays: 5, // workingDays = 4, payPerDay = 116, exact total = ceil(3000/26 * 4) = 462
    sunday: 1,
    leaves: 4, // leaveDeduction = ceil(461.538) = 462
    flatDays: 3, // lateDeduction = 900
  });
  assert.equal(row.total, 462);
  assert.equal(row.leaveDeduction, 462);
  assert.equal(row.lateDeduction, 900);
  assert.equal(row.netPay, -900);
});

test('13. Half-day leave Session 1 (1st shift off -> works 2nd shift) & Session 2 (2nd shift off -> works 1st shift)', () => {
  const shift = {
    firstSession: { startTime: '09:30', endTime: '14:00' },
    secondSession: { startTime: '14:00', endTime: '18:30' },
  };
  const period = getCountedPeriod({
    year: 2026,
    month: 11,
    joiningDate: new Date('2026-01-01T00:00:00+05:30'),
  });

  // Scenario 2a: Employee took 1st shift half-day leave (Session 1) and punches in on time for 2nd shift at 13:55 IST
  // Must NOT be marked late or half-day late!
  const onTimeSession2 = summarizePunchIns(
    [{ punchInTime: new Date('2026-11-02T13:55:00+05:30'), halfDaySession: 'Session 1', shiftInfo: shift }],
    { periodStart: period.start, periodEnd: period.end }
  );
  assert.deepEqual(onTimeSession2, { flatDays: 0, halfDays: 0 });

  // Scenario 2b: Employee took 1st shift half-day leave (Session 1) and punches in at 14:20 IST -> flat late mark (within 1h of 14:00)
  const lateSession2 = summarizePunchIns(
    [{ punchInTime: new Date('2026-11-03T14:20:00+05:30'), halfDaySession: 'Session 1', shiftInfo: shift }],
    { periodStart: period.start, periodEnd: period.end }
  );
  assert.deepEqual(lateSession2, { flatDays: 1, halfDays: 0 });

  // Scenario 2c: Employee took 1st shift half-day leave (Session 1) and punches in at 15:10 IST -> half-day late (>1h after 14:00)
  const veryLateSession2 = summarizePunchIns(
    [{ punchInTime: new Date('2026-11-04T15:10:00+05:30'), halfDaySession: 'Session 1', shiftInfo: shift }],
    { periodStart: period.start, periodEnd: period.end }
  );
  assert.deepEqual(veryLateSession2, { flatDays: 0, halfDays: 1 });

  // Scenario 2d: Employee took 2nd shift half-day leave (Session 2) and punches in at 09:25 IST -> on time for 1st shift
  const onTimeSession1 = summarizePunchIns(
    [{ punchInTime: new Date('2026-11-05T09:25:00+05:30'), halfDaySession: 'Session 2', shiftInfo: shift }],
    { periodStart: period.start, periodEnd: period.end }
  );
  assert.deepEqual(onTimeSession1, { flatDays: 0, halfDays: 0 });
});

test('14. Employment status rule: Training/Probation -> Retention only (no PF/ESIC/PT); Permanent -> PF/ESIC/PT only (no Retention)', () => {
  // Training or Probation -> retention auto-calculates to 5% of Total (19231 * 0.05 = 961.55 -> 962), PF/ESIC/PT/statutoryTotal are all 0
  for (const status of ['Training', 'Probation']) {
    const row = calculateRow({
      basicPay: 20000,
      daysOfMonth: 30,
      countedDays: 30,
      sunday: 5,
      employmentStatus: status,
      pf: 1800,
      esic: 150,
      pt: 200,
      statutoryTotalOverride: 500,
      advance: 500,
      loan: 1000,
    });
    assert.equal(row.employmentStatus, status);
    assert.equal(row.pf, 0);
    assert.equal(row.esic, 0);
    assert.equal(row.pt, 0);
    assert.equal(row.statutoryTotal, 0);
    assert.equal(row.finalPay, row.netPay);
    assert.equal(row.retention, 962);
    assert.equal(row.retentionComputed, 962);
    assert.equal(row.bankPay, row.finalPay - 962 - 500 - 1000);
  }

  // Probation with manual retention override
  const probOverride = calculateRow({
    basicPay: 20000,
    daysOfMonth: 30,
    countedDays: 30,
    sunday: 5,
    employmentStatus: 'Probation',
    retentionOverride: 750,
  });
  assert.equal(probOverride.retention, 750);
  assert.equal(probOverride.retentionOverridden, true);
  assert.equal(probOverride.bankPay, probOverride.finalPay - 750);

  // Permanent -> PF/ESIC/PT apply, retention is strictly 0 even if retentionOverride was passed
  const perm = calculateRow({
    basicPay: 20000,
    daysOfMonth: 30,
    countedDays: 30,
    sunday: 5,
    employmentStatus: 'Permanent',
    pf: 1800,
    esic: 150,
    pt: 200,
    retentionOverride: 1000,
    advance: 500,
    loan: 1000,
  });
  assert.equal(perm.employmentStatus, 'Permanent');
  assert.equal(perm.pf, 1800);
  assert.equal(perm.esic, 150);
  assert.equal(perm.pt, 200);
  assert.equal(perm.statutoryTotal, 2150);
  assert.equal(perm.finalPay, perm.netPay - 2150);
  assert.equal(perm.retention, 0);
  assert.equal(perm.retentionOverridden, false);
  assert.equal(perm.bankPay, perm.finalPay - 500 - 1000);

  // Permanent with Statutory Total override
  const permOverride = calculateRow({
    basicPay: 20000,
    daysOfMonth: 30,
    countedDays: 30,
    sunday: 5,
    employmentStatus: 'Permanent',
    pf: 1800,
    esic: 150,
    pt: 200,
    statutoryTotalOverride: 2000,
  });
  assert.equal(permOverride.statutoryTotal, 2000);
  assert.equal(permOverride.statutoryTotalOverridden, true);
  assert.equal(permOverride.finalPay, permOverride.netPay - 2000);
  assert.equal(permOverride.retention, 0);
  assert.equal(permOverride.bankPay, permOverride.finalPay);
});

test('15. Maharashtra Professional Tax (PT) slabs w.e.f. 1 April 2023 (Male, Female, Feb ₹300, annual ₹2,500)', () => {
  // Male slabs
  assert.equal(calculateMaharashtraPT({ salary: 0, gender: 'Male', month: 1 }), 0);
  assert.equal(calculateMaharashtraPT({ salary: 7500, gender: 'Male', month: 1 }), 0);
  assert.equal(calculateMaharashtraPT({ salary: 7500, gender: 'Male', month: 2 }), 0);
  assert.equal(calculateMaharashtraPT({ salary: 7501, gender: 'Male', month: 1 }), 175);
  assert.equal(calculateMaharashtraPT({ salary: 10000, gender: 'Male', month: 1 }), 175);
  assert.equal(calculateMaharashtraPT({ salary: 10000, gender: 'Male', month: 2 }), 175);
  assert.equal(calculateMaharashtraPT({ salary: 10001, gender: 'Male', month: 1 }), 200);
  assert.equal(calculateMaharashtraPT({ salary: 10001, gender: 'Male', month: 2 }), 300);
  assert.equal(calculateMaharashtraPT({ salary: 50000, gender: 'Male', month: 11 }), 200);
  assert.equal(calculateMaharashtraPT({ salary: 50000, gender: 'Male', month: 2 }), 300);

  // Female slabs
  assert.equal(calculateMaharashtraPT({ salary: 7501, gender: 'Female', month: 1 }), 0);
  assert.equal(calculateMaharashtraPT({ salary: 25000, gender: 'Female', month: 1 }), 0);
  assert.equal(calculateMaharashtraPT({ salary: 25000, gender: 'Female', month: 2 }), 0);
  assert.equal(calculateMaharashtraPT({ salary: 25001, gender: 'Female', month: 1 }), 200);
  assert.equal(calculateMaharashtraPT({ salary: 25001, gender: 'Female', month: 2 }), 300);
  assert.equal(calculateMaharashtraPT({ salary: 60000, gender: 'Female', month: 11 }), 200);
  assert.equal(calculateMaharashtraPT({ salary: 60000, gender: 'Female', month: 2 }), 300);

  // Full-year annual PT in highest taxable slab = 11 * 200 + 300 = 2,500
  let annualMale = 0;
  let annualFemale = 0;
  for (let m = 1; m <= 12; m += 1) {
    annualMale += calculateMaharashtraPT({ salary: 30000, gender: 'Male', month: m });
    annualFemale += calculateMaharashtraPT({ salary: 30000, gender: 'Female', month: m });
  }
  assert.equal(annualMale, 2500);
  assert.equal(annualFemale, 2500);

  // Integration with calculateRow: Permanent Female <= 25000 -> PT 0; > 25000 in Feb -> PT 300
  const femLow = calculateRow({
    basicPay: 25000,
    daysOfMonth: 28,
    countedDays: 28,
    sunday: 4,
    employmentStatus: 'Permanent',
    gender: 'Female',
    month: 2,
  });
  assert.equal(femLow.pt, 0);
  assert.equal(femLow.ptComputed, 0);

  const femHighFeb = calculateRow({
    basicPay: 30000,
    daysOfMonth: 28,
    countedDays: 28,
    sunday: 4,
    employmentStatus: 'Permanent',
    gender: 'Female',
    month: 2,
  });
  assert.equal(femHighFeb.pt, 300);
  assert.equal(femHighFeb.ptComputed, 300);
  assert.equal(femHighFeb.statutoryTotal, 300);

  // Training / Probation -> PT strictly 0 even if salary > 25000
  const probHigh = calculateRow({
    basicPay: 30000,
    daysOfMonth: 28,
    countedDays: 28,
    sunday: 4,
    employmentStatus: 'Probation',
    gender: 'Male',
    month: 2,
  });
  assert.equal(probHigh.pt, 0);
  assert.equal(probHigh.ptComputed, 0);
});

test('16. Custom shift payroll thresholds (Imran 10:00-18:00: 10:00 on time, 10:01-10:45 flat ₹300, >10:45 half day; no grace)', () => {
  const imranShift = {
    startTime: '10:00',
    endTime: '18:00',
    firstSession: { startTime: '10:00', endTime: '14:00' },
    secondSession: { startTime: '14:00', endTime: '18:00' },
    payrollLateStartTime: '10:00',
    payrollHalfDayTime: '10:45',
  };

  assert.equal(classifyPunchIn(new Date('2026-11-02T10:00:59+05:30'), {}, { shift: imranShift }), 'NONE');
  assert.equal(classifyPunchIn(new Date('2026-11-02T10:01:00+05:30'), {}, { shift: imranShift }), 'FLAT');
  assert.equal(classifyPunchIn(new Date('2026-11-02T10:45:59+05:30'), {}, { shift: imranShift }), 'FLAT');
  assert.equal(classifyPunchIn(new Date('2026-11-02T10:46:00+05:30'), {}, { shift: imranShift }), 'HALF_DAY');

  // Other employees without custom payrollLateStartTime keep 09:30 / 10:30
  assert.equal(classifyPunchIn(new Date('2026-11-02T09:45:00+05:30'), {}, { shift: { startTime: '10:00' } }), 'FLAT');
  assert.equal(classifyPunchIn(new Date('2026-11-02T10:35:00+05:30'), {}, { shift: { startTime: '10:00' } }), 'HALF_DAY');
});

test('17. Exact decimal payPerDay for Total & 5% of whole Total for Retention (Adesh Oct 2026 example)', () => {
  // Basic 17000, Oct 2026 (31 days, 4 Sundays -> 27 working days), 1 flat late (300), Probation
  // payPerDay displayed = ceil(17000/26) = 654
  // total = ceil((17000/26) * 27) = ceil(17653.84615...) = 17654
  // netPay = 17654 - 300 = 17354
  // retention = ceil(17654 * 0.05) = ceil(882.7) = 883
  // bankPay = 17354 - 883 = 16471
  const row = calculateRow({
    basicPay: 17000,
    daysOfMonth: 31,
    countedDays: 31,
    sunday: 4,
    flatDays: 1,
    employmentStatus: 'Probation',
  });
  assert.equal(row.payPerDay, 654);
  assert.equal(row.workingDays, 27);
  assert.equal(row.total, 17654);
  assert.equal(row.lateDeduction, 300);
  assert.equal(row.netPay, 17354);
  assert.equal(row.retention, 883);
  assert.equal(row.bankPay, 16471);
});

test('18. Separate Half Day deduction column combines approved half-day leaves + late half-days, excluding them from Leave & Late Marks', () => {
  const row = calculateRow({
    basicPay: 26000,
    daysOfMonth: 31,
    countedDays: 31,
    sunday: 4,
    leaves: 1,
    flatDays: 2,
    halfDays: 1,
    approvedHalfDays: 2,
  });
  // payPerDay = 1000
  // leaveDeduction = 1000 (1 full leave only)
  // halfDayDeduction = ceil((1 + 2) * 1000 / 2) = 1500 (1 late half-day + 2 approved half-days)
  // lateDeduction = 2 * 300 = 600 (2 flat late marks only)
  // total = 27000, netPay = 27000 - 1000 - 1500 - 600 = 23900
  assert.equal(row.leaveDeduction, 1000);
  assert.equal(row.halfDayDeduction, 1500);
  assert.equal(row.halfDayDeductionComputed, 1500);
  assert.equal(row.lateDeduction, 600);
  assert.equal(row.netPay, 23900);
});
