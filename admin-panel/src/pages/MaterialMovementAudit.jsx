import React, { useState, useEffect } from 'react';
import {
  Activity,
  Search,
  Filter,
  RefreshCw,
  Eye,
  Calendar,
  Layers,
  ArrowRightLeft,
  PackageCheck,
  RotateCcw,
  Building2,
  User,
  ShieldCheck,
  FileSpreadsheet,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  MapPin,
  Camera,
  ExternalLink,
  ChevronRight,
  Database
} from 'lucide-react';
import api from '../api/axios';
import toast from 'react-hot-toast';

const MaterialMovementAudit = () => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState({
    summary: {
      totalActivities: 0,
      totalTransactions: 0,
      totalDispatches: 0,
      totalReceives: 0,
      totalTransfers: 0,
      totalReturns: 0,
      tallySyncedCount: 0
    },
    auditLogs: [],
    transactions: [],
    transfers: [],
    returns: []
  });

  // Filters & State
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedItem, setSelectedItem] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    fetchData();
  }, [selectedCategory]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await api.get('/material/audit-logs/activities', {
        params: {
          category: selectedCategory,
          search: searchQuery
        }
      });
      if (res.data && res.data.success) {
        setData(res.data);
      } else {
        toast.error('Failed to load material movement logs.');
      }
    } catch (err) {
      console.error('Audit fetch error:', err);
      toast.error('Error fetching material movement activity logs.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchData();
  };

  const openInspector = (item) => {
    setSelectedItem(item);
    setIsModalOpen(true);
  };

  // Helper badge color
  const getActionBadge = (action = '') => {
    const act = action.toUpperCase();
    if (act.includes('RECEIVE') || act.includes('ACCEPT') || act.includes('APPROVE') || act.includes('COMPLETED')) {
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    }
    if (act.includes('DISPATCH') || act.includes('TRANSFER') || act.includes('INITIATED')) {
      return 'bg-indigo-50 text-indigo-700 border-indigo-200';
    }
    if (act.includes('REJECT') || act.includes('CANCEL')) {
      return 'bg-rose-50 text-rose-700 border-rose-200';
    }
    return 'bg-amber-50 text-amber-700 border-amber-200';
  };

  return (
    <div className="space-y-6 pb-12 max-w-full overflow-x-hidden">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-indigo-900 via-slate-900 to-indigo-950 rounded-3xl p-6 md:p-8 text-white shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div>
            <div className="flex items-center gap-3 mb-2 flex-wrap">
              <span className="px-3 py-1 bg-indigo-500/30 border border-indigo-400/30 rounded-full text-xs font-bold text-indigo-200 uppercase tracking-widest">
                SUPER ADMIN CONSOLE
              </span>
              <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                Live Movement Audit
              </span>
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">
              Material Movement Activity Monitor
            </h1>
            <p className="text-slate-300 text-sm mt-1 max-w-2xl">
              Complete audit log & live activity stream across requisitions, store dispatches, delivery handovers, physical receipts, cross-department transfers, returns, and Tally Prime Stock Journals.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center gap-2 px-4 py-2.5 bg-white/10 hover:bg-white/20 border border-white/20 rounded-2xl text-xs font-bold transition-all shadow-sm cursor-pointer"
            >
              <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
              Refresh Feed
            </button>
          </div>
        </div>

        {/* Summary Metric Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-8 pt-6 border-t border-white/10">
          <div className="bg-white/5 border border-white/10 rounded-2xl p-3.5 backdrop-blur-md">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total Actions</p>
            <p className="text-xl font-extrabold text-white mt-1">{data.summary.totalActivities}</p>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-2xl p-3.5 backdrop-blur-md">
            <p className="text-[11px] font-bold text-indigo-300 uppercase tracking-wider">Requisitions</p>
            <p className="text-xl font-extrabold text-indigo-200 mt-1">{data.summary.totalTransactions}</p>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-2xl p-3.5 backdrop-blur-md">
            <p className="text-[11px] font-bold text-blue-300 uppercase tracking-wider">Dispatches</p>
            <p className="text-xl font-extrabold text-blue-200 mt-1">{data.summary.totalDispatches}</p>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-2xl p-3.5 backdrop-blur-md">
            <p className="text-[11px] font-bold text-emerald-300 uppercase tracking-wider">Receipts</p>
            <p className="text-xl font-extrabold text-emerald-200 mt-1">{data.summary.totalReceives}</p>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-2xl p-3.5 backdrop-blur-md">
            <p className="text-[11px] font-bold text-purple-300 uppercase tracking-wider">Transfers</p>
            <p className="text-xl font-extrabold text-purple-200 mt-1">{data.summary.totalTransfers}</p>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-2xl p-3.5 backdrop-blur-md">
            <p className="text-[11px] font-bold text-amber-300 uppercase tracking-wider">Tally Synced</p>
            <p className="text-xl font-extrabold text-amber-200 mt-1">{data.summary.tallySyncedCount}</p>
          </div>
        </div>
      </div>

      {/* Control Bar: Filters & Search */}
      <div className="bg-white rounded-3xl p-4 md:p-5 border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row gap-4 justify-between items-stretch lg:items-center">
          {/* Category Filter Tabs (Wrapping gracefully without horizontal scroll) */}
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { id: 'ALL', label: 'All Activities', icon: <Activity size={14} /> },
              { id: 'REQUISITION', label: 'Requisitions & Approvals', icon: <Layers size={14} /> },
              { id: 'STORE', label: 'Store Dispatches', icon: <Building2 size={14} /> },
              { id: 'RECEIVING', label: 'Physical Receipts', icon: <PackageCheck size={14} /> },
              { id: 'TRANSFER', label: 'Transfers & Handovers', icon: <ArrowRightLeft size={14} /> },
              { id: 'RETURN', label: 'Store Returns', icon: <RotateCcw size={14} /> },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setSelectedCategory(tab.id)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                  selectedCategory === tab.id
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-100'
                    : 'bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search Input */}
          <form onSubmit={handleSearchSubmit} className="relative w-full lg:w-72 shrink-0">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search barcode, employee, voucher..."
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
            />
          </form>
        </div>
      </div>

      {/* Main Content Area */}
      {loading ? (
        <div className="bg-white rounded-3xl p-12 border border-slate-200 shadow-sm text-center">
          <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm font-bold text-slate-600">Loading material movement activity log...</p>
        </div>
      ) : data.auditLogs.length === 0 ? (
        <div className="bg-white rounded-3xl p-12 border border-slate-200 shadow-sm text-center">
          <Database size={40} className="text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-800">No Activity Logs Found</h3>
          <p className="text-xs text-slate-500 mt-1">Try adjusting your category filter or search terms.</p>
        </div>
      ) : (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden w-full">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <span className="text-xs font-extrabold text-slate-700 uppercase tracking-wider">
              Chronological Activity Log ({data.auditLogs.length} Records)
            </span>
          </div>

          <div className="w-full overflow-x-hidden">
            <table className="w-full text-left border-collapse table-fixed">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-100 text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">
                  <th className="px-4 py-3.5 w-1/4">Action & Timestamp</th>
                  <th className="px-4 py-3.5 w-1/5">Performed By</th>
                  <th className="px-4 py-3.5 w-1/6">Entity / Reference</th>
                  <th className="px-4 py-3.5 w-1/3">Activity Description</th>
                  <th className="px-4 py-3.5 w-20 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {data.auditLogs.map((log) => {
                  const badgeStyle = getActionBadge(log.action);
                  const dateFormatted = new Date(log.createdAt).toLocaleString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  });

                  return (
                    <tr key={log._id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-4 py-4 break-words">
                        <div className="flex flex-col gap-1">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-extrabold border w-fit max-w-full truncate ${badgeStyle}`}>
                            <Activity size={12} className="shrink-0" />
                            <span className="truncate">{log.action}</span>
                          </span>
                          <span className="text-[11px] text-slate-400 font-medium flex items-center gap-1 mt-0.5">
                            <Clock size={11} className="shrink-0" />
                            {dateFormatted}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-4 break-words">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-700 font-extrabold flex items-center justify-center text-xs shrink-0">
                            {(log.user?.fullName || log.userName || 'U')[0]}
                          </div>
                          <div className="min-w-0">
                            <p className="font-bold text-slate-900 truncate">{log.user?.fullName || log.userName || 'System User'}</p>
                            <p className="text-[10px] text-slate-400 truncate">{log.user?.employeeId ? `ID: ${log.user.employeeId}` : log.user?.role || 'User'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 break-words">
                        <div>
                          <span className="font-mono font-bold text-indigo-900 bg-indigo-50/80 px-2 py-0.5 rounded border border-indigo-100 text-[11px] inline-block max-w-full truncate">
                            {log.entityId || 'N/A'}
                          </span>
                          <p className="text-[10px] text-slate-400 font-medium mt-1 truncate">{log.entity || 'Transaction'}</p>
                        </div>
                      </td>
                      <td className="px-4 py-4 break-words">
                        <p className="text-slate-700 font-medium leading-relaxed break-words">
                          {log.description || 'Material movement action performed.'}
                        </p>
                      </td>
                      <td className="px-4 py-4 text-right">
                        <button
                          onClick={() => openInspector(log)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 rounded-xl text-xs font-bold transition-all border border-slate-200 cursor-pointer"
                        >
                          <Eye size={13} />
                          Inspect
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Inspector Modal */}
      {isModalOpen && selectedItem && (
        <div className="fixed inset-0 z-[200] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-100 space-y-5 animate-scale-up">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-indigo-50 text-indigo-700 rounded-2xl border border-indigo-100">
                  <Activity size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-extrabold text-slate-900">Material Activity Log Inspector</h3>
                  <p className="text-xs text-slate-400 font-medium">Log Record ID: {selectedItem._id}</p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-900 bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                <div>
                  <p className="text-slate-400 font-bold uppercase tracking-wider text-[10px]">Action Code</p>
                  <p className="font-extrabold text-indigo-900 text-sm mt-0.5">{selectedItem.action}</p>
                </div>
                <div>
                  <p className="text-slate-400 font-bold uppercase tracking-wider text-[10px]">Timestamp</p>
                  <p className="font-bold text-slate-800 mt-0.5">{new Date(selectedItem.createdAt).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-slate-400 font-bold uppercase tracking-wider text-[10px]">Performed By</p>
                  <p className="font-bold text-slate-800 mt-0.5">{selectedItem.user?.fullName || selectedItem.userName || 'User'}</p>
                </div>
                <div>
                  <p className="text-slate-400 font-bold uppercase tracking-wider text-[10px]">Target Entity ID</p>
                  <p className="font-mono font-bold text-slate-800 mt-0.5">{selectedItem.entityId || 'N/A'}</p>
                </div>
              </div>

              <div>
                <p className="text-slate-400 font-bold uppercase tracking-wider text-[10px] mb-1">Full Description</p>
                <div className="p-3 bg-white border border-slate-200 rounded-xl font-medium text-slate-800 leading-relaxed">
                  {selectedItem.description}
                </div>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setIsModalOpen(false)}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-xs font-bold shadow-md shadow-indigo-100 transition-all cursor-pointer"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MaterialMovementAudit;
