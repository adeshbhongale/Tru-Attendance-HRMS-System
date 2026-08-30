import {
  AlertTriangle,
  Building2,
  Check,
  ChevronDown,
  Loader2,
  Lock,
  MapPinOff,
  Monitor,
  Save,
  Search,
  Shield,
  ShieldAlert,
  Smartphone,
  ToggleLeft,
  ToggleRight,
  UserCheck,
  X
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';

// ─── Constants ───
const CATEGORIES = ['DIRECTOR', 'MANAGEMENT', 'LEADERSHIP', 'STAFF', 'TRAINEE'];

// ─── Multi-Select Dropdown Component ───
const MultiSelectDropdown = ({ label, placeholder = 'Select options', options, selected = [], onChange, renderOption, getKey, getLabel }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = options.filter(o => {
    if (!search.trim()) return true;
    const lbl = (getLabel ? getLabel(o) : String(o)).toLowerCase();
    return lbl.includes(search.toLowerCase());
  });

  const toggleItem = (item) => {
    const key = getKey ? getKey(item) : item;
    if (selected.includes(key)) {
      onChange(selected.filter(s => s !== key));
    } else {
      onChange([...selected, key]);
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-left flex items-center justify-between shadow-sm hover:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all text-xs font-semibold text-slate-700"
      >
        <span className="truncate">
          {selected.length === 0 ? (placeholder || label) : `${selected.length} selected`}
        </span>
        <ChevronDown size={14} className={`text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute z-[70] top-full mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-2xl max-h-56 overflow-hidden">
          <div className="p-2 border-b border-slate-100 bg-slate-50/50">
            <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 shadow-inner">
              <Search size={13} className="text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search..."
                className="flex-1 bg-transparent text-xs outline-none text-slate-700 font-medium"
                autoFocus
              />
              {search && (
                <button type="button" onClick={() => setSearch('')} className="text-slate-400 hover:text-slate-600">
                  <X size={12} />
                </button>
              )}
            </div>
          </div>
          <div className="overflow-y-auto max-h-40 p-1">
            {filtered.length === 0 ? (
              <div className="text-xs text-slate-400 text-center py-3">No matching options</div>
            ) : (
              filtered.map(opt => {
                const key = getKey ? getKey(opt) : opt;
                const isSelected = selected.includes(key);
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => toggleItem(opt)}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all ${isSelected ? 'bg-indigo-50 text-indigo-700 font-bold' : 'text-slate-600 hover:bg-slate-50'}`}
                  >
                    <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${isSelected ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300 bg-white'}`}>
                      {isSelected && <Check size={10} className="text-white" />}
                    </div>
                    <span className="truncate text-left flex-1">
                      {renderOption ? renderOption(opt) : (getLabel ? getLabel(opt) : String(opt))}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Selected tags */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {selected.slice(0, 4).map(key => {
            const opt = options.find(o => (getKey ? getKey(o) : o) === key);
            const label = opt ? (getLabel ? getLabel(opt) : String(opt)) : key;
            return (
              <span key={key} className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-md text-[10px] font-bold">
                {label}
                <button type="button" onClick={() => onChange(selected.filter(s => s !== key))} className="hover:text-rose-500">
                  <X size={10} />
                </button>
              </span>
            );
          })}
          {selected.length > 4 && (
            <span className="text-[10px] text-slate-400 font-bold px-1">+{selected.length - 4} more</span>
          )}
        </div>
      )}
    </div>
  );
};

// ─── Access Control Rule Editor (Login & Tracking) ───
const AccessRuleEditor = ({ title, icon: Icon, iconColor, rules, onChange, levels, employees }) => {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center gap-3 mb-4">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${iconColor}`}>
          <Icon size={18} className="text-white" />
        </div>
        <h3 className="text-sm font-extrabold text-slate-800 tracking-tight">{title}</h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {/* Blocked Role Codes */}
        <div>
          <label className="text-[10px] font-bold text-slate-400 tracking-wider mb-1 block">Blocked Role Codes</label>
          <MultiSelectDropdown
            label="Select role codes"
            placeholder="No role codes blocked"
            options={['TCCA1', 'TCSF2A', 'TCSFA', 'TCSTR1', 'TCACC1', 'HR_ADMIN', 'STORE_ADMIN', 'ACCOUNT_ADMIN']}
            selected={rules.blockedRoleCodes || []}
            onChange={(val) => onChange({ ...rules, blockedRoleCodes: val })}
            getKey={r => r}
            getLabel={r => r}
          />
        </div>

        {/* Blocked Categories */}
        <div>
          <label className="text-[10px] font-bold text-slate-400 tracking-wider mb-1 block">Blocked Categories</label>
          <MultiSelectDropdown
            label="Select categories"
            placeholder="No categories blocked"
            options={CATEGORIES}
            selected={rules.blockedCategories || []}
            onChange={(val) => onChange({ ...rules, blockedCategories: val })}
            getKey={c => c}
            getLabel={c => c.charAt(0) + c.slice(1).toLowerCase()}
          />
        </div>

        {/* Blocked Levels */}
        <div>
          <label className="text-[10px] font-bold text-slate-400 tracking-wider mb-1 block">Blocked Levels</label>
          <MultiSelectDropdown
            label="Select levels"
            placeholder="No levels blocked"
            options={levels}
            selected={rules.blockedLevels || []}
            onChange={(val) => onChange({ ...rules, blockedLevels: val })}
            getKey={l => l.levelNumber}
            getLabel={l => `L${l.levelNumber} — ${l.name} (${l.category})`}
          />
        </div>

        {/* Blocked Specific Employees */}
        <div className="md:col-span-2 xl:col-span-3">
          <label className="text-[10px] font-bold text-slate-400 tracking-wider mb-1 block">Blocked Specific Employees</label>
          <MultiSelectDropdown
            label="Select specific employees"
            placeholder="No specific employees blocked"
            options={employees}
            selected={(rules.blockedEmployees || []).map(e => typeof e === 'object' ? (e._id || e.id) : e)}
            onChange={(val) => onChange({ ...rules, blockedEmployees: val })}
            getKey={e => e._id || e.id}
            getLabel={e => `${e.name} (${e.role || e.roleCode || 'Staff'}) — ${e.mobile || e.email || ''}`}
          />
        </div>
      </div>
    </div>
  );
};

