import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowRightLeft,
  Briefcase,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  DollarSign,
  Eye,
  Layers,
  Mail,
  Phone,
  RefreshCw,
  Search,
  Users,
  X,
  XCircle
} from 'lucide-react';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useSelector } from 'react-redux';
import api from '../api/axios';

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

const PendingApprovals = () => {
  const { user } = useSelector((state) => state.auth);

  const userRole = (user?.role || '').toLowerCase();
  const userRoleCode = (user?.roleCode || '').toUpperCase();

  const isSuperAdmin = userRole === 'superadmin' || userRole === 'super_admin' || userRoleCode === 'TCSA1' || user?.scope === 'GLOBAL';
  const isCompanyAdmin = userRole === 'company_admin' || userRole === 'companyadmin' || userRole === 'admin' || userRoleCode === 'TCCA1';
  const isHRAdmin = userRole === 'hr' || userRole === 'hr_admin' || userRoleCode === 'TCSF2A' || userRoleCode === 'TCSFA' || userRoleCode === 'HR_ADMIN';
  const isStoreAdmin = userRole === 'store' || userRole === 'store_admin' || userRole === 'store_manager';
  const isAccountAdmin = userRole === 'accounts' || userRole === 'account_admin' || userRole === 'finance' || userRoleCode === 'TCACC1' || userRoleCode === 'TCACC2' || userRoleCode === 'ACCOUNT_ADMIN';

  // Active Category Tab
  const defaultTab = isHRAdmin ? 'hr' : isStoreAdmin ? 'store' : isAccountAdmin ? 'accounts' : 'all';
  const [activeTab, setActiveTab] = useState(defaultTab);

  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Super Admin Multi-Company State
  const [companies, setCompanies] = useState([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState(() => {
    return localStorage.getItem('selectedCompanyId') || 'ALL';
  });

  // Pending Items State
  const [materials, setMaterials] = useState([]);
  const [accountsData, setAccountsData] = useState([]);
  const [expenseClaims, setExpenseClaims] = useState([]);
  const [hrExpenseClaims, setHrExpenseClaims] = useState([]);
  const [closeRequests, setCloseRequests] = useState([]);

  // Detail Modal State
  const [detailItem, setDetailItem] = useState(null);

  // Modal State for Actioning
  const [selectedItem, setSelectedItem] = useState(null);
  const [actionType, setActionType] = useState(''); // 'approve' | 'reject'
  const [adminNote, setAdminNote] = useState('');
  const [processing, setProcessing] = useState(false);

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

  const fetchPendingData = async (targetCompId = selectedCompanyId) => {
    try {
      setLoading(true);
      const promises = [];

      const reqConfig = targetCompId && targetCompId !== 'ALL'
        ? { headers: { 'x-company-id': targetCompId }, params: { companyId: targetCompId } }
        : { headers: { 'x-company-id': 'ALL' }, params: { companyId: 'ALL' } };

      // 1. Fetch HR Pending Expense Claims (only when HR approval step is active in flow)
      if (isSuperAdmin || isCompanyAdmin || isHRAdmin) {
        promises.push(
          api.get('/expense/hr/pending', reqConfig).then(res => {
            const data = res.data.data || res.data || [];
            setHrExpenseClaims(Array.isArray(data) ? data : []);
          }).catch(() => {
            setHrExpenseClaims([]);
          })
        );
      }

      // 2. Fetch Store Pending Material Transactions
      if (isSuperAdmin || isCompanyAdmin || isStoreAdmin) {
        promises.push(
          api.get('/material/transactions?status=submitted', reqConfig).then(res => {
            const data = res.data.transactions || res.data.data || res.data || [];
            setMaterials(Array.isArray(data) ? data : []);
          }).catch(err => {
            console.error('Failed to fetch material requests:', err.message);
            setMaterials([]);
          })
        );
      }

      // 3. Fetch Accounts Pending Visits & Accounts Pending Expense Claims
      if (isSuperAdmin || isCompanyAdmin || isAccountAdmin) {
        promises.push(
          api.get('/visits', reqConfig).then(res => {
            const data = res.data.data || res.data || [];
            const pendingVisits = Array.isArray(data)
              ? data.filter(v => (v.status || '').toLowerCase() === 'pending' || (v.approvalStatus || '').toLowerCase() === 'pending')
              : [];
            setAccountsData(pendingVisits);
          }).catch(err => {
            console.error('Failed to fetch account approvals:', err.message);
            setAccountsData([]);
          })
        );

        promises.push(
          api.get('/expense/accounts/pending', reqConfig).then(res => {
            const data = res.data.data || res.data || [];
            setExpenseClaims(Array.isArray(data) ? data : []);
          }).catch(err => {
            console.error('Failed to fetch accounts pending claims:', err.message);
            api.get('/expense/claims?status=ACCOUNTS_PENDING&limit=50', reqConfig).then(cRes => {
              setExpenseClaims(cRes.data.data || []);
            }).catch(() => setExpenseClaims([]));
          })
        );
      }

      // 4. Fetch Material Conversion / Close Requests (DC FOC, Invoice, DC Internal)
      if (isSuperAdmin || isCompanyAdmin || isAccountAdmin || isStoreAdmin) {
        promises.push(
          api.get('/barcodes/close-requests/pending', reqConfig).then(res => {
            const data = res.data.requests || res.data.data || res.data || [];
            setCloseRequests(Array.isArray(data) ? data : []);
          }).catch(err => {
            api.get('/material/barcodes/close-requests/pending', reqConfig).then(res2 => {
              const data2 = res2.data.requests || res2.data.data || res2.data || [];
              setCloseRequests(Array.isArray(data2) ? data2 : []);
            }).catch(() => setCloseRequests([]));
          })
        );
      }

      await Promise.all(promises);
    } catch (err) {
      toast.error('Failed to load pending approvals');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isSuperAdmin) {
      fetchCompanies();
    }
    fetchPendingData(selectedCompanyId);
  }, [selectedCompanyId]);

  // Broadcast total pending approvals count whenever data changes
  useEffect(() => {
    const totalPendingCount =
      (hrExpenseClaims?.length || 0) +
      (materials?.length || 0) +
      (accountsData?.length || 0) +
      (expenseClaims?.length || 0) +
      (closeRequests?.length || 0);

    window.dispatchEvent(
      new CustomEvent('pendingApprovalsCountUpdated', {
        detail: { count: totalPendingCount },
      })
    );
  }, [hrExpenseClaims, materials, accountsData, expenseClaims, closeRequests]);

  // Handle Action (Approve / Reject)
  const handleAction = async () => {
    if (!selectedItem) return;
    setProcessing(true);

    try {
      if (selectedItem.type === 'hr_expense') {
        // HR Expense Review
        await api.post(`/expense/claims/${selectedItem._id}/hr-decision`, {
          action: actionType === 'approve' ? 'approved' : 'rejected',
          remarks: adminNote || (actionType === 'approve' ? 'Approved by HR / Admin' : 'Rejected by HR / Admin')
        });
        toast.success(`Expense claim ${actionType === 'approve' ? 'approved and forwarded to Accounts' : 'rejected'}!`);
        setHrExpenseClaims(prev => prev.filter(e => e._id !== selectedItem._id));
      } else if (selectedItem.type === 'expense' || selectedItem.type === 'accounts_expense') {
        // Accounts Expense Disbursement / Rejection
        if (actionType === 'approve') {
          await api.post(`/expense/claims/${selectedItem._id}/disburse`, {
            paidAmount: selectedItem.raw?.grandAllowed || selectedItem.raw?.grandRequested,
            paymentMethod: 'Bank Transfer (NEFT)',
            remarks: adminNote || 'Disbursed and processed by Accounts / Admin'
          });
          toast.success(`Expense claim disbursed & marked as Paid!`);
        } else {
          await api.post(`/expense/claims/${selectedItem._id}/accounts-decision`, {
            action: 'rejected',
            remarks: adminNote || 'Rejected by Accounts / Company Admin'
          });
          toast.success(`Expense claim rejected.`);
        }
        setExpenseClaims(prev => prev.filter(e => e._id !== selectedItem._id));
      } else if (selectedItem.category === 'hr') {
        // Leave Action
        await api.put(`/leaves/${selectedItem._id}`, {
          status: actionType === 'approve' ? 'Approved' : 'Rejected',
          adminNote: adminNote || (actionType === 'approve' ? 'Approved by HR Admin' : 'Rejected by HR Admin')
        });
        toast.success(`Leave request ${actionType === 'approve' ? 'approved' : 'rejected'} successfully!`);
        setLeaves(prev => prev.filter(l => l._id !== selectedItem._id));
      } else if (selectedItem.category === 'store') {
        // Material Action
        await api.put(`/material/transactions/${selectedItem._id}/status`, {
          status: actionType === 'approve' ? 'tl_approved' : 'rejected',
          notes: adminNote || (actionType === 'approve' ? 'Approved by Store Admin / Company Admin' : 'Rejected by Store Admin / Company Admin')
        });
        toast.success(`Material request ${actionType === 'approve' ? 'approved' : 'rejected'} successfully!`);
        setMaterials(prev => prev.filter(m => m._id !== selectedItem._id));
      } else if (selectedItem.category === 'accounts') {
        if (selectedItem.type === 'close_request_accounts') {
          // Close / Conversion request (DC FOC / Invoice) -> Accounts Approval
          const payload = {
            action: actionType === 'approve' ? 'approve' : 'reject',
            rejectionReason: adminNote || (actionType === 'reject' ? 'Rejected by Accounts' : undefined),
          };
          await api.post(`/barcodes/close-requests/${selectedItem._id}/respond`, payload)
            .catch(() => api.post(`/material/barcodes/close-requests/${selectedItem._id}/respond`, payload));

          if (actionType === 'approve') {
            toast.success(`${selectedItem.raw?.documentType || 'DC FOC'} approved and forwarded to Store for physical acceptance!`);
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

      setSelectedItem(null);
      setAdminNote('');
    } catch (err) {
      toast.error(err.response?.data?.message || `Failed to ${actionType} request`);
    } finally {
      setProcessing(false);
    }
  };

  const resolveItemCompany = (raw) => {
    if (raw?.companyId?.name) return raw.companyId.name;
    if (raw?.company?.name) return raw.company.name;
    if (raw?.companyName) return raw.companyName;
    const cId = raw?.companyId?._id || raw?.companyId || raw?.company?._id || raw?.company;
    if (cId && companies.length > 0) {
      const match = companies.find(c => c._id === cId || String(c._id) === String(cId));
      if (match) return match.name;
    }
    return '';
  };

  // Combine & Filter Items
  const allHrItems = hrExpenseClaims.map(c => ({
    _id: c._id,
    category: 'hr',
    type: 'hr_expense',
    title: `Expense Claim (${c.claimType || 'Expense'}) • ₹${c.grandAllowed || c.grandRequested}`,
    applicant: c.submittedBy?.name || c.employeeClaims?.[0]?.employee?.name || 'Employee',
    empCode: c.claimNumber || 'EXP-CLAIM',
    companyName: resolveItemCompany(c),
    details: `${c.employeeCount || 1} Employee(s) • Req: ₹${c.grandRequested} • Allowed: ₹${c.grandAllowed}`,
    reason: c.trip?.purpose || c.purpose || (c.employeeClaims?.[0]?.items?.[0]?.description) || c.hrRemarks || 'Expense claim pending HR approval review',
    date: c.submittedAt || c.createdAt,
    raw: c
  }));

  const allStoreItems = [
    ...materials.map(m => ({
      _id: m._id,
      category: 'store',
      type: 'material',
      title: `Material Dispatch (${m.transactionId || m._id.slice(-6).toUpperCase()})`,
      applicant: m.requestedBy?.name || m.handler?.name || 'Store Handler',
      empCode: m.materialName || m.dispatchType || 'Material',
      companyName: resolveItemCompany(m),
      details: `Quantity: ${m.quantity || 1} • Destination: ${m.destinationLocation || 'Site'}`,
      reason: m.notes || m.purpose || 'Material movement request',
      date: m.createdAt,
      raw: m
    })),
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

  const allAccountItems = [
    ...accountsData.map(a => ({
      _id: a._id,
      category: 'accounts',
      type: 'visit',
      title: `Customer Visit Claim (${a.customerName || 'Visit'})`,
      applicant: a.employeeName || a.user?.name || 'Sales Rep',
      empCode: a.customerPhone || 'Customer Claim',
      companyName: resolveItemCompany(a),
      details: `Location: ${a.location || 'Client Location'}`,
      reason: a.purpose || a.notes || 'Visit verification request',
      date: a.createdAt || a.visitDate,
      raw: a
    })),
    ...expenseClaims.map(c => ({
      _id: c._id,
      category: 'accounts',
      type: 'accounts_expense',
      title: `Expense Claim (${c.claimType || 'Expense'}) • ₹${c.grandAllowed || c.grandRequested}`,
      applicant: c.submittedBy?.name || c.employeeClaims?.[0]?.employee?.name || 'Employee',
      empCode: c.claimNumber || 'EXP-CLAIM',
      companyName: resolveItemCompany(c),
      details: `${c.employeeCount || 1} Employee(s) • Req: ₹${c.grandRequested} • Allowed: ₹${c.grandAllowed}`,
      reason: c.trip?.purpose || c.purpose || (c.employeeClaims?.[0]?.items?.[0]?.description) || c.accountsRemarks || 'Expense reimbursement claim ready for payment & disbursement',
      date: c.submittedAt || c.createdAt,
      raw: c
    })),
    ...closeRequests.filter(c => c.status === 'pending_accounts_approval').map(c => ({
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
    }))
  ];

  let displayItems = [];
  if (activeTab === 'all') {
    displayItems = [...allHrItems, ...allStoreItems, ...allAccountItems];
  } else if (activeTab === 'hr') {
    displayItems = allHrItems;
  } else if (activeTab === 'store') {
    displayItems = allStoreItems;
  } else if (activeTab === 'accounts') {
    displayItems = allAccountItems;
  }

  if (searchTerm) {
    displayItems = displayItems.filter(item =>
      item.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.applicant.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.details.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.reason.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.companyName && item.companyName.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  }

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
                : `Review and approve pending request queues for ${isHRAdmin ? 'HR Expense Reviews' : isStoreAdmin ? 'Store & Materials' : 'Accounts & Claims'}.`}
          </p>
        </div>

        <div className="relative z-10 flex flex-wrap items-center gap-3">
          <button
            onClick={() => fetchPendingData(selectedCompanyId)}
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
              All Approvals ({allHrItems.length + allStoreItems.length + allAccountItems.length})
            </button>
          )}

          {(isSuperAdmin || isCompanyAdmin || isHRAdmin) && (
            <button
              onClick={() => setActiveTab('hr')}
              className={`px-5 py-2.5 rounded-2xl font-bold text-xs transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${activeTab === 'hr' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}`}
            >
              <Users size={15} />
              HR Approvals ({allHrItems.length})
            </button>
          )}

          {(isSuperAdmin || isCompanyAdmin || isStoreAdmin) && (
            <button
              onClick={() => setActiveTab('store')}
              className={`px-5 py-2.5 rounded-2xl font-bold text-xs transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${activeTab === 'store' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}`}
            >
              <ArrowRightLeft size={15} />
              Store & Material ({allStoreItems.length})
            </button>
          )}

          {(isSuperAdmin || isCompanyAdmin || isAccountAdmin) && (
            <button
              onClick={() => setActiveTab('accounts')}
              className={`px-5 py-2.5 rounded-2xl font-bold text-xs transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${activeTab === 'accounts' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}`}
            >
              <DollarSign size={15} />
              Accounts & Claims ({allAccountItems.length})
            </button>
          )}
        </div>

        {/* Search Field */}
        <div className="relative min-w-[240px]">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search the titles or applicants..."
            className="w-full pl-11 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-800 outline-none focus:border-indigo-500 focus:bg-white transition-all"
          />
        </div>
      </div>

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
          <h3 className="text-lg font-bold text-slate-900 m-0">All Pending Approvals Cleared!</h3>
          <p className="text-xs font-medium text-slate-400 max-w-sm">
            There are currently no pending approval requests matching your selection.
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
                  <div className="flex items-center gap-1.5">
                    <span className={`text-[10px] font-extrabold px-3 py-1 rounded-full tracking-wider ${item.category === 'hr' ? 'bg-amber-50 text-amber-600 border border-amber-200' :
                      (item.category === 'store' || item.isMaterialRequest || item.type?.startsWith('close_request') || item.type === 'material') ? 'bg-indigo-50 text-indigo-600 border border-indigo-200' :
                        'bg-emerald-50 text-emerald-600 border border-emerald-200'
                      }`}>
                      {item.category === 'hr' ? '👥 HR Review' : (item.category === 'store' || item.isMaterialRequest || item.type?.startsWith('close_request') || item.type === 'material') ? '📦 Material Movement' : '💰 Account Claim'}
                    </span>
                    {/* {item.companyName && (
                      <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50/80 border border-indigo-100 px-2 py-0.5 rounded-lg flex items-center gap-1">
                        <Building2 size={10} className="text-indigo-500" />
                        {item.companyName}
                      </span>
                    )} */}
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-slate-500 bg-slate-50 px-2.5 py-1 rounded-xl border border-slate-200/80 flex items-center gap-1">
                      <Clock size={11} className="text-slate-400" />
                      {formatAppliedDateTime(item.date)}
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
                    "{item.reason}"
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-3 pt-2 border-t border-slate-100">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedItem(item);
                    setActionType('approve');
                    setAdminNote('');
                  }}
                  className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs shadow-md shadow-emerald-100 transition-all flex items-center justify-center gap-1.5 active:scale-95"
                >
                  <CheckCircle2 size={15} />
                  Approve
                </button>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedItem(item);
                    setActionType('reject');
                    setAdminNote('');
                  }}
                  className="flex-1 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-xl font-bold text-xs border border-rose-200/60 transition-all flex items-center justify-center gap-1.5 active:scale-95"
                >
                  <XCircle size={15} />
                  Reject
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* ── Request Full Details Modal ── */}
      <AnimatePresence>
        {detailItem && (
          <div className="fixed inset-0 z-[2500] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl overflow-hidden my-8 border border-slate-100 flex flex-col max-h-[90vh]"
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
                  <span className={`text-[10px] font-extrabold px-3 py-1 rounded-full tracking-wider ${detailItem.category === 'hr' ? 'bg-amber-400 text-amber-950' :
                    (detailItem.category === 'store' || detailItem.isMaterialRequest || detailItem.type?.startsWith('close_request') || detailItem.type === 'material') ? 'bg-indigo-400 text-indigo-950' :
                      'bg-emerald-400 text-emerald-950'
                    }`}>
                    {detailItem.category === 'hr' ? '👥 HR Expense Review' :
                      (detailItem.category === 'store' || detailItem.isMaterialRequest || detailItem.type?.startsWith('close_request') || detailItem.type === 'material') ? '📦 Material Movement Request' :
                        '💰 Accounts & Expense Claim'}
                  </span>
                  <span className="text-xs text-slate-300 flex items-center gap-1.5 font-bold bg-white/10 px-3 py-1 rounded-full">
                    <Clock size={13} />
                    <span>Applied: {formatAppliedDateTime(detailItem.date)}</span>
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
                      {detailItem.applicant?.charAt(0) || 'U'}
                    </div>
                    <div>
                      <h4 className="text-base font-extrabold text-slate-900 m-0">{detailItem.applicant}</h4>
                      <p className="text-xs font-bold text-indigo-600 m-0 mt-0.5">
                        {detailItem.raw?.user?.employeeIdCode || detailItem.raw?.submittedBy?.employeeIdCode || detailItem.empCode || 'Employee'}
                      </p>
                      <div className="flex flex-wrap items-center gap-2 mt-2 text-[11px] font-bold text-slate-500">
                        {detailItem.companyName && (
                          <span className="flex items-center gap-1 bg-indigo-50 text-indigo-700 font-extrabold px-2.5 py-1 rounded-xl border border-indigo-100">
                            <Building2 size={12} className="text-indigo-600" />
                            {detailItem.companyName}
                          </span>
                        )}
                        {(detailItem.raw?.user?.department || detailItem.raw?.submittedBy?.department || detailItem.raw?.department) && (
                          <span className="flex items-center gap-1 bg-white px-2.5 py-1 rounded-xl border border-slate-200">
                            <Building2 size={12} className="text-slate-400" />
                            {detailItem.raw?.user?.department || detailItem.raw?.submittedBy?.department || detailItem.raw?.department}
                          </span>
                        )}
                        {(detailItem.raw?.user?.designation || detailItem.raw?.designation) && (
                          <span className="flex items-center gap-1 bg-white px-2.5 py-1 rounded-xl border border-slate-200">
                            <Briefcase size={12} className="text-slate-400" />
                            {detailItem.raw?.user?.designation || detailItem.raw?.designation}
                          </span>
                        )}
                        {(detailItem.raw?.user?.email || detailItem.raw?.submittedBy?.email) && (
                          <span className="flex items-center gap-1 bg-white px-2.5 py-1 rounded-xl border border-slate-200">
                            <Mail size={12} className="text-slate-400" />
                            {detailItem.raw?.user?.email || detailItem.raw?.submittedBy?.email}
                          </span>
                        )}
                        {(detailItem.raw?.user?.phone || detailItem.raw?.customerPhone) && (
                          <span className="flex items-center gap-1 bg-white px-2.5 py-1 rounded-xl border border-slate-200">
                            <Phone size={12} className="text-slate-400" />
                            {detailItem.raw?.user?.phone || detailItem.raw?.customerPhone}
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
                {(detailItem.type === 'expense' || detailItem.type === 'accounts_expense' || detailItem.type === 'hr_expense') && (
                  <div className="space-y-5">
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

                    {/* Financial Overview */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
                        <span className="text-[10px] font-extrabold text-slate-400 block mb-1">Requested Amount</span>
                        <span className="text-base font-extrabold text-slate-800">₹{detailItem.raw?.grandRequested || 0}</span>
                      </div>
                      <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-200">
                        <span className="text-[10px] font-extrabold text-emerald-700 block mb-1">Policy Allowed</span>
                        <span className="text-base font-extrabold text-emerald-700">₹{detailItem.raw?.grandAllowed || 0}</span>
                      </div>
                      <div className="p-4 bg-rose-50 rounded-2xl border border-rose-200">
                        <span className="text-[10px] font-extrabold text-rose-700 block mb-1">Excess / Disallowed</span>
                        <span className="text-base font-extrabold text-rose-700">₹{detailItem.raw?.grandExcess || 0}</span>
                      </div>
                    </div>

                    {/* Trip Information / Expense Purpose Details */}
                    {(() => {
                      const claimType = (detailItem.raw?.claimType || '').toUpperCase().trim();
                      const showCityClaimTypes = ['TRAVEL', 'TOUR', 'TRIP', 'LODGING', 'FOOD', 'TRAVEL_EXPENSE', 'TOUR_EXPENSE', 'FOOD_EXPENSE', 'LODGING_EXPENSE'];
                      const isShowCityClaim = showCityClaimTypes.includes(claimType);
                      const expensePurpose = detailItem.raw?.trip?.purpose || detailItem.raw?.purpose || detailItem.reason || (detailItem.raw?.employeeClaims?.[0]?.items?.[0]?.description) || '';
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
                                {claimType === 'CONVEYANCE' ? 'Local Conveyance' : (detailItem.raw?.claimType || 'Other Expense')}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Itemized Breakdown Table */}
                    {detailItem.raw?.employeeClaims && detailItem.raw.employeeClaims.length > 0 && (
                      <div className="space-y-3">
                        <span className="text-[11px] font-extrabold text-slate-400 tracking-wider">Itemized Claim Entries & Policy Calculations</span>
                        <div className="space-y-2.5">
                          {detailItem.raw.employeeClaims.flatMap((ec, ecIdx) => (ec.items || []).map((it, itIdx) => {
                            const hasExcess = Number(it.excessAmount || 0) > 0;
                            const limitDisplay = it.limitText || it.calculationBreakdown?.limitText || `₹${it.allowedAmount || 0}`;
                            const explanation = it.plainExplanation || it.calculationBreakdown?.plainExplanation || (
                              hasExcess
                                ? `Policy limit is ${limitDisplay} and claimed value is ₹${it.requestedAmount || 0}. Therefore, ₹${it.allowedAmount || 0} is allowed and ₹${it.excessAmount || 0} is excess.`
                                : `Policy limit is ${limitDisplay} and claimed value is ₹${it.requestedAmount || 0}. Since it is within the limit, ₹${it.allowedAmount || 0} is fully allowed.`
                            );

                            return (
                              <div key={`${ecIdx}-${itIdx}`} className="p-4 bg-white rounded-2xl border border-slate-200 shadow-2xs space-y-2.5 text-xs">
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <div className="flex items-center gap-2">
                                      {/* <span className="font-extrabold text-slate-900 text-sm">
                                        {it.expenseType || detailItem.raw?.claimType || 'Expense'}
                                      </span> */}
                                      {it.expenseDate && (
                                        <span className="text-[10px] font-bold text-slate-400">
                                          {new Date(it.expenseDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                                        </span>
                                      )}
                                      {ec.employee?.name && (
                                        <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 text-[10px] font-extrabold">
                                          {ec.employee.name}
                                        </span>
                                      )}
                                    </div>
                                    {/* <span className="text-[11px] text-slate-500 block mt-0.5">{it.description || it.note || 'Expense item entry'}</span> */}
                                    {/* {it.distanceKm && (
                                      <span className="text-[10px] text-indigo-600 font-bold block mt-0.5">
                                        🚗 {it.distanceKm} km ({it.vehicle || 'car'})
                                      </span>
                                    )} */}
                                  </div>

                                  <div className="flex items-center gap-2">
                                    <span className={`px-2.5 py-1 rounded-xl text-[10px] font-extrabold border ${hasExcess
                                      ? 'bg-rose-50 text-rose-700 border-rose-200'
                                      : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                      }`}>
                                      {hasExcess ? `₹${it.excessAmount} Excess` : 'Fully Allowed'}
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
                                    <span className="text-xs font-bold text-indigo-700">{limitDisplay}</span>
                                  </div>
                                  <div>
                                    <span className="text-[9px] font-extrabold text-emerald-600 block">Allowed</span>
                                    <span className="text-xs font-bold text-emerald-600">₹{it.allowedAmount || 0}</span>
                                  </div>
                                  {hasExcess && (
                                    <div>
                                      <span className="text-[9px] font-extrabold text-rose-500 block">Excess</span>
                                      <span className="text-xs font-bold text-rose-600">₹{it.excessAmount || 0}</span>
                                    </div>
                                  )}
                                </div>

                                {/* Simple Plain Language Explanation Box */}
                                <div className={`p-2.5 rounded-xl border flex items-start gap-2 ${hasExcess
                                  ? 'bg-rose-50/70 border-rose-200/80 text-rose-900'
                                  : 'bg-emerald-50/70 border-emerald-200/80 text-emerald-900'
                                  }`}>
                                  <span className="text-[11px] font-bold leading-relaxed">
                                    💡 <b>Summary:</b> {explanation}
                                  </span>
                                </div>

                                {/* Attached Receipts & Proofs */}
                                {it.attachments && it.attachments.length > 0 && (
                                  <div className="flex flex-wrap gap-2 pt-1">
                                    {it.attachments.map((att, aIdx) => (
                                      <a
                                        key={aIdx}
                                        href={att.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-indigo-50 border border-slate-200 hover:border-indigo-300 rounded-xl text-[11px] font-extrabold text-indigo-600 transition-all shadow-sm"
                                        title="Click to preview receipt"
                                      >
                                        <span>📷 {att.name || `Receipt #${aIdx + 1}`}</span>
                                      </a>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          }))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* ── Category 3: Store Material Info ── */}
                {detailItem.type === 'material' && (
                  <div className="space-y-4">
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
                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-1 text-xs">
                      <p className="text-slate-500 font-bold m-0">Destination: <span className="text-slate-800">{detailItem.raw?.destinationLocation || 'Site'}</span></p>
                      <p className="text-slate-500 font-bold m-0">Movement Type: <span className="text-slate-800">{detailItem.raw?.dispatchType || 'Dispatch'}</span></p>
                      <p className="text-slate-500 font-bold m-0">Purpose: <span className="text-slate-800">{detailItem.raw?.purpose || detailItem.raw?.notes || 'Material dispatch'}</span></p>
                    </div>
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
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      const itm = detailItem;
                      setDetailItem(null);
                      setSelectedItem(itm);
                      setActionType('reject');
                      setAdminNote('');
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
                      setSelectedItem(itm);
                      setActionType('approve');
                      setAdminNote('');
                    }}
                    className="px-7 py-3 rounded-2xl font-bold text-xs text-white bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-100 transition-all flex items-center gap-2"
                  >
                    <CheckCircle2 size={16} />
                    Approve Request
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Confirmation Modal */}
      <AnimatePresence>
        {selectedItem && (
          <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-slate-900/40 backdrop-blur-md p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-white w-full max-w-lg rounded-3xl shadow-2xl p-6 md:p-8 space-y-6 overflow-hidden"
            >
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-3">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${actionType === 'approve' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                    {actionType === 'approve' ? <CheckCircle2 size={24} /> : <XCircle size={24} />}
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-900 m-0">
                      {actionType === 'approve' ? 'Approve Request' : 'Reject Request'}
                    </h3>
                    <p className="text-xs font-bold text-slate-400 mt-0.5">{selectedItem.title}</p>
                  </div>
                </div>

                <button
                  onClick={() => setSelectedItem(null)}
                  className="p-2 text-slate-400 hover:text-slate-700 bg-slate-50 rounded-xl transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-1 text-xs">
                <p className="font-bold text-slate-800 m-0">Applicant: {selectedItem.applicant}</p>
                <p className="text-slate-600 m-0">{selectedItem.details}</p>
              </div>

              <div className="space-y-2">
                <label className="text-[11px] font-bold text-slate-400 tracking-widest">
                  Admin Remarks / Notes ({actionType === 'reject' ? 'Required' : 'Optional'})
                </label>
                <textarea
                  value={adminNote}
                  onChange={(e) => setAdminNote(e.target.value)}
                  rows={3}
                  placeholder={`Enter reason for ${actionType === 'approve' ? 'approval' : 'rejection'}...`}
                  className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-800 outline-none focus:border-indigo-500 focus:bg-white transition-all resize-none"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedItem(null)}
                  className="px-5 py-2.5 rounded-xl font-bold text-xs text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={handleAction}
                  disabled={processing || (actionType === 'reject' && !adminNote.trim())}
                  className={`px-6 py-2.5 rounded-xl font-bold text-xs text-white transition-all shadow-md active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed ${actionType === 'approve' ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-100' : 'bg-rose-600 hover:bg-rose-700 shadow-rose-100'
                    }`}
                >
                  {processing ? 'Processing...' : actionType === 'approve' ? 'Confirm Approval' : 'Confirm Rejection'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default PendingApprovals;
