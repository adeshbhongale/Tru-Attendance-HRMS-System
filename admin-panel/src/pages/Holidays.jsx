import { AnimatePresence, motion } from 'framer-motion';
import {
  Edit2, Loader2, Plus, Search, Trash2, X, Calendar, Save, Download, FileSpreadsheet, Upload, ChevronDown, Check
, ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react';
import { useEffect, useMemo, useState, useRef } from 'react';
import toast from 'react-hot-toast';
import api from '../api/axios';
import * as XLSX from 'xlsx';

const Holidays = () => {
  const [holidays, setHolidays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showImportFormat, setShowImportFormat] = useState(false);
  const [editingHoliday, setEditingHoliday] = useState(null);
  const [saving, setSaving] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const [deleteConfirm, setDeleteConfirm] = useState({ show: false, id: null });
  const [searchQuery, setSearchQuery] = useState('');
  const [uploading, setUploading] = useState(false);
  
  const [formData, setFormData] = useState({
    holiday_date: '',
    holiday_name: '',
    holiday_type: 'd',
    status: 'active'
  });

  const [showTypeDropdown, setShowTypeDropdown] = useState(false);
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  
  const typeDropdownRef = useRef(null);
  const statusDropdownRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    fetchHolidays();
  }, []);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (typeDropdownRef.current && !typeDropdownRef.current.contains(event.target)) {
        setShowTypeDropdown(false);
      }
      if (statusDropdownRef.current && !statusDropdownRef.current.contains(event.target)) {
        setShowStatusDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchHolidays = async () => {
    try {
      setLoading(true);
      const res = await api.get('/holidays');
      setHolidays(res.data.data);
    } catch (err) {
      toast.error('Failed to load holidays');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (holiday = null) => {
    if (holiday) {
      setEditingHoliday(holiday);
      setFormData({
        holiday_date: holiday.holiday_date.split('T')[0],
        holiday_name: holiday.holiday_name,
        holiday_type: holiday.holiday_type,
        status: holiday.status
      });
    } else {
      setEditingHoliday(null);
      setFormData({
        holiday_date: '',
        holiday_name: '',
        holiday_type: 'd',
        status: 'active'
      });
    }
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setSaving(true);
      if (editingHoliday) {
        await api.put(`/holidays/${editingHoliday._id}`, formData);
        toast.success('Holiday updated');
      } else {
        await api.post('/holidays', formData);
        toast.success('Holiday created');
      }
      fetchHolidays();
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
      await api.delete(`/holidays/${idToDelete}`);
      toast.success('Holiday deleted');
      fetchHolidays();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete holiday');
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.xlsx')) {
      toast.error('Only .xlsx files are accepted for bulk upload.');
      e.target.value = '';
      return;
    }

    try {
      setUploading(true);
      const reader = new FileReader();
      reader.onload = async (evt) => {
        try {
          const bstr = evt.target.result;
          const wb = XLSX.read(bstr, { type: 'binary' });
          const wsname = wb.SheetNames[0];
          const ws = wb.Sheets[wsname];
          const data = XLSX.utils.sheet_to_json(ws, { raw: false });
          
          if (!data || data.length === 0) {
            toast.error('The uploaded file is empty.');
            return;
          }

          // Format validation check
          const formattedData = data.map(item => ({
            holiday_date: item.holiday_date,
            holiday_name: item.holiday_name,
            holiday_type: item.holiday_type || 'd',
            status: item.status || 'active'
          }));

          const res = await api.post('/holidays/import', formattedData);
          toast.success(`Successfully imported ${res.data.count} holidays`);
          fetchHolidays();
        } catch (error) {
          toast.error('Error processing Excel file. Please ensure it matches the provided format.');
        } finally {
          setUploading(false);
          e.target.value = '';
        }
      };
      reader.readAsBinaryString(file);
    } catch (err) {
      toast.error('Upload failed');
      setUploading(false);
      e.target.value = '';
    }
  };

  const filteredHolidays = useMemo(() => {
    return holidays.filter(h => 
      h.holiday_name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [holidays, searchQuery]);

  const exportToCSV = () => {
    const headers = ['Holiday Date', 'Holiday Name', 'Holiday Type', 'Status'];
    const data = filteredHolidays.map(h => [new Date(h.holiday_date).toLocaleDateString(), h.holiday_name, h.holiday_type, h.status]);
    const csvContent = [headers, ...data].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "holidays.csv");
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const totalPages = Math.ceil(filteredHolidays.length / itemsPerPage);
  const paginatedData = filteredHolidays.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-96">
        <Loader2 className="animate-spin text-indigo-600" size={40} />
      </div>
    );
  }

  const getTypeLabel = (type) => {
    switch (type) {
      case 'd': return 'Mandatory (d)';
      case 'op': return 'Optional (op)';
      case 'rh': return 'Restricted (rh)';
      default: return type;
    }
  };

  const getTypeColor = (type) => {
    switch (type) {
      case 'd': return 'bg-rose-50 text-rose-600 border-rose-100';
      case 'op': return 'bg-emerald-50 text-emerald-600 border-emerald-100';
      case 'rh': return 'bg-amber-50 text-amber-600 border-amber-100';
      default: return 'bg-slate-50 text-slate-600 border-slate-100';
    }
  };

  return (
    <div className="space-y-6 md:space-y-8 animate-fade-up">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight m-0">Holidays</h2>
          <p className="text-slate-600 font-bold text-[13px] mt-2">Manage company holidays and events</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <button
            onClick={() => setShowImportFormat(true)}
            className="flex items-center justify-center gap-2 bg-white text-slate-600 border border-slate-200 px-4 py-3 rounded-2xl font-bold text-sm hover:bg-slate-50 transition-all active:scale-95 shadow-sm"
          >
            <FileSpreadsheet size={18} />
            Format
          </button>
          
          <input 
            type="file" 
            ref={fileInputRef} 
            className="hidden" 
            accept=".xlsx" 
            onChange={handleFileUpload} 
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex items-center justify-center gap-2 bg-white text-slate-600 border border-slate-200 px-4 py-3 rounded-2xl font-bold text-sm hover:bg-slate-50 transition-all active:scale-95 shadow-sm disabled:opacity-50"
          >
            {uploading ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
            Upload Excel
          </button>
          
          <button
            onClick={exportToCSV}
            className="flex items-center justify-center gap-2 bg-white text-slate-600 border border-slate-200 px-4 py-3 rounded-2xl font-bold text-sm hover:bg-slate-50 transition-all active:scale-95 shadow-sm"
          >
            <Download size={18} />
            Export
          </button>
          <button
            className="flex flex-1 md:flex-none items-center justify-center gap-2 bg-indigo-600 text-white px-6 py-3 rounded-2xl font-bold text-sm shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all active:scale-95"
            onClick={() => handleOpenModal()}
          >
            <Plus size={18} />
            Add Holiday
          </button>
        </div>
      </div>

      <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-xl overflow-hidden">
        <div className="p-6 border-b border-slate-50">
          <div className="relative max-w-md">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search holidays..."
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
                <th className="px-6 py-5 text-[10px] font-extrabold text-indigo-600 tracking-widest border border-slate-200">HOLIDAY DATE</th>
                <th className="px-6 py-5 text-[10px] font-extrabold text-indigo-600 tracking-widest border border-slate-200">HOLIDAY NAME</th>
                <th className="px-6 py-5 text-[10px] font-extrabold text-indigo-600 tracking-widest border border-slate-200">HOLIDAY TYPE</th>
                <th className="px-6 py-5 text-[10px] font-extrabold text-indigo-600 tracking-widest text-center border border-slate-200">STATUS</th>
                <th className="px-6 py-5 text-[10px] font-extrabold text-indigo-600 tracking-widest text-right border border-slate-200">ACTIONS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              
        {paginatedData.map((holiday) => (
      
                <tr key={holiday._id} className="hover:bg-slate-50/50 transition-colors group">
                  <td className="px-6 py-5 border border-slate-200">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                        <Calendar size={20} />
                      </div>
                      <span className="text-sm font-bold text-slate-900">
                        {new Date(holiday.holiday_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-5 border border-slate-200">
                    <span className="text-sm font-bold text-slate-900">{holiday.holiday_name}</span>
                  </td>
                  <td className="px-6 py-5 border border-slate-200">
                    <span className={`px-3 py-1 rounded-full text-[10px] font-bold tracking-wider border ${getTypeColor(holiday.holiday_type)}`}>
                      {getTypeLabel(holiday.holiday_type)}
                    </span>
                  </td>
                  <td className="px-6 py-5 text-center border border-slate-200">
                    <span className={`px-3 py-1 rounded-full text-[10px] font-bold tracking-wider border ${
                      holiday.status === 'active' 
                        ? 'bg-emerald-50 text-emerald-600 border-emerald-100' 
                        : 'bg-rose-50 text-rose-600 border-rose-100'
                    }`}>
                      {holiday.status.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-6 py-5 border border-slate-200">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => handleOpenModal(holiday)}
                        className="p-2 rounded-xl bg-slate-50 text-slate-400 hover:bg-indigo-600 hover:text-white transition-all shadow-sm"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        onClick={() => setDeleteConfirm({ show: true, id: holiday._id })}
                        className="p-2 rounded-xl bg-slate-50 text-slate-400 hover:bg-rose-600 hover:text-white transition-all shadow-sm"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredHolidays.length === 0 && (
                <tr>
                  <td colSpan="5" className="px-6 py-20 text-center">
                    <div className="flex flex-col items-center">
                      <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-300 mb-4">
                        <Calendar size={32} />
                      </div>
                      <p className="text-slate-400 font-bold text-sm">No holidays found.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {filteredHolidays.length > itemsPerPage && (
          <div className="flex justify-between items-center px-8 py-5 bg-slate-50/50 border-t border-slate-100">
            <span className="text-xs font-bold text-slate-500">
              Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, filteredHolidays.length)} of {filteredHolidays.length} entries
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
              <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center">
                <div>
                  <h3 className="text-xl font-bold text-slate-900 tracking-tighter m-0">
                    {editingHoliday ? 'Edit Holiday' : 'Add New Holiday'}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="w-10 h-10 rounded-xl bg-slate-50 text-slate-400 flex items-center justify-center hover:bg-rose-50 hover:text-rose-500 transition-all"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="p-8 overflow-y-auto"><form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-2 relative">
                  <label className="text-[11px] font-bold text-slate-400 tracking-widest ml-1">Holiday Date</label>
                  <div className="relative">
                    <input
                      type="date"
                      value={formData.holiday_date}
                      onChange={(e) => setFormData({ ...formData, holiday_date: e.target.value })}
                      required
                      className="w-full bg-slate-50 border border-slate-200 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50 px-5 py-4 rounded-2xl outline-none transition-all text-sm font-bold text-slate-800"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[11px] font-bold text-slate-400 tracking-widest ml-1">Holiday Name</label>
                  <input
                    type="text"
                    value={formData.holiday_name}
                    onChange={(e) => setFormData({ ...formData, holiday_name: e.target.value })}
                    required
                    className="w-full bg-slate-50 border border-slate-200 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50 px-5 py-4 rounded-2xl outline-none transition-all text-sm font-bold text-slate-800"
                    placeholder="e.g., Diwali"
                  />
                </div>

                <div className="space-y-2 relative" ref={typeDropdownRef}>
                  <label className="text-[11px] font-bold text-slate-400 tracking-widest ml-1">Holiday Type</label>
                  <button
                    type="button"
                    onClick={() => setShowTypeDropdown(!showTypeDropdown)}
                    className="w-full flex items-center justify-between bg-slate-50 border border-slate-200 px-5 py-4 rounded-2xl outline-none transition-all text-sm font-bold text-slate-800 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50"
                  >
                    <span>{getTypeLabel(formData.holiday_type)}</span>
                    <ChevronDown size={18} className={`text-slate-400 transition-transform ${showTypeDropdown ? 'rotate-180' : ''}`} />
                  </button>
                  <AnimatePresence>
                    {showTypeDropdown && (
                      <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="absolute z-10 w-full mt-2 bg-white border border-slate-100 shadow-xl rounded-2xl p-2"
                      >
                        {['d', 'op', 'rh'].map((type) => (
                          <button
                            key={type}
                            type="button"
                            onClick={() => {
                              setFormData({ ...formData, holiday_type: type });
                              setShowTypeDropdown(false);
                            }}
                            className={`w-full text-left px-4 py-3 rounded-xl text-sm font-bold transition-all flex items-center justify-between ${
                              formData.holiday_type === type ? 'bg-indigo-50 text-indigo-600' : 'text-slate-600 hover:bg-slate-50'
                            }`}
                          >
                            <span>{getTypeLabel(type)}</span>
                            {formData.holiday_type === type && <Check size={16} />}
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <div className="space-y-2 relative" ref={statusDropdownRef}>
                  <label className="text-[11px] font-bold text-slate-400 tracking-widest ml-1">Status</label>
                  <button
                    type="button"
                    onClick={() => setShowStatusDropdown(!showStatusDropdown)}
                    className="w-full flex items-center justify-between bg-slate-50 border border-slate-200 px-5 py-4 rounded-2xl outline-none transition-all text-sm font-bold text-slate-800 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50"
                  >
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${formData.status === 'active' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                      <span>{formData.status === 'active' ? 'Active' : 'Inactive'}</span>
                    </div>
                    <ChevronDown size={18} className={`text-slate-400 transition-transform ${showStatusDropdown ? 'rotate-180' : ''}`} />
                  </button>
                  <AnimatePresence>
                    {showStatusDropdown && (
                      <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="absolute z-10 w-full mt-2 bg-white border border-slate-100 shadow-xl rounded-2xl p-2"
                      >
                        {['active', 'inactive'].map((status) => (
                          <button
                            key={status}
                            type="button"
                            onClick={() => {
                              setFormData({ ...formData, status });
                              setShowStatusDropdown(false);
                            }}
                            className={`w-full text-left px-4 py-3 rounded-xl text-sm font-bold transition-all flex items-center justify-between ${
                              formData.status === status ? 'bg-indigo-50 text-indigo-600' : 'text-slate-600 hover:bg-slate-50'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <div className={`w-2 h-2 rounded-full ${status === 'active' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                              <span className="capitalize">{status}</span>
                            </div>
                            {formData.status === status && <Check size={16} />}
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <button
                  type="submit"
                  disabled={saving}
                  className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold text-sm shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                  {editingHoliday ? 'Update Holiday' : 'Create Holiday'}
                </button>
              </form></div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Import Format Modal */}
      <AnimatePresence>
        {showImportFormat && (
          <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-slate-900/40 backdrop-blur-md p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
            >
              <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center">
                <div>
                  <h3 className="text-xl font-bold text-slate-900 tracking-tighter m-0">
                    Holiday Import Format
                  </h3>
                  <p className="text-slate-400 text-[10px] font-bold tracking-widest mt-1">
                    EXCEL/XLSX Column mapping
                  </p>
                </div>
                <button
                  onClick={() => setShowImportFormat(false)}
                  className="w-10 h-10 rounded-xl bg-slate-50 text-slate-400 flex items-center justify-center hover:bg-rose-50 hover:text-rose-500 transition-all"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="p-8 space-y-6">
                <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="text-slate-400 text-[10px] font-extrabold tracking-widest">
                        <th className="pb-4 border border-slate-200">COLUMN NAME</th>
                        <th className="pb-4 border border-slate-200">EXAMPLE VALUE</th>
                        <th className="pb-4 border border-slate-200">DESCRIPTION</th>
                      </tr>
                    </thead>
                    <tbody className="text-slate-700 font-bold">
                      <tr>
                        <td className="py-3 text-indigo-600 border border-slate-200">holiday_date</td>
                        <td className="py-3 border border-slate-200">2024-10-29</td>
                        <td className="py-3 text-[11px] font-medium text-slate-500 border border-slate-200">YYYY-MM-DD format</td>
                      </tr>
                      <tr>
                        <td className="py-3 text-indigo-600 border border-slate-200">holiday_name</td>
                        <td className="py-3 border border-slate-200">Diwali</td>
                        <td className="py-3 text-[11px] font-medium text-slate-500 border border-slate-200">Name of the holiday</td>
                      </tr>
                      <tr>
                        <td className="py-3 text-indigo-600 border border-slate-200">holiday_type</td>
                        <td className="py-3 border border-slate-200">d</td>
                        <td className="py-3 text-[11px] font-medium text-slate-500 border border-slate-200">d: mandatory, op: optional, rh: restricted</td>
                      </tr>
                      <tr>
                        <td className="py-3 text-indigo-600 border border-slate-200">status</td>
                        <td className="py-3 border border-slate-200">active</td>
                        <td className="py-3 text-[11px] font-medium text-slate-500 border border-slate-200">active or inactive</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => setShowImportFormat(false)}
                    className="px-6 py-3 rounded-2xl font-bold text-sm text-slate-600 bg-slate-50 hover:bg-slate-100 transition-all"
                  >
                    Got it
                  </button>
                </div>
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

export default Holidays;
