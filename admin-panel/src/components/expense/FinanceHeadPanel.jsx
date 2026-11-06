import { AnimatePresence, motion } from 'framer-motion';
import { Check, Edit2, Loader2, Plus, Search, ShieldCheck, Trash2, UserCheck, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { useSelector } from 'react-redux';
import api from '../../api/axios';

/**
 * Starting-page card + modal in Expense Management to view / assign the company's single
 * "CFO / Finance Head".
 *
 * Strictly company-wise (`companyId`):
 * - Super Admin & Company Admin: can assign, change, or remove the company's single CFO / Finance Head.
 * - HR Admin: read-only view showing the assigned CFO / Finance Head's name.
 */
const FinanceHeadPanel = ({ reqConfig, companyId, onRulesUpdated }) => {
  const { user } = useSelector((state) => state.auth);
  const userRole = String(user?.role || '').trim().toLowerCase().replace(/[-\s]/g, '_');
  const userRoleCode = String(user?.roleCode || '').trim().toUpperCase().replace(/[-\s]/g, '_');
  const deptAdminType = String(user?.departmentAdminType || user?.adminType || '').trim().toLowerCase();

  const isHRRole =
    ['hr', 'hr_admin', 'hradmin', 'dept:hr_admin', 'tcsf2a', 'tcsfa', 'tchr1'].includes(userRole) ||
    ['HR', 'HR_ADMIN', 'HRADMIN', 'DEPT:HR_ADMIN', 'TCSF2A', 'TCSFA', 'TCHR1'].includes(userRoleCode) ||
    (userRole === 'department_admin' && deptAdminType === 'hr');

  const isSuperAdmin =
    userRole === 'superadmin' ||
    userRole === 'super_admin' ||
    userRoleCode === 'TCSA1' ||
    Boolean(user?.isSuperAdmin) ||
    user?.scope === 'GLOBAL';

  const isCompanyAdmin =
    isSuperAdmin ||
    Boolean(user?.isCompanyAdmin) ||
    ['company_admin', 'companyadmin', 'admin', 'dept:management_admin', 'management_admin', 'director', 'ceo'].includes(userRole) ||
    ['TCCA1', 'COMPANY_ADMIN', 'COMPANYADMIN', 'ADMIN'].includes(userRoleCode) ||
    /CA\d*$/i.test(userRoleCode) ||
    (userRole === 'department_admin' && ['management', ''].includes(deptAdminType));

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingFullPayRule, setSavingFullPayRule] = useState(false);
  const [head, setHead] = useState(null);
  const [applyOnFullPayment, setApplyOnFullPayment] = useState(true);
  const [canEditFromServer, setCanEditFromServer] = useState(null);
  const [serverCompanyId, setServerCompanyId] = useState('');
  const [employees, setEmployees] = useState([]);
  const [loadingEmployees, setLoadingEmployees] = useState(false);
  const [selectedId, setSelectedId] = useState('');
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);

  const canEdit = canEditFromServer !== null ? Boolean(canEditFromServer && !isHRRole) : Boolean(isCompanyAdmin && !isHRRole);

  const effectiveCompanyId = useMemo(() => {
    const userComp = user?.companyId?._id || user?.companyId || user?.company?._id || user?.company || '';
    const propComp = companyId && String(companyId).toUpperCase() !== 'ALL' ? companyId : '';
    const raw = isSuperAdmin ? (propComp || serverCompanyId || userComp) : (userComp || propComp || serverCompanyId);
    return raw && String(raw).toUpperCase() !== 'ALL' ? String(raw) : '';
  }, [isSuperAdmin, companyId, serverCompanyId, user]);

  const buildConfig = useCallback((targetCompanyId = effectiveCompanyId) => {
    const cid = targetCompanyId && String(targetCompanyId).toUpperCase() !== 'ALL' ? String(targetCompanyId) : '';
    if (!cid) {
      return reqConfig || {};
    }
    return {
      ...(reqConfig || {}),
      params: { ...(reqConfig?.params || {}), companyId: cid },
      headers: { ...(reqConfig?.headers || {}), 'x-company-id': cid },
    };
  }, [effectiveCompanyId, reqConfig]);

  const fetchCompanyEmployees = useCallback(async (targetCompId) => {
    const cid = targetCompId || effectiveCompanyId;
    if (!cid) return;
    setLoadingEmployees(true);
    try {
      const cfg = buildConfig(cid);
      const empRes = await api
        .get('/expense/employees', {
          ...cfg,
          params: { ...(cfg.params || {}), limit: 1000, companyId: cid },
        })
        .catch(() => ({ data: { data: [] } }));
      const rawList = Array.isArray(empRes?.data?.data) ? empRes.data.data : [];
      const scopedList = rawList.filter((emp) => {
        const empComp = emp?.companyId?._id || emp?.companyId || emp?.company?._id || emp?.company;
        if (!empComp) return true;
        return String(empComp) === String(cid);
      });
      setEmployees(scopedList);
    } catch {
      setEmployees([]);
    } finally {
      setLoadingEmployees(false);
    }
  }, [effectiveCompanyId, buildConfig]);

  const loadFinanceHead = useCallback(async () => {
    setLoading(true);
    try {
      const cfg = buildConfig(effectiveCompanyId);
      const fhRes = await api.get('/expense/finance-head', cfg);
      const resBody = fhRes?.data || {};
      const rawData = resBody.data;
      const fh = rawData && typeof rawData === 'object' && 'financeHead' in rawData
        ? rawData.financeHead
        : (rawData && rawData._id ? rawData : null);
      const serverEditable = resBody.canEdit !== undefined
        ? Boolean(resBody.canEdit)
        : (rawData?.canEdit !== undefined ? Boolean(rawData.canEdit) : Boolean(isCompanyAdmin && !isHRRole));
      const resolvedCid = String(resBody.companyId || effectiveCompanyId || '');
      if (resolvedCid && resolvedCid !== serverCompanyId) {
        setServerCompanyId(resolvedCid);
      }

      setHead(fh);
      const cfoCfg = resBody?.cfoApprovalConfig || rawData?.cfoApprovalConfig || fh?.cfoApprovalConfig || null;
      if (cfoCfg && cfoCfg.applyOnFullPayment !== undefined) {
        setApplyOnFullPayment(cfoCfg.applyOnFullPayment !== false);
      } else {
        setApplyOnFullPayment(true);
      }
      setCanEditFromServer(serverEditable);
      setSelectedId(fh?._id ? String(fh._id) : '');

      if (serverEditable && !isHRRole && resolvedCid) {
        await fetchCompanyEmployees(resolvedCid);
      } else {
        setEmployees([]);
      }
    } catch {
      setHead(null);
      setSelectedId('');
      setEmployees([]);
    } finally {
      setLoading(false);
    }
  }, [effectiveCompanyId, isCompanyAdmin, isHRRole, buildConfig, fetchCompanyEmployees, serverCompanyId]);

  useEffect(() => {
    setHead(null);
    setSelectedId('');
    setEmployees([]);
    setSearch('');
    setModalOpen(false);
    loadFinanceHead();
  }, [companyId]);

  const filteredEmployees = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter((e) =>
      `${e.name || ''} ${e.employeeIdCode || ''} ${e.department || ''} ${e.designation || ''}`
        .toLowerCase()
        .includes(q)
    );
  }, [employees, search]);

  const openSelectorModal = async () => {
    if (!canEdit) return;
    setSelectedId(head?._id ? String(head._id) : '');
    setSearch('');
    setModalOpen(true);
    if (employees.length === 0 && !loadingEmployees) {
      await fetchCompanyEmployees(effectiveCompanyId);
    }
  };

  const handleToggleFullPaymentCfo = async () => {
    if (!canEdit || savingFullPayRule) return;
    const nextVal = !applyOnFullPayment;
    try {
      setSavingFullPayRule(true);
      const cfg = buildConfig(effectiveCompanyId);
      const res = await api.put(
        '/expense/finance-head',
        {
          applyOnFullPayment: nextVal,
          rulesOnly: true,
          companyId: effectiveCompanyId,
        },
        cfg
      );
      const updatedCfg = res?.data?.cfoApprovalConfig || res?.data?.data?.cfoApprovalConfig;
      const resolvedVal = updatedCfg?.applyOnFullPayment !== undefined ? updatedCfg.applyOnFullPayment !== false : nextVal;
      setApplyOnFullPayment(resolvedVal);
      toast.success(
        resolvedVal
          ? 'Full Payment Required CFO Approval enabled (ON)'
          : 'Full Payment Required CFO Approval disabled (OFF)'
      );
      if (typeof onRulesUpdated === 'function') {
        onRulesUpdated();
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to update Full Payment CFO approval rule');
    } finally {
      setSavingFullPayRule(false);
    }
  };

  const handleSave = async (employeeIdToSave) => {
    if (!canEdit) return;
    if (!effectiveCompanyId) {
      toast.error('Please select a company first');
      return;
    }
    try {
      setSaving(true);
      const cfg = buildConfig(effectiveCompanyId);
      const res = await api.put(
        '/expense/finance-head',
        {
          employeeId: employeeIdToSave || null,
          companyId: effectiveCompanyId,
        },
        cfg
      );
      const rawData = res?.data?.data;
      const fh = rawData && typeof rawData === 'object' && 'financeHead' in rawData
        ? rawData.financeHead
        : (rawData && rawData._id ? rawData : null);
      setHead(fh);
      setSelectedId(fh?._id ? String(fh._id) : '');
      setModalOpen(false);
      toast.success(
        res?.data?.message ||
          (fh ? `CFO / Finance Head set to ${fh.name}` : 'CFO / Finance Head removed')
      );
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to update CFO / Finance Head');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="bg-white rounded-[2rem] border border-slate-200/90 p-5 md:p-6 shadow-md transition-all">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          {/* Left: Title & workflow explanation */}
          <div className="flex items-start gap-3.5 min-w-0">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center shrink-0 shadow-2xs">
              <UserCheck size={24} />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-200 uppercase">
                  2nd-Step Approval Authority
                </span>
                <span className="text-[11px] font-bold text-slate-400">
                  (1 Per Company · Toggle ON/OFF per Claim Type in Expense Types)
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2.5 mt-1">
                <h3 className="text-base md:text-lg font-extrabold text-slate-900 m-0">
                  CFO / Finance Head Configuration
                </h3>
                <button
                  type="button"
                  onClick={canEdit ? handleToggleFullPaymentCfo : undefined}
                  disabled={!canEdit || savingFullPayRule}
                  title={canEdit ? 'Click to toggle Full Payment CFO Approval ON/OFF' : 'Full Payment CFO Approval Rule'}
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-extrabold border transition-all ${
                    applyOnFullPayment
                      ? 'bg-violet-50 text-violet-700 border-violet-200 shadow-2xs'
                      : 'bg-slate-100 text-slate-500 border-slate-200'
                  } ${canEdit ? 'cursor-pointer hover:opacity-90' : 'cursor-default'}`}
                >
                  <ShieldCheck size={13} className={applyOnFullPayment ? 'text-violet-600 shrink-0' : 'text-slate-400 shrink-0'} />
                  <span>Full Payment Required CFO Approval</span>
                  <span
                    className={`ml-0.5 px-1.5 py-0.2 rounded text-[9px] font-extrabold uppercase ${
                      applyOnFullPayment ? 'bg-violet-600 text-white' : 'bg-slate-300 text-slate-700'
                    }`}
                  >
                    {savingFullPayRule ? '...' : applyOnFullPayment ? 'ON' : 'OFF'}
                  </span>
                </button>
              </div>
              <p className="text-xs font-medium text-slate-500 m-0 mt-1">
                Step 1: Reporting Manager → Step 2: Company CFO / Finance Head (Full Payment Required CFO Approval &amp; for claim types with CFO Approval ON in Expense Types) → Accounts Admin.
              </p>
            </div>
          </div>

          {/* Right: Current Assigned CFO / Finance Head & Role-based Controls */}
          <div className="flex flex-wrap items-center justify-between sm:justify-end gap-3 shrink-0 pt-2 xl:pt-0 border-t xl:border-t-0 border-slate-100">
            {loading ? (
              <div className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-500">
                <Loader2 className="animate-spin text-indigo-600" size={16} />
                <span>Loading CFO / Finance Head...</span>
              </div>
            ) : head ? (
              <div className="flex items-center gap-3 px-4 py-2.5 rounded-2xl bg-emerald-50/70 border border-emerald-200">
                <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white font-extrabold text-xs flex items-center justify-center shrink-0 shadow-xs">
                  {String(head.name || 'F')
                    .trim()
                    .charAt(0)
                    .toUpperCase()}
                </div>
                <div className="text-left">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-700">
                      CFO / Finance Head
                    </span>
                    <ShieldCheck size={12} className="text-emerald-600 shrink-0" />
                  </div>
                  <p className="text-sm font-extrabold text-slate-900 m-0">
                    {head.name}
                  </p>
                  {canEdit && (head.employeeIdCode || head.designation || head.department) && (
                    <p className="text-[11px] font-bold text-slate-500 m-0">
                      {[head.employeeIdCode, head.designation, head.department].filter(Boolean).join(' · ')}
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900">
                <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                <div className="text-left">
                  <p className="text-xs font-extrabold m-0">No CFO / Finance Head Assigned</p>
                  <p className="text-[10px] font-semibold text-amber-700 m-0">
                    {canEdit
                      ? 'Click "Assign CFO / Finance Head" to select 1 employee for this company'
                      : 'Not assigned yet by Company Admin / Super Admin'}
                  </p>
                </div>
              </div>
            )}

            {/* Action buttons ONLY for Super Admin and Company Admin; HR Admin sees only the name */}
            {canEdit && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={openSelectorModal}
                  disabled={saving || loading}
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-md shadow-indigo-100 transition-all cursor-pointer disabled:opacity-50"
                >
                  {head ? <Edit2 size={14} /> : <Plus size={14} />}
                  <span>{head ? 'Change CFO / Finance Head' : 'Assign CFO / Finance Head'}</span>
                </button>
                {head && (
                  <button
                    type="button"
                    onClick={() => handleSave(null)}
                    disabled={saving}
                    className="p-2.5 rounded-2xl bg-rose-50 hover:bg-rose-600 text-rose-600 hover:text-white border border-rose-200 transition-all cursor-pointer disabled:opacity-50"
                    title="Remove CFO / Finance Head"
                  >
                    {saving ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal to Select / Change Company CFO / Finance Head (Super Admin & Company Admin only) */}
      <AnimatePresence>
        {modalOpen && canEdit && (
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
              className="bg-white rounded-[2.5rem] p-6 md:p-8 max-w-2xl w-full shadow-2xl space-y-5 max-h-[90vh] flex flex-col"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div>
                  <h3 className="text-xl font-bold text-slate-900 m-0">
                    {head ? 'Change CFO / Finance Head' : 'Assign CFO / Finance Head'}
                  </h3>
                  <p className="text-xs font-bold text-slate-500 mt-1 m-0">
                    Select strictly one employee from this company for 2nd-step approval of Full Payment &amp; Stock Purchase claims
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="w-9 h-9 rounded-xl bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center transition-all cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Search Input */}
              <div className="relative">
                <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search company employee by name, ID, designation, or department..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 rounded-2xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-800 outline-none focus:bg-white focus:border-indigo-400"
                />
              </div>

              {/* Employee List */}
              <div className="overflow-y-auto flex-1 max-h-80 rounded-2xl border border-slate-200 divide-y divide-slate-100">
                {loadingEmployees ? (
                  <div className="p-10 flex items-center justify-center gap-2 text-xs font-bold text-slate-500">
                    <Loader2 className="animate-spin text-indigo-600" size={18} />
                    <span>Loading company employees...</span>
                  </div>
                ) : filteredEmployees.length === 0 ? (
                  <div className="p-8 text-center text-xs font-bold text-slate-400">
                    No active employees found in this company matching your search.
                  </div>
                ) : (
                  filteredEmployees.map((emp) => {
                    const id = String(emp._id);
                    const isSelected = id === String(selectedId);
                    return (
                      <div
                        key={id}
                        onClick={() => setSelectedId(id)}
                        className={`px-4 py-3 flex items-center justify-between gap-3 cursor-pointer transition-colors ${
                          isSelected ? 'bg-indigo-50/80' : 'hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={`w-8 h-8 rounded-xl flex items-center justify-center font-extrabold text-xs shrink-0 ${
                              isSelected
                                ? 'bg-indigo-600 text-white'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {isSelected ? <Check size={14} /> : String(emp.name || 'E').trim().charAt(0).toUpperCase()}
                          </div>
                          <div className="text-left min-w-0">
                            <p className="text-xs font-extrabold text-slate-900 m-0 truncate">
                              {emp.name}
                              {emp.employeeIdCode && (
                                <span className="ml-1.5 font-mono text-[11px] font-bold text-indigo-600">
                                  ({emp.employeeIdCode})
                                </span>
                              )}
                            </p>
                            <p className="text-[11px] font-semibold text-slate-500 m-0 truncate">
                              {[emp.designation, emp.department, emp.levelNumber ? `L${emp.levelNumber}` : '']
                                .filter(Boolean)
                                .join(' · ') || 'Employee'}
                            </p>
                          </div>
                        </div>
                        {isSelected && (
                          <span className="px-2.5 py-1 rounded-lg bg-indigo-600 text-white text-[10px] font-extrabold shrink-0">
                            Selected
                          </span>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {/* Footer Buttons */}
              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-2xl font-bold text-xs hover:bg-slate-200 transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={saving || !selectedId}
                  onClick={() => handleSave(selectedId)}
                  className="flex-1 py-3 bg-indigo-600 text-white rounded-2xl font-bold text-xs hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-100 disabled:opacity-50 cursor-pointer"
                >
                  {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                  <span>Save CFO / Finance Head</span>
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default FinanceHeadPanel;
