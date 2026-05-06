import React from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import Sidebar from './Sidebar';

const Layout = () => {
  const { isAuthenticated } = useSelector((state) => state.auth);

  if (!isAuthenticated) {
    return <Navigate to="/login" />;
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <main className="main-content" style={{ flex: 1 }}>
        <header style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          marginBottom: '2rem' 
        }}>
          <div>
            <h1 style={{ marginBottom: '0.2rem' }}>Welcome back, Admin</h1>
            <p className="text-muted">Here is what's happening today</p>
          </div>
          <div className="glass-card" style={{ padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontWeight: 600, fontSize: '0.9rem' }}>Adesh Bhongale</p>
              <p className="text-muted" style={{ fontSize: '0.7rem' }}>Super Admin</p>
            </div>
            <div style={{ 
              width: '40px', 
              height: '40px', 
              borderRadius: '50%', 
              backgroundColor: 'var(--primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontWeight: 700
            }}>
              AB
            </div>
          </div>
        </header>
        <div className="animate-fade-in">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default Layout;
