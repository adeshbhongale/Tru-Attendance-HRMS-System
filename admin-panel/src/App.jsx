import { Menu, Building2, LayoutGrid } from 'lucide-react';
import { useState, useEffect } from 'react';
import { Toaster } from 'react-hot-toast';
import { useSelector } from 'react-redux';
import { Navigate, Route, BrowserRouter as Router, Routes, useNavigate, useLocation } from 'react-router-dom';
import api from './api/axios';
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
import LeavePolicies from './pages/LeavePolicies';
import Login from './pages/Login';
import Profile from './pages/Profile';
import Reports from './pages/Reports';
import Shifts from './pages/Shifts';
import ShiftSetup from './pages/ShiftSetup';
import TrackingDashboard from './pages/TrackingDashboard';
import WeekOffs from './pages/WeekOffs';
import WorkingPlaces from './pages/WorkingPlaces';
import RolePermissions from './pages/RolePermissions';
import SuperAdminConsole from './pages/SuperAdminConsole';
import AdminConsole from './pages/AdminConsole';
import OrgChart from './pages/OrgChart';
import Customers from './pages/Customers';
import Vendors from './pages/Vendors';
import Products from './pages/Products';
import Materials from './pages/Materials';
import MaterialMovementAudit from './pages/MaterialMovementAudit';
import CustomerVisitDashboard from './pages/CustomerVisitDashboard';
import CustomerVisitReports from './pages/CustomerVisitReports';
import TransactionDetailPage from './pages/TransactionDetailPage';
import BarcodeDetail from './pages/BarcodeDetail';
import BarcodeViewAll from './pages/BarcodeViewAll';
import MaterialMovementDashboardPage from './pages/MaterialMovementDashboardPage';
import PendingApprovals from './pages/PendingApprovals';
import ExpenseManagement from './pages/ExpenseManagement';
import ExpenseDashboardPage from './pages/ExpenseDashboardPage';

// Notifications System
import AllNotifications from './pages/notifications/AllNotifications';
import CreateNotification from './pages/notifications/CreateNotification';
import NotificationReports from './pages/notifications/NotificationReports';
import NotificationAnalytics from './pages/notifications/NotificationAnalytics';
import AdminNotifications from './pages/notifications/AdminNotifications';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Provider } from 'react-redux';
import { store } from './store';

const queryClient = new QueryClient();

