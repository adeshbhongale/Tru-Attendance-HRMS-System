import AsyncStorage from "@react-native-async-storage/async-storage";
import DateTimePicker from "@react-native-community/datetimepicker";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import {
  AlertCircle,
  Barcode,
  BedDouble,
  Bike,
  Calculator,
  Calendar,
  Camera,
  Car,
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
  Plus,
  Receipt,
  Search,
  Send,
  ShieldCheck,
  ShoppingBag,
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
  return diffTime + 1; // inclusive days: e.g. 1st to 3rd = 3 days; 1st to 1st = 1 day
};

const formatINR = (n) => {
  const v = Number(n || 0);
  return `₹${v.toLocaleString("en-IN", { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
};

let cachedCurrentUser = null;
let cachedEmployeesList = [];

const CreateExpenseClaimScreen = ({ navigation, route }) => {
  const initialMode = route.params?.mode || "NORMAL";
  const editClaimId = route.params?.claimId || route.params?.id || route.params?.claim?._id || null;
  const [editingClaimNumber, setEditingClaimNumber] = useState("");
  const [isEditingSubmittedClaim, setIsEditingSubmittedClaim] = useState(false);
  const [isEditingRejectedClaim, setIsEditingRejectedClaim] = useState(false);
  const [rejectionReasonText, setRejectionReasonText] = useState("");

  const [claimMode, setClaimMode] = useState(initialMode);
  const isLogging = claimMode === "LOGGING";

  const [currentUser, setCurrentUser] = useState(cachedCurrentUser);
  const [employeesList, setEmployeesList] = useState(cachedEmployeesList);
  const [loadingEmployees, setLoadingEmployees] = useState(cachedEmployeesList.length === 0);
  const [citiesList, setCitiesList] = useState([]);

  // Normal vs Logging Date fields
  const [claimDate, setClaimDate] = useState(getTodayDateStr());
  const [fromDate, setFromDate] = useState(getTodayDateStr());
  const [toDate, setToDate] = useState(getTodayDateStr());
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

  // Customer & Destination
  const [customerName, setCustomerName] = useState("");
  const [customerId, setCustomerId] = useState(null);
  const [destinationCity, setDestinationCity] = useState(initialMode === "NORMAL" ? "Kolhapur" : "Pune");

  // Expense Details
  const [expenseType, setExpenseType] = useState(isLogging ? "LODGING" : "TRAVEL");
  const [requestedAmount, setRequestedAmount] = useState("");
  const [remark, setRemark] = useState("");

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
      expenseType: initialMode === "LOGGING" ? "LODGING" : "TRAVEL",
      otherSubType: "",
      barcodeNumber: "",
      quantity: "",
      vehicle: "twoWheeler",
      distanceKm: "",
      requestedAmount: "",
      remark: "",
      attachments: [],
    },
  ]);

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
        expenseType: "FOOD",
        otherSubType: "",
        barcodeNumber: "",
        quantity: "",
        vehicle: "twoWheeler",
        distanceKm: "",
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
              requestedAmount: calculatedAmt,
              otherSubType: "",
              barcodeNumber: "",
              quantity: "",
            };
          } else if (value === "OTHER") {
            copy[idx] = {
              ...copy[idx],
              expenseType: value,
              otherSubType: copy[idx].otherSubType || "PURCHASE",
              quantity: copy[idx].quantity || "1",
              vehicle: "",
              distanceKm: "",
            };
          } else {
            copy[idx] = {
              ...copy[idx],
              expenseType: value,
              otherSubType: "",
              barcodeNumber: "",
              quantity: "",
              vehicle: "",
              distanceKm: "",
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

  // Service Reports (Compulsory for Logging claims - multiple upload, any document type, ODF, images, live photo)
  const [serviceReports, setServiceReports] = useState([]); // [{ localId, uri, name, type, size, url, isUploading, uploadFailed }]
  const [uploadingServiceReport, setUploadingServiceReport] = useState(false);

  // Full Payment
  const [fullPaymentRequested, setFullPaymentRequested] = useState(false);
  const [fullPaymentReason, setFullPaymentReason] = useState("");
  const [fullPaymentProofs, setFullPaymentProofs] = useState([]);

  // Modals
  const [activeModal, setActiveModal] = useState(null); // { kind: 'employee' | 'city' | 'customer', targetSlot?: number }
  const [searchModalQuery, setSearchModalQuery] = useState("");
  const [photoPreviewModal, setPhotoPreviewModal] = useState({ visible: false, uri: "", title: "" });

  const submissionRequestId = useRef(newRequestId());
  const scrollViewRef = useRef(null);

  // Calculated days for logging
  const days = useMemo(() => {
    if (!isLogging) return 1;
    return daysBetween(fromDate, toDate);
  }, [isLogging, fromDate, toDate]);

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
        const [cities, , pol] = await Promise.all([
          expenseApi.getCities(),
          expenseApi.searchCustomers(),
          expenseApi.getActivePolicy().catch(() => null),
        ]);

        if (isMounted) {
          setCitiesList(cities || []);
          if (cities && cities.length > 0 && !destinationCity) {
            setDestinationCity(claimMode === "NORMAL" ? "Kolhapur" : (cities[0]?.city || "Pune"));
          }
          if (pol) {
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
            const isSubmitted = ["SUBMITTED", "PENDING", "HR_PENDING", "FULL_PAYMENT_PENDING", "ACCOUNTS_PENDING"].includes(st);
            const isRejected = ["REJECTED", "HR_REJECTED", "ACCOUNTS_REJECTED"].includes(st) || ps === "REJECTED";
            setIsEditingSubmittedClaim(isSubmitted);
            setIsEditingRejectedClaim(isRejected);
            const rejReason = c.rejection?.reason || c.accountsRemarks || c.rejectionReason || "";
            setRejectionReasonText(rejReason);
            const mode = c.claimMode || (c.fromDate && c.toDate ? "LOGGING" : "NORMAL");
            setClaimMode(mode);
            if (c.claimDate) setClaimDate(String(c.claimDate).slice(0, 10));
            if (c.fromDate) setFromDate(String(c.fromDate).slice(0, 10));
            if (c.toDate) setToDate(String(c.toDate).slice(0, 10));

            const empCount = c.numberOfEmployees || c.employeeCount || (c.employeeClaims ? c.employeeClaims.length : 1);
            setNumberOfEmployees(empCount);

            const custName = c.customerName || c.trip?.customerName || "";
            setCustomerName(custName);
            if (c.customerId || c.trip?.customerId) setCustomerId(c.customerId || c.trip?.customerId);

            const destCity = c.destinationCity || c.trip?.destination || "";
            if (destCity) setDestinationCity(destCity);
            else if (mode === "NORMAL") setDestinationCity("Kolhapur");

            const rawType = c.expenseType || c.claimType || c.employeeClaims?.[0]?.items?.[0]?.expenseType || (mode === "LOGGING" ? "LODGING" : "TRAVEL");
            setExpenseType(rawType);

            const amt = c.requestedAmount !== undefined && c.requestedAmount !== null
              ? c.requestedAmount
              : (c.grandRequested || c.amount || "");
            setRequestedAmount(String(amt));
            setRemark(c.remark || c.remarks || c.trip?.purpose || "");

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
                    const expType = entry.expenseType || "TRAVEL";
                    const isEntryOther = expType === "OTHER";
                    const isEntryConv = expType === "CONVEYANCE";
                    return {
                      id: String(entry._id || idx + 1),
                      expenseType: expType,
                      otherSubType: isEntryOther ? (entry.otherSubType || "PURCHASE") : "",
                      barcodeNumber: isEntryOther ? (entry.barcodeNumber || "") : "",
                      quantity: isEntryOther ? String(entry.quantity || 1) : "",
                      vehicle: isEntryConv ? (entry.vehicle || "twoWheeler") : "",
                      distanceKm: isEntryConv && entry.distanceKm !== undefined && entry.distanceKm !== null ? String(entry.distanceKm) : "",
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
                    const itType = it.expenseType || "TRAVEL";
                    const isItOther = itType === "OTHER";
                    const isItConv = itType === "CONVEYANCE";
                    return {
                      id: String(it._id || idx + 1),
                      expenseType: itType,
                      otherSubType: isItOther ? (it.otherSubType || "PURCHASE") : "",
                      barcodeNumber: isItOther ? (it.barcodeNumber || "") : "",
                      quantity: isItOther ? String(it.quantity || 1) : "",
                      vehicle: isItConv ? (it.vehicle || "twoWheeler") : "",
                      distanceKm: isItConv && it.distanceKm !== undefined && it.distanceKm !== null ? String(it.distanceKm) : "",
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
                const isRawOther = rawType === "OTHER";
                const isRawConv = rawType === "CONVEYANCE";
                setEntries([
                  {
                    id: "1",
                    expenseType: rawType,
                    otherSubType: isRawOther ? (singleItem.otherSubType || c.otherSubType || "PURCHASE") : "",
                    barcodeNumber: isRawOther ? (singleItem.barcodeNumber || c.barcodeNumber || "") : "",
                    quantity: isRawOther ? String(singleItem.quantity || c.quantity || 1) : "",
                    vehicle: isRawConv ? (singleItem.vehicle || c.vehicle || "twoWheeler") : "",
                    distanceKm: isRawConv ? (singleItem.distanceKm !== undefined && singleItem.distanceKm !== null ? String(singleItem.distanceKm) : (c.distanceKm ? String(c.distanceKm) : "")) : "",
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

            // Pre-populate bill / receipt attachments (for LOGGING mode or general attachments)
            const allClaimReceipts = (c.receipts && Array.isArray(c.receipts) && c.receipts.length > 0)
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
            if (isFpRequested) {
              setFullPaymentRequested(true);
              setFullPaymentReason(fp.reason || c.fullPaymentReason || "");
              const proofs = (fp.proofs && fp.proofs.length > 0)
                ? fp.proofs
                : (c.fullPaymentProofs && c.fullPaymentProofs.length > 0)
                  ? c.fullPaymentProofs
                  : [];
              if (proofs.length > 0) {
                setFullPaymentProofs(
                  proofs.map((p, pIdx) => {
                    const resolvedUrl = resolveProofImageUrl(p) || p.url || p.uri;
                    return {
                      localId: `srv_fp_${p._id || pIdx}`,
                      uri: resolvedUrl,
                      url: resolvedUrl || p.url,
                      name: p.name || `Approval #${pIdx + 1}`,
                      type: p.type || "application/pdf",
                      size: p.size || 0,
                      isUploading: false,
                    };
                  })
                );
              } else {
                setFullPaymentProofs([]);
              }
            } else {
              setFullPaymentRequested(false);
              setFullPaymentReason("");
              setFullPaymentProofs([]);
            }

            // Pre-populate Service Reports (for LOGGING mode)
            if (c.serviceReports && Array.isArray(c.serviceReports) && c.serviceReports.length > 0) {
              setServiceReports(
                c.serviceReports.map((r, rIdx) => {
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
  const handlePickAttachment = async (useCamera = false, isFullPayment = false, targetEntryIndex = null, targetField = "attachments") => {
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
        const fileName = asset.fileName || (isFullPayment ? `ApprovalDoc_${Date.now()}.jpg` : `Bill_${Date.now()}.jpg`);

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

        if (isFullPayment) {
          setFullPaymentProofs((prev) => [...prev, newFile]);
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
            const uploadPurpose = isFullPayment ? "fullPaymentApproval" : "receipt";
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
              if (isFullPayment) {
                setFullPaymentProofs((prev) =>
                  prev.map((item) =>
                    item.localId === tempId
                      ? { ...item, url: finalUrl, uri: finalUrl, isUploading: false, uploadFailed: false }
                      : item
                  )
                );
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
              if (isFullPayment) {
                setFullPaymentProofs((prev) => prev.map(failUpdate));
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
            if (isFullPayment) {
              setFullPaymentProofs((prev) => prev.map(failUpdate));
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

  const removeAttachment = (attIdx, isFullPayment = false, targetEntryIndex = null, targetField = "attachments") => {
    setPreviewData(null);
    if (isFullPayment) {
      setFullPaymentProofs((prev) => prev.filter((_, i) => i !== attIdx));
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

  // Service Report Document & Live Photo Pickers (Compulsory for Logging claims - multiple upload, ODF, PDF, images, live photo)
  const handlePickServiceReport = async (sourceType = "camera") => {
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
      } else {
        // Document picker: any document type, ODF, PDF, docs, etc.
        const result = await DocumentPicker.getDocumentAsync({
          type: "*/*",
          multiple: true,
          copyToCacheDirectory: true,
        });
        if (result.canceled || !result.assets || !result.assets.length) return;
        assets = result.assets.map((a) => ({
          uri: a.uri,
          name: a.name || `Service_Report_Doc_${Date.now()}`,
          type: a.mimeType || "application/octet-stream",
          size: a.size || 0,
          file: a.file,
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
              setServiceReports((prev) =>
                prev.map((item) =>
                  item.localId === tempId
                    ? { ...item, url: finalUrl, uri: finalUrl, isUploading: false, uploadFailed: false }
                    : item
                )
              );
            } else {
              setServiceReports((prev) =>
                prev.map((item) =>
                  item.localId === tempId ? { ...item, isUploading: false, uploadFailed: true, url: "" } : item
                )
              );
              const errMsg = upRes?.message || "Please check your internet connection and re-upload.";
              Alert.alert("Upload Failed", `Could not upload "${asset.name}".\n\n${errMsg}`);
            }
          } catch {
            setServiceReports((prev) =>
              prev.map((item) =>
                item.localId === tempId ? { ...item, isUploading: false, uploadFailed: true, url: "" } : item
              )
            );
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

  const removeServiceReport = (reportIdx) => {
    setPreviewData(null);
    setServiceReports((prev) => prev.filter((_, i) => i !== reportIdx));
  };

  // Build Payload
  const buildPayload = useCallback(
    (isFinalSubmit = false) => {
      let totalAmt = parseFloat(requestedAmount) || 0;
      let cleanEntries = [];

      if (!isLogging) {
        cleanEntries = entries.map((e) => {
          const entryAtts = (e.attachments || [])
            .map((a) => {
              const finalUrl = a.url || (a.uri && !a.uri.startsWith("file://") && !a.uri.startsWith("content://") ? a.uri : "");
              return { name: a.name, url: finalUrl, type: a.type, size: a.size };
            })
            .filter((a) => a.url);
          const isOther = (e.expenseType || "TRAVEL") === "OTHER";
          const isConv = (e.expenseType || "TRAVEL") === "CONVEYANCE";
          return {
            expenseType: e.expenseType || "TRAVEL",
            otherSubType: isOther ? (e.otherSubType || "PURCHASE") : "",
            barcodeNumber: isOther ? (e.barcodeNumber || "").trim() : "",
            quantity: isOther ? (e.quantity !== undefined && e.quantity !== null && String(e.quantity).trim() !== "" ? String(e.quantity).trim() : "1") : "",
            requestedAmount: parseFloat(e.requestedAmount) || 0,
            remark: (e.remark || "").trim(),
            vehicle: isConv ? (e.vehicle || "twoWheeler").trim() : "",
            distanceKm: isConv ? (parseFloat(e.distanceKm) || 0) : 0,
            receipts: entryAtts,
            attachments: entryAtts,
          };
        });
        totalAmt = cleanEntries.reduce((sum, e) => sum + e.requestedAmount, 0);
      }

      const allEntryReceipts = cleanEntries.flatMap((e) => e.receipts || []);
      const loggingReceipts = attachments
        .map((a) => {
          const finalUrl = a.url || (a.uri && !a.uri.startsWith("file://") && !a.uri.startsWith("content://") ? a.uri : "");
          return { name: a.name, url: finalUrl, type: a.type, size: a.size };
        })
        .filter((a) => a.url);

      const cleanReceipts = isLogging
        ? loggingReceipts
        : (allEntryReceipts.length > 0 ? allEntryReceipts : loggingReceipts);

      const cleanServiceReports = isLogging
        ? serviceReports
          .map((s) => {
            const finalUrl = s.url || (s.uri && !s.uri.startsWith("file://") && !s.uri.startsWith("content://") ? s.uri : "");
            return { name: s.name, url: finalUrl, type: s.type, size: s.size };
          })
          .filter((s) => s.url)
        : [];

      const cleanProofs = fullPaymentRequested
        ? fullPaymentProofs
          .map((p) => {
            const finalUrl = p.url || (p.uri && !p.uri.startsWith("file://") && !p.uri.startsWith("content://") ? p.uri : "");
            return { name: p.name, url: finalUrl, type: p.type, size: p.size };
          })
          .filter((p) => p.url)
        : [];

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
        numberOfEmployees,
        employeeIds: resolvedEmployeeIds,
        customerName: customerName.trim(),
        customerId: customerId || null,
        destinationCity: destinationCity.trim(),
        expenseType: isLogging ? "LODGING" : (entries[0]?.expenseType || expenseType),
        requestedAmount: totalAmt,
        remark: isLogging
          ? remark.trim()
          : (cleanEntries.map((e) => `${e.expenseType}: ${e.remark}`).filter(Boolean).join("; ") || remark.trim()),
        entries: !isLogging && cleanEntries.length > 0 ? cleanEntries : undefined,
        receipts: cleanReceipts,
        serviceReports: cleanServiceReports,
        fullPaymentRequested,
        fullPaymentReason: fullPaymentRequested ? fullPaymentReason.trim() : "",
        fullPaymentProofs: cleanProofs,
        fullPayment: {
          requested: fullPaymentRequested,
          reason: fullPaymentRequested ? fullPaymentReason.trim() : "",
          proofs: cleanProofs,
        },
        submit: isFinalSubmit,
      };

      if (isLogging) {
        payload.fromDate = fromDate;
        payload.toDate = toDate;
        payload.numberOfDays = days;
        payload.numberOfNights = days;
      } else {
        payload.claimDate = claimDate;
      }

      return payload;
    },
    [
      editClaimId,
      claimMode,
      isLogging,
      claimDate,
      fromDate,
      toDate,
      days,
      numberOfEmployees,
      employeeSelections,
      currentUser,
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
      fullPaymentRequested,
      fullPaymentReason,
      fullPaymentProofs,
    ]
  );

  // Helper to verify if all required (*) fields are currently filled
  const isAllRequiredFilled = useCallback(() => {
    const now = new Date();
    const todayY = now.getFullYear();
    const todayM = String(now.getMonth() + 1).padStart(2, "0");
    const todayD = String(now.getDate()).padStart(2, "0");
    const todayStr = `${todayY}-${todayM}-${todayD}`;

    if (isLogging) {
      if (!fromDate || !toDate || fromDate > todayStr || toDate > todayStr || toDate < fromDate) return false;
      if (!expenseType) return false;
      const amt = parseFloat(requestedAmount);
      if (isNaN(amt) || amt <= 0) return false;
      if (!remark || !remark.trim() || remark.trim().length < 5) return false;
      if (!attachments || attachments.length === 0 || attachments.some((a) => a.isUploading)) return false;
      if (!serviceReports || serviceReports.length === 0 || serviceReports.some((s) => s.isUploading)) return false;
    } else {
      if (!claimDate || claimDate > todayStr) return false;
      if (!entries || entries.length === 0) return false;
      const anyInvalid = entries.some((ent) => {
        if (ent.expenseType === "CONVEYANCE") {
          const km = parseFloat(ent.distanceKm);
          const amt = parseFloat(ent.requestedAmount);
          return (
            isNaN(km) ||
            km <= 0 ||
            isNaN(amt) ||
            amt <= 0 ||
            !ent.remark ||
            !ent.remark.trim() ||
            ent.remark.trim().length < 5 ||
            !ent.attachments ||
            ent.attachments.length === 0 ||
            ent.attachments.some((a) => a.isUploading)
          );
        }
        const amt = parseFloat(ent.requestedAmount);
        return (
          !ent.expenseType ||
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
      if (!fullPaymentProofs || fullPaymentProofs.length === 0 || fullPaymentProofs.some((p) => p.isUploading)) return false;
    }

    return true;
  }, [
    isLogging,
    fromDate,
    toDate,
    claimDate,
    expenseType,
    requestedAmount,
    remark,
    attachments,
    serviceReports,
    entries,
    customerName,
    destinationCity,
    employeeSelections,
    numberOfEmployees,
    currentUser,
    fullPaymentRequested,
    fullPaymentReason,
    fullPaymentProofs,
  ]);

  // Validation: Strictly validates that all required (*) fields are filled before previewing calculation, saving draft, or submitting
  const validateForm = () => {
    const now = new Date();
    const todayY = now.getFullYear();
    const todayM = String(now.getMonth() + 1).padStart(2, "0");
    const todayD = String(now.getDate()).padStart(2, "0");
    const todayStr = `${todayY}-${todayM}-${todayD}`;

    if (isLogging) {
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
      if (toDate < fromDate) {
        Alert.alert("Invalid Dates", "To Date cannot be earlier than From Date.");
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

    if (isLogging) {
      if (!expenseType) {
        Alert.alert("Required Field: Expense Type", "Please select the Expense Type.");
        return false;
      }
      const amt = parseFloat(requestedAmount);
      if (isNaN(amt) || amt <= 0) {
        Alert.alert("Required Field: Amount", "Please enter a valid Pay's Value / Amount greater than ₹0.");
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
      if (!attachments || attachments.length === 0) {
        Alert.alert("Required Field: Proofs", "At least one hotel bill or receipt proof is compulsory for lodging stay.");
        return false;
      }
      if (!serviceReports || serviceReports.length === 0) {
        Alert.alert(
          "Required Field: Service Report",
          "Service Report is compulsory for Lodging / Logging claims. Please upload at least one Service Report document or live photo."
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
          if (!ent.vehicle) {
            Alert.alert("Required Field: Vehicle Mode", `Please select a vehicle mode (Bike, Car, E-Bike, or E-Car) for Expense Details #${entryNum}.`);
            return false;
          }
        }
        const amt = parseFloat(ent.requestedAmount);
        if (isNaN(amt) || amt <= 0) {
          Alert.alert(
            "Required Field: Amount",
            ent.expenseType === "CONVEYANCE"
              ? `Please enter a valid distance in KM to calculate conveyance amount for Expense Details #${entryNum}.`
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
        if (ent.expenseType === "OTHER") {
          const subType = (ent.otherSubType || "PURCHASE").toUpperCase();
          if (!subType) {
            Alert.alert("Required Selection: Other Type", `Please select either "Purchase" or "Normal" for Expense Details #${entryNum}.`);
            return false;
          }
          if (subType === "PURCHASE") {
            if (!ent.barcodeNumber || !ent.barcodeNumber.trim()) {
              Alert.alert("Required Field: Barcode", `Barcode number is required for purchase in Expense Details #${entryNum}.`);
              return false;
            }
            if (!ent.quantity || !String(ent.quantity).trim()) {
              Alert.alert("Required Field: Quantity", `Quantity is required for purchase in Expense Details #${entryNum}.`);
              return false;
            }
          }
        }
        if (!ent.attachments || ent.attachments.length === 0) {
          Alert.alert("Required Field: Bill Proof", `Please attach at least one bill or receipt proof for Expense Details #${entryNum}.`);
          return false;
        }
      }
    }

    // While uploading files, wait before preview, draft, or submit
    const anyEntryUploading = !isLogging && entries.some((e) => (e.attachments || []).some((a) => a.isUploading));
    const anyEntryFailed = !isLogging && entries.some((e) => (e.attachments || []).some((a) => a.uploadFailed));
    const anyServiceReportUploading = isLogging && serviceReports.some((s) => s.isUploading);
    const anyServiceReportFailed = isLogging && serviceReports.some((s) => s.uploadFailed);
    if (attachments.some((a) => a.isUploading) || anyEntryUploading || anyServiceReportUploading) {
      Alert.alert("Uploading Documents", "Please wait for your proofs and documents to finish uploading.");
      return false;
    }
    if (attachments.some((a) => a.uploadFailed) || anyEntryFailed || anyServiceReportFailed) {
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
      if (!fullPaymentProofs || fullPaymentProofs.length === 0) {
        Alert.alert("Required Field: Full Payment", "Please attach approval or supporting proof document for full payment.");
        return false;
      }
      if (fullPaymentProofs.some((p) => p.isUploading)) {
        Alert.alert("Uploading Proofs", "Please wait for your full payment approval document to finish uploading.");
        return false;
      }
      if (fullPaymentProofs.some((p) => p.uploadFailed)) {
        Alert.alert("Upload Incomplete", "Full payment approval document failed to upload. Please retry.");
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
          `Claim ID: ${res.data.claimNumber || res.data.claimId || res.data._id || ""}\nStatus: ${res.data.status || "SUBMITTED"}`,
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
        title={editClaimId ? (isEditingRejectedClaim ? (isLogging ? "Resubmit Logging Claim" : "Resubmit Expense Claim") : (isLogging ? "Edit Logging Claim" : "Edit Expense Claim")) : (isLogging ? "Logging Expense Claim" : "New Expense Claim")}
        subtitle={editClaimId ? (editingClaimNumber ? `Claim #${editingClaimNumber}` : "Edit Existing Claim") : (isLogging ? "Lodging Stay Range Form" : "Single Screen Claim Form")}
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
            1. {isLogging ? "Lodging Stay Dates" : "Claim Date"} <Text style={styles.reqStar}>*</Text>
          </Text>

          {isLogging ? (
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
                    <Text style={styles.datePickerBtnText}>{fromDate}</Text>
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
                    <Text style={styles.datePickerBtnText}>{toDate}</Text>
                  </TouchableOpacity>
                </View>
              </View>
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
                <Text style={styles.datePickerBtnText}>{claimDate}</Text>
              </TouchableOpacity>
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
                  const parsed = raw ? new Date(raw) : new Date();
                  return isNaN(parsed.getTime()) ? new Date() : parsed;
                })()
              }
              mode="date"
              display={Platform.OS === "ios" ? "spinner" : "default"}
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
                    if (toDate && toDate < iso) {
                      setToDate(iso);
                    }
                  } else if (picker === "toDate") {
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
                <Text style={styles.datePickerBtnText}>{destinationCity || "Select City"}</Text>
                <ChevronDown size={14} color="#64748b" style={{ marginLeft: "auto" }} />
              </TouchableOpacity>
            </View>
          </View>

          {/* ======================================================== */}
          {/* STEP 4: EXPENSE DETAILS (Type, Amount, Remark)           */}
          {/* ======================================================== */}
          <View style={styles.sectionHeaderRow}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text style={styles.sectionTitle}>
                4. Expense Details <Text style={styles.reqStar}>*</Text>
              </Text>
              {!isLogging && (
                <View style={styles.entryCountBadge}>
                  <Text style={styles.entryCountBadgeText}>
                    {entries.length} {entries.length > 1 ? "Entries" : "Entry"}
                  </Text>
                </View>
              )}
            </View>
            {!isLogging && (
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

          {isLogging ? (
            <View style={styles.itemCard}>
              {/* Expense Type Selector */}
              <View style={styles.fieldBlock}>
                <Text style={styles.inputLabel}>
                  Expense Type <Text style={styles.reqStar}>*</Text>
                </Text>
                <View style={styles.datePickerBtn}>
                  <BedDouble size={16} color="#4f46e5" />
                  <Text style={styles.datePickerBtnText}>Lodging (Hotel Stay)</Text>
                </View>
              </View>

              {/* Pay's Value / Amount */}
              <View style={styles.fieldBlock}>
                <Text style={styles.inputLabel}>
                  Pay's Value / Amount (₹) <Text style={styles.reqStar}>*</Text>
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
              </View>

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
          ) : (
            <>
              {/* Normal Mode: Multiple Expense Entries (#1, #2, etc.) */}
              {entries.map((entry, idx) => {
                const isFirst = idx === 0;
                const isLast = idx === entries.length - 1;
                const entryNum = idx + 1;
                const foundType = NORMAL_EXPENSE_TYPES.find((t) => t.code === entry.expenseType);
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
                        <Text style={styles.datePickerBtnText}>
                          {foundType?.name || "Select Expense Type"}
                        </Text>
                        <ChevronDown size={14} color="#64748b" style={{ marginLeft: "auto" }} />
                      </TouchableOpacity>
                    </View>

                    {/* Other Expense Sub-Type Selection (Purchase vs Normal) */}
                    {entry.expenseType === "OTHER" && (
                      <View style={styles.otherSubTypeContainer}>
                        <Text style={styles.inputLabel}>
                          Choose Other Category <Text style={styles.reqStar}>*</Text>
                        </Text>
                        <View style={styles.otherOptionBoxesRow}>
                          {/* Box 1: Purchase */}
                          <TouchableOpacity
                            activeOpacity={0.8}
                            style={[
                              styles.otherOptionBox,
                              (entry.otherSubType || "PURCHASE") === "PURCHASE" && styles.otherOptionBoxActive,
                            ]}
                            onPress={() => handleUpdateEntry(idx, "otherSubType", "PURCHASE")}
                          >
                            <View style={styles.otherOptionBoxHeader}>
                              <View
                                style={[
                                  styles.radioCircle,
                                  (entry.otherSubType || "PURCHASE") === "PURCHASE" && styles.radioCircleActive,
                                ]}
                              >
                                {(entry.otherSubType || "PURCHASE") === "PURCHASE" && <View style={styles.radioInner} />}
                              </View>
                              <ShoppingBag
                                size={18}
                                color={(entry.otherSubType || "PURCHASE") === "PURCHASE" ? "#4f46e5" : "#64748b"}
                              />
                            </View>
                            <Text
                              style={[
                                styles.otherOptionBoxTitle,
                                (entry.otherSubType || "PURCHASE") === "PURCHASE" && styles.otherOptionBoxTitleActive,
                              ]}
                            >
                              Purchase
                            </Text>
                            <Text style={styles.otherOptionBoxSub}>
                              Barcode & Quantity
                            </Text>
                          </TouchableOpacity>

                          {/* Box 2: Normal */}
                          <TouchableOpacity
                            activeOpacity={0.8}
                            style={[
                              styles.otherOptionBox,
                              entry.otherSubType === "NORMAL" && styles.otherOptionBoxActive,
                            ]}
                            onPress={() => handleUpdateEntry(idx, "otherSubType", "NORMAL")}
                          >
                            <View style={styles.otherOptionBoxHeader}>
                              <View
                                style={[
                                  styles.radioCircle,
                                  entry.otherSubType === "NORMAL" && styles.radioCircleActive,
                                ]}
                              >
                                {entry.otherSubType === "NORMAL" && <View style={styles.radioInner} />}
                              </View>
                              <FileText
                                size={18}
                                color={entry.otherSubType === "NORMAL" ? "#4f46e5" : "#64748b"}
                              />
                            </View>
                            <Text
                              style={[
                                styles.otherOptionBoxTitle,
                                entry.otherSubType === "NORMAL" && styles.otherOptionBoxTitleActive,
                              ]}
                            >
                              Normal
                            </Text>
                            <Text style={styles.otherOptionBoxSub}>
                              Standard expense
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    )}

                    {/* Purchase Fields: Barcode Number & Quantity */}
                    {entry.expenseType === "OTHER" && (entry.otherSubType || "PURCHASE") === "PURCHASE" && (
                      <View style={{ gap: 10, marginBottom: 4 }}>
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
                              value={entry.quantity !== undefined ? String(entry.quantity) : "1"}
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
                    ) : (
                      /* Pay's Value / Amount for non-conveyance expense types */
                      <View style={styles.fieldBlock}>
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

                    {/* Bill Proof Upload for THIS Entry */}
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

          {/* Bills / Receipt Proof Upload Section (Only for Logging Mode) */}
          {isLogging && (
            <View style={styles.itemCard}>
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

              {/* Service Report (* Required) (Multiple Upload) - Last field below bill field */}
              <View style={[styles.fieldBlock, { marginTop: 18, paddingTop: 16, borderTopWidth: 1, borderTopColor: "#f1f5f9" }]}>
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
                  Upload service report (multiple upload). Accepts any document type, ODF, PDF, images, or live photo.
                </Text>

                <View style={styles.attachBtnRow}>
                  <TouchableOpacity
                    style={[styles.attachBtn, serviceReports.length === 0 && styles.attachBtnRequired]}
                    onPress={() => handlePickServiceReport("camera")}
                    disabled={uploadingServiceReport}
                  >
                    <Camera size={14} color="#4f46e5" />
                    <Text style={[styles.attachBtnText, { fontSize: 11 }]} numberOfLines={1}>Live Photo</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.attachBtn, serviceReports.length === 0 && styles.attachBtnRequired]}
                    onPress={() => handlePickServiceReport("gallery")}
                    disabled={uploadingServiceReport}
                  >
                    <ImageIcon size={14} color="#4f46e5" />
                    <Text style={[styles.attachBtnText, { fontSize: 11 }]} numberOfLines={1}>Gallery</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.attachBtn, serviceReports.length === 0 && styles.attachBtnRequired]}
                    onPress={() => handlePickServiceReport("document")}
                    disabled={uploadingServiceReport}
                  >
                    <FileText size={14} color="#4f46e5" />
                    <Text style={[styles.attachBtnText, { fontSize: 11 }]} numberOfLines={1}>Documents</Text>
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
            </View>
          )}

          {/* ======================================================== */}
          {/* STEP 5: FULL PAYMENT (Optional)                          */}
          {/* ======================================================== */}
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
                  Click this if this is a full payment claim. Accounts will review your proofs and process payment directly.
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

                <View style={styles.fieldBlock}>
                  <Text style={styles.inputLabel}>
                    Approval / Proof Document <Text style={styles.reqStar}>*</Text>
                  </Text>
                  <View style={styles.attachBtnRow}>
                    <TouchableOpacity
                      style={styles.attachBtn}
                      onPress={() => handlePickAttachment(true, true)}
                    >
                      <Camera size={14} color="#4f46e5" />
                      <Text style={styles.attachBtnText}>Camera</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.attachBtn}
                      onPress={() => handlePickAttachment(false, true)}
                    >
                      <ImageIcon size={14} color="#4f46e5" />
                      <Text style={styles.attachBtnText}>Gallery</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Uploaded Full Payment Approval Proofs */}
                  {fullPaymentProofs.map((fp, fpIdx) => {
                    const resolvedPreview = resolveProofImageUrl(fp) || resolveProofImageUrl(fp.uri) || fp.uri;
                    const isPdf = fp.type === "application/pdf" || (fp.name && fp.name.toLowerCase().endsWith(".pdf"));
                    return (
                      <View key={fpIdx} style={styles.attachCard}>
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
                                title: fp.name || `Approval #${fpIdx + 1}`,
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
                              {fp.name || `Approval #${fpIdx + 1}`}
                            </Text>
                            <Text style={styles.attachCardSub}>
                              {fp.isUploading ? "Uploading..." : fp.uploadFailed ? "Upload failed • Retry" : isPdf ? "PDF Document • Tap to open" : "Tap to preview"}
                            </Text>
                          </View>
                          <View style={styles.previewEyePill}>
                            <Eye size={12} color="#4f46e5" />
                            <Text style={styles.previewEyeText}>View</Text>
                          </View>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={styles.attachDeleteBtn}
                          onPress={() => removeAttachment(fpIdx, true)}
                        >
                          <Trash2 size={14} color="#dc2626" />
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </View>
              </View>
            ) : null}
          </View>

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
                      {isLogging
                        ? `Lodging (${previewData.numberOfDays || previewData.numberOfNights || days} Day${(previewData.numberOfDays || previewData.numberOfNights || days) > 1 ? "s" : ""})`
                        : entries.length > 1
                          ? `${entries.length} Expense Entries (${entries.map((e) => NORMAL_EXPENSE_TYPES.find((t) => t.code === e.expenseType)?.name || e.expenseType).join(", ")})`
                          : `${NORMAL_EXPENSE_TYPES.find((t) => t.code === (entries[0]?.expenseType || expenseType))?.name || expenseType} Claim`} · {destinationCity} (Class {previewData.destinationClass || "A"})
                    </Text>
                  </View>
                </View>

                {/* Grand Summary Grid - Policy Limit, Claimed, Allowed, Excess */}
                <View style={styles.grandSummaryGrid}>
                  <View style={styles.grandSummaryCol}>
                    <Text style={styles.grandSummaryLabel}>Policy Limit</Text>
                    <Text style={styles.grandSummaryValLimit} numberOfLines={1}>
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
                    <Text style={styles.grandSummaryValClaimed} numberOfLines={1}>
                      {formatINR(previewData.requestedAmount || requestedAmount)}
                    </Text>
                  </View>
                  <View style={styles.grandSummaryDivider} />
                  <View style={styles.grandSummaryCol}>
                    <Text style={styles.grandSummaryLabel}>Allowed</Text>
                    <Text style={styles.grandSummaryValAllowed} numberOfLines={1}>
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

              {/* Full Payment Special Note Callout Box */}
              {(previewData.fullPaymentRequested || fullPaymentRequested) ? (
                <View style={styles.fullPaymentNoticeBox}>
                  <CheckCircle2 size={16} color="#0284c7" style={{ marginTop: 1 }} />
                  <View style={{ flex: 1, marginLeft: 8 }}>
                    <Text style={styles.fullPaymentNoticeTitle}>Full Payment Benefit</Text>
                    <Text style={styles.fullPaymentNoticeText}>
                      Because you requested full payment, the full amount of {formatINR(previewData.requestedAmount || requestedAmount)} will be reviewed directly by Accounts for payment.
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
              <TouchableOpacity
                style={styles.draftBtn}
                onPress={handleSaveDraft}
                disabled={savingDraft || submitting || previewing}
              >
                {savingDraft ? (
                  <ActivityIndicator size="small" color="#4f46e5" />
                ) : (
                  <Text style={styles.draftBtnText}>
                    {isEditingSubmittedClaim ? "Update Claim" : isEditingRejectedClaim ? "Save as Draft" : editClaimId ? "Update Draft" : "Save Draft"}
                  </Text>
                )}
              </TouchableOpacity>

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
                : activeModal?.kind === "conveyanceMode"
                  ? typeof activeModal?.targetEntryIndex === "number"
                    ? `Select Travel Mode (Entry #${activeModal.targetEntryIndex + 1})`
                    : "Select Travel Mode"
                  : activeModal?.kind === "city"
                    ? "Select Destination City"
                    : activeModal?.kind === "count"
                      ? "Number of Employees"
                      : `Select Employee #${(activeModal?.targetSlot ?? 0) + 1}`}
            </Text>

            {activeModal?.kind !== "count" && activeModal?.kind !== "type" && activeModal?.kind !== "conveyanceMode" && (
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
              {activeModal?.kind === "conveyanceMode" ? (
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
                NORMAL_EXPENSE_TYPES.map((t) => {
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
  inputLabel: { fontSize: 11, fontWeight: "700", color: "#475569", marginBottom: 6 },
  inputLabelRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
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

  // Other Expense Sub-Type Selection (Purchase vs Normal)
  otherSubTypeContainer: {
    marginTop: 8,
    marginBottom: 4,
  },
  otherOptionBoxesRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 6,
  },
  otherOptionBox: {
    flex: 1,
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1.5,
    borderColor: "#e2e8f0",
  },
  otherOptionBoxActive: {
    backgroundColor: "#f5f3ff",
    borderColor: "#6366f1",
  },
  otherOptionBoxHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
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
  otherOptionBoxTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#334155",
  },
  otherOptionBoxTitleActive: {
    color: "#4338ca",
    fontWeight: "800",
  },
  otherOptionBoxSub: {
    fontSize: 10,
    color: "#64748b",
    marginTop: 2,
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
  submitRow: { flexDirection: "row", gap: 10 },
  draftBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#f1f5f9",
    borderRadius: 12,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: "#cbd5e1",
  },
  draftBtnText: { fontSize: 13, fontWeight: "800", color: "#334155" },
  submitBtn: {
    flex: 1.5,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#4f46e5",
    borderRadius: 12,
    paddingVertical: 14,
  },
  submitBtnText: { fontSize: 14, fontWeight: "800", color: "#ffffff" },

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
});

export default CreateExpenseClaimScreen;
