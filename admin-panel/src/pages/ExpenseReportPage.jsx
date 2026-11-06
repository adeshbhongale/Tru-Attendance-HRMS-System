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
  Bed,
  Briefcase,
  Building2,
  Calendar,
  Car,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  FileSpreadsheet,
  FileText,
  IndianRupee,
  Layers,
  ListFilter,
  Loader2,
  Mail,
  MapPin,
  Package,
  Phone,
  Plane,
  Receipt,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  Users,
  Utensils,
  Wrench,
  X,
  XCircle,
  Zap
} from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import toast from 'react-hot-toast';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import api from '../api/axios';
import ExpenseClaimDetailContent from '../components/ExpenseClaimDetailContent';
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

const formatExpDateDisplay = (dStr) => {
  if (!dStr) return '';
  try {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    let str = '';
    if (dStr instanceof Date) {
      str = dStr.toISOString();
    } else if (typeof dStr === 'number') {
      const d = new Date(dStr);
      str = !isNaN(d.getTime()) ? d.toISOString() : '';
    } else {
      str = String(dStr).trim();
    }
    const match = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      const year = match[1];
      const monthIdx = parseInt(match[2], 10) - 1;
      const day = String(parseInt(match[3], 10)).padStart(2, '0');
      if (monthIdx >= 0 && monthIdx < 12) {
        return `${day} ${months[monthIdx]} ${year}`;
      }
    }
    const matchDMY = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
    if (matchDMY) {
      const day = String(parseInt(matchDMY[1], 10)).padStart(2, '0');
      const monthIdx = parseInt(matchDMY[2], 10) - 1;
      const year = matchDMY[3];
      if (monthIdx >= 0 && monthIdx < 12) {
        return `${day} ${months[monthIdx]} ${year}`;
      }
    }
    const d = new Date(dStr);
    if (isNaN(d.getTime())) return String(dStr);
    return d.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  } catch (_) {
    return String(dStr);
  }
};

const normStr = (v) => String(v || '').trim().toLowerCase();
const MANAGEMENT_ROLES = [
  'management', 'company_admin', 'companyadmin', 'admin',
  'super_admin', 'superadmin', 'tcca1', 'tcsa1', 'tcmgt',
  'tcdr1a', 'tcdr2a', 'vp', 'avp', 'general_manager', 'director', 'ceo'
];

