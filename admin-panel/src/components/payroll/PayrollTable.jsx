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
 * Editable UAN input cell.
 * Missing UAN displays placeholder '0' without persisting '0' unless typed by HR.
 */
const UanCell = ({ row, savedUan, onPreview, onCommit }) => {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState(row.uan || '');
  const timerRef = useRef(null);
  const lastCommittedRef = useRef(savedUan || '');

  useEffect(() => {
    lastCommittedRef.current = savedUan || '';
  }, [savedUan]);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const flush = (rawVal) => {
    clearTimeout(timerRef.current);
    const trimmed = String(rawVal).trim();
    if (trimmed === lastCommittedRef.current) return;
    lastCommittedRef.current = trimmed;
    onCommit({ uan: trimmed });
  };

  const handleChange = (e) => {
    const val = e.target.value;
    setDraft(val);
    onPreview({ uan: val.trim() });
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => flush(val), DEBOUNCE_MS);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.currentTarget.blur();
    } else if (e.key === 'Escape') {
      clearTimeout(timerRef.current);
      setDraft(lastCommittedRef.current);
      onPreview({ uan: lastCommittedRef.current });
      e.currentTarget.blur();
    }
  };

  const shownValue = focused ? draft : (row.uan || '');

  return (
    <input
      type="text"
      value={shownValue}
      placeholder="0"
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
      className="w-full px-2.5 py-1.5 text-xs font-semibold text-slate-800 placeholder:text-slate-400 bg-slate-50/80 hover:bg-white focus:bg-white border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 rounded-lg outline-none transition-all"
    />
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

  const shownValue = focused
    ? draft
    : (Number(row.basicPay) > 0 ? formatRupees(row.basicPay) : '');

  return (
    <input
      type="text"
      inputMode="numeric"
      value={shownValue}
      placeholder="0"
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
      className="w-full px-2.5 py-1.5 text-xs font-semibold text-right text-slate-800 placeholder:text-slate-400 bg-slate-50/80 hover:bg-white focus:bg-white border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 rounded-lg outline-none transition-all tabular-nums"
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
  const deductionCols = PAYROLL_COLUMNS.slice(16, 18);
  const netPayCol = PAYROLL_COLUMNS[18];

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden max-w-full">
      <div className="overflow-auto max-h-[calc(100vh-260px)] w-full">
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
                    className={`px-3 py-2.5 font-bold uppercase tracking-wider text-[11px] border-b border-r border-slate-200 bg-slate-100 ${col.widthClass} ${alignCls} ${
                      isSticky ? 'sticky z-40' : ''
                    } ${col.lastSticky ? 'shadow-[4px_0_8px_-2px_rgba(15,23,42,0.12)]' : ''}`}
                  >
                    <div className="flex flex-col gap-0.5">
                      <span>{col.label}</span>
                      {col.editable && (
                        <span className="text-[9px] font-semibold text-indigo-600 normal-case tracking-normal">
                          Editable
                        </span>
                      )}
                    </div>
                  </th>
                );
              })}

              <th
                colSpan={2}
                className="px-3 py-2 font-bold uppercase tracking-wider text-[11px] text-center border-b border-r border-slate-200 bg-rose-50/70 text-rose-900"
              >
                Deduction
              </th>

              <th
                rowSpan={2}
                className={`px-3 py-2.5 font-bold uppercase tracking-wider text-[11px] text-right border-b border-slate-200 bg-emerald-50/70 text-emerald-950 ${netPayCol.widthClass}`}
              >
                {netPayCol.label}
              </th>
            </tr>

            {/* Header Row 2 (Deduction sub-columns) */}
            <tr>
              {deductionCols.map((col) => (
                <th
                  key={col.key}
                  className={`px-3 py-2 font-bold uppercase tracking-wider text-[10.5px] text-right border-b border-r border-slate-200 bg-rose-50/50 text-rose-900 ${col.widthClass}`}
                >
                  <div className="flex flex-col items-end gap-0.5">
                    <span>{col.label}</span>
                    {col.editable && (
                      <span className="text-[9px] font-semibold text-indigo-600 normal-case tracking-normal">
                        Override
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
              const rowBg = idx % 2 === 0 ? 'bg-white' : 'bg-slate-50';

              return (
                <tr
                  key={id}
                  className={`${rowBg} hover:bg-indigo-50/40 transition-colors group`}
                >
                  {/* 1. Serial Number */}
                  <td
                    style={{ left: '0px' }}
                    className={`sticky z-20 w-[60px] min-w-[60px] max-w-[60px] px-3 py-2 text-center font-semibold text-slate-500 border-b border-r border-slate-100 ${rowBg} group-hover:bg-indigo-50 tabular-nums`}
                  >
                    {idx + 1}
                  </td>

                  {/* 2. Employee ID */}
                  <td
                    style={{ left: '60px' }}
                    className={`sticky z-20 w-[120px] min-w-[120px] max-w-[120px] px-3 py-2 font-bold text-indigo-700 border-b border-r border-slate-100 ${rowBg} group-hover:bg-indigo-50 whitespace-nowrap`}
                  >
                    <div className="flex items-center justify-between gap-1.5">
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
                    style={{ left: '180px' }}
                    className={`sticky z-20 w-[190px] min-w-[190px] max-w-[190px] px-3 py-2 font-bold text-slate-900 border-b border-r border-slate-200 ${rowBg} group-hover:bg-indigo-50 shadow-[4px_0_8px_-2px_rgba(15,23,42,0.10)]`}
                  >
                    <div className="truncate max-w-[170px]" title={row.name}>
                      {row.name || '-'}
                    </div>
                  </td>

                  {/* 4. Designation */}
                  <td className="px-3 py-2 text-slate-600 border-r border-slate-100 whitespace-nowrap">
                    {row.designation || '-'}
                  </td>

                  {/* 5. Department */}
                  <td className="px-3 py-2 text-slate-600 border-r border-slate-100 whitespace-nowrap">
                    {row.department || '-'}
                  </td>

                  {/* 6. Date of Joining (DD-MM-YYYY) */}
                  <td className="px-3 py-2 text-center text-slate-700 font-medium border-r border-slate-100 whitespace-nowrap tabular-nums">
                    {formatJoiningDateIST(row.dateOfJoining)}
                  </td>

                  {/* 7. UAN No. (Editable) */}
                  <td className="px-2 py-1.5 border-r border-slate-100">
                    <UanCell
                      key={`uan-${id}-${revCount}`}
                      row={row}
                      savedUan={saved.uan}
                      onPreview={(patch) => onPreviewChange(id, patch)}
                      onCommit={(patch) => onCommitPatch(id, patch)}
                    />
                  </td>

                  {/* 8. Basic Pay (Editable) */}
                  <td className="px-2 py-1.5 border-r border-slate-100">
                    <BasicPayCell
                      key={`bp-${id}-${revCount}`}
                      row={row}
                      savedBasicPay={saved.basicPay}
                      onPreview={(patch) => onPreviewChange(id, patch)}
                      onCommit={(patch) => onCommitPatch(id, patch)}
                    />
                  </td>

                  {/* 9. Days of Month */}
                  <td className="px-3 py-2 text-center text-slate-700 font-medium border-r border-slate-100 tabular-nums">
                    {row.daysOfMonth}
                  </td>

                  {/* 10. Sunday */}
                  <td className="px-3 py-2 text-center text-slate-700 font-medium border-r border-slate-100 tabular-nums">
                    {row.sunday}
                  </td>

                  {/* 11. Pay Per Day */}
                  <td className="px-3 py-2 text-right text-slate-700 font-medium border-r border-slate-100 tabular-nums">
                    {formatRupees(row.payPerDay)}
                  </td>

                  {/* 12. Working Days */}
                  <td className="px-3 py-2 text-center text-slate-700 font-semibold border-r border-slate-100 tabular-nums">
                    {row.workingDays}
                  </td>

                  {/* 13. Total (Gross Pay) */}
                  <td className="px-3 py-2 text-right font-bold text-slate-900 border-r border-slate-100 tabular-nums">
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
                      const parts = [`Late (>${lateSettings?.halfDayTime || '10:30'}): ${lateHalf}`];
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
                                  {lateHalf} Late (&gt;{lateSettings?.halfDayTime || '10:30'})
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

                  {/* 16. Late Marks (Count + UI-only reason badge) */}
                  <td
                    className="px-3 py-2 text-center text-slate-700 font-medium border-r border-slate-100 tabular-nums"
                    title={(() => {
                      const flatDays = row.lateCounts?.flatDays ?? 0;
                      const lateStart = lateSettings?.lateStartTime || '09:30';
                      const halfCutoff = lateSettings?.halfDayTime || '10:30';
                      const flatAmt = lateSettings?.lateFlatAmount ?? 300;
                      return flatDays > 0
                        ? `${flatDays} Late (${lateStart}–${halfCutoff}) × ₹${flatAmt}`
                        : `0 Late (${lateStart}–${halfCutoff})`;
                    })()}
                  >
                    {(() => {
                      const flatDays = row.lateCounts?.flatDays ?? 0;
                      const lateStart = lateSettings?.lateStartTime || '09:30';
                      const halfCutoff = lateSettings?.halfDayTime || '10:30';
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
                  <td className="px-3 py-2 text-right font-semibold text-rose-700 border-r border-slate-100 tabular-nums">
                    {formatRupees(row.leaveDeduction)}
                  </td>

                  {/* 18. Deduction: Late Marks (Editable override) */}
                  <td className="px-2 py-1.5 border-r border-slate-100">
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

                  {/* 19. Net Pay */}
                  <td
                    className={`px-3 py-2 text-right font-extrabold tabular-nums ${
                      row.netPay < 0
                        ? 'text-rose-600 bg-rose-50/50'
                        : 'text-emerald-700 bg-emerald-50/20'
                    }`}
                  >
                    {formatRupees(row.netPay)}
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
                className="sticky z-40 px-3 py-3 text-left bg-slate-100 border-r border-slate-200 shadow-[4px_0_8px_-2px_rgba(15,23,42,0.12)]"
              >
                Total ({rows.length} {rows.length === 1 ? 'employee' : 'employees'})
              </td>
              <td className="px-3 py-3 border-r border-slate-200" />
              <td className="px-3 py-3 border-r border-slate-200" />
              <td className="px-3 py-3 border-r border-slate-200" />
              <td className="px-3 py-3 border-r border-slate-200" />
              {/* 8. Basic Pay Sum */}
              <td className="px-3 py-3 text-right border-r border-slate-200 tabular-nums">
                ₹{formatRupees(totals.basicPay)}
              </td>
              <td className="px-3 py-3 border-r border-slate-200" />
              <td className="px-3 py-3 border-r border-slate-200" />
              <td className="px-3 py-3 border-r border-slate-200" />
              <td className="px-3 py-3 border-r border-slate-200" />
              {/* 13. Total Sum */}
              <td className="px-3 py-3 text-right border-r border-slate-200 tabular-nums">
                ₹{formatRupees(totals.total)}
              </td>
              <td className="px-3 py-3 border-r border-slate-200" />
              <td className="px-3 py-3 border-r border-slate-200" />
              <td className="px-3 py-3 border-r border-slate-200" />
              {/* 17. Leave Deduction Sum */}
              <td className="px-3 py-3 text-right text-rose-700 border-r border-slate-200 tabular-nums">
                ₹{formatRupees(totals.leaveDeduction)}
              </td>
              {/* 16. Late Deduction Sum */}
              <td className="px-3 py-3 text-right text-rose-700 border-r border-slate-200 tabular-nums">
                ₹{formatRupees(totals.lateDeduction)}
              </td>
              {/* 17. Net Pay Sum */}
              <td
                className={`px-3 py-3 text-right tabular-nums ${
                  totals.netPay < 0 ? 'text-rose-600' : 'text-emerald-800'
                }`}
              >
                ₹{formatRupees(totals.netPay)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
};

export default PayrollTable;
