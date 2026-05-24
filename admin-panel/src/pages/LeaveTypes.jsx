import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronLeft, ChevronRight,
  Download,
  Edit2,
  FileText,
  Loader2,
  Plus,
  Save,
  Search,
  ShieldCheck,
  Trash2,
  X
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../api/axios';


const LeaveTypes = () => {
  const [leaveTypes, setLeaveTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingType, setEditingType] = useState(null);
  const [saving, setSaving] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const [deleteConfirm, setDeleteConfirm] = useState({ show: false, id: null });
  const [searchQuery, setSearchQuery] = useState('');

  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const [limitTypeDropdownOpen, setLimitTypeDropdownOpen] = useState(false);
  const statusDropdownRef = useRef(null);
  const limitTypeDropdownRef = useRef(null);

  const [formData, setFormData] = useState({
    name: '',
    code: '',
    limit: 12,
    limitType: 'Yearly',
    status: 'active'
  });

  useEffect(() => {
    fetchLeaveTypes();
  }, []);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (statusDropdownRef.current && !statusDropdownRef.current.contains(e.target)) setStatusDropdownOpen(false);
      if (limitTypeDropdownRef.current && !limitTypeDropdownRef.current.contains(e.target)) setLimitTypeDropdownOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchLeaveTypes = async () => {
    try {
      setLoading(true);
      const res = await api.get('/leave-types');
      setLeaveTypes(res.data.data);
    } catch (err) {
      toast.error('Failed to load leave types');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (type = null) => {
    if (type) {
      setEditingType(type);
      setFormData({
        name: type.name,
        code: type.code,
        limit: type.limit,
        limitType: type.limitType || 'Yearly',
        status: type.status
      });
    } else {
      setEditingType(null);
      setFormData({
        name: '',
        code: '',
        limit: 12,
        limitType: 'Yearly',
        status: 'active'
      });
    }
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setSaving(true);
      if (editingType) {
        await api.put(`/leave-types/${editingType._id}`, formData);
        toast.success('Leave type updated');
      } else {
        await api.post('/leave-types', formData);
        toast.success('Leave type created');
      }
      fetchLeaveTypes();
      setShowModal(false);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Action failed');
    } finally {
      setSaving(false);
    }
  };

  const filteredLeaveTypes = useMemo(() => {
    return leaveTypes.filter(lt =>
      (lt.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (lt.code || '').toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [leaveTypes, searchQuery]);

  const exportToCSV = () => {
    const headers = ['Name', 'Limit', 'Status'];
    const data = filteredLeaveTypes.map(lt => [lt.name, lt.limit, lt.status]);
    const csvContent = [headers, ...data].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "leave_types.csv");
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

  const totalPages = Math.ceil(filteredLeaveTypes.length / itemsPerPage);
  const paginatedData = filteredLeaveTypes.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  return (
    <>
      <div className="space-y-6 md:space-y-8 animate-fade-up">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight m-0">Leave Types</h2>
            <p className="text-slate-600 font-bold text-[13px] mt-2">Configure company leave policies</p>
          </div>
          <div className="flex items-center gap-3 w-full md:w-auto">
            <button
              onClick={exportToCSV}
              className="flex items-center justify-center gap-2 bg-white text-slate-600 border border-slate-200 px-4 py-3 rounded-2xl font-bold text-sm hover:bg-slate-50 transition-all active:scale-95 shadow-sm"
            >
              <Download size={18} />
              Export CSV
            </button>
            <button
              className="flex flex-1 md:flex-none items-center justify-center gap-2 bg-indigo-600 text-white px-6 py-3 rounded-2xl font-bold text-sm shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all active:scale-95"
              onClick={() => handleOpenModal()}
            >
              <Plus size={18} />
              Add Leave Type
            </button>
          </div>
        </div>

        <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-xl overflow-hidden">
          <div className="p-6 border-b border-slate-50">
            <div className="relative max-w-md">
              <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search leave types..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-50 border border-slate-100 pl-12 pr-4 py-3 rounded-2xl text-sm font-bold text-slate-700 outline-none focus:bg-white focus:border-indigo-100 transition-all shadow-sm"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse border border-slate-200">
              <thead>
                <tr className="bg-slate-50/30">
                  <th className="px-6 py-4 text-[10px] font-extrabold text-indigo-600 tracking-widest border border-slate-200 text-center">LEAVE NAME</th>
                  <th className="px-6 py-4 text-center text-[10px] font-extrabold text-indigo-600 tracking-widest border border-slate-200">LIMIT</th>
                  <th className="px-6 py-4 text-center text-[10px] font-extrabold text-indigo-600 tracking-widest border border-slate-200">TYPE</th>
                  <th className="px-6 py-4 text-center text-[10px] font-extrabold text-indigo-600 tracking-widest border border-slate-200">STATUS</th>
                  <th className="px-6 py-4 text-[10px] font-extrabold text-indigo-600 tracking-widest border border-slate-200 text-center">ACTIONS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">

                {paginatedData.map((lt) => (

                  <tr key={lt._id} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="px-6 py-5 border border-slate-200">
                      <div className="flex items-center justify-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                          <FileText size={20} />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-900">{lt.name}</p>
                          <p className="text-sm font-bold text-slate-500 text-center">{lt.code}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-5 text-center border border-slate-200">
                      <span className="text-sm font-bold text-slate-700">{lt.limit} Days</span>
                    </td>
                    <td className="px-6 py-5 text-center border border-slate-200">
                      <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold tracking-widest ${lt.limitType === 'Monthly' ? 'bg-indigo-50 text-indigo-600' : 'bg-amber-50 text-amber-600'}`}>
                        {lt.limitType || 'Yearly'}
                      </span>
                    </td>
                    <td className="px-6 py-5 text-center border border-slate-200">
                      <span className={`px-3 py-1 rounded-full text-[10px] font-bold tracking-wider border ${lt.status === 'active'
                        ? 'bg-indigo-50 text-indigo-600 border-indigo-100'
                        : 'bg-rose-50 text-rose-600 border-rose-100'
                        }`}>
                        {lt.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-6 py-5 border border-slate-200">
                      <div className="flex justify-center gap-2">
                        <button
                          onClick={() => handleOpenModal(lt)}
                          className="p-2 rounded-xl bg-slate-50 text-slate-400 hover:bg-indigo-600 hover:text-white transition-all shadow-sm"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          onClick={() => setDeleteConfirm({ show: true, id: lt._id })}
                          className="p-2 rounded-xl bg-slate-50 text-slate-400 hover:bg-rose-600 hover:text-white transition-all shadow-sm"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredLeaveTypes.length === 0 && (
                  <tr>
                    <td colSpan="4" className="px-6 py-20 text-center border border-slate-200">
                      <div className="flex flex-col items-center">
                        <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-300 mb-4">
                          <ShieldCheck size={32} />
                        </div>
                        <p className="text-slate-400 font-bold text-sm">No leave types configured.</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {filteredLeaveTypes.length > itemsPerPage && (
            <div className="flex justify-between items-center px-8 py-5 bg-slate-50/50 border-t border-slate-100">
              <span className="text-xs font-bold text-slate-500">
                Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, filteredLeaveTypes.length)} of {filteredLeaveTypes.length} entries
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
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white w-full max-w-4xl max-h-[95vh] overflow-y-auto rounded-2xl shadow-2xl flex flex-col"
            >
              <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-white z-10 shrink-0 sticky top-0">
                <div>
                  <h3 className="text-xl font-bold text-slate-900 tracking-tighter m-0">
                    {editingType ? 'Edit Leave Type' : 'Add New Leave Type'}
                  </h3>
                  <p className="text-[11px] font-bold text-slate-500 mt-1">Configure parameters for this leave type</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="w-10 h-10 rounded-xl bg-white border border-slate-100 text-slate-400 flex items-center justify-center hover:bg-rose-50 hover:text-rose-500 hover:border-rose-100 transition-all shadow-sm"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="p-8 overflow-y-auto"><form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[11px] font-bold text-slate-400 tracking-widest ml-1">Leave Name</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      required
                      className="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-100 focus:bg-white px-5 py-4 rounded-2xl outline-none transition-all text-sm font-bold text-slate-800"
                      placeholder="e.g., Casual Leave"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[11px] font-bold text-slate-400 tracking-widest ml-1">Short Form</label>
                    <input
                      type="text"
                      value={formData.code}
                      onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                      required
                      className="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-100 focus:bg-white px-5 py-4 rounded-2xl outline-none transition-all text-sm font-bold text-slate-800"
                      placeholder="e.g., CL"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[11px] font-bold text-slate-400 tracking-widest ml-1">Limit (Days)</label>
                    <input
                      type="number"
                      value={formData.limit}
                      onChange={(e) => setFormData({ ...formData, limit: parseInt(e.target.value) })}
                      required
                      className="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-100 focus:bg-white px-5 py-4 rounded-2xl outline-none transition-all text-sm font-bold text-slate-800"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[11px] font-bold text-slate-400 tracking-widest ml-1">Limit Type</label>
                    <div className="relative" ref={limitTypeDropdownRef}>
                      <div
                        onClick={() => setLimitTypeDropdownOpen(!limitTypeDropdownOpen)}
                        className={`w-full flex items-center justify-between px-5 py-4 rounded-2xl cursor-pointer border-2 transition-all ${limitTypeDropdownOpen ? 'border-indigo-100 bg-white' : 'border-transparent bg-slate-50 hover:border-indigo-50'}`}
                      >
                        <span className="text-sm font-bold text-slate-800">{formData.limitType}</span>
                        <ChevronDown size={18} className={`text-slate-400 transition-transform ${limitTypeDropdownOpen ? 'rotate-180' : ''}`} />
                      </div>
                      <AnimatePresence>
                        {limitTypeDropdownOpen && (
                          <motion.div
                            initial={{ opacity: 0, y: 10, scale: 0.95 }}
                            animate={{ opacity: 1, y: 10, scale: 1 }}
                            exit={{ opacity: 0, y: 10, scale: 0.95 }}
                            className="absolute left-0 right-0 top-full mt-2 bg-white border border-slate-100 rounded-2xl shadow-xl z-50 overflow-hidden p-2"
                          >
                            {['Monthly', 'Yearly'].map((type) => (
                              <div
                                key={type}
                                onClick={() => { setFormData({ ...formData, limitType: type }); setLimitTypeDropdownOpen(false); }}
                                className={`flex items-center justify-between px-4 py-3 rounded-xl cursor-pointer transition-all ${formData.limitType === type ? 'bg-indigo-50 text-indigo-700' : 'hover:bg-slate-50 text-slate-700'}`}
                              >
                                <span className="text-sm font-bold">{type}</span>
                                {formData.limitType === type && <Check size={16} className="text-indigo-600" />}
                              </div>
                            ))}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[11px] font-bold text-slate-400 tracking-widest ml-1">Status</label>
                  <div className="relative" ref={statusDropdownRef}>
                    <div
                      onClick={() => setStatusDropdownOpen(!statusDropdownOpen)}
                      className={`w-full flex items-center justify-between px-5 py-4 rounded-2xl cursor-pointer border-2 transition-all ${statusDropdownOpen ? 'border-indigo-100 bg-white' : 'border-transparent bg-slate-50 hover:border-indigo-50'}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-3 h-3 rounded-full ${formData.status === 'active' ? 'bg-emerald-500' : 'bg-rose-500'}`}></div>
                        <span className="text-sm font-bold text-slate-800">
                          {formData.status === 'active' ? 'Active (Visible)' : 'Inactive (Hidden)'}
                        </span>
                      </div>
                      <ChevronDown size={18} className={`text-slate-400 transition-transform ${statusDropdownOpen ? 'rotate-180' : ''}`} />
                    </div>

                    <AnimatePresence>
                      {statusDropdownOpen && (
                        <motion.div
                          initial={{ opacity: 0, y: 10, scale: 0.95 }}
                          animate={{ opacity: 1, y: 10, scale: 1 }}
                          exit={{ opacity: 0, y: 10, scale: 0.95 }}
                          className="absolute left-0 right-0 top-full mt-2 bg-white border border-slate-100 rounded-2xl shadow-xl z-50 overflow-hidden p-2"
                        >
                          <div
                            onClick={() => { setFormData({ ...formData, status: 'active' }); setStatusDropdownOpen(false); }}
                            className={`flex items-center justify-between px-4 py-3 rounded-xl cursor-pointer transition-all ${formData.status === 'active' ? 'bg-indigo-50 text-indigo-700' : 'hover:bg-slate-50 text-slate-700'}`}
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500"></div>
                              <div>
                                <p className="text-sm font-bold">Active</p>
                                <p className="text-[10px] font-bold opacity-70">Will be shown in employee apps</p>
                              </div>
                            </div>
                            {formData.status === 'active' && <Check size={16} className="text-indigo-600" />}
                          </div>

                          <div
                            onClick={() => { setFormData({ ...formData, status: 'inactive' }); setStatusDropdownOpen(false); }}
                            className={`flex items-center justify-between px-4 py-3 rounded-xl cursor-pointer transition-all mt-1 ${formData.status === 'inactive' ? 'bg-indigo-50 text-indigo-700' : 'hover:bg-slate-50 text-slate-700'}`}
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-2.5 h-2.5 rounded-full bg-rose-500"></div>
                              <div>
                                <p className="text-sm font-bold">Inactive</p>
                                <p className="text-[10px] font-bold opacity-70">Hidden from leave dashboard</p>
                              </div>
                            </div>
                            {formData.status === 'inactive' && <Check size={16} className="text-indigo-600" />}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                <div className="flex gap-4 pt-4">
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
                    className="flex-[2] py-4 bg-indigo-600 text-white rounded-2xl font-bold text-sm shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                    {editingType ? 'Update Leave Type' : 'Create Leave Type'}
                  </button>
                </div>
              </form></div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>


      <AnimatePresence>
        {deleteConfirm.show && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-sm rounded-3xl shadow-2xl p-6 flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center mb-4">
                <AlertTriangle size={32} />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-2">Confirm Deletion</h3>
              <p className="text-sm font-medium text-slate-500 mb-6">
                Are you sure you want to delete this record? This action cannot be undone.
              </p>
              <div className="flex w-full gap-3">
                <button onClick={() => setDeleteConfirm({ show: false, id: null })} className="flex-1 py-3 bg-slate-50 text-slate-600 rounded-xl font-bold text-sm hover:bg-slate-100 transition-all">
                  Cancel
                </button>
                <button onClick={() => { handleDelete(deleteConfirm.id); setDeleteConfirm({ show: false, id: null }); }} className="flex-1 py-3 bg-rose-500 text-white rounded-xl font-bold text-sm shadow-lg shadow-rose-200 hover:bg-rose-600 transition-all">
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

export default LeaveTypes;
