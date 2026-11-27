import { AlertCircle, Info, Loader2, RotateCcw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
  PAYROLL_COLUMNS,
  buildLateTooltip,
  computeDisplayHalfDays,
  computeTotals,
  formatJoiningDateIST,
  formatRupees,
} from './payrollPreview';

const DEBOUNCE_MS = 500;

/**
 * Editable UAN input cell (strictly 12 numeric digits; Permanent employees only).
 * Training / Probation employees display '-' and cannot enter UAN until Permanent.
 */
const UanCell = ({ row, savedUan, disabled = false, disabledTitle = '', onPreview, onCommit }) => {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState(row.uan || '');
  const [errorMsg, setErrorMsg] = useState('');
  const timerRef = useRef(null);
  const lastCommittedRef = useRef(savedUan || '');

  useEffect(() => {
    lastCommittedRef.current = savedUan || '';
  }, [savedUan]);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  if (disabled) {
    return (
      <div
        title={disabledTitle}
        className="w-full px-2 py-1.5 text-xs font-semibold text-center text-slate-400 bg-slate-100/80 border border-slate-200/70 rounded-lg select-none cursor-not-allowed"
      >
        -
      </div>
    );
  }

  const flush = (rawVal) => {
    clearTimeout(timerRef.current);
    const digits = String(rawVal).replace(/\D/g, '').slice(0, 12);
    if (digits.length > 0 && digits.length !== 12) {
      setErrorMsg('Must be 12 digits');
      return;
    }
    setErrorMsg('');
    if (digits === lastCommittedRef.current) return;
    lastCommittedRef.current = digits;
    onCommit({ uan: digits });
  };

  const handleChange = (e) => {
    const digits = e.target.value.replace(/\D/g, '').slice(0, 12);
    setDraft(digits);
    onPreview({ uan: digits });
    clearTimeout(timerRef.current);
    if (digits.length === 0 || digits.length === 12) {
      setErrorMsg('');
      timerRef.current = setTimeout(() => flush(digits), DEBOUNCE_MS);
    } else {
      setErrorMsg(`${digits.length}/12 digits`);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.currentTarget.blur();
    } else if (e.key === 'Escape') {
      clearTimeout(timerRef.current);
      setDraft(lastCommittedRef.current);
      setErrorMsg('');
      onPreview({ uan: lastCommittedRef.current });
      e.currentTarget.blur();
    }
  };

  const shownValue = focused ? draft : (row.uan || '');
  const isInvalid = Boolean(errorMsg);

  return (
    <div className="flex flex-col gap-0.5">
      <input
        type="text"
        inputMode="numeric"
        maxLength={12}
        value={shownValue}
        placeholder="12-digit UAN"
        aria-label={`UAN for ${row.name}`}
        onFocus={() => {
          setDraft(row.uan || '');
          setFocused(true);
        }}
        onBlur={() => {
          setFocused(false);
          flush(draft);
        }}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        className={`w-full px-2 py-1.5 text-xs font-semibold placeholder:text-slate-400 rounded-lg outline-none transition-all tabular-nums border ${
          isInvalid
            ? 'text-rose-700 bg-rose-50/60 border-rose-400 focus:border-rose-500 focus:ring-2 focus:ring-rose-400/20'
            : 'text-slate-800 bg-slate-50/80 hover:bg-white focus:bg-white border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20'
        }`}
      />
      {isInvalid && (
        <span className="text-[9.5px] font-bold text-rose-600 leading-tight px-0.5">
          {errorMsg}
        </span>
      )}
    </div>
  );
};

/**
 * Editable Basic Pay input cell (integer >= 0).
 * Missing/zero basic pay shows placeholder '0' when empty; never saves if unchanged.
 */
const BasicPayCell = ({ row, savedBasicPay, onPreview, onCommit }) => {
  const toDisplay = (n) => (Number(n) > 0 ? String(Math.round(Number(n))) : '');
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState(() => toDisplay(row.basicPay));
  const [dirty, setDirty] = useState(false);
  const timerRef = useRef(null);
  const lastCommittedRef = useRef(Math.round(Number(savedBasicPay) || 0));

  useEffect(() => {
    lastCommittedRef.current = Math.round(Number(savedBasicPay) || 0);
  }, [savedBasicPay]);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const parseIntVal = (raw) => {
    const cleaned = String(raw).replace(/[^\d]/g, '');
    if (!cleaned) return 0;
    const n = parseInt(cleaned, 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  };

  const flush = (rawVal, wasDirty) => {
    clearTimeout(timerRef.current);
    if (!wasDirty) return;
    const nextVal = parseIntVal(rawVal);
    if (nextVal === lastCommittedRef.current) return;
    lastCommittedRef.current = nextVal;
    onCommit({ basicPay: nextVal });
  };

  const handleChange = (e) => {
    const raw = e.target.value.replace(/[^\d]/g, '');
    setDraft(raw);
    setDirty(true);
    const num = raw === '' ? 0 : parseInt(raw, 10);
    onPreview({ basicPay: num });
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => flush(raw, true), DEBOUNCE_MS);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.currentTarget.blur();
    } else if (e.key === 'Escape') {
      clearTimeout(timerRef.current);
      const rev = lastCommittedRef.current;
      setDraft(toDisplay(rev));
      setDirty(false);
      onPreview({ basicPay: rev });
      e.currentTarget.blur();
    }
  };

  const isMissingBasic = !(Number(row.basicPay) > 0);
  const shownValue = focused
    ? draft
    : (Number(row.basicPay) > 0 ? formatRupees(row.basicPay) : '');

  return (
    <input
      type="text"
      inputMode="numeric"
      value={shownValue}
      placeholder="Enter Basic Pay"
      aria-label={`Basic Pay for ${row.name}`}
      onFocus={() => {
        setDraft(toDisplay(row.basicPay));
        setDirty(false);
        setFocused(true);
      }}
      onBlur={() => {
        setFocused(false);
        flush(draft, dirty);
      }}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      className={`w-full px-2.5 py-1.5 text-xs font-semibold text-right rounded-lg outline-none transition-all tabular-nums border ${
        isMissingBasic && !focused
          ? 'text-rose-700 placeholder:text-rose-400 bg-white border-rose-300 hover:border-rose-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20'
          : 'text-slate-800 placeholder:text-slate-400 bg-slate-50/80 hover:bg-white focus:bg-white border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20'
      }`}
    />
  );
};

/**
 * Editable Leaves cell: strictly non-negative integers (0, 1, 2, 3, ...).
 * Shows integer leaves computed from backend by default; allows manual HR override and reset.
 */
