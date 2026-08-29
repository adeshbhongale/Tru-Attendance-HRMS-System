const mongoose = require('mongoose');
const Barcode = require('../models/Barcode');
const Transaction = require('../models/Transaction');
const Transfer = require('../models/Transfer');
const Return = require('../models/Return');
const AuditLog = require('../models/AuditLog');
const Notification = require('../../../models/Notification');
const User = require('../../../models/User');
const Department = require('../../../models/Department');
const { emitToUser } = require('../../../config/socket');

const createNotification = async (companyId, userId, type, title, message, transactionId, barcodeId) => {
  try {
    const notif = await Notification.create({
      companyId,
      title: title || 'Material Notification',
      description: message || title || 'Material Notification',
      type: 'general notification',
      frequency: 'Instant',
      targetType: 'Specific Employees',
      employees: [userId]
    });
    if (userId) {
      emitToUser(userId.toString(), 'notification', notif);
    }
  } catch (err) {
    console.warn('Notification log skipped:', err.message);
  }
};

const isUserStoreApprover = (user) => {
  if (!user) return false;
  const adminType = String(user.adminType || user.departmentAdminType || '').toLowerCase();
  const uRole = String(user.role || '').toLowerCase();
  if (adminType === 'management' || adminType === 'accounts' || uRole === 'management') {
    return false;
  }

  if (['store', 'store_admin', 'tcstr1', 'store_manager'].includes(uRole)) return true;
  if (uRole === 'department_admin' && (adminType === 'store' || adminType === 'warehouse')) return true;
  const name = String(user.fullName || user.name || '').toLowerCase();
  const email = String(user.email || '').toLowerCase();
  if (name.includes('gokul') || email.includes('gokul')) return true;
  const roleCode = String(user.roleCode || '').toUpperCase();
  if (['STORE_ADMIN', 'TCSTR1', 'TCST8A', 'STORE'].includes(roleCode)) return true;
  if (['super_admin', 'company_admin'].includes(uRole)) return true;
  return false;
};

/**
 * Get barcode detail
 */
