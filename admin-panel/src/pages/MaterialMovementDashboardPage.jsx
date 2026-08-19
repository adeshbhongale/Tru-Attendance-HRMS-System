import {
  Activity,
  ArrowRightLeft,
  CheckCircle2,
  PackageCheck,
  RefreshCw,
  RotateCcw,
  Search
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
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
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import Spinner from '../components/ui/Spinner';
import useActiveRole from '../hooks/useActiveRole';
import api from '../api/axios';
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

  // Modal states
  const [activeBarcodeAction, setActiveBarcodeAction] = useState(null);
  const [employees, setEmployees] = useState([]);

  // Dashboard filter & view mode states
  const [viewMode, setViewMode] = useState('all'); // 'recent' | 'all'
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const fetchDashboardData = async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    else setRefreshing(true);

    try {
      const [statsRes, chartsRes, recentRes, txnRes, bcRes] = await Promise.all([
        api.get('/dashboard/stats').catch(() => ({ data: { data: {} } })),
        api.get('/dashboard/charts').catch(() => ({ data: { data: {} } })),
        api.get('/dashboard/recent').catch(() => ({ data: { data: [] } })),
        api.get('/transactions?limit=5000').catch(() => ({ data: { data: [] } })),
        api.get('/barcodes?limit=5000').catch(() => ({ data: { data: [] } }))
      ]);

      let txnsList = Array.isArray(txnRes.data?.data) ? txnRes.data.data : (Array.isArray(txnRes.data?.transactions) ? txnRes.data.transactions : (Array.isArray(txnRes.data) ? txnRes.data : []));
      let bcList = Array.isArray(bcRes.data?.data) ? bcRes.data.data : (Array.isArray(bcRes.data?.barcodes) ? bcRes.data.barcodes : (Array.isArray(bcRes.data) ? bcRes.data : []));

      const isCentralRole = ['super_admin', 'admin', 'company_admin'].includes(user?.role) ||
        (user?.role === 'department_admin' && ['store', 'management', 'accounts'].includes(user?.departmentAdminType));

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

          if ((user?.role === 'team_lead' || user?.role === 'department_admin') && deptId === curUserDeptId) {
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
      setActivities(recentRes.data?.data || []);

      const activeItemsCount = bcList.filter(b => b.status === 'Active').length;
      const exchangeCount = bcList.filter(b => b.status === 'Exchanged').length;
      const returnedCount = bcList.filter(b => b.status === 'Returned').length;

      const closedItemsCount = txnsList
        .filter(t => ['closed', 'completed', 'rejected'].includes(t.status))
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
        if (!['closed', 'completed', 'rejected'].includes(t.status)) return;
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
          dailyBarcodesMap[dateStr].closed += (count || t.totalItems || 0);
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
      const docType = (chartData.docTypeDistribution || []).map((d) => ({ name: d._id, value: d.count }));
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
    api.get('/employees').then(res => {
      setEmployees((res.data.employees || res.data.data || []).map(e => ({ value: e._id, label: `${e.fullName} (${e.employeeId})` })));
    }).catch(err => console.error(err));
  }, [activeRole.role, activeRole.adminType]);

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

  const renderModals = () => {
    if (!activeBarcodeAction) return null;
    if (activeBarcodeAction.type === 'transfer') {
      return (
        <TransferFormModal
          isOpen={true}
          onClose={() => setActiveBarcodeAction(null)}
          barcode={activeBarcodeAction.barcode}
          onSuccess={() => {
            setActiveBarcodeAction(null);
            fetchDashboardData(true);
          }}
        />
      );
    }
    if (activeBarcodeAction.type === 'return') {
      return (
        <ReturnFormModal
          isOpen={true}
          onClose={() => setActiveBarcodeAction(null)}
          barcode={activeBarcodeAction.barcode}
          onSuccess={() => {
            setActiveBarcodeAction(null);
            fetchDashboardData(true);
          }}
        />
      );
    }
    if (activeBarcodeAction.type === 'split') {
      return (
        <SplitLotModal
          isOpen={true}
          onClose={() => setActiveBarcodeAction(null)}
          barcode={activeBarcodeAction.barcode}
          onSuccess={() => {
            setActiveBarcodeAction(null);
            fetchDashboardData(true);
          }}
        />
      );
    }
    return null;
  };

  const totalItemsCount = (stats?.activeItems || 0) + (stats?.exchanged || 0) + (stats?.returned || 0) + (stats?.closed || 0);
  const pieData = [
    { name: 'Active', value: stats?.activeItems || 0, color: '#10b981' },
    { name: 'Exchanged', value: stats?.exchanged || 0, color: '#3b82f6' },
    { name: 'Returned', value: stats?.returned || 0, color: '#f59e0b' },
    { name: 'Closed', value: stats?.closed || 0, color: '#64748b' }
  ];

  const getProgressPercentage = (row) => {
    if (!row) return 0;
    const statusLower = row.status?.toLowerCase() || '';
    if (statusLower === 'rejected' || statusLower === 'cancelled') {
      return 100;
    }

    let baseProgress = 0;
    if (['submitted', 'tl_approved', 'mgt_approved', 'store_accepted', 'handler_assigned', 'dispatched', 'received', 'active', 'partially_returned', 'closed', 'completed'].includes(statusLower)) {
      baseProgress += 10;
    }
    if (['tl_approved', 'mgt_approved', 'store_accepted', 'handler_assigned', 'dispatched', 'received', 'active', 'partially_returned', 'closed', 'completed'].includes(statusLower)) {
      baseProgress += 10;
    }
    if (['mgt_approved', 'store_accepted', 'handler_assigned', 'dispatched', 'received', 'active', 'partially_returned', 'closed', 'completed'].includes(statusLower)) {
      baseProgress += 10;
    }
    if (['store_accepted', 'handler_assigned', 'dispatched', 'received', 'active', 'partially_returned', 'closed', 'completed'].includes(statusLower)) {
      baseProgress += 10;
    }
    if (['received', 'active', 'partially_returned', 'closed', 'completed'].includes(statusLower)) {
      baseProgress += 10;
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

    let returnedOrClosed = 0;
    if (row.materials && row.materials.length > 0) {
      row.materials.forEach(m => {
        if (m.barcodes && m.barcodes.length > 0) {
          m.barcodes.forEach(b => {
            if (b.status === 'Returned' || b.status === 'Closed') {
              returnedOrClosed++;
            }
          });
        }
      });
    }
    if (!returnedOrClosed) {
      returnedOrClosed = (row.returnedItems || 0) + (row.closedItems || 0);
    }

    if (totalItems > 0) {
      const pctPerItem = 50 / totalItems;
      itemsProgress = returnedOrClosed * pctPerItem;
    }

    let finalProgress = Math.round(baseProgress + itemsProgress);
    if (finalProgress > 100) finalProgress = 100;
    return finalProgress;
  };

  const filteredTransactions = transactions.filter(t => {
    const matchesSearch = !searchQuery.trim() || 
      t.transactionId?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.requester?.fullName?.toLowerCase().includes(searchQuery.toLowerCase());
    
    let matchesStatus = true;
    if (statusFilter === 'completed') {
      matchesStatus = ['closed', 'completed'].includes(t.status);
    } else if (statusFilter === 'pending') {
      matchesStatus = ['submitted', 'tl_approved', 'mgt_approved'].includes(t.status);
    } else if (statusFilter === 'in_progress') {
      matchesStatus = ['store_accepted', 'handler_assigned', 'dispatched', 'received', 'active', 'partially_returned'].includes(t.status);
    } else if (statusFilter === 'rejected') {
      matchesStatus = t.status === 'rejected';
    }

    return matchesSearch && matchesStatus;
  });

  const displayedTransactions = viewMode === 'recent' && !searchQuery && statusFilter === 'all'
    ? filteredTransactions.slice(0, 5)
    : filteredTransactions;

  return (
    <div className="flex flex-col gap-6 animate-fade-up pb-10">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <h1 className="text-xl font-bold text-slate-900 m-0 flex items-center gap-2">
            <ArrowRightLeft className="w-6 h-6 text-indigo-600" />
            Material Movement Dashboard
          </h1>
          <p className="text-xs text-slate-500 mt-1 font-medium">Overview of material transactions, active barcodes, and circulation logs</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => fetchDashboardData(true)} disabled={refreshing} icon={RefreshCw}>
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </Button>
      </div>

      {/* KPI Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs hover:shadow-md transition-shadow flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-500 block">Active Items</span>
            <span className="text-2xl font-bold text-slate-900 mt-1 block">{stats?.activeItems ?? 0}</span>
            <span className="text-[11px] text-emerald-600 font-semibold mt-1 inline-block">In Circulation</span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <Activity className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs hover:shadow-md transition-shadow flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-500 block">Exchanged</span>
            <span className="text-2xl font-bold text-slate-900 mt-1 block">{stats?.exchanged ?? 0}</span>
            <span className="text-[11px] text-blue-600 font-semibold mt-1 inline-block">Warranty Exchanges</span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <RefreshCw className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs hover:shadow-md transition-shadow flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-500 block">Returned</span>
            <span className="text-2xl font-bold text-slate-900 mt-1 block">{stats?.returned ?? 0}</span>
            <span className="text-[11px] text-amber-600 font-semibold mt-1 inline-block">Returned to Store</span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
            <RotateCcw className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs hover:shadow-md transition-shadow flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-500 block">Closed</span>
            <span className="text-2xl font-bold text-slate-900 mt-1 block">{stats?.closed ?? 0}</span>
            <span className="text-[11px] text-slate-500 font-semibold mt-1 inline-block">Completed Transactions</span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Items by Status Donut Chart */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
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
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total</span>
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
        <div className="lg:col-span-2 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
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
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-slate-900">Material Movement Transactions</h3>
            <p className="text-xs text-slate-500">List of all material dispatches, approvals, and dispatches ({transactions.length} total)</p>
          </div>

          {/* Filter and View Controls */}
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search Txn ID or Requester..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-3 py-1.5 text-xs border border-slate-200 rounded-xl bg-slate-50 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 w-52"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-1.5 text-xs border border-slate-200 rounded-xl bg-slate-50 text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            >
              <option value="all">All Statuses</option>
              <option value="pending">Pending Approval</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed / Closed</option>
              <option value="rejected">Rejected</option>
            </select>
            <div className="flex border border-slate-200 rounded-xl overflow-hidden p-0.5 bg-slate-100">
              <button
                type="button"
                onClick={() => setViewMode('recent')}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition ${
                  viewMode === 'recent' && !searchQuery && statusFilter === 'all'
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
                  viewMode === 'all' || searchQuery || statusFilter !== 'all'
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
                <th className="py-3.5 px-5">Transaction ID</th>
                <th className="py-3.5 px-5">Requester</th>
                <th className="py-3.5 px-5">Date</th>
                <th className="py-3.5 px-5">Status</th>
                <th className="py-3.5 px-5">Progress</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {displayedTransactions.map((t) => {
                const progressPct = getProgressPercentage(t);
                const dateStr = new Date(t.createdAt).toLocaleDateString('en-IN', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: true
                });
                return (
                  <tr key={t._id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-4 px-5">
                      <span
                        onClick={() => navigate(`/transactions/${t._id}`)}
                        className="font-bold text-indigo-600 hover:text-indigo-800 hover:underline cursor-pointer font-mono"
                      >
                        {t.transactionId}
                      </span>
                    </td>
                    <td className="py-4 px-5 font-semibold text-slate-800">{t.requester?.fullName || t.requester?.name || t.requester?.email || (typeof t.requester === 'string' ? t.requester : 'System User')}</td>
                    <td className="py-4 px-5 text-slate-500 font-medium">{dateStr}</td>
                    <td className="py-4 px-5">
                      {t.status === 'closed' || t.status === 'completed' ? (
                        <Badge variant="success">Completed</Badge>
                      ) : t.status === 'rejected' ? (
                        <Badge variant="danger">Closed</Badge>
                      ) : ['submitted', 'tl_approved', 'mgt_approved'].includes(t.status) ? (
                        <Badge variant="warning">Pending</Badge>
                      ) : (
                        <Badge variant="info">In Progress</Badge>
                      )}
                    </td>
                    <td className="py-4 px-5">
                      <div className="flex items-center gap-3">
                        <div className="w-28 bg-slate-100 rounded-full h-2 overflow-hidden shrink-0">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              t.status === 'rejected' ? 'bg-rose-500' : 'bg-emerald-500'
                            }`}
                            style={{ width: `${progressPct}%` }}
                          />
                        </div>
                        <span className="text-xs font-bold text-slate-600">{progressPct}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {displayedTransactions.length === 0 && (
                <tr>
                  <td colSpan="5" className="py-12 text-center text-slate-400 font-semibold">No material movement transactions found.</td>
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
