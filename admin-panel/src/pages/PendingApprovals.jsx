import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowRight,
  ArrowRightLeft,
  Barcode,
  Briefcase,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  DollarSign,
  Eye,
  FileText,
  History,
  Layers,
  Mail,
  MapPin,
  Package,
  Phone,
  RefreshCw,
  Search,
  Trash2,
  UploadCloud,
  Users,
  X,
  XCircle,
  Zap,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import toast from 'react-hot-toast';
import { useSelector } from 'react-redux';
import { useLocation, useSearchParams } from 'react-router-dom';
import api from '../api/axios';
import SearchableDropdown from '../components/SearchableDropdown';

const formatAppliedDateTime = (dStr) => {
  if (!dStr) return 'N/A';
  try {
    const d = new Date(dStr);
    if (isNaN(d.getTime())) return String(dStr);
    return d.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    }) + ', ' + d.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  } catch (_) {
    return String(dStr);
  }
};

const formatExpenseDateDisplay = (dStr) => {
  if (!dStr) return 'N/A';
  try {
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

const PendingApprovals = () => {
  const { user } = useSelector((state) => state.auth);

  const userRole = (user?.role || '').toLowerCase();
  const userRoleCode = (user?.roleCode || '').toUpperCase();

  const isSuperAdmin = userRole === 'superadmin' || userRole === 'super_admin' || userRoleCode === 'TCSA1' || user?.scope === 'GLOBAL';
  const isCompanyAdmin = userRole === 'company_admin' || userRole === 'companyadmin' || userRole === 'admin' || userRoleCode === 'TCCA1';
  const isHRAdmin = userRole === 'hr' || userRole === 'hr_admin' || userRoleCode === 'TCSF2A' || userRoleCode === 'TCSFA' || userRoleCode === 'HR_ADMIN';
  const isStoreAdmin = userRole === 'store' || userRole === 'store_admin' || userRole === 'store_manager' || userRoleCode === 'TCST7A';
  const isAccountAdmin = userRole === 'accounts' || userRole === 'account_admin' || userRole === 'finance' || userRoleCode === 'TCACC1' || userRoleCode === 'TCACC2' || userRoleCode === 'ACCOUNT_ADMIN';

  // Active Category Tab - Store & Material tab is visible to Super Admin, Company Admin, and Store Admin
  const canViewStoreTab = isSuperAdmin || isCompanyAdmin || isStoreAdmin;
  const canViewExpenseTab = isSuperAdmin || isCompanyAdmin || isAccountAdmin;
  const canViewExpenseHistoryTab = isSuperAdmin || isCompanyAdmin || isAccountAdmin;
  const defaultTab = canViewStoreTab ? (isStoreAdmin ? 'store' : 'all') : canViewExpenseTab ? 'expense_claims' : 'all';
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const locationTab = location.state?.tab;
  const targetClaimId = location.state?.targetClaimId;
  const queryTab = searchParams.get('tab') || locationTab;

  const normalizeTab = (t) => {
    if (!t) return defaultTab;
    if (['hr', 'disburse_claims', 'account_claims', 'expense_claims', 'accounts'].includes(t)) {
      return canViewExpenseTab ? 'expense_claims' : 'all';
    }
    if (['expense_history', 'history'].includes(t)) {
      return canViewExpenseHistoryTab ? 'expense_history' : 'all';
    }
    if (['all', 'store', 'account_materials'].includes(t)) {
      return t;
    }
    return defaultTab;
  };

  const [activeTab, setActiveTab] = useState(() => normalizeTab(queryTab));

  useEffect(() => {
    if (queryTab) {
      setActiveTab(normalizeTab(queryTab));
    }
  }, [queryTab]);

  useEffect(() => {
    if (locationTab) {
      setActiveTab(normalizeTab(locationTab));
    }
  }, [locationTab]);

  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Super Admin Multi-Company State
  const [companies, setCompanies] = useState([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState(() => {
    return localStorage.getItem('selectedCompanyId') || 'ALL';
  });

  // Pending Items State
  const [materials, setMaterials] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [returns, setReturns] = useState([]);
  const [splits, setSplits] = useState([]);
  const [exchanges, setExchanges] = useState([]);
  const [merges, setMerges] = useState([]);
  const [accountsData, setAccountsData] = useState([]);
  const [expenseClaims, setExpenseClaims] = useState([]);
  const [expenseHistory, setExpenseHistory] = useState([]);
  const [closeRequests, setCloseRequests] = useState([]);

  // Advanced Filter States for Claims and Approvals
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [filterEmployee, setFilterEmployee] = useState('ALL');
  const [filterCity, setFilterCity] = useState('');
  const [filterExpenseType, setFilterExpenseType] = useState('ALL');
  const [filterFromDate, setFilterFromDate] = useState('');
  const [filterToDate, setFilterToDate] = useState('');
  const [allDbEmployees, setAllDbEmployees] = useState([]);
  const [allDbCities, setAllDbCities] = useState([]);

  // Load All Database Employees & Expense Cities on Mount for Filters
  useEffect(() => {
    const loadMasterFilters = async () => {
      try {
        const [empRes, cityRes] = await Promise.all([
          api.get('/employees?limit=1000').catch(() => api.get('/expense/employees').catch(() => null)),
          api.get('/expense/cities').catch(() => null),
        ]);

        if (empRes?.data) {
          const emps = Array.isArray(empRes.data.data)
            ? empRes.data.data
            : Array.isArray(empRes.data)
              ? empRes.data
              : [];
          emps.sort((a, b) => ((a.name || a.fullName || '').localeCompare(b.name || b.fullName || '')));
          setAllDbEmployees(emps);
        }

        if (cityRes?.data) {
          const cts = Array.isArray(cityRes.data.data)
            ? cityRes.data.data
            : Array.isArray(cityRes.data)
              ? cityRes.data
              : [];
          setAllDbCities(cts);
        }
      } catch (err) {
        console.error('Failed to load filter options:', err);
      }
    };

    loadMasterFilters();
  }, []);

  // Detail Modal State
  const [detailItem, setDetailItem] = useState(null);

  // Modal State for Actioning
  const [selectedItem, setSelectedItem] = useState(null);
  const [actionType, setActionType] = useState(''); // 'approve' | 'reject'
  const [adminNote, setAdminNote] = useState('');
  const [newSplitBarcode, setNewSplitBarcode] = useState('');
  const [splitPhase, setSplitPhase] = useState(1); // 1 = Accept & Tally Stock Journal, 2 = Scan Barcode & Split Remark
  const [processing, setProcessing] = useState(false);

  // Invoice Document Upload State (for close_request_accounts approval)
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceUrl, setInvoiceUrl] = useState('');
  const [invoiceFileName, setInvoiceFileName] = useState('');
  const [uploadingInvoice, setUploadingInvoice] = useState(false);

  const resetActionModal = () => {
    setSelectedItem(null);
    setActionType('');
    setAdminNote('');
    setNewSplitBarcode('');
    setSplitPhase(1);
    setInvoiceNumber('');
    setInvoiceUrl('');
    setInvoiceFileName('');
    setUploadingInvoice(false);
  };

  useEffect(() => {
    if (detailItem || selectedItem) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [detailItem, selectedItem]);

  const openActionModal = (item, type) => {
    setSelectedItem(item);
    setActionType(type);
    setAdminNote('');
    if (item?.type === 'split') {
      if (item.raw?.status === 'store_accepted') {
        setSplitPhase(2);
      } else {
        setSplitPhase(1);
      }
      const existingChildBc = item.raw?.newBarcode || item.raw?.childItems?.[0]?.barcode || item.raw?.tallyChildBarcodes?.[0] || '';
      setNewSplitBarcode(existingChildBc);
    } else {
      setNewSplitBarcode(item?.raw?.newBarcode || item?.raw?.childItems?.[0]?.barcode || '');
    }
    setInvoiceNumber(item?.raw?.invoiceNumber || '');
    setInvoiceUrl(item?.raw?.invoiceUrl || '');
    setInvoiceFileName(item?.raw?.invoiceNumber ? `Invoice-${item.raw.invoiceNumber}` : '');
    setUploadingInvoice(false);
  };

  const handleInvoiceUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      toast.error('File size exceeds 10MB limit.');
      return;
    }

    setUploadingInvoice(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await api.post('/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const url = res.data?.url || res.data?.fileUrl || res.data?.data?.url || '';
      if (!url) throw new Error('No URL returned from server.');
      setInvoiceUrl(url);
      setInvoiceFileName(file.name);
      toast.success('Invoice document uploaded successfully!');
    } catch (err) {
      console.error('Invoice upload failed:', err);
      toast.error(err.response?.data?.message || 'Failed to upload invoice document.');
    } finally {
      setUploadingInvoice(false);
    }
  };

  const fetchCompanies = async () => {
    if (!isSuperAdmin) return;
    try {
      const res = await api.get('/admin/console/companies');
      const list = res.data.data || [];
      setCompanies(list);
    } catch (_) {
      try {
        const res2 = await api.get('/companies');
        const list2 = res2.data.data || res2.data || [];
        if (Array.isArray(list2)) setCompanies(list2);
      } catch (_) { }
    }
  };

  const loadedTabsRef = useRef(new Set());

  const getReqConfig = (targetCompId = selectedCompanyId) => {
    return targetCompId && targetCompId !== 'ALL'
      ? { headers: { 'x-company-id': targetCompId }, params: { companyId: targetCompId } }
      : { headers: { 'x-company-id': 'ALL' }, params: { companyId: 'ALL' } };
  };

  const fetchExpenseClaimsData = async (reqConfig) => {
    if (!canViewExpenseTab) return;
    try {
      const [claimsRes, visitsRes] = await Promise.all([
        api.get('/expense/accounts/pending', reqConfig).catch(() => null),
        api.get('/visits', reqConfig).catch(() => null),
      ]);
      const data = claimsRes?.data?.data || claimsRes?.data || [];
      setExpenseClaims(Array.isArray(data) ? data : []);

      const vData = visitsRes?.data?.data || visitsRes?.data || [];
      const pendingVisits = Array.isArray(vData)
        ? vData.filter(v => (v.status || '').toLowerCase() === 'pending' || (v.approvalStatus || '').toLowerCase() === 'pending')
        : [];
      setAccountsData(pendingVisits);
    } catch (_) {
      setExpenseClaims([]);
      setAccountsData([]);
    }
  };

  const fetchExpenseHistoryData = async (reqConfig) => {
    if (!canViewExpenseHistoryTab) return;
    try {
      const res = await api.get('/expense/claims', {
        ...reqConfig,
        params: { ...(reqConfig?.params || {}), limit: 100 }
      });
      const data = res.data?.data || res.data || [];
      const list = Array.isArray(data) ? data : [];
      const historyList = list.filter(c => {
        const st = String(c.status || '').toUpperCase().trim();
        if (['HR_PENDING', 'ACCOUNTS_PENDING', 'SUBMITTED', 'DRAFT', 'CREATED', 'RETURNED', 'HR_APPROVED'].includes(st)) {
          return false;
        }
        return (
          st === 'PAID' ||
          st === 'DISBURSED' ||
          st === 'SETTLED' ||
          st === 'HR_REJECTED' ||
          st === 'ACCOUNTS_REJECTED' ||
          st === 'REJECTED'
        );
      });
      setExpenseHistory(historyList);
    } catch (err) {
      console.error('Failed to fetch expense history:', err);
      setExpenseHistory([]);
    }
  };

  const fetchStoreData = async (reqConfig) => {
    if (!canViewStoreTab) return;
    const promises = [
      api.get('/material/transactions?status=pending', reqConfig).then(res => {
        const data = res.data.transactions || res.data.data || res.data || [];
        setMaterials(Array.isArray(data) ? data : []);
      }).catch(() => setMaterials([])),

      api.get('/barcodes/list/transfers', reqConfig).then(res => {
        const data = res.data.transfers || res.data.data || res.data || [];
        setTransfers(Array.isArray(data) ? data : []);
      }).catch(() => setTransfers([])),

      api.get('/barcodes/list/returns', reqConfig).then(res => {
        const data = res.data.data || res.data.returns || res.data || [];
        setReturns(Array.isArray(data) ? data : []);
      }).catch(() => setReturns([])),

      api.get('/barcodes/list/splits', reqConfig).then(res => {
        const data = res.data.data || res.data.requests || res.data || [];
        setSplits(Array.isArray(data) ? data : []);
      }).catch(() => setSplits([])),

      api.get('/barcodes/list/exchange-requests', reqConfig).then(res => {
        const data = res.data.data || res.data.requests || res.data || [];
        setExchanges(Array.isArray(data) ? data : []);
      }).catch(() => setExchanges([])),

      api.get('/barcodes/list/merge-requests', reqConfig).then(res => {
        const data = res.data.data || res.data.requests || res.data || [];
        setMerges(Array.isArray(data) ? data : []);
      }).catch(() => setMerges([]))
    ];
    await Promise.all(promises);
  };

  const fetchAccountMaterialsData = async (reqConfig) => {
    if (!canViewStoreTab && !isAccountAdmin) return;
    try {
      const res = await api.get('/barcodes/close-requests/pending', reqConfig);
      const data = res.data.requests || res.data.data || res.data || [];
      setCloseRequests(Array.isArray(data) ? data : []);
    } catch (_) {
      setCloseRequests([]);
    }
  };

  const fetchPendingData = useCallback(async (targetCompId = selectedCompanyId, tabToFetch = activeTab, force = false) => {
    const tabKey = `${targetCompId}_${tabToFetch}`;
    if (!force && loadedTabsRef.current.has(tabKey)) {
      return;
    }

    try {
      setLoading(true);
      const reqConfig = getReqConfig(targetCompId);

      if (tabToFetch === 'all') {
        const allPromises = [];
        if (canViewExpenseTab) allPromises.push(fetchExpenseClaimsData(reqConfig));
        if (canViewStoreTab) allPromises.push(fetchStoreData(reqConfig));
        if (canViewStoreTab || isAccountAdmin) allPromises.push(fetchAccountMaterialsData(reqConfig));
        if (canViewExpenseHistoryTab) allPromises.push(fetchExpenseHistoryData(reqConfig));
        await Promise.all(allPromises);
      } else if (tabToFetch === 'expense_claims' || tabToFetch === 'account_claims') {
        await fetchExpenseClaimsData(reqConfig);
      } else if (tabToFetch === 'store') {
        await fetchStoreData(reqConfig);
      } else if (tabToFetch === 'account_materials') {
        await fetchAccountMaterialsData(reqConfig);
      } else if (tabToFetch === 'expense_history') {
        await fetchExpenseHistoryData(reqConfig);
      }

      loadedTabsRef.current.add(tabKey);
    } catch (err) {
      toast.error('Failed to load pending approvals');
    } finally {
      setLoading(false);
    }
  }, [selectedCompanyId, activeTab, isSuperAdmin, isCompanyAdmin, isHRAdmin, isAccountAdmin, canViewStoreTab, canViewExpenseTab, canViewExpenseHistoryTab]);

  useEffect(() => {
    if (isSuperAdmin) {
      fetchCompanies();
    }
    loadedTabsRef.current.clear();
    fetchPendingData(selectedCompanyId, activeTab, true);
  }, [selectedCompanyId]);

  useEffect(() => {
    fetchPendingData(selectedCompanyId, activeTab, false);
  }, [activeTab]);

  // Broadcast total pending approvals count whenever data changes
  useEffect(() => {
    const totalPendingCount =
      (expenseClaims?.length || 0) +
      (materials?.length || 0) +
      (transfers?.filter(t => ['pending', 'approved'].includes(t.status))?.length || 0) +
      (returns?.filter(r => !['completed', 'accepted', 'rejected', 'cancelled'].includes(r.status))?.length || 0) +
      (splits?.filter(s => ['pending', 'store_accepted'].includes(s.status))?.length || 0) +
      (exchanges?.filter(e => e.status === 'pending')?.length || 0) +
      (merges?.filter(m => m.status === 'pending')?.length || 0) +
      (accountsData?.length || 0) +
      (closeRequests?.length || 0);

    window.dispatchEvent(
      new CustomEvent('pendingApprovalsCountUpdated', {
        detail: { count: totalPendingCount },
      })
    );
  }, [materials, transfers, returns, splits, exchanges, merges, accountsData, expenseClaims, closeRequests]);

  // Handle Action (Approve / Reject)
  const handleAction = async () => {
    if (!selectedItem) return;
    setProcessing(true);

    try {
      if (selectedItem.category === 'hr') {
        // Leave Action
        await api.put(`/leaves/${selectedItem._id}`, {
          status: actionType === 'approve' ? 'Approved' : 'Rejected',
          adminNote: adminNote || (actionType === 'approve' ? 'Approved by HR Admin' : 'Rejected by HR Admin')
        });
        toast.success(`Leave request ${actionType === 'approve' ? 'approved' : 'rejected'} successfully!`);
      } else if (selectedItem.category === 'store' || selectedItem.isMaterialRequest) {
        if (selectedItem.type === 'close_request_store' || selectedItem.type === 'close_request_accounts') {
          const payload = {
            action: actionType === 'approve' ? 'approve' : 'reject',
            rejectionReason: adminNote || (actionType === 'reject' ? 'Rejected by Store / Admin' : undefined),
            remarks: adminNote || (actionType === 'approve' ? 'Approved by Store / Admin' : undefined),
          };
          await api.post(`/barcodes/close-requests/${selectedItem._id}/respond`, payload)
            .catch(() => api.post(`/material/barcodes/close-requests/${selectedItem._id}/respond`, payload));
          toast.success(`Store material closure request ${actionType === 'approve' ? 'accepted' : 'rejected'}!`);
          setCloseRequests(prev => prev.filter(c => c._id !== selectedItem._id));
        } else if (selectedItem.type === 'transfer') {
          // Custody Transfer approval / rejection
          const payload = {
            transferId: selectedItem._id,
            action: actionType === 'approve' ? 'accept' : 'reject',
            reason: adminNote || (actionType === 'approve' ? 'Approved by Company / Super Admin' : 'Rejected by Company / Super Admin')
          };
          await api.post('/barcodes/handle-transfer', payload)
            .catch(() => api.post('/material/barcodes/handle-transfer', payload));
          toast.success(`Custody transfer ${actionType === 'approve' ? 'approved / accepted' : 'rejected'} successfully!`);
          setTransfers(prev => prev.filter(t => t._id !== selectedItem._id));
        } else if (selectedItem.type === 'return') {
          // Store return approval (accept) / rejection
          const hasPendingTransfer = selectedItem.raw?.pendingHandlerTransfer?.status === 'pending';

          if (actionType === 'approve') {
            if (hasPendingTransfer) {
              await api.put(`/barcodes/return/${selectedItem._id}/handler-action`, {
                actionType: 'accept_transfer',
                remarks: adminNote || 'Handler transfer accepted by Admin'
              }).catch(() => api.put(`/barcodes/return/${selectedItem._id}/accept`, {
                remarks: adminNote || 'Approved and accepted at store by Admin'
              }));
              toast.success('Return handler transfer accepted successfully!');
            } else {
              await api.put(`/barcodes/return/${selectedItem._id}/accept`, {
                remarks: adminNote || 'Approved and accepted at store by Admin'
              }).catch(() => api.put(`/material/barcodes/return/${selectedItem._id}/accept`, {
                remarks: adminNote || 'Approved and accepted at store by Admin'
              }));
              toast.success('Store return request accepted successfully!');
            }
          } else {
            // Rejection flow: supports handler transfer rejection or direct return rejection
            const payload = {
              reason: adminNote || 'Rejected by Admin',
              remarks: adminNote || 'Rejected by Admin',
              actionType: hasPendingTransfer ? 'reject_transfer' : 'reject'
            };

            try {
              await api.put(`/barcodes/return/${selectedItem._id}/reject`, payload);
            } catch (err1) {
              try {
                await api.put(`/barcodes/return/${selectedItem._id}/handler-action`, payload);
              } catch (err2) {
                await api.put(`/material/barcodes/return/${selectedItem._id}/reject`, payload);
              }
            }
            toast.success(hasPendingTransfer ? 'Return handler transfer rejected.' : 'Store return request rejected.');
          }
          setReturns(prev => prev.filter(r => r._id !== selectedItem._id));
        } else if (selectedItem.type === 'split') {
          if (actionType === 'reject') {
            const payload = {
              requestId: selectedItem._id,
              action: 'reject',
              storeRemark: adminNote || 'Rejected by Store',
              reason: adminNote || 'Rejected by Store'
            };
            await api.post('/barcodes/approve-split', payload)
              .catch(() => api.post('/material/barcodes/approve-split', payload));
            toast.success('Split request rejected.');
            setSplits(prev => prev.filter(s => s._id !== selectedItem._id));
            resetActionModal();
            return;
          }

          // Approve Flow: Phase 1 vs Phase 2
          if (splitPhase === 1) {
            // Phase 1: Store accepts split request and posts Autofill Stock Journal in Tally
            const acceptPayload = {
              storeRemark: adminNote || 'Store accepted split request'
            };
            let res;
            try {
              res = await api.post(`/barcodes/split-requests/${selectedItem._id}/accept`, acceptPayload);
            } catch (err) {
              res = await api.post('/barcodes/approve-split', {
                requestId: selectedItem._id,
                phase: 1,
                action: 'accept',
                ...acceptPayload
              });
            }

            const voucherNum = res.data?.tallyVoucherNumber || res.data?.splitReq?.tallyVoucherNumber || 'Posted';
            toast.success(`Phase 1 Complete: Autofill Stock Journal (${voucherNum}) created in Tally! Opening Phase 2...`);

            // Update local splits list
            setSplits(prev => prev.map(s => (s._id === selectedItem._id ? {
              ...s,
              status: 'store_accepted',
              tallyVoucherNumber: voucherNum,
              storeRemark: adminNote || s.storeRemark
            } : s)));

            // Immediately switch modal to Phase 2 confirmation box
            setSelectedItem(prev => ({
              ...prev,
              raw: {
                ...prev.raw,
                status: 'store_accepted',
                tallyVoucherNumber: voucherNum,
                storeRemark: adminNote || prev.raw?.storeRemark
              },
              details: `Phase 2: Barcode Scan Required • Tally Voucher: ${voucherNum}`
            }));
            setSplitPhase(2);
            setNewSplitBarcode('');
            setAdminNote('');
            setProcessing(false);
            return; // Keep modal open for Phase 2!
          } else {
            // Phase 2: Barcode Scan + Split Remarks
            if (!newSplitBarcode || !newSplitBarcode.trim()) {
              toast.error('Barcode is required! Please scan the printed barcode to complete split.');
              setProcessing(false);
              return;
            }

            const payload = {
              requestId: selectedItem._id,
              action: 'approve',
              phase: 2,
              newBarcode: newSplitBarcode.trim(),
              storeRemark: adminNote || 'Split approved and barcode scanned by Store',
              reason: adminNote || 'Split approved and barcode scanned by Store'
            };
            await api.post('/barcodes/approve-split', payload)
              .catch(() => api.post('/material/barcodes/approve-split', payload));
            toast.success(`Split completed successfully! New barcode ${newSplitBarcode.trim()} is now active for requester.`);
            setSplits(prev => prev.filter(s => s._id !== selectedItem._id));
            resetActionModal();
            return;
          }
        } else if (selectedItem.type === 'exchange') {
          // Exchange request approval (accept) / rejection
          const payload = {
            action: actionType === 'approve' ? 'accept' : 'reject',
            storeRemark: adminNote || (actionType === 'approve' ? 'Approved by Admin' : 'Rejected by Admin'),
            reason: adminNote || (actionType === 'approve' ? 'Approved by Admin' : 'Rejected by Admin')
          };
          await api.post(`/barcodes/exchange-requests/${selectedItem._id}/respond`, payload)
            .catch(() => api.post(`/material/barcodes/exchange-requests/${selectedItem._id}/respond`, payload));
          toast.success(`Warranty exchange request ${actionType === 'approve' ? 'accepted' : 'rejected'} successfully!`);
          setExchanges(prev => prev.filter(e => e._id !== selectedItem._id));
        } else if (selectedItem.type === 'merge') {
          // Merge request approval / rejection
          const payload = {
            requestId: selectedItem._id,
            action: actionType === 'approve' ? 'approve' : 'reject',
            storeRemark: adminNote || (actionType === 'approve' ? 'Approved by Admin' : 'Rejected by Admin'),
            reason: adminNote || (actionType === 'approve' ? 'Approved by Admin' : 'Rejected by Admin')
          };
          await api.post('/barcodes/approve-merge', payload)
            .catch(() => api.post('/material/barcodes/approve-merge', payload));
          toast.success(`Merge request ${actionType === 'approve' ? 'approved' : 'rejected'} successfully!`);
          setMerges(prev => prev.filter(m => m._id !== selectedItem._id));
        } else {
          // Material Transaction Action
          if (actionType === 'approve') {
            await api.put(`/material/transactions/${selectedItem._id}/approve`, {
              remarks: adminNote || 'Approved via Admin Console'
            }).catch(() => api.put(`/transactions/${selectedItem._id}/approve`, {
              remarks: adminNote || 'Approved via Admin Console'
            }));
            toast.success(`Material request approved successfully!`);
          } else {
            await api.put(`/material/transactions/${selectedItem._id}/reject`, {
              reason: adminNote || 'Rejected via Admin Console',
              permanent: true
            }).catch(() => api.put(`/transactions/${selectedItem._id}/reject`, {
              reason: adminNote || 'Rejected via Admin Console',
              permanent: true
            }));
            toast.success(`Material request rejected.`);
          }
          setMaterials(prev => prev.filter(m => m._id !== selectedItem._id));
        }
      } else if (selectedItem.category === 'accounts') {
        if (selectedItem.type === 'accounts_expense') {
          if (actionType === 'approve') {
            const raw = selectedItem.raw || {};
            const payable = raw.payableAmount || raw.grandAllowed || raw.grandRequested || 0;
            await api.post(`/expense/claims/${selectedItem._id}/payment`, {
              paidAmount: payable,
              paymentDate: new Date().toISOString().split('T')[0],
              paymentMethod: 'Bank Transfer (NEFT)',
              paymentReference: adminNote || 'Approved and processed via Admin Console'
            });
            toast.success(`Expense claim approved & payment recorded successfully!`);
          } else {
            await api.post(`/expense/claims/${selectedItem._id}/reject`, {
              rejectionReason: adminNote || 'Rejected by Accounts / Company Admin'
            });
            toast.success(`Expense claim rejected.`);
          }
          setExpenseClaims(prev => prev.filter(e => e._id !== selectedItem._id));
        } else if (selectedItem.type === 'close_request_accounts') {
          // Close / Conversion request (DC FOC / Invoice) -> Accounts Approval
          const payload = {
            action: actionType === 'approve' ? 'approve' : 'reject',
            rejectionReason: adminNote || (actionType === 'reject' ? 'Rejected by Accounts' : undefined),
            invoiceNumber: actionType === 'approve' ? (invoiceNumber.trim() || undefined) : undefined,
            documentNumber: actionType === 'approve' ? (invoiceNumber.trim() || undefined) : undefined,
            invoiceUrl: actionType === 'approve' ? (invoiceUrl.trim() || undefined) : undefined,
            url: actionType === 'approve' ? (invoiceUrl.trim() || undefined) : undefined,
            remarks: adminNote || (actionType === 'approve' ? 'Approved by Accounts Admin' : undefined),
          };
          await api.post(`/barcodes/close-requests/${selectedItem._id}/respond`, payload)
            .catch(() => api.post(`/material/barcodes/close-requests/${selectedItem._id}/respond`, payload));

          if (actionType === 'approve') {
            const isInvoice = String(selectedItem.raw?.documentType || '').toLowerCase() === 'invoice';
            toast.success(
              isInvoice
                ? 'Invoice conversion request approved with invoice documentation and forwarded to Store!'
                : `${selectedItem.raw?.documentType || 'DC FOC'} approved and forwarded to Store for physical acceptance!`
            );
          } else {
            toast.success(`Request rejected successfully.`);
          }
          setCloseRequests(prev => prev.filter(c => c._id !== selectedItem._id));
        } else {
          // Visit/Claim Action
          await api.patch(`/visits/${selectedItem._id}/status`, {
            status: actionType === 'approve' ? 'Approved' : 'Rejected',
            remarks: adminNote
          });
          toast.success(`Claim ${actionType === 'approve' ? 'approved' : 'rejected'} successfully!`);
          setAccountsData(prev => prev.filter(a => a._id !== selectedItem._id));
        }
      } else if (selectedItem.type === 'close_request_store') {
        // Close / Conversion request (DC FOC / DC Internal / Invoice) -> Store Physical Acceptance
        const payload = {
          action: actionType === 'approve' ? 'approve' : 'reject',
          rejectionReason: adminNote || (actionType === 'reject' ? 'Rejected by Store' : undefined),
          storeRemark: adminNote || undefined,
        };
        await api.post(`/barcodes/close-requests/${selectedItem._id}/respond`, payload)
          .catch(() => api.post(`/material/barcodes/close-requests/${selectedItem._id}/respond`, payload));

        if (actionType === 'approve') {
          toast.success(`${selectedItem.raw?.documentType || 'DC FOC'} physical acceptance verified & completed!`);
        } else {
          toast.success(`Request rejected.`);
        }
        setCloseRequests(prev => prev.filter(c => c._id !== selectedItem._id));
      }

      resetActionModal();
    } catch (err) {
      toast.error(err.response?.data?.message || `Failed to ${actionType} request`);
    } finally {
      setProcessing(false);
    }
  };

  const resolveItemCompany = (raw) => {
    if (!raw) return '';
    if (typeof raw?.companyName === 'string') return raw.companyName;
    if (typeof raw?.companyName === 'object') return raw.companyName?.name || '';
    if (raw?.companyId?.name) return String(raw.companyId.name);
    if (raw?.company?.name) return String(raw.company.name);
    const cId = String(raw?.companyId?._id || raw?.companyId || raw?.company?._id || raw?.company || '');
    if (cId && companies.length > 0) {
      const match = companies.find(c => String(c._id) === cId);
      if (match) return String(match.name);
    }
    return '';
  };

  // Combine & Filter Items
  const allStoreItems = !canViewStoreTab ? [] : [
    // 1. Material Transactions (pending authorization or dispatch)
    ...materials.filter(m => ['submitted', 'tl_approved', 'mgt_approved', 'ready_for_dispatch', 'store_accepted'].includes(m.status)).map(m => {
      const matSummary = m.materials && m.materials.length > 0
        ? m.materials.map(x => `${x.name} (Qty: ${x.quantity || 1} ${x.unit || ''})`).join(', ')
        : (m.materialName || 'Material Items');
      const reqName = m.requester?.fullName || m.requester?.name || m.requestedBy?.name || m.handler?.name || 'Requester Staff';
      const reqEmpId = m.requester?.employeeId || m.materials?.[0]?.name || m.materialName || 'Material';

      return {
        _id: m._id,
        category: 'store',
        isMaterialRequest: true,
        type: 'material',
        title: `Material Request (${m.transactionId || m._id.slice(-6).toUpperCase()})`,
        applicant: reqName,
        empCode: reqEmpId,
        companyName: resolveItemCompany(m),
        details: `Status: ${(m.status || '').toUpperCase()}${m.purpose ? ` • Purpose: ${m.purpose}` : ''} • Materials: ${matSummary}`,
        reason: m.description || m.remarks || m.purpose || m.notes || 'Material movement request',
        date: m.createdAt,
        raw: m
      };
    }),

    // 2. Custody Transfers (pending management approval or recipient acceptance)
    ...transfers.filter(t => ['pending', 'approved'].includes(t.status)).map(t => {
      const fromName = t.fromUser?.fullName || t.fromUser?.name || 'Sender';
      const toName = t.toUser?.fullName || t.toUser?.name || 'Recipient';
      const statusLabel = t.status === 'approved' ? 'Pending Recipient Acceptance' : 'Pending Management Approval';
      return {
        _id: t._id,
        category: 'store',
        isMaterialRequest: true,
        type: 'transfer',
        title: `Custody Transfer — Barcode ${t.barcode || 'N/A'}`,
        applicant: `${fromName} ➔ ${toName}`,
        empCode: t.barcode || 'BARCODE',
        companyName: resolveItemCompany(t),
        details: `Type: ${(t.type || 'Internal').replace('_', ' ').toUpperCase()} • ${statusLabel}`,
        reason: t.remarks || t.reason || 'Material custody transfer request',
        date: t.createdAt,
        raw: t
      };
    }),

    // 3. Store Returns (pending physical acceptance, handler assignment, etc.)
    ...returns.filter(r => !['completed', 'accepted', 'rejected', 'cancelled'].includes(r.status)).map(r => {
      const userName = r.fromUser?.fullName || r.fromUser?.name || 'Employee';
      const hasPendingTransfer = r.pendingHandlerTransfer?.status === 'pending';
      const targetHandlerName = r.pendingHandlerTransfer?.toHandler?.fullName || r.pendingHandlerTransfer?.toHandler?.name;
      const handlerName = r.returnHandler?.fullName || r.returnHandler?.name || targetHandlerName || 'Unassigned Handler';
      const statusLabel = hasPendingTransfer ? `Handler Transfer Pending (➔ ${targetHandlerName || 'New Handler'})`
        : r.status === 'collected' ? 'Collected by Handler'
          : r.status === 'store_received' ? 'Received at Store (Pending Acceptance)'
            : r.status === 'handler_assigned' ? `Handler Assigned (${handlerName})`
              : 'Pending Store / Handler Action';
      return {
        _id: r._id,
        category: 'store',
        isMaterialRequest: true,
        type: 'return',
        title: `Store Return — Barcode ${r.barcode || 'N/A'}`,
        applicant: userName,
        empCode: r.barcode || 'RETURN',
        companyName: resolveItemCompany(r),
        details: `Status: ${statusLabel} • Handler: ${handlerName}`,
        reason: r.remarks || r.reason || 'Material return to store request',
        date: r.createdAt,
        raw: r
      };
    }),

    // 4. Reel / Lot Split Requests
    ...splits.filter(s => ['pending', 'store_accepted'].includes(s.status)).map(s => {
      const reqName = s.requester?.fullName || s.requester?.name || 'Requester';
      const isAccepted = s.status === 'store_accepted';
      return {
        _id: s._id,
        category: 'store',
        isMaterialRequest: true,
        type: 'split',
        title: `Reel/Lot Split — Barcode ${s.barcode || 'N/A'}`,
        applicant: reqName,
        empCode: s.barcode || 'SPLIT',
        companyName: resolveItemCompany(s),
        details: isAccepted
          ? `Phase 2: Barcode Scan Required • Tally Voucher: ${s.tallyVoucherNumber || 'Posted'}`
          : `Material: ${s.materialName || 'Material'} • Split Qty: ${s.newQuantity || 1} • Target: ${s.requestedMaterialName || s.materialName || 'New Split'}`,
        reason: s.reason || 'Material split into smaller lot / length',
        date: s.createdAt,
        raw: s
      };
    }),

    // 5. Warranty Barcode Exchange Requests
    ...exchanges.filter(e => e.status === 'pending').map(e => {
      const reqName = e.requester?.fullName || e.requester?.name || 'Requester';
      return {
        _id: e._id,
        category: 'store',
        isMaterialRequest: true,
        type: 'exchange',
        title: `Warranty Exchange — Old Barcode ${e.oldBarcode || 'N/A'}`,
        applicant: reqName,
        empCode: e.oldBarcode || 'EXCHANGE',
        companyName: resolveItemCompany(e),
        details: e.newBarcodeMode === 'existing' && e.newBarcode
          ? `Scanned Replacement: ${e.newBarcode}`
          : `TDL Auto-Generate (2-Phase) • ${e.newBarcode || 'Pending Store Assignment'}`,
        reason: e.warrantyReason || e.reason || 'Warranty replacement barcode exchange request',
        date: e.createdAt,
        raw: e
      };
    }),

    // 6. Barcode Merge / Consolidation Requests
    ...merges.filter(m => m.status === 'pending').map(m => {
      const reqName = m.requester?.fullName || m.requester?.name || 'Requester';
      const bCount = (m.mergeBarcodes || []).length;
      return {
        _id: m._id,
        category: 'store',
        isMaterialRequest: true,
        type: 'merge',
        title: `Material Merge — ${bCount} Barcodes (${m.selectedParentBarcode || m.mergeBarcodes?.[0] || 'Parent'})`,
        applicant: reqName,
        empCode: m.selectedParentBarcode || 'MERGE',
        companyName: resolveItemCompany(m),
        details: `Consolidating: ${(m.mergeBarcodes || []).join(', ')} • Target: ${m.requestedMaterialName || 'Consolidated Stock'}`,
        reason: m.reason || 'Merge remnants / barcodes into consolidated stock',
        date: m.createdAt,
        raw: m
      };
    }),

    // 7. Conversions & Closures (Store Physical Verification)
    ...closeRequests.filter(c => c.status === 'pending_store_acceptance' || (c.status === 'pending' && c.documentType === 'DC Internal')).map(c => ({
      _id: c._id,
      category: 'store',
      isMaterialRequest: true,
      type: 'close_request_store',
      title: `Material Movement — ${c.documentType || 'DC FOC'} Physical Acceptance (${c.barcode})`,
      applicant: c.requester?.fullName || c.requester?.name || 'Requester Staff',
      empCode: c.barcode || 'BARCODE',
      companyName: resolveItemCompany(c),
      details: `Material Movement: ${c.documentType} • Store Physical Verification`,
      reason: `Customer: ${c.customerName || 'N/A'} • ${c.remarks || 'Awaiting physical verification and stock closure'}`,
      date: c.updatedAt || c.createdAt,
      raw: c
    }))
  ];

  const allAccountClaimItems = accountsData.map(a => ({
    _id: a._id,
    category: 'accounts',
    type: 'visit',
    title: `Customer Visit Claim (${a.customerName || 'Visit'})`,
    applicant: a.employeeName || a.user?.name || 'Sales Rep',
    empCode: a.customerPhone || 'Customer Claim',
    companyName: resolveItemCompany(a),
    details: `Location: ${a.location || 'Client Location'}`,
    reason: a.purpose || a.notes || 'Visit verification request',
    date: a.visitDate || a.createdAt,
    expenseDate: a.visitDate || a.createdAt,
    raw: a
  }));

  const allAccountMaterialItems = closeRequests.filter(c => c.status === 'pending_accounts_approval').map(c => ({
    _id: c._id,
    category: 'accounts',
    isMaterialRequest: true,
    type: 'close_request_accounts',
    title: `Material Movement — ${c.documentType || 'DC FOC'} Audit (${c.barcode})`,
    applicant: c.requester?.fullName || c.requester?.name || 'Requester Staff',
    empCode: c.barcode || 'BARCODE',
    companyName: resolveItemCompany(c),
    details: `Material Movement: ${c.documentType} • Accounts Compliance Audit`,
    reason: `Customer: ${c.customerName || 'N/A'} • Management Authorized: ${c.managementApprover?.fullName || c.managementApprover?.name || 'Yes'} • ${c.remarks || 'Material conversion to ' + c.documentType}`,
    date: c.updatedAt || c.createdAt,
    raw: c
  }));

  const allExpenseClaimItems = !canViewExpenseTab ? [] : [
    ...expenseClaims.map(c => ({
      _id: c._id,
      category: 'accounts',
      type: 'accounts_expense',
      title: `Expense Claim (${c.claimType || 'Expense'}) • ₹${c.payableAmount || c.grandAllowed || c.grandRequested || 0}`,
      applicant: c.submittedBy?.name || c.submittedByName || c.employeeClaims?.[0]?.employee?.name || 'Employee',
      empCode: c.claimNumber || 'EXP-CLAIM',
      companyName: resolveItemCompany(c),
      details: `${c.employeeCount || 1} Employee(s) • Req: ₹${c.grandRequested} • Allowed: ₹${c.grandAllowed}${c.fullPayment?.requested ? ' • ⚡ Full Payment Requested' : ''}`,
      reason: c.trip?.purpose || c.purpose || (c.employeeClaims?.[0]?.items?.[0]?.description) || 'Pending payment verification',
      date: c.submittedAt || c.createdAt,
      expenseDate: c.claimDate || c.fromDate || c.submittedAt || c.createdAt,
      raw: c
    })),
    ...allAccountClaimItems
  ];

  const allExpenseHistoryItems = !canViewExpenseHistoryTab ? [] : expenseHistory
    .filter(c => {
      const st = String(c.status || '').toUpperCase().trim();
      if (['HR_PENDING', 'ACCOUNTS_PENDING', 'SUBMITTED', 'DRAFT', 'CREATED', 'RETURNED', 'HR_APPROVED'].includes(st)) {
        return false;
      }
      return (
        st === 'PAID' ||
        st === 'DISBURSED' ||
        st === 'SETTLED' ||
        st === 'HR_REJECTED' ||
        st === 'ACCOUNTS_REJECTED' ||
        st === 'REJECTED'
      );
    })
    .map(c => {
      const st = String(c.status || '').toUpperCase().trim();
      const isPaid = st === 'PAID' || st === 'DISBURSED' || st === 'SETTLED';
      const isHrRejected = st === 'HR_REJECTED';
      const isAccountsRejected = st === 'ACCOUNTS_REJECTED';
      const isRejected = isHrRejected || isAccountsRejected || st === 'REJECTED';

      let statusBadge = 'Approved & Paid';
      let statusColor = 'bg-emerald-50 text-emerald-700 border-emerald-200';
      if (isPaid) {
        statusBadge = 'Approved & Paid';
        statusColor = 'bg-emerald-50 text-emerald-700 border-emerald-200';
      } else if (isHrRejected) {
        statusBadge = 'Rejected by HR';
        statusColor = 'bg-rose-50 text-rose-700 border-rose-200';
      } else if (isAccountsRejected) {
        statusBadge = 'Rejected by Accounts';
        statusColor = 'bg-rose-50 text-rose-700 border-rose-200';
      } else {
        statusBadge = 'Rejected';
        statusColor = 'bg-rose-50 text-rose-700 border-rose-200';
      }

      const lastApproval = Array.isArray(c.approvalHistory) && c.approvalHistory.length > 0
        ? c.approvalHistory[c.approvalHistory.length - 1]
        : null;

      let reasonText = '';
      if (isHrRejected) {
        reasonText = c.hrRemarks ||
          (Array.isArray(c.approvalHistory) && [...c.approvalHistory].reverse().find(a => a.action === 'rejected')?.remarks) ||
          c.decisionRemarks ||
          'Rejected by HR Admin';
      } else if (isAccountsRejected) {
        reasonText = c.accountsRemarks ||
          (Array.isArray(c.approvalHistory) && [...c.approvalHistory].reverse().find(a => a.action === 'rejected')?.remarks) ||
          c.decisionRemarks ||
          'Rejected by Accounts';
      } else if (isRejected) {
        reasonText = c.accountsRemarks || c.hrRemarks ||
          (Array.isArray(c.approvalHistory) && [...c.approvalHistory].reverse().find(a => a.action === 'rejected')?.remarks) ||
          c.decisionRemarks ||
          'Rejected';
      } else if (isPaid) {
        reasonText = c.disbursement?.remarks ||
          c.accountsRemarks ||
          c.decisionRemarks ||
          (Array.isArray(c.approvalHistory) && [...c.approvalHistory].reverse().find(a => a.action === 'approved' || a.action === 'disbursed')?.remarks) ||
          'Disbursed and processed by Accounts';
      } else {
        reasonText = c.decisionRemarks || c.trip?.purpose || c.purpose || 'Expense Claim';
      }

      const paidVal = c.disbursement?.paidAmount || c.paidAmount;
      const expDate = c.claimDate || c.fromDate || c.toDate || c.disbursement?.paidAt || c.disbursedAt || c.actionedAt || lastApproval?.timestamp || c.updatedAt || c.submittedAt || c.createdAt;

      return {
        _id: c._id,
        category: 'expense_history',
        type: 'expense_history',
        isHistory: true,
        statusBadge,
        statusColor,
        isApproved: isPaid,
        isRejected,
        title: `Expense Claim (${c.claimType || 'Expense'}) • ₹${c.payableAmount || c.grandAllowed || c.grandRequested || 0}`,
        applicant: c.submittedBy?.name || c.submittedByName || c.employeeClaims?.[0]?.employee?.name || 'Employee',
        empCode: c.claimNumber || 'EXP-CLAIM',
        companyName: resolveItemCompany(c),
        details: `${c.employeeCount || 1} Employee(s) • Req: ₹${c.grandRequested || 0} • Allowed: ₹${c.grandAllowed || 0}${paidVal ? ` • Paid: ₹${paidVal}` : ''}`,
        reason: reasonText,
        date: expDate,
        expenseDate: expDate,
        raw: c
      };
    });

  let displayItems = [];
  if (activeTab === 'all') {
    displayItems = [...allExpenseClaimItems, ...allStoreItems, ...allAccountMaterialItems];
  } else if (activeTab === 'expense_claims' || activeTab === 'account_claims') {
    displayItems = allExpenseClaimItems;
  } else if (activeTab === 'store') {
    displayItems = allStoreItems;
  } else if (activeTab === 'account_materials') {
    displayItems = allAccountMaterialItems;
  } else if (activeTab === 'expense_history') {
    displayItems = allExpenseHistoryItems;
  }

  // Auto-open claim details when navigated directly with targetClaimId
  useEffect(() => {
    if (targetClaimId) {
      const match = [...allExpenseClaimItems, ...allExpenseHistoryItems].find(i => String(i._id) === String(targetClaimId));
      if (match) {
        setDetailItem(match);
      }
    }
  }, [targetClaimId, expenseClaims, expenseHistory]);

  if (searchTerm) {
    displayItems = displayItems.filter(item =>
      item.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.applicant.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.details.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.reason.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.statusBadge && item.statusBadge.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (item.empCode && item.empCode.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (item.companyName && item.companyName.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  }

  // Available filter options (All Database Employees + any extra from loaded claims)
  const availableEmployees = useMemo(() => {
    const map = new Map();
    allDbEmployees.forEach(e => {
      const name = e.name || e.fullName;
      const code = e.employeeIdCode || e.employeeId;
      if (name) map.set(name, { name, code });
    });
    [...(expenseClaims || []), ...(expenseHistory || [])].forEach(c => {
      const name = c.submittedBy?.name || c.submittedBy?.fullName || c.submittedByName || c.employeeClaims?.[0]?.employee?.name;
      if (name && !map.has(name)) {
        map.set(name, { name, code: c.submittedBy?.employeeIdCode || c.submittedBy?.employeeId || c.employeeCode });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [allDbEmployees, expenseClaims, expenseHistory]);

  // Available cities from Expense Management city masters
  const availableCities = useMemo(() => {
    const map = new Map();
    allDbCities.forEach(c => {
      if (c.city) map.set(c.city, { city: c.city, cityClass: c.cityClass });
    });
    [...(expenseClaims || []), ...(expenseHistory || [])].forEach(c => {
      const dest = c.trip?.destination;
      if (dest && !map.has(dest)) {
        map.set(dest, { city: dest, cityClass: '' });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.city.localeCompare(b.city));
  }, [allDbCities, expenseClaims, expenseHistory]);

  // Apply Advanced Filters to displayItems
  if (filterEmployee && filterEmployee !== 'ALL') {
    displayItems = displayItems.filter(item => {
      const name = item.applicant || item.raw?.submittedBy?.name || item.raw?.submittedByName || '';
      return name.toLowerCase().includes(filterEmployee.toLowerCase());
    });
  }

  if (filterCity && filterCity.trim()) {
    const qCity = filterCity.toLowerCase().trim();
    displayItems = displayItems.filter(item => {
      const city = item.raw?.trip?.destination || item.raw?.destination || item.raw?.location || '';
      return city.toLowerCase().includes(qCity);
    });
  }

  if (filterExpenseType && filterExpenseType !== 'ALL') {
    const qType = filterExpenseType.toUpperCase();
    displayItems = displayItems.filter(item => {
      const t = (item.raw?.claimType || item.type || '').toUpperCase();
      return t.includes(qType);
    });
  }

  if (filterFromDate || filterToDate) {
    displayItems = displayItems.filter(item => {
      let targetDateStr = item.raw?.claimDate || item.raw?.fromDate || item.expenseDate || item.date || item.raw?.submittedAt || item.raw?.createdAt;
      if (!targetDateStr) return false;
      try {
        const d = new Date(targetDateStr).toISOString().split('T')[0];
        if (filterFromDate && d < filterFromDate) return false;
        if (filterToDate && d > filterToDate) return false;
      } catch (_) {
        return false;
      }
      return true;
    });
  }

  const activeFiltersCount = [
    filterEmployee !== 'ALL' && filterEmployee,
    filterCity.trim(),
    filterExpenseType !== 'ALL' && filterExpenseType,
    filterFromDate,
    filterToDate,
  ].filter(Boolean).length;

  const resetAllFilters = () => {
    setFilterEmployee('ALL');
    setFilterCity('');
    setFilterExpenseType('ALL');
    setFilterFromDate('');
    setFilterToDate('');
    setSearchTerm('');
  };

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8 animate-fade-up">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-indigo-900 via-indigo-800 to-slate-900 rounded-[2.5rem] p-8 md:p-10 text-white shadow-2xl relative overflow-hidden flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="relative z-10 space-y-2">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-xs font-bold tracking-widest text-indigo-200">
            <Clock size={14} className="animate-spin-slow" />
            Pending Authorization Portal
          </div>
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">Pending Approvals</h1>
          <p className="text-slate-300 text-xs md:text-sm font-medium max-w-xl">
            {isSuperAdmin
              ? 'Super Admin Multi-Company Authorization Queue. Review, approve or reject across all companies.'
              : isCompanyAdmin
                ? 'Company Admin Multi-Department Authorization Portal. Review and action HR, Store, and Accounts queues.'
                : `Review and approve pending request queues for ${isHRAdmin ? 'HR Expense Reviews' : 'Accounts & Claims'}.`}
          </p>
        </div>

        <div className="relative z-10 flex flex-wrap items-center gap-3">
          <button
            onClick={() => {
              loadedTabsRef.current.clear();
              fetchPendingData(selectedCompanyId, activeTab, true);
            }}
            disabled={loading}
            className="px-5 py-2.5 bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/20 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 active:scale-95 text-white cursor-pointer"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        {/* Decorative Circles */}
        <div className="absolute -right-10 -bottom-10 w-60 h-60 bg-indigo-500/10 rounded-full blur-3xl" />
        <div className="absolute left-1/2 top-0 w-40 h-40 bg-indigo-400/10 rounded-full blur-2xl" />
      </div>

      {/* Filter Tabs & Search */}
      <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4 bg-white p-4 rounded-3xl border border-slate-200/80 shadow-sm">
        {/* Category Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
          {(isSuperAdmin || isCompanyAdmin) && (
            <button
              onClick={() => setActiveTab('all')}
              className={`px-5 py-2.5 rounded-2xl font-bold text-xs transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${activeTab === 'all' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}`}
            >
              <Layers size={15} />
              All Approvals ({allExpenseClaimItems.length + allStoreItems.length + allAccountMaterialItems.length})
            </button>
          )}

          {canViewExpenseTab && (
            <button
              onClick={() => setActiveTab('expense_claims')}
              className={`px-5 py-2.5 rounded-2xl font-bold text-xs transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${activeTab === 'expense_claims' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}`}
            >
              <DollarSign size={15} />
              Expense Claims ({allExpenseClaimItems.length})
            </button>
          )}

          {canViewStoreTab && (
            <button
              onClick={() => setActiveTab('store')}
              className={`px-5 py-2.5 rounded-2xl font-bold text-xs transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${activeTab === 'store' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}`}
            >
              <ArrowRightLeft size={15} />
              Store & Material ({allStoreItems.length})
            </button>
          )}

          {(canViewStoreTab || isAccountAdmin) && (
            <button
              onClick={() => setActiveTab('account_materials')}
              className={`px-5 py-2.5 rounded-2xl font-bold text-xs transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${activeTab === 'account_materials' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}`}
            >
              <Package size={15} />
              Account Material ({allAccountMaterialItems.length})
            </button>
          )}

          {canViewExpenseHistoryTab && (
            <button
              onClick={() => setActiveTab('expense_history')}
              className={`px-5 py-2.5 rounded-2xl font-bold text-xs transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${activeTab === 'expense_history' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}`}
            >
              <History size={15} />
              Expense History ({allExpenseHistoryItems.length})
            </button>
          )}
        </div>

        {/* Search Field & Advanced Filter Toggle */}
        <div className="flex items-center gap-2">
          <div className="relative min-w-[220px]">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by title, applicant, ID..."
              className="w-full pl-11 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-800 outline-none focus:border-indigo-500 focus:bg-white transition-all"
            />
          </div>
          <button
            onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
            className={`px-3.5 py-2.5 rounded-2xl border text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${showAdvancedFilters || activeFiltersCount > 0 ? 'bg-indigo-50 text-indigo-700 border-indigo-300' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'}`}
          >
            <Clock size={14} className={showAdvancedFilters ? 'text-indigo-600' : ''} />
            <span>Filters</span>
            {activeFiltersCount > 0 && (
              <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[10px] flex items-center justify-center font-extrabold ml-0.5">
                {activeFiltersCount}
              </span>
            )}
          </button>
        </div>
      </div>



      {/* Advanced Collapsible Filter Panel */}
      <AnimatePresence>
        {showAdvancedFilters && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto', transitionEnd: { overflow: 'visible' } }}
            exit={{ opacity: 0, height: 0, overflow: 'hidden' }}
            transition={{ duration: 0.2 }}
            className="relative z-30"
          >
            <div className="bg-white border border-slate-200 p-5 rounded-3xl shadow-sm space-y-4 overflow-visible">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
                <span className="text-xs font-bold text-slate-700 tracking-wider">
                  Filter Claims & Approvals
                </span>
                {activeFiltersCount > 0 && (
                  <button
                    onClick={resetAllFilters}
                    className="text-xs font-bold text-rose-600 hover:text-rose-700 flex items-center gap-1"
                  >
                    <X size={13} />
                    Reset All Filters
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
                {/* Employee Filter with Search Box */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1 flex items-center gap-1">
                    <Users size={12} className="text-indigo-600" />
                    Employee
                  </label>
                  <SearchableDropdown
                    options={availableEmployees.map((emp) => ({
                      value: emp.name,
                      label: emp.name,
                      sublabel: emp.code ? `(${emp.code})` : '',
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

                {/* City / Work Location with Search Box */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1 flex items-center gap-1">
                    <MapPin size={12} className="text-indigo-600" />
                    City / Work Location
                  </label>
                  <SearchableDropdown
                    options={availableCities.map((c) => ({
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

                {/* Expense Type */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">Expense Type</label>
                  <SearchableDropdown
                    options={[
                      { value: 'LODGING', label: 'Lodging' },
                      { value: 'FOOD', label: 'Food' },
                      { value: 'TRAVEL', label: 'Travel' },
                      { value: 'CONVEYANCE', label: 'Conveyance / Local' },
                      { value: 'OTHER', label: 'Other' },
                    ]}
                    value={filterExpenseType}
                    onChange={(val) => setFilterExpenseType(val)}
                    allOption={{ label: 'All Types', value: 'ALL' }}
                    placeholder="Select Type..."
                    searchable={false}
                  />
                </div>

                {/* From Date */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">From Date</label>
                  <input
                    type="date"
                    value={filterFromDate}
                    onChange={(e) => setFilterFromDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                {/* To Date */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">To Date</label>
                  <input
                    type="date"
                    value={filterToDate}
                    onChange={(e) => setFilterToDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Approvals Table / Grid */}
      {loading ? (
        <div className="bg-white rounded-3xl p-16 text-center border border-slate-200 shadow-sm flex flex-col items-center justify-center gap-3">
          <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm font-bold text-slate-500">Loading pending requests queue...</p>
        </div>
      ) : displayItems.length === 0 ? (
        <div className="bg-white rounded-3xl p-16 text-center border border-slate-200 shadow-sm flex flex-col items-center justify-center gap-3">
          <div className="w-16 h-16 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <CheckCircle2 size={32} />
          </div>
          <h3 className="text-lg font-bold text-slate-900 m-0">
            {activeTab === 'expense_history'
              ? 'No Expense History Found'
              : 'All Pending Approvals Cleared!'}
          </h3>
          <p className="text-xs font-medium text-slate-400 max-w-sm">
            {activeTab === 'expense_history'
              ? 'There are currently no approved or rejected expense claims recorded.'
              : 'There are currently no pending approval requests matching your selection.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {displayItems.map((item) => (
            <motion.div
              key={item._id}
              layout
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              onClick={() => setDetailItem(item)}
              className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-sm hover:shadow-xl hover:border-indigo-300 transition-all flex flex-col justify-between space-y-4 group cursor-pointer relative"
            >
              <div>
                {/* Header Tag & Company Badge */}
                <div className="flex flex-wrap justify-between items-center gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-extrabold px-3 py-1 rounded-full tracking-wider bg-indigo-50 text-indigo-600 border border-indigo-200">
                      {item.isMaterialRequest || item.type?.startsWith('close_request') || item.type === 'material'
                        ? '📦 Material Movement'
                        : item.isHistory || item.type === 'expense_history'
                          ? '📋 Expense History'
                          : item.type === 'accounts_expense'
                            ? '💰 Expense Claim'
                            : '💰 Customer Visit Claim'}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-slate-500 bg-slate-50 px-2.5 py-1 rounded-xl border border-slate-200/80 flex items-center gap-1">
                      <Clock size={11} className="text-slate-400" />
                      {item.type?.includes('expense') || item.type === 'disburse_claim' || item.category === 'hr' || (item.category === 'accounts' && item.type !== 'close_request_accounts') ? (
                        <>Exp: {formatExpenseDateDisplay(item.expenseDate || item.raw?.claimDate || item.raw?.fromDate || item.date)}</>
                      ) : (
                        <>{formatAppliedDateTime(item.date)}</>
                      )}
                    </span>
                    <div className="p-1 rounded-lg bg-slate-50 text-slate-400 group-hover:text-indigo-600 group-hover:bg-indigo-50 transition-colors">
                      <Eye size={13} />
                    </div>
                  </div>
                </div>

                {/* Title & Applicant */}
                <h4 className="text-base font-bold text-slate-900 group-hover:text-indigo-600 transition-colors leading-snug m-0">
                  {item.title}
                </h4>
                <p className="text-xs font-bold text-slate-500 mt-1">
                  By: <span className="text-slate-800">{item.applicant}</span> ({item.empCode})
                </p>

                {/* Details & Reason Box */}
                <div className="mt-4 p-3.5 bg-slate-50 group-hover:bg-indigo-50/40 rounded-2xl border border-slate-100 group-hover:border-indigo-100/60 transition-colors space-y-1">
                  <p className="text-[11px] font-bold text-indigo-600 m-0 text-center">{item.details}</p>
                  <p className="text-[11px] font-medium text-slate-600 text-center m-0">
                    {item.isHistory && <span className="font-bold text-slate-500">Reason / Remarks: </span>}
                    "{item.reason}"
                  </p>
                  {/* Distinct Proof Pills on Pending Card */}
                  {(item.type === 'expense' || item.type === 'accounts_expense' || item.type === 'hr_expense' || item.type === 'expense_history') && (() => {
                    const { billProofs, serviceReports, fullPaymentProofs } = getClaimProofs(item.raw);
                    const billCount = billProofs.length;
                    const srCount = serviceReports.length;
                    const fpCount = fullPaymentProofs.length;
                    if (billCount === 0 && srCount === 0 && fpCount === 0) return null;
                    return (
                      <div className="flex flex-wrap items-center justify-center gap-1.5 pt-1.5 border-t border-slate-200/50 mt-1.5">
                        {billCount > 0 && (
                          <span className="text-[9px] font-extrabold px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200">
                            🧾 Bill Proofs ({billCount})
                          </span>
                        )}
                        {srCount > 0 && (
                          <span className="text-[9px] font-extrabold px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200">
                            📑 Service Reports ({srCount})
                          </span>
                        )}
                        {fpCount > 0 && (
                          <span className="text-[9px] font-extrabold px-2 py-0.5 rounded-md bg-orange-50 text-orange-800 border border-orange-200">
                            ⚡ Full Payment ({fpCount})
                          </span>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>

              {item.isHistory ? (
                <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                  <span className={`text-xs font-extrabold px-3 py-1.5 rounded-xl border flex items-center gap-1.5 ${item.statusColor}`}>
                    {item.isRejected ? <XCircle size={14} /> : <CheckCircle2 size={14} />}
                    {item.statusBadge}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDetailItem(item);
                    }}
                    className="px-4 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold text-xs rounded-xl border border-slate-200 transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <Eye size={14} />
                    View Details
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-3 pt-2 border-t border-slate-100">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      openActionModal(item, 'approve');
                    }}
                    className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs shadow-md shadow-emerald-100 transition-all flex items-center justify-center gap-1.5 active:scale-95"
                  >
                    <CheckCircle2 size={15} />
                    {item.type === 'split'
                      ? (item.raw?.status === 'store_accepted' ? 'Scan Barcode (Phase 2)' : 'Approve')
                      : item.type === 'accounts_expense'
                        ? 'Approve & Pay'
                        : 'Approve'}
                  </button>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      openActionModal(item, 'reject');
                    }}
                    className="flex-1 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-xl font-bold text-xs border border-rose-200/60 transition-all flex items-center justify-center gap-1.5 active:scale-95"
                  >
                    <XCircle size={15} />
                    Reject
                  </button>
                </div>
              )}
            </motion.div>
          ))}
        </div>
      )}

      {/* ── Request Full Details Modal ── */}
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {detailItem && (
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
                    onClick={() => setDetailItem(null)}
                    className="absolute top-6 right-6 p-2 rounded-2xl bg-white/10 hover:bg-white/20 text-white transition-all active:scale-95"
                  >
                    <X size={20} />
                  </button>
                  <div className="flex items-center gap-3 mb-2">
                    <span className={`text-[10px] font-extrabold px-3 py-1 rounded-full tracking-wider ${detailItem.isHistory
                      ? (detailItem.isRejected ? 'bg-rose-400 text-rose-950' : 'bg-emerald-400 text-emerald-950')
                      : detailItem.category === 'hr' ? 'bg-amber-400 text-amber-950' :
                        (detailItem.category === 'store' || detailItem.isMaterialRequest || detailItem.type?.startsWith('close_request') || detailItem.type === 'material') ? 'bg-indigo-400 text-indigo-950' :
                          (detailItem.type === 'disburse_claim' || detailItem.raw?.paymentStatus === 'AWAITING_DISBURSEMENT' || detailItem.raw?.status === 'ACCOUNTS_APPROVED')
                            ? 'bg-amber-400 text-amber-950'
                            : 'bg-emerald-400 text-emerald-950'
                      }`}>
                      {detailItem.isHistory
                        ? (detailItem.isRejected ? '❌ Rejected Expense Claim' : '✅ Approved Expense Claim')
                        : detailItem.category === 'hr' ? '👥 HR Expense Review' :
                          (detailItem.category === 'store' || detailItem.isMaterialRequest || detailItem.type?.startsWith('close_request') || detailItem.type === 'material') ? '📦 Material Movement Request' :
                            (detailItem.type === 'disburse_claim' || detailItem.raw?.paymentStatus === 'AWAITING_DISBURSEMENT' || detailItem.raw?.status === 'ACCOUNTS_APPROVED')
                              ? '⏳ Awaiting Disbursement'
                              : '💰 Accounts & Expense Claim'}
                    </span>
                    <span className="text-xs text-slate-300 flex items-center gap-1.5 font-bold bg-white/10 px-3 py-1 rounded-full">
                      <Clock size={13} />
                      <span>
                        {detailItem.type?.includes('expense') || detailItem.type === 'disburse_claim' || detailItem.category === 'hr' || (detailItem.category === 'accounts' && detailItem.type !== 'close_request_accounts') ? (
                          <>Exp: {formatExpenseDateDisplay(detailItem.expenseDate || detailItem.raw?.claimDate || detailItem.raw?.fromDate || detailItem.date)}</>
                        ) : (
                          <>Applied: {formatAppliedDateTime(detailItem.date)}</>
                        )}
                      </span>
                    </span>
                  </div>
                  <h2 className="text-2xl font-bold tracking-tight text-white m-0">{detailItem.title}</h2>
                  <p className="text-xs text-slate-300 font-medium mt-1 m-0">Reference ID: {detailItem.empCode || detailItem._id}</p>
                </div>

                {/* Modal Body */}
                <div className="p-6 md:p-8 overflow-y-auto space-y-6 flex-1 text-left">
                  {/* Applicant Profile Card */}
                  <div className="bg-slate-50 border border-slate-200/80 rounded-3xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-indigo-600 to-indigo-400 text-white font-bold text-xl flex items-center justify-center shadow-lg shadow-indigo-100">
                        {safeText(detailItem.applicant)?.charAt(0) || 'U'}
                      </div>
                      <div>
                        <h4 className="text-base font-extrabold text-slate-900 m-0">{safeText(detailItem.applicant)}</h4>
                        <p className="text-xs font-bold text-indigo-600 m-0 mt-0.5">
                          {safeText(detailItem.raw?.user?.employeeIdCode || detailItem.raw?.submittedBy?.employeeIdCode || detailItem.raw?.requester?.employeeId || detailItem.empCode || 'Employee')}
                        </p>
                        <div className="flex flex-wrap items-center gap-2 mt-2 text-[11px] font-bold text-slate-500">
                          {safeText(detailItem.companyName) && (
                            <span className="flex items-center gap-1 bg-indigo-50 text-indigo-700 font-extrabold px-2.5 py-1 rounded-xl border border-indigo-100">
                              <Building2 size={12} className="text-indigo-600" />
                              {safeText(detailItem.companyName)}
                            </span>
                          )}
                          {safeText(detailItem.raw?.user?.department || detailItem.raw?.submittedBy?.department || detailItem.raw?.department || detailItem.raw?.requester?.department) && (
                            <span className="flex items-center gap-1 bg-white px-2.5 py-1 rounded-xl border border-slate-200">
                              <Building2 size={12} className="text-slate-400" />
                              {safeText(detailItem.raw?.user?.department || detailItem.raw?.submittedBy?.department || detailItem.raw?.department || detailItem.raw?.requester?.department)}
                            </span>
                          )}
                          {safeText(detailItem.raw?.user?.designation || detailItem.raw?.designation || detailItem.raw?.requester?.designation) && (
                            <span className="flex items-center gap-1 bg-white px-2.5 py-1 rounded-xl border border-slate-200">
                              <Briefcase size={12} className="text-slate-400" />
                              {safeText(detailItem.raw?.user?.designation || detailItem.raw?.designation || detailItem.raw?.requester?.designation)}
                            </span>
                          )}
                          {safeText(detailItem.raw?.user?.email || detailItem.raw?.submittedBy?.email || detailItem.raw?.requester?.email) && (
                            <span className="flex items-center gap-1 bg-white px-2.5 py-1 rounded-xl border border-slate-200">
                              <Mail size={12} className="text-slate-400" />
                              {safeText(detailItem.raw?.user?.email || detailItem.raw?.submittedBy?.email || detailItem.raw?.requester?.email)}
                            </span>
                          )}
                          {safeText(detailItem.raw?.user?.phone || detailItem.raw?.customerPhone || detailItem.raw?.requester?.phone) && (
                            <span className="flex items-center gap-1 bg-white px-2.5 py-1 rounded-xl border border-slate-200">
                              <Phone size={12} className="text-slate-400" />
                              {safeText(detailItem.raw?.user?.phone || detailItem.raw?.customerPhone || detailItem.raw?.requester?.phone)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* ── Category 1: HR Leave Specific Info ── */}
                  {detailItem.type === 'leave' && (
                    <div className="space-y-5">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="p-4 bg-amber-50/60 rounded-2xl border border-amber-200/60">
                          <span className="text-[10px] font-extrabold text-amber-700 block mb-1">Leave Type</span>
                          <span className="text-sm font-extrabold text-amber-950">{detailItem.raw?.leaveType || 'Leave'}</span>
                        </div>
                        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
                          <span className="text-[10px] font-extrabold text-slate-500 block mb-1">Duration</span>
                          <span className="text-sm font-extrabold text-slate-800">
                            {detailItem.raw?.duration || 'Full Day'}
                            {detailItem.raw?.startTime ? ` (${detailItem.raw.startTime} - ${detailItem.raw.endTime || ''})` : ''}
                          </span>
                        </div>
                        <div className="p-4 bg-indigo-50/60 rounded-2xl border border-indigo-200/60">
                          <span className="text-[10px] font-extrabold text-indigo-700 block mb-1">Total Days</span>
                          <span className="text-sm font-extrabold text-indigo-950">
                            {detailItem.raw?.durationDays || (detailItem.raw?.duration === 'Half Day' ? 0.5 : 1)} Day(s)
                          </span>
                        </div>
                      </div>

                      <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                        <span className="text-[10px] font-extrabold text-slate-400 block">Requested Leave Dates</span>
                        <div className="flex items-center gap-3 text-xs font-bold text-slate-800">
                          <Calendar size={16} className="text-indigo-600" />
                          <span>
                            {new Date(detailItem.raw?.startDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', weekday: 'short' })}
                          </span>
                          <span className="text-slate-400">→</span>
                          <span>
                            {new Date(detailItem.raw?.endDate || detailItem.raw?.startDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', weekday: 'short' })}
                          </span>
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[11px] font-extrabold text-slate-400 tracking-wider">Leave Application Reason</label>
                        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
                          <p className="text-xs font-medium text-slate-700 leading-relaxed">
                            "{detailItem.raw?.reason || 'No specific reason provided.'}"
                          </p>
                        </div>
                      </div>

                      {detailItem.raw?.appliedOn && (
                        <div className="flex justify-between items-center text-[11px] text-slate-400 font-bold px-1">
                          <span>Applied on: {new Date(detailItem.raw.appliedOn).toLocaleString('en-GB')}</span>
                          <span className="px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 font-extrabold">STATUS: PENDING</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── Category 2: Expense Claim Specific Info ── */}
                  {(detailItem.type === 'expense' || detailItem.type === 'accounts_expense' || detailItem.type === 'hr_expense' || detailItem.type === 'expense_history') && (
                    <div className="space-y-5">
                      {/* If History Item, Show Decision Banner */}
                      {detailItem.isHistory && (
                        <div className={`p-4 rounded-2xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${detailItem.isRejected ? 'bg-rose-50/90 border-rose-200 text-rose-900' : 'bg-emerald-50/90 border-emerald-200 text-emerald-900'}`}>
                          <div className="flex items-center gap-3">
                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-white ${detailItem.isRejected ? 'bg-rose-600 shadow-md shadow-rose-200' : 'bg-emerald-600 shadow-md shadow-emerald-200'}`}>
                              {detailItem.isRejected ? <XCircle size={20} /> : <CheckCircle2 size={20} />}
                            </div>
                            <div>
                              <span className="text-[10px] font-extrabold tracking-wider block opacity-75">Decision Status</span>
                              <span className="text-sm font-extrabold">{detailItem.statusBadge}</span>
                            </div>
                          </div>
                          <div className="text-left sm:text-right text-xs">
                            <span className="block font-bold opacity-75">{detailItem.isRejected ? 'Decision Reason / Remarks:' : 'Settlement & Payment Remarks:'}</span>
                            <span className="font-extrabold">{detailItem.reason || (detailItem.isRejected ? 'Rejected' : 'Approved & Paid')}</span>
                            {detailItem.isApproved && (
                              <span className="block text-[11px] font-extrabold text-emerald-700 mt-0.5">
                                Disbursed: ₹{detailItem.raw?.disbursement?.paidAmount || detailItem.raw?.paidAmount || detailItem.raw?.payableAmount || detailItem.raw?.grandAllowed || 0}
                              </span>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Applied Date Card */}
                      <div className="p-3.5 bg-indigo-50/70 rounded-2xl border border-indigo-100 flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="p-2 rounded-xl bg-white text-indigo-600 shadow-2xs border border-indigo-100">
                            <Clock size={16} />
                          </div>
                          <div>
                            <span className="text-[10px] font-extrabold text-indigo-500 block">Claim Applied Date & Time</span>
                            <span className="text-xs font-bold text-slate-900">{formatAppliedDateTime(detailItem.date)}</span>
                          </div>
                        </div>
                        <span className="text-[10px] font-bold px-2.5 py-1 rounded-lg bg-indigo-600 text-white shadow-xs">
                          {detailItem.raw?.claimNumber || detailItem.empCode || 'CLAIM'}
                        </span>
                      </div>

                      {/* Full Payment Request Banner / Details */}
                      {(detailItem.raw?.fullPayment?.requested || detailItem.raw?.fullPaymentRequested) && (
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
                            <span className={`px-2.5 py-0.5 rounded-lg text-[10px] font-extrabold border ${detailItem.raw.fullPayment?.status === 'APPROVED' || detailItem.raw.fullPaymentApproved
                              ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                              : detailItem.raw.fullPayment?.status === 'REJECTED'
                                ? 'bg-rose-100 text-rose-800 border-rose-300'
                                : 'bg-amber-100 text-amber-900 border-amber-300'
                              }`}>
                              {detailItem.raw.fullPayment?.status || (detailItem.raw.fullPaymentApproved ? 'APPROVED' : 'PENDING APPROVAL')}
                            </span>
                          </div>

                          {/* Reason for Full Payment */}
                          <div className="text-xs text-slate-800 bg-white/80 p-3 rounded-xl border border-orange-200/70">
                            <span className="font-extrabold text-orange-950">Employee Reason: </span>
                            <span className="font-medium text-slate-700">
                              {detailItem.raw.fullPayment?.reason || detailItem.raw.fullPaymentReason || 'Full reimbursement requested.'}
                            </span>
                          </div>

                          {/* Decision Trail if Approved or Rejected */}
                          {detailItem.raw.fullPayment?.decidedBy && (
                            <div className="text-[11px] text-slate-600 bg-orange-100/50 px-3 py-1.5 rounded-lg border border-orange-200/50">
                              <span className="font-bold text-orange-900">Decision by: </span>
                              {detailItem.raw.fullPayment.decidedByName || 'Admin'}
                              {detailItem.raw.fullPayment.decisionRemarks && (
                                <span className="ml-1 text-slate-700">("{detailItem.raw.fullPayment.decisionRemarks}")</span>
                              )}
                            </div>
                          )}

                          {/* Supporting Approval Proofs */}
                          {Array.isArray(detailItem.raw.fullPayment?.proofs || detailItem.raw.fullPaymentProofs) &&
                            (detailItem.raw.fullPayment?.proofs || detailItem.raw.fullPaymentProofs).length > 0 && (
                              <div className="space-y-1.5 pt-1">
                                <span className="text-[10px] font-extrabold text-orange-950 tracking-wider block">
                                  ⚡ Full Payment Proofs ({(detailItem.raw.fullPayment?.proofs || detailItem.raw.fullPaymentProofs).length})
                                </span>
                                <div className="flex flex-wrap gap-2">
                                  {(detailItem.raw.fullPayment?.proofs || detailItem.raw.fullPaymentProofs).map((proof, pIdx) => (
                                    <a
                                      key={pIdx}
                                      href={proof.url || proof.uri}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-orange-100 border border-orange-300 rounded-xl text-[11px] font-extrabold text-orange-900 transition-all shadow-sm"
                                      title="Click to open full payment proof document"
                                    >
                                      <span>⚡ {proof.name || `Full Payment Proof #${pIdx + 1}`}</span>
                                    </a>
                                  ))}
                                </div>
                              </div>
                            )}
                        </div>
                      )}

                      {/* Trip Information / Expense Purpose Details */}
                      {(() => {
                        const claimType = (detailItem.raw?.claimType || '').toUpperCase().trim();
                        const showCityClaimTypes = ['TRAVEL', 'TOUR', 'TRIP', 'LODGING', 'FOOD', 'TRAVEL_EXPENSE', 'TOUR_EXPENSE', 'FOOD_EXPENSE', 'LODGING_EXPENSE'];
                        const isShowCityClaim = showCityClaimTypes.includes(claimType);
                        const expensePurpose = detailItem.raw?.trip?.purpose || detailItem.raw?.purpose || (detailItem.raw?.employeeClaims?.[0]?.items?.[0]?.description) || '';
                        const customerName = detailItem.raw?.trip?.customerName || detailItem.raw?.customerName;

                        if (isShowCityClaim && (detailItem.raw?.trip?.destination || customerName || expensePurpose)) {
                          return (
                            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                              <span className="text-[10px] font-extrabold text-slate-400 block">Trip Information</span>
                              <div className="grid grid-cols-2 gap-2 text-xs">
                                {customerName && (
                                  <div>
                                    <span className="text-slate-400 font-bold">Customer: </span>
                                    <span className="font-extrabold text-slate-800">{customerName}</span>
                                  </div>
                                )}
                                {detailItem.raw?.trip?.destination && (
                                  <div>
                                    <span className="text-slate-400 font-bold">Destination: </span>
                                    <span className="font-extrabold text-slate-800">{detailItem.raw.trip.destination} (Class {detailItem.raw.trip.destinationClass || 'A'})</span>
                                  </div>
                                )}
                                {detailItem.raw?.trip?.travelMode && (
                                  <div>
                                    <span className="text-slate-400 font-bold">Mode: </span>
                                    <span className="font-extrabold text-slate-800">{detailItem.raw.trip.travelMode}</span>
                                  </div>
                                )}
                                {expensePurpose && (
                                  <div className="col-span-2">
                                    <span className="text-slate-400 font-bold">Purpose: </span>
                                    <span className="font-extrabold text-slate-800">{expensePurpose}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        }

                        // Non-travel / Local Conveyance / Other claims: do NOT show destination city/class, but DO show Purpose of Expense
                        return (
                          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                            <span className="text-[10px] font-extrabold text-slate-400 block">Expense Details & Purpose</span>
                            <div className="grid grid-cols-2 gap-2 text-xs">
                              <div className="col-span-2">
                                <span className="text-slate-400 font-bold">Purpose of Expense: </span>
                                <span className="font-extrabold text-slate-800">{expensePurpose || 'General Business Expense'}</span>
                              </div>
                              {customerName && (
                                <div>
                                  <span className="text-slate-400 font-bold">Customer / Client: </span>
                                  <span className="font-extrabold text-slate-800">{customerName}</span>
                                </div>
                              )}
                              <div>
                                <span className="text-slate-400 font-bold">Claim Type: </span>
                                <span className="font-extrabold text-slate-800">
                                  {claimType === 'CONVEYANCE'
                                    ? 'Local Conveyance'
                                    : (((detailItem.raw?.entries?.[0]?.otherSubType || detailItem.raw?.employeeClaims?.[0]?.items?.[0]?.otherSubType || detailItem.raw?.otherSubType || '').toUpperCase() === 'PURCHASE' && (claimType === 'OTHER' || !claimType))
                                      ? 'Purchase Claim'
                                      : (detailItem.raw?.claimType || 'Other Expense'))}
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })()}

                      {/* ── Calculation Box (Breakdown Format Explanation) & Combined Items ── */}
                      {(() => {
                        const raw = detailItem.raw;
                        if (!raw) return null;

                        const ecList = Array.isArray(raw.employeeClaims) ? raw.employeeClaims : [];
                        const empNames = ecList.map(ec => ec.employee?.name).filter(Boolean);
                        const numEmployees = raw.numberOfEmployees || raw.employeeCount || empNames.length || 1;
                        const grandReq = raw.grandRequested ?? raw.requestedAmount ?? 0;
                        const grandAllow = raw.grandAllowed ?? raw.allowedAmount ?? 0;
                        const grandExc = raw.grandExcess ?? raw.excessAmount ?? 0;
                        const grandLimit = raw.grandPolicyLimit ?? raw.policyLimit ?? (ecList[0]?.items?.[0]?.policyLimit || grandAllow);
                        const grandFormula = raw.formula || ecList[0]?.items?.[0]?.formula || ecList[0]?.items?.[0]?.calculationBreakdown?.formula;
                        const hasExcess = grandExc > 0;

                        // Identify Logging (Lodging) vs Food claim types
                        const claimMode = (raw.claimMode || '').toUpperCase().trim();
                        const claimTypeUpper = (raw.claimType || '').toUpperCase().trim();
                        const entries = Array.isArray(raw.entries) ? raw.entries : [];
                        const firstItemType = (ecList[0]?.items?.[0]?.expenseType || '').toUpperCase().trim();

                        const isLogging = claimMode === 'LOGGING' ||
                          claimTypeUpper === 'LODGING' ||
                          claimTypeUpper === 'LOGGING' ||
                          claimTypeUpper === 'LODGING_EXPENSE' ||
                          claimTypeUpper === 'LOGGING_EXPENSE' ||
                          entries.some(e => ['LODGING', 'LOGGING'].includes((e.expenseType || '').toUpperCase().trim())) ||
                          firstItemType === 'LODGING' || firstItemType === 'LOGGING';

                        const isFood = claimTypeUpper === 'FOOD' ||
                          claimTypeUpper === 'FOOD_EXPENSE' ||
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
                            const name = ec.employee?.name || (numEmployees > 1 ? `Employee #${idx + 1}` : (raw.submittedByName || 'Employee'));
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
                                ? `${name}: ₹${perDay}/day (Total: ₹${totalEmpLimit} for ${days} days)`
                                : `${name}: ₹${perDay}/day`;
                            } else {
                              return perDay > 0 ? `${name}: ₹${perDay}/day` : `${name}: Actuals`;
                            }
                          });
                        } else {
                          const name = raw.submittedByName || 'Employee';
                          let perDay = 0;
                          if (isLogging && days > 0 && grandLimit > 0) {
                            perDay = Math.round(grandLimit / days);
                          } else {
                            perDay = grandLimit;
                          }
                          empLines = [
                            isLogging
                              ? (days > 1 ? `${name}: ₹${perDay}/day (Total: ₹${grandLimit} for ${days} days)` : `${name}: ₹${perDay}/day`)
                              : (perDay > 0 ? `${name}: ₹${perDay}/day` : `${name}: Actuals`)
                          ];
                        }

                        let combinedLimitText = '';
                        if (isLogging) {
                          combinedLimitText = numEmployees > 1
                            ? `Combined Whole Claim Limit: ₹${grandLimit} (${days} day${days > 1 ? 's' : ''})`
                            : `Whole Claim Limit: ₹${grandLimit} (${days} day${days > 1 ? 's' : ''})`;
                        } else if (isFood) {
                          combinedLimitText = numEmployees > 1
                            ? `Combined daily limit: ₹${grandLimit}`
                            : `Daily policy limit: ₹${grandLimit}`;
                        } else {
                          combinedLimitText = `Policy limit: ₹${grandLimit}`;
                        }

                        let calcOutcomeText = '';
                        if (hasExcess) {
                          const perEmpExcessText = numEmployees > 1 ? ` (₹${Math.round(grandExc / numEmployees)} excess per employee)` : '';
                          calcOutcomeText = `Claimed bill: ₹${grandReq}. Therefore, ₹${grandAllow} is allowed and ₹${grandExc} is excess beyond policy limit${perEmpExcessText}.`;
                        } else {
                          const limitLabel = isLogging
                            ? (numEmployees > 1 ? 'combined whole claim limit' : 'whole claim limit')
                            : (numEmployees > 1 ? 'combined daily limit' : 'daily policy limit');
                          calcOutcomeText = `Claimed bill: ₹${grandReq}. Since your bill is within your ${limitLabel}, ₹${grandAllow} is fully allowed.`;
                        }

                        const foodOrLoggingExplanation = [
                          `Individual limits per day:\n• ${empLines.join('\n• ')}`,
                          `${combinedLimitText}.`,
                          calcOutcomeText
                        ].join('\n\n');

                        const serverExplanation = raw.plainExplanation || ecList[0]?.items?.[0]?.plainExplanation || ecList[0]?.items?.[0]?.calculationBreakdown?.plainExplanation;

                        let grandExplanation = '';
                        if (isLoggingOrFood) {
                          if (serverExplanation && serverExplanation.includes('Individual limits per day')) {
                            grandExplanation = serverExplanation;
                          } else {
                            grandExplanation = foodOrLoggingExplanation;
                          }
                        } else if (serverExplanation) {
                          grandExplanation = serverExplanation;
                        } else {
                          const isNoLimitType = ['CONVEYANCE', 'TRAVEL', 'OTHER'].includes(claimTypeUpper);
                          if (isNoLimitType) {
                            grandExplanation = `Claimed bill: ₹${grandReq}. All payment of ₹${grandAllow} is fully allowed.`;
                          } else {
                            grandExplanation = hasExcess
                              ? `Policy limit is ₹${grandLimit} and claimed value is ₹${grandReq}. Therefore, ₹${grandAllow} is allowed and ₹${grandExc} is excess.`
                              : `Policy limit is ₹${grandLimit} and claimed value is ₹${grandReq}. Since it is within the limit, ₹${grandAllow} is fully allowed.`;
                          }
                        }

                        // Build combined entries list (combining all employee shares per entry)
                        const entriesList = (Array.isArray(raw.entries) && raw.entries.length > 0)
                          ? raw.entries
                          : (Array.isArray(ecList[0]?.items) && ecList[0].items.length > 0 ? ecList[0].items : null);

                        const combinedItems = entriesList
                          ? entriesList.map((entry, idx) => {
                            const firstItem = ecList[0]?.items?.[idx] || {};
                            const expenseType = (entry.expenseType || firstItem.expenseType || raw.claimType || 'Expense').toUpperCase();
                            const isOther = expenseType === 'OTHER';
                            const isConv = expenseType === 'CONVEYANCE';
                            const isPurchase = isOther && ((entry.otherSubType || firstItem.otherSubType || '').toUpperCase() === 'PURCHASE');
                            const expenseTypeName = firstItem.expenseTypeName || (
                              isConv ? 'Local Conveyance' :
                                expenseType === 'FOOD' ? 'Food' :
                                  expenseType === 'TRAVEL' ? 'Travel' :
                                    (expenseType === 'LODGING' || expenseType === 'LOGGING') ? 'Lodging' :
                                      isOther ? (isPurchase ? 'Purchase' : 'Other Expense') : expenseType
                            );
                            const expenseDate = entry.expenseDate || firstItem.expenseDate || raw.claimDate || raw.date;
                            const requestedAmount = Number(entry.requestedAmount) || ecList.reduce((s, ec) => s + (Number(ec.items?.[idx]?.requestedAmount) || 0), 0);
                            const allowedAmount = ecList.reduce((s, ec) => s + (Number(ec.items?.[idx]?.allowedAmount) || 0), 0) || requestedAmount;
                            const excessAmount = ecList.reduce((s, ec) => s + (Number(ec.items?.[idx]?.excessAmount) || 0), 0);
                            const policyLimit = ecList.reduce((s, ec) => s + (Number(ec.items?.[idx]?.policyLimit) || 0), 0);
                            const itemHasExcess = excessAmount > 0;
                            const limitDisplay = (expenseType === 'CONVEYANCE' || expenseType === 'TRAVEL' || expenseType === 'OTHER')
                              ? (firstItem.limitText || 'Actuals (Fully Allowed)')
                              : (firstItem.limitText || (policyLimit > 0 ? `₹${policyLimit}` : 'Actuals (Fully Allowed)'));
                            const attachments = entry.receipts || entry.attachments || firstItem.attachments || [];

                            const itemFormula = entry.formula || firstItem.formula || firstItem.calculationBreakdown?.formula || (
                              isConv
                                ? ((entry.distanceKm || firstItem.distanceKm) ? `${entry.distanceKm || firstItem.distanceKm} km x ₹${firstItem.calculationBreakdown?.sourceValues?.rate || 10}/km` : 'Actuals (Fully Allowed)')
                                : expenseType === 'TRAVEL'
                                  ? 'Travel fare (Fully Allowed)'
                                  : isOther
                                    ? (isPurchase ? 'Purchase (Fully Allowed)' : 'Actual amount (Fully Allowed)')
                                    : expenseType === 'FOOD'
                                      ? (firstItem.limitText ? `Daily limit: ${firstItem.limitText}` : 'MIN(actual, daily entitlement)')
                                      : (expenseType === 'LODGING' || expenseType === 'LOGGING')
                                        ? (firstItem.limitText ? `Stay budget: ${firstItem.limitText}` : 'Lodging policy entitlement')
                                        : 'Actuals (Fully Allowed)'
                            );

                            return {
                              expenseType,
                              expenseTypeName,
                              expenseDate,
                              requestedAmount,
                              allowedAmount,
                              excessAmount,
                              policyLimit,
                              hasExcess: itemHasExcess,
                              limitDisplay,
                              formula: itemFormula,
                              description: entry.remark || entry.description || firstItem.description,
                              distanceKm: isConv ? (entry.distanceKm || firstItem.distanceKm) : undefined,
                              vehicle: isConv ? (entry.vehicle || firstItem.vehicle) : undefined,
                              otherSubType: isOther ? (entry.otherSubType || firstItem.otherSubType) : undefined,
                              barcodeNumber: isOther ? (entry.barcodeNumber || firstItem.barcodeNumber) : undefined,
                              quantity: isOther ? (entry.quantity || firstItem.quantity) : undefined,
                              attachments,
                            };
                          })
                          : (() => {
                            const singleType = (ecList[0]?.items?.[0]?.expenseType || raw.claimType || 'Expense').toUpperCase();
                            const singleIsOther = singleType === 'OTHER';
                            const singleIsConv = singleType === 'CONVEYANCE';
                            const singleIsPurchase = singleIsOther && ((ecList[0]?.items?.[0]?.otherSubType || raw.entries?.[0]?.otherSubType || raw.otherSubType || '').toUpperCase() === 'PURCHASE');
                            return [{
                              expenseType: singleType,
                              expenseTypeName: ecList[0]?.items?.[0]?.expenseTypeName || (
                                singleIsConv ? 'Local Conveyance' :
                                  singleType === 'FOOD' ? 'Food' :
                                    singleType === 'TRAVEL' ? 'Travel' :
                                      (singleType === 'LODGING' || singleType === 'LOGGING') ? 'Lodging' :
                                        singleIsOther ? (singleIsPurchase ? 'Purchase' : 'Other Expense') : (raw.claimType || 'Expense')
                              ),
                              expenseDate: ecList[0]?.items?.[0]?.expenseDate || raw.claimDate || raw.date || raw.fromDate,
                              requestedAmount: grandReq,
                              allowedAmount: grandAllow,
                              excessAmount: grandExc,
                              policyLimit: grandLimit,
                              hasExcess,
                              limitDisplay: (singleIsConv || singleType === 'TRAVEL' || singleIsOther)
                                ? (ecList[0]?.items?.[0]?.limitText || 'Actuals (Fully Allowed)')
                                : (ecList[0]?.items?.[0]?.limitText || (grandLimit > 0 ? `₹${grandLimit}` : 'Actuals (Fully Allowed)')),
                              formula: raw.formula || ecList[0]?.items?.[0]?.formula || ecList[0]?.items?.[0]?.calculationBreakdown?.formula,
                              description: raw.remark || ecList[0]?.items?.[0]?.description,
                              distanceKm: singleIsConv ? (ecList[0]?.items?.[0]?.distanceKm || raw.entries?.[0]?.distanceKm) : undefined,
                              vehicle: singleIsConv ? (ecList[0]?.items?.[0]?.vehicle || raw.entries?.[0]?.vehicle) : undefined,
                              otherSubType: singleIsOther ? (ecList[0]?.items?.[0]?.otherSubType || raw.entries?.[0]?.otherSubType || raw.otherSubType) : undefined,
                              barcodeNumber: singleIsOther ? (ecList[0]?.items?.[0]?.barcodeNumber || raw.entries?.[0]?.barcodeNumber || raw.barcodeNumber) : undefined,
                              quantity: singleIsOther ? (ecList[0]?.items?.[0]?.quantity || raw.entries?.[0]?.quantity || raw.quantity) : undefined,
                              attachments: raw.receipts || ecList[0]?.items?.[0]?.attachments || [],
                            }];
                          })();

                        // Extract applied rule for each entry / type
                        const appliedRules = combinedItems
                          .map((it, idx) => {
                            const formula = it.formula || raw.formula || ecList[0]?.items?.[idx]?.formula || ecList[0]?.items?.[idx]?.calculationBreakdown?.formula;
                            const title = combinedItems.length > 1
                              ? `Entry #${idx + 1} (${it.expenseTypeName})`
                              : it.expenseTypeName;
                            return {
                              title,
                              formula,
                            };
                          })
                          .filter(r => Boolean(r.formula));

                        return (
                          <div className="space-y-4">
                            {/* 1. Calculation Box (Breakdown Format Explanation) */}
                            <div className={`p-4 rounded-2xl border space-y-3 ${hasExcess ? 'bg-rose-50/70 border-rose-200 text-rose-950' : 'bg-emerald-50/70 border-emerald-200 text-emerald-950'}`}>
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
                              <div className={`grid grid-cols-2 ${detailItem.isHistory && detailItem.isApproved ? 'sm:grid-cols-5' : 'sm:grid-cols-4'} gap-2.5 p-3 bg-white rounded-xl border border-slate-200 text-center shadow-2xs`}>
                                <div>
                                  <span className="text-[9px] font-extrabold text-slate-400 block">Total Claimed</span>
                                  <span className="text-sm font-extrabold text-slate-800">₹{grandReq}</span>
                                </div>
                                <div>
                                  <span className="text-[9px] font-extrabold text-indigo-500 block">Policy Limit</span>
                                  <span className="text-sm font-extrabold text-indigo-700">{grandLimit > 0 ? `₹${grandLimit}` : 'Actuals'}</span>
                                </div>
                                <div>
                                  <span className="text-[9px] font-extrabold text-emerald-600 block">Total Allowed</span>
                                  <span className="text-sm font-extrabold text-emerald-600">₹{grandAllow}</span>
                                </div>
                                <div>
                                  <span className="text-[9px] font-extrabold text-rose-500 block">Total Excess</span>
                                  <span className={`text-sm font-extrabold ${hasExcess ? 'text-rose-600' : 'text-slate-400'}`}>
                                    ₹{grandExc}
                                  </span>
                                </div>
                                {detailItem.isHistory && detailItem.isApproved && (
                                  <div>
                                    <span className="text-[9px] font-extrabold text-indigo-600 block">Disbursed / Paid</span>
                                    <span className="text-sm font-extrabold text-indigo-700">
                                      ₹{detailItem.raw?.disbursement?.paidAmount || detailItem.raw?.paidAmount || detailItem.raw?.payableAmount || detailItem.raw?.grandAllowed || 0}
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
                                        ₹{grandLimit} {isLogging ? `(${days} days)` : ''}
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
                                    💡 {grandExplanation}
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

                            {/* 2. Itemized Claim Entries (Combined format across employees) */}
                            <div className="space-y-3">
                              <div className="flex items-center justify-between">
                                <span className="text-[11px] font-extrabold text-slate-400 tracking-wider">
                                  Itemized Claim Entries ({combinedItems.length})
                                </span>
                                <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-200">
                                  Combined Format {numEmployees > 1 ? `(${numEmployees} Employees)` : ''}
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
                                              {new Date(it.expenseDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                                            </span>
                                          )}
                                          {numEmployees > 1 && (
                                            <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 text-[10px] font-extrabold">
                                              👥 {numEmployees} Employees
                                            </span>
                                          )}
                                          {it.expenseType === 'OTHER' && it.otherSubType && (
                                            <span className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold border ${it.otherSubType === 'PURCHASE'
                                              ? 'bg-amber-50 text-amber-700 border-amber-200'
                                              : 'bg-blue-50 text-blue-700 border-blue-200'
                                              }`}>
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
                                        {(it.description || it.note) && (
                                          <span className="text-[11px] text-slate-500 block mt-0.5">{it.description || it.note}</span>
                                        )}
                                        {it.distanceKm ? (
                                          <span className="text-[10px] text-indigo-600 font-bold block mt-0.5">
                                            🚗 {it.distanceKm} km ({it.vehicle || 'Vehicle'})
                                          </span>
                                        ) : null}
                                      </div>

                                      <div className="flex items-center gap-2">
                                        <span className={`px-2.5 py-1 rounded-xl text-[10px] font-extrabold border ${it.hasExcess
                                          ? 'bg-rose-50 text-rose-700 border-rose-200'
                                          : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                          }`}>
                                          {it.hasExcess ? `₹${it.excessAmount} Excess` : 'Fully Allowed'}
                                        </span>
                                      </div>
                                    </div>

                                    {/* Figures Grid */}
                                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 p-2.5 bg-slate-50 rounded-xl border border-slate-100 text-center">
                                      <div>
                                        <span className="text-[9px] font-extrabold text-slate-400 block">Claimed</span>
                                        <span className="text-xs font-bold text-slate-800">₹{it.requestedAmount || 0}</span>
                                      </div>
                                      <div>
                                        <span className="text-[9px] font-extrabold text-indigo-500 block">Policy Limit</span>
                                        <span className="text-xs font-bold text-indigo-700">{it.limitDisplay}</span>
                                      </div>
                                      <div>
                                        <span className="text-[9px] font-extrabold text-emerald-600 block">Allowed</span>
                                        <span className="text-xs font-bold text-emerald-600">₹{it.allowedAmount || 0}</span>
                                      </div>
                                      {it.hasExcess && (
                                        <div>
                                          <span className="text-[9px] font-extrabold text-rose-500 block">Excess</span>
                                          <span className="text-xs font-bold text-rose-600">₹{it.excessAmount || 0}</span>
                                        </div>
                                      )}
                                    </div>

                                    {/* Attached Receipts & Proofs */}
                                    {it.attachments && it.attachments.length > 0 && (
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
                          </div>
                        );
                      })()}

                      {/* ── Separate Proofs Sections: Bill Proofs, Service Reports, and Full Payment Proofs ── */}
                      {(() => {
                        const { billProofs, serviceReports, fullPaymentProofs } = getClaimProofs(detailItem.raw);

                        return (
                          <div className="space-y-4">
                            {/* 🧾 Bill Proofs Section */}
                            {billProofs.length > 0 && (
                              <div className="p-4 bg-indigo-50/50 rounded-2xl border border-indigo-200/70 space-y-3">
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-extrabold text-indigo-950 tracking-wider flex items-center gap-1.5">
                                    <span>🧾</span> Bill Proofs ({billProofs.length})
                                  </span>
                                  <span className="text-[10px] font-bold text-indigo-600 bg-white px-2 py-0.5 rounded-md border border-indigo-200">
                                    Receipt / Bill Documents
                                  </span>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                  {billProofs.map((proof, idx) => {
                                    const pUrl = proof.url || proof.uri;
                                    const pName = proof.name || `Bill Proof #${idx + 1}`;
                                    const isPdf = proof.type === 'application/pdf' || (pName && pName.toLowerCase().endsWith('.pdf'));
                                    return (
                                      <div key={idx} className="p-2.5 bg-white rounded-xl border border-slate-200 hover:border-indigo-300 transition-all flex items-center justify-between gap-2 shadow-2xs">
                                        <div className="flex items-center gap-2.5 min-w-0">
                                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold shrink-0 ${isPdf ? 'bg-rose-50 text-rose-600 border border-rose-200' : 'bg-indigo-50 text-indigo-600 border border-indigo-200'}`}>
                                            {isPdf ? '📄' : '🧾'}
                                          </div>
                                          <div className="min-w-0">
                                            <span className="text-xs font-bold text-slate-800 block truncate" title={pName}>
                                              {pName}
                                            </span>
                                            <span className="text-[10px] text-slate-400 font-medium block">
                                              Bill Proof Document {proof.size ? `• ${(proof.size / 1024).toFixed(0)} KB` : ''}
                                            </span>
                                          </div>
                                        </div>
                                        {pUrl && (
                                          <a
                                            href={pUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-[11px] font-bold shrink-0 transition-colors"
                                            title="Click to view bill proof"
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

                            {/* 📑 Service Reports Section */}
                            {serviceReports.length > 0 && (
                              <div className="p-4 bg-amber-50/60 rounded-2xl border border-amber-200 space-y-3">
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-extrabold text-amber-950 tracking-wider flex items-center gap-1.5">
                                    <span>📑</span> Service Reports ({serviceReports.length})
                                  </span>
                                  <span className="text-[10px] font-bold text-amber-700 bg-white px-2 py-0.5 rounded-md border border-amber-200">
                                    Tour / Service Reports
                                  </span>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                  {serviceReports.map((sr, srIdx) => {
                                    const srUrl = sr.url || sr.uri;
                                    const srName = sr.name || `Service Report #${srIdx + 1}`;
                                    const isPdf = sr.type === 'application/pdf' || (srName && srName.toLowerCase().endsWith('.pdf'));
                                    const isOdf = (srName && srName.toLowerCase().match(/\.(odt|ods|odp)$/)) || (sr.type && sr.type.includes('opendocument'));
                                    return (
                                      <div key={srIdx} className="p-2.5 bg-white rounded-xl border border-amber-200 hover:border-amber-300 transition-all flex items-center justify-between gap-2 shadow-2xs">
                                        <div className="flex items-center gap-2.5 min-w-0">
                                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold shrink-0 ${isPdf ? 'bg-rose-50 text-rose-600 border border-rose-200' : isOdf ? 'bg-amber-100 text-amber-800 border border-amber-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
                                            {isPdf ? '📄' : isOdf ? '📑' : '📝'}
                                          </div>
                                          <div className="min-w-0">
                                            <span className="text-xs font-bold text-slate-800 block truncate" title={srName}>
                                              {srName}
                                            </span>
                                            <span className="text-[10px] text-slate-400 font-medium block">
                                              Service Report Document {sr.size ? `• ${(sr.size / 1024).toFixed(0)} KB` : ''}
                                            </span>
                                          </div>
                                        </div>
                                        {srUrl && (
                                          <a
                                            href={srUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-lg text-[11px] font-bold shrink-0 transition-colors"
                                            title="Click to view service report"
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

                            {/* ⚡ Full Payment Proofs Section */}
                            {fullPaymentProofs.length > 0 && (
                              <div className="p-4 bg-orange-50/70 rounded-2xl border border-orange-200 space-y-3">
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-extrabold text-orange-950 tracking-wider flex items-center gap-1.5">
                                    <span>⚡</span> Full Payment Proofs ({fullPaymentProofs.length})
                                  </span>
                                  <span className="text-[10px] font-bold text-orange-700 bg-white px-2 py-0.5 rounded-md border border-orange-200">
                                    Supporting Approvals
                                  </span>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                  {fullPaymentProofs.map((proof, idx) => {
                                    const pUrl = proof.url || proof.uri;
                                    const pName = proof.name || `Full Payment Proof #${idx + 1}`;
                                    const isPdf = proof.type === 'application/pdf' || (pName && pName.toLowerCase().endsWith('.pdf'));
                                    return (
                                      <div key={idx} className="p-2.5 bg-white rounded-xl border border-orange-200 hover:border-orange-300 transition-all flex items-center justify-between gap-2 shadow-2xs">
                                        <div className="flex items-center gap-2.5 min-w-0">
                                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold shrink-0 ${isPdf ? 'bg-rose-50 text-rose-600 border border-rose-200' : 'bg-orange-50 text-orange-600 border border-orange-200'}`}>
                                            {isPdf ? '📄' : '⚡'}
                                          </div>
                                          <div className="min-w-0">
                                            <span className="text-xs font-bold text-slate-800 block truncate" title={pName}>
                                              {pName}
                                            </span>
                                            <span className="text-[10px] text-slate-400 font-medium block">
                                              Full Payment Document {proof.size ? `• ${(proof.size / 1024).toFixed(0)} KB` : ''}
                                            </span>
                                          </div>
                                        </div>
                                        {pUrl && (
                                          <a
                                            href={pUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="px-2.5 py-1 bg-orange-50 hover:bg-orange-100 text-orange-800 rounded-lg text-[11px] font-bold shrink-0 transition-colors"
                                            title="Click to view full payment proof"
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
                          </div>
                        );
                      })()}

                      {/* Accounts Payment & Disbursement Record */}
                      {detailItem.isHistory && detailItem.isApproved && (detailItem.raw?.disbursement || detailItem.raw?.paidAmount || detailItem.raw?.disbursedAt) && (
                        <div className="p-4 bg-emerald-50/70 rounded-2xl border border-emerald-200 space-y-2">
                          <span className="text-[10px] font-extrabold text-emerald-800 tracking-wider block">Accounts Payment & Settlement Record</span>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                            <div>
                              <span className="text-emerald-600 font-bold block text-[10px]">Disbursed Amount</span>
                              <span className="font-extrabold text-emerald-950 text-sm">₹{detailItem.raw?.disbursement?.paidAmount || detailItem.raw?.paidAmount || detailItem.raw?.grandAllowed || 0}</span>
                            </div>
                            <div>
                              <span className="text-emerald-600 font-bold block text-[10px]">Payment Method</span>
                              <span className="font-extrabold text-emerald-950">{detailItem.raw?.disbursement?.paymentMethod || 'Bank Transfer (NEFT)'}</span>
                            </div>
                            <div>
                              <span className="text-emerald-600 font-bold block text-[10px]">UTR / Ref Number</span>
                              <span className="font-extrabold text-emerald-950 font-mono">{detailItem.raw?.disbursement?.utr || 'N/A'}</span>
                            </div>
                            <div>
                              <span className="text-emerald-600 font-bold block text-[10px]">Settled On</span>
                              <span className="font-extrabold text-emerald-950">{formatAppliedDateTime(detailItem.raw?.disbursement?.paidAt || detailItem.raw?.disbursedAt || detailItem.date)}</span>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Review Audit Trail & Decision History */}
                      {Array.isArray(detailItem.raw?.approvalHistory) && detailItem.raw.approvalHistory.length > 0 && (
                        <div className="space-y-2.5">
                          <span className="text-[11px] font-extrabold text-slate-400 tracking-wider">Review Audit Trail & Decision History</span>
                          <div className="space-y-2">
                            {detailItem.raw.approvalHistory.map((step, sIdx) => {
                              const isStepReject = String(step.action || '').toLowerCase().includes('reject');
                              const isStepDisburse = String(step.action || '').toLowerCase().includes('disburse') || String(step.action || '').toLowerCase().includes('paid');
                              const stepBadgeColor = isStepReject
                                ? 'bg-rose-100 text-rose-800 border-rose-200'
                                : isStepDisburse
                                  ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                                  : 'bg-blue-100 text-blue-800 border-blue-200';

                              return (
                                <div key={sIdx} className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 text-xs space-y-1.5">
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2">
                                      <span className="font-extrabold text-slate-800 text-[10px] tracking-wider">
                                        {step.role || 'Reviewer'}
                                      </span>
                                      <span className={`px-2.5 py-0.5 rounded-lg text-[10px] font-extrabold border ${stepBadgeColor}`}>
                                        {step.action || 'Reviewed'}
                                      </span>
                                    </div>
                                    {step.timestamp && (
                                      <span className="text-[10px] font-bold text-slate-400">
                                        {formatAppliedDateTime(step.timestamp)}
                                      </span>
                                    )}
                                  </div>
                                  {step.remarks && (
                                    <p className="text-[11px] text-slate-700 font-semibold m-0 pl-2 border-l-2 border-slate-300">
                                      <span className="font-bold text-slate-500">Remarks: </span>"{step.remarks}"
                                    </p>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── Category 3: Store Material Info ── */}
                  {detailItem.type === 'material' && (
                    <div className="space-y-4">
                      {/* Materials List */}
                      {detailItem.raw?.materials && detailItem.raw.materials.length > 0 ? (
                        <div className="space-y-2">
                          <span className="text-[11px] font-extrabold text-slate-500 block tracking-wider">
                            Requested Materials Breakdown ({detailItem.raw.materials.length} Item{detailItem.raw.materials.length > 1 ? 's' : ''})
                          </span>
                          <div className="space-y-2.5">
                            {detailItem.raw.materials.map((mat, mIdx) => (
                              <div key={mIdx} className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-2">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div>
                                    <h5 className="text-sm font-extrabold text-slate-900 m-0">{mat.name || 'Material'}</h5>
                                    {mat.description && <p className="text-xs text-slate-500 m-0 mt-0.5">{mat.description}</p>}
                                  </div>
                                  <span className="text-xs font-extrabold px-3 py-1 rounded-xl bg-indigo-50 text-indigo-700 border border-indigo-100">
                                    Qty: {mat.quantity || 1} {mat.unit || 'Nos'}
                                  </span>
                                </div>

                                {/* Barcodes Breakdown if Assigned */}
                                {mat.barcodes && mat.barcodes.length > 0 && (
                                  <div className="pt-2 border-t border-slate-200/60">
                                    <span className="text-[10px] font-bold text-slate-400 block mb-1.5">Assigned Barcode(s):</span>
                                    <div className="flex flex-wrap gap-1.5">
                                      {mat.barcodes.map((bc, bIdx) => {
                                        const bcCode = typeof bc === 'object' ? bc.barcode : bc;
                                        const bcStatus = typeof bc === 'object' ? bc.status : 'Active';
                                        return (
                                          <span key={bIdx} className="inline-flex items-center gap-1 bg-white px-2.5 py-1 rounded-lg border border-slate-200 text-xs font-mono font-bold text-slate-800">
                                            🏷️ {bcCode}
                                            {bcStatus && <span className="text-[9px] font-sans font-extrabold text-emerald-600 bg-emerald-50 px-1.5 py-0.2 rounded">{bcStatus}</span>}
                                          </span>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-3">
                          <div className="p-4 bg-indigo-50/60 rounded-2xl border border-indigo-200/60">
                            <span className="text-[10px] font-extrabold text-indigo-700 block mb-1">Material Name</span>
                            <span className="text-sm font-extrabold text-indigo-950">{detailItem.raw?.materialName || 'Material Item'}</span>
                          </div>
                          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
                            <span className="text-[10px] font-extrabold text-slate-500 block mb-1">Quantity</span>
                            <span className="text-sm font-extrabold text-slate-800">{detailItem.raw?.quantity || 1} {detailItem.raw?.unit || 'units'}</span>
                          </div>
                        </div>
                      )}

                      {/* Metadata Grid */}
                      <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                        <p className="text-slate-500 font-bold m-0">Transaction Ref: <span className="text-slate-800 font-mono font-bold">{detailItem.raw?.transactionId || detailItem.raw?._id}</span></p>
                        {detailItem.raw?.customerName && (
                          <p className="text-slate-500 font-bold m-0">Customer Name: <span className="text-indigo-700 font-extrabold">{detailItem.raw.customerName}</span></p>
                        )}
                        {detailItem.raw?.purpose && (
                          <p className="text-slate-500 font-bold m-0">Purpose: <span className="text-indigo-700 font-extrabold bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-200">{detailItem.raw.purpose}</span></p>
                        )}
                        <p className="text-slate-500 font-bold m-0">Document Type: <span className="text-slate-800">{detailItem.raw?.documentType || 'RDC'} ({detailItem.raw?.documentNumber || 'Auto-assigned'})</span></p>
                        <p className="text-slate-500 font-bold m-0">Priority: <span className="text-indigo-600 font-extrabold capitalize">{detailItem.raw?.priority || 'Normal'}</span></p>
                        <p className="text-slate-500 font-bold m-0">Expected Return: <span className="text-slate-800">{detailItem.raw?.expectedReturnDate ? formatAppliedDateTime(detailItem.raw.expectedReturnDate) : 'Not Specified'}</span></p>
                        <p className="text-slate-500 font-bold m-0">Department: <span className="text-slate-800">{safeText(detailItem.raw?.department) || 'General'}</span></p>
                        <p className="text-slate-500 font-bold m-0">Current Stage: <span className="text-emerald-700 font-extrabold capitalize">{detailItem.raw?.status}</span></p>
                      </div>

                      {/* Purpose / Remarks */}
                      <div className="p-4 bg-indigo-50/40 rounded-2xl border border-indigo-100/80 space-y-1 text-xs">
                        <span className="text-[10px] font-extrabold text-indigo-700 block tracking-wider">Purpose / Remarks</span>
                        <p className="text-slate-700 font-medium m-0">
                          "{detailItem.raw?.description || detailItem.raw?.remarks || detailItem.raw?.purpose || detailItem.raw?.notes || 'No remarks specified'}"
                        </p>
                      </div>

                      {/* Logistics Handover Info */}
                      {(detailItem.raw?.handler || detailItem.raw?.store) && (
                        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                          <p className="text-slate-500 font-bold m-0">Assigned Handler: <span className="text-slate-800 font-extrabold">{safeText(detailItem.raw?.handler?.fullName || detailItem.raw?.handler?.name || detailItem.raw?.handler) || 'Direct Delivery'}</span></p>
                          <p className="text-slate-500 font-bold m-0">Fulfilling Store: <span className="text-slate-800 font-extrabold">{safeText(detailItem.raw?.store?.fullName || detailItem.raw?.store?.name || detailItem.raw?.store) || 'Gokul Shirgaon Store'}</span></p>
                        </div>
                      )}

                      {/* Attached Photo Evidence */}
                      {detailItem.raw?.photos && detailItem.raw.photos.length > 0 && (
                        <div className="space-y-2">
                          <span className="text-[11px] font-extrabold text-slate-500 block tracking-wider">
                            Geo-Tagged Photo Evidence ({detailItem.raw.photos.length})
                          </span>
                          <div className="flex flex-wrap gap-2">
                            {detailItem.raw.photos.map((p, pIdx) => {
                              const pUrl = typeof p === 'object' ? p.url : p;
                              return (
                                <a
                                  key={pIdx}
                                  href={pUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-indigo-50 border border-slate-200 hover:border-indigo-300 rounded-xl text-[11px] font-extrabold text-indigo-600 transition-all shadow-sm"
                                >
                                  <span>📷 Photo #{pIdx + 1}</span>
                                </a>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Attached Documents & Job Cards */}
                      {((detailItem.raw?.jobCardPhotos && detailItem.raw.jobCardPhotos.length > 0) || detailItem.raw?.jobCardPhoto ||
                        (detailItem.raw?.previousJobCardPhotos && detailItem.raw.previousJobCardPhotos.length > 0) || detailItem.raw?.previousJobCardPhoto ||
                        (detailItem.raw?.warrantyFormPhotos && detailItem.raw.warrantyFormPhotos.length > 0) || detailItem.raw?.warrantyFormPhoto) && (
                          <div className="space-y-2">
                            <span className="text-[11px] font-extrabold text-slate-700 block tracking-wider">
                              Attached Documents & Job Cards
                            </span>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              {((detailItem.raw?.jobCardPhotos && detailItem.raw.jobCardPhotos.length > 0)
                                ? detailItem.raw.jobCardPhotos
                                : (detailItem.raw?.jobCardPhoto ? [detailItem.raw.jobCardPhoto] : [])
                              ).map((photoUrl, idx, arr) => (
                                <div key={`jc-${idx}`} className="p-3 bg-white rounded-2xl border border-slate-200 flex items-center gap-3 shadow-sm">
                                  <a href={photoUrl} target="_blank" rel="noopener noreferrer">
                                    <img src={photoUrl} alt="Job Card" className="w-14 h-14 rounded-xl object-cover border border-slate-200 shadow-sm" />
                                  </a>
                                  <div className="flex-1 min-w-0">
                                    <span className="text-[10px] font-bold text-indigo-600 block">Document</span>
                                    <p className="text-xs font-extrabold text-slate-800 truncate m-0">Job Card {arr.length > 1 ? `#${idx + 1}` : ''}</p>
                                    <a href={photoUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] font-extrabold text-indigo-600 hover:underline">
                                      View Full Photo ↗
                                    </a>
                                  </div>
                                </div>
                              ))}
                              {((detailItem.raw?.previousJobCardPhotos && detailItem.raw.previousJobCardPhotos.length > 0)
                                ? detailItem.raw.previousJobCardPhotos
                                : (detailItem.raw?.previousJobCardPhoto ? [detailItem.raw.previousJobCardPhoto] : [])
                              ).map((photoUrl, idx, arr) => (
                                <div key={`pjc-${idx}`} className="p-3 bg-white rounded-2xl border border-slate-200 flex items-center gap-3 shadow-sm">
                                  <a href={photoUrl} target="_blank" rel="noopener noreferrer">
                                    <img src={photoUrl} alt="Job Card" className="w-14 h-14 rounded-xl object-cover border border-slate-200 shadow-sm" />
                                  </a>
                                  <div className="flex-1 min-w-0">
                                    <span className="text-[10px] font-bold text-indigo-600 block">Warranty Document</span>
                                    <p className="text-xs font-extrabold text-slate-800 truncate m-0">Job Card {arr.length > 1 ? `#${idx + 1}` : ''}</p>
                                    <a href={photoUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] font-extrabold text-indigo-600 hover:underline">
                                      View Full Photo ↗
                                    </a>
                                  </div>
                                </div>
                              ))}
                              {((detailItem.raw?.warrantyFormPhotos && detailItem.raw.warrantyFormPhotos.length > 0)
                                ? detailItem.raw.warrantyFormPhotos
                                : (detailItem.raw?.warrantyFormPhoto ? [detailItem.raw.warrantyFormPhoto] : [])
                              ).map((photoUrl, idx, arr) => (
                                <div key={`wf-${idx}`} className="p-3 bg-white rounded-2xl border border-amber-200/80 bg-amber-50/30 flex items-center gap-3 shadow-sm">
                                  <a href={photoUrl} target="_blank" rel="noopener noreferrer">
                                    <img src={photoUrl} alt="Warranty Form" className="w-14 h-14 rounded-xl object-cover border border-amber-200 shadow-sm" />
                                  </a>
                                  <div className="flex-1 min-w-0">
                                    <span className="text-[10px] font-bold text-amber-600 block">Warranty Document</span>
                                    <p className="text-xs font-extrabold text-slate-800 truncate m-0">Warranty Form {arr.length > 1 ? `#${idx + 1}` : ''}</p>
                                    <a href={photoUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] font-extrabold text-amber-600 hover:underline">
                                      View Full Photo ↗
                                    </a>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                      {/* Attached Documents */}
                      {detailItem.raw?.documents && detailItem.raw.documents.length > 0 && (
                        <div className="space-y-2">
                          <span className="text-[11px] font-extrabold text-slate-500 block tracking-wider">
                            Attached Documents ({detailItem.raw.documents.length})
                          </span>
                          <div className="flex flex-wrap gap-2">
                            {detailItem.raw.documents.map((d, dIdx) => (
                              <a
                                key={dIdx}
                                href={d.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl text-[11px] font-extrabold text-slate-700 transition-all shadow-sm"
                              >
                                <FileText size={13} className="text-indigo-600" />
                                <span>{d.name || `Document #${dIdx + 1}`}</span>
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── Category 3b: Custody Transfer Info ── */}
                  {detailItem.type === 'transfer' && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="p-4 bg-indigo-50/60 rounded-2xl border border-indigo-200/60">
                          <span className="text-[10px] font-extrabold text-indigo-700 block mb-1">Barcode Serial</span>
                          <span className="text-sm font-extrabold text-indigo-950 font-mono">{detailItem.raw?.barcode || 'N/A'}</span>
                        </div>
                        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
                          <span className="text-[10px] font-extrabold text-slate-500 block mb-1">Transfer Type</span>
                          <span className="text-sm font-extrabold text-slate-800 capitalize">{detailItem.raw?.type?.replace('_', ' ') || 'Internal'}</span>
                        </div>
                      </div>

                      <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                        <p className="text-slate-500 font-bold m-0">From Employee: <span className="text-slate-800 font-extrabold">{safeText(detailItem.raw?.fromUser?.fullName || detailItem.raw?.fromUser?.name || detailItem.raw?.fromUser)}</span></p>
                        <p className="text-slate-500 font-bold m-0">To Employee: <span className="text-slate-800 font-extrabold">{safeText(detailItem.raw?.toUser?.fullName || detailItem.raw?.toUser?.name || detailItem.raw?.toUser)}</span></p>
                        <p className="text-slate-500 font-bold m-0">From Department: <span className="text-slate-800">{safeText(detailItem.raw?.fromDepartment?.name || detailItem.raw?.fromDepartment)}</span></p>
                        <p className="text-slate-500 font-bold m-0">To Department: <span className="text-slate-800">{safeText(detailItem.raw?.toDepartment?.name || detailItem.raw?.toDepartment)}</span></p>
                        <p className="text-slate-500 font-bold m-0">Transaction Ref: <span className="text-slate-800 font-mono">{detailItem.raw?.transactionId || 'N/A'}</span></p>
                        <p className="text-slate-500 font-bold m-0">Current Status: <span className="text-indigo-600 font-extrabold capitalize">{detailItem.raw?.status}</span></p>
                      </div>

                      <div className="p-4 bg-indigo-50/40 rounded-2xl border border-indigo-100/80 space-y-1 text-xs">
                        <span className="text-[10px] font-extrabold text-indigo-700 block tracking-wider">Transfer Reason / Remarks</span>
                        <p className="text-slate-700 font-medium m-0">
                          "{detailItem.raw?.remarks || detailItem.raw?.reason || 'No remarks specified'}"
                        </p>
                      </div>

                      {detailItem.raw?.photos && detailItem.raw.photos.length > 0 && (
                        <div className="space-y-2">
                          <span className="text-[11px] font-extrabold text-slate-500 block tracking-wider">
                            Attached Photos ({detailItem.raw.photos.length})
                          </span>
                          <div className="flex flex-wrap gap-2">
                            {detailItem.raw.photos.map((p, pIdx) => {
                              const pUrl = typeof p === 'object' ? p.url : p;
                              return (
                                <a
                                  key={pIdx}
                                  href={pUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-indigo-50 border border-slate-200 hover:border-indigo-300 rounded-xl text-[11px] font-extrabold text-indigo-600 transition-all shadow-sm"
                                >
                                  <span>📷 Photo #{pIdx + 1}</span>
                                </a>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── Category 3c: Store Return Info ── */}
                  {detailItem.type === 'return' && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="p-4 bg-indigo-50/60 rounded-2xl border border-indigo-200/60">
                          <span className="text-[10px] font-extrabold text-indigo-700 block mb-1">Barcode Serial</span>
                          <span className="text-sm font-extrabold text-indigo-950 font-mono">{detailItem.raw?.barcode || 'N/A'}</span>
                        </div>
                        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
                          <span className="text-[10px] font-extrabold text-slate-500 block mb-1">Stage</span>
                          <span className="text-sm font-extrabold text-slate-800 capitalize">{detailItem.raw?.status?.replace('_', ' ') || 'Pending'}</span>
                        </div>
                      </div>

                      <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                        <p className="text-slate-500 font-bold m-0">Returning Employee: <span className="text-slate-800 font-extrabold">{safeText(detailItem.raw?.fromUser?.fullName || detailItem.raw?.fromUser?.name || detailItem.raw?.fromUser)}</span></p>
                        <p className="text-slate-500 font-bold m-0">Assigned Handler: <span className="text-slate-800 font-extrabold">{safeText(detailItem.raw?.returnHandler?.fullName || detailItem.raw?.returnHandler?.name || detailItem.raw?.returnHandler) || 'Unassigned (Direct Return)'}</span></p>
                        <p className="text-slate-500 font-bold m-0">Target Store: <span className="text-slate-800 font-extrabold">{safeText(detailItem.raw?.store?.fullName || detailItem.raw?.store?.name || detailItem.raw?.store) || 'Gokul Shirgaon Store'}</span></p>
                        <p className="text-slate-500 font-bold m-0">Transaction Ref: <span className="text-slate-800 font-mono">{detailItem.raw?.transactionId || 'N/A'}</span></p>
                      </div>

                      <div className="p-4 bg-indigo-50/40 rounded-2xl border border-indigo-100/80 space-y-1 text-xs">
                        <span className="text-[10px] font-extrabold text-indigo-700 block tracking-wider">Return Reason / Notes</span>
                        <p className="text-slate-700 font-medium m-0">
                          "{detailItem.raw?.remarks || detailItem.raw?.reason || 'No remarks specified'}"
                        </p>
                      </div>

                      {detailItem.raw?.photos && detailItem.raw.photos.length > 0 && (
                        <div className="space-y-2">
                          <span className="text-[11px] font-extrabold text-slate-500 block tracking-wider">
                            Attached Photos ({detailItem.raw.photos.length})
                          </span>
                          <div className="flex flex-wrap gap-2">
                            {detailItem.raw.photos.map((p, pIdx) => {
                              const pUrl = typeof p === 'object' ? p.url : p;
                              return (
                                <a
                                  key={pIdx}
                                  href={pUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-indigo-50 border border-slate-200 hover:border-indigo-300 rounded-xl text-[11px] font-extrabold text-indigo-600 transition-all shadow-sm"
                                >
                                  <span>📷 Photo #{pIdx + 1}</span>
                                </a>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── Category 3d: Reel / Lot Split Info ── */}
                  {detailItem.type === 'split' && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="p-4 bg-indigo-50/60 rounded-2xl border border-indigo-200/60">
                          <span className="text-[10px] font-extrabold text-indigo-700 block mb-1">Parent Barcode</span>
                          <span className="text-sm font-extrabold text-indigo-950 font-mono">{detailItem.raw?.barcode || 'N/A'}</span>
                        </div>
                        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
                          <span className="text-[10px] font-extrabold text-slate-500 block mb-1">Material Name</span>
                          <span className="text-sm font-extrabold text-slate-800">{detailItem.raw?.materialName || 'Material Item'}</span>
                        </div>
                      </div>

                      <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                        <p className="text-slate-500 font-bold m-0">Requester: <span className="text-slate-800 font-extrabold">{safeText(detailItem.raw?.requester?.fullName || detailItem.raw?.requester?.name || detailItem.raw?.requester)}</span></p>
                        <p className="text-slate-500 font-bold m-0">Target Split Name: <span className="text-indigo-600 font-extrabold">{detailItem.raw?.requestedMaterialName || detailItem.raw?.materialName || 'New Split Piece'}</span></p>
                        <p className="text-slate-500 font-bold m-0">Transaction Ref: <span className="text-slate-800 font-mono">{detailItem.raw?.transactionId || 'N/A'}</span></p>
                        <p className="text-slate-500 font-bold m-0">Status: <span className="text-amber-600 font-extrabold capitalize">{detailItem.raw?.status}</span></p>
                      </div>

                      <div className="p-4 bg-indigo-50/40 rounded-2xl border border-indigo-100/80 space-y-1 text-xs">
                        <span className="text-[10px] font-extrabold text-indigo-700 block tracking-wider">Split Reason</span>
                        <p className="text-slate-700 font-medium m-0">
                          "{detailItem.raw?.reason || 'No reason specified'}"
                        </p>
                      </div>
                    </div>
                  )}

                  {/* ── Category 3e: Warranty Exchange Info ── */}
                  {detailItem.type === 'exchange' && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="p-4 bg-indigo-50/60 rounded-2xl border border-indigo-200/60">
                          <span className="text-[10px] font-extrabold text-indigo-700 block mb-1">Defective / Old Barcode</span>
                          <span className="text-sm font-extrabold text-indigo-950 font-mono">{detailItem.raw?.oldBarcode || 'N/A'}</span>
                        </div>
                        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
                          <span className="text-[10px] font-extrabold text-slate-500 block mb-1">
                            {detailItem.raw?.newBarcodeMode === 'existing' ? 'Scanned Replacement Barcode' : 'TDL Replacement Barcode'}
                          </span>
                          <span className="text-sm font-extrabold text-slate-800 font-mono">
                            {detailItem.raw?.newBarcode || (detailItem.raw?.newBarcodeMode === 'existing' ? 'N/A' : 'Pending TDL Auto-Generation (2-Phase)')}
                          </span>
                        </div>
                      </div>

                      <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                        <p className="text-slate-500 font-bold m-0">Requester: <span className="text-slate-800 font-extrabold">{safeText(detailItem.raw?.requester?.fullName || detailItem.raw?.requester?.name || detailItem.raw?.requester)}</span></p>
                        <p className="text-slate-500 font-bold m-0">Status: <span className="text-amber-600 font-extrabold capitalize">{detailItem.raw?.status}</span></p>
                      </div>

                      <div className="p-4 bg-indigo-50/40 rounded-2xl border border-indigo-100/80 space-y-1 text-xs">
                        <span className="text-[10px] font-extrabold text-indigo-700 block tracking-wider">Warranty / Exchange Reason</span>
                        <p className="text-slate-700 font-medium m-0">
                          "{detailItem.raw?.warrantyReason || detailItem.raw?.reason || 'Warranty replacement request'}"
                        </p>
                      </div>

                      {detailItem.raw?.photos && detailItem.raw.photos.length > 0 && (
                        <div className="space-y-2">
                          <span className="text-[11px] font-extrabold text-slate-500 block tracking-wider">
                            Defect Photos ({detailItem.raw.photos.length})
                          </span>
                          <div className="flex flex-wrap gap-2">
                            {detailItem.raw.photos.map((p, pIdx) => {
                              const pUrl = typeof p === 'object' ? p.url : p;
                              return (
                                <a
                                  key={pIdx}
                                  href={pUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-indigo-50 border border-slate-200 hover:border-indigo-300 rounded-xl text-[11px] font-extrabold text-indigo-600 transition-all shadow-sm"
                                >
                                  <span>📷 Photo #{pIdx + 1}</span>
                                </a>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── Category 3f: Barcode Merge Info ── */}
                  {detailItem.type === 'merge' && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="p-4 bg-indigo-50/60 rounded-2xl border border-indigo-200/60">
                          <span className="text-[10px] font-extrabold text-indigo-700 block mb-1">Target Material Name</span>
                          <span className="text-sm font-extrabold text-indigo-950">{detailItem.raw?.requestedMaterialName || 'Consolidated Material'}</span>
                        </div>
                        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
                          <span className="text-[10px] font-extrabold text-slate-500 block mb-1">Parent Barcode Mode</span>
                          <span className="text-sm font-extrabold text-slate-800 capitalize">{detailItem.raw?.parentBarcodeMode || 'New Barcode'}</span>
                        </div>
                      </div>

                      <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2 text-xs">
                        <p className="text-slate-500 font-bold m-0">Requester: <span className="text-slate-800 font-extrabold">{safeText(detailItem.raw?.requester?.fullName || detailItem.raw?.requester?.name || detailItem.raw?.requester)}</span></p>
                        <p className="text-slate-500 font-bold m-0">Selected Parent Barcode: <span className="text-indigo-600 font-extrabold font-mono">{detailItem.raw?.selectedParentBarcode || 'Auto Generated'}</span></p>
                        <p className="text-slate-500 font-bold m-0">Barcodes Being Merged ({(detailItem.raw?.mergeBarcodes || []).length}):</p>
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {(detailItem.raw?.mergeBarcodes || []).map((bc, bIdx) => (
                            <span key={bIdx} className="inline-flex items-center gap-1 bg-white px-2.5 py-1 rounded-lg border border-slate-200 text-xs font-mono font-bold text-slate-800">
                              🏷️ {bc}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="p-4 bg-indigo-50/40 rounded-2xl border border-indigo-100/80 space-y-1 text-xs">
                        <span className="text-[10px] font-extrabold text-indigo-700 block tracking-wider">Consolidation Reason</span>
                        <p className="text-slate-700 font-medium m-0">
                          "{detailItem.raw?.reason || 'No reason specified'}"
                        </p>
                      </div>

                      {detailItem.raw?.photos && detailItem.raw.photos.length > 0 && (
                        <div className="space-y-2">
                          <span className="text-[11px] font-extrabold text-slate-500 block tracking-wider">
                            Attached Photos ({detailItem.raw.photos.length})
                          </span>
                          <div className="flex flex-wrap gap-2">
                            {detailItem.raw.photos.map((p, pIdx) => {
                              const pUrl = typeof p === 'object' ? p.url : p;
                              return (
                                <a
                                  key={pIdx}
                                  href={pUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-indigo-50 border border-slate-200 hover:border-indigo-300 rounded-xl text-[11px] font-extrabold text-indigo-600 transition-all shadow-sm"
                                >
                                  <span>📷 Photo #{pIdx + 1}</span>
                                </a>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── Category 4: Customer Visit Info ── */}
                  {detailItem.type === 'visit' && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-200">
                          <span className="text-[10px] font-extrabold text-emerald-700 block mb-1">Customer Name</span>
                          <span className="text-sm font-extrabold text-emerald-950">{detailItem.raw?.customerName || 'Customer'}</span>
                        </div>
                        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
                          <span className="text-[10px] font-extrabold text-slate-500 block mb-1">Contact</span>
                          <span className="text-sm font-extrabold text-slate-800">{detailItem.raw?.customerPhone || 'N/A'}</span>
                        </div>
                      </div>
                      <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-1 text-xs">
                        <p className="text-slate-500 font-bold m-0">Location: <span className="text-slate-800">{detailItem.raw?.location || 'Client Location'}</span></p>
                        <p className="text-slate-500 font-bold m-0">Purpose: <span className="text-slate-800">{detailItem.raw?.purpose || 'Sales visit verification'}</span></p>
                      </div>
                    </div>
                  )}

                  {/* ── Category 5: Material Close / Conversion (DC FOC, Invoice, DC Internal) ── */}
                  {(detailItem.type === 'close_request_accounts' || detailItem.type === 'close_request_store') && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="p-4 bg-indigo-50/60 rounded-2xl border border-indigo-200/60">
                          <span className="text-[10px] font-extrabold text-indigo-700 block mb-1">Document Type</span>
                          <span className="text-sm font-extrabold text-indigo-950">{detailItem.raw?.documentType || 'DC FOC'}</span>
                        </div>
                        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
                          <span className="text-[10px] font-extrabold text-slate-500 block mb-1">Barcode Unit</span>
                          <span className="text-sm font-extrabold text-slate-800">{detailItem.raw?.barcode}</span>
                        </div>
                      </div>

                      <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2 text-xs">
                        <p className="text-slate-500 font-bold m-0">Customer / Client: <span className="text-slate-800">{detailItem.raw?.customerName || 'N/A'}</span></p>
                        <p className="text-slate-500 font-bold m-0">Transaction Ref: <span className="text-slate-800">{detailItem.raw?.transactionId || 'N/A'}</span></p>
                        <p className="text-slate-500 font-bold m-0">Current Stage: <span className="text-indigo-600 font-extrabold">{detailItem.raw?.status === 'pending_accounts_approval' ? 'Accounts Audit (Pending)' : detailItem.raw?.status === 'pending_store_acceptance' ? 'Store Physical Acceptance (Pending)' : detailItem.raw?.status}</span></p>
                        <p className="text-slate-500 font-bold m-0">Requester Remarks: <span className="text-slate-700">"{detailItem.raw?.remarks || 'No remarks provided'}"</span></p>
                      </div>

                      {/* Attached Photos / Proofs */}
                      {detailItem.raw?.photos && detailItem.raw.photos.length > 0 && (
                        <div className="space-y-2">
                          <span className="text-[11px] font-extrabold text-slate-500 block">Geo-Tagged Live Photos:</span>
                          <div className="flex flex-wrap gap-2">
                            {detailItem.raw.photos.map((p, pIdx) => (
                              <a
                                key={pIdx}
                                href={p.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-indigo-50 border border-slate-200 hover:border-indigo-300 rounded-xl text-[11px] font-extrabold text-indigo-600 transition-all shadow-sm"
                              >
                                <span>📷 Photo #{pIdx + 1} {p.capturedAt ? `(${new Date(p.capturedAt).toLocaleTimeString()})` : ''}</span>
                              </a>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Attached Invoice Details (if approved by Accounts) */}
                      {(detailItem.raw?.invoiceNumber || detailItem.raw?.invoiceUrl) && (
                        <div className="p-4 bg-emerald-50/60 rounded-2xl border border-emerald-200/60 space-y-2 text-xs">
                          <span className="text-[10px] font-extrabold text-emerald-800 tracking-wider block">Accounts Invoice Documentation</span>
                          {detailItem.raw?.invoiceNumber && (
                            <p className="text-slate-700 font-bold m-0">Invoice / Ref No: <span className="text-emerald-900 font-extrabold">{detailItem.raw.invoiceNumber}</span></p>
                          )}
                          {detailItem.raw?.invoiceUrl && (
                            <div className="pt-1">
                              <a
                                href={detailItem.raw.invoiceUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-emerald-100/50 border border-emerald-300 rounded-xl text-[11px] font-extrabold text-emerald-700 transition-all shadow-sm"
                              >
                                <FileText size={13} />
                                <span>View Uploaded Tax Invoice / Challan</span>
                              </a>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Modal Footer Actions */}
                <div className="p-6 bg-slate-50 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => setDetailItem(null)}
                    className="px-6 py-3 rounded-2xl font-bold text-xs text-slate-600 bg-white border border-slate-200 hover:bg-slate-100 transition-all"
                  >
                    Close Details
                  </button>
                  {(detailItem.isHistory || detailItem.type === 'expense_history') ? (
                    <div className="flex items-center gap-2">
                      <span className={`px-4 py-2.5 rounded-2xl text-xs font-bold border flex items-center gap-2 ${detailItem.statusColor}`}>
                        {detailItem.isRejected ? <XCircle size={16} /> : <CheckCircle2 size={16} />}
                        {detailItem.statusBadge}
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          const itm = detailItem;
                          setDetailItem(null);
                          openActionModal(itm, 'reject');
                        }}
                        className="px-6 py-3 rounded-2xl font-bold text-xs text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition-all flex items-center gap-2"
                      >
                        <XCircle size={16} />
                        Reject Request
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const itm = detailItem;
                          setDetailItem(null);
                          openActionModal(itm, 'approve');
                        }}
                        className="px-7 py-3 rounded-2xl font-bold text-xs text-white bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-100 transition-all flex items-center gap-2"
                      >
                        <CheckCircle2 size={16} />
                        {detailItem.type === 'split'
                          ? (detailItem.raw?.status === 'store_accepted' ? 'Scan Barcode (Phase 2)' : 'Approve')
                          : detailItem.type === 'accounts_expense'
                            ? `Approve & Pay (₹${detailItem.raw?.payableAmount || detailItem.raw?.grandAllowed || detailItem.raw?.grandRequested || 0})`
                            : 'Approve Request'}
                      </button>
                    </div>
                  )}
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.body
      )}

      {/* Confirmation Modal */}
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {selectedItem && (
            <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 backdrop-blur-md p-4">
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                className="bg-white w-full max-w-lg rounded-3xl shadow-2xl p-6 md:p-8 space-y-6 overflow-hidden my-auto"
              >
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-3">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${actionType === 'approve' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                      {actionType === 'approve' ? <CheckCircle2 size={24} /> : <XCircle size={24} />}
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-slate-900 m-0">
                        {selectedItem.type === 'split' && actionType === 'approve'
                          ? (splitPhase === 1 ? 'Phase 1: Accept Split Request' : 'Phase 2: Barcode Assignment')
                          : actionType === 'approve'
                            ? 'Approve Request'
                            : 'Reject Request'}
                      </h3>
                      <p className="text-xs font-bold text-slate-400 mt-0.5">{selectedItem.title}</p>
                    </div>
                  </div>

                  <button
                    onClick={resetActionModal}
                    className="p-2 text-slate-400 hover:text-slate-700 bg-slate-50 rounded-xl transition-colors"
                  >
                    <X size={18} />
                  </button>
                </div>

                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-1 text-xs">
                  <p className="font-bold text-slate-800 m-0">Applicant: {selectedItem.applicant}</p>
                  <p className="text-slate-600 m-0">{selectedItem.details}</p>
                </div>

                {/* Split Phase 1 Confirmation Box */}
                {selectedItem.type === 'split' && actionType === 'approve' && splitPhase === 1 && (
                  <div className="space-y-4">
                    <div className="p-4 bg-emerald-50/80 border border-emerald-200 rounded-2xl space-y-2.5 text-xs">
                      <div className="flex items-center gap-2 text-emerald-900 font-extrabold tracking-wider text-[11px]">
                        <CheckCircle2 size={16} className="text-emerald-600" />
                        Phase 1: Accept Split & Generate Tally Stock Journal
                      </div>
                      <p className="text-slate-600 font-medium leading-relaxed m-0">
                        Accepting this request will immediately generate an <strong>Autofill Stock Journal</strong> voucher in Tally Prime:
                      </p>
                      <div className="p-3 bg-white/95 border border-emerald-100 rounded-xl space-y-1.5 font-medium">
                        <div className="flex justify-between">
                          <span className="text-slate-500">Outward (Consumption):</span>
                          <span className="font-mono font-bold text-slate-800">
                            Deduct {selectedItem.raw?.newQuantity || 1} {selectedItem.raw?.unit || 'Nos'} from parent barcode {selectedItem.raw?.barcode}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Inward (Production):</span>
                          <span className="font-bold text-indigo-700">
                            Pre-allocated stock in destination godown (TDL creates new barcode)
                          </span>
                        </div>
                      </div>
                      <p className="text-[11px] text-emerald-700 font-bold m-0 flex items-center gap-1">
                        <ArrowRight size={13} />
                        Once accepted, Phase 2 will open immediately to scan the printed barcode sticker.
                      </p>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-slate-500 tracking-wider block">
                        Store Acceptance Remark (Optional)
                      </label>
                      <textarea
                        value={adminNote}
                        onChange={(e) => setAdminNote(e.target.value)}
                        rows={2}
                        placeholder="Optional notes for Phase 1 acceptance..."
                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 outline-none focus:border-indigo-500 focus:bg-white transition-all resize-none"
                      />
                    </div>
                  </div>
                )}

                {/* Split Phase 2 Form: STRICTLY 2 FIELDS (1. Barcode Scan Only, 2. Split Remark) */}
                {selectedItem.type === 'split' && actionType === 'approve' && splitPhase === 2 && (
                  <div className="space-y-4">
                    <div className="p-3.5 bg-indigo-50/80 border border-indigo-200 rounded-2xl flex items-center justify-between">
                      <div>
                        <span className="text-[10px] font-extrabold text-indigo-700 tracking-wider block">
                          Phase 2: Scan Barcode & Complete Split
                        </span>
                        <span className="text-xs font-bold text-slate-700">
                          Tally Voucher: <span className="font-mono text-indigo-900 font-extrabold">{selectedItem.raw?.tallyVoucherNumber || 'Generated'}</span>
                        </span>
                      </div>
                      <span className="px-2.5 py-1 bg-indigo-600 text-white font-extrabold text-[10px] rounded-full tracking-wider">
                        Scan Required
                      </span>
                    </div>

                    {/* FIELD 1: BARCODE SCAN ONLY */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5">
                          <Barcode size={16} className="text-indigo-600" />
                          1. Barcode (Scan Only) <span className="text-rose-500">*</span>
                        </label>
                        <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-100">
                          Scanner Ready
                        </span>
                      </div>
                      <div className="relative">
                        <input
                          type="text"
                          autoFocus
                          value={newSplitBarcode}
                          onChange={(e) => setNewSplitBarcode(e.target.value.toUpperCase())}
                          placeholder="Scan printed barcode sticker here..."
                          className="w-full pl-3.5 pr-10 py-3 bg-white border-2 border-indigo-300 rounded-xl text-sm font-extrabold text-indigo-950 font-mono tracking-wider outline-none focus:border-indigo-600 shadow-sm"
                        />
                        {newSplitBarcode && (
                          <button
                            type="button"
                            onClick={() => setNewSplitBarcode('')}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                          >
                            <X size={14} />
                          </button>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-500 font-medium m-0">
                        Scan the physical sticker created by Tally TDL. Submitting will activate this barcode for the requester.
                      </p>
                    </div>

                    {/* FIELD 2: TYPE REMARK FOR SPLIT */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-extrabold text-slate-800 block">
                        2. Type Remark for Split <span className="text-rose-500">*</span>
                      </label>
                      <textarea
                        value={adminNote}
                        onChange={(e) => setAdminNote(e.target.value)}
                        rows={3}
                        placeholder="Type remark for this split..."
                        className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:border-indigo-500 focus:bg-white transition-all resize-none"
                      />
                    </div>
                  </div>
                )}

                {/* Accounts Invoice & Document Attachment Section (ONLY for Invoice type) */}
                {selectedItem.type === 'close_request_accounts' && actionType === 'approve' && String(selectedItem?.raw?.documentType || '').toLowerCase() === 'invoice' && (
                  <div className="p-4 bg-indigo-50/70 rounded-2xl border border-indigo-100 space-y-3 text-xs">
                    <div className="flex items-center gap-2 text-indigo-900 font-extrabold text-[11px] tracking-wider">
                      <Package size={14} className="text-indigo-600" />
                      Accounts Invoice Documentation
                    </div>
                    <p className="text-[11px] text-slate-500 font-medium m-0">
                      Enter the generated tax invoice reference number and attach the invoice document copy before forwarding to Store.
                    </p>

                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-700 block">
                        Tax Invoice / Reference Number (Optional)
                      </label>
                      <input
                        type="text"
                        value={invoiceNumber}
                        onChange={(e) => setInvoiceNumber(e.target.value)}
                        placeholder="e.g. INV-2026-0042"
                        className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:border-indigo-500 transition-all"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-700 block">
                        Upload Invoice / Challan Document (PDF, Word, Excel, Images, Any Format)
                      </label>

                      {invoiceUrl ? (
                        <div className="flex items-center justify-between p-2.5 bg-white border border-emerald-200 rounded-xl">
                          <div className="flex items-center gap-2 truncate">
                            <CheckCircle2 size={16} className="text-emerald-600 flex-shrink-0" />
                            <a
                              href={invoiceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs font-bold text-indigo-600 hover:underline truncate"
                            >
                              {invoiceFileName || 'Uploaded Invoice Document'}
                            </a>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setInvoiceUrl('');
                              setInvoiceFileName('');
                            }}
                            className="p-1 text-slate-400 hover:text-rose-600 rounded-lg transition-colors ml-2 flex-shrink-0"
                            title="Remove document"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ) : (
                        <div className="relative">
                          <input
                            type="file"
                            id="invoice-file-upload"
                            accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,image/*,*/*"
                            onChange={handleInvoiceUpload}
                            disabled={uploadingInvoice}
                            className="hidden"
                          />
                          <label
                            htmlFor="invoice-file-upload"
                            className={`w-full p-3 bg-white border-2 border-dashed rounded-xl flex items-center justify-center gap-2 cursor-pointer transition-all ${uploadingInvoice
                              ? 'border-indigo-300 bg-indigo-50/50 text-indigo-600 cursor-wait'
                              : 'border-slate-300 hover:border-indigo-400 hover:bg-slate-50 text-slate-600'
                              }`}
                          >
                            {uploadingInvoice ? (
                              <>
                                <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                                <span className="text-xs font-bold">Uploading document...</span>
                              </>
                            ) : (
                              <>
                                <UploadCloud size={16} className="text-indigo-600" />
                                <span className="text-xs font-bold">Attach Invoice / Bill Document (PDF, Word, Excel, Any Format)</span>
                              </>
                            )}
                          </label>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Accounts DC FOC Notice (No Document Required) */}
                {selectedItem.type === 'close_request_accounts' && actionType === 'approve' && String(selectedItem?.raw?.documentType || '').toLowerCase() !== 'invoice' && (
                  <div className="p-4 bg-emerald-50/70 rounded-2xl border border-emerald-200/80 space-y-1.5 text-xs">
                    <div className="flex items-center gap-2 text-emerald-900 font-extrabold text-[11px] tracking-wider">
                      <CheckCircle2 size={14} className="text-emerald-600" />
                      Delivery Challan (DC FOC) Approval
                    </div>
                    <p className="text-[11px] text-slate-600 font-medium m-0">
                      No invoice or document upload is required for DC FOC requests. Confirming approval will forward this request directly to Store for physical verification.
                    </p>
                  </div>
                )}

                {/* Accounts Expense Approval Notice */}
                {selectedItem.type === 'accounts_expense' && actionType === 'approve' && (
                  <div className="p-4 bg-emerald-50/70 rounded-2xl border border-emerald-200/80 space-y-1.5 text-xs">
                    <div className="flex items-center gap-2 text-emerald-900 font-extrabold text-[11px] tracking-wider">
                      <CheckCircle2 size={14} className="text-emerald-600" />
                      Approve & Record Disbursement Payment
                    </div>
                    <p className="text-[11px] text-slate-600 font-medium m-0">
                      Payable Amount: <strong className="text-emerald-800">₹{selectedItem.raw?.payableAmount || selectedItem.raw?.grandAllowed || selectedItem.raw?.grandRequested || 0}</strong>. Confirming will mark this claim as <strong>PAID</strong> and disburse payment.
                    </p>
                  </div>
                )}

                {/* Generic Remarks textarea (Only shown for non-split approvals or rejections) */}
                {!(selectedItem.type === 'split' && actionType === 'approve') && (
                  <div className="space-y-2">
                    <label className="text-[11px] font-bold text-slate-400 tracking-widest">
                      Admin Remarks / Notes (Optional)
                    </label>
                    <textarea
                      value={adminNote}
                      onChange={(e) => setAdminNote(e.target.value)}
                      rows={3}
                      placeholder={`Optional remarks for ${actionType === 'approve' ? 'approval' : 'rejection'}...`}
                      className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-800 outline-none focus:border-indigo-500 focus:bg-white transition-all resize-none"
                    />
                  </div>
                )}

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={resetActionModal}
                    className="px-5 py-2.5 rounded-xl font-bold text-xs text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
                  >
                    Cancel
                  </button>

                  <button
                    type="button"
                    onClick={handleAction}
                    disabled={processing || uploadingInvoice || (selectedItem.type === 'split' && actionType === 'approve' && splitPhase === 2 && !newSplitBarcode.trim())}
                    className={`px-6 py-2.5 rounded-xl font-bold text-xs text-white transition-all shadow-md active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed ${actionType === 'approve'
                      ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-100'
                      : 'bg-rose-600 hover:bg-rose-700 shadow-rose-100'
                      }`}
                  >
                    {processing
                      ? 'Processing...'
                      : selectedItem.type === 'split' && actionType === 'approve'
                        ? (splitPhase === 1 ? 'Accept & Generate Tally Voucher' : 'Complete Split & Activate Barcode')
                        : selectedItem.type === 'accounts_expense' && actionType === 'approve'
                          ? 'Confirm & Pay Claim'
                          : actionType === 'approve'
                            ? 'Confirm Approval'
                            : 'Confirm Rejection'}
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
};

export default PendingApprovals;
