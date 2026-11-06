import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  AlertCircle,
  Briefcase,
  Building2,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Download,
  Eye,
  FileCheck,
  FileText,
  Image as ImageIcon,
  Lock,
  Pencil,
  Send,
  ShieldCheck,
  Trash2,
  Wrench,
  X,
  XCircle,
  Zap,
} from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import api from "../../../../api/axios";
import HRModuleFooter from "../../../../components/HRModuleFooter";
import { resolveProofImageUrl } from "../../../../utils/imageUrl";
import expenseApi from "../api/expenseApi";
import ExpenseHeader from "../components/ExpenseHeader";

const formatINR = (n) => {
  const v = Number(n || 0);
  if (!Number.isFinite(v)) return "₹0";
  return `₹${v.toLocaleString("en-IN", { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
};

const getTravelModeIcon = (modeName = "", subtypeName = "") => {
  const s = `${modeName || ""} ${subtypeName || ""}`.toLowerCase();
  if (/(metro)/.test(s)) return "🚇";
  if (/(train|rail|irctc|vande|shatabdi|rajdhani|express|ac\s*i|ac\s*ii|ac\s*iii|sleeper|chair\s*car|iind\s*class|1st\s*class|2nd\s*class|3rd\s*class)/.test(s)) return "🚆";
  if (/(flight|air|plane|economy|business\s*class|aviation)/.test(s)) return "✈️";
  if (/(bus|volvo|sleeper\s*coach|seater)/.test(s)) return "🚌";
  if (/(auto|rickshaw|tuk)/.test(s)) return "🛺";
  if (/(taxi|cab|uber|ola|rapido)/.test(s)) return "🚕";
  if (/(bike|two\s*wheeler|2-wheeler|2\s*wheeler|motorcycle|scooter|scooty|ebike|e-bike)/.test(s)) return "🏍️";
  if (/(car|four\s*wheeler|4-wheeler|4\s*wheeler|4w|suv|sedan|own\s*vehicle|vehicle|ecar|e-car)/.test(s)) return "🚗";
  if (/(ferry|ship|boat|water)/.test(s)) return "⛴️";
  return "🚆";
};

const getDisplayStatus = (status, claim) => {
  const s = String(status || "").toUpperCase();
  const payStatus = String(claim?.paymentStatus || "").toUpperCase();

  if (s === "PAID" || payStatus === "PAID" || s === "DISBURSED" || payStatus === "DISBURSED" || s === "SETTLED" || s === "FULLY_PAID") {
    return { label: "Paid", color: "#059669" };
  }
  if (s === "REJECTED" || payStatus === "REJECTED" || s === "HR_REJECTED" || s === "ACCOUNTS_REJECTED" || s === "CANCELLED") {
    return { label: "Rejected", color: "#dc2626" };
  }
  if (s === "DRAFT" || s === "RETURNED") {
    return { label: "Draft", color: "#64748b" };
  }
  if (s === "APPROVAL_PENDING") {
    // Full Payment / Stock Purchase: Reporting Manager approved, waiting for the CFO / Finance Head
    if (String(claim?.financeApproval?.status || "").toUpperCase() === "PENDING") {
      return { label: "Awaiting 2nd Approval", color: "#b45309" };
    }
    return { label: "Awaiting Approval", color: "#7c3aed" };
  }
  if (s === "ACCOUNTS_APPROVED" || payStatus === "AWAITING_DISBURSEMENT") {
    return { label: "Approved • Payment Pending", color: "#2563eb" };
  }
  if (s === "SUBMITTED") {
    return { label: "Pending", color: "#d97706" };
  }
  return { label: "Pending", color: "#d97706" };
};

const formatDateTime = (dateStr) => {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "";
    return (
      d.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }) +
      ", " +
      d.toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      })
    );
  } catch {
    return String(dateStr).slice(0, 16);
  }
};

const getClaimTypeInfo = (claim) => {
  if (!claim) return { code: "EXPENSE", name: "Expense Claim", label: "Expense" };
  const rawEntries = Array.isArray(claim.entries) ? claim.entries : [];
  const firstEcItems = Array.isArray(claim.employeeClaims?.[0]?.items) ? claim.employeeClaims[0].items : [];
  const cMode = String(claim.claimMode || "").toUpperCase().trim();
  const hasLodgingWithFood =
    cMode === "LODGING" &&
    Boolean(claim.includeFood || (Array.isArray(claim.foodEntries) && claim.foodEntries.length > 0));
  const rawClaimType = String(claim.claimType || claim.expenseType || "").toUpperCase().trim();

  if (
    rawEntries.length > 1 ||
    firstEcItems.length > 1 ||
    hasLodgingWithFood ||
    rawClaimType === "COMBINE" ||
    rawClaimType === "COMBINED"
  ) {
    return { code: "COMBINE", name: "Combine Claim", label: "Combine" };
  }

  const firstEntry = rawEntries[0] || firstEcItems[0] || {};
  const code = String(
    firstEntry.expenseType ||
    firstEntry.claimType ||
    rawClaimType ||
    (cMode === "LODGING" ? "LODGING" : (claim.trip?.travelMode ? "TRAVEL" : "OTHER"))
  ).toUpperCase().trim();

  const subType = String(firstEntry.otherSubType || firstEntry.subType || claim.otherSubType || "").toUpperCase().trim();
  const isPurchase =
    code === "STOCK_PURCHASE" ||
    ((code === "OTHER" || code === "OTHER_EXPENSE") && (subType === "PURCHASE" || subType === "STOCK_PURCHASE"));

  if (isPurchase) {
    return { code: "STOCK_PURCHASE", name: "Stock Purchase Claim", label: "Stock Purchase" };
  }

  switch (code) {
    case "LODGING":
    case "LODGING_EXPENSE":
      return {
        code: "LODGING",
        name: "Lodging Claim",
        label: "Lodging",
      };
    case "CONVEYANCE":
    case "LOCAL_CONVEYANCE":
    case "LOCAL_TRAVEL":
    case "LOCAL":
      return { code: "CONVEYANCE", name: "Local Conveyance Claim", label: "Local Conveyance" };
    case "FOOD":
    case "FOOD_DA":
    case "FOOD_EXPENSE":
      return { code: "FOOD", name: "Food Claim", label: "Food" };
    case "TRAVEL":
    case "TRAVEL_EXPENSE":
      return { code: "TRAVEL", name: "Travel Claim", label: "Travel" };
    case "STOCK_PURCHASE":
      return { code: "STOCK_PURCHASE", name: "Stock Purchase Claim", label: "Stock Purchase" };
    case "OTHER":
    case "OTHER_EXPENSE":
    default:
      return {
        code: code || "OTHER",
        name: code === "OTHER" || code === "OTHER_EXPENSE" ? "Other Expense Claim" : `${code || "Expense"} Claim`,
        label: code === "OTHER" || code === "OTHER_EXPENSE" ? "Other Expense" : (code || "Expense"),
      };
  }
};

const normStr = (v) => String(v || "").trim().toLowerCase();
const MANAGEMENT_ROLES = [
  "management", "company_admin", "companyadmin", "admin",
  "super_admin", "superadmin", "tcca1", "tcsa1", "tcmgt",
  "tcdr1a", "tcdr2a", "vp", "avp", "general_manager", "director", "ceo"
];

const isManagementFiler = (u) => {
  if (!u) return false;
  const role = normStr(u.role);
  const roleCode = String(u.roleCode || "").trim().toUpperCase();
  if (MANAGEMENT_ROLES.some((t) => role === t || normStr(roleCode) === t)) return true;
  const desig = normStr(u.designation);
  const dept = normStr(u.department);
  const cat = String(u.levelRef?.category || u.effectiveCategory || u.category || "").trim().toUpperCase();
  const deptAdminType = normStr(u.departmentAdminType || u.adminType);
  if (cat === "MANAGEMENT") return true;
  if (["management", "general_manager", "vp", "avp", "ceo", "director"].includes(role)) return true;
  if (/^(TC(MN)|MANAGEMENT|TCMGT|VP|AVP|GM|CEO|TCCA|TCSA|TCDR|TCDI)/i.test(roleCode)) return true;
  if (deptAdminType === "management") return true;
  if (/^(management|executive|director|directors|board of directors|bod)$/i.test(dept) || /management/i.test(dept)) return true;
  if (/(ceo|vp|vice president|general manager|president|chairman|director|^management$)/i.test(desig)) return true;
  const resp = Array.isArray(u.responsibilityCodes)
    ? u.responsibilityCodes
    : (u.responsibilityCodes ? [String(u.responsibilityCodes)] : []);
  if (resp.some((r) => String(r).toUpperCase().trim() === "MANAGEMENT_APPROVER")) return true;
  return false;
};

const ExpenseClaimDetailScreen = ({ navigation, route }) => {
  const { claimId } = route.params || {};
  const [claim, setClaim] = useState(null);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const isSubmittingRef = useRef(false);

  const [photoPreviewModal, setPhotoPreviewModal] = useState({
    visible: false,
    uri: "",
    title: "",
  });
  // Approver decision (Full Payment / Other expense): 'approve' | 'reject' | null
  const [decisionMode, setDecisionMode] = useState(null);
  const [decisionRemark, setDecisionRemark] = useState("");
  const [deciding, setDeciding] = useState(false);
  const [collapsedCategories, setCollapsedCategories] = useState({});
  const [activeDownloadBtn, setActiveDownloadBtn] = useState(null); // 'header' | 'bottom' | null
  const downloadingPdf = Boolean(activeDownloadBtn);

  const handleDownloadPdf = async (btnKey = "bottom") => {
    if (downloadingPdf || !claim?._id) return;
    setActiveDownloadBtn(btnKey);
    try {
      const filename = `Claim_${claim.claimNumber || claim.claimId || claim._id}.pdf`;

      if (Platform.OS === "web" && typeof window !== "undefined" && window.document) {
        const doc = window.document;
        const res = await api.get(`/expense/claims/${claim._id}/pdf`, { responseType: "blob" });
        const blob = new Blob([res.data], { type: "application/pdf" });
        const url = window.URL.createObjectURL(blob);
        const a = doc.createElement("a");
        a.href = url;
        a.download = filename;
        doc.body.appendChild(a);
        a.click();
        doc.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        Alert.alert("Success", "Claim PDF downloaded successfully.");
      } else {
        const token = await AsyncStorage.getItem("token");
        const baseUrl = api.defaults.baseURL || "";
        const pdfUrl = `${baseUrl}/expense/claims/${claim._id}/pdf${token ? `?token=${encodeURIComponent(token)}` : ""}`;
        await Linking.openURL(pdfUrl);
      }
    } catch (err) {
      console.warn("PDF Download error:", err);
      Alert.alert("Download Failed", err?.message || "Unable to download claim PDF.");
    } finally {
      setActiveDownloadBtn(null);
    }
  };

  const load = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    setError(null);
    try {
      let uid = await AsyncStorage.getItem("userId");
      const userStr = await AsyncStorage.getItem("user");
      let uObj = null;
      if (userStr) {
        try {
          uObj = JSON.parse(userStr);
          uid = uObj._id || uObj.id || uid;
        } catch {
          /* ignore parse error */
        }
      }
      setCurrentUserId(uid ? String(uid) : null);
      setCurrentUser(uObj);

      const data = await expenseApi.getClaimById(claimId);
      if (data && String(data.status || "").toUpperCase() === "DRAFT") {
        const creatorId = String(data.submittedBy?._id || data.submittedBy || data.createdBy?._id || data.createdBy || "");
        if (uid && creatorId !== String(uid)) {
          setClaim(null);
          setLoading(false);
          return;
        }
      }
      setClaim(data);
    } catch (err) {
      console.warn("Load detail error:", err);
      setError(err?.response?.data?.message || err?.message || "Unable to load claim details.");
      setClaim(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [claimId]);

  useEffect(() => {
    load(true);
  }, [load]);

  const handleSubmit = async () => {
    if (isSubmittingRef.current || submitting) return;
    isSubmittingRef.current = true;
    setSubmitting(true);
    try {
      const res = await expenseApi.submitClaim(claimId);
      if (res.success && res.data) {
        setClaim(res.data);
        const isRej = ["REJECTED", "HR_REJECTED", "ACCOUNTS_REJECTED"].includes(String(claim?.status || "").toUpperCase());
        Alert.alert("Success", isRej ? "Claim resubmitted for approval successfully." : "Claim submitted for approval successfully.");
      } else {
        Alert.alert("Submit Failed", res.message || "Unable to submit claim.");
      }
    } catch (err) {
      Alert.alert("Submit Failed", err?.message || "Unable to submit claim.");
    } finally {
      isSubmittingRef.current = false;
      setSubmitting(false);
    }
  };

  const closeDecision = () => {
    setDecisionMode(null);
    setDecisionRemark("");
  };

  const handleDecision = async () => {
    const text = decisionRemark.trim();
    if (!text) {
      Alert.alert(
        "Remark required",
        decisionMode === "reject"
          ? "Please enter the reason for rejecting this claim."
          : "Please enter a remark for approving this claim."
      );
      return;
    }
    if (decisionMode === "reject" && text.length < 3) {
      Alert.alert("Reason required", "Please enter the reason for rejecting this claim.");
      return;
    }
    setDeciding(true);
    const res = decisionMode === "approve"
      ? await expenseApi.approveClaim(claimId, text)
      : await expenseApi.rejectApproval(claimId, text);
    setDeciding(false);
    if (!res.success) {
      Alert.alert("Failed", res.message || "Please try again.");
      if (res.status === 409) {
        closeDecision();
        load(false);
      }
      return;
    }
    const approved = decisionMode === "approve";
    closeDecision();
    if (res.data) setClaim(res.data);
    const sentToFinanceHead = approved && res.data?.status === "APPROVAL_PENDING" && res.data?.financeApproval?.status === "PENDING";
    Alert.alert(
      approved ? "Approved" : "Rejected",
      approved
        ? (sentToFinanceHead
          ? `Claim approved and sent to ${res.data.financeApproval.approverName || "the CFO / Finance Head"} for 2nd approval.`
          : "Claim approved and sent to Accounts.")
        : "Claim rejected."
    );
    load(false);
  };

  const handleDelete = () => {
    Alert.alert(
      "Delete Expense Claim",
      `Are you sure you want to permanently delete this ${claim.claimId || claim.claimNumber || "draft"} claim?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              const res = await expenseApi.deleteClaim(claim._id);
              if (res.success) {
                Alert.alert("Deleted", "Claim has been deleted successfully.", [
                  { text: "OK", onPress: () => navigation.goBack() },
                ]);
              } else {
                Alert.alert("Delete Failed", res.message || "Could not delete claim.");
              }
            } catch (err) {
              Alert.alert("Delete Failed", err.message || "Unable to delete claim.");
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
        <ExpenseHeader title="Claim Details" navigation={navigation} />
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color="#4f46e5" />
        </View>
        <HRModuleFooter navigation={navigation} currentScreen="expenseClaim" />
      </SafeAreaView>
    );
  }

  if (error || !claim) {
    return (
      <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
        <ExpenseHeader title="Claim Details" navigation={navigation} />
        <View style={styles.restrictedContainer}>
          <View style={styles.restrictedIconBox}>
            <Lock size={32} color="#64748b" />
          </View>
          <Text style={styles.restrictedTitle}>Claim Unavailable</Text>
          <Text style={styles.restrictedSubtext}>
            {error || "This expense claim is private, still in draft, or you do not have permission to view it."}
          </Text>
          <TouchableOpacity style={styles.restrictedBackBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.restrictedBackBtnText}>Back to My Claims</Text>
          </TouchableOpacity>
        </View>
        <HRModuleFooter navigation={navigation} currentScreen="expenseClaim" />
      </SafeAreaView>
    );
  }

  const statusInfo = getDisplayStatus(claim.status, claim);
  const typeInfo = getClaimTypeInfo(claim);
  const isLodging = claim.claimMode === "LODGING" || typeInfo.code === "LODGING";
  const creatorId = String(claim.submittedBy?._id || claim.submittedBy || claim.createdBy?._id || claim.createdBy || "");
  const isOwner = currentUserId ? creatorId === String(currentUserId) : true;
  const statusUpper = String(claim.status || "").toUpperCase();
  const paymentUpper = String(claim.paymentStatus || "").toUpperCase();

  const isDisbursedOrPaid = ["PAID", "DISBURSED"].includes(paymentUpper) ||
    ["PAID", "DISBURSED", "SETTLED", "FULLY_PAID"].includes(statusUpper);

  const isAccountsApproved = statusUpper === "ACCOUNTS_APPROVED" || paymentUpper === "AWAITING_DISBURSEMENT" || String(claim.accountsApproval?.status || "").toUpperCase() === "APPROVED";

  const isApprovedOrPaid = isDisbursedOrPaid || isAccountsApproved;

  const isDraftOrRejected = [
    "DRAFT",
    "REJECTED",
    "ACCOUNTS_REJECTED",
    "HR_REJECTED",
    "RETURNED",
    "CANCELLED",
  ].includes(statusUpper);

  const maStatusUpper = String(claim.managerApproval?.status || "").toUpperCase();
  const maKindUpper = String(claim.managerApproval?.kind || "NONE").toUpperCase();
  const faStatusUpper = String(claim.financeApproval?.status || "").toUpperCase();
  const isFirstApprovalDone = !isDraftOrRejected && Boolean(
    isAccountsApproved ||
    faStatusUpper === "PENDING" ||
    faStatusUpper === "APPROVED" ||
    (maStatusUpper === "APPROVED" && (maKindUpper !== "NONE" || Boolean(claim.managerApproval?.decidedAt || claim.managerApproval?.approver))) ||
    claim.permissions?.isFirstApprovalApproved
  );

  // User can edit the claim only before the 1st applicable approval (Reporting Manager or Accounts) is approved, or when Draft/Rejected
  const isEditable = isOwner && !isApprovedOrPaid && !isFirstApprovalDone && (claim.permissions?.canEdit !== false);

  // But CANNOT delete submitted claims - delete is strictly for DRAFT or rejected/cancelled
  const isDeletable = isOwner && [
    "DRAFT",
    "REJECTED",
    "ACCOUNTS_REJECTED",
    "HR_REJECTED",
    "RETURNED",
    "CANCELLED",
  ].includes(statusUpper);

  // Financial figures
  const reqAmt = claim.requestedAmount !== undefined ? claim.requestedAmount : (claim.grandRequested || claim.amount || 0);
  const allowAmt = claim.allowedAmount !== undefined ? claim.allowedAmount : (claim.grandAllowed || reqAmt);
  const excAmt = claim.excessAmount !== undefined ? claim.excessAmount : (claim.grandExcess || 0);
  const payAmt = claim.payableAmount !== undefined ? claim.payableAmount : allowAmt;

  const dateLabel = isLodging && claim.fromDate && claim.toDate
    ? `${String(claim.fromDate).slice(0, 10)} → ${String(claim.toDate).slice(0, 10)}`
    : claim.claimDate ? String(claim.claimDate).slice(0, 10) : "";

  // Comprehensive receipts gathering across root, entries, and employee claims without dropping any
  const isConveyanceClaim = (() => {
    const cType = (claim.claimType || claim.expenseType || "").toUpperCase().trim();
    if (cType === "CONVEYANCE" || cType === "LOCAL_CONVEYANCE") return true;
    const entries = Array.isArray(claim.entries) ? claim.entries : [];
    if (entries.length > 0 && entries.every((e) => {
      const t = (e?.expenseType || "").toUpperCase().trim();
      return t === "CONVEYANCE" || t === "LOCAL_CONVEYANCE";
    })) return true;
    const ecList = Array.isArray(claim.employeeClaims) ? claim.employeeClaims : [];
    const items = ecList.flatMap((ec) => (Array.isArray(ec.items) ? ec.items : []));
    if (items.length > 0 && items.every((it) => {
      const t = (it?.expenseType || "").toUpperCase().trim();
      return t === "CONVEYANCE" || t === "LOCAL_CONVEYANCE";
    })) return true;
    return false;
  })();

  const conveyancePhotosList = (() => {
    const npList = [];
    const skList = [];
    const ekList = [];
    const seen = new Set();
    const add = (r, target) => {
      if (!r) return;
      const key = r.url || r.uri || r.localId || r._id || r.name;
      if (key && !seen.has(key)) {
        seen.add(key);
        target.push(r);
      }
    };

    if (Array.isArray(claim.numberPlatePhotos)) claim.numberPlatePhotos.forEach((r) => add(r, npList));
    if (Array.isArray(claim.startKmPhotos)) claim.startKmPhotos.forEach((r) => add(r, skList));
    if (Array.isArray(claim.endKmPhotos)) claim.endKmPhotos.forEach((r) => add(r, ekList));

    if (Array.isArray(claim.entries)) {
      claim.entries.forEach((e) => {
        if (Array.isArray(e?.numberPlatePhotos)) e.numberPlatePhotos.forEach((r) => add(r, npList));
        if (Array.isArray(e?.startKmPhotos)) e.startKmPhotos.forEach((r) => add(r, skList));
        if (Array.isArray(e?.endKmPhotos)) e.endKmPhotos.forEach((r) => add(r, ekList));
      });
    }
    if (Array.isArray(claim.employeeClaims)) {
      claim.employeeClaims.forEach((ec) => {
        (ec.items || []).forEach((it) => {
          if (Array.isArray(it?.numberPlatePhotos)) it.numberPlatePhotos.forEach((r) => add(r, npList));
          if (Array.isArray(it?.startKmPhotos)) it.startKmPhotos.forEach((r) => add(r, skList));
          if (Array.isArray(it?.endKmPhotos)) it.endKmPhotos.forEach((r) => add(r, ekList));
        });
      });
    }

    return {
      numberPlatePhotos: npList,
      startKmPhotos: skList,
      endKmPhotos: ekList,
      totalCount: npList.length + skList.length + ekList.length,
    };
  })();

  const receiptsList = (() => {
    if (isConveyanceClaim) return [];
    const list = [];
    const seen = new Set();
    const convSeen = new Set();
    const addConvKey = (r) => {
      if (!r) return;
      const key = r.url || r.uri || r.localId || r._id || r.name;
      if (key) convSeen.add(key);
    };
    conveyancePhotosList.numberPlatePhotos.forEach(addConvKey);
    conveyancePhotosList.startKmPhotos.forEach(addConvKey);
    conveyancePhotosList.endKmPhotos.forEach(addConvKey);

    const add = (r) => {
      if (!r) return;
      const key = r.url || r.uri || r.localId || r._id || r.name;
      if (key && !seen.has(key) && !convSeen.has(key)) {
        seen.add(key);
        list.push(r);
      }
    };
    if (Array.isArray(claim.receipts)) claim.receipts.forEach(add);
    if (Array.isArray(claim.entries)) {
      claim.entries.forEach((e) => {
        const isEntryConv = (e?.expenseType || "").toUpperCase().trim() === "CONVEYANCE" || (e?.expenseType || "").toUpperCase().trim() === "LOCAL_CONVEYANCE";
        if (!isEntryConv) {
          if (Array.isArray(e?.receipts)) e.receipts.forEach(add);
          if (Array.isArray(e?.attachments)) e.attachments.forEach(add);
        }
      });
    }
    if (Array.isArray(claim.employeeClaims)) {
      claim.employeeClaims.forEach((ec) => {
        (ec.items || []).forEach((it) => {
          const isItemConv = (it?.expenseType || "").toUpperCase().trim() === "CONVEYANCE" || (it?.expenseType || "").toUpperCase().trim() === "LOCAL_CONVEYANCE";
          if (!isItemConv) {
            if (Array.isArray(it?.attachments)) it.attachments.forEach(add);
            if (Array.isArray(it?.receipts)) it.receipts.forEach(add);
          }
        });
      });
    }
    if (Array.isArray(claim.attachments)) claim.attachments.forEach(add);
    return list;
  })();

  const serviceReportsList = (() => {
    const list = [];
    const seen = new Set();
    const add = (r) => {
      if (!r) return;
      const key = r.url || r.uri || r.name;
      if (key && !seen.has(key)) {
        seen.add(key);
        list.push(r);
      }
    };
    if (Array.isArray(claim.serviceReports)) claim.serviceReports.forEach(add);
    if (Array.isArray(claim.entries)) {
      claim.entries.forEach((e) => {
        if (Array.isArray(e.serviceReports)) e.serviceReports.forEach(add);
        if (e.conveyanceKm && Array.isArray(e.conveyanceKm.serviceReports)) e.conveyanceKm.serviceReports.forEach(add);
      });
    }
    if (Array.isArray(claim.employeeClaims)) {
      claim.employeeClaims.forEach((ec) => {
        if (Array.isArray(ec.items)) {
          ec.items.forEach((it) => {
            if (Array.isArray(it.serviceReports)) it.serviceReports.forEach(add);
            if (it.conveyanceKm && Array.isArray(it.conveyanceKm.serviceReports)) it.conveyanceKm.serviceReports.forEach(add);
          });
        }
      });
    }
    return list;
  })();

  const fullPaymentProofs = (() => {
    const list = (claim.fullPayment?.proofs && claim.fullPayment.proofs.length > 0)
      ? claim.fullPayment.proofs
      : (claim.fullPaymentProofs || []);
    return Array.isArray(list) ? list : [];
  })();

  const ecList = Array.isArray(claim.employeeClaims) ? claim.employeeClaims : [];
  const isClaimVisit = !isLodging && Boolean(
    claim.visitType === "VISIT" ||
    claim.isVisit === true ||
    (Array.isArray(claim.entries) && claim.entries.some((e) => e && (e.visitType === "VISIT" || e.isVisit === true))) ||
    ecList.some((ec) => Array.isArray(ec?.items) && ec.items.some((it) => it && (it.visitType === "VISIT" || it.isVisit === true))) ||
    (claim.visitType !== "NO_VISIT" && serviceReportsList.length > 0)
  );
  const numEmployees = claim.numberOfEmployees || claim.employeeCount || ecList.length || 1;

  // Build combined entries list across all employees
  const entriesList = (Array.isArray(claim.entries) && claim.entries.length > 0)
    ? claim.entries
    : (Array.isArray(ecList[0]?.items) && ecList[0].items.length > 0 ? ecList[0].items : null);

  const combinedEntries = entriesList
    ? entriesList.map((entry, idx) => {
      const firstItem = ecList[0]?.items?.[idx] || {};
      const expenseType = (entry.expenseType || firstItem.expenseType || claim.claimType || "OTHER").toUpperCase();
      const isOther = expenseType === "OTHER";
      const isStockPurchase = expenseType === "STOCK_PURCHASE";
      const isConveyance = expenseType === "CONVEYANCE";
      const isPurchase = isStockPurchase || (isOther && (entry.otherSubType || firstItem.otherSubType || "").toUpperCase() === "PURCHASE");

      const expenseTypeName = firstItem.expenseTypeName || (
        isConveyance ? "Local Conveyance" :
          expenseType === "FOOD" ? "Food" :
            expenseType === "TRAVEL" ? "Travel" :
              (expenseType === "LODGING" || expenseType === "LODGING") ? "Lodging" :
                isStockPurchase ? "Stock Purchase" :
                  isOther ? (isPurchase ? "Stock Purchase" : "Other Expense") : expenseType
      );
      const expenseDate = entry.expenseDate || firstItem.expenseDate || claim.claimDate || claim.date;
      const requestedAmount = Number(entry.requestedAmount) || ecList.reduce((s, ec) => s + (Number(ec.items?.[idx]?.requestedAmount) || 0), 0);
      const hasEcItems = ecList.some((ec) => Array.isArray(ec.items) && ec.items.length > idx);
      const ecAllowSum = hasEcItems ? ecList.reduce((s, ec) => s + (Number(ec.items?.[idx]?.allowedAmount) || 0), 0) : null;
      const ecExcSum = hasEcItems ? ecList.reduce((s, ec) => s + (Number(ec.items?.[idx]?.excessAmount) || 0), 0) : null;

      const allowedAmount = ecAllowSum !== null
        ? ecAllowSum
        : (entry.allowedAmount !== undefined && entry.allowedAmount !== null
          ? Number(entry.allowedAmount)
          : (firstItem.allowedAmount !== undefined && firstItem.allowedAmount !== null
            ? Number(firstItem.allowedAmount)
            : (entriesList.length === 1 ? (claim.grandAllowed ?? requestedAmount) : requestedAmount)));

      const excessAmount = ecExcSum !== null
        ? ecExcSum
        : (entry.excessAmount !== undefined && entry.excessAmount !== null
          ? Number(entry.excessAmount)
          : (firstItem.excessAmount !== undefined && firstItem.excessAmount !== null
            ? Number(firstItem.excessAmount)
            : (entriesList.length === 1 ? (claim.grandExcess ?? 0) : Math.max(0, requestedAmount - allowedAmount))));
      const itemPolLimitSum = ecList.reduce((s, ec) => {
        const it = ec.items?.[idx] || ec.items?.[0] || {};
        const directLimit = Number(
          it.policyLimit ||
          it.perDayLimit ||
          it.calculationBreakdown?.sourceValues?.dailyEntitlement ||
          it.calculationBreakdown?.sourceValues?.capPerEmployee ||
          it.calculationBreakdown?.stayBudget ||
          it.calculationBreakdown?.dailyCap ||
          ec.policyLimitTotal ||
          ec.policyLimit ||
          0
        );
        if (directLimit > 0) return s + directLimit;
        if (it.limitText) {
          const m = String(it.limitText).replace(/,/g, '').match(/\d+(?:\.\d+)?/);
          if (m) return s + parseFloat(m[0]);
        }
        return s;
      }, 0);

      const itemHasExcess = excessAmount > 0;
      const isItemFood = expenseType === "FOOD" || expenseType === "FOOD_EXPENSE";
      const isItemLodging = expenseType === "LODGING" || expenseType === "LODGING_EXPENSE";
      const rawEntryLimit = Number(entry.policyLimit) || itemPolLimitSum || Number(firstItem.policyLimit) || (isItemLodging ? Number(claim.lodgingSummary?.policyLimit) : (isItemFood ? Number(claim.foodSummary?.remainingEntitlement ?? claim.foodSummary?.totalEntitlement) : 0)) || (entriesList.length === 1 ? Number(claim.grandPolicyLimit || claim.policyLimit || 0) : 0);
      const policyLimit = (isItemFood || isItemLodging)
        ? (rawEntryLimit > 0 ? rawEntryLimit : allowedAmount)
        : rawEntryLimit;

      const limitDisplay = (isItemFood || isItemLodging)
        ? `₹${policyLimit || allowedAmount || 0}`
        : (isConveyance || expenseType === "TRAVEL" || expenseType === "OTHER")
          ? (entry.limitText || firstItem.limitText || "Actuals (Fully Allowed)")
          : (entry.limitText || firstItem.limitText || (policyLimit > 0 ? `₹${policyLimit}` : "Actuals (Fully Allowed)"));
      const attachments = entry.receipts || entry.attachments || firstItem.attachments || [];

      const itemFormula = entry.formula || firstItem.formula || firstItem.calculationBreakdown?.formula || (
        isConveyance
          ? ((entry.distanceKm || firstItem.distanceKm) ? `${entry.distanceKm || firstItem.distanceKm} km x ₹${firstItem.calculationBreakdown?.sourceValues?.rate || 10}/km` : "Actuals (Fully Allowed)")
          : expenseType === "TRAVEL"
            ? "Travel fare (Fully Allowed)"
            : isOther
              ? (isPurchase ? "Purchase (Fully Allowed)" : "Actual amount (Fully Allowed)")
              : expenseType === "FOOD"
                ? (firstItem.limitText ? `Daily limit: ${firstItem.limitText}` : "MIN(actual, daily entitlement)")
                : (expenseType === "LODGING" || expenseType === "LODGING")
                  ? (firstItem.limitText ? `Stay budget: ${firstItem.limitText}` : "Lodging policy entitlement")
                  : "Actuals (Fully Allowed)"
      );

      const isTravelKm = expenseType === "TRAVEL" && (entry.travelWorkflow || firstItem.travelWorkflow) === "KM_RATE";

      return {
        expenseType,
        expenseTypeName,
        expenseDate,
        requestedAmount,
        allowedAmount,
        excessAmount,
        policyLimit,
        hasExcess: itemHasExcess,
        limitDisplay,
        formula: itemFormula,
        description: entry.remark || entry.description || firstItem.description,
        distanceKm: (isConveyance || expenseType === "TRAVEL") ? (entry.distanceKm ?? firstItem.distanceKm) : undefined,
        vehicle: isConveyance ? (entry.vehicle || firstItem.vehicle) : undefined,
        travelModeCode: entry.travelModeCode || firstItem.travelModeCode,
        travelModeName: entry.travelModeName || firstItem.travelModeName,
        travelSubtypeCode: entry.travelSubtypeCode || firstItem.travelSubtypeCode,
        travelSubtypeName: entry.travelSubtypeName || firstItem.travelSubtypeName,
        travelWorkflow: entry.travelWorkflow || firstItem.travelWorkflow,
        startKm: entry.startKm ?? firstItem.startKm,
        endKm: entry.endKm ?? firstItem.endKm,
        ratePerKm: entry.ratePerKm ?? firstItem.ratePerKm,
        entitlementStatus: entry.entitlementStatus || firstItem.entitlementStatus,
        excessReason: entry.excessReason || firstItem.excessReason,
        visitType: isConveyance ? ((entry.visitType === "VISIT" || firstItem.visitType === "VISIT" || entry.isVisit || firstItem.isVisit || isClaimVisit) ? "VISIT" : "NO_VISIT") : undefined,
        isVisit: isConveyance ? Boolean(entry.isVisit || firstItem.isVisit || entry.visitType === "VISIT" || firstItem.visitType === "VISIT" || isClaimVisit) : false,
        serviceReports: isConveyance ? (entry.serviceReports || firstItem.serviceReports || (firstItem.conveyanceKm?.serviceReports) || []) : [],
        otherSubType: isOther ? (entry.otherSubType || firstItem.otherSubType) : undefined,
        materialName: isPurchase ? (entry.materialName || firstItem.materialName) : undefined,
        barcodeNumber: isPurchase ? (entry.barcodeNumber || firstItem.barcodeNumber) : undefined,
        quantity: isPurchase ? (entry.quantity || firstItem.quantity) : undefined,
        hotelName: entry.hotelName || firstItem.hotelName,
        accommodationType: entry.accommodationType || firstItem.accommodationType,
        sharedWith: entry.sharedWith || firstItem.sharedWith,
        numberPlatePhotos: entry.numberPlatePhotos || firstItem.numberPlatePhotos || [],
        startKmPhotos: entry.startKmPhotos || firstItem.startKmPhotos || [],
        endKmPhotos: entry.endKmPhotos || firstItem.endKmPhotos || [],
        attachments: (isConveyance || isTravelKm) ? [] : attachments,
      };
    })
    : (() => {
      const singleExpType = (ecList[0]?.items?.[0]?.expenseType || claim.claimType || (isLodging ? "LODGING" : "OTHER")).toUpperCase();
      const singleIsOther = singleExpType === "OTHER";
      const singleIsStockPurchase = singleExpType === "STOCK_PURCHASE";
      const singleIsPurchase = singleIsStockPurchase || (singleIsOther && (claim.entries?.[0]?.otherSubType || ecList[0]?.items?.[0]?.otherSubType || claim.otherSubType || "").toUpperCase() === "PURCHASE");
      const singleIsConv = singleExpType === "CONVEYANCE" || singleExpType === "LOCAL_CONVEYANCE";
      const singlePolicyLimit = Number(claim.grandPolicyLimit || claim.policyLimit || ecList[0]?.items?.[0]?.policyLimit || allowAmt);
      return [{
        expenseType: singleExpType,
        expenseTypeName: typeInfo.name,
        expenseDate: ecList[0]?.items?.[0]?.expenseDate || claim.claimDate || claim.fromDate,
        requestedAmount: reqAmt,
        allowedAmount: allowAmt,
        excessAmount: excAmt,
        policyLimit: singlePolicyLimit,
        hasExcess: excAmt > 0,
        limitDisplay: (singleExpType === "FOOD" || singleExpType === "FOOD_EXPENSE" || singleExpType === "LODGING" || singleExpType === "LODGING_EXPENSE")
          ? `₹${singlePolicyLimit || allowAmt}`
          : (claim.claimType === "CONVEYANCE" || claim.claimType === "LOCAL_CONVEYANCE" || claim.claimType === "TRAVEL" || claim.claimType === "OTHER")
            ? "Actuals (Fully Allowed)"
            : (claim.grandPolicyLimit ? `₹${claim.grandPolicyLimit}` : "Actuals (Fully Allowed)"),
        formula: claim.formula || ecList[0]?.items?.[0]?.formula,
        description: claim.remark || claim.remarks,
        distanceKm: singleIsConv ? (claim.entries?.[0]?.distanceKm || ecList[0]?.items?.[0]?.distanceKm) : undefined,
        vehicle: singleIsConv ? (claim.entries?.[0]?.vehicle || ecList[0]?.items?.[0]?.vehicle) : undefined,
        visitType: singleIsConv ? (isClaimVisit ? "VISIT" : "NO_VISIT") : undefined,
        isVisit: singleIsConv ? isClaimVisit : false,
        serviceReports: singleIsConv ? (claim.entries?.[0]?.serviceReports || ecList[0]?.items?.[0]?.serviceReports || claim.serviceReports || []) : [],
        otherSubType: singleIsOther ? (claim.entries?.[0]?.otherSubType || ecList[0]?.items?.[0]?.otherSubType || claim.otherSubType) : undefined,
        materialName: singleIsPurchase ? (claim.entries?.[0]?.materialName || ecList[0]?.items?.[0]?.materialName || claim.materialName) : undefined,
        barcodeNumber: singleIsPurchase ? (claim.entries?.[0]?.barcodeNumber || ecList[0]?.items?.[0]?.barcodeNumber) : undefined,
        quantity: singleIsPurchase ? (claim.entries?.[0]?.quantity || ecList[0]?.items?.[0]?.quantity) : undefined,
        hotelName: claim.entries?.[0]?.hotelName || ecList[0]?.items?.[0]?.hotelName,
        accommodationType: claim.entries?.[0]?.accommodationType || ecList[0]?.items?.[0]?.accommodationType,
        sharedWith: claim.entries?.[0]?.sharedWith || ecList[0]?.items?.[0]?.sharedWith,
        numberPlatePhotos: claim.entries?.[0]?.numberPlatePhotos || ecList[0]?.items?.[0]?.numberPlatePhotos || claim.numberPlatePhotos || [],
        startKmPhotos: claim.entries?.[0]?.startKmPhotos || ecList[0]?.items?.[0]?.startKmPhotos || claim.startKmPhotos || [],
        endKmPhotos: claim.entries?.[0]?.endKmPhotos || ecList[0]?.items?.[0]?.endKmPhotos || claim.endKmPhotos || [],
        attachments: singleIsConv ? [] : receiptsList,
      }];
    })();

  // If this is a Lodging claim with included Food (stored in foodEntries / foodSummary / foodRequestedAmount),
  // ensure the Food entry is included in combinedEntries as Entry 02 when not already present.
  if (
    isLodging &&
    !combinedEntries.some((e) => e.expenseType === "FOOD" || e.expenseType === "FOOD_EXPENSE")
  ) {
    const rawFoodEntries = Array.isArray(claim.foodEntries) ? claim.foodEntries : [];
    const fSum = claim.foodSummary || {};
    const fReq = Number(
      claim.foodRequestedAmount ??
      fSum.requested ??
      fSum.claimedAmount ??
      rawFoodEntries.reduce((s, f) => s + (Number(f.requestedAmount) || 0), 0)
    );
    const fAllow = Number(
      claim.foodAllowedAmount ??
      fSum.allowed ??
      fSum.allowedAmount ??
      (rawFoodEntries.length > 0
        ? rawFoodEntries.reduce((s, f) => s + (Number(f.allowedAmount ?? f.requestedAmount) || 0), 0)
        : fReq)
    );
    const fExc = Number(
      claim.foodExcessAmount ??
      fSum.excess ??
      fSum.excessAmount ??
      Math.max(0, fReq - fAllow)
    );
    const fLim = Number(
      claim.foodPolicyLimit ??
      fSum.remainingBefore ??
      fSum.totalRemainingLimit ??
      fSum.entitlement ??
      fSum.totalPeriodLimit ??
      fAllow
    );
    if (claim.includeFood || rawFoodEntries.length > 0 || fReq > 0 || fAllow > 0) {
      const fReceipts = (Array.isArray(claim.foodReceipts) && claim.foodReceipts.length > 0)
        ? claim.foodReceipts
        : rawFoodEntries.flatMap((f) => f.receipts || f.attachments || []);
      combinedEntries.push({
        expenseType: "FOOD",
        expenseTypeName: "Shared Food Allowance",
        expenseDate: claim.foodFromDate || claim.fromDate,
        requestedAmount: fReq,
        allowedAmount: fAllow,
        excessAmount: fExc,
        policyLimit: fLim,
        hasExcess: fExc > 0,
        limitDisplay: `₹${fLim || fAllow || 0}`,
        formula: fSum.plainExplanation || claim.foodPlainExplanation || "100% of Combined Daily Food Limits",
        description: claim.foodRemark || rawFoodEntries[0]?.remark || rawFoodEntries[0]?.description || claim.remark,
        attachments: fReceipts,
      });
    }
  }

  const grandReq = reqAmt;
  const grandAllow = allowAmt;
  const grandExc = excAmt;
  const hasExcess = grandExc > 0;

  const isFood = typeInfo.code === "FOOD" || (claim.claimType || "").toUpperCase() === "FOOD" || combinedEntries.some(e => e.expenseType === "FOOD");
  const isLodgingOrFood = isLodging || isFood;

  const days = Number(
    claim.numberOfNights ||
    claim.days ||
    claim.numberOfDays ||
    claim.trip?.days ||
    (claim.fromDate && claim.toDate ? Math.max(1, Math.round((new Date(claim.toDate) - new Date(claim.fromDate)) / (1000 * 60 * 60 * 24))) : 1)
  ) || 1;

  // Extract actual policy limit across employees/items
  const mobEcGrandLimitSum = ecList.reduce((sum, ec) => {
    const it = ec.items?.find((item) => {
      const t = String(item?.expenseType || "").toUpperCase();
      return isLodging ? (t === "LODGING" || t === "LODGING_EXPENSE") : (t === "FOOD" || t === "FOOD_EXPENSE");
    }) || ec.items?.[0] || {};
    const directLimit = Number(
      it.policyLimit ||
      it.perDayLimit ||
      it.calculationBreakdown?.sourceValues?.entitlementPerDay ||
      it.calculationBreakdown?.sourceValues?.dailyEntitlement ||
      it.calculationBreakdown?.sourceValues?.baseEntitlement ||
      it.calculationBreakdown?.sourceValues?.capPerEmployee ||
      it.calculationBreakdown?.stayBudget ||
      it.calculationBreakdown?.dailyCap ||
      ec.policyLimitTotal ||
      ec.policyLimit ||
      0
    );
    if (directLimit > 0) return sum + directLimit;
    if (it.limitText) {
      const m = String(it.limitText).replace(/,/g, '').match(/\d+(?:\.\d+)?/);
      if (m) return sum + parseFloat(m[0]);
    }
    return sum;
  }, 0);

  const resolvedGrandLimit = (claim.grandPolicyLimit !== undefined && claim.grandPolicyLimit !== null && Number(claim.grandPolicyLimit) > 0)
    ? Number(claim.grandPolicyLimit)
    : (claim.policyLimit !== undefined && claim.policyLimit !== null && Number(claim.policyLimit) > 0)
      ? Number(claim.policyLimit)
      : (mobEcGrandLimitSum > 0 ? mobEcGrandLimitSum : 0);

  const grandLimit = resolvedGrandLimit > 0 ? resolvedGrandLimit : (isLodgingOrFood ? 0 : grandAllow);

  const hasLocalConveyance = (() => {
    const mainType = (claim.claimType || claim.expenseType || typeInfo.code || "").toUpperCase().trim();
    if (mainType === "CONVEYANCE" || mainType === "LOCAL_CONVEYANCE") return true;
    if (Array.isArray(claim.entries) && claim.entries.some(e => {
      const t = (e?.expenseType || "").toUpperCase().trim();
      return t === "CONVEYANCE" || t === "LOCAL_CONVEYANCE";
    })) return true;
    if (Array.isArray(claim.employeeClaims) && claim.employeeClaims.some(ec => {
      return Array.isArray(ec.items) && ec.items.some(it => {
        const t = (it?.expenseType || "").toUpperCase().trim();
        return t === "CONVEYANCE" || t === "LOCAL_CONVEYANCE";
      });
    })) return true;
    if (Array.isArray(combinedEntries) && combinedEntries.some(e => {
      const t = (e?.expenseType || "").toUpperCase().trim();
      return t === "CONVEYANCE" || t === "LOCAL_CONVEYANCE";
    })) return true;
    return false;
  })();

  const parseExplanationEmpLines = (text) => {
    if (!text || typeof text !== "string") return null;
    const blockMatch = text.match(/Individual limits per day:?\s*\n((?:\s*[•\-\*]\s*.+\n?)+)/i);
    if (blockMatch && blockMatch[1]) {
      const lines = blockMatch[1]
        .split("\n")
        .map((l) => l.replace(/^\s*[•\-\*]\s*/, "").trim())
        .filter(Boolean);
      if (lines.length > 0) return lines;
    }
    const inlineMatch = text.match(/Individual limits per day:?\s*([^\n\(\)]+?)(?:\s*\((?:Combined|Date|Entry|Whole)|\n\n|\n[A-Z]|$)/i);
    if (inlineMatch && inlineMatch[1]) {
      const raw = inlineMatch[1].trim();
      if (raw && !raw.startsWith("₹") && raw.includes(":")) {
        const parts = raw.split(/\s*,\s*(?=[^,]+:)/).map((p) => p.trim()).filter(Boolean);
        if (parts.length > 0) return parts;
      }
    }
    return null;
  };

  const allPossibleExpl = [
    claim.plainExplanation,
    claim.calculationBreakdown?.plainExplanation,
    claim.calculationBreakdown?.explanation,
    claim.standardExplanation,
    claim.explanation,
    ...(ecList.map((ec) => ec.items?.[0]?.calculationBreakdown?.plainExplanation)),
    ...(ecList.map((ec) => ec.items?.[0]?.plainExplanation)),
    ...(Array.isArray(claim.entries) ? claim.entries.map((e) => e.plainExplanation || e.calculationBreakdown?.plainExplanation) : []),
  ].filter(Boolean);

  let extractedEmpLines = null;
  for (const t of allPossibleExpl) {
    const parsed = parseExplanationEmpLines(t);
    if (parsed && parsed.length > 0) {
      extractedEmpLines = parsed;
      break;
    }
  }

  let empLines = extractedEmpLines;
  if (!empLines || empLines.length === 0) {
    if (ecList.length > 0) {
      empLines = ecList.map((ec, idx) => {
        const name = ec.employee?.name || (numEmployees > 1 ? `Employee #${idx + 1}` : (claim.submittedByName || "Employee"));
        const targetItem = ec.items?.find((item) => {
          const t = String(item?.expenseType || "").toUpperCase();
          return isLodging ? (t === "LODGING" || t === "LODGING_EXPENSE") : (t === "FOOD" || t === "FOOD_EXPENSE");
        }) || ec.items?.[0] || {};
        const breakdown = targetItem.calculationBreakdown || {};
        const src = breakdown.sourceValues || {};

        let perDay = Number(
          targetItem.perDayLimit ||
          src.entitlementPerDay ||
          src.dailyEntitlement ||
          src.baseEntitlement ||
          src.capPerEmployee ||
          breakdown.dailyCap ||
          0
        );

        if (!perDay && (src.totalEntitlement || src.totalBaseEntitlement)) {
          const tot = Number(src.totalEntitlement || src.totalBaseEntitlement || 0);
          if (tot > 0) perDay = Math.round(tot / (days || 1));
        }

        // Shared lodging higher/lower entitlements
        if (!perDay && (src.higherEntitlement || src.lowerEntitlement)) {
          if (ecList.length === 2) {
            const isFirstHigher = Number(ecList[0]?.employee?.levelNumber || 99) <= Number(ecList[1]?.employee?.levelNumber || 99);
            const myEnt = (idx === 0 ? isFirstHigher : !isFirstHigher)
              ? (src.higherEntitlement || src.lowerEntitlement)
              : (src.lowerEntitlement || src.higherEntitlement);
            perDay = Number(myEnt || 0);
          } else {
            perDay = Number(src.higherEntitlement || src.lowerEntitlement || 0);
          }
        }

        // Check breakdown steps for ₹X/day
        if (!perDay && Array.isArray(breakdown.steps)) {
          for (const s of breakdown.steps) {
            const m = String(s).match(/₹\s*([0-9,]+(?:\.[0-9]+)?)\s*\/\s*day/i);
            if (m) {
              perDay = parseFloat(m[1].replace(/,/g, ""));
              break;
            }
          }
        }

        if (!perDay) {
          const itemLimit = Number(targetItem.policyLimit || ec.policyLimitTotal || ec.policyLimit || 0);
          if (isLodging && days > 0 && itemLimit > 0) {
            perDay = Math.round(itemLimit / days);
          } else if (itemLimit > 0) {
            perDay = itemLimit;
          }
        }

        if (!perDay && targetItem.limitText) {
          const m = String(targetItem.limitText).replace(/,/g, "").match(/\d+(?:\.\d+)?/);
          if (m) perDay = parseFloat(m[0]);
        }

        if (!perDay && grandLimit > 0) {
          perDay = Math.round(grandLimit / (ecList.length || 1) / (isLodging ? (days || 1) : 1));
        }

        if (isLodging) {
          const totalEmpLimit = perDay * days;
          return days > 1
            ? `${name}: ₹${perDay.toLocaleString("en-IN")}/day (Total: ₹${totalEmpLimit.toLocaleString("en-IN")} for ${days} days)`
            : `${name}: ₹${perDay.toLocaleString("en-IN")}/day`;
        } else {
          return perDay > 0
            ? `${name}: ₹${perDay.toLocaleString("en-IN")}/day`
            : (isFood && grandLimit > 0
              ? `${name}: ₹${Math.round(grandLimit / (ecList.length || 1)).toLocaleString("en-IN")}/day`
              : `${name}: Actuals`);
        }
      });
    } else {
      const name = claim.submittedByName || "Employee";
      const perDay = (isLodging && days > 0 && grandLimit > 0)
        ? Math.round(grandLimit / days)
        : (grandLimit > 0 ? grandLimit : 0);
      empLines = [
        isLodging
          ? (days > 1 ? `${name}: ₹${perDay.toLocaleString("en-IN")}/day (Total: ₹${(grandLimit || (perDay * days)).toLocaleString("en-IN")} for ${days} days)` : `${name}: ₹${perDay.toLocaleString("en-IN")}/day`)
          : (perDay > 0 ? `${name}: ₹${perDay.toLocaleString("en-IN")}/day` : (isFood ? `${name}: ₹${(grandLimit || grandAllow).toLocaleString("en-IN")}/day` : `${name}: Actuals`))
      ];
    }
  }

  let calcOutcomeText;
  if (hasExcess) {
    calcOutcomeText = `Claimed bill: ₹${grandReq}. Therefore, ₹${grandAllow} is allowed and ₹${grandExc} is excess beyond policy limit.`;
  } else {
    const limitLabel = isLodging
      ? (numEmployees > 1 ? "combined stay policy limit" : "stay policy limit")
      : (numEmployees > 1 ? "combined daily limit" : "daily policy limit");
    const limitValForText = grandLimit > 0 ? grandLimit : (isLodgingOrFood ? grandAllow : 0);
    calcOutcomeText = limitValForText > 0
      ? `Claimed bill: ₹${grandReq}. Since the bill is within the ${limitLabel} of ₹${limitValForText}, ₹${grandAllow} is fully allowed.`
      : `Claimed bill: ₹${grandReq}. Since the bill is within the ${limitLabel}, ₹${grandAllow} is fully allowed.`;
  }

  const appliedRules = combinedEntries
    .map((it, idx) => {
      const formula = it.formula || claim.formula || ecList[0]?.items?.[idx]?.formula || ecList[0]?.items?.[idx]?.calculationBreakdown?.formula;
      const title = combinedEntries.length > 1 ? `Entry #${idx + 1} (${it.expenseTypeName})` : it.expenseTypeName;
      return { title, formula };
    })
    .filter(r => Boolean(r.formula));

  const isFullPayment = Boolean(claim.fullPayment?.requested || claim.fullPaymentRequested);
  const hasStockPurchase =
    combinedEntries.some((e) => e.expenseType === "STOCK_PURCHASE" || (e.expenseType === "OTHER" && String(e.otherSubType || "").toUpperCase() === "PURCHASE")) ||
    (claim.claimType || "").toUpperCase() === "STOCK_PURCHASE";
  const hasOtherExpense =
    combinedEntries.some((e) => e.expenseType === "OTHER" || e.expenseType === "STOCK_PURCHASE") ||
    ["OTHER", "STOCK_PURCHASE"].includes((claim.claimType || "").toUpperCase());
  const managerApproval = claim.managerApproval || {};

  const filerUser = (typeof claim.submittedBy === "object" && claim.submittedBy !== null) ? claim.submittedBy : {};
  const filerFromClaim = {
    role: filerUser.role || claim.applicantRole,
    roleCode: filerUser.roleCode || claim.applicantRoleCode,
    designation: filerUser.designation || claim.applicantDesig,
    department: filerUser.department || claim.applicantDept,
    category: filerUser.category,
  };
  const isClaimantManagement =
    isManagementFiler(filerUser) ||
    isManagementFiler(filerFromClaim) ||
    (isOwner && isManagementFiler(currentUser)) ||
    Boolean(claim.fullPayment?.decisionRemarks?.includes("not applicable for management")) ||
    Boolean(claim.managerApproval?.remarks?.includes("not applicable for management"));

  const normalizeTypeCode = (v) => {
    const c = String(v || "").trim().toUpperCase();
    if (!c) return "";
    if (c === "PETROL" || c === "LOCAL_CONVEYANCE" || c === "LOCAL_TRAVEL") return "CONVEYANCE";
    if (c === "STAY" || c === "HOTEL" || c === "ACCOMMODATION") return "LODGING";
    if (c === "MEAL" || c === "DA" || c === "DAILY_ALLOWANCE") return "FOOD";
    if (c === "STOCK" || c === "PURCHASE") return "STOCK_PURCHASE";
    if (c === "MISC" || c === "MISCELLANEOUS" || c === "OTHER_EXPENSE") return "OTHER";
    return c;
  };
  const claimTypeCodes = Array.from(
    new Set(
      [
        normalizeTypeCode(claim.claimType),
        normalizeTypeCode(claim.expenseType),
        ...combinedEntries.map((e) =>
          String(e?.otherSubType || "").toUpperCase() === "PURCHASE"
            ? "STOCK_PURCHASE"
            : normalizeTypeCode(e?.expenseType)
        ),
      ].filter(Boolean)
    )
  );
  const snapCfoCfg = claim.policySnapshot?.cfoApprovalConfig;
  const cfoCfgEnabled = snapCfoCfg ? snapCfoCfg.enabled !== false : true;
  const cfoCfgFullPayment = snapCfoCfg ? snapCfoCfg.applyOnFullPayment !== false : true;
  const cfoCfgTypes = Array.isArray(snapCfoCfg?.applicableClaimTypes)
    ? snapCfoCfg.applicableClaimTypes.map(normalizeTypeCode).filter(Boolean)
    : ["STOCK_PURCHASE"];
  const isCfoApplicableByRule = Boolean(
    cfoCfgEnabled &&
      ((isFullPayment && cfoCfgFullPayment) ||
        claimTypeCodes.some((code) => cfoCfgTypes.includes(code)))
  );

  // Priority: 1. Full Payment > 2. Configured Claim Type > 3. Other Claim
  const rawApprovalStatus = String(managerApproval.status || "").toUpperCase();
  const financeApproval = claim.financeApproval || {};
  const financeStatusUpper = String(financeApproval.status || "").toUpperCase();

  // 2nd approval (CFO / Finance Head) for configured claims
  const requiresSecondApproval = Boolean(
    (!isClaimantManagement && isCfoApplicableByRule) ||
    (financeStatusUpper && financeStatusUpper !== "NOT_REQUIRED") ||
    financeApproval.approver ||
    financeApproval.approverName
  );

  const isMgrExplicitlyNotRequired =
    rawApprovalStatus === "NOT_REQUIRED" &&
    (!managerApproval.kind || managerApproval.kind === "NONE") &&
    !managerApproval.decidedAt &&
    !managerApproval.remarks &&
    !isFullPayment &&
    !requiresSecondApproval;

  const approvalKind = isFullPayment
    ? "FULL_PAYMENT"
    : (managerApproval.kind && managerApproval.kind !== "NONE"
      ? managerApproval.kind
      : ((!isMgrExplicitlyNotRequired && (isCfoApplicableByRule || (hasOtherExpense && rawApprovalStatus !== "NOT_REQUIRED") || managerApproval.approver)) ? "OTHER_EXPENSE" : "NONE"));
  const isManagementApproval = isFullPayment || approvalKind === "FULL_PAYMENT" || managerApproval.approverRole === "MANAGEMENT";
  const showApprovalCard = Boolean(
    !isMgrExplicitlyNotRequired && (
      (approvalKind && approvalKind !== "NONE") ||
      (rawApprovalStatus && rawApprovalStatus !== "NOT_REQUIRED") ||
      managerApproval.approver ||
      managerApproval.approverName ||
      managerApproval.decidedAt ||
      managerApproval.remarks ||
      (isFullPayment && (statusUpper === "APPROVAL_PENDING" || claim.fullPayment?.status)) ||
      (isClaimantManagement && (isFullPayment || hasOtherExpense || managerApproval.status))
    )
  );

  const approverObj = (typeof managerApproval.approver === "object" && managerApproval.approver !== null) ? managerApproval.approver : null;
  const approverName = approverObj?.name || managerApproval.approverName || (typeof managerApproval.approver === "string" ? managerApproval.approver : "") || "Assigned Approver";
  const approverCode = approverObj?.employeeIdCode ? ` (${approverObj.employeeIdCode})` : "";
  const approverSub = [approverObj?.designation, approverObj?.department].filter(Boolean).join(" • ");

  const effectiveApprovalStatus = (rawApprovalStatus && rawApprovalStatus !== "NOT_REQUIRED")
    ? rawApprovalStatus
    : (statusUpper === "APPROVAL_PENDING"
      ? (financeStatusUpper === "PENDING" ? "APPROVED" : "PENDING")
      : (["SUBMITTED", "ACCOUNTS_APPROVED", "APPROVED", "PAID", "DISBURSED", "SETTLED"].includes(statusUpper)
        ? "APPROVED"
        : (statusUpper === "REJECTED" ? "REJECTED" : "PENDING")));

  const approvalStatusMeta = {
    PENDING: { label: "Pending • Awaiting 1st Approval", shortLabel: "Pending", color: "#d97706", bg: "#fef3c7", border: "#fde68a" },
    APPROVED: { label: "Approved", shortLabel: "Approved", color: "#059669", bg: "#d1fae5", border: "#a7f3d0" },
    REJECTED: { label: "Rejected", shortLabel: "Rejected", color: "#dc2626", bg: "#fee2e2", border: "#fecaca" },
  }[effectiveApprovalStatus] || { label: "Pending", shortLabel: "Pending", color: "#d97706", bg: "#fef3c7", border: "#fde68a" };
  const canApprove = Boolean(claim.permissions?.canApprove);

  const showFinanceCard = Boolean(requiresSecondApproval && statusUpper !== "DRAFT");
  const isFinanceStage = statusUpper === "APPROVAL_PENDING" && financeStatusUpper === "PENDING";
  const financeApproverObj = (typeof financeApproval.approver === "object" && financeApproval.approver !== null) ? financeApproval.approver : null;
  const financeApproverName = financeApproverObj?.name || financeApproval.approverName || "Company CFO / Finance Head";
  const financeApproverCode = financeApproverObj?.employeeIdCode ? ` (${financeApproverObj.employeeIdCode})` : "";
  const financeApproverSub = [financeApproverObj?.designation, financeApproverObj?.department].filter(Boolean).join(" • ");

  const effectiveFinanceStatus = (() => {
    if (financeStatusUpper === "APPROVED") return "APPROVED";
    if (financeStatusUpper === "REJECTED") return "REJECTED";
    if (effectiveApprovalStatus === "REJECTED") return "CANCELLED";
    if (isFinanceStage || financeStatusUpper === "PENDING") return "PENDING";
    if (["SUBMITTED", "ACCOUNTS_APPROVED", "APPROVED", "PAID", "DISBURSED", "SETTLED"].includes(statusUpper)) {
      return (financeApproval.decidedAt || financeStatusUpper === "APPROVED") ? "APPROVED" : "PENDING";
    }
    return "WAITING_FIRST";
  })();

  const financeStatusMeta = {
    WAITING_FIRST: { label: "Pending (After 1st Approval)", shortLabel: "Pending", color: "#b45309", bg: "#fef3c7", border: "#fde68a" },
    PENDING: { label: "Pending • Awaiting 2nd Approval", shortLabel: "Pending", color: "#b45309", bg: "#fef3c7", border: "#fde68a" },
    APPROVED: { label: "Approved", shortLabel: "Approved", color: "#059669", bg: "#d1fae5", border: "#a7f3d0" },
    REJECTED: { label: "Rejected", shortLabel: "Rejected", color: "#dc2626", bg: "#fee2e2", border: "#fecaca" },
    CANCELLED: { label: "Cancelled (1st Approval Rejected)", shortLabel: "Cancelled", color: "#64748b", bg: "#f1f5f9", border: "#cbd5e1" },
    NOT_REQUIRED: { label: "Not Required", shortLabel: "Not Required", color: "#64748b", bg: "#f1f5f9", border: "#cbd5e1" },
  }[effectiveFinanceStatus] || { label: "Pending", shortLabel: "Pending", color: "#d97706", bg: "#fef3c7", border: "#fde68a" };

  // Accounts Admin Approval & Payment — shown for all submitted claims so full approval pipeline is visible
  const rawAccountsApprovalStatus = String(claim.accountsApproval?.status || "").toUpperCase();
  const isRejectedClaim = ["REJECTED", "HR_REJECTED", "ACCOUNTS_REJECTED", "CANCELLED"].includes(statusUpper) || paymentUpper === "REJECTED";
  const showAccountsCard = Boolean(statusUpper !== "DRAFT");

  const effectiveAccountsStatus = (() => {
    if (isDisbursedOrPaid) return "PAID";
    if (isAccountsApproved || rawAccountsApprovalStatus === "APPROVED") return "APPROVED_PAYMENT_PENDING";
    if (rawAccountsApprovalStatus === "REJECTED" || (isRejectedClaim && effectiveApprovalStatus !== "REJECTED" && effectiveFinanceStatus !== "REJECTED")) {
      return "REJECTED";
    }
    if (effectiveApprovalStatus === "REJECTED" || effectiveFinanceStatus === "REJECTED") {
      return "CANCELLED";
    }
    if (statusUpper === "APPROVAL_PENDING") {
      return "WAITING_PRIOR";
    }
    return "PENDING";
  })();

  const effectivePaymentStageStatus = (() => {
    if (isDisbursedOrPaid) return "PAID";
    if (isRejectedClaim) return "CANCELLED";
    if (isAccountsApproved || rawAccountsApprovalStatus === "APPROVED") return "AWAITING_PAYMENT";
    return "PENDING";
  })();

  const accountsStatusMeta = {
    WAITING_PRIOR: { label: "Pending (After Prior Approvals)", shortLabel: "Pending", color: "#64748b", bg: "#f1f5f9", border: "#cbd5e1" },
    PENDING: { label: "Pending • Awaiting Accounts Approval", shortLabel: "Pending", color: "#d97706", bg: "#fef3c7", border: "#fde68a" },
    APPROVED_PAYMENT_PENDING: { label: "Approved • Payment Pending", shortLabel: "Approved • Payment Pending", color: "#2563eb", bg: "#dbeafe", border: "#bfdbfe" },
    PAID: { label: "Paid", shortLabel: "Paid", color: "#059669", bg: "#d1fae5", border: "#a7f3d0" },
    REJECTED: { label: "Rejected", shortLabel: "Rejected", color: "#dc2626", bg: "#fee2e2", border: "#fecaca" },
    CANCELLED: { label: "Cancelled (Prior Approval Rejected)", shortLabel: "Cancelled", color: "#64748b", bg: "#f1f5f9", border: "#cbd5e1" },
  }[effectiveAccountsStatus] || { label: "Pending", shortLabel: "Pending", color: "#d97706", bg: "#fef3c7", border: "#fde68a" };

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      <ExpenseHeader
        title={typeInfo.name}
        subtitle="Expense Claim Details"
        navigation={navigation}
        rightElement={
          <TouchableOpacity
            style={styles.headerDownloadBtn}
            onPress={() => handleDownloadPdf("header")}
            disabled={downloadingPdf}
            activeOpacity={0.7}
          >
            {activeDownloadBtn === "header" ? (
              <ActivityIndicator size="small" color="#4f46e5" />
            ) : (
              <View style={styles.headerDownloadPill}>
                <Download size={13} color="#ffffff" />
                <Text style={styles.headerDownloadText}>PDF</Text>
              </View>
            )}
          </TouchableOpacity>
        }
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load(false);
            }}
          />
        }
      >

        {/* ======================================================== */}
        {/* STEP 1: DATE (Claim Date OR Lodging Stay Dates)          */}
        {/* ======================================================== */}
        <Text style={styles.sectionTitle}>
          1. {isLodging ? "Lodging Stay Dates" : "Claim Date"}
        </Text>
        <View style={styles.itemCard}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Calendar size={18} color="#4f46e5" />
            <View style={{ flex: 1 }}>
              <Text style={styles.inputLabel}>
                {isLodging ? "Stay Period (From → To)" : "Claim Date"}
              </Text>
              <Text style={{ fontSize: 13, fontWeight: "800", color: "#0f172a", marginTop: 2 }}>
                {dateLabel || "—"}
                {isLodging && days > 0
                  ? (() => {
                      const rawDiff =
                        claim.fromDate && claim.toDate
                          ? Math.max(0, Math.round((new Date(claim.toDate) - new Date(claim.fromDate)) / (1000 * 60 * 60 * 24)))
                          : null;
                      const lNights =
                        claim.lodgingNights !== undefined && claim.lodgingNights !== null
                          ? claim.lodgingNights
                          : (claim.numberOfNights ?? (rawDiff !== null ? rawDiff : days));
                      const fDays =
                        claim.foodDays !== undefined && claim.foodDays !== null
                          ? claim.foodDays
                          : (rawDiff !== null ? rawDiff + 1 : lNights + 1);
                      return ` (${lNights} lodging night${lNights === 1 ? "" : "s"} · ${fDays} food day${fDays === 1 ? "" : "s"})`;
                    })()
                  : ""}
              </Text>
              {isLodging ? (
                <Text style={{ fontSize: 12, fontWeight: "700", color: "#475569", marginTop: 4 }}>
                  Stay Type: {(claim.stayType === "WITH_RELATIVE" || claim.stayType === "RELATIVE" ? "🏠 Stay with Relative" : "🏨 Stay in Hotel")}
                </Text>
              ) : null}
            </View>
          </View>
        </View>

        {/* ======================================================== */}
        {/* STEP 2: SELECT EMPLOYEES                                 */}
        {/* ======================================================== */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>
            2. Selected Employees
          </Text>
          <View style={styles.entryCountBadge}>
            <Text style={styles.entryCountBadgeText}>
              {numEmployees} {numEmployees > 1 ? "Employees" : "Employee"}
            </Text>
          </View>
        </View>

        {ecList.length > 0 ? (
          ecList.map((ec, idx) => {
            const isSlotOne = idx === 0;
            const empName = ec.employee?.name || (isSlotOne ? (claim.submittedByName || "Myself") : `Employee #${idx + 1}`);
            const empCode = ec.employee?.employeeIdCode || (isSlotOne ? claim.submittedBy?.employeeIdCode : "");
            const empDept = ec.employee?.department || (isSlotOne ? claim.submittedBy?.department : "");
            const empDesig = ec.employee?.designation || ec.employee?.levelName || ec.employee?.role || ec.employee?.gradeCode || (isSlotOne ? claim.submittedBy?.designation : "");

            return (
              <View key={idx} style={styles.slotCard}>
                <View style={styles.slotAvatar}>
                  <Text style={styles.slotAvatarText}>#{idx + 1}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.slotLabel}>
                    {isSlotOne ? "Employee #1 (Primary / Myself)" : `Employee #${idx + 1}`}
                  </Text>
                  <Text style={styles.slotName}>
                    {empName}
                    {empCode ? <Text style={{ color: "#4f46e5", fontWeight: "700", fontSize: 11 }}>{` [${empCode}]`}</Text> : null}
                  </Text>
                  {(empDept || empDesig) ? (
                    <Text style={styles.slotMeta}>
                      {[empDesig, empDept].filter(Boolean).join(" • ")}
                    </Text>
                  ) : null}
                </View>
              </View>
            );
          })
        ) : (
          <View style={styles.slotCard}>
            <View style={styles.slotAvatar}>
              <Text style={styles.slotAvatarText}>#1</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.slotLabel}>Employee #1 (Primary / Myself)</Text>
              <Text style={styles.slotName}>
                {claim.submittedByName || claim.submittedBy?.name || "Myself"}
                {claim.submittedBy?.employeeIdCode ? <Text style={{ color: "#4f46e5", fontWeight: "700", fontSize: 11 }}>{` [${claim.submittedBy.employeeIdCode}]`}</Text> : null}
              </Text>
              {(claim.submittedBy?.designation || claim.submittedBy?.department) ? (
                <Text style={styles.slotMeta}>
                  {[claim.submittedBy?.designation, claim.submittedBy?.department].filter(Boolean).join(" • ")}
                </Text>
              ) : null}
            </View>
          </View>
        )}

        {/* ======================================================== */}
        {/* STEP 3: CUSTOMER & DESTINATION                           */}
        {/* ======================================================== */}
        <Text style={styles.sectionTitle}>
          3. Customer &amp; Destination
        </Text>
        <View style={styles.itemCard}>
          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>Customer Name: </Text>
            <Text style={styles.fieldValue}>{claim.customerName || claim.trip?.customerName || "—"}</Text>
          </View>
          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>Destination City: </Text>
            <Text style={styles.fieldValue}>
              {claim.destinationCity || claim.trip?.destination || "—"}
              {claim.trip?.destinationClass ? ` (Class ${claim.trip.destinationClass})` : ""}
            </Text>
          </View>
          <View style={[styles.fieldRow, { alignItems: "center" }]}>
            <Text style={styles.fieldLabel}>Visit Option: </Text>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 5,
                paddingHorizontal: 8,
                paddingVertical: 3,
                borderRadius: 8,
                backgroundColor: isClaimVisit ? "#eef2ff" : "#f0f9ff",
                borderWidth: 1,
                borderColor: isClaimVisit ? "#c7d2fe" : "#bae6fd",
              }}
            >
              {isClaimVisit ? (
                <Wrench size={13} color="#4f46e5" />
              ) : (
                <Building2 size={13} color="#0284c7" />
              )}
              <Text style={[styles.fieldValue, { color: isClaimVisit ? "#4f46e5" : "#0284c7", fontWeight: "800" }]}>
                {isClaimVisit ? "2. Service Call (Service Report Compulsory)" : "1. Normal Travel"}
              </Text>
            </View>
          </View>
          {claim.trip?.travelMode ? (
            <View style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>Travel Mode: </Text>
              <Text style={styles.fieldValue}>{getTravelModeIcon(claim.trip.travelMode)} {claim.trip.travelMode}</Text>
            </View>
          ) : null}
          <View style={[styles.fieldRow, { alignItems: "flex-start" }]}>
            <Text style={styles.fieldLabel}>Remark / Purpose: </Text>
            <Text style={[styles.fieldValue, { flex: 1 }]}>
              {claim.remark || claim.remarks || claim.trip?.purpose || "—"}
            </Text>
          </View>
        </View>

        {/* ======================================================== */}
        {/* STEP 4: EXPENSE DETAILS (3-Level Expandable Hierarchy)    */}
        {/* Level 1: Main Claim Record                                */}
        {/* Level 2: Claim Types / Categories                         */}
        {/* Level 3: Individual Claim Entries                         */}
        {/* ======================================================== */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>
            4. Expense Details
          </Text>
          <View style={styles.entryCountBadge}>
            <Text style={styles.entryCountBadgeText}>
              {combinedEntries.length} {combinedEntries.length > 1 ? "Entries" : "Entry"}
            </Text>
          </View>
        </View>

        {(() => {
          const categoryMap = new Map();
          const getCatMeta = (entry) => {
            const t = String(entry.expenseType || "").toUpperCase();
            const isPurchaseEntry = t === "STOCK_PURCHASE" || (t === "OTHER" && String(entry.otherSubType || "").toUpperCase() === "PURCHASE");
            if (t === "LODGING" || t === "LODGING_EXPENSE") {
              return { key: "LODGING", title: "Accommodation Claim", icon: "🏨" };
            }
            if (t === "TRAVEL" || t === "TRAVEL_EXPENSE") {
              return { key: "TRAVEL", title: "Travel Claim", icon: "🚆" };
            }
            if (t === "FOOD" || t === "FOOD_DA" || t === "FOOD_EXPENSE") {
              return { key: "FOOD", title: "Food Claim", icon: "🍽️" };
            }
            if (t === "CONVEYANCE" || t === "LOCAL_CONVEYANCE" || t === "LOCAL_TRAVEL" || t === "LOCAL") {
              return { key: "CONVEYANCE", title: "Local Conveyance Claim", icon: "🚗" };
            }
            if (isPurchaseEntry) {
              return { key: "STOCK_PURCHASE", title: "Stock Purchase Claim", icon: "📦" };
            }
            return { key: "OTHER", title: "Other Expense Claim", icon: "🧾" };
          };

          combinedEntries.forEach((entry, idx) => {
            const meta = getCatMeta(entry);
            if (!categoryMap.has(meta.key)) {
              categoryMap.set(meta.key, {
                ...meta,
                entries: [],
                totalRequested: 0,
                totalAllowed: 0,
                totalExcess: 0,
              });
            }
            const group = categoryMap.get(meta.key);
            group.entries.push({ entry, globalIdx: idx });
            group.totalRequested += Number(entry.requestedAmount || 0);
            group.totalAllowed += Number(entry.allowedAmount || 0);
            group.totalExcess += Number(entry.excessAmount || 0);
          });

          const categoryGroups = Array.from(categoryMap.values());
          const primaryEmpName = ecList[0]?.employee?.name || claim.submittedByName || claim.submittedBy?.name || "Employee";
          const allCollapsed = categoryGroups.length > 0 && categoryGroups.every((c) => Boolean(collapsedCategories[c.key]));

          return (
            <View style={{ backgroundColor: "#ffffff", borderRadius: 14, borderWidth: 1, borderColor: "#e2e8f0", overflow: "hidden", marginBottom: 10 }}>
              {/* Level 1: Main Claim Record Header */}
              <View style={{ backgroundColor: "#0f172a", paddingHorizontal: 14, paddingVertical: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: "800", color: "#ffffff", fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" }}>
                    {claim.claimNumber || claim.claimId || "Draft Claim"}
                  </Text>
                  <Text style={{ fontSize: 11, fontWeight: "600", color: "#cbd5e1", marginTop: 2 }}>
                    Employee: <Text style={{ color: "#ffffff", fontWeight: "700" }}>{primaryEmpName}</Text>
                    {numEmployees > 1 ? ` (+${numEmployees - 1} more)` : ""}
                    {dateLabel ? ` · ${dateLabel}` : ""}
                  </Text>
                </View>
                <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: statusInfo.color }}>
                  <Text style={{ fontSize: 10, fontWeight: "800", color: "#ffffff" }}>{statusInfo.label}</Text>
                </View>
              </View>

              {/* Level 2 Sub-Header */}
              <View style={{ backgroundColor: "#f8fafc", paddingHorizontal: 14, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#e2e8f0", flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <Text style={{ fontSize: 10, fontWeight: "800", color: "#475569", textTransform: "uppercase", letterSpacing: 0.5 }}>
                  Claim Categories ({categoryGroups.length})
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    if (allCollapsed) {
                      setCollapsedCategories({});
                    } else {
                      const next = {};
                      categoryGroups.forEach((c) => { next[c.key] = true; });
                      setCollapsedCategories(next);
                    }
                  }}
                >
                  <Text style={{ fontSize: 11, fontWeight: "800", color: "#4f46e5" }}>
                    {allCollapsed ? "Expand All" : "Collapse All"}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Level 2: Claim Types (Expandable Categories) */}
              <View style={{ padding: 10, gap: 10 }}>
                {categoryGroups.map((cat) => {
                  const isCatCollapsed = Boolean(collapsedCategories[cat.key]);
                  const catHasExcess = cat.totalExcess > 0;
                  return (
                    <View key={cat.key} style={{ borderRadius: 12, borderWidth: 1, borderColor: "#cbd5e1", backgroundColor: "#ffffff", overflow: "hidden" }}>
                      <TouchableOpacity
                        activeOpacity={0.75}
                        onPress={() => setCollapsedCategories((prev) => ({ ...prev, [cat.key]: !prev[cat.key] }))}
                        style={{ backgroundColor: "#f8fafc", paddingHorizontal: 12, paddingVertical: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
                      >
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
                          {isCatCollapsed ? (
                            <ChevronRight size={16} color="#475569" />
                          ) : (
                            <ChevronDown size={16} color="#475569" />
                          )}
                          <Text style={{ fontSize: 15 }}>{cat.icon}</Text>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 13, fontWeight: "800", color: "#0f172a" }}>{cat.title}</Text>
                            <Text style={{ fontSize: 10, fontWeight: "600", color: "#64748b" }}>
                              {cat.entries.length} {cat.entries.length === 1 ? "entry" : "entries"}
                            </Text>
                          </View>
                        </View>
                        <View style={{ alignItems: "flex-end" }}>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                            <View
                              style={{
                                paddingHorizontal: 6,
                                paddingVertical: 2,
                                borderRadius: 6,
                                backgroundColor: catHasExcess ? "#fef2f2" : "#f0fdf4",
                                borderWidth: 1,
                                borderColor: catHasExcess ? "#fecaca" : "#bbf7d0",
                              }}
                            >
                              <Text style={{ fontSize: 9, fontWeight: "800", color: catHasExcess ? "#dc2626" : "#059669" }}>
                                {catHasExcess ? `${formatINR(cat.totalExcess)} Excess` : "Fully Allowed"}
                              </Text>
                            </View>
                            <Text style={{ fontSize: 13, fontWeight: "900", color: "#0f172a" }}>
                              {formatINR(cat.totalRequested)}
                            </Text>
                          </View>
                          <Text style={{ fontSize: 10, fontWeight: "600", color: "#64748b", marginTop: 2 }}>
                            Allowed: <Text style={{ color: "#059669", fontWeight: "800" }}>{formatINR(cat.totalAllowed)}</Text>
                          </Text>
                        </View>
                      </TouchableOpacity>

                      {/* Level 3: Claim Entries under this Category */}
                      {!isCatCollapsed && (
                        <View style={{ borderTopWidth: 1, borderTopColor: "#e2e8f0", padding: 10, gap: 10, backgroundColor: "#ffffff" }}>
                          {cat.entries.map(({ entry, globalIdx }) => {
                            const entryNum = globalIdx + 1;
                            const isPurchase =
                              entry.expenseType === "STOCK_PURCHASE" ||
                              (entry.expenseType === "OTHER" && (entry.otherSubType || "").toUpperCase() === "PURCHASE");
                            const isConveyance = entry.expenseType === "CONVEYANCE" || entry.expenseType === "LOCAL_CONVEYANCE";
                            const isLodgingEntry = entry.expenseType === "LODGING" || entry.expenseType === "LODGING_EXPENSE";
                            const isFoodEntry = entry.expenseType === "FOOD" || entry.expenseType === "FOOD_EXPENSE";
                            const entryIcon = (() => {
                              if (isLodgingEntry) {
                                return (claim.stayType === "WITH_RELATIVE" || claim.stayType === "RELATIVE") ? "🏠" : "🏨";
                              }
                              if (entry.expenseType === "TRAVEL" || entry.expenseType === "TRAVEL_EXPENSE") {
                                return getTravelModeIcon(entry.travelModeName || entry.travelModeCode, entry.travelSubtypeName || entry.travelSubtypeCode);
                              }
                              if (isFoodEntry) return "🍽️";
                              if (isConveyance) {
                                if (entry.vehicle === "twoWheeler") return "🏍️";
                                if (entry.vehicle === "eBike" || entry.vehicle === "eCar") return "⚡";
                                return "🚗";
                              }
                              if (isPurchase) return "📦";
                              return "🧾";
                            })();
                            const foodSafeLimit = (isFoodEntry || isLodgingEntry)
                              ? `₹${entry.policyLimit > 0 ? entry.policyLimit : (entry.allowedAmount ?? 0)}`
                              : entry.expenseType === "TRAVEL"
                                ? (entry.limitDisplay || (entry.hasExcess ? `₹${entry.allowedAmount ?? 0}` : "Actuals (Fully Allowed)"))
                                : (isConveyance || entry.expenseType === "OTHER" || entry.expenseType === "STOCK_PURCHASE")
                                  ? "Actuals (Fully Allowed)"
                                  : (entry.limitDisplay || `₹${entry.allowedAmount ?? 0}`);

                            const entryTitleDetail = (() => {
                              if (entry.expenseType === "TRAVEL" && (entry.travelModeName || entry.travelModeCode)) {
                                return `${entry.travelModeName || entry.travelModeCode}${entry.travelSubtypeName ? ` (${entry.travelSubtypeName})` : ""}`;
                              }
                              if (isConveyance) {
                                return entry.vehicle === "twoWheeler" ? "2-Wheeler / Bike" :
                                  entry.vehicle === "car" ? "Car (4W)" :
                                    entry.vehicle === "eBike" ? "E-Bike" :
                                      entry.vehicle === "eCar" ? "E-Car" : "Local Conveyance";
                              }
                              if (isPurchase && entry.materialName) {
                                return entry.materialName;
                              }
                              if (isLodgingEntry) {
                                return entry.hotelName || (claim.stayType === "WITH_RELATIVE" || claim.stayType === "RELATIVE" ? "Stay with Relative" : "Hotel Accommodation");
                              }
                              return entry.expenseTypeName;
                            })();

                            const entrySubSummary = [
                              entry.expenseDate ? String(entry.expenseDate).slice(0, 10) : dateLabel,
                              claim.destinationCity || claim.trip?.destination ? `${claim.destinationCity || claim.trip?.destination}${claim.trip?.destinationClass ? ` (Class ${claim.trip.destinationClass})` : ""}` : null,
                              entry.description || null,
                            ].filter(Boolean).join(" · ");

                            return (
                              <View key={globalIdx} style={[styles.entryCard, { marginBottom: 0 }]}>
                                <View style={styles.entryCardHeader}>
                                  <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, flex: 1 }}>
                                    <View style={[styles.entryNumberPill, { backgroundColor: "#4f46e5" }]}>
                                      <Text style={{ fontSize: 11 }}>{entryIcon}</Text>
                                      <Text style={[styles.entryNumberPillText, { color: "#ffffff" }]}>
                                        Entry {String(entryNum).padStart(2, "0")}
                                      </Text>
                                    </View>
                                    <View style={{ flex: 1 }}>
                                      <Text style={styles.entryCardTitle}>{entryIcon} {entryTitleDetail}</Text>
                                      {entrySubSummary ? (
                                        <Text style={{ fontSize: 10.5, fontWeight: "600", color: "#64748b", marginTop: 2 }}>
                                          {entrySubSummary}
                                        </Text>
                                      ) : null}
                                    </View>
                                  </View>
                                  <View style={{ alignItems: "flex-end", gap: 2 }}>
                                    <View style={[
                                      styles.statusBadge,
                                      entry.hasExcess
                                        ? { backgroundColor: "#fef2f2", borderColor: "#fecaca" }
                                        : { backgroundColor: "#f0fdf4", borderColor: "#bbf7d0" }
                                    ]}>
                                      <Text style={[
                                        styles.statusBadgeText,
                                        { color: entry.hasExcess ? "#dc2626" : "#059669" }
                                      ]}>
                                        {entry.hasExcess ? `${formatINR(entry.excessAmount)} Excess` : "Fully Allowed"}
                                      </Text>
                                    </View>
                                    <Text style={{ fontSize: 13, fontWeight: "900", color: "#0f172a" }}>
                                      {formatINR(entry.requestedAmount)}
                                    </Text>
                                  </View>
                                </View>

              {/* Purchase fields */}
              {isPurchase && (
                <>
                  {entry.materialName ? (
                    <View style={styles.fieldRow}>
                      <Text style={styles.fieldLabel}>Material Name: </Text>
                      <Text style={styles.fieldValue}>
                        {entry.materialName}
                      </Text>
                    </View>
                  ) : null}
                  {entry.barcodeNumber ? (
                    <View style={styles.fieldRow}>
                      <Text style={styles.fieldLabel}>Barcode Number: </Text>
                      <Text style={[styles.fieldValue, { fontFamily: "monospace", color: "#6366f1" }]}>
                        {entry.barcodeNumber}
                      </Text>
                    </View>
                  ) : null}
                  {entry.quantity ? (
                    <View style={styles.fieldRow}>
                      <Text style={styles.fieldLabel}>Quantity: </Text>
                      <Text style={styles.fieldValue}>{entry.quantity}</Text>
                    </View>
                  ) : null}
                </>
              )}

              {/* Dynamic Travel Mode & Subtype fields */}
              {entry.expenseType === "TRAVEL" && (
                <>
                  {(entry.travelModeName || entry.travelModeCode) ? (
                    <View style={styles.fieldRow}>
                      <Text style={styles.fieldLabel}>Travel Mode: </Text>
                      <Text style={styles.fieldValue}>
                        {getTravelModeIcon(entry.travelModeName || entry.travelModeCode, entry.travelSubtypeName || entry.travelSubtypeCode)}{" "}
                        {entry.travelModeName || entry.travelModeCode}
                        {(entry.travelSubtypeName || entry.travelSubtypeCode)
                          ? ` — ${entry.travelSubtypeName || entry.travelSubtypeCode}`
                          : ""}
                      </Text>
                    </View>
                  ) : null}
                  {(entry.travelWorkflow === "KM_RATE" || Number(entry.distanceKm) > 0) && (
                    <View style={styles.fieldRow}>
                      <Text style={styles.fieldLabel}>Distance &amp; Rate: </Text>
                      <Text style={styles.fieldValue}>
                        {entry.distanceKm ?? 0} KM{Number(entry.ratePerKm) > 0 ? ` × ₹${entry.ratePerKm}/km = ${formatINR(entry.requestedAmount ?? 0)}` : ""}
                      </Text>
                    </View>
                  )}
                  {entry.entitlementStatus === "NOT_ENTITLED" && (
                    <View style={styles.fieldRow}>
                      <Text style={styles.fieldLabel}>Entitlement: </Text>
                      <Text style={[styles.fieldValue, { color: "#dc2626", fontWeight: "700" }]}>
                        Not in Level Entitlement (Allowed ₹0 · Full Excess)
                      </Text>
                    </View>
                  )}
                  {entry.excessReason ? (
                    <View style={styles.fieldRow}>
                      <Text style={styles.fieldLabel}>Policy Note: </Text>
                      <Text style={[styles.fieldValue, { color: "#b45309", flex: 1 }]}>
                        {entry.excessReason}
                      </Text>
                    </View>
                  ) : null}
                </>
              )}

              {/* Local Conveyance fields */}
              {isConveyance && (
                <>
                  <View style={styles.fieldRow}>
                    <Text style={styles.fieldLabel}>Travel Mode: </Text>
                    <Text style={styles.fieldValue}>
                      {entry.vehicle === "twoWheeler" ? "🏍️ 2-Wheeler / Bike" :
                        entry.vehicle === "car" ? "🚗 Car (4W)" :
                          entry.vehicle === "eBike" ? "⚡ E-Bike" :
                            entry.vehicle === "eCar" ? "⚡ E-Car" :
                              entry.vehicle || "Conveyance"}
                    </Text>
                  </View>
                  <View style={[styles.fieldRow, { alignItems: "center" }]}>
                    <Text style={styles.fieldLabel}>Visit Option: </Text>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 5,
                        paddingHorizontal: 8,
                        paddingVertical: 3,
                        borderRadius: 8,
                        backgroundColor: entry.isVisit || entry.visitType === "VISIT" ? "#eef2ff" : "#f0f9ff",
                        borderWidth: 1,
                        borderColor: entry.isVisit || entry.visitType === "VISIT" ? "#c7d2fe" : "#bae6fd",
                      }}
                    >
                      {entry.isVisit || entry.visitType === "VISIT" ? (
                        <Wrench size={13} color="#4f46e5" />
                      ) : (
                        <Building2 size={13} color="#0284c7" />
                      )}
                      <Text style={[styles.fieldValue, { color: entry.isVisit || entry.visitType === "VISIT" ? "#4f46e5" : "#0284c7", fontWeight: "800" }]}>
                        {entry.isVisit || entry.visitType === "VISIT" ? "2. Service Call (Service Report Attached)" : "1. Normal Travel"}
                      </Text>
                    </View>
                  </View>
                  {entry.distanceKm ? (
                    <View style={styles.fieldRow}>
                      <Text style={styles.fieldLabel}>Distance: </Text>
                      <Text style={styles.fieldValue}>{entry.distanceKm} KM</Text>
                    </View>
                  ) : null}
                  {entry.formula ? (
                    <View style={styles.fieldRow}>
                      <Text style={styles.fieldLabel}>Calculation: </Text>
                      <Text style={[styles.fieldValue, { color: "#4f46e5" }]}>{entry.formula}</Text>
                    </View>
                  ) : null}
                </>
              )}

              {/* Lodging Entry fields */}
              {isLodgingEntry && (
                <>
                  {entry.hotelName ? (
                    <View style={styles.fieldRow}>
                      <Text style={styles.fieldLabel}>Hotel / Stay: </Text>
                      <Text style={styles.fieldValue}>{entry.hotelName}</Text>
                    </View>
                  ) : null}
                  {entry.accommodationType ? (
                    <View style={styles.fieldRow}>
                      <Text style={styles.fieldLabel}>Accommodation Type: </Text>
                      <Text style={styles.fieldValue}>{entry.accommodationType}</Text>
                    </View>
                  ) : null}
                  {entry.sharedWith ? (
                    <View style={styles.fieldRow}>
                      <Text style={styles.fieldLabel}>Shared With: </Text>
                      <Text style={styles.fieldValue}>{entry.sharedWith}</Text>
                    </View>
                  ) : null}
                </>
              )}

              {/* Amount Figures Grid */}
              <View style={styles.figuresGrid}>
                <View style={styles.figureItem}>
                  <Text style={styles.figureLabel}>CLAIMED</Text>
                  <Text style={styles.figureValue}>₹{entry.requestedAmount || 0}</Text>
                </View>
                <View style={styles.figureItem}>
                  <Text style={[styles.figureLabel, { color: "#6366f1" }]}>POLICY LIMIT</Text>
                  <Text style={[styles.figureValue, { color: "#4f46e5" }]}>{foodSafeLimit}</Text>
                </View>
                <View style={styles.figureItem}>
                  <Text style={[styles.figureLabel, { color: "#059669" }]}>ALLOWED</Text>
                  <Text style={[styles.figureValue, { color: "#059669" }]}>₹{entry.allowedAmount || 0}</Text>
                </View>
                {entry.hasExcess && (
                  <View style={styles.figureItem}>
                    <Text style={[styles.figureLabel, { color: "#dc2626" }]}>EXCESS</Text>
                    <Text style={[styles.figureValue, { color: "#dc2626" }]}>₹{entry.excessAmount || 0}</Text>
                  </View>
                )}
              </View>

              {/* Remark / Purpose */}
              {entry.description ? (
                <View style={[styles.fieldRow, { alignItems: "flex-start", marginTop: 4 }]}>
                  <Text style={styles.fieldLabel}>Remark: </Text>
                  <Text style={[styles.fieldValue, { flex: 1, fontWeight: "600", color: "#334155" }]}>
                    {entry.description}
                  </Text>
                </View>
              ) : null}

              {/* Entry specific proofs (Non-conveyance only) */}
              {!isConveyance && entry.attachments && entry.attachments.length > 0 && (
                <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: "#f1f5f9", gap: 6 }}>
                  <Text style={{ fontSize: 10, fontWeight: "800", color: "#64748b", textTransform: "uppercase" }}>
                    Receipt Proofs ({entry.attachments.length}):
                  </Text>
                  {entry.attachments.map((att, aIdx) => {
                    const previewUri = resolveProofImageUrl(att);
                    const isPdf = att.type === "application/pdf" || (att.name && att.name.toLowerCase().endsWith(".pdf"));
                    const proofTitle = att.name || `Entry #${entryNum} Proof #${aIdx + 1}`;
                    return (
                      <TouchableOpacity
                        key={aIdx}
                        style={styles.detailAttCard}
                        activeOpacity={0.7}
                        onPress={() => {
                          if (isPdf && previewUri) {
                            Linking.openURL(previewUri).catch(() => {
                              Alert.alert("Document", "Unable to open PDF preview.");
                            });
                          } else if (previewUri) {
                            setPhotoPreviewModal({
                              visible: true,
                              uri: previewUri,
                              title: proofTitle,
                            });
                          }
                        }}
                      >
                        {isPdf ? (
                          <View style={styles.detailAttIconPlaceholder}>
                            <FileText size={16} color="#dc2626" />
                          </View>
                        ) : previewUri ? (
                          <Image source={{ uri: previewUri }} style={styles.detailAttThumb} resizeMode="cover" />
                        ) : (
                          <View style={styles.detailAttIconPlaceholder}>
                            <FileCheck size={14} color="#059669" />
                          </View>
                        )}
                        <View style={{ flex: 1, marginLeft: 8 }}>
                          <Text style={styles.detailAttName} numberOfLines={1}>{proofTitle}</Text>
                          <Text style={styles.detailAttSub}>
                            {isPdf ? "PDF Document • Tap to open" : "Image Proof • Tap to view"}
                          </Text>
                        </View>
                        <View style={styles.detailAttEyePill}>
                          <Eye size={12} color="#4f46e5" />
                          <Text style={styles.detailAttEyeText}>View</Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              {/* Conveyance / Own Vehicle Photo Proofs (Vehicle, Start KM, End KM, Visit Service Reports) */}
              {(isConveyance || (entry.expenseType === "TRAVEL" && entry.travelWorkflow === "KM_RATE")) && ((entry.numberPlatePhotos && entry.numberPlatePhotos.length > 0) || (entry.startKmPhotos && entry.startKmPhotos.length > 0) || (entry.endKmPhotos && entry.endKmPhotos.length > 0) || (entry.serviceReports && entry.serviceReports.length > 0)) && (
                <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: "#f1f5f9", gap: 6 }}>
                  <Text style={{ fontSize: 10, fontWeight: "800", color: "#2563eb", textTransform: "uppercase" }}>
                    🚗 Conveyance Photo Proofs:
                  </Text>

                  {/* Vehicle / Number Plate Photos */}
                  {entry.numberPlatePhotos && entry.numberPlatePhotos.length > 0 && entry.numberPlatePhotos.map((p, pIdx) => {
                    const previewUri = resolveProofImageUrl(p);
                    const title = p.name || `Entry #${entryNum} Vehicle Photo`;
                    return (
                      <TouchableOpacity
                        key={`entry-np-${pIdx}`}
                        style={[styles.detailAttCard, { backgroundColor: "#eff6ff", borderColor: "#bfdbfe" }]}
                        activeOpacity={0.7}
                        onPress={() => {
                          if (previewUri) {
                            setPhotoPreviewModal({ visible: true, uri: previewUri, title });
                          }
                        }}
                      >
                        {previewUri ? (
                          <Image source={{ uri: previewUri }} style={styles.detailAttThumb} resizeMode="cover" />
                        ) : (
                          <View style={[styles.detailAttIconPlaceholder, { backgroundColor: "#dbeafe" }]}>
                            <ImageIcon size={16} color="#2563eb" />
                          </View>
                        )}
                        <View style={{ flex: 1, marginLeft: 8 }}>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                            <Text style={[styles.detailAttName, { color: "#1e40af" }]} numberOfLines={1}>{title}</Text>
                            <View style={{ backgroundColor: "#dbeafe", paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 }}>
                              <Text style={{ fontSize: 8, fontWeight: "800", color: "#1d4ed8" }}>VEHICLE</Text>
                            </View>
                          </View>
                          <Text style={styles.detailAttSub}>Vehicle / Number Plate Photo • Tap to view</Text>
                        </View>
                        <View style={[styles.detailAttEyePill, { backgroundColor: "#dbeafe" }]}>
                          <Eye size={12} color="#1d4ed8" />
                          <Text style={[styles.detailAttEyeText, { color: "#1d4ed8" }]}>View</Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}

                  {/* Start KM Photos */}
                  {entry.startKmPhotos && entry.startKmPhotos.length > 0 && entry.startKmPhotos.map((p, pIdx) => {
                    const previewUri = resolveProofImageUrl(p);
                    const title = p.name || `Entry #${entryNum} Start KM Photo`;
                    return (
                      <TouchableOpacity
                        key={`entry-sk-${pIdx}`}
                        style={[styles.detailAttCard, { backgroundColor: "#f0fdf4", borderColor: "#bbf7d0" }]}
                        activeOpacity={0.7}
                        onPress={() => {
                          if (previewUri) {
                            setPhotoPreviewModal({ visible: true, uri: previewUri, title });
                          }
                        }}
                      >
                        {previewUri ? (
                          <Image source={{ uri: previewUri }} style={styles.detailAttThumb} resizeMode="cover" />
                        ) : (
                          <View style={[styles.detailAttIconPlaceholder, { backgroundColor: "#dcfce7" }]}>
                            <ImageIcon size={16} color="#16a34a" />
                          </View>
                        )}
                        <View style={{ flex: 1, marginLeft: 8 }}>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                            <Text style={[styles.detailAttName, { color: "#166534" }]} numberOfLines={1}>{title}</Text>
                            <View style={{ backgroundColor: "#dcfce7", paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 }}>
                              <Text style={{ fontSize: 8, fontWeight: "800", color: "#15803d" }}>START KM</Text>
                            </View>
                          </View>
                          <Text style={styles.detailAttSub}>Odometer Start Photo • Tap to view</Text>
                        </View>
                        <View style={[styles.detailAttEyePill, { backgroundColor: "#dcfce7" }]}>
                          <Eye size={12} color="#15803d" />
                          <Text style={[styles.detailAttEyeText, { color: "#15803d" }]}>View</Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}

                  {/* End KM Photos */}
                  {entry.endKmPhotos && entry.endKmPhotos.length > 0 && entry.endKmPhotos.map((p, pIdx) => {
                    const previewUri = resolveProofImageUrl(p);
                    const title = p.name || `Entry #${entryNum} End KM Photo`;
                    return (
                      <TouchableOpacity
                        key={`entry-ek-${pIdx}`}
                        style={[styles.detailAttCard, { backgroundColor: "#faf5ff", borderColor: "#e9d5ff" }]}
                        activeOpacity={0.7}
                        onPress={() => {
                          if (previewUri) {
                            setPhotoPreviewModal({ visible: true, uri: previewUri, title });
                          }
                        }}
                      >
                        {previewUri ? (
                          <Image source={{ uri: previewUri }} style={styles.detailAttThumb} resizeMode="cover" />
                        ) : (
                          <View style={[styles.detailAttIconPlaceholder, { backgroundColor: "#f3e8ff" }]}>
                            <ImageIcon size={16} color="#9333ea" />
                          </View>
                        )}
                        <View style={{ flex: 1, marginLeft: 8 }}>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                            <Text style={[styles.detailAttName, { color: "#6b21a8" }]} numberOfLines={1}>{title}</Text>
                            <View style={{ backgroundColor: "#f3e8ff", paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 }}>
                              <Text style={{ fontSize: 8, fontWeight: "800", color: "#7e22ce" }}>END KM</Text>
                            </View>
                          </View>
                          <Text style={styles.detailAttSub}>Odometer End Photo • Tap to view</Text>
                        </View>
                        <View style={[styles.detailAttEyePill, { backgroundColor: "#f3e8ff" }]}>
                          <Eye size={12} color="#7e22ce" />
                          <Text style={[styles.detailAttEyeText, { color: "#7e22ce" }]}>View</Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}

                  {/* Service Call Service Reports attached to this Conveyance entry */}
                  {entry.serviceReports && entry.serviceReports.length > 0 && (
                    <View style={{ marginTop: 6, gap: 6 }}>
                      <Text style={{ fontSize: 10, fontWeight: "800", color: "#7e22ce", textTransform: "uppercase" }}>
                        📑 Service Call Reports ({entry.serviceReports.length}):
                      </Text>
                      {entry.serviceReports.map((sr, srIdx) => {
                        const previewUri = resolveProofImageUrl(sr);
                        const isImg = sr.type && sr.type.startsWith("image/");
                        const isPdf = sr.type === "application/pdf" || (sr.name && sr.name.toLowerCase().endsWith(".pdf"));
                        const isOdf = (sr.name && sr.name.toLowerCase().match(/\.(odt|ods|odp)$/)) || (sr.type && sr.type.includes("opendocument"));
                        const srTitle = sr.name || `Entry #${entryNum} Service Report #${srIdx + 1}`;
                        return (
                          <TouchableOpacity
                            key={`entry-sr-${srIdx}`}
                            style={[styles.detailAttCard, { backgroundColor: "#fdf4ff", borderColor: "#f5d0fe" }]}
                            activeOpacity={0.7}
                            onPress={() => {
                              if (!isImg && previewUri) {
                                Linking.openURL(previewUri).catch(() => {
                                  Alert.alert("Document", "Unable to open document.");
                                });
                              } else if (previewUri) {
                                setPhotoPreviewModal({ visible: true, uri: previewUri, title: srTitle });
                              }
                            }}
                          >
                            {isImg && previewUri ? (
                              <Image source={{ uri: previewUri }} style={styles.detailAttThumb} resizeMode="cover" />
                            ) : (
                              <View style={[styles.detailAttIconPlaceholder, isOdf ? { backgroundColor: "#fef3c7" } : isPdf ? { backgroundColor: "#fee2e2" } : { backgroundColor: "#fae8ff" }]}>
                                <FileText size={16} color={isOdf ? "#d97706" : isPdf ? "#dc2626" : "#a855f7"} />
                              </View>
                            )}
                            <View style={{ flex: 1, marginLeft: 8 }}>
                              <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                                <Text style={[styles.detailAttName, { color: "#7e22ce" }]} numberOfLines={1}>{srTitle}</Text>
                                <View style={{ backgroundColor: "#f3e8ff", paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 }}>
                                  <Text style={{ fontSize: 8, fontWeight: "800", color: "#6b21a8" }}>SERVICE REPORT</Text>
                                </View>
                              </View>
                              <Text style={styles.detailAttSub}>
                                {isImg ? "Image • Tap to preview" : isOdf ? "ODF Document • Tap to open" : isPdf ? "PDF Document • Tap to open" : "Document • Tap to open"}
                              </Text>
                            </View>
                            <View style={[styles.detailAttEyePill, { backgroundColor: "#f3e8ff" }]}>
                              <Eye size={12} color="#7e22ce" />
                              <Text style={[styles.detailAttEyeText, { color: "#7e22ce" }]}>View</Text>
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}
                </View>
              )}
            </View>
                            );
                          })}
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>

              {/* Total Claim Amount Summary Footer */}
              <View style={{ backgroundColor: "#0f172a", paddingHorizontal: 14, paddingVertical: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 10.5, fontWeight: "800", color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5 }}>
                    Total Claim Amount
                  </Text>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8, marginTop: 3 }}>
                    <Text style={{ fontSize: 10.5, fontWeight: "700", color: "#cbd5e1" }}>
                      Allowed: <Text style={{ color: "#34d399", fontWeight: "800" }}>{formatINR(grandAllow)}</Text>
                    </Text>
                    {grandExc > 0 ? (
                      <Text style={{ fontSize: 10.5, fontWeight: "700", color: "#fca5a5" }}>
                        Excess: <Text style={{ color: "#f87171", fontWeight: "800" }}>{formatINR(grandExc)}</Text>
                      </Text>
                    ) : null}
                    <Text style={{ fontSize: 10.5, fontWeight: "700", color: "#93c5fd" }}>
                      Payable: <Text style={{ color: "#60a5fa", fontWeight: "800" }}>{formatINR(payAmt)}</Text>
                    </Text>
                  </View>
                </View>
                <Text style={{ fontSize: 18, fontWeight: "900", color: "#ffffff" }}>
                  {formatINR(grandReq)}
                </Text>
              </View>
            </View>
          );
        })()}

        {/* Shared Food Entitlement Summary Card */}
        {claim.foodSummary ? (
          <View style={[styles.itemCard, { borderColor: "#bbf7d0", backgroundColor: "#f0fdf4", marginTop: 4 }]}>
            <Text style={{ fontSize: 13, fontWeight: "800", color: "#065f46", marginBottom: 6 }}>
              🍽️ Shared Food Allowance Summary ({claim.foodSummary.foodDays || claim.foodDays || days} Day{(claim.foodSummary.foodDays || claim.foodDays || days) === 1 ? "" : "s"})
            </Text>
            <View style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>Period Food Entitlement: </Text>
              <Text style={styles.fieldValue}>
                ₹{claim.foodSummary.entitlement ?? claim.foodSummary.totalPeriodLimit ?? 0}
              </Text>
            </View>
            {Number(claim.foodSummary.priorConsumed || 0) > 0 && (
              <View style={styles.fieldRow}>
                <Text style={[styles.fieldLabel, { color: "#dc2626" }]}>Previously Claimed Food Allowance: </Text>
                <Text style={[styles.fieldValue, { color: "#dc2626", fontWeight: "700" }]}>-₹{claim.foodSummary.priorConsumed}</Text>
              </View>
            )}
            <View style={styles.fieldRow}>
              <Text style={[styles.fieldLabel, { color: "#059669" }]}>Remaining Food Entitlement: </Text>
              <Text style={[styles.fieldValue, { color: "#059669", fontWeight: "800" }]}>
                ₹{claim.foodSummary.remainingBefore ?? claim.foodSummary.totalRemainingLimit ?? claim.foodSummary.entitlement ?? claim.foodSummary.totalPeriodLimit ?? 0}
              </Text>
            </View>
            <View style={[styles.fieldRow, { marginTop: 4, paddingTop: 4, borderTopWidth: 1, borderTopColor: "#bbf7d0" }]}>
              <Text style={styles.fieldLabel}>Food Claimed / Allowed / Excess: </Text>
              <Text style={styles.fieldValue}>
                ₹{claim.foodSummary.requested ?? claim.foodSummary.claimedAmount ?? 0} / <Text style={{ color: "#059669", fontWeight: "700" }}>₹{claim.foodSummary.allowed ?? claim.foodSummary.allowedAmount ?? 0}</Text> / <Text style={{ color: Number(claim.foodSummary.excess ?? claim.foodSummary.excessAmount ?? 0) > 0 ? "#dc2626" : "#64748b", fontWeight: "700" }}>₹{claim.foodSummary.excess ?? claim.foodSummary.excessAmount ?? 0}</Text>
              </Text>
            </View>
          </View>
        ) : null}

        {/* ======================================================== */}
        {/* STEP 5: FULL PAYMENT (Optional)                          */}
        {/* ======================================================== */}
        {isFullPayment ? (
          <>
            <Text style={styles.sectionTitle}>
              5. Full Payment Details
            </Text>
            <View style={[styles.itemCard, { borderColor: "#fed7aa", backgroundColor: "#fff7ed" }]}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 }}>
                <Zap size={16} color="#c2410c" />
                <Text style={{ fontSize: 13, fontWeight: "800", color: "#9a3412" }}>
                  Full Payment Requested: YES
                </Text>
              </View>
              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>Reason: </Text>
                <Text style={[styles.fieldValue, { flex: 1, color: "#9a3412" }]}>
                  {claim.fullPayment?.reason || claim.fullPaymentReason || "No reason specified"}
                </Text>
              </View>
              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>Approval Status: </Text>
                <Text style={[styles.fieldValue, {
                  color: isClaimantManagement
                    ? "#059669"
                    : ((claim.fullPayment?.status === "APPROVED" || claim.fullPaymentApproved)
                      ? "#059669"
                      : (claim.fullPayment?.status === "REJECTED" ? "#dc2626" : "#d97706"))
                }]}>
                  {isClaimantManagement
                    ? "This approval is not applicable for management user."
                    : ((claim.fullPayment?.status === "APPROVED" || claim.fullPaymentApproved)
                      ? `APPROVED by ${claim.fullPayment?.decidedByName || "Accounts"}`
                      : (claim.fullPayment?.status === "REJECTED"
                        ? "REJECTED"
                        : isFinanceStage ? "Awaiting 2nd approval (CFO / Finance Head)" : statusUpper === "APPROVAL_PENDING" ? "Awaiting Reporting Manager approval" : "Pending Review"))}
                </Text>
              </View>

              {/* Full Payment Proofs */}
              {fullPaymentProofs.length > 0 && (
                <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: "#ffedd5", gap: 6 }}>
                  <Text style={{ fontSize: 10, fontWeight: "800", color: "#9a3412", textTransform: "uppercase" }}>
                    ⚡ Full Payment Proofs ({fullPaymentProofs.length}):
                  </Text>
                  {fullPaymentProofs.map((p, pIdx) => {
                    const pUri = resolveProofImageUrl(p);
                    const isPdf = p.type === "application/pdf" || (p.name && p.name.toLowerCase().endsWith(".pdf"));
                    const proofTitle = p.name || `Full Payment Proof #${pIdx + 1}`;
                    return (
                      <TouchableOpacity
                        key={pIdx}
                        style={[styles.detailAttCard, { backgroundColor: "#ffffff" }]}
                        onPress={() => {
                          if (isPdf && pUri) {
                            Linking.openURL(pUri).catch(() => {
                              Alert.alert("Document", "Unable to open full payment proof.");
                            });
                          } else if (pUri) {
                            setPhotoPreviewModal({
                              visible: true,
                              uri: pUri,
                              title: proofTitle,
                            });
                          }
                        }}
                      >
                        {isPdf ? (
                          <FileText size={16} color="#dc2626" />
                        ) : (
                          <FileCheck size={16} color="#ea580c" />
                        )}
                        <Text style={styles.detailAttName} numberOfLines={1}>{proofTitle}</Text>
                        <View style={styles.detailAttEyePill}>
                          <Eye size={11} color="#4f46e5" />
                          <Text style={styles.detailAttEyeText}>View</Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </View>
          </>
        ) : null}

        {/* 1st Approval: Reporting Manager / Management (Full Payment / Stock Purchase / Other Expense) */}
        {showApprovalCard ? (
          <View style={[styles.itemCard, { borderColor: isManagementApproval ? "#ddd6fe" : "#c7d2fe", backgroundColor: isManagementApproval ? "#faf5ff" : "#f8faff" }]}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flex: 1 }}>
                <ShieldCheck size={16} color={isManagementApproval ? "#7c3aed" : "#4f46e5"} />
                <Text style={{ fontSize: 13, fontWeight: "800", color: isManagementApproval ? "#5b21b6" : "#3730a3" }}>
                  {showFinanceCard ? "1st Approval: " : ""}
                  {isManagementApproval
                    ? "Reporting Manager Approval (Full Payment)"
                    : (hasStockPurchase
                      ? "Reporting Manager Approval (Stock Purchase)"
                      : `Reporting Manager Approval (${typeInfo?.name || "Other Expense"})`)}
                </Text>
              </View>
              <View style={{
                paddingHorizontal: 8,
                paddingVertical: 2,
                borderRadius: 8,
                backgroundColor: isClaimantManagement ? "#dcfce7" : approvalStatusMeta.bg,
                borderWidth: 1,
                borderColor: isClaimantManagement ? "#a7f3d0" : approvalStatusMeta.border
              }}>
                <Text style={{
                  fontSize: 10,
                  fontWeight: "800",
                  color: isClaimantManagement ? "#059669" : approvalStatusMeta.color
                }}>
                  {isClaimantManagement ? "Not Applicable" : approvalStatusMeta.shortLabel}
                </Text>
              </View>
            </View>

            {isClaimantManagement ? (
              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>Approval Status: </Text>
                <Text style={[styles.fieldValue, { color: "#059669", fontWeight: "700", flex: 1 }]}>
                  This approval is not applicable for management user.
                </Text>
              </View>
            ) : (
              <>
                <View style={styles.fieldRow}>
                  <Text style={styles.fieldLabel}>Reporting Manager: </Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.fieldValue, { fontWeight: "800", color: "#0f172a" }]}>
                      {approverName}{approverCode}
                    </Text>
                    {approverSub ? (
                      <Text style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
                        {approverSub}
                      </Text>
                    ) : null}
                  </View>
                </View>

                <View style={styles.fieldRow}>
                  <Text style={styles.fieldLabel}>Approval Status: </Text>
                  <Text style={[styles.fieldValue, { color: approvalStatusMeta.color, fontWeight: "700" }]}>
                    {approvalStatusMeta.label}
                  </Text>
                </View>
              </>
            )}

            {managerApproval.requestedAt ? (
              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>Requested On: </Text>
                <Text style={styles.fieldValue}>{formatDateTime(managerApproval.requestedAt)}</Text>
              </View>
            ) : null}

            {(managerApproval.decidedAt || (isClaimantManagement && (claim.submittedAt || claim.createdAt))) ? (
              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>Decided On: </Text>
                <Text style={[styles.fieldValue, { fontWeight: "600" }]}>
                  {formatDateTime(managerApproval.decidedAt || claim.submittedAt || claim.createdAt)}
                </Text>
              </View>
            ) : null}

            {managerApproval.remarks ? (
              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>Decision Remarks: </Text>
                <Text style={[styles.fieldValue, { flex: 1, color: "#334155" }]}>{managerApproval.remarks}</Text>
              </View>
            ) : null}

            {canApprove && !isClaimantManagement && !isFinanceStage ? (
              <View style={styles.approvalBtnRow}>
                <TouchableOpacity
                  style={[styles.approvalBtn, styles.approvalRejectBtn]}
                  onPress={() => setDecisionMode("reject")}
                  disabled={deciding}
                >
                  <XCircle size={15} color="#dc2626" />
                  <Text style={[styles.approvalBtnText, { color: "#dc2626" }]}>Reject</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.approvalBtn, { backgroundColor: "#059669" }]}
                  onPress={() => setDecisionMode("approve")}
                  disabled={deciding}
                >
                  <CheckCircle2 size={15} color="#ffffff" />
                  <Text style={[styles.approvalBtnText, { color: "#ffffff" }]}>Approve</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* 2nd Approval: CFO / Finance Head (Full Payment / Stock Purchase) */}
        {showFinanceCard && effectiveFinanceStatus !== "NOT_REQUIRED" ? (
          <View style={[styles.itemCard, { borderColor: "#fde68a", backgroundColor: "#fffbeb" }]}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flex: 1 }}>
                <ShieldCheck size={16} color="#b45309" />
                <Text style={{ fontSize: 13, fontWeight: "800", color: "#92400e" }}>
                  2nd Approval: CFO / Finance Head
                </Text>
              </View>
              <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, backgroundColor: financeStatusMeta.bg, borderWidth: 1, borderColor: financeStatusMeta.border }}>
                <Text style={{ fontSize: 10, fontWeight: "800", color: financeStatusMeta.color }}>{financeStatusMeta.shortLabel}</Text>
              </View>
            </View>

            <View style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>CFO / Finance Head: </Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.fieldValue, { fontWeight: "800", color: "#0f172a" }]}>
                  {financeApproverName}{financeApproverCode}
                </Text>
                {financeApproverSub ? (
                  <Text style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>{financeApproverSub}</Text>
                ) : null}
              </View>
            </View>

            <View style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>Approval Status: </Text>
              <Text style={[styles.fieldValue, { color: financeStatusMeta.color, fontWeight: "700" }]}>
                {financeStatusMeta.label}
              </Text>
            </View>

            {financeApproval.requestedAt ? (
              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>Requested On: </Text>
                <Text style={styles.fieldValue}>{formatDateTime(financeApproval.requestedAt)}</Text>
              </View>
            ) : null}

            {financeApproval.decidedAt ? (
              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>Decided On: </Text>
                <Text style={[styles.fieldValue, { fontWeight: "600" }]}>{formatDateTime(financeApproval.decidedAt)}</Text>
              </View>
            ) : null}

            {financeApproval.remarks ? (
              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>Decision Remarks: </Text>
                <Text style={[styles.fieldValue, { flex: 1, color: "#334155" }]}>{financeApproval.remarks}</Text>
              </View>
            ) : null}

            {canApprove && isFinanceStage ? (
              <View style={styles.approvalBtnRow}>
                <TouchableOpacity
                  style={[styles.approvalBtn, styles.approvalRejectBtn]}
                  onPress={() => setDecisionMode("reject")}
                  disabled={deciding}
                >
                  <XCircle size={15} color="#dc2626" />
                  <Text style={[styles.approvalBtnText, { color: "#dc2626" }]}>Reject</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.approvalBtn, { backgroundColor: "#059669" }]}
                  onPress={() => setDecisionMode("approve")}
                  disabled={deciding}
                >
                  <CheckCircle2 size={15} color="#ffffff" />
                  <Text style={[styles.approvalBtnText, { color: "#ffffff" }]}>Approve</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* Accounts Admin Approval & Payment Card (Only shown once approved by Reporting Manager & CFO) */}
        {showAccountsCard ? (() => {
          const paymentProofsList = Array.isArray(claim.paymentProofs) && claim.paymentProofs.length > 0
            ? claim.paymentProofs
            : (Array.isArray(claim.disbursement?.paymentProofs) && claim.disbursement.paymentProofs.length > 0
              ? claim.disbursement.paymentProofs
              : (claim.disbursement?.paymentProof?.url ? [claim.disbursement.paymentProof] : []));
          const paymentRemarkText = claim.disbursement?.remarks || (isDisbursedOrPaid ? claim.accountsRemarks : "");
          const isAccDone = isAccountsApproved || isDisbursedOrPaid || rawAccountsApprovalStatus === "APPROVED";

          return (
            <View style={[
              styles.itemCard,
              isDisbursedOrPaid
                ? { borderColor: "#a7f3d0", backgroundColor: "#ecfdf5" }
                : isAccountsApproved
                  ? { borderColor: "#bfdbfe", backgroundColor: "#eff6ff" }
                  : effectiveAccountsStatus === "REJECTED"
                    ? { borderColor: "#fecaca", backgroundColor: "#fef2f2" }
                    : { borderColor: "#e2e8f0", backgroundColor: "#f8fafc" },
            ]}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flex: 1 }}>
                  {isAccDone ? (
                    <CheckCircle2 size={16} color={isDisbursedOrPaid ? "#059669" : "#2563eb"} />
                  ) : effectiveAccountsStatus === "REJECTED" ? (
                    <XCircle size={16} color="#dc2626" />
                  ) : (
                    <Clock size={16} color="#d97706" />
                  )}
                  <Text style={{ fontSize: 13, fontWeight: "800", color: isDisbursedOrPaid ? "#065f46" : isAccountsApproved ? "#1e40af" : effectiveAccountsStatus === "REJECTED" ? "#991b1b" : "#1e293b" }}>
                    Accounts Admin Approval &amp; Payment
                  </Text>
                </View>
                <View style={{
                  paddingHorizontal: 8,
                  paddingVertical: 2,
                  borderRadius: 8,
                  backgroundColor: accountsStatusMeta.bg,
                  borderWidth: 1,
                  borderColor: accountsStatusMeta.border,
                }}>
                  <Text style={{ fontSize: 10, fontWeight: "800", color: accountsStatusMeta.color }}>
                    {accountsStatusMeta.shortLabel}
                  </Text>
                </View>
              </View>

              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>Accounts Status: </Text>
                <Text style={[styles.fieldValue, { color: accountsStatusMeta.color, fontWeight: "800" }]}>
                  {accountsStatusMeta.label}
                </Text>
              </View>

              {isAccDone ? (
                <View style={styles.fieldRow}>
                  <Text style={styles.fieldLabel}>Approved By: </Text>
                  <Text style={[styles.fieldValue, { fontWeight: "800", color: "#0f172a" }]}>
                    {claim.accountsApproval?.approvedByName || claim.accountsApproval?.approvedBy?.name || claim.disbursement?.recordedByName || "Accounts Admin"}
                  </Text>
                </View>
              ) : null}

              {claim.accountsApproval?.approvedAt ? (
                <View style={styles.fieldRow}>
                  <Text style={styles.fieldLabel}>Approved On: </Text>
                  <Text style={styles.fieldValue}>{formatDateTime(claim.accountsApproval.approvedAt)}</Text>
                </View>
              ) : null}

              {claim.accountsApproval?.remarks ? (
                <View style={styles.fieldRow}>
                  <Text style={styles.fieldLabel}>Approval Remark: </Text>
                  <Text style={[styles.fieldValue, { flex: 1, color: "#334155", fontWeight: "600" }]}>
                    {claim.accountsApproval.remarks}
                  </Text>
                </View>
              ) : null}

              {isDisbursedOrPaid ? (
                <>
                  <View style={styles.fieldRow}>
                    <Text style={styles.fieldLabel}>Paid Amount: </Text>
                    <Text style={[styles.fieldValue, { color: "#059669", fontWeight: "800" }]}>
                      ₹{Number(claim.paidAmount || claim.disbursement?.amount || claim.payableAmount || 0).toLocaleString("en-IN")}
                    </Text>
                  </View>
                  <View style={styles.fieldRow}>
                    <Text style={styles.fieldLabel}>Payment Method: </Text>
                    <Text style={[styles.fieldValue, { fontWeight: "700" }]}>
                      {claim.disbursement?.paymentMethod || claim.paymentMethod || "Bank Transfer"}
                    </Text>
                  </View>
                  {(claim.disbursement?.paymentReference || claim.utr || claim.paymentReference) ? (
                    <View style={styles.fieldRow}>
                      <Text style={styles.fieldLabel}>Transaction Ref / UTR: </Text>
                      <Text style={[styles.fieldValue, { fontWeight: "700" }]}>
                        {claim.disbursement?.paymentReference || claim.utr || claim.paymentReference}
                      </Text>
                    </View>
                  ) : null}
                  {(claim.disbursement?.recordedByName || claim.disbursedBy?.name) ? (
                    <View style={styles.fieldRow}>
                      <Text style={styles.fieldLabel}>Paid / Recorded By: </Text>
                      <Text style={[styles.fieldValue, { fontWeight: "700" }]}>
                        {claim.disbursement?.recordedByName || claim.disbursedBy?.name}
                      </Text>
                    </View>
                  ) : null}
                </>
              ) : null}

              {isDisbursedOrPaid && (claim.disbursedAt || claim.paymentDate || claim.disbursement?.paymentDate) ? (
                <View style={styles.fieldRow}>
                  <Text style={styles.fieldLabel}>Paid On: </Text>
                  <Text style={[styles.fieldValue, { color: "#059669", fontWeight: "800" }]}>
                    {formatDateTime(claim.disbursedAt || claim.paymentDate || claim.disbursement?.paymentDate)}
                  </Text>
                </View>
              ) : null}

              {effectiveAccountsStatus === "REJECTED" ? (
                <>
                  {(claim.rejection?.rejectedByName || claim.rejection?.rejectedBy?.name) ? (
                    <View style={styles.fieldRow}>
                      <Text style={styles.fieldLabel}>Rejected By: </Text>
                      <Text style={[styles.fieldValue, { color: "#dc2626", fontWeight: "800" }]}>
                        {claim.rejection?.rejectedByName || claim.rejection?.rejectedBy?.name}
                      </Text>
                    </View>
                  ) : null}
                  {claim.rejection?.rejectedAt ? (
                    <View style={styles.fieldRow}>
                      <Text style={styles.fieldLabel}>Rejected On: </Text>
                      <Text style={[styles.fieldValue, { color: "#dc2626", fontWeight: "700" }]}>
                        {formatDateTime(claim.rejection.rejectedAt)}
                      </Text>
                    </View>
                  ) : null}
                  {(claim.rejection?.reason || claim.accountsRemarks) ? (
                    <View style={styles.fieldRow}>
                      <Text style={styles.fieldLabel}>Rejection Reason: </Text>
                      <Text style={[styles.fieldValue, { flex: 1, color: "#991b1b", fontWeight: "700" }]}>
                        {claim.rejection?.reason || claim.accountsRemarks}
                      </Text>
                    </View>
                  ) : null}
                </>
              ) : null}

              {((claim.pettyCashSummary?.debitedAmount || 0) > 0 || (claim.pettyCash?.debitedPaise || 0) > 0) ? (
                <View style={styles.fieldRow}>
                  <Text style={styles.fieldLabel}>Petty Cash Wallet: </Text>
                  <Text style={[styles.fieldValue, { flex: 1, color: isDisbursedOrPaid ? "#059669" : "#b45309", fontWeight: "700" }]}>
                    {isDisbursedOrPaid
                      ? `Credited ₹${Number(claim.pettyCashSummary?.creditedAmount || claim.paidAmount || claim.payableAmount || 0).toLocaleString("en-IN")} to Petty Cash`
                      : "Amount added to Petty Cash only when Paid by Accounts Admin"}
                  </Text>
                </View>
              ) : null}

              {isDisbursedOrPaid && paymentRemarkText ? (
                <View style={styles.fieldRow}>
                  <Text style={styles.fieldLabel}>Payment Remark: </Text>
                  <Text style={[styles.fieldValue, { flex: 1, color: "#334155", fontWeight: "600" }]}>
                    {paymentRemarkText}
                  </Text>
                </View>
              ) : null}

              {paymentProofsList.length > 0 ? (
                <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: "#a7f3d0", gap: 6 }}>
                  <Text style={{ fontSize: 11, fontWeight: "800", color: "#065f46" }}>
                    🧾 Payment Confirmation Proof ({paymentProofsList.length})
                  </Text>
                  {paymentProofsList.map((pf, pIdx) => {
                    const pUri = resolveProofImageUrl(pf);
                    const pTitle = pf.name || `Payment Confirmation Proof #${pIdx + 1}`;
                    const isPdf = pf.type === "application/pdf" || (pTitle && pTitle.toLowerCase().endsWith(".pdf"));
                    return (
                      <TouchableOpacity
                        key={pIdx}
                        style={[styles.detailAttCard, { backgroundColor: "#ffffff", borderColor: "#a7f3d0" }]}
                        activeOpacity={0.75}
                        onPress={() => {
                          if (!pUri) return;
                          if (isPdf) {
                            Linking.openURL(pUri).catch(() => {
                              Alert.alert("Document", "Unable to open PDF document.");
                            });
                          } else {
                            setPhotoPreviewModal({
                              visible: true,
                              uri: pUri,
                              title: pTitle,
                            });
                          }
                        }}
                      >
                        {isPdf ? (
                          <FileText size={16} color="#dc2626" />
                        ) : (
                          <FileCheck size={16} color="#059669" />
                        )}
                        <Text style={styles.detailAttName} numberOfLines={1}>{pTitle}</Text>
                        <View style={[styles.detailAttEyePill, { backgroundColor: "#d1fae5" }]}>
                          <Eye size={11} color="#059669" />
                          <Text style={[styles.detailAttEyeText, { color: "#059669" }]}>View</Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ) : null}
            </View>
          );
        })() : null}

        {/* ======================================================== */}
        {/* STEP 6: CALCULATION BREAKDOWN & POLICY EXPLANATION       */}
        {/* ======================================================== */}
        <Text style={styles.sectionTitle}>
          6. Calculation Breakdown &amp; Policy Explanation
        </Text>
        <View style={[
          styles.calcCard,
          hasExcess
            ? { backgroundColor: "#fff1f2", borderColor: "#fecdd3" }
            : { backgroundColor: "#f0fdf4", borderColor: "#bbf7d0" }
        ]}>
          {/* Summary Figures Grid */}
          <View style={styles.figuresGrid}>
            <View style={styles.figureItem}>
              <Text style={styles.figureLabel}>CLAIMED</Text>
              <Text style={styles.figureValue}>₹{grandReq}</Text>
            </View>
            <View style={styles.figureItem}>
              <Text style={[styles.figureLabel, { color: "#6366f1" }]}>POLICY LIMIT</Text>
              <Text style={[styles.figureValue, { color: "#4f46e5" }]}>
                {(isFood || isLodging) ? `₹${grandLimit > 0 ? grandLimit : grandAllow}` : (grandLimit > 0 ? `₹${grandLimit}` : "Actuals")}
              </Text>
            </View>
            <View style={styles.figureItem}>
              <Text style={[styles.figureLabel, { color: "#059669" }]}>ALLOWED</Text>
              <Text style={[styles.figureValue, { color: "#059669" }]}>₹{grandAllow}</Text>
            </View>
            <View style={styles.figureItem}>
              <Text style={[styles.figureLabel, { color: "#dc2626" }]}>EXCESS</Text>
              <Text style={[styles.figureValue, { color: hasExcess ? "#dc2626" : "#64748b" }]}>
                ₹{grandExc}
              </Text>
            </View>
            <View style={styles.figureItem}>
              <Text style={[styles.figureLabel, { color: "#4f46e5" }]}>PAYABLE</Text>
              <Text style={[styles.figureValue, { color: "#4f46e5" }]}>₹{payAmt}</Text>
            </View>
          </View>

          {/* Structured Policy Explanation */}
          {(isLodging || (isFood && combinedEntries.length === 1)) && empLines.length > 0 ? (
            <View style={{ gap: 6, marginTop: 4 }}>
              {/* 1. One day each employee limit */}
              <View style={styles.calcSubBox}>
                <Text style={{ fontSize: 10, fontWeight: "800", color: "#64748b", textTransform: "uppercase", marginBottom: 3 }}>
                  👤 Individual Limits Per Day ({empLines.length} {empLines.length > 1 ? "Employees" : "Employee"}):
                </Text>
                {empLines.map((line, lIdx) => (
                  <View key={lIdx} style={{ flexDirection: "row", alignItems: "center", gap: 4, marginVertical: 1 }}>
                    <Text style={{ color: "#4f46e5", fontWeight: "900" }}>•</Text>
                    <Text style={{ fontSize: 11, fontWeight: "700", color: "#1e293b" }}>{line}</Text>
                  </View>
                ))}
              </View>

              {/* 2. Combined Policy Limit */}
              <View style={styles.calcCombinedBox}>
                <Text style={{ fontSize: 11, fontWeight: "800", color: "#312e81", flexShrink: 1 }}>
                  ⚖️ {isLodging ? (numEmployees > 1 ? "Combined Stay Policy Limit:" : "Stay Policy Limit:") : (numEmployees > 1 ? "Combined Daily Policy Limit:" : "Daily Policy Limit:")}
                </Text>
                <View style={{ backgroundColor: "#ffffff", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, borderWidth: 1, borderColor: "#c7d2fe" }}>
                  <Text style={{ fontSize: 12, fontWeight: "900", color: "#4338ca" }}>
                    ₹{isLodging
                      ? (Number(claim.lodgingSummary?.policyLimit) || Number(combinedEntries.find(e => e.expenseType === "LODGING" || e.expenseType === "LODGING_EXPENSE")?.policyLimit) || (grandLimit > 0 ? grandLimit : grandAllow))
                      : ((isFood || isLodging) ? (grandLimit > 0 ? grandLimit : grandAllow) : grandLimit)} {isLodging ? `(${days} ${days === 1 ? "night" : "nights"})` : ""}
                  </Text>
                </View>
              </View>
              {isLodging && claim.includeFood && claim.foodSummary ? (
                <View style={styles.calcCombinedBox}>
                  <Text style={{ fontSize: 11, fontWeight: "800", color: "#312e81", flexShrink: 1 }}>
                    🍽️ {numEmployees > 1 ? "Combined Food Policy Limit:" : "Food Policy Limit:"}
                  </Text>
                  <View style={{ backgroundColor: "#ffffff", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, borderWidth: 1, borderColor: "#c7d2fe" }}>
                    <Text style={{ fontSize: 12, fontWeight: "900", color: "#4338ca" }}>
                      ₹{claim.foodSummary.remainingEntitlement ?? claim.foodSummary.totalEntitlement ?? 0} ({claim.foodSummary.foodDays || claim.foodDays || days + 1} {(claim.foodSummary.foodDays || claim.foodDays || days + 1) === 1 ? "day" : "days"})
                    </Text>
                  </View>
                </View>
              ) : null}

              {/* 3. Allowed & Excess Calculation Breakdown */}
              <View style={[
                styles.calcOutcomeBox,
                hasExcess
                  ? { backgroundColor: "#fef2f2", borderColor: "#fecaca" }
                  : { backgroundColor: "#f0fdf4", borderColor: "#bbf7d0" }
              ]}>
                <Text style={{ fontSize: 11, fontWeight: "800", color: hasExcess ? "#991b1b" : "#065f46", lineHeight: 16 }}>
                  {hasExcess ? "⚠️ " : "✅ "}
                  {calcOutcomeText}
                </Text>
              </View>
            </View>
          ) : (
            <View style={[styles.calcOutcomeBox, { backgroundColor: "#ffffff", borderColor: "#e2e8f0", marginTop: 4 }]}>
              <Text style={{ fontSize: 11, fontWeight: "700", color: "#1e293b", lineHeight: 16 }}>
                💡 {claim.plainExplanation || (hasExcess
                  ? `Policy limit is ₹${grandLimit} and claimed value is ₹${grandReq}. Therefore, ₹${grandAllow} is allowed and ₹${grandExc} is excess.`
                  : `Claimed bill: ₹${grandReq}. All payment of ₹${grandAllow} is fully allowed.`)}
              </Text>
            </View>
          )}

          {/* Applied Rules */}
          {appliedRules.length > 0 && (
            <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: "rgba(0,0,0,0.06)", gap: 3 }}>
              <Text style={{ fontSize: 10, fontWeight: "800", color: "#64748b", textTransform: "uppercase" }}>
                {appliedRules.length > 1 ? "Applied Rules by Type:" : "Applied Rule:"}
              </Text>
              {appliedRules.map((r, rIdx) => (
                <View key={rIdx} style={{ flexDirection: "row", alignItems: "flex-start", gap: 4 }}>
                  <Text style={{ fontSize: 11, fontWeight: "800", color: "#0f172a" }}>• {r.title}:</Text>
                  <Text style={{ fontSize: 11, fontWeight: "600", color: "#475569", flex: 1 }}>{r.formula}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* ======================================================== */}
        {/* STEP 7: SERVICE REPORTS                                  */}
        {/* ======================================================== */}
        {serviceReportsList.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>
              7. Service Reports
            </Text>

            {/* 📑 Service Reports */}
            <View style={styles.itemCard}>
              <Text style={{ fontSize: 12, fontWeight: "800", color: "#92400e", marginBottom: 6 }}>
                📑 Service Reports ({serviceReportsList.length})
              </Text>
              {serviceReportsList.length === 0 ? (
                <Text style={{ fontSize: 12, color: "#94a3b8" }}>No service reports attached.</Text>
              ) : (
                <View style={{ gap: 6 }}>
                  {serviceReportsList.map((doc, docIdx) => {
                    const previewUri = resolveProofImageUrl(doc);
                    const isImg = doc.type && doc.type.startsWith("image/");
                    const isPdf = doc.type === "application/pdf" || (doc.name && doc.name.toLowerCase().endsWith(".pdf"));
                    const isOdf = (doc.name && doc.name.toLowerCase().match(/\.(odt|ods|odp)$/)) || (doc.type && doc.type.includes("opendocument"));
                    const reportTitle = doc.name || `Service Report #${docIdx + 1}`;
                    return (
                      <TouchableOpacity
                        key={docIdx}
                        style={styles.detailAttCard}
                        activeOpacity={0.7}
                        onPress={() => {
                          if (!isImg && previewUri) {
                            Linking.openURL(previewUri).catch(() => {
                              Alert.alert("Document", "Unable to open document.");
                            });
                          } else if (previewUri) {
                            setPhotoPreviewModal({
                              visible: true,
                              uri: previewUri,
                              title: reportTitle,
                            });
                          }
                        }}
                      >
                        {isImg && previewUri ? (
                          <Image source={{ uri: previewUri }} style={styles.detailAttThumb} resizeMode="cover" />
                        ) : (
                          <View style={[styles.detailAttIconPlaceholder, isOdf ? { backgroundColor: "#fef3c7" } : isPdf ? { backgroundColor: "#fee2e2" } : {}]}>
                            <FileText size={16} color={isOdf ? "#d97706" : isPdf ? "#dc2626" : "#4f46e5"} />
                          </View>
                        )}
                        <View style={{ flex: 1, marginLeft: 8 }}>
                          <Text style={styles.detailAttName} numberOfLines={1}>{reportTitle}</Text>
                          <Text style={styles.detailAttSub}>
                            {isImg
                              ? "Image • Tap to preview"
                              : isOdf
                                ? "ODF Service Report • Tap to open"
                                : isPdf
                                  ? "PDF Service Report • Tap to open"
                                  : "Service Report Document • Tap to open"}
                          </Text>
                        </View>
                        <View style={styles.detailAttEyePill}>
                          <Eye size={12} color="#4f46e5" />
                          <Text style={styles.detailAttEyeText}>View</Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </View>
          </>
        )}

        {/* ======================================================== */}
        {/* STEP 8: CLAIM STATUS & APPROVAL JOURNEY                  */}
        {/* ======================================================== */}
        <Text style={styles.sectionTitle}>
          8. Claim Status &amp; Approval Journey
        </Text>

        {/* Status Box */}
        <View style={styles.statusBox}>
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Claim Number</Text>
            <Text style={styles.statusValue}>{claim.claimNumber || claim.claimId || "Draft Claim"}</Text>
          </View>
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Overall Status</Text>
            <Text style={[styles.statusValue, { color: statusInfo.color }]}>
              {isDisbursedOrPaid
                ? "PAID"
                : isAccountsApproved
                  ? "APPROVED BY ACCOUNTS (PAYMENT PENDING)"
                  : statusInfo.label.toUpperCase()}
            </Text>
          </View>
          {showApprovalCard && !isClaimantManagement && statusUpper !== "DRAFT" ? (
            <View style={styles.statusRow}>
              <Text style={styles.statusLabel}>
                {showFinanceCard ? "1st Approval (Reporting Manager)" : "Reporting Manager Approval"}
              </Text>
              <Text style={[styles.statusValue, { color: approvalStatusMeta.color }]}>
                {approvalStatusMeta.shortLabel.toUpperCase()} by {approverName}
              </Text>
            </View>
          ) : null}
          {showFinanceCard && effectiveFinanceStatus !== "NOT_REQUIRED" ? (
            <View style={styles.statusRow}>
              <Text style={styles.statusLabel}>2nd Approval (CFO / Finance Head)</Text>
              <Text style={[styles.statusValue, { color: financeStatusMeta.color }]}>
                {financeStatusMeta.shortLabel.toUpperCase()} by {financeApproverName}
              </Text>
            </View>
          ) : null}
          {showAccountsCard ? (
            <View style={styles.statusRow}>
              <Text style={styles.statusLabel}>Accounts Admin Approval</Text>
              <Text style={[styles.statusValue, { color: accountsStatusMeta.color }]}>
                {effectiveAccountsStatus === "APPROVED_PAYMENT_PENDING" || effectiveAccountsStatus === "PAID"
                  ? `APPROVED by ${claim.accountsApproval?.approvedByName || claim.accountsApproval?.approvedBy?.name || "Accounts Admin"}${!isDisbursedOrPaid ? " (Awaiting Payment)" : ""}`
                  : accountsStatusMeta.shortLabel.toUpperCase()}
              </Text>
            </View>
          ) : null}
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Payment</Text>
            <Text
              style={[
                styles.statusValue,
                {
                  color: isDisbursedOrPaid
                    ? "#059669"
                    : statusUpper === "REJECTED" || paymentUpper === "REJECTED"
                      ? "#dc2626"
                      : "#d97706",
                },
              ]}
            >
              {isDisbursedOrPaid
                ? "PAID"
                : statusUpper === "REJECTED" || paymentUpper === "REJECTED"
                  ? "REJECTED"
                  : "UNPAID"}
            </Text>
          </View>
          {isDisbursedOrPaid && (claim.disbursedAt || claim.paymentDate || claim.disbursement?.paymentDate) ? (
            <View style={styles.statusRow}>
              <Text style={styles.statusLabel}>Paid Date</Text>
              <Text style={[styles.statusValue, { color: "#059669" }]}>
                {formatDateTime(claim.disbursedAt || claim.paymentDate || claim.disbursement?.paymentDate)}
              </Text>
            </View>
          ) : null}
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Applied Date &amp; Time</Text>
            <Text style={styles.statusValue}>
              {claim.submittedAt ? formatDateTime(claim.submittedAt) : formatDateTime(claim.createdAt)}
            </Text>
          </View>
        </View>

        {/* Workflow Journey Stepper */}
        {claim.status !== "DRAFT" ? (() => {
          const journeySteps = [];
          const submitterName = claim.submittedByName || claim.submittedBy?.name || ecList[0]?.employee?.name || "Employee";
          const submitterCode = claim.submittedBy?.employeeIdCode || ecList[0]?.employee?.employeeIdCode || "";
          journeySteps.push({
            key: "submitted",
            title: "Claim Submitted",
            badgeLabel: "Submitted",
            badgeColor: "#059669",
            badgeBg: "#d1fae5",
            badgeBorder: "#a7f3d0",
            state: "COMPLETED",
            desc: `Submitted by ${submitterName}${submitterCode ? ` (${submitterCode})` : ""} on ${claim.submittedAt ? formatDateTime(claim.submittedAt) : formatDateTime(claim.createdAt)} for ${formatINR(grandReq)}.`,
          });

          if (showApprovalCard && !isClaimantManagement) {
            const firstDone = effectiveApprovalStatus === "APPROVED";
            const firstRej = effectiveApprovalStatus === "REJECTED";
            const fpRoutingDefault = isFullPayment && firstDone && fullPaymentProofs.length > 0
              ? "Full payment requested with supporting proofs. Routed directly to Accounts for review of proofs and disbursement."
              : "";
            const firstRemark = managerApproval.remarks || claim.fullPayment?.decisionRemarks || fpRoutingDefault;
            const firstDecidedTime = managerApproval.decidedAt || claim.fullPayment?.decidedAt || (firstDone ? claim.submittedAt : null);
            journeySteps.push({
              key: "first_approval",
              title: `${showFinanceCard ? "1st Approval: " : ""}Reporting Manager${isFullPayment ? " (Full Payment)" : ""}`,
              badgeLabel: firstDone ? "Approved" : firstRej ? "Rejected" : "Pending",
              badgeColor: firstDone ? "#059669" : firstRej ? "#dc2626" : "#d97706",
              badgeBg: firstDone ? "#d1fae5" : firstRej ? "#fee2e2" : "#fef3c7",
              badgeBorder: firstDone ? "#a7f3d0" : firstRej ? "#fecaca" : "#fde68a",
              state: firstDone ? "COMPLETED" : firstRej ? "REJECTED" : "ACTIVE",
              desc: firstDone
                ? `Approved by ${approverName}${approverCode}${firstDecidedTime ? ` on ${formatDateTime(firstDecidedTime)}` : ""}.${firstRemark ? ` Remark: "${firstRemark}"` : ""}`
                : firstRej
                  ? `Rejected by ${approverName}${approverCode}${firstRemark ? `: "${firstRemark}"` : ""}`
                  : `Pending approval from ${approverName}${approverCode}.`,
            });
          }

          if (showFinanceCard && effectiveFinanceStatus !== "NOT_REQUIRED") {
            const secDone = effectiveFinanceStatus === "APPROVED";
            const secRej = effectiveFinanceStatus === "REJECTED";
            const secCancel = effectiveFinanceStatus === "CANCELLED";
            journeySteps.push({
              key: "second_approval",
              title: "2nd Approval: CFO / Finance Head",
              badgeLabel: secDone ? "Approved" : secRej ? "Rejected" : secCancel ? "Cancelled" : "Pending",
              badgeColor: secDone ? "#059669" : secRej ? "#dc2626" : secCancel ? "#64748b" : "#b45309",
              badgeBg: secDone ? "#d1fae5" : secRej ? "#fee2e2" : secCancel ? "#f1f5f9" : "#fef3c7",
              badgeBorder: secDone ? "#a7f3d0" : secRej ? "#fecaca" : secCancel ? "#cbd5e1" : "#fde68a",
              state: secDone ? "COMPLETED" : secRej ? "REJECTED" : isFinanceStage ? "ACTIVE" : "PENDING",
              desc: secDone
                ? `Approved by ${financeApproverName}${financeApproverCode}${financeApproval.decidedAt ? ` on ${formatDateTime(financeApproval.decidedAt)}` : ""}.${financeApproval.remarks ? ` Remark: "${financeApproval.remarks}"` : ""}`
                : secRej
                  ? `Rejected by ${financeApproverName}${financeApproverCode}${financeApproval.remarks ? `: "${financeApproval.remarks}"` : ""}`
                  : secCancel
                    ? "Cancelled because 1st approval was rejected."
                    : isFinanceStage
                      ? `Pending 2nd approval from ${financeApproverName}${financeApproverCode} (1st approval completed).`
                      : `Pending (will be sent to ${financeApproverName}${financeApproverCode} after 1st approval).`,
            });
          }

          const accDone =
            isAccountsApproved ||
            isDisbursedOrPaid ||
            rawAccountsApprovalStatus === "APPROVED" ||
            effectiveAccountsStatus === "APPROVED_PAYMENT_PENDING" ||
            effectiveAccountsStatus === "PAID";
          const accRej = effectiveAccountsStatus === "REJECTED";
          const accCancel = !showAccountsCard && isRejectedClaim;
          const accByName = claim.accountsApproval?.approvedByName || claim.accountsApproval?.approvedBy?.name || "Accounts Admin";
          const accByCode = claim.accountsApproval?.approvedBy?.employeeIdCode ? ` (${claim.accountsApproval.approvedBy.employeeIdCode})` : "";
          journeySteps.push({
            key: "accounts_approval",
            title: "Accounts Admin Approval (Step 1)",
            badgeLabel: accDone ? "Approved" : accRej ? "Rejected" : accCancel ? "Cancelled" : "Pending",
            badgeColor: accDone ? "#059669" : accRej ? "#dc2626" : accCancel ? "#64748b" : "#d97706",
            badgeBg: accDone ? "#d1fae5" : accRej ? "#fee2e2" : accCancel ? "#f1f5f9" : "#fef3c7",
            badgeBorder: accDone ? "#a7f3d0" : accRej ? "#fecaca" : accCancel ? "#cbd5e1" : "#fde68a",
            state: accDone ? "COMPLETED" : accRej ? "REJECTED" : statusUpper === "SUBMITTED" ? "ACTIVE" : "PENDING",
            desc: accDone
              ? `Verified & approved by ${accByName}${accByCode}${claim.accountsApproval?.approvedAt ? ` on ${formatDateTime(claim.accountsApproval.approvedAt)}` : ""}.${claim.accountsApproval?.remarks ? ` Remark: "${claim.accountsApproval.remarks}"` : ""}`
              : accRej
                ? `Rejected: ${claim.rejection?.reason || claim.rejectionReason || claim.accountsRemarks || claim.remarks || "Claim not eligible"}`
                : accCancel
                  ? "Cancelled due to rejection in prior approval stage."
                  : statusUpper === "SUBMITTED"
                    ? "Pending verification & approval by Accounts Admin."
                    : "Pending (waiting for prior approval stages to complete).",
          });

          const payDone = effectivePaymentStageStatus === "PAID";
          const payCancel = effectivePaymentStageStatus === "CANCELLED";
          journeySteps.push({
            key: "payment_settlement",
            title: "Payment & Settlement (Step 2)",
            badgeLabel: payDone ? "Paid" : payCancel ? "Cancelled" : isAccountsApproved ? "Awaiting Payment" : "Pending",
            badgeColor: payDone ? "#059669" : payCancel ? "#64748b" : isAccountsApproved ? "#2563eb" : "#d97706",
            badgeBg: payDone ? "#d1fae5" : payCancel ? "#f1f5f9" : isAccountsApproved ? "#dbeafe" : "#fef3c7",
            badgeBorder: payDone ? "#a7f3d0" : payCancel ? "#cbd5e1" : isAccountsApproved ? "#bfdbfe" : "#fde68a",
            state: payDone ? "COMPLETED" : payCancel ? "REJECTED" : isAccountsApproved ? "ACTIVE" : "PENDING",
            desc: payDone
              ? `Paid ${formatINR(claim.paidAmount || claim.disbursement?.amount || payAmt)} via ${claim.paymentMethod || claim.disbursement?.paymentMethod || "Bank Transfer"}${claim.disbursedAt || claim.paymentDate ? ` on ${formatDateTime(claim.disbursedAt || claim.paymentDate)}` : ""}${claim.disbursement?.remarks || claim.accountsRemarks ? ` (${claim.disbursement?.remarks || claim.accountsRemarks})` : ""}.`
              : payCancel
                ? "Payment cancelled due to claim rejection."
                : isAccountsApproved
                  ? `Approved for ${formatINR(payAmt)} — awaiting disbursement & UTR recording by Accounts Admin.`
                  : "Pending (awaiting Accounts Admin approval before payment).",
          });

          return (
            <View style={styles.workflowCard}>
              <Text style={styles.workflowTitle}>Claim Journey</Text>
              {journeySteps.map((step, sIdx) => {
                const isLast = sIdx === journeySteps.length - 1;
                const circleStyle =
                  step.state === "COMPLETED"
                    ? styles.stepCompleted
                    : step.state === "REJECTED"
                      ? styles.stepRejected
                      : step.state === "ACTIVE"
                        ? styles.stepInProgressBlue
                        : styles.stepInProgress;
                return (
                  <View key={step.key}>
                    <View style={styles.workflowStepRow}>
                      <View style={[styles.stepCircle, circleStyle]}>
                        <Text style={{ fontSize: 11, fontWeight: "900", color: "#ffffff" }}>
                          {sIdx + 1}
                        </Text>
                      </View>
                      <View style={styles.stepContent}>
                        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 6 }}>
                          <Text style={[styles.stepName, { flex: 1 }]}>
                            {step.title}
                          </Text>
                          <View
                            style={{
                              paddingHorizontal: 7,
                              paddingVertical: 1.5,
                              borderRadius: 6,
                              backgroundColor: step.badgeBg,
                              borderWidth: 1,
                              borderColor: step.badgeBorder,
                            }}
                          >
                            <Text style={{ fontSize: 9.5, fontWeight: "800", color: step.badgeColor }}>
                              {step.badgeLabel}
                            </Text>
                          </View>
                        </View>
                        <Text style={styles.stepDesc}>{step.desc}</Text>
                      </View>
                    </View>
                    {!isLast && <View style={styles.stepConnector} />}
                  </View>
                );
              })}
            </View>
          );
        })() : null}

        {/* ======================================================== */}
        {/* DOWNLOAD PDF ACTION                                      */}
        {/* ======================================================== */}
        <View style={styles.downloadCardContainer}>
          <TouchableOpacity
            style={styles.downloadClaimPdfBtn}
            onPress={() => handleDownloadPdf("bottom")}
            disabled={downloadingPdf}
            activeOpacity={0.8}
          >
            {activeDownloadBtn === "bottom" ? (
              <ActivityIndicator color="#ffffff" size="small" />
            ) : (
              <Download size={18} color="#ffffff" />
            )}
            <Text style={styles.downloadClaimPdfBtnText}>
              {activeDownloadBtn === "bottom" ? "Generating Claim PDF..." : "Download Claim (PDF)"}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Action Buttons for editable claims (editable until approved, delete only for drafts/rejected) */}
        {isEditable ? (
          <View style={styles.actionRow}>
            {isDeletable ? (
              <TouchableOpacity
                style={styles.deleteActionBtn}
                onPress={handleDelete}
                disabled={submitting}
              >
                <Trash2 size={16} color="#dc2626" />
                <Text style={styles.deleteActionBtnText}>Delete</Text>
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity
              style={[styles.editBtn, !isDeletable && { flex: 1 }]}
              onPress={() =>
                navigation.navigate("CreateExpenseClaim", {
                  claimId: claim._id,
                  mode: isLodging ? "LODGING" : "NORMAL",
                })
              }
            >
              <Pencil size={17} color="#ffffff" />
              <Text style={styles.editBtnText}>
                {claim.status === "DRAFT"
                  ? "Edit Draft"
                  : ["SUBMITTED", "APPROVAL_PENDING", "HR_PENDING", "FULL_PAYMENT_PENDING", "ACCOUNTS_PENDING"].includes(statusUpper)
                    ? "Edit Claim"
                    : "Edit & Resubmit"}
              </Text>
            </TouchableOpacity>

            {claim.status === "DRAFT" || claim.status === "RETURNED" || statusUpper === "REJECTED" || statusUpper === "HR_REJECTED" || statusUpper === "ACCOUNTS_REJECTED" ? (
              <TouchableOpacity
                style={styles.submitBtn}
                onPress={handleSubmit}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <Send size={17} color="#ffffff" />
                )}
                <Text style={styles.submitBtnText}>
                  {statusUpper === "REJECTED" || statusUpper === "HR_REJECTED" || statusUpper === "ACCOUNTS_REJECTED"
                    ? "Resubmit"
                    : "Submit Claim"}
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}
      </ScrollView>

      {/* High-Resolution Photo Preview Modal */}
      <Modal
        visible={photoPreviewModal.visible}
        transparent
        animationType="fade"
        onRequestClose={() => setPhotoPreviewModal({ visible: false, uri: "", title: "" })}
      >
        <View style={styles.photoModalOverlay}>
          <View style={styles.photoModalContainer}>
            <View style={styles.photoModalHeader}>
              <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 8 }}>
                <ImageIcon size={18} color="#ffffff" />
                <Text style={styles.photoModalTitle} numberOfLines={1}>
                  {photoPreviewModal.title || "Proof Document Preview"}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.photoModalCloseBtn}
                onPress={() => setPhotoPreviewModal({ visible: false, uri: "", title: "" })}
              >
                <X size={18} color="#ffffff" />
              </TouchableOpacity>
            </View>
            <View style={styles.photoModalBody}>
              {photoPreviewModal.uri ? (
                <Image
                  source={{ uri: resolveProofImageUrl(photoPreviewModal.uri) }}
                  style={styles.photoModalImage}
                  resizeMode="contain"
                />
              ) : (
                <View style={styles.photoModalNoImg}>
                  <Text style={styles.photoModalNoImgText}>No image preview available</Text>
                </View>
              )}
            </View>
          </View>
        </View>
      </Modal>

      {/* Approver decision modal */}
      <Modal visible={!!decisionMode} transparent animationType="fade" onRequestClose={closeDecision}>
        <View style={styles.decisionOverlay}>
          <View style={styles.decisionCard}>
            <Text style={styles.decisionTitle}>
              {decisionMode === "reject" ? "Reject Claim" : "Approve Claim"}
            </Text>
            <Text style={styles.decisionSub}>
              {decisionMode === "reject"
                ? "The claim will be rejected and returned to the employee."
                : (isFinanceStage
                  ? "2nd approval (CFO / Finance Head): the claim will be sent to Accounts for payment."
                  : "1st approval: Full Payment / Stock Purchase claims go to the CFO / Finance Head for 2nd approval; others go to Accounts.")}
            </Text>
            <TextInput
              style={styles.decisionInput}
              placeholder={decisionMode === "reject" ? "Reason for rejection (required)" : "Approval remark (required)"}
              placeholderTextColor="#94a3b8"
              value={decisionRemark}
              onChangeText={setDecisionRemark}
              multiline
              maxLength={500}
            />
            <View style={styles.approvalBtnRow}>
              <TouchableOpacity
                style={[styles.approvalBtn, { backgroundColor: "#f1f5f9" }]}
                onPress={closeDecision}
                disabled={deciding}
              >
                <Text style={[styles.approvalBtnText, { color: "#475569" }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.approvalBtn, { backgroundColor: decisionMode === "reject" ? "#dc2626" : "#059669" }]}
                onPress={handleDecision}
                disabled={deciding}
              >
                {deciding ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <Text style={[styles.approvalBtnText, { color: "#ffffff" }]}>
                    {decisionMode === "reject" ? "Reject" : "Approve"}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <HRModuleFooter navigation={navigation} currentScreen="expenseClaim" />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  approvalBtnRow: { flexDirection: "row", gap: 10, marginTop: 12 },
  approvalBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 11,
    borderRadius: 12,
  },
  approvalRejectBtn: { backgroundColor: "#fef2f2", borderWidth: 1, borderColor: "#fecaca" },
  approvalBtnText: { fontSize: 13, fontWeight: "800" },
  decisionOverlay: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.55)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  decisionCard: { width: "100%", maxWidth: 420, backgroundColor: "#ffffff", borderRadius: 18, padding: 18 },
  decisionTitle: { fontSize: 16, fontWeight: "800", color: "#0f172a" },
  decisionSub: { fontSize: 12, color: "#64748b", marginTop: 4, marginBottom: 12 },
  decisionInput: {
    minHeight: 80,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    padding: 12,
    fontSize: 13,
    color: "#0f172a",
    textAlignVertical: "top",
    backgroundColor: "#f8fafc",
  },
  container: { flex: 1, backgroundColor: "#f1f5f9" },
  scrollContent: { padding: 16, paddingBottom: 100 },
  loadingBox: { flex: 1, justifyContent: "center", alignItems: "center" },
  statusBox: {
    backgroundColor: "#eef2ff",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#c7d2fe",
  },
  statusRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 8, paddingVertical: 3 },
  statusLabel: { fontSize: 12, color: "#4f46e5", fontWeight: "700" },
  statusValue: { fontSize: 12, color: "#312e81", fontWeight: "800", textAlign: "right", flexShrink: 1 },
  sectionTitle: { fontSize: 14, fontWeight: "800", color: "#0f172a", marginTop: 18, marginBottom: 8 },
  sectionHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 18, marginBottom: 8 },
  entryCountBadge: { backgroundColor: "#eef2ff", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, borderWidth: 1, borderColor: "#c7d2fe" },
  entryCountBadgeText: { fontSize: 10, fontWeight: "800", color: "#4f46e5" },
  itemCard: { backgroundColor: "#ffffff", borderRadius: 14, padding: 14, borderWidth: 1, borderColor: "#e2e8f0", marginBottom: 10 },
  inputLabel: { fontSize: 11, fontWeight: "700", color: "#64748b" },
  slotCard: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#ffffff", borderRadius: 12, padding: 10, borderWidth: 1, borderColor: "#e2e8f0", marginBottom: 6 },
  slotAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: "#eef2ff", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#c7d2fe" },
  slotAvatarText: { fontSize: 11, fontWeight: "800", color: "#4f46e5" },
  slotLabel: { fontSize: 10, fontWeight: "700", color: "#64748b" },
  slotName: { fontSize: 13, fontWeight: "800", color: "#0f172a", marginTop: 1 },
  slotMeta: { fontSize: 11, color: "#64748b", marginTop: 1 },
  fieldRow: { flexDirection: "row", alignItems: "flex-start", flexWrap: "wrap", gap: 6, marginVertical: 3 },
  fieldLabel: { fontSize: 12, fontWeight: "700", color: "#475569" },
  fieldValue: { fontSize: 12, fontWeight: "800", color: "#0f172a", flexShrink: 1 },
  entryCard: { backgroundColor: "#ffffff", borderRadius: 14, padding: 14, borderWidth: 1, borderColor: "#e2e8f0", marginBottom: 10 },
  entryCardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6, marginBottom: 10 },
  entryNumberPill: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3.5, borderRadius: 6, backgroundColor: "#eef2ff", justifyContent: "center" },
  entryNumberPillText: { fontSize: 10.5, fontWeight: "800", color: "#4f46e5" },
  entryCardTitle: { fontSize: 13, fontWeight: "800", color: "#0f172a", flexShrink: 1 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1 },
  statusBadgeText: { fontSize: 10, fontWeight: "800" },
  figuresGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, backgroundColor: "#f8fafc", borderRadius: 10, padding: 8, borderWidth: 1, borderColor: "#f1f5f9", justifyContent: "space-around", marginVertical: 8 },
  figureItem: { alignItems: "center", minWidth: 58, flexGrow: 1 },
  figureLabel: { fontSize: 9, fontWeight: "800", color: "#64748b" },
  figureValue: { fontSize: 12, fontWeight: "800", color: "#0f172a", marginTop: 2, textAlign: "center" },
  calcCard: { backgroundColor: "#ffffff", borderRadius: 14, padding: 14, borderWidth: 1, borderColor: "#e2e8f0" },
  calcSubBox: { padding: 10, backgroundColor: "#f8fafc", borderRadius: 8, borderWidth: 1, borderColor: "#e2e8f0", marginVertical: 4 },
  calcCombinedBox: { padding: 10, backgroundColor: "#eef2ff", borderRadius: 8, borderWidth: 1, borderColor: "#c7d2fe", flexDirection: "row", flexWrap: "wrap", gap: 6, justifyContent: "space-between", alignItems: "center", marginVertical: 4 },
  calcOutcomeBox: { padding: 10, borderRadius: 8, borderWidth: 1, marginVertical: 4 },
  card: { backgroundColor: "#ffffff", borderRadius: 12, padding: 12, borderWidth: 1, borderColor: "#e2e8f0", gap: 5 },
  cardText: { fontSize: 12, color: "#334155", lineHeight: 18 },

  workflowCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 16,
    marginTop: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  workflowTitle: { fontSize: 14, fontWeight: "800", color: "#0f172a", marginBottom: 12 },
  workflowStepRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  stepCircle: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  stepCompleted: { backgroundColor: "#059669" },
  stepInProgress: { backgroundColor: "#d97706" },
  stepInProgressBlue: { backgroundColor: "#2563eb" },
  stepRejected: { backgroundColor: "#dc2626" },
  stepConnector: { width: 2, height: 18, backgroundColor: "#cbd5e1", marginLeft: 13, marginVertical: 2 },
  stepContent: { flex: 1 },
  stepName: { fontSize: 13, fontWeight: "700", color: "#1e293b" },
  stepDesc: { fontSize: 11, color: "#64748b", marginTop: 2, lineHeight: 15 },

  grandBox: { backgroundColor: "#0f172a", borderRadius: 14, padding: 16, marginTop: 4 },
  grandTitle: { fontSize: 14, fontWeight: "800", color: "#ffffff", marginBottom: 6 },
  grandText: { fontSize: 14, fontWeight: "800", color: "#ffffff", marginVertical: 2 },

  detailAttCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#f8fafc",
    borderRadius: 10,
    padding: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  detailAttThumb: { width: 36, height: 36, borderRadius: 6, backgroundColor: "#e2e8f0" },
  detailAttIconPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 6,
    backgroundColor: "#ecfdf5",
    alignItems: "center",
    justifyContent: "center",
  },
  detailAttName: { fontSize: 11, fontWeight: "800", color: "#0f172a" },
  detailAttSub: { fontSize: 9, fontWeight: "600", color: "#64748b", marginTop: 1 },
  detailAttEyePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "#eef2ff",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginLeft: "auto",
  },
  detailAttEyeText: { fontSize: 10, fontWeight: "800", color: "#4f46e5" },

  actionRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 20 },
  deleteActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    backgroundColor: "#fef2f2",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: "#fecaca",
  },
  deleteActionBtnText: { color: "#dc2626", fontWeight: "800", fontSize: 13 },
  editBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#4f46e5",
    borderRadius: 12,
    paddingVertical: 14,
  },
  editBtnText: { color: "#ffffff", fontWeight: "800", fontSize: 13 },
  submitBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#059669",
    borderRadius: 12,
    paddingVertical: 14,
  },
  submitBtnText: { color: "#ffffff", fontWeight: "800", fontSize: 13 },

  restrictedContainer: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, marginTop: 60 },
  restrictedIconBox: { width: 64, height: 64, borderRadius: 32, backgroundColor: "#f1f5f9", borderWidth: 1, borderColor: "#cbd5e1", alignItems: "center", justifyContent: "center", marginBottom: 16 },
  restrictedTitle: { fontSize: 18, fontWeight: "800", color: "#0f172a", marginBottom: 8 },
  restrictedSubtext: { fontSize: 13, color: "#64748b", textAlign: "center", lineHeight: 18, marginBottom: 24 },
  restrictedBackBtn: { backgroundColor: "#4f46e5", paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12 },
  restrictedBackBtnText: { color: "#ffffff", fontWeight: "700", fontSize: 14 },

  photoModalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.85)", justifyContent: "center", alignItems: "center", padding: 16 },
  photoModalContainer: { width: "100%", maxHeight: "85%", backgroundColor: "#0f172a", borderRadius: 20, overflow: "hidden", shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 16, elevation: 8 },
  photoModalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 14, backgroundColor: "rgba(255,255,255,0.06)", borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.1)" },
  photoModalTitle: { fontSize: 13, fontWeight: "800", color: "#ffffff" },
  photoModalCloseBtn: { padding: 6, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.12)" },
  photoModalBody: { width: "100%", height: 400, backgroundColor: "#020617", alignItems: "center", justifyContent: "center" },
  photoModalImage: { width: "100%", height: "100%" },
  photoModalNoImg: { alignItems: "center", justifyContent: "center" },
  photoModalNoImgText: { fontSize: 12, color: "#94a3b8", fontWeight: "600" },

  headerDownloadBtn: {
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  headerDownloadPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#4f46e5",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  headerDownloadText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#ffffff",
  },
  downloadCardContainer: {
    marginTop: 18,
    marginBottom: 4,
  },
  downloadClaimPdfBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#1e1b4b",
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    shadowColor: "#4f46e5",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  downloadClaimPdfBtnText: {
    color: "#ffffff",
    fontWeight: "800",
    fontSize: 14,
    letterSpacing: 0.2,
  },
});

export default ExpenseClaimDetailScreen;
