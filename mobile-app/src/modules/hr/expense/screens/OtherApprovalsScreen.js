import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import {
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock,
  FileText,
  Inbox,
  ShieldAlert,
  ShieldCheck,
  Tag,
  User,
  XCircle,
  Zap,
} from "lucide-react-native";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
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
import expenseApi from "../api/expenseApi";
import ExpenseHeader from "../components/ExpenseHeader";

const inr = (n) => `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

const fmtDate = (d) => {
  if (!d) return "";
  const x = new Date(d);
  if (isNaN(x.getTime())) return "";
  return x.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};

const KIND_META = {
  FULL_PAYMENT: { label: "Full Payment", color: "#7c3aed", bg: "#f3e8ff", Icon: Zap },
  STOCK_PURCHASE: { label: "Stock Purchase", color: "#b45309", bg: "#fef3c7", Icon: Tag },
  LODGING: { label: "Lodging Claim", color: "#4f46e5", bg: "#eef2ff", Icon: ShieldCheck },
  TRAVEL: { label: "Travel Claim", color: "#0284c7", bg: "#e0f2fe", Icon: ShieldCheck },
  CONVEYANCE: { label: "Local Conveyance", color: "#0d9488", bg: "#ccfbf1", Icon: ShieldCheck },
  FOOD: { label: "Food Allowance", color: "#ea580c", bg: "#ffedd5", Icon: ShieldCheck },
  COMBINE: { label: "Combined Claim", color: "#6366f1", bg: "#eef2ff", Icon: ShieldCheck },
  OTHER_EXPENSE: { label: "Other Expense", color: "#0369a1", bg: "#e0f2fe", Icon: ShieldCheck },
};

const getEntryIconAndTitle = (e, claim) => {
  const t = String(e?.expenseType || "").toUpperCase();
  const sub = String(e?.otherSubType || "").toUpperCase();
  const isPurchase = t === "STOCK_PURCHASE" || (t === "OTHER" && sub === "PURCHASE");
  if (t === "LODGING" || t === "LODGING_EXPENSE") {
    const isRel = claim?.stayType === "WITH_RELATIVE" || claim?.stayType === "RELATIVE";
    return {
      icon: isRel ? "🏠" : "🏨",
      title: e?.hotelName || (isRel ? "Stay with Relative" : "Hotel Accommodation"),
    };
  }
  if (t === "TRAVEL" || t === "TRAVEL_EXPENSE") {
    const mode = String(e?.travelModeName || e?.travelModeCode || "Travel").toUpperCase();
    let icon = "🚆";
    if (mode.includes("FLIGHT") || mode.includes("AIR")) icon = "✈️";
    else if (mode.includes("BUS")) icon = "🚌";
    else if (mode.includes("CAB") || mode.includes("TAXI") || mode.includes("AUTO") || mode.includes("FOUR_WHEELER") || mode.includes("CAR")) icon = "🚗";
    else if (mode.includes("TWO_WHEELER") || mode.includes("BIKE")) icon = "🏍️";
    const title = e?.travelModeName || e?.travelModeCode
      ? `${e.travelModeName || e.travelModeCode}${e.travelSubtypeName ? ` (${e.travelSubtypeName})` : ""}`
      : "Travel Claim";
    return { icon, title };
  }
  if (t === "FOOD" || t === "FOOD_DA" || t === "FOOD_EXPENSE") {
    return { icon: "🍽️", title: e?.expenseTypeName || "Food Allowance" };
  }
  if (t === "CONVEYANCE" || t === "LOCAL_CONVEYANCE" || t === "LOCAL_TRAVEL") {
    const v = e?.vehicle;
    const icon = v === "twoWheeler" ? "🏍️" : (v === "eBike" || v === "eCar") ? "⚡" : "🚗";
    const title = v === "twoWheeler" ? "2-Wheeler / Bike" : v === "car" ? "Car (4W)" : v === "eBike" ? "E-Bike" : v === "eCar" ? "E-Car" : "Local Conveyance";
    return { icon, title };
  }
  if (isPurchase) {
    return { icon: "📦", title: e?.materialName || "Stock Purchase" };
  }
  return { icon: "🧾", title: e?.expenseTypeName || "Other Expense" };
};

const DECISION_META = {
  APPROVED: { label: "Approved", color: "#059669", bg: "#d1fae5" },
  REJECTED: { label: "Rejected", color: "#dc2626", bg: "#fee2e2" },
};

// Full Payment / Stock Purchase: 2nd approval by the CFO / Finance Head after the Reporting Manager
const SECOND_APPROVAL_META = { label: "Awaiting 2nd Approval", color: "#b45309", bg: "#fef3c7" };

const OtherApprovalsScreen = ({ navigation }) => {
  const [tab, setTab] = useState("PENDING");
  const [items, setItems] = useState([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isAccessBlocked, setIsAccessBlocked] = useState(false);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);
  // { mode: 'approve' | 'reject', claim }
  const [decision, setDecision] = useState(null);
  const [remark, setRemark] = useState("");

  const load = useCallback(async (status, spinner = true) => {
    if (spinner) setLoading(true);
    setError(null);

    // Check local or live mobile access config (like Leave Approvals)
    try {
      const configStr = await AsyncStorage.getItem('@mobileAccessConfig');
      if (configStr) {
        const config = JSON.parse(configStr);
        if (config.blockedScreens?.includes('otherApprovals')) {
          setIsAccessBlocked(true);
          setItems([]);
          setPendingCount(0);
          setLoading(false);
          setRefreshing(false);
          return;
        }
      }
    } catch (_) {}

    const res = await expenseApi.getMyApprovals(status);
    if (res.success) {
      if (res.isAccessBlocked) {
        setIsAccessBlocked(true);
        setItems([]);
        setPendingCount(0);
      } else {
        setIsAccessBlocked(false);
        setItems(Array.isArray(res.data) ? res.data : []);
        setPendingCount(res.pendingCount || 0);
      }
    } else {
      setError(res.message || "Unable to load approvals.");
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load(tab);
    }, [load, tab])
  );

  const closeDecision = () => {
    setDecision(null);
    setRemark("");
  };

  const submitDecision = async () => {
    if (!decision) return;
    const { mode, claim } = decision;
    const text = remark.trim();
    if (mode === "approve" && !text) {
      Alert.alert("Remark required", "Please enter an approval remark before approving this claim.");
      return;
    }
    if (mode === "reject" && text.length < 3) {
      Alert.alert("Reason required", "Please enter the reason for rejecting this claim.");
      return;
    }
    setBusyId(claim._id);
    const res = mode === "approve"
      ? await expenseApi.approveClaim(claim._id, text)
      : await expenseApi.rejectApproval(claim._id, text);
    setBusyId(null);
    if (!res.success) {
      Alert.alert("Failed", res.message || "Please try again.");
      if (res.status === 409) {
        closeDecision();
        load(tab, false);
      }
      return;
    }
    closeDecision();
    const sentToFinanceHead = mode === "approve" && res.data?.status === "APPROVAL_PENDING" && res.data?.financeApproval?.status === "PENDING";
    Alert.alert(
      mode === "approve" ? "Approved" : "Rejected",
      mode === "approve"
        ? (sentToFinanceHead
          ? `${claim.claimNumber || "Claim"} approved and sent to ${res.data.financeApproval.approverName || "the CFO / Finance Head"} for 2nd approval.`
          : `${claim.claimNumber || "Claim"} approved and sent to Accounts.`)
        : `${claim.claimNumber || "Claim"} rejected. The employee has been informed.`
    );
    load(tab, false);
  };

  const renderCard = (c) => {
    const ma = c.managerApproval || {};
    const fa = c.financeApproval || {};
    const isFull = ma.kind === "FULL_PAYMENT" || Boolean(c.fullPayment?.requested || c.fullPaymentRequested);
    // FINANCE = I give the 2nd approval (CFO / Finance Head); MANAGER = 1st approval (Reporting Manager)
    const isMyFinanceStage = c.myApprovalStage === "FINANCE";
    const myDecision = isMyFinanceStage ? fa : ma;
    const awaitingSecond = c.status === "APPROVAL_PENDING" && fa.status === "PENDING";
    const decided = DECISION_META[myDecision.status];
    const who = c.submittedBy?.name || c.submittedByName || "Employee";
    const empCode = c.submittedBy?.employeeIdCode;
    const empDeptOrDesig = [c.submittedBy?.designation, c.submittedBy?.department].filter(Boolean).join(" • ");
    const claimDate = fmtDate(c.claimDate || c.fromDate || c.submittedAt || c.createdAt);
    const busy = busyId === c._id;
    const pending = c.status === "APPROVAL_PENDING" && c.permissions?.canApprove;

    // Build complete entries list (including Lodging + Food when includeFood is active)
    const rawEntries = Array.isArray(c.entries) && c.entries.length > 0 ? c.entries : (c.employeeClaims?.[0]?.items || []);
    const entriesList = [...rawEntries];
    const isLodgingClaim = c.claimMode === "LODGING" || String(c.claimType || "").toUpperCase() === "LODGING";
    if (
      isLodgingClaim &&
      !entriesList.some((e) => ["FOOD", "FOOD_EXPENSE"].includes(String(e?.expenseType || "").toUpperCase())) &&
      (c.includeFood || (Array.isArray(c.foodEntries) && c.foodEntries.length > 0) || Number(c.foodRequestedAmount || c.foodSummary?.requested || 0) > 0)
    ) {
      const fReq = Number(c.foodRequestedAmount ?? c.foodSummary?.requested ?? c.foodEntries?.[0]?.requestedAmount ?? 0);
      const fAllow = Number(c.foodAllowedAmount ?? c.foodSummary?.allowed ?? c.foodEntries?.[0]?.allowedAmount ?? fReq);
      entriesList.push({
        expenseType: "FOOD",
        expenseTypeName: "Shared Food Allowance",
        requestedAmount: fReq,
        allowedAmount: fAllow,
        excessAmount: Math.max(0, fReq - fAllow),
        remark: c.foodRemark || c.foodEntries?.[0]?.remark || "",
      });
    }
    if (entriesList.length === 0) {
      entriesList.push({
        expenseType: c.claimType || c.expenseType || (isLodgingClaim ? "LODGING" : "OTHER"),
        requestedAmount: c.grandRequested ?? c.requestedAmount ?? 0,
        allowedAmount: c.grandAllowed ?? c.allowedAmount ?? 0,
        excessAmount: c.grandExcess ?? c.excessAmount ?? 0,
        remark: c.remark || c.remarks || "",
      });
    }

    const isStockPurchaseItem = (e) => {
      const t = (e?.expenseType || "").toUpperCase();
      const sub = (e?.otherSubType || "").toUpperCase();
      return t === "STOCK_PURCHASE" || (t === "OTHER" && sub === "PURCHASE");
    };
    const stockPurchaseEntry = entriesList.find(isStockPurchaseItem);
    const otherOnlyEntry = entriesList.find((e) => (e?.expenseType || "").toUpperCase() === "OTHER" && !isStockPurchaseItem(e));
    const firstOther = stockPurchaseEntry || otherOnlyEntry || entriesList[0] || {};
    const expTypeUpper = (firstOther.expenseType || c.claimType || "").toUpperCase();
    const otherSubType = (firstOther.otherSubType || c.otherSubType || "").toUpperCase();
    const isPurchase = Boolean(stockPurchaseEntry) || expTypeUpper === "STOCK_PURCHASE" || otherSubType === "PURCHASE" || String(c.claimType || "").toUpperCase() === "STOCK_PURCHASE";
    const distinctTypes = Array.from(new Set(entriesList.map((e) => isStockPurchaseItem(e) ? "STOCK_PURCHASE" : String(e?.expenseType || "").toUpperCase()).filter(Boolean)));
    const resolvedKindKey = isFull
      ? "FULL_PAYMENT"
      : isPurchase
        ? "STOCK_PURCHASE"
        : distinctTypes.length > 1
          ? "COMBINE"
          : (KIND_META[distinctTypes[0]] ? distinctTypes[0] : (KIND_META[expTypeUpper] ? expTypeUpper : "OTHER_EXPENSE"));
    const kind = KIND_META[resolvedKindKey] || KIND_META.OTHER_EXPENSE;
    const KindIcon = kind.Icon;
    const remark = firstOther.remark || firstOther.description || c.remark || c.remarks;
    const proofsCount = (firstOther.attachments || firstOther.receipts || c.attachments || c.receipts || []).length;
    const fpProofsCount = (c.fullPayment?.proofs || c.fullPaymentProofs || []).length;

    // 1st & 2nd approval status summary
    const maStatus = String(ma.status || "").toUpperCase();
    const faStatus = String(fa.status || "").toUpperCase();
    const mgrApproverObj = typeof ma.approver === "object" && ma.approver ? ma.approver : null;
    const mgrName = mgrApproverObj?.name || ma.approverName || "Reporting Manager";
    const mgrCode = mgrApproverObj?.employeeIdCode ? ` (${mgrApproverObj.employeeIdCode})` : "";
    const mgrRoleSub = [mgrApproverObj?.designation, mgrApproverObj?.department].filter(Boolean).join(" • ");
    const mgrBadge = maStatus === "APPROVED"
      ? { label: "Approved", color: "#059669", bg: "#d1fae5" }
      : maStatus === "REJECTED"
        ? { label: "Rejected", color: "#dc2626", bg: "#fee2e2" }
        : { label: "Pending", color: "#d97706", bg: "#fef3c7" };

    const hasSecondApproval = Boolean(
      c.requiresSecondApproval ||
      (faStatus && faStatus !== "NOT_REQUIRED") ||
      fa.approver ||
      fa.approverName
    );
    const finApproverObj = typeof fa.approver === "object" && fa.approver ? fa.approver : null;
    const finName = finApproverObj?.name || fa.approverName || "CFO / Finance Head";
    const finCode = finApproverObj?.employeeIdCode ? ` (${finApproverObj.employeeIdCode})` : "";
    const finRoleSub = [finApproverObj?.designation, finApproverObj?.department].filter(Boolean).join(" • ");
    const finBadge = faStatus === "APPROVED"
      ? { label: "Approved", color: "#059669", bg: "#d1fae5" }
      : faStatus === "REJECTED"
        ? { label: "Rejected", color: "#dc2626", bg: "#fee2e2" }
        : maStatus === "REJECTED"
          ? { label: "Cancelled", color: "#64748b", bg: "#f1f5f9" }
          : (awaitingSecond || faStatus === "PENDING")
            ? { label: "Awaiting 2nd Approval", color: "#b45309", bg: "#fef3c7" }
            : { label: "After 1st Approval", color: "#64748b", bg: "#f1f5f9" };

    return (
      <TouchableOpacity
        key={c._id}
        style={styles.card}
        activeOpacity={0.85}
        onPress={() => navigation.navigate("ExpenseClaimDetail", { claimId: c._id })}
      >
        <View style={[styles.cardAccent, { backgroundColor: kind.color }]} />
        <View style={styles.cardBody}>
          <View style={styles.rowBetween}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap", flex: 1 }}>
              <View style={[styles.kindPill, { backgroundColor: kind.bg }]}>
                <KindIcon size={12} color={kind.color} />
                <Text style={[styles.kindText, { color: kind.color }]}>{kind.label}</Text>
              </View>
              <View style={[styles.kindPill, { backgroundColor: isMyFinanceStage ? "#fef3c7" : "#eef2ff" }]}>
                <Text style={[styles.kindText, { color: isMyFinanceStage ? "#b45309" : "#4f46e5" }]}>
                  {isMyFinanceStage ? "2nd Approval • CFO" : "1st Approval • Manager"}
                </Text>
              </View>
            </View>
            {awaitingSecond && (!decided || isMyFinanceStage) ? (
              <View style={[styles.kindPill, { backgroundColor: SECOND_APPROVAL_META.bg }]}>
                <Clock size={12} color={SECOND_APPROVAL_META.color} />
                <Text style={[styles.kindText, { color: SECOND_APPROVAL_META.color }]}>{SECOND_APPROVAL_META.label}</Text>
              </View>
            ) : decided ? (
              <View style={[styles.kindPill, { backgroundColor: decided.bg }]}>
                <Text style={[styles.kindText, { color: decided.color }]}>{decided.label}</Text>
              </View>
            ) : (
              <Text style={styles.dateText}>{fmtDate(myDecision.requestedAt || ma.requestedAt || c.submittedAt || c.createdAt)}</Text>
            )}
          </View>

          <View style={[styles.rowBetween, { marginTop: 10 }]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.claimNo} numberOfLines={1}>{c.claimNumber || "Expense Claim"}</Text>
              <View style={styles.whoRow}>
                <User size={12} color="#64748b" />
                <Text style={styles.whoText} numberOfLines={1}>
                  {who}{empCode ? ` • ${empCode}` : ""}{empDeptOrDesig ? ` (${empDeptOrDesig})` : ""}
                </Text>
              </View>
              {claimDate ? (
                <View style={[styles.whoRow, { marginTop: 2 }]}>
                  <Calendar size={11} color="#94a3b8" />
                  <Text style={[styles.dateText, { fontSize: 11 }]}>
                    Date: {claimDate}
                  </Text>
                </View>
              ) : null}
            </View>
            <ChevronRight size={18} color="#94a3b8" />
          </View>

          <View style={styles.amountRow}>
            <View style={styles.amountBox}>
              <Text style={styles.amountLabel}>Requested</Text>
              <Text style={styles.amountValue}>{inr(c.grandRequested ?? c.requestedAmount)}</Text>
            </View>
            <View style={styles.amountBox}>
              <Text style={styles.amountLabel}>{isFull ? "Policy Allowed" : "Allowed"}</Text>
              <Text style={styles.amountValue}>{inr(c.grandAllowed ?? c.allowedAmount)}</Text>
            </View>
            <View style={[styles.amountBox, { borderRightWidth: 0 }]}>
              <Text style={styles.amountLabel}>{isFull ? "If Approved" : "Payable"}</Text>
              <Text style={[styles.amountValue, { color: kind.color }]}>
                {inr(isFull ? (c.grandRequested ?? c.requestedAmount) : (c.payableAmount ?? c.grandAllowed ?? c.allowedAmount))}
              </Text>
            </View>
          </View>

          {/* Claim Entries List with Entry 01, Entry 02 Icons */}
          <View style={{ marginTop: 10, padding: 8, backgroundColor: "#f8fafc", borderRadius: 10, borderWidth: 1, borderColor: "#e2e8f0", gap: 6 }}>
            <Text style={{ fontSize: 10, fontWeight: "800", color: "#475569", textTransform: "uppercase", letterSpacing: 0.4 }}>
              Claim Entries ({entriesList.length})
            </Text>
            {entriesList.map((entry, idx) => {
              const { icon, title } = getEntryIconAndTitle(entry, c);
              const eReq = Number(entry.requestedAmount ?? c.grandRequested ?? 0);
              const eAllow = Number(entry.allowedAmount ?? eReq);
              const eExc = Number(entry.excessAmount ?? Math.max(0, eReq - eAllow));
              const eSub = [
                entry.materialName && title !== entry.materialName ? `Material: ${entry.materialName}` : null,
                entry.barcodeNumber ? `Barcode: ${entry.barcodeNumber}` : null,
                entry.quantity ? `Qty: ${entry.quantity}` : null,
                entry.distanceKm ? `${entry.distanceKm} km` : null,
                entry.remark || entry.description || null,
              ].filter(Boolean).join(" · ");

              return (
                <View
                  key={idx}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    backgroundColor: "#ffffff",
                    paddingHorizontal: 8,
                    paddingVertical: 6,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: "#eef2f7",
                    gap: 8,
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "#4f46e5", paddingHorizontal: 6, paddingVertical: 2.5, borderRadius: 5 }}>
                      <Text style={{ fontSize: 10 }}>{icon}</Text>
                      <Text style={{ fontSize: 9.5, fontWeight: "800", color: "#ffffff" }}>
                        Entry {String(idx + 1).padStart(2, "0")}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 11.5, fontWeight: "800", color: "#0f172a" }} numberOfLines={1}>
                        {icon} {title}
                      </Text>
                      {eSub ? (
                        <Text style={{ fontSize: 10, color: "#64748b", marginTop: 1 }} numberOfLines={1}>
                          {eSub}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={{ fontSize: 12, fontWeight: "800", color: "#0f172a" }}>{inr(eReq)}</Text>
                    {eExc > 0 ? (
                      <Text style={{ fontSize: 9.5, fontWeight: "800", color: "#dc2626" }}>
                        {inr(eExc)} Excess
                      </Text>
                    ) : null}
                  </View>
                </View>
              );
            })}
            {remark && entriesList.length === 1 && !entriesList[0]?.remark && !entriesList[0]?.description ? (
              <Text style={{ fontSize: 11, color: "#334155" }} numberOfLines={2}>
                <Text style={{ fontWeight: "700" }}>Purpose: </Text>{remark}
              </Text>
            ) : null}
            {proofsCount > 0 ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <FileText size={11} color="#4f46e5" />
                <Text style={{ fontSize: 10, fontWeight: "700", color: "#4f46e5" }}>
                  {proofsCount} Bill Proof{proofsCount > 1 ? "s" : ""} Attached
                </Text>
              </View>
            ) : null}
          </View>

          {isFull && c.fullPayment?.reason ? (
            <View style={{ marginTop: 8, padding: 8, backgroundColor: "#fff7ed", borderRadius: 8, gap: 4 }}>
              <Text style={{ fontSize: 11, color: "#9a3412" }} numberOfLines={2}>
                <Text style={{ fontWeight: "700" }}>Full Payment Reason: </Text>{c.fullPayment.reason}
              </Text>
              {fpProofsCount > 0 ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 }}>
                  <FileText size={11} color="#c2410c" />
                  <Text style={{ fontSize: 10, fontWeight: "700", color: "#c2410c" }}>
                    {fpProofsCount} Full Payment Proof{fpProofsCount > 1 ? "s" : ""}
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}

          {/* Structured Approval Info (1st Approval & 2nd Approval) */}
          <View style={{ marginTop: 10, padding: 10, backgroundColor: "#f8faff", borderRadius: 10, borderWidth: 1, borderColor: "#e0e7ff", gap: 8 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
              <ShieldCheck size={13} color="#4f46e5" />
              <Text style={{ fontSize: 10.5, fontWeight: "800", color: "#3730a3", textTransform: "uppercase", letterSpacing: 0.4 }}>
                Approval Hierarchy & Status
              </Text>
            </View>

            {/* 1st Approval: Reporting Manager */}
            <View style={{ backgroundColor: "#ffffff", borderRadius: 8, padding: 8, borderWidth: 1, borderColor: "#e2e8f0", gap: 3 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                <Text style={{ fontSize: 10.5, fontWeight: "800", color: "#475569" }}>
                  1st Approval • Reporting Manager
                </Text>
                <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, backgroundColor: mgrBadge.bg }}>
                  <Text style={{ fontSize: 9.5, fontWeight: "800", color: mgrBadge.color }}>{mgrBadge.label}</Text>
                </View>
              </View>
              <Text style={{ fontSize: 11.5, fontWeight: "800", color: "#0f172a" }}>
                {mgrName}{mgrCode}
              </Text>
              {mgrRoleSub ? (
                <Text style={{ fontSize: 10, color: "#64748b" }}>{mgrRoleSub}</Text>
              ) : null}
              {ma.decidedAt ? (
                <Text style={{ fontSize: 10, color: "#64748b", fontWeight: "600" }}>
                  Decided on {fmtDate(ma.decidedAt)}
                </Text>
              ) : null}
              {ma.remarks ? (
                <Text style={{ fontSize: 10.5, color: "#334155", marginTop: 2 }} numberOfLines={2}>
                  <Text style={{ fontWeight: "700" }}>Remark: </Text>{ma.remarks}
                </Text>
              ) : null}
            </View>

            {/* 2nd Approval: CFO / Finance Head (if applicable) */}
            {hasSecondApproval ? (
              <View style={{ backgroundColor: "#fffbeb", borderRadius: 8, padding: 8, borderWidth: 1, borderColor: "#fde68a", gap: 3 }}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                  <Text style={{ fontSize: 10.5, fontWeight: "800", color: "#92400e" }}>
                    2nd Approval • CFO / Finance Head
                  </Text>
                  <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, backgroundColor: finBadge.bg }}>
                    <Text style={{ fontSize: 9.5, fontWeight: "800", color: finBadge.color }}>{finBadge.label}</Text>
                  </View>
                </View>
                <Text style={{ fontSize: 11.5, fontWeight: "800", color: "#0f172a" }}>
                  {finName}{finCode}
                </Text>
                {finRoleSub ? (
                  <Text style={{ fontSize: 10, color: "#64748b" }}>{finRoleSub}</Text>
                ) : null}
                {fa.decidedAt ? (
                  <Text style={{ fontSize: 10, color: "#64748b", fontWeight: "600" }}>
                    Decided on {fmtDate(fa.decidedAt)}
                  </Text>
                ) : null}
                {fa.remarks ? (
                  <Text style={{ fontSize: 10.5, color: "#334155", marginTop: 2 }} numberOfLines={2}>
                    <Text style={{ fontWeight: "700" }}>Remark: </Text>{fa.remarks}
                  </Text>
                ) : null}
              </View>
            ) : null}
          </View>

          {pending ? (
            <View style={styles.actionRow}>
              <TouchableOpacity
                style={[styles.actionBtn, styles.rejectBtn]}
                disabled={busy}
                onPress={() => setDecision({ mode: "reject", claim: c })}
              >
                <XCircle size={15} color="#dc2626" />
                <Text style={[styles.actionText, { color: "#dc2626" }]}>Reject</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, styles.approveBtn]}
                disabled={busy}
                onPress={() => setDecision({ mode: "approve", claim: c })}
              >
                {busy ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <CheckCircle2 size={15} color="#fff" />
                    <Text style={[styles.actionText, { color: "#fff" }]}>Approve</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      </TouchableOpacity>
    );
  };

  const isReject = decision?.mode === "reject";

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ExpenseHeader
        title="Other Approvals"
        subtitle="Full payment, stock purchase & other expense requests"
        navigation={navigation}
      />

      <View style={styles.tabs}>
        {[
          { key: "PENDING", label: "Pending", Icon: Clock },
          { key: "DECIDED", label: "History", Icon: CheckCircle2 },
        ].map(({ key, label, Icon }) => {
          const active = tab === key;
          return (
            <TouchableOpacity
              key={key}
              style={[styles.tab, active && styles.tabActive]}
              onPress={() => setTab(key)}
              activeOpacity={0.85}
            >
              <Icon size={14} color={active ? "#fff" : "#475569"} />
              <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
              {key === "PENDING" && pendingCount > 0 ? (
                <View style={[styles.badge, active && { backgroundColor: "#fff" }]}>
                  <Text style={[styles.badgeText, active && { color: "#4f46e5" }]}>{pendingCount}</Text>
                </View>
              ) : null}
            </TouchableOpacity>
          );
        })}
      </View>

      {isAccessBlocked ? (
        <View style={styles.empty}>
          <View style={[styles.emptyIcon, { backgroundColor: "#fff1f2", borderColor: "#fecdd3", borderWidth: 1 }]}>
            <ShieldAlert size={32} color="#e11d48" />
          </View>
          <Text style={styles.emptyTitle}>Access Restricted</Text>
          <Text style={[styles.emptySub, { paddingHorizontal: 20 }]}>
            The Other Approvals screen has been restricted by your administrator for your role or department.
          </Text>
        </View>
      ) : loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#4f46e5" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load(tab, false);
              }}
              colors={["#4f46e5"]}
            />
          }
        >
          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity onPress={() => load(tab)}>
                <Text style={styles.retryText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {!error && items.length === 0 ? (
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <Inbox size={30} color="#6366f1" />
              </View>
              <Text style={styles.emptyTitle}>
                {tab === "PENDING" ? "All caught up!" : "No decisions yet"}
              </Text>
              <Text style={styles.emptySub}>
                {tab === "PENDING"
                  ? "Claims where you are selected as approver will appear here."
                  : "Claims you approve or reject will be listed here."}
              </Text>
            </View>
          ) : null}

          {items.map(renderCard)}
        </ScrollView>
      )}

      <Modal visible={!!decision} transparent animationType="fade" onRequestClose={closeDecision}>
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.modalCard}>
            <View style={[styles.modalIcon, { backgroundColor: isReject ? "#fee2e2" : "#d1fae5" }]}>
              {isReject ? <XCircle size={26} color="#dc2626" /> : <CheckCircle2 size={26} color="#059669" />}
            </View>
            <Text style={styles.modalTitle}>{isReject ? "Reject Claim" : "Approve Claim"}</Text>
            <Text style={styles.modalSub}>
              {decision?.claim?.claimNumber}
              {isReject
                ? " will be rejected and returned to the employee."
                : (decision?.claim?.myApprovalStage === "FINANCE"
                  ? " (2nd approval) will be sent to Accounts for payment."
                  : decision?.claim?.requiresSecondApproval
                    ? " will be approved and sent to the CFO / Finance Head for 2nd approval."
                    : " will be approved and sent to Accounts for payment.")}
            </Text>
            <TextInput
              style={styles.modalInput}
              placeholder={isReject ? "Reason for rejection (required)" : "Approval remark (required)"}
              placeholderTextColor="#94a3b8"
              value={remark}
              onChangeText={setRemark}
              multiline
              maxLength={500}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.modalBtn, styles.modalCancel]} onPress={closeDecision} disabled={!!busyId}>
                <Text style={[styles.actionText, { color: "#475569" }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: isReject ? "#dc2626" : "#059669" }]}
                onPress={submitDecision}
                disabled={!!busyId}
              >
                {busyId ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={[styles.actionText, { color: "#fff" }]}>{isReject ? "Reject" : "Approve"}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f8fafc" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  tabs: {
    flexDirection: "row",
    margin: 16,
    marginBottom: 4,
    padding: 4,
    backgroundColor: "#e2e8f0",
    borderRadius: 14,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 11,
    gap: 6,
  },
  tabActive: {
    backgroundColor: "#4f46e5",
    shadowColor: "#4f46e5",
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  tabText: { fontSize: 13, fontWeight: "700", color: "#475569" },
  tabTextActive: { color: "#fff" },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    backgroundColor: "#ef4444",
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { fontSize: 11, fontWeight: "800", color: "#fff" },
  list: { padding: 16, paddingBottom: 40 },
  card: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderRadius: 16,
    marginBottom: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#eef2f7",
    shadowColor: "#0f172a",
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  cardAccent: { width: 4 },
  cardBody: { flex: 1, padding: 14 },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 6 },
  kindPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 20,
  },
  kindText: { fontSize: 11, fontWeight: "800", letterSpacing: 0.2 },
  dateText: { fontSize: 11, color: "#94a3b8", fontWeight: "600", marginTop: 4 },
  claimNo: { fontSize: 15, fontWeight: "800", color: "#0f172a" },
  whoRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 3 },
  whoText: { fontSize: 12, color: "#64748b", fontWeight: "600", flex: 1 },
  amountRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 12,
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    paddingVertical: 10,
  },
  amountBox: {
    flex: 1,
    minWidth: 85,
    alignItems: "center",
    borderRightWidth: 1,
    borderRightColor: "#e2e8f0",
  },
  amountLabel: { fontSize: 10, color: "#64748b", fontWeight: "700", textTransform: "uppercase" },
  amountValue: { fontSize: 14, color: "#0f172a", fontWeight: "800", marginTop: 3 },
  reasonText: { fontSize: 12, color: "#334155", marginTop: 10, lineHeight: 17 },
  actionRow: { flexDirection: "row", gap: 10, marginTop: 14 },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 11,
    borderRadius: 12,
  },
  rejectBtn: { backgroundColor: "#fef2f2", borderWidth: 1, borderColor: "#fecaca" },
  approveBtn: { backgroundColor: "#059669" },
  actionText: { fontSize: 13, fontWeight: "800" },
  errorBox: {
    backgroundColor: "#fef2f2",
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  errorText: { color: "#b91c1c", fontSize: 12, flex: 1, marginRight: 8 },
  retryText: { color: "#4f46e5", fontWeight: "800", fontSize: 12 },
  empty: { alignItems: "center", paddingVertical: 60, paddingHorizontal: 30 },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#eef2ff",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  emptyTitle: { fontSize: 16, fontWeight: "800", color: "#0f172a" },
  emptySub: { fontSize: 12, color: "#64748b", textAlign: "center", marginTop: 6, lineHeight: 18 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  modalCard: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 20,
    alignItems: "center",
  },
  modalIcon: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  modalTitle: { fontSize: 17, fontWeight: "800", color: "#0f172a" },
  modalSub: { fontSize: 12, color: "#64748b", textAlign: "center", marginTop: 4, marginBottom: 14 },
  modalInput: {
    width: "100%",
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
  modalActions: { flexDirection: "row", gap: 10, marginTop: 16, width: "100%" },
  modalBtn: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 12, borderRadius: 12 },
  modalCancel: { backgroundColor: "#f1f5f9" },
});

export default OtherApprovalsScreen;
