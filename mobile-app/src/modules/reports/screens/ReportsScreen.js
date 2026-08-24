import DateTimePicker from "@react-native-community/datetimepicker";
import {
  AlertCircle,
  ArrowLeft,
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
  X,
  XCircle
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
import api from "../../../api/axios";
import GlobalAppFooter from "../../../components/GlobalAppFooter";

// Safe text extractor to guarantee no raw objects are rendered as React children
const safeText = (val, fallback = "") => {
  if (val === null || val === undefined) return fallback;
  if (typeof val === "object") {
    if (val.name) return String(val.name);
    if (val.customerName) return String(val.customerName);
    if (val.label) return String(val.label);
    if (val.title) return String(val.title);
    if (val._id) return String(val._id);
    return fallback;
  }
  return String(val);
};

// Module configurations for the 5 reports
export const REPORT_MODULES = [
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
    color: "#7c3aed",
    bg: "#f5f3ff",
    border: "#ddd6fe",
    badge: "Claims & Status",
    description: "Monitor submitted expense claims, approval queues, disbursement, and settlement amounts."
  },
  {
    key: "visits",
    title: "Customer Visit Report",
    shortLabel: "Customer Visit",
    subtitle: "Client Meetings, GPS & Notes",
    icon: MapPin,
    color: "#059669",
    bg: "#ecfdf5",
    border: "#a7f3d0",
    badge: "Client & Self Visits",
    description: "Audit scheduled customer visits, check-in locations, duration, and meeting outcomes."
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
    if (route?.params?.viewMode === "hub") {
      setViewMode("hub");
    } else if (route?.params?.module) {
      setActiveModule(route.params.module);
      setViewMode("detail");
    }
  }, [route?.params?.module, route?.params?.viewMode]);

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
        // Fetch preview metrics for the 4 core modules in parallel
        const [attRes, leaveRes, expRes, visitRes] = await Promise.allSettled([
          api.get(`/attendance/history?startDate=${sDateStr}&endDate=${eDateStr}`),
          api.get(`/leaves/my-leaves?startDate=${sDateStr}&endDate=${eDateStr}`),
          api.get(`/expense/claims?limit=100&scope=my&startDate=${sDateStr}&endDate=${eDateStr}`),
          api.get(`/visits?scope=my&startDate=${sDateStr}&endDate=${eDateStr}`),
        ]);

        if (attRes.status === "fulfilled") setAttendanceData(attRes.value.data?.data || []);
        if (leaveRes.status === "fulfilled") {
          setLeavesData(leaveRes.value.data?.data || []);
          setLeaveQuotas(leaveRes.value.data?.quotas || []);
        }
        if (expRes.status === "fulfilled") setExpenseData(expRes.value.data?.data || []);
        if (visitRes.status === "fulfilled") setVisitsData(visitRes.value.data?.data || []);
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
          const res = await api.get(`/expense/claims?limit=100&scope=my&startDate=${sDateStr}&endDate=${eDateStr}`);
          setExpenseData(res.data?.data || []);
        } else if (activeModule === "visits") {
          const res = await api.get(`/visits?scope=my&startDate=${sDateStr}&endDate=${eDateStr}`);
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
  const attendanceFiltered = useMemo(() => {
    // Client-side deduplication by unique day to prevent duplicate punches for the same day
    const seenDates = new Set();
    const uniqueAttendance = [];
    for (const item of attendanceData) {
      const dateKey = String(item.date || item.punchIn?.time || item._id).split("T")[0];
      if (!seenDates.has(dateKey)) {
        seenDates.add(dateKey);
        uniqueAttendance.push(item);
      }
    }

    return uniqueAttendance.filter((item) => {
      const itemStatus = safeText(item.status, "Present").toLowerCase();
      const filter = selectedStatusFilter.toLowerCase();

      let statusMatch = filter === "all";
      if (!statusMatch) {
        if (filter === "present") {
          statusMatch = itemStatus === "present" || itemStatus.includes("present") || itemStatus === "half day" || (!itemStatus.includes("absent") && !itemStatus.includes("leave") && !itemStatus.includes("not punched") && !!item.punchIn?.time);
        } else if (filter === "absent") {
          statusMatch = itemStatus === "absent" || itemStatus.includes("absent") || itemStatus.includes("not punched") || (!item.punchIn?.time && !item.isOnLeave && !itemStatus.includes("leave"));
        } else if (filter === "half day") {
          statusMatch = itemStatus.includes("half");
        } else if (filter === "leave") {
          statusMatch = itemStatus.includes("leave") || item.isOnLeave;
        } else {
          statusMatch = itemStatus.includes(filter);
        }
      }

      const q = searchQuery.toLowerCase().trim();
      const inAddr = safeText(item.punchIn?.location?.address).toLowerCase();
      const outAddr = safeText(item.punchOut?.location?.address).toLowerCase();
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
      const s = safeText(item.status, "Present").toLowerCase();
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
      const itemStatus = safeText(item.status, "pending").toLowerCase();
      const filter = selectedStatusFilter.toLowerCase();

      let statusMatch = filter === "all";
      if (!statusMatch) {
        if (filter === "approved") statusMatch = itemStatus === "approved";
        else if (filter === "pending") statusMatch = itemStatus === "pending" || itemStatus === "applied";
        else if (filter === "rejected") statusMatch = itemStatus === "rejected" || itemStatus === "cancelled";
        else statusMatch = itemStatus.includes(filter);
      }

      const q = searchQuery.toLowerCase().trim();
      const typeStr = safeText(item.leaveType || item.type).toLowerCase();
      const reasonStr = safeText(item.reason || item.adminNote).toLowerCase();
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
      const s = safeText(item.status, "pending").toLowerCase();
      const days = item.durationDays || (item.duration === "Half Day" ? 0.5 : (item.daysCount || 1));
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
      const s = safeText(item.status, "SUBMITTED").toUpperCase();
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
      const claimNum = safeText(item.claimNumber).toLowerCase();
      const typeStr = safeText(item.claimType).toLowerCase();
      const purposeStr = safeText(item.trip?.purpose || item.purpose).toLowerCase();
      const claimant = safeText(item.submittedBy?.name || item.submittedByName || item.employeeClaims?.[0]?.employee?.name).toLowerCase();

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
      // Use user's own portion if tagged, or full amount if applicant
      const req = item.userRequested !== undefined ? Number(item.userRequested) : Number(item.grandRequested || item.amount || 0);
      const allowed = item.userAllowed !== undefined ? Number(item.userAllowed) : Number(item.grandAllowed || req);
      const s = safeText(item.status, "SUBMITTED").toUpperCase();

      totalRequested += req;

      if (["PAID", "SETTLED", "DISBURSED"].includes(s)) {
        settled += (item.userAllowed !== undefined ? Number(item.userAllowed) : (Number(item.paidAmount) || allowed));
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
      const s = safeText(item.status || item.approvalStatus, "To Do").toLowerCase().replace(/[\s_-]+/g, "");
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
      const custName = safeText(item.customerName || item.clientName || item.customerId?.customerName).toLowerCase();
      const purpose = safeText(item.purpose || item.reason || item.notes).toLowerCase();
      const location = safeText(item.location || item.address).toLowerCase();
      const emp = safeText(item.employeeName).toLowerCase();

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
      const s = safeText(item.status || item.approvalStatus).toLowerCase();
      if (s === "completed" || s === "done") completed++;
      else if (s === "in progress" || s === "ongoing") inProgress++;
      else if (s === "overdue" || s === "over_due") overdue++;
      else todoUpcoming++;

      const typeStr = safeText(item.visitType || item.type, "customer").toLowerCase();
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
      const s = safeText(item.status, "COMPLETED").toUpperCase().replace(/[\s_-]+/g, "");
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
      const numStr = safeText(item.transactionNumber || item.challanNumber || item.movementNumber || item._id).toLowerCase();
      const typeStr = safeText(item.documentType || item.type).toLowerCase();
      const sender = safeText(item.senderName || item.requester?.name || item.requester).toLowerCase();
      const receiver = safeText(item.receiverName || item.receiver?.name || item.receiver).toLowerCase();
      const dest = safeText(item.destinationLocation).toLowerCase();

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
      const s = safeText(item.status, "COMPLETED").toUpperCase();
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

      {/* ── TOP HEADER BAR (CLEAN & DIRECT) ── */}
      <View className="bg-slate-900 pt-12 pb-5 px-5 rounded-b-[32px] shadow-md">
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-3 flex-1">
            <TouchableOpacity
              activeOpacity={0.75}
              onPress={() => {
                if (viewMode === "detail") {
                  setViewMode("hub");
                  setSelectedStatusFilter("All");
                  setSearchQuery("");
                } else {
                  if (navigation.canGoBack()) {
                    navigation.goBack();
                  } else {
                    navigation.navigate("HRScreen");
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
              onPress={() => navigation.navigate("HRScreen")}
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
        {/* ── DATE FILTER BAR (DIRECT START FOR ALL REPORT PAGES) ── */}
        <View className="bg-white rounded-3xl p-4 border border-slate-200 shadow-xs mb-4">
          <View className="flex-row items-center justify-between pb-3 border-b border-slate-100 mb-3">
            <View className="flex-row items-center gap-2">
              <Calendar size={16} color="#4f46e5" />
              <Text className="text-xs font-bold text-slate-800">
                {formatDateDisplay(startDateObj)} — {formatDateDisplay(endDateObj)}
              </Text>
            </View>

            <TouchableOpacity
              activeOpacity={0.75}
              onPress={() => {
                setTempStartDate(startDateObj);
                setTempEndDate(endDateObj);
                setShowDatePickerModal(true);
              }}
              className="flex-row items-center gap-1.5 bg-indigo-50 px-3 py-1.5 rounded-xl border border-indigo-100"
            >
              <SlidersHorizontal size={13} color="#4f46e5" />
              <Text className="text-xs font-bold text-indigo-600">Change</Text>
            </TouchableOpacity>
          </View>

          {/* Horizontal Preset Range Pills */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            nestedScrollEnabled={true}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ flexDirection: "row", alignItems: "center" }}
            className="flex-row"
          >
            {PRESET_RANGES.map((preset) => {
              const isSelected = activePreset === preset.key;
              return (
                <TouchableOpacity
                  key={preset.key}
                  activeOpacity={0.85}
                  hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                  onPress={() => handlePresetSelect(preset.key)}
                  className={`px-3.5 py-1.5 rounded-xl mr-2 border ${isSelected
                    ? "bg-indigo-600 border-indigo-600 shadow-xs"
                    : "bg-slate-50 border-slate-200"
                    }`}
                >
                  <Text
                    className={`text-xs font-bold ${isSelected ? "text-white" : "text-slate-600"
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
        {/* ── VIEW MODE 1: HUB VIEW (OVERVIEW OF 5 MODULES) ─────── */}
        {/* ═════════════════════════════════════════════════════════ */}
        {viewMode === "hub" ? (
          <View className="space-y-4">
            <Text className="text-xs font-bold text-slate-400 tracking-wider mb-1 px-1">
              Select Module Report
            </Text>

            {REPORT_MODULES.map((mod) => {
              const Icon = mod.icon;

              let summaryLine = "";
              let stat1 = { label: "", val: "" };
              let stat2 = { label: "", val: "" };
              let stat3 = { label: "", val: "" };

              if (mod.key === "attendance") {
                summaryLine = `${attendanceStats.present} Present · ${attendanceStats.absent} Absent · ${attendanceStats.totalWorkHours} Logged`;
                stat1 = { label: "Present", val: attendanceStats.present };
                stat2 = { label: "Absent", val: attendanceStats.absent };
                stat3 = { label: "Work Hours", val: attendanceStats.totalWorkHours };
              } else if (mod.key === "leaves") {
                summaryLine = `${leavesStats.approved} Approved · ${leavesStats.pending} Pending · ${leavesStats.rejected} Rejected`;
                stat1 = { label: "Approved", val: leavesStats.approved };
                stat2 = { label: "Pending", val: leavesStats.pending };
                stat3 = { label: "Total Apps", val: leavesStats.total };
              } else if (mod.key === "expense") {
                summaryLine = `₹ ${expenseStats.settled.toLocaleString("en-IN")} Settled · ₹ ${expenseStats.waitingApproval.toLocaleString("en-IN")} Pending`;
                stat1 = { label: "Requested", val: `₹ ${expenseStats.totalRequested.toLocaleString("en-IN")}` };
                stat2 = { label: "Settled", val: `₹ ${expenseStats.settled.toLocaleString("en-IN")}` };
                stat3 = { label: "Claims", val: expenseStats.totalCount };
              } else if (mod.key === "visits") {
                summaryLine = `${visitsStats.completed} Completed · ${visitsStats.todoUpcoming} Upcoming · ${visitsStats.overdue} Overdue`;
                stat1 = { label: "Completed", val: visitsStats.completed };
                stat2 = { label: "Upcoming", val: visitsStats.todoUpcoming };
                stat3 = { label: "Total Visits", val: visitsStats.total };
              } else if (mod.key === "material") {
                summaryLine = `${materialStats.completed} Completed · ${materialStats.pending} Pending · ${materialStats.inTransit} In Transit`;
                stat1 = { label: "Completed", val: materialStats.completed };
                stat2 = { label: "Pending", val: materialStats.pending };
                stat3 = { label: "Movements", val: materialStats.total };
              }

              return (
                <TouchableOpacity
                  key={mod.key}
                  activeOpacity={0.85}
                  onPress={() => handleOpenReportModule(mod.key)}
                  className="bg-white rounded-3xl p-5 border border-slate-200 shadow-xs mb-3 space-y-3.5"
                >
                  <View className="flex-row items-center justify-between">
                    <View className="flex-row items-center gap-3">
                      <View
                        className="w-12 h-12 rounded-2xl items-center justify-center border"
                        style={{ backgroundColor: mod.bg, borderColor: mod.border }}
                      >
                        <Icon size={24} color={mod.color} />
                      </View>

                      <View>
                        <Text className="text-base font-bold text-slate-900">{mod.title}</Text>
                        <Text className="text-[11px] font-bold text-slate-400 mt-0.5">{mod.badge}</Text>
                      </View>
                    </View>

                    <View className="w-9 h-9 rounded-full bg-slate-50 border border-slate-200 items-center justify-center">
                      <ChevronRight size={18} color="#64748b" />
                    </View>
                  </View>

                  <Text className="text-xs text-slate-600 font-semibold">{mod.description}</Text>

                  {/* 3 Metric Pills */}
                  <View className="flex-row items-center justify-between bg-slate-50 p-2.5 rounded-2xl border border-slate-100">
                    <View className="flex-1 items-center border-r border-slate-200/80">
                      <Text className="text-[10px] font-bold text-slate-400">{stat1.label}</Text>
                      <Text className="text-xs font-bold text-slate-800 mt-0.5">{stat1.val}</Text>
                    </View>

                    <View className="flex-1 items-center border-r border-slate-200/80">
                      <Text className="text-[10px] font-bold text-slate-400">{stat2.label}</Text>
                      <Text className="text-xs font-bold text-indigo-600 mt-0.5">{stat2.val}</Text>
                    </View>

                    <View className="flex-1 items-center">
                      <Text className="text-[10px] font-bold text-slate-400">{stat3.label}</Text>
                      <Text className="text-xs font-bold text-slate-800 mt-0.5">{stat3.val}</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : (
          /* ═════════════════════════════════════════════════════════ */
          /* ── VIEW MODE 2: MODULE DETAIL VIEW ───────────────────── */
          /* ═════════════════════════════════════════════════════════ */
          <View className="space-y-4">
            {/* ── 1. MODULE-SPECIFIC SUMMARY KPI CARDS (PERFECT 1:1 SQUARE CARDS IN 2X2 GRID) ── */}
            {activeModule === "attendance" && (
              <View className="flex-row flex-wrap justify-between gap-y-3">
                {/* 1. Present Days */}
                <TouchableOpacity
                  activeOpacity={0.8}
                  style={{ aspectRatio: 1 }}
                  onPress={() => setSelectedStatusFilter(selectedStatusFilter === "Present" ? "All" : "Present")}
                  className={`w-[48%] bg-white p-4 rounded-3xl border justify-between items-center text-center shadow-xs ${selectedStatusFilter === "Present" ? "border-emerald-500 bg-emerald-50/50 ring-2 ring-emerald-400/20" : "border-slate-200"
                    }`}
                >
                  <View className="w-10 h-10 rounded-2xl bg-emerald-50 border border-emerald-100 items-center justify-center">
                    <CalendarCheck size={20} color="#059669" />
                  </View>
                  <View className="items-center">
                    <Text className="text-2xl font-bold text-emerald-600 tracking-tight">{attendanceStats.present}</Text>
                    <Text className="text-[10px] font-bold text-slate-500 mt-1 tracking-wider">Present Days</Text>
                  </View>
                  <View className="bg-slate-50 px-2.5 py-0.5 rounded-full border border-slate-100">
                    <Text className="text-[9px] font-extrabold text-slate-400">Tap to filter</Text>
                  </View>
                </TouchableOpacity>

                {/* 2. Absent Days */}
                <TouchableOpacity
                  activeOpacity={0.8}
                  style={{ aspectRatio: 1 }}
                  onPress={() => setSelectedStatusFilter(selectedStatusFilter === "Absent" ? "All" : "Absent")}
                  className={`w-[48%] bg-white p-4 rounded-3xl border justify-between items-center text-center shadow-xs ${selectedStatusFilter === "Absent" ? "border-rose-500 bg-rose-50/50 ring-2 ring-rose-400/20" : "border-slate-200"
                    }`}
                >
                  <View className="w-10 h-10 rounded-2xl bg-rose-50 border border-rose-100 items-center justify-center">
                    <XCircle size={20} color="#e11d48" />
                  </View>
                  <View className="items-center">
                    <Text className="text-2xl font-bold text-rose-600 tracking-tight">{attendanceStats.absent}</Text>
                    <Text className="text-[10px] font-bold text-slate-500 mt-1 tracking-wider">Absent Days</Text>
                  </View>
                  <View className="bg-slate-50 px-2.5 py-0.5 rounded-full border border-slate-100">
                    <Text className="text-[9px] font-extrabold text-slate-400">Tap to filter</Text>
                  </View>
                </TouchableOpacity>

                {/* 3. Total Work Hours */}
                <TouchableOpacity
                  activeOpacity={0.8}
                  style={{ aspectRatio: 1 }}
                  onPress={() => setSelectedStatusFilter("All")}
                  className={`w-[48%] bg-white p-4 rounded-3xl border justify-between items-center text-center shadow-xs ${selectedStatusFilter === "All" ? "border-indigo-500 bg-indigo-50/50 ring-2 ring-indigo-400/20" : "border-slate-200"
                    }`}
                >
                  <View className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-100 items-center justify-center">
                    <Clock size={20} color="#4f46e5" />
                  </View>
                  <View className="items-center">
                    <Text className="text-xl font-bold text-indigo-600 tracking-tight" numberOfLines={1}>{attendanceStats.totalWorkHours}</Text>
                    <Text className="text-[10px] font-bold text-slate-500 mt-1 tracking-wider">Total Work Hours</Text>
                  </View>
                  <View className="bg-slate-50 px-2.5 py-0.5 rounded-full border border-slate-100">
                    <Text className="text-[9px] font-extrabold text-slate-400">Across logs</Text>
                  </View>
                </TouchableOpacity>

                {/* 4. Outside Punches */}
                <View
                  style={{ aspectRatio: 1 }}
                  className="w-[48%] bg-white p-4 rounded-3xl border border-slate-200 justify-between items-center text-center shadow-xs"
                >
                  <View className="w-10 h-10 rounded-2xl bg-amber-50 border border-amber-100 items-center justify-center">
                    <MapPin size={20} color="#d97706" />
                  </View>
                  <View className="items-center">
                    <Text className="text-2xl font-bold text-amber-600 tracking-tight">{attendanceStats.outsidePunches}</Text>
                    <Text className="text-[10px] font-bold text-slate-500 mt-1 tracking-wider">Outside Punches</Text>
                  </View>
                  <View className="bg-slate-50 px-2.5 py-0.5 rounded-full border border-slate-100">
                    <Text className="text-[9px] font-extrabold text-slate-400">Location flagged</Text>
                  </View>
                </View>
              </View>
            )}

            {activeModule === "leaves" && (
              <View className="space-y-3">
                {/* Leave Quota Ribbon */}
                {leaveQuotas.length > 0 && (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    nestedScrollEnabled={true}
                    keyboardShouldPersistTaps="handled"
                    contentContainerStyle={{ flexDirection: "row", alignItems: "center" }}
                    className="flex-row pb-1"
                  >
                    {leaveQuotas.map((q, idx) => (
                      <View key={idx} className="bg-rose-50 border border-rose-100 p-3 rounded-2xl mr-2.5 min-w-[110px]">
                        <Text className="text-[10px] font-bold text-rose-500">{safeText(q.leaveType, "Leave")}</Text>
                        <Text className="text-base font-bold text-rose-700 mt-0.5">
                          {q.balance ?? q.availableDays ?? 0} <Text className="text-[10px] font-bold text-rose-400">Left</Text>
                        </Text>
                      </View>
                    ))}
                  </ScrollView>
                )}

                {/* 4 Perfect Square Cards (2x2 Grid) */}
                <View className="flex-row flex-wrap justify-between gap-y-3">
                  {/* 1. Approved Leaves */}
                  <TouchableOpacity
                    activeOpacity={0.8}
                    style={{ aspectRatio: 1 }}
                    onPress={() => setSelectedStatusFilter(selectedStatusFilter === "Approved" ? "All" : "Approved")}
                    className={`w-[48%] bg-white p-4 rounded-3xl border justify-between items-center text-center shadow-xs ${selectedStatusFilter === "Approved" ? "border-emerald-500 bg-emerald-50/50 ring-2 ring-emerald-400/20" : "border-slate-200"
                      }`}
                  >
                    <View className="w-10 h-10 rounded-2xl bg-emerald-50 border border-emerald-100 items-center justify-center">
                      <CheckCircle2 size={20} color="#059669" />
                    </View>
                    <View className="items-center">
                      <Text className="text-2xl font-bold text-emerald-600 tracking-tight">{leavesStats.approved}</Text>
                      <Text className="text-[10px] font-bold text-slate-500 mt-1 tracking-wider">Approved Leaves</Text>
                    </View>
                    <View className="bg-slate-50 px-2.5 py-0.5 rounded-full border border-slate-100">
                      <Text className="text-[9px] font-extrabold text-slate-400">Tap to filter</Text>
                    </View>
                  </TouchableOpacity>

                  {/* 2. Pending Requests */}
                  <TouchableOpacity
                    activeOpacity={0.8}
                    style={{ aspectRatio: 1 }}
                    onPress={() => setSelectedStatusFilter(selectedStatusFilter === "Pending" ? "All" : "Pending")}
                    className={`w-[48%] bg-white p-4 rounded-3xl border justify-between items-center text-center shadow-xs ${selectedStatusFilter === "Pending" ? "border-amber-500 bg-amber-50/50 ring-2 ring-amber-400/20" : "border-slate-200"
                      }`}
                  >
                    <View className="w-10 h-10 rounded-2xl bg-amber-50 border border-amber-100 items-center justify-center">
                      <Hourglass size={20} color="#d97706" />
                    </View>
                    <View className="items-center">
                      <Text className="text-2xl font-bold text-amber-600 tracking-tight">{leavesStats.pending}</Text>
                      <Text className="text-[10px] font-bold text-slate-500 mt-1 tracking-wider">Pending</Text>
                    </View>
                    <View className="bg-slate-50 px-2.5 py-0.5 rounded-full border border-slate-100">
                      <Text className="text-[9px] font-extrabold text-slate-400">Tap to filter</Text>
                    </View>
                  </TouchableOpacity>

                  {/* 3. Rejected Leaves */}
                  <TouchableOpacity
                    activeOpacity={0.8}
                    style={{ aspectRatio: 1 }}
                    onPress={() => setSelectedStatusFilter(selectedStatusFilter === "Rejected" ? "All" : "Rejected")}
                    className={`w-[48%] bg-white p-4 rounded-3xl border justify-between items-center text-center shadow-xs ${selectedStatusFilter === "Rejected" ? "border-rose-500 bg-rose-50/50 ring-2 ring-rose-400/20" : "border-slate-200"
                      }`}
                  >
                    <View className="w-10 h-10 rounded-2xl bg-rose-50 border border-rose-100 items-center justify-center">
                      <XCircle size={20} color="#e11d48" />
                    </View>
                    <View className="items-center">
                      <Text className="text-2xl font-bold text-rose-600 tracking-tight">{leavesStats.rejected}</Text>
                      <Text className="text-[10px] font-bold text-slate-500 mt-1 tracking-wider">Rejected</Text>
                    </View>
                    <View className="bg-slate-50 px-2.5 py-0.5 rounded-full border border-slate-100">
                      <Text className="text-[9px] font-extrabold text-slate-400">Tap to filter</Text>
                    </View>
                  </TouchableOpacity>

                  {/* 4. Approved Days Count */}
                  <View
                    style={{ aspectRatio: 1 }}
                    className="w-[48%] bg-white p-4 rounded-3xl border border-slate-200 justify-between items-center text-center shadow-xs"
                  >
                    <View className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-100 items-center justify-center">
                      <CalendarDays size={20} color="#4f46e5" />
                    </View>
                    <View className="items-center">
                      <Text className="text-2xl font-bold text-indigo-600 tracking-tight">{leavesStats.approvedDays}</Text>
                      <Text className="text-[10px] font-bold text-slate-500 mt-1 tracking-wider">Approved Days</Text>
                    </View>
                    <View className="bg-slate-50 px-2.5 py-0.5 rounded-full border border-slate-100">
                      <Text className="text-[9px] font-extrabold text-slate-400">{leavesStats.total} applications</Text>
                    </View>
                  </View>
                </View>
              </View>
            )}

            {activeModule === "expense" && (
              <View className="flex-row flex-wrap justify-between gap-y-3">
                {/* 1. Requested Total */}
                <TouchableOpacity
                  activeOpacity={0.8}
                  style={{ aspectRatio: 1 }}
                  onPress={() => setSelectedStatusFilter("All")}
                  className={`w-[48%] bg-white p-4 rounded-3xl border justify-between items-center text-center shadow-xs ${selectedStatusFilter === "All" ? "border-indigo-500 bg-indigo-50/50 ring-2 ring-indigo-400/20" : "border-slate-200"
                    }`}
                >
                  <View className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-100 items-center justify-center">
                    <Receipt size={20} color="#4f46e5" />
                  </View>
                  <View className="items-center w-full">
                    <Text className="text-lg font-bold text-slate-900 tracking-tight text-center" numberOfLines={1}>
                      ₹ {expenseStats.totalRequested.toLocaleString("en-IN")}
                    </Text>
                    <Text className="text-[10px] font-bold text-slate-500 mt-1 tracking-wider">Total Requested</Text>
                  </View>
                  <View className="bg-slate-50 px-2.5 py-0.5 rounded-full border border-slate-100">
                    <Text className="text-[9px] font-extrabold text-slate-400">{expenseStats.totalCount} claims</Text>
                  </View>
                </TouchableOpacity>

                {/* 2. Settled / Paid */}
                <TouchableOpacity
                  activeOpacity={0.8}
                  style={{ aspectRatio: 1 }}
                  onPress={() => setSelectedStatusFilter(selectedStatusFilter === "Settled / Paid" ? "All" : "Settled / Paid")}
                  className={`w-[48%] bg-white p-4 rounded-3xl border justify-between items-center text-center shadow-xs ${selectedStatusFilter === "Settled / Paid" ? "border-purple-500 bg-purple-50/50 ring-2 ring-purple-400/20" : "border-slate-200"
                    }`}
                >
                  <View className="w-10 h-10 rounded-2xl bg-purple-50 border border-purple-100 items-center justify-center">
                    <CheckSquare size={20} color="#7c3aed" />
                  </View>
                  <View className="items-center w-full">
                    <Text className="text-lg font-bold text-purple-700 tracking-tight text-center" numberOfLines={1}>
                      ₹ {expenseStats.settled.toLocaleString("en-IN")}
                    </Text>
                    <Text className="text-[10px] font-bold text-slate-500 mt-1 tracking-wider">Settled / Paid</Text>
                  </View>
                  <View className="bg-slate-50 px-2.5 py-0.5 rounded-full border border-slate-100">
                    <Text className="text-[9px] font-extrabold text-slate-400">Disbursed</Text>
                  </View>
                </TouchableOpacity>

                {/* 3. Waiting Approval */}
                <TouchableOpacity
                  activeOpacity={0.8}
                  style={{ aspectRatio: 1 }}
                  onPress={() => setSelectedStatusFilter(selectedStatusFilter === "Waiting Approval" ? "All" : "Waiting Approval")}
                  className={`w-[48%] bg-white p-4 rounded-3xl border justify-between items-center text-center shadow-xs ${selectedStatusFilter === "Waiting Approval" ? "border-amber-500 bg-amber-50/50 ring-2 ring-amber-400/20" : "border-slate-200"
                    }`}
                >
                  <View className="w-10 h-10 rounded-2xl bg-amber-50 border border-amber-100 items-center justify-center">
                    <Hourglass size={20} color="#d97706" />
                  </View>
                  <View className="items-center w-full">
                    <Text className="text-lg font-bold text-amber-600 tracking-tight text-center" numberOfLines={1}>
                      ₹ {expenseStats.waitingApproval.toLocaleString("en-IN")}
                    </Text>
                    <Text className="text-[10px] font-bold text-slate-500 mt-1 tracking-wider">Waiting Approval</Text>
                  </View>
                  <View className="bg-slate-50 px-2.5 py-0.5 rounded-full border border-slate-100">
                    <Text className="text-[9px] font-extrabold text-slate-400">In review</Text>
                  </View>
                </TouchableOpacity>

                {/* 4. Waiting Disbursement */}
                <TouchableOpacity
                  activeOpacity={0.8}
                  style={{ aspectRatio: 1 }}
                  onPress={() => setSelectedStatusFilter(selectedStatusFilter === "Waiting Disbursement" ? "All" : "Waiting Disbursement")}
                  className={`w-[48%] bg-white p-4 rounded-3xl border justify-between items-center text-center shadow-xs ${selectedStatusFilter === "Waiting Disbursement" ? "border-blue-500 bg-blue-50/50 ring-2 ring-blue-400/20" : "border-slate-200"
                    }`}
                >
                  <View className="w-10 h-10 rounded-2xl bg-blue-50 border border-blue-100 items-center justify-center">
                    <CheckCircle2 size={20} color="#2563eb" />
                  </View>
                  <View className="items-center w-full">
                    <Text className="text-lg font-bold text-blue-600 tracking-tight text-center" numberOfLines={1}>
                      ₹ {expenseStats.waitingDisbursement.toLocaleString("en-IN")}
                    </Text>
                    <Text className="text-[10px] font-bold text-slate-500 mt-1 tracking-wider">Waiting Disburs.</Text>
                  </View>
                  <View className="bg-slate-50 px-2.5 py-0.5 rounded-full border border-slate-100">
                    <Text className="text-[9px] font-extrabold text-slate-400">Accounts verified</Text>
                  </View>
                </TouchableOpacity>
              </View>
            )}

            {activeModule === "visits" && (
              <View className="flex-row flex-wrap justify-between gap-y-3">
                {/* 1. Completed */}
                <TouchableOpacity
                  activeOpacity={0.8}
                  style={{ aspectRatio: 1 }}
                  onPress={() => setSelectedStatusFilter(selectedStatusFilter === "Completed" ? "All" : "Completed")}
                  className={`w-[48%] bg-white p-4 rounded-3xl border justify-between items-center text-center shadow-xs ${selectedStatusFilter === "Completed" ? "border-emerald-500 bg-emerald-50/50 ring-2 ring-emerald-400/20" : "border-slate-200"
                    }`}
                >
                  <View className="w-10 h-10 rounded-2xl bg-emerald-50 border border-emerald-100 items-center justify-center">
                    <CheckCircle2 size={20} color="#059669" />
                  </View>
                  <View className="items-center">
                    <Text className="text-2xl font-bold text-emerald-600 tracking-tight">{visitsStats.completed}</Text>
                    <Text className="text-[10px] font-bold text-slate-500 mt-1 tracking-wider">Completed</Text>
                  </View>
                  <View className="bg-slate-50 px-2.5 py-0.5 rounded-full border border-slate-100">
                    <Text className="text-[9px] font-extrabold text-slate-400">Visits done</Text>
                  </View>
                </TouchableOpacity>

                {/* 2. In Progress */}
                <TouchableOpacity
                  activeOpacity={0.8}
                  style={{ aspectRatio: 1 }}
                  onPress={() => setSelectedStatusFilter(selectedStatusFilter === "In Progress" ? "All" : "In Progress")}
                  className={`w-[48%] bg-white p-4 rounded-3xl border justify-between items-center text-center shadow-xs ${selectedStatusFilter === "In Progress" ? "border-amber-500 bg-amber-50/50 ring-2 ring-amber-400/20" : "border-slate-200"
                    }`}
                >
                  <View className="w-10 h-10 rounded-2xl bg-amber-50 border border-amber-100 items-center justify-center">
                    <Clock size={20} color="#d97706" />
                  </View>
                  <View className="items-center">
                    <Text className="text-2xl font-bold text-amber-600 tracking-tight">{visitsStats.inProgress}</Text>
                    <Text className="text-[10px] font-bold text-slate-500 mt-1 tracking-wider">In Progress</Text>
                  </View>
                  <View className="bg-slate-50 px-2.5 py-0.5 rounded-full border border-slate-100">
                    <Text className="text-[9px] font-extrabold text-slate-400">Active now</Text>
                  </View>
                </TouchableOpacity>

                {/* 3. To Do / Scheduled */}
                <TouchableOpacity
                  activeOpacity={0.8}
                  style={{ aspectRatio: 1 }}
                  onPress={() => setSelectedStatusFilter(selectedStatusFilter === "To Do" ? "All" : "To Do")}
                  className={`w-[48%] bg-white p-4 rounded-3xl border justify-between items-center text-center shadow-xs ${selectedStatusFilter === "To Do" ? "border-blue-500 bg-blue-50/50 ring-2 ring-blue-400/20" : "border-slate-200"
                    }`}
                >
                  <View className="w-10 h-10 rounded-2xl bg-blue-50 border border-blue-100 items-center justify-center">
                    <Calendar size={20} color="#2563eb" />
                  </View>
                  <View className="items-center">
                    <Text className="text-2xl font-bold text-blue-600 tracking-tight">{visitsStats.todoUpcoming}</Text>
                    <Text className="text-[10px] font-bold text-slate-500 mt-1 tracking-wider">To Do / Scheduled</Text>
                  </View>
                  <View className="bg-slate-50 px-2.5 py-0.5 rounded-full border border-slate-100">
                    <Text className="text-[9px] font-extrabold text-slate-400">Upcoming</Text>
                  </View>
                </TouchableOpacity>

                {/* 4. Overdue */}
                <TouchableOpacity
                  activeOpacity={0.8}
                  style={{ aspectRatio: 1 }}
                  onPress={() => setSelectedStatusFilter(selectedStatusFilter === "Overdue" ? "All" : "Overdue")}
                  className={`w-[48%] bg-white p-4 rounded-3xl border justify-between items-center text-center shadow-xs ${selectedStatusFilter === "Overdue" ? "border-rose-500 bg-rose-50/50 ring-2 ring-rose-400/20" : "border-slate-200"
                    }`}
                >
                  <View className="w-10 h-10 rounded-2xl bg-rose-50 border border-rose-100 items-center justify-center">
                    <AlertCircle size={20} color="#e11d48" />
                  </View>
                  <View className="items-center">
                    <Text className="text-2xl font-bold text-rose-600 tracking-tight">{visitsStats.overdue}</Text>
                    <Text className="text-[10px] font-bold text-slate-500 mt-1 tracking-wider">Overdue Visits</Text>
                  </View>
                  <View className="bg-slate-50 px-2.5 py-0.5 rounded-full border border-slate-100">
                    <Text className="text-[9px] font-extrabold text-slate-400">Missed timeline</Text>
                  </View>
                </TouchableOpacity>
              </View>
            )}

            {activeModule === "material" && (
              <View className="flex-row flex-wrap justify-between gap-y-3">
                {/* 1. Completed */}
                <TouchableOpacity
                  activeOpacity={0.8}
                  style={{ aspectRatio: 1 }}
                  onPress={() => setSelectedStatusFilter(selectedStatusFilter === "Completed" ? "All" : "Completed")}
                  className={`w-[48%] bg-white p-4 rounded-3xl border justify-between items-center text-center shadow-xs ${selectedStatusFilter === "Completed" ? "border-teal-500 bg-teal-50/50 ring-2 ring-teal-400/20" : "border-slate-200"
                    }`}
                >
                  <View className="w-10 h-10 rounded-2xl bg-teal-50 border border-teal-100 items-center justify-center">
                    <CheckCircle2 size={20} color="#0d9488" />
                  </View>
                  <View className="items-center">
                    <Text className="text-2xl font-bold text-teal-700 tracking-tight">{materialStats.completed}</Text>
                    <Text className="text-[10px] font-bold text-slate-500 mt-1 tracking-wider">Completed</Text>
                  </View>
                  <View className="bg-slate-50 px-2.5 py-0.5 rounded-full border border-slate-100">
                    <Text className="text-[9px] font-extrabold text-slate-400">Received / Done</Text>
                  </View>
                </TouchableOpacity>

                {/* 2. Pending */}
                <TouchableOpacity
                  activeOpacity={0.8}
                  style={{ aspectRatio: 1 }}
                  onPress={() => setSelectedStatusFilter(selectedStatusFilter === "Pending" ? "All" : "Pending")}
                  className={`w-[48%] bg-white p-4 rounded-3xl border justify-between items-center text-center shadow-xs ${selectedStatusFilter === "Pending" ? "border-amber-500 bg-amber-50/50 ring-2 ring-amber-400/20" : "border-slate-200"
                    }`}
                >
                  <View className="w-10 h-10 rounded-2xl bg-amber-50 border border-amber-100 items-center justify-center">
                    <Hourglass size={20} color="#d97706" />
                  </View>
                  <View className="items-center">
                    <Text className="text-2xl font-bold text-amber-600 tracking-tight">{materialStats.pending}</Text>
                    <Text className="text-[10px] font-bold text-slate-500 mt-1 tracking-wider">Pending</Text>
                  </View>
                  <View className="bg-slate-50 px-2.5 py-0.5 rounded-full border border-slate-100">
                    <Text className="text-[9px] font-extrabold text-slate-400">Awaiting</Text>
                  </View>
                </TouchableOpacity>

                {/* 3. In Transit */}
                <TouchableOpacity
                  activeOpacity={0.8}
                  style={{ aspectRatio: 1 }}
                  onPress={() => setSelectedStatusFilter(selectedStatusFilter === "In Transit" ? "All" : "In Transit")}
                  className={`w-[48%] bg-white p-4 rounded-3xl border justify-between items-center text-center shadow-xs ${selectedStatusFilter === "In Transit" ? "border-blue-500 bg-blue-50/50 ring-2 ring-blue-400/20" : "border-slate-200"
                    }`}
                >
                  <View className="w-10 h-10 rounded-2xl bg-blue-50 border border-blue-100 items-center justify-center">
                    <Truck size={20} color="#2563eb" />
                  </View>
                  <View className="items-center">
                    <Text className="text-2xl font-bold text-blue-600 tracking-tight">{materialStats.inTransit}</Text>
                    <Text className="text-[10px] font-bold text-slate-500 mt-1 tracking-wider">In Transit</Text>
                  </View>
                  <View className="bg-slate-50 px-2.5 py-0.5 rounded-full border border-slate-100">
                    <Text className="text-[9px] font-extrabold text-slate-400">On the way</Text>
                  </View>
                </TouchableOpacity>

                {/* 4. Rejected */}
                <TouchableOpacity
                  activeOpacity={0.8}
                  style={{ aspectRatio: 1 }}
                  onPress={() => setSelectedStatusFilter(selectedStatusFilter === "Rejected" ? "All" : "Rejected")}
                  className={`w-[48%] bg-white p-4 rounded-3xl border justify-between items-center text-center shadow-xs ${selectedStatusFilter === "Rejected" ? "border-rose-500 bg-rose-50/50 ring-2 ring-rose-400/20" : "border-slate-200"
                    }`}
                >
                  <View className="w-10 h-10 rounded-2xl bg-rose-50 border border-rose-100 items-center justify-center">
                    <XCircle size={20} color="#e11d48" />
                  </View>
                  <View className="items-center">
                    <Text className="text-2xl font-bold text-rose-600 tracking-tight">{materialStats.rejected}</Text>
                    <Text className="text-[10px] font-bold text-slate-500 mt-1 tracking-wider">Rejected</Text>
                  </View>
                  <View className="bg-slate-50 px-2.5 py-0.5 rounded-full border border-slate-100">
                    <Text className="text-[9px] font-extrabold text-slate-400">Cancelled</Text>
                  </View>
                </TouchableOpacity>
              </View>
            )}

            {/* ── 2. SEARCH & STATUS CHIP FILTER BAR ── */}
            <View style={{ marginTop: 6, marginBottom: 16 }} className="bg-white rounded-3xl p-4 border border-slate-200 shadow-xs">
              <View className="flex-row items-center bg-slate-50 px-3.5 py-2.5 rounded-2xl border border-slate-200 mb-3.5">
                <Search size={16} color="#94a3b8" />
                <TextInput
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder={`Search ${currentModuleConfig.shortLabel.toLowerCase()} records...`}
                  placeholderTextColor="#94a3b8"
                  className="flex-1 ml-2.5 text-xs font-bold text-slate-800 p-0"
                />
                {searchQuery.length > 0 && (
                  <TouchableOpacity onPress={() => setSearchQuery("")} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <X size={16} color="#94a3b8" />
                  </TouchableOpacity>
                )}
              </View>

              {/* Status Chips */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                nestedScrollEnabled={true}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ flexDirection: "row", alignItems: "center", paddingVertical: 2 }}
                className="flex-row"
              >
                {statusFilterOptions.map((st) => {
                  const isSelected = selectedStatusFilter === st;
                  return (
                    <TouchableOpacity
                      key={st}
                      activeOpacity={0.8}
                      hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
                      onPress={() => setSelectedStatusFilter(st)}
                      className={`px-4 py-2 rounded-xl mr-2.5 border ${isSelected
                        ? "bg-slate-900 border-slate-900 shadow-xs"
                        : "bg-slate-50 border-slate-200"
                        }`}
                    >
                      <Text
                        className={`text-xs font-bold ${isSelected ? "text-white" : "text-slate-600"
                          }`}
                      >
                        {st}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            {/* ── 3. RECORDS LIST ── */}
            <View className="space-y-3">
              <View className="flex-row items-center justify-between px-1">
                <Text className="text-xs font-extrabold text-slate-400 tracking-wider">
                  Records (
                  {activeModule === "attendance"
                    ? attendanceFiltered.length
                    : activeModule === "leaves"
                      ? leavesFiltered.length
                      : activeModule === "expense"
                        ? expenseFiltered.length
                        : activeModule === "visits"
                          ? visitsFiltered.length
                          : materialFiltered.length}
                  )
                </Text>

                {(selectedStatusFilter !== "All" || searchQuery.length > 0) && (
                  <TouchableOpacity
                    onPress={() => {
                      setSelectedStatusFilter("All");
                      setSearchQuery("");
                    }}
                    className="px-2 py-0.5 bg-slate-100 rounded-md border border-slate-200"
                  >
                    <Text className="text-[10px] font-bold text-slate-600">Clear Filters</Text>
                  </TouchableOpacity>
                )}
              </View>

              {loading ? (
                <View className="py-12 items-center justify-center">
                  <ActivityIndicator size="small" color="#4f46e5" />
                  <Text className="text-xs font-bold text-slate-400 mt-2">Loading records...</Text>
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
                        const statusLower = safeText(item.status, "present").toLowerCase();
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
                                    {safeText(item.status, "Neutral")}
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
                                    {safeText(item.punchIn.location.address)}
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
                                    {safeText(item.punchOut.location.address)}
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
                        const statusLower = safeText(item.status, "pending").toLowerCase();
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
                                    {safeText(item.leaveType, "Leave")}
                                  </Text>
                                </View>
                                <Text className="text-[11px] font-bold text-slate-500">
                                  {safeText(item.duration, "Full Day")}
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
                                  {safeText(item.status, "Pending")}
                                </Text>
                              </View>
                            </View>

                            <View className="flex-row items-center justify-between">
                              <Text className="text-xs font-bold text-slate-800">
                                {formatDateDisplay(item.startDate)} → {formatDateDisplay(item.endDate || item.startDate)}
                              </Text>
                              <Text className="text-[11px] font-extrabold text-indigo-600">
                                {item.duration === "Half Day" ? "0.5 Day" : `${item.durationDays || item.daysCount || 1} Day(s)`}
                              </Text>
                            </View>

                            {item.reason ? (
                              <Text className="text-xs text-slate-600 font-medium bg-slate-50 p-2 rounded-xl">
                                "{safeText(item.reason)}"
                              </Text>
                            ) : null}
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
                        const s = safeText(claim.status, "DRAFT").toUpperCase();
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
                                  {safeText(claim.claimNumber, `EXP-${idx + 1}`)}
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
                                {safeText(claim.trip?.purpose || claim.trip?.customerName || claim.claimType, "General Claim")}
                              </Text>
                              {claim.trip?.destination && (
                                <Text className="text-[11px] font-bold text-slate-500">
                                  📍 {safeText(claim.trip.destination)}
                                </Text>
                              )}
                            </View>

                            {/* Shared Lodging or Separate Tagged Indicator */}
                            {claim.isLodgingCoveredByOther ? (
                              <View className="bg-indigo-50 border border-indigo-100 rounded-xl p-2 flex-row items-center gap-1.5">
                                <Text className="text-[11px] font-bold text-indigo-700">
                                  🛌 Shared Room covered by {safeText(claim.submittedByName || claim.submittedBy?.name, "Colleague")} · ₹0 claimed by you
                                </Text>
                              </View>
                            ) : (!claim.isApplicant && claim.submittedBy ? (
                              <View className="bg-slate-100 border border-slate-200 rounded-xl px-2.5 py-1 self-start">
                                <Text className="text-[10px] font-extrabold text-slate-700">
                                  👥 Your Separate Share (Filed by {safeText(claim.submittedByName || claim.submittedBy?.name, "Colleague")})
                                </Text>
                              </View>
                            ) : null)}

                            <View className="flex-row items-center justify-between bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                              <View>
                                <Text className="text-[10px] font-bold text-slate-400">YOUR REQUESTED</Text>
                                <Text className="text-xs font-bold text-slate-900">
                                  ₹ {(claim.userRequested !== undefined ? claim.userRequested : (claim.grandRequested || 0)).toLocaleString("en-IN")}
                                </Text>
                              </View>

                              <View>
                                <Text className="text-[10px] font-bold text-slate-400">YOUR ALLOWED</Text>
                                <Text className="text-xs font-bold text-blue-600">
                                  ₹ {(claim.userAllowed !== undefined ? claim.userAllowed : (claim.grandAllowed || 0)).toLocaleString("en-IN")}
                                </Text>
                              </View>

                              <View>
                                <Text className="text-[10px] font-bold text-slate-400">SETTLED</Text>
                                <Text className="text-xs font-bold text-purple-700">
                                  ₹ {((isSettled ? (claim.userAllowed !== undefined ? claim.userAllowed : (claim.paidAmount || claim.grandAllowed)) : 0) || 0).toLocaleString("en-IN")}
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
                        const s = safeText(visit.status, "").toLowerCase().replace(/\s+/g, "_");
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
                                  {formatDateDisplay(visit.scheduledDate)} · {safeText(visit.scheduledTime)}
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
                                  {safeText(visit.status, "Upcoming")}
                                </Text>
                              </View>
                            </View>

                            <Text className="text-xs font-extrabold text-slate-900">
                              {safeText(visit.customerName || visit.customerId?.customerName || visit.customerId, "Location Visit")}
                            </Text>

                            {visit.reason ? (
                              <Text className="text-xs text-slate-600 font-medium">
                                {safeText(visit.reason)}
                              </Text>
                            ) : null}

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
                                    {safeText(visit.duration)}
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
                        const s = safeText(txn.status, "COMPLETED").toUpperCase();
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
                                  {safeText(txn.transactionNumber || txn.challanNumber || txn.movementNumber, `TRX-${idx + 1}`)}
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
                                Type: {safeText(txn.documentType || txn.type, "Movement")}
                              </Text>
                              {txn.department && (
                                <Text className="text-[11px] font-bold text-slate-500">
                                  Dept: {safeText(txn.department)}
                                </Text>
                              )}
                            </View>

                            <View className="flex-row items-center justify-between bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                              <View>
                                <Text className="text-[10px] font-bold text-slate-400">SENDER</Text>
                                <Text className="text-xs font-bold text-slate-800">
                                  {safeText(txn.senderName || txn.requester?.name || txn.requester, "Store / Warehouse")}
                                </Text>
                              </View>

                              <View className="items-end">
                                <Text className="text-[10px] font-bold text-slate-400">RECEIVER</Text>
                                <Text className="text-xs font-bold text-slate-800">
                                  {safeText(txn.receiverName || txn.receiver?.name || txn.receiver, "Handler")}
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
              <Text className="text-[11px] font-bold text-slate-400 tracking-wider mb-1.5">
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
              <Text className="text-[11px] font-bold text-slate-400 tracking-wider mb-1.5">
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
