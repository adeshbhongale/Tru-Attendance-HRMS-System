import {
  ArrowLeft,
  ChevronRight
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../api/axios';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import Spinner from '../components/ui/Spinner';
import useActiveRole from '../hooks/useActiveRole';

// Import sub modals

const TransactionDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const reduxUser = useSelector((state) => state.auth?.user);
  const user = reduxUser || (() => {
    try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; }
  })();
  const activeRole = useActiveRole();

  const [loading, setLoading] = useState(true);
  const [txn, setTxn] = useState(null);
  const [barcodes, setBarcodes] = useState([]);
  const [returnsList, setReturnsList] = useState([]);
  const [receiptsList, setReceiptsList] = useState([]);
  const [exchangeRequests, setExchangeRequests] = useState([]);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('materials');

  // Modals / Action Forms
  const [employees, setEmployees] = useState([]);

  // Store action modal
  const [storeModal, setStoreModal] = useState(false);
  const [storeActionType, setStoreActionType] = useState('assign_handler');
  const [handlerId, setHandlerId] = useState('');
  const [storeRemarks, setStoreRemarks] = useState('');
  const [handlers, setHandlers] = useState([]);

  // Reject Modal
  const [rejectModal, setRejectModal] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [rejectSubmitting, setRejectSubmitting] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const txnRes = await api.get(`/transactions/${id}`);
      const txnData = txnRes.data.transaction;
      setTxn(txnData);
      setReturnsList(txnRes.data.returns || []);
      setReceiptsList(txnRes.data.receipts || []);

      const bcRes = await api.get(`/barcodes/transaction/${txnData.transactionId}`);
      setBarcodes(bcRes.data.barcodes || []);

      try {
        const exRes = await api.get(`/barcodes/exchange-requests/transaction/${txnData.transactionId}`);
        setExchangeRequests(exRes.data.data || []);
      } catch (exErr) {
        console.error('Failed to load exchange requests:', exErr);
      }
    } catch (err) {
      console.error(err);
      setError('Failed to load transaction details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();

    api.get('/employees?limit=1000&allDepartments=true').then(res => {
      const empList = res.data.employees || res.data.data || [];
      setEmployees(empList.map(e => ({ value: e._id, label: `${e.fullName} (${e.employeeId})` })));
      const handlerList = empList.filter(h =>
        h._id !== user?._id &&
        h.role !== 'super_admin' &&
        !(h.role === 'department_admin' && h.departmentAdminType === 'store')
      );
      setHandlers(handlerList.map(h => ({ value: h._id, label: `${h.fullName} (${h.employeeId})` })));
    }).catch(err => console.error(err));
  }, [id]);

  const handleBarcodeClick = (barcodeStr) => {
    navigate(`/barcodes/${barcodeStr}`);
  };

  // Approvals
  const handleApprovalAction = async (statusType) => {
    if (statusType === 'reject') {
      setRejectModal(true);
      return;
    }
    if (confirm(`Are you sure you want to approve this transaction?`)) {
      try {
        await api.put(`/transactions/${id}/approve`, {
          remarks: 'Approved by Approver Authority'
        });
        alert('Transaction approved successfully.');
        fetchData();
      } catch (err) {
        alert(err.response?.data?.message || 'Approval action failed.');
      }
    }
  };

  const handleDeleteRequest = async () => {
    if (window.confirm('Are you sure you want to delete this material request? This action is permanent.')) {
      try {
        await api.delete(`/transactions/${id}`);
        alert('Material request deleted successfully.');
        navigate('/materials');
      } catch (err) {
        alert(err.response?.data?.message || 'Failed to delete transaction request.');
      }
    }
  };

  const handleStoreAcceptReady = async () => {
    if (confirm('Mark this request as Ready (Accepted by Store)?')) {
      try {
        await api.put(`/transactions/${id}/store-accept`);
        alert('Transaction accepted by store successfully.');
        fetchData();
      } catch (err) {
        alert(err.response?.data?.message || 'Failed to accept transaction.');
      }
    }
  };

  const handleStoreAction = async (e) => {
    e.preventDefault();
    try {
      if (storeActionType === 'accept') {
        await api.put(`/transactions/${id}/store-accept`, {
          remarks: storeRemarks
        });
        alert('Transaction accepted by store successfully.');
      } else {
        await api.put(`/transactions/${id}/assign-handler`, {
          handlerId,
          remarks: storeRemarks
        });
        alert('Sourcing handler assigned successfully.');
      }
      setStoreModal(false);
      setStoreRemarks('');
      setHandlerId('');
      fetchData();
    } catch (err) {
      alert(err.response?.data?.message || 'Store action failed.');
    }
  };

  const getUserDisplayName = (u, defaultFallback = 'System') => {
    if (!u) return defaultFallback;
    if (typeof u === 'string') return u;
    if (typeof u === 'object') {
      return u.fullName || u.name || u.employeeId || u.email || defaultFallback;
    }
    return String(u);
  };

  // Construct unified historical timeline
  const buildUnifiedTimeline = () => {
    if (!txn) return [];
    const timelineList = [];

    // 1. Transaction base timeline
    if (txn.createdAt) {
      timelineList.push({
        action: 'Transaction Request Created',
        by: getUserDisplayName(txn.requester, 'Requester'),
        timestamp: txn.createdAt,
        remarks: txn.remarks || 'Initiated material movement request',
        status: 'COMPLETED',
        badgeChar: 'C'
      });
    }

    if (txn.approvalChain) {
      txn.approvalChain.forEach(app => {
        timelineList.push({
          action: `${app.role === 'team_lead' ? 'Team Lead' : 'Management'} ${app.action === 'approved' ? 'Approved' : 'Rejected'}`,
          by: getUserDisplayName(app.user, app.role === 'team_lead' ? 'Team Lead' : 'Management'),
          timestamp: app.timestamp,
          remarks: app.remarks || '',
          status: app.action === 'approved' ? 'COMPLETED' : 'REJECTED',
          badgeChar: 'A'
        });
      });
    }

    if (txn.dispatchedAt) {
      timelineList.push({
        action: 'Store Dispatched Materials',
        by: getUserDisplayName(txn.handler, 'Store Handler'),
        timestamp: txn.dispatchedAt,
        remarks: 'Dispatched from store warehouse',
        status: 'COMPLETED',
        badgeChar: 'D'
      });
    }

    if (txn.receivedAt) {
      timelineList.push({
        action: 'Requester Received & Verified Materials',
        by: getUserDisplayName(txn.requester, 'Requester'),
        timestamp: txn.receivedAt,
        remarks: 'Physical material received with geo-verification',
        status: 'COMPLETED',
        badgeChar: 'R'
      });
    }

    // 2. Barcode logs
    barcodes.forEach(bc => {
      if (bc.history) {
        bc.history.forEach(log => {
          timelineList.push({
            action: `${log.action} (${bc.barcode})`,
            by: getUserDisplayName(log.user, 'System'),
            timestamp: log.timestamp || log.assignedAt || bc.createdAt,
            remarks: log.remarks || '',
            status: log.action.toLowerCase().includes('reject') ? 'REJECTED' : 'COMPLETED',
            badgeChar: 'B'
          });
        });
      }
    });

    timelineList.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    return timelineList;
  };

  if (loading) {
    return (
      <div className="h-[60vh] w-full flex flex-col items-center justify-center gap-3">
        <Spinner size="lg" />
        <p className="text-xs font-bold text-slate-600 tracking-wider">
          Retrieving secure movement transaction...
        </p>
      </div>
    );
  }

  if (error || !txn) {
    return (
      <div className="p-6 bg-rose-50 border border-rose-200 rounded-2xl text-sm text-rose-600 font-bold text-center">
        {error || 'Transaction details not found.'}
      </div>
    );
  }

  const isSender = txn.requester?._id === user?._id || txn.requester === user?._id;
  const isAdmin = activeRole.role === 'super_admin';
  const isStore = activeRole.role === 'super_admin' || (activeRole.role === 'department_admin' && activeRole.adminType === 'store');
  const canApprove = (
    activeRole.role === 'super_admin' ||
    (activeRole.role === 'team_lead' && txn.status === 'submitted') ||
    (activeRole.role === 'department_admin' && activeRole.adminType === 'management' && ['submitted', 'tl_approved'].includes(txn.status))
  ) && (!isSender || activeRole.role === 'super_admin') && ['submitted', 'tl_approved'].includes(txn.status);

  const unifiedTimeline = buildUnifiedTimeline();

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto pb-16 relative">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div className="flex flex-col">
          <div className="flex items-center gap-1.5 text-xs text-slate-500 font-bold mb-1">
            <span>Material Transactions</span>
            <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-indigo-600 font-bold font-mono">{txn.transactionId}</span>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="p-1 -ml-1">
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 leading-none m-0 font-mono">
              Voucher: {txn.transactionId}
            </h1>
          </div>
        </div>

        {/* Dynamic Context Actions & Super Admin Operations */}
        <div className="flex items-center gap-3 self-start sm:self-center flex-wrap">
          <Badge variant={txn.status === 'rejected' ? 'danger' : txn.status === 'completed' ? 'success' : 'primary'}>
            {txn.status.toUpperCase()}
          </Badge>

          {canApprove && (
            <div className="flex items-center gap-2">
              <Button size="sm" variant="danger" onClick={() => handleApprovalAction('reject')}>
                Reject Request
              </Button>
              <Button size="sm" variant="success" onClick={() => handleApprovalAction('approve')}>
                Approve Request
              </Button>
            </div>
          )}

          {isStore && ['tl_approved', 'mgt_approved', 'submitted'].includes(txn.status) && (
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={handleStoreAcceptReady}>
                Accept Sourcing
              </Button>
              <Button size="sm" onClick={() => { setStoreActionType('assign_handler'); setStoreModal(true); }}>
                Assign Handler
              </Button>
            </div>
          )}

          {isAdmin && (
            <Button size="sm" variant="danger" onClick={handleDeleteRequest}>
              Delete Voucher
            </Button>
          )}
        </div>
      </div>

      {/* Comprehensive Voucher Summary Card */}
      <Card title="Voucher Summary">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-xs">
          <div>
            <span className="text-xs font-semibold text-slate-500 block mb-1">Requester</span>
            <span className="font-extrabold text-slate-900 text-sm block">{txn.requester?.fullName || txn.requester?.name || 'N/A'}</span>
          </div>
          <div>
            <span className="text-xs font-semibold text-slate-500 block mb-1">Department</span>
            <span className="font-extrabold text-slate-900 text-sm block">{txn.department?.name || txn.requester?.department?.name || 'N/A'}</span>
          </div>
          <div>
            <span className="text-xs font-semibold text-slate-500 block mb-1">Team Lead</span>
            <span className="font-extrabold text-slate-900 text-sm block">{txn.teamLead?.fullName || txn.teamLead?.name || 'Approving Authority'}</span>
          </div>
          <div>
            <span className="text-xs font-semibold text-slate-500 block mb-1">Management Approver</span>
            <span className="font-extrabold text-slate-900 text-sm block">{txn.managementApprover?.fullName || txn.managementApprover?.name || 'N/A'}</span>
          </div>
          <div>
            <span className="text-xs font-semibold text-slate-500 block mb-1">Store / Warehouse</span>
            <span className="font-extrabold text-slate-900 text-sm block">{txn.storeAdmin?.fullName || txn.store?.name || 'Store Warehouse'}</span>
          </div>
          <div>
            <span className="text-xs font-semibold text-slate-500 block mb-1">Sourcing Handler</span>
            <span className="font-extrabold text-slate-900 text-sm block">{txn.handler?.fullName || txn.handler?.name || 'N/A'}</span>
          </div>
          <div>
            <span className="text-xs font-semibold text-slate-500 block mb-1">Document Type</span>
            <span className="font-extrabold text-indigo-600 text-sm block">{txn.documentType || 'RDC'}</span>
          </div>
          <div>
            <span className="text-xs font-semibold text-slate-500 block mb-1">Created Date</span>
            <span className="font-extrabold text-slate-900 text-sm block">{new Date(txn.createdAt).toLocaleString('en-IN')}</span>
          </div>
        </div>
      </Card>

      {/* Tabs Navigation Bar */}
      <div className="flex border-b border-slate-200 gap-6 overflow-x-auto select-none no-scrollbar">
        {[
          { id: 'materials', label: 'Materials & Barcodes' },
          { id: 'timeline', label: 'Timeline' },
          { id: 'transfers', label: 'Transfers' },
          { id: 'returns', label: 'Returns' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`pb-2.5 text-xs font-extrabold tracking-wider border-b-2 transition-all cursor-pointer whitespace-nowrap ${activeTab === tab.id
                ? 'border-indigo-600 text-indigo-600 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* TAB CONTENT */}
      {activeTab === 'materials' && (
        <Card title="Materials & Barcodes">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr className="text-xs font-semibold text-slate-600 tracking-wide">
                  <th className="py-3.5 px-4">Barcode Serial</th>
                  <th className="py-3.5 px-4">Material</th>
                  <th className="py-3.5 px-4">Owner</th>
                  <th className="py-3.5 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-semibold text-slate-800">
                {barcodes.map((b) => (
                  <tr key={b._id || b.barcode} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3.5 px-4">
                      <span
                        onClick={() => handleBarcodeClick(b.barcode)}
                        className="font-bold text-indigo-600 hover:text-indigo-800 hover:underline cursor-pointer font-mono"
                      >
                        {b.barcode}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-slate-900 font-bold">{b.materialName}</td>
                    <td className="py-3.5 px-4 text-slate-700 font-semibold">{b.owner?.fullName || b.owner?.name || 'Stores'}</td>
                    <td className="py-3.5 px-4">
                      <Badge variant={b.status === 'Active' ? 'success' : 'primary'}>{b.status}</Badge>
                    </td>
                  </tr>
                ))}
                {barcodes.length === 0 && (
                  <tr>
                    <td colSpan="4" className="py-8 text-center text-slate-500 font-semibold">No barcodes registered under this transaction.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {activeTab === 'timeline' && (
        <Card title="Transaction History Timeline">
          <div className="space-y-4">
            {unifiedTimeline.map((item, idx) => (
              <div key={idx} className="flex gap-4 items-start border-b border-slate-100 pb-3.5">
                <div className="w-7 h-7 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-600 flex items-center justify-center font-bold text-xs shrink-0">
                  {item.badgeChar}
                </div>
                <div className="flex-1 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-extrabold text-slate-900 text-sm">{item.action}</span>
                    <Badge variant={item.status === 'REJECTED' ? 'danger' : 'success'}>{item.status}</Badge>
                  </div>
                  <p className="text-slate-500 font-semibold text-[11px] mt-0.5">
                    By: {item.by} • {new Date(item.timestamp).toLocaleString('en-IN')}
                  </p>
                  {item.remarks && (
                    <p className="text-slate-600 font-medium mt-1 bg-slate-50 p-2 rounded-lg border border-slate-100">
                      "{item.remarks}"
                    </p>
                  )}
                </div>
              </div>
            ))}
            {unifiedTimeline.length === 0 && (
              <p className="text-xs text-slate-400 text-center py-6">No historical timeline entries found for this transaction.</p>
            )}
          </div>
        </Card>
      )}

      {activeTab === 'transfers' && (
        <Card title="Internal Transfers Log">
          <div className="space-y-3 text-xs">
            {barcodes.filter(b => b.history?.some(h => h.action.toLowerCase().includes('transfer'))).length === 0 ? (
              <p className="text-slate-400 py-6 text-center">No internal barcode transfers have occurred for this transaction.</p>
            ) : (
              barcodes.filter(b => b.history?.some(h => h.action.toLowerCase().includes('transfer'))).map(bc => (
                <div key={bc.barcode} className="p-4 border border-slate-200 bg-slate-50 rounded-xl">
                  <span className="font-mono font-bold text-indigo-600">{bc.barcode}</span>
                  <div className="mt-2 pl-3 border-l-2 border-slate-300 space-y-1.5">
                    {bc.history.filter(h => h.action.toLowerCase().includes('transfer')).map((h, i) => (
                      <div key={i} className="text-slate-700 font-semibold">
                        <span className="font-bold text-slate-900">{h.action}</span> - {h.remarks}
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      )}

      {activeTab === 'returns' && (
        <Card title="Returns Log">
          <div className="space-y-3 text-xs">
            {barcodes.filter(b => b.status === 'Returned' || b.status === 'Return Requested').length === 0 ? (
              <p className="text-slate-400 py-6 text-center">No returns recorded for this transaction.</p>
            ) : (
              barcodes.filter(b => b.status === 'Returned' || b.status === 'Return Requested').map(bc => (
                <div
                  key={bc.barcode}
                  onClick={() => handleBarcodeClick(bc.barcode)}
                  className="p-4 border border-slate-200 bg-slate-50 rounded-xl flex items-center justify-between gap-4 hover:bg-slate-100 cursor-pointer transition-colors"
                >
                  <div>
                    <span className="font-mono font-bold text-indigo-600">{bc.barcode}</span>
                    <h4 className="font-bold text-slate-900 mt-1">{bc.materialName}</h4>
                  </div>
                  <Badge variant={bc.status === 'Returned' ? 'primary' : 'warning'}>
                    {bc.status.toUpperCase()}
                  </Badge>
                </div>
              ))
            )}
          </div>
        </Card>
      )}

      {/* Store Handler Assign Modal */}
      {storeModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 p-6 rounded-2xl w-full max-w-md shadow-xl">
            <h3 className="text-lg font-bold text-slate-900 mb-4">Assign Handler / Accept Store</h3>
            <form onSubmit={handleStoreAction} className="flex flex-col gap-4 text-xs">
              <div>
                <label className="block text-slate-700 font-bold mb-1">Select Handler</label>
                <select
                  value={handlerId}
                  onChange={(e) => setHandlerId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 font-semibold"
                >
                  <option value="">Select Employee...</option>
                  {handlers.map(h => (
                    <option key={h.value} value={h.value}>{h.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-slate-700 font-bold mb-1">Remarks</label>
                <textarea
                  value={storeRemarks}
                  onChange={(e) => setStoreRemarks(e.target.value)}
                  rows="3"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 font-semibold"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="ghost" onClick={() => setStoreModal(false)}>Cancel</Button>
                <Button variant="primary" type="submit">Confirm Store Action</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default TransactionDetailPage;
