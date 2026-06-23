import React, { useEffect, useState, useMemo } from 'react';
import { useSelector } from 'react-redux';
import { 
  Bell, 
  MapPinOff, 
  MapPin, 
  LogOut, 
  FileText, 
  Check, 
  Trash2, 
  RefreshCw, 
  Search, 
  Filter, 
  Calendar,
  ChevronLeft, 
  ChevronRight,
  AlertTriangle,
  MailOpen
} from 'lucide-react';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../../api/axios';
import socket from '../../socket';

const AdminNotifications = () => {
  const { user } = useSelector((state) => state.auth);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('All'); // 'All', 'Unread', 'Read'
  const [currentPage, setCurrentPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const itemsPerPage = 10;

  const fetchUnreadCount = async () => {
    try {
      const res = await api.get('/notifications/employee/unread-count');
      if (res.data.success) {
        setUnreadCount(res.data.count);
      }
    } catch (err) {
      console.error('Failed to fetch unread count:', err);
    }
  };

  const fetchNotifications = async (page = 1) => {
    try {
      setLoading(true);
      const res = await api.get(`/notifications/employee/feed?page=${page}&limit=${itemsPerPage}`);
      if (res.data.success) {
        setNotifications(res.data.data);
        setTotalItems(res.data.total || res.data.count || 0);
      }
    } catch (err) {
      toast.error('Failed to load alerts');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?._id) {
      fetchNotifications(currentPage);
      fetchUnreadCount();
    }
  }, [user?._id, currentPage]);

  // Real-time socket updates
  useEffect(() => {
    if (!user?._id) return;

    const handleNewNotification = (data) => {
      // Prepend the new notification to the list in real-time
      setNotifications((prev) => [
        {
          _id: data.notificationId || Math.random().toString(),
          title: data.title,
          body: data.body || data.message || '',
          type: data.type,
          autoType: data.autoType,
          isRead: false,
          createdAt: data.createdAt || new Date()
        },
        ...prev
      ]);
      setTotalItems((t) => t + 1);

      // Playful modern push notification alert
      toast.custom((t) => (
        <div
          className={`${
            t.visible ? 'animate-enter' : 'animate-leave'
          } max-w-md w-full bg-white shadow-2xl rounded-2xl pointer-events-auto flex ring-1 ring-black ring-opacity-5 border border-slate-100 p-4 transition-all`}
        >
          <div className="flex-1 w-0">
            <div className="flex items-start">
              <div className="flex-shrink-0 pt-0.5">
                <div className="h-10 w-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                  <Bell size={20} />
                </div>
              </div>
              <div className="ml-3 flex-1">
                <p className="text-sm font-extrabold text-slate-900 leading-snug">{data.title}</p>
                <p className="mt-1 text-xs font-semibold text-slate-500 line-clamp-2 leading-relaxed">
                  {data.body || data.message || ''}
                </p>
              </div>
            </div>
          </div>
          <div className="ml-4 flex-shrink-0 flex border-l border-slate-100 pl-4 items-center">
            <button
              onClick={() => toast.dismiss(t.id)}
              className="w-full border border-transparent rounded-none rounded-r-lg p-2 flex items-center justify-center text-xs font-bold text-indigo-600 hover:text-indigo-500 focus:outline-none"
            >
              Dismiss
            </button>
          </div>
        </div>
      ), { duration: 5000 });
    };

    const handleBadgeUpdate = (data) => {
      if (typeof data.unreadCount === 'number') {
        setUnreadCount(data.unreadCount);
      } else if (data.unreadCountIncrement) {
        setUnreadCount((c) => c + data.unreadCountIncrement);
      }
    };

    socket.on(`notificationReceived:${user._id}`, handleNewNotification);
    socket.on(`notificationBadgeUpdate:${user._id}`, handleBadgeUpdate);

    return () => {
      socket.off(`notificationReceived:${user._id}`, handleNewNotification);
      socket.off(`notificationBadgeUpdate:${user._id}`, handleBadgeUpdate);
    };
  }, [user?._id]);

  const handleMarkAsRead = async (id) => {
    try {
      const res = await api.put(`/notifications/employee/read/${id}`);
      if (res.data.success) {
        setNotifications((prev) =>
          prev.map((n) => (n._id === id ? { ...n, isRead: true } : n))
        );
        setUnreadCount((c) => Math.max(0, c - 1));
      }
    } catch (err) {
      console.error('Failed to mark read:', err);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      const loadToast = toast.loading('Marking alerts as read...');
      const res = await api.put('/notifications/employee/read-all');
      toast.dismiss(loadToast);
      if (res.data.success) {
        setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
        setUnreadCount(0);
        toast.success('All alerts marked as read');
      }
    } catch (err) {
      toast.error('Failed to mark all as read');
    }
  };

  const handleDelete = async (id, wasUnread) => {
    try {
      const res = await api.delete(`/notifications/employee/${id}`);
      if (res.data.success) {
        setNotifications((prev) => prev.filter((n) => n._id !== id));
        setTotalItems((t) => Math.max(0, t - 1));
        if (wasUnread) {
          setUnreadCount((c) => Math.max(0, c - 1));
        }
        toast.success('Alert deleted');
      }
    } catch (err) {
      toast.error('Failed to delete alert');
    }
  };

  // Helper to categorize and return custom style + icon
  const getAlertMetadata = (title = '', description = '') => {
    const combined = `${title} ${description}`.toLowerCase();
    
    if (combined.includes('location service disabled') || combined.includes('gps-status') || combined.includes('telemetry') || combined.includes('location off')) {
      return {
        icon: <MapPinOff size={18} />,
        colorClass: 'text-rose-600 bg-rose-50 border-rose-100',
        badge: 'Location Off'
      };
    }
    if (combined.includes('outside geofence') || combined.includes('exited') || combined.includes('exit')) {
      return {
        icon: <AlertTriangle size={18} />,
        colorClass: 'text-amber-600 bg-amber-50 border-amber-100',
        badge: 'Geofence Exit'
      };
    }
    if (combined.includes('inside geofence') || combined.includes('entered') || combined.includes('entry')) {
      return {
        icon: <MapPin size={18} />,
        colorClass: 'text-emerald-600 bg-emerald-50 border-emerald-100',
        badge: 'Geofence Entry'
      };
    }
    if (combined.includes('logout') || combined.includes('logged out')) {
      return {
        icon: <LogOut size={18} />,
        colorClass: 'text-slate-600 bg-slate-100 border-slate-200',
        badge: 'Logout Event'
      };
    }
    if (combined.includes('leave request') || combined.includes('leave')) {
      return {
        icon: <FileText size={18} />,
        colorClass: 'text-indigo-600 bg-indigo-50 border-indigo-100',
        badge: 'Leave Request'
      };
    }
    return {
      icon: <Bell size={18} />,
      colorClass: 'text-indigo-600 bg-indigo-50 border-indigo-100',
      badge: 'System Alert'
    };
  };

  const filteredNotifications = useMemo(() => {
    return notifications.filter((n) => {
      const matchSearch =
        n.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (n.body || n.message || '').toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchStatus =
        statusFilter === 'All' ||
        (statusFilter === 'Read' && n.isRead) ||
        (statusFilter === 'Unread' && !n.isRead);

      return matchSearch && matchStatus;
    });
  }, [notifications, searchTerm, statusFilter]);

  const totalPages = Math.ceil(filteredNotifications.length === 0 ? 1 : totalItems / itemsPerPage);

  return (
    <div className="space-y-6 md:space-y-8 animate-fade-up">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight m-0">Admin Notifications</h2>
          <p className="text-slate-600 font-bold text-[13px] mt-2">
            Real-time alerts for employee geofencing, logout, GPS status, and leave requests.
          </p>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllAsRead}
              className="flex items-center justify-center gap-2 bg-indigo-50 text-indigo-600 border border-indigo-100 px-4 py-3 rounded-2xl font-bold text-xs hover:bg-indigo-100 transition-all active:scale-95 shadow-sm cursor-pointer select-none"
            >
              <MailOpen size={16} />
              Mark All Read
            </button>
          )}

          <button
            onClick={() => {
              fetchNotifications(currentPage);
              fetchUnreadCount();
            }}
            className="p-3 bg-white hover:bg-slate-50 border border-slate-200 rounded-2xl text-slate-600 transition-all shadow-sm shrink-0 cursor-pointer select-none"
            title="Refresh Feed"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Filter and Search controls */}
      <div className="bg-white border border-slate-200 p-4 md:p-5 rounded-3xl shadow-xl shadow-slate-100/50 flex flex-col md:flex-row items-center gap-4">
        <div className="relative w-full md:flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Search alerts by title or message..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-11 pr-5 py-3.5 rounded-2xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all text-sm font-medium outline-none"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto no-scrollbar">
          {['All', 'Unread', 'Read'].map((filterType) => (
            <button
              key={filterType}
              onClick={() => setStatusFilter(filterType)}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer select-none ${
                statusFilter === filterType
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100/50'
                  : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200/60'
              }`}
            >
              {filterType} Alerts
            </button>
          ))}
        </div>
      </div>

      {/* Alerts Feed */}
      <div className="bg-white rounded-[2.5rem] border border-slate-200/80 shadow-xl overflow-hidden p-6 md:p-8">
        {loading && notifications.length === 0 ? (
          <div className="py-20 text-center flex flex-col items-center justify-center gap-3">
            <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
            <p className="text-slate-400 font-bold text-sm">Synchronizing live alerts...</p>
          </div>
        ) : filteredNotifications.length === 0 ? (
          <div className="py-20 text-center flex flex-col items-center">
            <div className="w-16 h-16 bg-slate-50 border border-slate-100 rounded-[1.5rem] flex items-center justify-center text-indigo-500 mb-4 shadow-inner">
              <Bell size={28} />
            </div>
            <h4 className="text-slate-700 font-bold text-base">All quiet! No notifications.</h4>
            <p className="text-xs text-slate-500 mt-1 max-w-xs leading-relaxed">
              No alerts match your current search/filters. You're completely caught up.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <AnimatePresence initial={false}>
              {filteredNotifications.map((notif) => {
                const meta = getAlertMetadata(notif.title, notif.body || notif.message);
                return (
                  <motion.div
                    key={notif._id}
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -50 }}
                    transition={{ duration: 0.2 }}
                    className={`flex items-start gap-4 p-4 md:p-5 rounded-2xl border transition-all relative group ${
                      notif.isRead
                        ? 'bg-white hover:bg-slate-50/50 border-slate-100'
                        : 'bg-indigo-50/30 border-indigo-100/50 shadow-sm'
                    }`}
                    onClick={() => !notif.isRead && handleMarkAsRead(notif._id)}
                  >
                    {/* Unread Glow Dot */}
                    {!notif.isRead && (
                      <span className="absolute top-4 right-4 w-2.5 h-2.5 bg-indigo-600 rounded-full animate-pulse shadow-md shadow-indigo-200" />
                    )}

                    {/* Alert Icon */}
                    <div className={`p-3 rounded-xl border shrink-0 ${meta.colorClass}`}>
                      {meta.icon}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0 pr-6">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="text-xs font-extrabold px-2 py-0.5 rounded-lg border tracking-wide uppercase text-[9px] bg-slate-50 border-slate-200 text-slate-600">
                          {meta.badge}
                        </span>
                        <span className="text-[11px] font-bold text-slate-400 flex items-center gap-1">
                          <Calendar size={10} />
                          {new Date(notif.createdAt).toLocaleString([], {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit'
                          })}
                        </span>
                      </div>

                      <h4 className={`text-sm md:text-base font-extrabold tracking-tight truncate leading-snug ${
                        notif.isRead ? 'text-slate-800' : 'text-slate-900'
                      }`}>
                        {notif.title}
                      </h4>
                      <p className="text-xs text-slate-500 font-semibold mt-1 leading-relaxed">
                        {notif.body || notif.message}
                      </p>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 self-center shrink-0">
                      {/* Mark Read */}
                      {!notif.isRead && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleMarkAsRead(notif._id);
                          }}
                          title="Mark as read"
                          className="p-2 rounded-xl bg-white border border-slate-200 text-emerald-600 hover:bg-emerald-50 hover:border-emerald-200 transition-all cursor-pointer"
                        >
                          <Check size={14} />
                        </button>
                      )}

                      {/* Delete */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(notif._id, !notif.isRead);
                        }}
                        title="Delete alert"
                        className="p-2 rounded-xl bg-white border border-slate-200 text-slate-400 hover:text-rose-600 hover:bg-rose-50 hover:border-rose-200 transition-all cursor-pointer opacity-0 group-hover:opacity-100 focus:opacity-100"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>

            {/* Pagination Controls */}
            {totalItems > itemsPerPage && (
              <div className="flex justify-between items-center pt-6 mt-6 border-t border-slate-100">
                <span className="text-xs font-bold text-slate-500">
                  Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, totalItems)} of {totalItems} alerts
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="w-8 h-8 flex items-center justify-center rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-all shadow-sm cursor-pointer select-none"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <span className="text-sm font-bold text-slate-700 px-2">
                    {currentPage} / {totalPages}
                  </span>
                  <button
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="w-8 h-8 flex items-center justify-center rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-all shadow-sm cursor-pointer select-none"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminNotifications;
