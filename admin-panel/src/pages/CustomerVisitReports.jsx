import { AnimatePresence, motion } from 'framer-motion';
import {
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  Loader2,
  Printer,
  X
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';
import CalendarPicker from '../components/CalendarPicker';

const CustomerVisitReports = () => {
  const navigate = useNavigate();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);

  // Helper date generators
  const getTodayStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const getStartOfMonthStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  };

  // Active filter state (used to fetch data)
  const [startDate, setStartDate] = useState(getStartOfMonthStr());
  const [endDate, setEndDate] = useState(getTodayStr());

  // Static filters (no longer displayed in UI)
  const selectedCustomerId = '';
  const selectedEmployeeId = '';
  const selectedStatus = '';
  const reportType = 'Customer Centric Customer Visit';

  // Calendar picker open states
  const [showStartCalendar, setShowStartCalendar] = useState(false);
  const [showEndCalendar, setShowEndCalendar] = useState(false);
  const startCalendarRef = useRef(null);
  const endCalendarRef = useRef(null);

  // UI state
  const [showColumnDropdown, setShowColumnDropdown] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Sorting
  const [sortConfig, setSortConfig] = useState({ key: 'scheduledDate', direction: 'descending' });

  // Modals
  const [selectedSelfie, setSelectedSelfie] = useState(null);

  // Column visibility
  const [columns, setColumns] = useState({
    customer: { label: 'Customer', visible: true },
    employee: { label: 'Employee', visible: true },
    scheduledOn: { label: 'Scheduled On', visible: true },
    start: { label: 'Start Details', visible: true },
    executedOn: { label: 'Executed On', visible: true },
    end: { label: 'End Details', visible: true },
    status: { label: 'Status', visible: true }
  });

  const columnRef = useRef(null);

  // Close calendars on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (startCalendarRef.current && !startCalendarRef.current.contains(e.target)) setShowStartCalendar(false);
      if (endCalendarRef.current && !endCalendarRef.current.contains(e.target)) setShowEndCalendar(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    fetchReports();
  }, [startDate, endDate]);

  const fetchReports = async () => {
    try {
      setLoading(true);
      const url = `/visits/reports?startDate=${startDate}&endDate=${endDate}`;
      const res = await api.get(url);
      setReports(res.data.data);
      setCurrentPage(1);
    } catch (err) {
      toast.error('Failed to load visit reports');
    } finally {
      setLoading(false);
    }
  };

  // Export handlers
  const handleExport = async (format) => {
    try {
      let url = `/visits/reports?startDate=${startDate}&endDate=${endDate}&exportFormat=${format}`;
      if (selectedCustomerId) url += `&customerId=${selectedCustomerId}`;
      if (selectedEmployeeId) url += `&employeeId=${selectedEmployeeId}`;
      if (selectedStatus) url += `&status=${selectedStatus}`;

      const response = await api.get(url, { responseType: 'blob' });
      const blob = new Blob([response.data], {
        type: format === 'csv'
          ? 'text/csv;charset=utf-8;'
          : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });
      const link = document.createElement('a');
      link.href = window.URL.createObjectURL(blob);
      link.download = `customer_visit_report_${Date.now()}.${format}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success(`Exported as ${format.toUpperCase()} successfully`);
    } catch (err) {
      toast.error('Export failed');
    }
  };

  // Distance calculator helper
  const getDistance = (lat1, lon1, lat2, lon2) => {
    if (lat1 === undefined || lon1 === undefined || lat2 === undefined || lon2 === undefined || lat1 === null || lon1 === null || lat2 === null || lon2 === null) {
      return 'NaNm';
    }
    const R = 6371e3; // metres
    const phi1 = lat1 * Math.PI / 180;
    const phi2 = lat2 * Math.PI / 180;
    const deltaPhi = (lat2 - lat1) * Math.PI / 180;
    const deltaLambda = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
      Math.cos(phi1) * Math.cos(phi2) *
      Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return `${Math.round(R * c)}m`;
  };

  // Date and Time Formatter Helpers
  const formatDateDMY = (dateVal) => {
    if (!dateVal) return '—';
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return '—';
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  };

  const formatTime12 = (time24) => {
    if (!time24) return '';
    const [hours, minutes] = time24.split(':');
    let h = parseInt(hours);
    const ampm = h >= 12 ? 'pm' : 'am';
    h = h % 12 || 12;
    return `${String(h).padStart(2, '0')}:${minutes} ${ampm}`;
  };

  const formatTimeHMS = (dateVal) => {
    if (!dateVal) return '';
    const d = new Date(dateVal);
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const seconds = String(d.getSeconds()).padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
  };

  // 12-hour AM/PM time from ISO date string
  const formatTime12FromDate = (dateVal) => {
    if (!dateVal) return '';
    const d = new Date(dateVal);
    let h = d.getHours();
    const m = String(d.getMinutes()).padStart(2, '0');
    const s = String(d.getSeconds()).padStart(2, '0');
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${String(h).padStart(2, '0')}:${m}:${s} ${ampm}`;
  };

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    const tableHeaders = Object.keys(columns)
      .filter(k => columns[k].visible)
      .map(k => `<th>${columns[k].label}</th>`)
      .join('');

    const tableRows = filteredAndSortedReports.map((row, idx) => {
      let cols = '';
      if (columns.customer.visible) {
        cols += `<td><b>${row.customerName || 'N/A'}</b></td>`;
      }
      if (columns.employee.visible) {
        cols += `<td>${row.employeeName || 'N/A'}</td>`;
      }
      if (columns.scheduledOn.visible) {
        const dateStr = row.scheduledDate ? formatDateDMY(row.scheduledDate) : 'N/A';
        cols += `<td>${dateStr} ${row.scheduledTime ? formatTime12(row.scheduledTime) : ''}</td>`;
      }
      if (columns.start.visible) {
        if (row.startTime) {
          const execDate = formatDateDMY(row.startTime);
          const time = formatTime12FromDate(row.startTime);
          cols += `<td>
            <b>Executed: ${execDate}</b><br/>
            ${row.startLatitude ? row.startLatitude.toFixed(6) + ', ' + row.startLongitude.toFixed(6) : ''}<br/>
            ${row.startAddress || ''}<br/>
            <i>Time: ${time}</i><br/>
            <i>Reason: ${row.status === 'Completed' ? 'Employee has added customer visit' : 'Visit started'}</i>
          </td>`;
        } else {
          cols += `<td>—</td>`;
        }
      }
      if (columns.end.visible) {
        if (row.endTime) {
          const time = formatTime12FromDate(row.endTime);
          cols += `<td>
            ${row.endLatitude ? row.endLatitude.toFixed(6) + ', ' + row.endLongitude.toFixed(6) : ''}<br/>
            ${row.endAddress || ''}<br/>
            <i>Time: ${time}</i><br/>
            <i>Reason: ${row.reason || 'Completed'}</i>
          </td>`;
        } else {
          cols += `<td>—</td>`;
        }
      }
      if (columns.status.visible) {
        cols += `<td>${row.status || 'N/A'}</td>`;
      }
      return `<tr>${cols}</tr>`;
    }).join('');

    printWindow.document.write(`
      <html>
        <head>
          <title>Customer Visit Report</title>
          <style>
            body { font-family: sans-serif; padding: 20px; }
            h2 { text-align: center; color: #1e293b; margin-bottom: 20px; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th, td { border: 1px solid #cbd5e1; padding: 8px; text-align: left; font-size: 11px; }
            th { background-color: #f1f5f9; color: #334155; }
            tr:nth-child(even) { background-color: #f8fafc; }
          </style>
        </head>
        <body>
          <h2>Customer Visit Detailed Report</h2>
          <p style="font-size: 12px; color: #64748b; text-align: center;">Report Period: ${formatDateDMY(startDate)} to ${formatDateDMY(endDate)}</p>
          <table>
            <thead>
              <tr>${tableHeaders}</tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
          </table>
          <script>
            window.onload = function() { window.print(); window.close(); }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  // Sorting logic
  const requestSort = (key) => {
    let direction = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  };

  // Sorting / Searching filtering
  const filteredAndSortedReports = useMemo(() => {
    let result = [...reports];

    // Search filter
    if (searchQuery) {
      result = result.filter(v =>
        v.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        v.employeeName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (v.reason || '').toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Sort applying
    if (sortConfig.key) {
      result.sort((a, b) => {
        let valA = a[sortConfig.key];
        let valB = b[sortConfig.key];

        if (sortConfig.key === 'scheduledDate' || sortConfig.key === 'startTime' || sortConfig.key === 'endTime') {
          valA = valA ? new Date(valA).getTime() : 0;
          valB = valB ? new Date(valB).getTime() : 0;
        }

        if (valA < valB) return sortConfig.direction === 'ascending' ? -1 : 1;
        if (valA > valB) return sortConfig.direction === 'ascending' ? 1 : -1;
        return 0;
      });
    }

    return result;
  }, [reports, searchQuery, sortConfig]);

  // Pagination
  const totalPages = Math.ceil(filteredAndSortedReports.length / itemsPerPage);
  const paginatedData = useMemo(() => {
    return filteredAndSortedReports.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  }, [filteredAndSortedReports, currentPage, itemsPerPage]);

  const renderSortArrow = (key) => {
    if (sortConfig.key !== key) {
      return <span className="text-slate-300 ml-1 text-[9px] font-normal select-none">▲▼</span>;
    }
    return sortConfig.direction === 'ascending' ? (
      <span className="text-blue-600 ml-1 text-[9px] font-normal select-none">▲</span>
    ) : (
      <span className="text-blue-600 ml-1 text-[9px] font-normal select-none">▼</span>
    );
  };

  return (
    <>
      <div className="space-y-6 md:space-y-8 animate-fade-up">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/visits-dashboard')}
              className="w-10 h-10 rounded-xl bg-white border border-slate-200 text-slate-400 flex items-center justify-center hover:bg-slate-50 hover:text-indigo-600 transition-all shadow-sm shrink-0"
              title="Back to Dashboard"
            >
              <ChevronLeft size={20} />
            </button>
            <div>
              <h2 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight m-0">Customer Visit Reports</h2>
              <p className="text-slate-600 font-bold text-[13px] mt-2">Generate detailed check-in sheets, filters, and downloads</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
            <button
              onClick={handlePrint}
              className="flex items-center justify-center gap-2 bg-white text-slate-600 border border-slate-200 px-4 py-3 rounded-2xl font-bold text-sm hover:bg-slate-50 transition-all active:scale-95 shadow-sm"
            >
              <Printer size={18} />
              Print
            </button>

            <button
              onClick={() => handleExport('xlsx')}
              className="flex items-center justify-center gap-2 bg-white text-slate-600 border border-slate-200 px-4 py-3 rounded-2xl font-bold text-sm hover:bg-slate-50 transition-all active:scale-95 shadow-sm"
            >
              <Download size={18} />
              Excel
            </button>
          </div>
        </div>

        {/* Filters Panel */}
        <div className="bg-white border border-slate-200 p-6 rounded-[2rem] shadow-xl shadow-slate-100/50 flex flex-col sm:flex-row gap-6 max-w-xl">
          <div className="flex-1 relative" ref={startCalendarRef}>
            <label className="text-[10px] font-bold text-slate-400 tracking-wider mb-1.5 block">From Date</label>
            <div
              onClick={() => setShowStartCalendar(v => !v)}
              className="flex items-center gap-2 bg-white border border-slate-200 px-4 py-2.5 rounded-xl cursor-pointer hover:bg-slate-50 transition-all shadow-sm select-none"
            >
              <Calendar size={14} className="text-indigo-600 shrink-0" />
              <div className="flex flex-col items-start leading-none flex-1">
                <span className="text-[8px] font-bold text-slate-400">From</span>
                <span className="text-[12px] font-bold text-slate-700">
                  {new Date(startDate + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                </span>
              </div>
              <ChevronDown size={12} className={`text-slate-400 transition-transform shrink-0 ${showStartCalendar ? 'rotate-180' : ''}`} />
            </div>
            <AnimatePresence>
              {showStartCalendar && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 4 }}
                  exit={{ opacity: 0, y: 8 }}
                  className="absolute z-50 bg-white border border-slate-100 rounded-3xl shadow-2xl p-4 mt-2"
                >
                  <CalendarPicker
                    selectedDate={startDate}
                    onSelect={(date) => { setStartDate(date); setShowStartCalendar(false); }}
                    onClose={() => setShowStartCalendar(false)}
                    allowAll={true}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="flex-1 relative" ref={endCalendarRef}>
            <label className="text-[10px] font-bold text-slate-400 tracking-wider mb-1.5 block">To Date</label>
            <div
              onClick={() => setShowEndCalendar(v => !v)}
              className="flex items-center gap-2 bg-white border border-slate-200 px-4 py-2.5 rounded-xl cursor-pointer hover:bg-slate-50 transition-all shadow-sm select-none"
            >
              <Calendar size={14} className="text-emerald-600 shrink-0" />
              <div className="flex flex-col items-start leading-none flex-1">
                <span className="text-[8px] font-bold text-slate-400">To</span>
                <span className="text-[12px] font-bold text-slate-700">
                  {new Date(endDate + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                </span>
              </div>
              <ChevronDown size={12} className={`text-slate-400 transition-transform shrink-0 ${showEndCalendar ? 'rotate-180' : ''}`} />
            </div>
            <AnimatePresence>
              {showEndCalendar && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 4 }}
                  exit={{ opacity: 0, y: 8 }}
                  className="absolute z-50 bg-white border border-slate-100 rounded-3xl shadow-2xl p-4 mt-2"
                >
                  <CalendarPicker
                    selectedDate={endDate}
                    onSelect={(date) => { setEndDate(date); setShowEndCalendar(false); }}
                    onClose={() => setShowEndCalendar(false)}
                    allowAll={true}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Report Content Panel */}
        <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-xl overflow-hidden mt-8">
          <div className="overflow-x-auto">
            {loading ? (
              <div className="flex justify-center items-center py-20">
                <Loader2 className="animate-spin text-indigo-600" size={40} />
              </div>
            ) : (
              <table className="w-full text-left border-collapse border border-slate-200">
                <thead>
                  <tr className="bg-slate-50/50">
                    {columns.customer.visible && (
                      <th onClick={() => requestSort('customerName')} className="px-4 py-3 text-xs font-bold text-slate-700 border border-slate-200 cursor-pointer select-none">
                        Customer {renderSortArrow('customerName')}
                      </th>
                    )}
                    {columns.employee.visible && (
                      <th onClick={() => requestSort('employeeName')} className="px-4 py-3 text-xs font-bold text-slate-700 border border-slate-200 cursor-pointer select-none">
                        Employee {renderSortArrow('employeeName')}
                      </th>
                    )}
                    {columns.scheduledOn.visible && (
                      <th onClick={() => requestSort('scheduledDate')} className="px-4 py-3 text-xs font-bold text-slate-700 border border-slate-200 cursor-pointer select-none text-center">
                        Scheduled On {renderSortArrow('scheduledDate')}
                      </th>
                    )}
                    {columns.start.visible && (
                      <th className="px-4 py-3 text-xs font-bold text-slate-700 border border-slate-200">Start Details</th>
                    )}
                    {columns.executedOn.visible && (
                      <th onClick={() => requestSort('startTime')} className="px-4 py-3 text-xs font-bold text-slate-700 border border-slate-200 cursor-pointer select-none text-center">
                        Executed On {renderSortArrow('startTime')}
                      </th>
                    )}
                    {columns.end.visible && (
                      <th className="px-4 py-3 text-xs font-bold text-slate-700 border border-slate-200">End Details</th>
                    )}
                    {columns.status.visible && (
                      <th onClick={() => requestSort('status')} className="px-4 py-3 text-xs font-bold text-slate-700 border border-slate-200 cursor-pointer select-none text-center">
                        Status {renderSortArrow('status')}
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedData.map((visit) => {
                    const custLat = visit.customerId?.latitude;
                    const custLon = visit.customerId?.longitude;
                    const startDev = getDistance(custLat, custLon, visit.startLatitude, visit.startLongitude);
                    const endDev = getDistance(custLat, custLon, visit.endLatitude, visit.endLongitude);

                    return (
                      <tr key={visit._id} className="hover:bg-slate-50/50 transition-colors align-top">
                        {/* Customer - only name, no address */}
                        {columns.customer.visible && (
                          <td className="px-4 py-3 border border-slate-200 font-semibold text-slate-800 text-sm">
                            {visit.customerName}
                          </td>
                        )}

                        {/* Employee - blue clickable link */}
                        {columns.employee.visible && (
                          <td className="px-4 py-3 border border-slate-200">
                            <span
                              onClick={() => navigate(`/employee/${visit.employeeId?._id || visit.employeeId}`)}
                              className="text-sm font-semibold text-sky-600 hover:text-sky-700 hover:underline cursor-pointer block"
                            >
                              {visit.employeeName}
                            </span>
                          </td>
                        )}

                        {/* Scheduled On */}
                        {columns.scheduledOn.visible && (
                          <td className="px-4 py-3 text-center border border-slate-200 text-xs text-slate-600 font-medium">
                            <div>{formatDateDMY(visit.scheduledDate)}</div>
                            <div className="text-[10px] text-slate-400 mt-0.5">{formatTime12(visit.scheduledTime)}</div>
                          </td>
                        )}




                        {/* Start details — selfie (clickable preview) + executed date right side + time (12hr) + coords + address */}
                        {columns.start.visible && (
                          <td className="px-4 py-3 border border-slate-200 text-xs text-slate-700 min-w-[240px]">
                            {visit.startTime ? (
                              <div className="flex flex-col gap-2">
                                <div className="flex items-start gap-3">
                                  {/* Selfie thumbnail - click to preview */}
                                  <div className="flex flex-col items-center gap-1 shrink-0">
                                    {visit.startSelfie ? (
                                      <div
                                        className="relative w-14 h-14 rounded-xl overflow-hidden cursor-pointer group border-2 border-indigo-100 shadow-sm hover:border-indigo-400 transition-all"
                                        onClick={() => setSelectedSelfie(visit.startSelfie)}
                                        title="Click to preview selfie"
                                      >
                                        <img src={visit.startSelfie} alt="Start selfie" className="w-full h-full object-cover" />
                                        <div className="absolute inset-0 bg-indigo-900/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                          <Eye size={16} className="text-white" />
                                        </div>
                                      </div>
                                    ) : (
                                      <div className="w-14 h-14 rounded-xl bg-slate-50 flex items-center justify-center text-[9px] text-slate-400 border border-slate-200 font-bold">
                                        No Selfie
                                      </div>
                                    )}
                                  </div>

                                  {/* Location info + Executed date on the right */}
                                  <div className="flex-1 flex flex-col gap-0.5 text-left min-w-0">
                                    <div className="flex items-center justify-between gap-1 mb-1">
                                      <span className="text-[9px] font-extrabold text-indigo-500 tracking-widest">Location</span>
                                    </div>
                                    <span className="text-[10px] font-bold text-slate-700 leading-tight">
                                      {visit.startLatitude?.toFixed(5)}, {visit.startLongitude?.toFixed(5)}
                                    </span>
                                    <span className="text-[10px] text-slate-500 leading-snug line-clamp-3">
                                      {visit.startAddress || '—'}
                                    </span>
                                  </div>
                                </div>
                                {/* Start Reason */}
                                <div className="bg-indigo-50 rounded-lg px-2.5 py-1.5 border-l-2 border-indigo-300">
                                  <span className="text-[9px] font-extrabold text-indigo-500 tracking-widest block">Reason</span>
                                  <span className="text-[10.5px] text-indigo-800 font-semibold">
                                    {visit.status === 'Completed' ? 'Employee has added customer visit' : 'Visit started'}
                                  </span>
                                </div>
                              </div>
                            ) : <span className="text-slate-300 font-bold">—</span>}
                          </td>
                        )}

                        {/* Executed On — date extracted from startTime */}
                        {columns.executedOn.visible && (
                          <td className="px-4 py-3 text-center border border-slate-200 text-xs text-slate-600 font-medium align-top">
                            {visit.startTime ? (
                              <div className="flex flex-col gap-1 items-center">
                                <span className="text-[11px] text-slate-800">{formatDateDMY(visit.startTime)}</span>
                                <div className="text-[10px] text-slate-400 mt-0.5">{formatTime12(visit.startTime)}</div>
                              </div>
                            ) : <span className="text-slate-300 font-bold">—</span>}
                          </td>
                        )}

                        {/* End details — selfie (clickable preview) + time (12hr) + coords + address + completion reason */}
                        {columns.end.visible && (
                          <td className="px-4 py-3 border border-slate-200 text-xs text-slate-700 min-w-[220px]">
                            {visit.endTime ? (
                              <div className="flex flex-col gap-2">
                                <div className="flex items-start gap-3">
                                  {/* Selfie thumbnail - click to preview */}
                                  <div className="flex flex-col items-center gap-1 shrink-0">
                                    {visit.endSelfie ? (
                                      <div
                                        className="relative w-14 h-14 rounded-xl overflow-hidden cursor-pointer group border-2 border-emerald-100 shadow-sm hover:border-emerald-400 transition-all"
                                        onClick={() => setSelectedSelfie(visit.endSelfie)}
                                        title="Click to preview selfie"
                                      >
                                        <img src={visit.endSelfie} alt="End selfie" className="w-full h-full object-cover" />
                                        <div className="absolute inset-0 bg-emerald-900/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                          <Eye size={16} className="text-white" />
                                        </div>
                                      </div>
                                    ) : (
                                      <div className="w-14 h-14 rounded-xl bg-slate-50 flex items-center justify-center text-[9px] text-slate-400 border border-slate-200 font-bold">
                                        No Selfie
                                      </div>
                                    )}
                                  </div>

                                  {/* Location info */}
                                  <div className="flex-1 flex flex-col gap-0.5 text-left min-w-0">
                                    <span className="text-[9px] font-extrabold text-emerald-500 tracking-widest">Location</span>
                                    <span className="text-[10px] font-bold text-slate-700 leading-tight">
                                      {visit.endLatitude?.toFixed(5)}, {visit.endLongitude?.toFixed(5)}
                                    </span>
                                    <span className="text-[10px] text-slate-500 leading-snug line-clamp-3">
                                      {visit.endAddress || '—'}
                                    </span>
                                  </div>
                                </div>
                                {/* Completion Reason */}
                                <div className="bg-emerald-50 rounded-lg px-2.5 py-1.5 border-l-2 border-emerald-300">
                                  <span className="text-[9px] font-extrabold text-emerald-600 tracking-widest block">Completion Reason</span>
                                  <span className="text-[10.5px] text-emerald-900 font-semibold">
                                    {visit.reason || 'Completed'}
                                  </span>
                                </div>
                              </div>
                            ) : <span className="text-slate-300 font-bold">—</span>}
                          </td>
                        )}

                        {/* Status */}
                        {columns.status.visible && (
                          <td className="px-4 py-3 text-center border border-slate-200">
                            <span className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-bold border ${visit.status === 'Completed' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                              visit.status === 'In Progress' ? 'bg-amber-50 text-amber-600 border-amber-100' :
                                visit.status === 'To Do' ? 'bg-rose-50 text-rose-600 border-rose-100' :
                                  visit.status === 'Over Due' ? 'bg-red-50 text-red-600 border-red-100' :
                                    'bg-blue-50 text-blue-600 border-blue-100'
                              }`}>
                              {visit.status}
                            </span>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                  {filteredAndSortedReports.length === 0 && (
                    <tr>
                      <td colSpan="7" className="px-6 py-20 text-center font-bold text-slate-400">No visit reports found</td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>

          {/* Pagination Controls */}
          {filteredAndSortedReports.length > itemsPerPage && (
            <div className="px-8 py-5 bg-slate-50/50 border-t border-slate-100 flex flex-col md:flex-row justify-between items-center gap-4">
              <p className="text-xs font-bold text-slate-500">
                Showing <span className="text-slate-900">{(currentPage - 1) * itemsPerPage + 1}</span> to <span className="text-slate-900">{Math.min(currentPage * itemsPerPage, filteredAndSortedReports.length)}</span> of <span className="text-slate-900">{filteredAndSortedReports.length}</span> entries
              </p>
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
          )}
        </div>
      </div>

      {/* Selfie Modal Viewer */}
      <AnimatePresence>
        {selectedSelfie && (
          <div
            onClick={() => setSelectedSelfie(null)}
            className="fixed inset-0 z-[9999] bg-black/85 flex items-center justify-center p-4 cursor-pointer"
          >
            <div className="relative max-w-lg max-h-[85vh]">
              <img src={selectedSelfie} alt="Selfie Capture" className="w-full h-full object-contain rounded-2xl border border-white/10 shadow-2xl animate-scale-up" />
              <button
                onClick={() => setSelectedSelfie(null)}
                className="absolute top-4 right-4 bg-white/10 p-2.5 rounded-full text-white backdrop-blur-md hover:bg-white/20 transition-all border border-white/10"
              >
                <X size={18} />
              </button>
            </div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};

export default CustomerVisitReports;
