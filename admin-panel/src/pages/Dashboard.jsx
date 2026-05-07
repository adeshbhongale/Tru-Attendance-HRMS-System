import {
  AlertCircle,
  CalendarCheck,
  Clock,
  Loader2,
  Users, Calendar, ChevronLeft, ChevronRight, RotateCcw
} from 'lucide-react';
import React, { useEffect, useState, useRef } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import api from '../api/axios';
import { AnimatePresence, motion } from 'framer-motion';

const StatCard = ({ title, value, icon, color, trend, loading }) => (
  <div className="bg-white border border-slate-200 p-4 md:p-6 rounded-2xl flex-1 hover:shadow-xl hover:shadow-slate-200 transition-all duration-500 group">
    <div className="flex justify-between items-start mb-6">
      <div
        className="p-3 rounded-xl flex items-center justify-center border border-slate-100 shadow-sm group-hover:scale-110 transition-transform"
        style={{ backgroundColor: '#f8fafc', color: '#4f46e5' }}
      >
        {React.cloneElement(icon, { size: 20, strokeWidth: 2.5 })}
      </div>
      {trend !== undefined && (
        <span className={`px-2 py-1 rounded-lg text-[11px] font-bold tracking-tight ${trend > 0 ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-rose-50 text-rose-600 border border-rose-100'}`}>
          {trend > 0 ? '↑' : '↓'} {Math.abs(trend)}%
        </span>
      )}
    </div>
    <div className="space-y-0.5">
      <h3 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight">
        {loading ? <Loader2 className="animate-spin text-slate-200" size={24} /> : value}
      </h3>
      <p className="text-[11px] font-bold text-slate-500 tracking-tight">{title}</p>
    </div>
  </div>
);

