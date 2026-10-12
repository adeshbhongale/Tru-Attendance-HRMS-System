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
    case "APPROVED":
      return { label: "Accounts Pending", color: "#4f46e5" };
    case "ACCOUNTS_REJECTED":
      return { label: "Accounts Rejected", color: "#dc2626" };
    case "PAID":
    case "ACCOUNTS_APPROVED":
    case "DISBURSED":
    case "SETTLED":
    case "FULLY_PAID":
      return { label: "Paid", color: "#059669" };
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

  const isApprovedOrPaid = [
    "ACCOUNTS_APPROVED",
    "APPROVED",
    "PAID",
    "DISBURSED",
    "SETTLED",
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

  // Comprehensive receipts gathering across root, entries, and employee claims
  const allReceiptsFromClaim = (claim.receipts && Array.isArray(claim.receipts) && claim.receipts.length > 0)
    ? claim.receipts
    : (claim.entries && Array.isArray(claim.entries) && claim.entries.some((e) => e.receipts?.length || e.attachments?.length))
      ? claim.entries.flatMap((e) => e.receipts || e.attachments || [])
      : (claim.employeeClaims && Array.isArray(claim.employeeClaims))
        ? claim.employeeClaims.flatMap((ec) => (ec.items || []).flatMap((it) => it.attachments || it.receipts || []))
        : [];
  const receiptsList = allReceiptsFromClaim;

  const serviceReportsList = (claim.serviceReports && Array.isArray(claim.serviceReports) && claim.serviceReports.length > 0)
    ? claim.serviceReports
    : [];

  const otherItems = (claim.entries && Array.isArray(claim.entries) && claim.entries.length > 0)
    ? claim.entries.filter((e) => (e.expenseType || "").toUpperCase() === "OTHER")
    : (claim.employeeClaims && Array.isArray(claim.employeeClaims))
      ? claim.employeeClaims.flatMap((ec) => (ec.items || []).filter((it) => (it.expenseType || "").toUpperCase() === "OTHER"))
      : ((claim.items && Array.isArray(claim.items))
        ? claim.items.filter((it) => (it.expenseType || "").toUpperCase() === "OTHER")
        : (claim.expenseType === "OTHER" ? [claim] : []));

  const fullPaymentProofs = (claim.fullPayment?.proofs && claim.fullPayment.proofs.length > 0)
    ? claim.fullPayment.proofs
    : (claim.fullPaymentProofs || []);

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
        {/* Status Box in Previous UI Colors */}
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
                { color: paymentUpper === "PAID" ? "#059669" : "#d97706" },
              ]}
            >
              {paymentUpper === "PAID" ? "Fully Paid" : "Pending"}
            </Text>
          </View>
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Applied Date &amp; Time</Text>
            <Text style={styles.statusValue}>
              {claim.submittedAt ? formatDateTime(claim.submittedAt) : formatDateTime(claim.createdAt)}
            </Text>
          </View>
        </View>

        {/* Workflow Journey Stepper in Previous UI Colors */}
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
                  paymentUpper === "PAID" || ["PAID", "DISBURSED", "SETTLED", "FULLY_PAID"].includes(statusUpper)
                    ? styles.stepCompleted
                    : statusUpper === "ACCOUNTS_REJECTED"
                    ? styles.stepRejected
                    : styles.stepInProgressBlue,
                ]}
              >
                {paymentUpper === "PAID" || ["PAID", "DISBURSED", "SETTLED", "FULLY_PAID"].includes(statusUpper) ? (
                  <CheckCircle2 size={15} color="#ffffff" />
                ) : (
                  <Clock size={15} color="#ffffff" />
                )}
              </View>
              <View style={styles.stepContent}>
                <Text style={styles.stepName}>{isHrApprovalRequired ? "3. Accounts Payment" : "2. Accounts Payment"}</Text>
                <Text style={styles.stepDesc}>
                  {paymentUpper === "PAID" || ["PAID", "DISBURSED", "SETTLED", "FULLY_PAID"].includes(statusUpper)
                    ? `Disbursed ₹${claim.paidAmount || payAmt} via ${claim.paymentMethod || "Bank Transfer"}${claim.paymentReference ? ` (Ref: ${claim.paymentReference})` : ""}`
                    : "Pending Accounts Admin audit & payment disbursement"}
                </Text>
              </View>
            </View>
          </View>
        ) : null}

        {/* Claim Details Card */}
        <Text style={styles.sectionTitle}>Expense Information</Text>
        <View style={styles.card}>
          <Text style={styles.cardText}>
            <Text style={{ fontWeight: "700" }}>Claim Type: </Text>
            {typeInfo.name}
          </Text>
          {otherItems.length > 0 && (
            <>
              <Text style={styles.cardText}>
                <Text style={{ fontWeight: "700" }}>Other Category: </Text>
                {otherItems[0]?.otherSubType === "PURCHASE" ? "Purchase" : "Normal"}
              </Text>
              {otherItems[0]?.barcodeNumber ? (
                <Text style={styles.cardText}>
                  <Text style={{ fontWeight: "700" }}>Barcode Number: </Text>
                  {otherItems[0].barcodeNumber}
                </Text>
              ) : null}
              {otherItems[0]?.quantity ? (
                <Text style={styles.cardText}>
                  <Text style={{ fontWeight: "700" }}>Quantity: </Text>
                  {otherItems[0].quantity}
                </Text>
              ) : null}
            </>
          )}
          <Text style={styles.cardText}>
            <Text style={{ fontWeight: "700" }}>{isLodging ? "Stay Period: " : "Claim Date: "}</Text>
            {dateLabel || "—"}
            {isLodging && claim.numberOfNights ? ` (${claim.numberOfNights} nights)` : ""}
          </Text>
          <Text style={styles.cardText}>
            <Text style={{ fontWeight: "700" }}>Customer Name: </Text>
            {claim.customerName || claim.trip?.customerName || "—"}
          </Text>
          <Text style={styles.cardText}>
            <Text style={{ fontWeight: "700" }}>Destination City: </Text>
            {claim.destinationCity || claim.trip?.destination || "—"}
          </Text>
          <Text style={styles.cardText}>
            <Text style={{ fontWeight: "700" }}>Employees: </Text>
            {claim.numberOfEmployees || claim.employeeCount || 1} employee(s)
          </Text>
          <Text style={styles.cardText}>
            <Text style={{ fontWeight: "700" }}>Remark / Purpose: </Text>
            {claim.remark || claim.remarks || claim.trip?.purpose || "—"}
          </Text>
        </View>

        {/* Full Payment Info if Requested */}
        {claim.fullPaymentRequested ? (
          <>
            <Text style={styles.sectionTitle}>Full Payment Request</Text>
            <View style={[styles.card, { borderColor: "#fed7aa", backgroundColor: "#fff7ed" }]}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <Zap size={15} color="#c2410c" />
                <Text style={{ fontSize: 13, fontWeight: "800", color: "#9a3412" }}>
                  Full Payment Requested: YES
                </Text>
              </View>
              <Text style={styles.cardText}>
                <Text style={{ fontWeight: "700" }}>Reason: </Text>
                {claim.fullPaymentReason || "No reason specified"}
              </Text>
              <Text style={styles.cardText}>
                <Text style={{ fontWeight: "700" }}>Approval Status: </Text>
                {claim.fullPaymentApproved ? "APPROVED by Admin" : "Approval Pending"}
              </Text>

              {/* Full Payment Proofs */}
              {fullPaymentProofs.length > 0 ? (
                <View style={{ marginTop: 8 }}>
                  <Text style={{ fontSize: 11, fontWeight: "700", color: "#64748b", marginBottom: 4 }}>
                    Supporting Approval Documents:
                  </Text>
                  {fullPaymentProofs.map((p, pIdx) => {
                    const pUri = resolveProofImageUrl(p);
                    const isPdf = p.type === "application/pdf" || (p.name && p.name.toLowerCase().endsWith(".pdf"));
                    return (
                      <TouchableOpacity
                        key={pIdx}
                        style={styles.detailAttCard}
                        onPress={() => {
                          if (isPdf && pUri) {
                            Linking.openURL(pUri).catch(() => {
                              Alert.alert("Document", "Unable to open approval document.");
                            });
                          } else if (pUri) {
                            setPhotoPreviewModal({
                              visible: true,
                              uri: pUri,
                              title: p.name || `Approval #${pIdx + 1}`,
                            });
                          }
                        }}
                      >
                        {isPdf ? (
                          <FileText size={16} color="#dc2626" />
                        ) : (
                          <FileCheck size={16} color="#059669" />
                        )}
                        <Text style={styles.detailAttName} numberOfLines={1}>{p.name || `Approval #${pIdx + 1}`}</Text>
                        <View style={styles.detailAttEyePill}>
                          <Eye size={11} color="#4f46e5" />
                          <Text style={styles.detailAttEyeText}>View</Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ) : null}
            </View>
          </>
        ) : null}

        {/* Financial Breakdown Card */}
        <Text style={styles.sectionTitle}>Financial Breakdown</Text>
        <View style={styles.grandBox}>
          <Text style={styles.grandTitle}>Claim Amounts</Text>
          <Text style={styles.grandText}>Requested: ₹{reqAmt}</Text>
          <Text style={[styles.grandText, { color: "#34d399" }]}>Allowed: ₹{allowAmt}</Text>
          {excAmt > 0 ? (
            <Text style={[styles.grandText, { color: "#f87171" }]}>Excess: ₹{excAmt}</Text>
          ) : null}
          <Text style={[styles.grandText, { color: "#818cf8" }]}>Final Payable: ₹{payAmt}</Text>
        </View>

        {/* Attached Proof Receipts */}
        <Text style={styles.sectionTitle}>Bills / Receipt Proof ({receiptsList.length})</Text>
        <View style={styles.card}>
          {receiptsList.length === 0 ? (
            <Text style={{ fontSize: 12, color: "#94a3b8" }}>No receipts attached.</Text>
          ) : (
            <View style={{ gap: 6 }}>
              {receiptsList.map((r, rIdx) => {
                const previewUri = resolveProofImageUrl(r);
                const isPdf = r.type === "application/pdf" || (r.name && r.name.toLowerCase().endsWith(".pdf"));
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
                          title: r.name || `Receipt #${rIdx + 1}`,
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
                      <Text style={styles.detailAttName} numberOfLines={1}>{r.name || `Receipt #${rIdx + 1}`}</Text>
                      <Text style={styles.detailAttSub}>
                        {isPdf ? "PDF Document • Tap to open" : "Tap to view proof document"}
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

        {/* Service Reports (Compulsory for Logging claims) */}
        {serviceReportsList.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Service Reports ({serviceReportsList.length})</Text>
            <View style={styles.card}>
              <View style={{ gap: 6 }}>
                {serviceReportsList.map((doc, docIdx) => {
                  const previewUri = resolveProofImageUrl(doc);
                  const isImg = doc.type && doc.type.startsWith("image/");
                  const isPdf = doc.type === "application/pdf" || (doc.name && doc.name.toLowerCase().endsWith(".pdf"));
                  const isOdf = (doc.name && doc.name.toLowerCase().match(/\.(odt|ods|odp)$/)) || (doc.type && doc.type.includes("opendocument"));
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
                            title: doc.name || `Service Report #${docIdx + 1}`,
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
                        <Text style={styles.detailAttName} numberOfLines={1}>{doc.name || `Service Report #${docIdx + 1}`}</Text>
                        <Text style={styles.detailAttSub}>
                          {isImg
                            ? "Image • Tap to preview"
                            : isOdf
                              ? "ODF Document • Tap to open"
                              : isPdf
                                ? "PDF Document • Tap to open"
                                : "Document • Tap to open"}
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
          </>
        )}

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
                  {photoPreviewModal.title || "Bill / Receipt Preview"}
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
