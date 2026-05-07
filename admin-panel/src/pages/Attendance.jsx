import { AnimatePresence, motion } from 'framer-motion';
import { Calendar, ChevronLeft, ChevronRight, Loader2, Map as MapIcon, MapPin, Search, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../api/axios';

const Attendance = () => {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date().getFullYear() + '-' + String(new Date().getMonth() + 1).padStart(2, '0') + '-' + String(new Date().getDate()).padStart(2, '0'));
  const [activeCount, setActiveCount] = useState(0);
  const [showMap, setShowMap] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [focusedRecord, setFocusedRecord] = useState(null);
  const mapRef = useRef(null);

  const formatDate = (date) => {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  useEffect(() => {
    fetchAttendance();
  }, [selectedDate]);

  const fetchAttendance = async () => {
    try {
      setLoading(true);
      const res = await api.get(`/attendance?date=${selectedDate}`);
      const data = res.data.data;
      setRecords(data);

      const active = data.filter(r => r.status === 'Present' && r.punchIn?.time && !r.punchOut?.time).length;
      setActiveCount(active);
    } catch (err) {
      toast.error('Failed to load attendance records');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (showMap && !mapLoaded) {
      if (window.google) {
        setMapLoaded(true);
        return;
      }

      const existingScript = document.getElementById('google-maps-script');
      if (existingScript) {
        setMapLoaded(true);
        return;
      }

      const script = document.createElement('script');
      script.id = 'google-maps-script';
      script.src = `https://maps.googleapis.com/maps/api/js?key=${import.meta.env.VITE_GOOGLE_MAPS_API_KEY}&libraries=marker`;
      script.async = true;
      script.defer = true;
      script.onload = () => setMapLoaded(true);
      script.onerror = () => {
        toast.error('Mapping infrastructure blocked. Please disable ad-blockers to view the live map.');
      };
      document.head.appendChild(script);
    }
  }, [showMap, mapLoaded]);

  useEffect(() => {
    if (mapLoaded && showMap && mapRef.current && window.google) {
      const initialCenter = focusedRecord?.punchIn?.location?.latitude
        ? { lat: focusedRecord.punchIn.location.latitude, lng: focusedRecord.punchIn.location.longitude }
        : { lat: 20.5937, lng: 78.9629 };

      const map = new window.google.maps.Map(mapRef.current, {
        center: initialCenter,
        zoom: focusedRecord ? 15 : 5,
        styles: [],
        disableDefaultUI: false,
        zoomControl: true,
      });

      const bounds = new window.google.maps.LatLngBounds();
      let hasMarkers = false;

      records.forEach((record) => {
        if (record.punchIn?.location?.latitude && record.punchIn?.location?.longitude) {
          const pos = {
            lat: record.punchIn.location.latitude,
            lng: record.punchIn.location.longitude
          };

          const marker = new window.google.maps.Marker({
            position: pos,
            map: map,
            title: record.user?.name || 'Staff',
            icon: {
              path: window.google.maps.SymbolPath.CIRCLE,
              scale: 8,
              fillColor: '#4f46e5',
              fillOpacity: 1,
              strokeWeight: 2,
              strokeColor: '#ffffff',
            },
          });

          const infoWindow = new window.google.maps.InfoWindow({
            content: `
              <div style="padding: 12px; font-family: sans-serif; min-width: 150px;">
                <div style="font-weight: 700; font-size: 14px; color: #0f172a; margin-bottom: 4px;">${record.user?.name || 'Staff Member'}</div>
                <div style="font-size: 11px; font-weight: 600; color: #4f46e5; margin-bottom: 8px;">${record.user?.designation || 'Operational Staff'}</div>
                <div style="font-size: 10px; color: #64748b; font-weight: 500; padding-top: 8px; border-top: 1px solid #f1f5f9;">
                  Synced: ${new Date(record.punchIn.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}
                </div>
                ${record.isOutside ? '<div style="margin-top: 6px; font-size: 9px; font-weight: 700; color: #e11d48; background: #fff1f2; padding: 2px 6px; border-radius: 4px; display: inline-block;">Outside Zone</div>' : ''}
              </div>
            `
          });

          marker.addListener('mouseover', () => {
            infoWindow.open(map, marker);
          });

          marker.addListener('mouseout', () => {
            infoWindow.close();
          });

          bounds.extend(pos);
          hasMarkers = true;

          // Draw tracking path if record is focused
          if (focusedRecord?._id === record._id) {
            // Find all records for this user on this day to show combined trail
            const userRecords = records.filter(r =>
              r.user?._id === record.user?._id &&
              new Date(r.date).toDateString() === new Date(record.date).toDateString()
            ).sort((a, b) => new Date(a.punchIn.time) - new Date(b.punchIn.time));

            let combinedPath = [];
            let combinedLogs = [];

            userRecords.forEach(rec => {
              // Add punch in
              combinedPath.push({ lat: rec.punchIn.location.latitude, lng: rec.punchIn.location.longitude });

              // Add intermediate logs
              if (rec.trackingLogs) {
                rec.trackingLogs.forEach(log => {
                  combinedPath.push({ lat: log.latitude, lng: log.longitude });
                  combinedLogs.push(log);
                });
              }

              // Add punch out
              if (rec.punchOut?.location?.latitude) {
                combinedPath.push({ lat: rec.punchOut.location.latitude, lng: rec.punchOut.location.longitude });
              }
            });

            if (combinedPath.length > 0) {
              // Road-wise path calculation
              const directionsService = new window.google.maps.DirectionsService();

              // Limit waypoints for API (Google limit is 25)
              const waypoints = combinedLogs.slice(0, 23).map(log => ({
                location: new window.google.maps.LatLng(log.latitude, log.longitude),
                stopover: false
              }));

              const origin = combinedPath[0];
              const destination = combinedPath[combinedPath.length - 1];

              directionsService.route({
                origin: origin,
                destination: destination,
                waypoints: waypoints,
                travelMode: window.google.maps.TravelMode.DRIVING,
              }, (result, status) => {
                if (status === window.google.maps.DirectionsStatus.OK) {
                  new window.google.maps.DirectionsRenderer({
                    map: map,
                    directions: result,
                    suppressMarkers: true,
                    polylineOptions: {
                      strokeColor: '#4f46e5',
                      strokeWeight: 5,
                      strokeOpacity: 0.8
                    }
                  });
                } else {
                  new window.google.maps.Polyline({
                    path: combinedPath,
                    geodesic: true,
                    strokeColor: '#4f46e5',
                    strokeOpacity: 0.8,
                    strokeWeight: 3,
                    map: map
                  });
                }
              });

              // Intermediate markers for all sessions
              combinedLogs.forEach((log) => {
                new window.google.maps.Marker({
                  position: { lat: log.latitude, lng: log.longitude },
                  map: map,
                  icon: {
                    path: window.google.maps.SymbolPath.CIRCLE,
                    scale: 4,
                    fillColor: log.isOutside ? '#f43f5e' : '#10b981',
                    fillOpacity: 1,
                    strokeWeight: 1,
                    strokeColor: '#ffffff',
                  },
                });
              });

              combinedPath.forEach(p => bounds.extend(p));
              map.fitBounds(bounds);
            }
          }
        }
      });

      if (hasMarkers && !focusedRecord) {
        map.fitBounds(bounds);
      }
    }
  }, [mapLoaded, showMap, records, focusedRecord]);

  const [showCalendar, setShowCalendar] = useState(false);
  const calendarRef = useRef(null);
  const [currentMonth, setCurrentMonth] = useState(new Date(selectedDate));

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (calendarRef.current && !calendarRef.current.contains(event.target)) {
        setShowCalendar(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleDayChange = (days) => {
    const date = new Date(selectedDate);
    date.setDate(date.getDate() + days);
    setSelectedDate(formatDate(date));
  };

  const filteredRecords = records.filter(r =>
    r.user?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.user?.designation?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatTime = (dateStr) => {
    if (!dateStr) return '--:--';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '--:--';
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
  };

  const handleDateSelect = (day) => {
    const newDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
    setSelectedDate(formatDate(newDate));
    setShowCalendar(false);
  };

  const daysInMonth = (date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  };

  const startDayOfMonth = (date) => {
    return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  };

  const calendarDays = [];
  const totalDays = daysInMonth(currentMonth);
  const startDay = startDayOfMonth(currentMonth);

  for (let i = 0; i < startDay; i++) calendarDays.push(null);
  for (let i = 1; i <= totalDays; i++) calendarDays.push(i);

  if (loading && records.length === 0) {
    return (
      <div className="flex justify-center items-center h-96">
        <Loader2 className="animate-spin text-indigo-600" size={40} />
      </div>
    );
  }

  return (
    <div className="space-y-6 md:space-y-8 animate-fade-up">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight m-0">Attendance Logs</h2>
          <p className="text-slate-600 font-bold text-[13px] mt-2">View daily staff presence and location</p>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row justify-between items-center gap-6">
        <div className="flex flex-wrap items-center gap-4 w-full lg:w-auto">
          {/* Quick Filters - KEPT per request */}
          <div className="flex items-center gap-2 bg-white p-1 rounded-2xl border border-slate-200 shadow-sm">
            {['Today', 'Yesterday', 'Custom'].map((f) => {
              const todayStr = formatDate(new Date());
              const yesterday = new Date();
              yesterday.setDate(yesterday.getDate() - 1);
              const yesterdayStr = formatDate(yesterday);

              const isActive = f === 'Today' ? selectedDate === todayStr :
                f === 'Yesterday' ? selectedDate === yesterdayStr :
                  (f === 'Custom' && selectedDate !== todayStr && selectedDate !== yesterdayStr);

              return (
                <button
                  key={f}
                  onClick={() => {
                    if (f === 'Today') setSelectedDate(todayStr);
                    if (f === 'Yesterday') setSelectedDate(yesterdayStr);
                    if (f === 'Custom') setShowCalendar(true);
                  }}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${isActive
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'text-slate-500 hover:bg-slate-50'
                    }`}
                >
                  {f}
                </button>
              );
            })}
          </div>

          <div className="relative" ref={calendarRef}>
            <div className="flex items-center gap-3 bg-white border border-slate-200 px-4 py-2.5 rounded-2xl shadow-sm cursor-pointer hover:bg-slate-50 transition-colors"
              onClick={() => setShowCalendar(!showCalendar)}>
              <Calendar size={16} className="text-indigo-600" />
              <span className="text-sm font-bold text-slate-800">
                {new Date(selectedDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
            </div>

            <AnimatePresence>
              {showCalendar && (
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 10, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  className="absolute top-full left-0 mt-2 z-[110] bg-white border border-slate-200 rounded-3xl shadow-2xl p-6 w-80"
                >
                  <div className="flex justify-between items-center mb-6">
                    <h4 className="text-sm font-bold text-slate-900">
                      {currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                    </h4>
                    <div className="flex gap-1">
                      <button onClick={() => setCurrentMonth(new Date(currentMonth.setMonth(currentMonth.getMonth() - 1)))} className="p-2 hover:bg-slate-50 text-slate-400 rounded-lg"><ChevronLeft size={16} /></button>
                      <button onClick={() => setCurrentMonth(new Date(currentMonth.setMonth(currentMonth.getMonth() + 1)))} className="p-2 hover:bg-slate-50 text-slate-400 rounded-lg"><ChevronRight size={16} /></button>
                    </div>
                  </div>
                  <div className="grid grid-cols-7 gap-1 mb-2">
                    {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(d => (
                      <div key={d} className="text-[10px] font-bold text-slate-400 text-center py-2">{d}</div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 gap-1">
                    {calendarDays.map((day, idx) => {
                      if (!day) return <div key={idx} className="h-9 invisible" />;
                      const dateObj = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
                      const isFuture = dateObj > new Date();
                      const isSelected = selectedDate === formatDate(dateObj);
                      const isToday = formatDate(dateObj) === formatDate(new Date());

                      return (
                        <div
                          key={idx}
                          onClick={() => !isFuture && handleDateSelect(day)}
                          className={`
                            h-9 flex flex-col items-center justify-center rounded-xl text-[11px] font-bold transition-all relative
                            ${isFuture ? 'text-slate-200 cursor-not-allowed' : 'cursor-pointer'}
                            ${isSelected
                              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100'
                              : isFuture ? '' : 'text-slate-700 hover:bg-indigo-50 hover:text-indigo-600'}
                          `}
                        >
                          {day}
                          {isToday && !isSelected && <div className="absolute bottom-1 w-1 h-1 rounded-full bg-indigo-600" />}
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <div className="relative w-full sm:w-80">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search staff..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-white border border-slate-200 pl-12 pr-4 py-3.5 rounded-2xl outline-none focus:border-indigo-300 focus:ring-4 focus:ring-indigo-50 transition-all w-full text-sm font-bold text-slate-800 placeholder:text-slate-400 shadow-sm"
          />
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 flex-1">
          <div className="glass-card p-5 flex flex-col justify-center border-l-4 border-l-indigo-600">
            <div className="text-2xl font-bold text-slate-900 tracking-tighter">
              {filteredRecords.filter(r => (r.status === 'Present' || r.status === 'Late') && r.punchIn?.time && !r.punchOut?.time).length}
            </div>
            <div className="text-[10px] font-bold text-slate-400 tracking-wider ">Currently On Duty</div>
          </div>
          <div className="glass-card p-5 flex flex-col justify-center border-l-4 border-l-emerald-500">
            <div className="text-2xl font-bold text-slate-900 tracking-tighter">{filteredRecords.length}</div>
            <div className="text-[10px] font-bold text-slate-400 tracking-wider ">Total Records</div>
          </div>
          <div className="glass-card p-5 flex flex-col justify-center border-l-4 border-l-amber-500">
            <div className="text-2xl font-bold text-slate-900 tracking-tighter">{filteredRecords.filter(r => r.isOutside).length}</div>
            <div className="text-[10px] font-bold text-slate-400 tracking-wider ">Geofence Violations</div>
          </div>
        </div>

        <div className="lg:w-1/3 glass-card p-5 flex items-center justify-between bg-indigo-600 border-none shadow-xl shadow-indigo-100">
          <div>
            <div className="text-white font-bold text-lg leading-tight tracking-tight">Staff Map</div>
            <div className="text-indigo-100 text-[10px] font-medium">View live staff locations</div>
          </div>
          <button
            onClick={() => setShowMap(true)}
            className="bg-white text-indigo-600 px-5 py-2.5 rounded-xl font-bold text-xs shadow-lg hover:shadow-white/20 transition-all active:scale-95 flex items-center gap-2"
          >
            <MapIcon size={14} />
            Show Map
          </button>
        </div>
      </div>

      <AnimatePresence>
        {showMap && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-8">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowMap(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-7xl h-[90vh] bg-white rounded-3xl shadow-2xl overflow-hidden border border-white flex flex-col"
            >
              <div className="p-5 border-b border-slate-50 flex justify-between items-center bg-white z-10">
                <div>
                  <h3 className="text-base font-bold text-slate-900 tracking-tight">Staff Map</h3>
                  <p className="text-[10px] text-slate-500 font-medium">Real-time staff positions and sync status</p>
                </div>
                <button
                  onClick={() => {
                    setShowMap(false);
                    setFocusedRecord(null);
                  }}
                  className="w-10 h-10 rounded-xl bg-slate-50 text-slate-400 flex items-center justify-center hover:bg-rose-50 hover:text-rose-500 transition-all active:scale-90"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="flex-1 bg-slate-50 relative">
                {!mapLoaded && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
                    <Loader2 className="animate-spin text-indigo-600" size={32} />
                    <p className="text-[11px] font-bold text-slate-400 tracking-tight">Loading map...</p>
                  </div>
                )}
                <div ref={mapRef} className="w-full h-full" />
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <div className="glass-card overflow-hidden bg-white">
        <div className="p-6 border-b border-slate-50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <h3 className="text-sm font-bold text-slate-800 tracking-tight">Staff Logs</h3>
          <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 rounded-lg border border-slate-100">
            <div className="w-1.5 h-1.5 rounded-full bg-indigo-600 shadow-[0_0_8px_rgba(99,102,241,0.6)]" />
            <span className="text-[10px] font-bold text-slate-500 tracking-tight">Sync Active</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="text-left bg-slate-50/50">
                <th className="px-6 md:px-8 py-4 text-slate-500 text-[11px] font-bold tracking-tight">Staff Member</th>
                <th className="px-6 md:px-8 py-4 text-slate-500 text-[11px] font-bold tracking-tight">Punch Time</th>
                <th className="px-6 md:px-8 py-4 text-slate-500 text-[11px] font-bold tracking-tight">Location</th>
                <th className="px-6 md:px-8 py-4 text-slate-500 text-[11px] font-bold tracking-tight">Travel</th>
                <th className="px-6 md:px-8 py-4 text-slate-500 text-[11px] font-bold tracking-tight">Status</th>
                <th className="px-6 md:px-8 py-4 text-slate-500 text-[11px] font-bold tracking-tight text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan="4" className="px-8 py-12 text-center text-slate-400 font-bold text-sm bg-slate-50/30">
                    No logs found for this day
                  </td>
                </tr>
              ) : (
                filteredRecords.map((record) => (
                  <tr key={record._id} className="hover:bg-slate-50/30 transition-colors">
                    <td className="px-6 md:px-8 py-4">
                      <div className="flex items-center gap-4">
                        <div className="w-9 h-9 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold text-xs shadow-sm">
                          {record.user?.name?.charAt(0) || 'U'}
                        </div>
                        <div>
                          <div className="font-bold text-slate-900 text-sm tracking-tight">{record.user?.name || 'Staff Member'}</div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[9px] text-indigo-600 font-bold tracking-wider ">{record.user?.department || 'Operations'}</span>
                            <span className="text-[9px] text-slate-400 font-bold">•</span>
                            <span className="text-[9px] text-slate-500 font-bold tracking-wider ">{record.user?.shift?.name || 'General Shift'}</span>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 md:px-8 py-4">
                      <div className="flex items-center gap-4">
                        <div>
                          <div className="text-sm font-semibold text-slate-700 tracking-tight">In: {formatTime(record.punchIn?.time)}</div>
                          <div className="text-[10px] text-slate-400 font-medium tracking-tight">Out: {formatTime(record.punchOut?.time)}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 md:px-8 py-4">
                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-center gap-2 text-[10px] font-bold text-slate-600 tracking-tight bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200 w-fit">
                          <MapPin size={12} className={record.status === 'Absent' ? "text-slate-400" : (record.isOutside ? "text-rose-500" : "text-emerald-500")} />
                          {record.status === 'Absent' ? 'N/A' : (record.isOutside ? 'Outside Zone' : 'In Office')}
                        </div>
                        <div className="text-[9px] text-slate-400 font-medium max-w-[150px]" title={record.punchIn?.location?.address || 'N/A'}>
                          {record.status === 'Absent' ? 'No Location Data' : (record.punchIn?.location?.address || 'Address hidden')}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 md:px-8 py-4">
                      <div className="flex flex-col gap-1">
                        <div className="text-[11px] font-bold text-indigo-600 tracking-widest ">
                          {(record.totalDistance || 0).toFixed(0)}m
                        </div>
                        <div className="text-[9px] text-slate-400 font-bold  tracking-tighter">
                          Total Traveled
                        </div>
                      </div>
                    </td>
                    <td className="px-6 md:px-8 py-4">
                      <span className={`px-3 py-1.5 rounded-lg text-[10px] font-bold tracking-tight border ${record.status === 'Present'
                        ? 'bg-emerald-50 text-emerald-600 border-emerald-100'
                        : record.status === 'Absent'
                          ? 'bg-rose-50 text-rose-600 border-rose-100'
                          : record.status === 'Late'
                            ? 'bg-amber-50 text-amber-600 border-amber-100'
                            : record.status === 'Half Day'
                              ? 'bg-blue-50 text-blue-600 border-blue-100'
                              : 'bg-slate-100 text-slate-500 border-slate-200'
                        }`}>
                        {record.status === 'Present' ? 'Present' :
                          record.status === 'Late' ? 'Present (Late)' :
                            record.status === 'Half Day' ? 'Half Day' :
                              record.status}
                      </span>
                    </td>
                    <td className="px-6 md:px-8 py-4 text-right">
                      {record.trackingLogs?.length > 0 && (
                        <button
                          onClick={() => {
                            setFocusedRecord(record);
                            setShowMap(true);
                          }}
                          className="px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg text-[10px] font-bold border border-indigo-100 hover:bg-indigo-100 transition-colors"
                        >
                          View Trail
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Attendance;