const isManagementFiler = (u) => {
  if (!u) return false;
  const role = normStr(u.role);
  const roleCode = String(u.roleCode || '').trim().toUpperCase();
  if (MANAGEMENT_ROLES.some((t) => role === t || normStr(roleCode) === t)) return true;
  const desig = normStr(u.designation);
  const dept = normStr(u.department);
  const cat = String(u.levelRef?.category || u.effectiveCategory || u.category || '').trim().toUpperCase();
  const deptAdminType = normStr(u.departmentAdminType || u.adminType);
  if (cat === 'MANAGEMENT') return true;
  if (['management', 'general_manager', 'vp', 'avp', 'ceo', 'director'].includes(role)) return true;
  if (/^(TC(MN)|MANAGEMENT|TCMGT|VP|AVP|GM|CEO|TCCA|TCSA|TCDR|TCDI)/i.test(roleCode)) return true;
  if (deptAdminType === 'management') return true;
  if (/^(management|executive|director|directors|board of directors|bod)$/i.test(dept) || /management/i.test(dept)) return true;
  if (/(ceo|vp|vice president|general manager|president|chairman|director|^management$)/i.test(desig)) return true;
  const resp = Array.isArray(u.responsibilityCodes)
    ? u.responsibilityCodes
    : (u.responsibilityCodes ? [String(u.responsibilityCodes)] : []);
  if (resp.some((r) => String(r).toUpperCase().trim() === 'MANAGEMENT_APPROVER')) return true;
  return false;
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

const getTravelModeIcon = (modeName = '', subtypeName = '') => {
  const s = `${modeName || ''} ${subtypeName || ''}`.toLowerCase();
  if (/(metro)/.test(s)) return '🚇';
  if (/(train|rail|irctc|vande|shatabdi|rajdhani|express|ac\s*i|ac\s*ii|ac\s*iii|sleeper|chair\s*car|iind\s*class|1st\s*class|2nd\s*class|3rd\s*class)/.test(s)) return '🚆';
  if (/(flight|air|plane|economy|business\s*class|aviation)/.test(s)) return '✈️';
  if (/(bus|volvo|sleeper\s*coach|seater)/.test(s)) return '🚌';
  if (/(auto|rickshaw|tuk)/.test(s)) return '🛺';
  if (/(taxi|cab|uber|ola|rapido)/.test(s)) return '🚕';
  if (/(bike|two\s*wheeler|2-wheeler|2\s*wheeler|motorcycle|scooter|scooty|ebike|e-bike)/.test(s)) return '🏍️';
  if (/(car|four\s*wheeler|4-wheeler|4\s*wheeler|4w|suv|sedan|own\s*vehicle|vehicle|ecar|e-car)/.test(s)) return '🚗';
  if (/(ferry|ship|boat|water)/.test(s)) return '⛴️';
  return '🚆';
};

const isClaimConveyance = (raw) => {
  if (!raw) return false;
  const cType = (raw.claimType || raw.expenseType || '').toUpperCase().trim();
  if (cType === 'CONVEYANCE' || cType === 'LOCAL_CONVEYANCE') return true;
  const entries = Array.isArray(raw.entries) ? raw.entries : [];
  if (entries.length > 0 && entries.every((e) => {
    const t = (e?.expenseType || '').toUpperCase().trim();
    return t === 'CONVEYANCE' || t === 'LOCAL_CONVEYANCE';
  })) return true;
  const ecList = Array.isArray(raw.employeeClaims) ? raw.employeeClaims : [];
  const items = ecList.flatMap((ec) => (Array.isArray(ec.items) ? ec.items : []));
  if (items.length > 0 && items.every((it) => {
    const t = (it?.expenseType || '').toUpperCase().trim();
    return t === 'CONVEYANCE' || t === 'LOCAL_CONVEYANCE';
  })) return true;
  return false;
};

const getResolvedClaimType = (raw) => {
  if (!raw) return { code: 'OTHER', label: 'Expense' };
  const rawEntries = Array.isArray(raw.entries) ? raw.entries : [];
  const firstEcItems = Array.isArray(raw.employeeClaims?.[0]?.items) ? raw.employeeClaims[0].items : [];
  const cMode = String(raw.claimMode || '').toUpperCase().trim();
  const hasLodgingWithFood =
    cMode === 'LODGING' &&
    Boolean(raw.includeFood || (Array.isArray(raw.foodEntries) && raw.foodEntries.length > 0));
  const rawClaimType = String(raw.expenseTypeCode || raw.claimType || raw.expenseType || '').toUpperCase().trim();

  if (
    rawEntries.length > 1 ||
    firstEcItems.length > 1 ||
    hasLodgingWithFood ||
    rawClaimType === 'COMBINE' ||
    rawClaimType === 'COMBINED'
  ) {
    return { code: 'COMBINE', label: 'Combine' };
  }

  const singleEntry = rawEntries[0] || firstEcItems[0] || {};
  const rawType = String(
    singleEntry.expenseType ||
    singleEntry.claimType ||
    singleEntry.type ||
    rawClaimType ||
    (cMode === 'LODGING' ? 'LODGING' : '')
  ).toUpperCase().trim();
  const rawSub = String(
    singleEntry.otherSubType ||
    singleEntry.subType ||
    raw.otherSubType ||
    ''
  ).toUpperCase().trim();

  if (
    rawType === 'STOCK_PURCHASE' ||
    rawType === 'STOCK PURCHASE' ||
    ((rawType === 'OTHER' || rawType === 'OTHER_EXPENSE' || rawType === 'OTHER EXPENSE' || !rawType) &&
      (rawSub === 'PURCHASE' || rawSub === 'STOCK_PURCHASE'))
  ) {
    return { code: 'STOCK_PURCHASE', label: 'Stock Purchase' };
  }
  if (rawType === 'LODGING' || rawType === 'LODGING_EXPENSE' || cMode === 'LODGING') {
    return { code: 'LODGING', label: 'Lodging' };
  }
  if (rawType === 'FOOD' || rawType === 'FOOD_DA' || rawType === 'FOOD_EXPENSE') {
    return { code: 'FOOD', label: 'Food' };
  }
  if (rawType === 'TRAVEL' || rawType === 'TRAVEL_EXPENSE') {
    return { code: 'TRAVEL', label: 'Travel' };
  }
  if (rawType === 'CONVEYANCE' || rawType === 'LOCAL_CONVEYANCE' || rawType === 'LOCAL CONVEYANCE' || rawType === 'LOCAL_TRAVEL' || rawType === 'LOCAL') {
    return { code: 'CONVEYANCE', label: 'Local Conveyance' };
  }
  if (rawType === 'OTHER' || rawType === 'OTHER_EXPENSE' || rawType === 'OTHER EXPENSE') {
    return { code: 'OTHER', label: 'Other Expense' };
  }
  return { code: rawType || 'OTHER', label: raw.expenseType || raw.claimType || 'Expense' };
};

const getClaimProofs = (raw) => {
  if (!raw) return { billProofs: [], serviceReports: [], fullPaymentProofs: [], numberPlatePhotos: [], startKmPhotos: [], endKmPhotos: [] };

  const isClaimConv = isClaimConveyance(raw);

  const npMap = new Map();
  const addNp = (r) => {
    if (!r) return;
    const key = r.url || r.uri || r._id || r.name;
    if (key && !npMap.has(key)) npMap.set(key, r);
  };
  if (Array.isArray(raw.numberPlatePhotos)) raw.numberPlatePhotos.forEach(addNp);

  const skMap = new Map();
  const addSk = (r) => {
    if (!r) return;
    const key = r.url || r.uri || r._id || r.name;
    if (key && !skMap.has(key)) skMap.set(key, r);
  };
  if (Array.isArray(raw.startKmPhotos)) raw.startKmPhotos.forEach(addSk);

  const ekMap = new Map();
  const addEk = (r) => {
    if (!r) return;
    const key = r.url || r.uri || r._id || r.name;
    if (key && !ekMap.has(key)) ekMap.set(key, r);
  };
  if (Array.isArray(raw.endKmPhotos)) raw.endKmPhotos.forEach(addEk);

  if (Array.isArray(raw.entries)) {
    raw.entries.forEach((e) => {
      if (Array.isArray(e?.numberPlatePhotos)) e.numberPlatePhotos.forEach(addNp);
      if (Array.isArray(e?.startKmPhotos)) e.startKmPhotos.forEach(addSk);
      if (Array.isArray(e?.endKmPhotos)) e.endKmPhotos.forEach(addEk);
    });
  }
  if (Array.isArray(raw.employeeClaims)) {
    raw.employeeClaims.forEach((ec) => {
      (ec.items || []).forEach((it) => {
        if (Array.isArray(it?.numberPlatePhotos)) it.numberPlatePhotos.forEach(addNp);
        if (Array.isArray(it?.startKmPhotos)) it.startKmPhotos.forEach(addSk);
        if (Array.isArray(it?.endKmPhotos)) it.endKmPhotos.forEach(addEk);
      });
    });
  }

  const billMap = new Map();
  const addBill = (r) => {
    if (!r || isClaimConv) return;
    const key = r.url || r.uri || r._id || r.name;
    if (key && !billMap.has(key) && !npMap.has(key) && !skMap.has(key) && !ekMap.has(key)) {
      billMap.set(key, r);
    }
  };

  if (!isClaimConv) {
    if (Array.isArray(raw.receipts)) raw.receipts.forEach(addBill);
    if (Array.isArray(raw.entries)) {
      raw.entries.forEach((e) => {
        const isEntryConv = (e?.expenseType || '').toUpperCase().trim() === 'CONVEYANCE' || (e?.expenseType || '').toUpperCase().trim() === 'LOCAL_CONVEYANCE';
        if (!isEntryConv) {
          if (Array.isArray(e?.receipts)) e.receipts.forEach(addBill);
          if (Array.isArray(e?.attachments)) e.attachments.forEach(addBill);
        }
      });
    }
    if (Array.isArray(raw.employeeClaims)) {
      raw.employeeClaims.forEach((ec) => {
        (ec.items || []).forEach((it) => {
          const isItemConv = (it?.expenseType || '').toUpperCase().trim() === 'CONVEYANCE' || (it?.expenseType || '').toUpperCase().trim() === 'LOCAL_CONVEYANCE';
          if (!isItemConv) {
            if (Array.isArray(it?.attachments)) it.attachments.forEach(addBill);
            if (Array.isArray(it?.receipts)) it.receipts.forEach(addBill);
          }
        });
      });
    }
    if (Array.isArray(raw.attachments)) raw.attachments.forEach(addBill);
  }

  const srMap = new Map();
  const addSr = (r) => {
    if (!r) return;
    const key = r.url || r.uri || r._id || r.name;
    if (key && !srMap.has(key)) {
      srMap.set(key, r);
    }
  };
  if (Array.isArray(raw.serviceReports)) raw.serviceReports.forEach(addSr);
  if (Array.isArray(raw.entries)) {
    raw.entries.forEach((e) => {
      if (Array.isArray(e?.serviceReports)) e.serviceReports.forEach(addSr);
      if (e?.conveyanceKm && Array.isArray(e.conveyanceKm.serviceReports)) e.conveyanceKm.serviceReports.forEach(addSr);
    });
  }
  if (Array.isArray(raw.employeeClaims)) {
    raw.employeeClaims.forEach((ec) => {
      (ec.items || []).forEach((it) => {
        if (Array.isArray(it?.serviceReports)) it.serviceReports.forEach(addSr);
        if (it?.conveyanceKm && Array.isArray(it.conveyanceKm.serviceReports)) it.conveyanceKm.serviceReports.forEach(addSr);
      });
    });
  }

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
    billProofs: isClaimConv ? [] : Array.from(billMap.values()),
    serviceReports: Array.from(srMap.values()),
    fullPaymentProofs: Array.from(fpMap.values()),
    numberPlatePhotos: Array.from(npMap.values()),
    startKmPhotos: Array.from(skMap.values()),
    endKmPhotos: Array.from(ekMap.values()),
  };
};

