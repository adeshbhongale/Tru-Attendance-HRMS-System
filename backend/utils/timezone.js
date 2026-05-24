// Timezone utility to handle India Standard Time (IST, UTC+5.5) independently of server timezone

const getISTDateComponents = (date = new Date()) => {
  const istTime = new Date(date.getTime() + (5.5 * 60 * 60 * 1000));
  return {
    year: istTime.getUTCFullYear(),
    month: istTime.getUTCMonth(),
    date: istTime.getUTCDate(),
    hour: istTime.getUTCHours(),
    minute: istTime.getUTCMinutes(),
    second: istTime.getUTCSeconds(),
    millisecond: istTime.getUTCMilliseconds(),
    dayName: istTime.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' })
  };
};

const createDateFromIST = (year, month, dateNum, hour, minute, second = 0, millisecond = 0) => {
  const utcDate = new Date(Date.UTC(year, month, dateNum, hour, minute, second, millisecond));
  return new Date(utcDate.getTime() - (5.5 * 60 * 60 * 1000));
};

const getStartOfDayIST = (date = new Date()) => {
  const ist = getISTDateComponents(date);
  return createDateFromIST(ist.year, ist.month, ist.date, 0, 0, 0, 0);
};

const getEndOfDayIST = (date = new Date()) => {
  const ist = getISTDateComponents(date);
  return createDateFromIST(ist.year, ist.month, ist.date, 23, 59, 59, 999);
};

const matchShift = (now, shift, isNewEmployee = false) => {
  const [sH, sM] = shift.startTime.split(':').map(Number);
  const [eH, eM] = shift.endTime.split(':').map(Number);

  const nowIST = getISTDateComponents(now);
  const candidateOffsets = [-1, 0, 1];
  
  let matched = null;
  let closest = null;
  let minDiff = Infinity;

  for (const offset of candidateOffsets) {
    const targetDateCandidate = new Date(Date.UTC(nowIST.year, nowIST.month, nowIST.date + offset));
    const targetY = targetDateCandidate.getUTCFullYear();
    const targetM = targetDateCandidate.getUTCMonth();
    const targetD = targetDateCandidate.getUTCDate();

    const shiftStart = createDateFromIST(targetY, targetM, targetD, sH, sM);
    let shiftEnd = createDateFromIST(targetY, targetM, targetD, eH, eM);

    if (eH < sH || (eH === sH && eM < sM)) {
      shiftEnd = createDateFromIST(targetY, targetM, targetD + 1, eH, eM);
    }

    const earlyBuffer = 60 * 60 * 1000;
    const windowStart = new Date(shiftStart.getTime() - earlyBuffer);
    const windowEnd = shiftEnd;

    if (now >= windowStart && now <= windowEnd) {
      matched = {
        shiftStart,
        shiftEnd,
        date: new Date(Date.UTC(targetY, targetM, targetD))
      };
      break;
    }

    const diff = Math.abs(shiftStart - now);
    if (diff < minDiff) {
      minDiff = diff;
      closest = {
        shiftStart,
        shiftEnd,
        date: new Date(Date.UTC(targetY, targetM, targetD))
      };
    }
  }

  if (matched) {
    return { matched: true, ...matched };
  }

  if (isNewEmployee && closest) {
    return { matched: true, ...closest };
  }

  // Find closest future shift for error message
  let closestFutureShift = null;
  let minFutureDiff = Infinity;
  for (const offset of [0, 1]) {
    const targetDateCandidate = new Date(Date.UTC(nowIST.year, nowIST.month, nowIST.date + offset));
    const targetY = targetDateCandidate.getUTCFullYear();
    const targetM = targetDateCandidate.getUTCMonth();
    const targetD = targetDateCandidate.getUTCDate();

    const shiftStart = createDateFromIST(targetY, targetM, targetD, sH, sM);
    const diff = shiftStart - now;
    if (diff > 0 && diff < minFutureDiff) {
      minFutureDiff = diff;
      closestFutureShift = shiftStart;
    }
  }

  return {
    matched: false,
    closestFutureShift
  };
};

module.exports = {
  getISTDateComponents,
  createDateFromIST,
  getStartOfDayIST,
  getEndOfDayIST,
  matchShift
};
