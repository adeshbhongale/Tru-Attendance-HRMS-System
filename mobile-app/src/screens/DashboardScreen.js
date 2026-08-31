import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  Bell,
  Building2,
  CalendarCheck,
  CalendarDays,
  Check,
  CheckSquare,
  ClipboardList,
  Clock,
  LayoutGrid,
  MapPin,
  Package,
  Pencil,
  Plus,
  Receipt,
  RefreshCw,
  Trash2,
  TrendingUp,
  User,
  Users,
  X
} from "lucide-react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import api from "../api/axios";
import taskApi from "../api/taskApi";
import MarqueeText from "../components/MarqueeText";
import MiniCalendar from "../components/MiniCalendar";
import NotificationDrawer from "../components/NotificationDrawer";
import { checkIfUpdateAvailable, manualCheckForUpdates } from "../services/updateService";
// import { useSidebar } from "../context/SidebarContext"; // SIDEBAR COMMENTED OUT

// Task status config — module-level constant
const TASK_STATUS = {
  pending: { label: 'Pending', color: '#1972e9', bg: '#eff6ff', border: '#bfdbfe' },
  in_progress: { label: 'In Progress', color: '#f59e0b', bg: '#fffbeb', border: '#fde68a' },
  inProcess: { label: 'In Progress', color: '#f59e0b', bg: '#fffbeb', border: '#fde68a' },
  overdue: { label: 'Overdue', color: '#ef4444', bg: '#fef2f2', border: '#fecaca' },
  completed: { label: 'Completed', color: '#10b981', bg: '#ecfdf5', border: '#a7f3d0' },
};

