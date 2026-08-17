const CompanySetting = require('../../models/CompanySetting');
const Holiday = require('../../models/Holiday');
const { getISTDateComponents, getStartOfDayIST, createDateFromIST } = require('../../utils/timezone');

// Fetch company leave context (weekly offs + holiday dates) once per request.
exports.getCompanyLeaveContext = async (companyId) => {
  const settings = companyId
    ? await CompanySetting.findOne({ companyId }).lean()
    : null;
  const weeklyOffs = (settings?.weeklyOffs && settings.weeklyOffs.length
    ? settings.weeklyOffs
    : ['Sunday']);

  const holidays = companyId
    ? await Holiday.find({ companyId, status: 'active' }).select('holiday_date').lean()
    : [];
  const holidayDates = new Set(
    holidays.map((h) => {
      const c = getISTDateComponents(new Date(h.holiday_date));
      return `${c.year}-${c.month + 1}-${c.date}`;
    })
  );

  return { weeklyOffs, holidayDates };
};

// Count leave days excluding weekly offs and company holidays.
// Half Day = 0.5; Full Day range counts only working days.
exports.calculateLeaveDays = (leave, context) => {
  if (leave.duration === 'Half Day') return 0.5;
  if (typeof leave.durationDays === 'number' && leave.durationDays > 0) {
    return leave.durationDays;
  }

  const weeklyOffs = context?.weeklyOffs || ['Sunday'];
  const holidayDates = context?.holidayDates || new Set();

  const start = getStartOfDayIST(new Date(leave.startDate));
  const end = getStartOfDayIST(new Date(leave.endDate)).getTime();

  let days = 0;
  const cursor = new Date(start);
  while (cursor.getTime() <= end) {
    const c = getISTDateComponents(cursor);
    const key = `${c.year}-${c.month + 1}-${c.date}`;
    if (!weeklyOffs.includes(c.dayName) && !holidayDates.has(key)) {
      days += 1;
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  if (days === 0 && leave.startDate && leave.endDate) {
    const totalDays = Math.ceil((new Date(leave.endDate) - new Date(leave.startDate)) / (1000 * 60 * 60 * 24)) + 1;
    return Math.max(1, totalDays);
  }

  return days;
};

exports.getStartOfDayIST = getStartOfDayIST;
exports.getISTDateComponents = getISTDateComponents;
exports.createDateFromIST = createDateFromIST;