const AppContent = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, user } = useSelector((state) => state.auth);
  const userRole = (user?.role || '').toLowerCase();
  const userRoleCode = (user?.roleCode || '').toUpperCase();
  const isSuperAdmin = userRole === 'superadmin' || userRole === 'super_admin' || userRoleCode === 'TCSA1' || user?.scope === 'GLOBAL';

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);

  const [companies, setCompanies] = useState([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState(() => localStorage.getItem('selectedCompanyId') || '');

  useEffect(() => {
    if (!isAuthenticated || !isSuperAdmin) return;
    const fetchCompanies = async () => {
      try {
        const res = await api.get('/admin/console/companies');
        const list = res.data.data || [];
        setCompanies(list);
      } catch (_) {}
    };
    fetchCompanies();
  }, [isAuthenticated, isSuperAdmin]);

  const handleSelectCompany = (comp) => {
    if (!comp) {
      localStorage.removeItem('selectedCompanyId');
      localStorage.removeItem('selectedCompanyName');
      localStorage.removeItem('selectedCompanyCode');
      setSelectedCompanyId('');
      navigate('/super-admin-console');
      window.location.reload();
      return;
    }
    localStorage.setItem('selectedCompanyId', comp._id);
    localStorage.setItem('selectedCompanyName', comp.name);
    localStorage.setItem('selectedCompanyCode', comp.code);
    setSelectedCompanyId(comp._id);
    window.location.reload();
  };

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
              {isSuperAdmin && selectedCompanyId && (
                <div className="flex items-center gap-3 flex-wrap bg-white border border-indigo-200 p-2 px-4 rounded-2xl shadow-sm w-full xl:w-auto">
                  <div className="flex items-center gap-2">
                    <Building2 size={18} className="text-indigo-600" />
                    <span className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">Workspace:</span>
                  </div>
                  <select
                    value={selectedCompanyId}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (!val) {
                        handleSelectCompany(null);
                      } else {
                        const targetComp = companies.find(c => c._id === val);
                        if (targetComp) handleSelectCompany(targetComp);
                      }
                    }}
                    className="px-3 py-1.5 bg-indigo-50 text-indigo-900 font-extrabold text-xs rounded-xl border border-indigo-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                  >
                    {companies.map((c) => (
                      <option key={c._id} value={c._id}>
                        {c.name} ({c.code})
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => handleSelectCompany(null)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl transition-all shadow-xs"
                    title="View All Tenant Companies & Company Admins Directory"
                  >
                    <LayoutGrid size={14} />
                    <span>Company Directory</span>
                  </button>
                </div>
              )}
            </div>
          </header>
        )}

        <div className={isAuthenticated ? "relative" : ""}>
          <Routes>
            <Route path="/login" element={!isAuthenticated ? <Login /> : <Navigate to="/" />} />

            <Route path="/" element={isAuthenticated ? (isSuperAdmin && !selectedCompanyId ? <Navigate to="/super-admin-console" /> : <Dashboard />) : <Navigate to="/login" />} />
            <Route path="/pending-approvals" element={isAuthenticated ? <PendingApprovals /> : <Navigate to="/login" />} />
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
            <Route path="/leave-policies" element={isAuthenticated ? <LeaveTypes /> : <Navigate to="/login" />} />
            <Route path="/holidays" element={isAuthenticated ? <Holidays /> : <Navigate to="/login" />} />
            <Route path="/week-offs" element={isAuthenticated ? <WeekOffs /> : <Navigate to="/login" />} />
            <Route path="/role-permissions" element={isAuthenticated ? <RolePermissions /> : <Navigate to="/login" />} />
            <Route path="/super-admin-console" element={isAuthenticated ? <SuperAdminConsole /> : <Navigate to="/login" />} />
            <Route path="/admin-console" element={isAuthenticated ? <AdminConsole /> : <Navigate to="/login" />} />
            <Route path="/org-chart" element={isAuthenticated ? <OrgChart /> : <Navigate to="/login" />} />
            <Route path="/profile" element={isAuthenticated ? <Profile /> : <Navigate to="/login" />} />
            <Route path="/ai-analytics" element={isAuthenticated ? <AiAnalytics /> : <Navigate to="/login" />} />
            <Route path="/tracking-dashboard" element={isAuthenticated ? <TrackingDashboard /> : <Navigate to="/login" />} />
            <Route path="/employee/:userId" element={isAuthenticated ? <EmployeeDetails /> : <Navigate to="/login" />} />
            <Route path="/track-route/:userId" element={isAuthenticated ? <EmployeeTrackRoute /> : <Navigate to="/login" />} />
            <Route path="/track-data/:userId" element={isAuthenticated ? <EmployeeTrackData /> : <Navigate to="/login" />} />

            {/* Customer & Master routes */}
            <Route path="/customers" element={isAuthenticated ? <Customers /> : <Navigate to="/login" />} />
            <Route path="/vendors" element={isAuthenticated ? <Vendors /> : <Navigate to="/login" />} />
            <Route path="/products" element={isAuthenticated ? <Products /> : <Navigate to="/login" />} />
            <Route path="/materials" element={isAuthenticated ? <Materials /> : <Navigate to="/login" />} />
            <Route path="/material-activity-log" element={isAuthenticated ? <MaterialMovementAudit /> : <Navigate to="/login" />} />
            <Route path="/visits-dashboard" element={isAuthenticated ? <CustomerVisitDashboard /> : <Navigate to="/login" />} />
            <Route path="/visits-reports" element={isAuthenticated ? <CustomerVisitReports /> : <Navigate to="/login" />} />

            {/* Material Movement routes */}
            <Route path="/material-movement-dashboard" element={isAuthenticated ? <MaterialMovementDashboardPage /> : <Navigate to="/login" />} />
            <Route path="/transactions/:id" element={isAuthenticated ? <TransactionDetailPage /> : <Navigate to="/login" />} />
            <Route path="/barcodes/:barcode" element={isAuthenticated ? <BarcodeDetail /> : <Navigate to="/login" />} />
            <Route path="/barcodes/:barcode/view-all" element={isAuthenticated ? <BarcodeViewAll /> : <Navigate to="/login" />} />

            {/* Notification routes */}
            <Route path="/notifications" element={isAuthenticated ? <AllNotifications /> : <Navigate to="/login" />} />
            <Route path="/notifications/dashboard" element={isAuthenticated ? <NotificationAnalytics /> : <Navigate to="/login" />} />
            <Route path="/notifications/all" element={isAuthenticated ? <AllNotifications /> : <Navigate to="/login" />} />
            <Route path="/notifications/create" element={isAuthenticated ? <CreateNotification /> : <Navigate to="/login" />} />
            <Route path="/notifications/reports" element={isAuthenticated ? <NotificationReports /> : <Navigate to="/login" />} />
            <Route path="/admin-notifications" element={isAuthenticated ? <AdminNotifications /> : <Navigate to="/login" />} />

            {/* Expense Management & Dashboard */}
            <Route path="/expense-management" element={isAuthenticated ? <ExpenseManagement /> : <Navigate to="/login" />} />
            <Route path="/expense-dashboard" element={isAuthenticated ? <ExpenseDashboardPage /> : <Navigate to="/login" />} />
            <Route path="/expenses-dashboard" element={isAuthenticated ? <ExpenseDashboardPage /> : <Navigate to="/login" />} />

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
