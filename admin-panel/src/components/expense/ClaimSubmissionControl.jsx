import { CalendarClock, Loader2, Power, Save, ShieldCheck } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useSelector } from 'react-redux';
import api from '../../api/axios';

/**
 * Super Admin ONLY control bar:
 * 1. Turn employee expense claim applications ON / OFF (e.g. pause during petty cash setup).
 * 2. Configure the max past-days date limit box for the Normal Claim form (default: 2 days).
 */
const ClaimSubmissionControl = ({ reqConfig, companyId, onUpdated }) => {
  const { user } = useSelector((state) => state.auth || {});
  const userRole = String(user?.role || '').trim().toLowerCase().replace(/[-\s]/g, '_');
  const userRoleCode = String(user?.roleCode || '').trim().toUpperCase().replace(/[-\s]/g, '_');

  const isSuperAdmin =
    userRole === 'superadmin' ||
    userRole === 'super_admin' ||
    userRoleCode === 'TCSA1' ||
    Boolean(user?.isSuperAdmin) ||
    user?.scope === 'GLOBAL';

  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [savingDays, setSavingDays] = useState(false);
  const [claimsEnabled, setClaimsEnabled] = useState(true);
  const [savedMaxDays, setSavedMaxDays] = useState(2);
  const [daysInput, setDaysInput] = useState('2');

  const buildConfig = useCallback(() => {
    const cid = companyId && String(companyId).toUpperCase() !== 'ALL' ? String(companyId) : '';
    if (!cid) return reqConfig || {};
    return {
      ...(reqConfig || {}),
      params: { ...(reqConfig?.params || {}), companyId: cid },
      headers: { ...(reqConfig?.headers || {}), 'x-company-id': cid },
    };
  }, [companyId, reqConfig]);

  const loadControl = useCallback(async () => {
    if (!isSuperAdmin) return;
    try {
      setLoading(true);
      const res = await api.get('/expense/claim-control', buildConfig());
      const d = res?.data?.data || {};
      const enabled = d.claimsEnabled !== false;
      const maxDays = d.normalClaimMaxPastDays === null ? null : (Number.isInteger(Number(d.normalClaimMaxPastDays)) ? Number(d.normalClaimMaxPastDays) : 2);
      setClaimsEnabled(enabled);
      setSavedMaxDays(maxDays);
      setDaysInput(maxDays === null ? '' : String(maxDays));
    } catch {
      // Keep safe defaults
    } finally {
      setLoading(false);
    }
  }, [isSuperAdmin, buildConfig]);

  useEffect(() => {
    loadControl();
  }, [loadControl]);

  if (!isSuperAdmin) return null;

  const handleToggleClaims = async () => {
    if (toggling || loading) return;
    const nextVal = !claimsEnabled;
    try {
      setToggling(true);
      const res = await api.put('/expense/claim-control', { claimsEnabled: nextVal }, buildConfig());
      const resolved = res?.data?.data?.claimsEnabled !== false;
      setClaimsEnabled(resolved);
      toast.success(
        resolved
          ? 'Expense claims turned ON — employees can apply for claims'
          : 'Expense claims turned OFF — employee claim applications are paused'
      );
      if (typeof onUpdated === 'function') onUpdated();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to update claims status');
    } finally {
      setToggling(false);
    }
  };

  const handleSaveDateLimit = async (e) => {
    if (e) e.preventDefault();
    if (savingDays || loading) return;
    const trimmed = String(daysInput ?? '').trim();
    let payloadVal = null;
    if (trimmed !== '') {
      if (!/^\d+$/.test(trimmed)) {
        toast.error('Enter a whole number of days (0 to 365) or leave blank for no limit.');
        return;
      }
      const n = Number(trimmed);
      if (n < 0 || n > 365) {
        toast.error('Date limit must be between 0 and 365 days.');
        return;
      }
      payloadVal = n;
    }
    try {
      setSavingDays(true);
      const res = await api.put('/expense/claim-control', { normalClaimMaxPastDays: payloadVal }, buildConfig());
      const resolved = res?.data?.data?.normalClaimMaxPastDays ?? null;
      setSavedMaxDays(resolved);
      setDaysInput(resolved === null ? '' : String(resolved));
      toast.success(
        resolved === null
          ? 'Normal claim date limit removed (any past date allowed)'
          : resolved === 0
            ? 'Normal claim date limit set to today only (0 past days)'
            : `Normal claim date limit set to ${resolved} past day${resolved === 1 ? '' : 's'} (+ today)`
      );
      if (typeof onUpdated === 'function') onUpdated();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to update normal claim date limit');
    } finally {
      setSavingDays(false);
    }
  };

  const activeLimitLabel =
    savedMaxDays === null
      ? 'No limit'
      : savedMaxDays === 0
        ? 'Today only (0d)'
        : `Max ${savedMaxDays} day${savedMaxDays === 1 ? '' : 's'} (+ today)`;

  return (
    <div className="bg-white rounded-3xl border border-slate-200/90 p-4 md:p-5 shadow-xs">
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        {/* Left: Super Admin Claim ON/OFF Switch */}
        <div className="flex flex-wrap items-center gap-3">
          <div
            className={`w-10 h-10 rounded-2xl border flex items-center justify-center shrink-0 ${
              claimsEnabled
                ? 'bg-emerald-50 border-emerald-200 text-emerald-600'
                : 'bg-rose-50 border-rose-200 text-rose-600'
            }`}
          >
            <ShieldCheck size={20} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold tracking-wider bg-slate-900 text-white">
                Super Admin Only
              </span>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                  claimsEnabled
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-rose-50 text-rose-700 border border-rose-200'
                }`}
              >
                {claimsEnabled ? 'Claims Active' : 'Claims Paused'}
              </span>
            </div>
            <p className="text-xs font-bold text-slate-600 m-0 mt-1">
              {claimsEnabled
                ? 'Employees can apply for expense claims.'
                : 'Employee claim applications are paused (ideal while updating petty cash).'}
            </p>
          </div>
          <button
            type="button"
            onClick={handleToggleClaims}
            disabled={loading || toggling}
            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl font-extrabold text-xs transition-all cursor-pointer shadow-sm disabled:opacity-50 ${
              claimsEnabled
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                : 'bg-rose-600 hover:bg-rose-700 text-white'
            }`}
            title="Click to turn employee claim applications ON or OFF"
          >
            {toggling || loading ? <Loader2 size={14} className="animate-spin" /> : <Power size={14} />}
            <span>{claimsEnabled ? 'Claims: ON' : 'Claims: OFF'}</span>
          </button>
        </div>

        {/* Right: Normal Claim Date Limit Box (Max Past Days) */}
        <form
          onSubmit={handleSaveDateLimit}
          className="flex flex-wrap items-center gap-2.5 pt-3 xl:pt-0 border-t xl:border-t-0 xl:border-l border-slate-200 xl:pl-5"
        >
          <div className="flex items-center gap-2">
            <CalendarClock size={17} className="text-indigo-600 shrink-0" />
            <div>
              <label htmlFor="normalClaimMaxPastDays" className="block text-[11px] font-extrabold text-slate-800 leading-tight">
                Normal Claim Date Limit (Days)
              </label>
              <span className="text-[10px] font-bold text-slate-400">
                Active: {loading ? '...' : activeLimitLabel}
              </span>
            </div>
          </div>
          <input
            id="normalClaimMaxPastDays"
            type="number"
            min="0"
            max="365"
            step="1"
            value={daysInput}
            onChange={(e) => setDaysInput(e.target.value)}
            placeholder="No limit"
            disabled={loading || savingDays}
            className="w-24 bg-slate-50 border border-slate-200 px-3 py-2 rounded-xl text-xs font-extrabold text-slate-800 text-center outline-none focus:bg-white focus:border-indigo-500 transition-all"
          />
          <button
            type="submit"
            disabled={loading || savingDays}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs shadow-sm transition-all cursor-pointer disabled:opacity-50"
          >
            {savingDays ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
            <span>Apply</span>
          </button>
        </form>
      </div>
    </div>
  );
};

export default ClaimSubmissionControl;
