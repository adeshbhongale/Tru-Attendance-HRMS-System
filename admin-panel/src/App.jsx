import { Menu } from 'lucide-react';
import { useState } from 'react';
import { Toaster } from 'react-hot-toast';
import { useSelector } from 'react-redux';
import { Navigate, Route, BrowserRouter as Router, Routes } from 'react-router-dom';
import Sidebar from './components/Sidebar';

// Pages
import AiAnalytics from './pages/AiAnalytics';
import Attendance from './pages/Attendance';
import Dashboard from './pages/Dashboard';
import Departments from './pages/Departments';
import Designations from './pages/Designations';
import EmployeeDetails from './pages/EmployeeDetails';
import Employees from './pages/Employees';
import EmployeeTrackData from './pages/EmployeeTrackData';
import EmployeeTrackRoute from './pages/EmployeeTrackRoute';
import Holidays from './pages/Holidays';
import LeaveDashboard from './pages/LeaveDashboard';
import Leaves from './pages/Leaves';
import LeaveTypes from './pages/LeaveTypes';
import Login from './pages/Login';
import Profile from './pages/Profile';
import Reports from './pages/Reports';
import Shifts from './pages/Shifts';
import ShiftSetup from './pages/ShiftSetup';
import TrackingDashboard from './pages/TrackingDashboard';
import WeekOffs from './pages/WeekOffs';
import WorkingPlaces from './pages/WorkingPlaces';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Provider } from 'react-redux';
import { store } from './store';

const queryClient = new QueryClient();

const AppContent = () => {
  const { isAuthenticated } = useSelector((state) => state.auth);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);

  return (
    <div className="flex min-h-screen bg-slate-100/50">
      {isAuthenticated && (
        <Sidebar isOpen={isSidebarOpen} toggleSidebar={toggleSidebar} />
      )}

      <main className={`flex-1 ${isAuthenticated ? 'p-3 md:p-4 lg:p-5' : ''}`}>
        {isAuthenticated && (
          <header className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 mb-4 animate-fade-up">
            <div className="flex items-center gap-3 w-full xl:w-auto">
              <button
                onClick={toggleSidebar}
                className="lg:hidden p-2.5 bg-white border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 transition-colors shadow-sm"
              >
                <Menu size={20} />
              </button>
            </div>
          </header>
        )}

        <div className={isAuthenticated ? "relative" : ""}>
          <Routes>
            <Route path="/login" element={!isAuthenticated ? <Login /> : <Navigate to="/" />} />

            <Route path="/" element={isAuthenticated ? <Dashboard /> : <Navigate to="/login" />} />
            <Route path="/employees" element={isAuthenticated ? <Employees /> : <Navigate to="/login" />} />
            <Route path="/attendance" element={isAuthenticated ? <Attendance /> : <Navigate to="/login" />} />
            <Route path="/reports" element={isAuthenticated ? <Reports /> : <Navigate to="/login" />} />
            <Route path="/leaves" element={isAuthenticated ? <LeaveDashboard /> : <Navigate to="/login" />} />
            <Route path="/leaves/requests" element={isAuthenticated ? <Leaves /> : <Navigate to="/login" />} />
            <Route path="/shifts" element={isAuthenticated ? <Shifts /> : <Navigate to="/login" />} />
            <Route path="/shift-setup" element={isAuthenticated ? <ShiftSetup /> : <Navigate to="/login" />} />
            <Route path="/departments" element={isAuthenticated ? <Departments /> : <Navigate to="/login" />} />
            <Route path="/designations" element={isAuthenticated ? <Designations /> : <Navigate to="/login" />} />
            <Route path="/working-places" element={isAuthenticated ? <WorkingPlaces /> : <Navigate to="/login" />} />
            <Route path="/leave-types" element={isAuthenticated ? <LeaveTypes /> : <Navigate to="/login" />} />
            <Route path="/holidays" element={isAuthenticated ? <Holidays /> : <Navigate to="/login" />} />
            <Route path="/week-offs" element={isAuthenticated ? <WeekOffs /> : <Navigate to="/login" />} />
            <Route path="/profile" element={isAuthenticated ? <Profile /> : <Navigate to="/login" />} />
            <Route path="/ai-analytics" element={isAuthenticated ? <AiAnalytics /> : <Navigate to="/login" />} />
            <Route path="/tracking-dashboard" element={isAuthenticated ? <TrackingDashboard /> : <Navigate to="/login" />} />
            <Route path="/employee/:userId" element={isAuthenticated ? <EmployeeDetails /> : <Navigate to="/login" />} />
            <Route path="/track-route/:userId" element={isAuthenticated ? <EmployeeTrackRoute /> : <Navigate to="/login" />} />
            <Route path="/track-data/:userId" element={isAuthenticated ? <EmployeeTrackData /> : <Navigate to="/login" />} />

            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </div>
      </main>
    </div>
  );
};

function App() {
  return (
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>
        <Router>
          <Toaster position="top-right" />
          <AppContent />
        </Router>
      </QueryClientProvider>
    </Provider>
  );
}

export default App;
