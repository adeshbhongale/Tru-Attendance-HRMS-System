import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { ArrowLeft, Camera, CheckCircle, ChevronRight, MapPin, RotateCcw, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StatusBar,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import api from '../api/axios';
import AttendanceMap from '../components/AttendanceMap';

const AttendanceScreen = ({ navigation }) => {
  const [selfie, setSelfie] = useState(null);
  const [location, setLocation] = useState(null);
  const [locationLoading, setLocationLoading] = useState(true);
  const [punchLoading, setPunchLoading] = useState(false);
  const [todayAttendance, setTodayAttendance] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [history, setHistory] = useState([]);
  const [office, setOffice] = useState(null);
  const [distance, setDistance] = useState(null);

  useEffect(() => {
    getLocation();
    fetchHistory();
    fetchOfficeSettings();
  }, []);

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
      const geocode = await Location.reverseGeocodeAsync({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      });
      const addr = geocode[0]
        ? `${geocode[0].street || ''}, ${geocode[0].city || ''}`
        : 'Current Location';

      setLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude, address: addr });
    } catch (err) {
      Alert.alert('Location Error', 'Could not fetch your location. Please try again.');
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
      
      // 1. Look for active session (no punch out)
      let currentSession = records.find(r => !r.punchOut?.time);
      
      // 2. If no active session, look for a record completed today OR with today's date
      if (!currentSession) {
        const today = new Date().toISOString().split('T')[0];
        currentSession = records.find(r => 
          r.date?.split('T')[0] === today || 
          r.punchOut?.time?.split('T')[0] === today
        );
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
      Alert.alert('Punched In', res.data.message || 'Attendance marked successfully!', [
        { text: 'OK', onPress: () => navigation.goBack() },
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
            });
            setTodayAttendance(res.data.data);
            Alert.alert('Punched Out', `Working hours: ${res.data.data?.workingHours || 0}h`, [
              { text: 'OK', onPress: () => navigation.goBack() },
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
            onPress={() => navigation.goBack()}
          >
            <ArrowLeft size={20} color="#64748b" />
          </TouchableOpacity>
          <View>
            <Text className="text-2xl font-extrabold text-slate-900 tracking-tight">Attendance</Text>
            <Text className="text-slate-400 font-bold text-xs">Verify location to mark</Text>
          </View>
        </View>
        <TouchableOpacity
          onPress={() => {
            getLocation();
            fetchHistory();
            fetchOfficeSettings();
          }}
          className="w-10 h-10 rounded-xl bg-slate-50 justify-center items-center border border-slate-100"
        >
          <RotateCcw size={18} color="#64748b" />
        </TouchableOpacity>
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ padding: 24, paddingBottom: 110 }}>
        {/* Today Status Card */}
        {todayAttendance && (
          <View className="bg-white rounded-3xl p-5 border border-slate-100 mb-5 shadow-sm">
            <Text className="text-[10px] font-bold text-slate-400 tracking-widest mb-4">TODAY'S RECORD</Text>
            <View className="flex-row justify-between">
              <View>
                <Text className="text-[10px] font-bold text-slate-400">Punch In</Text>
                <Text className="text-lg font-bold text-slate-800 mt-0.5">{formatTime(todayAttendance.punchIn?.time)}</Text>
              </View>
              <View className="items-center">
                <Text className="text-[10px] font-bold text-slate-400">Hours</Text>
                <Text className="text-lg font-bold text-slate-800 mt-0.5">{todayAttendance.workingHours || '—'}h</Text>
              </View>
              <View className="items-end">
                <Text className="text-[10px] font-bold text-slate-400">Punch Out</Text>
                <Text className="text-lg font-bold text-slate-800 mt-0.5">{formatTime(todayAttendance.punchOut?.time)}</Text>
              </View>
            </View>
            {todayAttendance.status && (
              <View className={`mt-4 px-4 py-2 rounded-xl self-start ${getStatusColor(todayAttendance.status).split(' ')[0]}`}>
                <Text className={`text-xs font-bold ${getStatusColor(todayAttendance.status).split(' ')[1]}`}>{todayAttendance.status}</Text>
              </View>
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
            <TouchableOpacity onPress={getLocation} className="p-2">
              <Text className="text-indigo-600 font-bold text-xs">Refresh</Text>
            </TouchableOpacity>
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

        {/* Selfie Section - only for Punch In */}
        {!alreadyPunchedIn && (
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
                  <View className="absolute top-4 left-4 bg-black/40 px-3 py-1.5 rounded-full">
                    <Text className="text-white text-[10px] font-bold">Retake Selfie</Text>
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
        {alreadyPunchedOut ? (
          <View className="bg-slate-100 rounded-3xl p-8 items-center border border-slate-200">
            <View className="w-16 h-16 rounded-full bg-emerald-100 justify-center items-center mb-4">
              <CheckCircle size={32} color="#10b981" />
            </View>
            <Text className="text-slate-800 font-extrabold text-lg">Attendance Complete</Text>
            <Text className="text-slate-500 font-bold text-sm mt-1 text-center">You have finished your shift for today.</Text>
          </View>
        ) : (
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
                  {alreadyPunchedIn ? 'Punch Out Now' : selfie ? 'Save & Punch In' : 'Punch In Now'}
                </Text>
                <ChevronRight size={20} color="white" className="ml-2" />
              </View>
            )}
          </TouchableOpacity>
        )}

        {/* Attendance History */}
        {history.length > 0 && (
          <View className="mt-8">
            <View className="flex-row justify-between items-center mb-5">
              <Text className="text-[10px] font-bold text-slate-400 tracking-widest ">Recent History</Text>
              <TouchableOpacity 
                onPress={fetchHistory}
                className="w-8 h-8 rounded-lg bg-indigo-50 justify-center items-center border border-indigo-100"
              >
                <RotateCcw size={14} color="#4f46e5" />
              </TouchableOpacity>
            </View>
            {history.slice(0, 5).map((item, idx) => (
              <View key={idx} className="bg-white rounded-2xl p-4 border border-slate-100 mb-3 flex-row justify-between items-center shadow-sm">
                <View>
                  <Text className="text-sm font-extrabold text-slate-800">
                    {new Date(item.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                  </Text>
                  <Text className="text-xs text-slate-400 font-bold mt-1">
                    {formatTime(item.punchIn?.time)} — {formatTime(item.punchOut?.time)}
                  </Text>
                </View>
                <View className={`px-3 py-1.5 rounded-xl ${getStatusColor(item.status, !!item.punchIn).split(' ')[0]}`}>
                  <Text className={`text-[10px] font-bold ${getStatusColor(item.status, !!item.punchIn).split(' ')[1]}`}>
                    {!item.punchIn ? 'Absent' :
                      (item.status === 'Present' || item.status === 'Absent') ? 'Present' :
                        item.status === 'Late' ? 'Late' :
                          item.status}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
};

export default AttendanceScreen;