const LeavesCell = ({ row, payrollSettings, savedLeaves, savedOverridden, onPreview, onCommit }) => {
  const formatLeaves = (v) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? String(Math.floor(n)) : '0';
  };

  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState(() => formatLeaves(row.leaves));
  const [dirty, setDirty] = useState(false);
  const timerRef = useRef(null);
  const lastStateRef = useRef({
    val: Math.max(0, Math.floor(Number(savedLeaves) || 0)),
    overridden: Boolean(savedOverridden),
  });

  useEffect(() => {
    lastStateRef.current = {
      val: Math.max(0, Math.floor(Number(savedLeaves) || 0)),
      overridden: Boolean(savedOverridden),
    };
  }, [savedLeaves, savedOverridden]);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const parseLeaves = (raw) => {
    const cleaned = String(raw).replace(/[^\d]/g, '');
    if (!cleaned) return 0;
    const n = parseInt(cleaned, 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  };

  const flush = (rawVal, wasDirty) => {
    clearTimeout(timerRef.current);
    if (!wasDirty) return;
    const nextVal = parseLeaves(rawVal);
    if (lastStateRef.current.overridden && nextVal === lastStateRef.current.val) {
      return;
    }
    if (!lastStateRef.current.overridden && nextVal === Math.max(0, Math.floor(Number(row.leavesComputed) || 0))) {
      return;
    }
    lastStateRef.current = { val: nextVal, overridden: true };
    onCommit({ leaves: nextVal });
  };

  const handleChange = (e) => {
    const raw = e.target.value.replace(/[^\d]/g, '');
    setDraft(raw);
    setDirty(true);
    const num = parseLeaves(raw);
    onPreview({ leaves: num });
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => flush(raw, true), DEBOUNCE_MS);
  };

  const handleReset = () => {
    clearTimeout(timerRef.current);
    const computed = Math.max(0, Math.floor(Number(row.leavesComputed) || 0));
    setDraft(formatLeaves(computed));
    setDirty(false);
    lastStateRef.current = { val: computed, overridden: false };
    onPreview({ leaves: null });
    onCommit({ leaves: null });
  };

  const handleKeyDown = (e) => {
    if (e.key === '-' || e.key === '.' || e.key === 'e' || e.key === 'E' || e.key === '+') {
      e.preventDefault();
      return;
    }
    if (e.key === 'Enter') {
      e.currentTarget.blur();
    } else if (e.key === 'Escape') {
      clearTimeout(timerRef.current);
      const rev = lastStateRef.current;
      setDraft(formatLeaves(rev.val));
      setDirty(false);
      onPreview({ leaves: rev.overridden ? rev.val : null });
      e.currentTarget.blur();
    }
  };

  const shownValue = focused ? draft : formatLeaves(row.leaves);
  const computedLeaves = Math.max(0, Math.floor(Number(row.leavesComputed) || 0));
  const computedExact =
    row.leavesComputedExact !== undefined && Number.isFinite(Number(row.leavesComputedExact))
      ? Number(row.leavesComputedExact)
      : computedLeaves;
  const bd = row.leaveBreakdown || {};
  const appDays = Number(bd.approvedLeaveDays) || 0;
  const uninfDays = Number(bd.uninformedAbsentDays) || 0;
  const rejDays = Number(bd.rejectedLeaveAbsentDays) || 0;
  const mApp = payrollSettings?.approvedLeaveMultiplier ?? 1;
  const mUninf = payrollSettings?.uninformedAbsentMultiplier ?? 2;
  const mRej = payrollSettings?.rejectedLeaveAbsentMultiplier ?? 2.5;
  const bdParts = [];
  if (appDays > 0) bdParts.push(`Approved: ${appDays} × ${mApp}`);
  if (uninfDays > 0) bdParts.push(`Absent (no leave): ${uninfDays} × ${mUninf}`);
  if (rejDays > 0) bdParts.push(`Absent (rejected): ${rejDays} × ${mRej}`);
  const breakdownStr = bdParts.length > 0 ? bdParts.join(' · ') : `Computed: ${computedExact}`;
  const tooltip = row.leavesOverridden
    ? `${breakdownStr} = ${computedExact} (Overridden to ${row.leaves})`
    : `${breakdownStr} = ${computedExact} day(s) pay`;

  return (
    <div className="flex flex-col gap-1" title={tooltip}>
      <div className="flex items-center justify-center gap-1">
        <input
          type="text"
          inputMode="numeric"
          value={shownValue}
          placeholder="0"
          aria-label={`Leaves for ${row.name}`}
          onFocus={() => {
            setDraft(formatLeaves(row.leaves));
            setDirty(false);
            setFocused(true);
          }}
          onBlur={() => {
            setFocused(false);
            flush(draft, dirty);
          }}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          className={`w-full px-2 py-1.5 text-xs font-semibold text-center rounded-lg outline-none transition-all tabular-nums border ${
            row.leavesOverridden
              ? 'bg-amber-50 border-amber-400 text-amber-950 focus:border-amber-500 focus:ring-2 focus:ring-amber-400/30'
              : 'bg-slate-50/80 hover:bg-white focus:bg-white border-slate-200 text-slate-800 placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20'
          }`}
        />
        {row.leavesOverridden && (
          <button
            type="button"
            onClick={handleReset}
            title={`Reset override (restore backend leaves: ${computedLeaves})`}
            className="p-1 rounded-md bg-amber-100 hover:bg-amber-200 text-amber-800 transition-colors shrink-0 cursor-pointer"
          >
            <RotateCcw size={13} />
          </button>
        )}
      </div>
      {(appDays > 0 || uninfDays > 0 || rejDays > 0) && (
        <div className="flex flex-col items-center gap-0.5 text-[9.5px] font-bold leading-tight whitespace-nowrap">
          {appDays > 0 && (
            <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200/70">
              {appDays} Approved
            </span>
          )}
          {uninfDays > 0 && (
            <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200/80">
              {uninfDays} Absent (No Leave)
            </span>
          )}
          {rejDays > 0 && (
            <span className="px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200/80">
              {rejDays} Rejected (Still Absent)
            </span>
          )}
        </div>
      )}
    </div>
  );
};

/**
 * Editable Late-Marks Deduction cell with override highlight, reset button, and breakdown tooltip.
 */
