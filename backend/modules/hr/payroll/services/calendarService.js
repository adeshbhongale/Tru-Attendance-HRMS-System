/**
 * IST-safe calendar helpers for payroll (Asia/Kolkata, UTC+05:30).
 * Uses explicit +05:30 offset and UTC methods exclusively so behavior never
 * depends on the server's local timezone or DST rules.
 */

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000; // +05:30 in milliseconds
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Convert a Date (or date-like value) to IST components.
 * Returns { year, month (1-12), date (1-31), day (0=Sun..6=Sat), hours, minutes, seconds }.
 */
function toIST(input) {
  const d = input instanceof Date ? input : new Date(input);
  const ist = new Date(d.getTime() + IST_OFFSET_MS);
  return {
    year: ist.getUTCFullYear(),
    month: ist.getUTCMonth() + 1,
    date: ist.getUTCDate(),
    day: ist.getUTCDay(),
    hours: ist.getUTCHours(),
    minutes: ist.getUTCMinutes(),
    seconds: ist.getUTCSeconds(),
  };
}

/**
 * Create a UTC Date instant representing 00:00:00.000 IST on (year, month [1-12], date).
 */
function istMidnight(year, month, date) {
  return new Date(Date.UTC(year, month - 1, date, 0, 0, 0, 0) - IST_OFFSET_MS);
}

/**
 * Number of calendar days in (year, month [1-12]). Handles leap years accurately.
 */
function getDaysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Compute the employee's counted period within (year, month [1-12]) in IST.
 * Counted period = [max(firstOfMonth, joiningDate), min(lastOfMonth, leavingDate)] inclusive.
 * Returns { start: Date|null, end: Date|null, countedDays: number } where start/end are IST midnights.
 */
function getCountedPeriod({ year, month, joiningDate, leavingDate }) {
  const daysInMonth = getDaysInMonth(year, month);
  const firstOfMonth = istMidnight(year, month, 1);
  const lastOfMonth = istMidnight(year, month, daysInMonth);

  let start = firstOfMonth;
  if (joiningDate) {
    const jp = toIST(joiningDate);
    const joinIST = istMidnight(jp.year, jp.month, jp.date);
    if (!Number.isNaN(joinIST.getTime()) && joinIST.getTime() > start.getTime()) {
      start = joinIST;
    }
  }

  let end = lastOfMonth;
  if (leavingDate) {
    const lp = toIST(leavingDate);
    const leaveIST = istMidnight(lp.year, lp.month, lp.date);
    if (!Number.isNaN(leaveIST.getTime()) && leaveIST.getTime() < end.getTime()) {
      end = leaveIST;
    }
  }

  if (start.getTime() > end.getTime()) {
    return { start: null, end: null, countedDays: 0 };
  }

  const countedDays = Math.round((end.getTime() - start.getTime()) / ONE_DAY_MS) + 1;
  return { start, end, countedDays };
}

/**
 * Count real calendar Sundays between two IST midnight dates (inclusive).
 */
function countSundays(start, end) {
  if (!start || !end) return 0;
  const s = start instanceof Date ? start : new Date(start);
  const e = end instanceof Date ? end : new Date(end);
  if (s.getTime() > e.getTime()) return 0;

  let count = 0;
  for (let ts = s.getTime(); ts <= e.getTime(); ts += ONE_DAY_MS) {
    if (toIST(new Date(ts)).day === 0) count++;
  }
  return count;
}

/**
 * Return IST month boundaries as UTC Date instants:
 * - monthStart: 00:00:00.000 IST on the 1st of the month (inclusive)
 * - monthEnd:   00:00:00.000 IST on the 1st of the next month (exclusive)
 */
function getISTMonthBoundaries(year, month) {
  const monthStart = istMidnight(year, month, 1);
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const monthEnd = istMidnight(nextYear, nextMonth, 1);
  return { monthStart, monthEnd };
}

/**
 * Whether a Date falls on a Sunday in IST.
 */
function isSundayIST(d) {
  return toIST(d).day === 0;
}

/**
 * Extract IST minutes since midnight (hour * 60 + minute), truncating seconds.
 */
function getISTMinutes(d) {
  const parts = toIST(d);
  return parts.hours * 60 + parts.minutes;
}

/**
 * Normalize a Date to 00:00:00.000 IST of its IST calendar date.
 */
function getISTDate(d) {
  const parts = toIST(d);
  return istMidnight(parts.year, parts.month, parts.date);
}

/**
 * Return IST date key 'YYYY-MM-DD' for grouping/deduplicating per calendar day.
 */
function getISTDateKey(d) {
  const parts = toIST(d);
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.date).padStart(2, '0')}`;
}

/**
 * Format a Date in IST as 'DD-MM-YYYY' (returns '' if falsy/invalid).
 */
function formatDateDDMMYYYY(d) {
  if (!d) return '';
  const dateObj = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dateObj.getTime())) return '';
  const parts = toIST(dateObj);
  return `${String(parts.date).padStart(2, '0')}-${String(parts.month).padStart(2, '0')}-${parts.year}`;
}

module.exports = {
  IST_OFFSET_MS,
  toIST,
  istMidnight,
  getDaysInMonth,
  getCountedPeriod,
  countSundays,
  getISTMonthBoundaries,
  isSundayIST,
  getISTMinutes,
  getISTDate,
  getISTDateKey,
  formatDateDDMMYYYY,
};
