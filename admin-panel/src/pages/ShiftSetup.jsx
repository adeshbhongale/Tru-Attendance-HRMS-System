import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Edit2,
  Loader2,
  Plus,
  Save,
  Trash2,
  X
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../api/axios';

const ShiftSetup = () => {
  const [shifts, setShifts] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingShift, setEditingShift] = useState(null);
  const [saving, setSaving] = useState(false);

  // Pagination & Delete State
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const [deleteConfirm, setDeleteConfirm] = useState({ show: false, id: null });
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    lateRules: '',
    halfDayRules: '',
    startTime: '00:00',
    endTime: '00:00',
    gracePeriod: 0,
    halfDayAfter: '00:00',

    workingHours: 0,
    weeklyOff: ['Sunday'],
    status: 'active'
  });

  const fetchData = async () => {
    try {
      setLoading(true);
      const [shiftsRes, empRes] = await Promise.all([
        api.get('/shifts'),
        api.get('/employees')
      ]);
      setShifts(shiftsRes.data.data);
      setEmployees(empRes.data.data);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData();
  }, []);

  const calculateEndTime = (start, hours) => {
    if (!start || hours === undefined || hours === null) return '';
    const [h, m] = start.split(':').map(Number);
    const hoursToAdd = parseFloat(hours) || 0;
    const totalMinutes = h * 60 + m + hoursToAdd * 60;
    const endH = Math.floor(totalMinutes / 60) % 24;
    const endM = Math.round(totalMinutes % 60);
    return `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
  };

  const employeesByShift = useMemo(() => {
    const map = {};
    shifts.forEach(s => {
      if (s && s._id) map[s._id] = 0;
    });
    employees.forEach(emp => {
      if (!emp) return;
      const sId = typeof emp.shift === 'string' ? emp.shift : emp.shift?._id;
      if (sId) {
        map[sId] = (map[sId] || 0) + 1;
      }
    });
    return map;
  }, [shifts, employees]);

  const to12Hour = (time24) => {
    if (!time24) return '--:--';
    const [hours, minutes] = time24.split(':');
    let h = parseInt(hours);
    const ampm = h >= 12 ? 'pm' : 'am';
    h = h % 12 || 12;
    return `${h}:${minutes} ${ampm}`;
  };

  const handleOpenModal = (shift = null) => {
    if (shift) {
      setEditingShift(shift);
      setFormData({
        name: shift.name,
        lateRules: shift.lateRules || '',
        halfDayRules: shift.halfDayRules || '',
        startTime: shift.startTime,
        endTime: shift.endTime,
        gracePeriod: shift.gracePeriod,
        halfDayAfter: shift.halfDayAfter || '11:00',

        workingHours: shift.workingHours || 9,
        weeklyOff: shift.weeklyOffs || ['Sunday'],
        status: shift.status || 'active'
      });
    } else {
      setEditingShift(null);
      setFormData({
        name: '',
        lateRules: '',
        halfDayRules: '',
        startTime: '00:00',
        endTime: '00:00',
        gracePeriod: 0,
        halfDayAfter: '00:00',
        minHoursFullDay: 0,
        minHoursHalfDay: 0,
        workingHours: 0,
        weeklyOff: ['Sunday'],
        status: 'active'
      });
    }
    setShowModal(true);
  };

  const handleSaveSubmit = async (e) => {
    e.preventDefault();
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
      toast.error(err.response?.data?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const executeDelete = async () => {
    if (!deleteConfirm.id) return;
    try {
      await api.delete(`/shifts/${deleteConfirm.id}`);
      toast.success('Shift deleted');
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Delete failed');
    } finally {
      setDeleteConfirm({ show: false, id: null });
    }
  };

  const exportToCSV = () => {
    const headers = ['Shift Name', 'Start Time', 'End Time', 'Status', 'Employee Count'];
    const data = shifts.map(s => [
      s.name,
      to12Hour(s.startTime),
      to12Hour(s.endTime),
      s.status,
      employeesByShift[s._id] || 0
    ]);
    const csvContent = [headers, ...data].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "shifts.csv");
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-96">
        <Loader2 className="animate-spin text-indigo-600" size={40} />
      </div>
    );
  }

  const totalPages = Math.ceil(shifts.length / itemsPerPage);
  const paginatedShifts = shifts.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  return (
    <>
      <div className="space-y-6 md:space-y-8 animate-fade-up">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight m-0">Shifts</h2>
            <p className="text-slate-600 font-bold text-[13px] mt-2">Add, edit or delete organization shifts</p>
          </div>
          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
            <button
              onClick={exportToCSV}
              className="flex items-center justify-center gap-2 bg-white text-slate-600 border border-slate-200 px-6 py-3 rounded-2xl font-bold text-sm hover:bg-slate-50 transition-all active:scale-95 shadow-sm"
            >
              <Download size={18} />
              Export
            </button>
            <button
              onClick={() => handleOpenModal()}
              className="flex items-center gap-2 bg-indigo-600 text-white px-6 py-3 rounded-2xl font-bold text-sm shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all active:scale-95"
            >
              <Plus size={18} />
              Add Shifts
            </button>
          </div>
        </div>

        <div className="bg-white rounded-[2rem] border border-slate-100 shadow-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse border border-slate-200">
              <thead>
                <tr className="bg-slate-50/50">
                  <th className="px-6 py-4 text-[10px] font-extrabold text-indigo-600 tracking-widest border border-slate-200">Id</th>
                  <th className="px-6 py-4 text-[10px] font-extrabold text-indigo-600 tracking-widest border border-slate-200">Shift Details</th>
                  <th className="px-6 py-4 text-[10px] font-extrabold text-indigo-600 tracking-widest text-center border border-slate-200">Late Rule</th>
                  <th className="px-6 py-4 text-[10px] font-extrabold text-indigo-600 tracking-widest text-center border border-slate-200">Half Day Rule</th>
                  <th className="px-6 py-4 text-[10px] font-extrabold text-indigo-600 tracking-widest text-center border border-slate-200">Status</th>
                  <th className="px-6 py-4 text-[10px] font-extrabold text-indigo-600 tracking-widest text-center border border-slate-200">Employees</th>
                  <th className="px-6 py-4 text-[10px] font-extrabold text-indigo-600 tracking-widest text-center border border-slate-200">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {paginatedShifts.map((shift, idx) => (
                  <tr key={shift._id} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="px-6 py-4 text-xs font-bold text-slate-400 border border-slate-200">
                      {2431 + ((currentPage - 1) * itemsPerPage) + idx}
                    </td>
                    <td className="px-6 py-4 border border-slate-200">
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-slate-900">{shift.name}</span>
                        <span className="text-[10px] font-bold text-slate-500 mt-1">{to12Hour(shift.startTime)} — {to12Hour(shift.endTime)}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-xs font-medium text-slate-600 border border-slate-200 max-w-[200px] truncate" title={shift.lateRules}>{shift.lateRules || '-'}</td>
                    <td className="px-6 py-4 text-xs font-medium text-slate-600 border border-slate-200 max-w-[200px] truncate" title={shift.halfDayRules}>{shift.halfDayRules || '-'}</td>
                    <td className="px-6 py-4 text-center border border-slate-200">
                      <span className={`px-3 py-1 rounded-full text-[10px] font-bold border ${shift.status === 'active' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-rose-50 text-rose-600 border-rose-100'}`}>
                        {shift.status === 'active' ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center border border-slate-200">
                      <span className="text-sm font-bold text-slate-700">{employeesByShift[shift._id] || 0}</span>
                    </td>
                    <td className="px-6 py-4 border border-slate-200">
                      <div className="flex items-center justify-center gap-2">
                        <button onClick={() => handleOpenModal(shift)} className="p-2 rounded-xl bg-slate-50 text-slate-400 hover:bg-indigo-600 hover:text-white transition-all shadow-sm">
                          <Edit2 size={14} />
                        </button>
                        <button onClick={() => setDeleteConfirm({ show: true, id: shift._id })} className="p-2 rounded-xl bg-slate-50 text-slate-400 hover:bg-rose-600 hover:text-white transition-all shadow-sm">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {shifts.length > itemsPerPage && (
            <div className="flex justify-between items-center px-8 py-5 bg-slate-50/50 border-t border-slate-100">
              <span className="text-xs font-bold text-slate-500">
                Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, shifts.length)} of {shifts.length} entries
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="w-8 h-8 flex items-center justify-center rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-all shadow-sm"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="text-sm font-bold text-slate-700 px-2">{currentPage} / {totalPages}</span>
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="w-8 h-8 flex items-center justify-center rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-all shadow-sm"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.98, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white w-full max-w-4xl max-h-[95vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden"
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
                        className="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-100 focus:bg-white px-4 py-4 rounded-2xl outline-none transition-all text-sm font-bold text-slate-800"
                      />
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-bold text-indigo-600 bg-white px-2 py-1 rounded-md shadow-sm border border-indigo-50">
                        {to12Hour(formData.startTime)}
                      </div>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <label className="text-[11px] font-bold text-slate-400 tracking-widest ml-1">End Time (12h format)</label>
                    <div className="relative group">
                      <input
                        type="time"
                        value={formData.endTime}
                        onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                        required
                        readOnly
                        className="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-100 focus:bg-white px-4 py-4 rounded-2xl outline-none transition-all text-sm font-bold text-slate-400 cursor-not-allowed"
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
                      <input
                        type="time"
                        value={formData.halfDayAfter}
                        onChange={(e) => setFormData({ ...formData, halfDayAfter: e.target.value })}
                        required
                        className="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-100 focus:bg-white px-4 py-4 rounded-2xl outline-none transition-all text-sm font-bold text-slate-800"
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
                      step="0.5"
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
                    <input
                      type="number"
                      value={formData.gracePeriod}
                      onChange={(e) => setFormData({ ...formData, gracePeriod: parseInt(e.target.value) })}
                      required
                      className="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-100 focus:bg-white px-5 py-4 rounded-2xl outline-none transition-all text-sm font-bold text-slate-800"
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

                <div className="space-y-3 relative">
                  <label className="text-[11px] font-bold text-slate-400 tracking-widest ml-1">Status</label>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setStatusDropdownOpen(!statusDropdownOpen)}
                      className="w-full flex items-center justify-between bg-slate-50 border-2 border-transparent focus:border-indigo-100 focus:bg-white px-5 py-4 rounded-2xl outline-none transition-all text-sm font-bold text-slate-800 text-left cursor-pointer"
                    >
                      <span className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${formData.status === 'active' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                        {formData.status === 'active' ? 'Active' : 'Inactive'}
                      </span>
                      <ChevronDown size={18} className={`text-slate-400 transition-transform duration-200 ${statusDropdownOpen ? 'rotate-180' : ''}`} />
                    </button>

                    {statusDropdownOpen && (
                      <>
                        <div
                          className="fixed inset-0 z-40"
                          onClick={() => setStatusDropdownOpen(false)}
                        />
                        <div className="absolute z-50 left-0 right-0 mt-2 bg-white border border-slate-100 rounded-2xl shadow-xl shadow-slate-100/50 overflow-hidden">
                          <div className="p-2 space-y-1">
                            <button
                              type="button"
                              onClick={() => {
                                setFormData({ ...formData, status: 'active' });
                                setStatusDropdownOpen(false);
                              }}
                              className={`w-full flex items-center gap-2 px-4 py-3 rounded-xl text-xs font-bold text-left transition-all ${formData.status === 'active'
                                ? 'bg-emerald-50 text-emerald-600'
                                : 'text-slate-700 hover:bg-slate-50 hover:text-emerald-600'
                                }`}
                            >
                              <span className="w-2 h-2 rounded-full bg-emerald-500" />
                              Active
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setFormData({ ...formData, status: 'inactive' });
                                setStatusDropdownOpen(false);
                              }}
                              className={`w-full flex items-center gap-2 px-4 py-3 rounded-xl text-xs font-bold text-left transition-all ${formData.status === 'inactive'
                                ? 'bg-rose-50 text-rose-600'
                                : 'text-slate-700 hover:bg-slate-50 hover:text-rose-600'
                                }`}
                            >
                              <span className="w-2 h-2 rounded-full bg-rose-500" />
                              Inactive
                            </button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
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
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {deleteConfirm.show && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-sm rounded-2xl shadow-2xl p-6 flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center mb-4">
                <AlertTriangle size={32} />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-2">Confirm Deletion</h3>
              <p className="text-sm font-medium text-slate-500 mb-6">
                Are you sure you want to delete this shift? This action cannot be undone.
              </p>
              <div className="flex w-full gap-3">
                <button onClick={() => setDeleteConfirm({ show: false, id: null })} className="flex-1 py-3 bg-slate-50 text-slate-600 rounded-xl font-bold text-sm hover:bg-slate-100 transition-all">
                  Cancel
                </button>
                <button onClick={executeDelete} className="flex-1 py-3 bg-rose-500 text-white rounded-xl font-bold text-sm shadow-lg shadow-rose-200 hover:bg-rose-600 transition-all">
                  Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};

export default ShiftSetup;
