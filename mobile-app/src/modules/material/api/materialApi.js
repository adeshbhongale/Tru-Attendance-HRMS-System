import api from '../../../api/axios';

export const materialApi = {
  // Dashboard & Metrics
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

  // Tally Inventory Direct Fetching from Tally GET endpoint
  getTallyInventory: async () => {
    try {
      const res = await api.get('/tally/inventory');
      if (res.data) {
        return res.data;
      }
    } catch (err) {
      console.warn('Tally 9000 server query error:', err.message);
      return {
        success: false,
        materials: [],
        message: (err.response && err.response.data && err.response.data.message) || err.message || 'Tally Prime server is offline or unreachable.',
      };
    }
    return {
      success: false,
      materials: [],
      message: 'Tally Prime server returned empty response.',
    };
  },

  // Transactions
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
      return { success: false, message: (err.response && err.response.data && err.response.data.message) || err.message };
    }
  },

  createTransaction: async (payload) => {
    try {
      const res = await api.post('/transactions', payload);
      return res.data;
    } catch (err) {
      return { success: false, message: (err.response && err.response.data && err.response.data.message) || err.message };
    }
  },

  approveTransaction: async (id, payload = {}) => {
    try {
      const res = await api.put(`/transactions/${id}/approve`, payload);
      return res.data;
    } catch (err) {
      return { success: false, message: (err.response && err.response.data && err.response.data.message) || err.message };
    }
  },

  rejectTransaction: async (id, reason) => {
    try {
      const res = await api.put(`/transactions/${id}/reject`, { reason });
      return res.data;
    } catch (err) {
      return { success: false, message: (err.response && err.response.data && err.response.data.message) || err.message };
    }
  },

  assignHandler: async (id, payload) => {
    try {
      const res = await api.post(`/transactions/${id}/assign-handler`, payload);
      return res.data;
    } catch (err) {
      return { success: false, message: (err.response && err.response.data && err.response.data.message) || err.message };
    }
  },

  dispatchTransaction: async (id, payload) => {
    try {
      const res = await api.post(`/transactions/${id}/store-dispatch`, payload);
      return res.data;
    } catch (err) {
      return { success: false, message: (err.response && err.response.data && err.response.data.message) || err.message };
    }
  },

  receiveTransaction: async (id, payload) => {
    try {
      const res = await api.patch(`/transactions/${id}/receive`, payload);
      return res.data;
    } catch (err) {
      return { success: false, message: (err.response && err.response.data && err.response.data.message) || err.message };
    }
  },

  getStoreAvailableBarcodes: async (materialName) => {
    try {
      const res = await api.get('/barcodes/store-available', { params: { materialName } });
      return res.data;
    } catch (err) {
      return { success: false, barcodes: [] };
    }
  },

  // Barcodes & Movement Lists
  getBarcodes: async (params = {}) => {
    try {
      const res = await api.get('/barcodes', { params });
      return res.data;
    } catch (err) {
      return { success: true, data: [] };
    }
  },

  getUsers: async () => {
    try {
      const res = await api.get('/users');
      return (res.data && res.data.data) ? res.data.data : (res.data || []);
    } catch (err) {
      try {
        const res2 = await api.get('/auth/users');
        return (res2.data && res2.data.data) ? res2.data.data : (res2.data || []);
      } catch (e) {
        return [];
      }
    }
  },

  getBarcodeDetail: async (barcodeStr) => {
    try {
      const res = await api.get(`/barcodes/${barcodeStr}`);
      return res.data;
    } catch (err) {
      return { success: false, message: (err.response && err.response.data && err.response.data.message) || err.message };
    }
  },

  getBarcodeDetails: async (barcodeStr) => {
    try {
      const res = await api.get(`/barcodes/${barcodeStr}`);
      return res.data;
    } catch (err) {
      return { success: false, message: (err.response && err.response.data && err.response.data.message) || err.message };
    }
  },

  getTransfersList: async () => {
    try {
      const res = await api.get('/barcodes/transfers');
      return res.data;
    } catch (err) {
      try {
        const res2 = await api.get('/transactions', { params: { type: 'transfer' } });
        return res2.data;
      } catch (err2) {
        return { success: true, data: [] };
      }
    }
  },

  getReturnsList: async () => {
    try {
      const res = await api.get('/barcodes/returns');
      return res.data;
    } catch (err) {
      try {
        const res2 = await api.get('/transactions', { params: { type: 'return' } });
        return res2.data;
      } catch (err2) {
        return { success: true, data: [] };
      }
    }
  },

  getMyActiveBarcodes: async () => {
    try {
      const res = await api.get('/barcodes/my-active');
      return res.data;
    } catch (err) {
      return { success: true, data: [] };
    }
  },

  getBarcodesByTransaction: async (transactionId) => {
    try {
      const res = await api.get(`/barcodes/transaction/${transactionId}`);
      return res.data;
    } catch (err) {
      return { success: true, barcodes: [] };
    }
  },

  getTransactionBarcodes: async (transactionId) => {
    try {
      const res = await api.get(`/barcodes/transaction/${transactionId}`);
      return res.data;
    } catch (err) {
      return { success: true, barcodes: [] };
    }
  },

  returnMultipleBarcodes: async (payload) => {
    try {
      const res = await api.post('/barcodes/returns', payload);
      return res.data;
    } catch (err) {
      try {
        const res2 = await api.post('/barcodes/return-multiple', payload);
        return res2.data;
      } catch (err2) {
        return { success: false, message: (err.response && err.response.data && err.response.data.message) || err.message };
      }
    }
  },

  transferBarcode: async (payload) => {
    try {
      const res = await api.post('/barcodes/transfer', payload);
      return res.data;
    } catch (err) {
      return { success: false, message: (err.response && err.response.data && err.response.data.message) || err.message };
    }
  },

  getAllTransfers: async () => {
    try {
      const res = await api.get('/barcodes/list/transfers');
      return res.data;
    } catch (err) {
      try {
        const res2 = await api.get('/barcodes/pending/transfers');
        return res2.data;
      } catch (err2) {
        return { success: true, data: [] };
      }
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

  returnBarcode: async (payload) => {
    try {
      const res = await api.post('/barcodes/return', payload);
      return res.data;
    } catch (err) {
      return { success: false, message: (err.response && err.response.data && err.response.data.message) || err.message };
    }
  },

  returnMultipleBarcodes: async (payload) => {
    try {
      const res = await api.post('/barcodes/return-multiple', payload);
      return res.data;
    } catch (err) {
      try {
        const res2 = await api.post('/barcodes/return', payload);
        return res2.data;
      } catch (err2) {
        return { success: false, message: (err.response && err.response.data && err.response.data.message) || err.message };
      }
    }
  },

  splitBarcode: async (payload) => {
    try {
      const res = await api.post('/barcodes/split-request', payload);
      return res.data;
    } catch (err) {
      return { success: false, message: (err.response && err.response.data && err.response.data.message) || err.message };
    }
  },

  mergeBarcode: async (payload) => {
    try {
      const res = await api.post('/barcodes/merge', payload);
      return res.data;
    } catch (err) {
      return { success: false, message: (err.response && err.response.data && err.response.data.message) || err.message };
    }
  },

  exchangeBarcode: async (payload) => {
    try {
      const res = await api.post('/barcodes/exchange-request', payload);
      return res.data;
    } catch (err) {
      try {
        const res2 = await api.post('/barcodes/exchange', payload);
        return res2.data;
      } catch (err2) {
        return { success: false, message: (err.response && err.response.data && err.response.data.message) || err.message };
      }
    }
  },

  convertBarcode: async (payload) => {
    try {
      const res = await api.post('/barcodes/close-request', payload);
      return res.data;
    } catch (err) {
      return { success: false, message: (err.response && err.response.data && err.response.data.message) || err.message };
    }
  },

  // Master Data & Miscellaneous
  getDepartments: async () => {
    try {
      const res = await api.get('/departments');
      if (res.data && (res.data.data || Array.isArray(res.data))) {
        return res.data;
      }
    } catch (err) {
      console.warn('Departments fetch warning (403 or network), using default list');
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

  getTallyCustomers: async () => {
    try {
      const res = await api.get('/barcodes/tally/customers');
      return res.data;
    } catch (err) {
      try {
        const res = await api.get('/tally/customers');
        return res.data;
      } catch (err2) {
        return { success: true, data: [] };
      }
    }
  },

  assignHandler: async (transactionId, payload) => {
    try {
      const res = await api.put(`/transactions/${transactionId}/assign-handler`, payload);
      return res.data;
    } catch (err) {
      throw err;
    }
  },

  // Action & Approval Endpoints matching PendingTransactionsPage.jsx
  approveTransaction: (id, remarks = '') => api.put(`/transactions/${id}/approve`, { remarks }),
  rejectTransaction: (id, reason = '') => api.put(`/transactions/${id}/reject`, { reason }),
  storeAcceptTransaction: (id) => api.put(`/transactions/${id}/store-accept`),
  handleTransfer: (payload) => api.post('/barcodes/handle-transfer', payload),
  approveSplit: (payload) => api.post('/barcodes/approve-split', payload),
  acceptReturn: (returnId, payload = {}) => api.put(`/barcodes/return/${returnId}/accept`, payload),
  bulkAcceptReturns: (payload = {}) => api.post('/barcodes/returns/bulk-accept', payload),
  respondExchange: (requestId, payload) => api.post(`/barcodes/exchange-requests/${requestId}/respond`, payload),
  respondCloseRequest: (requestId, payload) => api.post(`/barcodes/close-requests/${requestId}/respond`, payload),
  approveMerge: (payload) => api.post('/barcodes/approve-merge', payload),

  // Bulk List Endpoints for Pending Approvals Screen
  getAllTransfers: () => api.get('/barcodes/list/transfers'),
  getAllSplits: () => api.get('/barcodes/list/splits'),
  getAllReturns: () => api.get('/barcodes/list/returns'),
  getAllCloseRequests: () => api.get('/barcodes/list/close-requests'),
  getAllExchanges: () => api.get('/barcodes/list/exchange-requests'),
  // Workflow Engine Context
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
};

export default materialApi;
