import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Clock,
  Edit2,
  Info,
  Loader2,
  Plus,
  Save,
  Timer,
  Trash2,
  User,
  Users,
  X
} from 'lucide-react';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../api/axios';

const Shifts = () => {
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
    startTime: '09:00',
    endTime: '18:00',
    gracePeriod: 15,
    halfDayAfter: '11:00',
    workingHours: 9,
    weeklyOff: ['Sunday'],
    isNightShift: false
  });

  const [assignModal, setAssignModal] = useState({ show: false, shift: null });
  const [assignData, setAssignData] = useState({ selectedEmployees: [] });
  const [assignSearch, setAssignSearch] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [filterStatus, setFilterStatus] = useState('All');

  useEffect(() => {
    fetchData();
  }, [selectedDate]);

  const fetchData = async () => {
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
      toast.error('Failed to load shifts and employees');
    } finally {
      setLoading(false);
    }
  };

  const getEmployeesByShift = (shiftId) => {
    return employees.filter(emp => emp.shift?._id === shiftId || emp.shift === shiftId);
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
        halfDayAfter: shift.halfDayAfter || '11:00',
        workingHours: shift.workingHours || 9,
        weeklyOff: shift.weeklyOff || ['Sunday'],
        isNightShift: shift.isNightShift || false
      });
    } else {
      setEditingShift(null);
      setFormData({
        name: '',
        startTime: '09:00',
        endTime: '18:00',
        gracePeriod: 15,
        halfDayAfter: '11:00',
        workingHours: 9,
        weeklyOff: ['Sunday'],
        isNightShift: false
      });
    }
    setShowModal(true);
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
    const action = editingShift ? 'update' : 'create';
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
          toast.error(err.response?.data?.message || 'Failed to delete shift');
        }
      },
      'This will remove the shift. Are you sure?'
    );
  };

  const handleAssignSubmit = async () => {
    try {
      setSaving(true);
      await api.post('/shifts/assign', {
        shiftId: assignModal.shift._id,
        userIds: assignData.selectedEmployees,
      });
      toast.success('Shift assigned successfully');
      setAssignModal({ show: false, shift: null });
      setAssignSearch('');
      fetchData();
    } catch (err) {
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
    <div className="space-y-6 md:space-y-8 animate-fade-up">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight m-0">Shift Setup</h2>
          <p className="text-slate-600 font-bold text-[13px] mt-2">Manage work timings and rules</p>
        </div>
        <button
          className="flex items-center gap-2 bg-indigo-600 text-white px-6 py-3 rounded-2xl font-bold text-sm shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all active:scale-95"
          onClick={() => handleOpenModal()}
        >
          <Plus size={18} />
          Add New Shift
        </button>
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
                  <h3 className="font-bold text-slate-900 text-base tracking-tight">{shift.name}</h3>
                  <p className="text-[10px] text-slate-400 font-bold">ID: {shift._id.slice(-6)}</p>
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
                <button
                  className="p-2.5 rounded-xl bg-white text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-all shadow-sm"
                  onClick={() => handleDeleteConfirm(shift._id)}
                  title="Delete Shift"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-5">
              <div className="flex justify-between items-center py-2 border-b border-slate-50">
                <div className="flex items-center gap-3">
                  <Timer size={14} className="text-slate-400" />
                  <span className="text-slate-500 text-[11px] font-bold tracking-tight">Work Hours</span>
                </div>
                <span className="font-bold text-slate-800 text-sm">{to12Hour(shift.startTime)} — {to12Hour(shift.endTime)}</span>
              </div>

              <div className="flex justify-between items-center py-2 border-b border-slate-50">
                <div className="flex items-center gap-3">
                  <CheckCircle2 size={14} className="text-emerald-500" />
                  <span className="text-slate-500 text-[11px] font-bold tracking-tight">Grace Period</span>
                </div>
                <span className="font-bold text-emerald-600 bg-emerald-50 px-3 py-1 rounded-lg text-[10px] border border-emerald-100">
                  {shift.gracePeriod} mins
                </span>
              </div>

              <div className="flex justify-between items-center py-2 border-b border-slate-50">
                <div className="flex items-center gap-3">
                  <Info size={14} className="text-slate-400" />
                  <span className="text-slate-500 text-[11px] font-bold tracking-tight">Rules</span>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="font-bold text-slate-800 text-[10px]">Half Day After: {to12Hour(shift.halfDayAfter)}</span>
                  <span className="text-[9px] font-bold text-slate-400">Req. Hours: {shift.workingHours}h</span>
                  {shift.isNightShift && <span className="bg-slate-900 text-white text-[8px] px-1.5 py-0.5 rounded  tracking-tighter">Night Shift</span>}
                </div>
              </div>

              <div className="space-y-2 py-2">
                <div className="flex items-center gap-3">
                  <Users size={14} className="text-indigo-500" />
                  <span className="text-slate-500 text-[11px] font-bold tracking-tight">Assigned Employees ({getEmployeesByShift(shift._id).length})</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {getEmployeesByShift(shift._id).length > 0 ? (
                    getEmployeesByShift(shift._id).map((emp) => (
                      <span key={emp._id} className="text-[9px] font-bold bg-indigo-50 text-indigo-700 px-2 py-1 rounded-lg border border-indigo-100 truncate max-w-full hover:bg-indigo-100 transition-colors">
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
      </div>

      {/* Employee Shift Overview Section */}
      <div className="mt-12 space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
          <div>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">Employee Assignment Overview</h2>
            <p className="text-slate-400 text-xs font-medium mt-1">Quick view of all employees and their assigned shifts</p>
          </div>
          <div className="flex flex-wrap items-center gap-4 bg-slate-50 p-2 rounded-[24px] border border-slate-100 overflow-x-auto max-w-full">
            <div className="flex items-center gap-2 px-3 border-r border-slate-200">
              <Calendar size={14} className="text-slate-400" />
              <input 
                type="date" 
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="bg-transparent text-[11px] font-bold text-slate-600 outline-none cursor-pointer"
              />
            </div>
            <div className="flex items-center gap-2">
              {['All', 'Present', 'Late', 'Half Day'].map((s) => (
                <button
                  key={s}
                  onClick={() => setFilterStatus(s)}
                  className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                    filterStatus === s 
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-100' 
                      : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {attendance
            .filter(att => att.punchIn?.time) // Only show employees who have punched in
            .filter(att => filterStatus === 'All' || att.status === filterStatus)
            .sort((a, b) => new Date(b.punchIn.time) - new Date(a.punchIn.time)) // Newest first
            .map((att) => {
              const emp = att.user;
              if (!emp) return null;
              const status = att.status;
              
              // Calculate Late Time if late
              let lateTimeText = '';
              if (att.isLate && att.punchIn?.time && emp.shift?.startTime) {
                const punchDate = new Date(att.punchIn.time);
                const [sHour, sMin] = emp.shift.startTime.split(':').map(Number);
                const shiftStart = new Date(punchDate);
                shiftStart.setHours(sHour, sMin, 0, 0);
                
                const diffMs = punchDate - shiftStart;
                if (diffMs > 0) {
                  const diffMins = Math.floor(diffMs / 60000);
                  if (diffMins >= 60) {
                    lateTimeText = `${Math.floor(diffMins / 60)}h ${diffMins % 60}m Late`;
                  } else {
                    lateTimeText = `${diffMins}m Late`;
                  }
                }
              }

              return (
                <div key={att._id} className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all group animate-in fade-in slide-in-from-bottom-2 duration-500">
                  <div className="flex items-start justify-between mb-3">
                    <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors">
                      <User size={20} />
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <div className={`px-2 py-1 rounded-md text-[8px] font-black uppercase tracking-tighter ${
                        status === 'Present' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' :
                        status === 'Late' ? 'bg-amber-50 text-amber-600 border border-amber-100' :
                        status === 'Half Day' ? 'bg-orange-50 text-orange-600 border border-orange-100' :
                        'bg-slate-50 text-slate-400 border border-slate-100'
                      }`}>
                        {status}
                      </div>
                      {lateTimeText && (
                        <span className="text-[7px] font-black text-rose-500 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-100 uppercase tracking-tighter">
                          {lateTimeText}
                        </span>
                      )}
                    </div>
                  </div>
                  <h4 className="font-bold text-slate-900 text-sm truncate">{emp.name}</h4>
                  <p className="text-[10px] text-slate-400 font-bold tracking-widest mt-0.5 truncate">{emp.department}</p>
                  
                  <div className="mt-4 pt-4 border-t border-slate-50 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] font-bold text-slate-400">Punch In</span>
                      <span className="text-[10px] font-bold text-slate-800">
                        {to12Hour(new Date(att.punchIn.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }))}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] font-bold text-slate-400">Punch Out</span>
                      <span className="text-[10px] font-bold text-slate-800">
                        {att.punchOut?.time ? to12Hour(new Date(att.punchOut.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })) : 'Working...'}
                      </span>
                    </div>
                    
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[9px] font-bold text-slate-400">Working Hrs</span>
                      <span className="text-[10px] font-bold text-slate-800">
                        {att.workingHours ? `${att.workingHours.toFixed(2)}h` : '—'}
                      </span>
                    </div>

                    {(att.overtime > 0) && (
                      <div className="flex items-center justify-between bg-indigo-50/50 p-1.5 rounded-lg border border-indigo-50">
                        <span className="text-[9px] font-black text-indigo-600 uppercase tracking-tighter">Overtime</span>
                        <span className="text-[10px] font-black text-indigo-700">+{att.overtime.toFixed(1)}h</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
        </div>
      </div>

      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-slate-900/40 backdrop-blur-md p-0 sm:p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white w-full h-full sm:h-auto sm:max-w-2xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col"
            >
              <div className="bg-white px-8 py-6 border-b border-slate-100 flex justify-between items-center">
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
                    <label className="text-[11px] font-bold text-slate-400 tracking-widest ml-1">Start Time (12h format)</label>
                    <div className="relative group">
                      <Timer size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="time"
                        value={formData.startTime}
                        onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
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
                        className="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-100 focus:bg-white pl-12 pr-4 py-4 rounded-2xl outline-none transition-all text-sm font-bold text-slate-800"
                      />
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-bold text-indigo-600 bg-white px-2 py-1 rounded-md shadow-sm border border-indigo-50">
                        {to12Hour(formData.endTime)}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <label className="text-[11px] font-bold text-slate-400 tracking-widest ml-1">Half Day After (HH:mm)</label>
                    <input
                      type="time"
                      value={formData.halfDayAfter}
                      onChange={(e) => setFormData({ ...formData, halfDayAfter: e.target.value })}
                      required
                      className="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-100 focus:bg-white px-5 py-4 rounded-2xl outline-none transition-all text-sm font-bold text-slate-800"
                    />
                  </div>
                  <div className="space-y-3">
                    <label className="text-[11px] font-bold text-slate-400 tracking-widest ml-1">Target Working Hours</label>
                    <input
                      type="number"
                      value={formData.workingHours}
                      onChange={(e) => setFormData({ ...formData, workingHours: e.target.value })}
                      required
                      className="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-100 focus:bg-white px-5 py-4 rounded-2xl outline-none transition-all text-sm font-bold text-slate-800"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                  <div className="space-y-3">
                    <label className="text-[11px] font-bold text-slate-400 tracking-widest ml-1">Weekly Off</label>
                    <div className="flex flex-wrap gap-2">
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
                          className={`px-3 py-2 rounded-xl text-[10px] font-bold transition-all ${formData.weeklyOff.includes(day) ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'}`}
                        >
                          {day.slice(0, 3)}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-4 pt-4">
                    <label className="flex items-center gap-3 cursor-pointer group">
                      <div className={`w-12 h-6 rounded-full transition-all relative ${formData.isNightShift ? 'bg-indigo-600' : 'bg-slate-200'}`}>
                        <input
                          type="checkbox"
                          className="hidden"
                          checked={formData.isNightShift}
                          onChange={(e) => setFormData({ ...formData, isNightShift: e.target.checked })}
                        />
                        <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${formData.isNightShift ? 'right-1' : 'left-1'}`} />
                      </div>
                      <span className="text-sm font-bold text-slate-700">Night Shift</span>
                    </label>
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-[11px] font-bold text-slate-400 tracking-widest ml-1">Late Rules</label>
                  <textarea
                    value={formData.lateRules}
                    onChange={(e) => setFormData({ ...formData, lateRules: e.target.value })}
                    placeholder="Describe rules for late arrivals..."
                    className="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-100 focus:bg-white px-5 py-4 rounded-2xl outline-none transition-all text-sm font-bold text-slate-800 min-h-[100px] resize-none"
                  />
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
          <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 10 }}
              className="bg-white rounded-[2.5rem] p-10 w-full max-w-[400px] text-center shadow-2xl"
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
          <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-slate-900/40 backdrop-blur-md p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white w-full max-w-xl rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-white">
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
                    <div className="grid grid-cols-1 gap-2 max-h-[350px] overflow-y-auto p-1">
                      {employees
                        .filter(emp => emp.name?.toLowerCase().includes(assignSearch.toLowerCase()))
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
    </div >
  );
};

export default Shifts;
