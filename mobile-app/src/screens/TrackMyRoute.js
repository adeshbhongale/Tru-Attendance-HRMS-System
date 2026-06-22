import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Activity, ArrowLeft, Calendar as CalendarIcon, ChevronLeft, ChevronRight, Clock, Gauge, Home, Map, MapPin, Navigation, RotateCcw, Zap } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Dimensions, Platform, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import api from '../api/axios';
import socket from '../socket';

import MapView, { Circle, Marker, Polyline } from '../components/MapComponents';

const { width, height } = Dimensions.get('window');

const TrackMyRoute = ({ navigation }) => {
  const [data, setData] = useState(null);
  const mapRef = useRef(null);
  const [showRawGPS, setShowRawGPS] = useState(true);

  const goToLocation = (lat, lng) => {
    if (mapRef.current && typeof lat === 'number' && typeof lng === 'number') {
      mapRef.current.animateToRegion({
        latitude: lat,
        longitude: lng,
        latitudeDelta: 0.005,
        longitudeDelta: 0.005,
      }, 1000);
    }
  };
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('Mapview');

  const [currentDate, setCurrentDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);

  const [weeklyOffs, setWeeklyOffs] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [office, setOffice] = useState(null);

  const [logs, setLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsLoaded, setLogsLoaded] = useState(false);

  const dateStr = currentDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  const getLocalDateString = (d) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  useEffect(() => {
    fetchRoute();
  }, [currentDate]);

  useEffect(() => {
    let isMounted = true;
    let userId = null;

    const getUserId = async () => {
      try {
        const cachedId = await AsyncStorage.getItem('userId');
        if (cachedId) {
          userId = cachedId;
        } else {
          const userStr = await AsyncStorage.getItem('user');
          if (userStr) {
            const user = JSON.parse(userStr);
            userId = user._id || user.id;
          }
        }
      } catch (e) {
        console.warn('[TrackMyRoute] Failed to load userId for socket listener:', e);
      }
    };
    getUserId();

    const handleLiveUpdate = (payload) => {
      if (!isMounted) return;
      if (userId && payload.userId === userId) {
        setData(prev => {
          if (!prev) return prev;

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

          const newRoadGeometry = payload.path.map(p => ({
            latitude: p.lat,
            longitude: p.lng
          }));

          return {
            ...prev,
            rawPath: prev.rawPath ? [...prev.rawPath, ...newRawPoints] : newRawPoints,
            roadGeometry: prev.roadGeometry ? [...prev.roadGeometry, ...newRoadGeometry] : newRoadGeometry,
            summary: {
              ...prev.summary,
              totalDistance: payload.distance !== undefined ? payload.distance : prev.summary?.totalDistance,
              avgSpeed: payload.avgSpeed !== undefined ? payload.avgSpeed : (payload.speed ? parseFloat((payload.speed * 3.6).toFixed(1)) : prev.summary?.avgSpeed),
              maxSpeed: payload.maxSpeed !== undefined ? payload.maxSpeed : prev.summary?.maxSpeed,
              stops: payload.stops !== undefined ? payload.stops : prev.summary?.stops
            }
          };
        });

        setLogs(prev => {
          const newLogs = payload.path.map(p => ({
            latitude: p.lat,
            longitude: p.lng,
            time: p.timestamp || payload.timestamp,
            status: p.status,
            speed: p.speed,
            address: p.address || 'Live Tracking...'
          }));
          return [...prev, ...newLogs];
        });
      }
    };

    socket.on('liveTrackingUpdate', handleLiveUpdate);
    return () => {
      isMounted = false;
      socket.off('liveTrackingUpdate', handleLiveUpdate);
    };
  }, []);

  const fetchRoute = async () => {
    try {
      setLoading(true);
      setLogsLoaded(false);
      setLogs([]);
      const dateIso = getLocalDateString(currentDate);

      const [res, officeRes, holidaysRes, leavesRes] = await Promise.all([
        api.get(`/reports/track-details-me?date=${dateIso}&excludeLogs=true`),
        api.get('/settings/office').catch(() => null),
        api.get('/holidays').catch(() => null),
        api.get('/leaves/my-leaves').catch(() => null)
      ]);

      if (res.data.success) {
        setData(res.data.data);
      }
      if (officeRes && officeRes.data.success) {
        setOffice(officeRes.data.data);
        setWeeklyOffs(officeRes.data.data.weeklyOffs || []);
      }
      if (holidaysRes && holidaysRes.data.success) {
        setHolidays(holidaysRes.data.data || []);
      }
      if (leavesRes && leavesRes.data.success) {
        setLeaves(leavesRes.data.data.data || []);
      }
    } catch (err) {
      // Error handled silently or via UI
    } finally {
      setLoading(false);
    }
  };

  const fetchLogs = async () => {
    try {
      setLogsLoading(true);
      const dateIso = getLocalDateString(currentDate);
      const res = await api.get(`/reports/track-details-me?date=${dateIso}&onlyLogs=true`);
      if (res.data.success && res.data.data) {
        setLogs(res.data.data.logs || []);
        setLogsLoaded(true);
      }
    } catch (err) {
      // Error handled silently
    } finally {
      setLogsLoading(false);
    }
  };

  if (loading) {
    return (
      <View className="flex-1 justify-center items-center bg-white">
        <ActivityIndicator size="large" color="#3a0ee9ff" />
      </View>
    );
  }

  const getISTDateString = (date) => {
    if (!date) return null;
    const d = new Date(date);
    if (isNaN(d.getTime())) return null;
    const istTime = new Date(d.getTime() + (5.5 * 60 * 60 * 1000));
    const year = istTime.getUTCFullYear();
    const month = String(istTime.getUTCMonth() + 1).padStart(2, '0');
    const day = String(istTime.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const selectedDateStr = getISTDateString(currentDate);

  const dayName = currentDate.toLocaleDateString('en-US', { weekday: 'long' });
  const isWeekOff = weeklyOffs.includes(dayName);

  const isHoliday = holidays.some(h => {
    const hStr = getISTDateString(h.holiday_date);
    return hStr === selectedDateStr && h.status === 'active';
  });

  const isFullLeave = leaves.some(l => {
    const start = getISTDateString(l.startDate);
    const end = getISTDateString(l.endDate);
    return l.status === 'Approved' && l.duration === 'Full Day' && selectedDateStr >= start && selectedDateStr <= end;
  });

  // Build route paths — prioritize snapped over raw
  const rawPath = [];
  const snappedPath = [];
  let lastValidLoc = null;

  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371e3; // meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const addPoint = (loc, time, extra = {}) => {
    if (loc && typeof loc.latitude === 'number' && typeof loc.longitude === 'number') {
      if (!lastValidLoc) {
        rawPath.push({ latitude: loc.latitude, longitude: loc.longitude, time, ...extra });
        lastValidLoc = loc;
      } else {
        const dist = calculateDistance(lastValidLoc.latitude, lastValidLoc.longitude, loc.latitude, loc.longitude);
        if (dist < 5) return;
        rawPath.push({ latitude: loc.latitude, longitude: loc.longitude, time, ...extra });
        lastValidLoc = loc;
      }
    }
  };

  // 1. Add Start Point
  if (data?.punchIn?.location) {
    addPoint(data.punchIn.location, data.punchIn.time, { isStart: true });
  }

  // 2. Use roadGeometry if available (road-wise tracking), fallback to snappedRoute
  if (data?.roadGeometry && data.roadGeometry.length > 0) {
    data.roadGeometry.forEach(p => {
      snappedPath.push({ latitude: p.latitude, longitude: p.longitude });
    });
  } else if (data?.snappedRoute && data.snappedRoute.length > 0) {
    data.snappedRoute.forEach(p => {
      snappedPath.push({ latitude: p.latitude, longitude: p.longitude });
    });
  }

  // 3. Use Raw Path for Map (fallback or secondary display)
  if (data?.rawPath && data.rawPath.length > 0) {
    data.rawPath.forEach(p => addPoint(p, p.time || p.timestamp));
  }
  // 4. Otherwise use 1-minute Summarized Logs
  else if (data?.logs && Array.isArray(data.logs)) {
    data.logs.forEach(log => {
      addPoint({ latitude: log.latitude, longitude: log.longitude }, log.time);
    });
  }

  // 5. Add End Point
  if (data?.punchOut?.location) {
    addPoint(data.punchOut.location, data.punchOut.time, { isEnd: true });
  }

  // Fallback to rawPath if snappedPath is empty
  if (snappedPath.length === 0 && rawPath.length > 0) {
    rawPath.forEach(p => {
      snappedPath.push({ latitude: p.latitude, longitude: p.longitude });
    });
  }

  // Prepend starting punch-in position to snappedPath if available and not already first element
  if (data?.punchIn?.location && typeof data.punchIn.location.latitude === 'number' && typeof data.punchIn.location.longitude === 'number') {
    const punchInLat = data.punchIn.location.latitude;
    const punchInLng = data.punchIn.location.longitude;
    const isAlreadyFirst = snappedPath.length > 0 &&
      Math.abs(snappedPath[0].latitude - punchInLat) < 0.0001 &&
      Math.abs(snappedPath[0].longitude - punchInLng) < 0.0001;
    if (!isAlreadyFirst) {
      snappedPath.unshift({ latitude: punchInLat, longitude: punchInLng });
    }
  }

  const totalDistKm = data?.summary?.totalDistance || 0;

  // Choose the best route for display - only if total distance is at least 10 meters
  const displayPath = (snappedPath.length >= 2 && totalDistKm >= 0.01)
    ? snappedPath
    : (rawPath.length >= 2 && totalDistKm >= 0.01 ? rawPath : []);
  const hasSnappedRoute = snappedPath.length >= 2 && totalDistKm >= 0.01;

  const hasTrackingData = data && data.exists && (displayPath.length > 0 || data.punchIn || data.punchOut);
  const showUnavailable = (isWeekOff || isHoliday || isFullLeave) && !hasTrackingData;

  const initialRegion = displayPath.length > 0 ? {
    latitude: displayPath[0].latitude,
    longitude: displayPath[0].longitude,
    latitudeDelta: 0.01,
    longitudeDelta: 0.01,
  } : (data?.punchIn?.location && typeof data.punchIn.location.latitude === 'number' && typeof data.punchIn.location.longitude === 'number' ? {
    latitude: data.punchIn.location.latitude,
    longitude: data.punchIn.location.longitude,
    latitudeDelta: 0.01,
    longitudeDelta: 0.01,
  } : {
    latitude: 16.701,
    longitude: 74.4496,
    latitudeDelta: 0.05,
    longitudeDelta: 0.05,
  });

  return (
    <View className="flex-1 bg-white">
      {/* Header (Blue Bar) */}
      <View className="bg-blue-800 pt-14 pb-4 px-4 flex-row items-center justify-between">
        <View className="flex-row items-center">
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <ArrowLeft size={24} color="white" />
          </TouchableOpacity>
          <Text className="text-white text-xl font-bold ml-6">Track My Route</Text>
        </View>
        <View className="flex-row items-center">
          <TouchableOpacity
            onPress={() => {
              fetchRoute();
              if (activeTab === 'Tableview') {
                fetchLogs();
              }
            }}
            className="ml-4"
          >
            <RotateCcw size={22} color="white" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.navigate('Main')} className="ml-4">
            <Home size={22} color="white" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Info Bar */}
      <View className="bg-slate-100 p-4">
        <View className="flex-row justify-between items-center">
          <View>
            <Text className="text-slate-400 font-bold text-[10px] tracking-widest mb-1">Selected Date</Text>
            <View className="flex-row items-center gap-2">
              <CalendarIcon size={16} color="#64748b" />
              <Text className="text-slate-900 font-bold text-lg">{dateStr}</Text>
            </View>
          </View>
          <View className="flex-row gap-3">
            <TouchableOpacity
              onPress={() => {
                const d = new Date(currentDate);
                d.setDate(d.getDate() - 1);
                setCurrentDate(d);
              }}
              className="w-10 h-10 bg-white rounded-xl border border-slate-200 items-center justify-center"
            >
              <ChevronLeft size={20} color="#64748b" />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setShowDatePicker(true)}
              className="w-10 h-10 bg-white rounded-xl border border-slate-200 items-center justify-center"
            >
              <CalendarIcon size={20} color="#0ea5e9" />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                const d = new Date(currentDate);
                d.setDate(d.getDate() + 1);
                if (d <= new Date()) setCurrentDate(d);
              }}
              className="w-10 h-10 bg-white rounded-xl border border-slate-200 items-center justify-center"
            >
              <ChevronRight size={20} color="#64748b" />
            </TouchableOpacity>
          </View>
        </View>

        {showDatePicker && (
          <DateTimePicker
            value={currentDate}
            mode="date"
            display="default"
            maximumDate={new Date()}
            onChange={(event, selectedDate) => {
              setShowDatePicker(false);
              if (selectedDate) setCurrentDate(selectedDate);
            }}
          />
        )}

        <View className="mt-4 pt-4 border-t border-slate-200">
          <Text className="text-slate-400 font-bold text-[10px] tracking-widest mb-3 uppercase">Trip Telemetry</Text>
          <View className="flex-row flex-wrap justify-between gap-y-3">
            {/* Distance */}
            <View className="w-[48%] bg-white p-3 rounded-2xl border border-slate-100 flex-row items-center gap-3">
              <View className="w-8 h-8 rounded-lg bg-sky-50 items-center justify-center">
                <Navigation size={14} color="#0ea5e9" />
              </View>
              <View>
                <Text className="text-[9px] font-bold text-slate-400">DISTANCE</Text>
                <Text className="text-xs font-extrabold text-slate-800">
                  {data?.summary?.totalDistance !== undefined ? `${(data.summary.totalDistance).toFixed(2)} km` : '0.00 km'}
                </Text>
              </View>
            </View>

            {/* Average Speed */}
            <View className="w-[48%] bg-white p-3 rounded-2xl border border-slate-100 flex-row items-center gap-3">
              <View className="w-8 h-8 rounded-lg bg-indigo-50 items-center justify-center">
                <Gauge size={14} color="#6366f1" />
              </View>
              <View>
                <Text className="text-[9px] font-bold text-slate-400">AVG SPEED</Text>
                <Text className="text-xs font-extrabold text-slate-800">
                  {data?.summary?.avgSpeed !== undefined ? `${data.summary.avgSpeed} km/h` : '0 km/h'}
                </Text>
              </View>
            </View>

            {/* Max Speed */}
            <View className="w-[48%] bg-white p-3 rounded-2xl border border-slate-100 flex-row items-center gap-3">
              <View className="w-8 h-8 rounded-lg bg-amber-50 items-center justify-center">
                <Activity size={14} color="#f59e0b" />
              </View>
              <View>
                <Text className="text-[9px] font-bold text-slate-400">MAX SPEED</Text>
                <Text className="text-xs font-extrabold text-slate-800">
                  {data?.summary?.maxSpeed !== undefined ? `${data.summary.maxSpeed} km/h` : '0 km/h'}
                </Text>
              </View>
            </View>

            {/* Stops / Provider */}
            <View className="w-[48%] bg-white p-3 rounded-2xl border border-slate-100 flex-row items-center gap-3">
              <View className="w-8 h-8 rounded-lg bg-emerald-50 items-center justify-center">
                <Zap size={14} color="#10b981" />
              </View>
              <View>
                <Text className="text-[9px] font-bold text-slate-400">STOPS (PROVIDER)</Text>
                <Text className="text-xs font-extrabold text-slate-800 uppercase">
                  {data?.summary?.stops !== undefined ? `${data.summary.stops} (${data.summary.provider || 'none'})` : '0 (none)'}
                </Text>
              </View>
            </View>
          </View>
        </View>
      </View>

      {/* Segment Selector / Tab Bar */}
      <View className="flex-row border-b border-slate-200 bg-white">
        <TouchableOpacity
          onPress={() => setActiveTab('Mapview')}
          className={`flex-1 py-3.5 items-center flex-row justify-center gap-2 border-b-2 ${activeTab === 'Mapview' ? 'border-blue-600' : 'border-transparent'}`}
        >
          <Map size={16} color={activeTab === 'Mapview' ? '#2563eb' : '#64748b'} />
          <Text className={`font-bold text-xs ${activeTab === 'Mapview' ? 'text-blue-600' : 'text-slate-500'}`}>Map View</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => {
            setActiveTab('Tableview');
            if (!logsLoaded) {
              fetchLogs();
            }
          }}
          className={`flex-1 py-3.5 items-center flex-row justify-center gap-2 border-b-2 ${activeTab === 'Tableview' ? 'border-blue-600' : 'border-transparent'}`}
        >
          <Clock size={16} color={activeTab === 'Tableview' ? '#2563eb' : '#64748b'} />
          <Text className={`font-bold text-xs ${activeTab === 'Tableview' ? 'text-blue-600' : 'text-slate-500'}`}>Activity Logs</Text>
        </TouchableOpacity>
      </View>

      {/* Content Container */}
      <View className="flex-1 bg-slate-50">
        {showUnavailable ? (
          <View className="flex-1 justify-center items-center bg-slate-50 p-6">
            <MapPin size={48} color="#f43f5e" />
            <Text className="text-slate-800 font-bold text-lg mt-4 text-center">Tracking Not Available</Text>
            <Text className="text-slate-500 font-medium text-sm mt-2 text-center">
              Employee tracking is disabled on {isWeekOff ? 'Week Offs' : isHoliday ? 'Holidays' : 'approved Leaves'}.
            </Text>
          </View>
        ) : activeTab === 'Mapview' ? (
          Platform.OS === 'web' ? (
            <View className="flex-1 justify-center items-center bg-slate-50">
              <MapPin size={48} color="#94a3b8" />
              <Text className="text-slate-400 font-bold mt-4">Map View is only available on Mobile Devices</Text>
              <Text className="text-slate-300 text-xs mt-1">Please use Android/iOS for live tracking</Text>
            </View>
          ) : (
            <View style={{ position: 'relative', width, height: height * 0.55 }}>
              {/* Floating Buttons */}
              <View style={{ position: 'absolute', top: 12, right: 12, zIndex: 99, gap: 10 }}>

                {/* Office Location Button */}
                {office && typeof office.latitude === 'number' && typeof office.longitude === 'number' && (
                  <TouchableOpacity
                    onPress={() => goToLocation(office.latitude, office.longitude)}
                    style={{ width: 44, height: 44, backgroundColor: 'white', borderRadius: 22, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 3, elevation: 5 }}
                  >
                    <Home size={20} color="#3b82f6" />
                  </TouchableOpacity>
                )}

                {/* Punch In Location Button */}
                {data?.punchIn?.location && typeof data.punchIn.location.latitude === 'number' && typeof data.punchIn.location.longitude === 'number' && (
                  <TouchableOpacity
                    onPress={() => goToLocation(data.punchIn.location.latitude, data.punchIn.location.longitude)}
                    style={{ width: 44, height: 44, backgroundColor: 'white', borderRadius: 22, alignItems: 'center', justify: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 3, elevation: 5 }}
                  >
                    <MapPin size={20} color="#e11d48" />
                  </TouchableOpacity>
                )}

                {/* Raw GPS Toggle Button */}
                <TouchableOpacity
                  onPress={() => setShowRawGPS(!showRawGPS)}
                  style={{ width: 44, height: 44, backgroundColor: showRawGPS ? '#f97316' : 'white', borderRadius: 22, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 3, elevation: 5 }}
                >
                  <Map size={20} color={showRawGPS ? 'white' : '#f97316'} />
                </TouchableOpacity>
              </View>

              <MapView
                ref={mapRef}
                style={{ width, height: '100%' }}
                initialRegion={initialRegion}
                showsUserLocation
              >
                {/* Office Geofence Circle & Building Icon */}
                {office && typeof office.latitude === 'number' && typeof office.longitude === 'number' && (
                  <>
                    <Circle
                      center={{ latitude: office.latitude, longitude: office.longitude }}
                      radius={office.radius || 100}
                      strokeColor="rgba(59, 130, 246, 0.4)"
                      fillColor="rgba(59, 130, 246, 0.15)"
                      strokeWidth={1}
                    />
                    <Marker
                      coordinate={{ latitude: office.latitude, longitude: office.longitude }}
                      title={office.name || "Office Building"}
                    >
                      <View style={{ width: 36, height: 36, backgroundColor: 'white', borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#3b82f6', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 3.84, elevation: 5 }}>
                        <Text style={{ fontSize: 20 }}>🏢</Text>
                      </View>
                    </Marker>
                  </>
                )}

                {/* Raw GPS Route (Orange — dashed/thin, secondary) */}
                {showRawGPS && rawPath.length >= 2 && (
                  <Polyline
                    coordinates={rawPath.map(p => ({ latitude: p.latitude, longitude: p.longitude }))}
                    strokeColor="#f97316"
                    strokeWidth={3}
                    lineDashPattern={[5, 5]}
                  />
                )}

                {/* Snapped Route (Indigo — road-wise, primary to match admin panel) */}
                {snappedPath.length >= 2 && (
                  <Polyline
                    coordinates={snappedPath.map(p => ({ latitude: p.latitude, longitude: p.longitude }))}
                    strokeColor="#4f46e5"
                    strokeWidth={5}
                  />
                )}

                {/* Start Marker (Green) */}
                {displayPath.length > 0 && (
                  <Marker
                    coordinate={{
                      latitude: displayPath[0].latitude,
                      longitude: displayPath[0].longitude
                    }}
                    pinColor="#10b981"
                    title="Start Location"
                  />
                )}

                {/* Last Recorded Route Location Marker (Orange) */}
                {displayPath.length > 0 && (
                  <Marker
                    coordinate={{
                      latitude: displayPath[displayPath.length - 1].latitude,
                      longitude: displayPath[displayPath.length - 1].longitude
                    }}
                    pinColor="#f97316"
                    title="Last Recorded Point"
                  />
                )}

                {/* Current Employee Live Location Marker (Green Pulse) */}
                {(() => {
                  const lastKnown = data?.summary?.lastKnownLocation;
                  const coords = (lastKnown && typeof lastKnown.latitude === 'number' && typeof lastKnown.longitude === 'number')
                    ? { latitude: lastKnown.latitude, longitude: lastKnown.longitude }
                    : (displayPath.length > 0 ? { latitude: displayPath[displayPath.length - 1].latitude, longitude: displayPath[displayPath.length - 1].longitude } : null);

                  if (!coords) return null;

                  return (
                    <Marker
                      coordinate={coords}
                      title="Employee Current Location (Live)"
                    >
                      <View style={{ alignItems: 'center', justifyContent: 'center', width: 32, height: 32 }}>
                        <View style={{ position: 'absolute', width: 24, height: 24, borderRadius: 12, backgroundColor: '#10b981', opacity: 0.4 }} />
                        <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: '#059669', borderWidth: 2, borderColor: 'white', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 2, elevation: 4 }} />
                      </View>
                    </Marker>
                  );
                })()}
              </MapView>
            </View>
          )
        ) : (
          /* Table View — Detailed Activity Table */
          <ScrollView
            className="flex-1 p-4"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 40 }}
          >
            {(() => {
              if (logsLoading) {
                return (
                  <View className="py-20 justify-center items-center">
                    <ActivityIndicator size="small" color="#e9200eff" />
                    <Text className="text-slate-400 font-bold mt-4">Loading activity logs...</Text>
                  </View>
                );
              }

              const logData = [...logs].reverse();
              const groupedLogs = [];
              const minuteMap = new Set();

              logData.forEach((log) => {
                const time = new Date(log.time);
                const minutes = time.getMinutes();
                const roundedMinutes = Math.floor(minutes / 5) * 5;
                const minuteKey = `${time.getFullYear()}-${time.getMonth()}-${time.getDate()} ${time.getHours()}:${roundedMinutes}`;
                if (!minuteMap.has(minuteKey)) {
                  groupedLogs.push(log);
                  minuteMap.add(minuteKey);
                }
              });

              if (groupedLogs.length === 0) {
                return (
                  <View className="py-20 justify-center items-center">
                    <MapPin size={48} color="#cbd5e1" />
                    <Text className="text-slate-400 font-bold mt-4 text-center">No activity logs found for this period</Text>
                  </View>
                );
              }

              return groupedLogs.map((log, idx) => {
                const isMocked = log.isMock || log.isMocked || false;
                const isSuspicious = log.isSuspicious || false;
                const isOffline = log.isOffline || log.status === 'offline';

                return (
                  <View key={idx} className="bg-white p-4 mb-3 rounded-2xl border border-slate-100/80 shadow-sm">
                    {/* Time & Status Badge */}
                    <View className="flex-row justify-between items-center mb-3">
                      <View className="flex-row items-center gap-2">
                        <Clock size={14} color="#4f46e5" />
                        <Text className="text-slate-700 font-bold text-xs">
                          {new Date(log.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}
                        </Text>
                      </View>
                      <View className={`px-2.5 py-1 rounded-full ${isMocked ? 'bg-amber-50 border border-amber-100' :
                        isOffline ? 'bg-orange-50 border border-orange-100' :
                          isSuspicious ? 'bg-rose-50 border border-rose-100' : 'bg-emerald-50 border border-emerald-100'
                        }`}>
                        <Text className={`text-[9px] font-bold ${isMocked ? 'text-amber-600' :
                          isOffline ? 'text-orange-600' :
                            isSuspicious ? 'text-rose-600' : 'text-emerald-600'
                          }`}>
                          {isMocked ? 'Fake GPS' : isOffline ? 'Offline' : isSuspicious ? 'Glitch' : 'Valid'}
                        </Text>
                      </View>
                    </View>

                    {/* Location Address */}
                    <View className="flex-row items-start gap-2 mb-3">
                      <MapPin size={14} color="#94a3b8" className="mt-0.5" />
                      <Text className="text-slate-600 text-xs flex-1 font-medium leading-relaxed">
                        {log.address && log.address !== 'Address not resolved'
                          ? log.address
                          : `Location near ${log.latitude.toFixed(6)}, ${log.longitude.toFixed(6)}`}
                      </Text>
                    </View>

                    {/* Coordinates & Distance */}
                    <View className="flex-row justify-between items-center pt-2 border-t border-slate-100/50">
                      <View className="flex-row gap-2">
                        <Text className="text-[10px] text-slate-400 font-bold">
                          LAT: <Text className="text-slate-600">{log.latitude.toFixed(6)}</Text>
                        </Text>
                        <Text className="text-[10px] text-slate-400 font-bold">
                          LNG: <Text className="text-slate-600">{log.longitude.toFixed(6)}</Text>
                        </Text>
                      </View>
                      <Text className="text-[10px] text-indigo-600 font-bold">
                        {isSuspicious ? 'Jump Filtered' : (log.distanceFromPrevious ? `+${log.distanceFromPrevious.toFixed(1)}m` : '0m')}
                      </Text>
                    </View>
                  </View>
                );
              });
            })()}
          </ScrollView>
        )}
      </View>
    </View>
  );
};

export default TrackMyRoute;


