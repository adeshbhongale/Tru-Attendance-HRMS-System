import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Download,
  Edit2,
  FileSpreadsheet,
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

  const [formData, setFormData] = useState({
    shiftName: '',
    startTime: '09:00',
    endTime: '18:00',
    graceMinutes: 15,
    halfDayAfter: '11:00',
    minHoursFullDay: 8,
    minHoursHalfDay: 4,
    workingHours: 9,
    weeklyOffs: ['Sunday'],
    isNightShift: false,
    status: 'active'
  });

  useEffect(() => {
    fetchData();
  }, []);

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
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const employeesByShift = useMemo(() => {
    const map = {};
    shifts.forEach(s => map[s._id] = 0);
    employees.forEach(emp => {
      const sId = typeof emp.shift === 'string' ? emp.shift : emp.shift?._id;
      if (sId && map[sId] !== undefined) map[sId]++;
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
        shiftName: shift.shiftName,
        startTime: shift.startTime,
        endTime: shift.endTime,
        graceMinutes: shift.graceMinutes,
        halfDayAfter: shift.halfDayAfter || '11:00',
        minHoursFullDay: shift.minHoursFullDay || 8,
        minHoursHalfDay: shift.minHoursHalfDay || 4,
        workingHours: shift.workingHours || 9,
        weeklyOffs: shift.weeklyOffs || ['Sunday'],
        isNightShift: shift.isNightShift || false,
        status: shift.status || 'active'
      });
    } else {
      setEditingShift(null);
      setFormData({
        shiftName: '',
        startTime: '09:00',
        endTime: '18:00',
        graceMinutes: 15,
        halfDayAfter: '11:00',
        minHoursFullDay: 8,
        minHoursHalfDay: 4,
        workingHours: 9,
        weeklyOffs: ['Sunday'],
        isNightShift: false,
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
      s.shiftName,
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
                <th className="px-6 py-4 text-[10px] font-extrabold text-indigo-600 tracking-widest border border-slate-200">Shift Name</th>
                <th className="px-6 py-4 text-[10px] font-extrabold text-indigo-600 tracking-widest text-center border border-slate-200">Start Time</th>
                <th className="px-6 py-4 text-[10px] font-extrabold text-indigo-600 tracking-widest text-center border border-slate-200">End Time</th>
                <th className="px-6 py-4 text-[10px] font-extrabold text-indigo-600 tracking-widest text-center border border-slate-200">Span to next Day</th>
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
                  <td className="px-6 py-4 text-sm font-bold text-slate-900 border border-slate-200">{shift.shiftName}</td>
                  <td className="px-6 py-4 text-center text-xs font-bold text-slate-600 border border-slate-200">{to12Hour(shift.startTime)}</td>
                  <td className="px-6 py-4 text-center text-xs font-bold text-slate-600 border border-slate-200">{to12Hour(shift.endTime)}</td>
                  <td className="px-6 py-4 text-center border border-slate-200">
                    <span className="text-[10px] font-bold px-3 py-1 rounded-full bg-slate-50 border border-slate-100 text-slate-500">
                      {shift.isNightShift ? 'Yes' : 'No'}
                    </span>
                  </td>
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

      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-[2000] flex items-start justify-center bg-slate-900/40 backdrop-blur-md p-4 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white w-full max-w-lg rounded-3xl shadow-2xl flex flex-col my-8 overflow-hidden"
            >
              <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-white z-10 shrink-0">
                <h3 className="text-xl font-bold text-slate-900">{editingShift ? 'Edit Shift' : 'Add New Shift'}</h3>
                <button onClick={() => setShowModal(false)} className="p-2 rounded-xl bg-slate-50 text-slate-400 hover:text-rose-500 transition-colors"><X size={20} /></button>
              </div>
              <div className="p-8 overflow-y-auto flex-1">
                <form onSubmit={handleSaveSubmit} className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-[11px] font-bold text-slate-400 tracking-widest ">Shift Name</label>
                    <input type="text" value={formData.shiftName} onChange={(e) => setFormData({ ...formData, shiftName: e.target.value })} required
                      className="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-100 focus:bg-white px-5 py-4 rounded-2xl outline-none text-sm font-bold" />
                  </div>
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-[11px] font-bold text-slate-400 tracking-widest ">Start Time</label>
                      <input type="time" value={formData.startTime} onChange={(e) => setFormData({ ...formData, startTime: e.target.value })} required
                        className="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-100 focus:bg-white px-5 py-4 rounded-2xl outline-none text-sm font-bold" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[11px] font-bold text-slate-400 tracking-widest ">Target Working Hours</label>
                      <input type="number" step="0.5" value={formData.workingHours} onChange={(e) => setFormData({ ...formData, workingHours: parseFloat(e.target.value) })} required
                        className="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-100 focus:bg-white px-5 py-4 rounded-2xl outline-none text-sm font-bold" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-[11px] font-bold text-slate-400 tracking-widest ">Min Hours (Full Day)</label>
                      <input type="number" step="0.5" value={formData.minHoursFullDay} onChange={(e) => setFormData({ ...formData, minHoursFullDay: parseFloat(e.target.value) })} required
                        className="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-100 focus:bg-white px-5 py-4 rounded-2xl outline-none text-sm font-bold shadow-sm" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[11px] font-bold text-slate-400 tracking-widest ">Min Hours (Half Day)</label>
                      <input type="number" step="0.5" value={formData.minHoursHalfDay} onChange={(e) => setFormData({ ...formData, minHoursHalfDay: parseFloat(e.target.value) })} required
                        className="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-100 focus:bg-white px-5 py-4 rounded-2xl outline-none text-sm font-bold shadow-sm" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[11px] font-bold text-slate-400 tracking-widest ">Grace Minutes</label>
                    <input type="number" value={formData.graceMinutes} onChange={(e) => setFormData({ ...formData, graceMinutes: parseInt(e.target.value) })} required
                      className="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-100 focus:bg-white px-5 py-4 rounded-2xl outline-none text-sm font-bold shadow-sm" />
                  </div>
                  <div className="flex items-center gap-2 pb-4">
                    <input type="checkbox" id="isNightShift" checked={formData.isNightShift} onChange={(e) => setFormData({ ...formData, isNightShift: e.target.checked })}
                      className="w-4 h-4 rounded border-slate-300 text-indigo-600" />
                    <label htmlFor="isNightShift" className="text-sm font-bold text-slate-600">Span to next Day (Night Shift)</label>
                  </div>
                  <div className="pt-2 border-t border-slate-100">
                    <button type="submit" disabled={saving} className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold text-sm shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all">
                      {saving ? <Loader2 className="animate-spin inline mr-2" /> : <Save className="inline mr-2" />}
                      {editingShift ? 'Update Shift' : 'Create Shift'}
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {deleteConfirm.show && (
          <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-sm rounded-3xl shadow-2xl p-6 flex flex-col items-center text-center">
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
    </div>
  );
};

export default ShiftSetup;
