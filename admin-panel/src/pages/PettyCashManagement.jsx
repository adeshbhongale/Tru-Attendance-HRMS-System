import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowLeft,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  CornerUpLeft,
  Download,
  Eye,
  History,
  Loader2,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  Wallet,
  X
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';

const fmtINR = (n) => {
  const v = Number(n) || 0;
  const abs = Math.abs(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${v < 0 ? '-₹' : '₹'}${abs}`;
};

const fmtDate = (d) => (d ? new Date(d).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—');

const newKey = (prefix = 'pc') => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const getLedgerCategoryBadge = (t) => {
  const cat = String(t?.transactionCategory || '').toUpperCase();
  const src = String(t?.source || '').toUpperCase();
  const type = String(t?.type || '').toUpperCase();

  if (src === 'TOPUP' || cat === 'INITIAL_ALLOCATION') {
    return {
      label: 'Initial Allocation',
      shortLabel: cat || 'INITIAL_ALLOCATION',
      cls: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
      rowCls: 'bg-emerald-50/20',
      affectsBaseLimit: true,
      tone: 'emerald',
    };
  }

  if (src === 'TOPUP_REQUEST' || cat === 'ALLOCATION_ENHANCEMENT') {
    return {
      label: 'Enhancement (+Balance)',
      shortLabel: 'ALLOCATION_ENHANCEMENT',
      cls: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
      rowCls: 'bg-emerald-50/20',
      affectsBaseLimit: false,
      tone: 'emerald',
    };
  }

  if (cat === 'PETTY_CASH_RETURN' || src === 'PETTY_CASH_RETURN') {
    return {
      label: 'Petty Cash Return',
      shortLabel: 'PETTY_CASH_RETURN',
      cls: 'bg-rose-50 text-rose-700 border border-rose-200',
      rowCls: 'bg-rose-50/20',
      affectsBaseLimit: false,
      tone: 'rose',
    };
  }

  if (cat === 'REVERSAL' || type === 'REVERSAL') {
    const baseChanged =
      t?.baseLimitBefore !== null &&
      t?.baseLimitBefore !== undefined &&
      t?.baseLimitAfter !== null &&
      t?.baseLimitAfter !== undefined &&
      Number(t.baseLimitBefore) !== Number(t.baseLimitAfter);
    return {
      label: baseChanged ? 'Reversal (Base Limit)' : 'Reversal',
      shortLabel: 'REVERSAL',
      cls: 'bg-amber-50 text-amber-700 border border-amber-200',
      rowCls: '',
      affectsBaseLimit: baseChanged,
      tone: 'amber',
    };
  }

  if (cat === 'CLAIM_SETTLEMENT' || src === 'CLAIM_PAYMENT') {
    return {
      label: 'Claim Settlement',
      shortLabel: 'CLAIM_SETTLEMENT',
      cls: 'bg-indigo-50 text-indigo-700 border border-indigo-200',
      rowCls: '',
      affectsBaseLimit: false,
      tone: 'indigo',
    };
  }

  if (cat === 'EXPENSE_DEDUCTION' || src.startsWith('CLAIM_')) {
    return {
      label: 'Expense Claim',
      shortLabel: 'EXPENSE_DEDUCTION',
      cls: 'bg-slate-100 text-slate-700 border border-slate-200',
      rowCls: '',
      affectsBaseLimit: false,
      tone: 'slate',
    };
  }

  return {
    label: 'Account Adjustment',
    shortLabel: cat || 'OTHER_ADJUSTMENT',
    cls: 'bg-slate-100 text-slate-600 border border-slate-200',
    rowCls: '',
    affectsBaseLimit: false,
    tone: 'slate',
  };
};

const StatCard = ({ title, value, sub, icon, tone = 'indigo' }) => {
  const tones = {
    indigo: 'bg-indigo-50 text-indigo-600 border-indigo-100',
    emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    rose: 'bg-rose-50 text-rose-600 border-rose-100',
    amber: 'bg-amber-50 text-amber-600 border-amber-100',
    teal: 'bg-teal-50 text-teal-600 border-teal-100',
  };
  return (
    <div className="bg-white border border-slate-200 p-4 rounded-2xl flex items-center gap-3.5 shadow-xs">
      <div className={`w-11 h-11 rounded-2xl border flex items-center justify-center flex-shrink-0 ${tones[tone] || tones.indigo}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-extrabold tracking-wider text-slate-400">{title}</p>
        <p className={`text-lg md:text-xl font-extrabold tracking-tight truncate ${tone === 'rose' ? 'text-rose-600' : 'text-slate-900'}`}>
          {value}
        </p>
        {sub && <p className="text-[11px] font-bold text-slate-500 truncate">{sub}</p>}
      </div>
    </div>
  );
};

