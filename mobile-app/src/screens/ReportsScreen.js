import DateTimePicker from "@react-native-community/datetimepicker";
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  CalendarCheck,
  CalendarDays,
  CheckCircle2,
  CheckSquare,
  ChevronRight,
  Clock,
  Coffee,
  House as Home,
  Hourglass,
  MapPin,
  Package,
  Receipt,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Truck,
  X
} from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import api from "../api/axios";
import GlobalAppFooter from "../components/GlobalAppFooter";

// Module configurations for the 5 reports
const REPORT_MODULES = [
  {
    key: "attendance",
    title: "Attendance Report",
    shortLabel: "Attendance",
    subtitle: "Punches, Work Hours & Break Logs",
    icon: CalendarCheck,
    color: "#2563eb",
    bg: "#eff6ff",
    border: "#bfdbfe",
    badge: "Daily Logs",
    description: "View daily check-in/out timestamps, working hours, outside visits, and break logs."
  },
  {
    key: "leaves",
    title: "Leaves Report",
    shortLabel: "Leaves",
    subtitle: "Leave Balances & Applications",
    icon: CalendarDays,
    color: "#ef4444",
    bg: "#fef2f2",
    border: "#fecaca",
    badge: "Balances & Leaves",
    description: "Track approved, pending, and rejected leave requests with remaining quota balances."
  },
  {
    key: "expense",
    title: "Expense Report",
    shortLabel: "Expense",
    subtitle: "Claims, Allowances & Settlements",
    icon: Receipt,
    color: "#f59e0b",
    bg: "#fffbeb",
    border: "#fde68a",
    badge: "Claims & Status",
    description: "Monitor submitted expense claims, approval queues, disbursement, and settlement amounts."
  },
  {
    key: "visits",
    title: "Customer Visit Report",
    shortLabel: "Customer Visit",
    subtitle: "Client Meetings, GPS & Notes",
    icon: MapPin,
    color: "#e91e63",
    bg: "#fdf2f8",
    border: "#fbcfe8",
    badge: "Client & Self Visits",
    description: "Audit scheduled customer visits, check-in locations, duration, and meeting outcomes."
  },
  {
    key: "material",
    title: "Material Movement Report",
    shortLabel: "Material Movement",
    subtitle: "Transfers, Dispatches & Returns",
    icon: Truck,
    color: "#0d9488",
    bg: "#f0fdfa",
    border: "#99f6e4",
    badge: "Movements & Stock",
    description: "Track store dispatches, receiving challans, barcode handovers, returns, and item logs."
  },
];

const PRESET_RANGES = [
  { key: "today", label: "Today" },
  { key: "this_week", label: "This Week" },
  { key: "this_month", label: "This Month" },
  { key: "last_30_days", label: "Last 30 Days" },
  { key: "custom", label: "Custom" },
];

