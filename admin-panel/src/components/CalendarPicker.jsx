import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const CalendarPicker = ({ selectedDate, onSelect, onSelectDate, onClose, allowFutureOnly = false, allowAll = false, allowedDays = [] }) => {
  const validAllowedDays = useMemo(() => {
    if (!Array.isArray(allowedDays)) return [];
    return allowedDays.filter(d => d && d !== 'All');
  }, [allowedDays]);

  const allowedDayIndices = useMemo(() => {
    if (validAllowedDays.length === 0 || validAllowedDays.length >= 7) return null;
    return new Set(
      validAllowedDays
        .map(d => DAY_NAMES.findIndex(dn => dn.toLowerCase() === String(d).trim().toLowerCase()))
        .filter(i => i >= 0)
    );
  }, [validAllowedDays]);
  const [currentMonth, setCurrentMonth] = useState(() => {
    if (selectedDate) {
      const d = typeof selectedDate === 'string' ? new Date(selectedDate + 'T00:00:00') : new Date(selectedDate);
      if (!isNaN(d.getTime())) return d;
    }
    return new Date();
  });

  const handleSelect = (dateStr) => {
    if (typeof onSelect === 'function') onSelect(dateStr);
    if (typeof onSelectDate === 'function') onSelectDate(dateStr);
    if (typeof onClose === 'function') onClose();
  };

  const formatDateString = (date) => {
    const d = typeof date === 'string' ? new Date(date + 'T00:00:00') : new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const daysInMonth = (date) => new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  const startDayOfMonth = (date) => new Date(date.getFullYear(), date.getMonth(), 1).getDay();

  const calendarDays = useMemo(() => {
    const days = [];
    const totalDays = daysInMonth(currentMonth);
    const startDay = startDayOfMonth(currentMonth);
    for (let i = 0; i < startDay; i++) days.push(null);
    for (let i = 1; i <= totalDays; i++) days.push(i);
    return days;
  }, [currentMonth]);

  const changeMonth = (offset) => {
    const newDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + offset, 1);
    setCurrentMonth(newDate);
  };

  return (
    <div className="w-[280px] sm:w-80 p-4">
      <div className="flex justify-between items-center mb-4">
        <h4 className="text-sm font-bold text-slate-900 tracking-tight">
          {currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
        </h4>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); changeMonth(-1); }}
            className="p-1.5 hover:bg-slate-100 text-slate-500 hover:text-indigo-600 rounded-xl transition-all"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); changeMonth(1); }}
            className="p-1.5 hover:bg-slate-100 text-slate-500 hover:text-indigo-600 rounded-xl transition-all"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {allowedDayIndices && (
        <div className="mb-2 px-2.5 py-1 bg-indigo-50 border border-indigo-100 rounded-xl text-[10px] font-bold text-indigo-600 text-center">
          Only allowed: {validAllowedDays.join(', ')}
        </div>
      )}

      <div className="grid grid-cols-7 gap-1 mb-2">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, idx) => (
          <div key={`${d}-${idx}`} className={`text-[10px] font-bold text-center py-1.5 tracking-wider ${allowedDayIndices ? (allowedDayIndices.has(idx) ? 'text-indigo-600' : 'text-slate-200') : 'text-slate-400'}`}>
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {calendarDays.map((day, idx) => {
          if (!day) return <div key={idx} className="h-9" />;

          const dateObj = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
          const isAllowedDay = !allowedDayIndices || allowedDayIndices.has(dateObj.getDay());
          const dateStr = formatDateString(dateObj);

          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const checkDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);

          const isPast = checkDate < today;
          const isFuture = checkDate > new Date();
          const isToday = dateStr === formatDateString(new Date());

          const isDisabled = !isAllowedDay || (allowAll ? false : (allowFutureOnly ? isPast : (isFuture && !isToday)));
          const isSelected = selectedDate === dateStr;

          return (
            <button
              type="button"
              key={idx}
              disabled={isDisabled}
              onClick={(e) => {
                e.stopPropagation();
                handleSelect(dateStr);
              }}
              className={`h-9 flex flex-col items-center justify-center rounded-xl text-xs font-bold transition-all relative ${isDisabled ? 'text-slate-300 cursor-not-allowed bg-slate-50/60' :
                  isSelected ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200' :
                  allowedDayIndices ? 'bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100' : 'text-slate-700 hover:bg-indigo-50 hover:text-indigo-600'
                }`}
            >
              {day}
              {isToday && !isSelected && (
                <div className="absolute bottom-1 w-1 h-1 rounded-full bg-indigo-600" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default CalendarPicker;
