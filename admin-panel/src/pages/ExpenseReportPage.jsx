import {
  AnimatePresence,
  motion
} from 'framer-motion';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  AlertCircle,
  ArrowRight,
  Briefcase,
  Building2,
  Calendar,
  CheckCircle2,
  CheckSquare,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  DollarSign,
  Download,
  FileSpreadsheet,
  FileText,
  Filter,
  Hourglass,
  Layers,
  ListFilter,
  Loader2,
  Mail,
  MapPin,
  Phone,
  Receipt,
  RefreshCw,
  Search,
  Users,
  X,
  XCircle,
  Zap
} from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useSelector } from 'react-redux';
import api from '../api/axios';
import CalendarPicker from '../components/CalendarPicker';
import SearchableDropdown from '../components/SearchableDropdown';

// Format INR currency
const formatINR = (val) => {
  return Number(val || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
};

// Helper to calculate exact one month prior date
const getOneMonthPriorDate = (d = new Date()) => {
  const target = new Date(d);
  const day = target.getDate();
  target.setMonth(target.getMonth() - 1);
  if (target.getDate() !== day) {
    target.setDate(0);
  }
  return target;
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

const getFirstDayOfMonth = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1);
};

// Top Metric Stat Card
const StatCard = ({ title, amount, count, icon, iconBg, iconColor, loading, onClick, active }) => (
  <div
    onClick={onClick}
    className={`bg-white border rounded-2xl p-4 md:p-5 flex-1 transition-all duration-200 group flex flex-col items-center justify-center text-center relative ${
      onClick ? 'cursor-pointer hover:shadow-lg hover:border-indigo-300' : ''
    } ${active ? 'ring-2 ring-indigo-500 border-indigo-400 bg-indigo-50/20' : 'border-slate-200'}`}
  >
    <div
      className="w-11 h-11 rounded-2xl flex items-center justify-center border border-slate-100 shadow-2xs group-hover:scale-105 transition-transform mb-2.5"
      style={{ backgroundColor: iconBg, color: iconColor }}
    >
      {React.cloneElement(icon, { size: 20, strokeWidth: 2.2 })}
    </div>
    <div className="space-y-0.5 w-full">
      <h3 className="text-xl md:text-2xl font-bold text-slate-900 tracking-tight">
        {loading ? (
          <Loader2 className="animate-spin text-indigo-500 mx-auto" size={20} />
        ) : (
          `₹ ${formatINR(amount)}`
        )}
      </h3>
      <div className="flex items-center justify-center gap-1.5 mt-0.5">
        <span className="text-[11px] font-extrabold text-slate-500 tracking-wider">
          {title}
        </span>
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-700">
          {count || 0}
        </span>
      </div>
    </div>
  </div>
);

