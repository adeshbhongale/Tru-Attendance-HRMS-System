import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  AlertCircle,
  BedDouble,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  Eye,
  FileCheck,
  FileText,
  Image as ImageIcon,
  Lock,
  MapPin,
  Pencil,
  Receipt,
  RefreshCw,
  Send,
  Trash2,
  User as UserIcon,
  Users,
  X,
  Zap,
  Barcode,
  ShoppingBag,
  Calculator,
  Gauge,
  Fuel,
  Car,
  Bike,
  Plus,
} from "lucide-react-native";
import React, { useCallback, useEffect, useRef, useState } from "react";
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

  if (payStatus === "DISBURSED" || s === "DISBURSED") {
    return { label: "Disbursed", color: "#059669" };
  }
  if (payStatus === "PAID" || s === "PAID" || s === "SETTLED" || s === "FULLY_PAID") {
    return { label: "Paid", color: "#059669" };
  }
  if (payStatus === "AWAITING_DISBURSEMENT" || s === "ACCOUNTS_APPROVED") {
    return { label: "Awaiting Disbursement", color: "#2563eb" };
  }

  const isApprovalOff = claim && (
    claim.approvalRequired === false ||
    String(claim.approvalFlow || "").toUpperCase() === "NONE" ||
    claim.policySnapshot?.approvalRequired === false
  );
  if (isApprovalOff && (s === "HR_PENDING" || s === "UNDER_REVIEW" || s === "SUBMITTED")) {
    return { label: "Accounts Pending", color: "#4f46e5" };
  }
  switch (s) {
    case "DRAFT":
      return { label: "Draft", color: "#64748b" };
    case "HR_PENDING":
    case "UNDER_REVIEW":
      return isApprovalOff ? { label: "Accounts Pending", color: "#4f46e5" } : { label: "HR Pending", color: "#d97706" };
    case "HR_REJECTED":
      return { label: "HR Rejected", color: "#dc2626" };
    case "ACCOUNTS_PENDING":
      return { label: "Accounts Pending", color: "#4f46e5" };
    case "APPROVED":
      return { label: "Awaiting Disbursement", color: "#2563eb" };
    case "ACCOUNTS_REJECTED":
      return { label: "Accounts Rejected", color: "#dc2626" };
    case "PAID":
      return { label: "Paid", color: "#059669" };
    case "DISBURSED":
      return { label: "Disbursed", color: "#059669" };
    case "REJECTED":
    case "CANCELLED":
      return { label: "Rejected", color: "#dc2626" };
    case "RETURNED":
      return { label: "Returned", color: "#ea580c" };
    default:
      return isApprovalOff ? { label: "Accounts Pending", color: "#4f46e5" } : { label: "Pending", color: "#d97706" };
  }
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
  } catch (_) {
    return String(dateStr).slice(0, 16);
  }
};

