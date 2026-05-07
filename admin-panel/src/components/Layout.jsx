import { Menu } from 'lucide-react';
import { useState } from 'react';
import { useSelector } from 'react-redux';
import { Navigate, Outlet, Link } from 'react-router-dom';
import Sidebar from './Sidebar';

const Layout = () => {
  const { isAuthenticated, user } = useSelector((state) => state.auth);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  if (!isAuthenticated) {
    return <Navigate to="/login" />;
  }

  const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);

  return (
    <div className="flex min-h-screen bg-slate-100/50">
      <Sidebar isOpen={isSidebarOpen} toggleSidebar={toggleSidebar} />

      <main className="flex-1 p-3 md:p-4 lg:p-5">
        <header className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 mb-4 animate-fade-up">
          <div className="flex items-center gap-3 w-full xl:w-auto">
            <button
              onClick={toggleSidebar}
              className="lg:hidden p-2.5 bg-white border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 transition-colors shadow-sm"
            >
              <Menu size={20} />
            </button>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight mb-0.5">Welcome back, Admin</h1>
              <p className="text-slate-600 font-bold text-[13px]">Monitoring the organization's heartbeat</p>
            </div>
          </div>

          <Link 
            to="/profile"
            className="bg-white flex items-center gap-4 px-5 py-3 border border-slate-200 rounded-2xl shadow-lg shadow-slate-200/40 w-full xl:w-auto hover:border-indigo-200 transition-all active:scale-95 group cursor-pointer"
          >
            <div className="text-right flex-1 xl:flex-initial">
              <p className="text-sm font-bold text-slate-900 tracking-tight mb-0.5">{user?.name || 'Adesh Bhongale'}</p>
              <p className="text-[10px] font-bold text-indigo-600 tracking-tight bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100 inline-block">
                Infrastructure administrator
              </p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold text-lg shadow-lg shadow-indigo-100 group-hover:rotate-6 transition-transform">
              {user?.name?.charAt(0) || 'A'}
            </div>
          </Link>
        </header>

        <div className="relative">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default Layout;
