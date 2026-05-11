import {
  AnimatePresence,
  motion
} from 'framer-motion';
import {
  Calendar,
  ChevronDown,
  Loader2,
  TrendingUp
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  Cell,
  Pie,
  PieChart,
  Tooltip as RechartsTooltip,
  ResponsiveContainer
} from 'recharts';
import api from '../api/axios';
import CalendarPicker from '../components/CalendarPicker';

const AttendanceDashboard = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const getTodayStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const [selectedDate, setSelectedDate] = useState(getTodayStr());
  const [showCalendar, setShowCalendar] = useState(false);
  const calendarRef = useRef(null);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [activeTab, setActiveTab] = useState('Department Wise');
  const [search, setSearch] = useState('');
  
  const formatDuration = (decimalHours) => {
    if (!decimalHours || decimalHours <= 0) return '0m';
    const totalMinutes = Math.round(decimalHours * 60);
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    if (h === 0) return `${m}m`;
    if (m === 0) return `${h}hr`;
    return `${h}hr ${m}m`;
  };

  useEffect(() => {
    fetchDashboardData();
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

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const res = await api.get(`/reports/attendance-dashboard?date=${selectedDate}`);
      setData(res.data.data);
    } catch (err) {
      toast.error('Failed to load attendance dashboard');
    } finally {
      setLoading(false);
    }
  };

  const formatDateDisplay = (date) => {
    return new Date(date).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-');
  };

  if (loading && !data) {
    return (
      <div className="flex justify-center items-center h-96">
        <Loader2 className="animate-spin text-indigo-600" size={40} />
      </div>
    );
  }

  const attendanceDetails = [
    { name: 'Present', value: data?.attendanceDetails?.present || 0, color: '#facc15' },
    { name: 'Absent', value: data?.attendanceDetails?.absent || 0, color: '#cbd5e1' },
    { name: 'OnLeave', value: data?.attendanceDetails?.onLeave || 0, color: '#6366f1' },
    { name: 'UpcomingShift', value: data?.attendanceDetails?.upcomingShift || 0, color: '#f87171' }
  ];

  const deptColors = ['#6366f1', '#10b981', '#8b5cf6', '#3b82f6', '#f59e0b', '#ec4899', '#06b6d4'];
  const departmentPieData = data?.departmentStats?.map((dept, idx) => ({
    name: dept.name,
    value: dept.present,
    color: deptColors[idx % deptColors.length]
  })) || [];

  const getActiveStats = () => {
    switch (activeTab) {
      case 'Department Wise': return data?.departmentStats || [];
      case 'Shift Wise': return data?.shiftStats || [];
      default: return [];
    }
  };

  const getActiveHeader = () => {
    switch (activeTab) {
      case 'Department Wise': return 'Department Name';
      case 'Shift Wise': return 'Shift Name';
      default: return 'Name';
    }
  };

  const activeStats = getActiveStats();

  return (
    <div className="space-y-8 animate-fade-up">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 px-2">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Attendance Dashboard For {formatDateDisplay(selectedDate)}</h2>
        </div>
        <div className="flex items-center gap-6">
          <div className="text-[11px] font-bold text-slate-500">
            Generated On: <span className="text-slate-800">{formatDateDisplay(selectedDate)} {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-4">
            <div className="relative" ref={calendarRef}>
              <div
                className="flex items-center gap-3 bg-white border border-slate-200 px-4 py-2 rounded-xl shadow-sm cursor-pointer hover:bg-slate-50 transition-all"
                onClick={() => setShowCalendar(!showCalendar)}
              >
                <Calendar size={14} className="text-indigo-600" />
                <span className="text-xs font-bold text-slate-700">{formatDateDisplay(selectedDate)}</span>
                <ChevronDown size={12} className="text-slate-400" />
              </div>

              <AnimatePresence>
                {showCalendar && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 10 }}
                    exit={{ opacity: 0, y: 10 }}
                    className="absolute top-full right-0 mt-2 z-[110] bg-white border border-slate-200 rounded-2xl shadow-2xl p-4"
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
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Attendance Details Donut */}
        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm relative overflow-hidden">
          <h3 className="text-[12px] font-bold text-slate-800 flex items-center gap-36">Attendance Details</h3>
          <div className="h-64 w-full relative">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={150} debounce={50}>
              <PieChart>
                <Pie
                  data={attendanceDetails}
                  innerRadius={70}
                  outerRadius={95}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {attendanceDetails.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <RechartsTooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <span className="text-4xl font-bold text-slate-700">{data?.attendanceDetails?.total || 0}</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 mt-8 px-4">
            {attendanceDetails.map((item, idx) => (
              <div key={idx} className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                <span className="text-[11px] font-bold text-slate-500">{item.name}: <span className="text-slate-800">{item.value}</span></span>
              </div>
            ))}
          </div>
        </div>

        {/* Dynamic Wise Donut */}
        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm relative overflow-hidden">
          <h3 className="text-[12px] font-bold text-green-600 text-center mb-6">{activeTab}</h3>
          <div className="h-64 w-full relative">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={150} debounce={50}>
              <PieChart>
                <Pie
                  data={activeStats.map((s, i) => ({ name: s.name, value: s.present, color: deptColors[i % deptColors.length] }))}
                  innerRadius={70}
                  outerRadius={95}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {activeStats.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={deptColors[index % deptColors.length]} strokeWidth={0} />
                  ))}
                </Pie>
                <RechartsTooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-3xl font-bold text-slate-700">
                {activeStats.reduce((acc, curr) => acc + (curr.present || 0), 0)}
              </span>
              <span className="text-[9px] font-bold text-slate-400">Total Present</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-x-8 gap-y-3 mt-8 px-4 max-h-32 overflow-y-auto no-scrollbar">
            {activeStats.map((item, idx) => (
              <div key={idx} className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: deptColors[idx % deptColors.length] }} />
                <span className="text-[10px] font-bold text-slate-500 break-words">{item.name}: {item.present}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Table Section */}
      <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden">
        {/* Middle Tabs */}
        <div className="flex border-b border-slate-50 bg-slate-50/30">
          {['Department Wise', 'Shift Wise'].map((tab) => (
            <div
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-8 py-5 text-[11px] font-bold cursor-pointer transition-all border-b-2 ${activeTab === tab
                ? 'text-indigo-600 border-indigo-600 bg-white'
                : 'text-slate-400 border-transparent hover:text-slate-600'
                }`}
            >
              {tab}
            </div>
          ))}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50">
                <th className="px-8 py-5 text-[11px] font-bold text-slate-800 border-b border-slate-100 text-center">{getActiveHeader()}</th>
                <th className="px-6 py-5 text-[11px] font-bold text-slate-800 border-b border-slate-100 text-center">Total Employees</th>
                <th className="px-6 py-5 text-[11px] font-bold text-slate-800 border-b border-slate-100 text-center">Present</th>
                <th className="px-6 py-5 text-[11px] font-bold text-slate-800 border-b border-slate-100 text-center">Absent</th>
                <th className="px-6 py-5 text-[11px] font-bold text-slate-800 border-b border-slate-100 text-center">On Leave</th>
                <th className="px-6 py-5 text-[11px] font-bold text-slate-800 border-b border-slate-100 text-center">Upcoming Shift</th>
                <th className="px-6 py-5 text-[11px] font-bold text-slate-800 border-b border-slate-100 text-center">Late Comers</th>
                <th className="px-6 py-5 text-[11px] font-bold text-slate-800 border-b border-slate-100 text-center">Avg Worked HR</th>
                <th className="px-6 py-5 text-[11px] font-bold text-slate-800 border-b border-slate-100 text-center">Deviators</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {activeStats
                ?.map((stat, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-8 py-4">
                      <div className="flex items-center gap-3">
                        <TrendingUp size={14} className="text-indigo-600" />
                        <span className="text-[11px] font-bold text-indigo-600 hover:underline cursor-pointer">{stat.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center text-[11px] font-bold text-slate-600">{stat.total}</td>
                    <td className="px-6 py-4 text-center text-[11px] font-bold text-indigo-600">{stat.present}</td>
                    <td className="px-6 py-4 text-center text-[11px] font-bold text-indigo-400">{stat.absent}</td>
                    <td className="px-6 py-4 text-center text-[11px] font-bold text-indigo-400">{stat.onLeave}</td>
                    <td className="px-6 py-4 text-center text-[11px] font-bold text-slate-400">{stat.upcomingShift}</td>
                    <td className="px-6 py-4 text-center text-[11px] font-bold text-indigo-400">{stat.lateComers}</td>
                    <td className="px-6 py-4 text-center text-[11px] font-bold text-indigo-600">{formatDuration(stat.avgWorkingHours)}</td>
                    <td className="px-6 py-4 text-center text-[11px] font-bold text-indigo-600">{stat.deviators}</td>
                  </tr>
                ))}
              {/* Footer Total Row */}
              <tr className="bg-slate-50/80 font-bold">
                <td className="px-8 py-5 text-center text-[11px] text-slate-800">Total</td>
                <td className="px-6 py-5 text-center text-[12px] text-slate-900">{data?.attendanceDetails?.total}</td>
                <td className="px-6 py-5 text-center text-[12px] text-slate-900">{data?.attendanceDetails?.present}</td>
                <td className="px-6 py-5 text-center text-[12px] text-slate-900">{data?.attendanceDetails?.absent}</td>
                <td className="px-6 py-5 text-center text-[12px] text-slate-900">{data?.attendanceDetails?.onLeave}</td>
                <td className="px-6 py-5 text-center text-[12px] text-slate-900">{data?.attendanceDetails?.upcomingShift}</td>
                <td className="px-6 py-5 text-center text-[12px] text-slate-900">{activeStats.reduce((acc, curr) => acc + curr.lateComers, 0)}</td>
                <td className="px-6 py-5 text-center text-[12px] text-slate-900">
                  {formatDuration(activeStats.reduce((acc, curr) => acc + (curr.avgWorkingHours || 0), 0) / (activeStats.length || 1))}
                </td>
                <td className="px-6 py-5 text-center text-[12px] text-slate-900">{activeStats.reduce((acc, curr) => acc + curr.deviators, 0)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AttendanceDashboard;
