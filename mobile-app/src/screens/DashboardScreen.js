import {
  Bell,
  Building2,
  CalendarCheck,
  CalendarDays,
  Check,
  ClipboardList,
  Clock,
  LayoutGrid,
  MapPin,
  Menu,
  Navigation,
  Plus,
  Receipt,
  TrendingUp,
  Truck,
  User,
  Users,
  X
} from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Easing,
  Modal,
  ScrollView,
  StatusBar,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import api from "../api/axios";
import NotificationDrawer from "../components/NotificationDrawer";
import { useSidebar } from "../context/SidebarContext";

const MarqueeText = ({ text, className }) => {
  const animatedValue = useRef(new Animated.Value(150)).current;

  useEffect(() => {
    const runAnimation = () => {
      animatedValue.setValue(150);
      Animated.timing(animatedValue, {
        toValue: -350,
        duration: 15000,
        easing: Easing.linear,
        useNativeDriver: true,
      }).start(() => runAnimation());
    };
    runAnimation();
  }, [animatedValue]);

  return (
    <View style={{ overflow: "hidden", flex: 1 }}>
      <Animated.View style={{ transform: [{ translateX: animatedValue }] }}>
        <Text className={className} numberOfLines={1}>
          {text}
        </Text>
      </Animated.View>
    </View>
  );
};

