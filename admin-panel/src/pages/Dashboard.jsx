import { AnimatePresence, motion } from 'framer-motion';
import {
  BrainCircuit,
  Calendar,
  CalendarCheck,
  Loader2,
  UserMinus,
  Users,
  UserX,
  Bell
} from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import socket from '../socket';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import api from '../api/axios';
import CalendarPicker from '../components/CalendarPicker';

const StatCard = ({ title, value, icon, color, trend, loading }) => (
  <div className="bg-white border border-slate-200 p-4 md:p-6 rounded-2xl flex-1 hover:shadow-xl hover:shadow-slate-200 transition-all duration-500 group flex flex-col items-center justify-center text-center">
    <div className="p-4 rounded-2xl flex items-center justify-center border border-slate-100 shadow-sm group-hover:scale-110 transition-transform mb-3"
      style={{ backgroundColor: '#f8fafc', color: '#4f46e5' }}
    >
      {React.cloneElement(icon, { size: 25, strokeWidth: 2.5 })}
    </div>
    <div className="space-y-1">
      <h3 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight">
        {loading ? <Loader2 className="animate-spin text-slate-200" size={24} /> : value}
      </h3>
      <p className="text-[10px] font-bold text-slate-500 tracking-tight tracking-widest">{title}</p>
    </div>
    {trend !== undefined && (
      <span className={`mt-3 px-2 py-1 rounded-lg text-[10px] font-bold tracking-tight ${trend > 0 ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-rose-50 text-rose-600 border border-rose-100'}`}>
        {trend > 0 ? '↑' : '↓'} {Math.abs(trend)}%
      </span>
    )}
  </div>
);

const Dashboard = () => {
  const navigate = useNavigate();
  const { user } = useSelector((state) => state.auth);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!user?._id) return;
    
    const fetchUnreadCount = async () => {
      try {
        const res = await api.get('/notifications/employee/unread-count');
        if (res.data.success) {
          setUnreadCount(res.data.count);
        }
      } catch (err) {
        console.error('Failed to fetch unread count:', err);
      }
    };
    
    fetchUnreadCount();

    const handleBadgeUpdate = (data) => {
      if (typeof data.unreadCount === 'number') {
        setUnreadCount(data.unreadCount);
      } else if (data.unreadCountIncrement) {
        setUnreadCount((c) => c + data.unreadCountIncrement);
      }
    };

    socket.on(`notificationBadgeUpdate:${user._id}`, handleBadgeUpdate);

    return () => {
      socket.off(`notificationBadgeUpdate:${user._id}`, handleBadgeUpdate);
    };
  }, [user?._id]);

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
      // Error handled silently
    } finally {
      setLoading(false);
    }
  };


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
          {/* Admin Notifications Icon */}
          <button
            onClick={() => navigate('/admin-notifications')}
            className="relative flex items-center justify-center bg-white hover:bg-slate-50 border border-slate-200 text-slate-600 hover:text-indigo-600 w-12 h-12 rounded-2xl shadow-sm transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
            title="Admin Notifications"
          >
            <Bell size={20} />
            {unreadCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-5 h-5 flex items-center justify-center bg-rose-500 text-white rounded-full text-[10px] font-extrabold px-1.5 shadow-md shadow-rose-200 animate-pulse">
                {unreadCount}
              </span>
            )}
          </button>

          <button
            onClick={() => navigate('/ai-analytics')}
            className="flex items-center gap-3 bg-gradient-to-r from-indigo-600 to-violet-600 text-white px-6 py-3 rounded-2xl shadow-lg shadow-indigo-100 hover:shadow-indigo-200 transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            <BrainCircuit size={18} />
            <span className="text-sm font-bold tracking-tight">Business AI Insights</span>
          </button>

          {/* Calendar Picker (Today/Yesterday/Custom buttons REMOVED per request) */}
          <div className="relative" ref={calendarRef}>
            <div
              className={`flex items-center gap-3 border px-5 py-3 rounded-2xl shadow-sm hover:bg-slate-50 transition-all min-w-[180px] cursor-pointer ${selectedDate ? 'bg-indigo-50 border-indigo-200 text-indigo-600' : 'bg-white border-slate-200 text-slate-700'
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
                  className="absolute top-full right-0 mt-2 z-[110] bg-white border border-slate-200 rounded-3xl shadow-2xl p-6"
                >
                  <CalendarPicker
                    selectedDate={selectedDate}
                    onSelect={setSelectedDate}
                    onClose={() => setShowCalendar(false)}
                  />
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
          title="Leave Staff"
          value={stats?.onLeaveToday || 0}
          icon={<UserX />}
          color="#f59e0b"
          loading={loading}
        />
        <StatCard
          title="Absent Staff"
          value={stats?.absentToday || 0}
          icon={<UserMinus />}
          color="#ef4444"
          loading={loading}
        />
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        <div className="bg-white border border-slate-200 p-6 md:p-8 rounded-3xl shadow-xl shadow-slate-100/50">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
            <h3 className="text-sm font-bold text-slate-800 tracking-tight">Weekly attendance report</h3>
            <div className="text-[11px] font-bold text-slate-600 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200 tracking-tight">
              Last 7 days
            </div>
          </div>

          <div className="h-[320px] w-full min-h-[320px]">
            <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={150} debounce={50}>
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

        <div className="bg-white border border-slate-200 p-6 md:p-8 rounded-3xl shadow-xl shadow-slate-100/50">
          <div className="mb-1">
            <h3 className="text-sm font-bold text-slate-800 tracking-tight">Department Activity</h3>
            <p className="text-[11px] font-bold text-slate-500 mt-1">Staff present on {new Date(selectedDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
          </div>
          <div className="h-[320px] w-full min-h-[320px] relative">
            <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={150} debounce={50}>
              <PieChart>
                <Pie
                  data={stats?.departmentStats || []}
                  innerRadius={85}
                  outerRadius={115}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {(stats?.departmentStats || []).map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={['#6366f1', '#10b981', '#8b5cf6', '#3b82f6', '#f59e0b', '#ec4899', '#06b6d4'][index % 7]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    borderRadius: '16px',
                    border: 'none',
                    boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                    padding: '12px'
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none mt-4">
              <span className="text-4xl font-bold text-slate-800">
                {(stats?.departmentStats || []).reduce((acc, curr) => acc + (Number(curr.value) || 0), 0)}
              </span>
              <span className="text-[10px] font-bold text-slate-400 tracking-widest">Total Present</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 mt-6 max-h-24 overflow-y-auto no-scrollbar">
            {(stats?.departmentStats || []).map((dept, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: ['#6366f1', '#10b981', '#8b5cf6', '#3b82f6', '#f59e0b', '#ec4899', '#06b6d4'][idx % 7] }} />
                <span className="text-[11px] font-bold text-slate-500 truncate">{dept.name}: {dept.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div >
  );
};

export default Dashboard;
