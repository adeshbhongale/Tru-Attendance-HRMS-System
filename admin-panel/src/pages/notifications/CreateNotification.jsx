import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft,
  Bell,
  Calendar,
  ChevronDown,
  Clock,
  Info,
  Loader2,
  Save,
  Send,
  Smartphone,
  Sparkles,
  Trash2,
  Zap
} from 'lucide-react';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../../api/axios';

const CustomSelect = ({ value, onChange, options, label, icon: Icon }) => {
  const [isOpen, setIsOpen] = useState(false);
  const selectedOption = options.find(opt => opt.value === value) || options[0];

  return (
    <div className="relative space-y-2">
      {label && (
        <label className="text-[11px] font-extrabold text-slate-400 tracking-widest block ml-1 ">
          {label}
        </label>
      )}
      <div className="relative">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="w-full flex items-center justify-between bg-slate-50 border border-slate-200 px-5 py-3.5 rounded-2xl outline-none hover:bg-slate-100 hover:border-slate-300 transition-all text-sm font-bold text-slate-800 text-left cursor-pointer active:scale-[0.99]"
        >
          <div className="flex items-center gap-3">
            {Icon && <Icon className="text-indigo-500 shrink-0" size={16} />}
            <span>{selectedOption?.label}</span>
          </div>
          <motion.div
            animate={{ rotate: isOpen ? 180 : 0 }}
            transition={{ duration: 0.2 }}
            className="text-slate-400 shrink-0"
          >
            <ChevronDown size={18} />
          </motion.div>
        </button>

        <AnimatePresence>
          {isOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                transition={{ duration: 0.15 }}
                className="absolute z-50 left-0 right-0 mt-2 bg-white border border-slate-200 rounded-2xl shadow-xl shadow-slate-100/50 max-h-[250px] overflow-y-auto no-scrollbar"
              >
                <div className="p-2 space-y-1">
                  {options.map((opt) => {
                    const isSelected = opt.value === value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => {
                          onChange(opt.value);
                          setIsOpen(false);
                        }}
                        className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-xs font-bold text-left transition-all ${isSelected
                          ? 'bg-gradient-to-r from-indigo-50 to-violet-50 text-indigo-600'
                          : 'text-slate-700 hover:bg-slate-50 hover:text-indigo-600'
                          }`}
                      >
                        <span>{opt.label}</span>
                        {isSelected && (
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3" className="text-indigo-600 animate-fade-in">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                          </svg>
                        )}
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

// Premium, Custom Designed Date & Time Popover Picker UI
const CustomDateTimePicker = ({ value, onChange, label }) => {
  const [isOpen, setIsOpen] = useState(false);

  // Local calendar and time selection states
  const [currentDate, setCurrentDate] = useState(value ? new Date(value) : new Date());
  const [selectedDate, setSelectedDate] = useState(value ? new Date(value) : null);
  const [hours, setHours] = useState(value ? new Date(value).getHours() % 12 || 12 : 9);
  const [minutes, setMinutes] = useState(value ? Math.round(new Date(value).getMinutes() / 5) * 5 % 60 : 0);
  const [ampm, setAmpm] = useState(value ? (new Date(value).getHours() >= 12 ? 'PM' : 'AM') : 'AM');

  useEffect(() => {
    if (value) {
      const d = new Date(value);
      setSelectedDate(d);
      setCurrentDate(d);
      const h = d.getHours();
      setHours(h % 12 || 12);
      setMinutes(Math.round(d.getMinutes() / 5) * 5 % 60);
      setAmpm(h >= 12 ? 'PM' : 'AM');
    }
  }, [value]);

  const updateParent = (dateObj, h12, min, ap) => {
    if (!dateObj) return;
    const newDate = new Date(dateObj);
    let hr = parseInt(h12);
    if (ap === 'PM' && hr < 12) hr += 12;
    if (ap === 'AM' && hr === 12) hr = 0;
    newDate.setHours(hr);
    newDate.setMinutes(parseInt(min));
    newDate.setSeconds(0);
    newDate.setMilliseconds(0);

    const tzOffset = newDate.getTimezoneOffset() * 60000;
    const localStr = (new Date(newDate.getTime() - tzOffset)).toISOString().slice(0, 16);
    onChange(localStr);
  };

  const applyPreset = (presetType) => {
    const d = new Date();
    if (presetType === '1h') {
      d.setHours(d.getHours() + 1);
    } else if (presetType === '3h') {
      d.setHours(d.getHours() + 3);
    }

    setSelectedDate(d);
    setCurrentDate(d);
    const h = d.getHours();
    setHours(h % 12 || 12);
    setMinutes(Math.round(d.getMinutes() / 5) * 5 % 60);
    setAmpm(h >= 12 ? 'PM' : 'AM');

    const tzOffset = d.getTimezoneOffset() * 60000;
    onChange((new Date(d.getTime() - tzOffset)).toISOString().slice(0, 16));
    setIsOpen(false);
  };

  const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const firstDayOfMonth = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days = [];

  for (let i = 0; i < firstDayOfMonth; i++) {
    days.push(null);
  }
  for (let i = 1; i <= daysInMonth; i++) {
    days.push(new Date(year, month, i));
  }

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

  const getDisplayString = () => {
    if (!value) return 'Not Scheduled (Click to configure)';
    const d = new Date(value);
    return d.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  };

  return (
    <div className="relative space-y-2">
      {label && (
        <label className="text-[11px] font-extrabold text-slate-400 tracking-widest block ml-1 ">
          {label}
        </label>
      )}
      <div className="relative">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="w-full flex items-center justify-between bg-slate-50 border border-slate-200 px-5 py-4 rounded-2xl outline-none hover:bg-slate-100 hover:border-slate-300 transition-all text-xs font-bold text-slate-700 text-left cursor-pointer active:scale-[0.99] shadow-sm"
        >
          <div className="flex items-center gap-3">
            <Calendar className="text-indigo-500 shrink-0" size={16} />
            <span>{getDisplayString()}</span>
          </div>
          <ChevronDown size={14} className="text-slate-400 shrink-0" />
        </button>

        <AnimatePresence>
          {isOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
              <motion.div
                initial={{ opacity: 0, y: 15, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 15, scale: 0.95 }}
                transition={{ duration: 0.15 }}
                className="absolute z-50 left-0 right-0 mt-3 w-full sm:w-[340px] bg-white border border-slate-200 rounded-[2rem] shadow-2xl p-5 space-y-4 text-slate-800"
              >
                {/* Calendar Header */}
                <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                  <button type="button" onClick={prevMonth} className="p-2 hover:bg-slate-100 rounded-xl text-slate-500 font-extrabold cursor-pointer transition-all active:scale-90">
                    &larr;
                  </button>
                  <span className="text-xs font-extrabold text-slate-700 tracking-wide ">
                    {months[month]} {year}
                  </span>
                  <button type="button" onClick={nextMonth} className="p-2 hover:bg-slate-100 rounded-xl text-slate-500 font-extrabold cursor-pointer transition-all active:scale-90">
                    &rarr;
                  </button>
                </div>

                {/* Weekdays */}
                <div className="grid grid-cols-7 gap-1 text-center">
                  {daysOfWeek.map(d => (
                    <span key={d} className="text-[9px] font-extrabold text-slate-400  tracking-widest">{d}</span>
                  ))}
                </div>

                {/* Days Grid */}
                <div className="grid grid-cols-7 gap-1.5">
                  {days.map((day, idx) => {
                    if (!day) return <div key={`empty-${idx}`} />;

                    const isSelected = selectedDate &&
                      day.getDate() === selectedDate.getDate() &&
                      day.getMonth() === selectedDate.getMonth() &&
                      day.getFullYear() === selectedDate.getFullYear();

                    const isToday = new Date().toDateString() === day.toDateString();

                    return (
                      <button
                        key={day.toISOString()}
                        type="button"
                        onClick={() => {
                          setSelectedDate(day);
                          updateParent(day, hours, minutes, ampm);
                        }}
                        className={`aspect-square w-full rounded-xl flex items-center justify-center text-[11px] font-extrabold transition-all cursor-pointer ${isSelected
                          ? 'bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-md shadow-indigo-100'
                          : isToday
                            ? 'bg-indigo-50 text-indigo-600 border border-indigo-200/60'
                            : 'text-slate-600 hover:bg-slate-50'
                          }`}
                      >
                        {day.getDate()}
                      </button>
                    );
                  })}
                </div>

                {/* Time Selection */}
                <div className="border-t border-slate-100 pt-3 space-y-2">
                  <span className="text-[9px] font-extrabold text-slate-400 tracking-widest block  ml-1">Select Custom Time</span>
                  <div className="flex gap-2 items-center justify-center bg-slate-50 border border-slate-200/60 p-3 rounded-2xl">
                    <select
                      value={hours}
                      onChange={(e) => {
                        setHours(e.target.value);
                        updateParent(selectedDate || new Date(), e.target.value, minutes, ampm);
                      }}
                      className="bg-transparent text-xs font-bold text-slate-700 outline-none cursor-pointer border border-transparent hover:border-slate-200 rounded px-1.5 py-0.5"
                    >
                      {Array.from({ length: 12 }, (_, i) => i + 1).map(h => (
                        <option key={h} value={h}>{h.toString().padStart(2, '0')}</option>
                      ))}
                    </select>

                    <span className="text-slate-400 font-extrabold text-xs animate-pulse">:</span>

                    <select
                      value={minutes}
                      onChange={(e) => {
                        setMinutes(e.target.value);
                        updateParent(selectedDate || new Date(), hours, e.target.value, ampm);
                      }}
                      className="bg-transparent text-xs font-bold text-slate-700 outline-none cursor-pointer border border-transparent hover:border-slate-200 rounded px-1.5 py-0.5"
                    >
                      {Array.from({ length: 12 }, (_, i) => i * 5).map(m => (
                        <option key={m} value={m}>{m.toString().padStart(2, '0')}</option>
                      ))}
                    </select>

                    <div className="flex gap-1 ml-3 border-l border-slate-200 pl-3">
                      {['AM', 'PM'].map(ap => (
                        <button
                          key={ap}
                          type="button"
                          onClick={() => {
                            setAmpm(ap);
                            updateParent(selectedDate || new Date(), hours, minutes, ap);
                          }}
                          className={`px-2.5 py-1 text-[9px] font-bold rounded-lg transition-all ${ampm === ap
                            ? 'bg-indigo-600 text-white shadow-sm'
                            : 'text-slate-500 hover:bg-slate-200'
                            }`}
                        >
                          {ap}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Instant Presets */}
                <div className="border-t border-slate-100 pt-3 space-y-2">
                  <span className="text-[9px] font-extrabold text-slate-400 tracking-widest block  ml-1">Speed Presets</span>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button type="button" onClick={() => applyPreset('1h')} className="py-2 px-3 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-[10px] font-bold text-slate-600 text-center transition-all cursor-pointer active:scale-95">
                      +1 Hour
                    </button>
                    <button type="button" onClick={() => applyPreset('3h')} className="py-2 px-3 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-[10px] font-bold text-slate-600 text-center transition-all cursor-pointer active:scale-95">
                      +3 Hours
                    </button>
                  </div>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

const CreateNotification = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editId = searchParams.get('edit');
  const [loading, setLoading] = useState(false);

  // Criteria Options fetched from API
  const [departments, setDepartments] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [locations, setLocations] = useState([]);
  const [employees, setEmployees] = useState([]);

  // Form State in Simple Terms
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');

  // Notification category mapping to Mongoose enums
  const [type, setType] = useState('General Announcement');

  // Recipient groups in simple words
  const [targetScope, setTargetScope] = useState('all');
  const [targetDepartments, setTargetDepartments] = useState([]);
  const [targetEmployees, setTargetEmployees] = useState([]);
  const [targetShifts, setTargetShifts] = useState([]);
  const [targetLocations, setTargetLocations] = useState([]);
  const [targetRole, setTargetRole] = useState('employee');

  // Scheduling flags
  const [isScheduled, setIsScheduled] = useState(false);
  const [scheduledTime, setScheduledTime] = useState('');
  const [repeatInterval, setRepeatInterval] = useState('once');
  const [saveStatus, setSaveStatus] = useState('Sent'); // 'Sent' (active run/schedule) or 'Draft'

  const [employeeSearch, setEmployeeSearch] = useState('');
  const [isAuto, setIsAuto] = useState(false);
  const [autoType, setAutoType] = useState('Employee late by grace time');

  const [allowedTypes, setAllowedTypes] = useState([
    'General Announcement',
    'HR Announcement',
    'Attendance Alert',
    'Meeting Notification',
    'Emergency Alert',
    'Late Coming',
    'Leave Applied',
    'Leave Approved',
    'Leave Rejected',
    'Geofence Entered',
    'Geofence Exited',
    'Shift Change Notification',
    'Punch In Reminder',
    'Punch Out Reminder'
  ]);
  const [allowedAutoTypes, setAllowedAutoTypes] = useState([
    'general',
    'Employee late by grace time',
    'Employee outside geofence',
    'Employee absent',
    'Leave approved',
    'Punch out reminder',
    'Shift change reminder'
  ]);

  useEffect(() => {
    fetchOptions();
    if (editId) {
      fetchEditingDetails();
    }
  }, [editId]);

  const fetchEditingDetails = async () => {
    try {
      setLoading(true);
      const res = await api.get(`/notifications/${editId}`);
      if (res.data.success) {
        const notif = res.data.data;
        setTitle(notif.title || '');
        setMessage(notif.description || notif.message || '');
        setType(notif.type || 'General Announcement');

        // Map backend targetType back to simple frontend targetScope
        const scopeMap = {
          'All Employees': 'all',
          'Specific Department': 'department',
          'Specific Employees': 'employees',
          'Shift-based Employees': 'shift',
          'Location-based Employees': 'location',
          'Role-based Employees': 'role'
        };
        setTargetScope(scopeMap[notif.targetType] || 'all');

        if (notif.departments) setTargetDepartments(notif.departments);
        if (notif.employees) setTargetEmployees(notif.employees.map(e => e._id || e));

        if (notif.shiftId) setTargetShifts([notif.shiftId]);
        if (notif.locationId) setTargetLocations([notif.locationId]);
        if (notif.targetRole) setTargetRole(notif.targetRole);

        if (notif.scheduledAt) {
          setIsScheduled(true);
          const date = new Date(notif.scheduledAt);
          const tzOffset = date.getTimezoneOffset() * 60000;
          const localISOTime = (new Date(date.getTime() - tzOffset)).toISOString().slice(0, 16);
          setScheduledTime(localISOTime);

          if (notif.frequency) {
            const freqMap = {
              'Daily': 'daily',
              'Weekly': 'weekly',
              'Monthly': 'monthly'
            };
            setRepeatInterval(freqMap[notif.frequency] || 'once');
          }
        } else {
          setIsScheduled(false);
        }

        setSaveStatus(notif.status === 'draft' ? 'Draft' : 'Sent');
        setIsAuto(notif.isAuto || false);
        setAutoType(notif.autoType || 'Employee late by grace time');
      }
    } catch (e) {
      toast.error('Failed to load notification details for editing');
    } finally {
      setLoading(false);
    }
  };

  const fetchOptions = async () => {
    try {
      const [deptRes, shiftRes, locRes, empRes, typesRes] = await Promise.all([
        api.get('/departments').catch(() => ({ data: { data: [] } })),
        api.get('/shifts').catch(() => ({ data: { data: [] } })),
        api.get('/settings/locations').catch(() => ({ data: { data: [] } })),
        api.get('/employees').catch(() => ({ data: { data: [] } })),
        api.get('/notifications/types').catch(() => ({ data: { success: false } }))
      ]);

      setDepartments(deptRes.data?.data || []);
      setShifts(shiftRes.data?.data || []);
      setLocations(locRes.data?.data || []);
      setEmployees(empRes.data?.data || []);

      if (typesRes.data?.success && typesRes.data?.data) {
        if (typesRes.data.data.types) {
          setAllowedTypes(typesRes.data.data.types);
        }
        if (typesRes.data.data.autoTypes) {
          setAllowedAutoTypes(typesRes.data.data.autoTypes);
        }
      }
    } catch (e) {
      console.error('Failed to pre-load segments list', e);
    }
  };

  const handleScopeChange = (scope) => {
    setTargetScope(scope);
    setTargetDepartments([]);
    setTargetEmployees([]);
    setTargetShifts([]);
    setTargetLocations([]);
  };

  const handleCheckboxToggle = (id, list, setList) => {
    if (list.includes(id)) {
      setList(list.filter(item => item !== id));
    } else {
      setList([...list, id]);
    }
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();

    if (!title.trim()) {
      toast.error('Please enter a heading title for the notification.');
      return;
    }

    if (!message.trim()) {
      toast.error('Please write the notification message content.');
      return;
    }

    if (isScheduled && !scheduledTime) {
      toast.error('Please select the date and time to schedule this.');
      return;
    }

    try {
      setLoading(true);

      const targetTypeMap = {
        all: 'All Employees',
        department: 'Specific Department',
        employees: 'Specific Employees',
        shift: 'Shift-based Employees',
        location: 'Location-based Employees',
        role: 'Role-based Employees'
      };

      // Construct a clean payload matching backend enums and lowercase status requirements
      const payload = {
        title: title.trim(),
        description: message.trim(),
        type: type,
        frequency: isScheduled
          ? (repeatInterval === 'daily'
            ? 'Daily'
            : repeatInterval === 'weekly'
              ? 'Weekly'
              : repeatInterval === 'monthly'
                ? 'Monthly'
                : 'Custom Schedule')
          : 'Instant',
        targetType: targetTypeMap[targetScope] || 'All Employees',
        departments: targetScope === 'department' ? targetDepartments : [],
        employees: targetScope === 'employees' ? targetEmployees : [],
        shiftId: targetScope === 'shift' && targetShifts.length > 0 ? targetShifts[0] : null,
        locationId: targetScope === 'location' && targetLocations.length > 0 ? targetLocations[0] : null,
        targetRole: targetScope === 'role' ? targetRole : null,
        scheduledAt: isScheduled && scheduledTime ? new Date(scheduledTime).toISOString() : null,
        status: saveStatus === 'Draft' ? 'draft' : (isScheduled ? 'scheduled' : 'sent'), // Mongoose Lowercase Status Requirement solved!
        isAuto: isAuto,
        autoType: isAuto ? autoType : null
      };

      const res = editId
        ? await api.put(`/notifications/${editId}`, payload)
        : await api.post('/notifications', payload);

      if (res.data.success) {
        toast.success(
          editId
            ? 'Notification updated successfully!'
            : (saveStatus === 'Draft'
              ? 'Draft saved successfully!'
              : (isScheduled ? 'Notification scheduled successfully!' : 'Notification sent successfully!'))
        );
        navigate('/notifications');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to submit notification parameters. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Are you sure you want to permanently delete this ${isAuto ? 'automatic workflow' : 'notification announcement'}?`)) {
      return;
    }

    try {
      setLoading(true);
      const res = await api.delete(`/notifications/${editId}`);
      if (res.data.success) {
        toast.success(isAuto ? 'Automatic workflow deleted successfully!' : 'Notification deleted successfully!');
        navigate('/notifications');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete notification. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const filteredEmployees = employees.filter(emp =>
    (emp.name || '').toLowerCase().includes(employeeSearch.toLowerCase()) ||
    (emp.email || '').toLowerCase().includes(employeeSearch.toLowerCase())
  );

  return (
    <div className="space-y-6 md:space-y-8 animate-fade-up">
      {/* Premium Navigation and Back Trigger */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/notifications')}
          className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 hover:text-indigo-600 font-extrabold text-xs rounded-2xl transition-all shadow-sm shrink-0 cursor-pointer active:scale-95"
        >
          <ArrowLeft size={14} />
          <span>Back to Feed</span>
        </button>
      </div>

      {/* Friendly HR Announcement Header */}
      <div>
        <h2 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight m-0">
          {editId
            ? (isAuto ? 'Edit Automatic Workflow' : 'Edit Announcement')
            : (isAuto ? 'Create Automatic Workflow' : 'Send New Announcement')
          }
        </h2>
        <p className="text-slate-600 font-bold text-[13px] mt-2">
          {isAuto
            ? 'Configure system-triggered automatic notifications based on employee behavior and events.'
            : 'Create manual broadcasts, announce updates, alert staff, or schedule custom notifications.'
          }
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Section - Form Fields in Simple Language */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-[2rem] p-6 md:p-8 shadow-xl shadow-slate-100/50 space-y-6">
          <div className="flex justify-between items-center pb-4 border-b border-slate-100">
            <h3 className="text-sm font-extrabold text-indigo-600  tracking-wider flex items-center gap-2">
              <Sparkles size={16} /> {isAuto ? 'Workflow Configuration Form' : 'Notification Form'}
            </h3>
            <span className="text-xs text-slate-400 font-bold">{isAuto ? 'Configure parameters below' : 'Write message below'}</span>
          </div>

          <div className="space-y-5">
            {/* Title / Heading */}
            <div className="space-y-2">
              <label className="text-[11px] font-extrabold text-slate-400  tracking-widest block ml-1">
                1. Notification Title / Heading
              </label>
              <input
                type="text"
                placeholder="Write a short title (e.g., Office Timings Update or Zoom Meeting Tomorrow)"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={100}
                required
                className="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-100 focus:bg-white px-5 py-3.5 rounded-2xl outline-none transition-all text-sm font-bold text-slate-800"
              />
            </div>

            {/* Message Body */}
            <div className="space-y-2">
              <div className="flex justify-between items-center px-1">
                <label className="text-[11px] font-extrabold text-slate-400  tracking-widest block">
                  2. Notification Message Content
                </label>
                <span className="text-[10px] font-bold text-slate-400">{message.length}/1000 characters</span>
              </div>
              <textarea
                placeholder="Write the full message details here that will display on your employee mobile applications..."
                value={message}
                onChange={(e) => setMessage(e.target.value.slice(0, 1000))}
                required
                className="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-100 focus:bg-white px-5 py-4 rounded-2xl outline-none transition-all text-sm font-bold text-slate-800 min-h-[140px] resize-none"
              />
            </div>

            {/* Workflow Category Dropdown */}
            <CustomSelect
              label="3. Notification Category / Type"
              value={type}
              onChange={(val) => setType(val)}
              options={allowedTypes.map(t => ({ value: t, label: t }))}
              icon={Sparkles}
            />

            {/* Delivery Flow Mode */}
            <CustomSelect
              label="3.1 Delivery Flow Mode"
              value={isAuto ? 'automatic' : 'manual'}
              onChange={(val) => setIsAuto(val === 'automatic')}
              options={[
                { value: 'manual', label: 'Manual Broadcast (Send on-demand or schedule manually)' },
                { value: 'automatic', label: 'Automatic Workflow (System-triggered based on activity)' }
              ]}
              icon={Zap}
            />

            {/* Trigger Event for Automated Flows */}
            {isAuto && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-2 mt-3"
              >
                <CustomSelect
                  label="3.2 Choose Trigger Event"
                  value={autoType}
                  onChange={(val) => setAutoType(val)}
                  options={allowedAutoTypes.map(at => ({ value: at, label: at }))}
                  icon={Bell}
                />
              </motion.div>
            )}

            {/* Target Group Selector */}
            <div className="space-y-3 border-t border-slate-100 pt-5">
              <label className="text-[11px] font-extrabold text-slate-400  tracking-widest block ml-1">
                4. Who should receive this notification?
              </label>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                {[
                  { value: 'all', label: 'All Employees' },
                  { value: 'department', label: 'By Departments' },
                  { value: 'employees', label: 'Specific Employees' },
                  { value: 'shift', label: 'By Work Shifts' },
                  { value: 'location', label: 'By Office Locations' }
                ].map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handleScopeChange(opt.value)}
                    className={`py-3 px-1 rounded-2xl text-[11px] font-bold border transition-all text-center ${targetScope === opt.value
                      ? 'bg-indigo-600 text-white border-transparent shadow-lg shadow-indigo-100'
                      : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                      }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {/* Dynamic Target Selection List based on scope */}
              <div className="bg-slate-50 border border-slate-100 rounded-3xl p-5 mt-3 max-h-[220px] overflow-y-auto no-scrollbar">
                {targetScope === 'all' && (
                  <div className="flex items-center gap-3 text-slate-500 font-medium text-xs">
                    <Info size={16} className="text-indigo-500 shrink-0" />
                    <span>This notification will be dispatched to <strong>all registered staff members</strong> immediately.</span>
                  </div>
                )}

                {targetScope === 'department' && (
                  <div className="space-y-2.5">
                    <p className="text-[10px] font-bold text-slate-400  tracking-widest">Select Target Departments</p>
                    <div className="grid grid-cols-2 gap-2">
                      {departments.map(d => (
                        <label key={d._id} className="flex items-center gap-3 bg-white border border-slate-200/60 p-3 rounded-xl cursor-pointer hover:bg-indigo-50/20">
                          <input
                            type="checkbox"
                            checked={targetDepartments.includes(d._id)}
                            onChange={() => handleCheckboxToggle(d._id, targetDepartments, setTargetDepartments)}
                            className="rounded text-indigo-600 focus:ring-indigo-500"
                          />
                          <span className="text-xs font-bold text-slate-700">{d.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {targetScope === 'shift' && (
                  <div className="space-y-2.5">
                    <p className="text-[10px] font-bold text-slate-400  tracking-widest">Select Target Work Shifts</p>
                    <div className="grid grid-cols-2 gap-2">
                      {shifts.map(s => (
                        <label key={s._id} className="flex items-center gap-3 bg-white border border-slate-200/60 p-3 rounded-xl cursor-pointer hover:bg-indigo-50/20">
                          <input
                            type="checkbox"
                            checked={targetShifts.includes(s._id)}
                            onChange={() => handleCheckboxToggle(s._id, targetShifts, setTargetShifts)}
                            className="rounded text-indigo-600 focus:ring-indigo-500"
                          />
                          <span className="text-xs font-bold text-slate-700">{s.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {targetScope === 'location' && (
                  <div className="space-y-2.5">
                    <p className="text-[10px] font-bold text-slate-400  tracking-widest">Select Target Locations</p>
                    <div className="grid grid-cols-2 gap-2">
                      {locations.map(l => (
                        <label key={l._id} className="flex items-center gap-3 bg-white border border-slate-200/60 p-3 rounded-xl cursor-pointer hover:bg-indigo-50/20">
                          <input
                            type="checkbox"
                            checked={targetLocations.includes(l._id)}
                            onChange={() => handleCheckboxToggle(l._id, targetLocations, setTargetLocations)}
                            className="rounded text-indigo-600 focus:ring-indigo-500"
                          />
                          <span className="text-xs font-bold text-slate-700">{l.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {targetScope === 'employees' && (
                  <div className="space-y-3">
                    <input
                      type="text"
                      placeholder="Search employee by name..."
                      value={employeeSearch}
                      onChange={(e) => setEmployeeSearch(e.target.value)}
                      className="w-full bg-white border border-slate-200 px-4 py-2.5 rounded-xl outline-none text-xs font-semibold"
                    />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                      {filteredEmployees.map(emp => (
                        <label key={emp._id} className="flex items-center gap-3 bg-white border border-slate-200/60 p-3 rounded-xl cursor-pointer hover:bg-indigo-50/20 truncate">
                          <input
                            type="checkbox"
                            checked={targetEmployees.includes(emp._id)}
                            onChange={() => handleCheckboxToggle(emp._id, targetEmployees, setTargetEmployees)}
                            className="rounded text-indigo-600 focus:ring-indigo-500"
                          />
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-slate-700 truncate">{emp.name}</p>
                            <p className="text-[9px] text-slate-400 truncate">{(emp.department?.name || emp.department || 'Active Employee')}</p>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right Section - Dispatch & Device Preview Simulator */}
        <div className="lg:col-span-1 space-y-6">

          {/* Dispatch controls */}
          <div className="bg-white border border-slate-200 rounded-[2rem] p-6 shadow-xl shadow-slate-100/50 space-y-5">
            <h3 className="text-sm font-extrabold text-indigo-600  tracking-wider flex items-center gap-2">
              <Clock size={16} /> 5. When to Send?
            </h3>

            <div className="space-y-4">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsScheduled(false)}
                  className={`flex-1 py-3 rounded-xl text-xs font-bold border transition-all ${!isScheduled
                    ? 'bg-indigo-600 text-white border-transparent shadow-lg shadow-indigo-100'
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                >
                  Send Now
                </button>
                <button
                  type="button"
                  onClick={() => setIsScheduled(true)}
                  className={`flex-1 py-3 rounded-xl text-xs font-bold border transition-all ${isScheduled
                    ? 'bg-indigo-600 text-white border-transparent shadow-lg shadow-indigo-100'
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                >
                  Schedule Later
                </button>
              </div>

              {isScheduled && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-4 pt-2"
                >
                  <CustomDateTimePicker
                    label="Select Date & Time"
                    value={scheduledTime}
                    onChange={(val) => setScheduledTime(val)}
                  />

                  <CustomSelect
                    label="Recurrence Interval"
                    value={repeatInterval}
                    onChange={(val) => setRepeatInterval(val)}
                    options={[
                      { value: 'once', label: 'Once (No Recurrence)' },
                      { value: 'daily', label: 'Everyday (Daily)' },
                      { value: 'weekly', label: 'Every Week (Weekly)' },
                      { value: 'monthly', label: 'Every Month (Monthly)' }
                    ]}
                    icon={Clock}
                  />
                </motion.div>
              )}

              {/* Save Status (Sent vs Draft) */}
              <div className="border-t border-slate-100 pt-4 space-y-2">
                <label className="text-[10px] font-bold text-slate-400  tracking-widest block ml-1">6. Save as Draft or Active Run?</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setSaveStatus('Sent')}
                    className={`flex-1 py-2.5 rounded-xl text-xs font-bold border transition-all ${saveStatus === 'Sent'
                      ? 'bg-slate-800 text-white border-transparent'
                      : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                      }`}
                  >
                    Active Run
                  </button>
                  <button
                    type="button"
                    onClick={() => setSaveStatus('Draft')}
                    className={`flex-1 py-2.5 rounded-xl text-xs font-bold border transition-all ${saveStatus === 'Draft'
                      ? 'bg-slate-800 text-white border-transparent'
                      : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                      }`}
                  >
                    Save Draft
                  </button>
                </div>
              </div>

              {/* Action Submit button */}
              <div className="pt-3 space-y-2">
                <button
                  type="button"
                  onClick={() => handleSubmit()}
                  disabled={loading}
                  className="w-full py-4 bg-indigo-600 text-white font-extrabold text-sm rounded-2xl shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {loading ? (
                    <Loader2 className="animate-spin" size={18} />
                  ) : saveStatus === 'Draft' ? (
                    <Save size={18} />
                  ) : (
                    <Send size={18} />
                  )}
                  {editId
                    ? 'Save Changes'
                    : (saveStatus === 'Draft'
                      ? 'Save as Draft'
                      : (isScheduled ? 'Schedule Task Now' : 'Send Push Notification Now'))}
                </button>

                {editId && (
                  <button
                    type="button"
                    onClick={() => handleDelete()}
                    disabled={loading}
                    className="w-full py-3.5 bg-rose-50 text-rose-600 font-extrabold text-xs rounded-2xl border border-rose-200 hover:bg-rose-600 hover:text-white transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <Trash2 size={14} />
                    {isAuto ? 'Delete Automatic Workflow' : 'Delete Notification Announcement'}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Interactive Mobile Device Simulator Preview */}
          <div className="bg-slate-900 border border-slate-850 rounded-[2.5rem] p-6 shadow-2xl space-y-4 text-white flex flex-col items-center">
            <div className="flex items-center gap-2 text-indigo-400 font-extrabold text-[10px]  tracking-widest">
              <Smartphone size={14} /> Smartphone App Preview
            </div>

            {/* Smartphone frame */}
            <div className="w-[230px] h-[340px] border-[6px] border-slate-800 rounded-[2.2rem] bg-slate-950 shadow-inner relative flex flex-col justify-start items-center p-3 pt-6 overflow-hidden">
              <div className="w-16 h-3 bg-slate-800 rounded-full absolute top-1.5" />

              <div className="w-full flex items-center justify-between border-b border-slate-850 pb-2 text-[8px] text-slate-500 font-bold">
                <span>Carrier LTE</span>
                <span>12:00 PM</span>
              </div>

              {/* Simulated push card */}
              <div className="w-full bg-slate-900/90 border border-slate-800 backdrop-blur-md rounded-2xl p-3 shadow-xl mt-4 flex items-start gap-2.5 animate-pulse">
                <div className="w-6 h-6 rounded-lg bg-indigo-600 flex items-center justify-center text-white shrink-0 shadow-lg shadow-indigo-500/30">
                  <Bell size={12} strokeWidth={2.5} />
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="text-[10px] font-extrabold text-white tracking-tight truncate leading-tight">
                    {title.trim() ? title : 'New HR Announcement'}
                  </h4>
                  <p className="text-[8px] text-slate-400 font-bold truncate leading-none mt-1">
                    Category: {type}
                  </p>
                  <p className="text-[9px] text-slate-300 font-medium leading-tight mt-1.5 break-words line-clamp-4">
                    {message.trim() ? message : 'Type your notification message content on the left to preview how it looks on employee phones...'}
                  </p>
                </div>
              </div>

              <div className="absolute bottom-4 text-[8px] text-slate-500 font-bold tracking-widest select-none pointer-events-none">
                ↑ SLIDE TO UNLOCK FEED
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreateNotification;
