import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  BarChart2,
  Bell,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Edit2,
  Filter,
  Plus,
  RefreshCw,
  Search,
  Send,
  Sparkles,
  Target,
  Trash2
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import api from '../../api/axios';

const CustomFilterSelect = ({ value, onChange, options, icon: Icon, prefix }) => {
  const [isOpen, setIsOpen] = useState(false);
  const selectedOption = options.find(opt => opt.value === value) || options[0];

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 border border-slate-200 px-4 py-2.5 rounded-2xl bg-slate-50 text-slate-700 text-xs font-bold hover:bg-slate-100 hover:border-slate-300 transition-all cursor-pointer select-none active:scale-[0.98]"
      >
        {Icon && <Icon size={14} className="text-slate-400 shrink-0" />}
        {prefix && <span className="text-slate-500 font-bold">{prefix}</span>}
        <span className="text-indigo-600 font-extrabold">{selectedOption.label}</span>
        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.15 }}
          className="text-slate-400 shrink-0 animate-fade-in"
        >
          <ChevronDown size={14} />
        </motion.div>
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.96 }}
              transition={{ duration: 0.12 }}
              className="absolute right-0 mt-2 bg-white border border-slate-200 rounded-2xl shadow-xl shadow-slate-100/50 min-w-[150px] overflow-hidden z-50"
            >
              <div className="p-1.5 space-y-0.5 animate-fade-in">
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
                      className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold text-left transition-all ${isSelected
                        ? 'bg-gradient-to-r from-indigo-50 to-violet-50 text-indigo-600'
                        : 'text-slate-700 hover:bg-slate-50 hover:text-indigo-600'
                        }`}
                    >
                      <span>{opt.label}</span>
                      {isSelected && (
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3" className="text-indigo-600 shrink-0">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                      )}
                    </button>
                  );
                })}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

const AllNotifications = () => {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [typeFilter, setTypeFilter] = useState('All');
  const [deleteConfirm, setDeleteConfirm] = useState({ show: false, id: null });
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const fetchAll = async () => {
    try {
      setLoading(true);
      const res = await api.get('/notifications');
      if (res.data.success) {
        setNotifications(res.data.data);
      }
    } catch (err) {
      toast.error('Failed to load notifications');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const handleSendImmediately = async (id) => {
    try {
      const loadToast = toast.loading('Dispatching push notification...');
      const res = await api.post(`/notifications/${id}/send`);
      toast.dismiss(loadToast);
      if (res.data.success) {
        toast.success(res.data.message || 'Notification broadcast successfully!');
        fetchAll();
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to dispatch notification');
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm.id) return;
    const idToDelete = deleteConfirm.id;
    try {
      const res = await api.delete(`/notifications/${idToDelete}`);
      if (res.data.success) {
        toast.success('Deleted notification successfully!');
        fetchAll();
      }
    } catch (err) {
      toast.error('Failed to delete notification');
    }
  };

  const filtered = useMemo(() => {
    return notifications.filter(n => {
      const text = ((n.title || '') + ' ' + (n.description || n.message || '')).toLowerCase();
      const matchSearch = text.includes(searchTerm.toLowerCase());
      const matchStatus = statusFilter === 'All' ||
        (n.status || '').toLowerCase() === statusFilter.toLowerCase();
      const matchType = typeFilter === 'All' ||
        (typeFilter === 'Automated' ? n.isAuto === true : !n.isAuto);
      return matchSearch && matchStatus && matchType;
    });
  }, [notifications, searchTerm, statusFilter, typeFilter]);

  const totalPages = Math.ceil(filtered.length / itemsPerPage);
  const paginatedData = useMemo(() => {
    return filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  }, [filtered, currentPage]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, typeFilter]);

  return (
    <>
      <div className="space-y-6 md:space-y-8 animate-fade-up">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight m-0">Notification Panel</h2>
            <p className="text-slate-600 font-bold text-[13px] mt-2">Manage employee broadcasts, push alerts, and auto-notification workflows</p>
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto">
            {/* View Dashboard Button */}
            <button
              onClick={() => navigate('/notifications/dashboard')}
              className="flex items-center justify-center gap-2 bg-white text-indigo-600 border border-slate-200 px-4 py-3.5 rounded-2xl font-bold text-sm hover:bg-slate-50 hover:border-indigo-100 transition-all active:scale-95 shadow-sm"
            >
              <BarChart2 size={18} />
              Dashboard & Analytics
            </button>

            {/* Create Notification Button */}
            <button
              onClick={() => navigate('/notifications/create')}
              className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-gradient-to-r from-indigo-600 to-violet-600 text-white px-6 py-3.5 rounded-2xl font-bold text-sm shadow-xl shadow-indigo-100/50 hover:opacity-95 transition-all active:scale-95"
            >
              <Plus size={18} />
              Add Notification
            </button>
          </div>
        </div>

        {/* Filter controls */}
        <div className="bg-white border border-slate-200 p-5 rounded-3xl shadow-xl shadow-slate-100/50 flex flex-col md:flex-row items-center gap-4">
          <div className="relative w-full md:flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              placeholder="Search notifications by title or message summary..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-11 pr-5 py-3.5 rounded-2xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all text-sm font-medium"
            />
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto">
            <CustomFilterSelect
              value={statusFilter}
              onChange={setStatusFilter}
              prefix="Status: "
              icon={Filter}
              options={[
                { value: 'All', label: 'All Statuses' },
                { value: 'Draft', label: 'Draft' },
                { value: 'Scheduled', label: 'Scheduled' },
                { value: 'Sent', label: 'Sent' }
              ]}
            />

            <CustomFilterSelect
              value={typeFilter}
              onChange={setTypeFilter}
              prefix="Type: "
              icon={Sparkles}
              options={[
                { value: 'All', label: 'All Types' },
                { value: 'Standard', label: 'Standard' },
                { value: 'Automated', label: 'Automated' }
              ]}
            />

            <button
              onClick={fetchAll}
              className="p-3 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-2xl text-slate-600 transition-all shadow-sm shrink-0"
              title="Synchronize Feed"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* Table representation */}
        <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse border border-slate-200">
              <thead>
                <tr className="bg-slate-50/30">
                  <th className="px-6 py-5 text-[10px] font-extrabold text-indigo-600 tracking-widest border border-slate-200">BROADCAST CAMPAIGN</th>
                  <th className="px-6 py-5 text-[10px] font-extrabold text-indigo-600 tracking-widest border border-slate-200">NOTIFICATION TYPE</th>
                  <th className="px-6 py-5 text-[10px] font-extrabold text-indigo-600 tracking-widest border border-slate-200">WORKFLOW TYPE</th>
                  <th className="px-6 py-5 text-[10px] font-extrabold text-indigo-600 tracking-widest border border-slate-200">TARGET AUDIENCE</th>
                  <th className="px-6 py-5 text-[10px] font-extrabold text-indigo-600 tracking-widest text-center border border-slate-200">STATUS</th>
                  <th className="px-6 py-5 text-[10px] font-extrabold text-indigo-600 tracking-widest text-right border border-slate-200">ACTIONS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {loading ? (
                  <tr>
                    <td colSpan="6" className="px-6 py-20 text-center">
                      <div className="flex flex-col items-center justify-center gap-3">
                        <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
                        <p className="text-slate-400 font-bold text-sm">Loading notifications database feed...</p>
                      </div>
                    </td>
                  </tr>
                ) : paginatedData.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="px-6 py-20 text-center">
                      <div className="flex flex-col items-center">
                        <div className="w-16 h-16 bg-slate-50 border border-slate-100 rounded-[1.5rem] flex items-center justify-center text-indigo-500 mb-4 shadow-inner">
                          <Bell size={28} />
                        </div>
                        <h4 className="text-slate-700 font-bold text-base">No notifications matches current settings</h4>
                        <p className="text-xs text-slate-500 mt-1 max-w-xs leading-relaxed">Relax query criteria search or register a new custom push broadcast campaign now.</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  paginatedData.map((notif) => {
                    let statusColor = 'bg-slate-50 text-slate-500 border-slate-200';
                    const statusLower = (notif.status || '').toLowerCase();
                    if (statusLower === 'sent') statusColor = 'bg-emerald-50 text-emerald-600 border border-emerald-100';
                    if (statusLower === 'scheduled') statusColor = 'bg-amber-50 text-amber-600 border border-amber-100';
                    if (statusLower === 'draft') statusColor = 'bg-slate-100 text-slate-500 border border-slate-200';

                    const scope = notif.targetScope || {
                      'All Employees': 'all',
                      'Specific Department': 'department',
                      'Specific Employees': 'employees',
                      'Shift-based Employees': 'shift',
                      'Location-based Employees': 'location',
                      'Role-based Employees': 'role'
                    }[notif.targetType] || 'all';

                    const scopeDepartments = notif.targetDepartments || notif.departments || [];
                    const scopeEmployees = notif.targetEmployees || notif.employees || [];

                    return (
                      <tr key={notif._id} className="hover:bg-slate-50/50 transition-colors group">
                        <td className="px-6 py-5 border border-slate-200 max-w-[280px]">
                          <div className="flex flex-col">
                            <span className="text-sm font-bold text-slate-900 truncate leading-snug">{notif.title}</span>
                            <span className="text-xs text-slate-500 mt-1 line-clamp-2 leading-relaxed">{notif.description || notif.message}</span>
                          </div>
                        </td>
                        <td className="px-6 py-5 border border-slate-200">
                          <span className={`text-[10px] font-extrabold px-2.5 py-1 rounded-xl border w-fit tracking-wider block text-center ${notif.type === 'Emergency Alert'
                            ? 'bg-rose-50 text-rose-600 border-rose-100'
                            : notif.type === 'Meeting Notification'
                              ? 'bg-cyan-50 text-cyan-600 border-cyan-100'
                              : notif.type === 'Late Coming' || notif.type === 'Attendance Alert'
                                ? 'bg-amber-50 text-amber-600 border-amber-100'
                                : notif.type === 'HR Announcement'
                                  ? 'bg-purple-50 text-purple-600 border-purple-100'
                                  : 'bg-indigo-50 text-indigo-600 border-indigo-100'
                            }`}>
                            {notif.type || 'General Announcement'}
                          </span>
                        </td>
                        <td className="px-6 py-5 border border-slate-200">
                          <div className="flex flex-col gap-1">
                            {notif.isAuto ? (
                              <>
                                <span className="text-xs font-bold text-violet-600">Automated Workflow</span>
                              </>
                            ) : (
                              <>
                                <span className="text-xs font-bold text-indigo-600">Manual Workflow</span>
                              </>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-5 border border-slate-200">
                          <div className="flex flex-col gap-1">
                            <span className="text-xs font-bold capitalize text-slate-700 flex items-center gap-1">
                              <Target size={12} className="text-slate-400" />
                              {scope} Scope
                            </span>
                            {scope === 'department' && scopeDepartments.length > 0 && (
                              <span className="text-[10px] text-slate-500 truncate max-w-[150px]">
                                {scopeDepartments.length || 0} Departments
                              </span>
                            )}
                            {scope === 'employees' && (
                              <span className="text-[10px] text-indigo-500 font-semibold">
                                {scopeEmployees.length || 0} Targeted Staff
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-5 text-center border border-slate-200">
                          <div className="flex flex-col items-center justify-center gap-1.5">
                            <span className={`px-3 py-1 rounded-full text-[10px] font-extrabold tracking-wider border ${statusColor}`}>
                              {notif.status}
                            </span>
                            {notif.scheduledAt && (
                              <div className="flex flex-col items-center gap-0.5 mt-1 text-[10px] font-semibold text-slate-500 leading-none">
                                <span className="flex items-center gap-1 text-[9px] font-extrabold text-slate-400 tracking-wider">
                                  <Clock size={10} /> {statusLower === 'scheduled' ? 'Scheduled At' : 'Sent At'}
                                </span>
                                <span className="font-bold text-slate-700">
                                  {new Date(notif.scheduledAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-5 border border-slate-200">
                          <div className="flex justify-end items-center gap-1.5">
                            {/* Send Now (Only for Scheduled/Draft campaigns) */}
                            {notif.status !== 'Sent' && (
                              <button
                                onClick={() => handleSendImmediately(notif._id)}
                                title="Send push broadcast immediately now"
                                className="p-2 rounded-xl bg-slate-50 text-indigo-500 hover:bg-indigo-600 hover:text-white transition-all shadow-sm"
                              >
                                <Send size={13} />
                              </button>
                            )}

                            {/* Edit Button (Routes to create screen with edit query parameter) */}
                            <button
                              onClick={() => navigate(`/notifications/create?edit=${notif._id}`)}
                              title={notif.isAuto ? "Edit Automatic Workflow Parameters" : "Modify Configuration Parameters"}
                              className="p-2 rounded-xl bg-slate-50 text-slate-400 hover:bg-indigo-600 hover:text-white transition-all shadow-sm"
                            >
                              <Edit2 size={13} />
                            </button>

                            {/* Delete Button */}
                            <button
                              onClick={() => setDeleteConfirm({ show: true, id: notif._id })}
                              title={notif.isAuto ? "Permanently Delete Workflow" : "Permanently Delete Record"}
                              className="p-2 rounded-xl bg-slate-50 text-slate-400 hover:bg-rose-600 hover:text-white transition-all shadow-sm"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {filtered.length > itemsPerPage && (
            <div className="flex justify-between items-center px-8 py-5 bg-slate-50/50 border-t border-slate-100">
              <span className="text-xs font-bold text-slate-500">
                Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, filtered.length)} of {filtered.length} entries
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

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deleteConfirm.show && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-sm rounded-3xl shadow-2xl p-6 flex flex-col items-center text-center"
            >
              <div className="w-16 h-16 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center mb-4">
                <AlertTriangle size={32} />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-2">Delete Broadcast?</h3>
              <p className="text-sm font-medium text-slate-500 mb-6 leading-relaxed">
                Are you sure you want to permanently delete this notification campaign config? This action is irreversible.
              </p>
              <div className="flex w-full gap-3">
                <button
                  onClick={() => setDeleteConfirm({ show: false, id: null })}
                  className="flex-1 py-3 bg-slate-50 text-slate-600 rounded-xl font-bold text-sm hover:bg-slate-100 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    handleDelete();
                    setDeleteConfirm({ show: false, id: null });
                  }}
                  className="flex-1 py-3 bg-rose-500 text-white rounded-xl font-bold text-sm shadow-lg shadow-rose-200 hover:bg-rose-600 transition-all"
                >
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

export default AllNotifications;
