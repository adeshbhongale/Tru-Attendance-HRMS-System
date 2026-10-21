import { CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react-native";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

/** Expense module design tokens (built on the app's previous theme: primary #4f46e5). */
export const C = {
  primary: "#4f46e5",
  primarySoft: "#eef2ff",
  bg: "#f1f5f9",
  card: "#ffffff",
  border: "#e2e8f0",
  text: "#0f172a",
  muted: "#64748b",
  faint: "#94a3b8",
  success: "#059669",
  successSoft: "#f0fdf4",
  danger: "#dc2626",
  dangerSoft: "#fef2f2",
  warning: "#d97706",
  warningSoft: "#fffbeb",
  info: "#4f46e5",
  infoSoft: "#eef2ff",
};

export const STATUS_META = {
  DRAFT: { label: "Draft", color: "#475569", bg: "#f1f5f9" },
  SUBMITTED: { label: "Submitted", color: "#2563eb", bg: "#eff6ff" },
  HR_PENDING: { label: "Under Review", color: "#b45309", bg: "#fffbeb" },
  FULL_PAYMENT_PENDING: { label: "Full Payment Approval", color: "#c2410c", bg: "#fff7ed" },
  ACCOUNTS_PENDING: { label: "Approved · Payment Pending", color: "#4f46e5", bg: "#eef2ff" },
  ACCOUNTS_APPROVED: { label: "Approved · Payment Pending", color: "#4f46e5", bg: "#eef2ff" },
  PAID: { label: "Fully Paid", color: "#15803d", bg: "#f0fdf4" },
  DISBURSED: { label: "Fully Paid", color: "#15803d", bg: "#f0fdf4" },
  SETTLED: { label: "Fully Paid", color: "#15803d", bg: "#f0fdf4" },
  HR_REJECTED: { label: "Rejected", color: "#b91c1c", bg: "#fef2f2" },
  ACCOUNTS_REJECTED: { label: "Rejected", color: "#b91c1c", bg: "#fef2f2" },
  REJECTED: { label: "Rejected", color: "#b91c1c", bg: "#fef2f2" },
  RETURNED: { label: "Returned", color: "#c2410c", bg: "#fff7ed" },
  CANCELLED: { label: "Cancelled", color: "#475569", bg: "#f1f5f9" },
};

export const statusMeta = (s) => STATUS_META[String(s || "").toUpperCase()] || { label: s || "-", color: C.muted, bg: "#f1f5f9" };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "₹1,250" / "₹1,250.50" (Indian grouping). */
export const formatINR = (n) => {
  const v = Number(n || 0);
  return `₹${v.toLocaleString("en-IN", { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
};

/** Claim dates are calendar dates stored as UTC midnight -> "29 Sep 2026". */
export const formatDate = (value) => {
  if (!value) return "";
  const s = String(value);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
  const d = new Date(value);
  if (isNaN(d.getTime())) return "";
  return `${String(d.getDate()).padStart(2, "0")} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
};

export const formatDateTime = (value) => {
  if (!value) return "";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "";
  const h = d.getHours() % 12 || 12;
  return `${formatDate(d)}, ${h}:${String(d.getMinutes()).padStart(2, "0")} ${d.getHours() >= 12 ? "PM" : "AM"}`;
};

/** Local (device) date -> "YYYY-MM-DD". */
export const toISODate = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** "YYYY-MM-DD" -> local Date at midnight. */
export const fromISODate = (s) => {
  const m = String(s || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
};

export const nightsBetween = (from, to) => {
  const a = fromISODate(from);
  const b = fromISODate(to);
  if (!a || !b) return 0;
  return Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / 86400000);
};

/** Date range label for cards: "29 Sep – 02 Oct 2026" or single date. */
export const claimDateLabel = (c) => {
  if (c?.claimMode === "LODGING" && c.fromDate && c.toDate) {
    const f = formatDate(c.fromDate);
    const t = formatDate(c.toDate);
    return f.slice(-4) === t.slice(-4) ? `${f.slice(0, 6)} – ${t}` : `${f} – ${t}`;
  }
  if (c?.claimDate) return formatDate(c.claimDate);
  return formatDate(c?.trip?.startDate || c?.createdAt);
};

export const SectionCard = ({ title, icon: Icon, right, children, style, testID }) => (
  <View style={[ui.card, style]} testID={testID}>
    {title ? (
      <View style={ui.cardHead}>
        <View style={ui.cardHeadLeft}>
          {Icon ? (
            <View style={ui.cardIcon}>
              <Icon size={16} color={C.primary} />
            </View>
          ) : null}
          <Text style={ui.cardTitle}>{title}</Text>
        </View>
        {right}
      </View>
    ) : null}
    {children}
  </View>
);

export const FieldLabel = ({ label, required, hint, right }) => (
  <View style={ui.labelRow}>
    <Text style={ui.label}>
      {label}
      {required ? <Text style={{ color: C.danger }}> *</Text> : null}
    </Text>
    {right || (hint ? <Text style={ui.hint}>{hint}</Text> : null)}
  </View>
);

export const FieldError = ({ message, testID }) =>
  message ? (
    <View style={ui.errorRow} testID={testID} accessibilityLiveRegion="polite">
      <CircleAlert size={14} color={C.danger} />
      <Text style={ui.errorText}>{message}</Text>
    </View>
  ) : null;

export const StatusBadge = ({ status, small }) => {
  const m = statusMeta(status);
  return (
    <View style={[ui.badge, { backgroundColor: m.bg }, small && { paddingHorizontal: 8, paddingVertical: 3 }]}>
      <View style={[ui.badgeDot, { backgroundColor: m.color }]} />
      <Text style={[ui.badgeText, { color: m.color }, small && { fontSize: 11 }]} numberOfLines={1}>
        {m.label}
      </Text>
    </View>
  );
};

const BANNER = {
  info: { icon: Info, color: C.info, bg: C.infoSoft, border: "#bfdbfe" },
  success: { icon: CircleCheck, color: C.success, bg: C.successSoft, border: "#bbf7d0" },
  warning: { icon: TriangleAlert, color: C.warning, bg: C.warningSoft, border: "#fed7aa" },
  error: { icon: CircleAlert, color: C.danger, bg: C.dangerSoft, border: "#fecaca" },
};

export const Banner = ({ type = "info", title, message, actionLabel, onAction, style, testID }) => {
  const b = BANNER[type] || BANNER.info;
  const Icon = b.icon;
  return (
    <View style={[ui.banner, { backgroundColor: b.bg, borderColor: b.border }, style]} testID={testID} accessibilityLiveRegion="polite">
      <Icon size={18} color={b.color} style={{ marginTop: 1 }} />
      <View style={{ flex: 1, marginLeft: 10 }}>
        {title ? <Text style={[ui.bannerTitle, { color: b.color }]}>{title}</Text> : null}
        {message ? <Text style={ui.bannerText}>{message}</Text> : null}
        {actionLabel ? (
          <TouchableOpacity onPress={onAction} style={[ui.bannerAction, { borderColor: b.color }]} accessibilityRole="button">
            <Text style={[ui.bannerActionText, { color: b.color }]}>{actionLabel}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
};

export const InfoRow = ({ label, value, strong, color, last }) => (
  <View style={[ui.infoRow, last && { borderBottomWidth: 0 }]}>
    <Text style={ui.infoLabel}>{label}</Text>
    <Text style={[ui.infoValue, strong && { fontWeight: "800" }, color && { color }]} selectable>
      {value === undefined || value === null || value === "" ? "—" : value}
    </Text>
  </View>
);

export const ui = StyleSheet.create({
  card: {
    backgroundColor: C.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: C.border,
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  cardHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  cardHeadLeft: { flexDirection: "row", alignItems: "center", flex: 1 },
  cardIcon: { width: 28, height: 28, borderRadius: 8, backgroundColor: C.primarySoft, alignItems: "center", justifyContent: "center", marginRight: 10 },
  cardTitle: { fontSize: 15, fontWeight: "800", color: C.text },
  labelRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  label: { fontSize: 14, fontWeight: "700", color: "#1e293b" },
  hint: { fontSize: 12, color: C.muted },
  input: {
    minHeight: 50,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 16,
    color: C.text,
    backgroundColor: "#fff",
  },
  inputError: { borderColor: C.danger, backgroundColor: "#fffafa" },
  errorRow: { flexDirection: "row", alignItems: "flex-start", marginTop: 6 },
  errorText: { color: C.danger, fontSize: 13, marginLeft: 6, flex: 1, fontWeight: "500" },
  badge: { flexDirection: "row", alignItems: "center", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, alignSelf: "flex-start" },
  badgeDot: { width: 6, height: 6, borderRadius: 3, marginRight: 6 },
  badgeText: { fontSize: 12, fontWeight: "700" },
  banner: { flexDirection: "row", borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 14 },
  bannerTitle: { fontSize: 14, fontWeight: "800", marginBottom: 2 },
  bannerText: { fontSize: 13, color: "#334155", lineHeight: 19 },
  bannerAction: { alignSelf: "flex-start", marginTop: 8, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  bannerActionText: { fontSize: 13, fontWeight: "700" },
  infoRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#f1f5f9" },
  infoLabel: { fontSize: 13, color: C.muted, flex: 0.9, paddingRight: 8 },
  infoValue: { fontSize: 14, color: C.text, fontWeight: "600", flex: 1.1, textAlign: "right" },
});
