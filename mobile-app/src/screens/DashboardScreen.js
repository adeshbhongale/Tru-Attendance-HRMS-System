import * as Location from 'expo-location';
import {
  Calendar,
  CircleCheck,
  Clock,
  Coffee,
  MapPin,
  Maximize,
  Minimize,
  RotateCcw,
  User,
  X
} from 'lucide-react-native';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  RefreshControl,
  ScrollView,
  StatusBar,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import api from '../api/axios';
import AttendanceMap from '../components/AttendanceMap';


const DashboardScreen = ({ navigation }) => {
  const [userData, setUserData] = useState(null);
  const [attendance, setAttendance] = useState(null);
  const [stats, setStats] = useState(null);
  const [office, setOffice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [userLocation, setUserLocation] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [mapFull, setMapFull] = useState(false);

  const isPunchIn = !!attendance?.punchIn?.time;
  const isPunchOut = !!attendance?.punchOut?.time;
  const isOnDuty = isPunchIn && !isPunchOut;

  // Redundant fetchAll removed as fetchDashboardData is handled on focus below

  const getCountdown = (shift) => {
    if (!shift) return null;
    const now = new Date();
    const [sHour, sMin] = shift.startTime.split(':').map(Number);
    const [eHour, eMin] = shift.endTime.split(':').map(Number);

    // Dynamic Shift Cutoff Logic (User Requirements)
    let cutoffStr = shift.punchInCutoff;
    if (!cutoffStr) {
      if (sHour < 12) cutoffStr = "14:00"; // Morning
      else if (sHour < 20) cutoffStr = "22:00"; // Evening
      else cutoffStr = "06:00"; // Night
    }

    const [cHour, cMin] = cutoffStr.split(':').map(Number);

    const start = new Date(now);
    start.setHours(sHour, sMin, 0, 0);

    const cutoff = new Date(now);
    cutoff.setHours(cHour, cMin, 0, 0);
    // Handle night shift cutoff rollover
    if (cHour < 12 && now.getHours() > 12) {
      cutoff.setDate(cutoff.getDate() + 1);
    }

    const end = new Date(now);
    end.setHours(eHour, eMin, 0, 0);
    if (shift.isNightShift && eHour < 12) end.setDate(end.getDate() + 1);

    // If already punched in/out, don't show "Missed"
    if (isPunchIn || isPunchOut) {
      if (now < end) {
        const diff = end - now;
        const h = Math.floor(diff / (1000 * 60 * 60));
        const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        return { label: 'Ends in', time: `${h}h ${m}m`, color: 'text-emerald-400', isActive: true };
      }
      return { label: 'Shift Ended', time: 'Over', color: 'text-slate-500', isOver: true };
    }

    if (now < new Date(start.getTime() - 3600000)) {
      const diff = start - now;
      const h = Math.floor(diff / (1000 * 60 * 60));
      const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      return { label: 'Upcoming Shift', time: `Starts in ${h}h ${m}m`, color: 'text-indigo-400', isFuture: true };
    } else if (now < start) {
      const diff = start - now;
      const m = Math.floor(diff / (1000 * 60));
      return { label: 'Starts in', time: `${m}m`, color: 'text-indigo-400', isActive: true };
    } else if (now < end) {
      const diff = end - now;
      const h = Math.floor(diff / (1000 * 60 * 60));
      const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      return { label: 'Ends in', time: `${h}h ${m}m`, color: 'text-emerald-400', isActive: true };
    } else if (now > cutoff && !isPunchIn) {
      return { label: 'Shift Missed', time: 'Absent', color: 'text-rose-500', isMissed: true };
    }
    return { label: 'Shift Ended', time: 'Over', color: 'text-slate-500', isOver: true };
  };

  const [countdown, setCountdown] = useState(null);
  const [liveStats, setLiveStats] = useState({ worked: 0, breaks: 0 });

  // Live tick — only adds elapsed time from punch-in to backend baseline.
  // Backend `stats.totalWorkedHours` and `stats.totalBreakMinutes` are the source of truth.
  // Frontend ONLY adds live seconds on top (for smooth UI) — never recalculates history.
  useEffect(() => {
    const timer = setInterval(() => {
      if (stats) {
        // Base from backend (authoritative)
        let worked = stats.totalWorkedHours || 0;
        // Add only the CURRENT live session delta (no history re-calculation)
        if (isOnDuty && attendance?.punchIn?.time && !attendance?.breaks?.some(b => !b.endTime)) {
          const punchIn = new Date(attendance.punchIn.time);
          // Use currentWorkingHours from backend as base for today
          const backendCurrentHours = stats.currentWorkingHours || 0;
          const liveExtraMinutes = Math.max(0, (new Date() - punchIn) / 60000
            - (attendance.breaks?.reduce((acc, b) => acc + (b.duration || 0), 0) || 0));
          // Total = historical (from backend) + live extra beyond what backend already counted
          worked = (stats.totalWorkedHours || 0) + Math.max(0, liveExtraMinutes / 60 - backendCurrentHours);
        }

        // Break base from backend
        let breaks = (stats.totalBreakMinutes || 0) / 60;
        const activeBreak = attendance?.breaks?.find(b => !b.endTime);
        if (activeBreak) {
          const start = new Date(activeBreak.startTime);
          breaks += (new Date() - start) / 3600000;
        }
        setLiveStats({ worked, breaks });
      }
    }, 10000);
    return () => clearInterval(timer);
  }, [stats, isOnDuty, attendance]);

  useEffect(() => {
    // Set online on mount
    api.post('/auth/status', { isOnline: true }).catch(() => { });
    return () => {
      api.post('/auth/status', { isOnline: false }).catch(() => { });
    };
  }, []);

  useEffect(() => {
    if (userData?.shift) {
      setCountdown(getCountdown(userData.shift));
      const timer = setInterval(() => {
        setCountdown(getCountdown(userData.shift));
      }, 60000);
      return () => clearInterval(timer);
    }
  }, [userData]);

  useEffect(() => {
    fetchDashboardData();
    getCurrentLocation();

    const unsubscribe = navigation.addListener('focus', () => {
      fetchDashboardData();
      getCurrentLocation();
    });

    return unsubscribe;
  }, [navigation]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchDashboardData();
    await getCurrentLocation();
    setRefreshing(false);
  };

  const getCurrentLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;

      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setUserLocation({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      });
      return loc;
    } catch (err) {
      return null;
    }
  };


  useEffect(() => {
    let interval;
    if (isOnDuty) {
      interval = setInterval(async () => {
        try {
          const loc = await getCurrentLocation();
          if (loc) {
            const { latitude, longitude } = loc.coords;
            let addr = 'Auto Tracked';

            // Use Google Geocoding API for precise address
            try {
              const MAPS_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
              const geoRes = await fetch(
                `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${MAPS_KEY}`
              );
              const geoData = await geoRes.json();
              if (geoData.status === 'OK' && geoData.results.length > 0) {
                addr = geoData.results[0].formatted_address;
              } else {
                const geocode = await Location.reverseGeocodeAsync({ latitude, longitude });
                if (geocode[0]) {
                  const g = geocode[0];
                  addr = [g.streetNumber, g.street, g.district || g.subregion, g.city, g.region, g.postalCode].filter(Boolean).join(', ');
                }
              }
            } catch {
              const geocode = await Location.reverseGeocodeAsync({ latitude, longitude });
              if (geocode[0]) {
                const g = geocode[0];
                addr = [g.streetNumber, g.street, g.city, g.region, g.postalCode].filter(Boolean).join(', ');
              }
            }

            await api.post('/attendance/track', { latitude, longitude, address: addr });
          }
        } catch (err) {
        }
      }, 120000); // 2 minutes
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isOnDuty]);

  const handleToggleBreak = async () => {
    try {
      setRefreshing(true);
      const res = await api.post('/attendance/break');
      setAttendance(res.data.data);
      await fetchDashboardData();
      Alert.alert('Success', res.data.message);
    } catch (err) {
      Alert.alert('Error', err.response?.data?.message || 'Could not toggle break.');
    } finally {
      setRefreshing(false);
    }
  };

  const fetchDashboardData = async () => {
    try {
      if (!refreshing) setLoading(true);

      const results = await Promise.allSettled([
        api.get('/auth/me'),
        api.get('/settings/office'),
        api.get('/reports/my-stats')
      ]);

      if (results[0].status === 'fulfilled') {
        setUserData(results[0].value.data.data);
        setAttendance(results[0].value.data.todayAttendance);
      }

      if (results[1].status === 'fulfilled') {
        setOffice(results[1].value.data.data);
      }

      if (results[2].status === 'fulfilled') {
        setStats(results[2].value.data.data);
      }
    } catch (err) {
    } finally {
      setLoading(false);
    }
  };

  if (loading && !refreshing) {
    return (
      <View className="flex-1 justify-center items-center bg-white">
        <ActivityIndicator size="large" color="#4f46e5" />
        <Text className="mt-4 text-slate-400 font-bold text-sm">Initializing Dashboard...</Text>
      </View>
    );
  }

  const punchInTime = attendance?.punchIn?.time
    ? new Date(attendance.punchIn.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })
    : '--:--';

  const punchOutTime = attendance?.punchOut?.time
    ? new Date(attendance.punchOut.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })
    : '--:--';

  const convertTo12Hour = (time24) => {
    if (!time24) return '--:--';
    const [hours, minutes] = time24.split(':');
    let h = parseInt(hours);
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${h}:${minutes} ${ampm}`;
  };

  return (
    <View className="flex-1 bg-[#f1f5f9]">
      <StatusBar barStyle="dark-content" />

      {/* Modern Header */}
      <View className="bg-blue-600 pt-14 pb-5 px-6 border-b border-slate-100 flex-row justify-between items-center">
        <View>
          <Text className="text-white text-[10px] font-bold tracking-widest mb-1">Welcome Back</Text>
          <Text className="text-2xl font-bold text-white tracking-tighter">{userData?.name || 'Employee'}</Text>
        </View>
        <View className="flex-row items-center">
          <TouchableOpacity
            className="w-12 h-12 rounded-2xl bg-indigo-50 justify-center items-center border border-indigo-100 overflow-hidden"
            onPress={() => navigation.navigate('Profile')}
          >
            {userData?.profileImage ? (
              <Image source={{ uri: userData.profileImage }} className="w-full h-full" />
            ) : (
              <User size={24} color="#4f46e5" />
            )}
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#4f46e5']} />
        }
      >
        {/* Main Attendance Card */}
        <View className="px-6 mt-6">
          <View className="bg-white rounded-[32px] p-6 shadow-xl shadow-slate-200 border border-slate-50">
            <View className="flex-row justify-between items-center mb-6">
              <View className="flex-row items-center">
                <View className="w-3 h-3 rounded-full mr-2 bg-emerald-500" />
                <Text className="font-bold text-slate-400 text-[10px]  tracking-widest">
                  System Online
                </Text>
              </View>
              <Text className="text-slate-400 font-bold text-xs">
                {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}
              </Text>
            </View>

            <View className="flex-row items-center justify-between mb-8">
              <View className="items-center flex-1">
                <Text className="text-[10px] font-bold text-slate-400  mb-2">Punch In</Text>
                <Text className="text-xl font-bold text-slate-900">{punchInTime}</Text>
              </View>
              <View className="w-[1px] h-10 bg-slate-100" />
              <View className="items-center flex-1">
                <Text className="text-[10px] font-bold text-slate-400  mb-2">Punch Out</Text>
                <Text className="text-xl font-bold text-slate-900">{punchOutTime}</Text>
              </View>
            </View>

            <TouchableOpacity
              onPress={() => (isPunchOut || countdown?.isFuture || countdown?.isMissed) ? null : navigation.navigate('Attendance')}
              disabled={isPunchOut || countdown?.isFuture || countdown?.isMissed}
              className={`h-16 rounded-2xl flex-row justify-center items-center shadow-lg ${(isPunchOut || countdown?.isMissed) ? 'bg-slate-100' :
                countdown?.isFuture ? 'bg-indigo-50 border border-indigo-100' :
                  isOnDuty ? 'bg-rose-500 shadow-rose-100' : 'bg-indigo-600 shadow-indigo-100'
                }`}
            >
              <Clock size={20} color={isPunchOut || countdown?.isMissed ? '#94a3b8' : countdown?.isFuture ? '#6366f1' : 'white'} />
              <Text className={`ml-3 font-bold text-base tracking-tight ${(isPunchOut || countdown?.isMissed) ? 'text-slate-400' :
                countdown?.isFuture ? 'text-indigo-400' : 'text-white'
                }`}>
                {isPunchOut ? 'Day Completed' :
                  countdown?.isMissed ? 'Day Completed (Absent)' :
                    countdown?.isFuture ? 'Shift Not Started' :
                      isOnDuty ? 'Punch Out Now' : 'Punch In Now'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Centered Month Label */}
        <View className="items-center mt-6">
          <View className="bg-slate-100 px-4 py-1.5 rounded-full">
            <Text className="text-[10px] font-bold text-slate-500  tracking-widest">
              ({new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' }).replace(' ', '-')})
            </Text>
          </View>
        </View>

        {/* Stats Grid - 6 Boxes (2 Rows of 3) */}
        <View className="px-6 mt-4">
          <View className="flex-row" style={{ gap: 10 }}>
            {/* Box 1: Present */}
            <View className="flex-1 bg-white rounded-[24px] p-4 border border-slate-50 shadow-sm items-center">
              <View className="w-8 h-8 rounded-xl bg-indigo-50 justify-center items-center mb-2">
                <CircleCheck size={16} color="#4f46e5" />
              </View>
              <Text className="text-lg font-bold text-slate-900">{stats?.presentDays || 0}</Text>
              <Text className="text-[8px] font-bold text-slate-400  tracking-tighter text-center">Present</Text>
            </View>

            {/* Box 2: Absent */}
            <View className="flex-1 bg-white rounded-[24px] p-4 border border-slate-50 shadow-sm items-center">
              <View className="w-8 h-8 rounded-xl bg-rose-50 justify-center items-center mb-2">
                <X size={16} color="#f43f5e" />
              </View>
              <Text className="text-lg font-bold text-slate-900">{stats?.absentDays || 0}</Text>
              <Text className="text-[8px] font-bold text-slate-400  tracking-tighter text-center">Absent</Text>
            </View>

            {/* Box 3: Leave */}
            <View className="flex-1 bg-white rounded-[24px] p-4 border border-slate-50 shadow-sm items-center">
              <View className="w-8 h-8 rounded-xl bg-amber-50 justify-center items-center mb-2">
                <Calendar size={16} color="#f59e0b" />
              </View>
              <Text className="text-lg font-bold text-slate-900">{stats?.leaveDays || 0}</Text>
              <Text className="text-[8px] font-bold text-slate-400  tracking-tighter text-center">Leave</Text>
            </View>
          </View>

          <View className="flex-row mt-3" style={{ gap: 10 }}>
            {/* Box 4: Worked HR */}
            <View className="flex-1 bg-white rounded-[24px] p-4 border border-slate-50 shadow-sm items-center">
              <View className="w-8 h-8 rounded-xl bg-emerald-50 justify-center items-center mb-2">
                <Clock size={16} color="#10b981" />
              </View>
              <Text className="text-lg font-bold text-slate-900">{Math.floor(liveStats.worked)}h</Text>
              <Text className="text-[8px] font-bold text-slate-400  tracking-tighter text-center">Worked</Text>
            </View>

            {/* Box 5: Break Time */}
            <View className="flex-1 bg-white rounded-[24px] p-4 border border-slate-50 shadow-sm items-center">
              <View className="w-8 h-8 rounded-xl bg-amber-50 justify-center items-center mb-2">
                <Coffee size={16} color="#f59e0b" />
              </View>
              <Text className="text-lg font-bold text-slate-900">{Math.floor(liveStats.breaks)}h</Text>
              <Text className="text-[8px] font-bold text-slate-400  tracking-tighter text-center">Breaks</Text>
            </View>

            {/* Box 6: Distance */}
            <View className="flex-1 bg-white rounded-[24px] p-4 border border-slate-50 shadow-sm items-center">
              <View className="w-8 h-8 rounded-xl bg-sky-50 justify-center items-center mb-2">
                <MapPin size={16} color="#0ea5e9" />
              </View>
              <Text className="text-lg font-bold text-slate-900">{(stats?.totalDistanceKm || 0).toFixed(0)}</Text>
              <Text className="text-[8px] font-bold text-slate-400  tracking-tighter text-center">KM Dist</Text>
            </View>
          </View>
        </View>



        {/* Live Tracking Map Card - Reverted to Original Position */}
        <View className="px-6 mt-6">
          <View className="bg-white rounded-[32px] overflow-hidden border border-slate-50 shadow-lg shadow-slate-200">
            <View className="p-5 flex-row justify-between items-center">
              <View>
                <Text className="text-lg font-bold text-slate-900 tracking-tighter">Office Proximity</Text>
                <View className="flex-row items-center mt-1">
                  <MapPin size={12} color="#64748b" />
                  <Text className="text-slate-500 font-bold text-[10px] ml-1 ">{office?.name || 'Primary Office'}</Text>
                </View>
              </View>
              <View className="flex-row items-center gap-2">
                <TouchableOpacity
                  onPress={onRefresh}
                  className="w-10 h-10 rounded-xl bg-slate-50 justify-center items-center border border-slate-100"
                >
                  <RotateCcw size={18} color="#64748b" />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setMapFull(true)}
                  className="w-10 h-10 rounded-xl bg-slate-50 justify-center items-center border border-slate-100"
                >
                  <Maximize size={18} color="#64748b" />
                </TouchableOpacity>
              </View>
            </View>
            <View className="h-72 w-full">
              <AttendanceMap
                latitude={office?.latitude}
                longitude={office?.longitude}
                radius={office?.radius}
                userLocation={userLocation}
              />
            </View>
          </View>
        </View>

        {/* Full Screen Map Modal */}
        <Modal visible={mapFull} animationType="slide" transparent={false}>
          <View className="flex-1 bg-white">
            <StatusBar barStyle="dark-content" />
            <View className="absolute top-14 left-6 z-10">
              <TouchableOpacity
                onPress={() => setMapFull(false)}
                className="w-12 h-12 rounded-2xl bg-white shadow-xl justify-center items-center border border-slate-100"
              >
                <Minimize size={24} color="#64748b" />
              </TouchableOpacity>
            </View>
            <AttendanceMap
              latitude={office?.latitude}
              longitude={office?.longitude}
              radius={office?.radius}
              userLocation={userLocation}
              isFull={true}
            />
          </View>
        </Modal>

        {/* Shift Details */}
        <View className="px-6 mt-6">
          <View className="bg-slate-900 rounded-[32px] p-6 shadow-2xl shadow-slate-400">
            <View className="flex-row items-center mb-6">
              <View className="w-12 h-12 rounded-2xl bg-white/10 justify-center items-center border border-white/10">
                <Calendar size={24} color="white" />
              </View>
              <View className="ml-4 flex-1">
                <View className="flex-row justify-between items-center">
                  <Text className="text-slate-400 text-[10px] font-bold tracking-widest ">My Active Shift</Text>
                  {countdown && (
                    <View className="flex-row items-center gap-1.5 bg-white/5 px-2 py-1 rounded-lg">
                      <Text className="text-slate-500 text-[8px] font-bold ">{countdown.label}</Text>
                      <Text className={`text-[10px] font-bold ${countdown.color}`}>{countdown.time}</Text>
                    </View>
                  )}
                </View>
                <Text className="text-white text-xl font-bold mt-0.5">{userData?.shift?.name || 'Not Assigned'}</Text>
              </View>
            </View>
            <View className="flex-row justify-between pt-6 border-t border-white/10">
              <View>
                <Text className="text-slate-500 text-[10px] font-bold  mb-1">Starts</Text>
                <Text className="text-white font-bold text-lg">{convertTo12Hour(userData?.shift?.startTime) || '—'}</Text>
              </View>
              <View className="items-end">
                <Text className="text-slate-500 text-[10px] font-bold  mb-1">Ends</Text>
                <Text className="text-white font-bold text-lg">{convertTo12Hour(userData?.shift?.endTime) || '—'}</Text>
              </View>
            </View>
          </View>
        </View>

      </ScrollView>
    </View>
  );
};

export default DashboardScreen;
