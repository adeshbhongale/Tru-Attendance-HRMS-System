import AsyncStorage from "@react-native-async-storage/async-storage";
import DateTimePicker from "@react-native-community/datetimepicker";
import * as ImagePicker from "expo-image-picker";
import {
  AlertCircle,
  Building2,
  Calculator,
  Calendar,
  Camera,
  CheckCircle2,
  ChevronDown,
  Eye,
  FileCheck,
  Image as ImageIcon,
  Info,
  MapPin,
  Plus,
  Receipt,
  Search,
  Send,
  ShieldCheck,
  Trash2,
  User as UserIcon,
  Users,
  X
} from "lucide-react-native";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import expenseApi from "../api/expenseApi";
import ExpenseHeader from "../components/ExpenseHeader";

const EXPENSE_TYPES = [
  { code: "LODGING", name: "Lodging" },
  { code: "FOOD", name: "Food" },
  { code: "CONVEYANCE", name: "Local Conveyance" },
  { code: "TRAVEL", name: "Travel" },
  { code: "OTHER", name: "Other" },
];

const VEHICLES = [
  { value: "twoWheeler", label: "Two-Wheeler (₹3.50/km)", rate: 3.5 },
  { value: "car", label: "Car (₹5.00/km)", rate: 5.0 },
  { value: "eBike", label: "E-Bike (₹1.00/km)", rate: 1.0 },
  { value: "eCar", label: "E-Car (₹1.75/km)", rate: 1.75 },
  { value: "company", label: "Company Vehicle (actual w/ bill)", rate: 0 },
  { value: "other", label: "Other", rate: 0 },
];

const VEHICLE_RATES = {
  twoWheeler: 3.5,
  car: 5.0,
  eBike: 1.0,
  eCar: 1.75,
  company: 0,
  other: 0,
};