const LateMarksCell = ({
  row,
  lateSettings,
  savedLateDeduction,
  savedOverridden,
  onPreview,
  onCommit,
}) => {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState(() => String(Math.round(Number(row.lateDeduction) || 0)));
  const [dirty, setDirty] = useState(false);
  const timerRef = useRef(null);
  const lastStateRef = useRef({
    val: Math.round(Number(savedLateDeduction) || 0),
    overridden: Boolean(savedOverridden),
  });

  useEffect(() => {
    lastStateRef.current = {
      val: Math.round(Number(savedLateDeduction) || 0),
      overridden: Boolean(savedOverridden),
    };
  }, [savedLateDeduction, savedOverridden]);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const parseIntVal = (raw) => {
    const cleaned = String(raw).replace(/[^\d]/g, '');
    if (!cleaned) return 0;
    const n = parseInt(cleaned, 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  };

  const flush = (rawVal, wasDirty) => {
    clearTimeout(timerRef.current);
    if (!wasDirty) return;
    const nextVal = parseIntVal(rawVal);
    if (
      lastStateRef.current.overridden &&
      nextVal === lastStateRef.current.val
    ) {
      return;
    }
    if (
      !lastStateRef.current.overridden &&
      nextVal === Math.round(Number(row.lateDeductionComputed) || 0)
    ) {
      return;
    }
    lastStateRef.current = { val: nextVal, overridden: true };
    onCommit({ lateDeductionOverride: nextVal });
  };

  const handleChange = (e) => {
    const raw = e.target.value.replace(/[^\d]/g, '');
    setDraft(raw);
    setDirty(true);
    const num = raw === '' ? 0 : parseInt(raw, 10);
    onPreview({ lateDeductionOverride: num });
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => flush(raw, true), DEBOUNCE_MS);
  };

  const handleReset = () => {
    clearTimeout(timerRef.current);
    const computed = Math.round(Number(row.lateDeductionComputed) || 0);
    setDraft(String(computed));
    setDirty(false);
    lastStateRef.current = { val: computed, overridden: false };
    onPreview({ lateDeductionOverride: null });
    onCommit({ lateDeductionOverride: null });
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.currentTarget.blur();
    } else if (e.key === 'Escape') {
      clearTimeout(timerRef.current);
      const rev = lastStateRef.current;
      setDraft(String(rev.val));
      setDirty(false);
      onPreview({ lateDeductionOverride: rev.overridden ? rev.val : null });
      e.currentTarget.blur();
    }
  };

  const tooltip = buildLateTooltip(row, lateSettings);
  const shownValue = focused ? draft : formatRupees(row.lateDeduction);

  return (
    <div className="flex items-center justify-end gap-1" title={tooltip}>
      <div className="relative flex-1 min-w-[78px]">
        <input
          type="text"
          inputMode="numeric"
          value={shownValue}
          placeholder="0"
          aria-label={`Late Marks Deduction for ${row.name}`}
          onFocus={() => {
            setDraft(String(Math.round(Number(row.lateDeduction) || 0)));
            setDirty(false);
            setFocused(true);
          }}
          onBlur={() => {
            setFocused(false);
            flush(draft, dirty);
          }}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          className={`w-full px-2 py-1.5 text-xs font-semibold text-right rounded-lg outline-none transition-all tabular-nums border ${
            row.lateDeductionOverridden
              ? 'bg-amber-50 border-amber-400 text-amber-950 focus:border-amber-500 focus:ring-2 focus:ring-amber-400/30'
              : 'bg-slate-50/80 hover:bg-white focus:bg-white border-slate-200 text-slate-800 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20'
          }`}
        />
      </div>

      {row.lateDeductionOverridden ? (
        <button
          type="button"
          onClick={handleReset}
          title={`Reset override (restore computed ₹${formatRupees(row.lateDeductionComputed)})`}
          className="p-1 rounded-md bg-amber-100 hover:bg-amber-200 text-amber-800 transition-colors shrink-0 cursor-pointer"
        >
          <RotateCcw size={13} />
        </button>
      ) : (
        <span
          title={tooltip}
          className="p-1 text-slate-400 hover:text-indigo-600 transition-colors shrink-0 cursor-help"
        >
          <Info size={13} />
        </span>
      )}
    </div>
  );
};

/**
 * Generic editable integer rupee cell (PF, ESIC, PT, Advance, Loan).
 */
const EditableAmountCell = ({ value, savedValue, field, ariaLabel, disabled = false, disabledTitle = '', onPreview, onCommit }) => {
  const toDisplay = (n) => (Number(n) > 0 ? String(Math.round(Number(n))) : '');
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState(() => toDisplay(value));
  const [dirty, setDirty] = useState(false);
  const timerRef = useRef(null);
  const lastCommittedRef = useRef(Math.round(Number(savedValue) || 0));

  useEffect(() => {
    lastCommittedRef.current = Math.round(Number(savedValue) || 0);
  }, [savedValue]);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const parseIntVal = (raw) => {
    const cleaned = String(raw).replace(/[^\d]/g, '');
    if (!cleaned) return 0;
    const n = parseInt(cleaned, 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  };

  const flush = (rawVal, wasDirty) => {
    clearTimeout(timerRef.current);
    if (!wasDirty) return;
    const nextVal = parseIntVal(rawVal);
    if (nextVal === lastCommittedRef.current) return;
    lastCommittedRef.current = nextVal;
    onCommit({ [field]: nextVal });
  };

  const handleChange = (e) => {
    const raw = e.target.value.replace(/[^\d]/g, '');
    setDraft(raw);
    setDirty(true);
    const num = raw === '' ? 0 : parseInt(raw, 10);
    onPreview({ [field]: num });
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => flush(raw, true), DEBOUNCE_MS);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.currentTarget.blur();
    } else if (e.key === 'Escape') {
      clearTimeout(timerRef.current);
      const rev = lastCommittedRef.current;
      setDraft(toDisplay(rev));
      setDirty(false);
      onPreview({ [field]: rev });
      e.currentTarget.blur();
    }
  };

  const shownValue = focused ? draft : (Number(value) > 0 ? formatRupees(value) : '');

  if (disabled) {
    return (
      <div
        title={disabledTitle}
        className="w-full px-2 py-1.5 text-xs font-semibold text-right text-slate-400 bg-slate-100/80 border border-slate-200/70 rounded-lg tabular-nums select-none cursor-not-allowed"
      >
        0
      </div>
    );
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      value={shownValue}
      placeholder="0"
      aria-label={ariaLabel}
      onFocus={() => {
        setDraft(toDisplay(value));
        setDirty(false);
        setFocused(true);
      }}
      onBlur={() => {
        setFocused(false);
        flush(draft, dirty);
      }}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      className="w-full px-2 py-1.5 text-xs font-semibold text-right text-slate-800 placeholder:text-slate-400 bg-slate-50/80 hover:bg-white focus:bg-white border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 rounded-lg outline-none transition-all tabular-nums"
    />
  );
};

/**
 * Editable auto-computed rupee cell with override highlight and reset button
 * (used for Statutory Total and Retention).
 */
