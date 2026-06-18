import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import {
  ArrowLeft,
  Calendar,
  Camera,
  CheckCircle,
  ChevronRight,
  Clock,
  Coffee,
  Eye,
  MapPin,
  Maximize,
  Minimize,
  PlayCircle,
  RotateCcw,
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
import socket from '../socket';
import { formatWorkingHours } from '../utils/timeFormat';

const LOCATION_TRACKING_TASK = 'background-location-tracking';

const getISTDateString = (date) => {
  if (!date) return null;
  const d = new Date(date);
  if (isNaN(d.getTime())) return null;
  // Shift by 5.5 hours to represent it in IST (UTC +5:30)
  const istTime = new Date(d.getTime() + (5.5 * 60 * 60 * 1000));
  const year = istTime.getUTCFullYear();
  const month = String(istTime.getUTCMonth() + 1).padStart(2, '0');
  const day = String(istTime.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const AttendanceScreen = ({ navigation }) => {
  useEffect(() => {
    const fetchData = () => {
      getLocation();
      fetchUser();
      fetchHistory();
      fetchOfficeSettings();
      fetchLeaves();
    };

    fetchData();

    const unsubscribe = navigation.addListener('focus', () => {
      fetchData();
    });

    return unsubscribe;
  }, [navigation]);

  const [user, setUser] = useState(null);

  const [selfie, setSelfie] = useState(null);
  const [location, setLocation] = useState(null);
  const [locationLoading, setLocationLoading] = useState(true);
  const [punchLoading, setPunchLoading] = useState(false);

  const [todayAttendance, setTodayAttendance] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [history, setHistory] = useState([]);
  const [office, setOffice] = useState(null);
  const [distance, setDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [mapFull, setMapFull] = useState(false);
  const [previewImage, setPreviewImage] = useState(null);
  const [visibleLogs, setVisibleLogs] = useState(5);
  const [myLeaves, setMyLeaves] = useState([]);

  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });
  const [backendShiftStatus, setBackendShiftStatus] = useState(null);

  const alreadyPunchedIn = !!todayAttendance?.punchIn?.time;
  const alreadyPunchedOut = !!todayAttendance?.punchOut?.time;

  const fetchUser = async () => {
    try {
      const res = await api.get('/auth/me');
      const userData = res.data.data;
      setUser(userData);
      setTodayAttendance(res.data.todayAttendance || null);
      setBackendShiftStatus(res.data.shiftStatus || null);
      if (userData?._id) {
        socket.emit('join', userData._id);
        await AsyncStorage.setItem('userId', userData._id);
      }
    } catch (err) {
    }
  };

  const fetchLeaves = async () => {
    try {
      const res = await api.get('/leaves/my-leaves');
      setMyLeaves(res.data.data.data || []);
    } catch (err) { }
  };

  const fetchOfficeSettings = async () => {
    try {
      const res = await api.get('/settings/office');
      setOffice(res.data.data);
    } catch (err) {
    }
  };

  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371e3; // meters
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  useEffect(() => {
    if (location && office) {
      const d = calculateDistance(
        location.latitude,
        location.longitude,
        office.latitude,
        office.longitude
      );
      setDistance(d);
    }
  }, [location, office]);

  const getLocation = async () => {
    try {
      setLocationLoading(true);
      const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
      if (foregroundStatus !== 'granted') {
        setToast({ show: true, message: 'Location access required.', type: 'error' });
        setTimeout(() => setToast(prev => ({ ...prev, show: false })), 2000);
        return;
      }

      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      // Try geocoding for address
      let addr = 'Detecting address...';
      try {
        const MAPS_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
        const geoRes = await fetch(
          `https://maps.googleapis.com/maps/api/geocode/json?latlng=${loc.coords.latitude},${loc.coords.longitude}&key=${MAPS_KEY}`
        );
        const geoData = await geoRes.json();
        if (geoData.status === 'OK' && geoData.results.length > 0) {
          addr = geoData.results[0].formatted_address;
        } else {
          const geocode = await Location.reverseGeocodeAsync({
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
          });
          if (geocode[0]) {
            const g = geocode[0];
            addr = `${g.name || ''}, ${g.street || ''}, ${g.city || ''}, ${g.region || ''}`;
          }
        }
      } catch (e) {
        const geocode = await Location.reverseGeocodeAsync({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        });
        if (geocode[0]) {
          const g = geocode[0];
          addr = `${g.city || ''}, ${g.region || ''}`;
        }
      }

      setLocation({
        ...loc.coords,
        address: addr,
      });
    } catch (err) {
      setToast({ show: true, message: 'Could not detect location.', type: 'error' });
      setTimeout(() => setToast(prev => ({ ...prev, show: false })), 2000);
    } finally {
      setLocationLoading(false);
    }
  };

  const fetchHistory = async () => {
    try {
      setHistoryLoading(true);
      const res = await api.get('/attendance/history');
      const records = res.data.data || [];
      setHistory(records);
    } catch (err) {
    } finally {
      setHistoryLoading(false);
    }
  };

  // Ensure attendance/complete day status is based on the current date
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  // Use todayStr for filtering/comparing attendance records
  // Example usage:
  // const isDayComplete = attendanceRecords.some(record => record.date === todayStr && record.status === 'Present');
  const getShiftStatus = () => {
    if (!user || !user.shift) return { allowed: true };

    const now = new Date();
    const [sHour, sMin] = user.shift.startTime.split(':').map(Number);

    const start = new Date();
    start.setHours(sHour, sMin, 0, 0);

    // Punch in allowed from 1 hour before shift start
    const punchInAllowedStart = new Date(start.getTime() - 60 * 60 * 1000);

    // EXCEPTION: New employees (created within last 48h) can punch in anytime
    const joinDate = new Date(user.createdAt);
    const isNewEmployee = (now - joinDate) < (48 * 60 * 60 * 1000);

    // ── 1. Weekly Off Check (Dynamic) ──
    const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const currentDayName = daysOfWeek[now.getDay()];
    const isWeeklyOff = (office?.weeklyOffs || ['Sunday']).includes(currentDayName);
    if (isWeeklyOff) {
      return { allowed: false, status: 'Weekly Off', message: `Rest Day (${currentDayName})` };
    }

    // ── 2. Approved Leave Check ──
    const today = getISTDateString(now);
    const todayLeave = myLeaves.find(l => {
      const start = getISTDateString(l.startDate);
      const end = getISTDateString(l.endDate);
      return l.status === 'Approved' && today >= start && today <= end;
    });

    if (todayLeave) {
      if (todayLeave.duration === 'Full Day') {
        return { allowed: false, status: 'On Leave', message: 'Approved Leave (Today)' };
      }
      // For half-day, we still allow the button for the remaining half
    }

    if (alreadyPunchedIn && alreadyPunchedOut) {
      return { allowed: false, status: 'Completed', message: 'Attendance Complete' };
    }

    if (!isNewEmployee && now < punchInAllowedStart) {
      return {
        allowed: false,
        status: 'Upcoming',
        message: 'Upcoming Shift',
      };
    }

    // ── 3. Shift Ended Check ──
    const [eHour, eMin] = user.shift.endTime.split(':').map(Number);
    const end = new Date();
    end.setHours(eHour, eMin, 0, 0);

    const isNight = eHour < sHour || (eHour === sHour && eMin < sMin);
    if (isNight) {
      if (now.getHours() > sHour || (now.getHours() === sHour && now.getMinutes() >= sMin)) {
        if (eHour <= sHour) end.setDate(end.getDate() + 1);
      } else if (now.getHours() < eHour || (now.getHours() === eHour && now.getMinutes() < eMin)) {
        start.setDate(start.getDate() - 1);
      }
    }

    if (!alreadyPunchedIn && !isNewEmployee && now >= start && now > end) {
      return {
        allowed: false,
        status: 'Ended',
        message: 'Shift Ended',
      };
    }

    return { allowed: true, isNewEmployee };
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await getLocation();
    await fetchUser();
    await fetchHistory();
    await fetchOfficeSettings();
    setRefreshing(false);
  };

  // Background Tracking Effect
  useEffect(() => {
    const manageBackground = async () => {
      try {
        const { status: fg } = await Location.requestForegroundPermissionsAsync();
        const { status: bg } = await Location.requestBackgroundPermissionsAsync();
        if (fg === 'granted' && bg === 'granted' && alreadyPunchedIn && !alreadyPunchedOut) {
          await Location.startLocationUpdatesAsync(LOCATION_TRACKING_TASK, {
            accuracy: Location.Accuracy.High,
            timeInterval: 10000,
            distanceInterval: 5,
            foregroundService: {
              notificationTitle: "Geo-Track HRMS",
              notificationBody: "Tracking active until punch out",
              notificationColor: "#4f46e5"
            }
          });
        } else {
          const hasStarted = await Location.hasStartedLocationUpdatesAsync(LOCATION_TRACKING_TASK);
          if (hasStarted) await Location.stopLocationUpdatesAsync(LOCATION_TRACKING_TASK);
        }
      } catch (err) {
      }
    };
    manageBackground();
  }, [alreadyPunchedIn, alreadyPunchedOut]);

  // Enterprise Foreground Tracking (LocationService + SyncService)
  useEffect(() => {
    let isActive = false;

    const startEnterpriseTracking = async () => {
      if (isActive) return;
      isActive = true;

      try {
        const { startTracking } = require('../services/tracking.service');
        const { startSyncLoop } = require('../services/sync.service');

        // Use attendance record ID as trip ID
        const tripId = todayAttendance?._id || `trip-${Date.now()}`;

        // Start GPS collection (writes to SQLite)
        const started = await startTracking(tripId, (point) => {
          // Update local map when a valid point is collected
          if (point) {
            setLocation(prev => ({
              ...prev,
              latitude: point.latitude,
              longitude: point.longitude,
              accuracy: point.accuracy
            }));
          }
        });

        if (started) {
          // Start background sync loop (SQLite → Server)
          startSyncLoop();
          console.log('[AttendanceScreen] Enterprise tracking pipeline active');
        }
      } catch (err) {
        console.warn('[AttendanceScreen] Enterprise tracking start error:', err.message);
        
        // Fallback: use legacy offlineQueue if enterprise services fail
        const { addPointToQueue, syncQueue } = require('../utils/offlineQueue');
        const fallbackTrack = async () => {
          try {
            const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High, timeout: 8000 });
            const { latitude, longitude, accuracy, speed, heading, altitude, mocked } = loc.coords;
            await addPointToQueue({ latitude, longitude, accuracy, speed: speed || 0, heading, altitude, isMock: mocked, timestamp: Date.now() });
            await syncQueue();
            setLocation(prev => ({ ...prev, latitude, longitude, accuracy }));
          } catch (e) {}
        };
        fallbackTrack();
        const fallbackInterval = setInterval(fallbackTrack, 5000);
        return () => clearInterval(fallbackInterval);
      }
    };

    const stopEnterpriseTracking = async () => {
      try {
        const { stopTracking } = require('../services/tracking.service');
        const { stopSyncLoop, forceSyncAll } = require('../services/sync.service');
        
        // Force sync all remaining points before stopping
        await forceSyncAll();
        stopTracking();
        stopSyncLoop();
        console.log('[AttendanceScreen] Enterprise tracking pipeline stopped');
      } catch (err) {
        console.warn('[AttendanceScreen] Enterprise tracking stop error:', err.message);
      }
      isActive = false;
    };

    if (alreadyPunchedIn && !alreadyPunchedOut) {
      startEnterpriseTracking();
    }

    return () => {
      if (isActive) {
        stopEnterpriseTracking();
      }
    };
  }, [alreadyPunchedIn, alreadyPunchedOut]);

  const takeSelfie = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        setToast({ show: true, message: 'Camera access is required for verification.', type: 'error' });
        setTimeout(() => setToast(prev => ({ ...prev, show: false })), 2000);
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: 'images',
        allowsEditing: false,
        quality: 0.8, // Sharp native clarity with subtle compression
        base64: true,
        cameraType: 'front',       // Default to front camera for selfie verification
        preferFrontCamera: true,   // Android fallback hint
      });

      if (!result.canceled) {
        setSelfie(result.assets[0]);
      }
    } catch (err) {
      setToast({ show: true, message: `Failed to take selfie: ${err.message || 'Unknown error'}`, type: 'error' });
      setTimeout(() => setToast(prev => ({ ...prev, show: false })), 2000);
    }
  };

  const handlePunchIn = async () => {
    if (!location) {
      setToast({ show: true, message: 'Please wait for your location to be detected.', type: 'error' });
      setTimeout(() => setToast(prev => ({ ...prev, show: false })), 2000);
      return;
    }
    if (!selfie) {
      setToast({ show: true, message: 'Selfie is required for verification.', type: 'error' });
      setTimeout(() => setToast(prev => ({ ...prev, show: false })), 2000);
      return;
    }

    setPunchLoading(true);
    try {
      const res = await api.post('/attendance/punch-in', {
        latitude: location.latitude,
        longitude: location.longitude,
        address: location.address,
        selfie: selfie?.base64 ? `data:image/jpeg;base64,${selfie.base64}` : 'skipped',
      });

      setTodayAttendance(res.data.data);
      setSelfie(null); // Clear selfie after punch
      await fetchHistory();
      setToast({ show: true, message: 'Punched In successfully!', type: 'success' });
      setTimeout(() => {
        setToast(prev => ({ ...prev, show: false }));
        navigation.navigate('Main');
      }, 1500);
    } catch (err) {
      setToast({ show: true, message: err.response?.data?.message || 'Could not punch in. Please try again.', type: 'error' });
      setTimeout(() => setToast(prev => ({ ...prev, show: false })), 2000);
    } finally {
      setPunchLoading(false);
    }
  };

  const handlePunchOut = async () => {
    if (!location) {
      setToast({ show: true, message: 'Please wait for your location to be detected.', type: 'error' });
      setTimeout(() => setToast(prev => ({ ...prev, show: false })), 2000);
      return;
    }

    Alert.alert('Confirm Punch Out', 'Are you sure you want to end your shift?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Punch Out',
        style: 'destructive',
        onPress: async () => {
          if (!selfie) {
            setToast({ show: true, message: 'Selfie is required for verification.', type: 'error' });
            setTimeout(() => setToast(prev => ({ ...prev, show: false })), 2000);
            return;
          }

          setPunchLoading(true);
          try {
            const res = await api.post('/attendance/punch-out', {
              latitude: location.latitude,
              longitude: location.longitude,
              address: location.address,
              selfie: selfie?.base64 ? `data:image/jpeg;base64,${selfie.base64}` : 'skipped',
            });

            setTodayAttendance(res.data.data);
            setSelfie(null); // Clear selfie after punch
            await fetchHistory();
            setToast({ show: true, message: 'Punched Out successfully!', type: 'success' });
            setTimeout(() => {
              setToast(prev => ({ ...prev, show: false }));
              navigation.navigate('Main');
            }, 1500);
          } catch (err) {
            setToast({ show: true, message: err.response?.data?.message || 'Could not punch out. Please try again.', type: 'error' });
            setTimeout(() => setToast(prev => ({ ...prev, show: false })), 2000);
          } finally {
            setPunchLoading(false);
          }
        },
      },
    ]);
  };

  const handleToggleBreak = async () => {
    try {
      setPunchLoading(true);
      const res = await api.post('/attendance/break');
      setTodayAttendance(res.data.data);
      setToast({ show: true, message: res.data.message || 'Break updated', type: 'success' });
      setTimeout(() => setToast(prev => ({ ...prev, show: false })), 2000);
    } catch (err) {
      setToast({ show: true, message: err.response?.data?.message || 'Could not toggle break.', type: 'error' });
      setTimeout(() => setToast(prev => ({ ...prev, show: false })), 2000);
    } finally {
      setPunchLoading(false);
    }
  };

  return (
    <View className="flex-1 bg-slate-50">
      <StatusBar barStyle="dark-content" />

      {/* Header */}
      <View className="pt-14 px-6 pb-5 bg-blue-600 border-b border-slate-100 flex-row justify-between items-center">
        <View className="flex-row items-center">
          <TouchableOpacity
            className="w-10 h-10 rounded-xl bg-slate-50 justify-center items-center border border-slate-100 mr-4"
            onPress={() => navigation.navigate('Home')}
          >
            <ArrowLeft size={20} color="#64748b" />
          </TouchableOpacity>
          <View>
            <Text className="text-2xl font-extrabold text-white tracking-tight">Attendance</Text>
            <Text className="text-white font-bold text-xs">Verify location to mark</Text>
          </View>
        </View>
        <TouchableOpacity
          onPress={onRefresh}
          className="w-10 h-10 rounded-xl bg-slate-50 justify-center items-center border border-slate-100"
        >
          <RotateCcw size={18} color="#64748b" />
        </TouchableOpacity>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 24, paddingBottom: 110 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#4f46e5']} />
        }
      >
        {/* Today Status Card */}
        {todayAttendance && (
          <View className="bg-white w-full rounded-3xl p-4 border border-slate-100 mb-5 shadow-sm">
            <View className="flex-row justify-between items-center mb-3">
              <Text className="text-[10px] font-bold text-slate-400 tracking-widest ">Today's Record</Text>
              {todayAttendance.status && (
                <View className={`px-2 py-0.5 rounded-md ${todayAttendance.status === 'Late' ? 'bg-amber-50' : todayAttendance.status === 'Half Day' ? 'bg-orange-50' : 'bg-emerald-50'}`}>
                  <Text className={`text-[8px] font-bold ${todayAttendance.status === 'Late' ? 'text-amber-600' : todayAttendance.status === 'Half Day' ? 'text-orange-600' : 'text-emerald-600'}`}>{todayAttendance.status}</Text>
                </View>
              )}
            </View>
            <View className="flex-row justify-between items-center py-2 border-t border-slate-50">
              <View className="items-start flex-1">
                <Text className="text-[8px] font-bold text-slate-400 ">In</Text>
                <Text className="text-sm font-bold text-slate-800">{todayAttendance.punchIn?.time ? new Date(todayAttendance.punchIn.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}</Text>
              </View>
              <View className="items-center flex-1">
                <Text className="text-[8px] font-bold text-slate-400 ">Worked</Text>
                <Text className="text-sm font-bold text-slate-800">
                  {formatWorkingHours(
                    todayAttendance.punchOut?.time
                      ? todayAttendance.workingHours
                      : (new Date() - new Date(todayAttendance.punchIn?.time) - (todayAttendance.breaks?.reduce((acc, b) => acc + (b.duration || 0), 0) * 60000)) / 3600000
                  )}
                </Text>
              </View>
              <View className="items-center flex-1">
                <View className="flex-row items-center">
                  <Text className="text-[8px] font-bold text-slate-400 ">Break</Text>
                  <View className="ml-1 px-1 bg-amber-50 rounded">
                    <Text className="text-[6px] font-bold text-amber-600">{todayAttendance.breaks?.length || 0}</Text>
                  </View>
                </View>
                <Text className="text-sm font-bold text-amber-600">
                  {Math.floor((todayAttendance.breaks?.reduce((acc, b) => acc + (b.duration || 0), 0) || 0) / 60)}h {(todayAttendance.breaks?.reduce((acc, b) => acc + (b.duration || 0), 0) || 0) % 60}m
                </Text>
              </View>
              <View className="items-end flex-1">
                <Text className="text-[8px] font-bold text-slate-400 ">Out</Text>
                <Text className="text-sm font-bold text-slate-800">{todayAttendance.punchOut?.time ? new Date(todayAttendance.punchOut.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}</Text>
              </View>
            </View>

            {alreadyPunchedIn && !alreadyPunchedOut && (
              <TouchableOpacity
                onPress={handleToggleBreak}
                activeOpacity={0.8}
                className={`mt-4 h-14 rounded-2xl flex-row justify-center items-center border ${todayAttendance.breaks?.some(b => !b.endTime) ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}
              >
                {todayAttendance.breaks?.some(b => !b.endTime) ? (
                  <>
                    <PlayCircle size={20} color="#10b981" />
                    <Text className="ml-3 font-bold text-emerald-600">END BREAK SESSION</Text>
                  </>
                ) : (
                  <>
                    <Coffee size={20} color="#f59e0b" />
                    <Text className="ml-3 font-bold text-amber-600">START BREAK SESSION</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Location Card */}
        <View className="bg-white rounded-3xl p-5 border border-slate-100 mb-5 shadow-sm">
          <View className="flex-row items-center">
            <View className="w-12 h-12 rounded-2xl bg-indigo-50 justify-center items-center">
              <MapPin size={22} color="#4f46e5" />
            </View>
            <View className="ml-4 flex-1">
              <Text className="text-[10px] font-bold text-slate-400 tracking-widest">YOUR LOCATION</Text>
              {locationLoading ? (
                <ActivityIndicator size="small" color="#4f46e5" style={{ marginTop: 4 }} />
              ) : location ? (
                <>
                  <Text className="text-base font-bold text-slate-800 mt-0.5" numberOfLines={1}>{location.address}</Text>
                  <View className="flex-row items-center mt-1">
                    {office && distance <= office.radius ? (
                      <>
                        <CheckCircle size={12} color="#10b981" />
                        <Text className="text-xs font-bold text-emerald-600 ml-1">In Office Range</Text>
                      </>
                    ) : office ? (
                      <>
                        <X size={12} color="#f43f5e" />
                        <Text className="text-xs font-bold text-rose-500 ml-1">Outside Office Range</Text>
                      </>
                    ) : (
                      <>
                        <CheckCircle size={12} color="#10b981" />
                        <Text className="text-xs font-bold text-emerald-600 ml-1">Location Detected</Text>
                      </>
                    )}
                  </View>
                </>
              ) : (
                <Text className="text-sm font-bold text-rose-500 mt-0.5">Location unavailable</Text>
              )}
            </View>
            <View className="flex-row items-center gap-2">
              <TouchableOpacity onPress={getLocation} className="p-2">
                <RotateCcw size={16} color="#4f46e5" />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setMapFull(true)} className="p-2">
                <Maximize size={16} color="#4f46e5" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Interactive Map */}
          <View className="h-72 w-full mt-5 rounded-2xl overflow-hidden border border-slate-100">
            <AttendanceMap
              latitude={office?.latitude}
              longitude={office?.longitude}
              radius={office?.radius}
              userLocation={location}
              geofenceEnabled={office?.geofenceEnabled}
            />
          </View>
        </View>

        {/* Selfie Section - only if punch action is pending */}
        {!alreadyPunchedOut && selfie && (
          <View className="mb-6">
            <View className="flex-row justify-between items-center mb-3">
              <Text className="text-[10px] font-bold text-slate-400 tracking-widest">IDENTITY VERIFICATION</Text>
              <View className="bg-amber-50 px-2 py-0.5 rounded-md border border-amber-100">
                <Text className="text-[9px] font-bold text-amber-600 ">Recommended</Text>
              </View>
            </View>
            <TouchableOpacity
              className="h-56 bg-white rounded-3xl border-2 border-dashed border-emerald-200 bg-emerald-50/10 justify-center items-center overflow-hidden"
              onPress={takeSelfie}
              activeOpacity={0.8}
            >
              <View className="w-full h-full relative">
                <Image source={{ uri: selfie.uri }} className="w-full h-full" resizeMode="cover" />
                <View className="absolute bottom-4 right-4 bg-emerald-500 w-8 h-8 rounded-full justify-center items-center border-2 border-white">
                  <CheckCircle size={16} color="white" />
                </View>
                <View className="absolute top-4 left-4 right-4 flex-row justify-between">
                  <TouchableOpacity
                    onPress={() => setPreviewImage(selfie.uri)}
                    className="bg-black/40 px-3 py-1.5 rounded-full flex-row items-center gap-1"
                  >
                    <Eye size={12} color="white" />
                    <Text className="text-white text-[10px] font-bold">Preview</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setSelfie(null)}
                    className="bg-rose-500/80 px-3 py-1.5 rounded-full flex-row items-center gap-1"
                  >
                    <X size={12} color="white" />
                    <Text className="text-white text-[10px] font-bold">Cancel</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableOpacity>
          </View>
        )}


        {/* Action Button */}
        {(() => {
          const activeShiftStatus = (backendShiftStatus && !backendShiftStatus.allowed) ? backendShiftStatus : getShiftStatus();
          if (alreadyPunchedOut || !activeShiftStatus.allowed) {
            const isUpcoming = activeShiftStatus.status === 'Upcoming';

            return (
              <View className={`rounded-3xl p-8 items-center border ${isUpcoming ? 'bg-indigo-50 border-indigo-100' : 'bg-slate-100 border-slate-200'}`}>
                <View className={`w-16 h-16 rounded-full justify-center items-center mb-4 ${isUpcoming ? 'bg-indigo-100' : 'bg-emerald-100'}`}>
                  {isUpcoming ? (
                    <Clock size={32} color="#4f46e5" />
                  ) : (
                    <CheckCircle size={32} color="#10b981" />
                  )}
                </View>
                <Text className={`font-extrabold text-lg ${isUpcoming ? 'text-indigo-900' : 'text-slate-800'}`}>
                  {alreadyPunchedOut ? 'Attendance Complete' : activeShiftStatus.message}
                </Text>
                <Text className="text-slate-500 font-bold text-sm mt-1 text-center">
                  {alreadyPunchedOut
                    ? 'You have finished your shift for today.'
                    : isUpcoming
                      ? `Shift starts at ${user?.shift?.startTime}. Please check back 1 hour before.`
                      : (activeShiftStatus.detail || 'The cutoff time for this shift has passed.')}
                </Text>
              </View>
            );
          }

          return (
            <TouchableOpacity
              className={`h-18 rounded-2xl justify-center items-center shadow-lg ${alreadyPunchedIn
                ? 'bg-rose-500 shadow-rose-200'
                : location
                  ? 'bg-indigo-600 shadow-indigo-200'
                  : 'bg-slate-200'
                }`}
              style={{ height: 64 }}
              onPress={() => {
                if (!selfie) {
                  takeSelfie();
                } else {
                  if (alreadyPunchedIn) {
                    handlePunchOut();
                  } else {
                    handlePunchIn();
                  }
                }
              }}
              disabled={punchLoading || locationLoading || (!alreadyPunchedIn && !location)}
              activeOpacity={0.85}
            >
              {punchLoading ? (
                <ActivityIndicator color="white" />
              ) : (
                <View className="flex-row items-center">
                  <Text className="text-white font-bold text-lg">
                    {alreadyPunchedIn ? (selfie ? 'Save & Punch Out' : 'Punch Out Now') : (selfie ? 'Save & Punch In' : 'Punch In Now')}
                  </Text>
                  <ChevronRight size={20} color="white" className="ml-2" />
                </View>
              )}
            </TouchableOpacity>
          );
        })()}

        {/* Attendance History */}
        {history.length > 0 && (
          <View className="mt-10">
            <View className="flex-row justify-between items-center mb-6">
              <Text className="text-slate-900 font-bold text-sm ml-2 tracking-widest ">Detailed Attendance Logs</Text>
              <TouchableOpacity
                onPress={fetchHistory}
                className="w-10 h-10 rounded-xl bg-white justify-center items-center border border-slate-100 shadow-sm"
              >
                <RotateCcw size={16} color="#4f46e5" />
              </TouchableOpacity>
            </View>

            {history
              .filter(item => item.status !== 'Absent')
              .slice(0, visibleLogs)
              .map((item, index) => (
                <View key={index} className="bg-white rounded-3xl p-4 border border-slate-100 mb-4 shadow-sm">
                  <View className="flex-row justify-between items-center mb-3">
                    <View className="flex-row items-center gap-3">
                      <View className="w-10 h-10 rounded-xl bg-slate-50 items-center justify-center border border-slate-100">
                        <Calendar size={18} color="#64748b" />
                      </View>
                      <View>
                        <Text className="text-xs font-bold text-slate-900">
                          {new Date(item.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </Text>
                        <View className="flex-row items-center gap-2 mt-0.5">
                          <Clock size={10} color="#94a3b8" />
                          <Text className="text-[10px] font-bold text-slate-400">
                            {item.punchIn?.time
                              ? new Date(item.punchIn.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                              : '--:--'}
                          </Text>
                        </View>
                      </View>
                    </View>
                    <View className={`px-2 py-1 rounded-lg ${item.status === 'Late' ? 'bg-amber-50 text-amber-600' : item.status === 'Half Day' ? 'bg-orange-50 text-orange-600' : 'bg-emerald-50 text-emerald-600'}`}>
                      <Text className="text-[10px] font-bold">{item.status || 'Present'}</Text>
                    </View>
                  </View>

                  <View className="flex-row border-y border-slate-50 py-2 mb-3">
                    <View className="flex-1 items-start border-r border-slate-50">
                      <Text className="text-[8px] font-bold text-slate-400 ">In</Text>
                      <Text className="text-slate-800 font-bold text-xs">{item.punchIn?.time ? new Date(item.punchIn.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}</Text>
                    </View>
                    <View className="flex-1 items-center border-r border-slate-50">
                      <Text className="text-[8px] font-bold text-slate-400 ">Out</Text>
                      <Text className="text-slate-800 font-bold text-xs">{item.punchOut?.time ? new Date(item.punchOut.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}</Text>
                    </View>
                    <View className="flex-1 items-center border-r border-slate-50">
                      <Text className="text-[8px] font-bold text-slate-400 ">Worked</Text>
                      <Text className="text-emerald-600 font-bold text-xs">{formatWorkingHours(item.workingHours || 0)}</Text>
                    </View>
                    <View className="flex-1 items-center border-r border-slate-50">
                      <Text className="text-[8px] font-bold text-slate-400 ">Dist</Text>
                      <Text className="text-indigo-600 font-bold text-xs">{(item.distance || 0).toFixed(2)}km</Text>
                    </View>
                    <View className="flex-1 items-end">
                      <View className="flex-row items-center">
                        <Text className="text-[8px] font-bold text-slate-400 ">Break</Text>
                        <View className="ml-1 px-1 bg-amber-50 rounded">
                          <Text className="text-[6px] font-bold text-amber-600">{item.breaks?.length || 0}</Text>
                        </View>
                      </View>
                      <Text className="text-amber-600 font-bold text-xs">
                        {Math.floor((item.breaks?.reduce((acc, b) => acc + (b.duration || 0), 0) || 0) / 60)}h {(item.breaks?.reduce((acc, b) => acc + (b.duration || 0), 0) || 0) % 60}m
                      </Text>
                    </View>
                  </View>

                  <View className="flex-row gap-2">
                    {/* Punch In */}
                    <View className="flex-1 bg-slate-50 rounded-xl p-2 border border-slate-100">
                      <View className="flex-row justify-between items-center mb-2">
                        <Text className="text-[7px] font-bold text-indigo-600 ">Punch In</Text>
                        <View className={`px-1.5 py-0.5 rounded-md ${item.punchIn?.isOutside ? 'bg-rose-100' : 'bg-emerald-100'}`}>
                          <Text className={`text-[6px] font-bold ${item.punchIn?.isOutside ? 'text-rose-600' : 'text-emerald-600'}`}>
                            {item.punchIn?.isOutside ? 'OUTSIDE' : 'INSIDE'}
                          </Text>
                        </View>
                      </View>
                      <TouchableOpacity
                        onPress={() => item.punchIn?.selfie && setPreviewImage(item.punchIn.selfie)}
                        activeOpacity={0.9}
                        className="h-24 rounded-lg bg-white overflow-hidden border border-slate-100 mb-2"
                      >
                        {item.punchIn?.selfie ? (
                          <>
                            <Image source={{ uri: item.punchIn.selfie }} className="w-full h-full" resizeMode="cover" />
                            <View className="absolute top-1 right-1 bg-white/90 p-1 rounded-md shadow-sm">
                              <Eye size={10} color="#4f46e5" />
                            </View>
                          </>
                        ) : (
                          <View className="w-full h-full justify-center items-center">
                            <Camera size={14} color="#cbd5e1" />
                          </View>
                        )}
                      </TouchableOpacity>
                      <View className="flex-row items-start">
                        <MapPin size={8} color="#64748b" style={{ marginTop: 2 }} />
                        <Text className="text-[7px] font-bold text-slate-500 ml-1 leading-3 flex-1">
                          {item.punchIn?.location?.address || 'No location address available'}
                        </Text>
                      </View>
                    </View>

                    {/* Punch Out */}
                    <View className="flex-1 bg-slate-50 rounded-xl p-2 border border-slate-100">
                      <View className="flex-row justify-between items-center mb-2">
                        <Text className="text-[7px] font-bold text-rose-500 ">Punch Out</Text>
                        <View className={`px-1.5 py-0.5 rounded-md ${item.punchOut?.isOutside ? 'bg-rose-100' : 'bg-emerald-100'}`}>
                          <Text className={`text-[6px] font-bold ${item.punchOut?.isOutside ? 'text-rose-600' : 'text-emerald-600'}`}>
                            {item.punchOut?.isOutside ? 'OUTSIDE' : 'INSIDE'}
                          </Text>
                        </View>
                      </View>
                      <TouchableOpacity
                        onPress={() => item.punchOut?.selfie && setPreviewImage(item.punchOut.selfie)}
                        activeOpacity={0.9}
                        className="h-24 rounded-lg bg-white overflow-hidden border border-slate-100 mb-2"
                      >
                        {item.punchOut?.selfie ? (
                          <>
                            <Image source={{ uri: item.punchOut.selfie }} className="w-full h-full" resizeMode="cover" />
                            <View className="absolute top-1 right-1 bg-white/90 p-1 rounded-md shadow-sm">
                              <Eye size={10} color="#f43f5e" />
                            </View>
                          </>
                        ) : (
                          <View className="w-full h-full justify-center items-center">
                            <Camera size={14} color="#cbd5e1" />
                          </View>
                        )}
                      </TouchableOpacity>
                      <View className="flex-row items-start">
                        <MapPin size={8} color="#64748b" style={{ marginTop: 2 }} />
                        <Text className="text-[7px] font-bold text-slate-500 ml-1 leading-3 flex-1">
                          {item.punchOut?.location?.address || 'No location address available'}
                        </Text>
                      </View>
                    </View>
                  </View>
                </View>
              ))}

            {history.length > visibleLogs && (
              <TouchableOpacity
                onPress={() => setVisibleLogs(prev => prev + 5)}
                className="mt-4 py-3 bg-white rounded-2xl border border-slate-100 items-center shadow-sm"
              >
                <Text className="text-indigo-600 font-bold text-xs  tracking-widest">Load More History</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </ScrollView>

      {/* Full Screen Image Preview Modal */}
      <Modal visible={!!previewImage} transparent={true} animationType="fade">
        <View className="flex-1 bg-black/90 justify-center items-center">
          <TouchableOpacity
            onPress={() => setPreviewImage(null)}
            className="absolute top-14 right-6 w-12 h-12 bg-white/10 rounded-2xl justify-center items-center border border-white/20"
          >
            <X size={24} color="white" />
          </TouchableOpacity>
          <Image source={{ uri: previewImage }} className="w-full h-[70%] rounded-3xl" resizeMode="contain" />
          <View className="absolute bottom-14 bg-white/10 px-6 py-3 rounded-2xl border border-white/20">
            <Text className="text-white font-bold text-sm">Selfie Verification Proof</Text>
          </View>
        </View>
      </Modal>

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
            userLocation={location}
            geofenceEnabled={office?.geofenceEnabled}
            isFull={true}
          />
        </View>
      </Modal>

      {/* Bottom Toast Notification */}
      {toast.show && (
        <View className={`absolute bottom-10 left-6 right-6 p-4 rounded-2xl shadow-2xl flex-row items-center border ${toast.type === 'success' ? 'bg-emerald-500 border-emerald-400' : 'bg-rose-500 border-rose-400'}`}>
          <Text className="text-white font-bold text-sm text-center flex-1">{toast.message}</Text>
        </View>
      )}
    </View>
  );
};

export default AttendanceScreen;
