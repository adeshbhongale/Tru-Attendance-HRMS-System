import { AnimatePresence, motion } from 'framer-motion';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  AlertCircle,
  ArrowUp,
  Calendar,
  ChevronDown,
  ChevronLeft, ChevronRight,
  Clock,
  Copy,
  Download,
  Edit2,
  Eye,
  EyeOff,
  FileText,
  Filter,
  Loader2, Mail, Phone,
  Save,
  Search,
  Trash2,
  Upload,
  UserPlus,
  X
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import api, { IMAGE_BASE_URL } from '../api/axios';
import CalendarPicker from '../components/CalendarPicker';

const Employees = () => {
  const navigate = useNavigate();

  const getFullImageUrl = (path) => {
    if (!path) return null;
    if (path.startsWith('http')) return path;
    return `${IMAGE_BASE_URL}/${path.replace(/\\/g, '/')}`;
  };

  const formatTime12h = (timeStr) => {
    if (!timeStr || timeStr === 'NA') return 'NA';
    try {
      const [hours, minutes] = timeStr.split(':');
      const h = parseInt(hours);
      const ampm = h >= 12 ? 'PM' : 'AM';
      const h12 = h % 12 || 12;
      return `${h12}:${minutes} ${ampm}`;
    } catch (e) {
      return timeStr;
    }
  };
  const [employees, setEmployees] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [saving, setSaving] = useState(false);
  const [confirmData, setConfirmData] = useState({ show: false, type: '', action: null, message: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef(null);

  // Advanced Filters State
  const [filters, setFilters] = useState({
    status: 'all',
    department: 'all',
    shift: 'all'
  });
  const [activeFilterDropdown, setActiveFilterDropdown] = useState(null);
  const [activeModalDropdown, setActiveModalDropdown] = useState(null);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const filteredEmployees = employees.filter(emp => {
    const matchesSearch =
      emp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      emp.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      emp.mobile.includes(searchTerm) ||
      (emp.department && emp.department.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesStatus = filters.status === 'all' ||
      (filters.status === 'online' ? emp.isOnline : !emp.isOnline);

    const matchesDept = filters.department === 'all' ||
      (emp.department && emp.department.toLowerCase() === filters.department.toLowerCase());

    const matchesShift = filters.shift === 'all' ||
      (emp.shift?._id === filters.shift || emp.shift === filters.shift);

    return matchesSearch && matchesStatus && matchesDept && matchesShift;
  });

  const totalPages = Math.ceil(filteredEmployees.length / itemsPerPage);

  const formatDateString = (date) => {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const [selectedDate, setSelectedDate] = useState(formatDateString(new Date()));
  const [showCalendar, setShowCalendar] = useState(false);
  const calendarRef = useRef(null);
  const filterRef = useRef(null);

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    mobile: '',
    password: '',
    department: '',
    designation: '',
    shift: '',
    role: 'employee',
    status: 'active'
  });

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (calendarRef.current && !calendarRef.current.contains(event.target)) {
        setShowCalendar(false);
      }
      if (filterRef.current && !filterRef.current.contains(event.target)) {
        setActiveFilterDropdown(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [empRes, shiftRes] = await Promise.all([
        api.get('/employees'),
        api.get('/shifts')
      ]);
      setEmployees(empRes.data.data);
      setShifts(shiftRes.data.data);
    } catch (err) {
      toast.error('Failed to load staff data');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = (text) => {
    navigator.clipboard.writeText(text);
    toast.success('Text copied');
  };

  const handleOpenModal = (emp = null) => {
    setShowPassword(false);
    if (emp) {
      setEditingEmployee(emp);
      setFormData({
        name: emp.name,
        email: emp.email,
        mobile: emp.mobile,
        password: '',
        department: emp.department || '',
        designation: emp.designation || '',
        shift: emp.shift?._id || emp.shift || '',
        role: emp.role || 'employee',
        status: emp.status || 'active',
        profileImage: emp.profileImage || ''
      });
    } else {
      setEditingEmployee(null);
      setFormData({
        name: '',
        email: '',
        mobile: '',
        password: '',
        department: '',
        designation: '',
        shift: shifts[0]?._id || '',
        role: 'employee',
        status: 'active',
        profileImage: ''
      });
    }
    setShowModal(true);
  };

  const handleMobileChange = (e) => {
    const val = e.target.value.replace(/\D/g, '').slice(0, 10);
    setFormData({ ...formData, mobile: val });
  };

  const handleExport = async () => {
    try {
      setIsExporting(true);
      const response = await api.get('/employees/export', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'Employees_Credentials_List.xlsx');
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success('Employee list exported');
    } catch (err) {
      toast.error('Failed to export employee data');
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportPDF = () => {
    try {
      setIsExporting(true);
      const doc = new jsPDF('l', 'mm', 'a4');

      // Header Section
      doc.setFontSize(22);
      doc.setTextColor(30, 41, 59); // slate-800
      doc.text('Employee List', 14, 22);

      doc.setFontSize(10);
      doc.setTextColor(100, 116, 139); // slate-500
      doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 30);

      const tableData = filteredEmployees.map(emp => [
        emp._id,
        emp.name,
        emp.email,
        emp.mobile,
        emp.department || 'N/A',
        emp.designation || 'N/A',
        emp.shift?.name || 'General Shift',
        new Date(emp.createdAt).toLocaleDateString()
      ]);

      autoTable(doc, {
        startY: 38,
        head: [['Staff ID', 'Name', 'Email', 'Mobile', 'Department', 'Designation', 'Shift', 'Joined']],
        body: tableData,
        theme: 'striped',
        headStyles: {
          fillColor: [79, 70, 229], // indigo-600
          fontSize: 9,
          fontStyle: 'bold',
          halign: 'center'
        },
        bodyStyles: {
          fontSize: 8,
          textColor: [51, 65, 85], // slate-700
          halign: 'center'
        },
        columnStyles: {
          0: { cellWidth: 35, fontStyle: 'bold' },
          1: { cellWidth: 35 },
          2: { cellWidth: 45 },
          3: { cellWidth: 30 }
        },
        margin: { top: 40 },
        didDrawPage: (data) => {
          doc.setFontSize(8);
          doc.text(`Page ${data.pageNumber}`, doc.internal.pageSize.width - 20, doc.internal.pageSize.height - 10);
        }
      });

      doc.save('Employee_Directory_Report.pdf');
      toast.success('PDF report generated');
    } catch (err) {
      console.error('PDF Export Error:', err);
      toast.error('Failed to export PDF');
    } finally {
      setIsExporting(false);
    }
  };

  const handleBulkUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const bulkFormData = new FormData();
    bulkFormData.append('file', file);

    try {
      setIsUploading(true);
      const res = await api.post('/employees/bulk-upload', bulkFormData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      toast.success(res.data.message || 'Staff members uploaded successfully');
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Bulk upload failed');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
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
    if (formData.mobile.length !== 10) {
      return toast.error('Mobile number must be exactly 10 digits');
    }
    if (!editingEmployee && !formData.password) {
      return toast.error('Password is required for new staff members');
    }

    const action = editingEmployee ? 'update' : 'add';
    requestActionConfirm(
      'save',
      async () => {
        try {
          setSaving(true);
          const data = new FormData();
          Object.keys(formData).forEach(key => {
            if (key === 'profileImage' && typeof formData[key] === 'string') return;
            if (formData[key] !== undefined && formData[key] !== null) {
              data.append(key, formData[key]);
            }
          });

          if (editingEmployee) {
            await api.put(`/employees/${editingEmployee._id}`, data, {
              headers: { 'Content-Type': 'multipart/form-data' }
            });
            toast.success('Staff details updated');
          } else {
            await api.post('/employees', data, {
              headers: { 'Content-Type': 'multipart/form-data' }
            });
            toast.success('New staff member added');
          }
          fetchData();
          setShowModal(false);
        } catch (err) {
          toast.error(err.response?.data?.message || 'Action failed');
        } finally {
          setSaving(false);
        }
      },
      `Are you sure you want to ${action} this staff member?`
    );
  };

  const handleDeleteConfirm = (id) => {
    requestActionConfirm(
      'delete',
      async () => {
        try {
          await api.delete(`/employees/${id}`);
          toast.success('Staff member removed');
          fetchData();
        } catch (err) {
          toast.error('Failed to delete staff member');
        }
      },
      'This will remove the staff member. Are you sure?'
    );
  };

  const stats = {
    total: filteredEmployees.length,
    active: filteredEmployees.filter(e => e.isOnline).length
  };

  const distinctDepartments = [...new Set(employees.map(e => e.department).filter(Boolean))];

  if (loading) {
    return (
      <div className="flex justify-center items-center h-96">
        <Loader2 className="animate-spin text-indigo-600" size={40} />
      </div>
    );
  }

  return (
    <div className="space-y-6 md:space-y-8 animate-fade-up max-w-[calc(100vw-350px)] lg:max-w-full overflow-hidden">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight m-0">Staff Directory</h2>
          <p className="text-slate-600 font-bold text-[13px] mt-2">Manage staff profiles, shifts, and access credentials</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleBulkUpload}
            className="hidden"
            accept=".xlsx, .xls, .csv"
          />
          <button
            className="flex items-center gap-2 bg-white text-slate-700 border border-slate-200 px-5 py-3 rounded-2xl font-bold text-xs shadow-sm hover:bg-slate-50 transition-all active:scale-95 disabled:opacity-50"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
          >
            {isUploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
            Bulk Upload
          </button>
          <div className="relative group/export">
            <button
              className="flex items-center gap-2 bg-white text-slate-700 border border-slate-200 px-5 py-3 rounded-2xl font-bold text-xs shadow-sm hover:bg-slate-50 transition-all active:scale-95 disabled:opacity-50"
              disabled={isExporting}
            >
              {isExporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
              Export Data
              <ChevronDown size={14} className="text-slate-400 group-hover/export:rotate-180 transition-transform" />
            </button>
            <div className="absolute top-full right-0 mt-2 w-48 bg-white border border-slate-100 rounded-2xl shadow-2xl z-[150] p-2 opacity-0 invisible group-hover/export:opacity-100 group-hover/export:visible transition-all">
              <button onClick={handleExport} className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-emerald-50 text-slate-700 hover:text-emerald-600 transition-all text-xs font-bold">
                <div className="p-2 bg-emerald-100 rounded-lg text-emerald-600"><Download size={14} /></div>
                Excel Export
              </button>
              <button onClick={handleExportPDF} className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-rose-50 text-slate-700 hover:text-rose-600 transition-all text-xs font-bold">
                <div className="p-2 bg-rose-100 rounded-lg text-rose-600"><FileText size={14} /></div>
                PDF Export
              </button>
            </div>
          </div>
          <button
            className="flex items-center gap-2 bg-indigo-600 text-white px-6 py-3 rounded-2xl font-bold text-sm shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all active:scale-95"
            onClick={() => handleOpenModal()}
          >
            <UserPlus size={18} />
            Add Staff Member
          </button>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row items-center gap-6 bg-white p-4 rounded-3xl border border-slate-100 shadow-sm">
        <div className="flex items-center gap-4 flex-1 w-full sm:w-auto">
          <div className="flex-1 min-w-[140px] bg-slate-50 p-4 rounded-2xl border border-slate-100 flex flex-col items-center justify-center text-center">
            <div className="text-xl font-bold text-slate-900 tracking-tighter">{stats.total}</div>
            <div className="text-[9px] font-bold text-slate-400 tracking-widest mt-1">Total Staff</div>
          </div>
          <div className="flex-1 min-w-[140px] bg-indigo-50/50 p-4 rounded-2xl border border-indigo-100/50 flex flex-col items-center justify-center text-center">
            <div className="text-xl font-bold text-indigo-600 tracking-tighter">{stats.active}</div>
            <div className="text-[9px] font-bold text-indigo-400 tracking-widest mt-1">Online Sessions</div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 w-full lg:w-auto">
          <div className="relative" ref={calendarRef}>
            <div
              className="flex items-center gap-3 bg-white border border-slate-200 px-5 py-3 rounded-2xl shadow-sm cursor-pointer hover:bg-slate-50 transition-all min-w-[160px]"
              onClick={() => setShowCalendar(!showCalendar)}
            >
              <Calendar size={14} className="text-indigo-600" />
              <span className="text-xs font-bold text-slate-700">{selectedDate}</span>
              <ChevronDown size={14} className="text-slate-400" />
            </div>
            <AnimatePresence>
              {showCalendar && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 10 }} exit={{ opacity: 0, y: 10 }} className="absolute top-full right-0 mt-2 z-[110] bg-white border border-slate-200 rounded-2xl shadow-2xl p-4">
                  <CalendarPicker selectedDate={selectedDate} onSelect={(date) => { setSelectedDate(date); setShowCalendar(false); }} onClose={() => setShowCalendar(false)} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="relative w-full sm:w-80">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search staff any details..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-slate-50 border border-slate-100 pl-12 pr-4 py-3 rounded-2xl outline-none focus:border-indigo-300 focus:ring-4 focus:ring-indigo-50 transition-all w-full text-xs font-bold text-slate-800"
            />
          </div>
        </div>
      </div>

      <div className="glass-card overflow-hidden bg-white shadow-xl shadow-slate-200/40">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="text-center bg-slate-50/50">
                <th className="px-6 md:px-8 py-6 text-slate-500 text-[10px] font-bold tracking-tight min-w-[240px] text-center">Staff Member</th>
                <th className="px-6 py-6 text-slate-500 text-[10px] font-bold tracking-tight min-w-[180px] text-center">Contact Details</th>

                <th className="px-6 py-6 text-slate-500 text-[11px] font-bold tracking-tight relative group min-w-[180px] text-center">
                  <div className="flex items-center justify-center gap-2 cursor-pointer" onClick={() => setActiveFilterDropdown(activeFilterDropdown === 'dept' ? null : 'dept')}>
                    Department
                    <ArrowUp size={12} className={`transition-transform ${activeFilterDropdown === 'dept' ? '' : 'rotate-180'} text-indigo-500`} />
                  </div>
                  <AnimatePresence>
                    {activeFilterDropdown === 'dept' && (
                      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} className="absolute top-full left-1/2 -translate-x-1/2 mt-1 w-48 bg-white border border-slate-100 rounded-xl shadow-2xl z-[150] p-2" ref={filterRef}>
                        <div className={`p-2 rounded-lg text-[10px] font-bold cursor-pointer hover:bg-indigo-50 ${filters.department === 'all' ? 'text-indigo-600 bg-indigo-50' : 'text-slate-600'}`} onClick={() => { setFilters({ ...filters, department: 'all' }); setActiveFilterDropdown(null); }}>All Departments</div>
                        {distinctDepartments.map(dept => (
                          <div key={dept} className={`p-2 rounded-lg text-[10px] font-bold cursor-pointer hover:bg-indigo-50 ${filters.department === dept ? 'text-indigo-600 bg-indigo-50' : 'text-slate-600'}`} onClick={() => { setFilters({ ...filters, department: dept }); setActiveFilterDropdown(null); }}>{dept}</div>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </th>

                <th className="px-6 py-6 text-slate-500 text-[11px] font-bold tracking-tight relative min-w-[180px] text-center">
                  <div className="flex items-center justify-center gap-2 cursor-pointer" onClick={() => setActiveFilterDropdown(activeFilterDropdown === 'shift' ? null : 'shift')}>
                    Shift & Time
                    <ArrowUp size={12} className={`transition-transform ${activeFilterDropdown === 'shift' ? '' : 'rotate-180'} text-indigo-500`} />
                  </div>
                  <AnimatePresence>
                    {activeFilterDropdown === 'shift' && (
                      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} className="absolute top-full left-1/2 -translate-x-1/2 mt-1 w-48 bg-white border border-slate-100 rounded-xl shadow-2xl z-[150] p-2" ref={filterRef}>
                        <div className={`p-2 rounded-lg text-[10px] font-bold cursor-pointer hover:bg-indigo-50 ${filters.shift === 'all' ? 'text-indigo-600 bg-indigo-50' : 'text-slate-600'}`} onClick={() => { setFilters({ ...filters, shift: 'all' }); setActiveFilterDropdown(null); }}>All Shifts</div>
                        {shifts.map(shift => (
                          <div key={shift._id} className={`p-2 rounded-lg text-[10px] font-bold cursor-pointer hover:bg-indigo-50 ${filters.shift === shift._id ? 'text-indigo-600 bg-indigo-50' : 'text-slate-600'}`} onClick={() => { setFilters({ ...filters, shift: shift._id }); setActiveFilterDropdown(null); }}>{shift.name}</div>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </th>

                <th className="px-6 py-6 text-slate-500 text-[11px] font-bold tracking-tight text-center relative min-w-[100px]">
                  Joining Date
                </th>

                <th className="px-6 py-6 text-slate-500 text-[11px] font-bold tracking-tight text-center relative min-w-[100px]">
                  <div className="flex items-center justify-center gap-2 cursor-pointer" onClick={() => setActiveFilterDropdown(activeFilterDropdown === 'status' ? null : 'status')}>
                    Status
                    <ArrowUp size={12} className={`transition-transform ${activeFilterDropdown === 'status' ? '' : 'rotate-180'} text-indigo-500`} />
                  </div>
                  <AnimatePresence>
                    {activeFilterDropdown === 'status' && (
                      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} className="absolute top-full left-1/2 -translate-x-1/2 mt-1 w-40 bg-white border border-slate-100 rounded-xl shadow-2xl z-[150] p-2" ref={filterRef}>
                        <div className={`p-2 rounded-lg text-[10px] font-bold cursor-pointer hover:bg-indigo-50 ${filters.status === 'all' ? 'text-indigo-600 bg-indigo-50' : 'text-slate-600'}`} onClick={() => { setFilters({ ...filters, status: 'all' }); setActiveFilterDropdown(null); }}>All Status</div>
                        <div className={`p-2 rounded-lg text-[10px] font-bold cursor-pointer hover:bg-indigo-50 ${filters.status === 'online' ? 'text-indigo-600 bg-indigo-50' : 'text-slate-600'}`} onClick={() => { setFilters({ ...filters, status: 'online' }); setActiveFilterDropdown(null); }}>Online</div>
                        <div className={`p-2 rounded-lg text-[10px] font-bold cursor-pointer hover:bg-indigo-50 ${filters.status === 'offline' ? 'text-indigo-600 bg-indigo-50' : 'text-slate-600'}`} onClick={() => { setFilters({ ...filters, status: 'offline' }); setActiveFilterDropdown(null); }}>Offline</div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </th>

                <th className="px-6 py-6 text-slate-500 text-[10px] font-bold tracking-tight text-right w-20">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredEmployees.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-8 py-16 text-center text-slate-400 font-bold text-sm">
                    <div className="flex flex-col items-center gap-2">
                      <Filter size={32} className="text-slate-200" />
                      No matching staff members found
                    </div>
                  </td>
                </tr>
              ) : (
                filteredEmployees
                  .slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
                  .map((emp) => (
                    <tr key={emp._id} className="hover:bg-slate-50/50 transition-colors group">
                      <td className="px-6 md:px-8 py-6">
                        <div className="flex items-center gap-5">
                          <div
                            onClick={() => navigate(`/employee/${emp._id}`)}
                            className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-sm cursor-pointer hover:scale-110 transition-all overflow-hidden shadow-sm border-2 border-white group-hover:shadow-lg"
                          >
                            {emp.profileImage ? (
                              <img src={getFullImageUrl(emp.profileImage)} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full bg-indigo-600 flex items-center justify-center text-white text-lg">
                                {emp.name.charAt(0)}
                              </div>
                            )}
                          </div>
                          <div
                            className="cursor-pointer"
                            onClick={() => navigate(`/employee/${emp._id}`)}
                          >
                            <div className="font-bold text-slate-900 text-[13px] tracking-tight hover:text-indigo-600 transition-colors">{emp.name}</div>
                            <div className="flex items-center gap-2 mt-0.5 group/id">
                              <span className="text-[9px] text-slate-400 font-bold tracking-tight opacity-50">ID: {emp._id.slice(-8)}</span>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleCopy(emp._id); }}
                                className="opacity-0 group-hover/id:opacity-100 p-0.5 hover:bg-slate-200 rounded transition-all text-slate-400 hover:text-indigo-600"
                                title="Copy Full ID"
                              >
                                <Copy size={8} />
                              </button>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-6 text-center">
                        <div className="flex flex-col gap-1.5 items-center">
                          <div className="text-[10px] text-slate-600 font-bold flex items-center gap-2 tracking-tight group/copy">
                            <div className="p-0.5 bg-slate-50 rounded"><Mail size={10} className="text-slate-400" /></div> {emp.email}
                            <button onClick={(e) => { e.stopPropagation(); handleCopy(emp.email); }} className="opacity-0 group-hover/copy:opacity-100 p-0.5 hover:bg-indigo-50 rounded text-indigo-400 transition-all"><Copy size={8} /></button>
                          </div>
                          <div className="text-[10px] text-slate-500 font-bold flex items-center gap-2 tracking-tight group/copy">
                            <div className="p-0.5 bg-slate-50 rounded"><Phone size={10} className="text-slate-400" /></div> {emp.mobile}
                            <button onClick={(e) => { e.stopPropagation(); handleCopy(emp.mobile); }} className="opacity-0 group-hover/copy:opacity-100 p-0.5 hover:bg-indigo-50 rounded text-indigo-400 transition-all"><Copy size={8} /></button>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-6 text-center">
                        <div className="font-bold text-slate-800 text-[10px] tracking-tight">{emp.designation || 'Staff Member'}</div>
                        <div className="text-[9px] text-indigo-600 font-bold tracking-widest mt-1 opacity-80">{emp.department || 'General'}</div>
                      </td>
                      <td className="px-6 py-6">
                        <div className="flex flex-col items-center justify-center gap-1 px-2 py-1.5 rounded-xl bg-slate-50 border border-slate-100/50 w-full">
                          <div className="flex items-center gap-1.5">
                            <Clock size={10} className="text-indigo-500" />
                            <span className="text-[9px] font-bold text-slate-600 tracking-tight">{emp.shift?.name || 'General Shift'}</span>
                          </div>
                          <div className="text-[8px] font-bold text-slate-400 bg-white px-1.5 py-0.5 rounded-md border border-slate-100">
                            {formatTime12h(emp.shift?.startTime || '09:00')} - {formatTime12h(emp.shift?.endTime || '18:00')}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-6 text-center">
                        <div className="text-[10px] font-bold text-slate-600">{new Date(emp.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
                      </td>
                      <td className="px-4 py-6 text-center">
                        <span className={`px-3 py-1.5 rounded-xl text-[9px] font-bold tracking-tight border shadow-sm ${emp.isOnline
                          ? 'bg-emerald-50 text-emerald-600 border-emerald-100'
                          : 'bg-slate-100 text-slate-400 border-slate-200'
                          }`}>
                          {emp.isOnline ? 'Online' : 'Offline'}
                        </span>
                      </td>
                      <td className="px-4 py-6 text-right">
                        <div className="flex gap-2 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            className="p-3 rounded-xl bg-slate-50 text-slate-400 hover:bg-indigo-600 hover:text-white transition-all shadow-sm active:scale-90"
                            onClick={() => handleOpenModal(emp)}
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            className="p-3 rounded-xl bg-slate-50 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-all shadow-sm active:scale-90"
                            onClick={() => handleDeleteConfirm(emp._id)}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        <div className="px-8 py-8 border-t border-slate-50 flex items-center justify-center relative bg-slate-50/20">
          <p className="absolute left-8 text-[10px] font-bold text-slate-400 tracking-widest hidden sm:block">
            Page {currentPage} of {totalPages || 1}
          </p>
          <div className="flex gap-2.5">
            <button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="p-3 rounded-2xl border border-slate-200 text-slate-400 hover:bg-white hover:text-indigo-600 disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-sm"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages || totalPages === 0}
              className="p-3 rounded-2xl border border-slate-200 text-slate-400 hover:bg-white hover:text-indigo-600 disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-sm"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-[2000] flex items-start justify-center bg-slate-900/40 backdrop-blur-md p-4 pt-10 sm:pt-20 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -20 }}
              className="bg-white w-full sm:max-w-3xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col mb-10"
            >
              <div className="bg-white px-8 py-6 border-b border-slate-100 flex justify-between items-center">
                <div>
                  <h3 className="text-xl font-bold text-slate-900 tracking-tighter m-0">{editingEmployee ? 'Edit Details' : 'Add New Staff'}</h3>
                  <p className="text-slate-400 text-[10px] font-bold tracking-widest mt-1">
                    Manage staff credentials and profile
                  </p>
                </div>
                <button
                  onClick={() => setShowModal(false)}
                  className="w-10 h-10 rounded-xl bg-slate-50 text-slate-400 flex items-center justify-center hover:bg-rose-50 hover:text-rose-500 transition-all active:scale-90"
                >
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleSaveSubmit} className="flex-1 overflow-y-auto p-8">
                {/* Profile Image Upload */}
                <div className="flex flex-col items-center mb-8">
                  <div className="relative group">
                    <div className="w-24 h-24 rounded-3xl bg-slate-50 border-2 border-dashed border-slate-200 flex items-center justify-center overflow-hidden transition-all group-hover:border-indigo-300">
                      {formData.profileImage ? (
                        <img
                          src={typeof formData.profileImage === 'string' ? getFullImageUrl(formData.profileImage) : URL.createObjectURL(formData.profileImage)}
                          className="w-full h-full object-cover"
                          alt="Profile"
                        />
                      ) : (
                        <div className="text-center">
                          <Upload size={24} className="text-slate-300 mx-auto mb-1" />
                          <p className="text-[10px] font-bold text-slate-400">Photo</p>
                        </div>
                      )}
                    </div>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => setFormData({ ...formData, profileImage: e.target.files[0] })}
                      className="absolute inset-0 opacity-0 cursor-pointer"
                    />
                    <div className="absolute -bottom-2 -right-2 w-8 h-8 bg-indigo-600 text-white rounded-xl flex items-center justify-center shadow-lg border-2 border-white transform transition-transform group-hover:scale-110">
                      <Edit2 size={14} />
                    </div>
                  </div>
                  <p className="text-[10px] font-bold text-slate-400 mt-4 tracking-widest">Click to upload profile photo</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-3">
                    <label className="text-[11px] font-bold text-slate-400 tracking-widest ml-1">Full Name</label>
                    <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required className="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-100 focus:bg-white px-5 py-4 rounded-2xl outline-none transition-all text-sm font-bold text-slate-800" placeholder="e.g., John Doe" />
                  </div>
                  <div className="space-y-3">
                    <label className="text-[11px] font-bold text-slate-400 tracking-widest ml-1">Email Address</label>
                    <input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} required className="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-100 focus:bg-white px-5 py-4 rounded-2xl outline-none transition-all text-sm font-bold text-slate-800" placeholder="email@company.com" />
                  </div>
                  <div className="space-y-3">
                    <label className="text-[11px] font-bold text-slate-400 tracking-widest ml-1">Mobile (10 Digits)</label>
                    <input type="text" value={formData.mobile} onChange={handleMobileChange} required className="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-100 focus:bg-white px-5 py-4 rounded-2xl outline-none transition-all text-sm font-bold text-slate-800" placeholder="Enter 10-digit number" />
                  </div>
                  <div className="space-y-3">
                    <label className="text-[11px] font-bold text-slate-400 tracking-widest ml-1">Login Password</label>
                    <div className="relative">
                      <input
                        type={showPassword ? "text" : "password"}
                        value={formData.password}
                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                        required={!editingEmployee}
                        className="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-100 focus:bg-white px-5 py-4 rounded-2xl outline-none transition-all text-sm font-bold text-slate-800 pr-12"
                        placeholder={editingEmployee ? "Leave blank to keep same" : "Set login password"}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-indigo-600 transition-colors"
                      >
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <label className="text-[11px] font-bold text-slate-400 tracking-widest ml-1">Designation</label>
                    <input type="text" value={formData.designation} onChange={(e) => setFormData({ ...formData, designation: e.target.value })} className="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-100 focus:bg-white px-5 py-4 rounded-2xl outline-none transition-all text-sm font-bold text-slate-800" placeholder="e.g., Senior Analyst" />
                  </div>

                  {/* Custom Dropdowns Section */}
                  <div className="space-y-3">
                    <label className="text-[11px] font-bold text-slate-400 tracking-widest ml-1">Department</label>
                    <div className="relative">
                      <div
                        onClick={() => setActiveModalDropdown(activeModalDropdown === 'dept' ? null : 'dept')}
                        className="w-full bg-slate-50 border-2 border-transparent hover:border-indigo-100 px-5 py-4 rounded-2xl cursor-pointer flex justify-between items-center transition-all"
                      >
                        <span className="text-sm font-bold text-slate-800">{formData.department || 'Select Department'}</span>
                        <ChevronDown size={18} className={`text-slate-400 transition-transform ${activeModalDropdown === 'dept' ? 'rotate-180' : ''}`} />
                      </div>
                      <AnimatePresence>
                        {activeModalDropdown === 'dept' && (
                          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} className="absolute z-[2100] top-full left-0 right-0 mt-2 bg-white border border-slate-100 rounded-2xl shadow-2xl p-2 max-h-48 overflow-y-auto no-scrollbar">
                            {distinctDepartments.length === 0 ? (
                              <div className="p-3 text-[11px] font-bold text-slate-400 text-center">No existing departments</div>
                            ) : (
                              distinctDepartments.map(dept => (
                                <div key={dept} onClick={() => { setFormData({ ...formData, department: dept }); setActiveModalDropdown(null); }} className="p-3 rounded-xl hover:bg-indigo-50 text-xs font-bold text-slate-600 hover:text-indigo-600 cursor-pointer transition-all flex items-center justify-between">
                                  {dept}
                                  {formData.department === dept && <div className="w-1.5 h-1.5 rounded-full bg-indigo-600" />}
                                </div>
                              ))
                            )}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <label className="text-[11px] font-bold text-slate-400 tracking-widest ml-1">Work Shift</label>
                    <div className="relative">
                      <div
                        onClick={() => setActiveModalDropdown(activeModalDropdown === 'shift' ? null : 'shift')}
                        className="w-full bg-slate-50 border-2 border-transparent hover:border-indigo-100 px-5 py-4 rounded-2xl cursor-pointer flex justify-between items-center transition-all"
                      >
                        <span className="text-sm font-bold text-slate-800">
                          {shifts.find(s => s._id === formData.shift)?.name || 'Select Shift'}
                        </span>
                        <ChevronDown size={18} className={`text-slate-400 transition-transform ${activeModalDropdown === 'shift' ? 'rotate-180' : ''}`} />
                      </div>
                      <AnimatePresence>
                        {activeModalDropdown === 'shift' && (
                          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} className="absolute z-[2100] top-full left-0 right-0 mt-2 bg-white border border-slate-100 rounded-2xl shadow-2xl p-2 max-h-48 overflow-y-auto no-scrollbar">
                            {shifts.map(s => (
                              <div key={s._id} onClick={() => { setFormData({ ...formData, shift: s._id }); setActiveModalDropdown(null); }} className="p-3 rounded-xl hover:bg-indigo-50 text-xs font-bold text-slate-600 hover:text-indigo-600 cursor-pointer transition-all">
                                <div className="flex items-center justify-between">
                                  <span>{s.name}</span>
                                  {formData.shift === s._id && <div className="w-1.5 h-1.5 rounded-full bg-indigo-600" />}
                                </div>
                                <div className="text-[10px] text-slate-400 mt-1">{formatTime12h(s.startTime)} - {formatTime12h(s.endTime)}</div>
                              </div>
                            ))}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <label className="text-[11px] font-bold text-slate-400 tracking-widest ml-1">Access Role</label>
                    <div className="relative">
                      <div
                        onClick={() => setActiveModalDropdown(activeModalDropdown === 'role' ? null : 'role')}
                        className="w-full bg-slate-50 border-2 border-transparent hover:border-indigo-100 px-5 py-4 rounded-2xl cursor-pointer flex justify-between items-center transition-all"
                      >
                        <span className="text-sm font-bold text-slate-800">
                          {formData.role === 'admin' ? 'Administrator' : 'Staff Member'}
                        </span>
                        <ChevronDown size={18} className={`text-slate-400 transition-transform ${activeModalDropdown === 'role' ? 'rotate-180' : ''}`} />
                      </div>
                      <AnimatePresence>
                        {activeModalDropdown === 'role' && (
                          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} className="absolute z-[2100] top-full left-0 right-0 mt-2 bg-white border border-slate-100 rounded-2xl shadow-2xl p-2">
                            {[
                              { id: 'employee', label: 'Staff Member' },
                              { id: 'admin', label: 'Administrator' }
                            ].map(r => (
                              <div key={r.id} onClick={() => { setFormData({ ...formData, role: r.id }); setActiveModalDropdown(null); }} className="p-3 rounded-xl hover:bg-indigo-50 text-xs font-bold text-slate-600 hover:text-indigo-600 cursor-pointer transition-all flex items-center justify-between">
                                {r.label}
                                {formData.role === r.id && <div className="w-1.5 h-1.5 rounded-full bg-indigo-600" />}
                              </div>
                            ))}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-4 pt-10">
                  <button type="button" onClick={() => setShowModal(false)} className="flex-1 bg-slate-50 text-slate-500 font-bold py-4 rounded-2xl hover:bg-slate-100 transition-all">Discard</button>
                  <button type="submit" disabled={saving} className="flex-[2] bg-indigo-600 text-white font-bold py-4 rounded-2xl shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all flex items-center justify-center gap-3">
                    {saving ? <Loader2 size={20} className="animate-spin" /> : <Save size={20} />}
                    {saving ? 'Saving...' : (editingEmployee ? 'Update Profile' : 'Create Account')}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {confirmData.show && (
          <div className="fixed inset-0 z-[3000] flex items-start justify-center bg-slate-900/60 backdrop-blur-sm p-4 pt-20">
            <motion.div initial={{ opacity: 0, scale: 0.9, y: -20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: -20 }} className="bg-white rounded-[2.5rem] p-10 w-full max-w-[380px] text-center shadow-2xl">
              <div className="w-20 h-20 rounded-3xl mx-auto mb-8 flex items-center justify-center bg-indigo-50 text-indigo-600">
                <AlertCircle size={40} />
              </div>
              <h4 className="text-xl font-bold text-slate-900 mb-3 tracking-tighter">Are you sure?</h4>
              <p className="text-slate-500 text-sm font-bold leading-relaxed mb-10 px-4">{confirmData.message}</p>
              <div className="flex gap-4">
                <button className="flex-1 bg-slate-50 text-slate-500 font-bold py-4 rounded-2xl hover:bg-slate-100 transition-all" onClick={() => setConfirmData({ ...confirmData, show: false })}>Cancel</button>
                <button className="flex-1 bg-indigo-600 text-white font-bold py-4 rounded-2xl hover:bg-indigo-700 transition-all shadow-lg" onClick={executeConfirmedAction}>Confirm</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Employees;
