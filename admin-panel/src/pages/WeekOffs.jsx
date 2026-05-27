import { Calendar, CheckCircle2, Loader2, Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../api/axios';

const WeekOffs = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [weeklyOffs, setWeeklyOffs] = useState([]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await api.get('/settings/office');
      if (res.data.data) {
        setWeeklyOffs(res.data.data.weeklyOffs || []);
      }
    } catch (err) {
      toast.error('Failed to load week off settings');
    } finally {
      setLoading(false);
    }
  };

  const toggleWeeklyOff = (day) => {
    const current = [...weeklyOffs];
    if (current.includes(day)) {
      setWeeklyOffs(current.filter(d => d !== day));
    } else {
      setWeeklyOffs([...current, day]);
    }
  };

  const handleSave = async () => {
    if (weeklyOffs.length === 0) {
      toast.error('At least one weekly off day selection is compulsory.');
      return;
    }
    try {
      setSaving(true);
      await api.put('/settings/office', { weeklyOffs });
      toast.success('Week offs updated successfully');
    } catch (err) {
      toast.error('Failed to update week offs');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-96">
        <Loader2 className="animate-spin text-indigo-600" size={40} />
      </div>
    );
  }

  const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  return (
    <div className="max-w-4xl mx-auto animate-fade-up space-y-8 pb-32">
      {/* Header Section */}
      <div>
        <h2 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight m-0">Weekly Off Settings</h2>
        <p className="text-slate-500 font-medium text-[13px] mt-2">Configure standard non-working days for your organization</p>
      </div>

      {/* Main Settings Card */}
      <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-xl p-8 space-y-8">
        <div className="bg-gradient-to-r from-indigo-50/50 to-indigo-100/30 p-6 rounded-3xl border border-indigo-50/50 flex items-start gap-4">
          <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-indigo-600 shadow-md shadow-indigo-50 shrink-0">
            <Calendar size={24} />
          </div>
          <div>
            <h4 className="text-sm font-bold text-slate-900 m-0">Standard Organization Week Offs</h4>
            <p className="text-[11px] font-medium text-slate-500 mt-1.5 leading-relaxed">
              Toggle weekly off status for any day of the week. Selected days are recognized globally in the HRMS system.
              <span className="text-indigo-600 font-bold ml-1">At least one weekly off day selection is compulsory.</span>
            </p>
          </div>
        </div>

        {/* Grid including the days and Save Changes button */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {daysOfWeek.map((day) => {
            const isSelected = weeklyOffs.includes(day);
            const isWeekend = day === 'Saturday' || day === 'Sunday';
            return (
              <button
                key={day}
                type="button"
                onClick={() => toggleWeeklyOff(day)}
                className={`group flex flex-col justify-between p-6 rounded-2xl border-2 transition-all duration-300 text-left min-h-[140px] ${isSelected
                  ? 'bg-gradient-to-br from-indigo-600 to-indigo-700 border-transparent text-white shadow-xl shadow-indigo-100 translate-y-[-2px]'
                  : 'bg-white border-slate-100 hover:border-indigo-100 hover:bg-slate-50/40 text-slate-700'
                  }`}
              >
                <div className="flex justify-between items-start w-full">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs transition-all ${isSelected
                    ? 'bg-white/20 text-white'
                    : isWeekend
                      ? 'bg-rose-50 text-rose-600'
                      : 'bg-slate-50 text-slate-500 group-hover:bg-indigo-50 group-hover:text-indigo-600'
                    }`}>
                    {day.substring(0, 3).toUpperCase()}
                  </div>
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center border transition-all ${isSelected
                    ? 'bg-white border-white text-indigo-600 scale-100'
                    : 'border-slate-200 text-transparent scale-90 group-hover:border-indigo-300'
                    }`}>
                    <CheckCircle2 size={14} className={isSelected ? 'fill-indigo-600 text-white' : ''} />
                  </div>
                </div>

                <div className="mt-4">
                  <span className="font-extrabold text-sm block">{day}</span>
                  <span className={`text-[10px] block mt-0.5 ${isSelected
                    ? 'text-indigo-100 font-medium'
                    : isWeekend
                      ? 'text-rose-400 font-medium'
                      : 'text-slate-400 font-medium'
                    }`}>
                    {isSelected ? 'Weekly Off Active' : isWeekend ? 'Weekend Day' : 'Weekday'}
                  </span>
                </div>
              </button>
            );
          })}

          {/* Save changes button box side of Sunday (8th item in the grid) */}
          <div className="flex flex-col justify-end p-6 rounded-2xl border-2 border-dashed border-indigo-100 bg-indigo-50/20 min-h-[140px]">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white py-5 px-4 mb-3 rounded-xl font-bold text-xs transition-all active:scale-95 shadow-md shadow-indigo-100 disabled:opacity-50"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WeekOffs;
