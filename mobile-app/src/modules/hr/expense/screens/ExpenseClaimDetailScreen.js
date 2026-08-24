import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Eye,
  FileCheck,
  Image as ImageIcon,
  Lock,
  Pencil,
  RefreshCw,
  Send,
  ShieldAlert,
  Trash2,
  User as UserIcon,
  Users,
  X
} from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import expenseApi from "../api/expenseApi";
import ExpenseHeader from "../components/ExpenseHeader";
import HRModuleFooter from "../../../../components/HRModuleFooter";

const getDisplayStatus = (status) => {
  const s = String(status || "").toUpperCase();
  switch (s) {
    case "DRAFT":
      return { label: "Draft", color: "#64748b" };
    case "HR_PENDING":
      return { label: "HR Pending", color: "#d97706" };
    case "HR_REJECTED":
      return { label: "HR Rejected", color: "#dc2626" };
    case "ACCOUNTS_PENDING":
      return { label: "Accounts Pending", color: "#2563eb" };
    case "ACCOUNTS_REJECTED":
      return { label: "Accounts Rejected", color: "#dc2626" };
    case "PAID":
    case "ACCOUNTS_APPROVED":
    case "DISBURSED":
    case "SETTLED":
      return { label: "Paid", color: "#059669" };
    case "REJECTED":
    case "CANCELLED":
      return { label: "Rejected", color: "#dc2626" };
    default:
      return { label: "Pending", color: "#d97706" };
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
    claim.employeeClaims?.[0]?.items?.[0]?.expenseType ||
    (claim.trip?.travelMode ? "TRAVEL" : "OTHER")
  )?.toUpperCase();

  switch (code) {
    case "LODGING":
      return {
        code: "LODGING",
        name: claim.employeeCount > 1 ? "Shared Lodging Claim" : "Lodging Claim",
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
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [photoPreviewModal, setPhotoPreviewModal] = useState({ visible: false, uri: "", title: "" });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let uid = await AsyncStorage.getItem("userId");
      const userStr = await AsyncStorage.getItem("user");
      if (userStr) {
        try {
          const uObj = JSON.parse(userStr);
          uid = uObj._id || uid;
        } catch (_) {}
      }
      setCurrentUserId(uid ? String(uid) : null);

      const data = await expenseApi.getClaimById(claimId);
      // Defense in depth: If claim is DRAFT and requester is not the creator, do not allow viewing
      if (data && String(data.status || "").toUpperCase() === "DRAFT") {
        const creatorId = String(data.submittedBy?._id || data.submittedBy || "");
        if (uid && creatorId !== String(uid)) {
          setClaim(null);
          setLoading(false);
          return;
        }
      }
      setClaim(data);
    } catch (err) {
      console.warn("Load expense claim detail error", err);
      setError(err?.response?.data?.message || err?.message || "Unable to load claim details. Please check your network connection.");
      setClaim(null);
    } finally {
      setLoading(false);
    }
  }, [claimId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const res = await expenseApi.submitClaim(claimId);
      if (res.success) {
        setClaim(res.data);
        Alert.alert(
          "Claim Submitted",
          res.data.approvalRequired
            ? "Expense claim submitted. Status is now Pending HR approval."
            : "Expense claim submitted. Status is now Pending Accounts payment.",
          [{ text: "OK" }]
        );
      } else {
        Alert.alert("Submit Failed", res.message || "Unable to submit claim.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      "Delete Expense Claim",
      `Are you sure you want to permanently delete this ${claim.claimNumber || "draft"} claim?`,
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
                  { text: "OK", onPress: () => navigation.goBack() }
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
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <ExpenseHeader title="Claim Details" navigation={navigation} />
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color="#4f46e5" />
        </View>
        <HRModuleFooter navigation={navigation} currentScreen="expenseClaim" />
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <ExpenseHeader title="Claim Details" navigation={navigation} />
        <View style={styles.restrictedContainer}>
          <View style={[styles.restrictedIconBox, { backgroundColor: "#fef2f2", borderColor: "#fecaca" }]}>
            <AlertCircle size={32} color="#ef4444" />
          </View>
          <Text style={styles.restrictedTitle}>Unable to Load Claim</Text>
          <Text style={styles.restrictedSubtext}>{error}</Text>
          <View style={{ flexDirection: "row", gap: 12, marginTop: 8 }}>
            <TouchableOpacity style={styles.retryBtn} onPress={load} activeOpacity={0.8}>
              <RefreshCw size={16} color="#ffffff" />
              <Text style={styles.retryBtnText}>Retry</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.restrictedBackBtn, { backgroundColor: "#64748b" }]} onPress={() => navigation.goBack()}>
              <Text style={styles.restrictedBackBtnText}>Go Back</Text>
            </TouchableOpacity>
          </View>
        </View>
        <HRModuleFooter navigation={navigation} currentScreen="expenseClaim" />
      </SafeAreaView>
    );
  }

  if (!claim) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <ExpenseHeader title="Claim Details" navigation={navigation} />
        <View style={styles.restrictedContainer}>
          <View style={styles.restrictedIconBox}>
            <Lock size={32} color="#64748b" />
          </View>
          <Text style={styles.restrictedTitle}>Claim Unavailable</Text>
          <Text style={styles.restrictedSubtext}>
            This expense claim is private, still in draft, or you do not have permission to view it.
          </Text>
          <TouchableOpacity style={styles.restrictedBackBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.restrictedBackBtnText}>Back to My Claims</Text>
          </TouchableOpacity>
        </View>
        <HRModuleFooter navigation={navigation} currentScreen="expenseClaim" />
      </SafeAreaView>
    );
  }

  const statusInfo = getDisplayStatus(claim.status);
  const typeInfo = getClaimTypeInfo(claim);
  const isLodging = typeInfo.code === "LODGING";
  const isOther = typeInfo.code === "OTHER";
  const creatorId = String(claim.submittedBy?._id || claim.submittedBy || "");
  const isOwner = currentUserId ? creatorId === String(currentUserId) : true;

  const hasTripInfo =
    claim.trip?.customerName ||
    claim.trip?.purpose ||
    claim.trip?.destination ||
    claim.trip?.startDate ||
    claim.trip?.endDate;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <ExpenseHeader title={typeInfo.name} subtitle="Expense Claim Details" navigation={navigation} />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Co-Claimant / Participant Banner */}
        {!isOwner && (
          <View style={styles.coClaimantBanner}>
            <Users size={18} color="#4f46e5" />
            <View style={{ flex: 1 }}>
              <Text style={styles.coClaimantBannerTitle}>Shared / Multi-Employee Claim</Text>
              <Text style={styles.coClaimantBannerText}>
                This claim was filed by {claim.submittedByName || claim.submittedBy?.name || "Team Member"}. You are included as a participant.
              </Text>
            </View>
          </View>
        )}

        {/* Status */}
        <View style={styles.statusBox}>
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Claim Number</Text>
            <Text style={styles.statusValue}>{claim.claimNumber || "Draft Claim"}</Text>
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
                  color:
                    claim.paymentStatus === "PAID" ||
                      ["PAID", "DISBURSED", "SETTLED", "ACCOUNTS_APPROVED"].includes(
                        String(claim.status || "").toUpperCase()
                      )
                      ? "#059669"
                      : "#d97706",
                },
              ]}
            >
              {claim.paymentStatus === "PAID" ||
                ["PAID", "DISBURSED", "SETTLED", "ACCOUNTS_APPROVED"].includes(
                  String(claim.status || "").toUpperCase()
                )
                ? "Paid"
                : "Pending"}
            </Text>
          </View>
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Applied Date & Time</Text>
            <Text style={styles.statusValue}>
              {claim.submittedAt ? formatDateTime(claim.submittedAt) : formatDateTime(claim.createdAt)}
            </Text>
          </View>
        </View>

        {/* Workflow Journey Stepper */}
        {claim.status !== "DRAFT" && (
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

            {/* Step 2: HR Verification (ONLY if HR Approval is enabled for company) */}
            {(claim.approvalRequired || claim.approvalFlow === "HR" || claim.status === "HR_PENDING" || claim.status === "HR_REJECTED" || claim.hrReviewedAt) && (
              <>
                <View style={styles.stepConnector} />
                <View style={styles.workflowStepRow}>
                  <View
                    style={[
                      styles.stepCircle,
                      claim.status === "HR_REJECTED"
                        ? styles.stepRejected
                        : claim.status === "HR_PENDING"
                        ? styles.stepInProgress
                        : styles.stepCompleted,
                    ]}
                  >
                    {claim.status === "HR_REJECTED" ? (
                      <AlertCircle size={15} color="#ffffff" />
                    ) : claim.status === "HR_PENDING" ? (
                      <Clock size={15} color="#ffffff" />
                    ) : (
                      <CheckCircle2 size={15} color="#ffffff" />
                    )}
                  </View>
                  <View style={styles.stepContent}>
                    <Text style={styles.stepName}>2. HR Admin Verification</Text>
                    <Text style={styles.stepDesc}>
                      {claim.status === "HR_PENDING"
                        ? "Awaiting HR Admin review & verification"
                        : claim.status === "HR_REJECTED"
                        ? `Rejected by HR Admin: ${claim.hrRemarks || "Requirements not met"}`
                        : `Verified & Approved by HR Admin${claim.hrReviewedAt ? ` (${formatDateTime(claim.hrReviewedAt)})` : ""}`}
                    </Text>
                  </View>
                </View>
              </>
            )}

            {/* Step 3 (or 2 if no HR): Accounts Audit & Payment */}
            <View style={styles.stepConnector} />
            <View style={styles.workflowStepRow}>
              <View
                style={[
                  styles.stepCircle,
                  claim.status === "ACCOUNTS_REJECTED"
                    ? styles.stepRejected
                    : ["PAID", "DISBURSED", "SETTLED", "ACCOUNTS_APPROVED"].includes(String(claim.status || "").toUpperCase()) || claim.paymentStatus === "PAID"
                    ? styles.stepCompleted
                    : claim.status === "ACCOUNTS_PENDING"
                    ? styles.stepInProgressBlue
                    : styles.stepWaiting,
                ]}
              >
                {claim.status === "ACCOUNTS_REJECTED" ? (
                  <AlertCircle size={15} color="#ffffff" />
                ) : ["PAID", "DISBURSED", "SETTLED", "ACCOUNTS_APPROVED"].includes(String(claim.status || "").toUpperCase()) || claim.paymentStatus === "PAID" ? (
                  <CheckCircle2 size={15} color="#ffffff" />
                ) : (
                  <Clock size={15} color="#ffffff" />
                )}
              </View>
              <View style={styles.stepContent}>
                <Text style={styles.stepName}>
                  {(claim.approvalRequired || claim.approvalFlow === "HR" || claim.status === "HR_PENDING" || claim.status === "HR_REJECTED" || claim.hrReviewedAt) ? "3. Accounts Audit & Payment" : "2. Accounts Audit & Payment"}
                </Text>
                <Text style={styles.stepDesc}>
                  {["PAID", "DISBURSED", "SETTLED", "ACCOUNTS_APPROVED"].includes(String(claim.status || "").toUpperCase()) || claim.paymentStatus === "PAID"
                    ? `Payment disbursed ₹${claim.paidAmount || claim.grandAllowed || claim.grandRequested}${claim.paymentMethod ? ` via ${claim.paymentMethod}` : ""}${claim.utr ? ` (UTR: ${claim.utr})` : ""}`
                    : claim.status === "ACCOUNTS_REJECTED"
                    ? `Rejected by Accounts: ${claim.accountsRemarks || "Rejected"}`
                    : claim.status === "ACCOUNTS_PENDING"
                    ? "Pending Accounts Admin audit & payment disbursement"
                    : "Waiting for HR Admin approval before Accounts"}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Rejection notice if rejected */}
        {["REJECTED", "ACCOUNTS_REJECTED", "HR_REJECTED"].includes(claim.status) && (
          <View style={styles.rejectionCard}>
            <Text style={styles.rejectionTitle}>Claim Rejected</Text>
            <Text style={styles.rejectionText}>
              {claim.accountsRemarks || claim.rejectionReason || claim.hrRemarks || "This claim was rejected. Tap 'Edit & Resubmit' below to make changes and submit again."}
            </Text>
          </View>
        )}

        {/* Trip info if available */}
        {hasTripInfo && (
          <>
            <Text style={styles.sectionTitle}>Trip Information</Text>
            <View style={styles.card}>
              {claim.trip?.customerName ? <Text style={styles.cardText}>Customer: {claim.trip.customerName}</Text> : null}
              {claim.trip?.purpose ? <Text style={styles.cardText}>Purpose: {claim.trip.purpose}</Text> : null}
              {claim.trip?.destination ? (
                <Text style={styles.cardText}>
                  Location: {claim.trip.destination}{claim.trip.destinationClass ? ` (Class ${claim.trip.destinationClass})` : ""}
                </Text>
              ) : null}
              {claim.trip?.startDate && (
                <Text style={styles.cardText}>
                  Date{claim.trip.endDate && claim.trip.endDate !== claim.trip.startDate ? "s" : ""}: {String(claim.trip.startDate).slice(0, 10)}
                  {claim.trip.endDate && claim.trip.endDate !== claim.trip.startDate ? ` → ${String(claim.trip.endDate).slice(0, 10)}` : ""}
                </Text>
              )}
            </View>
          </>
        )}

        {/* Policy */}
        <Text style={styles.sectionTitle}>Policy</Text>
        <View style={styles.card}>
          <Text style={styles.cardText}>
            {claim.policyCode || "Standard Policy"} {claim.policyVersion ? `v${claim.policyVersion}` : ""}
          </Text>
          {isLodging && (
            <Text style={styles.cardText}>
              Shared Lodging Rule: {claim.policySnapshot?.sharedLodgingRule || "RULE_75"}
            </Text>
          )}
          <Text style={styles.cardText}>Policy rules applied per active company guidelines.</Text>
        </View>

        {/* Employee claims */}
        <Text style={styles.sectionTitle}>Employee Claims ({claim.employeeCount || 1})</Text>
        {(claim.employeeClaims || []).map((ec, idx) => (
          <View key={`ec_${idx}`} style={styles.employeeBlock}>
            <View style={styles.employeeHeader}>
              <View style={styles.avatarCircle}>
                <UserIcon size={16} color="#ffffff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.employeeName}>{ec.employee?.name || "Employee"}</Text>
                <Text style={styles.employeeMeta}>
                  {ec.employee?.levelName || "Level N/A"}
                  {ec.employee?.levelNumber ? ` (Level ${ec.employee.levelNumber})` : ""}
                  {ec.employee?.gradeCode ? ` · Grade ${ec.employee.gradeCode.toUpperCase()}` : ""}
                  {ec.employee?.department ? ` · ${ec.employee.department}` : ""}
                </Text>
              </View>
            </View>

            {isLodging && (!ec.items || ec.items.length === 0) && (
              <View style={styles.coClaimantBox}>
                <Text style={styles.coClaimantText}>
                  🛌 Co-sharing lodging stay with {claim.submittedByName || claim.submittedBy?.name || "primary claimant"} (Covered under room bill · ₹0 claimed by this employee)
                </Text>
              </View>
            )}

            {(ec.items || []).map((it, iIdx) => (
              <View key={`it_${idx}_${iIdx}`} style={styles.itemRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemType}>{typeInfo.name}</Text>
                  {it.sharedWith ? (
                    <Text style={styles.itemSharedWith}>Shared with: {it.sharedWith}</Text>
                  ) : null}
                  {it.expenseType === "TRAVEL" && it.mode ? (
                    <Text style={styles.itemDesc} numberOfLines={1}>Mode: {it.mode}</Text>
                  ) : it.expenseType === "CONVEYANCE" && it.vehicle ? (
                    <Text style={styles.itemDesc} numberOfLines={1}>
                      {String(it.vehicle).toUpperCase()}{it.distanceKm ? ` · ${it.distanceKm} km` : ""}
                    </Text>
                  ) : null}
                  {it.days && it.days > 1 ? (
                    <Text style={styles.itemDesc}>Duration: {it.days} days</Text>
                  ) : null}
                  {it.description ? (
                    <Text style={styles.itemNoteText} numberOfLines={2}>Note: {it.description}</Text>
                  ) : null}
                  {!isOther && it.formula ? (
                    <Text style={styles.itemFormula} numberOfLines={2}>{it.formula}</Text>
                  ) : null}

                  {/* Attached Proof Receipts - Tap to Preview */}
                  {it.attachments && it.attachments.length > 0 && (
                    <View style={styles.detailAttList}>
                      {it.attachments.map((att, aIdx) => {
                        const previewUri = att.url || att.localUri;
                        return (
                          <TouchableOpacity
                            key={aIdx}
                            style={styles.detailAttCard}
                            activeOpacity={0.7}
                            onPress={() => {
                              if (previewUri) {
                                setPhotoPreviewModal({
                                  visible: true,
                                  uri: previewUri,
                                  title: att.name || `Receipt Proof #${aIdx + 1}`,
                                });
                              }
                            }}
                          >
                            {previewUri ? (
                              <Image source={{ uri: previewUri }} style={styles.detailAttThumb} resizeMode="cover" />
                            ) : (
                              <View style={styles.detailAttIconPlaceholder}>
                                <FileCheck size={14} color="#059669" />
                              </View>
                            )}
                            <View style={{ flex: 1 }}>
                              <Text style={styles.detailAttName} numberOfLines={1}>
                                {att.name || `Receipt #${aIdx + 1}`}
                              </Text>
                              <Text style={styles.detailAttSub}>Tap to view full receipt</Text>
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

                  {/* Plain Language Limit & Allowance Explanation */}
                  <View style={[
                    styles.plainExplanationCard,
                    it.excessAmount > 0 ? styles.plainExplanationExcess : styles.plainExplanationAllowed
                  ]}>
                    <Text style={[
                      styles.plainExplanationText,
                      it.excessAmount > 0 ? { color: "#7f1d1d" } : { color: "#064e3b" }
                    ]}>
                      💡 {it.plainExplanation || it.calculationBreakdown?.plainExplanation || (
                        it.excessAmount > 0
                          ? `Your limit is ${it.calculationBreakdown?.limitText || `₹${it.allowedAmount}`} and your claimed value is ₹${it.requestedAmount}. Therefore, ₹${it.allowedAmount} is allowed and ₹${it.excessAmount} is excess.`
                          : `Your limit is ${it.calculationBreakdown?.limitText || `₹${it.allowedAmount}`} and your claimed value is ₹${it.requestedAmount}. Since your bill is within the limit, ₹${it.allowedAmount} is fully allowed.`
                      )}
                    </Text>
                  </View>
                </View>

                {isOther ? (
                  <View style={styles.itemAmt}>
                    <Text style={styles.itemRequested}>₹{it.requestedAmount}</Text>
                  </View>
                ) : (
                  <View style={styles.itemAmt}>
                    <Text style={styles.itemRequested}>₹{it.requestedAmount}</Text>
                    <Text style={styles.itemAllowed}>Allowed ₹{it.allowedAmount}</Text>
                    {it.excessAmount > 0 && <Text style={styles.itemExcess}>Excess ₹{it.excessAmount}</Text>}
                  </View>
                )}
              </View>
            ))}

            <View style={styles.employeeTotals}>
              {isOther ? (
                <Text style={styles.employeeTotalText}>Total Amount: ₹{ec.requestedTotal}</Text>
              ) : isLodging && (!ec.items || ec.items.length === 0) ? (
                <Text style={styles.employeeTotalText}>
                  Total Claimed by Employee: ₹0 (Room covered by {claim.submittedByName || claim.submittedBy?.name || "Applicant"})
                </Text>
              ) : (
                <Text style={styles.employeeTotalText}>
                  Total: Requested ₹{ec.requestedTotal} · Allowed ₹{ec.allowedTotal}{ec.excessTotal > 0 ? ` · Excess ₹${ec.excessTotal}` : ""}
                </Text>
              )}
            </View>
          </View>
        ))}

        {/* Grand totals */}
        <View style={styles.grandBox}>
          <Text style={styles.grandTitle}>Grand Totals (Combined Claim)</Text>
          {isOther ? (
            <Text style={styles.grandText}>Total Amount ₹{claim.grandRequested}</Text>
          ) : (
            <>
              <Text style={styles.grandText}>Requested ₹{claim.grandRequested}</Text>
              <Text style={[styles.grandText, { color: "#059669" }]}>Allowed ₹{claim.grandAllowed}</Text>
              <Text style={[styles.grandText, { color: claim.grandExcess > 0 ? "#dc2626" : "#94a3b8" }]}>
                Non-Reimbursable Excess ₹{claim.grandExcess}
              </Text>
            </>
          )}

          {!isOwner && (
            <View style={styles.yourShareBox}>
              <Text style={styles.yourShareTitle}>Your Personal Share</Text>
              <Text style={styles.yourShareValue}>
                ₹{claim.userRequested !== undefined ? claim.userRequested : 0}
              </Text>
              <Text style={styles.yourShareSub}>
                {isLodging
                  ? `Hotel/room bill (₹${claim.grandRequested}) is claimed by ${claim.submittedByName || claim.submittedBy?.name || "Applicant"}.`
                  : "Your separate reimbursable items total."}
              </Text>
            </View>
          )}
        </View>

        {/* Deadline warnings */}
        {claim.deadlineWarnings && claim.deadlineWarnings.length > 0 && (
          <View style={styles.warningBox}>
            <Text style={styles.warningTitle}>Deadline Warnings</Text>
            {claim.deadlineWarnings.map((w, i) => (
              <Text key={i} style={styles.warningText}>• {w}</Text>
            ))}
          </View>
        )}

        {/* Approval / timeline */}
        {claim.approvalHistory && claim.approvalHistory.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Approval History</Text>
            <View style={styles.card}>
              {claim.approvalHistory.map((a, i) => (
                <Text key={i} style={styles.cardText}>
                  {a.action} by {a.role} — {a.timestamp ? String(a.timestamp).slice(0, 16) : ""} {a.remarks ? `(${a.remarks})` : ""}
                </Text>
              ))}
            </View>
          </>
        )}

        {/* Disbursement info */}
        {claim.status === "DISBURSED" && (
          <>
            <Text style={styles.sectionTitle}>Disbursement</Text>
            <View style={styles.card}>
              <Text style={styles.cardText}>Paid: ₹{claim.paidAmount}</Text>
              <Text style={styles.cardText}>Method: {claim.paymentMethod}</Text>
              {claim.utr && <Text style={styles.cardText}>UTR: {claim.utr}</Text>}
              {claim.accountsRemarks && <Text style={styles.cardText}>Remarks: {claim.accountsRemarks}</Text>}
            </View>
          </>
        )}

        {/* Actions for draft or rejected claims */}
        {isOwner && ["DRAFT", "REJECTED", "ACCOUNTS_REJECTED", "HR_REJECTED", "RETURNED", "CANCELLED"].includes(claim.status) && (
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={styles.deleteActionBtn}
              onPress={handleDelete}
              disabled={submitting}
            >
              <Trash2 size={16} color="#dc2626" />
              <Text style={styles.deleteActionBtnText}>Delete</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.editBtn}
              onPress={() => navigation.navigate("CreateExpenseClaim", { claimId: claim._id })}
            >
              <Pencil size={17} color="#ffffff" />
              <Text style={styles.editBtnText}>
                {claim.status === "DRAFT" ? "Edit Draft" : "Edit & Resubmit"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit} disabled={submitting}>
              {submitting ? <ActivityIndicator color="#ffffff" size="small" /> : <Send size={17} color="#ffffff" />}
              <Text style={styles.submitBtnText}>Submit Claim</Text>
            </TouchableOpacity>
          </View>
        )}
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
                  source={{ uri: photoPreviewModal.uri }}
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

      {/* Global Bottom HR Footer */}
      <HRModuleFooter navigation={navigation} currentScreen="expenseClaim" />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f1f5f9" },
  scrollContent: { padding: 16, paddingBottom: 100 },
  retryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#dc2626",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
  retryBtnText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 14,
  },
  loadingBox: { flex: 1, justifyContent: "center", alignItems: "center" },
  notFound: { textAlign: "center", marginTop: 40, color: "#64748b" },
  statusBox: { backgroundColor: "#eef2ff", borderRadius: 14, padding: 14, borderWidth: 1, borderColor: "#c7d2fe" },
  statusRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  statusLabel: { fontSize: 12, color: "#4f46e5", fontWeight: "700" },
  statusValue: { fontSize: 12, color: "#312e81", fontWeight: "800", textAlign: "right" },
  rejectionCard: {
    backgroundColor: "#fef2f2",
    borderRadius: 14,
    padding: 14,
    marginTop: 12,
    borderWidth: 1,
    borderColor: "#fecaca",
  },
  rejectionTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: "#dc2626",
    marginBottom: 4,
  },
  rejectionText: {
    fontSize: 12,
    color: "#991b1b",
    lineHeight: 18,
    fontWeight: "500",
  },
  sectionTitle: { fontSize: 14, fontWeight: "800", color: "#0f172a", marginTop: 18, marginBottom: 8 },
  card: { backgroundColor: "#ffffff", borderRadius: 12, padding: 12, borderWidth: 1, borderColor: "#e2e8f0", gap: 5 },
  cardText: { fontSize: 12, color: "#334155", lineHeight: 18 },
  employeeBlock: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  employeeHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 },
  avatarCircle: { width: 32, height: 32, borderRadius: 16, backgroundColor: "#4f46e5", alignItems: "center", justifyContent: "center" },
  employeeName: { fontSize: 14, fontWeight: "800", color: "#0f172a" },
  employeeMeta: { fontSize: 11, color: "#4f46e5", marginTop: 1 },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
  },
  itemType: { fontSize: 12, fontWeight: "800", color: "#0f172a" },
  itemDesc: { fontSize: 11, color: "#64748b" },
  itemFormula: { fontSize: 10, color: "#64748b", marginTop: 2 },
  itemAmt: { alignItems: "flex-end" },
  itemRequested: { fontSize: 12, fontWeight: "700", color: "#0f172a" },
  itemAllowed: { fontSize: 11, color: "#059669", fontWeight: "600" },
  itemExcess: { fontSize: 11, color: "#dc2626", fontWeight: "600" },
  employeeTotals: { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: "#f1f5f9" },
  employeeTotalText: { fontSize: 12, fontWeight: "800", color: "#334155" },
  grandBox: { backgroundColor: "#0f172a", borderRadius: 14, padding: 16, marginTop: 8 },
  grandTitle: { fontSize: 14, fontWeight: "800", color: "#ffffff", marginBottom: 6 },
  grandText: { fontSize: 15, fontWeight: "800", color: "#ffffff", marginVertical: 2 },
  warningBox: { backgroundColor: "#fffbeb", borderRadius: 12, padding: 12, marginTop: 12, borderWidth: 1, borderColor: "#fde68a" },
  warningTitle: { fontSize: 13, fontWeight: "800", color: "#92400e", marginBottom: 4 },
  itemNoteText: { fontSize: 11, color: "#334155", fontStyle: "italic", marginTop: 2 },
  itemSharedWith: { fontSize: 11, color: "#4f46e5", fontWeight: "700", marginTop: 1 },
  itemAttachText: { fontSize: 10, color: "#059669", marginTop: 2, fontWeight: "600" },
  detailAttList: { marginTop: 6, gap: 6 },
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
  detailAttThumb: {
    width: 36,
    height: 36,
    borderRadius: 6,
    backgroundColor: "#e2e8f0",
  },
  detailAttIconPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 6,
    backgroundColor: "#ecfdf5",
    alignItems: "center",
    justifyContent: "center",
  },
  detailAttName: {
    fontSize: 11,
    fontWeight: "800",
    color: "#0f172a",
  },
  detailAttSub: {
    fontSize: 9,
    fontWeight: "600",
    color: "#64748b",
    marginTop: 1,
  },
  detailAttEyePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "#eef2ff",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  detailAttEyeText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#4f46e5",
  },
  photoModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.85)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  photoModalContainer: {
    width: "100%",
    maxHeight: "85%",
    backgroundColor: "#0f172a",
    borderRadius: 20,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  photoModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.1)",
  },
  photoModalTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: "#ffffff",
  },
  photoModalCloseBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  photoModalBody: {
    width: "100%",
    height: 400,
    backgroundColor: "#020617",
    alignItems: "center",
    justifyContent: "center",
  },
  photoModalImage: {
    width: "100%",
    height: "100%",
  },
  photoModalNoImg: {
    alignItems: "center",
    justifyContent: "center",
  },
  photoModalNoImgText: {
    fontSize: 12,
    color: "#94a3b8",
    fontWeight: "600",
  },
  coClaimantBox: {
    backgroundColor: "#ecfdf5",
    borderRadius: 8,
    padding: 8,
    marginVertical: 4,
    borderWidth: 1,
    borderColor: "#a7f3d0",
  },
  coClaimantText: { fontSize: 11, color: "#047857", fontWeight: "600" },
  plainExplanationCard: {
    padding: 8,
    borderRadius: 8,
    marginTop: 6,
    borderWidth: 1,
  },
  plainExplanationAllowed: {
    backgroundColor: "#f0fdf4",
    borderColor: "#bbf7d0",
  },
  plainExplanationExcess: {
    backgroundColor: "#fef2f2",
    borderColor: "#fecaca",
  },
  plainExplanationText: {
    fontSize: 10,
    fontWeight: "700",
    lineHeight: 14,
  },
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
  workflowCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 16,
    marginTop: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  workflowTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0f172a",
    marginBottom: 12,
  },
  workflowStepRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  stepCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  stepCompleted: {
    backgroundColor: "#059669",
  },
  stepInProgress: {
    backgroundColor: "#d97706",
  },
  stepInProgressBlue: {
    backgroundColor: "#2563eb",
  },
  stepRejected: {
    backgroundColor: "#dc2626",
  },
  stepWaiting: {
    backgroundColor: "#94a3b8",
  },
  stepConnector: {
    width: 2,
    height: 18,
    backgroundColor: "#cbd5e1",
    marginLeft: 13,
    marginVertical: 2,
  },
  stepContent: {
    flex: 1,
  },
  stepName: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1e293b",
  },
  stepDesc: {
    fontSize: 11,
    color: "#64748b",
    marginTop: 2,
    lineHeight: 15,
  },
  restrictedContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    marginTop: 60,
  },
  restrictedIconBox: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#f1f5f9",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  restrictedTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0f172a",
    marginBottom: 8,
  },
  restrictedSubtext: {
    fontSize: 13,
    color: "#64748b",
    textAlign: "center",
    lineHeight: 18,
    marginBottom: 24,
  },
  restrictedBackBtn: {
    backgroundColor: "#4f46e5",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
  restrictedBackBtnText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 14,
  },
  coClaimantBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    backgroundColor: "#eef2ff",
    borderWidth: 1,
    borderColor: "#c7d2fe",
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
  },
  coClaimantBannerTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: "#4f46e5",
    marginBottom: 2,
  },
  coClaimantBannerText: {
    fontSize: 12,
    color: "#4338ca",
    lineHeight: 16,
  },
  yourShareBox: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
  },
  yourShareTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: "#4f46e5",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  yourShareValue: {
    fontSize: 18,
    fontWeight: "900",
    color: "#059669",
    marginTop: 2,
  },
  yourShareSub: {
    fontSize: 11,
    color: "#64748b",
    marginTop: 2,
    lineHeight: 15,
  },
});

export default ExpenseClaimDetailScreen;
