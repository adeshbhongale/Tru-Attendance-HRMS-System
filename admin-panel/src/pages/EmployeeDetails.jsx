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
  Eye,
  FileText,
  Image as ImageIcon,
  Layers,
  Loader2,
  Pencil,
  Phone,
  Save,
  Shield,
  TrendingUp,
  X
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { useNavigate, useParams } from 'react-router-dom';
import api, { IMAGE_BASE_URL } from '../api/axios';
import CalendarPicker from '../components/CalendarPicker';

const getFullImageUrl = (path) => {
  if (!path) return null;
  if (path.startsWith('http') || path.startsWith('data:')) return path;
  return `${IMAGE_BASE_URL}/${path.replace(/\\/g, '/')}`;
};

// Convert a UTC Date to "HH:mm" in local/IST display
const toTimeInput = (dateVal) => {
  if (!dateVal) return '';
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return '';
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
};

const ALL_ATTENDANCE_STATUSES = ['Present', 'Late', 'Half Day', 'Absent', 'Leave', 'Leave(Half)', 'Neutral'];
const FILTER_STATUSES = ['All', ...ALL_ATTENDANCE_STATUSES];

const parse24hTo12h = (timeStr) => {
  if (!timeStr) return { hour: 12, minute: 0, ampm: 'AM' };
  const cleanStr = timeStr.replace(/[^0-9:]/g, ''); // Strip any non-digit/non-colon characters
  const [hStr, mStr] = cleanStr.split(':');
  let hour24 = parseInt(hStr, 10);
  const minute = parseInt(mStr, 10) || 0;

  if (isNaN(hour24)) return { hour: 12, minute: 0, ampm: 'AM' };

  const ampm = hour24 >= 12 ? 'PM' : 'AM';
  let hour12 = hour24 % 12;
  if (hour12 === 0) hour12 = 12;

  return { hour: hour12, minute, ampm };
};

const format12hTo24h = (hour12, minute, ampm) => {
  let hour24 = hour12 % 12;
  if (ampm === 'PM') {
    hour24 += 12;
  }
  const hStr = String(hour24).padStart(2, '0');
  const mStr = String(minute).padStart(2, '0');
  return `${hStr}:${mStr}`;
};