const getClaimTypeInfo = (claim) => {
  if (!claim) return { code: "EXPENSE", name: "Expense Claim" };
  const code = (
    claim.claimType ||
    claim.expenseType ||
    claim.employeeClaims?.[0]?.items?.[0]?.expenseType ||
    (claim.trip?.travelMode ? "TRAVEL" : "OTHER")
  )?.toUpperCase();

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
      return { code: code || "OTHER", name: code === "OTHER" ? "Other Expense Claim" : `${code || "Expense"} Claim` };
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
        } catch (_) {}
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
        Alert.alert("Success", "Claim submitted for approval successfully.");
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
  const isLodging = claim.claimMode === "LOGGING" || typeInfo.code === "LODGING";
  const creatorId = String(claim.submittedBy?._id || claim.submittedBy || claim.createdBy?._id || claim.createdBy || "");
  const isOwner = currentUserId ? creatorId === String(currentUserId) : true;
  const statusUpper = String(claim.status || "").toUpperCase();
  const paymentUpper = String(claim.paymentStatus || "").toUpperCase();
  const isHrApprovalRequired = claim.approvalRequired !== false &&
    String(claim.approvalFlow || "").toUpperCase() !== "NONE" &&
    claim.policySnapshot?.approvalRequired !== false;

  const isDisbursedOrPaid = ["PAID", "DISBURSED"].includes(paymentUpper) ||
    ["PAID", "DISBURSED", "SETTLED", "FULLY_PAID"].includes(statusUpper);

  const isApprovedOrPaid = isDisbursedOrPaid || [
    "ACCOUNTS_APPROVED",
    "APPROVED",
  ].includes(statusUpper);

  // User can edit the submitted claim until claim is approved
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

  const dateLabel = isLodging && claim.fromDate && claim.toDate
    ? `${String(claim.fromDate).slice(0, 10)} → ${String(claim.toDate).slice(0, 10)}`
    : claim.claimDate ? String(claim.claimDate).slice(0, 10) : "";

  // Comprehensive receipts gathering across root, entries, and employee claims without dropping any
  const receiptsList = (() => {
    const list = [];
    const seen = new Set();
    const add = (r) => {
      if (!r) return;
      const key = r.url || r.uri || r.localId || r._id || r.name;
      if (key && !seen.has(key)) {
        seen.add(key);
        list.push(r);
      }
    };
    if (Array.isArray(claim.receipts)) claim.receipts.forEach(add);
    if (Array.isArray(claim.entries)) {
      claim.entries.forEach((e) => {
        if (Array.isArray(e?.receipts)) e.receipts.forEach(add);
        if (Array.isArray(e?.attachments)) e.attachments.forEach(add);
      });
    }
    if (Array.isArray(claim.employeeClaims)) {
      claim.employeeClaims.forEach((ec) => {
        (ec.items || []).forEach((it) => {
          if (Array.isArray(it?.attachments)) it.attachments.forEach(add);
          if (Array.isArray(it?.receipts)) it.receipts.forEach(add);
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
        const expenseTypeName = firstItem.expenseTypeName || (
          expenseType === "CONVEYANCE" ? "Local Conveyance" :
          expenseType === "FOOD" ? "Food" :
          expenseType === "TRAVEL" ? "Travel" :
          (expenseType === "LODGING" || expenseType === "LOGGING") ? "Lodging" :
          expenseType === "OTHER" ? "Other Expense" : expenseType
        );
        const expenseDate = entry.expenseDate || firstItem.expenseDate || claim.claimDate || claim.date;
        const requestedAmount = Number(entry.requestedAmount) || ecList.reduce((s, ec) => s + (Number(ec.items?.[idx]?.requestedAmount) || 0), 0);
        const allowedAmount = ecList.reduce((s, ec) => s + (Number(ec.items?.[idx]?.allowedAmount) || 0), 0) || requestedAmount;
        const excessAmount = ecList.reduce((s, ec) => s + (Number(ec.items?.[idx]?.excessAmount) || 0), 0);
        const policyLimit = ecList.reduce((s, ec) => s + (Number(ec.items?.[idx]?.policyLimit) || 0), 0);
        const itemHasExcess = excessAmount > 0;
        const limitDisplay = (expenseType === "CONVEYANCE" || expenseType === "TRAVEL" || expenseType === "OTHER")
          ? (firstItem.limitText || "Actuals (Fully Allowed)")
          : (firstItem.limitText || (policyLimit > 0 ? `₹${policyLimit}` : "Actuals (Fully Allowed)"));
        const attachments = entry.receipts || entry.attachments || firstItem.attachments || [];

        const itemFormula = entry.formula || firstItem.formula || firstItem.calculationBreakdown?.formula || (
          expenseType === "CONVEYANCE"
            ? ((entry.distanceKm || firstItem.distanceKm) ? `${entry.distanceKm || firstItem.distanceKm} km x ₹${firstItem.calculationBreakdown?.sourceValues?.rate || 10}/km` : "Actuals (Fully Allowed)")
            : expenseType === "TRAVEL"
              ? "Travel fare (Fully Allowed)"
              : expenseType === "OTHER"
                ? ((entry.otherSubType || firstItem.otherSubType) === "PURCHASE" ? "Purchase (Fully Allowed)" : "Actual amount (Fully Allowed)")
                : expenseType === "FOOD"
                  ? (firstItem.limitText ? `Daily limit: ${firstItem.limitText}` : "MIN(actual, daily entitlement)")
                  : (expenseType === "LODGING" || expenseType === "LOGGING")
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
          distanceKm: entry.distanceKm || firstItem.distanceKm,
          vehicle: entry.vehicle || firstItem.vehicle,
          otherSubType: entry.otherSubType || firstItem.otherSubType,
          barcodeNumber: entry.barcodeNumber || firstItem.barcodeNumber,
          quantity: entry.quantity || firstItem.quantity,
          hotelName: entry.hotelName || firstItem.hotelName,
          accommodationType: entry.accommodationType || firstItem.accommodationType,
          sharedWith: entry.sharedWith || firstItem.sharedWith,
          attachments,
        };
      })
    : [{
        expenseType: (ecList[0]?.items?.[0]?.expenseType || claim.claimType || (isLodging ? "LODGING" : "OTHER")).toUpperCase(),
        expenseTypeName: typeInfo.name,
        expenseDate: ecList[0]?.items?.[0]?.expenseDate || claim.claimDate || claim.fromDate,
        requestedAmount: reqAmt,
        allowedAmount: allowAmt,
        excessAmount: excAmt,
        policyLimit: claim.grandPolicyLimit || claim.policyLimit || allowAmt,
        hasExcess: excAmt > 0,
        limitDisplay: (claim.claimType === "CONVEYANCE" || claim.claimType === "TRAVEL" || claim.claimType === "OTHER")
          ? "Actuals (Fully Allowed)"
          : (claim.grandPolicyLimit ? `₹${claim.grandPolicyLimit}` : "Actuals (Fully Allowed)"),
        formula: claim.formula || ecList[0]?.items?.[0]?.formula,
        description: claim.remark || claim.remarks,
        distanceKm: claim.entries?.[0]?.distanceKm || ecList[0]?.items?.[0]?.distanceKm,
        vehicle: claim.entries?.[0]?.vehicle || ecList[0]?.items?.[0]?.vehicle,
        otherSubType: claim.entries?.[0]?.otherSubType || ecList[0]?.items?.[0]?.otherSubType,
        barcodeNumber: claim.entries?.[0]?.barcodeNumber || ecList[0]?.items?.[0]?.barcodeNumber,
        quantity: claim.entries?.[0]?.quantity || ecList[0]?.items?.[0]?.quantity,
        hotelName: claim.entries?.[0]?.hotelName || ecList[0]?.items?.[0]?.hotelName,
        accommodationType: claim.entries?.[0]?.accommodationType || ecList[0]?.items?.[0]?.accommodationType,
        sharedWith: claim.entries?.[0]?.sharedWith || ecList[0]?.items?.[0]?.sharedWith,
        attachments: receiptsList,
      }];

  const grandReq = reqAmt;
  const grandAllow = allowAmt;
  const grandExc = excAmt;
  const grandLimit = claim.grandPolicyLimit ?? claim.policyLimit ?? (ecList[0]?.items?.[0]?.policyLimit || grandAllow);
  const hasExcess = grandExc > 0;

  const isFood = typeInfo.code === "FOOD" || (claim.claimType || "").toUpperCase() === "FOOD" || combinedEntries.some(e => e.expenseType === "FOOD");
  const isLoggingOrFood = isLodging || isFood;

  const days = Number(
    claim.numberOfNights ||
    claim.days ||
    claim.numberOfDays ||
    claim.trip?.days ||
    (claim.fromDate && claim.toDate ? Math.max(1, Math.round((new Date(claim.toDate) - new Date(claim.fromDate)) / (1000 * 60 * 60 * 24))) : 1)
  ) || 1;

  let empLines = [];
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
        return perDay > 0 ? `${name}: ₹${perDay}/day` : `${name}: Actuals`;
      }
    });
  } else {
    const name = claim.submittedByName || "Employee";
    let perDay = 0;
    if (isLodging && days > 0 && grandLimit > 0) {
      perDay = Math.round(grandLimit / days);
    } else {
      perDay = grandLimit;
    }
    empLines = [
      isLodging
        ? (days > 1 ? `${name}: ₹${perDay}/day (Total: ₹${grandLimit} for ${days} days)` : `${name}: ₹${perDay}/day`)
        : (perDay > 0 ? `${name}: ₹${perDay}/day` : `${name}: Actuals`)
    ];
  }

  let calcOutcomeText = "";
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
          {claim.trip && claim.trip.tourSanctioned !== undefined ? (
            <View style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>Tour Sanctioned: </Text>
              <Text style={[styles.fieldValue, { color: claim.trip.tourSanctioned ? "#059669" : "#dc2626" }]}>
                {claim.trip.tourSanctioned ? "Yes (Sanctioned)" : "No"}
              </Text>
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
          const isConveyance = entry.expenseType === "CONVEYANCE";
          const isLodgingEntry = entry.expenseType === "LODGING" || entry.expenseType === "LOGGING";

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
                  <Text style={[styles.figureValue, { color: "#4f46e5" }]}>{entry.limitDisplay}</Text>
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

              {/* Entry specific proofs */}
              {entry.attachments && entry.attachments.length > 0 && (
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
                    ? "APPROVED by Accounts"
                    : (claim.fullPayment?.status === "REJECTED" ? "REJECTED" : "Pending Review")}
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
                {grandLimit > 0 ? `₹${grandLimit}` : "Actuals"}
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
          {isLoggingOrFood && empLines.length > 0 ? (
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
                    ₹{grandLimit} {isLodging ? `(${days} days)` : ""}
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
        {/* STEP 7: CLAIM PROOFS & DOCUMENTS                         */}
        {/* ======================================================== */}
        <Text style={styles.sectionTitle}>
          7. Claim Documents &amp; Proofs
        </Text>

        {/* 🧾 Bill Proofs */}
        <View style={styles.itemCard}>
          <Text style={{ fontSize: 12, fontWeight: "800", color: "#0f172a", marginBottom: 6 }}>
            🧾 Bill Proofs / Receipts ({receiptsList.length})
          </Text>
          {receiptsList.length === 0 ? (
            <Text style={{ fontSize: 12, color: "#94a3b8" }}>No bill proofs attached.</Text>
          ) : (
            <View style={{ gap: 6 }}>
              {receiptsList.map((r, rIdx) => {
                const previewUri = resolveProofImageUrl(r);
                const isPdf = r.type === "application/pdf" || (r.name && r.name.toLowerCase().endsWith(".pdf"));
                const proofTitle = r.name || `Bill Proof #${rIdx + 1}`;
                return (
                  <TouchableOpacity
                    key={rIdx}
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
                        {isPdf ? "PDF Bill Proof • Tap to open" : "Bill Proof Document • Tap to view"}
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

        {/* 📑 Service Reports (Compulsory for Logging claims) */}
        {serviceReportsList.length > 0 && (
          <View style={styles.itemCard}>
            <Text style={{ fontSize: 12, fontWeight: "800", color: "#92400e", marginBottom: 6 }}>
              📑 Service Reports ({serviceReportsList.length})
            </Text>
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
          </View>
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
                    : paymentUpper === "AWAITING_DISBURSEMENT" || statusUpper === "APPROVED" || statusUpper === "ACCOUNTS_APPROVED"
                    ? "#2563eb"
                    : "#d97706",
                },
              ]}
            >
              {paymentUpper === "DISBURSED" || statusUpper === "DISBURSED"
                ? "Disbursed"
                : isDisbursedOrPaid
                ? "Fully Paid"
                : paymentUpper === "AWAITING_DISBURSEMENT" || statusUpper === "APPROVED" || statusUpper === "ACCOUNTS_APPROVED"
                ? "Awaiting Disbursement"
                : paymentUpper === "PARTIAL"
                ? "Partially Paid"
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
            <Text style={styles.workflowTitle}>Approval Journey</Text>

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

            {/* Step 2: HR Verification (Only shown when HR approval is required) */}
            {isHrApprovalRequired ? (
              <>
                <View style={styles.stepConnector} />
                <View style={styles.workflowStepRow}>
                  <View
                    style={[
                      styles.stepCircle,
                      statusUpper === "HR_REJECTED"
                        ? styles.stepRejected
                        : ["APPROVED", "ACCOUNTS_PENDING", "ACCOUNTS_APPROVED", "PAID", "DISBURSED", "SETTLED", "FULLY_PAID"].includes(statusUpper)
                        ? styles.stepCompleted
                        : styles.stepInProgress,
                    ]}
                  >
                    {statusUpper === "HR_REJECTED" ? (
                      <AlertCircle size={15} color="#ffffff" />
                    ) : ["APPROVED", "ACCOUNTS_PENDING", "ACCOUNTS_APPROVED", "PAID", "DISBURSED", "SETTLED", "FULLY_PAID"].includes(statusUpper) ? (
                      <CheckCircle2 size={15} color="#ffffff" />
                    ) : (
                      <Clock size={15} color="#ffffff" />
                    )}
                  </View>
                  <View style={styles.stepContent}>
                    <Text style={styles.stepName}>2. HR / Manager Review</Text>
                    <Text style={styles.stepDesc}>
                      {statusUpper === "HR_REJECTED"
                        ? `Rejected: ${claim.rejectionReason || claim.hrRemarks || "Policy criteria not met"}`
                        : ["APPROVED", "ACCOUNTS_PENDING", "ACCOUNTS_APPROVED", "PAID", "DISBURSED", "SETTLED", "FULLY_PAID"].includes(statusUpper)
                        ? "Verified & Approved by HR Admin"
                        : "Awaiting review and verification"}
                    </Text>
                  </View>
                </View>
              </>
            ) : null}

            <View style={styles.stepConnector} />

            {/* Accounts Audit & Payment */}
            <View style={styles.workflowStepRow}>
              <View
                style={[
                  styles.stepCircle,
                  isDisbursedOrPaid
                    ? styles.stepCompleted
                    : statusUpper === "ACCOUNTS_REJECTED"
                    ? styles.stepRejected
                    : styles.stepInProgressBlue,
                ]}
              >
                {isDisbursedOrPaid ? (
                  <CheckCircle2 size={15} color="#ffffff" />
                ) : (
                  <Clock size={15} color="#ffffff" />
                )}
              </View>
              <View style={styles.stepContent}>
                <Text style={styles.stepName}>{isHrApprovalRequired ? "3. Accounts Payment" : "2. Accounts Payment"}</Text>
                <Text style={styles.stepDesc}>
                  {isDisbursedOrPaid
                    ? `Disbursed ₹${claim.paidAmount || claim.disbursement?.amount || payAmt} via ${claim.paymentMethod || claim.disbursement?.paymentMethod || "Bank Transfer"}${
                        claim.paymentReference || claim.utr || claim.disbursement?.paymentReference
                          ? ` (Ref: ${claim.paymentReference || claim.utr || claim.disbursement?.paymentReference})`
                          : ""
                      }`
                    : (paymentUpper === "AWAITING_DISBURSEMENT" || ["APPROVED", "ACCOUNTS_APPROVED"].includes(statusUpper))
                    ? "Approved by Accounts Admin. Awaiting payment disbursement."
                    : "Pending Accounts Admin audit & payment disbursement"}
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
                  mode: isLodging ? "LOGGING" : "NORMAL",
                })
              }
            >
              <Pencil size={17} color="#ffffff" />
              <Text style={styles.editBtnText}>
                {claim.status === "DRAFT"
                  ? "Edit Draft"
                  : ["SUBMITTED", "HR_PENDING", "FULL_PAYMENT_PENDING", "ACCOUNTS_PENDING"].includes(statusUpper)
                    ? "Edit Claim"
                    : "Edit & Resubmit"}
              </Text>
            </TouchableOpacity>

            {claim.status === "DRAFT" || claim.status === "RETURNED" ? (
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
                <Text style={styles.submitBtnText}>Submit Claim</Text>
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

      <HRModuleFooter navigation={navigation} currentScreen="expenseClaim" />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
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
