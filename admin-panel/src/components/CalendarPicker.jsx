import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';

const CalendarPicker = ({ selectedDate, onSelect, onClose, allowFutureOnly = false, allowAll = false }) => {
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const formatDateString = (date) => {
    // If it's already a date object, we might need to handle it carefully
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
    setCurrentMonth(new Date(currentMonth.setMonth(currentMonth.getMonth() + offset)));
  };

  return (
    <div className="w-[280px] sm:w-80">
      <div className="flex justify-between items-center mb-6">
        <h4 className="text-sm font-bold text-slate-900 tracking-tight">
          {currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
        </h4>
        <div className="flex gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); changeMonth(-1); }}
            className="p-2 hover:bg-slate-100 text-slate-400 hover:text-indigo-600 rounded-xl transition-all"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); changeMonth(1); }}
            className="p-2 hover:bg-slate-100 text-slate-400 hover:text-indigo-600 rounded-xl transition-all"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-2">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, idx) => (
          <div key={`${d}-${idx}`} className="text-[10px] font-bold text-slate-400 text-center py-2 tracking-widest ">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {calendarDays.map((day, idx) => {
          if (!day) return <div key={idx} className="h-10" />;

          const dateObj = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
          const dateStr = formatDateString(dateObj);

          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const checkDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);

          const isPast = checkDate < today;
          const isFuture = checkDate > new Date();
          const isToday = dateStr === formatDateString(new Date());

          const isDisabled = allowAll ? false : (allowFutureOnly ? isPast : (isFuture && !isToday));
          const isSelected = selectedDate === dateStr;

          return (
            <button
              key={idx}
              disabled={isDisabled}
              onClick={(e) => {
                e.stopPropagation();
                onSelect(dateStr);
                onClose();
              }}
              className={`h-10 flex flex-col items-center justify-center rounded-xl text-[11px] font-bold transition-all relative ${isDisabled ? 'text-slate-200 cursor-not-allowed bg-transparent' :
                isSelected ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-100' : 'text-slate-700 hover:bg-indigo-50 hover:text-indigo-600'
                }`}
            >
              {day}
              {isToday && !isSelected && (
                <div className="absolute bottom-1.5 w-1 h-1 rounded-full bg-indigo-600" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default CalendarPicker;
