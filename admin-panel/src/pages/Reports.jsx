import { AnimatePresence, motion } from 'framer-motion';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  Activity,
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  FileText,
  Loader2,
  Search,
  X
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import api, { IMAGE_BASE_URL } from '../api/axios';

const getFullImageUrl = (path) => {
  if (!path) return null;
  if (path.startsWith('http') || path.startsWith('data:')) return path;
  return `${IMAGE_BASE_URL}/${path.replace(/\\/g, '/')}`;
};
import CalendarPicker from '../components/CalendarPicker';

const Reports = () => {
  const navigate = useNavigate();
  const [reportType, setReportType] = useState('Present Timing Sheet');
  const getTodayStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const [startDate, setStartDate] = useState(getTodayStr());
  const [endDate, setEndDate] = useState(getTodayStr());
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [generatedOn, setGeneratedOn] = useState('');
  // Extra state for Present Timing Sheet single-date full-employee view
  const [allAttendance, setAllAttendance] = useState([]);
  const [allLeaves, setAllLeaves] = useState([]);
  const [selectedSelfie, setSelectedSelfie] = useState(null);

  const formatDuration = (decimalHours) => {
    if (!decimalHours || decimalHours <= 0) return '0m';
    const totalMinutes = Math.round(decimalHours * 60);
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    if (h === 0) return `${m}m`;
    if (m === 0) return `${h}hr`;
    return `${h}hr ${m}m`;
  };

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const fetchReport = async () => {
    try {
      setLoading(true);
      // Always fetch the base report data (used for Break & work sheet, and date-range Present Timing Sheet)
      const res = await api.get(`/reports/employee-reports?type=${reportType}&startDate=${startDate}&endDate=${endDate}&search=${search}`);
      setData(res.data.data);
      setGeneratedOn(res.data.generatedOn);
      setCurrentPage(1); // Reset to page 1 on new data
      setShiftFilter('All'); // Reset filters on new data
      setStatusFilter('All');

      // For Present Timing Sheet on a single date: also fetch full attendance (includes Absent/Neutral/Leave)
      if (reportType === 'Present Timing Sheet' && startDate === endDate) {
        const [attRes, leavesRes] = await Promise.all([
          api.get('/attendance', { params: { date: startDate } }),
          api.get('/leaves').catch(() => ({ data: { data: [] } }))
        ]);
        setAllAttendance(attRes.data.data || []);
        setAllLeaves(leavesRes.data.data || []);
      } else {
        setAllAttendance([]);
        setAllLeaves([]);
      }
    } catch (err) {
      toast.error('Failed to fetch report');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, [reportType, startDate, endDate]); // Auto-fetch when filters change

  const handleSearch = (e) => {
    setSearch(e.target.value);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return 'NA';
    return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatFullDate = (dateStr) => {
    return new Date(dateStr).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-');
  };

  const format12hr = (timeStr) => {
    if (!timeStr || timeStr === 'NA') return 'NA';
    // Handle "08:00 - 15:00" format
    if (timeStr.includes('-')) {
      return timeStr.split('-').map(t => format12hr(t.trim())).join(' - ');
    }
    // Handle "08:00" format
    const [hrs, mins] = timeStr.split(':').map(Number);
    const period = hrs >= 12 ? 'pm' : 'am';
    const h = hrs % 12 || 12;
    return `${h}${mins > 0 ? `:${mins}` : ''}${period}`;
  };

  const [showTypeDropdown, setShowTypeDropdown] = useState(false);
  const [showStartCalendar, setShowStartCalendar] = useState(false);
  const [showEndCalendar, setShowEndCalendar] = useState(false);
  const typeDropdownRef = useRef(null);
  const startCalendarRef = useRef(null);
  const endCalendarRef = useRef(null);

  const [shiftFilter, setShiftFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [showShiftFilter, setShowShiftFilter] = useState(false);
  const [showStatusFilter, setShowStatusFilter] = useState(false);

  // IST date string helper (same as Shifts.jsx)
  const getISTDateString = (date) => {
    if (!date) return null;
    const d = new Date(date);
    if (isNaN(d.getTime())) return null;
    const istTime = new Date(d.getTime() + (5.5 * 60 * 60 * 1000));
    const year = istTime.getUTCFullYear();
    const month = String(istTime.getUTCMonth() + 1).padStart(2, '0');
    const day = String(istTime.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Build merged row list for Present Timing Sheet single-date mode:
  // uses /api/attendance which already returns all employees (punched-in + absent/neutral/leave synthetic).
  // Applies IST-based leave correction identical to Shifts.jsx.
  const mergedData = useMemo(() => {
    if (reportType !== 'Present Timing Sheet' || startDate !== endDate || allAttendance.length === 0) {
      return null; // Signal to use original data
    }
    const todayStr = new Date().toISOString().split('T')[0];
    const isFutureOrToday = startDate >= todayStr;
    const isTodaySelected = startDate === todayStr;

    return allAttendance.map(att => {
      const user = att.user || {};
      let status = att.status;

      // IST-corrected leave check (same logic as Shifts.jsx)
      const empId = user._id || (typeof att.user === 'string' ? att.user : null);
      const hasApprovedLeave = allLeaves.some(l => {
        const leaveEmpId = l.user ? (typeof l.user === 'string' ? l.user : l.user._id) : null;
        if (!empId || !leaveEmpId || String(leaveEmpId) !== String(empId)) return false;
        if (l.status !== 'Approved') return false;
        const start = getISTDateString(l.startDate);
        const end = getISTDateString(l.endDate);
        return startDate >= start && startDate <= end;
      });

      if (hasApprovedLeave) {
        status = 'Leave';
      } else if (status === 'On Leave') {
        // Backend UTC skew: fall back correctly
        status = isFutureOrToday ? 'Neutral' : 'Absent';
      } else if (status === 'Not Punched In') {
        status = 'Neutral';
      } else if (status === 'Absent' && !att.punchIn?.time && isTodaySelected) {
        status = 'Neutral';
      }

      // Resolve shift display string
      const shiftObj = user.shift;
      const shiftStr = shiftObj
        ? (typeof shiftObj === 'string' ? shiftObj : `${shiftObj.name} (${shiftObj.startTime} - ${shiftObj.endTime})`)
        : 'NA';

      return {
        id: att._id,
        userId: user._id,
        name: user.name || 'NA',
        mobile: user.mobile || 'NA',
        profileImage: user.profileImage || null,
        department: user.department || 'NA',
        designation: user.designation || 'NA',
        shift: shiftStr,
        date: att.date || startDate,
        timeIn: att.punchIn?.time || null,
        timeInLocation: att.punchIn?.location?.address || null,
        timeInSelfie: att.punchIn?.selfie || null,
        timeInOutside: att.punchIn?.isOutside || false,
        timeOut: att.punchOut?.time || null,
        timeOutLocation: att.punchOut?.location?.address || null,
        timeOutSelfie: att.punchOut?.selfie || null,
        timeOutOutside: att.punchOut?.isOutside || false,
        totalHoursWorked: att.workingHours || 0,
        status,
        breaks: att.breaks || [],
        breaksTaken: att.breaks?.length || 0,
        totalBreakTime: 0
      };
    });
  }, [allAttendance, allLeaves, reportType, startDate, endDate]);

  const uniqueShifts = useMemo(() => {
    const source = mergedData || data;
    const shifts = new Set(source.map(d => d.shift?.split('(')[0].trim() || 'NA'));
    return ['All', ...Array.from(shifts)];
  }, [data, mergedData]);

  const uniqueStatuses = useMemo(() => {
    const source = mergedData || data;
    const statuses = new Set(source.map(d => d.status));
    return ['All', ...Array.from(statuses)];
  }, [data, mergedData]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (typeDropdownRef.current && !typeDropdownRef.current.contains(event.target)) {
        setShowTypeDropdown(false);
      }
      if (startCalendarRef.current && !startCalendarRef.current.contains(event.target)) {
        setShowStartCalendar(false);
      }
      if (endCalendarRef.current && !endCalendarRef.current.contains(event.target)) {
        setShowEndCalendar(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Pagination Logic
  const filteredData = useMemo(() => {
    // For Present Timing Sheet on a single date: use merged full-employee data
    const source = mergedData || data;
    return source.filter(row => {
      const matchesSearch = (row.name || '').toLowerCase().includes(search.toLowerCase()) || (row.mobile || '').includes(search);
      const matchesShift = shiftFilter === 'All' || (row.shift && row.shift.includes(shiftFilter));
      const matchesStatus = statusFilter === 'All' || row.status === statusFilter;

      // For date-range Present Timing Sheet (no mergedData), exclude Absent rows (original behaviour)
      if (!mergedData && reportType === 'Present Timing Sheet') {
        return matchesSearch && row.status !== 'Absent' && matchesShift && matchesStatus;
      }
      if (reportType === 'Employee Overview Sheet') return matchesSearch && matchesShift && matchesStatus;
      return matchesSearch && matchesShift && matchesStatus;
    });
  }, [data, mergedData, search, reportType, shiftFilter, statusFilter]);

  const totalPages = Math.ceil(filteredData.length / itemsPerPage);
  const currentData = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredData.slice(start, start + itemsPerPage);
  }, [filteredData, currentPage]);

  const handleExportCSV = () => {
    if (filteredData.length === 0) return toast.error('No data to download');

    let headers = [];
    let rows = [];

    if (reportType === 'Present Timing Sheet') {
      headers = ["Date", "Name", "Mobile", "Shift", "Status", "Check-In (Location)", "Check-Out (Location)", "Day Worked"];
      rows = filteredData.map(row => [
        formatFullDate(row.date),
        row.name,
        row.mobile,
        row.shift,
        row.status,
        `${formatDate(row.timeIn)} (${row.timeInOutside ? 'Outside' : 'Inside'} - ${row.timeInLocation || 'NA'})`,
        `${formatDate(row.timeOut)} (${row.timeOutOutside ? 'Outside' : 'Inside'} - ${row.timeOutLocation || 'NA'})`,
        formatDuration(row.totalHoursWorked)
      ]);
    } else {
      headers = ["Date", "Name", "Mobile", "Shift", "Day Worked", "Breaks Count", "Total Break Time", "Breaks Details"];
      rows = filteredData.map(row => [
        formatFullDate(row.date), row.name, row.mobile, row.shift,
        formatDuration(row.totalHoursWorked),
        row.breaksTaken,
        `${(row.totalBreakTime / 60).toFixed(2)}h`,
        row.breaks?.map(b => `${formatDate(b.startTime)}-${formatDate(b.endTime)}`).join(' | ')
      ]);
    }

    const csvContent = "data:text/csv;charset=utf-8,"
      + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    const fileName = reportType.replace(/&/g, 'and').replace(/\s+/g, '_');
    link.setAttribute("download", `${fileName}_${startDate}_to_${endDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportPDF = () => {
    if (filteredData.length === 0) return toast.error('No data to download');

    const doc = new jsPDF('l', 'mm', 'a4'); // Landscape orientation

    // Add Header
    doc.setFontSize(22);
    doc.setTextColor(79, 70, 229); // Indigo-600
    doc.text('HRMS Performance Report', 14, 20);

    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139); // Slate-500
    doc.text(`Type: ${reportType}`, 14, 28);
    doc.text(`Range: ${formatFullDate(startDate)} to ${formatFullDate(endDate)}`, 14, 33);
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 38);

    doc.setDrawColor(241, 245, 249); // Slate-100
    doc.line(14, 42, 282, 42);

    let headers = [];
    let data = [];

    if (reportType === 'Present Timing Sheet') {
      headers = [["Date", "Name", "Mobile", "Shift", "Status", "Check-In (Location)", "Check-Out (Location)", "Day Worked"]];
      data = filteredData.map(row => [
        formatFullDate(row.date),
        row.name,
        row.mobile,
        row.shift,
        row.status,
        `${formatDate(row.timeIn)} (${row.timeInOutside ? 'Outside' : 'Inside'} - ${row.timeInLocation || 'NA'})`,
        `${formatDate(row.timeOut)} (${row.timeOutOutside ? 'Outside' : 'Inside'} - ${row.timeOutLocation || 'NA'})`,
        formatDuration(row.totalHoursWorked)
      ]);
    } else {
      headers = [["Date", "Name", "Mobile", "Shift", "Day Worked", "Breaks Count", "Total Break Time", "Breaks Details"]];
      data = filteredData.map(row => [
        formatFullDate(row.date), row.name, row.mobile, row.shift,
        formatDuration(row.totalHoursWorked),
        row.breaksTaken,
        formatDuration(row.totalBreakTime / 60),
        row.breaks?.map(b => `${formatDate(b.startTime)}-${formatDate(b.endTime)}`).join(' | ') || 'No breaks'
      ]);
    }

    autoTable(doc, {
      head: headers,
      body: data,
      startY: 48,
      theme: 'grid',
      headStyles: { fillColor: [79, 70, 229], textColor: [255, 255, 255], fontSize: 9, fontStyle: 'bold' },
      bodyStyles: { fontSize: 8, textColor: [51, 65, 85] },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { top: 20 },
      columnStyles: {
        7: { cellWidth: reportType === 'Break & work Timing Sheet' ? 80 : 'auto' }
      }
    });

    doc.save(`${reportType.replace(/&/g, 'and').replace(/ /g, '_')}_${startDate}_to_${endDate}.pdf`);
  };

  const [showExportOptions, setShowExportOptions] = useState(false);
  const exportRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (exportRef.current && !exportRef.current.contains(event.target)) {
        setShowExportOptions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="space-y-6 animate-fade-up">
      {/* Premium Header Filters */}
      <div className="flex flex-col lg:flex-row justify-between items-center gap-6">
        <div className="flex flex-wrap items-center gap-4 w-full lg:w-auto">
          {/* Report Type Dropdown */}
          <div className="relative" ref={typeDropdownRef}>
            <button
              onClick={() => setShowTypeDropdown(!showTypeDropdown)}
              className="flex items-center gap-3 bg-white border border-slate-200 px-6 py-3.5 rounded-2xl shadow-sm hover:bg-slate-50 transition-all min-w-[240px] justify-between group"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-50 rounded-xl text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                  <FileText size={18} />
                </div>
                <span className="text-sm font-bold text-slate-700">{reportType}</span>
              </div>
              <ChevronDown size={18} className={`text-slate-400 transition-transform ${showTypeDropdown ? 'rotate-180' : ''}`} />
            </button>

            <AnimatePresence>
              {showTypeDropdown && (
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 10, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  className="absolute top-full left-0 mt-3 z-[110] bg-white border border-slate-100 rounded-[2rem] shadow-2xl p-3 w-full min-w-[260px]"
                >
                  {['Present Timing Sheet', 'Break & work Timing Sheet'].map((type) => (
                    <button
                      key={type}
                      onClick={() => {
                        setReportType(type);
                        setShowTypeDropdown(false);
                      }}
                      className={`w-full text-left px-5 py-3.5 rounded-2xl text-[11px] font-bold tracking-widest  transition-all flex items-center justify-between ${reportType === type ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' : 'text-slate-500 hover:bg-slate-50'}`}
                    >
                      {type}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Start Date Picker */}
          <div className="relative" ref={startCalendarRef}>
            <div className="absolute -top-6 left-2 text-[10px] font-bold text-slate-400 tracking-widest">FROM</div>
            <button
              className="flex items-center gap-4 bg-white border border-slate-200 px-6 py-3.5 rounded-2xl shadow-sm hover:bg-slate-50 transition-all min-w-[180px] cursor-pointer group"
              onClick={() => setShowStartCalendar(!showStartCalendar)}
            >
              <div className="p-2 bg-emerald-50 rounded-xl text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                <Calendar size={18} />
              </div>
              <span className="text-sm font-bold text-slate-700">
                {formatFullDate(startDate)}
              </span>
              <ChevronDown size={16} className={`text-slate-400 ml-auto transition-transform ${showStartCalendar ? 'rotate-180' : ''}`} />
            </button>

            <AnimatePresence>
              {showStartCalendar && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 10 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="absolute top-full left-0 mt-3 z-[110] bg-white border border-slate-100 rounded-[2rem] shadow-2xl p-6"
                >
                  <CalendarPicker
                    selectedDate={startDate}
                    onSelect={setStartDate}
                    onClose={() => setShowStartCalendar(false)}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* End Date Picker */}
          <div className="relative" ref={endCalendarRef}>
            <div className="absolute -top-6 left-2 text-[10px] font-bold text-slate-400 tracking-widest">TO</div>
            <button
              className="flex items-center gap-4 bg-white border border-slate-200 px-6 py-3.5 rounded-2xl shadow-sm hover:bg-slate-50 transition-all min-w-[180px] cursor-pointer group"
              onClick={() => setShowEndCalendar(!showEndCalendar)}
            >
              <div className="p-2 bg-rose-50 rounded-xl text-rose-600 group-hover:bg-rose-600 group-hover:text-white transition-colors">
                <Calendar size={18} />
              </div>
              <span className="text-sm font-bold text-slate-700">
                {formatFullDate(endDate)}
              </span>
              <ChevronDown size={16} className={`text-slate-400 ml-auto transition-transform ${showEndCalendar ? 'rotate-180' : ''}`} />
            </button>

            <AnimatePresence>
              {showEndCalendar && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 10 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="absolute top-full right-0 mt-3 z-[110] bg-white border border-slate-100 rounded-[2rem] shadow-2xl p-6"
                >
                  <CalendarPicker
                    selectedDate={endDate}
                    onSelect={setEndDate}
                    onClose={() => setShowEndCalendar(false)}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <div className="relative" ref={exportRef}>
          <button
            onClick={() => setShowExportOptions(!showExportOptions)}
            className="bg-indigo-600 text-white px-8 py-4 rounded-2xl text-[11px] font-bold tracking-widest  hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100 flex items-center gap-3 hover:-translate-y-0.5 active:scale-95"
          >
            <Download size={18} />
            Export Report
            <ChevronDown size={18} className={`transition-transform ${showExportOptions ? 'rotate-180' : ''}`} />
          </button>

          <AnimatePresence>
            {showExportOptions && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="absolute right-0 mt-2 w-56 bg-white rounded-2xl shadow-2xl border border-slate-100 py-3 z-50 overflow-hidden"
              >
                <button
                  onClick={() => { handleExportCSV(); setShowExportOptions(false); }}
                  className="w-full px-5 py-3 text-left text-[11px] font-bold text-slate-600 hover:bg-slate-50 hover:text-indigo-600 transition-colors flex items-center gap-3"
                >
                  <Download size={16} className="text-slate-400" />
                  Export as CSV (Excel)
                </button>
                <button
                  onClick={() => { handleExportPDF(); setShowExportOptions(false); }}
                  className="w-full px-5 py-3 text-left text-[11px] font-bold text-slate-600 hover:bg-slate-50 hover:text-rose-600 transition-colors flex items-center gap-3"
                >
                  <FileText size={16} className="text-slate-400" />
                  Export as PDF
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Report Content */}
      <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-xl overflow-hidden">
        <div className="p-8 border-b border-slate-100 flex flex-col md:flex-row justify-between items-center gap-6 bg-slate-50/30">
          <div>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-3">
              <Activity size={24} className="text-indigo-600" />
              {reportType === 'Present' ? 'Overall Attendance' : reportType}
            </h2>
            <p className="text-[10px] font-bold text-slate-400 tracking-widest  mt-1">
              Generated for: {formatFullDate(startDate)} to {formatFullDate(endDate)}
            </p>
          </div>

          <div className="relative group min-w-[300px]">
            <Search size={18} className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-600 transition-colors" />
            <input
              type="text"
              placeholder="Search employee or mobile..."
              value={search}
              onChange={handleSearch}
              className="w-full bg-white border border-slate-200 pl-14 pr-6 py-3.5 rounded-2xl text-xs font-bold text-slate-700 outline-none focus:border-indigo-100 transition-all shadow-sm"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-32 gap-4">
              <Loader2 className="animate-spin text-indigo-600" size={40} />
              <p className="text-xs font-bold text-slate-400 tracking-widest ">Fetching secure records...</p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/50">
                  <th className="px-2 py-4 text-[10px] font-extrabold text-black/80 tracking-tighter border-b border-r border-slate-100 last:border-r-0 text-center ">Date</th>
                  <th className="px-2 py-4 text-[10px] font-extrabold text-black/80 tracking-tighter border-b border-r border-slate-100 last:border-r-0 text-center ">Staff</th>
                  <th className="px-2 py-4 text-[10px] font-extrabold text-black/80 tracking-tighter border-b border-r border-slate-100 last:border-r-0 text-center ">Mobile</th>

                  {reportType === 'Present Timing Sheet' && (
                    <>
                      <th className="px-2 py-4 text-[10px] font-extrabold text-black/80 tracking-tighter border-b border-r border-slate-100 last:border-r-0 text-center  relative group">
                        <div className="flex items-center justify-center gap-1 cursor-pointer" onClick={() => setShowShiftFilter(!showShiftFilter)}>
                          Shift <ChevronDown size={10} className={shiftFilter !== 'All' ? 'text-blue-600' : 'text-slate-400'} />
                        </div>
                        {showShiftFilter && (
                          <div className="absolute top-full left-0 mt-1 bg-white border border-slate-100 shadow-xl rounded-lg z-[150] py-1 min-w-[120px] normal-case font-bold">
                            {uniqueShifts.map(s => (
                              <button key={s} onClick={() => { setShiftFilter(s); setShowShiftFilter(false); }} className={`w-full text-left px-3 py-1.5 text-[9px] hover:bg-slate-50 ${shiftFilter === s ? 'text-blue-600 bg-blue-50/30' : 'text-slate-600'}`}>{s}</button>
                            ))}
                          </div>
                        )}
                      </th>
                      <th className="px-2 py-4 text-[10px] font-extrabold text-black/80 tracking-tighter border-b border-r border-slate-100 last:border-r-0 text-center  relative group">
                        <div className="flex items-center justify-center gap-1 cursor-pointer" onClick={() => setShowStatusFilter(!showStatusFilter)}>
                          Status <ChevronDown size={10} className={statusFilter !== 'All' ? 'text-blue-600' : 'text-slate-400'} />
                        </div>
                        {showStatusFilter && (
                          <div className="absolute top-full left-0 mt-1 bg-white border border-slate-100 shadow-xl rounded-lg z-[150] py-1 min-w-[120px] normal-case font-bold">
                            {uniqueStatuses.map(s => (
                              <button key={s} onClick={() => { setStatusFilter(s); setShowStatusFilter(false); }} className={`w-full text-left px-3 py-1.5 text-[9px] hover:bg-slate-50 ${statusFilter === s ? 'text-blue-600 bg-blue-50/30' : 'text-slate-600'}`}>{s}</button>
                            ))}
                          </div>
                        )}
                      </th>
                      <th className="px-2 py-4 text-[10px] font-extrabold text-black/80 tracking-tighter border-b border-r border-slate-100 last:border-r-0 text-center ">In</th>
                      <th className="px-2 py-4 text-[10px] font-extrabold text-black/80 tracking-tighter border-b border-r border-slate-100 last:border-r-0 text-center ">Sel-In</th>
                      <th className="px-2 py-4 text-[10px] font-extrabold text-black/80 tracking-tighter border-b border-r border-slate-100 last:border-r-0 text-center ">Out</th>
                      <th className="px-2 py-4 text-[10px] font-extrabold text-black/80 tracking-tighter border-b border-r border-slate-100 last:border-r-0 text-center ">Sel-Out</th>
                      <th className="px-2 py-4 text-[10px] font-extrabold text-black/80 tracking-tighter border-b border-r border-slate-100 last:border-r-0 text-center ">Work</th>
                    </>
                  )}

                  {reportType === 'Break & work Timing Sheet' && (
                    <>
                      <th className="px-2 py-4 text-[10px] font-extrabold text-black tracking-tighter border-b border-r border-slate-100 last:border-r-0 text-center  relative group">
                        <div className="flex items-center justify-center gap-1 cursor-pointer" onClick={() => setShowShiftFilter(!showShiftFilter)}>
                          Shift <ChevronDown size={10} className={shiftFilter !== 'All' ? 'text-blue-600' : 'text-slate-400'} />
                        </div>
                        {showShiftFilter && (
                          <div className="absolute top-full left-0 mt-1 bg-white border border-slate-100 shadow-xl rounded-lg z-[150] py-1 min-w-[120px] normal-case font-bold">
                            {uniqueShifts.map(s => (
                              <button key={s} onClick={() => { setShiftFilter(s); setShowShiftFilter(false); }} className={`w-full text-left px-3 py-1.5 text-[9px] hover:bg-slate-50 ${shiftFilter === s ? 'text-blue-600 bg-blue-50/30' : 'text-slate-600'}`}>{s}</button>
                            ))}
                          </div>
                        )}
                      </th>
                      <th className="px-2 py-4 text-[10px] font-extrabold text-black tracking-tighter border-b border-r border-slate-100 last:border-r-0 text-center  relative group">
                        <div className="flex items-center justify-center gap-1 cursor-pointer" onClick={() => setShowStatusFilter(!showStatusFilter)}>
                          Status <ChevronDown size={10} className={statusFilter !== 'All' ? 'text-blue-600' : 'text-slate-400'} />
                        </div>
                        {showStatusFilter && (
                          <div className="absolute top-full left-0 mt-1 bg-white border border-slate-100 shadow-xl rounded-lg z-[150] py-1 min-w-[120px] normal-case font-bold">
                            {uniqueStatuses.map(s => (
                              <button key={s} onClick={() => { setStatusFilter(s); setShowStatusFilter(false); }} className={`w-full text-left px-3 py-1.5 text-[9px] hover:bg-slate-50 ${statusFilter === s ? 'text-blue-600 bg-blue-50/30' : 'text-slate-600'}`}>{s}</button>
                            ))}
                          </div>
                        )}
                      </th>
                      <th className="px-2 py-4 text-[10px] font-extrabold text-black/80 tracking-tighter border-b border-r border-slate-100 last:border-r-0 text-center ">Work</th>
                      <th className="px-2 py-4 text-[10px] font-extrabold text-black/80 tracking-tighter border-b border-r border-slate-100 last:border-r-0 text-center ">Slot</th>
                      <th className="px-2 py-4 text-[10px] font-extrabold text-black/80 tracking-tighter border-b border-r border-slate-100 last:border-r-0 text-center ">Breaks</th>
                      <th className="px-2 py-4 text-[10px] font-extrabold text-black/80 tracking-tighter border-b border-r border-slate-100 last:border-r-0 text-center ">Total</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {currentData.map((row, idx) => (
                  <tr key={row.id} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="px-2 py-4 text-[9px] font-bold text-slate-800 whitespace-nowrap border-r border-slate-100 last:border-r-0 text-center">{formatFullDate(row.date)}</td>
                    <td className="px-2 py-4 border-r border-slate-100 last:border-r-0">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-indigo-50 border border-slate-100 flex items-center justify-center overflow-hidden flex-shrink-0">
                          {row.profileImage ? (
                            <img src={getFullImageUrl(row.profileImage)} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-[10px] font-bold text-indigo-600">{row.name.charAt(0)}</span>
                          )}
                        </div>
                        <div className="flex flex-col items-center">
                          <p onClick={() => navigate(`/employee/${row.userId}`)} className="text-[12px] font-extrabold text-blue-600 cursor-pointer hover:text-blue-700 transition-colors leading-tight">{row.name}</p>
                          <p className="text-[9px] font-bold text-slate-700 tracking-tight">{row.department}</p>
                          <p className="text-[9px] font-bold text-slate-400 tracking-tight">{row.designation}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-2 py-4 text-center text-[10px] font-bold text-slate-800 whitespace-nowrap border-r border-slate-100 last:border-r-0">{row.mobile}</td>

                    {reportType === 'Present Timing Sheet' && (
                      <>
                        <td className="px-2 py-4 border-r border-slate-100 last:border-r-0 text-center">
                          <div className="flex flex-col items-center justify-center gap-0.5">
                            {row.shift && row.shift.includes('(') ? (
                              <>
                                <span className="text-[9px] font-bold text-slate-700 whitespace-nowrap">
                                  {row.shift.split('(')[0].trim()}
                                </span>
                                <span className="text-[8px] font-bold text-indigo-500 bg-indigo-50/50 px-1.5 py-0.5 rounded-full border border-indigo-100/50 whitespace-nowrap">
                                  {format12hr(row.shift.match(/\((.+)\)/)?.[1] || '')}
                                </span>
                              </>
                            ) : (
                              <span className="px-1.5 py-0.5 bg-slate-50 text-slate-600 rounded-full text-[8px] font-bold tracking-tight inline-block whitespace-nowrap border border-slate-100">
                                {row.shift}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-2 py-4 border-r border-slate-100 last:border-r-0">
                          <div className="flex items-center justify-center">
                            <span className={`px-2 py-0.5 rounded-full text-[8px] font-bold tracking-tight border flex items-center justify-center min-w-[70px] ${row.status === 'Present' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                              row.status === 'Late' ? 'bg-amber-50 text-amber-600 border-amber-100' :
                                row.status === 'Half Day' ? 'bg-orange-50 text-orange-600 border-orange-100' :
                                  row.status === 'Absent' ? 'bg-rose-50 text-rose-600 border-rose-100' :
                                    row.status === 'Neutral' ? 'bg-sky-50 text-sky-600 border-sky-100' :
                                      row.status === 'Leave' ? 'bg-purple-50 text-purple-600 border-purple-100' :
                                        'bg-indigo-50 text-indigo-600 border-indigo-100'
                              }`}>
                              {row.status}
                            </span>
                          </div>
                        </td>
                        <td className="px-2 py-4 text-center border-r border-slate-100 last:border-r-0">
                          <p className="text-[10px] font-bold text-slate-700 whitespace-nowrap">{formatDate(row.timeIn)}</p>
                          {row.timeIn && (
                            <span className={`text-[7px] font-bold px-1.5 py-0.5 rounded-full mt-0.5 inline-block whitespace-nowrap ${row.timeInOutside ? 'bg-red-50 text-red-500' : 'bg-emerald-50 text-emerald-600'}`}>
                              {row.timeInOutside ? 'Outside' : 'Inside'}
                            </span>
                          )}
                          {row.timeInLocation && (
                            <p className="text-[8px] text-slate-800 mt-0.5 leading-tight break-words max-w-[100px] mx-auto">{row.timeInLocation}</p>
                          )}
                        </td>
                        <td className="px-2 py-4 text-center border-r border-slate-100 last:border-r-0">
                          {row.timeInSelfie ? (
                            <div className="relative group/img inline-block cursor-pointer" onClick={() => setSelectedSelfie(getFullImageUrl(row.timeInSelfie))}>
                              <img src={getFullImageUrl(row.timeInSelfie)} className="w-10 h-10 rounded-xl object-cover border-2 border-white shadow-md transition-transform group-hover/img:scale-110" />
                              <div
                                onClick={() => setSelectedSelfie(row.timeInSelfie)}
                                className="absolute inset-0 bg-black/20 opacity-0 group-hover/img:opacity-100 transition-opacity rounded-xl flex items-center justify-center cursor-pointer">
                                <Eye size={12} className="text-white" />
                              </div>
                            </div>
                          ) : <span className="text-[9px] text-slate-300">NA</span>}
                        </td>
                        <td className="px-2 py-4 text-center border-r border-slate-100 last:border-r-0">
                          <p className="text-[10px] font-bold text-slate-700 whitespace-nowrap">{!row.timeOut ? 'NA' : formatDate(row.timeOut)}</p>
                          {row.timeOut && (
                            <span className={`text-[7px] font-bold px-1.5 py-0.5 rounded-full mt-0.5 inline-block whitespace-nowrap ${row.timeOutOutside ? 'bg-red-50 text-red-500' : 'bg-emerald-50 text-emerald-600'}`}>
                              {row.timeOutOutside ? 'Outside' : 'Inside'}
                            </span>
                          )}
                          {row.timeOutLocation && (
                            <p className="text-[8px] text-slate-800 mt-0.5 leading-tight break-words max-w-[100px] mx-auto">{row.timeOutLocation}</p>
                          )}
                        </td>
                        <td className="px-2 py-4 text-center border-r border-slate-100 last:border-r-0">
                          {row.timeOutSelfie ? (
                            <div className="relative group/img inline-block cursor-pointer" onClick={() => setSelectedSelfie(getFullImageUrl(row.timeOutSelfie))}>
                              <img src={getFullImageUrl(row.timeOutSelfie)} className="w-10 h-10 rounded-xl object-cover border-2 border-white shadow-md transition-transform group-hover/img:scale-110" />
                              <div
                                onClick={() => setSelectedSelfie(getFullImageUrl(row.timeOutSelfie))}
                                className="absolute inset-0 bg-black/20 opacity-0 group-hover/img:opacity-100 transition-opacity rounded-xl flex items-center justify-center cursor-pointer">
                                <Eye size={12} className="text-white" />
                              </div>
                            </div>
                          ) : <span className="text-[9px] text-slate-300">NA</span>}
                        </td>
                        <td className="px-2 py-4 text-center border-r border-slate-100 last:border-r-0">
                          <span className="text-[10px] font-bold text-emerald-600 whitespace-nowrap">{formatDuration(row.totalHoursWorked)}</span>
                        </td>
                      </>
                    )}

                    {reportType === 'Break & work Timing Sheet' && (
                      <>
                        <td className="px-2 py-4 border-r border-slate-100 last:border-r-0 text-center">
                          <div className="flex flex-col items-center justify-center gap-0.5">
                            {row.shift && row.shift.includes('(') ? (
                              <>
                                <span className="text-[9px] font-bold text-slate-700 whitespace-nowrap">
                                  {row.shift.split('(')[0].trim()}
                                </span>
                                <span className="text-[8px] font-bold text-indigo-500 bg-indigo-50/50 px-1.5 py-0.5 rounded-full border border-indigo-100/50 whitespace-nowrap">
                                  {format12hr(row.shift.match(/\((.+)\)/)?.[1] || '')}
                                </span>
                              </>
                            ) : (
                              <span className="px-1.5 py-0.5 bg-slate-50 text-slate-600 rounded-full text-[8px] font-bold tracking-tight inline-block whitespace-nowrap border border-slate-100">
                                {row.shift}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-2 py-4 border-r border-slate-100 last:border-r-0 text-center">
                          <div className="flex items-center justify-center">
                            <span className={`px-2 py-0.5 rounded-full text-[8px] font-bold tracking-tight border flex items-center justify-center min-w-[70px] ${row.status === 'Present' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                              row.status === 'Late' ? 'bg-amber-50 text-amber-600 border-amber-100' :
                                row.status === 'Half Day' ? 'bg-orange-50 text-orange-600 border-orange-100' :
                                  row.status === 'Absent' ? 'bg-rose-50 text-rose-600 border-rose-100' :
                                    row.status === 'Neutral' ? 'bg-sky-50 text-sky-600 border-sky-100' :
                                      row.status === 'Leave' ? 'bg-purple-50 text-purple-600 border-purple-100' :
                                        'bg-indigo-50 text-indigo-600 border-indigo-100'
                              }`}>
                              {row.status}
                            </span>
                          </div>
                        </td>
                        <td className="px-2 py-4 text-center border-r border-slate-100 last:border-r-0">
                          <span className="text-[10px] font-bold text-emerald-600 whitespace-nowrap">{formatDuration(row.totalHoursWorked)}</span>
                        </td>
                        <td className="px-2 py-4 text-center border-r border-slate-100 last:border-r-0">
                          <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded-xl text-[9px] font-bold tracking-tighter whitespace-nowrap">{row.breaksTaken} SLOTS</span>
                        </td>
                        <td className="px-2 py-4 border-r border-slate-100 last:border-r-0 text-center">
                          <div className="flex flex-wrap justify-center gap-1 max-w-[150px] mx-auto">
                            {row.breaks?.slice(0, 2).map((b, i) => (
                              <div key={i} className="px-1 py-0.5 bg-indigo-50 border border-indigo-100 rounded-lg text-[6.5px] font-extrabold text-indigo-600 whitespace-nowrap shadow-sm">
                                {formatDate(b.startTime)}-{formatDate(b.endTime)}
                              </div>
                            ))}
                            {row.breaks?.length > 2 && <span className="text-[7px] font-bold text-slate-400">+{row.breaks.length - 2}</span>}
                            {row.breaks?.length === 0 && <span className="text-[7px] font-bold text-slate-300">None</span>}
                          </div>
                        </td>
                        <td className="px-2 py-4 text-center border-r border-slate-100 last:border-r-0">
                          <span className="text-[10px] font-bold text-indigo-600 whitespace-nowrap">{formatDuration(row.totalBreakTime / 60)}</span>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {filteredData.length === 0 && !loading && (
            <div className="py-32 text-center bg-white">
              <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center text-slate-200 mx-auto mb-6">
                <FileText size={40} />
              </div>
              <h4 className="text-sm font-bold text-slate-400 tracking-widest ">Secure vault empty</h4>
              <p className="text-[11px] font-bold text-slate-300 mt-2">Try adjusting your filters or search terms</p>
            </div>
          )}
        </div>

        {/* Premium Pagination Footer */}
        {totalPages > 1 && (
          <div className="px-8 py-6 bg-slate-50/50 border-t border-slate-100 flex flex-col md:flex-row justify-between items-center gap-6">
            <p className="text-[11px] font-bold text-slate-400 tracking-widest ">
              Showing <span className="text-slate-900">{(currentPage - 1) * itemsPerPage + 1}</span> to <span className="text-slate-900">{Math.min(currentPage * itemsPerPage, filteredData.length)}</span> of <span className="text-slate-900">{filteredData.length}</span> Records
            </p>
            <div className="flex-1 flex justify-center">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                  disabled={currentPage === 1}
                  className="p-2 bg-white border border-slate-200 rounded-xl text-slate-400 hover:text-indigo-600 transition-all shadow-sm disabled:opacity-50 active:scale-95"
                >
                  <ChevronLeft size={16} />
                </button>

                <div className="flex items-center gap-1.5">
                  {(() => {
                    const pages = [];
                    const maxVisible = 5;
                    if (totalPages <= maxVisible + 2) {
                      for (let i = 1; i <= totalPages; i++) pages.push(i);
                    } else {
                      if (currentPage <= 3) {
                        pages.push(1, 2, 3, '...', totalPages - 1, totalPages);
                      } else if (currentPage >= totalPages - 2) {
                        pages.push(1, 2, '...', totalPages - 2, totalPages - 1, totalPages);
                      } else {
                        pages.push(1, '...', currentPage, '...', totalPages);
                      }
                    }
                    return pages.map((p, i) => (
                      p === '...' ? (
                        <span key={`sep-${i}`} className="text-slate-300 px-1 font-bold">...</span>
                      ) : (
                        <button
                          key={p}
                          onClick={() => setCurrentPage(p)}
                          className={`w-8 h-8 rounded-xl text-[10px] font-bold transition-all ${currentPage === p ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' : 'bg-white border border-slate-200 text-slate-500 hover:bg-slate-50'}`}
                        >
                          {p}
                        </button>
                      )
                    ));
                  })()}
                </div>

                <button
                  onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                  disabled={currentPage === totalPages}
                  className="p-2 bg-white border border-slate-200 rounded-xl text-slate-400 hover:text-indigo-600 transition-all shadow-sm disabled:opacity-50 active:scale-95"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      {/* Selfie Preview Modal */}
      <AnimatePresence>
        {selectedSelfie && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSelectedSelfie(null)}
            className="fixed inset-0 z-[200] bg-slate-900/90 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="relative max-w-2xl w-full bg-white rounded-[2.5rem] overflow-hidden shadow-2xl"
            >
              <img src={selectedSelfie} className="w-full h-auto max-h-[80vh] object-contain bg-slate-50" />
              <button
                onClick={() => setSelectedSelfie(null)}
                className="absolute top-6 right-6 w-12 h-12 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center text-black transition-all"
              >
                <X size={20} />
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Reports;
