const LeavePeriod = require('../../models/LeavePeriod');
const { getISTDateComponents, createDateFromIST } = require('../../utils/timezone');

// ── Period engine ────────────────────────────────────────────────────────────
// Materialises MONTHLY / QUARTERLY / YEARLY allocation periods. periodKey is a
// stable, human readable id (e.g. "2026-MONTHLY-03", "2026-QUARTERLY-2",
// "2026-YEARLY") used consistently across Leave.periodKey and LeaveLedger.
// No cron resets — the current period is always derived from the reference
// date; historical periods are queried directly by key.

const PERIOD_KEY_MONTHLY = 'MONTHLY';
const PERIOD_KEY_QUARTERLY = 'QUARTERLY';
const PERIOD_KEY_YEARLY = 'YEARLY';

exports.MONTHLY = PERIOD_KEY_MONTHLY;
exports.QUARTERLY = PERIOD_KEY_QUARTERLY;
exports.YEARLY = PERIOD_KEY_YEARLY;

// Period window for a periodType and a reference date (defaults to today).
exports.getPeriodWindow = (periodType, refDate = new Date()) => {
  const ref = getISTDateComponents(refDate);

  if (periodType === PERIOD_KEY_MONTHLY) {
    return {
      periodKey: `${ref.year}-MONTHLY-${String(ref.month + 1).padStart(2, '0')}`,
      label: `${ref.year}-${String(ref.month + 1).padStart(2, '0')}`,
      start: createDateFromIST(ref.year, ref.month, 1, 0, 0, 0, 0),
      end: createDateFromIST(ref.year, ref.month + 1, 0, 23, 59, 59, 999),
    };
  }

  if (periodType === PERIOD_KEY_QUARTERLY) {
    const quarter = Math.floor(ref.month / 3) + 1;
    const startMonth = (quarter - 1) * 3;
    return {
      periodKey: `${ref.year}-QUARTERLY-${quarter}`,
      label: `${ref.year}-Q${quarter}`,
      start: createDateFromIST(ref.year, startMonth, 1, 0, 0, 0, 0),
      end: createDateFromIST(ref.year, startMonth + 3, 0, 23, 59, 59, 999),
    };
  }

  return {
    periodKey: `${ref.year}-YEARLY`,
    label: String(ref.year),
    start: createDateFromIST(ref.year, 0, 1, 0, 0, 0, 0),
    end: createDateFromIST(ref.year, 11, 31, 23, 59, 59, 999),
  };
};

// Resolve a period by key, falling back to deriving the window on the fly.
exports.resolvePeriod = async (companyId, periodKey, refDate = new Date()) => {
  if (periodKey) {
    const match = /^(\d{4})-(MONTHLY|QUARTERLY|YEARLY)(?:-(\d{1,2}))?$/.exec(periodKey);
    if (match) {
      const [, , type] = match;
      let window = {};
      if (type === PERIOD_KEY_MONTHLY || type === PERIOD_KEY_QUARTERLY) {
        window = exports.getPeriodWindow(type, refDate);
        if (window.periodKey === periodKey) return window;
        // Reconstruct the exact historical window from the key parts.
        const year = Number(match[1]);
        const part = Number(match[3]);
        if (type === PERIOD_KEY_MONTHLY) {
          window = {
            periodKey,
            label: `${year}-${String(part).padStart(2, '0')}`,
            start: createDateFromIST(year, part - 1, 1, 0, 0, 0, 0),
            end: createDateFromIST(year, part, 0, 23, 59, 59, 999),
          };
        } else {
          const startMonth = (part - 1) * 3;
          window = {
            periodKey,
            label: `${year}-Q${part}`,
            start: createDateFromIST(year, startMonth, 1, 0, 0, 0, 0),
            end: createDateFromIST(year, startMonth + 3, 0, 23, 59, 59, 999),
          };
        }
      } else {
        window = exports.getPeriodWindow(type, refDate);
        if (window.periodKey === periodKey) return window;
        window = {
          periodKey,
          label: match[1],
          start: createDateFromIST(Number(match[1]), 0, 1, 0, 0, 0, 0),
          end: createDateFromIST(Number(match[1]), 11, 31, 23, 59, 59, 999),
        };
      }
      return window;
    }
  }
  return exports.getPeriodWindow('YEARLY', refDate);
};

// Upsert a materialised LeavePeriod for a company + periodType + refDate.
exports.ensurePeriod = async (companyId, periodType, refDate = new Date()) => {
  const window = exports.getPeriodWindow(periodType, refDate);
  const ref = getISTDateComponents(refDate);

  const period = await LeavePeriod.findOneAndUpdate(
    {
      companyId,
      periodType,
      periodKey: window.periodKey,
    },
    {
      $set: {
        year: ref.year,
        month: periodType === PERIOD_KEY_MONTHLY ? ref.month + 1 : null,
        quarter:
          periodType === PERIOD_KEY_QUARTERLY
            ? Math.floor(ref.month / 3) + 1
            : null,
        label: window.label,
        startDate: window.start,
        endDate: window.end,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return { ...window, _id: period._id };
};