import { AnimatePresence, motion } from 'framer-motion';
import {
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Loader2,
  MapPin,
  Search,
  Wifi,
  WifiOff
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Cell,
  Pie,
  PieChart,
  Tooltip as RechartsTooltip,
  ResponsiveContainer
} from 'recharts';
import api from '../api/axios';
import CalendarPicker from '../components/CalendarPicker';

const TrackingDashboard = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const getTodayStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  // Read date from URL so it survives navigation (back from EmployeeTrackData)
  const selectedDate = searchParams.get('date') || getTodayStr();
  const setSelectedDate = (date) => setSearchParams({ date }, { replace: true });
  const [showCalendar, setShowCalendar] = useState(false);
  const calendarRef = useRef(null);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const formatDuration = (decimalHours) => {
    if (!decimalHours || decimalHours <= 0) return '0m';
    const totalMinutes = Math.round(decimalHours * 60);
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    if (h === 0) return `${m}m`;
    if (m === 0) return `${h}hr`;
    return `${h}hr ${m}m`;
  };

  useEffect(() => {
    fetchTrackingData();
  }, [selectedDate]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (calendarRef.current && !calendarRef.current.contains(event.target)) {
        setShowCalendar(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchTrackingData = async () => {
    try {
      setLoading(true);
      const res = await api.get(`/reports/tracking?date=${selectedDate}`);
      setData(res.data.data);
    } catch (err) {
      toast.error('Failed to load tracking data');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (date) => {
    const d = new Date(date);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const getStatusIcon = (status) => {
    if (status === 'online') return <Wifi className="text-emerald-500" size={16} />;
    return <WifiOff className="text-slate-400" size={16} />;
  };

  if (loading && !data) {
    return (
      <div className="flex justify-center items-center h-96">
        <Loader2 className="animate-spin text-indigo-600" size={40} />
      </div>
    );
  }

  const connectivityChartData = [
    { name: 'Online', value: data?.stats?.connectivity?.online || 0, color: '#10b981' },
    { name: 'Offline', value: data?.stats?.connectivity?.offline || 0, color: '#cbd5e1' }
  ];

  const presenceChartData = [
    { name: 'Present', value: data?.stats?.presence?.present || 0, color: '#10b981' },
    { name: 'Absent', value: data?.stats?.presence?.absent || 0, color: '#f43f5e' },
    { name: 'On Leave', value: data?.stats?.presence?.onLeave || 0, color: '#f59e0b' },
    { name: 'Neutral', value: data?.stats?.presence?.neutral || 0, color: '#6366f1' }
  ];

  const geofenceChartData = [
    { name: 'Inside', value: data?.stats?.geofence?.inside || 0, color: '#6366f1' },
    { name: 'Outside', value: data?.stats?.geofence?.outside || 0, color: '#f43f5e' }
  ];

  const DonutChart = ({ title, chartData, total }) => (
    <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
      <h4 className="text-[11px] font-bold text-slate-400  mb-6 tracking-widest">{title}</h4>
      <div className="h-48 w-full min-h-[150px] relative flex items-center justify-center">
        <ResponsiveContainer width="99%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              innerRadius={60}
              outerRadius={80}
              paddingAngle={5}
              dataKey="value"
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <RechartsTooltip />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none">
          <p className="text-2xl font-bold text-slate-800">{total}</p>
          <p className="text-[10px] font-bold text-slate-400 ">TOTAL</p>
        </div>
      </div>
      <div className="mt-4 space-y-2">
        {chartData.map((item, idx) => (
          <div key={idx} className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
              <span className="text-[11px] font-bold text-slate-500">{item.name}</span>
            </div>
            <span className="text-[11px] font-bold text-slate-800">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );

  const filteredEmployees = data?.employees?.filter(emp =>
    emp.user?.name?.toLowerCase().includes(searchTerm.toLowerCase()) &&
    emp.attendanceStatus !== 'Absent'
  ) || [];

  const totalPages = Math.ceil(filteredEmployees.length / itemsPerPage);
  const paginatedEmployees = filteredEmployees.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  return (
    <div className="space-y-6 md:space-y-8 animate-fade-up">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight m-0">Tracking Dashboard</h2>
          <p className="text-slate-600 font-bold text-[13px] mt-2">Monitor live attendance and telemetry</p>
        </div>
        <div className="relative" ref={calendarRef}>
          <button
            onClick={() => setShowCalendar(!showCalendar)}
            className="flex items-center gap-3 bg-white border border-slate-200 px-6 py-3 rounded-2xl shadow-sm hover:bg-slate-50 transition-all"
          >
            <Calendar size={18} className="text-indigo-600" />
            <span className="text-sm font-bold text-slate-700">{formatDate(selectedDate)}</span>
            <ChevronDown size={16} className={`text-slate-400 transition-transform ${showCalendar ? 'rotate-180' : ''}`} />
          </button>

          <AnimatePresence>
            {showCalendar && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 10 }}
                exit={{ opacity: 0, y: 10 }}
                className="absolute top-full right-0 mt-3 z-50 bg-white border border-slate-100 rounded-3xl shadow-2xl p-4"
              >
                <CalendarPicker
                  selectedDate={selectedDate}
                  onSelect={(date) => {
                    setSelectedDate(date);
                    setShowCalendar(false);
                    setCurrentPage(1);
                  }}
                  onClose={() => setShowCalendar(false)}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <DonutChart
          title="Online/Offline Status"
          chartData={connectivityChartData}
          total={data?.stats?.total || 0}
        />
        <DonutChart
          title="Staff Presence"
          chartData={presenceChartData}
          total={data?.stats?.total || 0}
        />
        <DonutChart
          title="Inside/Outside Geofence"
          chartData={geofenceChartData}
          total={data?.stats?.presence?.present || 0}
        />
      </div>

      <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-8 border-b border-slate-50 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h3 className="text-xl font-bold text-slate-900 tracking-tight m-0">Present Today</h3>
            <p className="text-slate-400 text-[10px] font-bold mt-1">Live staff location status</p>
          </div>
          <div className="relative w-full md:w-80">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              placeholder="Search employee by name..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-100 focus:bg-white pl-12 pr-4 py-3 rounded-2xl outline-none transition-all text-sm font-bold text-slate-800"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50">
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 border-b border-slate-100">Name</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 border-b border-slate-100">Department</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 border-b border-slate-100">Contact</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 border-b border-slate-100">Last Known Location</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 border-b border-slate-100 text-center">Distance (km)</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 border-b border-slate-100 text-center">Adherence</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 border-b border-slate-100 text-center">Worked</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 border-b border-slate-100 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {paginatedEmployees.map((emp) => (
                <tr key={emp.id} className="hover:bg-slate-50/50 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div
                        onClick={() => navigate(`/track-data/${emp.user._id}?date=${selectedDate}`)}
                        className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-sm cursor-pointer hover:scale-110 transition-transform overflow-hidden shadow-sm"
                      >
                        {emp.user?.profileImage ? (
                          <img src={emp.user.profileImage} alt="" className="w-full h-full object-cover" />
                        ) : emp.user?.name?.charAt(0)}
                      </div>
                      <div
                        onClick={() => navigate(`/track-data/${emp.user._id}?date=${selectedDate}`)}
                        className="cursor-pointer group/name"
                      >
                        <p className="text-sm font-bold text-slate-900 group-hover/name:text-indigo-600 transition-colors">{emp.user?.name}</p>
                        <p className="text-[10px] text-slate-400 font-bold">{emp.user?.designation || 'Staff'}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-[10px] font-bold text-slate-500  tracking-tight">{emp.user?.department}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-[10px] font-bold text-slate-500">{emp.user?.mobile}</span>
                  </td>
                  <td className="px-6 py-4 max-w-md">
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-start gap-2">
                        <MapPin size={12} className="text-indigo-400 mt-1 shrink-0" />
                        <p className="text-[11px] font-bold text-slate-700 leading-relaxed">
                          {emp.lastKnownLocation?.address || 'Location unknown'}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 pl-4">
                        <span className="text-[9px] font-bold text-slate-400 bg-slate-50 px-2 py-0.5 rounded">
                          {emp.lastKnownLocation?.time ? new Date(emp.lastKnownLocation.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'Never'}
                        </span>
                        <span className="text-[8px] font-bold text-indigo-400 tracking-tighter">
                          {emp.lastKnownLocation?.latitude?.toFixed(4)}, {emp.lastKnownLocation?.longitude?.toFixed(4)}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col items-center gap-2">
                      <span className="text-[11px] font-bold text-slate-800">
                        {`${(emp.distance || 0).toFixed(2)} km`}
                      </span>
                      <div className="flex flex-col items-center gap-1">
                        <button
                          onClick={() => navigate(`/track-route/${emp.user?._id}?date=${selectedDate}`)}
                          className="text-[9px] font-bold text-indigo-600 hover:underline tracking-tight"
                        >
                          View Route
                        </button>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex justify-center">
                      <span className={`px-2 py-1 rounded-full text-[8px] font-bold tracking-widest ${emp.isOutside ? 'bg-rose-50 text-rose-600 border border-rose-100' : 'bg-emerald-50 text-emerald-600 border border-emerald-100'}`}>
                        {emp.isOutside ? 'OUTSIDE' : 'INSIDE'}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className="text-[11px] font-bold text-emerald-600">
                      {formatDuration(emp.workingHours)}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col items-center gap-1">
                      {getStatusIcon(emp.status)}
                      <span className={`text-[8px] font-bold tracking-tight  ${emp.status === 'online' ? 'text-emerald-500' : 'text-slate-400'}`}>
                        {emp.status}
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
              {paginatedEmployees.length === 0 && (
                <tr>
                  <td colSpan="6" className="px-6 py-20 text-center">
                    <p className="text-slate-400 font-bold text-sm">No employees found matching your search.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="p-6 border-t border-slate-50 flex items-center justify-between bg-slate-50/30">
          <p className="text-[10px] font-bold text-slate-400 ">
            Page {currentPage} of {totalPages || 1}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="p-2.5 rounded-xl border border-slate-200 text-slate-400 hover:bg-white hover:text-indigo-600 disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-sm"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages || totalPages === 0}
              className="p-2.5 rounded-xl border border-slate-200 text-slate-400 hover:bg-white hover:text-indigo-600 disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-sm"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TrackingDashboard;
