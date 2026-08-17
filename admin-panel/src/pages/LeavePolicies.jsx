import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronLeft, ChevronRight,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Settings2,
  Trash2,
  X
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../api/axios';

const SCOPE_TYPES = [
  { value: 'employee', label: 'Employee', enableRef: true, enableCode: false },
  { value: 'role', label: 'Role (roleCode)', enableRef: false, enableCode: true },
  { value: 'level', label: 'Level', enableRef: true, enableCode: false },
  { value: 'grade', label: 'Grade', enableRef: true, enableCode: false },
  { value: 'department', label: 'Department', enableRef: false, enableCode: true },
  { value: 'company', label: 'Company default', enableRef: false, enableCode: false },
];

const LeavePolicies = () => {
  const [policies, setPolicies] = useState([]);
  const [leaveTypes, setLeaveTypes] = useState([]);
  const [meta, setMeta] = useState({ levels: [], grades: [], departments: [], roles: [], employees: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState(null);
  const [ruleModal, setRuleModal] = useState({ open: false, policy: null, rule: null });
  const [deleteConfirm, setDeleteConfirm] = useState({ show: false, id: null, type: '' });
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 8;
  const [activePolicyFilter, setActivePolicyFilter] = useState('all');

  const [formData, setFormData] = useState({
    leaveTypeRef: '',
    periodType: 'YEARLY',
    carryForward: false,
    maxCarryForward: 0,
    prorateNewJoiner: true,
    name: '',
  });

  const [ruleForm, setRuleForm] = useState({
    scopeType: 'employee',
    scopeRef: '',
    scopeCode: '',
    days: 12,
  });

  const [periodDropdownOpen, setPeriodDropdownOpen] = useState(false);
  const [paramDropdowns, setParamDropdowns] = useState({ scopeType: false, leaveType: false });

  const fetchAll = async () => {
    try {
      setLoading(true);
      const [policiesRes, typesRes, metaRes] = await Promise.all([
        api.get('/leave/admin/policies'),
        api.get('/leave-types'),
        api.get('/leave/admin/policies/meta'),
      ]);
      setPolicies(policiesRes.data.data);
      setLeaveTypes(typesRes.data.data);
      setMeta(metaRes.data.data);
    } catch (err) {
      toast.error('Failed to load leave policies');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const typeById = (id) => leaveTypes.find((t) => t._id === id);
  const policyByType = (typeId) => policies.find((p) => p.leaveTypeRef === typeId);

  const filteredPolicies = useMemo(() => {
    if (activePolicyFilter === 'all') return policies;
    return policies.filter((p) => p.status === activePolicyFilter);
  }, [policies, activePolicyFilter]);

  const totalPages = Math.ceil(filteredPolicies.length / itemsPerPage);
  const paginatedPolicies = filteredPolicies.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const handleOpenModal = (policy = null) => {
    if (policy) {
      setEditingPolicy(policy);
      setFormData({
        leaveTypeRef: policy.leaveTypeRef,
        periodType: policy.periodType || 'YEARLY',
        carryForward: policy.carryForward || false,
        maxCarryForward: policy.maxCarryForward || 0,
        prorateNewJoiner: policy.prorateNewJoiner !== undefined ? policy.prorateNewJoiner : true,
        name: policy.name || '',
      });
    } else {
      setEditingPolicy(null);
      setFormData({
        leaveTypeRef: '',
        periodType: 'YEARLY',
        carryForward: false,
        maxCarryForward: 0,
        prorateNewJoiner: true,
        name: '',
      });
    }
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setSaving(true);
      if (editingPolicy) {
        await api.put(`/leave/admin/policies/${editingPolicy._id}`, formData);
        toast.success('Leave policy updated');
      } else {
        if (!formData.leaveTypeRef) {
          toast.error('Please select a leave type');
          return;
        }
        await api.post('/leave/admin/policies', formData);
        toast.success('Leave policy created');
      }
      await fetchAll();
      setShowModal(false);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Action failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      if (deleteConfirm.type === 'policy') {
        await api.delete(`/leave/admin/policies/${deleteConfirm.id}`);
        toast.success('Policy deleted');
      } else if (deleteConfirm.type === 'rule') {
        await api.delete(`/leave/admin/policies/${ruleModal.policy._id}/rules/${deleteConfirm.id}`);
        toast.success('Rule deleted');
      }
      await fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Action failed');
    } finally {
      setDeleteConfirm({ show: false, id: null, type: '' });
    }
  };

  const openRuleModal = (policy, rule = null) => {
    setRuleModal({ open: true, policy, rule });
    setRuleForm(
      rule
        ? { scopeType: rule.scopeType, scopeRef: rule.scopeRef || '', scopeCode: rule.scopeCode || '', days: rule.days }
        : { scopeType: 'employee', scopeRef: '', scopeCode: '', days: 12 }
    );
    setParamDropdowns({ scopeType: false, leaveType: false });
  };

  const submitRule = async (e) => {
    e.preventDefault();
    if (!ruleModal.policy) return;
    try {
      setSaving(true);
      const payload = {
        scopeType: ruleForm.scopeType,
        days: Number(ruleForm.days),
      };
      const def = SCOPE_TYPES.find((s) => s.value === ruleForm.scopeType);
      if (def.enableRef) payload.scopeRef = ruleForm.scopeRef;
      if (def.enableCode) payload.scopeCode = ruleForm.scopeCode;

      if (!payload.scopeRef && !payload.scopeCode && payload.scopeType !== 'company') {
        toast.error('Please select a value for this scope');
        return;
      }

      if (ruleModal.rule) {
        await api.put(`/leave/admin/policies/${ruleModal.policy._id}/rules/${ruleModal.rule._id}`, payload);
        toast.success('Rule updated');
      } else {
        await api.post(`/leave/admin/policies/${ruleModal.policy._id}/rules`, payload);
        toast.success('Rule added');
      }
      await fetchAll();
      setRuleModal({ open: false, policy: null, rule: null });
    } catch (err) {
      toast.error(err.response?.data?.message || 'Action failed');
    } finally {
      setSaving(false);
    }
  };

  const scopeDef = SCOPE_TYPES.find((s) => s.value === ruleForm.scopeType);
  const scopeOptions = {
    employee: (meta.employees.length ? meta.employees : []).map((u) => ({ value: u._id, label: `${u.name}${u.designation ? ` — ${u.designation}` : ''}` })),
    role: meta.roles.map((r) => ({ value: r, label: r })),
    level: meta.levels.map((l) => ({ value: l._id, label: l.name })),
    grade: meta.grades.map((g) => ({ value: g._id, label: g.name })),
    department: meta.departments.map((d) => ({ value: d.name, label: d.name })),
    company: [{ value: '_default', label: 'All employees (default)' }],
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
            <h2 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight m-0">Leave Policies</h2>
            <p className="text-slate-600 font-bold text-[13px] mt-2">Policy-driven entitlements — role, level, grade, department or per-employee rules</p>
          </div>
          <div className="flex items-center gap-3 w-full md:w-auto">
            <button
              onClick={() => api.get('/leave/admin/policies') && toast.success('Could not refresh')}
              className="hidden"
            />
            <button
              onClick={fetchAll}
              className="flex items-center justify-center gap-2 bg-white text-slate-600 border border-slate-200 px-4 py-3 rounded-2xl font-bold text-sm hover:bg-slate-50 transition-all active:scale-95 shadow-sm"
            >
              <RefreshCw size={18} />
              Refresh
            </button>
            <button
              className="flex flex-1 md:flex-none items-center justify-center gap-2 bg-indigo-600 text-white px-6 py-3 rounded-2xl font-bold text-sm shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all active:scale-95"
              onClick={() => handleOpenModal()}
            >
              <Plus size={18} />
              New Policy
            </button>
          </div>
        </div>

        <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-xl overflow-hidden">
          <div className="p-6 border-b border-slate-50 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {['all', 'active', 'inactive'].map((f) => (
                <button
                  key={f}
                  onClick={() => { setActivePolicyFilter(f); setCurrentPage(1); }}
                  className={`px-4 py-2 rounded-2xl text-xs font-bold transition-all ${activePolicyFilter === f ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50'}`}
                >
                  {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>
            <span className="text-xs font-bold text-slate-500">{policies.length} policies</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse border border-slate-200">
              <thead>
                <tr className="bg-slate-50/30">
                  <th className="px-6 py-4 text-[10px] font-extrabold text-indigo-600 tracking-widest border border-slate-200 text-center">LEAVE TYPE</th>
                  <th className="px-6 py-4 text-center text-[10px] font-extrabold text-indigo-600 tracking-widest border border-slate-200">PERIOD</th>
                  <th className="px-6 py-4 text-center text-[10px] font-extrabold text-indigo-600 tracking-widest border border-slate-200">RULES</th>
                  <th className="px-6 py-4 text-center text-[10px] font-extrabold text-indigo-600 tracking-widest border border-slate-200">CARRY FWD</th>
                  <th className="px-6 py-4 text-center text-[10px] font-extrabold text-indigo-600 tracking-widest border border-slate-200">NEW JOINER</th>
                  <th className="px-6 py-4 text-center text-[10px] font-extrabold text-indigo-600 tracking-widest border border-slate-200">STATUS</th>
                  <th className="px-6 py-4 text-[10px] font-extrabold text-indigo-600 tracking-widest border border-slate-200 text-center">ACTIONS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {paginatedPolicies.map((p) => {
                  const lt = typeById(p.leaveTypeRef);
                  return (
                    <tr key={p._id} className="hover:bg-slate-50/50 transition-colors group">
                      <td className="px-6 py-5 border border-slate-200">
                        <div className="flex items-center justify-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                            <Settings2 size={18} />
                          </div>
                          <div>
                            <p className="text-sm font-bold text-slate-900">{lt?.name || p.name || 'Leave type'}</p>
                            <p className="text-[11px] font-bold text-slate-500">{lt?.code || ''}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-5 text-center border border-slate-200">
                        <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold tracking-widest ${p.periodType === 'MONTHLY' ? 'bg-indigo-50 text-indigo-600' : p.periodType === 'QUARTERLY' ? 'bg-violet-50 text-violet-600' : 'bg-amber-50 text-amber-600'}`}>
                          {p.periodType}
                        </span>
                      </td>
                      <td className="px-6 py-5 text-center border border-slate-200">
                        <button
                          onClick={() => openRuleModal(p)}
                          className="px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-50 text-slate-600 hover:bg-indigo-600 hover:text-white transition-all shadow-sm"
                        >
                          {p.rules?.length || 0} rules
                        </button>
                      </td>
                      <td className="px-6 py-5 text-center border border-slate-200">
                        <span className="text-sm font-bold text-slate-700">
                          {p.carryForward ? `Yes (max ${p.maxCarryForward})` : 'No'}
                        </span>
                      </td>
                      <td className="px-6 py-5 text-center border border-slate-200">
                        <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold ${p.prorateNewJoiner ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>
                          {p.prorateNewJoiner ? 'Prorated' : 'Full'}
                        </span>
                      </td>
                      <td className="px-6 py-5 text-center border border-slate-200">
                        <span className={`px-3 py-1 rounded-full text-[10px] font-bold tracking-wider border ${p.status === 'active' ? 'bg-indigo-50 text-indigo-600 border-indigo-100' : 'bg-rose-50 text-rose-600 border-rose-100'}`}>
                          {p.status.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-6 py-5 border border-slate-200">
                        <div className="flex justify-center gap-2">
                          <button
                            onClick={() => openRuleModal(p)}
                            className="p-2 rounded-xl bg-slate-50 text-slate-400 hover:bg-indigo-600 hover:text-white transition-all shadow-sm"
                            title="Manage rules"
                          >
                            <Settings2 size={14} />
                          </button>
                          <button
                            onClick={() => handleOpenModal(p)}
                            className="p-2 rounded-xl bg-slate-50 text-slate-400 hover:bg-indigo-600 hover:text-white transition-all shadow-sm"
                            title="Edit policy"
                          >
                            <Save size={14} />
                          </button>
                          <button
                            onClick={() => setDeleteConfirm({ show: true, id: p._id, type: 'policy' })}
                            className="p-2 rounded-xl bg-slate-50 text-slate-400 hover:bg-rose-600 hover:text-white transition-all shadow-sm"
                            title="Delete policy"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filteredPolicies.length === 0 && (
                  <tr>
                    <td colSpan="7" className="px-6 py-20 text-center border border-slate-200">
                      <div className="flex flex-col items-center">
                        <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-300 mb-4">
                          <Settings2 size={32} />
                        </div>
                        <p className="text-slate-400 font-bold text-sm">No leave policies configured.</p>
                        <button onClick={() => handleOpenModal()} className="mt-4 text-indigo-600 font-bold text-sm flex items-center gap-1">
                          <Plus size={16} /> Create the first policy
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {filteredPolicies.length > itemsPerPage && (
            <div className="flex justify-between items-center px-8 py-5 bg-slate-50/50 border-t border-slate-100">
              <span className="text-xs font-bold text-slate-500">
                Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, filteredPolicies.length)} of {filteredPolicies.length} entries
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="w-8 h-8 flex items-center justify-center rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-all shadow-sm"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="text-sm font-bold text-slate-700 px-2">{currentPage} / {totalPages}</span>
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="w-8 h-8 flex items-center justify-center rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-all shadow-sm"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Policy create/edit modal ── */}
      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white w-full max-w-2xl max-h-[95vh] overflow-y-auto rounded-2xl shadow-2xl flex flex-col"
            >
              <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-white z-10 shrink-0 sticky top-0">
                <div>
                  <h3 className="text-xl font-bold text-slate-900 tracking-tighter m-0">
                    {editingPolicy ? 'Edit Leave Policy' : 'New Leave Policy'}
                  </h3>
                  <p className="text-[11px] font-bold text-slate-500 mt-1">Allocation period, carry-forward and new-joiner proration</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="w-10 h-10 rounded-xl bg-white border border-slate-100 text-slate-400 flex items-center justify-center hover:bg-rose-50 hover:text-rose-500 hover:border-rose-100 transition-all shadow-sm"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="p-8">
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2 col-span-2">
                      <label className="text-[11px] font-bold text-slate-400 tracking-widest ml-1">Leave Type</label>
                      <div className="relative" ref={null}>
                        <div
                          onClick={() => setParamDropdowns({ ...paramDropdowns, leaveType: !paramDropdowns.leaveType })}
                          className={`w-full flex items-center justify-between px-5 py-4 rounded-2xl cursor-pointer border-2 transition-all ${paramDropdowns.leaveType ? 'border-indigo-100 bg-white' : 'border-transparent bg-slate-50 hover:border-indigo-50'}`}
                        >
                          <span className="text-sm font-bold text-slate-800">
                            {formData.leaveTypeRef ? typeById(formData.leaveTypeRef)?.name || 'Selected type' : 'Select a leave type...'}
                          </span>
                          <ChevronDown size={18} className={`text-slate-400 transition-transform ${paramDropdowns.leaveType ? 'rotate-180' : ''}`} />
                        </div>
                        <AnimatePresence>
                          {paramDropdowns.leaveType && (
                            <motion.div
                              initial={{ opacity: 0, y: 10, scale: 0.95 }}
                              animate={{ opacity: 1, y: 10, scale: 1 }}
                              exit={{ opacity: 0, y: 10, scale: 0.95 }}
                              className="absolute left-0 right-0 top-full mt-2 bg-white border border-slate-100 rounded-2xl shadow-xl z-50 overflow-hidden p-2 max-h-60 overflow-y-auto"
                            >
                              {leaveTypes.map((t) => (
                                <div
                                  key={t._id}
                                  onClick={() => { setFormData({ ...formData, leaveTypeRef: t._id }); setParamDropdowns({ ...paramDropdowns, leaveType: false }); }}
                                  className={`flex items-center justify-between px-4 py-3 rounded-xl cursor-pointer transition-all ${formData.leaveTypeRef === t._id ? 'bg-indigo-50 text-indigo-700' : 'hover:bg-slate-50 text-slate-700'}`}
                                >
                                  <span className="text-sm font-bold">{t.name} <span className="text-slate-400 font-bold text-xs ml-1">{t.code}</span></span>
                                  {formData.leaveTypeRef === t._id && <Check size={16} className="text-indigo-600" />}
                                </div>
                              ))}
                              {leaveTypes.length === 0 && (
                                <p className="text-center text-slate-400 font-bold text-sm py-4">No leave types. Create one first.</p>
                              )}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[11px] font-bold text-slate-400 tracking-widest ml-1">Allocation Period</label>
                      <div className="relative">
                        <div
                          onClick={() => setPeriodDropdownOpen(!periodDropdownOpen)}
                          className={`w-full flex items-center justify-between px-5 py-4 rounded-2xl cursor-pointer border-2 transition-all ${periodDropdownOpen ? 'border-indigo-100 bg-white' : 'border-transparent bg-slate-50 hover:border-indigo-50'}`}
                        >
                          <span className="text-sm font-bold text-slate-800">{formData.periodType}</span>
                          <ChevronDown size={18} className={`text-slate-400 transition-transform ${periodDropdownOpen ? 'rotate-180' : ''}`} />
                        </div>
                        <AnimatePresence>
                          {periodDropdownOpen && (
                            <motion.div
                              initial={{ opacity: 0, y: 10, scale: 0.95 }}
                              animate={{ opacity: 1, y: 10, scale: 1 }}
                              exit={{ opacity: 0, y: 10, scale: 0.95 }}
                              className="absolute left-0 right-0 top-full mt-2 bg-white border border-slate-100 rounded-2xl shadow-xl z-50 overflow-hidden p-2"
                            >
                              {['MONTHLY', 'QUARTERLY', 'YEARLY'].map((pt) => (
                                <div
                                  key={pt}
                                  onClick={() => { setFormData({ ...formData, periodType: pt }); setPeriodDropdownOpen(false); }}
                                  className={`flex items-center justify-between px-4 py-3 rounded-xl cursor-pointer transition-all ${formData.periodType === pt ? 'bg-indigo-50 text-indigo-700' : 'hover:bg-slate-50 text-slate-700'}`}
                                >
                                  <span className="text-sm font-bold">{pt.charAt(0) + pt.slice(1).toLowerCase()}</span>
                                  {formData.periodType === pt && <Check size={16} className="text-indigo-600" />}
                                </div>
                              ))}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[11px] font-bold text-slate-400 tracking-widest ml-1">Label</label>
                      <input
                        type="text"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        className="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-100 focus:bg-white px-5 py-4 rounded-2xl outline-none transition-all text-sm font-bold text-slate-800"
                        placeholder="e.g., Manager policy"
                      />
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-5 rounded-2xl border border-slate-100 bg-slate-50/50">
                      <div>
                        <p className="text-sm font-bold text-slate-800">Carry forward</p>
                        <p className="text-[11px] font-bold text-slate-500">Unused days roll into the next period</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, carryForward: !formData.carryForward })}
                        className={`w-12 h-7 rounded-full transition-all relative ${formData.carryForward ? 'bg-indigo-600' : 'bg-slate-200'}`}
                      >
                        <span className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow transition-all ${formData.carryForward ? 'left-6' : 'left-1'}`} />
                      </button>
                    </div>

                    {formData.carryForward && (
                      <div className="space-y-2 animate-fade-up">
                        <label className="text-[11px] font-bold text-slate-400 tracking-widest ml-1">Max carry-forward days</label>
                        <input
                          type="number"
                          value={formData.maxCarryForward}
                          onChange={(e) => setFormData({ ...formData, maxCarryForward: parseInt(e.target.value) || 0 })}
                          className="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-100 focus:bg-white px-5 py-4 rounded-2xl outline-none transition-all text-sm font-bold text-slate-800"
                        />
                      </div>
                    )}

                    <div className="flex items-center justify-between p-5 rounded-2xl border border-slate-100 bg-slate-50/50">
                      <div>
                        <p className="text-sm font-bold text-slate-800">Prorate new joiners</p>
                        <p className="text-[11px] font-bold text-slate-500">Entitlement is prorated for employees joining mid-period</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, prorateNewJoiner: !formData.prorateNewJoiner })}
                        className={`w-12 h-7 rounded-full transition-all relative ${formData.prorateNewJoiner ? 'bg-indigo-600' : 'bg-slate-200'}`}
                      >
                        <span className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow transition-all ${formData.prorateNewJoiner ? 'left-6' : 'left-1'}`} />
                      </button>
                    </div>
                  </div>

                  <div className="flex gap-4 pt-4">
                    <button
                      type="button"
                      onClick={() => setShowModal(false)}
                      className="flex-1 bg-slate-50 text-slate-500 font-bold py-4 rounded-2xl hover:bg-slate-100 transition-all active:scale-95"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={saving}
                      className="flex-[2] py-4 bg-indigo-600 text-white rounded-2xl font-bold text-sm shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                      {editingPolicy ? 'Update Policy' : 'Create Policy'}
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Rules manager modal ── */}
      <AnimatePresence>
        {ruleModal.open && ruleModal.policy && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white w-full max-w-3xl max-h-[95vh] overflow-y-auto rounded-2xl shadow-2xl flex flex-col"
            >
              <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-white z-10 shrink-0 sticky top-0">
                <div>
                  <h3 className="text-xl font-bold text-slate-900 tracking-tighter m-0">
                    Entitlement Rules — {typeById(ruleModal.policy.leaveTypeRef)?.name || 'Policy'}
                  </h3>
                  <p className="text-[11px] font-bold text-slate-500 mt-1">
                    Priority: Employee &gt; Role &gt; Level &gt; Grade &gt; Department &gt; Company default
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setRuleModal({ open: false, policy: null, rule: null })}
                  className="w-10 h-10 rounded-xl bg-white border border-slate-100 text-slate-400 flex items-center justify-center hover:bg-rose-50 hover:text-rose-500 hover:border-rose-100 transition-all shadow-sm"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="p-8">
                <form onSubmit={submitRule} className="grid grid-cols-12 gap-3 items-end mb-6">
                  <div className="col-span-3 space-y-2">
                    <label className="text-[11px] font-bold text-slate-400 tracking-widest ml-1">Scope</label>
                    <div className="relative">
                      <div
                        onClick={() => setParamDropdowns({ ...paramDropdowns, scopeType: !paramDropdowns.scopeType })}
                        className="w-full flex items-center justify-between px-3 py-3 rounded-2xl cursor-pointer border-2 border-transparent bg-slate-50 hover:border-indigo-50"
                      >
                        <span className="text-xs font-bold text-slate-800">{scopeDef.label}</span>
                        <ChevronDown size={14} className={`text-slate-400 transition-transform ${paramDropdowns.scopeType ? 'rotate-180' : ''}`} />
                      </div>
                      <AnimatePresence>
                        {paramDropdowns.scopeType && (
                          <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 10 }}
                            exit={{ opacity: 0, y: 10 }}
                            className="absolute left-0 right-0 top-full mt-2 bg-white border border-slate-100 rounded-2xl shadow-xl z-50 overflow-hidden p-2"
                          >
                            {SCOPE_TYPES.map((s) => (
                              <div
                                key={s.value}
                                onClick={() => {
                                  setRuleForm({ ...ruleForm, scopeType: s.value, scopeRef: s.enableRef && scopeOptions[s.value]?.[0]?.value || null, scopeCode: s.enableCode && scopeOptions[s.value]?.[0]?.value || null });
                                  setParamDropdowns({ ...paramDropdowns, scopeType: false });
                                }}
                                className={`px-3 py-2 rounded-xl cursor-pointer transition-all text-xs font-bold ${ruleForm.scopeType === s.value ? 'bg-indigo-50 text-indigo-700' : 'hover:bg-slate-50 text-slate-700'}`}
                              >
                                {s.label}
                              </div>
                            ))}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>

                  <div className="col-span-4 space-y-2">
                    <label className="text-[11px] font-bold text-slate-400 tracking-widest ml-1">Value</label>
                    <select
                      value={scopeDef.enableRef ? ruleForm.scopeRef : ruleForm.scopeCode}
                      onChange={(e) => {
                        if (scopeDef.enableRef) setRuleForm({ ...ruleForm, scopeRef: e.target.value });
                        else setRuleForm({ ...ruleForm, scopeCode: e.target.value });
                      }}
                      className="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-100 px-3 py-3 rounded-2xl outline-none transition-all text-sm font-bold text-slate-800"
                    >
                      {(scopeOptions[ruleForm.scopeType] || []).map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>

                  <div className="col-span-2 space-y-2">
                    <label className="text-[11px] font-bold text-slate-400 tracking-widest ml-1">Days</label>
                    <input
                      type="number"
                      value={ruleForm.days}
                      onChange={(e) => setRuleForm({ ...ruleForm, days: e.target.value })}
                      className="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-100 px-3 py-3 rounded-2xl outline-none transition-all text-sm font-bold text-slate-800"
                    />
                  </div>

                  <div className="col-span-3">
                    <button
                      type="submit"
                      disabled={saving}
                      className="w-full py-3 bg-indigo-600 text-white rounded-2xl font-bold text-sm shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                      {ruleModal.rule ? 'Update' : 'Add Rule'}
                    </button>
                  </div>
                </form>

                <div className="space-y-2">
                  {ruleModal.policy.rules?.map((r) => {
                    const def = SCOPE_TYPES.find((s) => s.value === r.scopeType);
                    const val = def?.enableRef ? r.scopeRef : r.scopeCode || (r.scopeType === 'company' ? 'All employees' : r.scopeCode);
                    return (
                      <div key={r._id} className="flex items-center justify-between p-4 rounded-2xl border border-slate-100 bg-slate-50/40">
                        <div className="flex items-center gap-3">
                          <span className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-indigo-50 text-indigo-600">
                            {def?.label || r.scopeType}
                          </span>
                          <span className="text-sm font-bold text-slate-800">{val}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-bold text-slate-500">{r.days} days</span>
                          <button
                            onClick={() => openRuleModal(ruleModal.policy, r)}
                            className="p-2 rounded-xl bg-white text-slate-400 hover:bg-indigo-600 hover:text-white transition-all shadow-sm"
                          >
                            <Save size={14} />
                          </button>
                          <button
                            onClick={() => setDeleteConfirm({ show: true, id: r._id, type: 'rule' })}
                            className="p-2 rounded-xl bg-white text-slate-400 hover:bg-rose-600 hover:text-white transition-all shadow-sm"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {(!ruleModal.policy.rules || ruleModal.policy.rules.length === 0) && (
                    <p className="text-center text-slate-400 font-bold text-sm py-8">
                      No rules yet. Add one above — employee-specific rules take the highest priority.
                    </p>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {deleteConfirm.show && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-sm rounded-3xl shadow-2xl p-6 flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center mb-4">
                <AlertTriangle size={32} />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-2">Confirm Deletion</h3>
              <p className="text-sm font-medium text-slate-500 mb-6">
                {deleteConfirm.type === 'policy'
                  ? 'This will delete the policy and all its entitlement rules. Leave type and history are unaffected.'
                  : 'Are you sure you want to delete this entitlement rule?'}
              </p>
              <div className="flex w-full gap-3">
                <button onClick={() => setDeleteConfirm({ show: false, id: null, type: '' })} className="flex-1 py-3 bg-slate-50 text-slate-600 rounded-xl font-bold text-sm hover:bg-slate-100 transition-all">
                  Cancel
                </button>
                <button onClick={handleDelete} className="flex-1 py-3 bg-rose-500 text-white rounded-xl font-bold text-sm shadow-lg shadow-rose-200 hover:bg-rose-600 transition-all">
                  Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};

export default LeavePolicies;