const PettyCashManagement = () => {
  const navigate = useNavigate();
  const { user } = useSelector((state) => state.auth);
  const [tab, setTab] = useState('wallets'); // wallets | requests | return_requests | ledger
  const [summary, setSummary] = useState(null);

  const userRole = (user?.role || '').trim().toLowerCase().replace(/[-\s]/g, '_');
  const userRoleCode = (user?.roleCode || '').trim().toUpperCase().replace(/[-\s]/g, '_');
  const deptAdminType = (user?.departmentAdminType || user?.adminType || '').trim().toLowerCase();
  const isAccountRole =
    ['account_admin', 'accounts_admin', 'accounts', 'finance', 'finance_admin', 'dept:finance_admin', 'accountant'].includes(userRole) ||
    ['ACCOUNT_ADMIN', 'ACCOUNTS_ADMIN', 'TCACC1', 'TCACC2'].includes(userRoleCode) ||
    ['accounts', 'account', 'finance'].includes(deptAdminType);
  const isSuperOrCompanyAdmin =
    !isAccountRole &&
    (user?.scope === 'GLOBAL' ||
      ['superadmin', 'super_admin', 'company_admin', 'companyadmin', 'admin'].includes(userRole) ||
      ['TCSA1', 'SUPER_ADMIN', 'SUPERADMIN', 'TCCA1', 'COMPANY_ADMIN', 'COMPANYADMIN', 'APEXCA1'].includes(userRoleCode));
  const canReverse = summary?.canReverse !== undefined ? Boolean(summary.canReverse && isSuperOrCompanyAdmin) : isSuperOrCompanyAdmin;
  const [loadingSummary, setLoadingSummary] = useState(true);

  // Wallets tab state
  const [wallets, setWallets] = useState([]);
  const [walletPage, setWalletPage] = useState({ page: 1, pages: 1, total: 0 });
  const [walletSearch, setWalletSearch] = useState('');
  const [balanceFilter, setBalanceFilter] = useState('');
  const [enabledFilter, setEnabledFilter] = useState('');
  const [loadingWallets, setLoadingWallets] = useState(false);

  // Enhancement Requests tab state
  const [requests, setRequests] = useState([]);
  const [requestStatus, setRequestStatus] = useState('ALL');
  const [loadingRequests, setLoadingRequests] = useState(false);

  // Return Requests tab state
  const [returnRequests, setReturnRequests] = useState([]);
  const [returnRequestStatus, setReturnRequestStatus] = useState('ALL');
  const [returnSearch, setReturnSearch] = useState('');
  const [loadingReturnRequests, setLoadingReturnRequests] = useState(false);

  // Ledger / Reports tab state
  const [ledger, setLedger] = useState([]);
  const [ledgerTotals, setLedgerTotals] = useState({ credit: 0, debit: 0, net: 0, bySource: [] });
  const [ledgerPage, setLedgerPage] = useState({ page: 1, pages: 1, total: 0 });
  const [ledgerFilter, setLedgerFilter] = useState({
    type: 'ALL',
    source: 'ALL',
    category: 'ALL',
    from: '',
    to: '',
    employeeId: '',
    claimLinked: false,
  });
  const [loadingLedger, setLoadingLedger] = useState(false);

  // Modals
  const [baseLimitModal, setBaseLimitModal] = useState(null); // { wallet, baseLimit, reason }
  const [adjustModal, setAdjustModal] = useState(null); // { wallet, direction, amount, reason, confirmStep, key }
  const [historyModal, setHistoryModal] = useState(null); // { wallet, transactions, loading }
  const [requestModal, setRequestModal] = useState(null); // { req, mode: 'approve'|'reject', approvedAmount, remarks }
  const [returnModal, setReturnModal] = useState(null); // { req, mode: 'view'|'approve'|'reject', approvedAmount, remarks }
  const [reverseModal, setReverseModal] = useState(null); // { txn, reason }
  const [submitting, setSubmitting] = useState(false);

  const loadSummary = useCallback(async () => {
    try {
      setLoadingSummary(true);
      const res = await api.get('/expense/petty-cash/admin/summary');
      setSummary(res.data.data);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load petty cash summary');
    } finally {
      setLoadingSummary(false);
    }
  }, []);

  const loadWallets = useCallback(async (page = 1) => {
    try {
      setLoadingWallets(true);
      const res = await api.get('/expense/petty-cash/admin/wallets', {
        params: { page, limit: 20, search: walletSearch, balance: balanceFilter, enabled: enabledFilter },
      });
      setWallets(res.data.data || []);
      setWalletPage(res.data.pagination || { page: 1, pages: 1, total: 0 });
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load wallets');
    } finally {
      setLoadingWallets(false);
    }
  }, [walletSearch, balanceFilter, enabledFilter]);

  const loadRequests = useCallback(async () => {
    try {
      setLoadingRequests(true);
      const res = await api.get('/expense/petty-cash/admin/requests', { params: { status: requestStatus, limit: 100 } });
      setRequests(res.data.data || []);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load enhancement requests');
    } finally {
      setLoadingRequests(false);
    }
  }, [requestStatus]);

  const loadReturnRequests = useCallback(async () => {
    try {
      setLoadingReturnRequests(true);
      const res = await api.get('/expense/petty-cash/admin/return-requests', {
        params: { status: returnRequestStatus, search: returnSearch || undefined, limit: 100 },
      });
      setReturnRequests(res.data.data || []);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load return requests');
    } finally {
      setLoadingReturnRequests(false);
    }
  }, [returnRequestStatus, returnSearch]);

  const loadLedger = useCallback(async (page = 1) => {
    try {
      setLoadingLedger(true);
      const params = {
        page,
        limit: 25,
        type: ledgerFilter.type,
        source: ledgerFilter.source,
        category: ledgerFilter.category !== 'ALL' ? ledgerFilter.category : undefined,
        from: ledgerFilter.from || undefined,
        to: ledgerFilter.to || undefined,
        employeeId: ledgerFilter.employeeId || undefined,
        claimLinked: ledgerFilter.claimLinked ? 'true' : undefined,
      };
      const res = await api.get('/expense/petty-cash/admin/reports', { params });
      setLedger(res.data.data || []);
      setLedgerTotals(res.data.totals || { credit: 0, debit: 0, net: 0, bySource: [] });
      setLedgerPage(res.data.pagination || { page: 1, pages: 1, total: 0 });
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load ledger');
    } finally {
      setLoadingLedger(false);
    }
  }, [ledgerFilter]);

  useEffect(() => { loadSummary(); }, [loadSummary]);
  useEffect(() => { if (tab === 'wallets') loadWallets(1); }, [tab, loadWallets]);
  useEffect(() => { if (tab === 'requests') loadRequests(); }, [tab, loadRequests]);
  useEffect(() => { if (tab === 'return_requests') loadReturnRequests(); }, [tab, loadReturnRequests]);
  useEffect(() => { if (tab === 'ledger') loadLedger(1); }, [tab, loadLedger]);

  const openEmployeeHistory = async (w) => {
    setHistoryModal({ wallet: w, transactions: [], loading: true });
    try {
      const res = await api.get(`/expense/petty-cash/admin/wallets/${w.employee?._id || w.employeeId}`, { params: { limit: 50 } });
      setHistoryModal({
        wallet: res.data.data.wallet,
        transactions: res.data.data.transactions || [],
        loading: false,
      });
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load employee history');
      setHistoryModal(null);
    }
  };

  const handleToggleEnabled = async (w) => {
    const next = !w.enabled;
    const empName = w.employee?.name || 'employee';
    if (!window.confirm(`${next ? 'Enable' : 'Disable'} petty cash wallet deductions for ${empName}?`)) return;
    try {
      await api.post(`/expense/petty-cash/admin/wallets/${w.employee?._id || w.employeeId}/enable`, { enabled: next });
      toast.success(`Petty cash ${next ? 'enabled' : 'disabled'} for ${empName}`);
      loadWallets(walletPage.page);
      loadSummary();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update employee status');
    }
  };

  const submitBaseLimit = async () => {
    if (!baseLimitModal) return;
    const amt = Number(baseLimitModal.baseLimit);
    if (!Number.isFinite(amt) || amt < 0) return toast.error('Enter a valid Base Limit (0 or greater)');
    try {
      setSubmitting(true);
      const empId = baseLimitModal.wallet.employee?._id || baseLimitModal.wallet.employeeId;
      await api.post(`/expense/petty-cash/admin/wallets/${empId}/base-limit`, {
        baseLimit: amt,
        reason: (baseLimitModal.reason || '').trim(),
      });
      toast.success(`Base Limit updated to ${fmtINR(amt)} for ${baseLimitModal.wallet.employee?.name || 'employee'}`);
      setBaseLimitModal(null);
      loadWallets(walletPage.page);
      loadSummary();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update Base Limit');
    } finally {
      setSubmitting(false);
    }
  };

  const submitAdjust = async () => {
    if (!adjustModal) return;
    const amt = Number(adjustModal.amount);
    if (!Number.isFinite(amt) || amt <= 0) return toast.error('Enter a valid amount');
    if (!adjustModal.reason || adjustModal.reason.trim().length < 5) return toast.error('Enter a reason (at least 5 characters)');
    if (!adjustModal.confirmStep) {
      setAdjustModal({ ...adjustModal, confirmStep: true });
      return;
    }
    try {
      setSubmitting(true);
      const empId = adjustModal.wallet.employee?._id || adjustModal.wallet.employeeId;
      await api.post(`/expense/petty-cash/admin/wallets/${empId}/adjust`, {
        category: 'OTHER_ADJUSTMENT',
        direction: adjustModal.direction,
        amount: amt,
        reason: adjustModal.reason,
        idempotencyKey: adjustModal.key,
      });
      toast.success('Wallet balance adjustment recorded (Base Limit unchanged)');
      setAdjustModal(null);
      loadWallets(walletPage.page);
      loadSummary();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Adjustment failed');
    } finally {
      setSubmitting(false);
    }
  };

  const submitRequestAction = async () => {
    if (!requestModal) return;
    const { req, mode, approvedAmount, remarks } = requestModal;
    try {
      setSubmitting(true);
      if (mode === 'approve') {
        const amt = Number(approvedAmount);
        if (!Number.isFinite(amt) || amt <= 0) return toast.error('Enter a valid amount to add to wallet');
        await api.post(`/expense/petty-cash/admin/requests/${req._id}/approve`, {
          approvedAmount: amt,
          remarks,
        });
        toast.success(`Approved enhancement: +${fmtINR(amt)} added to ${req.employee?.name || 'employee'}'s Petty Cash Balance (Base Limit unchanged)`);
      } else if (mode === 'reject') {
        if (!remarks || remarks.trim().length < 3) return toast.error('Enter a rejection reason');
        await api.post(`/expense/petty-cash/admin/requests/${req._id}/reject`, { remarks });
        toast.success('Enhancement request rejected');
      }
      setRequestModal(null);
      loadRequests();
      loadWallets(walletPage.page);
      loadSummary();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Action failed');
    } finally {
      setSubmitting(false);
    }
  };

  const submitReturnRequestAction = async () => {
    if (!returnModal) return;
    const { req, mode, approvedAmount, remarks } = returnModal;
    try {
      setSubmitting(true);
      if (mode === 'approve') {
        const amt = Number(approvedAmount);
        if (!Number.isFinite(amt) || amt <= 0) return toast.error('Enter a valid accepted return amount greater than zero');
        if (!remarks || remarks.trim().length < 3) {
          return toast.error('Enter a remark for approving the return request (at least 3 characters)');
        }
        await api.post(`/expense/petty-cash/admin/return-requests/${req._id}/approve`, {
          approvedAmount: amt,
          remarks: remarks.trim(),
        });
        toast.success(
          `Return of ${fmtINR(amt)} approved. Petty Cash Balance reduced by ${fmtINR(amt)} (Base Limit unchanged).`
        );
      } else if (mode === 'reject') {
        if (!remarks || remarks.trim().length < 3) return toast.error('Enter a rejection remark (at least 3 characters)');
        await api.post(`/expense/petty-cash/admin/return-requests/${req._id}/reject`, { remarks: remarks.trim() });
        toast.success('Return request rejected');
      }
      setReturnModal(null);
      loadReturnRequests();
      loadWallets(walletPage.page);
      loadSummary();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Return request action failed');
    } finally {
      setSubmitting(false);
    }
  };

  const submitReverse = async () => {
    if (!reverseModal) return;
    if (!reverseModal.reason || reverseModal.reason.trim().length < 5) return toast.error('Enter a reason (at least 5 characters)');
    try {
      setSubmitting(true);
      await api.post(`/expense/petty-cash/admin/transactions/${reverseModal.txn._id}/reverse`, { reason: reverseModal.reason });
      toast.success('Transaction reversed');
      setReverseModal(null);
      loadLedger(ledgerPage.page);
      loadSummary();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Reversal failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleExportCSV = async () => {
    try {
      const res = await api.get('/expense/petty-cash/admin/reports/export', {
        params: {
          type: ledgerFilter.type,
          source: ledgerFilter.source,
          category: ledgerFilter.category !== 'ALL' ? ledgerFilter.category : undefined,
          from: ledgerFilter.from || undefined,
          to: ledgerFilter.to || undefined,
          employeeId: ledgerFilter.employeeId || undefined,
          claimLinked: ledgerFilter.claimLinked ? 'true' : undefined,
        },
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'text/csv;charset=utf-8;' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `petty-cash-ledger-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
      toast.success('Wallet ledger exported');
    } catch {
      toast.error('Failed to export CSV');
    }
  };

  return (
    <div className="space-y-5 animate-fade-up">
      {/* Header */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 bg-white p-5 rounded-3xl border border-slate-200 shadow-xs">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Wallet className="text-indigo-600" size={24} />
            Petty Cash Wallet & Base Limit Management
          </h1>
          <p className="text-xs font-bold text-slate-400 mt-0.5">
            Authorized Base Limits, actual petty cash balances, employee enhancement requests, return requests & auditable ledger
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => {
              loadSummary();
              if (tab === 'wallets') loadWallets(walletPage.page);
              if (tab === 'requests') loadRequests();
              if (tab === 'return_requests') loadReturnRequests();
              if (tab === 'ledger') loadLedger(ledgerPage.page);
            }}
            className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 transition-all cursor-pointer"
            title="Refresh"
          >
            <RefreshCw size={15} className={loadingSummary ? 'animate-spin text-indigo-600' : ''} />
          </button>
          <button
            onClick={() => navigate('/expense-dashboard')}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs transition-all cursor-pointer"
          >
            <ArrowLeft size={14} />
            <span>Expense Dashboard</span>
          </button>
          <button
            onClick={() => navigate('/expense-reports')}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-extrabold text-xs shadow-sm transition-all cursor-pointer"
          >
            <span>Expense Claims Report</span>
          </button>
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
        <StatCard
          title="Total Base Limit"
          value={loadingSummary ? '…' : fmtINR(summary?.totalBaseLimit)}
          sub={`Allocations: ${fmtINR(summary?.totalAllocation)} · Returns: ${fmtINR(summary?.totalReturn)}`}
          icon={<ShieldCheck size={20} />}
          tone="teal"
        />
        <StatCard
          title="Net Petty Cash Balance"
          value={loadingSummary ? '…' : fmtINR(summary?.totalBalance)}
          sub={`${summary?.enabledWallets || 0} of ${summary?.wallets || 0} enabled`}
          icon={<Wallet size={20} />}
          tone="indigo"
        />
        <StatCard
          title="Positive Balances"
          value={loadingSummary ? '…' : fmtINR(summary?.totalPositive)}
          sub={`Total Credits: ${fmtINR(summary?.totalCredit)}`}
          icon={<TrendingUp size={20} />}
          tone="emerald"
        />
        <StatCard
          title="Negative Balances"
          value={loadingSummary ? '…' : fmtINR(summary?.totalNegative)}
          sub={`${summary?.negativeWallets || 0} negative · Debits: ${fmtINR(summary?.totalDebit)}`}
          icon={<TrendingDown size={20} />}
          tone="rose"
        />
        <StatCard
          title="Pending Requests"
          value={loadingSummary ? '…' : `${(summary?.pendingRequests || 0) + (summary?.pendingReturnRequests || 0)}`}
          sub={`Enhance: ${summary?.pendingRequests || 0} · Return: ${summary?.pendingReturnRequests || 0}`}
          icon={<AlertTriangle size={20} />}
          tone="amber"
        />
      </div>

      {/* Navigation Tabs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 bg-white p-2 rounded-2xl border border-slate-200 shadow-xs">
        {[
          {
            id: 'wallets',
            label: 'Employee Wallets',
            badge: summary?.wallets ? String(summary.wallets) : null,
            badgeTone: 'slate',
            icon: <Wallet size={15} />,
          },
          {
            id: 'requests',
            label: 'Enhancement Requests',
            badge: summary?.pendingRequests ? String(summary.pendingRequests) : null,
            badgeTone: 'amber',
            icon: <ArrowUpRight size={15} />,
          },
          {
            id: 'return_requests',
            label: 'Return Requests',
            badge: summary?.pendingReturnRequests ? String(summary.pendingReturnRequests) : null,
            badgeTone: 'rose',
            icon: <CornerUpLeft size={15} />,
          },
          {
            id: 'ledger',
            label: 'Ledger & Reports',
            badge: null,
            badgeTone: 'slate',
            icon: <History size={15} />,
          },
        ].map((t) => {
          const isActive = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${isActive
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
            >
              {t.icon}
              <span className="truncate">{t.label}</span>
              {t.badge && (
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold leading-none ${isActive
                      ? 'bg-white/20 text-white'
                      : t.badgeTone === 'amber'
                        ? 'bg-amber-100 text-amber-700'
                        : t.badgeTone === 'rose'
                          ? 'bg-rose-100 text-rose-700'
                          : 'bg-slate-100 text-slate-600'
                    }`}
                >
                  {t.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* TAB 1: EMPLOYEE WALLETS */}
      {tab === 'wallets' && (
        <div className="bg-white rounded-3xl border border-slate-200 p-5 space-y-4 shadow-xs">
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={walletSearch}
                onChange={(e) => setWalletSearch(e.target.value)}
                placeholder="Search employee name, ID or department…"
                className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={balanceFilter}
                onChange={(e) => setBalanceFilter(e.target.value)}
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700"
              >
                <option value="">All Balances</option>
                <option value="negative">Negative Balance (&lt; ₹0)</option>
                <option value="positive">Positive Balance (&gt; ₹0)</option>
                <option value="zero">Zero Balance (₹0)</option>
              </select>
              <select
                value={enabledFilter}
                onChange={(e) => setEnabledFilter(e.target.value)}
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700"
              >
                <option value="">All Employees</option>
                <option value="true">Petty Cash Enabled</option>
                <option value="false">Petty Cash Disabled</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/90 border-b border-slate-200 text-[11px] font-extrabold tracking-wider text-slate-500">
                  <th className="py-3 px-3.5 whitespace-nowrap">Employee</th>
                  <th className="py-3 px-3 whitespace-nowrap">Department</th>
                  <th className="py-3 px-3 text-center whitespace-nowrap">Wallet Status</th>
                  <th className="py-3 px-3 text-right whitespace-nowrap">Base Limit</th>
                  <th className="py-3 px-3 text-right whitespace-nowrap">Petty Cash Balance</th>
                  <th className="py-3 px-3 text-right whitespace-nowrap">Allocations</th>
                  <th className="py-3 px-3 text-right whitespace-nowrap">Returns</th>
                  <th className="py-3 px-3.5 text-right whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {loadingWallets ? (
                  <tr>
                    <td colSpan={8} className="py-10 text-center text-slate-400">
                      <Loader2 className="animate-spin inline mr-2" size={18} /> Loading employee wallets…
                    </td>
                  </tr>
                ) : wallets.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-10 text-center text-slate-400 font-bold">No employee wallets match the filter.</td>
                  </tr>
                ) : (
                  wallets.map((w) => (
                    <tr key={w._id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-3.5 whitespace-nowrap">
                        <div className="font-extrabold text-slate-900">{w.employee?.name || '—'}</div>
                        <div className="text-[11px] font-semibold text-slate-400">{w.employee?.employeeIdCode || '—'}</div>
                      </td>
                      <td className="py-3 px-3 font-semibold text-slate-600 whitespace-nowrap">
                        {w.employee?.department || '—'}
                      </td>
                      <td className="py-3 px-3 text-center whitespace-nowrap">
                        <button
                          onClick={() => handleToggleEnabled(w)}
                          className={`px-2.5 py-1 rounded-full text-[11px] font-extrabold cursor-pointer transition-all whitespace-nowrap ${w.enabled
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                              : 'bg-slate-100 text-slate-500 border border-slate-200 hover:bg-slate-200'
                            }`}
                          title="Click to toggle whether this employee's claims are deducted from petty cash"
                        >
                          {w.enabled ? 'ON (Active)' : 'OFF'}
                        </button>
                      </td>
                      <td className="py-3 px-3 text-right whitespace-nowrap">
                        <button
                          onClick={() =>
                            setBaseLimitModal({
                              wallet: w,
                              baseLimit: String(w.baseLimit ?? 0),
                              reason: '',
                            })
                          }
                          title="Click to update Base Limit (Accounts Admin / Super Admin)"
                          className="font-extrabold text-xs text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 px-2.5 py-1 rounded-lg cursor-pointer transition-all whitespace-nowrap"
                        >
                          {fmtINR(w.baseLimit)}
                        </button>
                      </td>
                      <td className="py-3 px-3 text-right whitespace-nowrap">
                        <span className={`font-extrabold text-sm ${w.negative ? 'text-rose-600' : 'text-slate-900'}`}>
                          {fmtINR(w.balance)}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right font-bold text-emerald-600 whitespace-nowrap">
                        +{fmtINR(w.totalAllocation ?? w.baseLimit)}
                      </td>
                      <td className="py-3 px-3 text-right font-bold text-rose-600 whitespace-nowrap">
                        -{fmtINR(w.totalReturn || 0)}
                      </td>
                      <td className="py-3 px-3.5 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            onClick={() =>
                              setBaseLimitModal({
                                wallet: w,
                                baseLimit: String(w.baseLimit ?? 0),
                                reason: '',
                              })
                            }
                            className="px-2.5 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-extrabold text-[11px] cursor-pointer whitespace-nowrap transition-colors"
                          >
                            Base Limit
                          </button>
                          <button
                            onClick={() =>
                              setAdjustModal({
                                wallet: w,
                                direction: 'CR',
                                amount: '',
                                reason: '',
                                confirmStep: false,
                                key: newKey('adj'),
                              })
                            }
                            className="px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg font-extrabold text-[11px] cursor-pointer whitespace-nowrap transition-colors"
                          >
                            Adjust
                          </button>
                          <button
                            onClick={() => openEmployeeHistory(w)}
                            className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-lg font-bold text-[11px] cursor-pointer whitespace-nowrap transition-colors"
                          >
                            Ledger
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {walletPage.pages > 1 && (
            <div className="flex items-center justify-between pt-2 text-xs font-bold text-slate-500">
              <span>Page {walletPage.page} of {walletPage.pages} ({walletPage.total} employees)</span>
              <div className="flex items-center gap-1.5">
                <button
                  disabled={walletPage.page <= 1}
                  onClick={() => loadWallets(walletPage.page - 1)}
                  className="p-1.5 rounded-lg border border-slate-200 disabled:opacity-40 cursor-pointer"
                >
                  <ChevronLeft size={14} />
                </button>
                <button
                  disabled={walletPage.page >= walletPage.pages}
                  onClick={() => loadWallets(walletPage.page + 1)}
                  className="p-1.5 rounded-lg border border-slate-200 disabled:opacity-40 cursor-pointer"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: ENHANCEMENT REQUESTS */}
      {tab === 'requests' && (
        <div className="bg-white rounded-3xl border border-slate-200 p-5 space-y-4 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {['ALL', 'PENDING', 'FULFILLED', 'REJECTED'].map((s) => (
                <button
                  key={s}
                  onClick={() => setRequestStatus(s)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-extrabold cursor-pointer transition-colors ${requestStatus === s ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                >
                  {s}
                </button>
              ))}
            </div>
            <p className="text-xs font-bold text-slate-400">
              Approving an enhancement adds to Petty Cash Balance (Base Limit remains unchanged).
            </p>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/90 border-b border-slate-200 text-[11px] font-extrabold tracking-wider text-slate-500">
                  <th className="py-3 px-3.5 whitespace-nowrap">Date</th>
                  <th className="py-3 px-3 whitespace-nowrap">Employee</th>
                  <th className="py-3 px-3 text-right whitespace-nowrap">Base Limit</th>
                  <th className="py-3 px-3 text-right whitespace-nowrap">Balance</th>
                  <th className="py-3 px-3 text-right whitespace-nowrap">Requested</th>
                  <th className="py-3 px-3 text-right whitespace-nowrap">Approved</th>
                  <th className="py-3 px-3">Reason & Remark</th>
                  <th className="py-3 px-3 text-center whitespace-nowrap">Status</th>
                  <th className="py-3 px-3.5 text-right whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {loadingRequests ? (
                  <tr><td colSpan={9} className="py-10 text-center text-slate-400"><Loader2 className="animate-spin inline mr-2" size={18} /> Loading…</td></tr>
                ) : requests.length === 0 ? (
                  <tr><td colSpan={9} className="py-10 text-center text-slate-400 font-bold">No enhancement requests in this status.</td></tr>
                ) : (
                  requests.map((r) => (
                    <tr key={r._id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-3.5 text-slate-500 font-semibold whitespace-nowrap">{fmtDate(r.createdAt)}</td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        <div className="font-extrabold text-slate-900">{r.employee?.name || '—'}</div>
                        <div className="text-[11px] text-slate-400 font-semibold">
                          {r.employee?.employeeIdCode || '—'}{r.employee?.department ? ` · ${r.employee.department}` : ''}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-right font-extrabold text-teal-700 whitespace-nowrap">
                        {fmtINR(r.walletBaseLimit)}
                      </td>
                      <td className={`py-3 px-3 text-right font-extrabold whitespace-nowrap ${r.walletBalance < 0 ? 'text-rose-600' : 'text-slate-700'}`}>
                        {fmtINR(r.walletBalance)}
                      </td>
                      <td className="py-3 px-3 text-right font-extrabold text-emerald-700 whitespace-nowrap">+{fmtINR(r.requestedAmount)}</td>
                      <td className="py-3 px-3 text-right font-bold text-emerald-700 whitespace-nowrap">{r.approvedAmount ? `+${fmtINR(r.approvedAmount)}` : '—'}</td>
                      <td className="py-3 px-3 min-w-[180px] max-w-[260px]">
                        <div className="font-semibold text-slate-800 break-words">{r.reason}</div>
                        {r.remarks && <div className="text-[11px] text-indigo-600 font-semibold mt-0.5 break-words">Accounts: {r.remarks}</div>}
                      </td>
                      <td className="py-3 px-3 text-center whitespace-nowrap">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold whitespace-nowrap ${r.status === 'FULFILLED'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : r.status === 'REJECTED'
                              ? 'bg-rose-50 text-rose-700 border border-rose-200'
                              : 'bg-amber-50 text-amber-700 border border-amber-200'
                          }`}>
                          {r.status}
                        </span>
                      </td>
                      <td className="py-3 px-3.5 text-right whitespace-nowrap">
                        {r.status === 'PENDING' ? (
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              onClick={() => setRequestModal({ req: r, mode: 'approve', approvedAmount: String(r.requestedAmount), remarks: '' })}
                              className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-extrabold text-[11px] cursor-pointer whitespace-nowrap transition-colors"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => setRequestModal({ req: r, mode: 'reject', approvedAmount: '', remarks: '' })}
                              className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg font-extrabold text-[11px] cursor-pointer whitespace-nowrap transition-colors"
                            >
                              Reject
                            </button>
                          </div>
                        ) : (
                          <span className="text-[11px] font-semibold text-slate-400">Reviewed</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: PETTY CASH RETURN REQUESTS */}
      {tab === 'return_requests' && (
        <div className="bg-white rounded-3xl border border-slate-200 p-5 space-y-4 shadow-xs">
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              {['ALL', 'PENDING', 'APPROVED', 'REJECTED'].map((s) => (
                <button
                  key={s}
                  onClick={() => setReturnRequestStatus(s)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-extrabold cursor-pointer transition-colors ${returnRequestStatus === s ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                >
                  {s}
                </button>
              ))}
            </div>
            <div className="relative w-full md:w-72">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={returnSearch}
                onChange={(e) => setReturnSearch(e.target.value)}
                placeholder="Search employee name, ID or department…"
                className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/90 border-b border-slate-200 text-[11px] font-extrabold tracking-wider text-slate-500">
                  <th className="py-3 px-3.5 whitespace-nowrap">Date</th>
                  <th className="py-3 px-3 whitespace-nowrap">Employee</th>
                  <th className="py-3 px-3 text-right whitespace-nowrap">Base Limit</th>
                  <th className="py-3 px-3 text-right whitespace-nowrap">Balance</th>
                  <th className="py-3 px-3 text-right whitespace-nowrap">Requested</th>
                  <th className="py-3 px-3 text-right whitespace-nowrap">Approved</th>
                  <th className="py-3 px-3">Remark & Proof</th>
                  <th className="py-3 px-3 text-center whitespace-nowrap">Status</th>
                  <th className="py-3 px-3.5 text-right whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {loadingReturnRequests ? (
                  <tr>
                    <td colSpan={9} className="py-10 text-center text-slate-400">
                      <Loader2 className="animate-spin inline mr-2" size={18} /> Loading return requests…
                    </td>
                  </tr>
                ) : returnRequests.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-10 text-center text-slate-400 font-bold">
                      No petty cash return requests found in this status.
                    </td>
                  </tr>
                ) : (
                  returnRequests.map((r) => {
                    const displayStatus = r.status === 'PROCESSED' ? 'APPROVED' : r.status;
                    return (
                      <tr key={r._id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-3.5 text-slate-500 font-semibold whitespace-nowrap">{fmtDate(r.createdAt)}</td>
                        <td className="py-3 px-3 whitespace-nowrap">
                          <div className="font-extrabold text-slate-900">{r.employee?.name || '—'}</div>
                          <div className="text-[11px] font-semibold text-slate-400">
                            {r.employee?.employeeIdCode || '—'}{r.employee?.department ? ` · ${r.employee.department}` : ''}
                          </div>
                        </td>
                        <td className="py-3 px-3 text-right font-extrabold text-teal-700 whitespace-nowrap">{fmtINR(r.walletBaseLimit)}</td>
                        <td className={`py-3 px-3 text-right font-extrabold whitespace-nowrap ${r.walletBalance < 0 ? 'text-rose-600' : 'text-slate-800'}`}>
                          {fmtINR(r.walletBalance)}
                        </td>
                        <td className="py-3 px-3 text-right font-extrabold text-rose-600 whitespace-nowrap">-{fmtINR(r.requestedAmount)}</td>
                        <td className="py-3 px-3 text-right font-bold text-rose-700 whitespace-nowrap">
                          {r.approvedAmount ? `-${fmtINR(r.approvedAmount)}` : '—'}
                        </td>
                        <td className="py-3 px-3 min-w-[180px] max-w-[260px]">
                          <div className="font-semibold text-slate-800 break-words">{r.remarks || r.employeeRemarks || r.reason}</div>
                          {Array.isArray(r.attachments) && r.attachments.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {r.attachments.map((att, idx) => {
                                const url = typeof att === 'string' ? att : att?.url;
                                if (!url) return null;
                                return (
                                  <a
                                    key={`${r._id}_att_${idx}`}
                                    href={url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-[10px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded hover:bg-indigo-100 whitespace-nowrap"
                                  >
                                    Proof #{idx + 1}
                                  </a>
                                );
                              })}
                            </div>
                          )}
                          {r.accountsRemarks && (
                            <div className="text-[11px] text-indigo-600 font-semibold mt-0.5 break-words">
                              Accounts: {r.accountsRemarks}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-3 text-center whitespace-nowrap">
                          <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold whitespace-nowrap ${displayStatus === 'APPROVED'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : displayStatus === 'REJECTED'
                                ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                : 'bg-amber-50 text-amber-700 border border-amber-200'
                            }`}>
                            {displayStatus}
                          </span>
                        </td>
                        <td className="py-3 px-3.5 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              onClick={() =>
                                setReturnModal({
                                  req: r,
                                  mode: 'view',
                                  approvedAmount: String(r.approvedAmount || r.requestedAmount),
                                  remarks: r.accountsRemarks || '',
                                })
                              }
                              className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-bold text-[11px] inline-flex items-center gap-1 cursor-pointer whitespace-nowrap transition-colors"
                            >
                              <Eye size={12} /> View
                            </button>
                            {displayStatus === 'PENDING' && (
                              <>
                                <button
                                  onClick={() =>
                                    setReturnModal({
                                      req: r,
                                      mode: 'approve',
                                      approvedAmount: String(r.requestedAmount),
                                      remarks: '',
                                    })
                                  }
                                  className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-extrabold text-[11px] cursor-pointer whitespace-nowrap transition-colors"
                                >
                                  Approve
                                </button>
                                <button
                                  onClick={() =>
                                    setReturnModal({
                                      req: r,
                                      mode: 'reject',
                                      approvedAmount: '',
                                      remarks: '',
                                    })
                                  }
                                  className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg font-extrabold text-[11px] cursor-pointer whitespace-nowrap transition-colors"
                                >
                                  Reject
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: LEDGER & REPORTS */}
      {tab === 'ledger' && (
        <div className="bg-white rounded-3xl border border-slate-200 p-5 space-y-4 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={ledgerFilter.category}
                onChange={(e) => setLedgerFilter({ ...ledgerFilter, category: e.target.value })}
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700"
              >
                <option value="ALL">All Categories</option>
                <option value="INITIAL_ALLOCATION">Initial Allocation</option>
                <option value="ALLOCATION_ENHANCEMENT">Enhancement (+Balance)</option>
                <option value="PETTY_CASH_RETURN">Petty Cash Return</option>
                <option value="EXPENSE_DEDUCTION">Expense Claim Deduction</option>
                <option value="CLAIM_SETTLEMENT">Claim Settlement</option>
                <option value="OTHER_ADJUSTMENT">Account Adjustment</option>
                <option value="REVERSAL">Reversal</option>
              </select>
              <select
                value={ledgerFilter.type}
                onChange={(e) => setLedgerFilter({ ...ledgerFilter, type: e.target.value })}
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700"
              >
                <option value="ALL">All Types</option>
                <option value="CREDIT">Credit</option>
                <option value="DEBIT">Debit</option>
                <option value="ADJUSTMENT">Adjustment</option>
                <option value="REVERSAL">Reversal</option>
              </select>
              <select
                value={ledgerFilter.source}
                onChange={(e) => setLedgerFilter({ ...ledgerFilter, source: e.target.value })}
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700"
              >
                <option value="ALL">All Sources</option>
                <option value="TOPUP">Initial Allocation</option>
                <option value="TOPUP_REQUEST">Enhancement Request Credit</option>
                <option value="PETTY_CASH_RETURN">Petty Cash Return</option>
                <option value="CLAIM_SUBMIT">Claim Submission Debit</option>
                <option value="CLAIM_PAYMENT">Claim Payment Credit</option>
                <option value="CLAIM_REJECT">Claim Rejection Reversal</option>
                <option value="MANUAL">Account Adjustment</option>
                <option value="REVERSAL">Admin Reversal</option>
              </select>
              <input
                type="date"
                value={ledgerFilter.from}
                onChange={(e) => setLedgerFilter({ ...ledgerFilter, from: e.target.value })}
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700"
              />
              <input
                type="date"
                value={ledgerFilter.to}
                onChange={(e) => setLedgerFilter({ ...ledgerFilter, to: e.target.value })}
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700"
              />
              <label className="flex items-center gap-1.5 text-xs font-bold text-slate-600 px-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={ledgerFilter.claimLinked}
                  onChange={(e) => setLedgerFilter({ ...ledgerFilter, claimLinked: e.target.checked })}
                />
                Claim-linked only
              </label>
            </div>
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-extrabold text-xs cursor-pointer whitespace-nowrap"
            >
              <Download size={14} /> Export CSV
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50 p-3.5 rounded-2xl border border-slate-200 text-xs">
            <div><span className="font-bold text-slate-500">Filtered Credits:</span> <span className="font-extrabold text-emerald-600 ml-1">{fmtINR(ledgerTotals.credit)}</span></div>
            <div><span className="font-bold text-slate-500">Filtered Debits:</span> <span className="font-extrabold text-rose-600 ml-1">{fmtINR(ledgerTotals.debit)}</span></div>
            <div><span className="font-bold text-slate-500">Filtered Net Change:</span> <span className="font-extrabold text-slate-900 ml-1">{fmtINR(ledgerTotals.net)}</span></div>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/90 border-b border-slate-200 text-[11px] font-extrabold tracking-wider text-slate-500">
                  <th className="py-3 px-3.5 whitespace-nowrap">Date</th>
                  <th className="py-3 px-3 whitespace-nowrap">Employee</th>
                  <th className="py-3 px-3 whitespace-nowrap">Category</th>
                  <th className="py-3 px-3 text-right whitespace-nowrap">Amount</th>
                  <th className="py-3 px-3 text-right whitespace-nowrap">Base Limit</th>
                  <th className="py-3 px-3 text-right whitespace-nowrap">Balance (Before → After)</th>
                  <th className="py-3 px-3">Description & Ref</th>
                  <th className="py-3 px-3 whitespace-nowrap">By</th>
                  {canReverse && <th className="py-3 px-3.5 text-right whitespace-nowrap">Action</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {loadingLedger ? (
                  <tr><td colSpan={canReverse ? 9 : 8} className="py-10 text-center text-slate-400"><Loader2 className="animate-spin inline mr-2" size={18} /> Loading ledger…</td></tr>
                ) : ledger.length === 0 ? (
                  <tr><td colSpan={canReverse ? 9 : 8} className="py-10 text-center text-slate-400 font-bold">No ledger transactions found.</td></tr>
                ) : (
                  ledger.map((t) => {
                    const catMeta = getLedgerCategoryBadge(t);
                    const hasBaseLimit = t.baseLimitBefore !== null && t.baseLimitBefore !== undefined;
                    return (
                      <tr key={t._id} className={`hover:bg-slate-50/80 transition-colors ${catMeta.rowCls}`}>
                        <td className="py-3 px-3.5 text-slate-500 font-semibold whitespace-nowrap">{fmtDate(t.createdAt)}</td>
                        <td className="py-3 px-3 whitespace-nowrap">
                          <div className="font-extrabold text-slate-900">{t.employee?.name || '—'}</div>
                          <div className="text-[11px] text-slate-400">{t.employee?.employeeIdCode || '—'}</div>
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-extrabold whitespace-nowrap ${catMeta.cls}`}>
                            {t.direction === 'CR' ? <ArrowDownLeft size={11} /> : <ArrowUpRight size={11} />}
                            {catMeta.label}
                          </span>
                          <div className="text-[10px] text-slate-400 font-bold mt-0.5">
                            {t.type} ({t.direction}) · {t.source}
                          </div>
                        </td>
                        <td className={`py-3 px-3 text-right font-extrabold whitespace-nowrap ${t.direction === 'CR' ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {t.direction === 'CR' ? '+' : '-'}{fmtINR(t.amount)}
                        </td>
                        <td className="py-3 px-3 text-right font-semibold whitespace-nowrap">
                          {hasBaseLimit ? (
                            <span className={catMeta.affectsBaseLimit ? (catMeta.tone === 'rose' ? 'text-rose-700 font-extrabold' : 'text-emerald-700 font-extrabold') : 'text-slate-500'}>
                              {Number(t.baseLimitBefore) === Number(t.baseLimitAfter)
                                ? fmtINR(t.baseLimitAfter)
                                : `${fmtINR(t.baseLimitBefore)} → ${fmtINR(t.baseLimitAfter)}`}
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-right font-semibold text-slate-600 whitespace-nowrap">
                          {fmtINR(t.balanceBefore)} → <span className={`font-extrabold ${t.balanceAfter < 0 ? 'text-rose-600' : 'text-slate-900'}`}>{fmtINR(t.balanceAfter)}</span>
                        </td>
                        <td className="py-3 px-3 min-w-[200px] max-w-[280px] text-slate-700 font-medium">
                          <div className="break-words">{t.description}</div>
                          {t.remarks && <div className="text-[11px] text-slate-400 break-words">Note: {t.remarks}</div>}
                          {(t.claimNumber || t.paymentReference) && (
                            <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                              {t.claimNumber && <span className="text-[10px] font-extrabold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">{t.claimNumber}</span>}
                              {t.paymentReference && <span className="text-[10px] font-semibold text-slate-500">Ref: {t.paymentReference}</span>}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-3 text-slate-500 font-semibold whitespace-nowrap">{t.performedByName || t.performedByRole || '—'}</td>
                        {canReverse && (
                          <td className="py-3 px-3.5 text-right whitespace-nowrap">
                            {!t.claimId && t.type !== 'REVERSAL' && !t.reversedBy ? (
                              <button
                                onClick={() => setReverseModal({ txn: t, reason: '' })}
                                className="px-2 py-1 bg-slate-100 hover:bg-rose-50 hover:text-rose-700 text-slate-600 rounded-lg font-bold text-[11px] inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                              >
                                <RotateCcw size={11} /> Reverse
                              </button>
                            ) : t.reversedBy ? (
                              <span className="text-[10px] font-bold text-slate-400">Reversed</span>
                            ) : null}
                          </td>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {ledgerPage.pages > 1 && (
            <div className="flex items-center justify-between pt-2 text-xs font-bold text-slate-500">
              <span>Page {ledgerPage.page} of {ledgerPage.pages} ({ledgerPage.total} entries)</span>
              <div className="flex items-center gap-1.5">
                <button disabled={ledgerPage.page <= 1} onClick={() => loadLedger(ledgerPage.page - 1)} className="p-1.5 rounded-lg border border-slate-200 disabled:opacity-40 cursor-pointer"><ChevronLeft size={14} /></button>
                <button disabled={ledgerPage.page >= ledgerPage.pages} onClick={() => loadLedger(ledgerPage.page + 1)} className="p-1.5 rounded-lg border border-slate-200 disabled:opacity-40 cursor-pointer"><ChevronRight size={14} /></button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* MODAL: UPDATE BASE LIMIT (Accounts Admin & Super Admin only) */}
      {baseLimitModal && (
        <div className="fixed inset-0 z-[200] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl text-xs">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-extrabold text-slate-900">Update Base Limit</h3>
              <button onClick={() => setBaseLimitModal(null)} className="text-slate-400 hover:text-slate-600 cursor-pointer"><X size={18} /></button>
            </div>
            <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 space-y-1">
              <div className="font-extrabold text-slate-900">{baseLimitModal.wallet.employee?.name} ({baseLimitModal.wallet.employee?.employeeIdCode})</div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-bold">Current Base Limit:</span>
                <span className="font-extrabold text-teal-700">{fmtINR(baseLimitModal.wallet.baseLimit)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-bold">Current Petty Cash Balance:</span>
                <span className="font-extrabold text-slate-900">{fmtINR(baseLimitModal.wallet.balance)} (Unchanged)</span>
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <label className="font-bold text-slate-600 block mb-1">New Base Limit (₹) *</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={baseLimitModal.baseLimit}
                  onChange={(e) => setBaseLimitModal({ ...baseLimitModal, baseLimit: e.target.value })}
                  className="w-full px-3.5 py-2 border border-slate-200 rounded-xl font-extrabold text-sm"
                  placeholder="e.g. 5000"
                />
              </div>
              <div>
                <label className="font-bold text-slate-600 block mb-1">Remark (optional)</label>
                <input
                  type="text"
                  value={baseLimitModal.reason}
                  onChange={(e) => setBaseLimitModal({ ...baseLimitModal, reason: e.target.value })}
                  className="w-full px-3.5 py-2 border border-slate-200 rounded-xl font-semibold"
                  placeholder="Authorized by Accounts Admin / Super Admin"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setBaseLimitModal(null)} className="px-4 py-2 bg-slate-100 rounded-xl font-bold text-slate-600 cursor-pointer">Cancel</button>
              <button disabled={submitting} onClick={submitBaseLimit} className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-extrabold cursor-pointer">
                {submitting ? 'Updating…' : 'Save Base Limit'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: AUTHORIZED ACCOUNT ADJUSTMENT (Balance Only — Base Limit Unchanged) */}
      {adjustModal && (
        <div className="fixed inset-0 z-[200] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl text-xs">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-extrabold text-slate-900">Account Balance Adjustment</h3>
              <button onClick={() => setAdjustModal(null)} className="text-slate-400 hover:text-slate-600 cursor-pointer"><X size={18} /></button>
            </div>
            <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 space-y-1">
              <div className="font-extrabold text-slate-900">{adjustModal.wallet.employee?.name} ({adjustModal.wallet.employee?.employeeIdCode})</div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-bold">Current Base Limit:</span>
                <span className="font-extrabold text-teal-700">{fmtINR(adjustModal.wallet.baseLimit)} (Unchanged)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-bold">Current Petty Cash Balance:</span>
                <span className="font-extrabold text-slate-900">{fmtINR(adjustModal.wallet.balance)}</span>
              </div>
            </div>
            {!adjustModal.confirmStep ? (
              <div className="space-y-3">
                <div className="flex gap-2">
                  {['CR', 'DR'].map((d) => (
                    <button
                      key={d}
                      onClick={() => setAdjustModal({ ...adjustModal, direction: d })}
                      className={`flex-1 py-2 rounded-xl font-extrabold cursor-pointer ${adjustModal.direction === d ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'
                        }`}
                    >
                      {d === 'CR' ? 'Credit (+ Balance)' : 'Debit (- Balance)'}
                    </button>
                  ))}
                </div>

                <div>
                  <label className="font-bold text-slate-600 block mb-1">Amount (₹) *</label>
                  <input
                    type="number"
                    min="1"
                    step="0.01"
                    value={adjustModal.amount}
                    onChange={(e) => setAdjustModal({ ...adjustModal, amount: e.target.value })}
                    className="w-full px-3.5 py-2 border border-slate-200 rounded-xl font-extrabold text-sm"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-600 block mb-1">Reason for Adjustment *</label>
                  <textarea
                    rows={2}
                    value={adjustModal.reason}
                    onChange={(e) => setAdjustModal({ ...adjustModal, reason: e.target.value })}
                    className="w-full px-3.5 py-2 border border-slate-200 rounded-xl font-semibold"
                    placeholder="Explain why this adjustment is needed"
                  />
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 space-y-1.5">
                <div className="font-extrabold text-amber-900">
                  Confirm {adjustModal.direction === 'CR' ? 'Credit' : 'Debit'} Balance Adjustment
                </div>
                <div>Amount: <span className="font-extrabold">{fmtINR(adjustModal.amount)}</span> — {adjustModal.reason}</div>
                <div>
                  Base Limit: <span className="font-extrabold text-teal-700">{fmtINR(adjustModal.wallet.baseLimit || 0)} (Unchanged)</span>
                </div>
                <div>
                  Balance: <span className="font-extrabold">{fmtINR(adjustModal.wallet.balance)}</span> →{' '}
                  <span className="font-extrabold text-indigo-700">
                    {fmtINR(
                      (adjustModal.wallet.balance || 0) +
                      (adjustModal.direction === 'CR' ? Number(adjustModal.amount) : -Number(adjustModal.amount))
                    )}
                  </span>
                </div>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => (adjustModal.confirmStep ? setAdjustModal({ ...adjustModal, confirmStep: false }) : setAdjustModal(null))}
                className="px-4 py-2 bg-slate-100 rounded-xl font-bold text-slate-600 cursor-pointer"
              >
                {adjustModal.confirmStep ? 'Back' : 'Cancel'}
              </button>
              <button disabled={submitting} onClick={submitAdjust} className="px-4 py-2 bg-indigo-600 text-white rounded-xl font-extrabold cursor-pointer">
                {submitting ? 'Saving…' : adjustModal.confirmStep ? 'Confirm Adjustment' : 'Review'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ENHANCEMENT REQUEST REVIEW / FULFIL */}
      {requestModal && (
        <div className="fixed inset-0 z-[200] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl text-xs">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-extrabold text-slate-900">
                {requestModal.mode === 'approve' ? 'Approve Enhancement Request' : 'Reject Enhancement Request'}
              </h3>
              <button onClick={() => setRequestModal(null)} className="text-slate-400 hover:text-slate-600 cursor-pointer"><X size={18} /></button>
            </div>
            <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 space-y-1">
              <div className="font-extrabold text-slate-900">{requestModal.req.employee?.name} ({requestModal.req.employee?.employeeIdCode})</div>
              <div>Requested: <span className="font-extrabold text-emerald-700">+{fmtINR(requestModal.req.requestedAmount)}</span></div>
              <div>Current Base Limit: <span className="font-extrabold text-teal-700">{fmtINR(requestModal.req.walletBaseLimit)}</span> · Current Balance: <span className="font-extrabold">{fmtINR(requestModal.req.walletBalance)}</span></div>
              <div className="text-slate-600">Reason: {requestModal.req.reason}</div>
              {requestModal.mode === 'approve' && Number(requestModal.approvedAmount) > 0 && (
                <div className="pt-1 border-t border-slate-200 space-y-1">
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-bold">Base Limit After Enhancement:</span>
                    <span className="font-extrabold text-teal-700">{fmtINR(requestModal.req.walletBaseLimit || 0)} (Unchanged)</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-bold">New Balance After Enhancement:</span>
                    <span className="font-extrabold text-emerald-600">{fmtINR((requestModal.req.walletBalance || 0) + Number(requestModal.approvedAmount))}</span>
                  </div>
                </div>
              )}
            </div>
            {requestModal.mode === 'approve' && (
              <div>
                <label className="font-bold text-slate-600 block mb-1">Approved Enhancement Amount (₹) *</label>
                <input
                  type="number"
                  min="1"
                  step="0.01"
                  value={requestModal.approvedAmount}
                  onChange={(e) => setRequestModal({ ...requestModal, approvedAmount: e.target.value })}
                  className="w-full px-3.5 py-2 border border-slate-200 rounded-xl font-extrabold text-sm"
                />
              </div>
            )}

            <div>
              <label className="font-bold text-slate-600 block mb-1">Remarks {requestModal.mode === 'reject' ? '*' : '(optional)'}</label>
              <textarea
                rows={2}
                value={requestModal.remarks}
                onChange={(e) => setRequestModal({ ...requestModal, remarks: e.target.value })}
                className="w-full px-3.5 py-2 border border-slate-200 rounded-xl font-semibold"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setRequestModal(null)} className="px-4 py-2 bg-slate-100 rounded-xl font-bold text-slate-600 cursor-pointer">Cancel</button>
              <button
                disabled={submitting}
                onClick={submitRequestAction}
                className={`px-4 py-2 text-white rounded-xl font-extrabold cursor-pointer ${requestModal.mode === 'reject' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-indigo-600 hover:bg-indigo-700'
                  }`}
              >
                {submitting ? 'Processing…' : requestModal.mode === 'reject' ? 'Confirm Reject' : 'Approve & Credit'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: RETURN REQUEST DETAILS / APPROVE / REJECT */}
      {returnModal && (
        <div className="fixed inset-0 z-[200] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 space-y-4 shadow-2xl text-xs">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-extrabold text-slate-900">
                {returnModal.mode === 'view'
                  ? 'Petty Cash Return Request Details'
                  : returnModal.mode === 'reject'
                    ? 'Reject Petty Cash Return Request'
                    : 'Approve Petty Cash Return Request'}
              </h3>
              <button onClick={() => setReturnModal(null)} className="text-slate-400 hover:text-slate-600 cursor-pointer"><X size={18} /></button>
            </div>

            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2">
              <div className="flex justify-between items-center">
                <div>
                  <div className="font-extrabold text-slate-900 text-sm">{returnModal.req.employee?.name}</div>
                  <div className="text-slate-500 font-semibold">
                    ID: {returnModal.req.employee?.employeeIdCode || '—'} · Dept: {returnModal.req.employee?.department || '—'}
                  </div>
                </div>
                {(() => {
                  const st = returnModal.req.status === 'PROCESSED' ? 'APPROVED' : returnModal.req.status;
                  return (
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold ${st === 'APPROVED'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : st === 'REJECTED'
                          ? 'bg-rose-50 text-rose-700 border border-rose-200'
                          : 'bg-amber-50 text-amber-700 border border-amber-200'
                      }`}>
                      {st}
                    </span>
                  );
                })()}
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200">
                <div className="bg-white p-2.5 rounded-xl border border-slate-200">
                  <div className="text-[10px] font-bold text-slate-400">Current Base Limit</div>
                  <div className="text-sm font-extrabold text-teal-700">{fmtINR(returnModal.req.walletBaseLimit)}</div>
                </div>
                <div className="bg-white p-2.5 rounded-xl border border-slate-200">
                  <div className="text-[10px] font-bold text-slate-400">Current Petty Cash Balance</div>
                  <div className="text-sm font-extrabold text-slate-900">{fmtINR(returnModal.req.walletBalance)}</div>
                </div>
              </div>

              <div className="pt-1 space-y-1">
                <div className="flex justify-between">
                  <span className="font-bold text-slate-500">Requested Return Amount:</span>
                  <span className="font-extrabold text-rose-600">-{fmtINR(returnModal.req.requestedAmount)}</span>
                </div>
                {returnModal.req.approvedAmount > 0 && (
                  <div className="flex justify-between">
                    <span className="font-bold text-slate-500">Approved Return Amount:</span>
                    <span className="font-extrabold text-rose-700">-{fmtINR(returnModal.req.approvedAmount)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="font-bold text-slate-500">Submitted On:</span>
                  <span className="font-semibold text-slate-700">{fmtDate(returnModal.req.createdAt)}</span>
                </div>
                <div>
                  <span className="font-bold text-slate-500">Employee Remark: </span>
                  <span className="font-semibold text-slate-800">{returnModal.req.remarks || returnModal.req.employeeRemarks || returnModal.req.reason}</span>
                </div>
                {returnModal.req.accountsRemarks && returnModal.mode === 'view' && (
                  <div>
                    <span className="font-bold text-slate-500">Accounts Remark: </span>
                    <span className="font-semibold text-indigo-700">{returnModal.req.accountsRemarks}</span>
                  </div>
                )}
                {Array.isArray(returnModal.req.attachments) && returnModal.req.attachments.length > 0 && (
                  <div className="pt-1">
                    <div className="font-bold text-slate-500 mb-1">Uploaded Proof Photos:</div>
                    <div className="flex flex-wrap gap-2">
                      {returnModal.req.attachments.map((att, idx) => {
                        const url = typeof att === 'string' ? att : att?.url;
                        if (!url) return null;
                        return (
                          <a
                            key={`modal_att_${idx}`}
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block w-16 h-16 rounded-lg overflow-hidden border border-slate-200 hover:border-indigo-500"
                          >
                            <img src={url} alt={`Proof ${idx + 1}`} className="w-full h-full object-cover" />
                          </a>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {returnModal.mode === 'approve' && Number(returnModal.approvedAmount) > 0 && (
                <div className="pt-2 border-t border-slate-200 space-y-1">
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-bold">Base Limit After Return:</span>
                    <span className="font-extrabold text-teal-700">
                      {fmtINR(returnModal.req.walletBaseLimit || 0)} (Unchanged)
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-bold">New Balance After Return:</span>
                    <span className="font-extrabold text-rose-700">
                      {fmtINR((returnModal.req.walletBalance || 0) - Number(returnModal.approvedAmount))}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {returnModal.mode !== 'view' && (
              <div className="space-y-3">
                {returnModal.mode === 'approve' && (
                  <div>
                    <label className="font-bold text-slate-600 block mb-1">
                      Return Amount Accepted (₹) * (Requested: {fmtINR(returnModal.req.requestedAmount)})
                    </label>
                    <input
                      type="number"
                      min="1"
                      step="0.01"
                      value={returnModal.approvedAmount}
                      onChange={(e) => setReturnModal({ ...returnModal, approvedAmount: e.target.value })}
                      className="w-full px-3.5 py-2 border border-slate-200 rounded-xl font-extrabold text-sm"
                    />
                  </div>
                )}

                <div>
                  <label className="font-bold text-slate-600 block mb-1">
                    Accounts Remark *
                  </label>
                  <textarea
                    rows={2}
                    value={returnModal.remarks}
                    onChange={(e) => setReturnModal({ ...returnModal, remarks: e.target.value })}
                    className="w-full px-3.5 py-2 border border-slate-200 rounded-xl font-semibold"
                    placeholder={
                      returnModal.mode === 'reject'
                        ? 'Enter reason for rejecting return request'
                        : 'Enter remark for approving return request'
                    }
                  />
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setReturnModal(null)}
                className="px-4 py-2 bg-slate-100 rounded-xl font-bold text-slate-600 cursor-pointer"
              >
                {returnModal.mode === 'view' ? 'Close' : 'Cancel'}
              </button>
              {returnModal.mode !== 'view' && (
                <button
                  disabled={submitting}
                  onClick={submitReturnRequestAction}
                  className={`px-4 py-2 text-white rounded-xl font-extrabold cursor-pointer ${returnModal.mode === 'reject' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-emerald-600 hover:bg-emerald-700'
                    }`}
                >
                  {submitting
                    ? 'Saving…'
                    : returnModal.mode === 'reject'
                      ? 'Confirm Reject'
                      : 'Approve Return'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL: REVERSE TRANSACTION */}
      {reverseModal && (
        <div className="fixed inset-0 z-[200] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl text-xs">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-extrabold text-slate-900">Reverse Transaction</h3>
              <button onClick={() => setReverseModal(null)} className="text-slate-400 hover:text-slate-600 cursor-pointer"><X size={18} /></button>
            </div>
            <p className="text-slate-600 font-medium">
              Creates an audited reversal entry for <span className="font-extrabold">{fmtINR(reverseModal.txn.amount)}</span> ({reverseModal.txn.description}). Original transaction remains in the ledger.
            </p>
            <div>
              <label className="font-bold text-slate-600 block mb-1">Reason for Reversal *</label>
              <textarea
                rows={2}
                value={reverseModal.reason}
                onChange={(e) => setReverseModal({ ...reverseModal, reason: e.target.value })}
                className="w-full px-3.5 py-2 border border-slate-200 rounded-xl font-semibold"
                placeholder="Why is this transaction being reversed?"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setReverseModal(null)} className="px-4 py-2 bg-slate-100 rounded-xl font-bold text-slate-600 cursor-pointer">Cancel</button>
              <button disabled={submitting} onClick={submitReverse} className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-extrabold cursor-pointer">
                {submitting ? 'Reversing…' : 'Confirm Reversal'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: EMPLOYEE WALLET LEDGER */}
      {historyModal && (
        <div className="fixed inset-0 z-[200] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-4xl w-full max-h-[85vh] flex flex-col p-6 space-y-4 shadow-2xl text-xs">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-extrabold text-slate-900">
                  {historyModal.wallet.employee?.name} — Petty Cash Wallet Ledger
                </h3>
                <p className="text-slate-500 font-bold mt-0.5">
                  Base Limit: <span className="text-teal-700 font-extrabold">{fmtINR(historyModal.wallet.baseLimit)}</span>
                  {' · '}
                  Current Balance: <span className={historyModal.wallet.negative ? 'text-rose-600 font-extrabold' : 'text-slate-900 font-extrabold'}>{fmtINR(historyModal.wallet.balance)}</span>
                </p>
              </div>
              <button onClick={() => setHistoryModal(null)} className="text-slate-400 hover:text-slate-600 cursor-pointer"><X size={18} /></button>
            </div>
            <div className="overflow-y-auto flex-1">
              {historyModal.loading ? (
                <div className="py-10 text-center text-slate-400"><Loader2 className="animate-spin inline mr-2" size={18} /> Loading…</div>
              ) : historyModal.transactions.length === 0 ? (
                <div className="py-10 text-center text-slate-400 font-bold">No transactions yet.</div>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 text-[11px] font-extrabold text-slate-400">
                      <th className="py-2 px-2">Date</th>
                      <th className="py-2 px-2">Category</th>
                      <th className="py-2 px-2 text-right">Amount</th>
                      <th className="py-2 px-2 text-right">Base Limit After</th>
                      <th className="py-2 px-2 text-right">Balance After</th>
                      <th className="py-2 px-2">Description</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {historyModal.transactions.map((t) => {
                      const catMeta = getLedgerCategoryBadge(t);
                      return (
                        <tr key={t._id} className={catMeta.rowCls}>
                          <td className="py-2 px-2 text-slate-500 whitespace-nowrap">{fmtDate(t.createdAt)}</td>
                          <td className="py-2 px-2">
                            <span className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold ${catMeta.cls}`}>
                              {catMeta.label}
                            </span>
                          </td>
                          <td className={`py-2 px-2 text-right font-extrabold ${t.direction === 'CR' ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {t.direction === 'CR' ? '+' : '-'}{fmtINR(t.amount)}
                          </td>
                          <td className="py-2 px-2 text-right font-extrabold text-teal-700">
                            {t.baseLimitAfter !== null && t.baseLimitAfter !== undefined ? fmtINR(t.baseLimitAfter) : '—'}
                          </td>
                          <td className={`py-2 px-2 text-right font-extrabold ${t.balanceAfter < 0 ? 'text-rose-600' : 'text-slate-900'}`}>
                            {fmtINR(t.balanceAfter)}
                          </td>
                          <td className="py-2 px-2 text-slate-700">
                            {t.description}
                            {t.claimNumber && <span className="ml-1 font-bold text-indigo-600">({t.claimNumber})</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PettyCashManagement;
