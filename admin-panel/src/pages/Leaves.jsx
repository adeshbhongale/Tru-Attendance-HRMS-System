import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronDown, ChevronLeft, ChevronRight, Clock, FileText, Filter, Loader2, Search, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api, { IMAGE_BASE_URL } from '../api/axios';

const getFullImageUrl = (path) => {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  return `${IMAGE_BASE_URL}/${path.replace(/\\/g, '/')}`;
};

const Leaves = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState(searchParams.get('status') || 'All');
  const [filterType, setFilterType] = useState('All');
  const [filterDuration, setFilterDuration] = useState('All');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const [confirmModal, setConfirmModal] = useState({ show: false, id: null, status: null });

  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const [showTypeDropdown, setShowTypeDropdown] = useState(false);
  const [showDurationDropdown, setShowDurationDropdown] = useState(false);
  
  const statusDropdownRef = useRef(null);
  const typeDropdownRef = useRef(null);
  const durationDropdownRef = useRef(null);

  useEffect(() => {
    fetchRequests();
  }, []);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (statusDropdownRef.current && !statusDropdownRef.current.contains(event.target)) {
        setShowStatusDropdown(false);
      }
      if (typeDropdownRef.current && !typeDropdownRef.current.contains(event.target)) {
        setShowTypeDropdown(false);
      }
      if (durationDropdownRef.current && !durationDropdownRef.current.contains(event.target)) {
        setShowDurationDropdown(false);
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

  const handleAction = (id, status) => {
    setConfirmModal({ show: true, id, status });
  };

  const confirmAction = async () => {
    const { id, status } = confirmModal;
    try {
      await api.put(`/leaves/${id}/status`, { status });
      toast.success(`Leave request ${status}`);
      setConfirmModal({ show: false, id: null, status: null });
      fetchRequests();
    } catch (err) {
      toast.error('Failed to update status');
      setConfirmModal({ show: false, id: null, status: null });
    }
  };

  const filteredRequests = requests.filter(req => {
    const matchesSearch =
      req.user?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      req.reason?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = filterStatus === 'All' || req.status === filterStatus;
    const matchesType = filterType === 'All' || req.leaveType === filterType;
    const matchesDuration = filterDuration === 'All' || req.duration === filterDuration;

    return matchesSearch && matchesStatus && matchesType && matchesDuration;
  });

  const stats = {
    pending: filteredRequests.filter(r => r.status === 'Pending').length,
    approved: filteredRequests.filter(r => r.status === 'Approved').length,
    rejected: filteredRequests.filter(r => r.status === 'Rejected').length,
    cancelled: filteredRequests.filter(r => r.status === 'Cancelled').length,
    halfDays: filteredRequests.filter(r => r.status === 'Approved' && r.duration === 'Half Day').length,
    fullDays: filteredRequests.filter(r => r.status === 'Approved' && r.duration === 'Full Day').length,
  };

  const currentData = filteredRequests.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const totalPages = Math.ceil(filteredRequests.length / itemsPerPage);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <Loader2 className="animate-spin text-indigo-600" size={40} />
        <p className="text-slate-500 font-bold text-sm animate-pulse tracking-widest ">Loading Requests...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-up">
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate(-1)}
            className="p-3 bg-white border border-slate-200 text-slate-400 hover:text-indigo-600 rounded-2xl hover:shadow-lg transition-all"
          >
            <ChevronLeft size={20} />
          </button>
          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight m-0">Leave Requests</h2>
            <p className="text-slate-600 font-bold text-[13px] mt-2">Manage staff leaves and approvals</p>
          </div>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row justify-between items-center gap-6">
        <div className="flex flex-wrap items-center gap-4 w-full lg:w-auto">
          <div className="relative" ref={statusDropdownRef}>
            <button
              onClick={() => setShowStatusDropdown(!showStatusDropdown)}
              className="flex items-center gap-3 bg-white border border-slate-200 px-5 py-3 rounded-2xl shadow-sm hover:bg-slate-50 transition-all min-w-[150px] justify-between"
            >
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${filterStatus === 'Approved' ? 'bg-emerald-500' :
                  filterStatus === 'Pending' ? 'bg-amber-500' :
                    filterStatus === 'Rejected' ? 'bg-rose-500' :
                      filterStatus === 'Cancelled' ? 'bg-slate-500' : 'bg-slate-300'
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
                  {['All', 'Pending', 'Approved', 'Rejected', 'Cancelled'].map((status) => (
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

          <div className="relative" ref={typeDropdownRef}>
            <button
              onClick={() => setShowTypeDropdown(!showTypeDropdown)}
              className="flex items-center gap-3 bg-white border border-slate-200 px-5 py-3 rounded-2xl shadow-sm hover:bg-slate-50 transition-all min-w-[150px] justify-between"
            >
              <div className="flex items-center gap-2">
                <FileText size={16} className="text-slate-400" />
                <span className="text-sm font-bold text-slate-700">{filterType}</span>
              </div>
              <ChevronDown size={16} className={`text-slate-400 transition-transform ${showTypeDropdown ? 'rotate-180' : ''}`} />
            </button>

            <AnimatePresence>
              {showTypeDropdown && (
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 10, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  className="absolute top-full left-0 mt-2 z-[110] bg-white border border-slate-200 rounded-2xl shadow-2xl p-2 w-full min-w-[180px]"
                >
                  {['All', 'Casual Leave', 'Sick Leave', 'Paid Leave', 'Unpaid Leave'].map((type) => (
                    <button
                      key={type}
                      onClick={() => {
                        setFilterType(type);
                        setShowTypeDropdown(false);
                      }}
                      className={`w-full text-left px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-between ${filterType === type ? 'bg-indigo-50 text-indigo-600' : 'text-slate-600 hover:bg-slate-50'
                        }`}
                    >
                      {type}
                      {filterType === type && <Check size={14} />}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="relative" ref={durationDropdownRef}>
            <button
              onClick={() => setShowDurationDropdown(!showDurationDropdown)}
              className="flex items-center gap-3 bg-white border border-slate-200 px-5 py-3 rounded-2xl shadow-sm hover:bg-slate-50 transition-all min-w-[150px] justify-between"
            >
              <div className="flex items-center gap-2">
                <Clock size={16} className="text-slate-400" />
                <span className="text-sm font-bold text-slate-700">{filterDuration}</span>
              </div>
              <ChevronDown size={16} className={`text-slate-400 transition-transform ${showDurationDropdown ? 'rotate-180' : ''}`} />
            </button>

            <AnimatePresence>
              {showDurationDropdown && (
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 10, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  className="absolute top-full left-0 mt-2 z-[110] bg-white border border-slate-200 rounded-2xl shadow-2xl p-2 w-full min-w-[180px]"
                >
                  {['All', 'Full Day', 'Half Day'].map((dur) => (
                    <button
                      key={dur}
                      onClick={() => { setFilterDuration(dur); setShowDurationDropdown(false); }}
                      className={`w-full text-left px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-between ${filterDuration === dur ? 'bg-indigo-50 text-indigo-600' : 'text-slate-600 hover:bg-slate-50'
                        }`}
                    >
                      {dur}
                      {filterDuration === dur && <Check size={14} />}
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

      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-6">
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm border-l-4 border-l-indigo-500">
          <div className="flex items-center justify-between mb-4">
            <p className="text-slate-500 text-xs font-bold tracking-tight ">Pending Approval</p>
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Clock size={16} />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <h3 className="text-3xl font-bold text-slate-900 tracking-tight">{stats.pending}</h3>
            <span className="text-indigo-400 text-[10px] font-bold tracking-widest">Waiting</span>
          </div>
        </div>
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm border-l-4 border-l-emerald-500">
          <div className="flex items-center justify-between mb-4">
            <p className="text-slate-500 text-xs font-bold tracking-tight ">Approved</p>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Check size={16} />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <h3 className="text-3xl font-bold text-slate-900 tracking-tight">{stats.approved}</h3>
            <span className="text-emerald-500 text-[10px] font-bold  tracking-widest">Done</span>
          </div>
        </div>
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm border-l-4 border-l-rose-500">
          <div className="flex items-center justify-between mb-4">
            <p className="text-slate-500 text-xs font-bold tracking-tight ">Rejected</p>
            <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
              <X size={16} />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <h3 className="text-3xl font-bold text-slate-900 tracking-tight">{stats.rejected}</h3>
            <span className="text-rose-500 text-[10px] font-bold  tracking-widest">Rejected</span>
          </div>
        </div>
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm border-l-4 border-l-slate-400">
          <div className="flex items-center justify-between mb-4">
            <p className="text-slate-500 text-xs font-bold tracking-tight ">Cancelled</p>
            <div className="w-8 h-8 rounded-lg bg-slate-50 text-slate-400 flex items-center justify-center">
              <Filter size={16} />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <h3 className="text-3xl font-bold text-slate-900 tracking-tight">{stats.cancelled}</h3>
            <span className="text-slate-400 text-[10px] font-bold  tracking-widest">Cancelled</span>
          </div>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm border-l-4 border-l-amber-400">
          <div className="flex items-center justify-between mb-4">
            <p className="text-slate-500 text-xs font-bold tracking-tight ">Half Days</p>
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <Clock size={16} />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <h3 className="text-3xl font-bold text-slate-900 tracking-tight">{stats.halfDays}</h3>
            <span className="text-amber-500 text-[10px] font-bold  tracking-widest">Half</span>
          </div>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm border-l-4 border-l-indigo-400">
          <div className="flex items-center justify-between mb-4">
            <p className="text-slate-500 text-xs font-bold tracking-tight ">Full Days</p>
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Check size={16} />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <h3 className="text-3xl font-bold text-slate-900 tracking-tight">{stats.fullDays}</h3>
            <span className="text-indigo-500 text-[10px] font-bold  tracking-widest">Full</span>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-8 border-b border-slate-50 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-800 tracking-widest flex items-center gap-3">
            <FileText size={18} className="text-indigo-600" />
            PENDING REQUESTS
          </h3>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
            <span className="text-[10px] font-extrabold text-slate-400 tracking-[0.2em] ">Live Overview</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50/50">
                <th className="px-8 py-5 text-center text-[12px] font-bold text-slate-800  tracking-[0.15em]">Employee</th>
                <th className="px-6 py-5 text-center text-[12px] font-bold text-slate-800  tracking-[0.15em]">Type</th>
                <th className="px-6 py-5 text-center text-[12px] font-bold text-slate-800  tracking-[0.15em]">Duration</th>
                <th className="px-6 py-5 text-center text-[12px] font-bold text-slate-800  tracking-[0.15em]">Reason</th>
                <th className="px-6 py-5 text-center text-[12px] font-bold text-slate-800  tracking-[0.15em]">Status</th>
                <th className="px-8 py-5 text-center text-[12px] font-bold text-slate-800  tracking-[0.15em]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {currentData.map((req) => (
                <tr key={req._id} className="hover:bg-slate-50/50 transition-colors group">
                  <td className="px-8 py-5">
                    <div className="flex items-center gap-4">
                      <div className="relative">
                        <img
                          src={getFullImageUrl(req.user?.profileImage) || 'https://ui-avatars.com/api/?name=' + req.user?.name}
                          alt=""
                          className="w-11 h-11 rounded-2xl object-cover ring-2 ring-white shadow-md group-hover:scale-105 transition-transform"
                        />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-800">{req.user?.name}</p>
                        <p className="text-[10px] font-bold text-slate-400  tracking-widest mt-0.5">{req.user?.designation || 'Staff Member'}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    <span className="px-3 py-1 bg-indigo-50 text-indigo-600 rounded-full text-[10px] font-bold tracking-widest ">
                      {req.leaveType}
                    </span>
                  </td>
                  <td className="px-6 py-5">
                    <div className="space-y-1">
                      <p className="text-xs font-bold text-slate-800">{formatDate(req.startDate)} {req.duration === 'Full Day' && `- ${formatDate(req.endDate)}`}</p>
                      <div className="flex items-center gap-2">
                        <p className="text-[11px] text-indigo-600 font-bold tracking-widest bg-indigo-50 px-2 py-0.5 rounded-md inline-block">
                          {req.duration === 'Half Day' ? '0.5' : Math.ceil((new Date(req.endDate) - new Date(req.startDate)) / (1000 * 60 * 60 * 24)) + 1} DAYS
                        </p>
                        <p className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md ${req.duration === 'Half Day' ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'}`}>
                          {(req.duration || 'Full Day').toUpperCase()}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    <p className="text-xs text-slate-600 max-w-[250px] leading-relaxed">
                      {req.reason}
                    </p>
                  </td>
                  <td className="px-6 py-5">
                    <span className={`px-3 py-1.5 rounded-xl text-[10px] font-bold tracking-widest  ${req.status === 'Approved' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' :
                      req.status === 'Pending' ? 'bg-amber-50 text-amber-600 border border-amber-100' :
                        req.status === 'Rejected' ? 'bg-rose-50 text-rose-600 border border-rose-100' :
                          'bg-slate-50 text-slate-500 border border-slate-100'
                      }`}>
                      {req.status}
                    </span>
                  </td>
                  <td className="px-8 py-5 text-right">
                    {req.status === 'Pending' ? (
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleAction(req._id, 'Approved')}
                          className="p-2.5 bg-emerald-50 text-emerald-600 hover:bg-emerald-600 hover:text-white rounded-xl transition-all shadow-sm hover:shadow-emerald-100"
                        >
                          <Check size={16} strokeWidth={2.5} />
                        </button>
                        <button
                          onClick={() => handleAction(req._id, 'Rejected')}
                          className="p-2.5 bg-rose-50 text-rose-600 hover:bg-rose-600 hover:text-white rounded-xl transition-all shadow-sm hover:shadow-rose-100"
                        >
                          <X size={16} strokeWidth={2.5} />
                        </button>
                      </div>
                    ) : (
                      <span className="text-[10px] font-bold text-slate-300  tracking-widest italic">No actions</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="p-8 bg-slate-50/30 flex items-center justify-between">
            <p className="text-xs font-bold text-slate-500">
              Showing <span className="text-slate-900">{currentData.length}</span> of <span className="text-slate-900">{filteredRequests.length}</span> requests
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="p-2.5 bg-white border border-slate-200 text-slate-400 hover:text-indigo-600 rounded-xl disabled:opacity-50 transition-all hover:shadow-md"
              >
                <ChevronLeft size={18} />
              </button>
              {[...Array(totalPages)].map((_, i) => (
                <button
                  key={i}
                  onClick={() => setCurrentPage(i + 1)}
                  className={`w-10 h-10 rounded-xl text-xs font-bold transition-all ${currentPage === i + 1
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100'
                    : 'bg-white border border-slate-200 text-slate-600 hover:border-indigo-300'
                    }`}
                >
                  {i + 1}
                </button>
              ))}
              <button
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                className="p-2.5 bg-white border border-slate-200 text-slate-400 hover:text-indigo-600 rounded-xl disabled:opacity-50 transition-all hover:shadow-md"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        )}
      </div>

      <AnimatePresence>
        {confirmModal.show && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-[2.5rem] p-8 max-w-sm w-full shadow-2xl border border-slate-100"
            >
              <div className={`w-16 h-16 rounded-3xl mb-6 flex items-center justify-center ${confirmModal.status === 'Approved' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
                }`}>
                {confirmModal.status === 'Approved' ? <Check size={32} strokeWidth={3} /> : <X size={32} strokeWidth={3} />}
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-2">Confirm Action</h3>
              <p className="text-slate-500 text-sm font-medium leading-relaxed mb-8">
                Are you sure you want to <span className="font-bold text-slate-700">{confirmModal.status.toLowerCase()}</span> this leave request? This action cannot be undone.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmModal({ show: false, id: null, status: null })}
                  className="flex-1 py-4 bg-slate-50 text-slate-600 rounded-2xl text-sm font-bold hover:bg-slate-100 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmAction}
                  className={`flex-1 py-4 rounded-2xl text-sm font-bold text-white transition-all shadow-lg ${confirmModal.status === 'Approved'
                    ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-100'
                    : 'bg-rose-600 hover:bg-rose-700 shadow-rose-100'
                    }`}
                >
                  Yes, {confirmModal.status}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Leaves;
