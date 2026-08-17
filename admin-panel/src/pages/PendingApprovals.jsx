import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertCircle,
  ArrowRightLeft,
  CheckCircle2,
  Clock,
  DollarSign,
  FileSpreadsheet,
  FileText,
  Filter,
  Layers,
  MapPin,
  RefreshCw,
  Search,
  UserCheck,
  Users,
  X,
  XCircle
} from 'lucide-react';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useSelector } from 'react-redux';
import api from '../api/axios';

const PendingApprovals = () => {
  const { user } = useSelector((state) => state.auth);

  const userRole = (user?.role || '').toLowerCase();
  const userRoleCode = (user?.roleCode || '').toUpperCase();

  const isSuperAdmin = userRole === 'superadmin' || userRoleCode === 'TCSA1' || user?.scope === 'GLOBAL';
  const isCompanyAdmin = userRole === 'company_admin' || userRole === 'admin' || userRoleCode === 'TCCA1';
  const isHRAdmin = userRole === 'hr' || userRole === 'hr_admin';
  const isStoreAdmin = userRole === 'store' || userRole === 'store_admin' || userRole === 'store_manager';
  const isAccountAdmin = userRole === 'accounts' || userRole === 'account_admin' || userRole === 'finance';

  // Active Category Tab
  const defaultTab = isHRAdmin ? 'hr' : isStoreAdmin ? 'store' : isAccountAdmin ? 'accounts' : 'all';
  const [activeTab, setActiveTab] = useState(defaultTab);

  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Pending Items State
  const [leaves, setLeaves] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [accountsData, setAccountsData] = useState([]);

  // Modal State for Actioning
  const [selectedItem, setSelectedItem] = useState(null);
  const [actionType, setActionType] = useState(''); // 'approve' | 'reject'
  const [adminNote, setAdminNote] = useState('');
  const [processing, setProcessing] = useState(false);

  const fetchPendingData = async () => {
    try {
      setLoading(true);
      const promises = [];

      // 1. Fetch HR Pending Leaves
      if (isSuperAdmin || isCompanyAdmin || isHRAdmin) {
        promises.push(
          api.get('/leaves').then(res => {
            const data = res.data.data || res.data || [];
            const pendingLeaves = Array.isArray(data)
              ? data.filter(l => (l.status || '').toLowerCase() === 'pending')
              : [];
            setLeaves(pendingLeaves);
          }).catch(err => {
            console.error('Failed to fetch leaves:', err.message);
            setLeaves([]);
          })
        );
      }

      // 2. Fetch Store Pending Material Transactions
      if (isSuperAdmin || isCompanyAdmin || isStoreAdmin) {
        promises.push(
          api.get('/material/transactions?status=submitted').then(res => {
            const data = res.data.transactions || res.data.data || res.data || [];
            setMaterials(Array.isArray(data) ? data : []);
          }).catch(err => {
            console.error('Failed to fetch material requests:', err.message);
            setMaterials([]);
          })
        );
      }

      // 3. Fetch Accounts Pending Visits / Claims
      if (isSuperAdmin || isCompanyAdmin || isAccountAdmin) {
        promises.push(
          api.get('/visits').then(res => {
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
      }

      await Promise.all(promises);
    } catch (err) {
      toast.error('Failed to load pending approvals');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPendingData();
  }, []);

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
        setLeaves(prev => prev.filter(l => l._id !== selectedItem._id));
      } else if (selectedItem.category === 'store') {
        // Material Action
        await api.put(`/material/transactions/${selectedItem._id}/status`, {
          status: actionType === 'approve' ? 'tl_approved' : 'rejected',
          notes: adminNote || (actionType === 'approve' ? 'Approved by Store Admin' : 'Rejected by Store Admin')
        });
        toast.success(`Material request ${actionType === 'approve' ? 'approved' : 'rejected'} successfully!`);
        setMaterials(prev => prev.filter(m => m._id !== selectedItem._id));
      } else if (selectedItem.category === 'accounts') {
        // Visit/Claim Action
        await api.patch(`/visits/${selectedItem._id}/status`, {
          status: actionType === 'approve' ? 'Approved' : 'Rejected',
          remarks: adminNote
        });
        toast.success(`Claim ${actionType === 'approve' ? 'approved' : 'rejected'} successfully!`);
        setAccountsData(prev => prev.filter(a => a._id !== selectedItem._id));
      }

      setSelectedItem(null);
      setAdminNote('');
    } catch (err) {
      toast.error(err.response?.data?.message || `Failed to ${actionType} request`);
    } finally {
      setProcessing(false);
    }
  };

  // Combine & Filter Items
  const allHrItems = leaves.map(l => ({
    _id: l._id,
    category: 'hr',
    title: `${l.leaveType || 'Leave'} Application`,
    applicant: l.user?.name || l.userName || 'Employee',
    empCode: l.user?.employeeIdCode || l.user?.email || 'N/A',
    details: `${l.duration || 'Full Day'} • ${new Date(l.startDate).toLocaleDateString('en-GB')} to ${new Date(l.endDate).toLocaleDateString('en-GB')}`,
    reason: l.reason || 'No reason provided',
    date: l.createdAt || l.startDate,
    raw: l
  }));

  const allStoreItems = materials.map(m => ({
    _id: m._id,
    category: 'store',
    title: `Material Dispatch (${m.transactionId || m._id.slice(-6).toUpperCase()})`,
    applicant: m.requestedBy?.name || m.handler?.name || 'Store Handler',
    empCode: m.materialName || m.dispatchType || 'Material',
    details: `Quantity: ${m.quantity || 1} • Destination: ${m.destinationLocation || 'Site'}`,
    reason: m.notes || m.purpose || 'Material movement request',
    date: m.createdAt,
    raw: m
  }));

  const allAccountItems = accountsData.map(a => ({
    _id: a._id,
    category: 'accounts',
    title: `Customer Visit Claim (${a.customerName || 'Visit'})`,
    applicant: a.employeeName || a.user?.name || 'Sales Rep',
    empCode: a.customerPhone || 'Customer Claim',
    details: `Location: ${a.location || 'Client Location'}`,
    reason: a.purpose || a.notes || 'Visit verification request',
    date: a.createdAt || a.visitDate,
    raw: a
  }));

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
      item.reason.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8 animate-fade-up">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-indigo-900 via-indigo-800 to-slate-900 rounded-[2.5rem] p-8 md:p-10 text-white shadow-2xl relative overflow-hidden flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="relative z-10 space-y-2">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-xs font-bold tracking-widest uppercase text-indigo-200">
            <Clock size={14} className="animate-spin-slow" />
            Pending Authorization Portal
          </div>
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">Pending Approvals</h1>
          <p className="text-slate-300 text-xs md:text-sm font-medium max-w-xl">
            Review and approve pending request queues for {isHRAdmin ? 'HR & Staffing' : isStoreAdmin ? 'Store & Materials' : isAccountAdmin ? 'Accounts & Claims' : 'all departments'}.
          </p>
        </div>

        <button
          onClick={fetchPendingData}
          disabled={loading}
          className="relative z-10 px-6 py-3 bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/20 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 active:scale-95 text-white"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          Refresh List
        </button>

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
              className={`px-5 py-2.5 rounded-2xl font-bold text-xs transition-all flex items-center gap-2 whitespace-nowrap ${activeTab === 'all' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}`}
            >
              <Layers size={15} />
              All Approvals ({allHrItems.length + allStoreItems.length + allAccountItems.length})
            </button>
          )}

          {(isSuperAdmin || isCompanyAdmin || isHRAdmin) && (
            <button
              onClick={() => setActiveTab('hr')}
              className={`px-5 py-2.5 rounded-2xl font-bold text-xs transition-all flex items-center gap-2 whitespace-nowrap ${activeTab === 'hr' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}`}
            >
              <Users size={15} />
              HR & Leaves ({allHrItems.length})
            </button>
          )}

          {(isSuperAdmin || isCompanyAdmin || isStoreAdmin) && (
            <button
              onClick={() => setActiveTab('store')}
              className={`px-5 py-2.5 rounded-2xl font-bold text-xs transition-all flex items-center gap-2 whitespace-nowrap ${activeTab === 'store' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}`}
            >
              <ArrowRightLeft size={15} />
              Store & Material ({allStoreItems.length})
            </button>
          )}

          {(isSuperAdmin || isCompanyAdmin || isAccountAdmin) && (
            <button
              onClick={() => setActiveTab('accounts')}
              className={`px-5 py-2.5 rounded-2xl font-bold text-xs transition-all flex items-center gap-2 whitespace-nowrap ${activeTab === 'accounts' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}`}
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
            placeholder="Search request title or applicant..."
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
            There are currently no pending approval requests matching your role queue.
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
              className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-sm hover:shadow-md transition-all flex flex-col justify-between space-y-4 group"
            >
              <div>
                {/* Header Tag */}
                <div className="flex justify-between items-center mb-3">
                  <span className={`text-[10px] font-extrabold px-3 py-1 rounded-full uppercase tracking-wider ${
                    item.category === 'hr' ? 'bg-amber-50 text-amber-600 border border-amber-200' :
                    item.category === 'store' ? 'bg-indigo-50 text-indigo-600 border border-indigo-200' :
                    'bg-emerald-50 text-emerald-600 border border-emerald-200'
                  }`}>
                    {item.category === 'hr' ? '👥 HR Leave' : item.category === 'store' ? '📦 Store Material' : '💰 Account Claim'}
                  </span>

                  <span className="text-[10px] font-bold text-slate-400">
                    {item.date ? new Date(item.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : 'Today'}
                  </span>
                </div>

                {/* Title & Applicant */}
                <h4 className="text-base font-bold text-slate-900 group-hover:text-indigo-600 transition-colors leading-snug m-0">
                  {item.title}
                </h4>
                <p className="text-xs font-bold text-slate-500 mt-1">
                  By: <span className="text-slate-800">{item.applicant}</span> ({item.empCode})
                </p>

                {/* Details & Reason Box */}
                <div className="mt-4 p-3 bg-slate-50 rounded-2xl border border-slate-100 space-y-1">
                  <p className="text-[11px] font-bold text-indigo-600 m-0">{item.details}</p>
                  <p className="text-[11px] font-medium text-slate-600 m-0 line-clamp-2">
                    "{item.reason}"
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-3 pt-2 border-t border-slate-100">
                <button
                  onClick={() => {
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
                  onClick={() => {
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
                  className={`px-6 py-2.5 rounded-xl font-bold text-xs text-white transition-all shadow-md active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed ${
                    actionType === 'approve' ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-100' : 'bg-rose-600 hover:bg-rose-700 shadow-rose-100'
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
