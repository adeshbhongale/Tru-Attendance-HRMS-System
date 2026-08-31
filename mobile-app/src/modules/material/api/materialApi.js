import api from '../../../api/axios';

// Shared error normalizer so every caller receives { success, message, ...data }
const toResult = (err) => ({
  success: false,
  message: (err.response && err.response.data && err.response.data.message) || err.message || 'Request failed.',
});

const materialApi = {
  // ===================== Dashboard & Metrics =====================
  getDashboardMetrics: async () => {
    try {
      const res = await api.get('/transactions', { params: { limit: 100 } });
      const txns = Array.isArray(res.data && res.data.data) ? res.data.data : (Array.isArray(res.data) ? res.data : []);
      const activeRequests = txns.filter(t => ['submitted', 'tl_approved', 'mgt_approved', 'dispatched', 'received'].includes(t.status)).length;
      const pendingApprovals = txns.filter(t => ['submitted', 'tl_approved'].includes(t.status)).length;
      const dispatchedCount = txns.filter(t => t.status === 'dispatched').length;
      return {
        success: true,
        data: {
          activeRequests,
          barcodesInHand: txns.length,
          pendingApprovals,
          dispatchedCount,
          recentTransactions: txns.slice(0, 5)
        }
      };
    } catch (err) {
      return {
        success: true,
        data: { activeRequests: 0, barcodesInHand: 0, pendingApprovals: 0, dispatchedCount: 0, recentTransactions: [] }
      };
    }
  },

  // ===================== Tally Prime Live Integration =====================
  // GET /api/tally/inventory -> { success, materials:[{name,unit,stock,price,group,category}], message }
  getTallyInventory: async () => {
    try {
      const res = await api.get('/tally/inventory');
      return res.data;
    } catch (err) {
      console.warn('Tally 9000 server query error:', err.message);
      return {
        success: false,
        materials: [],
        message: (err.response && err.response.data && err.response.data.message) || err.message || 'Tally Prime server is offline or unreachable.',
      };
    }
  },

  // GET /api/barcodes/tally/customers -> { success, customers:["..."] } (Sundry Debtors ledger)
  getTallyCustomers: async () => {
    try {
      const res = await api.get('/barcodes/tally/customers');
      return res.data;
    } catch (err) {
      return { success: false, customers: [], message: toResult(err).message };
    }
  },

  // ===================== Transactions =====================
  getTransactions: async (params = {}) => {
    try {
      const queryParams = {
        status: params.tab || params.status || 'all',
        ...params
      };
      const res = await api.get('/transactions', { params: queryParams });
      return res.data;
    } catch (err) {
      return { success: true, data: [] };
    }
  },

  getPendingTransactions: async () => {
    try {
      const res = await api.get('/transactions', { params: { tab: 'pending' } });
      return res.data;
    } catch (err) {
      return { success: true, data: [] };
    }
  },

  getTransactionById: async (id) => {
    try {
      const res = await api.get(`/transactions/${id}`);
      return res.data;
    } catch (err) {
      return { success: false, message: toResult(err).message };
    }
  },

  // POST /api/transactions (simplified RDC sourcing request)
  createTransaction: async (payload) => {
    try {
      const res = await api.post('/transactions', payload);
      return res.data;
    } catch (err) {
      return toResult(err);
    }
  },

  // PUT /api/transactions/:id/approve
  approveTransaction: async (id, remarks = '') => {
    try {
      const res = await api.put(`/transactions/${id}/approve`, { remarks });
      return res.data;
    } catch (err) {
      return toResult(err);
    }
  },

  // PUT /api/transactions/:id/reject  (body key MUST be `reason`)
  rejectTransaction: async (id, reason = '') => {
    try {
      const res = await api.put(`/transactions/${id}/reject`, { reason });
      return res.data;
    } catch (err) {
      return toResult(err);
    }
  },

  // PUT /api/transactions/:id/store-accept
  storeAcceptTransaction: async (id) => {
    try {
      const res = await api.put(`/transactions/${id}/store-accept`);
      return res.data;
    } catch (err) {
      return toResult(err);
    }
  },

  // PUT /api/transactions/:id/assign-handler  (also used for handler-to-handler job transfer)
  assignHandler: async (id, payload) => {
    try {
      const res = await api.put(`/transactions/${id}/assign-handler`, payload);
      return res.data;
    } catch (err) {
      return toResult(err);
    }
  },

  // POST /api/transactions/:transactionId/store-dispatch
  dispatchTransaction: async (id, payload) => {
    try {
      const res = await api.post(`/transactions/${id}/store-dispatch`, payload);
      return res.data;
    } catch (err) {
      return toResult(err);
    }
  },

  // PATCH /api/transactions/:id/handler-action  (actionType: collect | dispatch | decline | send_to_store | accept_transfer)
  handlerAction: async (id, payload) => {
    try {
      const res = await api.patch(`/transactions/${id}/handler-action`, payload);
      return res.data;
    } catch (err) {
      return toResult(err);
    }
  },

  // PATCH /api/transactions/:id/receive  (receiverGeo{lat,lng,address}, materialCondition, remarks, photo, receipts)
  receiveTransaction: async (id, payload) => {
    try {
      const res = await api.patch(`/transactions/${id}/receive`, payload);
      return res.data;
    } catch (err) {
      return toResult(err);
    }
  },

  // PATCH /api/transactions/:id/reject-receipt  ({ reason })
  rejectReceipt: async (id, reason = '') => {
    try {
      const res = await api.patch(`/transactions/${id}/reject-receipt`, { reason });
      return res.data;
    } catch (err) {
      return toResult(err);
    }
  },

  // GET /api/transactions/:id/workflow-context
  getWorkflowContext: async (id = 'new') => {
    try {
      const res = await api.get(`/transactions/${id}/workflow-context`);
      return res.data;
    } catch (err) {
      return {
        success: true,
        context: {
          dispatchMethod: 'HANDLER',
          featureFlags: { assignHandler: true, directDispatch: true },
          uiPermissions: { showAssignHandler: true, showDirectDispatch: true }
        }
      };
    }
  },

  // ===================== Barcodes & Store Stock =====================
  // GET /api/barcodes/store-available?materialName=
  getStoreAvailableBarcodes: async (materialName) => {
    try {
      const res = await api.get('/barcodes/store-available', { params: { materialName } });
      return res.data;
    } catch (err) {
      return { success: false, barcodes: [] };
    }
  },

  getBarcodes: async (params = {}) => {
    try {
      const res = await api.get('/barcodes', { params });
      return res.data;
    } catch (err) {
      return { success: true, data: [] };
    }
  },

  // GET /api/barcodes/my-active -> { success, count, data:[...] }
  getMyActiveBarcodes: async () => {
    try {
      const res = await api.get('/barcodes/my-active');
      return res.data;
    } catch (err) {
      return { success: true, count: 0, data: [] };
    }
  },

  // GET /api/barcodes/transaction/:transactionId -> { success, barcodes:[...] }
  getBarcodesByTransaction: async (transactionId) => {
    try {
      const res = await api.get(`/barcodes/transaction/${transactionId}`);
      return res.data;
    } catch (err) {
      return { success: true, barcodes: [] };
    }
  },
  getTransactionBarcodes: function (transactionId) { return this.getBarcodesByTransaction(transactionId); },

  // GET /api/barcodes/:barcode
  getBarcodeDetail: async (barcodeStr) => {
    try {
      const res = await api.get(`/barcodes/${barcodeStr}`);
      return res.data;
    } catch (err) {
      return { success: false, message: toResult(err).message };
    }
  },
  getBarcodeDetails: function (barcodeStr) { return this.getBarcodeDetail(barcodeStr); },

  // ===================== Barcode Movement Actions =====================
  // POST /api/barcodes/transfer
  transferBarcode: async (payload) => {
    try {
      const res = await api.post('/barcodes/transfer', payload);
      return res.data;
    } catch (err) {
      return toResult(err);
    }
  },

  // POST /api/barcodes/handle-transfer  ({transferId, action:'accept'|'reject', reason, gps})
  handleTransfer: async (payload) => {
    try {
      const res = await api.post('/barcodes/handle-transfer', payload);
      return res.data;
    } catch (err) {
      return toResult(err);
    }
  },

  // POST /api/barcodes/split-request ({barcode, requestedMaterialName, reason, gps, photos})
  splitBarcode: async (payload) => {
    try {
      const res = await api.post('/barcodes/split-request', payload);
      return res.data;
    } catch (err) {
      return toResult(err);
    }
  },

  // POST /api/barcodes/approve-split ({requestId, action, newBarcode, quantity, unit, price, rate, godown, storeRemark, reason})
  approveSplit: async (payload) => {
    try {
      const res = await api.post('/barcodes/approve-split', payload);
      return res.data;
    } catch (err) {
      return toResult(err);
    }
  },

  // POST /api/barcodes/merge-request ({mergeBarcodes, parentBarcodeMode, selectedParentBarcode, requestedMaterialName, reason, gps, photos})
  mergeBarcode: async (payload) => {
    try {
      const res = await api.post('/barcodes/merge-request', payload);
      return res.data;
    } catch (err) {
      return toResult(err);
    }
  },

  // POST /api/barcodes/approve-merge ({requestId, action, newBarcode, storeRemark, reason})
  approveMerge: async (payload) => {
    try {
      const res = await api.post('/barcodes/approve-merge', payload);
      return res.data;
    } catch (err) {
      return toResult(err);
    }
  },

  // POST /api/barcodes/exchange-request ({oldBarcode, warrantyReason, newBarcode, photos, gps})
  exchangeBarcode: async (payload) => {
    try {
      const res = await api.post('/barcodes/exchange-request', payload);
      return res.data;
    } catch (err) {
      return toResult(err);
    }
  },

  // POST /api/barcodes/exchange-requests/:requestId/respond ({action:'accept'|'reject', newBarcode, storeRemark, reason})
  respondExchange: async (requestId, payload) => {
    try {
      const res = await api.post(`/barcodes/exchange-requests/${requestId}/respond`, payload);
      return res.data;
    } catch (err) {
      return toResult(err);
    }
  },

  // POST /api/barcodes/close-request ({barcode, documentType:'DC Internal'|'DC FOC'|'Invoice', remarks, managementApprover, customerName, photos, gps, documents})
  convertBarcode: async (payload) => {
    try {
      const res = await api.post('/barcodes/close-request', payload);
      return res.data;
    } catch (err) {
      return toResult(err);
    }
  },

  // POST /api/barcodes/close-requests/:requestId/respond ({action, rejectionReason, storeRemark})
  respondCloseRequest: async (requestId, payload) => {
    try {
      const res = await api.post(`/barcodes/close-requests/${requestId}/respond`, payload);
      return res.data;
    } catch (err) {
      return toResult(err);
    }
  },

  // POST /api/barcodes/return ({barcode, reason, condition, remarks, gps:{lat,lng,address}, photos, documents, returnHandler})
  returnBarcode: async (payload) => {
    try {
      const res = await api.post('/barcodes/return', payload);
      return res.data;
    } catch (err) {
      return toResult(err);
    }
  },

  // POST /api/barcodes/return-multiple ({transactionId, barcodesToReturn, returnMethod, handlerId, reason, condition, remarks, photos, coordinates:[lng,lat], documents})
  returnMultipleBarcodes: async (payload) => {
    try {
      const res = await api.post('/barcodes/return-multiple', payload);
      return res.data;
    } catch (err) {
      return toResult(err);
    }
  },

  // PUT /api/barcodes/return/:returnId/accept ({remarks})
  acceptReturn: async (returnId, payload = {}) => {
    try {
      const res = await api.put(`/barcodes/return/${returnId}/accept`, payload);
      return res.data;
    } catch (err) {
      return toResult(err);
    }
  },

  // POST /api/barcodes/returns/bulk-accept ({returnIds:[...], remarks, documents})
  bulkAcceptReturns: async (payload = {}) => {
    try {
      const res = await api.post('/barcodes/returns/bulk-accept', payload);
      return res.data;
    } catch (err) {
      return toResult(err);
    }
  },

  // PUT /api/barcodes/return/:returnId/assign-handler ({handlerId, remarks})
  assignReturnHandler: async (returnId, payload) => {
    try {
      const res = await api.put(`/barcodes/return/${returnId}/assign-handler`, payload);
      return res.data;
    } catch (err) {
      return toResult(err);
    }
  },

  // PUT /api/barcodes/return/:returnId/handler-action ({actionType:'collect'|'deliver'|'reject', remarks})
  returnHandlerAction: async (returnId, payload) => {
    try {
      const res = await api.put(`/barcodes/return/${returnId}/handler-action`, payload);
      return res.data;
    } catch (err) {
      return toResult(err);
    }
  },

  // ===================== List Endpoints (History & Action Center Tabs) =====================
  getAllTransfers: async () => {
    try {
      const res = await api.get('/barcodes/list/transfers');
      return res.data;
    } catch (err) {
      return { success: true, data: [] };
    }
  },

  getAllSplits: async () => {
    try {
      const res = await api.get('/barcodes/list/splits');
      return res.data;
    } catch (err) {
      return { success: true, data: [] };
    }
  },

  getAllReturns: async () => {
    try {
      const res = await api.get('/barcodes/list/returns');
      return res.data;
    } catch (err) {
      return { success: true, data: [] };
    }
  },

  getAllCloseRequests: async () => {
    try {
      const res = await api.get('/barcodes/list/close-requests');
      return res.data;
    } catch (err) {
      return { success: true, data: [] };
    }
  },

  getAllExchanges: async () => {
    try {
      const res = await api.get('/barcodes/list/exchange-requests');
      return res.data;
    } catch (err) {
      return { success: true, data: [] };
    }
  },

  getAllMerges: async () => {
    try {
      const res = await api.get('/barcodes/list/merge-requests');
      return res.data;
    } catch (err) {
      return { success: true, data: [] };
    }
  },

  // Pending queue list endpoints
  getPendingTransfers: async () => {
    try {
      const res = await api.get('/barcodes/pending/transfers');
      return res.data;
    } catch (err) {
      return { success: true, data: [] };
    }
  },

  getPendingSplits: async () => {
    try {
      const res = await api.get('/barcodes/split-requests/pending');
      return res.data;
    } catch (err) {
      return { success: true, data: [] };
    }
  },

  getPendingReturns: async () => {
    try {
      const res = await api.get('/barcodes/returns/pending');
      return res.data;
    } catch (err) {
      return { success: true, data: [] };
    }
  },

  getPendingCloseRequests: async () => {
    try {
      const res = await api.get('/barcodes/close-requests/pending');
      return res.data;
    } catch (err) {
      return { success: true, data: [] };
    }
  },

  getPendingExchanges: async () => {
    try {
      const res = await api.get('/barcodes/exchange-requests/pending');
      return res.data;
    } catch (err) {
      return { success: true, data: [] };
    }
  },

  getPendingMerges: async () => {
    try {
      const res = await api.get('/barcodes/merge-requests/pending');
      return res.data;
    } catch (err) {
      return { success: true, data: [] };
    }
  },

  // Convenience list wrappers used by TransferListScreen / ReturnListScreen
  getTransfersList: function () { return this.getAllTransfers(); },
  getReturnsList: function () { return this.getAllReturns(); },

  // ===================== Master Data =====================
  getDepartments: async () => {
    try {
      const res = await api.get('/departments');
      if (res.data && (res.data.data || Array.isArray(res.data))) {
        return res.data;
      }
    } catch (err) {
      console.warn('Departments fetch warning, using fallback list');
    }
    return {
      success: true,
      data: [
        { _id: 'dept-operations', name: 'Operations & Logistics' },
        { _id: 'dept-store', name: 'Store Warehouse' },
        { _id: 'dept-engineering', name: 'Engineering & Maintenance' },
      ],
    };
  },

  getUsers: async () => {
    try {
      const res = await api.get('/employees?limit=1000&allDepartments=true');
      return res.data;
    } catch (err) {
      return { success: true, data: [] };
    }
  },

  // ===================== Uploads =====================
  // POST /api/upload/base64 or /api/material/upload/base64  {image} -> {message, url, publicId}
  uploadBase64: async (base64Image) => {
    try {
      const clean = String(base64Image || '').replace(/^data:image\/\w+;base64,/, '');
      // Try /upload/base64 first, fallback to /material/upload/base64
      try {
        const res = await api.post('/upload/base64', { image: clean });
        if (res && res.data && res.data.url) return res.data;
      } catch (_) {}
      const res2 = await api.post('/material/upload/base64', { image: clean });
      return res2.data;
    } catch (err) {
      return toResult(err);
    }
  },
};

export default materialApi;
