import DateTimePicker from '@react-native-community/datetimepicker';
import { ArrowLeft, Calendar as CalendarIcon, ChevronLeft, ChevronRight, Home, MapPin, Navigation, Gauge, Activity, Zap, Clock, Map } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Dimensions, Platform, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import api from '../api/axios';

import MapView, { Marker, Polyline } from '../components/MapComponents';

const { width, height } = Dimensions.get('window');

const TrackMyRoute = ({ navigation }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('Mapview');

  const [currentDate, setCurrentDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);

  const [weeklyOffs, setWeeklyOffs] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [leaves, setLeaves] = useState([]);

  const dateStr = currentDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  useEffect(() => {
    fetchRoute();
  }, [currentDate]);

  const fetchRoute = async () => {
    try {
      setLoading(true);
      const dateIso = currentDate.toISOString().split('T')[0];

      const [res, officeRes, holidaysRes, leavesRes] = await Promise.all([
        api.get(`/reports/track-details-me?date=${dateIso}`),
        api.get('/settings/office').catch(() => null),
        api.get('/holidays').catch(() => null),
        api.get('/leaves/my-leaves').catch(() => null)
      ]);

      if (res.data.success) {
        setData(res.data.data);
      }
      if (officeRes && officeRes.data.success) {
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

  // 2. Use snapped route if available (road-wise tracking)
  if (data?.snappedRoute && data.snappedRoute.length > 0) {
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

  // Choose the best route for display
  const displayPath = snappedPath.length >= 2 ? snappedPath : rawPath;
  const hasSnappedRoute = snappedPath.length >= 2;

  const initialRegion = displayPath.length > 0 ? {
    latitude: displayPath[0].latitude,
    longitude: displayPath[0].longitude,
    latitudeDelta: 0.01,
    longitudeDelta: 0.01,
  } : {
    latitude: 16.701,
    longitude: 74.4496,
    latitudeDelta: 0.05,
    longitudeDelta: 0.05,
  };

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
                  {isWeekOff || isHoliday || isFullLeave ? '0 km' : `${(data?.summary?.totalDistance || 0).toFixed(2)} km`}
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
                  {isWeekOff || isHoliday || isFullLeave ? '0 km/h' : `${data?.summary?.avgSpeed || 0} km/h`}
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
                  {isWeekOff || isHoliday || isFullLeave ? '0 km/h' : `${data?.summary?.maxSpeed || 0} km/h`}
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
                  {isWeekOff || isHoliday || isFullLeave ? '0' : `${data?.summary?.stops || 0} (${data?.summary?.provider || 'none'})`}
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
          onPress={() => setActiveTab('Tableview')}
          className={`flex-1 py-3.5 items-center flex-row justify-center gap-2 border-b-2 ${activeTab === 'Tableview' ? 'border-blue-600' : 'border-transparent'}`}
        >
          <Clock size={16} color={activeTab === 'Tableview' ? '#2563eb' : '#64748b'} />
          <Text className={`font-bold text-xs ${activeTab === 'Tableview' ? 'text-blue-600' : 'text-slate-500'}`}>Activity Logs</Text>
        </TouchableOpacity>
      </View>

      {/* Content Container */}
      <View className="flex-1 bg-slate-50">
        {isWeekOff || isHoliday || isFullLeave ? (
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
            <MapView
              style={{ width, height: height * 0.55 }}
              initialRegion={initialRegion}
              showsUserLocation
            >
              {/* Snapped Route (Blue — road-wise, primary) */}
              {snappedPath.length >= 2 && (
                <Polyline
                  coordinates={snappedPath.map(p => ({ latitude: p.latitude, longitude: p.longitude }))}
                  strokeColor="#2563eb"
                  strokeWidth={5}
                />
              )}

              {/* Raw Route (Red — fallback, shown when no snapped route) */}
              {!hasSnappedRoute && rawPath.length >= 2 && (
                <Polyline
                  coordinates={rawPath.map(p => ({ latitude: p.latitude, longitude: p.longitude }))}
                  strokeColor="#ff0000"
                  strokeWidth={5}
                />
              )}

              {/* End Marker */}
              {displayPath.length > 0 && (
                <Marker
                  coordinate={{
                    latitude: displayPath[displayPath.length - 1].latitude,
                    longitude: displayPath[displayPath.length - 1].longitude
                  }}
                >
                  <View className="w-10 h-10 bg-red-500 rounded-full items-center justify-center border-2 border-white shadow-lg">
                    <MapPin size={20} color="white" />
                  </View>
                </Marker>
              )}

              {/* Start Marker */}
              {displayPath.length > 0 && (
                <Marker
                  coordinate={{
                    latitude: displayPath[0].latitude,
                    longitude: displayPath[0].longitude
                  }}
                  pinColor="#10b981"
                />
              )}
            </MapView>
          )
        ) : (
          /* Table View — Detailed Activity Table */
          <ScrollView
            className="flex-1 p-4"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 40 }}
          >
            {(() => {
              const logData = data?.logs || [];
              const groupedLogs = [];
              const minuteMap = new Set();

              logData.forEach((log) => {
                const time = new Date(log.time);
                const minuteKey = `${time.getFullYear()}-${time.getMonth()}-${time.getDate()} ${time.getHours()}:${time.getMinutes()}`;
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
                      <View className={`px-2.5 py-1 rounded-full ${
                        isMocked ? 'bg-amber-50 border border-amber-100' :
                        isSuspicious ? 'bg-rose-50 border border-rose-100' : 'bg-emerald-50 border border-emerald-100'
                      }`}>
                        <Text className={`text-[9px] font-bold uppercase ${
                          isMocked ? 'text-amber-600' :
                          isSuspicious ? 'text-rose-600' : 'text-emerald-600'
                        }`}>
                          {isMocked ? 'Fake GPS' : isSuspicious ? 'Glitch' : 'Valid'}
                        </Text>
                      </View>
                    </View>

                    {/* Location Address */}
                    <View className="flex-row items-start gap-2 mb-3">
                      <MapPin size={14} color="#94a3b8" className="mt-0.5" />
                      <Text className="text-slate-600 text-xs flex-1 font-medium leading-relaxed">
                        {log.address || 'Address not resolved'}
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


