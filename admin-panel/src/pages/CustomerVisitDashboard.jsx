import { AnimatePresence, motion } from 'framer-motion';
import {
  Calendar,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileText,
  Loader2,
  Plus,
  Save,
  Search,
  X
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';
import CalendarPicker from '../components/CalendarPicker';

const CustomerVisitDashboard = () => {
  const navigate = useNavigate();
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('customer'); // customer, employee, date
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);

  // Dropdown options
  const [customers, setCustomers] = useState([]);
  const [employees, setEmployees] = useState([]);

  // Date filters - default to 10 days ago for startDate
  const getTodayStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const getTenDaysAgoStr = () => {
    const d = new Date();
    d.setDate(d.getDate() - 10);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const [startDate, setStartDate] = useState(getTenDaysAgoStr());
  const [endDate, setEndDate] = useState(getTodayStr());

  const [showStartCalendar, setShowStartCalendar] = useState(false);
  const [showEndCalendar, setShowEndCalendar] = useState(false);
  const startCalendarRef = useRef(null);
  const endCalendarRef = useRef(null);

  // Custom Dropdowns states for Form Modal
  const [showCustDropdown, setShowCustDropdown] = useState(false);
  const [custSearchQuery, setCustSearchQuery] = useState('');
  const [showEmpDropdown, setShowEmpDropdown] = useState(false);
  const [empSearchQuery, setEmpSearchQuery] = useState('');
  const [showFormCalendar, setShowFormCalendar] = useState(false);

  const custDropdownRef = useRef(null);
  const empDropdownRef = useRef(null);
  const formCalendarRef = useRef(null);

  // Add Visit Form
  const [formData, setFormData] = useState({
    customerId: '',
    employeeId: '',
    scheduledDate: getTodayStr(),
    scheduledTime: '10:00',
    reason: ''
  });

  // Table Search Queries
  const [searchQuery, setSearchQuery] = useState('');

  // Local Time Pickers
  const [typedHour, setTypedHour] = useState('10');
  const [typedMinute, setTypedMinute] = useState('00');
  const [selectedPeriod, setSelectedPeriod] = useState('AM');

  useEffect(() => {
    if (showModal) {
      const { hour, minute, period } = parseTime24to12(formData.scheduledTime);
      setTypedHour(hour);
      setTypedMinute(minute);
      setSelectedPeriod(period);
    }
  }, [showModal]);

  useEffect(() => {
    let h = parseInt(typedHour, 10);
    let m = parseInt(typedMinute, 10);
    if (isNaN(h)) h = 10;
    if (isNaN(m)) m = 0;
    const hourStr = String(h).padStart(2, '0');
    const minuteStr = String(m).padStart(2, '0');
    const time24 = formatTime12to24(hourStr, minuteStr, selectedPeriod);
    setFormData(prev => ({
      ...prev,
      scheduledTime: time24
    }));
  }, [typedHour, typedMinute, selectedPeriod]);

  const handleHourChange = (e) => {
    const val = e.target.value.replace(/\D/g, '');
    if (val === '') {
      setTypedHour('');
      return;
    }
    const num = parseInt(val, 10);
    if (num <= 12) {
      setTypedHour(val);
    }
  };

  const handleHourBlur = () => {
    let num = parseInt(typedHour, 10);
    if (isNaN(num) || num < 1) {
      num = 12;
    }
    setTypedHour(String(num).padStart(2, '0'));
  };

  const handleMinuteChange = (e) => {
    const val = e.target.value.replace(/\D/g, '');
    if (val === '') {
      setTypedMinute('');
      return;
    }
    const num = parseInt(val, 10);
    if (num <= 59) {
      setTypedMinute(val);
    }
  };

  const handleMinuteBlur = () => {
    let num = parseInt(typedMinute, 10);
    if (isNaN(num) || num < 0 || num > 59) {
      num = 0;
    }
    setTypedMinute(String(num).padStart(2, '0'));
  };

  useEffect(() => {
    fetchAnalytics();
  }, [startDate, endDate]);

  useEffect(() => {
    if (showModal) {
      loadDropdownOptions();
    }
  }, [showModal]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (startCalendarRef.current && !startCalendarRef.current.contains(event.target)) {
        setShowStartCalendar(false);
      }
      if (endCalendarRef.current && !endCalendarRef.current.contains(event.target)) {
        setShowEndCalendar(false);
      }
      if (custDropdownRef.current && !custDropdownRef.current.contains(event.target)) {
        setShowCustDropdown(false);
      }
      if (empDropdownRef.current && !empDropdownRef.current.contains(event.target)) {
        setShowEmpDropdown(false);
      }
      if (formCalendarRef.current && !formCalendarRef.current.contains(event.target)) {
        setShowFormCalendar(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      const res = await api.get(`/visits/dashboard?startDate=${startDate}&endDate=${endDate}`);
      setAnalytics(res.data.data);
    } catch (err) {
      toast.error('Failed to load dashboard statistics');
    } finally {
      setLoading(false);
    }
  };

  const loadDropdownOptions = async () => {
    try {
      const [custRes, empRes] = await Promise.all([
        api.get('/customers?limit=1000&isActive=true'),
        api.get('/employees?limit=1000')
      ]);
      setCustomers(custRes.data.data);
      setEmployees(empRes.data.data);
    } catch (err) {
      toast.error('Failed to load dropdown selections');
    }
  };

  const handleSubmitVisit = async (e) => {
    e.preventDefault();
    if (!formData.customerId || !formData.employeeId) {
      toast.error('Please select both customer and employee');
      return;
    }
    if (!formData.reason.trim()) {
      toast.error('Please enter instructions/reason');
      return;
    }
    try {
      setSaving(true);
      await api.post('/visits', formData);
      toast.success('Visit scheduled successfully');
      setShowModal(false);
      setFormData({
        customerId: '',
        employeeId: '',
        scheduledDate: getTodayStr(),
        scheduledTime: '10:00',
        reason: ''
      });
      fetchAnalytics();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to schedule visit');
    } finally {
      setSaving(false);
    }
  };

  const parseTime24to12 = (time24) => {
    if (!time24) return { hour: '10', minute: '00', period: 'AM' };
    const [hStr, mStr] = time24.split(':');
    let h = parseInt(hStr, 10);
    if (isNaN(h)) h = 10;
    const period = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    const hour = String(h).padStart(2, '0');
    const minute = mStr || '00';
    return { hour, minute, period };
  };

  const formatTime12to24 = (hour, minute, period) => {
    let h = parseInt(hour, 10);
    if (isNaN(h)) h = 10;
    if (period === 'PM' && h < 12) h += 12;
    if (period === 'AM' && h === 12) h = 0;
    return `${String(h).padStart(2, '0')}:${minute}`;
  };

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Memoized Search filtering on breakdowns
  const filteredCustomerStats = useMemo(() => {
    if (!analytics?.customerStats) return [];
    return analytics.customerStats.filter(c =>
      c.customerName.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [analytics, searchQuery]);

  const paginatedCustomerStats = useMemo(() => {
    return filteredCustomerStats.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  }, [filteredCustomerStats, currentPage]);

  const filteredEmployeeStats = useMemo(() => {
    if (!analytics?.employeeStats) return [];
    return analytics.employeeStats.filter(e =>
      e.employeeName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.designation.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (e.workingPlace || '').toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [analytics, searchQuery]);

  const paginatedEmployeeStats = useMemo(() => {
    return filteredEmployeeStats.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  }, [filteredEmployeeStats, currentPage]);

  const filteredDateStats = useMemo(() => {
    if (!analytics?.dateStats) return [];
    return analytics.dateStats.filter(d =>
      d.date.includes(searchQuery)
    );
  }, [analytics, searchQuery]);

  const paginatedDateStats = useMemo(() => {
    return filteredDateStats.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  }, [filteredDateStats, currentPage]);

  const totalItems = useMemo(() => {
    if (activeTab === 'customer') return filteredCustomerStats.length;
    if (activeTab === 'employee') return filteredEmployeeStats.length;
    return filteredDateStats.length;
  }, [activeTab, filteredCustomerStats, filteredEmployeeStats, filteredDateStats]);

  const totalPages = useMemo(() => {
    return Math.ceil(totalItems / itemsPerPage);
  }, [totalItems, itemsPerPage]);

  const customerTotals = useMemo(() => {
    const totals = { total: 0, todo: 0, inProgress: 0, completed: 0, overdue: 0, upcoming: 0 };
    filteredCustomerStats.forEach(item => {
      totals.total += item.total || 0;
      totals.todo += item.todo || 0;
      totals.inProgress += item.inProgress || 0;
      totals.completed += item.completed || 0;
      totals.overdue += item.overdue || 0;
      totals.upcoming += item.upcoming || 0;
    });
    return totals;
  }, [filteredCustomerStats]);

  const employeeTotals = useMemo(() => {
    const totals = { total: 0, todo: 0, inProgress: 0, completed: 0, overdue: 0, upcoming: 0 };
    filteredEmployeeStats.forEach(item => {
      totals.total += item.total || 0;
      totals.todo += item.todo || 0;
      totals.inProgress += item.inProgress || 0;
      totals.completed += item.completed || 0;
      totals.overdue += item.overdue || 0;
      totals.upcoming += item.upcoming || 0;
    });
    return totals;
  }, [filteredEmployeeStats]);

  const dateTotals = useMemo(() => {
    const totals = { total: 0, todo: 0, inProgress: 0, completed: 0, overdue: 0, upcoming: 0 };
    filteredDateStats.forEach(item => {
      totals.total += item.total || 0;
      totals.todo += item.todo || 0;
      totals.inProgress += item.inProgress || 0;
      totals.completed += item.completed || 0;
      totals.overdue += item.overdue || 0;
      totals.upcoming += item.upcoming || 0;
    });
    return totals;
  }, [filteredDateStats]);

  return (
    <>
      <div className="space-y-6 md:space-y-8 animate-fade-up">
        {/* Header */}
        <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-6">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight m-0">Customer Visit Dashboard</h2>
            <p className="text-slate-600 font-bold text-[13px] mt-2">Monitor client schedules, active visits, and completion rates</p>
          </div>

          <div className="flex flex-wrap items-center gap-4 w-full xl:w-auto">
            {/* View Reports Button */}
            <button
              onClick={() => navigate('/visits-reports')}
              className="flex items-center gap-3 bg-gradient-to-r from-indigo-600 to-violet-600 text-white px-6 py-3 rounded-2xl shadow-lg shadow-indigo-100 hover:shadow-indigo-200 transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              <FileText size={18} />
              <span className="text-sm font-bold tracking-tight">Visit Reports</span>
            </button>

            {/* Create Visit Button */}
            <button
              onClick={() => {
                setShowModal(true);
                setFormData({
                  customerId: '',
                  employeeId: '',
                  scheduledDate: getTodayStr(),
                  scheduledTime: '10:00',
                  reason: ''
                });
              }}
              className="flex items-center gap-2 bg-emerald-600 text-white px-6 py-3 rounded-2xl font-bold text-sm hover:bg-emerald-700 transition-all active:scale-95 shadow-lg shadow-emerald-100"
            >
              <Plus size={18} />
              Schedule Visit
            </button>

            {/* Start Date Picker */}
            <div className="relative" ref={startCalendarRef}>
              <div
                className="flex items-center gap-2 bg-white border border-slate-200 px-4 py-2.5 rounded-2xl cursor-pointer hover:bg-slate-50 transition-all shadow-sm"
                onClick={() => setShowStartCalendar(!showStartCalendar)}
              >
                <Calendar size={14} className="text-indigo-600" />
                <div className="flex flex-col items-start leading-none">
                  <span className="text-[8px] font-bold text-slate-400">From</span>
                  <span className="text-[11px] font-bold text-slate-700">
                    {new Date(startDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </span>
                </div>
                <ChevronDown size={12} className={`text-slate-400 transition-transform ${showStartCalendar ? 'rotate-180' : ''}`} />
              </div>

              <AnimatePresence>
                {showStartCalendar && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 10 }}
                    exit={{ opacity: 0, y: 10 }}
                    className="absolute top-full right-0 mt-3 z-50 bg-white border border-slate-100 rounded-3xl shadow-2xl p-4"
                  >
                    <CalendarPicker
                      selectedDate={startDate}
                      onSelect={(date) => {
                        setStartDate(date);
                        setShowStartCalendar(false);
                      }}
                      onClose={() => setShowStartCalendar(false)}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* End Date Picker */}
            <div className="relative" ref={endCalendarRef}>
              <div
                className="flex items-center gap-2 bg-white border border-slate-200 px-4 py-2.5 rounded-2xl cursor-pointer hover:bg-slate-50 transition-all shadow-sm"
                onClick={() => setShowEndCalendar(!showEndCalendar)}
              >
                <Calendar size={14} className="text-emerald-600" />
                <div className="flex flex-col items-start leading-none">
                  <span className="text-[8px] font-bold text-slate-400">To</span>
                  <span className="text-[11px] font-bold text-slate-700">
                    {new Date(endDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </span>
                </div>
                <ChevronDown size={12} className={`text-slate-400 transition-transform ${showEndCalendar ? 'rotate-180' : ''}`} />
              </div>

              <AnimatePresence>
                {showEndCalendar && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 10 }}
                    exit={{ opacity: 0, y: 10 }}
                    className="absolute top-full right-0 mt-3 z-50 bg-white border border-slate-100 rounded-3xl shadow-2xl p-4"
                  >
                    <CalendarPicker
                      selectedDate={endDate}
                      onSelect={(date) => {
                        setEndDate(date);
                        setShowEndCalendar(false);
                      }}
                      onClose={() => setShowEndCalendar(false)}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        {/* Tab Controls & Breakdowns */}
        <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-xl overflow-hidden mt-8">
          <div className="p-6 border-b border-slate-50 flex flex-col sm:flex-row gap-4 justify-between items-stretch">
            {/* Tabs */}
            <div className="flex bg-slate-50 p-1 rounded-2xl border border-slate-100 max-w-sm">
              <button
                onClick={() => { setActiveTab('customer'); setSearchQuery(''); setCurrentPage(1); }}
                className={`flex-1 px-4 py-2 rounded-xl text-xs font-bold transition-all ${activeTab === 'customer' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
              >
                Customer Wise
              </button>
              <button
                onClick={() => { setActiveTab('employee'); setSearchQuery(''); setCurrentPage(1); }}
                className={`flex-1 px-4 py-2 rounded-xl text-xs font-bold transition-all ${activeTab === 'employee' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
              >
                Employee Wise
              </button>
              <button
                onClick={() => { setActiveTab('date'); setSearchQuery(''); setCurrentPage(1); }}
                className={`flex-1 px-4 py-2 rounded-xl text-xs font-bold transition-all ${activeTab === 'date' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
              >
                Date Wise
              </button>
            </div>

            {/* Breakdown Search */}
            <div className="relative max-w-md">
              <Search size={16} className="absolute left-4 mt-3 text-slate-400" />
              <input
                type="text"
                placeholder={activeTab === 'customer' ? 'Search by customer name...' : activeTab === 'employee' ? 'Search by employee name...' : 'Search by date (YYYY-MM-DD)...'}
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                className="w-full bg-slate-50 border border-slate-100 pl-10 pr-4 py-2 rounded-2xl text-xs font-bold text-slate-700 outline-none focus:bg-white focus:border-indigo-100 transition-all shadow-sm"
              />
            </div>
          </div>

          <div>
            {loading ? (
              <div className="flex justify-center py-8"> <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>Loading...</div>
            ) : (
              <div className="overflow-x-auto">
                {activeTab === 'customer' && (
                  <table className="w-full text-left border-collapse border border-slate-200">
                    <thead>
                      <tr className="bg-slate-50/30">
                        <th className="px-6 py-5 text-[10px] font-extrabold text-indigo-600 tracking-widest border border-slate-200">CUSTOMER NAME</th>
                        <th className="px-6 py-5 text-[10px] font-extrabold text-indigo-600 tracking-widest text-center border border-slate-200">TOTAL</th>
                        <th className="px-6 py-5 text-[10px] font-extrabold text-indigo-600 tracking-widest text-center border border-slate-200">TO DO</th>
                        <th className="px-6 py-5 text-[10px] font-extrabold text-indigo-600 tracking-widest text-center border border-slate-200">IN PROGRESS</th>
                        <th className="px-6 py-5 text-[10px] font-extrabold text-indigo-600 tracking-widest text-center border border-slate-200">COMPLETED</th>
                        <th className="px-6 py-5 text-[10px] font-extrabold text-indigo-600 tracking-widest text-center border border-slate-200">OVER DUE</th>
                        <th className="px-6 py-5 text-[10px] font-extrabold text-indigo-600 tracking-widest text-center border border-slate-200">UPCOMING</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {paginatedCustomerStats.map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-6 py-4 font-bold text-slate-800 border border-slate-200">{item.customerName}</td>
                          <td className="px-6 py-4 font-bold text-center text-slate-800 border border-slate-200">{item.total}</td>
                          <td className="px-6 py-4 font-bold text-center text-rose-500 border border-slate-200">{item.todo}</td>
                          <td className="px-6 py-4 font-bold text-center text-amber-500 border border-slate-200">{item.inProgress}</td>
                          <td className="px-6 py-4 font-bold text-center text-emerald-500 border border-slate-200">{item.completed}</td>
                          <td className="px-6 py-4 font-bold text-center text-red-500 border border-slate-200">{item.overdue}</td>
                          <td className="px-6 py-4 font-bold text-center text-blue-500 border border-slate-200">{item.upcoming}</td>
                        </tr>
                      ))}
                      {filteredCustomerStats.length > 0 && (
                        <tr className="bg-slate-50/50 font-bold border-t-2 border-slate-200">
                          <td className="px-6 py-4 text-slate-900 border border-slate-200">Total</td>
                          <td className="px-6 py-4 text-center text-slate-900 border border-slate-200">{customerTotals.total}</td>
                          <td className="px-6 py-4 text-center text-rose-500 border border-slate-200">{customerTotals.todo}</td>
                          <td className="px-6 py-4 text-center text-amber-500 border border-slate-200">{customerTotals.inProgress}</td>
                          <td className="px-6 py-4 text-center text-emerald-500 border border-slate-200">{customerTotals.completed}</td>
                          <td className="px-6 py-4 text-center text-red-500 border border-slate-200">{customerTotals.overdue}</td>
                          <td className="px-6 py-4 text-center text-blue-500 border border-slate-200">{customerTotals.upcoming}</td>
                        </tr>
                      )}
                      {filteredCustomerStats.length === 0 && (
                        <tr>
                          <td colSpan="7" className="px-6 py-20 text-center font-bold text-slate-400">No breakdowns found</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                )}

                {activeTab === 'employee' && (
                  <table className="w-full text-left border-collapse border border-slate-200">
                    <thead>
                      <tr className="bg-slate-50/30">
                        <th className="px-6 py-5 text-[10px] font-extrabold text-indigo-600 tracking-widest text-center border border-slate-200">S.NO</th>
                        <th className="px-6 py-5 text-[10px] font-extrabold text-indigo-600 tracking-widest border border-slate-200">EMPLOYEE</th>
                        <th className="px-6 py-5 text-[10px] font-extrabold text-indigo-600 tracking-widest border border-slate-200">DESIGNATION</th>
                        <th className="px-6 py-5 text-[10px] font-extrabold text-indigo-600 tracking-widest border border-slate-200">WORKING PLACE</th>
                        <th className="px-6 py-5 text-[10px] font-extrabold text-indigo-600 tracking-widest text-center border border-slate-200">TOTAL</th>
                        <th className="px-6 py-5 text-[10px] font-extrabold text-indigo-600 tracking-widest text-center border border-slate-200">TO DO</th>
                        <th className="px-6 py-5 text-[10px] font-extrabold text-indigo-600 tracking-widest text-center border border-slate-200">IN PROGRESS</th>
                        <th className="px-6 py-5 text-[10px] font-extrabold text-indigo-600 tracking-widest text-center border border-slate-200">COMPLETED</th>
                        <th className="px-6 py-5 text-[10px] font-extrabold text-indigo-600 tracking-widest text-center border border-slate-200">OVER DUE</th>
                        <th className="px-6 py-5 text-[10px] font-extrabold text-indigo-600 tracking-widest text-center border border-slate-200">UPCOMING</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {paginatedEmployeeStats.map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-6 py-4 text-center border border-slate-200 text-slate-600 text-sm font-semibold">{(currentPage - 1) * itemsPerPage + idx + 1}</td>
                          <td className="px-6 py-4 font-bold text-slate-800 border border-slate-200">{item.employeeName}</td>
                          <td className="px-6 py-4 font-semibold text-slate-700 border border-slate-200 text-xs">{item.designation}</td>
                          <td className="px-6 py-4 font-semibold text-slate-600 border border-slate-200 text-xs">{item.workingPlace || 'NA'}</td>
                          <td className="px-6 py-4 font-bold text-center text-slate-800 border border-slate-200">{item.total}</td>
                          <td className="px-6 py-4 font-bold text-center text-rose-500 border border-slate-200">{item.todo}</td>
                          <td className="px-6 py-4 font-bold text-center text-amber-500 border border-slate-200">{item.inProgress}</td>
                          <td className="px-6 py-4 font-bold text-center text-emerald-500 border border-slate-200">{item.completed}</td>
                          <td className="px-6 py-4 font-bold text-center text-red-500 border border-slate-200">{item.overdue}</td>
                          <td className="px-6 py-4 font-bold text-center text-blue-500 border border-slate-200">{item.upcoming}</td>
                        </tr>
                      ))}
                      {filteredEmployeeStats.length > 0 && (
                        <tr className="bg-slate-50/50 font-bold border-t-2 border-slate-200">
                          <td className="px-6 py-4 text-center text-slate-900 border border-slate-200">—</td>
                          <td className="px-6 py-4 text-slate-900 border border-slate-200">Total</td>
                          <td className="px-6 py-4 border border-slate-200"></td>
                          <td className="px-6 py-4 border border-slate-200"></td>
                          <td className="px-6 py-4 text-center text-slate-900 border border-slate-200">{employeeTotals.total}</td>
                          <td className="px-6 py-4 text-center text-rose-500 border border-slate-200">{employeeTotals.todo}</td>
                          <td className="px-6 py-4 text-center text-amber-500 border border-slate-200">{employeeTotals.inProgress}</td>
                          <td className="px-6 py-4 text-center text-emerald-500 border border-slate-200">{employeeTotals.completed}</td>
                          <td className="px-6 py-4 text-center text-red-500 border border-slate-200">{employeeTotals.overdue}</td>
                          <td className="px-6 py-4 text-center text-blue-500 border border-slate-200">{employeeTotals.upcoming}</td>
                        </tr>
                      )}
                      {filteredEmployeeStats.length === 0 && (
                        <tr>
                          <td colSpan="10" className="px-6 py-20 text-center font-bold text-slate-400">No breakdowns found</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                )}

                {activeTab === 'date' && (
                  <table className="w-full text-left border-collapse border border-slate-200">
                    <thead>
                      <tr className="bg-slate-50/30">
                        <th className="px-6 py-5 text-[10px] font-extrabold text-indigo-600 tracking-widest border border-slate-200">DATE</th>
                        <th className="px-6 py-5 text-[10px] font-extrabold text-indigo-600 tracking-widest text-center border border-slate-200">TOTAL</th>
                        <th className="px-6 py-5 text-[10px] font-extrabold text-indigo-600 tracking-widest text-center border border-slate-200">TO DO</th>
                        <th className="px-6 py-5 text-[10px] font-extrabold text-indigo-600 tracking-widest text-center border border-slate-200">IN PROGRESS</th>
                        <th className="px-6 py-5 text-[10px] font-extrabold text-indigo-600 tracking-widest text-center border border-slate-200">COMPLETED</th>
                        <th className="px-6 py-5 text-[10px] font-extrabold text-indigo-600 tracking-widest text-center border border-slate-200">OVER DUE</th>
                        <th className="px-6 py-5 text-[10px] font-extrabold text-indigo-600 tracking-widest text-center border border-slate-200">UPCOMING</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {paginatedDateStats.map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-6 py-4 font-bold text-slate-800 border border-slate-200">{new Date(item.date).toLocaleDateString('en-GB')}</td>
                          <td className="px-6 py-4 font-bold text-center text-slate-800 border border-slate-200">{item.total}</td>
                          <td className="px-6 py-4 font-bold text-center text-rose-500 border border-slate-200">{item.todo}</td>
                          <td className="px-6 py-4 font-bold text-center text-amber-500 border border-slate-200">{item.inProgress}</td>
                          <td className="px-6 py-4 font-bold text-center text-emerald-500 border border-slate-200">{item.completed}</td>
                          <td className="px-6 py-4 font-bold text-center text-red-500 border border-slate-200">{item.overdue}</td>
                          <td className="px-6 py-4 font-bold text-center text-blue-500 border border-slate-200">{item.upcoming}</td>
                        </tr>
                      ))}
                      {filteredDateStats.length > 0 && (
                        <tr className="bg-slate-50/50 font-bold border-t-2 border-slate-200">
                          <td className="px-6 py-4 text-slate-900 border border-slate-200">Total</td>
                          <td className="px-6 py-4 text-center text-slate-900 border border-slate-200">{dateTotals.total}</td>
                          <td className="px-6 py-4 text-center text-rose-500 border border-slate-200">{dateTotals.todo}</td>
                          <td className="px-6 py-4 text-center text-amber-500 border border-slate-200">{dateTotals.inProgress}</td>
                          <td className="px-6 py-4 text-center text-emerald-500 border border-slate-200">{dateTotals.completed}</td>
                          <td className="px-6 py-4 text-center text-red-500 border border-slate-200">{dateTotals.overdue}</td>
                          <td className="px-6 py-4 text-center text-blue-500 border border-slate-200">{dateTotals.upcoming}</td>
                        </tr>
                      )}
                      {filteredDateStats.length === 0 && (
                        <tr>
                          <td colSpan="7" className="px-6 py-20 text-center font-bold text-slate-400">No breakdowns found</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>

          {totalItems > itemsPerPage && (
            <div className="px-8 py-5 bg-slate-50/50 border-t border-slate-100 flex flex-col md:flex-row justify-between items-center gap-4">
              <p className="text-xs font-bold text-slate-500">
                Showing <span className="text-slate-900">{(currentPage - 1) * itemsPerPage + 1}</span> to <span className="text-slate-900">{Math.min(currentPage * itemsPerPage, totalItems)}</span> of <span className="text-slate-900">{totalItems}</span> entries
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

      {/* Schedule / Assign Visit Modal */}
      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.98, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: 20 }}
              className="bg-white w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-[2rem] shadow-2xl flex flex-col"
            >
              <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center sticky top-0 bg-white z-10 shrink-0">
                <h3 className="text-xl font-bold text-slate-900 tracking-tighter m-0">Schedule Customer Visit</h3>
                <button
                  onClick={() => setShowModal(false)}
                  className="w-10 h-10 rounded-xl bg-slate-50 text-slate-400 flex items-center justify-center hover:bg-rose-50 hover:text-rose-500 transition-all"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="p-8">
                <form onSubmit={handleSubmitVisit} className="space-y-6">
                  {/* Custom Customer Dropdown */}
                  <div className="space-y-2 relative" ref={custDropdownRef}>
                    <label className="text-[11px] font-bold text-slate-400 tracking-widest ml-1">Customer / Client</label>
                    <div
                      onClick={() => setShowCustDropdown(!showCustDropdown)}
                      className="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-100 focus:bg-white px-5 py-4 rounded-2xl outline-none transition-all text-sm font-bold text-slate-800 flex justify-between items-center cursor-pointer shadow-sm"
                    >
                      <span className={formData.customerId ? "text-slate-800" : "text-slate-400"}>
                        {formData.customerId
                          ? customers.find(c => c._id === formData.customerId)?.customerName || 'Selected Customer'
                          : '-- Select Customer --'}
                      </span>
                      <ChevronDown size={16} className={`text-slate-400 transition-transform ${showCustDropdown ? 'rotate-180' : ''}`} />
                    </div>

                    <AnimatePresence>
                      {showCustDropdown && (
                        <motion.div
                          initial={{ opacity: 0, y: 10, scale: 0.98 }}
                          animate={{ opacity: 1, y: 5, scale: 1 }}
                          exit={{ opacity: 0, y: 10, scale: 0.98 }}
                          className="absolute left-0 right-0 mt-1 z-50 bg-white border border-slate-150 rounded-2xl shadow-2xl p-3 flex flex-col gap-2 max-h-60 overflow-hidden"
                        >
                          <div className="relative shrink-0">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                              type="text"
                              placeholder="Search customers..."
                              value={custSearchQuery}
                              onChange={(e) => setCustSearchQuery(e.target.value)}
                              className="w-full bg-slate-50 border border-slate-100 pl-9 pr-3 py-2 rounded-xl text-xs font-bold text-slate-700 outline-none focus:bg-white focus:border-indigo-100 transition-all"
                            />
                          </div>

                          <div className="overflow-y-auto flex-1 space-y-0.5 pr-1">
                            {customers
                              .filter(c => c.customerName.toLowerCase().includes(custSearchQuery.toLowerCase()))
                              .map((c) => (
                                <div
                                  key={c._id}
                                  onClick={() => {
                                    setFormData({ ...formData, customerId: c._id });
                                    setShowCustDropdown(false);
                                    setCustSearchQuery('');
                                  }}
                                  className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex justify-between items-center ${formData.customerId === c._id ? 'bg-indigo-600 text-white' : 'text-slate-700 hover:bg-slate-50'}`}
                                >
                                  <span>{c.customerName} ({c.customerCode || 'No Code'})</span>
                                  {formData.customerId === c._id && <Check size={14} className="text-white" />}
                                </div>
                              ))}
                            {customers.filter(c => c.customerName.toLowerCase().includes(custSearchQuery.toLowerCase())).length === 0 && (
                              <div className="py-6 text-center text-xs font-bold text-slate-400">No customers found</div>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Custom Employee Dropdown */}
                  <div className="space-y-2 relative" ref={empDropdownRef}>
                    <label className="text-[11px] font-bold text-slate-400 tracking-widest ml-1">Assign Employee</label>
                    <div
                      onClick={() => setShowEmpDropdown(!showEmpDropdown)}
                      className="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-100 focus:bg-white px-5 py-4 rounded-2xl outline-none transition-all text-sm font-bold text-slate-800 flex justify-between items-center cursor-pointer shadow-sm"
                    >
                      <span className={formData.employeeId ? "text-slate-800" : "text-slate-400"}>
                        {formData.employeeId
                          ? employees.find(e => e._id === formData.employeeId)?.name || 'Selected Employee'
                          : '-- Select Employee --'}
                      </span>
                      <ChevronDown size={16} className={`text-slate-400 transition-transform ${showEmpDropdown ? 'rotate-180' : ''}`} />
                    </div>

                    <AnimatePresence>
                      {showEmpDropdown && (
                        <motion.div
                          initial={{ opacity: 0, y: 10, scale: 0.98 }}
                          animate={{ opacity: 1, y: 5, scale: 1 }}
                          exit={{ opacity: 0, y: 10, scale: 0.98 }}
                          className="absolute left-0 right-0 mt-1 z-50 bg-white border border-slate-150 rounded-2xl shadow-2xl p-3 flex flex-col gap-2 max-h-60 overflow-hidden"
                        >
                          <div className="relative shrink-0">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                              type="text"
                              placeholder="Search employees..."
                              value={empSearchQuery}
                              onChange={(e) => setEmpSearchQuery(e.target.value)}
                              className="w-full bg-slate-50 border border-slate-100 pl-9 pr-3 py-2 rounded-xl text-xs font-bold text-slate-700 outline-none focus:bg-white focus:border-indigo-100 transition-all"
                            />
                          </div>

                          <div className="overflow-y-auto flex-1 space-y-0.5 pr-1">
                            {employees
                              .filter(e => e.name.toLowerCase().includes(empSearchQuery.toLowerCase()))
                              .map((e) => (
                                <div
                                  key={e._id}
                                  onClick={() => {
                                    setFormData({ ...formData, employeeId: e._id });
                                    setShowEmpDropdown(false);
                                    setEmpSearchQuery('');
                                  }}
                                  className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex justify-between items-center ${formData.employeeId === e._id ? 'bg-indigo-600 text-white' : 'text-slate-700 hover:bg-slate-50'}`}
                                >
                                  <span>{e.name} ({e.designation || 'Staff'})</span>
                                  {formData.employeeId === e._id && <Check size={14} className="text-white" />}
                                </div>
                              ))}
                            {employees.filter(e => e.name.toLowerCase().includes(empSearchQuery.toLowerCase())).length === 0 && (
                              <div className="py-6 text-center text-xs font-bold text-slate-400">No employees found</div>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    {/* Custom Date Picker using CalendarPicker with allowFutureOnly */}
                    <div className="space-y-2 relative" ref={formCalendarRef}>
                      <label className="text-[11px] font-bold text-slate-400 tracking-widest ml-1 block">Scheduled Date</label>
                      <div
                        onClick={() => setShowFormCalendar(!showFormCalendar)}
                        className="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-100 hover:bg-slate-100/50 px-5 py-4 rounded-2xl cursor-pointer transition-all text-sm font-bold text-slate-800 flex justify-between items-center shadow-sm"
                      >
                        <div className="flex items-center gap-2">
                          <Calendar size={16} className="text-indigo-600" />
                          <span>
                            {formData.scheduledDate ? new Date(formData.scheduledDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Select Date'}
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
                            className="absolute top-full left-0 mt-2 z-50 bg-white border border-slate-150 rounded-[1.5rem] shadow-2xl p-4"
                          >
                            <CalendarPicker
                              selectedDate={formData.scheduledDate}
                              allowFutureOnly={true}
                              onSelect={(date) => {
                                setFormData({ ...formData, scheduledDate: date });
                                setShowFormCalendar(false);
                              }}
                              onClose={() => setShowFormCalendar(false)}
                            />
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    {/* Time Input */}
                    <div className="space-y-2">
                      <label className="text-[11px] font-bold text-slate-400 tracking-widest ml-1">Scheduled Time</label>
                      <div className="flex items-center gap-3">
                        {/* Hour Input */}
                        <div className="flex-1 relative">
                          <input
                            type="text"
                            maxLength={2}
                            value={typedHour}
                            onChange={handleHourChange}
                            onBlur={handleHourBlur}
                            placeholder="10"
                            className="w-full bg-slate-50 border-2 border-slate-200 focus:border-indigo-100 focus:bg-white px-4 py-3.5 rounded-2xl outline-none transition-all text-sm font-bold text-slate-800 text-center shadow-sm"
                          />
                        </div>

                        <span className="text-slate-400 font-extrabold text-lg">:</span>

                        {/* Minute Input */}
                        <div className="flex-1 relative">
                          <input
                            type="text"
                            maxLength={2}
                            value={typedMinute}
                            onChange={handleMinuteChange}
                            onBlur={handleMinuteBlur}
                            placeholder="00"
                            className="w-full bg-slate-50 border-2 border-slate-200 focus:border-indigo-100 focus:bg-white px-4 py-3.5 rounded-2xl outline-none transition-all text-sm font-bold text-slate-800 text-center shadow-sm"
                          />
                        </div>

                        {/* AM/PM Button Group */}
                        <div className="flex bg-slate-100 p-1 rounded-2xl border border-slate-200 shadow-inner">
                          <button
                            type="button"
                            onClick={() => setSelectedPeriod('AM')}
                            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${selectedPeriod === 'AM' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-800'}`}
                          >
                            AM
                          </button>
                          <button
                            type="button"
                            onClick={() => setSelectedPeriod('PM')}
                            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${selectedPeriod === 'PM' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-800'}`}
                          >
                            PM
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Remarks */}
                  <div className="space-y-2">
                    <label className="text-[11px] font-bold text-slate-400 tracking-widest ml-1">
                      Instructions / Reason <span className="text-rose-500">*</span>
                    </label>
                    <textarea
                      value={formData.reason}
                      onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                      required
                      className="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-100 focus:bg-white px-5 py-4 rounded-2xl outline-none transition-all text-sm font-bold text-slate-800 min-h-[80px] resize-none"
                      placeholder="Add specific instructions/reason for this client visit (Compulsory)..."
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={saving}
                    className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-bold text-sm shadow-xl shadow-emerald-100 hover:bg-emerald-700 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                    Schedule and Assign
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

export default CustomerVisitDashboard;
