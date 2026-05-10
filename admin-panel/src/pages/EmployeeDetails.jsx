import { AnimatePresence, motion } from 'framer-motion';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  Briefcase,
  Calendar,
  ChevronDown,
  ChevronLeft,
  Clock,
  Download,
  FileText,
  Image as ImageIcon,
  Layers,
  Loader2,
  Phone,
  TrendingUp
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../api/axios';
import CalendarPicker from '../components/CalendarPicker';

const EmployeeDetails = () => {
  const { userId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const getTodayStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const [startDate, setStartDate] = useState(getTodayStr());
  const [endDate, setEndDate] = useState(getTodayStr());
  const startCalendarRef = useRef(null);
  const endCalendarRef = useRef(null);
  const exportRef = useRef(null);

  const [showExportOptions, setShowExportOptions] = useState(false);
  const [showStartCalendar, setShowStartCalendar] = useState(false);
  const [showEndCalendar, setShowEndCalendar] = useState(false);

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

  const formatDuration = (decimalHours) => {
    if (!decimalHours || decimalHours === 0) return '0hr 0m';
    const totalMinutes = Math.round(decimalHours * 60);
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return `${h}hr ${m}m`;
  };

  useEffect(() => {
    const fetchDetails = async () => {
      try {
        setLoading(true);
        const res = await api.get(`/reports/employee-details/${userId}?startDate=${startDate}&endDate=${endDate}`);
        setData(res.data.data);
      } catch (err) {
        toast.error('Failed to load employee details');
        navigate('/reports');
      } finally {
        setLoading(false);
      }
    };
    fetchDetails();
  }, [userId, startDate, endDate]);


  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
        <Loader2 className="animate-spin text-indigo-600" size={40} />
        <p className="text-sm font-bold text-slate-400">Loading profile data...</p>
      </div>
    );
  }

  if (!data) return null;

  const { employee, summary, attendanceDetails: rawDetails } = data;
  const attendanceDetails = rawDetails.filter(log => log.status !== 'Absent');

  // Today's record for "Current" stats
  const todayRecord = attendanceDetails.find(a => {
    const d1 = new Date(a.date).toLocaleDateString();
    const d2 = new Date().toLocaleDateString();
    return d1 === d2;
  });

  const SummaryCard = ({ label, value, colorClass = "text-slate-800" }) => (
    <div className="space-y-0.5">
      <p className="text-[10px] font-bold text-slate-400 leading-tight">{label}</p>
      <p className={`text-xs font-bold ${colorClass}`}>{value}</p>
    </div>
  );

  const handleExportCSV = () => {
    const headers = ["Date", "Punch In Time", "Punch In Location", "Punch Out Time", "Punch Out Location", "Logged Hours", "Distance (KM)"];
    const rows = attendanceDetails.map(log => [
      new Date(log.date).toLocaleDateString(),
      log.punchIn?.time ? new Date(log.punchIn.time).toLocaleTimeString() : '--',
      log.punchIn?.location?.address || 'NA',
      log.punchOut?.time ? new Date(log.punchOut.time).toLocaleTimeString() : '--',
      log.punchOut?.location?.address || 'NA',
      log.loggedHours?.toFixed(2) || '0',
      (log.totalDistance || 0).toFixed(2)
    ]);

    const csvContent = "data:text/csv;charset=utf-8,"
      + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${employee.name}_Attendance_Report.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportPDF = () => {
    const doc = new jsPDF();

    // Add Header
    doc.setFontSize(20);
    doc.setTextColor(79, 70, 229); // Indigo-600
    doc.text('Attendance Report', 14, 22);

    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139); // Slate-500
    doc.text(`Employee: ${employee.name}`, 14, 30);
    doc.text(`Department: ${employee.department}`, 14, 35);
    doc.text(`Period: ${startDate} to ${endDate}`, 14, 40);
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 45);

    // Summary Section
    doc.setDrawColor(241, 245, 249); // Slate-100
    doc.line(14, 50, 196, 50);

    doc.setFontSize(12);
    doc.setTextColor(30, 41, 59); // Slate-800
    doc.text('Performance Summary', 14, 60);

    doc.setFontSize(9);
    doc.text(`Working Days: ${summary.workingDays ?? summary.presentDays ?? 0}`, 14, 70);
    doc.text(`Present Days: ${summary.presentDays ?? 0}`, 60, 70);
    doc.text(`Absent Days: ${summary.absentDays ?? 0}`, 106, 70);
    doc.text(`Leave Count: ${summary.leaveDays ?? 0}`, 152, 70);

    doc.text(`Total Worked: ${formatDuration(summary.totalWorkedHours)}`, 14, 78);
    doc.text(`Total Break: ${formatDuration(summary.totalBreakMinutes / 60)}`, 60, 78);
    doc.text(`Total Distance: ${(summary.totalDistanceKm || 0).toFixed(2)} km`, 106, 78);

    const headers = [["Date", "Status", "Punch In", "Punch Out", "Worked", "Distance"]];
    const data = attendanceDetails.map(log => [
      new Date(log.date).toLocaleDateString(),
      log.status,
      log.punchIn?.time ? new Date(log.punchIn.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--',
      log.punchOut?.time ? new Date(log.punchOut.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--',
      formatDuration(log.loggedHours),
      `${(log.totalDistance || 0).toFixed(2)} km`
    ]);

    autoTable(doc, {
      head: headers,
      body: data,
      startY: 85,
      theme: 'grid',
      headStyles: { fillColor: [79, 70, 229], textColor: [255, 255, 255], fontSize: 9, fontStyle: 'bold' },
      bodyStyles: { fontSize: 8, textColor: [51, 65, 85] },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { top: 20 }
    });

    doc.save(`${employee.name}_Attendance_Report.pdf`);
  };


  return (
    <div className="space-y-6 animate-fade-up">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="p-2 bg-white rounded-xl border border-slate-100 shadow-sm text-slate-400 hover:text-indigo-600 transition-all hover:scale-105"
        >
          <ChevronLeft size={18} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-slate-800 tracking-tight">Employee Details</h1>
          <p className="text-[11px] font-bold text-slate-400">View performance and history for {employee.name}</p>
        </div>
      </div>

      {/* Profile & Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
        {/* Profile Card */}
        <div className="lg:col-span-1 bg-white p-4 rounded-3xl border border-slate-100 shadow-sm relative overflow-hidden group flex flex-col">
          <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-50/50 rounded-bl-[4rem] -mr-6 -mt-6 transition-all group-hover:scale-110" />

          <div className="relative flex flex-col items-center text-center">
            <div className="w-24 h-24 rounded-full bg-slate-50 border-4 border-white shadow-lg flex items-center justify-center mb-4 overflow-hidden">
              {employee.profileImage ? (
                <img src={employee.profileImage} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="text-3xl font-bold text-indigo-600">
                  {employee.name.charAt(0)}
                </div>
              )}
            </div>

            <h2 className="text-lg font-bold text-slate-800">{employee.name}</h2>
            <div className="px-3 py-1 bg-indigo-50 text-indigo-600 rounded-full text-[10px] font-bold mt-1.5 border border-indigo-100">
              {employee.designation || 'Staff'}
            </div>

            {/* Dynamic Status Indicator */}
            <div className="mt-3 flex items-center gap-2">
              {employee.isOnline ? (
                <div className="flex items-center gap-2 px-3 py-0.5 bg-emerald-50 text-emerald-600 rounded-full border border-emerald-100">
                  <div className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-[10px] font-bold tracking-tight">Online</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 px-3 py-0.5 bg-slate-50 text-slate-400 rounded-full border border-slate-100">
                  <div className="w-1 h-1 rounded-full bg-slate-300" />
                  <span className="text-[10px] font-bold tracking-tight">Offline</span>
                </div>
              )}
            </div>

            <div className="mt-4 w-full space-y-2">
              <div className="flex items-center gap-3 p-2.5 bg-slate-50/50 rounded-xl border border-slate-100/50">
                <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center text-indigo-600 shadow-sm">
                  <Phone size={14} />
                </div>
                <div className="text-left">
                  <p className="text-[9px] font-bold text-slate-400">Mobile No</p>
                  <p className="text-xs font-bold text-slate-700">{employee.mobile}</p>
                </div>
              </div>

              <div className="flex items-center gap-3 p-2.5 bg-slate-50/50 rounded-xl border border-slate-100/50">
                <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center text-emerald-600 shadow-sm">
                  <Briefcase size={14} />
                </div>
                <div className="text-left">
                  <p className="text-[9px] font-bold text-slate-400">Department</p>
                  <p className="text-xs font-bold text-slate-700">{employee.department}</p>
                </div>
              </div>

              <div className="flex items-center gap-3 p-2.5 bg-slate-50/50 rounded-xl border border-slate-100/50">
                <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center text-amber-600 shadow-sm">
                  <Layers size={14} />
                </div>
                <div className="text-left">
                  <p className="text-[9px] font-bold text-slate-400">Designation</p>
                  <p className="text-xs font-bold text-slate-700">{employee.designation}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Stats Summary Area */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          <div className="flex justify-end gap-3">
            {/* Start Date Picker */}
            <div className="relative" ref={startCalendarRef}>
              <div
                className="flex items-center gap-2 bg-white border border-slate-200 px-4 py-2 rounded-2xl cursor-pointer hover:bg-slate-50 transition-all shadow-sm"
                onClick={() => setShowStartCalendar(!showStartCalendar)}
              >
                <Calendar size={14} className="text-indigo-600" />
                <div className="flex flex-col items-start leading-none">
                  <span className="text-[8px] font-bold text-slate-400">From</span>
                  <span className="text-[11px] font-bold text-slate-700">
                    {new Date(startDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </span>
                </div>
                <ChevronDown size={12} className={`text-slate-400 transition-transform ${showStartCalendar ? 'rotate-180' : ''}`} />
              </div>

              <AnimatePresence>
                {showStartCalendar && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 10 }}
                    exit={{ opacity: 0, y: 10 }}
                    className="absolute top-full right-0 mt-3 z-50 bg-white border border-slate-100 rounded-3xl shadow-2xl p-4"
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

            {/* End Date Picker */}
            <div className="relative" ref={endCalendarRef}>
              <div
                className="flex items-center gap-2 bg-white border border-slate-200 px-4 py-2 rounded-2xl cursor-pointer hover:bg-slate-50 transition-all shadow-sm"
                onClick={() => setShowEndCalendar(!showEndCalendar)}
              >
                <Calendar size={14} className="text-emerald-600" />
                <div className="flex flex-col items-start leading-none">
                  <span className="text-[8px] font-bold text-slate-400">To</span>
                  <span className="text-[11px] font-bold text-slate-700">
                    {new Date(endDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </span>
                </div>
                <ChevronDown size={12} className={`text-slate-400 transition-transform ${showEndCalendar ? 'rotate-180' : ''}`} />
              </div>

              <AnimatePresence>
                {showEndCalendar && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 10 }}
                    exit={{ opacity: 0, y: 10 }}
                    className="absolute top-full right-0 mt-3 z-50 bg-white border border-slate-100 rounded-3xl shadow-2xl p-4"
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

          <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm relative flex flex-col flex-1">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <TrendingUp size={16} className="text-indigo-600" />
                Performance Summary
              </h3>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-auto">
              <SummaryCard label="Working Days" value={`${summary.workingDays ?? summary.presentDays ?? 0} days`} />
              <SummaryCard label="Leave Count" value={summary.leaveDays || 0} colorClass="text-indigo-600" />
              <SummaryCard label="Present Count" value={summary.presentDays || 0} colorClass="text-emerald-600" />
              <SummaryCard label="Absent Count" value={summary.absentDays || 0} colorClass="text-rose-500" />
              <SummaryCard label="Late & Half Day" value={(summary.lateDays || 0) + (summary.halfDayCount || 0)} colorClass="text-amber-500" />
              <SummaryCard label="Current Shift" value={employee.shift?.name || 'NA'} colorClass="text-indigo-600" />

              <SummaryCard label="Total Working HR" value={formatDuration(summary.totalWorkedHours)} colorClass="text-indigo-600" />
              <SummaryCard label="Total Break Time" value={formatDuration(summary.totalBreakMinutes / 60)} colorClass="text-rose-500" />
              <SummaryCard label="Current Working HR" value={formatDuration(todayRecord?.workingHours || 0)} colorClass="text-emerald-600" />
              <SummaryCard label="Current Break" value={formatDuration((todayRecord?.breaks?.reduce((acc, b) => acc + (b.duration || 0), 0) || 0) / 60)} colorClass="text-rose-500" />
              <SummaryCard label="Current Distance" value={`${(todayRecord?.distance || 0).toFixed(2)} km`} colorClass="text-indigo-600" />
              <SummaryCard label="Total Distance" value={`${(summary.totalDistanceKm || 0).toFixed(2)} km`} colorClass="text-indigo-600" />
            </div>


            <div className="mt-6 p-4 bg-indigo-50/30 rounded-2xl border border-indigo-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-indigo-600 shadow-sm">
                  <Calendar size={20} />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-indigo-400">Attendance status</p>
                  <p className="text-xs font-bold text-slate-700">Detailed cycle metrics available below</p>
                </div>
              </div>
              <div className="relative" ref={exportRef}>
                <button
                  onClick={() => setShowExportOptions(!showExportOptions)}
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl font-bold text-[10px] tracking-widest shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all hover:scale-105 active:scale-95"
                >
                  <Download size={14} />
                  Download Report
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
                      <button
                        onClick={() => { handleExportCSV(); setShowExportOptions(false); }}
                        className="w-full px-4 py-2.5 text-left text-[11px] font-bold text-slate-600 hover:bg-slate-50 hover:text-indigo-600 transition-colors flex items-center gap-2"
                      >
                        <Download size={14} className="text-slate-400" />
                        Export as CSV (Excel)
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
            </div>
          </div>
        </div>
      </div>

      {/* Attendance Detail Table */}
      <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-50 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <Clock size={16} className="text-indigo-600" />
            Detailed attendance history
          </h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50">
                <th rowSpan={2} className="px-6 py-4 text-[10px] font-bold text-slate-400 text-center border-r border-slate-100">Date</th>
                <th rowSpan={2} className="px-6 py-4 text-[10px] font-bold text-slate-400 text-center border-r border-slate-100">Status</th>
                <th colSpan={2} className="px-6 py-3 text-[10px] font-bold text-slate-400 text-center border-b border-r border-slate-100">Timein</th>
                <th colSpan={2} className="px-6 py-3 text-[10px] font-bold text-slate-400 text-center border-b border-r border-slate-100">Timeout</th>
                <th rowSpan={2} className="px-6 py-4 text-[10px] font-bold text-slate-400 text-center border-r border-slate-100">Break time</th>
                <th rowSpan={2} className="px-6 py-4 text-[10px] font-bold text-slate-400 text-center border-r border-slate-100">Distance (km)</th>
                <th rowSpan={2} className="px-6 py-4 text-[10px] font-bold text-slate-400 text-center">Logged hours</th>
              </tr>
              <tr className="bg-slate-50/50">
                <th className="px-6 py-3 text-[10px] font-bold text-slate-400 text-center border-r border-slate-100">Picture</th>
                <th className="px-6 py-3 text-[10px] font-bold text-slate-400 text-center border-r border-slate-100">Location</th>
                <th className="px-6 py-3 text-[10px] font-bold text-slate-400 text-center border-r border-slate-100">Picture</th>
                <th className="px-6 py-3 text-[10px] font-bold text-slate-400 text-center border-r border-slate-100">Location</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {attendanceDetails
                .slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
                .map((log, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/30 transition-colors">
                    <td className="px-8 py-6 text-center font-bold text-[11px] text-slate-700 border-r border-slate-50">
                      {new Date(log.date).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '/')}
                    </td>
                    <td className="px-6 py-4 border-r border-slate-50 text-center">
                      <span className={`px-3 py-1 rounded-full text-[10px] font-bold ${log.status === 'Present' ? 'bg-emerald-50 text-emerald-600' :
                        log.status === 'Late' ? 'bg-amber-50 text-amber-600' :
                          log.status === 'Half Day' ? 'bg-orange-50 text-orange-600' :
                            log.status === 'Absent' ? 'bg-rose-50 text-rose-600' :
                              'bg-indigo-50 text-indigo-600'
                        }`}>
                        {log.status}
                      </span>
                    </td>

                    {/* Punch In */}
                    <td className="px-6 py-4 border-r border-slate-50 text-center">
                      <div className="flex flex-col items-center gap-1">
                        {log.punchIn?.selfie ? (
                          <img src={log.punchIn.selfie} className="w-12 h-12 rounded-xl object-cover border-2 border-white shadow-sm" />
                        ) : (
                          <div className="w-12 h-12 rounded-xl bg-slate-50 flex items-center justify-center text-slate-200">
                            <ImageIcon size={20} />
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 border-r border-slate-50">
                      <div className="flex flex-col items-center gap-1">
                        <span className="text-[11px] font-bold text-slate-800">{log.punchIn?.time ? new Date(log.punchIn.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}</span>
                        <div className="text-[9px] text-slate-400 text-center max-w-[150px] line-clamp-1">{log.punchIn?.location?.address || 'Location unknown'}</div>
                        <div className={`px-2 py-0.5 rounded-full text-[8px] font-bold tracking-tighter ${log.punchIn?.isOutside ? 'bg-red-50 text-red-500' : 'bg-green-50 text-green-600'}`}>
                          {log.punchIn?.isOutside ? 'Outside' : 'Inside fenced area'}
                        </div>
                      </div>
                    </td>

                    {/* Punch Out */}
                    <td className="px-6 py-4 border-r border-slate-50 text-center">
                      <div className="flex flex-col items-center gap-1">
                        {log.punchOut?.selfie ? (
                          <img src={log.punchOut.selfie} className="w-12 h-12 rounded-xl object-cover border-2 border-white shadow-sm" />
                        ) : (
                          <div className="w-12 h-12 rounded-xl bg-slate-50 flex items-center justify-center text-slate-200">
                            <ImageIcon size={20} />
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 border-r border-slate-50">
                      <div className="flex flex-col items-center gap-1">
                        <span className="text-[11px] font-bold text-slate-800">{log.punchOut?.time ? new Date(log.punchOut.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}</span>
                        <div className="text-[9px] text-slate-400 text-center max-w-[150px] line-clamp-1">{log.punchOut?.location?.address || 'Location unknown'}</div>
                        <div className={`px-2 py-0.5 rounded-full text-[8px] font-bold tracking-tighter ${log.punchOut?.isOutside ? 'bg-red-50 text-red-500' : 'bg-green-50 text-green-600'}`}>
                          {log.punchOut?.isOutside ? 'Outside' : 'Inside fenced area'}
                        </div>
                      </div>
                    </td>

                    <td className="px-6 py-4 text-center border-r border-slate-50">
                      <span className="text-[11px] font-bold text-indigo-600">
                        {formatDuration((log.breaks?.reduce((acc, b) => acc + (b.duration || 0), 0) || 0) / 60)} ({log.breaks?.length || 0})
                      </span>
                    </td>

                    <td className="px-6 py-4 border-r border-slate-50 text-center font-bold text-[11px] text-slate-700">
                      {(log.distance || 0).toFixed(2)}
                    </td>

                    <td className="px-6 py-4 text-center font-bold text-[11px] text-slate-700">
                      <span className="text-[11px] font-bold text-emerald-600">{formatDuration(log.workingHours)}</span>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="px-8 py-6 border-t border-slate-50 flex items-center justify-between">
          <p className="text-[10px] font-bold text-slate-400 tracking-widest">
            Showing {Math.min(attendanceDetails?.length || 0, (currentPage - 1) * itemsPerPage + 1)}-{Math.min(attendanceDetails?.length || 0, currentPage * itemsPerPage)} of {attendanceDetails?.length || 0} records
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="px-4 py-2 bg-slate-50 text-slate-600 rounded-xl text-[10px] font-bold border border-slate-100 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-100 transition-all"
            >
              Previous
            </button>
            <div className="flex items-center gap-1">
              {[...Array(Math.ceil(attendanceDetails.length / itemsPerPage))].map((_, i) => (
                <button
                  key={i}
                  onClick={() => setCurrentPage(i + 1)}
                  className={`w-8 h-8 rounded-lg text-[10px] font-bold transition-all ${currentPage === i + 1 ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200' : 'bg-white text-slate-400 border border-slate-100 hover:border-slate-200'}`}
                >
                  {i + 1}
                </button>
              ))}
            </div>
            <button
              onClick={() => setCurrentPage(prev => Math.min(Math.ceil(attendanceDetails.length / itemsPerPage), prev + 1))}
              disabled={currentPage === Math.ceil(attendanceDetails.length / itemsPerPage)}
              className="px-4 py-2 bg-slate-50 text-slate-600 rounded-xl text-[10px] font-bold border border-slate-100 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-100 transition-all"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EmployeeDetails;
