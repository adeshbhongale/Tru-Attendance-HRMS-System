import { AnimatePresence, motion } from 'framer-motion';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  Calendar,
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
import { useEffect, useRef, useState } from 'react';
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

  const getToday = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  const [startDate, setStartDate] = useState(getToday());
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
      ['Employee', 'Designation', 'Dept', 'Pending', 'Appr', 'Rej', 'Can', ...leaveTypes.map(lt => lt.code), 'Full', 'Half']
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
      ...leaveTypes.map(lt => item.stats.leaveTypes?.[lt.code]?.availed || 0),
      item.stats.fullDays || 0,
      item.stats.halfDays || 0
    ]);

    // Add Totals row
    tableData.push([
      'TOTAL', '', '',
      totals.pending, totals.approved, totals.rejected, totals.cancelled,
      ...leaveTypes.map(lt => totals[lt.code]),
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
    item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.department.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
    <div className="space-y-6 animate-fade-up">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Leave Dashboard</h1>
          <p className="text-xs font-bold text-slate-400 mt-1">Overview of employee leave balances and history</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/leaves/requests?status=Pending')}
            className="relative px-5 h-11 bg-indigo-600 text-white rounded-xl font-bold text-[11px]  tracking-wider hover:bg-indigo-700 transition-all flex items-center gap-2 shadow-lg shadow-indigo-100"
          >
            <FileText size={16} />
            Leave Requests
            {summary?.pending > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-rose-600 text-white text-[9px] rounded-full flex items-center justify-center border-2 border-white shadow-sm animate-pulse">
                {summary.pending}
              </span>
            )}
          </button>

          <div className="relative" ref={exportRef}>
            <button
              onClick={() => setShowExportOptions(!showExportOptions)}
              className="px-5 h-11 bg-emerald-600 text-white rounded-xl font-bold text-[11px]  tracking-wider hover:bg-emerald-700 transition-all flex items-center gap-2 shadow-lg shadow-emerald-100"
            >
              <Download size={16} />
              Export Data
              <ChevronDown size={14} className={`transition-transform ${showExportOptions ? 'rotate-180' : ''}`} />
            </button>
            <AnimatePresence>
              {showExportOptions && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
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
          value={summary?.pending || 0}
          icon={<Clock size={24} />}
          color={{ bg: 'bg-indigo-50', text: 'text-indigo-600', shadow: 'shadow-indigo-100' }}
        />
        <StatBox
          label="Approved"
          value={summary?.approved || 0}
          icon={<Calendar size={24} />}
          color={{ bg: 'bg-emerald-50', text: 'text-emerald-600', shadow: 'shadow-emerald-100' }}
        />
        <StatBox
          label="Rejected"
          value={summary?.rejected || 0}
          icon={<Users size={24} />}
          color={{ bg: 'bg-rose-50', text: 'text-rose-600', shadow: 'shadow-rose-100' }}
        />
        <StatBox
          label="Cancelled"
          value={summary?.cancelled || 0}
          icon={<Filter size={24} />}
          color={{ bg: 'bg-slate-50', text: 'text-slate-600', shadow: 'shadow-slate-100' }}
        />
        <StatBox
          label="Half Day"
          value={summary?.totalHalfDays || 0}
          icon={<Clock size={24} />}
          color={{ bg: 'bg-amber-50', text: 'text-amber-600', shadow: 'shadow-amber-100' }}
        />
        <StatBox
          label="Full Day"
          value={summary?.totalFullDays || 0}
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
                <th className="px-6 py-4 text-[10px] font-bold text-slate-800 tracking-widest border-b border-slate-100">Employee Details</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-800 tracking-widest border-b border-slate-100 text-center">Status Counts</th>
                {leaveTypes.map(lt => (
                  <th key={lt._id} className="px-6 py-4 text-[10px] font-bold text-slate-800 tracking-widest border-b border-slate-100 text-center">
                    {lt.name}
                  </th>
                ))}
                <th className="px-6 py-4 text-[10px] font-bold text-slate-800 tracking-widest border-b border-slate-100 text-center">Full Day</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-800 tracking-widest border-b border-slate-100 text-center">Half Day</th>
              </tr>
              <tr className="bg-slate-50/20">
                <th className="px-6 py-2 border-b border-slate-100"></th>
                <th className="px-6 py-2 border-b border-slate-100">
                  <div className="grid grid-cols-4 gap-2 text-[9px] font-bold text-slate-700 text-center">
                    <span>Waiting</span><span>Approved</span><span>Rejected</span><span>Cancelled</span>
                  </div>
                </th>
                {leaveTypes.map(lt => (
                  <th key={`sub-${lt._id}`} className="px-6 py-2 border-b border-slate-100 text-center text-[10px] font-bold text-slate-700">Approved</th>
                ))}
                <th className="px-6 py-2 border-b border-slate-100 text-center text-[10px] font-bold text-slate-700">Total</th>
                <th className="px-6 py-2 border-b border-slate-100 text-center text-[10px] font-bold text-slate-700">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                <tr>
                  <td colSpan={4 + leaveTypes.length} className="py-20 text-center">
                    <Loader2 className="animate-spin text-indigo-600 mx-auto mb-3" size={30} />
                    <p className="text-sm font-bold text-slate-400">Fetching dashboard data...</p>
                  </td>
                </tr>
              ) : filteredData.length === 0 ? (
                <tr>
                  <td colSpan={4 + leaveTypes.length} className="py-20 text-center">
                    <p className="text-sm font-bold text-slate-400">No employees found matching your criteria</p>
                  </td>
                </tr>
              ) : (
                filteredData.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map((emp) => (
                  <tr key={emp._id} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="px-6 py-5">
                      <div
                        className="flex items-center gap-3 cursor-pointer"
                        onClick={() => navigate(`/employee/${emp._id}`)}
                      >
                        <div className="w-10 h-10 rounded-xl bg-indigo-50 overflow-hidden shadow-sm">
                          {emp.profileImage ? (
                            <img
                              src={getFullImageUrl(emp.profileImage)}
                              alt={emp.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-indigo-600 font-bold text-sm">
                              {emp.name.charAt(0)}
                            </div>
                          )}
                        </div>
                        <div>
                          <p className="text-[15px] font-bold text-slate-800 tracking-tight group-hover:text-indigo-600 transition-colors">{emp.name}</p>
                          <p className="text-[10px] font-bold text-slate-400 tracking-wider mt-0.5">{emp.designation || 'Staff Member'} • {emp.department || 'N/A'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <div className="grid grid-cols-4 gap-2">
                        <div className="w-10 h-10 mx-auto rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center text-sm font-bold shadow-sm border border-amber-100/50">{emp.stats.pending || '--'}</div>
                        <div className="w-10 h-10 mx-auto rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-sm font-bold shadow-sm border border-emerald-100/50">{emp.stats.approved || '--'}</div>
                        <div className="w-10 h-10 mx-auto rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center text-sm font-bold shadow-sm border border-rose-100/50">{emp.stats.rejected || '--'}</div>
                        <div className="w-10 h-10 mx-auto rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center text-sm font-bold shadow-sm border border-slate-200/50">{emp.stats.cancelled || '--'}</div>
                      </div>
                    </td>
                    {leaveTypes.map(lt => (
                      <td key={`data-${lt._id}-${emp._id}`} className="px-6 py-5 text-center border-x border-slate-50">
                        <span className="text-sm font-bold text-indigo-700 bg-indigo-50/80 px-3 py-1.5 rounded-xl border border-indigo-100/50 shadow-sm">
                          {Math.floor(emp.stats.leaveTypes?.[lt.code]?.availed || 0) || '--'}
                        </span>
                      </td>
                    ))}
                    <td className="px-6 py-5 text-center border-x border-slate-50">
                      <span className="text-sm font-extrabold text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-100 shadow-sm">
                        {emp.stats.fullDays || '--'}
                      </span>
                    </td>
                    <td className="px-6 py-5 text-center border-x border-slate-50">
                      <span className="text-sm font-extrabold text-amber-600 bg-amber-50 px-3 py-1.5 rounded-xl border border-amber-100 shadow-sm">
                        {emp.stats.halfDays || '--'}
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
    </div>
  );
};

export default LeaveDashboard;
