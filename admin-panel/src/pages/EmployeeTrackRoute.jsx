// Removed @react-google-maps/api imports to resolve API Key billing/activation errors
import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity,
  Calendar,
  ChevronDown,
  ChevronLeft,
  Home,
  Loader2,
  MapIcon,
  MapPin,
  Navigation,
  Pause,
  Play,
  RotateCcw,
  Table as TableIcon,
  Zap
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
  const hasFittedBounds = useRef(false);

  // Snapped vs Raw toggles
  const [showSnapped, setShowSnapped] = useState(true);
  const [showRaw, setShowRaw] = useState(true);
  const [office, setOffice] = useState(null);

  // Replay animation states
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackProgress, setPlaybackProgress] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);

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

          const newRoadPoint = {
            latitude: payload.latitude,
            longitude: payload.longitude
          };

          const newRawPoint = {
            latitude: payload.latitude,
            longitude: payload.longitude,
            rawLatitude: payload.latitude,
            rawLongitude: payload.longitude,
            snappedLatitude: payload.latitude,
            snappedLongitude: payload.longitude,
            time: payload.time,
            timestamp: payload.time,
            address: payload.address,
            status: payload.isSuspicious ? 'suspicious' : 'valid'
          };

          return {
            ...prev,
            logs: [...prev.logs, newLog],
            rawPath: prev.rawPath ? [...prev.rawPath, newRawPoint] : [newRawPoint],
            roadGeometry: prev.roadGeometry ? [...prev.roadGeometry, newRoadPoint] : undefined,
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
      // payload: { userId, latitude, longitude, speed, distance, status, path, provider }
      if (payload.userId === userId) {
        setData(prev => {
          if (!prev) return prev;

          // Add new points from the 5s/10s batch to the logs
          const newLogs = payload.path.map(p => ({
            latitude: p.lat,
            longitude: p.lng,
            time: p.timestamp || payload.timestamp,
            status: p.status,
            speed: p.speed,
            rawLatitude: p.rawLat,
            rawLongitude: p.rawLng,
            snappedLatitude: p.lat,
            snappedLongitude: p.lng
          }));

          const newRoadGeometry = payload.path.map(p => ({
            latitude: p.lat,
            longitude: p.lng
          }));

          const newRawPoints = payload.path.map(p => ({
            latitude: p.lat,
            longitude: p.lng,
            rawLatitude: p.rawLat,
            rawLongitude: p.rawLng,
            snappedLatitude: p.lat,
            snappedLongitude: p.lng,
            timestamp: p.timestamp || payload.timestamp,
            speed: p.speed,
            status: p.status
          }));

          return {
            ...prev,
            logs: [...prev.logs, ...newLogs],
            rawPath: prev.rawPath ? [...prev.rawPath, ...newRawPoints] : newRawPoints,
            roadGeometry: prev.roadGeometry ? [...prev.roadGeometry, ...newRoadGeometry] : undefined,
            summary: {
              ...prev.summary,
              totalDistance: payload.distance !== undefined ? payload.distance : prev.summary?.totalDistance,
              lastKnownLocation: {
                address: payload.address || 'Live Tracking...',
                time: payload.timestamp
              },
              provider: payload.provider || prev.summary?.provider,
              avgSpeed: payload.avgSpeed !== undefined ? payload.avgSpeed : prev.summary?.avgSpeed,
              maxSpeed: payload.maxSpeed !== undefined ? payload.maxSpeed : prev.summary?.maxSpeed,
              stops: payload.stops !== undefined ? payload.stops : prev.summary?.stops
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
      // Exclude glitched/suspicious coordinates
      if (log.status === 'suspicious' || log.isSuspicious) {
        return;
      }

      const currentPoint = {
        lat: log.latitude,
        lng: log.longitude,
        rawLatitude: log.rawLatitude,
        rawLongitude: log.rawLongitude,
        snappedLatitude: log.snappedLatitude,
        snappedLongitude: log.snappedLongitude,
        status: log.status,
        timestamp: log.timestamp || log.time,
        speed: log.speed,
        isMock: log.isMock,
        address: log.address
      };

      if (!lastValidPoint) {
        filteredLogs.push(currentPoint);
        lastValidPoint = currentPoint;
      } else {
        const lat1 = lastValidPoint.snappedLatitude || lastValidPoint.lat;
        const lng1 = lastValidPoint.snappedLongitude || lastValidPoint.lng;
        const lat2 = currentPoint.snappedLatitude || currentPoint.lat;
        const lng2 = currentPoint.snappedLongitude || currentPoint.lng;

        const dist = getDistanceBetween(lat1, lng1, lat2, lng2);

        if (dist < 5) return;

        filteredLogs.push(currentPoint);
        lastValidPoint = currentPoint;
      }
    });

    return filteredLogs;
  }, [data]);

  const simulationPath = useMemo(() => {
    const geoPoints = data?.roadGeometry || [];
    let result = [];
    if (geoPoints.length === 0) {
      result = [...path];
    } else {
      // Match each roadGeometry point to the closest GPS path point to inherit metadata
      result = geoPoints.map(geoPoint => {
        let closestPoint = null;
        let minDistance = Infinity;
        
        path.forEach(p => {
          const dist = getDistanceBetween(geoPoint.latitude, geoPoint.longitude, p.snappedLatitude || p.lat, p.snappedLongitude || p.lng);
          if (dist < minDistance) {
            minDistance = dist;
            closestPoint = p;
          }
        });
        
        if (closestPoint) {
          return {
            lat: geoPoint.latitude,
            lng: geoPoint.longitude,
            rawLatitude: closestPoint.rawLatitude,
            rawLongitude: closestPoint.rawLongitude,
            snappedLatitude: geoPoint.latitude,
            snappedLongitude: geoPoint.longitude,
            status: closestPoint.status,
            timestamp: closestPoint.timestamp,
            speed: closestPoint.speed,
            isMock: closestPoint.isMock,
            address: closestPoint.address
          };
        }
        
        return {
          lat: geoPoint.latitude,
          lng: geoPoint.longitude,
          rawLatitude: geoPoint.latitude,
          rawLongitude: geoPoint.longitude,
          snappedLatitude: geoPoint.latitude,
          snappedLongitude: geoPoint.longitude,
          status: 'valid',
          timestamp: data?.logs?.[0]?.time || new Date().toISOString(),
          speed: 0,
          isMock: false,
          address: ''
        };
      });
    }

    // Prepend punch-in location if available and not already first element
    if (data?.punchIn?.location && typeof data.punchIn.location.latitude === 'number' && typeof data.punchIn.location.longitude === 'number') {
      const punchInLat = data.punchIn.location.latitude;
      const punchInLng = data.punchIn.location.longitude;
      const isAlreadyFirst = result.length > 0 &&
        Math.abs(result[0].lat - punchInLat) < 0.0001 &&
        Math.abs(result[0].lng - punchInLng) < 0.0001;
      if (!isAlreadyFirst) {
        result.unshift({
          lat: punchInLat,
          lng: punchInLng,
          rawLatitude: punchInLat,
          rawLongitude: punchInLng,
          snappedLatitude: punchInLat,
          snappedLongitude: punchInLng,
          status: 'valid',
          timestamp: data?.punchIn?.time || new Date().toISOString(),
          speed: 0,
          isMock: false,
          address: data?.punchIn?.location?.address || 'Punch In Location'
        });
      }
    }
    return result;
  }, [data, path]);


  const fetchTrackDetails = async () => {
    try {
      setLoading(true);
      const res = await api.get(`/reports/track-details/${userId}?date=${date}`);
      setData(res.data.data);
      if (res.data.data && res.data.data.office) {
        setOffice(res.data.data.office);
      } else {
        setOffice(null);
      }
      // Reset playback on date/user changes
      setPlaybackProgress(0);
      setIsPlaying(false);
      hasFittedBounds.current = false;
    } catch (err) {
      toast.error('Failed to load route data');
    } finally {
      setLoading(false);
    }
  };


  const mapContainerRef = useRef(null);
  const leafletMap = useRef(null);
  const polylineRef = useRef(null);
  const rawPolylineRef = useRef(null);
  const startMarkerRef = useRef(null);
  const endMarkerRef = useRef(null);
  const playbackMarkerRef = useRef(null);
  const geofenceCircleRef = useRef(null);

  const flyToLocation = (lat, lng) => {
    if (leafletMap.current && typeof lat === 'number' && typeof lng === 'number') {
      leafletMap.current.setView([lat, lng], 18, { animate: true });
    }
  };

  const getLiveLocation = () => {
    const lastKnown = data?.summary?.lastKnownLocation;
    if (lastKnown && typeof lastKnown.latitude === 'number' && typeof lastKnown.longitude === 'number') {
      return [lastKnown.latitude, lastKnown.longitude];
    }
    if (simulationPath.length > 0) {
      const endPoint = simulationPath[simulationPath.length - 1];
      return [endPoint.lat, endPoint.lng];
    }
    return null;
  };

  const getOfficeLocation = () => {
    if (office && typeof office.latitude === 'number' && typeof office.longitude === 'number') {
      return [office.latitude, office.longitude];
    }
    return null;
  };

  const getPunchInLocation = () => {
    if (data?.punchIn?.location && typeof data.punchIn.location.latitude === 'number' && typeof data.punchIn.location.longitude === 'number') {
      return [data.punchIn.location.latitude, data.punchIn.location.longitude];
    }
    return null;
  };

  const centerToLiveLocation = () => {
    const liveLoc = getLiveLocation();
    if (liveLoc) flyToLocation(liveLoc[0], liveLoc[1]);
  };

  // Playback timer effect
  useEffect(() => {
    let timer = null;
    if (isPlaying && simulationPath.length > 0) {
      const delay = 1000 / playbackSpeed;
      timer = setInterval(() => {
        setPlaybackProgress(prev => {
          if (prev >= simulationPath.length - 1) {
            setIsPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, delay);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isPlaying, simulationPath, playbackSpeed]);

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
    }).setView(centerPoint, 16);

    window.L.tileLayer('https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
      subdomains: ['0', '1', '2', '3'],
      maxZoom: 22,
      maxNativeZoom: 20
    }).addTo(leafletMap.current);

    updateLayers();
  };

  const updateLayers = () => {
    if (!leafletMap.current || !window.L) return;

    const rawLatLngs = path.map(p => [p.rawLatitude || p.lat, p.rawLongitude || p.lng]);

    if (polylineRef.current) polylineRef.current.remove();
    if (rawPolylineRef.current) rawPolylineRef.current.remove();
    if (startMarkerRef.current) startMarkerRef.current.remove();
    if (endMarkerRef.current) endMarkerRef.current.remove();
    if (geofenceCircleRef.current) geofenceCircleRef.current.remove();
    if (window.officeBuildingMarker) {
      window.officeBuildingMarker.remove();
      window.officeBuildingMarker = null;
    }
    if (window.currentLocationMarker) {
      window.currentLocationMarker.remove();
      window.currentLocationMarker = null;
    }

    // 0. Draw Office Geofence Circle (faint blue shade)
    if (office && typeof office.latitude === 'number' && typeof office.longitude === 'number') {
      geofenceCircleRef.current = window.L.circle([office.latitude, office.longitude], {
        color: '#3b82f6',
        fillColor: '#3b82f6',
        fillOpacity: 0.15,
        radius: office.radius || 100,
        weight: 1
      }).addTo(leafletMap.current);

      // Draw Office Marker with Building Icon
      const buildingIcon = new window.L.DivIcon({
        className: 'office-building-icon',
        html: `
          <div style="font-size: 20px; display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; background: white; border-radius: 50%; box-shadow: 0 2px 5px rgba(0,0,0,0.2); border: 2px solid #3b82f6;">
            🏢
          </div>
        `,
        iconSize: [32, 32],
        iconAnchor: [16, 16]
      });
      window.officeBuildingMarker = window.L.marker([office.latitude, office.longitude], { icon: buildingIcon })
        .addTo(leafletMap.current)
        .bindPopup(`<b>${office.name || 'Office Building'}</b>`);
    }

    // 1. Draw Raw GPS Route (thin orange dashed line)
    const totalDistKm = data?.summary?.totalDistance || 0;
    if (showRaw && rawLatLngs.length >= 2) {
      rawPolylineRef.current = window.L.polyline(rawLatLngs, {
        color: '#f97316',
        weight: 3,
        opacity: 0.7,
        dashArray: '5, 10'
      }).addTo(leafletMap.current);
    }

    // 2. Draw Snapped Route (thick indigo line) - Fail-safe snapped route drawing
    const snappedLatLngs = simulationPath.map(p => [p.lat, p.lng]);

    if (showSnapped && snappedLatLngs.length >= 2) {
      polylineRef.current = window.L.polyline(snappedLatLngs, {
        color: '#4f46e5',
        weight: 5,
        opacity: 0.9
      }).addTo(leafletMap.current);
    }

    // 3. Draw Start, Last Location & Current Location Markers
    if (simulationPath.length > 0) {
      delete window.L.Icon.Default.prototype._getIconUrl;
      window.L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });

      const greenIcon = new window.L.Icon({
        iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41]
      });

      const orangeIcon = new window.L.Icon({
        iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-orange.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41]
      });

      const liveIcon = new window.L.DivIcon({
        className: 'live-location-pulse-icon',
        html: `
          <div class="relative flex items-center justify-center w-8 h-8">
            <div class="absolute w-8 h-8 rounded-full bg-emerald-500 opacity-40 animate-ping"></div>
            <div class="relative w-4 h-4 bg-emerald-600 rounded-full border-2 border-white shadow"></div>
          </div>
        `,
        iconSize: [32, 32],
        iconAnchor: [16, 16]
      });

      const startPoint = simulationPath[0];
      const startCoords = [startPoint.lat, startPoint.lng];
      startMarkerRef.current = window.L.marker(startCoords, { icon: greenIcon })
        .addTo(leafletMap.current)
        .bindPopup(`<b>START POINT</b><br/>Time: ${new Date(startPoint.timestamp).toLocaleTimeString()}`);

      const endPoint = simulationPath[simulationPath.length - 1];
      const endCoords = [endPoint.lat, endPoint.lng];
      
      // Draw Last Location Marker (Orange) at the end of the route path
      endMarkerRef.current = window.L.marker(endCoords, { icon: orangeIcon })
        .addTo(leafletMap.current)
        .bindPopup(`<b>LAST RECORDED ROUTE LOCATION</b><br/>Time: ${new Date(endPoint.timestamp).toLocaleTimeString()}<br/>Address: ${endPoint.address || 'Address not resolved'}`);

      // Draw Current Live Location Marker (Green Pulse) at summary lastKnownLocation
      const lastKnown = data?.summary?.lastKnownLocation;
      if (lastKnown && typeof lastKnown.latitude === 'number' && typeof lastKnown.longitude === 'number') {
        window.currentLocationMarker = window.L.marker([lastKnown.latitude, lastKnown.longitude], { icon: liveIcon })
          .addTo(leafletMap.current)
          .bindPopup(`<b>EMPLOYEE CURRENT LOCATION (LIVE)</b><br/>Time: ${new Date(lastKnown.time || lastKnown.timestamp || Date.now()).toLocaleTimeString()}<br/>Address: ${lastKnown.address || 'Live Tracking...'}`);
      } else {
        window.currentLocationMarker = window.L.marker(endCoords, { icon: liveIcon })
          .addTo(leafletMap.current)
          .bindPopup(`<b>EMPLOYEE CURRENT LOCATION (LIVE)</b><br/>Time: ${new Date(endPoint.timestamp).toLocaleTimeString()}<br/>Address: ${endPoint.address || 'Live Tracking...'}`);
      }

      const boundsLatLngs = showRaw ? rawLatLngs : (showSnapped ? snappedLatLngs : []);
      if (boundsLatLngs.length > 0 && !hasFittedBounds.current) {
        const bounds = window.L.latLngBounds(boundsLatLngs);
        leafletMap.current.fitBounds(bounds, { padding: [50, 50] });
        hasFittedBounds.current = true;
      }
    }
  };

  useEffect(() => {
    if (leafletLoaded && !loading) {
      setTimeout(() => {
        initLeafletMap();
      }, 100);
    }
  }, [leafletLoaded, loading, simulationPath]);

  // Update layers when toggling snapped/raw path
  useEffect(() => {
    if (leafletMap.current) {
      updateLayers();
    }
  }, [showSnapped, showRaw, office]);

  // Handle Playback Pulse Marker update
  useEffect(() => {
    if (!leafletMap.current || !window.L || simulationPath.length === 0) return;

    if (playbackMarkerRef.current) {
      playbackMarkerRef.current.remove();
      playbackMarkerRef.current = null;
    }

    const currentPoint = simulationPath[playbackProgress];
    if (!currentPoint) return;

    const lat = currentPoint.snappedLatitude || currentPoint.lat;
    const lng = currentPoint.snappedLongitude || currentPoint.lng;

    const pulseIcon = new window.L.DivIcon({
      className: 'playback-pulse-icon',
      html: `
        <div class="relative flex items-center justify-center w-8 h-8">
          <div class="absolute w-8 h-8 rounded-full bg-indigo-500 opacity-40 animate-ping"></div>
          <div class="relative w-5 h-5 bg-indigo-600 rounded-full border-2 border-white shadow flex items-center justify-center">
            <span class="w-1.5 h-1.5 bg-white rounded-full"></span>
          </div>
        </div>
      `,
      iconSize: [32, 32],
      iconAnchor: [16, 16]
    });

    playbackMarkerRef.current = window.L.marker([lat, lng], { icon: pulseIcon })
      .addTo(leafletMap.current);

    const speedKmh = (currentPoint.speed || 0) * 3.6;
    const popupContent = `
      <div style="font-family: inherit; font-size: 11px; font-weight: bold; color: #334155; padding: 2px;">
        <div style="color: #4f46e5; border-bottom: 1px solid #f1f5f9; padding-bottom: 4px; margin-bottom: 4px;">REPLAYING TRIP</div>
        <div>Time: ${new Date(currentPoint.timestamp).toLocaleTimeString()}</div>
        <div>Speed: ${speedKmh.toFixed(1)} km/h</div>
        ${currentPoint.isMock ? '<div style="color: #ef4444; margin-top: 2px;">🚨 Mock GPS Detected</div>' : ''}
        ${currentPoint.address ? `<div style="max-width: 150px; white-space: normal; color: #64748b; font-weight: normal; margin-top: 4px; line-height: 1.3;">${currentPoint.address}</div>` : ''}
      </div>
    `;

    playbackMarkerRef.current.bindPopup(popupContent, { closeButton: false, autoPan: false }).openPopup();

    if (isPlaying) {
      leafletMap.current.panTo([lat, lng]);
    }
  }, [playbackProgress, isPlaying, simulationPath]);

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
          <button
            onClick={fetchTrackDetails}
            disabled={loading}
            className="p-3 bg-white rounded-2xl border border-slate-200 shadow-sm text-slate-500 hover:text-indigo-600 transition-all hover:scale-105 active:scale-95 flex items-center justify-center disabled:opacity-50"
            title="Refresh Page"
          >
            <RotateCcw size={16} className={`${loading ? 'animate-spin' : ''}`} />
          </button>

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

      {/* Warning banner for raw fallback route */}
      {data?.reconstructionSuccess === false && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 px-6 py-4 rounded-3xl flex items-center gap-3 shadow-sm animate-fade-in">
          <Zap size={18} className="text-amber-500 shrink-0" />
          <div>
            <p className="text-xs font-bold">Road Snapping Unavailable (Showing Raw GPS Route)</p>
            <p className="text-[10px] font-semibold text-amber-600 mt-0.5">The snapped route could not be reconstructed. Displaying raw GPS coordinates fallback.</p>
          </div>
        </div>
      )}

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

        {/* Telemetry Metrics Row */}
        <div className="mt-8 pt-8 border-t border-slate-50 flex flex-wrap gap-8 lg:gap-12">
          <div className="flex items-center gap-4 min-w-[200px] max-w-xs">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600 shadow-sm shrink-0">
              <MapPin size={20} />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 tracking-widest  mb-0.5">Last Known Location</p>
              <p className="text-xs font-bold text-slate-700 break-words leading-tight">{data?.summary?.lastKnownLocation?.address || 'Awaiting update...'}</p>
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
              <Activity size={20} className={data?.summary?.currentStatus === 'online' ? 'text-emerald-500' : data?.summary?.currentStatus === 'poor signal' ? 'text-amber-500' : 'text-slate-400'} />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 tracking-widest  mb-0.5">Connection Status</p>
              <p className={`text-xs font-bold capitalize ${data?.summary?.currentStatus === 'online' ? 'text-emerald-600' : data?.summary?.currentStatus === 'poor signal' ? 'text-amber-600' : 'text-slate-500'}`}>
                {data?.summary?.currentStatus || 'offline'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600 shadow-sm">
              <Zap size={20} className={data?.summary?.signalQuality === 'strong' ? 'text-emerald-500' : 'text-amber-500'} />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 tracking-widest  mb-0.5">GPS / Signal Quality</p>
              <p className={`text-xs font-bold capitalize ${data?.summary?.signalQuality === 'strong' ? 'text-emerald-600' : 'text-amber-500'}`}>
                {data?.summary?.signalQuality || 'strong'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600 shadow-sm">
              <MapIcon size={20} />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 tracking-widest  mb-0.5">Stops / Provider</p>
              <p className="text-xs font-bold text-slate-700">
                {data?.summary?.stops || 0} stops <span className="text-[10px] text-slate-400 uppercase font-semibold pl-1">({data?.summary?.provider || 'none'})</span>
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Map Section */}
      <div className="bg-white p-4 rounded-[2.5rem] border border-slate-100 shadow-xl overflow-hidden h-[600px] relative">
        <div ref={mapContainerRef} className="w-full h-full" style={{ borderRadius: '1.5rem', minHeight: '500px' }} />

        {/* Layer Toggles (Top Right Overlay) */}
        {leafletLoaded && (
          <div className="absolute top-6 right-6 z-[1000] bg-white/95 backdrop-blur-md px-4 py-3 rounded-2xl shadow-xl flex flex-col gap-2.5 border border-slate-100/50">
            <p className="text-[9px] font-extrabold text-slate-400 tracking-widest border-b border-slate-100 pb-1.5 mb-0.5 uppercase">Route Layers</p>
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={showSnapped}
                onChange={(e) => setShowSnapped(e.target.checked)}
                className="w-4 h-4 rounded text-indigo-600 border-slate-300 focus:ring-indigo-500 cursor-pointer animate-none"
              />
              <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded bg-indigo-600 inline-block"></span>
                Snapped Route
              </span>
            </label>
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={showRaw}
                onChange={(e) => setShowRaw(e.target.checked)}
                className="w-4 h-4 rounded text-orange-500 border-slate-300 focus:ring-orange-500 cursor-pointer animate-none"
              />
              <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded bg-orange-500 inline-block"></span>
                Raw GPS Route
              </span>
            </label>
          </div>
        )}

        {/* Floating Quick Action Buttons (Top Right under layer toggles) */}
        {leafletLoaded && (
          <div className="absolute top-44 right-6 z-[1000] flex flex-col gap-2.5">
            {/* Live Location Button */}
            {(() => {
              const liveLoc = getLiveLocation();
              if (!liveLoc) return null;
              return (
                <button
                  onClick={() => flyToLocation(liveLoc[0], liveLoc[1])}
                  className="w-10 h-10 bg-white/95 backdrop-blur-md hover:bg-emerald-50 text-emerald-600 rounded-xl shadow-xl border border-slate-100/50 transition-all hover:scale-105 active:scale-95 flex items-center justify-center"
                  title="Go to Live Location"
                >
                  <Navigation size={18} className="fill-emerald-100" />
                </button>
              );
            })()}

            {/* Office Location Button */}
            {(() => {
              const officeLoc = getOfficeLocation();
              if (!officeLoc) return null;
              return (
                <button
                  onClick={() => flyToLocation(officeLoc[0], officeLoc[1])}
                  className="w-10 h-10 bg-white/95 backdrop-blur-md hover:bg-blue-50 text-blue-600 rounded-xl shadow-xl border border-slate-100/50 transition-all hover:scale-105 active:scale-95 flex items-center justify-center"
                  title="Go to Office Location"
                >
                  <Home size={18} />
                </button>
              );
            })()}

            {/* Punch In Location Button */}
            {(() => {
              const punchInLoc = getPunchInLocation();
              if (!punchInLoc) return null;
              return (
                <button
                  onClick={() => flyToLocation(punchInLoc[0], punchInLoc[1])}
                  className="w-10 h-10 bg-white/95 backdrop-blur-md hover:bg-rose-50 text-rose-600 rounded-xl shadow-xl border border-slate-100/50 transition-all hover:scale-105 active:scale-95 flex items-center justify-center"
                  title="Go to Punch In Location"
                >
                  <MapPin size={18} className="fill-rose-100" />
                </button>
              );
            })()}
          </div>
        )}

        {/* Playback Controls (Bottom Overlay) */}
        {leafletLoaded && simulationPath.length > 0 && (
          <div className="absolute bottom-6 left-6 right-6 z-[1000] bg-white/95 backdrop-blur-md p-4 rounded-[2rem] border border-slate-100 shadow-2xl flex flex-col md:flex-row items-center gap-4 justify-between">
            <div className="flex items-center gap-3 w-full md:w-auto">
              <button
                onClick={() => {
                  if (playbackProgress >= simulationPath.length - 1) {
                    setPlaybackProgress(0);
                  }
                  setIsPlaying(!isPlaying);
                }}
                className="w-12 h-12 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center shadow-lg transition-all active:scale-95"
              >
                {isPlaying ? <Pause size={20} /> : <Play size={20} className="ml-0.5" />}
              </button>
              <button
                onClick={() => {
                  setIsPlaying(false);
                  setPlaybackProgress(0);
                }}
                className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition-all active:scale-95"
                title="Restart"
              >
                <RotateCcw size={16} />
              </button>
              <div className="text-left">
                <p className="text-[10px] font-bold text-slate-400 tracking-wider">REPLAY STATUS</p>
                <p className="text-xs font-extrabold text-slate-800">
                  {isPlaying ? 'Playing...' : playbackProgress >= simulationPath.length - 1 ? 'Finished' : 'Paused'}
                </p>
              </div>
            </div>

            {/* Slider progress bar */}
            <div className="flex-1 flex items-center gap-3 w-full">
              <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded">
                {new Date(simulationPath[playbackProgress]?.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
              <input
                type="range"
                min="0"
                max={simulationPath.length - 1}
                value={playbackProgress}
                onChange={(e) => {
                  setIsPlaying(false);
                  setPlaybackProgress(parseInt(e.target.value));
                }}
                className="flex-1 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600 focus:outline-none"
              />
              <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded">
                {new Date(simulationPath[simulationPath.length - 1]?.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            </div>

            {/* Playback speed selector */}
            <div className="flex items-center gap-2 bg-slate-100/70 px-3 py-1.5 rounded-xl border border-slate-200/50">
              <span className="text-[9px] font-extrabold text-slate-400 tracking-wider pr-1">SPEED</span>
              {[1, 2, 5, 10].map(speed => (
                <button
                  key={speed}
                  onClick={() => setPlaybackSpeed(speed)}
                  className={`px-2 py-1 rounded-lg text-xs font-bold transition-all ${playbackSpeed === speed ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-200/50'}`}
                >
                  {speed}x
                </button>
              ))}
            </div>
          </div>
        )}

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
