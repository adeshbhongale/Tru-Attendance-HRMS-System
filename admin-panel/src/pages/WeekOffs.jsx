import React, { useEffect, useState } from 'react';
import { Calendar, CheckCircle2, Loader2, Save } from 'lucide-react';
import api from '../api/axios';
import toast from 'react-hot-toast';


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

  return (
    <div className="max-w-4xl mx-auto animate-fade-up space-y-8 pb-32">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight m-0">Weekly Offs</h2>
          <p className="text-slate-600 font-bold text-[13px] mt-2">Configure standard non-working days</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 bg-indigo-600 text-white px-6 py-3 rounded-2xl font-bold text-sm shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all active:scale-95 disabled:opacity-50"
        >
          {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
          Save Configuration
        </button>
      </div>

      <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-xl p-8 space-y-8">
        <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 flex items-center gap-4">
          <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-indigo-600 shadow-sm">
            <Calendar size={24} />
          </div>
          <div>
            <h4 className="text-sm font-bold text-slate-900 m-0">Standard Organization Week Offs</h4>
            <p className="text-[11px] font-medium text-slate-500">Selected days will be marked as weekly offs for all employees.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((day) => (
            <button
              key={day}
              onClick={() => toggleWeeklyOff(day)}
              className={`group flex items-center justify-between p-6 rounded-2xl border-2 transition-all ${
                weeklyOffs.includes(day)
                ? 'bg-indigo-600 border-indigo-600 text-white shadow-xl shadow-indigo-100'
                : 'bg-white border-slate-100 text-slate-600 hover:border-indigo-100'
              }`}
            >
              <span className="font-bold text-sm">{day}</span>
              {weeklyOffs.includes(day) && <CheckCircle2 size={18} />}
            </button>
          ))}
        </div>
      </div>


    </div>
  );
};

export default WeekOffs;
