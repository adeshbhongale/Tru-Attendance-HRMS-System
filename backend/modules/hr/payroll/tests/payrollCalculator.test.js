/**
 * Unit tests for pure payroll calculator (Section 3 & Section 6).
 * Run: node --test modules/hr/payroll/tests/payrollCalculator.test.js
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  calculateRow,
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
  assert.equal(row.total, 14425);
  assert.equal(row.leaveDeduction, 1154);
  assert.equal(row.lateDeduction, 589);
  assert.equal(row.lateDeductionComputed, 589);
  assert.equal(row.lateDeductionOverridden, false);
  assert.deepEqual(row.lateCounts, { flatDays: 1, halfDays: 1 });
  assert.equal(row.netPay, 12682);
});

test('2. 31-day month with basic 15000 (static 26 divisor): payPerDay 577, total 15579, net consistent', () => {
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
  assert.equal(row.total, 15579);
  assert.equal(row.leaveDeduction, 577);
  assert.equal(row.lateDeduction, 300);
  assert.equal(row.netPay, row.total - row.leaveDeduction - row.lateDeduction);
  assert.equal(row.netPay, 14702);
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
  assert.equal(rowNonLeap.total, 25848);

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
  assert.equal(rowLeap.payPerDay, 1116);
  assert.equal(rowLeap.total, 27900);
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
  assert.equal(row.total, 5193);
  assert.equal(row.netPay, 5193);
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
  assert.equal(row.total, 6924);
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
  assert.equal(row.lateDeduction, 289); // ceil(half of 15000/26 = 288.46...) = 289
  assert.equal(roundUpRupee(86.2), 87);
});

test('8. Half-day amount uses exact (unrounded) pay per day, and only the final sum is rounded', () => {
  // basicPay = 10000, divisor = 26 -> payPerDayExact = 384.6153..., payPerDay (displayed) = 385
  // 3 half-days:
  //   exact: Math.round(3 * (10000 / 26) / 2) = Math.round(576.923...) = 577
  //   if rounded payPerDay were used: Math.round(3 * 385 / 2) = Math.round(577.5) = 578
  const row = calculateRow({
    basicPay: 10000,
    daysOfMonth: 30,
    countedDays: 30,
    sunday: 5,
    flatDays: 0,
    halfDays: 3,
  });
  assert.equal(row.payPerDay, 385);
  assert.equal(row.lateDeductionComputed, 577);
  assert.equal(row.lateDeduction, 577);
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
  assert.equal(rowWithLeaves.netPay, 13271);

  const rowZeroLeaves = calculateRow({
    basicPay: 15000,
    daysOfMonth: 30,
    countedDays: 30,
    sunday: 5,
    leaves: 0,
  });
  assert.equal(rowZeroLeaves.leaveDeduction, 0);
  assert.equal(rowZeroLeaves.netPay, 14425);

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
  assert.equal(overridden.lateDeductionComputed, 889); // ceil(2*300 + 288.46) = 889
  assert.equal(overridden.lateDeduction, 100);
  assert.equal(overridden.lateDeductionOverridden, true);
  assert.equal(overridden.netPay, 14325);

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
  assert.equal(overriddenZero.netPay, 14425);

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
  assert.equal(cleared.lateDeduction, 889);
  assert.equal(cleared.lateDeductionOverridden, false);
  assert.equal(cleared.netPay, 13536);
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
    countedDays: 5, // workingDays = 4, payPerDay = ceil(115.38) = 116, total = 116 * 4 = 464
    sunday: 1,
    leaves: 4, // leaveDeduction = ceil(461.538) = 462
    flatDays: 3, // lateDeduction = 900
  });
  assert.equal(row.total, 464);
  assert.equal(row.leaveDeduction, 462);
  assert.equal(row.lateDeduction, 900);
  assert.equal(row.netPay, -898);
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
