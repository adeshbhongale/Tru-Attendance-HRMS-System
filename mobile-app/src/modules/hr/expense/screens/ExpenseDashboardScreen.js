import {
  Image as ImageIcon,
  Pencil,
  Plus,
  Receipt,
  Trash2,
  X
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
import expenseApi from "../api/expenseApi";
import ExpenseHeader from "../components/ExpenseHeader";

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

const ExpenseDashboardScreen = ({ navigation }) => {
  const [claims, setClaims] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activePolicy, setActivePolicy] = useState(null);
  const [photoPreviewModal, setPhotoPreviewModal] = useState({ visible: false, uri: "", title: "" });

  const load = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    try {
      const [list, policy] = await Promise.all([
        expenseApi.getMyClaims(),
        expenseApi.getActivePolicy(),
      ]);
      setClaims(list || []);
      setActivePolicy(policy);
    } catch (err) {
      console.warn("Load expense dashboard error", err);
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
      `Are you sure you want to permanently delete this ${c.claimNumber || "draft"} claim?`,
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
    draft: claims.filter(c => String(c.status || "").toUpperCase() === "DRAFT").length,
    pending: claims.filter(c => ["SUBMITTED", "HR_PENDING", "ACCOUNTS_PENDING", "RETURNED"].includes(String(c.status || "").toUpperCase())).length,
    disbursed: claims.filter(c => ["PAID", "ACCOUNTS_APPROVED", "DISBURSED", "SETTLED"].includes(String(c.status || "").toUpperCase())).length,
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
          <TouchableOpacity style={styles.newBtn} onPress={() => navigation.navigate("CreateExpenseClaim")}>
            <Plus size={18} color="#ffffff" />
          </TouchableOpacity>
        }
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(false); }} />}
      >
        <View style={styles.statsRow}>
          {renderStat("Total", summary.total, "#4f46e5")}
          {renderStat("Drafts", summary.draft, "#64748b")}
          {renderStat("Pending", summary.pending, "#d97706")}
          {renderStat("Paid", summary.disbursed, "#059669")}
        </View>

        <TouchableOpacity
          style={styles.newClaimBtn}
          onPress={() => navigation.navigate("CreateExpenseClaim")}
        >
          <Plus size={18} color="#ffffff" />
          <Text style={styles.newClaimBtnText}>New Expense Claim</Text>
        </TouchableOpacity>

        <Text style={styles.sectionTitle}>My Claims</Text>
        {loading ? (
          <ActivityIndicator size="large" color="#4f46e5" style={{ marginTop: 30 }} />
        ) : claims.length === 0 ? (
          <View style={styles.emptyBox}>
            <Receipt size={36} color="#cbd5e1" />
            <Text style={styles.emptyText}>No expense claims yet.</Text>
            <Text style={styles.emptySubtext}>Tap "New Expense Claim" to file for yourself or your team.</Text>
          </View>
        ) : (
          claims.map((c) => {
            const statusInfo = getDisplayStatus(c.status);
            const typeInfo = getClaimTypeInfo(c);
            const isOtherType = typeInfo.code === "OTHER";
            const empCount = c.employeeCount || 1;
            const statusUpper = String(c.status || "").toUpperCase();
            const isDeletable = [
              "DRAFT",
              "REJECTED",
              "ACCOUNTS_REJECTED",
              "HR_REJECTED",
              "RETURNED",
              "CANCELLED",
            ].includes(statusUpper);

            const appliedDateText = c.submittedAt
              ? `Applied: ${formatDateTime(c.submittedAt)}`
              : `Created: ${formatDateTime(c.createdAt)}`;

            return (
              <TouchableOpacity
                key={String(c._id)}
                style={styles.claimCard}
                activeOpacity={0.8}
                onPress={() => navigation.navigate("ExpenseClaimDetail", { claimId: c._id })}
              >
                <View style={styles.claimTopRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.claimTypeTitle}>{typeInfo.name}</Text>
                    <Text style={styles.claimMeta}>
                      {empCount} employee{empCount > 1 ? "s" : ""}{c.trip?.destination ? ` · ${c.trip.destination}` : ""}
                    </Text>
                    <Text style={styles.appliedDateText}>
                      📅 {appliedDateText}
                    </Text>
                  </View>
                  <View style={styles.statusContainer}>
                    {isDeletable && (
                      <View style={styles.actionIconsRow}>
                        <TouchableOpacity
                          style={styles.draftIconBtn}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          onPress={(e) => {
                            e.stopPropagation?.();
                            navigation.navigate("CreateExpenseClaim", { claimId: c._id });
                          }}
                          title="Edit"
                        >
                          <Pencil size={13} color="#4f46e5" />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.deleteIconBtn}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          onPress={(e) => {
                            e.stopPropagation?.();
                            handleDeleteClaim(c);
                          }}
                          title="Delete Claim"
                        >
                          <Trash2 size={13} color="#dc2626" />
                        </TouchableOpacity>
                      </View>
                    )}
                    <View style={[styles.statusBadge, { backgroundColor: statusInfo.color + "1A" }]}>
                      <Text style={[styles.statusText, { color: statusInfo.color }]}>{statusInfo.label}</Text>
                    </View>
                  </View>
                </View>

                {isOtherType ? (
                  <View style={styles.claimAmountsRow}>
                    <View style={styles.amountCol}>
                      <Text style={styles.amountLabel}>Total Amount</Text>
                      <Text style={styles.amountValue}>₹{c.grandRequested}</Text>
                    </View>
                  </View>
                ) : (
                  <View style={styles.claimAmountsRow}>
                    <View style={styles.amountCol}>
                      <Text style={styles.amountLabel}>Requested</Text>
                      <Text style={styles.amountValue}>₹{c.grandRequested}</Text>
                    </View>
                    <View style={styles.amountCol}>
                      <Text style={styles.amountLabel}>Allowed</Text>
                      <Text style={[styles.amountValue, { color: "#059669" }]}>₹{c.grandAllowed}</Text>
                    </View>
                    <View style={styles.amountCol}>
                      <Text style={styles.amountLabel}>Excess</Text>
                      <Text style={[styles.amountValue, { color: c.grandExcess > 0 ? "#dc2626" : "#94a3b8" }]}>
                        ₹{c.grandExcess}
                      </Text>
                    </View>
                  </View>
                )}
              </TouchableOpacity>
            );
          })
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
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f1f5f9" },
  scrollContent: { padding: 16, paddingBottom: 40 },
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
  newClaimBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#4f46e5",
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 16,
  },
  newClaimBtnText: { color: "#ffffff", fontWeight: "800", fontSize: 15 },
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
  historyProofSection: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
  },
  historyProofLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "#64748b",
    marginBottom: 6,
    textTransform: "uppercase",
  },
  historyProofScroll: {
    flexDirection: "row",
    gap: 8,
  },
  historyProofThumbCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#f8fafc",
    borderRadius: 8,
    padding: 6,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    maxWidth: 160,
  },
  historyProofImg: {
    width: 26,
    height: 26,
    borderRadius: 4,
    backgroundColor: "#e2e8f0",
  },
  historyProofIconPlaceholder: {
    width: 26,
    height: 26,
    borderRadius: 4,
    backgroundColor: "#ecfdf5",
    alignItems: "center",
    justifyContent: "center",
  },
  historyProofName: {
    fontSize: 10,
    fontWeight: "700",
    color: "#0f172a",
    flex: 1,
  },
  historyProofEyeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    backgroundColor: "#eef2ff",
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  historyProofEyeText: {
    fontSize: 9,
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
  cardActionFooter: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
  },
  cardEditBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#eef2ff",
    borderRadius: 8,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "#c7d2fe",
  },
  cardEditBtnText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#4f46e5",
  },
  cardDeleteBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#fef2f2",
    borderRadius: 8,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "#fecaca",
  },
  cardDeleteBtnText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#dc2626",
  },
});

export default ExpenseDashboardScreen;
