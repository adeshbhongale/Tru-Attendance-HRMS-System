import { AnimatePresence, motion } from 'framer-motion';
import { Calendar, Check, ChevronDown, ChevronLeft, ChevronRight, Clock, FileText, Loader2, Search, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../api/axios';

const Leaves = () => {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('All');

  const formatDateString = (date) => {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const [selectedDate, setSelectedDate] = useState(null);
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);

  const calendarRef = useRef(null);
  const statusDropdownRef = useRef(null);
  const [currentMonth, setCurrentMonth] = useState(new Date());

  useEffect(() => {
    fetchRequests();
  }, []);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (calendarRef.current && !calendarRef.current.contains(event.target)) {
        setShowCalendar(false);
      }
      if (statusDropdownRef.current && !statusDropdownRef.current.contains(event.target)) {
        setShowStatusDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchRequests = async () => {
    try {
      setLoading(true);
      const res = await api.get('/leaves');
      setRequests(res.data.data);
    } catch (err) {
      toast.error('Failed to load leave requests');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '--/--/----';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '--/--/----';
    return date.toLocaleDateString();
  };

  const handleAction = async (id, status) => {
    if (!window.confirm(`Are you sure you want to ${status.toLowerCase()} this leave request?`)) return;
    try {
      await api.put(`/leaves/${id}/status`, { status });
      toast.success(`Leave request ${status}`);
      fetchRequests();
    } catch (err) {
      toast.error('Failed to update status');
    }
  };

  const filteredRequests = requests.filter(req => {
    const matchesSearch =
      req.user?.name?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = filterStatus === 'All' || req.status === filterStatus;

    let matchesDate = true;
    if (selectedDate) {
      const selDate = new Date(selectedDate);
      const start = new Date(req.startDate);
      const end = new Date(req.endDate);
      selDate.setHours(0, 0, 0, 0);
      start.setHours(0, 0, 0, 0);
      end.setHours(0, 0, 0, 0);
      matchesDate = selDate >= start && selDate <= end;
    }

    return matchesSearch && matchesStatus && matchesDate;
  });

  const stats = {
    pending: filteredRequests.filter(r => r.status === 'Pending').length,
    approved: filteredRequests.filter(r => r.status === 'Approved').length,
    rejected: filteredRequests.filter(r => r.status === 'Rejected').length
  };

  const daysInMonth = (date) => new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  const startDayOfMonth = (date) => new Date(date.getFullYear(), date.getMonth(), 1).getDay();

  const calendarDays = [];
  const totalDays = daysInMonth(currentMonth);
  const startDay = startDayOfMonth(currentMonth);
  for (let i = 0; i < startDay; i++) calendarDays.push(null);
  for (let i = 1; i <= totalDays; i++) calendarDays.push(i);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-96">
        <Loader2 className="animate-spin text-indigo-600" size={40} />
      </div>
    );
  }

  return (
    <div className="space-y-6 md:space-y-8 animate-fade-up">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight m-0">Leave Requests</h2>
          <p className="text-slate-600 font-bold text-[13px] mt-2">Manage staff leaves and approvals</p>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row justify-between items-center gap-6">
        <div className="flex flex-wrap items-center gap-4 w-full lg:w-auto">
          {/* Calendar Picker (Today/Yesterday/Custom buttons REMOVED per request) */}
          <div className="relative" ref={calendarRef}>
            <div
              className={`flex items-center gap-3 border px-5 py-3 rounded-2xl shadow-sm hover:bg-slate-50 transition-all min-w-[180px] cursor-pointer ${selectedDate ? 'bg-indigo-50 border-indigo-200 text-indigo-600' : 'bg-white border-slate-200 text-slate-700'
                }`}
              onClick={() => setShowCalendar(!showCalendar)}
            >
              <Calendar size={16} />
              <span className="text-sm font-bold">
                {selectedDate ? new Date(selectedDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'All Dates'}
              </span>
              {selectedDate && (
                <button
                  onClick={(e) => { e.stopPropagation(); setSelectedDate(null); }}
                  className="ml-auto p-1 hover:bg-indigo-200 rounded-full transition-colors"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            <AnimatePresence>
              {showCalendar && (
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 10, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  className="absolute top-full left-0 mt-2 z-[110] bg-white border border-slate-200 rounded-3xl shadow-2xl p-6 w-80"
                >
                  <div className="flex justify-between items-center mb-6">
                    <h4 className="text-sm font-bold text-slate-900">
                      {currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                    </h4>
                    <div className="flex gap-1">
                      <button onClick={() => setCurrentMonth(new Date(currentMonth.setMonth(currentMonth.getMonth() - 1)))} className="p-2 hover:bg-slate-50 text-slate-400 rounded-lg"><ChevronLeft size={16} /></button>
                      <button onClick={() => setCurrentMonth(new Date(currentMonth.setMonth(currentMonth.getMonth() + 1)))} className="p-2 hover:bg-slate-50 text-slate-400 rounded-lg"><ChevronRight size={16} /></button>
                    </div>
                  </div>
                  <div className="grid grid-cols-7 gap-1 mb-2">
                    {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(d => (
                      <div key={d} className="text-[10px] font-bold text-slate-400 text-center py-2">{d}</div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 gap-1">
                    {calendarDays.map((day, idx) => {
                      if (!day) return <div key={idx} className="h-9" />;
                      const dateObj = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
                      const isFuture = dateObj > new Date();
                      const isSelected = selectedDate === formatDateString(dateObj);
                      const isToday = formatDateString(dateObj) === formatDateString(new Date());

                      return (
                        <button
                          key={idx}
                          disabled={isFuture}
                          onClick={() => {
                            setSelectedDate(formatDateString(dateObj));
                            setShowCalendar(false);
                          }}
                          className={`h-9 flex flex-col items-center justify-center rounded-xl text-[11px] font-bold transition-all relative ${isFuture ? 'text-slate-200 cursor-not-allowed' :
                              isSelected ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' : 'text-slate-700 hover:bg-indigo-50 hover:text-indigo-600'
                            }`}
                        >
                          {day}
                          {isToday && !isSelected && <div className="absolute bottom-1 w-1 h-1 rounded-full bg-indigo-600" />}
                        </button>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="relative" ref={statusDropdownRef}>
            <button
              onClick={() => setShowStatusDropdown(!showStatusDropdown)}
              className="flex items-center gap-3 bg-white border border-slate-200 px-5 py-3 rounded-2xl shadow-sm hover:bg-slate-50 transition-all min-w-[150px] justify-between"
            >
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${filterStatus === 'Approved' ? 'bg-emerald-500' :
                    filterStatus === 'Pending' ? 'bg-amber-500' :
                      filterStatus === 'Rejected' ? 'bg-rose-500' : 'bg-slate-300'
                  }`} />
                <span className="text-sm font-bold text-slate-700">{filterStatus}</span>
              </div>
              <ChevronDown size={16} className={`text-slate-400 transition-transform ${showStatusDropdown ? 'rotate-180' : ''}`} />
            </button>

            <AnimatePresence>
              {showStatusDropdown && (
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 10, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  className="absolute top-full left-0 mt-2 z-[110] bg-white border border-slate-200 rounded-2xl shadow-2xl p-2 w-full min-w-[180px]"
                >
                  {['All', 'Pending', 'Approved', 'Rejected'].map((status) => (
                    <button
                      key={status}
                      onClick={() => {
                        setFilterStatus(status);
                        setShowStatusDropdown(false);
                      }}
                      className={`w-full text-left px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-between ${filterStatus === status ? 'bg-indigo-50 text-indigo-600' : 'text-slate-600 hover:bg-slate-50'
                        }`}
                    >
                      {status}
                      {filterStatus === status && <Check size={14} />}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <div className="relative w-full sm:w-80">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by name or reason..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-white border border-slate-200 pl-12 pr-4 py-3.5 rounded-2xl outline-none focus:border-indigo-300 focus:ring-4 focus:ring-indigo-50 transition-all w-full text-sm font-bold text-slate-800 placeholder:text-slate-400 shadow-sm"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="glass-card p-6 border-l-4 border-indigo-500 bg-white shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-4">
            <p className="text-slate-500 text-xs font-bold tracking-tight">Pending Approval</p>
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Clock size={16} />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <h3 className="text-3xl font-bold text-slate-900 tracking-tight">{stats.pending}</h3>
            <span className="text-indigo-400 text-[10px] font-bold">Waiting</span>
          </div>
        </div>
        <div className="glass-card p-6 border-l-4 border-emerald-500 bg-white shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-4">
            <p className="text-slate-500 text-xs font-bold tracking-tight">Approved</p>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Check size={16} />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <h3 className="text-3xl font-bold text-slate-900 tracking-tight">{stats.approved}</h3>
            <span className="text-emerald-500 text-[10px] font-bold">Done</span>
          </div>
        </div>
        <div className="glass-card p-6 border-l-4 border-rose-500 bg-white shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-4">
            <p className="text-slate-500 text-xs font-bold tracking-tight">Rejected</p>
            <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
              <X size={16} />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <h3 className="text-3xl font-bold text-slate-900 tracking-tight">{stats.rejected}</h3>
            <span className="text-rose-500 text-[10px] font-bold">Rejected</span>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        <div className="flex items-center justify-between px-2">
          <h3 className="text-lg font-bold text-slate-800 tracking-tight">Staff Requests</h3>
          <p className="text-slate-400 text-xs font-medium">{filteredRequests.length} results found</p>
        </div>

        {filteredRequests.length === 0 ? (
          <div className="glass-card p-20 text-center bg-white border-dashed border-2 border-slate-200 shadow-none">
            <div className="w-16 h-16 bg-slate-50 text-slate-300 rounded-full flex items-center justify-center mx-auto mb-4">
              <FileText size={32} />
            </div>
            <p className="text-slate-400 font-bold text-sm tracking-tight">No leave requests found</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredRequests.map((req) => (
              <div key={req._id} className="glass-card group flex flex-col bg-white hover:shadow-xl hover:shadow-indigo-500/10 transition-all duration-300 border border-slate-100 overflow-hidden">
                <div className="p-6 flex-1 flex flex-col">
                  <div className="flex items-start justify-between mb-6">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center font-bold text-lg shadow-sm group-hover:scale-110 transition-transform">
                        {req.user?.name?.charAt(0) || 'U'}
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-900 text-base tracking-tight truncate max-w-[140px]">{req.user?.name || 'Staff Member'}</h4>
                        <p className="text-[10px] text-indigo-600 font-bold tracking-tight ">{req.user?.department || 'Department'}</p>
                      </div>
                    </div>
                    <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold tracking-tight border ${req.status === 'Pending' ? 'bg-amber-50 text-amber-600 border-amber-100' :
                        req.status === 'Approved' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                          'bg-rose-50 text-rose-600 border-rose-100'
                      }`}>
                      {req.status}
                    </span>
                  </div>

                  <div className="bg-slate-50/80 rounded-2xl p-4 mb-6 flex-1 border border-slate-100/50">
                    <div className="flex items-center gap-2 text-indigo-600 text-[10px] font-bold mb-2 tracking-tight">
                      <Clock size={10} /> {req.leaveType}
                    </div>
                    <p className="text-slate-600 text-xs font-medium leading-relaxed">
                      {req.reason}
                    </p>
                    <div className="mt-3 flex items-center gap-1.5">
                      <span className="bg-white/50 px-2 py-0.5 rounded text-[10px] font-bold text-slate-500 border border-slate-100">
                        {Math.ceil((new Date(req.endDate) - new Date(req.startDate)) / (1000 * 60 * 60 * 24)) + 1} Day(s)
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-slate-500 text-[11px] font-bold mb-6 px-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-slate-400 font-medium">From:</span> {formatDate(req.startDate)}
                    </div>
                    <div className="flex items-center gap-1.5 text-right">
                      <span className="text-slate-400 font-medium">To:</span> {formatDate(req.endDate)}
                    </div>
                  </div>

                  {req.status === 'Pending' && (
                    <div className="grid grid-cols-2 gap-3 pt-4 border-t border-slate-50">
                      <button
                        onClick={() => handleAction(req._id, 'Approved')}
                        className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-emerald-600 text-white font-bold text-xs hover:bg-emerald-700 transition-all shadow-sm active:scale-95"
                      >
                        <Check size={14} strokeWidth={3} />
                        Approve
                      </button>
                      <button
                        onClick={() => handleAction(req._id, 'Rejected')}
                        className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-rose-50 text-rose-600 font-bold text-xs hover:bg-rose-100 transition-all border border-rose-100 active:scale-95"
                      >
                        <X size={14} strokeWidth={3} />
                        Reject
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Leaves;