const CustomTimeDropdown = ({ value, options, onChange }) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    const clickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', clickOutside);
    return () => document.removeEventListener('mousedown', clickOutside);
  }, []);

  return (
    <div className="relative inline-block" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 bg-white border border-slate-200 hover:border-indigo-400 hover:bg-indigo-50/10 rounded-xl px-2 py-1 text-xs font-extrabold text-slate-750 transition-all select-none min-w-[3.5rem] justify-between shadow-sm active:scale-95"
      >
        <span>{String(value).padStart(2, '0')}</span>
        <ChevronDown size={10} className={`text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 5 }}
            className="absolute left-0 mt-1 max-h-48 overflow-y-auto w-20 bg-white border border-slate-100 rounded-xl shadow-xl py-1 z-50 text-center"
          >
            {options.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => {
                  onChange(opt);
                  setOpen(false);
                }}
                className={`w-full py-1 text-xs font-bold text-slate-650 hover:bg-indigo-50/50 hover:text-indigo-650 transition-colors ${value === opt ? 'bg-indigo-50/30 text-indigo-600 font-extrabold' : ''
                  }`}
              >
                {String(opt).padStart(2, '0')}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const TimePicker12 = ({ label, value, onChange }) => {
  const { hour, minute, ampm } = parse24hTo12h(value);

  const setHour = (h) => {
    onChange(format12hTo24h(h, minute, ampm));
  };

  const setMinute = (m) => {
    onChange(format12hTo24h(hour, m, ampm));
  };

  const setAmpm = (ap) => {
    onChange(format12hTo24h(hour, minute, ap));
  };

  return (
    <div className="space-y-1 text-left">
      <label className="text-[10px] font-bold text-slate-400 tracking-wider">{label}</label>
      <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-2xl p-2 shadow-sm">
        <Clock size={14} className="text-slate-400 ml-2" />

        {/* Custom select-less Dropdowns */}
        <CustomTimeDropdown
          value={hour}
          options={Array.from({ length: 12 }, (_, i) => i + 1)}
          onChange={setHour}
        />

        <span className="text-slate-400 font-bold">:</span>

        <CustomTimeDropdown
          value={minute}
          options={Array.from({ length: 60 }, (_, i) => i)}
          onChange={setMinute}
        />

        <div className="flex bg-slate-200/60 p-0.5 rounded-xl ml-auto border border-slate-200/30">
          {['AM', 'PM'].map((ap) => (
            <button
              key={ap}
              type="button"
              onClick={() => setAmpm(ap)}
              className={`px-3 py-1 rounded-lg text-[9px] font-extrabold transition-all active:scale-95 ${ampm === ap ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                }`}
            >
              {ap}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

const EmployeeDetails = () => {
  const { userId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedSelfie, setSelectedSelfie] = useState(null);
  const itemsPerPage = 10;

  // ── Edit Attendance Modal State ──
  const [editModal, setEditModal] = useState(null); // { log } or null
  const [editForm, setEditForm] = useState({ punchInTime: '', punchOutTime: '', status: '' });
  const [editSaving, setEditSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState('All');

  const statusFilterRef = useRef(null);
  const [showStatusFilterDropdown, setShowStatusFilterDropdown] = useState(false);

  const getTodayStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const getPast10DaysStr = () => {
    const d = new Date();
    d.setDate(d.getDate() - 10);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const [startDate, setStartDate] = useState(getPast10DaysStr());
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
      if (statusFilterRef.current && !statusFilterRef.current.contains(event.target)) {
        setShowStatusFilterDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const formatDuration = (decimalHours) => {
    if (!decimalHours || decimalHours <= 0) return '0m';
    const totalMinutes = Math.round(decimalHours * 60);
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    if (h === 0) return `${m}m`;
    if (m === 0) return `${h}hr`;
    return `${h}hr ${m}m`;
  };

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

  useEffect(() => {
    fetchDetails();
  }, [userId, startDate, endDate]);

  // ── Open edit modal for a specific log row ──
  const handleOpenEdit = (log) => {
    setEditForm({
      punchInTime: toTimeInput(log.punchIn?.time),
      punchOutTime: toTimeInput(log.punchOut?.time),
      status: log.status || ''
    });
    setEditModal({ ...log, id: log._id || log.id });
  };

  // ── Save edited attendance ──
  const handleSaveEdit = async () => {
    if (!editModal?.id) {
      toast.error('No attendance record selected');
      return;
    }
    setEditSaving(true);
    try {
      const payload = { userId };
      // Use explicit checks for undefined/null instead of truthy checks to handle empty strings correctly
      if (editForm.punchInTime !== undefined && editForm.punchInTime !== null) {
        payload.punchInTime = editForm.punchInTime;
      }
      if (editForm.punchOutTime !== undefined && editForm.punchOutTime !== null) {
        payload.punchOutTime = editForm.punchOutTime;
      }
      if (editForm.status !== undefined && editForm.status !== null) {
        payload.status = editForm.status;
      }

      // Check if only userId is in payload (no actual changes made)
      if (Object.keys(payload).length === 1) {
        toast.error('Please make at least one change before saving');
        setEditSaving(false);
        return;
      }

      const response = await api.put(`/attendance/admin-edit/${editModal.id}`, payload);
      toast.success(response?.data?.message || 'Attendance updated successfully');
      setEditModal(null);
      // Refresh data so all stats recalculate
      await fetchDetails();
    } catch (err) {
      const errorMsg = err?.response?.data?.message || err?.message || 'Failed to update attendance';
      console.error('Attendance update error:', errorMsg);
      toast.error(errorMsg);
    } finally {
      setEditSaving(false);
    }
  };

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
  const filteredDetails = rawDetails.filter(log => {
    if (statusFilter === 'All') return true;
    return log.status === statusFilter;
  });
  const attendanceDetails = filteredDetails;

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
    const headers = ["Date", "Status", "Punch In Time", "Punch In Location", "Punch Out Time", "Punch Out Location", "Worked Hours", "Distance (KM)"];

    // Summary Data for CSV
    const summaryRows = [
      ["PERFORMANCE SUMMARY"],
      ["Working Days", `${summary.workingDays ?? summary.presentDays ?? 0} days`],
      ["Total Working HR", formatDuration(summary.totalWorkedHours)],
      ["Total Break Time", formatDuration(summary.totalBreakMinutes / 60)],
      ["Total Distance", `${(summary.totalDistanceKm || 0).toFixed(2)} km`],
      ["Absent Count", summary.absentDays || 0],
      ["Leave Count", summary.leaveDays || 0],
      ["Late & Half Day", (summary.lateDays || 0) + (summary.halfDayCount || 0)],
      [],
      ["ATTENDANCE LOGS"]
    ];

    const attendanceRows = attendanceDetails.map(log => [
      new Date(log.date).toLocaleDateString('en-GB'),
      log.status,
      log.punchIn?.time ? new Date(log.punchIn.time).toLocaleTimeString() : '--',
      `"${log.punchIn?.location?.address?.replace(/"/g, '""') || 'NA'}"`,
      log.punchOut?.time ? new Date(log.punchOut.time).toLocaleTimeString() : '--',
      `"${log.punchOut?.location?.address?.replace(/"/g, '""') || 'NA'}"`,
      log.workingHours?.toFixed(2) || '0',
      (log.distance || 0).toFixed(2)
    ]);

    const csvContent = "\ufeff" + [
      headers.join(","),
      ...summaryRows.map(e => e.join(",")),
      ...attendanceRows.map(e => e.join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `${employee.name}_Attendance_Report.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportPDF = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;

    // Add Header
    doc.setFontSize(22);
    doc.setTextColor(79, 70, 229); // Indigo-600
    doc.text('Attendance Report', 14, 22);

    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139); // Slate-500
    doc.text(`Employee: ${employee.name} (${employee.designation})`, 14, 30);
    doc.text(`Department: ${employee.department}`, 14, 35);
    doc.text(`Period: ${startDate} to ${endDate}`, 14, 40);
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 45);

    // Summary Section
    doc.setDrawColor(241, 245, 249); // Slate-100
    doc.line(14, 50, pageWidth - 14, 50);

    doc.setFontSize(14);
    doc.setTextColor(30, 41, 59); // Slate-800
    doc.text('Performance Summary', 14, 62);

    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105); // Slate-600

    // Summary Grid
    const startY = 72;
    const col1 = 14;
    const col2 = 60;
    const col3 = 106;
    const col4 = 152;

    doc.text('Working Days:', col1, startY);
    doc.setFont(undefined, 'bold');
    doc.text(`${summary.workingDays ?? summary.presentDays ?? 0} days`, col1, startY + 5);
    doc.setFont(undefined, 'normal');

    doc.text('Total Work HR:', col2, startY);
    doc.setFont(undefined, 'bold');
    doc.text(formatDuration(summary.totalWorkedHours), col2, startY + 5);
    doc.setFont(undefined, 'normal');

    doc.text('Total Break:', col3, startY);
    doc.setFont(undefined, 'bold');
    doc.text(formatDuration(summary.totalBreakMinutes / 60), col3, startY + 5);
    doc.setFont(undefined, 'normal');

    doc.text('Total Dist:', col4, startY);
    doc.setFont(undefined, 'bold');
    doc.text(`${(summary.totalDistanceKm || 0).toFixed(2)} km`, col4, startY + 5);
    doc.setFont(undefined, 'normal');

    const nextY = startY + 15;
    doc.text('Visits Count:', col1, nextY);
    doc.setFont(undefined, 'bold');
    doc.text(`${summary.visitsCount || 0}`, col1, nextY + 5);
    doc.setFont(undefined, 'normal');

    doc.text('Absent Count:', col2, nextY);
    doc.setFont(undefined, 'bold');
    doc.text(`${summary.absentDays || 0}`, col2, nextY + 5);
    doc.setFont(undefined, 'normal');

    doc.text('Late & Half Day:', col3, nextY);
    doc.setFont(undefined, 'bold');
    doc.text(`${(summary.lateDays || 0) + (summary.halfDayCount || 0)}`, col3, nextY + 5);
    doc.setFont(undefined, 'normal');

    const headers = [["Date", "Status", "Punch In (Location)", "Punch Out (Location)", "Worked", "Distance"]];
    const tableData = attendanceDetails.map(log => [
      new Date(log.date).toLocaleDateString('en-GB'),
      log.status,
      log.punchIn?.time
        ? `${new Date(log.punchIn.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}\n(${log.punchIn.location?.address || 'NA'})`
        : '--',
      log.punchOut?.time
        ? `${new Date(log.punchOut.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}\n(${log.punchOut.location?.address || 'NA'})`
        : '--',
      formatDuration(log.workingHours),
      `${(log.distance || 0).toFixed(2)} km`
    ]);

    autoTable(doc, {
      head: headers,
      body: tableData,
      startY: nextY + 15,
      theme: 'grid',
      headStyles: { fillColor: [79, 70, 229], textColor: [255, 255, 255], fontSize: 9, fontStyle: 'bold' },
      bodyStyles: { fontSize: 8, textColor: [51, 65, 85], cellPadding: 3 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        2: { cellWidth: 50 }, // Punch In Location
        3: { cellWidth: 50 }  // Punch Out Location
      },
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
            <div className="relative w-20 h-20 mb-3 cursor-pointer group/profile" onClick={() => employee.profileImage && setSelectedSelfie(getFullImageUrl(employee.profileImage))}>
              <div className="w-full h-full rounded-full bg-slate-50 border-4 border-white shadow-lg flex items-center justify-center overflow-hidden transition-transform group-hover/profile:scale-105">
                {employee.profileImage ? (
                  <img src={getFullImageUrl(employee.profileImage)} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="text-2xl font-bold text-indigo-600">
                    {employee.name.charAt(0)}
                  </div>
                )}
                <div className="absolute inset-0 bg-black/0 group-hover/profile:bg-black/10 transition-colors flex items-center justify-center">
                  <Eye size={16} className="text-white opacity-0 group-hover/profile:opacity-100" />
                </div>
              </div>

              {/* Dynamic Status Indicator Overlay */}
              <div className="absolute top-0 left-0 -translate-x-1 -translate-y-1">
                {employee.isOnline ? (
                  <div className="flex items-center gap-1.5 px-2 py-0.5 bg-emerald-50 text-emerald-600 rounded-full border border-emerald-100 shadow-sm">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-[8px] font-bold tracking-tight">Online</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 px-2 py-0.5 bg-slate-50 text-slate-400 rounded-full border border-slate-100 shadow-sm">
                    <div className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                    <span className="text-[8px] font-bold tracking-tight">Offline</span>
                  </div>
                )}
              </div>
            </div>

            <h2 className="text-base font-bold text-slate-800 leading-none">{employee.name}</h2>
            <p className="text-[9px] font-bold text-slate-600 mt-1">{employee.email}</p>

            <div className="mt-3 w-full space-y-1.5">
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

              {employee.roleCode && (
                <div className="flex items-center gap-3 p-2.5 bg-violet-50/50 rounded-xl border border-violet-100/50">
                  <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center text-violet-600 shadow-sm">
                    <Shield size={14} />
                  </div>
                  <div className="text-left">
                    <p className="text-[9px] font-bold text-violet-400">Role Code</p>
                    <p className="text-xs font-bold text-violet-700 tracking-wider">{employee.roleCode}</p>
                  </div>
                </div>
              )}
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

          <div className="bg-white p-4 rounded-3xl border border-slate-100 shadow-sm relative flex flex-col flex-1">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <TrendingUp size={16} className="text-indigo-600" />
                Performance Summary
              </h3>
            </div>

            <div className="grid grid-cols-4 gap-y-4 gap-x-4 mb-auto">
              {/* Row 1: Working Days, Total Working Hr, Total Break Time, Total Distance */}
              <SummaryCard label="Working Days" value={`${summary.workingDays ?? summary.presentDays ?? 0} days`} />
              <SummaryCard label="Total Working HR" value={formatDuration(summary.totalWorkedHours)} colorClass="text-indigo-600" />
              <SummaryCard label="Total Break Time" value={formatDuration(summary.totalBreakMinutes / 60)} colorClass="text-rose-500" />
              <SummaryCard label="Total Distance" value={`${(summary.totalDistanceKm || 0).toFixed(2)} km`} colorClass="text-indigo-600" />

              {/* Row 2: Visits Count, Current Working Hr, Current Break Time, Current Distance */}
              <SummaryCard label="Visits Count" value={summary.visitsCount || 0} colorClass="text-indigo-600" />
              <SummaryCard label="Current Working HR" value={formatDuration(todayRecord?.workingHours || 0)} colorClass="text-emerald-600" />
              <SummaryCard label="Current Break" value={formatDuration((todayRecord?.breaks?.reduce((acc, b) => acc + (b.duration || 0), 0) || 0) / 60)} colorClass="text-rose-500" />
              <SummaryCard label="Current Distance" value={`${(todayRecord?.distance || 0).toFixed(2)} km`} colorClass="text-indigo-600" />

              {/* Row 3: Late Days, Half Day, Absent, Leave */}
              <SummaryCard label="Late Days" value={summary.lateDays || 0} colorClass="text-amber-600" />
              <SummaryCard label="Half Day Count" value={summary.halfDayCount || 0} colorClass="text-orange-600" />
              <SummaryCard label="Absent Days" value={`${summary.absentDays || 0} days`} colorClass="text-rose-600" />

              <SummaryCard label="Leave Days" value={`${summary.leaveDays || 0} days`} colorClass="text-indigo-600" />
            </div>


            <div className="mt-4 p-3 bg-indigo-50/30 rounded-2xl border border-indigo-100 flex items-center justify-between">
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
                  className="flex items-center gap-2 px-6 h-12 bg-indigo-600 text-white rounded-2xl font-bold text-[10px] tracking-widest shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all hover:scale-105 active:scale-95"
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
          <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 border border-amber-100 rounded-xl">
            <Pencil size={12} className="text-amber-600" />
            <span className="text-[10px] font-bold text-amber-700">Click ✏️ on any row to edit attendance</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50">
                <th rowSpan={2} className="px-5 py-4 text-[12px] font-bold text-slate-800 text-center border border-slate-200">Date</th>
                <th rowSpan={2} className="w-32 px-2 py-3 text-[12px] font-bold text-slate-800 text-center border border-slate-200 relative select-none" ref={statusFilterRef}>
                  <div className="flex flex-col items-center gap-1">
                    <span>Status</span>
                    <button
                      type="button"
                      onClick={() => setShowStatusFilterDropdown(!showStatusFilterDropdown)}
                      className="flex items-center gap-1 text-[10px] font-extrabold text-indigo-600 bg-indigo-50/50 border border-indigo-150 rounded-lg px-2.5 py-1.5 hover:bg-indigo-100/50 hover:text-indigo-755 transition-all select-none shadow-sm active:scale-95"
                    >
                      <span>{statusFilter}</span>
                      <ChevronDown size={10} className={`text-indigo-400 transition-transform ${showStatusFilterDropdown ? 'rotate-180' : ''}`} />
                    </button>

                    {/* Floating Dropdown Card */}
                    <AnimatePresence>
                      {showStatusFilterDropdown && (
                        <motion.div
                          initial={{ opacity: 0, y: 5 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 5 }}
                          className="absolute left-1/2 -translate-x-1/2 mt-1 w-36 bg-white border border-slate-100 rounded-2xl shadow-xl py-1.5 z-50 text-left overflow-hidden"
                        >
                          {FILTER_STATUSES.map(status => (
                            <button
                              key={status}
                              type="button"
                              onClick={() => {
                                setStatusFilter(status);
                                setShowStatusFilterDropdown(false);
                                setCurrentPage(1);
                              }}
                              className={`w-full px-3 py-2 text-[10px] font-bold text-slate-650 hover:bg-indigo-50/50 hover:text-indigo-650 transition-colors flex items-center justify-between ${statusFilter === status ? 'bg-indigo-50/30 text-indigo-600 font-extrabold' : ''
                                }`}
                            >
                              <span>{status}</span>
                              {statusFilter === status && <div className="w-1.5 h-1.5 rounded-full bg-indigo-600" />}
                            </button>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </th>
                <th colSpan={2} className="px-5 py-3 text-[12px] font-bold text-slate-800 text-center border border-slate-200">Timein</th>
                <th colSpan={2} className="px-5 py-3 text-[12px] font-bold text-slate-800 text-center border border-slate-200">Timeout</th>
                <th rowSpan={2} className="px-5 py-4 text-[12px] font-bold text-slate-800 text-center border border-slate-200">Break time</th>
                <th rowSpan={2} className="px-5 py-4 text-[12px] font-bold text-slate-800 text-center border border-slate-200">Distance (km)</th>
                <th rowSpan={2} className="px-5 py-4 text-[12px] font-bold text-slate-800 text-center border border-slate-200">Logged hours</th>
                <th rowSpan={2} className="px-4 py-4 text-[12px] font-bold text-slate-800 text-center border border-slate-200">Edit</th>
              </tr>
              <tr className="bg-slate-50/50">
                <th className="px-5 py-3 text-[12px] font-bold text-slate-800 text-center border border-slate-200">Picture</th>
                <th className="px-5 py-3 text-[12px] font-bold text-slate-800 text-center border border-slate-200">Location</th>
                <th className="px-5 py-3 text-[12px] font-bold text-slate-800 text-center border border-slate-200">Picture</th>
                <th className="px-5 py-3 text-[12px] font-bold text-slate-800 text-center border border-slate-200">Location</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {attendanceDetails
                .slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
                .map((log, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/30 transition-colors group">
                    <td className="px-6 py-6 text-center font-bold text-[11px] text-slate-700 border border-slate-200">
                      {new Date(log.date).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '/')}
                    </td>
                    <td className="w-28 px-1 py-3 border border-slate-200 text-center">
                      <span className={`inline-flex items-center justify-center whitespace-nowrap px-2 py-1 rounded-full text-[10px] font-bold border ${log.status === 'Present' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                        log.status === 'Late' ? 'bg-amber-50 text-amber-600 border-amber-100' :
                          log.status === 'Half Day' ? 'bg-orange-50 text-orange-600 border-orange-100' :
                            log.status === 'Absent' ? 'bg-rose-50 text-rose-600 border-rose-100' :
                              log.status === 'Neutral' ? 'bg-sky-50 text-sky-600 border-sky-100' :
                                log.status === 'Holiday' ? 'bg-blue-50 text-blue-600 border-blue-100' :
                                  log.status === 'Leave' || log.status === 'Leave(Half)' ? 'bg-purple-50 text-purple-600 border-purple-100' :
                                    'bg-indigo-50 text-indigo-600 border-indigo-100'
                        }`}>
                        {log.status}
                      </span>
                    </td>

                    {/* Punch In */}
                    <td className="px-6 py-4 border border-slate-200 text-center">
                      <div className="flex flex-col items-center gap-1">
                        {log.punchIn?.selfie ? (
                          <div className="relative group/img inline-block cursor-pointer" onClick={() => setSelectedSelfie(getFullImageUrl(log.punchIn.selfie))}>
                            <img src={getFullImageUrl(log.punchIn.selfie)} className="w-12 h-12 rounded-xl object-cover border-2 border-white shadow-sm" />
                            <div className="absolute inset-0 bg-black/20 opacity-0 group-hover/img:opacity-100 transition-opacity rounded-xl flex items-center justify-center">
                              <Eye size={12} className="text-white" />
                            </div>
                          </div>
                        ) : (
                          <div className="w-12 h-12 rounded-xl bg-slate-50 flex items-center justify-center text-slate-200">
                            <ImageIcon size={20} />
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 border border-slate-200">
                      <div className="flex flex-col items-center gap-1">
                        <span className="text-[11px] font-bold text-slate-800">{log.punchIn?.time ? new Date(log.punchIn.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}</span>
                        <div className="text-[9px] text-slate-400 text-center max-w-[150px] break-words">{log.punchIn?.location?.address || 'NA'}</div>
                        <div className={`px-2 py-0.5 rounded-full text-[8px] font-bold tracking-tighter ${log.punchIn?.isOutside ? 'bg-red-50 text-red-500' : 'bg-green-50 text-green-600'}`}>
                          {log.punchIn?.isOutside ? 'Outside fenced area' : 'Inside fenced area' || 'NA'}
                        </div>
                      </div>
                    </td>

                    {/* Punch Out */}
                    <td className="px-6 py-4 border border-slate-200 text-center">
                      <div className="flex flex-col items-center gap-1">
                        {log.punchOut?.selfie ? (
                          <div className="relative group/img inline-block cursor-pointer" onClick={() => setSelectedSelfie(getFullImageUrl(log.punchOut.selfie))}>
                            <img src={getFullImageUrl(log.punchOut.selfie)} className="w-12 h-12 rounded-xl object-cover border-2 border-white shadow-sm" />
                            <div className="absolute inset-0 bg-black/20 opacity-0 group-hover/img:opacity-100 transition-opacity rounded-xl flex items-center justify-center">
                              <Eye size={12} className="text-white" />
                            </div>
                          </div>
                        ) : (
                          <div className="w-12 h-12 rounded-xl bg-slate-50 flex items-center justify-center text-slate-200">
                            <ImageIcon size={20} />
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 border border-slate-200">
                      <div className="flex flex-col items-center gap-1">
                        <span className="text-[11px] font-bold text-slate-800">{log.punchOut?.time ? new Date(log.punchOut.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}</span>
                        <div className="text-[9px] text-slate-400 text-center max-w-[150px] break-words">{log.punchOut?.location?.address || 'NA'}</div>
                        <div className={`px-2 py-0.5 rounded-full text-[8px] font-bold tracking-tighter ${log.punchOut?.isOutside ? 'bg-red-50 text-red-500' : 'bg-green-50 text-green-600'}`}>
                          {log.punchOut?.isOutside ? 'Outside fenced area' : 'Inside fenced area' || ' '}
                        </div>
                      </div>
                    </td>

                    <td className="px-6 py-4 text-center border border-slate-200">
                      <span className="text-[11px] font-bold text-indigo-600">
                        {formatDuration((log.totalBreakTime || log.breaks?.reduce((acc, b) => acc + (b.duration || 0), 0) || 0) / 60)} ({log.breaks?.length || 0})
                      </span>
                    </td>

                    <td className="px-6 py-4 border border-slate-200 text-center font-bold text-[11px] text-slate-700">
                      {(log.distance || 0).toFixed(2)}
                    </td>

                    <td className="px-6 py-4 text-center border border-slate-200 font-bold text-[11px] text-slate-700">
                      <span className="text-[11px] font-bold text-emerald-600">{formatDuration(log.workingHours)}</span>
                    </td>

                    {/* Edit Button — only shown for records with an attendanceId */}
                    <td className="px-4 py-4 text-center border border-slate-200">
                      {log.id ? (
                        <button
                          onClick={() => handleOpenEdit(log)}
                          title="Edit attendance"
                          className="w-8 h-8 flex items-center justify-center mx-auto rounded-xl bg-indigo-50 hover:bg-indigo-600 text-indigo-500 hover:text-white transition-all hover:scale-110 active:scale-95 shadow-sm"
                        >
                          <Pencil size={13} />
                        </button>
                      ) : (
                        <span className="text-[9px] text-slate-300 font-bold">—</span>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="px-8 py-6 border border-slate-200 flex items-center justify-between">
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

      {/* ─── Edit Attendance Modal ─── */}
      <AnimatePresence>
        {editModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => !editSaving && setEditModal(null)}
            className="fixed inset-0 z-[300] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.92, opacity: 0, y: 20 }}
              transition={{ type: 'spring', stiffness: 300, damping: 28 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md bg-white rounded-[2rem] shadow-2xl overflow-hidden"
            >
              {/* Modal Header */}
              <div className="px-6 pt-6 pb-4 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600">
                    <Pencil size={18} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-800">Edit Attendance</h3>
                    <p className="text-[10px] font-bold text-slate-400 mt-0.5">
                      {new Date(editModal.date).toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => !editSaving && setEditModal(null)}
                  className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 transition-all"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Modal Body */}
              <div className="px-6 py-5 space-y-5">

                {/* Info banner */}
                <div className="p-3 bg-amber-50 border border-amber-100 rounded-2xl flex gap-3 items-start">
                  <div className="w-5 h-5 rounded-full bg-amber-400 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">!</div>
                  <p className="text-[11px] font-bold text-amber-700 leading-relaxed">
                    All changes are saved directly to the database and will be reflected immediately across all reports, stats, and dashboards.
                  </p>
                </div>

                {/* Punch-In Time */}
                <div className="space-y-1">
                  <TimePicker12
                    label="Punch In Time"
                    value={editForm.punchInTime}
                    onChange={(val) => setEditForm(prev => ({ ...prev, punchInTime: val }))}
                  />
                  <div className="flex justify-between items-center px-1">
                    <p className="text-[9px] text-slate-400 font-bold">Adjust starting time</p>
                    {editForm.punchInTime && (
                      <button
                        onClick={() => setEditForm(prev => ({ ...prev, punchInTime: '' }))}
                        className="text-[9px] font-bold text-rose-500 hover:underline"
                      >
                        Clear Time
                      </button>
                    )}
                  </div>
                </div>

                {/* Punch-Out Time */}
                <div className="space-y-1">
                  <TimePicker12
                    label="Punch Out Time"
                    value={editForm.punchOutTime}
                    onChange={(val) => setEditForm(prev => ({ ...prev, punchOutTime: val }))}
                  />
                  <div className="flex justify-between items-center px-1">
                    <p className="text-[9px] text-slate-400 font-bold">Adjust ending time</p>
                    {editForm.punchOutTime && (
                      <button
                        onClick={() => setEditForm(prev => ({ ...prev, punchOutTime: '' }))}
                        className="text-[9px] font-bold text-rose-500 hover:underline"
                      >
                        Clear Time
                      </button>
                    )}
                  </div>
                </div>

                {/* Status Override */}
                <div className="space-y-2">
                  <label className="text-[11px] font-bold text-slate-500 tracking-widest">Attendance Status</label>
                  <div className="grid grid-cols-3 gap-2">
                    {ALL_ATTENDANCE_STATUSES.map(s => (
                      <button
                        key={s}
                        onClick={() => setEditForm(prev => ({ ...prev, status: prev.status === s ? '' : s }))}
                        className={`px-2 py-2 rounded-xl text-[10px] font-extrabold border transition-all ${editForm.status === s
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                          : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-slate-350 hover:bg-slate-100'
                          }`}
                      >
                        {s
                          .replace('Leave(Half)', 'Leave(H)')
                        }
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] text-slate-400 font-medium ml-1">
                    {editForm.status
                      ? `Override: "${editForm.status}" (click again to clear override)`
                      : 'Not set — system will auto-calculate status'}
                  </p>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="px-6 pb-6 flex gap-3">
                <button
                  onClick={() => !editSaving && setEditModal(null)}
                  disabled={editSaving}
                  className="flex-1 px-4 py-3 bg-slate-100 text-slate-600 rounded-2xl font-bold text-sm hover:bg-slate-200 transition-all disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveEdit}
                  disabled={editSaving}
                  className="flex-1 px-4 py-3 bg-indigo-600 text-white rounded-2xl font-bold text-sm hover:bg-indigo-700 transition-all hover:scale-105 active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-indigo-200"
                >
                  {editSaving ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save size={16} />
                      Save Changes
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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

export default EmployeeDetails;
