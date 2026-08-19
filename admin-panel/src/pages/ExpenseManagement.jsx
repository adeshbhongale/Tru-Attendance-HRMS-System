import { AnimatePresence, motion } from 'framer-motion';
import {
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
  ShieldCheck,
  Sliders,
  Trash2,
  X
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { useSelector } from 'react-redux';
import api from '../api/axios';

const CITY_CLASSES = ['A+', 'A', 'B', 'C'];
const CITY_CLASS_PRIORITY = { 'A+': 1, 'A': 2, 'B': 3, 'C': 4 };
const EXPENSE_CATEGORIES = ['LODGING', 'FOOD', 'CONVEYANCE', 'TRAVEL', 'OTHER'];
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
  { key: 'types', label: 'Expense Types', icon: <Layers size={16} /> },
  { key: 'cities', label: 'City Classes', icon: <Landmark size={16} /> },
  { key: 'travelModes', label: 'Travel Modes', icon: <Plane size={16} /> },
  { key: 'entitlements', label: 'Level Entitlements', icon: <Sliders size={16} /> },
];

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
      const stored = localStorage.getItem('selectedCompanyId');
      if (stored) return stored;
      const userStr = localStorage.getItem('user') || localStorage.getItem('userInfo');
      if (userStr) {
        const parsed = JSON.parse(userStr);
        return parsed.companyId || parsed.company?._id || parsed.company || '';
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
  const [grades, setGrades] = useState([]);

  // Entitlement View Filter
  const [selectedLevelFilter, setSelectedLevelFilter] = useState('ALL');
  const [entitlementViewMode, setEntitlementViewMode] = useState('cards'); // 'cards' or 'table'

  // City Class Filter
  const [selectedCityClassFilter, setSelectedCityClassFilter] = useState('ALL');

  // Policy modal state
  const [policyModal, setPolicyModal] = useState({ open: false, editing: null });
  const [policyForm, setPolicyForm] = useState({
    name: '', code: '', description: '', version: '1.0', status: 'draft',
    effectiveFrom: '', effectiveTo: '', approvalRequired: false,
    sharedLodgingRule: 'RULE_75', approvalEngine: 'NONE',
    conveyanceRates: { twoWheeler: 3.5, car: 5.0, eBike: 1.0, eCar: 1.75 },
    localTravelFoodAllowed: false,
  });

  // Type modal state
  const [typeModal, setTypeModal] = useState({ open: false, editing: null });
  const [typeForm, setTypeForm] = useState({
    name: '', code: '', description: '', category: 'OTHER',
    calculationMethod: 'ENTITLEMENT_CAP', proofRequired: true,
    selfAttestationAllowed: true, hrApprovalRequired: false, status: 'active', order: 0,
  });

  // City modal state
  const [cityModal, setCityModal] = useState({ open: false, editing: null });
  const [cityForm, setCityForm] = useState({ city: '', cityClass: 'C', state: '', aliases: '', status: 'active' });

  // Travel mode modal state
  const [tmModal, setTmModal] = useState({ open: false, editing: null });
  const [tmForm, setTmForm] = useState({ name: '', code: '', description: '', status: 'active', order: 0 });

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
    const compId = overrideCompId || selectedCompanyId || user?.companyId || user?.company?._id || user?.company;
    if (!compId) return {};
    return {
      params: { companyId: compId },
      headers: { 'x-company-id': compId }
    };
  };

  const fetchCompanies = async () => {
    try {
      const res = await api.get('/admin/console/companies');
      const list = res.data.data || [];
      setCompanies(list);
      if (list.length > 0 && !selectedCompanyId) {
        setSelectedCompanyId(list[0]._id);
        localStorage.setItem('selectedCompanyId', list[0]._id);
        localStorage.setItem('selectedCompanyName', list[0].name);
        localStorage.setItem('selectedCompanyCode', list[0].code);
      }
    } catch (_) { }
  };

  const loadData = async (targetCompId = selectedCompanyId) => {
    try {
      setLoading(true);
      const config = getReqConfig(targetCompId);
      const [polRes, typeRes, cityRes, entRes, lvlRes, grdRes, tmRes] = await Promise.all([
        api.get('/expense/policies', config),
        api.get('/expense/types', config),
        api.get('/expense/cities', config),
        api.get('/expense/entitlements/all', config),
        api.get('/admin/console/levels', config).catch(() => ({ data: { data: [] } })),
        api.get('/admin/console/grades', config).catch(() => ({ data: { data: [] } })),
        api.get('/expense/travel-modes/all', config).catch(() => ({ data: { data: [] } })),
      ]);
      setPolicies(polRes.data.data || []);
      setTypes(typeRes.data.data || []);
      setCities(cityRes.data.data || []);
      setEntitlements(entRes.data.data || []);
      setLevels(lvlRes.data.data || []);
      setGrades(grdRes.data.data || []);
      setTravelModes(tmRes.data?.data || []);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to load expense configuration');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isSuperAdmin) {
      fetchCompanies();
    }
  }, [isSuperAdmin]);

  useEffect(() => {
    loadData(selectedCompanyId);
  }, [selectedCompanyId]);

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
        name: pol.name, code: pol.code, description: pol.description || '', version: pol.version || '1.0',
        status: pol.status || 'draft', effectiveFrom: pol.effectiveFrom ? String(pol.effectiveFrom).slice(0, 10) : '',
        effectiveTo: pol.effectiveTo ? String(pol.effectiveTo).slice(0, 10) : '',
        approvalRequired: !!pol.approvalRequired,
        sharedLodgingRule: pol.sharedLodgingRule || 'HIGHER_PLUS_LOWER',
        sharedLodgingPercent: pol.sharedLodgingPercent !== undefined ? pol.sharedLodgingPercent : (pol.sharedLodgingRule === 'RULE_50' ? 50 : pol.sharedLodgingRule === 'RULE_75' ? 75 : 100),
        approvalEngine: pol.approvalEngine || (pol.approvalRequired ? 'HR' : 'NONE'),
        conveyanceRates: { ...{ twoWheeler: 3.5, car: 5.0, eBike: 1.0, eCar: 1.75 }, ...(pol.conveyanceRates || {}) },
        localTravelFoodAllowed: !!pol.localTravelFoodAllowed,
      });
    } else {
      setPolicyForm({
        name: '', code: '', description: '', version: '1.0', status: 'draft',
        effectiveFrom: '', effectiveTo: '', approvalRequired: false,
        sharedLodgingRule: 'HIGHER_PLUS_LOWER',
        sharedLodgingPercent: 75,
        approvalEngine: 'NONE',
        conveyanceRates: { twoWheeler: 3.5, car: 5.0, eBike: 1.0, eCar: 1.75 },
        localTravelFoodAllowed: false,
      });
    }
    setPolicyModal({ open: true, editing: pol });
  };

  const savePolicy = async (e) => {
    e.preventDefault();
    try {
      setSaving(true);
      const payload = {
        ...policyForm,
        sharedLodgingPercent: Number(policyForm.sharedLodgingPercent) || 75,
        companyId: selectedCompanyId,
        effectiveFrom: policyForm.effectiveFrom || null,
        effectiveTo: policyForm.effectiveTo || null,
        conveyanceRates: {
          twoWheeler: Number(policyForm.conveyanceRates.twoWheeler) || 0,
          car: Number(policyForm.conveyanceRates.car) || 0,
          eBike: Number(policyForm.conveyanceRates.eBike) || 0,
          eCar: Number(policyForm.conveyanceRates.eCar) || 0,
        },
      };
      if (policyModal.editing) {
        await api.put(`/expense/policies/${policyModal.editing._id}`, payload, getReqConfig());
        toast.success('Policy updated');
      } else {
        await api.post('/expense/policies', payload, getReqConfig());
        toast.success('Policy created');
      }
      setPolicyModal({ open: false, editing: null });
      await loadData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save policy');
    } finally {
      setSaving(false);
    }
  };

  const publishPolicy = async (pol) => {
    try {
      setSaving(true);
      await api.post(`/expense/policies/${pol._id}/publish`, {}, getReqConfig());
      toast.success(`${pol.code} v${pol.version} is now ACTIVE`);
      await loadData();
    } catch {
      toast.error('Failed to publish policy');
    } finally {
      setSaving(false);
    }
  };

  // ── Type handlers ──
  const openTypeModal = (t = null) => {
    if (t) {
      setTypeForm({
        name: t.name, code: t.code, description: t.description || '', category: t.category || 'OTHER',
        calculationMethod: t.calculationMethod || 'ENTITLEMENT_CAP', proofRequired: t.proofRequired !== false,
        selfAttestationAllowed: t.selfAttestationAllowed !== false, hrApprovalRequired: !!t.hrApprovalRequired,
        status: t.status || 'active', order: t.order || 0,
      });
    } else {
      setTypeForm({
        name: '', code: '', description: '', category: 'OTHER',
        calculationMethod: 'ENTITLEMENT_CAP', proofRequired: true,
        selfAttestationAllowed: true, hrApprovalRequired: false, status: 'active', order: 0,
      });
    }
    setTypeModal({ open: true, editing: t });
  };

  const saveType = async (e) => {
    e.preventDefault();
    try {
      setSaving(true);
      const payload = { ...typeForm, companyId: selectedCompanyId };
      if (typeModal.editing) {
        await api.put(`/expense/types/${typeModal.editing._id}`, payload, getReqConfig());
        toast.success('Expense type updated');
      } else {
        await api.post('/expense/types', payload, getReqConfig());
        toast.success('Expense type created');
      }
      setTypeModal({ open: false, editing: null });
      await loadData();
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
      const payload = {
        ...cityForm,
        companyId: selectedCompanyId,
        aliases: cityForm.aliases ? cityForm.aliases.split(',').map(s => s.trim()).filter(Boolean) : [],
      };
      if (cityModal.editing) {
        await api.put(`/expense/cities/${cityModal.editing._id}`, payload, getReqConfig());
        toast.success('City classification updated');
      } else {
        await api.post('/expense/cities', payload, getReqConfig());
        toast.success('City classification created');
      }
      setCityModal({ open: false, editing: null });
      await loadData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save city');
    } finally {
      setSaving(false);
    }
  };

  // ── Travel Mode handlers ──
  const openTmModal = (tm = null) => {
    if (tm) {
      setTmForm({
        name: tm.name, code: tm.code, description: tm.description || '',
        status: tm.status || 'active', order: tm.order || 0,
      });
    } else {
      setTmForm({ name: '', code: '', description: '', status: 'active', order: 0 });
    }
    setTmModal({ open: true, editing: tm });
  };

  const saveTravelMode = async (e) => {
    e.preventDefault();
    try {
      setSaving(true);
      const payload = { ...tmForm, companyId: selectedCompanyId, order: Number(tmForm.order) || 0 };
      if (tmModal.editing) {
        await api.put(`/expense/travel-modes/${tmModal.editing._id}`, payload, getReqConfig());
        toast.success('Travel mode updated');
      } else {
        await api.post('/expense/travel-modes', payload, getReqConfig());
        toast.success('Travel mode created');
      }
      setTmModal({ open: false, editing: null });
      await loadData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save travel mode');
    } finally {
      setSaving(false);
    }
  };

  // ── Entitlement handlers ──
  const openEntModal = (ent = null, presetLevel = null, presetType = null, presetCity = null) => {
    if (ent && ent._id) {
      setEntForm({
        levelNumber: ent.levelNumber ?? '',
        levelName: ent.levelName || '',
        gradeCode: ent.gradeCode || '',
        cityClass: ent.cityClass || 'A+',
        expenseTypeCode: ent.expenseTypeCode || 'LODGING',
        amount: ent.amount ?? '',
        unit: ent.unit || 'per_day',
        formula: ent.formula || '',
        ruleCode: ent.ruleCode || '',
        status: ent.status || 'active',
      });
      setEntModal({ open: true, editing: ent });
    } else {
      const defaultLvl = distinctLevelNumbers[0] ? String(distinctLevelNumbers[0]) : '2';
      const lvl = presetLevel ?? ent?.levelNumber ?? (selectedLevelFilter !== 'ALL' && selectedLevelFilter !== '1' ? selectedLevelFilter : defaultLvl);
      const matchingLevel = levels.find(l => String(l.levelNumber) === String(lvl));
      setEntForm({
        levelNumber: lvl !== '' && Number(lvl) !== 1 ? String(lvl) : defaultLvl,
        levelName: matchingLevel?.name || '',
        gradeCode: '',
        cityClass: presetCity || 'A+',
        expenseTypeCode: presetType || (types[0]?.code || 'LODGING'),
        amount: '',
        unit: 'per_day',
        formula: '',
        ruleCode: '',
        status: 'active',
      });
      setEntModal({ open: true, editing: null });
    }
  };

  const saveEntitlement = async (e) => {
    e.preventDefault();
    try {
      setSaving(true);
      const activePolicy = policies.find(p => p.status === 'active');
      const payload = {
        ...entForm,
        companyId: selectedCompanyId,
        levelNumber: Number(entForm.levelNumber),
        amount: Number(entForm.amount),
        expenseTypeCode: entForm.expenseTypeCode,
        policyId: entForm.policyId || (activePolicy ? activePolicy._id : null),
      };
      if (entModal.editing) {
        await api.put(`/expense/entitlements/${entModal.editing._id}`, payload, getReqConfig());
        toast.success('Entitlement updated');
      } else {
        await api.post('/expense/entitlements', payload, getReqConfig());
        toast.success('Entitlement created');
      }
      setEntModal({ open: false, editing: null });
      await loadData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save entitlement');
    } finally {
      setSaving(false);
    }
  };

  // ── Delete handler ──
  const confirmDelete = async () => {
    if (!deleteConfirm.id) return;
    try {
      setSaving(true);
      const map = { types: 'types', cities: 'cities', entitlements: 'entitlements', travelModes: 'travel-modes' };
      await api.delete(`/expense/${map[deleteConfirm.kind]}/${deleteConfirm.id}`, getReqConfig());
      toast.success('Deleted (marked inactive)');
      await loadData();
      setDeleteConfirm({ show: false, id: null, kind: '' });
    } catch {
      toast.error('Failed to delete');
    } finally {
      setSaving(false);
    }
  };

  // ── Derived ──
  const activePolicy = policies.find(p => p.status === 'active');

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
    if (activeTab === 'travelModes') return travelModes.filter(m => (m.name + ' ' + m.code).toLowerCase().includes(q));
    return entitlements
      .filter(e => {
        if (String(e.levelName || '').toLowerCase().includes('super admin')) return false;
        return (`${e.levelNumber || ''} ${e.levelName || ''} ${e.expenseTypeCode || ''} ${e.cityClass || ''} ${e.amount || ''}`).toLowerCase().includes(q);
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

  // Distinct Levels for Entitlements Matrix (BOD L1 down to Intern L12)
  const distinctLevelNumbers = useMemo(() => {
    const set = new Set();
    entitlements.forEach(e => {
      if (e.levelNumber !== undefined && e.levelNumber !== null && !String(e.levelName || '').toLowerCase().includes('super admin')) {
        set.add(Number(e.levelNumber));
      }
    });
    levels.forEach(l => {
      if (l.levelNumber !== undefined && l.levelNumber !== null && !String(l.name || '').toLowerCase().includes('super admin')) {
        set.add(Number(l.levelNumber));
      }
    });
    if (set.size === 0) [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].forEach(n => set.add(n));
    return Array.from(set).sort((a, b) => a - b);
  }, [entitlements, levels]);

  // Group Entitlements by Level & Expense Type for Clean Hierarchy
  const levelGroups = useMemo(() => {
    const q = searchQuery.toLowerCase();
    const map = {};

    distinctLevelNumbers.forEach(ln => {
      const matchingLevel = levels.find(l => Number(l.levelNumber) === Number(ln));
      if (matchingLevel && String(matchingLevel.name || '').toLowerCase().includes('super admin')) return;
      map[ln] = {
        levelNumber: ln,
        levelName: matchingLevel?.name || `Level ${ln}`,
        grade: matchingLevel?.grade || '',
        byType: {}, // { 'FOOD': { 'A+': ent, 'A': ent, ... }, 'LODGING': { ... } }
        totalRules: 0,
      };
    });

    entitlements.forEach(ent => {
      const ln = Number(ent.levelNumber);
      if (String(ent.levelName || '').toLowerCase().includes('super admin')) return;
      if (!map[ln]) {
        const matchingLevel = levels.find(l => Number(l.levelNumber) === Number(ln));
        map[ln] = {
          levelNumber: ln,
          levelName: ent.levelName || matchingLevel?.name || `Level ${ln}`,
          grade: ent.gradeCode || matchingLevel?.grade || '',
          byType: {},
          totalRules: 0,
        };
      }
      const typeCode = (ent.expenseTypeCode || 'OTHER').toUpperCase();
      if (!map[ln].byType[typeCode]) {
        map[ln].byType[typeCode] = {};
      }
      map[ln].byType[typeCode][ent.cityClass || 'ALL'] = ent;
      map[ln].totalRules += 1;
    });

    let result = Object.values(map);

    if (selectedLevelFilter !== 'ALL') {
      result = result.filter(g => Number(g.levelNumber) === Number(selectedLevelFilter));
    }

    if (q) {
      result = result.filter(g => {
        const nameMatch = (g.levelName + ' L' + g.levelNumber).toLowerCase().includes(q);
        if (nameMatch) return true;
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
      headers = ['Name', 'Code', 'Version', 'Status', 'Approval', 'Shared Lodging', 'Created'];
      rows = filtered.map(p => [p.name, p.code, p.version, p.status, p.approvalRequired ? 'HR Required' : 'OFF', p.sharedLodgingRule, new Date(p.createdAt).toLocaleDateString()]);
    } else if (activeTab === 'types') {
      headers = ['Name', 'Code', 'Category', 'Method', 'Proof', 'Status'];
      rows = filtered.map(t => [t.name, t.code, t.category, t.calculationMethod, t.proofRequired ? 'Yes' : 'No', t.status]);
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
                else if (activeTab === 'types') openTypeModal();
                else if (activeTab === 'cities') openCityModal();
                else if (activeTab === 'travelModes') openTmModal();
                else openEntModal();
              }}
              className="flex flex-1 md:flex-none items-center justify-center gap-2 bg-indigo-600 text-white px-6 py-3 rounded-2xl font-bold text-sm shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all active:scale-95"
            >
              <Plus size={18} />
              Add {activeTab === 'policies' ? 'Policy' : activeTab === 'types' ? 'Expense Type' : activeTab === 'cities' ? 'City Class' : activeTab === 'travelModes' ? 'Travel Mode' : 'Entitlement'}
            </button>
          </div>
        </div>

        {/* Active policy banner */}
        {activePolicy && (
          <div className="bg-gradient-to-r from-indigo-600 to-violet-600 rounded-[2rem] p-5 md:p-6 text-white shadow-xl shadow-indigo-200 flex flex-col md:flex-row md:items-center gap-4">
            <div className="flex items-center gap-4 flex-1">
              <div className="w-12 h-12 rounded-2xl bg-white/15 flex items-center justify-center">
                <ShieldCheck size={24} />
              </div>
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-widest text-indigo-100">Active Policy</p>
                <p className="text-lg font-extrabold m-0">{activePolicy.name} ({activePolicy.code}) <span className="text-indigo-100 font-bold text-sm">v{activePolicy.version}</span></p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 md:justify-end">
              <span className={`px-3 py-1.5 rounded-xl text-[10px] font-extrabold uppercase tracking-widest ${activePolicy.approvalRequired ? 'bg-amber-400 text-amber-900' : 'bg-emerald-400 text-emerald-900'}`}>
                {activePolicy.approvalRequired ? 'HR Approval ON' : 'Approval OFF → Direct to Accounts'}
              </span>
              <span className="px-3 py-1.5 rounded-xl bg-white/15 text-[10px] font-extrabold uppercase tracking-widest">
                Shared Lodging: {activePolicy.sharedLodgingRule}
              </span>
            </div>
          </div>
        )}

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
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mr-1">Level:</span>
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
                    return (
                      <div
                        key={group.levelNumber}
                        className="bg-white rounded-3xl border border-slate-200/90 shadow-sm hover:shadow-md transition-shadow overflow-hidden"
                      >
                        {/* Level Header */}
                        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center font-bold text-sm text-indigo-200">
                              L{group.levelNumber}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <h4 className="text-base font-bold text-white m-0">
                                  Level {group.levelNumber}
                                  {group.levelName && group.levelName !== `Level ${group.levelNumber}` ? ` · ${group.levelName}` : ''}
                                </h4>
                                {group.grade && (
                                  <span className="px-2 py-0.5 rounded-md bg-white/15 text-[10px] font-mono font-bold text-indigo-200">
                                    Grade: {group.grade}
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-slate-300 font-semibold m-0 mt-0.5">
                                {group.totalRules} configured city rate{group.totalRules === 1 ? '' : 's'} across {categoryKeys.length} categories
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => openEntModal(null, group.levelNumber)}
                              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-white/15 hover:bg-white text-white hover:text-indigo-950 font-bold text-xs transition-all border border-white/20"
                            >
                              <Plus size={13} />
                              <span>Add Rate</span>
                            </button>
                          </div>
                        </div>

                        {/* Level Body: Category Rate Grids */}
                        <div className="p-6 space-y-4">
                          {categoryKeys.length === 0 ? (
                            <div className="p-6 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                              <p className="text-xs font-bold text-slate-400 m-0">
                                No rates configured for Level {group.levelNumber}.
                              </p>
                              <button
                                onClick={() => openEntModal(null, group.levelNumber, 'LODGING')}
                                className="mt-2 text-xs font-bold text-indigo-600 hover:underline inline-flex items-center gap-1"
                              >
                                <Plus size={12} /> Set Food &amp; Lodging limits for Level {group.levelNumber}
                              </button>
                            </div>
                          ) : (
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
                                          <p className="text-xs font-bold text-slate-800 m-0 uppercase tracking-wider">
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
                                        const ent = typeEnts[cClass] || typeEnts['ALL'];
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
                                                    onClick={() => openEntModal(ent)}
                                                    className="p-0.5 text-slate-400 hover:text-indigo-600"
                                                    title="Edit rate"
                                                  >
                                                    <Edit2 size={11} />
                                                  </button>
                                                  <button
                                                    onClick={() => setDeleteConfirm({ show: true, id: ent._id, kind: 'entitlements' })}
                                                    className="p-0.5 text-slate-400 hover:text-rose-600"
                                                    title="Delete rate"
                                                  >
                                                    <Trash2 size={11} />
                                                  </button>
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
                                                    {ent.unit?.replace('_', ' ') || 'per day'}
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
                        if (typesList.length === 0) {
                          return (
                            <tr key={g.levelNumber} className="hover:bg-slate-50/50">
                              <td className="px-5 py-3.5 text-center font-extrabold text-xs text-indigo-700 bg-indigo-50/30 border-r border-slate-200">
                                L{g.levelNumber}
                              </td>
                              <td className="px-5 py-3.5 text-xs text-slate-400 italic border-r border-slate-200">
                                No rates configured
                              </td>
                              <td colSpan={4} className="px-5 py-3.5 text-center text-xs text-slate-300 border-r border-slate-200">—</td>
                              <td className="px-5 py-3.5 text-center">
                                <button
                                  onClick={() => openEntModal(null, g.levelNumber)}
                                  className="text-xs font-bold text-indigo-600 hover:underline"
                                >
                                  + Add Limit
                                </button>
                              </td>
                            </tr>
                          );
                        }
                        return typesList.map((tCode, idx) => {
                          const rates = g.byType[tCode] || {};
                          return (
                            <tr key={`${g.levelNumber}-${tCode}`} className="hover:bg-slate-50/50">
                              {idx === 0 && (
                                <td
                                  rowSpan={typesList.length}
                                  className="px-5 py-3.5 text-center font-bold text-sm text-indigo-800 bg-indigo-50/30 border-r border-slate-200 align-top pt-4"
                                >
                                  L{g.levelNumber}
                                  <span className="block text-[10px] font-bold text-slate-400 mt-0.5">
                                    {g.levelName || ''}
                                  </span>
                                </td>
                              )}
                              <td className="px-5 py-3.5 text-xs font-bold text-slate-800 border-r border-slate-200">
                                <span className="uppercase font-bold text-indigo-700">{tCode}</span>
                              </td>
                              {CITY_CLASSES.map((cc) => (
                                <td key={cc} className="px-5 py-3.5 text-center text-xs font-extrabold border-r border-slate-200">
                                  {rates[cc] ? (
                                    <span className="text-slate-900">₹{Number(rates[cc].amount).toLocaleString('en-IN')}</span>
                                  ) : (
                                    <span className="text-slate-300">—</span>
                                  )}
                                </td>
                              ))}
                              <td className="px-5 py-3.5 text-center">
                                <button
                                  onClick={() => openEntModal(null, g.levelNumber, tCode)}
                                  className="p-1 text-slate-400 hover:text-indigo-600"
                                  title="Add/Edit Rate"
                                >
                                  <Plus size={14} />
                                </button>
                              </td>
                            </tr>
                          );
                        });
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : activeTab === 'cities' ? (
            /* ═══════════════════════════════════════════════════════════════
                HORIZONTAL CITY CLASSES VIEW (A+ First, then A, B, C)
               ═══════════════════════════════════════════════════════════════ */
            <div className="p-6 space-y-6">
              {/* City Class Filter Header */}
              <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-slate-50/80 rounded-2xl border border-slate-200">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mr-1">City Class:</span>
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
                                className={`group inline-flex items-center gap-2 px-3.5 py-2 rounded-2xl border ${theme.pillBg} transition-all shadow-2xs`}
                              >
                                <div className="flex items-center gap-1.5">
                                  <span className="text-xs font-bold text-slate-800">{c.city}</span>
                                  {c.state && (
                                    <span className="text-[10px] font-bold text-slate-400">({c.state})</span>
                                  )}
                                  {c.status !== 'active' && (
                                    <span className="px-1.5 py-0.5 rounded bg-rose-50 text-rose-600 text-[9px] font-bold">
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
                        <th className="px-6 py-4 text-center text-[10px] font-extrabold text-indigo-600 tracking-widest border border-slate-200">APPROVAL</th>
                        <th className="px-6 py-4 text-center text-[10px] font-extrabold text-indigo-600 tracking-widest border border-slate-200">SHARED LODGING</th>
                        <th className="px-6 py-4 text-center text-[10px] font-extrabold text-indigo-600 tracking-widest border border-slate-200">RATES</th>
                        <th className="px-6 py-4 text-[10px] font-extrabold text-indigo-600 tracking-widest border border-slate-200 text-center">ACTIONS</th>
                      </>
                    )}
                    {activeTab === 'types' && (
                      <>
                        <th className="px-6 py-4 text-[10px] font-extrabold text-indigo-600 tracking-widest border border-slate-200">EXPENSE TYPE</th>
                        <th className="px-6 py-4 text-center text-[10px] font-extrabold text-indigo-600 tracking-widest border border-slate-200">CATEGORY</th>
                        <th className="px-6 py-4 text-center text-[10px] font-extrabold text-indigo-600 tracking-widest border border-slate-200">CALC METHOD</th>
                        <th className="px-6 py-4 text-center text-[10px] font-extrabold text-indigo-600 tracking-widest border border-slate-200">PROOF</th>
                        <th className="px-6 py-4 text-center text-[10px] font-extrabold text-indigo-600 tracking-widest border border-slate-200">STATUS</th>
                        <th className="px-6 py-4 text-[10px] font-extrabold text-indigo-600 tracking-widest border border-slate-200 text-center">ACTIONS</th>
                      </>
                    )}
                    {activeTab === 'travelModes' && (
                      <>
                        <th className="px-6 py-4 text-[10px] font-extrabold text-indigo-600 tracking-widest border border-slate-200">TRAVEL MODE</th>
                        <th className="px-6 py-4 text-center text-[10px] font-extrabold text-indigo-600 tracking-widest border border-slate-200">CODE</th>
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
                      <td colSpan={6} className="px-6 py-12 text-center text-slate-400 font-bold text-sm">
                        No {activeTab} found.
                      </td>
                    </tr>
                  )}

                  {activeTab === 'policies' && filtered.map(p => (
                    <tr key={p._id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-5 border border-slate-200">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold"><ShieldCheck size={20} /></div>
                          <div className="text-left">
                            <p className="text-sm font-bold text-slate-900">{p.name}</p>
                            <p className="text-xs font-bold text-indigo-600 tracking-wider">{p.code} · v{p.version}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-5 text-center border border-slate-200">
                        <span className={`px-3 py-1 rounded-full text-[10px] font-bold tracking-wider border ${p.status === 'active' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : p.status === 'draft' ? 'bg-amber-50 text-amber-600 border-amber-200' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>
                          {(p.status || 'draft').toUpperCase()}
                        </span>
                      </td>
                      <td className="px-6 py-5 text-center border border-slate-200">
                        <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold tracking-widest ${p.approvalRequired ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'}`}>
                          {p.approvalRequired ? 'HR REQUIRED' : 'OFF'}
                        </span>
                      </td>
                      <td className="px-6 py-5 text-center border border-slate-200">
                        {p.sharedLodgingRule === 'HIGHER_ONLY' ? (
                          <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 text-[10px] font-extrabold tracking-wide">
                            Higher Only
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 text-[10px] font-extrabold tracking-wide border border-indigo-100">
                            (Higher+Lower) × {p.sharedLodgingPercent || (p.sharedLodgingRule === 'RULE_50' ? 50 : p.sharedLodgingRule === 'RULE_75' ? 75 : 100)}%
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-5 text-center border border-slate-200">
                        <span className="text-[10px] font-bold text-slate-500 leading-4">
                          2W ₹{p.conveyanceRates?.twoWheeler}<br />Car ₹{p.conveyanceRates?.car}
                        </span>
                      </td>
                      <td className="px-6 py-5 border border-slate-200">
                        <div className="flex justify-center gap-2">
                          <button onClick={() => openPolicyModal(p)} className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-indigo-50 text-indigo-600 hover:bg-indigo-600 hover:text-white transition-all text-xs font-bold shadow-sm cursor-pointer">
                            <Edit2 size={13} /><span>Edit</span>
                          </button>
                          {p.status !== 'active' && (
                            <button onClick={() => publishPolicy(p)} className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 hover:bg-emerald-600 hover:text-white transition-all text-xs font-bold shadow-sm cursor-pointer">
                              <Check size={13} /><span>Publish</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}

                  {activeTab === 'types' && filtered.map(t => (
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
                        <span className={`text-xs font-bold ${t.proofRequired ? 'text-amber-600' : 'text-slate-400'}`}>{t.proofRequired ? 'Required' : 'Not Required'}</span>
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
                  ))}

                  {activeTab === 'travelModes' && filtered.map(m => (
                    <tr key={m._id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-5 border border-slate-200">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center font-bold"><Plane size={20} /></div>
                          <p className="text-sm font-bold text-slate-900">{m.name}</p>
                        </div>
                      </td>
                      <td className="px-6 py-5 text-center border border-slate-200">
                        <span className="px-2.5 py-1 rounded-lg bg-sky-50 text-sky-700 text-[10px] font-extrabold tracking-widest">{m.code}</span>
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
              <input type="text" value={policyForm.version}
                onChange={(e) => setPolicyForm({ ...policyForm, version: e.target.value })} className={inputCls} />
            </div>
            <div className="space-y-1 text-left">
              <label className={labelCls}>Effective From</label>
              <input type="date" value={policyForm.effectiveFrom}
                onChange={(e) => setPolicyForm({ ...policyForm, effectiveFrom: e.target.value })} className={inputCls} />
            </div>
            <div className="space-y-1 text-left">
              <label className={labelCls}>Status</label>
              {renderSelect('pol_status', policyForm.status, ['draft', 'active', 'inactive'].map(v => ({ value: v, label: v.toUpperCase() })), (v) => setPolicyForm({ ...policyForm, status: v }))}
            </div>
          </div>

          {/* Approval switch */}
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-extrabold text-slate-800 m-0">HR Approval Switch</p>
                <p className="text-[10px] font-bold text-slate-500 mt-0.5">ON → claims route to HR first, then Accounts. OFF → straight to Accounts.</p>
              </div>
              <button type="button" onClick={() => {
                const next = !policyForm.approvalRequired;
                setPolicyForm({ ...policyForm, approvalRequired: next, approvalEngine: next ? 'HR' : 'NONE' });
              }} className={`relative w-14 h-8 rounded-full transition-colors ${policyForm.approvalRequired ? 'bg-emerald-500' : 'bg-slate-300'}`}>
                <span className={`absolute top-1 w-6 h-6 rounded-full bg-white shadow transition-all ${policyForm.approvalRequired ? 'left-7' : 'left-1'}`} />
              </button>
            </div>
          </div>

          {/* Shared Lodging Dynamic Rule Configuration */}
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-4">
            <div>
              <p className="text-xs font-extrabold text-slate-800 m-0 uppercase tracking-wider">
                Shared Lodging Rule (Multiple Employees in 1 Room)
              </p>
              <p className="text-[10px] font-bold text-slate-500 mt-0.5">
                Configure how allowance limit is calculated when 2 or more employees share lodging
              </p>
            </div>

            {/* Rule Selector Options */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Option 1: Higher Only */}
              <button
                type="button"
                onClick={() => setPolicyForm({ ...policyForm, sharedLodgingRule: 'HIGHER_ONLY' })}
                className={`p-3.5 rounded-2xl text-left transition-all border ${policyForm.sharedLodgingRule === 'HIGHER_ONLY'
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-100'
                    : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                  }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold">Higher Entitlement Only</span>
                  {policyForm.sharedLodgingRule === 'HIGHER_ONLY' && <Check size={14} />}
                </div>
                <p className={`text-[10px] font-semibold leading-relaxed m-0 ${policyForm.sharedLodgingRule === 'HIGHER_ONLY' ? 'text-indigo-100' : 'text-slate-500'
                  }`}>
                  Calculates room limit based strictly on the highest-graded employee in the room.
                </p>
              </button>

              {/* Option 2: Higher + Lower (%) */}
              <button
                type="button"
                onClick={() => setPolicyForm({ ...policyForm, sharedLodgingRule: 'HIGHER_PLUS_LOWER' })}
                className={`p-3.5 rounded-2xl text-left transition-all border ${policyForm.sharedLodgingRule !== 'HIGHER_ONLY'
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-100'
                    : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                  }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold">(Higher + Lower) × Custom %</span>
                  {policyForm.sharedLodgingRule !== 'HIGHER_ONLY' && <Check size={14} />}
                </div>
                <p className={`text-[10px] font-semibold leading-relaxed m-0 ${policyForm.sharedLodgingRule !== 'HIGHER_ONLY' ? 'text-indigo-100' : 'text-slate-500'
                  }`}>
                  Combines Higher + Lower entitlements scaled by any percentage (1% to 100%).
                </p>
              </button>
            </div>

            {/* Dynamic % input when Higher + Lower is selected */}
            {policyForm.sharedLodgingRule !== 'HIGHER_ONLY' && (
              <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-3 shadow-2xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <label className="text-[11px] font-extrabold text-slate-700">
                    Combined Multiplier: <span className="text-indigo-600 font-bold text-sm">{policyForm.sharedLodgingPercent || 75}%</span>
                  </label>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {[10, 20, 30, 50, 70, 75, 80, 100].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setPolicyForm({ ...policyForm, sharedLodgingPercent: preset })}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${Number(policyForm.sharedLodgingPercent) === preset
                            ? 'bg-indigo-600 text-white shadow-xs'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                      >
                        {preset}%
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-1">
                  <input
                    type="range"
                    min="1"
                    max="100"
                    step="1"
                    value={policyForm.sharedLodgingPercent || 75}
                    onChange={(e) => setPolicyForm({ ...policyForm, sharedLodgingPercent: Number(e.target.value) })}
                    className="flex-1 accent-indigo-600 cursor-pointer h-2 bg-slate-100 rounded-lg"
                  />
                  <div className="flex items-center gap-1 w-24">
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={policyForm.sharedLodgingPercent || 75}
                      onChange={(e) => setPolicyForm({
                        ...policyForm,
                        sharedLodgingPercent: Math.max(1, Math.min(100, Number(e.target.value) || 1))
                      })}
                      className="w-full bg-slate-50 border border-slate-200 px-2 py-1.5 rounded-lg text-xs font-extrabold text-slate-900 text-center outline-none focus:border-indigo-400"
                    />
                    <span className="text-xs font-bold text-slate-400">%</span>
                  </div>
                </div>

                <div className="p-2.5 bg-indigo-50/70 rounded-lg border border-indigo-100 flex items-center gap-2">
                  <span className="text-[10px] font-bold text-indigo-700">
                    💡 <b>Live Formula:</b> (Higher Entitlement + Lower Entitlement) × {policyForm.sharedLodgingPercent || 75}%
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Conveyance rates */}
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
            <p className="text-xs font-extrabold text-slate-800 m-0 uppercase tracking-wider">Default Own-Vehicle Conveyance Rates (₹/km)</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="space-y-1">
                <label className={labelCls}>2-Wheeler (₹/km)</label>
                <input type="number" step="0.1" value={policyForm.conveyanceRates.twoWheeler}
                  onChange={(e) => setPolicyForm({ ...policyForm, conveyanceRates: { ...policyForm.conveyanceRates, twoWheeler: e.target.value } })} className={inputCls} />
              </div>
              <div className="space-y-1">
                <label className={labelCls}>Car (₹/km)</label>
                <input type="number" step="0.1" value={policyForm.conveyanceRates.car}
                  onChange={(e) => setPolicyForm({ ...policyForm, conveyanceRates: { ...policyForm.conveyanceRates, car: e.target.value } })} className={inputCls} />
              </div>
              <div className="space-y-1">
                <label className={labelCls}>E-Bike (₹/km)</label>
                <input type="number" step="0.1" value={policyForm.conveyanceRates.eBike}
                  onChange={(e) => setPolicyForm({ ...policyForm, conveyanceRates: { ...policyForm.conveyanceRates, eBike: e.target.value } })} className={inputCls} />
              </div>
              <div className="space-y-1">
                <label className={labelCls}>E-Car (₹/km)</label>
                <input type="number" step="0.1" value={policyForm.conveyanceRates.eCar}
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <label className="flex items-center gap-3 bg-slate-50 p-3 rounded-2xl border border-slate-200">
              <input type="checkbox" checked={typeForm.proofRequired} onChange={(e) => setTypeForm({ ...typeForm, proofRequired: e.target.checked })} className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500" />
              <span className="text-xs font-bold text-slate-800">Proof Required</span>
            </label>
            <label className="flex items-center gap-3 bg-slate-50 p-3 rounded-2xl border border-slate-200">
              <input type="checkbox" checked={typeForm.selfAttestationAllowed} onChange={(e) => setTypeForm({ ...typeForm, selfAttestationAllowed: e.target.checked })} className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500" />
              <span className="text-xs font-bold text-slate-800">Self-Attestation</span>
            </label>
            <div className="space-y-1 text-left">
              <label className={labelCls}>Status</label>
              {renderSelect('type_status', typeForm.status, ['active', 'inactive'].map(v => ({ value: v, label: v.toUpperCase() })), (v) => setTypeForm({ ...typeForm, status: v }))}
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
              <input required type="text" placeholder="e.g. Mumbai" value={cityForm.city}
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
        tmModal.editing ? `Edit ${tmModal.editing.name}` : 'Add Travel Mode',
        'Travel modes are available to employees as a dropdown when filing an expense claim',
        () => setTmModal({ open: false, editing: null }),
        <form onSubmit={saveTravelMode} className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1 text-left">
              <label className={labelCls}>Mode Name *</label>
              <input required type="text" placeholder="e.g. Flight" value={tmForm.name}
                onChange={(e) => setTmForm({ ...tmForm, name: e.target.value })} className={inputCls} />
            </div>
            <div className="space-y-1 text-left">
              <label className={labelCls}>Code *</label>
              <input required type="text" placeholder="e.g. FLIGHT" value={tmForm.code}
                onChange={(e) => setTmForm({ ...tmForm, code: e.target.value.toUpperCase() })} className={`${inputCls} uppercase`} />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1 text-left">
              <label className={labelCls}>Description</label>
              <input type="text" placeholder="Short description" value={tmForm.description}
                onChange={(e) => setTmForm({ ...tmForm, description: e.target.value })} className={inputCls} />
            </div>
            <div className="space-y-1 text-left">
              <label className={labelCls}>Order</label>
              <input type="number" min="0" value={tmForm.order}
                onChange={(e) => setTmForm({ ...tmForm, order: e.target.value })} className={inputCls} />
            </div>
          </div>
          <div className="space-y-1 text-left">
            <label className={labelCls}>Status</label>
            {renderSelect('tm_status', tmForm.status, ['active', 'inactive'].map(v => ({ value: v, label: v.toUpperCase() })), (v) => setTmForm({ ...tmForm, status: v }))}
          </div>
          <div className="pt-2 flex gap-3">
            <button type="button" onClick={() => setTmModal({ open: false, editing: null })} className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-2xl font-bold text-xs hover:bg-slate-200 transition-all">Cancel</button>
            <button type="submit" disabled={saving} className="flex-1 py-3 bg-indigo-600 text-white rounded-2xl font-bold text-xs hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-100">
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              {tmModal.editing ? 'Save Changes' : 'Add Travel Mode'}
            </button>
          </div>
        </form>,
        'max-w-2xl'
      )}

      {/* ── Entitlement Modal ── */}
      {modalShell(
        entModal.open,
        entModal.editing ? `Edit Entitlement (L${entModal.editing.levelNumber} ${entModal.editing.expenseTypeCode} - ${entModal.editing.cityClass})` : 'Create Entitlement Limit',
        'Set the allowance for a specific Level × City Class × Expense Type combination',
        () => setEntModal({ open: false, editing: null }),
        <form onSubmit={saveEntitlement} className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1 text-left">
              <label className={labelCls}>Level *</label>
              <input required type="number" min="1" placeholder="e.g. 4" value={entForm.levelNumber}
                onChange={(e) => setEntForm({ ...entForm, levelNumber: e.target.value })} className={inputCls} />
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