const getVehicleRate = (v) => {
  return VEHICLE_RATES[v] ?? 5.0;
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

const calculateConveyanceAmount = (vehicle, distanceKm) => {
  const rate = getVehicleRate(vehicle);
  if (rate > 0 && distanceKm && !isNaN(Number(distanceKm)) && Number(distanceKm) > 0) {
    return String(Math.round(Number(distanceKm) * rate * 100) / 100);
  }
  return "";
};

const getCityClassColor = (cClass) => {
  switch (cClass) {
    case "A+": return "#e11d48";
    case "A": return "#d97706";
    case "B": return "#2563eb";
    default: return "#475569";
  }
};

const getCityClassBg = (cClass) => {
  switch (cClass) {
    case "A+": return "#ffe4e6";
    case "A": return "#fef3c7";
    case "B": return "#dbeafe";
    default: return "#f1f5f9";
  }
};

const initialItem = () => ({
  date: getTodayDateStr(),
  amount: "",
  employeeAmounts: {},
  mode: "",
  vehicle: "car",
  distanceKm: "",
  description: "",
  note: "",
  days: "1",
  attachments: [],
});

const CreateExpenseClaimScreen = ({ navigation, route }) => {
  const { claimId } = route.params || {};
  const [loading, setLoading] = useState(true);
  const [loginUser, setLoginUser] = useState(null);
  const [types, setTypes] = useState([]);
  const [travelModes, setTravelModes] = useState([]);
  const [cities, setCities] = useState([]);
  const [selectedCity, setSelectedCity] = useState("Mumbai");
  const [citySearchText, setCitySearchText] = useState("");
  const [employeeSearchText, setEmployeeSearchText] = useState("");
  const [employeeOptions, setEmployeeOptions] = useState([]);
  const [employeeOptionsLoaded, setEmployeeOptionsLoaded] = useState(false);

  const [activePolicy, setActivePolicy] = useState(null);

  // Claim-level state (one expense type per claim)
  const [claimType, setClaimType] = useState("");
  const [employeeCount, setEmployeeCount] = useState(1);
  const [employeeSelections, setEmployeeSelections] = useState([]); // [{employeeId, label, isSelf}]

  // Unified items list (filled once, applies to all selected employees based on rules)
  const [expenseItems, setExpenseItems] = useState([initialItem()]);

  const [preview, setPreview] = useState(null);
  const [previewing, setPreviewing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploadingProof, setUploadingProof] = useState(false);
  const [photoPreviewModal, setPhotoPreviewModal] = useState({ visible: false, uri: "", title: "" });
  const [modal, setModal] = useState(null); // { kind, itemIdx, targetIndex }
  const [activeDatePickerIdx, setActiveDatePickerIdx] = useState(null);

  const isMultiEmployee = employeeCount >= 2;
  const isSharedLodging = claimType === "LODGING" && isMultiEmployee;
  const isConveyance = claimType === "CONVEYANCE";

  useEffect(() => {
    const init = async () => {
      try {
        const userStr = await AsyncStorage.getItem("user");
        let user = null;
        if (userStr) {
          try { user = JSON.parse(userStr); } catch (_) { }
        }
        if (!user) {
          const me = await (await import("../../../../api/axios")).default.get("/auth/me");
          user = me.data?.data || me.data?.user || me.data || null;
        }
        setLoginUser(user);

        const [typeRes, modeRes, cityRes, policyRes, empRes] = await Promise.all([
          expenseApi.getTypes(),
          expenseApi.getTravelModes(),
          expenseApi.getCities(),
          expenseApi.getActivePolicy(),
          expenseApi.getEmployees(),
        ]);
        if (typeRes && typeRes.length > 0) setTypes(typeRes);
        if (modeRes && modeRes.length > 0) setTravelModes(modeRes);
        if (policyRes) setActivePolicy(policyRes);
        if (empRes && Array.isArray(empRes)) {
          setEmployeeOptions(empRes);
          setEmployeeOptionsLoaded(true);
        }
        if (cityRes && cityRes.length > 0) {
          setCities(cityRes);
          if (!claimId && cityRes[0]?.city) {
            setSelectedCity(cityRes[0].city);
          }
        }

        const selfId = user?._id || user?.id || null;
        const selfLabel = user?.name || "Myself";

        if (claimId) {
          // Load existing draft claim for editing
          const existingClaim = await expenseApi.getClaimById(claimId);
          if (existingClaim) {
            const EDITABLE_STATUSES = ["DRAFT", "RETURNED", "REJECTED", "ACCOUNTS_REJECTED", "HR_REJECTED"];
            if (!EDITABLE_STATUSES.includes(existingClaim.status)) {
              Alert.alert(
                "Cannot Edit",
                `Only draft or rejected claims can be edited. This claim is already ${existingClaim.status === "DISBURSED" ? "Paid" : "Pending"}.`,
                [{ text: "OK", onPress: () => navigation.goBack() }]
              );
              return;
            }

            if (existingClaim.trip?.destination) {
              setSelectedCity(existingClaim.trip.destination);
            }

            const cType = (
              existingClaim.claimType ||
              existingClaim.employeeClaims?.[0]?.items?.[0]?.expenseType ||
              "OTHER"
            ).toUpperCase();
            setClaimType(cType);

            const empCount = existingClaim.employeeCount || existingClaim.employeeClaims?.length || 1;
            setEmployeeCount(empCount);

            const selections = (existingClaim.employeeClaims || []).map((ec, idx) => ({
              employeeId: ec.employee?.employeeId || ec.employee?._id || ec.claimedBy || (idx === 0 ? selfId : null),
              label: ec.employee?.name || (idx === 0 ? selfLabel : `Employee #${idx + 1}`),
              isSelf: idx === 0,
            }));
            if (selections.length > 0) {
              setEmployeeSelections(selections);
            }

            // Extract items from primary employee claim
            const rawItems = existingClaim.employeeClaims?.[0]?.items || [];
            if (rawItems.length > 0) {
              const loadedItems = rawItems.map((it, itIdx) => {
                const empAmounts = {};
                (existingClaim.employeeClaims || []).forEach((ec) => {
                  const empId = ec.employee?.employeeId || ec.employee?._id || ec.claimedBy;
                  if (empId) {
                    const matchedItem = ec.items?.[itIdx];
                    if (matchedItem) {
                      empAmounts[empId] = String(matchedItem.requestedAmount || matchedItem.amount || "");
                    }
                  }
                });

                const totalItemAmt = (cType !== "LODGING" && empCount > 1)
                  ? Object.values(empAmounts).reduce((sum, v) => sum + (Number(v) || 0), 0) || (Number(it.requestedAmount || it.amount || 0) * empCount)
                  : Number(it.requestedAmount || it.amount || 0);
                const totalDist = (cType === "CONVEYANCE" && empCount > 1 && it.distanceKm)
                  ? (Number(it.distanceKm) * empCount)
                  : Number(it.distanceKm || 0);

                return {
                  date: it.expenseDate ? String(it.expenseDate).slice(0, 10) : getTodayDateStr(),
                  amount: totalItemAmt ? String(totalItemAmt) : "",
                  employeeAmounts: empAmounts,
                  mode: it.mode || "",
                  vehicle: it.vehicle || "car",
                  distanceKm: totalDist ? String(totalDist) : "",
                  description: it.description || "",
                  note: it.note || it.description || "",
                  days: it.days ? String(it.days) : "1",
                  attachments: it.attachments || [],
                };
              });
              setExpenseItems(loadedItems);
            }
          }
        } else {
          // Initialize fresh claim
          if (selfId) {
            setEmployeeSelections([{ employeeId: selfId, label: selfLabel, isSelf: true }]);
          }
        }
      } catch (err) {
        console.warn("Expense init error", err);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [claimId]);

  const loadEmployeeOptions = async () => {
    if (employeeOptionsLoaded) return;
    const list = await expenseApi.getEmployees();
    setEmployeeOptions(list);
    setEmployeeOptionsLoaded(true);
  };

  const getSelectedCityClass = (cityName = selectedCity) => {
    if (!cityName) return "C";
    const clean = cityName.trim().toUpperCase();
    const found = cities.find(
      (c) => (c.city || "").toUpperCase() === clean ||
        (Array.isArray(c.aliases) && c.aliases.map(a => String(a).toUpperCase()).includes(clean))
    );
    return found ? found.cityClass : "C";
  };

  const handleEmployeeCountChange = (count) => {
    setEmployeeCount(count);
    const selfId = loginUser?._id || loginUser?.id;
    const selfLabel = loginUser?.name || "Myself";
    const next = [{ employeeId: selfId, label: selfLabel, isSelf: true }];
    for (let i = 1; i < count; i++) {
      const prev = employeeSelections[i];
      next.push(prev && prev.employeeId ? prev : { employeeId: null, label: "", isSelf: false });
    }
    setEmployeeSelections(next);
    setPreview(null);
  };

  const pickEmployee = (emp, targetSlot = null) => {
    const isAlreadySelected = employeeSelections.some(
      (s, idx) => s.employeeId && String(s.employeeId) === String(emp._id) && idx !== targetSlot
    );
    if (isAlreadySelected) {
      Alert.alert("Already Selected", `${emp.name} is already added in this claim.`);
      return;
    }

    setEmployeeSelections((prev) => {
      const copy = [...prev];
      const slot = targetSlot !== null ? targetSlot : copy.findIndex((s) => !s.employeeId);
      const target = slot >= 0 ? slot : copy.length;
      copy[target] = {
        employeeId: emp._id,
        label: emp.name,
        isSelf: false,
      };
      return copy;
    });

    setModal(null);
    setPreview(null);
  };

  const addItem = () => {
    setExpenseItems((prev) => [...prev, initialItem()]);
    setPreview(null);
  };

  const removeItem = (index) => {
    if (expenseItems.length <= 1) {
      Alert.alert("Cannot Remove", "At least one expense item is required.");
      return;
    }
    setExpenseItems((prev) => prev.filter((_, i) => i !== index));
    setPreview(null);
  };

  const updateItem = (index, field, value) => {
    setExpenseItems((prev) => {
      const next = [...prev];
      const updated = { ...next[index], [field]: value };
      if (claimType === "CONVEYANCE") {
        if (field === "distanceKm" || field === "vehicle") {
          const veh = field === "vehicle" ? value : updated.vehicle;
          const dist = field === "distanceKm" ? value : updated.distanceKm;
          const calculated = calculateConveyanceAmount(veh, dist);
          if (calculated) {
            updated.amount = calculated;
          }
        }
      }
      next[index] = updated;
      return next;
    });
    setPreview(null);
  };

  const updateItemEmployeeAmount = (itemIdx, empId, val) => {
    setExpenseItems((prev) => {
      const next = [...prev];
      const item = next[itemIdx] || {};
      const currentMap = { ...(item.employeeAmounts || {}) };
      currentMap[empId] = val;

      const total = employeeSelections
        .filter((s) => s.employeeId)
        .reduce((sum, s) => sum + (Number(currentMap[s.employeeId]) || 0), 0);

      next[itemIdx] = {
        ...item,
        employeeAmounts: currentMap,
        amount: total > 0 ? String(total) : "",
      };
      return next;
    });
    setPreview(null);
  };

  const addAttachmentToItem = (itemIdx, newAttachment) => {
    setExpenseItems((prev) => {
      const next = [...prev];
      const item = next[itemIdx] || {};
      next[itemIdx] = {
        ...item,
        attachments: [...(item.attachments || []), newAttachment],
      };
      return next;
    });
    setPreview(null);
  };

  const removeAttachmentFromItem = (itemIdx, attachIdx) => {
    setExpenseItems((prev) => {
      const next = [...prev];
      const item = next[itemIdx] || {};
      next[itemIdx] = {
        ...item,
        attachments: (item.attachments || []).filter((_, i) => i !== attachIdx),
      };
      return next;
    });
    setPreview(null);
  };

  const handlePickProof = async (itemIdx, useCamera = false) => {
    try {
      let result;
      if (useCamera) {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== "granted") {
          Alert.alert("Permission Required", "Camera permission is required to capture bills.");
          return;
        }
        result = await ImagePicker.launchCameraAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 0.6,
          base64: true,
        });
      } else {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== "granted") {
          Alert.alert("Permission Required", "Gallery permission is required to select bills.");
          return;
        }
        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 0.6,
          base64: true,
        });
      }

      if (result.canceled || !result.assets || !result.assets[0]) return;

      const asset = result.assets[0];
      const base64Data = asset.base64
        ? `data:${asset.mimeType || "image/jpeg"};base64,${asset.base64}`
        : asset.uri;

      const tempId = `proof_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      const fileNameWebp = (asset.fileName || "receipt_proof").replace(/\.[^/.]+$/, "") + ".webp";

      // 1. Instantly attach locally so calculation preview and submission are unblocked without waiting
      const localAttachment = {
        id: tempId,
        name: fileNameWebp,
        url: base64Data || asset.uri,
        localUri: asset.uri,
        isUploading: true,
        type: "image/webp",
        size: asset.fileSize || 0,
      };
      addAttachmentToItem(itemIdx, localAttachment);

      // 2. Perform WebP conversion and upload in background asynchronously
      (async () => {
        try {
          const uploaded = await expenseApi.uploadProof(base64Data, fileNameWebp);
          if (uploaded && uploaded.url) {
            setExpenseItems((prev) => {
              const updated = [...prev];
              if (updated[itemIdx]) {
                const curAtts = updated[itemIdx].attachments || [];
                updated[itemIdx] = {
                  ...updated[itemIdx],
                  attachments: curAtts.map((att) =>
                    att.id === tempId || att.localUri === asset.uri
                      ? {
                        ...att,
                        url: uploaded.url,
                        name: uploaded.name || fileNameWebp,
                        type: "image/webp",
                        isUploading: false,
                      }
                      : att
                  ),
                };
              }
              return updated;
            });
          }
        } catch (bgErr) {
          console.log("Background WebP upload fallback:", bgErr.message);
        }
      })();
    } catch (err) {
      Alert.alert("Attachment Error", err.message || "Unable to attach photo.");
    }
  };

  const validateAllFormFields = () => {
    // 1. Check Expense Type
    if (!claimType) {
      Alert.alert(
        "Missing Field: Expense Type",
        "Please select the Expense Type (e.g. Food, Lodging, Local Conveyance, Travel, Other)."
      );
      return false;
    }

    // 2. Check Employees
    if (!employeeSelections || employeeSelections.length === 0) {
      Alert.alert(
        "Missing Field: Select Employees",
        "Please select at least one employee for this expense claim."
      );
      return false;
    }
    for (let idx = 0; idx < employeeSelections.length; idx++) {
      const sel = employeeSelections[idx];
      if (!sel.employeeId) {
        Alert.alert(
          "Missing Field: Employee Selection",
          `Please select an employee for Slot #${idx + 1} (${idx === 0 ? "Primary Claimant" : `Employee #${idx + 1}`}).`
        );
        return false;
      }
    }

    // 3. Check Destination City (for Food, Lodging, Travel)
    if (claimType !== "CONVEYANCE" && claimType !== "OTHER") {
      if (!selectedCity || !selectedCity.trim()) {
        Alert.alert(
          "Missing Field: Destination City",
          "Please select or search the Destination City / Location."
        );
        return false;
      }
    }

    // 4. Check Items List
    if (!expenseItems || expenseItems.length === 0) {
      Alert.alert("Missing Field: Expense Items", "Please add at least one expense item.");
      return false;
    }

    const selected = employeeSelections.filter((s) => s.employeeId);

    // 5. Check each item fields
    for (let i = 0; i < expenseItems.length; i++) {
      const it = expenseItems[i];
      const itemNum = `#${i + 1}`;

      // Date check
      if (!it.date) {
        Alert.alert(
          "Missing Field: Date",
          `Please select the ${claimType === "CONVEYANCE" ? "Date of Travel" : "Date of Expense"} for Item ${itemNum}.`
        );
        return false;
      }

      // Conveyance specific
      if (claimType === "CONVEYANCE") {
        if (!it.vehicle) {
          Alert.alert(
            "Missing Field: Vehicle Type",
            `Please select the vehicle type (e.g. Car, 2-Wheeler, E-Bike) for Item ${itemNum}.`
          );
          return false;
        }
        if (!it.distanceKm || isNaN(Number(it.distanceKm)) || Number(it.distanceKm) <= 0) {
          Alert.alert(
            "Missing Field: Traveling Distance",
            `Please enter a valid traveling distance (in km) greater than 0 for Item ${itemNum}.`
          );
          return false;
        }
        if (!it.amount || isNaN(Number(it.amount)) || Number(it.amount) <= 0) {
          Alert.alert(
            "Missing Field: Conveyance Amount",
            `Please enter or calculate the traveling amount for Item ${itemNum}.`
          );
          return false;
        }
      }

      // Travel specific
      else if (claimType === "TRAVEL") {
        if (!it.mode) {
          Alert.alert(
            "Missing Field: Travel Mode",
            `Please select the mode of travel (e.g. Flight, Train, Bus, Cab) for Item ${itemNum}.`
          );
          return false;
        }
        if (isMultiEmployee) {
          for (const sel of selected) {
            const empAmt = it.employeeAmounts?.[sel.employeeId];
            if (!empAmt || isNaN(Number(empAmt)) || Number(empAmt) <= 0) {
              Alert.alert(
                "Missing Field: Ticket Fare",
                `Please enter the travel ticket fare for ${sel.label || "Employee"} in Item ${itemNum}.`
              );
              return false;
            }
          }
        } else {
          if (!it.amount || isNaN(Number(it.amount)) || Number(it.amount) <= 0) {
            Alert.alert(
              "Missing Field: Ticket Amount",
              `Please enter the travel ticket amount greater than 0 for Item ${itemNum}.`
            );
            return false;
          }
        }
      }

      // Lodging specific
      else if (claimType === "LODGING") {
        if (!it.amount || isNaN(Number(it.amount)) || Number(it.amount) <= 0) {
          Alert.alert(
            "Missing Field: Lodging Bill Amount",
            `Please enter the ${isSharedLodging ? "Total Combined Lodging Bill" : "Hotel / Lodging Amount"} greater than 0 for Item ${itemNum}.`
          );
          return false;
        }
      }

      // Food specific
      else if (claimType === "FOOD") {
        if (isMultiEmployee) {
          for (const sel of selected) {
            const empAmt = it.employeeAmounts?.[sel.employeeId];
            if (!empAmt || isNaN(Number(empAmt)) || Number(empAmt) <= 0) {
              Alert.alert(
                "Missing Field: Food Bill",
                `Please enter the food bill amount for ${sel.label || "Employee"} in Item ${itemNum}.`
              );
              return false;
            }
          }
        } else {
          if (!it.amount || isNaN(Number(it.amount)) || Number(it.amount) <= 0) {
            Alert.alert(
              "Missing Field: Food Bill Amount",
              `Please enter the food bill amount greater than 0 for Item ${itemNum}.`
            );
            return false;
          }
        }
      }

      // Other specific
      else if (claimType === "OTHER") {
        if (!it.amount || isNaN(Number(it.amount)) || Number(it.amount) <= 0) {
          Alert.alert(
            "Missing Field: Expense Amount",
            `Please enter the expense amount greater than 0 for Item ${itemNum}.`
          );
          return false;
        }
      }

      // Purpose / Description
      if (!it.note || !it.note.trim()) {
        Alert.alert(
          "Missing Field: Purpose / Description",
          `Please enter the Purpose / Description note for Item ${itemNum}.`
        );
        return false;
      }

      // Bill Proof Upload
      if (!it.attachments || it.attachments.length === 0) {
        Alert.alert(
          "Missing Field: Bill Receipt Proof",
          `Bill or receipt proof is compulsory for Item ${itemNum}. Please capture a photo with the Camera or select from the Gallery.`
        );
        return false;
      }
    }

    return true;
  };

  const buildPayload = () => {
    const selected = employeeSelections.filter((s) => s.employeeId);
    const count = Math.max(1, selected.length);
    const destinationCity = (selectedCity || "Mumbai").trim();

    if (claimType === "LODGING" && count >= 2) {
      // Shared Lodging: primary claimant receives lodging bill with co-claimants recorded
      const primarySel = selected[0] || { employeeId: loginUser?._id || loginUser?.id };
      const secondarySels = selected.slice(1);
      const secondaryNames = secondarySels.map((s) => s.label).filter(Boolean).join(", ");
      const firstItem = expenseItems[0] || initialItem();

      const employeeClaims = [
        {
          employeeId: primarySel.employeeId,
          items: expenseItems.map((it) => ({
            expenseType: "LODGING",
            amount: Number(it.amount) || 0,
            requestedAmount: Number(it.amount) || 0,
            days: 1,
            stayDays: 1,
            expenseDate: it.date || getTodayDateStr(),
            description: it.note || it.description || "",
            sharedWith: secondaryNames,
            attachments: (it.attachments || []).map((a) => ({
              name: a.name,
              url: a.url,
              type: a.type,
              size: a.size,
            })),
          })),
        },
        ...secondarySels.map((s) => ({
          employeeId: s.employeeId,
          items: [],
        })),
      ];

      return {
        claimType: "LODGING",
        isSharedLodging: true,
        trip: {
          customerName: "",
          purpose: "",
          destination: destinationCity,
          startDate: firstItem.date ? new Date(firstItem.date) : null,
          endDate: firstItem.date ? new Date(firstItem.date) : null,
          days: 1,
        },
        employeeClaims,
      };
    }

    // All other claim types (Food, Conveyance, Travel, Other, or Single Lodging)
    const isMulti = count > 1;
    const employeeClaims = selected.map((sel) => ({
      employeeId: sel.employeeId,
      items: expenseItems.map((it) => {
        let empAmt = 0;
        if ((claimType === "FOOD" || claimType === "TRAVEL") && isMulti) {
          empAmt = Number(it.employeeAmounts?.[sel.employeeId]) || 0;
        } else {
          const totalAmt = Number(it.amount) || 0;
          empAmt = isMulti ? Math.round((totalAmt / count) * 100) / 100 : totalAmt;
        }

        const itemDays = Math.max(1, Number(it.days) || 1);
        const base = {
          expenseType: claimType,
          amount: empAmt,
          requestedAmount: empAmt,
          days: itemDays,
          stayDays: itemDays,
          expenseDate: it.date || getTodayDateStr(),
          description: it.note || it.description || (isMulti ? `Group claim for ${count} employees` : ""),
          attachments: (it.attachments || []).map((a) => ({
            name: a.name,
            url: a.url,
            type: a.type,
            size: a.size,
          })),
        };

        if (claimType === "CONVEYANCE") {
          const dist = Number(it.distanceKm) || 0;
          base.vehicle = it.vehicle || "car";
          base.distanceKm = isMulti ? Math.round((dist / count) * 10) / 10 : dist;
        }

        if (claimType === "TRAVEL") {
          base.mode = it.mode || "";
        }

        return base;
      }),
    }));

    const firstItem = expenseItems[0] || {};
    return {
      claimType,
      isSharedLodging: false,
      trip: {
        customerName: "",
        purpose: "",
        destination: destinationCity,
        startDate: firstItem.date ? new Date(firstItem.date) : null,
        endDate: firstItem.date ? new Date(firstItem.date) : null,
      },
      employeeClaims,
    };
  };

  const handlePreview = async () => {
    if (!validateAllFormFields()) return;

    setPreviewing(true);
    try {
      const res = await expenseApi.previewClaim(buildPayload());
      if (res.success) {
        setPreview(res.data);
      } else {
        Alert.alert("Preview Failed", res.message || "Unable to calculate.");
      }
    } finally {
      setPreviewing(false);
    }
  };

  const handleCreate = async () => {
    if (!validateAllFormFields()) return;

    setSubmitting(true);
    try {
      let res;
      if (claimId) {
        res = await expenseApi.updateClaim(claimId, buildPayload());
      } else {
        res = await expenseApi.createClaim(buildPayload());
      }

      if (res.success) {
        Alert.alert(
          claimId ? "Draft Updated" : "Claim Saved as Draft",
          `Expense draft ${claimId ? "updated" : "saved"} for ${res.data.employeeCount} employee(s).\n\nTotal Amount: ₹${res.data.grandRequested}`,
          [
            { text: "View Details", onPress: () => navigation.navigate("ExpenseClaimDetail", { claimId: res.data._id }) },
            { text: "Done", onPress: () => navigation.goBack() },
          ]
        );
        setPreview(null);
      } else {
        Alert.alert(claimId ? "Update Failed" : "Creation Failed", res.message || "Unable to save draft.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async () => {
    if (!validateAllFormFields()) return;

    setSubmitting(true);
    try {
      let saveRes;
      if (claimId) {
        saveRes = await expenseApi.updateClaim(claimId, buildPayload());
      } else {
        saveRes = await expenseApi.createClaim(buildPayload());
      }

      if (!saveRes.success) {
        Alert.alert("Submission Failed", saveRes.message || "Unable to save claim.");
        return;
      }

      const claimToSubmitId = saveRes.data?._id || claimId;
      const submitRes = await expenseApi.submitClaim(claimToSubmitId);
      if (submitRes.success) {
        Alert.alert(
          "Claim Submitted Successfully!",
          `Claim #${submitRes.data.claimNumber || ""} for ₹${submitRes.data.grandRequested} has been submitted for approval.`,
          [
            { text: "View Claim", onPress: () => navigation.navigate("ExpenseClaimDetail", { claimId: submitRes.data._id }) },
            { text: "Done", onPress: () => navigation.goBack() },
          ]
        );
      } else {
        Alert.alert("Submission Failed", submitRes.message || "Could not submit claim.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const typeOptions = (types.length > 0 ? types : EXPENSE_TYPES).map((t) => ({
    value: t.code,
    label: t.name,
  }));

  const getTypeLabel = (code) => {
    const found = typeOptions.find((t) => t.value === code);
    return found ? found.label : "";
  };

  const travelModeOptions = travelModes.map((m) => ({
    value: m.name,
    label: m.name,
  }));

  const getVehicleLabel = (v) => {
    const found = VEHICLES.find((x) => x.value === v);
    return found ? found.label : "Select Vehicle";
  };

  const getTravelModeLabel = (m) => {
    const found = travelModeOptions.find((x) => x.value === m);
    return found ? found.label : "";
  };

  const handleModalSelect = (value) => {
    if (!modal) return;
    switch (modal.kind) {
      case "type":
        setClaimType(value);
        setExpenseItems([initialItem()]);
        setPreview(null);
        break;
      case "count":
        handleEmployeeCountChange(value);
        break;
      case "vehicle":
        updateItem(modal.itemIdx, "vehicle", value);
        break;
      case "mode":
        updateItem(modal.itemIdx, "mode", value);
        break;
      case "city":
        setSelectedCity(value);
        setPreview(null);
        break;
      default:
        break;
    }
    setModal(null);
  };

  const renderModalContent = () => {
    if (!modal) return null;
    let title = "";
    let items = [];

    switch (modal.kind) {
      case "type":
        title = "Select Expense Type";
        items = typeOptions;
        break;
      case "count":
        title = "Number of Employees";
        items = COUNT_OPTIONS;
        break;
      case "vehicle":
        title = "Select Vehicle Type";
        items = VEHICLES;
        break;
      case "mode":
        title = "Select Travel Mode";
        items = travelModeOptions;
        break;
      case "city": {
        title = "Select Destination City";
        const q = (citySearchText || "").trim().toLowerCase();
        const filteredCities = cities.filter((c) => {
          return (
            (c.city || "").toLowerCase().includes(q) ||
            (c.state || "").toLowerCase().includes(q) ||
            (c.cityClass || "").toLowerCase().includes(q)
          );
        });

        return (
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{title}</Text>

            {/* City Search Bar */}
            <View style={styles.modalSearchRow}>
              <Search size={16} color="#64748b" />
              <TextInput
                style={styles.modalSearchInput}
                placeholder="Search or enter city name..."
                placeholderTextColor="#94a3b8"
                value={citySearchText}
                onChangeText={setCitySearchText}
                autoCapitalize="words"
              />
            </View>

            {citySearchText.trim().length > 0 && !filteredCities.some(c => (c.city || "").toLowerCase() === q) && (
              <TouchableOpacity
                style={styles.customCityPromptBtn}
                onPress={() => {
                  setSelectedCity(citySearchText.trim());
                  setModal(null);
                  setPreview(null);
                }}
              >
                <MapPin size={14} color="#4f46e5" />
                <Text style={styles.customCityPromptText}>
                  Use custom city: <Text style={{ fontWeight: "900" }}>"{citySearchText.trim()}"</Text> (Class C)
                </Text>
              </TouchableOpacity>
            )}

            <ScrollView style={{ maxHeight: 320 }} keyboardShouldPersistTaps="handled">
              {filteredCities.map((c) => (
                <TouchableOpacity
                  key={c._id || c.city}
                  style={[
                    styles.cityModalItem,
                    (selectedCity || "").toUpperCase() === (c.city || "").toUpperCase() && { backgroundColor: "#e0e7ff" },
                  ]}
                  onPress={() => {
                    setSelectedCity(c.city);
                    setModal(null);
                    setPreview(null);
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.modalItemText}>{c.city}</Text>
                    {c.state ? (
                      <Text style={styles.modalItemSubtext}>{c.state}</Text>
                    ) : null}
                  </View>
                  <View style={[styles.cityClassPill, { backgroundColor: getCityClassBg(c.cityClass) }]}>
                    <Text style={[styles.cityClassPillText, { color: getCityClassColor(c.cityClass) }]}>
                      Class {c.cityClass}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
              {filteredCities.length === 0 && !citySearchText && (
                <View style={{ padding: 20, alignItems: "center" }}>
                  <Text style={{ fontSize: 12, color: "#94a3b8" }}>No cities configured.</Text>
                </View>
              )}
            </ScrollView>

            <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setModal(null)}>
              <Text style={styles.modalCloseText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        );
      }
      case "employee": {
        title = "Select Employee";
        const q = (employeeSearchText || "").trim().toLowerCase();
        const filteredEmployees = employeeOptions.filter((emp) => {
          return (
            (emp.name || "").toLowerCase().includes(q) ||
            (emp.employeeIdCode || "").toLowerCase().includes(q) ||
            (emp.department || "").toLowerCase().includes(q) ||
            (emp.levelRef?.name || "").toLowerCase().includes(q)
          );
        });

        return (
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{title}</Text>

            {/* Employee Search Bar */}
            <View style={styles.modalSearchRow}>
              <Search size={16} color="#64748b" />
              <TextInput
                style={styles.modalSearchInput}
                placeholder="Search employee by name, ID, dept..."
                placeholderTextColor="#94a3b8"
                value={employeeSearchText}
                onChangeText={setEmployeeSearchText}
                autoCapitalize="none"
              />
            </View>

            <ScrollView style={{ maxHeight: 320 }} keyboardShouldPersistTaps="handled">
              {filteredEmployees.map((emp) => (
                <TouchableOpacity
                  key={emp._id}
                  style={styles.modalItem}
                  onPress={() => {
                    pickEmployee(emp, modal.targetIndex);
                    setEmployeeSearchText("");
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.modalItemText}>{emp.name}</Text>
                    <Text style={styles.modalItemSubtext}>
                      {emp.employeeIdCode || ""} · {emp.levelRef?.name || "Level"} · {emp.department || ""}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
              {filteredEmployees.length === 0 && (
                <View style={{ padding: 20, alignItems: "center" }}>
                  <Text style={{ fontSize: 12, color: "#94a3b8" }}>No matching employees found.</Text>
                </View>
              )}
            </ScrollView>
            <TouchableOpacity style={styles.modalCloseBtn} onPress={() => { setModal(null); setEmployeeSearchText(""); }}>
              <Text style={styles.modalCloseText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        );
      }
      default:
        return null;
    }

    return (
      <View style={styles.modalCard}>
        <Text style={styles.modalTitle}>{title}</Text>
        <ScrollView style={{ maxHeight: 350 }}>
          {items.map((it) => (
            <TouchableOpacity
              key={String(it.value)}
              style={styles.modalItem}
              onPress={() => handleModalSelect(it.value)}
            >
              <Text style={styles.modalItemText}>{it.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setModal(null)}>
          <Text style={styles.modalCloseText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderPreviewBox = () => {
    if (!preview) return null;
    const isOtherType = claimType === "OTHER";
    const employeeResults = preview.employeeResults || preview.results || [];
    const resolvedCityClass = preview.destinationClass || getSelectedCityClass();

    return (
      <View style={styles.previewContainer}>
        {/* Grand Summary Top Card */}
        <View style={styles.previewHeaderCard}>
          <View style={styles.previewHeaderRow}>
            <View style={styles.previewIconBox}>
              <Calculator size={18} color="#ffffff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.previewMainTitle}>Policy Calculation &amp; Rules Breakdown</Text>
              <Text style={styles.previewSubTitle}>
                Detailed allowed vs excess entitlement analysis based on enterprise rules
              </Text>
            </View>
          </View>

          {/* Destination Badge — only for city-dependent claims */}
          {claimType !== "CONVEYANCE" && claimType !== "OTHER" && (
            <View style={styles.previewDestBadge}>
              <MapPin size={13} color="#818cf8" />
              <Text style={styles.previewDestText}>
                Destination: <Text style={{ fontWeight: "900", color: "#ffffff" }}>{selectedCity}</Text> (Class {resolvedCityClass})
              </Text>
            </View>
          )}

          {/* Grand Totals Summary Grid */}
          <View style={styles.grandSummaryGrid}>
            <View style={styles.grandSummaryCol}>
              <Text style={styles.grandSummaryLabel}>Total Claimed</Text>
              <Text style={styles.grandSummaryValClaimed}>₹{preview.grandRequested || 0}</Text>
            </View>

            <View style={styles.grandSummaryDivider} />

            <View style={styles.grandSummaryCol}>
              <Text style={styles.grandSummaryLabel}>Policy Allowed</Text>
              <Text style={styles.grandSummaryValAllowed}>₹{preview.grandAllowed || 0}</Text>
            </View>

            {!isOtherType && (
              <>
                <View style={styles.grandSummaryDivider} />
                <View style={styles.grandSummaryCol}>
                  <Text style={styles.grandSummaryLabel}>Excess Amount</Text>
                  <Text style={[
                    styles.grandSummaryValExcess,
                    Number(preview.grandExcess || 0) > 0 && { color: "#f87171" }
                  ]}>
                    ₹{preview.grandExcess || 0}
                  </Text>
                </View>
              </>
            )}
          </View>
        </View>

        {/* If Shared Lodging: Show ONE Combined Room Calculation Card */}
        {isSharedLodging ? (() => {
          const primaryLodgingItem = (employeeResults[0]?.items || [])[0] || {};
          const bdown = primaryLodgingItem.calculationBreakdown || {};
          const steps = bdown.steps || [];
          const hasExcess = Number(preview.grandExcess || 0) > 0;

          return (
            <View style={styles.previewEmpCard}>
              {/* Occupants Header */}
              <View style={styles.sharedOccupantsHeader}>
                <View style={styles.sharedBedIcon}>
                  <Building2 size={18} color="#4f46e5" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.previewEmpName}>Combined Room Calculation ({employeeCount} Occupants)</Text>
                  <Text style={styles.previewEmpSub}>
                    Room shared by {employeeResults.map(r => r.employee?.name || 'Employee').join(' & ')}
                  </Text>
                </View>
              </View>

              {/* Occupants Badges */}
              <View style={styles.occupantsPillsRow}>
                {employeeResults.map((r, idx) => (
                  <View key={idx} style={styles.occupantPill}>
                    <Text style={styles.occupantPillText}>
                      {idx === 0 ? '👑 ' : '👥 '}{r.employee?.name || `Emp #${idx + 1}`}
                      {r.employee?.levelName ? ` (L${r.employee.levelName})` : ''}
                    </Text>
                  </View>
                ))}
              </View>

              {/* Room Figures Grid */}
              <View style={styles.previewFiguresRow}>
                <View style={styles.previewFigureBlock}>
                  <Text style={styles.previewFigureLabel}>Room Bill</Text>
                  <Text style={styles.previewFigureVal}>₹{preview.grandRequested || 0}</Text>
                </View>
                <View style={styles.previewFigureBlock}>
                  <Text style={styles.previewFigureLabel}>Policy Allowed</Text>
                  <Text style={[styles.previewFigureVal, { color: "#059669" }]}>
                    ₹{preview.grandAllowed || 0}
                  </Text>
                </View>
                <View style={styles.previewFigureBlock}>
                  <Text style={styles.previewFigureLabel}>Excess</Text>
                  <Text style={[
                    styles.previewFigureVal,
                    hasExcess ? { color: "#dc2626" } : { color: "#64748b" }
                  ]}>
                    ₹{preview.grandExcess || 0}
                  </Text>
                </View>
              </View>

              {/* Simple Plain-Language Explanation Box */}
              <View style={[
                styles.plainExplanationCard,
                hasExcess ? styles.plainExplanationExcess : styles.plainExplanationAllowed
              ]}>
                <View style={styles.plainExplanationHeader}>
                  <Info size={14} color={hasExcess ? "#b91c1c" : "#047857"} />
                  <Text style={[
                    styles.plainExplanationTitle,
                    hasExcess ? { color: "#991b1b" } : { color: "#065f46" }
                  ]}>
                    {hasExcess ? "Shared Room Excess Notice" : "Shared Lodging Summary"}
                  </Text>
                </View>
                <Text style={[
                  styles.plainExplanationBody,
                  hasExcess ? { color: "#7f1d1d" } : { color: "#064e3b" }
                ]}>
                  {primaryLodgingItem.plainExplanation || bdown.plainExplanation || (
                    hasExcess
                      ? `Your shared lodging limit for ${employeeCount} employees is ${bdown.limitText || `₹${preview.grandAllowed}`} and your total room bill is ₹${preview.grandRequested || 0}. Therefore, ₹${preview.grandAllowed || 0} is allowed and ₹${preview.grandExcess || 0} is excess.`
                      : `Your shared lodging limit for ${employeeCount} employees is ${bdown.limitText || `₹${preview.grandAllowed}`} and your total room bill is ₹${preview.grandRequested || 0}. Since your bill is within the limit, ₹${preview.grandAllowed || 0} is 100% fully allowed.`
                  )}
                </Text>
              </View>

              {/* Description note */}
              {primaryLodgingItem.description ? (
                <Text style={styles.previewItemDesc}>Note: {primaryLodgingItem.description}</Text>
              ) : null}
            </View>
          );
        })() : (
          /* For other types (Food, Travel, Conveyance, Other) or single employee: Show per-employee breakdown */
          employeeResults.map((r, empIdx) => {
            const empName = r.employee?.name || `Employee #${empIdx + 1}`;
            const empCode = r.employee?.employeeIdCode || "";
            const empDept = r.employee?.department || "";
            const empLevel = r.employee?.levelName ? `Level ${r.employee.levelName}` : (r.employee?.levelRef?.name || "");

            return (
              <View key={empIdx} style={styles.previewEmpCard}>
                {/* Employee Card Header */}
                <View style={styles.previewEmpHeader}>
                  <View style={styles.previewAvatar}>
                    <UserIcon size={16} color="#4f46e5" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.previewEmpName}>{empName}</Text>
                    <Text style={styles.previewEmpSub}>
                      {empCode ? `${empCode} · ` : ""}{empDept}{empDept ? " · " : ""}{empLevel || "Employee"}
                    </Text>
                  </View>
                  {empLevel ? (
                    <View style={styles.levelPill}>
                      <Text style={styles.levelPillText}>{empLevel}</Text>
                    </View>
                  ) : null}
                </View>

                {/* Items Breakdown */}
                {(r.items || []).map((item, itIdx) => {
                  const bdown = item.calculationBreakdown || {};
                  const isItemAllowed = Number(item.excessAmount || 0) === 0;

                  return (
                    <View key={itIdx} style={styles.previewItemCard}>
                      {/* Item Top Bar */}
                      <View style={styles.previewItemTopRow}>
                        <View>
                          <Text style={styles.previewItemType}>
                            {item.expenseType || claimType}
                          </Text>
                          <Text style={styles.previewItemDate}>
                            {item.expenseDate ? String(item.expenseDate).slice(0, 10) : getTodayDateStr()}
                          </Text>
                        </View>
                        <View style={isItemAllowed ? styles.tagAllowed : styles.tagExcess}>
                          <Text style={isItemAllowed ? styles.tagAllowedText : styles.tagExcessText}>
                            {isItemAllowed ? "Fully Allowed" : `₹${item.excessAmount} Excess`}
                          </Text>
                        </View>
                      </View>

                      {/* Figures Grid */}
                      <View style={styles.previewFiguresRow}>
                        <View style={styles.previewFigureBlock}>
                          <Text style={styles.previewFigureLabel}>Requested</Text>
                          <Text style={styles.previewFigureVal}>₹{item.requestedAmount || 0}</Text>
                        </View>
                        <View style={styles.previewFigureBlock}>
                          <Text style={styles.previewFigureLabel}>Allowed</Text>
                          <Text style={[styles.previewFigureVal, { color: "#059669" }]}>
                            ₹{item.allowedAmount || 0}
                          </Text>
                        </View>
                        {!isOtherType && (
                          <View style={styles.previewFigureBlock}>
                            <Text style={styles.previewFigureLabel}>Excess</Text>
                            <Text style={[
                              styles.previewFigureVal,
                              Number(item.excessAmount || 0) > 0 ? { color: "#dc2626" } : { color: "#64748b" }
                            ]}>
                              ₹{item.excessAmount || 0}
                            </Text>
                          </View>
                        )}
                      </View>

                      {/* Simple Plain-Language Explanation Box */}
                      <View style={[
                        styles.plainExplanationCard,
                        !isItemAllowed ? styles.plainExplanationExcess : styles.plainExplanationAllowed
                      ]}>
                        <View style={styles.plainExplanationHeader}>
                          <Info size={14} color={!isItemAllowed ? "#b91c1c" : "#047857"} />
                          <Text style={[
                            styles.plainExplanationTitle,
                            !isItemAllowed ? { color: "#991b1b" } : { color: "#065f46" }
                          ]}>
                            {!isItemAllowed ? "Policy Excess Notice" : "Simple Calculation Summary"}
                          </Text>
                        </View>
                        <Text style={[
                          styles.plainExplanationBody,
                          !isItemAllowed ? { color: "#7f1d1d" } : { color: "#064e3b" }
                        ]}>
                          {item.plainExplanation || bdown.plainExplanation || (
                            !isItemAllowed
                              ? `Your policy limit is ${bdown.limitText || `₹${item.allowedAmount}`} and your claimed value is ₹${item.requestedAmount || 0}. Therefore, ₹${item.allowedAmount || 0} is allowed and ₹${item.excessAmount || 0} is excess.`
                              : `Your policy limit is ${bdown.limitText || `₹${item.allowedAmount}`} and your claimed value is ₹${item.requestedAmount || 0}. Since your bill is within the limit, ₹${item.allowedAmount || 0} is fully allowed.`
                          )}
                        </Text>
                      </View>

                      {/* Description note */}
                      {item.description ? (
                        <Text style={styles.previewItemDesc}>Note: {item.description}</Text>
                      ) : null}
                    </View>
                  );
                })}

                {/* Employee Subtotal Footer */}
                <View style={styles.previewEmpFooter}>
                  <Text style={styles.empFooterLabel}>Employee Subtotal:</Text>
                  <View style={styles.empFooterFigures}>
                    <Text style={styles.empFooterReq}>Requested: ₹{r.requestedTotal}</Text>
                    <Text style={styles.empFooterAll}>Allowed: <Text style={{ fontWeight: "900" }}>₹{r.allowedTotal}</Text></Text>
                    {!isOtherType && Number(r.excessTotal || 0) > 0 && (
                      <Text style={styles.empFooterExc}>Excess: ₹{r.excessTotal}</Text>
                    )}
                  </View>
                </View>
              </View>
            );
          })
        )}

        {/* Policy Compliance Callout */}
        <View style={styles.policyComplianceCallout}>
          <ShieldCheck size={16} color="#059669" />
          <Text style={styles.policyComplianceText}>
            {claimType === "CONVEYANCE"
              ? "Local conveyance reimbursements are evaluated strictly on traveling distance (km) and vehicle rates."
              : claimType === "OTHER"
                ? "Reimbursements for other expenses are evaluated as actual eligible amounts against submitted bill receipts."
                : `Reimbursements are evaluated based on employee grade entitlement limits for ${selectedCity} (Class ${resolvedCityClass}). Excess amounts beyond company policy limits will not be reimbursed.`}
          </Text>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ExpenseHeader
          title={claimId ? "Edit Expense Claim" : "New Expense Claim"}
          subtitle={claimId ? "Edit draft expense claim" : "One expense type per claim"}
          navigation={navigation}
        />
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color="#4f46e5" />
          <Text style={styles.loadingText}>Loading expense module…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <ExpenseHeader
        title={claimId ? "Edit Expense Claim" : "New Expense Claim"}
        subtitle={claimId ? "Edit draft expense claim" : "One expense type per claim"}
        navigation={navigation}
      />
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* Step 1: Expense Type */}
        <Text style={styles.sectionTitle}>
          1. Expense Type <Text style={styles.reqStar}>*</Text>
        </Text>
        <TouchableOpacity style={styles.dropdownBtn} onPress={() => setModal({ kind: "type" })}>
          <Receipt size={16} color="#4f46e5" />
          <Text style={[styles.dropdownBtnText, !claimType && { color: "#94a3b8" }]}>
            {getTypeLabel(claimType) || "Select Expense Type (e.g. Food, Lodging, Local Conveyance)"}
          </Text>
          <ChevronDown size={16} color="#64748b" />
        </TouchableOpacity>

        {/* Shared Lodging Info Badge */}
        {isSharedLodging && (
          <View style={styles.sharedLodgingRuleBadge}>
            <Building2 size={16} color="#047857" />
            <View style={{ flex: 1 }}>
              <Text style={styles.sharedLodgingRuleTitle}>Shared Lodging Rule Active</Text>
              <Text style={styles.sharedLodgingRuleSubtext}>
                {activePolicy?.sharedLodgingRule === 'HIGHER_ONLY'
                  ? `Higher entitlement rule active on combined lodging bill for ${employeeCount} employees.`
                  : `${activePolicy?.sharedLodgingPercent || 75}% Rule applied on (Higher + Lower) combined lodging bill for ${employeeCount} employees.`}
              </Text>
            </View>
          </View>
        )}

        {/* Step 2: Select Employees */}
        <Text style={styles.sectionTitle}>
          2. Select Employees <Text style={styles.reqStar}>*</Text>
        </Text>
        <View style={styles.countRow}>
          <Text style={styles.subLabel}>
            Number of Employees <Text style={styles.reqStar}>*</Text>
          </Text>
          <TouchableOpacity
            style={styles.countBtn}
            onPress={() => setModal({ kind: "count" })}
          >
            <Users size={14} color="#4f46e5" />
            <Text style={styles.countBtnText}>{employeeCount} employee{employeeCount > 1 ? "s" : ""}</Text>
            <ChevronDown size={14} color="#64748b" />
          </TouchableOpacity>
        </View>

        {/* Employee slot picker cards */}
        {employeeSelections.map((sel, idx) => (
          <View key={idx} style={styles.employeeSlotCard}>
            <View style={styles.slotAvatar}>
              <Text style={styles.slotAvatarText}>#{idx + 1}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.slotLabel}>
                {idx === 0 ? "Employee #1 (Primary / Myself)" : `Employee #${idx + 1}`} <Text style={styles.reqStar}>*</Text>
              </Text>
              <Text style={styles.slotName}>{sel.label || "Tap to select employee"}</Text>
            </View>
            {idx > 0 && (
              <TouchableOpacity
                style={styles.changeEmpBtn}
                onPress={() => {
                  loadEmployeeOptions();
                  setEmployeeSearchText("");
                  setModal({ kind: "employee", targetIndex: idx });
                }}
              >
                <Text style={styles.changeEmpBtnText}>{sel.employeeId ? "Change" : "Select"}</Text>
              </TouchableOpacity>
            )}
          </View>
        ))}

        {/* Step 3: Expense Details & Items */}
        <Text style={styles.sectionTitle}>
          3. Expense Details {isSharedLodging ? "(Lodging Bill)" : "(Fill Details)"} <Text style={styles.reqStar}>*</Text>
        </Text>

        {/* Destination City Selection Card — shown only for Food, Lodging, and Travel */}
        {claimType && claimType !== "CONVEYANCE" && claimType !== "OTHER" && (
          <View style={styles.citySelectorCard}>
            <View style={styles.citySelectorHeader}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <MapPin size={16} color="#4f46e5" />
                <Text style={styles.citySelectorTitle}>
                  Destination City / Location <Text style={styles.reqStar}>*</Text>
                </Text>
              </View>
              <View style={[styles.cityClassPill, { backgroundColor: getCityClassBg(getSelectedCityClass()) }]}>
                <Text style={[styles.cityClassPillText, { color: getCityClassColor(getSelectedCityClass()) }]}>
                  Class {getSelectedCityClass()}
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.cityDropdownBtn}
              onPress={() => {
                setCitySearchText("");
                setModal({ kind: "city" });
              }}
            >
              <Text style={styles.cityDropdownBtnText}>
                {selectedCity || "Select City / Location"}
              </Text>
              <ChevronDown size={16} color="#64748b" />
            </TouchableOpacity>

            <Text style={styles.cityHelperText}>
              💡 Expense Claims limits by Class {getSelectedCityClass()} rates for this city.
            </Text>
          </View>
        )}

        {!claimType ? (
          <View style={styles.emptyNotice}>
            <Text style={styles.emptyNoticeText}>Please select an Expense Type above to enter details.</Text>
          </View>
        ) : (
          <>
            {expenseItems.map((it, i) => (
              <View key={i} style={styles.itemCard}>
                <View style={styles.itemCardHeader}>
                  <Text style={styles.itemIndexTitle}>Entry #{i + 1}</Text>
                  {expenseItems.length > 1 && (
                    <TouchableOpacity onPress={() => removeItem(i)} style={styles.deleteItemBtn}>
                      <Trash2 size={16} color="#dc2626" />
                    </TouchableOpacity>
                  )}
                </View>

                {/* Per-Item Date of Travel / Date of Expense */}
                <View style={styles.fieldBlock}>
                  <Text style={styles.inputLabel}>
                    {isConveyance ? "Date of Travel" : "Date of Expense"} <Text style={styles.reqStar}>*</Text>
                  </Text>
                  <TouchableOpacity
                    style={styles.datePickerBtn}
                    onPress={() => setActiveDatePickerIdx(i)}
                  >
                    <Calendar size={16} color="#4f46e5" />
                    <Text style={styles.datePickerBtnText}>
                      {it.date || getTodayDateStr()}
                    </Text>
                  </TouchableOpacity>

                  {/* Native date picker for this item */}
                  {activeDatePickerIdx === i && (
                    <DateTimePicker
                      value={it.date ? new Date(it.date) : new Date()}
                      mode="date"
                      display={Platform.OS === "ios" ? "spinner" : "default"}
                      onChange={(event, selectedDate) => {
                        setActiveDatePickerIdx(null);
                        if (selectedDate) {
                          const y = selectedDate.getFullYear();
                          const m = String(selectedDate.getMonth() + 1).padStart(2, "0");
                          const d = String(selectedDate.getDate()).padStart(2, "0");
                          updateItem(i, "date", `${y}-${m}-${d}`);
                        }
                      }}
                    />
                  )}
                </View>

                {/* Local Conveyance Fields */}
                {isConveyance && (
                  <>
                    <View style={styles.fieldBlock}>
                      <Text style={styles.inputLabel}>
                        Vehicle Type <Text style={styles.reqStar}>*</Text>
                      </Text>
                      <TouchableOpacity
                        style={styles.dropdownBtn}
                        onPress={() => setModal({ kind: "vehicle", itemIdx: i })}
                      >
                        <Text style={styles.dropdownBtnText}>{getVehicleLabel(it.vehicle)}</Text>
                        <ChevronDown size={14} color="#64748b" />
                      </TouchableOpacity>
                    </View>

                    <View style={styles.fieldBlock}>
                      <Text style={styles.inputLabel}>
                        Traveling Distance (km) <Text style={styles.reqStar}>*</Text>
                      </Text>
                      <TextInput
                        style={styles.textInput}
                        placeholder="e.g. 25"
                        placeholderTextColor="#94a3b8"
                        keyboardType="numeric"
                        value={it.distanceKm}
                        onChangeText={(t) => updateItem(i, "distanceKm", t)}
                      />
                    </View>

                    <View style={styles.fieldBlock}>
                      <Text style={styles.inputLabel}>
                        Amount (₹) {getVehicleRate(it.vehicle) > 0 ? "— Auto-calculated" : ""} <Text style={styles.reqStar}>*</Text>
                      </Text>
                      <TextInput
                        style={[
                          styles.textInput,
                          getVehicleRate(it.vehicle) > 0 && { backgroundColor: "#f8fafc", color: "#059669", fontWeight: "700" }
                        ]}
                        placeholder="₹ 0.00"
                        placeholderTextColor="#94a3b8"
                        keyboardType="numeric"
                        editable={getVehicleRate(it.vehicle) === 0}
                        value={it.amount}
                        onChangeText={(t) => updateItem(i, "amount", t)}
                      />
                    </View>
                  </>
                )}

                {/* Travel Fields */}
                {claimType === "TRAVEL" && (
                  <>
                    <View style={styles.fieldBlock}>
                      <Text style={styles.inputLabel}>
                        Travel Mode <Text style={styles.reqStar}>*</Text>
                      </Text>
                      <TouchableOpacity
                        style={styles.dropdownBtn}
                        onPress={() => setModal({ kind: "mode", itemIdx: i })}
                      >
                        <Text style={[styles.dropdownBtnText, !it.mode && { color: "#94a3b8" }]}>
                          {getTravelModeLabel(it.mode) || "Select Mode (e.g. Train, Flight, Bus)"}
                        </Text>
                        <ChevronDown size={14} color="#64748b" />
                      </TouchableOpacity>
                    </View>

                    <View style={styles.fieldBlock}>
                      {isMultiEmployee ? (
                        <View style={styles.multiEmpAmountContainer}>
                          <Text style={styles.inputLabel}>
                            Individual Ticket Fares (Per Employee) <Text style={styles.reqStar}>*</Text>
                          </Text>
                          <Text style={styles.multiEmpSubtext}>
                            Enter the travel ticket fare for each employee:
                          </Text>

                          <View style={styles.multiEmpInputsList}>
                            {employeeSelections.filter(s => s.employeeId).map((sel, sIdx) => {
                              const empVal = it.employeeAmounts?.[sel.employeeId] ?? "";
                              return (
                                <View key={sel.employeeId || sIdx} style={styles.multiEmpInputRow}>
                                  <View style={styles.multiEmpLabelBox}>
                                    <Text style={styles.multiEmpNumberTag}>#{sIdx + 1}</Text>
                                    <Text style={styles.multiEmpLabelText} numberOfLines={1}>
                                      {sel.label || `Employee #${sIdx + 1}`}
                                    </Text>
                                  </View>
                                  <TextInput
                                    style={styles.multiEmpTextInput}
                                    placeholder="₹ 0.00"
                                    placeholderTextColor="#94a3b8"
                                    keyboardType="numeric"
                                    value={empVal}
                                    onChangeText={(val) => updateItemEmployeeAmount(i, sel.employeeId, val)}
                                  />
                                </View>
                              );
                            })}
                          </View>

                          {/* Live Auto-calculated Total Badge */}
                          <View style={styles.autoTotalCard}>
                            <Text style={styles.autoTotalLabel}>Total Travel Ticket Fare:</Text>
                            <Text style={styles.autoTotalValue}>₹{Number(it.amount || 0).toLocaleString('en-IN')}</Text>
                          </View>
                        </View>
                      ) : (
                        <>
                          <Text style={styles.inputLabel}>
                            Ticket Amount (₹) <Text style={styles.reqStar}>*</Text>
                          </Text>
                          <TextInput
                            style={styles.textInput}
                            placeholder="₹ 0.00"
                            placeholderTextColor="#94a3b8"
                            keyboardType="numeric"
                            value={it.amount}
                            onChangeText={(t) => updateItem(i, "amount", t)}
                          />
                        </>
                      )}
                    </View>
                  </>
                )}

                {/* Lodging Fields — Only Hotel Amount */}
                {claimType === "LODGING" && (
                  <View style={styles.fieldBlock}>
                    <Text style={styles.inputLabel}>
                      {isSharedLodging ? "Total Combined Lodging Bill (₹)" : "Hotel / Lodging Amount (₹)"} <Text style={styles.reqStar}>*</Text>
                    </Text>
                    <TextInput
                      style={styles.textInput}
                      placeholder="₹ 0.00"
                      placeholderTextColor="#94a3b8"
                      keyboardType="numeric"
                      value={it.amount}
                      onChangeText={(t) => updateItem(i, "amount", t)}
                    />
                  </View>
                )}

                {/* Food Fields */}
                {claimType === "FOOD" && (
                  <View style={styles.fieldBlock}>
                    {isMultiEmployee ? (
                      <View style={styles.multiEmpAmountContainer}>
                        <Text style={styles.inputLabel}>
                          Individual Food Bills (Per Employee) <Text style={styles.reqStar}>*</Text>
                        </Text>
                        <Text style={styles.multiEmpSubtext}>
                          Enter the exact food amount spent for each employee below:
                        </Text>

                        <View style={styles.multiEmpInputsList}>
                          {employeeSelections.filter(s => s.employeeId).map((sel, sIdx) => {
                            const empVal = it.employeeAmounts?.[sel.employeeId] ?? "";
                            return (
                              <View key={sel.employeeId || sIdx} style={styles.multiEmpInputRow}>
                                <View style={styles.multiEmpLabelBox}>
                                  <Text style={styles.multiEmpNumberTag}>#{sIdx + 1}</Text>
                                  <Text style={styles.multiEmpLabelText} numberOfLines={1}>
                                    {sel.label || `Employee #${sIdx + 1}`}
                                  </Text>
                                </View>
                                <TextInput
                                  style={styles.multiEmpTextInput}
                                  placeholder="₹ 0.00"
                                  placeholderTextColor="#94a3b8"
                                  keyboardType="numeric"
                                  value={empVal}
                                  onChangeText={(val) => updateItemEmployeeAmount(i, sel.employeeId, val)}
                                />
                              </View>
                            );
                          })}
                        </View>

                        {/* Live Auto-calculated Total Badge */}
                        <View style={styles.autoTotalCard}>
                          <Text style={styles.autoTotalLabel}>Total Combined Food Bill:</Text>
                          <Text style={styles.autoTotalValue}>₹{Number(it.amount || 0).toLocaleString('en-IN')}</Text>
                        </View>
                      </View>
                    ) : (
                      <>
                        <Text style={styles.inputLabel}>
                          Food Bill Amount (₹) <Text style={styles.reqStar}>*</Text>
                        </Text>
                        <TextInput
                          style={styles.textInput}
                          placeholder="₹ 0.00"
                          placeholderTextColor="#94a3b8"
                          keyboardType="numeric"
                          value={it.amount}
                          onChangeText={(t) => updateItem(i, "amount", t)}
                        />
                      </>
                    )}
                  </View>
                )}

                {/* Other Fields */}
                {claimType === "OTHER" && (
                  <View style={styles.fieldBlock}>
                    <Text style={styles.inputLabel}>
                      {isMultiEmployee ? "Total Bill Amount (₹)" : "Expense Amount (₹)"} <Text style={styles.reqStar}>*</Text>
                    </Text>
                    <TextInput
                      style={styles.textInput}
                      placeholder="₹ 0.00"
                      placeholderTextColor="#94a3b8"
                      keyboardType="numeric"
                      value={it.amount}
                      onChangeText={(t) => updateItem(i, "amount", t)}
                    />
                  </View>
                )}

                {/* Purpose / Note */}
                <View style={styles.fieldBlock}>
                  <Text style={styles.inputLabel}>
                    Purpose / Description <Text style={styles.reqStar}>*</Text>
                  </Text>
                  <TextInput
                    style={[styles.textInput, { height: 60, textAlignVertical: "top" }]}
                    placeholder="e.g. Client visit dinner / Hotel stay at destination"
                    placeholderTextColor="#94a3b8"
                    multiline
                    value={it.note}
                    onChangeText={(t) => updateItem(i, "note", t)}
                  />
                </View>

                {/* Bill Proof Upload Section — Compulsory */}
                <View style={styles.fieldBlock}>
                  <View style={styles.inputLabelRow}>
                    <Text style={styles.inputLabel}>
                      Bill / Receipt Proof <Text style={styles.reqStar}>* (Compulsory)</Text>
                    </Text>
                    {it.attachments && it.attachments.length > 0 ? (
                      <View style={styles.badgeSuccess}>
                        <CheckCircle2 size={12} color="#059669" />
                        <Text style={styles.badgeSuccessText}>Proof Attached</Text>
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
                      style={[
                        styles.attachBtn,
                        (!it.attachments || it.attachments.length === 0) && styles.attachBtnRequired
                      ]}
                      onPress={() => handlePickProof(i, true)}
                      disabled={uploadingProof}
                    >
                      <Camera size={14} color="#4f46e5" />
                      <Text style={styles.attachBtnText}>Camera</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.attachBtn,
                        (!it.attachments || it.attachments.length === 0) && styles.attachBtnRequired
                      ]}
                      onPress={() => handlePickProof(i, false)}
                      disabled={uploadingProof}
                    >
                      <ImageIcon size={14} color="#4f46e5" />
                      <Text style={styles.attachBtnText}>Gallery</Text>
                    </TouchableOpacity>
                  </View>

                  {uploadingProof && (
                    <View style={styles.uploadingBox}>
                      <ActivityIndicator size="small" color="#4f46e5" />
                      <Text style={styles.uploadingText}>Uploading proof document…</Text>
                    </View>
                  )}

                  {/* Attached Proof Badges & Thumbnails (Click to Preview) */}
                  {(it.attachments || []).map((att, attIdx) => {
                    const previewUri = att.localUri || att.url;
                    return (
                      <View key={attIdx} style={styles.attachCard}>
                        <TouchableOpacity
                          style={styles.attachCardBody}
                          activeOpacity={0.7}
                          onPress={() => {
                            if (previewUri) {
                              setPhotoPreviewModal({
                                visible: true,
                                uri: previewUri,
                                title: att.name || `Receipt Proof #${attIdx + 1}`,
                              });
                            }
                          }}
                        >
                          {previewUri ? (
                            <Image
                              source={{ uri: previewUri }}
                              style={styles.attachThumb}
                              resizeMode="cover"
                            />
                          ) : (
                            <View style={styles.attachIconPlaceholder}>
                              <FileCheck size={16} color="#059669" />
                            </View>
                          )}
                          <View style={{ flex: 1 }}>
                            <Text style={styles.attachCardName} numberOfLines={1}>
                              {att.name || `Proof #${attIdx + 1}`}
                            </Text>
                            <Text style={styles.attachCardSub}>
                              {att.isUploading ? "⚡ Saving WebP in background..." : "Tap to preview receipt photo"}
                            </Text>
                          </View>
                          <View style={styles.previewEyePill}>
                            <Eye size={12} color="#4f46e5" />
                            <Text style={styles.previewEyeText}>View</Text>
                          </View>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.attachDeleteBtn}
                          onPress={() => removeAttachmentFromItem(i, attIdx)}
                        >
                          <Trash2 size={14} color="#dc2626" />
                        </TouchableOpacity>
                      </View>
                    );
                  })}


                </View>
              </View>
            ))}

            {/* Add More Items Button (Allowed for individual/multi items) */}
            <TouchableOpacity style={styles.addItemBtn} onPress={addItem}>
              <Plus size={16} color="#4f46e5" />
              <Text style={styles.addItemBtnText}>+ Add Another Expense Item</Text>
            </TouchableOpacity>
          </>
        )}

        {/* Live Calculation Preview Box */}
        {renderPreviewBox()}

        {/* Bottom Actions */}
        <View style={styles.bottomActions}>
          <TouchableOpacity
            style={styles.previewBtn}
            onPress={handlePreview}
            disabled={previewing || submitting}
          >
            {previewing ? (
              <ActivityIndicator size="small" color="#4f46e5" />
            ) : (
              <>
                <Calculator size={16} color="#4f46e5" />
                <Text style={styles.previewBtnText}>Calculate &amp; Preview Breakdown</Text>
              </>
            )}
          </TouchableOpacity>

          <View style={styles.submitRow}>
            <TouchableOpacity
              style={styles.draftBtn}
              onPress={handleCreate}
              disabled={submitting || previewing}
            >
              {submitting ? (
                <ActivityIndicator size="small" color="#4f46e5" />
              ) : (
                <Text style={styles.draftBtnText}>{claimId ? "Update Draft" : "Save Draft"}</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.submitBtn}
              onPress={handleSubmit}
              disabled={submitting || previewing}
            >
              {submitting ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <>
                  <Send size={16} color="#ffffff" />
                  <Text style={styles.submitBtnText}>Submit Claim</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      {/* Modal for Selecting Type / Count / Vehicle / Mode / City / Employee */}
      <Modal visible={!!modal} transparent animationType="fade" onRequestClose={() => setModal(null)}>
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setModal(null)}
        >
          <TouchableOpacity activeOpacity={1} style={{ width: "100%" }}>
            {renderModalContent()}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

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
  container: { flex: 1, backgroundColor: "#f8fafc" },
  scrollContent: { padding: 16, paddingBottom: 60 },
  loadingBox: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12 },
  loadingText: { fontSize: 13, color: "#64748b", fontWeight: "600" },
  reqStar: {
    color: "#dc2626",
    fontWeight: "900",
    marginLeft: 2,
  },
  sectionTitle: { fontSize: 13, fontWeight: "900", color: "#0f172a", marginTop: 14, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 },
  subLabel: { fontSize: 12, fontWeight: "700", color: "#475569" },
  dropdownBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#ffffff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
  },
  dropdownBtnText: { flex: 1, fontSize: 13, fontWeight: "700", color: "#0f172a", marginLeft: 8 },
  sharedLodgingRuleBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#ecfdf5",
    borderWidth: 1,
    borderColor: "#a7f3d0",
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  sharedLodgingRuleTitle: { fontSize: 12, fontWeight: "900", color: "#047857" },
  sharedLodgingRuleSubtext: { fontSize: 11, color: "#065f46", marginTop: 2, fontWeight: "600" },
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
  countBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#f1f5f9", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  countBtnText: { fontSize: 12, fontWeight: "800", color: "#0f172a" },
  groupInfoBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#eef2ff",
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#c7d2fe",
  },
  groupInfoText: { flex: 1, fontSize: 11, color: "#3730a3", fontWeight: "600", lineHeight: 15 },
  employeeSlotCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    marginBottom: 8,
  },
  slotAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: "#eef2ff", alignItems: "center", justifyContent: "center" },
  slotAvatarText: { fontSize: 11, fontWeight: "900", color: "#4f46e5" },
  slotLabel: { fontSize: 10, color: "#64748b", fontWeight: "700", textTransform: "uppercase" },
  slotName: { fontSize: 13, fontWeight: "800", color: "#0f172a", marginTop: 2 },
  changeEmpBtn: { backgroundColor: "#f1f5f9", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  changeEmpBtnText: { fontSize: 11, fontWeight: "800", color: "#4f46e5" },

  // City Selector Card Styles
  citySelectorCard: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    marginBottom: 12,
    shadowColor: "#000",
    shadowOpacity: 0.02,
    shadowRadius: 4,
    elevation: 1,
  },
  citySelectorHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  citySelectorTitle: {
    fontSize: 12,
    fontWeight: "900",
    color: "#0f172a",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  cityClassPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  cityClassPillText: {
    fontSize: 10,
    fontWeight: "900",
  },
  cityDropdownBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#f8fafc",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  cityDropdownBtnText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#0f172a",
  },
  cityHelperText: {
    fontSize: 11,
    color: "#64748b",
    fontWeight: "600",
    marginTop: 8,
    lineHeight: 15,
  },
  modalSearchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#f1f5f9",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 10,
  },
  modalSearchInput: {
    flex: 1,
    fontSize: 13,
    fontWeight: "700",
    color: "#0f172a",
    padding: 0,
  },
  customCityPromptBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#eef2ff",
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#c7d2fe",
  },
  customCityPromptText: {
    fontSize: 11,
    color: "#4338ca",
    fontWeight: "600",
  },
  cityModalItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },

  // Multi-Employee Per-Person Amount Row Styles
  multiEmpAmountContainer: {
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  multiEmpSubtext: {
    fontSize: 11,
    color: "#64748b",
    marginBottom: 10,
    fontWeight: "500",
  },
  multiEmpInputsList: {
    gap: 8,
  },
  multiEmpInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#ffffff",
    borderRadius: 10,
    padding: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  multiEmpLabelBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  multiEmpNumberTag: {
    fontSize: 10,
    fontWeight: "900",
    color: "#4f46e5",
    backgroundColor: "#eef2ff",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  multiEmpLabelText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#0f172a",
    flex: 1,
  },
  multiEmpTextInput: {
    width: 110,
    backgroundColor: "#f8fafc",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 13,
    fontWeight: "800",
    color: "#0f172a",
    textAlign: "right",
  },
  autoTotalCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#eef2ff",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#c7d2fe",
  },
  autoTotalLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: "#3730a3",
    textTransform: "uppercase",
  },
  autoTotalValue: {
    fontSize: 14,
    fontWeight: "900",
    color: "#4338ca",
  },

  emptyNotice: { backgroundColor: "#ffffff", borderRadius: 12, padding: 18, alignItems: "center", borderWidth: 1, borderColor: "#e2e8f0" },
  emptyNoticeText: { fontSize: 12, color: "#64748b", fontWeight: "600" },
  itemCard: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    marginBottom: 12,
  },
  itemCardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: "#f1f5f9" },
  itemIndexTitle: { fontSize: 12, fontWeight: "900", color: "#4f46e5", textTransform: "uppercase" },
  deleteItemBtn: { padding: 4 },
  fieldBlock: { marginBottom: 12 },
  inputLabel: { fontSize: 11, fontWeight: "700", color: "#475569", marginBottom: 6 },
  datePickerBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#f8fafc",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  datePickerBtnText: { fontSize: 13, fontWeight: "700", color: "#0f172a" },
  textInput: {
    backgroundColor: "#f8fafc",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    fontWeight: "700",
    color: "#0f172a",
  },
  attachBtnRow: { flexDirection: "row", gap: 10, marginTop: 4 },
  attachBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#f1f5f9",
    borderRadius: 10,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  attachBtnText: { fontSize: 12, fontWeight: "800", color: "#4f46e5" },
  uploadingBox: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 },
  uploadingText: { fontSize: 11, color: "#64748b", fontWeight: "600" },
  attachCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 12,
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  attachCardBody: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 8,
  },
  attachThumb: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: "#f1f5f9",
  },
  attachIconPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: "#ecfdf5",
    alignItems: "center",
    justifyContent: "center",
  },
  attachCardName: {
    fontSize: 12,
    fontWeight: "800",
    color: "#0f172a",
  },
  attachCardSub: {
    fontSize: 10,
    fontWeight: "600",
    color: "#64748b",
    marginTop: 2,
  },
  previewEyePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#eef2ff",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  previewEyeText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#4f46e5",
  },
  attachDeleteBtn: {
    paddingHorizontal: 12,
    paddingVertical: 14,
    borderLeftWidth: 1,
    borderLeftColor: "#f1f5f9",
    alignItems: "center",
    justifyContent: "center",
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
  attachPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#f0fdf4",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 6,
    borderWidth: 1,
    borderColor: "#bbf7d0",
  },
  attachPillText: { flex: 1, fontSize: 10, color: "#166534", fontWeight: "600" },
  addItemBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#eef2ff",
    borderRadius: 10,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "#c7d2fe",
    borderStyle: "dashed",
    marginBottom: 16,
  },
  addItemBtnText: { fontSize: 12, fontWeight: "800", color: "#4f46e5" },
  inputLabelRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  badgeSuccess: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "#ecfdf5", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, borderWidth: 1, borderColor: "#a7f3d0" },
  badgeSuccessText: { fontSize: 10, fontWeight: "800", color: "#059669" },
  badgeCompulsory: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "#fef2f2", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, borderWidth: 1, borderColor: "#fecaca" },
  badgeCompulsoryText: { fontSize: 10, fontWeight: "800", color: "#dc2626" },
  attachBtnRequired: { borderColor: "#fca5a5", backgroundColor: "#fff5f5" },
  missingProofBanner: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#fef2f2", padding: 8, borderRadius: 8, marginTop: 8, borderWidth: 1, borderColor: "#fecaca" },
  missingProofText: { flex: 1, fontSize: 10, color: "#991b1b", fontWeight: "600", lineHeight: 14 },
  previewContainer: { marginTop: 16 },
  previewHeaderCard: { backgroundColor: "#0f172a", borderRadius: 16, padding: 16, marginBottom: 12, shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 8, elevation: 3 },
  previewHeaderRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  previewIconBox: { width: 34, height: 34, borderRadius: 10, backgroundColor: "#4f46e5", alignItems: "center", justifyContent: "center" },
  previewMainTitle: { fontSize: 14, fontWeight: "900", color: "#ffffff" },
  previewSubTitle: { fontSize: 11, color: "#94a3b8", marginTop: 2 },
  previewDestBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginBottom: 12,
  },
  previewDestText: {
    fontSize: 11,
    color: "#c7d2fe",
    fontWeight: "600",
  },
  grandSummaryGrid: { flexDirection: "row", backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 12, padding: 12, alignItems: "center" },
  grandSummaryCol: { flex: 1, alignItems: "center" },
  grandSummaryDivider: { width: 1, height: 28, backgroundColor: "rgba(255,255,255,0.12)" },
  grandSummaryLabel: { fontSize: 10, color: "#94a3b8", fontWeight: "700", textTransform: "uppercase" },
  grandSummaryValClaimed: { fontSize: 15, fontWeight: "900", color: "#ffffff", marginTop: 2 },
  grandSummaryValAllowed: { fontSize: 15, fontWeight: "900", color: "#34d399", marginTop: 2 },
  grandSummaryValExcess: { fontSize: 15, fontWeight: "900", color: "#94a3b8", marginTop: 2 },
  sharedOccupantsHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  sharedBedIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#eef2ff",
    alignItems: "center",
    justifyContent: "center",
  },
  occupantsPillsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 12,
  },
  occupantPill: {
    backgroundColor: "#f8fafc",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  occupantPillText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#334155",
  },
  previewEmpCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    shadowColor: "#000",
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  previewEmpHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: "#f1f5f9" },
  previewAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: "#eef2ff", alignItems: "center", justifyContent: "center" },
  previewEmpName: { fontSize: 13, fontWeight: "900", color: "#0f172a" },
  previewEmpSub: { fontSize: 11, color: "#64748b", marginTop: 2, fontWeight: "600" },
  levelPill: { backgroundColor: "#f1f5f9", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  levelPillText: { fontSize: 10, fontWeight: "800", color: "#4f46e5" },
  coClaimantBadge: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#f0f9ff", padding: 8, borderRadius: 8, marginBottom: 10, borderWidth: 1, borderColor: "#bae6fd" },
  coClaimantText: { flex: 1, fontSize: 11, color: "#0369a1", fontWeight: "600" },
  previewItemCard: { backgroundColor: "#f8fafc", borderRadius: 12, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: "#f1f5f9" },
  previewItemTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 },
  previewItemType: { fontSize: 12, fontWeight: "800", color: "#0f172a" },
  previewItemDate: { fontSize: 10, color: "#64748b", marginTop: 2, fontWeight: "600" },
  tagAllowed: { backgroundColor: "#ecfdf5", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1, borderColor: "#a7f3d0" },
  tagAllowedText: { fontSize: 10, fontWeight: "800", color: "#065f46" },
  tagExcess: { backgroundColor: "#fef2f2", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1, borderColor: "#fecaca" },
  tagExcessText: { fontSize: 10, fontWeight: "800", color: "#991b1b" },
  previewFiguresRow: { flexDirection: "row", backgroundColor: "#ffffff", borderRadius: 8, padding: 10, borderWidth: 1, borderColor: "#e2e8f0", marginBottom: 8 },
  previewFigureBlock: { flex: 1, alignItems: "center" },
  previewFigureLabel: { fontSize: 9, color: "#64748b", fontWeight: "700", textTransform: "uppercase" },
  previewFigureVal: { fontSize: 13, fontWeight: "800", color: "#0f172a", marginTop: 2 },
  plainExplanationCard: {
    padding: 10,
    borderRadius: 10,
    marginBottom: 8,
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
  plainExplanationHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  plainExplanationTitle: {
    fontSize: 11,
    fontWeight: "800",
  },
  plainExplanationBody: {
    fontSize: 11,
    fontWeight: "600",
    lineHeight: 16,
  },
  formulaBox: { backgroundColor: "#eef2ff", borderRadius: 8, padding: 8, borderWidth: 1, borderColor: "#c7d2fe", marginBottom: 6 },
  formulaLabel: { fontSize: 10, fontWeight: "800", color: "#3730a3", textTransform: "uppercase" },
  formulaText: { fontSize: 11, color: "#4338ca", fontWeight: "600", marginTop: 2, lineHeight: 15 },
  stepsList: { marginTop: 4, gap: 3 },
  stepRow: { flexDirection: "row", alignItems: "flex-start", gap: 6 },
  stepBullet: { width: 4, height: 4, borderRadius: 2, backgroundColor: "#6366f1", marginTop: 6 },
  stepText: { flex: 1, fontSize: 10, color: "#475569", lineHeight: 14 },
  previewItemDesc: { fontSize: 10, color: "#64748b", fontStyle: "italic", marginTop: 4 },
  previewEmpFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingTop: 10, borderTopWidth: 1, borderTopColor: "#e2e8f0", marginTop: 4 },
  empFooterLabel: { fontSize: 11, fontWeight: "800", color: "#475569" },
  empFooterFigures: { flexDirection: "row", gap: 8, alignItems: "center" },
  empFooterReq: { fontSize: 11, color: "#64748b", fontWeight: "600" },
  empFooterAll: { fontSize: 11, color: "#059669", fontWeight: "800" },
  empFooterExc: { fontSize: 11, color: "#dc2626", fontWeight: "800" },
  policyComplianceCallout: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#ecfdf5", padding: 12, borderRadius: 12, borderWidth: 1, borderColor: "#a7f3d0", marginTop: 4 },
  policyComplianceText: { flex: 1, fontSize: 11, color: "#065f46", fontWeight: "600", lineHeight: 16 },
  bottomActions: { marginTop: 20, gap: 10 },
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
    backgroundColor: "#ffffff",
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
    gap: 6,
    backgroundColor: "#059669",
    borderRadius: 12,
    paddingVertical: 14,
  },
  submitBtnText: { fontSize: 13, fontWeight: "800", color: "#ffffff" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", padding: 20 },
  modalCard: { backgroundColor: "#ffffff", borderRadius: 16, padding: 16, maxHeight: 450 },
  modalTitle: { fontSize: 15, fontWeight: "800", color: "#0f172a", marginBottom: 12 },
  modalItem: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#f1f5f9" },
  modalItemText: { fontSize: 13, fontWeight: "700", color: "#0f172a" },
  modalItemSubtext: { fontSize: 11, color: "#64748b", marginTop: 2 },
  modalCloseBtn: { marginTop: 12, alignItems: "center", paddingVertical: 10 },
  modalCloseText: { fontSize: 13, fontWeight: "700", color: "#dc2626" },
});

export default CreateExpenseClaimScreen;
