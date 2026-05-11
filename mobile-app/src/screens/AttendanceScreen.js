import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import {
  ArrowLeft,
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
  View,
} from 'react-native';
import api from '../api/axios';
import AttendanceMap from '../components/AttendanceMap';
import { formatWorkingHours } from '../utils/timeFormat';


const AttendanceScreen = ({ navigation }) => {
  useEffect(() => {
    getLocation();
    fetchUser();
    fetchHistory();
    fetchOfficeSettings();
  }, []);

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


  const fetchUser = async () => {
    try {
      const res = await api.get('/auth/me');
      setUser(res.data.data);
    } catch (err) {
      console.error('[DEBUG] fetchUser Error:', err.message);
    }
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
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
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
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Location access is required to mark attendance.');
        setLocationLoading(false);
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const { latitude, longitude } = loc.coords;

      // Use Google Geocoding API for a full, accurate address
      let addr = 'Current Location';
      try {
        const MAPS_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
        const geoRes = await fetch(
          `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${MAPS_KEY}`
        );
        const geoData = await geoRes.json();
        if (geoData.status === 'OK' && geoData.results.length > 0) {
          // First result is always the most precise (street-level)
          addr = geoData.results[0].formatted_address;
        } else {
          // Fallback: expo-location reverse geocode
          const geocode = await Location.reverseGeocodeAsync({ latitude, longitude });
          if (geocode[0]) {
            const g = geocode[0];
            const parts = [
              g.streetNumber,
              g.street,
              g.district || g.subregion,
              g.city,
              g.region,
              g.postalCode,
              g.country,
            ].filter(Boolean);
            addr = parts.join(', ');
          }
        }
      } catch (geoErr) {
        const geocode = await Location.reverseGeocodeAsync({ latitude, longitude });
        if (geocode[0]) {
          const g = geocode[0];
          addr = [g.streetNumber, g.street, g.city, g.region, g.postalCode].filter(Boolean).join(', ');
        }
      }

      setLocation({ latitude, longitude, address: addr });
    } catch (err) {
      Alert.alert('Location Error', 'Could not fetch your location. Please try again.');
    } finally {
      setLocationLoading(false);
    }
  };

  const getShiftStatus = () => {
    if (!user?.shift) return { allowed: true };
    const now = new Date();
    const [sHour, sMin] = user.shift.startTime.split(':').map(Number);
    const [eHour, eMin] = user.shift.endTime.split(':').map(Number);

    const start = new Date(now);
    start.setHours(sHour, sMin, 0, 0);

    const end = new Date(now);
    end.setHours(eHour, eMin, 0, 0);
    // If it's a night shift and ends in the morning, roll over to tomorrow
    if (user.shift.isNightShift && eHour < 12) {
      end.setDate(end.getDate() + 1);
    }



    // 1. If already fully completed (punched in AND out)
    if (alreadyPunchedIn && alreadyPunchedOut) {
      return { allowed: false, status: 'Completed', message: 'Attendance Complete' };
    }

    // 2. If currently punched in but not out (Allowed to punch out)
    if (alreadyPunchedIn && !alreadyPunchedOut) return { allowed: true };

    // 3. Shift hasn't started yet (More than 1 hour before start)
    if (now < new Date(start.getTime() - 3600000)) {
      return { allowed: false, status: 'Upcoming', message: 'Shift Not Started' };
    }

    // 4. Shift has already ended completely
    if (now > end) {
      return { allowed: false, status: 'Missed', message: 'Shift Ended' };
    }

    // 5. Otherwise, allow punch-in (even if late/half-day)
    return { allowed: true };
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await getLocation();
    await fetchUser();
    await fetchHistory();
    await fetchOfficeSettings();
    setRefreshing(false);
  };


  const [lastSentLocation, setLastSentLocation] = useState(null);

  // Foreground Tracking Logic
  useEffect(() => {
    let trackingInterval;

    if (alreadyPunchedIn && !alreadyPunchedOut) {

      trackingInterval = setInterval(async () => {
        try {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
          const { latitude, longitude } = loc.coords;

          // Optimization: Only send if moved significantly (> 2 meters approx)
          if (lastSentLocation) {
            const dist = Math.sqrt(Math.pow(latitude - lastSentLocation.lat, 2) + Math.pow(longitude - lastSentLocation.lng, 2));
            if (dist < 0.00002) { // Roughly 2 meters
              return;
            }
          }

          // Quick geocode
          let trackAddr = 'Tracking...';
          const MAPS_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
          const geoRes = await fetch(
            `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${MAPS_KEY}`
          );
          const geoData = await geoRes.json();
          if (geoData.status === 'OK' && geoData.results.length > 0) {
            trackAddr = geoData.results[0].formatted_address;
          }


          await api.post('/attendance/track', {
            latitude,
            longitude,
            address: trackAddr
          });

          setLastSentLocation({ lat: latitude, lng: longitude });
          fetchUser(); // Update UI distance
        } catch (err) {
        }
      }, 10000); // 10 SECONDS AS REQUESTED
    }

    return () => {
      if (trackingInterval) {

        clearInterval(trackingInterval);
      }
    };
  }, [alreadyPunchedIn, alreadyPunchedOut, lastSentLocation]);

  const fetchHistory = async () => {
    try {
      setHistoryLoading(true);
      const res = await api.get('/attendance/history');
      const records = res.data.data || [];

      setHistory(records);

      // 1. Look for active session (must have a punch in time and no punch out)
      let currentSession = records.find(r => r.punchIn?.time && !r.punchOut?.time);

      // 2. If no active session, find the most recent record for today
      if (!currentSession && records.length > 0) {
        const now = new Date();
        const todayStr = now.toISOString().split('T')[0];

        currentSession = records.find(r => {
          if (!r.punchIn?.time) return false;
          // Check if record date matches today (UTC normalization)
          const rDate = r.date ? new Date(r.date).toISOString().split('T')[0] : null;
          // Check if punch out happened today
          const pOutDate = r.punchOut?.time ? new Date(r.punchOut.time).toISOString().split('T')[0] : null;

          return rDate === todayStr || pOutDate === todayStr;
        });
      }

      // 3. Final safety check: If the found session is just an 'Absent' placeholder, ignore it
      if (currentSession && currentSession.status === 'Absent') {

        currentSession = null;
      }

      setTodayAttendance(currentSession || null);
    } catch (err) {
    } finally {
      setHistoryLoading(false);
    }
  };

  const takeSelfie = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Camera access is required for verification.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: 'images',
        allowsEditing: false,
        quality: 0.5,
        base64: true,
      });

      if (!result.canceled) {
        setSelfie(result.assets[0]);
      }
    } catch (err) {
      Alert.alert('Camera Error', `Failed to take selfie: ${err.message || 'Unknown error'}`);
    }
  };

  const handleToggleBreak = async () => {
    try {
      setPunchLoading(true);
      const res = await api.post('/attendance/break');
      setTodayAttendance(res.data.data);
      Alert.alert('Success', res.data.message);
    } catch (err) {
      Alert.alert('Error', err.response?.data?.message || 'Could not toggle break.');
    } finally {
      setPunchLoading(false);
    }
  };

  const handlePunchIn = async () => {
    if (!location) {
      Alert.alert('Location Required', 'Please wait for your location to be detected.');
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
      Alert.alert('Punched In', res.data.message || 'Attendance marked successfully!', [
        { text: 'OK', onPress: () => navigation.navigate('Home') },
      ]);
    } catch (err) {
      Alert.alert('Error', err.response?.data?.message || 'Could not punch in. Please try again.');
    } finally {
      setPunchLoading(false);
    }
  };

  const handlePunchOut = async () => {
    if (!location) {
      Alert.alert('Location Required', 'Please wait for your location to be detected.');
      return;
    }
    Alert.alert('Confirm Punch Out', 'Are you sure you want to end your shift?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Punch Out',
        style: 'destructive',
        onPress: async () => {
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
            Alert.alert('Punched Out', res.data.message || 'Shift ended successfully!', [
              { text: 'OK', onPress: () => navigation.navigate('Home') },
            ]);
          } catch (err) {
            Alert.alert('Error', err.response?.data?.message || 'Could not punch out. Please try again.');
          } finally {
            setPunchLoading(false);
          }
        },
      },
    ]);
  };

  const alreadyPunchedIn = !!todayAttendance?.punchIn?.time;
  const alreadyPunchedOut = !!todayAttendance?.punchOut?.time;

  const formatTime = (dateStr) => {
    if (!dateStr) return '--:--';
    return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
  };

  const getStatusColor = (status, hasPunchIn) => {
    if (!hasPunchIn) return 'bg-rose-50 text-rose-600';
    switch (status) {
      case 'Present': return 'bg-emerald-50 text-emerald-600';
      case 'Late': return 'bg-amber-50 text-amber-600';
      case 'Half Day': return 'bg-blue-50 text-blue-600';
      default: return 'bg-emerald-50 text-emerald-600';
    }
  };

  return (
    <View className="flex-1 bg-slate-50">
      <StatusBar barStyle="dark-content" />

      {/* Header */}
      <View className="pt-14 px-6 pb-5 bg-white border-b border-slate-100 flex-row justify-between items-center">
        <View className="flex-row items-center">
          <TouchableOpacity
            className="w-10 h-10 rounded-xl bg-slate-50 justify-center items-center border border-slate-100 mr-4"
            onPress={() => navigation.navigate('Home')}
          >
            <ArrowLeft size={20} color="#64748b" />
          </TouchableOpacity>
          <View>
            <Text className="text-2xl font-extrabold text-slate-900 tracking-tight">Attendance</Text>
            <Text className="text-slate-400 font-bold text-xs">Verify location to mark</Text>
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
        contentContainerStyle={{ paddingHorizontal: 32, paddingVertical: 24, paddingBottom: 110 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#4f46e5']} />
        }
      >
        {/* Today Status Card */}
        {todayAttendance && (
          <View className="bg-white rounded-3xl p-4 border border-slate-100 mb-5 shadow-sm">
            <View className="flex-row justify-between items-center mb-3">
              <Text className="text-[10px] font-bold text-slate-400 tracking-widest ">Today's Record</Text>
              {todayAttendance.status && (
                <View className={`px-2 py-0.5 rounded-md ${getStatusColor(todayAttendance.status).split(' ')[0]}`}>
                  <Text className={`text-[8px] font-bold ${getStatusColor(todayAttendance.status).split(' ')[1]}`}>{todayAttendance.status}</Text>
                </View>
              )}
            </View>
            <View className="flex-row justify-between items-center py-2 border-t border-slate-50">
              <View className="items-start flex-1">
                <Text className="text-[8px] font-bold text-slate-400 ">In</Text>
                <Text className="text-sm font-bold text-slate-800">{formatTime(todayAttendance.punchIn?.time)}</Text>
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
                <Text className="text-sm font-bold text-slate-800">{formatTime(todayAttendance.punchOut?.time)}</Text>
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
                  <Text className="text-base font-bold text-slate-800 mt-0.5">{location.address}</Text>
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
            />
          </View>
        </View>

        {/* Selfie Section - only if punch action is pending */}
        {!alreadyPunchedOut && (
          <View className="mb-6">
            <View className="flex-row justify-between items-center mb-3">
              <Text className="text-[10px] font-bold text-slate-400 tracking-widest">IDENTITY VERIFICATION</Text>
              <View className="bg-amber-50 px-2 py-0.5 rounded-md border border-amber-100">
                <Text className="text-[9px] font-bold text-amber-600 ">Recommended</Text>
              </View>
            </View>
            <TouchableOpacity
              className={`h-56 bg-white rounded-3xl border-2 border-dashed ${selfie ? 'border-emerald-200 bg-emerald-50/10' : 'border-slate-200'} justify-center items-center overflow-hidden`}
              onPress={takeSelfie}
              activeOpacity={0.8}
            >
              {selfie ? (
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
              ) : (
                <View className="items-center">
                  <View className="w-14 h-14 rounded-full bg-slate-50 justify-center items-center mb-3 border border-slate-100">
                    <Camera size={26} color="#94a3b8" />
                  </View>
                  <Text className="text-slate-600 font-bold text-base">Tap to Take Selfie</Text>
                  <Text className="text-slate-400 font-bold text-[11px] mt-1 text-center px-6">
                    A clear photo of your face is recommended for faster attendance approval
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        )}


        {/* Action Button */}
        {(() => {
          const shiftStatus = getShiftStatus();
          if (alreadyPunchedOut || !shiftStatus.allowed) {
            const isMissed = shiftStatus.status === 'Missed';
            const isUpcoming = shiftStatus.status === 'Upcoming';

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
                  {alreadyPunchedOut ? 'Attendance Complete' : shiftStatus.message}
                </Text>
                <Text className="text-slate-500 font-bold text-sm mt-1 text-center">
                  {alreadyPunchedOut
                    ? 'You have finished your shift for today.'
                    : isUpcoming
                      ? `Shift starts at ${user?.shift?.startTime}. Please check back 1 hour before.`
                      : 'The cutoff time for this shift has passed.'}
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
              onPress={alreadyPunchedIn ? handlePunchOut : handlePunchIn}
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
              <Text className="text-slate-900 font-bold text-sm  tracking-widest ">DETAILED LOGS</Text>
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
                <View key={index} className="bg-white rounded-3xl p-4 border border-slate-100 mb-4 shadow-sm mx-1">
                  <View className="flex-row justify-between items-center mb-3">
                    <View>
                      <Text className="text-slate-900 font-bold text-sm">
                        {new Date(item.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                      </Text>
                      <Text className="text-slate-400 font-bold text-[9px]">{item.shiftInfo?.name || 'Shift'}</Text>
                    </View>
                    <View className={`px-2 py-1 rounded-lg ${getStatusColor(item.status, !!item.punchIn).split(' ')[0]}`}>
                      <Text className={`text-[8px] font-bold tracking-wider ${getStatusColor(item.status, !!item.punchIn).split(' ')[1]}`}>
                        {item.status || 'Present'}
                      </Text>
                    </View>
                  </View>

                  <View className="flex-row border-y border-slate-50 py-2 mb-3">
                    <View className="flex-1 items-start border-r border-slate-50">
                      <Text className="text-[8px] font-bold text-slate-400 ">In</Text>
                      <Text className="text-slate-800 font-bold text-xs">{formatTime(item.punchIn?.time)}</Text>
                    </View>
                    <View className="flex-1 items-center border-r border-slate-50">
                      <Text className="text-[8px] font-bold text-slate-400 ">Out</Text>
                      <Text className="text-slate-800 font-bold text-xs">{formatTime(item.punchOut?.time)}</Text>
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
            isFull={true}
          />
        </View>
      </Modal>
    </View>
  );
};

export default AttendanceScreen;