const Dashboard = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  const formatDateString = (date) => {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const [selectedDate, setSelectedDate] = useState(formatDateString(new Date()));
  const [showCalendar, setShowCalendar] = useState(false);
  const calendarRef = useRef(null);
  const [currentMonth, setCurrentMonth] = useState(new Date());

  useEffect(() => {
    fetchStats();
  }, [selectedDate]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (calendarRef.current && !calendarRef.current.contains(event.target)) {
        setShowCalendar(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchStats = async () => {
    try {
      setLoading(true);
      const res = await api.get(`/reports/stats?date=${selectedDate}`);
      setStats(res.data.data);
    } catch (err) {
      console.error('Error fetching stats:', err);
    } finally {
      setLoading(false);
    }
  };

  const daysInMonth = (date) => new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  const startDayOfMonth = (date) => new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  const calendarDays = [];
  const totalDays = daysInMonth(currentMonth);
  const startDay = startDayOfMonth(currentMonth);
  for (let i = 0; i < startDay; i++) calendarDays.push(null);
  for (let i = 1; i <= totalDays; i++) calendarDays.push(i);

  const attendanceTrend = stats?.attendanceTrend || [
    { name: 'Mon', attendance: 0 },
    { name: 'Tue', attendance: 0 },
    { name: 'Wed', attendance: 0 },
    { name: 'Thu', attendance: 0 },
    { name: 'Fri', attendance: 0 },
    { name: 'Sat', attendance: 0 },
    { name: 'Sun', attendance: 0 },
  ];

  return (
    <div className="space-y-6 md:space-y-8 animate-fade-up">
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-6">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight m-0">Dashboard Overview</h2>
          <p className="text-slate-600 font-bold text-[13px] mt-2">View daily attendance and staff stats</p>
        </div>

        <div className="flex flex-wrap items-center gap-4 w-full xl:w-auto">
          {/* Calendar Picker (Today/Yesterday/Custom buttons REMOVED per request) */}
          <div className="relative" ref={calendarRef}>
            <div 
              className={`flex items-center gap-3 border px-5 py-3 rounded-2xl shadow-sm hover:bg-slate-50 transition-all min-w-[180px] cursor-pointer ${
                selectedDate ? 'bg-indigo-50 border-indigo-200 text-indigo-600' : 'bg-white border-slate-200 text-slate-700'
              }`}
              onClick={() => setShowCalendar(!showCalendar)}
            >
              <Calendar size={16} />
              <span className="text-sm font-bold">
                {new Date(selectedDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
            </div>

            <AnimatePresence>
              {showCalendar && (
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 10, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  className="absolute top-full right-0 mt-2 z-[110] bg-white border border-slate-200 rounded-3xl shadow-2xl p-6 w-80"
                >
                  <div className="flex justify-between items-center mb-6">
                    <h4 className="text-sm font-bold text-slate-900">
                      {currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                    </h4>
                    <div className="flex gap-1">
                      <button onClick={() => setCurrentMonth(new Date(currentMonth.setMonth(currentMonth.getMonth() - 1)))} className="p-2 hover:bg-slate-50 text-slate-400 rounded-lg"><ChevronLeft size={16} /></button>
                      <button onClick={() => setCurrentMonth(new Date(currentMonth.setMonth(currentMonth.getMonth() + 1)))} className="p-2 hover:bg-slate-50 text-slate-400 rounded-lg"><ChevronRight size={16} /></button>
                    </div>
                  </div>
                  <div className="grid grid-cols-7 gap-1 mb-2">
                    {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(d => (
                      <div key={d} className="text-[10px] font-bold text-slate-400 text-center py-2">{d}</div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 gap-1">
                    {calendarDays.map((day, idx) => {
                      if (!day) return <div key={idx} className="h-9" />;
                      const dateObj = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
                      const isFuture = dateObj > new Date();
                      const isSelected = selectedDate === formatDateString(dateObj);
                      const isToday = formatDateString(dateObj) === formatDateString(new Date());

                      return (
                        <button
                          key={idx}
                          disabled={isFuture}
                          onClick={() => {
                            setSelectedDate(formatDateString(dateObj));
                            setShowCalendar(false);
                          }}
                          className={`h-9 flex flex-col items-center justify-center rounded-xl text-[11px] font-bold transition-all relative ${
                            isFuture ? 'text-slate-200 cursor-not-allowed' : 
                            isSelected ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' : 'text-slate-700 hover:bg-indigo-50 hover:text-indigo-600'
                          }`}
                        >
                          {day}
                          {isToday && !isSelected && <div className="absolute bottom-1 w-1 h-1 rounded-full bg-indigo-600" />}
                        </button>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        <StatCard
          title="Total Staff"
          value={stats?.totalEmployees || 0}
          icon={<Users />}
          color="#4f46e5"
          trend={stats?.employeeGrowth}
          loading={loading}
        />
        <StatCard
          title="Staff Present"
          value={stats?.presentToday || 0}
          icon={<CalendarCheck />}
          color="#4f46e5"
          trend={stats?.attendanceChange}
          loading={loading}
        />
        <StatCard
          title="Late Comers"
          value={stats?.lateToday || 0}
          icon={<Clock />}
          color="#4f46e5"
          trend={stats?.lateChange}
          loading={loading}
        />
        <StatCard
          title="Pending Leaves"
          value={stats?.pendingLeaves || 0}
          icon={<AlertCircle />}
          color="#4f46e5"
          loading={loading}
        />
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 md:gap-8">
        <div className="xl:col-span-2 bg-white border border-slate-200 p-6 md:p-8 rounded-2xl shadow-lg shadow-slate-200/40">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
            <h3 className="text-sm font-bold text-slate-800 tracking-tight">Weekly attendance report</h3>
            <div className="text-[11px] font-bold text-slate-600 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200 tracking-tight">
              Last 7 days
            </div>
          </div>

          <div className="h-[320px] w-full min-h-[320px]">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
              <AreaChart data={attendanceTrend}>
                <defs>
                  <linearGradient id="colorAttend" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#4f46e5" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis
                  dataKey="name"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#475569', fontSize: 11, fontWeight: 700 }}
                  dy={10}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#475569', fontSize: 11, fontWeight: 700 }}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: '12px',
                    border: '1px solid #cbd5e1',
                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                    backgroundColor: 'white',
                    padding: '12px'
                  }}
                  itemStyle={{ fontWeight: 800, fontSize: '13px', color: '#4f46e5' }}
                />
                <Area
                  type="monotone"
                  dataKey="attendance"
                  stroke="#4f46e5"
                  strokeWidth={3}
                  fillOpacity={1}
                  fill="url(#colorAttend)"
                  animationDuration={2500}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white border border-slate-200 p-6 md:p-8 rounded-2xl shadow-lg shadow-slate-200/40">
          <div className="mb-8">
            <h3 className="text-sm font-bold text-slate-800 tracking-tight">Department data</h3>
            <p className="text-[11px] font-bold text-slate-500 mt-1">Staff count by department</p>
          </div>
          <div className="h-[320px] w-full min-h-[320px]">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
              <BarChart data={stats?.departmentStats || []}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis
                  dataKey="name"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#475569', fontSize: 11, fontWeight: 700 }}
                  dy={10}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#475569', fontSize: 11, fontWeight: 700 }}
                />
                <Tooltip 
                  cursor={{ fill: '#f1f5f9', radius: 8 }}
                  contentStyle={{
                    borderRadius: '12px',
                    border: '1px solid #cbd5e1',
                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                    backgroundColor: 'white'
                  }}
                />
                <Bar
                  dataKey="value"
                  fill="#4f46e5"
                  radius={[6, 6, 0, 0]}
                  barSize={32}
                  animationDuration={2500}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
