import {
  AnimatePresence,
  motion
} from 'framer-motion';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  ArrowUpDown,
  Banknote,
  Briefcase,
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  FileSpreadsheet,
  FileText,
  IndianRupee,
  ListFilter,
  Loader2,
  Mail,
  Phone,
  Receipt,
  RefreshCw,
  RotateCcw,
  Search,
  Users,
  X,
  XCircle,
  Zap
} from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import toast from 'react-hot-toast';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';
import SearchableDropdown from '../components/SearchableDropdown';

// Format INR currency
const formatINR = (val) => {
  return Number(val || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
};

// Format Date for Display (e.g. 13-9-2026, 13-10-2026)
const formatDateDisplay = (dateStr) => {
  if (!dateStr) return 'N/A';
  try {
    const parts = String(dateStr).split('T')[0].split('-');
    if (parts.length === 3 && parts[0].length === 4) {
      return `${parseInt(parts[2], 10)}-${parseInt(parts[1], 10)}-${parts[0]}`;
    }
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      return `${d.getDate()}-${d.getMonth() + 1}-${d.getFullYear()}`;
    }
    return String(dateStr);
  } catch (_) {
    return String(dateStr);
  }
};

const formatAppliedDateTime = (dStr) => {
  if (!dStr) return 'N/A';
  try {
    const d = new Date(dStr);
    if (isNaN(d.getTime())) return String(dStr);
    return (
      d.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      }) +
      ', ' +
      d.toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      })
    );
  } catch (_) {
    return String(dStr);
  }
};

const safeText = (val) => {
  if (val === null || val === undefined) return '';
  if (typeof val === 'object') {
    return val.name || val.fullName || val.title || val.departmentName || val.designationName || val.prefix || val._id || '';
  }
  return String(val);
};

const getClaimProofs = (raw) => {
  if (!raw) return { billProofs: [], serviceReports: [], fullPaymentProofs: [] };

  const billMap = new Map();
  const addBill = (r) => {
    if (!r) return;
    const key = r.url || r.uri || r._id || r.name;
    if (key && !billMap.has(key)) {
      billMap.set(key, r);
    }
  };
  if (Array.isArray(raw.receipts)) raw.receipts.forEach(addBill);
  if (Array.isArray(raw.entries)) {
    raw.entries.forEach((e) => {
      if (Array.isArray(e?.receipts)) e.receipts.forEach(addBill);
      if (Array.isArray(e?.attachments)) e.attachments.forEach(addBill);
    });
  }
  if (Array.isArray(raw.employeeClaims)) {
    raw.employeeClaims.forEach((ec) => {
      (ec.items || []).forEach((it) => {
        if (Array.isArray(it?.attachments)) it.attachments.forEach(addBill);
        if (Array.isArray(it?.receipts)) it.receipts.forEach(addBill);
      });
    });
  }
  if (Array.isArray(raw.attachments)) raw.attachments.forEach(addBill);

  const srMap = new Map();
  const addSr = (r) => {
    if (!r) return;
    const key = r.url || r.uri || r._id || r.name;
    if (key && !srMap.has(key)) {
      srMap.set(key, r);
    }
  };
  if (Array.isArray(raw.serviceReports)) raw.serviceReports.forEach(addSr);

  const fpMap = new Map();
  const addFp = (r) => {
    if (!r) return;
    const key = r.url || r.uri || r._id || r.name;
    if (key && !fpMap.has(key)) {
      fpMap.set(key, r);
    }
  };
  if (Array.isArray(raw.fullPayment?.proofs)) raw.fullPayment.proofs.forEach(addFp);
  if (Array.isArray(raw.fullPaymentProofs)) raw.fullPaymentProofs.forEach(addFp);

  return {
    billProofs: Array.from(billMap.values()),
    serviceReports: Array.from(srMap.values()),
    fullPaymentProofs: Array.from(fpMap.values()),
  };
};

const formatDateYYYYMMDD = (d) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Only two final statuses (Paid / Rejected) plus Pending for claims not yet decided.
const STATUS_STYLE = {
  PENDING: { label: 'Pending', cls: 'bg-amber-50 text-amber-800 border-amber-200' },
  PAID: { label: 'Paid', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  REJECTED: { label: 'Rejected', cls: 'bg-rose-50 text-rose-700 border-rose-200' },
  DRAFT: { label: 'Draft', cls: 'bg-slate-100 text-slate-600 border-slate-200' },
};


const getDefaultExpenseDateRange = () => {
  const end = new Date();
  const start = new Date(end.getFullYear(), end.getMonth() - 1, end.getDate());
  if (start.getMonth() === end.getMonth()) {
    start.setDate(0);
  }
  return {
    expenseFrom: formatDateYYYYMMDD(start),
    expenseTo: formatDateYYYYMMDD(end),
  };
};

const getInitialFilters = () => {
  const defaultDates = getDefaultExpenseDateRange();
  return {
    search: '',
    employeeId: '',
    city: '',
    status: '',
    expenseType: '',
    expenseFrom: defaultDates.expenseFrom,
    expenseTo: defaultDates.expenseTo,
  };
};

const EMPTY_FILTERS = getInitialFilters();

const cleanParams = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== '' && v !== null && v !== undefined));

const inputCls = 'w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:border-indigo-500';

// Top Metric Stat Card - compact size so table displays prominently
const StatCard = ({ title, value, sub, icon, iconBg, iconColor, loading }) => (
  <div className="bg-white border border-slate-200 rounded-2xl px-3.5 py-2.5 flex-1 transition-all duration-200 group flex items-center gap-3 relative hover:shadow-md hover:border-indigo-300">
    <div
      className="w-9 h-9 rounded-xl flex items-center justify-center border border-slate-100 shadow-2xs group-hover:scale-105 transition-transform shrink-0"
      style={{ backgroundColor: iconBg, color: iconColor }}
    >
      {React.cloneElement(icon, { size: 16, strokeWidth: 2.2 })}
    </div>
    <div className="min-w-0 flex-1">
      <span className="text-[10px] font-extrabold text-slate-400 tracking-wider block truncate">{title}</span>
      <div className="text-base lg:text-lg font-bold text-slate-900 tracking-tight truncate">
        {loading ? <Loader2 className="animate-spin text-indigo-500" size={16} /> : value}
      </div>
      {sub && <span className="text-[9px] font-bold text-slate-400 block truncate">{sub}</span>}
    </div>
  </div>
);

const FilterField = ({ label, children }) => (
  <div className="space-y-1">
    <label className="font-bold text-slate-500 text-[10px] tracking-wider block">{label}</label>
    {children}
  </div>
);

const SortHeader = ({ field, sort, onSort, children, className = '' }) => {
  const active = sort.field === field;
  const Icon = !active ? ArrowUpDown : sort.direction === 'asc' ? ArrowUp : ArrowDown;
  return (
    <th className={`px-2.5 py-3 text-left border-r border-slate-200 whitespace-nowrap ${className}`}>
      <button type="button" onClick={() => onSort(field)} className={`inline-flex items-center gap-1 cursor-pointer hover:text-indigo-600 ${active ? 'text-indigo-700' : ''}`}>
        <span>{children}</span>
        <Icon size={11} className="flex-shrink-0" />
      </button>
    </th>
  );
};

// Mark as Paid / Reject / Reopen buttons, shown only when the server says the user may do it.
const RowActions = ({ claim, onAction, size = 'sm' }) => {
  const p = claim.permissions || {};
  const btn = size === 'sm' ? 'px-2 py-1 rounded-lg text-[11px]' : 'px-5 py-3 rounded-2xl text-xs';
  return (
    <>
      {p.canMarkPaid && (
        <button type="button" onClick={() => onAction('pay', claim)} className={`${btn} font-extrabold bg-emerald-600 hover:bg-emerald-700 text-white transition-all flex items-center gap-1 cursor-pointer active:scale-95`}>
          <Banknote size={13} /> Mark as Paid
        </button>
      )}
      {p.canReject && (
        <button type="button" onClick={() => onAction('reject', claim)} className={`${btn} font-extrabold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 transition-all flex items-center gap-1 cursor-pointer active:scale-95`}>
          <XCircle size={13} /> Reject
        </button>
      )}
      {p.canReopen && (
        <button type="button" onClick={() => onAction('reopen', claim)} className={`${btn} font-extrabold bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 transition-all flex items-center gap-1 cursor-pointer active:scale-95`}>
          <RotateCcw size={13} /> Reopen
        </button>
      )}
    </>
  );
};

