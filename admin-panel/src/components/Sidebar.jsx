import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity,
  ArrowRightLeft,
  Bell,
  Briefcase,
  Building2,
  Calendar,
  CalendarCheck,
  CheckCircle2,
  ChevronDown,
  Clock,
  FileText,
  Home,
  KeyRound,
  Layers,
  LogOut,
  MapPin,
  Network,
  Package,
  Receipt,
  Settings,
  Shield,
  ShieldCheck,
  Users,
  X
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Link, NavLink, useLocation } from 'react-router-dom';
import api from '../api/axios';
import socket from '../socket';
import { logout } from '../store/authSlice';

const Sidebar = ({ isOpen, toggleSidebar }) => {
  const dispatch = useDispatch();
  const location = useLocation();
  const { user } = useSelector((state) => state.auth);
  const [unreadCount, setUnreadCount] = useState(0);
  const [pendingApprovalsCount, setPendingApprovalsCount] = useState(0);

  const userRole = (user?.role || '').toLowerCase();
  const userRoleCode = (user?.roleCode || '').toUpperCase();

  const isSuperAdmin = userRole === 'superadmin' || userRoleCode === 'TCSA1' || user?.scope === 'GLOBAL';
  const isCompanyAdmin = userRole === 'company_admin' || userRole === 'admin' || userRoleCode === 'TCCA1';
  const isHRAdmin = userRole === 'hr' || userRole === 'hr_admin' || userRoleCode === 'TCSF2A' || userRoleCode === 'TCSFA' || userRoleCode === 'HR_ADMIN';
  const isStoreAdmin = userRole === 'store' || userRole === 'store_admin' || userRole === 'store_manager';
  const isAccountAdmin = userRole === 'accounts' || userRole === 'account_admin' || userRole === 'finance';

  useEffect(() => {
    if (!user?._id) return;

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

    const fetchPendingApprovalsCount = async () => {
      try {
        const promises = [];
        let count = 0;

        if (isSuperAdmin || isCompanyAdmin || isHRAdmin) {
          promises.push(
            api.get('/expense/hr/pending').then((res) => {
              const data = res.data.data || res.data || [];
              count += Array.isArray(data) ? data.length : 0;
            }).catch(() => { })
          );
        }

        if (isSuperAdmin || isCompanyAdmin || isStoreAdmin) {
          promises.push(
            api.get('/material/transactions?status=submitted').then((res) => {
              const data = res.data.transactions || res.data.data || res.data || [];
              count += Array.isArray(data) ? data.length : 0;
            }).catch(() => { })
          );
        }

        if (isSuperAdmin || isCompanyAdmin || isAccountAdmin) {
          promises.push(
            api.get('/visits').then((res) => {
              const data = res.data.data || res.data || [];
              const pendingVisits = Array.isArray(data)
                ? data.filter((v) => (v.status || '').toLowerCase() === 'pending' || (v.approvalStatus || '').toLowerCase() === 'pending')
                : [];
              count += pendingVisits.length;
            }).catch(() => { })
          );

          promises.push(
            api.get('/expense/accounts/pending').then((res) => {
              const data = res.data.data || res.data || [];
              count += Array.isArray(data) ? data.length : 0;
            }).catch(() => { })
          );
        }

        await Promise.all(promises);
        setPendingApprovalsCount(count);
      } catch (err) {
        console.error('Failed to fetch pending approvals count in sidebar:', err);
      }
    };

    fetchUnreadCount();
    fetchPendingApprovalsCount();

    const handleBadgeUpdate = (data) => {
      if (typeof data.unreadCount === 'number') {
        setUnreadCount(data.unreadCount);
      } else if (data.unreadCountIncrement) {
        setUnreadCount((c) => c + data.unreadCountIncrement);
      }
    };

    const handlePendingApprovalsUpdate = (e) => {
      if (e.detail && typeof e.detail.count === 'number') {
        setPendingApprovalsCount(e.detail.count);
      }
    };

    socket.on(`notificationBadgeUpdate:${user._id}`, handleBadgeUpdate);
    window.addEventListener('pendingApprovalsCountUpdated', handlePendingApprovalsUpdate);

    return () => {
      socket.off(`notificationBadgeUpdate:${user._id}`, handleBadgeUpdate);
      window.removeEventListener('pendingApprovalsCountUpdated', handlePendingApprovalsUpdate);
    };
  }, [user?._id, isSuperAdmin, isCompanyAdmin, isHRAdmin, isStoreAdmin, isAccountAdmin, location.pathname]);

  const SETUP_PATHS = ['/admin-console', '/shift-setup', '/departments', '/designations', '/working-places', '/week-offs', '/leave-types', '/holidays', '/customers', '/vendors', '/products', '/materials', '/material-activity-log', '/role-permissions'];
  const isOnSetupPage = useCallback(() => SETUP_PATHS.some(p => location.pathname.startsWith(p)), [location.pathname]);

  const NOTIFICATION_PATHS = ['/notifications/dashboard', '/notifications/all', '/notifications/create', '/notifications/reports', '/notifications/analytics'];
  const isOnNotificationPage = useCallback(() => NOTIFICATION_PATHS.some(p => location.pathname.startsWith(p)), [location.pathname]);

  const [isSettingsOpen, setIsSettingsOpen] = useState(isOnSetupPage());
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(isOnNotificationPage());

  useEffect(() => {
    if (isOnSetupPage()) setIsSettingsOpen(true);
    if (isOnNotificationPage()) setIsNotificationsOpen(true);
  }, [location.pathname, isOnSetupPage, isOnNotificationPage]);

  const navItems = [
    { name: 'Dashboard', icon: <Home size={18} />, path: '/' },
    { name: 'Pending Approvals', icon: <CheckCircle2 size={18} />, path: '/pending-approvals' },
    { name: 'Employees', icon: <Users size={18} />, path: '/employees' },
    { name: 'Org Chart', icon: <Network size={18} />, path: '/org-chart' },
    { name: 'Attendance', icon: <CalendarCheck size={18} />, path: '/attendance' },
    { name: 'Reports', icon: <FileText size={18} />, path: '/reports' },
    { name: 'Shifts', icon: <Clock size={18} />, path: '/shifts' },
    { name: 'Leaves', icon: <FileText size={18} />, path: '/leaves' },
    { name: 'Material Movement', icon: <ArrowRightLeft size={18} />, path: '/material-movement-dashboard' },
    { name: 'Tracking Dashboard', icon: <Activity size={18} />, path: '/tracking-dashboard' },
    { name: 'Customer Visit', icon: <MapPin size={18} />, path: '/visits-dashboard' },
    { name: 'Expense Dashboard', icon: <Receipt size={18} />, path: '/expense-dashboard' },
    { name: 'Notifications', icon: <Bell size={18} />, path: '/notifications/dashboard' },
  ];

  const settingsItems = [
    { name: 'Admin Console', icon: <Shield size={16} />, path: '/admin-console' },
    { name: 'Shift Setup', icon: <Clock size={16} />, path: '/shift-setup' },
    { name: 'Departments', icon: <Building2 size={16} />, path: '/departments' },
    { name: 'Designations', icon: <Briefcase size={16} />, path: '/designations' },
    { name: 'Working Places', icon: <MapPin size={16} />, path: '/working-places' },
    { name: 'Week Offs', icon: <Calendar size={16} />, path: '/week-offs' },
    { name: 'Leave Policies', icon: <ShieldCheck size={16} />, path: '/leave-types' },
    { name: 'Holidays', icon: <Calendar size={16} />, path: '/holidays' },
    { name: 'Customers', icon: <Users size={16} />, path: '/customers' },
    { name: 'Vendors', icon: <Building2 size={16} />, path: '/vendors' },
    { name: 'Products', icon: <Package size={16} />, path: '/products' },
    { name: 'Materials', icon: <Layers size={16} />, path: '/materials' },
    { name: 'MM Activity Logs', icon: <ArrowRightLeft size={16} />, path: '/material-activity-log' },
    { name: 'Expense Management', icon: <ShieldCheck size={16} />, path: '/expense-management' },
    { name: 'Role Permissions', icon: <KeyRound size={16} />, path: '/role-permissions' },
    { name: 'Super Admin Console', icon: <Shield size={16} />, path: '/super-admin-console' },
    { name: 'Notifications', icon: <Bell size={16} />, path: '/notifications' },
  ];

  const selectedCompanyId = (() => {
    try { return localStorage.getItem('selectedCompanyId') || ''; } catch (_) { return ''; }
  })();

  const visibleNavItems = (() => {
    if (isSuperAdmin) {
      if (!selectedCompanyId) {
        return [{ name: 'Super Admin Console', icon: <Shield size={18} />, path: '/super-admin-console' }];
      }
      return navItems.filter(item => item.name !== 'Super Admin Console');
    }
    if (isCompanyAdmin) return navItems;
    if (isHRAdmin) {
      return navItems.filter(item => ['Dashboard', 'Pending Approvals', 'Employees', 'Org Chart', 'Attendance', 'Shifts', 'Leaves', 'Reports', 'Tracking Dashboard', 'Customer Visit', 'Notifications'].includes(item.name));
    }
    if (isStoreAdmin) {
      return navItems.filter(item => ['Dashboard', 'Pending Approvals', 'Material Movement', 'Tracking Dashboard', 'Reports', 'Expense Dashboard', 'Notifications'].includes(item.name));
    }
    if (isAccountAdmin) {
      return navItems.filter(item => ['Dashboard', 'Pending Approvals', 'Customer Visit', 'Expense Dashboard', 'Notifications'].includes(item.name));
    }
    return navItems;
  })();

  const visibleSettingsItems = (() => {
    if (isSuperAdmin) {
      if (!selectedCompanyId) {
        return [];
      }
      return settingsItems.filter(item => item.path !== '/super-admin-console');
    }

    if (isCompanyAdmin) {
      return settingsItems.filter(item => item.path !== '/super-admin-console' && item.path !== '/role-permissions');
    }
    if (isHRAdmin) {
      return []; // Office setup and settings are hidden for HR
    }
    if (isStoreAdmin) {
      return settingsItems.filter(item => ['/products', '/materials', '/material-activity-log', '/vendors'].includes(item.path));
    }
    if (isAccountAdmin) {
      return settingsItems.filter(item => ['/customers', '/vendors', '/products', '/materials'].includes(item.path));
    }
    return settingsItems;
  })();

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] lg:hidden transition-opacity"
          onClick={toggleSidebar}
        />
      )}

      <div className={`
        fixed lg:sticky top-0 left-0 z-[101] h-screen lg:h-[calc(102vh-2rem)] 
        w-[280px] m-0 lg:m-4 flex flex-col p-5
        transition-transform duration-300 ease-in-out lg:translate-x-0
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        bg-white border border-slate-200 rounded-3xl shadow-xl
      `}>
        <div className="mb-7 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-white flex items-center justify-center shadow-lg shadow-indigo-100 overflow-hidden border border-slate-100">
              <img src="/favicon.png" alt="Logo" className="w-full h-full object-contain" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-slate-900 tracking-tighter leading-none">Geo-Track</h2>
              <p className="text-[11px] font-bold text-slate-500 tracking-tight mt-1">HRMS System</p>
            </div>
          </div>
          <button onClick={toggleSidebar} className="lg:hidden p-2.5 text-slate-400 hover:text-slate-900 bg-slate-50 rounded-xl transition-colors">
            <X size={20} />
          </button>
        </div>

        <nav className="flex flex-col gap-1 flex-1 overflow-y-auto no-scrollbar">
          {visibleNavItems.map((item) => {
            const isPendingApprovals = item.name === 'Pending Approvals';
            return (
              <NavLink
                key={item.name}
                to={item.path}
                onClick={() => window.innerWidth < 1024 && toggleSidebar()}
                className={({ isActive }) =>
                  `group flex items-center justify-between px-5 py-3 rounded-2xl transition-all duration-300 font-bold text-[13px] ${isActive
                    ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-100'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-indigo-600'
                  }`
                }
              >
                <div className="flex items-center gap-3">
                  <span className="transition-transform duration-300 group-hover:scale-110">
                    {item.icon}
                  </span>
                  <span>{item.name}</span>
                </div>

                {isPendingApprovals && pendingApprovalsCount > 0 && (
                  <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-rose-500 text-white text-[10.5px] font-bold flex items-center justify-center shadow-md shadow-rose-200">
                    {pendingApprovalsCount > 99 ? '99+' : pendingApprovalsCount}
                  </span>
                )}
              </NavLink>
            );
          })}


          {/* Collapsible Settings */}
          {visibleSettingsItems.length > 0 && (
            <div className="mt-2">
              <button
                onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                className={`w-full group flex items-center justify-between px-5 py-3 rounded-2xl transition-all duration-300 font-bold text-[13px] ${isSettingsOpen ? 'text-indigo-600 bg-indigo-50/50' : 'text-slate-600 hover:bg-slate-50'
                  }`}
              >
                <div className="flex items-center gap-4">
                  <Settings size={18} className="transition-transform duration-300 group-hover:rotate-45" />
                  <span>Office Setup</span>
                </div>
                <ChevronDown size={14} className={`transition-transform duration-300 ${isSettingsOpen ? 'rotate-180' : ''}`} />
              </button>

              <AnimatePresence>
                {isSettingsOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden flex flex-col gap-1 mt-1 ml-4 border-l-2 border-slate-100 pl-4"
                  >
                    {visibleSettingsItems.map((item) => (
                      <NavLink
                        key={item.name}
                        to={item.path}
                        onClick={() => window.innerWidth < 1024 && toggleSidebar()}
                        className={({ isActive }) =>
                          `group flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-300 font-bold text-[12px] ${isActive
                            ? 'text-indigo-600 bg-indigo-50'
                            : 'text-slate-500 hover:bg-slate-50 hover:text-indigo-600'
                          }`
                        }
                      >
                        <span>{item.icon}</span>
                        {item.name}
                      </NavLink>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* Admin Profile Box */}
          <div className="mt-1 flex items-center gap-2">
            <Link
              to="/profile"
              onClick={() => window.innerWidth < 1024 && toggleSidebar()}
              className="flex-1 flex items-center gap-4 px-4 py-2 bg-slate-50 border border-slate-100 rounded-2xl hover:border-indigo-100 hover:bg-indigo-50/30 transition-all active:scale-[0.98] group min-w-0"
            >
              <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold text-lg shadow-lg shadow-indigo-100 group-hover:rotate-6 transition-transform overflow-hidden shrink-0">
                {user?.profileImage ? (
                  <img src={user.profileImage} alt="" className="w-full h-full object-cover" />
                ) : (
                  (user?.name || 'A').charAt(0)
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-slate-900 tracking-tight truncate">
                  {user?.name || 'Admin'}
                </p>
                <p className="text-[10px] font-bold text-indigo-600 tracking-tight truncate">
                  {(typeof user?.designation === 'object' ? user?.designation?.name : user?.designation) || (typeof user?.department === 'object' ? user?.department?.name : user?.department) || 'Administrator'}
                </p>
              </div>
            </Link>

            {/* Notification Bell Icon */}
            <Link
              to="/admin-notifications"
              onClick={() => window.innerWidth < 1024 && toggleSidebar()}
              className="relative w-11 h-11 flex items-center justify-center bg-slate-50 hover:bg-indigo-50 border border-slate-100 hover:border-indigo-100 rounded-2xl text-slate-600 hover:text-indigo-600 transition-all active:scale-[0.95] shrink-0"
              title="Admin Alerts"
            >
              <Bell size={18} />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-4 h-4 flex items-center justify-center bg-rose-500 text-white rounded-full text-[9px] font-extrabold px-1 shadow-md shadow-rose-200 animate-pulse">
                  {unreadCount}
                </span>
              )}
            </Link>
          </div>
        </nav>

        <div className="mt-auto pt-5 border-t border-slate-200">
          <button
            onClick={() => dispatch(logout())}
            className="w-full flex items-center gap-4 px-5 py-3 rounded-2xl font-bold text-sm bg-rose-50 text-rose-600 hover:bg-rose-100 transition-all duration-300 active:scale-95 group border border-rose-100 shadow-sm"
          >
            <LogOut size={18} className="group-hover:-translate-x-1 transition-transform" />
            Logout
          </button>
        </div>
      </div>
    </>
  );
};

export default Sidebar;
