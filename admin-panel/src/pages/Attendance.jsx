import {
  AnimatePresence,
  motion
} from 'framer-motion';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  Calendar,
  ChevronDown,
  Download,
  FileText,
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
  const [startDate, setStartDate] = useState(getTodayStr());
  const [endDate, setEndDate] = useState(getTodayStr());
  const [showStartCalendar, setShowStartCalendar] = useState(false);
  const [showEndCalendar, setShowEndCalendar] = useState(false);
  const [showExportOptions, setShowExportOptions] = useState(false);
  const startCalendarRef = useRef(null);
  const endCalendarRef = useRef(null);
  const exportRef = useRef(null);
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
  }, [startDate, endDate]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (startCalendarRef.current && !startCalendarRef.current.contains(event.target)) {
        setShowStartCalendar(false);
      }
      if (endCalendarRef.current && !endCalendarRef.current.contains(event.target)) {
        setShowEndCalendar(false);
      }
      if (exportRef.current && !exportRef.current.contains(event.target)) {
        setShowExportOptions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const res = await api.get(`/reports/attendance-dashboard?startDate=${startDate}&endDate=${endDate}`);
      setData(res.data.data);
    } catch (err) {
      toast.error('Failed to load attendance dashboard');
    } finally {
      setLoading(false);
    }
  };

  const formatDateDisplay = (dateStr) => {
    if (!dateStr) return '';
    const parts = dateStr.split('T')[0].split('-');
    if (parts.length === 3) {
      return `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
    return dateStr;
  };

  const getLocalDateObj = (dateStr) => {
    if (!dateStr) return new Date();
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d);
  };

  if (loading && !data) {
    return (
      <div className="flex justify-center items-center h-96">
        <Loader2 className="animate-spin text-indigo-600" size={40} />
      </div>
    );
  }

  const todayStr = getTodayStr();
  const isFuture = startDate > todayStr;
  const isSunday = getLocalDateObj(startDate).getDay() === 0;
  const isSingleDay = startDate === endDate;
  const shouldSkipAbsent = (isSingleDay && isSunday) || isFuture;
  const attendanceDetails = [
    { name: 'Present', value: data?.attendanceDetails?.present || 0, color: '#10b981' },
    { name: 'Absent', value: shouldSkipAbsent ? 0 : (data?.attendanceDetails?.absent || 0), color: '#f0180cff' },
    { name: 'OnLeave', value: data?.attendanceDetails?.onLeave || 0, color: '#f59e0b' },
    { name: 'UpcomingShift', value: data?.attendanceDetails?.upcomingShift || 0, color: '#3b82f6' }
  ];

  const deptColors = ['#6366f1', '#10b981', '#8b5cf6', '#3b82f6', '#f59e0b', '#ec4899', '#06b6d4'];
  const departmentPieData = data?.departmentStats?.map((dept, idx) => ({
    name: dept.name,
    value: dept.present,
    color: deptColors[idx % deptColors.length]
  })) || [];

  const getActiveHeader = () => {
    switch (activeTab) {
      case 'Department Wise': return 'Department Name';
      case 'Shift Wise': return 'Shift Name';
      default: return 'Name';
    }
  };

  const getActiveStats = () => {
    switch (activeTab) {
      case 'Department Wise': return data?.departmentStats || [];
      case 'Shift Wise': return data?.shiftStats || [];
      default: return [];
    }
  };

  const activeStats = getActiveStats();

  const handleExportCSV = () => {
    try {
      if (!activeStats.length) return toast.error('No data to download');
      const headers = [getActiveHeader(), "Total", "Present", "Absent", "On Leave", "Late", "Deviators", "Avg Working HR"];
      const rows = activeStats.map(stat => [
        stat.name,
        stat.total,
        stat.present,
        stat.absent,
        stat.onLeave,
        stat.lateComers,
        stat.deviators,
        formatDuration(stat.avgWorkingHours)
      ]);

      const csvContent = "data:text/csv;charset=utf-8,"
        + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");

      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `Attendance_Stats_${activeTab.replace(' ', '_')}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success('CSV exported successfully');
    } catch (err) {
      console.error('CSV Export Error:', err);
      toast.error('Failed to export CSV');
    }
  };

  const handleExportPDF = () => {
    try {
      if (!activeStats.length) return toast.error('No data to download');
      const doc = new jsPDF();

      doc.setFontSize(18);
      doc.setTextColor(79, 70, 229);
      doc.text(`Attendance Dashboard - ${activeTab}`, 14, 20);
      doc.setFontSize(10);
      doc.setTextColor(100, 116, 139);
      doc.text(`Period: ${startDate} to ${endDate}`, 14, 28);

      const headers = [[getActiveHeader(), "Total", "Present", "Absent", "On Leave", "Late", "Deviators", "Avg Working HR"]];
      const body = activeStats.map(stat => [
        stat.name,
        stat.total,
        stat.present,
        stat.absent,
        stat.onLeave,
        stat.lateComers,
        stat.deviators,
        formatDuration(stat.avgWorkingHours)
      ]);

      autoTable(doc, {
        head: headers,
        body: body,
        startY: 35,
        theme: 'grid',
        styles: { fontSize: 8 },
        headStyles: { fillColor: [79, 70, 229], textColor: [255, 255, 255] }
      });

      doc.save(`Attendance_Stats_${activeTab.replace(' ', '_')}.pdf`);
      toast.success('PDF exported successfully');
    } catch (err) {
      console.error('PDF Export Error:', err);
      toast.error('Failed to export PDF');
    }
  };

  return (
    <div className="space-y-8 animate-fade-up">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 px-2">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Attendance Dashboard Analysis</h2>
          <p className="text-[11px] font-bold text-slate-400">View attendance trends from {startDate} to {endDate}</p>
        </div>
        <div className="flex flex-wrap items-center gap-6">
          <div className="relative" ref={exportRef}>
            <button
              onClick={() => setShowExportOptions(!showExportOptions)}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl font-bold text-[10px] h-10 tracking-widest shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all hover:scale-105"
            >
              <Download size={14} />
              Download Statistics
              <ChevronDown size={14} className={`transition-transform ${showExportOptions ? 'rotate-180' : ''}`} />
            </button>

            <AnimatePresence>
              {showExportOptions && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="absolute right-0 mt-2 w-48 bg-white rounded-2xl shadow-2xl border border-slate-50 py-2 z-[120] overflow-hidden"
                >
                  <button
                    onClick={() => { handleExportCSV(); setShowExportOptions(false); }}
                    className="w-full px-4 py-2.5 text-left text-[11px] font-bold text-slate-600 hover:bg-slate-50 hover:text-indigo-600 transition-colors flex items-center gap-2"
                  >
                    <Download size={14} className="text-slate-400" />
                    Export as CSV
                  </button>
                  <button
                    onClick={() => { handleExportPDF(); setShowExportOptions(false); }}
                    className="w-full px-4 py-2.5 text-left text-[11px] font-bold text-slate-600 hover:bg-slate-50 hover:text-rose-600 transition-colors flex items-center gap-2"
                  >
                    <FileText size={14} className="text-slate-400" />
                    Export as PDF
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="flex items-center gap-3">
            {/* Start Date */}
            <div className="relative" ref={startCalendarRef}>
              <div
                className="flex items-center gap-3 bg-white border border-slate-200 px-4 py-2 rounded-xl shadow-sm cursor-pointer hover:bg-slate-50 transition-all min-w-[150px]"
                onClick={() => setShowStartCalendar(!showStartCalendar)}
              >
                <Calendar size={14} className="text-indigo-600" />
                <div className="flex flex-col items-start leading-none">
                  <span className="text-[8px] font-bold text-slate-400 ">From</span>
                  <span className="text-xs font-bold text-slate-700">{startDate}</span>
                </div>
                <ChevronDown size={12} className={`text-slate-400 transition-transform ${showStartCalendar ? 'rotate-180' : ''}`} />
              </div>

              <AnimatePresence>
                {showStartCalendar && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 10 }}
                    exit={{ opacity: 0, y: 10 }}
                    className="absolute top-full right-0 mt-2 z-[110] bg-white border border-slate-200 rounded-2xl shadow-2xl p-4"
                  >
                    <CalendarPicker
                      selectedDate={startDate}
                      onSelect={(date) => {
                        setStartDate(date);
                        setShowStartCalendar(false);
                      }}
                      onClose={() => setShowStartCalendar(false)}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* End Date */}
            <div className="relative" ref={endCalendarRef}>
              <div
                className="flex items-center gap-3 bg-white border border-slate-200 px-4 py-2 rounded-xl shadow-sm cursor-pointer hover:bg-slate-50 transition-all min-w-[150px]"
                onClick={() => setShowEndCalendar(!showEndCalendar)}
              >
                <Calendar size={14} className="text-emerald-600" />
                <div className="flex flex-col items-start leading-none">
                  <span className="text-[8px] font-bold text-slate-400 ">To</span>
                  <span className="text-xs font-bold text-slate-700">{endDate}</span>
                </div>
                <ChevronDown size={12} className={`text-slate-400 transition-transform ${showEndCalendar ? 'rotate-180' : ''}`} />
              </div>

              <AnimatePresence>
                {showEndCalendar && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 10 }}
                    exit={{ opacity: 0, y: 10 }}
                    className="absolute top-full right-0 mt-2 z-[110] bg-white border border-slate-200 rounded-2xl shadow-2xl p-4"
                  >
                    <CalendarPicker
                      selectedDate={endDate}
                      onSelect={(date) => {
                        setEndDate(date);
                        setShowEndCalendar(false);
                      }}
                      onClose={() => setShowEndCalendar(false)}
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
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-[12px] font-bold text-slate-800">Attendance Details</h3>
            <div className="px-3 py-1 bg-slate-50 rounded-full border border-slate-100">
              <p className="text-[8px] font-bold text-slate-400  tracking-tighter">Summary for selected period</p>
            </div>
          </div>
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
              <span className="text-4xl font-bold text-slate-700">{Math.max(0, shouldSkipAbsent ? (data?.attendanceDetails?.total || 0) - (data?.attendanceDetails?.absent || 0) : (data?.attendanceDetails?.total || 0))}</span>
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
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-[12px] font-bold text-indigo-600  tracking-widest">{activeTab}</h3>
            <div className="group relative">
              <span className="cursor-help text-[10px] font-bold text-slate-400 flex items-center gap-1 border-b border-slate-200 border-dotted">
                What are Deviators?
              </span>
              <div className="absolute bottom-full right-0 mb-2 w-48 p-3 bg-slate-900 text-white text-[9px] rounded-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 shadow-2xl">
                <p className="font-bold mb-1 text-indigo-400  tracking-tighter">Geofence Deviation</p>
                Deviators are employees who marked their attendance (Punch-In/Out) from outside their assigned geofence area.
              </div>
            </div>
          </div>
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
                    <td className="px-6 py-4 text-center text-[11px] font-bold text-slate-600">{Math.max(0, shouldSkipAbsent ? stat.total - stat.absent : stat.total)}</td>
                    <td className="px-6 py-4 text-center text-[11px] font-bold text-indigo-600">{stat.present}</td>
                    <td className="px-6 py-4 text-center text-[11px] font-bold text-indigo-400">{shouldSkipAbsent ? 0 : stat.absent}</td>
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
                <td className="px-6 py-5 text-center text-[12px] text-slate-900">{Math.max(0, shouldSkipAbsent ? (data?.attendanceDetails?.total || 0) - (data?.attendanceDetails?.absent || 0) : (data?.attendanceDetails?.total || 0))}</td>
                <td className="px-6 py-5 text-center text-[12px] text-slate-900">{data?.attendanceDetails?.present}</td>
                <td className="px-6 py-5 text-center text-[12px] text-slate-900">{shouldSkipAbsent ? 0 : (data?.attendanceDetails?.absent || 0)}</td>
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