const ExpenseReportPage = ({ embedded = false, initialFilters = {} }) => {
  const navigate = useNavigate();
  const { user } = useSelector((state) => state.auth);

  const userRole = (user?.role || '').toLowerCase();
  const userRoleCode = (user?.roleCode || '').toUpperCase();

  const isSuperAdmin = userRole === 'superadmin' || userRole === 'super_admin' || userRoleCode === 'TCSA1' || user?.scope === 'GLOBAL';
  const isCompanyAdmin = userRole === 'company_admin' || userRole === 'companyadmin' || userRole === 'admin' || userRoleCode === 'TCCA1';
  const isHRAdmin = (userRole === 'hr' || userRole === 'hr_admin' || userRoleCode === 'TCSF2A' || userRoleCode === 'TCSFA' || userRoleCode === 'HR_ADMIN') && !isSuperAdmin && !isCompanyAdmin;

  const showActionsColumn = !isHRAdmin;

  // Unified filters state: changes apply directly to Expense Date and scope.
  const [filters, setFilters] = useState(() => ({ ...getInitialFilters(), ...initialFilters }));
  const setFilter = (key) => (val) => {
    setFilters((f) => ({ ...f, [key]: val === 'ALL' ? '' : val }));
    setReportPage(1);
  };

  // Pagination & Sorting
  const [reportPage, setReportPage] = useState(1);
  const [reportLimit, setReportLimit] = useState(15);
  const [sort, setSort] = useState({ field: 'submittedAt', direction: 'desc' });

  // Data
  const [reportLoading, setReportLoading] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [claimsReportData, setClaimsReportData] = useState([]);
  const [reportPagination, setReportPagination] = useState({ total: 0, totalPages: 1, page: 1, limit: 15 });
  const [summary, setSummary] = useState({});
  const [options, setOptions] = useState({ employees: [], managers: [], workLocations: [], departments: [], cities: [], expenseTypes: [] });

  // Claim detail modal + Mark Paid / Reject / Reopen action modal
  const [detailClaim, setDetailClaim] = useState(null);
  const [action, setAction] = useState(null); // { type: 'pay' | 'reject' | 'reopen', claim, form, confirming }
  const [processing, setProcessing] = useState(false);

  // Export dropdown
  const [showExportOptions, setShowExportOptions] = useState(false);
  const exportRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (exportRef.current && !exportRef.current.contains(event.target)) setShowExportOptions(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (detailClaim || action) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [detailClaim, action]);

  const fetchFilterOptions = useCallback(() => {
    api.get('/expense/reports/filter-options')
      .then((res) => res.data?.success && setOptions(res.data.data))
      .catch((err) => console.error('Failed to load report filter options:', err));
  }, []);

  useEffect(() => {
    fetchFilterOptions();
  }, [fetchFilterOptions]);

  const queryParams = useCallback(
    () => ({ ...cleanParams(filters), sortField: sort.field, sortDirection: sort.direction }),
    [filters, sort]
  );

  const fetchSummary = useCallback(async () => {
    setSummaryLoading(true);
    try {
      const res = await api.get('/expense/reports/summary', { params: cleanParams(filters) });
      if (res.data?.success) setSummary(res.data.data || {});
    } catch (err) {
      console.error('Failed to load expense report summary:', err);
    } finally {
      setSummaryLoading(false);
    }
  }, [filters]);

  const fetchClaimsReport = useCallback(async () => {
    setReportLoading(true);
    try {
      const res = await api.get('/expense/reports', { params: { ...queryParams(), page: reportPage, limit: reportLimit } });
      if (res.data?.success) {
        setClaimsReportData(res.data.data || []);
        if (res.data.pagination) setReportPagination(res.data.pagination);
      }
    } catch (err) {
      console.error('Failed to load expense claims report:', err);
      toast.error(err.response?.data?.message || 'Failed to load expense report');
    } finally {
      setReportLoading(false);
    }
  }, [queryParams, reportPage, reportLimit]);

  useEffect(() => { fetchSummary(); }, [fetchSummary]);
  useEffect(() => { fetchClaimsReport(); }, [fetchClaimsReport]);

  const refreshAll = () => {
    fetchFilterOptions();
    fetchSummary();
    fetchClaimsReport();
  };

  const toggleSort = (field) => {
    setSort((s) => ({ field, direction: s.field === field && s.direction === 'desc' ? 'asc' : 'desc' }));
    setReportPage(1);
  };

  const handleOpenClaimDetail = async (claim) => {
    setDetailClaim(claim);
    if (!claim?._id) return;
    try {
      const res = await api.get(`/expense/claims/${claim._id}`);
      if (res.data?.success && res.data.data) {
        const full = res.data.data;
        setDetailClaim((prev) => ({
          ...prev,
          ...full,
          employeeName: full.submittedBy?.name || full.submittedByName || prev?.employeeName,
          employeeCode: full.submittedBy?.employeeIdCode || prev?.employeeCode,
          department: full.submittedBy?.department || prev?.department,
          managerName: prev?.managerName || full.submittedBy?.reportsTo?.name,
          expenseType: prev?.expenseType || full.claimType,
        }));
      }
    } catch (err) {
      console.warn('Could not fetch full claim details from server, using report snapshot:', err);
    }
  };

  // ── Mark as Paid / Reject / Reopen ──
  const openAction = (type, claim) => {
    const payable = claim.payableAmount || claim.allowedAmount || claim.claimedAmount || claim.grandAllowed || 0;
    setAction({
      type,
      claim,
      confirming: false,
      form: type === 'pay'
        ? { paymentDate: formatDateYYYYMMDD(new Date()), paidAmount: payable, paymentReference: '', remarks: '' }
        : { reason: '' },
    });
  };

  const setActionField = (key) => (e) => setAction((a) => ({ ...a, form: { ...a.form, [key]: e.target.value } }));

  const validateAction = () => {
    const { type, form, claim } = action;
    if (type === 'pay') {
      if (!form.paymentDate) return 'Please select the payment date.';
      if (form.paymentDate > formatDateYYYYMMDD(new Date())) return 'Payment date cannot be in the future.';
      const amt = Number(form.paidAmount);
      if (!(amt > 0)) return 'Paid amount must be greater than zero.';
      const claimed = claim.claimedAmount || claim.grandRequested;
      if (claimed && amt > claimed) return `Paid amount cannot exceed the claimed amount (₹${formatINR(claimed)}).`;
      return null;
    }
    return form.reason.trim().length < 3 ? `Please enter the reason for ${type === 'reject' ? 'rejecting' : 'reopening'} the claim.` : null;
  };

  const submitAction = async () => {
    const { type, claim, form } = action;
    const url = { pay: 'payment', reject: 'reject', reopen: 'reopen' }[type];
    setProcessing(true);
    try {
      await api.post(`/expense/claims/${claim._id}/${url}`, type === 'pay' ? { ...form, paidAmount: Number(form.paidAmount) } : { reason: form.reason.trim() });
      toast.success({ pay: 'Claim marked as Paid', reject: 'Claim rejected', reopen: 'Claim reopened and set to Pending' }[type]);
      setAction(null);
      setDetailClaim(null);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Action failed');
      if (err.response?.status === 409) setAction(null);
    } finally {
      setProcessing(false);
      refreshAll();
    }
  };

  // ── Export Claims Report to CSV (server-side: same filters, sort and access scope) ──
  const handleExportCSV = async () => {
    try {
      const res = await api.get('/expense/reports/export', { params: queryParams(), responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res.data], { type: 'text/csv;charset=utf-8;' }));
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `Expense_Claims_Report_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success('CSV report exported successfully');
    } catch (err) {
      console.error('Failed to export CSV report:', err);
      toast.error('Failed to export CSV report');
    }
  };

  // ── Export Claims Report to PDF (first 200 matching claims) ──
  const handleExportPDF = async () => {
    try {
      const res = await api.get('/expense/reports', { params: { ...queryParams(), page: 1, limit: 200 } });
      const rows = res.data?.data || [];
      if (!rows.length) return toast.error('No claim data to export');
      if ((res.data.pagination?.total || 0) > rows.length) toast(`PDF includes the first ${rows.length} claims. Use CSV for the full report.`);

      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      doc.setFontSize(14);
      doc.setTextColor(79, 70, 229);
      doc.text('Expense Claims Report', 14, 15);
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text(
        `Generated: ${new Date().toLocaleString()} | Claims: ${summary.totalClaims || 0} | Paid: Rs ${formatINR(summary.totalPaidAmount)} | Rejected: Rs ${formatINR(summary.totalRejectedAmount)}`,
        14,
        21
      );

      autoTable(doc, {
        head: [['Claim ID', 'Employee', 'Manager / Dept', 'Type & City', 'Expense Date', 'Submitted', 'Claimed (Rs)', 'Paid (Rs)', 'Payment Date', 'Status', 'Payment Ref / Rejection Reason']],
        body: rows.map((c) => [
          c.claimNumber || '-',
          `${c.employeeName || '-'}\n(${c.employeeCode || '-'})`,
          `${c.managerName || '-'}\n${c.department || '-'}`,
          `${c.expenseType || '-'}\n${c.city || c.workLocation || '-'}`,
          formatDateDisplay(c.expenseDate),
          formatDateDisplay(c.submittedAt),
          formatINR(c.claimedAmount),
          c.status === 'PAID' ? formatINR(c.paidAmount) : '-',
          c.paymentDate ? formatDateDisplay(c.paymentDate) : '-',
          c.statusLabel || c.status,
          c.status === 'PAID' ? (c.paymentReference || '-') : c.status === 'REJECTED' ? (c.rejectionReason || '-') : '-',
        ]),
        startY: 26,
        theme: 'grid',
        styles: { fontSize: 7, cellPadding: 2 },
        headStyles: { fillColor: [79, 70, 229], textColor: [255, 255, 255], fontStyle: 'bold' },
        columnStyles: { 0: { fontStyle: 'bold' }, 6: { halign: 'right' }, 7: { halign: 'right', fontStyle: 'bold' } },
      });

      doc.save(`Expense_Claims_Report_${new Date().toISOString().slice(0, 10)}.pdf`);
      toast.success('PDF report exported successfully');
    } catch (err) {
      console.error('Failed to export PDF report:', err);
      toast.error('Failed to export PDF');
    }
  };

  const optionList = (arr, labelKey = 'name') => (arr || []).map((o) => (typeof o === 'string' ? { value: o, label: o } : { value: o._id, label: o[labelKey], sublabel: o.employeeIdCode ? `(${o.employeeIdCode})` : '' }));

  return (
    <div className="space-y-4 animate-fade-up max-w-full overflow-x-hidden">
      {/* ── HEADER SECTION ── */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 bg-white p-4 md:p-5 rounded-2xl border border-slate-200 shadow-2xs">
        <div className="flex items-center gap-3">
          {!embedded && (
            <button
              onClick={() => navigate('/expense-dashboard')}
              className="p-2.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-2xl text-slate-600 hover:text-indigo-600 transition-all cursor-pointer flex-shrink-0"
              title="Back to Expense Dashboard"
            >
              <ChevronLeft size={18} />
            </button>
          )}
          <div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <Receipt className="text-indigo-600" size={24} />
              {embedded ? 'Expense Claims' : 'Expense Claims Report'}
            </h1>
            <p className="text-xs font-bold text-slate-400 mt-0.5">
              All expense claims in your access scope. Mark pending claims as Paid or Rejected.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Search (server-side, applied directly) */}
          <div className="relative w-64">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              id="expense-report-search"
              type="text"
              placeholder="Claim ID, employee, customer, bill..."
              value={filters.search}
              onChange={(e) => setFilter('search')(e.target.value)}
              className="w-full pl-8 pr-7 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:border-indigo-500 shadow-2xs"
            />
            {filters.search && (
              <button
                onClick={() => {
                  setFilter('search')('');
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X size={13} />
              </button>
            )}
          </div>

          {/* Export Dropdown */}
          <div className="relative" ref={exportRef}>
            <button
              id="expense-report-export"
              onClick={() => setShowExportOptions(!showExportOptions)}
              className="flex items-center gap-2 px-3.5 py-2 bg-indigo-600 text-white rounded-xl font-bold text-xs shadow-md shadow-indigo-100 hover:bg-indigo-700 transition-all cursor-pointer"
            >
              <Download size={14} />
              <span>Export</span>
              <ChevronDown size={14} className={`transition-transform ${showExportOptions ? 'rotate-180' : ''}`} />
            </button>

            <AnimatePresence>
              {showExportOptions && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="absolute right-0 mt-2 w-48 bg-white rounded-2xl shadow-2xl border border-slate-100 py-2 z-[120] overflow-hidden"
                >
                  <button
                    onClick={() => {
                      handleExportCSV();
                      setShowExportOptions(false);
                    }}
                    className="w-full px-4 py-2.5 text-left text-xs font-bold text-slate-700 hover:bg-slate-50 hover:text-indigo-600 transition-colors flex items-center gap-2.5 cursor-pointer"
                  >
                    <FileSpreadsheet size={15} className="text-emerald-600" />
                    Export CSV Report
                  </button>
                  <button
                    onClick={() => {
                      handleExportPDF();
                      setShowExportOptions(false);
                    }}
                    className="w-full px-4 py-2.5 text-left text-xs font-bold text-slate-700 hover:bg-slate-50 hover:text-rose-600 transition-colors flex items-center gap-2.5 cursor-pointer"
                  >
                    <FileText size={15} className="text-rose-600" />
                    Export PDF Report
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <button
            onClick={refreshAll}
            disabled={reportLoading}
            className="p-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 transition-all cursor-pointer"
            title="Refresh Data"
          >
            <RefreshCw size={15} className={reportLoading ? 'animate-spin text-indigo-600' : ''} />
          </button>
        </div>
      </div>

      {/* ── FILTERS (Always visible above KPI cards, compact) ── */}
      <div className="bg-white border border-slate-200 rounded-2xl p-3 md:p-3.5 shadow-2xs">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5 text-xs">
          <FilterField label="Employee">
            <SearchableDropdown
              options={optionList(options.employees)}
              value={filters.employeeId || 'ALL'}
              onChange={setFilter('employeeId')}
              allOption={{ label: 'All Employees', value: 'ALL' }}
              searchPlaceholder="Search employee..."
              placeholder="Select Employee..."
              icon={Users}
            />
          </FilterField>

          <FilterField label="City">
            <SearchableDropdown
              options={optionList(options.cities)}
              value={filters.city || 'ALL'}
              onChange={setFilter('city')}
              allOption={{ label: 'All Cities', value: 'ALL' }}
              searchPlaceholder="Search city..."
              placeholder="Select City..."
            />
          </FilterField>

          <FilterField label="Status">
            <SearchableDropdown
              options={[
                { value: 'PENDING', label: 'Pending' },
                { value: 'PAID', label: 'Paid' },
                { value: 'REJECTED', label: 'Rejected' },
              ]}
              value={filters.status || 'ALL'}
              onChange={setFilter('status')}
              allOption={{ label: 'All Statuses', value: 'ALL' }}
              searchable={false}
            />
          </FilterField>

          <FilterField label="Expense Type">
            <SearchableDropdown
              options={optionList(options.expenseTypes)}
              value={filters.expenseType || 'ALL'}
              onChange={setFilter('expenseType')}
              allOption={{ label: 'All Expense Types', value: 'ALL' }}
              searchPlaceholder="Search expense type..."
              placeholder="Select Expense Type..."
            />
          </FilterField>

          <FilterField label="From Date">
            <input
              type="date"
              value={filters.expenseFrom}
              max={filters.expenseTo || undefined}
              onChange={(e) => setFilter('expenseFrom')(e.target.value)}
              className={inputCls}
            />
          </FilterField>

          <FilterField label="To Date">
            <input
              type="date"
              value={filters.expenseTo}
              min={filters.expenseFrom || undefined}
              onChange={(e) => setFilter('expenseTo')(e.target.value)}
              className={inputCls}
            />
          </FilterField>
        </div>
      </div>

      {/* ── 5 SUMMARY CARDS (Compact size, positioned below filters) ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <StatCard
          title="Total Claims"
          value={summary.totalClaims || 0}
          sub={summary.pendingClaims ? `${summary.pendingClaims} pending` : null}
          icon={<ListFilter />}
          iconBg="#eff6ff"
          iconColor="#2563eb"
          loading={summaryLoading}
        />
        <StatCard title="Paid Claims" value={summary.paidClaims || 0} icon={<CheckCircle2 />} iconBg="#f0fdf4" iconColor="#15803d" loading={summaryLoading} />
        <StatCard title="Rejected Claims" value={summary.rejectedClaims || 0} icon={<XCircle />} iconBg="#fff1f2" iconColor="#e11d48" loading={summaryLoading} />
        <StatCard title="Total Paid Amount" value={`₹ ${formatINR(summary.totalPaidAmount)}`} icon={<IndianRupee />} iconBg="#ecfdf5" iconColor="#047857" loading={summaryLoading} />
        <StatCard title="Total Rejected Amount" value={`₹ ${formatINR(summary.totalRejectedAmount)}`} icon={<IndianRupee />} iconBg="#fff1f2" iconColor="#be123c" loading={summaryLoading} />
      </div>

      {/* ── CLAIMS TABLE ── */}
      <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-2xs w-full">
        <div className="overflow-x-auto w-full">
          <table className="w-full text-left border-collapse border border-slate-200">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-500 tracking-wider">
                <SortHeader sort={sort} onSort={toggleSort} field="claimNumber">Claim ID</SortHeader>
                <SortHeader sort={sort} onSort={toggleSort} field="employeeName">Employee</SortHeader>
                <th className="px-2.5 py-3 text-left border-r border-slate-200 whitespace-nowrap">Customer</th>
                <th className="px-2.5 py-3 text-left border-r border-slate-200 whitespace-nowrap">City</th>
                <SortHeader sort={sort} onSort={toggleSort} field="expenseType">Expense Type</SortHeader>
                <SortHeader sort={sort} onSort={toggleSort} field="expenseDate">Expense Date</SortHeader>
                <SortHeader sort={sort} onSort={toggleSort} field="submittedAt">Submitted</SortHeader>
                <SortHeader sort={sort} onSort={toggleSort} field="claimedAmount">Claimed</SortHeader>
                <SortHeader sort={sort} onSort={toggleSort} field="paidAmount">Paid Amount</SortHeader>
                <SortHeader sort={sort} onSort={toggleSort} field="status">Status</SortHeader>
                {showActionsColumn && <th className="px-2 py-3 text-center whitespace-nowrap w-10">Actions</th>}
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-200 text-xs font-semibold text-slate-700">
              {reportLoading ? (
                <tr>
                  <td colSpan={showActionsColumn ? 11 : 10} className="py-20 text-center text-slate-400">
                    <Loader2 className="animate-spin mx-auto text-indigo-600 mb-2" size={30} />
                    <p className="text-xs font-bold">Loading expense claims report...</p>
                  </td>
                </tr>
              ) : claimsReportData.length === 0 ? (
                <tr>
                  <td colSpan={showActionsColumn ? 11 : 10} className="py-20 text-center text-slate-400">
                    <div className="w-14 h-14 rounded-2xl bg-slate-50 text-slate-300 mx-auto flex items-center justify-center mb-2">
                      <Receipt size={28} />
                    </div>
                    <p className="text-sm font-bold text-slate-700">No Expense Claims Found</p>
                    <p className="text-xs text-slate-400 mt-0.5">Try changing your filters or search terms.</p>
                  </td>
                </tr>
              ) : (
                claimsReportData.map((claim) => {
                  const st = STATUS_STYLE[claim.status] || STATUS_STYLE.PENDING;
                  const extraEmps = Math.max(0, Number(claim.employeeCount || 1) - 1);
                  return (
                    <tr
                      key={claim._id}
                      onClick={() => handleOpenClaimDetail(claim)}
                      className="hover:bg-indigo-50/40 transition-colors cursor-pointer group border-b border-slate-200"
                      title="Click to view full claim details"
                    >
                      <td className="px-2.5 py-2.5 whitespace-nowrap text-left border-r border-slate-200">
                        <span className="font-extrabold text-slate-900 tracking-tight text-xs font-mono">{claim.claimNumber || 'EXP-CLAIM'}</span>
                      </td>
                      <td className="px-2.5 py-2.5 text-left border-r border-slate-200 max-w-[130px]">
                        <div className="font-bold text-slate-900 truncate" title={claim.employeeName}>{claim.employeeName}</div>
                        <div className="text-[11px] text-slate-400 font-semibold truncate">{claim.employeeCode || '—'}</div>
                        {extraEmps > 0 && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 mt-0.5 rounded-md text-[10px] font-bold border bg-indigo-50 text-indigo-700 border-indigo-200 whitespace-nowrap">
                            <Users size={10} /> +{extraEmps}
                          </span>
                        )}
                      </td>
                      <td className="px-2.5 py-2.5 text-left border-r border-slate-200 font-bold text-slate-800 max-w-[110px]">
                        <div className="truncate" title={claim.customerName || '—'}>{claim.customerName || '—'}</div>
                      </td>
                      <td className="px-2.5 py-2.5 text-left border-r border-slate-200 font-bold text-slate-800 max-w-[90px]">
                        <div className="truncate" title={claim.city || '—'}>{claim.city || '—'}</div>
                      </td>
                      <td className="px-2.5 py-2.5 text-left border-r border-slate-200 whitespace-nowrap">
                        <div className="font-bold text-slate-800 text-xs">{claim.expenseType || 'General'}</div>
                      </td>
                      <td className="px-2.5 py-2.5 text-left border-r border-slate-200 font-bold text-slate-800 text-xs whitespace-nowrap">
                        {claim.fromDate && claim.toDate && claim.fromDate !== claim.toDate
                          ? `${formatDateDisplay(claim.fromDate)} → ${formatDateDisplay(claim.toDate)}`
                          : formatDateDisplay(claim.expenseDate)}
                      </td>
                      <td className="px-2.5 py-2.5 text-left border-r border-slate-200 whitespace-nowrap text-xs">{formatDateDisplay(claim.submittedAt)}</td>
                      <td className="px-2.5 py-2.5 text-left font-bold text-slate-700 border-r border-slate-200 whitespace-nowrap text-xs">
                        ₹ {formatINR(claim.claimedAmount)}
                        {claim.isFullPayment && (
                          <span className="block w-fit px-1 bg-amber-50 text-amber-700 border border-amber-200 rounded text-[9px] font-bold mt-0.5">Full Payment</span>
                        )}
                      </td>
                      <td className="px-2.5 py-2.5 text-left font-extrabold border-r border-slate-200 whitespace-nowrap text-xs">
                        {claim.status === 'PAID' ? (
                          <>
                            <div className="text-emerald-700">₹ {formatINR(claim.paidAmount)}</div>
                            {claim.paymentDate && (
                              <div className="text-[10px] text-slate-400 font-medium mt-0.5">
                                {formatDateDisplay(claim.paymentDate)}
                              </div>
                            )}
                          </>
                        ) : (
                          <span className="text-slate-400 font-normal">—</span>
                        )}
                      </td>
                      <td className={`px-2.5 py-2.5 text-left whitespace-nowrap ${showActionsColumn ? 'border-r border-slate-200' : ''}`}>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold border ${st.cls}`}>{st.label}</span>
                      </td>
                      {showActionsColumn && (
                        <td className="px-2 py-2.5 text-center whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-center">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate('/pending-approvals', { state: { targetClaimId: claim._id, tab: 'expense_claims' } });
                              }}
                              className="p-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-extrabold text-[11px] border border-indigo-200 transition-all flex items-center justify-center cursor-pointer"
                              title="Go to Pending Approvals"
                            >
                              <ArrowRight size={14} />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* ── PAGINATION ── */}
        {reportPagination.total > 0 && (
          <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
            <div className="text-slate-500 font-bold">
              Showing <span className="font-extrabold text-slate-900">{(reportPage - 1) * reportLimit + 1}</span> to{' '}
              <span className="font-extrabold text-slate-900">{Math.min(reportPage * reportLimit, reportPagination.total)}</span> of{' '}
              <span className="font-extrabold text-slate-900">{reportPagination.total}</span> claims
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 font-bold text-slate-500">
                <span>Rows:</span>
                <select
                  value={reportLimit}
                  onChange={(e) => {
                    setReportLimit(Number(e.target.value));
                    setReportPage(1);
                  }}
                  className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold text-slate-700"
                >
                  {[10, 15, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => setReportPage((p) => Math.max(1, p - 1))}
                  disabled={reportPage === 1}
                  className="w-8 h-8 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="px-3 py-1 font-extrabold text-slate-800">
                  {reportPage} / {reportPagination.totalPages || 1}
                </span>
                <button
                  onClick={() => setReportPage((p) => Math.min(reportPagination.totalPages || 1, p + 1))}
                  disabled={reportPage >= (reportPagination.totalPages || 1)}
                  className="w-8 h-8 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ══════════════ MARK AS PAID / REJECT / REOPEN MODAL (with confirmation step) ══════════════ */}
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {action && (() => {
            const { type, claim, form, confirming } = action;
            const meta = {
              pay: { title: 'Mark as Paid', color: 'emerald', Icon: Banknote, cta: 'Confirm Payment' },
              reject: { title: 'Reject Claim', color: 'rose', Icon: XCircle, cta: 'Confirm Rejection' },
              reopen: { title: 'Reopen Rejected Claim', color: 'slate', Icon: RotateCcw, cta: 'Confirm Reopen' },
            }[type];
            const error = validateAction();
            const close = () => !processing && setAction(null);
            return (
              <div className="fixed inset-0 z-[3500] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 15 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 15 }}
                  className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden border border-slate-100 p-6 md:p-8 space-y-5 my-auto"
                >
                  <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${type === 'pay' ? 'bg-emerald-50 text-emerald-600' : type === 'reject' ? 'bg-rose-50 text-rose-600' : 'bg-slate-100 text-slate-600'}`}>
                        <meta.Icon size={20} />
                      </div>
                      <div>
                        <h3 className="text-base font-bold text-slate-900 m-0">{meta.title}</h3>
                        <p className="text-xs text-slate-400 font-medium m-0">
                          {claim.claimNumber} • {claim.employeeName} • Claimed ₹{formatINR(claim.claimedAmount)}
                        </p>
                      </div>
                    </div>
                    <button type="button" onClick={close} className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
                      <X size={18} />
                    </button>
                  </div>

                  {!confirming ? (
                    type === 'pay' ? (
                      <div className="space-y-3 text-xs">
                        <div className="grid grid-cols-2 gap-3">
                          <FilterField label="Payment Date *">
                            <input type="date" value={form.paymentDate} max={formatDateYYYYMMDD(new Date())} onChange={setActionField('paymentDate')} className={inputCls} />
                          </FilterField>
                          <FilterField label="Paid Amount (₹) *">
                            <input type="number" min="0" step="0.01" value={form.paidAmount} onChange={setActionField('paidAmount')} className={inputCls} />
                          </FilterField>
                        </div>
                        <p className="text-[11px] text-slate-400 font-medium m-0">Payable as per policy: ₹{formatINR(claim.payableAmount || claim.allowedAmount)}</p>
                        <FilterField label="Payment Reference / UTR">
                          <input type="text" maxLength={100} value={form.paymentReference} onChange={setActionField('paymentReference')} className={inputCls} />
                        </FilterField>
                        <FilterField label="Remarks">
                          <textarea rows={2} maxLength={500} value={form.remarks} onChange={setActionField('remarks')} className={inputCls} />
                        </FilterField>
                      </div>
                    ) : (
                      <FilterField label={type === 'reject' ? 'Rejection Reason *' : 'Reason for Reopening *'}>
                        <textarea
                          rows={3}
                          maxLength={500}
                          autoFocus
                          value={form.reason}
                          onChange={setActionField('reason')}
                          placeholder={type === 'reject' ? 'Explain why this claim is rejected (visible to the employee)' : 'Why is this rejection being reversed?'}
                          className={inputCls}
                        />
                      </FilterField>
                    )
                  ) : (
                    <div className={`p-4 rounded-2xl border text-xs font-semibold space-y-1 ${type === 'pay' ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950' : type === 'reject' ? 'bg-rose-50/70 border-rose-200 text-rose-950' : 'bg-slate-50 border-slate-200 text-slate-800'}`}>
                      {type === 'pay' ? (
                        <>
                          <p className="m-0 font-extrabold text-sm">Record a payment of ₹{formatINR(form.paidAmount)}?</p>
                          <p className="m-0">Paid on {formatDateDisplay(form.paymentDate)}{form.paymentReference ? ` (Ref: ${form.paymentReference})` : ''}.</p>
                          <p className="m-0 opacity-75">The claim will be locked as Paid and cannot be changed afterwards.</p>
                        </>
                      ) : type === 'reject' ? (
                        <>
                          <p className="m-0 font-extrabold text-sm">Reject this claim?</p>
                          <p className="m-0">Reason: {form.reason}</p>
                        </>
                      ) : (
                        <>
                          <p className="m-0 font-extrabold text-sm">Reopen this claim and set it back to Pending?</p>
                          <p className="m-0">Reason: {form.reason}</p>
                          <p className="m-0 opacity-75">The previous rejection is kept in the audit trail.</p>
                        </>
                      )}
                    </div>
                  )}

                  {!confirming && error && <p className="text-[11px] font-bold text-rose-600 m-0">{error}</p>}

                  <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => (confirming ? setAction((a) => ({ ...a, confirming: false })) : close())}
                      disabled={processing}
                      className="px-5 py-2.5 rounded-xl font-bold text-xs text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
                    >
                      {confirming ? 'Back' : 'Cancel'}
                    </button>
                    <button
                      type="button"
                      onClick={() => (confirming ? submitAction() : setAction((a) => ({ ...a, confirming: true })))}
                      disabled={processing || !!error}
                      className={`px-6 py-2.5 rounded-xl font-bold text-xs text-white transition-all shadow-md active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 cursor-pointer ${type === 'pay' ? 'bg-emerald-600 hover:bg-emerald-700' : type === 'reject' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-slate-700 hover:bg-slate-800'}`}
                    >
                      {processing ? <Loader2 size={14} className="animate-spin" /> : <meta.Icon size={15} />}
                      {confirming ? meta.cta : 'Continue'}
                    </button>
                  </div>
                </motion.div>
              </div>
            );
          })()}
        </AnimatePresence>,
        document.body
      )}

      {/* ══════════════ CLAIM FULL DETAIL VIEW MODAL ══════════════ */}
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {detailClaim && (() => {
            const raw = detailClaim;
            const ecList = Array.isArray(raw.employeeClaims) ? raw.employeeClaims : [];
            const empNames = ecList.map(ec => ec.employee?.name).filter(Boolean);
            const numEmployees = raw.numberOfEmployees || raw.employeeCount || empNames.length || 1;
            const grandReq = raw.grandRequested ?? raw.claimedAmount ?? raw.requestedAmount ?? 0;
            const grandAllow = raw.grandAllowed ?? raw.allowedAmount ?? raw.payableAmount ?? grandReq;
            const grandExc = raw.grandExcess ?? raw.excessAmount ?? Math.max(0, grandReq - grandAllow);
            const grandLimit = raw.grandPolicyLimit ?? raw.policyLimit ?? (ecList[0]?.items?.[0]?.policyLimit || grandAllow);
            const hasExcess = grandExc > 0;

            const claimMode = (raw.claimMode || '').toUpperCase().trim();
            const claimType = (raw.claimType || raw.expenseType || 'Expense').toUpperCase().trim();
            const showCityClaimTypes = ['TRAVEL', 'TOUR', 'TRIP', 'LODGING', 'FOOD', 'TRAVEL_EXPENSE', 'TOUR_EXPENSE', 'FOOD_EXPENSE', 'LODGING_EXPENSE'];
            const isShowCityClaim = showCityClaimTypes.includes(claimType);
            const expensePurpose = raw.trip?.purpose || raw.purpose || (ecList[0]?.items?.[0]?.description) || '';
            const customerName = raw.trip?.customerName || raw.customerName;

            const entries = Array.isArray(raw.entries) ? raw.entries : [];
            const firstItemType = (ecList[0]?.items?.[0]?.expenseType || '').toUpperCase().trim();

            const isLogging = claimMode === 'LOGGING' ||
              claimType === 'LODGING' ||
              claimType === 'LOGGING' ||
              claimType === 'LODGING_EXPENSE' ||
              claimType === 'LOGGING_EXPENSE' ||
              entries.some(e => ['LODGING', 'LOGGING'].includes((e.expenseType || '').toUpperCase().trim())) ||
              firstItemType === 'LODGING' || firstItemType === 'LOGGING';

            const isFood = claimType === 'FOOD' ||
              claimType === 'FOOD_EXPENSE' ||
              entries.some(e => ['FOOD', 'FOOD_EXPENSE'].includes((e.expenseType || '').toUpperCase().trim())) ||
              firstItemType === 'FOOD' || firstItemType === 'FOOD_EXPENSE';

            const isLoggingOrFood = isLogging || isFood;

            const days = Number(
              raw.numberOfNights ||
              raw.days ||
              raw.numberOfDays ||
              raw.trip?.days ||
              (raw.fromDate && raw.toDate ? Math.max(1, Math.round((new Date(raw.toDate) - new Date(raw.fromDate)) / (1000 * 60 * 60 * 24))) : 1)
            ) || 1;

            // Extract per-day limits for each employee
            let empLines = [];
            if (ecList.length > 0) {
              empLines = ecList.map((ec, idx) => {
                const name = ec.employee?.name || (numEmployees > 1 ? `Employee #${idx + 1}` : (raw.submittedByName || raw.employeeName || 'Employee'));
                const firstItem = ec.items?.[0] || {};
                const breakdown = firstItem.calculationBreakdown || {};
                const src = breakdown.sourceValues || {};

                let perDay = Number(
                  firstItem.perDayLimit ||
                  src.dailyEntitlement ||
                  src.capPerEmployee ||
                  breakdown.dailyCap ||
                  0
                );

                if (!perDay) {
                  const itemLimit = Number(firstItem.policyLimit || ec.policyLimitTotal || ec.policyLimit || 0);
                  if (isLogging && days > 0 && itemLimit > 0) {
                    perDay = Math.round(itemLimit / days);
                  } else if (itemLimit > 0) {
                    perDay = itemLimit;
                  }
                }

                if (!perDay && grandLimit > 0) {
                  perDay = Math.round(grandLimit / (ecList.length || 1) / (isLogging ? days : 1));
                }

                if (isLogging) {
                  const totalEmpLimit = perDay * days;
                  return days > 1
                    ? `${name}: ₹${formatINR(perDay)}/day (Total: ₹${formatINR(totalEmpLimit)} for ${days} days)`
                    : `${name}: ₹${formatINR(perDay)}/day`;
                } else {
                  return perDay > 0 ? `${name}: ₹${formatINR(perDay)}/day` : `${name}: Actuals`;
                }
              });
            } else {
              const name = raw.submittedByName || raw.employeeName || 'Employee';
              let perDay = 0;
              if (isLogging && days > 0 && grandLimit > 0) {
                perDay = Math.round(grandLimit / days);
              } else {
                perDay = grandLimit;
              }
              empLines = [
                isLogging
                  ? (days > 1 ? `${name}: ₹${formatINR(perDay)}/day (Total: ₹${formatINR(grandLimit)} for ${days} days)` : `${name}: ₹${formatINR(perDay)}/day`)
                  : (perDay > 0 ? `${name}: ₹${formatINR(perDay)}/day` : `${name}: Actuals`)
              ];
            }

            let combinedLimitText = '';
            if (isLogging) {
              combinedLimitText = numEmployees > 1
                ? `Combined Whole Claim Limit: ₹${formatINR(grandLimit)} (${days} day${days > 1 ? 's' : ''})`
                : `Whole Claim Limit: ₹${formatINR(grandLimit)} (${days} day${days > 1 ? 's' : ''})`;
            } else if (isFood) {
              combinedLimitText = numEmployees > 1
                ? `Combined daily limit: ₹${formatINR(grandLimit)}`
                : `Daily policy limit: ₹${formatINR(grandLimit)}`;
            } else {
              combinedLimitText = `Policy limit: ₹${formatINR(grandLimit)}`;
            }

            let calcOutcomeText = '';
            if (hasExcess) {
              const perEmpExcessText = numEmployees > 1 ? ` (₹${formatINR(Math.round(grandExc / numEmployees))} excess per employee)` : '';
              calcOutcomeText = `Claimed bill: ₹${formatINR(grandReq)}. Therefore, ₹${formatINR(grandAllow)} is allowed and ₹${formatINR(grandExc)} is excess beyond policy limit${perEmpExcessText}.`;
            } else {
              const limitLabel = isLogging
                ? (numEmployees > 1 ? 'combined whole claim limit' : 'whole claim limit')
                : (numEmployees > 1 ? 'combined daily limit' : 'daily policy limit');
              calcOutcomeText = `Claimed bill: ₹${formatINR(grandReq)}. Since your bill is within your ${limitLabel}, ₹${formatINR(grandAllow)} is fully allowed.`;
            }

            const entriesList = (Array.isArray(raw.entries) && raw.entries.length > 0)
              ? raw.entries
              : (Array.isArray(ecList[0]?.items) && ecList[0].items.length > 0 ? ecList[0].items : null);

            const combinedItems = entriesList
              ? entriesList.map((entry, idx) => {
                const firstItem = ecList[0]?.items?.[idx] || {};
                const expType = (entry.expenseType || firstItem.expenseType || raw.claimType || 'Expense').toUpperCase();
                const isOther = expType === 'OTHER';
                const isConv = expType === 'CONVEYANCE';
                const isPurchase = isOther && ((entry.otherSubType || firstItem.otherSubType || '').toUpperCase() === 'PURCHASE');
                const expTypeName = firstItem.expenseTypeName || (
                  isConv ? 'Local Conveyance' :
                    expType === 'FOOD' ? 'Food' :
                      expType === 'TRAVEL' ? 'Travel' :
                        (expType === 'LODGING' || expType === 'LOGGING') ? 'Lodging' :
                          isOther ? (isPurchase ? 'Purchase' : 'Other Expense') : expType
                );
                const expDate = entry.expenseDate || firstItem.expenseDate || entry.date || firstItem.date || raw.expenseDate || raw.claimDate || raw.fromDate || raw.submissionDate || raw.createdAt;

                const reqAmt = Number(entry.requestedAmount) || Number(firstItem.requestedAmount) || ecList.reduce((s, ec) => s + (Number(ec.items?.[idx]?.requestedAmount) || 0), 0) || Number(entry.amount) || Number(firstItem.amount) || Number(entry.claimedAmount) || Number(firstItem.claimedAmount) || (entriesList.length === 1 ? grandReq : 0);

                const allowAmt = ecList.reduce((s, ec) => s + (Number(ec.items?.[idx]?.allowedAmount) || 0), 0) || Number(entry.allowedAmount) || Number(firstItem.allowedAmount) || (entriesList.length === 1 ? grandAllow : reqAmt);

                const excAmt = ecList.reduce((s, ec) => s + (Number(ec.items?.[idx]?.excessAmount) || 0), 0) || Number(entry.excessAmount) || Number(firstItem.excessAmount) || (entriesList.length === 1 ? grandExc : Math.max(0, reqAmt - allowAmt));

                const polLimit = ecList.reduce((s, ec) => s + (Number(ec.items?.[idx]?.policyLimit) || 0), 0) || Number(entry.policyLimit) || Number(firstItem.policyLimit) || (entriesList.length === 1 ? grandLimit : 0);

                const itemHasExcess = excAmt > 0;
                const limitDisp = (expType === 'CONVEYANCE' || expType === 'TRAVEL' || expType === 'OTHER')
                  ? (firstItem.limitText || 'Actuals (Fully Allowed)')
                  : (firstItem.limitText || (polLimit > 0 ? `₹${formatINR(polLimit)}` : 'Actuals (Fully Allowed)'));
                const atts = entry.receipts || entry.attachments || firstItem.attachments || [];

                const itemFormula = entry.formula || firstItem.formula || firstItem.calculationBreakdown?.formula || (
                  isConv
                    ? ((entry.distanceKm || firstItem.distanceKm) ? `${entry.distanceKm || firstItem.distanceKm} km x ₹${firstItem.calculationBreakdown?.sourceValues?.rate || 10}/km` : 'Actuals (Fully Allowed)')
                    : expType === 'TRAVEL'
                      ? 'Travel fare (Fully Allowed)'
                      : isOther
                        ? (isPurchase ? 'Purchase (Fully Allowed)' : 'Actual amount (Fully Allowed)')
                        : expType === 'FOOD'
                          ? (firstItem.limitText ? `Daily limit: ${firstItem.limitText}` : 'MIN(actual, daily entitlement)')
                          : (expType === 'LODGING' || expType === 'LOGGING')
                            ? (firstItem.limitText ? `Stay budget: ${firstItem.limitText}` : 'Lodging policy entitlement')
                            : 'Actuals (Fully Allowed)'
                );

                return {
                  expenseType: expType,
                  expenseTypeName: expTypeName,
                  expenseDate: expDate,
                  requestedAmount: reqAmt,
                  allowedAmount: allowAmt,
                  excessAmount: excAmt,
                  policyLimit: polLimit,
                  hasExcess: itemHasExcess,
                  limitDisplay: limitDisp,
                  formula: itemFormula,
                  description: entry.remark || entry.description || firstItem.description || firstItem.remark || raw.remark || raw.purpose || '',
                  distanceKm: isConv ? (entry.distanceKm || firstItem.distanceKm) : undefined,
                  vehicle: isConv ? (entry.vehicle || firstItem.vehicle) : undefined,
                  otherSubType: isOther ? (entry.otherSubType || firstItem.otherSubType) : undefined,
                  barcodeNumber: isOther ? (entry.barcodeNumber || firstItem.barcodeNumber) : undefined,
                  quantity: isOther ? (entry.quantity || firstItem.quantity) : undefined,
                  attachments: atts,
                };
              })
              : (() => {
                const singleType = (ecList[0]?.items?.[0]?.expenseType || raw.claimType || 'Expense').toUpperCase();
                const singleIsOther = singleType === 'OTHER';
                const singleIsConv = singleType === 'CONVEYANCE';
                const singleIsPurchase = singleIsOther && ((ecList[0]?.items?.[0]?.otherSubType || raw.entries?.[0]?.otherSubType || raw.otherSubType || '').toUpperCase() === 'PURCHASE');
                return [{
                  expenseType: singleType,
                  expenseTypeName: raw.expenseType || raw.claimType || (singleIsConv ? 'Local Conveyance' : (singleIsOther ? (singleIsPurchase ? 'Purchase' : 'Other Expense') : 'Expense')),
                  expenseDate: ecList[0]?.items?.[0]?.expenseDate || raw.expenseDate || raw.claimDate || raw.date || raw.fromDate || raw.submissionDate || raw.createdAt,
                  requestedAmount: grandReq,
                  allowedAmount: grandAllow,
                  excessAmount: grandExc,
                  policyLimit: grandLimit,
                  hasExcess: grandExc > 0,
                  limitDisplay: grandLimit > 0 ? `₹${formatINR(grandLimit)}` : 'Actuals (Fully Allowed)',
                  formula: raw.formula || ecList[0]?.items?.[0]?.formula || ecList[0]?.items?.[0]?.calculationBreakdown?.formula,
                  description: raw.remark || raw.purpose || ecList[0]?.items?.[0]?.description || '',
                  distanceKm: singleIsConv ? (ecList[0]?.items?.[0]?.distanceKm || raw.entries?.[0]?.distanceKm) : undefined,
                  vehicle: singleIsConv ? (ecList[0]?.items?.[0]?.vehicle || raw.entries?.[0]?.vehicle) : undefined,
                  otherSubType: singleIsOther ? (ecList[0]?.items?.[0]?.otherSubType || raw.entries?.[0]?.otherSubType || raw.otherSubType) : undefined,
                  barcodeNumber: singleIsOther ? (ecList[0]?.items?.[0]?.barcodeNumber || raw.entries?.[0]?.barcodeNumber || raw.barcodeNumber) : undefined,
                  quantity: singleIsOther ? (ecList[0]?.items?.[0]?.quantity || raw.entries?.[0]?.quantity || raw.quantity) : undefined,
                  attachments: raw.receipts || ecList[0]?.items?.[0]?.attachments || [],
                }];
              })();

            const { billProofs, serviceReports, fullPaymentProofs } = getClaimProofs(raw);
            const perms = raw.permissions || {};
            const bizStatus = perms.businessStatus || raw.status;
            const isPaid = bizStatus === 'PAID';
            const isRejected = bizStatus === 'REJECTED';

            const appliedRules = combinedItems
              .map((it, idx) => {
                const formula = it.formula || raw.formula || ecList[0]?.items?.[idx]?.formula;
                const title = combinedItems.length > 1 ? `Entry #${idx + 1} (${it.expenseTypeName})` : it.expenseTypeName;
                return { title, formula };
              })
              .filter(r => Boolean(r.formula));

            return (
              <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto">
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 15 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 15 }}
                  className="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl overflow-hidden my-auto border border-slate-100 flex flex-col max-h-[90vh]"
                >
                  {/* Modal Header */}
                  <div className="p-6 md:p-8 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white relative flex-shrink-0">
                    <button
                      onClick={() => setDetailClaim(null)}
                      className="absolute top-6 right-6 p-2 rounded-2xl bg-white/10 hover:bg-white/20 text-white transition-all active:scale-95 cursor-pointer"
                    >
                      <X size={20} />
                    </button>
                    <div className="flex items-center gap-3 mb-2">
                      <span
                        className={`text-[10px] font-extrabold px-3 py-1 rounded-full tracking-wider ${isRejected
                          ? 'bg-rose-400 text-rose-950'
                          : isPaid
                            ? 'bg-emerald-400 text-emerald-950'
                            : 'bg-amber-400 text-amber-950'
                          }`}
                      >
                        {isRejected ? '❌ Rejected' : isPaid ? '✅ Paid' : '⏳ Pending'}
                      </span>
                      <span className="text-xs text-slate-300 flex items-center gap-1.5 font-bold bg-white/10 px-3 py-1 rounded-full">
                        <Clock size={13} />
                        <span>Applied: {formatAppliedDateTime(raw.submissionDate || raw.submittedAt || raw.createdAt)}</span>
                      </span>
                    </div>
                    <h2 className="text-2xl font-bold tracking-tight text-white m-0">
                      Expense Claim ({raw.expenseType || raw.claimType || 'Expense'}) • ₹{formatINR(grandAllow || grandReq)}
                    </h2>
                    <p className="text-xs text-slate-300 font-medium mt-1 m-0">
                      Reference ID: {raw.claimNumber || raw._id}
                    </p>
                  </div>

                  {/* Modal Body */}
                  <div className="p-6 md:p-8 overflow-y-auto space-y-6 flex-1 text-left">
                    {/* Applicant Profile Card */}
                    <div className="bg-slate-50 border border-slate-200/80 rounded-3xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                      <div className="flex items-center gap-4">
                        <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-indigo-600 to-indigo-400 text-white font-bold text-xl flex items-center justify-center shadow-lg shadow-indigo-100 shrink-0">
                          {safeText(raw.employeeName || raw.submittedBy?.name || raw.submittedByName)?.charAt(0) || 'U'}
                        </div>
                        <div>
                          <h4 className="text-base font-extrabold text-slate-900 m-0">
                            {safeText(raw.employeeName || raw.submittedBy?.name || raw.submittedByName)}
                          </h4>
                          <p className="text-xs font-bold text-indigo-600 m-0 mt-0.5">
                            {safeText(raw.employeeCode || raw.submittedBy?.employeeIdCode || raw.claimNumber || 'Employee')}
                          </p>
                          <div className="flex flex-wrap items-center gap-2 mt-2 text-[11px] font-bold text-slate-500">
                            {safeText(raw.companyName) && (
                              <span className="flex items-center gap-1 bg-indigo-50 text-indigo-700 font-extrabold px-2.5 py-1 rounded-xl border border-indigo-100">
                                <Building2 size={12} className="text-indigo-600" />
                                {safeText(raw.companyName)}
                              </span>
                            )}
                            {safeText(raw.department || raw.submittedBy?.department) && (
                              <span className="flex items-center gap-1 bg-white px-2.5 py-1 rounded-xl border border-slate-200">
                                <Building2 size={12} className="text-slate-400" />
                                {safeText(raw.department || raw.submittedBy?.department)}
                              </span>
                            )}
                            {safeText(raw.designation || raw.submittedBy?.designation) && (
                              <span className="flex items-center gap-1 bg-white px-2.5 py-1 rounded-xl border border-slate-200">
                                <Briefcase size={12} className="text-slate-400" />
                                {safeText(raw.designation || raw.submittedBy?.designation)}
                              </span>
                            )}
                            {safeText(raw.managerName || raw.submittedBy?.reportsTo?.name || raw.hrReviewedBy?.name) && (
                              <span className="flex items-center gap-1 bg-white px-2.5 py-1 rounded-xl border border-slate-200" title="Reporting Manager">
                                <Users size={12} className="text-slate-400" />
                                {safeText(raw.managerName || raw.submittedBy?.reportsTo?.name || raw.hrReviewedBy?.name)}
                              </span>
                            )}
                            {safeText(raw.submittedBy?.email || raw.email) && (
                              <span className="flex items-center gap-1 bg-white px-2.5 py-1 rounded-xl border border-slate-200">
                                <Mail size={12} className="text-slate-400" />
                                {safeText(raw.submittedBy?.email || raw.email)}
                              </span>
                            )}
                            {safeText(raw.submittedBy?.phone || raw.phone) && (
                              <span className="flex items-center gap-1 bg-white px-2.5 py-1 rounded-xl border border-slate-200">
                                <Phone size={12} className="text-slate-400" />
                                {safeText(raw.submittedBy?.phone || raw.phone)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Decision Banner: payment record or rejection reason */}
                    {(isPaid || isRejected) && (
                      <div
                        className={`p-4 rounded-2xl border space-y-2 ${isRejected
                          ? 'bg-rose-50/90 border-rose-200 text-rose-900'
                          : 'bg-emerald-50/90 border-emerald-200 text-emerald-900'
                          }`}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-9 h-9 rounded-xl flex items-center justify-center text-white ${isRejected
                              ? 'bg-rose-600 shadow-md shadow-rose-200'
                              : 'bg-emerald-600 shadow-md shadow-emerald-200'
                              }`}
                          >
                            {isRejected ? <XCircle size={20} /> : <CheckCircle2 size={20} />}
                          </div>
                          <div>
                            <span className="text-[10px] font-extrabold tracking-wider block opacity-75">Final Status</span>
                            <span className="text-sm font-extrabold">
                              {isPaid ? `Paid ₹${formatINR(raw.paidAmount || raw.disbursement?.amount)}` : 'Rejected'}
                            </span>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          {(isPaid
                            ? [
                              ['Payment Date', formatDateDisplay(raw.paymentDate || raw.disbursedAt || raw.disbursement?.paymentDate)],
                              ['Reference / UTR', raw.paymentReference || raw.disbursement?.paymentReference || raw.utr],
                              ['Recorded By', raw.paidByName || raw.disbursement?.recordedByName],
                              ['Remarks', raw.disbursement?.remarks || raw.accountsRemarks],
                            ]
                            : [
                              ['Reason', raw.rejection?.reason || raw.rejectionReason],
                              ['Rejected On', (raw.rejection?.rejectedAt || raw.rejectedAt) && formatAppliedDateTime(raw.rejection?.rejectedAt || raw.rejectedAt)],
                              ['Rejected By', raw.rejection?.rejectedByName || raw.rejectedByName],
                            ]
                          )
                            .filter(([, v]) => v)
                            .map(([k, v]) => (
                              <div key={k} className={k === 'Reason' || k === 'Remarks' ? 'col-span-2' : ''}>
                                <span className="font-bold opacity-75">{k}: </span>
                                <span className="font-extrabold">{v}</span>
                              </div>
                            ))}
                        </div>
                      </div>
                    )}

                    {/* Applied Date & Claim Number Card */}
                    <div className="p-3.5 bg-indigo-50/70 rounded-2xl border border-indigo-100 flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="p-2 rounded-xl bg-white text-indigo-600 shadow-2xs border border-indigo-100">
                          <Clock size={16} />
                        </div>
                        <div>
                          <span className="text-[10px] font-extrabold text-indigo-500 block">
                            Claim Applied Date & Time
                          </span>
                          <span className="text-xs font-bold text-slate-900">
                            {formatAppliedDateTime(raw.submissionDate || raw.submittedAt || raw.createdAt)}
                          </span>
                        </div>
                      </div>
                      <span className="text-[10px] font-bold px-2.5 py-1 rounded-lg bg-indigo-600 text-white shadow-xs">
                        {raw.claimNumber || 'EXP-CLAIM'}
                      </span>
                    </div>

                    {/* Full Payment Request Banner (if applicable) */}
                    {(raw.fullPayment?.requested || raw.fullPaymentRequested) && (
                      <div className="p-4 bg-orange-50/80 rounded-2xl border border-orange-200 space-y-2.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="p-1 rounded-lg bg-orange-100 text-orange-600">
                              <Zap size={14} className="fill-orange-500 text-orange-500" />
                            </span>
                            <span className="text-xs font-extrabold text-orange-950 tracking-wider">
                              Full Payment Requested by Employee
                            </span>
                          </div>
                          <span
                            className={`px-2.5 py-0.5 rounded-lg text-[10px] font-extrabold border ${raw.fullPayment?.status === 'APPROVED' || raw.fullPaymentApproved
                              ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                              : raw.fullPayment?.status === 'REJECTED'
                                ? 'bg-rose-100 text-rose-800 border-rose-300'
                                : 'bg-amber-100 text-amber-900 border-amber-300'
                              }`}
                          >
                            {raw.fullPayment?.status || (raw.fullPaymentApproved ? 'APPROVED' : 'REQUESTED')}
                          </span>
                        </div>
                        <div className="text-xs text-slate-800 bg-white/80 p-3 rounded-xl border border-orange-200/70">
                          <span className="font-extrabold text-orange-950">Employee Reason: </span>
                          <span className="font-medium text-slate-700">
                            {raw.fullPayment?.reason || raw.fullPaymentReason || 'Full reimbursement requested.'}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Trip Information / Expense Details & Purpose */}
                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                      <span className="text-[10px] font-extrabold text-slate-400 tracking-wider block">
                        {isShowCityClaim ? 'Trip & Travel Information' : 'Expense Details & Purpose'}
                      </span>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        {customerName && (
                          <div>
                            <span className="text-slate-400 font-bold">Customer / Client: </span>
                            <span className="font-extrabold text-slate-800">{customerName}</span>
                          </div>
                        )}
                        {(raw.trip?.destination || raw.city) && (
                          <div>
                            <span className="text-slate-400 font-bold">Destination: </span>
                            <span className="font-extrabold text-slate-800">
                              {raw.trip?.destination || raw.city} {raw.trip?.destinationClass ? `(Class ${raw.trip.destinationClass})` : ''}
                            </span>
                          </div>
                        )}
                        {raw.trip?.travelMode && (
                          <div>
                            <span className="text-slate-400 font-bold">Travel Mode: </span>
                            <span className="font-extrabold text-slate-800">{raw.trip.travelMode}</span>
                          </div>
                        )}
                        <div>
                          <span className="text-slate-400 font-bold">Expense Date: </span>
                          <span className="font-extrabold text-slate-800">
                            {formatDateDisplay(raw.expenseDate || raw.claimDate || raw.fromDate)}
                          </span>
                        </div>
                        {expensePurpose && (
                          <div className="col-span-2">
                            <span className="text-slate-400 font-bold">Purpose of Expense: </span>
                            <span className="font-extrabold text-slate-800">{expensePurpose}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Calculation Breakdown & Policy Explanation Box */}
                    <div
                      className={`p-4 rounded-2xl border space-y-3 ${hasExcess ? 'bg-rose-50/70 border-rose-200 text-rose-950' : 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
                        }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-extrabold tracking-wider flex items-center gap-1.5">
                          <span>💡</span> Calculation Breakdown & Policy Explanation
                        </span>
                        {numEmployees > 1 && (
                          <span className="px-2.5 py-0.5 rounded-md bg-white border text-[10px] font-extrabold text-indigo-700 border-indigo-200 shadow-2xs">
                            👥 {numEmployees} Employees Combined ({empNames.join(', ')})
                          </span>
                        )}
                      </div>

                      {/* Grand Figures Summary Grid */}
                      <div
                        className={`grid grid-cols-2 ${isPaid ? 'sm:grid-cols-5' : 'sm:grid-cols-4'
                          } gap-2.5 p-3 bg-white rounded-xl border border-slate-200 text-center shadow-2xs`}
                      >
                        <div>
                          <span className="text-[9px] font-extrabold text-slate-400 block">Total Claimed</span>
                          <span className="text-sm font-extrabold text-slate-800">₹{formatINR(grandReq)}</span>
                        </div>
                        <div>
                          <span className="text-[9px] font-extrabold text-indigo-500 block">Policy Limit</span>
                          <span className="text-sm font-extrabold text-indigo-700">
                            {grandLimit > 0 ? `₹${formatINR(grandLimit)}` : 'Actuals'}
                          </span>
                        </div>
                        <div>
                          <span className="text-[9px] font-extrabold text-emerald-600 block">Total Allowed</span>
                          <span className="text-sm font-extrabold text-emerald-600">₹{formatINR(grandAllow)}</span>
                        </div>
                        <div>
                          <span className="text-[9px] font-extrabold text-rose-500 block">Total Excess</span>
                          <span className={`text-sm font-extrabold ${hasExcess ? 'text-rose-600' : 'text-slate-400'}`}>
                            ₹{formatINR(grandExc)}
                          </span>
                        </div>
                        {isPaid && (
                          <div>
                            <span className="text-[9px] font-extrabold text-indigo-600 block">Paid</span>
                            <span className="text-sm font-extrabold text-indigo-700">
                              ₹{formatINR(raw.paidAmount || raw.disbursement?.amount)}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Summary Explanation Text with formatting preserved */}
                      <div className="p-3.5 bg-white/95 rounded-xl border border-slate-200/80 shadow-2xs space-y-2.5">
                        {isLoggingOrFood && empLines && empLines.length > 0 ? (
                          <div className="space-y-2 text-xs">
                            {/* 1. One day each employee limit */}
                            <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                              <span className="text-[10px] font-extrabold text-slate-500 tracking-wider block mb-1">
                                👤 Individual Limits Per Day ({empLines.length} {empLines.length > 1 ? 'Employees' : 'Employee'}):
                              </span>
                              <div className="space-y-1 pl-1">
                                {empLines.map((line, lIdx) => (
                                  <div key={lIdx} className="font-semibold text-slate-800 flex items-center gap-1.5">
                                    <span className="text-indigo-600 font-extrabold">•</span>
                                    <span>{line}</span>
                                  </div>
                                ))}
                              </div>
                            </div>

                            {/* 2. Combined Policy Limit */}
                            <div className="p-2.5 bg-indigo-50/70 rounded-lg border border-indigo-200 flex items-center justify-between">
                              <span className="text-[11px] font-extrabold text-indigo-900">
                                ⚖️ {isLogging ? (numEmployees > 1 ? 'Combined Stay Policy Limit:' : 'Stay Policy Limit:') : (numEmployees > 1 ? 'Combined Daily Policy Limit:' : 'Daily Policy Limit:')}
                              </span>
                              <span className="text-xs font-bold text-indigo-700 bg-white px-2.5 py-0.5 rounded-md border border-indigo-300 shadow-2xs">
                                ₹{formatINR(grandLimit)} {isLogging ? `(${days} days)` : ''}
                              </span>
                            </div>

                            {/* 3. Allowed & Excess Calculation Breakdown */}
                            <div className={`p-2.5 rounded-lg border flex items-start gap-2 ${hasExcess ? 'bg-rose-50/70 border-rose-200 text-rose-950' : 'bg-emerald-50/70 border-emerald-200 text-emerald-950'}`}>
                              <span className="text-base">{hasExcess ? '⚠️' : '✅'}</span>
                              <div className="space-y-0.5">
                                <span className="text-[10px] font-extrabold tracking-wider block">
                                  {hasExcess ? 'Policy Excess Detected' : 'Fully Within Policy Limit'}
                                </span>
                                <p className="text-xs font-bold leading-relaxed m-0">
                                  {calcOutcomeText}
                                </p>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <p className="text-xs font-bold text-slate-800 whitespace-pre-line leading-relaxed m-0">
                            {hasExcess
                              ? `⚠️ Policy limit is ₹${formatINR(grandLimit)} and claimed value is ₹${formatINR(grandReq)}. Therefore, ₹${formatINR(grandAllow)} is allowed and ₹${formatINR(grandExc)} is excess beyond policy limits.`
                              : `✅ Claimed value: ₹${formatINR(grandReq)}. Since the amount is within policy entitlement, ₹${formatINR(grandAllow)} is fully allowed.`}
                          </p>
                        )}

                        {appliedRules.length > 0 && (
                          <div className="mt-2.5 pt-2.5 border-t border-slate-100 space-y-1.5">
                            <span className="text-[10px] font-extrabold text-slate-500 tracking-wider block">
                              {appliedRules.length > 1 ? 'Applied Rules by Type:' : 'Applied Rule:'}
                            </span>
                            {appliedRules.map((r, rIdx) => (
                              <div key={rIdx} className="text-[11px] text-slate-700 flex items-start gap-1.5 leading-relaxed">
                                <span className="font-bold text-slate-900 shrink-0">• {r.title}:</span>
                                <span className="font-medium text-slate-600">{r.formula}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Itemized Claim Entries */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-extrabold text-slate-400 tracking-wider">
                          Itemized Claim Entries ({combinedItems.length})
                        </span>
                        <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-200">
                          Detailed Item Breakdown {numEmployees > 1 ? `(${numEmployees} Employees)` : ''}
                        </span>
                      </div>

                      <div className="space-y-2.5">
                        {combinedItems.map((it, idx) => (
                          <div key={idx} className="p-4 bg-white rounded-2xl border border-slate-200 shadow-2xs space-y-2.5 text-xs">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-extrabold text-slate-900 text-sm">
                                    {combinedItems.length > 1 ? `Entry #${idx + 1}: ${it.expenseTypeName}` : it.expenseTypeName}
                                  </span>
                                  {it.expenseDate && (
                                    <span className="text-[10px] font-bold text-slate-400">
                                      {formatDateDisplay(it.expenseDate)}
                                    </span>
                                  )}
                                  {it.expenseType === 'OTHER' && it.otherSubType && (
                                    <span
                                      className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold border ${it.otherSubType === 'PURCHASE'
                                        ? 'bg-amber-50 text-amber-700 border-amber-200'
                                        : 'bg-blue-50 text-blue-700 border-blue-200'
                                        }`}
                                    >
                                      {it.otherSubType === 'PURCHASE' ? '🛒 Purchase' : '📄 Normal'}
                                    </span>
                                  )}
                                  {it.expenseType === 'OTHER' && it.barcodeNumber && (
                                    <span className="px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 border border-purple-200 text-[10px] font-mono font-bold">
                                      Barcode: {it.barcodeNumber}
                                    </span>
                                  )}
                                  {it.expenseType === 'OTHER' && it.quantity && (
                                    <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200 text-[10px] font-bold">
                                      Qty: {it.quantity}
                                    </span>
                                  )}
                                </div>
                                {it.description && (
                                  <span className="text-[11px] text-slate-500 block mt-0.5">{it.description}</span>
                                )}
                                {it.distanceKm ? (
                                  <span className="text-[10px] text-indigo-600 font-bold block mt-0.5">
                                    🚗 {it.distanceKm} km ({it.vehicle || 'Vehicle'})
                                  </span>
                                ) : null}
                              </div>

                              <div className="flex items-center gap-2">
                                <span
                                  className={`px-2.5 py-1 rounded-xl text-[10px] font-extrabold border ${it.hasExcess
                                    ? 'bg-rose-50 text-rose-700 border-rose-200'
                                    : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                    }`}
                                >
                                  {it.hasExcess ? `₹${formatINR(it.excessAmount)} Excess` : 'Fully Allowed'}
                                </span>
                              </div>
                            </div>

                            {/* Figures Grid */}
                            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 p-2.5 bg-slate-50 rounded-xl border border-slate-100 text-center">
                              <div>
                                <span className="text-[9px] font-extrabold text-slate-400 block">Claimed</span>
                                <span className="text-xs font-bold text-slate-800">₹{formatINR(it.requestedAmount)}</span>
                              </div>
                              <div>
                                <span className="text-[9px] font-extrabold text-indigo-500 block">Policy Limit</span>
                                <span className="text-xs font-bold text-indigo-700">{it.limitDisplay}</span>
                              </div>
                              <div>
                                <span className="text-[9px] font-extrabold text-emerald-600 block">Allowed</span>
                                <span className="text-xs font-bold text-emerald-600">₹{formatINR(it.allowedAmount)}</span>
                              </div>
                              {it.hasExcess && (
                                <div>
                                  <span className="text-[9px] font-extrabold text-rose-500 block">Excess</span>
                                  <span className="text-xs font-bold text-rose-600">₹{formatINR(it.excessAmount)}</span>
                                </div>
                              )}
                            </div>

                            {/* Entry proof links */}
                            {Array.isArray(it.attachments) && it.attachments.length > 0 && (
                              <div className="flex flex-wrap gap-2 pt-1">
                                {it.attachments.map((att, aIdx) => (
                                  <a
                                    key={aIdx}
                                    href={att.url || att.uri}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-indigo-50 border border-slate-200 hover:border-indigo-300 rounded-xl text-[11px] font-extrabold text-indigo-600 transition-all shadow-sm"
                                    title="Click to preview bill proof"
                                  >
                                    <span>🧾 {att.name || `Bill Proof #${aIdx + 1}`}</span>
                                  </a>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Deduplicated Proofs & Documents Attachments */}
                    {billProofs.length > 0 && (
                      <div className="p-4 bg-indigo-50/50 rounded-2xl border border-indigo-200/70 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-extrabold text-indigo-950 tracking-wider flex items-center gap-1.5">
                            <span>🧾</span> Attached Bill Proofs & Receipts ({billProofs.length})
                          </span>
                          <span className="text-[10px] font-bold text-indigo-600 bg-white px-2 py-0.5 rounded-md border border-indigo-200">
                            Verified Documents
                          </span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          {billProofs.map((proof, idx) => {
                            const pUrl = proof.url || proof.uri;
                            const pName = proof.name || `Receipt Document #${idx + 1}`;
                            const isPdf = proof.type === 'application/pdf' || (pName && pName.toLowerCase().endsWith('.pdf'));
                            return (
                              <div
                                key={idx}
                                className="p-2.5 bg-white rounded-xl border border-slate-200 hover:border-indigo-300 transition-all flex items-center justify-between gap-2 shadow-2xs"
                              >
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <div
                                    className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold shrink-0 ${isPdf ? 'bg-rose-50 text-rose-600 border border-rose-200' : 'bg-indigo-50 text-indigo-600 border border-indigo-200'
                                      }`}
                                  >
                                    {isPdf ? '📄' : '🧾'}
                                  </div>
                                  <div className="min-w-0">
                                    <span className="text-xs font-bold text-slate-800 block truncate" title={pName}>
                                      {pName}
                                    </span>
                                    <span className="text-[10px] text-slate-400 font-medium block">
                                      Document {proof.size ? `• ${(proof.size / 1024).toFixed(0)} KB` : ''}
                                    </span>
                                  </div>
                                </div>
                                {pUrl && (
                                  <a
                                    href={pUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-[11px] font-bold shrink-0 transition-colors"
                                    title="Click to view full receipt document"
                                  >
                                    View ↗
                                  </a>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Service reports if any */}
                    {serviceReports.length > 0 && (
                      <div className="p-4 bg-teal-50/50 rounded-2xl border border-teal-200/70 space-y-3">
                        <span className="text-xs font-extrabold text-teal-950 tracking-wider block">
                          📋 Service Reports ({serviceReports.length})
                        </span>
                        <div className="flex flex-wrap gap-2">
                          {serviceReports.map((sr, idx) => (
                            <a
                              key={idx}
                              href={sr.url || sr.uri}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-teal-100 border border-teal-300 rounded-xl text-[11px] font-extrabold text-teal-900 transition-all shadow-sm"
                            >
                              <span>📋 {sr.name || `Service Report #${idx + 1}`}</span>
                            </a>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Full payment proofs if any */}
                    {fullPaymentProofs.length > 0 && (
                      <div className="p-4 bg-orange-50/50 rounded-2xl border border-orange-200/70 space-y-3">
                        <span className="text-xs font-extrabold text-orange-950 tracking-wider block">
                          ⚡ Full Payment Proofs ({fullPaymentProofs.length})
                        </span>
                        <div className="flex flex-wrap gap-2">
                          {fullPaymentProofs.map((fp, idx) => (
                            <a
                              key={idx}
                              href={fp.url || fp.uri}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-orange-100 border border-orange-300 rounded-xl text-[11px] font-extrabold text-orange-900 transition-all shadow-sm"
                            >
                              <span>⚡ {fp.name || `Approval Proof #${idx + 1}`}</span>
                            </a>
                          ))}
                        </div>
                      </div>
                    )}


                  </div>

                  {/* Modal Footer */}
                  <div className="p-6 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-3 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => setDetailClaim(null)}
                      className="px-6 py-3 rounded-2xl font-bold text-xs text-slate-600 bg-white border border-slate-200 hover:bg-slate-100 transition-all cursor-pointer"
                    >
                      Close Details
                    </button>
                  </div>
                </motion.div>
              </div>
            );
          })()}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
};

export default ExpenseReportPage;
