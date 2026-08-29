import {
  Activity,
  AlertCircle,
  ArrowRightLeft,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Eye,
  Layers,
  MoreVertical,
  Package,
  RefreshCw,
  Reply,
  RotateCcw,
  Search,
  Send,
  Split,
  X,
  XCircle
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import api from '../api/axios';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Spinner from '../components/ui/Spinner';
import useActiveRole from '../hooks/useActiveRole';
import ReturnFormModal from './transactions/ReturnFormModal';
import SplitLotModal from './transactions/SplitLotModal';
import TransferFormModal from './transactions/TransferFormModal';

const MaterialMovementDashboardPage = () => {
  const navigate = useNavigate();
  const activeRole = useActiveRole();
  const reduxUser = useSelector((state) => state.auth?.user);
  const user = reduxUser || (() => {
    try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; }
  })();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState(null);
  const [charts, setCharts] = useState({ daily: [], docType: [] });
  const [activities, setActivities] = useState([]);

  const [barcodes, setBarcodes] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [pendingApprovals, setPendingApprovals] = useState([]);

  // Modal states for Barcode Actions
  const [activeBarcodeAction, setActiveBarcodeAction] = useState(null);
  const [selectedTxnBarcodesModal, setSelectedTxnBarcodesModal] = useState(null);
  const [employees, setEmployees] = useState([]);

  // Action loading state
  const [actionTxnLoading, setActionTxnLoading] = useState(null);

  // Dashboard filter & view mode states
  const [viewMode, setViewMode] = useState('all'); // 'recent' | 'all'
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [docTypeFilter, setDocTypeFilter] = useState('all');
  const [expandedTxnId, setExpandedTxnId] = useState(null);

  const fetchDashboardData = async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    else setRefreshing(true);

    try {
      const [statsRes, chartsRes, recentRes, txnRes, bcRes, auditRes] = await Promise.all([
        api.get('/material/dashboard/stats').catch(() => api.get('/dashboard/stats')).catch(() => ({ data: { data: {} } })),
        api.get('/material/dashboard/charts').catch(() => api.get('/dashboard/charts')).catch(() => ({ data: { data: {} } })),
        api.get('/material/dashboard/recent').catch(() => api.get('/dashboard/recent')).catch(() => ({ data: { data: [] } })),
        api.get('/material/transactions?limit=5000').catch(() => api.get('/transactions?limit=5000')).catch(() => ({ data: { data: [] } })),
        api.get('/material/barcodes?limit=5000').catch(() => api.get('/barcodes?limit=5000')).catch(() => ({ data: { data: [] } })),
        api.get('/material/audit-logs/activities').catch(() => ({ data: { success: false } }))
      ]);

      let txnsList = Array.isArray(txnRes.data?.data)
        ? txnRes.data.data
        : (Array.isArray(txnRes.data?.transactions)
          ? txnRes.data.transactions
          : (Array.isArray(txnRes.data) ? txnRes.data : []));

      let bcList = Array.isArray(bcRes.data?.data)
        ? bcRes.data.data
        : (Array.isArray(bcRes.data?.barcodes)
          ? bcRes.data.barcodes
          : (Array.isArray(bcRes.data) ? bcRes.data : []));

      // Fallback to audit activities data if standalone endpoints returned empty
      if (txnsList.length === 0 && Array.isArray(auditRes.data?.transactions) && auditRes.data.transactions.length > 0) {
        txnsList = auditRes.data.transactions;
      }
      if (bcList.length === 0 && Array.isArray(auditRes.data?.barcodes) && auditRes.data.barcodes.length > 0) {
        bcList = auditRes.data.barcodes;
      }

      const userRole = String(user?.role || activeRole?.role || '').toLowerCase();
      const adminType = String(user?.departmentAdminType || user?.adminType || activeRole?.adminType || '').toLowerCase();
      const isCentralRole = ['super_admin', 'superadmin', 'admin', 'company_admin'].includes(userRole) ||
        user?.scope === 'GLOBAL' ||
        (userRole === 'department_admin' && ['store', 'management', 'accounts', ''].includes(adminType)) ||
        ['store', 'store_admin', 'management', 'accounts'].includes(userRole);

      if (!isCentralRole) {
        txnsList = txnsList.filter(t => {
          const reqId = (t.requester?._id || t.requester)?.toString();
          const hdlId = (t.handler?._id || t.handler)?.toString();
          const tlId = (t.teamLead?._id || t.teamLead)?.toString();
          const mgtId = (t.managementApprover?._id || t.managementApprover)?.toString();
          const storeId = (t.store?._id || t.store)?.toString();
          const deptId = (t.department?._id || t.department)?.toString();

          const curUserId = user?._id?.toString();
          const curUserDeptId = (user?.department?._id || user?.department)?.toString();

          if ((userRole === 'team_lead' || userRole === 'department_admin') && deptId === curUserDeptId) {
            return true;
          }

          return reqId === curUserId || hdlId === curUserId || tlId === curUserId || mgtId === curUserId || storeId === curUserId;
        });

        bcList = bcList.filter(b => {
          const curUserId = user?._id?.toString();
          const ownerId = (b.owner?._id || b.owner)?.toString();
          const inHistory = b.history?.some(h => (h.user?._id || h.user)?.toString() === curUserId);
          const inOwnership = b.ownershipHistory?.some(oh => (oh.user?._id || oh.user)?.toString() === curUserId);

          return ownerId === curUserId || inHistory || inOwnership;
        });
      }

      setTransactions(txnsList);
      setBarcodes(bcList);
      setActivities(recentRes.data?.data || auditRes.data?.auditLogs || []);

      const activeItemsCount = bcList.filter(b => (b.status || '').toLowerCase() === 'active').length ||
        txnsList.filter(t => ['received', 'active', 'partially_returned'].includes((t.status || '').toLowerCase())).reduce((sum, t) => sum + (t.totalItems || (t.materials?.length) || 1), 0);
      const exchangeCount = bcList.filter(b => (b.status || '').toLowerCase() === 'exchanged').length;
      const returnedCount = bcList.filter(b => (b.status || '').toLowerCase() === 'returned').length;

      const closedItemsCount = txnsList
        .filter(t => ['closed', 'completed', 'rejected'].includes((t.status || '').toLowerCase()))
        .reduce((sum, t) => {
          let count = 0;
          if (t.materials && t.materials.length > 0) {
            t.materials.forEach(m => {
              if (m.barcodes && m.barcodes.length > 0) {
                count += m.barcodes.length;
              } else {
                count += m.quantity || 0;
              }
            });
          }
          return sum + (count || t.totalItems || 0);
        }, 0);

      setStats({
        activeItems: activeItemsCount,
        exchanged: exchangeCount,
        returned: returnedCount,
        closed: closedItemsCount
      });

      const dailyBarcodesMap = {};
      for (let i = 0; i < 30; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        dailyBarcodesMap[dateStr] = { count: 0, active: 0, exchanged: 0, returned: 0, closed: 0 };
      }

      bcList.forEach((b) => {
        if (!b.createdAt) return;
        const dateStr = b.createdAt.split('T')[0];
        if (dailyBarcodesMap[dateStr] !== undefined) {
          dailyBarcodesMap[dateStr].count += 1;
          const statusLower = b.status?.toLowerCase() || '';
          if (statusLower === 'active') {
            dailyBarcodesMap[dateStr].active += 1;
          } else if (statusLower === 'exchanged') {
            dailyBarcodesMap[dateStr].exchanged += 1;
          } else if (statusLower === 'returned') {
            dailyBarcodesMap[dateStr].returned += 1;
          } else if (statusLower === 'closed') {
            dailyBarcodesMap[dateStr].closed += 1;
          }
        }
      });

      txnsList.forEach((t) => {
        const dateStr = (t.closedAt || t.updatedAt || t.createdAt || '').split('T')[0];
        if (dailyBarcodesMap[dateStr] !== undefined) {
          let count = 0;
          if (t.materials && t.materials.length > 0) {
            t.materials.forEach(m => {
              if (m.barcodes && m.barcodes.length > 0) {
                count += m.barcodes.length;
              } else {
                count += m.quantity || 0;
              }
            });
          }
          if (['closed', 'completed', 'rejected'].includes(t.status)) {
            dailyBarcodesMap[dateStr].closed += (count || t.totalItems || 0);
          } else {
            dailyBarcodesMap[dateStr].active += (count || t.totalItems || 0);
          }
          dailyBarcodesMap[dateStr].count += 1;
        }
      });

      const dailyData = Object.keys(dailyBarcodesMap)
        .sort()
        .map((date) => ({
          date,
          count: dailyBarcodesMap[date].count,
          Active: dailyBarcodesMap[date].active,
          Exchanged: dailyBarcodesMap[date].exchanged,
          Returned: dailyBarcodesMap[date].returned,
          Closed: dailyBarcodesMap[date].closed,
        }));

      const chartData = chartsRes.data?.data?.charts || {};
      let docTypeDist = chartData.docTypeDistribution || [];
      if (!docTypeDist.length && txnsList.length > 0) {
        const dtMap = {};
        txnsList.forEach(t => {
          const dt = t.documentType || 'RDC';
          dtMap[dt] = (dtMap[dt] || 0) + 1;
        });
        docTypeDist = Object.keys(dtMap).map(k => ({ _id: k, count: dtMap[k] }));
      }
      const docType = docTypeDist.map((d) => ({ name: d._id || 'RDC', value: d.count }));
      setCharts({ daily: dailyData, docType });

      const pendingList = txnsList.filter(t => {
        if (activeRole.role === 'team_lead') {
          return t.status === 'submitted';
        }
        if (activeRole.role === 'department_admin' && activeRole.adminType === 'management') {
          return ['submitted', 'tl_approved'].includes(t.status);
        }
        return false;
      });
      setPendingApprovals(pendingList);

    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
    api.get('/employees?limit=1000&allDepartments=true').then(res => {
      setEmployees((res.data.employees || res.data.data || []).map(e => ({ value: e._id, label: `${e.fullName || e.name} (${e.employeeId || 'EMP'})` })));
    }).catch(err => console.error(err));
  }, [activeRole.role, activeRole.adminType]);

  const handleQuickApprove = async (txn) => {
    if (!window.confirm(`Approve transaction ${txn.transactionId}?`)) return;
    try {
      setActionTxnLoading(txn._id);
      await api.put(`/material/transactions/${txn._id}/approve`, {
        remarks: 'Approved from Material Movement Dashboard'
      }).catch(() => api.put(`/transactions/${txn._id}/approve`, {
        remarks: 'Approved from Material Movement Dashboard'
      }));
      alert(`Transaction ${txn.transactionId} approved successfully.`);
      fetchDashboardData(true);
    } catch (err) {
      alert(err.response?.data?.message || 'Approval action failed.');
    } finally {
      setActionTxnLoading(null);
    }
  };

  const handleQuickReject = async (txn) => {
    const reason = window.prompt(`Please enter rejection reason for transaction ${txn.transactionId}:`);
    if (!reason || !reason.trim()) return;
    try {
      setActionTxnLoading(txn._id);
      await api.put(`/material/transactions/${txn._id}/reject`, {
        reason: reason.trim()
      }).catch(() => api.put(`/transactions/${txn._id}/reject`, {
        reason: reason.trim()
      }));
      alert(`Transaction ${txn.transactionId} rejected.`);
      fetchDashboardData(true);
    } catch (err) {
      alert(err.response?.data?.message || 'Rejection failed.');
    } finally {
      setActionTxnLoading(null);
    }
  };

  const getBarcodesForTxn = (txn) => {
    if (!txn) return [];
    // 1. Match from fetched barcodes list
    const txnBcs = barcodes.filter(b =>
      b.transactionId === txn.transactionId ||
      b.transaction === txn._id ||
      (b.transaction?._id && b.transaction._id === txn._id)
    );
    if (txnBcs.length > 0) return txnBcs;

    // 2. Fallback: extract embedded barcodes from materials array
    if (txn.materials && Array.isArray(txn.materials)) {
      const extracted = [];
      txn.materials.forEach(m => {
        if (Array.isArray(m.barcodes)) {
          m.barcodes.forEach(b => {
            if (typeof b === 'string') {
              extracted.push({
                barcode: b,
                materialName: m.name || m.materialName || 'Material Unit',
                status: ['closed', 'completed'].includes(txn.status) ? 'Closed' : 'Active',
                owner: txn.requester
              });
            } else if (b && (b.barcode || b.code)) {
              extracted.push({
                barcode: b.barcode || b.code,
                materialName: m.name || m.materialName || 'Material Unit',
                status: b.status || (['closed', 'completed'].includes(txn.status) ? 'Closed' : 'Active'),
                owner: b.owner || txn.requester
              });
            }
          });
        }
      });
      if (extracted.length > 0) return extracted;
    }
    return [];
  };

  const renderModals = () => {
    return (
      <>
        {/* Active Barcode Action Modal */}
        {activeBarcodeAction?.type === 'transfer' && (
          <TransferFormModal
            isOpen={true}
            onClose={() => setActiveBarcodeAction(null)}
            barcode={activeBarcodeAction.barcode}
            onSuccess={() => {
              setActiveBarcodeAction(null);
              fetchDashboardData(true);
            }}
          />
        )}
        {activeBarcodeAction?.type === 'return' && (
          <ReturnFormModal
            isOpen={true}
            onClose={() => setActiveBarcodeAction(null)}
            barcode={activeBarcodeAction.barcode}
            onSuccess={() => {
              setActiveBarcodeAction(null);
              fetchDashboardData(true);
            }}
          />
        )}
        {activeBarcodeAction?.type === 'split' && (
          <SplitLotModal
            isOpen={true}
            onClose={() => setActiveBarcodeAction(null)}
            barcode={activeBarcodeAction.barcode}
            onSuccess={() => {
              setActiveBarcodeAction(null);
              fetchDashboardData(true);
            }}
          />
        )}

        {/* Transaction Barcodes Inspector Modal */}
        {selectedTxnBarcodesModal && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
            <div className="bg-white border border-slate-200 p-6 rounded-3xl w-full max-w-2xl shadow-2xl animate-in zoom-in-95 duration-200 max-h-[85vh] flex flex-col">
              <div className="flex justify-between items-center pb-4 border-b border-slate-100 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-2xl">
                    <Package className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900">
                      Transaction Barcodes: {selectedTxnBarcodesModal.transactionId}
                    </h3>
                    <p className="text-xs text-slate-500 font-medium">
                      Manage unit custody, handovers, returns, and splits
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedTxnBarcodesModal(null)}
                  className="p-1.5 hover:bg-slate-100 rounded-xl text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="overflow-y-auto py-4 flex-1 space-y-3">
                {(() => {
                  const txnBcs = getBarcodesForTxn(selectedTxnBarcodesModal);
                  if (txnBcs.length === 0) {
                    return (
                      <div className="text-center py-10 text-slate-400 font-semibold text-xs">
                        No individual barcode documents found for this transaction.
                      </div>
                    );
                  }
                  return txnBcs.map((bc) => {
                    const isBcActive = ['active', 'exchanged', 'issued'].includes((bc.status || '').toLowerCase());
                    return (
                      <div
                        key={bc._id || bc.barcode}
                        className="bg-slate-50/80 border border-slate-200/80 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span
                              onClick={() => {
                                setSelectedTxnBarcodesModal(null);
                                navigate(`/barcodes/${bc.barcode}`);
                              }}
                              className="font-mono font-bold text-sm text-indigo-600 hover:underline cursor-pointer"
                            >
                              {bc.barcode}
                            </span>
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                (bc.status || '').toLowerCase() === 'active'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : (bc.status || '').toLowerCase() === 'exchanged'
                                  ? 'bg-blue-100 text-blue-800'
                                  : (bc.status || '').toLowerCase() === 'returned'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-slate-200 text-slate-700'
                              }`}
                            >
                              {bc.status || 'Active'}
                            </span>
                          </div>
                          <p className="text-xs font-bold text-slate-800 mt-1">
                            {bc.materialName || 'Material Unit'}
                          </p>
                          <p className="text-[11px] text-slate-500 font-medium">
                            Custodian: {bc.owner?.fullName || bc.owner?.name || (typeof bc.owner === 'string' ? bc.owner : 'Active Owner')}
                          </p>
                        </div>

                        {/* Barcode Quick Actions */}
                        <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                          {isBcActive && (
                            <>
                              <button
                                onClick={() => {
                                  setSelectedTxnBarcodesModal(null);
                                  setActiveBarcodeAction({ type: 'transfer', barcode: bc });
                                }}
                                className="px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                              >
                                <Send size={12} />
                                Transfer
                              </button>
                              <button
                                onClick={() => {
                                  setSelectedTxnBarcodesModal(null);
                                  setActiveBarcodeAction({ type: 'return', barcode: bc });
                                }}
                                className="px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 rounded-xl text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                              >
                                <Reply size={12} />
                                Return
                              </button>
                              <button
                                onClick={() => {
                                  setSelectedTxnBarcodesModal(null);
                                  setActiveBarcodeAction({ type: 'split', barcode: bc });
                                }}
                                className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-xl text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                              >
                                <Split size={12} />
                                Split
                              </button>
                            </>
                          )}
                          <button
                            onClick={() => {
                              setSelectedTxnBarcodesModal(null);
                              navigate(`/barcodes/${bc.barcode}`);
                            }}
                            className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                          >
                            <Eye size={12} />
                            View
                          </button>
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-between items-center shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const tId = selectedTxnBarcodesModal._id;
                    setSelectedTxnBarcodesModal(null);
                    navigate(`/transactions/${tId}`);
                  }}
                >
                  Full Transaction Details
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedTxnBarcodesModal(null)}
                >
                  Close
                </Button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  };

  if (loading) {
    return (
      <div className="h-[60vh] w-full flex flex-col items-center justify-center gap-3">
        <Spinner size="lg" />
        <p className="text-xs font-semibold text-slate-500 tracking-wider">
          Loading material movement analytics...
        </p>
      </div>
    );
  }

  const totalItemsCount = (stats?.activeItems || 0) + (stats?.exchanged || 0) + (stats?.returned || 0) + (stats?.closed || 0);
  const pieData = [
    { name: 'Active', value: stats?.activeItems || 0, color: '#10b981' },
    { name: 'Exchanged', value: stats?.exchanged || 0, color: '#3b82f6' },
    { name: 'Returned', value: stats?.returned || 0, color: '#f59e0b' },
    { name: 'Closed', value: stats?.closed || 0, color: '#64748b' }
  ];

  const getProgressPercentage = (row) => {
    if (!row) return 0;
    const statusLower = (row.status || '').toLowerCase();
    if (statusLower === 'rejected' || statusLower === 'cancelled') {
      return 100;
    }
    if (statusLower === 'closed' || statusLower === 'completed') {
      return 100;
    }
    if (statusLower === 'draft') {
      return 5;
    }

    let baseProgress = 0;
    if (['submitted', 'tl_approved', 'mgt_approved', 'store_accepted', 'handler_assigned', 'dispatched', 'received', 'active', 'partially_returned'].includes(statusLower)) {
      baseProgress += 15;
    }
    if (['tl_approved', 'mgt_approved', 'store_accepted', 'handler_assigned', 'dispatched', 'received', 'active', 'partially_returned'].includes(statusLower)) {
      baseProgress += 15;
    }
    if (['mgt_approved', 'store_accepted', 'handler_assigned', 'dispatched', 'received', 'active', 'partially_returned'].includes(statusLower)) {
      baseProgress += 15;
    }
    if (['store_accepted', 'handler_assigned', 'dispatched', 'received', 'active', 'partially_returned'].includes(statusLower)) {
      baseProgress += 15;
    }
    if (['received', 'active', 'partially_returned'].includes(statusLower)) {
      baseProgress += 20;
    }

    let itemsProgress = 0;
    let totalItems = 0;
    if (row.materials && row.materials.length > 0) {
      row.materials.forEach(m => {
        if (m.barcodes && m.barcodes.length > 0) {
          totalItems += m.barcodes.length;
        } else {
          totalItems += m.quantity || 0;
        }
      });
    }
    if (!totalItems) {
      totalItems = row.totalItems || 0;
    }

    let returnedOrClosed = (row.returnedItems || 0) + (row.closedItems || 0);
    if (totalItems > 0) {
      const pctPerItem = 20 / totalItems;
      itemsProgress = returnedOrClosed * pctPerItem;
    }

    let finalProgress = Math.round(baseProgress + itemsProgress);
    if (finalProgress > 100) finalProgress = 100;
    return finalProgress;
  };

  const getStatusBadge = (status) => {
    const rawStr = typeof status === 'string'
      ? status
      : (status && typeof status === 'object' ? (status.status || status.name || status.label || 'submitted') : String(status || ''));
    const s = rawStr.toLowerCase();
    switch (s) {
      case 'draft':
        return <Badge variant="default">Draft</Badge>;
      case 'submitted':
        return <Badge variant="warning">Submitted</Badge>;
      case 'tl_approved':
        return <Badge variant="warning">TL Approved</Badge>;
      case 'mgt_approved':
        return <Badge variant="warning">Mgt Approved</Badge>;
      case 'store_accepted':
        return <Badge variant="info">Store Accepted</Badge>;
      case 'handler_assigned':
        return <Badge variant="info">Handler Assigned</Badge>;
      case 'dispatched':
        return <Badge variant="purple">Dispatched</Badge>;
      case 'received':
        return <Badge variant="info">Received</Badge>;
      case 'active':
        return <Badge variant="success">Active</Badge>;
      case 'partially_returned':
        return <Badge variant="warning">Partially Returned</Badge>;
      case 'closed':
      case 'completed':
        return <Badge variant="secondary">Closed</Badge>;
      case 'cancelled':
        return <Badge variant="default">Cancelled</Badge>;
      case 'rejected':
        return <Badge variant="danger">Rejected</Badge>;
      default:
        return <Badge variant="default">{rawStr ? rawStr.replace(/_/g, ' ') : 'Unknown'}</Badge>;
    }
  };

  const filteredTransactions = transactions.filter(t => {
    const searchLower = searchQuery.toLowerCase().trim();
    const matchesSearch = !searchLower ||
      t.transactionId?.toLowerCase().includes(searchLower) ||
      t.requester?.fullName?.toLowerCase().includes(searchLower) ||
      t.requester?.name?.toLowerCase().includes(searchLower) ||
      t.department?.name?.toLowerCase().includes(searchLower) ||
      (t.documentType || '').toLowerCase().includes(searchLower) ||
      t.materials?.some(m => m.name?.toLowerCase().includes(searchLower));

    let matchesStatus = true;
    const s = (t.status || '').toLowerCase();
    if (statusFilter === 'completed') {
      matchesStatus = ['closed', 'completed'].includes(s);
    } else if (statusFilter === 'pending') {
      matchesStatus = ['submitted', 'tl_approved', 'mgt_approved'].includes(s);
    } else if (statusFilter === 'in_progress') {
      matchesStatus = ['store_accepted', 'handler_assigned', 'dispatched', 'received', 'active', 'partially_returned'].includes(s);
    } else if (statusFilter === 'rejected') {
      matchesStatus = s === 'rejected';
    } else if (statusFilter === 'draft') {
      matchesStatus = s === 'draft';
    } else if (statusFilter === 'cancelled') {
      matchesStatus = s === 'cancelled';
    }

    // Document type filter
    let matchesDocType = true;
    if (docTypeFilter !== 'all') {
      matchesDocType = (t.documentType || 'RDC').toLowerCase() === docTypeFilter.toLowerCase();
    }

    return matchesSearch && matchesStatus && matchesDocType;
  });

  const displayedTransactions = viewMode === 'recent' && !searchQuery && statusFilter === 'all' && docTypeFilter === 'all'
    ? filteredTransactions.slice(0, 5)
    : filteredTransactions;

  return (
    <div className="flex flex-col gap-6 animate-fade-up pb-10">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs">
        <div>
          <h1 className="text-xl font-bold text-slate-900 m-0 flex items-center gap-2">
            <ArrowRightLeft className="w-6 h-6 text-indigo-600" />
            Material Movement Dashboard
          </h1>
          <p className="text-xs text-slate-500 mt-1 font-medium">Overview of material transactions, active barcodes, and circulation logs</p>
        </div>
        <div className="flex items-center gap-2.5">
          <Button variant="outline" size="sm" onClick={() => fetchDashboardData(true)} disabled={refreshing} icon={RefreshCw}>
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </Button>
          <Button variant="primary" size="sm" onClick={() => navigate('/material-activity-log')} icon={Activity}>
            Activity Monitor
          </Button>
        </div>
      </div>

      {/* KPI Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs hover:shadow-md transition-shadow flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-500 block">Active Items</span>
            <span className="text-2xl font-bold text-slate-900 mt-1 block">{stats?.activeItems ?? 0}</span>
            <span className="text-[11px] text-emerald-600 font-semibold mt-1 inline-block">In Circulation</span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <Activity className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs hover:shadow-md transition-shadow flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-500 block">Exchanged</span>
            <span className="text-2xl font-bold text-slate-900 mt-1 block">{stats?.exchanged ?? 0}</span>
            <span className="text-[11px] text-blue-600 font-semibold mt-1 inline-block">Warranty Exchanges</span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <RefreshCw className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs hover:shadow-md transition-shadow flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-500 block">Returned</span>
            <span className="text-2xl font-bold text-slate-900 mt-1 block">{stats?.returned ?? 0}</span>
            <span className="text-[11px] text-amber-600 font-semibold mt-1 inline-block">Returned to Store</span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
            <RotateCcw className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs hover:shadow-md transition-shadow flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-500 block">Closed</span>
            <span className="text-2xl font-bold text-slate-900 mt-1 block">{stats?.closed ?? 0}</span>
            <span className="text-[11px] text-slate-500 font-semibold mt-1 inline-block">Completed Transactions</span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Items by Status Donut Chart */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div className="border-b border-slate-100 pb-3 mb-2">
            <h3 className="text-base font-bold text-slate-900">Items by Status</h3>
            <p className="text-xs text-slate-500">Distribution of all material items</p>
          </div>
          <div className="h-56 w-full flex items-center relative my-2">
            <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={150} debounce={50}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={75}
                  paddingAngle={4}
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '12px',
                    fontSize: '12px',
                    color: '#0f172a',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)'
                  }}
                />
              </PieChart>
            </ResponsiveContainer>

            {/* Total count in center */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-[10px] font-bold text-slate-400 tracking-wider">Total</span>
              <span className="text-2xl font-bold text-slate-900 mt-0.5">{totalItemsCount}</span>
            </div>
          </div>

          <div className="flex flex-col gap-2 pt-3 border-t border-slate-100">
            {pieData.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between text-xs font-medium">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                  <span className="text-slate-700 capitalize font-semibold">{item.name}</span>
                </div>
                <span className="text-slate-900 font-bold">
                  {item.value} ({totalItemsCount > 0 ? Math.round((item.value / totalItemsCount) * 100) : 0}%)
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Barcodes Registered Line/Area Chart */}
        <div className="lg:col-span-2 bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-2">
            <div>
              <h3 className="text-base font-bold text-slate-900">Barcodes Registered (This Month)</h3>
              <p className="text-xs text-slate-500">Daily registration and circulation trends</p>
            </div>
            <span className="bg-indigo-50 text-indigo-700 text-xs font-bold px-3 py-1 rounded-full">
              Trend View
            </span>
          </div>

          <div className="h-[250px] w-full mt-2">
            {charts.daily.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-slate-400">No trend data available</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={150} debounce={50}>
                <AreaChart data={charts.daily} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorActive" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorExchanged" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorReturned" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorClosed" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#64748b" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#64748b" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: '#64748b', fontSize: 10 }}
                    stroke="transparent"
                    tickFormatter={(str) => {
                      try {
                        const date = new Date(str);
                        return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
                      } catch {
                        return str;
                      }
                    }}
                  />
                  <YAxis tick={{ fill: '#64748b', fontSize: 10 }} stroke="transparent" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#ffffff',
                      border: '1px solid #e2e8f0',
                      borderRadius: '12px',
                      fontSize: '12px',
                      color: '#0f172a',
                      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)'
                    }}
                    labelFormatter={(label) => {
                      try {
                        const date = new Date(label);
                        return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
                      } catch {
                        return label;
                      }
                    }}
                  />
                  <Area name="Active" type="monotone" dataKey="Active" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorActive)" />
                  <Area name="Exchanged" type="monotone" dataKey="Exchanged" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#colorExchanged)" />
                  <Area name="Returned" type="monotone" dataKey="Returned" stroke="#f59e0b" strokeWidth={2} fillOpacity={1} fill="url(#colorReturned)" />
                  <Area name="Closed" type="monotone" dataKey="Closed" stroke="#64748b" strokeWidth={2} fillOpacity={1} fill="url(#colorClosed)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Material Movement Transactions Table Card */}
      <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-slate-900">Material Movement Transactions & Actions</h3>
            <p className="text-xs text-slate-500">
              Complete register of material requisitions, dispatches, active barcodes, and approval actions ({transactions.length} total)
            </p>
          </div>

          {/* Filter and View Controls */}
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search Txn ID, Requester, Item..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-3 py-1.5 text-xs border border-slate-200 rounded-xl bg-slate-50 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 w-60 font-medium"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-1.5 text-xs border border-slate-200 rounded-xl bg-slate-50 text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-semibold"
            >
              <option value="all">All Statuses</option>
              <option value="draft">Draft</option>
              <option value="pending">Pending Approval</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed / Closed</option>
              <option value="cancelled">Cancelled</option>
              <option value="rejected">Rejected</option>
            </select>
            <select
              value={docTypeFilter}
              onChange={(e) => setDocTypeFilter(e.target.value)}
              className="px-3 py-1.5 text-xs border border-slate-200 rounded-xl bg-slate-50 text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-semibold"
            >
              <option value="all">All Doc Types</option>
              <option value="RDC">RDC</option>
              <option value="DC">DC</option>
              <option value="Invoice">Invoice</option>
              <option value="Emergency Send">Emergency Send</option>
            </select>
            <div className="flex border border-slate-200 rounded-xl overflow-hidden p-0.5 bg-slate-100">
              <button
                type="button"
                onClick={() => setViewMode('recent')}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition ${
                  viewMode === 'recent' && !searchQuery && statusFilter === 'all' && docTypeFilter === 'all'
                    ? 'bg-white text-indigo-600 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Recent (5)
              </button>
              <button
                type="button"
                onClick={() => setViewMode('all')}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition ${
                  viewMode === 'all' || searchQuery || statusFilter !== 'all' || docTypeFilter !== 'all'
                    ? 'bg-white text-indigo-600 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                View All ({transactions.length})
              </button>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold">
              <tr>
                <th className="py-3.5 px-4">Transaction ID</th>
                <th className="py-3.5 px-4">Requester & Dept</th>
                <th className="py-3.5 px-4">Materials / Barcodes</th>
                <th className="py-3.5 px-4">Date</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4">Progress</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {displayedTransactions.map((t) => {
                const progressPct = getProgressPercentage(t);
                const dateStr = new Date(t.createdAt).toLocaleDateString('en-IN', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric'
                });
                const txnBcs = getBarcodesForTxn(t);
                const activeBcs = txnBcs.filter(b => ['active', 'exchanged', 'issued'].includes((b.status || '').toLowerCase()));
                const isPendingApproval = ['submitted', 'tl_approved', 'mgt_approved'].includes((t.status || '').toLowerCase());
                const isApproverRole = ['super_admin', 'admin', 'company_admin', 'team_lead'].includes(activeRole.role) ||
                  (activeRole.role === 'department_admin' && activeRole.adminType === 'management');

                const isExpanded = expandedTxnId === t._id;

                return (
                  <tr key={t._id || t.transactionId} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-4 px-4">
                      <div className="flex flex-col gap-0.5">
                        <span
                          onClick={() => navigate(`/transactions/${t._id}`)}
                          className="font-bold text-indigo-600 hover:text-indigo-800 hover:underline cursor-pointer font-mono"
                        >
                          {typeof t.transactionId === 'string' ? t.transactionId : (t.transactionId?._id || t._id || 'TXN')}
                        </span>
                        <span className="text-[10px] text-slate-400 font-semibold uppercase">
                          {typeof t.documentType === 'string' ? t.documentType : (t.documentType?.name || 'Requisition')}
                        </span>
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex flex-col">
                        <span className="font-bold text-slate-900">
                          {t.requester?.fullName || t.requester?.name || t.requester?.email || (typeof t.requester === 'string' ? t.requester : 'System User')}
                        </span>
                        <span className="text-[11px] text-slate-400 font-medium">
                          {typeof t.department === 'string' ? t.department : (t.department?.name || 'Department')}
                        </span>
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex flex-col gap-1 max-w-[200px]">
                        <span className="truncate text-slate-800 font-semibold">
                          {t.materials && t.materials.length > 0
                            ? t.materials.map(m => (typeof m === 'string' ? m : (m.name || m.materialName || 'Item'))).filter(Boolean).join(', ')
                            : `${typeof t.totalItems === 'number' ? t.totalItems : 1} Item(s)`}
                        </span>
                        <div className="flex items-center gap-1.5">
                          {txnBcs.length > 0 ? (
                            <button
                              onClick={() => setSelectedTxnBarcodesModal(t)}
                              className="text-[10px] font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-2 py-0.5 rounded-md border border-indigo-100 flex items-center gap-1 cursor-pointer"
                            >
                              <Package size={10} />
                              {txnBcs.length} Barcode{txnBcs.length > 1 ? 's' : ''} ({activeBcs.length} Active)
                            </button>
                          ) : (
                            <span className="text-[10px] text-slate-400 font-medium">
                              Qty: {typeof t.totalItems === 'number' ? t.totalItems : 1}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-4 text-slate-500 font-medium">{dateStr}</td>
                    <td className="py-4 px-4">
                      {getStatusBadge(t.status)}
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-2">
                        <div className="w-20 bg-slate-100 rounded-full h-1.5 overflow-hidden shrink-0">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              (t.status || '').toLowerCase() === 'rejected'
                                ? 'bg-rose-500'
                                : (t.status || '').toLowerCase() === 'cancelled'
                                ? 'bg-slate-300'
                                : (t.status || '').toLowerCase() === 'closed'
                                ? 'bg-slate-400'
                                : (t.status || '').toLowerCase() === 'draft'
                                ? 'bg-slate-300'
                                : 'bg-emerald-500'
                            }`}
                            style={{ width: `${progressPct}%` }}
                          />
                        </div>
                        <span className="text-[11px] font-bold text-slate-600">{progressPct}%</span>
                      </div>
                    </td>
                    <td className="py-4 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5 flex-wrap">
                        {/* Quick View Details Button */}
                        <button
                          onClick={() => navigate(`/transactions/${t._id}`)}
                          className="px-2.5 py-1.5 bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-600 rounded-xl text-xs font-bold transition border border-slate-200/80 flex items-center gap-1 cursor-pointer"
                          title="View Full Details"
                        >
                          <Eye size={13} />
                          Details
                        </button>

                        {/* Barcodes Quick Actions Button */}
                        {txnBcs.length > 0 && (
                          <button
                            onClick={() => setSelectedTxnBarcodesModal(t)}
                            className="px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-bold transition border border-indigo-200/80 flex items-center gap-1 cursor-pointer"
                            title="Inspect Barcodes & Perform Actions"
                          >
                            <Package size={13} />
                            Barcodes
                          </button>
                        )}

                        {/* Pending Approver Inline Controls */}
                        {isPendingApproval && isApproverRole && (
                          <>
                            <button
                              onClick={() => handleQuickApprove(t)}
                              disabled={actionTxnLoading === t._id}
                              className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-xl text-xs font-bold transition border border-emerald-200/80 flex items-center gap-1 cursor-pointer disabled:opacity-50"
                              title="Approve Requisition"
                            >
                              <Check size={13} />
                              Approve
                            </button>
                            <button
                              onClick={() => handleQuickReject(t)}
                              disabled={actionTxnLoading === t._id}
                              className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl text-xs font-bold transition border border-rose-200/80 flex items-center gap-1 cursor-pointer disabled:opacity-50"
                              title="Reject Requisition"
                            >
                              <XCircle size={13} />
                              Reject
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {displayedTransactions.length === 0 && (
                <tr>
                  <td colSpan="7" className="py-12 text-center text-slate-400 font-semibold">
                    No material movement transactions found matching your criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {renderModals()}
    </div>
  );
};

export default MaterialMovementDashboardPage;
