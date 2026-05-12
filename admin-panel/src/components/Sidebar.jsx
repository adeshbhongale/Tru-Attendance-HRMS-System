import {
  Activity,
  CalendarCheck,
  Clock,
  FileText,
  LayoutDashboard,
  LogOut,
  MapPin,
  Users,
  X
} from 'lucide-react';
import { useDispatch } from 'react-redux';
import { NavLink } from 'react-router-dom';
import { logout } from '../store/authSlice';

const Sidebar = ({ isOpen, toggleSidebar }) => {
  const dispatch = useDispatch();

  const navItems = [
    { name: 'Dashboard', icon: <LayoutDashboard size={18} />, path: '/' },
    { name: 'Employees', icon: <Users size={18} />, path: '/employees' },
    { name: 'Attendance', icon: <CalendarCheck size={18} />, path: '/attendance' },
    { name: 'Reports', icon: <FileText size={18} />, path: '/reports' },
    { name: 'Leaves', icon: <FileText size={18} />, path: '/leaves' },
    { name: 'Shifts', icon: <Clock size={18} />, path: '/shifts' },
    { name: 'Office Setup', icon: <MapPin size={18} />, path: '/settings' },
    { name: 'Tracking Dashboard', icon: <Activity size={18} />, path: '/tracking-dashboard' },
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
        fixed lg:sticky top-0 left-0 z-[101] h-screen lg:h-[calc(100vh-2rem)] 
        w-[280px] m-0 lg:m-4 flex flex-col p-6
        transition-transform duration-300 ease-in-out lg:translate-x-0
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        bg-white border border-slate-200 rounded-3xl shadow-xl
      `}>
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-100">
              <Activity className="text-white" size={28} />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-slate-900 tracking-tighter leading-none">HRMS <span className="text-indigo-600">Geo</span></h2>
              <p className="text-[11px] font-bold text-slate-500 tracking-tight mt-1.5">Admin control suite</p>
            </div>
          </div>
          <button onClick={toggleSidebar} className="lg:hidden p-2.5 text-slate-400 hover:text-slate-900 bg-slate-50 rounded-xl transition-colors">
            <X size={20} />
          </button>
        </div>

        <nav className="flex flex-col gap-2 flex-1">
          {navItems.map((item) => (
            <NavLink
              key={item.name}
              to={item.path}
              onClick={() => window.innerWidth < 1024 && toggleSidebar()}
              className={({ isActive }) =>
                `group flex items-center gap-4 px-5 py-4 rounded-2xl transition-all duration-300 font-bold text-sm ${isActive
                  ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-100 scale-[1.02]'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-indigo-600'
                }`
              }
            >
              <span className="transition-transform duration-300 group-hover:scale-110">
                {item.icon}
              </span>
              {item.name}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto pt-8 border-t border-slate-200">
          <button
            onClick={() => dispatch(logout())}
            className="w-full flex items-center gap-4 px-5 py-4 rounded-2xl font-bold text-sm bg-rose-50 text-rose-600 hover:bg-rose-100 transition-all duration-300 active:scale-95 group border border-rose-100"
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
