import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Download,
  Search
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import api from '../../api/axios';

const CustomDatePicker = ({ value, onChange, label }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  // Parse value string (YYYY-MM-DD) into Date object
  const currentDate = value ? new Date(value) : new Date();
  const [viewDate, setViewDate] = useState(currentDate);

  // Handle click outside to close picker
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Sync view date if input value changes
  useEffect(() => {
    if (value) {
      setViewDate(new Date(value));
    }
  }, [value]);

  const handlePrevMonth = () => {
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1));
  };

  const handleSelectDay = (day) => {
    const newSelected = new Date(viewDate.getFullYear(), viewDate.getMonth(), day);
    const yyyy = newSelected.getFullYear();
    const mm = String(newSelected.getMonth() + 1).padStart(2, '0');
    const dd = String(newSelected.getDate()).padStart(2, '0');
    onChange(`${yyyy}-${mm}-${dd}`);
    setIsOpen(false);
  };

  // Compute calendar days
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  const firstDayOfMonth = new Date(year, month, 1).getDay(); // 0 is Sunday
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Formatting for display
  const formattedDisplay = currentDate.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });

  const monthName = viewDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const daysArray = [];
  for (let i = 0; i < firstDayOfMonth; i++) {
    daysArray.push(null);
  }
  for (let i = 1; i <= daysInMonth; i++) {
    daysArray.push(i);
  }

  return (
    <div className="relative space-y-2 w-full" ref={containerRef}>
      <label className="text-[10px] font-extrabold text-slate-400 tracking-widest block ml-1 ">
        {label}
      </label>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between bg-white border border-slate-200 hover:border-indigo-300 focus:outline-none rounded-2xl px-4 py-3.5 transition-all duration-200 shadow-sm text-left group"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-500 group-hover:scale-105 transition-transform duration-200">
            <Calendar size={15} />
          </div>
          <div>
            <span className="text-xs font-bold text-slate-700 block">{formattedDisplay}</span>
          </div>
        </div>
        <ChevronRight size={16} className={`text-slate-400 transition-transform ${isOpen ? 'rotate-90 text-indigo-500' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 z-50 mt-2 w-80 bg-white border border-slate-200/80 rounded-2xl shadow-2xl p-4">
          <div className="flex justify-between items-center mb-3">
            <button
              type="button"
              onClick={handlePrevMonth}
              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600 transition-colors cursor-pointer"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-xs font-extrabold text-slate-800 tracking-tight">{monthName}</span>
            <button
              type="button"
              onClick={handleNextMonth}
              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600 transition-colors cursor-pointer"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center mb-1">
            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((wd) => (
              <span key={wd} className="text-[9px] font-extrabold text-slate-400  tracking-widest py-1">
                {wd}
              </span>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {daysArray.map((day, idx) => {
              if (day === null) {
                return <div key={`empty-${idx}`} />;
              }
              const isSelected =
                currentDate.getDate() === day &&
                currentDate.getMonth() === month &&
                currentDate.getFullYear() === year;

              return (
                <button
                  key={`day-${day}`}
                  type="button"
                  onClick={() => handleSelectDay(day)}
                  className={`py-2 text-[10px] font-bold rounded-xl transition-all cursor-pointer ${isSelected
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-150'
                    : 'text-slate-700 hover:bg-indigo-50 hover:text-indigo-600'
                    }`}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

const NotificationReports = () => {
  const navigate = useNavigate();

  // Telemetry log states
  const [logs, setLogs] = useState([]);
  const [filteredLogs, setFilteredLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters: Only fromDate and toDate remaining as requested
  const [fromDate, setFromDate] = useState('2024-01-01');
  const [toDate, setToDate] = useState(() => new Date().toISOString().split('T')[0]);

  // Controls
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [generatedAt, setGeneratedAt] = useState('');

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const res = await api.get('/notifications/reports');
      if (res.data.success) {
        setLogs(res.data.data);
      }
    } catch (err) {
      toast.error('Failed to load recipient telemetry logs');
    } finally {
      setLoading(false);
    }
  };

  const applyReportFilters = () => {
    let result = [...logs];

    // Filter by From and To dates
    const start = fromDate ? new Date(fromDate).setHours(0, 0, 0, 0) : 0;
    const end = toDate ? new Date(toDate).setHours(23, 59, 59, 999) : Infinity;

    result = result.filter(log => {
      const logTime = new Date(log.sentAt || log.sentTime || log.createdAt).getTime();
      return logTime >= start && logTime <= end;
    });

    // Remove leave notifications unless they are approved
    result = result.filter(log => {
      const titleLower = (log.notification?.title || '').toLowerCase();
      if (titleLower.includes('leave')) {
        return titleLower.includes('approved') || titleLower.includes('approve');
      }
      return true;
    });

    // Apply Search filter
    if (searchTerm) {
      const query = searchTerm.toLowerCase();
      result = result.filter(log =>
        (log.employee?.name || '').toLowerCase().includes(query) ||
        (log.employee?.mobile || log.employee?.phone || '').includes(query) ||
        (log.notification?.title || '').toLowerCase().includes(query) ||
        (log.notification?.description || log.notification?.message || '').toLowerCase().includes(query)
      );
    }

    setFilteredLogs(result);
    setCurrentPage(1);

    // Live update dynamic Generation timestamp
    setGeneratedAt(new Date().toLocaleString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    }));
  };

  // Instantly apply filters whenever parameters change!
  useEffect(() => {
    applyReportFilters();
  }, [fromDate, toDate, logs, searchTerm]);

  useEffect(() => {
    fetchLogs();
  }, []);

  // Format YYYY-MM-DD to DD/MM/YYYY for the header banner
  const formatDateLabel = (dStr) => {
    if (!dStr) return '';
    const parts = dStr.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dStr;
  };

  const handleExportCSV = () => {
    const headers = ['S.no', 'Employee Name', 'Mobile No', 'Title', 'Notification Type', 'Date Time', 'Is read by user'];
    const data = filteredLogs.map((log, index) => {
      const formattedDate = new Date(log.sentAt || log.sentTime || log.createdAt).toLocaleString('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
      return [
        index + 1,
        `"${(log.employee?.name || 'Deleted Employee').replace(/"/g, '""')}"`,
        `"${log.employee?.mobile || log.employee?.phone || 'N/A'}"`,
        `"${(log.notification?.description || log.notification?.title || '').replace(/"/g, '""')}"`,
        `"${log.notification?.type || 'HR Announcement'}"`,
        formattedDate,
        (log.isRead || log.read) ? 'Read' : 'Not read'
      ];
    });

    const csvContent = [headers, ...data].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `Employee_Notifications_Report.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Recipient report exported as CSV!');
  };

  const totalPages = Math.ceil(filteredLogs.length / itemsPerPage);
  const paginatedLogs = useMemo(() => {
    return filteredLogs.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  }, [filteredLogs, currentPage, itemsPerPage]);

  const getPaginationRange = (currentPage, totalPages) => {
    if (totalPages <= 1) return totalPages === 1 ? [1] : [];
    
    const delta = 1;
    const range = [];
    for (let i = Math.max(2, currentPage - delta); i <= Math.min(totalPages - 1, currentPage + delta); i++) {
      range.push(i);
    }
    
    if (currentPage - delta > 2) {
      range.unshift("...");
    }
    if (currentPage + delta < totalPages - 1) {
      range.push("...");
    }
    
    range.unshift(1);
    range.push(totalPages);
    
    return range;
  };

  return (
    <div className="space-y-6 md:space-y-8 animate-fade-up">

      {/* Premium Navigation Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-slate-100">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight m-0">
            Notification Delivery Report
          </h2>
          <p className="text-slate-500 font-bold text-[13px] mt-2">
            Audit and analyze sent push notifications and delivery tracking logs.
          </p>
        </div>
        <button
          onClick={() => navigate('/notifications/dashboard')}
          className="group flex items-center gap-2 bg-gradient-to-r from-slate-800 to-slate-950 text-white font-extrabold text-xs px-6 py-3 rounded-2xl shadow-xl shadow-slate-900/10 hover:shadow-slate-900/20 transition-all duration-300 hover:-translate-y-0.5 active:translate-y-0"
        >
          <ChevronLeft size={16} className="text-slate-400 group-hover:text-white transition-colors" />
          Back to Dashboard
        </button>
      </div>

      {/* Premium Website UI card layout wrapper */}
      <div className="bg-white border border-slate-200/60 rounded-[2.5rem] p-6 md:p-8 shadow-2xl shadow-slate-100/40 space-y-6">

        {/* Simplified Inline Date Filter Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-50/50 border border-slate-150/40 rounded-3xl p-5 md:p-6">
          <CustomDatePicker
            value={fromDate}
            onChange={setFromDate}
            label="Filter From Date"
          />
          <CustomDatePicker
            value={toDate}
            onChange={setToDate}
            label="Filter To Date"
          />
        </div>

        {/* Sub-Header Banner (matching original layout style but in premium design system) */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-2 px-1 text-xs font-extrabold text-slate-800 border-b border-slate-100 pb-3">
          <div className="text-slate-700">
            Employee All Notifications Report from <span className="text-indigo-600 font-extrabold">{formatDateLabel(fromDate) || 'Start'}</span> to <span className="text-indigo-600 font-extrabold">{formatDateLabel(toDate) || 'End'}</span>
          </div>
          <div className="text-slate-400 font-bold">
            Generated On: <span className="text-slate-600 font-extrabold">{generatedAt}</span>
          </div>
        </div>

        {/* Report Data Grid controls */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 text-xs">

          {/* Row limits & CSV download */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 border border-slate-200 px-3 py-2 rounded-2xl bg-slate-50 text-slate-600 font-bold">
              <span>Show</span>
              <select
                value={itemsPerPage}
                onChange={(e) => {
                  setItemsPerPage(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="bg-transparent border-none focus:outline-none p-0 text-slate-800 font-extrabold cursor-pointer"
              >
                <option value={5}>5</option>
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
              <span>rows</span>
            </div>

            <button
              onClick={handleExportCSV}
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-2xl font-extrabold transition-all active:scale-95 flex items-center gap-1.5"
            >
              <Download size={14} /> Export CSV
            </button>
          </div>

          {/* Search box matching theme */}
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input
              type="text"
              placeholder="Search name, phone, details..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:bg-white pl-10 pr-4 py-2.5 rounded-2xl outline-none text-xs font-bold text-slate-700 transition-all"
            />
          </div>
        </div>

        {/* Clean, Thin slate bordered table grid */}
        <div className="border border-slate-100 overflow-hidden bg-white shadow-xl shadow-slate-50/50">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 text-[10px] font-extrabold text-indigo-600  tracking-widest border-b border-slate-150/40">
                  <th className="px-6 py-4 border border-slate-150/20 text-center w-14">S.no</th>
                  <th className="px-6 py-4 border border-slate-150/20 min-w-[150px]">Employee Name</th>
                  <th className="px-6 py-4 border border-slate-150/20 w-36">Mobile No</th>
                  <th className="px-6 py-4 border border-slate-150/20 min-w-[320px]">Title</th>
                  <th className="px-6 py-4 border border-slate-150/20 w-44">Notification Type</th>
                  <th className="px-6 py-4 border border-slate-150/20 min-w-[140px]">Date Time</th>
                  <th className="px-6 py-4 border border-slate-150/20 w-32">Is read by user</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-bold text-slate-700">
                {loading ? (
                  <tr>
                    <td colSpan="7" className="px-6 py-20 text-center">
                      <div className="flex flex-col items-center justify-center gap-3">
                        <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
                        <p className="text-slate-400 font-bold">Compiling delivery logs...</p>
                      </div>
                    </td>
                  </tr>
                ) : paginatedLogs.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="px-6 py-20 text-center text-slate-400 font-bold">
                      No tracking telemetry logs found for the selected date bounds.
                    </td>
                  </tr>
                ) : (
                  paginatedLogs.map((log, index) => {
                    const serialNum = (currentPage - 1) * itemsPerPage + index + 1;

                    // Date formatting matching Image 2
                    const formattedDate = new Date(log.sentAt || log.sentTime || log.createdAt).toLocaleString('en-GB', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: true
                    }).toLowerCase();

                    // Resolve clean readable categories matching original layout
                    let categoryLabel = 'Late coming';
                    const titleLower = (log.notification?.title || '').toLowerCase();
                    if (titleLower.includes('leave')) {
                      categoryLabel = 'Leave Approved';
                    } else if (titleLower.includes('geofence enter')) {
                      categoryLabel = 'Geofence Entered';
                    } else if (titleLower.includes('geofence exit')) {
                      categoryLabel = 'Geofence Exited';
                    } else if (log.notification?.type === 'Automated') {
                      categoryLabel = 'Automated Alert';
                    } else {
                      categoryLabel = log.notification?.type || 'HR Announcement';
                    }

                    const isRead = log.isRead || log.read;

                    return (
                      <tr key={log._id} className="hover:bg-slate-50/40 transition-colors group">
                        {/* Serial number centered */}
                        <td className="px-6 py-4 border border-slate-100 text-center text-slate-400">{serialNum}</td>

                        {/* Clickable blue link employee name */}
                        <td className="px-6 py-4 border border-slate-100 text-indigo-600 hover:text-indigo-800 hover:underline cursor-pointer transition-colors font-extrabold">
                          {log.employee?.name || 'Deleted Employee'}
                        </td>

                        {/* Mobile No */}
                        <td className="px-6 py-4 border border-slate-100 text-slate-500 font-mono">
                          {log.employee?.mobile || log.employee?.phone || 'N/A'}
                        </td>

                        {/* Title text */}
                        <td className="px-6 py-4 border border-slate-100 text-slate-800 leading-relaxed font-medium break-words max-w-[340px]">
                          {log.notification?.description || log.notification?.title || 'Announcement message summary.'}
                        </td>

                        {/* Plain text Category */}
                        <td className="px-6 py-4 border border-slate-100 text-slate-700 font-bold">
                          {categoryLabel}
                        </td>

                        {/* Date Time */}
                        <td className="px-6 py-4 border border-slate-100 text-slate-500 font-bold whitespace-nowrap">
                          {formattedDate}
                        </td>

                        {/* Plain text read indicator */}
                        <td className={`px-6 py-4 border border-slate-100 font-bold ${isRead ? 'text-emerald-600' : 'text-slate-700'
                          }`}>
                          {isRead ? 'Read' : 'Not read'}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination bar with premium shadows and indigo active elements */}
          <div className="p-5 bg-slate-50 flex flex-col sm:flex-row justify-between items-center gap-4 text-xs font-bold text-slate-400 border-t border-slate-150/40">
            <div>
              Showing {filteredLogs.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0} to {Math.min(currentPage * itemsPerPage, filteredLogs.length)} of {filteredLogs.length} entries
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-3 py-2 border border-slate-200 bg-white rounded-xl text-slate-600 hover:bg-slate-100 disabled:opacity-50 disabled:hover:bg-white transition-all shadow-sm"
              >
                Previous
              </button>

              {getPaginationRange(currentPage, totalPages).map((pageNum, idx) => (
                <button
                  key={`${pageNum}-${idx}`}
                  onClick={() => pageNum !== "..." && setCurrentPage(pageNum)}
                  disabled={pageNum === "..."}
                  className={`px-3.5 py-2 border rounded-xl transition-all font-extrabold text-xs ${currentPage === pageNum
                    ? 'bg-indigo-600 text-white border-transparent shadow-lg shadow-indigo-100'
                    : pageNum === "..."
                    ? 'bg-transparent text-slate-400 border-transparent cursor-default'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    }`}
                >
                  {pageNum}
                </button>
              ))}

              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-2 border border-slate-200 bg-white rounded-xl text-slate-600 hover:bg-slate-100 disabled:opacity-50 disabled:hover:bg-white transition-all shadow-sm"
              >
                Next
              </button>
            </div>
          </div>
        </div>

      </div>

    </div>
  );
};

export default NotificationReports;
