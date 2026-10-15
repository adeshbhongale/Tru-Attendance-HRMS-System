import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  AlertCircle,
  BedDouble,
  Image as ImageIcon,
  Pencil,
  Plus,
  Receipt,
  RefreshCw,
  Trash2,
  Users,
  X,
  Zap,
} from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
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

const ExpenseDashboardScreen = ({ navigation }) => {
  const [claims, setClaims] = useState([]);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [activePolicy, setActivePolicy] = useState(null);
  const [photoPreviewModal, setPhotoPreviewModal] = useState({ visible: false, uri: "", title: "" });

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

      const [claimsRes, policy] = await Promise.all([
        expenseApi.getMyClaims("ALL"),
        expenseApi.getActivePolicy(),
      ]);

      const list = claimsRes?.data?.claims || claimsRes?.data || claimsRes?.claims || (Array.isArray(claimsRes) ? claimsRes : []);

      // Defense-in-depth: Never render another user's draft claim
      const filtered = (list || []).filter((c) => {
        const creatorId = String(c.submittedBy?._id || c.submittedBy || c.createdBy?._id || c.createdBy || "");
        const statusUpper = String(c.status || "").toUpperCase();
        if (statusUpper === "DRAFT") {
          return uid ? creatorId === String(uid) : true;
        }
        if (uid && creatorId === String(uid)) return true;
        const isTagged = (c.employeeClaims || []).some(
          (ec) => String(ec.employee?.employeeId?._id || ec.employee?.employeeId || "") === String(uid)
        );
        return isTagged || (creatorId === String(uid));
      });

      setClaims(filtered);
      setActivePolicy(policy);
    } catch (err) {
      console.warn("Load expense dashboard error", err);
      setError(err?.response?.data?.message || err?.message || "Unable to load expense claims. Please check your network connection.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = navigation.addListener("focus", () => load(false));
    return unsubscribe;
  }, [navigation, load]);

  useEffect(() => { load(); }, [load]);

  const handleDeleteClaim = (c) => {
    Alert.alert(
      "Delete Expense Claim",
      `Are you sure you want to permanently delete this ${c.claimId || c.claimNumber || "draft"} claim?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              const res = await expenseApi.deleteClaim(c._id);
              if (res.success) {
                setClaims((prev) => prev.filter((item) => item._id !== c._id));
                Alert.alert("Deleted", "Claim deleted successfully.");
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

  const summary = {
    total: claims.length,
    draft: claims.filter(c => String(c.status || "").toUpperCase() === "DRAFT" || String(c.status || "").toUpperCase() === "RETURNED").length,
    pending: claims.filter(c => {
      const st = String(c.status || "").toUpperCase();
      const ps = String(c.paymentStatus || "").toUpperCase();
      const isPaid = ["PAID", "DISBURSED"].includes(ps) || ["PAID", "DISBURSED", "SETTLED", "FULLY_PAID"].includes(st);
      const isRejected = ["REJECTED", "HR_REJECTED", "ACCOUNTS_REJECTED", "CANCELLED"].includes(st) || ps === "REJECTED";
      const isDraft = st === "DRAFT" || st === "RETURNED";
      return !isPaid && !isRejected && !isDraft;
    }).length,
    disbursed: claims.filter(c => {
      const st = String(c.status || "").toUpperCase();
      const ps = String(c.paymentStatus || "").toUpperCase();
      return ["PAID", "DISBURSED"].includes(ps) || ["PAID", "DISBURSED", "SETTLED", "FULLY_PAID"].includes(st);
    }).length,
  };

  const renderStat = (label, value, color) => (
    <View style={[styles.statCard, { borderTopColor: color }]}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <ExpenseHeader
        title="Expense Claims"
        subtitle={activePolicy ? `${activePolicy.code} v${activePolicy.version}` : "Expense Management"}
        navigation={navigation}
        rightElement={
          <TouchableOpacity
            style={styles.newBtn}
            onPress={() => navigation.navigate("CreateExpenseClaim", { mode: "NORMAL" })}
          >
            <Plus size={18} color="#ffffff" />
          </TouchableOpacity>
        }
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(false); }} />}
      >
        {/* Stats Row in Previous UI Colors */}
        <View style={styles.statsRow}>
          {renderStat("Total", summary.total, "#4f46e5")}
          {renderStat("Drafts", summary.draft, "#64748b")}
          {renderStat("Pending", summary.pending, "#d97706")}
          {renderStat("Paid", summary.disbursed, "#059669")}
        </View>

        {/* Action Buttons: Normal Claim & Logging Claim in Button UI */}
        <View style={styles.buttonsRow}>
          <TouchableOpacity
            style={styles.normalClaimBtn}
            onPress={() => navigation.navigate("CreateExpenseClaim", { mode: "NORMAL" })}
            activeOpacity={0.85}
          >
            <Plus size={18} color="#ffffff" />
            <Text style={styles.claimBtnText}>Normal Expense Claim</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.loggingClaimBtn}
            onPress={() => navigation.navigate("CreateExpenseClaim", { mode: "LOGGING" })}
            activeOpacity={0.85}
          >
            <BedDouble size={18} color="#ffffff" />
            <Text style={styles.claimBtnText}>Logging Expense Claim</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionTitle}>My Claims</Text>
        {error ? (
          <View style={styles.errorBox}>
            <AlertCircle size={36} color="#ef4444" />
            <Text style={styles.errorTitle}>Unable to Load Claims</Text>
            <Text style={styles.errorSubtext}>{error}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={() => load(true)} activeOpacity={0.8}>
              <RefreshCw size={16} color="#ffffff" />
              <Text style={styles.retryBtnText}>Retry Now</Text>
            </TouchableOpacity>
          </View>
        ) : loading ? (
          <ActivityIndicator size="large" color="#4f46e5" style={{ marginTop: 30 }} />
        ) : claims.length === 0 ? (
          <View style={styles.emptyBox}>
            <Receipt size={36} color="#cbd5e1" />
            <Text style={styles.emptyText}>No expense claims yet.</Text>
            <Text style={styles.emptySubtext}>Tap "Expense Claim" or "Logging Expense Claim" above to file a claim.</Text>
          </View>
        ) : (
          claims.map((c) => {
            const statusInfo = getDisplayStatus(c.status, c);
            const typeInfo = getClaimTypeInfo(c);
            const claimTypeCode = (typeInfo.code || "").toUpperCase();
            const showCityInfo = ["FOOD", "LODGING", "TRAVEL", "TOUR", "TRIP"].includes(claimTypeCode);
            const isOtherType = claimTypeCode === "OTHER";
            const empCount = c.numberOfEmployees || c.employeeCount || 1;
            const statusUpper = String(c.status || "").toUpperCase();
            const creatorId = String(c.submittedBy?._id || c.submittedBy || c.createdBy?._id || c.createdBy || "");
            const isOwner = currentUserId ? creatorId === String(currentUserId) : true;
            const isApprovedOrPaid = [
              "ACCOUNTS_APPROVED",
              "APPROVED",
              "PAID",
              "DISBURSED",
              "SETTLED",
            ].includes(statusUpper) || ["PAID", "DISBURSED"].includes(String(c.paymentStatus || "").toUpperCase());
            const isEditable = isOwner && !isApprovedOrPaid;
            const isDeletable = isOwner && [
              "DRAFT",
              "REJECTED",
              "ACCOUNTS_REJECTED",
              "HR_REJECTED",
              "RETURNED",
              "CANCELLED",
            ].includes(statusUpper);

            const isLoggingClaim = c.claimMode === "LOGGING" || claimTypeCode === "LODGING";
            const appliedDateText = c.submittedAt
              ? `Applied: ${formatDateTime(c.submittedAt)}`
              : `Created: ${formatDateTime(c.createdAt)}`;

            const dateRangeText = isLoggingClaim && c.fromDate && c.toDate
              ? `${String(c.fromDate).slice(0, 10)} → ${String(c.toDate).slice(0, 10)}`
              : c.claimDate ? String(c.claimDate).slice(0, 10) : "";

            const reqAmt = c.requestedAmount !== undefined ? c.requestedAmount : (c.userRequested !== undefined ? c.userRequested : c.grandRequested || c.amount || 0);
            const allowAmt = c.allowedAmount !== undefined ? c.allowedAmount : (c.userAllowed !== undefined ? c.userAllowed : c.grandAllowed || reqAmt);
            const excAmt = c.excessAmount !== undefined ? c.excessAmount : (c.userExcess !== undefined ? c.userExcess : c.grandExcess || 0);

            return (
              <TouchableOpacity
                key={String(c._id)}
                style={styles.claimCard}
                activeOpacity={0.8}
                onPress={() => navigation.navigate("ExpenseClaimDetail", { claimId: c._id })}
              >
                {!isOwner ? (
                  <View style={styles.coClaimantBadge}>
                    <Users size={11} color="#4f46e5" />
                    <Text style={styles.coClaimantBadgeText}>
                      Filed by {c.submittedByName || c.submittedBy?.name || "Team Member"} · You are tagged
                    </Text>
                  </View>
                ) : null}

                <View style={styles.claimTopRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.claimTypeTitle}>{typeInfo.name}</Text>
                    <Text style={styles.claimMeta}>
                      {empCount} employee{empCount > 1 ? "s" : ""}
                      {showCityInfo && (c.destinationCity || c.trip?.destination) ? ` · ${c.destinationCity || c.trip?.destination}` : ""}
                      {c.customerName || c.trip?.customerName ? ` (${c.customerName || c.trip?.customerName})` : ""}
                    </Text>
                    <Text style={styles.appliedDateText}>
                      📅 {dateRangeText ? `${dateRangeText} · ` : ""}{appliedDateText}
                    </Text>
                  </View>

                  <View style={styles.statusContainer}>
                    {isEditable || isDeletable ? (
                      <View style={styles.actionIconsRow}>
                        {isEditable ? (
                          <TouchableOpacity
                            style={styles.draftIconBtn}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            onPress={(e) => {
                              e.stopPropagation?.();
                              navigation.navigate("CreateExpenseClaim", { claimId: c._id, mode: isLoggingClaim ? "LOGGING" : "NORMAL" });
                            }}
                          >
                            <Pencil size={13} color="#4f46e5" />
                          </TouchableOpacity>
                        ) : null}
                        {isDeletable ? (
                          <TouchableOpacity
                            style={styles.deleteIconBtn}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            onPress={(e) => {
                              e.stopPropagation?.();
                              handleDeleteClaim(c);
                            }}
                          >
                            <Trash2 size={13} color="#dc2626" />
                          </TouchableOpacity>
                        ) : null}
                      </View>
                    ) : null}
                    <View style={[styles.statusBadge, { backgroundColor: statusInfo.color + "1A" }]}>
                      <Text style={[styles.statusText, { color: statusInfo.color }]}>{statusInfo.label}</Text>
                    </View>
                  </View>
                </View>

                {c.fullPaymentRequested ? (
                  <View style={styles.fullPaymentBadge}>
                    <Zap size={11} color="#c2410c" />
                    <Text style={styles.fullPaymentText}>
                      Full Payment Requested {c.fullPaymentApproved ? "· Approved" : ""}
                    </Text>
                  </View>
                ) : null}

                {c.isLodgingCoveredByOther && (
                  <View style={styles.lodgingCoveredNote}>
                    <Text style={styles.lodgingCoveredText}>
                      🛌 Lodging covered by {c.submittedByName || c.submittedBy?.name || "Colleague"} · ₹0 claimed by you
                    </Text>
                  </View>
                )}

                {isOtherType ? (
                  <View style={styles.claimAmountsRow}>
                    <View style={styles.amountCol}>
                      <Text style={styles.amountLabel}>Total Amount</Text>
                      <Text style={styles.amountValue}>₹{reqAmt}</Text>
                    </View>
                  </View>
                ) : (
                  <View style={styles.claimAmountsRow}>
                    <View style={styles.amountCol}>
                      <Text style={styles.amountLabel}>Requested</Text>
                      <Text style={styles.amountValue}>₹{reqAmt}</Text>
                    </View>
                    <View style={styles.amountCol}>
                      <Text style={styles.amountLabel}>Allowed</Text>
                      <Text style={[styles.amountValue, { color: "#059669" }]}>₹{allowAmt}</Text>
                    </View>
                    <View style={styles.amountCol}>
                      <Text style={styles.amountLabel}>Excess</Text>
                      <Text style={[styles.amountValue, { color: excAmt > 0 ? "#dc2626" : "#94a3b8" }]}>
                        ₹{excAmt}
                      </Text>
                    </View>
                  </View>
                )}
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      {/* Photo Preview Modal */}
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
  errorBox: {
    backgroundColor: "#fef2f2",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#fecaca",
    padding: 24,
    alignItems: "center",
    marginVertical: 16,
  },
  errorTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#991b1b",
    marginTop: 10,
  },
  errorSubtext: {
    fontSize: 12,
    color: "#b91c1c",
    textAlign: "center",
    marginTop: 4,
    marginBottom: 16,
    lineHeight: 18,
  },
  retryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#dc2626",
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
  },
  retryBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#ffffff",
  },
  newBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#4f46e5",
    alignItems: "center",
    justifyContent: "center",
  },
  statsRow: { flexDirection: "row", gap: 8 },
  statCard: {
    flex: 1,
    backgroundColor: "#ffffff",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    borderTopWidth: 3,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  statValue: { fontSize: 20, fontWeight: "800" },
  statLabel: { fontSize: 11, color: "#64748b", marginTop: 2 },

  // Button UI for Normal and Logging claims
  buttonsRow: {
    flexDirection: "column",
    gap: 10,
    marginTop: 16,
  },
  normalClaimBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#4f46e5",
    borderRadius: 12,
    paddingVertical: 14,
  },
  loggingClaimBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#7c3aed",
    borderRadius: 12,
    paddingVertical: 14,
  },
  claimBtnText: { color: "#ffffff", fontWeight: "800", fontSize: 15 },

  sectionTitle: { fontSize: 14, fontWeight: "800", color: "#0f172a", marginTop: 20, marginBottom: 10 },
  emptyBox: { alignItems: "center", paddingVertical: 40 },
  emptyText: { fontSize: 15, fontWeight: "700", color: "#64748b", marginTop: 12 },
  emptySubtext: { fontSize: 12, color: "#94a3b8", marginTop: 4, textAlign: "center" },
  claimCard: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  coClaimantBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#eef2ff",
    borderWidth: 1,
    borderColor: "#c7d2fe",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    alignSelf: "flex-start",
    marginBottom: 8,
  },
  coClaimantBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#4f46e5",
  },
  fullPaymentBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#fff7ed",
    borderWidth: 1,
    borderColor: "#fed7aa",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: "flex-start",
    marginTop: 6,
  },
  fullPaymentText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#c2410c",
  },
  lodgingCoveredNote: {
    backgroundColor: "#eff6ff",
    borderWidth: 1,
    borderColor: "#bfdbfe",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginTop: 8,
    marginBottom: 4,
  },
  lodgingCoveredText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#1d4ed8",
  },
  claimTopRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  claimTypeTitle: { fontSize: 14, fontWeight: "800", color: "#0f172a" },
  claimMeta: { fontSize: 11, color: "#64748b", marginTop: 2 },
  appliedDateText: { fontSize: 10, color: "#64748b", fontWeight: "700", marginTop: 3 },
  statusContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  actionIconsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  draftIconBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#eef2ff",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#c7d2fe",
  },
  deleteIconBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#fef2f2",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#fecaca",
  },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  statusText: { fontSize: 11, fontWeight: "800" },
  claimAmountsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
  },
  amountCol: { flex: 1 },
  amountLabel: { fontSize: 10, color: "#94a3b8", fontWeight: "600" },
  amountValue: { fontSize: 14, fontWeight: "800", color: "#0f172a", marginTop: 1 },
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
});

export default ExpenseDashboardScreen;
