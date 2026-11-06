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

const CLAIM_TYPE_FILTERS = [
  { code: "ALL", label: "All" },
  { code: "COMBINE", label: "Combine" },
  { code: "FOOD", label: "Food" },
  { code: "TRAVEL", label: "Travel" },
  { code: "CONVEYANCE", label: "Local Conveyance" },
  { code: "LODGING", label: "Lodging" },
  { code: "STOCK_PURCHASE", label: "Stock Purchase" },
  { code: "OTHER", label: "Other Expense" },
];

const getClaimTypeInfo = (claim) => {
  if (!claim) return { code: "OTHER", name: "Expense Claim", label: "Expense" };
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
        name: (claim.employeeCount || claim.numberOfEmployees) > 1 ? "Shared Lodging Claim" : "Lodging Claim",
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

const ExpenseDashboardScreen = ({ navigation }) => {
  const [claims, setClaims] = useState([]);
  const [selectedTypeFilter, setSelectedTypeFilter] = useState("ALL");
  const [currentUserId, setCurrentUserId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [activePolicy, setActivePolicy] = useState(null);
  const [wallet, setWallet] = useState(null);

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

      const [claimsRes, policy, walletRes] = await Promise.all([
        expenseApi.getMyClaims("ALL"),
        expenseApi.getActivePolicy(),
        expenseApi.getMyPettyCashWallet(),
      ]);
      if (walletRes?.success) setWallet(walletRes.data);

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

  const isPayableForMe = (c) => {
    // Both applicant and tagged employees should have claims included in pending/disbursed stats
    return Boolean(c);
  };

  const summary = {
    total: claims.length,
    draft: claims.filter(c => {
      const creatorId = String(c.submittedBy?._id || c.submittedBy || c.createdBy?._id || c.createdBy || "");
      const isOwner = currentUserId ? creatorId === String(currentUserId) : true;
      if (!isOwner) return false;
      const st = String(c.status || "").toUpperCase();
      return st === "DRAFT" || st === "RETURNED";
    }).length,
    pending: claims.filter(c => {
      if (!isPayableForMe(c)) return false;
      const st = String(c.status || "").toUpperCase();
      const ps = String(c.paymentStatus || "").toUpperCase();
      const isPaid = ["PAID", "DISBURSED"].includes(ps) || ["PAID", "DISBURSED", "SETTLED", "FULLY_PAID"].includes(st);
      const isRejected = ["REJECTED", "HR_REJECTED", "ACCOUNTS_REJECTED", "CANCELLED"].includes(st) || ps === "REJECTED";
      const isDraft = st === "DRAFT" || st === "RETURNED";
      return !isPaid && !isRejected && !isDraft;
    }).length,
    disbursed: claims.filter(c => {
      if (!isPayableForMe(c)) return false;
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
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
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
        {/* Petty Cash Wallet Banner — shown only when employee petty cash option is ON */}
        {Boolean(wallet?.enabled) && (
          <TouchableOpacity
            style={[
              {
                backgroundColor: wallet?.negative ? "#c2262eff" : "#312e81",
                borderRadius: 16,
                padding: 14,
                marginBottom: 12,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              },
            ]}
            activeOpacity={0.85}
            onPress={() => navigation.navigate("PettyCashWallet")}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ color: "#97e2f0ff", fontSize: 11, fontWeight: "700" }}>
                PETTY CASH WALLET {wallet?.negative ? "• NEGATIVE" : ""}
              </Text>
              <Text style={{ color: "#ffffff", fontSize: 20, fontWeight: "800", marginTop: 2 }}>
                {`${wallet.balance < 0 ? "-₹" : "₹"}${Math.abs(Number(wallet.balance) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              </Text>
              <Text style={{ color: "#c7d2fe", fontSize: 11, fontWeight: "700", marginTop: 2 }}>
                {`Base Limit: ₹${Math.abs(Number(wallet.baseLimit) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              </Text>
            </View>
            <View style={{ backgroundColor: "rgba(255,255,255,0.18)", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 }}>
              <Text style={{ color: "#ffffff", fontSize: 12, fontWeight: "800" }}>Open Wallet →</Text>
            </View>
          </TouchableOpacity>
        )}

        {/* Stats Row in Previous UI Colors */}
        <View style={styles.statsRow}>
          {renderStat("Total", summary.total, "#4f46e5")}
          {renderStat("Drafts", summary.draft, "#64748b")}
          {renderStat("Pending", summary.pending, "#d97706")}
          {renderStat("Paid", summary.disbursed, "#059669")}
        </View>

        {/* Action Buttons: Normal Claim & Lodging Claim in Button UI */}
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
            style={styles.lodgingClaimBtn}
            onPress={() => navigation.navigate("CreateExpenseClaim", { mode: "LODGING" })}
            activeOpacity={0.85}
          >
            <BedDouble size={18} color="#ffffff" />
            <Text style={styles.claimBtnText}>Lodging Expense Claim</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionTitle}>My Claims</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, paddingBottom: 12 }}
        >
          {CLAIM_TYPE_FILTERS.map((f) => {
            const active = selectedTypeFilter === f.code;
            return (
              <TouchableOpacity
                key={f.code}
                onPress={() => setSelectedTypeFilter(f.code)}
                activeOpacity={0.8}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: 999,
                  backgroundColor: active ? "#4f46e5" : "#ffffff",
                  borderWidth: 1,
                  borderColor: active ? "#4f46e5" : "#cbd5e1",
                }}
              >
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: "700",
                    color: active ? "#ffffff" : "#475569",
                  }}
                >
                  {f.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
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
        ) : claims.filter((c) => selectedTypeFilter === "ALL" || getClaimTypeInfo(c).code === selectedTypeFilter).length === 0 ? (
          <View style={styles.emptyBox}>
            <Receipt size={36} color="#cbd5e1" />
            <Text style={styles.emptyText}>
              {selectedTypeFilter === "ALL" ? "No expense claims yet." : "No matching expense claims."}
            </Text>
            <Text style={styles.emptySubtext}>
              {selectedTypeFilter === "ALL"
                ? 'Tap "Expense Claim" or "Lodging Expense Claim" above to file a claim.'
                : "Try selecting another claim type filter above."}
            </Text>
          </View>
        ) : (
          claims
            .filter((c) => selectedTypeFilter === "ALL" || getClaimTypeInfo(c).code === selectedTypeFilter)
            .map((c) => {
            const statusInfo = getDisplayStatus(c.status, c);
            const typeInfo = getClaimTypeInfo(c);
            const claimTypeCode = (typeInfo.code || "").toUpperCase();
            const allEntryTypes = [
              ...(Array.isArray(c.entries) ? c.entries.map((e) => String(e?.expenseType || "").toUpperCase()) : []),
              ...(Array.isArray(c.employeeClaims?.[0]?.items) ? c.employeeClaims[0].items.map((it) => String(it?.expenseType || "").toUpperCase()) : []),
            ];
            const showCityInfo =
              ["FOOD", "LODGING", "TRAVEL", "TOUR", "TRIP"].includes(claimTypeCode) ||
              c.claimMode === "LODGING" ||
              allEntryTypes.some((t) => ["FOOD", "LODGING", "TRAVEL", "TOUR", "TRIP"].includes(t));
            const isOtherType = claimTypeCode === "OTHER" || claimTypeCode === "STOCK_PURCHASE";
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
            ].includes(statusUpper) || ["PAID", "DISBURSED", "AWAITING_DISBURSEMENT"].includes(String(c.paymentStatus || "").toUpperCase()) || String(c.accountsApproval?.status || "").toUpperCase() === "APPROVED";
            const isDraftOrRejected = [
              "DRAFT",
              "REJECTED",
              "ACCOUNTS_REJECTED",
              "HR_REJECTED",
              "RETURNED",
              "CANCELLED",
            ].includes(statusUpper);
            const maStatusUpper = String(c.managerApproval?.status || "").toUpperCase();
            const maKindUpper = String(c.managerApproval?.kind || "NONE").toUpperCase();
            const faStatusUpper = String(c.financeApproval?.status || "").toUpperCase();
            const isFirstApprovalDone = !isDraftOrRejected && Boolean(
              isApprovedOrPaid ||
              faStatusUpper === "PENDING" ||
              faStatusUpper === "APPROVED" ||
              (maStatusUpper === "APPROVED" && (maKindUpper !== "NONE" || Boolean(c.managerApproval?.decidedAt || c.managerApproval?.approver))) ||
              c.permissions?.isFirstApprovalApproved
            );
            const isEditable = isOwner && !isApprovedOrPaid && !isFirstApprovalDone && (c.permissions?.canEdit !== false);
            const isDeletable = isOwner && isDraftOrRejected;

            const isLodgingClaim = c.claimMode === "LODGING" || claimTypeCode === "LODGING";
            const appliedDateText = c.submittedAt
              ? `Applied: ${formatDateTime(c.submittedAt)}`
              : `Created: ${formatDateTime(c.createdAt)}`;

            const dateRangeText = isLodgingClaim && c.fromDate && c.toDate
              ? `${String(c.fromDate).slice(0, 10)} → ${String(c.toDate).slice(0, 10)}`
              : c.claimDate ? String(c.claimDate).slice(0, 10) : "";

            const reqAmt = Number(
              c.requestedAmount !== undefined
                ? c.requestedAmount
                : (c.grandRequested !== undefined ? c.grandRequested : (c.amount || 0))
            );
            const allowAmt = Number(
              c.allowedAmount !== undefined
                ? c.allowedAmount
                : (c.grandAllowed !== undefined ? c.grandAllowed : reqAmt)
            );
            const excAmt = Number(
              c.excessAmount !== undefined
                ? c.excessAmount
                : (c.grandExcess !== undefined ? c.grandExcess : 0)
            );

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
                              navigation.navigate("CreateExpenseClaim", { claimId: c._id, mode: isLodgingClaim ? "LODGING" : "NORMAL" });
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

  // Button UI for Normal and Lodging claims
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
  lodgingClaimBtn: {
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
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "space-between",
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
  },
  amountCol: { flex: 1, minWidth: 80 },
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
