import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  ChevronDown,
  Clock,
  Edit2,
  Info,
  Loader2,
  Save,
  Search,
  Timer,
  Trash2,
  Users,
  X
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import api, { IMAGE_BASE_URL } from '../api/axios';
import CalendarPicker from '../components/CalendarPicker';

const getFullImageUrl = (path) => {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  return `${IMAGE_BASE_URL}/${path.replace(/\\/g, '/')}`;
};

const Shifts = () => {
  const navigate = useNavigate();
  const [shifts, setShifts] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingShift, setEditingShift] = useState(null);
  const [saving, setSaving] = useState(false);
  const [confirmData, setConfirmData] = useState({ show: false, type: '', action: null, message: '' });

  const [formData, setFormData] = useState({
    name: '',
    startTime: '00:00',
    endTime: '00:00',
    gracePeriod: 0,
    halfDayAfter: '00:00',
    workingHours: 0,
    weeklyOff: ['Sunday'],
    status: 'active',
    lateRules: '',
    halfDayRules: ''
  });

  const [assignModal, setAssignModal] = useState({ show: false, shift: null });
  const [assignData, setAssignData] = useState({ selectedEmployees: [] });
  const [assignSearch, setAssignSearch] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [filterStatus, setFilterStatus] = useState('All');
  const [filterShift, setFilterShift] = useState('All');
  const [overviewSearch, setOverviewSearch] = useState('');
  const [showCalendar, setShowCalendar] = useState(false);
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const [showShiftDropdown, setShowShiftDropdown] = useState(false);
  const [activeModalDropdown, setActiveModalDropdown] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const calendarRef = useRef(null);
  const statusDropdownRef = useRef(null);
  const shiftDropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (calendarRef.current && !calendarRef.current.contains(event.target)) {
        setShowCalendar(false);
      }
      if (statusDropdownRef.current && !statusDropdownRef.current.contains(event.target)) {
        setShowStatusDropdown(false);
      }
      if (shiftDropdownRef.current && !shiftDropdownRef.current.contains(event.target)) {
        setShowShiftDropdown(false);
      }
      // Close modal dropdown if clicked outside
      if (activeModalDropdown && !event.target.closest('.custom-dropdown-container')) {
        setActiveModalDropdown(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [shiftsRes, empRes, attRes] = await Promise.all([
        api.get('/shifts'),
        api.get('/employees'),
        api.get('/attendance', { params: { date: selectedDate } })
      ]);
      setShifts(shiftsRes.data.data);
      setEmployees(empRes.data.data);
      setAttendance(attRes.data.data);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load shifts and employees');
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData();
  }, [selectedDate, fetchData]);

  useEffect(() => {
    setCurrentPage(1);
  }, [filterStatus, filterShift, overviewSearch, selectedDate]);

  const filteredAttendance = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    const isTodaySelected = selectedDate === todayStr;

    return attendance
      .map(att => {
        let status = att.status;
        if (status === 'Not Punched In') {
          status = 'Neutral';
        } else if (status === 'On Leave') {
          status = 'Leave';
        } else if (status === 'Absent' && !att.punchIn?.time && isTodaySelected) {
          status = 'Neutral';
        }
        return { ...att, status };
      })
      .filter(att => filterStatus === 'All' || att.status === filterStatus)
      .filter(att => filterShift === 'All' || (typeof att.user?.shift === 'string' ? att.user.shift === filterShift : att.user?.shift?._id === filterShift))
      .filter(att => !overviewSearch || (att.user?.name || '').toLowerCase().includes(overviewSearch.toLowerCase()))
      .sort((a, b) => {
        const getOrder = (status) => {
          if (status === 'Absent') return 4;
          if (status === 'Neutral') return 3;
          if (status === 'Leave') return 2;
          return 1; // Present, Late, Half Day
        };
        const orderA = getOrder(a.status);
        const orderB = getOrder(b.status);
        if (orderA !== orderB) return orderA - orderB;
        return new Date(b.punchIn?.time || 0) - new Date(a.punchIn?.time || 0);
      });
  }, [attendance, filterStatus, filterShift, overviewSearch, selectedDate]);

  const paginatedAttendance = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredAttendance.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredAttendance, currentPage]);

  const totalPages = Math.ceil(filteredAttendance.length / itemsPerPage);

  const employeesMap = useMemo(() => {
    const map = {};
    employees.forEach(e => map[e._id] = e);
    return map;
  }, [employees]);

  const employeesByShift = useMemo(() => {
    const map = {};
    shifts.forEach(s => {
      if (s && s._id) map[s._id] = [];
    });
    employees.forEach(emp => {
      if (!emp) return;
      const sId = typeof emp.shift === 'string' ? emp.shift : emp.shift?._id;
      if (sId) {
        if (!map[sId]) map[sId] = [];
        map[sId].push(emp);
      }
    });
    return map;
  }, [shifts, employees]);

  const getEmployeesByShift = (shiftId) => {
    return employeesByShift[shiftId] || [];
  };

  const to12Hour = (time24) => {
    if (!time24) return '--:--';
    const [hours, minutes] = time24.split(':');
    let h = parseInt(hours);
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${h}:${minutes} ${ampm}`;
  };

  const handleOpenModal = (shift = null) => {
    if (shift) {
      setEditingShift(shift);
      setFormData({
        name: shift.name,
        startTime: shift.startTime,
        endTime: shift.endTime,
        gracePeriod: shift.gracePeriod,
        halfDayAfter: shift.halfDayAfter || '00:00',
        workingHours: shift.workingHours || 0,
        weeklyOff: shift.weeklyOff || ['Sunday'],
        status: shift.status || 'active',
        lateRules: shift.lateRules || '',
        halfDayRules: shift.halfDayRules || ''
      });
    } else {
      setEditingShift(null);
      setFormData({
        name: '',
        startTime: '00:00',
        endTime: '00:00',
        gracePeriod: 0,
        halfDayAfter: '00:00',
        workingHours: 0,
        weeklyOff: ['Sunday'],
        status: 'active',
        lateRules: '',
        halfDayRules: ''
      });
    }
    setShowModal(true);
  };

  const calculateEndTime = (start, hours) => {
    if (!start || hours === undefined || hours === null) return '';
    const [h, m] = start.split(':').map(Number);
    const hoursToAdd = parseFloat(hours) || 0;
    const totalMinutes = h * 60 + m + hoursToAdd * 60;
    const endH = Math.floor(totalMinutes / 60) % 24;
    const endM = Math.round(totalMinutes % 60);
    return `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
  };

  const requestActionConfirm = (type, action, message) => {
    setConfirmData({ show: true, type, action, message });
  };

  const executeConfirmedAction = async () => {
    const { action } = confirmData;
    setConfirmData({ ...confirmData, show: false });
    if (action) await action();
  };

  const handleSaveSubmit = (e) => {
    e.preventDefault();
    requestActionConfirm(
      'save',
      async () => {
        try {
          setSaving(true);
          if (editingShift) {
            await api.put(`/shifts/${editingShift._id}`, formData);
            toast.success('Shift updated');
          } else {
            await api.post('/shifts', formData);
            toast.success('Shift created');
          }
          fetchData();
          setShowModal(false);
        } catch (err) {
          console.error(err);
          toast.error(err.response?.data?.message || 'Action failed');
        } finally {
          setSaving(false);
        }
      },
      `Save this shift configuration?`
    );
  };

  const handleDeleteConfirm = (id) => {
    requestActionConfirm(
      'delete',
      async () => {
        try {
          await api.delete(`/shifts/${id}`);
          toast.success('Shift deleted');
          fetchData();
        } catch (err) {
          console.error(err);
          toast.error(err.response?.data?.message || 'Failed to delete shift');
        }
      },
      'This will remove the shift. Are you sure?'
    );
  };

  const handleAssignSubmit = async () => {
    try {
      setSaving(true);
      if (!assignModal.shift?._id) {
        toast.error('No shift selected');
        return;
      }
      await api.post('/shifts/assign', {
        shiftId: assignModal.shift._id,
        userIds: assignData.selectedEmployees,
      });
      toast.success('Shift assigned successfully');
      setAssignModal({ show: false, shift: null });
      setAssignSearch('');
      fetchData();
    } catch (err) {
      console.error(err);
      toast.error('Failed to assign shift');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-96">
        <Loader2 className="animate-spin text-indigo-600" size={40} />
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6 md:space-y-8 animate-fade-up">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight m-0">Shift Setup</h2>
            <p className="text-slate-400 text-xs font-medium mt-1 tracking-widest">Active Shift Schedules</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {shifts.map((shift) => (
            <div key={shift._id} className="glass-card group flex flex-col bg-white border border-slate-100 overflow-hidden hover:shadow-xl transition-all">
              <div className="p-6 border-b border-slate-50 flex justify-between items-center bg-slate-50/30">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center font-bold text-lg shadow-sm">
                    <Clock size={20} />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-base tracking-tight flex items-center gap-2">
                      {shift.name}
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${shift.status === 'inactive' ? 'bg-rose-50 text-rose-600 border border-rose-100' : 'bg-emerald-50 text-emerald-600 border border-emerald-100'}`}>
                        {shift.status === 'inactive' ? 'Inactive' : 'Active'}
                      </span>
                    </h3>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    className="p-2.5 rounded-xl bg-white text-slate-400 hover:bg-indigo-600 hover:text-white transition-all shadow-sm"
                    onClick={() => handleOpenModal(shift)}
                    title="Edit Shift"
                  >
                    <Edit2 size={14} />
                  </button>
                  {shift.status !== 'inactive' && (
                    <button
                      className="p-2.5 rounded-xl bg-white text-slate-400 hover:bg-emerald-600 hover:text-white transition-all shadow-sm"
                      onClick={() => {
                        setAssignModal({ show: true, shift });
                        setAssignData({ selectedEmployees: [] });
                        setAssignSearch('');
                      }}
                      title="Assign Shift"
                    >
                      <Users size={14} />
                    </button>
                  )}
                  <button
                    className="p-2.5 rounded-xl bg-white text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-all shadow-sm"
                    onClick={() => handleDeleteConfirm(shift._id)}
                    title="Delete Shift"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              <div className="p-6 space-y-4">
                <div className="flex justify-between items-center py-2 border-b border-slate-50">
                  <div className="flex items-center gap-3">
                    <Timer size={14} className="text-slate-400" />
                    <span className="text-slate-500 text-[11px] font-bold tracking-tight">Work Hours</span>
                  </div>
                  <span className="font-bold text-slate-800 text-sm">{to12Hour(shift.startTime)} — {to12Hour(shift.endTime)}</span>
                </div>

                <div className="flex justify-between items-center py-2 border-b border-slate-50">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 size={14} className="text-emerald-600" />
                    <span className="text-emerald-600 text-[11px] font-bold tracking-tight">Grace Period</span>
                  </div>
                  <span className="font-bold text-emerald-600 bg-emerald-50 px-3 py-1 rounded-lg text-[10px] border border-emerald-100">
                    {shift.gracePeriod} mins
                  </span>
                </div>

                <div className="flex flex-col gap-4 py-1 border-b border-slate-50">
                  <div className="flex flex-col gap-2">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-3">
                        <Clock size={14} className="text-orange-500" />
                        <span className="text-orange-500 text-[11px] font-bold tracking-tight ">Half Day Rule</span>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className="font-bold text-slate-800 text-[10px]">Half Day After: {to12Hour(shift.halfDayAfter)}</span>
                        <span className="text-[9px] font-bold text-slate-400">Req. Hours: {shift.workingHours}h</span>
                      </div>
                    </div>
                    <p className="text-[10px] font-medium text-slate-600 leading-relaxed pl-7 bg-orange-50/30 p-2 rounded-xl border border-orange-50/50">
                      {shift.halfDayRules || "No half-day rules specified."}
                    </p>
                  </div>

                  <div className="flex flex-col gap-2 pt-1">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-3">
                        <Info size={14} className="text-red-500" />
                        <span className="text-red-500 text-[11px] font-bold tracking-tight ">Late Rules</span>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className="text-[9px] font-bold text-slate-400">Grace: {shift.gracePeriod}m</span>
                      </div>
                    </div>
                    <p className="text-[10px] font-medium text-slate-600 leading-relaxed pl-7 border-l-2 border-red-100 ml-1 bg-red-50/10 p-2 rounded-r-xl">
                      {shift.lateRules || "No late arrival rules specified."}
                    </p>
                  </div>
                </div>

                <div className="space-y-2 py-1">
                  <div className="flex items-center gap-3">
                    <Users size={14} className="text-indigo-500" />
                    <span className="text-slate-500 text-[11px] font-bold tracking-tight">Assigned Employees ({getEmployeesByShift(shift._id).length})</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {getEmployeesByShift(shift._id).length > 0 ? (
                      getEmployeesByShift(shift._id).map((emp) => (
                        <span
                          key={emp._id}
                          onClick={() => navigate(`/employee/${emp._id}`)}
                          className="text-[9px] font-bold bg-indigo-50 text-indigo-700 px-2 py-1 rounded-lg border border-indigo-100 truncate max-w-full hover:bg-indigo-600 hover:text-white transition-all cursor-pointer"
                        >
                          {emp.name}
                        </span>
                      ))
                    ) : (
                      <span className="text-[10px] text-slate-400 font-medium">No employees assigned</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
          {shifts.length === 0 && (
            <div className="col-span-full py-20 flex flex-col items-center justify-center bg-white rounded-[2.5rem] border border-slate-100 shadow-sm">
              <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-300 mb-4">
                <Clock size={32} />
              </div>
              <p className="text-slate-400 font-bold text-sm">No shifts Available.</p>
              <p className="text-slate-400 text-xs mt-2 ">Please create shifts in Shift Setup page.</p>
            </div>
          )}
        </div>

        {/* Employee Shift Overview Section */}
        <div className="mt-12 space-y-6">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 mb-8 bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm">
            <div>
              <h2 className="text-xl font-bold text-slate-900 tracking-tight">Employee Assignment Overview</h2>
              <p className="text-slate-400 text-xs font-medium mt-1">Quick view of all employees and their assigned shifts</p>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-4 w-full lg:w-auto">
              {/* Date Filter */}
              <div className="relative" ref={calendarRef}>
                <div
                  className="flex items-center gap-3 bg-slate-50 border border-slate-100 px-4 py-2.5 rounded-2xl hover:bg-white hover:border-indigo-100 transition-all cursor-pointer shadow-sm"
                  onClick={() => setShowCalendar(!showCalendar)}
                >
                  <Calendar size={14} className="text-indigo-600" />
                  <span className="text-[11px] font-bold text-slate-600">
                    {new Date(selectedDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                  <ChevronDown size={12} className={`text-slate-400 transition-transform ${showCalendar ? 'rotate-180' : ''}`} />
                </div>

                <AnimatePresence>
                  {showCalendar && (
                    <motion.div
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 10, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      className="absolute top-full left-0 mt-2 z-[110] bg-white border border-slate-200 rounded-2xl shadow-2xl p-4"
                    >
                      <CalendarPicker
                        selectedDate={selectedDate}
                        onSelect={(date) => {
                          setSelectedDate(date);
                          setShowCalendar(false);
                        }}
                        onClose={() => setShowCalendar(false)}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Search Bar */}
              <div className="relative w-full sm:w-80">
                <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search by name..."
                  value={overviewSearch}
                  onChange={(e) => setOverviewSearch(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-100 pl-10 pr-4 py-2.5 rounded-2xl text-[11px] font-bold text-slate-700 outline-none focus:bg-white focus:border-indigo-100 transition-all shadow-sm"
                />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/30">
                    <th className="px-6 py-5 text-[10px] font-extrabold text-blue-600 tracking-widest  border-b border-slate-50 text-center">Employee</th>
                    <th className="px-6 py-5 border-b border-slate-50 text-center">
                      <div className="relative flex items-center justify-center gap-2 cursor-pointer group" ref={shiftDropdownRef} onClick={() => setShowShiftDropdown(!showShiftDropdown)}>
                        <span className="text-[10px] font-extrabold text-blue-600 tracking-widest">Assigned Shift</span>
                        <ChevronDown size={12} className={`text-blue-400 transition-transform ${showShiftDropdown ? 'rotate-180' : ''}`} />
                        <AnimatePresence>
                          {showShiftDropdown && (
                            <motion.div
                              initial={{ opacity: 0, y: 10, scale: 0.95 }}
                              animate={{ opacity: 1, y: 10, scale: 1 }}
                              exit={{ opacity: 0, y: 10, scale: 0.95 }}
                              onClick={(e) => e.stopPropagation()}
                              className="absolute top-full left-1/2 -translate-x-1/2 mt-2 z-[200] bg-white border border-slate-100 rounded-2xl shadow-2xl overflow-hidden min-w-[180px] p-2 text-left"
                            >
                              <div
                                onClick={() => { setFilterShift('All'); setShowShiftDropdown(false); }}
                                className={`px-4 py-2.5 rounded-xl text-[11px] font-bold transition-all cursor-pointer mb-1 ${filterShift === 'All' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-indigo-50'}`}
                              >
                                All Shifts
                              </div>
                              {shifts.map(s => (
                                <div
                                  key={s._id}
                                  onClick={() => { setFilterShift(s._id); setShowShiftDropdown(false); }}
                                  className={`px-4 py-2.5 rounded-xl text-[11px] font-bold transition-all cursor-pointer mb-1 ${filterShift === s._id ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-indigo-50'}`}
                                >
                                  {s.name}
                                </div>
                              ))}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </th>
                    <th className="px-6 py-5 border-b border-slate-50 text-center">
                      <div className="relative flex items-center justify-center gap-2 cursor-pointer group" ref={statusDropdownRef} onClick={() => setShowStatusDropdown(!showStatusDropdown)}>
                        <span className="text-[10px] font-extrabold text-blue-600 tracking-widest">Status</span>
                        <ChevronDown size={12} className={`text-blue-400 transition-transform ${showStatusDropdown ? 'rotate-180' : ''}`} />
                        <AnimatePresence>
                          {showStatusDropdown && (
                            <motion.div
                              initial={{ opacity: 0, y: 10, scale: 0.95 }}
                              animate={{ opacity: 1, y: 10, scale: 1 }}
                              exit={{ opacity: 0, y: 10, scale: 0.95 }}
                              onClick={(e) => e.stopPropagation()}
                              className="absolute top-full left-1/2 -translate-x-1/2 mt-2 z-[200] bg-white border border-slate-100 rounded-2xl shadow-2xl overflow-hidden min-w-[160px] p-2 text-left"
                            >
                              {['All', 'Present', 'Late', 'Half Day', 'Absent', 'Neutral', 'Leave'].map(s => (
                                <div
                                  key={s}
                                  onClick={() => {
                                    setFilterStatus(s);
                                    setShowStatusDropdown(false);
                                  }}
                                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-[11px] font-bold transition-all cursor-pointer mb-1 ${filterStatus === s ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-indigo-50'}`}
                                >
                                  <div className={`w-2 h-2 rounded-full ${s === 'Present' ? 'bg-emerald-500' :
                                      s === 'Late' ? 'bg-amber-500' :
                                        s === 'Half Day' ? 'bg-orange-500' :
                                          s === 'Absent' ? 'bg-rose-500' :
                                            s === 'Neutral' ? 'bg-sky-500' :
                                              s === 'Leave' ? 'bg-purple-500' :
                                                'bg-slate-400'}`} />
                                  {s} Status
                                </div>
                              ))}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </th>
                    <th className="px-6 py-5 text-[10px] font-extrabold text-blue-600 tracking-widest  border-b border-slate-50 text-center">Punch In</th>
                    <th className="px-6 py-5 text-[10px] font-extrabold text-blue-600 tracking-widest  border-b border-slate-50 text-center">Punch Out</th>
                    <th className="px-6 py-5 text-[10px] font-extrabold text-blue-600 tracking-widest  border-b border-slate-50 text-center">Worked</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {paginatedAttendance.map((att) => {
                    const emp = att.user;
                    if (!emp) return null;
                    const status = att.status;
                    const empId = emp._id || emp;
                    const fullEmp = employeesMap[empId];
                    const profileImageUrl = getFullImageUrl(fullEmp?.profileImage || emp.profileImage);

                    // Resolve shift details if emp.shift is just an ID
                    const shiftData = typeof emp.shift === 'string'
                      ? shifts.find(s => s._id === emp.shift)
                      : (emp.shift || fullEmp?.shift);

                    return (
                      <tr key={att._id} className="hover:bg-slate-50/50 transition-colors group">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-4">
                            <div
                              onClick={() => navigate(`/employee/${emp._id}`)}
                              className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors cursor-pointer overflow-hidden border border-slate-100 shadow-sm"
                            >
                              {profileImageUrl ? (
                                <img src={profileImageUrl} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full bg-indigo-500 flex items-center justify-center text-white text-sm font-bold">
                                  {(emp.name || fullEmp?.name || '?').charAt(0)}
                                </div>
                              )}
                            </div>
                            <div>
                              <p onClick={() => navigate(`/employee/${emp._id}`)} className="text-sm text-center font-bold text-slate-900 cursor-pointer hover:text-indigo-600 transition-colors">{emp.name}</p>
                              <p className="text-[10px] font-bold text-slate-500 tracking-wider text-center">{emp.department}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <div className="flex flex-col items-center gap-1">
                            <span className="px-3 py-1 bg-indigo-50 text-indigo-600 rounded-full text-[10px] font-bold border border-indigo-100">
                              {shiftData?.name || 'No Shift'}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className={`px-3 py-1 rounded-full text-[10px] font-bold tracking-wider border ${status === 'Present' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                            status === 'Late' ? 'bg-amber-50 text-amber-600 border-amber-100' :
                              status === 'Half Day' ? 'bg-orange-50 text-orange-600 border-orange-100' :
                                status === 'Absent' ? 'bg-rose-50 text-rose-600 border-rose-100' :
                                  status === 'Neutral' ? 'bg-sky-50 text-sky-600 border-sky-100' :
                                    status === 'Leave' ? 'bg-purple-50 text-purple-600 border-purple-100' :
                                      'bg-slate-50 text-slate-400 border-slate-100'
                            }`}>
                            {status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <div className="flex flex-col items-center gap-1">
                            <p className="text-[11px] font-bold text-slate-800">
                              {att.punchIn?.time ? to12Hour(new Date(att.punchIn.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })) : 'NA'}
                            </p>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <div className="flex flex-col items-center gap-1">
                            <p className="text-[11px] font-bold text-slate-800">
                              {att.punchOut?.time ? to12Hour(new Date(att.punchOut.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })) : (!att.punchIn?.time || status === 'Absent' || status === 'Neutral' || status === 'Leave' ? 'NA' : 'Working...')}
                            </p>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <div className="flex flex-col items-center gap-1">
                            <span className="text-xs font-bold text-slate-800">{att.workingHours ? `${att.workingHours.toFixed(1)}h` : '—'}</span>
                            {att.overtime > 0 && <span className="text-[9px] font-bold text-indigo-500">+{att.overtime.toFixed(1)}h OT</span>}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex flex-col sm:flex-row justify-between items-center gap-4 px-8 py-6 border-t border-slate-100 bg-slate-50/20">
                <p className="text-[11px] font-bold text-slate-400 tracking-wider">
                  Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, filteredAttendance.length)} of {filteredAttendance.length} records
                </p>
                <div className="flex items-center gap-2">
                  <button
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                    className="px-4 py-2.5 rounded-xl border border-slate-100 bg-white text-xs font-bold text-slate-600 hover:bg-slate-50 hover:border-slate-200 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
                  >
                    Previous
                  </button>
                  <div className="flex items-center gap-1.5">
                    {Array.from({ length: totalPages }).map((_, idx) => {
                      const pageNum = idx + 1;
                      return (
                        <button
                          key={pageNum}
                          onClick={() => setCurrentPage(pageNum)}
                          className={`w-9 h-9 rounded-xl text-xs font-bold transition-all shadow-sm ${currentPage === pageNum
                              ? 'bg-indigo-600 text-white shadow-indigo-100'
                              : 'bg-white border border-slate-100 text-slate-600 hover:bg-slate-50 hover:border-slate-200'
                            }`}
                        >
                          {pageNum}
                        </button>
                      );
                    })}
                  </div>
                  <button
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                    className="px-4 py-2.5 rounded-xl border border-slate-100 bg-white text-xs font-bold text-slate-600 hover:bg-slate-50 hover:border-slate-200 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.98, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: 20 }}
              className="bg-white w-full max-w-2xl max-h-[95vh] rounded-2xl shadow-2xl overflow-y-auto flex flex-col"
            >
              <div className="bg-white px-8 py-6 border-b border-slate-100 flex justify-between items-center z-10 shrink-0 sticky top-0">
                <div>
                  <h3 className="text-xl font-bold text-slate-900 tracking-tighter m-0">
                    {editingShift ? 'Edit Shift' : 'Add New Shift'}
                  </h3>
                  <p className="text-slate-400 text-[10px] font-bold tracking-widest mt-1">
                    Configure shift details
                  </p>
                </div>
                <button
                  onClick={() => setShowModal(false)}
                  className="w-10 h-10 rounded-xl bg-slate-50 text-slate-400 flex items-center justify-center hover:bg-rose-50 hover:text-rose-500 transition-all active:scale-90"
                >
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleSaveSubmit} className="flex-1 overflow-y-auto p-8 space-y-6">
                <div className="space-y-3">
                  <label className="text-[11px] font-bold text-slate-400 tracking-widest ml-1">Shift Name</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g., Morning Shift"
                    required
                    className="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-100 focus:bg-white px-5 py-4 rounded-2xl outline-none transition-all text-sm font-bold text-slate-800"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <label className="text-[11px] font-bold text-slate-400 tracking-widest ml-1 ">Late Rules</label>
                    <textarea
                      value={formData.lateRules}
                      onChange={(e) => setFormData({ ...formData, lateRules: e.target.value })}
                      placeholder="Describe rules for late arrivals (e.g., 3 late marks = 1 leave)"
                      className="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-100 focus:bg-white px-5 py-4 rounded-2xl outline-none transition-all text-sm font-bold text-slate-800 min-h-[80px] resize-none shadow-sm"
                    />
                  </div>
                  <div className="space-y-3">
                    <label className="text-[11px] font-bold text-slate-400 tracking-widest ml-1 ">Half Day Rules</label>
                    <textarea
                      value={formData.halfDayRules}
                      onChange={(e) => setFormData({ ...formData, halfDayRules: e.target.value })}
                      placeholder="Describe rules for half days (e.g., Punch after 11:30 AM = Half Day)"
                      className="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-100 focus:bg-white px-5 py-4 rounded-2xl outline-none transition-all text-sm font-bold text-slate-800 min-h-[80px] resize-none shadow-sm"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <label className="text-[11px] font-bold text-slate-400 tracking-widest ml-1">Start Time (12h format)</label>
                    <div className="relative group">
                      <Timer size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="time"
                        value={formData.startTime}
                        onChange={(e) => {
                          const val = e.target.value;
                          setFormData(prev => ({
                            ...prev,
                            startTime: val,
                            endTime: calculateEndTime(val, prev.workingHours)
                          }));
                        }}
                        required
                        className="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-100 focus:bg-white pl-12 pr-4 py-4 rounded-2xl outline-none transition-all text-sm font-bold text-slate-800"
                      />
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-bold text-indigo-600 bg-white px-2 py-1 rounded-md shadow-sm border border-indigo-50">
                        {to12Hour(formData.startTime)}
                      </div>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <label className="text-[11px] font-bold text-slate-400 tracking-widest ml-1">End Time (12h format)</label>
                    <div className="relative group">
                      <Timer size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="time"
                        value={formData.endTime}
                        onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                        required
                        readOnly
                        className="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-100 focus:bg-white pl-12 pr-4 py-4 rounded-2xl outline-none transition-all text-sm font-bold text-slate-400 cursor-not-allowed"
                      />
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-bold text-indigo-600 bg-white px-2 py-1 rounded-md shadow-sm border border-indigo-50">
                        {to12Hour(formData.endTime)}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <label className="text-[11px] font-bold text-slate-400 tracking-widest ml-1">Half Day After (12h format)</label>
                    <div className="relative group">
                      <Timer size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="time"
                        value={formData.halfDayAfter}
                        onChange={(e) => setFormData({ ...formData, halfDayAfter: e.target.value })}
                        required
                        className="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-100 focus:bg-white pl-12 pr-4 py-4 rounded-2xl outline-none transition-all text-sm font-bold text-slate-800"
                      />
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-bold text-indigo-600 bg-white px-2 py-1 rounded-md shadow-sm border border-indigo-50">
                        {to12Hour(formData.halfDayAfter)}
                      </div>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <label className="text-[11px] font-bold text-slate-400 tracking-widest ml-1">Target Working Hours</label>
                    <input
                      type="number"
                      value={formData.workingHours}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0;
                        setFormData(prev => ({
                          ...prev,
                          workingHours: val,
                          endTime: calculateEndTime(prev.startTime, val)
                        }));
                      }}
                      required
                      className="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-100 focus:bg-white px-5 py-4 rounded-2xl outline-none transition-all text-sm font-bold text-slate-800"
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-[11px] font-bold text-slate-400 tracking-widest ml-1">Grace Period (Mins)</label>
                  <div className="relative group">
                    <CheckCircle2 size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="number"
                      value={formData.gracePeriod}
                      onChange={(e) => setFormData({ ...formData, gracePeriod: e.target.value })}
                      required
                      className="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-100 focus:bg-white pl-12 pr-4 py-4 rounded-2xl outline-none transition-all text-sm font-bold text-slate-800"
                      placeholder="e.g., 15"
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-[11px] font-bold text-slate-400 tracking-widest ml-1">Weekly Off</label>
                  <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2">
                    {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(day => (
                      <button
                        key={day}
                        type="button"
                        onClick={() => {
                          const current = [...formData.weeklyOff];
                          if (current.includes(day)) {
                            setFormData({ ...formData, weeklyOff: current.filter(d => d !== day) });
                          } else {
                            setFormData({ ...formData, weeklyOff: [...current, day] });
                          }
                        }}
                        className={`flex-1 min-w-[70px] px-3 py-3 rounded-xl text-[10px] font-bold transition-all border ${formData.weeklyOff.includes(day) ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-slate-50 text-slate-500 border-slate-100 hover:border-indigo-100'}`}
                      >
                        {day.slice(0, 3)}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-[11px] font-bold text-slate-400 tracking-widest ml-1">Status</label>
                  <select
                    value={formData.status || 'active'}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-100 focus:bg-white px-5 py-4 rounded-2xl outline-none transition-all text-sm font-bold text-slate-800"
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>

                <div className="flex gap-4 mt-8 pt-6 border-t border-slate-50">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="flex-1 bg-slate-50 text-slate-500 font-bold py-4 rounded-2xl hover:bg-slate-100 transition-all active:scale-95"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex-[2] bg-indigo-600 text-white font-bold py-4 rounded-2xl shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all active:scale-95 flex items-center justify-center gap-3 disabled:opacity-50"
                  >
                    {saving ? <Loader2 size={20} className="animate-spin" /> : <Save size={20} />}
                    {saving ? 'Saving...' : (editingShift ? 'Save Changes' : 'Add Shift')}
                  </button>
                </div>
              </form>
            </motion.div>
          </div >
        )}
      </AnimatePresence >

      <AnimatePresence>
        {confirmData.show && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 10 }}
              className="bg-white rounded-2xl p-10 w-full max-w-[400px] text-center shadow-2xl"
            >
              <div className="w-20 h-20 rounded-3xl mx-auto mb-8 flex items-center justify-center bg-indigo-50 text-indigo-600">
                <AlertCircle size={40} />
              </div>
              <h4 className="text-xl font-bold text-slate-900 mb-3 tracking-tighter">
                Confirm Action
              </h4>
              <p className="text-slate-500 text-sm font-bold leading-relaxed mb-10 px-4">
                {confirmData.message}
              </p>
              <div className="flex gap-4">
                <button
                  className="flex-1 bg-slate-50 text-slate-500 font-bold py-4 rounded-2xl hover:bg-slate-100 transition-all"
                  onClick={() => setConfirmData({ ...confirmData, show: false })}
                >
                  Cancel
                </button>
                <button
                  className="flex-1 bg-indigo-600 text-white font-bold py-4 rounded-2xl hover:bg-indigo-700 transition-all shadow-lg"
                  onClick={executeConfirmedAction}
                >
                  Confirm
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {assignModal.show && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.98, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: 20 }}
              className="bg-white w-full max-w-7xl max-h-[95vh] rounded-2xl shadow-2xl flex flex-col overflow-y-auto"
            >
              <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-white z-10 shrink-0 sticky top-0">
                <div>
                  <h3 className="text-xl font-bold text-slate-900 tracking-tighter">Assign Shift</h3>
                  <p className="text-slate-400 text-[10px] font-bold tracking-widest mt-1">Assign "{assignModal.shift?.name}" to employees</p>
                </div>
                <button onClick={() => setAssignModal({ show: false, shift: null })} className="w-10 h-10 rounded-xl bg-slate-50 text-slate-400 flex items-center justify-center hover:bg-rose-50 hover:text-rose-500 transition-all">
                  <X size={20} />
                </button>
              </div>

              <div className="p-8 overflow-y-auto space-y-6">
                <div className="space-y-4">
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Search employee by name..."
                      value={assignSearch}
                      onChange={(e) => setAssignSearch(e.target.value)}
                      className="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-100 focus:bg-white px-5 py-3 rounded-2xl outline-none transition-all text-sm font-bold text-slate-800"
                    />
                  </div>

                  <div className="space-y-3">
                    <label className="text-[11px] font-bold text-slate-400 tracking-widest ml-1 ">Select Employees</label>
                    <div className="grid grid-cols-1 gap-2 max-h-[350px] overflow-y-auto p-1 custom-scrollbar">
                      {employees
                        .filter(emp => (emp.name || '').toLowerCase().includes(assignSearch.toLowerCase()))
                        .filter(emp => {
                          const empShiftId = emp.shift?._id || emp.shift;
                          return empShiftId !== assignModal.shift?._id;
                        })
                        .map(emp => (
                          <label key={emp._id} className={`flex items-center gap-3 p-4 rounded-2xl border-2 transition-all cursor-pointer ${assignData.selectedEmployees.includes(emp._id) ? 'bg-indigo-50 border-indigo-200' : 'bg-white border-slate-100 hover:border-slate-200'}`}>
                            <input
                              type="checkbox"
                              className="w-5 h-5 rounded-lg border-slate-300 text-indigo-600 focus:ring-indigo-500"
                              checked={assignData.selectedEmployees.includes(emp._id)}
                              onChange={(e) => {
                                const current = [...assignData.selectedEmployees];
                                if (e.target.checked) {
                                  setAssignData({ ...assignData, selectedEmployees: [...current, emp._id] });
                                } else {
                                  setAssignData({ ...assignData, selectedEmployees: current.filter(id => id !== emp._id) });
                                }
                              }}
                            />
                            <div className="flex-1">
                              <p className="text-sm font-bold text-slate-800">{emp.name}</p>
                              <p className="text-[10px] text-slate-400 font-bold ">{emp.department} • {emp.shift?.name || 'No Shift'}</p>
                            </div>
                          </label>
                        ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-8 border-t border-slate-50 bg-slate-50/30">
                <button
                  onClick={handleAssignSubmit}
                  disabled={saving || assignData.selectedEmployees.length === 0}
                  className="w-full bg-indigo-600 text-white font-bold py-5 rounded-2xl shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-3"
                >
                  {saving ? <Loader2 size={20} className="animate-spin" /> : <Save size={20} />}
                  Assign "{assignModal.shift?.name}"
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};

export default Shifts;
