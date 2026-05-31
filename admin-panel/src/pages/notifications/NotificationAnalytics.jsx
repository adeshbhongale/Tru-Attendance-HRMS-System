import {
  Bell,
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  Search
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import api from '../../api/axios';

const CustomDatePicker = ({ value, onChange, label }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  const currentDate = value ? new Date(value) : new Date();
  const [viewDate, setViewDate] = useState(currentDate);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (value) {
      setViewDate(new Date(value));
    }
  }, [value]);

  const handlePrevMonth = () => {
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1));
  };

  const handleSelectDay = (day) => {
    const newSelected = new Date(viewDate.getFullYear(), viewDate.getMonth(), day);
    const yyyy = newSelected.getFullYear();
    const mm = String(newSelected.getMonth() + 1).padStart(2, '0');
    const dd = String(newSelected.getDate()).padStart(2, '0');
    onChange(`${yyyy}-${mm}-${dd}`);
    setIsOpen(false);
  };

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  const firstDayOfMonth = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const formattedDisplay = currentDate.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });

  const monthName = viewDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const daysArray = [];
  for (let i = 0; i < firstDayOfMonth; i++) {
    daysArray.push(null);
  }
  for (let i = 1; i <= daysInMonth; i++) {
    daysArray.push(i);
  }

  return (
    <div className="relative space-y-2 w-full" ref={containerRef}>
      <label className="text-[10px] font-extrabold text-slate-400 tracking-widest block ml-1 ">
        {label}
      </label>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between bg-white border border-slate-200 hover:border-indigo-300 focus:outline-none rounded-2xl px-4 py-3.5 transition-all duration-200 shadow-sm text-left group"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-500 group-hover:scale-105 transition-transform duration-200">
            <Calendar size={15} />
          </div>
          <div>
            <span className="text-xs font-bold text-slate-700 block">{formattedDisplay}</span>
          </div>
        </div>
        <ChevronRight size={16} className={`text-slate-400 transition-transform ${isOpen ? 'rotate-90 text-indigo-500' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 z-50 mt-2 w-80 bg-white border border-slate-200/80 rounded-2xl shadow-2xl p-4">
          <div className="flex justify-between items-center mb-3">
            <button
              type="button"
              onClick={handlePrevMonth}
              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600 transition-colors cursor-pointer"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-xs font-extrabold text-slate-800 tracking-tight">{monthName}</span>
            <button
              type="button"
              onClick={handleNextMonth}
              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600 transition-colors cursor-pointer"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center mb-1">
            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((wd) => (
              <span key={wd} className="text-[9px] font-extrabold text-slate-400  tracking-widest py-1">
                {wd}
              </span>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {daysArray.map((day, idx) => {
              if (day === null) {
                return <div key={`empty-${idx}`} />;
              }
              const isSelected =
                currentDate.getDate() === day &&
                currentDate.getMonth() === month &&
                currentDate.getFullYear() === year;

              return (
                <button
                  key={`day-${day}`}
                  type="button"
                  onClick={() => handleSelectDay(day)}
                  className={`py-2 text-[10px] font-bold rounded-xl transition-all cursor-pointer ${isSelected
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-150'
                    : 'text-slate-700 hover:bg-indigo-50 hover:text-indigo-600'
                    }`}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

const CustomDropdown = ({ value, onChange, label, options }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedOption = options.find(opt => opt.value === value) || options[0];

  return (
    <div className="relative space-y-2 w-full" ref={containerRef}>
      <label className="text-[10px] font-extrabold text-slate-400 block ml-1 tracking-widest ">
        {label}
      </label>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between bg-white border border-slate-200 hover:border-indigo-300 focus:outline-none rounded-2xl px-4 py-3.5 transition-all duration-200 shadow-sm text-left group"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-500 group-hover:scale-105 transition-transform duration-200">
            {selectedOption.icon || <Bell size={15} />}
          </div>
          <div>
            <span className="text-xs font-bold text-slate-700 block">{selectedOption.label}</span>
          </div>
        </div>
        <ChevronRight size={16} className={`text-slate-400 transition-transform ${isOpen ? 'rotate-95 text-indigo-500' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 z-50 mt-2 w-full bg-white border border-slate-200/80 rounded-2xl shadow-2xl p-2">
          {options.map((opt) => {
            const isSelected = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  onChange(opt.value);
                  setIsOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-xs font-bold transition-all cursor-pointer ${isSelected
                  ? 'bg-indigo-50 text-indigo-600'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`}
              >
                <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${isSelected ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-400'}`}>
                  {opt.icon || <Bell size={12} />}
                </div>
                <span>{opt.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

const NotificationAnalytics = () => {
  const navigate = useNavigate();

  // Collections fetched from API
  const [departments, setDepartments] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  const getPast10DaysDate = () => {
    const d = new Date();
    d.setDate(d.getDate() - 10);
    return d.toISOString().split('T')[0];
  };

  // Dynamic Views & Filters (Only stays: viewType, fromDate, toDate)
  const [viewType, setViewType] = useState('notification-wise');
  const [fromDate, setFromDate] = useState(getPast10DaysDate);
  const [toDate, setToDate] = useState(() => new Date().toISOString().split('T')[0]);

  // Table paging and search
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [generatedAt, setGeneratedAt] = useState('');

  const [isRowDropdownOpen, setIsRowDropdownOpen] = useState(false);
  const rowDropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (rowDropdownRef.current && !rowDropdownRef.current.contains(event.target)) {
        setIsRowDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      setGeneratedAt(new Date().toLocaleString('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      }));

      // Fetch lists and delivery telemetry logs
      const [deptRes, empRes, notificationsRes, logsRes] = await Promise.all([
        api.get('/departments').catch(() => ({ data: { data: [] } })),
        api.get('/employees').catch(() => ({ data: { data: [] } })),
        api.get('/notifications?limit=100').catch(() => ({ data: { success: false, data: [] } })),
        api.get('/notifications/reports').catch(() => ({ data: { success: false, data: [] } }))
      ]);

      setDepartments(deptRes.data?.data || []);
      setEmployees(empRes.data?.data || []);
      setNotifications(notificationsRes.data?.data || []);
      setLogs(logsRes.data?.data || []);
    } catch (err) {
      toast.error('Failed to load dashboard telemetries');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  // Compute live aggregates matching exactly the selected Date Range
  const processedData = useMemo(() => {
    const start = fromDate ? new Date(fromDate).setHours(0, 0, 0, 0) : 0;
    const end = toDate ? new Date(toDate).setHours(23, 59, 59, 999) : Infinity;

    // 1. Filter telemetry logs by active Date Range first
    const filteredLogs = logs.filter(log => {
      if (!log) return false;
      const logTime = new Date(log.sentAt || log.sentTime || log.createdAt).getTime();
      return logTime >= start && logTime <= end;
    });

    if (viewType === 'notification-wise') {
      return notifications.map(notif => {
        if (!notif) return null;
        // Count recipient logs bound to this specific campaign
        const notifLogs = filteredLogs.filter(l => l.notification?._id === notif._id || l.notification === notif._id);
        const sentCount = notifLogs.length;
        const readCount = notifLogs.filter(l => l.isRead || l.read).length;
        const unreadCount = Math.max(0, sentCount - readCount);

        return {
          _id: notif._id,
          title: notif.title || 'Untitled Notification',
          description: notif.message || notif.description || 'No description provided',
          dateTime: notif.sentTime || notif.createdAt,
          sentCount,
          readCount,
          unreadCount
        };
      }).filter(Boolean);

    } else if (viewType === 'department-wise') {
      return departments.map(dept => {
        if (!dept) return null;
        // Count active employees in this department
        const deptEmployees = employees.filter(emp => {
          if (!emp) return false;
          if (emp.role && emp.role !== 'employee') return false;
          const empDeptName = typeof emp.department === 'object' ? emp.department?.name : emp.department;
          return empDeptName && dept.name && empDeptName.toString().trim().toLowerCase() === dept.name.toString().trim().toLowerCase();
        });
        const employeeCount = deptEmployees.length;

        // Count recipient logs bound to employees belonging to this department (by name match)
        const deptLogs = filteredLogs.filter(l => {
          const deptName = l.employee?.department?.name || l.employee?.department;
          return deptName === dept.name;
        });
        const sentCount = deptLogs.length;
        const readCount = deptLogs.filter(l => l.isRead || l.read).length;
        const unreadCount = Math.max(0, sentCount - readCount);

        return {
          _id: dept._id,
          name: dept.name || 'Unknown Department',
          employeeCount,
          sentCount,
          readCount,
          unreadCount
        };
      }).filter(Boolean);

    } else if (viewType === 'employee-wise') {
      return employees.map(emp => {
        if (!emp) return null;
        // Count logs dispatched to this employee
        const empLogs = filteredLogs.filter(l => l.employee?._id === emp._id || l.employee === emp._id);
        const sentCount = empLogs.length;
        const readCount = empLogs.filter(l => l.isRead || l.read).length;
        const unreadCount = Math.max(0, sentCount - readCount);

        return {
          _id: emp._id,
          name: emp.name || 'Deleted Employee',
          mobile: emp.mobile || emp.phone || 'N/A',
          email: emp.email || 'N/A',
          sentCount,
          readCount,
          unreadCount
        };
      }).filter(Boolean);
    }

    return [];
  }, [viewType, fromDate, toDate, logs, notifications, departments, employees]);

  // Apply textual search dynamically
  const searchedData = useMemo(() => {
    if (!searchTerm) return processedData;
    const query = searchTerm.toLowerCase();

    if (viewType === 'notification-wise') {
      return processedData.filter(item =>
        (item.title || '').toLowerCase().includes(query) ||
        (item.description || '').toLowerCase().includes(query)
      );
    } else if (viewType === 'department-wise') {
      return processedData.filter(item =>
        (item.name || '').toLowerCase().includes(query)
      );
    } else if (viewType === 'employee-wise') {
      return processedData.filter(item =>
        (item.name || '').toLowerCase().includes(query) ||
        (item.mobile || '').includes(query) ||
        (item.email || '').toLowerCase().includes(query)
      );
    }
    return processedData;
  }, [processedData, searchTerm, viewType]);

  // Handle auto-reset pagination
  useEffect(() => {
    setCurrentPage(1);
    setGeneratedAt(new Date().toLocaleString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    }));
  }, [viewType, fromDate, toDate]);

  const exportCSV = () => {
    let headers = [];
    let data = [];

    if (viewType === 'notification-wise') {
      headers = ['S.no', 'Title', 'Description', 'Date Time', 'Sent Count', 'Not Read Count', 'Read Count'];
      data = searchedData.map((n, index) => {
        const dateStr = new Date(n.dateTime).toLocaleString('en-GB', {
          day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true
        });
        return [
          index + 1,
          `"${n.title.replace(/"/g, '""')}"`,
          `"${n.description.replace(/"/g, '""')}"`,
          dateStr,
          n.sentCount,
          n.unreadCount,
          n.readCount
        ];
      });
    } else if (viewType === 'department-wise') {
      headers = ['S.no', 'Department Name', 'Employees Count', 'Sent Count', 'Not Read Count', 'Read Count'];
      data = searchedData.map((d, index) => [
        index + 1,
        `"${d.name.replace(/"/g, '""')}"`,
        d.employeeCount,
        d.sentCount,
        d.unreadCount,
        d.readCount
      ]);
    } else if (viewType === 'employee-wise') {
      headers = ['S.no', 'Employee Name', 'Mobile No', 'Sent Count', 'Not Read Count', 'Read Count'];
      data = searchedData.map((e, index) => [
        index + 1,
        `"${e.name.replace(/"/g, '""')}"`,
        `"${e.mobile}"`,
        e.sentCount,
        e.unreadCount,
        e.readCount
      ]);
    }

    const csvContent = [headers, ...data].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `Notification_Dashboard_${viewType}_${fromDate}_to_${toDate}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Dashboard report downloaded!');
  };

  // Pagination boundaries
  const totalPages = Math.ceil(searchedData.length / itemsPerPage);
  const paginatedData = useMemo(() => {
    return searchedData.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  }, [searchedData, currentPage, itemsPerPage]);

  const formatDateLabel = (dStr) => {
    if (!dStr) return '';
    const parts = dStr.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dStr;
  };

  return (
    <div className="space-y-6 md:space-y-8 animate-fade-up">
      {/* Top Header Dashboard */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight m-0">Notification Dashboard</h2>
          <p className="text-slate-600 font-bold text-[13px] mt-2">Filter aggregate telemetry values dynamically by dates and groups</p>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <button
            onClick={() => navigate('/notifications/reports')}
            className="group flex-1 md:flex-none flex items-center justify-center gap-2 bg-gradient-to-r from-indigo-600 to-violet-600 text-white px-6 py-4 rounded-2xl font-extrabold text-xs tracking-wider  shadow-lg shadow-indigo-250/50 hover:shadow-indigo-500/35 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200"
          >
            <FileText size={16} className="text-indigo-100 group-hover:text-white transition-colors" />
            View Reports
            <ChevronRight size={18} className="text-slate-100 group-hover:text-white transition-colors" />
          </button>
        </div>
      </div>

      {/* 1. COMPACT FILTER PANEL (Only stays: fromDate, toDate, viewType) */}
      <div className="bg-white border border-slate-200 p-6 rounded-[2rem] shadow-xl shadow-slate-100/50">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 items-end">

          <CustomDropdown
            value={viewType}
            onChange={setViewType}
            label="Notification Type"
            options={[
              { value: 'notification-wise', label: 'Notification Wise', icon: <Bell size={15} /> },
              { value: 'department-wise', label: 'Department Wise', icon: <Search size={15} /> },
              { value: 'employee-wise', label: 'Employee Wise', icon: <FileText size={15} /> }
            ]}
          />

          <CustomDatePicker
            value={fromDate}
            onChange={setFromDate}
            label="From Date"
          />

          <CustomDatePicker
            value={toDate}
            onChange={setToDate}
            label="To Date"
          />

        </div>
      </div>

      {/* 2. SUBHEADER DETAILS PANEL */}
      <div className="flex justify-between items-center text-xs font-bold text-slate-600 px-2 flex-wrap gap-2">
        <div>
          Notification Report from <span className="text-indigo-600 font-extrabold">{formatDateLabel(fromDate)}</span> to <span className="text-indigo-600 font-extrabold">{formatDateLabel(toDate)}</span>
        </div>
        <div className="text-slate-400">
          Generated On: <span className="text-slate-500 font-extrabold">{generatedAt}</span>
        </div>
      </div>

      {/* 3. REPORT DATA MATRIX TABLE CONTAINER */}
      <div className="bg-white rounded-[2rem] border border-slate-200 shadow-xl overflow-hidden">

        {/* Controls Bar: Rows display limit, CSV download, and Search textbox */}
        <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row justify-between items-center gap-4">

          <div className="flex items-center gap-3 w-full md:w-auto">
            <div className="relative" ref={rowDropdownRef}>
              <button
                type="button"
                onClick={() => setIsRowDropdownOpen(!isRowDropdownOpen)}
                className="flex items-center gap-2 border border-slate-200 px-3.5 py-2 rounded-xl bg-slate-50 hover:bg-slate-100 transition-colors text-slate-700 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              >
                <span>Show</span>
                <span className="text-indigo-600 font-extrabold">{itemsPerPage} rows</span>
                <ChevronDown size={14} className={`text-slate-400 transition-transform ${isRowDropdownOpen ? 'rotate-180 text-indigo-600' : ''}`} />
              </button>

              {isRowDropdownOpen && (
                <div className="absolute left-0 top-full mt-2 z-50 w-32 bg-white border border-slate-200 rounded-xl shadow-xl p-1">
                  {[5, 10, 25, 50].map((num) => {
                    const isSelected = itemsPerPage === num;
                    return (
                      <button
                        key={num}
                        type="button"
                        onClick={() => {
                          setItemsPerPage(num);
                          setCurrentPage(1);
                          setIsRowDropdownOpen(false);
                        }}
                        className={`w-full text-left px-3 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${isSelected
                            ? 'bg-indigo-50 text-indigo-600'
                            : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                          }`}
                      >
                        {num} rows
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <button
              onClick={exportCSV}
              className="flex items-center gap-1.5 bg-white text-slate-600 border border-slate-200 px-4 py-2 rounded-xl font-bold text-xs hover:bg-slate-50 transition-all active:scale-95 shadow-sm"
            >
              <Download size={14} className="text-slate-400" />
              Export to CSV
            </button>
          </div>

          <div className="relative w-full md:max-w-xs">
            <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 pl-10 pr-4 py-2 rounded-xl text-xs font-bold text-slate-700 outline-none focus:bg-white focus:border-indigo-300 transition-all shadow-sm"
            />
          </div>
        </div>

        {/* Dynamic Table Layout based on selected Notification Type */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">

            {/* 1) Header columns based on viewType */}
            <thead>
              {viewType === 'notification-wise' && (
                <tr className="bg-slate-50/40 text-[10px] font-extrabold text-indigo-600 tracking-wider border-b border-slate-200">
                  <th className="px-6 py-4 border-r border-slate-200 text-center w-16">S.no</th>
                  <th className="px-6 py-4 border-r border-slate-200 min-w-[150px]">Title</th>
                  <th className="px-6 py-4 border-r border-slate-200 min-w-[320px]">Description</th>
                  <th className="px-6 py-4 border-r border-slate-200 text-center min-w-[150px]">Date Time</th>
                  <th className="px-6 py-4 border-r border-slate-200 text-center w-28">Sent Count</th>
                  <th className="px-6 py-4 border-r border-slate-200 text-center w-36">Not Read Count</th>
                  <th className="px-6 py-4 text-center w-28">Read Count</th>
                </tr>
              )}

              {viewType === 'department-wise' && (
                <tr className="bg-slate-50/40 text-[10px] font-extrabold text-indigo-600 tracking-wider border-b border-slate-200">
                  <th className="px-6 py-4 border-r border-slate-200 text-center w-16">S.no</th>
                  <th className="px-6 py-4 border-r border-slate-200 min-w-[200px]">Department Name</th>
                  <th className="px-6 py-4 border-r border-slate-200 text-center w-36">Employees Count</th>
                  <th className="px-6 py-4 border-r border-slate-200 text-center w-32">Sent Count</th>
                  <th className="px-6 py-4 border-r border-slate-200 text-center w-36">Not Read Count</th>
                  <th className="px-6 py-4 text-center w-32">Read Count</th>
                </tr>
              )}

              {viewType === 'employee-wise' && (
                <tr className="bg-slate-50/40 text-[10px] font-extrabold text-indigo-600 tracking-wider border-b border-slate-200">
                  <th className="px-6 py-4 border-r border-slate-200 text-center w-16">S.no</th>
                  <th className="px-6 py-4 border-r border-slate-200 min-w-[200px]">Employee Name</th>
                  <th className="px-6 py-4 border-r border-slate-200 w-44">Mobile No</th>
                  <th className="px-6 py-4 border-r border-slate-200 min-w-[200px]">Email</th>
                  <th className="px-6 py-4 border-r border-slate-200 text-center w-32">Sent Count</th>
                  <th className="px-6 py-4 border-r border-slate-200 text-center w-36">Not Read Count</th>
                  <th className="px-6 py-4 text-center w-32">Read Count</th>
                </tr>
              )}
            </thead>

            {/* 2) Body columns based on viewType */}
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan="8" className="px-6 py-20 text-center">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
                      <p className="text-slate-400 font-bold text-xs">Compiling telemetry values...</p>
                    </div>
                  </td>
                </tr>
              ) : paginatedData.length === 0 ? (
                <tr>
                  <td colSpan="8" className="px-6 py-20 text-center">
                    <div className="flex flex-col items-center">
                      <div className="w-16 h-16 bg-slate-50 border border-slate-100 rounded-2xl flex items-center justify-center text-indigo-500 mb-4 shadow-inner">
                        <Bell size={24} />
                      </div>
                      <h4 className="text-slate-700 font-bold text-sm">No notification records registered for this date range</h4>
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedData.map((item, index) => {
                  const serialNum = (currentPage - 1) * itemsPerPage + index + 1;

                  if (viewType === 'notification-wise') {
                    const formattedDate = new Date(item.dateTime).toLocaleString('en-GB', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: true
                    });
                    return (
                      <tr key={item._id} className="hover:bg-slate-50/50 transition-all font-semibold text-slate-700 text-xs">
                        <td className="px-6 py-4 border-r border-slate-100 text-center text-slate-400">{serialNum}</td>
                        <td className="px-6 py-4 border-r border-slate-100 text-slate-900 font-bold max-w-[200px] truncate">{item.title}</td>
                        <td className="px-6 py-4 border-r border-slate-100 text-slate-500 max-w-[350px] leading-relaxed">
                          <span className="line-clamp-3 block whitespace-pre-wrap">{item.description}</span>
                        </td>
                        <td className="px-6 py-4 border-r border-slate-100 text-center text-slate-500 font-mono whitespace-nowrap">{formattedDate}</td>
                        <td className="px-6 py-4 border-r border-slate-100 text-center font-bold text-slate-800">{item.sentCount}</td>
                        <td className="px-6 py-4 border-r border-slate-100 text-center text-rose-500 font-bold">{item.unreadCount}</td>
                        <td className="px-6 py-4 text-center text-emerald-600 font-bold">{item.readCount}</td>
                      </tr>
                    );
                  } else if (viewType === 'department-wise') {
                    return (
                      <tr key={item._id} className="hover:bg-slate-50/50 transition-all font-semibold text-slate-700 text-xs">
                        <td className="px-6 py-4 border-r border-slate-100 text-center text-slate-400">{serialNum}</td>
                        <td className="px-6 py-4 border-r border-slate-100 text-slate-900 font-bold">{item.name}</td>
                        <td className="px-6 py-4 border-r border-slate-100 text-center font-bold text-indigo-600">{item.employeeCount}</td>
                        <td className="px-6 py-4 border-r border-slate-100 text-center font-bold text-slate-800">{item.sentCount}</td>
                        <td className="px-6 py-4 border-r border-slate-100 text-center text-rose-500 font-bold">{item.unreadCount}</td>
                        <td className="px-6 py-4 text-center text-emerald-600 font-bold">{item.readCount}</td>
                      </tr>
                    );
                  } else if (viewType === 'employee-wise') {
                    return (
                      <tr key={item._id} className="hover:bg-slate-50/50 transition-all font-semibold text-slate-700 text-xs">
                        <td className="px-6 py-4 border-r border-slate-100 text-center text-slate-400">{serialNum}</td>
                        <td className="px-6 py-4 border-r border-slate-100 text-slate-900 font-bold">{item.name}</td>
                        <td className="px-6 py-4 border-r border-slate-100 text-slate-600 font-mono">{item.mobile}</td>
                        <td className="px-6 py-4 border-r border-slate-100 text-slate-600 font-mono">{item.email}</td>
                        <td className="px-6 py-4 border-r border-slate-100 text-center font-bold text-slate-800">{item.sentCount}</td>
                        <td className="px-6 py-4 border-r border-slate-100 text-center text-rose-500 font-bold">{item.unreadCount}</td>
                        <td className="px-6 py-4 text-center text-emerald-600 font-bold">{item.readCount}</td>
                      </tr>
                    );
                  }
                  return null;
                })
              )}
            </tbody>

          </table>
        </div>

        {/* Table Pagination Section */}
        {searchedData.length > itemsPerPage && (
          <div className="flex justify-between items-center px-8 py-5 bg-slate-50/50 border-t border-slate-100 flex-wrap gap-3">
            <span className="text-xs font-bold text-slate-500">
              Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, searchedData.length)} of {searchedData.length} entries
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
  );
};

export default NotificationAnalytics;
