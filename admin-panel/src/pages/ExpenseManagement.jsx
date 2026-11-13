import { AnimatePresence, motion } from 'framer-motion';
import {
  Bike,
  Bus,
  Car,
  CarTaxiFront,
  Check,
  ChevronDown,
  Download,
  Edit2,
  Landmark,
  Layers,
  LayoutGrid,
  List,
  Loader2,
  Plane,
  Plus,
  Save,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  TrainFront,
  Trash2,
  X,
  Zap
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { useSelector } from 'react-redux';
import api from '../api/axios';
import FinanceHeadPanel from '../components/expense/FinanceHeadPanel';

const CITY_CLASSES = ['A+', 'A', 'B', 'C'];
const CITY_CLASS_PRIORITY = { 'A+': 1, 'A': 2, 'B': 3, 'C': 4 };
const EXPENSE_CATEGORIES = ['LODGING', 'FOOD', 'CONVEYANCE', 'TRAVEL', 'OTHER', 'STOCK_PURCHASE'];
const CALC_METHODS = ['ENTITLEMENT_CAP', 'KM_RATE', 'RULE_BASED', 'ACTUAL'];
const UNITS = ['per_day', 'per_km', 'per_item', 'percentage', 'flat'];
const SHARED_RULES = [
  { value: 'RULE_75', label: '75% Rule — (Higher + Lower) x 75%' },
  { value: 'RULE_50', label: '50% Rule — (Higher + Lower) x 50%' },
  { value: 'HIGHER_ONLY', label: 'Higher Only — higher entitlement' },
  { value: 'HIGHER_PLUS_LOWER', label: 'Higher + Lower — (Higher + Lower) 100%' },
];

const TABS = [
  { key: 'policies', label: 'Policies', icon: <ShieldCheck size={16} /> },
  { key: 'approvalLimits', label: 'Pay Limit Set & Rules', icon: <ShieldAlert size={16} /> },
  { key: 'types', label: 'Expense Types', icon: <Layers size={16} /> },
  { key: 'cities', label: 'City Classes', icon: <Landmark size={16} /> },
  { key: 'travelModes', label: 'Travel Modes / Vehicle Types', icon: <Plane size={16} /> },
  { key: 'entitlements', label: 'Level Entitlements', icon: <Sliders size={16} /> },
];

const DEFAULT_CLAIM_TYPE_OPTIONS = [
  { code: 'OTHER', name: 'Other Claim' },
  { code: 'STOCK_PURCHASE', name: 'Stock Purchase Claim' },
  { code: 'LODGING', name: 'Lodging / Stay Claim' },
  { code: 'TRAVEL', name: 'Travel Claim' },
  { code: 'CONVEYANCE', name: 'Local Conveyance Claim' },
  { code: 'FOOD', name: 'Food / Daily Allowance' },
];

const normalizeClaimTypeCode = (code) => {
  const c = String(code || '').trim().toUpperCase();
  if (!c) return '';
  if (c === 'PETROL' || c === 'LOCAL_CONVEYANCE' || c === 'LOCAL_TRAVEL') return 'CONVEYANCE';
  if (c === 'STAY' || c === 'HOTEL' || c === 'ACCOMMODATION') return 'LODGING';
  if (c === 'MEAL' || c === 'DA' || c === 'DAILY_ALLOWANCE') return 'FOOD';
  if (c === 'STOCK' || c === 'PURCHASE') return 'STOCK_PURCHASE';
  if (c === 'MISC' || c === 'MISCELLANEOUS') return 'OTHER';
  return c;
};

// Travel mode subtypes (Vehicle Types) & per-km rate keys (₹/km comes from the active policy's conveyanceRates)
const RATE_KEY_LABELS = { twoWheeler: '2-Wheeler rate', car: 'Car / 4W rate', eBike: 'E-Bike rate', eCar: 'E-Car rate' };
const RATE_KEY_OPTIONS = [
  { value: '', label: 'None' },
  { value: 'twoWheeler', label: '2-Wheeler' },
  { value: 'car', label: 'Car (4W)' },
  { value: 'eBike', label: 'E-Bike' },
  { value: 'eCar', label: 'E-Car' },
];
const WORKFLOW_OPTIONS = [
  { value: 'STANDARD', label: 'Standard travel fields' },
  { value: 'KM_RATE', label: 'Own Vehicle – KM × rate' },
];
const TRAVEL_CITY_CLASSES = ['A+', 'A', 'B', 'C', 'ALL'];
const toSubtypeCode = (s) => String(s || '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
const fmtTravelMax = (v) => (v === null || v === undefined || v === '')
  ? 'Actuals'
  : Number(v) === 0 ? '₹0 (not payable)' : `₹${Number(v).toLocaleString('en-IN')}`;

const getTravelModeIcon = (codeOrName, size = 18) => {
  const key = String(codeOrName || '').toUpperCase();
  if (key.includes('TRAIN') || key.includes('RAIL')) return <TrainFront size={size} />;
  if (key.includes('BUS')) return <Bus size={size} />;
  if (key.includes('FLIGHT') || key.includes('AIR') || key.includes('PLANE')) return <Plane size={size} />;
  if (key.includes('TAXI') || key.includes('AUTO') || key.includes('CAB')) return <CarTaxiFront size={size} />;
  if (key.includes('_EV') || key.includes('EBIKE') || key.includes('ECAR') || key.includes('E-BIKE') || key.includes('E-CAR')) return <Zap size={size} />;
  if (key.includes('TWO_WHEELER') || key.includes('2W') || key.includes('2-WHEELER') || key.includes('BIKE')) return <Bike size={size} />;
  if (key.includes('FOUR_WHEELER') || key.includes('4W') || key.includes('4-WHEELER') || key.includes('CAR')) return <Car size={size} />;
  return <Plane size={size} />;
};

const ExpenseManagement = () => {
  const { user } = useSelector((state) => state.auth || {});
  const userRole = (user?.role || '').toLowerCase();
  const userRoleCode = (user?.roleCode || '').toUpperCase();
  const isSuperAdmin = userRole === 'superadmin' || userRole === 'super_admin' || userRoleCode === 'TCSA1' || user?.scope === 'GLOBAL';

  const [activeTab, setActiveTab] = useState('policies');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Company Switcher & Scoping State
  const [companies, setCompanies] = useState([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState(() => {
    try {
      const userComp = user?.companyId?._id || user?.companyId || user?.company?._id || user?.company || '';
      if (!isSuperAdmin && userComp) return String(userComp);
      const stored = localStorage.getItem('selectedCompanyId');
      if (stored && stored !== 'ALL') return stored;
      if (userComp) return String(userComp);
      const userStr = localStorage.getItem('user') || localStorage.getItem('userInfo');
      if (userStr) {
        const parsed = JSON.parse(userStr);
        const c = parsed.companyId?._id || parsed.companyId || parsed.company?._id || parsed.company || '';
        return c ? String(c) : '';
      }
    } catch (_) { }
    return '';
  });

  const [policies, setPolicies] = useState([]);
  const [types, setTypes] = useState([]);
  const [cities, setCities] = useState([]);
  const [travelModes, setTravelModes] = useState([]);
  const [entitlements, setEntitlements] = useState([]);
  const [levels, setLevels] = useState([]);
  const [designations, setDesignations] = useState([]);
  const [employeeDesignations, setEmployeeDesignations] = useState([]);
  const [grades, setGrades] = useState([]);

  const effectiveCompanyId = useMemo(() => {
    const userComp = user?.companyId?._id || user?.companyId || user?.company?._id || user?.company || '';
    const raw = isSuperAdmin ? (selectedCompanyId || userComp) : (userComp || selectedCompanyId);
    const idStr = raw && typeof raw === 'object' ? String(raw._id || '') : String(raw || '');
    return idStr && idStr.toUpperCase() !== 'ALL' ? idStr : '';
  }, [isSuperAdmin, selectedCompanyId, user]);

  const belongsToActiveCompany = useCallback((doc) => {
    if (!doc) return false;
    if (!effectiveCompanyId) return true;
    const docComp = doc.companyId?._id || doc.companyId || doc.company?._id || doc.company;
    if (!docComp) return true;
    return String(docComp) === String(effectiveCompanyId);
  }, [effectiveCompanyId]);

  // Entitlement View Filter
  const [selectedLevelFilter, setSelectedLevelFilter] = useState('ALL');
  const [entitlementViewMode, setEntitlementViewMode] = useState('cards'); // 'cards' or 'table'

  // City Class Filter
  const [selectedCityClassFilter, setSelectedCityClassFilter] = useState('ALL');

  // Policy modal state
  // Default official lodging rules (FAQ Sections B, C, D)
  const DEFAULT_LODGING_RULES = {
    singleEmployee: { ruleType: 'INDIVIDUAL_100', percent: 100, description: '100% of individual category stay entitlement' },
    twoEmployees: { ruleType: 'COMBINED_PERCENT', percent: 75, description: '75% of combined allowed budget of both' },
    threeEmployees: { ruleType: 'HIGHEST_PLUS_LOWEST', percent: 75, description: 'Combined of highest and lowest allowance amongst the 3' },
    fourPlusEmployees: { ruleType: 'SPLIT_IN_PAIRS_75', percent: 75, description: 'Split allowance in 2s (75% combined per pair)' },
  };

  // Empty policy form with all fields clear for Add Policy mode
  const EMPTY_POLICY_FORM = {
    name: '', code: '', description: '', version: '', status: 'draft',
    effectiveFrom: '', effectiveTo: '', approvalRequired: false,
    sharedLodgingRule: 'HIGHER_PLUS_LOWER',
    sharedLodgingPercent: '',
    relativeStayPercent: 50,
    lodgingRules: {
      singleEmployee: { ruleType: 'INDIVIDUAL_100', percent: '', description: '' },
      twoEmployees: { ruleType: 'COMBINED_PERCENT', percent: '', description: '' },
      threeEmployees: { ruleType: 'HIGHEST_PLUS_LOWEST', percent: '', description: '' },
      fourPlusEmployees: { ruleType: 'SPLIT_IN_PAIRS_75', percent: '', description: '' },
    },
    approvalEngine: 'NONE',
    conveyanceRates: { twoWheeler: '', car: '', eBike: '', eCar: '' },
    localTravelFoodAllowed: false,
    deadlineRules: [],
    approvalLimitRules: [],
  };

  // Policy modal state
  const [policyModal, setPolicyModal] = useState({ open: false, editing: null });
  const [policyForm, setPolicyForm] = useState(EMPTY_POLICY_FORM);

  // Approval Limit Rule modal state (dynamic Role/Level payment rules for Other Claims)
  const EMPTY_LIMIT_RULE_FORM = {
    roleName: '',
    levelId: '',
    levelNumber: '',
    maxAmount: '',
    description: '',
    status: 'active',
  };
  const [limitRuleModal, setLimitRuleModal] = useState({ open: false, editingIndex: null });
  const [limitRuleForm, setLimitRuleForm] = useState(EMPTY_LIMIT_RULE_FORM);

  // Type modal state
  const [typeModal, setTypeModal] = useState({ open: false, editing: null });
  const [typeForm, setTypeForm] = useState({
    name: '', code: '', description: '', category: 'OTHER',
    calculationMethod: 'ENTITLEMENT_CAP', hrApprovalRequired: false,
    payLimitEnabled: false, cfoApprovalRequired: false,
    status: 'active', order: 0,
  });

  // City modal state
  const [cityModal, setCityModal] = useState({ open: false, editing: null });
  const [cityForm, setCityForm] = useState({ city: '', cityClass: 'C', state: '', aliases: '', status: 'active' });

  // Travel mode modal state
  const [tmModal, setTmModal] = useState({ open: false, editing: null });
  const [tmForm, setTmForm] = useState({ name: '', code: '', description: '', status: 'active', order: 0, conveyanceRateKey: '', ratePerKm: '', subtypes: [] });
  const [editingRateModeId, setEditingRateModeId] = useState(null);
  const [editingRateVal, setEditingRateVal] = useState('');

  // Travel entitlement (Level Entitlements → TRAVEL rows) modal state
  const EMPTY_TRAVEL_ENT_FORM = { levelNumber: '0', gradeCode: '', cityClass: 'ALL', travelModeId: '', selectedModes: {}, selected: {}, maxAmount: '', status: 'active' };
  const [travelEntModal, setTravelEntModal] = useState({ open: false, editing: null });
  const [travelEntForm, setTravelEntForm] = useState(EMPTY_TRAVEL_ENT_FORM);

  // Entitlement modal state
  const [entModal, setEntModal] = useState({ open: false, editing: null });
  const [entForm, setEntForm] = useState({
    levelNumber: '', levelName: '', gradeCode: '', cityClass: 'A+',
    expenseTypeCode: 'LODGING', amount: '', unit: 'per_day',
    formula: '', ruleCode: '', status: 'active',
  });

  const [deleteConfirm, setDeleteConfirm] = useState({ show: false, id: null, kind: '' });
  const [dropdownOpen, setDropdownOpen] = useState({});

  const dropdownRefs = useRef({});

  const getReqConfig = (overrideCompId) => {
    const userComp = user?.companyId?._id || user?.companyId || user?.company?._id || user?.company;
    const rawCompId = overrideCompId || (isSuperAdmin ? selectedCompanyId : (userComp || selectedCompanyId)) || userComp;
    const compId = rawCompId && typeof rawCompId === 'object' ? rawCompId._id : rawCompId;
    if (!compId || String(compId).toUpperCase() === 'ALL') return {};
    return {
      params: { companyId: String(compId) },
      headers: { 'x-company-id': String(compId) }
    };
  };

  const fetchCompanies = async () => {
    try {
      const res = await api.get('/admin/console/companies');
      const list = res.data.data || [];
      setCompanies(list);
      const hasValidSelected = selectedCompanyId && list.some((c) => String(c._id) === String(selectedCompanyId));
      if (list.length > 0 && !hasValidSelected) {
        setSelectedCompanyId(list[0]._id);
        localStorage.setItem('selectedCompanyId', list[0]._id);
        localStorage.setItem('selectedCompanyName', list[0].name);
        localStorage.setItem('selectedCompanyCode', list[0].code);
      }
    } catch (_) { }
  };

  const loadedTabsRef = useRef(new Set());

  const loadPolicies = async (config) => {
    try {
      const [polRes, lvlRes] = await Promise.all([
        api.get('/expense/policies', config),
        api.get('/expense/levels', config).catch(() => ({ data: { data: [], designations: [], employeeDesignations: [] } })),
      ]);
      const polList = Array.isArray(polRes?.data?.data) ? polRes.data.data.filter(belongsToActiveCompany) : [];
      const lvlList = Array.isArray(lvlRes?.data?.data) ? lvlRes.data.data.filter(belongsToActiveCompany) : [];
      const desigList = Array.isArray(lvlRes?.data?.designations) ? lvlRes.data.designations.filter(belongsToActiveCompany) : [];
      const empDesigList = Array.isArray(lvlRes?.data?.employeeDesignations) ? lvlRes.data.employeeDesignations : [];
      setPolicies(polList);
      setLevels(lvlList);
      setDesignations(desigList);
      setEmployeeDesignations(empDesigList);
    } catch (_) { }
  };

  const loadTypes = async (config) => {
    try {
      const res = await api.get('/expense/types', config);
      const list = Array.isArray(res?.data?.data) ? res.data.data.filter(belongsToActiveCompany) : [];
      setTypes(list);
    } catch (_) { }
  };

  const loadCities = async (config) => {
    try {
      const res = await api.get('/expense/cities', config);
      const list = Array.isArray(res?.data?.data) ? res.data.data.filter(belongsToActiveCompany) : [];
      setCities(list);
    } catch (_) { }
  };

  const loadTravelModes = async (config) => {
    try {
      const res = await api.get('/expense/travel-modes/all', config);
      const rawModes = Array.isArray(res.data?.data) ? res.data.data.filter(belongsToActiveCompany) : [];
      const hasSplitVehicleModes = rawModes.some((m) =>
        ['TWO_WHEELER_PETROL', 'TWO_WHEELER_EV', 'FOUR_WHEELER_PETROL', 'FOUR_WHEELER_EV'].includes(String(m?.code || '').toUpperCase())
      );
      const seenModeCodes = new Set();
      const dedupedModes = [];
      for (const m of rawModes) {
        if (!m) continue;
        const mCode = String(m.code || m._id || '').trim().toUpperCase();
        if (!mCode || seenModeCodes.has(mCode)) continue;
        if (mCode === 'OWN_VEHICLE' || mCode === 'COMPANY_VEHICLE') continue;
        if (hasSplitVehicleModes && (mCode === 'TWO_WHEELER' || mCode === 'FOUR_WHEELER')) continue;
        seenModeCodes.add(mCode);
        const seenSubCodes = new Set();
        const uniqueSubs = (Array.isArray(m.subtypes) ? m.subtypes : []).filter((s) => {
          const sCode = String(s?.code || s?._id || '').trim().toUpperCase();
          if (!sCode || seenSubCodes.has(sCode)) return false;
          seenSubCodes.add(sCode);
          return true;
        });
        dedupedModes.push({ ...m, subtypes: uniqueSubs });
      }
      setTravelModes(dedupedModes);
    } catch (_) { }
  };

  const loadEntitlements = async (config) => {
    try {
      const [entRes, lvlRes, grdRes] = await Promise.all([
        api.get('/expense/entitlements/all', config),
        api.get('/expense/levels', config).catch(() => ({ data: { data: [], designations: [], employeeDesignations: [] } })),
        api.get('/expense/grades', config).catch(() => ({ data: { data: [] } })),
      ]);
      setEntitlements(Array.isArray(entRes?.data?.data) ? entRes.data.data.filter(belongsToActiveCompany) : []);
      setLevels(Array.isArray(lvlRes?.data?.data) ? lvlRes.data.data.filter(belongsToActiveCompany) : []);
      setDesignations(Array.isArray(lvlRes?.data?.designations) ? lvlRes.data.designations.filter(belongsToActiveCompany) : []);
      setEmployeeDesignations(Array.isArray(lvlRes?.data?.employeeDesignations) ? lvlRes.data.employeeDesignations : []);
      setGrades(Array.isArray(grdRes?.data?.data) ? grdRes.data.data.filter(belongsToActiveCompany) : []);
    } catch (_) { }
  };

  const loadData = useCallback(async (targetCompId = effectiveCompanyId, tabToLoad = activeTab, force = true) => {
    const tabKey = `${targetCompId}_${tabToLoad}`;
    if (!force && loadedTabsRef.current.has(tabKey)) {
      return;
    }

    try {
      setLoading(true);
      const config = getReqConfig(targetCompId);

      if (tabToLoad === 'policies' || tabToLoad === 'approvalLimits') {
        await Promise.all([loadPolicies(config), loadTypes(config)]);
      } else if (tabToLoad === 'types') {
        await Promise.all([loadTypes(config), loadPolicies(config)]);
      } else if (tabToLoad === 'cities') {
        await loadCities(config);
      } else if (tabToLoad === 'travelModes') {
        await Promise.all([loadTravelModes(config), policies.length === 0 ? loadPolicies(config) : Promise.resolve()]);
      } else if (tabToLoad === 'entitlements') {
        await Promise.all([
          loadEntitlements(config),
          loadTravelModes(config),
          policies.length === 0 ? loadPolicies(config) : Promise.resolve(),
          types.length === 0 ? loadTypes(config) : Promise.resolve(),
          cities.length === 0 ? loadCities(config) : Promise.resolve(),
        ]);
      }

      loadedTabsRef.current.add(tabKey);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to load expense configuration');
    } finally {
      setLoading(false);
    }
  }, [effectiveCompanyId, activeTab, policies.length, types.length, cities.length, belongsToActiveCompany]);

  useEffect(() => {
    if (isSuperAdmin) {
      fetchCompanies();
    }
    loadedTabsRef.current.clear();
    setPolicies([]);
    setTypes([]);
    setCities([]);
    setTravelModes([]);
    setEntitlements([]);
    setLevels([]);
    setDesignations([]);
    setEmployeeDesignations([]);
    setGrades([]);
    loadData(effectiveCompanyId, activeTab, true);
  }, [effectiveCompanyId]);

  useEffect(() => {
    loadData(effectiveCompanyId, activeTab, false);
  }, [activeTab]);

  useEffect(() => {
    const handler = (e) => {
      Object.keys(dropdownRefs.current).forEach((k) => {
        if (dropdownRefs.current[k] && !dropdownRefs.current[k].contains(e.target)) {
          setDropdownOpen((p) => ({ ...p, [k]: false }));
        }
      });
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const toggleDrop = (key) => setDropdownOpen((p) => ({ ...p, [key]: !p[key] }));

  // ── Policy handlers ──
  const openPolicyModal = (pol = null) => {
    if (pol) {
      setPolicyForm({
        name: pol.name || '',
        code: pol.code || '',
        description: pol.description || '',
        version: pol.version || '',
        status: pol.status || 'draft',
        effectiveFrom: pol.effectiveFrom ? String(pol.effectiveFrom).slice(0, 10) : '',
        effectiveTo: pol.effectiveTo ? String(pol.effectiveTo).slice(0, 10) : '',
        approvalRequired: !!pol.approvalRequired,
        sharedLodgingRule: pol.sharedLodgingRule || 'HIGHER_PLUS_LOWER',
        sharedLodgingPercent: pol.sharedLodgingPercent !== undefined ? pol.sharedLodgingPercent : 75,
        relativeStayPercent: pol.relativeStayPercent !== undefined ? pol.relativeStayPercent : 50,
        lodgingRules: {
          singleEmployee: { ...DEFAULT_LODGING_RULES.singleEmployee, ...(pol.lodgingRules?.singleEmployee || {}) },
          twoEmployees: {
            ...DEFAULT_LODGING_RULES.twoEmployees,
            ...(pol.lodgingRules?.twoEmployees || {}),
            ruleType: pol.lodgingRules?.twoEmployees?.ruleType || (pol.sharedLodgingRule === 'HIGHER_ONLY' ? 'HIGHER_ONLY' : 'COMBINED_PERCENT'),
          },
          threeEmployees: { ...DEFAULT_LODGING_RULES.threeEmployees, ...(pol.lodgingRules?.threeEmployees || {}) },
          fourPlusEmployees: { ...DEFAULT_LODGING_RULES.fourPlusEmployees, ...(pol.lodgingRules?.fourPlusEmployees || {}) },
        },
        approvalEngine: pol.approvalEngine || (pol.approvalRequired ? 'HR' : 'NONE'),
        conveyanceRates: {
          twoWheeler: pol.conveyanceRates?.twoWheeler ?? '',
          car: pol.conveyanceRates?.car ?? '',
          eBike: pol.conveyanceRates?.eBike ?? '',
          eCar: pol.conveyanceRates?.eCar ?? '',
        },
        localTravelFoodAllowed: !!pol.localTravelFoodAllowed,
        deadlineRules: Array.isArray(pol.deadlineRules) ? pol.deadlineRules.map(r => ({
          ruleName: r.ruleName || '',
          days: r.days !== undefined && r.days !== null ? r.days : '',
          action: r.action || 'warning',
          description: r.description || '',
        })) : [],
        approvalLimitRules: Array.isArray(pol.approvalLimitRules) ? pol.approvalLimitRules.map(r => ({
          ...(r._id ? { _id: r._id } : {}),
          roleName: r.roleName || '',
          roleKey: r.roleKey || '',
          levelId: r.levelId || '',
          levelNumber: r.levelNumber !== undefined && r.levelNumber !== null ? String(r.levelNumber) : '',
          minAmount: r.minAmount !== undefined && r.minAmount !== null ? String(r.minAmount) : '0',
          maxAmount: r.maxAmount !== undefined && r.maxAmount !== null ? String(r.maxAmount) : '',
          description: r.description || '',
          status: r.status || 'active',
        })) : [],
      });
    } else {
      // In Add Policy mode: keep ALL input fields completely empty
      setPolicyForm({
        ...EMPTY_POLICY_FORM,
        lodgingRules: {
          singleEmployee: { ruleType: 'INDIVIDUAL_100', percent: '', description: '' },
          twoEmployees: { ruleType: 'COMBINED_PERCENT', percent: '', description: '' },
          threeEmployees: { ruleType: 'HIGHEST_PLUS_LOWEST', percent: '', description: '' },
          fourPlusEmployees: { ruleType: 'SPLIT_IN_PAIRS_75', percent: '', description: '' },
        },
        conveyanceRates: { twoWheeler: '', car: '', eBike: '', eCar: '' },
        deadlineRules: [],
        approvalLimitRules: [],
      });
    }
    setPolicyModal({ open: true, editing: pol });
  };

  const savePolicy = async (e) => {
    e.preventDefault();
    const relRaw = String(policyForm.relativeStayPercent ?? '').trim();
    const relVal = Number(relRaw);
    if (relRaw === '' || !Number.isFinite(relVal) || relVal < 0 || relVal > 100) {
      toast.error('Relative Stay Allowance Percentage must be a number from 0 to 100.');
      return;
    }
    try {
      setSaving(true);
      const payload = {
        ...policyForm,
        relativeStayPercent: relVal,
        version: policyForm.version || '1.0',
        sharedLodgingRule: policyForm.lodgingRules?.twoEmployees?.ruleType === 'HIGHER_ONLY' ? 'HIGHER_ONLY' : 'HIGHER_PLUS_LOWER',
        sharedLodgingPercent: policyForm.lodgingRules?.twoEmployees?.percent !== '' && policyForm.lodgingRules?.twoEmployees?.percent !== undefined
          ? Number(policyForm.lodgingRules.twoEmployees.percent)
          : 75,
        lodgingRules: {
          singleEmployee: {
            ruleType: policyForm.lodgingRules?.singleEmployee?.ruleType || 'INDIVIDUAL_100',
            percent: policyForm.lodgingRules?.singleEmployee?.percent !== '' && policyForm.lodgingRules?.singleEmployee?.percent !== undefined
              ? Number(policyForm.lodgingRules.singleEmployee.percent) : 100,
            description: '100% of individual category stay entitlement',
          },
          twoEmployees: {
            ruleType: policyForm.lodgingRules?.twoEmployees?.ruleType || 'COMBINED_PERCENT',
            percent: policyForm.lodgingRules?.twoEmployees?.percent !== '' && policyForm.lodgingRules?.twoEmployees?.percent !== undefined
              ? Number(policyForm.lodgingRules.twoEmployees.percent) : 75,
            description: policyForm.lodgingRules?.twoEmployees?.ruleType === 'HIGHER_ONLY'
              ? 'Higher entitlement only'
              : '75% of combined allowed budget of both',
          },
          threeEmployees: {
            ruleType: policyForm.lodgingRules?.threeEmployees?.ruleType || 'HIGHEST_PLUS_LOWEST',
            percent: policyForm.lodgingRules?.threeEmployees?.percent !== '' && policyForm.lodgingRules?.threeEmployees?.percent !== undefined
              ? Number(policyForm.lodgingRules.threeEmployees.percent) : 75,
            description: policyForm.lodgingRules?.threeEmployees?.ruleType === 'COMBINED_PERCENT'
              ? 'Custom percentage multiplier'
              : 'Combined of highest and lowest allowance amongst the 3',
          },
          fourPlusEmployees: {
            ruleType: policyForm.lodgingRules?.fourPlusEmployees?.ruleType || 'SPLIT_IN_PAIRS_75',
            percent: policyForm.lodgingRules?.fourPlusEmployees?.percent !== '' && policyForm.lodgingRules?.fourPlusEmployees?.percent !== undefined
              ? Number(policyForm.lodgingRules.fourPlusEmployees.percent) : 75,
            description: policyForm.lodgingRules?.fourPlusEmployees?.ruleType === 'COMBINED_PERCENT'
              ? 'Custom percentage multiplier'
              : 'Split allowance in 2s (75% combined per pair)',
          },
        },
        companyId: effectiveCompanyId,
        effectiveFrom: policyForm.effectiveFrom || null,
        effectiveTo: policyForm.effectiveTo || null,
        conveyanceRates: {
          twoWheeler: policyForm.conveyanceRates?.twoWheeler !== '' && policyForm.conveyanceRates?.twoWheeler !== undefined ? Number(policyForm.conveyanceRates.twoWheeler) : 0,
          car: policyForm.conveyanceRates?.car !== '' && policyForm.conveyanceRates?.car !== undefined ? Number(policyForm.conveyanceRates.car) : 0,
          eBike: policyForm.conveyanceRates?.eBike !== '' && policyForm.conveyanceRates?.eBike !== undefined ? Number(policyForm.conveyanceRates.eBike) : 0,
          eCar: policyForm.conveyanceRates?.eCar !== '' && policyForm.conveyanceRates?.eCar !== undefined ? Number(policyForm.conveyanceRates.eCar) : 0,
        },
        deadlineRules: (policyForm.deadlineRules || [])
          .filter(r => r && (r.ruleName?.trim() || r.days !== ''))
          .map(r => ({
            ruleName: (r.ruleName || '').trim(),
            days: r.days !== '' && r.days !== undefined ? Math.max(0, Number(r.days) || 0) : 3,
            action: r.action === 'blocking' ? 'blocking' : 'warning',
            description: (r.description || '').trim(),
          })),
        approvalLimitRules: (policyForm.approvalLimitRules || [])
          .filter(r => r && String(r.roleName || '').trim())
          .map(r => ({
            ...(r._id ? { _id: r._id } : {}),
            roleName: String(r.roleName || '').trim(),
            roleKey: String(r.roleKey || r.roleName || '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_'),
            levelId: r.levelId || null,
            levelNumber: r.levelNumber !== '' && r.levelNumber !== null && r.levelNumber !== undefined ? Number(r.levelNumber) : null,
            minAmount: r.minAmount !== '' && r.minAmount !== null && r.minAmount !== undefined ? Number(r.minAmount) : 0,
            maxAmount: r.maxAmount !== '' && r.maxAmount !== null && r.maxAmount !== undefined ? Number(r.maxAmount) : null,
            description: String(r.description || '').trim(),
            status: r.status === 'inactive' ? 'inactive' : 'active',
          })),
      };
      if (policyModal.editing) {
        await api.put(`/expense/policies/${policyModal.editing._id}`, payload, getReqConfig(effectiveCompanyId));
        toast.success(payload.status === 'active' ? 'Policy updated and set as sole ACTIVE policy' : 'Policy updated');
      } else {
        await api.post('/expense/policies', payload, getReqConfig(effectiveCompanyId));
        toast.success(payload.status === 'active' ? 'Policy created and set as sole ACTIVE policy' : 'Policy created');
      }
      setPolicyModal({ open: false, editing: null });
      await loadData(effectiveCompanyId, activeTab, true);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save policy');
    } finally {
      setSaving(false);
    }
  };

  const publishPolicy = async (pol) => {
    try {
      setSaving(true);
      await api.post(`/expense/policies/${pol._id}/publish`, {}, getReqConfig(effectiveCompanyId));
      toast.success(`${pol.name || pol.code} is now ACTIVE (all other policies deactivated)`);
      await loadData(effectiveCompanyId, activeTab, true);
    } catch {
      toast.error('Failed to activate policy');
    } finally {
      setSaving(false);
    }
  };

  // ── Approval Limit Rules (Role / Level Payment Rules for Other Claims — strictly company-scoped) ──
  const approvalRoleOptions = useMemo(() => {
    const opts = [];
    const seen = new Set();

    // 1. Active company's hierarchy levels
    const sortedLevels = [...(levels || [])]
      .filter(l => l && l.name && belongsToActiveCompany(l) && !/super\s*admin/i.test(l.name))
      .sort((a, b) => (Number(b.levelNumber) || 0) - (Number(a.levelNumber) || 0));
    sortedLevels.forEach(l => {
      const name = String(l.name).trim();
      const key = name.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        opts.push({
          roleName: name,
          levelId: l._id || '',
          levelNumber: l.levelNumber || '',
          label: l.levelNumber ? `Level ${l.levelNumber}: ${name}` : name,
        });
      }
    });

    // 2. Active company's designations
    const sortedDesignations = [...(designations || [])]
      .filter(d => d && d.name && belongsToActiveCompany(d) && !/super\s*admin/i.test(d.name))
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
    sortedDesignations.forEach(d => {
      const name = String(d.name).trim();
      const key = name.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        const lvlObj = d.level && typeof d.level === 'object' ? d.level : null;
        const lvlNum = lvlObj?.levelNumber || '';
        const lvlId = lvlObj?._id || (typeof d.level === 'string' ? d.level : '') || '';
        opts.push({
          roleName: name,
          levelId: lvlId,
          levelNumber: lvlNum,
          label: lvlNum ? `${name} (L${lvlNum})` : name,
        });
      }
    });

    // 3. Active company's employee designations (from employees of this company)
    (employeeDesignations || []).forEach(ed => {
      const name = String(ed?.name || '').trim();
      if (!name || /super\s*admin/i.test(name)) return;
      const key = name.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        opts.push({
          roleName: name,
          levelId: ed.levelId || '',
          levelNumber: ed.levelNumber || '',
          label: ed.levelNumber ? `${name} (L${ed.levelNumber})` : name,
        });
      }
    });

    return opts;
  }, [levels, designations, employeeDesignations, belongsToActiveCompany]);

  const openLimitRuleModal = (rule = null, idx = null) => {
    if (rule && idx !== null) {
      setLimitRuleForm({
        ...(rule._id ? { _id: rule._id } : {}),
        roleName: rule.roleName || '',
        levelId: rule.levelId || '',
        levelNumber: rule.levelNumber !== undefined && rule.levelNumber !== null ? String(rule.levelNumber) : '',
        maxAmount: rule.maxAmount !== undefined && rule.maxAmount !== null ? String(rule.maxAmount) : '',
        description: rule.description || '',
        status: rule.status || 'active',
      });
      setLimitRuleModal({ open: true, editingIndex: idx });
    } else {
      const firstRole = approvalRoleOptions[0] || { roleName: '', levelId: '', levelNumber: '' };
      setLimitRuleForm({
        ...EMPTY_LIMIT_RULE_FORM,
        roleName: firstRole.roleName || '',
        levelId: firstRole.levelId || '',
        levelNumber: firstRole.levelNumber ? String(firstRole.levelNumber) : '',
      });
      setLimitRuleModal({ open: true, editingIndex: null });
    }
  };

  const saveLimitRule = async (e) => {
    e.preventDefault();
    const cleanRole = String(limitRuleForm.roleName || '').trim();
    if (!cleanRole) {
      toast.error('Please enter or select a Role / Level name');
      return;
    }
    const maxRaw = String(limitRuleForm.maxAmount ?? '').trim();
    const maxVal = maxRaw === '' ? null : Number(maxRaw);
    if (maxVal === null || !Number.isFinite(maxVal) || maxVal <= 0) {
      toast.error('Please enter a valid payment limit amount (₹) greater than 0');
      return;
    }
    const targetPol = policies.find(p => p.status === 'active' && belongsToActiveCompany(p)) || policies.find(belongsToActiveCompany);
    if (!targetPol) {
      toast.error('Please create an active Expense Policy first');
      return;
    }
    try {
      setSaving(true);
      const currentRules = Array.isArray(targetPol.approvalLimitRules) ? [...targetPol.approvalLimitRules] : [];
      const newRuleObj = {
        ...(limitRuleForm._id ? { _id: limitRuleForm._id } : {}),
        roleName: cleanRole,
        roleKey: cleanRole.toUpperCase().replace(/[^A-Z0-9]+/g, '_'),
        levelId: limitRuleForm.levelId || null,
        levelNumber: limitRuleForm.levelNumber !== '' && limitRuleForm.levelNumber !== null ? Number(limitRuleForm.levelNumber) : null,
        minAmount: 0,
        maxAmount: maxVal,
        description: String(limitRuleForm.description || '').trim(),
        status: limitRuleForm.status === 'inactive' ? 'inactive' : 'active',
      };
      if (limitRuleModal.editingIndex !== null && limitRuleModal.editingIndex >= 0 && limitRuleModal.editingIndex < currentRules.length) {
        currentRules[limitRuleModal.editingIndex] = newRuleObj;
      } else {
        currentRules.push(newRuleObj);
      }
      const res = await api.put(`/expense/policies/${targetPol._id}`, {
        approvalLimitRules: currentRules,
        companyId: effectiveCompanyId,
      }, getReqConfig(effectiveCompanyId));
      if (res.data?.data) {
        setPolicies(prev => prev.map(p => String(p._id) === String(targetPol._id) ? res.data.data : p));
      }
      toast.success(limitRuleModal.editingIndex !== null ? 'Approval limit rule updated' : 'Approval limit rule added');
      setLimitRuleModal({ open: false, editingIndex: null });
      await loadData(effectiveCompanyId, activeTab, true);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save approval limit rule');
    } finally {
      setSaving(false);
    }
  };

  const deleteLimitRule = async (idx) => {
    const targetPol = policies.find(p => p.status === 'active' && belongsToActiveCompany(p)) || policies.find(belongsToActiveCompany);
    if (!targetPol) return;
    try {
      setSaving(true);
      const currentRules = (targetPol.approvalLimitRules || []).filter((_, i) => i !== idx);
      const res = await api.put(`/expense/policies/${targetPol._id}`, {
        approvalLimitRules: currentRules,
        companyId: effectiveCompanyId,
      }, getReqConfig(effectiveCompanyId));
      if (res.data?.data) {
        setPolicies(prev => prev.map(p => String(p._id) === String(targetPol._id) ? res.data.data : p));
      }
      toast.success('Approval limit rule removed');
      await loadData(effectiveCompanyId, activeTab, true);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete approval limit rule');
    } finally {
      setSaving(false);
    }
  };

  // ── Type handlers (Pay Limit & CFO Approval ON/OFF operate from Claims Types page) ──
  const toggleTypeRuleFlag = async (t, field, nextVal) => {
    if (!t?._id || saving) return;
    try {
      setSaving(true);
      const res = await api.put(
        `/expense/types/${t._id}`,
        {
          [field]: Boolean(nextVal),
          companyId: effectiveCompanyId,
        },
        getReqConfig(effectiveCompanyId)
      );
      if (res.data?.data) {
        setTypes(prev => prev.map(item => String(item._id) === String(t._id) ? res.data.data : item));
      }
      const ruleLabel = field === 'payLimitEnabled' ? 'Pay Limit Rule' : 'CFO 2nd Approval';
      toast.success(`${ruleLabel} turned ${nextVal ? 'ON' : 'OFF'} for ${t.name || t.code}`);
      const cfg = getReqConfig(effectiveCompanyId);
      await Promise.all([loadTypes(cfg), loadPolicies(cfg)]);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update claim type rule');
    } finally {
      setSaving(false);
    }
  };

  const openTypeModal = (t = null) => {
    const targetPol = policies.find(p => p.status === 'active' && belongsToActiveCompany(p)) || policies.find(belongsToActiveCompany);
    const polPayTypes = Array.isArray(targetPol?.payLimitConfig?.applicableClaimTypes)
      ? targetPol.payLimitConfig.applicableClaimTypes.map(normalizeClaimTypeCode)
      : ['OTHER'];
    const polCfoTypes = Array.isArray(targetPol?.cfoApprovalConfig?.applicableClaimTypes)
      ? targetPol.cfoApprovalConfig.applicableClaimTypes.map(normalizeClaimTypeCode)
      : ['STOCK_PURCHASE'];
    if (t) {
      const normCode = normalizeClaimTypeCode(t.code);
      setTypeForm({
        name: t.name, code: t.code, description: t.description || '', category: t.category || 'OTHER',
        calculationMethod: t.calculationMethod || 'ENTITLEMENT_CAP', hrApprovalRequired: !!t.hrApprovalRequired,
        payLimitEnabled: t.payLimitEnabled !== undefined ? Boolean(t.payLimitEnabled) : polPayTypes.includes(normCode),
        cfoApprovalRequired: t.cfoApprovalRequired !== undefined ? Boolean(t.cfoApprovalRequired) : polCfoTypes.includes(normCode),
        status: t.status || 'active', order: t.order || 0,
      });
    } else {
      setTypeForm({
        name: '', code: '', description: '', category: 'OTHER',
        calculationMethod: 'ENTITLEMENT_CAP', hrApprovalRequired: false,
        payLimitEnabled: false, cfoApprovalRequired: false,
        status: 'active', order: 0,
      });
    }
    setTypeModal({ open: true, editing: t });
  };

  const saveType = async (e) => {
    e.preventDefault();
    try {
      setSaving(true);
      const payload = {
        ...typeForm,
        payLimitEnabled: Boolean(typeForm.payLimitEnabled),
        cfoApprovalRequired: Boolean(typeForm.cfoApprovalRequired),
        proofRequired: false,
        selfAttestationAllowed: true,
        companyId: effectiveCompanyId,
      };
      if (typeModal.editing) {
        await api.put(`/expense/types/${typeModal.editing._id}`, payload, getReqConfig(effectiveCompanyId));
        toast.success('Expense type updated');
      } else {
        await api.post('/expense/types', payload, getReqConfig(effectiveCompanyId));
        toast.success('Expense type created');
      }
      setTypeModal({ open: false, editing: null });
      await loadData(effectiveCompanyId, 'types', true);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save expense type');
    } finally {
      setSaving(false);
    }
  };

  // ── City handlers ──
  const openCityModal = (c = null, presetClass = null) => {
    if (c) {
      setCityForm({
        city: c.city, cityClass: c.cityClass || presetClass || 'A+', state: c.state || '',
        aliases: (c.aliases || []).join(', '), status: c.status || 'active',
      });
    } else {
      setCityForm({ city: '', cityClass: presetClass || (selectedCityClassFilter !== 'ALL' ? selectedCityClassFilter : 'A+'), state: '', aliases: '', status: 'active' });
    }
    setCityModal({ open: true, editing: c });
  };

  const saveCity = async (e) => {
    e.preventDefault();
    try {
      setSaving(true);
      const cleanCityName = String(cityForm.city || '').trim().toUpperCase();
      const payload = {
        ...cityForm,
        city: cleanCityName,
        companyId: effectiveCompanyId,
        aliases: cityForm.aliases ? cityForm.aliases.split(',').map(s => s.trim()).filter(Boolean) : [],
      };
      if (cityModal.editing) {
        const res = await api.put(`/expense/cities/${cityModal.editing._id}`, payload, getReqConfig(effectiveCompanyId));
        const updatedDoc = res.data?.data || { ...cityModal.editing, ...payload };
        setCities(prev => prev.map(c => c._id === cityModal.editing._id ? { ...c, ...updatedDoc, city: cleanCityName } : c));
        toast.success('City classification updated');
      } else {
        const res = await api.post('/expense/cities', payload, getReqConfig(effectiveCompanyId));
        const newDoc = res.data?.data || { ...payload, _id: Date.now().toString() };
        setCities(prev => [...prev.filter(c => c.city !== cleanCityName), newDoc]);
        toast.success('City classification created');
      }
      setCityModal({ open: false, editing: null });
      await loadData(effectiveCompanyId, 'cities', true);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save city');
    } finally {
      setSaving(false);
    }
  };

  // ── Travel Mode handlers ──
  const DEFAULT_OWN_VEHICLE_RATES = {
    twoWheeler: 3.5,
    car: 5.0,
    eBike: 1.0,
    eCar: 1.75,
  };

  const activePolicy = policies.find(p => p.status === 'active');

  const resolveModeOwnVehicleRate = (mode) => {
    if (!mode) return null;
    if (Number(mode.ratePerKm) > 0) return Number(mode.ratePerKm);
    const kmSub = (mode.subtypes || []).find(
      s => s.workflow === 'KM_RATE' || String(s.code || '').toUpperCase() === 'OWN_VEHICLE'
    );
    if (Number(kmSub?.ratePerKm) > 0) return Number(kmSub.ratePerKm);
    const rateKey = kmSub?.conveyanceRateKey || mode.conveyanceRateKey || '';
    if (rateKey) {
      const polVal = Number(activePolicy?.conveyanceRates?.[rateKey]);
      if (Number.isFinite(polVal) && polVal > 0) return polVal;
      if (DEFAULT_OWN_VEHICLE_RATES[rateKey]) return DEFAULT_OWN_VEHICLE_RATES[rateKey];
    }
    return null;
  };

  const saveModeOwnVehicleRate = async (mode, newRateStr) => {
    if (!mode?._id) return;
    const rateNum = Number(newRateStr);
    if (!Number.isFinite(rateNum) || rateNum <= 0) {
      toast.error('Please enter a valid Own-Vehicle rate per km (> 0)');
      return;
    }
    try {
      setSaving(true);
      const updatedSubtypes = (mode.subtypes || []).map((s, i) => {
        const isKm = s.workflow === 'KM_RATE' || String(s.code || '').toUpperCase() === 'OWN_VEHICLE';
        return {
          ...(s._id ? { _id: s._id } : {}),
          name: s.name,
          code: s.code,
          workflow: isKm ? 'KM_RATE' : 'STANDARD',
          conveyanceRateKey: s.conveyanceRateKey || mode.conveyanceRateKey || '',
          ratePerKm: isKm ? rateNum : null,
          photosRequired: isKm ? s.photosRequired !== false : false,
          status: s.status || 'active',
          order: Number(s.order) || i + 1,
        };
      });
      const res = await api.put(
        `/expense/travel-modes/${mode._id}`,
        {
          name: mode.name,
          code: mode.code,
          description: mode.description || '',
          status: mode.status || 'active',
          order: Number(mode.order) || 0,
          conveyanceRateKey: mode.conveyanceRateKey || '',
          ratePerKm: rateNum,
          subtypes: updatedSubtypes,
          companyId: effectiveCompanyId,
        },
        getReqConfig(effectiveCompanyId)
      );
      const updated = res.data?.data;
      if (updated) {
        setTravelModes(prev => prev.map(m => m._id === mode._id ? updated : m));
      }
      setEditingRateModeId(null);
      setEditingRateVal('');
      toast.success(`Own-Vehicle rate updated to ₹${rateNum}/km for ${mode.name}`);
      await loadData(effectiveCompanyId, 'travelModes', true);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update Own-Vehicle rate');
    } finally {
      setSaving(false);
    }
  };

  const openTmModal = (tm = null) => {
    if (tm) {
      const resolvedOwnRate = resolveModeOwnVehicleRate(tm);
      setTmForm({
        name: tm.name, code: tm.code, description: tm.description || '',
        status: tm.status || 'active', order: tm.order || 0,
        conveyanceRateKey: tm.conveyanceRateKey || '',
        ratePerKm: resolvedOwnRate !== null ? String(resolvedOwnRate) : (tm.ratePerKm ?? ''),
        subtypes: (Array.isArray(tm.subtypes) ? [...tm.subtypes] : [])
          .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0))
          .map(s => {
            const isKm = s.workflow === 'KM_RATE' || String(s.code || '').toUpperCase() === 'OWN_VEHICLE';
            const subRate = Number(s.ratePerKm) > 0 ? s.ratePerKm : (isKm && resolvedOwnRate !== null ? resolvedOwnRate : '');
            return {
              _id: s._id, code: s.code || '', name: s.name || '',
              workflow: isKm ? 'KM_RATE' : 'STANDARD',
              conveyanceRateKey: s.conveyanceRateKey || '',
              ratePerKm: subRate ?? '',
              photosRequired: isKm ? s.photosRequired !== false : false,
              status: s.status === 'inactive' ? 'inactive' : 'active',
            };
          }),
      });
    } else {
      setTmForm({ name: '', code: '', description: '', status: 'active', order: 0, conveyanceRateKey: '', ratePerKm: '', subtypes: [] });
    }
    setTmModal({ open: true, editing: tm });
  };

  // ── Subtype (Vehicle Type) editor helpers ──
  const updateSubtype = (idx, patch) => setTmForm(f => {
    const nextSubtypes = f.subtypes.map((s, i) => (i === idx ? { ...s, ...patch } : s));
    const nextModeRate = patch.ratePerKm !== undefined && patch.ratePerKm !== ''
      ? patch.ratePerKm
      : f.ratePerKm;
    return { ...f, ratePerKm: nextModeRate, subtypes: nextSubtypes };
  });
  const addSubtype = () => setTmForm(f => ({ ...f, subtypes: [...f.subtypes, { code: '', name: '', workflow: 'STANDARD', conveyanceRateKey: f.conveyanceRateKey || '', ratePerKm: f.ratePerKm || '', photosRequired: false, status: 'active' }] }));
  const removeSubtype = (idx) => setTmForm(f => ({ ...f, subtypes: f.subtypes.filter((_, i) => i !== idx) }));
  const moveSubtype = (idx, dir) => setTmForm(f => {
    const list = [...f.subtypes];
    const j = idx + dir;
    if (j < 0 || j >= list.length) return f;
    [list[idx], list[j]] = [list[j], list[idx]];
    return { ...f, subtypes: list };
  });

  const deleteSubtypeDirect = async (mode, subtypeToRemove) => {
    if (!mode?._id) return;
    try {
      setSaving(true);
      const remaining = (mode.subtypes || [])
        .filter(s => String(s._id || s.code) !== String(subtypeToRemove._id || subtypeToRemove.code))
        .map((s, i) => ({
          ...(s._id ? { _id: s._id } : {}),
          name: s.name,
          code: s.code,
          workflow: s.workflow === 'KM_RATE' ? 'KM_RATE' : 'STANDARD',
          conveyanceRateKey: s.conveyanceRateKey || '',
          ratePerKm: s.ratePerKm ?? null,
          photosRequired: s.workflow === 'KM_RATE' ? s.photosRequired !== false : false,
          status: s.status || 'active',
          order: i + 1,
        }));
      const res = await api.put(
        `/expense/travel-modes/${mode._id}`,
        {
          name: mode.name,
          code: mode.code,
          description: mode.description || '',
          status: mode.status || 'active',
          order: Number(mode.order) || 0,
          conveyanceRateKey: mode.conveyanceRateKey || '',
          ratePerKm: mode.ratePerKm ?? null,
          subtypes: remaining,
          companyId: effectiveCompanyId,
        },
        getReqConfig(effectiveCompanyId)
      );
      const updated = res.data?.data;
      if (updated) {
        setTravelModes(prev => prev.map(m => m._id === mode._id ? updated : m));
      }
      toast.success(`Subtype "${subtypeToRemove.name}" deleted`);
      await loadData(effectiveCompanyId, 'travelModes', true);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete subtype');
    } finally {
      setSaving(false);
    }
  };

  const saveTravelMode = async (e) => {
    e.preventDefault();
    const parsedFormRate = tmForm.ratePerKm !== '' && tmForm.ratePerKm !== null && tmForm.ratePerKm !== undefined && Number(tmForm.ratePerKm) > 0
      ? Number(tmForm.ratePerKm)
      : null;
    const subtypes = (tmForm.subtypes || []).map((s, i) => {
      const isKm = s.workflow === 'KM_RATE';
      const parsedSubRate = isKm && s.ratePerKm !== '' && s.ratePerKm !== null && s.ratePerKm !== undefined && Number(s.ratePerKm) > 0
        ? Number(s.ratePerKm)
        : (isKm ? parsedFormRate : null);
      return {
        ...(s._id ? { _id: s._id } : {}),
        name: String(s.name || '').trim(),
        code: toSubtypeCode(s.code || s.name),
        workflow: isKm ? 'KM_RATE' : 'STANDARD',
        conveyanceRateKey: isKm ? (s.conveyanceRateKey || tmForm.conveyanceRateKey || '') : '',
        ratePerKm: parsedSubRate,
        photosRequired: isKm ? s.photosRequired !== false : false,
        status: s.status === 'inactive' ? 'inactive' : 'active',
        order: i + 1,
      };
    });
    if (subtypes.some(s => !s.name)) {
      toast.error('Every subtype needs a name');
      return;
    }
    const codes = subtypes.map(s => s.code);
    const dup = codes.find((c, i) => codes.indexOf(c) !== i);
    if (dup) {
      toast.error(`Duplicate subtype code ${dup}`);
      return;
    }
    const kmSubRate = subtypes.find(s => s.workflow === 'KM_RATE' && Number(s.ratePerKm) > 0)?.ratePerKm ?? parsedFormRate;
    let resolvedRateKey = tmForm.conveyanceRateKey || '';
    if (subtypes.some(s => s.workflow === 'KM_RATE' && s.status === 'active') && !resolvedRateKey) {
      const firstKmSub = subtypes.find(s => s.workflow === 'KM_RATE' && s.conveyanceRateKey);
      resolvedRateKey = firstKmSub?.conveyanceRateKey || (String(tmForm.code || '').includes('TWO') ? 'twoWheeler' : 'car');
    }
    try {
      setSaving(true);
      const payload = {
        ...tmForm,
        code: toSubtypeCode(tmForm.code || tmForm.name),
        conveyanceRateKey: resolvedRateKey,
        ratePerKm: kmSubRate,
        subtypes,
        companyId: effectiveCompanyId,
        order: Number(tmForm.order) || 0,
      };
      if (tmModal.editing) {
        const res = await api.put(`/expense/travel-modes/${tmModal.editing._id}`, payload, getReqConfig(effectiveCompanyId));
        if (res.data?.data) {
          setTravelModes(prev => prev.map(m => m._id === tmModal.editing._id ? res.data.data : m));
        }
        toast.success('Travel mode updated');
      } else {
        const res = await api.post('/expense/travel-modes', payload, getReqConfig(effectiveCompanyId));
        if (res.data?.data) {
          setTravelModes(prev => [...prev, res.data.data]);
        }
        toast.success('Travel mode created');
      }
      setTmModal({ open: false, editing: null });
      await loadData(effectiveCompanyId, 'travelModes', true);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save travel mode');
    } finally {
      setSaving(false);
    }
  };

  // Distinct Levels for Entitlements Matrix (BOD L1 down to Intern L12 — never includes level 0)
  const distinctLevelNumbers = useMemo(() => {
    const set = new Set();
    entitlements.forEach(e => {
      const ln = Number(e.levelNumber);
      if (ln > 0 && !String(e.levelName || '').toLowerCase().includes('super admin')) {
        set.add(ln);
      }
    });
    levels.forEach(l => {
      const ln = Number(l.levelNumber);
      if (ln > 0 && !String(l.name || '').toLowerCase().includes('super admin')) {
        set.add(ln);
      }
    });
    if (set.size === 0) [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].forEach(n => set.add(n));
    return Array.from(set).sort((a, b) => a - b);
  }, [entitlements, levels]);

  // ── Entitlement handlers ──
  const openEntModal = (ent = null, presetLevel = null, presetType = null, presetCity = null) => {
    const activePol = policies.find(p => p.status === 'active');
    if (ent && ent._id) {
      const lvlNum = ent.levelNumber ?? presetLevel ?? '';
      const matchingLevel = levels.find(l => String(l.levelNumber) === String(lvlNum));
      setEntForm({
        levelNumber: String(lvlNum),
        levelName: matchingLevel?.name || `Level ${lvlNum}`,
        gradeCode: ent.gradeCode || '',
        cityClass: presetCity || ent.cityClass || 'A+',
        expenseTypeCode: presetType || ent.expenseTypeCode || 'LODGING',
        amount: ent.amount ?? '',
        unit: ent.unit || 'per_day',
        formula: ent.formula || 'MIN(actual, entitlement)',
        ruleCode: ent.ruleCode || (presetType === 'FOOD' || ent.expenseTypeCode === 'FOOD' ? 'FOOD_ENTITLEMENT' : 'LODGING_ENTITLEMENT'),
        status: ent.status || 'active',
        policyId: ent.policyId || (activePol ? activePol._id : null),
      });
      setEntModal({ open: true, editing: ent });
    } else {
      const defaultLvl = distinctLevelNumbers[0] ? String(distinctLevelNumbers[0]) : '1';
      const lvl = presetLevel ?? (selectedLevelFilter !== 'ALL' ? selectedLevelFilter : defaultLvl);
      const matchingLevel = levels.find(l => String(l.levelNumber) === String(lvl));
      const expType = presetType || (types[0]?.code || 'LODGING');
      setEntForm({
        levelNumber: String(lvl),
        levelName: matchingLevel?.name || `Level ${lvl}`,
        gradeCode: '',
        cityClass: presetCity || 'A+',
        expenseTypeCode: expType,
        amount: '',
        unit: 'per_day',
        formula: 'MIN(actual, entitlement)',
        ruleCode: expType === 'FOOD' ? 'FOOD_ENTITLEMENT' : 'LODGING_ENTITLEMENT',
        status: 'active',
        policyId: activePol ? activePol._id : null,
      });
      setEntModal({ open: true, editing: null });
    }
  };

  const saveEntitlement = async (e) => {
    e.preventDefault();
    try {
      setSaving(true);
      const activePolicy = policies.find(p => p.status === 'active');
      const lvlNum = Number(entForm.levelNumber);
      const matchingLevel = levels.find(l => Number(l.levelNumber) === lvlNum);
      const expType = String(entForm.expenseTypeCode || 'LODGING').toUpperCase().trim();
      const cityCls = String(entForm.cityClass || 'ALL').toUpperCase().trim();
      const payload = {
        ...entForm,
        companyId: effectiveCompanyId,
        levelNumber: lvlNum,
        levelName: matchingLevel?.name || `Level ${lvlNum}`,
        amount: Number(entForm.amount),
        expenseTypeCode: expType,
        cityClass: cityCls,
        policyId: entForm.policyId || (activePolicy ? activePolicy._id : null),
      };
      if (entModal.editing) {
        await api.put(`/expense/entitlements/${entModal.editing._id}`, payload, getReqConfig(effectiveCompanyId));
        toast.success(`Entitlement for Level ${lvlNum} (${cityCls}) updated`);
      } else {
        await api.post('/expense/entitlements', payload, getReqConfig(effectiveCompanyId));
        toast.success(`Entitlement for Level ${lvlNum} (${cityCls}) saved`);
      }
      setEntModal({ open: false, editing: null });
      await loadData(effectiveCompanyId, 'entitlements', true);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save entitlement');
    } finally {
      setSaving(false);
    }
  };

  // ── Travel Entitlement handlers (expenseTypeCode TRAVEL: mode + permitted subtypes + max amount) ──
  const buildTravelSelectionForScope = useCallback((targetLvl, targetCity = 'ALL', targetGrade = '') => {
    const cleanCity = String(targetCity || 'ALL').toUpperCase().trim();
    const cleanGrade = String(targetGrade || '').toLowerCase().trim();
    const lvlNum = Number(targetLvl) || 0;

    const travelRows = entitlements.filter(
      (e) =>
        e &&
        e.status !== 'inactive' &&
        String(e.expenseTypeCode || '').toUpperCase() === 'TRAVEL' &&
        String(e.cityClass || 'ALL').toUpperCase() === cleanCity &&
        String(e.gradeCode || '').toLowerCase().trim() === cleanGrade
    );

    let scopedRows = [];
    if (lvlNum > 0) {
      scopedRows = travelRows.filter((e) => Number(e.levelNumber) === lvlNum);
      if (scopedRows.length === 0) {
        scopedRows = travelRows.filter((e) => Number(e.levelNumber || 0) === 0);
      }
    }

    const selectedModes = {};
    const selected = {};

    scopedRows.forEach((ent) => {
      const matchedMode = travelModes.find(
        (m) =>
          (ent.travelModeId && String(m._id) === String(ent.travelModeId)) ||
          (ent.travelModeCode && String(m.code).toUpperCase() === String(ent.travelModeCode).toUpperCase())
      );
      const modeIdStr = matchedMode ? String(matchedMode._id) : ent.travelModeId ? String(ent.travelModeId) : '';
      const maxAmtStr = ent.maxAmount === null || ent.maxAmount === undefined ? '' : String(ent.maxAmount);
      if (modeIdStr) {
        selectedModes[modeIdStr] = { checked: true, maxAmount: maxAmtStr };
      }
      (ent.allowedSubtypes || []).forEach((a) => {
        const maxStr = a.maxAmount === null || a.maxAmount === undefined ? '' : String(a.maxAmount);
        if (a.subtypeId) {
          selected[String(a.subtypeId)] = { checked: true, maxAmount: maxStr };
        }
        if (matchedMode && (a.code || a.subtypeCode)) {
          const codeToMatch = String(a.code || a.subtypeCode).toUpperCase();
          const matchedSub = (matchedMode.subtypes || []).find(
            (s) => String(s.code).toUpperCase() === codeToMatch
          );
          if (matchedSub?._id) {
            selected[String(matchedSub._id)] = { checked: true, maxAmount: maxStr };
          }
        }
      });
    });

    return { selectedModes, selected };
  }, [entitlements, travelModes]);

  const openTravelEntModal = (ent = null, presetLevel = null) => {
    if (ent && ent._id) {
      const matchedMode = travelModes.find(m =>
        (ent.travelModeId && String(m._id) === String(ent.travelModeId)) ||
        (ent.travelModeCode && String(m.code).toUpperCase() === String(ent.travelModeCode).toUpperCase())
      );
      const modeIdStr = matchedMode ? String(matchedMode._id) : (ent.travelModeId ? String(ent.travelModeId) : '');
      const selected = {};
      (ent.allowedSubtypes || []).forEach(a => {
        const maxStr = a.maxAmount === null || a.maxAmount === undefined ? '' : String(a.maxAmount);
        if (a.subtypeId) {
          selected[String(a.subtypeId)] = { checked: true, maxAmount: maxStr };
        }
        if (matchedMode && (a.code || a.subtypeCode)) {
          const matchedSub = (matchedMode.subtypes || []).find(s => String(s.code).toUpperCase() === String(a.code || a.subtypeCode).toUpperCase());
          if (matchedSub?._id) {
            selected[String(matchedSub._id)] = { checked: true, maxAmount: maxStr };
          }
        }
      });
      const maxAmtStr = ent.maxAmount === null || ent.maxAmount === undefined ? '' : String(ent.maxAmount);
      const selectedModes = modeIdStr ? { [modeIdStr]: { checked: true, maxAmount: maxAmtStr } } : {};
      const resolvedLvl = presetLevel !== null && presetLevel !== undefined ? presetLevel : (ent.levelNumber ?? 0);
      setTravelEntForm({
        levelNumber: String(resolvedLvl),
        gradeCode: ent.gradeCode || '',
        cityClass: ent.cityClass || 'ALL',
        travelModeId: modeIdStr,
        selectedModes,
        selected,
        maxAmount: maxAmtStr,
        status: ent.status || 'active',
      });
      setTravelEntModal({ open: true, editing: ent });
    } else {
      const lvl = presetLevel ?? (selectedLevelFilter !== 'ALL' ? selectedLevelFilter : 0);
      setTravelEntForm({
        ...EMPTY_TRAVEL_ENT_FORM,
        levelNumber: String(lvl),
        selectedModes: {},
        selected: {},
      });
      setTravelEntModal({ open: true, editing: null });
    }
  };

  const saveTravelEntitlement = async (e) => {
    e.preventDefault();
    const activeModes = travelModes.filter(m => m.status !== 'inactive');
    const chosenModes = activeModes.filter(m => {
      const mKey = String(m._id);
      if (travelEntForm.selectedModes?.[mKey]?.checked) return true;
      if (!travelEntForm.selectedModes?.[mKey] && String(travelEntForm.travelModeId) === mKey) return true;
      const subs = (m.subtypes || []).filter(s => s.status !== 'inactive');
      return subs.some(s => travelEntForm.selected?.[String(s._id)]?.checked);
    });
    if (chosenModes.length === 0) {
      toast.error('Please select at least one travel mode option');
      return;
    }
    const parseMax = (v) => (v === '' || v === null || v === undefined ? null : Number(v));

    for (const mode of chosenModes) {
      const mKey = String(mode._id);
      const modeSubtypes = (mode.subtypes || []).filter(s => s.status !== 'inactive');
      const hasSubtypes = modeSubtypes.length > 0;
      const allowedSubtypes = hasSubtypes
        ? modeSubtypes
          .filter(s => travelEntForm.selected?.[String(s._id)]?.checked)
          .map(s => ({ subtypeId: s._id, maxAmount: parseMax(travelEntForm.selected?.[String(s._id)]?.maxAmount) }))
        : [];
      const modeMaxRaw = travelEntForm.selectedModes?.[mKey]?.maxAmount !== undefined
        ? travelEntForm.selectedModes[mKey].maxAmount
        : travelEntForm.maxAmount;
      const invalid = [...allowedSubtypes.map(a => a.maxAmount), hasSubtypes ? null : parseMax(modeMaxRaw)]
        .some(v => v !== null && (!Number.isFinite(v) || v < 0));
      if (invalid) {
        toast.error(`Max amounts for ${mode.name} must be blank (actuals) or a non-negative number`);
        return;
      }
    }

    try {
      setSaving(true);
      const lvlNum = Number(travelEntForm.levelNumber) || 0;
      const targetLevels = distinctLevelNumbers.filter(n => Number(n) > 0);
      const activePol = policies.find(p => p.status === 'active');
      const editingDoc = travelEntModal.editing;
      let updatedEditingDoc = false;

      for (let i = 0; i < chosenModes.length; i++) {
        const mode = chosenModes[i];
        const mKey = String(mode._id);
        const modeSubtypes = (mode.subtypes || []).filter(s => s.status !== 'inactive');
        const hasSubtypes = modeSubtypes.length > 0;
        const allowedSubtypes = hasSubtypes
          ? modeSubtypes
            .filter(s => travelEntForm.selected?.[String(s._id)]?.checked)
            .map(s => ({ subtypeId: s._id, maxAmount: parseMax(travelEntForm.selected?.[String(s._id)]?.maxAmount) }))
          : [];
        const modeMaxRaw = travelEntForm.selectedModes?.[mKey]?.maxAmount !== undefined
          ? travelEntForm.selectedModes[mKey].maxAmount
          : travelEntForm.maxAmount;
        const payload = {
          expenseTypeCode: 'TRAVEL',
          companyId: effectiveCompanyId,
          levelNumber: lvlNum,
          targetLevels,
          gradeCode: travelEntForm.gradeCode || '',
          cityClass: travelEntForm.cityClass || 'ALL',
          travelModeId: mode._id,
          allowedSubtypes,
          maxAmount: hasSubtypes ? null : parseMax(modeMaxRaw),
          status: travelEntForm.status || 'active',
          policyId: editingDoc?.policyId || activePol?._id || null,
        };
        const matchesEditingMode = editingDoc && (
          String(editingDoc.travelModeId) === mKey ||
          String(editingDoc.travelModeCode || '').toUpperCase() === String(mode.code || '').toUpperCase()
        );
        if (editingDoc && lvlNum > 0 && (matchesEditingMode || (!updatedEditingDoc && i === 0 && !chosenModes.some(cm =>
          String(cm._id) === String(editingDoc.travelModeId) ||
          String(cm.code || '').toUpperCase() === String(editingDoc.travelModeCode || '').toUpperCase()
        )))) {
          updatedEditingDoc = true;
          await api.put(`/expense/entitlements/${editingDoc._id}`, payload, getReqConfig(effectiveCompanyId));
        } else {
          await api.post('/expense/entitlements', payload, getReqConfig(effectiveCompanyId));
        }
      }
      toast.success(
        lvlNum === 0
          ? `${chosenModes.length} travel entitlement rule${chosenModes.length > 1 ? 's' : ''} connected to all ${targetLevels.length} levels`
          : editingDoc && chosenModes.length === 1
            ? `Travel entitlement updated for Level ${lvlNum}`
            : `${chosenModes.length} travel entitlement rule${chosenModes.length > 1 ? 's' : ''} saved for Level ${lvlNum}`
      );
      setTravelEntModal({ open: false, editing: null });
      await loadData(effectiveCompanyId, 'entitlements', true);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save travel entitlement');
    } finally {
      setSaving(false);
    }
  };

  // ── Delete handler ──
  const confirmDelete = async () => {
    if (!deleteConfirm.id) return;
    try {
      setSaving(true);
      const targetId = String(deleteConfirm.id);
      const map = { policies: 'policies', types: 'types', cities: 'cities', entitlements: 'entitlements', travelModes: 'travel-modes' };
      await api.delete(`/expense/${map[deleteConfirm.kind]}/${targetId}`, getReqConfig(effectiveCompanyId));
      if (deleteConfirm.kind === 'travelModes') {
        setTravelModes(prev => prev.filter(m => String(m._id) !== targetId));
      } else if (deleteConfirm.kind === 'entitlements') {
        setEntitlements(prev => prev.filter(e => String(e._id) !== targetId));
      } else if (deleteConfirm.kind === 'cities') {
        setCities(prev => prev.filter(c => String(c._id) !== targetId));
      } else if (deleteConfirm.kind === 'types') {
        setTypes(prev => prev.filter(t => String(t._id) !== targetId));
      } else if (deleteConfirm.kind === 'policies') {
        setPolicies(prev => prev.filter(p => String(p._id) !== targetId));
      }
      toast.success('Deleted successfully');
      setDeleteConfirm({ show: false, id: null, kind: '' });
      await loadData(effectiveCompanyId, activeTab, true);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete');
    } finally {
      setSaving(false);
    }
  };

  // ── Derived ──
  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase();
    if (activeTab === 'policies') return policies.filter(p => (p.name + ' ' + p.code).toLowerCase().includes(q));
    if (activeTab === 'types') return types.filter(t => (t.name + ' ' + t.code).toLowerCase().includes(q));
    if (activeTab === 'cities') {
      return cities
        .filter(c => {
          if (selectedCityClassFilter !== 'ALL' && c.cityClass !== selectedCityClassFilter) return false;
          return (c.city + ' ' + c.cityClass).toLowerCase().includes(q);
        })
        .sort((a, b) => {
          const pA = CITY_CLASS_PRIORITY[a.cityClass] || 99;
          const pB = CITY_CLASS_PRIORITY[b.cityClass] || 99;
          if (pA !== pB) return pA - pB;
          return (a.city || '').localeCompare(b.city || '');
        });
    }
    if (activeTab === 'travelModes') return travelModes.filter(m => m.status !== 'inactive' && (m.name + ' ' + m.code).toLowerCase().includes(q));
    return entitlements
      .filter(e => {
        if (e.status === 'inactive') return false;
        if (String(e.levelName || '').toLowerCase().includes('super admin')) return false;
        return (`${e.levelNumber || ''} ${e.levelName || ''} ${e.expenseTypeCode || ''} ${e.travelModeName || ''} ${e.travelModeCode || ''} ${e.cityClass || ''} ${e.amount || ''}`).toLowerCase().includes(q);
      })
      .sort((a, b) => {
        const lvlDiff = (Number(a.levelNumber) || 0) - (Number(b.levelNumber) || 0);
        if (lvlDiff !== 0) return lvlDiff;
        const pA = CITY_CLASS_PRIORITY[a.cityClass] || 99;
        const pB = CITY_CLASS_PRIORITY[b.cityClass] || 99;
        if (pA !== pB) return pA - pB;
        return (a.expenseTypeCode || '').localeCompare(b.expenseTypeCode || '');
      });
  }, [activeTab, searchQuery, policies, types, cities, travelModes, entitlements]);

  // Group Entitlements by Level & Expense Type for Clean Hierarchy (connects any fallback travel rules to each level; no separate Level 0 section)
  const levelGroups = useMemo(() => {
    const q = searchQuery.toLowerCase();
    const map = {};

    distinctLevelNumbers.forEach(ln => {
      if (Number(ln) <= 0) return;
      const matchingLevel = levels.find(l => Number(l.levelNumber) === Number(ln));
      if (matchingLevel && String(matchingLevel.name || '').toLowerCase().includes('super admin')) return;
      map[ln] = {
        levelNumber: ln,
        levelName: matchingLevel?.name || `Level ${ln}`,
        grade: matchingLevel?.grade || '',
        byType: {}, // { 'FOOD': { 'A+': ent, 'A': ent, ... }, 'LODGING': { ... } }
        travelEntitlements: [],
        totalRules: 0,
      };
    });

    const zeroLevelTravelEnts = [];

    entitlements.forEach(ent => {
      if (ent.status === 'inactive') return;
      const ln = Number(ent.levelNumber || 0);
      if (String(ent.levelName || '').toLowerCase().includes('super admin')) return;
      const typeCode = (ent.expenseTypeCode || 'OTHER').toUpperCase();
      if (ln <= 0) {
        if (typeCode === 'TRAVEL') {
          zeroLevelTravelEnts.push(ent);
        }
        return;
      }
      const matchingLevel = levels.find(l => Number(l.levelNumber) === Number(ln));
      if (!map[ln]) {
        map[ln] = {
          levelNumber: ln,
          levelName: matchingLevel?.name || `Level ${ln}`,
          grade: matchingLevel?.grade || ent.gradeCode || '',
          byType: {},
          travelEntitlements: [],
          totalRules: 0,
        };
      } else if (matchingLevel?.name) {
        map[ln].levelName = matchingLevel.name;
      }
      if (typeCode === 'TRAVEL') {
        map[ln].travelEntitlements.push(ent);
        return;
      }
      if (!map[ln].byType[typeCode]) {
        map[ln].byType[typeCode] = {};
      }
      const cityKey = ent.cityClass || 'ALL';
      const existing = map[ln].byType[typeCode][cityKey];
      if (!existing || new Date(ent.updatedAt || 0) >= new Date(existing.updatedAt || 0)) {
        map[ln].byType[typeCode][cityKey] = ent;
      }
    });

    // Connect any level-0 travel entitlements to each level and deduplicate per level by (mode + cityClass + gradeCode)
    Object.values(map).forEach(g => {
      zeroLevelTravelEnts.forEach(ze => {
        g.travelEntitlements.push({ ...ze, levelNumber: g.levelNumber, levelName: g.levelName });
      });
      const dedupByModeKey = new Map();
      for (const te of g.travelEntitlements) {
        const modeKey = `${String(te.travelModeCode || te.travelModeId || '').toUpperCase()}_${String(te.cityClass || 'ALL').toUpperCase()}_${String(te.gradeCode || '').toLowerCase()}`;
        const prev = dedupByModeKey.get(modeKey);
        if (!prev || new Date(te.updatedAt || 0) >= new Date(prev.updatedAt || 0)) {
          dedupByModeKey.set(modeKey, te);
        }
      }
      g.travelEntitlements = Array.from(dedupByModeKey.values());
    });

    // Recompute totalRules per level
    Object.values(map).forEach(g => {
      let count = (g.travelEntitlements || []).length;
      Object.values(g.byType).forEach(cMap => {
        count += Object.keys(cMap).length;
      });
      g.totalRules = count;
    });

    let result = Object.values(map);

    if (selectedLevelFilter !== 'ALL') {
      result = result.filter(g => Number(g.levelNumber) === Number(selectedLevelFilter));
    }

    if (q) {
      result = result.filter(g => {
        const nameMatch = (g.levelName + ' L' + g.levelNumber).toLowerCase().includes(q);
        if (nameMatch) return true;
        const travelMatch = (g.travelEntitlements || []).some(te =>
          `${te.travelModeName || ''} ${te.travelModeCode || ''} ${(te.allowedSubtypes || []).map(s => s.name).join(' ')}`.toLowerCase().includes(q)
        );
        if (travelMatch) return true;
        return Object.keys(g.byType).some(t => {
          if (t.toLowerCase().includes(q)) return true;
          return Object.values(g.byType[t]).some(e => String(e.amount).includes(q) || String(e.cityClass).toLowerCase().includes(q));
        });
      });
    }

    return result.sort((a, b) => a.levelNumber - b.levelNumber);
  }, [distinctLevelNumbers, entitlements, levels, selectedLevelFilter, searchQuery]);

  const exportCSV = () => {
    let headers, rows;
    if (activeTab === 'policies') {
      headers = ['Name', 'Code', 'Version', 'Status', 'Shared Lodging', 'Created'];
      rows = filtered.map(p => [p.name, p.code, p.version, p.status, p.sharedLodgingRule, new Date(p.createdAt).toLocaleDateString()]);
    } else if (activeTab === 'types') {
      headers = ['Name', 'Code', 'Category', 'Method', 'Status'];
      rows = filtered.map(t => [t.name, t.code, t.category, t.calculationMethod, t.status]);
    } else if (activeTab === 'cities') {
      headers = ['City', 'Class', 'Status'];
      rows = filtered.map(c => [c.city, c.cityClass, c.status]);
    } else if (activeTab === 'travelModes') {
      headers = ['Name', 'Code', 'Description', 'Order', 'Status'];
      rows = filtered.map(m => [m.name, m.code, m.description || '', m.order, m.status]);
    } else {
      headers = ['Level', 'Level Name', 'Grade', 'Expense Type', 'City Class', 'Amount (₹)', 'Unit', 'Status'];
      rows = filtered.map(e => [e.levelNumber, e.levelName || '-', e.gradeCode || '-', e.expenseTypeCode, e.cityClass, e.amount, e.unit, e.status]);
    }
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `expense_${activeTab}.csv`;
    link.click();
  };

  const renderSelect = (key, value, options, onChange, placeholder = 'Select...') => (
    <div className="relative" ref={(el) => (dropdownRefs.current[key] = el)}>
      <button
        type="button"
        onClick={() => toggleDrop(key)}
        className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-2xl text-xs font-bold text-slate-800 flex items-center justify-between hover:bg-white transition-all shadow-sm"
      >
        <span>{value || placeholder}</span>
        <ChevronDown size={14} className={`text-slate-400 transition-transform ${dropdownOpen[key] ? 'rotate-180' : ''}`} />
      </button>
      {dropdownOpen[key] && (
        <div className="absolute left-0 right-0 mt-1 bg-white border border-slate-100 rounded-2xl shadow-xl z-50 py-1 overflow-hidden max-h-60 overflow-y-auto">
          {options.map((opt) => (
            <button
              key={String(opt.value)}
              type="button"
              onClick={() => { onChange(opt.value); setDropdownOpen((p) => ({ ...p, [key]: false })); }}
              className="w-full px-4 py-2 text-left text-xs font-bold text-slate-700 hover:bg-indigo-50 hover:text-indigo-600 transition-colors"
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  const inputCls = "w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-2xl text-xs font-bold text-slate-800 outline-none focus:bg-white focus:border-indigo-400 transition-all shadow-sm";
  const labelCls = "text-[10px] font-bold text-slate-400 tracking-wider";

  const modalShell = (open, title, subtitle, onClose, children, maxW = 'max-w-3xl') => (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
            className={`bg-white rounded-[2.5rem] p-6 md:p-8 ${maxW} w-full shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto no-scrollbar`}
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-xl font-bold text-slate-900 m-0">{title}</h3>
                <p className="text-xs font-bold text-slate-500 mt-1">{subtitle}</p>
              </div>
              <button onClick={onClose} className="w-9 h-9 rounded-xl bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center transition-all">
                <X size={18} />
              </button>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  if (loading) {
    return (
      <div className="flex justify-center items-center h-96">
        <Loader2 className="animate-spin text-indigo-600" size={40} />
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6 md:space-y-8 animate-fade-up">
        {/* Page Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight m-0">Expense Rules &amp; Master Setup</h2>
            <p className="text-slate-600 font-bold text-[13px] mt-2">
              Configure company policies, expense categories, city classifications, travel modes and Level/Grade allowance limits
            </p>
          </div>
          <div className="flex items-center gap-3 w-full md:w-auto">
            <button
              onClick={exportCSV}
              className="flex items-center justify-center gap-2 bg-white text-slate-600 border border-slate-200 px-4 py-3 rounded-2xl font-bold text-sm hover:bg-slate-50 transition-all active:scale-95 shadow-sm"
            >
              <Download size={18} />
              Export CSV
            </button>
            <button
              onClick={() => {
                if (activeTab === 'policies') openPolicyModal();
                else if (activeTab === 'approvalLimits') openLimitRuleModal();
                else if (activeTab === 'types') openTypeModal();
                else if (activeTab === 'cities') openCityModal();
                else if (activeTab === 'travelModes') openTmModal();
                else openEntModal();
              }}
              className="flex flex-1 md:flex-none items-center justify-center gap-2 bg-indigo-600 text-white px-6 py-3 rounded-2xl font-bold text-sm shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all active:scale-95"
            >
              <Plus size={18} />
              Add {activeTab === 'policies' ? 'Policy' : activeTab === 'approvalLimits' ? 'Approval Limit Rule' : activeTab === 'types' ? 'Expense Type' : activeTab === 'cities' ? 'City Class' : activeTab === 'travelModes' ? 'Travel Mode' : 'Entitlement'}
            </button>
          </div>
        </div>

        {/* Active policy banner */}
        {activePolicy ? (
          <div className="bg-gradient-to-r from-indigo-900 via-indigo-800 to-violet-900 rounded-[2rem] p-5 md:p-6 text-white shadow-xl shadow-indigo-200 space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-white/15 flex items-center justify-center text-emerald-300">
                  <ShieldCheck size={26} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold tracking-widest bg-emerald-400/20 text-emerald-300 border border-emerald-400/30">
                      Active Policy in Force
                    </span>
                    <span className="text-[11px] font-medium text-indigo-200">
                      (Strictly 1 policy applied company-wide)
                    </span>
                  </div>
                  <h3 className="text-xl font-bold text-white m-0 mt-1">
                    {activePolicy.name} <span className="text-indigo-200 font-bold text-sm">({activePolicy.code}) · v{activePolicy.version}</span>
                  </h3>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('approvalLimits')}
                  className="px-3.5 py-1.5 rounded-xl bg-amber-400/20 hover:bg-amber-400/30 text-amber-200 text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 border border-amber-300/30"
                >
                  <ShieldAlert size={12} /> Manage Approval Limits
                </button>
                <button
                  type="button"
                  onClick={() => openPolicyModal(activePolicy)}
                  className="px-3.5 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 border border-white/20"
                >
                  <Edit2 size={12} /> Edit Policy
                </button>
              </div>
            </div>

            {/* Quick summary of All Lodging, Petrol & Reporting Manager Approval Limit rules */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-3 border-t border-white/10">
              {/* Lodging Rules (All 4 Types) */}
              <div className="p-3 rounded-xl bg-white/10 backdrop-blur-xs space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs font-extrabold text-indigo-200">
                  <span>🏨 All Lodging Stay Rules:</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 text-[11px]">
                  <div className="bg-black/25 p-2 rounded-lg text-center">
                    <span className="text-indigo-300 block text-[9px] font-bold">1 EMP</span>
                    <span className="font-extrabold text-white text-xs">100% Indiv</span>
                  </div>
                  <div className="bg-black/25 p-2 rounded-lg text-center">
                    <span className="text-indigo-300 block text-[9px] font-bold">2 EMPS</span>
                    <span className="font-extrabold text-white text-xs">
                      {activePolicy.lodgingRules?.twoEmployees?.ruleType === 'HIGHER_ONLY' ? 'Higher Only' : `${activePolicy.lodgingRules?.twoEmployees?.percent || activePolicy.sharedLodgingPercent || 75}%`}
                    </span>
                  </div>
                  <div className="bg-black/25 p-2 rounded-lg text-center">
                    <span className="text-indigo-300 block text-[9px] font-bold">3 EMPS</span>
                    <span className="font-extrabold text-white text-xs">
                      {activePolicy.lodgingRules?.threeEmployees?.ruleType === 'COMBINED_PERCENT' ? `${activePolicy.lodgingRules?.threeEmployees?.percent || 75}%` : 'High+Low'}
                    </span>
                  </div>
                  <div className="bg-black/25 p-2 rounded-lg text-center">
                    <span className="text-indigo-300 block text-[9px] font-bold">4+ EMPS</span>
                    <span className="font-extrabold text-white text-xs">
                      {activePolicy.lodgingRules?.fourPlusEmployees?.ruleType === 'COMBINED_PERCENT' ? `${activePolicy.lodgingRules?.fourPlusEmployees?.percent || 75}%` : 'Split 2s'}
                    </span>
                  </div>
                  <div className="bg-black/25 p-2 rounded-lg text-center">
                    <span className="text-indigo-300 block text-[9px] font-bold">RELATIVE</span>
                    <span className="font-extrabold text-white text-xs">{activePolicy.relativeStayPercent ?? 50}%</span>
                  </div>
                </div>
              </div>

              {/* Petrol & Vehicle Conveyance Rates (All 4 Types) */}
              <div className="p-3 rounded-xl bg-white/10 backdrop-blur-xs space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs font-extrabold text-indigo-200">
                  <span>⛽ All Petrol &amp; Vehicle Rates:</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-[11px]">
                  <div className="bg-black/25 p-2 rounded-lg text-center">
                    <span className="text-indigo-300 block text-[9px] font-bold">2-WHEELER</span>
                    <span className="font-extrabold text-white text-xs">₹{activePolicy.conveyanceRates?.twoWheeler ?? 0}/km</span>
                  </div>
                  <div className="bg-black/25 p-2 rounded-lg text-center">
                    <span className="text-indigo-300 block text-[9px] font-bold">CAR (4W)</span>
                    <span className="font-extrabold text-white text-xs">₹{activePolicy.conveyanceRates?.car ?? 0}/km</span>
                  </div>
                  <div className="bg-black/25 p-2 rounded-lg text-center">
                    <span className="text-indigo-300 block text-[9px] font-bold">E-BIKE</span>
                    <span className="font-extrabold text-white text-xs">₹{activePolicy.conveyanceRates?.eBike ?? 0}/km</span>
                  </div>
                  <div className="bg-black/25 p-2 rounded-lg text-center">
                    <span className="text-indigo-300 block text-[9px] font-bold">E-CAR</span>
                    <span className="font-extrabold text-white text-xs">₹{activePolicy.conveyanceRates?.eCar ?? 0}/km</span>
                  </div>
                </div>
              </div>

              {/* Reporting Manager Payment Approval Limit Rules */}
              <div className="p-3 rounded-xl bg-white/10 backdrop-blur-xs space-y-1.5">
                <div className="flex items-center justify-between text-xs font-extrabold text-indigo-200">
                  <span>🛡️ Reporting Manager Payment Limits:</span>
                  <button
                    type="button"
                    onClick={() => openLimitRuleModal()}
                    className="text-[10px] font-bold text-amber-300 hover:text-white underline cursor-pointer"
                  >
                    + Add Rule
                  </button>
                </div>
                {Array.isArray(activePolicy.approvalLimitRules) && activePolicy.approvalLimitRules.filter(r => r && r.status !== 'inactive').length > 0 ? (
                  <div className="flex flex-wrap gap-1.5 text-[11px]">
                    {activePolicy.approvalLimitRules
                      .filter(r => r && r.status !== 'inactive')
                      .slice()
                      .sort((a, b) => (Number(a.maxAmount) || 0) - (Number(b.maxAmount) || 0))
                      .map((r, i) => (
                        <div key={r._id || i} className="bg-black/25 px-2.5 py-1.5 rounded-lg flex items-center gap-1.5">
                          <span className="text-amber-300 font-bold text-[10px]">Till {r.roleName}:</span>
                          <span className="font-extrabold text-white text-xs">₹{r.maxAmount}</span>
                        </div>
                      ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-indigo-200/80 m-0 pt-1">
                    No role payment limits set yet. Click <b>Manage Approval Limits</b> or <b>+ Add Rule</b> to configure role-wise approval limits for this company.
                  </p>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-amber-50 border border-amber-200 rounded-[2rem] p-5 text-amber-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
            <div className="flex items-center gap-3">
              <ShieldAlert className="text-amber-600 shrink-0" size={24} />
              <div>
                <p className="text-xs font-extrabold m-0 text-amber-900">No Active Policy in Force</p>
                <p className="text-[11px] font-medium text-amber-700 m-0 mt-0.5">Please activate or publish one policy below. Only 1 policy will govern all lodging and conveyance expense claims.</p>
              </div>
            </div>
            <button
              onClick={() => openPolicyModal()}
              className="px-4 py-2 bg-amber-600 text-white rounded-xl text-xs font-bold hover:bg-amber-700 transition-all cursor-pointer shadow-sm shrink-0"
            >
              + Create Policy
            </button>
          </div>
        )}

        {/* Starting Page: CFO / Finance Head (2nd-Step Approval for Selected Claims) */}
        <FinanceHeadPanel
          reqConfig={getReqConfig(effectiveCompanyId)}
          companyId={effectiveCompanyId}
          expenseTypes={types}
          onRulesUpdated={() => {
            const cfg = getReqConfig(effectiveCompanyId);
            loadPolicies(cfg);
            loadTypes(cfg);
          }}
        />


        {/* Tabs Console Navigation */}
        <div className="bg-white rounded-[2rem] border border-slate-100 shadow-xl overflow-hidden">
          <div className="flex flex-wrap items-center gap-1 p-3 border-b border-slate-100 bg-slate-50/50">
            {TABS.map(t => (
              <button
                key={t.key}
                onClick={() => { setActiveTab(t.key); setSearchQuery(''); }}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs transition-all ${activeTab === t.key ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' : 'text-slate-500 hover:bg-white hover:text-indigo-600'}`}
              >
                {t.icon}
                {t.label}
              </button>
            ))}

            <div className="ml-auto hidden md:flex items-center gap-3">
              <div className="relative">
                <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search rules, cities, levels..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 pr-4 py-2.5 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-700 outline-none focus:border-indigo-300 w-60 shadow-2xs"
                />
              </div>
            </div>
          </div>

          {/* ═══════════════════════════════════════════════════════════════
              TAB: ENTITLEMENTS (LEVEL-WISE MANAGED CONSOLE)
             ═══════════════════════════════════════════════════════════════ */}
          {activeTab === 'entitlements' ? (
            <div className="p-6 md:p-8 space-y-6">
              {/* Entitlement Controls & Level Selector */}
              <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 bg-slate-50/80 p-4 rounded-2xl border border-slate-200/70">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold text-slate-400 tracking-wider mr-1">Level:</span>
                  <button
                    onClick={() => setSelectedLevelFilter('ALL')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all ${selectedLevelFilter === 'ALL'
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-100'
                      : 'bg-white text-slate-600 hover:bg-slate-200 border border-slate-200'
                      }`}
                  >
                    All Levels ({distinctLevelNumbers.length})
                  </button>
                  {distinctLevelNumbers.map(ln => (
                    <button
                      key={ln}
                      onClick={() => setSelectedLevelFilter(String(ln))}
                      className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all ${String(selectedLevelFilter) === String(ln)
                        ? 'bg-indigo-600 text-white shadow-md shadow-indigo-100'
                        : 'bg-white text-slate-600 hover:bg-slate-200 border border-slate-200'
                        }`}
                    >
                      L{ln}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2 w-full lg:w-auto justify-end">
                  <button
                    type="button"
                    onClick={() => openTravelEntModal(null, selectedLevelFilter !== 'ALL' ? selectedLevelFilter : 0)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-sky-600 text-white font-bold text-xs hover:bg-sky-700 transition-all shadow-sm"
                  >
                    <Plane size={14} />
                    <span>+ Travel Entitlement</span>
                  </button>
                  <div className="flex items-center bg-white border border-slate-200 rounded-xl p-1 shadow-2xs">
                    <button
                      onClick={() => setEntitlementViewMode('cards')}
                      className={`p-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${entitlementViewMode === 'cards' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-400 hover:text-slate-700'
                        }`}
                      title="Level-by-Level Cards"
                    >
                      <LayoutGrid size={15} />
                      <span className="hidden sm:inline">Cards View</span>
                    </button>
                    <button
                      onClick={() => setEntitlementViewMode('table')}
                      className={`p-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${entitlementViewMode === 'table' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-400 hover:text-slate-700'
                        }`}
                      title="Matrix Table"
                    >
                      <List size={15} />
                      <span className="hidden sm:inline">Table View</span>
                    </button>
                  </div>
                </div>
              </div>

              {levelGroups.length === 0 ? (
                <div className="p-12 text-center bg-slate-50/50 rounded-3xl border border-dashed border-slate-200 space-y-3">
                  <Sliders size={32} className="mx-auto text-slate-400" />
                  <p className="text-sm font-bold text-slate-600 m-0">No entitlements found for the selected criteria.</p>
                  <button
                    onClick={() => openEntModal(null, selectedLevelFilter !== 'ALL' && selectedLevelFilter !== '1' ? selectedLevelFilter : (distinctLevelNumbers[0] ? String(distinctLevelNumbers[0]) : '2'))}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 text-white font-bold text-xs hover:bg-indigo-700 transition-all shadow-md shadow-indigo-100"
                  >
                    <Plus size={14} /> Add First Entitlement
                  </button>
                </div>
              ) : entitlementViewMode === 'cards' ? (
                /* LEVEL CARDS VIEW */
                <div className="space-y-6">
                  {levelGroups.map((group) => {
                    const categoryKeys = Object.keys(group.byType);
                    const travelEnts = group.travelEntitlements || [];
                    return (
                      <div
                        key={group.levelNumber}
                        className="bg-white rounded-3xl border border-slate-200/90 shadow-sm hover:shadow-md transition-shadow overflow-hidden"
                      >
                        {/* Level Header */}
                        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center font-bold text-sm text-indigo-200">
                              {group.levelNumber === 0 ? 'ALL' : `L${group.levelNumber}`}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <h4 className="text-base font-bold text-white m-0">
                                  {group.levelNumber === 0 ? 'All Levels (Company Default)' : `Level ${group.levelNumber}`}
                                  {group.levelNumber !== 0 && group.levelName && group.levelName !== `Level ${group.levelNumber}` ? ` · ${group.levelName}` : ''}
                                </h4>
                                {group.grade && (
                                  <span className="px-2 py-0.5 rounded-md bg-white/15 text-[10px] font-mono font-bold text-indigo-200">
                                    Grade: {group.grade}
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-slate-300 font-semibold m-0 mt-0.5">
                                {group.totalRules} configured rule{group.totalRules === 1 ? '' : 's'} ({categoryKeys.length} rate categories, {travelEnts.length} travel rules)
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => openTravelEntModal(null, group.levelNumber)}
                              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-sky-500/20 hover:bg-sky-500 text-sky-200 hover:text-white font-bold text-xs transition-all border border-sky-400/30"
                            >
                              <Plane size={13} />
                              <span>Add Travel Rule</span>
                            </button>
                            {group.levelNumber !== 0 && (
                              <button
                                onClick={() => openEntModal(null, group.levelNumber)}
                                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-white/15 hover:bg-white text-white hover:text-indigo-950 font-bold text-xs transition-all border border-white/20"
                              >
                                <Plus size={13} />
                                <span>Add Rate</span>
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Level Body: Category Rate Grids + Travel Entitlements */}
                        <div className="p-6 space-y-4">
                          {categoryKeys.length === 0 && travelEnts.length === 0 ? (
                            <div className="p-6 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                              <p className="text-xs font-bold text-slate-400 m-0">
                                No rates configured for Level {group.levelNumber}.
                              </p>
                              <div className="mt-2 flex items-center justify-center gap-4">
                                <button
                                  onClick={() => openEntModal(null, group.levelNumber, 'LODGING')}
                                  className="text-xs font-bold text-indigo-600 hover:underline inline-flex items-center gap-1"
                                >
                                  <Plus size={12} /> Set Food &amp; Lodging limits
                                </button>
                                <button
                                  onClick={() => openTravelEntModal(null, group.levelNumber)}
                                  className="text-xs font-bold text-sky-600 hover:underline inline-flex items-center gap-1"
                                >
                                  <Plane size={12} /> Set Travel Mode entitlements
                                </button>
                              </div>
                            </div>
                          ) : (
                            <>
                              {categoryKeys.length > 0 && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  {categoryKeys.map((typeCode) => {
                                    const typeEnts = group.byType[typeCode] || {};
                                    const isLodging = typeCode.includes('LODG');
                                    const isFood = typeCode.includes('FOOD') || typeCode.includes('MEAL');

                                    return (
                                      <div
                                        key={typeCode}
                                        className="p-4 bg-slate-50/70 hover:bg-slate-50 rounded-2xl border border-slate-200/70 space-y-3 transition-colors"
                                      >
                                        <div className="flex items-center justify-between pb-2 border-b border-slate-200/50">
                                          <div className="flex items-center gap-2">
                                            <div className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs ${isLodging
                                              ? 'bg-indigo-100 text-indigo-700'
                                              : isFood
                                                ? 'bg-amber-100 text-amber-700'
                                                : 'bg-slate-200 text-slate-700'
                                              }`}>
                                              {isLodging ? '🏨' : isFood ? '🍔' : '🏷️'}
                                            </div>
                                            <div>
                                              <p className="text-xs font-bold text-slate-800 m-0 tracking-wider">
                                                {typeCode}
                                              </p>
                                              <p className="text-[10px] font-bold text-slate-400 m-0">
                                                {types.find(t => t.code === typeCode)?.name || typeCode}
                                              </p>
                                            </div>
                                          </div>

                                          <button
                                            onClick={() => openEntModal(null, group.levelNumber, typeCode)}
                                            className="p-1 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-white transition-all"
                                            title={`Add new rate for ${typeCode}`}
                                          >
                                            <Plus size={14} />
                                          </button>
                                        </div>

                                        {/* City Class Pill Grid */}
                                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                          {CITY_CLASSES.map((cClass) => {
                                            const ent = typeEnts[cClass] || (typeEnts['ALL'] ? { ...typeEnts['ALL'], cityClass: cClass, _isFallback: true } : null);
                                            return (
                                              <div
                                                key={cClass}
                                                className={`p-2.5 rounded-xl border flex flex-col justify-between transition-all group ${ent
                                                  ? 'bg-white border-slate-200/90 shadow-2xs'
                                                  : 'bg-slate-100/60 border-dashed border-slate-200/80 text-slate-400'
                                                  }`}
                                              >
                                                <div className="flex items-center justify-between">
                                                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-extrabold ${cClass === 'A+'
                                                    ? 'bg-rose-50 text-rose-600 border border-rose-100'
                                                    : cClass === 'A'
                                                      ? 'bg-amber-50 text-amber-600 border border-amber-100'
                                                      : cClass === 'B'
                                                        ? 'bg-blue-50 text-blue-600 border border-blue-100'
                                                        : 'bg-slate-100 text-slate-600'
                                                    }`}>
                                                    Class {cClass}
                                                  </span>

                                                  {ent && (
                                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                      <button
                                                        onClick={() => openEntModal(ent._isFallback ? null : ent, group.levelNumber, typeCode, cClass)}
                                                        className="p-0.5 text-slate-400 hover:text-indigo-600"
                                                        title="Edit rate"
                                                      >
                                                        <Edit2 size={11} />
                                                      </button>
                                                      {!ent._isFallback && (
                                                        <button
                                                          onClick={() => setDeleteConfirm({ show: true, id: ent._id, kind: 'entitlements' })}
                                                          className="p-0.5 text-slate-400 hover:text-rose-600"
                                                          title="Delete rate"
                                                        >
                                                          <Trash2 size={11} />
                                                        </button>
                                                      )}
                                                    </div>
                                                  )}
                                                </div>

                                                <div className="mt-2">
                                                  {ent ? (
                                                    <div>
                                                      <span className="text-sm font-bold text-slate-900 block leading-tight">
                                                        ₹{Number(ent.amount).toLocaleString('en-IN')}
                                                      </span>
                                                      <span className="text-[9px] font-bold text-slate-400 lowercase block">
                                                        {ent.unit?.replace('_', ' ') || (isLodging ? 'per night' : 'per day')}
                                                      </span>
                                                    </div>
                                                  ) : (
                                                    <button
                                                      onClick={() => openEntModal(null, group.levelNumber, typeCode, cClass)}
                                                      className="text-[10px] font-bold text-slate-400 hover:text-indigo-600 hover:underline flex items-center gap-0.5 pt-1"
                                                    >
                                                      <Plus size={10} /> Set Limit
                                                    </button>
                                                  )}
                                                </div>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}

                              {/* Travel Mode & Subtype Entitlements for this Level */}
                              <div className="p-4 bg-sky-50/50 rounded-2xl border border-sky-200/70 space-y-3">
                                <div className="flex items-center justify-between pb-2 border-b border-sky-200/50">
                                  <div className="flex items-center gap-2">
                                    <div className="w-7 h-7 rounded-lg bg-sky-100 text-sky-700 flex items-center justify-center font-bold text-xs">
                                      <Plane size={14} />
                                    </div>
                                    <div>
                                      <p className="text-xs font-bold text-slate-800 m-0 tracking-wider">
                                        TRAVEL MODE &amp; SUBTYPE ENTITLEMENTS
                                      </p>
                                      <p className="text-[10px] font-bold text-slate-500 m-0">
                                        Permitted travel modes, classes/subtypes, and optional monetary caps (unlisted subtypes are treated as excess)
                                      </p>
                                    </div>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => openTravelEntModal(null, group.levelNumber)}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white text-sky-700 border border-sky-200 text-[11px] font-bold hover:bg-sky-600 hover:text-white transition-all"
                                  >
                                    <Plus size={12} /> Add Mode Rule
                                  </button>
                                </div>

                                {travelEnts.length === 0 ? (
                                  <p className="text-xs font-semibold text-slate-400 m-0 py-1">
                                    No travel mode entitlements configured for Level {group.levelNumber} yet. Click &quot;Add Mode Rule&quot; or &quot;+ Travel Entitlement&quot; to assign permitted travel modes.
                                  </p>
                                ) : (
                                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
                                    {travelEnts.map((te) => (
                                      <div key={te._id} className="p-3 bg-white rounded-xl border border-sky-100 shadow-2xs flex flex-col justify-between gap-2">
                                        <div className="flex items-start justify-between gap-2">
                                          <div>
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                              <span className="w-6 h-6 rounded-lg bg-sky-50 text-sky-600 inline-flex items-center justify-center shrink-0">
                                                {getTravelModeIcon(te.travelModeCode || te.travelModeName, 13)}
                                              </span>
                                              <span className="text-xs font-extrabold text-slate-900">{te.travelModeName || te.travelModeCode}</span>
                                              <span className="px-1.5 py-0.5 rounded bg-sky-50 text-sky-700 text-[9px] font-extrabold border border-sky-100">
                                                Class {te.cityClass || 'ALL'}
                                              </span>
                                              {te.gradeCode && (
                                                <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 text-[9px] font-bold">
                                                  Grade {te.gradeCode.toUpperCase()}
                                                </span>
                                              )}
                                            </div>
                                            {Array.isArray(te.allowedSubtypes) && te.allowedSubtypes.length > 0 ? (
                                              <div className="flex flex-wrap gap-1 mt-1.5">
                                                {te.allowedSubtypes.map((sub, subIdx) => (
                                                  <span key={`${te._id || 'ent'}_${sub.subtypeId || sub.code}_${subIdx}`} className="px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold">
                                                    {sub.name || sub.code} · {fmtTravelMax(sub.maxAmount)}
                                                  </span>
                                                ))}
                                              </div>
                                            ) : (
                                              <p className="text-[10px] font-bold text-slate-600 m-0 mt-1">
                                                Cap: <span className="text-emerald-700">{fmtTravelMax(te.maxAmount)}</span>
                                              </p>
                                            )}
                                          </div>
                                          <div className="flex items-center gap-1 shrink-0">
                                            <button
                                              type="button"
                                              onClick={() => openTravelEntModal(te, group.levelNumber)}
                                              className="p-1 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-slate-50"
                                              title="Edit travel entitlement"
                                            >
                                              <Edit2 size={12} />
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => setDeleteConfirm({ show: true, id: te._id, kind: 'entitlements' })}
                                              className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                                              title="Delete travel entitlement"
                                            >
                                              <Trash2 size={12} />
                                            </button>
                                          </div>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                /* MATRIX TABLE VIEW */
                <div className="overflow-x-auto border border-slate-200 rounded-2xl">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50/80 border-b border-slate-200">
                        <th className="px-5 py-3.5 text-center text-[10px] font-extrabold text-indigo-600 tracking-widest border-r border-slate-200">LEVEL</th>
                        <th className="px-5 py-3.5 text-[10px] font-extrabold text-indigo-600 tracking-widest border-r border-slate-200">CATEGORY</th>
                        <th className="px-5 py-3.5 text-center text-[10px] font-extrabold text-indigo-600 tracking-widest border-r border-slate-200">CLASS A+</th>
                        <th className="px-5 py-3.5 text-center text-[10px] font-extrabold text-indigo-600 tracking-widest border-r border-slate-200">CLASS A</th>
                        <th className="px-5 py-3.5 text-center text-[10px] font-extrabold text-indigo-600 tracking-widest border-r border-slate-200">CLASS B</th>
                        <th className="px-5 py-3.5 text-center text-[10px] font-extrabold text-indigo-600 tracking-widest border-r border-slate-200">CLASS C</th>
                        <th className="px-5 py-3.5 text-center text-[10px] font-extrabold text-indigo-600 tracking-widest">ACTIONS</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {levelGroups.map((g) => {
                        const typesList = Object.keys(g.byType);
                        const travelEnts = g.travelEntitlements || [];
                        const hasTravelRow = travelEnts.length > 0;
                        const totalRowsForLevel = typesList.length + (hasTravelRow ? 1 : 0);

                        if (totalRowsForLevel === 0) {
                          return (
                            <tr key={g.levelNumber} className="hover:bg-slate-50/50">
                              <td className="px-5 py-3.5 text-center font-extrabold text-xs text-indigo-700 bg-indigo-50/30 border-r border-slate-200">
                                L{g.levelNumber}
                              </td>
                              <td className="px-5 py-3.5 text-xs text-slate-400 border-r border-slate-200">
                                No rates configured
                              </td>
                              <td colSpan={4} className="px-5 py-3.5 text-center text-xs text-slate-300 border-r border-slate-200">—</td>
                              <td className="px-5 py-3.5 text-center">
                                <button
                                  onClick={() => openEntModal(null, g.levelNumber, 'LODGING', 'A+')}
                                  className="text-xs font-bold text-indigo-600 hover:underline"
                                >
                                  + Add Limit
                                </button>
                              </td>
                            </tr>
                          );
                        }
                        const rateRows = typesList.map((tCode, idx) => {
                          const rates = g.byType[tCode] || {};
                          return (
                            <tr key={`${g.levelNumber}-${tCode}`} className="hover:bg-slate-50/50">
                              {idx === 0 && (
                                <td
                                  rowSpan={totalRowsForLevel}
                                  className="px-5 py-3.5 text-center font-bold text-sm text-indigo-800 bg-indigo-50/30 border-r border-slate-200 align-top pt-4"
                                >
                                  L{g.levelNumber}
                                  <span className="block text-[10px] font-bold text-slate-400 mt-0.5">
                                    {g.levelName || ''}
                                  </span>
                                </td>
                              )}
                              <td className="px-5 py-3.5 text-xs font-bold text-slate-800 border-r border-slate-200">
                                <span className="font-bold text-indigo-700">{tCode}</span>
                              </td>
                              {CITY_CLASSES.map((cc) => (
                                <td key={cc} className="px-3 py-3 text-center text-xs font-extrabold border-r border-slate-200">
                                  {rates[cc] ? (
                                    <button
                                      type="button"
                                      onClick={() => openEntModal(rates[cc], g.levelNumber, tCode, cc)}
                                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg hover:bg-indigo-50 text-slate-900 hover:text-indigo-600 transition-all font-bold group cursor-pointer"
                                      title={`Edit Level ${g.levelNumber} ${tCode} Class ${cc}`}
                                    >
                                      <span>₹{Number(rates[cc].amount).toLocaleString('en-IN')}</span>
                                      <Edit2 size={11} className="opacity-0 group-hover:opacity-100 text-indigo-500 transition-opacity" />
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => openEntModal(null, g.levelNumber, tCode, cc)}
                                      className="text-slate-300 hover:text-indigo-600 px-2 py-1 rounded hover:bg-slate-100 text-xs cursor-pointer hover:underline transition-colors"
                                      title={`Set Level ${g.levelNumber} ${tCode} Class ${cc}`}
                                    >
                                      —
                                    </button>
                                  )}
                                </td>
                              ))}
                              <td className="px-5 py-3.5 text-center">
                                <button
                                  onClick={() => openEntModal(null, g.levelNumber, tCode, 'A+')}
                                  className="p-1 text-slate-400 hover:text-indigo-600"
                                  title="Add Rate"
                                >
                                  <Plus size={14} />
                                </button>
                              </td>
                            </tr>
                          );
                        });

                        if (hasTravelRow) {
                          rateRows.push(
                            <tr key={`${g.levelNumber}-TRAVEL`} className="hover:bg-sky-50/40 bg-sky-50/15">
                              {typesList.length === 0 && (
                                <td
                                  rowSpan={totalRowsForLevel}
                                  className="px-5 py-3.5 text-center font-bold text-sm text-indigo-800 bg-indigo-50/30 border-r border-slate-200 align-top pt-4"
                                >
                                  L{g.levelNumber}
                                  <span className="block text-[10px] font-bold text-slate-400 mt-0.5">
                                    {g.levelName || ''}
                                  </span>
                                </td>
                              )}
                              <td className="px-5 py-3.5 text-xs font-bold text-sky-700 border-r border-slate-200">
                                TRAVEL ({travelEnts.length})
                              </td>
                              <td colSpan={4} className="px-4 py-3 border-r border-slate-200">
                                <div className="flex flex-wrap gap-1.5">
                                  {travelEnts.map((te) => (
                                    <button
                                      key={te._id || `${te.travelModeCode}_${te.cityClass}`}
                                      type="button"
                                      onClick={() => openTravelEntModal(te, g.levelNumber)}
                                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border border-sky-200 text-[11px] font-bold text-slate-800 hover:border-sky-400 transition-all cursor-pointer"
                                    >
                                      <span className="text-sky-600">{getTravelModeIcon(te.travelModeCode || te.travelModeName, 12)}</span>
                                      <span>{te.travelModeName || te.travelModeCode}</span>
                                      {Array.isArray(te.allowedSubtypes) && te.allowedSubtypes.length > 0 && (
                                        <span className="text-[10px] font-semibold text-emerald-700">
                                          ({te.allowedSubtypes.map((s) => s.name || s.code).join(', ')})
                                        </span>
                                      )}
                                    </button>
                                  ))}
                                </div>
                              </td>
                              <td className="px-5 py-3.5 text-center">
                                <button
                                  type="button"
                                  onClick={() => openTravelEntModal(null, g.levelNumber)}
                                  className="p-1 text-sky-600 hover:text-sky-800"
                                  title="Configure Travel Entitlement"
                                >
                                  <Edit2 size={13} />
                                </button>
                              </td>
                            </tr>
                          );
                        }

                        return rateRows;
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : activeTab === 'approvalLimits' ? (
            /* ═══════════════════════════════════════════════════════════════
                TAB: SEPARATE PAY LIMIT SET OR NOT & APPROVAL LIMIT RULES MODULE
               ═══════════════════════════════════════════════════════════════ */
            <div className="p-6 md:p-8 space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-6 rounded-3xl shadow-md">
                <div className="flex items-start gap-3.5">
                  <div className="w-11 h-11 rounded-2xl bg-amber-500/20 border border-amber-400/30 flex items-center justify-center text-amber-300 shrink-0">
                    <ShieldAlert size={22} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white m-0">
                      Reporting Manager &amp; Role Payment Approval Limit Rules
                    </h3>
                    <p className="text-xs text-slate-300 font-medium m-0 mt-1">
                      Configure dynamic payment limits per role/hierarchy level. Toggle which claim types apply the Pay Limit rule ON/OFF from the Expense Types tab.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => openLimitRuleModal()}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-lg transition-all cursor-pointer shrink-0"
                >
                  <Plus size={15} />
                  <span>Add Approval Limit Rule</span>
                </button>
              </div>

              {(() => {
                const targetPol = activePolicy || policies[0];
                const rawRules = Array.isArray(targetPol?.approvalLimitRules) ? targetPol.approvalLimitRules : [];
                const indexedRules = rawRules
                  .map((r, originalIdx) => ({ ...r, originalIdx }))
                  .filter(r => {
                    if (!searchQuery) return true;
                    const q = searchQuery.toLowerCase();
                    return (`${r.roleName || ''} ${r.maxAmount || ''} ${r.description || ''}`).toLowerCase().includes(q);
                  })
                  .sort((a, b) => (Number(a.maxAmount) || 0) - (Number(b.maxAmount) || 0));

                if (!targetPol) {
                  return (
                    <div className="p-10 text-center bg-amber-50 rounded-3xl border border-amber-200 space-y-3">
                      <p className="text-sm font-bold text-amber-900 m-0">Please create an Expense Policy first to configure Pay Limit rules.</p>
                      <button
                        type="button"
                        onClick={() => openPolicyModal()}
                        className="px-4 py-2 bg-amber-600 text-white rounded-xl text-xs font-bold hover:bg-amber-700"
                      >
                        + Create Expense Policy
                      </button>
                    </div>
                  );
                }

                return (
                  <div className="space-y-6">
                    {/* Role / Hierarchy Level Payment Approval Limit Rules Table */}
                    {indexedRules.length === 0 ? (
                      <div className="p-12 text-center bg-slate-50/70 rounded-3xl border border-dashed border-slate-200 space-y-3">
                        <ShieldAlert size={32} className="mx-auto text-slate-400" />
                        <p className="text-sm font-bold text-slate-700 m-0">No dynamic role/level payment limit rules configured yet for this company.</p>
                        <p className="text-xs font-medium text-slate-500 m-0 max-w-lg mx-auto">
                          Add role-wise payment limit rules for this company&apos;s hierarchy so claims with Pay Limit ON automatically route to the matching role in the employee&apos;s hierarchy.
                        </p>
                        <button
                          type="button"
                          onClick={() => openLimitRuleModal()}
                          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-indigo-600 text-white font-bold text-xs hover:bg-indigo-700 transition-all shadow-md cursor-pointer"
                        >
                          <Plus size={14} /> Add First Approval Limit Rule
                        </button>
                      </div>
                    ) : (
                      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-2xs">
                        <table className="w-full text-left border-collapse border border-slate-200">
                          <thead>
                            <tr className="bg-slate-50 border-b border-slate-200">
                              <th className="px-5 py-4 text-center text-[10px] font-extrabold text-indigo-600 tracking-widest border border-slate-200 whitespace-nowrap w-28">
                                TIER
                              </th>
                              <th className="px-5 py-4 text-[10px] font-extrabold text-indigo-600 tracking-widest border border-slate-200 whitespace-nowrap min-w-[210px]">
                                ROLE / HIERARCHY LEVEL
                              </th>
                              <th className="px-5 py-4 text-[10px] font-extrabold text-indigo-600 tracking-widest border border-slate-200 whitespace-nowrap min-w-[250px]">
                                PAYMENT APPROVAL LIMIT (₹)
                              </th>
                              <th className="px-5 py-4 text-[10px] font-extrabold text-indigo-600 tracking-widest border border-slate-200 min-w-[280px]">
                                DESCRIPTION / ROUTING RULE
                              </th>
                              <th className="px-5 py-4 text-center text-[10px] font-extrabold text-indigo-600 tracking-widest border border-slate-200 whitespace-nowrap w-28">
                                STATUS
                              </th>
                              <th className="px-5 py-4 text-center text-[10px] font-extrabold text-indigo-600 tracking-widest border border-slate-200 whitespace-nowrap w-36">
                                ACTIONS
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200">
                            {indexedRules.map((r, tierIdx) => {
                              const prevMax = tierIdx > 0 ? Number(indexedRules[tierIdx - 1].maxAmount) : 0;
                              const maxFormatted = Number(r.maxAmount).toLocaleString('en-IN');
                              const prevFormatted = prevMax.toLocaleString('en-IN');
                              return (
                                <tr key={r._id || r.originalIdx} className="hover:bg-slate-50/70 transition-colors">
                                  <td className="px-5 py-4 text-center border border-slate-200 whitespace-nowrap align-middle">
                                    <span className="inline-flex items-center justify-center px-3 py-1 rounded-lg bg-indigo-50 text-indigo-700 font-extrabold text-xs border border-indigo-100 whitespace-nowrap">
                                      Tier {tierIdx + 1}
                                    </span>
                                  </td>
                                  <td className="px-5 py-4 border border-slate-200 whitespace-nowrap align-middle">
                                    <div className="inline-flex items-center gap-2">
                                      <span className="text-sm font-extrabold text-slate-900">{r.roleName}</span>
                                      {r.levelNumber && (
                                        <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200 font-mono font-extrabold text-[11px]">
                                          L{r.levelNumber}
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="px-5 py-4 border border-slate-200 whitespace-nowrap align-middle">
                                    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-50 text-amber-900 border border-amber-200 whitespace-nowrap">
                                      <span className="font-extrabold text-xs">
                                        {prevMax > 0 ? `₹${prevFormatted} – ₹${maxFormatted}` : `Up to ₹${maxFormatted}`}
                                      </span>
                                      <span className="text-[11px] font-bold text-amber-700 border-l border-amber-200 pl-2">
                                        Till {r.roleName}
                                      </span>
                                    </div>
                                  </td>
                                  <td className="px-5 py-4 border border-slate-200 align-middle">
                                    <p className="text-xs font-semibold text-slate-700 m-0 leading-relaxed">
                                      {r.description || `Claims up to ₹${maxFormatted} are approved by ${r.roleName} in employee's department/hierarchy`}
                                    </p>
                                  </td>
                                  <td className="px-5 py-4 text-center border border-slate-200 whitespace-nowrap align-middle">
                                    <span className={`inline-flex items-center justify-center px-3 py-1 rounded-full text-[10px] font-extrabold tracking-wider border whitespace-nowrap ${r.status === 'inactive' ? 'bg-rose-50 text-rose-600 border-rose-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                                      {(r.status || 'active').toUpperCase()}
                                    </span>
                                  </td>
                                  <td className="px-5 py-4 text-center border border-slate-200 whitespace-nowrap align-middle">
                                    <div className="inline-flex items-center justify-center gap-2">
                                      <button
                                        type="button"
                                        onClick={() => openLimitRuleModal(r, r.originalIdx)}
                                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-indigo-50 text-indigo-600 hover:bg-indigo-600 hover:text-white transition-all text-xs font-bold cursor-pointer"
                                      >
                                        <Edit2 size={13} />
                                        <span>Edit</span>
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => deleteLimitRule(r.originalIdx)}
                                        className="p-2 rounded-xl bg-slate-50 text-slate-400 hover:bg-rose-600 hover:text-white transition-all cursor-pointer"
                                        title="Delete Rule"
                                      >
                                        <Trash2 size={14} />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          ) : activeTab === 'cities' ? (
            /* ═══════════════════════════════════════════════════════════════
                HORIZONTAL CITY CLASSES VIEW (A+ First, then A, B, C)
               ═══════════════════════════════════════════════════════════════ */
            <div className="p-6 space-y-6">
              {/* City Class Filter Header */}
              <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-slate-50/80 rounded-2xl border border-slate-200">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold text-slate-400 tracking-wider mr-1">City Class:</span>
                  <button
                    onClick={() => setSelectedCityClassFilter('ALL')}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${selectedCityClassFilter === 'ALL'
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-100'
                      : 'bg-white text-slate-600 hover:bg-slate-200 border border-slate-200'
                      }`}
                  >
                    All Classes ({cities.length})
                  </button>
                  {CITY_CLASSES.map(cls => {
                    const count = cities.filter(c => c.cityClass === cls).length;
                    return (
                      <button
                        key={cls}
                        onClick={() => setSelectedCityClassFilter(cls)}
                        className={`px-3.5 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${selectedCityClassFilter === cls
                          ? cls === 'A+' ? 'bg-rose-600 text-white shadow-md shadow-rose-100'
                            : cls === 'A' ? 'bg-amber-600 text-white shadow-md shadow-amber-100'
                              : cls === 'B' ? 'bg-blue-600 text-white shadow-md shadow-blue-100'
                                : 'bg-slate-700 text-white shadow-md'
                          : 'bg-white text-slate-600 hover:bg-slate-200 border border-slate-200'
                          }`}
                      >
                        Class {cls} ({count})
                      </button>
                    );
                  })}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold text-slate-400">
                    {filtered.length} {filtered.length === 1 ? 'city' : 'cities'} displayed
                  </span>
                  <button
                    onClick={() => openCityModal(null, selectedCityClassFilter !== 'ALL' ? selectedCityClassFilter : 'A+')}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-indigo-600 text-white text-xs font-bold shadow-md shadow-indigo-100 hover:bg-indigo-700 transition-all cursor-pointer"
                  >
                    <Plus size={14} /> Add City
                  </button>
                </div>
              </div>

              {/* Horizontal City List Grouped by Class (A+ First, then A, B, C) */}
              <div className="space-y-5">
                {CITY_CLASSES.filter(cls => selectedCityClassFilter === 'ALL' || selectedCityClassFilter === cls).map(cClass => {
                  const classCities = filtered.filter(c => c.cityClass === cClass);
                  const isRose = cClass === 'A+';
                  const isAmber = cClass === 'A';
                  const isBlue = cClass === 'B';

                  const theme = isRose ? {
                    border: 'border-rose-200',
                    headerBg: 'bg-gradient-to-r from-rose-600 to-rose-700 text-white',
                    pillBg: 'bg-white border-rose-200 text-slate-800 hover:border-rose-400 hover:shadow-sm',
                    badge: 'bg-white/20 text-white',
                    desc: 'Tier 1 Metro & Prime Tourist hubs with highest lodging and allowance limits.'
                  } : isAmber ? {
                    border: 'border-amber-200',
                    headerBg: 'bg-gradient-to-r from-amber-600 to-amber-700 text-white',
                    pillBg: 'bg-white border-amber-200 text-slate-800 hover:border-amber-400 hover:shadow-sm',
                    badge: 'bg-white/20 text-white',
                    desc: 'Major commercial, industrial and capital cities with standard Tier 2 entitlements.'
                  } : isBlue ? {
                    border: 'border-blue-200',
                    headerBg: 'bg-gradient-to-r from-blue-600 to-blue-700 text-white',
                    pillBg: 'bg-white border-blue-200 text-slate-800 hover:border-blue-400 hover:shadow-sm',
                    badge: 'bg-white/20 text-white',
                    desc: 'Tier 3 urban centers and emerging business districts.'
                  } : {
                    border: 'border-slate-200',
                    headerBg: 'bg-gradient-to-r from-slate-700 to-slate-800 text-white',
                    pillBg: 'bg-white border-slate-200 text-slate-800 hover:border-slate-400 hover:shadow-sm',
                    badge: 'bg-white/20 text-white',
                    desc: 'All other non-listed cities, towns, and rural locations (Default baseline entitlement).'
                  };

                  return (
                    <div key={cClass} className={`rounded-3xl border ${theme.border} bg-white shadow-xs overflow-hidden`}>
                      {/* Class Header Bar */}
                      <div className={`${theme.headerBg} px-6 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3`}>
                        <div className="flex items-center gap-3">
                          <span className={`px-3 py-1 rounded-xl text-xs font-bold tracking-wider ${theme.badge}`}>
                            CLASS {cClass}
                          </span>
                          <div>
                            <h3 className="text-sm font-bold m-0 flex items-center gap-2">
                              Class {cClass} Cities ({classCities.length})
                            </h3>
                            <p className="text-[11px] opacity-85 m-0 font-medium">{theme.desc}</p>
                          </div>
                        </div>

                        <button
                          onClick={() => openCityModal(null, cClass)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/15 hover:bg-white text-white hover:text-slate-900 font-bold text-xs transition-all border border-white/20 cursor-pointer"
                        >
                          <Plus size={13} />
                          <span>Add City to {cClass}</span>
                        </button>
                      </div>

                      {/* Horizontal Cities Badges Container */}
                      <div className="p-5">
                        {classCities.length === 0 ? (
                          <div className="p-6 text-center bg-slate-50/60 rounded-2xl border border-dashed border-slate-200">
                            <p className="text-xs font-bold text-slate-400 m-0">
                              {cClass === 'C'
                                ? 'Class C applies automatically to all unlisted cities. You can also explicitly add specific towns below.'
                                : `No cities configured under Class ${cClass} matching your search.`}
                            </p>
                            <button
                              onClick={() => openCityModal(null, cClass)}
                              className="mt-2 text-xs font-bold text-indigo-600 hover:underline inline-flex items-center gap-1 cursor-pointer"
                            >
                              <Plus size={12} /> Add city to Class {cClass}
                            </button>
                          </div>
                        ) : (
                          <div className="flex flex-wrap gap-2.5 items-center">
                            {classCities.map(c => (
                              <div
                                key={c._id || c.city}
                                className={`group inline-flex items-center gap-2 px-3.5 py-2 rounded-2xl border ${theme.pillBg} transition-all shadow-2xs max-w-full`}
                              >
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-xs font-bold text-slate-800 break-words">{c.city}</span>
                                  {c.state && (
                                    <span className="text-[10px] font-bold text-slate-400 break-words">({c.state})</span>
                                  )}
                                  {c.status !== 'active' && (
                                    <span className="px-1.5 py-0.5 rounded bg-rose-50 text-rose-600 text-[9px] font-bold shrink-0">
                                      Inactive
                                    </span>
                                  )}
                                </div>

                                {/* Quick Edit & Delete Actions on hover */}
                                <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity pl-1 border-l border-slate-100">
                                  <button
                                    onClick={() => openCityModal(c)}
                                    className="p-1 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-slate-100 transition-all cursor-pointer"
                                    title="Edit city"
                                  >
                                    <Edit2 size={11} />
                                  </button>
                                  <button
                                    onClick={() => setDeleteConfirm({ show: true, id: c._id, kind: 'cities' })}
                                    className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-all cursor-pointer"
                                    title="Delete city"
                                  >
                                    <Trash2 size={11} />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            /* ═══════════════════════════════════════════════════════════════
                STANDARD TABLES: POLICIES, EXPENSE TYPES, TRAVEL MODES
               ═══════════════════════════════════════════════════════════════ */
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse border border-slate-200">
                <thead>
                  <tr className="bg-slate-50/30">
                    {activeTab === 'policies' && (
                      <>
                        <th className="px-6 py-4 text-[10px] font-extrabold text-indigo-600 tracking-widest border border-slate-200">POLICY</th>
                        <th className="px-6 py-4 text-center text-[10px] font-extrabold text-indigo-600 tracking-widest border border-slate-200">STATUS</th>
                        <th className="px-6 py-4 text-[10px] font-extrabold text-indigo-600 tracking-widest border border-slate-200">LODGING STAY RULES (ALL 4 TIERS)</th>
                        <th className="px-6 py-4 text-[10px] font-extrabold text-indigo-600 tracking-widest border border-slate-200">PETROL / CONVEYANCE RATES</th>
                        <th className="px-6 py-4 text-[10px] font-extrabold text-indigo-600 tracking-widest border border-slate-200 text-center">ACTIONS</th>
                      </>
                    )}
                    {activeTab === 'types' && (
                      <>
                        <th className="px-6 py-4 text-[10px] font-extrabold text-indigo-600 tracking-widest border border-slate-200">EXPENSE TYPE</th>
                        <th className="px-6 py-4 text-center text-[10px] font-extrabold text-indigo-600 tracking-widest border border-slate-200">CATEGORY</th>
                        <th className="px-6 py-4 text-center text-[10px] font-extrabold text-indigo-600 tracking-widest border border-slate-200">CALC METHOD</th>
                        <th className="px-6 py-4 text-center text-[10px] font-extrabold text-indigo-600 tracking-widest border border-slate-200">PAY LIMIT RULE</th>
                        <th className="px-6 py-4 text-center text-[10px] font-extrabold text-indigo-600 tracking-widest border border-slate-200">CFO APPROVAL</th>
                        <th className="px-6 py-4 text-center text-[10px] font-extrabold text-indigo-600 tracking-widest border border-slate-200">STATUS</th>
                        <th className="px-6 py-4 text-[10px] font-extrabold text-indigo-600 tracking-widest border border-slate-200 text-center">ACTIONS</th>
                      </>
                    )}
                    {activeTab === 'travelModes' && (
                      <>
                        <th className="px-6 py-4 text-[10px] font-extrabold text-indigo-600 tracking-widest border border-slate-200">TRAVEL MODE</th>
                        <th className="px-6 py-4 text-center text-[10px] font-extrabold text-indigo-600 tracking-widest border border-slate-200">CODE</th>
                        <th className="px-6 py-4 text-[10px] font-extrabold text-indigo-600 tracking-widest border border-slate-200">SUBTYPES / VEHICLE TYPES</th>
                        <th className="px-6 py-4 text-center text-[10px] font-extrabold text-indigo-600 tracking-widest border border-slate-200">ORDER</th>
                        <th className="px-6 py-4 text-center text-[10px] font-extrabold text-indigo-600 tracking-widest border border-slate-200">STATUS</th>
                        <th className="px-6 py-4 text-[10px] font-extrabold text-indigo-600 tracking-widest border border-slate-200 text-center">ACTIONS</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={activeTab === 'policies' ? 5 : activeTab === 'types' ? 7 : 6} className="px-6 py-12 text-center text-slate-400 font-bold text-sm">
                        No {activeTab} found.
                      </td>
                    </tr>
                  )}

                  {activeTab === 'policies' && filtered.map(p => (
                    <tr key={p._id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-5 border border-slate-200">
                        <div className="flex items-center gap-4">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold ${p.status === 'active' ? 'bg-emerald-50 text-emerald-600' : 'bg-indigo-50 text-indigo-600'}`}>
                            <ShieldCheck size={20} />
                          </div>
                          <div className="text-left">
                            <p className="text-sm font-bold text-slate-900 m-0">{p.name}</p>
                            <p className="text-xs font-bold text-indigo-600 tracking-wider m-0 mt-0.5">{p.code} · v{p.version}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-5 text-center border border-slate-200">
                        <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-[10px] font-extrabold tracking-wider border ${p.status === 'active' ? 'bg-emerald-50 text-emerald-700 border-emerald-200 shadow-2xs' : p.status === 'draft' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                          {p.status === 'active' && <Check size={11} className="text-emerald-600 stroke-[3]" />}
                          {(p.status || 'draft').toUpperCase()}
                        </span>
                        {p.status === 'active' && (
                          <span className="block text-[9px] font-bold text-emerald-600 mt-1">In Force</span>
                        )}
                      </td>
                      {/* ALL 4 TYPES OF LODGING RULES IN ROWS */}
                      <td className="px-6 py-5 border border-slate-200">
                        <div className="space-y-1.5 min-w-[210px] text-left">
                          <div className="flex items-center gap-2 text-xs">
                            <span className="w-14 px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-extrabold text-[10px] text-center border border-emerald-100 shrink-0">1 Emp</span>
                            <span className="font-bold text-slate-700 text-[11px]">100% Individual</span>
                          </div>
                          <div className="flex items-center gap-2 text-xs">
                            <span className="w-14 px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 font-extrabold text-[10px] text-center border border-indigo-100 shrink-0">2 Emps</span>
                            <span className="font-bold text-slate-700 text-[11px]">
                              {p.lodgingRules?.twoEmployees?.ruleType === 'HIGHER_ONLY' ? 'Higher Only' : `${p.lodgingRules?.twoEmployees?.percent || p.sharedLodgingPercent || 75}% Combined`}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-xs">
                            <span className="w-14 px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 font-extrabold text-[10px] text-center border border-purple-100 shrink-0">3 Emps</span>
                            <span className="font-bold text-slate-700 text-[11px]">
                              {p.lodgingRules?.threeEmployees?.ruleType === 'COMBINED_PERCENT' ? `${p.lodgingRules?.threeEmployees?.percent || 75}% Combined` : 'Highest + Lowest'}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-xs">
                            <span className="w-14 px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 font-extrabold text-[10px] text-center border border-amber-100 shrink-0">4+ Emps</span>
                            <span className="font-bold text-slate-700 text-[11px]">
                              {p.lodgingRules?.fourPlusEmployees?.ruleType === 'COMBINED_PERCENT' ? `${p.lodgingRules?.fourPlusEmployees?.percent || 75}% Combined` : 'Split in 2s (75%)'}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-xs">
                            <span className="w-14 px-1.5 py-0.5 rounded bg-teal-50 text-teal-700 font-extrabold text-[10px] text-center border border-teal-100 shrink-0">Relative</span>
                            <span className="font-bold text-slate-700 text-[11px]">{p.relativeStayPercent ?? 50}% Allowance</span>
                          </div>
                        </div>
                      </td>
                      {/* ALL 4 TYPES OF PETROL / CONVEYANCE RATES IN ROWS */}
                      <td className="px-6 py-5 border border-slate-200">
                        <div className="grid grid-cols-2 gap-1.5 min-w-[190px] text-left">
                          <div className="px-2 py-1 rounded-lg bg-slate-50 border border-slate-100">
                            <span className="text-slate-400 font-bold block text-[9px]">2-Wheeler</span>
                            <span className="font-extrabold text-slate-800 text-[11px]">₹{p.conveyanceRates?.twoWheeler ?? 0}/km</span>
                          </div>
                          <div className="px-2 py-1 rounded-lg bg-slate-50 border border-slate-100">
                            <span className="text-slate-400 font-bold block text-[9px]">Car (4W)</span>
                            <span className="font-extrabold text-slate-800 text-[11px]">₹{p.conveyanceRates?.car ?? 0}/km</span>
                          </div>
                          <div className="px-2 py-1 rounded-lg bg-slate-50 border border-slate-100">
                            <span className="text-slate-400 font-bold block text-[9px]">E-Bike</span>
                            <span className="font-extrabold text-slate-800 text-[11px]">₹{p.conveyanceRates?.eBike ?? 0}/km</span>
                          </div>
                          <div className="px-2 py-1 rounded-lg bg-slate-50 border border-slate-100">
                            <span className="text-slate-400 font-bold block text-[9px]">E-Car</span>
                            <span className="font-extrabold text-slate-800 text-[11px]">₹{p.conveyanceRates?.eCar ?? 0}/km</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-5 border border-slate-200">
                        <div className="flex items-center justify-center gap-2">
                          <button onClick={() => openPolicyModal(p)} className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-indigo-50 text-indigo-600 hover:bg-indigo-600 hover:text-white transition-all text-xs font-bold shadow-sm cursor-pointer" title="Edit Policy">
                            <Edit2 size={13} /><span>Edit</span>
                          </button>
                          {p.status !== 'active' ? (
                            <button onClick={() => publishPolicy(p)} className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 hover:bg-emerald-600 hover:text-white transition-all text-xs font-bold shadow-sm cursor-pointer" title="Set this policy as the only active policy">
                              <Check size={13} /><span>Set Active</span>
                            </button>
                          ) : (
                            <span className="px-2.5 py-1 rounded-xl bg-emerald-100/70 text-emerald-800 text-[10px] font-extrabold">Active</span>
                          )}
                          <button onClick={() => setDeleteConfirm({ show: true, id: p._id, kind: 'policies' })} className="p-2 rounded-xl bg-slate-50 text-slate-400 hover:bg-rose-600 hover:text-white transition-all shadow-sm cursor-pointer" title="Delete Policy">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}

                  {activeTab === 'types' && filtered.map(t => {
                    const targetPol = activePolicy || policies[0];
                    const polPayTypes = Array.isArray(targetPol?.payLimitConfig?.applicableClaimTypes)
                      ? targetPol.payLimitConfig.applicableClaimTypes.map(normalizeClaimTypeCode)
                      : ['OTHER'];
                    const polCfoTypes = Array.isArray(targetPol?.cfoApprovalConfig?.applicableClaimTypes)
                      ? targetPol.cfoApprovalConfig.applicableClaimTypes.map(normalizeClaimTypeCode)
                      : ['STOCK_PURCHASE'];
                    const normCode = normalizeClaimTypeCode(t.code);
                    const isPayLimitOn = t.payLimitEnabled !== undefined ? Boolean(t.payLimitEnabled) : polPayTypes.includes(normCode);
                    const isCfoOn = t.cfoApprovalRequired !== undefined ? Boolean(t.cfoApprovalRequired) : polCfoTypes.includes(normCode);
                    return (
                      <tr key={t._id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-6 py-5 border border-slate-200">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center font-bold"><Layers size={20} /></div>
                            <div className="text-left">
                              <p className="text-sm font-bold text-slate-900">{t.name}</p>
                              <p className="text-xs font-bold text-violet-600 tracking-wider">{t.code}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-5 text-center border border-slate-200">
                          <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 text-[10px] font-extrabold tracking-widest">{t.category}</span>
                        </td>
                        <td className="px-6 py-5 text-center border border-slate-200">
                          <span className="text-xs font-bold text-slate-600">{t.calculationMethod}</span>
                        </td>
                        <td className="px-6 py-5 text-center border border-slate-200">
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() => toggleTypeRuleFlag(t, 'payLimitEnabled', !isPayLimitOn)}
                            title={`Click to turn Pay Limit Rule ${isPayLimitOn ? 'OFF' : 'ON'} for ${t.name}`}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-extrabold tracking-wider border transition-all cursor-pointer disabled:opacity-50 ${isPayLimitOn
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-300 shadow-2xs hover:bg-emerald-100'
                                : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'
                              }`}
                          >
                            <span
                              className={`px-1.5 py-0.5 rounded text-[9px] font-extrabold ${isPayLimitOn ? 'bg-emerald-600 text-white' : 'bg-slate-300 text-slate-700'
                                }`}
                            >
                              {isPayLimitOn ? 'ON' : 'OFF'}
                            </span>
                            <span>Pay Limit</span>
                          </button>
                        </td>
                        <td className="px-6 py-5 text-center border border-slate-200">
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() => toggleTypeRuleFlag(t, 'cfoApprovalRequired', !isCfoOn)}
                            title={`Click to turn CFO 2nd Approval ${isCfoOn ? 'OFF' : 'ON'} for ${t.name}`}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-extrabold tracking-wider border transition-all cursor-pointer disabled:opacity-50 ${isCfoOn
                                ? 'bg-indigo-50 text-indigo-700 border-indigo-300 shadow-2xs hover:bg-indigo-100'
                                : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'
                              }`}
                          >
                            <span
                              className={`px-1.5 py-0.5 rounded text-[9px] font-extrabold ${isCfoOn ? 'bg-indigo-600 text-white' : 'bg-slate-300 text-slate-700'
                                }`}
                            >
                              {isCfoOn ? 'ON' : 'OFF'}
                            </span>
                            <span>CFO Approval</span>
                          </button>
                        </td>
                        <td className="px-6 py-5 text-center border border-slate-200">
                          <span className={`px-3 py-1 rounded-full text-[10px] font-bold tracking-wider border ${t.status === 'active' ? 'bg-indigo-50 text-indigo-600 border-indigo-100' : 'bg-rose-50 text-rose-600 border-rose-100'}`}>
                            {(t.status || 'active').toUpperCase()}
                          </span>
                        </td>
                        <td className="px-6 py-5 border border-slate-200">
                          <div className="flex justify-center gap-2">
                            <button onClick={() => openTypeModal(t)} className="p-2 rounded-xl bg-indigo-50 text-indigo-600 hover:bg-indigo-600 hover:text-white transition-all shadow-sm cursor-pointer" title="Edit">
                              <Edit2 size={14} />
                            </button>
                            <button onClick={() => setDeleteConfirm({ show: true, id: t._id, kind: 'types' })} className="p-2 rounded-xl bg-slate-50 text-slate-400 hover:bg-rose-600 hover:text-white transition-all shadow-sm cursor-pointer" title="Delete">
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}

                  {activeTab === 'travelModes' && filtered.map(m => (
                    <tr key={m._id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-5 border border-slate-200">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center font-bold">{getTravelModeIcon(m.code || m.name, 20)}</div>
                          <div>
                            <p className="text-sm font-bold text-slate-900 m-0">{m.name}</p>
                            {m.description && <p className="text-[11px] font-medium text-slate-400 m-0">{m.description}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-5 text-center border border-slate-200">
                        <span className="px-2.5 py-1 rounded-lg bg-sky-50 text-sky-700 text-[10px] font-extrabold tracking-widest">{m.code}</span>
                      </td>
                      <td className="px-6 py-5 border border-slate-200">
                        {Array.isArray(m.subtypes) && m.subtypes.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {m.subtypes.map((s, sIdx) => {
                              const isKmSub = s.workflow === 'KM_RATE' || String(s.code || '').toUpperCase() === 'OWN_VEHICLE';
                              const subRateVal = isKmSub
                                ? ((Number(s.ratePerKm) > 0 ? Number(s.ratePerKm) : null) ?? resolveModeOwnVehicleRate(m))
                                : undefined;
                              return (
                                <span
                                  key={`${m._id || m.code}_${s._id || s.code}_${sIdx}`}
                                  className={`group inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold border ${s.status === 'inactive'
                                    ? 'bg-slate-100 text-slate-400 border-slate-200 line-through'
                                    : isKmSub
                                      ? 'bg-amber-50 text-amber-800 border-amber-200'
                                      : 'bg-indigo-50 text-indigo-700 border-indigo-100'
                                    }`}
                                >
                                  {getTravelModeIcon(s.code || s.name || m.code || m.name, 12)}
                                  <span>{s.name}</span>
                                  {isKmSub && (
                                    <span className="px-1 py-0.2 rounded bg-amber-200/70 text-[9px] font-extrabold text-amber-900">
                                      {subRateVal !== null && subRateVal !== undefined ? `₹${subRateVal}/km` : 'KM × Rate'}
                                    </span>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => openTmModal(m)}
                                    className="ml-0.5 text-slate-400 hover:text-indigo-600 transition-colors cursor-pointer"
                                    title={`Edit ${s.name}`}
                                  >
                                    <Edit2 size={10} />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => deleteSubtypeDirect(m, s)}
                                    className="text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                                    title={`Delete ${s.name}`}
                                  >
                                    <Trash2 size={10} />
                                  </button>
                                </span>
                              );
                            })}
                          </div>
                        ) : (
                          <span className="text-xs font-semibold text-slate-400">Direct entry (no subtype dropdown)</span>
                        )}
                      </td>
                      <td className="px-6 py-5 text-center border border-slate-200">
                        <span className="text-xs font-bold text-slate-600">{m.order || 0}</span>
                      </td>
                      <td className="px-6 py-5 text-center border border-slate-200">
                        <span className={`px-3 py-1 rounded-full text-[10px] font-bold tracking-wider border ${m.status === 'active' ? 'bg-indigo-50 text-indigo-600 border-indigo-100' : 'bg-rose-50 text-rose-600 border-rose-100'}`}>
                          {(m.status || 'active').toUpperCase()}
                        </span>
                      </td>
                      <td className="px-6 py-5 border border-slate-200">
                        <div className="flex justify-center gap-2">
                          <button onClick={() => openTmModal(m)} className="p-2 rounded-xl bg-indigo-50 text-indigo-600 hover:bg-indigo-600 hover:text-white transition-all shadow-sm cursor-pointer" title="Edit">
                            <Edit2 size={14} />
                          </button>
                          <button onClick={() => setDeleteConfirm({ show: true, id: m._id, kind: 'travelModes' })} className="p-2 rounded-xl bg-slate-50 text-slate-400 hover:bg-rose-600 hover:text-white transition-all shadow-sm cursor-pointer" title="Delete">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── Policy Modal ── */}
      {modalShell(
        policyModal.open,
        policyModal.editing ? `Edit ${policyModal.editing.name}` : 'Create Expense Policy',
        'Set approval flow, shared lodging rule, and conveyance rates',
        () => setPolicyModal({ open: false, editing: null }),
        <form onSubmit={savePolicy} className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1 text-left">
              <label className={labelCls}>Policy Name *</label>
              <input required type="text" placeholder="e.g. Travel &amp; Conveyance Policy" value={policyForm.name}
                onChange={(e) => setPolicyForm({ ...policyForm, name: e.target.value })} className={inputCls} />
            </div>
            <div className="space-y-1 text-left">
              <label className={labelCls}>Policy Code *</label>
              <input required type="text" placeholder="e.g. TCSL/ITP" value={policyForm.code}
                onChange={(e) => setPolicyForm({ ...policyForm, code: e.target.value.toUpperCase() })} className={`${inputCls} uppercase`} />
            </div>
          </div>

          <div className="space-y-1 text-left">
            <label className={labelCls}>Description</label>
            <textarea placeholder="Policy description" value={policyForm.description}
              onChange={(e) => setPolicyForm({ ...policyForm, description: e.target.value })} rows={2}
              className={`${inputCls} resize-none`} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1 text-left">
              <label className={labelCls}>Version</label>
              <input type="text" placeholder="e.g. 1.0" value={policyForm.version || ''}
                onChange={(e) => setPolicyForm({ ...policyForm, version: e.target.value })} className={inputCls} />
            </div>
            <div className="space-y-1 text-left">
              <label className={labelCls}>Effective From</label>
              <input type="date" value={policyForm.effectiveFrom || ''}
                onChange={(e) => setPolicyForm({ ...policyForm, effectiveFrom: e.target.value })} className={inputCls} />
            </div>
            <div className="space-y-1 text-left">
              <label className={labelCls}>Status</label>
              {renderSelect('pol_status', policyForm.status ? policyForm.status.toUpperCase() : 'SELECT STATUS', [
                { value: 'draft', label: 'DRAFT' },
                { value: 'active', label: 'ACTIVE (Sole active policy)' },
                { value: 'inactive', label: 'INACTIVE' },
              ], (v) => setPolicyForm({ ...policyForm, status: v }))}
            </div>
          </div>

          {/* Official Lodging & Stay Budget Rules (By Employee Count) */}
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="p-1 rounded-lg bg-indigo-100 text-indigo-700 font-extrabold text-[10px] tracking-wider">Official Policy</span>
                <p className="text-xs font-extrabold text-slate-800 m-0 tracking-wider">
                  Lodging Stay Budget Rules (1, 2, 3, 4+ Engineers)
                </p>
              </div>
              <p className="text-[10px] font-bold text-slate-500 mt-1">
                Configures lodging stay budget limits according to company policy (Point B, C, D of FAQs About Claims)
              </p>
            </div>

            {/* 1 Employee Rule */}
            <div className="p-3.5 bg-white rounded-xl border border-slate-200 space-y-1.5 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800">1 Employee Stay Rule</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  100% Individual
                </span>
              </div>
              <p className="text-[11px] text-slate-600 m-0 font-medium">
                Single engineer receives 100% of their applicable category stay allowance per day.
              </p>
              <div className="text-[10px] text-slate-500 font-semibold bg-slate-50 p-2 rounded-lg border border-slate-100">
                💡 <b>Example:</b> ₹1,200/day category allowance × 2 days = ₹2,400 stay budget.
              </div>
            </div>

            {/* 2 Employees Rule (Section B) */}
            <div className="p-3.5 bg-white rounded-xl border border-slate-200 space-y-3 shadow-2xs">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-slate-800">2 Employees Shared Stay (Section B)</span>
                  <p className="text-[10px] text-slate-500 m-0 font-medium">
                    The stay budget for both is 75% of combined allowed budget of both or higher only
                  </p>
                </div>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                  {policyForm.lodgingRules?.twoEmployees?.ruleType === 'HIGHER_ONLY' ? 'Higher Only' : `${policyForm.lodgingRules?.twoEmployees?.percent || 75}% Combined`}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPolicyForm({
                    ...policyForm,
                    lodgingRules: {
                      ...policyForm.lodgingRules,
                      twoEmployees: {
                        ...policyForm.lodgingRules?.twoEmployees,
                        ruleType: 'COMBINED_PERCENT',
                        percent: policyForm.lodgingRules?.twoEmployees?.percent || 75,
                      },
                    },
                  })}
                  className={`p-2.5 rounded-xl text-left border transition-all ${policyForm.lodgingRules?.twoEmployees?.ruleType !== 'HIGHER_ONLY'
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:border-slate-300'
                    }`}
                >
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span>Combined % Multiplier</span>
                    {policyForm.lodgingRules?.twoEmployees?.ruleType !== 'HIGHER_ONLY' && <Check size={12} />}
                  </div>
                  <p className={`text-[10px] mt-1 m-0 ${policyForm.lodgingRules?.twoEmployees?.ruleType !== 'HIGHER_ONLY' ? 'text-indigo-100' : 'text-slate-500'}`}>
                    Percentage multiplier applied to combined sum of both allowances (Default 75%).
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setPolicyForm({
                    ...policyForm,
                    lodgingRules: {
                      ...policyForm.lodgingRules,
                      twoEmployees: {
                        ...policyForm.lodgingRules?.twoEmployees,
                        ruleType: 'HIGHER_ONLY',
                      },
                    },
                  })}
                  className={`p-2.5 rounded-xl text-left border transition-all ${policyForm.lodgingRules?.twoEmployees?.ruleType === 'HIGHER_ONLY'
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:border-slate-300'
                    }`}
                >
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span>Higher Only</span>
                    {policyForm.lodgingRules?.twoEmployees?.ruleType === 'HIGHER_ONLY' && <Check size={12} />}
                  </div>
                  <p className={`text-[10px] mt-1 m-0 ${policyForm.lodgingRules?.twoEmployees?.ruleType === 'HIGHER_ONLY' ? 'text-indigo-100' : 'text-slate-500'}`}>
                    Allowance is capped strictly at the higher entitlement between the two employees.
                  </p>
                </button>
              </div>

              {/* Show Multiplier Controls only when ruleType !== 'HIGHER_ONLY' */}
              {policyForm.lodgingRules?.twoEmployees?.ruleType !== 'HIGHER_ONLY' && (
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2.5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <label className="text-[11px] font-extrabold text-slate-700">
                      Multiplier: <span className="text-indigo-600 font-bold text-sm">{policyForm.lodgingRules?.twoEmployees?.percent || 75}%</span>
                    </label>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {[50, 60, 70, 75, 80, 100].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setPolicyForm({
                            ...policyForm,
                            sharedLodgingPercent: preset,
                            lodgingRules: {
                              ...policyForm.lodgingRules,
                              twoEmployees: { ...policyForm.lodgingRules?.twoEmployees, percent: preset },
                            },
                          })}
                          className={`px-2 py-0.5 rounded-lg text-[10px] font-bold transition-all ${Number(policyForm.lodgingRules?.twoEmployees?.percent || 75) === preset
                            ? 'bg-indigo-600 text-white shadow-xs'
                            : 'bg-white text-slate-600 hover:bg-slate-200 border border-slate-200'
                            }`}
                        >
                          {preset}%
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min="1"
                      max="100"
                      step="1"
                      value={policyForm.lodgingRules?.twoEmployees?.percent || 75}
                      onChange={(e) => setPolicyForm({
                        ...policyForm,
                        sharedLodgingPercent: Number(e.target.value),
                        lodgingRules: {
                          ...policyForm.lodgingRules,
                          twoEmployees: { ...policyForm.lodgingRules?.twoEmployees, percent: Number(e.target.value) },
                        },
                      })}
                      className="flex-1 accent-indigo-600 cursor-pointer h-2 bg-white rounded-lg"
                    />
                    <div className="flex items-center gap-1 w-20">
                      <input
                        type="number"
                        min="1"
                        max="100"
                        value={policyForm.lodgingRules?.twoEmployees?.percent || 75}
                        onChange={(e) => {
                          const val = Math.max(1, Math.min(100, Number(e.target.value) || 1));
                          setPolicyForm({
                            ...policyForm,
                            sharedLodgingPercent: val,
                            lodgingRules: {
                              ...policyForm.lodgingRules,
                              twoEmployees: { ...policyForm.lodgingRules?.twoEmployees, percent: val },
                            },
                          });
                        }}
                        className="w-full bg-white border border-slate-200 px-2 py-1 rounded-lg text-xs font-extrabold text-slate-900 text-center outline-none focus:border-indigo-400"
                      />
                      <span className="text-xs font-bold text-slate-400">%</span>
                    </div>
                  </div>
                </div>
              )}

              <div className="p-2.5 bg-indigo-50/70 rounded-lg border border-indigo-100 flex items-center gap-2">
                <span className="text-[10px] font-bold text-indigo-700">
                  {policyForm.lodgingRules?.twoEmployees?.ruleType === 'HIGHER_ONLY' ? (
                    <>💡 <b>Higher Only Example:</b> If Engg 1 is ₹1,200 and Engg 2 is ₹1,500, allowance is <b>₹1,500</b> (Higher entitlement only) for both combined.</>
                  ) : (
                    <>💡 <b>Doc Example:</b> If Engg 1 is ₹1,200 and Engg 2 is ₹1,500, allowance is {policyForm.lodgingRules?.twoEmployees?.percent || 75}% × (₹1,200 + ₹1,500) = <b>₹{Math.round(2700 * ((policyForm.lodgingRules?.twoEmployees?.percent || 75) / 100))}</b> for both combined.</>
                  )}
                </span>
              </div>
            </div>

            {/* 3 Employees Rule (Section C) */}
            <div className="p-3.5 bg-white rounded-xl border border-slate-200 space-y-3 shadow-2xs">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-slate-800">3 Employees Shared Stay (Section C)</span>
                  <p className="text-[10px] text-slate-500 m-0 font-medium">
                    The stay budget for them will be combined of highest and lowest allowance amongst the 3
                  </p>
                </div>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                  {policyForm.lodgingRules?.threeEmployees?.ruleType === 'COMBINED_PERCENT' ? `${policyForm.lodgingRules.threeEmployees.percent || 75}% of 3` : 'Highest + Lowest'}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPolicyForm({
                    ...policyForm,
                    lodgingRules: {
                      ...policyForm.lodgingRules,
                      threeEmployees: { ...policyForm.lodgingRules?.threeEmployees, ruleType: 'HIGHEST_PLUS_LOWEST' },
                    },
                  })}
                  className={`p-2.5 rounded-xl text-left border transition-all ${policyForm.lodgingRules?.threeEmployees?.ruleType !== 'COMBINED_PERCENT'
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:border-slate-300'
                    }`}
                >
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span>Highest + Lowest Allowance</span>
                    {policyForm.lodgingRules?.threeEmployees?.ruleType !== 'COMBINED_PERCENT' && <Check size={12} />}
                  </div>
                  <p className={`text-[10px] mt-1 m-0 ${policyForm.lodgingRules?.threeEmployees?.ruleType !== 'COMBINED_PERCENT' ? 'text-indigo-100' : 'text-slate-500'}`}>
                    Sum of highest and lowest allowances (middle excluded). Recommended by FAQ Section C.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setPolicyForm({
                    ...policyForm,
                    lodgingRules: {
                      ...policyForm.lodgingRules,
                      threeEmployees: {
                        ...policyForm.lodgingRules?.threeEmployees,
                        ruleType: 'COMBINED_PERCENT',
                        percent: policyForm.lodgingRules?.threeEmployees?.percent || 75,
                      },
                    },
                  })}
                  className={`p-2.5 rounded-xl text-left border transition-all ${policyForm.lodgingRules?.threeEmployees?.ruleType === 'COMBINED_PERCENT'
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:border-slate-300'
                    }`}
                >
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span>Custom Combined %</span>
                    {policyForm.lodgingRules?.threeEmployees?.ruleType === 'COMBINED_PERCENT' && <Check size={12} />}
                  </div>
                  <p className={`text-[10px] mt-1 m-0 ${policyForm.lodgingRules?.threeEmployees?.ruleType === 'COMBINED_PERCENT' ? 'text-indigo-100' : 'text-slate-500'}`}>
                    Custom percentage multiplier applied to the combined sum of all 3 allowances.
                  </p>
                </button>
              </div>

              {/* 3 Employees Custom % Selector */}
              {policyForm.lodgingRules?.threeEmployees?.ruleType === 'COMBINED_PERCENT' && (
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2.5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <label className="text-[11px] font-extrabold text-slate-700">
                      3-Employee Multiplier: <span className="text-indigo-600 font-bold text-sm">{policyForm.lodgingRules?.threeEmployees?.percent || 75}%</span>
                    </label>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {[50, 60, 70, 75, 80, 100].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setPolicyForm({
                            ...policyForm,
                            lodgingRules: {
                              ...policyForm.lodgingRules,
                              threeEmployees: { ...policyForm.lodgingRules?.threeEmployees, percent: preset },
                            },
                          })}
                          className={`px-2 py-0.5 rounded-lg text-[10px] font-bold transition-all ${Number(policyForm.lodgingRules?.threeEmployees?.percent || 75) === preset
                            ? 'bg-indigo-600 text-white shadow-xs'
                            : 'bg-white text-slate-600 hover:bg-slate-200 border border-slate-200'
                            }`}
                        >
                          {preset}%
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min="1"
                      max="100"
                      step="1"
                      value={policyForm.lodgingRules?.threeEmployees?.percent || 75}
                      onChange={(e) => setPolicyForm({
                        ...policyForm,
                        lodgingRules: {
                          ...policyForm.lodgingRules,
                          threeEmployees: { ...policyForm.lodgingRules?.threeEmployees, percent: Number(e.target.value) },
                        },
                      })}
                      className="flex-1 accent-indigo-600 cursor-pointer h-2 bg-white rounded-lg"
                    />
                    <div className="flex items-center gap-1 w-20">
                      <input
                        type="number"
                        min="1"
                        max="100"
                        value={policyForm.lodgingRules?.threeEmployees?.percent || 75}
                        onChange={(e) => {
                          const val = Math.max(1, Math.min(100, Number(e.target.value) || 1));
                          setPolicyForm({
                            ...policyForm,
                            lodgingRules: {
                              ...policyForm.lodgingRules,
                              threeEmployees: { ...policyForm.lodgingRules?.threeEmployees, percent: val },
                            },
                          });
                        }}
                        className="w-full bg-white border border-slate-200 px-2 py-1 rounded-lg text-xs font-extrabold text-slate-900 text-center outline-none focus:border-indigo-400"
                      />
                      <span className="text-xs font-bold text-slate-400">%</span>
                    </div>
                  </div>
                </div>
              )}

              <div className="p-2.5 bg-indigo-50/70 rounded-lg border border-indigo-100 flex items-center gap-2">
                <span className="text-[10px] font-bold text-indigo-700">
                  {policyForm.lodgingRules?.threeEmployees?.ruleType === 'COMBINED_PERCENT' ? (
                    <>💡 <b>Custom % Example:</b> If allowances are Engg 1: ₹1,200, Engg 2: ₹1,500, Engg 3: ₹1,650 $\rightarrow$ Combined raw ₹4,350 × {policyForm.lodgingRules?.threeEmployees?.percent || 75}% = <b>₹{Math.round(4350 * ((policyForm.lodgingRules?.threeEmployees?.percent || 75) / 100))}</b> for all 3 combined.</>
                  ) : (
                    <>💡 <b>Doc Example:</b> If allowances are Engg 1: ₹1,200, Engg 2: ₹1,500, Engg 3: ₹1,650 $\rightarrow$ Highest (₹1,650) + Lowest (₹1,200) = <b>₹2,850</b> for all 3 combined.</>
                  )}
                </span>
              </div>
            </div>

            {/* 4 or More Employees Rule (Section D) */}
            <div className="p-3.5 bg-white rounded-xl border border-slate-200 space-y-3 shadow-2xs">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-slate-800">4 or More Employees Stay (Section D)</span>
                  <p className="text-[10px] text-slate-500 m-0 font-medium">
                    The engineers split the allowance in 2s (75% combined per pair) or custom %
                  </p>
                </div>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                  {policyForm.lodgingRules?.fourPlusEmployees?.ruleType === 'COMBINED_PERCENT' ? `${policyForm.lodgingRules.fourPlusEmployees.percent || 75}% of All` : 'Split in 2s (75%)'}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPolicyForm({
                    ...policyForm,
                    lodgingRules: {
                      ...policyForm.lodgingRules,
                      fourPlusEmployees: { ...policyForm.lodgingRules?.fourPlusEmployees, ruleType: 'SPLIT_IN_PAIRS_75' },
                    },
                  })}
                  className={`p-2.5 rounded-xl text-left border transition-all ${policyForm.lodgingRules?.fourPlusEmployees?.ruleType !== 'COMBINED_PERCENT'
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:border-slate-300'
                    }`}
                >
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span>Split in 2s (Pairs of 2)</span>
                    {policyForm.lodgingRules?.fourPlusEmployees?.ruleType !== 'COMBINED_PERCENT' && <Check size={12} />}
                  </div>
                  <p className={`text-[10px] mt-1 m-0 ${policyForm.lodgingRules?.fourPlusEmployees?.ruleType !== 'COMBINED_PERCENT' ? 'text-indigo-100' : 'text-slate-500'}`}>
                    Engineers split into pairs of 2; each pair gets 75% of their combined stay budget.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setPolicyForm({
                    ...policyForm,
                    lodgingRules: {
                      ...policyForm.lodgingRules,
                      fourPlusEmployees: {
                        ...policyForm.lodgingRules?.fourPlusEmployees,
                        ruleType: 'COMBINED_PERCENT',
                        percent: policyForm.lodgingRules?.fourPlusEmployees?.percent || 75,
                      },
                    },
                  })}
                  className={`p-2.5 rounded-xl text-left border transition-all ${policyForm.lodgingRules?.fourPlusEmployees?.ruleType === 'COMBINED_PERCENT'
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:border-slate-300'
                    }`}
                >
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span>Custom Combined %</span>
                    {policyForm.lodgingRules?.fourPlusEmployees?.ruleType === 'COMBINED_PERCENT' && <Check size={12} />}
                  </div>
                  <p className={`text-[10px] mt-1 m-0 ${policyForm.lodgingRules?.fourPlusEmployees?.ruleType === 'COMBINED_PERCENT' ? 'text-indigo-100' : 'text-slate-500'}`}>
                    Custom percentage multiplier applied to the combined sum of all employees.
                  </p>
                </button>
              </div>

              {/* 4+ Employees Custom % Selector */}
              {policyForm.lodgingRules?.fourPlusEmployees?.ruleType === 'COMBINED_PERCENT' && (
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2.5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <label className="text-[11px] font-extrabold text-slate-700">
                      4+ Employee Multiplier: <span className="text-indigo-600 font-bold text-sm">{policyForm.lodgingRules?.fourPlusEmployees?.percent || 75}%</span>
                    </label>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {[50, 60, 70, 75, 80, 100].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setPolicyForm({
                            ...policyForm,
                            lodgingRules: {
                              ...policyForm.lodgingRules,
                              fourPlusEmployees: { ...policyForm.lodgingRules?.fourPlusEmployees, percent: preset },
                            },
                          })}
                          className={`px-2 py-0.5 rounded-lg text-[10px] font-bold transition-all ${Number(policyForm.lodgingRules?.fourPlusEmployees?.percent || 75) === preset
                            ? 'bg-indigo-600 text-white shadow-xs'
                            : 'bg-white text-slate-600 hover:bg-slate-200 border border-slate-200'
                            }`}
                        >
                          {preset}%
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min="1"
                      max="100"
                      step="1"
                      value={policyForm.lodgingRules?.fourPlusEmployees?.percent || 75}
                      onChange={(e) => setPolicyForm({
                        ...policyForm,
                        lodgingRules: {
                          ...policyForm.lodgingRules,
                          fourPlusEmployees: { ...policyForm.lodgingRules?.fourPlusEmployees, percent: Number(e.target.value) },
                        },
                      })}
                      className="flex-1 accent-indigo-600 cursor-pointer h-2 bg-white rounded-lg"
                    />
                    <div className="flex items-center gap-1 w-20">
                      <input
                        type="number"
                        min="1"
                        max="100"
                        value={policyForm.lodgingRules?.fourPlusEmployees?.percent || 75}
                        onChange={(e) => {
                          const val = Math.max(1, Math.min(100, Number(e.target.value) || 1));
                          setPolicyForm({
                            ...policyForm,
                            lodgingRules: {
                              ...policyForm.lodgingRules,
                              fourPlusEmployees: { ...policyForm.lodgingRules?.fourPlusEmployees, percent: val },
                            },
                          });
                        }}
                        className="w-full bg-white border border-slate-200 px-2 py-1 rounded-lg text-xs font-extrabold text-slate-900 text-center outline-none focus:border-indigo-400"
                      />
                      <span className="text-xs font-bold text-slate-400">%</span>
                    </div>
                  </div>
                </div>
              )}

              <div className="p-2.5 bg-indigo-50/70 rounded-lg border border-indigo-100 flex items-center gap-2">
                <span className="text-[10px] font-bold text-indigo-700">
                  {policyForm.lodgingRules?.fourPlusEmployees?.ruleType === 'COMBINED_PERCENT' ? (
                    <>💡 <b>Custom % Example:</b> 4 engineers (₹1,200, ₹1,500, ₹1,650, ₹1,800) $\rightarrow$ Combined raw ₹6,150 × {policyForm.lodgingRules?.fourPlusEmployees?.percent || 75}% = <b>₹{Math.round(6150 * ((policyForm.lodgingRules?.fourPlusEmployees?.percent || 75) / 100))}</b> for all 4 combined.</>
                  ) : (
                    <>💡 <b>Doc Example:</b> 4 engineers (₹1,200, ₹1,500, ₹1,650, ₹1,800) $\rightarrow$ 75% of combined ₹6,150 = <b>₹4,612.50</b> for all 4 combined.</>
                  )}
                </span>
              </div>
            </div>
          </div>

          {/* Lodging Policy — Stay with Relative */}
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1 text-left">
                <p className="text-xs font-extrabold text-slate-800 m-0 tracking-wider">Lodging Policy — Stay at Relative</p>
                <label htmlFor="relativeStayPercent" className="block text-[11px] font-bold text-slate-700">
                  Relative Stay Allowance Percentage
                </label>
                <p className="text-[10px] font-medium text-slate-500 m-0">
                  Percentage of the normal lodging entitlement payable when an employee stays with a relative.
                </p>
              </div>
              <div className="relative shrink-0">
                <input
                  id="relativeStayPercent"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  required
                  value={policyForm.relativeStayPercent ?? 50}
                  onChange={(e) => setPolicyForm({ ...policyForm, relativeStayPercent: e.target.value })}
                  className="w-28 bg-white border border-slate-200 pl-3.5 pr-8 py-2.5 rounded-xl text-xs font-extrabold text-slate-800 outline-none focus:border-indigo-400 transition-all shadow-sm"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">%</span>
              </div>
            </div>
          </div>

          {/* Conveyance rates */}
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
            <p className="text-xs font-extrabold text-slate-800 m-0 tracking-wider">Default Own-Vehicle Conveyance Rates (₹/km)</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="space-y-1">
                <label className={labelCls}>2-Wheeler (₹/km)</label>
                <input type="number" step="0.1" placeholder="e.g. 3.5" value={policyForm.conveyanceRates?.twoWheeler ?? ''}
                  onChange={(e) => setPolicyForm({ ...policyForm, conveyanceRates: { ...policyForm.conveyanceRates, twoWheeler: e.target.value } })} className={inputCls} />
              </div>
              <div className="space-y-1">
                <label className={labelCls}>Car (₹/km)</label>
                <input type="number" step="0.1" placeholder="e.g. 5.0" value={policyForm.conveyanceRates?.car ?? ''}
                  onChange={(e) => setPolicyForm({ ...policyForm, conveyanceRates: { ...policyForm.conveyanceRates, car: e.target.value } })} className={inputCls} />
              </div>
              <div className="space-y-1">
                <label className={labelCls}>E-Bike (₹/km)</label>
                <input type="number" step="0.1" placeholder="e.g. 1.0" value={policyForm.conveyanceRates?.eBike ?? ''}
                  onChange={(e) => setPolicyForm({ ...policyForm, conveyanceRates: { ...policyForm.conveyanceRates, eBike: e.target.value } })} className={inputCls} />
              </div>
              <div className="space-y-1">
                <label className={labelCls}>E-Car (₹/km)</label>
                <input type="number" step="0.1" placeholder="e.g. 1.75" value={policyForm.conveyanceRates?.eCar ?? ''}
                  onChange={(e) => setPolicyForm({ ...policyForm, conveyanceRates: { ...policyForm.conveyanceRates, eCar: e.target.value } })} className={inputCls} />
              </div>
            </div>
          </div>

          <div className="pt-2 flex gap-3">
            <button type="button" onClick={() => setPolicyModal({ open: false, editing: null })} className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-2xl font-bold text-xs hover:bg-slate-200 transition-all">Cancel</button>
            <button type="submit" disabled={saving} className="flex-1 py-3 bg-indigo-600 text-white rounded-2xl font-bold text-xs hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-100">
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              {policyModal.editing ? 'Save Changes' : 'Create Policy'}
            </button>
          </div>
        </form>,
        'max-w-3xl'
      )}

      {/* ── Approval Limit Rule Modal (Role / Level Payment Rules for Other Claims) ── */}
      {modalShell(
        limitRuleModal.open,
        limitRuleModal.editingIndex !== null ? 'Edit Approval Limit Rule' : 'Add Approval Limit Rule',
        'Configure payment limit (₹) till which a role/level in this company can approve Other Expense Claims before escalating up the department hierarchy',
        () => setLimitRuleModal({ open: false, editingIndex: null }),
        <form onSubmit={saveLimitRule} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1 text-left">
              <label className={labelCls}>Select Role / Level Preset (This Company)</label>
              <select
                value={approvalRoleOptions.some(o => o.roleName === limitRuleForm.roleName) ? limitRuleForm.roleName : '__CUSTOM__'}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === '__CUSTOM__') {
                    setLimitRuleForm({ ...limitRuleForm, roleName: '', levelId: '', levelNumber: '' });
                    return;
                  }
                  const opt = approvalRoleOptions.find(o => o.roleName === val);
                  setLimitRuleForm({
                    ...limitRuleForm,
                    roleName: val,
                    levelId: opt?.levelId || '',
                    levelNumber: opt?.levelNumber !== undefined && opt?.levelNumber !== null ? String(opt.levelNumber) : '',
                  });
                }}
                className={inputCls}
              >
                {approvalRoleOptions.map(opt => (
                  <option key={opt.roleName} value={opt.roleName}>{opt.label}</option>
                ))}
                <option value="__CUSTOM__">Custom Role / Designation...</option>
              </select>
            </div>

            <div className="space-y-1 text-left">
              <label className={labelCls}>Role / Designation Name *</label>
              <input
                required
                type="text"
                placeholder={approvalRoleOptions[0]?.roleName ? `e.g. ${approvalRoleOptions[0].roleName}` : 'Enter company role or designation name'}
                value={limitRuleForm.roleName}
                onChange={(e) => setLimitRuleForm({ ...limitRuleForm, roleName: e.target.value })}
                className={inputCls}
              />
            </div>

            <div className="space-y-1 text-left">
              <label className={labelCls}>Max Payment Limit (₹) Till This Role *</label>
              <input
                required
                type="number"
                min="1"
                step="0.01"
                placeholder="e.g. 500 or 2000"
                value={limitRuleForm.maxAmount}
                onChange={(e) => setLimitRuleForm({ ...limitRuleForm, maxAmount: e.target.value })}
                className={inputCls}
              />
              <p className="text-[10px] text-slate-400 font-medium m-0">
                Claims above ₹{limitRuleForm.maxAmount || '0'} will automatically escalate to a higher role in the employee&apos;s hierarchy.
              </p>
            </div>

            <div className="space-y-1 text-left">
              <label className={labelCls}>Hierarchy Level Number (Optional)</label>
              <input
                type="number"
                min="1"
                max="20"
                placeholder="e.g. 4, 3, 2"
                value={limitRuleForm.levelNumber}
                onChange={(e) => setLimitRuleForm({ ...limitRuleForm, levelNumber: e.target.value })}
                className={inputCls}
              />
              <p className="text-[10px] text-slate-400 font-medium m-0">
                Lower number = higher authority in your company&apos;s level hierarchy.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2 space-y-1 text-left">
              <label className={labelCls}>Description / Note</label>
              <input
                type="text"
                placeholder={limitRuleForm.roleName ? `e.g. Up to ₹${limitRuleForm.maxAmount || '500'} approved till ${limitRuleForm.roleName}` : 'Optional routing description'}
                value={limitRuleForm.description}
                onChange={(e) => setLimitRuleForm({ ...limitRuleForm, description: e.target.value })}
                className={inputCls}
              />
            </div>
            <div className="space-y-1 text-left">
              <label className={labelCls}>Status</label>
              <select
                value={limitRuleForm.status}
                onChange={(e) => setLimitRuleForm({ ...limitRuleForm, status: e.target.value })}
                className={inputCls}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>

          <div className="pt-2 flex gap-3">
            <button
              type="button"
              onClick={() => setLimitRuleModal({ open: false, editingIndex: null })}
              className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-2xl font-bold text-xs hover:bg-slate-200 transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-3 bg-indigo-600 text-white rounded-2xl font-bold text-xs hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-100"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              {limitRuleModal.editingIndex !== null ? 'Update Rule' : 'Add Rule'}
            </button>
          </div>
        </form>,
        'max-w-xl'
      )}

      {/* ── Type Modal ── */}
      {modalShell(
        typeModal.open,
        typeModal.editing ? `Edit ${typeModal.editing.name}` : 'Create Expense Type',
        'Define a new expense category that employees can claim against',
        () => setTypeModal({ open: false, editing: null }),
        <form onSubmit={saveType} className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1 text-left">
              <label className={labelCls}>Type Name *</label>
              <input required type="text" placeholder="e.g. Lodging" value={typeForm.name}
                onChange={(e) => setTypeForm({ ...typeForm, name: e.target.value })} className={inputCls} />
            </div>
            <div className="space-y-1 text-left">
              <label className={labelCls}>Type Code *</label>
              <input required type="text" placeholder="e.g. LODGING" value={typeForm.code}
                onChange={(e) => setTypeForm({ ...typeForm, code: e.target.value.toUpperCase() })} className={`${inputCls} uppercase`} />
            </div>
          </div>
          <div className="space-y-1 text-left">
            <label className={labelCls}>Description</label>
            <textarea placeholder="Short description" value={typeForm.description}
              onChange={(e) => setTypeForm({ ...typeForm, description: e.target.value })} rows={2} className={`${inputCls} resize-none`} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1 text-left">
              <label className={labelCls}>Category</label>
              {renderSelect('type_cat', typeForm.category, EXPENSE_CATEGORIES.map(v => ({ value: v, label: v })), (v) => setTypeForm({ ...typeForm, category: v }))}
            </div>
            <div className="space-y-1 text-left">
              <label className={labelCls}>Calculation Method</label>
              {renderSelect('type_calc', typeForm.calculationMethod, CALC_METHODS.map(v => ({ value: v, label: v })), (v) => setTypeForm({ ...typeForm, calculationMethod: v }))}
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1 text-left">
              <label className={labelCls}>Status</label>
              {renderSelect('type_status', typeForm.status, ['active', 'inactive'].map(v => ({ value: v, label: v.toUpperCase() })), (v) => setTypeForm({ ...typeForm, status: v }))}
            </div>
            <div className="space-y-1 text-left">
              <label className={labelCls}>Display Order</label>
              <input type="number" min="0" placeholder="0" value={typeForm.order ?? 0}
                onChange={(e) => setTypeForm({ ...typeForm, order: Number(e.target.value) || 0 })} className={inputCls} />
            </div>
          </div>
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3 text-left">
            <p className="text-xs font-extrabold text-slate-800 m-0 tracking-wider">
              Claim Routing &amp; Approval Rules for This Expense Type
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setTypeForm({ ...typeForm, payLimitEnabled: !typeForm.payLimitEnabled })}
                className={`p-3 rounded-xl border text-left flex items-center justify-between gap-2 transition-all cursor-pointer ${typeForm.payLimitEnabled
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                    : 'bg-white border-slate-200 text-slate-600'
                  }`}
              >
                <div>
                  <p className="text-xs font-extrabold m-0">Pay Limit Rule</p>
                  <p className="text-[10px] font-medium opacity-80 m-0 mt-0.5">
                    Apply Payment Limit threshold to this claim type
                  </p>
                </div>
                <span className={`px-2 py-1 rounded-lg text-[10px] font-extrabold ${typeForm.payLimitEnabled ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-500'
                  }`}>
                  {typeForm.payLimitEnabled ? 'ON' : 'OFF'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setTypeForm({ ...typeForm, cfoApprovalRequired: !typeForm.cfoApprovalRequired })}
                className={`p-3 rounded-xl border text-left flex items-center justify-between gap-2 transition-all cursor-pointer ${typeForm.cfoApprovalRequired
                    ? 'bg-indigo-50 border-indigo-300 text-indigo-900'
                    : 'bg-white border-slate-200 text-slate-600'
                  }`}
              >
                <div>
                  <p className="text-xs font-extrabold m-0">CFO 2nd Approval</p>
                  <p className="text-[10px] font-medium opacity-80 m-0 mt-0.5">
                    Require CFO / Finance Head approval after Step 1
                  </p>
                </div>
                <span className={`px-2 py-1 rounded-lg text-[10px] font-extrabold ${typeForm.cfoApprovalRequired ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'
                  }`}>
                  {typeForm.cfoApprovalRequired ? 'ON' : 'OFF'}
                </span>
              </button>
            </div>
          </div>
          <div className="pt-2 flex gap-3">
            <button type="button" onClick={() => setTypeModal({ open: false, editing: null })} className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-2xl font-bold text-xs hover:bg-slate-200 transition-all">Cancel</button>
            <button type="submit" disabled={saving} className="flex-1 py-3 bg-indigo-600 text-white rounded-2xl font-bold text-xs hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-100">
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              {typeModal.editing ? 'Save Changes' : 'Create Type'}
            </button>
          </div>
        </form>,
        'max-w-2xl'
      )}

      {/* ── City Modal ── */}
      {modalShell(
        cityModal.open,
        cityModal.editing ? `Edit ${cityModal.editing.city}` : 'Add City Classification',
        'Classify a city into A+, A, B or C to drive entitlement amounts',
        () => setCityModal({ open: false, editing: null }),
        <form onSubmit={saveCity} className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1 text-left">
              <label className={labelCls}>City Name *</label>
              <input required type="text" placeholder="e.g. Mumbai, Bangalore Urban, New Delhi NCR" value={cityForm.city}
                onChange={(e) => setCityForm({ ...cityForm, city: e.target.value.toUpperCase() })} className={`${inputCls} uppercase`} />
            </div>
            <div className="space-y-1 text-left">
              <label className={labelCls}>City Class *</label>
              {renderSelect('city_class', cityForm.cityClass, CITY_CLASSES.map(v => ({ value: v, label: v })), (v) => setCityForm({ ...cityForm, cityClass: v }))}
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1 text-left">
              <label className={labelCls}>State</label>
              <input type="text" placeholder="e.g. Maharashtra" value={cityForm.state}
                onChange={(e) => setCityForm({ ...cityForm, state: e.target.value })} className={inputCls} />
            </div>
            <div className="space-y-1 text-left">
              <label className={labelCls}>Aliases (comma separated)</label>
              <input type="text" placeholder="e.g. Bombay, MUM" value={cityForm.aliases}
                onChange={(e) => setCityForm({ ...cityForm, aliases: e.target.value })} className={inputCls} />
            </div>
          </div>
          <div className="space-y-1 text-left">
            <label className={labelCls}>Status</label>
            {renderSelect('city_status', cityForm.status, ['active', 'inactive'].map(v => ({ value: v, label: v.toUpperCase() })), (v) => setCityForm({ ...cityForm, status: v }))}
          </div>
          <div className="pt-2 flex gap-3">
            <button type="button" onClick={() => setCityModal({ open: false, editing: null })} className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-2xl font-bold text-xs hover:bg-slate-200 transition-all">Cancel</button>
            <button type="submit" disabled={saving} className="flex-1 py-3 bg-indigo-600 text-white rounded-2xl font-bold text-xs hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-100">
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              {cityModal.editing ? 'Save Changes' : 'Add City'}
            </button>
          </div>
        </form>,
        'max-w-2xl'
      )}

      {/* ── Travel Mode Modal ── */}
      {modalShell(
        tmModal.open,
        tmModal.editing ? `Edit ${tmModal.editing.name}` : 'Add Travel Mode / Vehicle Type',
        'Configure travel modes, dynamic subtypes/classes, and Own-Vehicle KM rate workflows',
        () => setTmModal({ open: false, editing: null }),
        <form onSubmit={saveTravelMode} className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1 text-left">
              <label className={labelCls}>Mode Name *</label>
              <input required type="text" placeholder="e.g. Train, 2-Wheeler, Flight" value={tmForm.name}
                onChange={(e) => setTmForm({ ...tmForm, name: e.target.value })} className={inputCls} />
            </div>
            <div className="space-y-1 text-left">
              <label className={labelCls}>Code *</label>
              <input required type="text" placeholder="e.g. TRAIN, TWO_WHEELER_PETROL" value={tmForm.code}
                onChange={(e) => setTmForm({ ...tmForm, code: e.target.value.toUpperCase() })} className={`${inputCls} uppercase`} />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1 text-left">
              <label className={labelCls}>Description</label>
              <input type="text" placeholder="Short description" value={tmForm.description}
                onChange={(e) => setTmForm({ ...tmForm, description: e.target.value })} className={inputCls} />
            </div>
            <div className="space-y-1 text-left">
              <label className={labelCls}>Own-Vehicle Rate (₹/km)</label>
              <div className="relative">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="e.g. 3.5, 5, 8 (Company Price)"
                  value={tmForm.ratePerKm}
                  onChange={(e) => {
                    const val = e.target.value;
                    setTmForm(f => ({
                      ...f,
                      ratePerKm: val,
                      subtypes: (f.subtypes || []).map(s =>
                        s.workflow === 'KM_RATE' ? { ...s, ratePerKm: val } : s
                      ),
                    }));
                  }}
                  className={inputCls}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1 text-left">
                <label className={labelCls}>Order</label>
                <input type="number" min="0" value={tmForm.order}
                  onChange={(e) => setTmForm({ ...tmForm, order: e.target.value })} className={inputCls} />
              </div>
              <div className="space-y-1 text-left">
                <label className={labelCls}>Status</label>
                {renderSelect('tm_status', tmForm.status, ['active', 'inactive'].map(v => ({ value: v, label: v.toUpperCase() })), (v) => setTmForm({ ...tmForm, status: v }))}
              </div>
            </div>
          </div>

          {/* Subtypes / Vehicle Types Editor */}
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-extrabold text-slate-800 m-0">Subtypes / Travel Classes / Vehicle Ownership Options</p>
                <p className="text-[10px] font-semibold text-slate-500 m-0">
                  Leave empty for direct modes (e.g. Taxi/Auto). Add subtypes for Bus, Flight, Train classes, or Company vs Own Vehicle.
                </p>
              </div>
              <button
                type="button"
                onClick={addSubtype}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 transition-all"
              >
                <Plus size={13} /> Add Subtype
              </button>
            </div>

            {tmForm.subtypes.length === 0 ? (
              <div className="p-4 text-center bg-white rounded-xl border border-dashed border-slate-200 text-xs font-semibold text-slate-400">
                No subtypes configured — employees will enter travel details directly without a subtype dropdown.
              </div>
            ) : (
              <div className="space-y-2">
                {tmForm.subtypes.map((sub, idx) => (
                  <div key={sub._id || idx} className="p-3 bg-white rounded-xl border border-slate-200 grid grid-cols-1 md:grid-cols-12 gap-2 items-center">
                    <div className={sub.workflow === 'KM_RATE' ? 'md:col-span-3' : 'md:col-span-4'}>
                      <input
                        type="text"
                        placeholder="Subtype name (e.g. Own Vehicle)"
                        value={sub.name}
                        onChange={(e) => updateSubtype(idx, { name: e.target.value, code: sub._id ? sub.code : toSubtypeCode(e.target.value) })}
                        className="w-full bg-slate-50 border border-slate-200 px-3 py-2 rounded-xl text-xs font-bold text-slate-800 outline-none focus:border-indigo-400"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <input
                        type="text"
                        placeholder="CODE"
                        value={sub.code}
                        onChange={(e) => updateSubtype(idx, { code: toSubtypeCode(e.target.value) })}
                        className="w-full bg-slate-50 border border-slate-200 px-3 py-2 rounded-xl text-[11px] font-mono font-bold text-slate-700 outline-none focus:border-indigo-400"
                      />
                    </div>
                    <div className={sub.workflow === 'KM_RATE' ? 'md:col-span-3' : 'md:col-span-4'}>
                      <select
                        value={sub.workflow}
                        onChange={(e) => updateSubtype(idx, {
                          workflow: e.target.value,
                          photosRequired: e.target.value === 'KM_RATE',
                          ratePerKm: e.target.value === 'KM_RATE' ? (sub.ratePerKm || tmForm.ratePerKm || '') : '',
                          conveyanceRateKey: e.target.value === 'KM_RATE' ? (sub.conveyanceRateKey || tmForm.conveyanceRateKey || '') : '',
                        })}
                        className="w-full bg-slate-50 border border-slate-200 px-2.5 py-2 rounded-xl text-xs font-bold text-slate-800 outline-none"
                      >
                        {WORKFLOW_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </div>
                    {sub.workflow === 'KM_RATE' && (
                      <div className="md:col-span-2">
                        <div className="flex items-center bg-amber-50 border border-amber-200 px-2 py-1.5 rounded-xl">
                          <span className="text-[11px] font-extrabold text-amber-800 mr-1">₹</span>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="Rate/km"
                            value={sub.ratePerKm}
                            onChange={(e) => updateSubtype(idx, { ratePerKm: e.target.value })}
                            className="w-full bg-transparent text-[11px] font-extrabold text-amber-950 outline-none"
                            title="Company-decided Own-Vehicle rate per km (₹/km)"
                          />
                          <span className="text-[9px] font-bold text-amber-700 ml-0.5">/km</span>
                        </div>
                      </div>
                    )}
                    <div className="md:col-span-2 flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => updateSubtype(idx, { status: sub.status === 'inactive' ? 'active' : 'inactive' })}
                        className={`px-2 py-1 rounded-lg text-[10px] font-extrabold border ${sub.status === 'inactive' ? 'bg-rose-50 text-rose-600 border-rose-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}
                        title="Toggle active/inactive"
                      >
                        {sub.status === 'inactive' ? 'OFF' : 'ON'}
                      </button>
                      <button
                        type="button"
                        onClick={() => moveSubtype(idx, -1)}
                        disabled={idx === 0}
                        className="px-1.5 py-1 text-xs font-bold text-slate-400 hover:text-slate-700 disabled:opacity-30"
                        title="Move up"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => moveSubtype(idx, 1)}
                        disabled={idx === tmForm.subtypes.length - 1}
                        className="px-1.5 py-1 text-xs font-bold text-slate-400 hover:text-slate-700 disabled:opacity-30"
                        title="Move down"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        onClick={() => removeSubtype(idx)}
                        className="p-1 text-slate-400 hover:text-rose-600"
                        title="Remove subtype"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="pt-2 flex gap-3">
            <button type="button" onClick={() => setTmModal({ open: false, editing: null })} className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-2xl font-bold text-xs hover:bg-slate-200 transition-all">Cancel</button>
            <button type="submit" disabled={saving} className="flex-1 py-3 bg-indigo-600 text-white rounded-2xl font-bold text-xs hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-100">
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              {tmModal.editing ? 'Save Changes' : 'Add Travel Mode'}
            </button>
          </div>
        </form>,
        'max-w-3xl'
      )}

      {/* ── Travel Entitlement Modal (Level Entitlements → TRAVEL) ── */}
      {modalShell(
        travelEntModal.open,
        travelEntModal.editing ? 'Edit Travel Mode Entitlement' : 'Configure Travel Mode Entitlement',
        'Assign permitted travel modes, subtypes/classes, and optional monetary caps to an employee level/grade',
        () => setTravelEntModal({ open: false, editing: null }),
        (() => {
          const activeModes = travelModes.filter(m => m.status !== 'inactive');
          const scopedSaved = Number(travelEntForm.levelNumber) > 0
            ? buildTravelSelectionForScope(travelEntForm.levelNumber, travelEntForm.cityClass, travelEntForm.gradeCode)
            : { selectedModes: {}, selected: {} };

          const toggleModeCheckbox = (mode, checked) => {
            const mKey = String(mode._id);
            const modeSubs = (mode.subtypes || []).filter(s => s.status !== 'inactive');
            setTravelEntForm(f => {
              const savedMode = scopedSaved.selectedModes?.[mKey];
              const prevMode = f.selectedModes?.[mKey] || { checked: false, maxAmount: savedMode?.maxAmount ?? '' };
              const nextModes = { ...(f.selectedModes || {}), [mKey]: { ...prevMode, checked } };
              const nextSelected = { ...(f.selected || {}) };
              if (modeSubs.length > 0) {
                if (checked) {
                  const anySubChecked = modeSubs.some(s => nextSelected[String(s._id)]?.checked);
                  if (!anySubChecked) {
                    const hasSavedSubs = modeSubs.some(s => scopedSaved.selected?.[String(s._id)]?.checked);
                    modeSubs.forEach(s => {
                      const sKey = String(s._id);
                      const savedSub = scopedSaved.selected?.[sKey];
                      const prevSub = nextSelected[sKey] || { checked: false, maxAmount: savedSub?.maxAmount ?? '' };
                      nextSelected[sKey] = {
                        ...prevSub,
                        checked: hasSavedSubs ? Boolean(savedSub?.checked) : true,
                      };
                    });
                  }
                } else {
                  modeSubs.forEach(s => {
                    const sKey = String(s._id);
                    const prevSub = nextSelected[sKey] || { checked: false, maxAmount: '' };
                    nextSelected[sKey] = { ...prevSub, checked: false };
                  });
                }
              }
              return {
                ...f,
                travelModeId: !checked && String(f.travelModeId) === mKey ? '' : f.travelModeId,
                selectedModes: nextModes,
                selected: nextSelected,
              };
            });
          };

          const handleSelectAllModes = (checkAll) => {
            setTravelEntForm(f => {
              const nextModes = { ...(f.selectedModes || {}) };
              const nextSelected = { ...(f.selected || {}) };
              activeModes.forEach(m => {
                const mKey = String(m._id);
                const prevMode = nextModes[mKey] || { checked: false, maxAmount: '' };
                nextModes[mKey] = { ...prevMode, checked: checkAll };
                const modeSubs = (m.subtypes || []).filter(s => s.status !== 'inactive');
                modeSubs.forEach(s => {
                  const sKey = String(s._id);
                  const prevSub = nextSelected[sKey] || { checked: false, maxAmount: '' };
                  nextSelected[sKey] = { ...prevSub, checked: checkAll };
                });
              });
              return { ...f, travelModeId: checkAll ? f.travelModeId : '', selectedModes: nextModes, selected: nextSelected };
            });
          };

          const selectedModeCount = activeModes.filter(m => {
            const mKey = String(m._id);
            if (travelEntForm.selectedModes?.[mKey]?.checked) return true;
            if (!travelEntForm.selectedModes?.[mKey] && String(travelEntForm.travelModeId) === mKey) return true;
            const subs = (m.subtypes || []).filter(s => s.status !== 'inactive');
            return subs.some(s => travelEntForm.selected?.[String(s._id)]?.checked);
          }).length;

          return (
            <form onSubmit={saveTravelEntitlement} className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1 text-left">
                  <label className={labelCls}>Employee Level *</label>
                  <select
                    value={travelEntForm.levelNumber}
                    onChange={(e) => setTravelEntForm((f) => ({ ...f, levelNumber: e.target.value }))}
                    className={inputCls}
                  >
                    <option value="0">All Levels (Apply to each level)</option>
                    {distinctLevelNumbers.filter(n => n > 0).map(ln => {
                      const match = levels.find(l => Number(l.levelNumber) === Number(ln));
                      return <option key={ln} value={String(ln)}>Level {ln}{match?.name ? ` · ${match.name}` : ''}</option>;
                    })}
                  </select>
                </div>
                <div className="space-y-1 text-left">
                  <label className={labelCls}>Grade (Optional)</label>
                  {renderSelect(
                    'tent_grade',
                    travelEntForm.gradeCode ? `Grade ${travelEntForm.gradeCode.toUpperCase()}` : 'All Grades',
                    [{ value: '', label: 'All Grades' }, ...grades.map(g => ({ value: (g.code || g.name || '').toLowerCase(), label: `Grade ${(g.code || g.name || '').toUpperCase()}` }))],
                    (v) => setTravelEntForm((f) => ({ ...f, gradeCode: v }))
                  )}
                </div>
                <div className="space-y-1 text-left">
                  <label className={labelCls}>City Class *</label>
                  {renderSelect(
                    'tent_city',
                    travelEntForm.cityClass === 'ALL' ? 'ALL Cities' : `Class ${travelEntForm.cityClass}`,
                    TRAVEL_CITY_CLASSES.map(v => ({ value: v, label: v === 'ALL' ? 'ALL Cities' : `Class ${v}` })),
                    (v) => setTravelEntForm((f) => ({ ...f, cityClass: v }))
                  )}
                </div>
              </div>

              <div className="space-y-2 text-left">
                <div className="flex items-center justify-between">
                  <div>
                    <label className={labelCls}>Travel Modes &amp; Options * ({selectedModeCount} selected)</label>
                    <p className="text-[10px] font-semibold text-slate-500 m-0">
                      Select one or multiple travel modes and permitted subtypes with checkboxes. Leave Max Cap blank for full Actuals.
                    </p>
                  </div>
                  {!travelEntModal.editing && activeModes.length > 0 && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleSelectAllModes(true)}
                        className="px-2.5 py-1 rounded-lg bg-sky-50 text-sky-700 border border-sky-200 text-[10px] font-bold hover:bg-sky-100 transition-all"
                      >
                        Select All
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSelectAllModes(false)}
                        className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600 border border-slate-200 text-[10px] font-bold hover:bg-slate-200 transition-all"
                      >
                        Clear All
                      </button>
                    </div>
                  )}
                </div>

                <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
                  {activeModes.map((mode) => {
                    const mKey = String(mode._id);
                    const modeSubtypes = (mode.subtypes || []).filter(s => s.status !== 'inactive');
                    const checkedSubCount = modeSubtypes.filter(s => travelEntForm.selected?.[String(s._id)]?.checked).length;
                    const modeState = travelEntForm.selectedModes?.[mKey] || {
                      checked: String(travelEntForm.travelModeId) === mKey || checkedSubCount > 0,
                      maxAmount: String(travelEntForm.travelModeId) === mKey ? (travelEntForm.maxAmount || '') : '',
                    };
                    const isModeChecked = Boolean(modeState.checked || checkedSubCount > 0);

                    return (
                      <div
                        key={mKey}
                        className={`p-3.5 rounded-2xl border transition-all space-y-2.5 ${isModeChecked
                            ? 'bg-sky-50/60 border-sky-300 shadow-2xs'
                            : 'bg-slate-50/70 border-slate-200 hover:border-slate-300'
                          }`}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                          <label className="flex items-center gap-2.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={isModeChecked}
                              onChange={(e) => toggleModeCheckbox(mode, e.target.checked)}
                              className="w-4 h-4 accent-sky-600 rounded"
                            />
                            <span className="w-6 h-6 rounded-lg bg-sky-100 text-sky-700 inline-flex items-center justify-center shrink-0">
                              {getTravelModeIcon(mode.code || mode.name, 14)}
                            </span>
                            <span className="text-xs font-extrabold text-slate-900">{mode.name}</span>
                            <span className="text-[10px] font-mono font-bold text-slate-400">({mode.code})</span>
                            {!travelEntModal.editing && scopedSaved.selectedModes?.[mKey]?.checked && (
                              <span className="px-2 py-0.5 rounded-lg text-[9px] font-extrabold bg-sky-100 text-sky-700 border border-sky-200">
                                Already added
                              </span>
                            )}
                            {modeSubtypes.length > 0 && (
                              <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border ${checkedSubCount > 0
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : 'bg-slate-100 text-slate-500 border-slate-200'
                                }`}>
                                {checkedSubCount}/{modeSubtypes.length} subtype{modeSubtypes.length > 1 ? 's' : ''}
                              </span>
                            )}
                          </label>

                          {modeSubtypes.length === 0 && isModeChecked && (
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-bold text-slate-500">Max Cap (₹):</span>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                placeholder="Actuals (no cap)"
                                value={modeState.maxAmount ?? ''}
                                onChange={(e) => setTravelEntForm(f => ({
                                  ...f,
                                  maxAmount: String(f.travelModeId) === mKey ? e.target.value : f.maxAmount,
                                  selectedModes: {
                                    ...(f.selectedModes || {}),
                                    [mKey]: { ...modeState, checked: true, maxAmount: e.target.value },
                                  },
                                }))}
                                className="w-36 bg-white border border-slate-200 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-800 outline-none focus:border-sky-400"
                              />
                            </div>
                          )}
                        </div>

                        {modeSubtypes.length > 0 && isModeChecked && (
                          <div className="pl-6 space-y-1.5 pt-1 border-t border-sky-200/60">
                            {modeSubtypes.map((sub, sIdx) => {
                              const key = String(sub._id || `${sub.code}_${sIdx}`);
                              const st = travelEntForm.selected?.[key] || { checked: false, maxAmount: '' };
                              return (
                                <div key={`${mKey}_${key}_${sIdx}`} className="p-2.5 bg-white rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                  <label className="flex items-center gap-2.5 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={!!st.checked}
                                      onChange={(e) => {
                                        const subChecked = e.target.checked;
                                        setTravelEntForm(f => {
                                          const nextSelected = { ...(f.selected || {}), [key]: { ...st, checked: subChecked } };
                                          const anyStillChecked = modeSubtypes.some(s => nextSelected[String(s._id)]?.checked);
                                          const nextModeChecked = subChecked ? true : anyStillChecked;
                                          return {
                                            ...f,
                                            travelModeId: !nextModeChecked && String(f.travelModeId) === mKey ? '' : f.travelModeId,
                                            selected: nextSelected,
                                            selectedModes: {
                                              ...(f.selectedModes || {}),
                                              [mKey]: {
                                                ...(f.selectedModes?.[mKey] || { maxAmount: '' }),
                                                checked: nextModeChecked,
                                              },
                                            },
                                          };
                                        });
                                      }}
                                      className="w-4 h-4 accent-indigo-600 rounded"
                                    />
                                    <span className="text-xs font-bold text-slate-800">{sub.name}</span>
                                    <span className="text-[10px] font-mono font-bold text-slate-400">({sub.code})</span>
                                    {sub.workflow === 'KM_RATE' && (
                                      <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 text-[9px] font-extrabold">
                                        KM × Policy Rate
                                      </span>
                                    )}
                                  </label>
                                  {st.checked && (
                                    <div className="flex items-center gap-2">
                                      <span className="text-[10px] font-bold text-slate-400">Max Cap (₹):</span>
                                      <input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        placeholder="Actuals (no cap)"
                                        value={st.maxAmount}
                                        onChange={(e) => setTravelEntForm(f => ({
                                          ...f,
                                          selected: { ...(f.selected || {}), [key]: { ...st, maxAmount: e.target.value } },
                                        }))}
                                        className="w-36 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-800 outline-none focus:border-indigo-400"
                                      />
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="pt-2 flex gap-3">
                <button type="button" onClick={() => setTravelEntModal({ open: false, editing: null })} className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-2xl font-bold text-xs hover:bg-slate-200 transition-all">Cancel</button>
                <button type="submit" disabled={saving} className="flex-1 py-3 bg-sky-600 text-white rounded-2xl font-bold text-xs hover:bg-sky-700 transition-all flex items-center justify-center gap-2 shadow-lg shadow-sky-100">
                  {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                  {travelEntModal.editing ? 'Save Changes' : 'Save Travel Entitlement'}
                </button>
              </div>
            </form>
          );
        })(),
        'max-w-2xl'
      )}

      {/* ── Entitlement Modal ── */}
      {modalShell(
        entModal.open,
        entModal.editing
          ? `Edit Entitlement (L${entForm.levelNumber} ${entForm.expenseTypeCode} - Class ${entForm.cityClass})`
          : `Create Entitlement Limit (L${entForm.levelNumber} ${entForm.expenseTypeCode} - Class ${entForm.cityClass})`,
        'Set the allowance for a specific Level × City Class × Expense Type combination',
        () => setEntModal({ open: false, editing: null }),
        <form onSubmit={saveEntitlement} className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1 text-left">
              <label className={labelCls}>Level *</label>
              <input required type="number" min="1" placeholder="e.g. 4" value={entForm.levelNumber}
                onChange={(e) => {
                  const val = e.target.value;
                  const match = levels.find(l => String(l.levelNumber) === String(val));
                  setEntForm({ ...entForm, levelNumber: val, levelName: match?.name || entForm.levelName });
                }} className={inputCls} />
              <p className="text-[10px] text-indigo-600 font-bold mt-1">
                {levels.find(l => String(l.levelNumber) === String(entForm.levelNumber))?.name || `Level ${entForm.levelNumber}`}
              </p>
            </div>
            <div className="space-y-1 text-left">
              <label className={labelCls}>Grade (optional)</label>
              {renderSelect('ent_grade', entForm.gradeCode, [{ value: '', label: 'All Grades' }, ...grades.map(g => ({ value: (g.code || g.name || '').toLowerCase(), label: `Grade ${(g.code || g.name || '').toUpperCase()}` }))], (v) => setEntForm({ ...entForm, gradeCode: v }))}
            </div>
            <div className="space-y-1 text-left">
              <label className={labelCls}>City Class *</label>
              {renderSelect('ent_city', entForm.cityClass, [...CITY_CLASSES, 'ALL'].map(v => ({ value: v, label: v === 'ALL' ? 'ALL' : `Class ${v}` })), (v) => setEntForm({ ...entForm, cityClass: v }))}
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1 text-left">
              <label className={labelCls}>Expense Type *</label>
              {renderSelect('ent_type', entForm.expenseTypeCode, (types.length ? types : []).map(t => ({ value: t.code, label: `${t.name} (${t.code})` })), (v) => setEntForm({ ...entForm, expenseTypeCode: v }))}
            </div>
            <div className="space-y-1 text-left">
              <label className={labelCls}>Allowance Limit (₹) *</label>
              <input required type="number" step="0.01" min="0" placeholder="e.g. 3000" value={entForm.amount}
                onChange={(e) => setEntForm({ ...entForm, amount: e.target.value })} className={inputCls} />
            </div>
            <div className="space-y-1 text-left">
              <label className={labelCls}>Unit</label>
              {renderSelect('ent_unit', entForm.unit, UNITS.map(v => ({ value: v, label: v.replace('_', ' ') })), (v) => setEntForm({ ...entForm, unit: v }))}
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1 text-left">
              <label className={labelCls}>Formula (Optional)</label>
              <input type="text" placeholder="e.g. MIN(actual, entitlement)" value={entForm.formula}
                onChange={(e) => setEntForm({ ...entForm, formula: e.target.value })} className={inputCls} />
            </div>
            <div className="space-y-1 text-left">
              <label className={labelCls}>Rule Code (Optional)</label>
              <input type="text" placeholder="e.g. LODGING_ENTITLEMENT" value={entForm.ruleCode}
                onChange={(e) => setEntForm({ ...entForm, ruleCode: e.target.value })} className={inputCls} />
            </div>
          </div>
          <div className="space-y-1 text-left">
            <label className={labelCls}>Status</label>
            {renderSelect('ent_status', entForm.status, ['active', 'inactive'].map(v => ({ value: v, label: v.toUpperCase() })), (v) => setEntForm({ ...entForm, status: v }))}
          </div>
          {!entModal.editing && activePolicy && (
            <p className="text-[11px] font-bold text-indigo-600 bg-indigo-50 rounded-xl px-4 py-3 m-0">
              Will be linked to active company policy {activePolicy.code} v{activePolicy.version}.
            </p>
          )}
          <div className="pt-2 flex gap-3">
            <button type="button" onClick={() => setEntModal({ open: false, editing: null })} className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-2xl font-bold text-xs hover:bg-slate-200 transition-all">Cancel</button>
            <button type="submit" disabled={saving} className="flex-1 py-3 bg-indigo-600 text-white rounded-2xl font-bold text-xs hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-100">
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              {entModal.editing ? 'Save Changes' : 'Save Limit'}
            </button>
          </div>
        </form>,
        'max-w-2xl'
      )}

      {/* ── Delete Confirm ── */}
      <AnimatePresence>
        {deleteConfirm.show && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-[2rem] p-6 max-w-sm w-full shadow-2xl text-center space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto"><Trash2 size={24} /></div>
              <h3 className="text-lg font-bold text-slate-900 m-0">Confirm Delete</h3>
              <p className="text-xs font-bold text-slate-500 m-0">This will mark the {deleteConfirm.kind === 'travelModes' ? 'travel mode' : 'item'} inactive. It will no longer be used in new calculations.</p>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setDeleteConfirm({ show: false, id: null, kind: '' })} className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-2xl font-bold text-xs hover:bg-slate-200 transition-all">Cancel</button>
                <button onClick={confirmDelete} disabled={saving} className="flex-1 py-3 bg-rose-600 text-white rounded-2xl font-bold text-xs hover:bg-rose-700 transition-all flex items-center justify-center gap-2">
                  {saving ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />} Delete
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default ExpenseManagement;