const DashboardScreen = ({ navigation }) => {
  // const { openSidebar } = useSidebar(); // SIDEBAR COMMENTED OUT
  const [notifDrawerVisible, setNotifDrawerVisible] = useState(false);
  const [unreadNotifications, setUnreadNotifications] = useState(0);

  // task object shape: { text: string, status: 'pending' | 'inProcess' | 'completed' }
  const [selectedDay, setSelectedDay] = useState(null);
  const [taskModalVisible, setTaskModalVisible] = useState(false);
  const [taskModalTasks, setTaskModalTasks] = useState([]);
  const [taskModalDate, setTaskModalDate] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [editingTasks, setEditingTasks] = useState([]);

  // Marquee text — defaults to pending tasks across all events
  const [marqueeText, setMarqueeText] = useState('');

  // OTA Updates notification state
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [checkingUpdate, setCheckingUpdate] = useState(false);

  // Mobile access config — blocked screens from admin config
  const [blockedScreens, setBlockedScreens] = useState([]);

  // Reporting status for Leave Approvals shortcut
  const [hasSubordinates, setHasSubordinates] = useState(false);

  const checkReportingStatus = async () => {
    try {
      let isAdminOrHr = false;
      const userStr = await AsyncStorage.getItem('user');
      if (userStr) {
        const u = JSON.parse(userStr);
        const userRole = (u.role || '').toLowerCase();
        const userRoleCode = (u.roleCode || '').toUpperCase();
        if (userRole === 'admin' || userRole === 'superadmin' || userRole === 'hr' || userRoleCode === 'TCSA1' || userRoleCode === 'TCCA1') {
          isAdminOrHr = true;
        }
      }

      const res = await api.get('/leaves/approvals');
      const data = res.data?.data || [];
      const hasSubs = res.data?.hasSubordinates !== undefined ? res.data.hasSubordinates : (isAdminOrHr || data.length > 0);
      setHasSubordinates(Boolean(hasSubs || isAdminOrHr));
    } catch (_) {
      setHasSubordinates(false);
    }
  };

  const loadMobileAccessConfig = async () => {
    try {
      const configStr = await AsyncStorage.getItem('@mobileAccessConfig');
      if (configStr) {
        const config = JSON.parse(configStr);
        setBlockedScreens(config.blockedScreens || []);
      }
      const accessRes = await api.get('/mobile-config/my-access');
      if (accessRes.data?.success && accessRes.data?.data) {
        const liveConfig = accessRes.data.data;
        setBlockedScreens(liveConfig.blockedScreens || []);
        await AsyncStorage.setItem('@mobileAccessConfig', JSON.stringify(liveConfig));
      }
    } catch (_) { }
  };

  useEffect(() => {
    const fetchUnread = () => {
      api.get('/notifications/employee/unread-count')
        .then(res => {
          if (res.data.success) {
            setUnreadNotifications(res.data.count || 0);
          }
        })
        .catch(() => { });
    };

    const checkOtaUpdate = async () => {
      const hasUpdate = await checkIfUpdateAvailable();
      setUpdateAvailable(hasUpdate);
    };

    fetchUnread();
    checkOtaUpdate();
    loadMobileAccessConfig();
    checkReportingStatus();

    const unsubscribeFocus = navigation.addListener('focus', () => {
      fetchUnread();
      checkOtaUpdate();
      loadMobileAccessConfig();
      checkReportingStatus();
    });
    return unsubscribeFocus;
  }, [navigation]);



  // Map shortcut keys to MobileAppConfig screen keys
  const isScreenBlocked = useCallback((key, blockedList = blockedScreens) => {
    const keyMap = {
      leaves: 'leave',
      leave: 'leave',
      leaveApprovals: 'leaveApprovals',
      shift: 'shift',
      monthlyView: 'monthlyView',
      customerVisit: 'customerVisit',
      expenseClaim: 'expenseClaim',
      attendance: 'attendance',
      reports: 'reports',
      orgChart: 'orgChart',
      profile: 'profile'
    };
    const configKey = keyMap[key] || key;
    return (blockedList || []).includes(configKey);
  }, [blockedScreens]);

  // Icons available for the user to pick as shortcuts (mirrors HR screen options).
  const shortcutOptions = useMemo(() => {
    const allOptions = [
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
      ...(hasSubordinates ? [{
        key: "leaveApprovals",
        label: "Leave Approvals",
        icon: CheckSquare,
        iconColor: "#059669",
        onPress: () => navigation.navigate("LeaveApprovals"),
      }] : []),
      {
        key: "orgChart",
        label: "Org. Chart",
        icon: Users,
        iconColor: "#4f46e5",
        onPress: () => navigation.navigate("OrgChartScreen"),
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
        onPress: () => navigation.navigate("ExpenseDashboard"),
      },
      {
        key: "reports",
        label: "Reports",
        icon: TrendingUp,
        iconColor: "#0284c7",
        onPress: () => navigation.navigate("Reports"),
      },
    ];

    return allOptions.filter(opt => !isScreenBlocked(opt.key, blockedScreens));
  }, [blockedScreens, isScreenBlocked, hasSubordinates, navigation]);

  // User-selected shortcuts (max 4), persisted across app restarts & screen navigations
  const [shortcutKeys, setShortcutKeys] = useState([]);
  const [shortcutPickerVisible, setShortcutPickerVisible] = useState(false);

  // Helper to sanitize shortcuts against blocked screens and ensure valid list
  const sanitizeShortcuts = useCallback((keys, blockedList) => {
    if (!Array.isArray(keys)) return [];
    return keys.filter(key => !isScreenBlocked(key, blockedList));
  }, [isScreenBlocked]);

  // Load shortcuts from AsyncStorage on initial mount and on navigation focus
  useEffect(() => {
    let isMounted = true;
    const loadSavedShortcuts = async () => {
      try {
        const saved = await AsyncStorage.getItem('@dashboard_user_shortcuts');
        let currentBlocked = blockedScreens;
        try {
          const configStr = await AsyncStorage.getItem('@mobileAccessConfig');
          if (configStr) {
            const config = JSON.parse(configStr);
            if (Array.isArray(config.blockedScreens)) {
              currentBlocked = config.blockedScreens;
            }
          }
        } catch (_) {}

        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) {
            // Remove any keys that are blocked for the employee
            const cleanKeys = sanitizeShortcuts(parsed, currentBlocked);
            if (isMounted) {
              setShortcutKeys(cleanKeys);
            }
            if (cleanKeys.length !== parsed.length) {
              await AsyncStorage.setItem('@dashboard_user_shortcuts', JSON.stringify(cleanKeys));
            }
            return;
          }
        }

        // Default initial shortcuts if user has never customized them
        if (isMounted) {
          const allCandidateKeys = ['attendance', 'shift', 'leaves', 'leaveApprovals', 'orgChart', 'profile', 'monthlyView', 'customerVisit', 'expenseClaim', 'reports'];
          const defaultClean = allCandidateKeys.filter(k => !isScreenBlocked(k, currentBlocked)).slice(0, 4);
          setShortcutKeys(defaultClean);
          await AsyncStorage.setItem('@dashboard_user_shortcuts', JSON.stringify(defaultClean));
        }
      } catch (e) {
        console.warn('[DashboardScreen] Failed to load shortcuts from storage:', e);
      }
    };

    loadSavedShortcuts();
    const unsubscribe = navigation.addListener('focus', loadSavedShortcuts);
    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [navigation, blockedScreens, isScreenBlocked, sanitizeShortcuts]);

  // Clean shortcuts whenever blockedScreens change
  useEffect(() => {
    setShortcutKeys(prev => {
      const cleaned = sanitizeShortcuts(prev, blockedScreens);
      if (cleaned.length !== prev.length) {
        AsyncStorage.setItem('@dashboard_user_shortcuts', JSON.stringify(cleaned)).catch(() => {});
        return cleaned;
      }
      return prev;
    });
  }, [blockedScreens, sanitizeShortcuts]);

  // Map keys back to valid shortcut option definitions
  const shortcuts = useMemo(() => {
    const validMap = new Map(shortcutOptions.map(opt => [opt.key, opt]));
    return shortcutKeys
      .map(key => validMap.get(key))
      .filter(Boolean);
  }, [shortcutKeys, shortcutOptions]);

  const isShortcutSelected = (key) => {
    return shortcuts.some(s => s.key === key);
  };

  const toggleShortcut = async (item) => {
    // Current active, unblocked shortcut keys
    const currentValidKeys = shortcuts.map(s => s.key);
    let newKeys;

    if (currentValidKeys.includes(item.key)) {
      newKeys = currentValidKeys.filter(k => k !== item.key);
    } else {
      if (currentValidKeys.length >= 4) {
        Alert.alert("Limit reached", "You can only pin up to 4 shortcuts. Remove one to add another.");
        return;
      }
      newKeys = [...currentValidKeys, item.key];
    }

    setShortcutKeys(newKeys);
    try {
      await AsyncStorage.setItem('@dashboard_user_shortcuts', JSON.stringify(newKeys));
    } catch (e) {
      console.warn('[DashboardScreen] Failed to save shortcuts to storage:', e);
    }
  };

  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [selectedFullDate, setSelectedFullDate] = useState(new Date());

  // Dynamic backend calendar events & holidays
  const [calendarEvents, setCalendarEvents] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [calendarLoading, setCalendarLoading] = useState(false);

  // Month/year for modal date label
  const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  /**
   * Formats active / pending tasks from across the calendar into a single marquee string.
   */
  const getPendingMarquee = (events, monthIdx = new Date().getMonth(), yearVal = new Date().getFullYear()) => {
    if (!Array.isArray(events) || events.length === 0) return 'No pending tasks — great job! 🎉';
    const monthStr = MONTH_NAMES[monthIdx].slice(0, 3);
    const pendingItems = [];

    events.forEach((ev) => {
      (ev.tasks || []).forEach((t) => {
        if (t && (t.status === 'pending' || t.status === 'in_progress' || t.status === 'inProcess' || t.status === 'overdue')) {
          const prefix = t.status === 'overdue' ? '⚠️ Overdue' : t.status === 'in_progress' || t.status === 'inProcess' ? '⏳ In Progress' : '📌 Pending';
          pendingItems.push(`[${monthStr} ${ev.day}] ${prefix}: ${t.text || t.title}`);
        }
      });
    });

    if (pendingItems.length === 0) return 'No pending tasks — great job! 🎉';
    return `Active Tasks: ${pendingItems.join('   •   ')}`;
  };

  /**
   * Formats tasks for a specific selected date into a marquee string showing all tasks.
   */
  const formatDayTasksMarquee = (day, tasks, monthIdx = new Date().getMonth(), yearVal = new Date().getFullYear()) => {
    const monthStr = MONTH_NAMES[monthIdx].slice(0, 3);
    if (!tasks || tasks.length === 0) return getPendingMarquee(calendarEvents, monthIdx, yearVal);

    const formatted = tasks.map((t, i) => {
      const cfg = TASK_STATUS[t.status] || TASK_STATUS.pending;
      return `Task ${i + 1} [${cfg.label}]: ${t.text || t.title}`;
    });

    return `${monthStr} ${day} Tasks: ${formatted.join('   •   ')}`;
  };

  const fetchCalendarTasks = useCallback(async (year, month) => {
    setCalendarLoading(true);
    try {
      const res = await taskApi.getCalendarTasks(year, month);
      const evs = res.events || [];
      const hols = res.holidays || [];
      setCalendarEvents(evs);
      setHolidays(hols);

      const todayNum = new Date().getDate();
      const isCurrentMonthView = year === new Date().getFullYear() && month === new Date().getMonth();
      if (isCurrentMonthView) {
        const todayEvent = evs.find((e) => e.day === todayNum);
        if (todayEvent && todayEvent.tasks?.length > 0) {
          setMarqueeText(formatDayTasksMarquee(todayNum, todayEvent.tasks, month, year));
        } else {
          setMarqueeText(getPendingMarquee(evs, month, year));
        }
      } else {
        setMarqueeText(getPendingMarquee(evs, month, year));
      }
    } catch (err) {
      console.warn('Fetch calendar tasks error:', err);
    } finally {
      setCalendarLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCalendarTasks(viewYear, viewMonth);
    const unsubscribe = navigation.addListener('focus', () => {
      fetchCalendarTasks(viewYear, viewMonth);
    });
    return unsubscribe;
  }, [navigation, viewYear, viewMonth, fetchCalendarTasks]);

  const handleMonthChange = (y, m) => {
    setViewYear(y);
    setViewMonth(m);
    fetchCalendarTasks(y, m);
  };

  const handleDayPress = (day, tasks, fullDate) => {
    const targetDate = fullDate || new Date(viewYear, viewMonth, day);
    setSelectedDay(day);
    setSelectedFullDate(targetDate);
    const dateLabel = `${MONTH_NAMES[targetDate.getMonth()]} ${day}, ${targetDate.getFullYear()}`;
    setTaskModalDate(dateLabel);
    setTaskModalTasks(tasks || []);
    setEditingTasks((tasks || []).map((t) => ({ ...t, text: t.text || t.title })));
    setIsEditing(false);
    setTaskModalVisible(true);

    if (tasks && tasks.length > 0) {
      setMarqueeText(formatDayTasksMarquee(day, tasks, viewMonth, viewYear));
    } else {
      setMarqueeText(getPendingMarquee(calendarEvents, viewMonth, viewYear));
    }
  };

  // Update a single task's status in view mode
  const updateTaskStatus = async (idx, newStatus) => {
    const task = taskModalTasks[idx];
    const updated = taskModalTasks.map((t, i) =>
      i === idx ? { ...t, status: newStatus } : t
    );
    setTaskModalTasks(updated);

    if (task && (task._id || task.id)) {
      try {
        await taskApi.updateTaskStatus(task._id || task.id, newStatus);
        fetchCalendarTasks(viewYear, viewMonth);
      } catch (err) {
        console.warn('Update task status error:', err);
      }
    }
  };

  const handleSaveTasks = async () => {
    try {
      const validTasks = editingTasks.filter((t) => (t.text || t.title || '').trim() !== '');
      const targetDate = selectedFullDate || new Date(viewYear, viewMonth, selectedDay);

      for (const t of validTasks) {
        if (t._id || t.id) {
          await taskApi.updateTask(t._id || t.id, {
            title: (t.text || t.title).trim(),
            status: t.status || 'pending',
            dueDate: targetDate,
          });
        } else {
          await taskApi.createTask({
            title: (t.text || t.title).trim(),
            status: t.status || 'pending',
            dueDate: targetDate,
          });
        }
      }

      setIsEditing(false);
      setTaskModalVisible(false);
      await fetchCalendarTasks(viewYear, viewMonth);
    } catch (err) {
      Alert.alert('Error', 'Failed to save tasks: ' + (err.message || 'Server error'));
    }
  };

  const handleDeleteTask = async (taskId, idx) => {
    try {
      if (taskId) {
        await taskApi.deleteTask(taskId);
      }
      setEditingTasks((prev) => prev.filter((_, i) => i !== idx));
      setTaskModalTasks((prev) => prev.filter((t, i) => (t._id || t.id ? (t._id || t.id) !== taskId : i !== idx)));
      fetchCalendarTasks(viewYear, viewMonth);
    } catch (err) {
      Alert.alert('Error', 'Failed to delete task.');
    }
  };

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
        {/* SIDEBAR BUTTON COMMENTED OUT
        <TouchableOpacity onPress={openSidebar} activeOpacity={0.7}>
          <Menu size={28} color="white" />
        </TouchableOpacity>
        */}

        {/* Marquee ticker in the center of the sticky header */}
        <View className="flex-1 mx-4 bg-white/15 rounded-full py-1.5 px-3 flex-row items-center overflow-hidden">
          <View className="mr-1.5">
            <ClipboardList size={14} color="white" />
          </View>
          <MarqueeText
            text={marqueeText}
            className="text-white text-[11px] font-semibold tracking-wide"
          />
        </View>

        <View className="flex-row items-center gap-2">
          {/* Check for Updates Header Button */}
          <TouchableOpacity
            onPress={async () => {
              setCheckingUpdate(true);
              try {
                const res = await manualCheckForUpdates();
                if (res?.isAvailable) {
                  setUpdateAvailable(true);
                } else {
                  setUpdateAvailable(false);
                }
              } finally {
                setCheckingUpdate(false);
              }
            }}
            activeOpacity={0.75}
            className="w-10 h-10 rounded-full bg-white/15 justify-center items-center relative"
          >
            {checkingUpdate ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <RefreshCw size={18} color="white" />
            )}
            {updateAvailable && (
              <View className="absolute -top-1 -right-1 bg-[#10b981] min-w-[18px] h-[18px] px-1 rounded-full justify-center items-center border-2 border-[#1972e9]">
                <Text className="text-white text-[9px] font-extrabold">1</Text>
              </View>
            )}
          </TouchableOpacity>

          {/* Notifications Bell */}
          <TouchableOpacity
            onPress={() => setNotifDrawerVisible(true)}
            activeOpacity={0.7}
            className="w-10 h-10 rounded-full bg-white/15 justify-center items-center relative"
          >
            <Bell size={20} color="white" />
            {unreadNotifications > 0 && (
              <View className="absolute -top-1 -right-1 bg-[#f33c3c] min-w-[18px] h-[18px] px-1 rounded-full justify-center items-center border-2 border-[#1972e9]">
                <Text className="text-white text-[9px] font-extrabold">{unreadNotifications > 99 ? '99+' : unreadNotifications}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ flexGrow: 1 }}
        showsVerticalScrollIndicator={false}
      >
        {/* New Update Available Alert Banner on Home */}
        {updateAvailable && (
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={async () => {
              setCheckingUpdate(true);
              try {
                await manualCheckForUpdates();
              } finally {
                setCheckingUpdate(false);
              }
            }}
            className="mx-4 mt-3 mb-2 bg-emerald-500 rounded-2xl p-3.5 flex-row items-center justify-between shadow-md"
          >
            <View className="flex-row items-center flex-1 mr-2">
              <View className="w-8 h-8 rounded-full bg-white/20 items-center justify-center mr-2.5">
                <RefreshCw size={16} color="white" />
              </View>
              <View className="flex-1">
                <Text className="text-white font-extrabold text-xs">New Update Ready</Text>
                <Text className="text-emerald-100 text-[10px] font-medium">Tap to apply latest changes & reload</Text>
              </View>
            </View>
            <View className="bg-white px-3 py-1.5 rounded-xl">
              <Text className="text-emerald-700 font-extrabold text-[11px]">Update (1)</Text>
            </View>
          </TouchableOpacity>
        )}

        {/* Mini Calendar Component */}
        <MiniCalendar
          events={calendarEvents}
          holidays={holidays}
          selectedDay={selectedDay}
          onDayPress={handleDayPress}
          onMonthChange={handleMonthChange}
        />

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
            {/* Reports Card - Active */}
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() => navigation.navigate("Reports")}
              className="bg-white rounded-[28px] p-6 w-[47%] items-center justify-center shadow-lg shadow-slate-100/50 border border-indigo-50"
            >
              <View className="w-14 h-14 rounded-full bg-[#eff6ff] justify-center items-center mb-4">
                <TrendingUp size={24} color="#0284c7" />
              </View>
              <Text className="text-slate-800 font-bold text-[14px] text-center tracking-wide">
                Reports
              </Text>
            </TouchableOpacity>

            {/* Material Movement Card - Disabled (Original code commented out below) */}
            {/*
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() => navigation.navigate("MaterialMovementHub")}
              className="bg-white rounded-[28px] p-6 w-[47%] items-center justify-center shadow-lg shadow-slate-100/50 border border-indigo-50"
            >
              <View className="w-14 h-14 rounded-full bg-[#f5f3ff] justify-center items-center mb-4">
                <Package size={24} color="#7c3aed" />
              </View>
              <Text className="text-slate-800 font-bold text-[14px] text-center tracking-wide">
                Material Movement
              </Text>
            </TouchableOpacity>
            */}
            <TouchableOpacity
              activeOpacity={1}
              disabled={true}
              /* onPress={() => navigation.navigate("MaterialMovementHub")} */
              className="bg-[#eef1f5] rounded-[28px] p-6 w-[47%] items-center justify-center shadow-lg shadow-slate-100/50"
            >
              <View className="w-14 h-14 rounded-full bg-[#dde3ea] justify-center items-center mb-4">
                <Package size={24} color="#8a97a8" />
              </View>
              <Text className="text-slate-400 font-bold text-[14px] text-center tracking-wide">
                Material Movement
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
              <View className="items-center py-4">
                <Text className="text-slate-400 font-semibold text-[13px] text-center">
                  No shortcuts yet. Tap + to pin up to 4.
                </Text>
              </View>
            ) : (
              <View className="flex-row justify-around px-1 py-1">
                {shortcuts.map((item) => {
                  const Icon = item.icon;
                  return (
                    <TouchableOpacity
                      key={item.key}
                      activeOpacity={0.75}
                      className="items-center flex-1 mx-1"
                      onPress={item.onPress}
                    >
                      <View
                        className="bg-white justify-center items-center shadow-md shadow-slate-200/70 mb-2 border border-slate-100"
                        style={{ width: 58, height: 58, borderRadius: 20 }}
                      >
                        <Icon size={26} color={item.iconColor} />
                      </View>
                      <Text
                        className="text-slate-700 font-bold text-[12px] text-center"
                        numberOfLines={1}
                      >
                        {item.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}


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
                    className={`w-[48%] mb-4 rounded-[22px] p-4 items-center border ${selected
                      ? "bg-[#ebf3fe] border-[#1972e9]"
                      : "bg-[#f6f8fc] border-transparent"
                      }`}
                  >
                    <View
                      className="bg-white justify-center items-center mb-2 shadow-sm shadow-slate-200"
                      style={{ width: 54, height: 54, borderRadius: 18 }}
                    >
                      <Icon size={26} color={item.iconColor} />
                    </View>
                    <Text className="text-slate-700 font-bold text-[13px] text-center">
                      {item.label}
                    </Text>
                    {selected && (
                      <View className="absolute top-2 right-2 w-6 h-6 rounded-full bg-[#1972e9] justify-center items-center shadow-sm">
                        <Check size={14} color="white" />
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => setShortcutPickerVisible(false)}
              className="bg-[#1972e9] rounded-2xl py-4 items-center mt-2 shadow-md shadow-blue-500/20"
            >
              <Text className="text-white font-bold text-[14px]">Done</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ── Task Modal ── */}
      <Modal
        visible={taskModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => { setTaskModalVisible(false); setIsEditing(false); }}
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => { setTaskModalVisible(false); setIsEditing(false); }}
          className="flex-1 bg-black/50 justify-end"
        >
          <TouchableOpacity activeOpacity={1} className="bg-white rounded-t-[32px] px-5 pt-5 pb-10">
            {/* Handle bar */}
            <View className="w-10 h-1 rounded-full bg-slate-200 self-center mb-4" />

            {/* Header */}
            <View className="flex-row justify-between items-center mb-1">
              <View className="flex-row items-center">
                <View className="w-9 h-9 rounded-2xl bg-[#ebf3fe] justify-center items-center mr-3">
                  <ClipboardList size={17} color="#1972e9" />
                </View>
                <View>
                  <Text className="text-slate-800 font-bold text-[16px]">Tasks</Text>
                  <Text className="text-slate-400 font-semibold text-[11px]">{taskModalDate}</Text>
                </View>
              </View>
              <View className="flex-row items-center">
                {!isEditing ? (
                  <TouchableOpacity
                    onPress={() => { setEditingTasks(taskModalTasks.map(t => ({ ...t }))); setIsEditing(true); }}
                    className="w-8 h-8 rounded-full bg-[#ebf3fe] justify-center items-center mr-2"
                  >
                    <Pencil size={14} color="#1972e9" />
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    onPress={handleSaveTasks}
                    className="px-4 h-8 rounded-full bg-[#1972e9] justify-center items-center mr-2"
                  >
                    <Text className="text-white font-bold text-[11px]">Save</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  onPress={() => { setTaskModalVisible(false); setIsEditing(false); }}
                  className="w-8 h-8 rounded-full bg-slate-100 justify-center items-center"
                >
                  <X size={16} color="#64748b" />
                </TouchableOpacity>
              </View>
            </View>

            {/* Status legend strip */}
            <View className="flex-row flex-wrap gap-2 mt-3 mb-3">
              {[
                { key: 'pending', label: 'Pending', dot: '#1972e9' },
                { key: 'in_progress', label: 'In Progress', dot: '#f59e0b' },
                { key: 'overdue', label: 'Overdue', dot: '#ef4444' },
                { key: 'completed', label: 'Completed', dot: '#10b981' },
              ].map(s => (
                <View key={s.key} className="flex-row items-center mr-2">
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: s.dot, marginRight: 4 }} />
                  <Text className="text-slate-500 text-[10px] font-semibold">{s.label}</Text>
                </View>
              ))}
            </View>

            {/* Task count badge */}
            <View className="bg-[#f0f4f9] rounded-xl px-4 py-2 mb-3 flex-row items-center">
              <View className="w-2 h-2 rounded-full bg-[#1972e9] mr-2" />
              <Text className="text-slate-500 font-semibold text-[11px]">
                {isEditing
                  ? `${editingTasks.length} task${editingTasks.length !== 1 ? 's' : ''} (editing)`
                  : `${taskModalTasks.length} task${taskModalTasks.length !== 1 ? 's' : ''} scheduled`
                }
              </Text>
            </View>

            {/* ── VIEW MODE ── */}
            {!isEditing && (
              taskModalTasks.length === 0 ? (
                <View className="items-center py-6">
                  <View className="w-14 h-14 rounded-full bg-slate-100 justify-center items-center mb-3">
                    <ClipboardList size={24} color="#94a3b8" />
                  </View>
                  <Text className="text-slate-500 font-bold text-[15px]">No tasks for this day</Text>
                  <Text className="text-slate-400 font-semibold text-[12px] mt-1 text-center">
                    Tap the pencil icon above to add a task
                  </Text>
                  <TouchableOpacity
                    onPress={() => {
                      setEditingTasks([{ text: '', status: 'pending' }]);
                      setIsEditing(true);
                    }}
                    className="mt-4 flex-row items-center bg-[#1972e9] px-4 py-2.5 rounded-full"
                  >
                    <Plus size={14} color="#ffffff" />
                    <Text className="text-white font-bold text-[11.5px] ml-1.5">+ Add New Task</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                taskModalTasks.map((task, idx) => {
                  const isOverdue = task.status === 'overdue';
                  const st = TASK_STATUS[task.status] || TASK_STATUS.pending;
                  return (
                    <View
                      key={task._id || idx}
                      style={{ backgroundColor: st.bg, borderColor: st.border, borderWidth: 1 }}
                      className="rounded-2xl px-4 py-3 mb-2"
                    >
                      {/* Task text row */}
                      <View className="flex-row items-start justify-between mb-2">
                        <View className="flex-row items-start flex-1 mr-2">
                          <View style={{ backgroundColor: st.color }} className="w-6 h-6 rounded-full justify-center items-center mr-3 mt-0.5 shrink-0">
                            <Text className="text-white font-bold text-[10px]">{idx + 1}</Text>
                          </View>
                          <View className="flex-1">
                            <Text className="text-slate-700 font-semibold text-[13px] leading-5">
                              {task.text || task.title}
                            </Text>
                            {isOverdue && (
                              <View className="self-start bg-red-100 px-2 py-0.5 rounded-md mt-1 border border-red-200">
                                <Text className="text-red-700 font-bold text-[9.5px]">⚠️ Overdue (Due date has passed)</Text>
                              </View>
                            )}
                          </View>
                        </View>
                        <TouchableOpacity
                          onPress={() => handleDeleteTask(task._id || task.id, idx)}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          className="p-1 rounded-lg bg-white border border-slate-200"
                        >
                          <Trash2 size={12} color="#dc2626" />
                        </TouchableOpacity>
                      </View>
                      {/* Status selector buttons */}
                      <View className="flex-row gap-2 ml-9">
                        {['pending', 'in_progress', 'completed'].map(s => {
                          const cfg = TASK_STATUS[s];
                          const active = task.status === s;
                          return (
                            <TouchableOpacity
                              key={s}
                              activeOpacity={0.75}
                              onPress={() => updateTaskStatus(idx, s)}
                              style={{
                                paddingHorizontal: 10,
                                paddingVertical: 4,
                                borderRadius: 20,
                                backgroundColor: active ? cfg.color : '#f1f5f9',
                                borderWidth: 1,
                                borderColor: active ? cfg.color : '#e2e8f0',
                              }}
                            >
                              <Text style={{
                                fontSize: 10,
                                fontWeight: '700',
                                color: active ? '#fff' : cfg.color,
                              }}>
                                {cfg.label}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                  );
                })
              )
            )}

            {/* ── EDIT MODE ── */}
            {isEditing && (
              <>
                {editingTasks.map((task, idx) => {
                  const st = TASK_STATUS[task.status] || TASK_STATUS.pending;
                  return (
                    <View key={idx} className="mb-3 bg-[#f6f8fc] rounded-2xl p-3 border border-slate-100">
                      {/* Text input row */}
                      <View className="flex-row items-center mb-2">
                        <View style={{ backgroundColor: st.color }} className="w-6 h-6 rounded-full justify-center items-center mr-2 shrink-0">
                          <Text className="text-white font-bold text-[10px]">{idx + 1}</Text>
                        </View>
                        <TextInput
                          className="flex-1 bg-white rounded-xl px-3 py-2 text-slate-700 font-semibold text-[12px] border border-slate-100 mr-2"
                          value={task.text || task.title}
                          onChangeText={(val) => {
                            const copy = [...editingTasks];
                            copy[idx] = { ...copy[idx], text: val, title: val };
                            setEditingTasks(copy);
                          }}
                          placeholder={`Task ${idx + 1}`}
                          placeholderTextColor="#94a3b8"
                          multiline
                        />
                        <TouchableOpacity
                          onPress={() => handleDeleteTask(task._id || task.id, idx)}
                          className="w-7 h-7 rounded-full bg-red-50 justify-center items-center"
                        >
                          <Trash2 size={12} color="#ef4444" />
                        </TouchableOpacity>
                      </View>
                      {/* Inline status pills */}
                      <View className="flex-row gap-2 ml-8">
                        {['pending', 'in_progress', 'completed'].map(s => {
                          const cfg = TASK_STATUS[s];
                          const active = task.status === s;
                          return (
                            <TouchableOpacity
                              key={s}
                              activeOpacity={0.75}
                              onPress={() => {
                                const copy = [...editingTasks];
                                copy[idx] = { ...copy[idx], status: s };
                                setEditingTasks(copy);
                              }}
                              style={{
                                paddingHorizontal: 9,
                                paddingVertical: 3,
                                borderRadius: 20,
                                backgroundColor: active ? cfg.color : '#f1f5f9',
                                borderWidth: 1,
                                borderColor: active ? cfg.color : '#e2e8f0',
                              }}
                            >
                              <Text style={{ fontSize: 9, fontWeight: '700', color: active ? '#fff' : cfg.color }}>
                                {cfg.label}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                  );
                })}

                {/* Add task row */}
                <TouchableOpacity
                  onPress={() => setEditingTasks(prev => [...prev, { text: '', title: '', status: 'pending' }])}
                  className="flex-row items-center justify-center bg-[#f0f4f9] rounded-2xl px-4 py-3 mt-1 border border-dashed border-slate-300"
                >
                  <Plus size={14} color="#1972e9" />
                  <Text className="text-[#1972e9] font-bold text-[12px] ml-2">Add Task</Text>
                </TouchableOpacity>

                {/* Cancel */}
                <TouchableOpacity
                  onPress={() => setIsEditing(false)}
                  className="mt-3 items-center py-2"
                >
                  <Text className="text-slate-400 font-semibold text-[13px]">Cancel</Text>
                </TouchableOpacity>
              </>
            )}
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