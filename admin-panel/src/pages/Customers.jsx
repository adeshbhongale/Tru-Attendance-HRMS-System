import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  Calendar,
  Check,
  ChevronDown,
  ChevronLeft, ChevronRight,
  Download,
  Edit2,
  Loader2,
  Plus,
  Save,
  Search,
  Trash2,
  Users,
  X
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import api from '../api/axios';
import CalendarPicker from '../components/CalendarPicker';

const Customers = () => {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showExportDropdown, setShowExportDropdown] = useState(false);
  const exportDropdownRef = useRef(null);

  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [schedulingCustomer, setSchedulingCustomer] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [loadingEmployees, setLoadingEmployees] = useState(false);

  const [scheduleData, setScheduleData] = useState({
    employeeIds: [],
    scheduledDate: '',
    scheduledTime: '10:00',
    reason: ''
  });

  // Custom Time Picker states
  const [typedHour, setTypedHour] = useState('10');
  const [typedMinute, setTypedMinute] = useState('00');
  const [selectedPeriod, setSelectedPeriod] = useState('AM');

  // Custom Date Picker and Dropdown states/refs
  const [showFormCalendar, setShowFormCalendar] = useState(false);
  const formCalendarRef = useRef(null);
  const [showEmployeeDropdown, setShowEmployeeDropdown] = useState(false);
  const employeeDropdownRef = useRef(null);
  const [employeeSearch, setEmployeeSearch] = useState('');

  const [showModal, setShowModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [saving, setSaving] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const [deleteConfirm, setDeleteConfirm] = useState({ show: false, id: null });
  const [searchQuery, setSearchQuery] = useState('');

  const [formData, setFormData] = useState({
    customerName: '',
    customerCode: '',
    contactPerson: '',
    mobile: '',
    email: '',
    address: '',
    latitude: '',
    longitude: '',
    notes: '',
    isActive: true
  });

  useEffect(() => {
    fetchCustomers();
  }, []);

  const getTodayStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (exportDropdownRef.current && !exportDropdownRef.current.contains(e.target)) {
        setShowExportDropdown(false);
      }
      if (formCalendarRef.current && !formCalendarRef.current.contains(e.target)) {
        setShowFormCalendar(false);
      }
      if (employeeDropdownRef.current && !employeeDropdownRef.current.contains(e.target)) {
        setShowEmployeeDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleOpenScheduleModal = async (cust) => {
    setSchedulingCustomer(cust);
    setScheduleData({
      employeeIds: [],
      scheduledDate: getTodayStr(),
      scheduledTime: '10:00',
      reason: ''
    });
    setTypedHour('10');
    setTypedMinute('00');
    setSelectedPeriod('AM');
    setEmployeeSearch('');
    setShowScheduleModal(true);

    if (employees.length === 0) {
      try {
        setLoadingEmployees(true);
        const res = await api.get('/employees?limit=1000');
        setEmployees(res.data.data);
      } catch (err) {
        toast.error('Failed to load employees');
      } finally {
        setLoadingEmployees(false);
      }
    }
  };

  const formatTime12to24 = (h, m, period) => {
    let hour = parseInt(h, 10);
    if (isNaN(hour)) hour = 10;
    if (period === 'PM' && hour < 12) hour += 12;
    if (period === 'AM' && hour === 12) hour = 0;
    return `${String(hour).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  };

  const handleHourChange = (e) => {
    const val = e.target.value.replace(/\D/g, '');
    if (val === '') {
      setTypedHour('');
      return;
    }
    let num = parseInt(val, 10);
    if (num > 12) num = 12;
    if (num < 1) num = 1;
    setTypedHour(String(num));
  };

  const handleHourBlur = () => {
    if (typedHour === '') {
      setTypedHour('12');
      return;
    }
    const num = parseInt(typedHour, 10);
    setTypedHour(String(num).padStart(2, '0'));
  };

  const handleMinuteChange = (e) => {
    const val = e.target.value.replace(/\D/g, '');
    if (val === '') {
      setTypedMinute('');
      return;
    }
    let num = parseInt(val, 10);
    if (num > 59) num = 59;
    setTypedMinute(String(num));
  };

  const handleMinuteBlur = () => {
    if (typedMinute === '') {
      setTypedMinute('00');
      return;
    }
    const num = parseInt(typedMinute, 10);
    setTypedMinute(String(num).padStart(2, '0'));
  };

  const toggleEmployeeSelection = (empId) => {
    setScheduleData(prev => {
      const isSelected = prev.employeeIds.includes(empId);
      const newIds = isSelected 
        ? prev.employeeIds.filter(id => id !== empId)
        : [...prev.employeeIds, empId];
      return { ...prev, employeeIds: newIds };
    });
  };

  const getSelectedEmployeesLabel = () => {
    if (scheduleData.employeeIds.length === 0) return '-- Select Employees --';
    const names = scheduleData.employeeIds.map(id => employees.find(emp => emp._id === id)?.name).filter(Boolean);
    if (names.length <= 2) return names.join(', ');
    return `${names.slice(0, 2).join(', ')} + ${names.length - 2} more`;
  };

  const handleSubmitSchedule = async (e) => {
    e.preventDefault();
    if (scheduleData.employeeIds.length === 0) {
      toast.error('Please select at least one employee');
      return;
    }
    if (!scheduleData.scheduledDate) {
      toast.error('Please select a scheduled date');
      return;
    }
    try {
      setSaving(true);
      const formattedTime = formatTime12to24(typedHour, typedMinute, selectedPeriod);
      
      const promises = scheduleData.employeeIds.map(empId => {
        const payload = {
          visitType: 'customer',
          customerId: schedulingCustomer._id,
          employeeId: empId,
          scheduledDate: scheduleData.scheduledDate,
          scheduledTime: formattedTime,
          reason: scheduleData.reason
        };
        return api.post('/visits', payload);
      });

      await Promise.all(promises);
      toast.success('Visits scheduled successfully');
      setShowScheduleModal(false);
      navigate('/visits-reports');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to schedule visits');
    } finally {
      setSaving(false);
    }
  };

  const exportToPDF = () => {
    if (filteredCustomers.length === 0) {
      toast.error('No data to export');
      return;
    }

    const doc = new jsPDF('p', 'mm', 'a4'); // Portrait A4
    doc.setFontSize(20);
    doc.setTextColor(79, 70, 229); // Indigo-600
    doc.text('Customer Directory', 14, 20);

    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139); // Slate-500
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 28);

    doc.setDrawColor(241, 245, 249);
    doc.line(14, 33, 196, 33);

    const headers = [["Customer", "Email", "Mobile", "Address", "Status"]];
    const data = filteredCustomers.map(c => [
      c.customerName,
      c.email || '—',
      c.mobile || '—',
      c.address || '—',
      c.isActive ? 'Active' : 'Inactive'
    ]);

    autoTable(doc, {
      head: headers,
      body: data,
      startY: 37,
      theme: 'grid',
      headStyles: { fillColor: [79, 70, 229], textColor: [255, 255, 255], fontSize: 9, fontStyle: 'bold' },
      bodyStyles: { fontSize: 8, textColor: [51, 65, 85] },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { top: 20 }
    });

    doc.save(`customers_report_${Date.now()}.pdf`);
  };

  const fetchCustomers = async () => {
    try {
      setLoading(true);
      const res = await api.get('/customers?limit=1000'); // fetch all
      setCustomers(res.data.data);
    } catch (err) {
      toast.error('Failed to load customers');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (cust = null) => {
    if (cust) {
      setEditingCustomer(cust);
      setFormData({
        customerName: cust.customerName,
        customerCode: cust.customerCode || '',
        contactPerson: cust.contactPerson || '',
        mobile: cust.mobile || '',
        email: cust.email || '',
        address: cust.address || '',
        latitude: cust.latitude !== undefined ? String(cust.latitude) : '',
        longitude: cust.longitude !== undefined ? String(cust.longitude) : '',
        notes: cust.notes || '',
        isActive: cust.isActive ?? true
      });
    } else {
      setEditingCustomer(null);
      setFormData({
        customerName: '',
        customerCode: '',
        contactPerson: '',
        mobile: '',
        email: '',
        address: '',
        latitude: '',
        longitude: '',
        notes: '',
        isActive: true
      });
    }
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setSaving(true);
      const payload = {
        ...formData,
        latitude: formData.latitude ? Number(formData.latitude) : undefined,
        longitude: formData.longitude ? Number(formData.longitude) : undefined
      };

      if (editingCustomer) {
        await api.put(`/customers/${editingCustomer._id}`, payload);
        toast.success('Customer updated');
      } else {
        await api.post('/customers', payload);
        toast.success('Customer created');
      }
      fetchCustomers();
      setShowModal(false);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Action failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm.id) return;
    try {
      await api.delete(`/customers/${deleteConfirm.id}`);
      toast.success('Customer deleted');
      fetchCustomers();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete customer');
    }
  };

  const toggleStatus = async (cust) => {
    try {
      const newStatus = !cust.isActive;
      await api.put(`/customers/${cust._id}`, { isActive: newStatus });
      toast.success(`Customer ${newStatus ? 'activated' : 'deactivated'}`);
      fetchCustomers();
    } catch (err) {
      toast.error('Failed to update status');
    }
  };

  const filteredCustomers = useMemo(() => {
    return customers.filter(c => {
      const matchesSearch =
        (c.customerName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (c.customerCode || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (c.contactPerson || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (c.mobile || '').includes(searchQuery);

      return matchesSearch;
    });
  }, [customers, searchQuery]);

  const exportToCSV = () => {
    const headers = ['Customer Name', 'Email', 'Mobile', 'Address', 'Status'];
    const data = filteredCustomers.map(c => [
      c.customerName,
      c.email || '',
      c.mobile || '',
      c.address || '',
      c.isActive ? 'Active' : 'Inactive'
    ]);
    const csvContent = "\ufeff" + [headers, ...data].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "customers.csv");
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

  const totalPages = Math.ceil(filteredCustomers.length / itemsPerPage);
  const paginatedData = filteredCustomers.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  return (
    <>
      <div className="space-y-6 md:space-y-8 animate-fade-up">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight m-0">Customers</h2>
            <p className="text-slate-600 font-bold text-[13px] mt-2">Manage customer accounts and geolocation logs</p>
          </div>
          <div className="flex items-center gap-3 w-full md:w-auto">
            <div className="relative" ref={exportDropdownRef}>
              <button
                onClick={() => setShowExportDropdown(!showExportDropdown)}
                className="flex items-center justify-center gap-2 bg-white text-slate-600 border border-slate-200 px-4 py-3 rounded-2xl font-bold text-sm hover:bg-slate-50 transition-all active:scale-95 shadow-sm"
              >
                <Download size={18} />
                Export Data
                <ChevronDown size={14} className={`transition-transform duration-200 ${showExportDropdown ? 'rotate-180' : ''}`} />
              </button>

              <AnimatePresence>
                {showExportDropdown && (
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 5, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    className="absolute right-0 mt-2 z-50 bg-white border border-slate-200 rounded-2xl shadow-2xl p-2 w-48 flex flex-col gap-1"
                  >
                    <button
                      onClick={() => {
                        exportToCSV();
                        setShowExportDropdown(false);
                      }}
                      className="w-full text-left px-4 py-2.5 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50 hover:text-indigo-600 transition-colors"
                    >
                      Export to CSV
                    </button>
                    <button
                      onClick={() => {
                        exportToPDF();
                        setShowExportDropdown(false);
                      }}
                      className="w-full text-left px-4 py-2.5 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50 hover:text-indigo-600 transition-colors"
                    >
                      Export to PDF
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <button
              className="flex flex-1 md:flex-none items-center justify-center gap-2 bg-indigo-600 text-white px-6 py-3 rounded-2xl font-bold text-sm shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all active:scale-95"
              onClick={() => handleOpenModal()}
            >
              <Plus size={18} />
              Add Customer
            </button>
          </div>
        </div>

        <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-xl overflow-hidden">
          <div className="p-6 border-b border-slate-50 flex flex-col sm:flex-row gap-4 justify-between items-stretch">
            <div className="relative flex-1 max-w-md">
              <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search customers..."
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                className="w-full bg-slate-50 border border-slate-100 pl-12 pr-4 py-3 rounded-2xl text-sm font-bold text-slate-700 outline-none focus:bg-white focus:border-indigo-100 transition-all shadow-sm"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse border border-slate-200">
              <thead>
                <tr className="bg-slate-50/30">
                  <th className="px-6 py-5 text-[10px] font-extrabold text-indigo-600 tracking-widest text-center border border-slate-200">CUSTOMER</th>
                  <th className="px-6 py-5 text-[10px] font-extrabold text-indigo-600 tracking-widest text-center border border-slate-200">EMAIL</th>
                  <th className="px-6 py-5 text-[10px] font-extrabold text-indigo-600 tracking-widest text-center border border-slate-200">MOBILE</th>
                  <th className="px-6 py-5 text-[10px] font-extrabold text-indigo-600 tracking-widest text-center border border-slate-200">ADDRESS</th>
                  <th className="px-6 py-5 text-[10px] font-extrabold text-indigo-600 tracking-widest text-center border border-slate-200">ACTIONS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {paginatedData.map((cust) => (
                  <tr key={cust._id} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="px-6 py-5 border border-slate-200 text-center text-sm font-bold text-slate-900">
                      {cust.customerName}
                    </td>
                    <td className="px-6 py-5 border border-slate-200 text-center text-sm font-bold text-slate-700">
                      {cust.email || '—'}
                    </td>
                    <td className="px-6 py-5 border border-slate-200 text-center text-sm font-bold text-slate-700">
                      {cust.mobile || '—'}
                    </td>
                    <td className="px-6 py-5 border border-slate-200 text-center text-xs font-semibold text-slate-600">
                      {cust.address || '—'}
                    </td>
                    <td className="px-6 py-5 border border-slate-200 text-center">
                      <div className="flex justify-center gap-2">
                        <button
                          onClick={() => handleOpenScheduleModal(cust)}
                          className="p-2 rounded-xl bg-slate-50 text-slate-400 hover:bg-emerald-600 hover:text-white transition-all shadow-sm border border-slate-200 flex items-center justify-center"
                          title="Schedule Visit"
                        >
                          <Calendar size={14} />
                        </button>
                        <button
                          onClick={() => handleOpenModal(cust)}
                          className="p-2 rounded-xl bg-slate-50 text-slate-400 hover:bg-indigo-600 hover:text-white transition-all shadow-sm border border-slate-200"
                          title="Edit Customer"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          onClick={() => setDeleteConfirm({ show: true, id: cust._id })}
                          className="p-2 rounded-xl bg-slate-50 text-slate-400 hover:bg-rose-600 hover:text-white transition-all shadow-sm border border-slate-200"
                          title="Delete Customer"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredCustomers.length === 0 && (
                  <tr>
                    <td colSpan="5" className="px-6 py-20 text-center">
                      <div className="flex flex-col items-center">
                        <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-300 mb-4">
                          <Users size={32} />
                        </div>
                        <p className="text-slate-400 font-bold text-sm">No customers found.</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {filteredCustomers.length > itemsPerPage && (
            <div className="px-8 py-5 bg-slate-50/50 border-t border-slate-100 flex flex-col md:flex-row justify-between items-center gap-4">
              <p className="text-xs font-bold text-slate-500">
                Showing <span className="text-slate-900">{(currentPage - 1) * itemsPerPage + 1}</span> to <span className="text-slate-900">{Math.min(currentPage * itemsPerPage, filteredCustomers.length)}</span> of <span className="text-slate-900">{filteredCustomers.length}</span> entries
              </p>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                  disabled={currentPage === 1}
                  className="p-2 bg-white border border-slate-200 rounded-xl text-slate-400 hover:text-indigo-600 transition-all shadow-sm disabled:opacity-50 active:scale-95"
                >
                  <ChevronLeft size={16} />
                </button>

                <div className="flex items-center gap-1.5">
                  {(() => {
                    const pages = [];
                    const maxVisible = 5;
                    if (totalPages <= maxVisible + 2) {
                      for (let i = 1; i <= totalPages; i++) pages.push(i);
                    } else {
                      if (currentPage <= 3) {
                        pages.push(1, 2, 3, '...', totalPages - 1, totalPages);
                      } else if (currentPage >= totalPages - 2) {
                        pages.push(1, 2, '...', totalPages - 2, totalPages - 1, totalPages);
                      } else {
                        pages.push(1, '...', currentPage, '...', totalPages);
                      }
                    }
                    return pages.map((p, i) => (
                      p === '...' ? (
                        <span key={`sep-${i}`} className="text-slate-300 px-1 font-bold">...</span>
                      ) : (
                        <button
                          key={p}
                          onClick={() => setCurrentPage(p)}
                          className={`w-8 h-8 rounded-xl text-[10px] font-bold transition-all ${currentPage === p ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' : 'bg-white border border-slate-200 text-slate-500 hover:bg-slate-50'}`}
                        >
                          {p}
                        </button>
                      )
                    ));
                  })()}
                </div>

                <button
                  onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                  disabled={currentPage === totalPages}
                  className="p-2 bg-white border border-slate-200 rounded-xl text-slate-400 hover:text-indigo-600 transition-all shadow-sm disabled:opacity-50 active:scale-95"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Add / Edit Customer Modal */}
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
                <h3 className="text-xl font-bold text-slate-900 tracking-tighter m-0">
                  {editingCustomer ? 'Edit Customer' : 'Add New Customer'}
                </h3>
                <button
                  onClick={() => setShowModal(false)}
                  className="w-10 h-10 rounded-xl bg-slate-50 text-slate-400 flex items-center justify-center hover:bg-rose-50 hover:text-rose-500 transition-all"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="p-8 overflow-y-auto">
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-[11px] font-bold text-slate-400 tracking-widest ml-1">Customer Name</label>
                      <input
                        type="text"
                        value={formData.customerName}
                        onChange={(e) => setFormData({ ...formData, customerName: e.target.value })}
                        required
                        className="w-full bg-slate-50 border-2 border-slate-200 focus:border-indigo-100 focus:bg-white px-5 py-4 rounded-2xl outline-none transition-all text-sm font-bold text-slate-800"
                        placeholder="Enter Customer Name"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-[11px] font-bold text-slate-400 tracking-widest ml-1">Mobile Number</label>
                      <input
                        type="text"
                        value={formData.mobile}
                        onChange={(e) => setFormData({ ...formData, mobile: e.target.value })}
                        className="w-full bg-slate-50 border-2 border-slate-200 focus:border-indigo-100 focus:bg-white px-5 py-4 rounded-2xl outline-none transition-all text-sm font-bold text-slate-800"
                        placeholder="Enter Mobile Number"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-[11px] font-bold text-slate-400 tracking-widest ml-1">Email Address</label>
                      <input
                        type="email"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        className="w-full bg-slate-50 border-2 border-slate-200 focus:border-indigo-100 focus:bg-white px-5 py-4 rounded-2xl outline-none transition-all text-sm font-bold text-slate-800"
                        placeholder="Enter Email Address"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-[11px] font-bold text-slate-400 tracking-widest ml-1">Physical Address</label>
                      <textarea
                        value={formData.address}
                        onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                        className="w-full bg-slate-50 border-2 border-slate-200 focus:border-indigo-100 focus:bg-white px-5 py-4 rounded-2xl outline-none transition-all text-sm font-bold text-slate-800 min-h-[80px] resize-none"
                        placeholder="Enter Physical Address"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-[11px] font-bold text-slate-400 tracking-widest ml-1">Notes / Additional Info</label>
                      <textarea
                        value={formData.notes}
                        onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                        className="w-full bg-slate-50 border-2 border-slate-200 focus:border-indigo-100 focus:bg-white px-5 py-4 rounded-2xl outline-none transition-all text-sm font-bold text-slate-800 min-h-[80px] resize-none"
                        placeholder="Enter Notes"
                      />
                    </div>
                  </div>

                  <button
                      type="submit"
                      disabled={saving}
                      className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold text-sm shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                      {editingCustomer ? 'Update Customer' : 'Create Customer'}
                    </button>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>



      {/* Delete Confirmation Dialog */}
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
                Are you sure you want to delete this customer? All historical visits associated with this customer will remain in database but the customer profile will be permanently deleted.
              </p>
              <div className="flex w-full gap-3">
                <button onClick={() => setDeleteConfirm({ show: false, id: null })} className="flex-1 py-3 bg-slate-50 text-slate-600 rounded-xl font-bold text-sm hover:bg-slate-100 transition-all">
                  Cancel
                </button>
                <button onClick={() => { handleDelete(); setDeleteConfirm({ show: false, id: null }); }} className="flex-1 py-3 bg-rose-500 text-white rounded-xl font-bold text-sm shadow-lg shadow-rose-200 hover:bg-rose-600 transition-all">
                  Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Schedule Visit Modal */}
      <AnimatePresence>
        {showScheduleModal && schedulingCustomer && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.98, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: 20 }}
              className="bg-white w-full max-w-lg rounded-2xl shadow-2xl flex flex-col overflow-hidden"
            >
              <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-white shrink-0">
                <div>
                  <h3 className="text-lg font-bold text-slate-900 tracking-tighter m-0">
                    Schedule Visit
                  </h3>
                  <p className="text-slate-500 font-bold text-[11px] mt-1">Assigning visit for {schedulingCustomer.customerName}</p>
                </div>
                <button
                  onClick={() => setShowScheduleModal(false)}
                  className="w-10 h-10 rounded-xl bg-slate-50 text-slate-400 flex items-center justify-center hover:bg-rose-50 hover:text-rose-500 transition-all border border-slate-100"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="p-6">
                <form onSubmit={handleSubmitSchedule} className="space-y-4">
                  {/* Custom Employee Dropdown */}
                  <div className="space-y-1.5 relative" ref={employeeDropdownRef}>
                    <label className="text-[10px] font-bold text-slate-400 tracking-wider block">Assign Employees <span className="text-rose-500">*</span></label>
                    {loadingEmployees ? (
                      <div className="flex items-center gap-2 text-xs font-bold text-slate-400 py-3 bg-slate-50 px-4 rounded-xl border border-slate-100">
                        <Loader2 className="animate-spin text-indigo-600" size={14} />
                        Loading employees...
                      </div>
                    ) : (
                      <>
                        <div
                          onClick={() => setShowEmployeeDropdown(!showEmployeeDropdown)}
                          className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-xl cursor-pointer hover:bg-slate-100/50 transition-all text-xs font-bold text-slate-700 flex justify-between items-center shadow-sm"
                        >
                          <div className="flex items-center gap-2 truncate">
                            <Users size={14} className="text-indigo-600 shrink-0" />
                            <span className="truncate">{getSelectedEmployeesLabel()}</span>
                          </div>
                          <ChevronDown size={14} className={`text-slate-400 transition-transform shrink-0 ${showEmployeeDropdown ? 'rotate-180' : ''}`} />
                        </div>

                        <AnimatePresence>
                          {showEmployeeDropdown && (
                            <motion.div
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 5 }}
                              exit={{ opacity: 0, y: 10 }}
                              className="absolute top-full left-0 right-0 mt-1 z-50 bg-white border border-slate-200 rounded-2xl shadow-2xl p-3 flex flex-col gap-2 max-h-60"
                            >
                              <div className="relative shrink-0">
                                <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input
                                  type="text"
                                  placeholder="Search employee..."
                                  value={employeeSearch}
                                  onChange={(e) => setEmployeeSearch(e.target.value)}
                                  className="w-full bg-slate-50 border border-slate-200 pl-8 pr-3 py-2 rounded-lg text-xs font-bold text-slate-700 outline-none focus:border-indigo-100 transition-all shadow-sm"
                                />
                              </div>

                              <div className="overflow-y-auto flex-1 space-y-0.5 pr-1">
                                {employees
                                  .filter(emp => (emp.name || '').toLowerCase().includes((employeeSearch || '').toLowerCase()))
                                  .map((emp) => {
                                    const isSelected = scheduleData.employeeIds.includes(emp._id);
                                    return (
                                      <button
                                        key={emp._id}
                                        type="button"
                                        onClick={() => toggleEmployeeSelection(emp._id)}
                                        className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors"
                                      >
                                        <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                                          isSelected ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300 bg-white'
                                        }`}>
                                          {isSelected && <Check size={10} className="text-white" />}
                                        </div>
                                        <div className="flex-1 text-left min-w-0">
                                          <p className="text-slate-800 font-bold truncate leading-tight">{emp.name}</p>
                                          <p className="text-slate-400 font-medium text-[10px] truncate mt-0.5">{emp.designation || 'Employee'}</p>
                                        </div>
                                      </button>
                                    );
                                  })}
                                {employees.filter(emp => (emp.name || '').toLowerCase().includes((employeeSearch || '').toLowerCase())).length === 0 && (
                                  <div className="text-center py-4 text-xs font-bold text-slate-400">
                                    No employees found
                                  </div>
                                )}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Custom Date Picker using CalendarPicker with allowFutureOnly */}
                    <div className="space-y-1.5 relative" ref={formCalendarRef}>
                      <label className="text-[10px] font-bold text-slate-400 tracking-wider block">Scheduled Date <span className="text-rose-500">*</span></label>
                      <div
                        onClick={() => setShowFormCalendar(!showFormCalendar)}
                        className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-xl cursor-pointer hover:bg-slate-100/50 transition-all text-xs font-bold text-slate-700 flex justify-between items-center shadow-sm"
                      >
                        <div className="flex items-center gap-2">
                          <Calendar size={14} className="text-indigo-600" />
                          <span>
                            {scheduleData.scheduledDate ? new Date(scheduleData.scheduledDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Select Date'}
                          </span>
                        </div>
                        <ChevronDown size={14} className={`text-slate-400 transition-transform ${showFormCalendar ? 'rotate-180' : ''}`} />
                      </div>

                      <AnimatePresence>
                        {showFormCalendar && (
                          <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 5 }}
                            exit={{ opacity: 0, y: 10 }}
                            className="absolute top-full left-0 mt-1 z-50 bg-white border border-slate-200 rounded-2xl shadow-2xl p-3"
                          >
                            <CalendarPicker
                              selectedDate={scheduleData.scheduledDate}
                              allowFutureOnly={true}
                              onSelect={(date) => {
                                setScheduleData({ ...scheduleData, scheduledDate: date });
                                setShowFormCalendar(false);
                              }}
                              onClose={() => setShowFormCalendar(false)}
                            />
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    {/* Custom Time Picker */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-400 tracking-wider block">Scheduled Time <span className="text-rose-500">*</span></label>
                      <div className="flex items-center gap-2">
                        {/* Hour Input */}
                        <div className="flex-1 relative">
                          <input
                            type="text"
                            maxLength={2}
                            value={typedHour}
                            onChange={handleHourChange}
                            onBlur={handleHourBlur}
                            placeholder="10"
                            className="w-full bg-slate-50 border border-slate-200 px-3 py-2.5 rounded-xl outline-none transition-all text-xs font-bold text-slate-700 text-center shadow-sm focus:bg-white focus:border-indigo-100"
                          />
                        </div>

                        <span className="text-slate-400 font-extrabold text-md">:</span>

                        {/* Minute Input */}
                        <div className="flex-1 relative">
                          <input
                            type="text"
                            maxLength={2}
                            value={typedMinute}
                            onChange={handleMinuteChange}
                            onBlur={handleMinuteBlur}
                            placeholder="00"
                            className="w-full bg-slate-50 border border-slate-200 px-3 py-2.5 rounded-xl outline-none transition-all text-xs font-bold text-slate-700 text-center shadow-sm focus:bg-white focus:border-indigo-100"
                          />
                        </div>

                        {/* AM/PM buttons */}
                        <div className="flex bg-slate-100 p-0.5 rounded-xl border border-slate-200 shadow-inner shrink-0">
                          <button
                            type="button"
                            onClick={() => setSelectedPeriod('AM')}
                            className={`px-3 py-2 rounded-lg text-[10px] font-extrabold transition-all ${selectedPeriod === 'AM' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                          >
                            AM
                          </button>
                          <button
                            type="button"
                            onClick={() => setSelectedPeriod('PM')}
                            className={`px-3 py-2 rounded-lg text-[10px] font-extrabold transition-all ${selectedPeriod === 'PM' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                          >
                            PM
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Reason */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 tracking-wider block">Reason / Purpose</label>
                    <textarea
                      value={scheduleData.reason}
                      onChange={(e) => setScheduleData({ ...scheduleData, reason: e.target.value })}
                      placeholder="Enter visit purpose..."
                      className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-xl outline-none text-xs font-bold text-slate-700 focus:bg-white focus:border-indigo-100 transition-all min-h-[80px] resize-none"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={saving}
                    className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold text-sm shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2 mt-4"
                  >
                    {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                    Schedule Visit
                  </button>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};

export default Customers;