const ReportsScreen = ({ navigation, route }) => {
  // Mode: 'hub' (Global Reports Page) or 'detail' (Specific Report View)
  const initialModule = route?.params?.module || null;
  const [viewMode, setViewMode] = useState(initialModule ? "detail" : "hub");
  const [activeModule, setActiveModule] = useState(initialModule || "attendance");

  // Synchronize if route params change
  useEffect(() => {
    if (route?.params?.module) {
      setActiveModule(route.params.module);
      setViewMode("detail");
    }
  }, [route?.params?.module]);

  // Helper date functions
  const formatDateYYYYMMDD = (d) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const formatDateDisplay = (dateStr) => {
    if (!dateStr) return "";
    const parts = String(dateStr).split("T")[0].split("-");
    if (parts.length === 3) {
      const d = new Date(parts[0], parts[1] - 1, parts[2]);
      return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
    }
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return String(dateStr);
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  };

  const format12hrTime = (timeStr) => {
    if (!timeStr || timeStr === "NA") return "--:--";
    try {
      const d = new Date(timeStr);
      if (!isNaN(d.getTime())) {
        return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true });
      }
    } catch (_) { }
    return String(timeStr);
  };

  const formatDurationHours = (hours) => {
    if (!hours || hours <= 0) return "0m";
    const totalMinutes = Math.round(hours * 60);
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    if (h === 0) return `${m}m`;
    if (m === 0) return `${h}h`;
    return `${h}h ${m}m`;
  };

  const getFirstDayOfMonth = () => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  };

  // Date filters state
  const [activePreset, setActivePreset] = useState("this_month");
  const [startDateObj, setStartDateObj] = useState(getFirstDayOfMonth());
  const [endDateObj, setEndDateObj] = useState(new Date());

  // Date picker modal states
  const [showDatePickerModal, setShowDatePickerModal] = useState(false);
  const [tempStartDate, setTempStartDate] = useState(getFirstDayOfMonth());
  const [tempEndDate, setTempEndDate] = useState(new Date());
  const [pickerMode, setPickerMode] = useState("start"); // 'start' | 'end'
  const [showNativePicker, setShowNativePicker] = useState(false);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatusFilter, setSelectedStatusFilter] = useState("All");

  // Data states
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [attendanceData, setAttendanceData] = useState([]);
  const [leavesData, setLeavesData] = useState([]);
  const [leaveQuotas, setLeaveQuotas] = useState([]);
  const [expenseData, setExpenseData] = useState([]);
  const [visitsData, setVisitsData] = useState([]);
  const [materialData, setMaterialData] = useState([]);

  // Fetch data
  const fetchData = async (isPullToRefresh = false) => {
    try {
      if (isPullToRefresh) setRefreshing(true);
      else setLoading(true);

      const sDateStr = formatDateYYYYMMDD(startDateObj);
      const eDateStr = formatDateYYYYMMDD(endDateObj);

      if (viewMode === "hub") {
        // Fetch preview metrics for all 5 modules in parallel
        const [attRes, leaveRes, expRes, visitRes, matRes] = await Promise.allSettled([
          api.get(`/attendance/history?startDate=${sDateStr}&endDate=${eDateStr}`),
          api.get(`/leaves/my-leaves?startDate=${sDateStr}&endDate=${eDateStr}`),
          api.get(`/expense/claims?limit=100&startDate=${sDateStr}&endDate=${eDateStr}`),
          api.get(`/visits?startDate=${sDateStr}&endDate=${eDateStr}`),
          api.get(`/material/transactions?startDate=${sDateStr}&endDate=${eDateStr}`).catch(() =>
            api.get(`/material/reports/transactions?startDate=${sDateStr}&endDate=${eDateStr}`)
          ),
        ]);

        if (attRes.status === "fulfilled") setAttendanceData(attRes.value.data?.data || []);
        if (leaveRes.status === "fulfilled") {
          setLeavesData(leaveRes.value.data?.data || []);
          setLeaveQuotas(leaveRes.value.data?.quotas || []);
        }
        if (expRes.status === "fulfilled") setExpenseData(expRes.value.data?.data || []);
        if (visitRes.status === "fulfilled") setVisitsData(visitRes.value.data?.data || []);
        if (matRes.status === "fulfilled") {
          const mData = matRes.value.data?.data || matRes.value.data?.transactions || [];
          setMaterialData(Array.isArray(mData) ? mData : []);
        }
      } else {
        // Detail Mode: Fetch active module data
        if (activeModule === "attendance") {
          const res = await api.get(`/attendance/history?startDate=${sDateStr}&endDate=${eDateStr}`);
          setAttendanceData(res.data?.data || []);
        } else if (activeModule === "leaves") {
          const res = await api.get(`/leaves/my-leaves?startDate=${sDateStr}&endDate=${eDateStr}`);
          setLeavesData(res.data?.data || []);
          setLeaveQuotas(res.data?.quotas || []);
        } else if (activeModule === "expense") {
          const res = await api.get(`/expense/claims?limit=100&startDate=${sDateStr}&endDate=${eDateStr}`);
          setExpenseData(res.data?.data || []);
        } else if (activeModule === "visits") {
          const res = await api.get(`/visits?startDate=${sDateStr}&endDate=${eDateStr}`);
          setVisitsData(res.data?.data || []);
        } else if (activeModule === "material") {
          try {
            const res = await api.get(`/material/transactions?startDate=${sDateStr}&endDate=${eDateStr}`);
            const mData = res.data?.data || res.data?.transactions || [];
            setMaterialData(Array.isArray(mData) ? mData : []);
          } catch (_) {
            const res2 = await api.get(`/material/reports/transactions?startDate=${sDateStr}&endDate=${eDateStr}`);
            const mData2 = res2.data?.data || res2.data?.transactions || [];
            setMaterialData(Array.isArray(mData2) ? mData2 : []);
          }
        }
      }
    } catch (err) {
      console.error(`Failed to load report data:`, err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    setSelectedStatusFilter("All");
    setSearchQuery("");
    fetchData();
  }, [viewMode, activeModule, startDateObj, endDateObj]);

  // Handle Preset selection
  const handlePresetSelect = (presetKey) => {
    setActivePreset(presetKey);
    const now = new Date();

    if (presetKey === "today") {
      setStartDateObj(now);
      setEndDateObj(now);
    } else if (presetKey === "this_week") {
      const day = now.getDay() || 7;
      const mon = new Date(now);
      mon.setDate(now.getDate() - day + 1);
      setStartDateObj(mon);
      setEndDateObj(now);
    } else if (presetKey === "this_month") {
      setStartDateObj(getFirstDayOfMonth());
      setEndDateObj(now);
    } else if (presetKey === "last_30_days") {
      const past = new Date(now);
      past.setDate(now.getDate() - 30);
      setStartDateObj(past);
      setEndDateObj(now);
    } else if (presetKey === "custom") {
      setTempStartDate(startDateObj);
      setTempEndDate(endDateObj);
      setShowDatePickerModal(true);
    }
  };

  // Apply custom date range
  const handleApplyCustomDates = () => {
    if (tempStartDate > tempEndDate) {
      Alert.alert("Invalid Date Range", "Start Date cannot be later than End Date.");
      return;
    }
    setStartDateObj(tempStartDate);
    setEndDateObj(tempEndDate);
    setShowDatePickerModal(false);
    setActivePreset("custom");
  };

  // Open a specific report from the hub
  const handleOpenReportModule = (moduleKey) => {
    setActiveModule(moduleKey);
    setViewMode("detail");
    setSelectedStatusFilter("All");
    setSearchQuery("");
  };

  // ─────────────────────────────────────────────────────────────
  // 1. ATTENDANCE CALCULATIONS & FILTERING
  // ─────────────────────────────────────────────────────────────
  // ─────────────────────────────────────────────────────────────
  // 1. ATTENDANCE CALCULATIONS & FILTERING
  // ─────────────────────────────────────────────────────────────
  const attendanceFiltered = useMemo(() => {
    return attendanceData.filter((item) => {
      const itemStatus = (item.status || "Present").toLowerCase();
      const filter = selectedStatusFilter.toLowerCase();

      let statusMatch = filter === "all";
      if (!statusMatch) {
        if (filter === "present") statusMatch = itemStatus === "present" || (!itemStatus.includes("absent") && !itemStatus.includes("leave") && !!item.punchIn?.time);
        else if (filter === "absent") statusMatch = itemStatus === "absent";
        else if (filter === "half day") statusMatch = itemStatus === "half day" || itemStatus === "halfday";
        else if (filter === "leave") statusMatch = itemStatus.includes("leave") || item.isOnLeave;
        else statusMatch = itemStatus.includes(filter);
      }

      const q = searchQuery.toLowerCase().trim();
      const inAddr = (item.punchIn?.location?.address || "").toLowerCase();
      const outAddr = (item.punchOut?.location?.address || "").toLowerCase();
      const dateStr = formatDateDisplay(item.date || item.punchIn?.time).toLowerCase();

      const searchMatch = !q || inAddr.includes(q) || outAddr.includes(q) || dateStr.includes(q);

      return statusMatch && searchMatch;
    });
  }, [attendanceData, selectedStatusFilter, searchQuery]);

  const attendanceStats = useMemo(() => {
    const total = attendanceData.length;
    let present = 0;
    let absent = 0;
    let outsidePunches = 0;
    let totalWorkHours = 0;
    let totalBreaks = 0;

    attendanceData.forEach((item) => {
      const s = (item.status || "Present").toLowerCase();
      if (s === "present" || (s !== "absent" && !s.includes("leave") && item.punchIn?.time)) present++;
      else if (s === "absent") absent++;
      if (item.punchIn?.isOutside || item.punchOut?.isOutside) outsidePunches++;
      if (item.workingHours) totalWorkHours += Number(item.workingHours) || 0;
      if (Array.isArray(item.breaks)) totalBreaks += item.breaks.length;
    });

    return {
      total,
      present,
      absent,
      outsidePunches,
      totalWorkHours: formatDurationHours(totalWorkHours),
      totalBreaks,
    };
  }, [attendanceData]);

  // ─────────────────────────────────────────────────────────────
  // 2. LEAVES CALCULATIONS & FILTERING
  // ─────────────────────────────────────────────────────────────
  const leavesFiltered = useMemo(() => {
    return leavesData.filter((item) => {
      const itemStatus = (item.status || "pending").toLowerCase();
      const filter = selectedStatusFilter.toLowerCase();

      let statusMatch = filter === "all";
      if (!statusMatch) {
        if (filter === "approved") statusMatch = itemStatus === "approved";
        else if (filter === "pending") statusMatch = itemStatus === "pending" || itemStatus === "applied";
        else if (filter === "rejected") statusMatch = itemStatus === "rejected" || itemStatus === "cancelled";
        else statusMatch = itemStatus.includes(filter);
      }

      const q = searchQuery.toLowerCase().trim();
      const typeStr = (item.leaveType || item.type || "").toLowerCase();
      const reasonStr = (item.reason || item.adminNote || "").toLowerCase();
      const dateStr = formatDateDisplay(item.startDate || item.createdAt).toLowerCase();

      const searchMatch = !q || typeStr.includes(q) || reasonStr.includes(q) || dateStr.includes(q);

      return statusMatch && searchMatch;
    });
  }, [leavesData, selectedStatusFilter, searchQuery]);

  const leavesStats = useMemo(() => {
    let approved = 0;
    let approvedDays = 0;
    let pending = 0;
    let rejected = 0;

    leavesData.forEach((item) => {
      const s = (item.status || "pending").toLowerCase();
      const days = item.durationDays || (item.duration === "Half Day" ? 0.5 : 1);
      if (s === "approved") {
        approved++;
        approvedDays += days;
      } else if (s === "pending" || s === "applied") {
        pending++;
      } else if (s === "rejected" || s === "cancelled") {
        rejected++;
      }
    });

    return { total: leavesData.length, approved, approvedDays, pending, rejected };
  }, [leavesData]);

  // ─────────────────────────────────────────────────────────────
  // 3. EXPENSE CLAIMS CALCULATIONS & FILTERING
  // ─────────────────────────────────────────────────────────────
  const expenseFiltered = useMemo(() => {
    return expenseData.filter((item) => {
      const s = (item.status || "SUBMITTED").toUpperCase();
      const filter = selectedStatusFilter.toUpperCase();

      let statusMatch = filter === "ALL";
      if (!statusMatch) {
        if (filter.includes("SETTLED") || filter.includes("PAID")) {
          statusMatch = ["PAID", "SETTLED", "DISBURSED"].includes(s);
        } else if (filter.includes("APPROVAL") || filter === "SUBMITTED" || filter === "HR_PENDING") {
          statusMatch = ["SUBMITTED", "HR_PENDING", "PENDING", "DRAFT"].includes(s);
        } else if (filter.includes("DISBURS") || filter === "ACCOUNTS_PENDING" || filter === "APPROVED") {
          statusMatch = ["ACCOUNTS_PENDING", "APPROVED", "VERIFIED", "ACCOUNTS_APPROVED"].includes(s);
        } else if (filter.includes("REJECT")) {
          statusMatch = ["REJECTED", "HR_REJECTED", "ACCOUNTS_REJECTED"].includes(s);
        } else {
          statusMatch = s === filter || s.includes(filter);
        }
      }

      const q = searchQuery.toLowerCase().trim();
      const claimNum = (item.claimNumber || "").toLowerCase();
      const typeStr = (item.claimType || "").toLowerCase();
      const purposeStr = (item.trip?.purpose || item.purpose || "").toLowerCase();
      const claimant = (item.submittedBy?.name || item.employeeClaims?.[0]?.employee?.name || "").toLowerCase();

      const searchMatch =
        !q ||
        claimNum.includes(q) ||
        typeStr.includes(q) ||
        purposeStr.includes(q) ||
        claimant.includes(q);

      return statusMatch && searchMatch;
    });
  }, [expenseData, selectedStatusFilter, searchQuery]);

  const expenseStats = useMemo(() => {
    let totalRequested = 0;
    let settled = 0;
    let waitingApproval = 0;
    let waitingDisbursement = 0;
    let rejected = 0;

    expenseData.forEach((item) => {
      const req = item.grandRequested || item.amount || 0;
      const allowed = item.grandAllowed || req;
      const s = (item.status || "SUBMITTED").toUpperCase();

      totalRequested += req;

      if (["PAID", "SETTLED", "DISBURSED"].includes(s)) {
        settled += allowed;
      } else if (["SUBMITTED", "HR_PENDING", "PENDING", "DRAFT"].includes(s)) {
        waitingApproval += allowed;
      } else if (["ACCOUNTS_PENDING", "APPROVED", "VERIFIED", "ACCOUNTS_APPROVED"].includes(s)) {
        waitingDisbursement += allowed;
      } else if (["REJECTED", "HR_REJECTED", "ACCOUNTS_REJECTED"].includes(s)) {
        rejected += req;
      }
    });

    return {
      totalCount: expenseData.length,
      totalRequested,
      settled,
      waitingApproval,
      waitingDisbursement,
      rejected,
    };
  }, [expenseData]);

  // ─────────────────────────────────────────────────────────────
  // 4. CUSTOMER VISITS CALCULATIONS & FILTERING
  // ─────────────────────────────────────────────────────────────
  const visitsFiltered = useMemo(() => {
    return visitsData.filter((item) => {
      const s = (item.status || item.approvalStatus || "To Do").toLowerCase().replace(/[\s_-]+/g, "");
      const filter = selectedStatusFilter.toLowerCase().replace(/[\s_-]+/g, "");

      let statusMatch = filter === "all";
      if (!statusMatch) {
        if (filter === "completed") statusMatch = s === "completed" || s === "done";
        else if (filter === "inprogress") statusMatch = s === "inprogress" || s === "ongoing";
        else if (filter === "todo") statusMatch = s === "todo" || s === "scheduled" || s === "upcoming" || s === "pending";
        else if (filter === "overdue") statusMatch = s === "overdue" || s === "over_due";
        else statusMatch = s.includes(filter) || filter.includes(s);
      }

      const q = searchQuery.toLowerCase().trim();
      const custName = (item.customerName || item.clientName || "").toLowerCase();
      const purpose = (item.purpose || item.reason || item.notes || "").toLowerCase();
      const location = (item.location || item.address || "").toLowerCase();
      const emp = (item.employeeName || "").toLowerCase();

      const searchMatch = !q || custName.includes(q) || purpose.includes(q) || location.includes(q) || emp.includes(q);

      return statusMatch && searchMatch;
    });
  }, [visitsData, selectedStatusFilter, searchQuery]);

  const visitsStats = useMemo(() => {
    let completed = 0;
    let inProgress = 0;
    let todoUpcoming = 0;
    let overdue = 0;
    let customerVisits = 0;
    let selfVisits = 0;

    visitsData.forEach((item) => {
      const s = (item.status || item.approvalStatus || "").toLowerCase();
      if (s === "completed" || s === "done") completed++;
      else if (s === "in progress" || s === "ongoing") inProgress++;
      else if (s === "overdue" || s === "over_due") overdue++;
      else todoUpcoming++;

      const typeStr = (item.visitType || item.type || "customer").toLowerCase();
      if (typeStr.includes("self")) selfVisits++;
      else customerVisits++;
    });

    return {
      total: visitsData.length,
      completed,
      inProgress,
      todoUpcoming,
      overdue,
      customerVisits,
      selfVisits,
    };
  }, [visitsData]);

  // ─────────────────────────────────────────────────────────────
  // 5. MATERIAL MOVEMENTS CALCULATIONS & FILTERING
  // ─────────────────────────────────────────────────────────────
  const materialFiltered = useMemo(() => {
    return materialData.filter((item) => {
      const s = (item.status || "COMPLETED").toUpperCase().replace(/[\s_-]+/g, "");
      const filter = selectedStatusFilter.toUpperCase().replace(/[\s_-]+/g, "");

      let statusMatch = filter === "ALL";
      if (!statusMatch) {
        if (filter === "COMPLETED") statusMatch = ["COMPLETED", "RECEIVED", "CLOSED", "DONE"].includes(s);
        else if (filter === "PENDING") statusMatch = ["PENDING", "DRAFT", "SUBMITTED", "INPROGRESS"].includes(s);
        else if (filter === "INTRANSIT") statusMatch = ["INTRANSIT", "DISPATCHED"].includes(s);
        else if (filter === "REJECTED") statusMatch = ["REJECTED", "CANCELLED"].includes(s);
        else statusMatch = s.includes(filter) || filter.includes(s);
      }

      const q = searchQuery.toLowerCase().trim();
      const numStr = (item.transactionNumber || item.challanNumber || item.movementNumber || item._id || "").toLowerCase();
      const typeStr = (item.documentType || item.type || "").toLowerCase();
      const sender = (item.senderName || item.requester?.name || "").toLowerCase();
      const receiver = (item.receiverName || item.receiver?.name || "").toLowerCase();
      const dest = (item.destinationLocation || "").toLowerCase();

      const searchMatch =
        !q ||
        numStr.includes(q) ||
        typeStr.includes(q) ||
        sender.includes(q) ||
        receiver.includes(q) ||
        dest.includes(q);

      return statusMatch && searchMatch;
    });
  }, [materialData, selectedStatusFilter, searchQuery]);

  const materialStats = useMemo(() => {
    let completed = 0;
    let pending = 0;
    let inTransit = 0;
    let rejected = 0;

    materialData.forEach((item) => {
      const s = (item.status || "COMPLETED").toUpperCase();
      if (["COMPLETED", "RECEIVED", "CLOSED"].includes(s)) completed++;
      else if (["PENDING", "DRAFT", "SUBMITTED"].includes(s)) pending++;
      else if (["IN_TRANSIT", "DISPATCHED"].includes(s)) inTransit++;
      else if (["REJECTED", "CANCELLED"].includes(s)) rejected++;
      else completed++;
    });

    return {
      total: materialData.length,
      completed,
      pending,
      inTransit,
      rejected,
    };
  }, [materialData]);

  // Dynamic Status Options for Active Module
  const statusFilterOptions = useMemo(() => {
    if (activeModule === "attendance") {
      return ["All", "Present", "Absent", "Half Day", "Leave"];
    } else if (activeModule === "leaves") {
      return ["All", "Approved", "Pending", "Rejected"];
    } else if (activeModule === "expense") {
      return ["All", "Waiting Approval", "Waiting Disbursement", "Settled / Paid", "Rejected"];
    } else if (activeModule === "visits") {
      return ["All", "Completed", "In Progress", "To Do", "Overdue"];
    } else if (activeModule === "material") {
      return ["All", "Completed", "Pending", "In Transit", "Rejected"];
    }
    return ["All"];
  }, [activeModule]);

  const currentModuleConfig = REPORT_MODULES.find((m) => m.key === activeModule) || REPORT_MODULES[0];

  return (
    <View className="flex-1 bg-[#f8fafc]">
      <StatusBar barStyle="light-content" backgroundColor="#0f172a" />

      {/* ── TOP HEADER BAR ── */}
      <View className="bg-slate-900 pt-12 pb-5 px-5 rounded-b-[32px] shadow-md">
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-3 flex-1">
            <TouchableOpacity
              activeOpacity={0.75}
              onPress={() => {
                if (viewMode === "detail") {
                  setViewMode("hub");
                } else {
                  if (navigation.canGoBack()) {
                    navigation.goBack();
                  } else {
                    navigation.navigate("Dashboard");
                  }
                }
              }}
              className="w-10 h-10 rounded-full bg-white/10 items-center justify-center border border-white/10"
            >
              <ArrowLeft size={20} color="#ffffff" />
            </TouchableOpacity>

            <View className="flex-1">
              <Text className="text-white text-xl font-bold tracking-tight" numberOfLines={1}>
                {viewMode === "hub" ? "Reports Hub" : currentModuleConfig.title}
              </Text>
              <Text className="text-slate-400 text-xs font-semibold mt-0.5" numberOfLines={1}>
                {viewMode === "hub"
                  ? "Enterprise reporting & analytics"
                  : currentModuleConfig.subtitle}
              </Text>
            </View>
          </View>

          {/* Quick Action Buttons (Home & Refresh) */}
          <View className="flex-row items-center gap-2">
            <TouchableOpacity
              activeOpacity={0.75}
              onPress={() => navigation.navigate("Dashboard")}
              className="w-10 h-10 rounded-full bg-white/10 items-center justify-center border border-white/10"
            >
              <Home size={18} color="#ffffff" />
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.75}
              onPress={() => fetchData()}
              disabled={loading}
              className="w-10 h-10 rounded-full bg-white/10 items-center justify-center border border-white/10"
            >
              <RefreshCw size={18} color="#ffffff" className={loading ? "animate-spin" : ""} />
            </TouchableOpacity>
          </View>
        </View>

        {/* In Detail Mode: Horizontal Quick Module Switcher */}
        {viewMode === "detail" && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            nestedScrollEnabled={true}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ flexDirection: "row", alignItems: "center", paddingTop: 4 }}
            className="mt-4 pt-1 flex-row"
          >
            {REPORT_MODULES.map((tab) => {
              const isTabActive = activeModule === tab.key;
              const Icon = tab.icon;
              return (
                <TouchableOpacity
                  key={tab.key}
                  activeOpacity={0.85}
                  hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                  onPress={() => handleOpenReportModule(tab.key)}
                  className={`py-2 px-3 rounded-xl mr-2 flex-row items-center gap-1.5 border transition-all ${isTabActive
                      ? "bg-white border-white shadow-sm"
                      : "bg-slate-800 border-slate-700"
                    }`}
                >
                  <Icon size={14} color={isTabActive ? tab.color : "#94a3b8"} />
                  <Text
                    className={`text-xs font-bold ${isTabActive ? "text-slate-900" : "text-slate-400"
                      }`}
                  >
                    {tab.shortLabel}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}
      </View>

      <ScrollView
        className="flex-1"
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => fetchData(true)} colors={["#4f46e5"]} />
        }
      >
        {/* ── DATE FILTER BAR (ACCESSIBLE IN BOTH HUB & DETAIL) ── */}
        <View className="bg-white rounded-2xl p-3.5 border border-slate-200 shadow-xs mb-4">
          <View className="flex-row items-center justify-between mb-3">
            <View className="flex-row items-center gap-2">
              <Calendar size={16} className="text-indigo-600" />
              <Text className="text-xs font-bold text-slate-800">
                {formatDateDisplay(startDateObj)} — {formatDateDisplay(endDateObj)}
              </Text>
            </View>

            <TouchableOpacity
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
              onPress={() => handlePresetSelect("custom")}
              className="bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-100 flex-row items-center gap-1"
            >
              <SlidersHorizontal size={12} color="#4f46e5" />
              <Text className="text-[11px] font-bold text-indigo-600">Change</Text>
            </TouchableOpacity>
          </View>

          {/* Quick Filter Pills */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            nestedScrollEnabled={true}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ flexDirection: "row", alignItems: "center" }}
            className="flex-row gap-1.5"
          >
            {PRESET_RANGES.map((preset) => {
              const isSelected = activePreset === preset.key;
              return (
                <TouchableOpacity
                  key={preset.key}
                  activeOpacity={0.8}
                  hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                  onPress={() => handlePresetSelect(preset.key)}
                  className={`px-3 py-1.5 rounded-xl border mr-1.5 ${isSelected
                      ? "bg-slate-900 border-slate-900 text-white"
                      : "bg-slate-50 border-slate-200 text-slate-600"
                    }`}
                >
                  <Text
                    className={`text-[11px] font-bold ${isSelected ? "text-white" : "text-slate-600"
                      }`}
                  >
                    {preset.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* ═════════════════════════════════════════════════════════ */}
        {/* ── VIEW MODE 1: GLOBAL REPORTS HUB (5 REPORT BUTTONS) ── */}
        {/* ═════════════════════════════════════════════════════════ */}
        {viewMode === "hub" && (
          <View className="space-y-4">
            <View className="px-1 flex-row items-center justify-between mb-1">
              <Text className="text-xs font-extrabold text-slate-400 uppercase tracking-wider">
                Select Report Module
              </Text>
              <Text className="text-[11px] font-bold text-indigo-600">
                5 Modules Available
              </Text>
            </View>

            {/* 5 REPORT CARDS / BUTTONS */}
            {REPORT_MODULES.map((item) => {
              const Icon = item.icon;

              // Compute quick stat preview per module
              let previewStat = "";
              if (item.key === "attendance") {
                previewStat = `${attendanceStats.present} Present / ${attendanceStats.total} Days`;
              } else if (item.key === "leaves") {
                previewStat = `${leavesStats.approved} Approved (${leavesStats.approvedDays}d) / ${leavesStats.pending} Pending`;
              } else if (item.key === "expense") {
                previewStat = `₹ ${expenseStats.totalRequested.toLocaleString("en-IN")} (${expenseStats.totalCount} claims)`;
              } else if (item.key === "visits") {
                previewStat = `${visitsStats.completed} Done / ${visitsStats.total} Scheduled`;
              } else if (item.key === "material") {
                previewStat = `${materialStats.completed} Completed / ${materialStats.total} Movements`;
              }

              return (
                <TouchableOpacity
                  key={item.key}
                  activeOpacity={0.88}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  onPress={() => handleOpenReportModule(item.key)}
                  className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm mb-3.5 transition-all"
                >
                  <View className="flex-row items-start justify-between">
                    <View className="flex-row items-center gap-3.5 flex-1">
                      <View
                        style={{ backgroundColor: item.bg, borderColor: item.border }}
                        className="w-13 h-13 rounded-2xl border items-center justify-center shadow-2xs"
                      >
                        <Icon size={24} color={item.color} />
                      </View>

                      <View className="flex-1 pr-2">
                        <View className="flex-row items-center gap-2">
                          <Text className="text-base font-extrabold text-slate-900">
                            {item.title}
                          </Text>
                        </View>

                        <Text className="text-xs font-semibold text-slate-400 mt-0.5" numberOfLines={1}>
                          {item.subtitle}
                        </Text>
                      </View>
                    </View>

                    <View className="w-8 h-8 rounded-full bg-slate-50 items-center justify-center border border-slate-100">
                      <ChevronRight size={18} color="#94a3b8" />
                    </View>
                  </View>

                  {/* Summary Metric Ribbon inside card */}
                  <View className="mt-4 pt-3 border-t border-slate-100 flex-row items-center justify-between">
                    <View className="bg-slate-50 px-2.5 py-1 rounded-xl border border-slate-100">
                      <Text className="text-[11px] font-extrabold text-slate-700">
                        {previewStat || "View Records"}
                      </Text>
                    </View>

                    <View className="flex-row items-center gap-1">
                      <Text style={{ color: item.color }} className="text-xs font-bold">
                        Open Report
                      </Text>
                      <ArrowRight size={13} color={item.color} />
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* ═════════════════════════════════════════════════════════ */}
        {/* ── VIEW MODE 2: DEDICATED REPORT DETAIL VIEW ──────────── */}
        {/* ═════════════════════════════════════════════════════════ */}
        {viewMode === "detail" && (
          <View>
            {/* ── MODULE SPECIFIC SUMMARY STATS CARDS ── */}
            {activeModule === "attendance" && (
              <View className="mb-4">
                <View className="grid grid-cols-2 gap-2.5 mb-2.5 flex-row">
                  <TouchableOpacity
                    activeOpacity={0.75}
                    onPress={() => setSelectedStatusFilter(selectedStatusFilter === "Present" ? "All" : "Present")}
                    className={`flex-1 bg-white p-3.5 rounded-2xl border shadow-2xs ${selectedStatusFilter === "Present" ? "border-blue-500 bg-blue-50/40" : "border-slate-200"}`}
                  >
                    <View className="w-8 h-8 rounded-xl bg-blue-50 items-center justify-center mb-2">
                      <CalendarCheck size={18} color="#2563eb" />
                    </View>
                    <Text className="text-[11px] font-bold text-slate-400">Present Days</Text>
                    <Text className="text-xl font-bold text-blue-600 mt-0.5">
                      {attendanceStats.present}{" "}
                      <Text className="text-xs text-slate-400 font-bold">/ {attendanceStats.total}</Text>
                    </Text>
                  </TouchableOpacity>

                  <View className="flex-1 bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs">
                    <View className="w-8 h-8 rounded-xl bg-emerald-50 items-center justify-center mb-2">
                      <Clock size={18} color="#059669" />
                    </View>
                    <Text className="text-[11px] font-bold text-slate-400">Total Work Hours</Text>
                    <Text className="text-xl font-bold text-emerald-600 mt-0.5">
                      {attendanceStats.totalWorkHours}
                    </Text>
                  </View>
                </View>

                <View className="flex-row gap-2.5">
                  <TouchableOpacity
                    activeOpacity={0.75}
                    onPress={() => setSelectedStatusFilter(selectedStatusFilter === "Absent" ? "All" : "Absent")}
                    className={`flex-1 bg-white p-3 rounded-2xl border shadow-2xs items-center ${selectedStatusFilter === "Absent" ? "border-rose-500 bg-rose-50/40" : "border-slate-200"}`}
                  >
                    <Text className="text-[10px] font-bold text-slate-400">Absent Days</Text>
                    <Text className="text-base font-extrabold text-rose-600 mt-0.5">
                      {attendanceStats.absent}
                    </Text>
                  </TouchableOpacity>

                  <View className="flex-1 bg-white p-3 rounded-2xl border border-slate-200 shadow-2xs items-center">
                    <Text className="text-[10px] font-bold text-slate-400">Outside Punches</Text>
                    <Text className="text-base font-extrabold text-amber-600 mt-0.5">
                      {attendanceStats.outsidePunches}
                    </Text>
                  </View>

                  <View className="flex-1 bg-white p-3 rounded-2xl border border-slate-200 shadow-2xs items-center">
                    <Text className="text-[10px] font-bold text-slate-400">Breaks Taken</Text>
                    <Text className="text-base font-extrabold text-indigo-600 mt-0.5">
                      {attendanceStats.totalBreaks}
                    </Text>
                  </View>
                </View>
              </View>
            )}

            {activeModule === "leaves" && (
              <View className="mb-4">
                <View className="flex-row gap-2.5 mb-2.5">
                  <TouchableOpacity
                    activeOpacity={0.75}
                    onPress={() => setSelectedStatusFilter(selectedStatusFilter === "Approved" ? "All" : "Approved")}
                    className={`flex-1 bg-white p-3.5 rounded-2xl border shadow-2xs ${selectedStatusFilter === "Approved" ? "border-emerald-500 bg-emerald-50/40" : "border-slate-200"}`}
                  >
                    <View className="w-8 h-8 rounded-xl bg-emerald-50 items-center justify-center mb-2">
                      <CheckCircle2 size={18} color="#059669" />
                    </View>
                    <Text className="text-[11px] font-bold text-slate-400">Approved Leaves</Text>
                    <Text className="text-xl font-bold text-emerald-600 mt-0.5">
                      {leavesStats.approved}{" "}
                      <Text className="text-xs text-slate-400 font-bold">({leavesStats.approvedDays}d)</Text>
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    activeOpacity={0.75}
                    onPress={() => setSelectedStatusFilter(selectedStatusFilter === "Pending" ? "All" : "Pending")}
                    className={`flex-1 bg-white p-3.5 rounded-2xl border shadow-2xs ${selectedStatusFilter === "Pending" ? "border-amber-500 bg-amber-50/40" : "border-slate-200"}`}
                  >
                    <View className="w-8 h-8 rounded-xl bg-amber-50 items-center justify-center mb-2">
                      <Hourglass size={18} color="#d97706" />
                    </View>
                    <Text className="text-[11px] font-bold text-slate-400">Pending Approval</Text>
                    <Text className="text-xl font-bold text-amber-600 mt-0.5">
                      {leavesStats.pending}
                    </Text>
                  </TouchableOpacity>
                </View>

                {leaveQuotas.length > 0 && (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    nestedScrollEnabled={true}
                    keyboardShouldPersistTaps="handled"
                    contentContainerStyle={{ flexDirection: "row", alignItems: "center", paddingVertical: 4 }}
                    className="flex-row gap-2 py-1"
                  >
                    {leaveQuotas.map((q, idx) => (
                      <View
                        key={idx}
                        className="bg-white px-3 py-2 rounded-xl border border-slate-200 mr-2 flex-row items-center gap-2"
                      >
                        <View className="w-2 h-2 rounded-full bg-indigo-600" />
                        <Text className="text-xs font-bold text-slate-700">{q.leaveType || q.code}:</Text>
                        <Text className="text-xs font-bold text-indigo-600">
                          {q.remaining ?? q.balance ?? 0} Left
                        </Text>
                      </View>
                    ))}
                  </ScrollView>
                )}
              </View>
            )}

            {activeModule === "expense" && (
              <View className="mb-4">
                <View className="flex-row gap-2.5 mb-2.5">
                  <TouchableOpacity
                    activeOpacity={0.75}
                    onPress={() => setSelectedStatusFilter(selectedStatusFilter === "Settled / Paid" ? "All" : "Settled / Paid")}
                    className={`flex-1 bg-white p-3.5 rounded-2xl border shadow-2xs ${selectedStatusFilter === "Settled / Paid" ? "border-purple-500 bg-purple-50/40" : "border-slate-200"}`}
                  >
                    <View className="w-8 h-8 rounded-xl bg-purple-50 items-center justify-center mb-2">
                      <CheckSquare size={18} color="#7c3aed" />
                    </View>
                    <Text className="text-[11px] font-bold text-slate-400">Settled / Paid</Text>
                    <Text className="text-lg font-bold text-purple-700 mt-0.5">
                      ₹ {expenseStats.settled.toLocaleString("en-IN")}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    activeOpacity={0.75}
                    onPress={() => setSelectedStatusFilter("All")}
                    className="flex-1 bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs"
                  >
                    <View className="w-8 h-8 rounded-xl bg-blue-50 items-center justify-center mb-2">
                      <Receipt size={18} color="#2563eb" />
                    </View>
                    <Text className="text-[11px] font-bold text-slate-400">Total Requested</Text>
                    <Text className="text-lg font-bold text-blue-600 mt-0.5">
                      ₹ {expenseStats.totalRequested.toLocaleString("en-IN")}
                    </Text>
                  </TouchableOpacity>
                </View>

                <View className="flex-row gap-2.5">
                  <TouchableOpacity
                    activeOpacity={0.75}
                    onPress={() => setSelectedStatusFilter(selectedStatusFilter === "Waiting Approval" ? "All" : "Waiting Approval")}
                    className={`flex-1 bg-white p-2.5 rounded-2xl border items-center ${selectedStatusFilter === "Waiting Approval" ? "border-amber-500 bg-amber-50/40" : "border-slate-200"}`}
                  >
                    <Text className="text-[10px] font-bold text-slate-400">Waiting Approval</Text>
                    <Text className="text-sm font-extrabold text-amber-600 mt-0.5">
                      ₹ {expenseStats.waitingApproval.toLocaleString("en-IN")}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    activeOpacity={0.75}
                    onPress={() => setSelectedStatusFilter(selectedStatusFilter === "Waiting Disbursement" ? "All" : "Waiting Disbursement")}
                    className={`flex-1 bg-white p-2.5 rounded-2xl border items-center ${selectedStatusFilter === "Waiting Disbursement" ? "border-blue-500 bg-blue-50/40" : "border-slate-200"}`}
                  >
                    <Text className="text-[10px] font-bold text-slate-400">Waiting Disburs.</Text>
                    <Text className="text-sm font-extrabold text-slate-700 mt-0.5">
                      ₹ {expenseStats.waitingDisbursement.toLocaleString("en-IN")}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    activeOpacity={0.75}
                    onPress={() => setSelectedStatusFilter(selectedStatusFilter === "Rejected" ? "All" : "Rejected")}
                    className={`flex-1 bg-white p-2.5 rounded-2xl border items-center ${selectedStatusFilter === "Rejected" ? "border-rose-500 bg-rose-50/40" : "border-slate-200"}`}
                  >
                    <Text className="text-[10px] font-bold text-slate-400">Rejected</Text>
                    <Text className="text-sm font-extrabold text-rose-600 mt-0.5">
                      ₹ {expenseStats.rejected.toLocaleString("en-IN")}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {activeModule === "visits" && (
              <View className="mb-4">
                <View className="flex-row gap-2.5 mb-2.5">
                  <TouchableOpacity
                    activeOpacity={0.75}
                    onPress={() => setSelectedStatusFilter(selectedStatusFilter === "Completed" ? "All" : "Completed")}
                    className={`flex-1 bg-white p-3.5 rounded-2xl border shadow-2xs ${selectedStatusFilter === "Completed" ? "border-emerald-500 bg-emerald-50/40" : "border-slate-200"}`}
                  >
                    <View className="w-8 h-8 rounded-xl bg-emerald-50 items-center justify-center mb-2">
                      <CheckCircle2 size={18} color="#059669" />
                    </View>
                    <Text className="text-[11px] font-bold text-slate-400">Completed Visits</Text>
                    <Text className="text-xl font-bold text-emerald-600 mt-0.5">
                      {visitsStats.completed}{" "}
                      <Text className="text-xs text-slate-400 font-bold">/ {visitsStats.total}</Text>
                    </Text>
                  </TouchableOpacity>

                  <View className="flex-1 bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs">
                    <View className="w-8 h-8 rounded-xl bg-pink-50 items-center justify-center mb-2">
                      <MapPin size={18} color="#db2777" />
                    </View>
                    <Text className="text-[11px] font-bold text-slate-400">Customer vs Self</Text>
                    <Text className="text-base font-bold text-pink-600 mt-0.5">
                      {visitsStats.customerVisits} <Text className="text-xs text-slate-400">Cust</Text> · {visitsStats.selfVisits} <Text className="text-xs text-slate-400">Self</Text>
                    </Text>
                  </View>
                </View>

                <View className="flex-row gap-2.5">
                  <TouchableOpacity
                    activeOpacity={0.75}
                    onPress={() => setSelectedStatusFilter(selectedStatusFilter === "In Progress" ? "All" : "In Progress")}
                    className={`flex-1 bg-white p-2.5 rounded-2xl border items-center ${selectedStatusFilter === "In Progress" ? "border-amber-500 bg-amber-50/40" : "border-slate-200"}`}
                  >
                    <Text className="text-[10px] font-bold text-slate-400">In Progress</Text>
                    <Text className="text-sm font-extrabold text-amber-600 mt-0.5">
                      {visitsStats.inProgress}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    activeOpacity={0.75}
                    onPress={() => setSelectedStatusFilter(selectedStatusFilter === "To Do" ? "All" : "To Do")}
                    className={`flex-1 bg-white p-2.5 rounded-2xl border items-center ${selectedStatusFilter === "To Do" ? "border-blue-500 bg-blue-50/40" : "border-slate-200"}`}
                  >
                    <Text className="text-[10px] font-bold text-slate-400">To Do / Upcom.</Text>
                    <Text className="text-sm font-extrabold text-blue-600 mt-0.5">
                      {visitsStats.todoUpcoming}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    activeOpacity={0.75}
                    onPress={() => setSelectedStatusFilter(selectedStatusFilter === "Overdue" ? "All" : "Overdue")}
                    className={`flex-1 bg-white p-2.5 rounded-2xl border items-center ${selectedStatusFilter === "Overdue" ? "border-rose-500 bg-rose-50/40" : "border-slate-200"}`}
                  >
                    <Text className="text-[10px] font-bold text-slate-400">Overdue</Text>
                    <Text className="text-sm font-extrabold text-rose-600 mt-0.5">
                      {visitsStats.overdue}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {activeModule === "material" && (
              <View className="mb-4">
                <View className="flex-row gap-2.5 mb-2.5">
                  <TouchableOpacity
                    activeOpacity={0.75}
                    onPress={() => setSelectedStatusFilter(selectedStatusFilter === "Completed" ? "All" : "Completed")}
                    className={`flex-1 bg-white p-3.5 rounded-2xl border shadow-2xs ${selectedStatusFilter === "Completed" ? "border-teal-500 bg-teal-50/40" : "border-slate-200"}`}
                  >
                    <View className="w-8 h-8 rounded-xl bg-teal-50 items-center justify-center mb-2">
                      <CheckCircle2 size={18} color="#0d9488" />
                    </View>
                    <Text className="text-[11px] font-bold text-slate-400">Completed Movements</Text>
                    <Text className="text-xl font-bold text-teal-600 mt-0.5">
                      {materialStats.completed}{" "}
                      <Text className="text-xs text-slate-400 font-bold">/ {materialStats.total}</Text>
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    activeOpacity={0.75}
                    onPress={() => setSelectedStatusFilter(selectedStatusFilter === "Pending" ? "All" : "Pending")}
                    className={`flex-1 bg-white p-3.5 rounded-2xl border shadow-2xs ${selectedStatusFilter === "Pending" ? "border-amber-500 bg-amber-50/40" : "border-slate-200"}`}
                  >
                    <View className="w-8 h-8 rounded-xl bg-amber-50 items-center justify-center mb-2">
                      <Hourglass size={18} color="#d97706" />
                    </View>
                    <Text className="text-[11px] font-bold text-slate-400">Pending / In Progress</Text>
                    <Text className="text-xl font-bold text-amber-600 mt-0.5">
                      {materialStats.pending}
                    </Text>
                  </TouchableOpacity>
                </View>

                <View className="flex-row gap-2.5">
                  <TouchableOpacity
                    activeOpacity={0.75}
                    onPress={() => setSelectedStatusFilter(selectedStatusFilter === "In Transit" ? "All" : "In Transit")}
                    className={`flex-1 bg-white p-2.5 rounded-2xl border items-center ${selectedStatusFilter === "In Transit" ? "border-blue-500 bg-blue-50/40" : "border-slate-200"}`}
                  >
                    <Text className="text-[10px] font-bold text-slate-400">In Transit</Text>
                    <Text className="text-sm font-extrabold text-blue-600 mt-0.5">
                      {materialStats.inTransit}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    activeOpacity={0.75}
                    onPress={() => setSelectedStatusFilter(selectedStatusFilter === "Rejected" ? "All" : "Rejected")}
                    className={`flex-1 bg-white p-2.5 rounded-2xl border items-center ${selectedStatusFilter === "Rejected" ? "border-rose-500 bg-rose-50/40" : "border-slate-200"}`}
                  >
                    <Text className="text-[10px] font-bold text-slate-400">Rejected / Canc.</Text>
                    <Text className="text-sm font-extrabold text-rose-600 mt-0.5">
                      {materialStats.rejected}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* ── SEARCH & STATUS FILTER ROW ── */}
            <View className="mb-4">
              <View className="bg-white rounded-2xl border border-slate-200 px-3.5 py-2.5 flex-row items-center gap-2 mb-2.5 shadow-2xs">
                <Search size={16} color="#94a3b8" />
                <TextInput
                  placeholder={`Search ${currentModuleConfig.shortLabel} records...`}
                  placeholderTextColor="#94a3b8"
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  className="flex-1 text-xs font-semibold text-slate-800 p-0"
                />
                {searchQuery.length > 0 && (
                  <TouchableOpacity onPress={() => setSearchQuery("")}>
                    <X size={16} color="#94a3b8" />
                  </TouchableOpacity>
                )}
              </View>

              {/* Status Filter Chips */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                nestedScrollEnabled={true}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ flexDirection: "row", alignItems: "center", paddingVertical: 4 }}
                className="flex-row"
              >
                {statusFilterOptions.map((opt) => {
                  const isSelected = selectedStatusFilter === opt;
                  return (
                    <TouchableOpacity
                      key={opt}
                      activeOpacity={0.8}
                      hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                      onPress={() => setSelectedStatusFilter(opt)}
                      className={`px-3 py-1.5 rounded-xl border mr-2 ${isSelected
                          ? "bg-slate-900 border-slate-900"
                          : "bg-white border-slate-200"
                        }`}
                    >
                      <Text
                        className={`text-xs font-bold ${isSelected ? "text-white" : "text-slate-600"
                          }`}
                      >
                        {opt}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            {/* ── RECORDS LIST SECTION ── */}
            <View className="mb-6">
              <View className="flex-row items-center justify-between mb-3 px-1">
                <Text className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  {activeModule === "attendance" && `Attendance Logs (${attendanceFiltered.length})`}
                  {activeModule === "leaves" && `Leave Records (${leavesFiltered.length})`}
                  {activeModule === "expense" && `Expense Claims (${expenseFiltered.length})`}
                  {activeModule === "visits" && `Customer Visits (${visitsFiltered.length})`}
                  {activeModule === "material" && `Material Transactions (${materialFiltered.length})`}
                </Text>

                {(selectedStatusFilter !== "All" || searchQuery.length > 0) && (
                  <TouchableOpacity
                    onPress={() => {
                      setSelectedStatusFilter("All");
                      setSearchQuery("");
                    }}
                    hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                  >
                    <Text className="text-xs font-bold text-indigo-600">Clear Filters</Text>
                  </TouchableOpacity>
                )}
              </View>

              {loading ? (
                <View className="bg-white rounded-2xl p-12 items-center justify-center border border-slate-200 shadow-2xs">
                  <ActivityIndicator size="small" color="#4f46e5" />
                  <Text className="text-xs font-bold text-slate-400 mt-2">Fetching records...</Text>
                </View>
              ) : (
                <>
                  {/* 1. ATTENDANCE CARDS */}
                  {activeModule === "attendance" && (
                    attendanceFiltered.length === 0 ? (
                      <View className="bg-white rounded-3xl p-8 items-center justify-center border border-slate-200 shadow-2xs">
                        <CalendarCheck size={36} color="#94a3b8" />
                        <Text className="text-sm font-bold text-slate-800 mt-3">No Attendance Records Found</Text>
                        <Text className="text-xs text-slate-400 text-center mt-1 max-w-xs">
                          {selectedStatusFilter !== "All"
                            ? `No records matching status "${selectedStatusFilter}" in the selected date range.`
                            : "No punch logs recorded for this period."}
                        </Text>
                        {selectedStatusFilter !== "All" ? (
                          <TouchableOpacity
                            activeOpacity={0.75}
                            onPress={() => setSelectedStatusFilter("All")}
                            className="mt-4 px-4 py-2 bg-indigo-50 rounded-xl border border-indigo-100"
                          >
                            <Text className="text-xs font-bold text-indigo-600">Show All Statuses</Text>
                          </TouchableOpacity>
                        ) : (
                          <TouchableOpacity
                            activeOpacity={0.75}
                            onPress={() => handlePresetSelect("this_month")}
                            className="mt-4 px-4 py-2 bg-slate-100 rounded-xl border border-slate-200"
                          >
                            <Text className="text-xs font-bold text-slate-700">View This Month</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    ) : (
                      attendanceFiltered.map((item, idx) => {
                        const statusLower = (item.status || "").toLowerCase();
                        const isPresent = statusLower === "present";
                        const isAbsent = statusLower === "absent";
                        const isHalf = statusLower === "half day";

                        return (
                          <View
                            key={item._id || idx}
                            className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs mb-3 space-y-3"
                          >
                            <View className="flex-row items-center justify-between border-b border-slate-100 pb-2.5">
                              <View className="flex-row items-center gap-2">
                                <Calendar size={15} color="#2563eb" />
                                <Text className="text-xs font-extrabold text-slate-900">
                                  {formatDateDisplay(item.date || item.punchIn?.time)}
                                </Text>
                              </View>

                              <View className="flex-row items-center gap-2">
                                {item.workingHours > 0 && (
                                  <View className="bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-100">
                                    <Text className="text-[10px] font-bold text-emerald-700">
                                      {formatDurationHours(item.workingHours)}
                                    </Text>
                                  </View>
                                )}

                                <View
                                  className={`px-2.5 py-0.5 rounded-lg ${isPresent
                                      ? "bg-emerald-100"
                                      : isAbsent
                                        ? "bg-rose-100"
                                        : isHalf
                                          ? "bg-amber-100"
                                          : "bg-slate-100"
                                    }`}
                                >
                                  <Text
                                    className={`text-[10px] font-extrabold ${isPresent
                                        ? "text-emerald-800"
                                        : isAbsent
                                          ? "text-rose-800"
                                          : isHalf
                                            ? "text-amber-800"
                                            : "text-slate-700"
                                      }`}
                                  >
                                    {item.status || "Neutral"}
                                  </Text>
                                </View>
                              </View>
                            </View>

                            <View className="flex-row gap-3">
                              <View className="flex-1 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                                <Text className="text-[10px] font-bold text-slate-400">PUNCH IN</Text>
                                <Text className="text-xs font-bold text-slate-900 mt-0.5">
                                  {item.punchIn?.time ? format12hrTime(item.punchIn.time) : "--:--"}
                                </Text>
                                {item.punchIn?.location?.address && (
                                  <Text className="text-[10px] font-semibold text-slate-500 mt-1" numberOfLines={1}>
                                    {item.punchIn.location.address}
                                  </Text>
                                )}
                                {item.punchIn?.isOutside && (
                                  <Text className="text-[9px] font-bold text-amber-600 mt-0.5">⚠️ Outside</Text>
                                )}
                              </View>

                              <View className="flex-1 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                                <Text className="text-[10px] font-bold text-slate-400">PUNCH OUT</Text>
                                <Text className="text-xs font-bold text-slate-900 mt-0.5">
                                  {item.punchOut?.time ? format12hrTime(item.punchOut.time) : "--:--"}
                                </Text>
                                {item.punchOut?.location?.address && (
                                  <Text className="text-[10px] font-semibold text-slate-500 mt-1" numberOfLines={1}>
                                    {item.punchOut.location.address}
                                  </Text>
                                )}
                                {item.punchOut?.isOutside && (
                                  <Text className="text-[9px] font-bold text-amber-600 mt-0.5">⚠️ Outside</Text>
                                )}
                              </View>
                            </View>

                            {Array.isArray(item.breaks) && item.breaks.length > 0 && (
                              <View className="flex-row items-center gap-1.5 pt-1">
                                <Coffee size={13} color="#64748b" />
                                <Text className="text-[11px] font-bold text-slate-600">
                                  {item.breaks.length} break(s) taken
                                </Text>
                              </View>
                            )}
                          </View>
                        );
                      })
                    )
                  )}

                  {/* 2. LEAVES CARDS */}
                  {activeModule === "leaves" && (
                    leavesFiltered.length === 0 ? (
                      <View className="bg-white rounded-3xl p-8 items-center justify-center border border-slate-200 shadow-2xs">
                        <CalendarDays size={36} color="#94a3b8" />
                        <Text className="text-sm font-bold text-slate-800 mt-3">No Leave Applications Found</Text>
                        <Text className="text-xs text-slate-400 text-center mt-1 max-w-xs">
                          {selectedStatusFilter !== "All"
                            ? `No leaves matching status "${selectedStatusFilter}".`
                            : "No leave applications in this date window."}
                        </Text>
                        {selectedStatusFilter !== "All" ? (
                          <TouchableOpacity
                            activeOpacity={0.75}
                            onPress={() => setSelectedStatusFilter("All")}
                            className="mt-4 px-4 py-2 bg-indigo-50 rounded-xl border border-indigo-100"
                          >
                            <Text className="text-xs font-bold text-indigo-600">Show All Leaves</Text>
                          </TouchableOpacity>
                        ) : (
                          <TouchableOpacity
                            activeOpacity={0.75}
                            onPress={() => handlePresetSelect("this_month")}
                            className="mt-4 px-4 py-2 bg-slate-100 rounded-xl border border-slate-200"
                          >
                            <Text className="text-xs font-bold text-slate-700">View This Month</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    ) : (
                      leavesFiltered.map((item, idx) => {
                        const statusLower = (item.status || "pending").toLowerCase();
                        const isApp = statusLower === "approved";
                        const isRej = statusLower === "rejected";

                        return (
                          <View
                            key={item._id || idx}
                            className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs mb-3 space-y-2.5"
                          >
                            <View className="flex-row items-center justify-between border-b border-slate-100 pb-2">
                              <View className="flex-row items-center gap-2">
                                <View className="bg-rose-50 px-2 py-0.5 rounded-lg border border-rose-100">
                                  <Text className="text-[11px] font-extrabold text-rose-700">
                                    {item.leaveType || "Leave"}
                                  </Text>
                                </View>
                                <Text className="text-[11px] font-bold text-slate-500">
                                  {item.duration || "Full Day"}
                                </Text>
                              </View>

                              <View
                                className={`px-2.5 py-0.5 rounded-lg ${isApp
                                    ? "bg-emerald-100"
                                    : isRej
                                      ? "bg-rose-100"
                                      : "bg-amber-100"
                                  }`}
                              >
                                <Text
                                  className={`text-[10px] font-extrabold ${isApp
                                      ? "text-emerald-800"
                                      : isRej
                                        ? "text-rose-800"
                                        : "text-amber-800"
                                    }`}
                                >
                                  {item.status || "Pending"}
                                </Text>
                              </View>
                            </View>

                            <View className="flex-row items-center justify-between">
                              <Text className="text-xs font-bold text-slate-800">
                                {formatDateDisplay(item.startDate)} → {formatDateDisplay(item.endDate || item.startDate)}
                              </Text>
                              <Text className="text-[11px] font-extrabold text-indigo-600">
                                {item.duration === "Half Day" ? "0.5 Day" : `${item.daysCount || 1} Day(s)`}
                              </Text>
                            </View>

                            {item.reason && (
                              <Text className="text-xs text-slate-600 font-medium italic bg-slate-50 p-2 rounded-xl">
                                "{item.reason}"
                              </Text>
                            )}
                          </View>
                        );
                      })
                    )
                  )}

                  {/* 3. EXPENSE CARDS */}
                  {activeModule === "expense" && (
                    expenseFiltered.length === 0 ? (
                      <View className="bg-white rounded-3xl p-8 items-center justify-center border border-slate-200 shadow-2xs">
                        <Receipt size={36} color="#94a3b8" />
                        <Text className="text-sm font-bold text-slate-800 mt-3">No Expense Claims Found</Text>
                        <Text className="text-xs text-slate-400 text-center mt-1 max-w-xs">
                          {selectedStatusFilter !== "All"
                            ? `No claims matching "${selectedStatusFilter}".`
                            : "No expense claims found in this period."}
                        </Text>
                        {selectedStatusFilter !== "All" ? (
                          <TouchableOpacity
                            activeOpacity={0.75}
                            onPress={() => setSelectedStatusFilter("All")}
                            className="mt-4 px-4 py-2 bg-indigo-50 rounded-xl border border-indigo-100"
                          >
                            <Text className="text-xs font-bold text-indigo-600">Show All Claims</Text>
                          </TouchableOpacity>
                        ) : (
                          <TouchableOpacity
                            activeOpacity={0.75}
                            onPress={() => handlePresetSelect("this_month")}
                            className="mt-4 px-4 py-2 bg-slate-100 rounded-xl border border-slate-200"
                          >
                            <Text className="text-xs font-bold text-slate-700">View This Month</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    ) : (
                      expenseFiltered.map((claim, idx) => {
                        const s = (claim.status || "DRAFT").toUpperCase();
                        const isSettled = ["SETTLED", "PAID", "DISBURSED"].includes(s);
                        const isWaiting = ["SUBMITTED", "HR_PENDING", "DRAFT"].includes(s);
                        const isWaitingDisb = ["ACCOUNTS_PENDING", "ACCOUNTS_APPROVED"].includes(s);
                        const isRej = ["REJECTED", "HR_REJECTED", "ACCOUNTS_REJECTED"].includes(s);

                        return (
                          <View
                            key={claim._id || idx}
                            className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs mb-3 space-y-3"
                          >
                            <View className="flex-row items-center justify-between border-b border-slate-100 pb-2">
                              <View>
                                <Text className="text-xs font-bold text-slate-900">
                                  {claim.claimNumber || `EXP-${idx + 1}`}
                                </Text>
                                <Text className="text-[10px] font-semibold text-slate-400">
                                  {formatDateDisplay(claim.createdAt || claim.submittedAt)}
                                </Text>
                              </View>

                              <View
                                className={`px-2.5 py-1 rounded-xl ${isSettled
                                    ? "bg-purple-100"
                                    : isWaiting
                                      ? "bg-amber-100"
                                      : isWaitingDisb
                                        ? "bg-blue-100"
                                        : isRej
                                          ? "bg-rose-100"
                                          : "bg-slate-100"
                                  }`}
                              >
                                <Text
                                  className={`text-[10px] font-bold ${isSettled
                                      ? "text-purple-800"
                                      : isWaiting
                                        ? "text-amber-800"
                                        : isWaitingDisb
                                          ? "text-blue-800"
                                          : isRej
                                            ? "text-rose-800"
                                            : "text-slate-700"
                                    }`}
                                >
                                  {s.replace(/_/g, " ")}
                                </Text>
                              </View>
                            </View>

                            <View className="flex-row items-center justify-between">
                              <Text className="text-xs font-extrabold text-slate-800" numberOfLines={1}>
                                {claim.trip?.purpose || claim.trip?.customerName || claim.claimType || "General Claim"}
                              </Text>
                              {claim.trip?.destination && (
                                <Text className="text-[11px] font-bold text-slate-500">
                                  📍 {claim.trip.destination}
                                </Text>
                              )}
                            </View>

                            <View className="flex-row items-center justify-between bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                              <View>
                                <Text className="text-[10px] font-bold text-slate-400">REQUESTED</Text>
                                <Text className="text-xs font-bold text-slate-900">
                                  ₹ {(claim.grandRequested || 0).toLocaleString("en-IN")}
                                </Text>
                              </View>

                              <View>
                                <Text className="text-[10px] font-bold text-slate-400">ALLOWED</Text>
                                <Text className="text-xs font-bold text-blue-600">
                                  ₹ {(claim.grandAllowed || 0).toLocaleString("en-IN")}
                                </Text>
                              </View>

                              <View>
                                <Text className="text-[10px] font-bold text-slate-400">SETTLED</Text>
                                <Text className="text-xs font-bold text-purple-700">
                                  ₹ {(claim.paidAmount || (isSettled ? claim.grandAllowed : 0)).toLocaleString("en-IN")}
                                </Text>
                              </View>
                            </View>
                          </View>
                        );
                      })
                    )
                  )}

                  {/* 4. CUSTOMER VISITS CARDS */}
                  {activeModule === "visits" && (
                    visitsFiltered.length === 0 ? (
                      <View className="bg-white rounded-3xl p-8 items-center justify-center border border-slate-200 shadow-2xs">
                        <MapPin size={36} color="#94a3b8" />
                        <Text className="text-sm font-bold text-slate-800 mt-3">No Customer Visits Found</Text>
                        <Text className="text-xs text-slate-400 text-center mt-1 max-w-xs">
                          {selectedStatusFilter !== "All"
                            ? `No visits matching status "${selectedStatusFilter}".`
                            : "No scheduled visits in this date range."}
                        </Text>
                        {selectedStatusFilter !== "All" ? (
                          <TouchableOpacity
                            activeOpacity={0.75}
                            onPress={() => setSelectedStatusFilter("All")}
                            className="mt-4 px-4 py-2 bg-indigo-50 rounded-xl border border-indigo-100"
                          >
                            <Text className="text-xs font-bold text-indigo-600">Show All Visits</Text>
                          </TouchableOpacity>
                        ) : (
                          <TouchableOpacity
                            activeOpacity={0.75}
                            onPress={() => handlePresetSelect("this_month")}
                            className="mt-4 px-4 py-2 bg-slate-100 rounded-xl border border-slate-200"
                          >
                            <Text className="text-xs font-bold text-slate-700">View This Month</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    ) : (
                      visitsFiltered.map((visit, idx) => {
                        const s = (visit.status || "").toLowerCase().replace(/\s+/g, "_");
                        const isDone = s === "completed";
                        const isProg = s === "in_progress";
                        const isOver = s === "over_due" || s === "overdue";

                        return (
                          <View
                            key={visit._id || idx}
                            className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs mb-3 space-y-2.5"
                          >
                            <View className="flex-row items-center justify-between border-b border-slate-100 pb-2">
                              <View className="flex-row items-center gap-2">
                                <View className="bg-pink-50 px-2 py-0.5 rounded-lg border border-pink-100">
                                  <Text className="text-[10px] font-bold text-pink-700">
                                    {visit.visitType === "customer" ? "Customer Visit" : "Self Visit"}
                                  </Text>
                                </View>
                                <Text className="text-xs font-bold text-slate-800">
                                  {formatDateDisplay(visit.scheduledDate)} · {visit.scheduledTime || ""}
                                </Text>
                              </View>

                              <View
                                className={`px-2.5 py-0.5 rounded-lg ${isDone
                                    ? "bg-emerald-100"
                                    : isProg
                                      ? "bg-amber-100"
                                      : isOver
                                        ? "bg-rose-100"
                                        : "bg-blue-100"
                                  }`}
                              >
                                <Text
                                  className={`text-[10px] font-extrabold ${isDone
                                      ? "text-emerald-800"
                                      : isProg
                                        ? "text-amber-800"
                                        : isOver
                                          ? "text-rose-800"
                                          : "text-blue-800"
                                    }`}
                                >
                                  {visit.status || "Upcoming"}
                                </Text>
                              </View>
                            </View>

                            <Text className="text-xs font-extrabold text-slate-900">
                              {visit.customerName || visit.customerId?.customerName || "Location Visit"}
                            </Text>

                            {visit.reason && (
                              <Text className="text-xs text-slate-600 font-medium">
                                {visit.reason}
                              </Text>
                            )}

                            {(visit.checkInTime || visit.checkOutTime) && (
                              <View className="flex-row items-center justify-between bg-slate-50 p-2 rounded-xl border border-slate-100">
                                <Text className="text-[11px] font-semibold text-slate-600">
                                  In: {format12hrTime(visit.checkInTime)}
                                </Text>
                                <Text className="text-[11px] font-semibold text-slate-600">
                                  Out: {format12hrTime(visit.checkOutTime)}
                                </Text>
                                {visit.duration && (
                                  <Text className="text-[11px] font-bold text-indigo-600">
                                    {visit.duration}
                                  </Text>
                                )}
                              </View>
                            )}
                          </View>
                        );
                      })
                    )
                  )}

                  {/* 5. MATERIAL MOVEMENT CARDS */}
                  {activeModule === "material" && (
                    materialFiltered.length === 0 ? (
                      <View className="bg-white rounded-3xl p-8 items-center justify-center border border-slate-200 shadow-2xs">
                        <Truck size={36} color="#94a3b8" />
                        <Text className="text-sm font-bold text-slate-800 mt-3">No Material Movements Found</Text>
                        <Text className="text-xs text-slate-400 text-center mt-1 max-w-xs">
                          {selectedStatusFilter !== "All"
                            ? `No transactions matching status "${selectedStatusFilter}".`
                            : "No movements recorded in this period."}
                        </Text>
                        {selectedStatusFilter !== "All" ? (
                          <TouchableOpacity
                            activeOpacity={0.75}
                            onPress={() => setSelectedStatusFilter("All")}
                            className="mt-4 px-4 py-2 bg-indigo-50 rounded-xl border border-indigo-100"
                          >
                            <Text className="text-xs font-bold text-indigo-600">Show All Movements</Text>
                          </TouchableOpacity>
                        ) : (
                          <TouchableOpacity
                            activeOpacity={0.75}
                            onPress={() => handlePresetSelect("this_month")}
                            className="mt-4 px-4 py-2 bg-slate-100 rounded-xl border border-slate-200"
                          >
                            <Text className="text-xs font-bold text-slate-700">View This Month</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    ) : (
                      materialFiltered.map((txn, idx) => {
                        const s = (txn.status || "COMPLETED").toUpperCase();
                        const isDone = ["COMPLETED", "RECEIVED", "DISPATCHED", "CLOSED"].includes(s);
                        const isPending = ["PENDING", "DRAFT", "SUBMITTED"].includes(s);

                        return (
                          <View
                            key={txn._id || idx}
                            className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs mb-3 space-y-2.5"
                          >
                            <View className="flex-row items-center justify-between border-b border-slate-100 pb-2">
                              <View>
                                <Text className="text-xs font-bold text-slate-900">
                                  {txn.transactionNumber || txn.challanNumber || txn.movementNumber || `TRX-${idx + 1}`}
                                </Text>
                                <Text className="text-[10px] font-semibold text-slate-400">
                                  {formatDateDisplay(txn.createdAt || txn.date)}
                                </Text>
                              </View>

                              <View
                                className={`px-2.5 py-1 rounded-xl ${isDone
                                    ? "bg-teal-100"
                                    : isPending
                                      ? "bg-amber-100"
                                      : "bg-slate-100"
                                  }`}
                              >
                                <Text
                                  className={`text-[10px] font-bold ${isDone
                                      ? "text-teal-800"
                                      : isPending
                                        ? "text-amber-800"
                                        : "text-slate-700"
                                    }`}
                                >
                                  {s.replace(/_/g, " ")}
                                </Text>
                              </View>
                            </View>

                            <View className="flex-row items-center justify-between">
                              <Text className="text-xs font-extrabold text-slate-800">
                                Type: {txn.documentType || txn.type || "Movement"}
                              </Text>
                              {txn.department && (
                                <Text className="text-[11px] font-bold text-slate-500">
                                  Dept: {txn.department}
                                </Text>
                              )}
                            </View>

                            <View className="flex-row items-center justify-between bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                              <View>
                                <Text className="text-[10px] font-bold text-slate-400">SENDER</Text>
                                <Text className="text-xs font-bold text-slate-800">
                                  {txn.senderName || txn.requester?.name || "Store / Warehouse"}
                                </Text>
                              </View>

                              <View className="items-end">
                                <Text className="text-[10px] font-bold text-slate-400">RECEIVER</Text>
                                <Text className="text-xs font-bold text-slate-800">
                                  {txn.receiverName || txn.receiver?.name || "Handler"}
                                </Text>
                              </View>
                            </View>

                            {Array.isArray(txn.items) && txn.items.length > 0 && (
                              <View className="flex-row items-center gap-1.5 pt-1">
                                <Package size={13} color="#64748b" />
                                <Text className="text-[11px] font-bold text-slate-600">
                                  {txn.items.length} item(s) in this movement
                                </Text>
                              </View>
                            )}
                          </View>
                        );
                      })
                    )
                  )}
                </>
              )}
            </View>
          </View>
        )}
      </ScrollView>

      {/* ── CUSTOM DATE RANGE MODAL ── */}
      <Modal
        visible={showDatePickerModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDatePickerModal(false)}
      >
        <View className="flex-1 bg-black/60 items-center justify-center p-4">
          <View className="bg-white rounded-3xl p-5 w-full max-w-sm border border-slate-200 shadow-2xl">
            <View className="flex-row items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <Text className="text-base font-bold text-slate-900">Select Date Range</Text>
              <TouchableOpacity onPress={() => setShowDatePickerModal(false)}>
                <X size={20} color="#94a3b8" />
              </TouchableOpacity>
            </View>

            {/* Start Date Button */}
            <View className="mb-3">
              <Text className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                START DATE
              </Text>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => {
                  setPickerMode("start");
                  setShowNativePicker(true);
                }}
                className="bg-slate-50 border border-slate-200 p-3 rounded-2xl flex-row items-center justify-between"
              >
                <Text className="text-xs font-extrabold text-slate-800">
                  {formatDateDisplay(tempStartDate)}
                </Text>
                <Calendar size={16} color="#4f46e5" />
              </TouchableOpacity>
            </View>

            {/* End Date Button */}
            <View className="mb-5">
              <Text className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                END DATE
              </Text>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => {
                  setPickerMode("end");
                  setShowNativePicker(true);
                }}
                className="bg-slate-50 border border-slate-200 p-3 rounded-2xl flex-row items-center justify-between"
              >
                <Text className="text-xs font-extrabold text-slate-800">
                  {formatDateDisplay(tempEndDate)}
                </Text>
                <Calendar size={16} color="#4f46e5" />
              </TouchableOpacity>
            </View>

            {/* Apply Button */}
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={handleApplyCustomDates}
              className="bg-indigo-600 py-3.5 rounded-2xl items-center shadow-md shadow-indigo-200"
            >
              <Text className="text-white text-xs font-extrabold">Apply Date Filter</Text>
            </TouchableOpacity>

            {/* Native DateTimePicker */}
            {showNativePicker && (
              <DateTimePicker
                value={pickerMode === "start" ? tempStartDate : tempEndDate}
                mode="date"
                display={Platform.OS === "ios" ? "spinner" : "default"}
                onChange={(event, selectedDate) => {
                  setShowNativePicker(false);
                  if (selectedDate) {
                    if (pickerMode === "start") setTempStartDate(selectedDate);
                    else setTempEndDate(selectedDate);
                  }
                }}
              />
            )}
          </View>
        </View>
      </Modal>

      {/* ── FIXED GLOBAL APP FOOTER WITH TAB 4 ACTIVE ── */}
      <GlobalAppFooter navigation={navigation} currentScreen="Reports" module="reports" />
    </View>
  );
};

export default ReportsScreen;
