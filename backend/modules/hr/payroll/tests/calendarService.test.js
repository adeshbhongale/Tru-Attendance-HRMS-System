/**
 * Unit tests for IST calendar helpers (Section 6).
 * Run: node --test modules/hr/payroll/tests/calendarService.test.js
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  toIST,
  istMidnight,
  getDaysInMonth,
  getCountedPeriod,
  countSundays,
  getISTMonthBoundaries,
  isSundayIST,
  getISTMinutes,
  formatDateDDMMYYYY,
} = require('../services/calendarService');

test('getDaysInMonth returns exact calendar days including leap years', () => {
  assert.equal(getDaysInMonth(2026, 1), 31);
  assert.equal(getDaysInMonth(2026, 2), 28);
  assert.equal(getDaysInMonth(2024, 2), 29); // leap year
  assert.equal(getDaysInMonth(2000, 2), 29); // century leap year
  assert.equal(getDaysInMonth(1900, 2), 28); // century non-leap year
  assert.equal(getDaysInMonth(2026, 4), 30);
  assert.equal(getDaysInMonth(2026, 11), 30);
  assert.equal(getDaysInMonth(2026, 12), 31);
});

test('countSundays counts Sundays accurately in IST (Nov 2026 = 5 Sundays)', () => {
  // Nov 2026 Sundays: Nov 1, 8, 15, 22, 29 = 5
  const novPeriod = getCountedPeriod({
    year: 2026,
    month: 11,
    joiningDate: new Date('2026-01-01T00:00:00+05:30'),
  });
  assert.equal(novPeriod.countedDays, 30);
  assert.equal(countSundays(novPeriod.start, novPeriod.end), 5);

  // Sub-range Nov 2..Nov 7 (Mon..Sat) = 0 Sundays
  assert.equal(
    countSundays(istMidnight(2026, 11, 2), istMidnight(2026, 11, 7)),
    0
  );
});

test('IST boundary handling: 2026-11-30T19:00:00Z is 01-Dec 00:30 IST and belongs to December', () => {
  const boundaryPunch = new Date('2026-11-30T19:00:00Z');
  const ist = toIST(boundaryPunch);

  assert.equal(ist.year, 2026);
  assert.equal(ist.month, 12);
  assert.equal(ist.date, 1);
  assert.equal(ist.hours, 0);
  assert.equal(ist.minutes, 30);
  assert.equal(getISTMinutes(boundaryPunch), 30);

  const novBounds = getISTMonthBoundaries(2026, 11);
  const decBounds = getISTMonthBoundaries(2026, 12);

  // Must NOT fall in November [monthStart, monthEnd)
  assert.equal(
    boundaryPunch >= novBounds.monthStart && boundaryPunch < novBounds.monthEnd,
    false
  );
  // MUST fall in December [monthStart, monthEnd)
  assert.equal(
    boundaryPunch >= decBounds.monthStart && boundaryPunch < decBounds.monthEnd,
    true
  );
});

test('IST Sunday & DD-MM-YYYY formatting avoid UTC off-by-one', () => {
  // 2026-10-31T18:30:00Z is 2026-11-01 00:00 IST (Sunday)
  const sunMidnightIST = new Date('2026-10-31T18:30:00Z');
  assert.equal(isSundayIST(sunMidnightIST), true);
  assert.equal(formatDateDDMMYYYY(sunMidnightIST), '01-11-2026');

  // 2026-04-19T18:30:00Z is 2026-04-20 00:00 IST
  assert.equal(formatDateDDMMYYYY(new Date('2026-04-19T18:30:00Z')), '20-04-2026');
});
