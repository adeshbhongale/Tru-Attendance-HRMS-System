import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';

/**
 * MiniCalendar — compact monthly calendar card with month navigation.
 *
 * Features:
 *  - Starts on the real current month, but ‹ › arrows let you browse any month/year
 *  - Today: solid blue circle (only lights up when the real current month is being viewed)
 *  - Selected day: blue ring outline
 *  - Sundays: red text (col 0 of every row)
 *  - Public holidays: orange/amber text + "H" dot
 *  - Days with tasks: small blue dot below the number
 *  - Tapping any current-month day fires onDayPress(day, tasks[])
 *
 * Props:
 *   events      (Array)   — [{ day, tasks[], labels[], textColor }]
 *   holidays    (Array)   — day numbers that are public holidays e.g. [15, 26]
 *   selectedDay (number)  — currently selected day (shown with ring)
 *   onDayPress  (fn)      — callback(day: number, tasks: string[])
 */

const WEEKDAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const buildCalendarGrid = (year, month) => {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  const cells = [];
  for (let i = firstDay - 1; i >= 0; i--) {
    cells.push({ day: daysInPrevMonth - i, isCurrentMonth: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, isCurrentMonth: true });
  }
  const remainder = cells.length % 7;
  if (remainder !== 0) {
    for (let d = 1; d <= 7 - remainder; d++) {
      cells.push({ day: d, isCurrentMonth: false });
    }
  }
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }
  return weeks;
};

