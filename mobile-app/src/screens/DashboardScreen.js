import * as Location from 'expo-location';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StatusBar,
  Text,
  TouchableOpacity,
  View,
  RefreshControl,
} from 'react-native';
import {
  Bell,
  Calendar,
  ChevronRight,
  Clock,
  History,
  Zap,
  MapPin,
  CircleCheck,
  CircleAlert,
  TrendingUp,
  User,
  LogOut,
  CalendarDays
} from 'lucide-react-native';
import AttendanceMap from '../components/AttendanceMap';
import api from '../api/axios';

const DashboardScreen = ({ navigation }) => {
  const [userData, setUserData] = useState(null);
  const [attendance, setAttendance] = useState(null);
  const [stats, setStats] = useState(null);
  const [office, setOffice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [userLocation, setUserLocation] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

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
    } catch (err) {
      console.log('Dashboard location error:', err.message);
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
      } else {
        console.error('User Fetch Error:', results[0].reason.response?.status);
      }

      if (results[1].status === 'fulfilled') {
        setOffice(results[1].value.data.data);
      } else {
        console.error('Office Fetch Error:', results[1].reason.response?.status);
      }

      if (results[2].status === 'fulfilled') {
        setStats(results[2].value.data.data);
      } else {
        console.error('Stats Fetch Error:', results[2].reason.response?.status);
      }
    } catch (err) {
      console.error('Dashboard fatal error:', err.message);
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

  const isPunchIn = !!attendance?.punchIn?.time;
  const isPunchOut = !!attendance?.punchOut?.time;
  const isOnDuty = isPunchIn && !isPunchOut;

  const punchInTime = attendance?.punchIn?.time
    ? new Date(attendance.punchIn.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '--:--';

  const punchOutTime = attendance?.punchOut?.time
    ? new Date(attendance.punchOut.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '--:--';

  return (
    <View className="flex-1 bg-[#f1f5f9]">
      <StatusBar barStyle="dark-content" />

      {/* Modern Header */}
      <View className="bg-white pt-14 pb-5 px-6 border-b border-slate-100 flex-row justify-between items-center">
        <View>
          <Text className="text-slate-400 text-[10px] font-black uppercase tracking-widest mb-1">Welcome Back</Text>
          <Text className="text-2xl font-black text-slate-900 tracking-tighter">{userData?.name || 'Employee'}</Text>
        </View>
        <TouchableOpacity
          className="w-12 h-12 rounded-2xl bg-indigo-50 justify-center items-center border border-indigo-100"
          onPress={() => navigation.navigate('Profile')}
        >
          <User size={24} color="#4f46e5" />
        </TouchableOpacity>
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
                <View className={`w-3 h-3 rounded-full mr-2 ${isOnDuty ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                <Text className="font-black text-slate-400 text-[10px] uppercase tracking-widest">
                  {isOnDuty ? 'Currently On-Duty' : 'System Offline'}
                </Text>
              </View>
              <Text className="text-slate-400 font-bold text-xs">
                {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}
              </Text>
            </View>

            <View className="flex-row items-center justify-between mb-8">
              <View className="items-center flex-1">
                <Text className="text-[10px] font-black text-slate-400 uppercase mb-2">Punch In</Text>
                <Text className="text-xl font-black text-slate-900">{punchInTime}</Text>
              </View>
              <View className="w-[1px] h-10 bg-slate-100" />
              <View className="items-center flex-1">
                <Text className="text-[10px] font-black text-slate-400 uppercase mb-2">Punch Out</Text>
                <Text className="text-xl font-black text-slate-900">{punchOutTime}</Text>
              </View>
            </View>

            <TouchableOpacity
              onPress={() => isPunchOut ? null : navigation.navigate('Attendance')}
              disabled={isPunchOut}
              className={`h-16 rounded-2xl flex-row justify-center items-center shadow-lg ${isPunchOut ? 'bg-slate-100' : isOnDuty ? 'bg-rose-500 shadow-rose-100' : 'bg-indigo-600 shadow-indigo-100'}`}
            >
              <Clock size={20} color={isPunchOut ? '#94a3b8' : 'white'} />
              <Text className={`ml-3 font-black text-base uppercase tracking-tight ${isPunchOut ? 'text-slate-400' : 'text-white'}`}>
                {isPunchOut ? 'Day Completed' : isOnDuty ? 'Punch Out Now' : 'Punch In Now'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Stats Grid */}
        <View className="px-6 mt-6 flex-row" style={{ gap: 12 }}>
          <View className="flex-1 bg-white rounded-3xl p-5 border border-slate-50 shadow-sm">
            <View className="w-10 h-10 rounded-xl bg-indigo-50 justify-center items-center mb-4">
              <CircleCheck size={20} color="#4f46e5" />
            </View>
            <Text className="text-2xl font-black text-slate-900">{stats?.presentDays || 0}</Text>
            <Text className="text-[10px] font-black text-slate-400 uppercase mt-1 tracking-widest">Days Present</Text>
          </View>
          <View className="flex-1 bg-white rounded-3xl p-5 border border-slate-50 shadow-sm">
            <View className="w-10 h-10 rounded-xl bg-rose-50 justify-center items-center mb-4">
              <CalendarDays size={20} color="#f43f5e" />
            </View>
            <Text className="text-2xl font-black text-slate-900">{stats?.leaveBalance || 0}</Text>
            <Text className="text-[10px] font-black text-slate-400 uppercase mt-1 tracking-widest">Leave Left</Text>
          </View>
        </View>

        {/* Live Tracking Map Card */}
        <View className="px-6 mt-6">
          <View className="bg-white rounded-[32px] overflow-hidden border border-slate-50 shadow-lg shadow-slate-200">
            <View className="p-5 flex-row justify-between items-center">
              <View>
                <Text className="text-lg font-black text-slate-900 tracking-tighter">Office Proximity</Text>
                <View className="flex-row items-center mt-1">
                  <MapPin size={12} color="#64748b" />
                  <Text className="text-slate-500 font-bold text-[10px] ml-1 uppercase">{office?.name || 'Primary Office'}</Text>
                </View>
              </View>
              <View className="bg-emerald-50 px-3 py-1.5 rounded-full flex-row items-center">
                <View className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-2" />
                <Text className="text-emerald-600 font-black text-[10px] uppercase">Live</Text>
              </View>
            </View>
            <View className="h-48 w-full">
              <AttendanceMap
                latitude={office?.latitude}
                longitude={office?.longitude}
                radius={office?.radius}
                userLocation={userLocation}
              />
            </View>
          </View>
        </View>

        {/* Shift Details */}
        <View className="px-6 mt-6">
          <View className="bg-slate-900 rounded-[32px] p-6 shadow-2xl shadow-slate-400">
            <View className="flex-row items-center mb-6">
              <View className="w-12 h-12 rounded-2xl bg-white/10 justify-center items-center border border-white/10">
                <Calendar size={24} color="white" />
              </View>
              <View className="ml-4">
                <Text className="text-slate-400 text-[10px] font-black tracking-widest uppercase">My Active Shift</Text>
                <Text className="text-white text-xl font-black mt-0.5">{userData?.shift?.name || 'Not Assigned'}</Text>
              </View>
            </View>
            <View className="flex-row justify-between pt-6 border-t border-white/10">
              <View>
                <Text className="text-slate-500 text-[10px] font-black uppercase mb-1">Starts</Text>
                <Text className="text-white font-black text-lg">{userData?.shift?.startTime || '—'}</Text>
              </View>
              <View className="items-end">
                <Text className="text-slate-500 text-[10px] font-black uppercase mb-1">Ends</Text>
                <Text className="text-white font-black text-lg">{userData?.shift?.endTime || '—'}</Text>
              </View>
            </View>
          </View>
        </View>

      </ScrollView>
    </View>
  );
};

export default DashboardScreen;
