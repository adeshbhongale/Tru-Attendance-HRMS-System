const AuditLog = require('../models/AuditLog');

exports.getAuditLogs = async (req, res) => {
  try {
    const { entity, entityId, action, search, page = 1, limit = 50 } = req.query;
    const filter = req.tenant.companyId ? { companyId: req.tenant.companyId } : {};

    if (entity) filter.entity = entity;
    if (entityId) filter.entityId = entityId;
    if (action) filter.action = action;

    if (search) {
      const q = search.trim();
      const User = require('../../../models/User');
      const matchedUsers = await User.find({
        $or: [
          { fullName: { $regex: q, $options: 'i' } },
          { employeeId: { $regex: q, $options: 'i' } }
        ]
      }).select('_id');
      const userIds = matchedUsers.map(u => u._id);

      filter.$or = [
        { userName: { $regex: q, $options: 'i' } },
        { description: { $regex: q, $options: 'i' } },
        { entityId: { $regex: q, $options: 'i' } },
        { user: { $in: userIds } }
      ];
    }

    const [logs, total] = await Promise.all([
      AuditLog.find(filter)
        .populate('user', 'fullName employeeId')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(parseInt(limit)),
      AuditLog.countDocuments(filter),
    ]);

    res.json({
      data: logs,
      logs,
      total,
      page: parseInt(page)
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
};

/**
 * Super Admin Comprehensive Material Movement Activity Feed & Metrics
 */
exports.getMaterialMovementActivities = async (req, res) => {
  try {
    const { category = 'ALL', search = '', page = 1, limit = 200 } = req.query;

    const User = require('../../../models/User');
    const Transaction = require('../models/Transaction');
    const Transfer = require('../models/Transfer');
    const Return = require('../models/Return');
    const Barcode = require('../models/Barcode');

    // Fetch Database Records
    const [dbAuditLogs, transactions, transfers, returns, barcodes] = await Promise.all([
      AuditLog.find(req.tenant.companyId ? { companyId: req.tenant.companyId } : {})
        .populate('user', 'fullName name employeeId department role')
        .sort({ createdAt: -1 })
        .limit(500),

      Transaction.find(req.tenant.companyId ? { companyId: req.tenant.companyId } : {})
        .populate('requester', 'fullName name employeeId department')
        .populate('department', 'name')
        .populate('store', 'fullName name')
        .populate('handler', 'fullName name')
        .populate('teamLead', 'fullName name')
        .populate('managementApprover', 'fullName name')
        .sort({ createdAt: -1 })
        .limit(500),

      Transfer.find(req.tenant.companyId ? { companyId: req.tenant.companyId } : {})
        .populate('fromUser', 'fullName name employeeId')
        .populate('toUser', 'fullName name employeeId')
        .populate('managementApprover', 'fullName name')
        .sort({ createdAt: -1 })
        .limit(500),

      Return.find(req.tenant.companyId ? { companyId: req.tenant.companyId } : {})
        .populate('fromUser', 'fullName name employeeId')
        .populate('returnHandler', 'fullName name employeeId')
        .populate('store', 'fullName name')
        .sort({ createdAt: -1 })
        .limit(500),

      Barcode.find(req.tenant.companyId ? { companyId: req.tenant.companyId } : {})
        .populate('owner', 'fullName name employeeId')
        .sort({ createdAt: -1 })
        .limit(500)
    ]);

    const synthesizedLogs = [];
    const seenLogKeys = new Set();

    // Add existing DB AuditLogs
    dbAuditLogs.forEach(l => {
      const key = `${l.action}_${l.entityId}_${new Date(l.createdAt).getTime()}`;
      seenLogKeys.add(key);
      synthesizedLogs.push(l.toObject());
    });

    // 1. Synthesize Transaction Requisitions, Approvals, Dispatches, Receivings
    transactions.forEach(txn => {
      const materialsSummary = (txn.materials || []).map(m => m.materialName || m.name).join(', ') || 'Materials';
      const reqName = txn.requester?.fullName || txn.requester?.name || 'Requester';

      // Requisition Created
      if (txn.createdAt) {
        const key = `TRANSACTION_CREATED_${txn.transactionId}`;
        if (!seenLogKeys.has(key)) {
          seenLogKeys.add(key);
          synthesizedLogs.push({
            _id: `syn_create_${txn._id}`,
            action: 'TRANSACTION_CREATED',
            entity: 'Transaction',
            entityId: txn.transactionId,
            user: txn.requester,
            userName: reqName,
            description: `Requisition ${txn.transactionId} created by ${reqName} (${txn.department?.name || 'Department'}). Document: ${txn.documentType || 'RDC'}. Materials: ${materialsSummary}.`,
            createdAt: txn.createdAt
          });
        }
      }

      // Team Lead Approval
      if (['tl_approved', 'mgt_approved', 'store_accepted', 'dispatched', 'received', 'active', 'closed'].includes(txn.status)) {
        const key = `TL_APPROVAL_${txn.transactionId}`;
        if (!seenLogKeys.has(key)) {
          seenLogKeys.add(key);
          synthesizedLogs.push({
            _id: `syn_tl_${txn._id}`,
            action: 'TL_APPROVAL',
            entity: 'Transaction',
            entityId: txn.transactionId,
            user: txn.teamLead || txn.requester,
            userName: txn.teamLead?.fullName || 'Team Lead',
            description: `Team Lead approved requisition ${txn.transactionId} for ${reqName}.`,
            createdAt: new Date(new Date(txn.createdAt).getTime() + 10000)
          });
        }
      }

      // Store Dispatch
      if (txn.dispatchedAt || ['dispatched', 'received', 'active', 'closed'].includes(txn.status)) {
        const key = `STORE_DISPATCH_${txn.transactionId}`;
        if (!seenLogKeys.has(key)) {
          seenLogKeys.add(key);
          synthesizedLogs.push({
            _id: `syn_disp_${txn._id}`,
            action: 'STORE_DISPATCH',
            entity: 'Transaction',
            entityId: txn.transactionId,
            user: txn.handler || txn.store,
            userName: txn.handler?.fullName || 'Store Handler',
            description: `Store warehouse dispatched materials for requisition ${txn.transactionId}. Handler: ${txn.handler?.fullName || 'Sourcing Handler'}.`,
            createdAt: txn.dispatchedAt || new Date(new Date(txn.createdAt).getTime() + 30000)
          });
        }
      }

      // Physical Receipt
      if (txn.receivedAt || ['received', 'active', 'closed'].includes(txn.status)) {
        const key = `RECEIVE_${txn.transactionId}`;
        if (!seenLogKeys.has(key)) {
          seenLogKeys.add(key);
          synthesizedLogs.push({
            _id: `syn_rec_${txn._id}`,
            action: 'RECEIVE',
            entity: 'Transaction',
            entityId: txn.transactionId,
            user: txn.requester,
            userName: reqName,
            description: `Physical material receipt verified for requisition ${txn.transactionId} via mobile GeoPhoto camera by ${reqName}.`,
            createdAt: txn.receivedAt || new Date(new Date(txn.createdAt).getTime() + 60000)
          });
        }
      }
    });

    // 2. Synthesize Barcode Lifecycle Logs (Splits, Merges, Returns, Transfers)
    barcodes.forEach(bc => {
      if (bc.ownershipHistory && bc.ownershipHistory.length > 0) {
        bc.ownershipHistory.forEach((h, idx) => {
          const actName = (h.action || 'UPDATE').toUpperCase();
          const key = `BARCODE_${actName}_${bc.barcode}_${idx}`;
          if (!seenLogKeys.has(key)) {
            seenLogKeys.add(key);
            synthesizedLogs.push({
              _id: `syn_bc_${bc._id}_${idx}`,
              action: `BARCODE_${actName}`,
              entity: 'Barcode',
              entityId: bc.barcode,
              user: h.user || bc.owner,
              userName: h.user?.fullName || bc.owner?.fullName || 'Operator',
              description: `Barcode ${bc.barcode} (${bc.materialName}): ${h.action} — ${h.remarks || 'Barcode lifecycle action performed.'}`,
              createdAt: h.assignedAt || h.timestamp || bc.createdAt
            });
          }
        });
      }
    });

    // 3. Synthesize Transfer & Return Logs
    transfers.forEach(tr => {
      const key = `TRANSFER_${tr._id}`;
      if (!seenLogKeys.has(key)) {
        seenLogKeys.add(key);
        const trAction = tr.status === 'completed' ? 'TRANSFER_COMPLETED' : tr.status === 'rejected' ? 'TRANSFER_REJECTED' : tr.status === 'approved' ? 'TRANSFER_APPROVED' : 'TRANSFER_INITIATED';
        synthesizedLogs.push({
          _id: `syn_tr_${tr._id}`,
          action: trAction,
          entity: 'Transfer',
          entityId: tr.barcode || tr._id,
          user: tr.fromUser,
          userName: tr.fromUser?.fullName || 'Sender',
          description: `Material barcode transfer of ${tr.barcode || ''} from ${tr.fromUser?.fullName || 'Sender'} to ${tr.toUser?.fullName || 'Recipient'} (${tr.type === 'cross_department' ? 'Cross-Dept' : 'Same-Dept'} - ${tr.status.toUpperCase()}).`,
          createdAt: tr.createdAt
        });
      }
    });

    returns.forEach(rt => {
      const key = `RETURN_${rt._id}`;
      if (!seenLogKeys.has(key)) {
        seenLogKeys.add(key);
        synthesizedLogs.push({
          _id: `syn_rt_${rt._id}`,
          action: 'RETURN_REQUEST',
          entity: 'Return',
          entityId: rt.barcode || rt._id,
          user: rt.fromUser,
          userName: rt.fromUser?.fullName || 'Requester',
          description: `Store return logged for barcode ${rt.barcode || ''}. Remarks: ${rt.remarks || 'Surplus return'}.`,
          createdAt: rt.createdAt
        });
      }
    });

    // Filter by Category
    let filteredLogs = synthesizedLogs;
    if (category && category !== 'ALL') {
      filteredLogs = filteredLogs.filter(log => {
        const act = (log.action || '').toUpperCase();
        if (category === 'REQUISITION') return act.includes('TRANSACTION') || act.includes('APPROVAL') || act.includes('TL_') || act.includes('MGT_');
        if (category === 'STORE') return act.includes('DISPATCH') || act.includes('STORE');
        if (category === 'RECEIVING') return act.includes('RECEIVE') || act.includes('ACCEPT');
        if (category === 'TRANSFER') return act.includes('TRANSFER') || act.includes('HANDOVER');
        if (category === 'RETURN') return act.includes('RETURN');
        if (category === 'TALLY') return act.includes('TALLY') || act.includes('STOCK_JOURNAL');
        return true;
      });
    }

    // Filter by Search Query
    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      filteredLogs = filteredLogs.filter(log => {
        const desc = (log.description || '').toLowerCase();
        const act = (log.action || '').toLowerCase();
        const entId = (log.entityId || '').toLowerCase();
        const uName = (log.userName || log.user?.fullName || '').toLowerCase();
        return desc.includes(q) || act.includes(q) || entId.includes(q) || uName.includes(q);
      });
    }

    // Sort by createdAt descending
    filteredLogs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // Metrics Calculation
    const totalTransactions = await Transaction.countDocuments(req.tenant.companyId ? { companyId: req.tenant.companyId } : {});
    const totalDispatches = await Transaction.countDocuments({ status: { $in: ['store_accepted', 'dispatched', 'received', 'active', 'closed'] }, ...(req.tenant.companyId ? { companyId: req.tenant.companyId } : {}) });
    const totalReceives = await Transaction.countDocuments({ status: { $in: ['received', 'active', 'closed'] }, ...(req.tenant.companyId ? { companyId: req.tenant.companyId } : {}) });
    const totalTransfers = await Transfer.countDocuments(req.tenant.companyId ? { companyId: req.tenant.companyId } : {});
    const totalReturns = await Return.countDocuments(req.tenant.companyId ? { companyId: req.tenant.companyId } : {});
    const tallySyncedCount = await Transaction.countDocuments({ documentNumber: { $exists: true, $ne: null, $ne: '' }, ...(req.tenant.companyId ? { companyId: req.tenant.companyId } : {}) });

    res.json({
      success: true,
      summary: {
        totalActivities: filteredLogs.length,
        totalTransactions,
        totalDispatches,
        totalReceives,
        totalTransfers,
        totalReturns,
        tallySyncedCount
      },
      auditLogs: filteredLogs.slice(0, parseInt(limit)),
      transactions,
      transfers,
      returns
    });
  } catch (error) {
    console.error('Material movement activities error:', error);
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};
