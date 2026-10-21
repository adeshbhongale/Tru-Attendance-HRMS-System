import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Clock,
  Eye,
  FileCheck,
  FileText,
  Image as ImageIcon,
  Lock,
  Pencil,
  Send,
  ShieldCheck,
  Trash2,
  Users,
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
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import HRModuleFooter from "../../../../components/HRModuleFooter";
import { resolveProofImageUrl } from "../../../../utils/imageUrl";
import expenseApi from "../api/expenseApi";
import ExpenseHeader from "../components/ExpenseHeader";

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
    return { label: "Awaiting Approval", color: "#7c3aed" };
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
  if (!claim) return { code: "EXPENSE", name: "Expense Claim" };
  const firstEntry = claim.entries?.[0] || claim.employeeClaims?.[0]?.items?.[0] || {};
  const code = (
    claim.claimType ||
    claim.expenseType ||
    firstEntry.expenseType ||
    (claim.trip?.travelMode ? "TRAVEL" : "OTHER")
  )?.toUpperCase();

  const isPurchase = code === "OTHER" && (firstEntry.otherSubType || claim.otherSubType || "").toUpperCase() === "PURCHASE";

  switch (code) {
    case "LODGING":
      return {
        code: "LODGING",
        name: (claim.employeeCount || claim.numberOfEmployees) > 1 ? "Shared Lodging Claim" : "Lodging Claim",
      };
    case "CONVEYANCE":
      return { code: "CONVEYANCE", name: "Local Conveyance Claim" };
    case "FOOD":
      return { code: "FOOD", name: "Food Claim" };
    case "TRAVEL":
      return { code: "TRAVEL", name: "Travel Claim" };
    case "OTHER":
    default:
      return {
        code: code || "OTHER",
        name: isPurchase ? "Purchase Claim" : (code === "OTHER" ? "Other Expense Claim" : `${code || "Expense"} Claim`),
      };
  }
};