// ─── Screen Rule Card ───
const ScreenRuleCard = ({ rule, onChange, levels, employees, departments }) => {
  const [expanded, setExpanded] = useState(false);

  const hasDeptRestriction = rule.departments && rule.departments.length > 0;
  const hasReportsToOnly = !!rule.requiresReportsTo;
  const hasAnyBlock = (rule.blockedCategories?.length > 0) || (rule.blockedLevels?.length > 0) || (rule.blockedEmployees?.length > 0);

  return (
    <div className={`border rounded-2xl transition-all ${!rule.enabled ? 'bg-slate-50/70 border-slate-200 opacity-75' : (hasDeptRestriction || hasReportsToOnly || hasAnyBlock) ? 'bg-indigo-50/20 border-indigo-200' : 'bg-white border-slate-200'} shadow-sm hover:shadow-md`}>
      <div
        className="flex items-center justify-between p-4 cursor-pointer select-none"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onChange({ ...rule, enabled: !rule.enabled });
            }}
            className="transition-all transform hover:scale-105 active:scale-95"
            title={rule.enabled ? 'Click to disable screen' : 'Click to enable screen'}
          >
            {rule.enabled ? (
              <ToggleRight size={30} className="text-emerald-500" />
            ) : (
              <ToggleLeft size={30} className="text-slate-300" />
            )}
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-extrabold text-slate-800">{rule.screenName}</h4>
              {rule.enabled ? (
                <span className="px-2 py-0.5 bg-emerald-50 text-emerald-600 border border-emerald-200 rounded-md text-[9px] font-bold tracking-wider">
                  Active
                </span>
              ) : (
                <span className="px-2 py-0.5 bg-slate-100 text-slate-400 border border-slate-200 rounded-md text-[9px] font-bold tracking-wider">
                  Hidden in App
                </span>
              )}
              {hasReportsToOnly && (
                <span className="px-2 py-0.5 bg-purple-50 text-purple-600 border border-purple-200 rounded-md text-[9px] font-bold flex items-center gap-1">
                  <UserCheck size={10} /> Managers Only
                </span>
              )}
            </div>
            <p className="text-[10px] font-semibold text-slate-400 mt-0.5">
              {!rule.enabled
                ? 'Turned off for all mobile users'
                : hasDeptRestriction
                  ? `Visible to ${rule.departments.length} department(s)`
                  : 'Visible to all departments'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ChevronDown size={18} className={`text-slate-400 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 border-t border-slate-100 pt-3.5 bg-white/50 rounded-b-2xl animate-fade-in">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {/* 1. Department Selection (Replaces Blocked Roles) */}
            <div className="md:col-span-2 bg-slate-50 border border-slate-200/80 rounded-xl p-3">
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[11px] font-bold text-slate-700 flex items-center gap-1.5">
                  <Building2 size={13} className="text-indigo-600" />
                  Target Departments (Visible Only To Selected)
                </label>
                {rule.departments?.length > 0 ? (
                  <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                    {rule.departments.length} Department(s) selected
                  </span>
                ) : (
                  <span className="text-[10px] font-bold text-slate-400 bg-white border border-slate-200 px-2 py-0.5 rounded-full">
                    All Departments (Default)
                  </span>
                )}
              </div>
              <p className="text-[10px] text-slate-400 mb-2">
                Leave empty to make this screen visible to <strong>all departments</strong>, or select specific departments (e.g. Sales for Customer Visits) so only staff in those departments see this screen.
              </p>
              <MultiSelectDropdown
                label="Select departments"
                placeholder="All Departments (Visible to Everyone)"
                options={departments}
                selected={rule.departments || []}
                onChange={(val) => onChange({ ...rule, departments: val })}
                getKey={d => d}
                getLabel={d => d}
              />
            </div>

            {/* 2. Reports-To Radio / Switch (Manager only check, e.g. for Leave Approvals) */}
            <div className="md:col-span-2 bg-purple-50/50 border border-purple-200 rounded-xl p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center shrink-0">
                    <UserCheck size={16} />
                  </div>
                  <div>
                    <h5 className="text-xs font-extrabold text-slate-800">
                      Show Only to Reporting Managers (Reports-To Users)
                    </h5>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      When enabled, this screen (e.g. Leave Approvals) is visible <strong>only to users who have direct subordinates reporting to them</strong>.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onChange({ ...rule, requiresReportsTo: !rule.requiresReportsTo })}
                  className="shrink-0 ml-3 transition-transform hover:scale-105 active:scale-95"
                >
                  {rule.requiresReportsTo ? (
                    <ToggleRight size={32} className="text-purple-600" />
                  ) : (
                    <ToggleLeft size={32} className="text-slate-300" />
                  )}
                </button>
              </div>
            </div>

            {/* 3. Blocked Categories */}
            <div>
              <label className="text-[10px] font-bold text-slate-400 tracking-wider mb-1 block">Blocked Categories</label>
              <MultiSelectDropdown
                label="Select categories to hide"
                placeholder="None blocked"
                options={CATEGORIES}
                selected={rule.blockedCategories || []}
                onChange={(val) => onChange({ ...rule, blockedCategories: val })}
                getKey={c => c}
                getLabel={c => c.charAt(0) + c.slice(1).toLowerCase()}
              />
            </div>

            {/* 4. Blocked Levels */}
            <div>
              <label className="text-[10px] font-bold text-slate-400 tracking-wider mb-1 block">Blocked Levels</label>
              <MultiSelectDropdown
                label="Select levels to hide"
                placeholder="None blocked"
                options={levels}
                selected={rule.blockedLevels || []}
                onChange={(val) => onChange({ ...rule, blockedLevels: val })}
                getKey={l => l.levelNumber}
                getLabel={l => `L${l.levelNumber} — ${l.name}`}
              />
            </div>

            {/* 5. Blocked Specific Employees */}
            <div className="md:col-span-2">
              <label className="text-[10px] font-bold text-slate-400 tracking-wider mb-1 block">Blocked Specific Employees</label>
              <MultiSelectDropdown
                label="Select specific staff to hide"
                placeholder="No specific employees blocked"
                options={employees}
                selected={(rule.blockedEmployees || []).map(e => typeof e === 'object' ? (e._id || e.id) : e)}
                onChange={(val) => onChange({ ...rule, blockedEmployees: val })}
                getKey={e => e._id || e.id}
                getLabel={e => `${e.name} (${e.role || e.roleCode || 'Staff'})`}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};


// ═══════════════════════════════════════════════
// ─── MAIN PAGE COMPONENT ───
// ═══════════════════════════════════════════════

const MobileAppControl = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState(null);
  const [levels, setLevels] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [activeTab, setActiveTab] = useState('screens'); // 'screens' | 'login' | 'tracking'

  // Access Control check: Super Admin only
  const user = (() => {
    try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch (_) { return {}; }
  })();
  const userRole = (user.role || '').toLowerCase();
  const userRoleCode = (user.roleCode || '').toUpperCase();
  const isSuperAdmin = userRole === 'superadmin' || userRoleCode === 'TCSA1' || user.isSuperAdmin === true;

  useEffect(() => {
    if (isSuperAdmin) {
      fetchConfig();
      fetchEmployees();
      fetchDepartments();
    } else {
      setLoading(false);
    }
  }, [isSuperAdmin]);

  const fetchConfig = async () => {
    try {
      setLoading(true);
      const res = await api.get('/mobile-config');
      if (res.data.success) {
        const fetchedData = res.data.data;
        // Filter out legacy trackMyRoute if present
        if (fetchedData.screenRules) {
          fetchedData.screenRules = fetchedData.screenRules.filter(r => r.screenKey !== 'trackMyRoute');
        }
        setConfig(fetchedData);
        setLevels(res.data.levels || []);
        if (res.data.departments && res.data.departments.length > 0) {
          setDepartments(res.data.departments);
        }
      }
    } catch (err) {
      console.error('[MobileAppControl] Failed to fetch config:', err);
      toast.error(err.response?.data?.message || 'Failed to load mobile app configuration');
    } finally {
      setLoading(false);
    }
  };

  const fetchDepartments = async () => {
    try {
      const res = await api.get('/departments');
      const data = res.data.data || res.data || [];
      if (Array.isArray(data) && data.length > 0) {
        const names = data.map(d => typeof d === 'string' ? d : d.name).filter(Boolean);
        setDepartments(prev => Array.from(new Set([...prev, ...names])));
      }
    } catch (_) {
      // Ignore department fetch error, fall back to backend config list
    }
  };

  const fetchEmployees = async () => {
    try {
      const res = await api.get('/employees');
      const data = res.data.data || res.data || [];
      setEmployees(Array.isArray(data) ? data : []);
    } catch (_) {
      setEmployees([]);
    }
  };

  const handleSave = async () => {
    if (!config) return;
    try {
      setSaving(true);
      const cleanedScreenRules = (config.screenRules || []).filter(r => r.screenKey !== 'trackMyRoute');
      const payload = {
        screenRules: cleanedScreenRules,
        loginControl: config.loginControl || {},
        trackingControl: config.trackingControl || {},
      };
      const res = await api.put('/mobile-config', payload);
      if (res.data.success) {
        const savedData = res.data.data;
        if (savedData.screenRules) {
          savedData.screenRules = savedData.screenRules.filter(r => r.screenKey !== 'trackMyRoute');
        }
        setConfig(savedData);
        toast.success('Mobile app configuration saved successfully!');
      }
    } catch (err) {
      console.error('[MobileAppControl] Save error:', err);
      toast.error(err.response?.data?.message || 'Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  const updateScreenRule = (index, updatedRule) => {
    const newRules = [...(config.screenRules || [])];
    newRules[index] = updatedRule;
    setConfig({ ...config, screenRules: newRules });
  };

  const tabs = [
    { key: 'screens', label: 'Screen Visibility & Targeting', icon: Monitor, color: 'text-indigo-600' },
    { key: 'login', label: 'Login Control', icon: Lock, color: 'text-rose-600' },
    { key: 'tracking', label: 'Tracking Control', icon: MapPinOff, color: 'text-amber-600' },
  ];

  // If not super admin, show access denied
  if (!isSuperAdmin) {
    return (
      <div className="max-w-[800px] mx-auto min-h-[60vh] flex flex-col items-center justify-center p-6 text-center animate-fade-up">
        <div className="w-16 h-16 rounded-3xl bg-rose-100 text-rose-600 flex items-center justify-center mb-4 shadow-lg shadow-rose-200">
          <ShieldAlert size={32} />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Super Admin Access Required</h2>
        <p className="text-sm font-semibold text-slate-500 max-w-md mb-6">
          This configuration page is strictly restricted to Super Administrators. You do not have permission to view or manage mobile app access rules.
        </p>
        <button
          onClick={() => navigate('/dashboard')}
          className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-md transition-all active:scale-95"
        >
          Return to Dashboard
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-4">
          <Loader2 size={36} className="text-indigo-500 animate-spin" />
          <p className="text-sm font-bold text-slate-500">Loading mobile app configuration...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[1400px] mx-auto animate-fade-up pb-12">
      {/* Header */}
      <div className="mb-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-xl shadow-indigo-200">
              <Smartphone size={26} className="text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Mobile App Control</h1>
                <span className="px-2.5 py-0.5 bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-full text-[10px] font-bold tracking-wider">
                  Super Admin Only
                </span>
              </div>
              <p className="text-xs font-bold text-slate-500 mt-0.5">
                Control which screens, features, and permissions each department or employee sees on the mobile app
              </p>
            </div>
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm rounded-2xl shadow-lg shadow-indigo-200 transition-all active:scale-95 disabled:opacity-60"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {saving ? 'Saving...' : 'Save Configuration'}
          </button>
        </div>
      </div>

      {/* Info Banner */}
      <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200 rounded-2xl p-4 mb-6 flex items-start gap-3">
        <Shield size={20} className="text-indigo-600 mt-0.5 shrink-0" />
        <div>
          <p className="text-xs font-bold text-indigo-800">
            Super Admin Exclusive — Changes here dynamically govern what mobile app users see on their device after next login.
          </p>
          <p className="text-[11px] text-indigo-600 mt-1">
            Turn screens on/off, target screens to specific departments (e.g. Sales only for Customer Visits), restrict screens to reporting managers (e.g. Leave Approvals), or block login and GPS tracking for executive roles.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 p-1.5 rounded-2xl mb-6 w-fit">
        {tabs.map(tab => {
          const TabIcon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs transition-all ${isActive ? 'bg-white text-indigo-700 shadow-md' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <TabIcon size={15} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      {activeTab === 'screens' && config && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Monitor size={18} className="text-indigo-600" />
              <h2 className="text-lg font-extrabold text-slate-800 tracking-tight">Screen Visibility & Targeting</h2>
            </div>
            <span className="text-xs font-bold text-slate-400">
              {(config.screenRules || []).filter(r => r.enabled).length} of {(config.screenRules || []).length} Screens Active
            </span>
          </div>
          <p className="text-xs font-semibold text-slate-400 mb-4">
            Toggle screens on/off to hide them completely from the mobile app, or expand any screen to assign specific departments or require manager status.
          </p>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
            {(config.screenRules || []).map((rule, idx) => (
              <ScreenRuleCard
                key={rule.screenKey}
                rule={rule}
                onChange={(updated) => updateScreenRule(idx, updated)}
                levels={levels}
                employees={employees}
                departments={departments}
              />
            ))}
          </div>
        </div>
      )}

      {activeTab === 'login' && config && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Lock size={18} className="text-rose-600" />
            <h2 className="text-lg font-extrabold text-slate-800 tracking-tight">Login Control</h2>
          </div>
          <p className="text-xs font-semibold text-slate-400 mb-4">
            Block specific categories, levels, or individual employees from logging into the mobile app.
            Super Admin accounts are always blocked automatically.
          </p>

          <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 mb-4 flex items-start gap-3">
            <AlertTriangle size={18} className="text-rose-500 mt-0.5 shrink-0" />
            <p className="text-[11px] font-bold text-rose-700">
              Users blocked here will receive an "Access denied" message when they attempt to log into the mobile app.
            </p>
          </div>

          <AccessRuleEditor
            title="Mobile Login Restrictions"
            icon={Lock}
            iconColor="bg-rose-500"
            rules={config.loginControl || {}}
            onChange={(updated) => setConfig({ ...config, loginControl: updated })}
            levels={levels}
            employees={employees}
          />
        </div>
      )}

      {activeTab === 'tracking' && config && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <MapPinOff size={18} className="text-amber-600" />
            <h2 className="text-lg font-extrabold text-slate-800 tracking-tight">Tracking Control</h2>
          </div>
          <p className="text-xs font-semibold text-slate-400 mb-4">
            Disable GPS tracking for specific categories, levels, or individual employees.
            Users with tracking disabled will not have their location recorded.
          </p>

          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-4 flex items-start gap-3">
            <AlertTriangle size={18} className="text-amber-600 mt-0.5 shrink-0" />
            <p className="text-[11px] font-bold text-amber-700">
              Blocked users' tracking will be skipped during mobile app initialization. Ideal for director-level and office management personnel.
            </p>
          </div>

          <AccessRuleEditor
            title="Tracking Restrictions"
            icon={MapPinOff}
            iconColor="bg-amber-500"
            rules={config.trackingControl || {}}
            onChange={(updated) => setConfig({ ...config, trackingControl: updated })}
            levels={levels}
            employees={employees}
          />
        </div>
      )}

      {/* Save Button (bottom) */}
      <div className="mt-8 flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-8 py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm rounded-2xl shadow-lg shadow-indigo-200 transition-all active:scale-95 disabled:opacity-60"
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          {saving ? 'Saving...' : 'Save All Changes'}
        </button>
      </div>
    </div>
  );
};

export default MobileAppControl;
