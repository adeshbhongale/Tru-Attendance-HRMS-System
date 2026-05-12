import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Employees from './pages/Employees';
import Attendance from './pages/Attendance';
import Leaves from './pages/Leaves';
import Shifts from './pages/Shifts';
import Settings from './pages/Settings';
import Profile from './pages/Profile';
import TrackingDashboard from './pages/TrackingDashboard';
import Reports from './pages/Reports';
import AiAnalytics from './pages/AiAnalytics';
import EmployeeDetails from './pages/EmployeeDetails';
import EmployeeTrackRoute from './pages/EmployeeTrackRoute';
import EmployeeTrackData from './pages/EmployeeTrackData';
import LeaveDashboard from './pages/LeaveDashboard';
import Layout from './components/Layout';
import { Provider } from 'react-redux';
import { store } from './store';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient();

function App() {
  return (
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>
        <Router>
          <Toaster position="top-right" />
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<Layout />}>
              <Route index element={<Dashboard />} />
              <Route path="employees" element={<Employees />} />
              <Route path="attendance" element={<Attendance />} />
              <Route path="reports" element={<Reports />} />
              <Route path="leaves" element={<LeaveDashboard />} />
              <Route path="leaves/requests" element={<Leaves />} />
              <Route path="shifts" element={<Shifts />} />
              <Route path="settings" element={<Settings />} />
              <Route path="profile" element={<Profile />} />
              <Route path="ai-analytics" element={<AiAnalytics />} />
              <Route path="tracking-dashboard" element={<TrackingDashboard />} />
              <Route path="employee/:userId" element={<EmployeeDetails />} />
              <Route path="track-route/:userId" element={<EmployeeTrackRoute />} />
              <Route path="track-data/:userId" element={<EmployeeTrackData />} />
            </Route>
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </Router>
      </QueryClientProvider>
    </Provider>
  );
}

export default App;