const ExpenseClaimDetailScreen = ({ navigation, route }) => {
  const { claimId } = route.params || {};
  const [claim, setClaim] = useState(null);
  const [currentUserId, setCurrentUserId] = useState(null);
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

  const load = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    setError(null);
    try {
      let uid = await AsyncStorage.getItem("userId");
      const userStr = await AsyncStorage.getItem("user");
      if (userStr) {
        try {
          const uObj = JSON.parse(userStr);
          uid = uObj._id || uObj.id || uid;
        } catch {
          /* ignore parse error */
        }
      }
      setCurrentUserId(uid ? String(uid) : null);

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
    Alert.alert(
      approved ? "Approved" : "Rejected",
      approved ? "Claim approved and sent to Accounts." : "Claim rejected."
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

  const isApprovedOrPaid = isDisbursedOrPaid;

  // User can edit the submitted claim until claim is paid
  const isEditable = isOwner && !isApprovedOrPaid;

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

  const myEc = (claim.employeeClaims || []).find((ec) => {
    const empId = String(ec.employee?.employeeId?._id || ec.employee?.employeeId || "");
    return currentUserId && empId === String(currentUserId);
  });
  let myUserReq = claim.userRequested;
  let myUserAllow = claim.userAllowed;
  let myUserExc = claim.userExcess;
  if (isLodging) {
    myUserReq = reqAmt;
    myUserAllow = allowAmt;
    myUserExc = excAmt;
  } else if (myUserReq === undefined && myEc) {
    const own = (myEc.items || []).filter((it) => String(it.expenseType || '').toUpperCase() !== 'LODGING');
    myUserReq = own.reduce((s, i) => s + (Number(i.requestedAmount) || 0), 0);
    myUserAllow = own.reduce((s, i) => s + (Number(i.allowedAmount) || 0), 0);
    myUserExc = own.reduce((s, i) => s + (Number(i.excessAmount) || 0), 0);
  }
  if (myUserReq === undefined && !isOwner) {
    myUserReq = isLodging ? reqAmt : 0;
    myUserAllow = isLodging ? allowAmt : 0;
    myUserExc = isLodging ? excAmt : 0;
  }

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

  const serviceReportsList = (claim.serviceReports && Array.isArray(claim.serviceReports) && claim.serviceReports.length > 0)
    ? claim.serviceReports
    : [];

  const fullPaymentProofs = (() => {
    const list = (claim.fullPayment?.proofs && claim.fullPayment.proofs.length > 0)
      ? claim.fullPayment.proofs
      : (claim.fullPaymentProofs || []);
    return Array.isArray(list) ? list : [];
  })();

  const ecList = Array.isArray(claim.employeeClaims) ? claim.employeeClaims : [];
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
      const isConveyance = expenseType === "CONVEYANCE";
      const isPurchase = isOther && (entry.otherSubType || firstItem.otherSubType || "").toUpperCase() === "PURCHASE";

      const expenseTypeName = firstItem.expenseTypeName || (
        isConveyance ? "Local Conveyance" :
          expenseType === "FOOD" ? "Food" :
            expenseType === "TRAVEL" ? "Travel" :
              (expenseType === "LODGING" || expenseType === "LODGING") ? "Lodging" :
                isOther ? (isPurchase ? "Purchase" : "Other Expense") : expenseType
      );
      const expenseDate = entry.expenseDate || firstItem.expenseDate || claim.claimDate || claim.date;
      const requestedAmount = Number(entry.requestedAmount) || ecList.reduce((s, ec) => s + (Number(ec.items?.[idx]?.requestedAmount) || 0), 0);
      const allowedAmount = ecList.reduce((s, ec) => s + (Number(ec.items?.[idx]?.allowedAmount) || 0), 0) || requestedAmount;
      const excessAmount = ecList.reduce((s, ec) => s + (Number(ec.items?.[idx]?.excessAmount) || 0), 0);
      const policyLimit = ecList.reduce((s, ec) => s + (Number(ec.items?.[idx]?.policyLimit) || 0), 0);
      const itemHasExcess = excessAmount > 0;
      const isItemFood = expenseType === "FOOD" || expenseType === "FOOD_EXPENSE";
      const limitDisplay = isItemFood
        ? ((firstItem.limitText && !firstItem.limitText.toLowerCase().includes("actual"))
            ? firstItem.limitText
            : `₹${policyLimit > 0 ? policyLimit : allowedAmount}`)
        : (isConveyance || expenseType === "TRAVEL" || expenseType === "OTHER")
          ? (firstItem.limitText || "Actuals (Fully Allowed)")
          : (firstItem.limitText || (policyLimit > 0 ? `₹${policyLimit}` : "Actuals (Fully Allowed)"));
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
        distanceKm: isConveyance ? (entry.distanceKm || firstItem.distanceKm) : undefined,
        vehicle: isConveyance ? (entry.vehicle || firstItem.vehicle) : undefined,
        otherSubType: isOther ? (entry.otherSubType || firstItem.otherSubType) : undefined,
        barcodeNumber: isOther ? (entry.barcodeNumber || firstItem.barcodeNumber) : undefined,
        quantity: isOther ? (entry.quantity || firstItem.quantity) : undefined,
        hotelName: entry.hotelName || firstItem.hotelName,
        accommodationType: entry.accommodationType || firstItem.accommodationType,
        sharedWith: entry.sharedWith || firstItem.sharedWith,
        numberPlatePhotos: entry.numberPlatePhotos || firstItem.numberPlatePhotos || [],
        startKmPhotos: entry.startKmPhotos || firstItem.startKmPhotos || [],
        endKmPhotos: entry.endKmPhotos || firstItem.endKmPhotos || [],
        attachments: isConveyance ? [] : attachments,
      };
    })
    : (() => {
      const singleExpType = (ecList[0]?.items?.[0]?.expenseType || claim.claimType || (isLodging ? "LODGING" : "OTHER")).toUpperCase();
      const singleIsOther = singleExpType === "OTHER";
      const singleIsConv = singleExpType === "CONVEYANCE" || singleExpType === "LOCAL_CONVEYANCE";
      return [{
        expenseType: singleExpType,
        expenseTypeName: typeInfo.name,
        expenseDate: ecList[0]?.items?.[0]?.expenseDate || claim.claimDate || claim.fromDate,
        requestedAmount: reqAmt,
        allowedAmount: allowAmt,
        excessAmount: excAmt,
        policyLimit: claim.grandPolicyLimit || claim.policyLimit || allowAmt,
        hasExcess: excAmt > 0,
        limitDisplay: (singleExpType === "FOOD" || singleExpType === "FOOD_EXPENSE")
          ? ((claim.grandPolicyLimit && !String(claim.grandPolicyLimit).toLowerCase().includes("actual"))
              ? `₹${claim.grandPolicyLimit}`
              : `₹${allowAmt}`)
          : (claim.claimType === "CONVEYANCE" || claim.claimType === "LOCAL_CONVEYANCE" || claim.claimType === "TRAVEL" || claim.claimType === "OTHER")
            ? "Actuals (Fully Allowed)"
            : (claim.grandPolicyLimit ? `₹${claim.grandPolicyLimit}` : "Actuals (Fully Allowed)"),
        formula: claim.formula || ecList[0]?.items?.[0]?.formula,
        description: claim.remark || claim.remarks,
        distanceKm: singleIsConv ? (claim.entries?.[0]?.distanceKm || ecList[0]?.items?.[0]?.distanceKm) : undefined,
        vehicle: singleIsConv ? (claim.entries?.[0]?.vehicle || ecList[0]?.items?.[0]?.vehicle) : undefined,
        otherSubType: singleIsOther ? (claim.entries?.[0]?.otherSubType || ecList[0]?.items?.[0]?.otherSubType || claim.otherSubType) : undefined,
        barcodeNumber: singleIsOther ? (claim.entries?.[0]?.barcodeNumber || ecList[0]?.items?.[0]?.barcodeNumber) : undefined,
        quantity: singleIsOther ? (claim.entries?.[0]?.quantity || ecList[0]?.items?.[0]?.quantity) : undefined,
        hotelName: claim.entries?.[0]?.hotelName || ecList[0]?.items?.[0]?.hotelName,
        accommodationType: claim.entries?.[0]?.accommodationType || ecList[0]?.items?.[0]?.accommodationType,
        sharedWith: claim.entries?.[0]?.sharedWith || ecList[0]?.items?.[0]?.sharedWith,
        numberPlatePhotos: claim.entries?.[0]?.numberPlatePhotos || ecList[0]?.items?.[0]?.numberPlatePhotos || claim.numberPlatePhotos || [],
        startKmPhotos: claim.entries?.[0]?.startKmPhotos || ecList[0]?.items?.[0]?.startKmPhotos || claim.startKmPhotos || [],
        endKmPhotos: claim.entries?.[0]?.endKmPhotos || ecList[0]?.items?.[0]?.endKmPhotos || claim.endKmPhotos || [],
        attachments: singleIsConv ? [] : receiptsList,
      }];
    })();

  const grandReq = reqAmt;
  const grandAllow = allowAmt;
  const grandExc = excAmt;
  const grandLimit = claim.grandPolicyLimit ?? claim.policyLimit ?? (ecList[0]?.items?.[0]?.policyLimit || grandAllow);
  const hasExcess = grandExc > 0;

  const isFood = typeInfo.code === "FOOD" || (claim.claimType || "").toUpperCase() === "FOOD" || combinedEntries.some(e => e.expenseType === "FOOD");
  const isLodgingOrFood = isLodging || isFood;

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

  const days = Number(
    claim.numberOfNights ||
    claim.days ||
    claim.numberOfDays ||
    claim.trip?.days ||
    (claim.fromDate && claim.toDate ? Math.max(1, Math.round((new Date(claim.toDate) - new Date(claim.fromDate)) / (1000 * 60 * 60 * 24))) : 1)
  ) || 1;

  let empLines;
  if (ecList.length > 0) {
    empLines = ecList.map((ec, idx) => {
      const name = ec.employee?.name || (numEmployees > 1 ? `Employee #${idx + 1}` : (claim.submittedByName || "Employee"));
      const firstItem = ec.items?.[0] || {};
      const breakdown = firstItem.calculationBreakdown || {};
      const src = breakdown.sourceValues || {};

      let perDay = Number(
        firstItem.perDayLimit ||
        src.dailyEntitlement ||
        src.capPerEmployee ||
        breakdown.dailyCap ||
        0
      );

      if (!perDay) {
        const itemLimit = Number(firstItem.policyLimit || ec.policyLimitTotal || ec.policyLimit || 0);
        if (isLodging && days > 0 && itemLimit > 0) {
          perDay = Math.round(itemLimit / days);
        } else if (itemLimit > 0) {
          perDay = itemLimit;
        }
      }

      if (!perDay && grandLimit > 0) {
        perDay = Math.round(grandLimit / (ecList.length || 1) / (isLodging ? days : 1));
      }

      if (isLodging) {
        const totalEmpLimit = perDay * days;
        return days > 1
          ? `${name}: ₹${perDay}/day (Total: ₹${totalEmpLimit} for ${days} days)`
          : `${name}: ₹${perDay}/day`;
      } else {
        const empAllowed = Number(ec.items?.[0]?.allowedAmount || ec.allowedAmountTotal || (grandAllow / (ecList.length || 1)));
        const fallbackFoodAmt = empAllowed > 0 ? empAllowed : grandAllow;
        return perDay > 0 ? `${name}: ₹${perDay}/day` : (isFood ? `${name}: ₹${fallbackFoodAmt}` : `${name}: Actuals`);
      }
    });
  } else {
    const name = claim.submittedByName || "Employee";
    const perDay = (isLodging && days > 0 && grandLimit > 0)
      ? Math.round(grandLimit / days)
      : grandLimit;
    empLines = [
      isLodging
        ? (days > 1 ? `${name}: ₹${perDay}/day (Total: ₹${grandLimit} for ${days} days)` : `${name}: ₹${perDay}/day`)
        : (perDay > 0 ? `${name}: ₹${perDay}/day` : (isFood ? `${name}: ₹${grandAllow}` : `${name}: Actuals`))
    ];
  }

  let calcOutcomeText;
  if (hasExcess) {
    const perEmpExcessText = numEmployees > 1 ? ` (₹${Math.round(grandExc / numEmployees)} excess per employee)` : "";
    calcOutcomeText = `Claimed bill: ₹${grandReq}. Therefore, ₹${grandAllow} is allowed and ₹${grandExc} is excess beyond policy limit${perEmpExcessText}.`;
  } else {
    const limitLabel = isLodging
      ? (numEmployees > 1 ? "combined whole claim limit" : "whole claim limit")
      : (numEmployees > 1 ? "combined daily limit" : "daily policy limit");
    calcOutcomeText = `Claimed bill: ₹${grandReq}. Since your bill is within your ${limitLabel}, ₹${grandAllow} is fully allowed.`;
  }

  const appliedRules = combinedEntries
    .map((it, idx) => {
      const formula = it.formula || claim.formula || ecList[0]?.items?.[idx]?.formula || ecList[0]?.items?.[idx]?.calculationBreakdown?.formula;
      const title = combinedEntries.length > 1 ? `Entry #${idx + 1} (${it.expenseTypeName})` : it.expenseTypeName;
      return { title, formula };
    })
    .filter(r => Boolean(r.formula));

  const isFullPayment = Boolean(claim.fullPayment?.requested || claim.fullPaymentRequested);
  const hasOtherExpense = combinedEntries.some(e => e.expenseType === "OTHER") || (claim.claimType || "").toUpperCase() === "OTHER";
  const managerApproval = claim.managerApproval || {};
  const approvalKind = managerApproval.kind && managerApproval.kind !== "NONE"
    ? managerApproval.kind
    : (isFullPayment ? "FULL_PAYMENT" : ((hasOtherExpense || managerApproval.approver) ? "OTHER_EXPENSE" : "NONE"));
  const isManagementApproval = approvalKind === "FULL_PAYMENT" || managerApproval.approverRole === "MANAGEMENT";
  const isReportingManagerApproval = approvalKind === "OTHER_EXPENSE" || managerApproval.approverRole === "REPORTING_MANAGER";
  const showApprovalCard = Boolean(
    (approvalKind && approvalKind !== "NONE") ||
    managerApproval.approver ||
    managerApproval.approverName ||
    (isFullPayment && (statusUpper === "APPROVAL_PENDING" || claim.fullPayment?.status))
  );

  const approverObj = (typeof managerApproval.approver === "object" && managerApproval.approver !== null) ? managerApproval.approver : null;
  const approverName = approverObj?.name || managerApproval.approverName || (typeof managerApproval.approver === "string" ? managerApproval.approver : "") || "Assigned Approver";
  const approverCode = approverObj?.employeeIdCode ? ` (${approverObj.employeeIdCode})` : "";
  const approverSub = [approverObj?.designation, approverObj?.department].filter(Boolean).join(" • ");

  const rawApprovalStatus = String(managerApproval.status || "").toUpperCase();
  const effectiveApprovalStatus = (rawApprovalStatus && rawApprovalStatus !== "NOT_REQUIRED")
    ? rawApprovalStatus
    : (statusUpper === "APPROVAL_PENDING"
      ? "PENDING"
      : (statusUpper === "SUBMITTED" || statusUpper === "PAID" ? "APPROVED" : (statusUpper === "REJECTED" ? "REJECTED" : "PENDING")));

  const approvalStatusMeta = {
    PENDING: { label: "Awaiting approval", color: "#d97706", bg: "#fef3c7", border: "#fde68a" },
    APPROVED: { label: "Approved", color: "#059669", bg: "#d1fae5", border: "#a7f3d0" },
    REJECTED: { label: "Rejected", color: "#dc2626", bg: "#fee2e2", border: "#fecaca" },
  }[effectiveApprovalStatus] || { label: "Pending", color: "#d97706", bg: "#fef3c7", border: "#fde68a" };
  const canApprove = Boolean(claim.permissions?.canApprove);

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      <ExpenseHeader
        title={typeInfo.name}
        subtitle="Expense Claim Details"
        navigation={navigation}
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
        {/* Tagged Employee Alert Banner */}
        {!isOwner ? (
          <View style={{ backgroundColor: "#eff6ff", borderWidth: 1, borderColor: "#bfdbfe", borderRadius: 14, padding: 12, marginBottom: 14, flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Users size={18} color="#2563eb" />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 12, fontWeight: "800", color: "#1e40af" }}>
                Filed by {claim.submittedByName || claim.submittedBy?.name || "Colleague"} · You are tagged
              </Text>
              <Text style={{ fontSize: 11, fontWeight: "600", color: "#3b82f6", marginTop: 2 }}>
                {isLodging
                  ? `Shared lodging claim · Claimed: ₹${grandReq} (Allowed: ₹${grandAllow}).`
                  : (myUserReq === 0
                      ? "Lodging covered by colleague."
                      : `Your individual share: ₹${myUserReq} (Payable: ₹${myUserAllow || myUserReq}).`)}
              </Text>
            </View>
          </View>
        ) : null}

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
                {isLodging && days > 0 ? ` (${days} day${days > 1 ? "s" : ""} / ${claim.numberOfNights || (days - 1) || 1} nights)` : ""}
              </Text>
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
            const empCode = ec.employee?.employeeIdCode;
            const empDept = ec.employee?.department;
            const empDesig = ec.employee?.levelName || ec.employee?.role || ec.employee?.gradeCode;

            return (
              <View key={idx} style={styles.slotCard}>
                <View style={styles.slotAvatar}>
                  <Text style={styles.slotAvatarText}>#{idx + 1}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.slotLabel}>
                    {isSlotOne ? "Employee #1 (Primary / Myself)" : `Employee #${idx + 1}`}
                  </Text>
                  <Text style={styles.slotName}>{empName}</Text>
                  {(empDept || empDesig || empCode) ? (
                    <Text style={styles.slotMeta}>
                      {empCode ? `[${empCode}] ` : ""}
                      {empDesig || ""}
                      {empDept ? ` · ${empDept}` : ""}
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
              <Text style={styles.slotName}>{claim.submittedByName || "Myself"}</Text>
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
          {claim.trip?.travelMode ? (
            <View style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>Travel Mode: </Text>
              <Text style={styles.fieldValue}>{claim.trip.travelMode}</Text>
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
        {/* STEP 4: EXPENSE DETAILS (Entries)                        */}
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

        {combinedEntries.map((entry, idx) => {
          const entryNum = idx + 1;
          const isPurchase = entry.expenseType === "OTHER" && (entry.otherSubType || "").toUpperCase() === "PURCHASE";
          const isConveyance = entry.expenseType === "CONVEYANCE" || entry.expenseType === "LOCAL_CONVEYANCE";
          const isLodgingEntry = entry.expenseType === "LODGING" || entry.expenseType === "LODGING";
          const isFoodEntry = entry.expenseType === "FOOD" || entry.expenseType === "FOOD_EXPENSE";
          const foodSafeLimit = (isFoodEntry && (!entry.limitDisplay || String(entry.limitDisplay).toLowerCase().includes("actual")))
            ? `₹${entry.allowedAmount ?? 0}`
            : entry.limitDisplay;

          return (
            <View key={idx} style={styles.entryCard}>
              <View style={styles.entryCardHeader}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flex: 1 }}>
                  <View style={styles.entryNumberPill}>
                    <Text style={styles.entryNumberPillText}>#{entryNum}</Text>
                  </View>
                  <Text style={styles.entryCardTitle}>
                    {combinedEntries.length > 1 ? `Expense Details #${entryNum}: ${entry.expenseTypeName}` : entry.expenseTypeName}
                  </Text>
                </View>
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
                    {entry.hasExcess ? `₹${entry.excessAmount} Excess` : "Fully Allowed"}
                  </Text>
                </View>
              </View>

              {/* Sub-category for Other Expense */}
              {entry.expenseType === "OTHER" && (
                <View style={styles.fieldRow}>
                  <Text style={styles.fieldLabel}>Category: </Text>
                  <Text style={[styles.fieldValue, { color: isPurchase ? "#b45309" : "#4f46e5" }]}>
                    {isPurchase ? "🛒 Purchase" : "📄 Normal"}
                  </Text>
                </View>
              )}

              {/* Purchase fields */}
              {isPurchase && (
                <>
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

              {/* Conveyance Photo Proofs (Vehicle, Start KM, End KM) */}
              {isConveyance && ((entry.numberPlatePhotos && entry.numberPlatePhotos.length > 0) || (entry.startKmPhotos && entry.startKmPhotos.length > 0) || (entry.endKmPhotos && entry.endKmPhotos.length > 0)) && (
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
                </View>
              )}
            </View>
          );
        })}

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
                  color: (claim.fullPayment?.status === "APPROVED" || claim.fullPaymentApproved)
                    ? "#059669"
                    : (claim.fullPayment?.status === "REJECTED" ? "#dc2626" : "#d97706")
                }]}>
                  {(claim.fullPayment?.status === "APPROVED" || claim.fullPaymentApproved)
                    ? `APPROVED by ${claim.fullPayment?.decidedByName || "Accounts"}`
                    : (claim.fullPayment?.status === "REJECTED"
                      ? "REJECTED"
                      : statusUpper === "APPROVAL_PENDING" ? "Awaiting Management approval" : "Pending Review")}
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

        {/* Approver (Management for Full Payment / Reporting Manager for Other expense) */}
        {showApprovalCard ? (
          <View style={[styles.itemCard, { borderColor: isManagementApproval ? "#ddd6fe" : "#c7d2fe", backgroundColor: isManagementApproval ? "#faf5ff" : "#f8faff" }]}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flex: 1 }}>
                <ShieldCheck size={16} color={isManagementApproval ? "#7c3aed" : "#4f46e5"} />
                <Text style={{ fontSize: 13, fontWeight: "800", color: isManagementApproval ? "#5b21b6" : "#3730a3" }}>
                  {isManagementApproval ? "Management Approval (Full Payment)" : "Reporting Manager Approval (Other Expense)"}
                </Text>
              </View>
              <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, backgroundColor: approvalStatusMeta.bg, borderWidth: 1, borderColor: approvalStatusMeta.border }}>
                <Text style={{ fontSize: 10, fontWeight: "800", color: approvalStatusMeta.color }}>
                  {approvalStatusMeta.label}
                </Text>
              </View>
            </View>

            <View style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>
                {isManagementApproval ? "Management Approver: " : "Reporting Manager: "}
              </Text>
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

            {managerApproval.requestedAt ? (
              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>Requested On: </Text>
                <Text style={styles.fieldValue}>{formatDateTime(managerApproval.requestedAt)}</Text>
              </View>
            ) : null}

            {managerApproval.decidedAt ? (
              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>Decided On: </Text>
                <Text style={[styles.fieldValue, { fontWeight: "600" }]}>{formatDateTime(managerApproval.decidedAt)}</Text>
              </View>
            ) : null}

            {managerApproval.remarks ? (
              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>Decision Remarks: </Text>
                <Text style={[styles.fieldValue, { flex: 1, color: "#334155" }]}>{managerApproval.remarks}</Text>
              </View>
            ) : null}

            {canApprove ? (
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
              <Text style={styles.figureLabel}>{!isOwner ? (isLodging ? "CLAIMED" : "YOUR SHARE") : "CLAIMED"}</Text>
              <Text style={styles.figureValue}>₹{!isOwner ? (myUserReq ?? 0) : grandReq}</Text>
            </View>
            <View style={styles.figureItem}>
              <Text style={[styles.figureLabel, { color: "#6366f1" }]}>{!isOwner ? (isLodging ? "POLICY LIMIT" : "CLAIM TOTAL") : "POLICY LIMIT"}</Text>
              <Text style={[styles.figureValue, { color: "#4f46e5" }]}>
                {!isOwner ? (isLodging ? (grandLimit > 0 ? `₹${grandLimit}` : "Actuals") : `₹${grandReq}`) : (isFood ? `₹${grandLimit > 0 ? grandLimit : grandAllow}` : (grandLimit > 0 ? `₹${grandLimit}` : "Actuals"))}
              </Text>
            </View>
            <View style={styles.figureItem}>
              <Text style={[styles.figureLabel, { color: "#059669" }]}>{!isOwner ? (isLodging ? "ALLOWED" : "YOUR ALLOWED") : "ALLOWED"}</Text>
              <Text style={[styles.figureValue, { color: "#059669" }]}>₹{!isOwner ? (myUserAllow ?? 0) : grandAllow}</Text>
            </View>
            <View style={styles.figureItem}>
              <Text style={[styles.figureLabel, { color: "#dc2626" }]}>{!isOwner ? (isLodging ? "EXCESS" : "YOUR EXCESS") : "EXCESS"}</Text>
              <Text style={[styles.figureValue, { color: (hasExcess || (!isOwner && myUserExc > 0)) ? "#dc2626" : "#64748b" }]}>
                ₹{!isOwner ? (myUserExc ?? 0) : grandExc}
              </Text>
            </View>
            <View style={styles.figureItem}>
              <Text style={[styles.figureLabel, { color: "#4f46e5" }]}>{!isOwner ? (isLodging ? "PAYABLE" : "YOUR PAYABLE") : "PAYABLE"}</Text>
              <Text style={[styles.figureValue, { color: "#4f46e5" }]}>₹{!isOwner ? (myUserAllow ?? 0) : payAmt}</Text>
            </View>
          </View>

          {/* Structured Policy Explanation */}
          {isLodgingOrFood && empLines.length > 0 ? (
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
                <Text style={{ fontSize: 11, fontWeight: "800", color: "#312e81" }}>
                  ⚖️ {isLodging ? (numEmployees > 1 ? "Combined Stay Policy Limit:" : "Stay Policy Limit:") : (numEmployees > 1 ? "Combined Daily Policy Limit:" : "Daily Policy Limit:")}
                </Text>
                <View style={{ backgroundColor: "#ffffff", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, borderWidth: 1, borderColor: "#c7d2fe" }}>
                  <Text style={{ fontSize: 12, fontWeight: "900", color: "#4338ca" }}>
                    ₹{isFood ? (grandLimit > 0 ? grandLimit : grandAllow) : grandLimit} {isLodging ? `(${days} days)` : ""}
                  </Text>
                </View>
              </View>

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
        {!hasLocalConveyance && !hasOtherExpense && (
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
            <Text style={styles.statusValue}>{claim.claimId || claim.claimNumber || "Draft Claim"}</Text>
          </View>
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Status</Text>
            <Text style={[styles.statusValue, { color: statusInfo.color }]}>{statusInfo.label}</Text>
          </View>
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
                ? "Paid"
                : statusUpper === "REJECTED" || paymentUpper === "REJECTED"
                  ? "Rejected"
                  : "Pending"}
            </Text>
          </View>
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Applied Date &amp; Time</Text>
            <Text style={styles.statusValue}>
              {claim.submittedAt ? formatDateTime(claim.submittedAt) : formatDateTime(claim.createdAt)}
            </Text>
          </View>
        </View>

        {/* Workflow Journey Stepper */}
        {claim.status !== "DRAFT" ? (
          <View style={styles.workflowCard}>
            <Text style={styles.workflowTitle}>Claim Journey</Text>

            {/* Step 1: Submission */}
            <View style={styles.workflowStepRow}>
              <View style={[styles.stepCircle, styles.stepCompleted]}>
                <CheckCircle2 size={15} color="#ffffff" />
              </View>
              <View style={styles.stepContent}>
                <Text style={styles.stepName}>1. Claim Submitted</Text>
                <Text style={styles.stepDesc}>
                  Submitted on {claim.submittedAt ? formatDateTime(claim.submittedAt) : formatDateTime(claim.createdAt)}
                </Text>
              </View>
            </View>

            <View style={styles.stepConnector} />

            {/* Step 2: Payment / Decision */}
            <View style={styles.workflowStepRow}>
              <View
                style={[
                  styles.stepCircle,
                  isDisbursedOrPaid
                    ? styles.stepCompleted
                    : (statusUpper === "REJECTED" || paymentUpper === "REJECTED" || statusUpper === "HR_REJECTED" || statusUpper === "ACCOUNTS_REJECTED")
                      ? styles.stepRejected
                      : styles.stepInProgressBlue,
                ]}
              >
                {isDisbursedOrPaid ? (
                  <CheckCircle2 size={15} color="#ffffff" />
                ) : (statusUpper === "REJECTED" || paymentUpper === "REJECTED" || statusUpper === "HR_REJECTED" || statusUpper === "ACCOUNTS_REJECTED") ? (
                  <AlertCircle size={15} color="#ffffff" />
                ) : (
                  <Clock size={15} color="#ffffff" />
                )}
              </View>
              <View style={styles.stepContent}>
                <Text style={styles.stepName}>2. Payment &amp; Settlement</Text>
                <Text style={styles.stepDesc}>
                  {isDisbursedOrPaid
                    ? `Paid ₹${claim.paidAmount || claim.disbursement?.amount || payAmt} via ${claim.paymentMethod || claim.disbursement?.paymentMethod || "Bank Transfer"}${claim.paymentReference || claim.utr || claim.disbursement?.paymentReference
                      ? ` (Ref: ${claim.paymentReference || claim.utr || claim.disbursement?.paymentReference})`
                      : ""
                    }${claim.disbursedAt || claim.paymentDate ? ` on ${formatDateTime(claim.disbursedAt || claim.paymentDate)}` : ""}`
                    : (statusUpper === "REJECTED" || paymentUpper === "REJECTED" || statusUpper === "HR_REJECTED" || statusUpper === "ACCOUNTS_REJECTED")
                      ? `Rejected: ${claim.rejection?.reason || claim.rejectionReason || claim.remarks || "Claim not eligible"}`
                      : statusUpper === "APPROVAL_PENDING"
                        ? `Waiting for approval by ${managerApproval.approver?.name || managerApproval.approverName || "approver"}`
                        : "Pending payment & verification by Accounts"}
                </Text>
              </View>
            </View>
          </View>
        ) : null}

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
                : "The claim will be sent to Accounts for payment."}
            </Text>
            <TextInput
              style={styles.decisionInput}
              placeholder={decisionMode === "reject" ? "Reason for rejection (required)" : "Remark (optional)"}
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
  statusRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  statusLabel: { fontSize: 12, color: "#4f46e5", fontWeight: "700" },
  statusValue: { fontSize: 12, color: "#312e81", fontWeight: "800", textAlign: "right" },
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
  fieldRow: { flexDirection: "row", alignItems: "center", gap: 6, marginVertical: 3 },
  fieldLabel: { fontSize: 12, fontWeight: "700", color: "#475569" },
  fieldValue: { fontSize: 12, fontWeight: "800", color: "#0f172a" },
  entryCard: { backgroundColor: "#ffffff", borderRadius: 14, padding: 14, borderWidth: 1, borderColor: "#e2e8f0", marginBottom: 10 },
  entryCardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  entryNumberPill: { width: 24, height: 24, borderRadius: 12, backgroundColor: "#eef2ff", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#c7d2fe" },
  entryNumberPillText: { fontSize: 10, fontWeight: "800", color: "#4f46e5" },
  entryCardTitle: { fontSize: 13, fontWeight: "800", color: "#0f172a" },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1 },
  statusBadgeText: { fontSize: 10, fontWeight: "800" },
  figuresGrid: { flexDirection: "row", backgroundColor: "#f8fafc", borderRadius: 10, padding: 8, borderWidth: 1, borderColor: "#f1f5f9", justifyContent: "space-around", marginVertical: 8 },
  figureItem: { alignItems: "center" },
  figureLabel: { fontSize: 9, fontWeight: "800", color: "#64748b" },
  figureValue: { fontSize: 12, fontWeight: "800", color: "#0f172a", marginTop: 2 },
  calcCard: { backgroundColor: "#ffffff", borderRadius: 14, padding: 14, borderWidth: 1, borderColor: "#e2e8f0" },
  calcSubBox: { padding: 10, backgroundColor: "#f8fafc", borderRadius: 8, borderWidth: 1, borderColor: "#e2e8f0", marginVertical: 4 },
  calcCombinedBox: { padding: 10, backgroundColor: "#eef2ff", borderRadius: 8, borderWidth: 1, borderColor: "#c7d2fe", flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginVertical: 4 },
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

  actionRow: { flexDirection: "row", gap: 8, marginTop: 20 },
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
});

export default ExpenseClaimDetailScreen;
