import { AnimatePresence, motion } from 'framer-motion';
import {
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  FileText,
  Loader2,
  Map as MapIcon,
  MapPin,
  Search,
  TrendingUp
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import api from '../api/axios';
import CalendarPicker from '../components/CalendarPicker';

const EmployeeTrackData = () => {
  const { userId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const date = searchParams.get('date') || new Date().toISOString().split('T')[0];

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showCalendar, setShowCalendar] = useState(false);
  const calendarRef = useRef(null);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  useEffect(() => {
    fetchTrackDetails();
  }, [userId, date]);

  const fetchTrackDetails = async () => {
    try {
      setLoading(true);
      const res = await api.get(`/reports/track-details/${userId}?date=${date}`);
      setData(res.data.data);
      setCurrentPage(1); // Reset to page 1 on new data
    } catch (err) {
      toast.error('Failed to load track data');
    } finally {
      setLoading(false);
    }
  };

  const filteredLogs = data?.logs?.filter(log =>
    log.address?.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  // Pagination logic
  const totalPages = Math.ceil(filteredLogs.length / itemsPerPage);
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentLogs = filteredLogs.slice(indexOfFirstItem, indexOfLastItem);

  const handleDownload = () => {
    if (!filteredLogs.length) return toast.error('No data to download');
    const headers = ["Date", "Time", "Address", "Latitude", "Longitude", "Distance (m)"];
    const rows = filteredLogs.map(log => [
      new Date(log.time).toLocaleDateString('en-GB'),
      new Date(log.time).toLocaleTimeString(),
      log.address || 'NA',
      log.latitude,
      log.longitude,
      log.distanceFromPrevious || 0
    ]);

    const csvContent = "data:text/csv;charset=utf-8,"
      + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `TrackLogs_${data.employee.name}_${date}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (calendarRef.current && !calendarRef.current.contains(event.target)) {
        setShowCalendar(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
        <Loader2 className="animate-spin text-indigo-600" size={40} />
        <p className="text-sm font-bold text-slate-400">Loading track logs...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-up">
      {/* Premium Header Filters */}
      <div className="flex flex-col lg:flex-row justify-between items-center gap-6">
        <div className="flex items-center gap-4">
           <button
            onClick={() => navigate(`/tracking-dashboard?date=${date}`)}
            className="p-3 bg-white rounded-2xl border border-slate-100 shadow-sm text-slate-400 hover:text-indigo-600 transition-all hover:scale-105 active:scale-95"
          >
            <ChevronLeft size={20} />
          </button>
          <div>
            <h1 className="text-xl font-bold text-slate-800 tracking-tight">Track Logs</h1>
            <p className="text-[10px] font-bold text-slate-400 tracking-widest ">Detailed Activity Table</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="relative group min-w-[240px]">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-600 transition-colors" />
            <input
              type="text"
              placeholder="Search address..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-white border border-slate-200 pl-12 pr-4 py-3 rounded-2xl text-[11px] font-bold text-slate-700 outline-none focus:border-indigo-100 transition-all shadow-sm"
            />
          </div>

          <div className="relative" ref={calendarRef}>
            <button
              onClick={() => setShowCalendar(!showCalendar)}
              className="flex items-center gap-3 bg-white border border-slate-200 px-6 py-3 rounded-2xl shadow-sm hover:bg-slate-50 transition-all"
            >
              <Calendar size={16} className="text-indigo-600" />
              <span className="text-xs font-bold text-slate-700">{new Date(date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
              <ChevronDown size={14} className={`text-slate-400 transition-transform ${showCalendar ? 'rotate-180' : ''}`} />
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
                    selectedDate={date}
                    onSelect={(newDate) => setSearchParams({ date: newDate })}
                    onClose={() => setShowCalendar(false)}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <button
            onClick={handleDownload}
            className="flex items-center gap-2 bg-indigo-600 text-white px-6 py-3 rounded-2xl text-xs font-bold hover:bg-indigo-700 hover:-translate-y-0.5 transition-all shadow-[0_10px_25px_rgba(79,70,229,0.2)] active:scale-95"
          >
            <Download size={16} />
            Export CSV
          </button>
        </div>
      </div>

      {/* Employee Summary Card */}
      <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm relative group overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-50/50 rounded-bl-[5rem] -mr-8 -mt-8 transition-all group-hover:scale-110" />

        <div className="flex flex-col lg:flex-row items-center gap-8 relative">
          <div
            onClick={() => navigate(`/employee/${userId}`)}
            className="w-24 h-24 rounded-3xl bg-indigo-50 flex items-center justify-center text-indigo-600 border-4 border-white shadow-2xl overflow-hidden cursor-pointer hover:scale-105 transition-transform"
          >
            {data?.employee?.profileImage ? (
              <img src={data.employee.profileImage} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="text-3xl font-bold">{data?.employee?.name?.charAt(0)}</span>
            )}
          </div>

          <div className="flex-1 grid grid-cols-2 md:grid-cols-3 gap-y-6 gap-x-12">
            <div>
              <p className="text-[10px] font-bold text-slate-400 tracking-widest  mb-1">Employee</p>
              <p
                onClick={() => navigate(`/employee/${userId}`)}
                className="text-sm font-bold text-slate-900 hover:text-indigo-600 cursor-pointer transition-colors"
              >
                {data?.employee?.name}
              </p>
              <p className="text-[11px] font-bold text-slate-500 mt-0.5">{data?.employee?.designation}</p>
            </div>

            <div>
              <p className="text-[10px] font-bold text-slate-400 tracking-widest  mb-1">Department</p>
              <p className="text-sm font-bold text-slate-800">{data?.employee?.department}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></span>
                <span className="text-[11px] font-bold text-slate-500">{data?.employee?.headquarter}</span>
              </div>
            </div>

            <div>
              <p className="text-[10px] font-bold text-slate-400 tracking-widest mb-1">Tracking Summary</p>
              <p className="text-sm font-bold text-indigo-600">{(data?.summary?.totalDistance || 0).toFixed(2)} KM</p>
              <p className="text-[10px] font-bold text-slate-400 mt-1">Total Distance Today</p>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate(`/track-route/${userId}?date=${date}`)}
                className="flex-1 px-6 py-3 bg-indigo-600 text-white rounded-2xl text-[11px] font-bold flex items-center justify-center gap-2 shadow-[0_8px_20px_rgba(79,70,229,0.25)] hover:bg-indigo-700 hover:-translate-y-0.5 transition-all active:scale-95"
              >
                <MapIcon size={14} /> View Map
              </button>
              <div className="flex-1 px-6 py-3 bg-slate-50 text-slate-400 rounded-2xl text-[11px] font-bold flex items-center justify-center gap-2 border border-slate-100">
                <FileText size={14} /> Table View
              </div>
            </div>
          </div>
        </div>
      </div>



      {/* Logs Table Section */}
      <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-xl overflow-hidden">
        <div className="p-8 border-b border-slate-50 flex justify-between items-center bg-slate-50/30">
          <h3 className="text-sm font-bold text-slate-800 tracking-widest flex items-center gap-3">
            <TrendingUp size={18} className="text-indigo-600" />
            ACTIVITY LOGS
          </h3>
          <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full border border-indigo-100">
            {filteredLogs.length} Records Found
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr>
                <th className="px-8 py-5 text-[10px] font-bold text-slate-400 tracking-widest  border-b border-slate-50">Time</th>
                <th className="px-8 py-5 text-[10px] font-bold text-slate-400 tracking-widest  border-b border-slate-50">Location Address</th>
                <th className="px-8 py-5 text-[10px] font-bold text-slate-400 tracking-widest  border-b border-slate-50">Coordinates</th>
                <th className="px-8 py-5 text-[10px] font-bold text-slate-400 tracking-widest  border-b border-slate-50 text-center">Distance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {currentLogs.map((log, idx) => (
                <tr key={idx} className="hover:bg-slate-50/50 transition-colors group">
                  <td className="px-8 py-5">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 group-hover:scale-110 transition-transform">
                        <Clock size={14} />
                      </div>
                      <span className="text-xs font-bold text-slate-700">{new Date(log.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                    </div>
                  </td>
                  <td className="px-8 py-5">
                    <div className="flex items-start gap-3">
                      <MapPin size={14} className="text-indigo-400 mt-0.5 shrink-0" />
                      <span className="text-[11px] font-bold text-slate-600 leading-relaxed">{log.address || 'Address not resolved'}</span>
                    </div>
                  </td>
                  <td className="px-8 py-5">
                    <div className="space-y-1">
                      <p className="text-[10px] font-bold text-slate-400 tracking-tight">LAT: <span className="text-slate-700">{log.latitude.toFixed(6)}</span></p>
                      <p className="text-[10px] font-bold text-slate-400 tracking-tight">LNG: <span className="text-slate-700">{log.longitude.toFixed(6)}</span></p>
                    </div>
                  </td>
                  <td className="px-8 py-5 text-center">
                    <span className="px-3 py-1 bg-emerald-50 text-emerald-600 rounded-full text-[10px] font-bold tracking-widest">
                      {log.distanceFromPrevious ? `${log.distanceFromPrevious.toFixed(1)}m` : '0m'}
                    </span>
                  </td>
                </tr>
              ))}
              {currentLogs.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-24 text-center">
                    <div className="flex flex-col items-center gap-4">
                      <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center text-slate-200">
                        <MapIcon size={32} />
                      </div>
                      <p className="text-sm font-bold text-slate-400 tracking-tight">No activity logs found for this period</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        {totalPages > 1 && (
          <div className="px-8 py-6 bg-slate-50/30 border-t border-slate-50 flex justify-between items-center">
            <p className="text-[11px] font-bold text-slate-500">
              Showing <span className="text-slate-900">{indexOfFirstItem + 1}</span> to <span className="text-slate-900">{Math.min(indexOfLastItem, filteredLogs.length)}</span> of <span className="text-slate-900">{filteredLogs.length}</span> entries
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className="p-2 bg-white border border-slate-100 rounded-xl text-slate-400 hover:text-indigo-600 disabled:opacity-50 transition-all shadow-sm"
              >
                <ChevronLeft size={18} />
              </button>
              {[...Array(totalPages)].map((_, i) => (
                <button
                  key={i}
                  onClick={() => setCurrentPage(i + 1)}
                  className={`w-10 h-10 rounded-xl text-xs font-bold transition-all ${currentPage === i + 1
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100'
                    : 'bg-white border border-slate-100 text-slate-500 hover:bg-slate-50'
                    }`}
                >
                  {i + 1}
                </button>
              ))}
              <button
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
                className="p-2 bg-white border border-slate-100 rounded-xl text-slate-400 hover:text-indigo-600 disabled:opacity-50 transition-all shadow-sm"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default EmployeeTrackData;
