import { AnimatePresence, motion } from 'framer-motion';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  AlertCircle,
  Calendar,
  Camera,
  ChevronDown,
  ChevronLeft, ChevronRight,
  Copy,
  Download,
  Edit2,
  Eye,
  EyeOff,
  FileText,
  FileSpreadsheet,
  Loader2,
  Save,
  Search,
  Share2,
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

  const getMissingRequirementsList = () => {
    const list = [];
    if (!setupStatus.office) list.push('Office Locations');
    if (!setupStatus.departments) list.push('Departments');
    if (!setupStatus.designations) list.push('Designations');
    if (!setupStatus.shifts) list.push('Shifts');
    if (!setupStatus.leaveTypes) list.push('Leave Types');
    return list;
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
  const [locations, setLocations] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [designations, setDesignations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successData, setSuccessData] = useState(null);
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [saving, setSaving] = useState(false);
  const [confirmData, setConfirmData] = useState({ show: false, type: '', action: null, message: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [showFormatModal, setShowFormatModal] = useState(false);
  const [setupStatus, setSetupStatus] = useState({
    office: true,
    departments: true,
    designations: true,
    shifts: true,
    leaveTypes: true
  });
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

  const handleCopy = (text) => {
    navigator.clipboard.writeText(text);
    toast.success('ID copied to clipboard!', {
      icon: '📋',
      style: {
        borderRadius: '12px',
        background: '#333',
        color: '#fff',
        fontSize: '12px',
        fontWeight: 'bold'
      },
    });
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
    workingPlace: '',
    gender: 'Male',
    role: 'employee',
    status: 'active',
    joiningDate: new Date().toISOString().split('T')[0]
  });

  const [showJoiningCalendar, setShowJoiningCalendar] = useState(false);
  const joiningCalendarRef = useRef(null);

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
      const [empRes, shiftRes, locRes, deptRes, desigRes, leaveTypeRes, holidayRes] = await Promise.all([
        api.get('/employees'),
        api.get('/shifts'),
        api.get('/settings/locations'),
        api.get('/departments'),
        api.get('/designations'),
        api.get('/leave-types'),
        api.get('/holidays')
      ]);
      setEmployees(empRes.data.data);
      setShifts(shiftRes.data.data);
      setLocations(locRes.data.data);
      setDepartments(deptRes.data.data);
      setDesignations(desigRes.data.data);

      setSetupStatus({
        office: locRes.data.data.length > 0,
        departments: deptRes.data.data.length > 0,
        designations: desigRes.data.data.length > 0,
        shifts: shiftRes.data.data.length > 0,
        leaveTypes: leaveTypeRes.data.data.length > 0
      });
    } catch (err) {
      toast.error('Failed to load staff data');
    } finally {
      setLoading(false);
    }
  };



  const handleOpenModal = (emp = null) => {
    if (!emp) {
      // Prerequisite checks for new employee
      const incomplete = Object.entries(setupStatus).filter(([_, v]) => !v);
      if (incomplete.length > 0) {
        const missing = incomplete.map(([k]) => k.charAt(0).toUpperCase() + k.slice(1)).join(', ');
        toast.error(`Incomplete Setup: Please configure ${missing} before adding staff.`, { duration: 5000 });
        navigate('/settings');
        return;
      }
    }

    setShowPassword(false);
    if (emp) {
      setEditingEmployee(emp);
      setFormData({
        name: emp.name,
        email: emp.email,
        mobile: emp.mobile || '',
        password: '',
        department: emp.department || '',
        designation: emp.designation || '',
        shift: emp.shift?._id || emp.shift || '',
        workingPlace: emp.workingPlace?._id || emp.workingPlace || '',
        gender: emp.gender || 'Male',
        role: emp.role || 'employee',
        status: emp.status || 'active',
        profileImage: emp.profileImage || '',
        joiningDate: emp.joiningDate ? new Date(emp.joiningDate).toISOString().split('T')[0] : new Date(emp.createdAt).toISOString().split('T')[0]
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
        workingPlace: locations[0]?._id || '',
        gender: 'Male',
        role: 'employee',
        status: 'active',
        profileImage: '',
        joiningDate: new Date().toISOString().split('T')[0]
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
        emp._id.slice(-8),
        emp.name,
        emp.email,
        emp.mobile,
        emp.department || 'N/A',
        emp.designation || 'N/A',
        emp.shift?.name || 'General Shift',
        new Date(emp.joiningDate || emp.createdAt).toLocaleDateString()
      ]);

      autoTable(doc, {
        startY: 38,
        head: [['Emp ID', 'Name', 'Email', 'Mobile', 'Department', 'Designation', 'Shift', 'Joined']],
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
            // When editing, only include password if it's not empty
            if (editingEmployee && key === 'password' && !formData[key]) return;
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
            const rawPassword = formData.password;
            const res = await api.post('/employees', data, {
              headers: { 'Content-Type': 'multipart/form-data' }
            });
            const createdEmp = res.data.data;
            setSuccessData({
              ...createdEmp,
              password: rawPassword
            });
            setShowSuccessModal(true);
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
    <div className="space-y-6 md:space-y-8 animate-fade-up max-w-7xl mx-auto p-4 md:p-8">
      {/* Mandatory Setup Banner */}
      {Object.values(setupStatus).some(v => !v) && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8 p-6 bg-amber-50 border-2 border-amber-100 rounded-[2.5rem] flex flex-col md:flex-row items-center justify-between gap-6 shadow-sm"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-amber-100 text-amber-600 rounded-2xl flex items-center justify-center">
              <AlertCircle size={24} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-amber-900">Mandatory Setup Required</h3>
              <p className="text-amber-700/70 text-[11px] font-medium mt-0.5">
                The following modules must be configured before adding staff: <span className="font-bold text-amber-800">{getMissingRequirementsList().join(', ')}</span>
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              const pathMap = {
                office: '/working-places',
                departments: '/departments',
                designations: '/designations',
                shifts: '/shift-setup',
                leaveTypes: '/leave-types'
              };
              const missingEntry = Object.entries(setupStatus).find(([k, v]) => !v);
              if (missingEntry) {
                navigate(pathMap[missingEntry[0]]);
              }
            }}
            className="px-6 py-3 bg-amber-600 text-white rounded-2xl font-bold text-xs hover:bg-amber-700 transition-all shadow-lg shadow-amber-200 flex items-center gap-2"
          >
            Complete Remaining Setup
            <ChevronRight size={14} />
          </button>
        </motion.div>
      )}

      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight m-0">Staff Directory</h2>
          <p className="text-slate-600 font-bold text-[13px] mt-2">Manage staff profiles, shifts, and access credentials</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <button
            onClick={() => setShowFormatModal(true)}
            className="flex items-center justify-center gap-2 bg-white text-slate-600 border border-slate-200 px-4 py-3 rounded-2xl font-bold text-sm hover:bg-slate-50 transition-all active:scale-95 shadow-sm"
          >
            <FileSpreadsheet size={18} />
            Format
          </button>

          <input
            type="file"
            ref={fileInputRef}
            className="hidden" z
            accept=".xlsx"
            onChange={handleBulkUpload}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="flex items-center justify-center gap-2 bg-white text-slate-600 border border-slate-200 px-4 py-3 rounded-2xl font-bold text-sm hover:bg-slate-50 transition-all active:scale-95 shadow-sm disabled:opacity-50"
          >
            {isUploading ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
            Upload Excel
          </button>

          <button
            onClick={handleExport}
            disabled={isExporting}
            className="flex items-center justify-center gap-2 bg-white text-slate-600 border border-slate-200 px-4 py-3 rounded-2xl font-bold text-sm hover:bg-slate-50 transition-all active:scale-95 shadow-sm disabled:opacity-50"
          >
            {isExporting ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
            Excel
          </button>
          <button
            onClick={handleExportPDF}
            disabled={isExporting}
            className="flex items-center justify-center gap-2 bg-white text-slate-600 border border-slate-200 px-4 py-3 rounded-2xl font-bold text-sm hover:bg-slate-50 transition-all active:scale-95 shadow-sm disabled:opacity-50"
          >
            {isExporting ? <Loader2 size={18} className="animate-spin" /> : <FileText size={18} />}
            PDF
          </button>
          <button
            className="flex flex-1 md:flex-none items-center justify-center gap-2 bg-indigo-600 text-white px-6 py-3 rounded-2xl font-bold text-sm shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all active:scale-95"
            onClick={() => handleOpenModal()}
          >
            <UserPlus size={18} />
            Add Staff
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
          <table className="w-full text-left border-collapse border border-slate-200">
            <thead>
              <tr className="bg-slate-50/50">
                <th className="px-6 py-4 text-[10px] font-extrabold text-indigo-600 tracking-widest border border-slate-200">Employee Details</th>
                <th className="px-6 py-4 text-[10px] font-extrabold text-indigo-600 tracking-widest border border-slate-200">Contact</th>
                <th className="px-4 py-4 text-[10px] font-extrabold text-indigo-600 tracking-widest text-center border border-slate-200">Location</th>
                <th className="px-4 py-4 text-[10px] font-extrabold text-indigo-600 tracking-widest text-center border border-slate-200">Joined</th>
                <th className="px-4 py-4 text-[10px] font-extrabold text-indigo-600 tracking-widest text-center border border-slate-200">Status</th>
                <th className="px-2 py-4 text-[10px] font-extrabold text-indigo-600 tracking-widest text-right border border-slate-200">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredEmployees.length === 0 ? (
                <tr>
                  <td colSpan="6" className="py-20 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-300">
                        <Users size={24} />
                      </div>
                      <p className="text-slate-400 font-bold text-sm uppercase tracking-widest">No staff members found</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredEmployees
                  .slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
                  .map((emp) => (
                    <tr key={emp._id} className="hover:bg-slate-50/50 transition-colors group">
                      <td className="px-6 py-4 border border-slate-200">
                        <div className="flex items-center gap-4">
                          <div
                            onClick={() => navigate(`/employee/${emp._id}`)}
                            className="w-11 h-11 rounded-[14px] bg-slate-100 flex items-center justify-center text-slate-400 overflow-hidden border border-slate-200 shadow-sm cursor-pointer hover:border-indigo-300 transition-all"
                          >
                            {emp.profileImage ? (
                              <img src={getFullImageUrl(emp.profileImage)} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full bg-indigo-500 flex items-center justify-center text-white text-sm font-bold uppercase">
                                {emp.name.charAt(0)}
                              </div>
                            )}
                          </div>
                          <div className="flex flex-col">
                            <span
                              onClick={() => navigate(`/employee/${emp._id}`)}
                              className="text-sm font-bold text-slate-900 cursor-pointer hover:text-indigo-600 transition-colors"
                            >
                              {emp.name}
                            </span>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <span className="text-[9px] font-extrabold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded uppercase tracking-tighter border border-indigo-100/50">
                                  {emp.designation || 'Staff'}
                                </span>
                                <span className="text-[9px] font-bold text-slate-400">/ {emp.department || 'N/A'}</span>
                                <span className="text-[9px] font-bold text-slate-500">
                                  • {emp.shift?.shiftName || (typeof emp.shift === 'string' ? shifts.find(s => s._id === emp.shift)?.shiftName : null) || 'NA'}
                                </span>
                              </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 border border-slate-200">
                        <div className="space-y-1.5">
                          <div
                            className="flex items-center gap-2 group/copy cursor-pointer"
                            onClick={() => handleCopy(emp.email)}
                            title="Click to copy email"
                          >
                            <div className="w-5 h-5 rounded-md bg-slate-50 flex items-center justify-center text-slate-400 group-hover/copy:bg-indigo-50 group-hover/copy:text-indigo-600 transition-colors">
                              <Copy size={10} />
                            </div>
                            <span className="text-[11px] font-bold text-slate-600 truncate max-w-[140px]">{emp.email}</span>
                          </div>
                          <div
                            className="flex items-center gap-2 group/copy cursor-pointer"
                            onClick={() => handleCopy(emp.mobile)}
                            title="Click to copy phone"
                          >
                            <div className="w-5 h-5 rounded-md bg-slate-50 flex items-center justify-center text-slate-400 group-hover/copy:bg-indigo-50 group-hover/copy:text-indigo-600 transition-colors">
                              <Copy size={10} />
                            </div>
                            <span className="text-[11px] font-bold text-slate-600">{emp.mobile}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-center border border-slate-200">
                        <div className="flex flex-col items-center gap-1">
                          <span className="text-[10px] font-bold text-slate-800 tracking-tight">
                            {emp.workingPlace?.name || (typeof emp.workingPlace === 'string' ? locations.find(l => l._id === emp.workingPlace)?.name : null) || 'Main Office'}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-center border border-slate-200">
                        <div className="text-[10px] font-bold text-slate-700 tracking-tight">
                          {emp.joiningDate ? new Date(emp.joiningDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A'}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-center border border-slate-200">
                        <div className="flex justify-center">
                          <div
                            className={`w-3 h-3 rounded-full shadow-sm ${emp.isOnline ? 'bg-emerald-500 shadow-emerald-200' : 'bg-rose-500 shadow-rose-200'}`}
                            title={emp.isOnline ? 'Online' : 'Offline'}
                          ></div>
                        </div>
                      </td>
                      <td className="px-2 py-4 text-right border border-slate-200">
                        <div className="flex gap-2 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            className="p-2.5 rounded-xl bg-slate-50 text-slate-400 hover:bg-indigo-600 hover:text-white transition-all shadow-sm active:scale-90"
                            onClick={() => handleOpenModal(emp)}
                          >
                            <Edit2 size={13} />
                          </button>
                          <button
                            className="p-2.5 rounded-xl bg-slate-50 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-all shadow-sm active:scale-90"
                            onClick={() => handleDeleteConfirm(emp._id)}
                          >
                            <Trash2 size={13} />
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
          <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-slate-900/40 backdrop-blur-md p-4 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white w-full max-w-md rounded-3xl shadow-2xl flex flex-col my-8 overflow-hidden"
            >
              <div className="bg-white px-8 py-6 border-b border-slate-100 flex justify-between items-center">
                <div>
                  <h3 className="text-xl font-bold text-slate-900 tracking-tighter m-0">{editingEmployee ? 'Edit Details' : 'Add New Staff'}</h3>
                  <p className="text-slate-400 text-[10px] font-bold tracking-widest mt-1">Manage staff credentials and profile</p>
                </div>
                <button
                  onClick={() => setShowModal(false)}
                  className="w-10 h-10 rounded-xl bg-slate-50 text-slate-400 flex items-center justify-center hover:bg-rose-50 hover:text-rose-500 transition-all active:scale-90"
                >
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleSaveSubmit} className="flex-1 overflow-y-auto p-8">
                {/* Header Section: Profile Image & Joining Date */}
                <div className="flex flex-col md:flex-row items-center justify-center gap-10 mb-10 p-8 bg-slate-50/50 rounded-[2.5rem] border border-slate-100">
                  {/* Profile Image Upload */}
                  <div className="flex flex-col items-center">
                    <div className="relative group">
                      <div className="w-28 h-28 rounded-[2rem] bg-white border-2 border-dashed border-slate-200 flex items-center justify-center overflow-hidden transition-all group-hover:border-indigo-300 shadow-sm">
                        {formData.profileImage ? (
                          <img
                            src={typeof formData.profileImage === 'string' ? getFullImageUrl(formData.profileImage) : URL.createObjectURL(formData.profileImage)}
                            className="w-full h-full object-cover"
                            alt="Profile"
                          />
                        ) : (
                          <div className="text-center">
                            <Upload size={28} className="text-slate-300 mx-auto mb-1" />
                            <p className="text-[10px] font-bold text-slate-400">Upload Photo</p>
                          </div>
                        )}
                      </div>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => setFormData({ ...formData, profileImage: e.target.files[0] })}
                        className="absolute inset-0 opacity-0 cursor-pointer"
                      />
                      <div className="absolute -bottom-2 -right-2 w-9 h-9 bg-indigo-600 text-white rounded-2xl flex items-center justify-center shadow-lg border-2 border-white transform transition-transform group-hover:scale-110">
                        <Camera size={16} />
                      </div>
                    </div>
                  </div>

                  <div className="w-px h-16 bg-slate-200 hidden md:block" />

                  {/* Custom Joining Date Picker */}
                  <div className="flex flex-col items-center md:items-start space-y-3">
                    <label className="text-[11px] font-bold text-slate-400 tracking-widest ml-1">Joining Date</label>
                    <div className="relative" ref={joiningCalendarRef}>
                      <div
                        onClick={() => setShowJoiningCalendar(!showJoiningCalendar)}
                        className="flex items-center gap-4 bg-white border-2 border-slate-100 hover:border-indigo-100 px-6 py-4 rounded-2xl cursor-pointer transition-all min-w-[220px] shadow-sm active:scale-95"
                      >
                        <Calendar size={18} className="text-indigo-600" />
                        <div className="flex flex-col items-start leading-none">
                          <span className="text-[9px] font-bold text-slate-400 mb-1">Start Reporting From</span>
                          <span className="text-sm font-bold text-slate-800">
                            {new Date(formData.joiningDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </span>
                        </div>
                        <ChevronDown size={18} className={`text-slate-400 ml-auto transition-transform ${showJoiningCalendar ? 'rotate-180' : ''}`} />
                      </div>

                      <AnimatePresence>
                        {showJoiningCalendar && (
                          <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: 10 }}
                            exit={{ opacity: 0, scale: 0.95, y: 10 }}
                            className="absolute top-full left-0 md:left-auto md:right-0 mt-2 z-[2500] bg-white border border-slate-100 rounded-3xl shadow-2xl p-4 overflow-hidden"
                          >
                            <CalendarPicker
                              selectedDate={formData.joiningDate}
                              onSelect={(date) => {
                                setFormData({ ...formData, joiningDate: date });
                                setShowJoiningCalendar(false);
                              }}
                              onClose={() => setShowJoiningCalendar(false)}
                            />
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
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
                    <label className="text-[11px] font-bold text-slate-400 tracking-widest ml-1">Gender</label>
                    <div className="flex gap-4">
                      {['Male', 'Female'].map((g) => (
                        <div
                          key={g}
                          onClick={() => setFormData({ ...formData, gender: g })}
                          className={`flex-1 py-4 rounded-2xl border-2 transition-all cursor-pointer flex items-center justify-center font-bold text-sm ${formData.gender === g ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-100' : 'bg-slate-50 border-transparent text-slate-500 hover:bg-slate-100'}`}
                        >
                          {g}
                        </div>
                      ))}
                    </div>
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
                    <label className="text-[11px] font-bold text-slate-400 tracking-widest ml-1">Present Working Place</label>
                    <div className="relative">
                      <div
                        onClick={() => setActiveModalDropdown(activeModalDropdown === 'workingPlace' ? null : 'workingPlace')}
                        className="w-full bg-slate-50 border-2 border-transparent hover:border-indigo-100 px-5 py-4 rounded-2xl cursor-pointer flex justify-between items-center transition-all"
                      >
                        <span className="text-sm font-bold text-slate-800">
                          {locations.find(l => l._id === formData.workingPlace)?.name || 'Select Location'}
                        </span>
                        <ChevronDown size={18} className={`text-slate-400 transition-transform ${activeModalDropdown === 'workingPlace' ? 'rotate-180' : ''}`} />
                      </div>
                      <AnimatePresence>
                        {activeModalDropdown === 'workingPlace' && (
                          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} className="absolute z-[2100] top-full left-0 right-0 mt-2 bg-white border border-slate-100 rounded-2xl shadow-2xl p-2 max-h-48 overflow-y-auto no-scrollbar">
                            {locations.map(l => (
                              <div key={l._id} onClick={() => { setFormData({ ...formData, workingPlace: l._id }); setActiveModalDropdown(null); }} className="p-3 rounded-xl hover:bg-indigo-50 text-xs font-bold text-slate-600 hover:text-indigo-600 cursor-pointer transition-all flex items-center justify-between">
                                <span>{l.name}</span>
                                {formData.workingPlace === l._id && <div className="w-1.5 h-1.5 rounded-full bg-indigo-600" />}
                              </div>
                            ))}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                  {/* Custom Dropdowns Section */}
                  <div className="space-y-3">
                    <label className="text-[11px] font-bold text-slate-400 tracking-widest ml-1">Department</label>
                    <div className="relative">
                      <div
                        onClick={() => setActiveModalDropdown(activeModalDropdown === 'department' ? null : 'department')}
                        className="w-full bg-slate-50 border-2 border-transparent hover:border-indigo-100 px-5 py-4 rounded-2xl cursor-pointer flex justify-between items-center transition-all"
                      >
                        <span className="text-sm font-bold text-slate-800">
                          {formData.department || 'Select Department'}
                        </span>
                        <ChevronDown size={18} className={`text-slate-400 transition-transform ${activeModalDropdown === 'department' ? 'rotate-180' : ''}`} />
                      </div>
                      <AnimatePresence>
                        {activeModalDropdown === 'department' && (
                          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} className="absolute z-[2100] top-full left-0 right-0 mt-2 bg-white border border-slate-100 rounded-2xl shadow-2xl p-2 max-h-48 overflow-y-auto no-scrollbar">
                            {departments.map(d => (
                              <div key={d._id} onClick={() => { setFormData({ ...formData, department: d.name }); setActiveModalDropdown(null); }} className="p-3 rounded-xl hover:bg-indigo-50 text-xs font-bold text-slate-600 hover:text-indigo-600 cursor-pointer transition-all flex items-center justify-between">
                                <span>{d.name}</span>
                                {formData.department === d.name && <div className="w-1.5 h-1.5 rounded-full bg-indigo-600" />}
                              </div>
                            ))}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <label className="text-[11px] font-bold text-slate-400 tracking-widest ml-1">Designation</label>
                    <div className="relative">
                      <div
                        onClick={() => setActiveModalDropdown(activeModalDropdown === 'designation' ? null : 'designation')}
                        className="w-full bg-slate-50 border-2 border-transparent hover:border-indigo-100 px-5 py-4 rounded-2xl cursor-pointer flex justify-between items-center transition-all"
                      >
                        <span className="text-sm font-bold text-slate-800">
                          {formData.designation || 'Select Designation'}
                        </span>
                        <ChevronDown size={18} className={`text-slate-400 transition-transform ${activeModalDropdown === 'designation' ? 'rotate-180' : ''}`} />
                      </div>
                      <AnimatePresence>
                        {activeModalDropdown === 'designation' && (
                          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} className="absolute z-[2100] top-full left-0 right-0 mt-2 bg-white border border-slate-100 rounded-2xl shadow-2xl p-2 max-h-48 overflow-y-auto no-scrollbar">
                            {designations.map(d => (
                              <div key={d._id} onClick={() => { setFormData({ ...formData, designation: d.name }); setActiveModalDropdown(null); }} className="p-3 rounded-xl hover:bg-indigo-50 text-xs font-bold text-slate-600 hover:text-indigo-600 cursor-pointer transition-all flex items-center justify-between">
                                <span>{d.name}</span>
                                {formData.designation === d.name && <div className="w-1.5 h-1.5 rounded-full bg-indigo-600" />}
                              </div>
                            ))}
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
                          {shifts.find(s => s._id === formData.shift)?.shiftName || 'Select Shift'}
                        </span>
                        <ChevronDown size={18} className={`text-slate-400 transition-transform ${activeModalDropdown === 'shift' ? 'rotate-180' : ''}`} />
                      </div>
                      <AnimatePresence>
                        {activeModalDropdown === 'shift' && (
                          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} className="absolute z-[2100] top-full left-0 right-0 mt-2 bg-white border border-slate-100 rounded-2xl shadow-2xl p-2 max-h-48 overflow-y-auto no-scrollbar">
                            {shifts.map(s => (
                              <div key={s._id} onClick={() => { setFormData({ ...formData, shift: s._id }); setActiveModalDropdown(null); }} className="p-3 rounded-xl hover:bg-indigo-50 text-xs font-bold text-slate-600 hover:text-indigo-600 cursor-pointer transition-all">
                                <div className="flex items-center justify-between">
                                  <span>{s.shiftName}</span>
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

      <AnimatePresence>
        {showSuccessModal && successData && (
          <div className="fixed inset-0 z-[4000] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white rounded-[2.5rem] p-8 w-full max-w-[450px] shadow-2xl relative overflow-hidden text-center"
            >
              <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-indigo-500 to-purple-500"></div>

              <div className="flex justify-between items-start mb-6">
                <div className="bg-emerald-50 text-emerald-600 p-3 rounded-2xl">
                  <UserPlus size={24} />
                </div>
                <button
                  onClick={() => setShowSuccessModal(false)}
                  className="bg-slate-50 p-2 rounded-xl text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <h3 className="text-2xl font-bold text-slate-900 mb-2 tracking-tight">Profile Created!</h3>
              <p className="text-slate-500 text-sm font-bold mb-6">Share these credentials with the employee</p>

              <div className="bg-slate-50 rounded-3xl p-6 mb-8 border border-slate-100 space-y-4 text-left">
                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-slate-400  tracking-widest">Employee Info</p>
                  <p className="text-sm font-bold text-slate-800">Hi {successData.name}</p>
                  <p className="text-[13px] font-bold text-slate-600">Your profile has been created</p>
                </div>

                <div className="space-y-2 pt-2 border-t border-slate-200/60">
                  <p className="text-[10px] font-bold text-slate-400  tracking-widest">Download Links</p>
                  <div className="space-y-1.5">
                    <p className="text-[12px] font-bold text-indigo-600 leading-tight">Android: <span className="text-slate-500 underline text-[11px] break-all">{import.meta.env.VITE_ANDROID_APK_URL}</span></p>
                    <p className="text-[12px] font-bold text-indigo-600 leading-tight">iOS: <span className="text-slate-500 underline text-[11px] break-all">{import.meta.env.VITE_IOS_APP_URL}</span></p>
                  </div>
                </div>

                <div className="space-y-2 pt-2 border-t border-slate-200/60">
                  <p className="text-[10px] font-bold text-slate-400  tracking-widest">Login Credentials</p>
                  <div className="grid grid-cols-1">
                    <div>
                      <p className="text-[10px] font-bold text-slate-400">Emp ID</p>
                      <p className="text-xs font-bold text-slate-800 break-all">{successData._id || 'Generating...'}</p>
                    </div>
                  </div>
                  <div className="pt-2">
                    <p className="text-[10px] font-bold text-slate-400">User Identifiers</p>
                    <p className="text-xs font-bold text-slate-800">{successData.email} / {successData.mobile}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 pt-2">Password</p>
                    <p className="text-xs font-bold text-slate-800">{successData.password || '12345678'}</p>
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    const websiteLink = window.location.origin;
                    const shareText = `*Geo-Attendance HRMS*\n${websiteLink}\n\nHi ${successData.name}\nYour profile has been created successfully.\n\n*Download App:*\nAndroid: ${import.meta.env.VITE_ANDROID_APK_URL}\niOS: ${import.meta.env.VITE_IOS_APP_URL}\n\n*Login Credentials:*\nEmp ID: ${successData._id}\nUser: ${successData.email} / ${successData.mobile}\nPassword: ${successData.password || '12345678'}\n\n_Keep your credentials secure._`;
                    navigator.clipboard.writeText(shareText);
                    toast.success('Credentials copied to clipboard');
                    setShowSuccessModal(false);
                  }}
                  className="flex-1 bg-indigo-600 text-white font-bold py-4 rounded-2xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 flex items-center justify-center gap-2"
                >
                  <Copy size={18} />
                  Copy Info
                </button>
                <button
                  onClick={() => {
                    const websiteLink = window.location.origin;
                    const shareText = `*Geo-Attendance HRMS*\n${websiteLink}\n\nHi ${successData.name}\nYour profile has been created successfully.\n\n*Download App:*\nAndroid: ${import.meta.env.VITE_ANDROID_APK_URL}\niOS: ${import.meta.env.VITE_IOS_APP_URL}\n\n*Login Credentials:*\nEmp ID: ${successData._id}\nUser: ${successData.email} / ${successData.mobile}\nPassword: ${successData.password || '12345678'}\n\n_Keep your credentials secure._`;
                    if (navigator.share) {
                      navigator.share({
                        title: 'Employee Credentials - Geo HRMS',
                        text: shareText
                      }).catch(() => { });
                    } else {
                      window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, '_blank');
                    }
                    setShowSuccessModal(false);
                  }}
                  className="flex-1 bg-emerald-600 text-white font-bold py-4 rounded-2xl hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-200 flex items-center justify-center gap-2"
                >
                  <Share2 size={18} />
                  Share
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showFormatModal && (
          <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-slate-900/40 backdrop-blur-md p-4 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-4xl rounded-[3rem] shadow-2xl flex flex-col overflow-hidden"
            >
              <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center">
                    <FileText size={20} />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-slate-900 tracking-tight">Bulk Upload Format</h3>
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Excel / CSV Column Guide</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowFormatModal(false)}
                  className="w-10 h-10 rounded-xl bg-white text-slate-400 flex items-center justify-center hover:bg-rose-50 hover:text-rose-500 transition-all shadow-sm"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="p-8">
                <div className="bg-amber-50 border border-amber-100 p-4 rounded-2xl flex gap-4 mb-6">
                  <AlertCircle className="text-amber-500 shrink-0" size={20} />
                  <p className="text-xs font-bold text-amber-800 leading-relaxed">
                    Please ensure your file has exactly these column headers in the first row. The order is not critical, but the names must match exactly.
                  </p>
                </div>

                <div className="overflow-hidden rounded-2xl border border-slate-100">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50">
                        <th className="px-4 py-3 text-left text-[11px] font-bold text-slate-400 uppercase tracking-widest">Column Name</th>
                        <th className="px-4 py-3 text-left text-[11px] font-bold text-slate-400 uppercase tracking-widest">Example</th>
                        <th className="px-4 py-3 text-left text-[11px] font-bold text-slate-400 uppercase tracking-widest">Description</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {[
                        { col: 'ID', ex: 'EMP001', desc: 'Employee ID' },
                        { col: 'Full Name', ex: 'John Doe', desc: 'Full name of the employee' },
                        { col: 'Email', ex: 'john@example.com', desc: 'Work or personal email address' },
                        { col: 'Contact Number', ex: '9876543210', desc: '10-digit mobile number' },
                        { col: 'Gender', ex: 'Male', desc: 'Male or Female' },
                        { col: 'Shift', ex: 'General', desc: 'Must match an existing shift name' },
                        { col: 'Department', ex: 'Engineering', desc: 'Must match an existing department name' },
                        { col: 'Designation', ex: 'Developer', desc: 'Must match an existing designation name' },
                        { col: 'Present Working Place', ex: 'Office', desc: 'Must match an existing working place' }
                      ].map((row, i) => (
                        <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-4 py-3 font-bold text-indigo-600">{row.col}</td>
                          <td className="px-4 py-3 text-slate-600 font-medium">{row.ex}</td>
                          <td className="px-4 py-3 text-slate-500 text-xs font-medium">{row.desc}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-8 flex justify-end">
                  <button
                    onClick={() => setShowFormatModal(false)}
                    className="px-8 py-3 bg-slate-900 text-white rounded-2xl font-bold text-sm hover:bg-slate-800 transition-all shadow-xl shadow-slate-200"
                  >
                    Got it, Close
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showFormatModal && (
          <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-slate-900/40 backdrop-blur-md p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
            >
              <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center">
                <div>
                  <h3 className="text-xl font-bold text-slate-900 tracking-tighter m-0">
                    Employee Import Format
                  </h3>
                  <p className="text-slate-400 text-[10px] font-bold tracking-widest mt-1">
                    EXCEL/XLSX Column mapping
                  </p>
                </div>
                <button
                  onClick={() => setShowFormatModal(false)}
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
                        <th className="pb-4 border border-slate-200 px-2">COLUMN NAME</th>
                        <th className="pb-4 border border-slate-200 px-2">EXAMPLE VALUE</th>
                        <th className="pb-4 border border-slate-200 px-2">DESCRIPTION</th>
                      </tr>
                    </thead>
                    <tbody className="text-slate-700 font-bold">
                      <tr>
                        <td className="py-3 text-indigo-600 border border-slate-200 px-2 uppercase">name</td>
                        <td className="py-3 border border-slate-200 px-2 text-xs">John Doe</td>
                        <td className="py-3 text-[11px] font-medium text-slate-500 border border-slate-200 px-2 italic">Full name of employee</td>
                      </tr>
                      <tr>
                        <td className="py-3 text-indigo-600 border border-slate-200 px-2 uppercase">email</td>
                        <td className="py-3 border border-slate-200 px-2 text-xs">john@company.com</td>
                        <td className="py-3 text-[11px] font-medium text-slate-500 border border-slate-200 px-2 italic">Official email address</td>
                      </tr>
                      <tr>
                        <td className="py-3 text-indigo-600 border border-slate-200 px-2 uppercase">mobile</td>
                        <td className="py-3 border border-slate-200 px-2 text-xs">9876543210</td>
                        <td className="py-3 text-[11px] font-medium text-slate-500 border border-slate-200 px-2 italic">10-digit mobile number</td>
                      </tr>
                      <tr>
                        <td className="py-3 text-indigo-600 border border-slate-200 px-2 uppercase">password</td>
                        <td className="py-3 border border-slate-200 px-2 text-xs">pass123</td>
                        <td className="py-3 text-[11px] font-medium text-slate-500 border border-slate-200 px-2 italic">Initial login password</td>
                      </tr>
                      <tr>
                        <td className="py-3 text-indigo-600 border border-slate-200 px-2 uppercase">department</td>
                        <td className="py-3 border border-slate-200 px-2 text-xs">IT</td>
                        <td className="py-3 text-[11px] font-medium text-slate-500 border border-slate-200 px-2 italic">Assigned department</td>
                      </tr>
                      <tr>
                        <td className="py-3 text-indigo-600 border border-slate-200 px-2 uppercase">designation</td>
                        <td className="py-3 border border-slate-200 px-2 text-xs">Developer</td>
                        <td className="py-3 text-[11px] font-medium text-slate-500 border border-slate-200 px-2 italic">Assigned designation</td>
                      </tr>
                      <tr>
                        <td className="py-3 text-indigo-600 border border-slate-200 px-2 uppercase">gender</td>
                        <td className="py-3 border border-slate-200 px-2 text-xs">Male</td>
                        <td className="py-3 text-[11px] font-medium text-slate-500 border border-slate-200 px-2 italic">Male / Female</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => setShowFormatModal(false)}
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
    </div>
  );
};

export default Employees;
