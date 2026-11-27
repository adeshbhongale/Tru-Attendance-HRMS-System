import {
  AlertTriangle,
  Building2,
  Calendar,
  CalendarOff,
  Clock,
  Download,
  IndianRupee,
  Pencil,
  RefreshCw,
  Search,
  Users,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import toast from 'react-hot-toast';
import api from '../api/axios';
import PayrollTable from '../components/payroll/PayrollTable';
import {
  computeTotals,
  formatRupees,
  recalculateRowPreview,
} from '../components/payroll/payrollPreview';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import Spinner from '../components/ui/Spinner';

function getCurrentISTMonthValue() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === 'year')?.value || String(new Date().getFullYear());
  const m = parts.find((p) => p.type === 'month')?.value || String(new Date().getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

const PayrollPage = () => {
  const [monthValue, setMonthValue] = useState(getCurrentISTMonthValue);
  const [reloadTick, setReloadTick] = useState(0);
  const [rows, setRows] = useState([]);
  const [daysOfMonth, setDaysOfMonth] = useState(30);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);

  const [searchTerm, setSearchTerm] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL'); // 'ALL' | 'VERIFIED' | 'NEEDS_REVIEW' | 'MISSING_BASIC'

  const [lateSettings, setLateSettings] = useState({
    lateStartTime: '09:30',
    halfDayTime: '10:30',
    lateFlatAmount: 300,
    approvedLeaveMultiplier: 1,
    uninformedAbsentMultiplier: 2,
    rejectedLeaveAbsentMultiplier: 2.5,
  });
  const [isRuleModalOpen, setIsRuleModalOpen] = useState(false);
  const [ruleForm, setRuleForm] = useState({
    lateStartTime: '09:30',
    halfDayTime: '10:30',
    lateFlatAmount: '300',
  });
  const [savingRules, setSavingRules] = useState(false);

  const [isLeaveRuleModalOpen, setIsLeaveRuleModalOpen] = useState(false);
  const [leaveRuleForm, setLeaveRuleForm] = useState({
    approvedLeaveMultiplier: '1',
    uninformedAbsentMultiplier: '2',
    rejectedLeaveAbsentMultiplier: '2.5',
  });
  const [savingLeaveRules, setSavingLeaveRules] = useState(false);

  // Per-row saving/error status & revert counters
  const [rowStates, setRowStates] = useState({});
  const [revertCounters, setRevertCounters] = useState({});
  const savedRowsRef = useRef({});
  const [savedRowsSnapshot, setSavedRowsSnapshot] = useState({});

  const { year, month } = useMemo(() => {
    const [yStr, mStr] = (monthValue || '').split('-');
    const y = parseInt(yStr, 10);
    const m = parseInt(mStr, 10);
    const now = new Date();
    return {
      year: Number.isFinite(y) ? y : now.getFullYear(),
      month: Number.isFinite(m) && m >= 1 && m <= 12 ? m : now.getMonth() + 1,
    };
  }, [monthValue]);

  useEffect(() => {
    let cancelled = false;
    api
      .get('/payroll', { params: { month, year } })
      .then((res) => {
        if (cancelled) return;
        const payload = res.data?.data || {};
        const fetchedRows = Array.isArray(payload.rows) ? payload.rows : [];

        const map = {};
        fetchedRows.forEach((r) => {
          map[r.employeeObjectId] = r;
        });
        savedRowsRef.current = map;
        setSavedRowsSnapshot(map);
        setRows(fetchedRows);
        setDaysOfMonth(payload.daysOfMonth || 30);
        if (payload.settings) {
          setLateSettings({
            lateStartTime: payload.settings.lateStartTime || '09:30',
            halfDayTime: payload.settings.halfDayTime || '10:30',
            lateFlatAmount:
              payload.settings.lateFlatAmount !== undefined
                ? Number(payload.settings.lateFlatAmount)
                : 300,
            approvedLeaveMultiplier:
              payload.settings.approvedLeaveMultiplier !== undefined
                ? Number(payload.settings.approvedLeaveMultiplier)
                : 1,
            uninformedAbsentMultiplier:
              payload.settings.uninformedAbsentMultiplier !== undefined
                ? Number(payload.settings.uninformedAbsentMultiplier)
                : 2,
            rejectedLeaveAbsentMultiplier:
              payload.settings.rejectedLeaveAbsentMultiplier !== undefined
                ? Number(payload.settings.rejectedLeaveAbsentMultiplier)
                : 2.5,
          });
        }
        setRowStates({});
        setError('');
      })
      .catch((err) => {
        if (cancelled) return;
        const msg =
          err.response?.data?.message ||
          err.message ||
          'Failed to load payroll data.';
        setError(msg);
        toast.error(msg);
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [month, year, reloadTick]);

  const handleMonthChange = (e) => {
    const val = e.target.value;
    if (!val || val === monthValue) return;
    setLoading(true);
    setError('');
    setMonthValue(val);
  };

  const handleManualRefresh = () => {
    setLoading(true);
    setError('');
    setReloadTick((t) => t + 1);
  };

  // Distinct sorted departments for filter dropdown
  const departments = useMemo(() => {
    const set = new Set();
    rows.forEach((r) => {
      if (r.department && String(r.department).trim()) {
        set.add(String(r.department).trim());
      }
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const effectiveDepartmentFilter =
    departmentFilter === 'ALL' || departments.includes(departmentFilter)
      ? departmentFilter
      : 'ALL';

  // Filtered rows (Serial Number in table is 1-based after sort/filter)
  const filteredRows = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return rows.filter((r) => {
      if (
        effectiveDepartmentFilter !== 'ALL' &&
        (r.department || '') !== effectiveDepartmentFilter
      ) {
        return false;
      }
      if (statusFilter === 'VERIFIED' && !r.verified) {
        return false;
      }
      if (statusFilter === 'NEEDS_REVIEW' && r.verified) {
        return false;
      }
      if (statusFilter === 'MISSING_BASIC' && Number(r.basicPay) > 0) {
        return false;
      }
      if (q) {
        const nameMatch = String(r.name || '').toLowerCase().includes(q);
        const idMatch = String(r.employeeId || '').toLowerCase().includes(q);
        return nameMatch || idMatch;
      }
      return true;
    });
  }, [rows, effectiveDepartmentFilter, statusFilter, searchTerm]);

  const verifiedCount = useMemo(
    () => rows.filter((r) => Boolean(r.verified)).length,
    [rows]
  );
  const allRowsVerified = rows.length > 0 && verifiedCount === rows.length;
  const missingBasicPayCount = useMemo(
    () => rows.filter((r) => !(Number(r.basicPay) > 0)).length,
    [rows]
  );
  const summaryTotals = useMemo(() => computeTotals(filteredRows), [filteredRows]);
  const monthSundays = useMemo(() => {
    let count = 0;
    for (let day = 1; day <= daysOfMonth; day += 1) {
      if (new Date(Date.UTC(year, month - 1, day)).getUTCDay() === 0) count += 1;
    }
    return count;
  }, [year, month, daysOfMonth]);

  // Instant client-side preview recalculation
  const handlePreviewChange = useCallback((employeeObjectId, patch) => {
    setRows((prev) =>
      prev.map((r) =>
        r.employeeObjectId === employeeObjectId
          ? recalculateRowPreview(r, patch, lateSettings)
          : r
      )
    );
  }, [lateSettings]);

  // Persist edit to /api/payroll/entry (POST avoids PATCH CORS preflight issues) and replace row with server calculation
  const handleCommitPatch = useCallback(
    async (employeeObjectId, patch) => {
      setRowStates((prev) => ({ ...prev, [employeeObjectId]: 'saving' }));
      try {
        const res = await api.post('/payroll/entry', {
          employeeObjectId,
          month,
          year,
          ...patch,
        });
        const serverRow = res.data?.data;
        if (serverRow) {
          savedRowsRef.current = {
            ...savedRowsRef.current,
            [employeeObjectId]: serverRow,
          };
          setSavedRowsSnapshot((prev) => ({
            ...prev,
            [employeeObjectId]: serverRow,
          }));
          setRows((prev) =>
            prev.map((r) =>
              r.employeeObjectId === employeeObjectId ? serverRow : r
            )
          );
        }
        setRowStates((prev) => {
          const next = { ...prev };
          delete next[employeeObjectId];
          return next;
        });
      } catch (err) {
        const msg =
          err.response?.data?.message ||
          err.message ||
          'Failed to save payroll change.';
        toast.error(msg);

        // Revert row to last server-confirmed snapshot
        const lastSaved = savedRowsRef.current[employeeObjectId];
        if (lastSaved) {
          setRows((prev) =>
            prev.map((r) =>
              r.employeeObjectId === employeeObjectId ? lastSaved : r
            )
          );
        }
        setRevertCounters((prev) => ({
          ...prev,
          [employeeObjectId]: (prev[employeeObjectId] || 0) + 1,
        }));
        setRowStates((prev) => ({ ...prev, [employeeObjectId]: 'error' }));
        setTimeout(() => {
          setRowStates((prev) => {
            if (prev[employeeObjectId] !== 'error') return prev;
            const next = { ...prev };
            delete next[employeeObjectId];
            return next;
          });
        }, 3000);
      }
    },
    [month, year]
  );

  const handleExportExcel = async () => {
    if (!allRowsVerified) {
      toast.error(
        `Please verify all employees before exporting (${verifiedCount}/${rows.length} verified).`
      );
      return;
    }
    try {
      setExporting(true);
      const res = await api.get('/payroll/export', {
        params: { month, year },
        responseType: 'blob',
      });

      const blob = new Blob([res.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      const paddedMonth = String(month).padStart(2, '0');
      link.href = url;
      link.setAttribute('download', `Payroll_${year}-${paddedMonth}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success(`Exported Payroll_${year}-${paddedMonth}.xlsx`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to export payroll Excel.');
    } finally {
      setExporting(false);
    }
  };

  const openRuleModal = () => {
    setRuleForm({
      lateStartTime: lateSettings.lateStartTime || '09:30',
      halfDayTime: lateSettings.halfDayTime || '10:30',
      lateFlatAmount: String(lateSettings.lateFlatAmount ?? 300),
    });
    setIsRuleModalOpen(true);
  };

  const handleSaveLateRules = async (e) => {
    e.preventDefault();
    const flatNum = Number(ruleForm.lateFlatAmount);
    if (!Number.isFinite(flatNum) || flatNum < 0) {
      toast.error('Late flat amount must be 0 or greater.');
      return;
    }
    if (ruleForm.halfDayTime < ruleForm.lateStartTime) {
      toast.error('Half-day cutoff time must be on or after the late-mark start time.');
      return;
    }

    try {
      setSavingRules(true);
      const res = await api.post('/payroll/settings', {
        lateStartTime: ruleForm.lateStartTime,
        halfDayTime: ruleForm.halfDayTime,
        lateFlatAmount: flatNum,
      });
      const saved = res.data?.data || {
        lateStartTime: ruleForm.lateStartTime,
        halfDayTime: ruleForm.halfDayTime,
        lateFlatAmount: flatNum,
      };
      setLateSettings((prev) => ({ ...prev, ...saved }));
      setIsRuleModalOpen(false);
      toast.success('Late-mark rules updated.');
      setLoading(true);
      setReloadTick((t) => t + 1);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update late-mark rules.');
    } finally {
      setSavingRules(false);
    }
  };

  const openLeaveRuleModal = () => {
    setLeaveRuleForm({
      approvedLeaveMultiplier: String(lateSettings.approvedLeaveMultiplier ?? 1),
      uninformedAbsentMultiplier: String(lateSettings.uninformedAbsentMultiplier ?? 2),
      rejectedLeaveAbsentMultiplier: String(lateSettings.rejectedLeaveAbsentMultiplier ?? 2.5),
    });
    setIsLeaveRuleModalOpen(true);
  };

  const handleSaveLeaveRules = async (e) => {
    e.preventDefault();
    const appM = Number(leaveRuleForm.approvedLeaveMultiplier);
    const uninfM = Number(leaveRuleForm.uninformedAbsentMultiplier);
    const rejM = Number(leaveRuleForm.rejectedLeaveAbsentMultiplier);
    if (
      !Number.isFinite(appM) || appM < 0 ||
      !Number.isFinite(uninfM) || uninfM < 0 ||
      !Number.isFinite(rejM) || rejM < 0
    ) {
      toast.error('All leave/absent deduction multipliers must be 0 or greater.');
      return;
    }

    try {
      setSavingLeaveRules(true);
      const res = await api.post('/payroll/settings', {
        approvedLeaveMultiplier: appM,
        uninformedAbsentMultiplier: uninfM,
        rejectedLeaveAbsentMultiplier: rejM,
      });
      const saved = res.data?.data || {
        approvedLeaveMultiplier: appM,
        uninformedAbsentMultiplier: uninfM,
        rejectedLeaveAbsentMultiplier: rejM,
      };
      setLateSettings((prev) => ({ ...prev, ...saved }));
      setIsLeaveRuleModalOpen(false);
      toast.success('Leave deduction rules updated.');
      setLoading(true);
      setReloadTick((t) => t + 1);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update leave rules.');
    } finally {
      setSavingLeaveRules(false);
    }
  };

  const monthDisplayLabel = useMemo(() => {
    const d = new Date(Date.UTC(year, month - 1, 1));
    return d.toLocaleDateString('en-IN', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    });
  }, [month, year]);

  return (
    <div className="space-y-4 animate-fade-up pb-2 min-w-0 max-w-full">
      {/* 1. Top Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-11 h-11 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-100 shrink-0">
            <IndianRupee size={22} />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl md:text-2xl font-extrabold text-slate-900 tracking-tight leading-tight">
              Payroll
            </h1>
            <p className="text-xs font-medium text-slate-500 mt-0.5">
              {monthDisplayLabel} · {daysOfMonth} calendar days · {monthSundays} Sundays
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <Button
            variant="outline"
            size="sm"
            icon={RefreshCw}
            onClick={handleManualRefresh}
            disabled={loading}
            title="Refresh payroll"
          >
            Refresh
          </Button>

          <Button
            variant="primary"
            size="sm"
            icon={Download}
            loading={exporting}
            disabled={loading || rows.length === 0 || !allRowsVerified}
            onClick={handleExportExcel}
            title={
              !allRowsVerified && rows.length > 0
                ? `Verify all employees (${verifiedCount}/${rows.length}) to enable Excel export`
                : 'Export payroll to Excel'
            }
          >
            Export to Excel
          </Button>
        </div>
      </div>

      {/* 2. KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5">
        {/* Total Net Pay */}
        <div className="bg-white rounded-2xl border border-slate-200/90 px-4 py-3.5 shadow-xs">
          <p className="text-[11px] font-semibold text-slate-500">Total net pay</p>
          <p
            className={`text-2xl font-extrabold tracking-tight mt-1 tabular-nums ${
              summaryTotals.netPay < 0 ? 'text-rose-600' : 'text-slate-900'
            }`}
          >
            ₹{formatRupees(summaryTotals.netPay)}
          </p>
          <p className="text-[11px] font-medium text-slate-500 mt-1 tabular-nums">
            {filteredRows.length === rows.length
              ? `for ${rows.length} ${rows.length === 1 ? 'employee' : 'employees'}`
              : `for ${filteredRows.length} of ${rows.length} employees shown`}
          </p>
        </div>

        {/* Verified */}
        <div className="bg-white rounded-2xl border border-slate-200/90 px-4 py-3.5 shadow-xs">
          <p className="text-[11px] font-semibold text-slate-500">Verified</p>
          <p
            className={`text-2xl font-extrabold tracking-tight mt-1 tabular-nums ${
              allRowsVerified ? 'text-emerald-700' : 'text-slate-900'
            }`}
          >
            {verifiedCount} / {rows.length}
          </p>
          <p
            className={`text-[11px] font-medium mt-1 tabular-nums ${
              allRowsVerified ? 'text-emerald-600' : 'text-slate-500'
            }`}
          >
            {rows.length === 0
              ? 'No employees loaded'
              : allRowsVerified
              ? 'All verified — ready to export'
              : `${rows.length - verifiedCount} still need review`}
          </p>
        </div>

        {/* Total Deductions */}
        <div className="bg-white rounded-2xl border border-slate-200/90 px-4 py-3.5 shadow-xs">
          <p className="text-[11px] font-semibold text-slate-500">Total deductions</p>
          <p className="text-2xl font-extrabold tracking-tight text-slate-900 mt-1 tabular-nums">
            ₹{formatRupees(summaryTotals.leaveDeduction + (summaryTotals.halfDayDeduction || 0) + summaryTotals.lateDeduction + (summaryTotals.otherDeduction || 0))}
          </p>
          <p className="text-[11px] font-medium text-slate-500 mt-1 tabular-nums">
            Leave ₹{formatRupees(summaryTotals.leaveDeduction)} · Half ₹{formatRupees(summaryTotals.halfDayDeduction || 0)} · Late ₹{formatRupees(summaryTotals.lateDeduction)} · Other ₹{formatRupees(summaryTotals.otherDeduction || 0)}
          </p>
        </div>

        {/* Basic Pay Missing */}
        <button
          type="button"
          onClick={() =>
            setStatusFilter((prev) =>
              prev === 'MISSING_BASIC' ? 'ALL' : 'MISSING_BASIC'
            )
          }
          className={`text-left rounded-2xl border px-4 py-3.5 shadow-xs transition-all cursor-pointer ${
            missingBasicPayCount > 0
              ? statusFilter === 'MISSING_BASIC'
                ? 'bg-rose-100/80 border-rose-400 ring-2 ring-rose-300/60'
                : 'bg-rose-50/70 border-rose-200/90 hover:border-rose-300'
              : 'bg-emerald-50/50 border-emerald-200/80'
          }`}
        >
          <p
            className={`text-[11px] font-semibold ${
              missingBasicPayCount > 0 ? 'text-rose-700' : 'text-emerald-700'
            }`}
          >
            Basic Pay missing
          </p>
          <p
            className={`text-2xl font-extrabold tracking-tight mt-1 tabular-nums ${
              missingBasicPayCount > 0 ? 'text-rose-800' : 'text-emerald-800'
            }`}
          >
            {missingBasicPayCount} {missingBasicPayCount === 1 ? 'employee' : 'employees'}
          </p>
          <p
            className={`text-[11px] font-medium mt-1 ${
              missingBasicPayCount > 0 ? 'text-rose-600' : 'text-emerald-600'
            }`}
          >
            {missingBasicPayCount > 0
              ? 'Net pay shows ₹0 until filled'
              : 'All employees have Basic Pay'}
          </p>
        </button>
      </div>

      {/* 3. Rules Banners (both in color) */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-2xl bg-amber-50/85 border border-amber-200/85 text-amber-950 text-xs font-medium shadow-xs">
          <div className="flex items-start sm:items-center gap-2.5 min-w-0 flex-1">
            <Clock size={15} className="text-amber-600 shrink-0 mt-0.5 sm:mt-0" />
            <span className="leading-relaxed">
              <strong className="font-bold">Late-mark rule (IST):</strong> After{' '}
              <strong className="font-bold">{lateSettings.lateStartTime}</strong> = ₹{formatRupees(lateSettings.lateFlatAmount)} flat · after{' '}
              <strong className="font-bold">{lateSettings.halfDayTime}</strong> = Half-day pay (Sundays ignored)
            </span>
          </div>
          <button
            type="button"
            onClick={openRuleModal}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 text-[11px] font-bold transition-colors cursor-pointer shrink-0 shadow-2xs"
          >
            <Pencil size={12} />
            Edit
          </button>
        </div>

        <div className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-2xl bg-indigo-50/80 border border-indigo-200/85 text-indigo-950 text-xs font-medium shadow-xs">
          <div className="flex items-start sm:items-center gap-2.5 min-w-0 flex-1">
            <CalendarOff size={15} className="text-indigo-600 shrink-0 mt-0.5 sm:mt-0" />
            <span className="leading-relaxed">
              <strong className="font-bold">Leave rule:</strong> Approved ={' '}
              <strong className="font-bold">{lateSettings.approvedLeaveMultiplier}×</strong> · Absent (no leave) ={' '}
              <strong className="font-bold">{lateSettings.uninformedAbsentMultiplier}×</strong> · Rejected leave ={' '}
              <strong className="font-bold">{lateSettings.rejectedLeaveAbsentMultiplier}×</strong> day pay
            </span>
          </div>
          <button
            type="button"
            onClick={openLeaveRuleModal}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-indigo-100 text-indigo-900 border border-indigo-300 text-[11px] font-bold transition-colors cursor-pointer shrink-0 shadow-2xs"
          >
            <Pencil size={12} />
            Edit
          </button>
        </div>
      </div>

      {/* 4. Filter & Quick-Status Toolbar */}
      <div className="bg-white rounded-2xl border border-slate-200/90 px-4 py-3 shadow-xs flex flex-col xl:flex-row xl:items-center justify-between gap-3">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 flex-1 min-w-0">
          {/* Month + Year Picker */}
          <div className="relative flex items-center shrink-0">
            <Calendar
              size={15}
              className="absolute left-3 text-indigo-600 pointer-events-none"
            />
            <input
              type="month"
              value={monthValue}
              aria-label="Select payroll month and year"
              onChange={handleMonthChange}
              className="w-full sm:w-auto h-9 pl-9 pr-3 text-xs font-bold text-slate-800 bg-slate-50 hover:bg-white focus:bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
            />
          </div>

          {/* Search Box */}
          <div className="relative w-full sm:w-64">
            <Search
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
            />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search name or employee ID..."
              className="w-full h-9 pl-9 pr-8 text-xs font-medium text-slate-800 bg-slate-50 focus:bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                aria-label="Clear search"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Department Filter */}
          <div className="relative w-full sm:w-48">
            <Building2
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
            />
            <select
              value={effectiveDepartmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              aria-label="Filter by department"
              className="w-full h-9 pl-9 pr-7 text-xs font-semibold text-slate-700 bg-slate-50 focus:bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
            >
              <option value="ALL">All Departments</option>
              {departments.map((dept) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Status Filter Pills + Showing Count */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() =>
              setStatusFilter((prev) => (prev === 'VERIFIED' ? 'ALL' : 'VERIFIED'))
            }
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold border transition-all cursor-pointer ${
              statusFilter === 'VERIFIED'
                ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
            }`}
          >
            ✓ Verified
          </button>

          <button
            type="button"
            onClick={() =>
              setStatusFilter((prev) =>
                prev === 'NEEDS_REVIEW' ? 'ALL' : 'NEEDS_REVIEW'
              )
            }
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold border transition-all cursor-pointer ${
              statusFilter === 'NEEDS_REVIEW'
                ? 'bg-amber-500 text-white border-amber-500 shadow-xs'
                : 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
            }`}
          >
            • Needs review
          </button>

          <button
            type="button"
            onClick={() =>
              setStatusFilter((prev) =>
                prev === 'MISSING_BASIC' ? 'ALL' : 'MISSING_BASIC'
              )
            }
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold border transition-all cursor-pointer ${
              statusFilter === 'MISSING_BASIC'
                ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                : 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
            }`}
          >
            ! Basic Pay missing
          </button>

          {(searchTerm || effectiveDepartmentFilter !== 'ALL' || statusFilter !== 'ALL') && (
            <button
              type="button"
              onClick={() => {
                setSearchTerm('');
                setDepartmentFilter('ALL');
                setStatusFilter('ALL');
              }}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200/80 transition-colors cursor-pointer"
            >
              <X size={12} />
              Clear
            </button>
          )}

          {rows.length > 0 && (
            <span className="text-xs font-semibold text-slate-500 whitespace-nowrap tabular-nums pl-1">
              Showing {filteredRows.length} of {rows.length}
            </span>
          )}
        </div>
      </div>

      {/* Main Content States */}
      {loading ? (
        <Card>
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Spinner size="lg" />
            <p className="text-xs font-semibold text-slate-500">
              Loading payroll for {monthDisplayLabel}...
            </p>
          </div>
        </Card>
      ) : error ? (
        <Card>
          <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center">
              <AlertTriangle size={24} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Unable to load payroll</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-md">{error}</p>
            </div>
            <Button variant="primary" size="sm" icon={RefreshCw} onClick={handleManualRefresh}>
              Retry
            </Button>
          </div>
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center justify-center py-16 text-center gap-2.5">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center">
              <Users size={24} />
            </div>
            <h3 className="text-sm font-bold text-slate-800">
              No employees for this month
            </h3>
            <p className="text-xs text-slate-500 max-w-sm">
              No active or employed staff records matched {monthDisplayLabel}.
            </p>
          </div>
        </Card>
      ) : filteredRows.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center justify-center py-14 text-center gap-2">
            <Search size={22} className="text-slate-400" />
            <h3 className="text-sm font-bold text-slate-800">
              No matching employees
            </h3>
            <p className="text-xs text-slate-500">
              No employees matched your search or department filter.
            </p>
          </div>
        </Card>
      ) : (
        <>
          <PayrollTable
            rows={filteredRows}
            lateSettings={lateSettings}
            savedRowsMap={savedRowsSnapshot}
            rowStates={rowStates}
            revertCounters={revertCounters}
            onPreviewChange={handlePreviewChange}
            onCommitPatch={handleCommitPatch}
          />
          <p className="text-[11px] font-medium text-slate-500 px-1">
            Edits save automatically per row. Set every employee&apos;s <strong className="font-semibold text-slate-700">Status</strong> to <strong className="font-semibold text-emerald-700">✓ Verified</strong> to unlock Excel export.
          </p>
        </>
      )}

      {/* Edit Late-Mark Rules Modal */}
      {isRuleModalOpen && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto animate-fade-up">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                  <Clock size={18} />
                </div>
                <div>
                  <h2 className="text-sm font-extrabold text-slate-900">
                    Edit Late-Mark Rules
                  </h2>
                  <p className="text-[11px] text-slate-500">
                    Applies to all payroll calculations for this company (IST)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsRuleModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveLateRules} noValidate className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Late-Mark Start Time (IST)
                </label>
                <input
                  type="time"
                  value={ruleForm.lateStartTime}
                  onChange={(e) =>
                    setRuleForm((prev) => ({ ...prev, lateStartTime: e.target.value }))
                  }
                  className="w-full px-3 py-2 text-xs font-semibold text-slate-800 bg-slate-50 focus:bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Punch-ins strictly after this time (HH:MM) incur the flat late-mark amount.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Flat Late-Mark Deduction (₹)
                </label>
                <input
                  type="number"
                  step="any"
                  value={ruleForm.lateFlatAmount}
                  onChange={(e) =>
                    setRuleForm((prev) => ({ ...prev, lateFlatAmount: e.target.value }))
                  }
                  className="w-full px-3 py-2 text-xs font-semibold text-slate-800 bg-slate-50 focus:bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 tabular-nums"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Half-Day Cutoff Time (IST)
                </label>
                <input
                  type="time"
                  value={ruleForm.halfDayTime}
                  onChange={(e) =>
                    setRuleForm((prev) => ({ ...prev, halfDayTime: e.target.value }))
                  }
                  className="w-full px-3 py-2 text-xs font-semibold text-slate-800 bg-slate-50 focus:bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Punch-ins strictly after this time deduct half-day pay instead of the flat amount.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsRuleModalOpen(false)}
                  disabled={savingRules}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  loading={savingRules}
                >
                  Save Rules
                </Button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Edit Leave Rules Modal */}
      {isLeaveRuleModalOpen && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto animate-fade-up">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <CalendarOff size={18} />
                </div>
                <div>
                  <h2 className="text-sm font-extrabold text-slate-900">
                    Edit Leave &amp; Absent Rules
                  </h2>
                  <p className="text-[11px] text-slate-500">
                    Multiplier applied to Pay Per Day for each scenario
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsLeaveRuleModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveLeaveRules} noValidate className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Approved Leave Deduction (days pay per leave day)
                </label>
                <input
                  type="number"
                  step="any"
                  value={leaveRuleForm.approvedLeaveMultiplier}
                  onChange={(e) =>
                    setLeaveRuleForm((prev) => ({
                      ...prev,
                      approvedLeaveMultiplier: e.target.value,
                    }))
                  }
                  className="w-full px-3 py-2 text-xs font-semibold text-slate-800 bg-slate-50 focus:bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 tabular-nums"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Default: 1 day pay deduction when leave is applied &amp; approved.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Absent Without Leave / Approval (days pay per absent)
                </label>
                <input
                  type="number"
                  step="any"
                  value={leaveRuleForm.uninformedAbsentMultiplier}
                  onChange={(e) =>
                    setLeaveRuleForm((prev) => ({
                      ...prev,
                      uninformedAbsentMultiplier: e.target.value,
                    }))
                  }
                  className="w-full px-3 py-2 text-xs font-semibold text-slate-800 bg-slate-50 focus:bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 tabular-nums"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Default: 2 days pay deduction for 1 uninformed absent day.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Absent With Rejected Leave (days pay per absent)
                </label>
                <input
                  type="number"
                  step="any"
                  value={leaveRuleForm.rejectedLeaveAbsentMultiplier}
                  onChange={(e) =>
                    setLeaveRuleForm((prev) => ({
                      ...prev,
                      rejectedLeaveAbsentMultiplier: e.target.value,
                    }))
                  }
                  className="w-full px-3 py-2 text-xs font-semibold text-slate-800 bg-slate-50 focus:bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 tabular-nums"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Default: 2.5 days pay deduction when leave was rejected &amp; employee is absent.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsLeaveRuleModalOpen(false)}
                  disabled={savingLeaveRules}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  loading={savingLeaveRules}
                >
                  Save Rules
                </Button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default PayrollPage;
