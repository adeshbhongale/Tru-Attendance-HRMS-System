import { AnimatePresence, motion } from 'framer-motion';
import {
  Edit2,
  Loader2,
  Plus,
  Search,
  Trash2,
  X,
  Briefcase,
  Save,
  Download
, ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../api/axios';


const Designations = () => {
  const [designations, setDesignations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingDesig, setEditingDesig] = useState(null);
  const [saving, setSaving] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const [deleteConfirm, setDeleteConfirm] = useState({ show: false, id: null });
  const [searchQuery, setSearchQuery] = useState('');
  
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    status: 'active'
  });

  useEffect(() => {
    fetchDesignations();
  }, []);

  const fetchDesignations = async () => {
    try {
      setLoading(true);
      const res = await api.get('/designations');
      setDesignations(res.data.data);
    } catch (err) {
      toast.error('Failed to load designations');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (desig = null) => {
    if (desig) {
      setEditingDesig(desig);
      setFormData({
        name: desig.name,
        description: desig.description || '',
        status: desig.status
      });
    } else {
      setEditingDesig(null);
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
      if (editingDesig) {
        await api.put(`/designations/${editingDesig._id}`, formData);
        toast.success('Designation updated');
      } else {
        await api.post('/designations', formData);
        toast.success('Designation created');
      }
      fetchDesignations();
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
      await api.delete(`/designations/${idToDelete}`);
      toast.success('Designation deleted');
      fetchDesignations();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete designation');
    }
  };

  const toggleStatus = async (desig) => {
    try {
      const newStatus = desig.status === 'active' ? 'inactive' : 'active';
      await api.put(`/designations/${desig._id}`, { status: newStatus });
      toast.success(`Designation ${newStatus === 'active' ? 'activated' : 'deactivated'}`);
      fetchDesignations();
    } catch (err) {
      toast.error('Failed to update status');
    }
  };

  const filteredDesignations = useMemo(() => {
    return designations.filter(d => 
      d.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.description?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [designations, searchQuery]);

  const exportToCSV = () => {
    const headers = ['Name', 'Description', 'Status'];
    const data = filteredDesignations.map(d => [d.name, d.description || '', d.status]);
    const csvContent = [headers, ...data].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "designations.csv");
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

  const totalPages = Math.ceil(filteredDesignations.length / itemsPerPage);
  const paginatedData = filteredDesignations.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  return (
    <div className="space-y-6 md:space-y-8 animate-fade-up">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight m-0">Designations</h2>
          <p className="text-slate-600 font-bold text-[13px] mt-2">Manage employee roles and titles</p>
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
            Add Designation
          </button>
        </div>
      </div>

      <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-xl overflow-hidden">
        <div className="p-6 border-b border-slate-50">
          <div className="relative max-w-md">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search designations..."
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
                <th className="px-6 py-5 text-[10px] font-extrabold text-indigo-600 tracking-widest border border-slate-200">DESIGNATION NAME</th>
                <th className="px-6 py-5 text-[10px] font-extrabold text-indigo-600 tracking-widest border border-slate-200">DESCRIPTION</th>
                <th className="px-6 py-5 text-[10px] font-extrabold text-indigo-600 tracking-widest text-center border border-slate-200">STATUS</th>
                <th className="px-6 py-5 text-[10px] font-extrabold text-indigo-600 tracking-widest text-right border border-slate-200">ACTIONS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              
        {paginatedData.map((desig) => (
      
                <tr key={desig._id} className="hover:bg-slate-50/50 transition-colors group">
                  <td className="px-6 py-5 border border-slate-200">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                        <Briefcase size={20} />
                      </div>
                      <span className="text-sm font-bold text-slate-900">{desig.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-5 border border-slate-200">
                    <p className="text-sm text-slate-500 max-w-xs truncate">{desig.description || 'No description'}</p>
                  </td>
                  <td className="px-6 py-5 text-center border border-slate-200">
                    <button
                      onClick={() => toggleStatus(desig)}
                      className={`px-3 py-1 rounded-full text-[10px] font-bold tracking-wider border ${
                        desig.status === 'active' 
                          ? 'bg-emerald-50 text-emerald-600 border-emerald-100' 
                          : 'bg-rose-50 text-rose-600 border-rose-100'
                      }`}
                    >
                      {desig.status.toUpperCase()}
                    </button>
                  </td>
                  <td className="px-6 py-5 border border-slate-200">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => handleOpenModal(desig)}
                        className="p-2 rounded-xl bg-slate-50 text-slate-400 hover:bg-indigo-600 hover:text-white transition-all shadow-sm"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        onClick={() => setDeleteConfirm({ show: true, id: desig._id })}
                        className="p-2 rounded-xl bg-slate-50 text-slate-400 hover:bg-rose-600 hover:text-white transition-all shadow-sm"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredDesignations.length === 0 && (
                <tr>
                  <td colSpan="4" className="px-6 py-20 text-center">
                    <div className="flex flex-col items-center">
                      <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-300 mb-4">
                        <Briefcase size={32} />
                      </div>
                      <p className="text-slate-400 font-bold text-sm">No designations found.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {filteredDesignations.length > itemsPerPage && (
          <div className="flex justify-between items-center px-8 py-5 bg-slate-50/50 border-t border-slate-100">
            <span className="text-xs font-bold text-slate-500">
              Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, filteredDesignations.length)} of {filteredDesignations.length} entries
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
          <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-slate-900/40 backdrop-blur-md p-0 sm:p-4 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.98, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: 20 }}
              className="bg-white w-full max-w-7xl h-full sm:h-[95vh] sm:rounded-[3rem] shadow-2xl overflow-hidden flex flex-col"
            >
              <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center">
                <div>
                  <h3 className="text-xl font-bold text-slate-900 tracking-tighter m-0">
                    {editingDesig ? 'Edit Designation' : 'Add New Designation'}
                  </h3>
                </div>
                <button
                  onClick={() => setShowModal(false)}
                  className="w-10 h-10 rounded-xl bg-slate-50 text-slate-400 flex items-center justify-center hover:bg-rose-50 hover:text-rose-500 transition-all"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="p-8 overflow-y-auto"><form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[11px] font-bold text-slate-400 tracking-widest ml-1">Designation Name</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                    className="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-100 focus:bg-white px-5 py-4 rounded-2xl outline-none transition-all text-sm font-bold text-slate-800"
                    placeholder="e.g., Software Engineer"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[11px] font-bold text-slate-400 tracking-widest ml-1">Description</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-100 focus:bg-white px-5 py-4 rounded-2xl outline-none transition-all text-sm font-bold text-slate-800 min-h-[100px] resize-none"
                    placeholder="Brief description of the designation..."
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[11px] font-bold text-slate-400 tracking-widest ml-1">Status</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-100 focus:bg-white px-5 py-4 rounded-2xl outline-none transition-all text-sm font-bold text-slate-800 appearance-none"
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>

                <button
                  type="submit"
                  disabled={saving}
                  className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold text-sm shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                  {editingDesig ? 'Update Designation' : 'Create Designation'}
                </button>
              </form></div>
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
    </div>
  );
};

export default Designations;
