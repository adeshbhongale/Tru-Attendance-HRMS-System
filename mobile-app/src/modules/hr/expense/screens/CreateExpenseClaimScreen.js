import AsyncStorage from "@react-native-async-storage/async-storage";
import DateTimePicker from "@react-native-community/datetimepicker";
import * as ImagePicker from "expo-image-picker";
import {
  AlertCircle,
  Barcode,
  BedDouble,
  Bike,
  Briefcase,
  Building2,
  Bus,
  Calculator,
  Calendar,
  Camera,
  Car,
  CarTaxiFront,
  CheckCircle2,
  ChevronDown,
  Eye,
  FileCheck,
  FileText,
  Fuel,
  Gauge,
  Image as ImageIcon,
  MapPin,
  Minus,
  Plane,
  Plus,
  Receipt,
  Search,
  Send,
  ShieldCheck,
  ShoppingBag,
  TrainFront,
  Trash2,
  Users,
  X,
  Zap,
} from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { resolveProofImageUrl } from "../../../../utils/imageUrl";
import expenseApi, { newRequestId } from "../api/expenseApi";
import ExpenseHeader from "../components/ExpenseHeader";

const NORMAL_EXPENSE_TYPES = [
  { code: "FOOD", name: "Food", icon: Receipt },
  { code: "TRAVEL", name: "Travel", icon: MapPin },
  { code: "CONVEYANCE", name: "Local Conveyance", icon: MapPin },
  { code: "STOCK_PURCHASE", name: "Stock Purchase", icon: ShoppingBag },
  { code: "OTHER", name: "Other", icon: FileText },
];

/** Conveyance Modes (Car, Bike, E-Bike, E-Car) as configured in Admin Website */
const CONVEYANCE_MODES = [
  { key: "twoWheeler", code: "twoWheeler", label: "2-Wheeler / Bike", shortLabel: "Bike", icon: Bike, defaultRate: 3.5 },
  { key: "car", code: "car", label: "Car (4W)", shortLabel: "Car", icon: Car, defaultRate: 5.0 },
  { key: "eBike", code: "eBike", label: "E-Bike", shortLabel: "E-Bike", icon: Zap, defaultRate: 1.0 },
  { key: "eCar", code: "eCar", label: "E-Car", shortLabel: "E-Car", icon: Zap, defaultRate: 1.75 },
];

const DEFAULT_CONVEYANCE_RATES = {
  twoWheeler: 3.5,
  car: 5.0,
  eBike: 1.0,
  eCar: 1.75,
};

const KM_RATE_SUBTYPE_CODES = [
  "OWN_VEHICLE",
  "TWO_WHEELER_PETROL",
  "TWO_WHEELER_EV",
  "FOUR_WHEELER_PETROL",
  "FOUR_WHEELER_EV",
];

const isKmWorkflow = (subObj, entryObj) => {
  if (subObj?.workflow === "KM_RATE") return true;
  const sCode = String(subObj?.code || entryObj?.travelSubtypeCode || "").toUpperCase();
  if (KM_RATE_SUBTYPE_CODES.includes(sCode)) return true;
  if (!subObj && entryObj?.travelWorkflow === "KM_RATE") return true;
  return false;
};

const getTravelModeIconComponent = (codeOrName) => {
  const key = String(codeOrName || "").toUpperCase();
  if (key.includes("TRAIN") || key.includes("RAIL")) return TrainFront;
  if (key.includes("BUS")) return Bus;
  if (key.includes("FLIGHT") || key.includes("AIR") || key.includes("PLANE")) return Plane;
  if (key.includes("TAXI") || key.includes("AUTO") || key.includes("CAB")) return CarTaxiFront;
  if (key.includes("_EV") || key.includes("EBIKE") || key.includes("ECAR") || key.includes("E-BIKE") || key.includes("E-CAR")) return Zap;
  if (key.includes("TWO_WHEELER") || key.includes("2W") || key.includes("2-WHEELER") || key.includes("BIKE")) return Bike;
  if (key.includes("FOUR_WHEELER") || key.includes("4W") || key.includes("4-WHEELER") || key.includes("CAR")) return Car;
  return Car;
};

const DEFAULT_DYNAMIC_TRAVEL_MODES = [
  {
    code: "BUS",
    name: "Bus",
    category: "PUBLIC",
    requiresSubtype: true,
    subtypes: [{ code: "AC_LUXURY_BUS", name: "AC Luxury Bus", workflow: "STANDARD" }],
  },
  {
    code: "FLIGHT",
    name: "Flight",
    category: "PUBLIC",
    requiresSubtype: true,
    subtypes: [{ code: "FLIGHT_ECONOMY", name: "Flight Economy", workflow: "STANDARD" }],
  },
  {
    code: "TAXI_AUTO",
    name: "Taxi/Auto",
    category: "PUBLIC",
    requiresSubtype: false,
    subtypes: [],
  },
  {
    code: "TRAIN",
    name: "Train",
    category: "PUBLIC",
    requiresSubtype: true,
    subtypes: [
      { code: "TRAIN_1AC", name: "Train Ind AC Class", workflow: "STANDARD" },
      { code: "TRAIN_2AC", name: "Train IInd AC Class", workflow: "STANDARD" },
      { code: "TRAIN_2ND", name: "Train IInd Class", workflow: "STANDARD" },
    ],
  },
  {
    code: "TWO_WHEELER_PETROL",
    name: "2-Wheeler Petrol",
    category: "VEHICLE",
    conveyanceRateKey: "twoWheeler",
    requiresSubtype: true,
    subtypes: [
      { code: "COMPANY_VEHICLE", name: "Company Vehicle", workflow: "STANDARD" },
      { code: "OWN_VEHICLE", name: "Own Vehicle", workflow: "KM_RATE", rateKey: "twoWheeler", conveyanceRateKey: "twoWheeler", ratePerKm: 3.5 },
    ],
  },
  {
    code: "TWO_WHEELER_EV",
    name: "2-Wheeler EV",
    category: "VEHICLE",
    conveyanceRateKey: "eBike",
    requiresSubtype: true,
    subtypes: [
      { code: "COMPANY_VEHICLE", name: "Company Vehicle", workflow: "STANDARD" },
      { code: "OWN_VEHICLE", name: "Own Vehicle", workflow: "KM_RATE", rateKey: "eBike", conveyanceRateKey: "eBike", ratePerKm: 1.0 },
    ],
  },
  {
    code: "FOUR_WHEELER_PETROL",
    name: "4-Wheeler Petrol",
    category: "VEHICLE",
    conveyanceRateKey: "car",
    requiresSubtype: true,
    subtypes: [
      { code: "COMPANY_VEHICLE", name: "Company Vehicle", workflow: "STANDARD" },
      { code: "OWN_VEHICLE", name: "Own Vehicle", workflow: "KM_RATE", rateKey: "car", conveyanceRateKey: "car", ratePerKm: 5.0 },
    ],
  },
  {
    code: "FOUR_WHEELER_EV",
    name: "4-Wheeler EV",
    category: "VEHICLE",
    conveyanceRateKey: "eCar",
    requiresSubtype: true,
    subtypes: [
      { code: "COMPANY_VEHICLE", name: "Company Vehicle", workflow: "STANDARD" },
      { code: "OWN_VEHICLE", name: "Own Vehicle", workflow: "KM_RATE", rateKey: "eCar", conveyanceRateKey: "eCar", ratePerKm: 1.75 },
    ],
  },
];

