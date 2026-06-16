// Removed @react-google-maps/api imports to resolve API Key billing/activation errors
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

const getDistanceBetween = (lat1, lon1, lat2, lon2) => {
  const R = 6371e3; // metres
  const phi1 = lat1 * Math.PI / 180;
  const phi2 = lat2 * Math.PI / 180;
  const deltaPhi = (lat2 - lat1) * Math.PI / 180;
  const deltaLambda = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) *
    Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // in meters
};


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

  const [leafletLoaded, setLeafletLoaded] = useState(false);

  useEffect(() => {
    if (window.L) {
      setLeafletLoaded(true);
      return;
    }
    let link = document.getElementById('leaflet-css');
    if (!link) {
      link = document.createElement('link');
      link.id = 'leaflet-css';
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }
    let script = document.getElementById('leaflet-js');
    if (!script) {
      script = document.createElement('script');
      script.id = 'leaflet-js';
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.async = true;
      script.onload = () => setLeafletLoaded(true);
      document.head.appendChild(script);
    } else {
      const interval = setInterval(() => {
        if (window.L) {
          setLeafletLoaded(true);
          clearInterval(interval);
        }
      }, 100);
      return () => clearInterval(interval);
    }
  }, []);

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

    const pointsToUse = rawData.length > 0 ? rawData : logData;

    const filteredLogs = [];
    let lastValidPoint = null;

    pointsToUse.forEach((log) => {
      const currentPoint = { lat: log.latitude, lng: log.longitude };

      if (!lastValidPoint) {
        filteredLogs.push(currentPoint);
        lastValidPoint = currentPoint;
      } else {
        const dist = getDistanceBetween(
          lastValidPoint.lat, lastValidPoint.lng,
          currentPoint.lat, currentPoint.lng
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


  const mapContainerRef = useRef(null);
  const leafletMap = useRef(null);
  const polylineRef = useRef(null);
  const startMarkerRef = useRef(null);
  const endMarkerRef = useRef(null);

  const initLeafletMap = () => {
    if (!mapContainerRef.current || !window.L || loading) return;

    const latLngs = path.map(p => [p.lat, p.lng]);
    const centerPoint = latLngs.length > 0 ? latLngs[latLngs.length - 1] : [center.lat, center.lng];

    if (leafletMap.current) {
      leafletMap.current.setView(centerPoint);
      updateLayers();
      return;
    }

    leafletMap.current = window.L.map(mapContainerRef.current, {
      zoomControl: true,
      attributionControl: false,
      maxZoom: 22
    }).setView(centerPoint, 20);

    window.L.tileLayer('https://mt{s}.google.com/vt/lyrs=p&x={x}&y={y}&z={z}', {
      subdomains: ['0', '1', '2', '3'],
      maxZoom: 22,
      maxNativeZoom: 20
    }).addTo(leafletMap.current);

    updateLayers();
  };

  const updateLayers = () => {
    if (!leafletMap.current || !window.L) return;

    if (polylineRef.current) polylineRef.current.remove();
    if (startMarkerRef.current) startMarkerRef.current.remove();
    if (endMarkerRef.current) endMarkerRef.current.remove();

    const latLngs = path.map(p => [p.lat, p.lng]);

    if (latLngs.length >= 2) {
      polylineRef.current = window.L.polyline(latLngs, {
        color: '#ef4444',
        weight: 4,
        opacity: 0.8
      }).addTo(leafletMap.current);
    }

    if (latLngs.length > 0) {
      delete window.L.Icon.Default.prototype._getIconUrl;
      window.L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });

      if (latLngs.length >= 2) {
        const prevPoint = latLngs[latLngs.length - 2];
        const blueIcon = new window.L.Icon({
          iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png',
          shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
          iconSize: [25, 41],
          iconAnchor: [12, 41],
          popupAnchor: [1, -34],
          shadowSize: [41, 41]
        });
        startMarkerRef.current = window.L.marker(prevPoint, { icon: blueIcon })
          .addTo(leafletMap.current)
          .bindPopup('<b>PREVIOUS</b>')
          .openPopup();
      }

      const currentPoint = latLngs[latLngs.length - 1];
      const redIcon = new window.L.Icon({
        iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41]
      });
      endMarkerRef.current = window.L.marker(currentPoint, { icon: redIcon })
        .addTo(leafletMap.current)
        .bindPopup('<b>LIVE</b>')
        .openPopup();

      const bounds = window.L.latLngBounds(latLngs);
      leafletMap.current.fitBounds(bounds, { padding: [50, 50], maxZoom: 20 });
    }
  };

  useEffect(() => {
    if (leafletLoaded && !loading) {
      setTimeout(() => {
        initLeafletMap();
      }, 100);
    }
  }, [leafletLoaded, loading, path]);

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

  if (loading || !leafletLoaded) {
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
        <div ref={mapContainerRef} className="w-full h-full" style={{ borderRadius: '1.5rem', minHeight: '500px' }} />
        {!leafletLoaded && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/80 backdrop-blur-sm">
            <Loader2 className="animate-spin text-indigo-600" />
          </div>
        )}
      </div>
    </div>
  );
};

export default EmployeeTrackRoute;