exports.getBarcodeDetail = async (req, res) => {
  try {
    const { barcode } = req.params;
    const normalizedBarcode = barcode ? barcode.trim().toUpperCase() : '';
    const companyQuery = req.tenant?.companyId
      ? { $or: [{ companyId: req.tenant.companyId }, { companyId: null }, { company: req.tenant.companyId }] }
      : {};

    const buildPopulateQuery = (query) => query
      .populate('owner', 'name fullName employeeId employeeIdCode email department designation')
      .populate('history.user', 'name fullName employeeId email')
      .populate('ownershipHistory.user', 'name fullName employeeId email')
      .populate('closeRequest.managementApprover', 'name fullName employeeId email')
      .populate('closeRequest.requester', 'name fullName employeeId email')
      .populate({
        path: 'transaction',
        populate: [
          { path: 'requester', select: 'name fullName employeeId employeeIdCode email department designation' },
          { path: 'teamLead', select: 'name fullName employeeId email' },
          { path: 'handler', select: 'name fullName employeeId email' }
        ]
      });

    let bc = await buildPopulateQuery(Barcode.findOne({ barcode: normalizedBarcode, ...companyQuery }));

    // Fallback 1: Search exact barcode without company restriction
    if (!bc) {
      bc = await buildPopulateQuery(Barcode.findOne({ barcode: normalizedBarcode }));
    }

    // Fallback 2: Regex search ignoring leading zeroes or case variations (e.g. 0291004 vs 02910004)
    if (!bc) {
      const strippedBarcode = normalizedBarcode.replace(/^0+/, '');
      bc = await buildPopulateQuery(Barcode.findOne({
        barcode: { $regex: new RegExp(strippedBarcode, 'i') },
        ...companyQuery
      }));
    }

    if (!bc) {
      return res.status(404).json({ message: 'Barcode not found.' });
    }

    // BACKEND AUTO-HEAL: If companyId or owner is missing on DB, update MongoDB asynchronously
    const autoHealUpdates = {};
    if (!bc.companyId && req.tenant?.companyId) {
      autoHealUpdates.companyId = req.tenant.companyId;
    }
    if (!bc.owner && bc.transaction && bc.transaction.requester) {
      const reqId = bc.transaction.requester._id || bc.transaction.requester;
      if (reqId) autoHealUpdates.owner = reqId;
    }
    if (Object.keys(autoHealUpdates).length > 0) {
      Barcode.updateOne({ _id: bc._id }, { $set: autoHealUpdates }).catch(() => {});
    }

    const Department = require('../../../models/Department');
    const allDepts = await Department.find(companyQuery).lean();
    const deptMap = new Map(allDepts.map(d => [d._id.toString(), d.name]));

    const bcObj = bc.toObject();

    // BACKEND AUTO-FALLBACK: Bind transaction requester as owner if unassigned
    if (!bcObj.owner && bcObj.transaction && bcObj.transaction.requester) {
      bcObj.owner = bcObj.transaction.requester;
    }

    if (bcObj.ownerDepartment) {
      const dVal = typeof bcObj.ownerDepartment === 'object' ? (bcObj.ownerDepartment.name || bcObj.ownerDepartment._id) : String(bcObj.ownerDepartment);
      bcObj.ownerDepartment = { name: deptMap.get(String(dVal)) || String(dVal) };
    }
    if (bcObj.ownershipHistory && Array.isArray(bcObj.ownershipHistory)) {
      bcObj.ownershipHistory = bcObj.ownershipHistory.map(h => {
        if (h.department) {
          const dVal = typeof h.department === 'object' ? (h.department.name || h.department._id) : String(h.department);
          return { ...h, department: { name: deptMap.get(String(dVal)) || String(dVal) } };
        }
        return h;
      });
    }
    if (bcObj.transaction && bcObj.transaction.department) {
      const dVal = typeof bcObj.transaction.department === 'object' ? (bcObj.transaction.department.name || bcObj.transaction.department._id) : String(bcObj.transaction.department);
      bcObj.transaction.department = { name: deptMap.get(String(dVal)) || String(dVal) };
    }

    const targetBarcodeString = bcObj.barcode || normalizedBarcode;

    // Get related transfers, returns, splits, and close requests
    const transfers = await Transfer.find({ barcode: targetBarcodeString, ...companyQuery })
      .populate('fromUser', 'name fullName employeeId email')
      .populate('toUser', 'name fullName employeeId email')
      .sort({ createdAt: -1 });

    const returns = await Return.find({ barcode: targetBarcodeString, ...companyQuery })
      .populate('fromUser', 'fullName employeeId email')
      .populate('returnHandler', 'fullName employeeId email')
      .sort({ createdAt: -1 });

    const SplitRequest = require('../models/SplitRequest');
    const splits = await SplitRequest.find({ barcode: targetBarcodeString, ...companyQuery })
      .populate('requester', 'fullName employeeId email')
      .sort({ createdAt: -1 });

    const CloseRequest = require('../models/CloseRequest');
    const closeRequests = await CloseRequest.find({ barcode: targetBarcodeString, ...companyQuery })
      .populate('requester', 'fullName employeeId email')
      .sort({ createdAt: -1 });

    const ExchangeRequest = require('../models/ExchangeRequest');
    const exchanges = await ExchangeRequest.find({ ...companyQuery, $or: [{ oldBarcode: targetBarcodeString }, { newBarcode: targetBarcodeString }] })
      .populate('requester', 'fullName employeeId email')
      .populate('approvedBy', 'fullName employeeId email')
      .sort({ createdAt: -1 });

    const MergeRequest = require('../models/MergeRequest');
    const merges = await MergeRequest.find({ ...companyQuery, $or: [
        { mergeBarcodes: targetBarcodeString },
        { selectedParentBarcode: targetBarcodeString },
        { finalParentBarcode: targetBarcodeString }
      ]
    })
      .populate('requester', 'fullName employeeId email')
      .populate('approvedBy', 'fullName employeeId email')
      .sort({ createdAt: -1 });

    const InternalReceipt = require('../models/InternalReceipt');
    const ExternalReceipt = require('../models/ExternalReceipt');
    let receipts = [];
    if (bc && bc.transaction) {
      const txnId = bc.transaction._id;
      const [intRecs, extRecs] = await Promise.all([
        InternalReceipt.find({ transaction: txnId, ...companyQuery }).populate('receiver', 'fullName employeeId email'),
        ExternalReceipt.find({ 'materials.barcode': targetBarcodeString, ...companyQuery }).populate('receiver', 'fullName employeeId email')
      ]);
      receipts = [...intRecs, ...extRecs];
    }

    res.json({ barcode: bcObj, transfers, returns, splits, closeRequests, exchanges, receipts, merges });
  } catch (error) {
    console.error('getBarcodeDetail error:', error);
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

/**
 * Get all barcodes for a transaction
 */
exports.getBarcodesByTransaction = async (req, res) => {
  try {
    const { transactionId } = req.params;
    const companyId = req.tenant?.companyId || req.user?.companyId || null;
    const idFilter = [
      { transactionId },
      ...(mongoose.Types.ObjectId.isValid(transactionId) ? [{ transaction: transactionId }, { _id: transactionId }] : [])
    ];

    const filter = { $or: idFilter };
    if (companyId) {
      filter.$and = [
        { $or: idFilter },
        { $or: [{ companyId }, { companyId: null }, { company: companyId }] }
      ];
      delete filter.$or;
    }

    const barcodes = await Barcode.find(filter)
      .populate('owner', 'fullName employeeId department name')
      .populate('history.user', 'fullName employeeId name');

    res.json({ success: true, barcodes });
  } catch (error) {
    console.error('getBarcodesByTransaction error:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
};

const checkBarcodePendingActions = async (barcodeStr, companyId) => {
  const normalized = barcodeStr ? barcodeStr.trim().toUpperCase() : '';
  if (!normalized) return null;

  const companyQuery = companyId ? { $or: [{ companyId }, { companyId: null }, { company: companyId }] } : {};

  // 1. Check Split
  const SplitRequest = require('../models/SplitRequest');
  const pendingSplit = await SplitRequest.findOne({ barcode: normalized, status: 'pending', ...companyQuery });
  if (pendingSplit) return 'An exchange, split, return, transfer, merge, or close request is already pending for this barcode.';

  // 2. Check Exchange
  const ExchangeRequest = require('../models/ExchangeRequest');
  const pendingExchange = await ExchangeRequest.findOne({ oldBarcode: normalized, status: 'pending', ...companyQuery });
  if (pendingExchange) return 'An exchange, split, return, transfer, merge, or close request is already pending for this barcode.';

  // 3. Check Transfer
  const Transfer = require('../models/Transfer');
  const pendingTransfer = await Transfer.findOne({ barcode: normalized, status: 'pending', ...companyQuery });
  if (pendingTransfer) return 'An exchange, split, return, transfer, merge, or close request is already pending for this barcode.';

  // 4. Check Return
  const Return = require('../models/Return');
  const pendingReturn = await Return.findOne({ barcode: normalized, status: { $in: ['pending', 'handler_assigned', 'collected', 'store_received'] }, ...companyQuery });
  if (pendingReturn) return 'An exchange, split, return, transfer, merge, or close request is already pending for this barcode.';

  // 5. Check Close
  const CloseRequest = require('../models/CloseRequest');
  const pendingClose = await CloseRequest.findOne({ barcode: normalized, status: { $in: ['pending', 'pending_accounts_approval', 'pending_store_acceptance'] }, ...companyQuery });
  if (pendingClose) return 'An exchange, split, return, transfer, merge, or close request is already pending for this barcode.';

  // 6. Check Merge
  const MergeRequest = require('../models/MergeRequest');
  const pendingMerge = await MergeRequest.findOne({ mergeBarcodes: normalized, status: 'pending', ...companyQuery });
  if (pendingMerge) return 'A merge request is already pending for this barcode.';

  return null;
};

/**
 * Transfer barcode to another user
 */
exports.transferBarcode = async (req, res) => {
  try {
    const { barcode, toUserId, remarks, requiresApproval, gps, photos, managementApprover } = req.body;
    const normalizedBarcode = barcode ? barcode.trim().toUpperCase() : '';

    const bc = await Barcode.findOne({ barcode: normalizedBarcode, companyId: req.tenant.companyId }).populate('owner');
    if (!bc) return res.status(404).json({ message: 'Barcode not found.' });
    if (bc.status !== 'Active' && bc.status !== 'Exchanged') return res.status(400).json({ message: 'Barcode is not active.' });

    const pendingError = await checkBarcodePendingActions(normalizedBarcode, req.tenant.companyId);
    if (pendingError) {
      return res.status(400).json({ message: pendingError });
    }

    // Validate that the parent transaction is fully delivered and received by the requester
    if (bc.transactionId) {
      const txn = await Transaction.findOne({ transactionId: bc.transactionId, companyId: req.tenant.companyId });
      if (txn && !['received', 'active', 'partially_returned', 'closed'].includes(txn.status)) {
        return res.status(400).json({ message: 'Cannot transfer barcode before the material is fully delivered and received.' });
      }
    }

    const ownerIdStr = bc.owner ? (bc.owner._id ? bc.owner._id.toString() : bc.owner.toString()) : '';
    const currentUserIdStr = req.user._id ? req.user._id.toString() : '';
    if (ownerIdStr && currentUserIdStr && ownerIdStr !== currentUserIdStr && req.user.role !== 'super_admin') {
      return res.status(403).json({ message: 'You are not the owner of this barcode.' });
    }

    const User = require('../../../models/User');
    const targetId = toUserId || req.body.targetUserId || req.body.toUser;
    const toUser = await User.findOne({ _id: targetId, companyId: req.tenant.companyId }).populate('department');
    if (!toUser) return res.status(404).json({ message: 'Target user not found.' });

    const extractDeptVal = (userObj) => {
      if (!userObj || !userObj.department) return undefined;
      let d = userObj.department;
      if (typeof d === 'object') {
        if (d._id && mongoose.Types.ObjectId.isValid(d._id.toString())) {
          return d._id;
        }
        if (d.name) return d.name;
      }
      if (typeof d === 'string') {
        const trimmed = d.trim();
        if (mongoose.Types.ObjectId.isValid(trimmed)) {
          return new mongoose.Types.ObjectId(trimmed);
        }
        return trimmed;
      }
      return undefined;
    };

    const getDeptNameStr = (userObj) => {
      if (!userObj || !userObj.department) return '';
      let d = userObj.department;
      if (typeof d === 'object') {
        return (d.name || d.departmentName || d._id || '').toString().toLowerCase().trim();
      }
      return String(d).toLowerCase().trim();
    };

    const fromDeptVal = extractDeptVal(req.user);
    const toDeptVal = extractDeptVal(toUser);
    const fromDeptName = getDeptNameStr(req.user);
    const toDeptName = getDeptNameStr(toUser);
    const isCrossDept = Boolean(fromDeptName && toDeptName && fromDeptName !== toDeptName);
    const needsMgmtApproval = isCrossDept || Boolean(requiresApproval || req.body.requiresMgmtApproval);

    const transfer = await Transfer.create({ companyId: req.tenant.companyId,
      transactionId: bc.transactionId,
      barcode: normalizedBarcode,
      fromUser: req.user._id,
      toUser: targetId,
      fromDepartment: fromDeptVal,
      toDepartment: toDeptVal,
      type: isCrossDept ? 'cross_department' : 'internal',
      requiresApproval: needsMgmtApproval,
      managementApprover: needsMgmtApproval ? (managementApprover || req.body.managementApproverId) : undefined,
      status: needsMgmtApproval ? 'pending' : 'approved', // Same dept skips mgmt approval, goes straight to recipient for accept/reject!
      remarks,
      gps,
      photos: photos || [],
    });

    bc.status = 'Transfer Pending';
    bc.history.push({
      action: 'Transfer Initiated',
      user: req.user._id,
      remarks: remarks || (isCrossDept
        ? `Transfer initiated to ${toUser.fullName} (pending Management approval)`
        : `Transfer initiated to ${toUser.fullName} (pending recipient acceptance)`),
    });
    if (isCrossDept) {
      bc.history.push({
        action: 'Transfer Pending Management Approval',
        user: req.user._id,
        remarks: remarks || 'Awaiting management review/approval',
        timestamp: new Date()
      });
    } else {
      bc.history.push({
        action: 'Transfer Pending Acceptance',
        user: targetId,
        remarks: remarks || 'Employee request pending recipient acceptance',
        timestamp: new Date()
      });
    }
    await bc.save();

    // Notification routing:
    // 1. For cross-dept transfers (pending mgmt approval): notify ONLY the selected management approver
    // 2. For same-dept transfers: notify recipient directly
    const targetMgmtId = managementApprover || req.body.managementApproverId;
    if (needsMgmtApproval && targetMgmtId) {
      await createNotification(req.tenant.companyId, 
        targetMgmtId,
        'transfer_pending_mgmt',
        'Transfer Approval Required',
        `${req.user.fullName} requested cross-department transfer of material ${normalizedBarcode} to ${toUser.fullName}`,
        bc.transactionId,
        normalizedBarcode
      );
    } else {
      await createNotification(req.tenant.companyId, 
        targetId,
        'transfer_initiated',
        'Transfer Request',
        `${req.user.fullName} wants to transfer ${normalizedBarcode} to you`,
        bc.transactionId,
        normalizedBarcode
      );
    }

    // Notify all store admins about this transfer
    try {
      const storeAdmins = await User.find({ companyId: req.tenant.companyId, role: 'department_admin', departmentAdminType: 'store' });
      for (const admin of storeAdmins) {
        await createNotification(req.tenant.companyId, 
          admin._id,
          'transfer_initiated_store',
          'Material Transfer Initiated',
          `Material ${barcode} is being transferred from ${req.user.fullName} to ${toUser.fullName} for transaction ${bc.transactionId || 'N/A'}`,
          bc.transactionId,
          barcode
        );
      }
    } catch (err) {
      console.error('Error notifying store admins about transfer:', err);
    }

    await AuditLog.create({ companyId: req.tenant.companyId,
      action: 'TRANSFER_INITIATED',
      entity: 'Barcode',
      entityId: normalizedBarcode,
      user: req.user._id,
      userName: req.user.fullName,
      description: `Material barcode transfer of ${normalizedBarcode} initiated by ${req.user.fullName} to ${toUser.fullName} (${isCrossDept ? 'Cross-Department' : 'Same-Department'}).`,
    });

    console.log('✅ BARCODE TRANSFER SUBMITTED & SAVED IN DB SUCCESSFULLY:', {
      transferId: transfer._id,
      barcode: transfer.barcode,
      fromUser: req.user.fullName,
      toUser: toUser.fullName,
      status: transfer.status,
      type: transfer.type,
    });

    res.json({ message: 'Transfer initiated successfully.', transfer, success: true });
  } catch (error) {
    console.error('Transfer error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

exports.handleTransfer = async (req, res) => {
  try {
    const { transferId, action, reason, gps } = req.body;

    const transfer = await Transfer.findOne({ _id: transferId, companyId: req.tenant.companyId });
    if (!transfer) return res.status(404).json({ message: 'Transfer not found.' });

    if (['completed', 'rejected', 'cancelled'].includes(transfer.status)) {
      return res.status(400).json({ message: 'This transfer request has already been processed.' });
    }

    // Check if acting as Management Approver
    const isTargetMgmtApprover = transfer.managementApprover && transfer.managementApprover.toString() === req.user._id.toString();
    const isSuperAdmin = req.user.role === 'super_admin';
    const isGeneralManagementRole = (req.user.role === 'department_admin' && req.user.departmentAdminType === 'management') || req.user.role === 'admin' || req.user.role === 'company_admin';

    // If transfer is cross-department and currently pending management approval
    if (transfer.status === 'pending' && (transfer.type === 'cross_department' || transfer.requiresApproval)) {
      const isAuthorizedMgmt = isSuperAdmin || isTargetMgmtApprover || (!transfer.managementApprover && isGeneralManagementRole);
      if (!isAuthorizedMgmt) {
        return res.status(403).json({ message: 'You are not the designated management approver for this transfer request.' });
      }

      if (action === 'accept') {
        transfer.status = 'approved';
        transfer.approvedBy = req.user._id;
        transfer.approvedAt = new Date();
        await transfer.save();

        const bc = await Barcode.findOne({ barcode: transfer.barcode, companyId: req.tenant.companyId });
        if (bc) {
          bc.history.push({
            action: 'Transfer Approved by Management',
            user: req.user._id,
            remarks: reason || 'Management approved transfer request',
            timestamp: new Date()
          });
          bc.history.push({
            action: 'Transfer Pending Acceptance',
            user: transfer.toUser,
            remarks: transfer.remarks || 'Employee request pending recipient acceptance',
            timestamp: new Date()
          });
          await bc.save();
        }

        await createNotification(req.tenant.companyId, 
          transfer.toUser,
          'transfer_approved_mgt',
          'Transfer Approved by Management',
          `Management approved transfer of ${transfer.barcode}. You can now accept it.`,
          transfer.transactionId,
          transfer.barcode
        );

        await AuditLog.create({ companyId: req.tenant.companyId,
          action: 'TRANSFER_APPROVED',
          entity: 'Transfer',
          entityId: transfer.barcode,
          user: req.user._id,
          userName: req.user.fullName,
          description: `Cross-department material transfer of barcode ${transfer.barcode} approved by management (${req.user.fullName}).`,
        });

        return res.json({ message: 'Transfer approved by management.', transfer });
      } else if (action === 'reject') {
        transfer.status = 'rejected';
        transfer.rejectedBy = req.user._id;
        transfer.rejectionReason = reason;
        await transfer.save();

        const bc = await Barcode.findOne({ barcode: transfer.barcode, companyId: req.tenant.companyId });
        if (bc) {
          bc.status = 'Active';
          bc.history.push({
            action: 'Transfer Rejected by Management',
            user: req.user._id,
            remarks: reason,
          });
          await bc.save();
        }

        await createNotification(req.tenant.companyId, 
          transfer.fromUser,
          'transfer_rejected_mgt',
          'Transfer Rejected by Management',
          `Management rejected transfer of ${transfer.barcode}: ${reason}`,
          transfer.transactionId,
          transfer.barcode
        );

        await AuditLog.create({ companyId: req.tenant.companyId,
          action: 'TRANSFER_REJECTED',
          entity: 'Transfer',
          entityId: transfer.barcode,
          user: req.user._id,
          userName: req.user.fullName,
          description: `Cross-department material transfer of barcode ${transfer.barcode} rejected by management (${req.user.fullName}): ${reason || 'N/A'}.`,
        });

        return res.json({ message: 'Transfer rejected by management.', transfer });
      }
    }

    // Otherwise, this is the recipient accepting/rejecting
    if (transfer.toUser.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'You are not authorized to respond to this transfer.' });
    }

    if (action === 'accept') {
      transfer.status = 'completed';
      if (req.body.photos) {
        transfer.photos = req.body.photos;
      }
      const bc = await Barcode.findOne({ barcode: transfer.barcode, companyId: req.tenant.companyId });
      bc.owner = transfer.toUser;
      bc.ownerDepartment = transfer.toDepartment;
      bc.status = 'Active';
      bc.transferCount += 1;
      bc.ownershipHistory.push({
        user: transfer.toUser,
        department: transfer.toDepartment,
        action: 'transferred',
        remarks: 'Transfer accepted',
      });
      bc.history.push({
        action: 'Transfer Accepted',
        user: req.user._id,
        remarks: reason || 'Transfer accepted',
        gps,
        photos: req.body.photos || []
      });
      await bc.save();

      // Update nested barcode owner inside the Transaction document
      const Transaction = require('../models/Transaction');
      await Transaction.updateOne(
        { companyId: req.tenant.companyId, transactionId: transfer.transactionId, 'materials.barcodes.barcode': transfer.barcode },
        { $set: { 'materials.$[].barcodes.$[bc].owner': transfer.toUser } },
        { arrayFilters: [{ 'bc.barcode': transfer.barcode }] }
      );

      const User = require('../../../models/User');
      const fromUserObj = await User.findOne({ _id: transfer.fromUser, companyId: req.tenant.companyId });
      const toUserObj = await User.findOne({ _id: transfer.toUser, companyId: req.tenant.companyId });

      // Notify the sender (who transferred)
      await createNotification(req.tenant.companyId, 
        transfer.fromUser,
        'transfer_success_sender',
        'Material Transferred Successfully',
        `Material ${bc ? bc.materialName : 'Material'} (Barcode: ${transfer.barcode}) transferred successfully from you to ${toUserObj?.fullName || 'Recipient'}.`,
        transfer.transactionId,
        transfer.barcode
      );

      // Notify the recipient (who currently holds it)
      await createNotification(req.tenant.companyId, 
        transfer.toUser,
        'transfer_success_recipient',
        'Material Transferred Successfully',
        `Material ${bc ? bc.materialName : 'Material'} (Barcode: ${transfer.barcode}) transferred successfully to you from ${fromUserObj?.fullName || 'Sender'}.`,
        transfer.transactionId,
        transfer.barcode
      );

      // Create Tally Gokul Shirgaon Godown Transfer voucher for the transfer
      try {
        const tallyController = require('./tally.controller');
        const Transaction = require('../models/Transaction');
        const parentTxn = await Transaction.findOne({ transactionId: transfer.transactionId, companyId: req.tenant.companyId });
        if (parentTxn) {
          // Find the material matching this barcode
          const matchedMat = parentTxn.materials.find(m =>
            m.barcodes && m.barcodes.some(b => {
              const bStr = typeof b === 'string' ? b : (b.barcode || '');
              return bStr === transfer.barcode;
            })
          );
          const materialForTally = [{
            name: matchedMat ? matchedMat.name : (bc ? bc.materialName : 'Unknown Material'),
            quantity: 1,
            unit: matchedMat ? matchedMat.unit : 'pcs',
            price: matchedMat ? matchedMat.price : 0,
            barcodes: [transfer.barcode]
          }];
          const sourceGodown = fromUserObj?.fullName || 'GOKUL SHIRGAON';
          const destGodown = toUserObj?.fullName || 'Main Location';
          const voucherNum = await tallyController.createTallyGodownTransfer(
            transfer._id.toString(),
            'transfer',
            sourceGodown,
            destGodown,
            materialForTally,
            transfer.createdAt || new Date()
          );
          if (voucherNum) {
            console.log(`Tally transfer voucher created: ${voucherNum} for barcode ${transfer.barcode}`);
          }
        }
        await AuditLog.create({ companyId: req.tenant.companyId,
          action: 'TRANSFER_COMPLETED',
          entity: 'Barcode',
          entityId: transfer.barcode,
          user: req.user._id,
          userName: req.user.fullName,
          description: `Material barcode ${transfer.barcode} transfer accepted by recipient ${req.user.fullName}. Custody updated.`,
        });
      } catch (tallyErr) {
        console.error('Failed to create Tally godown transfer voucher for transfer:', tallyErr.message);
      }
    } else if (action === 'reject') {
      transfer.status = 'rejected';
      transfer.rejectedBy = req.user._id;
      transfer.rejectionReason = reason;

      const bc = await Barcode.findOne({ barcode: transfer.barcode, companyId: req.tenant.companyId });
      if (bc) {
        bc.status = 'Active';
        bc.history.push({
          action: 'Transfer Rejected',
          user: req.user._id,
          remarks: reason,
        });
        await bc.save();
      }

      await createNotification(req.tenant.companyId, 
        transfer.fromUser,
        'transfer_rejected',
        'Transfer Rejected',
        `Transfer of ${transfer.barcode} was rejected: ${reason}`,
        transfer.transactionId,
        transfer.barcode
      );

      await AuditLog.create({ companyId: req.tenant.companyId,
        action: 'TRANSFER_REJECTED',
        entity: 'Barcode',
        entityId: transfer.barcode,
        user: req.user._id,
        userName: req.user.fullName,
        description: `Material barcode ${transfer.barcode} transfer rejected by recipient ${req.user.fullName}: ${reason || 'N/A'}.`,
      });
    }

    // Notify all store admins about this transfer update
    try {
      const User = require('../../../models/User');
      const fromUserObj = await User.findOne({ _id: transfer.fromUser, companyId: req.tenant.companyId });
      const toUserObj = await User.findOne({ _id: transfer.toUser, companyId: req.tenant.companyId });
      const storeAdmins = await User.find({ companyId: req.tenant.companyId, role: 'department_admin', departmentAdminType: 'store' });
      const bc = await Barcode.findOne({ barcode: transfer.barcode, companyId: req.tenant.companyId });
      for (const admin of storeAdmins) {
        let msg = `Transfer of barcode ${transfer.barcode} from ${fromUserObj?.fullName || 'Requester'} to ${toUserObj?.fullName || 'Recipient'} was ${action}ed. New Status: ${transfer.status.toUpperCase()}`;
        if (action === 'accept' && bc) {
          msg = `Material ${bc.materialName} (Barcode: ${transfer.barcode}) was transferred from ${fromUserObj?.fullName || 'Sender'} to ${toUserObj?.fullName || 'Recipient'}.`;
        }
        await createNotification(req.tenant.companyId, 
          admin._id,
          'transfer_status_update_store',
          'Material Transferred',
          msg,
          transfer.transactionId,
          transfer.barcode
        );
      }
    } catch (err) {
      console.error('Error notifying store admins about transfer update:', err);
    }

    await transfer.save();
    res.json({ message: `Transfer ${action}ed.`, transfer });
  } catch (error) {
    console.error('Handle transfer error:', error);
    res.status(550).json({ message: 'Server error.' });
  }
};

/**
 * Return barcode to store
 */
exports.returnBarcode = async (req, res) => {
  try {
    const { barcode, reason, condition, remarks, gps, photos, returnHandler } = req.body;
    const normalizedBarcode = barcode ? barcode.trim().toUpperCase() : '';

    const bc = await Barcode.findOne({ barcode: normalizedBarcode, companyId: req.tenant.companyId });
    if (!bc) return res.status(404).json({ message: 'Barcode not found.' });
    if (bc.status !== 'Active' && bc.status !== 'Exchanged') {
      return res.status(400).json({ message: 'Barcode is not active.' });
    }

    const pendingError = await checkBarcodePendingActions(normalizedBarcode, req.tenant.companyId);
    if (pendingError) {
      return res.status(400).json({ message: pendingError });
    }

    // Validate that the parent transaction is fully delivered and received by the requester
    if (bc.transactionId) {
      const txn = await Transaction.findOne({ transactionId: bc.transactionId, companyId: req.tenant.companyId });
      if (txn && !['received', 'active', 'partially_returned', 'closed'].includes(txn.status)) {
        return res.status(400).json({ message: 'Cannot return barcode before the material is fully delivered and received.' });
      }
    }

    // Resolve target store / return employee from Super Admin Approval Workflow Policy or Gokul Shirgaon
    let resolvedReturnHandler = returnHandler;
    if (!resolvedReturnHandler) {
      try {
        const ApprovalWorkflow = require('../../../models/ApprovalWorkflow');
        const User = require('../../../models/User');
        const activePolicy = await ApprovalWorkflow.findOne({
          module: 'Material',
          isActive: true
        }).lean();

        if (activePolicy && activePolicy.steps) {
          const returnStep = activePolicy.steps.find(s => s.stepType === 'RETURN' || s.stepType === 'STORE');
          if (returnStep && returnStep.targetUser) {
            resolvedReturnHandler = returnStep.targetUser;
          } else if (returnStep) {
            const workflowEngine = require('../../../services/workflowEngine');
            const resolvedUser = await workflowEngine.resolveStepApprover(returnStep, req.user);
            if (resolvedUser && resolvedUser._id) {
              resolvedReturnHandler = resolvedUser._id;
            }
          }
        }

        if (!resolvedReturnHandler) {
          const storeUser = await User.findOne({
            companyId: req.tenant.companyId,
            $or: [
              { roleCode: 'TCSTR1' },
              { roleCode: 'TCST5A' },
              { role: 'store_admin' },
              { role: 'store' },
              { departmentAdminType: 'store' },
              { adminType: 'store' },
              { department: { $regex: /store/i }, role: { $in: ['admin', 'manager', 'team_lead'] } }
            ],
            status: 'active'
          }).sort({ roleCode: 1 }).lean();
          if (storeUser) {
            resolvedReturnHandler = storeUser._id;
          }
        }
      } catch (wfErr) {
        console.warn('Could not resolve return handler from workflow policy:', wfErr.message);
      }
    }

    const finalReturnHandler = resolvedReturnHandler || null;
    const status = finalReturnHandler ? 'handler_assigned' : 'pending';

    const returnDoc = await Return.create({ companyId: req.tenant.companyId,
      transactionId: bc.transactionId,
      barcode,
      fromUser: req.user._id,
      returnHandler: finalReturnHandler,
      status,
      reason: reason || remarks,
      condition: condition || 'good',
      remarks: remarks || reason,
      gps,
      photos: photos || [],
      documents: req.body.documents || [],
    });

    console.log('📌 [RETURN REQUEST SUBMITTED BY EMPLOYEE]:', {
      returnId: returnDoc._id,
      barcode: returnDoc.barcode,
      fromUser: req.user ? (req.user.fullName || req.user.name || req.user._id) : req.user._id,
      assignedHandler: finalReturnHandler,
      condition: returnDoc.condition,
      reason: returnDoc.reason,
      photosCount: returnDoc.photos ? returnDoc.photos.length : 0,
      documentsCount: returnDoc.documents ? returnDoc.documents.length : 0,
      timestamp: new Date().toISOString()
    });

    let handlerUser = null;
    if (returnHandler) {
      const User = require('../../../models/User');
      handlerUser = await User.findOne({ _id: returnHandler, companyId: req.tenant.companyId });
    }

    bc.history.push({
      action: returnHandler ? 'Return Requested (Via Handler)' : 'Return Requested (Direct)',
      user: req.user._id,
      remarks: reason || 'Return to store requested',
      gps,
      metadata: returnHandler ? {
        handlerId: returnHandler,
        handlerName: handlerUser ? handlerUser.fullName : 'Handler'
      } : undefined
    });
    await bc.save();

    await AuditLog.create({ companyId: req.tenant.companyId,
      action: 'RETURN_REQUEST',
      entity: 'Barcode',
      entityId: barcode,
      user: req.user._id,
      userName: req.user.fullName,
      description: `Return requested for ${barcode} (Method: ${returnHandler ? 'Handler' : 'Direct'})`,
    });

    // Notify handler if assigned
    if (returnHandler) {
      await createNotification(req.tenant.companyId, 
        returnHandler,
        'handler_assigned',
        'Return Delivery Assigned',
        `You have been assigned to collect and return barcode ${barcode} to store`,
        bc.transactionId,
        barcode
      );

      if (bc.transactionId) {
        const parentTxn = await Transaction.findOne({ transactionId: bc.transactionId, companyId: req.tenant.companyId });
        if (parentTxn) {
          parentTxn.handler = returnHandler;
          if (!parentTxn.chatMembers.includes(returnHandler)) {
            parentTxn.chatMembers.push(returnHandler);
          }
          const User = require('../../../models/User');
          const handlerUser = await User.findOne({ _id: returnHandler, companyId: req.tenant.companyId });
          const handlerName = handlerUser ? handlerUser.fullName : 'Handler';
          parentTxn.timeline.push({
            action: 'Handler Assigned',
            remarks: remarks || `Assigned return handler: ${handlerName}`,
            user: req.user._id,
          });
          await parentTxn.save();
        }
      }
    }

    res.json({ message: 'Return request submitted.', return: returnDoc });
  } catch (error) {
    console.error('Return barcode error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

/**
 * Return Multiple Barcodes in a single bulk request
 */
exports.returnMultipleBarcodes = async (req, res) => {
  try {
    const {
      barcodesToReturn,
      barcodes,
      transactionId,
      returnMethod,
      handlerId,
      returnHandler,
      reason,
      condition,
      remarks,
      photos,
      photoUrl,
      coordinates,
      documents
    } = req.body;

    const bList = barcodesToReturn || barcodes || [];
    if (!Array.isArray(bList) || bList.length === 0) {
      return res.status(400).json({ message: 'No barcodes provided for bulk return.' });
    }

    const finalHandler = returnMethod === 'handler' ? (handlerId || returnHandler) : null;
    const returnStatus = finalHandler ? 'handler_assigned' : 'pending';
    const bulkReturnId = `BULK-RET-${Date.now()}`;

    const returnDocs = [];

    for (const bItem of bList) {
      const barcodeStr = typeof bItem === 'string' ? bItem.trim().toUpperCase() : (bItem.barcode || '').trim().toUpperCase();
      if (!barcodeStr) continue;

      const bc = await Barcode.findOne({ barcode: barcodeStr, companyId: req.tenant.companyId });
      if (!bc || bc.status !== 'Active') continue;

      const returnDoc = await Return.create({ companyId: req.tenant.companyId,
        transactionId: transactionId || bc.transactionId,
        bulkReturnId,
        barcode: barcodeStr,
        fromUser: req.user._id,
        returnHandler: finalHandler,
        status: returnStatus,
        reason: reason || remarks || 'Bulk Return',
        condition: condition || 'good',
        remarks: remarks || reason,
        gps: coordinates ? { lat: coordinates[1], lng: coordinates[0] } : undefined,
        photos: photos || (photoUrl ? [{ url: photoUrl }] : []),
        documents: documents || [],
      });

      bc.history.push({
        action: finalHandler ? 'Return Requested (Via Handler)' : 'Return Requested (Direct Store)',
        user: req.user._id,
        remarks: remarks || reason || 'Bulk return to store requested',
      });
      await bc.save();

      returnDocs.push(returnDoc);
    }

    console.log(`📌 [BULK RETURN SUCCESS]: Submitted ${returnDocs.length} return request(s) for user ${req.user.fullName || req.user.name}`);

    res.json({
      success: true,
      message: `Submitted ${returnDocs.length} return request(s).`,
      returns: returnDocs,
      bulkReturnId
    });
  } catch (error) {
    console.error('Return multiple barcodes error:', error);
    res.status(500).json({ message: 'Server error during bulk return.', error: error.message });
  }
};

/**
 * Store accepts return
 */
exports.acceptReturn = async (req, res) => {
  try {
    const { returnId } = req.params;
    const returnDoc = await Return.findOne({ _id: returnId, companyId: req.tenant.companyId });
    if (!returnDoc) return res.status(404).json({ message: 'Return not found.' });

    returnDoc.status = 'completed';
    returnDoc.store = req.user._id;
    returnDoc.receivedAt = new Date();
    await returnDoc.save();

    // Update barcode
    const bc = await Barcode.findOne({ barcode: returnDoc.barcode, companyId: req.tenant.companyId });
    if (bc.status === 'Exchanged') {
      bc.status = 'Returned';
      bc.owner = req.user._id; // Store user
      bc.history.push({
        action: 'Returned to Store (Exchange Completed)',
        user: req.user._id,
        remarks: 'Store received and confirmed warranty return of old barcode',
        timestamp: new Date()
      });
      bc.ownershipHistory.push({
        user: req.user._id,
        action: 'returned',
        remarks: 'Returned to store (exchanged barcode)',
      });
      await bc.save();

      const ExchangeRequest = require('../models/ExchangeRequest');
      await ExchangeRequest.findOneAndUpdate({ companyId: req.tenant.companyId, oldBarcode: bc.barcode, status: 'approved' },
        { returnStatus: 'accepted_by_store' }
      );

      // Update transaction status & counts for the exchanged barcode
      const transaction = await Transaction.findOne({ transactionId: bc.transactionId, companyId: req.tenant.companyId });
      if (transaction) {
        transaction.materials = transaction.materials.map(m => {
          if (m.barcodes) {
            m.barcodes = m.barcodes.map(b => {
              const bStr = typeof b === 'string' ? b : (b.barcode || b._id?.toString());
              if (bStr === bc.barcode) {
                b.status = 'Returned';
              }
              return b;
            });
          }
          return m;
        });
        transaction.returnedItems = (transaction.returnedItems || 0) + 1;

        // Check if any active barcodes remain in this transaction
        const remainingActiveCount = await Barcode.countDocuments({
          transactionId: transaction.transactionId,
          status: { $in: ['Active', 'issued', 'Exchanged'] },
          companyId: req.tenant.companyId,
        });

        if (remainingActiveCount === 0) {
          transaction.status = 'closed';
          transaction.activeItems = 0;
          transaction.closedAt = new Date();
          transaction.closedBy = req.user._id;
          transaction.chatLocked = true;
          transaction.timeline.push({
            action: 'Transaction Closed',
            description: 'All items returned, merged, or closed',
            user: req.user._id,
          });
        } else {
          transaction.status = (transaction.returnedItems || 0) > 0 ? 'partially_returned' : 'active';
          transaction.chatLocked = false;
          transaction.closedAt = undefined;
          transaction.closedBy = undefined;
        }
        await transaction.save();
      }
    } else {
      bc.status = 'Returned';
      bc.owner = req.user._id; // Store user
      bc.history.push({
        action: 'Returned to Store',
        user: req.user._id,
        remarks: 'Store received and confirmed return',
      });
      bc.ownershipHistory.push({
        user: req.user._id,
        action: 'returned',
        remarks: 'Returned to store',
      });
      await bc.save();

      // Update transaction counts
      const transaction = await Transaction.findOne({ transactionId: bc.transactionId, companyId: req.tenant.companyId });
      if (transaction) {
        // Update barcode status inside transaction materials loop
        transaction.materials = transaction.materials.map(m => {
          if (m.barcodes) {
            m.barcodes = m.barcodes.map(b => {
              const bStr = typeof b === 'string' ? b : (b.barcode || b._id?.toString());
              if (bStr === bc.barcode) {
                b.status = 'Returned';
              }
              return b;
            });
          }
          return m;
        });
        transaction.returnedItems = (transaction.returnedItems || 0) + 1;
        transaction.activeItems = Math.max(0, (transaction.activeItems || 0) - 1);

        // Check if any active barcodes remain in this transaction
        const remainingActiveCount = await Barcode.countDocuments({
          transactionId: transaction.transactionId,
          status: { $in: ['Active', 'issued', 'Exchanged'] },
          companyId: req.tenant.companyId,
        });

        if (remainingActiveCount === 0) {
          transaction.status = 'closed';
          transaction.activeItems = 0;
          transaction.closedAt = new Date();
          transaction.closedBy = req.user._id;
          transaction.chatLocked = true;
          transaction.timeline.push({
            action: 'Transaction Closed',
            description: 'All items returned, merged, or closed',
            user: req.user._id,
          });
        } else {
          transaction.status = (transaction.returnedItems || 0) > 0 ? 'partially_returned' : 'active';
          transaction.chatLocked = false;
          transaction.closedAt = undefined;
          transaction.closedBy = undefined;
        }

        await transaction.save();
      }
    }

    await createNotification(req.tenant.companyId, 
      returnDoc.fromUser,
      'return_accepted',
      'Return Accepted',
      `Return of ${returnDoc.barcode} has been accepted by store`,
      returnDoc.transactionId,
      returnDoc.barcode
    );

    console.log('✅ [STORE ACCEPTED MATERIAL RETURN REQUEST]:', {
      returnId: returnDoc._id,
      barcode: returnDoc.barcode,
      acceptedByStore: req.user ? (req.user.fullName || req.user.name || req.user._id) : req.user._id,
      barcodeStatus: bc ? bc.status : 'Returned',
      ownerUpdatedTo: bc ? bc.owner : req.user._id,
      timestamp: new Date().toISOString()
    });

    // Create Tally Gokul Shirgaon Godown Transfer voucher for the return
    try {
      const tallyController = require('./tally.controller');
      const User = require('../../../models/User');
      const bc = await Barcode.findOne({ barcode: returnDoc.barcode, companyId: req.tenant.companyId });
      const fromUserObj = await User.findOne({ _id: returnDoc.fromUser, companyId: req.tenant.companyId });

      // Find material info from the parent transaction
      const parentTxn = await Transaction.findOne({ transactionId: returnDoc.transactionId || bc?.transactionId, companyId: req.tenant.companyId });
      let matchedMat = null;
      if (parentTxn) {
        matchedMat = parentTxn.materials.find(m =>
          m.barcodes && m.barcodes.some(b => {
            const bStr = typeof b === 'string' ? b : (b.barcode || '');
            return bStr === returnDoc.barcode;
          })
        );
      }

      const materialForTally = [{
        name: matchedMat ? matchedMat.name : (bc ? bc.materialName : 'Unknown Material'),
        quantity: 1,
        unit: matchedMat ? matchedMat.unit : 'pcs',
        price: matchedMat ? matchedMat.price : 0,
        barcodes: [returnDoc.barcode]
      }];

      const sourceGodown = fromUserObj?.fullName || fromUserObj?.name || 'Main Location';
      const destGodown = 'GOKUL SHIRGAON';

      const voucherNum = await tallyController.createTallyGodownTransfer(
        returnDoc._id.toString(),
        'return',
        sourceGodown,
        destGodown,
        materialForTally,
        returnDoc.createdAt || new Date()
      );
      if (voucherNum) {
        console.log(`Tally return voucher created: ${voucherNum} for barcode ${returnDoc.barcode}`);
      }
    } catch (tallyErr) {
      console.error('Failed to create Tally godown transfer voucher for return:', tallyErr.message);
    }

    res.json({ message: 'Return accepted.', return: returnDoc });
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
};

/**
 * Store accepts multiple returns in bulk (creating one Tally voucher per source godown)
 */
exports.bulkAcceptReturns = async (req, res) => {
  try {
    const { returnIds } = req.body;
    if (!returnIds || !Array.isArray(returnIds) || returnIds.length === 0) {
      return res.status(400).json({ message: 'Invalid or empty returnIds.' });
    }

    const Return = require('../models/Return');
    const Barcode = require('../models/Barcode');
    const Transaction = require('../models/Transaction');
    const User = require('../../../models/User');
    const tallyController = require('./tally.controller');

    const acceptedReturns = [];
    const tallyGroups = {};

    for (const returnId of returnIds) {
      const returnDoc = await Return.findOne({ _id: returnId, companyId: req.tenant.companyId });
      if (!returnDoc) continue;

      returnDoc.status = 'completed';
      returnDoc.store = req.user._id;
      returnDoc.receivedAt = new Date();
      await returnDoc.save();

      // Update barcode
      const bc = await Barcode.findOne({ barcode: returnDoc.barcode, companyId: req.tenant.companyId });
      if (!bc) continue;

      if (bc.status === 'Exchanged') {
        bc.status = 'Returned';
        bc.owner = req.user._id; // Store user
        bc.history.push({
          action: 'Returned to Store (Exchange Completed)',
          user: req.user._id,
          remarks: 'Store received and confirmed warranty return of old barcode',
          timestamp: new Date()
        });
        bc.ownershipHistory.push({
          user: req.user._id,
          action: 'returned',
          remarks: 'Returned to store (exchanged barcode)',
        });
        await bc.save();

        const ExchangeRequest = require('../models/ExchangeRequest');
        await ExchangeRequest.findOneAndUpdate({ companyId: req.tenant.companyId, oldBarcode: bc.barcode, status: 'approved' },
          { returnStatus: 'accepted_by_store' }
        );

        // Update transaction status & counts for the exchanged barcode
        const transaction = await Transaction.findOne({ transactionId: bc.transactionId, companyId: req.tenant.companyId });
        if (transaction) {
          transaction.materials = transaction.materials.map(m => {
            if (m.barcodes) {
              m.barcodes = m.barcodes.map(b => {
                const bStr = typeof b === 'string' ? b : (b.barcode || b._id?.toString());
                if (bStr === bc.barcode) {
                  b.status = 'Returned';
                }
                return b;
              });
            }
            return m;
          });
          transaction.returnedItems = (transaction.returnedItems || 0) + 1;

          // Check if any active barcodes remain in this transaction
          const remainingActiveCount = await Barcode.countDocuments({
            transactionId: transaction.transactionId,
            status: { $in: ['Active', 'issued', 'Exchanged'] },
            companyId: req.tenant.companyId,
          });

          if (remainingActiveCount === 0) {
            transaction.status = 'closed';
            transaction.activeItems = 0;
            transaction.closedAt = new Date();
            transaction.closedBy = req.user._id;
            transaction.chatLocked = true;
            transaction.timeline.push({
              action: 'Transaction Closed',
              description: 'All items returned, merged, or closed',
              user: req.user._id,
            });
          } else {
            transaction.status = (transaction.returnedItems || 0) > 0 ? 'partially_returned' : 'active';
            transaction.chatLocked = false;
            transaction.closedAt = undefined;
            transaction.closedBy = undefined;
          }
          await transaction.save();
        }
      } else {
        bc.status = 'Returned';
        bc.owner = req.user._id; // Store user
        bc.history.push({
          action: 'Returned to Store',
          user: req.user._id,
          remarks: 'Store received and confirmed return',
        });
        bc.ownershipHistory.push({
          user: req.user._id,
          action: 'returned',
          remarks: 'Returned to store',
        });
        await bc.save();

        // Update transaction counts
        const transaction = await Transaction.findOne({ transactionId: bc.transactionId, companyId: req.tenant.companyId });
        if (transaction) {
          // Update barcode status inside transaction materials loop
          transaction.materials = transaction.materials.map(m => {
            if (m.barcodes) {
              m.barcodes = m.barcodes.map(b => {
                const bStr = typeof b === 'string' ? b : (b.barcode || b._id?.toString());
                if (bStr === bc.barcode) {
                  b.status = 'Returned';
                }
                return b;
              });
            }
            return m;
          });
          transaction.returnedItems = (transaction.returnedItems || 0) + 1;
          transaction.activeItems = Math.max(0, (transaction.activeItems || 0) - 1);

          // Check if any active barcodes remain in this transaction
          const remainingActiveCount = await Barcode.countDocuments({
            transactionId: transaction.transactionId,
            status: { $in: ['Active', 'issued', 'Exchanged'] },
            companyId: req.tenant.companyId,
          });

          if (remainingActiveCount === 0) {
            transaction.status = 'closed';
            transaction.activeItems = 0;
            transaction.closedAt = new Date();
            transaction.closedBy = req.user._id;
            transaction.chatLocked = true;
            transaction.timeline.push({
              action: 'Transaction Closed',
              description: 'All items returned, merged, or closed',
              user: req.user._id,
            });
          } else {
            transaction.status = (transaction.returnedItems || 0) > 0 ? 'partially_returned' : 'active';
            transaction.chatLocked = false;
            transaction.closedAt = undefined;
            transaction.closedBy = undefined;
          }

          await transaction.save();
        }
      }

      await createNotification(req.tenant.companyId, 
        returnDoc.fromUser,
        'return_accepted',
        'Return Accepted',
        `Return of ${returnDoc.barcode} has been accepted by store`,
        returnDoc.transactionId,
        returnDoc.barcode
      );

      // Group returns by source godown for Tally
      const fromUserObj = await User.findOne({ _id: returnDoc.fromUser, companyId: req.tenant.companyId });
      const sourceGodown = fromUserObj?.fullName || fromUserObj?.name || 'Main Location';

      if (!tallyGroups[sourceGodown]) {
        tallyGroups[sourceGodown] = {
          sourceGodown,
          firstReturnId: returnDoc._id.toString(),
          materials: {}
        };
      }

      // Find material info from the parent transaction
      const parentTxn = await Transaction.findOne({ transactionId: returnDoc.transactionId || bc.transactionId, companyId: req.tenant.companyId });
      let matchedMat = null;
      if (parentTxn) {
        matchedMat = parentTxn.materials.find(m =>
          m.barcodes && m.barcodes.some(b => {
            const bStr = typeof b === 'string' ? b : (b.barcode || '');
            return bStr === returnDoc.barcode;
          })
        );
      }

      const matName = matchedMat ? matchedMat.name : bc.materialName;
      const unit = matchedMat ? matchedMat.unit : 'pcs';
      const price = matchedMat ? matchedMat.price : 0;

      if (!tallyGroups[sourceGodown].materials[matName]) {
        tallyGroups[sourceGodown].materials[matName] = {
          name: matName,
          quantity: 0,
          unit,
          price,
          barcodes: []
        };
      }
      tallyGroups[sourceGodown].materials[matName].quantity += 1;
      tallyGroups[sourceGodown].materials[matName].barcodes.push(returnDoc.barcode);

      acceptedReturns.push(returnDoc);
    }

    // Now post to Tally (one voucher per source godown)
    for (const group of Object.values(tallyGroups)) {
      try {
        const destGodown = 'GOKUL SHIRGAON';
        const materialForTally = Object.values(group.materials);

        const voucherNum = await tallyController.createTallyGodownTransfer(
          group.firstReturnId,
          'return',
          group.sourceGodown,
          destGodown,
          materialForTally,
          new Date()
        );
        if (voucherNum) {
          console.log(`Tally bulk return voucher created: ${voucherNum} for godown ${group.sourceGodown}`);
        }
      } catch (tallyErr) {
        console.error(`Failed to create Tally bulk godown transfer voucher for godown ${group.sourceGodown}:`, tallyErr.message);
      }
    }

    res.json({ message: 'Returns accepted.', returns: acceptedReturns });
  } catch (error) {
    console.error('Bulk accept returns error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

/**
 * Handler actions for return requests (Collect / Deliver / Accept Transfer / Reject Transfer)
 */
exports.handleReturnHandlerAction = async (req, res) => {
  try {
    const { returnId } = req.params;
    const { actionType, remarks } = req.body;

    const returnDoc = await Return.findOne({ _id: returnId, companyId: req.tenant.companyId });
    if (!returnDoc) return res.status(404).json({ message: 'Return request not found.' });

    const toHandlerId = returnDoc.pendingHandlerTransfer?.toHandler?._id || returnDoc.pendingHandlerTransfer?.toHandler;
    const fromHandlerId = returnDoc.pendingHandlerTransfer?.fromHandler?._id || returnDoc.pendingHandlerTransfer?.fromHandler;
    const isAssignedHandler = returnDoc.returnHandler && returnDoc.returnHandler.toString() === req.user._id.toString();
    const isPendingToHandler = returnDoc.pendingHandlerTransfer?.status === 'pending' &&
      toHandlerId && toHandlerId.toString() === req.user._id.toString();
    const isStore = req.user.role === 'super_admin' || (req.user.role === 'department_admin' && req.user.departmentAdminType === 'store');
    const isEligibleRole = ['super_admin', 'team_lead', 'employee'].includes(req.user.role);

    if (!isEligibleRole && !isAssignedHandler && !isPendingToHandler && !isStore) {
      return res.status(403).json({ message: 'You are not authorized to perform handler actions for this return.' });
    }

    const User = require('../../../models/User');
    const currentUser = await User.findById(req.user._id);
    const currentUserName = currentUser ? currentUser.fullName : 'Handler';

    if (actionType === 'accept_transfer') {
      if (!returnDoc.pendingHandlerTransfer || returnDoc.pendingHandlerTransfer.status !== 'pending') {
        return res.status(400).json({ message: 'No pending return handler transfer request found.' });
      }
      if (!toHandlerId || toHandlerId.toString() !== req.user._id.toString()) {
        return res.status(403).json({ message: 'You are not the target of this handler transfer request.' });
      }

      returnDoc.returnHandler = req.user._id;
      returnDoc.status = 'handler_assigned';
      returnDoc.pendingHandlerTransfer.status = 'accepted';
      returnDoc.pendingHandlerTransfer.resolvedAt = new Date();

      const bc = await Barcode.findOne({ barcode: returnDoc.barcode, companyId: req.tenant.companyId });
      if (bc) {
        bc.history.push({
          action: 'Return Handler Transfer Accepted',
          user: req.user._id,
          remarks: remarks || `Return handler transfer accepted by ${currentUserName}`,
        });
        await bc.save();
      }

      if (returnDoc.transactionId) {
        const parentTxn = await Transaction.findOne({ transactionId: returnDoc.transactionId, companyId: req.tenant.companyId });
        if (parentTxn) {
          parentTxn.handler = req.user._id;
          if (!parentTxn.chatMembers.includes(req.user._id)) {
            parentTxn.chatMembers.push(req.user._id);
          }
          parentTxn.timeline.push({
            action: 'Handler Transfer Accepted',
            remarks: `Return handler transfer accepted by ${currentUserName}`,
            user: req.user._id,
          });
          await parentTxn.save();
        }
      }
    } else if (actionType === 'reject_transfer') {
      if (!returnDoc.pendingHandlerTransfer || returnDoc.pendingHandlerTransfer.status !== 'pending') {
        return res.status(400).json({ message: 'No pending return handler transfer request found.' });
      }
      if (!toHandlerId || toHandlerId.toString() !== req.user._id.toString()) {
        return res.status(403).json({ message: 'You are not the target of this handler transfer request.' });
      }

      returnDoc.pendingHandlerTransfer.status = 'rejected';
      returnDoc.pendingHandlerTransfer.rejectReason = remarks || 'No reason provided';
      returnDoc.pendingHandlerTransfer.resolvedAt = new Date();
      // returnHandler remains unchanged (fromHandler)

      const bc = await Barcode.findOne({ barcode: returnDoc.barcode, companyId: req.tenant.companyId });
      if (bc) {
        bc.history.push({
          action: 'Return Handler Transfer Rejected',
          user: req.user._id,
          remarks: remarks || `Return handler transfer rejected by ${currentUserName}`,
        });
        await bc.save();
      }
    } else if (actionType === 'collect') {
      returnDoc.status = 'collected';
      returnDoc.collectedAt = new Date();
      returnDoc.returnHandler = req.user._id;

      const bc = await Barcode.findOne({ barcode: returnDoc.barcode, companyId: req.tenant.companyId });
      if (bc) {
        bc.history.push({
          action: 'Return Collected by Handler',
          user: req.user._id,
          remarks: remarks || 'Handler collected returning items',
        });
        await bc.save();
      }
    } else if (actionType === 'deliver') {
      returnDoc.status = 'store_received';
      returnDoc.receivedAt = new Date();

      const bc = await Barcode.findOne({ barcode: returnDoc.barcode, companyId: req.tenant.companyId });
      if (bc) {
        bc.history.push({
          action: 'Return Handed Over to Store',
          user: req.user._id,
          remarks: remarks || 'Handler delivered returning items to store',
        });
        await bc.save();
      }
    } else if (actionType === 'reject' || actionType === 'decline') {
      const isReverted = !!returnDoc.previousHandler;
      let prevHandlerId = returnDoc.previousHandler;

      if (isReverted) {
        returnDoc.status = 'collected';
        returnDoc.returnHandler = prevHandlerId;
        returnDoc.previousHandler = null;
      } else {
        returnDoc.status = 'rejected';
        returnDoc.returnHandler = null;
      }

      const bc = await Barcode.findOne({ barcode: returnDoc.barcode, companyId: req.tenant.companyId });
      if (bc) {
        bc.history.push({
          action: isReverted ? 'Return Reassignment Declined by Handler' : 'Return Assignment Declined by Handler',
          user: req.user._id,
          remarks: remarks || (isReverted ? 'Handler declined return request reassignment' : 'Handler declined return request assignment'),
        });
        await bc.save();
      }

      if (returnDoc.transactionId) {
        const parentTxn = await Transaction.findOne({ transactionId: returnDoc.transactionId, companyId: req.tenant.companyId });
        if (parentTxn) {
          parentTxn.handler = isReverted ? prevHandlerId : null;
          await parentTxn.save();
        }
      }
    } else {
      return res.status(400).json({ message: 'Invalid handler action type.' });
    }

    await returnDoc.save();

    await AuditLog.create({
      companyId: req.tenant.companyId,
      action: 'RETURN_HANDLER_ACTION',
      entity: 'Return',
      entityId: returnDoc.barcode,
      user: req.user._id,
      userName: req.user.fullName,
      description: `Handler performed ${actionType} on return of ${returnDoc.barcode}`,
    });

    res.json({ message: `Return action ${actionType} completed successfully.`, return: returnDoc });
  } catch (error) {
    console.error('Handle return handler action error:', error);
    try {
      const fs = require('fs');
      fs.writeFileSync('error.log', 'Handle return handler action error:\n' + (error.stack || error.message || String(error)));
    } catch (e) { }
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

/**
 * Create split request
 */
exports.createSplitRequest = async (req, res) => {
  try {
    const SplitRequest = require('../models/SplitRequest');
    const { barcode, reason, requestedMaterialName } = req.body;

    if (!barcode || !reason) {
      return res.status(400).json({ message: 'Barcode and reason are required.' });
    }

    const normalizedBarcode = barcode ? barcode.trim().toUpperCase() : '';
    const bc = await Barcode.findOne({ barcode: normalizedBarcode, companyId: req.tenant.companyId });
    if (!bc) return res.status(404).json({ message: 'Barcode not found.' });
    if (bc.status !== 'Active' && bc.status !== 'Exchanged') return res.status(400).json({ message: 'Barcode is not active.' });

    const pendingError = await checkBarcodePendingActions(normalizedBarcode, req.tenant.companyId);
    if (pendingError) {
      return res.status(400).json({ message: pendingError });
    }

    // Validate that the parent transaction is fully delivered and received by the requester
    if (bc.transactionId) {
      const txn = await Transaction.findOne({ transactionId: bc.transactionId, companyId: req.tenant.companyId });
      if (txn && !['received', 'active', 'partially_returned', 'closed'].includes(txn.status)) {
        return res.status(400).json({ message: 'Cannot split barcode before the material is fully delivered and received.' });
      }
    }



    // Check ownership
    if (bc.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'You do not own this barcode.' });
    }

    const splitReq = await SplitRequest.create({ companyId: req.tenant.companyId,
      transactionId: bc.transactionId,
      barcode,
      materialName: bc.materialName,
      requestedMaterialName,
      requester: req.user._id,
      reason,
      status: 'pending',
    });

    bc.history.push({
      action: 'Split Requested',
      user: req.user._id,
      remarks: reason,
    });
    await bc.save();

    res.json({ message: 'Split request submitted to store.', data: splitReq });
  } catch (error) {
    console.error('Create split request error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

/**
 * Get pending split requests (for store)
 */
exports.getPendingSplitRequests = async (req, res) => {
  try {
    // Only Store users or super admins can view pending split requests
    const isStore = isUserStoreApprover(req.user);
    if (!isStore) {
      return res.status(403).json({ message: 'Only Store users can view pending split requests.' });
    }

    const SplitRequest = require('../models/SplitRequest');
    const requests = await SplitRequest.find({ status: 'pending', companyId: req.tenant.companyId })
      .populate('requester', 'fullName employeeId');

    res.json({ data: requests, requests });
  } catch (error) {
    console.error('Get split requests error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

/**
 * Approve split request (for store)
 */
exports.approveSplitRequest = async (req, res) => {
  try {
    const { requestId, newBarcode, materialName, quantity, unit, price, rate, godown, action, reason, storeRemark } = req.body;

    const isStore = isUserStoreApprover(req.user);
    if (!isStore) {
      return res.status(403).json({ message: 'Only Store users can approve split requests.' });
    }

    const companyFilter = req.tenant?.companyId ? { $or: [{ companyId: req.tenant.companyId }, { companyId: null }] } : {};
    const SplitRequest = require('../models/SplitRequest');
    let splitReq = await SplitRequest.findOne({ _id: requestId, ...companyFilter });
    if (!splitReq) splitReq = await SplitRequest.findById(requestId);
    if (!splitReq) return res.status(404).json({ message: 'Split request not found.' });
    if (splitReq.status !== 'pending') return res.status(400).json({ message: 'Request is already processed.' });

    if (action === 'reject') {
      splitReq.status = 'rejected';
      splitReq.storeRemark = storeRemark || reason || 'Rejected by store';
      await splitReq.save();

      // Update parent barcode history
      let parentBc = await Barcode.findOne({ barcode: splitReq.barcode, ...companyFilter });
      if (!parentBc) parentBc = await Barcode.findOne({ barcode: splitReq.barcode });
      if (parentBc) {
        parentBc.history.push({
          action: 'Split Rejected',
          user: req.user._id,
          remarks: storeRemark || reason || 'Rejected by store',
        });
        await parentBc.save();
      }

      await createNotification(req.tenant.companyId, 
        splitReq.requester,
        'split_rejected',
        'Split Request Rejected',
        `Store rejected your split request for barcode ${splitReq.barcode}: ${storeRemark || reason || ''}`,
        splitReq.transactionId,
        splitReq.barcode
      );

      return res.json({ success: true, message: 'Split request rejected by store.', data: splitReq });
    }

    // Get parent barcode details
    let parentBc = await Barcode.findOne({ barcode: splitReq.barcode, ...companyFilter }).populate('owner');
    if (!parentBc) parentBc = await Barcode.findOne({ barcode: splitReq.barcode }).populate('owner');
    if (!parentBc) return res.status(404).json({ message: 'Parent barcode not found.' });

    // Get requester details
    const User = require('../../../models/User');
    let requesterUser = await User.findOne({ _id: splitReq.requester, ...companyFilter });
    if (!requesterUser) requesterUser = await User.findById(splitReq.requester);
    if (!requesterUser) return res.status(404).json({ message: 'Requester not found.' });

    const remarkText = storeRemark ? `Store Remark: ${storeRemark}` : (reason || '');

    // Check if newBarcode already exists
    const normalizedNewBarcode = newBarcode ? newBarcode.trim().toUpperCase() : '';
    let existingBc = await Barcode.findOne({ barcode: normalizedNewBarcode });
    let newBcDoc = null;

    if (existingBc) {
      if (['Cancelled', 'Returned'].includes(existingBc.status)) {
        // Reuse and update the existing barcode document to prevent duplicate key error
        existingBc.transactionId = parentBc.transactionId;
        existingBc.transaction = parentBc.transaction;
        existingBc.materialName = materialName || parentBc.materialName;
        existingBc.status = 'Active';
        existingBc.owner = splitReq.requester;
        existingBc.ownerDepartment = requesterUser.department;
        existingBc.parentBarcode = parentBc.barcode;
        existingBc.isSplit = true;
        existingBc.ownershipHistory.push({
          user: splitReq.requester,
          department: requesterUser.department,
          action: 'split_created',
          remarks: `Split approved by store. New material active.${storeRemark ? ` Store Remark: ${storeRemark}` : ''}`,
        });
        existingBc.history.push({
          action: 'Split Child Created',
          user: req.user._id,
          remarks: remarkText || `Created from split approval of parent ${parentBc.barcode}`,
        });
        await existingBc.save();
        newBcDoc = existingBc;
      } else {
        return res.status(400).json({
          message: `Barcode "${newBarcode}" is already in use by an active item. Please enter a different, unique serial number.`,
        });
      }
    }

    // Mark request as approved
    splitReq.status = 'approved';
    splitReq.approvedBy = req.user._id;
    splitReq.approvedAt = new Date();
    splitReq.newBarcode = newBarcode;
    splitReq.newQuantity = quantity || 1;
    splitReq.storeRemark = storeRemark || '';
    await splitReq.save();

    // Create the NEW Barcode document if not reused
    if (!newBcDoc) {
      newBcDoc = await Barcode.create({
        barcode: newBarcode,
        transactionId: parentBc.transactionId,
        transaction: parentBc.transaction,
        materialName: materialName || parentBc.materialName,
        status: 'Active', // Instantly active, no acceptance step
        owner: splitReq.requester,
        ownerDepartment: requesterUser.department,
        parentBarcode: parentBc.barcode,
        isSplit: true,
        ownershipHistory: [{
          user: splitReq.requester,
          department: requesterUser.department,
          action: 'split_created',
          remarks: `Split approved by store. New material active.${storeRemark ? ` Store Remark: ${storeRemark}` : ''}`,
        }],
        history: [{
          action: 'Split Child Created',
          user: req.user._id,
          remarks: remarkText || `Created from split approval of parent ${parentBc.barcode}`,
        }],
      });
    }

    // Mark parent barcode as split or add to history
    parentBc.history.push({
      action: 'Split Approved',
      user: req.user._id,
      remarks: storeRemark ? `Split approved by store. Store Remark: ${storeRemark}` : (reason || `Split approved. New child barcode ${newBarcode} created.`),
    });
    await parentBc.save();

    // Update parent Transaction document to include this new barcode!
    const Transaction = require('../models/Transaction');
    let transaction = await Transaction.findOne({ transactionId: parentBc.transactionId, ...companyFilter });
    if (!transaction && parentBc.transaction) transaction = await Transaction.findById(parentBc.transaction);
    if (!transaction) transaction = await Transaction.findOne({ transactionId: parentBc.transactionId });

    if (transaction) {
      // Find the parent material entry to copy properties
      const parentMaterial = transaction.materials.find(
        m => m.name.toLowerCase() === parentBc.materialName.toLowerCase()
      );

      // Always create a NEW material entry for the split barcode child
      transaction.materials.push({
        name: materialName || splitReq.requestedMaterialName || parentBc.materialName,
        description: `Split child of ${parentBc.barcode}`,
        quantity: 1,
        unit: parentMaterial?.unit || 'pcs',
        price: 0,
        barcodes: [{
          barcode: newBarcode,
          status: 'Active',
          owner: splitReq.requester,
        }]
      });

      transaction.totalItems = (transaction.totalItems || 0) + 1;
      transaction.activeItems = (transaction.activeItems || 0) + 1;

      transaction.timeline.push({
        action: 'Split Approved',
        description: storeRemark ? `Store approved split. Store Remark: ${storeRemark}` : (reason || `Store approved split. New barcode ${newBarcode} registered and active.`),
        user: req.user._id,
      });
      await transaction.save();

      // Post Tally Autofill Stock Journal for split barcode safely
      try {
        const tallyController = require('./tally.controller');
        const isStoreGodown = (gName) => {
          const clean = (gName || '').trim().toLowerCase();
          return !clean || clean.includes('gokul') || clean.includes('shirgaon') || clean.includes('main') || clean.includes('primary') || clean.includes('store');
        };

        const employeeGodown = requesterUser.fullName || 'Main Location';
        const requesterGodown = employeeGodown;
        const materialInfo = {
          materialName: materialName || parentBc.materialName,
          unit: unit || parentMaterial?.unit || 'pcs',
          price: (price !== undefined && price !== null ? Number(price) : (rate !== undefined && rate !== null ? Number(rate) : (parentMaterial?.price || 0)))
        };

        let parentUnit = parentMaterial?.unit || 'pcs';
        let parentPrice = parentMaterial?.price || 0;
        let parentGodown = employeeGodown;
        if (parentBc.owner) {
          const ownerUser = parentBc.owner;
          if (ownerUser.role !== 'department_admin' || ownerUser.departmentAdminType !== 'store') {
            parentGodown = ownerUser.fullName || employeeGodown;
          }
        }
        let parentTallyName = parentBc.materialName;

        try {
          const tallyDetails = await tallyController.getBarcodeTallyDetails(parentBc.barcode);
          if (tallyDetails) {
            if (tallyDetails.godown && !isStoreGodown(tallyDetails.godown)) {
              parentGodown = tallyDetails.godown;
            }
            if (tallyDetails.itemName) {
              parentTallyName = tallyDetails.itemName;
            }
            if (tallyDetails.unit) {
              parentUnit = tallyDetails.unit;
            }
          }
        } catch (tallyDetailErr) {
          console.warn('Failed to fetch parent barcode details from Tally live (using DB fallback):', tallyDetailErr.message);
        }

        parentBc.materialName = parentTallyName;
        parentBc.unit = parentUnit;
        parentBc.price = parentPrice;

        const splitVoucherNum = await tallyController.createTallySplitStockJournal(
          splitReq._id.toString(),
          parentBc,
          newBcDoc,
          materialInfo,
          requesterGodown,
          parentGodown,
          splitReq.createdAt || new Date()
        );
        if (splitVoucherNum) {
          console.log(`Tally Split Stock Journal voucher created: ${splitVoucherNum} for split ${splitReq._id}`);
        }
      } catch (tallyErr) {
        console.warn('Tally Split Stock Journal warning (skipped):', tallyErr.message);
      }
    }

    // Notify all store admins about this split creation/transfer
    try {
      const storeAdmins = await User.find({ companyId: req.tenant.companyId, role: 'department_admin', departmentAdminType: 'store' });
      for (const admin of storeAdmins) {
        await createNotification(req.tenant.companyId, 
          admin._id,
          'split_approved_store',
          'Material Split Created/Transferred',
          `New split child barcode ${newBarcode} has been created and active from parent barcode ${parentBc.barcode} for transaction ${parentBc.transactionId || 'N/A'}.`,
          splitReq.transactionId,
          newBarcode
        );
      }
    } catch (err) {
      console.error('Error notifying store admins about split approval:', err);
    }

    res.json({
      success: true,
      message: 'Split approved and new material created.',
      data: newBcDoc,
      transactionId: transaction?.transactionId || parentBc.transactionId,
    });
  } catch (error) {
    console.error('Approve split request error:', error);
    if (error.code === 11000) {
      return res.status(400).json({
        message: `Barcode "${req.body.newBarcode}" already exists in the system. Please enter a different, unique serial number.`,
      });
    }
    res.status(500).json({ message: error.message || 'Server error.' });
  }
};

/**
 * Accept split material (by employee)
 */
exports.acceptSplitMaterial = async (req, res) => {
  try {
    const { barcode, gps, photos } = req.body;
    const normalizedBarcode = barcode ? barcode.trim().toUpperCase() : '';

    const bc = await Barcode.findOne({ barcode: normalizedBarcode, companyId: req.tenant.companyId });
    if (!bc) return res.status(404).json({ message: 'Barcode not found.' });
    if (bc.status !== 'pending_acceptance') {
      return res.status(400).json({ message: 'Barcode is not pending acceptance.' });
    }

    // Verify ownership
    if (bc.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'You are not authorized to accept this barcode.' });
    }

    // Update Barcode document status to Active
    bc.status = 'Active';
    bc.history.push({
      action: 'Split Material Accepted',
      user: req.user._id,
      remarks: 'Split material accepted by requester',
      gps,
      photos: photos || [],
    });
    await bc.save();

    // Update status in the parent Transaction document's nested barcodes array!
    const Transaction = require('../models/Transaction');
    await Transaction.updateOne(
      { transactionId: bc.transactionId, 'materials.barcodes.barcode': barcode },
      { $set: { 'materials.$[].barcodes.$[bc].status': 'Active' } },
      { arrayFilters: [{ 'bc.barcode': barcode }] }
    );

    res.json({ message: 'Barcode accepted successfully.', barcode: bc });
  } catch (error) {
    console.error('Accept split material error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

/**
 * List all barcodes (with filtering)
 */
exports.listBarcodes = async (req, res) => {
  try {
    const { page = 1, limit = 50, status } = req.query;
    const companyFilter = req.tenant?.companyId
      ? { $or: [{ companyId: req.tenant.companyId }, { company: req.tenant.companyId }, { companyId: null }] }
      : {};
    const filter = { ...companyFilter };

    if (status) filter.status = status;

    const uRole = String(req.user.role || '').toLowerCase();
    const uAdminType = String(req.user.departmentAdminType || req.user.adminType || '').toLowerCase();
    const isCentral = ['super_admin', 'superadmin', 'admin', 'company_admin'].includes(uRole) ||
      req.user.scope === 'GLOBAL' ||
      (uRole === 'department_admin' && ['store', 'management', 'accounts', ''].includes(uAdminType)) ||
      ['store', 'store_admin', 'management', 'accounts'].includes(uRole);

    if (!isCentral && uRole === 'employee') {
      filter.$or = [
        { owner: req.user._id },
        { 'ownershipHistory.user': req.user._id },
        { 'history.user': req.user._id }
      ];
    }

    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.max(1, parseInt(limit) || 50);

    const [barcodes, total] = await Promise.all([
      Barcode.find(filter)
        .populate('owner', 'fullName employeeId name')
        .populate('ownerDepartment', 'name')
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum),
      Barcode.countDocuments(filter),
    ]);

    res.json({ data: barcodes, barcodes, total, page: pageNum });
  } catch (error) {
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
};

/**
 * Get barcodes currently owned by the Store Admin for a specific material name
 */
exports.getStoreAvailableBarcodes = async (req, res) => {
  try {
    const { materialName } = req.query;
    if (!materialName) {
      return res.status(400).json({ message: 'materialName query parameter is required.' });
    }

    const axios = require('axios');
    const xml2js = require('xml2js');
    const liveTallyUrl = process.env.TALLY_LIVE_URL || 'http://localhost:9000';

    // 1. Get active company name from Tally
    const COMPANY_QUERY_XML = `
    <ENVELOPE>
      <HEADER>
        <VERSION>1</VERSION>
        <TALLYREQUEST>Export</TALLYREQUEST>
        <TYPE>Collection</TYPE>
        <ID>ActiveCompanies</ID>
      </HEADER>
      <BODY>
        <DESC>
          <STATICVARIABLES>
            <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
          </STATICVARIABLES>
          <TDL>
            <TDLMESSAGE>
              <COLLECTION NAME="ActiveCompanies" ISINITIALIZE="Yes">
                <TYPE>Company</TYPE>
                <FETCH>Name</FETCH>
              </COLLECTION>
            </TDLMESSAGE>
          </TDL>
        </DESC>
      </BODY>
    </ENVELOPE>`;

    let companyName = '';
    try {
      const compResponse = await axios.post(liveTallyUrl, COMPANY_QUERY_XML, {
        headers: { 'Content-Type': 'application/xml' },
        timeout: 3000
      });
      const parser = new xml2js.Parser({ explicitArray: false });
      const parsedComp = await parser.parseStringPromise(compResponse.data);
      const activeCompanyObj = parsedComp?.ENVELOPE?.BODY?.DATA?.COLLECTION?.COMPANY;
      if (activeCompanyObj) {
        if (typeof activeCompanyObj === 'string') {
          companyName = activeCompanyObj;
        } else if (typeof activeCompanyObj === 'object') {
          if (activeCompanyObj.NAME) {
            companyName = typeof activeCompanyObj.NAME === 'object' ? activeCompanyObj.NAME._ : activeCompanyObj.NAME;
          } else if (activeCompanyObj.$ && activeCompanyObj.$.NAME) {
            companyName = activeCompanyObj.$.NAME;
          }
        }
      }
    } catch (err) {
      console.error('Failed to get active company for barcodes from Tally:', err.message);
      return res.json({ barcodes: [], message: 'Tally Prime server is unreachable.' });
    }

    if (!companyName) {
      return res.json({ barcodes: [], message: 'No active company in Tally.' });
    }

    const escapedCompanyName = companyName.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // 2. Build XML request to fetch all stock items with BatchAllocations
    // Query stock items
    const STOCK_QUERY_XML = `
    <ENVELOPE>
      <HEADER>
        <VERSION>1</VERSION>
        <TALLYREQUEST>Export</TALLYREQUEST>
        <TYPE>Collection</TYPE>
        <ID>LiveStockItems</ID>
      </HEADER>
      <BODY>
        <DESC>
          <STATICVARIABLES>
            <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
            <SVCURRENTCOMPANY>${escapedCompanyName}</SVCURRENTCOMPANY>
          </STATICVARIABLES>
          <TDL>
            <TDLMESSAGE>
              <COLLECTION NAME="LiveStockItems" ISINITIALIZE="Yes">
                <TYPE>StockItem</TYPE>
                <FETCH>Name, BaseUnits, ClosingBalance, OpeningBalance, OpeningRate, ClosingRate, BatchAllocations</FETCH>
              </COLLECTION>
            </TDLMESSAGE>
          </TDL>
        </DESC>
      </BODY>
    </ENVELOPE>`;

    const now = new Date();
    const currentYear = now.getFullYear();
    const fyStartYear = now.getMonth() >= 3 ? currentYear : currentYear - 1;
    const svFromDate = `${fyStartYear}0401`;
    const svToDate = `${fyStartYear + 1}0331`;

    // Query vouchers
    const VOUCHER_QUERY_XML = `
    <ENVELOPE>
      <HEADER>
        <VERSION>1</VERSION>
        <TALLYREQUEST>Export</TALLYREQUEST>
        <TYPE>Collection</TYPE>
        <ID>DayBookVouchers</ID>
      </HEADER>
      <BODY>
        <DESC>
          <STATICVARIABLES>
            <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
            <SVCURRENTCOMPANY>${escapedCompanyName}</SVCURRENTCOMPANY>
            <SVFROMDATE>${svFromDate}</SVFROMDATE>
            <SVTODATE>${svToDate}</SVTODATE>
          </STATICVARIABLES>
          <TDL>
            <TDLMESSAGE>
              <COLLECTION NAME="DayBookVouchers" ISINITIALIZE="Yes">
                <TYPE>Voucher</TYPE>
                <FETCH>Date, VoucherTypeName, VoucherNumber, InventoryEntries, InventoryEntriesIn, InventoryEntriesOut, AllInventoryEntries</FETCH>
              </COLLECTION>
            </TDLMESSAGE>
          </TDL>
        </DESC>
      </BODY>
    </ENVELOPE>`;

    // Perform Tally queries in parallel
    const [stockRes, voucherRes] = await Promise.all([
      axios.post(liveTallyUrl, STOCK_QUERY_XML, {
        headers: { 'Content-Type': 'application/xml' },
        timeout: 5000
      }).catch(err => {
        console.error('Tally StockItem query failed:', err.message);
        return { data: '' };
      }),
      axios.post(liveTallyUrl, VOUCHER_QUERY_XML, {
        headers: { 'Content-Type': 'application/xml' },
        timeout: 5000
      }).catch(err => {
        console.error('Tally Voucher query failed:', err.message);
        return { data: '' };
      })
    ]);

    const parser2 = new xml2js.Parser({ explicitArray: false, ignoreAttrs: false });

    // Parse Stock Items
    let stockItems = [];
    if (stockRes.data) {
      try {
        const rawXml = typeof stockRes.data === 'string' ? stockRes.data : String(stockRes.data);
        const sanitizedXml = rawXml.replace(/&(?!(amp|lt|gt|quot|apos);)/g, '&amp;');
        const parsedStock = await parser2.parseStringPromise(sanitizedXml);
        const rawItems = parsedStock?.ENVELOPE?.BODY?.DATA?.COLLECTION?.STOCKITEM || [];
        stockItems = Array.isArray(rawItems) ? rawItems : [rawItems];
      } catch (err) {
        console.error('Failed to parse stock items XML:', err.message);
      }
    }

    // Parse Vouchers
    let vouchers = [];
    if (voucherRes.data) {
      try {
        const rawVchXml = typeof voucherRes.data === 'string' ? voucherRes.data : String(voucherRes.data);
        const sanitizedVchXml = rawVchXml.replace(/&(?!(amp|lt|gt|quot|apos);)/g, '&amp;');
        const parsedVouchers = await parser2.parseStringPromise(sanitizedVchXml);
        const rawVouchers = parsedVouchers?.ENVELOPE?.BODY?.DATA?.COLLECTION?.VOUCHER || [];
        vouchers = Array.isArray(rawVouchers) ? rawVouchers : [rawVouchers];
      } catch (err) {
        console.error('Failed to parse vouchers XML:', err.message);
      }
    }

    // 3. Find matched items in StockItems
    const targetName = materialName.toLowerCase().trim();
    const targetWords = targetName.split(/\s+/).filter(w => w.length > 1);

    const matchedItem = stockItems.find(item => {
      let name = '';
      if (item) {
        const nameKey = Object.keys(item).find(k => k.toLowerCase() === 'name');
        if (nameKey) {
          const val = item[nameKey];
          if (typeof val === 'string') name = val;
          else if (typeof val === 'object' && val._) name = val._;
        }
        if (!name && item.$) {
          const attrKey = Object.keys(item.$).find(k => k.toLowerCase() === 'name');
          if (attrKey) {
            name = item.$[attrKey];
          }
        }
      }
      const cleanName = name.trim().toLowerCase();
      if (cleanName === targetName || cleanName.includes(targetName) || targetName.includes(cleanName)) {
        return true;
      }
      if (targetWords.length > 0 && targetWords.every(word => cleanName.includes(word))) {
        return true;
      }
      return false;
    });

    const gatheredBarcodes = new Map(); // map: barcode -> { barcode, materialName, status: 'Active' }

    let matchedItemName = '';
    if (matchedItem) {
      const nameKey = Object.keys(matchedItem).find(k => k.toLowerCase() === 'name');
      if (nameKey) {
        const val = matchedItem[nameKey];
        if (typeof val === 'string') matchedItemName = val;
        else if (typeof val === 'object' && val._) matchedItemName = val._;
      }
      if (!matchedItemName && matchedItem.$) {
        const attrKey = Object.keys(matchedItem.$).find(k => k.toLowerCase() === 'name');
        if (attrKey) {
          matchedItemName = matchedItem.$[attrKey];
        }
      }
    }

    // Helper to process allocations
    const processAllocations = (rawAllocations, actualItemName) => {
      if (!rawAllocations || rawAllocations === '     ' || typeof rawAllocations === 'string') return;
      const allocations = Array.isArray(rawAllocations) ? rawAllocations : [rawAllocations];

      allocations.forEach(alloc => {
        let godownName = '';
        const godownKey = Object.keys(alloc).find(k => k.toLowerCase() === 'godownname');
        if (godownKey) {
          const val = alloc[godownKey];
          godownName = typeof val === 'object' ? val._ : val;
        }

        let batchName = '';
        const batchKey = Object.keys(alloc).find(k => k.toLowerCase() === 'batchname');
        if (batchKey) {
          const val = alloc[batchKey];
          batchName = typeof val === 'object' ? val._ : val;
        }

        const cleanGodown = godownName ? godownName.trim().toLowerCase() : '';
        const isStoreGodown = !cleanGodown || cleanGodown.includes('gokul') || cleanGodown.includes('shirgaon') || cleanGodown.includes('main') || cleanGodown.includes('primary') || cleanGodown.includes('store') || cleanGodown.includes('location') || true;

        if (isStoreGodown && batchName && batchName.trim() && batchName.trim().toLowerCase() !== 'primary batch') {
          const bcStr = batchName.trim();
          gatheredBarcodes.set(bcStr, {
            barcode: bcStr,
            materialName: actualItemName || matchedItemName || materialName,
            status: 'Active'
          });
        }
      });
    };

    // 1. Process batch allocations from opening StockItems
    if (matchedItem) {
      let rawAllocations = null;
      const allocationsKey = Object.keys(matchedItem).find(k => k.toLowerCase() === 'batchallocations.list');
      if (allocationsKey) {
        rawAllocations = matchedItem[allocationsKey];
      }
      processAllocations(rawAllocations, matchedItemName);
    }

    // 2. Process batch allocations from transaction Vouchers (Day Book)
    vouchers.forEach(v => {
      const entries = [];
      const addEntry = (list) => {
        if (!list) return;
        const array = Array.isArray(list) ? list : [list];
        entries.push(...array);
      };

      addEntry(v['INVENTORYENTRIES.LIST'] || v['inventoryentries.list']);
      addEntry(v['INVENTORYENTRIESIN.LIST'] || v['inventoryentriesin.list']);
      addEntry(v['INVENTORYENTRIESOUT.LIST'] || v['inventoryentriesout.list']);
      addEntry(v['ALLINVENTORYENTRIES.LIST'] || v['allinventoryentries.list']);

      entries.forEach(entry => {
        let entryMatName = '';
        const nameKey = Object.keys(entry).find(k => k.toLowerCase() === 'stockitemname');
        if (nameKey) {
          const val = entry[nameKey];
          entryMatName = typeof val === 'object' ? val._ : val;
        }

        if (entryMatName) {
          const cleanEntryName = entryMatName.trim().toLowerCase();

          // Match matching stock item names
          let nameMatches = cleanEntryName === targetName || cleanEntryName.includes(targetName) || targetName.includes(cleanEntryName);
          if (!nameMatches && targetWords.length > 0 && targetWords.every(word => cleanEntryName.includes(word))) {
            nameMatches = true;
          }

          if (nameMatches) {
            let rawAllocations = null;
            const allocationsKey = Object.keys(entry).find(k => k.toLowerCase() === 'batchallocations.list');
            if (allocationsKey) {
              rawAllocations = entry[allocationsKey];
            }
            processAllocations(rawAllocations, entryMatName);
          }
        }
      });
    });

    // 3. Merge active barcodes from MongoDB Barcode collection
    try {
      const dbBarcodes = await Barcode.find({ status: { $in: ['Active', 'Returned', 'Available', 'New'] }, companyId: req.tenant.companyId }).lean();
      dbBarcodes.forEach(b => {
        if (b.barcode && !gatheredBarcodes.has(b.barcode)) {
          gatheredBarcodes.set(b.barcode, {
            barcode: b.barcode,
            materialName: b.materialName || materialName,
            status: b.status || 'Active'
          });
        }
      });
    } catch (dbErr) {
      console.warn('MongoDB barcode merge warning:', dbErr.message);
    }

    // 4. Return all barcodes retrieved directly from Tally Prime & MongoDB
    const barcodes = Array.from(gatheredBarcodes.values());

    res.json({ barcodes });
  } catch (error) {
    console.error('getStoreAvailableBarcodes from Tally error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

/**
 * Search barcodes
 */
exports.searchBarcodes = async (req, res) => {
  try {
    const { q, status } = req.query;
    const filter = { companyId: req.tenant.companyId };
    if (q) {
      filter.$or = [
        { barcode: { $regex: q, $options: 'i' } },
        { materialName: { $regex: q, $options: 'i' } },
      ];
    }
    if (status) filter.status = status;

    // Role-based filtering (restrict others' materials)
    if (req.user.role === 'employee') {
      const empFilter = {
        $or: [
          { owner: req.user._id },
          { 'ownershipHistory.user': req.user._id },
          { 'history.user': req.user._id }
        ]
      };
      if (filter.$or) {
        filter.$and = [
          { $or: filter.$or },
          empFilter
        ];
        delete filter.$or;
      } else {
        filter.$or = empFilter.$or;
      }
    } else if (req.user.role === 'team_lead') {
      filter.ownerDepartment = req.user.department._id || req.user.department;
    } else if (req.user.role === 'department_admin') {
      if (req.user.departmentAdminType !== 'store' && req.user.departmentAdminType !== 'management' && req.user.departmentAdminType !== 'accounts') {
        filter.ownerDepartment = req.user.department._id || req.user.department;
      }
    }

    const barcodes = await Barcode.find(filter)
      .populate('owner', 'fullName employeeId')
      .sort({ createdAt: -1 })
      .limit(50);

    res.json({ barcodes });
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
};

/**
 * Get pending transfers for current user/department
 */
exports.getPendingTransfers = async (req, res) => {
  try {
    const isSuperAdmin = req.user.role === 'super_admin';
    const mongoose = require('mongoose');
    const uStr = req.user._id ? req.user._id.toString() : '';
    const userObjId = mongoose.Types.ObjectId.isValid(uStr) ? new mongoose.Types.ObjectId(uStr) : req.user._id;
    const userQuery = { $in: [uStr, userObjId] };

    // 1. Management Filter:
    // If super_admin -> see all pending cross_dept transfers
    // Otherwise -> see ONLY pending cross_dept transfers assigned to this user as managementApprover
    const mgmtPendingFilter = isSuperAdmin
      ? { type: 'cross_department', status: 'pending' }
      : { type: 'cross_department', status: 'pending', managementApprover: userQuery };

    // 2. Recipient Filter:
    // Recipient sees transfers waiting for recipient acceptance (status: 'approved', or pending internal):
    const recipientFilter = {
      toUser: userQuery,
      $or: [
        { status: 'approved' },
        { status: 'pending' }
      ]
    };

    const query = {
      companyId: req.tenant.companyId,
      $or: [
        mgmtPendingFilter,
        recipientFilter
      ]
    };

    const transfersRaw = await Transfer.find(query)
      .populate('fromUser', 'fullName employeeId')
      .populate('toUser', 'fullName employeeId')
      .populate('managementApprover', 'fullName employeeId');

    const Department = require('../../../models/Department');
    const allDepts = await Department.find({ companyId: req.tenant.companyId }).lean();
    const deptMap = new Map(allDepts.map(d => [d._id.toString(), d.name]));

    const transfers = transfersRaw.map(t => {
      const tObj = t.toObject();
      if (tObj.fromDepartment) {
        const fStr = typeof tObj.fromDepartment === 'object' ? (tObj.fromDepartment.name || tObj.fromDepartment._id) : String(tObj.fromDepartment);
        tObj.fromDepartment = { name: deptMap.get(String(fStr)) || String(fStr) };
      }
      if (tObj.toDepartment) {
        const tStr = typeof tObj.toDepartment === 'object' ? (tObj.toDepartment.name || tObj.toDepartment._id) : String(tObj.toDepartment);
        tObj.toDepartment = { name: deptMap.get(String(tStr)) || String(tStr) };
      }
      return tObj;
    });

    res.json({ data: transfers, transfers });
  } catch (error) {
    console.error('Pending transfers error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

/**
 * Get pending returns (for store)
 */
exports.getPendingReturns = async (req, res) => {
  try {
    const isStore = req.user.role === 'super_admin' || (req.user.role === 'department_admin' && req.user.departmentAdminType === 'store');

    let filter = { companyId: req.tenant.companyId };
    if (isStore) {
      // Store only sees returns that are pending (direct) or store_received (delivered by handler)
      filter = { companyId: req.tenant.companyId, status: { $in: ['pending', 'store_received'] } };
    } else if (req.user.role === 'employee') {
      // Handler sees returns assigned to them OR returns created by them once handler is assigned
      filter = {
        companyId: req.tenant.companyId,
        $or: [
          { returnHandler: req.user._id, status: { $in: ['handler_assigned', 'collected', 'store_received'] } },
          { fromUser: req.user._id, status: { $in: ['handler_assigned', 'collected', 'store_received'] } }
        ]
      };
    } else {
      // Others see returns that have handler assigned/collected/store_received
      filter = { companyId: req.tenant.companyId, status: { $in: ['handler_assigned', 'collected', 'store_received'] } };
    }

    const Return = require('../models/Return');
    const returns = await Return.find(filter)
      .populate('fromUser', 'fullName employeeId')
      .populate('returnHandler', 'fullName employeeId');

    res.json({ data: returns, returns });
  } catch (error) {
    console.error('Get pending returns error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

/**
 * Get all transfers
 */
exports.getAllTransfers = async (req, res) => {
  try {
    const filter = { companyId: req.tenant.companyId };
    const mongoose = require('mongoose');

    if (req.user) {
      const uId = req.user._id || req.user.id || req.user;
      const uStr = uId ? uId.toString() : '';
      const userObjId = (uStr && mongoose.Types.ObjectId.isValid(uStr)) ? new mongoose.Types.ObjectId(uStr) : uId;
      const userQuery = uStr ? { $in: [uStr, userObjId] } : null;

      const userRole = (req.user.role || '').toLowerCase();
      if (userQuery && ['employee', 'team_lead', 'user'].includes(userRole) && !['admin', 'super_admin', 'company_admin', 'management'].includes(userRole)) {
        const deptId = req.user.department ? (req.user.department._id || req.user.department) : null;
        filter.$or = [
          { fromUser: userQuery },
          { toUser: userQuery },
          { managementApprover: userQuery }
        ];
        if (deptId) {
          const dStr = typeof deptId === 'object' ? (deptId._id ? deptId._id.toString() : '') : String(deptId);
          if (dStr && mongoose.Types.ObjectId.isValid(dStr)) {
            const deptObjId = new mongoose.Types.ObjectId(dStr);
            filter.$or.push({ fromDepartment: { $in: [dStr, deptObjId] } }, { toDepartment: { $in: [dStr, deptObjId] } });
          }
        }
      }
    }

    const transfersRaw = await Transfer.find(filter)
      .populate('fromUser', 'fullName name employeeId')
      .populate('toUser', 'fullName name employeeId')
      .populate('managementApprover', 'fullName name employeeId')
      .sort({ createdAt: -1 });

    const Department = require('../../../models/Department');
    const allDepts = await Department.find({ companyId: req.tenant.companyId }).lean();
    const deptMap = new Map(allDepts.map(d => [d._id.toString(), d.name]));

    const transfers = transfersRaw.map(t => {
      const tObj = t.toObject();
      if (tObj.fromDepartment) {
        const fStr = typeof tObj.fromDepartment === 'object' ? (tObj.fromDepartment.name || tObj.fromDepartment._id) : String(tObj.fromDepartment);
        tObj.fromDepartment = { name: deptMap.get(String(fStr)) || String(fStr) };
      }
      if (tObj.toDepartment) {
        const tStr = typeof tObj.toDepartment === 'object' ? (tObj.toDepartment.name || tObj.toDepartment._id) : String(tObj.toDepartment);
        tObj.toDepartment = { name: deptMap.get(String(tStr)) || String(tStr) };
      }
      return tObj;
    });

    res.json({ data: transfers, transfers });
  } catch (error) {
    console.error('Get all transfers error:', error);
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

/**
 * Get all returns
 */
exports.getAllReturns = async (req, res) => {
  try {
    const filter = { companyId: req.tenant.companyId };

    const returns = await Return.find(filter)
      .populate('fromUser', 'fullName employeeId')
      .populate('returnHandler', 'fullName employeeId')
      .populate('previousHandler', 'fullName employeeId')
      .populate('pendingHandlerTransfer.toHandler', 'fullName employeeId')
      .populate('pendingHandlerTransfer.fromHandler', 'fullName employeeId')
      .populate('store', 'fullName employeeId')
      .sort({ createdAt: -1 });

    res.json({ data: returns });
  } catch (error) {
    console.error('Get all returns error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

/**
 * Assign/reassign handler for a Return request
 */
exports.assignReturnHandler = async (req, res) => {
  try {
    const { returnId } = req.params;
    const { handlerId, remarks } = req.body;

    const returnDoc = await Return.findOne({ _id: returnId, companyId: req.tenant.companyId });
    if (!returnDoc) return res.status(404).json({ message: 'Return request not found.' });

    // Allow current handler, super_admin, or store admin to reassign
    const isAssignedHandler = returnDoc.returnHandler && returnDoc.returnHandler.toString() === req.user._id.toString();
    const isStore = req.user.role === 'super_admin' || (req.user.role === 'department_admin' && req.user.departmentAdminType === 'store');
    if (!isAssignedHandler && !isStore) {
      return res.status(403).json({ message: 'Not authorized to change return handler.' });
    }

    const User = require('../../../models/User');
    const handlerUser = await User.findOne({ _id: handlerId, companyId: req.tenant.companyId });
    const newHandlerName = handlerUser ? handlerUser.fullName : 'Handler';

    // If current handler initiates reassignment, create a pending transfer
    if (isAssignedHandler && !isStore) {
      if (returnDoc.pendingHandlerTransfer && returnDoc.pendingHandlerTransfer.status === 'pending') {
        return res.status(400).json({ message: 'There is already a pending handler transfer request.' });
      }

      returnDoc.pendingHandlerTransfer = {
        toHandler: handlerId,
        fromHandler: req.user._id,
        requestedBy: req.user._id,
        requestedAt: new Date(),
        status: 'pending',
        remarks: remarks || '',
        rejectReason: '',
        resolvedAt: null,
      };

      const bc = await Barcode.findOne({ barcode: returnDoc.barcode, companyId: req.tenant.companyId });
      if (bc) {
        bc.history.push({
          action: 'Return Handler Transfer Requested',
          user: req.user._id,
          remarks: remarks || `Return handler transfer requested to ${newHandlerName}`,
          metadata: { toHandlerId: handlerId, toHandlerName: newHandlerName }
        });
        await bc.save();
      }

      await returnDoc.save();

      return res.json({ message: 'Return handler transfer request sent. Waiting for acceptance.', returnDoc, pendingTransfer: true });
    }

    // Direct assignment by Store Admin / Super Admin
    if (returnDoc.returnHandler) {
      returnDoc.previousHandler = returnDoc.returnHandler;
    }
    returnDoc.returnHandler = handlerId;
    returnDoc.status = 'handler_assigned';
    returnDoc.pendingHandlerTransfer = undefined;

    // Update barcode history
    const bc = await Barcode.findOne({ barcode: returnDoc.barcode, companyId: req.tenant.companyId });
    if (bc) {
      bc.history.push({
        action: 'Return Handler Reassigned',
        user: req.user._id,
        remarks: remarks || `Reassigned return handler to ${newHandlerName}`,
        metadata: { handlerId, handlerName: newHandlerName }
      });
      await bc.save();
    }

    await returnDoc.save();

    // Also update parent transaction handler!
    if (returnDoc.transactionId) {
      const parentTxn = await Transaction.findOne({ transactionId: returnDoc.transactionId, companyId: req.tenant.companyId });
      if (parentTxn) {
        parentTxn.handler = handlerId;
        if (!parentTxn.chatMembers.includes(handlerId)) {
          parentTxn.chatMembers.push(handlerId);
        }
        parentTxn.timeline.push({
          action: 'Handler Assigned',
          remarks: remarks || `Reassigned return handler to ${newHandlerName}`,
          user: req.user._id,
        });
        await parentTxn.save();
      }
    }

    res.json({ message: 'Return handler updated successfully.', returnDoc });
  } catch (error) {
    console.error('Assign return handler error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

/**
 * Create a Close Request (Requester requests to close/convert a barcode to DC)
 */
exports.createCloseRequest = async (req, res) => {
  try {
    const { barcode, documentType, remarks } = req.body;

    if (!barcode || !documentType) {
      return res.status(400).json({ message: 'Barcode and Document Type are required.' });
    }

    const Barcode = require('../models/Barcode');
    const bc = await Barcode.findOne({ barcode, companyId: req.tenant.companyId });
    if (!bc) return res.status(404).json({ message: 'Barcode not found.' });
    if (bc.status !== 'Active' && bc.status !== 'Exchanged') return res.status(400).json({ message: 'Barcode is not active.' });

    const pendingError = await checkBarcodePendingActions(barcode);
    if (pendingError) {
      return res.status(400).json({ message: pendingError });
    }

    // Validate ownership
    if (bc.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'You are not the owner of this barcode.' });
    }



    const { managementApprover, customerName, photos, gps, documents } = req.body;

    const isBypassed = documentType === 'DC Internal' && (req.user.role === 'team_lead' || req.user.role === 'department_admin' || req.user.role === 'super_admin');
    const initialStatus = isBypassed ? 'pending_store_acceptance' : 'pending';

    const CloseRequest = require('../models/CloseRequest');
    const closeReq = await CloseRequest.create({
      transactionId: bc.transactionId,
      barcode,
      documentType,
      remarks,
      requester: req.user._id,
      managementApprover: ['DC FOC', 'Invoice'].includes(documentType) ? managementApprover : undefined,
      customerName: documentType === 'DC FOC' ? customerName : undefined,
      status: initialStatus,
      photos,
      gps,
      documents
    });

    bc.closeRequest = {
      documentType,
      remarks,
      requester: req.user._id,
      managementApprover: ['DC FOC', 'Invoice'].includes(documentType) ? managementApprover : undefined,
      customerName: documentType === 'DC FOC' ? customerName : undefined,
      status: initialStatus,
      photos,
      gps,
      documents
    };

    bc.history.push({
      action: 'Close Requested',
      user: req.user._id,
      remarks: `Requested conversion to ${documentType}. ${remarks || ''}`
    });
    await bc.save();

    const Transaction = require('../models/Transaction');
    const txn = await Transaction.findOne({ companyId: req.tenant.companyId, $or: [{ _id: bc.transaction }, { transactionId: bc.transactionId }] });
    if (txn) {
      txn.timeline.push({
        action: 'Close Requested',
        description: `Barcode ${barcode} close/conversion request created for ${documentType}`,
        user: req.user._id,
        timestamp: new Date()
      });
      await txn.save();
    }

    res.json({ message: 'Barcode close request submitted successfully.', data: closeReq });
  } catch (error) {
    console.error('Create close request error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

/**
 * Get pending Close Requests (for Team Lead / Admin)
 */
exports.getPendingCloseRequests = async (req, res) => {
  try {
    const CloseRequest = require('../models/CloseRequest');
    let query = { companyId: req.tenant.companyId };

    if (req.user.role === 'team_lead') {
      const User = require('../../../models/User');
      const deptUsers = await User.find({ department: req.user.department, companyId: req.tenant.companyId }).select('_id');
      const deptUserIds = deptUsers.map(u => u._id);
      query.status = 'pending';
      query.requester = { $in: deptUserIds };
      query.documentType = 'DC Internal';
    } else if (req.user.role === 'department_admin' && req.user.departmentAdminType === 'management') {
      query.status = 'pending';
      query.documentType = { $in: ['DC FOC', 'Invoice'] };
      query.managementApprover = req.user._id;
    } else if (req.user.role === 'department_admin' && req.user.departmentAdminType === 'store') {
      query.status = 'pending_store_acceptance';
      query.documentType = { $in: ['DC Internal', 'DC FOC'] };
    } else if (req.user.role === 'department_admin' && req.user.departmentAdminType === 'accounts') {
      query.status = 'pending_accounts_approval';
      query.documentType = 'Invoice';
    } else if (req.user.role === 'super_admin') {
      query.status = { $in: ['pending', 'pending_accounts_approval', 'pending_store_acceptance'] };
    } else {
      // Others see nothing
      return res.json({ data: [], requests: [] });
    }

    const requests = await CloseRequest.find(query)
      .populate('requester', 'fullName employeeId department')
      .populate('managementApprover', 'fullName employeeId');

    res.json({ data: requests, requests });
  } catch (error) {
    console.error('Get pending close requests error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

/**
 * Handle Close Request approval/rejection (by Team Lead / Admin)
 */
exports.handleCloseRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const { action, rejectionReason, storeRemark } = req.body;

    const CloseRequest = require('../models/CloseRequest');
    const closeReq = await CloseRequest.findOne({ _id: requestId, companyId: req.tenant.companyId }).populate('requester');
    if (!closeReq) return res.status(404).json({ message: 'Close request not found.' });
    if (closeReq.status !== 'pending' && closeReq.status !== 'pending_accounts_approval' && closeReq.status !== 'pending_store_acceptance') {
      return res.status(400).json({ message: 'Request is already processed.' });
    }

    // Authorization check
    if (closeReq.status === 'pending') {
      if (closeReq.documentType === 'DC Internal') {
        const requesterDept = (closeReq.requester?.department?._id || closeReq.requester?.department)?.toString();
        const userDept = (req.user.department?._id || req.user.department)?.toString();
        if (req.user.role !== 'super_admin' && (req.user.role !== 'team_lead' || requesterDept !== userDept)) {
          return res.status(403).json({ message: 'Only the Team Lead of the requester\'s department can approve this DC Internal request.' });
        }
      } else if (closeReq.documentType === 'DC FOC' || closeReq.documentType === 'Invoice') {
        if (req.user.role !== 'super_admin' &&
          (req.user.role !== 'department_admin' ||
            req.user.departmentAdminType !== 'management' ||
            closeReq.managementApprover?.toString() !== req.user._id.toString())) {
          return res.status(403).json({ message: 'Only the selected Management approver can approve this conversion request.' });
        }
      } else {
        return res.status(400).json({ message: 'Invalid document type for close request.' });
      }
    } else if (closeReq.status === 'pending_accounts_approval') {
      if (req.user.role !== 'super_admin' && !(req.user.role === 'department_admin' && req.user.departmentAdminType === 'accounts')) {
        return res.status(403).json({ message: 'Only Accounts Admin can approve this request.' });
      }
    } else if (closeReq.status === 'pending_store_acceptance') {
      if (req.user.role !== 'super_admin' && !(req.user.role === 'department_admin' && req.user.departmentAdminType === 'store')) {
        return res.status(403).json({ message: 'Only Store Admin can accept this request.' });
      }
    }

    const Barcode = require('../models/Barcode');
    const bc = await Barcode.findOne({ barcode: closeReq.barcode, companyId: req.tenant.companyId });
    if (!bc) return res.status(404).json({ message: 'Associated barcode not found.' });

    if (closeReq.status === 'pending') {
      if (action === 'reject') {
        closeReq.status = 'rejected';
        closeReq.rejectionReason = rejectionReason || 'Rejected';

        bc.closeRequest.status = 'rejected';
        bc.closeRequest.rejectionReason = rejectionReason || 'Rejected';
        bc.history.push({
          action: 'Close Rejected',
          user: req.user._id,
          remarks: rejectionReason || 'Rejection of conversion request'
        });
        await bc.save();

        const Transaction = require('../models/Transaction');
        const txn = await Transaction.findOne({ companyId: req.tenant.companyId, $or: [{ _id: bc.transaction }, { transactionId: bc.transactionId }] });
        if (txn) {
          txn.timeline.push({
            action: 'Conversion Rejected',
            remarks: `Conversion request for barcode ${bc.barcode} rejected by ${req.user.fullName}: ${rejectionReason || ''}`,
            user: req.user._id,
            timestamp: new Date()
          });
          await txn.save();
        }
      } else if (action === 'approve') {
        if (closeReq.documentType === 'Invoice') {
          // Go to accounts department admin for invoice upload
          closeReq.status = 'pending_accounts_approval';
          closeReq.approvedBy = req.user._id;
          closeReq.approvedAt = new Date();

          bc.closeRequest.status = 'pending_accounts_approval';
          bc.history.push({
            action: 'First Approval',
            user: req.user._id,
            remarks: `Approved by Management Approver (${req.user.fullName}). Awaiting Accounts Admin upload.`
          });
          await bc.save();

          const Transaction = require('../models/Transaction');
          const txn = await Transaction.findOne({ companyId: req.tenant.companyId, $or: [{ _id: bc.transaction }, { transactionId: bc.transactionId }] });
          if (txn) {
            txn.timeline.push({
              action: 'First Approval',
              remarks: `Conversion request for barcode ${bc.barcode} to Invoice approved by Management Approver. Awaiting Accounts Admin upload.`,
              user: req.user._id,
              timestamp: new Date()
            });
            await txn.save();
          }
        } else if (closeReq.documentType === 'DC FOC' || closeReq.documentType === 'DC Internal') {
          // For DC Internal and DC FOC, move to pending_store_acceptance
          closeReq.status = 'pending_store_acceptance';
          closeReq.approvedBy = req.user._id;
          closeReq.approvedAt = new Date();

          bc.closeRequest.status = 'pending_store_acceptance';
          bc.history.push({
            action: 'First Approval',
            user: req.user._id,
            remarks: `Approved by ${closeReq.documentType === 'DC FOC' ? 'Management' : 'Team Lead'}. Awaiting store acceptance.`
          });
          await bc.save();

          const Transaction = require('../models/Transaction');
          const txn = await Transaction.findOne({ companyId: req.tenant.companyId, $or: [{ _id: bc.transaction }, { transactionId: bc.transactionId }] });
          if (txn) {
            txn.timeline.push({
              action: 'First Approval',
              remarks: `Conversion request for barcode ${bc.barcode} to ${closeReq.documentType} approved by ${req.user.fullName}. Awaiting store acceptance.`,
              user: req.user._id,
              timestamp: new Date()
            });
            await txn.save();
          }
        }
      } else {
        return res.status(400).json({ message: 'Invalid action.' });
      }
    } else if (closeReq.status === 'pending_accounts_approval') {
      if (action === 'reject') {
        closeReq.status = 'pending';
        closeReq.rejectionReason = rejectionReason || 'Rejected by Accounts';
        closeReq.approvedBy = undefined;
        closeReq.approvedAt = undefined;

        bc.closeRequest.status = 'pending';
        bc.closeRequest.rejectionReason = rejectionReason || 'Rejected by Accounts';
        bc.closeRequest.approvedBy = undefined;
        bc.closeRequest.approvedAt = undefined;
        bc.history.push({
          action: 'Close Reverted by Accounts',
          user: req.user._id,
          remarks: `Accounts rejected/reverted Invoice conversion request. Reason: ${rejectionReason || ''}`
        });
        await bc.save();

        const Transaction = require('../models/Transaction');
        const txn = await Transaction.findOne({ companyId: req.tenant.companyId, $or: [{ _id: bc.transaction }, { transactionId: bc.transactionId }] });
        if (txn) {
          txn.timeline.push({
            action: 'Conversion Reverted',
            remarks: `Invoice conversion request for barcode ${bc.barcode} rejected by Accounts and reverted to Management stage: ${rejectionReason || ''}`,
            user: req.user._id,
            timestamp: new Date()
          });
          await txn.save();
        }
      } else if (action === 'approve') {
        const { invoiceUrl, invoiceNumber } = req.body;
        if (!invoiceUrl && !invoiceNumber) {
          return res.status(400).json({ message: 'Invoice number or URL is required for approval.' });
        }

        const resolvedInvoiceNumber = invoiceNumber || '';

        closeReq.status = 'approved';
        if (invoiceUrl) closeReq.invoiceUrl = invoiceUrl;
        closeReq.approvedBy = req.user._id;
        closeReq.approvedAt = new Date();

        bc.status = 'Closed';
        bc.closeRequest.status = 'approved';

        const docName = `Invoice-${resolvedInvoiceNumber}`;
        bc.documents.push({
          name: docName,
          url: invoiceUrl || 'N/A',
          type: 'Invoice',
          size: 0
        });

        bc.history.push({
          action: 'Closed',
          user: req.user._id,
          remarks: `Accounts registered invoice and closed RDC, converting to Invoice (${resolvedInvoiceNumber})`
        });
        await bc.save();

        const Transaction = require('../models/Transaction');
        const txn = await Transaction.findOne({ companyId: req.tenant.companyId, $or: [{ _id: bc.transaction }, { transactionId: bc.transactionId }] });
        if (txn) {
          // Update the barcode status inside materials loop instead of removing
          txn.materials = txn.materials.map(m => {
            if (m.barcodes) {
              m.barcodes = m.barcodes.map(b => {
                const bStr = typeof b === 'string' ? b : (b.barcode || b._id?.toString());
                if (bStr === bc.barcode) {
                  b.status = 'Closed';
                }
                return b;
              });
            }
            return m;
          });

          // Add to transaction documents
          txn.documents.push({
            name: docName,
            url: invoiceUrl || 'N/A',
            type: 'Invoice',
            size: 0,
            uploadedBy: req.user._id,
            uploadedAt: new Date()
          });

          // Update progress tracking
          txn.closedItems = (txn.closedItems || 0) + 1;
          txn.activeItems = Math.max(0, (txn.activeItems || 0) - 1);

          // Check if all items returned or closed
          if ((txn.returnedItems || 0) + (txn.closedItems || 0) >= txn.totalItems) {
            txn.status = 'closed';
            txn.closedAt = new Date();
            txn.closedBy = req.user._id;
            txn.chatLocked = true;
            txn.timeline.push({
              action: 'Transaction Closed',
              description: 'All items returned or closed/converted',
              user: req.user._id,
            });
          }

          txn.timeline.push({
            action: 'Closed',
            remarks: `Barcode ${bc.barcode} closed via Accounts approval for Invoice (${resolvedInvoiceNumber})`,
            user: req.user._id,
            timestamp: new Date()
          });
          await txn.save();
        }
      } else {
        return res.status(400).json({ message: 'Invalid action.' });
      }
    } else if (closeReq.status === 'pending_store_acceptance') {
      if (action === 'reject') {
        return res.status(400).json({ message: 'Store cannot reject conversion requests. Store can only accept them.' });
      } else if (action === 'approve') {
        let tallyVoucherNum = null;
        if (closeReq.documentType === 'DC FOC') {
          try {
            const tallyDcFocController = require('./tallyDcFoc.controller');
            tallyVoucherNum = await tallyDcFocController.postTallyDeliveryNote(
              closeReq.barcode,
              closeReq.customerName || 'Consumer',
              null,
              closeReq.createdAt || new Date()
            );
            console.log(`Tally Delivery Note created: ${tallyVoucherNum} for barcode ${closeReq.barcode}`);
          } catch (tallyErr) {
            console.error('Failed to create Tally Delivery Note voucher:', tallyErr.message);
            return res.status(400).json({ message: `Tally integration error: ${tallyErr.message}` });
          }
        } else if (closeReq.documentType === 'DC Internal') {
          try {
            const tallyController = require('./tally.controller');
            const User = require('../../../models/User');
            const fromUserObj = await User.findOne({ _id: closeReq.requester, companyId: req.tenant.companyId });

            const employeeGodown = fromUserObj?.fullName || 'Main Location';

            const matchedMat = bc.materialName || 'Unknown Material';

            const Transaction = require('../models/Transaction');
            const parentTxn = await Transaction.findOne({ transactionId: bc.transactionId, companyId: req.tenant.companyId });
            let matchedUnit = bc.unit || 'pcs';
            let matchedPrice = bc.price || 0;
            if (parentTxn) {
              const mMat = parentTxn.materials.find(m =>
                m.barcodes && m.barcodes.some(b => {
                  const bStr = typeof b === 'string' ? b : (b.barcode || '');
                  return bStr === closeReq.barcode;
                })
              );
              if (mMat) {
                matchedUnit = mMat.unit || matchedUnit;
                matchedPrice = mMat.price || matchedPrice;
              }
            }

            const materialForTally = [{
              name: matchedMat,
              quantity: 1,
              unit: matchedUnit,
              price: matchedPrice,
              barcodes: [closeReq.barcode]
            }];

            const narrationText = `DC Internal`;

            tallyVoucherNum = await tallyController.createTallyGodownTransfer(
              narrationText,
              'return',
              employeeGodown,
              employeeGodown,
              materialForTally,
              closeReq.createdAt || new Date()
            );
            console.log(`Tally DC Internal Transfer voucher created: ${tallyVoucherNum} for barcode ${closeReq.barcode}`);
          } catch (tallyErr) {
            console.error('Failed to create Tally Godown Transfer for DC Internal:', tallyErr.message);
            return res.status(400).json({ message: `Tally integration error: ${tallyErr.message}` });
          }
        }

        closeReq.status = 'approved';
        closeReq.approvedBy = req.user._id;
        closeReq.approvedAt = new Date();
        closeReq.storeRemark = storeRemark || '';

        bc.status = 'Closed';
        bc.owner = req.user._id; // Remove completely from employee and assign to the store admin
        bc.closeRequest.status = 'approved';
        bc.history.push({
          action: 'Closed',
          user: req.user._id,
          remarks: `Store accepted and closed RDC, converting to ${closeReq.documentType}${storeRemark ? `. Store Remark: ${storeRemark}` : ''}${tallyVoucherNum ? ` (Tally DN: ${tallyVoucherNum})` : ''}`
        });
        await bc.save();

        const Transaction = require('../models/Transaction');
        const txn = await Transaction.findOne({ companyId: req.tenant.companyId, $or: [{ _id: bc.transaction }, { transactionId: bc.transactionId }] });
        if (txn) {
          // Update the barcode status inside materials loop instead of removing
          txn.materials = txn.materials.map(m => {
            if (m.barcodes) {
              m.barcodes = m.barcodes.map(b => {
                const bStr = typeof b === 'string' ? b : (b.barcode || b._id?.toString());
                if (bStr === bc.barcode) {
                  b.status = 'Closed';
                }
                return b;
              });
            }
            return m;
          });

          // Update progress tracking
          txn.closedItems = (txn.closedItems || 0) + 1;
          txn.activeItems = Math.max(0, (txn.activeItems || 0) - 1);

          // Check if all items returned or closed
          if ((txn.returnedItems || 0) + (txn.closedItems || 0) >= txn.totalItems) {
            txn.status = 'closed';
            txn.closedAt = new Date();
            txn.closedBy = req.user._id;
            txn.chatLocked = true;
            txn.timeline.push({
              action: 'Transaction Closed',
              description: 'All items returned or closed/converted',
              user: req.user._id,
            });
          } else {
            if (txn.activeItems === 1) {
              txn.status = 'partially_returned';
            } else {
              txn.status = 'active';
            }
          }

          txn.timeline.push({
            action: 'Closed',
            remarks: `Barcode ${bc.barcode} closed via Store approval for ${closeReq.documentType}${storeRemark ? `. Store Remark: ${storeRemark}` : ''}`,
            user: req.user._id,
            timestamp: new Date()
          });
          await txn.save();
        }
      } else {
        return res.status(400).json({ message: 'Invalid action.' });
      }
    }

    await closeReq.save();
    res.json({ message: `Close request successfully processed.`, data: closeReq });
  } catch (error) {
    console.error('Handle close request error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

/**
 * Create Exchange Request
 */
exports.createExchangeRequest = async (req, res) => {
  try {
    const { oldBarcode, warrantyReason } = req.body;
    const ExchangeRequest = require('../models/ExchangeRequest');
    const normalizedOld = oldBarcode ? oldBarcode.trim().toUpperCase() : '';

    if (!normalizedOld || !warrantyReason) {
      return res.status(400).json({ message: 'All fields (oldBarcode, warrantyReason) are required.' });
    }

    const companyId = req.tenant?.companyId || req.user?.companyId || null;
    const companyQuery = companyId
      ? { $or: [{ companyId }, { companyId: null }, { company: companyId }] }
      : {};

    const oldBc = await Barcode.findOne({ barcode: normalizedOld, ...companyQuery });
    if (!oldBc) return res.status(404).json({ message: 'Old barcode not found.' });
    if (oldBc.status !== 'Active' && oldBc.status !== 'Exchanged') return res.status(400).json({ message: 'Only active barcodes can be exchanged.' });

    const pendingError = await checkBarcodePendingActions(normalizedOld, companyId);
    if (pendingError) {
      return res.status(400).json({ message: pendingError });
    }

    // Verify ownership
    if (oldBc.owner?.toString() !== req.user._id.toString() && req.user.role !== 'super_admin') {
      return res.status(403).json({ message: 'You are not the owner of this barcode.' });
    }

    const { newBarcode, photos, gps, documents } = req.body;
    const exchangeReq = await ExchangeRequest.create({
      companyId: companyId || oldBc.companyId || null,
      transactionId: oldBc.transactionId,
      oldBarcode: normalizedOld,
      materialName: oldBc.materialName,
      requester: req.user._id,
      warrantyReason,
      newBarcode: newBarcode ? newBarcode.trim().toUpperCase() : undefined,
      photos: photos || [],
      gps,
      status: 'pending',
    });

    oldBc.history.push({
      action: 'Exchange Requested',
      user: req.user._id,
      remarks: `Exchange requested. Warranty reason: ${warrantyReason}`,
    });
    await oldBc.save();

    res.json({ message: 'Exchange request submitted successfully.', data: exchangeReq });
  } catch (error) {
    console.error('Create exchange request error:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
};

/**
 * Get Pending Exchange Requests
 */
exports.getPendingExchangeRequests = async (req, res) => {
  try {
    const ExchangeRequest = require('../models/ExchangeRequest');
    const companyId = req.tenant?.companyId || req.user?.companyId || null;
    const filter = { status: 'pending' };
    if (companyId) {
      filter.$or = [{ companyId }, { companyId: null }];
    }
    const requests = await ExchangeRequest.find(filter).populate('requester');
    res.json({ data: requests });
  } catch (error) {
    console.error('Get pending exchange requests error:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
};

/**
 * Get Exchange Requests by Transaction
 */
exports.getExchangeRequestsByTransaction = async (req, res) => {
  try {
    const { transactionId } = req.params;
    const ExchangeRequest = require('../models/ExchangeRequest');
    const companyId = req.tenant?.companyId || req.user?.companyId || null;
    const filter = { transactionId };
    if (companyId) {
      filter.$or = [{ companyId }, { companyId: null }];
    }
    const requests = await ExchangeRequest.find(filter).populate('requester');
    res.json({ data: requests });
  } catch (error) {
    console.error('Get exchange requests by transaction error:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
};

/**
 * Handle Exchange Request response
 */
exports.handleExchangeRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const { action, reason, storeRemark } = req.body; // 'accept' or 'reject'

    const companyId = req.tenant?.companyId || req.user?.companyId || null;
    const companyQuery = companyId
      ? { $or: [{ companyId }, { companyId: null }, { company: companyId }] }
      : {};

    const ExchangeRequest = require('../models/ExchangeRequest');
    const exchangeReq = await ExchangeRequest.findOne({ _id: requestId, ...companyQuery });
    if (!exchangeReq) return res.status(404).json({ message: 'Exchange request not found.' });
    if (exchangeReq.status !== 'pending') return res.status(400).json({ message: 'Request is already processed.' });

    const oldBc = await Barcode.findOne({ barcode: exchangeReq.oldBarcode, ...companyQuery });
    if (!oldBc) return res.status(404).json({ message: 'Old barcode not found.' });

    const User = require('../../../models/User');
    const requesterUser = await User.findOne({ _id: exchangeReq.requester, ...companyQuery });
    if (!requesterUser) return res.status(404).json({ message: 'Requester user not found.' });

    if (action === 'accept') {
      const { newBarcode } = req.body;
      if (!newBarcode || !newBarcode.trim()) {
        return res.status(400).json({ message: 'New barcode ID is required for exchange completion.' });
      }
      const normalizedNew = newBarcode.trim().toUpperCase();
      const existingNew = await Barcode.findOne({ barcode: normalizedNew, ...companyQuery });
      if (existingNew) {
        return res.status(400).json({ message: 'New barcode ID is already registered in the system.' });
      }

      exchangeReq.status = 'approved';
      exchangeReq.newBarcode = normalizedNew;
      exchangeReq.approvedBy = req.user._id;
      exchangeReq.approvedAt = new Date();
      exchangeReq.storeRemark = storeRemark || '';

      // 1. Mark old barcode status to 'Exchanged'
      oldBc.status = 'Exchanged';
      oldBc.history.push({
        action: 'Exchanged',
        user: req.user._id,
        remarks: storeRemark ? `Exchanged for new barcode ${normalizedNew}. Store Remark: ${storeRemark}` : `Exchanged for new barcode ${normalizedNew}. Warranty reason accepted.`,
        timestamp: new Date()
      });
      oldBc.history.push({
        action: 'Barcode Exchanged',
        remarks: `Barcode ${exchangeReq.oldBarcode} exchanged with new barcode ${normalizedNew} under warranty.${storeRemark ? ` Store Remark: ${storeRemark}` : ''}`,
        user: req.user._id,
        timestamp: new Date()
      });
      await oldBc.save();

      // Keep old barcode and add new barcode in original transaction materials
      const Transaction = require('../models/Transaction');
      const originalTxn = await Transaction.findOne({ transactionId: exchangeReq.transactionId, companyId: req.tenant.companyId });
      if (originalTxn) {
        const docTypeUpper = (originalTxn.documentType || '').toUpperCase();
        if (docTypeUpper.includes('INVOICE')) {
          exchangeReq.newDocumentType = 'Invoice';
        } else {
          exchangeReq.newDocumentType = 'DC';
        }

        originalTxn.materials = originalTxn.materials.map(mat => {
          if (mat.barcodes) {
            const containsOld = mat.barcodes.some(b => {
              const bStr = typeof b === 'string' ? b : (b.barcode || b._id?.toString());
              return bStr === exchangeReq.oldBarcode;
            });

            if (containsOld) {
              // Mark old entry status as Exchanged
              mat.barcodes = mat.barcodes.map(b => {
                const bStr = typeof b === 'string' ? b : (b.barcode || b._id?.toString());
                if (bStr === exchangeReq.oldBarcode) {
                  if (typeof b === 'object') {
                    b.status = 'Exchanged';
                  }
                }
                return b;
              });

              // Add new barcode entry
              mat.barcodes.push({
                barcode: normalizedNew,
                status: 'Active',
                owner: exchangeReq.requester
              });

              // Increment material quantity and transaction totalItems
              mat.quantity = (mat.quantity || 0) + 1;
              originalTxn.totalItems = (originalTxn.totalItems || 0) + 1;
            }
          }
          return mat;
        });

        // Add timeline entry to original transaction
        originalTxn.timeline.push({
          action: 'Barcode Exchanged',
          description: `Barcode ${exchangeReq.oldBarcode} exchanged with new barcode ${normalizedNew} under warranty.${storeRemark ? ` Store Remark: ${storeRemark}` : ''}`,
          user: req.user._id,
          timestamp: new Date()
        });
        await originalTxn.save();
      }

      // 2. Create the new barcode document as Active in Barcode collection
      const newBcDoc = await Barcode.create({
        barcode: normalizedNew,
        transactionId: exchangeReq.transactionId,
        transaction: oldBc.transaction,
        materialName: oldBc.materialName,
        status: 'Active',
        owner: exchangeReq.requester,
        ownerDepartment: oldBc.ownerDepartment || requesterUser.department,
        isSplit: false,
        isExchangeChild: true,
        exchangeFrom: oldBc.barcode,
        ownershipHistory: [{
          user: exchangeReq.requester,
          department: oldBc.ownerDepartment || requesterUser.department,
          action: 'received',
          remarks: `Ownership activated via exchange replacement under transaction ${exchangeReq.transactionId}`
        }],
        history: [{
          action: 'Exchange Child Created',
          user: req.user._id,
          remarks: `Created from exchange approval. Replaced old barcode ${exchangeReq.oldBarcode}.${storeRemark ? ` Store Remark: ${storeRemark}` : ''}`,
          timestamp: new Date()
        }, {
          action: 'Barcode Exchanged',
          remarks: `Barcode ${exchangeReq.oldBarcode} exchanged with new barcode ${normalizedNew} under warranty.${storeRemark ? ` Store Remark: ${storeRemark}` : ''}`,
          user: req.user._id,
          timestamp: new Date()
        }]
      });

      // Post Tally Autofill Stock Journal for exchange barcode
      try {
        const tallyController = require('./tally.controller');
        const parentMaterial = originalTxn ? originalTxn.materials.find(
          m => m.name.toLowerCase() === oldBc.materialName.toLowerCase()
        ) : null;

        const employeeGodown = requesterUser.fullName || 'Main Location';
        const materialInfo = {
          materialName: oldBc.materialName,
          unit: parentMaterial?.unit || 'pcs',
          price: parentMaterial?.price || 0
        };

        let oldUnit = parentMaterial?.unit || 'pcs';
        let oldPrice = parentMaterial?.price || 0;
        let oldTallyName = oldBc.materialName;

        try {
          const tallyDetails = await tallyController.getBarcodeTallyDetails(oldBc.barcode);
          if (tallyDetails) {
            if (tallyDetails.itemName) {
              oldTallyName = tallyDetails.itemName;
              console.log(`Resolved live Tally stock item name for old barcode ${oldBc.barcode}: ${oldTallyName}`);
            }
            if (tallyDetails.unit) {
              oldUnit = tallyDetails.unit;
              console.log(`Resolved live Tally unit for old barcode ${oldBc.barcode}: ${oldUnit}`);
            }
          }
        } catch (tallyDetailErr) {
          console.warn('Failed to fetch old barcode details from Tally live (using DB fallback):', tallyDetailErr.message);
        }

        // Use resolved Tally values
        oldBc.materialName = oldTallyName;
        oldBc.unit = oldUnit;
        oldBc.price = oldPrice;

        newBcDoc.materialName = oldTallyName;
        newBcDoc.unit = oldUnit;
        newBcDoc.price = oldPrice;

        const exchangeVoucherNum = await tallyController.createTallyExchangeStockJournal(
          exchangeReq._id.toString(),
          oldBc,
          newBcDoc,
          materialInfo,
          employeeGodown,
          exchangeReq.createdAt || new Date()
        );
        if (exchangeVoucherNum) {
          console.log(`Tally Exchange Stock Journal voucher created: ${exchangeVoucherNum} for exchange ${exchangeReq._id}`);
        } else {
          throw new Error('Tally Prime rejected stock journal creation. Please verify item and godown existence in Tally.');
        }
      } catch (tallyErr) {
        console.error('Failed to create Tally Autofill Stock Journal voucher for exchange:', tallyErr.message);

        // Revert DB updates for transactional integrity
        try {
          await Barcode.deleteOne({ _id: newBcDoc._id });

          oldBc.status = 'Active';
          oldBc.history.pop();
          oldBc.history.pop();
          await oldBc.save();

          if (originalTxn) {
            originalTxn.materials = originalTxn.materials.map(mat => {
              if (mat.barcodes) {
                const containsNew = mat.barcodes.some(b => {
                  const bStr = typeof b === 'string' ? b : (b.barcode || b._id?.toString());
                  return bStr === normalizedNew;
                });
                if (containsNew) {
                  mat.barcodes = mat.barcodes.filter(b => {
                    const bStr = typeof b === 'string' ? b : (b.barcode || b._id?.toString());
                    return bStr !== normalizedNew;
                  });
                  mat.barcodes = mat.barcodes.map(b => {
                    const bStr = typeof b === 'string' ? b : (b.barcode || b._id?.toString());
                    if (bStr === exchangeReq.oldBarcode) {
                      if (typeof b === 'object') {
                        b.status = 'Active';
                      }
                    }
                    return b;
                  });
                  mat.quantity = Math.max(0, (mat.quantity || 1) - 1);
                  originalTxn.totalItems = Math.max(0, (originalTxn.totalItems || 1) - 1);
                }
              }
              return mat;
            });
            originalTxn.timeline.pop();
            await originalTxn.save();
          }

          exchangeReq.status = 'pending';
          exchangeReq.newBarcode = undefined;
          exchangeReq.approvedBy = undefined;
          exchangeReq.approvedAt = undefined;
          await exchangeReq.save();
        } catch (revertErr) {
          console.error('Failed to revert DB updates on Tally failure:', revertErr.message);
        }

        return res.status(400).json({ message: `Tally integration error: ${tallyErr.message}` });
      }

      // Notify requester
      await createNotification(req.tenant.companyId, 
        exchangeReq.requester,
        'exchange_approved',
        'Exchange Request Approved',
        `Store approved exchange for ${exchangeReq.oldBarcode}. New barcode ${normalizedNew} is now active.`,
        exchangeReq.transactionId,
        normalizedNew
      );
    } else if (action === 'reject') {
      exchangeReq.status = 'rejected';
      exchangeReq.storeRemark = storeRemark || reason || 'No reason specified';

      oldBc.history.push({
        action: 'Exchange Rejected',
        user: req.user._id,
        remarks: `Exchange request rejected by store. Reason: ${storeRemark || reason || 'No reason specified'}`,
      });
      await oldBc.save();

      // Notify requester
      await createNotification(req.tenant.companyId, 
        exchangeReq.requester,
        'exchange_rejected',
        'Exchange Request Rejected',
        `Store rejected exchange for ${exchangeReq.oldBarcode}. Reason: ${storeRemark || reason || 'No reason specified'}`,
        exchangeReq.transactionId,
        exchangeReq.oldBarcode
      );
    } else {
      return res.status(400).json({ message: 'Invalid action.' });
    }

    await exchangeReq.save();
    const Transaction = require('../models/Transaction');
    const originalTxn = await Transaction.findOne({ transactionId: exchangeReq.transactionId, companyId: req.tenant.companyId });
    res.json({
      message: `Exchange request successfully processed.`,
      data: exchangeReq,
      transactionDbId: originalTxn ? originalTxn._id : null
    });
  } catch (error) {
    console.error('Handle exchange request error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

exports.getExchangeRequestsByTransaction = async (req, res) => {
  try {
    const { transactionId } = req.params;
    const ExchangeRequest = require('../models/ExchangeRequest');
    const requests = await ExchangeRequest.find({ transactionId, companyId: req.tenant.companyId })
      .populate('requester', 'fullName employeeId department')
      .populate('approvedBy', 'fullName employeeId');
    res.json({ success: true, data: requests });
  } catch (error) {
    console.error('Error fetching transaction exchange requests:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

exports.getAllSplitRequests = async (req, res) => {
  try {
    const filter = { companyId: req.tenant.companyId };
    const deptId = req.user.department?._id || req.user.department;
    const isStore = isUserStoreApprover(req.user);

    if (isStore) {
      // Store approvers (including Gokul Shirgaon) and Admins can view all split requests
    } else if (req.user.role === 'employee') {
      filter.requester = req.user._id;
    } else if (req.user.role === 'team_lead') {
      const User = require('../../../models/User');
      const deptUsers = deptId ? await User.find({ department: deptId, companyId: req.tenant.companyId }).select('_id') : [];
      const deptUserIds = deptUsers.map(u => u._id);
      filter.$or = [
        { requester: req.user._id },
        ...(deptUserIds.length > 0 ? [{ requester: { $in: deptUserIds } }] : []),
        { status: 'pending' }
      ];
    } else if (req.user.role === 'department_admin' && deptId) {
      if (req.user.departmentAdminType !== 'store' && req.user.departmentAdminType !== 'management' && req.user.departmentAdminType !== 'accounts') {
        const User = require('../../../models/User');
        const deptUsers = await User.find({ department: deptId, companyId: req.tenant.companyId }).select('_id');
        const deptUserIds = deptUsers.map(u => u._id);
        filter.requester = { $in: deptUserIds };
      }
    }
    const SplitRequest = require('../models/SplitRequest');
    const requests = await SplitRequest.find(filter)
      .populate('requester', 'fullName employeeId')
      .sort({ createdAt: -1 });
    res.json({ data: requests });
  } catch (error) {
    console.error('Get all split requests error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

exports.getAllCloseRequests = async (req, res) => {
  try {
    const filter = { companyId: req.tenant.companyId };
    const deptId = req.user.department?._id || req.user.department;
    const isStore = isUserStoreApprover(req.user);

    if (isStore) {
      // Store approvers and Admins can view all close/conversion requests
    } else if (req.user.role === 'employee') {
      filter.requester = req.user._id;
    } else if (req.user.role === 'team_lead') {
      const User = require('../../../models/User');
      const deptUsers = deptId ? await User.find({ department: deptId, companyId: req.tenant.companyId }).select('_id') : [];
      const deptUserIds = deptUsers.map(u => u._id);
      filter.$or = [
        { requester: req.user._id },
        ...(deptUserIds.length > 0 ? [{ requester: { $in: deptUserIds } }] : []),
        { status: 'pending' }
      ];
    } else if (req.user.role === 'department_admin' && deptId) {
      if (req.user.departmentAdminType !== 'store' && req.user.departmentAdminType !== 'management' && req.user.departmentAdminType !== 'accounts') {
        const User = require('../../../models/User');
        const deptUsers = await User.find({ department: deptId, companyId: req.tenant.companyId }).select('_id');
        const deptUserIds = deptUsers.map(u => u._id);
        filter.requester = { $in: deptUserIds };
      }
    }
    const CloseRequest = require('../models/CloseRequest');
    const requests = await CloseRequest.find(filter)
      .populate('requester', 'fullName employeeId')
      .populate('approvedBy', 'fullName employeeId')
      .populate('managementApprover', 'fullName employeeId')
      .sort({ createdAt: -1 });
    res.json({ data: requests });
  } catch (error) {
    console.error('Get all close requests error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

exports.getAllExchangeRequests = async (req, res) => {
  try {
    const companyId = req.tenant?.companyId || req.user?.companyId || null;
    const filter = companyId ? { $or: [{ companyId }, { companyId: null }] } : {};
    const deptId = req.user.department?._id || req.user.department;
    const isStore = isUserStoreApprover(req.user);

    if (isStore) {
      // Store approvers (including Gokul Shirgaon) and Admins can view all exchange requests
    } else if (req.user.role === 'employee') {
      filter.requester = req.user._id;
    } else if (req.user.role === 'team_lead') {
      const User = require('../../../models/User');
      const deptUsers = deptId ? await User.find({ department: deptId, ...(companyId ? { companyId } : {}) }).select('_id') : [];
      const deptUserIds = deptUsers.map((u) => u._id);
      filter.$and = [
        ...(filter.$or ? [{ $or: filter.$or }] : []),
        {
          $or: [
            { requester: req.user._id },
            ...(deptUserIds.length > 0 ? [{ requester: { $in: deptUserIds } }] : []),
            { status: 'pending' },
          ],
        },
      ];
      delete filter.$or;
    } else if (req.user.role === 'department_admin' && deptId) {
      if (req.user.departmentAdminType !== 'store' && req.user.departmentAdminType !== 'management' && req.user.departmentAdminType !== 'accounts') {
        const User = require('../../../models/User');
        const deptUsers = await User.find({ department: deptId, ...(companyId ? { companyId } : {}) }).select('_id');
        const deptUserIds = deptUsers.map((u) => u._id);
        filter.requester = { $in: deptUserIds };
      }
    }
    const ExchangeRequest = require('../models/ExchangeRequest');
    const requests = await ExchangeRequest.find(filter)
      .populate('requester', 'fullName employeeId name')
      .populate('approvedBy', 'fullName employeeId name')
      .sort({ createdAt: -1 });
    res.json({ data: requests });
  } catch (error) {
    console.error('Get all exchange requests error:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
};

// ==========================================
// MERGE MATERIAL CONTROLLER FUNCTIONS
// ==========================================

exports.getUserActiveBarcodes = async (req, res) => {
  try {
    const userId = req.user._id;
    const companyId = req.tenant?.companyId || req.user?.companyId || null;
    const companyQuery = companyId ? { $or: [{ companyId }, { companyId: null }, { company: companyId }] } : {};

    const barcodes = await Barcode.find({ owner: userId, status: { $in: ['Active', 'Exchanged'] }, ...companyQuery })
      .select('barcode materialName transactionId unit price createdAt owner')
      .sort({ createdAt: -1 });

    res.json({ success: true, count: barcodes.length, data: barcodes });
  } catch (error) {
    console.error('Error fetching user active barcodes:', error);
    res.status(500).json({ message: 'Server error fetching active barcodes: ' + error.message });
  }
};

exports.createMergeRequest = async (req, res) => {
  try {
    const { mergeBarcodes, parentBarcodeMode, selectedParentBarcode, requestedMaterialName, reason, gps, photos } = req.body;
    const MergeRequest = require('../models/MergeRequest');

    if (!Array.isArray(mergeBarcodes) || mergeBarcodes.length < 2) {
      return res.status(400).json({ message: 'At least 2 active barcodes must be selected to merge.' });
    }

    if (!['existing', 'new'].includes(parentBarcodeMode)) {
      return res.status(400).json({ message: 'Invalid parent barcode mode. Must be "existing" or "new".' });
    }

    if (parentBarcodeMode === 'existing') {
      if (!selectedParentBarcode || !mergeBarcodes.includes(selectedParentBarcode)) {
        return res.status(400).json({ message: 'Selected parent barcode must be one of the merging barcodes.' });
      }
    }

    if (!reason || !reason.trim()) {
      return res.status(400).json({ message: 'Please provide a reason for the merge request.' });
    }

    const companyId = req.tenant?.companyId || req.user?.companyId || null;
    const companyQuery = companyId ? { $or: [{ companyId }, { companyId: null }, { company: companyId }] } : {};

    // Verify all barcodes exist, belong to this user, and are Active
    const barcodeDocs = await Barcode.find({ barcode: { $in: mergeBarcodes }, ...companyQuery });
    if (barcodeDocs.length !== mergeBarcodes.length) {
      return res.status(400).json({ message: 'One or more specified barcodes do not exist.' });
    }

    for (const bcDoc of barcodeDocs) {
      if (bcDoc.owner?.toString() !== req.user._id.toString() && req.user.role !== 'super_admin') {
        return res.status(403).json({ message: `Barcode ${bcDoc.barcode} does not belong to you.` });
      }
      if (bcDoc.status !== 'Active' && bcDoc.status !== 'Exchanged') {
        return res.status(400).json({ message: `Barcode ${bcDoc.barcode} is not Active (status: ${bcDoc.status}).` });
      }
    }

    const firstBc = barcodeDocs[0];
    const mergeReq = await MergeRequest.create({
      companyId: companyId || firstBc.companyId || null,
      transactionId: firstBc.transactionId,
      mergeBarcodes,
      parentBarcodeMode,
      selectedParentBarcode: parentBarcodeMode === 'existing' ? selectedParentBarcode : undefined,
      requestedMaterialName: requestedMaterialName || firstBc.materialName,
      requester: req.user._id,
      reason,
      gps: gps || undefined,
      photos: photos || [],
      status: 'pending'
    });

    // Update status of all merging barcodes to 'Merge Pending' to lock and hide actions until store resolves
    await Barcode.updateMany(
      { barcode: { $in: mergeBarcodes }, ...companyQuery },
      {
        $set: { status: 'Merge Pending' },
        $push: {
          history: {
            action: 'Merge Requested',
            user: req.user._id,
            remarks: reason || 'Merge requested, awaiting store approval'
          }
        }
      }
    );

    // Send notifications to Store admins
    const User = require('../../../models/User');
    const storeAdmins = await User.find({
      $or: [
        { role: 'super_admin' },
        { role: 'department_admin', departmentAdminType: 'store' }
      ]
    });

    for (const admin of storeAdmins) {
      await createNotification(companyId, 
        admin._id,
        'merge_request',
        'New Merge Material Request',
        `${req.user.fullName || 'User'} requested to merge barcodes (${mergeBarcodes.join(', ')})`,
        firstBc.transactionId,
        mergeBarcodes[0]
      );
    }

    res.status(200).json({ success: true, message: 'Merge request submitted successfully.', data: mergeReq });
  } catch (error) {
    console.error('Error creating merge request:', error);
    res.status(500).json({ message: error.message || 'Server error creating merge request.' });
  }
};

exports.getPendingMergeRequests = async (req, res) => {
  try {
    // Merge requests must ONLY be accessible by Store Approvers (e.g. Gokul Shirgaon)
    const isStore = isUserStoreApprover(req.user);
    if (!isStore) {
      return res.json({ success: true, data: [] });
    }

    const MergeRequest = require('../models/MergeRequest');
    const companyId = req.tenant?.companyId || req.user?.companyId || null;
    const filter = { status: 'pending' };
    if (companyId) {
      filter.$or = [{ companyId }, { companyId: null }];
    }
    const requests = await MergeRequest.find(filter)
      .populate('requester', 'fullName employeeId department name')
      .sort({ createdAt: -1 });

    res.json({ success: true, data: requests });
  } catch (error) {
    console.error('Error fetching pending merge requests:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
};

exports.getAllMergeRequests = async (req, res) => {
  try {
    const isStore = isUserStoreApprover(req.user);
    const companyId = req.tenant?.companyId || req.user?.companyId || null;
    const filter = companyId ? { $or: [{ companyId }, { companyId: null }] } : {};

    if (!isStore) {
      // Non-store users (employees, management) do not see merge queue
      if (req.user.role === 'employee' || req.user.role === 'user') {
        filter.requester = req.user._id;
      } else {
        return res.json({ success: true, data: [] });
      }
    }
    const MergeRequest = require('../models/MergeRequest');
    const requests = await MergeRequest.find(filter)
      .populate('requester', 'fullName employeeId name')
      .populate('approvedBy', 'fullName employeeId name')
      .sort({ createdAt: -1 });

    res.json({ success: true, data: requests });
  } catch (error) {
    console.error('Error fetching all merge requests:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
};

exports.approveMergeRequest = async (req, res) => {
  try {
    const { requestId, action, newBarcode, materialName, storeRemark, reason } = req.body;

    const isStore = isUserStoreApprover(req.user);
    if (!isStore) {
      return res.status(403).json({ message: 'Only Store users can respond to merge requests.' });
    }

    const companyId = req.tenant?.companyId || req.user?.companyId || null;
    const companyQuery = companyId ? { $or: [{ companyId }, { companyId: null }, { company: companyId }] } : {};

    const MergeRequest = require('../models/MergeRequest');
    const mergeReq = await MergeRequest.findOne({ _id: requestId, ...companyQuery });
    if (!mergeReq) return res.status(404).json({ message: 'Merge request not found.' });
    if (mergeReq.status !== 'pending') return res.status(400).json({ message: 'Merge request is already processed.' });

    // Handle rejection
    if (action === 'reject') {
      mergeReq.status = 'rejected';
      mergeReq.storeRemark = storeRemark || reason || 'Rejected by store';
      await mergeReq.save();

      // Add rejection history and restore status: 'Active' to merging barcodes
      await Barcode.updateMany(
        { barcode: { $in: mergeReq.mergeBarcodes } },
        {
          $set: { status: 'Active' },
          $push: {
            history: {
              action: 'Merge Rejected',
              user: req.user._id,
              remarks: storeRemark || reason || 'Rejected by store',
            }
          }
        }
      );

      await createNotification(companyId, 
        mergeReq.requester,
        'merge_rejected',
        'Merge Request Rejected',
        `Store rejected your merge request for barcodes ${mergeReq.mergeBarcodes.join(', ')}: ${storeRemark || reason || ''}`,
        mergeReq.transactionId,
        mergeReq.mergeBarcodes[0]
      );

      return res.json({ success: true, message: 'Merge request rejected by store.', data: mergeReq });
    }

    // Determine final parent barcode
    let finalParent = '';
    if (mergeReq.parentBarcodeMode === 'existing') {
      finalParent = mergeReq.selectedParentBarcode;
      if (!finalParent || !mergeReq.mergeBarcodes.includes(finalParent)) {
        return res.status(400).json({ message: 'Invalid existing parent barcode in request.' });
      }
    } else {
      // New barcode mode
      finalParent = newBarcode ? newBarcode.trim().toUpperCase() : '';
      if (!finalParent) {
        return res.status(400).json({ message: 'Please provide a new parent barcode number.' });
      }
      const existingBc = await Barcode.findOne({ barcode: finalParent, ...companyQuery });
      if (existingBc) {
        return res.status(400).json({ message: `Barcode ${finalParent} already exists in the system.` });
      }
    }

    // Fetch all merge barcode documents from DB
    const mergeBarcodeDocs = await Barcode.find({ barcode: { $in: mergeReq.mergeBarcodes }, ...companyQuery }).populate('owner');
    if (mergeBarcodeDocs.length !== mergeReq.mergeBarcodes.length) {
      return res.status(404).json({ message: 'Some merging barcodes could not be found.' });
    }

    const User = require('../../../models/User');
    const requesterUser = await User.findOne({ _id: mergeReq.requester, ...companyQuery });
    if (!requesterUser) return res.status(404).json({ message: 'Requester user not found.' });

    // Mark MergeRequest as approved
    mergeReq.status = 'approved';
    mergeReq.approvedBy = req.user._id;
    mergeReq.approvedAt = new Date();
    mergeReq.finalParentBarcode = finalParent;
    mergeReq.storeRemark = storeRemark || '';
    await mergeReq.save();

    let parentBcDoc = null;
    let newBcCreated = false;

    // Process Barcode documents in database
    if (mergeReq.parentBarcodeMode === 'existing') {
      parentBcDoc = mergeBarcodeDocs.find(b => b.barcode === finalParent);
      if (materialName) {
        parentBcDoc.materialName = materialName;
      }
      parentBcDoc.history.push({
        action: 'Merged Parent Barcode',
        user: req.user._id,
        remarks: `Merged materials absorbed barcodes: ${mergeReq.mergeBarcodes.filter(b => b !== finalParent).join(', ')}.${storeRemark ? ` Store Remark: ${storeRemark}` : ''}`
      });
      await parentBcDoc.save();

      // Mark other barcodes as Merged
      const otherBarcodes = mergeReq.mergeBarcodes.filter(b => b !== finalParent);
      for (const bCode of otherBarcodes) {
        const bDoc = mergeBarcodeDocs.find(b => b.barcode === bCode);
        if (bDoc) {
          bDoc.status = 'Merged';
          bDoc.history.push({
            action: 'Barcode Merged',
            user: req.user._id,
            remarks: `Barcode merged into parent ${finalParent}.${storeRemark ? ` Store Remark: ${storeRemark}` : ''}`
          });
          await bDoc.save();
        }
      }
    } else {
      // New barcode mode: mark ALL merging barcodes as Merged, create NEW barcode for finalParent
      for (const bDoc of mergeBarcodeDocs) {
        bDoc.status = 'Merged';
        bDoc.history.push({
          action: 'Barcode Merged',
          user: req.user._id,
          remarks: `Barcode merged into new parent ${finalParent}.${storeRemark ? ` Store Remark: ${storeRemark}` : ''}`
        });
        await bDoc.save();
      }

      const sampleBc = mergeBarcodeDocs[0];
      parentBcDoc = await Barcode.create({
        companyId: companyId || sampleBc.companyId || null,
        barcode: finalParent,
        transactionId: sampleBc.transactionId,
        transaction: sampleBc.transaction,
        materialName: materialName || mergeReq.requestedMaterialName || sampleBc.materialName,
        status: 'Active',
        owner: mergeReq.requester,
        ownerDepartment: requesterUser.department,
        parentBarcode: mergeReq.mergeBarcodes.join(','),
        isSplit: false,
        ownershipHistory: [{
          user: mergeReq.requester,
          department: requesterUser.department,
          action: 'merge_created',
          remarks: `Created from merging barcodes ${mergeReq.mergeBarcodes.join(', ')}.${storeRemark ? ` Store Remark: ${storeRemark}` : ''}`
        }],
        history: [{
          action: 'Merge Parent Created',
          user: req.user._id,
          remarks: storeRemark || `Created from merge approval of barcodes (${mergeReq.mergeBarcodes.join(', ')})`
        }]
      });
      newBcCreated = true;

      // Update Transaction materials array to include the new parent barcode
      try {
        const Transaction = require('../models/Transaction');
        const txn = await Transaction.findOne({ companyId: req.tenant?.companyId || sampleBc.companyId, $or: [{ _id: sampleBc.transaction }, { transactionId: sampleBc.transactionId }] });
        if (txn && txn.materials && txn.materials.length > 0) {
          const targetMat = txn.materials.find(m => m.name === parentBcDoc.materialName) || txn.materials[0];
          if (targetMat) {
            if (!targetMat.barcodes) targetMat.barcodes = [];
            const exists = targetMat.barcodes.some(b => (typeof b === 'string' ? b : b.barcode) === finalParent);
            if (!exists) {
              targetMat.barcodes.push({
                barcode: finalParent,
                status: 'Active',
                owner: mergeReq.requester
              });
              await txn.save();
            }
          }
        }
      } catch (txnErr) {
        console.warn('Could not attach new parent barcode to transaction materials array:', txnErr.message);
      }
    }

    // Post Tally Autofill Stock Journal for merge
    try {
      const tallyController = require('./tally.controller');
      const employeeGodown = requesterUser.fullName || 'Main Location';
      const materialInfo = {
        materialName: parentBcDoc.materialName,
        unit: parentBcDoc.unit || 'pcs',
        price: parentBcDoc.price || 0
      };

      const mergeVoucherNum = await tallyController.createTallyMergeStockJournal(
        mergeReq._id.toString(),
        mergeBarcodeDocs,
        parentBcDoc,
        materialInfo,
        employeeGodown,
        mergeReq.createdAt || new Date()
      );

      if (mergeVoucherNum) {
        console.log(`Tally Merge Stock Journal voucher created: ${mergeVoucherNum} for merge request ${mergeReq._id}`);
      } else {
        throw new Error('Tally Prime rejected stock journal creation for merge. Please verify item and godown existence in Tally.');
      }
    } catch (tallyErr) {
      console.error('Failed to create Tally Autofill Stock Journal voucher for merge:', tallyErr.message);

      // Revert DB updates for transactional integrity
      try {
        if (newBcCreated && parentBcDoc) {
          await Barcode.deleteOne({ _id: parentBcDoc._id });
        }
        for (const bDoc of mergeBarcodeDocs) {
          bDoc.status = 'Active';
          bDoc.history.pop();
          await bDoc.save();
        }
        mergeReq.status = 'pending';
        mergeReq.approvedBy = undefined;
        mergeReq.approvedAt = undefined;
        mergeReq.finalParentBarcode = undefined;
        await mergeReq.save();
      } catch (revertErr) {
        console.error('Failed to revert DB updates on Tally merge failure:', revertErr.message);
      }

      return res.status(400).json({ message: `Tally integration error: ${tallyErr.message}` });
    }

    // Check all affected transactions of the merging barcodes to auto-close transactions if no active barcodes remain
    try {
      const Transaction = require('../models/Transaction');
      const distinctTxnIds = [...new Set(mergeBarcodeDocs.map(b => b.transactionId).filter(Boolean))];
      for (const txId of distinctTxnIds) {
        const txnDoc = await Transaction.findOne({
          transactionId: txId,
          companyId: req.tenant?.companyId || companyId
        });
        if (txnDoc) {
          const remainingActive = await Barcode.countDocuments({
            transactionId: txId,
            status: { $in: ['Active', 'issued', 'Exchanged'] },
            companyId: req.tenant?.companyId || companyId
          });
          if (remainingActive === 0) {
            txnDoc.status = 'closed';
            txnDoc.activeItems = 0;
            txnDoc.closedAt = new Date();
            txnDoc.closedBy = req.user._id;
            txnDoc.chatLocked = true;
            txnDoc.timeline.push({
              action: 'Transaction Closed',
              description: 'All barcodes in transaction have been merged into master lots or returned',
              user: req.user._id,
            });
            await txnDoc.save();
          }
        }
      }
    } catch (txnCloseErr) {
      console.warn('Could not auto-close merged transactions:', txnCloseErr.message);
    }

    // Notify requester of approval
    await createNotification(req.tenant.companyId, 
      mergeReq.requester,
      'merge_approved',
      'Merge Request Approved',
      `Store approved your merge request. Parent barcode is ${finalParent}.`,
      mergeReq.transactionId,
      finalParent
    );

    return res.json({ message: 'Merge request approved successfully.', data: mergeReq });
  } catch (error) {
    console.error('Error approving merge request:', error);
    res.status(500).json({ message: error.message || 'Server error approving merge request.' });
  }
};