const MiniCalendar = ({ events = [], holidays = [], selectedDay = null, onDayPress }) => {
  const today = new Date();
  const todayYear = today.getFullYear();
  const todayMonth = today.getMonth();
  const todayDay = today.getDate();

  // The month/year currently being VIEWED — starts on today's month,
  // but can be moved independently via the ‹ › arrows.
  const [viewYear, setViewYear] = useState(todayYear);
  const [viewMonth, setViewMonth] = useState(todayMonth);

  const isViewingCurrentMonth = viewYear === todayYear && viewMonth === todayMonth;
  const weeks = buildCalendarGrid(viewYear, viewMonth);

  const goPrevMonth = () => {
    if (viewMonth === 0) {
      setViewYear((y) => y - 1);
      setViewMonth(11);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const goNextMonth = () => {
    if (viewMonth === 11) {
      setViewYear((y) => y + 1);
      setViewMonth(0);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  // Build event map keyed by day
  const eventMap = {};
  events.forEach((e) => { eventMap[e.day] = e; });

  // Build holiday set for O(1) lookup
  const holidaySet = new Set(holidays);

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const todayLabel = `${dayNames[today.getDay()]}, ${todayDay} ${MONTH_NAMES[todayMonth]} ${todayYear}`;

  const handleDayPress = (dayObj) => {
    if (!dayObj.isCurrentMonth) return;
    const eventData = eventMap[dayObj.day];
    const tasks = eventData?.tasks ?? [];
    if (onDayPress) onDayPress(dayObj.day, tasks);
  };

  return (
    <View className="pt-2 pb-2 px-9">
      {/* White Calendar Card */}
      <View className="bg-white rounded-[24px] p-3 shadow-xl shadow-black/5 mt-1">

        {/* Month Header with navigation arrows */}
        <View className="flex-row items-center justify-between mb-2 px-1">
          <TouchableOpacity
            onPress={goPrevMonth}
            activeOpacity={0.6}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            className="w-6 h-6 justify-center items-center"
          >
            <ChevronLeft size={16} color="#94a3b8" />
          </TouchableOpacity>

          <Text className="text-[#a0aec0] font-bold text-center tracking-[0.15em] text-[10px]">
            {MONTH_NAMES[viewMonth].toUpperCase()} {viewYear}
          </Text>

          <TouchableOpacity
            onPress={goNextMonth}
            activeOpacity={0.6}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            className="w-6 h-6 justify-center items-center"
          >
            <ChevronRight size={16} color="#94a3b8" />
          </TouchableOpacity>
        </View>

        {/* Weekday Initials — Sunday (col 0) is red */}
        <View className="flex-row justify-between mb-2">
          {WEEKDAY_INITIALS.map((d, idx) => (
            <Text
              key={idx}
              style={{ color: idx === 0 ? '#ef4444' : '#a0aec0' }}
              className="flex-1 text-center text-[9px] font-bold"
            >
              {d}
            </Text>
          ))}
        </View>

        {/* Day Grid */}
        {weeks.map((week, weekIdx) => (
          <View key={weekIdx} className="flex-row justify-between w-full">
            {week.map((dayObj, dayIdx) => {
              const isInactive = !dayObj.isCurrentMonth;
              const isSunday = dayIdx === 0;
              const isHoliday = dayObj.isCurrentMonth && holidaySet.has(dayObj.day);
              const isToday = isViewingCurrentMonth && dayObj.isCurrentMonth && dayObj.day === todayDay;
              const isSelected = dayObj.isCurrentMonth && dayObj.day === selectedDay && !isToday;
              const eventData = dayObj.isCurrentMonth ? eventMap[dayObj.day] : null;
              const hasEvent = !!eventData;

              // Determine text colour priority:
              // today → blue (circle), selected → blue ring, holiday → amber, sunday → red, event → custom, else → slate
              let textColor = '#1e293b'; // slate-800
              if (isInactive) textColor = '#e2e8f0'; // slate-200
              else if (isSunday) textColor = '#ef4444';
              else if (isHoliday) textColor = '#f59e0b';
              else if (eventData?.textColor) {
                const match = eventData.textColor.match(/#[0-9a-fA-F]{3,8}/);
                textColor = match ? match[0] : eventData.textColor;
              }

              return (
                <TouchableOpacity
                  key={dayIdx}
                  activeOpacity={isInactive ? 1 : 0.65}
                  onPress={() => handleDayPress(dayObj)}
                  className="flex-1 items-center min-h-[40px] justify-start pt-0.5"
                >
                  {/* Day number */}
                  {isToday ? (
                    <View className="w-6 h-6 rounded-full bg-[#1972e9] justify-center items-center mb-0.5">
                      <Text className="text-white font-bold text-[11px]">{dayObj.day}</Text>
                    </View>
                  ) : isSelected ? (
                    <View className="w-6 h-6 rounded-full border-2 border-[#1972e9] justify-center items-center mb-0.5">
                      <Text className="text-[#1972e9] font-bold text-[11px]">{dayObj.day}</Text>
                    </View>
                  ) : (
                    <View className="w-6 h-6 justify-center items-center mb-0.5">
                      <Text style={{ color: textColor, fontWeight: '700', fontSize: 11 }}>
                        {dayObj.day}
                      </Text>
                    </View>
                  )}

                  {/* Holiday label */}
                  {isHoliday && !isInactive && (
                    <Text style={{ color: '#f59e0b', fontSize: 7, fontWeight: '700', lineHeight: 10 }}>HOL</Text>
                  )}

                  {/* Sunday label (inactive grayed, active red) */}
                  {isSunday && !isInactive && !isHoliday && (
                    <Text style={{ color: '#ef4444', fontSize: 7, fontWeight: '700', lineHeight: 10 }}>SUN</Text>
                  )}

                  {/* Task dot */}
                  {hasEvent && !isInactive && (
                    <View className="w-1 h-1 rounded-full bg-[#1972e9] mb-0.5" />
                  )}

                  {/* Event labels (short text below dot) */}
                  {eventData?.labels?.map((lbl, lblIdx) => {
                    const match = (lbl.color || '').match(/#[0-9a-fA-F]{3,8}/);
                    const lblColor = match ? match[0] : (lbl.color || '#64748b');
                    return (
                      <Text
                        key={lblIdx}
                        style={{ color: lblColor, fontSize: 7.5, fontWeight: '700', textAlign: 'center', lineHeight: 10 }}
                      >
                        {lbl.text}
                      </Text>
                    );
                  })}
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </View>

      {/* Date label below card */}
      <Text className="text-white text-center font-bold text-[15px] mt-3 tracking-wide">
        {selectedDay && selectedDay !== todayDay
          ? `${MONTH_NAMES[viewMonth]} ${selectedDay}, ${viewYear}`
          : todayLabel}
      </Text>
    </View>
  );
};

export default MiniCalendar;