const sanitizeTravelSubtypesList = (rawSubtypes) => {
  const seen = new Set();
  return (Array.isArray(rawSubtypes) ? rawSubtypes : []).filter((s) => {
    if (!s || s.isActive === false || s.status === "inactive") return false;
    const key = String(s.code || s._id || "").trim().toUpperCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const sanitizeTravelModesList = (rawModes) => {
  const list = Array.isArray(rawModes) ? rawModes : [];
  const hasSplitVehicleModes = list.some(
    (m) =>
      m &&
      m.isActive !== false &&
      m.status !== "inactive" &&
      ["TWO_WHEELER_PETROL", "TWO_WHEELER_EV", "FOUR_WHEELER_PETROL", "FOUR_WHEELER_EV"].includes(String(m.code || "").toUpperCase())
  );
  const seenModes = new Set();
  const out = [];
  for (const m of list) {
    if (!m || m.isActive === false || m.status === "inactive") continue;
    const code = String(m.code || m._id || "").trim().toUpperCase();
    if (!code || seenModes.has(code)) continue;
    if (code === "OWN_VEHICLE" || code === "COMPANY_VEHICLE") continue;
    if (hasSplitVehicleModes && (code === "TWO_WHEELER" || code === "FOUR_WHEELER")) continue;
    seenModes.add(code);
    out.push({
      ...m,
      subtypes: sanitizeTravelSubtypesList(m.subtypes),
    });
  }
  return out;
};

const COUNT_OPTIONS = Array.from({ length: 20 }, (_, i) => i + 1).map((n) => ({
  value: n,
  label: `${n} employee${n > 1 ? "s" : ""}`,
}));

const getTodayDateStr = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};


const daysBetween = (fromStr, toStr) => {
  if (!fromStr || !toStr) return 0;
  const d1 = new Date(fromStr);
  const d2 = new Date(toStr);
  if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return 0;
  const diffTime = Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
  if (diffTime < 0) return 0;
  return diffTime + 1; // inclusive days: e.g. 28th to 30th = 3 days; same-day = 1 day
};

const nightsBetween = (fromStr, toStr) => {
  if (!fromStr || !toStr) return 0;
  const d1 = new Date(fromStr);
  const d2 = new Date(toStr);
  if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return 0;
  const diffTime = Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
  return diffTime > 0 ? diffTime : 0; // lodging nights: To Date - From Date (checkout not counted)
};

const formatINR = (n) => {
  const v = Number(n || 0);
  return `₹${v.toLocaleString("en-IN", { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
};

// Local Conveyance photo proofs (uploaded instead of bills)
const CONVEYANCE_PHOTO_FIELDS = [
  { field: "numberPlatePhotos", label: "Vehicle Number Plate Photo" },
  { field: "startKmPhotos", label: "Start Kilometer Photo" },
  { field: "endKmPhotos", label: "End Kilometer Photo" },
];

/** Stored attachments -> form state items (edit mode). */
const toUploadedPhotos = (list, prefix) =>
  (Array.isArray(list) ? list : []).map((r, i) => {
    const url = resolveProofImageUrl(r) || r.url || r.uri;
    return { localId: `${prefix}_${r._id || i}`, uri: url, url, name: r.name || `Photo #${i + 1}`, type: r.type || "image/jpeg", size: r.size || 0, isUploading: false };
  });

/** Form state items -> uploaded files only (payload). */
const toPayloadFiles = (list) =>
  (Array.isArray(list) ? list : [])
    .map((a) => {
      const finalUrl = a.url || (a.uri && !a.uri.startsWith("file://") && !a.uri.startsWith("content://") ? a.uri : "");
      return { name: a.name, url: finalUrl, type: a.type, size: a.size };
    })
    .filter((a) => a.url);

let cachedCurrentUser = null;
let cachedEmployeesList = [];

const normStr = (v) => String(v || "").trim().toLowerCase();
const MANAGEMENT_ROLES = [
  "management", "company_admin", "companyadmin", "admin",
  "super_admin", "superadmin", "tcca1", "tcsa1", "tcmgt",
  "tcdr1a", "tcdr2a", "vp", "avp", "general_manager", "director", "ceo"
];

const isManagementFiler = (u) => {
  if (!u) return false;
  const role = normStr(u.role);
  const roleCode = String(u.roleCode || "").trim().toUpperCase();
  if (MANAGEMENT_ROLES.some((t) => role === t || normStr(roleCode) === t)) return true;
  const desig = normStr(u.designation);
  const dept = normStr(u.department);
  const cat = String(u.levelRef?.category || u.effectiveCategory || u.category || "").trim().toUpperCase();
  const deptAdminType = normStr(u.departmentAdminType || u.adminType);
  if (cat === "MANAGEMENT") return true;
  if (["management", "general_manager", "vp", "avp", "ceo", "director"].includes(role)) return true;
  if (/^(TC(MN)|MANAGEMENT|TCMGT|VP|AVP|GM|CEO|TCCA|TCSA|TCDR|TCDI)/i.test(roleCode)) return true;
  if (deptAdminType === "management") return true;
  if (/^(management|executive|director|directors|board of directors|bod)$/i.test(dept) || /management/i.test(dept)) return true;
  if (/(ceo|vp|vice president|general manager|president|chairman|director|^management$)/i.test(desig)) return true;
  const resp = Array.isArray(u.responsibilityCodes)
    ? u.responsibilityCodes
    : (u.responsibilityCodes ? [String(u.responsibilityCodes)] : []);
  if (resp.some((r) => String(r).toUpperCase().trim() === "MANAGEMENT_APPROVER")) return true;
  return false;
};

const CreateExpenseClaimScreen = ({ navigation, route }) => {
  const initialMode = route.params?.mode || "NORMAL";
  const isInitialOther = initialMode === "OTHER" || route.params?.expenseType === "OTHER";
  const editClaimId = route.params?.claimId || route.params?.id || route.params?.claim?._id || null;
  const [editingClaimNumber, setEditingClaimNumber] = useState("");
  const [isEditingSubmittedClaim, setIsEditingSubmittedClaim] = useState(false);
  const [isEditingRejectedClaim, setIsEditingRejectedClaim] = useState(false);
  const [rejectionReasonText, setRejectionReasonText] = useState("");

  const [claimMode, setClaimMode] = useState(initialMode === "LODGING" ? "LODGING" : "NORMAL");
  const isLodging = claimMode === "LODGING";

  const [currentUser, setCurrentUser] = useState(cachedCurrentUser);
  const isCurrentUserManagement = isManagementFiler(currentUser);
  const [employeesList, setEmployeesList] = useState(cachedEmployeesList);
  const [loadingEmployees, setLoadingEmployees] = useState(cachedEmployeesList.length === 0);
  const [citiesList, setCitiesList] = useState([]);

  // Normal vs Lodging Date fields (start empty, chosen by employee)
  const [claimDate, setClaimDate] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [activeDatePicker, setActiveDatePicker] = useState(null); // 'claimDate' | 'fromDate' | 'toDate'

  // Employee Selection - Pre-populated with current user immediately
  const [numberOfEmployees, setNumberOfEmployees] = useState(1);
  const [employeeSelections, setEmployeeSelections] = useState(() => [
    {
      employeeId: cachedCurrentUser?._id || cachedCurrentUser?.id || "self",
      label: cachedCurrentUser?.name || "",
      isSelf: true,
      designation: cachedCurrentUser?.designation || "",
      department: cachedCurrentUser?.department || "",
    },
  ]);

  // Customer & Destination (starts empty, chosen by employee)
  const [customerName, setCustomerName] = useState("");
  const [customerId, setCustomerId] = useState(null);
  const [destinationCity, setDestinationCity] = useState("");

  // Normal Claim Top-Level Visit Option ('NO_VISIT' | 'VISIT') - no default, must be chosen by employee
  const [normalVisitType, setNormalVisitType] = useState("");

  // Lodging Stay Type ('IN_HOTEL' | 'WITH_RELATIVE') - no default, must be chosen by the employee
  const [stayType, setStayType] = useState("");
  // Relative-stay % from the active Expense Policy (display only; amounts are calculated by the backend)
  const [relativeStayPercent, setRelativeStayPercent] = useState(null);
  // With Relative: no amount is typed and no hotel bill is uploaded; the backend calculates the allowed amount
  const isRelativeStay = isLodging && stayType === "WITH_RELATIVE";

  // Expense Details (no default expenseType in Normal Claim mode; user selects from dropdown)
  const [expenseType, setExpenseType] = useState(isLodging ? "LODGING" : (isInitialOther ? "OTHER" : (route.params?.expenseType || "")));
  const [requestedAmount, setRequestedAmount] = useState("");
  const [remark, setRemark] = useState("");

  // Optional Food Claim inside the Lodging Form (multiplier entries for Food only)
  const [includeFood, setIncludeFood] = useState(false);
  const [foodEntries, setFoodEntries] = useState(() => [
    { id: "food_1", requestedAmount: "", remark: "", attachments: [] },
  ]);
  const [foodEntitlementInfo, setFoodEntitlementInfo] = useState({ loading: false, data: null });

  // Dynamic Travel Modes & Subtypes from Admin Configuration
  const [travelModes, setTravelModes] = useState(DEFAULT_DYNAMIC_TRAVEL_MODES);
  const [travelEntitlementsConfigured, setTravelEntitlementsConfigured] = useState(false);

  // Server Preview & Validation
  const [previewData, setPreviewData] = useState(null);
  const [previewing, setPreviewing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [serverErrors, setServerErrors] = useState([]);
  const [serverWarnings, setServerWarnings] = useState([]);

  // Conveyance Rates (From Expense Management Policy)
  const [conveyanceRates, setConveyanceRates] = useState(DEFAULT_CONVEYANCE_RATES);

  const getRateForMode = useCallback(
    (modeKey, rates = conveyanceRates) => {
      const cur = rates || DEFAULT_CONVEYANCE_RATES;
      const val = cur[modeKey];
      if (val !== undefined && val !== null && !isNaN(Number(val))) {
        return Number(val);
      }
      return DEFAULT_CONVEYANCE_RATES[modeKey] ?? 3.5;
    },
    [conveyanceRates]
  );

  // Multi-entry for Normal Expense Form (supports multiple expense entries e.g. #1, #2, etc.)
  const [entries, setEntries] = useState(() => [
    {
      id: "1",
      expenseType: initialMode === "LODGING" ? "LODGING" : (isInitialOther ? "OTHER" : (route.params?.expenseType || "")),
      otherSubType: isInitialOther ? "PURCHASE" : "",
      materialName: "",
      barcodeNumber: "",
      quantity: "",
      vehicle: "twoWheeler",
      distanceKm: "",
      travelModeId: "",
      travelModeCode: "",
      travelModeName: "",
      travelSubtypeId: "",
      travelSubtypeCode: "",
      travelSubtypeName: "",
      travelWorkflow: "STANDARD",
      startKm: "",
      endKm: "",
      ratePerKm: "",
      visitType: "",
      isVisit: false,
      numberPlatePhotos: [],
      startKmPhotos: [],
      endKmPhotos: [],
      serviceReports: [],
      requestedAmount: "",
      remark: "",
      attachments: [],
    },
  ]);

  const handleAddFoodEntry = () => {
    setFoodEntries((prev) => [
      ...prev,
      { id: `food_${Date.now()}_${prev.length + 1}`, requestedAmount: "", remark: "", attachments: [] },
    ]);
    setPreviewData(null);
  };

  const handleRemoveFoodEntry = (fIdx) => {
    setFoodEntries((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== fIdx)));
    setPreviewData(null);
  };

  const handleUpdateFoodEntry = (fIdx, field, value) => {
    setFoodEntries((prev) => {
      const copy = [...prev];
      if (copy[fIdx]) {
        copy[fIdx] = { ...copy[fIdx], [field]: value };
      }
      return copy;
    });
    setPreviewData(null);
  };

  const resolveSubtypeRateKey = useCallback((modeObj, subtypeObj) => {
    if (subtypeObj?.conveyanceRateKey) return subtypeObj.conveyanceRateKey;
    if (subtypeObj?.rateKey) return subtypeObj.rateKey;
    const sCode = String(subtypeObj?.code || "").toUpperCase();
    const sName = String(subtypeObj?.name || "").toUpperCase();
    const mCode = String(modeObj?.code || "").toUpperCase();
    const mName = String(modeObj?.name || "").toUpperCase();
    if (
      sCode.includes("TWO_WHEELER_EV") ||
      sCode.includes("2W_EV") ||
      sCode.includes("EBIKE") ||
      mCode.includes("TWO_WHEELER_EV") ||
      mCode.includes("2W_EV") ||
      ((mCode.includes("TWO") || mCode.includes("2W") || mName.includes("2-WHEELER")) && (/\bEV\b|ELECTRIC/.test(sName) || /\bEV\b|ELECTRIC/.test(mName)))
    ) {
      return "eBike";
    }
    if (
      sCode.includes("FOUR_WHEELER_EV") ||
      sCode.includes("4W_EV") ||
      sCode.includes("ECAR") ||
      mCode.includes("FOUR_WHEELER_EV") ||
      mCode.includes("4W_EV") ||
      ((mCode.includes("FOUR") || mCode.includes("4W") || mName.includes("4-WHEELER")) && (/\bEV\b|ELECTRIC/.test(sName) || /\bEV\b|ELECTRIC/.test(mName)))
    ) {
      return "eCar";
    }
    if (modeObj?.conveyanceRateKey) return modeObj.conveyanceRateKey;
    if (sCode.includes("FOUR_WHEELER") || sCode.includes("4W") || sCode.includes("CAR")) return "car";
    if (sCode.includes("TWO_WHEELER") || sCode.includes("2W") || sCode.includes("BIKE")) return "twoWheeler";
    return mCode.includes("FOUR_WHEELER") || mCode.includes("4W") || mCode.includes("CAR") || mName.includes("4-WHEELER") ? "car" : "twoWheeler";
  }, []);

  const handleSelectTravelMode = useCallback(
    (idx, modeObj) => {
      if (!modeObj) return;
      const subs = sanitizeTravelSubtypesList(modeObj.subtypes);
      const autoSub = subs.length === 1 ? subs[0] : null;
      const wf = autoSub && isKmWorkflow(autoSub, null) ? "KM_RATE" : "STANDARD";
      const rateKey = resolveSubtypeRateKey(modeObj, autoSub);
      const rate = wf === "KM_RATE"
        ? (Number(autoSub?.ratePerKm) > 0
            ? Number(autoSub.ratePerKm)
            : (Number(modeObj.ratePerKm) > 0 ? Number(modeObj.ratePerKm) : getRateForMode(rateKey, conveyanceRates)))
        : "";

      setEntries((prev) => {
        const copy = [...prev];
        if (copy[idx]) {
          copy[idx] = {
            ...copy[idx],
            travelModeId: String(modeObj._id || modeObj.code || ""),
            travelModeCode: String(modeObj.code || ""),
            travelModeName: String(modeObj.name || ""),
            travelSubtypeId: autoSub ? String(autoSub._id || autoSub.code || "") : "",
            travelSubtypeCode: autoSub ? String(autoSub.code || "") : "",
            travelSubtypeName: autoSub ? String(autoSub.name || "") : "",
            travelWorkflow: wf,
            ratePerKm: rate !== "" ? String(rate) : "",
            startKm: "",
            endKm: "",
            distanceKm: "",
            requestedAmount: "",
            numberPlatePhotos: [],
            startKmPhotos: [],
            endKmPhotos: [],
            attachments: [],
          };
        }
        return copy;
      });
      setPreviewData(null);
    },
    [conveyanceRates, getRateForMode, resolveSubtypeRateKey]
  );

  const handleSelectTravelSubtype = useCallback(
    (idx, modeOrSubtype, maybeSubtype) => {
      const subtypeObj = maybeSubtype !== undefined ? maybeSubtype : modeOrSubtype;
      if (!subtypeObj) return;

      setEntries((prev) => {
        const copy = [...prev];
        if (copy[idx]) {
          const cur = copy[idx];
          const modeObj =
            (maybeSubtype !== undefined && modeOrSubtype) ||
            (travelModes || []).find(
              (m) =>
                (m._id && String(m._id) === String(cur.travelModeId)) ||
                String(m.code || "").toUpperCase() === String(cur.travelModeCode || "").toUpperCase()
            );
          const wf = isKmWorkflow(subtypeObj, cur) ? "KM_RATE" : "STANDARD";
          const rateKey = resolveSubtypeRateKey(modeObj, subtypeObj);
          const rate =
            wf === "KM_RATE"
              ? (Number(subtypeObj.ratePerKm) > 0
                  ? Number(subtypeObj.ratePerKm)
                  : (Number(modeObj?.ratePerKm) > 0 ? Number(modeObj.ratePerKm) : getRateForMode(rateKey, conveyanceRates)))
              : "";
          const prevKm = parseFloat(cur.distanceKm);
          const nextDist = wf === "KM_RATE" && !isNaN(prevKm) && prevKm > 0 ? String(prevKm) : "";
          const nextAmt = wf === "KM_RATE" && !isNaN(prevKm) && prevKm > 0 && rate
            ? String(Math.round(prevKm * Number(rate) * 100) / 100)
            : "";

          copy[idx] = {
            ...cur,
            travelModeId: String(modeObj?._id || cur.travelModeId || modeObj?.code || cur.travelModeCode || ""),
            travelSubtypeId: String(subtypeObj._id || subtypeObj.code || ""),
            travelSubtypeCode: String(subtypeObj.code || ""),
            travelSubtypeName: String(subtypeObj.name || ""),
            travelWorkflow: wf,
            ratePerKm: rate !== "" ? String(rate) : "",
            startKm: "",
            endKm: "",
            distanceKm: nextDist,
            requestedAmount: nextAmt,
            numberPlatePhotos: wf === "KM_RATE" ? (cur.numberPlatePhotos || []) : [],
            startKmPhotos: wf === "KM_RATE" ? (cur.startKmPhotos || []) : [],
            endKmPhotos: wf === "KM_RATE" ? (cur.endKmPhotos || []) : [],
            attachments: [],
          };
        }
        return copy;
      });
      setPreviewData(null);
    },
    [conveyanceRates, getRateForMode, resolveSubtypeRateKey, travelModes]
  );

  const handleUpdateTravelKm = useCallback(
    (idx, _field, text) => {
      const sanitized = String(text || "").replace(/[^0-9.]/g, "");
      const parts = sanitized.split(".");
      const cleanVal = parts.length > 2 ? `${parts[0]}.${parts.slice(1).join("")}` : sanitized;

      setEntries((prev) => {
        const copy = [...prev];
        if (copy[idx]) {
          const cur = copy[idx];
          const matchedMode = (travelModes || []).find(
            (m) =>
              (m._id && String(m._id) === String(cur.travelModeId)) ||
              String(m.code || "").toUpperCase() === String(cur.travelModeCode || "").toUpperCase()
          );
          const matchedSub = matchedMode?.subtypes?.find(
            (s) =>
              (s._id && String(s._id) === String(cur.travelSubtypeId)) ||
              String(s.code || "").toUpperCase() === String(cur.travelSubtypeCode || "").toUpperCase()
          );
          const rateKey = resolveSubtypeRateKey(matchedMode, matchedSub || { code: cur.travelSubtypeCode, name: cur.travelSubtypeName });
          const rate =
            (Number(matchedSub?.ratePerKm) > 0 ? Number(matchedSub.ratePerKm) : 0) ||
            (Number(matchedMode?.ratePerKm) > 0 ? Number(matchedMode.ratePerKm) : 0) ||
            Number(cur.ratePerKm) ||
            getRateForMode(rateKey, conveyanceRates);

          const kmNum = parseFloat(cleanVal);
          const calcAmt = !isNaN(kmNum) && kmNum > 0 ? String(Math.round(kmNum * rate * 100) / 100) : "";
          copy[idx] = {
            ...cur,
            startKm: "",
            endKm: "",
            ratePerKm: String(rate),
            distanceKm: cleanVal,
            requestedAmount: calcAmt,
          };
        }
        return copy;
      });
      setPreviewData(null);
    },
    [conveyanceRates, getRateForMode, resolveSubtypeRateKey, travelModes]
  );

  const handleSelectVehicleMode = useCallback(
    (idx, modeKey) => {
      setEntries((prev) => {
        const copy = [...prev];
        if (copy[idx]) {
          const rate = getRateForMode(modeKey, conveyanceRates);
          const km = parseFloat(copy[idx].distanceKm);
          let calculatedAmt = "";
          if (!isNaN(km) && km > 0) {
            calculatedAmt = String(Math.round(km * rate * 100) / 100);
          }
          copy[idx] = {
            ...copy[idx],
            vehicle: modeKey,
            requestedAmount: calculatedAmt,
          };
        }
        return copy;
      });
      setPreviewData(null);
    },
    [conveyanceRates, getRateForMode]
  );

  const handleUpdateDistanceKm = useCallback(
    (idx, text) => {
      const sanitized = text.replace(/[^0-9.]/g, "");
      const parts = sanitized.split(".");
      const cleanKm = parts.length > 2 ? `${parts[0]}.${parts.slice(1).join("")}` : sanitized;

      setEntries((prev) => {
        const copy = [...prev];
        if (copy[idx]) {
          const mode = copy[idx].vehicle || "twoWheeler";
          const rate = getRateForMode(mode, conveyanceRates);
          const km = parseFloat(cleanKm);
          let calculatedAmt = "";
          if (!isNaN(km) && km > 0) {
            calculatedAmt = String(Math.round(km * rate * 100) / 100);
          }
          copy[idx] = {
            ...copy[idx],
            distanceKm: cleanKm,
            requestedAmount: calculatedAmt,
          };
        }
        return copy;
      });
      setPreviewData(null);
    },
    [conveyanceRates, getRateForMode]
  );

  const handleAddEntry = () => {
    setEntries((prev) => [
      ...prev,
      {
        id: Date.now().toString(),
        expenseType: "",
        otherSubType: "",
        materialName: "",
        barcodeNumber: "",
        quantity: "",
        vehicle: "twoWheeler",
        distanceKm: "",
        travelModeId: "",
        travelModeCode: "",
        travelModeName: "",
        travelSubtypeId: "",
        travelSubtypeCode: "",
        travelSubtypeName: "",
        travelWorkflow: "STANDARD",
        startKm: "",
        endKm: "",
        ratePerKm: "",
        visitType: normalVisitType,
        isVisit: normalVisitType === "VISIT",
        numberPlatePhotos: [],
        startKmPhotos: [],
        endKmPhotos: [],
        serviceReports: [],
        requestedAmount: "",
        remark: "",
        attachments: [],
      },
    ]);
    setPreviewData(null);
  };

  const handleRemoveEntry = (idxToRemove) => {
    if (entries.length <= 1) return;
    setEntries((prev) => prev.filter((_, idx) => idx !== idxToRemove));
    setPreviewData(null);
  };

  // Service Reports (Compulsory for Lodging claims, and for Normal claims when Visit is selected)
  const [serviceReports, setServiceReports] = useState([]); // [{ localId, uri, name, type, size, url, isUploading, uploadFailed }]
  const [uploadingServiceReport, setUploadingServiceReport] = useState(false);

  const handleSelectNormalVisitType = useCallback((vType) => {
    const isVisit = vType === "VISIT";
    setNormalVisitType(vType);
    setEntries((prev) =>
      prev.map((e) => ({
        ...e,
        visitType: vType,
        isVisit,
      }))
    );
    if (!isVisit) {
      setServiceReports([]);
    }
    setPreviewData(null);
  }, []);

  const handleUpdateVisitType = useCallback((idx, vType) => {
    const isVisit = vType === "VISIT";
    setEntries((prev) => {
      const copy = [...prev];
      if (copy[idx]) {
        const prevSr = copy[idx].serviceReports || [];
        copy[idx] = {
          ...copy[idx],
          visitType: isVisit ? "VISIT" : "NO_VISIT",
          isVisit,
          // When switching to NO_VISIT, clear this entry's service reports
          serviceReports: isVisit ? prevSr : [],
        };
        if (!isVisit && prevSr.length > 0) {
          // Also sync with global serviceReports if these were the only reports
          const removedLocalIds = new Set(prevSr.map((s) => s.localId || s.url || s.uri).filter(Boolean));
          setServiceReports((all) => all.filter((s) => !removedLocalIds.has(s.localId || s.url || s.uri)));
        }
      }
      return copy;
    });
    setPreviewData(null);
  }, []);

  const handleUpdateEntry = (idx, field, value) => {
    setEntries((prev) => {
      const copy = [...prev];
      if (copy[idx]) {
        if (field === "expenseType") {
          if (value === "CONVEYANCE") {
            const vMode = copy[idx].vehicle || "twoWheeler";
            const rate = getRateForMode(vMode, conveyanceRates);
            const km = parseFloat(copy[idx].distanceKm);
            const calculatedAmt = (!isNaN(km) && km > 0) ? String(Math.round(km * rate * 100) / 100) : "";
            copy[idx] = {
              ...copy[idx],
              expenseType: value,
              vehicle: vMode,
              travelModeId: "",
              travelModeCode: "",
              travelModeName: "",
              travelSubtypeId: "",
              travelSubtypeCode: "",
              travelSubtypeName: "",
              travelWorkflow: "STANDARD",
              startKm: "",
              endKm: "",
              ratePerKm: "",
              visitType: normalVisitType,
              isVisit: normalVisitType === "VISIT",
              serviceReports: copy[idx].serviceReports || [],
              requestedAmount: calculatedAmt,
              attachments: [],
              otherSubType: "",
              materialName: "",
              barcodeNumber: "",
              quantity: "",
            };
          } else if (value === "STOCK_PURCHASE") {
            copy[idx] = {
              ...copy[idx],
              expenseType: value,
              otherSubType: "",
              materialName: copy[idx].materialName || "",
              barcodeNumber: copy[idx].barcodeNumber || "",
              quantity: copy[idx].quantity || "",
              vehicle: "",
              distanceKm: "",
              travelModeId: "",
              travelModeCode: "",
              travelModeName: "",
              travelSubtypeId: "",
              travelSubtypeCode: "",
              travelSubtypeName: "",
              travelWorkflow: "STANDARD",
              startKm: "",
              endKm: "",
              ratePerKm: "",
              numberPlatePhotos: [],
              startKmPhotos: [],
              endKmPhotos: [],
            };
          } else if (value === "OTHER") {
            copy[idx] = {
              ...copy[idx],
              expenseType: value,
              otherSubType: "NORMAL",
              materialName: "",
              barcodeNumber: "",
              quantity: "",
              vehicle: "",
              distanceKm: "",
              travelModeId: "",
              travelModeCode: "",
              travelModeName: "",
              travelSubtypeId: "",
              travelSubtypeCode: "",
              travelSubtypeName: "",
              travelWorkflow: "STANDARD",
              startKm: "",
              endKm: "",
              ratePerKm: "",
              numberPlatePhotos: [],
              startKmPhotos: [],
              endKmPhotos: [],
            };
          } else {
            copy[idx] = {
              ...copy[idx],
              expenseType: value,
              otherSubType: "",
              materialName: "",
              barcodeNumber: "",
              quantity: "",
              vehicle: "",
              distanceKm: "",
              travelModeId: "",
              travelModeCode: "",
              travelModeName: "",
              travelSubtypeId: "",
              travelSubtypeCode: "",
              travelSubtypeName: "",
              travelWorkflow: "STANDARD",
              startKm: "",
              endKm: "",
              ratePerKm: "",
              numberPlatePhotos: [],
              startKmPhotos: [],
              endKmPhotos: [],
            };
          }
        } else {
          copy[idx] = { ...copy[idx], [field]: value };
        }
      }
      return copy;
    });
    setPreviewData(null);
  };

  // Multiple Bill Proofs
  const [attachments, setAttachments] = useState([]); // [{ localId, uri, name, type, size, url, isUploading }]
  const [uploadingProof, setUploadingProof] = useState(false);

  // Dynamic Expense Types & Policy Rule Configuration (Pay Limit Set or Not + CFO Approval per Claim Type)
  const [dynamicExpenseTypes, setDynamicExpenseTypes] = useState([]);
  const [payLimitConfig, setPayLimitConfig] = useState({
    enabled: true,
    applicableClaimTypes: ["OTHER"],
  });
  const [cfoApprovalConfig, setCfoApprovalConfig] = useState({
    enabled: true,
    applyOnFullPayment: true,
    applicableClaimTypes: ["STOCK_PURCHASE"],
  });

  const normalizeClaimTypeCode = useCallback((code) => {
    const c = String(code || "").trim().toUpperCase();
    if (!c) return "";
    if (c === "PETROL" || c === "LOCAL_CONVEYANCE" || c === "LOCAL_TRAVEL") return "CONVEYANCE";
    if (c === "STAY" || c === "HOTEL" || c === "ACCOMMODATION") return "LODGING";
    if (c === "MEAL" || c === "DA" || c === "DAILY_ALLOWANCE") return "FOOD";
    if (c === "STOCK" || c === "PURCHASE") return "STOCK_PURCHASE";
    if (c === "MISC" || c === "MISCELLANEOUS" || c === "OTHER_EXPENSE") return "OTHER";
    return c;
  }, []);

  const availableNormalExpenseTypes = useMemo(() => {
    const map = new Map();
    NORMAL_EXPENSE_TYPES.forEach((t) => map.set(t.code, t));
    (Array.isArray(dynamicExpenseTypes) ? dynamicExpenseTypes : []).forEach((dt) => {
      if (!dt || dt.status === "inactive") return;
      const code = normalizeClaimTypeCode(dt.code);
      if (!code || code === "LODGING") return;
      if (!map.has(code)) {
        map.set(code, {
          code,
          name: dt.name || code,
          icon: FileText,
        });
      }
    });
    return Array.from(map.values());
  }, [dynamicExpenseTypes, normalizeClaimTypeCode]);

  const isTypePayLimitApplicable = useCallback(
    (code) => {
      if (!payLimitConfig || payLimitConfig.enabled === false) return false;
      const norm = normalizeClaimTypeCode(code);
      if (!norm) return false;
      const list = Array.isArray(payLimitConfig.applicableClaimTypes)
        ? payLimitConfig.applicableClaimTypes.map(normalizeClaimTypeCode)
        : ["OTHER"];
      return list.includes(norm);
    },
    [payLimitConfig, normalizeClaimTypeCode]
  );

  const isTypeCfoApplicable = useCallback(
    (code) => {
      if (!cfoApprovalConfig || cfoApprovalConfig.enabled === false) return false;
      const norm = normalizeClaimTypeCode(code);
      if (!norm) return false;
      const list = Array.isArray(cfoApprovalConfig.applicableClaimTypes)
        ? cfoApprovalConfig.applicableClaimTypes.map(normalizeClaimTypeCode)
        : ["STOCK_PURCHASE"];
      return list.includes(norm);
    },
    [cfoApprovalConfig, normalizeClaimTypeCode]
  );

  // Has any CFO-routed or Pay-Limit-routed expense type entry in Normal claim mode
  const hasStockPurchaseEntry = !isLodging && entries.some((e) => e.expenseType === "STOCK_PURCHASE" || isTypeCfoApplicable(e.expenseType));
  const hasOtherOnlyEntry = !isLodging && entries.some((e) => isTypePayLimitApplicable(e.expenseType));
  const hasOtherEntry = hasStockPurchaseEntry || hasOtherOnlyEntry;
  // Check if any conveyance entry has Visit selected
  const hasVisitConveyance = !isLodging && (normalVisitType === "VISIT" || entries.some(
    (e) => (e.expenseType || "TRAVEL") === "CONVEYANCE" && (e.visitType === "VISIT" || e.isVisit === true)
  ));
  // Service Report applies to Lodging claims, and to Normal claims ONLY when "Visit" is selected
  const needsServiceReport = isLodging || (!isLodging && normalVisitType === "VISIT");

  // Reporting Manager (for OTHER / STOCK_PURCHASE claim type entry - resolved automatically from department hierarchy & payment limit rules)
  const [reportingManagerApprover, setReportingManagerApprover] = useState(null); // { _id, name, designation, department, employeeIdCode }
  const [baseReportingManager, setBaseReportingManager] = useState(null);
  const [reportingManagerOptions, setReportingManagerOptions] = useState([]);
  const [loadingReportingManagers, setLoadingReportingManagers] = useState(false);
  const [approvalLimitRules, setApprovalLimitRules] = useState([]);
  const [serverDirectLimit, setServerDirectLimit] = useState(null);

  // Full Payment (Optional)
  const [fullPaymentRequested, setFullPaymentRequested] = useState(false);
  const [fullPaymentReason, setFullPaymentReason] = useState("");

  // Selected employee IDs on the claim (slot 0 = self, slots 1..N-1 = tagged employees)
  const selectedEmployeeIds = useMemo(() => {
    return employeeSelections
      .slice(0, numberOfEmployees)
      .map((s, idx) => {
        const id = s.employeeId && typeof s.employeeId === "object" ? s.employeeId._id : s.employeeId;
        if (idx === 0) return String(currentUser?._id || currentUser?.id || id || "");
        return String(id || "");
      })
      .filter((id) => id && id !== "self");
  }, [employeeSelections, numberOfEmployees, currentUser]);

  const taggedEmployeeIds = useMemo(() => {
    if (numberOfEmployees <= 1) return [];
    return employeeSelections
      .slice(1, numberOfEmployees)
      .map((s) => {
        const id = s.employeeId && typeof s.employeeId === "object" ? s.employeeId._id : s.employeeId;
        return id ? String(id) : "";
      })
      .filter((id) => id && id !== "self");
  }, [employeeSelections, numberOfEmployees]);

  const selectedEmployeeIdsKey = useMemo(() => selectedEmployeeIds.join(","), [selectedEmployeeIds]);

  // Total requested amount across the claim (used for Full Payment reporting manager resolution)
  const totalClaimRequestedAmount = useMemo(() => {
    if (isLodging) {
      const lodgAmt = isRelativeStay ? 0 : (parseFloat(requestedAmount) || 0);
      const fdAmt = includeFood
        ? foodEntries.reduce((sum, fe) => sum + (parseFloat(fe.requestedAmount) || 0), 0)
        : 0;
      return Math.round((lodgAmt + fdAmt) * 100) / 100;
    }
    return Math.round(
      entries.reduce((sum, e) => sum + (parseFloat(e.requestedAmount) || 0), 0) * 100
    ) / 100;
  }, [isLodging, isRelativeStay, requestedAmount, includeFood, foodEntries, entries]);

  // Direct-to-Accounts limit (in ₹) from configured approvalLimitRules:
  // Up to this limit -> goes directly to Accounts Admin; above this limit -> goes through Reporting Manager.
  const directAccountLimit = useMemo(() => {
    const isTeamLeadUser = (u) => {
      if (!u) return false;
      if (u.isTeamLead || u.canManageTeam || u.levelRef?.canManageTeam) return true;
      if (/^TC(LD|TL)/i.test(String(u.roleCode || "").trim())) return true;
      const text = `${u.levelRef?.name || u.levelName || ""} ${u.designation || ""} ${u.role || ""} ${u.roleCode || ""}`.toLowerCase();
      return /(team[\s_]*lead|teamlead|\btl\b|\blead\b|supervisor)/i.test(text);
    };

    const inferLvl = (str) => {
      const s = String(str || "").trim().toLowerCase();
      if (!s) return null;
      if (/(^|[\s_])(ceo|chief[\s_]*executive)($|[\s_])/i.test(s)) return 2;
      if (/(^|[\s_])(avp|assistant[\s_]*vice[\s_]*president)($|[\s_])/i.test(s)) return 4;
      if (/(^|[\s_])(vp|vice[\s_]*president)($|[\s_])/i.test(s)) return 3;
      if (/(^|[\s_])(gm|general[\s_]*manager)($|[\s_])/i.test(s)) return 5;
      if (/(^|[\s_])(group[\s_]*lead|group[\s_]*leader|manager)($|[\s_])/i.test(s)) return 6;
      if (/(team[\s_]*lead|teamlead|\btl\b|\blead\b|supervisor)/i.test(s)) return 7;
      if (/senior[\s_]*(executive|engineer|developer|officer|analyst)/i.test(s)) return 8;
      if (/junior[\s_]*(executive|engineer|developer|officer|analyst)/i.test(s)) return 9;
      if (/team[\s_]*member/i.test(s)) return 10;
      if (/\btrainee\b/i.test(s)) return 11;
      if (/\bintern\b/i.test(s)) return 12;
      return null;
    };

    const getUserLvl = (u) => {
      if (!u) return 99;
      const refLvl = Number(u.levelRef?.levelNumber ?? u.levelNumber);
      if (Number.isFinite(refLvl) && refLvl > 0) {
        if (isTeamLeadUser(u) && refLvl > 7) return 7;
        return refLvl;
      }
      const rLvl = Number(u.roleLevel);
      if (Number.isFinite(rLvl) && rLvl > 0) {
        if (isTeamLeadUser(u) && rLvl > 7) return 7;
        return rLvl;
      }
      const inf = inferLvl(`${u.levelRef?.name || u.levelName || ""} ${u.designation || ""} ${u.role || ""} ${u.roleCode || ""}`);
      if (inf !== null) return inf;
      if (isTeamLeadUser(u)) return 7;
      const codeMatch = String(u.employeeIdCode || "").trim().match(/^[A-Z]{2,6}(\d{1,2})[A-Z]_/i);
      if (codeMatch) {
        const codeLvl = Number(codeMatch[1]);
        if (Number.isFinite(codeLvl) && codeLvl > 0) return codeLvl;
      }
      return 99;
    };

    const getRuleLvl = (r) => {
      if (!r) return 99;
      const rLvl = Number(r.levelNumber);
      if (Number.isFinite(rLvl) && rLvl > 0) return rLvl;
      const inf = inferLvl(`${r.roleName || ""} ${r.roleKey || ""}`);
      return inf ?? 99;
    };

    const activeRules = (Array.isArray(approvalLimitRules) ? approvalLimitRules : [])
      .filter(
        (r) =>
          r &&
          r.status !== "inactive" &&
          r.maxAmount !== null &&
          r.maxAmount !== undefined &&
          r.maxAmount !== "" &&
          Number(r.maxAmount) > 0
      )
      .slice()
      .sort((a, b) => {
        const diff = Number(a.maxAmount) - Number(b.maxAmount);
        if (diff !== 0) return diff;
        return getRuleLvl(b) - getRuleLvl(a);
      });
    if (activeRules.length === 0) return null;

    const resolveLimitForUser = (u) => {
      if (!u) return { limit: Number(activeRules[0].maxAmount), uLvl: 99 };
      const uLvl = getUserLvl(u);
      const uText = `${u.levelRef?.name || u.levelName || ""} ${u.designation || ""} ${u.role || ""} ${u.roleCode || ""}`.trim().toLowerCase();

      // 1. Direct level or role match
      const directMatched = activeRules.find((r) => {
        const rLvl = getRuleLvl(r);
        if (r.levelNumber && uLvl < 99 && Number(r.levelNumber) === uLvl) return true;
        const rName = String(r.roleName || "").trim().toLowerCase();
        if (!rName) return false;
        if (/(team[\s_]*lead|teamlead|\btl\b|\blead\b)/i.test(rName) && isTeamLeadUser(u)) return true;
        return uText.includes(rName) && (rLvl >= 99 || rLvl === uLvl);
      });
      if (directMatched) return { limit: Number(directMatched.maxAmount), uLvl };

      // 2. "Till Role / Hierarchy Level" range match (smaller levelNumber = higher seniority)
      if (uLvl > 0 && uLvl < 99) {
        const rulesWithLevel = activeRules
          .map((r) => ({ rule: r, rLvl: getRuleLvl(r) }))
          .filter((x) => x.rLvl > 0 && x.rLvl < 99);
        if (rulesWithLevel.length > 0) {
          const tierMatch = rulesWithLevel.find((x) => uLvl >= x.rLvl);
          if (tierMatch) return { limit: Number(tierMatch.rule.maxAmount), uLvl };
          return { limit: Number(rulesWithLevel[rulesWithLevel.length - 1].rule.maxAmount), uLvl };
        }
      }
      return { limit: Number(activeRules[0].maxAmount), uLvl };
    };

    const selfEmp = employeesList.find(
      (e) => String(e._id || e.id) === String(currentUser?._id || currentUser?.id || "")
    );
    const selfUser = selfEmp
      ? {
          ...currentUser,
          ...selfEmp,
          levelRef:
            typeof selfEmp.levelRef === "object" && selfEmp.levelRef
              ? selfEmp.levelRef
              : typeof currentUser?.levelRef === "object" && currentUser?.levelRef
                ? currentUser.levelRef
                : selfEmp.levelRef || currentUser?.levelRef,
          levelName: selfEmp?.levelName || currentUser?.levelName || currentUser?.levelRef?.name,
          levelNumber: selfEmp?.levelNumber ?? currentUser?.levelNumber ?? currentUser?.levelRef?.levelNumber ?? selfEmp?.roleLevel,
          designation: selfEmp?.designation || currentUser?.designation || "",
          isTeamLead: Boolean(selfEmp?.isTeamLead || currentUser?.isTeamLead || selfEmp?.canManageTeam || currentUser?.canManageTeam),
        }
      : currentUser;

    const participants = [selfUser];
    selectedEmployeeIds.forEach((id) => {
      const emp = employeesList.find((e) => String(e._id || e.id) === String(id));
      if (emp) participants.push(emp);
    });
    employeeSelections.slice(0, numberOfEmployees).forEach((sel) => {
      if (sel && (sel.designation || sel.label)) {
        participants.push(sel);
      }
    });

    let bestLimit = null;
    let bestLvl = 99;
    participants.filter(Boolean).forEach((p) => {
      const { limit, uLvl } = resolveLimitForUser(p);
      if (uLvl < bestLvl) bestLvl = uLvl;
      if (Number.isFinite(limit) && (bestLimit === null || limit > bestLimit)) {
        bestLimit = limit;
      }
    });

    if (
      serverDirectLimit !== null &&
      serverDirectLimit !== undefined &&
      Number(serverDirectLimit) > 0 &&
      activeRules.some((r) => Number(r.maxAmount) === Number(serverDirectLimit))
    ) {
      if (bestLvl === 99 || Number(serverDirectLimit) > (bestLimit || 0)) {
        return Number(serverDirectLimit);
      }
    }

    return bestLimit !== null ? bestLimit : Number(activeRules[0].maxAmount);
  }, [approvalLimitRules, currentUser, employeesList, selectedEmployeeIds, employeeSelections, numberOfEmployees, serverDirectLimit]);

  // Helper: Resolve Reporting Manager dynamically based on department hierarchy & tagged employee escalation.
  // Note: Escalation to the one-step-above Reporting Manager happens ONLY when the employee's
  // Reporting Manager / Team Lead is tagged on the claim (never based on claim amount).
  const resolveHierarchyManagerForAmount = useCallback((_rawAmount) => {
    const isTeamLeadUser = (u) => {
      if (!u) return false;
      if (u.isTeamLead || u.canManageTeam || u.levelRef?.canManageTeam) return true;
      if (/^TC(LD|TL)/i.test(String(u.roleCode || "").trim())) return true;
      const text = `${u.levelRef?.name || u.levelName || ""} ${u.designation || ""} ${u.role || ""} ${u.roleCode || ""}`.toLowerCase();
      return /(team[\s_]*lead|teamlead|\btl\b|\blead\b|supervisor)/i.test(text);
    };

    const inferLvl = (str) => {
      const s = String(str || "").trim().toLowerCase();
      if (!s) return null;
      if (/(^|[\s_])(ceo|chief[\s_]*executive)($|[\s_])/i.test(s)) return 2;
      if (/(^|[\s_])(avp|assistant[\s_]*vice[\s_]*president)($|[\s_])/i.test(s)) return 4;
      if (/(^|[\s_])(vp|vice[\s_]*president)($|[\s_])/i.test(s)) return 3;
      if (/(^|[\s_])(gm|general[\s_]*manager)($|[\s_])/i.test(s)) return 5;
      if (/(^|[\s_])(group[\s_]*lead|group[\s_]*leader|manager)($|[\s_])/i.test(s)) return 6;
      if (/(team[\s_]*lead|teamlead|\btl\b|\blead\b|supervisor)/i.test(s)) return 7;
      if (/senior[\s_]*(executive|engineer|developer|officer|analyst)/i.test(s)) return 8;
      if (/junior[\s_]*(executive|engineer|developer|officer|analyst)/i.test(s)) return 9;
      if (/team[\s_]*member/i.test(s)) return 10;
      if (/\btrainee\b/i.test(s)) return 11;
      if (/\bintern\b/i.test(s)) return 12;
      return null;
    };

    const getUserLvl = (u) => {
      if (!u) return 99;
      const refLvl = Number(u.levelRef?.levelNumber ?? u.levelNumber);
      if (Number.isFinite(refLvl) && refLvl > 0) {
        if (isTeamLeadUser(u) && refLvl > 7) return 7;
        return refLvl;
      }
      const rLvl = Number(u.roleLevel);
      if (Number.isFinite(rLvl) && rLvl > 0) {
        if (isTeamLeadUser(u) && rLvl > 7) return 7;
        return rLvl;
      }
      const inf = inferLvl(`${u.levelRef?.name || u.levelName || ""} ${u.designation || ""} ${u.role || ""} ${u.roleCode || ""}`);
      if (inf !== null) return inf;
      if (isTeamLeadUser(u)) return 7;
      return 99;
    };

    const excludeSet = new Set(selectedEmployeeIds.map(String));
    const selfEmp = employeesList.find(
      (e) => String(e._id || e.id) === String(currentUser?._id || currentUser?.id || "")
    );
    const mergedSelf = selfEmp
      ? {
          ...currentUser,
          ...selfEmp,
          reportsTo: currentUser?.reportsTo || selfEmp?.reportsTo,
          approver: currentUser?.approver || selfEmp?.approver,
          levelName: currentUser?.levelName || selfEmp?.levelName || currentUser?.levelRef?.name,
          levelNumber: currentUser?.levelNumber ?? selfEmp?.levelNumber ?? currentUser?.levelRef?.levelNumber ?? selfEmp?.roleLevel,
        }
      : currentUser;
    const myDept = String(mergedSelf?.department || "").trim().toLowerCase();
    const empLvl = getUserLvl(mergedSelf);
    const empIsLeadOrMgr = isTeamLeadUser(mergedSelf) || empLvl <= 7;

    // Check if any tagged employee is the filer's direct Reporting Manager (or a Team Lead / higher-level manager)
    const directMgrId = String(
      currentUser?.reportsTo?._id ||
      currentUser?.reportsTo ||
      currentUser?.approver?._id ||
      currentUser?.approver ||
      selfEmp?.reportsTo?._id ||
      selfEmp?.reportsTo ||
      selfEmp?.approver?._id ||
      selfEmp?.approver ||
      ""
    );

    const taggedUsers = taggedEmployeeIds
      .map((tid) => {
        return (
          employeesList.find((e) => String(e._id || e.id) === String(tid)) ||
          reportingManagerOptions.find((o) => String(o._id || o.id) === String(tid)) ||
          (baseReportingManager && String(baseReportingManager._id || baseReportingManager.id) === String(tid) ? baseReportingManager : null)
        );
      })
      .filter(Boolean);

    let minParticipantLvl = empLvl;
    let taggedManagerDoc = null;
    let hasTaggedTeamLead = false;
    const taggedManagerAboveIds = [];

    for (const tu of taggedUsers) {
      const tuId = String(tu._id || tu.id || "");
      const tuIsTeamLead = isTeamLeadUser(tu);
      const rawTuLvl = getUserLvl(tu);
      const tuLvl = rawTuLvl < 99 ? rawTuLvl : (tuIsTeamLead ? 7 : 99);
      const isDirectMgr = (directMgrId && tuId === directMgrId) ||
        (baseReportingManager && tuId === String(baseReportingManager._id || baseReportingManager.id || ""));
      const isMgrRole =
        tuIsTeamLead ||
        Boolean(tu.canApprove || tu.levelRef?.canApprove) ||
        tuLvl <= 7 ||
        /(team[\s_]*lead|teamlead|\btl\b|\blead\b|manager|supervisor|head|vp|avp|gm|ceo)/i.test(
          `${tu.designation || ""} ${tu.role || ""} ${tu.levelRef?.name || tu.levelName || ""}`
        );
      if (isDirectMgr || isMgrRole) {
        if (!taggedManagerDoc || isDirectMgr) {
          taggedManagerDoc = tu;
        }
        if (tuLvl < minParticipantLvl) {
          minParticipantLvl = tuLvl;
        }
        if (tuIsTeamLead) {
          hasTaggedTeamLead = true;
          if (minParticipantLvl > 7) minParticipantLvl = 7;
        }
        const aboveRepId = String(tu.reportsTo?._id || tu.reportsTo || tu.approver?._id || tu.approver || "");
        if (aboveRepId && !excludeSet.has(aboveRepId)) {
          taggedManagerAboveIds.push(aboveRepId);
        }
      }
    }

    const isDisqualifiedByTag = (u) => {
      if (!u || !taggedManagerDoc) return false;
      const uLvl = getUserLvl(u);
      if (minParticipantLvl < 99 && uLvl >= minParticipantLvl) return true;
      if (hasTaggedTeamLead && isTeamLeadUser(u)) return true;
      return false;
    };

    const allCandidates = [...(baseReportingManager ? [baseReportingManager] : []), ...reportingManagerOptions];
    const seen = new Set();
    const uniqueCandidates = allCandidates.filter((u) => {
      const id = String(u?._id || u?.id || "");
      if (!id || seen.has(id) || excludeSet.has(id)) return false;
      seen.add(id);
      return true;
    });

    // Direct assigned Reporting Manager (reportsTo / approver) when not tagged on the claim
    const directMgrDoc =
      !taggedManagerDoc && directMgrId && !excludeSet.has(directMgrId)
        ? uniqueCandidates.find((u) => String(u._id || u.id) === directMgrId) ||
          employeesList.find((e) => String(e._id || e.id) === directMgrId) ||
          null
        : null;

    // If the tagged user is the reporting manager / team lead and has a known reportsTo/approver, find that above manager
    const directAboveTaggedCandidates = taggedManagerAboveIds
      .map((aid) => uniqueCandidates.find((u) => String(u._id || u.id) === aid) || employeesList.find((e) => String(e._id || e.id) === aid))
      .filter((u) => u && !excludeSet.has(String(u._id || u.id || "")) && !isDisqualifiedByTag(u));

    const sameDeptCandidates = myDept
      ? uniqueCandidates
          .filter((u) => {
            if (String(u.department || "").trim().toLowerCase() !== myDept) return false;
            if (isDisqualifiedByTag(u)) return false;
            return true;
          })
          .sort((a, b) => {
            const aLead = isTeamLeadUser(a);
            const bLead = isTeamLeadUser(b);
            if (!taggedManagerDoc && !empIsLeadOrMgr && aLead !== bLead) {
              return aLead ? -1 : 1;
            }
            const aLvl = getUserLvl(a);
            const bLvl = getUserLvl(b);
            const aAbove = aLvl < minParticipantLvl;
            const bAbove = bLvl < minParticipantLvl;
            if (aAbove !== bAbove) return aAbove ? -1 : 1;
            if (aAbove && bAbove && aLvl !== bLvl) return bLvl - aLvl;
            if (aLead !== bLead) return aLead ? -1 : 1;
            return bLvl - aLvl;
          })
      : [];

    const aboveTaggedCompanyCandidates = taggedManagerDoc
      ? uniqueCandidates
          .filter((u) => !isDisqualifiedByTag(u))
          .sort((a, b) => getUserLvl(b) - getUserLvl(a))
      : uniqueCandidates;

    const validBaseMgr = baseReportingManager && !excludeSet.has(String(baseReportingManager._id || baseReportingManager.id || ""))
      ? (!isDisqualifiedByTag(baseReportingManager) ? baseReportingManager : null)
      : null;
    const validCurrentApprover = reportingManagerApprover && !excludeSet.has(String(reportingManagerApprover._id || reportingManagerApprover.id || ""))
      ? (!isDisqualifiedByTag(reportingManagerApprover) ? reportingManagerApprover : null)
      : null;

    const chosenApprover = taggedManagerDoc
      ? (directAboveTaggedCandidates[0] ||
          sameDeptCandidates[0] ||
          validBaseMgr ||
          aboveTaggedCompanyCandidates[0] ||
          uniqueCandidates[0] ||
          null)
      : (directMgrDoc ||
          sameDeptCandidates[0] ||
          validBaseMgr ||
          validCurrentApprover ||
          uniqueCandidates[0] ||
          null);

    const activeRules = (Array.isArray(approvalLimitRules) ? approvalLimitRules : []).filter(
      (r) => r && r.status !== "inactive" && String(r.roleName || "").trim()
    );

    return {
      approver: chosenApprover,
      matchedRule: activeRules[0] || null,
      exceededRules: [],
      isEscalated: false,
      isTagEscalated: Boolean(taggedManagerDoc),
      tagEscalatedFrom: taggedManagerDoc?.name || "",
    };
  }, [
    approvalLimitRules,
    baseReportingManager,
    reportingManagerApprover,
    reportingManagerOptions,
    employeesList,
    currentUser,
    selectedEmployeeIds,
    taggedEmployeeIds,
  ]);

  // Max requested amount across entries where Pay Limit Rule is enabled
  const maxOtherOnlyEntryAmount = useMemo(() => {
    if (isLodging) return 0;
    const relevant = entries.filter((e) => isTypePayLimitApplicable(e.expenseType));
    if (!relevant.length) return 0;
    return Math.max(0, ...relevant.map((e) => parseFloat(e.requestedAmount) || 0));
  }, [isLodging, entries, isTypePayLimitApplicable]);

  // Max requested amount across entries that require Pay Limit or CFO approval
  const maxOtherEntryAmount = useMemo(() => {
    if (isLodging) return 0;
    const relevant = entries.filter(
      (e) =>
        e.expenseType === "STOCK_PURCHASE" ||
        isTypePayLimitApplicable(e.expenseType) ||
        isTypeCfoApplicable(e.expenseType)
    );
    if (!relevant.length) return 0;
    return Math.max(0, ...relevant.map((e) => parseFloat(e.requestedAmount) || 0));
  }, [isLodging, entries, isTypePayLimitApplicable, isTypeCfoApplicable]);

  // Whether the claim requires Reporting Manager approval:
  // - STOCK_PURCHASE always requires approval (no payment limit rule applies)
  // - OTHER requires approval when no directAccountLimit is configured or when maxOtherOnlyEntryAmount > directAccountLimit
  const hasOtherEntryAboveLimit = useMemo(() => {
    if (isLodging || !hasOtherEntry) return false;
    if (hasStockPurchaseEntry) return true;
    if (directAccountLimit === null || directAccountLimit <= 0) return true;
    return maxOtherOnlyEntryAmount > directAccountLimit;
  }, [isLodging, hasOtherEntry, hasStockPurchaseEntry, directAccountLimit, maxOtherOnlyEntryAmount]);

  // Computed approval kind & effective approver
  // When OTHER / STOCK_PURCHASE amount is within directAccountLimit (and no full payment requested),
  // approvalKind is NONE and the claim routes directly to Accounts Admin!
  const approvalKind = isCurrentUserManagement
    ? "NONE"
    : (fullPaymentRequested
      ? "FULL_PAYMENT"
      : (hasOtherEntryAboveLimit ? "OTHER_EXPENSE" : null));
  const approver = isCurrentUserManagement
    ? null
    : (fullPaymentRequested
      ? (resolveHierarchyManagerForAmount(totalClaimRequestedAmount).approver || reportingManagerApprover)
      : (hasOtherEntryAboveLimit
        ? (resolveHierarchyManagerForAmount(maxOtherEntryAmount).approver || reportingManagerApprover)
        : null));
  const approverLabel = "Reporting Manager";

  // Fetch Reporting Managers when hasOtherEntry or fullPaymentRequested is active, or when tagged employees change
  useEffect(() => {
    if ((!hasOtherEntry && !fullPaymentRequested) || isCurrentUserManagement) {
      setReportingManagerOptions([]);
      setReportingManagerApprover(null);
      setBaseReportingManager(null);
      return;
    }
    let alive = true;
    setLoadingReportingManagers(true);
    const relevantAmt = fullPaymentRequested ? totalClaimRequestedAmount : maxOtherEntryAmount;
    expenseApi
      .getApprovers("OTHER_EXPENSE", "", relevantAmt > 0 ? relevantAmt : undefined, selectedEmployeeIds)
      .then((list) => {
        if (!alive) return;
        const opts = Array.isArray(list) ? list : [];
        setReportingManagerOptions(opts);
        if (Array.isArray(list?.approvalLimitRules) && list.approvalLimitRules.length > 0) {
          setApprovalLimitRules(list.approvalLimitRules);
        }
        if (list?.directLimit !== undefined && list?.directLimit !== null && Number(list.directLimit) > 0) {
          setServerDirectLimit(Number(list.directLimit));
        }
        const excludeSet = new Set(selectedEmployeeIds.map(String));
        const resolveDefault = () => {
          const selfEmp = employeesList.find(
            (e) => String(e._id || e.id) === String(currentUser?._id || currentUser?.id || "")
          );
          const myMgrId = String(
            currentUser?.reportsTo?._id ||
            currentUser?.reportsTo ||
            currentUser?.approver?._id ||
            currentUser?.approver ||
            selfEmp?.reportsTo?._id ||
            selfEmp?.reportsTo ||
            ""
          );
          if (!taggedEmployeeIds.length && myMgrId && !excludeSet.has(myMgrId)) {
            const directMatch = opts.find((o) => String(o._id) === myMgrId);
            if (directMatch) return directMatch;
          }
          if (list?.defaultApprover && list.defaultApprover._id && !excludeSet.has(String(list.defaultApprover._id))) {
            return list.defaultApprover;
          }
          const myDept = String(currentUser?.department || selfEmp?.department || "").trim().toLowerCase();
          if (myDept) {
            const deptMatches = opts.filter(
              (o) => String(o.department || "").trim().toLowerCase() === myDept && !excludeSet.has(String(o._id))
            );
            if (deptMatches.length > 0) {
              const tlMatch = deptMatches.find((o) =>
                Boolean(o.isTeamLead || o.levelRef?.canManageTeam || /(team[\s_]*lead|teamlead|\btl\b|\blead\b|supervisor)/i.test(`${o.levelRef?.name || ""} ${o.designation || ""} ${o.role || ""}`))
              );
              return tlMatch || deptMatches[0];
            }
          }
          return opts.find((o) => !excludeSet.has(String(o._id))) || opts[0] || null;
        };
        const defMgr = resolveDefault();
        setBaseReportingManager(defMgr);
        setReportingManagerApprover(defMgr);
        setLoadingReportingManagers(false);
      })
      .catch(() => {
        if (alive) setLoadingReportingManagers(false);
      });
    return () => {
      alive = false;
    };
  }, [hasOtherEntry, fullPaymentRequested, currentUser, isCurrentUserManagement, selectedEmployeeIdsKey]);

  // Dynamically update reportingManagerApprover whenever amount or tagged employees change
  useEffect(() => {
    if ((!hasOtherEntry && !fullPaymentRequested) || isCurrentUserManagement) return;
    const relevantAmt = fullPaymentRequested ? totalClaimRequestedAmount : maxOtherEntryAmount;
    const res = resolveHierarchyManagerForAmount(relevantAmt);
    if (res.approver && String(res.approver._id || "") !== String(reportingManagerApprover?._id || "")) {
      setReportingManagerApprover(res.approver);
    }
  }, [
    hasOtherEntry,
    fullPaymentRequested,
    isCurrentUserManagement,
    maxOtherEntryAmount,
    totalClaimRequestedAmount,
    approvalLimitRules,
    reportingManagerOptions,
    baseReportingManager,
    selectedEmployeeIdsKey,
    resolveHierarchyManagerForAmount,
  ]);

  // Modals
  const [activeModal, setActiveModal] = useState(null); // { kind: 'employee' | 'city' | 'customer', targetSlot?: number }
  const [searchModalQuery, setSearchModalQuery] = useState("");
  const [photoPreviewModal, setPhotoPreviewModal] = useState({ visible: false, uri: "", title: "" });

  const submissionRequestId = useRef(newRequestId());
  const scrollViewRef = useRef(null);

  // Lodging Nights (To Date - From Date) & Food Inclusive Days (To Date - From Date + 1)
  const lodgingNights = useMemo(() => {
    if (!isLodging) return 0;
    return nightsBetween(fromDate, toDate);
  }, [isLodging, fromDate, toDate]);

  const foodDays = useMemo(() => {
    if (!isLodging) return 1;
    return daysBetween(fromDate, toDate);
  }, [isLodging, fromDate, toDate]);

  const days = lodgingNights;

  // Fetch Dynamic Travel Config whenever destinationCity changes
  useEffect(() => {
    let alive = true;
    expenseApi
      .getTravelConfig(destinationCity || undefined)
      .then((res) => {
        const cfg = res?.data || res;
        if (!alive || !cfg) return;
        if (Array.isArray(cfg.modes) && cfg.modes.length > 0) {
          const cleanModes = sanitizeTravelModesList(cfg.modes);
          setTravelModes(cleanModes);
          setEntries((prev) =>
            prev.map((ent) => {
              if (ent.expenseType !== "TRAVEL") return ent;
              if (!ent.travelModeId && !ent.travelModeCode) return ent;
              let matchedMode = cleanModes.find(
                (m) =>
                  (m._id && String(m._id) === String(ent.travelModeId)) ||
                  String(m.code || "").toUpperCase() === String(ent.travelModeCode || "").toUpperCase()
              );
              let effectiveSubCode = String(ent.travelSubtypeCode || "").toUpperCase();
              if (!matchedMode) {
                const rawModeCode = String(ent.travelModeCode || "").toUpperCase();
                if (rawModeCode === "TWO_WHEELER") {
                  const targetCode = effectiveSubCode === "TWO_WHEELER_EV" ? "TWO_WHEELER_EV" : "TWO_WHEELER_PETROL";
                  matchedMode = cleanModes.find((m) => String(m.code || "").toUpperCase() === targetCode);
                  if (["TWO_WHEELER_PETROL", "TWO_WHEELER_EV", "TWO_WHEELER_OWN_VEHICLE"].includes(effectiveSubCode)) {
                    effectiveSubCode = "OWN_VEHICLE";
                  }
                } else if (rawModeCode === "FOUR_WHEELER") {
                  const targetCode = effectiveSubCode === "FOUR_WHEELER_EV" ? "FOUR_WHEELER_EV" : "FOUR_WHEELER_PETROL";
                  matchedMode = cleanModes.find((m) => String(m.code || "").toUpperCase() === targetCode);
                  if (["FOUR_WHEELER_PETROL", "FOUR_WHEELER_EV", "FOUR_WHEELER_OWN_VEHICLE"].includes(effectiveSubCode)) {
                    effectiveSubCode = "OWN_VEHICLE";
                  }
                }
              }
              if (!matchedMode) return ent;
              const activeSubs = sanitizeTravelSubtypesList(matchedMode.subtypes);
              const matchedSub =
                ent.travelSubtypeId || effectiveSubCode
                  ? activeSubs.find(
                      (s) =>
                        (s._id && String(s._id) === String(ent.travelSubtypeId)) ||
                        String(s.code || "").toUpperCase() === effectiveSubCode
                    ) || null
                  : (activeSubs.length === 1 ? activeSubs[0] : null);
              const nextWf = isKmWorkflow(matchedSub, ent) ? "KM_RATE" : "STANDARD";
              const nextRateKey = resolveSubtypeRateKey(matchedMode, matchedSub || { code: effectiveSubCode, name: ent.travelSubtypeName });
              const nextRate = nextWf === "KM_RATE"
                ? (Number(matchedSub?.ratePerKm) > 0
                    ? Number(matchedSub.ratePerKm)
                    : (Number(matchedMode?.ratePerKm) > 0
                        ? Number(matchedMode.ratePerKm)
                        : (Number(ent.ratePerKm) || getRateForMode(nextRateKey, cfg.conveyanceRates || conveyanceRates))))
                : "";
              const kmVal = parseFloat(ent.distanceKm);
              const nextAmt = nextWf === "KM_RATE" && !isNaN(kmVal) && kmVal > 0 && nextRate
                ? String(Math.round(kmVal * Number(nextRate) * 100) / 100)
                : ent.requestedAmount;
              return {
                ...ent,
                travelModeId: String(matchedMode._id || matchedMode.code || ""),
                travelModeCode: String(matchedMode.code || ""),
                travelModeName: String(matchedMode.name || ""),
                travelSubtypeId: matchedSub ? String(matchedSub._id || matchedSub.code || "") : ent.travelSubtypeId,
                travelSubtypeCode: matchedSub ? String(matchedSub.code || "") : ent.travelSubtypeCode,
                travelSubtypeName: matchedSub ? String(matchedSub.name || "") : ent.travelSubtypeName,
                travelWorkflow: nextWf,
                ratePerKm: nextRate !== "" ? String(nextRate) : ent.ratePerKm,
                requestedAmount: nextAmt,
              };
            })
          );
        }
        setTravelEntitlementsConfigured(Boolean(cfg.travelEntitlementsConfigured));
        if (cfg.conveyanceRates) {
          setConveyanceRates((prev) => ({
            ...prev,
            ...cfg.conveyanceRates,
          }));
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [destinationCity]);

  // Fetch Shared Food Entitlement (for Lodging + Food OR standalone Normal Food claims)
  const hasFoodEntryInNormal = !isLodging && entries.some((e) => e.expenseType === "FOOD");
  useEffect(() => {
    const shouldFetch =
      (isLodging && includeFood && fromDate && toDate && toDate > fromDate && destinationCity.trim()) ||
      (!isLodging && hasFoodEntryInNormal && claimDate && destinationCity.trim());
    if (!shouldFetch) {
      setFoodEntitlementInfo({ loading: false, data: null });
      return undefined;
    }
    const empIds = employeeSelections
      .slice(0, numberOfEmployees)
      .map((e, idx) => {
        const id = e.employeeId && typeof e.employeeId === "object" ? e.employeeId._id : e.employeeId;
        if (idx === 0) return currentUser?._id || currentUser?.id || id || "";
        return id || "";
      })
      .filter((id) => id && id !== "self");

    let cancelled = false;
    setFoodEntitlementInfo((prev) => ({ ...prev, loading: true }));
    const timer = setTimeout(async () => {
      try {
        const res = await expenseApi.getFoodEntitlement({
          fromDate: isLodging ? fromDate : claimDate,
          toDate: isLodging ? toDate : claimDate,
          destinationCity: destinationCity.trim(),
          employeeIds: empIds.length > 0 ? empIds : undefined,
          claimId: editClaimId || undefined,
          excludeClaimId: editClaimId || undefined,
        });
        const fData = res?.data || (res?.entitlement !== undefined ? res : null);
        if (!cancelled) {
          setFoodEntitlementInfo({ loading: false, data: fData || null });
        }
      } catch {
        if (!cancelled) {
          setFoodEntitlementInfo({ loading: false, data: null });
        }
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    isLodging,
    includeFood,
    hasFoodEntryInNormal,
    fromDate,
    toDate,
    claimDate,
    destinationCity,
    numberOfEmployees,
    employeeSelections,
    currentUser,
    editClaimId,
  ]);

  // Load Initial Data
  useEffect(() => {
    let isMounted = true;

    // Fast-path: Load current user profile from AsyncStorage immediately
    (async () => {
      try {
        let uid = await AsyncStorage.getItem("userId");
        const userStr = await AsyncStorage.getItem("user");
        let uObj = null;
        if (userStr) {
          try {
            uObj = JSON.parse(userStr);
          } catch {
            /* ignore parse error */
          }
        }
        if (uObj) {
          cachedCurrentUser = uObj;
          if (isMounted) {
            setCurrentUser(uObj);
            const selfId = String(uObj._id || uObj.id || uid || "self");
            const selfName = uObj.name || uObj.fullName || "Myself";
            setEmployeeSelections((prev) => {
              const copy = [...prev];
              if (copy.length === 0) {
                copy.push({
                  employeeId: selfId,
                  label: selfName,
                  isSelf: true,
                  designation: uObj.designation || "",
                  department: uObj.department || "",
                });
              } else {
                copy[0] = {
                  ...copy[0],
                  employeeId: copy[0].employeeId && copy[0].employeeId !== "self" ? copy[0].employeeId : selfId,
                  label: copy[0].label || selfName,
                  isSelf: true,
                  designation: copy[0].designation || uObj.designation || "",
                  department: copy[0].department || uObj.department || "",
                };
              }
              return copy;
            });
          }
        }
      } catch (e) {
        console.warn("AsyncStorage user load warning:", e);
      }
    })();

    // Fast-path: Fetch employees list right away in parallel so it opens quickly
    expenseApi
      .getEmployees()
      .then((emps) => {
        if (emps && Array.isArray(emps)) {
          cachedEmployeesList = emps;
          if (isMounted) {
            setEmployeesList(emps);
            setLoadingEmployees(false);
            // Match self in directory if user profile lacked designation or department
            setEmployeeSelections((prev) => {
              if (!prev.length) return prev;
              const copy = [...prev];
              if (copy[0]?.isSelf && copy[0]?.employeeId) {
                const matched = emps.find(
                  (e) => String(e._id || e.id) === String(copy[0].employeeId)
                );
                if (matched) {
                  copy[0] = {
                    ...copy[0],
                    employeeId: String(matched._id || matched.id),
                    label: matched.name || copy[0].label,
                    designation: matched.designation || copy[0].designation,
                    department: matched.department || copy[0].department,
                  };
                }
              }
              return copy;
            });
          }
        }
      })
      .catch(() => {
        if (isMounted) setLoadingEmployees(false);
      });

    const init = async () => {
      try {
        const [cities, , pol, fetchedTypes] = await Promise.all([
          expenseApi.getCities(),
          expenseApi.searchCustomers(),
          expenseApi.getActivePolicy().catch(() => null),
          expenseApi.getTypes().catch(() => []),
        ]);

        if (isMounted) {
          setCitiesList(cities || []);
          if (Array.isArray(fetchedTypes) && fetchedTypes.length > 0) {
            setDynamicExpenseTypes(fetchedTypes);
          }
          // Do not auto-set default destinationCity - employee must choose
          if (pol) {
            setRelativeStayPercent(typeof pol.relativeStayPercent === "number" ? pol.relativeStayPercent : null);
            if (Array.isArray(pol.approvalLimitRules)) {
              setApprovalLimitRules(pol.approvalLimitRules);
            }
            if (pol.directAccountLimit !== undefined && pol.directAccountLimit !== null && Number(pol.directAccountLimit) > 0) {
              setServerDirectLimit(Number(pol.directAccountLimit));
            }
            if (pol.payLimitConfig && typeof pol.payLimitConfig === "object") {
              setPayLimitConfig({
                enabled: pol.payLimitConfig.enabled !== false,
                applicableClaimTypes: Array.isArray(pol.payLimitConfig.applicableClaimTypes)
                  ? pol.payLimitConfig.applicableClaimTypes
                  : ["OTHER"],
              });
            }
            if (pol.cfoApprovalConfig && typeof pol.cfoApprovalConfig === "object") {
              setCfoApprovalConfig({
                enabled: pol.cfoApprovalConfig.enabled !== false,
                applyOnFullPayment: pol.cfoApprovalConfig.applyOnFullPayment !== false,
                applicableClaimTypes: Array.isArray(pol.cfoApprovalConfig.applicableClaimTypes)
                  ? pol.cfoApprovalConfig.applicableClaimTypes
                  : ["STOCK_PURCHASE"],
              });
            }
            if (pol.conveyanceRates) {
              const newRates = {
                twoWheeler: pol.conveyanceRates.twoWheeler !== undefined && pol.conveyanceRates.twoWheeler !== null ? Number(pol.conveyanceRates.twoWheeler) : 3.5,
                car: pol.conveyanceRates.car !== undefined && pol.conveyanceRates.car !== null ? Number(pol.conveyanceRates.car) : 5.0,
                eBike: pol.conveyanceRates.eBike !== undefined && pol.conveyanceRates.eBike !== null ? Number(pol.conveyanceRates.eBike) : 1.0,
                eCar: pol.conveyanceRates.eCar !== undefined && pol.conveyanceRates.eCar !== null ? Number(pol.conveyanceRates.eCar) : 1.75,
              };
              setConveyanceRates(newRates);
              setEntries((prev) =>
                prev.map((e) => {
                  if (e.expenseType === "CONVEYANCE") {
                    const vMode = e.vehicle || "twoWheeler";
                    const rate = newRates[vMode] ?? (vMode === "car" ? 5.0 : vMode === "twoWheeler" ? 3.5 : vMode === "eBike" ? 1.0 : 1.75);
                    const km = parseFloat(e.distanceKm);
                    if (!isNaN(km) && km > 0) {
                      return { ...e, requestedAmount: String(Math.round(km * rate * 100) / 100) };
                    }
                  }
                  return e;
                })
              );
            }
          }
        }

        // If editing existing claim
        if (editClaimId) {
          const c = await expenseApi.getClaimById(editClaimId);
          if (c && isMounted) {
            setEditingClaimNumber(c.claimNumber || "");
            const st = String(c.status || "").toUpperCase();
            const ps = String(c.paymentStatus || "").toUpperCase();
            const isSubmitted = [
              "SUBMITTED",
              "PENDING",
              "APPROVAL_PENDING",
              "MANAGER_PENDING",
              "AWAITING_APPROVAL",
              "HR_PENDING",
              "FULL_PAYMENT_PENDING",
              "ACCOUNTS_PENDING",
              "HR_APPROVED",
              "APPROVED",
            ].includes(st);
            const isRejected = ["REJECTED", "HR_REJECTED", "ACCOUNTS_REJECTED"].includes(st) || ps === "REJECTED";
            setIsEditingSubmittedClaim(isSubmitted);
            setIsEditingRejectedClaim(isRejected);
            const rejReason = c.rejection?.reason || c.accountsRemarks || c.rejectionReason || "";
            setRejectionReasonText(rejReason);
            const mode = c.claimMode || (c.fromDate && c.toDate ? "LODGING" : "NORMAL");
            setClaimMode(mode);
            if (c.claimDate) setClaimDate(String(c.claimDate).slice(0, 10));
            if (c.fromDate) setFromDate(String(c.fromDate).slice(0, 10));
            if (c.toDate) setToDate(String(c.toDate).slice(0, 10));
            setStayType(mode === "LODGING" && ["IN_HOTEL", "WITH_RELATIVE"].includes(c.stayType) ? c.stayType : "");

            const empCount = c.numberOfEmployees || c.employeeCount || (c.employeeClaims ? c.employeeClaims.length : 1);
            setNumberOfEmployees(empCount);

            const custName = c.customerName || c.trip?.customerName || "";
            setCustomerName(custName);
            if (c.customerId || c.trip?.customerId) setCustomerId(c.customerId || c.trip?.customerId);

            const destCity = c.destinationCity || c.trip?.destination || "";
            if (destCity) setDestinationCity(destCity);

            const hasVisitFlag =
              c.visitType === "VISIT" ||
              c.isVisit === true ||
              (Array.isArray(c.entries) && c.entries.some((e) => e && (e.visitType === "VISIT" || e.isVisit === true))) ||
              (Array.isArray(c.employeeClaims) && c.employeeClaims.some((ec) => Array.isArray(ec?.items) && ec.items.some((it) => it && (it.visitType === "VISIT" || it.isVisit === true)))) ||
              (mode === "NORMAL" && Array.isArray(c.serviceReports) && c.serviceReports.length > 0 && c.visitType !== "NO_VISIT");
            const normalClaimVt = hasVisitFlag ? "VISIT" : "NO_VISIT";
            setNormalVisitType(normalClaimVt);

            const rawType = c.expenseType || c.claimType || c.employeeClaims?.[0]?.items?.[0]?.expenseType || (mode === "LODGING" ? "LODGING" : "TRAVEL");
            setExpenseType(rawType);

            const amt = c.requestedAmount !== undefined && c.requestedAmount !== null
              ? c.requestedAmount
              : (c.grandRequested || c.amount || "");
            if (mode === "LODGING") {
              const lodgingEntry = Array.isArray(c.entries)
                ? c.entries.find((e) => String(e?.expenseType || "").toUpperCase() === "LODGING")
                : null;
              const lodgingAmt = c.lodgingSummary?.requested ?? c.lodgingSummary?.requestedAmount ?? lodgingEntry?.requestedAmount ?? amt;
              setRequestedAmount(String(lodgingAmt || ""));
              setRemark(lodgingEntry?.remark || c.remark || c.remarks || c.trip?.purpose || "");

              const hasFood = Boolean(c.includeFood || (Array.isArray(c.foodEntries) && c.foodEntries.length > 0));
              setIncludeFood(hasFood);
              if (hasFood && Array.isArray(c.foodEntries) && c.foodEntries.length > 0) {
                setFoodEntries(
                  c.foodEntries.map((fe, fIdx) => ({
                    id: `food_${fe._id || fIdx + 1}`,
                    requestedAmount: fe.requestedAmount !== undefined && fe.requestedAmount !== null ? String(fe.requestedAmount) : "",
                    remark: fe.remark || "",
                    attachments: toUploadedPhotos(fe.receipts || fe.attachments || [], `srv_food_${fIdx}`),
                  }))
                );
              }
            } else {
              setRequestedAmount(String(amt));
              setRemark(c.remark || c.remarks || c.trip?.purpose || "");
            }

            // Pre-populate entries for NORMAL claims in Edit Mode
            if (mode === "NORMAL") {
              if (c.entries && Array.isArray(c.entries) && c.entries.length > 0) {
                setEntries(
                  c.entries.map((entry, idx) => {
                    const rawAtts = (entry.receipts && entry.receipts.length > 0)
                      ? entry.receipts
                      : (entry.attachments && entry.attachments.length > 0)
                        ? entry.attachments
                        : (idx === 0 && c.receipts && c.receipts.length > 0)
                          ? c.receipts
                          : [];
                    const rawEntryType = entry.expenseType || "TRAVEL";
                    const isLegacyPurchase = rawEntryType === "OTHER" && String(entry.otherSubType).toUpperCase() === "PURCHASE";
                    const expType = isLegacyPurchase ? "STOCK_PURCHASE" : rawEntryType;
                    const isEntryOther = expType === "OTHER";
                    const isEntryStockPurchase = expType === "STOCK_PURCHASE";
                    const isEntryConv = expType === "CONVEYANCE";
                    const isEntryTravel = expType === "TRAVEL";
                    const isEntryKm = isEntryConv || (isEntryTravel && isKmWorkflow(null, entry));
                    return {
                      id: String(entry._id || idx + 1),
                      expenseType: expType,
                      otherSubType: isEntryOther ? "NORMAL" : "",
                      materialName: isEntryStockPurchase ? (entry.materialName || "") : "",
                      barcodeNumber: isEntryStockPurchase ? (entry.barcodeNumber || "") : "",
                      quantity: isEntryStockPurchase && entry.quantity !== undefined && entry.quantity !== null && String(entry.quantity).trim() !== "" ? String(entry.quantity).trim() : "",
                      vehicle: isEntryConv ? (entry.vehicle || "twoWheeler") : "",
                      distanceKm: isEntryKm && entry.distanceKm !== undefined && entry.distanceKm !== null ? String(entry.distanceKm) : "",
                      travelModeId: isEntryTravel ? String(entry.travelModeId || entry.travelModeCode || "") : "",
                      travelModeCode: isEntryTravel ? String(entry.travelModeCode || "") : "",
                      travelModeName: isEntryTravel ? String(entry.travelModeName || "") : "",
                      travelSubtypeId: isEntryTravel ? String(entry.travelSubtypeId || entry.travelSubtypeCode || "") : "",
                      travelSubtypeCode: isEntryTravel ? String(entry.travelSubtypeCode || "") : "",
                      travelSubtypeName: isEntryTravel ? String(entry.travelSubtypeName || "") : "",
                      travelWorkflow: isEntryTravel ? (isKmWorkflow(null, entry) ? "KM_RATE" : "STANDARD") : "STANDARD",
                      startKm: "",
                      endKm: "",
                      ratePerKm: isEntryTravel && entry.ratePerKm !== undefined && entry.ratePerKm !== null ? String(entry.ratePerKm) : "",
                      visitType: normalClaimVt,
                      isVisit: normalClaimVt === "VISIT",
                      numberPlatePhotos: isEntryKm ? toUploadedPhotos(entry.numberPlatePhotos, `srv_np_${idx}`) : [],
                      startKmPhotos: isEntryKm ? toUploadedPhotos(entry.startKmPhotos, `srv_sk_${idx}`) : [],
                      endKmPhotos: isEntryKm ? toUploadedPhotos(entry.endKmPhotos, `srv_ek_${idx}`) : [],
                      serviceReports: isEntryConv ? toUploadedPhotos(entry.serviceReports, `srv_sr_${idx}`) : [],
                      requestedAmount: entry.requestedAmount !== undefined && entry.requestedAmount !== null ? String(entry.requestedAmount) : "",
                      remark: entry.remark || "",
                      attachments: rawAtts.map((r, rIdx) => {
                        const resolvedUrl = resolveProofImageUrl(r) || r.url || r.uri;
                        return {
                          localId: `srv_ent_${r._id || rIdx}`,
                          uri: resolvedUrl,
                          url: resolvedUrl || r.url,
                          name: r.name || `Proof #${rIdx + 1}`,
                          type: r.type || "image/jpeg",
                          size: r.size || 0,
                          isUploading: false,
                        };
                      }),
                    };
                  })
                );
              } else if (c.employeeClaims?.[0]?.items && Array.isArray(c.employeeClaims[0].items) && c.employeeClaims[0].items.length > 1) {
                setEntries(
                  c.employeeClaims[0].items.map((it, idx) => {
                    const rawAtts = (it.attachments && it.attachments.length > 0)
                      ? it.attachments
                      : (it.receipts && it.receipts.length > 0)
                        ? it.receipts
                        : (idx === 0 && c.receipts && c.receipts.length > 0)
                          ? c.receipts
                          : [];
                    const rawItType = it.expenseType || "TRAVEL";
                    const isLegacyItPurchase = rawItType === "OTHER" && String(it.otherSubType).toUpperCase() === "PURCHASE";
                    const itType = isLegacyItPurchase ? "STOCK_PURCHASE" : rawItType;
                    const isItOther = itType === "OTHER";
                    const isItStockPurchase = itType === "STOCK_PURCHASE";
                    const isItConv = itType === "CONVEYANCE";
                    const isItTravel = itType === "TRAVEL";
                    const isItKm = isItConv || (isItTravel && isKmWorkflow(null, it));
                    return {
                      id: String(it._id || idx + 1),
                      expenseType: itType,
                      otherSubType: isItOther ? "NORMAL" : "",
                      materialName: isItStockPurchase ? (it.materialName || "") : "",
                      barcodeNumber: isItStockPurchase ? (it.barcodeNumber || "") : "",
                      quantity: isItStockPurchase && it.quantity !== undefined && it.quantity !== null && String(it.quantity).trim() !== "" ? String(it.quantity).trim() : "",
                      vehicle: isItConv ? (it.vehicle || "twoWheeler") : "",
                      distanceKm: isItKm && it.distanceKm !== undefined && it.distanceKm !== null ? String(it.distanceKm) : "",
                      travelModeId: isItTravel ? String(it.travelModeId || it.travelModeCode || "") : "",
                      travelModeCode: isItTravel ? String(it.travelModeCode || "") : "",
                      travelModeName: isItTravel ? String(it.travelModeName || "") : "",
                      travelSubtypeId: isItTravel ? String(it.travelSubtypeId || it.travelSubtypeCode || "") : "",
                      travelSubtypeCode: isItTravel ? String(it.travelSubtypeCode || "") : "",
                      travelSubtypeName: isItTravel ? String(it.travelSubtypeName || "") : "",
                      travelWorkflow: isItTravel ? (isKmWorkflow(null, it) ? "KM_RATE" : "STANDARD") : "STANDARD",
                      startKm: "",
                      endKm: "",
                      ratePerKm: isItTravel && it.ratePerKm !== undefined && it.ratePerKm !== null ? String(it.ratePerKm) : "",
                      visitType: normalClaimVt,
                      isVisit: normalClaimVt === "VISIT",
                      numberPlatePhotos: isItKm ? toUploadedPhotos(it.numberPlatePhotos, `srv_np_${idx}`) : [],
                      startKmPhotos: isItKm ? toUploadedPhotos(it.startKmPhotos, `srv_sk_${idx}`) : [],
                      endKmPhotos: isItKm ? toUploadedPhotos(it.endKmPhotos, `srv_ek_${idx}`) : [],
                      serviceReports: isItConv ? toUploadedPhotos(it.serviceReports, `srv_sr_${idx}`) : [],
                      requestedAmount: it.requestedAmount !== undefined && it.requestedAmount !== null ? String(it.requestedAmount) : "",
                      remark: it.description || "",
                      attachments: rawAtts.map((r, rIdx) => {
                        const resolvedUrl = resolveProofImageUrl(r) || r.url || r.uri;
                        return {
                          localId: `srv_it_${r._id || rIdx}`,
                          uri: resolvedUrl,
                          url: resolvedUrl || r.url,
                          name: r.name || `Proof #${rIdx + 1}`,
                          type: r.type || "image/jpeg",
                          size: r.size || 0,
                          isUploading: false,
                        };
                      }),
                    };
                  })
                );
              } else {
                const singleAtts = (c.receipts && c.receipts.length > 0)
                  ? c.receipts
                  : (c.employeeClaims?.[0]?.items?.[0]?.attachments || []);
                const singleItem = c.employeeClaims?.[0]?.items?.[0] || {};
                const isLegacyRawPurchase = rawType === "OTHER" && String(singleItem.otherSubType || c.otherSubType).toUpperCase() === "PURCHASE";
                const resolvedRawType = isLegacyRawPurchase ? "STOCK_PURCHASE" : rawType;
                const isRawOther = resolvedRawType === "OTHER";
                const isRawStockPurchase = resolvedRawType === "STOCK_PURCHASE";
                const isRawConv = resolvedRawType === "CONVEYANCE";
                const isRawTravel = resolvedRawType === "TRAVEL";
                const isRawKm = isRawConv || (isRawTravel && isKmWorkflow(null, singleItem));
                setEntries([
                  {
                    id: "1",
                    expenseType: resolvedRawType,
                    otherSubType: isRawOther ? "NORMAL" : "",
                    materialName: isRawStockPurchase ? (singleItem.materialName || c.materialName || "") : "",
                    barcodeNumber: isRawStockPurchase ? (singleItem.barcodeNumber || c.barcodeNumber || "") : "",
                    quantity: isRawStockPurchase && (singleItem.quantity || c.quantity) ? String(singleItem.quantity || c.quantity).trim() : "",
                    vehicle: isRawConv ? (singleItem.vehicle || c.vehicle || "twoWheeler") : "",
                    distanceKm: isRawKm ? (singleItem.distanceKm !== undefined && singleItem.distanceKm !== null ? String(singleItem.distanceKm) : (c.distanceKm ? String(c.distanceKm) : "")) : "",
                    travelModeId: isRawTravel ? String(singleItem.travelModeId || singleItem.travelModeCode || "") : "",
                    travelModeCode: isRawTravel ? String(singleItem.travelModeCode || "") : "",
                    travelModeName: isRawTravel ? String(singleItem.travelModeName || "") : "",
                    travelSubtypeId: isRawTravel ? String(singleItem.travelSubtypeId || singleItem.travelSubtypeCode || "") : "",
                    travelSubtypeCode: isRawTravel ? String(singleItem.travelSubtypeCode || "") : "",
                    travelSubtypeName: isRawTravel ? String(singleItem.travelSubtypeName || "") : "",
                    travelWorkflow: isRawTravel ? (isKmWorkflow(null, singleItem) ? "KM_RATE" : "STANDARD") : "STANDARD",
                    startKm: "",
                    endKm: "",
                    ratePerKm: isRawTravel && singleItem.ratePerKm !== undefined && singleItem.ratePerKm !== null ? String(singleItem.ratePerKm) : "",
                    visitType: normalClaimVt,
                    isVisit: normalClaimVt === "VISIT",
                    numberPlatePhotos: isRawKm ? toUploadedPhotos(singleItem.numberPlatePhotos, "srv_np") : [],
                    startKmPhotos: isRawKm ? toUploadedPhotos(singleItem.startKmPhotos, "srv_sk") : [],
                    endKmPhotos: isRawKm ? toUploadedPhotos(singleItem.endKmPhotos, "srv_ek") : [],
                    serviceReports: isRawConv ? toUploadedPhotos(singleItem.serviceReports || c.serviceReports, "srv_sr") : [],
                    requestedAmount: String(amt),
                    remark: c.remark || c.remarks || c.trip?.purpose || "",
                    attachments: singleAtts.map((r, rIdx) => {
                      const resolvedUrl = resolveProofImageUrl(r) || r.url || r.uri;
                      return {
                        localId: `srv_rec_${r._id || rIdx}`,
                        uri: resolvedUrl,
                        url: resolvedUrl || r.url,
                        name: r.name || `Proof #${rIdx + 1}`,
                        type: r.type || "image/jpeg",
                        size: r.size || 0,
                        isUploading: false,
                      };
                    }),
                  },
                ]);
              }
            }

            // Pre-populate employee selections
            if (c.employeeSelections && Array.isArray(c.employeeSelections) && c.employeeSelections.length > 0) {
              setEmployeeSelections(c.employeeSelections);
            } else if (c.employeeClaims && Array.isArray(c.employeeClaims) && c.employeeClaims.length > 0) {
              setEmployeeSelections(
                c.employeeClaims.map((ec, idx) => {
                  const empObj = ec.employee?.employeeId && typeof ec.employee.employeeId === "object"
                    ? ec.employee.employeeId
                    : {};
                  const empId = String(empObj._id || ec.employee?.employeeId || ec.claimedBy?._id || ec.claimedBy || "");
                  const empName = ec.employee?.name || empObj.name || (idx === 0 ? (currentUser?.name || "Myself") : `Employee #${idx + 1}`);
                  const empDesig = ec.employee?.role || empObj.designation || "";
                  const empDept = ec.employee?.department || empObj.department || "";
                  return {
                    employeeId: empId,
                    label: empName,
                    designation: empDesig,
                    department: empDept,
                    isSelf: idx === 0,
                  };
                })
              );
            }

            // Pre-populate bill / receipt attachments (for LODGING mode or general attachments)
            const lodgingOnlyEntry = mode === "LODGING" && Array.isArray(c.entries)
              ? c.entries.find((e) => String(e?.expenseType || "").toUpperCase() === "LODGING")
              : null;
            const allClaimReceipts = lodgingOnlyEntry
              ? (lodgingOnlyEntry.receipts || lodgingOnlyEntry.attachments || [])
              : (c.receipts && Array.isArray(c.receipts) && c.receipts.length > 0)
                ? c.receipts
                : (c.entries && Array.isArray(c.entries))
                  ? c.entries.flatMap((e) => e.receipts || e.attachments || [])
                  : (c.employeeClaims && Array.isArray(c.employeeClaims))
                    ? c.employeeClaims.flatMap((ec) => (ec.items || []).flatMap((it) => it.attachments || it.receipts || []))
                    : [];
            if (allClaimReceipts.length > 0) {
              setAttachments(
                allClaimReceipts.map((r, rIdx) => {
                  const resolvedUrl = resolveProofImageUrl(r) || r.url || r.uri;
                  return {
                    localId: `srv_${r._id || rIdx}`,
                    uri: resolvedUrl,
                    url: resolvedUrl || r.url,
                    name: r.name || `Receipt #${rIdx + 1}`,
                    type: r.type || "image/jpeg",
                    size: r.size || 0,
                    isUploading: false,
                  };
                })
              );
            }

            // Pre-populate Full Payment Info
            const fp = c.fullPayment || {};
            const isFpRequested = !!(fp.requested || c.fullPaymentRequested);
            setFullPaymentRequested(isFpRequested);
            setFullPaymentReason(isFpRequested ? (fp.reason || c.fullPaymentReason || "") : "");

            // Pre-populate selected approver
            const isUserMgmt = isManagementFiler(cachedCurrentUser);
            const ma = c.managerApproval || {};
            if (ma.approver && !isUserMgmt) {
              setReportingManagerApprover({
                _id: String(ma.approver._id || ma.approver),
                name: ma.approver.name || ma.approverName || "Approver",
                employeeIdCode: ma.approver.employeeIdCode || "",
                department: ma.approver.department || "",
                designation: ma.approver.designation || "",
              });
            }

            // Pre-populate Service Reports (for LODGING mode)
            const rawServiceReports = (c.serviceReports && Array.isArray(c.serviceReports) && c.serviceReports.length > 0)
              ? c.serviceReports
              : (c.entries && Array.isArray(c.entries) && c.entries.some((e) => Array.isArray(e?.serviceReports) && e.serviceReports.length > 0))
                ? c.entries.flatMap((e) => e?.serviceReports || [])
                : (c.employeeClaims && Array.isArray(c.employeeClaims))
                  ? c.employeeClaims.flatMap((ec) => (ec?.items || []).flatMap((it) => it?.serviceReports || []))
                  : [];
            if (rawServiceReports.length > 0 && (mode === "LODGING" || normalClaimVt === "VISIT")) {
              setServiceReports(
                rawServiceReports.map((r, rIdx) => {
                  const resolvedUrl = resolveProofImageUrl(r) || r.url || r.uri;
                  return {
                    localId: `srv_sr_${r._id || rIdx}`,
                    uri: resolvedUrl,
                    url: resolvedUrl || r.url,
                    name: r.name || `Service Report #${rIdx + 1}`,
                    type: r.type || "application/pdf",
                    size: r.size || 0,
                    isUploading: false,
                  };
                })
              );
            } else {
              setServiceReports([]);
            }
          }
        }
      } catch (err) {
        console.warn("Init error:", err);
      }
    };

    init();
    return () => {
      isMounted = false;
    };
  }, [editClaimId]);

  // Number of Employees handlers
  const handleCountChange = (delta) => {
    const nextCount = Math.max(1, Math.min(20, numberOfEmployees + delta));
    setNumberOfEmployees(nextCount);

    setEmployeeSelections((prev) => {
      const copy = [...prev];
      const selfId = currentUser?._id || currentUser?.id || "self";
      const selfName = currentUser?.name || currentUser?.fullName || "Myself";

      if (copy.length === 0) {
        copy.push({
          employeeId: selfId,
          label: selfName,
          isSelf: true,
          designation: currentUser?.designation || "",
          department: currentUser?.department || "",
        });
      } else if (!copy[0].employeeId || !copy[0].label) {
        copy[0] = {
          ...copy[0],
          employeeId: copy[0].employeeId || selfId,
          label: copy[0].label || selfName,
          isSelf: true,
          designation: copy[0].designation || currentUser?.designation || "",
          department: copy[0].department || currentUser?.department || "",
        };
      }

      if (nextCount > copy.length) {
        for (let i = copy.length; i < nextCount; i++) {
          copy.push({ employeeId: null, label: "", isSelf: false });
        }
      } else {
        copy.splice(nextCount);
      }
      return copy;
    });
    setPreviewData(null);
  };

  const handleCountSelect = (nextCount) => {
    const validCount = Math.max(1, Math.min(20, Number(nextCount) || 1));
    setNumberOfEmployees(validCount);
    setEmployeeSelections((prev) => {
      const copy = [...prev];
      const selfId = currentUser?._id || currentUser?.id || "self";
      const selfName = currentUser?.name || currentUser?.fullName || "Myself";

      if (copy.length === 0) {
        copy.push({
          employeeId: selfId,
          label: selfName,
          isSelf: true,
          designation: currentUser?.designation || "",
          department: currentUser?.department || "",
        });
      } else if (!copy[0].employeeId || !copy[0].label) {
        copy[0] = {
          ...copy[0],
          employeeId: copy[0].employeeId || selfId,
          label: copy[0].label || selfName,
          isSelf: true,
          designation: copy[0].designation || currentUser?.designation || "",
          department: copy[0].department || currentUser?.department || "",
        };
      }

      if (validCount > copy.length) {
        for (let i = copy.length; i < validCount; i++) {
          copy.push({ employeeId: null, label: "", isSelf: false });
        }
      } else {
        copy.splice(validCount);
      }
      return copy;
    });
    setPreviewData(null);
    setActiveModal(null);
  };

  const handlePickEmployee = (emp, targetSlot = 0) => {
    const slotIdx = typeof targetSlot === "number" ? targetSlot : 0;
    if (slotIdx === 0) return; // Primary / Myself cannot be changed

    const isAlready = employeeSelections.some(
      (s, idx) => s.employeeId && String(s.employeeId) === String(emp._id || emp.id) && idx !== slotIdx
    );
    if (isAlready) {
      Alert.alert("Already Added", `${emp.name} is already added in this claim.`);
      return;
    }

    setEmployeeSelections((prev) => {
      const copy = [...prev];
      copy[slotIdx] = {
        employeeId: String(emp._id || emp.id),
        label: emp.name,
        designation: emp.designation || "",
        department: emp.department || "",
        isSelf: false,
      };
      return copy;
    });
    setPreviewData(null);
    setActiveModal(null);
  };

  // Multiple Bill Proof & Supporting Document Pickers
  const handlePickAttachment = async (useCamera = false, _legacyFullPayment = false, targetEntryIndex = null, targetField = "attachments") => {
    try {
      let result;
      if (useCamera) {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== "granted") {
          Alert.alert("Permission Required", "Camera permission is required to capture documents.");
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
          Alert.alert("Permission Required", "Gallery permission is required to select documents.");
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

      setPreviewData(null);
      setUploadingProof(true);

      for (const asset of result.assets) {
        const tempId = `proof_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const fileName = asset.fileName || `Bill_${Date.now()}.jpg`;

        const newFile = {
          localId: tempId,
          uri: asset.uri,
          url: "", // Not yet uploaded to server; will be set when upload succeeds
          name: fileName,
          type: asset.mimeType || "image/jpeg",
          size: asset.fileSize || 0,
          isUploading: true,
          uploadFailed: false,
        };

        if (targetField === "food_attachments" && typeof targetEntryIndex === "number") {
          setFoodEntries((prev) => {
            const copy = [...prev];
            if (copy[targetEntryIndex]) {
              const currentList = copy[targetEntryIndex].attachments || [];
              copy[targetEntryIndex] = {
                ...copy[targetEntryIndex],
                attachments: [...currentList, newFile],
              };
            }
            return copy;
          });
        } else if (typeof targetEntryIndex === "number") {
          setEntries((prev) => {
            const copy = [...prev];
            if (copy[targetEntryIndex]) {
              const currentList = copy[targetEntryIndex][targetField] || [];
              copy[targetEntryIndex] = {
                ...copy[targetEntryIndex],
                [targetField]: [...currentList, newFile],
              };
            }
            return copy;
          });
        } else {
          setAttachments((prev) => [...prev, newFile]);
        }

        // Upload in background to Cloudinary / storage
        (async () => {
          try {
            const uploadPurpose = "receipt";
            const upRes = await expenseApi.uploadFile(
              {
                uri: asset.uri,
                name: fileName,
                type: asset.mimeType || "image/jpeg",
                file: asset.file,
                base64: asset.base64,
              },
              null,
              uploadPurpose
            );
            if (upRes.success && upRes.data?.url) {
              const finalUrl = resolveProofImageUrl(upRes.data.url) || upRes.data.url;
              if (targetField === "food_attachments" && typeof targetEntryIndex === "number") {
                setFoodEntries((prev) => {
                  const copy = [...prev];
                  if (copy[targetEntryIndex]) {
                    const list = copy[targetEntryIndex].attachments || [];
                    copy[targetEntryIndex] = {
                      ...copy[targetEntryIndex],
                      attachments: list.map((item) =>
                        item.localId === tempId
                          ? { ...item, url: finalUrl, uri: finalUrl, isUploading: false, uploadFailed: false }
                          : item
                      ),
                    };
                  }
                  return copy;
                });
              } else if (typeof targetEntryIndex === "number") {
                setEntries((prev) => {
                  const copy = [...prev];
                  if (copy[targetEntryIndex]) {
                    const list = copy[targetEntryIndex][targetField] || [];
                    copy[targetEntryIndex] = {
                      ...copy[targetEntryIndex],
                      [targetField]: list.map((item) =>
                        item.localId === tempId
                          ? { ...item, url: finalUrl, uri: finalUrl, isUploading: false, uploadFailed: false }
                          : item
                      ),
                    };
                  }
                  return copy;
                });
              } else {
                setAttachments((prev) =>
                  prev.map((item) =>
                    item.localId === tempId
                      ? { ...item, url: finalUrl, uri: finalUrl, isUploading: false, uploadFailed: false }
                      : item
                  )
                );
              }
            } else {
              console.warn("Upload response failed:", upRes);
              const failUpdate = (item) =>
                item.localId === tempId ? { ...item, isUploading: false, uploadFailed: true, url: "" } : item;
              if (targetField === "food_attachments" && typeof targetEntryIndex === "number") {
                setFoodEntries((prev) => {
                  const copy = [...prev];
                  if (copy[targetEntryIndex]) {
                    const list = copy[targetEntryIndex].attachments || [];
                    copy[targetEntryIndex] = {
                      ...copy[targetEntryIndex],
                      attachments: list.map(failUpdate),
                    };
                  }
                  return copy;
                });
              } else if (typeof targetEntryIndex === "number") {
                setEntries((prev) => {
                  const copy = [...prev];
                  if (copy[targetEntryIndex]) {
                    const list = copy[targetEntryIndex][targetField] || [];
                    copy[targetEntryIndex] = {
                      ...copy[targetEntryIndex],
                      [targetField]: list.map(failUpdate),
                    };
                  }
                  return copy;
                });
              } else {
                setAttachments((prev) => prev.map(failUpdate));
              }
              const errMsg = upRes?.message || "Please check your internet connection and re-upload.";
              Alert.alert("Upload Failed", `Could not upload "${fileName}" to storage.\n\n${errMsg}`);
            }
          } catch (e) {
            console.warn("Upload error:", e);
            const failUpdate = (item) =>
              item.localId === tempId ? { ...item, isUploading: false, uploadFailed: true, url: "" } : item;
            if (targetField === "food_attachments" && typeof targetEntryIndex === "number") {
              setFoodEntries((prev) => {
                const copy = [...prev];
                if (copy[targetEntryIndex]) {
                  const list = copy[targetEntryIndex].attachments || [];
                  copy[targetEntryIndex] = {
                    ...copy[targetEntryIndex],
                    attachments: list.map(failUpdate),
                  };
                }
                return copy;
              });
            } else if (typeof targetEntryIndex === "number") {
              setEntries((prev) => {
                const copy = [...prev];
                if (copy[targetEntryIndex]) {
                  const list = copy[targetEntryIndex][targetField] || [];
                  copy[targetEntryIndex] = {
                    ...copy[targetEntryIndex],
                    [targetField]: list.map(failUpdate),
                  };
                }
                return copy;
              });
            } else {
              setAttachments((prev) => prev.map(failUpdate));
            }
            Alert.alert("Internet Connection Error", `Could not upload "${fileName}". Please check your internet connection and try again.`);
          }
        })();
      }
    } catch (err) {
      Alert.alert("Attachment Error", err.message || "Could not attach file.");
    } finally {
      setUploadingProof(false);
    }
  };

  const removeAttachment = (attIdx, _legacyFullPayment = false, targetEntryIndex = null, targetField = "attachments") => {
    setPreviewData(null);
    if (targetField === "food_attachments" && typeof targetEntryIndex === "number") {
      setFoodEntries((prev) => {
        const copy = [...prev];
        if (copy[targetEntryIndex]) {
          const list = copy[targetEntryIndex].attachments || [];
          copy[targetEntryIndex] = {
            ...copy[targetEntryIndex],
            attachments: list.filter((_, i) => i !== attIdx),
          };
        }
        return copy;
      });
    } else if (typeof targetEntryIndex === "number") {
      setEntries((prev) => {
        const copy = [...prev];
        if (copy[targetEntryIndex]) {
          const list = copy[targetEntryIndex][targetField] || [];
          copy[targetEntryIndex] = {
            ...copy[targetEntryIndex],
            [targetField]: list.filter((_, i) => i !== attIdx),
          };
        }
        return copy;
      });
    } else {
      setAttachments((prev) => prev.filter((_, i) => i !== attIdx));
    }
  };

  // Service Report Document & Live Photo Pickers (Compulsory for Lodging claims & Local Conveyance visits)
  const handlePickServiceReport = async (sourceType = "camera", targetEntryIndex = null) => {
    try {
      let assets = [];
      if (sourceType === "camera") {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== "granted") {
          Alert.alert("Permission Required", "Camera permission is required to capture live photo of service report.");
          return;
        }
        const result = await ImagePicker.launchCameraAsync({
          mediaTypes: ["images"],
          quality: 0.6,
          base64: true,
        });
        if (result.canceled || !result.assets || !result.assets.length) return;
        assets = result.assets.map((a) => ({
          uri: a.uri,
          name: a.fileName || `Service_Report_Live_${Date.now()}.jpg`,
          type: a.mimeType || "image/jpeg",
          size: a.fileSize || 0,
          base64: a.base64,
        }));
      } else if (sourceType === "gallery") {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== "granted") {
          Alert.alert("Permission Required", "Gallery permission is required to select service report images.");
          return;
        }
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ["images"],
          quality: 0.6,
          allowsMultipleSelection: true,
          base64: true,
        });
        if (result.canceled || !result.assets || !result.assets.length) return;
        assets = result.assets.map((a) => ({
          uri: a.uri,
          name: a.fileName || `Service_Report_Img_${Date.now()}.jpg`,
          type: a.mimeType || "image/jpeg",
          size: a.fileSize || 0,
          base64: a.base64,
        }));
      }

      if (!assets || assets.length === 0) return;

      setPreviewData(null);
      setUploadingServiceReport(true);

      for (const asset of assets) {
        const tempId = `sr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const newFile = {
          localId: tempId,
          uri: asset.uri,
          url: "",
          name: asset.name,
          type: asset.type,
          size: asset.size,
          isUploading: true,
          uploadFailed: false,
        };

        if (typeof targetEntryIndex === "number") {
          setEntries((prev) => {
            const copy = [...prev];
            if (copy[targetEntryIndex]) {
              const cur = copy[targetEntryIndex].serviceReports || [];
              copy[targetEntryIndex] = {
                ...copy[targetEntryIndex],
                serviceReports: [...cur, newFile],
              };
            }
            return copy;
          });
        }
        setServiceReports((prev) => [...prev, newFile]);

        // Upload in background to storage
        (async () => {
          try {
            const upRes = await expenseApi.uploadFile(
              {
                uri: asset.uri,
                name: asset.name,
                type: asset.type,
                file: asset.file,
                base64: asset.base64,
              },
              null,
              "serviceReport"
            );
            if (upRes.success && upRes.data?.url) {
              const finalUrl = resolveProofImageUrl(upRes.data.url) || upRes.data.url;
              const succUpdate = (item) =>
                item.localId === tempId
                  ? { ...item, url: finalUrl, uri: finalUrl, isUploading: false, uploadFailed: false }
                  : item;

              setServiceReports((prev) => prev.map(succUpdate));
              if (typeof targetEntryIndex === "number") {
                setEntries((prev) => {
                  const copy = [...prev];
                  if (copy[targetEntryIndex]) {
                    const cur = copy[targetEntryIndex].serviceReports || [];
                    copy[targetEntryIndex] = {
                      ...copy[targetEntryIndex],
                      serviceReports: cur.map(succUpdate),
                    };
                  }
                  return copy;
                });
              }
            } else {
              const failUpdate = (item) =>
                item.localId === tempId ? { ...item, isUploading: false, uploadFailed: true, url: "" } : item;

              setServiceReports((prev) => prev.map(failUpdate));
              if (typeof targetEntryIndex === "number") {
                setEntries((prev) => {
                  const copy = [...prev];
                  if (copy[targetEntryIndex]) {
                    const cur = copy[targetEntryIndex].serviceReports || [];
                    copy[targetEntryIndex] = {
                      ...copy[targetEntryIndex],
                      serviceReports: cur.map(failUpdate),
                    };
                  }
                  return copy;
                });
              }
              const errMsg = upRes?.message || "Please check your internet connection and re-upload.";
              Alert.alert("Upload Failed", `Could not upload "${asset.name}".\n\n${errMsg}`);
            }
          } catch {
            const errUpdate = (item) =>
              item.localId === tempId ? { ...item, isUploading: false, uploadFailed: true, url: "" } : item;

            setServiceReports((prev) => prev.map(errUpdate));
            if (typeof targetEntryIndex === "number") {
              setEntries((prev) => {
                const copy = [...prev];
                if (copy[targetEntryIndex]) {
                  const cur = copy[targetEntryIndex].serviceReports || [];
                  copy[targetEntryIndex] = {
                    ...copy[targetEntryIndex],
                    serviceReports: cur.map(errUpdate),
                  };
                }
                return copy;
              });
            }
            Alert.alert("Internet Connection Error", `Could not upload "${asset.name}". Please check your internet connection and try again.`);
          }
        })();
      }
    } catch (err) {
      Alert.alert("Attachment Error", err.message || "Could not attach file.");
    } finally {
      setUploadingServiceReport(false);
    }
  };

  const removeServiceReport = (reportIdx, targetEntryIndex = null) => {
    setPreviewData(null);
    if (typeof targetEntryIndex === "number") {
      setEntries((prev) => {
        const copy = [...prev];
        if (copy[targetEntryIndex]) {
          const removed = (copy[targetEntryIndex].serviceReports || [])[reportIdx];
          copy[targetEntryIndex] = {
            ...copy[targetEntryIndex],
            serviceReports: (copy[targetEntryIndex].serviceReports || []).filter((_, i) => i !== reportIdx),
          };
          if (removed) {
            setServiceReports((all) => all.filter((s) => s.localId !== removed.localId && s.url !== removed.url && s.uri !== removed.uri));
          }
        }
        return copy;
      });
    } else {
      setServiceReports((prev) => prev.filter((_, i) => i !== reportIdx));
    }
  };

  const handleSelectStayType = (value) => {
    setStayType(value);
    if (value === "WITH_RELATIVE") setFullPaymentRequested(false);
    if (previewData) setPreviewData(null);
  };

  // Build Payload
  const buildPayload = useCallback(
    (isFinalSubmit = false) => {
      let totalAmt = (isRelativeStay || (isLodging && lodgingNights === 0)) ? 0 : (parseFloat(requestedAmount) || 0);
      let cleanEntries = [];

      const lodgingOrGlobalReports = (needsServiceReport ? serviceReports : [])
        .map((s) => {
          const finalUrl = s.url || (s.uri && !s.uri.startsWith("file://") && !s.uri.startsWith("content://") ? s.uri : "");
          return { name: s.name, url: finalUrl, type: s.type, size: s.size };
        })
        .filter((s) => s.url);
      const cleanServiceReports = needsServiceReport ? lodgingOrGlobalReports : [];

      if (!isLodging) {
        cleanEntries = entries.map((e) => {
          const entryAtts = (e.attachments || [])
            .map((a) => {
              const finalUrl = a.url || (a.uri && !a.uri.startsWith("file://") && !a.uri.startsWith("content://") ? a.uri : "");
              return { name: a.name, url: finalUrl, type: a.type, size: a.size };
            })
            .filter((a) => a.url);
          const isOther = e.expenseType === "OTHER";
          const isStockPurchase = e.expenseType === "STOCK_PURCHASE";
          const isConv = e.expenseType === "CONVEYANCE";
          const isTravel = e.expenseType === "TRAVEL";
          const isTravelKm = isTravel && isKmWorkflow(null, e);
          const isKmEntry = isConv || isTravelKm;
          const sendAtts = isKmEntry ? [] : entryAtts; // no bills/proofs for KM-rate entries
          const isVisit = !isLodging ? normalVisitType === "VISIT" : false;
          const entryServiceReports = isVisit ? cleanServiceReports : [];
          return {
            expenseType: e.expenseType || "",
            otherSubType: isOther ? "NORMAL" : "",
            materialName: isStockPurchase ? (e.materialName || "").trim() : "",
            barcodeNumber: isStockPurchase ? (e.barcodeNumber || "").trim() : "",
            quantity: isStockPurchase ? (e.quantity !== undefined && e.quantity !== null && String(e.quantity).trim() !== "" ? String(e.quantity).trim() : "") : "",
            requestedAmount: parseFloat(e.requestedAmount) || 0,
            remark: (e.remark || "").trim(),
            vehicle: isConv ? (e.vehicle || "twoWheeler").trim() : "",
            distanceKm: isKmEntry ? (parseFloat(e.distanceKm) || 0) : 0,
            travelModeId: isTravel ? (e.travelModeId || undefined) : undefined,
            travelModeCode: isTravel ? (e.travelModeCode || undefined) : undefined,
            travelModeName: isTravel ? (e.travelModeName || undefined) : undefined,
            travelSubtypeId: isTravel ? (e.travelSubtypeId || undefined) : undefined,
            travelSubtypeCode: isTravel ? (e.travelSubtypeCode || undefined) : undefined,
            travelSubtypeName: isTravel ? (e.travelSubtypeName || undefined) : undefined,
            travelWorkflow: isTravel ? (isTravelKm ? "KM_RATE" : "STANDARD") : undefined,
            startKm: undefined,
            endKm: undefined,
            ratePerKm: isTravelKm && e.ratePerKm !== "" ? Number(e.ratePerKm) : undefined,
            numberPlatePhotos: isKmEntry ? toPayloadFiles(e.numberPlatePhotos) : [],
            startKmPhotos: isKmEntry ? toPayloadFiles(e.startKmPhotos) : [],
            endKmPhotos: isKmEntry ? toPayloadFiles(e.endKmPhotos) : [],
            visitType: isLodging ? undefined : normalVisitType,
            isVisit: isLodging ? undefined : normalVisitType === "VISIT",
            serviceReports: isConv ? entryServiceReports : undefined,
            receipts: sendAtts,
            attachments: sendAtts,
          };
        });
        totalAmt = cleanEntries.reduce((sum, e) => sum + e.requestedAmount, 0);
      }

      const cleanFoodEntries = isLodging && includeFood
        ? foodEntries.map((fe) => {
            const fAtts = toPayloadFiles(fe.attachments || []);
            return {
              expenseType: "FOOD",
              requestedAmount: parseFloat(fe.requestedAmount) || 0,
              remark: (fe.remark || "").trim(),
              receipts: fAtts,
              attachments: fAtts,
            };
          })
        : [];

      const allEntryReceipts = cleanEntries.flatMap((e) => e.receipts || []);
      const lodgingReceipts = attachments
        .map((a) => {
          const finalUrl = a.url || (a.uri && !a.uri.startsWith("file://") && !a.uri.startsWith("content://") ? a.uri : "");
          return { name: a.name, url: finalUrl, type: a.type, size: a.size };
        })
        .filter((a) => a.url);

      const isAllKm = cleanEntries.length > 0 && cleanEntries.every(
        (e) => e.expenseType === "CONVEYANCE" || (e.expenseType === "TRAVEL" && e.travelWorkflow === "KM_RATE")
      );
      const cleanReceipts = isLodging
        ? lodgingReceipts
        : (isAllKm ? [] : (allEntryReceipts.length > 0 ? allEntryReceipts : lodgingReceipts));


      const resolvedEmployeeIds = employeeSelections
        .slice(0, numberOfEmployees)
        .map((e, idx) => {
          let id = e.employeeId && typeof e.employeeId === "object" ? e.employeeId._id : e.employeeId;
          if (idx === 0) {
            id = currentUser?._id || currentUser?.id || id || "self";
            if (id === "self" && employeesList.length > 0 && e.label) {
              const m = employeesList.find((emp) => emp.name && emp.name.toLowerCase() === e.label.toLowerCase());
              if (m) id = m._id || m.id;
            }
          }
          return id ? String(id) : null;
        })
        .filter(Boolean);

      const payload = {
        claimId: editClaimId || undefined,
        requestId: submissionRequestId.current,
        claimMode,
        visitType: isLodging ? undefined : normalVisitType,
        isVisit: isLodging ? undefined : normalVisitType === "VISIT",
        numberOfEmployees,
        employeeIds: resolvedEmployeeIds,
        customerName: customerName.trim(),
        customerId: customerId || null,
        destinationCity: destinationCity.trim(),
        expenseType: isLodging ? "LODGING" : (entries[0]?.expenseType || expenseType),
        requestedAmount: isRelativeStay ? 0 : totalAmt,
        remark: isLodging
          ? remark.trim()
          : (cleanEntries.map((e) => `${e.expenseType}: ${e.remark}`).filter(Boolean).join("; ") || remark.trim()),
        entries: !isLodging && cleanEntries.length > 0 ? cleanEntries : undefined,
        receipts: isRelativeStay ? [] : cleanReceipts,
        serviceReports: cleanServiceReports,
        fullPaymentRequested,
        fullPaymentReason: fullPaymentRequested ? fullPaymentReason.trim() : "",
        fullPayment: {
          requested: fullPaymentRequested,
          reason: fullPaymentRequested ? fullPaymentReason.trim() : "",
        },
        approverId: isCurrentUserManagement
          ? undefined
          : (fullPaymentRequested
            ? ((approver && approver._id)
              ? String(approver._id)
              : (reportingManagerApprover ? String(reportingManagerApprover._id) : undefined))
            : (hasOtherEntryAboveLimit
              ? ((approver && approver._id)
                ? String(approver._id)
                : (reportingManagerApprover ? String(reportingManagerApprover._id) : undefined))
              : undefined)),
        reportingManagerId: isCurrentUserManagement
          ? undefined
          : ((fullPaymentRequested || hasOtherEntryAboveLimit)
            ? ((approver && approver._id)
              ? String(approver._id)
              : (reportingManagerApprover ? String(reportingManagerApprover._id) : undefined))
            : undefined),
        submit: isFinalSubmit,
      };

      if (isLodging) {
        payload.fromDate = fromDate;
        payload.toDate = toDate;
        payload.stayType = stayType;
        payload.lodgingNights = lodgingNights;
        payload.foodDays = foodDays;
        payload.numberOfNights = lodgingNights;
        payload.numberOfDays = foodDays;
        payload.includeFood = includeFood;
        payload.foodEntries = includeFood ? cleanFoodEntries : [];
      } else {
        payload.claimDate = claimDate;
      }

      return payload;
    },
    [
      editClaimId,
      claimMode,
      isLodging,
      normalVisitType,
      claimDate,
      fromDate,
      toDate,
      stayType,
      isRelativeStay,
      lodgingNights,
      foodDays,
      includeFood,
      foodEntries,
      numberOfEmployees,
      employeeSelections,
      currentUser,
      isCurrentUserManagement,
      employeesList,
      customerName,
      customerId,
      destinationCity,
      expenseType,
      requestedAmount,
      remark,
      entries,
      attachments,
      serviceReports,
      needsServiceReport,
      hasOtherEntry,
      hasOtherEntryAboveLimit,
      approver,
      reportingManagerApprover,
      fullPaymentRequested,
      fullPaymentReason,
    ]
  );

  // Lodging Allowed Amount: fetch the server-calculated allowed amount for 1 to multiple employees based on nights (both In Hotel and At Relative)
  const [relativeAllowed, setRelativeAllowed] = useState({ loading: false, amount: null, policyLimit: null, perDay: null, days: null, percent: null, error: "" });
  const relativeAllowedKey = isLodging
    ? [stayType || "IN_HOTEL", fromDate, toDate, destinationCity.trim(), numberOfEmployees, employeeSelections.slice(0, numberOfEmployees).map((e) => (e.employeeId && typeof e.employeeId === "object" ? e.employeeId._id : e.employeeId) || "").join(",")].join("|")
    : "";
  useEffect(() => {
    if (!isLodging) return undefined;
    const ready = fromDate && toDate && toDate > fromDate && destinationCity.trim() &&
      employeeSelections.length >= numberOfEmployees &&
      employeeSelections.slice(0, numberOfEmployees).every((e, idx) => (idx === 0 ? (e.employeeId || currentUser) : e.employeeId));
    if (!ready) {
      setRelativeAllowed({ loading: false, amount: null, policyLimit: null, perDay: null, days: null, percent: null, error: "" });
      return undefined;
    }
    let cancelled = false;
    setRelativeAllowed((prev) => ({ ...prev, loading: true, error: "" }));
    const timer = setTimeout(async () => {
      try {
        const basePayload = buildPayload(false);
        const previewPayload = {
          ...basePayload,
          stayType: stayType || "IN_HOTEL",
          requestedAmount: isRelativeStay ? 0 : (Number(basePayload.requestedAmount) > 0 ? Number(basePayload.requestedAmount) : 1),
        };
        const res = await expenseApi.previewClaim(previewPayload);
        if (cancelled) return;
        const d = res?.data;
        const limitVal = d?.lodgingSummary?.policyLimit ?? d?.grandPolicyLimit ?? d?.lodgingSummary?.allowed ?? d?.standardAllowedAmount ?? d?.allowedAmount;
        if (res?.success && d && limitVal !== null && limitVal !== undefined) {
          const totalLimit = Number(limitVal || 0);
          const nightsCnt = Number(d.lodgingNights ?? d.numberOfNights ?? d.numberOfDays ?? lodgingNights) || 1;
          const perNightVal = nightsCnt > 0 ? Math.round((totalLimit / nightsCnt) * 100) / 100 : totalLimit;
          setRelativeAllowed({
            loading: false,
            amount: Number(isRelativeStay ? (d.lodgingSummary?.allowed ?? d.lodgingSummary?.allowedAmount ?? totalLimit) : totalLimit),
            policyLimit: totalLimit,
            percent: d.relativeStayPercent,
            perDay: perNightVal,
            days: nightsCnt,
            error: "",
          });
        } else {
          const relevant = (d?.errors || res?.errors || []).find((er) => ["fromDate", "toDate", "employeeIds", "destinationCity", "stayType", "policy"].includes(er.field));
          setRelativeAllowed({ loading: false, amount: null, policyLimit: null, perDay: null, days: null, percent: null, error: relevant?.message || "Unable to calculate the allowed amount." });
        }
      } catch {
        if (!cancelled) setRelativeAllowed({ loading: false, amount: null, policyLimit: null, perDay: null, days: null, percent: null, error: "Unable to calculate the allowed amount. Please check network connection." });
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [relativeAllowedKey]);

  // Helper to verify if all required (*) fields are currently filled
  const isAllRequiredFilled = useCallback(() => {
    const now = new Date();
    const todayY = now.getFullYear();
    const todayM = String(now.getMonth() + 1).padStart(2, "0");
    const todayD = String(now.getDate()).padStart(2, "0");
    const todayStr = `${todayY}-${todayM}-${todayD}`;

    if (isLodging) {
      if (!fromDate || !toDate || fromDate > todayStr || toDate > todayStr || toDate <= fromDate) return false;
      if (!stayType) return false;
      if (!expenseType) return false;
      if (lodgingNights < 1) return false;
      const amt = parseFloat(requestedAmount);
      if (!isRelativeStay && (isNaN(amt) || amt <= 0)) return false;
      if (!remark || !remark.trim() || remark.trim().length < 5) return false;
      if (!isRelativeStay && (!attachments || attachments.length === 0 || attachments.some((a) => a.isUploading))) return false;
      if (includeFood) {
        if (!foodEntries || foodEntries.length === 0) return false;
        const anyFoodInvalid = foodEntries.some((fe) => {
          const fAmt = parseFloat(fe.requestedAmount);
          return (
            isNaN(fAmt) ||
            fAmt <= 0 ||
            !fe.attachments ||
            fe.attachments.length === 0 ||
            fe.attachments.some((a) => a.isUploading)
          );
        });
        if (anyFoodInvalid) return false;
      }
      if (!serviceReports || serviceReports.length === 0 || serviceReports.some((s) => s.isUploading)) return false;
    } else {
      if (!claimDate || claimDate > todayStr) return false;
      if (!normalVisitType) return false;
      if (!entries || entries.length === 0) return false;
      const anyInvalid = entries.some((ent) => {
        if (ent.expenseType === "CONVEYANCE") {
          const km = parseFloat(ent.distanceKm);
          const amt = parseFloat(ent.requestedAmount);
          const photosMissing = CONVEYANCE_PHOTO_FIELDS.some(({ field }) => {
            const list = ent[field] || [];
            return list.length === 0 || list.some((a) => a.isUploading);
          });
          return (
            photosMissing ||
            isNaN(km) ||
            km <= 0 ||
            isNaN(amt) ||
            amt <= 0 ||
            !ent.remark ||
            !ent.remark.trim() ||
            ent.remark.trim().length < 5
          );
        }
        if (ent.expenseType === "TRAVEL") {
          if (!ent.travelModeId && !ent.travelModeCode) return true;
          const matchedMode = travelModes.find(
            (m) => (m._id && String(m._id) === String(ent.travelModeId)) || m.code === ent.travelModeCode
          );
          const activeSubs = Array.isArray(matchedMode?.subtypes)
            ? matchedMode.subtypes.filter((s) => s.isActive !== false)
            : [];
          if (activeSubs.length > 0 && !ent.travelSubtypeId && !ent.travelSubtypeCode) return true;
          const isKmRate = isKmWorkflow(null, ent);
          if (isKmRate) {
            const km = parseFloat(ent.distanceKm);
            const amt = parseFloat(ent.requestedAmount);
            const photosMissing = CONVEYANCE_PHOTO_FIELDS.some(({ field }) => {
              const list = ent[field] || [];
              return list.length === 0 || list.some((a) => a.isUploading);
            });
            return (
              photosMissing ||
              isNaN(km) ||
              km <= 0 ||
              isNaN(amt) ||
              amt <= 0 ||
              !ent.remark ||
              !ent.remark.trim() ||
              ent.remark.trim().length < 5
            );
          }
        }
        const amt = parseFloat(ent.requestedAmount);
        const missingPurchaseFields =
          ent.expenseType === "STOCK_PURCHASE" &&
          (!ent.materialName || !ent.materialName.trim() || !ent.barcodeNumber || !ent.barcodeNumber.trim() || !ent.quantity || !String(ent.quantity).trim());
        return (
          !ent.expenseType ||
          missingPurchaseFields ||
          isNaN(amt) ||
          amt <= 0 ||
          !ent.remark ||
          !ent.remark.trim() ||
          ent.remark.trim().length < 5 ||
          !ent.attachments ||
          ent.attachments.length === 0 ||
          ent.attachments.some((a) => a.isUploading)
        );
      });
      if (anyInvalid) return false;
      if (needsServiceReport && (!serviceReports || serviceReports.length === 0 || serviceReports.some((s) => s.isUploading))) return false;
    }

    if (!customerName || !customerName.trim()) return false;
    if (!destinationCity || !destinationCity.trim()) return false;

    if (employeeSelections.length < numberOfEmployees) return false;
    const missingSlot = employeeSelections.slice(0, numberOfEmployees).some((s, idx) => {
      if (idx === 0) return !s.label && !s.employeeId && !currentUser;
      return !s.employeeId;
    });
    if (missingSlot) return false;

    if (fullPaymentRequested) {
      if (!fullPaymentReason || !fullPaymentReason.trim() || fullPaymentReason.trim().length < 5) return false;
    }

    return true;
  }, [
    isLodging,
    normalVisitType,
    fromDate,
    toDate,
    stayType,
    isRelativeStay,
    lodgingNights,
    includeFood,
    foodEntries,
    travelModes,
    claimDate,
    expenseType,
    requestedAmount,
    remark,
    attachments,
    serviceReports,
    needsServiceReport,
    hasOtherEntry,
    reportingManagerApprover,
    entries,
    customerName,
    destinationCity,
    employeeSelections,
    numberOfEmployees,
    currentUser,
    isCurrentUserManagement,
    fullPaymentRequested,
    fullPaymentReason,
  ]);

  // Validation: Strictly validates that all required (*) fields are filled before previewing calculation, saving draft, or submitting
  const validateForm = () => {
    const now = new Date();
    const todayY = now.getFullYear();
    const todayM = String(now.getMonth() + 1).padStart(2, "0");
    const todayD = String(now.getDate()).padStart(2, "0");
    const todayStr = `${todayY}-${todayM}-${todayD}`;

    if (isLodging) {
      if (!fromDate || !toDate) {
        Alert.alert("Required Field: Dates", "Please select From Date and To Date for lodging stay.");
        return false;
      }
      if (fromDate > todayStr) {
        Alert.alert("Invalid Date", "From Date cannot be a future date.");
        return false;
      }
      if (toDate > todayStr) {
        Alert.alert("Invalid Date", "To Date cannot be a future date.");
        return false;
      }
      if (toDate === fromDate) {
        Alert.alert(
          "Invalid Date Range",
          "From Date and To Date cannot be the same date. Please select a To Date after From Date."
        );
        return false;
      }
      if (toDate < fromDate) {
        Alert.alert("Invalid Dates", "To Date cannot be earlier than From Date.");
        return false;
      }
      if (!stayType) {
        Alert.alert("Required Field: Stay Type", "Please select the Stay Type: In Hotel or At Relative.");
        return false;
      }
    } else {
      if (!claimDate) {
        Alert.alert("Required Field: Date", "Please select the Claim Date.");
        return false;
      }
      if (claimDate > todayStr) {
        Alert.alert("Invalid Date", "Claim Date cannot be a future date.");
        return false;
      }
    }

    const missingSlot = employeeSelections.slice(0, numberOfEmployees).some((s, idx) => {
      if (idx === 0) {
        return !s.label && !s.employeeId && !currentUser;
      }
      return !s.employeeId;
    });

    if (missingSlot || employeeSelections.length < numberOfEmployees) {
      Alert.alert(
        "Required Field: Employees",
        `Please select all ${numberOfEmployees} employees before proceeding.`
      );
      return false;
    }

    if (!customerName || !customerName.trim()) {
      Alert.alert("Required Field: Customer", "Customer Name is required.");
      return false;
    }

    if (!destinationCity || !destinationCity.trim()) {
      Alert.alert("Required Field: Destination", "Destination City is required.");
      return false;
    }

    if (!isLodging && !normalVisitType) {
      Alert.alert("Required Field: Visit Option", "Please select a Visit Option: Normal Travel or Service Call.");
      return false;
    }

    if (isLodging) {
      if (!expenseType) {
        Alert.alert("Required Field: Expense Type", "Please select the Expense Type.");
        return false;
      }
      if (lodgingNights < 1) {
        Alert.alert(
          "Invalid Date Range",
          "From Date and To Date cannot be the same date. Please select a To Date after From Date."
        );
        return false;
      }
      const amt = parseFloat(requestedAmount);
      if (!isRelativeStay && (isNaN(amt) || amt <= 0)) {
        Alert.alert("Required Field: Amount", "Please enter a valid Lodging Amount greater than ₹0.");
        return false;
      }
      if (!remark || !remark.trim()) {
        Alert.alert("Required Field: Remark", "Remark / Purpose is required.");
        return false;
      }
      if (remark.trim().length < 5) {
        Alert.alert("Required Field: Remark", "Remark / Purpose must be at least 5 characters.");
        return false;
      }
      if (!isRelativeStay && (!attachments || attachments.length === 0)) {
        Alert.alert("Required Field: Proofs", "At least one hotel bill or receipt proof is compulsory for hotel stay.");
        return false;
      }
      if (includeFood) {
        if (!foodEntries || foodEntries.length === 0) {
          Alert.alert("Required Field: Food Entries", "Please add at least one food entry or uncheck Include Food Claim.");
          return false;
        }
        for (let fIdx = 0; fIdx < foodEntries.length; fIdx++) {
          const fe = foodEntries[fIdx];
          const fNum = fIdx + 1;
          const fAmt = parseFloat(fe.requestedAmount);
          if (isNaN(fAmt) || fAmt <= 0) {
            Alert.alert("Required Field: Food Amount", `Please enter a valid Food Amount greater than ₹0 for Food Entry #${fNum}.`);
            return false;
          }
          if (!fe.attachments || fe.attachments.length === 0) {
            Alert.alert("Required Field: Food Bill Proof", `Please attach at least one food bill or receipt proof for Food Entry #${fNum}.`);
            return false;
          }
        }
      }
      if (!serviceReports || serviceReports.length === 0) {
        Alert.alert(
          "Required Field: Service Report",
          "Service Report is compulsory for Lodging claims. Please upload at least one Service Report photo or live photo."
        );
        return false;
      }
    } else {
      // Multi-entry validation for NORMAL claims
      if (!entries || entries.length === 0) {
        Alert.alert("Required Field: Expense Entries", "Please add at least one expense entry.");
        return false;
      }
      for (let idx = 0; idx < entries.length; idx++) {
        const ent = entries[idx];
        const entryNum = idx + 1;
        if (!ent.expenseType) {
          Alert.alert("Required Field: Expense Type", `Please select the Expense Type for Expense Details #${entryNum}.`);
          return false;
        }
        if (ent.expenseType === "CONVEYANCE") {
          const km = parseFloat(ent.distanceKm);
          if (isNaN(km) || km <= 0) {
            Alert.alert("Required Field: Distance", `Please enter a valid distance in KM greater than 0 for Expense Details #${entryNum}.`);
            return false;
          }
          const missingPhoto = CONVEYANCE_PHOTO_FIELDS.find(({ field }) => !(ent[field] || []).length);
          if (missingPhoto) {
            Alert.alert(`Required Field: ${missingPhoto.label}`, `Please upload the ${missingPhoto.label} for Expense Details #${entryNum}.`);
            return false;
          }
          if (!ent.vehicle) {
            Alert.alert("Required Field: Vehicle Mode", `Please select a vehicle mode (Bike, Car, E-Bike, or E-Car) for Expense Details #${entryNum}.`);
            return false;
          }
        }
        if (ent.expenseType === "TRAVEL") {
          if (!ent.travelModeId && !ent.travelModeCode) {
            Alert.alert("Required Field: Travel Mode", `Please select a Travel Mode for Expense Details #${entryNum}.`);
            return false;
          }
          const matchedMode = travelModes.find(
            (m) => (m._id && String(m._id) === String(ent.travelModeId)) || m.code === ent.travelModeCode
          );
          const activeSubs = Array.isArray(matchedMode?.subtypes)
            ? matchedMode.subtypes.filter((s) => s.isActive !== false)
            : [];
          if (activeSubs.length > 0 && !ent.travelSubtypeId && !ent.travelSubtypeCode) {
            Alert.alert("Required Field: Subtype", `Please select a Travel Subtype / Vehicle Type for Expense Details #${entryNum}.`);
            return false;
          }
          const isKmRate = isKmWorkflow(null, ent);
          if (isKmRate) {
            const km = parseFloat(ent.distanceKm);
            if (isNaN(km) || km <= 0) {
              Alert.alert("Required Field: Distance", `Please enter a valid distance in KM greater than 0 for Expense Details #${entryNum}.`);
              return false;
            }
            const missingPhoto = CONVEYANCE_PHOTO_FIELDS.find(({ field }) => !(ent[field] || []).length);
            if (missingPhoto) {
              Alert.alert(`Required Field: ${missingPhoto.label}`, `Please upload the ${missingPhoto.label} for Expense Details #${entryNum}.`);
              return false;
            }
          }
        }
        const isKmEntry =
          ent.expenseType === "CONVEYANCE" ||
          (ent.expenseType === "TRAVEL" && isKmWorkflow(null, ent));
        const amt = parseFloat(ent.requestedAmount);
        if (isNaN(amt) || amt <= 0) {
          Alert.alert(
            "Required Field: Amount",
            isKmEntry
              ? `Please enter a valid distance in KM to calculate the amount for Expense Details #${entryNum}.`
              : `Please enter a valid Amount greater than ₹0 for Expense Details #${entryNum}.`
          );
          return false;
        }
        if (!ent.remark || !ent.remark.trim()) {
          Alert.alert("Required Field: Remark", `Remark / Purpose is required for Expense Details #${entryNum}.`);
          return false;
        }
        if (ent.remark.trim().length < 5) {
          Alert.alert("Required Field: Remark", `Remark / Purpose must be at least 5 characters for Expense Details #${entryNum}.`);
          return false;
        }
        if (ent.expenseType === "STOCK_PURCHASE") {
          if (!ent.materialName || !ent.materialName.trim()) {
            Alert.alert("Required Field: Material Name", `Material name is required for Stock Purchase in Expense Details #${entryNum}.`);
            return false;
          }
          if (!ent.barcodeNumber || !ent.barcodeNumber.trim()) {
            Alert.alert("Required Field: Barcode", `Barcode number is required for Stock Purchase in Expense Details #${entryNum}.`);
            return false;
          }
          if (!ent.quantity || !String(ent.quantity).trim()) {
            Alert.alert("Required Field: Quantity", `Quantity is required for Stock Purchase in Expense Details #${entryNum}.`);
            return false;
          }
        }
        if (!isKmEntry && (!ent.attachments || ent.attachments.length === 0)) {
          Alert.alert("Required Field: Bill Proof", `Please attach at least one bill or receipt proof for Expense Details #${entryNum}.`);
          return false;
        }
      }
      if (needsServiceReport && (!serviceReports || serviceReports.length === 0)) {
        Alert.alert(
          "Required Field: Service Report",
          !isLodging && normalVisitType === "VISIT"
            ? "Service Call option is selected. Please upload or capture at least one Service Report photo or live photo in the Service Report section below."
            : "Service Report is compulsory for Expense claims. Please upload at least one Service Report photo or live photo in the Service Report section below."
        );
        return false;
      }
    }

    // While uploading files, wait before preview, draft, or submit
    const entryFiles = (e) => [
      ...(e.attachments || []),
      ...(e.serviceReports || []),
      ...CONVEYANCE_PHOTO_FIELDS.flatMap(({ field }) => e[field] || []),
    ];
    const anyEntryUploading = !isLodging && entries.some((e) => entryFiles(e).some((a) => a.isUploading));
    const anyEntryFailed = !isLodging && entries.some((e) => entryFiles(e).some((a) => a.uploadFailed));
    const anyFoodUploading = isLodging && includeFood && foodEntries.some((fe) => (fe.attachments || []).some((a) => a.isUploading));
    const anyFoodFailed = isLodging && includeFood && foodEntries.some((fe) => (fe.attachments || []).some((a) => a.uploadFailed));
    const anyServiceReportUploading = needsServiceReport && serviceReports.some((s) => s.isUploading);
    const anyServiceReportFailed = needsServiceReport && serviceReports.some((s) => s.uploadFailed);
    if (attachments.some((a) => a.isUploading) || anyEntryUploading || anyFoodUploading || anyServiceReportUploading) {
      Alert.alert("Uploading Documents", "Please wait for your proofs and documents to finish uploading.");
      return false;
    }
    if (attachments.some((a) => a.uploadFailed) || anyEntryFailed || anyFoodFailed || anyServiceReportFailed) {
      Alert.alert("Upload Incomplete", "One or more documents failed to upload. Please remove and re-upload.");
      return false;
    }

    if (fullPaymentRequested) {
      if (!fullPaymentReason || !fullPaymentReason.trim()) {
        Alert.alert("Required Field: Full Payment", "Please provide the reason for full payment.");
        return false;
      }
      if (fullPaymentReason.trim().length < 5) {
        Alert.alert("Required Field: Full Payment", "Reason for full payment must be at least 5 characters.");
        return false;
      }
    }

    return true;
  };

  const handlePreview = async () => {
    if (previewing || savingDraft || submitting) return;

    // Validate all required calculation parameters before calculating preview
    if (!validateForm()) {
      setPreviewData(null);
      return;
    }

    setPreviewing(true);
    setServerErrors([]);

    try {
      const payload = buildPayload(false);
      const res = await expenseApi.previewClaim(payload);
      if (res && res.success && res.data) {
        setPreviewData(res.data);
        setServerErrors(res.data.errors || []);
        setServerWarnings(res.data.warnings || []);
        setTimeout(() => {
          scrollViewRef.current?.scrollToEnd({ animated: true });
        }, 150);
      } else {
        setPreviewData(null);
        const msg = res?.message || (res?.errors && res.errors[0]?.message) || "Unable to calculate preview.";
        if (res?.errors) setServerErrors(res.errors);
        Alert.alert("Calculation Notice", msg);
      }
    } catch {
      setPreviewData(null);
      Alert.alert("Calculation Error", "Failed to calculate preview breakdown. Please check network connection.");
    } finally {
      setPreviewing(false);
    }
  };

  const handleSaveDraft = async () => {
    if (savingDraft || submitting || previewing) return;

    if (!validateForm()) return;

    setSavingDraft(true);
    setServerErrors([]);

    try {
      const payload = buildPayload(isEditingSubmittedClaim ? true : false);
      let res;
      if (editClaimId) {
        res = await expenseApi.updateClaim(editClaimId, payload);
      } else {
        res = await expenseApi.createClaim(payload);
      }

      if (res && res.success && res.data) {
        const claimNum = res.data.claimNumber || res.data.claimId || res.data._id || "";
        const title = isEditingRejectedClaim
          ? "Claim Saved as Draft"
          : isEditingSubmittedClaim
            ? "Claim Updated"
            : (editClaimId ? "Draft Updated" : "Claim Saved as Draft");
        const body = isEditingRejectedClaim
          ? `Rejected claim saved as draft.\n\nClaim #: ${claimNum}\nTotal Amount: ${formatINR(res.data.grandRequested || requestedAmount)}`
          : isEditingSubmittedClaim
            ? `Submitted claim updated successfully.\n\nClaim #: ${claimNum}\nTotal Amount: ${formatINR(res.data.grandRequested || requestedAmount)}`
            : `Draft claim ${editClaimId ? "updated" : "saved"} successfully.\n\nClaim #: ${claimNum}\nTotal Amount: ${formatINR(res.data.grandRequested || requestedAmount)}`;
        Alert.alert(
          title,
          body,
          [
            {
              text: "Go to My Claims",
              onPress: () => navigation.navigate("ExpenseDashboard"),
            },
            {
              text: "Continue Editing",
              style: "cancel",
            },
          ]
        );
      } else {
        const msg = res?.message || (res?.errors && res.errors[0]?.message) || (isEditingSubmittedClaim ? "Unable to update claim." : "Unable to save draft.");
        if (res?.errors) setServerErrors(res.errors);
        Alert.alert(isEditingSubmittedClaim ? "Update Failed" : (editClaimId ? "Update Failed" : "Draft Failed"), msg);
      }
    } catch (err) {
      Alert.alert("Error", err.message || (isEditingSubmittedClaim ? "Failed to update claim. Please check your network connection." : "Failed to save draft. Please check your network connection."));
    } finally {
      setSavingDraft(false);
    }
  };

  const handleSubmit = async () => {
    if (submitting || savingDraft || previewing) return;

    if (!validateForm()) return;

    setSubmitting(true);
    setServerErrors([]);

    try {
      const payload = buildPayload(true);
      let res;
      if (editClaimId) {
        res = await expenseApi.updateClaim(editClaimId, payload);
      } else {
        res = await expenseApi.createClaim(payload);
      }

      if (res && res.success && res.data) {
        Alert.alert(
          isEditingRejectedClaim
            ? "Claim Resubmitted Successfully!"
            : isEditingSubmittedClaim
              ? "Claim Updated Successfully!"
              : "Claim Submitted Successfully!",
          `Claim ID: ${res.data.claimNumber || res.data.claimId || res.data._id || ""}\nStatus: ${res.data.status || "SUBMITTED"}${res.data.pettyCashSummary?.walletBalance !== undefined ? `\nPetty Cash Balance: ${res.data.pettyCashSummary.walletBalance < 0 ? "-₹" : "₹"}${Math.abs(res.data.pettyCashSummary.walletBalance).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : ""}`,
          [
            {
              text: "Go to My Claims",
              onPress: () => navigation.navigate("ExpenseDashboard"),
            },
          ]
        );
      } else {
        const msg = res?.message || (res?.errors && res.errors[0]?.message) || (isEditingSubmittedClaim ? "Unable to update claim." : "Unable to submit claim.");
        if (res?.errors) setServerErrors(res.errors);
        Alert.alert(isEditingRejectedClaim ? "Resubmission Failed" : isEditingSubmittedClaim ? "Update Failed" : "Submission Failed", msg);
      }
    } catch {
      Alert.alert("Network Failure", "Unable to reach server. Please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };



  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      <ExpenseHeader
        title={editClaimId ? (isEditingRejectedClaim ? (isLodging ? "Resubmit Lodging Claim" : "Resubmit Expense Claim") : (isLodging ? "Edit Lodging Claim" : "Edit Expense Claim")) : (isLodging ? "Lodging Expense Claim" : "New Expense Claim")}
        subtitle={editClaimId ? (editingClaimNumber ? `Claim #${editingClaimNumber}` : "Edit Existing Claim") : (isLodging ? "Lodging Stay Range Form" : "Single Screen Claim Form")}
        navigation={navigation}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView ref={scrollViewRef} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          {/* Rejection Notice Banner */}
          {isEditingRejectedClaim ? (
            <View style={{
              backgroundColor: "#fef2f2",
              borderWidth: 1,
              borderColor: "#fecaca",
              borderRadius: 12,
              padding: 12,
              marginBottom: 14,
            }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <AlertCircle size={16} color="#dc2626" />
                <Text style={{ fontSize: 13, fontWeight: "800", color: "#991b1b" }}>
                  Claim Previously Rejected
                </Text>
              </View>
              {rejectionReasonText ? (
                <Text style={{ fontSize: 12, fontWeight: "600", color: "#b91c1c", marginBottom: 4 }}>
                  Reason: "{rejectionReasonText}"
                </Text>
              ) : null}
              <Text style={{ fontSize: 11, color: "#7f1d1d" }}>
                You can review, update any necessary details, amounts, or proofs below, then tap "Update & Resubmit".
              </Text>
            </View>
          ) : null}

          {/* Server Error / Warning Callouts */}
          {serverErrors.length > 0 ? (
            <View style={styles.missingProofBanner}>
              <AlertCircle size={16} color="#dc2626" />
              <Text style={styles.missingProofText}>
                {serverErrors.map((e) => e.message || e).join("\n")}
              </Text>
            </View>
          ) : null}

          {serverWarnings.length > 0 ? (
            <View style={[styles.missingProofBanner, { backgroundColor: "#fffbeb", borderColor: "#fed7aa" }]}>
              <AlertCircle size={16} color="#d97706" />
              <Text style={[styles.missingProofText, { color: "#92400e" }]}>
                {serverWarnings.join("\n")}
              </Text>
            </View>
          ) : null}

          {/* ======================================================== */}
          {/* STEP 1: DATE (Claim Date OR From Date -> To Date)        */}
          {/* ======================================================== */}
          <Text style={styles.sectionTitle}>
            1. {isLodging ? "Lodging Stay Dates" : "Claim Date"} <Text style={styles.reqStar}>*</Text>
          </Text>

          {isLodging ? (
            <View style={styles.itemCard}>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>
                    From Date <Text style={styles.reqStar}>*</Text>
                  </Text>
                  <TouchableOpacity
                    style={styles.datePickerBtn}
                    onPress={() => setActiveDatePicker("fromDate")}
                  >
                    <Calendar size={16} color="#4f46e5" />
                    <Text style={[styles.datePickerBtnText, !fromDate && { color: "#94a3b8" }]}>
                      {fromDate || "Select From Date"}
                    </Text>
                  </TouchableOpacity>
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>
                    To Date <Text style={styles.reqStar}>*</Text>
                  </Text>
                  <TouchableOpacity
                    style={styles.datePickerBtn}
                    onPress={() => setActiveDatePicker("toDate")}
                  >
                    <Calendar size={16} color="#4f46e5" />
                    <Text style={[styles.datePickerBtnText, !toDate && { color: "#94a3b8" }]}>
                      {toDate || "Select To Date"}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
              {fromDate && toDate && toDate > fromDate ? (
                <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: "#f1f5f9", flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 6 }}>
                  <Text style={{ fontSize: 12, fontWeight: "700", color: "#4338ca" }}>
                    Lodging: {lodgingNights} Night{lodgingNights === 1 ? "" : "s"}
                  </Text>
                  <Text style={{ fontSize: 12, fontWeight: "700", color: "#059669" }}>
                    Food: {foodDays} Day{foodDays === 1 ? "" : "s"}
                  </Text>
                </View>
              ) : null}
            </View>
          ) : (
            <View style={styles.itemCard}>
              <Text style={styles.inputLabel}>
                Claim Date <Text style={styles.reqStar}>*</Text>
              </Text>
              <TouchableOpacity
                style={styles.datePickerBtn}
                onPress={() => setActiveDatePicker("claimDate")}
              >
                <Calendar size={16} color="#4f46e5" />
                <Text style={[styles.datePickerBtnText, !claimDate && { color: "#94a3b8" }]}>
                  {claimDate || "Select Claim Date"}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Lodging Stay Type (required, no default selection) */}
          {isLodging && (
            <View style={styles.itemCard}>
              <View style={styles.inputLabelRow}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <BedDouble size={15} color="#4338ca" />
                  <Text style={styles.inputLabel}>
                    Stay Type <Text style={styles.reqStar}>*</Text>
                  </Text>
                </View>
              </View>
              <View style={styles.visitToggleRow}>
                  <TouchableOpacity
                    style={[
                      styles.visitOptionBtn,
                      stayType === "IN_HOTEL" && styles.visitOptionBtnActiveVisit,
                    ]}
                    activeOpacity={0.75}
                    onPress={() => handleSelectStayType("IN_HOTEL")}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: stayType === "IN_HOTEL" }}
                  >
                    <View style={styles.visitRadioDotOuter}>
                      {stayType === "IN_HOTEL" && <View style={styles.visitRadioDotInnerVisit} />}
                    </View>
                    <Building2 size={18} color={stayType === "IN_HOTEL" ? "#4f46e5" : "#94a3b8"} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.visitOptionTitle, stayType === "IN_HOTEL" && styles.visitOptionTitleActiveVisit]}>
                        1. In Hotel
                      </Text>
                      <Text style={styles.visitOptionSub}>Normal lodging entitlement</Text>
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.visitOptionBtn,
                      stayType === "WITH_RELATIVE" && styles.visitOptionBtnActiveVisit,
                    ]}
                    activeOpacity={0.75}
                    onPress={() => handleSelectStayType("WITH_RELATIVE")}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: stayType === "WITH_RELATIVE" }}
                  >
                    <View style={styles.visitRadioDotOuter}>
                      {stayType === "WITH_RELATIVE" && <View style={styles.visitRadioDotInnerVisit} />}
                    </View>
                    <Users size={18} color={stayType === "WITH_RELATIVE" ? "#4f46e5" : "#94a3b8"} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.visitOptionTitle, stayType === "WITH_RELATIVE" && styles.visitOptionTitleActiveVisit]}>
                        2. At Relative
                      </Text>
                      <Text style={styles.visitOptionSub}>{relativeStayPercent !== null ? `${relativeStayPercent}% of lodging entitlement` : "Reduced lodging entitlement"}</Text>
                    </View>
                  </TouchableOpacity>
              </View>
              {!stayType && (
                <Text style={styles.visitSectionHint}>Please select where you stayed.</Text>
              )}
            </View>
          )}

          {/* Native DateTimePicker */}
          {activeDatePicker ? (
            <DateTimePicker
              value={
                (() => {
                  const raw =
                    activeDatePicker === "claimDate"
                      ? claimDate
                      : activeDatePicker === "fromDate"
                        ? fromDate
                        : toDate;
                  if (raw) {
                    const [ry, rm, rd] = String(raw).split("-").map(Number);
                    const parsed = ry && rm && rd ? new Date(ry, rm - 1, rd) : new Date(raw);
                    if (!isNaN(parsed.getTime())) return parsed;
                  }
                  if (activeDatePicker === "toDate" && fromDate) {
                    const [fy, fm, fd] = String(fromDate).split("-").map(Number);
                    if (fy && fm && fd) {
                      const nextDay = new Date(fy, fm - 1, fd + 1);
                      const now = new Date();
                      return nextDay <= now ? nextDay : now;
                    }
                  }
                  return new Date();
                })()
              }
              mode="date"
              display={Platform.OS === "ios" ? "spinner" : "default"}
              minimumDate={
                (() => {
                  if (activeDatePicker === "toDate" && fromDate) {
                    const [fy, fm, fd] = String(fromDate).split("-").map(Number);
                    if (fy && fm && fd) {
                      const nextDay = new Date(fy, fm - 1, fd + 1);
                      const now = new Date();
                      if (nextDay <= now) return nextDay;
                    }
                  }
                  return undefined;
                })()
              }
              maximumDate={new Date()}
              onValueChange={(event, selectedDate) => {
                const picker = activeDatePicker;
                setActiveDatePicker(null);
                if (selectedDate) {
                  const now = new Date();
                  const todayY = now.getFullYear();
                  const todayM = String(now.getMonth() + 1).padStart(2, "0");
                  const todayD = String(now.getDate()).padStart(2, "0");
                  const todayStr = `${todayY}-${todayM}-${todayD}`;

                  const y = selectedDate.getFullYear();
                  const m = String(selectedDate.getMonth() + 1).padStart(2, "0");
                  const d = String(selectedDate.getDate()).padStart(2, "0");
                  const iso = `${y}-${m}-${d}`;

                  if (iso > todayStr) {
                    Alert.alert("Invalid Date", "Future dates are not permitted. Please select today or an earlier date.");
                    return;
                  }

                  if (picker === "claimDate") {
                    setClaimDate(iso);
                  } else if (picker === "fromDate") {
                    setFromDate(iso);
                    if (toDate && iso === toDate) {
                      setToDate("");
                      Alert.alert(
                        "Invalid Date Range",
                        "From Date and To Date cannot be the same date. Please select a To Date after From Date."
                      );
                    } else if (toDate && iso > toDate) {
                      setToDate("");
                    }
                  } else if (picker === "toDate") {
                    if (fromDate && iso === fromDate) {
                      Alert.alert(
                        "Invalid Date Range",
                        "From Date and To Date cannot be the same date. Please select a To Date after From Date."
                      );
                      return;
                    }
                    if (fromDate && iso < fromDate) {
                      Alert.alert("Invalid Date Range", "To Date cannot be earlier than From Date.");
                      return;
                    }
                    setToDate(iso);
                  }
                  setPreviewData(null);
                }
              }}
              onDismiss={() => setActiveDatePicker(null)}
              onNeutralButtonPress={() => setActiveDatePicker(null)}
            />
          ) : null}

          {/* ======================================================== */}
          {/* STEP 2: SELECT EMPLOYEES                                 */}
          {/* ======================================================== */}
          <Text style={styles.sectionTitle}>
            2. Select Employees <Text style={styles.reqStar}>*</Text>
          </Text>

          {/* Number of Employees Chooser Row */}
          <View style={styles.countRow}>
            <Text style={styles.subLabel}>
              Number of Employees <Text style={styles.reqStar}>*</Text>
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              {/* Stepper buttons [-] [+] */}
              <View style={styles.stepperWrap}>
                <TouchableOpacity
                  style={[styles.stepperBtn, numberOfEmployees <= 1 && { opacity: 0.4 }]}
                  onPress={() => handleCountChange(-1)}
                  disabled={numberOfEmployees <= 1}
                >
                  <Minus size={13} color="#4f46e5" />
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.stepperBtn, numberOfEmployees >= 20 && { opacity: 0.4 }]}
                  onPress={() => handleCountChange(1)}
                  disabled={numberOfEmployees >= 20}
                >
                  <Plus size={13} color="#4f46e5" />
                </TouchableOpacity>
              </View>

              {/* Count dropdown button */}
              <TouchableOpacity
                style={styles.countBtn}
                onPress={() => {
                  setSearchModalQuery("");
                  setActiveModal({ kind: "count" });
                }}
              >
                <Users size={14} color="#4f46e5" />
                <Text style={styles.countBtnText}>
                  {numberOfEmployees}
                </Text>
                <ChevronDown size={14} color="#64748b" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Choosing Employee Section: slot cards directly below Number of Employees */}
          {employeeSelections.map((sel, idx) => {
            const isSlotOne = idx === 0;
            const primaryName = sel.label || currentUser?.name || currentUser?.fullName || "Myself";
            const primaryDesignation = sel.designation || currentUser?.designation || "";
            const primaryDepartment = sel.department || currentUser?.department || "";

            return isSlotOne ? (
              // Slot 1: Current Login User / Myself - fixed, cannot be changed by tapping
              <View key={idx} style={styles.employeeSlotCard}>
                <View style={styles.slotAvatar}>
                  <Text style={styles.slotAvatarText}>#1</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.slotLabel}>
                    Employee #1 (Primary / Myself) <Text style={styles.reqStar}>*</Text>
                  </Text>
                  <Text style={styles.slotName}>{primaryName}</Text>
                  {(primaryDesignation || primaryDepartment) ? (
                    <Text style={styles.slotMeta}>
                      {primaryDesignation}
                      {primaryDepartment ? ` · ${primaryDepartment}` : ""}
                    </Text>
                  ) : null}
                </View>
              </View>
            ) : (
              // Slot 2+: Additional employees - selectable/changeable by tapping
              <TouchableOpacity
                key={idx}
                activeOpacity={0.7}
                style={styles.employeeSlotCard}
                onPress={() => {
                  setSearchModalQuery("");
                  setActiveModal({ kind: "employee", targetSlot: idx });
                }}
              >
                <View style={styles.slotAvatar}>
                  <Text style={styles.slotAvatarText}>#{idx + 1}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.slotLabel}>
                    Employee #{idx + 1} <Text style={styles.reqStar}>*</Text>
                  </Text>
                  <Text
                    style={[
                      styles.slotName,
                      !sel.employeeId && { color: "#64748b", fontWeight: "600" },
                    ]}
                  >
                    {sel.label || "Tap to select employee"}
                  </Text>
                  {sel.designation ? (
                    <Text style={styles.slotMeta}>
                      {sel.designation}{sel.department ? ` · ${sel.department}` : ""}
                    </Text>
                  ) : null}
                </View>
                <View style={styles.changeEmpBtn}>
                  <Text style={styles.changeEmpBtnText}>
                    {sel.employeeId ? "Change" : "Select"}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}

          {/* ======================================================== */}
          {/* STEP 3: CUSTOMER NAME & DESTINATION CITY                 */}
          {/* ======================================================== */}
          <Text style={styles.sectionTitle}>
            3. Customer &amp; Destination <Text style={styles.reqStar}>*</Text>
          </Text>

          <View style={styles.itemCard}>
            {/* Customer Name */}
            <View style={styles.fieldBlock}>
              <Text style={styles.inputLabel}>
                Customer Name <Text style={styles.reqStar}>*</Text>
              </Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. ABC Ltd. / Client Site"
                placeholderTextColor="#94a3b8"
                value={customerName}
                onChangeText={(t) => {
                  setCustomerName(t);
                  if (previewData) setPreviewData(null);
                }}
              />
            </View>

            {/* Destination City */}
            <View style={styles.fieldBlock}>
              <Text style={styles.inputLabel}>
                Destination City <Text style={styles.reqStar}>*</Text>
              </Text>
              <TouchableOpacity
                style={styles.datePickerBtn}
                onPress={() => {
                  setSearchModalQuery("");
                  setActiveModal({ kind: "city" });
                }}
              >
                <MapPin size={16} color="#4f46e5" />
                <Text style={[styles.datePickerBtnText, !destinationCity && { color: "#94a3b8" }]}>
                  {destinationCity || "Select City"}
                </Text>
                <ChevronDown size={14} color="#64748b" style={{ marginLeft: "auto" }} />
              </TouchableOpacity>
            </View>
          </View>

          {/* ======================================================== */}
          {/* STEP 4 (NORMAL): VISIT OPTION (SERVICE CALL / NORMAL TRAVEL) */}
          {/* ======================================================== */}
          {!isLodging && (
            <>
              <Text style={styles.sectionTitle}>
                4. Visit Option <Text style={styles.reqStar}>*</Text>
              </Text>
              <View style={styles.itemCard}>
                <View style={styles.inputLabelRow}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Briefcase size={15} color="#4338ca" />
                    <Text style={styles.inputLabel}>
                      Visit Option <Text style={styles.reqStar}>*</Text>
                    </Text>
                  </View>
                  {normalVisitType === "VISIT" ? (
                    <View style={styles.badgeVisitActive}>
                      <CheckCircle2 size={12} color="#059669" />
                      <Text style={styles.badgeVisitActiveText}>2. Service Call Selected</Text>
                    </View>
                  ) : normalVisitType === "NO_VISIT" ? (
                    <View style={styles.badgeNoVisitActive}>
                      <Building2 size={12} color="#475569" />
                      <Text style={styles.badgeNoVisitActiveText}>1. Normal Travel</Text>
                    </View>
                  ) : null}
                </View>

                <Text style={styles.visitSectionHint}>
                  Choose whether this claim is for Normal Travel or a Service Call:
                </Text>

                {/* Two Options: 1. Normal Travel, 2. Service Call */}
                <View style={styles.visitToggleRow}>
                  {/* Option 1: Normal Travel */}
                  <TouchableOpacity
                    style={[
                      styles.visitOptionBtn,
                      normalVisitType === "NO_VISIT" && styles.visitOptionBtnActiveNoVisit,
                    ]}
                    activeOpacity={0.75}
                    onPress={() => handleSelectNormalVisitType("NO_VISIT")}
                  >
                    <View style={styles.visitRadioDotOuter}>
                      {normalVisitType === "NO_VISIT" && (
                        <View style={styles.visitRadioDotInnerNoVisit} />
                      )}
                    </View>
                    <Building2
                      size={18}
                      color={normalVisitType === "NO_VISIT" ? "#475569" : "#94a3b8"}
                    />
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[
                          styles.visitOptionTitle,
                          normalVisitType === "NO_VISIT" && styles.visitOptionTitleActiveNoVisit,
                        ]}
                      >
                        1. Normal Travel
                      </Text>
                      <Text style={styles.visitOptionSub}>
                        No service report required
                      </Text>
                    </View>
                  </TouchableOpacity>

                  {/* Option 2: Service Call */}
                  <TouchableOpacity
                    style={[
                      styles.visitOptionBtn,
                      normalVisitType === "VISIT" && styles.visitOptionBtnActiveVisit,
                    ]}
                    activeOpacity={0.75}
                    onPress={() => handleSelectNormalVisitType("VISIT")}
                  >
                    <View style={styles.visitRadioDotOuter}>
                      {normalVisitType === "VISIT" && (
                        <View style={styles.visitRadioDotInnerVisit} />
                      )}
                    </View>
                    <Briefcase
                      size={18}
                      color={normalVisitType === "VISIT" ? "#4f46e5" : "#94a3b8"}
                    />
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[
                          styles.visitOptionTitle,
                          normalVisitType === "VISIT" && styles.visitOptionTitleActiveVisit,
                        ]}
                      >
                        2. Service Call
                      </Text>
                      <Text style={styles.visitOptionSub}>
                        Upload service report *
                      </Text>
                    </View>
                  </TouchableOpacity>
                </View>

                {/* Conditional Info Note based on selection */}
                {normalVisitType === "NO_VISIT" ? (
                  <View style={styles.noVisitInfoBox}>
                    <Building2 size={16} color="#64748b" style={{ marginTop: 1 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.noVisitInfoTitle}>1. Normal Travel Selected</Text>
                      <Text style={styles.noVisitInfoText}>
                        Service report is not required. You do not need to upload any service report for Food, Local Conveyance, Travel, or Other expenses in this claim.
                      </Text>
                    </View>
                  </View>
                ) : normalVisitType === "VISIT" ? (
                  <View style={styles.visitInfoBox}>
                    <Briefcase size={16} color="#4f46e5" style={{ marginTop: 1 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.visitInfoTitle}>2. Service Call Selected</Text>
                      <Text style={styles.visitInfoText}>
                        Service Call selected. Please upload or capture the required Service Report in the Service Report section below.
                      </Text>
                    </View>
                  </View>
                ) : null}
              </View>
            </>
          )}

          {/* ======================================================== */}
          {/* EXPENSE DETAILS (Type, Amount, Remark)                    */}
          {/* ======================================================== */}
          <View style={styles.sectionHeaderRow}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text style={styles.sectionTitle}>
                {isLodging ? "4. Expense Details" : "5. Expense Details"} <Text style={styles.reqStar}>*</Text>
              </Text>
              {!isLodging && (
                <View style={styles.entryCountBadge}>
                  <Text style={styles.entryCountBadgeText}>
                    {entries.length} {entries.length > 1 ? "Entries" : "Entry"}
                  </Text>
                </View>
              )}
            </View>
            {!isLodging && (
              <TouchableOpacity
                style={styles.headerAddEntryBtn}
                onPress={handleAddEntry}
                activeOpacity={0.8}
              >
                <Plus size={14} color="#ffffff" />
                <Text style={styles.headerAddEntryBtnText}>Add Entry</Text>
              </TouchableOpacity>
            )}
          </View>

          {isLodging ? (
            <>
            <View style={styles.itemCard}>
              {/* Expense Type Selector (Fixed Single Lodging Box) */}
              <View style={styles.fieldBlock}>
                <View style={styles.inputLabelRow}>
                  <Text style={styles.inputLabel}>
                    Lodging Claim Type <Text style={styles.reqStar}>*</Text>
                  </Text>
                  <View style={styles.entryCountBadge}>
                    <Text style={styles.entryCountBadgeText}>
                      {lodgingNights} Night{lodgingNights === 1 ? "" : "s"}
                    </Text>
                  </View>
                </View>
                <View style={styles.datePickerBtn}>
                  <BedDouble size={16} color="#4f46e5" />
                  <Text style={styles.datePickerBtnText}>{isRelativeStay ? "Lodging (Stay At Relative)" : "Lodging (Hotel Stay)"}</Text>
                </View>
              </View>

              {isRelativeStay ? (
                <View style={styles.fieldBlock}>
                  <Text style={styles.inputLabel}>Allowed Amount (₹)</Text>
                  <View style={styles.datePickerBtn}>
                    {relativeAllowed.loading ? (
                      <ActivityIndicator size="small" color="#4f46e5" />
                    ) : (
                      <Text style={[styles.datePickerBtnText, { fontSize: 16, fontWeight: "800", color: relativeAllowed.amount !== null ? "#0f172a" : "#94a3b8" }]}>
                        {relativeAllowed.amount !== null ? formatINR(relativeAllowed.amount) : "—"}
                      </Text>
                    )}
                  </View>
                  <Text style={{ fontSize: 11, color: relativeAllowed.error ? "#dc2626" : "#64748b", marginTop: 4 }}>
                    {relativeAllowed.error
                      ? relativeAllowed.error
                      : relativeAllowed.amount !== null
                        ? `Stay at relative: ${relativeAllowed.percent}% of your lodging entitlement for ${lodgingNights} night${lodgingNights === 1 ? "" : "s"}. No amount entry or hotel bill needed.`
                        : "Select stay dates, employees and destination city to see the allowed amount."}
                  </Text>
                </View>
              ) : (
              <>
              {/* Pay's Value / Amount */}
              <View style={styles.fieldBlock}>
                <Text style={styles.inputLabel}>
                  Lodging Amount (₹) <Text style={styles.reqStar}>*</Text>
                </Text>
                <TextInput
                  style={[styles.textInput, { fontSize: 16, fontWeight: "800", color: "#0f172a" }]}
                  placeholder="₹ 0.00"
                  placeholderTextColor="#94a3b8"
                  keyboardType="numeric"
                  value={requestedAmount}
                  onChangeText={(t) => {
                    setRequestedAmount(t.replace(/[^0-9.]/g, ""));
                    if (previewData) setPreviewData(null);
                  }}
                />
                {relativeAllowed.loading ? (
                  <Text style={{ fontSize: 11, color: "#64748b", marginTop: 5, fontWeight: "600" }}>
                    Calculating allowed amount...
                  </Text>
                ) : relativeAllowed.policyLimit !== null && relativeAllowed.policyLimit !== undefined ? (
                  (() => {
                    const limitAmt = Number(relativeAllowed.policyLimit || 0);
                    const typedAmt = parseFloat(requestedAmount) || 0;
                    const nightsCnt = Number(relativeAllowed.days || lodgingNights || 1);
                    const perNightAmt = Number(relativeAllowed.perDay || (nightsCnt > 0 ? Math.round((limitAmt / nightsCnt) * 100) / 100 : limitAmt));
                    const excessAmt = typedAmt > limitAmt ? Math.round((typedAmt - limitAmt) * 100) / 100 : 0;
                    return (
                      <Text style={{ fontSize: 11, color: excessAmt > 0 ? "#d97706" : "#059669", marginTop: 5, fontWeight: "700" }}>
                        Allowed Amount: {formatINR(limitAmt)} ({formatINR(perNightAmt)}/night × {nightsCnt} night{nightsCnt === 1 ? "" : "s"} • {numberOfEmployees} {numberOfEmployees === 1 ? "Employee" : "Employees"})
                        {excessAmt > 0 ? ` • Excess: ${formatINR(excessAmt)}` : ""}
                      </Text>
                    );
                  })()
                ) : relativeAllowed.error ? (
                  <Text style={{ fontSize: 11, color: "#dc2626", marginTop: 5, fontWeight: "600" }}>
                    {relativeAllowed.error}
                  </Text>
                ) : (
                  <Text style={{ fontSize: 11, color: "#64748b", marginTop: 5 }}>
                    Select stay dates, employees and destination city to see allowed amount.
                  </Text>
                )}
              </View>
              </>
              )}

              {/* Remark / Purpose */}
              <View style={styles.fieldBlock}>
                <View style={styles.inputLabelRow}>
                  <Text style={styles.inputLabel}>
                    Remark / Purpose <Text style={styles.reqStar}>*</Text>
                  </Text>
                  <Text style={styles.charCounter}>{remark.length} / 300</Text>
                </View>
                <TextInput
                  style={[styles.textInput, { height: 60, textAlignVertical: "top" }]}
                  placeholder="Client site visit for project meeting at Pune office..."
                  placeholderTextColor="#94a3b8"
                  multiline
                  maxLength={300}
                  value={remark}
                  onChangeText={(t) => {
                    setRemark(t);
                    if (previewData) setPreviewData(null);
                  }}
                />
              </View>
            </View>

            {/* Optional Food Claim Section within Lodging Form (Multiplier Entries) */}
            <View style={styles.itemCard}>
              <TouchableOpacity
                style={styles.fullPaymentRadioRow}
                activeOpacity={0.8}
                onPress={() => {
                  const next = !includeFood;
                  setIncludeFood(next);
                  if (next && (!foodEntries || foodEntries.length === 0)) {
                    setFoodEntries([{ id: `food_${Date.now()}_1`, requestedAmount: "", remark: "", attachments: [] }]);
                  }
                  if (previewData) setPreviewData(null);
                }}
              >
                <View style={[styles.fullPaymentRadioCircle, includeFood && styles.fullPaymentRadioCircleActive]}>
                  {includeFood ? <View style={styles.radioDot} /> : null}
                </View>
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                    <Text style={styles.fullPaymentRadioTitle}>Include Food Claim</Text>
                    <View style={[styles.entryCountBadge, { backgroundColor: "#ecfdf5" }]}>
                      <Text style={[styles.entryCountBadgeText, { color: "#059669" }]}>
                        {foodDays} Food Day{foodDays === 1 ? "" : "s"}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.fullPaymentRadioSub}>
                    Claim food allowance for the shared date range ({foodDays} inclusive calendar day{foodDays === 1 ? "" : "s"}). You can add multiple food entries.
                  </Text>
                </View>
              </TouchableOpacity>

              {includeFood ? (
                <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: "#f1f5f9" }}>
                  {/* Live Shared Food Entitlement Info */}
                  {(() => {
                    const fInfo = foodEntitlementInfo?.data || foodEntitlementInfo?.summary;
                    if (!fInfo) return null;
                    const fTotal = Number(fInfo.entitlement ?? fInfo.totalPeriodLimit ?? 0);
                    const fPrior = Number(fInfo.priorConsumed ?? 0);
                    const fRem = Number(fInfo.remaining ?? fInfo.totalRemainingLimit ?? Math.max(0, fTotal - fPrior));
                    return (
                      <View style={{ backgroundColor: "#f8fafc", borderColor: "#e2e8f0", borderWidth: 1, borderRadius: 10, padding: 10, marginBottom: 12 }}>
                        <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                          <Text style={{ fontSize: 11, color: "#64748b", fontWeight: "600" }}>
                            Food Entitlement ({fInfo.foodDays || foodDays} day{(fInfo.foodDays || foodDays) === 1 ? "" : "s"}):
                          </Text>
                          <Text style={{ fontSize: 11, color: "#0f172a", fontWeight: "700" }}>
                            {formatINR(fTotal)}
                          </Text>
                        </View>
                        {fPrior > 0 && (
                          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                            <Text style={{ fontSize: 11, color: "#dc2626", fontWeight: "600" }}>
                              Previously Claimed on Overlapping Dates:
                            </Text>
                            <Text style={{ fontSize: 11, color: "#dc2626", fontWeight: "700" }}>
                              -{formatINR(fPrior)}
                            </Text>
                          </View>
                        )}
                        <View style={{ flexDirection: "row", justifyContent: "space-between", paddingTop: 4, borderTopWidth: 1, borderTopColor: "#e2e8f0" }}>
                          <Text style={{ fontSize: 12, color: "#059669", fontWeight: "700" }}>
                            Remaining Food Entitlement:
                          </Text>
                          <Text style={{ fontSize: 12, color: "#059669", fontWeight: "800" }}>
                            {formatINR(fRem)}
                          </Text>
                        </View>
                      </View>
                    );
                  })()}

                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                    <Text style={{ fontSize: 13, fontWeight: "700", color: "#1e293b" }}>
                      Food Entries ({foodEntries.length})
                    </Text>
                    <TouchableOpacity
                      style={styles.headerAddEntryBtn}
                      onPress={handleAddFoodEntry}
                      activeOpacity={0.8}
                    >
                      <Plus size={13} color="#ffffff" />
                      <Text style={styles.headerAddEntryBtnText}>Add Food Entry</Text>
                    </TouchableOpacity>
                  </View>

                  {foodEntries.map((fEntry, fIdx) => (
                    <View
                      key={fEntry.id || fIdx}
                      style={{
                        backgroundColor: "#f8fafc",
                        borderRadius: 10,
                        padding: 12,
                        marginBottom: 10,
                        borderWidth: 1,
                        borderColor: "#e2e8f0",
                      }}
                    >
                      <View style={styles.entryCardHeader}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                          <View style={styles.entryNumberPill}>
                            <Text style={styles.entryNumberPillText}>F#{fIdx + 1}</Text>
                          </View>
                          <Receipt size={14} color="#4f46e5" />
                          <Text style={styles.entryCardTitle}>Food Entry #{fIdx + 1}</Text>
                        </View>
                        {foodEntries.length > 1 && (
                          <TouchableOpacity
                            style={styles.removeEntryBtn}
                            onPress={() => handleRemoveFoodEntry(fIdx)}
                            activeOpacity={0.7}
                          >
                            <Trash2 size={13} color="#dc2626" />
                            <Text style={styles.removeEntryBtnText}>Remove</Text>
                          </TouchableOpacity>
                        )}
                      </View>

                      <View style={styles.fieldBlock}>
                        <Text style={styles.inputLabel}>
                          Food Amount (₹) <Text style={styles.reqStar}>*</Text>
                        </Text>
                        <TextInput
                          style={[styles.textInput, { fontSize: 15, fontWeight: "800", color: "#0f172a", backgroundColor: "#ffffff" }]}
                          placeholder="₹ 0.00"
                          placeholderTextColor="#94a3b8"
                          keyboardType="numeric"
                          value={fEntry.requestedAmount}
                          onChangeText={(t) =>
                            handleUpdateFoodEntry(fIdx, "requestedAmount", t.replace(/[^0-9.]/g, ""))
                          }
                        />
                      </View>

                      <View style={styles.fieldBlock}>
                        <Text style={styles.inputLabel}>Food Remark (Optional)</Text>
                        <TextInput
                          style={[styles.textInput, { backgroundColor: "#ffffff" }]}
                          placeholder="e.g. Breakfast / Lunch / Dinner bill"
                          placeholderTextColor="#94a3b8"
                          value={fEntry.remark || ""}
                          onChangeText={(t) => handleUpdateFoodEntry(fIdx, "remark", t)}
                        />
                      </View>

                      <View style={styles.entryProofBlock}>
                        <View style={styles.inputLabelRow}>
                          <Text style={styles.inputLabel}>
                            Food Bill / Receipt #{fIdx + 1} <Text style={styles.reqStar}>* (Compulsory)</Text>
                          </Text>
                          {(fEntry.attachments || []).length > 0 ? (
                            <View style={styles.badgeSuccess}>
                              <CheckCircle2 size={12} color="#059669" />
                              <Text style={styles.badgeSuccessText}>{(fEntry.attachments || []).length} Attached</Text>
                            </View>
                          ) : (
                            <View style={styles.badgeCompulsory}>
                              <AlertCircle size={12} color="#dc2626" />
                              <Text style={styles.badgeCompulsoryText}>Required</Text>
                            </View>
                          )}
                        </View>

                        <View style={styles.attachBtnRow}>
                          <TouchableOpacity
                            style={[styles.attachBtn, (fEntry.attachments || []).length === 0 && styles.attachBtnRequired]}
                            onPress={() => handlePickAttachment(true, false, fIdx, "food_attachments")}
                            disabled={uploadingProof}
                          >
                            <Camera size={14} color="#4f46e5" />
                            <Text style={styles.attachBtnText}>Camera</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.attachBtn, (fEntry.attachments || []).length === 0 && styles.attachBtnRequired]}
                            onPress={() => handlePickAttachment(false, false, fIdx, "food_attachments")}
                            disabled={uploadingProof}
                          >
                            <ImageIcon size={14} color="#4f46e5" />
                            <Text style={styles.attachBtnText}>Gallery</Text>
                          </TouchableOpacity>
                        </View>

                        {(fEntry.attachments || []).map((att, attIdx) => {
                          const resolvedPreview = resolveProofImageUrl(att) || resolveProofImageUrl(att.uri) || att.uri;
                          const isPdf = att.type === "application/pdf" || (att.name && att.name.toLowerCase().endsWith(".pdf"));
                          return (
                            <View key={att.localId || attIdx} style={styles.attachCard}>
                              <TouchableOpacity
                                style={styles.attachCardBody}
                                activeOpacity={0.7}
                                onPress={() => {
                                  if (isPdf && resolvedPreview) {
                                    Linking.openURL(resolvedPreview).catch(() => {
                                      Alert.alert("Document", "Unable to open document.");
                                    });
                                  } else if (resolvedPreview) {
                                    setPhotoPreviewModal({
                                      visible: true,
                                      uri: resolvedPreview,
                                      title: att.name || `Food #${fIdx + 1} Proof #${attIdx + 1}`,
                                    });
                                  }
                                }}
                              >
                                {isPdf ? (
                                  <View style={styles.attachIconPlaceholder}>
                                    <FileText size={20} color="#dc2626" />
                                  </View>
                                ) : resolvedPreview ? (
                                  <Image source={{ uri: resolvedPreview }} style={styles.attachThumb} resizeMode="cover" />
                                ) : (
                                  <View style={styles.attachIconPlaceholder}>
                                    <FileCheck size={16} color="#059669" />
                                  </View>
                                )}
                                <View style={{ flex: 1, marginLeft: 8 }}>
                                  <Text style={styles.attachCardName} numberOfLines={1}>
                                    {att.name || `Food Proof #${attIdx + 1}`}
                                  </Text>
                                  <Text style={styles.attachCardSub}>
                                    {att.isUploading ? "Uploading..." : att.uploadFailed ? "Upload failed • Retry" : "Tap to preview"}
                                  </Text>
                                </View>
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={styles.attachDeleteBtn}
                                onPress={() => removeAttachment(attIdx, false, fIdx, "food_attachments")}
                              >
                                <Trash2 size={14} color="#dc2626" />
                              </TouchableOpacity>
                            </View>
                          );
                        })}
                      </View>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
            </>
          ) : (
            <>
              {/* Normal Mode: Multiple Expense Entries (#1, #2, etc.) */}
              {entries.map((entry, idx) => {
                const isFirst = idx === 0;
                const isLast = idx === entries.length - 1;
                const entryNum = idx + 1;
                const foundType = availableNormalExpenseTypes.find((t) => t.code === entry.expenseType);
                const TypeIcon = foundType?.icon || Receipt;

                return (
                  <View key={entry.id || idx} style={styles.itemCard}>
                    {/* Entry Header: Title + Remove Button */}
                    <View style={styles.entryCardHeader}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <View style={styles.entryNumberPill}>
                          <Text style={styles.entryNumberPillText}>#{entryNum}</Text>
                        </View>
                        <Text style={styles.entryCardTitle}>
                          Expense Details #{entryNum}
                        </Text>
                      </View>

                      {!isFirst && (
                        <TouchableOpacity
                          style={styles.removeEntryBtn}
                          onPress={() => handleRemoveEntry(idx)}
                          activeOpacity={0.7}
                        >
                          <Trash2 size={13} color="#dc2626" />
                          <Text style={styles.removeEntryBtnText}>Remove</Text>
                        </TouchableOpacity>
                      )}
                    </View>

                    {/* Expense Type Selector */}
                    <View style={styles.fieldBlock}>
                      <Text style={styles.inputLabel}>
                        Expense Type <Text style={styles.reqStar}>*</Text>
                      </Text>
                      <TouchableOpacity
                        style={styles.datePickerBtn}
                        onPress={() => setActiveModal({ kind: "type", targetEntryIndex: idx })}
                      >
                        <TypeIcon size={16} color="#4f46e5" />
                        <Text style={[styles.datePickerBtnText, !foundType && { color: "#94a3b8" }]}>
                          {foundType?.name || "Select Expense Type"}
                        </Text>
                        <ChevronDown size={14} color="#64748b" style={{ marginLeft: "auto" }} />
                      </TouchableOpacity>
                    </View>

                    {/* Stock Purchase Fields: Material Name, Barcode Number & Quantity */}
                    {entry.expenseType === "STOCK_PURCHASE" && (
                      <View style={{ gap: 10, marginBottom: 4 }}>
                        <View style={styles.fieldBlock}>
                          <Text style={styles.inputLabel}>
                            Material Name <Text style={styles.reqStar}>*</Text>
                          </Text>
                          <View style={styles.barcodeInputWrapper}>
                            <TextInput
                              style={styles.barcodeTextInput}
                              placeholder="Type material name..."
                              placeholderTextColor="#94a3b8"
                              value={entry.materialName || ""}
                              onChangeText={(t) => handleUpdateEntry(idx, "materialName", t)}
                            />
                          </View>
                        </View>

                        <View style={styles.fieldBlock}>
                          <Text style={styles.inputLabel}>
                            Barcode Number <Text style={styles.reqStar}>*</Text>
                          </Text>
                          <View style={styles.barcodeInputWrapper}>
                            <Barcode size={18} color="#6366f1" style={{ marginRight: 8 }} />
                            <TextInput
                              style={styles.barcodeTextInput}
                              placeholder="Type barcode number (e.g. BC-100234)..."
                              placeholderTextColor="#94a3b8"
                              value={entry.barcodeNumber || ""}
                              onChangeText={(t) => handleUpdateEntry(idx, "barcodeNumber", t)}
                              autoCapitalize="characters"
                            />
                          </View>
                        </View>

                        <View style={styles.fieldBlock}>
                          <Text style={styles.inputLabel}>
                            Quantity <Text style={styles.reqStar}>*</Text>
                          </Text>
                          <View style={styles.barcodeInputWrapper}>
                            <TextInput
                              style={styles.barcodeTextInput}
                              placeholder="Enter quantity (e.g. 1, 5 pcs, 2 boxes)..."
                              placeholderTextColor="#94a3b8"
                              value={entry.quantity !== undefined && entry.quantity !== null ? String(entry.quantity) : ""}
                              onChangeText={(t) => handleUpdateEntry(idx, "quantity", t)}
                              keyboardType="default"
                            />
                          </View>
                        </View>
                      </View>
                    )}

                    {/* Local Conveyance: Mode (Car, Bike, E-Bike, E-Car), KM Distance Input & Auto Petrol Calculation */}
                    {entry.expenseType === "CONVEYANCE" ? (
                      <View style={styles.conveyanceContainer}>
                        {/* Conveyance Mode Selection */}
                        <View style={styles.inputLabelRow}>
                          <Text style={styles.inputLabel}>
                            Travel Mode <Text style={styles.reqStar}>*</Text>
                          </Text>
                          <View style={styles.policyRateBadge}>
                            <Fuel size={11} color="#4338ca" />
                            <Text style={styles.policyRateBadgeText}>Petrol / Rate Policy</Text>
                          </View>
                        </View>

                        {/* Travel Mode Dropdown UI */}
                        {(() => {
                          const selectedVehicle = entry.vehicle || "twoWheeler";
                          const matchedMode =
                            CONVEYANCE_MODES.find(
                              (m) => m.key === selectedVehicle || m.code === selectedVehicle
                            ) || CONVEYANCE_MODES[0];
                          const appliedRate = getRateForMode(matchedMode.key, conveyanceRates);
                          const ModeIcon = matchedMode.icon;

                          return (
                            <TouchableOpacity
                              style={styles.datePickerBtn}
                              activeOpacity={0.7}
                              onPress={() =>
                                setActiveModal({ kind: "conveyanceMode", targetEntryIndex: idx })
                              }
                            >
                              <ModeIcon size={16} color="#4f46e5" />
                              <Text style={styles.datePickerBtnText}>{matchedMode.label}</Text>
                              <View
                                style={[
                                  styles.modeRatePill,
                                  { marginLeft: "auto", marginRight: 8 },
                                ]}
                              >
                                <Text style={styles.modeRatePillText}>₹{appliedRate}/km</Text>
                              </View>
                              <ChevronDown size={14} color="#64748b" />
                            </TouchableOpacity>
                          );
                        })()}

                        {/* Distance in KM Input */}
                        <View style={[styles.fieldBlock, { marginTop: 10 }]}>
                          <View style={styles.inputLabelRow}>
                            <Text style={styles.inputLabel}>
                              Distance (in KM) <Text style={styles.reqStar}>*</Text>
                            </Text>
                            <Text style={styles.inputHint}>Type distance in KM</Text>
                          </View>
                          <View style={styles.kmInputWrapper}>
                            <Gauge size={18} color="#6366f1" style={{ marginRight: 8 }} />
                            <TextInput
                              style={styles.kmTextInput}
                              placeholder="Type distance in KM (e.g. 25, 40.5)..."
                              placeholderTextColor="#94a3b8"
                              keyboardType="numeric"
                              value={entry.distanceKm !== undefined && entry.distanceKm !== null ? String(entry.distanceKm) : ""}
                              onChangeText={(t) => handleUpdateDistanceKm(idx, t)}
                            />
                            <View style={styles.kmUnitBadge}>
                              <Text style={styles.kmUnitBadgeText}>KM</Text>
                            </View>
                          </View>
                        </View>

                        {/* Photo uploads: 1. Number Plate, 2. Start KM, 3. End KM (odometer) */}
                        {CONVEYANCE_PHOTO_FIELDS.map(({ field, label }) => {
                          const photos = entry[field] || [];
                          return (
                            <View key={field} style={[styles.fieldBlock, { marginTop: 10 }]}>
                              <View style={styles.inputLabelRow}>
                                <Text style={styles.inputLabel}>
                                  {label} <Text style={styles.reqStar}>*</Text>
                                </Text>
                                {photos.length > 0 ? (
                                  <View style={styles.badgeSuccess}>
                                    <CheckCircle2 size={12} color="#059669" />
                                    <Text style={styles.badgeSuccessText}>{photos.length} Attached</Text>
                                  </View>
                                ) : (
                                  <View style={styles.badgeCompulsory}>
                                    <AlertCircle size={12} color="#dc2626" />
                                    <Text style={styles.badgeCompulsoryText}>Required</Text>
                                  </View>
                                )}
                              </View>

                              <View style={styles.attachBtnRow}>
                                <TouchableOpacity
                                  style={[styles.attachBtn, photos.length === 0 && styles.attachBtnRequired]}
                                  onPress={() => handlePickAttachment(true, false, idx, field)}
                                  disabled={uploadingProof}
                                >
                                  <Camera size={14} color="#4f46e5" />
                                  <Text style={styles.attachBtnText}>Camera</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                  style={[styles.attachBtn, photos.length === 0 && styles.attachBtnRequired]}
                                  onPress={() => handlePickAttachment(false, false, idx, field)}
                                  disabled={uploadingProof}
                                >
                                  <ImageIcon size={14} color="#4f46e5" />
                                  <Text style={styles.attachBtnText}>Gallery</Text>
                                </TouchableOpacity>
                              </View>

                              {photos.map((ph, phIdx) => {
                                const preview = resolveProofImageUrl(ph) || resolveProofImageUrl(ph.uri) || ph.uri;
                                return (
                                  <View key={ph.localId || phIdx} style={styles.attachCard}>
                                    <TouchableOpacity
                                      style={styles.attachCardBody}
                                      activeOpacity={0.7}
                                      onPress={() => {
                                        if (preview) setPhotoPreviewModal({ visible: true, uri: preview, title: ph.name || label });
                                      }}
                                    >
                                      {preview ? (
                                        <Image source={{ uri: preview }} style={styles.attachThumb} resizeMode="cover" />
                                      ) : (
                                        <View style={styles.attachIconPlaceholder}>
                                          <FileCheck size={16} color="#059669" />
                                        </View>
                                      )}
                                      <View style={{ flex: 1, marginLeft: 8 }}>
                                        <Text style={styles.attachCardName} numberOfLines={1}>
                                          {ph.name || label}
                                        </Text>
                                        <Text style={styles.attachCardSub}>
                                          {ph.isUploading ? "Uploading..." : ph.uploadFailed ? "Upload failed • Retry" : "Tap to preview"}
                                        </Text>
                                      </View>
                                      <View style={styles.previewEyePill}>
                                        <Eye size={12} color="#4f46e5" />
                                        <Text style={styles.previewEyeText}>View</Text>
                                      </View>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                      style={styles.attachDeleteBtn}
                                      onPress={() => removeAttachment(phIdx, false, idx, field)}
                                    >
                                      <Trash2 size={14} color="#dc2626" />
                                    </TouchableOpacity>
                                  </View>
                                );
                              })}
                            </View>
                          );
                        })}

                        {/* Conveyance Calculation Result Card */}
                        {(() => {
                          const selectedVehicle = entry.vehicle || "twoWheeler";
                          const matchedMode = CONVEYANCE_MODES.find((m) => m.key === selectedVehicle) || CONVEYANCE_MODES[0];
                          const appliedRate = getRateForMode(matchedMode.key, conveyanceRates);
                          const kmVal = parseFloat(entry.distanceKm);
                          const hasValidKm = !isNaN(kmVal) && kmVal > 0;
                          const calculatedAmt = hasValidKm ? Math.round(kmVal * appliedRate * 100) / 100 : 0;

                          return (
                            <View style={styles.calcResultBox}>
                              <View style={styles.calcResultTop}>
                                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                                  <Calculator size={15} color="#4338ca" />
                                  <Text style={styles.calcResultTitle}>Conveyance Calculation</Text>
                                </View>
                                <View style={styles.calcResultTag}>
                                  <Text style={styles.calcResultTagText}>Auto-calculated</Text>
                                </View>
                              </View>

                              <View style={styles.calcFormulaRow}>
                                <Text style={styles.calcFormulaText}>
                                  {hasValidKm ? `${kmVal} KM × ₹${appliedRate}/km (${matchedMode.shortLabel})` : `0 KM × ₹${appliedRate}/km (${matchedMode.shortLabel})`}
                                </Text>
                                <Text style={styles.calcAmountBig}>
                                  ₹{calculatedAmt.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </Text>
                              </View>

                              <Text style={styles.calcHelperText}>
                                Petrol / vehicle rate of ₹{appliedRate}/km applied from Admin Policy. Claim amount is locked and auto-computed from distance.
                              </Text>
                            </View>
                          );
                        })()}
                      </View>
                    ) : entry.expenseType === "TRAVEL" ? (
                      (() => {
                        const activeModes = sanitizeTravelModesList(travelModes);
                        const selectedMode = activeModes.find(
                          (m) => String(m.code || "").toUpperCase() === String(entry.travelModeCode || "").toUpperCase()
                        );
                        const activeSubs = sanitizeTravelSubtypesList(selectedMode?.subtypes);
                        const selectedSub = activeSubs.find(
                          (s) => String(s.code || "").toUpperCase() === String(entry.travelSubtypeCode || "").toUpperCase()
                        );
                        const wf = isKmWorkflow(selectedSub, entry) ? "KM_RATE" : "STANDARD";
                        const rateKey = resolveSubtypeRateKey(selectedMode, selectedSub || { code: entry.travelSubtypeCode, name: entry.travelSubtypeName });
                        const appliedRate = Number(
                          (Number(selectedSub?.ratePerKm) > 0 ? selectedSub.ratePerKm : null) ??
                          (Number(selectedMode?.ratePerKm) > 0 ? selectedMode.ratePerKm : null) ??
                          conveyanceRates?.[rateKey] ??
                          entry.ratePerKm ??
                          0
                        );
                        const subEntStatus = selectedSub?.entitlement?.status;
                        const isNotEntitled = selectedSub?.entitled === false || subEntStatus === "NOT_ENTITLED";
                        const maxCap = selectedSub?.entitlement?.maxAmount ?? selectedSub?.maxAllowed;
                        const ModeIcon = getTravelModeIconComponent(selectedMode?.code || selectedMode?.name || entry.travelModeCode || entry.travelModeName);
                        const SubtypeIcon = getTravelModeIconComponent(selectedSub?.code || selectedSub?.name || entry.travelSubtypeCode || entry.travelSubtypeName || selectedMode?.code || entry.travelModeCode);

                        return (
                          <View style={styles.conveyanceContainer}>
                            {/* Travel Mode Dropdown */}
                            <View style={styles.fieldBlock}>
                              <Text style={styles.inputLabel}>
                                Travel Mode <Text style={styles.reqStar}>*</Text>
                              </Text>
                              <TouchableOpacity
                                style={styles.datePickerBtn}
                                activeOpacity={0.7}
                                onPress={() =>
                                  setActiveModal({ kind: "travelMode", targetEntryIndex: idx })
                                }
                              >
                                <ModeIcon size={16} color="#4f46e5" />
                                <Text
                                  style={[
                                    styles.datePickerBtnText,
                                    !selectedMode && !entry.travelModeName && { color: "#94a3b8" },
                                  ]}
                                >
                                  {selectedMode?.name || entry.travelModeName || "Select Travel Mode"}
                                </Text>
                                <ChevronDown size={14} color="#64748b" style={{ marginLeft: "auto" }} />
                              </TouchableOpacity>
                            </View>

                            {/* Travel Subtype Dropdown (shown when mode has subtypes, hidden for Taxi/Auto) */}
                            {selectedMode && activeSubs.length > 0 && (
                              <View style={[styles.fieldBlock, { marginTop: 10 }]}>
                                <Text style={styles.inputLabel}>
                                  Travel Subtype <Text style={styles.reqStar}>*</Text>
                                </Text>
                                <TouchableOpacity
                                  style={styles.datePickerBtn}
                                  activeOpacity={0.7}
                                  onPress={() =>
                                    setActiveModal({ kind: "travelSubtype", targetEntryIndex: idx })
                                  }
                                >
                                  <SubtypeIcon size={16} color="#4f46e5" />
                                  <Text
                                    style={[
                                      styles.datePickerBtnText,
                                      !selectedSub && !entry.travelSubtypeName && { color: "#94a3b8" },
                                    ]}
                                  >
                                    {selectedSub?.name || entry.travelSubtypeName || "Select Subtype"}
                                  </Text>
                                  {wf === "KM_RATE" && appliedRate > 0 ? (
                                    <View style={[styles.modeRatePill, { marginLeft: "auto", marginRight: 8 }]}>
                                      <Text style={styles.modeRatePillText}>₹{appliedRate}/km</Text>
                                    </View>
                                  ) : null}
                                  <ChevronDown
                                    size={14}
                                    color="#64748b"
                                    style={wf === "KM_RATE" && appliedRate > 0 ? undefined : { marginLeft: "auto" }}
                                  />
                                </TouchableOpacity>
                              </View>
                            )}

                            {/* Level Entitlement Status Banner */}
                            {selectedSub && isNotEntitled && (
                              <View style={{ backgroundColor: "#fef2f2", borderColor: "#fecaca", borderWidth: 1, borderRadius: 8, padding: 8, marginTop: 8 }}>
                                <Text style={{ fontSize: 11, fontWeight: "700", color: "#991b1b" }}>
                                  ⚠️ Not in your Level Entitlement: You may still submit this claim, and the claimed amount will be recorded as Excess (Allowed = ₹0).
                                </Text>
                              </View>
                            )}
                            {selectedSub && !isNotEntitled && maxCap !== null && maxCap !== undefined && (
                              <View style={{ backgroundColor: "#eff6ff", borderColor: "#bfdbfe", borderWidth: 1, borderRadius: 8, padding: 8, marginTop: 8 }}>
                                <Text style={{ fontSize: 11, fontWeight: "600", color: "#1e40af" }}>
                                  Level Entitlement Cap: {formatINR(maxCap)} (any amount above cap is Excess).
                                </Text>
                              </View>
                            )}

                            {wf === "KM_RATE" ? (
                              <>
                                {/* Total Distance in KM Input (just like Local Conveyance) */}
                                <View style={[styles.fieldBlock, { marginTop: 10 }]}>
                                  <View style={styles.inputLabelRow}>
                                    <Text style={styles.inputLabel}>
                                      Distance (in KM) <Text style={styles.reqStar}>*</Text>
                                    </Text>
                                    <Text style={styles.inputHint}>Type distance in KM</Text>
                                  </View>
                                  <View style={styles.kmInputWrapper}>
                                    <Gauge size={18} color="#6366f1" style={{ marginRight: 8 }} />
                                    <TextInput
                                      style={styles.kmTextInput}
                                      placeholder="Type distance in KM (e.g. 25, 40.5)..."
                                      placeholderTextColor="#94a3b8"
                                      keyboardType="numeric"
                                      value={entry.distanceKm !== undefined && entry.distanceKm !== null ? String(entry.distanceKm) : ""}
                                      onChangeText={(t) => handleUpdateTravelKm(idx, "distanceKm", t)}
                                    />
                                    <View style={styles.kmUnitBadge}>
                                      <Text style={styles.kmUnitBadgeText}>KM</Text>
                                    </View>
                                  </View>
                                </View>

                                {/* Photo uploads: 1. Vehicle Photo, 2. Start Odometer, 3. End Odometer */}
                                {CONVEYANCE_PHOTO_FIELDS.map(({ field, label }) => {
                                  const photos = entry[field] || [];
                                  return (
                                    <View key={field} style={[styles.fieldBlock, { marginTop: 10 }]}>
                                      <View style={styles.inputLabelRow}>
                                        <Text style={styles.inputLabel}>
                                          {label} <Text style={styles.reqStar}>*</Text>
                                        </Text>
                                        {photos.length > 0 ? (
                                          <View style={styles.badgeSuccess}>
                                            <CheckCircle2 size={12} color="#059669" />
                                            <Text style={styles.badgeSuccessText}>{photos.length} Attached</Text>
                                          </View>
                                        ) : (
                                          <View style={styles.badgeCompulsory}>
                                            <AlertCircle size={12} color="#dc2626" />
                                            <Text style={styles.badgeCompulsoryText}>Required</Text>
                                          </View>
                                        )}
                                      </View>

                                      <View style={styles.attachBtnRow}>
                                        <TouchableOpacity
                                          style={[styles.attachBtn, photos.length === 0 && styles.attachBtnRequired]}
                                          onPress={() => handlePickAttachment(true, false, idx, field)}
                                          disabled={uploadingProof}
                                        >
                                          <Camera size={14} color="#4f46e5" />
                                          <Text style={styles.attachBtnText}>Camera</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                          style={[styles.attachBtn, photos.length === 0 && styles.attachBtnRequired]}
                                          onPress={() => handlePickAttachment(false, false, idx, field)}
                                          disabled={uploadingProof}
                                        >
                                          <ImageIcon size={14} color="#4f46e5" />
                                          <Text style={styles.attachBtnText}>Gallery</Text>
                                        </TouchableOpacity>
                                      </View>

                                      {photos.map((ph, phIdx) => {
                                        const preview = resolveProofImageUrl(ph) || resolveProofImageUrl(ph.uri) || ph.uri;
                                        return (
                                          <View key={ph.localId || phIdx} style={styles.attachCard}>
                                            <TouchableOpacity
                                              style={styles.attachCardBody}
                                              activeOpacity={0.7}
                                              onPress={() => {
                                                if (preview) setPhotoPreviewModal({ visible: true, uri: preview, title: ph.name || label });
                                              }}
                                            >
                                              {preview ? (
                                                <Image source={{ uri: preview }} style={styles.attachThumb} resizeMode="cover" />
                                              ) : (
                                                <View style={styles.attachIconPlaceholder}>
                                                  <FileCheck size={16} color="#059669" />
                                                </View>
                                              )}
                                              <View style={{ flex: 1, marginLeft: 8 }}>
                                                <Text style={styles.attachCardName} numberOfLines={1}>
                                                  {ph.name || label}
                                                </Text>
                                                <Text style={styles.attachCardSub}>
                                                  {ph.isUploading ? "Uploading..." : ph.uploadFailed ? "Upload failed • Retry" : "Tap to preview"}
                                                </Text>
                                              </View>
                                            </TouchableOpacity>
                                            <TouchableOpacity
                                              style={styles.attachDeleteBtn}
                                              onPress={() => removeAttachment(phIdx, false, idx, field)}
                                            >
                                              <Trash2 size={14} color="#dc2626" />
                                            </TouchableOpacity>
                                          </View>
                                        );
                                      })}
                                    </View>
                                  );
                                })}

                                {/* Auto-calculated Distance & Amount Result Card */}
                                <View style={[styles.calcResultBox, { marginTop: 10 }]}>
                                  <View style={styles.calcResultTop}>
                                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                                      <Calculator size={15} color="#4338ca" />
                                      <Text style={styles.calcResultTitle}>{selectedSub?.name || "Vehicle"} Calculation</Text>
                                    </View>
                                    <View style={styles.calcResultTag}>
                                      <Text style={styles.calcResultTagText}>Auto-calculated</Text>
                                    </View>
                                  </View>

                                  <View style={styles.calcFormulaRow}>
                                    <Text style={styles.calcFormulaText}>
                                      {Number(entry.distanceKm || 0) > 0
                                        ? `${entry.distanceKm} KM × ₹${appliedRate}/km`
                                        : `0 KM × ₹${appliedRate}/km`}
                                    </Text>
                                    <Text style={styles.calcAmountBig}>
                                      {formatINR(Number(entry.requestedAmount || 0))}
                                    </Text>
                                  </View>

                                  <Text style={styles.calcHelperText}>
                                    Vehicle rate of ₹{appliedRate}/km applied from Admin Policy. Claim amount is auto-computed from distance ({entry.distanceKm || 0} KM).
                                  </Text>
                                </View>
                              </>
                            ) : (
                              /* Standard Travel Amount Input (Bus, Flight, Taxi/Auto, Train, Company Vehicle) */
                              <View style={[styles.fieldBlock, { marginTop: 10 }]}>
                                <Text style={styles.inputLabel}>
                                  Travel Amount (₹) <Text style={styles.reqStar}>*</Text>
                                </Text>
                                <TextInput
                                  style={[styles.textInput, { fontSize: 16, fontWeight: "800", color: "#0f172a", backgroundColor: "#ffffff" }]}
                                  placeholder="₹ 0.00"
                                  placeholderTextColor="#94a3b8"
                                  keyboardType="numeric"
                                  value={entry.requestedAmount}
                                  onChangeText={(t) => {
                                    handleUpdateEntry(idx, "requestedAmount", t.replace(/[^0-9.]/g, ""));
                                  }}
                                />
                              </View>
                            )}
                          </View>
                        );
                      })()
                    ) : (
                      /* Pay's Value / Amount for non-conveyance expense types */
                      <View style={styles.fieldBlock}>
                        {entry.expenseType === "FOOD" && (() => {
                          const fInfo = foodEntitlementInfo?.data || foodEntitlementInfo?.summary;
                          if (!fInfo) return null;
                          const fTotal = Number(fInfo.entitlement ?? fInfo.totalPeriodLimit ?? 0);
                          const fPrior = Number(fInfo.priorConsumed ?? 0);
                          const fRem = Number(fInfo.remaining ?? fInfo.totalRemainingLimit ?? Math.max(0, fTotal - fPrior));
                          return (
                            <View style={{ backgroundColor: "#f8fafc", borderColor: "#e2e8f0", borderWidth: 1, borderRadius: 8, padding: 8, marginBottom: 8 }}>
                              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                                <Text style={{ fontSize: 11, color: "#64748b", fontWeight: "600" }}>
                                  Remaining Food Entitlement ({claimDate || "Today"}):
                                </Text>
                                <Text style={{ fontSize: 11, color: "#059669", fontWeight: "800" }}>
                                  {formatINR(fRem)}
                                </Text>
                              </View>
                              {fPrior > 0 && (
                                <Text style={{ fontSize: 10, color: "#dc2626", marginTop: 2, fontWeight: "600" }}>
                                  Already claimed on this date: {formatINR(fPrior)} (shared across Food &amp; Lodging+Food claims)
                                </Text>
                              )}
                            </View>
                          );
                        })()}
                        <Text style={styles.inputLabel}>
                          Pay's Value / Amount (₹) <Text style={styles.reqStar}>*</Text>
                        </Text>
                        <TextInput
                          style={[styles.textInput, { fontSize: 16, fontWeight: "800", color: "#0f172a" }]}
                          placeholder="₹ 0.00"
                          placeholderTextColor="#94a3b8"
                          keyboardType="numeric"
                          value={entry.requestedAmount}
                          onChangeText={(t) => {
                            handleUpdateEntry(idx, "requestedAmount", t.replace(/[^0-9.]/g, ""));
                          }}
                        />
                        {isTypePayLimitApplicable(entry.expenseType) &&
                          !isTypeCfoApplicable(entry.expenseType) &&
                          !fullPaymentRequested &&
                          !hasStockPurchaseEntry &&
                          directAccountLimit !== null &&
                          directAccountLimit > 0 && (
                            <Text style={{ fontSize: 11, fontWeight: "700", color: "#475569", marginTop: 6 }}>
                              Limit is ₹{Number(directAccountLimit).toLocaleString("en-IN")} — above ₹{Number(directAccountLimit).toLocaleString("en-IN")} pay goes for approval
                            </Text>
                          )}
                      </View>
                    )}

                    {/* Remark / Purpose */}
                    <View style={styles.fieldBlock}>
                      <View style={styles.inputLabelRow}>
                        <Text style={styles.inputLabel}>
                          Remark / Purpose <Text style={styles.reqStar}>*</Text>
                        </Text>
                        <Text style={styles.charCounter}>{(entry.remark || "").length} / 500</Text>
                      </View>
                      <TextInput
                        style={[styles.textInput, { height: 60, textAlignVertical: "top" }]}
                        placeholder={idx === 0 ? "Details for Expense Entry #1 (e.g. food/travel purpose)..." : `Details for Expense Entry #${entryNum}...`}
                        placeholderTextColor="#94a3b8"
                        multiline
                        maxLength={500}
                        value={entry.remark}
                        onChangeText={(t) => {
                          handleUpdateEntry(idx, "remark", t);
                        }}
                      />
                    </View>

                    {/* Bill Proof Upload for THIS Entry (not applicable for Local Conveyance or Own Vehicle KM_RATE) */}
                    {entry.expenseType !== "CONVEYANCE" && !(entry.expenseType === "TRAVEL" && isKmWorkflow(null, entry)) && (
                      <View style={styles.entryProofBlock}>
                        <View style={styles.inputLabelRow}>
                          <Text style={styles.inputLabel}>
                            Bill / Receipt Proof #{entryNum} <Text style={styles.reqStar}>* (Compulsory)</Text>
                          </Text>
                          {(entry.attachments || []).length > 0 ? (
                            <View style={styles.badgeSuccess}>
                              <CheckCircle2 size={12} color="#059669" />
                              <Text style={styles.badgeSuccessText}>{(entry.attachments || []).length} Attached</Text>
                            </View>
                          ) : (
                            <View style={styles.badgeCompulsory}>
                              <AlertCircle size={12} color="#dc2626" />
                              <Text style={styles.badgeCompulsoryText}>Required</Text>
                            </View>
                          )}
                        </View>

                        <View style={styles.attachBtnRow}>
                          <TouchableOpacity
                            style={[styles.attachBtn, (entry.attachments || []).length === 0 && styles.attachBtnRequired]}
                            onPress={() => handlePickAttachment(true, false, idx)}
                            disabled={uploadingProof}
                          >
                            <Camera size={14} color="#4f46e5" />
                            <Text style={styles.attachBtnText}>Camera</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={[styles.attachBtn, (entry.attachments || []).length === 0 && styles.attachBtnRequired]}
                            onPress={() => handlePickAttachment(false, false, idx)}
                            disabled={uploadingProof}
                          >
                            <ImageIcon size={14} color="#4f46e5" />
                            <Text style={styles.attachBtnText}>Gallery</Text>
                          </TouchableOpacity>
                        </View>

                        {/* Uploaded Attachments for this entry */}
                        {(entry.attachments || []).map((att, attIdx) => {
                          const resolvedPreview = resolveProofImageUrl(att) || resolveProofImageUrl(att.uri) || att.uri;
                          const isPdf = att.type === "application/pdf" || (att.name && att.name.toLowerCase().endsWith(".pdf"));
                          return (
                            <View key={att.localId || attIdx} style={styles.attachCard}>
                              <TouchableOpacity
                                style={styles.attachCardBody}
                                activeOpacity={0.7}
                                onPress={() => {
                                  if (isPdf && resolvedPreview) {
                                    Linking.openURL(resolvedPreview).catch(() => {
                                      Alert.alert("Document", "Unable to open document.");
                                    });
                                  } else if (resolvedPreview) {
                                    setPhotoPreviewModal({
                                      visible: true,
                                      uri: resolvedPreview,
                                      title: att.name || `Entry #${entryNum} Proof #${attIdx + 1}`,
                                    });
                                  }
                                }}
                              >
                                {isPdf ? (
                                  <View style={styles.attachIconPlaceholder}>
                                    <FileText size={20} color="#dc2626" />
                                  </View>
                                ) : resolvedPreview ? (
                                  <Image source={{ uri: resolvedPreview }} style={styles.attachThumb} resizeMode="cover" />
                                ) : (
                                  <View style={styles.attachIconPlaceholder}>
                                    <FileCheck size={16} color="#059669" />
                                  </View>
                                )}
                                <View style={{ flex: 1, marginLeft: 8 }}>
                                  <Text style={styles.attachCardName} numberOfLines={1}>
                                    {att.name || `Proof #${attIdx + 1}`}
                                  </Text>
                                  <Text style={styles.attachCardSub}>
                                    {att.isUploading ? "Uploading..." : att.uploadFailed ? "Upload failed • Retry" : isPdf ? "PDF Document • Tap to open" : "Tap to preview"}
                                  </Text>
                                </View>
                                <View style={styles.previewEyePill}>
                                  <Eye size={12} color="#4f46e5" />
                                  <Text style={styles.previewEyeText}>View</Text>
                                </View>
                              </TouchableOpacity>

                              <TouchableOpacity
                                style={styles.attachDeleteBtn}
                                onPress={() => removeAttachment(attIdx, false, idx)}
                              >
                                <Trash2 size={14} color="#dc2626" />
                              </TouchableOpacity>
                            </View>
                          );
                        })}
                      </View>
                    )}

                    {/* Reporting Manager / Accounts Routing Display for CFO-Applicable or Pay-Limit-Applicable claim type entry
                        Strict Approval Priority:
                        1st Priority: Full Payment (when fullPaymentRequested is true, only show approval in Full Payment section)
                        2nd Priority: CFO Approval Claim Type (e.g. Stock Purchase or configured CFO claim types; no payment limit applies unless also configured)
                        3rd Priority: Pay Limit Applicable Claim Type (e.g. Other Claim or configured Pay Limit claim types) */}
                    {(() => {
                      if (fullPaymentRequested) return false;
                      if (hasStockPurchaseEntry) {
                        const firstStockIdx = entries.findIndex((e) => e.expenseType === "STOCK_PURCHASE" || isTypeCfoApplicable(e?.expenseType));
                        return (entry.expenseType === "STOCK_PURCHASE" || isTypeCfoApplicable(entry.expenseType)) && idx === firstStockIdx;
                      }
                      if (hasOtherOnlyEntry) {
                        const firstOtherIdx = entries.findIndex((e) => isTypePayLimitApplicable(e?.expenseType) || e.expenseType === "OTHER");
                        return (isTypePayLimitApplicable(entry.expenseType) || entry.expenseType === "OTHER") && idx === firstOtherIdx;
                      }
                      return false;
                    })() && (
                      isCurrentUserManagement ? (
                        <View style={[styles.fieldBlock, { marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: "#f1f5f9" }]}>
                          <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: "#f0fdf4", paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: "#bbf7d0" }}>
                            <CheckCircle2 size={16} color="#16a34a" />
                            <View style={{ marginLeft: 8, flex: 1 }}>
                              <Text style={{ fontSize: 13, fontWeight: "700", color: "#15803d" }}>Approval Not Applicable</Text>
                              <Text style={{ fontSize: 11, color: "#166534", marginTop: 2 }}>
                                As a Management user, approval is not applicable and your claim routes directly to Accounts.
                              </Text>
                            </View>
                          </View>
                        </View>
                      ) : (() => {
                        const isStockEntry = entry.expenseType === "STOCK_PURCHASE" || isTypeCfoApplicable(entry.expenseType);
                        const isPayLimitOnForType = isTypePayLimitApplicable(entry.expenseType);
                        const effectiveOtherAmt = isStockEntry ? (parseFloat(entry.requestedAmount) || 0) : maxOtherOnlyEntryAmount;
                        // Payment limit rules apply ONLY when Pay Limit is enabled for this claim type and not overridden by CFO rule
                        const hasLimitConfigured = !isStockEntry && isPayLimitOnForType && directAccountLimit !== null && directAccountLimit > 0;
                        const isWithinDirectLimit = hasLimitConfigured && effectiveOtherAmt <= directAccountLimit;

                        if (isWithinDirectLimit) {
                          return (
                            <View style={[styles.fieldBlock, { marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: "#f1f5f9" }]}>
                              <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: "#f0fdf4", paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: "#bbf7d0" }}>
                                <CheckCircle2 size={16} color="#16a34a" />
                                <View style={{ marginLeft: 8, flex: 1 }}>
                                  <Text style={{ fontSize: 13, fontWeight: "700", color: "#15803d" }}>
                                    Limit is ₹{Number(directAccountLimit).toLocaleString("en-IN")} · Direct to Accounts Admin
                                  </Text>
                                  <Text style={{ fontSize: 11, color: "#166534", marginTop: 2 }}>
                                    {effectiveOtherAmt > 0
                                      ? `Limit is ₹${Number(directAccountLimit).toLocaleString("en-IN")} — above ₹${Number(directAccountLimit).toLocaleString("en-IN")} pay goes for approval. Since ₹${effectiveOtherAmt.toLocaleString("en-IN")} is within the limit, this request goes directly to Accounts Admin.`
                                      : `Limit is ₹${Number(directAccountLimit).toLocaleString("en-IN")} — up to ₹${Number(directAccountLimit).toLocaleString("en-IN")} goes directly to Accounts Admin; above ₹${Number(directAccountLimit).toLocaleString("en-IN")} pay goes for approval.`}
                                  </Text>
                                </View>
                              </View>
                            </View>
                          );
                        }

                        const entryRes = resolveHierarchyManagerForAmount(effectiveOtherAmt);
                        const resolvedMgr = entryRes.approver || reportingManagerApprover;
                        const isEscalated = entryRes.isEscalated || entryRes.isTagEscalated;
                        const badgeText = entryRes.isTagEscalated
                          ? "Above Reporting Manager"
                          : isStockEntry
                            ? (entry.expenseType === "STOCK_PURCHASE" ? "Stock Purchase Approval" : "1st + CFO Approval Required")
                            : hasLimitConfigured
                              ? `Above ₹${Number(directAccountLimit).toLocaleString("en-IN")} · Approval Required`
                              : "Reporting Manager Approval";
                        return (
                          <View style={[styles.fieldBlock, { marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: "#f1f5f9" }]}>
                            <View style={styles.inputLabelRow}>
                              <Text style={styles.inputLabel}>Reporting Manager</Text>
                              <View style={[styles.badgeSuccess, isEscalated && { backgroundColor: "#fef3c7", borderColor: "#fde68a" }]}>
                                <CheckCircle2 size={12} color={isEscalated ? "#d97706" : "#059669"} />
                                <Text style={[styles.badgeSuccessText, isEscalated && { color: "#b45309" }]}>{badgeText}</Text>
                              </View>
                            </View>
                            <View style={[styles.selectorBox, { backgroundColor: "#f8fafc", borderColor: isEscalated ? "#fcd34d" : "#cbd5e1" }]}>
                              <ShieldCheck size={16} color={isEscalated ? "#d97706" : "#4f46e5"} />
                              <View style={{ flex: 1, marginLeft: 8 }}>
                                <Text style={[styles.selectorText, { color: "#0f172a", fontWeight: "700" }]} numberOfLines={1}>
                                  {loadingReportingManagers
                                    ? "Loading Reporting Manager..."
                                    : resolvedMgr
                                      ? `${resolvedMgr.name}${resolvedMgr.employeeIdCode ? ` (${resolvedMgr.employeeIdCode})` : ""}`
                                      : (currentUser?.reportsTo?.name || currentUser?.reportingManager || currentUser?.approverName || "Assigned Reporting Manager")}
                                </Text>
                                {resolvedMgr && (resolvedMgr.designation || resolvedMgr.department) ? (
                                  <Text style={{ fontSize: 11, color: "#64748b", marginTop: 2 }} numberOfLines={1}>
                                    {[resolvedMgr.designation, resolvedMgr.department].filter(Boolean).join(" · ")}
                                  </Text>
                                ) : null}
                              </View>
                            </View>
                            <Text style={styles.fullPaymentRadioSub}>
                              {entryRes.isTagEscalated
                                ? `${hasLimitConfigured ? `Limit is ₹${Number(directAccountLimit).toLocaleString("en-IN")} — above ₹${Number(directAccountLimit).toLocaleString("en-IN")} pay goes for approval. ` : ""}Because ${entryRes.tagEscalatedFrom || "a Team Lead / Reporting Manager"} is tagged in this claim, this request automatically routes to the above-level Reporting Manager (${resolvedMgr?.name || "higher authority"}). ${isStockEntry ? "After 1st approval, it goes to CFO / Finance Head for 2nd approval, then Accounts." : "After approval it goes to Accounts."}`
                                : hasLimitConfigured
                                  ? `Limit is ₹${Number(directAccountLimit).toLocaleString("en-IN")} — above ₹${Number(directAccountLimit).toLocaleString("en-IN")} pay goes to your Reporting Manager (${resolvedMgr?.name || "Reporting Manager"}) for approval. After approval it goes to Accounts.`
                                  : isStockEntry
                                    ? `${foundType?.name || "This"} claim automatically routes to your Reporting Manager (1st approval) and then CFO / Finance Head (2nd approval) before Accounts.`
                                    : `${foundType?.name || "This"} expense automatically routes to your Reporting Manager based on your department hierarchy. After approval it goes to Accounts.`}
                            </Text>
                          </View>
                        );
                      })()
                    )}

                    {/* In-Card Add Another Entry Button (Only shown on the latest entry) */}
                    {isLast && (
                      <TouchableOpacity
                        style={styles.cardFooterAddBtn}
                        onPress={handleAddEntry}
                        activeOpacity={0.7}
                      >
                        <Plus size={13} color="#4f46e5" />
                        <Text style={styles.cardFooterAddBtnText}>Add Another Expense Entry</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}
            </>
          )}

          {/* Bills / Receipt Proof (Lodging only) + Service Report (Lodging & Normal, hidden when all entries are Local Conveyance or Other expense) */}
          {(needsServiceReport || isLodging) && (
            <View style={styles.itemCard}>
              {isLodging && !isRelativeStay && lodgingNights > 0 && (
                <View style={styles.fieldBlock}>
                  <View style={styles.inputLabelRow}>
                    <Text style={styles.inputLabel}>
                      Hotel Bills / Receipt Proof <Text style={styles.reqStar}>* (Compulsory)</Text>
                    </Text>
                    {attachments.length > 0 ? (
                      <View style={styles.badgeSuccess}>
                        <CheckCircle2 size={12} color="#059669" />
                        <Text style={styles.badgeSuccessText}>{attachments.length} Attached</Text>
                      </View>
                    ) : (
                      <View style={styles.badgeCompulsory}>
                        <AlertCircle size={12} color="#dc2626" />
                        <Text style={styles.badgeCompulsoryText}>Required</Text>
                      </View>
                    )}
                  </View>

                  <View style={styles.attachBtnRow}>
                    <TouchableOpacity
                      style={[styles.attachBtn, attachments.length === 0 && styles.attachBtnRequired]}
                      onPress={() => handlePickAttachment(true, false)}
                      disabled={uploadingProof}
                    >
                      <Camera size={14} color="#4f46e5" />
                      <Text style={styles.attachBtnText}>Camera</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.attachBtn, attachments.length === 0 && styles.attachBtnRequired]}
                      onPress={() => handlePickAttachment(false, false)}
                      disabled={uploadingProof}
                    >
                      <ImageIcon size={14} color="#4f46e5" />
                      <Text style={styles.attachBtnText}>Gallery</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Uploaded Attachments Gallery */}
                  {attachments.map((att, attIdx) => {
                    const resolvedPreview = resolveProofImageUrl(att) || resolveProofImageUrl(att.uri) || att.uri;
                    const isPdf = att.type === "application/pdf" || (att.name && att.name.toLowerCase().endsWith(".pdf"));
                    return (
                      <View key={attIdx} style={styles.attachCard}>
                        <TouchableOpacity
                          style={styles.attachCardBody}
                          activeOpacity={0.7}
                          onPress={() => {
                            if (isPdf && resolvedPreview) {
                              Linking.openURL(resolvedPreview).catch(() => {
                                Alert.alert("Document", "Unable to open document.");
                              });
                            } else if (resolvedPreview) {
                              setPhotoPreviewModal({
                                visible: true,
                                uri: resolvedPreview,
                                title: att.name || `Proof #${attIdx + 1}`,
                              });
                            }
                          }}
                        >
                          {isPdf ? (
                            <View style={styles.attachIconPlaceholder}>
                              <FileText size={20} color="#dc2626" />
                            </View>
                          ) : resolvedPreview ? (
                            <Image source={{ uri: resolvedPreview }} style={styles.attachThumb} resizeMode="cover" />
                          ) : (
                            <View style={styles.attachIconPlaceholder}>
                              <FileCheck size={16} color="#059669" />
                            </View>
                          )}
                          <View style={{ flex: 1, marginLeft: 8 }}>
                            <Text style={styles.attachCardName} numberOfLines={1}>
                              {att.name || `Proof #${attIdx + 1}`}
                            </Text>
                            <Text style={styles.attachCardSub}>
                              {att.isUploading ? "Uploading..." : att.uploadFailed ? "Upload failed • Retry" : isPdf ? "PDF Document • Tap to open" : "Tap to preview"}
                            </Text>
                          </View>
                          <View style={styles.previewEyePill}>
                            <Eye size={12} color="#4f46e5" />
                            <Text style={styles.previewEyeText}>View</Text>
                          </View>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={styles.attachDeleteBtn}
                          onPress={() => removeAttachment(attIdx, false)}
                        >
                          <Trash2 size={14} color="#dc2626" />
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </View>
              )}

              {/* Service Report (* Required) (Multiple Upload) - for Lodging, standard Normal entries, or Visit Local Conveyance */}
              {needsServiceReport && (
                <View style={[styles.fieldBlock, isLodging && !isRelativeStay && { marginTop: 18, paddingTop: 16, borderTopWidth: 1, borderTopColor: "#f1f5f9" }]}>
                  <View style={styles.inputLabelRow}>
                    <Text style={styles.inputLabel}>
                      Service Report <Text style={styles.reqStar}>* (Compulsory)</Text>
                    </Text>
                    {serviceReports.length > 0 ? (
                      <View style={styles.badgeSuccess}>
                        <CheckCircle2 size={12} color="#059669" />
                        <Text style={styles.badgeSuccessText}>{serviceReports.length} Attached</Text>
                      </View>
                    ) : (
                      <View style={styles.badgeCompulsory}>
                        <AlertCircle size={12} color="#dc2626" />
                        <Text style={styles.badgeCompulsoryText}>Required</Text>
                      </View>
                    )}
                  </View>
                  <Text style={{ fontSize: 11, color: "#64748b", marginTop: 2, marginBottom: 8 }}>
                    {!isLodging && normalVisitType === "VISIT"
                      ? "Compulsory for Service Call. Upload service report via live photo or gallery."
                      : "Upload service report (multiple upload) via live photo or gallery."}
                  </Text>

                  <View style={styles.attachBtnRow}>
                    <TouchableOpacity
                      style={[styles.attachBtn, serviceReports.length === 0 && styles.attachBtnRequired]}
                      onPress={() => handlePickServiceReport("camera")}
                      disabled={uploadingServiceReport}
                    >
                      <Camera size={14} color="#4f46e5" />
                      <Text style={styles.attachBtnText} numberOfLines={1}>Live Photo</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.attachBtn, serviceReports.length === 0 && styles.attachBtnRequired]}
                      onPress={() => handlePickServiceReport("gallery")}
                      disabled={uploadingServiceReport}
                    >
                      <ImageIcon size={14} color="#4f46e5" />
                      <Text style={styles.attachBtnText} numberOfLines={1}>Gallery</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Uploaded Service Reports Gallery / Document List */}
                  {serviceReports.map((sr, srIdx) => {
                    const resolvedPreview = resolveProofImageUrl(sr) || resolveProofImageUrl(sr.uri) || sr.uri;
                    const isImg = sr.type && sr.type.startsWith("image/");
                    const isPdf = sr.type === "application/pdf" || (sr.name && sr.name.toLowerCase().endsWith(".pdf"));
                    const isOdf = (sr.name && sr.name.toLowerCase().match(/\.(odt|ods|odp)$/)) || (sr.type && sr.type.includes("opendocument"));
                    return (
                      <View key={srIdx} style={styles.attachCard}>
                        <TouchableOpacity
                          style={styles.attachCardBody}
                          activeOpacity={0.7}
                          onPress={() => {
                            if (!isImg && resolvedPreview) {
                              Linking.openURL(resolvedPreview).catch(() => {
                                Alert.alert("Document", "Unable to open document.");
                              });
                            } else if (resolvedPreview) {
                              setPhotoPreviewModal({
                                visible: true,
                                uri: resolvedPreview,
                                title: sr.name || `Service Report #${srIdx + 1}`,
                              });
                            }
                          }}
                        >
                          {isImg && resolvedPreview ? (
                            <Image source={{ uri: resolvedPreview }} style={styles.attachThumb} resizeMode="cover" />
                          ) : (
                            <View style={[styles.attachIconPlaceholder, isOdf ? { backgroundColor: "#fef3c7" } : isPdf ? { backgroundColor: "#fee2e2" } : {}]}>
                              <FileText size={20} color={isOdf ? "#d97706" : isPdf ? "#dc2626" : "#4f46e5"} />
                            </View>
                          )}
                          <View style={{ flex: 1, marginLeft: 8 }}>
                            <Text style={styles.attachCardName} numberOfLines={1}>
                              {sr.name || `Service Report #${srIdx + 1}`}
                            </Text>
                            <Text style={styles.attachCardSub}>
                              {sr.isUploading
                                ? "Uploading..."
                                : sr.uploadFailed
                                  ? "Upload failed • Retry"
                                  : isImg
                                    ? "Image • Tap to preview"
                                    : isOdf
                                      ? "ODF Document • Tap to open"
                                      : isPdf
                                        ? "PDF Document • Tap to open"
                                        : "Document • Tap to open"}
                            </Text>
                          </View>
                          <View style={styles.previewEyePill}>
                            <Eye size={12} color="#4f46e5" />
                            <Text style={styles.previewEyeText}>View</Text>
                          </View>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={styles.attachDeleteBtn}
                          onPress={() => removeServiceReport(srIdx)}
                        >
                          <Trash2 size={14} color="#dc2626" />
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          )}

          {/* ======================================================== */}
          {/* STEP 5: FULL PAYMENT (Optional)                          */}
          {/* ======================================================== */}
          {!isRelativeStay && (
          <>
          <Text style={styles.sectionTitle}>5. Full Payment (Optional)</Text>

          <View style={styles.itemCard}>
            <TouchableOpacity
              style={styles.fullPaymentRadioRow}
              activeOpacity={0.8}
              onPress={() => {
                setFullPaymentRequested(!fullPaymentRequested);
                if (previewData) setPreviewData(null);
              }}
            >
              <View style={[styles.fullPaymentRadioCircle, fullPaymentRequested && styles.fullPaymentRadioCircleActive]}>
                {fullPaymentRequested ? <View style={styles.radioDot} /> : null}
              </View>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.fullPaymentRadioTitle}>Full Payment</Text>
                <Text style={styles.fullPaymentRadioSub}>
                  Click this if this is a full payment claim. Your Reporting Manager must approve it before Accounts processes payment.
                </Text>
              </View>
            </TouchableOpacity>

            {fullPaymentRequested ? (
              <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: "#f1f5f9" }}>
                <View style={styles.fieldBlock}>
                  <Text style={styles.inputLabel}>
                    Reason for Full Payment <Text style={styles.reqStar}>*</Text>
                  </Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="e.g. Client approved complete reimbursement"
                    placeholderTextColor="#94a3b8"
                    value={fullPaymentReason}
                    onChangeText={(t) => {
                      setFullPaymentReason(t);
                      if (previewData) setPreviewData(null);
                    }}
                  />
                </View>

                {/* Read-only Reporting Manager for Full Payment */}
                {isCurrentUserManagement ? (
                  <View style={[styles.fieldBlock, { marginTop: 14 }]}>
                    <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: "#f0fdf4", paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: "#bbf7d0" }}>
                      <CheckCircle2 size={16} color="#16a34a" />
                      <View style={{ marginLeft: 8, flex: 1 }}>
                        <Text style={{ fontSize: 13, fontWeight: "700", color: "#15803d" }}>Approval Not Applicable</Text>
                        <Text style={{ fontSize: 11, color: "#166534", marginTop: 2 }}>
                          As a Management user, approval is not applicable and your full payment request routes directly to Accounts.
                        </Text>
                      </View>
                    </View>
                  </View>
                ) : (
                  (() => {
                    const fpRes = resolveHierarchyManagerForAmount(totalClaimRequestedAmount);
                    const resolvedMgr = fpRes.approver || reportingManagerApprover;
                    const isEscalated = fpRes.isEscalated || fpRes.isTagEscalated;
                    const badgeText = fpRes.isTagEscalated
                      ? "Above Reporting Manager"
                      : "Reporting Manager Approval";
                    return (
                      <View style={[styles.fieldBlock, { marginTop: 14 }]}>
                        <View style={styles.inputLabelRow}>
                          <Text style={styles.inputLabel}>Reporting Manager</Text>
                          <View style={[styles.badgeSuccess, isEscalated && { backgroundColor: "#fef3c7", borderColor: "#fde68a" }]}>
                            <CheckCircle2 size={12} color={isEscalated ? "#d97706" : "#059669"} />
                            <Text style={[styles.badgeSuccessText, isEscalated && { color: "#b45309" }]}>{badgeText}</Text>
                          </View>
                        </View>
                        <View style={[styles.selectorBox, { backgroundColor: "#f8fafc", borderColor: isEscalated ? "#fcd34d" : "#cbd5e1" }]}>
                          <ShieldCheck size={16} color={isEscalated ? "#d97706" : "#4f46e5"} />
                          <View style={{ flex: 1, marginLeft: 8 }}>
                            <Text style={[styles.selectorText, { color: "#0f172a", fontWeight: "700" }]} numberOfLines={1}>
                              {loadingReportingManagers
                                ? "Loading Reporting Manager..."
                                : resolvedMgr
                                  ? `${resolvedMgr.name}${resolvedMgr.employeeIdCode ? ` (${resolvedMgr.employeeIdCode})` : ""}`
                                  : (currentUser?.reportsTo?.name || currentUser?.reportingManager || currentUser?.approverName || "Assigned Reporting Manager")}
                            </Text>
                            {resolvedMgr && (resolvedMgr.designation || resolvedMgr.department) ? (
                              <Text style={{ fontSize: 11, color: "#64748b", marginTop: 2 }} numberOfLines={1}>
                                {[resolvedMgr.designation, resolvedMgr.department].filter(Boolean).join(" · ")}
                              </Text>
                            ) : null}
                          </View>
                        </View>
                        <Text style={styles.fullPaymentRadioSub}>
                          {fpRes.isTagEscalated
                            ? `Because ${fpRes.tagEscalatedFrom || "a Team Lead / Reporting Manager"} is tagged in this claim, this full payment request automatically routes to the above-level Reporting Manager (${resolvedMgr?.name || "higher authority"}).${cfoApprovalConfig?.enabled !== false && cfoApprovalConfig?.applyOnFullPayment !== false ? " After 1st approval, it goes to CFO / Finance Head for 2nd approval, then Accounts." : " After approval it goes to Accounts."}`
                            : `Your full payment request automatically routes to your Reporting Manager based on your department hierarchy.${cfoApprovalConfig?.enabled !== false && cfoApprovalConfig?.applyOnFullPayment !== false ? " After 1st approval, it goes to CFO / Finance Head for 2nd approval, then Accounts." : " After approval it goes to Accounts."}`}
                        </Text>
                      </View>
                    );
                  })()
                )}
              </View>
            ) : null}
          </View>
          </>
          )}
          {/* ======================================================== */}
          {/* STEP 6: LIVE CALCULATION & PREVIEW BREAKDOWN             */}
          {/* ======================================================== */}
          {previewData && isAllRequiredFilled() ? (
            <View style={styles.previewContainer}>
              <View style={styles.previewHeaderCard}>
                <View style={styles.previewHeaderRow}>
                  <View style={styles.previewIconBox}>
                    <ShieldCheck size={18} color="#ffffff" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.previewMainTitle}>Policy Entitlement Breakdown</Text>
                    <Text style={styles.previewSubTitle}>
                      {isLodging
                        ? `Lodging (${previewData.lodgingNights ?? lodgingNights} Night${(previewData.lodgingNights ?? lodgingNights) === 1 ? "" : "s"}${includeFood ? ` · ${previewData.foodDays ?? foodDays} Food Day${(previewData.foodDays ?? foodDays) === 1 ? "" : "s"}` : ""})`
                        : entries.length > 1
                          ? `${entries.length} Expense Entries (${entries.map((e) => availableNormalExpenseTypes.find((t) => t.code === e.expenseType)?.name || e.expenseType).join(", ")})`
                          : `${availableNormalExpenseTypes.find((t) => t.code === (entries[0]?.expenseType || expenseType))?.name || expenseType} Claim`} · {destinationCity} (Class {previewData.destinationClass || "A"})
                    </Text>
                  </View>
                </View>

                {/* Grand Summary Grid - Policy Limit, Claimed, Allowed, Excess */}
                <View style={styles.grandSummaryGrid}>
                  <View style={styles.grandSummaryCol}>
                    <Text style={styles.grandSummaryLabel}>Policy Limit</Text>
                    <Text style={styles.grandSummaryValLimit} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                      {formatINR(
                        (previewData.grandPolicyLimit !== undefined && previewData.grandPolicyLimit > 0)
                          ? previewData.grandPolicyLimit
                          : (previewData.policyLimit !== undefined && previewData.policyLimit > 0)
                            ? previewData.policyLimit
                            : (previewData.standardAllowedAmount !== undefined
                              ? previewData.standardAllowedAmount
                              : (previewData.allowedAmount || 0))
                      )}
                    </Text>
                  </View>
                  <View style={styles.grandSummaryDivider} />
                  <View style={styles.grandSummaryCol}>
                    <Text style={styles.grandSummaryLabel}>Claimed</Text>
                    <Text style={styles.grandSummaryValClaimed} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                      {formatINR(previewData.requestedAmount || requestedAmount)}
                    </Text>
                  </View>
                  <View style={styles.grandSummaryDivider} />
                  <View style={styles.grandSummaryCol}>
                    <Text style={styles.grandSummaryLabel}>Allowed</Text>
                    <Text style={styles.grandSummaryValAllowed} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                      {formatINR(
                        previewData.standardAllowedAmount !== undefined
                          ? previewData.standardAllowedAmount
                          : previewData.allowedAmount
                      )}
                    </Text>
                  </View>
                  <View style={styles.grandSummaryDivider} />
                  <View style={styles.grandSummaryCol}>
                    <Text style={styles.grandSummaryLabel}>Excess</Text>
                    <Text
                      style={[
                        styles.grandSummaryValClaimed,
                        {
                          color:
                            Number(
                              previewData.standardExcessAmount !== undefined
                                ? previewData.standardExcessAmount
                                : (previewData.excessAmount || 0)
                            ) > 0
                              ? "#f87171"
                              : "#94a3b8",
                        },
                      ]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.75}
                    >
                      {formatINR(
                        previewData.standardExcessAmount !== undefined
                          ? previewData.standardExcessAmount
                          : (previewData.excessAmount || 0)
                      )}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Plain Language Explanation & Applied Rule */}
              {(() => {
                const dispExcess = Number(
                  previewData.standardExcessAmount !== undefined
                    ? previewData.standardExcessAmount
                    : (previewData.excessAmount || 0)
                );
                const dispAllowed = previewData.standardAllowedAmount !== undefined
                  ? previewData.standardAllowedAmount
                  : previewData.allowedAmount;
                const dispLimit = (previewData.grandPolicyLimit !== undefined && previewData.grandPolicyLimit > 0)
                  ? previewData.grandPolicyLimit
                  : (previewData.policyLimit !== undefined && previewData.policyLimit > 0)
                    ? previewData.policyLimit
                    : dispAllowed;
                const dispExplanation = previewData.standardExplanation || previewData.explanation || (
                  dispExcess > 0
                    ? `Policy limit is ${formatINR(dispLimit)} and your claimed bill is ${formatINR(previewData.requestedAmount || requestedAmount)}. Therefore, ${formatINR(dispAllowed)} is allowed and ${formatINR(dispExcess)} is excess beyond policy limit.`
                    : `Policy limit is ${formatINR(dispLimit)}. Your claimed bill of ${formatINR(previewData.requestedAmount || requestedAmount)} is within your limit. 100% fully allowed.`
                );

                return (
                  <View style={[
                    styles.plainExplanationCard,
                    {
                      backgroundColor: dispExcess > 0 ? "#fef2f2" : "#f0fdf4",
                      borderColor: dispExcess > 0 ? "#fecaca" : "#bbf7d0",
                    }
                  ]}>
                    <Text style={{
                      fontSize: 12,
                      color: dispExcess > 0 ? "#991b1b" : "#065f46",
                      fontWeight: "600",
                      lineHeight: 18,
                    }}>
                      💡 {dispExplanation}
                    </Text>
                    {previewData.formula ? (
                      <View style={{ marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: "rgba(0,0,0,0.06)" }}>
                        <Text style={{ fontSize: 11, color: "#64748b", fontWeight: "700" }}>
                          Applied Rule: <Text style={{ fontWeight: "500", color: "#334155" }}>{previewData.formula}</Text>
                        </Text>
                      </View>
                    ) : null}
                  </View>
                );
              })()}

              {/* Shared Food Entitlement Summary (when Food or Lodging+Food is calculated) */}
              {previewData.foodSummary ? (
                <View style={{ backgroundColor: "#ffffff", borderRadius: 12, padding: 12, marginTop: 10, borderWidth: 1, borderColor: "#e2e8f0" }}>
                  <Text style={{ fontSize: 12, fontWeight: "800", color: "#0f172a", marginBottom: 6 }}>
                    Food Allowance Breakdown ({previewData.foodSummary.foodDays || foodDays} Day{(previewData.foodSummary.foodDays || foodDays) === 1 ? "" : "s"})
                  </Text>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 3 }}>
                    <Text style={{ fontSize: 11, color: "#64748b" }}>Period Food Entitlement:</Text>
                    <Text style={{ fontSize: 11, fontWeight: "700", color: "#0f172a" }}>
                      {formatINR(previewData.foodSummary.entitlement ?? previewData.foodSummary.totalPeriodLimit ?? 0)}
                    </Text>
                  </View>
                  {Number(previewData.foodSummary.priorConsumed || 0) > 0 && (
                    <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 3 }}>
                      <Text style={{ fontSize: 11, color: "#dc2626", fontWeight: "600" }}>Previously Claimed Food Allowance:</Text>
                      <Text style={{ fontSize: 11, fontWeight: "700", color: "#dc2626" }}>-{formatINR(previewData.foodSummary.priorConsumed)}</Text>
                    </View>
                  )}
                  <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 3 }}>
                    <Text style={{ fontSize: 11, color: "#059669", fontWeight: "700" }}>Remaining Food Entitlement:</Text>
                    <Text style={{ fontSize: 11, fontWeight: "800", color: "#059669" }}>
                      {formatINR(
                        previewData.foodSummary.remainingBefore ??
                        previewData.foodSummary.totalRemainingLimit ??
                        previewData.foodSummary.entitlement ??
                        previewData.foodSummary.totalPeriodLimit ??
                        0
                      )}
                    </Text>
                  </View>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", paddingTop: 4, borderTopWidth: 1, borderTopColor: "#f1f5f9" }}>
                    <Text style={{ fontSize: 11, color: "#334155" }}>
                      Food Claimed: <Text style={{ fontWeight: "700" }}>{formatINR(previewData.foodSummary.requested ?? previewData.foodSummary.claimedAmount ?? 0)}</Text>
                    </Text>
                    <Text style={{ fontSize: 11, color: "#059669" }}>
                      Allowed: <Text style={{ fontWeight: "700" }}>{formatINR(previewData.foodSummary.allowed ?? previewData.foodSummary.allowedAmount ?? 0)}</Text>
                    </Text>
                    <Text style={{ fontSize: 11, color: Number(previewData.foodSummary.excess ?? previewData.foodSummary.excessAmount ?? 0) > 0 ? "#dc2626" : "#64748b" }}>
                      Excess: <Text style={{ fontWeight: "700" }}>{formatINR(previewData.foodSummary.excess ?? previewData.foodSummary.excessAmount ?? 0)}</Text>
                    </Text>
                  </View>
                </View>
              ) : null}

              {/* Full Payment Special Note Callout Box */}
              {(previewData.fullPaymentRequested || fullPaymentRequested) ? (
                <View style={styles.fullPaymentNoticeBox}>
                  <CheckCircle2 size={16} color="#0284c7" style={{ marginTop: 1 }} />
                  <View style={{ flex: 1, marginLeft: 8 }}>
                    <Text style={styles.fullPaymentNoticeTitle}>Full Payment Benefit</Text>
                    <Text style={styles.fullPaymentNoticeText}>
                      {isCurrentUserManagement
                        ? `Because you are a Management user, approval is not applicable for full payment and the full amount of ${formatINR(previewData.requestedAmount || requestedAmount)} routes directly to Accounts.`
                        : `Because you requested full payment, the full amount of ${formatINR(previewData.requestedAmount || requestedAmount)} becomes payable once ${approver?.name || "your Reporting Manager"} approves it.`}
                    </Text>
                  </View>
                </View>
              ) : null}


            </View>
          ) : null}

          {/* ======================================================== */}
          {/* BOTTOM ACTIONS: CALCULATE, SAVE DRAFT & SUBMIT CLAIM     */}
          {/* ======================================================== */}
          <View style={styles.bottomActions}>
            <TouchableOpacity
              style={styles.previewBtn}
              onPress={handlePreview}
              disabled={previewing || savingDraft || submitting}
            >
              {previewing ? (
                <ActivityIndicator size="small" color="#4f46e5" />
              ) : (
                <>
                  <Calculator size={16} color="#4f46e5" />
                  <Text style={styles.previewBtnText}>Calculate & Preview Breakdown</Text>
                </>
              )}
            </TouchableOpacity>

            <View style={styles.submitRow}>
              {!isEditingSubmittedClaim ? (
                <TouchableOpacity
                  style={styles.draftBtn}
                  onPress={handleSaveDraft}
                  disabled={savingDraft || submitting || previewing}
                >
                  {savingDraft ? (
                    <ActivityIndicator size="small" color="#4f46e5" />
                  ) : (
                    <Text style={styles.draftBtnText}>
                      {isEditingRejectedClaim ? "Save as Draft" : editClaimId ? "Update Draft" : "Save Draft"}
                    </Text>
                  )}
                </TouchableOpacity>
              ) : null}

              <TouchableOpacity
                style={styles.submitBtn}
                onPress={handleSubmit}
                disabled={savingDraft || submitting || previewing}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <>
                    <Send size={16} color="#ffffff" />
                    <Text style={styles.submitBtnText}>
                      {isEditingSubmittedClaim || isEditingRejectedClaim ? "Update & Resubmit" : editClaimId ? "Submit Draft Claim" : "Submit Claim"}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Modal for Employee / City / Count Selection */}
      <Modal
        visible={Boolean(activeModal)}
        transparent
        animationType="slide"
        onRequestClose={() => setActiveModal(null)}
      >
        <TouchableOpacity
          activeOpacity={1}
          style={styles.modalOverlay}
          onPress={() => setActiveModal(null)}
        >
          <TouchableOpacity activeOpacity={1} style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {activeModal?.kind === "type"
                ? typeof activeModal?.targetEntryIndex === "number"
                  ? `Select Expense Type (Entry #${activeModal.targetEntryIndex + 1})`
                  : "Select Expense Type"
                : activeModal?.kind === "conveyanceMode" || activeModal?.kind === "travelMode"
                  ? typeof activeModal?.targetEntryIndex === "number"
                    ? `Select Travel Mode (Entry #${activeModal.targetEntryIndex + 1})`
                    : "Select Travel Mode"
                  : activeModal?.kind === "travelSubtype"
                    ? typeof activeModal?.targetEntryIndex === "number"
                      ? `Select Travel Subtype (Entry #${activeModal.targetEntryIndex + 1})`
                      : "Select Travel Subtype"
                    : activeModal?.kind === "city"
                      ? "Select Destination City"
                      : activeModal?.kind === "count"
                        ? "Number of Employees"
                        : `Select Employee #${(activeModal?.targetSlot ?? 0) + 1}`}
            </Text>

            {activeModal?.kind !== "count" && activeModal?.kind !== "type" && activeModal?.kind !== "conveyanceMode" && activeModal?.kind !== "travelMode" && activeModal?.kind !== "travelSubtype" && (
              <View style={styles.modalSearchRow}>
                <Search size={14} color="#64748b" />
                <TextInput
                  style={styles.modalSearchInput}
                  placeholder={
                    activeModal?.kind === "city"
                      ? "Search city..."
                      : "Search employee by name, ID, dept..."
                  }
                  placeholderTextColor="#94a3b8"
                  value={searchModalQuery}
                  onChangeText={setSearchModalQuery}
                  autoCapitalize={activeModal?.kind === "city" ? "words" : "none"}
                />
              </View>
            )}

            <ScrollView style={{ maxHeight: 320 }} keyboardShouldPersistTaps="handled">
              {activeModal?.kind === "travelMode" ? (
                sanitizeTravelModesList(travelModes).map((mode, modeIdx) => {
                  const targetIdx =
                    typeof activeModal?.targetEntryIndex === "number"
                      ? activeModal.targetEntryIndex
                      : 0;
                  const currentCode = entries[targetIdx]?.travelModeCode || "";
                  const isSelected = String(currentCode).toUpperCase() === String(mode.code).toUpperCase();
                  const activeModeSubs = sanitizeTravelSubtypesList(mode.subtypes);
                  const activeSubCount = activeModeSubs.length;
                  const ModeIcon = getTravelModeIconComponent(mode.code || mode.name);

                  return (
                    <TouchableOpacity
                      key={`tm_${mode._id || mode.code}_${modeIdx}`}
                      style={styles.modalItem}
                      onPress={() => {
                        handleSelectTravelMode(targetIdx, mode);
                        setActiveModal(null);
                      }}
                    >
                      <View
                        style={{
                          width: 34,
                          height: 34,
                          borderRadius: 10,
                          backgroundColor: isSelected ? "#eef2ff" : "#f1f5f9",
                          alignItems: "center",
                          justifyContent: "center",
                          marginRight: 10,
                        }}
                      >
                        <ModeIcon size={17} color={isSelected ? "#4f46e5" : "#475569"} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text
                          style={[
                            styles.modalItemText,
                            isSelected && { color: "#4f46e5", fontWeight: "800" },
                          ]}
                        >
                          {mode.name}
                        </Text>
                        <Text style={styles.modalItemSubtext}>
                          {activeSubCount > 0
                            ? `${activeSubCount} subtype${activeSubCount === 1 ? "" : "s"} (${activeModeSubs.map((s) => s.name).join(", ")})`
                            : "Standard Travel Mode (No subtype selection required)"}
                        </Text>
                      </View>
                      {isSelected && <CheckCircle2 size={16} color="#4f46e5" style={{ marginLeft: 8 }} />}
                    </TouchableOpacity>
                  );
                })
              ) : activeModal?.kind === "travelSubtype" ? (
                (() => {
                  const targetIdx =
                    typeof activeModal?.targetEntryIndex === "number"
                      ? activeModal.targetEntryIndex
                      : 0;
                  const currentModeCode = entries[targetIdx]?.travelModeCode || "";
                  const selectedMode = sanitizeTravelModesList(travelModes).find(
                    (m) => String(m.code).toUpperCase() === String(currentModeCode).toUpperCase()
                  );
                  const subs = sanitizeTravelSubtypesList(selectedMode?.subtypes);
                  const currentSubCode = entries[targetIdx]?.travelSubtypeCode || "";

                  return subs.map((sub, subIdx) => {
                    const isSelected = String(currentSubCode).toUpperCase() === String(sub.code).toUpperCase();
                    const isKm = sub.workflow === "KM_RATE";
                    const rateKey = resolveSubtypeRateKey(selectedMode, sub);
                    const rate = Number(
                      (Number(sub.ratePerKm) > 0 ? sub.ratePerKm : null) ??
                      (Number(selectedMode?.ratePerKm) > 0 ? selectedMode.ratePerKm : null) ??
                      conveyanceRates?.[rateKey] ??
                      0
                    );
                    const subEntStatus = sub.entitlement?.status;
                    const isNotEntitled = sub.entitled === false || subEntStatus === "NOT_ENTITLED";
                    const maxCap = sub.entitlement?.maxAmount ?? sub.maxAllowed;
                    const SubIcon = getTravelModeIconComponent(sub.code || sub.name || selectedMode?.code || selectedMode?.name);

                    return (
                      <TouchableOpacity
                        key={`ts_${selectedMode?.code || "MODE"}_${sub._id || sub.code}_${subIdx}`}
                        style={styles.modalItem}
                        onPress={() => {
                          handleSelectTravelSubtype(targetIdx, selectedMode, sub);
                          setActiveModal(null);
                        }}
                      >
                        <View
                          style={{
                            width: 34,
                            height: 34,
                            borderRadius: 10,
                            backgroundColor: isSelected ? "#eef2ff" : "#f1f5f9",
                            alignItems: "center",
                            justifyContent: "center",
                            marginRight: 10,
                          }}
                        >
                          <SubIcon size={17} color={isSelected ? "#4f46e5" : "#475569"} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text
                            style={[
                              styles.modalItemText,
                              isSelected && { color: "#4f46e5", fontWeight: "800" },
                            ]}
                          >
                            {sub.name}
                          </Text>
                          <Text style={[styles.modalItemSubtext, isNotEntitled && { color: "#dc2626" }]}>
                            {isKm
                              ? `Distance (KM) × ₹${rate}/km Rule`
                              : "Standard Bill & Amount Workflow"}
                            {isNotEntitled
                              ? " · Not in your level entitlement (Excess)"
                              : maxCap !== null && maxCap !== undefined
                                ? ` · Cap: ₹${maxCap}`
                                : ""}
                          </Text>
                        </View>
                        {isKm && rate > 0 && (
                          <View style={[styles.modeRatePill, isSelected && styles.modeRatePillActive, { marginRight: 6 }]}>
                            <Text style={[styles.modeRatePillText, isSelected && styles.modeRatePillTextActive]}>
                              ₹{rate}/km
                            </Text>
                          </View>
                        )}
                        {isSelected && <CheckCircle2 size={16} color="#4f46e5" style={{ marginLeft: 8 }} />}
                      </TouchableOpacity>
                    );
                  });
                })()
              ) : activeModal?.kind === "conveyanceMode" ? (
                CONVEYANCE_MODES.map((mode) => {
                  const Icon = mode.icon;
                  const targetIdx =
                    typeof activeModal?.targetEntryIndex === "number"
                      ? activeModal.targetEntryIndex
                      : 0;
                  const currentSelectedMode = entries[targetIdx]?.vehicle || "twoWheeler";
                  const isSelected =
                    currentSelectedMode === mode.key || currentSelectedMode === mode.code;
                  const rate = getRateForMode(mode.key, conveyanceRates);

                  return (
                    <TouchableOpacity
                      key={mode.key}
                      style={styles.modalItem}
                      onPress={() => {
                        handleSelectVehicleMode(targetIdx, mode.key);
                        setActiveModal(null);
                      }}
                    >
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
                        <View
                          style={[
                            styles.conveyanceIconBox,
                            isSelected && styles.conveyanceIconBoxActive,
                            { width: 34, height: 34, borderRadius: 8, marginBottom: 0 },
                          ]}
                        >
                          <Icon size={18} color={isSelected ? "#4f46e5" : "#64748b"} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text
                            style={[
                              styles.modalItemText,
                              isSelected && { color: "#4f46e5", fontWeight: "800" },
                            ]}
                          >
                            {mode.label}
                          </Text>
                          <Text style={styles.modalItemSubtext}>
                            Petrol / vehicle rate: ₹{rate}/km
                          </Text>
                        </View>
                        <View style={[styles.modeRatePill, isSelected && styles.modeRatePillActive]}>
                          <Text
                            style={[
                              styles.modeRatePillText,
                              isSelected && styles.modeRatePillTextActive,
                            ]}
                          >
                            ₹{rate}/km
                          </Text>
                        </View>
                      </View>
                      {isSelected && <CheckCircle2 size={16} color="#4f46e5" style={{ marginLeft: 8 }} />}
                    </TouchableOpacity>
                  );
                })
              ) : activeModal?.kind === "type" ? (
                availableNormalExpenseTypes.map((t) => {
                  const Icon = t.icon;
                  const targetIdx = activeModal?.targetEntryIndex;
                  const currentSelectedType = typeof targetIdx === "number"
                    ? entries[targetIdx]?.expenseType
                    : expenseType;
                  const isSelected = currentSelectedType === t.code;
                  return (
                    <TouchableOpacity
                      key={t.code}
                      style={styles.modalItem}
                      onPress={() => {
                        if (typeof targetIdx === "number") {
                          handleUpdateEntry(targetIdx, "expenseType", t.code);
                          if (targetIdx === 0) setExpenseType(t.code);
                        } else {
                          setExpenseType(t.code);
                          handleUpdateEntry(0, "expenseType", t.code);
                        }
                        setPreviewData(null);
                        setActiveModal(null);
                      }}
                    >
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
                        <Icon size={16} color={isSelected ? "#4f46e5" : "#64748b"} />
                        <Text
                          style={[
                            styles.modalItemText,
                            isSelected && { color: "#4f46e5", fontWeight: "800" },
                          ]}
                        >
                          {t.name}
                        </Text>
                      </View>
                      {isSelected && <CheckCircle2 size={16} color="#4f46e5" />}
                    </TouchableOpacity>
                  );
                })
              ) : activeModal?.kind === "city" ? (
                citiesList
                  .filter((c) =>
                    String(c.city || "").toLowerCase().includes(searchModalQuery.toLowerCase())
                  )
                  .map((c) => (
                    <TouchableOpacity
                      key={c._id || c.city}
                      style={styles.modalItem}
                      onPress={() => {
                        setDestinationCity(c.city);
                        setPreviewData(null);
                        setActiveModal(null);
                      }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.modalItemText}>{c.city}</Text>
                        <Text style={styles.modalItemSubtext}>Class {c.cityClass || "C"}</Text>
                      </View>
                      {destinationCity === c.city && (
                        <CheckCircle2 size={16} color="#4f46e5" />
                      )}
                    </TouchableOpacity>
                  ))
              ) : activeModal?.kind === "count" ? (
                COUNT_OPTIONS.map((opt) => (
                  <TouchableOpacity
                    key={opt.value}
                    style={styles.modalItem}
                    onPress={() => handleCountSelect(opt.value)}
                  >
                    <Text
                      style={[
                        styles.modalItemText,
                        numberOfEmployees === opt.value && { color: "#4f46e5", fontWeight: "800" },
                      ]}
                    >
                      {opt.label}
                    </Text>
                    {numberOfEmployees === opt.value && (
                      <CheckCircle2 size={16} color="#4f46e5" />
                    )}
                  </TouchableOpacity>
                ))
              ) : (
                (() => {
                  if (loadingEmployees && employeesList.length === 0) {
                    return (
                      <View style={{ padding: 28, alignItems: "center" }}>
                        <ActivityIndicator size="small" color="#4f46e5" />
                        <Text style={{ fontSize: 12, color: "#64748b", marginTop: 8, fontWeight: "600" }}>
                          Loading employee directory...
                        </Text>
                      </View>
                    );
                  }

                  const q = (searchModalQuery || "").trim().toLowerCase();
                  const filtered = employeesList.filter((e) => {
                    return (
                      String(e.name || "").toLowerCase().includes(q) ||
                      String(e.employeeIdCode || e.employeeId || "").toLowerCase().includes(q) ||
                      String(e.department || "").toLowerCase().includes(q) ||
                      String(e.designation || "").toLowerCase().includes(q)
                    );
                  });

                  if (filtered.length === 0) {
                    return (
                      <View style={{ padding: 20, alignItems: "center" }}>
                        <Text style={{ fontSize: 12, color: "#94a3b8" }}>
                          {employeesList.length === 0 ? "Loading employee directory..." : "No matching employees found."}
                        </Text>
                      </View>
                    );
                  }

                  return filtered.slice(0, 100).map((e) => {
                    const isSelectedInTarget =
                      activeModal?.targetSlot !== undefined &&
                      employeeSelections[activeModal.targetSlot]?.employeeId &&
                      String(employeeSelections[activeModal.targetSlot]?.employeeId) === String(e._id || e.id);

                    return (
                      <TouchableOpacity
                        key={e._id || e.id}
                        style={styles.modalItem}
                        onPress={() => handlePickEmployee(e, activeModal.targetSlot)}
                      >
                        <View style={{ flex: 1 }}>
                          <Text
                            style={[
                              styles.modalItemText,
                              isSelectedInTarget && { color: "#4f46e5", fontWeight: "800" },
                            ]}
                          >
                            {e.name}
                          </Text>
                          <Text style={styles.modalItemSubtext}>
                            {e.employeeIdCode ? `${e.employeeIdCode} · ` : ""}
                            {e.designation || "Employee"}{e.department ? ` · ${e.department}` : ""}
                          </Text>
                        </View>
                        {isSelectedInTarget && (
                          <CheckCircle2 size={16} color="#4f46e5" />
                        )}
                      </TouchableOpacity>
                    );
                  });
                })()
              )}
            </ScrollView>

            <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setActiveModal(null)}>
              <Text style={{ color: "#4f46e5", fontWeight: "700" }}>Cancel</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Image Preview Modal */}
      <Modal
        visible={photoPreviewModal.visible}
        transparent
        animationType="fade"
        onRequestClose={() => setPhotoPreviewModal({ visible: false, uri: "", title: "" })}
      >
        <View style={styles.photoModalOverlay}>
          <View style={styles.photoModalContainer}>
            <View style={styles.photoModalHeader}>
              <Text style={styles.photoModalTitle} numberOfLines={1}>
                {photoPreviewModal.title}
              </Text>
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
                <Text style={styles.photoModalNoImgText}>No preview available</Text>
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
  scrollContent: { padding: 16, paddingBottom: 120 },
  sectionTitle: { fontSize: 14, fontWeight: "800", color: "#0f172a", marginTop: 16, marginBottom: 8 },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 16,
    marginBottom: 8,
  },
  reqStar: { color: "#dc2626", fontWeight: "700" },
  fieldBlock: { marginBottom: 12 },
  selectorBox: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    backgroundColor: "#fff",
    marginBottom: 6,
  },
  selectorText: { fontSize: 13, color: "#0f172a", fontWeight: "600" },
  inputLabel: { fontSize: 11, fontWeight: "700", color: "#475569", marginBottom: 6, flexShrink: 1 },
  inputLabelRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 4, marginBottom: 6 },
  charCounter: { fontSize: 10, color: "#64748b", fontWeight: "600" },

  itemCard: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    marginBottom: 8,
  },

  // Multi-Entry Styles
  entryCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 10,
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  entryNumberPill: {
    backgroundColor: "#e0e7ff",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  entryNumberPillText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#4338ca",
  },
  entryCardTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: "#1e293b",
  },
  removeEntryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#fef2f2",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#fecaca",
  },
  removeEntryBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#dc2626",
  },
  headerAddEntryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#4f46e5",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    shadowColor: "#4f46e5",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  headerAddEntryBtnText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#ffffff",
  },
  entryProofBlock: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
  },
  cardFooterAddBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#eef2ff",
    borderRadius: 10,
    paddingVertical: 10,
    marginTop: 8,
    borderWidth: 1.2,
    borderColor: "#c7d2fe",
  },
  cardFooterAddBtnText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#4f46e5",
  },
  addEntryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#4f46e5",
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    shadowColor: "#4f46e5",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  addEntryIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(255, 255, 255, 0.22)",
    alignItems: "center",
    justifyContent: "center",
  },
  addEntryBtnText: {
    fontSize: 14,
    fontWeight: "900",
    color: "#ffffff",
  },
  addEntryBtnSub: {
    fontSize: 11,
    color: "#e0e7ff",
    marginTop: 2,
    fontWeight: "500",
  },
  totalNormalSummaryCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#f0fdf4",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#bbf7d0",
    marginBottom: 10,
  },
  totalNormalSummaryLabel: {
    fontSize: 12,
    fontWeight: "800",
    color: "#166534",
  },
  totalNormalSummarySub: {
    fontSize: 11,
    color: "#15803d",
    marginTop: 1,
  },
  totalNormalSummaryVal: {
    fontSize: 16,
    fontWeight: "900",
    color: "#15803d",
  },
  entryCountBadge: {
    backgroundColor: "#e0e7ff",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  entryCountBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#4338ca",
  },

  textInput: {
    backgroundColor: "#ffffff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: "#0f172a",
  },
  datePickerBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#f8fafc",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  datePickerBtnText: { fontSize: 13, fontWeight: "700", color: "#0f172a" },

  // Count Row & Stepper
  countRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 8,
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    marginBottom: 8,
  },
  subLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#475569",
  },
  countBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#f1f5f9",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  countBtnText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#0f172a",
  },
  stepperWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#ffffff",
    borderRadius: 10,
    padding: 4,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  stepperBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "#eef2ff",
    alignItems: "center",
    justifyContent: "center",
  },
  stepperVal: { fontSize: 14, fontWeight: "800", color: "#0f172a", minWidth: 20, textAlign: "center" },

  // Employee Slot Card
  employeeSlotCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  slotAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#eef2ff",
    alignItems: "center",
    justifyContent: "center",
  },
  slotAvatarText: { fontSize: 11, fontWeight: "900", color: "#4f46e5" },
  slotLabel: { fontSize: 10, color: "#64748b", fontWeight: "700", textTransform: "uppercase" },
  slotName: { fontSize: 13, fontWeight: "800", color: "#0f172a", marginTop: 2 },
  slotMeta: { fontSize: 11, color: "#64748b", marginTop: 1 },
  changeEmpBtn: { backgroundColor: "#f1f5f9", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  changeEmpBtnText: { fontSize: 11, fontWeight: "800", color: "#4f46e5" },

  // Auto Total / Lodging Nights Card
  autoTotalCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#eef2ff",
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: "#c7d2fe",
    marginTop: 10,
  },
  autoTotalLabel: { fontSize: 11, fontWeight: "800", color: "#3730a3", textTransform: "uppercase" },
  autoTotalValue: { fontSize: 12, fontWeight: "700", color: "#4338ca" },

  // Type Cards
  typeCards: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  typeCard: {
    flex: 1,
    minWidth: 100,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#ffffff",
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  typeCardSelected: { backgroundColor: "#eef2ff", borderColor: "#4f46e5" },
  typeCardText: { fontSize: 12, fontWeight: "700", color: "#64748b" },
  typeCardTextSelected: { color: "#4f46e5", fontWeight: "800" },

  radioCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: "#cbd5e1",
    alignItems: "center",
    justifyContent: "center",
  },
  radioCircleActive: {
    borderColor: "#6366f1",
  },
  radioInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#6366f1",
  },

  // Conveyance Mode Styles
  conveyanceContainer: {
    marginTop: 6,
    marginBottom: 6,
  },
  policyRateBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#eef2ff",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#c7d2fe",
  },
  policyRateBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#4338ca",
  },
  conveyanceModesGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 6,
  },
  conveyanceModeCard: {
    width: "48.5%",
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 10,
    borderWidth: 1.5,
    borderColor: "#e2e8f0",
  },
  conveyanceModeCardActive: {
    backgroundColor: "#f5f3ff",
    borderColor: "#6366f1",
  },
  conveyanceCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  conveyanceIconBox: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#f1f5f9",
    alignItems: "center",
    justifyContent: "center",
  },
  conveyanceIconBoxActive: {
    backgroundColor: "#e0e7ff",
  },
  conveyanceModeTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#334155",
  },
  conveyanceModeTitleActive: {
    color: "#4338ca",
    fontWeight: "800",
  },
  modeRatePill: {
    backgroundColor: "#f1f5f9",
    alignSelf: "flex-start",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginTop: 4,
  },
  modeRatePillActive: {
    backgroundColor: "#eef2ff",
    borderWidth: 1,
    borderColor: "#c7d2fe",
  },
  modeRatePillText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#64748b",
  },
  modeRatePillTextActive: {
    color: "#4f46e5",
  },
  kmInputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === "ios" ? 10 : 4,
  },
  kmTextInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: "700",
    color: "#0f172a",
    paddingVertical: 6,
  },
  kmUnitBadge: {
    backgroundColor: "#eef2ff",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#c7d2fe",
  },
  kmUnitBadgeText: {
    fontSize: 11,
    fontWeight: "900",
    color: "#4f46e5",
  },
  inputHint: {
    fontSize: 10,
    color: "#64748b",
    fontWeight: "600",
  },
  calcResultBox: {
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    marginTop: 10,
  },
  calcResultTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  calcResultTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: "#334155",
  },
  calcResultTag: {
    backgroundColor: "#ecfdf5",
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: "#a7f3d0",
  },
  calcResultTagText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#047857",
    textTransform: "uppercase",
  },
  calcFormulaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#ffffff",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  calcFormulaText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748b",
    flex: 1,
  },
  calcAmountBig: {
    fontSize: 16,
    fontWeight: "900",
    color: "#16a34a",
    marginLeft: 8,
  },
  calcHelperText: {
    fontSize: 10,
    color: "#64748b",
    marginTop: 6,
    lineHeight: 14,
  },

  // Barcode Input
  barcodeInputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === "ios" ? 10 : 4,
  },
  barcodeTextInput: {
    flex: 1,
    fontSize: 13,
    color: "#0f172a",
    fontWeight: "600",
    paddingVertical: 6,
  },

  // Attachments
  badgeSuccess: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "#ecfdf5",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#a7f3d0",
  },
  badgeSuccessText: { fontSize: 10, fontWeight: "800", color: "#059669" },
  badgeCompulsory: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "#fef2f2",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#fecaca",
  },
  badgeCompulsoryText: { fontSize: 10, fontWeight: "800", color: "#dc2626" },
  attachBtnRow: { flexDirection: "row", gap: 8, marginTop: 6 },
  attachBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#eef2ff",
    borderRadius: 8,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#c7d2fe",
  },
  attachBtnRequired: { borderColor: "#fca5a5", backgroundColor: "#fff5f5" },
  attachBtnText: { fontSize: 12, fontWeight: "800", color: "#4f46e5" },
  attachCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 12,
    marginTop: 8,
    padding: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  attachCardBody: { flex: 1, flexDirection: "row", alignItems: "center" },
  attachThumb: { width: 44, height: 44, borderRadius: 8, backgroundColor: "#f1f5f9" },
  attachIconPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: "#eef2ff",
    alignItems: "center",
    justifyContent: "center",
  },
  attachCardName: { fontSize: 12, fontWeight: "700", color: "#0f172a" },
  attachCardSub: { fontSize: 10, color: "#64748b", marginTop: 2 },
  previewEyePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "#eef2ff",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginRight: 6,
  },
  previewEyeText: { fontSize: 10, fontWeight: "800", color: "#4f46e5" },
  attachDeleteBtn: { padding: 6 },

  // Full Payment Radio
  fullPaymentRadioRow: { flexDirection: "row", alignItems: "center" },
  fullPaymentRadioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#4f46e5",
    alignItems: "center",
    justifyContent: "center",
  },
  fullPaymentRadioCircleActive: { backgroundColor: "#4f46e5" },
  radioDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#ffffff" },
  fullPaymentRadioTitle: { fontSize: 13, fontWeight: "800", color: "#0f172a" },
  fullPaymentRadioSub: { fontSize: 11, color: "#64748b", marginTop: 1 },

  // Preview Breakdown
  previewContainer: { marginTop: 16 },
  previewHeaderCard: {
    backgroundColor: "#0f172a",
    borderRadius: 16,
    padding: 16,
    marginBottom: 8,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  previewHeaderRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 },
  previewIconBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "#4f46e5",
    alignItems: "center",
    justifyContent: "center",
  },
  previewMainTitle: { fontSize: 14, fontWeight: "900", color: "#ffffff" },
  previewSubTitle: { fontSize: 11, color: "#94a3b8", marginTop: 2 },
  grandSummaryGrid: {
    flexDirection: "row",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 6,
    alignItems: "center",
  },
  grandSummaryCol: { flex: 1, alignItems: "center" },
  grandSummaryDivider: { width: 1, height: 28, backgroundColor: "rgba(255,255,255,0.12)" },
  grandSummaryLabel: { fontSize: 9, color: "#94a3b8", fontWeight: "700", textTransform: "uppercase" },
  grandSummaryValLimit: { fontSize: 13, fontWeight: "900", color: "#60a5fa", marginTop: 2 },
  grandSummaryPerDayText: { fontSize: 9, fontWeight: "700", color: "#93c5fd", marginTop: 1 },
  grandSummaryValClaimed: { fontSize: 13, fontWeight: "900", color: "#ffffff", marginTop: 2 },
  grandSummaryValAllowed: { fontSize: 13, fontWeight: "900", color: "#34d399", marginTop: 2 },
  plainExplanationCard: { padding: 10, borderRadius: 10, marginBottom: 8, borderWidth: 1 },
  fullPaymentNoticeBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#f0f9ff",
    borderWidth: 1,
    borderColor: "#bae6fd",
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
  },
  fullPaymentNoticeTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: "#0369a1",
    marginBottom: 2,
  },
  fullPaymentNoticeText: {
    fontSize: 11,
    color: "#0c4a6e",
    fontWeight: "600",
    lineHeight: 16,
  },
  perEmployeeCard: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  perEmployeeHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  perEmployeeIconBox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: "#e0e7ff",
    alignItems: "center",
    justifyContent: "center",
  },
  perEmployeeTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: "#0f172a",
    letterSpacing: 0.3,
  },
  perEmployeeSubTitle: {
    fontSize: 11,
    color: "#64748b",
    marginTop: 1,
  },
  perEmployeeRowBox: {
    paddingVertical: 8,
  },
  perEmployeeDividerLine: {
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  perEmployeeNameText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0f172a",
  },
  perEmployeeChipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
  },
  perEmployeeChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f8fafc",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  perEmployeeChipLabel: {
    fontSize: 11,
    color: "#64748b",
    fontWeight: "600",
  },
  perEmployeeLimitVal: {
    fontSize: 11,
    color: "#2563eb",
    fontWeight: "800",
  },
  perEmployeeAllowedVal: {
    fontSize: 11,
    color: "#059669",
    fontWeight: "800",
  },
  perEmployeeExcessVal: {
    fontSize: 11,
    color: "#dc2626",
    fontWeight: "800",
  },
  perEmployeeZeroExcessVal: {
    fontSize: 11,
    color: "#16a34a",
    fontWeight: "700",
  },

  // Bottom Actions
  bottomActions: {
    marginTop: 20,
    paddingBottom: 24,
    gap: 10,
  },
  previewBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#eef2ff",
    borderRadius: 12,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: "#c7d2fe",
  },
  previewBtnText: { fontSize: 13, fontWeight: "800", color: "#4f46e5" },
  submitRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  draftBtn: {
    flex: 1,
    minWidth: 125,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#f1f5f9",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: "#cbd5e1",
  },
  draftBtnText: { fontSize: 13, fontWeight: "800", color: "#334155", flexShrink: 1 },
  submitBtn: {
    flex: 1.5,
    minWidth: 155,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#4f46e5",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 10,
  },
  submitBtnText: { fontSize: 14, fontWeight: "800", color: "#ffffff", flexShrink: 1 },

  missingProofBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#fef2f2",
    padding: 10,
    borderRadius: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#fecaca",
  },
  missingProofText: { flex: 1, fontSize: 11, color: "#991b1b", fontWeight: "600", lineHeight: 15 },

  // Modals
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", padding: 20 },
  modalCard: { backgroundColor: "#ffffff", borderRadius: 16, padding: 16, maxHeight: 450 },
  modalTitle: { fontSize: 15, fontWeight: "800", color: "#0f172a", marginBottom: 10 },
  modalSearchRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f8fafc",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    paddingHorizontal: 10,
    marginBottom: 8,
    height: 38,
  },
  modalSearchInput: { flex: 1, marginLeft: 6, fontSize: 13, color: "#0f172a" },
  modalItem: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  modalItemText: { fontSize: 13, fontWeight: "700", color: "#0f172a" },
  modalItemSubtext: { fontSize: 11, color: "#64748b", marginTop: 1 },
  modalCloseBtn: { marginTop: 10, alignItems: "center", paddingVertical: 8 },

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
  },
  photoModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.1)",
  },
  photoModalTitle: { fontSize: 13, fontWeight: "800", color: "#ffffff", flex: 1 },
  photoModalCloseBtn: { padding: 6, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.12)" },
  photoModalBody: { width: "100%", height: 380, backgroundColor: "#020617", alignItems: "center", justifyContent: "center" },
  photoModalImage: { width: "100%", height: "100%" },
  photoModalNoImgText: { fontSize: 12, color: "#94a3b8" },

  // Local Conveyance Visit Options & Service Report
  visitSectionContainer: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
  },
  visitSectionHint: {
    fontSize: 11,
    color: "#64748b",
    marginTop: 2,
    marginBottom: 8,
  },
  badgeVisitActive: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#ecfdf5",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#a7f3d0",
  },
  badgeVisitActiveText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#059669",
  },
  badgeNoVisitActive: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#f1f5f9",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#cbd5e1",
  },
  badgeNoVisitActiveText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#475569",
  },
  visitToggleRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 10,
  },
  visitOptionBtn: {
    flex: 1,
    minWidth: 135,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#ffffff",
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#e2e8f0",
  },
  visitOptionBtnActiveNoVisit: {
    backgroundColor: "#f8fafc",
    borderColor: "#64748b",
  },
  visitOptionBtnActiveVisit: {
    backgroundColor: "#eef2ff",
    borderColor: "#4f46e5",
  },
  visitRadioDotOuter: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: "#cbd5e1",
    alignItems: "center",
    justifyContent: "center",
  },
  visitRadioDotInnerNoVisit: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#475569",
  },
  visitRadioDotInnerVisit: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#4f46e5",
  },
  visitOptionTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#475569",
  },
  visitOptionTitleActiveNoVisit: {
    color: "#0f172a",
    fontWeight: "800",
  },
  visitOptionTitleActiveVisit: {
    color: "#4338ca",
    fontWeight: "800",
  },
  visitOptionSub: {
    fontSize: 10,
    color: "#64748b",
    marginTop: 1,
  },
  noVisitInfoBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: "#f8fafc",
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  noVisitInfoTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: "#334155",
  },
  noVisitInfoText: {
    fontSize: 10,
    color: "#64748b",
    marginTop: 2,
    lineHeight: 14,
  },
  visitInfoBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: "#eef2ff",
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#c7d2fe",
  },
  visitInfoTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: "#3730a3",
  },
  visitInfoText: {
    fontSize: 10,
    color: "#4f46e5",
    marginTop: 2,
    lineHeight: 14,
  },
});

export default CreateExpenseClaimScreen;
