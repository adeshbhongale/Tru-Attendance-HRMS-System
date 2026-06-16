import * as Location from 'expo-location';
import {
  Bell,
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
import NotificationDrawer from '../components/NotificationDrawer';
import socket from '../socket';
import { showLocalNotification } from '../utils/notifications';


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

const getMonthDateRange = (month, year) => {
  const startDateStr = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const endDateStr = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { startDate: startDateStr, endDate: endDateStr };
};

const formatCustomHours = (hoursDecimal) => {
  if (hoursDecimal === undefined || hoursDecimal === null || isNaN(hoursDecimal)) return "0.00";
  const hrs = Math.floor(hoursDecimal);
  const mins = Math.round((hoursDecimal - hrs) * 60);
  let finalHrs = hrs;
  let finalMins = mins;
  if (finalMins >= 60) {
    finalHrs += 1;
    finalMins -= 60;
  }
  return `${finalHrs}.${String(finalMins).padStart(2, '0')}`;
};

const DashboardScreen = ({ navigation }) => {
  const [userData, setUserData] = useState(null);
  const [attendance, setAttendance] = useState(null);
  const [stats, setStats] = useState(null);
  const [office, setOffice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [userLocation, setUserLocation] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [mapFull, setMapFull] = useState(false);
  const todayDate = new Date();
  const [selectedMonth, setSelectedMonth] = useState({
    month: todayDate.getMonth() + 1,
    year: todayDate.getFullYear()
  });
  const [showMonthPicker, setShowMonthPicker] = useState(false);

  const [isPunchIn, setIsPunchIn] = useState(false);
  const [isPunchOut, setIsPunchOut] = useState(false);
  const [isOnDuty, setIsOnDuty] = useState(false);

  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [notifDrawerVisible, setNotifDrawerVisible] = useState(false);
  const [shiftStatus, setShiftStatus] = useState({ allowed: true });

  const handleSelectMonth = (month, year) => {
    const newMonth = { month, year };
    setSelectedMonth(newMonth);
    setShowMonthPicker(false);
    fetchDashboardData(newMonth);
  };

  // Sync initial unread notifications count
  useEffect(() => {
    if (userData?._id) {
      const syncUnreadCount = () => {
        api.get('/notifications/employee/feed')
          .then((res) => {
            if (res.data.success) {
              const feed = res.data.data || [];
              setUnreadNotifications(feed.filter(n => !n.isRead).length);
            }
          })
          .catch(() => { });
      };

      syncUnreadCount();

      // Setup dynamic socket badge & feed sync listeners
      socket.on(`notificationBadgeUpdate:${userData._id}`, syncUnreadCount);
      socket.on(`notificationLiveUpdate:${userData._id}`, syncUnreadCount);

      const handleLiveNotification = (payload) => {
        showLocalNotification(payload.title, payload.body, {
          notificationId: payload.notificationId,
          type: payload.type
        });
        syncUnreadCount();
      };
      socket.on(`notificationReceived:${userData._id}`, handleLiveNotification);

      return () => {
        socket.off(`notificationBadgeUpdate:${userData._id}`, syncUnreadCount);
        socket.off(`notificationLiveUpdate:${userData._id}`, syncUnreadCount);
        socket.off(`notificationReceived:${userData._id}`, handleLiveNotification);
      };
    }
  }, [userData]);

  useEffect(() => {
    const punchIn = !!attendance?.punchIn?.time;
    const punchOut = !!attendance?.punchOut?.time;
    setIsPunchIn(punchIn);
    setIsPunchOut(punchOut);
    setIsOnDuty(punchIn && !punchOut);
  }, [attendance]);


  const getCountdown = (shift, todayLeave = null) => {
    if (!shift) return null;
    const now = new Date();

    // ── 1. Weekly Off Check (Dynamic) ──
    const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const currentDayName = daysOfWeek[now.getDay()];
    const isWeeklyOff = (office?.weeklyOffs || ['Sunday']).includes(currentDayName);
    if (isWeeklyOff) {
      return { label: 'Weekly Off', time: currentDayName, color: 'text-indigo-400', isHoliday: true };
    }

    // ── 2. Approved Leave Check ──
    if (todayLeave) {
      if (todayLeave.duration === 'Full Day') {
        return { label: 'On Leave', time: 'Full Day', color: 'text-orange-400', isHoliday: true, status: 'Leave' };
      } else if (todayLeave.duration === 'Half Day' && !isPunchIn) {
        // If half day and hasn't punched in yet, we show a special status but allow punch
        return { label: 'Half Day Leave', time: 'Ready', color: 'text-orange-300', isActive: true, status: 'Half Day Leave' };
      }
    }

    const [sHour, sMin] = shift.startTime.split(':').map(Number);
    const [eHour, eMin] = shift.endTime.split(':').map(Number);

    const start = new Date(now);
    start.setHours(sHour, sMin, 0, 0);

    const end = new Date(now);
    end.setHours(eHour, eMin, 0, 0);

    // Automatically detect shifts spanning midnight
    if (eHour < sHour || (eHour === sHour && eMin < sMin)) {
      if (now.getHours() > sHour || (now.getHours() === sHour && now.getMinutes() >= sMin)) {
        if (eHour <= sHour) end.setDate(end.getDate() + 1);
      } else if (now.getHours() < eHour || (now.getHours() === eHour && now.getMinutes() < eMin)) {
        start.setDate(start.getDate() - 1);
      }
    }

    // Check if it's a new employee (created within last 48h)
    const joinDate = new Date(userData?.createdAt || now);
    const isNewEmployee = (now - joinDate) < (48 * 60 * 60 * 1000);

    // Dynamic Cutoff for "Missed" status (Half Day Threshold)
    const halfDayAfterStr = shift.halfDayAfter || "00:00";
    const [hHour, hMin] = halfDayAfterStr.split(':').map(Number);
    const halfDayCutoff = new Date(start);
    halfDayCutoff.setHours(hHour, hMin, 0, 0);
    if (hHour < sHour) halfDayCutoff.setDate(halfDayCutoff.getDate() + 1);

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

    if (now < start) {
      const diff = start - now;

      if (diff > 3600000 && !isNewEmployee) {
        const h = Math.floor(diff / (1000 * 60 * 60));
        const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        return { label: 'Upcoming Shift', time: `Starts in ${h}h ${m}m`, color: 'text-indigo-400', isFuture: true };
      } else {
        const m = Math.floor(diff / (1000 * 60));
        return {
          label: isNewEmployee ? 'First Day' : 'Starts in',
          time: isNewEmployee ? 'Ready to Start' : `${m}m`,
          color: 'text-indigo-400',
          isActive: true
        };
      }
    } else if (now < end) {
      // CURRENTLY ON SHIFT
      const isLate = now > new Date(start.getTime() + (shift.gracePeriod || 15) * 60000);
      const isHalfDay = now > halfDayCutoff;

      if (isHalfDay) {
        return { label: 'Ends in', time: 'Half Day', color: 'text-rose-400', isActive: true, status: 'Half Day' };
      }

      const diff = end - now;
      const h = Math.floor(diff / (1000 * 60 * 60));
      const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      return {
        label: isLate ? 'Late Arrival' : 'Ends in',
        time: `${h}h ${m}m`,
        color: isLate ? 'text-amber-400' : 'text-emerald-400',
        isActive: true
      };
    } else {
      // Shift is over
      if (!isPunchIn && !isNewEmployee) {
        return { label: 'Shift Missed', time: 'Absent', color: 'text-rose-500', isMissed: true };
      }
      return { label: 'Shift Ended', time: 'Over', color: 'text-slate-500', isOver: true };
    }
  };

  const [countdown, setCountdown] = useState(null);
  const [liveStats, setLiveStats] = useState({ worked: 0, breaks: 0 });

  const updateLiveStats = () => {
    if (!stats) return;

    const today = new Date();
    const isCurrentMonth = selectedMonth.month === (today.getMonth() + 1) && selectedMonth.year === today.getFullYear();

    let worked = stats.totalWorkedHours || 0;
    if (isCurrentMonth && isOnDuty && attendance?.punchIn?.time && !attendance?.breaks?.some(b => !b.endTime)) {
      const punchIn = new Date(attendance.punchIn.time);
      const backendCurrentHours = stats.currentWorkingHours || 0;
      const liveExtraMinutes = Math.max(0, (new Date() - punchIn) / 60000
        - (attendance.breaks?.reduce((acc, b) => acc + (b.duration || 0), 0) || 0));
      worked = (stats.totalWorkedHours || 0) + Math.max(0, liveExtraMinutes / 60 - backendCurrentHours);
    }

    let breaks = (stats.totalBreakMinutes || 0) / 60;
    const activeBreak = attendance?.breaks?.find(b => !b.endTime);
    if (isCurrentMonth && activeBreak) {
      const start = new Date(activeBreak.startTime);
      breaks += (new Date() - start) / 3600000;
    }
    setLiveStats({ worked, breaks });
  };

  useEffect(() => {
    updateLiveStats();
    const timer = setInterval(updateLiveStats, 10000);
    return () => clearInterval(timer);
  }, [stats, isOnDuty, attendance, selectedMonth]);

  useEffect(() => {
    api.post('/auth/status', { isOnline: true }).catch(() => { });
    return () => {
      api.post('/auth/status', { isOnline: false }).catch(() => { });
    };
  }, []);

  const [myLeaves, setMyLeaves] = useState([]);

  useEffect(() => {
    if (userData?.shift) {
      const today = getISTDateString(new Date());
      const todayLeave = myLeaves.find(l => {
        const start = getISTDateString(l.startDate);
        const end = getISTDateString(l.endDate);
        return l.status === 'Approved' && today >= start && today <= end;
      });

      setCountdown(getCountdown(userData.shift, todayLeave));
      const timer = setInterval(() => {
        setCountdown(getCountdown(userData.shift, todayLeave));
      }, 60000);
      return () => clearInterval(timer);
    }
  }, [userData, myLeaves, isPunchIn, isPunchOut, office]);

  useEffect(() => {
    fetchDashboardData(selectedMonth);
    getCurrentLocation();
  }, [selectedMonth]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      fetchDashboardData(selectedMonth);
      getCurrentLocation();
    });

    return unsubscribe;
  }, [navigation, selectedMonth]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchDashboardData(selectedMonth);
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
        } catch (err) { }
      }, 120000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isOnDuty]);


  const fetchDashboardData = async (targetMonth = selectedMonth) => {
    try {
      if (!refreshing) setLoading(true);
      const { startDate, endDate } = getMonthDateRange(targetMonth.month, targetMonth.year);

      const results = await Promise.allSettled([
        api.get('/auth/me'),
        api.get(`/reports/my-stats?startDate=${startDate}&endDate=${endDate}`),
        api.get('/settings/office'),
        api.get('/leaves/my-leaves'),
      ]);

      if (results[0].status === 'fulfilled') {
        setUserData(results[0].value.data.data);
        setAttendance(results[0].value.data.todayAttendance || null);
        setShiftStatus(results[0].value.data.shiftStatus || { allowed: true });
      }
      if (results[1].status === 'fulfilled') {
        setStats(results[1].value.data.data);
      }
      if (results[2].status === 'fulfilled') {
        setOffice(results[2].value.data.data);
      }
      if (results[3].status === 'fulfilled') {
        setMyLeaves(results[3].value.data.data || []);
      }
    } catch (err) {
    } finally {
      setLoading(false);
      setRefreshing(false);
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

      {/* Header */}
      <View className="bg-blue-600 rounded-b-3xl pt-14 pb-5 px-6 border-b border-slate-100 flex-row justify-between items-center">

        {/* LEFT SIDE */}
        <View className="flex-1 pr-3">

          <Text className="text-white text-[10px] font-bold tracking-widest mb-1">
            Welcome Back
          </Text>

          <Text
            className={`font-bold text-white ${(userData?.name || 'NA').length > 25
              ? 'text-sm'
              : (userData?.name || 'NA').length > 18
                ? 'text-base'
                : 'text-lg'
              }`}
            style={{
              flexWrap: 'wrap',
              flexShrink: 1,
              width: '100%',
            }}
          >
            {userData?.name || 'NA'}
          </Text>

        </View>
        {/* RIGHT SIDE */}
        <View className="flex-row items-center gap-3">

          <TouchableOpacity
            onPress={() => setNotifDrawerVisible(true)}
            activeOpacity={0.8}
            className="w-12 h-12 rounded-2xl bg-white/10 justify-center items-center relative border border-white/10"
          >
            <Bell size={22} color="white" />
            {unreadNotifications > 0 && (
              <View className="absolute -top-1.5 -right-1.5 bg-rose-500 min-w-5 h-5 rounded-full justify-center items-center px-1 border border-white">
                <Text className="text-white text-[9px] font-extrabold">
                  {unreadNotifications}
                </Text>
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            className="w-12 h-12 rounded-2xl bg-indigo-50 justify-center items-center border border-indigo-100 overflow-hidden"
            onPress={() => navigation.navigate('Profile')}
          >
            {userData?.profileImage ? (
              <Image
                source={{ uri: userData.profileImage }}
                className="w-full h-full"
              />
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
                <Text className="text-[10px] font-bold text-slate-400 mb-2 tracking-widest">Punch In Time</Text>
                <View className="bg-emerald-50 px-3 py-1 rounded-lg">
                  <Text className="text-xl font-bold text-emerald-700">{punchInTime}</Text>
                </View>
              </View>
              <View className="w-[1px] h-10 bg-slate-100 mx-2" />
              <View className="items-center flex-1">
                <Text className="text-[10px] font-bold text-slate-400 mb-2 tracking-widest">Punch Out Time</Text>
                <View className="bg-rose-50 px-3 py-1 rounded-lg">
                  <Text className="text-xl font-bold text-rose-700">{punchOutTime}</Text>
                </View>
              </View>
            </View>

            {/* Sunday or Approved Full-Day Leave — hide punch buttons */}
            {countdown?.isHoliday ? (
              <View className="h-16 rounded-2xl bg-indigo-50 flex-row justify-center items-center border border-indigo-100 shadow-sm">
                <Calendar size={22} color="#4f46e5" />
                <View className="ml-3">
                  <Text className="font-bold text-base text-indigo-700 tracking-tight">
                    {countdown.label}
                  </Text>
                  <Text className="text-[10px] text-indigo-400 font-bold">{countdown.time}</Text>
                </View>
              </View>
            ) : isPunchOut ? (
              <View className="h-16 rounded-2xl bg-slate-50 flex-row justify-center items-center border border-slate-100 shadow-sm">
                <CircleCheck size={24} color="#10b981" />
                <View className="ml-3">
                  <Text className="font-bold text-lg text-slate-800 tracking-tight">Day Completed</Text>
                </View>
              </View>
            ) : (!isOnDuty && shiftStatus?.allowed === false && shiftStatus?.status === 'Ended') ? (
              <View className="h-16 rounded-2xl bg-slate-50 flex-row justify-center items-center border border-slate-100 shadow-sm">
                <X size={24} color="#f43f5e" />
                <View className="ml-3">
                  <Text className="font-bold text-lg text-slate-800 tracking-tight">Shift Ended</Text>
                </View>
              </View>
            ) : (
              <TouchableOpacity
                onPress={() => (countdown?.isFuture) ? null : navigation.navigate('Attendance')}
                disabled={countdown?.isFuture}
                activeOpacity={0.8}
                className={`h-16 rounded-2xl flex-row justify-center items-center shadow-lg ${countdown?.isFuture ? 'bg-slate-50 border border-slate-100' :
                  isOnDuty ? 'bg-rose-500 shadow-rose-200' : 'bg-indigo-600 shadow-indigo-200'
                  }`}
              >
                <Clock size={20} color={countdown?.isFuture ? '#94a3b8' : 'white'} />
                <Text className={`ml-3 font-bold text-lg tracking-tight ${countdown?.isFuture ? 'text-slate-400' : 'text-white'
                  }`}>
                  {countdown?.isFuture ? 'Shift Not Started' :
                    isOnDuty ? 'Punch Out Now' : 'Punch In Now'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Centered Month Label / Custom Dropdown Trigger */}
        <View className="items-center mt-6">
          <TouchableOpacity
            onPress={() => setShowMonthPicker(true)}
            activeOpacity={0.8}
            className="bg-white px-6 py-2.5 rounded-full border border-slate-100 shadow-sm flex-row items-center"
          >
            <Calendar size={14} color="#4f46e5" />
            <Text className="text-[11px] font-bold text-slate-700 tracking-widest ml-2">
              {new Date(selectedMonth.year, selectedMonth.month - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })} Report
            </Text>
            <Text className="text-[10px] text-slate-400 font-bold ml-1.5">▼</Text>
          </TouchableOpacity>
        </View>

        {/* Stats Grid - 6 Boxes */}
        <View className="px-6 mt-4">
          <View className="flex-row" style={{ gap: 10 }}>
            {/* Box 1: Present */}
            <View className="flex-1 bg-white rounded-[24px] p-4 border border-slate-50 shadow-sm items-center">
              <View className="w-8 h-8 rounded-xl bg-indigo-50 justify-center items-center mb-2">
                <CircleCheck size={16} color="#4f46e5" />
              </View>
              <Text className="text-lg font-bold text-slate-900">{stats?.workingDays || 0}</Text>
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
              <Text className="text-lg font-bold text-slate-900">{formatCustomHours(liveStats.worked)}hr</Text>
              <Text className="text-[8px] font-bold text-slate-400  tracking-tighter text-center">Worked</Text>
            </View>

            {/* Box 5: Break Time */}
            <View className="flex-1 bg-white rounded-[24px] p-4 border border-slate-50 shadow-sm items-center">
              <View className="w-8 h-8 rounded-xl bg-amber-50 justify-center items-center mb-2">
                <Coffee size={16} color="#f59e0b" />
              </View>
              <Text className="text-lg font-bold text-slate-900">{formatCustomHours(liveStats.breaks)}hr</Text>
              <Text className="text-[8px] font-bold text-slate-400  tracking-tighter text-center">Breaks</Text>
            </View>

            {/* Box 6: Distance */}
            <View className="flex-1 bg-white rounded-[24px] p-4 border border-slate-50 shadow-sm items-center">
              <View className="w-8 h-8 rounded-xl bg-sky-50 justify-center items-center mb-2">
                <MapPin size={16} color="#0ea5e9" />
              </View>
              <Text className="text-lg font-bold text-slate-900">{(stats?.totalDistanceKm || 0).toFixed(1)}km</Text>
              <Text className="text-[8px] font-bold text-slate-400  tracking-tighter text-center">KM Dist</Text>
            </View>
          </View>
        </View>



        {/* Live Tracking Map Card */}
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
                geofenceEnabled={office?.geofenceEnabled}
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
              geofenceEnabled={office?.geofenceEnabled}
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

      {/* Custom Month Picker Modal */}
      <Modal
        visible={showMonthPicker}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowMonthPicker(false)}
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setShowMonthPicker(false)}
          className="flex-1 bg-black/40 justify-center items-center px-6"
        >
          <View className="bg-white rounded-[32px] w-full p-6 max-h-[70%] shadow-2xl border border-slate-100">
            <View className="flex-row justify-between items-center mb-4">
              <Text className="text-base font-bold text-slate-800">Select Month</Text>
              <TouchableOpacity onPress={() => setShowMonthPicker(false)}>
                <X size={20} color="#64748b" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {(() => {
                const monthsList = [];
                const today = new Date();
                // Show last 12 months
                for (let i = 0; i < 12; i++) {
                  const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
                  monthsList.push({
                    month: d.getMonth() + 1,
                    year: d.getFullYear(),
                    label: d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
                  });
                }
                return monthsList.map((item, idx) => {
                  const isSelected = selectedMonth.month === item.month && selectedMonth.year === item.year;
                  return (
                    <TouchableOpacity
                      key={idx}
                      onPress={() => handleSelectMonth(item.month, item.year)}
                      className={`py-3.5 px-4 rounded-2xl mb-2 flex-row justify-between items-center ${isSelected ? 'bg-indigo-50 border border-indigo-100' : 'bg-slate-50'
                        }`}
                    >
                      <Text className={`text-sm font-bold ${isSelected ? 'text-indigo-600' : 'text-slate-700'}`}>
                        {item.label}
                      </Text>
                      {isSelected && (
                        <View className="w-2 h-2 rounded-full bg-indigo-600" />
                      )}
                    </TouchableOpacity>
                  );
                });
              })()}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Dynamic sliding history drawer */}
      <NotificationDrawer
        visible={notifDrawerVisible}
        onClose={() => setNotifDrawerVisible(false)}
        onUpdateUnreadCount={(cnt) => setUnreadNotifications(cnt)}
      />
    </View>
  );
};

export default DashboardScreen;