const OverridableAmountCell = ({
  value,
  computedValue,
  overridden,
  savedValue,
  savedOverridden,
  patchKey,
  ariaLabel,
  tooltip,
  disabled = false,
  disabledTitle = '',
  onPreview,
  onCommit,
}) => {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState(() => String(Math.round(Number(value) || 0)));
  const [dirty, setDirty] = useState(false);
  const timerRef = useRef(null);
  const lastStateRef = useRef({
    val: Math.round(Number(savedValue) || 0),
    overridden: Boolean(savedOverridden),
  });

  useEffect(() => {
    lastStateRef.current = {
      val: Math.round(Number(savedValue) || 0),
      overridden: Boolean(savedOverridden),
    };
  }, [savedValue, savedOverridden]);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const parseIntVal = (raw) => {
    const cleaned = String(raw).replace(/[^\d]/g, '');
    if (!cleaned) return 0;
    const n = parseInt(cleaned, 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  };

  const flush = (rawVal, wasDirty) => {
    clearTimeout(timerRef.current);
    if (!wasDirty) return;
    const nextVal = parseIntVal(rawVal);
    if (lastStateRef.current.overridden && nextVal === lastStateRef.current.val) {
      return;
    }
    if (!lastStateRef.current.overridden && nextVal === Math.round(Number(computedValue) || 0)) {
      return;
    }
    lastStateRef.current = { val: nextVal, overridden: true };
    onCommit({ [patchKey]: nextVal });
  };

  const handleChange = (e) => {
    const raw = e.target.value.replace(/[^\d]/g, '');
    setDraft(raw);
    setDirty(true);
    const num = raw === '' ? 0 : parseInt(raw, 10);
    onPreview({ [patchKey]: num });
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => flush(raw, true), DEBOUNCE_MS);
  };

  const handleReset = () => {
    clearTimeout(timerRef.current);
    const comp = Math.round(Number(computedValue) || 0);
    setDraft(String(comp));
    setDirty(false);
    lastStateRef.current = { val: comp, overridden: false };
    onPreview({ [patchKey]: null });
    onCommit({ [patchKey]: null });
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.currentTarget.blur();
    } else if (e.key === 'Escape') {
      clearTimeout(timerRef.current);
      const rev = lastStateRef.current;
      setDraft(String(rev.val));
      setDirty(false);
      onPreview({ [patchKey]: rev.overridden ? rev.val : null });
      e.currentTarget.blur();
    }
  };

  const shownValue = focused ? draft : formatRupees(value);

  if (disabled) {
    return (
      <div
        title={disabledTitle}
        className="w-full px-2 py-1.5 text-xs font-semibold text-right text-slate-400 bg-slate-100/80 border border-slate-200/70 rounded-lg tabular-nums select-none cursor-not-allowed"
      >
        0
      </div>
    );
  }

  return (
    <div className="flex items-center justify-end gap-1" title={tooltip}>
      <input
        type="text"
        inputMode="numeric"
        value={shownValue}
        placeholder="0"
        aria-label={ariaLabel}
        onFocus={() => {
          setDraft(String(Math.round(Number(value) || 0)));
          setDirty(false);
          setFocused(true);
        }}
        onBlur={() => {
          setFocused(false);
          flush(draft, dirty);
        }}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        className={`w-full px-2 py-1.5 text-xs font-semibold text-right rounded-lg outline-none transition-all tabular-nums border ${
          overridden
            ? 'bg-amber-50 border-amber-400 text-amber-950 focus:border-amber-500 focus:ring-2 focus:ring-amber-400/30'
            : 'bg-slate-50/80 hover:bg-white focus:bg-white border-slate-200 text-slate-800 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20'
        }`}
      />
      {overridden && (
        <button
          type="button"
          onClick={handleReset}
          title={`Reset override (restore computed ₹${formatRupees(computedValue)})`}
          className="p-1 rounded-md bg-amber-100 hover:bg-amber-200 text-amber-800 transition-colors shrink-0 cursor-pointer"
        >
          <RotateCcw size={12} />
        </button>
      )}
    </div>
  );
};

