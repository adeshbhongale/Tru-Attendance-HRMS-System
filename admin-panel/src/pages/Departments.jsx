import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  Building2,
  ChevronLeft, ChevronRight, ChevronDown,
  Download,
  Edit2,
  Loader2,
  Plus,
  Save,
  Search,
  Trash2,
  X
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../api/axios';


const Departments = () => {
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingDept, setEditingDept] = useState(null);
  const [saving, setSaving] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const [deleteConfirm, setDeleteConfirm] = useState({ show: false, id: null });
  const [searchQuery, setSearchQuery] = useState('');
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    status: 'active'
  });

  useEffect(() => {
    fetchDepartments();
  }, []);

  const fetchDepartments = async () => {
    try {
      setLoading(true);
      const res = await api.get('/departments');
      setDepartments(res.data.data);
    } catch (err) {
      toast.error('Failed to load departments');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (dept = null) => {
    if (dept) {
      setEditingDept(dept);
      setFormData({
        name: dept.name,
        description: dept.description || '',
        status: dept.status
      });
    } else {
      setEditingDept(null);
      setFormData({
        name: '',
        description: '',
        status: 'active'
      });
    }
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setSaving(true);
      if (editingDept) {
        await api.put(`/departments/${editingDept._id}`, formData);
        toast.success('Department updated');
      } else {
        await api.post('/departments', formData);
        toast.success('Department created');
      }
      fetchDepartments();
      setShowModal(false);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Action failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!deleteConfirm.id) return;
    const idToDelete = deleteConfirm.id;
    try {
      await api.delete(`/departments/${idToDelete}`);
      toast.success('Department deleted');
      fetchDepartments();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete department');
    }
  };

  const toggleStatus = async (dept) => {
    try {
      const newStatus = dept.status === 'active' ? 'inactive' : 'active';
      await api.put(`/departments/${dept._id}`, { status: newStatus });
      toast.success(`Department ${newStatus === 'active' ? 'activated' : 'deactivated'}`);
      fetchDepartments();
    } catch (err) {
      toast.error('Failed to update status');
    }
  };

  const filteredDepartments = useMemo(() => {
    return departments.filter(d =>
      (d.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.description?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [departments, searchQuery]);

  const exportToCSV = () => {
    const headers = ['Name', 'Description', 'Employees Count', 'Status'];
    const data = filteredDepartments.map(d => [d.name, d.description || '', d.employeeCount || 0, d.status]);
    const csvContent = [headers, ...data].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "departments.csv");
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

  const totalPages = Math.ceil(filteredDepartments.length / itemsPerPage);
  const paginatedData = filteredDepartments.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  return (
    <>
    <div className="space-y-6 md:space-y-8 animate-fade-up">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight m-0">Departments</h2>
          <p className="text-slate-600 font-bold text-[13px] mt-2">Manage your organization's departments</p>
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
            Add Department
          </button>
        </div>
      </div>

      <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-xl overflow-hidden">
        <div className="p-6 border-b border-slate-50">
          <div className="relative max-w-md">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search departments..."
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
                <th className="px-6 py-5 text-[10px] font-extrabold text-indigo-600 tracking-widest border border-slate-200">DEPARTMENT NAME</th>
                <th className="px-6 py-5 text-[10px] font-extrabold text-indigo-600 tracking-widest border border-slate-200">DESCRIPTION</th>
                <th className="px-6 py-5 text-[10px] font-extrabold text-indigo-600 tracking-widest text-center border border-slate-200">EMPLOYEES COUNT</th>
                <th className="px-6 py-5 text-[10px] font-extrabold text-indigo-600 tracking-widest text-center border border-slate-200">STATUS</th>
                <th className="px-6 py-5 text-[10px] font-extrabold text-indigo-600 tracking-widest text-right border border-slate-200">ACTIONS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">

              {paginatedData.map((dept) => (

                <tr key={dept._id} className="hover:bg-slate-50/50 transition-colors group">
                  <td className="px-6 py-5 border border-slate-200">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                        <Building2 size={20} />
                      </div>
                      <span className="text-sm font-bold text-slate-900">{dept.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-5 border border-slate-200">
                    <p className="text-sm text-slate-500 max-w-xs truncate">{dept.description || 'No description'}</p>
                  </td>
                  <td className="px-6 py-5 text-center border border-slate-200">
                    <span className="text-sm font-bold text-slate-700">{dept.employeeCount ?? 0}</span>
                  </td>
                  <td className="px-6 py-5 text-center border border-slate-200">
                    <button
                      onClick={() => toggleStatus(dept)}
                      className={`px-3 py-1 rounded-full text-[10px] font-bold tracking-wider border ${dept.status === 'active'
                        ? 'bg-emerald-50 text-emerald-600 border-emerald-100'
                        : 'bg-rose-50 text-rose-600 border-rose-100'
                        }`}
                    >
                      {dept.status.toUpperCase()}
                    </button>
                  </td>
                  <td className="px-6 py-5 border border-slate-200">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => handleOpenModal(dept)}
                        className="p-2 rounded-xl bg-slate-50 text-slate-400 hover:bg-indigo-600 hover:text-white transition-all shadow-sm"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        onClick={() => setDeleteConfirm({ show: true, id: dept._id })}
                        className="p-2 rounded-xl bg-slate-50 text-slate-400 hover:bg-rose-600 hover:text-white transition-all shadow-sm"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredDepartments.length === 0 && (
                <tr>
                  <td colSpan="5" className="px-6 py-20 text-center">
                    <div className="flex flex-col items-center">
                      <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-300 mb-4">
                        <Building2 size={32} />
                      </div>
                      <p className="text-slate-400 font-bold text-sm">No departments found.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {filteredDepartments.length > itemsPerPage && (
          <div className="flex justify-between items-center px-8 py-5 bg-slate-50/50 border-t border-slate-100">
            <span className="text-xs font-bold text-slate-500">
              Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, filteredDepartments.length)} of {filteredDepartments.length} entries
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
              exit={{ opacity: 0, scale: 0.98, y: 20 }}
              className="bg-white w-full max-w-4xl max-h-[95vh] overflow-y-auto rounded-2xl shadow-2xl flex flex-col"
            >
              <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center sticky top-0 bg-white z-10 shrink-0">
                <div>
                  <h3 className="text-xl font-bold text-slate-900 tracking-tighter m-0">
                    {editingDept ? 'Edit Department' : 'Add New Department'}
                  </h3>
                </div>
                <button
                  onClick={() => setShowModal(false)}
                  className="w-10 h-10 rounded-xl bg-slate-50 text-slate-400 flex items-center justify-center hover:bg-rose-50 hover:text-rose-500 transition-all"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="p-8 overflow-y-auto">
                <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[11px] font-bold text-slate-400 tracking-widest ml-1">Department Name</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                    className="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-100 focus:bg-white px-5 py-4 rounded-2xl outline-none transition-all text-sm font-bold text-slate-800"
                    placeholder="e.g., Engineering"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[11px] font-bold text-slate-400 tracking-widest ml-1">Description</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-100 focus:bg-white px-5 py-4 rounded-2xl outline-none transition-all text-sm font-bold text-slate-800 min-h-[100px] resize-none"
                    placeholder="Brief description of the department..."
                  />
                </div>

                <div className="space-y-2 relative">
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
                              className={`w-full flex items-center gap-2 px-4 py-3 rounded-xl text-xs font-bold text-left transition-all ${
                                formData.status === 'active'
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
                              className={`w-full flex items-center gap-2 px-4 py-3 rounded-xl text-xs font-bold text-left transition-all ${
                                formData.status === 'inactive'
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

                <button
                  type="submit"
                  disabled={saving}
                  className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold text-sm shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                  {editingDept ? 'Update Department' : 'Create Department'}
                </button>
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

export default Departments;
