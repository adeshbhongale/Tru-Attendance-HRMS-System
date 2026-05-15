import { GoogleMap, MarkerF, Polyline, useJsApiLoader } from '@react-google-maps/api';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Calendar,
  ChevronDown,
  ChevronLeft,
  Clock,
  Loader2,
  MapIcon,
  MapPin,
  Navigation,
  Table as TableIcon
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import api from '../api/axios';
import CalendarPicker from '../components/CalendarPicker';

import socket from '../socket';

const libraries = ['places', 'geometry'];


const EmployeeTrackRoute = () => {
  const { userId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const date = searchParams.get('date') || new Date().toISOString().split('T')[0];
  const lastOnly = searchParams.get('lastOnly') === 'true';

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showCalendar, setShowCalendar] = useState(false);
  const calendarRef = useRef(null);

  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY,
    libraries
  });

  useEffect(() => {
    fetchTrackDetails();
  }, [userId, date]);

  // Real-time updates via Socket.IO
  useEffect(() => {
    const handleLocationUpdate = (payload) => {
      if (payload.userId === userId) {
        setData(prev => {
          if (!prev) return prev;

          // Check if this log already exists (to prevent duplicates)
          const isDuplicate = prev.logs.some(log =>
            new Date(log.time).getTime() === new Date(payload.time).getTime()
          );
          if (isDuplicate) return prev;

          const newLog = {
            latitude: payload.latitude,
            longitude: payload.longitude,
            time: payload.time,
            address: payload.address,
            distanceFromPrevious: payload.distanceFromPrevious || 0
          };

          return {
            ...prev,
            logs: [...prev.logs, newLog],
            summary: {
              ...prev.summary,
              totalDistance: payload.totalDistance,
              lastKnownLocation: {
                address: payload.address,
                time: payload.time
              }
            }
          };
        });
      }
    };

    const handleLiveUpdate = (payload) => {
      // payload: { userId, latitude, longitude, speed, distance, status, path }
      if (payload.userId === userId) {
        setData(prev => {
          if (!prev) return prev;

          // Add new points from the 10s batch to the logs
          const newLogs = payload.path.map(p => ({
            latitude: p.lat,
            longitude: p.lng,
            time: payload.timestamp
          }));

          return {
            ...prev,
            logs: [...prev.logs, ...newLogs],
            summary: {
              ...prev.summary,
              totalDistance: payload.distance / 1000, // KM
              lastKnownLocation: {
                address: payload.address || 'Live Tracking...',
                time: payload.timestamp
              }
            }
          };
        });
      }
    };

    socket.on('locationUpdated', handleLocationUpdate);
    socket.on('liveTrackingUpdate', handleLiveUpdate);
    return () => {
      socket.off('locationUpdated', handleLocationUpdate);
      socket.off('liveTrackingUpdate', handleLiveUpdate);
    };
  }, [userId]);

  const path = useMemo(() => {
    const rawData = data?.rawPath || [];
    const logData = data?.logs || [];

    // Use rawPath if available for high-fidelity route mapping
    const pointsToUse = rawData.length > 0 ? rawData : logData;

    const filteredLogs = [];
    let lastValidPoint = null;

    pointsToUse.forEach((log) => {
      const currentPoint = { lat: log.latitude, lng: log.longitude };

      if (!lastValidPoint) {
        filteredLogs.push(currentPoint);
        lastValidPoint = currentPoint;
      } else {
        const dist = window.google?.maps?.geometry?.spherical?.computeDistanceBetween(
          new window.google.maps.LatLng(lastValidPoint.lat, lastValidPoint.lng),
          new window.google.maps.LatLng(currentPoint.lat, currentPoint.lng)
        );

        if (dist < 5) return;

        filteredLogs.push(currentPoint);
        lastValidPoint = currentPoint;
      }
    });

    return filteredLogs;
  }, [data]);


  const fetchTrackDetails = async () => {
    try {
      setLoading(true);
      const res = await api.get(`/reports/track-details/${userId}?date=${date}`);
      setData(res.data.data);
    } catch (err) {
      toast.error('Failed to load route data');
    } finally {
      setLoading(false);
    }
  };


  const mapRef = useRef(null);

  const onMapLoad = (map) => {
    mapRef.current = map;
    if (path.length > 0) {
      const bounds = new window.google.maps.LatLngBounds();
      path.forEach(p => bounds.extend(p));
      map.fitBounds(bounds);
    }
  };

  useEffect(() => {
    if (mapRef.current && path.length > 0 && !loading) {
      const bounds = new window.google.maps.LatLngBounds();
      path.forEach(p => bounds.extend(p));
      mapRef.current.fitBounds(bounds);

      if (path.length === 1) {
        mapRef.current.setZoom(15);
      }
    }
  }, [path, loading]);

  const center = useMemo(() => data?.logs?.length > 0
    ? { lat: data.logs[data.logs.length - 1].latitude, lng: data.logs[data.logs.length - 1].longitude }
    : { lat: 16.7050, lng: 74.4567 }, [data]);


  useEffect(() => {
    const handleClickOutside = (event) => {
      if (calendarRef.current && !calendarRef.current.contains(event.target)) {
        setShowCalendar(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (loading || !isLoaded) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
        <Loader2 className="animate-spin text-indigo-600" size={40} />
        <p className="text-sm font-bold text-slate-400">Loading map and route data...</p>
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
            <h1 className="text-xl font-bold text-slate-800 tracking-tight">{lastOnly ? 'Live Location' : 'Route Tracking'}</h1>
            <p className="text-[10px] font-bold text-slate-400 tracking-widest ">{lastOnly ? 'Current Position' : 'Live Movement'}</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
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
            </div>

            <div className="flex items-center gap-3">
              <button className="flex-1 px-6 py-3 bg-emerald-500 text-white rounded-2xl text-[11px] font-bold flex items-center justify-center gap-2 shadow-[0_8px_20px_rgba(16,185,129,0.25)] hover:bg-emerald-600 hover:-translate-y-0.5 transition-all active:scale-95">
                <MapIcon size={14} /> View Map
              </button>
              <button
                onClick={() => navigate(`/track-data/${userId}?date=${date}`)}
                className="flex-1 px-6 py-3 bg-slate-800 text-white rounded-2xl text-[11px] font-bold flex items-center justify-center gap-2 shadow-[0_8px_20px_rgba(30,41,59,0.2)] hover:bg-slate-900 hover:-translate-y-0.5 transition-all active:scale-95"
              >
                <TableIcon size={14} /> View Table
              </button>
            </div>
          </div>
        </div>

        <div className="mt-8 pt-8 border-t border-slate-50 flex flex-wrap gap-12">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600 shadow-sm">
              <MapPin size={20} />
            </div>
            <div className="max-w-xs">
              <p className="text-[10px] font-bold text-slate-400 tracking-widest  mb-0.5">Last Known Location</p>
              <p className="text-xs font-bold text-slate-700 break-words">{data?.summary?.lastKnownLocation?.address || 'Awaiting update...'}</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600 shadow-sm">
              <Navigation size={20} />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 tracking-widest  mb-0.5">Total Distance</p>
              <p className="text-xs font-bold text-indigo-600">{(data?.summary?.totalDistance || 0).toFixed(3)} KM</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600 shadow-sm">
              <Clock size={20} />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 tracking-widest  mb-0.5">Last Sync</p>
              <p className="text-xs font-bold text-slate-700">
                {data?.logs?.length > 0 ? new Date(data.logs[data.logs.length - 1].time).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '--:--'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Map Section */}
      <div className="bg-white p-4 rounded-[2.5rem] border border-slate-100 shadow-xl overflow-hidden h-[600px] relative">
        <GoogleMap
          mapContainerStyle={{ width: '100%', height: '100%', borderRadius: '1.5rem' }}
          center={center}
          zoom={14}
          onLoad={onMapLoad}
          options={{
            styles: [
              {
                "featureType": "all",
                "elementType": "labels.text.fill",
                "stylers": [{ "color": "#616161" }]
              },
              {
                "featureType": "all",
                "elementType": "labels.text.stroke",
                "stylers": [{ "color": "#f5f5f5" }]
              }
            ],
            disableDefaultUI: false,
            zoomControl: true,
            mapTypeControl: false,
            scaleControl: true,
            streetViewControl: false,
            rotateControl: false,
            fullscreenControl: true
          }}
        >
          {path.length >= 2 && (
            <Polyline
              path={path}
              options={{
                strokeColor: '#ef4444',
                strokeWeight: 4,
                strokeOpacity: 0.8,
                zIndex: 10
              }}
            />
          )}

          {path.length > 0 && (
            <>
              {/* Previous Point Marker (if it exists) */}
              {path.length >= 2 && (
                <MarkerF
                  position={path[path.length - 2]}
                  icon={{
                    url: "https://maps.google.com/mapfiles/ms/icons/blue-dot.png",
                    anchor: window.google ? new window.google.maps.Point(10, 10) : null,
                    scale: 0.6
                  }}
                  label={{
                    text: "PREVIOUS",
                    fontSize: "9px",
                    fontWeight: "bold",
                    color: "#3b82f6"
                  }}
                />
              )}

              {/* Current Point Marker */}
              <MarkerF
                position={path[path.length - 1]}
                icon={{
                  url: "https://maps.google.com/mapfiles/ms/icons/red-dot.png",
                  anchor: window.google ? new window.google.maps.Point(10, 10) : null,
                }}
                label={{
                  text: "LIVE",
                  fontSize: "10px",
                  fontWeight: "bold",
                  color: "#dc2626"
                }}
              />
            </>
          )}

        </GoogleMap>
      </div>
    </div>
  );
};

export default EmployeeTrackRoute;