const PayrollTable = ({
  rows,
  lateSettings,
  savedRowsMap,
  rowStates,
  revertCounters,
  onPreviewChange,
  onCommitPatch,
}) => {
  const totals = computeTotals(rows);

  const topSingleBeforeGroup = PAYROLL_COLUMNS.slice(0, 16);
  const deductionCols = PAYROLL_COLUMNS.slice(16, 20);
  const netPayCol = PAYROLL_COLUMNS[20];
  const statutoryCols = PAYROLL_COLUMNS.slice(21, 25);
  const postStatutoryCols = PAYROLL_COLUMNS.slice(25, 30); // Final Pay, Retention, Advance, Loan, Bank Pay
  const verifiedCol = PAYROLL_COLUMNS[30];
  const verifiedCount = rows.filter((r) => Boolean(r.verified)).length;
  const allDisplayedVerified = rows.length > 0 && verifiedCount === rows.length;

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden max-w-full">
      <div className="overflow-auto max-h-[calc(100vh-180px)] w-full">
        <table className="w-full border-separate border-spacing-0 text-xs">
          <thead className="sticky top-0 z-30 bg-slate-100 text-slate-700">
            {/* Header Row 1 */}
            <tr>
              {topSingleBeforeGroup.map((col) => {
                const isSticky = col.stickyLeft !== undefined;
                const alignCls =
                  col.align === 'right'
                    ? 'text-right'
                    : col.align === 'center'
                    ? 'text-center'
                    : 'text-left';
                return (
                  <th
                    key={col.key}
                    rowSpan={2}
                    style={isSticky ? { left: `${col.stickyLeft}px` } : undefined}
                    className={`px-2 py-2.5 font-bold uppercase tracking-wide text-xs leading-tight border-b border-r border-slate-200 bg-slate-100 ${col.widthClass} ${alignCls} ${
                      isSticky ? 'sticky z-40' : ''
                    } ${col.lastSticky ? 'shadow-[4px_0_8px_-2px_rgba(15,23,42,0.12)]' : ''}`}
                  >
                    <div className="flex flex-col gap-0.5">
                      <span>{col.label}</span>
                      {col.editable && (
                        <span className="text-[10px] font-semibold text-indigo-600 normal-case tracking-normal">
                          Editable
                        </span>
                      )}
                    </div>
                  </th>
                );
              })}

              <th
                colSpan={4}
                className="px-2 py-2 font-bold uppercase tracking-wide text-xs text-center border-b border-r border-slate-200 bg-rose-50/70 text-rose-900"
              >
                Deduction
              </th>

              <th
                rowSpan={2}
                className={`px-2 py-2.5 font-bold uppercase tracking-wide text-xs text-right border-b border-r border-slate-200 bg-emerald-50/70 text-emerald-950 ${netPayCol.widthClass}`}
              >
                {netPayCol.label}
              </th>

              <th
                colSpan={4}
                className="px-2 py-2 font-bold uppercase tracking-wide text-xs text-center border-b border-r border-slate-200 bg-sky-50/80 text-sky-900"
              >
                Statutory
              </th>

              {postStatutoryCols.map((col) => (
                <th
                  key={col.key}
                  rowSpan={2}
                  className={`px-2 py-2.5 font-bold uppercase tracking-wide text-xs text-right border-b border-r border-slate-200 ${
                    col.key === 'bankPay'
                      ? 'bg-emerald-100/70 text-emerald-950'
                      : col.key === 'finalPay'
                      ? 'bg-indigo-50/70 text-indigo-950'
                      : 'bg-slate-100 text-slate-700'
                  } ${col.widthClass}`}
                >
                  <div className="flex flex-col items-end gap-0.5">
                    <span>{col.label}</span>
                    {col.editable && (
                      <span className="text-[10px] font-semibold text-indigo-600 normal-case tracking-normal">
                        Editable
                      </span>
                    )}
                  </div>
                </th>
              ))}

              <th
                rowSpan={2}
                className={`px-2 py-2.5 font-bold uppercase tracking-wide text-xs text-center border-b border-slate-200 bg-slate-100 text-slate-700 ${verifiedCol.widthClass}`}
              >
                <div className="flex flex-col items-center gap-0.5">
                  <span>{verifiedCol.label}</span>
                  <span
                    className={`text-[10px] font-bold normal-case tracking-normal ${
                      allDisplayedVerified ? 'text-emerald-600' : 'text-amber-600'
                    }`}
                  >
                    {verifiedCount}/{rows.length}
                  </span>
                </div>
              </th>
            </tr>

            {/* Header Row 2 (Deduction & Statutory sub-columns) */}
            <tr>
              {deductionCols.map((col) => (
                <th
                  key={col.key}
                  className={`px-2 py-2 font-bold uppercase tracking-wide text-[11px] text-right border-b border-r border-slate-200 bg-rose-50/50 text-rose-900 ${col.widthClass}`}
                >
                  <div className="flex flex-col items-end gap-0.5">
                    <span>{col.label}</span>
                    {col.editable && (
                      <span className="text-[10px] font-semibold text-indigo-600 normal-case tracking-normal">
                        Override
                      </span>
                    )}
                  </div>
                </th>
              ))}
              {statutoryCols.map((col) => (
                <th
                  key={col.key}
                  className={`px-2 py-2 font-bold uppercase tracking-wide text-[11px] text-right border-b border-r border-slate-200 bg-sky-50/50 text-sky-900 ${col.widthClass}`}
                >
                  <div className="flex flex-col items-end gap-0.5">
                    <span>{col.label}</span>
                    {col.editable && (
                      <span className="text-[10px] font-semibold text-indigo-600 normal-case tracking-normal">
                        Editable
                      </span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>

          <tbody className="[&_td]:border-b [&_td]:border-slate-100">
            {rows.map((row, idx) => {
              const id = row.employeeObjectId;
              const saved = savedRowsMap[id] || row;
              const status = rowStates[id];
              const revCount = revertCounters[id] || 0;
              const isVerified = Boolean(row.verified);
              const isMissingBasic = !(Number(row.basicPay) > 0);
              const empStatus = row.employmentStatus || 'Training';
              const isPermanent = empStatus.toLowerCase() === 'permanent';
              const rowBg = isVerified
                ? 'bg-emerald-100'
                : isMissingBasic
                ? 'bg-rose-50'
                : idx % 2 === 0
                ? 'bg-white'
                : 'bg-slate-50';
              const rowHoverBg = isVerified
                ? 'hover:bg-emerald-200/70'
                : isMissingBasic
                ? 'hover:bg-rose-100/70'
                : 'hover:bg-indigo-50/40';
              const stickyHoverBg = isVerified
                ? 'group-hover:bg-emerald-200'
                : isMissingBasic
                ? 'group-hover:bg-rose-100'
                : 'group-hover:bg-indigo-50';

              return (
                <tr
                  key={id}
                  className={`${rowBg} ${rowHoverBg} transition-colors group`}
                >
                  {/* 1. Serial Number */}
                  <td
                    style={{ left: '0px' }}
                    className={`sticky z-20 w-[46px] min-w-[46px] max-w-[46px] px-1.5 py-2 text-center font-semibold text-slate-500 border-b border-r border-slate-100 ${rowBg} ${stickyHoverBg} tabular-nums`}
                  >
                    {idx + 1}
                  </td>

                  {/* 2. Employee ID */}
                  <td
                    style={{ left: '46px' }}
                    className={`sticky z-20 w-[104px] min-w-[104px] max-w-[104px] px-2 py-2 font-bold text-indigo-700 border-b border-r border-slate-100 ${rowBg} ${stickyHoverBg} whitespace-nowrap`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="truncate">{row.employeeId || '-'}</span>
                      {status === 'saving' && (
                        <span
                          title="Saving..."
                          className="inline-flex items-center gap-1 text-[10px] font-semibold text-indigo-600"
                        >
                          <Loader2 size={12} className="animate-spin" />
                        </span>
                      )}
                      {status === 'error' && (
                        <span title="Failed to save" className="text-rose-600">
                          <AlertCircle size={13} />
                        </span>
                      )}
                    </div>
                  </td>

                  {/* 3. Name */}
                  <td
                    style={{ left: '150px' }}
                    className={`sticky z-20 w-[145px] min-w-[145px] max-w-[145px] px-2 py-2 font-bold text-slate-900 border-b border-r border-slate-200 ${rowBg} ${stickyHoverBg} shadow-[4px_0_8px_-2px_rgba(15,23,42,0.10)]`}
                  >
                    <div className="flex flex-col gap-0.5">
                      <div className="truncate max-w-[130px]" title={row.name}>
                        {row.name || '-'}
                      </div>
                      <span
                        className={`self-start px-1.5 py-0.25 rounded text-[9px] font-bold leading-tight border ${
                          isPermanent
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : empStatus === 'Probation'
                            ? 'bg-amber-50 text-amber-800 border-amber-200'
                            : 'bg-sky-50 text-sky-700 border-sky-200'
                        }`}
                      >
                        {empStatus}
                      </span>
                    </div>
                  </td>

                  {/* 4. Designation */}
                  <td className="px-2 py-2 text-slate-600 border-r border-slate-100 max-w-[135px]">
                    <div className="truncate" title={row.designation || '-'}>
                      {row.designation || '-'}
                    </div>
                  </td>

                  {/* 5. Department */}
                  <td className="px-2 py-2 text-slate-600 border-r border-slate-100 max-w-[125px]">
                    <div className="truncate" title={row.department || '-'}>
                      {row.department || '-'}
                    </div>
                  </td>

                  {/* 6. Date of Joining (DD-MM-YYYY) */}
                  <td className="px-2 py-2 text-center text-slate-700 font-medium border-r border-slate-100 whitespace-nowrap tabular-nums">
                    {formatJoiningDateIST(row.dateOfJoining)}
                  </td>

                  {/* 7. UAN No. (Permanent only, 12 numeric digits) */}
                  <td className="px-1.5 py-1.5 border-r border-slate-100">
                    <UanCell
                      key={`uan-${id}-${revCount}`}
                      row={row}
                      savedUan={saved.uan}
                      disabled={!isPermanent}
                      disabledTitle={`UAN not applicable in ${empStatus} phase (available once Permanent)`}
                      onPreview={(patch) => onPreviewChange(id, patch)}
                      onCommit={(patch) => onCommitPatch(id, patch)}
                    />
                  </td>

                  {/* 8. Basic Pay (Editable) */}
                  <td className="px-1.5 py-1.5 border-r border-slate-100">
                    <BasicPayCell
                      key={`bp-${id}-${revCount}`}
                      row={row}
                      savedBasicPay={saved.basicPay}
                      onPreview={(patch) => onPreviewChange(id, patch)}
                      onCommit={(patch) => onCommitPatch(id, patch)}
                    />
                  </td>

                  {/* 9. Days of Month */}
                  <td className="px-1.5 py-2 text-center text-slate-700 font-medium border-r border-slate-100 tabular-nums">
                    {row.daysOfMonth}
                  </td>

                  {/* 10. Sunday */}
                  <td className="px-1.5 py-2 text-center text-slate-700 font-medium border-r border-slate-100 tabular-nums">
                    {row.sunday}
                  </td>

                  {/* 11. Working Days */}
                  <td className="px-1.5 py-2 text-center text-slate-700 font-semibold border-r border-slate-100 tabular-nums">
                    {row.workingDays}
                  </td>

                  {/* 12. Pay Per Day */}
                  <td className="px-2 py-2 text-right text-slate-700 font-medium border-r border-slate-100 tabular-nums">
                    {formatRupees(row.payPerDay)}
                  </td>

                  {/* 13. Total (Gross Pay) */}
                  <td className="px-2 py-2 text-right font-bold text-slate-900 border-r border-slate-100 tabular-nums">
                    {formatRupees(row.total)}
                  </td>

                  {/* 14. Leaves (Fetched from Approved Leaves + Editable override) */}
                  <td className="px-2 py-1.5 border-r border-slate-100">
                    <LeavesCell
                      key={`lv-${id}-${revCount}`}
                      row={row}
                      payrollSettings={lateSettings}
                      savedLeaves={saved.leaves}
                      savedOverridden={saved.leavesOverridden}
                      onPreview={(patch) => onPreviewChange(id, patch)}
                      onCommit={(patch) => onCommitPatch(id, patch)}
                    />
                  </td>

                  {/* 15. Half Days (Count - UI only badges) */}
                  <td
                    className="px-3 py-2 text-center text-slate-700 font-medium border-r border-slate-100 tabular-nums"
                    title={(() => {
                      const lateHalf = row.lateCounts?.halfDays ?? 0;
                      const s1 = row.halfDayLeaves?.session1 ?? 0;
                      const s2 = row.halfDayLeaves?.session2 ?? 0;
                      const shiftHalf = row.halfDayLeaves?.total ?? 0;
                      const computedHalf = computeDisplayHalfDays({
                        lateHalfDays: lateHalf,
                        shiftHalfDays: shiftHalf,
                        leavesComputedExact: row.leavesComputedExact ?? row.leavesComputed ?? 0,
                        leavesOverridden: Boolean(row.leavesOverridden),
                      });
                      const extraHalf = row.extraLeaveHalfDays ?? computedHalf.extraLeaveHalfDays;
                      const parts = [`Late (>${row.lateRuleWindow?.halfDayTime || lateSettings?.halfDayTime || '10:30'}): ${lateHalf}`];
                      if (s1 > 0 || s2 > 0) {
                        parts.push(`Shift Half-Day Leaves: 1st Shift ${s1}, 2nd Shift ${s2}`);
                      }
                      if (extraHalf > 0) {
                        parts.push(`Leave Rule (0.5): ${extraHalf}`);
                      }
                      return parts.join(' · ');
                    })()}
                  >
                    {(() => {
                      const lateHalf = row.lateCounts?.halfDays ?? 0;
                      const s1 = row.halfDayLeaves?.session1 ?? 0;
                      const s2 = row.halfDayLeaves?.session2 ?? 0;
                      const shiftHalf = row.halfDayLeaves?.total ?? 0;
                      const computedHalf = computeDisplayHalfDays({
                        lateHalfDays: lateHalf,
                        shiftHalfDays: shiftHalf,
                        leavesComputedExact: row.leavesComputedExact ?? row.leavesComputed ?? 0,
                        leavesOverridden: Boolean(row.leavesOverridden),
                      });
                      const extraHalf = row.extraLeaveHalfDays ?? computedHalf.extraLeaveHalfDays;
                      const displayedHalfDays = row.totalHalfDays ?? computedHalf.totalHalfDays;
                      const hasBadges = lateHalf > 0 || s1 > 0 || s2 > 0 || extraHalf > 0;
                      return (
                        <div className="flex flex-col items-center gap-0.5">
                          <span>{displayedHalfDays}</span>
                          {hasBadges && (
                            <div className="flex flex-wrap justify-center gap-1 text-[9.5px] font-bold leading-tight">
                              {lateHalf > 0 && (
                                <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200/80 whitespace-nowrap">
                                  {lateHalf} Late (&gt;{row.lateRuleWindow?.halfDayTime || lateSettings?.halfDayTime || '10:30'})
                                </span>
                              )}
                              {s1 > 0 && (
                                <span className="px-1.5 py-0.5 rounded bg-sky-50 text-sky-700 border border-sky-200/80 whitespace-nowrap">
                                  {s1} (1st Shift Leave)
                                </span>
                              )}
                              {s2 > 0 && (
                                <span className="px-1.5 py-0.5 rounded bg-sky-50 text-sky-700 border border-sky-200/80 whitespace-nowrap">
                                  {s2} (2nd Shift Leave)
                                </span>
                              )}
                              {extraHalf > 0 && (
                                <span className="px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200/80 whitespace-nowrap">
                                  {extraHalf} (0.5 Leave)
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </td>

                  {/* 16. Late Marks (Flat late marks only; half-days are in Half Day column) */}
                  <td
                    className="px-3 py-2 text-center text-slate-700 font-medium border-r border-slate-100 tabular-nums"
                    title={(() => {
                      const flatDays = row.lateCounts?.flatDays ?? 0;
                      const lateStart = row.lateRuleWindow?.lateStartTime || lateSettings?.lateStartTime || '09:30';
                      const halfCutoff = row.lateRuleWindow?.halfDayTime || lateSettings?.halfDayTime || '10:30';
                      const flatAmt = lateSettings?.lateFlatAmount ?? 300;
                      return flatDays > 0
                        ? `${flatDays} Late (${lateStart}–${halfCutoff}) × ₹${flatAmt}`
                        : `0 Late (${lateStart}–${halfCutoff})`;
                    })()}
                  >
                    {(() => {
                      const flatDays = row.lateCounts?.flatDays ?? 0;
                      const lateStart = row.lateRuleWindow?.lateStartTime || lateSettings?.lateStartTime || '09:30';
                      const halfCutoff = row.lateRuleWindow?.halfDayTime || lateSettings?.halfDayTime || '10:30';
                      return (
                        <div className="flex flex-col items-center gap-0.5">
                          <span>{flatDays}</span>
                          {flatDays > 0 && (
                            <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200/80 text-[9.5px] font-bold leading-tight whitespace-nowrap">
                              {flatDays} Late ({lateStart}–{halfCutoff})
                            </span>
                          )}
                        </div>
                      );
                    })()}
                  </td>

                  {/* 17. Deduction: Leave */}
                  <td className="px-2 py-2 text-right font-semibold text-rose-700 border-r border-slate-100 tabular-nums">
                    {formatRupees(row.leaveDeduction)}
                  </td>

                  {/* 18. Deduction: Half Day (Approved Half-Days + Late Half-Days, Editable override) */}
                  <td className="px-1.5 py-1.5 border-r border-slate-100">
                    <OverridableAmountCell
                      key={`hd-${id}-${revCount}`}
                      value={row.halfDayDeduction ?? 0}
                      computedValue={row.halfDayDeductionComputed ?? 0}
                      overridden={Boolean(row.halfDayDeductionOverridden)}
                      savedValue={saved.halfDayDeduction ?? 0}
                      savedOverridden={Boolean(saved.halfDayDeductionOverridden)}
                      patchKey="halfDayDeductionOverride"
                      ariaLabel={`Half Day Deduction for ${row.name}`}
                      tooltip={(() => {
                        const lateHalf = row.lateCounts?.halfDays ?? 0;
                        const appHalf = row.halfDayLeaves?.total ?? 0;
                        const totalHalf = lateHalf + appHalf;
                        return totalHalf > 0
                          ? `${totalHalf} Half Day(s) (${appHalf} Approved + ${lateHalf} Late) = ₹${formatRupees(row.halfDayDeductionComputed ?? 0)}`
                          : '0 Half Days';
                      })()}
                      onPreview={(patch) => onPreviewChange(id, patch)}
                      onCommit={(patch) => onCommitPatch(id, patch)}
                    />
                  </td>

                  {/* 18. Deduction: Late Marks (Editable override) */}
                  <td className="px-1.5 py-1.5 border-r border-slate-100">
                    <LateMarksCell
                      key={`lm-${id}-${revCount}`}
                      row={row}
                      lateSettings={lateSettings}
                      savedLateDeduction={saved.lateDeduction}
                      savedOverridden={saved.lateDeductionOverridden}
                      onPreview={(patch) => onPreviewChange(id, patch)}
                      onCommit={(patch) => onCommitPatch(id, patch)}
                    />
                  </td>

                  {/* 19. Deduction: Other (Editable) */}
                  <td className="px-1.5 py-1.5 border-r border-slate-100">
                    <EditableAmountCell
                      key={`oth-${id}-${revCount}`}
                      value={row.otherDeduction ?? 0}
                      savedValue={saved.otherDeduction ?? 0}
                      field="otherDeduction"
                      ariaLabel={`Other Deduction for ${row.name}`}
                      onPreview={(patch) => onPreviewChange(id, patch)}
                      onCommit={(patch) => onCommitPatch(id, patch)}
                    />
                  </td>

                  {/* 19. Net Pay */}
                  <td
                    className={`px-2 py-2 text-right font-extrabold border-r border-slate-100 tabular-nums ${
                      row.netPay < 0
                        ? isVerified
                          ? 'text-rose-700'
                          : 'text-rose-600 bg-rose-50/50'
                        : isVerified
                        ? 'text-emerald-800'
                        : 'text-emerald-700 bg-emerald-50/20'
                    }`}
                  >
                    {formatRupees(row.netPay)}
                  </td>

                  {/* 20. Statutory: PF (Permanent only) */}
                  <td className="px-1.5 py-1.5 border-r border-slate-100">
                    <EditableAmountCell
                      key={`pf-${id}-${revCount}`}
                      value={row.pf ?? 0}
                      savedValue={saved.pf ?? 0}
                      field="pf"
                      ariaLabel={`PF for ${row.name}`}
                      disabled={!isPermanent}
                      disabledTitle={`Not applicable in ${empStatus} phase (only Retention applies)`}
                      onPreview={(patch) => onPreviewChange(id, patch)}
                      onCommit={(patch) => onCommitPatch(id, patch)}
                    />
                  </td>

                  {/* 21. Statutory: ESIC (Permanent only) */}
                  <td className="px-1.5 py-1.5 border-r border-slate-100">
                    <EditableAmountCell
                      key={`esic-${id}-${revCount}`}
                      value={row.esic ?? 0}
                      savedValue={saved.esic ?? 0}
                      field="esic"
                      ariaLabel={`ESIC for ${row.name}`}
                      disabled={!isPermanent}
                      disabledTitle={`Not applicable in ${empStatus} phase (only Retention applies)`}
                      onPreview={(patch) => onPreviewChange(id, patch)}
                      onCommit={(patch) => onCommitPatch(id, patch)}
                    />
                  </td>

                  {/* 22. Statutory: PT (Maharashtra PT slabs, Permanent only, Editable override) */}
                  <td className="px-1.5 py-1.5 border-r border-slate-100">
                    <OverridableAmountCell
                      key={`pt-${id}-${revCount}`}
                      value={row.pt ?? 0}
                      computedValue={row.ptComputed ?? 0}
                      overridden={Boolean(row.ptOverridden)}
                      savedValue={saved.pt ?? 0}
                      savedOverridden={Boolean(saved.ptOverridden)}
                      patchKey="ptOverride"
                      ariaLabel={`PT for ${row.name}`}
                      tooltip={`Maharashtra PT (${row.gender || 'Male'}${Number(row.month) === 2 ? ', Feb' : ''}): ₹${formatRupees(row.ptComputed ?? 0)}`}
                      disabled={!isPermanent}
                      disabledTitle={`Not applicable in ${empStatus} phase (only Retention applies)`}
                      onPreview={(patch) => onPreviewChange(id, patch)}
                      onCommit={(patch) => onCommitPatch(id, patch)}
                    />
                  </td>

                  {/* 23. Statutory: Total (Permanent only; Auto PF+ESIC+PT, Editable) */}
                  <td className="px-1.5 py-1.5 border-r border-slate-100">
                    <OverridableAmountCell
                      key={`st-${id}-${revCount}`}
                      value={row.statutoryTotal ?? 0}
                      computedValue={row.statutoryTotalComputed ?? ((row.pf ?? 0) + (row.esic ?? 0) + (row.pt ?? 0))}
                      overridden={Boolean(row.statutoryTotalOverridden)}
                      savedValue={saved.statutoryTotal ?? 0}
                      savedOverridden={Boolean(saved.statutoryTotalOverridden)}
                      patchKey="statutoryTotalOverride"
                      ariaLabel={`Statutory Total for ${row.name}`}
                      tooltip={`PF + ESIC + PT = ₹${formatRupees(row.statutoryTotalComputed ?? ((row.pf ?? 0) + (row.esic ?? 0) + (row.pt ?? 0)))}`}
                      disabled={!isPermanent}
                      disabledTitle={`Not applicable in ${empStatus} phase (only Retention applies)`}
                      onPreview={(patch) => onPreviewChange(id, patch)}
                      onCommit={(patch) => onCommitPatch(id, patch)}
                    />
                  </td>

                  {/* 24. Final Pay (Net Pay - Statutory Total) */}
                  <td
                    className={`px-2 py-2 text-right font-bold border-r border-slate-100 tabular-nums ${
                      (row.finalPay ?? 0) < 0
                        ? isVerified
                          ? 'text-rose-700'
                          : 'text-rose-600 bg-rose-50/50'
                        : isVerified
                        ? 'text-indigo-900'
                        : 'text-indigo-800 bg-indigo-50/20'
                    }`}
                  >
                    {formatRupees(row.finalPay ?? 0)}
                  </td>

                  {/* 25. Retention (Training / Probation only: 5% of Total, Editable) */}
                  <td className="px-1.5 py-1.5 border-r border-slate-100">
                    <OverridableAmountCell
                      key={`ret-${id}-${revCount}`}
                      value={row.retention ?? 0}
                      computedValue={row.retentionComputed ?? 0}
                      overridden={Boolean(row.retentionOverridden)}
                      savedValue={saved.retention ?? 0}
                      savedOverridden={Boolean(saved.retentionOverridden)}
                      patchKey="retentionOverride"
                      ariaLabel={`Retention for ${row.name}`}
                      tooltip={`5% of Total = ₹${formatRupees(row.retentionComputed ?? 0)} (${empStatus})`}
                      disabled={isPermanent}
                      disabledTitle="Not applicable for Permanent employees (only PF, ESIC, PT apply)"
                      onPreview={(patch) => onPreviewChange(id, patch)}
                      onCommit={(patch) => onCommitPatch(id, patch)}
                    />
                  </td>

                  {/* 26. Advance (Editable) */}
                  <td className="px-1.5 py-1.5 border-r border-slate-100">
                    <EditableAmountCell
                      key={`adv-${id}-${revCount}`}
                      value={row.advance ?? 0}
                      savedValue={saved.advance ?? 0}
                      field="advance"
                      ariaLabel={`Advance for ${row.name}`}
                      onPreview={(patch) => onPreviewChange(id, patch)}
                      onCommit={(patch) => onCommitPatch(id, patch)}
                    />
                  </td>

                  {/* 27. Loan (Editable) */}
                  <td className="px-1.5 py-1.5 border-r border-slate-100">
                    <EditableAmountCell
                      key={`loan-${id}-${revCount}`}
                      value={row.loan ?? 0}
                      savedValue={saved.loan ?? 0}
                      field="loan"
                      ariaLabel={`Loan for ${row.name}`}
                      onPreview={(patch) => onPreviewChange(id, patch)}
                      onCommit={(patch) => onCommitPatch(id, patch)}
                    />
                  </td>

                  {/* 28. Bank Pay (Final Pay - Retention - Advance - Loan) */}
                  <td
                    className={`px-2 py-2 text-right font-extrabold border-r border-slate-100 tabular-nums ${
                      (row.bankPay ?? 0) < 0
                        ? isVerified
                          ? 'text-rose-700'
                          : 'text-rose-600 bg-rose-50/50'
                        : isVerified
                        ? 'text-emerald-900'
                        : 'text-emerald-800 bg-emerald-50/30'
                    }`}
                  >
                    {formatRupees(row.bankPay ?? 0)}
                  </td>

                  {/* 29. Verification Status Select */}
                  <td className="px-2 py-1.5 text-center">
                    <div className="flex flex-col items-center gap-1">
                      <select
                        value={row.verified ? 'verified' : 'needs_review'}
                        aria-label={`Verification status for ${row.name}`}
                        onChange={(e) => {
                          const nextVerified = e.target.value === 'verified';
                          onPreviewChange(id, { verified: nextVerified });
                          onCommitPatch(id, { verified: nextVerified });
                        }}
                        className={`w-full px-2 py-1.5 text-[11px] font-bold rounded-lg border outline-none cursor-pointer transition-all ${
                          row.verified
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-400/30'
                            : 'bg-amber-50 text-amber-800 border-amber-300 focus:border-amber-500 focus:ring-2 focus:ring-amber-400/30'
                        }`}
                      >
                        <option value="needs_review">• Needs review</option>
                        <option value="verified">✓ Verified</option>
                      </select>
                      {isMissingBasic && !row.verified && (
                        <span className="px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 border border-rose-200 text-[9.5px] font-bold leading-tight whitespace-nowrap">
                          ! Basic Pay missing
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>

          {/* Totals Footer Row */}
          <tfoot className="sticky bottom-0 z-30 bg-slate-100 font-extrabold text-slate-900 [&_td]:border-t-2 [&_td]:border-slate-300">
            <tr>
              <td
                colSpan={3}
                style={{ left: '0px' }}
                className="sticky z-40 px-2 py-2.5 text-left bg-slate-100 border-r border-slate-200 shadow-[4px_0_8px_-2px_rgba(15,23,42,0.12)]"
              >
                Total ({rows.length} {rows.length === 1 ? 'employee' : 'employees'})
              </td>
              <td className="px-2 py-2.5 border-r border-slate-200" />
              <td className="px-2 py-2.5 border-r border-slate-200" />
              <td className="px-2 py-2.5 border-r border-slate-200" />
              <td className="px-2 py-2.5 border-r border-slate-200" />
              {/* 8. Basic Pay Sum */}
              <td className="px-2 py-2.5 text-right border-r border-slate-200 tabular-nums">
                ₹{formatRupees(totals.basicPay)}
              </td>
              <td className="px-1.5 py-2.5 border-r border-slate-200" />
              <td className="px-1.5 py-2.5 border-r border-slate-200" />
              <td className="px-1.5 py-2.5 border-r border-slate-200" />
              <td className="px-2 py-2.5 border-r border-slate-200" />
              {/* 13. Total Sum */}
              <td className="px-2 py-2.5 text-right border-r border-slate-200 tabular-nums">
                ₹{formatRupees(totals.total)}
              </td>
              <td className="px-2 py-2.5 border-r border-slate-200" />
              <td className="px-2 py-2.5 border-r border-slate-200" />
              <td className="px-2 py-2.5 border-r border-slate-200" />
              {/* 17. Leave Deduction Sum */}
              <td className="px-2 py-2.5 text-right text-rose-700 border-r border-slate-200 tabular-nums">
                ₹{formatRupees(totals.leaveDeduction)}
              </td>
              {/* 18. Half Day Deduction Sum */}
              <td className="px-2 py-2.5 text-right text-rose-700 border-r border-slate-200 tabular-nums">
                ₹{formatRupees(totals.halfDayDeduction)}
              </td>
              {/* 18. Late Deduction Sum */}
              <td className="px-2 py-2.5 text-right text-rose-700 border-r border-slate-200 tabular-nums">
                ₹{formatRupees(totals.lateDeduction)}
              </td>
              {/* 19. Other Deduction Sum */}
              <td className="px-2 py-2.5 text-right text-rose-700 border-r border-slate-200 tabular-nums">
                ₹{formatRupees(totals.otherDeduction)}
              </td>
              {/* 19. Net Pay Sum */}
              <td
                className={`px-2 py-2.5 text-right border-r border-slate-200 tabular-nums ${
                  totals.netPay < 0 ? 'text-rose-600' : 'text-emerald-800'
                }`}
              >
                ₹{formatRupees(totals.netPay)}
              </td>
              {/* 20. PF Sum */}
              <td className="px-2 py-2.5 text-right text-sky-900 border-r border-slate-200 tabular-nums">
                ₹{formatRupees(totals.pf)}
              </td>
              {/* 21. ESIC Sum */}
              <td className="px-2 py-2.5 text-right text-sky-900 border-r border-slate-200 tabular-nums">
                ₹{formatRupees(totals.esic)}
              </td>
              {/* 22. PT Sum */}
              <td className="px-2 py-2.5 text-right text-sky-900 border-r border-slate-200 tabular-nums">
                ₹{formatRupees(totals.pt)}
              </td>
              {/* 23. Statutory Total Sum */}
              <td className="px-2 py-2.5 text-right text-sky-950 border-r border-slate-200 tabular-nums">
                ₹{formatRupees(totals.statutoryTotal)}
              </td>
              {/* 24. Final Pay Sum */}
              <td
                className={`px-2 py-2.5 text-right border-r border-slate-200 tabular-nums ${
                  totals.finalPay < 0 ? 'text-rose-600' : 'text-indigo-900'
                }`}
              >
                ₹{formatRupees(totals.finalPay)}
              </td>
              {/* 25. Retention Sum */}
              <td className="px-2 py-2.5 text-right border-r border-slate-200 tabular-nums">
                ₹{formatRupees(totals.retention)}
              </td>
              {/* 26. Advance Sum */}
              <td className="px-2 py-2.5 text-right border-r border-slate-200 tabular-nums">
                ₹{formatRupees(totals.advance)}
              </td>
              {/* 27. Loan Sum */}
              <td className="px-2 py-2.5 text-right border-r border-slate-200 tabular-nums">
                ₹{formatRupees(totals.loan)}
              </td>
              {/* 28. Bank Pay Sum */}
              <td
                className={`px-2 py-2.5 text-right border-r border-slate-200 tabular-nums ${
                  totals.bankPay < 0 ? 'text-rose-600' : 'text-emerald-900'
                }`}
              >
                ₹{formatRupees(totals.bankPay)}
              </td>
              {/* 29. Verified Progress */}
              <td
                className={`px-2 py-2.5 text-center text-xs font-bold tabular-nums ${
                  allDisplayedVerified ? 'text-emerald-700' : 'text-amber-700'
                }`}
              >
                {verifiedCount}/{rows.length}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
};

export default PayrollTable;
