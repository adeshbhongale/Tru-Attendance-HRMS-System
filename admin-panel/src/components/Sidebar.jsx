import React from 'react';
import { NavLink } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Users, 
  CalendarCheck, 
  Clock, 
  FileText, 
  Settings, 
  LogOut,
  MapPin
} from 'lucide-react';
import { useDispatch } from 'react-redux';
import { logout } from '../store/authSlice';

const Sidebar = () => {
  const dispatch = useDispatch();

  const navItems = [
    { name: 'Dashboard', icon: <LayoutDashboard size={20} />, path: '/' },
    { name: 'Employees', icon: <Users size={20} />, path: '/employees' },
    { name: 'Attendance', icon: <CalendarCheck size={20} />, path: '/attendance' },
    { name: 'Leave Requests', icon: <FileText size={20} />, path: '/leaves' },
    { name: 'Shifts', icon: <Clock size={20} />, path: '/shifts' },
    { name: 'Office Setup', icon: <MapPin size={20} />, path: '/settings' },
  ];

  return (
    <div className="sidebar glass-card" style={{ margin: '1rem', height: 'calc(100vh - 2rem)' }}>
      <div style={{ padding: '1rem 0.5rem', marginBottom: '2rem', textAlign: 'center' }}>
        <h2 style={{ color: 'var(--primary)', fontWeight: 700, fontSize: '1.5rem' }}>HRMS Geo</h2>
        <p className="text-muted" style={{ fontSize: '0.8rem' }}>Admin Portal</p>
      </div>

      <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {navItems.map((item) => (
          <NavLink
            key={item.name}
            to={item.path}
            className={({ isActive }) => 
              `btn ${isActive ? 'btn-primary' : ''}`
            }
            style={({ isActive }) => ({
              backgroundColor: isActive ? 'var(--primary)' : 'transparent',
              color: isActive ? 'white' : 'var(--text-main)',
              justifyContent: 'flex-start',
              padding: '0.8rem 1rem',
              width: '100%',
              textDecoration: 'none'
            })}
          >
            {item.icon}
            {item.name}
          </NavLink>
        ))}
      </nav>

      <div style={{ position: 'absolute', bottom: '1.5rem', width: 'calc(100% - 3rem)' }}>
        <button 
          onClick={() => dispatch(logout())}
          className="btn" 
          style={{ width: '100%', justifyContent: 'flex-start', color: '#ef4444' }}
        >
          <LogOut size={20} />
          Logout
        </button>
      </div>
    </div>
  );
};

export default Sidebar;
