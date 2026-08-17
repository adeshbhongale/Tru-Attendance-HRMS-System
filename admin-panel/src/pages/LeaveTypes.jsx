import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  ArrowRightLeft,
  Check,
  ChevronDown,
  ChevronLeft, ChevronRight,
  Download,
  Edit2,
  FileText,
  Filter,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Search,
  Settings2,
  ShieldCheck,
  Trash2,
  X
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../api/axios';

const SCOPE_TYPES = [
  { value: 'company', label: 'Company default' },
  { value: 'employee', label: 'Employee (Individual)' },
  { value: 'role', label: 'Role (roleCode)' },
  { value: 'level', label: 'Level' },
  { value: 'grade', label: 'Grade' },
  { value: 'department', label: 'Department' },
];

const LeaveTypes = () => {
  const [leaveTypes, setLeaveTypes] = useState([]);
  const [policies, setPolicies] = useState([]);
  const [meta, setMeta] = useState({ levels: [], grades: [], departments: [], roles: [], employees: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Type Modal State
  const [showModal, setShowModal] = useState(false);
  const [editingType, setEditingType] = useState(null);
  const [activeTab, setActiveTab] = useState('type'); // 'type' | 'policy'

  // Rule Sub-Modal State
  const [ruleModal, setRuleModal] = useState({ open: false, policy: null, rule: null });
  const [deleteConfirm, setDeleteConfirm] = useState({ show: false, id: null, type: 'type' });

  // Pagination & Search
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 8;
  const [searchQuery, setSearchQuery] = useState('');

  // Dropdown States
  const [limitTypeDropdownOpen, setLimitTypeDropdownOpen] = useState(false);
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const [periodDropdownOpen, setPeriodDropdownOpen] = useState(false);
  const [ruleScopeDropdownOpen, setRuleScopeDropdownOpen] = useState(false);
  const [targetDropdownOpen, setTargetDropdownOpen] = useState(false);

  const limitTypeDropdownRef = useRef(null);
  const statusDropdownRef = useRef(null);
  const periodDropdownRef = useRef(null);
  const ruleScopeDropdownRef = useRef(null);
  const targetDropdownRef = useRef(null);

  // Type Form State
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    limit: 12,
    limitType: 'Yearly',
    allowedDurations: ['Full Day', 'Half Day', 'Multiple Days'],
    status: 'active'
  });

  // Policy Extra Options (Period Window & Carry Forward)
  const [policyFormData, setPolicyFormData] = useState({
    periodType: 'YEARLY',
    carryForward: false,
    maxCarryForward: 0
  });

  // Multi-select Rule Form State
  const [ruleForm, setRuleForm] = useState({
    scopeType: 'company',
    selectedTargets: [], // Array of { id, code, label }
    days: 12,
  });
  const [targetSearchQuery, setTargetSearchQuery] = useState('');

  const fetchAllData = async () => {
    try {
      setLoading(true);
      const [typesRes, policiesRes, metaRes] = await Promise.all([
        api.get('/leave-types'),
        api.get('/leave/admin/policies'),
        api.get('/leave/admin/policies/meta').catch(() => ({ data: { data: {} } }))
      ]);

      setLeaveTypes(typesRes.data.data || []);
      setPolicies(policiesRes.data.data || []);
      if (metaRes.data?.data) {
        setMeta(metaRes.data.data);
      }
    } catch (err) {
      toast.error('Failed to load leave types & policies');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllData();
  }, []);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (limitTypeDropdownRef.current && !limitTypeDropdownRef.current.contains(e.target)) setLimitTypeDropdownOpen(false);
      if (statusDropdownRef.current && !statusDropdownRef.current.contains(e.target)) setStatusDropdownOpen(false);
      if (periodDropdownRef.current && !periodDropdownRef.current.contains(e.target)) setPeriodDropdownOpen(false);
      if (ruleScopeDropdownRef.current && !ruleScopeDropdownRef.current.contains(e.target)) setRuleScopeDropdownOpen(false);
      if (targetDropdownRef.current && !targetDropdownRef.current.contains(e.target)) setTargetDropdownOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const policyByType = (typeId) => policies.find((p) => p.leaveTypeRef === typeId);

  const handleOpenModal = (type = null) => {
    if (type) {
      setEditingType(type);
      setFormData({
        name: type.name,
        code: type.code,
        limit: type.limit,
        limitType: type.limitType || 'Yearly',
        allowedDurations: type.allowedDurations && type.allowedDurations.length > 0 ? type.allowedDurations : ['Full Day', 'Half Day', 'Multiple Days'],
        status: type.status || 'active'
      });

      const existingPol = policyByType(type._id);
      if (existingPol) {
        setPolicyFormData({
          periodType: existingPol.periodType || (type.limitType === 'Monthly' ? 'MONTHLY' : 'YEARLY'),
          carryForward: !!existingPol.carryForward,
          maxCarryForward: existingPol.maxCarryForward || 0
        });
      } else {
        setPolicyFormData({
          periodType: type.limitType === 'Monthly' ? 'MONTHLY' : 'YEARLY',
          carryForward: false,
          maxCarryForward: 0
        });
      }
      setActiveTab('type');
    } else {
      setEditingType(null);
      setFormData({
        name: '',
        code: '',
        limit: 12,
        limitType: 'Yearly',
        allowedDurations: ['Full Day', 'Half Day', 'Multiple Days'],
        status: 'active'
      });
      setPolicyFormData({
        periodType: 'YEARLY',
        carryForward: false,
        maxCarryForward: 0
      });
      setActiveTab('type');
    }
    setShowModal(true);
  };

  const handleSaveTypeAndPolicy = async (e) => {
    e.preventDefault();
    try {
      setSaving(true);
      let savedType = null;

      if (editingType) {
        const res = await api.put(`/leave-types/${editingType._id}`, formData);
        savedType = res.data.data;
        toast.success('Leave type updated');
      } else {
        const res = await api.post('/leave-types', formData);
        savedType = res.data.data;
        toast.success('Leave type created!');
      }

      // Sync policy settings including Carry Forward
      if (savedType) {
        let existingPol = policyByType(savedType._id);
        if (existingPol) {
          await api.put(`/leave/admin/policies/${existingPol._id}`, {
            periodType: policyFormData.periodType,
            carryForward: policyFormData.carryForward,
            maxCarryForward: Number(policyFormData.maxCarryForward) || 0,
            name: `${savedType.name} Policy`
          });
        } else {
          await api.post('/leave/admin/policies', {
            leaveTypeRef: savedType._id,
            name: `${savedType.name} Policy`,
            periodType: policyFormData.periodType,
            carryForward: policyFormData.carryForward,
            maxCarryForward: Number(policyFormData.maxCarryForward) || 0
          });
        }
      }

      await fetchAllData();

      if (!editingType && savedType) {
        setEditingType(savedType);
        setActiveTab('policy');
      } else {
        setShowModal(false);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save leave type');
    } finally {
      setSaving(false);
    }
  };

  // Direct save handler for Tab 2 Policy Carry Forward settings
  const handleSavePolicySettingsOnly = async () => {
    if (!editingType) return;
    const existingPol = policyByType(editingType._id);
    if (!existingPol) return;
    try {
      setSaving(true);
      await api.put(`/leave/admin/policies/${existingPol._id}`, {
        periodType: policyFormData.periodType,
        carryForward: policyFormData.carryForward,
        maxCarryForward: Number(policyFormData.maxCarryForward) || 0,
      });
      toast.success('Carry Forward policy settings updated!');
      await fetchAllData();
    } catch (err) {
      toast.error('Failed to update policy settings');
    } finally {
      setSaving(false);
    }
  };

  // Rule Management Handlers
  const handleOpenRuleModal = (policy, rule = null) => {
    if (!policy) {
      toast.error('Please save leave type details first to configure scope rules');
      return;
    }
    setRuleModal({ open: true, policy, rule });
    setTargetSearchQuery('');

    if (rule) {
      let targetLabel = rule.scopeCode || rule.scopeRef || 'Rule Target';
      if (rule.scopeType === 'level' && meta.levels) {
        const lvl = meta.levels.find(l => (l._id && rule.scopeRef && l._id.toString() === rule.scopeRef.toString()) || l.name === rule.scopeCode || String(l.levelNumber) === String(rule.scopeCode));
        if (lvl) {
          targetLabel = lvl.levelNumber ? `Level ${lvl.levelNumber} (${lvl.name})` : (lvl.name || rule.scopeCode);
        } else if (rule.scopeCode) {
          targetLabel = rule.scopeCode;
        }
      } else if (rule.scopeType === 'grade' && meta.grades) {
        const grd = meta.grades.find(g => (g._id && rule.scopeRef && g._id.toString() === rule.scopeRef.toString()) || g.code === rule.scopeCode);
        if (grd) {
          targetLabel = `Grade ${(grd.code || grd.name || '').toUpperCase()}`;
        } else if (rule.scopeCode) {
          targetLabel = `Grade ${rule.scopeCode}`;
        }
      } else if (rule.scopeType === 'employee' && meta.employees) {
        const emp = meta.employees.find(e => e._id === rule.scopeRef);
        if (emp) targetLabel = `${emp.name} (${emp.email || ''})`;
      }

      setRuleForm({
        scopeType: rule.scopeType,
        selectedTargets: [{ id: rule.scopeRef || null, code: rule.scopeCode || null, label: targetLabel }],
        days: rule.days,
      });
    } else {
      setRuleForm({
        scopeType: 'company',
        selectedTargets: [],
        days: formData.limit || 12,
      });
    }
  };

  // Target list generator based on selected scope type
  const availableTargetOptions = useMemo(() => {
    if (ruleForm.scopeType === 'company') return [];

    const EXCLUDED_ADMIN_ROLES = [
      'SUPER_ADMIN', 'SUPERADMIN', 'TCSA1',
      'COMPANY_ADMIN', 'COMPANYADMIN', 'TCCA1', 'ADMIN',
      'HR', 'HR_ADMIN',
      'STORE', 'STORE_ADMIN', 'STORE_MANAGER',
      'ACCOUNTS', 'ACCOUNTS_ADMIN', 'ACCOUNT_ADMIN', 'FINANCE',
      'MANAGEMENT', 'DEPARTMENT_ADMIN'
    ];

    if (ruleForm.scopeType === 'employee') {
      return (meta.employees || [])
        .filter(e => {
          const uRole = (e.role || '').toUpperCase();
          const uRoleCode = (e.roleCode || '').toUpperCase();
          return !EXCLUDED_ADMIN_ROLES.includes(uRole) && !EXCLUDED_ADMIN_ROLES.includes(uRoleCode);
        })
        .map(e => ({
          id: e._id,
          code: null,
          label: `${e.name} (${e.email || e.phone || 'Emp'})`
        }));
    }

    if (ruleForm.scopeType === 'role') {
      const defaultRoles = ['EMPLOYEE', 'DEVELOPER', 'TRAINEE', 'TEAM_LEAD', 'MANAGER', 'STAFF', 'WORKER'];
      const rawRoles = meta.roles && meta.roles.length > 0 ? meta.roles : defaultRoles;
      return rawRoles
        .map(r => {
          const code = (typeof r === 'string' ? r : (r.code || r.name || '')).toUpperCase();
          return { id: typeof r === 'object' ? r._id : null, code, label: code };
        })
        .filter(opt => opt.code && !EXCLUDED_ADMIN_ROLES.includes(opt.code));
    }

    if (ruleForm.scopeType === 'level') {
      const ADMIN_LEVEL_KEYWORDS = ['BOD', 'BOARD', 'DIRECTOR', 'EXECUTIVE', 'SUPER ADMIN', 'COMPANY ADMIN', 'ADMIN', 'HR', 'OWNER', 'CHAIRMAN', 'CEO'];
      return (meta.levels || [])
        .filter(l => {
          const nameUpper = (l.name || '').toUpperCase();
          const codeUpper = String(l.levelNumber || '').toUpperCase();
          return !ADMIN_LEVEL_KEYWORDS.some(kw => nameUpper.includes(kw) || codeUpper.includes(kw));
        })
        .map(l => ({
          id: l._id,
          code: String(l.levelNumber || l.name || ''),
          label: l.levelNumber ? `Level ${l.levelNumber} (${l.name})` : l.name
        }));
    }

    if (ruleForm.scopeType === 'grade') {
      const ADMIN_GRADE_KEYWORDS = ['SUPER', 'ADMIN', 'BOD', 'EXEC', 'HR', 'DIRECTOR'];
      return (meta.grades || [])
        .filter(g => {
          const nameUpper = (g.name || '').toUpperCase();
          const codeUpper = (g.code || '').toUpperCase();
          return !ADMIN_GRADE_KEYWORDS.some(kw => nameUpper.includes(kw) || codeUpper.includes(kw));
        })
        .map(g => ({
          id: g._id,
          code: (g.code || g.name || '').toUpperCase(),
          label: `Grade ${(g.code || g.name || '').toUpperCase()}`
        }));
    }

    if (ruleForm.scopeType === 'department') {
      return (meta.departments || []).map(d => ({
        id: null,
        code: (d.code || d.name).toUpperCase(),
        label: `${d.name} (${(d.code || d.name).toUpperCase()})`
      }));
    }

    return [];
  }, [ruleForm.scopeType, meta]);

  const filteredTargetOptions = useMemo(() => {
    if (!targetSearchQuery.trim()) return availableTargetOptions;
    return availableTargetOptions.filter(opt =>
      opt.label.toLowerCase().includes(targetSearchQuery.toLowerCase())
    );
  }, [availableTargetOptions, targetSearchQuery]);

  const toggleTargetSelection = (target) => {
    const key = target.id || target.code;
    setRuleForm(prev => {
      const exists = prev.selectedTargets.some(t => (t.id || t.code) === key);
      if (exists) {
        return { ...prev, selectedTargets: prev.selectedTargets.filter(t => (t.id || t.code) !== key) };
      } else {
        return { ...prev, selectedTargets: [...prev.selectedTargets, target] };
      }
    });
  };

  const handleSelectAllTargets = () => {
    setRuleForm(prev => ({ ...prev, selectedTargets: [...availableTargetOptions] }));
  };

  const handleClearAllTargets = () => {
    setRuleForm(prev => ({ ...prev, selectedTargets: [] }));
  };

  const handleSaveRule = async (e) => {
    e.preventDefault();
    if (!ruleModal.policy) return;
    try {
      setSaving(true);

      if (ruleForm.scopeType === 'company') {
        const payload = {
          scopeType: 'company',
          scopeCode: '_default',
          days: Number(ruleForm.days),
        };
        if (ruleModal.rule) {
          await api.put(`/leave/admin/policies/${ruleModal.policy._id}/rules/${ruleModal.rule._id}`, payload);
        } else {
          await api.post(`/leave/admin/policies/${ruleModal.policy._id}/rules`, payload);
        }
        toast.success('Company default rule updated');
      } else {
        if (!ruleForm.selectedTargets || ruleForm.selectedTargets.length === 0) {
          toast.error('Please select at least one target option');
          setSaving(false);
          return;
        }

        let count = 0;
        const existingRules = ruleModal.policy.rules || [];

        for (let i = 0; i < ruleForm.selectedTargets.length; i++) {
          const target = ruleForm.selectedTargets[i];
          const payload = {
            scopeType: ruleForm.scopeType,
            scopeRef: target.id || undefined,
            scopeCode: target.code || undefined,
            days: Number(ruleForm.days),
          };

          if (i === 0 && ruleModal.rule) {
            // Update the primary rule being edited
            await api.put(`/leave/admin/policies/${ruleModal.policy._id}/rules/${ruleModal.rule._id}`, payload);
            count++;
          } else {
            // Check if a rule for this target scope already exists
            const matchRule = existingRules.find(r =>
              r.scopeType === ruleForm.scopeType &&
              ((r.scopeRef && target.id && r.scopeRef.toString() === target.id.toString()) ||
               (r.scopeCode && target.code && r.scopeCode.toUpperCase() === target.code.toUpperCase()))
            );

            if (matchRule) {
              await api.put(`/leave/admin/policies/${ruleModal.policy._id}/rules/${matchRule._id}`, payload);
              count++;
            } else {
              try {
                await api.post(`/leave/admin/policies/${ruleModal.policy._id}/rules`, payload);
                count++;
              } catch (err) {
                console.error('Save target rule error:', err);
              }
            }
          }
        }
        toast.success(`Applied entitlement rule to ${count} target(s)`);
      }

      setRuleModal({ open: false, policy: null, rule: null });
      await fetchAllData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save rule');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRule = async (policyId, ruleId) => {
    try {
      setSaving(true);
      await api.delete(`/leave/admin/policies/${policyId}/rules/${ruleId}`);
      toast.success('Scope rule deleted');
      await fetchAllData();
    } catch (err) {
      toast.error('Failed to delete rule');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteConfirmed = async () => {
    if (!deleteConfirm.id) return;
    try {
      setSaving(true);
      await api.delete(`/leave-types/${deleteConfirm.id}`);
      toast.success('Leave type deleted');
      await fetchAllData();
      setDeleteConfirm({ show: false, id: null, type: 'type' });
    } catch (err) {
      toast.error('Failed to delete');
    } finally {
      setSaving(false);
    }
  };

  const filteredLeaveTypes = useMemo(() => {
    return leaveTypes.filter(lt =>
      (lt.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (lt.code || '').toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [leaveTypes, searchQuery]);

  const totalPages = Math.ceil(filteredLeaveTypes.length / itemsPerPage);
  const paginatedData = filteredLeaveTypes.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const exportToCSV = () => {
    const headers = ['Name', 'Code', 'Limit', 'Period Type', 'Carry Forward', 'Max Carry Forward', 'Rules Count', 'Status'];
    const data = filteredLeaveTypes.map(lt => {
      const pol = policyByType(lt._id);
      return [
        lt.name,
        lt.code,
        lt.limit,
        pol?.periodType || lt.limitType,
        pol?.carryForward ? 'Yes' : 'No',
        pol?.maxCarryForward || 0,
        pol?.rules?.length || 0,
        lt.status
      ];
    });
    const csvContent = [headers, ...data].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "leave_types_and_policies.csv");
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

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
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight m-0">Leave Types & Policies</h2>
            <p className="text-slate-600 font-bold text-[13px] mt-2">Manage leave types, entitlement periods, carry forward rules, and target scope rules</p>
          </div>
          <div className="flex items-center gap-3 w-full md:w-auto">
            <button
              onClick={exportToCSV}
              className="flex items-center justify-center gap-2 bg-white text-slate-600 border border-slate-200 px-4 py-3 rounded-2xl font-bold text-sm hover:bg-slate-50 transition-all active:scale-95 shadow-sm"
            >
              <Download size={18} />
              Export CSV
            </button>
            <button
              className="flex flex-1 md:flex-none items-center justify-center gap-2 bg-indigo-600 text-white px-6 py-3 rounded-2xl font-bold text-sm shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all active:scale-95"
              onClick={() => handleOpenModal()}
            >
              <Plus size={18} />
              Add Leave Type
            </button>
          </div>
        </div>

        <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-xl overflow-hidden">
          <div className="p-6 border-b border-slate-50">
            <div className="relative max-w-md">
              <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search leave types or codes..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-50 border border-slate-100 pl-12 pr-4 py-3 rounded-2xl text-sm font-bold text-slate-700 outline-none focus:bg-white focus:border-indigo-100 transition-all shadow-sm"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse border border-slate-200">
              <thead>
                <tr className="bg-slate-50/30">
                  <th className="px-6 py-4 text-[10px] font-extrabold text-indigo-600 tracking-widest border border-slate-200 text-center">LEAVE NAME & CODE</th>
                  <th className="px-6 py-4 text-center text-[10px] font-extrabold text-indigo-600 tracking-widest border border-slate-200">STANDARD LIMIT</th>
                  <th className="px-6 py-4 text-center text-[10px] font-extrabold text-indigo-600 tracking-widest border border-slate-200">PERIOD TYPE</th>
                  <th className="px-6 py-4 text-center text-[10px] font-extrabold text-indigo-600 tracking-widest border border-slate-200">CARRY FORWARD</th>
                  <th className="px-6 py-4 text-center text-[10px] font-extrabold text-indigo-600 tracking-widest border border-slate-200">POLICY RULES</th>
                  <th className="px-6 py-4 text-center text-[10px] font-extrabold text-indigo-600 tracking-widest border border-slate-200">STATUS</th>
                  <th className="px-6 py-4 text-[10px] font-extrabold text-indigo-600 tracking-widest border border-slate-200 text-center">ACTIONS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {paginatedData.map((lt) => {
                  const pol = policyByType(lt._id);
                  const rulesCount = pol?.rules?.length || 0;
                  return (
                    <tr key={lt._id} className="hover:bg-slate-50/50 transition-colors group">
                      <td className="px-6 py-5 border border-slate-200">
                        <div className="flex items-center justify-center gap-4">
                          <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                            <FileText size={20} />
                          </div>
                          <div className="text-left">
                            <p className="text-sm font-bold text-slate-900">{lt.name}</p>
                            <p className="text-xs font-bold text-indigo-600 tracking-wider">{lt.code}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-5 text-center border border-slate-200">
                        <span className="text-sm font-bold text-slate-700">{lt.limit} Days</span>
                      </td>
                      <td className="px-6 py-5 text-center border border-slate-200">
                        <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold tracking-widest ${lt.limitType === 'Monthly' ? 'bg-indigo-50 text-indigo-600' : 'bg-amber-50 text-amber-600'}`}>
                          {pol?.periodType || (lt.limitType === 'Monthly' ? 'MONTHLY' : 'YEARLY')}
                        </span>
                      </td>
                      <td className="px-6 py-5 text-center border border-slate-200">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${pol?.carryForward ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-slate-50 text-slate-400 border-slate-200'}`}>
                          {pol?.carryForward ? `Max ${pol.maxCarryForward || 0} Days` : 'Disabled'}
                        </span>
                      </td>
                      <td className="px-6 py-5 text-center border border-slate-200">
                        <div className="flex flex-col items-center gap-1">
                          <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${rulesCount > 0 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>
                            {rulesCount > 0 ? `${rulesCount} Custom Rule${rulesCount > 1 ? 's' : ''}` : 'Default Company Rule'}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-5 text-center border border-slate-200">
                        <span className={`px-3 py-1 rounded-full text-[10px] font-bold tracking-wider border ${lt.status === 'active'
                          ? 'bg-indigo-50 text-indigo-600 border-indigo-100'
                          : 'bg-rose-50 text-rose-600 border-rose-100'
                          }`}>
                          {(lt.status || 'active').toUpperCase()}
                        </span>
                      </td>
                      <td className="px-6 py-5 border border-slate-200">
                        <div className="flex justify-center gap-2">
                          <button
                            onClick={() => handleOpenModal(lt)}
                            title="Edit Type & Policy Rules"
                            className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-indigo-50 text-indigo-600 hover:bg-indigo-600 hover:text-white transition-all text-xs font-bold shadow-sm"
                          >
                            <Edit2 size={13} />
                            <span>Edit & Rules</span>
                          </button>
                          <button
                            onClick={() => setDeleteConfirm({ show: true, id: lt._id, type: 'type' })}
                            className="p-2 rounded-xl bg-slate-50 text-slate-400 hover:bg-rose-600 hover:text-white transition-all shadow-sm"
                            title="Delete Leave Type"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filteredLeaveTypes.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-slate-400 font-bold text-sm">
                      No leave types configured yet. Click "Add Leave Type" to get started.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="p-6 border-t border-slate-50 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-400">
                Page {currentPage} of {totalPages}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="p-2 rounded-xl border border-slate-200 text-slate-600 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-50"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="p-2 rounded-xl border border-slate-200 text-slate-600 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-50"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Unified Type & Policy Modal */}
      <AnimatePresence>
        {showModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-[2.5rem] p-6 md:p-8 max-w-2xl w-full shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto no-scrollbar"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div>
                  <h3 className="text-xl font-bold text-slate-900 m-0">
                    {editingType ? `Configure ${editingType.name}` : 'Add New Leave Type'}
                  </h3>
                  <p className="text-xs font-bold text-slate-500 mt-1">Set up leave properties and target scope policy rules</p>
                </div>
                <button
                  onClick={() => setShowModal(false)}
                  className="w-9 h-9 rounded-xl bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center transition-all"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Navigation Tabs */}
              <div className="flex bg-slate-100 p-1.5 rounded-2xl gap-1">
                <button
                  type="button"
                  onClick={() => setActiveTab('type')}
                  className={`flex-1 py-2.5 rounded-xl font-bold text-xs transition-all ${activeTab === 'type' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  1. Leave Type Settings
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('policy')}
                  className={`flex-1 py-2.5 rounded-xl font-bold text-xs transition-all ${activeTab === 'policy' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  2. Policy & Scope Rules {editingType && policyByType(editingType._id)?.rules?.length ? `(${policyByType(editingType._id).rules.length})` : ''}
                </button>
              </div>

              {activeTab === 'type' ? (
                <form onSubmit={handleSaveTypeAndPolicy} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1 text-left">
                      <label className="text-[10px] font-bold text-slate-400 tracking-wider">Leave Name *</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Casual Leave"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-2xl text-xs font-bold text-slate-800 outline-none focus:bg-white focus:border-indigo-400 transition-all shadow-sm"
                      />
                    </div>

                    <div className="space-y-1 text-left">
                      <label className="text-[10px] font-bold text-slate-400 tracking-wider">Leave Code *</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. CL"
                        value={formData.code}
                        onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                        className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-2xl text-xs font-bold text-slate-800 outline-none focus:bg-white focus:border-indigo-400 transition-all shadow-sm uppercase"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-1 text-left">
                      <label className="text-[10px] font-bold text-slate-400 tracking-wider">Standard Days *</label>
                      <input
                        type="number"
                        required
                        min="0"
                        value={formData.limit}
                        onChange={(e) => setFormData({ ...formData, limit: Number(e.target.value) })}
                        className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-2xl text-xs font-bold text-slate-800 outline-none focus:bg-white focus:border-indigo-400 transition-all shadow-sm"
                      />
                    </div>

                    <div className="space-y-1 text-left relative" ref={limitTypeDropdownRef}>
                      <label className="text-[10px] font-bold text-slate-400 tracking-wider">Period Type *</label>
                      <button
                        type="button"
                        onClick={() => setLimitTypeDropdownOpen(!limitTypeDropdownOpen)}
                        className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-2xl text-xs font-bold text-slate-800 flex items-center justify-between hover:bg-white transition-all shadow-sm"
                      >
                        <span>{formData.limitType}</span>
                        <ChevronDown size={14} className={`text-slate-400 transition-transform ${limitTypeDropdownOpen ? 'rotate-180' : ''}`} />
                      </button>
                      {limitTypeDropdownOpen && (
                        <div className="absolute left-0 right-0 mt-1 bg-white border border-slate-100 rounded-2xl shadow-xl z-50 py-1 overflow-hidden">
                          {['Yearly', 'Monthly'].map(opt => (
                            <button
                              key={opt}
                              type="button"
                              onClick={() => {
                                setFormData({ ...formData, limitType: opt });
                                setPolicyFormData(prev => ({ ...prev, periodType: opt === 'Monthly' ? 'MONTHLY' : 'YEARLY' }));
                                setLimitTypeDropdownOpen(false);
                              }}
                              className="w-full px-4 py-2 text-left text-xs font-bold text-slate-700 hover:bg-indigo-50 hover:text-indigo-600 transition-colors"
                            >
                              {opt}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="space-y-1 text-left relative" ref={statusDropdownRef}>
                      <label className="text-[10px] font-bold text-slate-400 tracking-wider">Status *</label>
                      <button
                        type="button"
                        onClick={() => setStatusDropdownOpen(!statusDropdownOpen)}
                        className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-2xl text-xs font-bold text-slate-800 flex items-center justify-between hover:bg-white transition-all shadow-sm"
                      >
                        <span className="uppercase">{formData.status}</span>
                        <ChevronDown size={14} className={`text-slate-400 transition-transform ${statusDropdownOpen ? 'rotate-180' : ''}`} />
                      </button>
                      {statusDropdownOpen && (
                        <div className="absolute left-0 right-0 mt-1 bg-white border border-slate-100 rounded-2xl shadow-xl z-50 py-1 overflow-hidden">
                          {['active', 'inactive'].map(opt => (
                            <button
                              key={opt}
                              type="button"
                              onClick={() => {
                                setFormData({ ...formData, status: opt });
                                setStatusDropdownOpen(false);
                              }}
                              className="w-full px-4 py-2 text-left text-xs font-bold text-slate-700 hover:bg-indigo-50 hover:text-indigo-600 uppercase transition-colors"
                            >
                              {opt}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Allowed Application Duration Rules Multi-Select */}
                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 text-left space-y-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                      Allowed Application Duration Rules *
                    </label>
                    <p className="text-[11px] text-slate-500 font-medium m-0">
                      Select allowed application duration options for employees applying for this leave type:
                    </p>
                    <div className="flex flex-wrap gap-4 pt-1">
                      {[
                        { key: 'Full Day', label: 'Full Day' },
                        { key: 'Half Day', label: 'Half Day' },
                        { key: 'Multiple Days', label: 'Multiple Days (Date Range)' }
                      ].map((opt) => {
                        const isChecked = (formData.allowedDurations || []).includes(opt.key);
                        return (
                          <label key={opt.key} className="flex items-center gap-2 cursor-pointer bg-white px-3 py-2 rounded-xl border border-slate-200 shadow-xs hover:border-indigo-300 transition-all">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                const current = formData.allowedDurations || ['Full Day', 'Half Day', 'Multiple Days'];
                                const updated = e.target.checked
                                  ? [...current, opt.key]
                                  : current.filter(d => d !== opt.key);
                                setFormData({ ...formData, allowedDurations: updated });
                              }}
                              className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                            />
                            <span className="text-xs font-bold text-slate-800">{opt.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  <div className="pt-4 flex gap-3">
                    <button
                      type="button"
                      onClick={() => setShowModal(false)}
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
                      <span>{editingType ? 'Save & Sync Policy' : 'Save & Configure Rules'}</span>
                    </button>
                  </div>
                </form>
              ) : (
                <div className="space-y-6 text-left">
                  {editingType ? (
                    <>
                      {/* Carry Forward Policy Settings Card inside Tab 2 */}
                      <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3 text-left">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-extrabold text-slate-800 uppercase tracking-wider m-0">Carry Forward Policy Settings</p>
                          <button
                            type="button"
                            onClick={handleSavePolicySettingsOnly}
                            disabled={saving}
                            className="inline-flex items-center gap-1 px-3 py-1.5 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition-all shadow-xs"
                          >
                            {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                            <span>Save Carry Forward</span>
                          </button>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                          <label className="flex items-center gap-3 cursor-pointer bg-white p-3 rounded-xl border border-slate-200">
                            <input
                              type="checkbox"
                              checked={policyFormData.carryForward}
                              onChange={(e) => setPolicyFormData({ ...policyFormData, carryForward: e.target.checked })}
                              className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                            />
                            <span className="text-xs font-bold text-slate-800">Enable Carry Forward to Next Period</span>
                          </label>

                          {policyFormData.carryForward && (
                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-slate-400 tracking-wider">Max Carry Forward Days *</label>
                              <input
                                type="number"
                                min="0"
                                step="0.5"
                                placeholder="e.g. 5"
                                value={policyFormData.maxCarryForward}
                                onChange={(e) => setPolicyFormData({ ...policyFormData, maxCarryForward: Number(e.target.value) })}
                                className="w-full bg-white border border-slate-200 px-4 py-2.5 rounded-xl text-xs font-bold text-slate-800 outline-none focus:border-indigo-400 transition-all shadow-sm"
                              />
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="p-4 bg-indigo-50/50 rounded-2xl border border-indigo-100 flex items-center justify-between">
                        <div>
                          <p className="text-xs font-bold text-indigo-900 m-0">Policy: {editingType.name} Policy</p>
                          <p className="text-[10px] font-bold text-indigo-600 mt-0.5">
                            Period: {policyFormData.periodType} • Carry Forward: {policyFormData.carryForward ? `Max ${policyFormData.maxCarryForward} Days` : 'Disabled'}
                          </p>
                        </div>
                        <button
                          onClick={() => handleOpenRuleModal(policyByType(editingType._id))}
                          className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition-all shadow-sm"
                        >
                          <Plus size={14} />
                          <span>Add Scope Rule</span>
                        </button>
                      </div>

                      <div className="space-y-3">
                        <h4 className="text-xs font-bold text-slate-700 m-0 uppercase tracking-wider">Active Scope Entitlement Rules</h4>

                        {policyByType(editingType._id)?.rules && policyByType(editingType._id).rules.length > 0 ? (
                          <div className="space-y-2">
                            {policyByType(editingType._id).rules.map((rule) => {
                              let scopeLabel = rule.scopeType.toUpperCase();
                              let valLabel = rule.scopeCode || rule.scopeRef || '_default';

                              if (rule.scopeType === 'level' && meta.levels) {
                                const lvl = meta.levels.find(l => (l._id && rule.scopeRef && l._id.toString() === rule.scopeRef.toString()) || l.name === rule.scopeCode || String(l.levelNumber) === String(rule.scopeCode));
                                if (lvl) {
                                  valLabel = lvl.levelNumber ? `Level ${lvl.levelNumber} (${lvl.name})` : lvl.name;
                                } else if (rule.scopeCode) {
                                  valLabel = `Level ${rule.scopeCode}`;
                                }
                              } else if (rule.scopeType === 'grade' && meta.grades) {
                                const grd = meta.grades.find(g => (g._id && rule.scopeRef && g._id.toString() === rule.scopeRef.toString()) || g.code === rule.scopeCode);
                                if (grd) {
                                  valLabel = `Grade ${(grd.code || grd.name || '').toUpperCase()}`;
                                } else if (rule.scopeCode) {
                                  valLabel = `Grade ${rule.scopeCode}`;
                                }
                              } else if (rule.scopeType === 'employee' && meta.employees) {
                                const emp = meta.employees.find(e => e._id === rule.scopeRef);
                                if (emp) valLabel = `${emp.name} (${emp.email || ''})`;
                              }

                              return (
                                <div key={rule._id} className="p-3 bg-white border border-slate-200 rounded-2xl flex items-center justify-between shadow-xs">
                                  <div>
                                    <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[10px] font-extrabold uppercase mr-2">
                                      {scopeLabel}
                                    </span>
                                    <span className="text-xs font-bold text-slate-800">{valLabel}</span>
                                  </div>
                                  <div className="flex items-center gap-3">
                                    <span className="px-3 py-1 bg-emerald-50 text-emerald-700 rounded-xl text-xs font-extrabold border border-emerald-200">
                                      {rule.days} Days
                                    </span>
                                    <button
                                      onClick={() => handleOpenRuleModal(policyByType(editingType._id), rule)}
                                      className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg hover:bg-slate-100 transition-colors"
                                    >
                                      <Edit2 size={13} />
                                    </button>
                                    <button
                                      onClick={() => handleDeleteRule(policyByType(editingType._id)._id, rule._id)}
                                      className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-slate-100 transition-colors"
                                    >
                                      <Trash2 size={13} />
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="p-6 bg-slate-50 rounded-2xl text-center border border-dashed border-slate-200">
                            <p className="text-xs font-bold text-slate-500">No custom scope rules added yet.</p>
                            <p className="text-[11px] font-bold text-slate-400 mt-1">Default entitlement is driving from standard type limit ({formData.limit} Days).</p>
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="p-8 text-center text-slate-400 font-bold text-xs">
                      Please complete Step 1 (Leave Type Settings) first.
                    </div>
                  )}

                  <div className="pt-4">
                    <button
                      type="button"
                      onClick={() => setShowModal(false)}
                      className="w-full py-3 bg-indigo-600 text-white rounded-2xl font-bold text-xs hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
                    >
                      Done & Close
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Multi-Select Scope Rule Modal */}
      <AnimatePresence>
        {ruleModal.open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-[2.5rem] p-6 md:p-8 max-w-lg w-full shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto no-scrollbar"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h3 className="text-lg font-bold text-slate-900 m-0">
                    {ruleModal.rule ? 'Edit Scope Rule' : 'Add Policy Scope Rule'}
                  </h3>
                  <p className="text-[11px] font-bold text-slate-500 mt-0.5">Configure entitlement days for selected targets</p>
                </div>
                <button
                  onClick={() => setRuleModal({ open: false, policy: null, rule: null })}
                  className="w-8 h-8 rounded-xl bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center transition-all"
                >
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleSaveRule} className="space-y-4 text-left">
                {/* 1. Target Scope Type */}
                <div className="space-y-1 relative" ref={ruleScopeDropdownRef}>
                  <label className="text-[10px] font-bold text-slate-400 tracking-wider">Target Scope *</label>
                  <button
                    type="button"
                    onClick={() => setRuleScopeDropdownOpen(!ruleScopeDropdownOpen)}
                    className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-2xl text-xs font-bold text-slate-800 flex items-center justify-between hover:bg-white transition-all shadow-sm"
                  >
                    <span>{SCOPE_TYPES.find(s => s.value === ruleForm.scopeType)?.label || ruleForm.scopeType}</span>
                    <ChevronDown size={14} className={`text-slate-400 transition-transform ${ruleScopeDropdownOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {ruleScopeDropdownOpen && (
                    <div className="absolute left-0 right-0 mt-1 bg-white border border-slate-100 rounded-2xl shadow-xl z-50 py-1 max-h-48 overflow-y-auto">
                      {SCOPE_TYPES.map(opt => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => {
                            setRuleForm({ ...ruleForm, scopeType: opt.value, selectedTargets: [] });
                            setRuleScopeDropdownOpen(false);
                          }}
                          className="w-full px-4 py-2 text-left text-xs font-bold text-slate-700 hover:bg-indigo-50 hover:text-indigo-600 transition-colors flex items-center justify-between"
                        >
                          <span>{opt.label}</span>
                          {ruleForm.scopeType === opt.value && <Check size={14} className="text-indigo-600" />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* 2. Interactive Multi-Select Checkbox Dropdown */}
                {ruleForm.scopeType !== 'company' && (
                  <div className="space-y-1.5 relative" ref={targetDropdownRef}>
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-bold text-slate-400 tracking-wider">
                        Select Target {ruleForm.scopeType.toUpperCase()}S *
                      </label>
                      <span className="text-[10px] font-extrabold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md">
                        {ruleForm.selectedTargets.length} Selected
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => setTargetDropdownOpen(!targetDropdownOpen)}
                      className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-2xl text-xs font-bold text-slate-800 flex items-center justify-between hover:bg-white transition-all shadow-sm"
                    >
                      <span className="truncate max-w-[280px]">
                        {ruleForm.selectedTargets.length > 0
                          ? ruleForm.selectedTargets.map(t => t.label).join(', ')
                          : `-- Select ${ruleForm.scopeType.toUpperCase()} --`}
                      </span>
                      <ChevronDown size={14} className={`text-slate-400 transition-transform ${targetDropdownOpen ? 'rotate-180' : ''}`} />
                    </button>

                    {targetDropdownOpen && (
                      <div className="absolute left-0 right-0 mt-1 bg-white border border-slate-200 rounded-2xl shadow-2xl z-50 p-3 space-y-2 text-left">
                        {/* Search & Actions */}
                        <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                          <div className="relative flex-1">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                              type="text"
                              placeholder={`Search ${ruleForm.scopeType}...`}
                              value={targetSearchQuery}
                              onChange={(e) => setTargetSearchQuery(e.target.value)}
                              className="w-full bg-slate-50 border border-slate-200 pl-9 pr-3 py-1.5 rounded-xl text-xs font-bold text-slate-700 outline-none focus:bg-white focus:border-indigo-400"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={handleSelectAllTargets}
                            className="px-2 py-1 bg-indigo-50 text-indigo-600 rounded-lg text-[10px] font-extrabold hover:bg-indigo-100"
                          >
                            Select All
                          </button>
                          <button
                            type="button"
                            onClick={handleClearAllTargets}
                            className="px-2 py-1 bg-slate-100 text-slate-500 rounded-lg text-[10px] font-extrabold hover:bg-slate-200"
                          >
                            Clear
                          </button>
                        </div>

                        {/* Checkboxes List */}
                        <div className="max-h-48 overflow-y-auto space-y-1 no-scrollbar">
                          {filteredTargetOptions.map((opt) => {
                            const key = opt.id || opt.code;
                            const isChecked = ruleForm.selectedTargets.some(t => (t.id || t.code) === key);
                            return (
                              <label
                                key={key}
                                onClick={(e) => e.stopPropagation()}
                                className={`flex items-center gap-3 p-2 rounded-xl border transition-colors cursor-pointer text-xs font-bold ${isChecked ? 'bg-indigo-50/60 border-indigo-200 text-indigo-900' : 'bg-white border-slate-100 text-slate-700 hover:bg-slate-50'}`}
                              >
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => toggleTargetSelection(opt)}
                                  className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                                />
                                <span className="truncate">{opt.label}</span>
                              </label>
                            );
                          })}
                          {filteredTargetOptions.length === 0 && (
                            <p className="p-3 text-center text-xs font-bold text-slate-400">No matching targets found</p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* 3. Entitlement Days */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 tracking-wider">Entitlement Days *</label>
                  <input
                    type="number"
                    required
                    min="0"
                    step="0.5"
                    value={ruleForm.days}
                    onChange={(e) => setRuleForm({ ...ruleForm, days: Number(e.target.value) })}
                    className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-2xl text-xs font-bold text-slate-800 outline-none focus:bg-white focus:border-indigo-400 transition-all shadow-sm"
                  />
                </div>

                <div className="pt-4 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setRuleModal({ open: false, policy: null, rule: null })}
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
                    <span>{ruleModal.rule ? 'Save Rule' : `Apply Rule to (${ruleForm.scopeType === 'company' ? 1 : ruleForm.selectedTargets.length})`}</span>
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deleteConfirm.show && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-[2.5rem] p-6 md:p-8 max-w-md w-full shadow-2xl text-center space-y-6"
            >
              <div className="w-16 h-16 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto border-4 border-rose-100">
                <AlertTriangle size={32} />
              </div>
              <div>
                <h3 className="text-xl font-bold text-slate-900 m-0">Confirm Delete</h3>
                <p className="text-xs font-bold text-slate-500 mt-2">
                  Are you sure you want to delete this leave type and its associated policy scope rules?
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setDeleteConfirm({ show: false, id: null, type: 'type' })}
                  className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-2xl font-bold text-xs hover:bg-slate-200 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteConfirmed}
                  disabled={saving}
                  className="flex-1 py-3 bg-rose-600 text-white rounded-2xl font-bold text-xs hover:bg-rose-700 transition-all shadow-lg shadow-rose-100 flex items-center justify-center gap-2"
                >
                  {saving ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                  <span>Delete</span>
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default LeaveTypes;