const DashboardScreen = ({ navigation }) => {
  const { openSidebar } = useSidebar();
  const [notifDrawerVisible, setNotifDrawerVisible] = useState(false);
  const [unreadNotifications, setUnreadNotifications] = useState(0);

  useEffect(() => {
    const fetchUnread = () => {
      api.get('/notifications/employee/unread-count')
        .then(res => {
          if (res.data.success) {
            setUnreadNotifications(res.data.count || 0);
          }
        })
        .catch(() => {});
    };
    fetchUnread();
    const unsubscribe = navigation.addListener('focus', fetchUnread);
    return unsubscribe;
  }, [navigation]);

  // Icons available for the user to pick as shortcuts (mirrors the HR screen's 8 options).
  const shortcutOptions = [
    {
      key: "attendance",
      label: "Attendance",
      icon: CalendarCheck,
      iconColor: "#1972e9",
      onPress: () => navigation.navigate("Attendance"),
    },
    {
      key: "shift",
      label: "Shift",
      icon: Clock,
      iconColor: "#f59e0b",
      onPress: () => navigation.navigate("Shift"),
    },
    {
      key: "leaves",
      label: "Leaves",
      icon: CalendarDays,
      iconColor: "#ef4444",
      onPress: () => navigation.navigate("Leave"),
    },
    {
      key: "profile",
      label: "Profile",
      icon: User,
      iconColor: "#8b5cf6",
      onPress: () => navigation.navigate("Profile"),
    },
    {
      key: "monthlyView",
      label: "Monthly View",
      icon: LayoutGrid,
      iconColor: "#10b981",
      onPress: () => navigation.navigate("MonthlyViewScreen"),
    },
    {
      key: "customerVisit",
      label: "Customer Visit",
      icon: MapPin,
      iconColor: "#e91e63",
      onPress: () => navigation.navigate("CustomerVisitScreen"),
    },
    {
      key: "expenseClaim",
      label: "Expense Claim",
      icon: Receipt,
      iconColor: "#ff9800",
      comingSoon: true,
      onPress: () =>
        Alert.alert("Coming Soon", "Expense Claim will be available soon."),
    },
  ];

  // User-selected shortcuts (max 4), and whether the icon picker modal is open.
  const [shortcuts, setShortcuts] = useState([]);
  const [shortcutPickerVisible, setShortcutPickerVisible] = useState(false);

  const isShortcutSelected = (key) => shortcuts.some((s) => s.key === key);

  const toggleShortcut = (item) => {
    if (isShortcutSelected(item.key)) {
      setShortcuts((prev) => prev.filter((s) => s.key !== item.key));
      return;
    }
    if (shortcuts.length >= 4) {
      Alert.alert("Limit reached", "You can only pin up to 4 shortcuts. Remove one to add another.");
      return;
    }
    setShortcuts((prev) => [...prev, item]);
  };

  // Static Calendar Data for July 2026
  const calendarWeeks = [
    [
      { day: 28, isCurrentMonth: false },
      { day: 29, isCurrentMonth: false },
      { day: 30, isCurrentMonth: false },
      { day: 1, isCurrentMonth: true },
      { day: 2, isCurrentMonth: true },
      { day: 3, isCurrentMonth: true },
      { day: 4, isCurrentMonth: true },
    ],
    [
      { day: 5, isCurrentMonth: true },
      { day: 6, isCurrentMonth: true },
      { day: 7, isCurrentMonth: true },
      { day: 8, isCurrentMonth: true },
      { day: 9, isCurrentMonth: true },
      { day: 10, isCurrentMonth: true },
      { day: 11, isCurrentMonth: true },
    ],
    [
      { day: 12, isCurrentMonth: true },
      { day: 13, isCurrentMonth: true },
      { day: 14, isCurrentMonth: true },
      {
        day: 15,
        isCurrentMonth: true,
        textColor: "text-[#10b981]",
        labels: [
          { text: "Report", color: "text-[#10b981]" },
          { text: "Audit", color: "text-[#ef4444]" },
        ],
      },
      { day: 16, isCurrentMonth: true },
      { day: 17, isCurrentMonth: true },
      {
        day: 18,
        isCurrentMonth: true,
        textColor: "text-[#10b981]",
        labels: [{ text: "UI Repair", color: "text-[#10b981]" }],
      },
    ],
    [
      { day: 19, isCurrentMonth: true },
      {
        day: 20,
        isCurrentMonth: true,
        textColor: "text-[#ef4444]",
        labels: [
          { text: "DB", color: "text-[#ef4444]" },
          { text: "Creation", color: "text-[#ef4444]" },
        ],
      },
      { day: 21, isCurrentMonth: true },
      { day: 22, isCurrentMonth: true },
      { day: 23, isCurrentMonth: true, isSelected: true },
      { day: 24, isCurrentMonth: true },
      { day: 25, isCurrentMonth: true },
    ],
    [
      { day: 26, isCurrentMonth: true },
      { day: 27, isCurrentMonth: true },
      { day: 28, isCurrentMonth: true },
      { day: 29, isCurrentMonth: true },
      { day: 30, isCurrentMonth: true },
      { day: 31, isCurrentMonth: true },
      { day: 1, isCurrentMonth: false },
    ],
  ];

  return (
    <View className="flex-1 bg-[#f6f8fc]">
      <StatusBar barStyle="light-content" backgroundColor="#1972e9" />

      {/* Fixed Blue Background Header */}
      <View
        style={{ position: "absolute", top: 0, left: 0, right: 0, height: 445 }}
        className="bg-[#1972e9] rounded-b-[48px]"
      />

      {/* Sticky Header Row */}
      <View className="bg-[#1972e9] pt-14 pb-3 px-6 flex-row items-center justify-between z-10 shadow-sm">
        <TouchableOpacity onPress={openSidebar} activeOpacity={0.7}>
          <Menu size={28} color="white" />
        </TouchableOpacity>

        {/* Marquee ticker in the center of the sticky header */}
        <View className="flex-1 mx-4 bg-white/15 rounded-full py-1.5 px-3 flex-row items-center overflow-hidden">
          <View className="mr-1.5">
            <ClipboardList size={14} color="white" />
          </View>
          <MarqueeText
            text="Task: Submit weekly report · Task: Review dashboard mockup designs · Task: Clean codebase"
            className="text-white text-[11px] font-semibold tracking-wide"
          />
        </View>

        <TouchableOpacity onPress={() => setNotifDrawerVisible(true)} activeOpacity={0.7} className="relative">
          <Bell size={26} color="white" />
          {unreadNotifications > 0 && (
            <View className="absolute -top-1.5 -right-1.5 bg-[#f33c3c] min-w-[20px] h-5 px-1 rounded-full justify-center items-center border-2 border-[#1972e9]">
              <Text className="text-white text-[9px] font-extrabold">{unreadNotifications > 99 ? '99+' : unreadNotifications}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ flexGrow: 1 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Transparent top area containing the calendar card */}
        <View className="pt-2 pb-2 px-9">
          {/* White Calendar Card */}
          <View className="bg-white rounded-[24px] p-3 shadow-xl shadow-black/5 mt-1">
            {/* Calendar Month Header */}
            <Text className="text-[#a0aec0] font-bold text-center tracking-[0.15em] text-[10px] mb-2">
              JULY 2026
            </Text>

            {/* Weekday Initials Header */}
            <View className="flex-row justify-between mb-2">
              {["S", "M", "T", "W", "T", "F", "S"].map((day, idx) => (
                <Text
                  key={idx}
                  className="flex-1 text-center text-[#a0aec0] text-[9px] font-bold"
                >
                  {day}
                </Text>
              ))}
            </View>

            {/* Grid of Days */}
            {calendarWeeks.map((week, weekIdx) => (
              <View key={weekIdx} className="flex-row justify-between w-full">
                {week.map((dayObj, dayIdx) => {
                  const isInactive = !dayObj.isCurrentMonth;
                  const isSelected = dayObj.isSelected;
                  return (
                    <View
                      key={dayIdx}
                      className="flex-1 items-center min-h-[36px] justify-start"
                    >
                      {isSelected ? (
                        <View className="w-6 h-6 rounded-full bg-[#1972e9] justify-center items-center mb-0.5">
                          <Text className="text-white font-bold text-[11px]">
                            {dayObj.day}
                          </Text>
                        </View>
                      ) : (
                        <View className="w-6 h-6 justify-center items-center mb-0.5">
                          <Text
                            className={`font-bold text-[11px] ${isInactive
                              ? "text-slate-200"
                              : dayObj.textColor
                                ? dayObj.textColor
                                : "text-slate-800"
                              }`}
                          >
                            {dayObj.day}
                          </Text>
                        </View>
                      )}
                      {dayObj.labels &&
                        dayObj.labels.map((lbl, lblIdx) => (
                          <Text
                            key={lblIdx}
                            className={`text-[6px] font-bold text-center leading-3 ${lbl.color}`}
                          >
                            {lbl.text}
                          </Text>
                        ))}
                    </View>
                  );
                })}
              </View>
            ))}
          </View>

          {/* Date Label Below Calendar */}
          <Text className="text-white text-center font-bold text-[15px] mt-3 tracking-wide">
            Thursday, 23 July 2026
          </Text>
        </View>

        {/* Bottom Content Area - transparent background */}
        <View className="flex-1 bg-transparent px-4 pt-2 pb-8">
          {/* Action Grid (2x2) */}
          <View className="flex-row justify-between mb-4">
            {/* Department Card - not yet developed */}
            <TouchableOpacity
              activeOpacity={0.9}
              className="bg-[#eef1f5] rounded-[28px] p-6 w-[47%] items-center justify-center shadow-lg shadow-slate-100/50"
            >
              <View className="w-14 h-14 rounded-full bg-[#dde3ea] justify-center items-center mb-4">
                <Building2 size={24} color="#8a97a8" />
              </View>
              <Text className="text-slate-400 font-bold text-[14px] text-center tracking-wide">
                Department
              </Text>
              <Text className="text-[#f59e0b] font-bold text-[10px] text-center tracking-wide mt-1">
                Coming soon
              </Text>
            </TouchableOpacity>

            {/* HR Card - active / next in development */}
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() => navigation.navigate("HRScreen")}
              className="bg-white rounded-[28px] p-6 w-[47%] items-center justify-center shadow-lg shadow-slate-100/50"
            >
              <View className="w-14 h-14 rounded-full bg-[#fdf0f5] justify-center items-center mb-4">
                <Users size={24} color="#e91e63" />
              </View>
              <Text className="text-slate-800 font-bold text-[14px] text-center tracking-wide">
                HR
              </Text>
            </TouchableOpacity>
          </View>

          <View className="flex-row justify-between mb-6">
            {/* Reports Card - not yet developed */}
            <TouchableOpacity
              activeOpacity={0.9}
              className="bg-[#eef1f5] rounded-[28px] p-6 w-[47%] items-center justify-center shadow-lg shadow-slate-100/50"
            >
              <View className="w-14 h-14 rounded-full bg-[#f2e3d3] justify-center items-center mb-4">
                <TrendingUp size={24} color="#c9a06a" />
              </View>
              <Text className="text-slate-400 font-bold text-[14px] text-center tracking-wide">
                Reports
              </Text>
              <Text className="text-[#f59e0b] font-bold text-[10px] text-center tracking-wide mt-1">
                Coming soon
              </Text>
            </TouchableOpacity>

            {/* Material Movement Card - not yet developed */}
            <TouchableOpacity
              activeOpacity={0.9}
              className="bg-[#eef1f5] rounded-[28px] p-6 w-[47%] items-center justify-center shadow-lg shadow-slate-100/50"
            >
              <View className="w-14 h-14 rounded-full bg-[#d6e6e2] justify-center items-center mb-4">
                <Truck size={24} color="#7fa89d" />
              </View>
              <Text className="text-slate-400 font-bold text-[14px] text-center tracking-wide leading-5">
                Material{"\n"}Movement
              </Text>
              <Text className="text-[#f59e0b] font-bold text-[10px] text-center tracking-wide mt-1">
                Coming soon
              </Text>
            </TouchableOpacity>
          </View>

          {/* Shortcuts Panel */}
          <View className="bg-[#f0f4f9] rounded-[32px] p-5 shadow-sm">
            {/* Shortcuts Header */}
            <View className="flex-row justify-between items-center mb-6">
              <Text className="text-slate-800 font-bold text-[17px] tracking-wide ml-1">
                Shortcuts
              </Text>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setShortcutPickerVisible(true)}
                className="bg-[#1972e9] w-11 h-11 rounded-[16px] justify-center items-center shadow-md shadow-blue-500/20"
              >
                <Plus size={24} color="white" />
              </TouchableOpacity>
            </View>

            {/* Shortcuts Buttons Row - populated from user selection (max 4) */}
            {shortcuts.length === 0 ? (
              <View className="items-center py-2">
                <Text className="text-slate-400 font-semibold text-[12px] text-center">
                  No shortcuts yet. Tap + to pin up to 4.
                </Text>
              </View>
            ) : (
              <View className="flex-row justify-between px-1">
                {shortcuts.map((item) => {
                  const Icon = item.icon;
                  return (
                    <TouchableOpacity
                      key={item.key}
                      activeOpacity={0.7}
                      className="items-center flex-1"
                      onPress={item.onPress}
                    >
                      <View className="w-12 h-12 rounded-full bg-white justify-center items-center shadow-sm shadow-slate-200 mb-2">
                        <Icon size={20} color={item.iconColor} />
                      </View>
                      <Text className="text-slate-500 font-bold text-[11px] text-center">
                        {item.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {/*
            // ORIGINAL DUMMY SHORTCUTS (commented out - now replaced by user-selected shortcuts above)
            <View className="flex-row justify-between px-1">
              {/* Punch In *}
              <TouchableOpacity
                activeOpacity={0.7}
                className="items-center flex-1"
              >
                <View className="w-12 h-12 rounded-full bg-white justify-center items-center shadow-sm shadow-slate-200 mb-2">
                  <Fingerprint size={22} color="#1972e9" />
                </View>
                <Text className="text-slate-500 font-bold text-[11px] text-center">
                  Punch In
                </Text>
              </TouchableOpacity>

              {/* Leave *}
              <TouchableOpacity
                activeOpacity={0.7}
                className="items-center flex-1"
              >
                <View className="w-12 h-12 rounded-full bg-white justify-center items-center shadow-sm shadow-slate-200 mb-2">
                  <Calendar size={20} color="#ef4444" />
                </View>
                <Text className="text-slate-500 font-bold text-[11px] text-center">
                  Leave
                </Text>
              </TouchableOpacity>

              {/* Shift *}
              <TouchableOpacity
                activeOpacity={0.7}
                className="items-center flex-1"
              >
                <View className="w-12 h-12 rounded-full bg-white justify-center items-center shadow-sm shadow-slate-200 mb-2">
                  <Clock size={20} color="#f59e0b" />
                </View>
                <Text className="text-slate-500 font-bold text-[11px] text-center">
                  Shift
                </Text>
              </TouchableOpacity>

              {/* History *}
              <TouchableOpacity
                activeOpacity={0.7}
                className="items-center flex-1"
              >
                <View className="w-12 h-12 rounded-full bg-white justify-center items-center shadow-sm shadow-slate-200 mb-2">
                  <History size={20} color="#10b981" />
                </View>
                <Text className="text-slate-500 font-bold text-[11px] text-center">
                  History
                </Text>
              </TouchableOpacity>
            </View>
            */}
          </View>
        </View>
      </ScrollView>

      {/* Shortcut Icon Picker Modal - opens from the Shortcuts "+" button */}
      <Modal
        visible={shortcutPickerVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setShortcutPickerVisible(false)}
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setShortcutPickerVisible(false)}
          className="flex-1 bg-black/40 justify-end"
        >
          <TouchableOpacity activeOpacity={1} className="bg-white rounded-t-[32px] p-6 pb-10">
            <View className="flex-row justify-between items-center mb-1">
              <Text className="text-slate-800 font-bold text-[18px]">
                Choose Shortcuts
              </Text>
              <TouchableOpacity
                onPress={() => setShortcutPickerVisible(false)}
                className="w-9 h-9 rounded-full bg-slate-100 justify-center items-center"
              >
                <X size={18} color="#64748b" />
              </TouchableOpacity>
            </View>
            <Text className="text-slate-400 font-semibold text-[12px] mb-5">
              Pick up to 4 icons from HR to pin here ({shortcuts.length}/4 selected)
            </Text>

            <View className="flex-row flex-wrap justify-between">
              {shortcutOptions.map((item) => {
                const Icon = item.icon;
                const selected = isShortcutSelected(item.key);
                return (
                  <TouchableOpacity
                    key={item.key}
                    activeOpacity={0.85}
                    onPress={() => toggleShortcut(item)}
                    className={`w-[47%] mb-4 rounded-[20px] p-4 items-center border ${selected
                      ? "bg-[#ebf3fe] border-[#1972e9]"
                      : "bg-[#f6f8fc] border-transparent"
                      }`}
                  >
                    <View className="w-12 h-12 rounded-full bg-white justify-center items-center mb-2 shadow-sm shadow-slate-200">
                      <Icon size={20} color={item.iconColor} />
                    </View>
                    <Text className="text-slate-700 font-bold text-[12px] text-center">
                      {item.label}
                    </Text>
                    {selected && (
                      <View className="absolute top-2 right-2 w-5 h-5 rounded-full bg-[#1972e9] justify-center items-center">
                        <Check size={12} color="white" />
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => setShortcutPickerVisible(false)}
              className="bg-[#1972e9] rounded-2xl py-4 items-center mt-2"
            >
              <Text className="text-white font-bold text-[14px]">Done</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <NotificationDrawer
        visible={notifDrawerVisible}
        onClose={() => setNotifDrawerVisible(false)}
        onUpdateUnreadCount={(cnt) => setUnreadNotifications(cnt)}
      />
    </View>
  );
};

export default DashboardScreen;

// =============================================================================
// ORIGINAL CODE (COMMENTED OUT AS REQUESTED)
// =============================================================================
/*
import * as Location from 'expo-location';
import {
  Bell,
  Calendar,
  CircleCheck,
  Clock,
  Coffee,
  MapPin,
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

const OriginalDashboardScreen = ({ navigation }) => {
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
            const { latitude, longitude, accuracy, speed, altitude, heading, mocked } = loc.coords;

            // Push point to the offline queue
            const { addPointToQueue, syncQueue } = require('../utils/offlineQueue');
            await addPointToQueue({
              latitude,
              longitude,
              accuracy,
              speed: speed || 0,
              heading,
              isMock: mocked,
              timestamp: Date.now()
            });

            // Trigger synchronization
            await syncQueue();
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

      <View className="bg-blue-600 rounded-b-3xl pt-14 pb-5 px-6 border-b border-slate-100 flex-row justify-between items-center">

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

        <View className="px-6 mt-4">
          <View className="flex-row" style={{ gap: 10 }}>
            <View className="flex-1 bg-white rounded-[24px] p-4 border border-slate-50 shadow-sm items-center">
              <View className="w-8 h-8 rounded-xl bg-indigo-50 justify-center items-center mb-2">
                <CircleCheck size={16} color="#4f46e5" />
              </View>
              <Text className="text-lg font-bold text-slate-900">{stats?.workingDays || 0}</Text>
              <Text className="text-[8px] font-bold text-slate-400  tracking-tighter text-center">Present</Text>
            </View>

            <View className="flex-1 bg-white rounded-[24px] p-4 border border-slate-50 shadow-sm items-center">
              <View className="w-8 h-8 rounded-xl bg-rose-50 justify-center items-center mb-2">
                <X size={16} color="#f43f5e" />
              </View>
              <Text className="text-lg font-bold text-slate-900">{stats?.absentDays || 0}</Text>
              <Text className="text-[8px] font-bold text-slate-400  tracking-tighter text-center">Absent</Text>
            </View>

            <View className="flex-1 bg-white rounded-[24px] p-4 border border-slate-50 shadow-sm items-center">
              <View className="w-8 h-8 rounded-xl bg-amber-50 justify-center items-center mb-2">
                <Calendar size={16} color="#f59e0b" />
              </View>
              <Text className="text-lg font-bold text-slate-900">{stats?.leaveDays || 0}</Text>
              <Text className="text-[8px] font-bold text-slate-400  tracking-tighter text-center">Leave</Text>
            </View>
          </View>

          <View className="flex-row mt-3" style={{ gap: 10 }}>
            <View className="flex-1 bg-white rounded-[24px] p-4 border border-slate-50 shadow-sm items-center">
              <View className="w-8 h-8 rounded-xl bg-emerald-50 justify-center items-center mb-2">
                <Clock size={16} color="#10b981" />
              </View>
              <Text className="text-lg font-bold text-slate-900">{formatCustomHours(liveStats.worked)}hr</Text>
              <Text className="text-[8px] font-bold text-slate-400  tracking-tighter text-center">Worked</Text>
            </View>

            <View className="flex-1 bg-white rounded-[24px] p-4 border border-slate-50 shadow-sm items-center">
              <View className="w-8 h-8 rounded-xl bg-amber-50 justify-center items-center mb-2">
                <Coffee size={16} color="#f59e0b" />
              </View>
              <Text className="text-lg font-bold text-slate-900">{formatCustomHours(liveStats.breaks)}hr</Text>
              <Text className="text-[8px] font-bold text-slate-400  tracking-tighter text-center">Breaks</Text>
            </View>

            <View className="flex-1 bg-white rounded-[24px] p-4 border border-slate-50 shadow-sm items-center">
              <View className="w-8 h-8 rounded-xl bg-sky-50 justify-center items-center mb-2">
                <MapPin size={16} color="#0ea5e9" />
              </View>
              <Text className="text-lg font-bold text-slate-900">{(stats?.totalDistanceKm || 0).toFixed(1)}km</Text>
              <Text className="text-[8px] font-bold text-slate-400  tracking-tighter text-center">KM Dist</Text>
            </View>
          </View>
        </View>

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

      <NotificationDrawer
        visible={notifDrawerVisible}
        onClose={() => setNotifDrawerVisible(false)}
        onUpdateUnreadCount={(cnt) => setUnreadNotifications(cnt)}
      />
    </View>
  );
};
*/