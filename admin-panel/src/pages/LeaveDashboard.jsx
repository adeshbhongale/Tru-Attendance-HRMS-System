import { AnimatePresence, motion } from 'framer-motion';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  Calendar,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  FileText,
  Filter,
  Loader2,
  Search,
  Users
} from 'lucide-react';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import api, { IMAGE_BASE_URL } from '../api/axios';
import CalendarPicker from '../components/CalendarPicker';

const getFullImageUrl = (path) => {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  return `${IMAGE_BASE_URL}/${path.replace(/\\/g, '/')}`;
};

const LeaveDashboard = () => {
  const navigate = useNavigate();
  const [data, setData] = useState([]);
  const [summary, setSummary] = useState(null);
  const [leaveTypes, setLeaveTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  const getFirstDayOfMonth = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}-01`;
  };
  const getToday = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  const [startDate, setStartDate] = useState(getFirstDayOfMonth());
  const [endDate, setEndDate] = useState(getToday());
  const [showStartCalendar, setShowStartCalendar] = useState(false);
  const [showEndCalendar, setShowEndCalendar] = useState(false);
  const [showExportOptions, setShowExportOptions] = useState(false);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const startRef = useRef(null);
  const endRef = useRef(null);
  const exportRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (startRef.current && !startRef.current.contains(e.target)) setShowStartCalendar(false);
      if (endRef.current && !endRef.current.contains(e.target)) setShowEndCalendar(false);
      if (exportRef.current && !exportRef.current.contains(e.target)) setShowExportOptions(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchDashboard = async () => {
    try {
      setLoading(true);
      const res = await api.get(`/leaves/dashboard?startDate=${startDate}&endDate=${endDate}`);
      setData(res.data.data);
      setSummary(res.data.summary);
      setLeaveTypes(res.data.leaveTypes || []);
    } catch (err) {
      toast.error('Failed to load leave dashboard');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, [startDate, endDate]);

  const [balanceModal, setBalanceModal] = useState({ show: false, employee: null, leaveTypeId: null, code: '', name: '', limit: '' });
  const [savingBalance, setSavingBalance] = useState(false);

  const openBalanceModal = (emp, lt) => {
    const ltData = emp.stats.leaveTypes?.[lt.code];
    setBalanceModal({
      show: true,
      employee: emp,
      leaveTypeId: lt._id,
      code: lt.code,
      name: lt.name,
      limit: ltData && typeof ltData.total === 'number' ? String(ltData.total) : String(lt.limit || 0),
    });
  };

  const saveBalance = async () => {
    const { employee, leaveTypeId, limit } = balanceModal;
    const num = Number(limit);
    if (!employee || !leaveTypeId || isNaN(num) || num < 0) {
      toast.error('Enter a valid allowance (0 or more days)');
      return;
    }
    try {
      setSavingBalance(true);
      await api.put(`/leaves/balances/${employee._id}/${leaveTypeId}`, { limit: num });
      toast.success(`Balance updated for ${employee.name} (${balanceModal.code})`);
      setBalanceModal({ show: false, employee: null, leaveTypeId: null, code: '', name: '', limit: '' });
      fetchDashboard();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update balance');
    } finally {
      setSavingBalance(false);
    }
  };

  const handleExportPDF = () => {
    const doc = new jsPDF('l', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.width;

    doc.setFontSize(20);
    doc.setTextColor(79, 70, 229);
    doc.text('Leave Dashboard Report', 14, 20);

    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.text(`Period: ${startDate} to ${endDate}`, 14, 28);
    doc.text(`Generated On: ${new Date().toLocaleString()}`, 14, 33);

    const headers = [
      ['Employee', 'Designation', 'Dept', 'Pending', 'Appr', 'Rej', 'Can', ...leaveTypes.flatMap(lt => [lt.code, `${lt.code} Bal`]), 'Full', 'Half']
    ];

    const totals = data.reduce((acc, item) => {
      acc.pending += item.stats.pending;
      acc.approved += item.stats.approved;
      acc.rejected += item.stats.rejected;
      acc.cancelled += item.stats.cancelled;
      acc.full += (item.stats.fullDays || 0);
      acc.half += (item.stats.halfDays || 0);
      leaveTypes.forEach(lt => {
        acc[lt.code] = (acc[lt.code] || 0) + (item.stats.leaveTypes?.[lt.code]?.availed || 0);
        acc[`${lt.code}_bal`] = (acc[`${lt.code}_bal`] || 0) + (item.stats.leaveTypes?.[lt.code]?.balance || 0);
      });
      return acc;
    }, { pending: 0, approved: 0, rejected: 0, cancelled: 0, full: 0, half: 0 });

    const tableData = data.map(item => [
      item.name,
      item.designation,
      item.department,
      item.stats.pending,
      item.stats.approved,
      item.stats.rejected,
      item.stats.cancelled,
      ...leaveTypes.flatMap(lt => [
        item.stats.leaveTypes?.[lt.code]?.availed || 0,
        item.stats.leaveTypes?.[lt.code]?.balance || 0
      ]),
      item.stats.fullDays || 0,
      item.stats.halfDays || 0
    ]);

    // Add Totals row
    tableData.push([
      'TOTAL', '', '',
      totals.pending, totals.approved, totals.rejected, totals.cancelled,
      ...leaveTypes.flatMap(lt => [totals[lt.code], totals[`${lt.code}_bal`]]),
      totals.full, totals.half
    ]);

    autoTable(doc, {
      head: headers,
      body: tableData,
      startY: 40,
      theme: 'grid',
      headStyles: { fillColor: [79, 70, 229], textColor: 255, fontSize: 8, fontStyle: 'bold' },
      bodyStyles: { fontSize: 7, textColor: [51, 65, 85] },
      alternateRowStyles: { fillColor: [248, 250, 252] }
    });

    doc.save(`Leave_Dashboard_${startDate}_${endDate}.pdf`);
  };

  const handleExportCSV = () => {
    const headers = ['Employee', 'Designation', 'Department', 'Pending', 'Approved', 'Rejected', 'Cancelled', ...leaveTypes.flatMap(lt => [`${lt.code} Availed`, `${lt.code} Balance`]), 'Full Days', 'Half Days'];
    const totals = data.reduce((acc, item) => {
      acc.pending += item.stats.pending;
      acc.approved += item.stats.approved;
      acc.rejected += item.stats.rejected;
      acc.cancelled += item.stats.cancelled;
      acc.full += (item.stats.fullDays || 0);
      acc.half += (item.stats.halfDays || 0);
      leaveTypes.forEach(lt => {
        acc[`${lt.code}_availed`] = (acc[`${lt.code}_availed`] || 0) + (item.stats.leaveTypes?.[lt.code]?.availed || 0);
        acc[`${lt.code}_bal`] = (acc[`${lt.code}_bal`] || 0) + ((item.stats.leaveTypes?.[lt.code]?.total || 0) - (item.stats.leaveTypes?.[lt.code]?.availed || 0));
      });
      return acc;
    }, { pending: 0, approved: 0, rejected: 0, cancelled: 0, full: 0, half: 0 });

    const rows = data.map(item => [
      item.name,
      item.designation,
      item.department,
      item.stats.pending,
      item.stats.approved,
      item.stats.rejected,
      item.stats.cancelled,
      ...leaveTypes.flatMap(lt => [
        item.stats.leaveTypes?.[lt.code]?.availed || 0,
        (item.stats.leaveTypes?.[lt.code]?.total || 0) - (item.stats.leaveTypes?.[lt.code]?.availed || 0)
      ]),
      item.stats.fullDays || 0,
      item.stats.halfDays || 0
    ]);

    rows.push([
      'TOTAL', '', '',
      totals.pending, totals.approved, totals.rejected, totals.cancelled,
      ...leaveTypes.flatMap(lt => [totals[`${lt.code}_availed`], totals[`${lt.code}_bal`]]),
      totals.full, totals.half
    ]);

    const csvContent = "\ufeff" + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Leave_Dashboard_${startDate}_${endDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filteredData = data.filter(item =>
    (item.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (item.department || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const displaySummary = useMemo(() => {
    const list = searchTerm ? filteredData : (data || []);
    if (!list || list.length === 0) {
      return summary || { pending: 0, approved: 0, rejected: 0, cancelled: 0, totalHalfDays: 0, totalFullDays: 0 };
    }
    return list.reduce((acc, item) => {
      acc.pending += (item.stats?.pending || 0);
      acc.approved += (item.stats?.approved || 0);
      acc.rejected += (item.stats?.rejected || 0);
      acc.cancelled += (item.stats?.cancelled || 0);
      acc.totalFullDays += (item.stats?.fullDays || 0);
      acc.totalHalfDays += (item.stats?.halfDays || 0);
      return acc;
    }, { pending: 0, approved: 0, rejected: 0, cancelled: 0, totalHalfDays: 0, totalFullDays: 0 });
  }, [filteredData, data, summary, searchTerm]);

  const StatBox = ({ label, value, icon, color }) => (
    <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex items-center gap-5">
      <div className={`w-14 h-14 rounded-2xl ${color.bg} ${color.text} flex items-center justify-center shadow-lg ${color.shadow}`}>
        {icon}
      </div>
      <div>
        <p className="text-[11px] font-bold text-slate-400  tracking-widest mb-1">{label}</p>
        <h3 className="text-2xl font-bold text-slate-800 tracking-tight">{value}</h3>
      </div>
    </div>
  );

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Leave Dashboard</h1>
          <p className="text-xs font-bold text-slate-400 mt-1">Overview of employee leave balances and history</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/leaves/requests')}
            className="relative flex items-center gap-2 px-5 py-3 bg-indigo-500 border border-slate-200 text-white rounded-2xl font-bold text-xs hover:bg-indigo-600 transition-all shadow-sm"
          >
            <FileText size={16} />
            Leave Requests
            {summary?.pending > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-rose-600 text-white text-[9px] rounded-full flex items-center justify-center border-2 border-white shadow-sm animate-pulse">
                {summary.pending}
              </span>
            )}
          </button>

          {/* Export Dropdown */}
          <div className="relative" ref={exportRef}>
            <button
              onClick={() => setShowExportOptions(!showExportOptions)}
              className="flex items-center gap-2 px-5 py-3 bg-indigo-600 text-white rounded-2xl font-bold text-xs hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
            >
              <Download size={16} />
              Export
              <ChevronDown size={14} className={`transition-transform duration-200 ${showExportOptions ? 'rotate-180' : ''}`} />
            </button>

            <AnimatePresence>
              {showExportOptions && (
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  className="absolute right-0 mt-2 w-48 bg-white rounded-2xl shadow-2xl border border-slate-50 py-2 z-50 overflow-hidden"
                >
                  <button onClick={() => { handleExportCSV(); setShowExportOptions(false); }} className="w-full px-4 py-3 text-left text-[11px] font-bold text-slate-600 hover:bg-slate-50 hover:text-indigo-600 flex items-center gap-2 transition-colors">
                    <Download size={14} className="text-slate-400" /> Export Excel (CSV)
                  </button>
                  <button onClick={() => { handleExportPDF(); setShowExportOptions(false); }} className="w-full px-4 py-3 text-left text-[11px] font-bold text-slate-600 hover:bg-slate-50 hover:text-rose-600 flex items-center gap-2 transition-colors">
                    <FileText size={14} className="text-slate-400" /> Export PDF Report
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
        <StatBox
          label="Waiting Approval"
          value={displaySummary.pending}
          icon={<Clock size={24} />}
          color={{ bg: 'bg-indigo-50', text: 'text-indigo-600', shadow: 'shadow-indigo-100' }}
        />
        <StatBox
          label="Approved"
          value={displaySummary.approved}
          icon={<Calendar size={24} />}
          color={{ bg: 'bg-emerald-50', text: 'text-emerald-600', shadow: 'shadow-emerald-100' }}
        />
        <StatBox
          label="Rejected"
          value={displaySummary.rejected}
          icon={<Users size={24} />}
          color={{ bg: 'bg-rose-50', text: 'text-rose-600', shadow: 'shadow-rose-100' }}
        />
        <StatBox
          label="Cancelled"
          value={displaySummary.cancelled}
          icon={<Filter size={24} />}
          color={{ bg: 'bg-slate-50', text: 'text-slate-600', shadow: 'shadow-slate-100' }}
        />
        <StatBox
          label="Half Day"
          value={displaySummary.totalHalfDays}
          icon={<Clock size={24} />}
          color={{ bg: 'bg-amber-50', text: 'text-amber-600', shadow: 'shadow-amber-100' }}
        />
        <StatBox
          label="Full Day"
          value={displaySummary.totalFullDays}
          icon={<Calendar size={24} />}
          color={{ bg: 'bg-violet-50', text: 'text-violet-600', shadow: 'shadow-violet-100' }}
        />
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-3xl border border-slate-100 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="relative w-full md:w-96">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Search by name or department..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-11 pr-4 h-12 bg-slate-50 border-none rounded-2xl text-sm font-bold text-slate-600 placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500/20 transition-all"
          />
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="relative flex-1 md:flex-none" ref={startRef}>
            <button
              onClick={(e) => { e.stopPropagation(); setShowStartCalendar(!showStartCalendar); setShowEndCalendar(false); }}
              className="w-full md:w-auto flex items-center gap-3 px-5 h-12 bg-white border border-slate-200 rounded-2xl text-[11px] font-bold text-slate-600 hover:bg-slate-50 transition-all shadow-sm"
            >
              <Calendar size={16} className="text-indigo-600" />
              <span>From: {startDate.split('-').reverse().join('-')}</span>
            </button>
            {showStartCalendar && (
              <div className="absolute top-full left-0 mt-2 z-[60] bg-white rounded-3xl shadow-2xl border border-slate-100 p-2">
                <CalendarPicker
                  selectedDate={startDate}
                  onSelect={(date) => { setStartDate(date); setShowStartCalendar(false); }}
                  onClose={() => setShowStartCalendar(false)}
                />
              </div>
            )}
          </div>
          <div className="relative flex-1 md:flex-none" ref={endRef}>
            <button
              onClick={(e) => { e.stopPropagation(); setShowEndCalendar(!showEndCalendar); setShowStartCalendar(false); }}
              className="w-full md:w-auto flex items-center gap-3 px-5 h-12 bg-white border border-slate-200 rounded-2xl text-[11px] font-bold text-slate-600 hover:bg-slate-50 transition-all shadow-sm"
            >
              <Calendar size={16} className="text-indigo-600" />
              <span>To: {endDate.split('-').reverse().join('-')}</span>
            </button>
            {showEndCalendar && (
              <div className="absolute top-full right-0 mt-2 z-[60] bg-white rounded-3xl shadow-2xl border border-slate-100 p-2">
                <CalendarPicker
                  selectedDate={endDate}
                  onSelect={(date) => { setEndDate(date); setShowEndCalendar(false); }}
                  onClose={() => setShowEndCalendar(false)}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto border border-slate-100 rounded-2xl">
          <table className="w-full text-left border-collapse border border-slate-50">
            <thead>
              <tr className="bg-slate-50/50">
                <th className="px-3 py-3 text-[10px] font-bold text-slate-800 tracking-wider border-b border-slate-100 min-w-[170px]">Employee Details</th>
                <th colSpan={4} className="px-2 py-3 text-[10px] font-bold text-slate-800 tracking-wider border-b border-slate-100 text-center bg-slate-50/70">
                  Status Counts
                </th>
                {leaveTypes.map(lt => (
                  <th key={lt._id || lt.code} colSpan={2} className="px-2 py-3 text-[10px] font-bold text-slate-800 tracking-wider border-b border-slate-100 text-center">
                    {lt.name}
                  </th>
                ))}
                <th className="px-2 py-3 text-[10px] font-bold text-slate-800 tracking-wider border-b border-slate-100 text-center">Full Day</th>
                <th className="px-2 py-3 text-[10px] font-bold text-slate-800 tracking-wider border-b border-slate-100 text-center">Half Day</th>
              </tr>
              <tr className="bg-slate-50/20">
                <th className="px-3 py-1.5 border-b border-slate-100"></th>
                <th className="px-1.5 py-1.5 border-b border-slate-100 text-center text-[9px] font-bold text-amber-700 bg-amber-50/40">Waiting</th>
                <th className="px-1.5 py-1.5 border-b border-slate-100 text-center text-[9px] font-bold text-emerald-700 bg-emerald-50/40">Approved</th>
                <th className="px-1.5 py-1.5 border-b border-slate-100 text-center text-[9px] font-bold text-rose-700 bg-rose-50/40">Rejected</th>
                <th className="px-1.5 py-1.5 border-b border-slate-100 text-center text-[9px] font-bold text-slate-600 bg-slate-100/40">Cancelled</th>
                {leaveTypes.map(lt => (
                  <Fragment key={`sub-${lt._id || lt.code}`}>
                    <th className="px-2 py-1.5 border-b border-slate-100 text-center text-[9px] font-bold text-slate-700">Approved</th>
                    <th className="px-2 py-1.5 border-b border-slate-100 text-center text-[9px] font-bold text-slate-700">Balance</th>
                  </Fragment>
                ))}
                <th className="px-2 py-1.5 border-b border-slate-100 text-center text-[9px] font-bold text-slate-700">Total</th>
                <th className="px-2 py-1.5 border-b border-slate-100 text-center text-[9px] font-bold text-slate-700">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                <tr>
                  <td colSpan={7 + leaveTypes.length * 2} className="py-16 text-center">
                    <Loader2 className="animate-spin text-indigo-600 mx-auto mb-3" size={28} />
                    <p className="text-xs font-bold text-slate-400">Fetching dashboard data...</p>
                  </td>
                </tr>
              ) : filteredData.length === 0 ? (
                <tr>
                  <td colSpan={7 + leaveTypes.length * 2} className="py-16 text-center">
                    <p className="text-xs font-bold text-slate-400">No employees found matching your criteria</p>
                  </td>
                </tr>
              ) : (
                filteredData.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map((emp) => (
                  <tr key={emp._id} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="px-3 py-3">
                      <div
                        className="flex items-center gap-2.5 cursor-pointer"
                        onClick={() => navigate(`/employee/${emp._id}`)}
                      >
                        <div className="w-8 h-8 rounded-xl bg-indigo-50 overflow-hidden shadow-xs flex-shrink-0">
                          {emp.profileImage ? (
                            <img
                              src={getFullImageUrl(emp.profileImage)}
                              alt={emp.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-indigo-600 font-bold text-xs">
                              {(emp.name || 'E').charAt(0).toUpperCase()}
                            </div>
                          )}
                        </div>
                        <div>
                          <p className="text-xs font-bold text-slate-800 tracking-tight group-hover:text-indigo-600 transition-colors">{emp.name}</p>
                          <p className="text-[9px] font-bold text-slate-400 tracking-wider mt-0.5">{emp.designation || 'Staff Member'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-1.5 py-3 text-center">
                      <span className="inline-flex items-center justify-center min-w-[28px] h-7 px-1.5 rounded-lg bg-amber-50 text-amber-700 font-extrabold text-[11px] border border-amber-200/60">
                        {emp.stats.pending || 0}
                      </span>
                    </td>
                    <td className="px-1.5 py-3 text-center">
                      <span className="inline-flex items-center justify-center min-w-[28px] h-7 px-1.5 rounded-lg bg-emerald-50 text-emerald-700 font-extrabold text-[11px] border border-emerald-200/60">
                        {emp.stats.approved || 0}
                      </span>
                    </td>
                    <td className="px-1.5 py-3 text-center">
                      <span className="inline-flex items-center justify-center min-w-[28px] h-7 px-1.5 rounded-lg bg-rose-50 text-rose-700 font-extrabold text-[11px] border border-rose-200/60">
                        {emp.stats.rejected || 0}
                      </span>
                    </td>
                    <td className="px-1.5 py-3 text-center">
                      <span className="inline-flex items-center justify-center min-w-[28px] h-7 px-1.5 rounded-lg bg-slate-100 text-slate-600 font-extrabold text-[11px] border border-slate-200/60">
                        {emp.stats.cancelled || 0}
                      </span>
                    </td>
                    {leaveTypes.map(lt => {
                      const ltKey = lt.code || lt.name;
                      const ltData = emp.stats.leaveTypes?.[ltKey] || emp.stats.leaveTypes?.[lt.code] || emp.stats.leaveTypes?.[lt.name];
                      const availed = ltData ? ltData.availed : 0;
                      const balanceVal = ltData && typeof ltData.balance === 'number' ? ltData.balance : (lt.limit || 0);

                      return (
                        <Fragment key={`data-${lt._id || ltKey}-${emp._id}`}>
                          <td className="px-2 py-3 text-center border-x border-slate-50">
                            <span className="inline-flex items-center justify-center px-2 py-1 rounded-lg text-[11px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-100">
                              {availed} {availed === 1 ? 'day' : 'days'}
                            </span>
                          </td>
                          <td className="px-2 py-3 text-center border-x border-slate-50">
                            <button
                              onClick={() => openBalanceModal(emp, lt)}
                              title={`Set ${emp.name}'s ${lt.name} allowance`}
                              className={`inline-flex items-center justify-center px-2 py-1 rounded-lg text-[11px] font-extrabold border transition-all cursor-pointer hover:scale-105 ${balanceVal > 0
                                ? 'text-emerald-700 bg-emerald-50 border-emerald-200 hover:bg-emerald-100'
                                : 'text-rose-700 bg-rose-50 border-rose-200 hover:bg-rose-100'
                                }`}
                            >
                              {balanceVal} left
                            </button>
                          </td>
                        </Fragment>
                      );
                    })}
                    <td className="px-2 py-3 text-center border-x border-slate-50">
                      <span className="inline-flex items-center justify-center px-2 py-1 rounded-lg text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-100">
                        {emp.stats.fullDays || 0}
                      </span>
                    </td>
                    <td className="px-2 py-3 text-center border-x border-slate-50">
                      <span className="inline-flex items-center justify-center px-2 py-1 rounded-lg text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-100">
                        {emp.stats.halfDays || 0}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="px-6 py-4 bg-slate-50/30 border-t border-slate-100 flex items-center justify-between">
          <p className="text-[11px] font-bold text-slate-400">
            Showing {Math.min(filteredData.length, (currentPage - 1) * itemsPerPage + 1)} to {Math.min(filteredData.length, currentPage * itemsPerPage)} of {filteredData.length} employees
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-2 rounded-xl bg-white border border-slate-200 text-slate-400 disabled:opacity-50 hover:bg-slate-50 transition-all"
            >
              <ChevronLeft size={16} />
            </button>
            <div className="flex items-center gap-1">
              {[...Array(Math.ceil(filteredData.length / itemsPerPage))].map((_, i) => (
                <button
                  key={i}
                  onClick={() => setCurrentPage(i + 1)}
                  className={`w-8 h-8 rounded-xl font-bold text-[11px] transition-all ${currentPage === i + 1
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100'
                    : 'bg-white text-slate-400 border border-slate-200 hover:bg-slate-50'
                    }`}
                >
                  {i + 1}
                </button>
              ))}
            </div>
            <button
              onClick={() => setCurrentPage(p => Math.min(Math.ceil(filteredData.length / itemsPerPage), p + 1))}
              disabled={currentPage === Math.ceil(filteredData.length / itemsPerPage)}
              className="p-2 rounded-xl bg-white border border-slate-200 text-slate-400 disabled:opacity-50 hover:bg-slate-50 transition-all"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Set Employee Leave Allowance Modal */}
      <AnimatePresence>
        {balanceModal.show && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-[2rem] p-8 max-w-sm w-full shadow-2xl border border-slate-100"
            >
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <Calendar size={22} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 m-0">Set Leave Allowance</h3>
                  <p className="text-[11px] font-bold text-slate-500 mt-0.5">
                    {balanceModal.employee?.name} • {balanceModal.name} ({balanceModal.code})
                  </p>
                </div>
              </div>

              <p className="text-[11px] font-bold text-slate-500 leading-relaxed mb-4">
                Set this employee's allowance for this leave type. Approving a leave automatically deducts its working days from the balance.
              </p>

              <label className="text-[10px] font-bold text-slate-400 tracking-widest ml-1">Allowance (days)</label>
              <input
                type="number"
                min="0"
                step="0.5"
                value={balanceModal.limit}
                onChange={(e) => setBalanceModal({ ...balanceModal, limit: e.target.value })}
                className="w-full mt-2 mb-6 bg-slate-50 border-2 border-transparent focus:border-indigo-100 focus:bg-white px-5 py-4 rounded-2xl outline-none transition-all text-sm font-bold text-slate-800"
                placeholder="e.g., 12"
              />

              <div className="flex gap-3">
                <button
                  onClick={() => setBalanceModal({ show: false, employee: null, leaveTypeId: null, code: '', name: '', limit: '' })}
                  className="flex-1 py-4 bg-slate-50 text-slate-600 rounded-2xl text-sm font-bold hover:bg-slate-100 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={saveBalance}
                  disabled={savingBalance}
                  className="flex-[2] py-4 bg-indigo-600 text-white rounded-2xl text-sm font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {savingBalance ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
                  Save Allowance
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default LeaveDashboard;