const ExpenseReportPage = () => {
  const navigate = useNavigate();
  const { user } = useSelector((state) => state.auth || {});

  // Main Active Tab:
  // 'reports' = All Expense Claims Report (Full table + filters)
  // 'awaiting' = Disbursement Queue (Awaiting payment + batch selection)
  // 'disbursed' = Disbursement History
  const [activeTab, setActiveTab] = useState('reports');

  // ── Global Filter States ──
  const [filterEmployee, setFilterEmployee] = useState('ALL');
  const [filterCity, setFilterCity] = useState('');
  const [filterExpenseType, setFilterExpenseType] = useState('ALL');
  const [filterApprovalStatus, setFilterApprovalStatus] = useState('ALL');
  const [filterPaymentStatus, setFilterPaymentStatus] = useState('ALL');
  const [filterFromDate, setFilterFromDate] = useState(() => {
    return formatDateYYYYMMDD(getOneMonthPriorDate(new Date()));
  });
  const [filterToDate, setFilterToDate] = useState(() => {
    return formatDateYYYYMMDD(new Date());
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilterPanel, setShowFilterPanel] = useState(false);

  // ── Strict Approval & Disbursement Evaluation ──
  const isClaimApproved = useCallback((c) => {
    if (!c) return false;
    if (['PENDING', 'REJECTED', 'DRAFT'].includes(c.approvalStatus)) {
      if (!['ACCOUNTS_APPROVED', 'APPROVED'].includes(c.status)) return false;
    }
    if ([
      'SUBMITTED',
      'HR_PENDING',
      'FULL_PAYMENT_PENDING',
      'ACCOUNTS_PENDING',
      'HR_REJECTED',
      'ACCOUNTS_REJECTED',
      'REJECTED',
      'CANCELLED',
      'RETURNED',
      'DRAFT',
      'draft',
      'CREATED'
    ].includes(c.status)) {
      return false;
    }
    return c.approvalStatus === 'APPROVED' || ['ACCOUNTS_APPROVED', 'APPROVED'].includes(c.status);
  }, []);

  const isClaimDisbursed = useCallback((c) => {
    if (!c) return false;
    return c.paymentStatus === 'DISBURSED' || c.paymentStatus === 'PAID' || ['PAID', 'DISBURSED', 'SETTLED'].includes(c.status);
  }, []);

  const canDisburseClaim = useCallback((c) => {
    return isClaimApproved(c) && !isClaimDisbursed(c);
  }, [isClaimApproved, isClaimDisbursed]);

  // Pagination & Sorting for Claims Report
  const [reportPage, setReportPage] = useState(1);
  const [reportLimit, setReportLimit] = useState(15);
  const [reportSortField, setReportSortField] = useState('submittedAt');
  const [reportSortDirection, setReportSortDirection] = useState('desc');

  // Data States for Claims Report
  const [reportLoading, setReportLoading] = useState(false);
  const [claimsReportData, setClaimsReportData] = useState([]);
  const [reportPagination, setReportPagination] = useState({ total: 0, totalPages: 1, page: 1, limit: 15 });
  const [summaryMetrics, setSummaryMetrics] = useState({
    total: { count: 0, amount: 0 },
    pendingApproval: { count: 0, amount: 0 },
    awaitingDisbursement: { count: 0, amount: 0 },
    disbursed: { count: 0, amount: 0 },
    rejected: { count: 0, amount: 0 }
  });

  // Multi-Claim Selection for Batch Disbursement
  const [selectedClaimIds, setSelectedClaimIds] = useState([]);

  // Date-Only Disbursement Modal State
  const [disburseModal, setDisburseModal] = useState({
    open: false,
    claimIds: [],
    claimNumber: '',
    totalAmount: 0
  });
  const [disbursementDate, setDisbursementDate] = useState(formatDateYYYYMMDD(new Date()));
  const [processingDisburse, setProcessingDisburse] = useState(false);

  // Claim Full Detail View Modal
  const [detailClaim, setDetailClaim] = useState(null);

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
          managerName: full.hrReviewedBy?.name || full.submittedBy?.reportsTo?.name || prev?.managerName,
        }));
      }
    } catch (err) {
      console.warn('Could not fetch full claim details from server, using report snapshot:', err);
    }
  };

  // Master Options: Each and Every Employee from Database & Cities from Expense Masters
  const [employeesList, setEmployeesList] = useState([]);
  const [citiesList, setCitiesList] = useState([]);

  // Export dropdown
  const [showExportOptions, setShowExportOptions] = useState(false);
  const exportRef = useRef(null);

  // Date Calendar Pickers
  const [showStartCalendar, setShowStartCalendar] = useState(false);
  const [showEndCalendar, setShowEndCalendar] = useState(false);
  const startCalendarRef = useRef(null);
  const endCalendarRef = useRef(null);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (startCalendarRef.current && !startCalendarRef.current.contains(event.target)) {
        setShowStartCalendar(false);
      }
      if (endCalendarRef.current && !endCalendarRef.current.contains(event.target)) {
        setShowEndCalendar(false);
      }
      if (exportRef.current && !exportRef.current.contains(event.target)) {
        setShowExportOptions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // ── Load All Database Employees & Expense Cities on Mount ──
  useEffect(() => {
    const loadMasterData = async () => {
      try {
        const [empRes, cityRes] = await Promise.all([
          api.get('/employees?limit=1000').catch(() => api.get('/expense/employees').catch(() => null)),
          api.get('/expense/cities').catch(() => null),
        ]);

        if (empRes?.data) {
          const rawEmps = Array.isArray(empRes.data.data)
            ? empRes.data.data
            : Array.isArray(empRes.data)
            ? empRes.data
            : [];
          const sortedEmps = [...rawEmps].sort((a, b) => ((a.name || a.fullName || '').localeCompare(b.name || b.fullName || '')));
          setEmployeesList(sortedEmps);
        }

        if (cityRes?.data) {
          const rawCities = Array.isArray(cityRes.data.data)
            ? cityRes.data.data
            : Array.isArray(cityRes.data)
            ? cityRes.data
            : [];
          setCitiesList(rawCities);
        }
      } catch (err) {
        console.error('Failed to load master employees/cities:', err);
      }
    };

    loadMasterData();
  }, []);

  // ── Fetch Summary KPI Metrics (Reflects all active filters) ──
  const fetchSummaryMetrics = useCallback(async () => {
    try {
      const params = { dateBasis: 'expense' };
      if (filterEmployee && filterEmployee !== 'ALL') params.employee = filterEmployee;
      if (filterCity && filterCity.trim()) params.city = filterCity.trim();
      if (filterExpenseType && filterExpenseType !== 'ALL') params.expenseType = filterExpenseType;
      if (filterFromDate) params.fromDate = filterFromDate;
      if (filterToDate) params.toDate = filterToDate;
      if (searchQuery.trim()) params.search = searchQuery.trim();

      const res = await api.get('/expense/reports/summary', { params });
      if (res.data?.success && res.data.data) {
        setSummaryMetrics(res.data.data);
      }
    } catch (err) {
      console.error('Failed to load expense report summary:', err);
    }
  }, [filterEmployee, filterCity, filterExpenseType, filterFromDate, filterToDate, searchQuery]);

  // ── Fetch Claims Report ──
  const fetchClaimsReport = useCallback(async () => {
    try {
      setReportLoading(true);
      const params = {
        page: reportPage,
        limit: reportLimit,
        sortField: reportSortField,
        sortDirection: reportSortDirection,
        dateBasis: 'expense',
      };

      if (filterEmployee && filterEmployee !== 'ALL') params.employee = filterEmployee;
      if (filterCity && filterCity.trim()) params.city = filterCity.trim();
      if (filterExpenseType && filterExpenseType !== 'ALL') params.expenseType = filterExpenseType;
      if (filterFromDate) params.fromDate = filterFromDate;
      if (filterToDate) params.toDate = filterToDate;
      if (searchQuery.trim()) params.search = searchQuery.trim();

      // Tab specific constraints
      if (activeTab === 'pending') {
        params.approvalStatus = 'PENDING';
      } else if (activeTab === 'awaiting') {
        params.paymentStatus = 'AWAITING_DISBURSEMENT';
      } else if (activeTab === 'disbursed') {
        params.paymentStatus = 'DISBURSED';
      } else {
        if (filterApprovalStatus && filterApprovalStatus !== 'ALL') params.approvalStatus = filterApprovalStatus;
        if (filterPaymentStatus && filterPaymentStatus !== 'ALL') params.paymentStatus = filterPaymentStatus;
      }

      const res = await api.get('/expense/reports', { params });
      if (res.data?.success) {
        const claims = res.data.data || [];
        setClaimsReportData(claims);
        if (res.data.pagination) setReportPagination(res.data.pagination);
      }
    } catch (err) {
      console.error('Failed to load expense claims report:', err);
      toast.error('Failed to load expense report');
    } finally {
      setReportLoading(false);
    }
  }, [
    activeTab,
    reportPage,
    reportLimit,
    reportSortField,
    reportSortDirection,
    filterEmployee,
    filterCity,
    filterExpenseType,
    filterApprovalStatus,
    filterPaymentStatus,
    filterFromDate,
    filterToDate,
    searchQuery,
  ]);

  // Synchronize KPI Cards whenever filters change
  useEffect(() => {
    fetchSummaryMetrics();
  }, [fetchSummaryMetrics]);

  // Load Claims Report whenever tab, pagination or filters change
  useEffect(() => {
    fetchClaimsReport();
  }, [fetchClaimsReport]);

  // Reset pagination on filter changes
  useEffect(() => {
    setReportPage(1);
    setSelectedClaimIds([]);
  }, [
    activeTab,
    filterEmployee,
    filterCity,
    filterExpenseType,
    filterApprovalStatus,
    filterPaymentStatus,
    filterFromDate,
    filterToDate,
    searchQuery,
  ]);

  // Calculate active filter count
  const activeFiltersCount = useMemo(() => {
    return [
      filterEmployee !== 'ALL' && filterEmployee,
      filterCity.trim(),
      filterExpenseType !== 'ALL' && filterExpenseType,
      filterApprovalStatus !== 'ALL' && filterApprovalStatus,
      filterPaymentStatus !== 'ALL' && filterPaymentStatus,
      filterFromDate,
      filterToDate,
      searchQuery.trim(),
    ].filter(Boolean).length;
  }, [
    filterEmployee,
    filterCity,
    filterExpenseType,
    filterApprovalStatus,
    filterPaymentStatus,
    filterFromDate,
    filterToDate,
    searchQuery,
  ]);

  const resetAllFilters = () => {
    setFilterEmployee('ALL');
    setFilterCity('');
    setFilterExpenseType('ALL');
    setFilterApprovalStatus('ALL');
    setFilterPaymentStatus('ALL');
    setFilterFromDate(formatDateYYYYMMDD(getOneMonthPriorDate(new Date())));
    setFilterToDate(formatDateYYYYMMDD(new Date()));
    setSearchQuery('');
  };

  const handleTabSelect = (tab) => {
    setActiveTab(tab);
    setSelectedClaimIds([]);
    setReportPage(1);
  };

  // Selected claims total amount (only approved & payable claims)
  const selectedTotalAmount = useMemo(() => {
    return claimsReportData
      .filter((c) => selectedClaimIds.includes(c._id) && canDisburseClaim(c))
      .reduce((sum, c) => sum + (c.payableAmount || c.allowedAmount || c.claimedAmount || 0), 0);
  }, [claimsReportData, selectedClaimIds, canDisburseClaim]);

  // Check if all displayed awaiting claims are selected
  const allCurrentAwaitingSelected = useMemo(() => {
    const awaitingOnPage = claimsReportData.filter((c) => canDisburseClaim(c));
    return (
      awaitingOnPage.length > 0 &&
      awaitingOnPage.every((c) => selectedClaimIds.includes(c._id))
    );
  }, [claimsReportData, selectedClaimIds, canDisburseClaim]);

  const toggleSelectAllAwaiting = () => {
    const awaitingOnPage = claimsReportData.filter((c) => canDisburseClaim(c));
    if (allCurrentAwaitingSelected) {
      const pageIds = new Set(awaitingOnPage.map((c) => c._id));
      setSelectedClaimIds((prev) => prev.filter((id) => !pageIds.has(id)));
    } else {
      const newIds = awaitingOnPage.map((c) => c._id);
      setSelectedClaimIds((prev) => Array.from(new Set([...prev, ...newIds])));
    }
  };

  // ── Handle Confirm Disbursement (Single or Batch - Date Only) ──
  const handleConfirmDisbursement = async () => {
    if (!disburseModal.claimIds || disburseModal.claimIds.length === 0) return;
    setProcessingDisburse(true);
    try {
      if (disburseModal.claimIds.length === 1) {
        const id = disburseModal.claimIds[0];
        await api.post(`/expense/claims/${id}/disburse`, {
          paymentDate: disbursementDate,
        });
        toast.success('Claim disbursed successfully!');
      } else {
        const res = await api.post('/expense/claims/batch-disburse', {
          claimIds: disburseModal.claimIds,
          paymentDate: disbursementDate,
        });
        toast.success(`${res.data.count || disburseModal.claimIds.length} claims disbursed successfully!`);
      }

      setDisburseModal({ open: false, claimIds: [], claimNumber: '', totalAmount: 0 });
      setSelectedClaimIds([]);
      fetchSummaryMetrics();
      fetchClaimsReport();
    } catch (err) {
      console.error('Disbursement failed:', err);
      toast.error(err.response?.data?.message || 'Failed to disburse claim(s)');
    } finally {
      setProcessingDisburse(false);
    }
  };

  // ── Export Claims Report to CSV ──
  const handleExportCSV = async () => {
    try {
      const params = new URLSearchParams();
      params.append('dateBasis', 'expense');
      if (filterEmployee && filterEmployee !== 'ALL') params.append('employee', filterEmployee);
      if (filterCity && filterCity.trim()) params.append('city', filterCity.trim());
      if (filterExpenseType && filterExpenseType !== 'ALL') params.append('expenseType', filterExpenseType);
      if (filterFromDate) params.append('fromDate', filterFromDate);
      if (filterToDate) params.append('toDate', filterToDate);
      if (searchQuery.trim()) params.append('search', searchQuery.trim());
      if (activeTab === 'awaiting') params.append('paymentStatus', 'AWAITING_DISBURSEMENT');
      else if (activeTab === 'disbursed') params.append('paymentStatus', 'DISBURSED');
      else {
        if (filterApprovalStatus && filterApprovalStatus !== 'ALL') params.append('approvalStatus', filterApprovalStatus);
        if (filterPaymentStatus && filterPaymentStatus !== 'ALL') params.append('paymentStatus', filterPaymentStatus);
      }

      const res = await api.get(`/expense/reports/export?${params.toString()}`, {
        responseType: 'blob',
      });

      const blob = new Blob([res.data], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
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

  // ── Export Claims Report to PDF ──
  const handleExportPDF = () => {
    try {
      if (!claimsReportData.length) return toast.error('No claim data to export');

      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      doc.setFontSize(14);
      doc.setTextColor(79, 70, 229);
      doc.text('Expense Claims Report & Disbursement Summary', 14, 15);
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text(
        `Generated: ${new Date().toLocaleString()} | Period: ${formatDateDisplay(filterFromDate)} to ${formatDateDisplay(filterToDate)}`,
        14,
        21
      );

      const headers = [
        ['Claim ID', 'Employee', 'Type', 'City', 'Submission Date', 'Expense Date', 'Claimed (Rs)', 'Approved (Rs)', 'Approval', 'Disbursement']
      ];

      const body = claimsReportData.map((c) => [
        c.claimNumber || 'EXP-CLAIM',
        `${c.employeeName || 'N/A'}\n(${c.employeeCode || '-'})`,
        c.expenseType || 'General',
        c.city || '-',
        formatDateDisplay(c.submissionDate),
        formatDateDisplay(c.expenseDate),
        formatINR(c.claimedAmount),
        formatINR(c.allowedAmount || c.payableAmount),
        c.approvalBadge || c.approvalStatus || 'PENDING',
        c.paymentBadge || c.paymentStatus || 'AWAITING',
      ]);

      autoTable(doc, {
        head: headers,
        body: body,
        startY: 26,
        theme: 'grid',
        styles: { fontSize: 7, cellPadding: 2 },
        headStyles: { fillColor: [79, 70, 229], textColor: [255, 255, 255], fontStyle: 'bold' },
        columnStyles: {
          0: { fontStyle: 'bold' },
          6: { halign: 'right' },
          7: { halign: 'right', fontStyle: 'bold' },
        },
      });

      doc.save(`Expense_Claims_Report_${new Date().toISOString().slice(0, 10)}.pdf`);
      toast.success('PDF report exported successfully');
    } catch (err) {
      console.error('Failed to export PDF report:', err);
      toast.error('Failed to export PDF');
    }
  };

  return (
    <div className="space-y-6 animate-fade-up">
      {/* ── HEADER SECTION ── */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 bg-white p-5 rounded-3xl border border-slate-200 shadow-2xs">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/expense-dashboard')}
            className="p-2.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-2xl text-slate-600 hover:text-indigo-600 transition-all cursor-pointer flex-shrink-0"
            title="Back to Expense Dashboard"
          >
            <ChevronLeft size={18} />
          </button>
          <div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <Receipt className="text-indigo-600" size={24} />
              Expense Claims Report & Disbursement
            </h1>
            <p className="text-xs font-bold text-slate-400 mt-0.5">
              Review all submitted claims, approval & payment statuses, and process single or multi-claim disbursements.
            </p>
          </div>
        </div>

        {/* Global Header Actions: Date Pickers, Export & Refresh */}
        <div className="flex flex-wrap items-center gap-3">
          {/* From Date Button */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold text-slate-500">From:</span>
            <div className="relative" ref={startCalendarRef}>
              <button
                type="button"
                onClick={() => {
                  setShowStartCalendar(!showStartCalendar);
                  setShowEndCalendar(false);
                }}
                className="flex items-center gap-1.5 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 hover:border-indigo-500 transition-all cursor-pointer"
              >
                <Calendar size={13} className="text-indigo-600" />
                <span>{filterFromDate ? formatDateDisplay(filterFromDate) : 'Start Date'}</span>
                {filterFromDate && (
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      setFilterFromDate('');
                    }}
                    className="p-0.5 rounded-full hover:bg-slate-200 text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                    title="Clear start date"
                  >
                    <X size={11} />
                  </span>
                )}
              </button>
              {showStartCalendar && (
                <div className="absolute right-0 mt-2 z-[100] shadow-2xl rounded-2xl overflow-hidden border border-slate-200 bg-white">
                  <CalendarPicker
                    selectedDate={filterFromDate}
                    allowAll={true}
                    onSelect={(d) => {
                      setFilterFromDate(d);
                      setShowStartCalendar(false);
                    }}
                    onSelectDate={(d) => {
                      setFilterFromDate(d);
                      setShowStartCalendar(false);
                    }}
                    onClose={() => setShowStartCalendar(false)}
                  />
                </div>
              )}
            </div>
          </div>

          {/* To Date Button */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold text-slate-500">To:</span>
            <div className="relative" ref={endCalendarRef}>
              <button
                type="button"
                onClick={() => {
                  setShowEndCalendar(!showEndCalendar);
                  setShowStartCalendar(false);
                }}
                className="flex items-center gap-1.5 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 hover:border-indigo-500 transition-all cursor-pointer"
              >
                <Calendar size={13} className="text-indigo-600" />
                <span>{filterToDate ? formatDateDisplay(filterToDate) : 'End Date'}</span>
                {filterToDate && (
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      setFilterToDate('');
                    }}
                    className="p-0.5 rounded-full hover:bg-slate-200 text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                    title="Clear end date"
                  >
                    <X size={11} />
                  </span>
                )}
              </button>
              {showEndCalendar && (
                <div className="absolute right-0 mt-2 z-[100] shadow-2xl rounded-2xl overflow-hidden border border-slate-200 bg-white">
                  <CalendarPicker
                    selectedDate={filterToDate}
                    allowAll={true}
                    onSelect={(d) => {
                      setFilterToDate(d);
                      setShowEndCalendar(false);
                    }}
                    onSelectDate={(d) => {
                      setFilterToDate(d);
                      setShowEndCalendar(false);
                    }}
                    onClose={() => setShowEndCalendar(false)}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Export Dropdown */}
          <div className="relative" ref={exportRef}>
            <button
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

          {/* Refresh Button */}
          <button
            onClick={() => {
              fetchSummaryMetrics();
              fetchClaimsReport();
            }}
            disabled={reportLoading}
            className="p-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 transition-all cursor-pointer"
            title="Refresh Data"
          >
            <RefreshCw size={15} className={reportLoading ? 'animate-spin text-indigo-600' : ''} />
          </button>
        </div>
      </div>

      {/* ── 4 SUMMARY STAT CARDS ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Claims"
          amount={summaryMetrics.total?.amount}
          count={summaryMetrics.total?.count}
          icon={<ListFilter />}
          iconBg="#eff6ff"
          iconColor="#2563eb"
          loading={reportLoading}
          active={activeTab === 'reports'}
          onClick={() => handleTabSelect('reports')}
        />
        <StatCard
          title="Pending Approval"
          amount={summaryMetrics.pendingApproval?.amount}
          count={summaryMetrics.pendingApproval?.count}
          icon={<Hourglass />}
          iconBg="#fffbeb"
          iconColor="#d97706"
          loading={reportLoading}
          active={activeTab === 'pending'}
          onClick={() => handleTabSelect('pending')}
        />
        <StatCard
          title="Awaiting Disbursement"
          amount={summaryMetrics.awaitingDisbursement?.amount}
          count={summaryMetrics.awaitingDisbursement?.count}
          icon={<DollarSign />}
          iconBg="#fef3c7"
          iconColor="#b45309"
          loading={reportLoading}
          active={activeTab === 'awaiting'}
          onClick={() => handleTabSelect('awaiting')}
        />
        <StatCard
          title="Disbursed / Settled"
          amount={summaryMetrics.disbursed?.amount}
          count={summaryMetrics.disbursed?.count}
          icon={<CheckSquare />}
          iconBg="#f0fdf4"
          iconColor="#15803d"
          loading={reportLoading}
          active={activeTab === 'disbursed'}
          onClick={() => handleTabSelect('disbursed')}
        />
      </div>

      {/* ── TAB SELECTOR & FILTER TOGGLE ── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-200 pb-3">
        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
          <button
            onClick={() => handleTabSelect('reports')}
            className={`px-4 py-2 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'reports'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-100'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <Layers size={14} />
            All Expense Claims Report
          </button>

          <button
            onClick={() => handleTabSelect('pending')}
            className={`px-4 py-2 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'pending'
                ? 'bg-amber-600 text-white shadow-md shadow-amber-100'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <Hourglass size={14} />
            Pending Claims Queue
            {summaryMetrics.pendingApproval?.count > 0 && (
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                activeTab === 'pending' ? 'bg-amber-800 text-white' : 'bg-amber-100 text-amber-800'
              }`}>
                {summaryMetrics.pendingApproval.count}
              </span>
            )}
          </button>

          <button
            onClick={() => handleTabSelect('awaiting')}
            className={`px-4 py-2 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'awaiting'
                ? 'bg-amber-600 text-white shadow-md shadow-amber-100'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <DollarSign size={14} />
            Awaiting Disbursement Queue
            {summaryMetrics.awaitingDisbursement?.count > 0 && (
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                activeTab === 'awaiting' ? 'bg-amber-800 text-white' : 'bg-amber-100 text-amber-800'
              }`}>
                {summaryMetrics.awaitingDisbursement.count}
              </span>
            )}
          </button>

          <button
            onClick={() => handleTabSelect('disbursed')}
            className={`px-4 py-2 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'disbursed'
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-100'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <CheckCircle2 size={14} />
            Disbursement History
          </button>
        </div>

        {/* Search & Filter Trigger */}
        <div className="flex items-center gap-2.5 w-full sm:w-auto">
          {/* Live Search */}
          <div className="relative flex-1 sm:w-64">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search claim, employee, city..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-7 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:border-indigo-500 shadow-2xs"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X size={13} />
              </button>
            )}
          </div>

          {/* Filter Toggle Button */}
          <button
            onClick={() => setShowFilterPanel(!showFilterPanel)}
            className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5 cursor-pointer ${
              showFilterPanel || activeFiltersCount > 0
                ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            <Filter size={13} />
            <span>Filters</span>
            {activeFiltersCount > 0 && (
              <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[10px] font-extrabold flex items-center justify-center">
                {activeFiltersCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ── ADVANCED COLLAPSIBLE FILTER PANEL ── */}
      <AnimatePresence>
        {showFilterPanel && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto', transitionEnd: { overflow: 'visible' } }}
            exit={{ opacity: 0, height: 0, overflow: 'hidden' }}
            transition={{ duration: 0.2 }}
            className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm space-y-4 relative z-30 overflow-visible"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Filter size={15} className="text-indigo-600" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 m-0">
                  Advanced Filters
                </h3>
              </div>
              <button
                type="button"
                onClick={resetAllFilters}
                className="text-xs font-bold text-rose-600 hover:text-rose-700 hover:underline flex items-center gap-1 cursor-pointer"
              >
                <X size={13} />
                Reset All Filters
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 text-xs">
              {/* Employee Filter with Search Box */}
              <div className="space-y-1">
                <label className="font-bold text-slate-500 text-[11px] flex items-center gap-1">
                  <Users size={12} className="text-indigo-600" />
                  Employee Name
                </label>
                <SearchableDropdown
                  options={employeesList.map((emp) => ({
                    value: emp.name || emp.fullName,
                    label: emp.name || emp.fullName,
                    sublabel: (emp.employeeIdCode || emp.employeeId) ? `(${emp.employeeIdCode || emp.employeeId})` : '',
                  }))}
                  value={filterEmployee}
                  onChange={(val) => setFilterEmployee(val)}
                  allOption={{ label: 'All Employees', value: 'ALL' }}
                  searchPlaceholder="Search employee name or code..."
                  placeholder="Select Employee..."
                  icon={Users}
                  searchable={true}
                />
              </div>

              {/* City / Destination Filter with Search Box */}
              <div className="space-y-1">
                <label className="font-bold text-slate-500 text-[11px] flex items-center gap-1">
                  <MapPin size={12} className="text-indigo-600" />
                  City / Location
                </label>
                <SearchableDropdown
                  options={citiesList.map((c) => ({
                    value: c.city,
                    label: c.city,
                    sublabel: c.cityClass ? `(Class ${c.cityClass})` : '',
                  }))}
                  value={filterCity}
                  onChange={(val) => setFilterCity(val)}
                  allOption={{ label: 'All Cities', value: '' }}
                  searchPlaceholder="Search city name..."
                  placeholder="Select City..."
                  icon={MapPin}
                  searchable={true}
                />
              </div>

              {/* Expense Type Filter */}
              <div className="space-y-1">
                <label className="font-bold text-slate-500 text-[11px]">Expense Type</label>
                <SearchableDropdown
                  options={[
                    { value: 'TRAVEL', label: 'Travel / Transit' },
                    { value: 'FOOD', label: 'Food & Meals' },
                    { value: 'LODGING', label: 'Lodging / Hotel' },
                    { value: 'CLIENT_VISIT', label: 'Client Visit' },
                    { value: 'FUEL', label: 'Fuel / Conveyance' },
                    { value: 'OTHER', label: 'Other / Misc' },
                  ]}
                  value={filterExpenseType}
                  onChange={(val) => setFilterExpenseType(val)}
                  allOption={{ label: 'All Expense Types', value: 'ALL' }}
                  placeholder="Select Expense Type..."
                  searchable={false}
                />
              </div>

              {/* Approval Status Filter (If in Reports tab) */}
              {activeTab === 'reports' && (
                <div className="space-y-1">
                  <label className="font-bold text-slate-500 text-[11px]">Approval Status</label>
                  <SearchableDropdown
                    options={[
                      { value: 'PENDING', label: 'Pending Approval' },
                      { value: 'APPROVED', label: 'Approved' },
                      { value: 'REJECTED', label: 'Rejected' },
                    ]}
                    value={filterApprovalStatus}
                    onChange={(val) => setFilterApprovalStatus(val)}
                    allOption={{ label: 'All Approvals', value: 'ALL' }}
                    placeholder="Select Approval Status..."
                    searchable={false}
                  />
                </div>
              )}

              {/* Payment Status Filter (If in Reports tab) */}
              {activeTab === 'reports' && (
                <div className="space-y-1">
                  <label className="font-bold text-slate-500 text-[11px]">Disbursement Status</label>
                  <SearchableDropdown
                    options={[
                      { value: 'AWAITING_DISBURSEMENT', label: 'Awaiting Disbursement' },
                      { value: 'DISBURSED', label: 'Disbursed / Paid' },
                      { value: 'NOT_APPLICABLE', label: 'Not Applicable / In Review' },
                    ]}
                    value={filterPaymentStatus}
                    onChange={(val) => setFilterPaymentStatus(val)}
                    allOption={{ label: 'All Payment Statuses', value: 'ALL' }}
                    placeholder="Select Payment Status..."
                    searchable={false}
                  />
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── BATCH DISBURSEMENT FLOATING BANNER (When Claims Selected) ── */}
      {activeTab === 'awaiting' && selectedClaimIds.length > 0 && (
        <div className="bg-gradient-to-r from-indigo-900 via-indigo-800 to-slate-900 text-white p-4 rounded-2xl shadow-xl flex flex-wrap items-center justify-between gap-3 animate-fade-in border border-indigo-700">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center font-bold text-sm">
              {selectedClaimIds.length}
            </div>
            <div>
              <span className="font-bold text-xs tracking-wider uppercase text-indigo-200">
                Batch Disbursement Selected
              </span>
              <div className="text-base font-extrabold text-white mt-0.5">
                Total: ₹ {formatINR(selectedTotalAmount)}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelectedClaimIds([])}
              className="px-3.5 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
            >
              Clear Selection
            </button>
            <button
              onClick={() => {
                setDisbursementDate(formatDateYYYYMMDD(new Date()));
                setDisburseModal({
                  open: true,
                  claimIds: selectedClaimIds,
                  claimNumber: `${selectedClaimIds.length} claims`,
                  totalAmount: selectedTotalAmount,
                });
              }}
              className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-xs font-extrabold shadow-md transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
            >
              <DollarSign size={14} />
              Disburse Selected Claims ({selectedClaimIds.length})
            </button>
          </div>
        </div>
      )}

      {/* ── MAIN CONTENT AREA: CLAIMS REPORT & QUEUES ── */}
      <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-2xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse border border-slate-200">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-500 tracking-wider">
                  {/* Select Checkbox (Only when awaiting disbursement queue is selected) */}
                  {activeTab === 'awaiting' && (
                    <th className="px-3 py-4 w-10 text-left border-r border-slate-200">
                      {claimsReportData.some((c) => canDisburseClaim(c)) && (
                        <input
                          type="checkbox"
                          checked={allCurrentAwaitingSelected}
                          onChange={toggleSelectAllAwaiting}
                          className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 cursor-pointer"
                          title="Select/Deselect all payable claims on this page"
                        />
                      )}
                    </th>
                  )}

                  <th className="px-3 py-4 w-28 text-left border-r border-slate-200">Claim ID</th>
                  <th className="px-4 py-4 text-left border-r border-slate-200">Employee</th>
                  <th className="px-4 py-4 text-left border-r border-slate-200">Expense Type & City</th>
                  <th className="px-4 py-4 text-left border-r border-slate-200">Dates</th>
                  <th className="px-4 py-4 text-left border-r border-slate-200">Claimed</th>
                  <th className="px-4 py-4 text-left border-r border-slate-200">Approved / Payable</th>
                  <th className="px-4 py-4 text-left border-r border-slate-200">Approval Status</th>
                  <th className="px-4 py-4 text-left border-r border-slate-200">Payment Status</th>
                  <th className="px-4 py-4 text-left">Actions</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-200 text-xs font-semibold text-slate-700">
                {reportLoading ? (
                  <tr>
                    <td colSpan={activeTab === 'awaiting' ? 10 : 9} className="py-20 text-center text-slate-400">
                      <Loader2 className="animate-spin mx-auto text-indigo-600 mb-2" size={30} />
                      <p className="text-xs font-bold">Loading expense claims report...</p>
                    </td>
                  </tr>
                ) : claimsReportData.length === 0 ? (
                  <tr>
                    <td colSpan={activeTab === 'awaiting' ? 10 : 9} className="py-20 text-center text-slate-400">
                      <div className="w-14 h-14 rounded-2xl bg-slate-50 text-slate-300 mx-auto flex items-center justify-center mb-2">
                        <Receipt size={28} />
                      </div>
                      <p className="text-sm font-bold text-slate-700">No Expense Claims Found</p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {activeTab === 'awaiting'
                          ? 'No expense claims are currently awaiting disbursement.'
                          : 'Try changing your filters, search terms, or date range.'}
                      </p>
                    </td>
                  </tr>
                ) : (
                  claimsReportData.map((claim) => {
                    const isApproved = isClaimApproved(claim);
                    const isDisbursed = isClaimDisbursed(claim);
                    const canDisburse = canDisburseClaim(claim);
                    const isRejected = claim.approvalStatus === 'REJECTED' || ['HR_REJECTED', 'ACCOUNTS_REJECTED', 'REJECTED'].includes(claim.status);

                    return (
                      <tr
                        key={claim._id}
                        onClick={() => handleOpenClaimDetail(claim)}
                        className={`hover:bg-indigo-50/40 transition-colors cursor-pointer group border-b border-slate-200 ${
                          selectedClaimIds.includes(claim._id) ? 'bg-indigo-50/50' : ''
                        }`}
                        title="Click to view full claim details"
                      >
                        {/* Checkbox — Strictly only for awaiting disbursement queue */}
                        {activeTab === 'awaiting' && (
                          <td className="px-3 py-3.5 text-left border-r border-slate-200" onClick={(e) => e.stopPropagation()}>
                            {canDisburse && (
                              <input
                                type="checkbox"
                                checked={selectedClaimIds.includes(claim._id)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedClaimIds((prev) => [...prev, claim._id]);
                                  } else {
                                    setSelectedClaimIds((prev) => prev.filter((id) => id !== claim._id));
                                  }
                                }}
                                className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 cursor-pointer"
                                title="Select for batch disbursement"
                              />
                            )}
                          </td>
                        )}

                        {/* Claim ID — small size, text-left */}
                        <td className="px-3 py-3.5 w-28 whitespace-nowrap text-left border-r border-slate-200">
                          <span className="font-extrabold text-slate-900 tracking-tight text-xs">
                            {claim.claimNumber || 'EXP-CLAIM'}
                          </span>
                          {claim.companyName && (
                            <div className="text-[10px] text-slate-400 font-bold truncate max-w-[110px]">{claim.companyName}</div>
                          )}
                        </td>

                        {/* Employee — text-left */}
                        <td className="px-4 py-3.5 text-left border-r border-slate-200">
                          <div className="font-bold text-slate-900">{claim.employeeName}</div>
                          <div className="text-[11px] text-slate-400 font-semibold">
                            {claim.employeeCode} {claim.department ? `• ${claim.department}` : ''}
                          </div>
                        </td>

                        {/* Type & City — text-left */}
                        <td className="px-4 py-3.5 text-left border-r border-slate-200">
                          <div className="font-bold text-slate-800">{claim.expenseType || 'General'}</div>
                          {claim.city && (
                            <div className="text-[11px] text-slate-500 font-medium flex items-center gap-1 mt-0.5">
                              <MapPin size={11} className="text-slate-400 shrink-0" />
                              <span>{claim.city}</span>
                            </div>
                          )}
                        </td>

                        {/* Dates — bold claim selected date, and in span show applied date */}
                        <td className="px-4 py-3.5 text-left border-r border-slate-200">
                          <div className="font-extrabold text-slate-900 flex items-center gap-1.5">
                            <Calendar size={12} className="text-indigo-600 shrink-0" />
                            <span>{formatDateDisplay(claim.expenseDate || claim.claimDate || claim.fromDate || claim.submissionDate)}</span>
                          </div>
                          <span className="text-[10px] text-slate-400 font-medium block mt-0.5">
                            Applied: {formatDateDisplay(claim.submissionDate || claim.createdAt)}
                          </span>
                        </td>

                        {/* Claimed Amount — text-left */}
                        <td className="px-4 py-3.5 text-left font-bold text-slate-700 border-r border-slate-200">
                          ₹ {formatINR(claim.claimedAmount)}
                        </td>

                        {/* Approved / Payable Amount — text-left */}
                        <td className="px-4 py-3.5 text-left font-extrabold text-slate-900 border-r border-slate-200">
                          ₹ {formatINR(claim.payableAmount || claim.allowedAmount || claim.claimedAmount)}
                        </td>

                        {/* Approval Status Badge — text-left */}
                        <td className="px-4 py-3.5 text-left border-r border-slate-200">
                          <span
                            className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-extrabold border ${
                              isRejected
                                ? 'bg-rose-50 text-rose-700 border-rose-200'
                                : claim.approvalStatus === 'APPROVED'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-amber-50 text-amber-800 border-amber-200'
                            }`}
                          >
                            {claim.approvalBadge || claim.approvalStatus || 'PENDING'}
                          </span>
                        </td>

                        {/* Payment Status Badge — text-left */}
                        <td className="px-4 py-3.5 text-left border-r border-slate-200">
                          <span
                            className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-extrabold border ${
                              isDisbursed
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : canDisburse
                                ? 'bg-amber-50 text-amber-800 border-amber-300 animate-pulse'
                                : 'bg-slate-100 text-slate-600 border-slate-200'
                            }`}
                          >
                            {isDisbursed
                              ? '✅ Disbursed'
                              : canDisburse
                              ? '⏳ Awaiting Disbursement'
                              : 'In Review'}
                          </span>
                        </td>

                        {/* Action Buttons — text-left */}
                        <td className="px-4 py-3.5 text-left" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-start gap-1.5">
                            {/* Action Button: Navigates to Pending Approvals Page for this particular claim */}
                            <button
                              type="button"
                              onClick={() => {
                                const targetTab = claim.status === 'HR_PENDING'
                                  ? 'hr'
                                  : (claim.paymentStatus === 'AWAITING_DISBURSEMENT' || claim.status === 'ACCOUNTS_APPROVED')
                                  ? 'disburse_claims'
                                  : 'account_claims';
                                navigate(`/pending-approvals?claimId=${claim._id}&claimNumber=${claim.claimNumber || ''}&tab=${targetTab}`);
                              }}
                              className="px-2.5 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-extrabold text-[11px] border border-indigo-200 transition-all flex items-center gap-1 cursor-pointer shadow-2xs active:scale-95"
                              title="Go to Pending Request Page to review, approve, or disburse this claim"
                            >
                              <span>Action</span>
                              <ArrowRight size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* ── CLAIMS REPORT PAGINATION CONTROLS ── */}
          {reportPagination.total > 0 && (
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
              <div className="text-slate-500 font-bold">
                Showing{' '}
                <span className="font-extrabold text-slate-900">
                  {(reportPage - 1) * reportLimit + 1}
                </span>{' '}
                to{' '}
                <span className="font-extrabold text-slate-900">
                  {Math.min(reportPage * reportLimit, reportPagination.total)}
                </span>{' '}
                of <span className="font-extrabold text-slate-900">{reportPagination.total}</span> claims
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
                    <option value={10}>10</option>
                    <option value={15}>15</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
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
                    disabled={reportPage === reportPagination.totalPages}
                    className="w-8 h-8 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

      {/* ══════════════ MINIMAL DATE-ONLY DISBURSEMENT MODAL ══════════════ */}
      {/* Account Admin chooses ONLY the disbursement date. NO other inputs required. */}
      <AnimatePresence>
        {disburseModal.open && (
          <div className="fixed inset-0 z-[3500] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden border border-slate-100 p-6 md:p-8 space-y-6"
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                    <DollarSign size={20} />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900 m-0">Confirm Disbursement</h3>
                    <p className="text-xs text-slate-400 font-medium m-0">
                      {disburseModal.claimIds.length > 1
                        ? `Batch disburse ${disburseModal.claimIds.length} expense claims`
                        : `Disburse ${disburseModal.claimNumber}`}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setDisburseModal({ open: false, claimIds: [], claimNumber: '', totalAmount: 0 })}
                  className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Total Payable Card */}
              <div className="bg-emerald-50/60 border border-emerald-200/80 rounded-2xl p-4 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                    Total Payable Amount
                  </span>
                  <div className="text-xl font-extrabold text-emerald-950 mt-0.5">
                    ₹ {formatINR(disburseModal.totalAmount)}
                  </div>
                </div>
                <span className="text-xs font-bold px-3 py-1 bg-white text-emerald-800 rounded-xl border border-emerald-200 shadow-2xs">
                  {disburseModal.claimIds.length} {disburseModal.claimIds.length === 1 ? 'Claim' : 'Claims'}
                </span>
              </div>

              {/* ONLY DATE INPUT — NO OTHER INPUTS */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <Calendar size={14} className="text-indigo-600" />
                  Disbursement Date <span className="text-rose-500">*</span>
                </label>
                <input
                  type="date"
                  value={disbursementDate}
                  onChange={(e) => setDisbursementDate(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:border-indigo-500 focus:bg-white transition-all"
                  required
                />
                <p className="text-[11px] text-slate-400 font-medium">
                  Select the date when the payment was executed. Payment method is set to Bank Transfer by default.
                </p>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setDisburseModal({ open: false, claimIds: [], claimNumber: '', totalAmount: 0 })}
                  disabled={processingDisburse}
                  className="px-5 py-2.5 rounded-xl font-bold text-xs text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDisbursement}
                  disabled={processingDisburse || !disbursementDate}
                  className="px-6 py-2.5 rounded-xl font-bold text-xs text-white bg-emerald-600 hover:bg-emerald-700 transition-all shadow-md shadow-emerald-100 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 cursor-pointer"
                >
                  {processingDisburse ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      Disbursing...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={15} />
                      Confirm Disbursement
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ══════════════ CLAIM FULL DETAIL VIEW MODAL ══════════════ */}
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
                const expTypeName = firstItem.expenseTypeName || (
                  expType === 'CONVEYANCE' ? 'Local Conveyance' :
                  expType === 'FOOD' ? 'Food' :
                  expType === 'TRAVEL' ? 'Travel' :
                  (expType === 'LODGING' || expType === 'LOGGING') ? 'Lodging' :
                  expType === 'OTHER' ? 'Other Expense' : expType
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
                  expType === 'CONVEYANCE'
                    ? ((entry.distanceKm || firstItem.distanceKm) ? `${entry.distanceKm || firstItem.distanceKm} km x ₹${firstItem.calculationBreakdown?.sourceValues?.rate || 10}/km` : 'Actuals (Fully Allowed)')
                    : expType === 'TRAVEL'
                      ? 'Travel fare (Fully Allowed)'
                      : expType === 'OTHER'
                        ? ((entry.otherSubType || firstItem.otherSubType) === 'PURCHASE' ? 'Purchase (Fully Allowed)' : 'Actual amount (Fully Allowed)')
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
                  distanceKm: entry.distanceKm || firstItem.distanceKm,
                  vehicle: entry.vehicle || firstItem.vehicle,
                  otherSubType: entry.otherSubType || firstItem.otherSubType,
                  barcodeNumber: entry.barcodeNumber || firstItem.barcodeNumber,
                  quantity: entry.quantity || firstItem.quantity,
                  attachments: atts,
                };
              })
            : [{
                expenseType: ecList[0]?.items?.[0]?.expenseType || raw.claimType || 'Expense',
                expenseTypeName: raw.expenseType || raw.claimType || 'Expense',
                expenseDate: ecList[0]?.items?.[0]?.expenseDate || raw.expenseDate || raw.claimDate || raw.date || raw.fromDate || raw.submissionDate || raw.createdAt,
                requestedAmount: grandReq,
                allowedAmount: grandAllow,
                excessAmount: grandExc,
                policyLimit: grandLimit,
                hasExcess: grandExc > 0,
                limitDisplay: grandLimit > 0 ? `₹${formatINR(grandLimit)}` : 'Actuals (Fully Allowed)',
                formula: raw.formula || ecList[0]?.items?.[0]?.formula || ecList[0]?.items?.[0]?.calculationBreakdown?.formula,
                description: raw.remark || raw.purpose || ecList[0]?.items?.[0]?.description || '',
                attachments: raw.receipts || ecList[0]?.items?.[0]?.attachments || [],
              }];

          const { billProofs, serviceReports, fullPaymentProofs } = getClaimProofs(raw);
          const isApproved = isClaimApproved(raw);
          const isDisbursed = isClaimDisbursed(raw);
          const canDisburse = canDisburseClaim(raw);
          const isRejected = raw.approvalStatus === 'REJECTED' || ['HR_REJECTED', 'ACCOUNTS_REJECTED', 'REJECTED'].includes(raw.status);

          const appliedRules = combinedItems
            .map((it, idx) => {
              const formula = it.formula || raw.formula || ecList[0]?.items?.[idx]?.formula;
              const title = combinedItems.length > 1 ? `Entry #${idx + 1} (${it.expenseTypeName})` : it.expenseTypeName;
              return { title, formula };
            })
            .filter(r => Boolean(r.formula));

          return (
            <div className="fixed inset-0 z-[3400] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto">
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 15 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 15 }}
                className="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl overflow-hidden my-8 border border-slate-100 flex flex-col max-h-[90vh]"
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
                      className={`text-[10px] font-extrabold px-3 py-1 rounded-full tracking-wider ${
                        isRejected
                          ? 'bg-rose-400 text-rose-950'
                          : isDisbursed
                          ? 'bg-emerald-400 text-emerald-950'
                          : isApproved
                          ? 'bg-emerald-400 text-emerald-950'
                          : 'bg-amber-400 text-amber-950'
                      }`}
                    >
                      {isRejected
                        ? '❌ Rejected Expense Claim'
                        : isDisbursed
                        ? '✅ Disbursed & Paid'
                        : isApproved
                        ? '✅ Approved for Payment'
                        : '⏳ Pending Approval Review'}
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

                  {/* Decision Banner (if approved, rejected, or disbursed) */}
                  {(isApproved || isRejected || isDisbursed) && (
                    <div
                      className={`p-4 rounded-2xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
                        isRejected
                          ? 'bg-rose-50/90 border-rose-200 text-rose-900'
                          : 'bg-emerald-50/90 border-emerald-200 text-emerald-900'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-9 h-9 rounded-xl flex items-center justify-center text-white ${
                            isRejected
                              ? 'bg-rose-600 shadow-md shadow-rose-200'
                              : 'bg-emerald-600 shadow-md shadow-emerald-200'
                          }`}
                        >
                          {isRejected ? <XCircle size={20} /> : <CheckCircle2 size={20} />}
                        </div>
                        <div>
                          <span className="text-[10px] font-extrabold uppercase tracking-wider block opacity-75">
                            Decision Status
                          </span>
                          <span className="text-sm font-extrabold">
                            {raw.approvalBadge || raw.approvalStatus || (isApproved ? 'Approved' : 'Pending')}
                          </span>
                        </div>
                      </div>
                      <div className="text-left sm:text-right text-xs">
                        <span className="block font-bold opacity-75">
                          {isRejected ? 'Decision Reason / Remarks:' : 'Settlement & Payment Remarks:'}
                        </span>
                        <span className="font-extrabold">
                          {raw.decisionRemarks || raw.accountsRemarks || raw.hrRemarks || (isRejected ? 'Rejected' : isDisbursed ? 'Approved & Disbursed' : 'Approved for Payment')}
                        </span>
                        {(isDisbursed || raw.disbursedAmount > 0) && (
                          <span className="block text-[11px] font-extrabold text-emerald-700 mt-0.5">
                            Disbursed: ₹{formatINR(raw.disbursedAmount || raw.paidAmount || grandAllow)}
                          </span>
                        )}
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
                          <span className="text-xs font-extrabold text-orange-950 uppercase tracking-wider">
                            Full Payment Requested by Employee
                          </span>
                        </div>
                        <span
                          className={`px-2.5 py-0.5 rounded-lg text-[10px] font-extrabold border uppercase ${
                            raw.fullPayment?.status === 'APPROVED' || raw.fullPaymentApproved
                              ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                              : raw.fullPayment?.status === 'REJECTED'
                              ? 'bg-rose-100 text-rose-800 border-rose-300'
                              : 'bg-amber-100 text-amber-900 border-amber-300'
                          }`}
                        >
                          {raw.fullPayment?.status || (raw.fullPaymentApproved ? 'APPROVED' : 'PENDING APPROVAL')}
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
                    <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">
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
                    className={`p-4 rounded-2xl border space-y-3 ${
                      hasExcess ? 'bg-rose-50/70 border-rose-200 text-rose-950' : 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-extrabold uppercase tracking-wider flex items-center gap-1.5">
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
                      className={`grid grid-cols-2 ${
                        isDisbursed ? 'sm:grid-cols-5' : 'sm:grid-cols-4'
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
                      {isDisbursed && (
                        <div>
                          <span className="text-[9px] font-extrabold text-indigo-600 block">Disbursed / Paid</span>
                          <span className="text-sm font-extrabold text-indigo-700">
                            ₹{formatINR(raw.disbursedAmount || raw.paidAmount || grandAllow)}
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
                            <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block mb-1">
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
                            <span className="text-xs font-black text-indigo-700 bg-white px-2.5 py-0.5 rounded-md border border-indigo-300 shadow-2xs">
                              ₹{formatINR(grandLimit)} {isLogging ? `(${days} days)` : ''}
                            </span>
                          </div>

                          {/* 3. Allowed & Excess Calculation Breakdown */}
                          <div className={`p-2.5 rounded-lg border flex items-start gap-2 ${hasExcess ? 'bg-rose-50/70 border-rose-200 text-rose-950' : 'bg-emerald-50/70 border-emerald-200 text-emerald-950'}`}>
                            <span className="text-base">{hasExcess ? '⚠️' : '✅'}</span>
                            <div className="space-y-0.5">
                              <span className="text-[10px] font-extrabold uppercase tracking-wider block">
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
                          <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block">
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
                      <span className="text-[11px] font-extrabold text-slate-400 tracking-wider uppercase">
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
                                {it.otherSubType && (
                                  <span
                                    className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase border ${
                                      it.otherSubType === 'PURCHASE'
                                        ? 'bg-amber-50 text-amber-700 border-amber-200'
                                        : 'bg-blue-50 text-blue-700 border-blue-200'
                                    }`}
                                  >
                                    {it.otherSubType === 'PURCHASE' ? '🛒 Purchase' : '📄 Normal'}
                                  </span>
                                )}
                                {it.barcodeNumber && (
                                  <span className="px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 border border-purple-200 text-[10px] font-mono font-bold">
                                    Barcode: {it.barcodeNumber}
                                  </span>
                                )}
                                {it.quantity && (
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
                                className={`px-2.5 py-1 rounded-xl text-[10px] font-extrabold border ${
                                  it.hasExcess
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
                        <span className="text-xs font-extrabold text-indigo-950 uppercase tracking-wider flex items-center gap-1.5">
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
                                  className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold shrink-0 ${
                                    isPdf ? 'bg-rose-50 text-rose-600 border border-rose-200' : 'bg-indigo-50 text-indigo-600 border border-indigo-200'
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
                      <span className="text-xs font-extrabold text-teal-950 uppercase tracking-wider block">
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
                      <span className="text-xs font-extrabold text-orange-950 uppercase tracking-wider block">
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

                  {/* Remarks & Settlement Information */}
                  <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2.5 text-xs">
                    <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">
                      Approvals & Remarks Trail
                    </span>
                    {raw.hrRemarks && (
                      <div className="flex justify-between items-center py-1 border-b border-slate-100">
                        <span className="font-bold text-slate-400">HR Remarks</span>
                        <span className="font-extrabold text-slate-800">{raw.hrRemarks}</span>
                      </div>
                    )}
                    {raw.accountsRemarks && (
                      <div className="flex justify-between items-center py-1 border-b border-slate-100">
                        <span className="font-bold text-slate-400">Accounts Remarks</span>
                        <span className="font-extrabold text-slate-800">{raw.accountsRemarks}</span>
                      </div>
                    )}
                    {raw.disbursementDate && (
                      <div className="flex justify-between items-center py-1 border-b border-slate-100">
                        <span className="font-bold text-slate-400">Disbursed Date</span>
                        <span className="font-extrabold text-emerald-700">{formatDateDisplay(raw.disbursementDate)}</span>
                      </div>
                    )}
                    {raw.paymentMethod && (
                      <div className="flex justify-between items-center py-1 border-b border-slate-100">
                        <span className="font-bold text-slate-400">Payment Mode</span>
                        <span className="font-extrabold text-slate-800">{raw.paymentMethod}</span>
                      </div>
                    )}
                    {raw.paymentReference && (
                      <div className="flex justify-between items-center py-1">
                        <span className="font-bold text-slate-400">Reference / UTR</span>
                        <span className="font-extrabold text-slate-800">{raw.paymentReference}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Modal Footer */}
                <div className="p-6 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-3 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => setDetailClaim(null)}
                    className="px-6 py-3 rounded-2xl font-bold text-xs text-slate-600 bg-white border border-slate-200 hover:bg-slate-100 transition-all cursor-pointer"
                  >
                    Close Details
                  </button>

                  {canDisburse && (
                    <button
                      type="button"
                      onClick={() => {
                        const itm = raw;
                        setDetailClaim(null);
                        setDisbursementDate(formatDateYYYYMMDD(new Date()));
                        setDisburseModal({
                          open: true,
                          claimIds: [itm._id],
                          claimNumber: itm.claimNumber || 'EXP-CLAIM',
                          totalAmount: itm.payableAmount || itm.allowedAmount || itm.claimedAmount || 0,
                        });
                      }}
                      className="px-7 py-3 rounded-2xl font-bold text-xs text-white bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-100 transition-all flex items-center gap-2 cursor-pointer active:scale-95"
                    >
                      <DollarSign size={15} />
                      Disburse Claim Now (₹ {formatINR(raw.payableAmount || raw.allowedAmount || raw.claimedAmount)})
                    </button>
                  )}
                </div>
              </motion.div>
            </div>
          );
        })()}
      </AnimatePresence>
    </div>
  );
};

export default ExpenseReportPage;
