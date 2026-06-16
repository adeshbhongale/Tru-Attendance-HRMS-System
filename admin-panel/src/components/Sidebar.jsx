import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity,
  Bell,
  Briefcase,
  Building2,
  Calendar,
  CalendarCheck,
  ChevronDown,
  Clock,
  FileText,
  Home,
  LogOut,
  MapPin,
  Navigation,
  Settings,
  ShieldCheck,
  Users,
  X
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { logout } from '../store/authSlice';

const Sidebar = ({ isOpen, toggleSidebar }) => {
  const dispatch = useDispatch();
  const location = useLocation();
  const { user } = useSelector((state) => state.auth);

  const SETUP_PATHS = ['/shift-setup', '/departments', '/designations', '/working-places', '/week-offs', '/leave-types', '/holidays', '/customers'];
  const isOnSetupPage = useCallback(() => SETUP_PATHS.some(p => location.pathname === p), [location.pathname]);

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
    { name: 'Employees', icon: <Users size={18} />, path: '/employees' },
    { name: 'Attendance', icon: <CalendarCheck size={18} />, path: '/attendance' },
    { name: 'Reports', icon: <FileText size={18} />, path: '/reports' },
    { name: 'Shifts', icon: <Clock size={18} />, path: '/shifts' },
    { name: 'Leaves', icon: <FileText size={18} />, path: '/leaves' },
    { name: 'Tracking Dashboard', icon: <Activity size={18} />, path: '/tracking-dashboard' },
    { name: 'Customer Visit', icon: <MapPin size={18} />, path: '/visits-dashboard' },
    { name: 'Notifications', icon: <Bell size={18} />, path: '/notifications/dashboard' },
  ];

  const settingsItems = [
    { name: 'Shift Setup', icon: <Clock size={16} />, path: '/shift-setup' },
    { name: 'Departments', icon: <Building2 size={16} />, path: '/departments' },
    { name: 'Designations', icon: <Briefcase size={16} />, path: '/designations' },
    { name: 'Working Places', icon: <MapPin size={16} />, path: '/working-places' },
    { name: 'Week Offs', icon: <Calendar size={16} />, path: '/week-offs' },
    { name: 'Leave Types', icon: <ShieldCheck size={16} />, path: '/leave-types' },
    { name: 'Holidays', icon: <Calendar size={16} />, path: '/holidays' },
    { name: 'Customers', icon: <Users size={16} />, path: '/customers' },
    { name: 'Notifications', icon: <Bell size={16} />, path: '/notifications' },
  ];

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
          {navItems.map((item) => (
            <NavLink
              key={item.name}
              to={item.path}
              onClick={() => window.innerWidth < 1024 && toggleSidebar()}
              className={({ isActive }) =>
                `group flex items-center gap-3 px-5 py-3 rounded-2xl transition-all duration-300 font-bold text-[13px] ${isActive
                  ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-100'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-indigo-600'
                }`
              }
            >
              <span className="transition-transform duration-300 group-hover:scale-110">
                {item.icon}
              </span>
              {item.name}
            </NavLink>
          ))}


          {/* Collapsible Settings */}
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
                  {settingsItems.map((item) => (
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

          {/* Admin Profile Box */}
          <div className="mt-1">
            <Link
              to="/profile"
              onClick={() => window.innerWidth < 1024 && toggleSidebar()}
              className="flex items-center gap-4 px-4 py-2 bg-slate-50 border border-slate-100 rounded-2xl hover:border-indigo-100 hover:bg-indigo-50/30 transition-all active:scale-[0.98] group"
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
                  {user?.designation || 'Administrator'}
                </p>
              </div>
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
