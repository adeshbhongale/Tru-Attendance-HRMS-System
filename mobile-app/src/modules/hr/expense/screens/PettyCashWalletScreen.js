import * as ImagePicker from "expo-image-picker";
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  Camera,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CornerUpLeft,
  Image as ImageIcon,
  Plus,
  Receipt,
  Trash2,
  Wallet,
  X,
} from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
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
import HRModuleFooter from "../../../../components/HRModuleFooter";
import { resolveProofImageUrl } from "../../../../utils/imageUrl";
import expenseApi from "../api/expenseApi";
import ExpenseHeader from "../components/ExpenseHeader";

const fmtINR = (n) => {
  const v = Number(n) || 0;
  const abs = Math.abs(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${v < 0 ? "-₹" : "₹"}${abs}`;
};

const fmtDate = (d) => {
  if (!d) return "";
  try {
    return new Date(d).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(d).slice(0, 16);
  }
};

const notifyAlert = (title, message) => {
  if (Platform.OS === "web" && typeof window !== "undefined" && window.alert) {
    window.alert(`${title}\n\n${message}`);
  } else {
    Alert.alert(title, message);
  }
};

const classifyTransaction = (t) => {
  const cat = String(t?.transactionCategory || "").toUpperCase();
  const src = String(t?.source || "").toUpperCase();
  const type = String(t?.type || "").toUpperCase();

  if (
    cat === "ALLOCATION_ENHANCEMENT" ||
    cat === "INITIAL_ALLOCATION" ||
    src === "TOPUP" ||
    src === "TOPUP_REQUEST"
  ) {
    return {
      kind: "ENHANCEMENT",
      badgeText: src === "TOPUP_REQUEST" ? "Petty Cash Enhancement" : "Petty Cash Allocation",
      badgeBg: "#dcfce7",
      badgeColor: "#15803d",
      borderColor: "#86efac",
      cardBg: "#f0fdf4",
    };
  }

  if (cat === "PETTY_CASH_RETURN" || src === "PETTY_CASH_RETURN") {
    return {
      kind: "RETURN",
      badgeText: "Petty Cash Returned",
      badgeBg: "#fee2e2",
      badgeColor: "#b91c1c",
      borderColor: "#fca5a5",
      cardBg: "#fef2f2",
    };
  }

  if (cat === "REVERSAL" || type === "REVERSAL") {
    return {
      kind: "REVERSAL",
      badgeText: "Transaction Reversal",
      badgeBg: "#fef3c7",
      badgeColor: "#b45309",
      borderColor: "#fde68a",
      cardBg: "#fffbeb",
    };
  }

  if (cat === "CLAIM_SETTLEMENT" || src === "CLAIM_PAYMENT") {
    return {
      kind: "CLAIM_SETTLEMENT",
      badgeText: "Claim Settlement",
      badgeBg: "#e0e7ff",
      badgeColor: "#4338ca",
      borderColor: "#e2e8f0",
      cardBg: "#ffffff",
    };
  }

  if (cat === "EXPENSE_DEDUCTION" || src.startsWith("CLAIM_")) {
    return {
      kind: "CLAIM_EXPENSE",
      badgeText: "Expense Claim",
      badgeBg: "#f1f5f9",
      badgeColor: "#475569",
      borderColor: "#e2e8f0",
      cardBg: "#ffffff",
    };
  }

  return {
    kind: "NORMAL",
    badgeText: "Account Adjustment",
    badgeBg: "#f1f5f9",
    badgeColor: "#475569",
    borderColor: "#e2e8f0",
    cardBg: "#ffffff",
  };
};

const PettyCashWalletScreen = ({ navigation }) => {
  const [tab, setTab] = useState("ledger"); // ledger | enhance_requests | return_requests
  const [wallet, setWallet] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [requests, setRequests] = useState([]);
  const [returnRequests, setReturnRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Request Enhancement modal
  const [reqModal, setReqModal] = useState(false);
  const [reqAmount, setReqAmount] = useState("");
  const [reqReason, setReqReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Return Request modal + confirmation dialog
  const [retModal, setRetModal] = useState(false);
  const [retConfirmVisible, setRetConfirmVisible] = useState(false);
  const [retAmount, setRetAmount] = useState("");
  const [retRemarks, setRetRemarks] = useState("");
  const [retProofs, setRetProofs] = useState([]); // [{ localId, uri, url, name, isUploading, uploadFailed }]
  const [retUploadingProof, setRetUploadingProof] = useState(false);
  const [retSubmitting, setRetSubmitting] = useState(false);

  const load = useCallback(async (page = 1, showSpinner = true) => {
    if (showSpinner) setLoading(true);
    try {
      const [wRes, tRes, rRes, retRes] = await Promise.all([
        expenseApi.getMyPettyCashWallet(),
        expenseApi.getMyPettyCashTransactions({ page, limit: 15 }),
        expenseApi.getMyPettyCashRequests(),
        expenseApi.getMyPettyCashReturnRequests(),
      ]);
      if (wRes.success) setWallet(wRes.data);
      if (tRes.success) {
        setTransactions(tRes.data || []);
        setPagination(tRes.pagination || { page: 1, pages: 1, total: 0 });
      }
      if (rRes.success) setRequests(rRes.data || []);
      if (retRes.success) setReturnRequests(retRes.data || []);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load(1, true);
  }, [load]);

  const handleCreateRequest = async () => {
    const amt = Number(reqAmount);
    if (!Number.isFinite(amt) || amt <= 0) {
      notifyAlert("Invalid Amount", "Please enter an amount greater than zero.");
      return;
    }
    if (!reqReason || reqReason.trim().length < 5) {
      notifyAlert("Reason Required", "Please provide a reason (at least 5 characters), such as an upcoming outstation tour.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await expenseApi.createPettyCashRequest({ amount: amt, reason: reqReason.trim() });
      if (res.success) {
        setReqModal(false);
        setReqAmount("");
        setReqReason("");
        notifyAlert("Enhancement Request Submitted", "Your request to increase petty cash allocation has been sent to Accounts Admin.");
        load(1, false);
      } else {
        notifyAlert("Request Failed", res.message || "Unable to submit request.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const currentBalance = Number(wallet?.balance || 0);
  const currentBaseLimit = Number(wallet?.baseLimit || 0);
  const excessAboveBase = Math.max(0, Number((currentBalance - currentBaseLimit).toFixed(2)));
  const availableForReturn = Number(
    wallet?.availableForReturn !== undefined
      ? wallet.availableForReturn
      : excessAboveBase
  );
  const isNegative = Boolean(wallet?.negative || currentBalance < 0);

  const handlePickReturnProof = async (useCamera = false) => {
    try {
      let result;
      if (useCamera) {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== "granted") {
          notifyAlert("Permission Required", "Camera permission is required to capture proof photos.");
          return;
        }
        result = await ImagePicker.launchCameraAsync({
          mediaTypes: ["images"],
          quality: 0.6,
          base64: true,
        });
      } else {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== "granted") {
          notifyAlert("Permission Required", "Gallery permission is required to select proof photos.");
          return;
        }
        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ["images"],
          quality: 0.6,
          allowsMultipleSelection: true,
          base64: true,
        });
      }

      if (result.canceled || !result.assets || !result.assets.length) return;

      setRetUploadingProof(true);
      for (const asset of result.assets) {
        const localId = `ret_proof_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const fileName = asset.fileName || `ReturnProof_${Date.now()}.jpg`;
        const newFile = {
          localId,
          uri: asset.uri,
          url: "",
          name: fileName,
          type: asset.mimeType || "image/jpeg",
          isUploading: true,
          uploadFailed: false,
        };
        setRetProofs((prev) => [...prev, newFile]);

        try {
          const upRes = await expenseApi.uploadFile(
            {
              uri: asset.uri,
              name: fileName,
              type: asset.mimeType || "image/jpeg",
              file: asset.file,
              base64: asset.base64,
            },
            null,
            "receipt"
          );
          const uploadedUrl = upRes?.data?.url || upRes?.url || "";
          if (upRes?.success && uploadedUrl) {
            setRetProofs((prev) =>
              prev.map((p) =>
                p.localId === localId ? { ...p, url: uploadedUrl, isUploading: false } : p
              )
            );
          } else {
            setRetProofs((prev) =>
              prev.map((p) =>
                p.localId === localId ? { ...p, isUploading: false, uploadFailed: true } : p
              )
            );
            notifyAlert("Upload Failed", upRes?.message || "Could not upload proof photo.");
          }
        } catch {
          setRetProofs((prev) =>
            prev.map((p) =>
              p.localId === localId ? { ...p, isUploading: false, uploadFailed: true } : p
            )
          );
        }
      }
    } finally {
      setRetUploadingProof(false);
    }
  };

  const handleRemoveReturnProof = (localId) => {
    setRetProofs((prev) => prev.filter((p) => p.localId !== localId));
  };

  const handleValidateReturnAndConfirm = () => {
    if (currentBalance <= currentBaseLimit || availableForReturn <= 0) {
      notifyAlert(
        "Return Not Allowed",
        `You can only return excess petty cash when your Petty Cash Balance (${fmtINR(currentBalance)}) is greater than your Base Limit (${fmtINR(currentBaseLimit)}).`
      );
      return;
    }
    const amt = Number(retAmount);
    if (!Number.isFinite(amt) || amt <= 0) {
      notifyAlert("Invalid Return Amount", "Please enter a valid return amount greater than zero.");
      return;
    }
    if (amt > availableForReturn) {
      notifyAlert(
        "Exceeds Extra Amount Above Base Limit",
        `Return amount (${fmtINR(amt)}) cannot exceed the extra amount above your Base Limit (${fmtINR(availableForReturn)} = ${fmtINR(currentBalance)} − ${fmtINR(currentBaseLimit)}).`
      );
      return;
    }
    if (!retRemarks || retRemarks.trim().length < 3) {
      notifyAlert("Remark Required", "Please enter a remark for returning petty cash (at least 3 characters).");
      return;
    }
    if (retUploadingProof || retProofs.some((p) => p.isUploading)) {
      notifyAlert("Uploading Proof", "Please wait until proof photo upload finishes.");
      return;
    }
    setRetConfirmVisible(true);
  };

  const handleConfirmReturnSubmit = async () => {
    const amt = Number(retAmount);
    const uploadedAttachments = retProofs
      .filter((p) => p.url && !p.uploadFailed)
      .map((p) => p.url);
    setRetSubmitting(true);
    try {
      const res = await expenseApi.createPettyCashReturnRequest({
        amount: amt,
        requestedAmount: amt,
        remarks: retRemarks.trim(),
        reason: retRemarks.trim(),
        attachments: uploadedAttachments,
      });
      if (res.success) {
        setRetConfirmVisible(false);
        setRetModal(false);
        setRetAmount("");
        setRetRemarks("");
        setRetProofs([]);
        notifyAlert(
          "Return Request Submitted",
          "Your Petty Cash Return Request has been submitted to Accounts. Your Petty Cash Balance will update once Accounts approves the return."
        );
        load(1, false);
      } else {
        setRetConfirmVisible(false);
        notifyAlert("Submission Failed", res.message || "Unable to submit return request.");
      }
    } finally {
      setRetSubmitting(false);
    }
  };

  const pendingEnhanceCount = requests.filter((r) => r.status === "PENDING").length;
  const pendingReturnCount = returnRequests.filter((r) => r.status === "PENDING").length;

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      <ExpenseHeader
        title="Petty Cash Wallet"
        subtitle={wallet?.enabled ? "Active Petty Cash Account" : "Petty Cash Allocation & Balance"}
        navigation={navigation}
        rightElement={
          <TouchableOpacity style={styles.reqTopBtn} onPress={() => setReqModal(true)}>
            <Plus size={16} color="#ffffff" />
          </TouchableOpacity>
        }
      />

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load(1, false);
            }}
          />
        }
      >
        {/* Petty Cash Balance Card (with Base Limit shown inside) */}
        <View style={styles.dualCardsContainer}>
          <View style={[styles.balanceCard, isNegative && styles.balanceCardNegative]}>
            <View style={styles.balanceHeader}>
              <View style={styles.balanceTitleRow}>
                <Wallet size={18} color="#ffffff" />
                <Text style={styles.balanceLabel}>Petty Cash Balance</Text>
              </View>
              {isNegative ? (
                <View style={styles.negBadge}>
                  <AlertTriangle size={12} color="#fecaca" />
                  <Text style={styles.negBadgeText}>NEGATIVE</Text>
                </View>
              ) : (
                <View
                  style={[
                    styles.statusBadge,
                    !wallet?.enabled && { backgroundColor: "rgba(255,255,255,0.18)" },
                  ]}
                >
                  <Text style={styles.statusBadgeText}>
                    {wallet?.enabled ? "ACTIVE" : "INACTIVE"}
                  </Text>
                </View>
              )}
            </View>

            <Text style={styles.balanceValue}>
              {loading && !wallet ? "…" : fmtINR(currentBalance)}
            </Text>

            <Text style={styles.inlineBaseLimitText}>
              Base Limit: {loading && !wallet ? "…" : fmtINR(currentBaseLimit)}
            </Text>

            {isNegative ? (
              <Text style={styles.negHint}>
                Your available balance is negative because submitted claims exceeded cash on hand. You can still submit valid claims.
              </Text>
            ) : (
              <Text style={styles.balCaption}>
                Actual available balance after claim deductions, settlements, enhancements & returns.
              </Text>
            )}

            {/* Action Buttons: Enhance Request & Return Request */}
            <View style={styles.actionBtnRow}>
              <TouchableOpacity
                style={styles.enhanceActionBtn}
                onPress={() => setReqModal(true)}
                activeOpacity={0.85}
              >
                <View style={styles.enhanceIconCircle}>
                  <Plus size={15} color="#4338ca" />
                </View>
                <View style={styles.actionTextCol}>
                  <Text style={styles.enhanceActionBtnText}>
                    Enhance Request
                  </Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.returnActionBtn,
                  availableForReturn <= 0 && styles.returnActionBtnDisabled,
                ]}
                onPress={() => {
                  if (currentBalance <= currentBaseLimit || availableForReturn <= 0) {
                    notifyAlert(
                      "No Excess Above Base Limit",
                      `You can only return excess petty cash when your Petty Cash Balance (${fmtINR(currentBalance)}) is greater than your Base Limit (${fmtINR(currentBaseLimit)}).`
                    );
                    return;
                  }
                  setRetAmount(String(availableForReturn));
                  setRetConfirmVisible(false);
                  setRetModal(true);
                }}
                activeOpacity={0.85}
              >
                <View
                  style={[
                    styles.returnIconCircle,
                    availableForReturn <= 0 && styles.returnIconCircleDisabled,
                  ]}
                >
                  <CornerUpLeft
                    size={15}
                    color={availableForReturn > 0 ? "#b91c1c" : "#e0e7ff"}
                  />
                </View>
                <View style={styles.actionTextCol}>
                  <Text
                    style={[
                      styles.returnActionBtnText,
                      availableForReturn <= 0 && styles.returnActionBtnTextDisabled,
                    ]}
                  >
                    Return Request
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Pending Requests Banner if any */}
        {(pendingEnhanceCount > 0 || pendingReturnCount > 0) && (
          <View style={styles.pendingBanner}>
            <View style={{ flex: 1 }}>
              <Text style={styles.pendingBannerTitle}>Pending Requests with Accounts</Text>
              <Text style={styles.pendingBannerSub}>
                {pendingEnhanceCount > 0 ? `${pendingEnhanceCount} Enhancement Request(s)` : ""}
                {pendingEnhanceCount > 0 && pendingReturnCount > 0 ? " • " : ""}
                {pendingReturnCount > 0
                  ? `${pendingReturnCount} Return Request(s)${wallet?.reservedReturn ? ` (${fmtINR(wallet.reservedReturn)} reserved)` : ""}`
                  : ""}
              </Text>
            </View>
          </View>
        )}

        {/* Sub-tabs: Transaction Ledger | Enhancement Requests | Return Requests */}
        <View style={styles.tabRow}>
          <TouchableOpacity
            style={[styles.tabBtn, tab === "ledger" && styles.tabBtnActive]}
            onPress={() => setTab("ledger")}
          >
            <Text style={[styles.tabText, tab === "ledger" && styles.tabTextActive]}>
              Ledger ({pagination.total || 0})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabBtn, tab === "enhance_requests" && styles.tabBtnActive]}
            onPress={() => setTab("enhance_requests")}
          >
            <Text style={[styles.tabText, tab === "enhance_requests" && styles.tabTextActive]}>
              Enhancements ({requests.length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabBtn, tab === "return_requests" && styles.tabBtnActive]}
            onPress={() => setTab("return_requests")}
          >
            <Text style={[styles.tabText, tab === "return_requests" && styles.tabTextActive]}>
              Returns ({returnRequests.length})
            </Text>
          </TouchableOpacity>
        </View>

        {tab === "ledger" && (
          <>
            {loading ? (
              <ActivityIndicator size="large" color="#4f46e5" style={{ marginTop: 24 }} />
            ) : transactions.length === 0 ? (
              <View style={styles.emptyBox}>
                <Receipt size={32} color="#cbd5e1" />
                <Text style={styles.emptyTitle}>No wallet transactions yet</Text>
                <Text style={styles.emptySub}>
                  Allocations, enhancements, returns, claim deductions and settlements will appear here.
                </Text>
              </View>
            ) : (
              transactions.map((t) => {
                const isAdd = t.direction === "CR";
                const cls = classifyTransaction(t);

                return (
                  <View
                    key={t._id}
                    style={[
                      styles.txnCard,
                      {
                        borderColor: cls.borderColor,
                        backgroundColor: cls.cardBg,
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.txnIcon,
                        {
                          backgroundColor:
                            cls.kind === "ENHANCEMENT"
                              ? "#dcfce7"
                              : cls.kind === "RETURN"
                                ? "#fee2e2"
                                : isAdd
                                  ? "#ecfdf5"
                                  : "#fef2f2",
                        },
                      ]}
                    >
                      {isAdd ? (
                        <ArrowDownLeft size={18} color="#059669" />
                      ) : (
                        <ArrowUpRight size={18} color="#dc2626" />
                      )}
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={styles.txnBadgeRow}>
                        <View style={[styles.catBadge, { backgroundColor: cls.badgeBg }]}>
                          <Text style={[styles.catBadgeText, { color: cls.badgeColor }]}>
                            {cls.badgeText}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.txnTopRow}>
                        <Text style={[styles.txnType, { flex: 1, marginRight: 8 }]} numberOfLines={2}>
                          {t.description || "Petty Cash Entry"}
                        </Text>
                        <Text
                          style={[
                            styles.txnAmount,
                            { color: isAdd ? "#059669" : "#dc2626" },
                          ]}
                        >
                          {isAdd ? "+" : "-"}
                          {fmtINR(t.amount)}
                        </Text>
                      </View>

                      <View style={styles.txnAuditGrid}>
                        <Text style={styles.txnBalAfter}>
                          Balance: {fmtINR(t.balanceBefore)} → {fmtINR(t.balanceAfter)}
                        </Text>
                      </View>

                      <View style={styles.txnMetaRow}>
                        <Text style={styles.txnDate}>{fmtDate(t.createdAt)}</Text>
                        {t.reference ? (
                          <Text style={styles.txnRef}>Ref: {t.reference}</Text>
                        ) : null}
                      </View>
                    </View>
                  </View>
                );
              })
            )}

            {pagination.pages > 1 && (
              <View style={styles.pageRow}>
                <TouchableOpacity
                  disabled={pagination.page <= 1}
                  onPress={() => load(pagination.page - 1, false)}
                  style={[styles.pageBtn, pagination.page <= 1 && { opacity: 0.4 }]}
                >
                  <ChevronLeft size={16} color="#334155" />
                </TouchableOpacity>
                <Text style={styles.pageText}>
                  Page {pagination.page} of {pagination.pages}
                </Text>
                <TouchableOpacity
                  disabled={pagination.page >= pagination.pages}
                  onPress={() => load(pagination.page + 1, false)}
                  style={[styles.pageBtn, pagination.page >= pagination.pages && { opacity: 0.4 }]}
                >
                  <ChevronRight size={16} color="#334155" />
                </TouchableOpacity>
              </View>
            )}
          </>
        )}

        {tab === "enhance_requests" && (
          <>
            {requests.length === 0 ? (
              <View style={styles.emptyBox}>
                <Wallet size={32} color="#cbd5e1" />
                <Text style={styles.emptyTitle}>No enhancement requests</Text>
                <Text style={styles.emptySub}>
                  Tap "Request Enhancement" above when you need an allocation increase for a tour.
                </Text>
              </View>
            ) : (
              requests.map((r) => (
                <View key={r._id} style={styles.reqCard}>
                  <View style={styles.txnTopRow}>
                    <Text style={styles.reqAmount}>
                      Requested Enhancement: +{fmtINR(r.requestedAmount)}
                    </Text>
                    <View
                      style={[
                        styles.reqStatusBadge,
                        r.status === "FULFILLED"
                          ? { backgroundColor: "#ecfdf5" }
                          : r.status === "REJECTED"
                            ? { backgroundColor: "#fef2f2" }
                            : { backgroundColor: "#fffbeb" },
                      ]}
                    >
                      <Text
                        style={[
                          styles.reqStatusText,
                          r.status === "FULFILLED"
                            ? { color: "#059669" }
                            : r.status === "REJECTED"
                              ? { color: "#dc2626" }
                              : { color: "#d97706" },
                        ]}
                      >
                        {r.status}
                      </Text>
                    </View>
                  </View>
                  {r.approvedAmount > 0 && (
                    <Text style={styles.reqApproved}>
                      Approved & Added to Petty Cash Balance: +{fmtINR(r.approvedAmount)}
                    </Text>
                  )}
                  <Text style={styles.txnDesc}>{r.reason}</Text>
                  {r.remarks ? (
                    <Text style={styles.reqRemarks}>Accounts Remark: {r.remarks}</Text>
                  ) : null}
                  <View style={styles.txnMetaRow}>
                    <Text style={styles.txnDate}>{fmtDate(r.createdAt)}</Text>
                  </View>
                </View>
              ))
            )}
          </>
        )}

        {tab === "return_requests" && (
          <>
            {returnRequests.length === 0 ? (
              <View style={styles.emptyBox}>
                <CornerUpLeft size={32} color="#cbd5e1" />
                <Text style={styles.emptyTitle}>No return requests</Text>
                <Text style={styles.emptySub}>
                  Tap "Return Request" above when you want to return excess petty cash to Accounts.
                </Text>
              </View>
            ) : (
              returnRequests.map((r) => {
                const displayStatus = r.status === "PROCESSED" ? "APPROVED" : r.status;
                const isApproved = displayStatus === "APPROVED";
                const isRejected = displayStatus === "REJECTED";
                return (
                  <View key={r._id} style={styles.reqCard}>
                    <View style={styles.txnTopRow}>
                      <Text style={styles.reqAmount}>
                        Requested Return: -{fmtINR(r.requestedAmount)}
                      </Text>
                      <View
                        style={[
                          styles.reqStatusBadge,
                          isApproved
                            ? { backgroundColor: "#ecfdf5" }
                            : isRejected
                              ? { backgroundColor: "#fef2f2" }
                              : { backgroundColor: "#fffbeb" },
                        ]}
                      >
                        <Text
                          style={[
                            styles.reqStatusText,
                            isApproved
                              ? { color: "#059669" }
                              : isRejected
                                ? { color: "#dc2626" }
                                : { color: "#d97706" },
                          ]}
                        >
                          {displayStatus}
                        </Text>
                      </View>
                    </View>
                    {r.approvedAmount > 0 && (
                      <Text style={[styles.reqApproved, { color: "#b91c1c" }]}>
                        Approved Return Amount: -{fmtINR(r.approvedAmount)}
                      </Text>
                    )}
                    {(r.remarks || r.employeeRemarks || r.reason) ? (
                      <Text style={styles.txnDesc}>
                        Remark: {r.remarks || r.employeeRemarks || r.reason}
                      </Text>
                    ) : null}
                    {Array.isArray(r.attachments) && r.attachments.length > 0 && (
                      <View style={styles.proofThumbRow}>
                        {r.attachments.map((att, idx) => {
                          const url = resolveProofImageUrl(typeof att === "string" ? att : att?.url);
                          if (!url) return null;
                          return (
                            <TouchableOpacity
                              key={`${r._id}_att_${idx}`}
                              onPress={() => Linking.openURL(url).catch(() => { })}
                              style={styles.proofThumbItem}
                            >
                              <Image source={{ uri: url }} style={styles.proofThumbImg} />
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    )}
                    {r.accountsRemarks ? (
                      <Text style={styles.reqRemarks}>
                        Accounts Remark: {r.accountsRemarks}
                      </Text>
                    ) : null}
                    <View style={styles.txnMetaRow}>
                      <Text style={styles.txnDate}>Submitted: {fmtDate(r.createdAt)}</Text>
                      {(r.reviewedAt || r.processedAt) ? (
                        <Text style={styles.txnDate}>
                          {isRejected ? "Reviewed: " : "Approved: "}
                          {fmtDate(r.reviewedAt || r.processedAt)}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                );
              })
            )}
          </>
        )}
      </ScrollView>

      {/* Modal: Request Enhancement */}
      <Modal
        visible={reqModal}
        transparent
        animationType="slide"
        onRequestClose={() => setReqModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalBox}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Request Petty Cash Enhancement</Text>
              <TouchableOpacity onPress={() => setReqModal(false)}>
                <X size={20} color="#64748b" />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSub}>
              Approved enhancements increase your Petty Cash Balance ({fmtINR(currentBalance)}). Your Base Limit ({fmtINR(currentBaseLimit)}) remains unchanged.
            </Text>

            <Text style={styles.inputLabel}>Enhancement Amount Required (₹) *</Text>
            <TextInput
              value={reqAmount}
              onChangeText={setReqAmount}
              keyboardType="numeric"
              placeholder="e.g. 2000"
              style={styles.input}
            />

            <Text style={styles.inputLabel}>Reason (e.g. upcoming outstation tour) *</Text>
            <TextInput
              value={reqReason}
              onChangeText={setReqReason}
              placeholder="Describe the tour or travel expense requirement"
              multiline
              numberOfLines={3}
              style={[styles.input, { height: 80, textAlignVertical: "top" }]}
            />

            <View style={styles.modalBtnRow}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setReqModal(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                disabled={submitting}
                style={styles.submitBtn}
                onPress={handleCreateRequest}
              >
                <Text style={styles.submitBtnText}>
                  {submitting ? "Submitting…" : "Submit Request"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal: Return Request */}
      <Modal
        visible={retModal}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setRetConfirmVisible(false);
          setRetModal(false);
        }}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalBox}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Petty Cash Return Request</Text>
              <TouchableOpacity
                onPress={() => {
                  setRetConfirmVisible(false);
                  setRetModal(false);
                }}
              >
                <X size={20} color="#64748b" />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSub}>
              Return the extra petty cash above your Base Limit ({fmtINR(currentBalance)} − {fmtINR(currentBaseLimit)} = {fmtINR(excessAboveBase)}) to the company.
            </Text>

            {/* Read-only Current Base Limit, Current Petty Cash Balance & Returnable Excess */}
            <View style={styles.summaryReadOnlyRow}>
              <View style={styles.summaryReadOnlyBox}>
                <Text style={styles.summaryReadOnlyLabel}>Base Limit</Text>
                <Text style={styles.summaryReadOnlyValue}>{fmtINR(currentBaseLimit)}</Text>
              </View>
              <View style={styles.summaryReadOnlyBox}>
                <Text style={styles.summaryReadOnlyLabel}>Petty Cash Balance</Text>
                <Text style={[styles.summaryReadOnlyValue, { color: "#059669" }]}>
                  {fmtINR(currentBalance)}
                </Text>
              </View>
              <View style={styles.summaryReadOnlyBox}>
                <Text style={styles.summaryReadOnlyLabel}>Extra to Return</Text>
                <Text style={[styles.summaryReadOnlyValue, { color: "#dc2626" }]}>
                  {fmtINR(availableForReturn)}
                </Text>
              </View>
            </View>
            {wallet?.reservedReturn > 0 && (
              <Text style={styles.reservedHint}>
                Available to return after pending requests: {fmtINR(availableForReturn)}
              </Text>
            )}

            {!retConfirmVisible ? (
              <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
                <Text style={styles.inputLabel}>Return Amount (₹) * (Max {fmtINR(availableForReturn)})</Text>
                <TextInput
                  value={retAmount}
                  onChangeText={setRetAmount}
                  keyboardType="numeric"
                  placeholder={`Max ${fmtINR(availableForReturn)}`}
                  style={styles.input}
                />

                <Text style={styles.inputLabel}>Remark *</Text>
                <TextInput
                  value={retRemarks}
                  onChangeText={setRetRemarks}
                  placeholder="Enter remark for returning excess petty cash"
                  multiline
                  numberOfLines={2}
                  style={[styles.input, { height: 68, textAlignVertical: "top" }]}
                />

                <Text style={styles.inputLabel}>Upload Proof Photos</Text>
                <View style={styles.proofPickerRow}>
                  <TouchableOpacity
                    style={styles.proofPickerBtn}
                    onPress={() => handlePickReturnProof(true)}
                    disabled={retUploadingProof}
                  >
                    <Camera size={16} color="#4f46e5" />
                    <Text style={styles.proofPickerBtnText}>Camera</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.proofPickerBtn}
                    onPress={() => handlePickReturnProof(false)}
                    disabled={retUploadingProof}
                  >
                    <ImageIcon size={16} color="#4f46e5" />
                    <Text style={styles.proofPickerBtnText}>Gallery</Text>
                  </TouchableOpacity>
                </View>

                {retProofs.length > 0 && (
                  <View style={styles.proofThumbRow}>
                    {retProofs.map((p) => (
                      <View key={p.localId} style={styles.proofThumbWrap}>
                        <Image
                          source={{ uri: p.uri || resolveProofImageUrl(p.url) }}
                          style={styles.proofThumbImg}
                        />
                        {p.isUploading && (
                          <View style={styles.proofUploadingOverlay}>
                            <ActivityIndicator size="small" color="#ffffff" />
                          </View>
                        )}
                        <TouchableOpacity
                          style={styles.proofRemoveBtn}
                          onPress={() => handleRemoveReturnProof(p.localId)}
                        >
                          <Trash2 size={11} color="#ffffff" />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                )}

                <View style={styles.modalBtnRow}>
                  <TouchableOpacity
                    style={styles.cancelBtn}
                    onPress={() => setRetModal(false)}
                  >
                    <Text style={styles.cancelBtnText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.submitBtn, { backgroundColor: "#dc2626" }]}
                    onPress={handleValidateReturnAndConfirm}
                  >
                    <Text style={styles.submitBtnText}>Review & Submit</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            ) : (
              /* Confirmation Dialog Step before Submission */
              <View style={styles.confirmBox}>
                <View style={styles.confirmHeaderRow}>
                  <CheckCircle2 size={20} color="#dc2626" />
                  <Text style={styles.confirmTitle}>Confirm Petty Cash Return Request</Text>
                </View>
                <Text style={styles.confirmDesc}>
                  Please confirm that you want to submit this Return Request to Accounts:
                </Text>
                <View style={styles.confirmDetailRow}>
                  <Text style={styles.confirmDetailLabel}>Return Amount:</Text>
                  <Text style={[styles.confirmDetailValue, { color: "#dc2626" }]}>
                    {fmtINR(Number(retAmount || 0))}
                  </Text>
                </View>
                <View style={styles.confirmDetailRow}>
                  <Text style={styles.confirmDetailLabel}>Balance After Approval:</Text>
                  <Text style={styles.confirmDetailValue}>
                    {fmtINR(currentBalance)} → {fmtINR(currentBalance - Number(retAmount || 0))}
                  </Text>
                </View>
                <View style={styles.confirmDetailRow}>
                  <Text style={styles.confirmDetailLabel}>Base Limit:</Text>
                  <Text style={styles.confirmDetailValue}>
                    {fmtINR(currentBaseLimit)} (Unchanged)
                  </Text>
                </View>
                <View style={styles.confirmDetailRow}>
                  <Text style={styles.confirmDetailLabel}>Remark:</Text>
                  <Text style={styles.confirmDetailValue}>{retRemarks.trim()}</Text>
                </View>
                {retProofs.filter((p) => p.url && !p.uploadFailed).length > 0 && (
                  <View style={styles.confirmDetailRow}>
                    <Text style={styles.confirmDetailLabel}>Proof Photos:</Text>
                    <Text style={styles.confirmDetailValue}>
                      {retProofs.filter((p) => p.url && !p.uploadFailed).length} attached
                    </Text>
                  </View>
                )}

                <View style={styles.modalBtnRow}>
                  <TouchableOpacity
                    disabled={retSubmitting}
                    style={styles.cancelBtn}
                    onPress={() => setRetConfirmVisible(false)}
                  >
                    <Text style={styles.cancelBtnText}>Back to Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    disabled={retSubmitting}
                    style={[styles.submitBtn, { backgroundColor: "#dc2626" }]}
                    onPress={handleConfirmReturnSubmit}
                  >
                    <Text style={styles.submitBtnText}>
                      {retSubmitting ? "Submitting…" : "Confirm & Submit"}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        </View>
      </Modal>

      <HRModuleFooter navigation={navigation} activeTab="Expense" />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc" },
  scroll: { padding: 14, paddingBottom: 90 },
  reqTopBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "#4f46e5",
    alignItems: "center",
    justifyContent: "center",
  },
  dualCardsContainer: {
    gap: 12,
    marginBottom: 14,
  },
  balanceCard: {
    backgroundColor: "#312e81",
    borderRadius: 20,
    padding: 18,
  },
  balanceCardNegative: { backgroundColor: "#991b1b" },
  balanceHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  balanceTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  balanceLabel: { color: "#e0e7ff", fontSize: 12, fontWeight: "700" },
  negBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(0,0,0,0.28)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  negBadgeText: { color: "#fecaca", fontSize: 10, fontWeight: "800" },
  statusBadge: {
    backgroundColor: "rgba(16,185,129,0.28)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  statusBadgeText: { color: "#ecfdf5", fontSize: 10, fontWeight: "800" },
  balanceValue: { color: "#ffffff", fontSize: 28, fontWeight: "800", marginTop: 8 },
  inlineBaseLimitText: {
    color: "#c7d2fe",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 4,
  },
  negHint: { color: "#fecdd3", fontSize: 11, marginTop: 6, lineHeight: 16 },
  balCaption: { color: "#c7d2fe", fontSize: 11, marginTop: 4, lineHeight: 15 },
  actionBtnRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 16,
  },
  enhanceActionBtn: {
    flex: 1,
    minWidth: 135,
    backgroundColor: "#ffffff",
    borderRadius: 14,
    paddingVertical: 11,
    paddingHorizontal: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    borderWidth: 1,
    borderColor: "#e0e7ff",
  },
  enhanceIconCircle: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: "#eef2ff",
    alignItems: "center",
    justifyContent: "center",
  },
  actionTextCol: {
    flex: 1,
  },
  enhanceActionBtnText: { color: "#1e1b4b", fontSize: 12.5, fontWeight: "800" },
  returnActionBtn: {
    flex: 1,
    minWidth: 135,
    backgroundColor: "#fff1f2",
    borderRadius: 14,
    paddingVertical: 11,
    paddingHorizontal: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    borderWidth: 1,
    borderColor: "#fecdd3",
  },
  returnActionBtnDisabled: {
    backgroundColor: "rgba(255,255,255,0.14)",
    borderColor: "rgba(255,255,255,0.22)",
  },
  returnIconCircle: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: "#ffe4e6",
    alignItems: "center",
    justifyContent: "center",
  },
  returnIconCircleDisabled: {
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  returnActionBtnText: { color: "#991b1b", fontSize: 12.5, fontWeight: "800" },
  returnActionBtnTextDisabled: { color: "#ffffff" },
  pendingBanner: {
    backgroundColor: "#fffbeb",
    borderWidth: 1,
    borderColor: "#fde68a",
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
  },
  pendingBannerTitle: { fontSize: 12, fontWeight: "800", color: "#92400e" },
  pendingBannerSub: { fontSize: 11, color: "#b45309", marginTop: 2 },
  tabRow: {
    flexDirection: "row",
    backgroundColor: "#e2e8f0",
    borderRadius: 12,
    padding: 3,
    marginBottom: 12,
  },
  tabBtn: { flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: "center" },
  tabBtnActive: { backgroundColor: "#ffffff" },
  tabText: { fontSize: 11.5, fontWeight: "700", color: "#64748b" },
  tabTextActive: { color: "#1e293b", fontWeight: "800" },
  emptyBox: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 28,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    marginTop: 8,
  },
  emptyTitle: { fontSize: 14, fontWeight: "800", color: "#334155", marginTop: 8 },
  emptySub: { fontSize: 12, color: "#64748b", textAlign: "center", marginTop: 4 },
  txnCard: {
    flexDirection: "row",
    gap: 10,
    backgroundColor: "#ffffff",
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    marginBottom: 8,
  },
  txnIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  txnBadgeRow: {
    flexDirection: "row",
    marginBottom: 4,
  },
  catBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  catBadgeText: {
    fontSize: 9.5,
    fontWeight: "800",
  },
  txnTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  txnType: { fontSize: 12, fontWeight: "800", color: "#0f172a" },
  txnAmount: { fontSize: 14, fontWeight: "800" },
  txnDesc: { fontSize: 12, color: "#475569", marginTop: 2 },
  txnAuditGrid: {
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: "rgba(148,163,184,0.2)",
    gap: 2,
  },
  txnBalAfter: { fontSize: 10.5, color: "#334155", fontWeight: "700" },
  txnMetaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 4,
  },
  txnDate: { fontSize: 10, color: "#94a3b8", fontWeight: "600" },
  txnRef: { fontSize: 10, color: "#64748b", fontWeight: "600" },
  pageRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    marginTop: 10,
  },
  pageBtn: {
    padding: 8,
    backgroundColor: "#ffffff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  pageText: { fontSize: 12, fontWeight: "700", color: "#475569" },
  reqCard: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    marginBottom: 8,
  },
  reqAmount: { fontSize: 13, fontWeight: "800", color: "#0f172a" },
  reqApproved: { fontSize: 12, fontWeight: "700", color: "#059669", marginTop: 2 },
  reqRemarks: {
    fontSize: 11,
    color: "#64748b",
    marginTop: 4,
    fontStyle: "italic",
  },
  reqStatusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  reqStatusText: { fontSize: 10, fontWeight: "800" },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.55)",
    justifyContent: "flex-end",
  },
  modalBox: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  modalTitle: { fontSize: 16, fontWeight: "800", color: "#0f172a" },
  modalSub: {
    fontSize: 12,
    color: "#64748b",
    marginTop: 4,
    marginBottom: 12,
    fontWeight: "600",
  },
  summaryReadOnlyRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 8,
  },
  summaryReadOnlyBox: {
    flex: 1,
    minWidth: 85,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    padding: 10,
  },
  summaryReadOnlyLabel: {
    fontSize: 10.5,
    fontWeight: "700",
    color: "#64748b",
  },
  summaryReadOnlyValue: {
    fontSize: 15,
    fontWeight: "800",
    color: "#0f172a",
    marginTop: 2,
  },
  reservedHint: {
    fontSize: 11,
    color: "#b45309",
    fontWeight: "600",
    marginBottom: 6,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#334155",
    marginTop: 8,
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: "#0f172a",
    backgroundColor: "#f8fafc",
  },
  confirmBox: {
    backgroundColor: "#fef2f2",
    borderWidth: 1,
    borderColor: "#fecaca",
    borderRadius: 14,
    padding: 14,
    marginTop: 6,
  },
  confirmHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  confirmTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#991b1b",
  },
  confirmDesc: {
    fontSize: 12,
    color: "#7f1d1d",
    marginBottom: 10,
  },
  confirmDetailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  confirmDetailLabel: {
    fontSize: 12,
    color: "#475569",
    fontWeight: "600",
  },
  confirmDetailValue: {
    fontSize: 12,
    color: "#0f172a",
    fontWeight: "800",
  },
  modalBtnRow: { flexDirection: "row", gap: 10, marginTop: 16 },
  proofPickerRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  proofPickerBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#c7d2fe",
    backgroundColor: "#eef2ff",
  },
  proofPickerBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#4f46e5",
  },
  proofThumbRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8,
  },
  proofThumbWrap: {
    width: 60,
    height: 60,
    borderRadius: 10,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    position: "relative",
  },
  proofThumbItem: {
    width: 52,
    height: 52,
    borderRadius: 8,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#cbd5e1",
  },
  proofThumbImg: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  proofUploadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15,23,42,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  proofRemoveBtn: {
    position: "absolute",
    top: 3,
    right: 3,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "rgba(220,38,38,0.9)",
    alignItems: "center",
    justifyContent: "center",
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "#f1f5f9",
    alignItems: "center",
  },
  cancelBtnText: { fontSize: 13, fontWeight: "700", color: "#475569" },
  submitBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "#4f46e5",
    alignItems: "center",
  },
  submitBtnText: { fontSize: 13, fontWeight: "800", color: "#ffffff" },
});

export default PettyCashWalletScreen;