const formatDateYYYYMMDD = (d) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Status styles: Pending, Approved • Payment Pending, Paid.
const STATUS_STYLE = {
  PENDING: { label: 'Pending', cls: 'bg-amber-50 text-amber-800 border-amber-200' },
  PENDING_APPROVAL: { label: 'Pending', cls: 'bg-amber-50 text-amber-800 border-amber-200' },
  ACCOUNTS_APPROVED: { label: 'Approved • Payment Pending', cls: 'bg-teal-50 text-teal-700 border-teal-200' },
  APPROVED: { label: 'Approved • Payment Pending', cls: 'bg-teal-50 text-teal-700 border-teal-200' },
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
    visitType: '',
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

const FilterField = ({ label, icon: Icon, action, children }) => (
  <div className="space-y-1">
    <div className="flex items-center justify-between gap-1">
      <label className="font-bold text-slate-500 text-[10px] tracking-wider flex items-center gap-1">
        {Icon && <Icon size={11} className="text-indigo-600 shrink-0" />}
        <span>{label}</span>
      </label>
      {action}
    </div>
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
  const isAccountAdmin = (userRole === 'account_admin' || userRole === 'accounts' || userRole === 'account' || userRole === 'finance' || userRoleCode === 'TCAC1A' || userRoleCode === 'TCACA' || userRoleCode === 'ACCOUNTS_ADMIN' || user?.departmentAdminType === 'accounts') && !isSuperAdmin && !isCompanyAdmin;

  const showActionsColumn = !isHRAdmin;

  // Pagination & Sorting
  const [reportPage, setReportPage] = useState(1);
  const [reportLimit, setReportLimit] = useState(15);
  const [sort, setSort] = useState({ field: 'submittedAt', direction: 'desc' });

  // Unified filters state: changes apply directly to Expense Date and scope.
  const [filters, setFilters] = useState(() => ({ ...getInitialFilters(), ...initialFilters }));
  const setFilter = (key) => (val) => {
    setFilters((f) => ({ ...f, [key]: val === 'ALL' ? '' : val }));
    setReportPage(1);
  };

  // Data
  const [reportLoading, setReportLoading] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [claimsReportData, setClaimsReportData] = useState([]);
  const [reportPagination, setReportPagination] = useState({ total: 0, totalPages: 1, page: 1, limit: 15 });
  const [summary, setSummary] = useState({});
  const [options, setOptions] = useState({ employees: [], managers: [], workLocations: [], departments: [], cities: [], expenseTypes: [] });

  // Claim detail modal
  const [detailClaim, setDetailClaim] = useState(null);
  const [activeDownloadBtn, setActiveDownloadBtn] = useState(null); // 'header' | 'bottom' | null
  const downloadingClaimPdf = Boolean(activeDownloadBtn);

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
    if (detailClaim) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [detailClaim]);

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
          expenseType: getResolvedClaimType(full).label || prev?.expenseType || full.claimType,
        }));
      }
    } catch (err) {
      console.warn('Could not fetch full claim details from server, using report snapshot:', err);
    }
  };

  // ── Download Individual Claim in PDF Format ──
  const handleDownloadClaimPdf = async (claimToDownload, btnKey = 'bottom') => {
    const c = claimToDownload || detailClaim;
    if (!c?._id || downloadingClaimPdf) return;
    setActiveDownloadBtn(btnKey);
    try {
      const res = await api.get(`/expense/claims/${c._id}/pdf`, { responseType: 'blob' });
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Claim_${c.claimNumber || c.claimId || c._id}.pdf`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.success('Claim PDF downloaded successfully');
    } catch (err) {
      console.error('Download claim PDF error:', err);
      toast.error(err?.response?.data?.message || 'Failed to download claim PDF');
    } finally {
      setActiveDownloadBtn(null);
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

  // ── Export Claims Report to Excel (.xlsx) ──
  const handleExportExcel = async () => {
    try {
      const res = await api.get('/expense/reports', { params: { ...queryParams(), page: 1, limit: 1000 } });
      const rawRows = res.data?.data || [];
      const rows = rawRows.filter((c) => c && c.status !== 'APPROVAL_PENDING' && c.statusLabel !== 'Awaiting Approval');
      if (!rows.length) return toast.error('No claim data to export');

      const excelData = rows.map((c) => ({
        'Claim ID': c.claimNumber || '',
        'Employee': c.employeeName ? `${c.employeeName}${c.employeeCode ? ` (${c.employeeCode})` : ''}` : '',
        'Customer': c.customerName || '-',
        'City': c.city || c.workLocation || '-',
        'Expense Type': getResolvedClaimType(c).label || c.expenseType || '-',
        'Expense Date': formatDateDisplay(c.expenseDate),
        'Submitted': formatDateDisplay(c.submittedAt),
        'Claimed': Number(c.claimedAmount || 0),
        'Allowed': Number(c.allowedAmount || 0),
        'Excess': Number(c.excessAmount || 0),
        'Paid Amount': c.status === 'PAID' ? Number(c.paidAmount || 0) : 0,
        'Status': c.statusLabel || c.status || '',
        'Lodging': Number(c.lodging || 0),
        'Food': Number(c.food || 0),
        'Travel': Number(c.travel || 0),
        'Local': Number(c.local || 0),
        'Other': Number(c.other || 0),
      }));

      const ws = XLSX.utils.json_to_sheet(excelData);
      ws['!cols'] = [
        { wch: 22 }, // Claim ID
        { wch: 22 }, // Employee
        { wch: 18 }, // Customer
        { wch: 15 }, // City
        { wch: 14 }, // Expense Type
        { wch: 13 }, // Expense Date
        { wch: 13 }, // Submitted
        { wch: 12 }, // Claimed
        { wch: 12 }, // Allowed
        { wch: 12 }, // Excess
        { wch: 13 }, // Paid Amount
        { wch: 12 }, // Status
        { wch: 11 }, // Lodging
        { wch: 11 }, // Food
        { wch: 11 }, // Travel
        { wch: 11 }, // Local
        { wch: 11 }, // Other
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Expense Claims');
      XLSX.writeFile(wb, `Expense_Claims_Report_${new Date().toISOString().slice(0, 10)}.xlsx`);
      toast.success('Excel report exported successfully');
    } catch (err) {
      console.error('Failed to export Excel report:', err);
      toast.error('Failed to export Excel report');
    }
  };

  // ── Export Claims Report to PDF (first 200 matching claims) ──
  const handleExportPDF = async () => {
    try {
      const res = await api.get('/expense/reports', { params: { ...queryParams(), page: 1, limit: 200 } });
      const rawRows = res.data?.data || [];
      const rows = rawRows.filter((c) => c && c.status !== 'APPROVAL_PENDING' && c.statusLabel !== 'Awaiting Approval');
      if (!rows.length) return toast.error('No claim data to export');
      if ((res.data.pagination?.total || 0) > rows.length) toast(`PDF includes the first ${rows.length} claims. Use Excel / CSV for the full report.`);

      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      doc.setFontSize(13);
      doc.setTextColor(79, 70, 229);
      doc.text('Expense Claims Report', 14, 13);
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139);
      doc.text(
        `Generated: ${new Date().toLocaleString()} | Claims: ${summary.totalClaims || 0} | Paid: Rs ${formatINR(summary.totalPaidAmount)} | Rejected: Rs ${formatINR(summary.totalRejectedAmount)}`,
        14,
        18
      );

      autoTable(doc, {
        head: [[
          'Claim ID',
          'Employee',
          'Customer',
          'City',
          'Expense Type',
          'Expense Date',
          'Submitted',
          'Claimed',
          'Allowed',
          'Excess',
          'Paid Amount',
          'Status',
          'Lodging',
          'Food',
          'Travel',
          'Local',
          'Other',
        ]],
        body: rows.map((c) => [
          c.claimNumber || '-',
          c.employeeName ? `${c.employeeName}${c.employeeCode ? `\n(${c.employeeCode})` : ''}` : '-',
          c.customerName || '-',
          c.city || c.workLocation || '-',
          getResolvedClaimType(c).label || c.expenseType || '-',
          formatDateDisplay(c.expenseDate),
          formatDateDisplay(c.submittedAt),
          formatINR(c.claimedAmount),
          formatINR(c.allowedAmount),
          formatINR(c.excessAmount),
          c.status === 'PAID' ? formatINR(c.paidAmount) : '0',
          c.statusLabel || c.status || '-',
          formatINR(c.lodging || 0),
          formatINR(c.food || 0),
          formatINR(c.travel || 0),
          formatINR(c.local || 0),
          formatINR(c.other || 0),
        ]),
        startY: 22,
        theme: 'grid',
        styles: { fontSize: 6, cellPadding: 1.5, overflow: 'linebreak' },
        headStyles: { fillColor: [79, 70, 229], textColor: [255, 255, 255], fontStyle: 'bold' },
        columnStyles: {
          0: { fontStyle: 'bold' },
          7: { halign: 'right' },
          8: { halign: 'right' },
          9: { halign: 'right' },
          10: { halign: 'right', fontStyle: 'bold' },
          12: { halign: 'right' },
          13: { halign: 'right' },
          14: { halign: 'right' },
          15: { halign: 'right' },
          16: { halign: 'right' },
        },
      });

      doc.save(`Expense_Claims_Report_${new Date().toISOString().slice(0, 10)}.pdf`);
      toast.success('PDF report exported successfully');
    } catch (err) {
      console.error('Failed to export PDF report:', err);
      toast.error('Failed to export PDF');
    }
  };

  const optionList = (arr, labelKey = 'name') => (arr || []).map((o) => (typeof o === 'string' ? { value: o, label: o } : { value: o._id, label: o[labelKey], sublabel: o.employeeIdCode ? `(${o.employeeIdCode})` : '' }));

  const activeFiltersCount = [
    filters.search,
    filters.employeeId,
    filters.city,
    filters.status,
    filters.visitType,
    filters.expenseType,
    filters.expenseFrom,
    filters.expenseTo,
  ].filter(Boolean).length;

  const resetAllFilters = () => {
    setFilters({
      search: '',
      employeeId: '',
      city: '',
      status: '',
      visitType: '',
      expenseType: '',
      expenseFrom: '',
      expenseTo: '',
    });
    setReportPage(1);
  };

  // Never show awaiting approval claims (or claims not yet approved by Reporting Manager & CFO) in the expense report table.
  const visibleClaims = (claimsReportData || []).filter((c) => {
    if (!c) return false;
    if (c.status === 'APPROVAL_PENDING' || c.statusLabel === 'Awaiting Approval' || c.legacyStatus === 'APPROVAL_PENDING') return false;
    const ma = String(c.managerApprovalStatus || c.managerApproval?.status || '').toUpperCase();
    const fa = String(c.financeApprovalStatus || c.financeApproval?.status || '').toUpperCase();
    if (ma === 'PENDING' || fa === 'PENDING') return false;
    if (isAccountAdmin && (ma === 'REJECTED' || fa === 'REJECTED')) return false;
    return true;
  });

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
                  className="absolute right-0 mt-2 w-52 bg-white rounded-2xl shadow-2xl border border-slate-100 py-2 z-[120] overflow-hidden"
                >
                  <button
                    onClick={() => {
                      handleExportExcel();
                      setShowExportOptions(false);
                    }}
                    className="w-full px-4 py-2.5 text-left text-xs font-bold text-slate-700 hover:bg-slate-50 hover:text-emerald-600 transition-colors flex items-center gap-2.5 cursor-pointer"
                  >
                    <FileSpreadsheet size={15} className="text-emerald-600" />
                    Export Excel Report (.xlsx)
                  </button>
                  <button
                    onClick={() => {
                      handleExportCSV();
                      setShowExportOptions(false);
                    }}
                    className="w-full px-4 py-2.5 text-left text-xs font-bold text-slate-700 hover:bg-slate-50 hover:text-indigo-600 transition-colors flex items-center gap-2.5 cursor-pointer"
                  >
                    <FileSpreadsheet size={15} className="text-indigo-600" />
                    Export CSV Report (.csv)
                  </button>
                  <button
                    onClick={() => {
                      handleExportPDF();
                      setShowExportOptions(false);
                    }}
                    className="w-full px-4 py-2.5 text-left text-xs font-bold text-slate-700 hover:bg-slate-50 hover:text-rose-600 transition-colors flex items-center gap-2.5 cursor-pointer"
                  >
                    <FileText size={15} className="text-rose-600" />
                    Export PDF Report (.pdf)
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
      <div className="bg-white border border-slate-200 rounded-2xl p-3.5 md:p-4 shadow-2xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <ListFilter size={14} className="text-indigo-600" />
            <span className="text-xs font-bold text-slate-700 tracking-wider">
              Filter Expense Claims
            </span>
            {activeFiltersCount > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-extrabold">
                {activeFiltersCount} Active
              </span>
            )}
          </div>
          {activeFiltersCount > 0 && (
            <button
              type="button"
              onClick={resetAllFilters}
              className="text-xs font-bold text-rose-600 hover:text-rose-700 flex items-center gap-1 cursor-pointer"
            >
              <X size={13} />
              Reset All Filters
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-2.5 text-xs">
          <FilterField label="Employee" icon={Users}>
            <SearchableDropdown
              options={optionList(options.employees)}
              value={filters.employeeId || 'ALL'}
              onChange={setFilter('employeeId')}
              allOption={{ label: 'All Employees', value: 'ALL' }}
              searchPlaceholder="Search employee name or code..."
              placeholder="All Employees"
              icon={Users}
            />
          </FilterField>

          <FilterField label="City / Work Location" icon={MapPin}>
            <SearchableDropdown
              options={optionList(options.cities)}
              value={filters.city || 'ALL'}
              onChange={setFilter('city')}
              allOption={{ label: 'All Cities', value: 'ALL' }}
              searchPlaceholder="Search city..."
              placeholder="All Cities"
              icon={MapPin}
            />
          </FilterField>

          <FilterField label="Status" icon={ShieldCheck}>
            <SearchableDropdown
              options={[
                { value: 'PENDING_APPROVAL', label: 'Pending', icon: Clock, iconColor: 'text-amber-600' },
                { value: 'ACCOUNTS_APPROVED', label: 'Approved • Payment Pending', icon: CheckCircle2, iconColor: 'text-teal-600' },
                { value: 'PAID', label: 'Paid', icon: CheckCircle2, iconColor: 'text-emerald-600' },
                ...(!isAccountAdmin ? [{ value: 'REJECTED', label: 'Rejected', icon: XCircle, iconColor: 'text-rose-600' }] : []),
              ]}
              value={filters.status || 'ALL'}
              onChange={setFilter('status')}
              allOption={{ label: 'All Statuses', value: 'ALL' }}
              placeholder="All Statuses"
              icon={ShieldCheck}
              searchable={false}
            />
          </FilterField>

          <FilterField label="Visit Option" icon={Briefcase}>
            <SearchableDropdown
              options={[
                { value: 'NO_VISIT', label: 'Normal Travel', icon: Building2, iconColor: 'text-sky-600' },
                { value: 'VISIT', label: 'Service Call', icon: Wrench, iconColor: 'text-indigo-600' },
              ]}
              value={filters.visitType || 'ALL'}
              onChange={setFilter('visitType')}
              allOption={{ label: 'All Visit Options', value: 'ALL' }}
              placeholder="All Visit Options"
              icon={Briefcase}
              searchable={false}
            />
          </FilterField>

          <FilterField label="Expense Type" icon={Layers}>
            <SearchableDropdown
              options={[
                { value: 'COMBINE', label: 'Combine', icon: Layers, iconColor: 'text-violet-600' },
                { value: 'LODGING', label: 'Lodging', icon: Bed, iconColor: 'text-indigo-600' },
                { value: 'FOOD', label: 'Food', icon: Utensils, iconColor: 'text-amber-600' },
                { value: 'TRAVEL', label: 'Travel', icon: Plane, iconColor: 'text-sky-600' },
                { value: 'CONVEYANCE', label: 'Local Conveyance', icon: Car, iconColor: 'text-emerald-600' },
                { value: 'OTHER', label: 'Other Expense', icon: FileText, iconColor: 'text-slate-600' },
                { value: 'STOCK_PURCHASE', label: 'Stock Purchase', icon: Package, iconColor: 'text-purple-600' },
              ]}
              value={filters.expenseType || 'ALL'}
              onChange={setFilter('expenseType')}
              allOption={{ label: 'All Expense Types', value: 'ALL' }}
              placeholder="All Expense Types"
              icon={Layers}
              searchable={false}
            />
          </FilterField>

          <FilterField
            label="From Date"
            icon={Calendar}
            action={
              filters.expenseFrom ? (
                <button
                  type="button"
                  onClick={() => setFilter('expenseFrom')('')}
                  className="text-[10px] text-rose-500 hover:text-rose-700 font-bold"
                >
                  Clear
                </button>
              ) : null
            }
          >
            <input
              type="date"
              value={filters.expenseFrom}
              max={filters.expenseTo || undefined}
              onChange={(e) => setFilter('expenseFrom')(e.target.value)}
              className={inputCls}
            />
          </FilterField>

          <FilterField
            label="To Date"
            icon={Calendar}
            action={
              filters.expenseTo ? (
                <button
                  type="button"
                  onClick={() => setFilter('expenseTo')('')}
                  className="text-[10px] text-rose-500 hover:text-rose-700 font-bold"
                >
                  Clear
                </button>
              ) : null
            }
          >
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
          sub={
            summary.pendingClaims
              ? `${summary.pendingApprovalClaims || 0} pending • ${summary.approvedClaims || 0} approved`
              : null
          }
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
              ) : visibleClaims.length === 0 ? (
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
                visibleClaims.map((claim) => {
                  const statusKey =
                    (claim.displayStatus === 'ACCOUNTS_APPROVED' ||
                      claim.rawStatus === 'ACCOUNTS_APPROVED' ||
                      claim.isAccountsApproved) &&
                    claim.status === 'PENDING'
                      ? 'ACCOUNTS_APPROVED'
                      : claim.status;
                  const st = STATUS_STYLE[statusKey] || STATUS_STYLE.PENDING;
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
                        <div className="font-bold text-slate-800 text-xs">{getResolvedClaimType(claim).label || claim.expenseType || 'General'}</div>
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
                                e.preventDefault();
                                e.stopPropagation();
                                const targetTab =
                                  statusKey === 'ACCOUNTS_APPROVED'
                                    ? 'approved_claims'
                                    : statusKey === 'PAID' || statusKey === 'REJECTED'
                                      ? 'expense_history'
                                      : 'expense_claims';
                                navigate('/pending-approvals', { state: { targetClaimId: claim._id, tab: targetTab } });
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
            const claimMode = (raw.claimMode || '').toUpperCase().trim();
            const claimType = (raw.claimType || raw.expenseType || 'Expense').toUpperCase().trim();
            const showCityClaimTypes = ['TRAVEL', 'TOUR', 'TRIP', 'LODGING', 'FOOD', 'TRAVEL_EXPENSE', 'TOUR_EXPENSE', 'FOOD_EXPENSE', 'LODGING_EXPENSE'];
            const expensePurpose = raw.trip?.purpose || raw.purpose || (ecList[0]?.items?.[0]?.description) || '';
            const customerName = raw.trip?.customerName || raw.customerName;

            const entries = Array.isArray(raw.entries) ? raw.entries : [];
            const firstItemType = (ecList[0]?.items?.[0]?.expenseType || '').toUpperCase().trim();

            const isLodging = claimMode === 'LODGING' ||
              claimType === 'LODGING' ||
              claimType === 'LODGING_EXPENSE' ||
              entries.some(e => ['LODGING', 'LODGING_EXPENSE'].includes((e.expenseType || '').toUpperCase().trim())) ||
              firstItemType === 'LODGING' || firstItemType === 'LODGING_EXPENSE';

            const isShowCityClaim = showCityClaimTypes.includes(claimType) || Boolean(raw.trip?.destination || raw.city || claimMode === 'LODGING' || isLodging);

            const isFood = claimType === 'FOOD' ||
              claimType === 'FOOD_EXPENSE' ||
              entries.some(e => ['FOOD', 'FOOD_EXPENSE'].includes((e.expenseType || '').toUpperCase().trim())) ||
              firstItemType === 'FOOD' || firstItemType === 'FOOD_EXPENSE';

            const isLodgingOrFood = isLodging || isFood;

            const lodgingNights = raw.lodgingNights !== undefined && raw.lodgingNights !== null
              ? Number(raw.lodgingNights)
              : (raw.fromDate && raw.toDate ? Math.max(0, Math.round((new Date(raw.toDate) - new Date(raw.fromDate)) / (1000 * 60 * 60 * 24))) : (Number(raw.numberOfNights) || 0));
            const foodDays = raw.foodDays !== undefined && raw.foodDays !== null
              ? Number(raw.foodDays)
              : (raw.fromDate && raw.toDate ? lodgingNights + 1 : 1);

            const days = Number(
              (isLodging ? lodgingNights : 0) ||
              raw.numberOfNights ||
              raw.days ||
              raw.numberOfDays ||
              raw.trip?.days ||
              (raw.fromDate && raw.toDate ? Math.max(1, Math.round((new Date(raw.toDate) - new Date(raw.fromDate)) / (1000 * 60 * 60 * 24))) : 1)
            ) || 1;

            // Helper to extract actual policy limit/entitlement value from an item / employee claim
            const extractItemLimit = (it, ec, isLodgingType, numDays = 1) => {
              if (!it && !ec) return 0;
              const directLimit = Number(
                it?.policyLimit ||
                it?.perDayLimit ||
                it?.calculationBreakdown?.sourceValues?.dailyEntitlement ||
                it?.calculationBreakdown?.sourceValues?.capPerEmployee ||
                it?.calculationBreakdown?.stayBudget ||
                it?.calculationBreakdown?.dailyCap ||
                ec?.policyLimitTotal ||
                ec?.policyLimit ||
                0
              );
              if (directLimit > 0) {
                if (isLodgingType && numDays > 1 && (it?.perDayLimit || it?.calculationBreakdown?.sourceValues?.dailyEntitlement) && !it?.calculationBreakdown?.stayBudget && directLimit < 1000) {
                  return directLimit * numDays;
                }
                return directLimit;
              }
              if (it?.limitText) {
                const m = String(it.limitText).replace(/,/g, '').match(/\d+(?:\.\d+)?/);
                if (m) {
                  const val = parseFloat(m[0]);
                  if (val > 0) {
                    if (isLodgingType && numDays > 1 && String(it.limitText).toLowerCase().includes('/day')) {
                      return val * numDays;
                    }
                    return val;
                  }
                }
              }
              return 0;
            };

            const ecGrandLimitSum = ecList.reduce((sum, ec) => {
              const itemLimit = extractItemLimit(ec.items?.[0], ec, isLodging, days) || Number(ec.policyLimitTotal) || 0;
              return sum + itemLimit;
            }, 0);

            const resolvedGrandLimit = (raw.grandPolicyLimit !== undefined && raw.grandPolicyLimit !== null && Number(raw.grandPolicyLimit) > 0)
              ? Number(raw.grandPolicyLimit)
              : (raw.policyLimit !== undefined && raw.policyLimit !== null && Number(raw.policyLimit) > 0)
                ? Number(raw.policyLimit)
                : (ecGrandLimitSum > 0 ? ecGrandLimitSum : 0);

            const grandLimit = resolvedGrandLimit > 0 ? resolvedGrandLimit : (isLodgingOrFood ? 0 : grandAllow);
            const hasExcess = grandExc > 0;
            const isRelativeStay = isLodging && raw.stayType === 'WITH_RELATIVE';
            const relStayPct = raw.relativeStayPercent ?? ecList[0]?.items?.[0]?.calculationBreakdown?.relativeStayPercent;

            // Extract per-day limits for each employee
            let empLines = [];
            if (ecList.length > 0) {
              empLines = ecList.map((ec, idx) => {
                const name = ec.employee?.name || (numEmployees > 1 ? `Employee #${idx + 1}` : (raw.submittedByName || raw.employeeName || 'Employee'));
                const firstItem = ec.items?.[0] || {};
                const breakdown = firstItem.calculationBreakdown || {};
                const src = breakdown.sourceValues || {};

                let perDay = (isRelativeStay && firstItem.perDayLimit !== undefined && firstItem.perDayLimit !== null)
                  ? Number(firstItem.perDayLimit)
                  : Number(
                      firstItem.perDayLimit ||
                      src.dailyEntitlement ||
                      src.capPerEmployee ||
                      breakdown.dailyCap ||
                      0
                    );

                if (!perDay) {
                  const itemLimit = Number(firstItem.policyLimit || ec.policyLimitTotal || ec.policyLimit || 0);
                  if (isLodging && days > 0 && itemLimit > 0) {
                    perDay = Math.round(itemLimit / days);
                  } else if (itemLimit > 0) {
                    perDay = itemLimit;
                  }
                }

                if (!perDay && firstItem.limitText) {
                  const m = String(firstItem.limitText).replace(/,/g, '').match(/\d+(?:\.\d+)?/);
                  if (m) perDay = parseFloat(m[0]);
                }

                if (!perDay && grandLimit > 0) {
                  perDay = Math.round(grandLimit / (ecList.length || 1) / (isLodging ? days : 1));
                }

                if (isLodging) {
                  const totalEmpLimit = (isRelativeStay && firstItem.policyLimit !== undefined && firstItem.policyLimit !== null)
                    ? Number(firstItem.policyLimit)
                    : perDay * days;
                  const basePerDay = Number(src.dailyEntitlement || (breakdown.baseEntitlement && days > 0 ? Math.round(breakdown.baseEntitlement / days) : 0) || 0);
                  const relNote = isRelativeStay && relStayPct !== undefined && relStayPct !== null
                    ? (basePerDay > 0 ? ` (${relStayPct}% of ₹${formatINR(basePerDay)}/day)` : ` (${relStayPct}% allowance)`)
                    : '';
                  return days > 1
                    ? `${name}: ₹${formatINR(perDay)}/day${relNote} (Total: ₹${formatINR(totalEmpLimit)} for ${days} days)`
                    : `${name}: ₹${formatINR(perDay)}/day${relNote}`;
                } else {
                  return perDay > 0
                    ? `${name}: ₹${formatINR(perDay)}/day`
                    : (isFood && grandLimit > 0
                        ? `${name}: ₹${formatINR(Math.round(grandLimit / (ecList.length || 1)))}/day`
                        : `${name}: Actuals`);
                }
              });
            } else {
              const name = raw.submittedByName || raw.employeeName || 'Employee';
              let perDay = 0;
              if (isLodging && days > 0 && grandLimit > 0) {
                perDay = Math.round(grandLimit / days);
              } else if (grandLimit > 0) {
                perDay = grandLimit;
              } else {
                perDay = extractItemLimit(raw.entries?.[0] || ecList[0]?.items?.[0], null, isLodging, days);
              }
              empLines = [
                isLodging
                  ? (days > 1 ? `${name}: ₹${formatINR(perDay)}/day (Total: ₹${formatINR(grandLimit || (perDay * days))} for ${days} days)` : `${name}: ₹${formatINR(perDay)}/day`)
                  : (perDay > 0 ? `${name}: ₹${formatINR(perDay)}/day` : (isFood ? `${name}: ₹${formatINR(grandLimit || grandAllow)}/day` : `${name}: Actuals`))
              ];
            }

            let combinedLimitText = '';
            if (isLodging) {
              combinedLimitText = numEmployees > 1
                ? `Combined Stay Policy Limit: ₹${formatINR(grandLimit > 0 ? grandLimit : grandAllow)} (${days} day${days > 1 ? 's' : ''})`
                : `Stay Policy Limit: ₹${formatINR(grandLimit > 0 ? grandLimit : grandAllow)} (${days} day${days > 1 ? 's' : ''})`;
            } else if (isFood) {
              const foodLimitAmt = grandLimit > 0 ? grandLimit : (numEmployees > 1 ? numEmployees * 450 : grandAllow);
              combinedLimitText = numEmployees > 1
                ? `Combined daily limit: ₹${formatINR(foodLimitAmt)}`
                : `Daily policy limit: ₹${formatINR(foodLimitAmt)}`;
            } else {
              combinedLimitText = `Policy limit: ₹${formatINR(grandLimit)}`;
            }

            let calcOutcomeText = '';
            if (isRelativeStay) {
              calcOutcomeText = `Stay at relative${relStayPct !== undefined && relStayPct !== null ? ` (${relStayPct}% allowance)` : ''}: No hotel bill required. Allowed amount of ₹${formatINR(grandAllow)} is auto-calculated per policy (${days} day${days > 1 ? 's' : ''}).`;
            } else if (hasExcess) {
              const perEmpExcessText = numEmployees > 1 ? ` (₹${formatINR(Math.round(grandExc / numEmployees))} excess per employee)` : '';
              calcOutcomeText = `Claimed bill: ₹${formatINR(grandReq)}. Therefore, ₹${formatINR(grandAllow)} is allowed and ₹${formatINR(grandExc)} is excess beyond policy limit${perEmpExcessText}.`;
            } else {
              const limitLabel = isLodging
                ? (numEmployees > 1 ? 'combined stay policy limit' : 'stay policy limit')
                : (numEmployees > 1 ? 'combined daily limit' : 'daily policy limit');
              const limitValForText = grandLimit > 0 ? grandLimit : (isLodgingOrFood ? grandAllow : 0);
              calcOutcomeText = limitValForText > 0
                ? `Claimed bill: ₹${formatINR(grandReq)}. Since your bill is within your ${limitLabel} of ₹${formatINR(limitValForText)}, ₹${formatINR(grandAllow)} is fully allowed.`
                : `Claimed bill: ₹${formatINR(grandReq)}. Since your bill is within your ${limitLabel}, ₹${formatINR(grandAllow)} is fully allowed.`;
            }

            const entriesList = (Array.isArray(raw.entries) && raw.entries.length > 0)
              ? raw.entries
              : (Array.isArray(ecList[0]?.items) && ecList[0].items.length > 0 ? ecList[0].items : null);

            const combinedItems = entriesList
              ? entriesList.map((entry, idx) => {
                const firstItem = ecList[0]?.items?.[idx] || {};
                const expType = (entry.expenseType || firstItem.expenseType || raw.claimType || 'Expense').toUpperCase();
                const isOther = expType === 'OTHER';
                const isStockPurchase = expType === 'STOCK_PURCHASE';
                const isConv = expType === 'CONVEYANCE' || expType === 'LOCAL_CONVEYANCE';
                const isPurchase = isStockPurchase || (isOther && ((entry.otherSubType || firstItem.otherSubType || '').toUpperCase() === 'PURCHASE'));
                const expTypeName = firstItem.expenseTypeName || (
                  isConv ? 'Local Conveyance' :
                    expType === 'FOOD' ? 'Food' :
                      expType === 'TRAVEL' ? 'Travel' :
                        (expType === 'LODGING' || expType === 'LODGING') ? 'Lodging' :
                          isStockPurchase ? 'Stock Purchase' :
                            isOther ? (isPurchase ? 'Stock Purchase' : 'Other Expense') : expType
                );
                const expDate = entry.expenseDate || firstItem.expenseDate || entry.date || firstItem.date || raw.expenseDate || raw.claimDate || raw.fromDate || raw.submissionDate || raw.createdAt;

                const reqAmt = Number(entry.requestedAmount) || Number(firstItem.requestedAmount) || ecList.reduce((s, ec) => s + (Number(ec.items?.[idx]?.requestedAmount) || 0), 0) || Number(entry.amount) || Number(firstItem.amount) || Number(entry.claimedAmount) || Number(firstItem.claimedAmount) || (entriesList.length === 1 ? grandReq : 0);

                const hasEcItems = ecList.some((ec) => Array.isArray(ec.items) && ec.items.length > idx);
                const ecAllowSum = hasEcItems ? ecList.reduce((s, ec) => s + (Number(ec.items?.[idx]?.allowedAmount) || 0), 0) : null;
                const ecExcSum = hasEcItems ? ecList.reduce((s, ec) => s + (Number(ec.items?.[idx]?.excessAmount) || 0), 0) : null;

                const allowAmt = ecAllowSum !== null
                  ? ecAllowSum
                  : (entry.allowedAmount !== undefined && entry.allowedAmount !== null
                    ? Number(entry.allowedAmount)
                    : (firstItem.allowedAmount !== undefined && firstItem.allowedAmount !== null
                      ? Number(firstItem.allowedAmount)
                      : (entriesList.length === 1 ? grandAllow : reqAmt)));

                const excAmt = ecExcSum !== null
                  ? ecExcSum
                  : (entry.excessAmount !== undefined && entry.excessAmount !== null
                    ? Number(entry.excessAmount)
                    : (firstItem.excessAmount !== undefined && firstItem.excessAmount !== null
                      ? Number(firstItem.excessAmount)
                      : (entriesList.length === 1 ? grandExc : Math.max(0, reqAmt - allowAmt))));

                const itemHasExcess = excAmt > 0;
                const isItemFood = expType === 'FOOD' || expType === 'FOOD_EXPENSE';
                const isItemLodging = expType === 'LODGING' || expType === 'LODGING_EXPENSE';
                const ecLimitSum = ecList.reduce((s, ec) => s + Number(ec.items?.[idx]?.policyLimit || 0), 0);
                const rawPolLimit = Number(entry.policyLimit) || ecLimitSum || Number(firstItem.policyLimit) || (isItemLodging ? Number(raw.lodgingSummary?.policyLimit) : (isItemFood ? Number(raw.foodSummary?.remainingEntitlement ?? raw.foodSummary?.totalEntitlement) : 0)) || (entriesList.length === 1 ? grandLimit : 0);
                const polLimit = (isItemFood || isItemLodging)
                  ? (rawPolLimit > 0 ? rawPolLimit : allowAmt)
                  : rawPolLimit;

                const limitDisp = (isItemFood || isItemLodging)
                  ? `₹${formatINR(polLimit || allowAmt)}`
                  : (isConv || expType === 'TRAVEL' || expType === 'OTHER' || expType === 'STOCK_PURCHASE')
                    ? (entry.limitText || firstItem.limitText || 'Actuals (Fully Allowed)')
                    : (entry.limitText || firstItem.limitText || (polLimit > 0 ? `₹${formatINR(polLimit)}` : 'Actuals (Fully Allowed)'));
                const atts = entry.receipts || entry.attachments || firstItem.attachments || [];

                const itemFormula = entry.formula || firstItem.formula || firstItem.calculationBreakdown?.formula || (
                  isConv
                    ? ((entry.distanceKm || firstItem.distanceKm) ? `${entry.distanceKm || firstItem.distanceKm} km x ₹${firstItem.calculationBreakdown?.sourceValues?.rate || 10}/km` : 'Actuals (Fully Allowed)')
                    : expType === 'TRAVEL'
                      ? 'Travel fare (Fully Allowed)'
                      : isStockPurchase
                        ? 'Stock Purchase (Fully Allowed)'
                        : isOther
                          ? (isPurchase ? 'Stock Purchase (Fully Allowed)' : 'Actual amount (Fully Allowed)')
                          : expType === 'FOOD'
                            ? (firstItem.limitText ? `Daily limit: ${firstItem.limitText}` : 'MIN(actual, daily entitlement)')
                            : (expType === 'LODGING' || expType === 'LODGING')
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
                  distanceKm: (isConv || expType === 'TRAVEL') ? (entry.distanceKm || firstItem.distanceKm) : undefined,
                  vehicle: (isConv || expType === 'TRAVEL') ? (entry.vehicle || firstItem.vehicle) : undefined,
                  travelModeName: entry.travelModeName || firstItem.travelModeName || entry.mode || '',
                  travelSubtypeName: entry.travelSubtypeName || firstItem.travelSubtypeName || '',
                  travelWorkflow: entry.travelWorkflow || firstItem.travelWorkflow || '',
                  startKm: entry.startKm ?? firstItem.startKm ?? null,
                  endKm: entry.endKm ?? firstItem.endKm ?? null,
                  ratePerKm: entry.ratePerKm ?? firstItem.ratePerKm ?? null,
                  entitlementStatus: entry.entitlementStatus || firstItem.entitlementStatus || '',
                  excessReason: entry.excessReason || firstItem.excessReason || '',
                  visitType: isConv ? (entry.visitType || firstItem.visitType || (entry.isVisit || firstItem.isVisit ? 'VISIT' : 'NO_VISIT') || 'NO_VISIT') : undefined,
                  isVisit: isConv ? Boolean(entry.isVisit || firstItem.isVisit || entry.visitType === 'VISIT' || firstItem.visitType === 'VISIT') : false,
                  serviceReports: isConv ? (entry.serviceReports || firstItem.serviceReports || (firstItem.conveyanceKm?.serviceReports) || []) : [],
                  otherSubType: isOther ? (entry.otherSubType || firstItem.otherSubType) : undefined,
                  materialName: isPurchase ? (entry.materialName || firstItem.materialName) : undefined,
                  barcodeNumber: isPurchase ? (entry.barcodeNumber || firstItem.barcodeNumber) : undefined,
                  quantity: isPurchase ? (entry.quantity || firstItem.quantity) : undefined,
                  numberPlatePhotos: entry.numberPlatePhotos || firstItem.numberPlatePhotos || [],
                  startKmPhotos: entry.startKmPhotos || firstItem.startKmPhotos || [],
                  endKmPhotos: entry.endKmPhotos || firstItem.endKmPhotos || [],
                  attachments: isConv ? [] : atts,
                };
              })
              : (() => {
                const singleType = (ecList[0]?.items?.[0]?.expenseType || raw.claimType || 'Expense').toUpperCase();
                const singleIsOther = singleType === 'OTHER';
                const singleIsStockPurchase = singleType === 'STOCK_PURCHASE';
                const singleIsConv = singleType === 'CONVEYANCE' || singleType === 'LOCAL_CONVEYANCE';
                const singleIsPurchase = singleIsStockPurchase || (singleIsOther && ((ecList[0]?.items?.[0]?.otherSubType || raw.entries?.[0]?.otherSubType || raw.otherSubType || '').toUpperCase() === 'PURCHASE'));
                return [{
                  expenseType: singleType,
                  expenseTypeName: raw.expenseType || raw.claimType || (singleIsConv ? 'Local Conveyance' : (singleIsStockPurchase ? 'Stock Purchase' : (singleIsOther ? (singleIsPurchase ? 'Stock Purchase' : 'Other Expense') : 'Expense'))),
                  expenseDate: ecList[0]?.items?.[0]?.expenseDate || raw.expenseDate || raw.claimDate || raw.date || raw.fromDate || raw.submissionDate || raw.createdAt,
                  requestedAmount: grandReq,
                  allowedAmount: grandAllow,
                  excessAmount: grandExc,
                  policyLimit: grandLimit || grandAllow,
                  hasExcess: grandExc > 0,
                  limitDisplay: (singleType === 'FOOD' || singleType === 'FOOD_EXPENSE' || singleType === 'LODGING' || singleType === 'LODGING_EXPENSE')
                    ? `₹${formatINR(grandLimit || grandAllow)}`
                    : (grandLimit > 0 ? `₹${formatINR(grandLimit)}` : 'Actuals (Fully Allowed)'),
                  formula: raw.formula || ecList[0]?.items?.[0]?.formula || ecList[0]?.items?.[0]?.calculationBreakdown?.formula,
                  description: raw.remark || raw.purpose || ecList[0]?.items?.[0]?.description || '',
                  distanceKm: singleIsConv ? (ecList[0]?.items?.[0]?.distanceKm || raw.entries?.[0]?.distanceKm) : undefined,
                  vehicle: singleIsConv ? (ecList[0]?.items?.[0]?.vehicle || raw.entries?.[0]?.vehicle) : undefined,
                  visitType: singleIsConv ? (raw.entries?.[0]?.visitType || ecList[0]?.items?.[0]?.visitType || raw.visitType || (raw.isVisit ? 'VISIT' : 'NO_VISIT') || 'NO_VISIT') : undefined,
                  isVisit: singleIsConv ? Boolean(raw.entries?.[0]?.isVisit || ecList[0]?.items?.[0]?.isVisit || raw.isVisit || raw.entries?.[0]?.visitType === 'VISIT' || raw.visitType === 'VISIT') : false,
                  serviceReports: singleIsConv ? (raw.entries?.[0]?.serviceReports || ecList[0]?.items?.[0]?.serviceReports || raw.serviceReports || []) : [],
                  otherSubType: singleIsOther ? (ecList[0]?.items?.[0]?.otherSubType || raw.entries?.[0]?.otherSubType || raw.otherSubType) : undefined,
                  materialName: singleIsPurchase ? (ecList[0]?.items?.[0]?.materialName || raw.entries?.[0]?.materialName || raw.materialName) : undefined,
                  barcodeNumber: singleIsPurchase ? (ecList[0]?.items?.[0]?.barcodeNumber || raw.entries?.[0]?.barcodeNumber || raw.barcodeNumber) : undefined,
                  quantity: singleIsPurchase ? (ecList[0]?.items?.[0]?.quantity || raw.entries?.[0]?.quantity || raw.quantity) : undefined,
                  numberPlatePhotos: raw.entries?.[0]?.numberPlatePhotos || ecList[0]?.items?.[0]?.numberPlatePhotos || raw.numberPlatePhotos || [],
                  startKmPhotos: raw.entries?.[0]?.startKmPhotos || ecList[0]?.items?.[0]?.startKmPhotos || raw.startKmPhotos || [],
                  endKmPhotos: raw.entries?.[0]?.endKmPhotos || ecList[0]?.items?.[0]?.endKmPhotos || raw.endKmPhotos || [],
                  attachments: singleIsConv ? [] : (raw.receipts || ecList[0]?.items?.[0]?.attachments || []),
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

            const managerApproval = raw.managerApproval || {};
            const isFullPayment = Boolean(raw.fullPayment?.requested || raw.fullPaymentRequested);
            const hasStockPurchase = combinedItems.some(e => e.expenseType === 'STOCK_PURCHASE') || claimType === 'STOCK_PURCHASE';
            const hasOtherExpense = combinedItems.some(e => e.expenseType === 'OTHER' || e.expenseType === 'STOCK_PURCHASE') || claimType === 'OTHER' || claimType === 'STOCK_PURCHASE';

            const filerUser = (typeof raw.submittedBy === 'object' && raw.submittedBy !== null) ? raw.submittedBy : {};
            const filerFromClaim = {
              role: filerUser.role || raw.applicantRole,
              roleCode: filerUser.roleCode || raw.applicantRoleCode,
              designation: filerUser.designation || raw.applicantDesig,
              department: filerUser.department || raw.applicantDept,
              category: filerUser.category,
            };
            const isMgmtFiler =
              isManagementFiler(filerUser) ||
              isManagementFiler(filerFromClaim) ||
              Boolean(raw.fullPayment?.decisionRemarks?.includes('not applicable for management')) ||
              Boolean(raw.managerApproval?.remarks?.includes('not applicable for management'));

            const approvalKind = managerApproval.kind && managerApproval.kind !== 'NONE'
              ? managerApproval.kind
              : (isFullPayment ? 'FULL_PAYMENT' : ((hasOtherExpense || managerApproval.approver) ? 'OTHER_EXPENSE' : 'NONE'));
            const isManagementApproval = approvalKind === 'FULL_PAYMENT' || managerApproval.approverRole === 'MANAGEMENT';
            const showApprovalCard = Boolean(
              (approvalKind && approvalKind !== 'NONE') ||
              managerApproval.approver ||
              managerApproval.approverName ||
              (isFullPayment && (raw.status === 'APPROVAL_PENDING' || raw.fullPayment?.status)) ||
              (isMgmtFiler && (isFullPayment || hasOtherExpense || managerApproval.status))
            );

            const approverObj = (typeof managerApproval.approver === 'object' && managerApproval.approver !== null) ? managerApproval.approver : null;
            const approverName = approverObj?.name || managerApproval.approverName || (typeof managerApproval.approver === 'string' ? managerApproval.approver : '') || 'Assigned Approver';
            const approverCode = approverObj?.employeeIdCode ? ` (${approverObj.employeeIdCode})` : '';
            const approverSub = [approverObj?.designation, approverObj?.department].filter(Boolean).join(' • ');

            const rawApprovalStatus = String(managerApproval.status || '').toUpperCase();
            const finStatusUpper = String(raw.financeApproval?.status || '').toUpperCase();
            const rawStatusUpper = String(raw.status || '').toUpperCase();
            const hasSecondStage = (!isMgmtFiler && (isFullPayment || hasStockPurchase))
              || Boolean(raw.financeApproval?.approver || raw.financeApproval?.approverName || (finStatusUpper && finStatusUpper !== 'NOT_REQUIRED'));
            const effectiveApprovalStatus = (rawApprovalStatus && rawApprovalStatus !== 'NOT_REQUIRED')
              ? rawApprovalStatus
              : (rawStatusUpper === 'APPROVAL_PENDING'
                ? (finStatusUpper === 'PENDING' ? 'APPROVED' : 'PENDING')
                : (['SUBMITTED', 'ACCOUNTS_APPROVED', 'APPROVED', 'PAID', 'DISBURSED', 'SETTLED'].includes(rawStatusUpper)
                  ? 'APPROVED'
                  : (rawStatusUpper === 'REJECTED' ? 'REJECTED' : 'PENDING')));

            const approvalStatusMeta = {
              PENDING: { label: 'Awaiting 1st Approval', color: 'text-amber-800', bg: 'bg-amber-100', border: 'border-amber-300' },
              APPROVED: { label: 'Approved', color: 'text-emerald-800', bg: 'bg-emerald-100', border: 'border-emerald-300' },
              REJECTED: { label: 'Rejected', color: 'text-rose-800', bg: 'bg-rose-100', border: 'border-rose-300' },
            }[effectiveApprovalStatus] || { label: 'Pending', color: 'text-amber-800', bg: 'bg-amber-100', border: 'border-amber-300' };

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
                    <div className="absolute top-6 right-6 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleDownloadClaimPdf(raw, 'header')}
                        disabled={downloadingClaimPdf}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition-all active:scale-95 cursor-pointer disabled:opacity-50 shadow-2xs border border-white/10"
                        title="Download Claim PDF"
                      >
                        {activeDownloadBtn === 'header' ? (
                          <Loader2 size={14} className="animate-spin text-white" />
                        ) : (
                          <Download size={14} className="text-white" />
                        )}
                        <span>Download PDF</span>
                      </button>
                      <button
                        onClick={() => setDetailClaim(null)}
                        className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-all active:scale-95 cursor-pointer"
                        title="Close"
                      >
                        <X size={20} />
                      </button>
                    </div>
                    <div className="flex items-center gap-3 mb-2">
                      <span
                        className={`text-[10px] font-extrabold px-3 py-1 rounded-full tracking-wider ${isRejected
                          ? 'bg-rose-400 text-rose-950'
                          : isPaid
                            ? 'bg-emerald-400 text-emerald-950'
                            : (raw.status === 'ACCOUNTS_APPROVED' || raw.paymentStatus === 'AWAITING_DISBURSEMENT' || raw.isAccountsApproved)
                              ? 'bg-teal-400 text-teal-950'
                              : 'bg-amber-400 text-amber-950'
                          }`}
                      >
                        {isRejected
                          ? '❌ Rejected'
                          : isPaid
                            ? '✅ Paid'
                            : (raw.status === 'ACCOUNTS_APPROVED' || raw.paymentStatus === 'AWAITING_DISBURSEMENT' || raw.isAccountsApproved)
                              ? '✅ Approved • Payment Pending'
                              : '⏳ Pending'}
                      </span>
                      <span className="text-xs text-slate-300 flex items-center gap-1.5 font-bold bg-white/10 px-3 py-1 rounded-full">
                        <Clock size={13} />
                        <span>Applied: {formatAppliedDateTime(raw.submissionDate || raw.submittedAt || raw.createdAt)}</span>
                      </span>
                    </div>
                    <h2 className="text-2xl font-bold tracking-tight text-white m-0">
                      Expense Claim ({getResolvedClaimType(raw).label}) • ₹{formatINR(grandAllow || grandReq)}
                    </h2>
                    <p className="text-xs text-slate-300 font-medium mt-1 m-0">
                      Reference ID: {raw.claimNumber || raw._id}
                    </p>
                  </div>

                  {/* Modal Body */}
                  <div className="p-6 md:p-8 overflow-y-auto space-y-6 flex-1 text-left bg-slate-50/50">
                    <ExpenseClaimDetailContent claim={raw} />
                  </div>

                  {/* Modal Footer */}
                  <div className="p-6 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-3 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => handleDownloadClaimPdf(raw, 'bottom')}
                      disabled={downloadingClaimPdf}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl font-bold text-xs text-white bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-100 transition-all cursor-pointer disabled:opacity-50"
                    >
                      {activeDownloadBtn === 'bottom' ? (
                        <Loader2 size={15} className="animate-spin text-white" />
                      ) : (
                        <Download size={15} className="text-white" />
                      )}
                      <span>Download Claim (PDF)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setDetailClaim(null)}
                      className="px-6 py-2.5 rounded-2xl font-bold text-xs text-slate-600 bg-white border border-slate-200 hover:bg-slate-100 transition-all cursor-pointer"
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
