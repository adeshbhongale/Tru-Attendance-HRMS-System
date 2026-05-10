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
  Search
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';
import CalendarPicker from '../components/CalendarPicker';

const Reports = () => {
  const navigate = useNavigate();
  const [reportType, setReportType] = useState('Employee Overview Sheet');
  const getTodayStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const [selectedDate, setSelectedDate] = useState(getTodayStr());
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [generatedOn, setGeneratedOn] = useState('');

  const formatDuration = (decimalHours) => {
    if (!decimalHours || decimalHours === 0) return '0hr 0m';
    const totalMinutes = Math.round(decimalHours * 60);
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return `${h}hr ${m}m`;
  };

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const fetchReport = async () => {
    try {
      setLoading(true);
      const res = await api.get(`/reports/employee-reports?type=${reportType}&date=${selectedDate}&search=${search}`);
      setData(res.data.data);
      setGeneratedOn(res.data.generatedOn);
      setCurrentPage(1); // Reset to page 1 on new data
    } catch (err) {
      toast.error('Failed to fetch report');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, [reportType, selectedDate]); // Auto-fetch when filters change

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

  const [showTypeDropdown, setShowTypeDropdown] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const typeDropdownRef = useRef(null);
  const calendarRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (typeDropdownRef.current && !typeDropdownRef.current.contains(event.target)) {
        setShowTypeDropdown(false);
      }
      if (calendarRef.current && !calendarRef.current.contains(event.target)) {
        setShowCalendar(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Pagination Logic
  const filteredData = useMemo(() => {
    return data.filter(row => {
      const matchesSearch = row.name.toLowerCase().includes(search.toLowerCase()) || row.mobile.includes(search);
      if (reportType === 'Employee Overview Sheet') return matchesSearch;
      return matchesSearch && row.status !== 'Absent';
    });
  }, [data, search, reportType]);

  const totalPages = Math.ceil(filteredData.length / itemsPerPage);
  const currentData = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredData.slice(start, start + itemsPerPage);
  }, [filteredData, currentPage]);

  const handleExportCSV = () => {
    if (filteredData.length === 0) return toast.error('No data to download');

    let headers = [];
    let rows = [];

    if (reportType === 'Employee Overview Sheet') {
      headers = ["Name", "Mobile", "Shift", "Status", "Time In", "Time Out", "Day Worked", "Career Total"];
      rows = filteredData.map(row => [
        row.name, row.mobile, row.shift, row.status,
        formatDate(row.timeIn), formatDate(row.timeOut),
        formatDuration(row.totalHoursWorked),
        formatDuration(row.careerTotalHours)
      ]);
    } else if (reportType === 'Present Timing Sheet') {
      headers = ["Name", "Mobile", "Dept", "Shift", "Time In", "Time Out", "Distance"];
      rows = filteredData.map(row => [
        row.name, row.mobile, row.department, row.shift,
        formatDate(row.timeIn), formatDate(row.timeOut),
        (row.totalDistance || 0).toFixed(2)
      ]);
    } else {
      headers = ["Name", "Mobile", "Shift", "Breaks Count", "Total Break Time", "Breaks Details"];
      rows = filteredData.map(row => [
        row.name, row.mobile, row.shift, row.breaksTaken,
        `${(row.totalBreakTime / 60).toFixed(2)}h`,
        row.breaks?.map(b => `${formatDate(b.startTime)}-${formatDate(b.endTime)}`).join(' | ')
      ]);
    }

    const csvContent = "data:text/csv;charset=utf-8,"
      + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${reportType.replace(/\s+/g, '_')}_${selectedDate}.csv`);
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
    doc.text(`Date: ${new Date(selectedDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}`, 14, 33);
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 38);

    doc.setDrawColor(241, 245, 249); // Slate-100
    doc.line(14, 42, 282, 42);

    let headers = [];
    let data = [];

    if (reportType === 'Employee Overview Sheet') {
      headers = [["Name", "Mobile", "Shift", "Status", "Time In", "Time Out", "Day Worked", "Career Total"]];
      data = filteredData.map(row => [
        row.name, row.mobile, row.shift, row.status,
        formatDate(row.timeIn), formatDate(row.timeOut),
        formatDuration(row.totalHoursWorked),
        formatDuration(row.careerTotalHours)
      ]);
    } else if (reportType === 'Present Timing Sheet') {
      headers = [["Name", "Mobile", "Department", "Shift", "Time In", "Time Out", "Distance"]];
      data = filteredData.map(row => [
        row.name, row.mobile, row.department, row.shift,
        formatDate(row.timeIn), formatDate(row.timeOut),
        `${(row.totalDistance || 0).toFixed(2)} km`
      ]);
    } else {
      headers = [["Name", "Mobile", "Shift", "Breaks Count", "Total Break Time", "Breaks Details"]];
      data = filteredData.map(row => [
        row.name, row.mobile, row.shift, row.breaksTaken,
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
        5: { cellWidth: reportType === 'Break Details Sheet' ? 80 : 'auto' }
      }
    });

    doc.save(`${reportType.replace(/ /g, '_')}_${selectedDate}.pdf`);
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
                  {['Employee Overview Sheet', 'Present Timing Sheet', 'Break Timing Sheet'].map((type) => (
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

          {/* Date Picker */}
          <div className="relative" ref={calendarRef}>
            <button
              className="flex items-center gap-4 bg-white border border-slate-200 px-6 py-3.5 rounded-2xl shadow-sm hover:bg-slate-50 transition-all min-w-[200px] cursor-pointer group"
              onClick={() => setShowCalendar(!showCalendar)}
            >
              <div className="p-2 bg-emerald-50 rounded-xl text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                <Calendar size={18} />
              </div>
              <span className="text-sm font-bold text-slate-700">
                {new Date(selectedDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
              </span>
              <ChevronDown size={16} className={`text-slate-400 ml-auto transition-transform ${showCalendar ? 'rotate-180' : ''}`} />
            </button>

            <AnimatePresence>
              {showCalendar && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 10 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="absolute top-full left-0 mt-3 z-[110] bg-white border border-slate-100 rounded-[2rem] shadow-2xl p-6"
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
                className="absolute right-0 mt-2 w-56 bg-white rounded-2xl shadow-2xl border border-slate-50 py-3 z-50 overflow-hidden"
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
        <div className="p-8 border-b border-slate-50 flex flex-col md:flex-row justify-between items-center gap-6 bg-slate-50/30">
          <div>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-3">
              <Activity size={24} className="text-indigo-600" />
              {reportType === 'Present' ? 'Overall Attendance' : reportType}
            </h2>
            <p className="text-[10px] font-bold text-slate-400 tracking-widest  mt-1">
              Generated for: {formatFullDate(selectedDate)} • Refreshed just now
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
                  <th className="px-8 py-6 text-[10px] font-bold text-slate-400 tracking-widest  border-b border-slate-50">Staff Member</th>
                  <th className="px-6 py-6 text-[10px] font-bold text-slate-400 tracking-widest  border-b border-slate-50 text-center">Mobile</th>

                  {reportType === 'Employee Overview Sheet' && (
                    <>
                      <th className="px-6 py-6 text-[10px] font-bold text-slate-400 tracking-widest  border-b border-slate-50 text-center">Shift</th>
                      <th className="px-6 py-6 text-[10px] font-bold text-slate-400 tracking-widest  border-b border-slate-50 text-center">Status</th>
                      <th className="px-6 py-6 text-[10px] font-bold text-slate-400 tracking-widest  border-b border-slate-50 text-center">Check-In</th>
                      <th className="px-6 py-6 text-[10px] font-bold text-slate-400 tracking-widest  border-b border-slate-50 text-center">Check-Out</th>
                      <th className="px-6 py-6 text-[10px] font-bold text-slate-400 tracking-widest  border-b border-slate-50 text-center">Day Worked</th>
                      <th className="px-6 py-6 text-[10px] font-bold text-indigo-600 tracking-widest  border-b border-slate-50 text-center">Career Total</th>
                    </>
                  )}

                  {reportType === 'Present Timing Sheet' && (
                    <>
                      <th className="px-6 py-6 text-[10px] font-bold text-slate-400 tracking-widest  border-b border-slate-50 text-center">Dept/Shift</th>
                      <th className="px-6 py-6 text-[10px] font-bold text-slate-400 tracking-widest  border-b border-slate-50 text-center">In Time</th>
                      <th className="px-6 py-6 text-[10px] font-bold text-slate-400 tracking-widest  border-b border-slate-50 text-center">In Selfie</th>
                      <th className="px-6 py-6 text-[10px] font-bold text-slate-400 tracking-widest  border-b border-slate-50 text-center">Out Time</th>
                      <th className="px-6 py-6 text-[10px] font-bold text-slate-400 tracking-widest  border-b border-slate-50 text-center">Out Selfie</th>
                      <th className="px-6 py-6 text-[10px] font-bold text-indigo-600 tracking-widest  border-b border-slate-50 text-center">Net Worked</th>
                    </>
                  )}

                  {reportType === 'Break Timing Sheet' && (
                    <>
                      <th className="px-6 py-6 text-[10px] font-bold text-slate-400 tracking-widest  border-b border-slate-50 text-center">Shift</th>
                      <th className="px-6 py-6 text-[10px] font-bold text-slate-400 tracking-widest  border-b border-slate-50 text-center">Sessions</th>
                      <th className="px-6 py-6 text-[10px] font-bold text-slate-400 tracking-widest  border-b border-slate-50 text-center">Break Logs</th>
                      <th className="px-6 py-6 text-[10px] font-bold text-indigo-600 tracking-widest  border-b border-slate-50 text-center">Total Time</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {currentData.map((row, idx) => (
                  <tr key={row.id} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="px-8 py-5">
                      <div className="flex items-center gap-4">
                        <div
                          onClick={() => navigate(`/employee/${row.userId}`)}
                          className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 border border-indigo-100 overflow-hidden cursor-pointer hover:scale-110 transition-transform"
                        >
                          {row.profileImage ? (
                            <img src={row.profileImage} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <span className="font-bold text-sm">{row.name.charAt(0)}</span>
                          )}
                        </div>
                        <div>
                          <p onClick={() => navigate(`/employee/${row.userId}`)} className="text-xs font-bold text-slate-900 cursor-pointer hover:text-indigo-600 transition-colors">{row.name}</p>
                          <p className="text-[10px] font-bold text-slate-400">{row.designation}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-5 text-center text-xs font-bold text-slate-500">{row.mobile}</td>

                    {reportType === 'Employee Overview Sheet' && (
                      <>
                        <td className="px-6 py-5 text-center">
                          <span className="px-3 py-1 bg-slate-50 text-slate-600 rounded-full text-[10px] font-bold tracking-widest">{row.shift}</span>
                        </td>
                        <td className="px-6 py-5 text-center">
                          <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold tracking-tight border ${
                                row.status === 'Present' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                                row.status === 'Late' ? 'bg-amber-50 text-amber-600 border-amber-100' :
                                row.status === 'Half Day' ? 'bg-orange-50 text-orange-600 border-orange-100' :
                                row.status === 'Absent' ? 'bg-rose-50 text-rose-600 border-rose-100' :
                                'bg-indigo-50 text-indigo-600 border-indigo-100'
                              }`}>
                            {row.status}
                          </span>
                        </td>
                        <td className="px-6 py-5 text-center">
                          <p className="text-[11px] font-bold text-slate-700">{formatDate(row.timeIn)}</p>
                          {true && (
                            <span className={`text-[8px] font-bold px-2 py-0.5 rounded-full mt-1 inline-block ${row.timeInOutside ? 'bg-red-50 text-red-500' : 'bg-emerald-50 text-emerald-600'}`}>
                              {row.timeInOutside ? 'Outside' : 'Inside'}
                            </span>
                          )}
                          {row.timeInLocation && (
                            <p className="text-[9px] text-slate-400 mt-1 leading-tight">{row.timeInLocation}</p>
                          )}
                        </td>
                        <td className="px-6 py-5 text-center">
                          <p className="text-[11px] font-bold text-slate-700">{!row.timeOut ? 'NA' : formatDate(row.timeOut)}</p>
                          {row.timeOut && (
                            <span className={`text-[8px] font-bold px-2 py-0.5 rounded-full mt-1 inline-block ${row.timeOutOutside ? 'bg-red-50 text-red-500' : 'bg-emerald-50 text-emerald-600'}`}>
                              {row.timeOutOutside ? 'Outside' : 'Inside'}
                            </span>
                          )}
                          {row.timeOutLocation && (
                            <p className="text-[9px] text-slate-400 mt-1 leading-tight">{row.timeOutLocation}</p>
                          )}
                        </td>
                        <td className="px-6 py-5 text-center">
                          <span className="text-xs font-bold text-emerald-600">{formatDuration(row.totalHoursWorked)}</span>
                        </td>
                        <td className="px-6 py-5 text-center">
                          <span className="text-xs font-bold text-indigo-600">{formatDuration(row.careerTotalHours)}</span>
                        </td>
                      </>
                    )}

                    {reportType === 'Present Timing Sheet' && (
                      <>
                        <td className="px-6 py-5 text-center">
                          <p className="text-xs font-bold text-slate-700">{row.department}</p>
                          <p className="text-[9px] font-bold text-slate-400 tracking-widest ">{row.shift}</p>
                        </td>
                        <td className="px-6 py-5 text-center">
                          <p className="text-xs font-bold text-slate-700">{formatDate(row.timeIn)}</p>
                          {true && (
                            <span className={`text-[8px] font-bold px-2 py-0.5 rounded-full mt-1 inline-block ${row.timeInOutside ? 'bg-red-50 text-red-500' : 'bg-emerald-50 text-emerald-600'}`}>
                              {row.timeInOutside ? 'Outside' : 'Inside'}
                            </span>
                          )}
                          {row.timeInLocation && (
                            <p className="text-[9px] text-slate-400 mt-1 leading-tight text-left max-w-[160px] mx-auto">{row.timeInLocation}</p>
                          )}
                        </td>
                        <td className="px-6 py-5 text-center">
                          {row.timeInSelfie ? (
                            <div className="relative group/img inline-block">
                              <img src={row.timeInSelfie} className="w-10 h-10 rounded-xl object-cover border-2 border-white shadow-sm transition-transform group-hover/img:scale-125" />
                              <div className="absolute inset-0 bg-black/20 opacity-0 group-hover/img:opacity-100 transition-opacity rounded-xl flex items-center justify-center">
                                <Eye size={12} className="text-white" />
                              </div>
                            </div>
                          ) : <span className="text-[10px] text-slate-300">NA</span>}
                        </td>
                        <td className="px-6 py-5 text-center">
                          <p className="text-xs font-bold text-slate-700">{!row.timeOut ? 'NA' : formatDate(row.timeOut)}</p>
                          {row.timeOutLocation && (
                            <p className="text-[9px] text-slate-400 mt-1 leading-tight text-left max-w-[160px] mx-auto">{row.timeOutLocation}</p>
                          )}
                        </td>
                        <td className="px-6 py-5 text-center">
                          {row.timeOutSelfie ? (
                            <div className="relative group/img inline-block">
                              <img src={row.timeOutSelfie} className="w-10 h-10 rounded-xl object-cover border-2 border-white shadow-sm transition-transform group-hover/img:scale-125" />
                              <div className="absolute inset-0 bg-black/20 opacity-0 group-hover/img:opacity-100 transition-opacity rounded-xl flex items-center justify-center">
                                <Eye size={12} className="text-white" />
                              </div>
                            </div>
                          ) : <span className="text-[10px] text-slate-300">NA</span>}
                        </td>
                        <td className="px-6 py-5 text-center">
                          <span className="text-xs font-bold text-indigo-600">{formatDuration(row.totalHoursWorked)}</span>
                        </td>
                      </>
                    )}

                    {reportType === 'Break Timing Sheet' && (
                      <>
                        <td className="px-6 py-5 text-center text-xs font-bold text-slate-500">{row.shift}</td>
                        <td className="px-6 py-5 text-center">
                          <span className="px-4 py-1.5 bg-slate-100 text-slate-600 rounded-2xl text-[10px] font-bold tracking-widest">{row.breaksTaken} SLOTS</span>
                        </td>
                        <td className="px-6 py-5">
                          <div className="flex flex-wrap justify-center gap-2 max-w-[200px] mx-auto">
                            {row.breaks?.slice(0, 3).map((b, i) => (
                              <div key={i} className="px-2 py-1 bg-indigo-50 border border-indigo-100 rounded-lg text-[9px] font-bold text-indigo-600">
                                {formatDate(b.startTime)}-{formatDate(b.endTime)}
                              </div>
                            ))}
                            {row.breaks?.length > 3 && <span className="text-[9px] font-bold text-slate-400">+{row.breaks.length - 3} more</span>}
                            {row.breaks?.length === 0 && <span className="text-[9px] font-bold text-slate-300 tracking-widest ">No Breaks Recorded</span>}
                          </div>
                        </td>
                        <td className="px-6 py-5 text-center">
                          <span className="text-xs font-bold text-indigo-600">{formatDuration(row.totalBreakTime / 60)}</span>
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
          <div className="px-8 py-6 bg-slate-50/50 border-t border-slate-50 flex flex-col md:flex-row justify-between items-center gap-6">
            <p className="text-[11px] font-bold text-slate-400 tracking-widest ">
              Showing <span className="text-slate-900">{(currentPage - 1) * itemsPerPage + 1}</span> to <span className="text-slate-900">{Math.min(currentPage * itemsPerPage, filteredData.length)}</span> of <span className="text-slate-900">{filteredData.length}</span> Records
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className="p-2.5 bg-white border border-slate-200 rounded-2xl text-slate-400 hover:text-indigo-600 transition-all shadow-sm disabled:opacity-50 active:scale-95"
              >
                <ChevronLeft size={20} />
              </button>

              <div className="flex items-center gap-2">
                {[...Array(totalPages)].map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setCurrentPage(i + 1)}
                    className={`w-11 h-11 rounded-2xl text-xs font-bold transition-all ${currentPage === i + 1 ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-100' : 'bg-white border border-slate-200 text-slate-500 hover:bg-slate-50'}`}
                  >
                    {i + 1}
                  </button>
                ))}
              </div>

              <button
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
                className="p-2.5 bg-white border border-slate-200 rounded-2xl text-slate-400 hover:text-indigo-600 transition-all shadow-sm disabled:opacity-50 active:scale-95"
              >
                <ChevronRight size={20} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Reports;
