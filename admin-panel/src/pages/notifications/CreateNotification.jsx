import { ArrowLeft, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../../api/axios';

const CustomSelect = ({ value, onChange, options, label }) => {
  const [isOpen, setIsOpen] = useState(false);
  const selectedOption = options.find(opt => opt.value === value) || options[0];

  return (
    <div className="relative space-y-1">
      {label && (
        <label className="text-xs font-semibold text-slate-600 block">
          {label}
        </label>
      )}
      <div className="relative">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="w-full flex items-center justify-between bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg text-sm text-slate-800 text-left cursor-pointer hover:bg-slate-100 hover:border-slate-350 transition-colors"
        >
          <span>{selectedOption?.label || selectedOption?.value}</span>
          <span className="text-slate-400 text-xs">▼</span>
        </button>

        {isOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
            <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-[200px] overflow-y-auto">
              <div className="p-1 space-y-0.5">
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
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-xs font-semibold text-left transition-colors ${isSelected
                          ? 'bg-indigo-50 text-indigo-600'
                          : 'text-slate-700 hover:bg-slate-50 hover:text-indigo-650'
                        }`}
                    >
                      <span>{opt.label}</span>
                      {isSelected && (
                        <span className="text-indigo-600 text-xs">✓</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

const CustomDateTimePicker = ({ value, onChange, label }) => {
  const [isOpen, setIsOpen] = useState(false);
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
    <div className="relative space-y-1 w-full">
      {label && (
        <label className="text-xs font-semibold text-slate-600 block">{label}</label>
      )}
      <div className="relative">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="w-full flex items-center justify-between bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg text-sm text-slate-800 text-left cursor-pointer hover:bg-slate-100 transition-colors"
        >
          <span>{getDisplayString()}</span>
          <span className="text-slate-400 text-xs">📅</span>
        </button>

        {isOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
            <div className="absolute z-50 left-0 right-0 mt-1 w-80 bg-white border border-slate-200 rounded-lg shadow-xl p-4 space-y-3 text-slate-800">
              {/* Month navigation */}
              <div className="flex justify-between items-center pb-2 border-b border-slate-200">
                <button type="button" onClick={() => setCurrentDate(new Date(year, month - 1, 1))} className="p-1 hover:bg-slate-100 rounded text-slate-500 font-bold">&larr;</button>
                <span className="text-xs font-bold text-slate-700">{months[month]} {year}</span>
                <button type="button" onClick={() => setCurrentDate(new Date(year, month + 1, 1))} className="p-1 hover:bg-slate-100 rounded text-slate-500 font-bold">&rarr;</button>
              </div>

              {/* Calendar grid */}
              <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-slate-400">
                {daysOfWeek.map(d => <span key={d}>{d}</span>)}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {days.map((day, idx) => {
                  if (!day) return <div key={idx} />;
                  const isSelected = selectedDate && day.toDateString() === selectedDate.toDateString();
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        setSelectedDate(day);
                        updateParent(day, hours, minutes, ampm);
                      }}
                      className={`py-1 rounded text-xs font-semibold ${isSelected ? 'bg-indigo-600 text-white' : 'hover:bg-slate-100 text-slate-700'
                        }`}
                    >
                      {day.getDate()}
                    </button>
                  );
                })}
              </div>

              {/* Time selection */}
              <div className="flex items-center justify-between border-t border-slate-200 pt-2">
                <span className="text-xs font-bold text-slate-500">Time:</span>
                <div className="flex items-center gap-1">
                  <select
                    value={hours}
                    onChange={(e) => {
                      setHours(e.target.value);
                      updateParent(selectedDate || new Date(), e.target.value, minutes, ampm);
                    }}
                    className="border border-slate-200 rounded p-1 text-xs cursor-pointer outline-none"
                  >
                    {Array.from({ length: 12 }, (_, i) => i + 1).map(h => (
                      <option key={h} value={h}>{h.toString().padStart(2, '0')}</option>
                    ))}
                  </select>
                  <span className="text-xs font-bold">:</span>
                  <select
                    value={minutes}
                    onChange={(e) => {
                      setMinutes(e.target.value);
                      updateParent(selectedDate || new Date(), hours, e.target.value, ampm);
                    }}
                    className="border border-slate-200 rounded p-1 text-xs cursor-pointer outline-none"
                  >
                    {Array.from({ length: 12 }, (_, i) => i * 5).map(m => (
                      <option key={m} value={m}>{m.toString().padStart(2, '0')}</option>
                    ))}
                  </select>
                  <select
                    value={ampm}
                    onChange={(e) => {
                      setAmpm(e.target.value);
                      updateParent(selectedDate || new Date(), hours, minutes, e.target.value);
                    }}
                    className="border border-slate-200 rounded p-1 text-xs cursor-pointer outline-none"
                  >
                    <option value="AM">AM</option>
                    <option value="PM">PM</option>
                  </select>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

const CreateNotification = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editId = searchParams.get('edit');
  const [loading, setLoading] = useState(false);

  // Lists fetched from API
  const [departments, setDepartments] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [locations, setLocations] = useState([]);
  const [employees, setEmployees] = useState([]);

  // Form States
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [type, setType] = useState('general');
  const [isAuto, setIsAuto] = useState(false);
  const [autoType, setAutoType] = useState('');

  // Targeting States
  const [targetScope, setTargetScope] = useState('all');
  const [targetDepartments, setTargetDepartments] = useState([]);
  const [targetEmployees, setTargetEmployees] = useState([]);
  const [targetShifts, setTargetShifts] = useState([]);
  const [targetLocations, setTargetLocations] = useState([]);
  const [targetRole, setTargetRole] = useState('employee');

  // Scheduling States
  const [isScheduled, setIsScheduled] = useState(false);
  const [scheduledTime, setScheduledTime] = useState('');
  const [repeatInterval, setRepeatInterval] = useState('once');
  const [saveStatus, setSaveStatus] = useState('Sent'); // 'Sent' or 'Draft'

  const [employeeSearch, setEmployeeSearch] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const allowedTypes = [
    { value: 'general notification', label: 'General Notification' },
    { value: 'emergancy notification', label: 'Emergency Notification' },
    { value: 'hr announcement', label: 'HR Announcement' },
    { value: 'attendance notification', label: 'Attendance Notification' },
    { value: 'tracing notification', label: 'Tracing Notification' }
  ];

  // Helper to map trigger events dynamically based on selected category type
  const getSubAutoTypesForType = (currentType) => {
    switch (currentType) {
      case 'general notification':
        return [
          { value: 'Leave approved', label: 'Leave approved' },
          { value: 'Shift change reminder', label: 'Shift change reminder' }
        ];
      case 'attendance notification':
        return [
          { value: 'Employee late by grace time', label: 'Employee late by grace time' },
          { value: 'Employee punch out reminder', label: 'Employee punch out reminder' },
          { value: 'Employee absent', label: 'Employee absent' }
        ];
      case 'tracing notification':
        return [
          { value: 'Employee outside geofence', label: 'Employee outside geofence' },
          { value: 'Employee inside geofence area', label: 'Employee inside geofence area' }
        ];
      default:
        return [];
    }
  };

  useEffect(() => {
    fetchOptions();
    if (editId) {
      fetchEditingDetails();
    }
  }, [editId]);

  // Adjust autoType automatically when type changes
  useEffect(() => {
    const opts = getSubAutoTypesForType(type);
    if (opts.length > 0) {
      if (!opts.some(o => o.value === autoType)) {
        setAutoType(opts[0].value);
      }
    } else {
      setAutoType('');
    }
  }, [type]);

  const fetchEditingDetails = async () => {
    try {
      setLoading(true);
      const res = await api.get(`/notifications/${editId}`);
      if (res.data.success) {
        const notif = res.data.data;
        setTitle(notif.title || '');
        setMessage(notif.description || notif.message || '');
        setType(notif.type || 'general');

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
          const localISOTime = new Date(date.getTime() - tzOffset).toISOString().slice(0, 16);
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
        setAutoType(notif.autoType || '');
      }
    } catch (e) {
      toast.error('Failed to load notification details for editing');
    } finally {
      setLoading(false);
    }
  };

  const fetchOptions = async () => {
    try {
      const [deptRes, shiftRes, locRes, empRes] = await Promise.all([
        api.get('/departments').catch(() => ({ data: { data: [] } })),
        api.get('/shifts').catch(() => ({ data: { data: [] } })),
        api.get('/settings/locations').catch(() => ({ data: { data: [] } })),
        api.get('/employees').catch(() => ({ data: { data: [] } }))
      ]);

      setDepartments(deptRes.data?.data || []);
      setShifts(shiftRes.data?.data || []);
      setLocations(locRes.data?.data || []);
      setEmployees(empRes.data?.data || []);
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
      toast.error('Please enter a notification title.');
      return;
    }

    if (!message.trim()) {
      toast.error('Please enter the notification message content.');
      return;
    }

    if (isScheduled && !scheduledTime) {
      toast.error('Please select the date and time to schedule.');
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
        status: saveStatus === 'Draft' ? 'draft' : (isScheduled ? 'scheduled' : 'sent'),
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
      toast.error(err.response?.data?.message || 'Failed to submit notification. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    try {
      setLoading(true);
      const res = await api.delete(`/notifications/${editId}`);
      if (res.data.success) {
        toast.success('Deleted successfully!');
        navigate('/notifications');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete notification.');
    } finally {
      setLoading(false);
    }
  };

  const filteredEmployees = employees.filter(emp =>
    (emp.name || '').toLowerCase().includes(employeeSearch.toLowerCase()) ||
    (emp.email || '').toLowerCase().includes(employeeSearch.toLowerCase())
  );

  const triggerOptions = getSubAutoTypesForType(type);

  return (
    <div className="min-h-[80vh] flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-2xl space-y-6">

        {/* Header Panel */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-200">
          <button
            onClick={() => navigate('/notifications')}
            className="flex items-center gap-2 px-3 py-1.5 border border-slate-350 rounded-lg text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 transition-colors"
          >
            <ArrowLeft size={14} />
            Back
          </button>
          <h2 className="text-xl font-bold text-slate-800">
            {editId
              ? (isAuto ? 'Edit Automatic Workflow' : 'Edit Notification')
              : (isAuto ? 'Create Automatic Workflow' : 'Create New Notification')
            }
          </h2>
        </div>

        <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-xl p-6 space-y-5 shadow-sm">

          {/* Title */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-600 block">Notification Title</label>
            <input
              type="text"
              placeholder="Enter title heading"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={100}
              required
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:bg-white transition-all font-normal"
            />
          </div>

          {/* Message Content */}
          <div className="space-y-1">
            <div className="flex justify-between">
              <label className="text-xs font-semibold text-slate-600">Message Content</label>
              <span className="text-[10px] text-slate-400">{message.length}/1000</span>
            </div>
            <textarea
              placeholder="Type your message details here"
              value={message}
              onChange={(e) => setMessage(e.target.value.slice(0, 1000))}
              required
              rows={4}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:bg-white transition-all font-normal resize-none"
            />
          </div>

          {/* Custom Notification Type Select */}
          <CustomSelect
            label="Notification Type"
            value={type}
            onChange={(val) => setType(val)}
            options={allowedTypes}
          />

          {/* Custom Delivery Flow Mode Selector */}
          <CustomSelect
            label="Delivery Flow Mode"
            value={isAuto ? 'automatic' : 'manual'}
            onChange={(val) => setIsAuto(val === 'automatic')}
            options={[
              { value: 'manual', label: 'Manual Broadcast (Send immediately or schedule manually)' },
              { value: 'automatic', label: 'Automatic Workflow (System-triggered based on activity)' }
            ]}
          />

          {/* Custom Dynamic Trigger Event Selection */}
          {isAuto && triggerOptions.length > 0 && (
            <div className="space-y-1 bg-slate-50 border border-slate-100 rounded-lg p-4">
              <CustomSelect
                label="Choose Trigger Event"
                value={autoType}
                onChange={(val) => setAutoType(val)}
                options={triggerOptions}
              />
            </div>
          )}

          {/* Recipient Targeting */}
          <div className="space-y-2 border-t border-slate-100 pt-4">
            <label className="text-xs font-semibold text-slate-600 block">Target Audience</label>
            <div className="flex flex-wrap gap-2">
              {[
                { value: 'all', label: 'All Employees' },
                { value: 'department', label: 'Departments' },
                { value: 'employees', label: 'Specific Employees' },
                { value: 'shift', label: 'Work Shifts' },
                { value: 'location', label: 'Office Locations' }
              ].map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleScopeChange(opt.value)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${targetScope === opt.value
                    ? 'bg-indigo-600 text-white border-transparent shadow-sm'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Targeting Form Elements */}
            <div className="bg-slate-50 border border-slate-100 rounded-lg p-4 max-h-[220px] overflow-y-auto font-normal text-slate-700 text-sm mt-2">
              {targetScope === 'all' && (
                <p className="text-xs text-slate-500 font-medium">
                  This notification will target all active staff members.
                </p>
              )}

              {targetScope === 'department' && (
                <div className="space-y-2">
                  <p className="text-xs font-bold text-slate-500">Select Departments</p>
                  <div className="grid grid-cols-2 gap-2">
                    {departments.map(d => (
                      <label key={d._id} className="flex items-center gap-2 bg-white border border-slate-200 p-2 rounded cursor-pointer hover:bg-slate-100">
                        <input
                          type="checkbox"
                          checked={targetDepartments.includes(d._id)}
                          onChange={() => handleCheckboxToggle(d._id, targetDepartments, setTargetDepartments)}
                          className="rounded border-slate-350 text-indigo-650"
                        />
                        <span className="text-xs">{d.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {targetScope === 'shift' && (
                <div className="space-y-2">
                  <p className="text-xs font-bold text-slate-500">Select Shifts</p>
                  <div className="grid grid-cols-2 gap-2">
                    {shifts.map(s => (
                      <label key={s._id} className="flex items-center gap-2 bg-white border border-slate-200 p-2 rounded cursor-pointer hover:bg-slate-100">
                        <input
                          type="checkbox"
                          checked={targetShifts.includes(s._id)}
                          onChange={() => handleCheckboxToggle(s._id, targetShifts, setTargetShifts)}
                          className="rounded border-slate-350 text-indigo-650"
                        />
                        <span className="text-xs">{s.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {targetScope === 'location' && (
                <div className="space-y-2">
                  <p className="text-xs font-bold text-slate-500">Select Locations</p>
                  <div className="grid grid-cols-2 gap-2">
                    {locations.map(l => (
                      <label key={l._id} className="flex items-center gap-2 bg-white border border-slate-200 p-2 rounded cursor-pointer hover:bg-slate-100">
                        <input
                          type="checkbox"
                          checked={targetLocations.includes(l._id)}
                          onChange={() => handleCheckboxToggle(l._id, targetLocations, setTargetLocations)}
                          className="rounded border-slate-350 text-indigo-650"
                        />
                        <span className="text-xs">{l.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {targetScope === 'employees' && (
                <div className="space-y-3">
                  <input
                    type="text"
                    placeholder="Search employee name..."
                    value={employeeSearch}
                    onChange={(e) => setEmployeeSearch(e.target.value)}
                    className="w-full bg-white border border-slate-200 px-3 py-1.5 rounded text-xs outline-none focus:border-indigo-500"
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                    {filteredEmployees.map(emp => (
                      <label key={emp._id} className="flex items-center gap-2 bg-white border border-slate-200 p-2 rounded cursor-pointer hover:bg-slate-100">
                        <input
                          type="checkbox"
                          checked={targetEmployees.includes(emp._id)}
                          onChange={() => handleCheckboxToggle(emp._id, targetEmployees, setTargetEmployees)}
                          className="rounded border-slate-350 text-indigo-650"
                        />
                        <span className="text-xs font-medium truncate">{emp.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Scheduling Controls */}
          <div className="space-y-3 border-t border-slate-100 pt-4">
            <label className="text-xs font-semibold text-slate-600 block">Dispatch Timing</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setIsScheduled(false)}
                className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-colors ${!isScheduled
                  ? 'bg-indigo-600 text-white border-transparent shadow-sm'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
              >
                Send Now
              </button>
              <button
                type="button"
                onClick={() => setIsScheduled(true)}
                className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-colors ${isScheduled
                  ? 'bg-indigo-600 text-white border-transparent shadow-sm'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
              >
                Schedule for Later
              </button>
            </div>

            {isScheduled && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <CustomDateTimePicker
                  label="Date & Time"
                  value={scheduledTime}
                  onChange={(val) => setScheduledTime(val)}
                />
                <CustomSelect
                  label="Recurrence"
                  value={repeatInterval}
                  onChange={(val) => setRepeatInterval(val)}
                  options={[
                    { value: 'once', label: 'Once (No recurrence)' },
                    { value: 'daily', label: 'Daily' },
                    { value: 'weekly', label: 'Weekly' },
                    { value: 'monthly', label: 'Monthly' }
                  ]}
                />
              </div>
            )}
          </div>

          {/* Save Status & Action buttons */}
          <div className="border-t border-slate-100 pt-4 space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600 block">Save Mode</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setSaveStatus('Sent')}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${saveStatus === 'Sent'
                    ? 'bg-indigo-600 text-white border-transparent shadow-sm'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    }`}
                >
                  Active
                </button>
                <button
                  type="button"
                  onClick={() => setSaveStatus('Draft')}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${saveStatus === 'Draft'
                    ? 'bg-indigo-600 text-white border-transparent shadow-sm'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    }`}
                >
                  Draft
                </button>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              {editId && (
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  disabled={loading}
                  className="px-4 py-2 border border-red-200 text-red-600 hover:bg-red-50 text-xs font-bold rounded-lg transition-colors disabled:opacity-50"
                >
                  Delete
                </button>
              )}
              <button
                type="submit"
                disabled={loading}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs py-2 rounded-lg transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 className="animate-spin" size={14} />
                ) : (
                  <span>Submit</span>
                )}
              </button>
            </div>
          </div>

        </form>
      </div>

      {/* Customized Small Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white border border-slate-200 w-full max-w-xs rounded-xl shadow-xl p-5 flex flex-col items-center text-center">
            <h3 className="text-md font-bold text-slate-800 mb-2">Delete Notification?</h3>
            <p className="text-xs text-slate-500 mb-5 leading-relaxed">
              Are you sure you want to permanently delete this notification? This action cannot be undone.
            </p>
            <div className="flex w-full gap-3">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 py-2 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-lg text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowDeleteConfirm(false);
                  handleDelete();
                }}
                className="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-semibold shadow"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default CreateNotification;
