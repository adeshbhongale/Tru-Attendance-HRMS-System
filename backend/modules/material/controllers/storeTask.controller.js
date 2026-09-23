const StoreTask = require('../models/StoreTask');
const StoreConfiguration = require('../../../models/StoreConfiguration');
const Transaction = require('../models/Transaction');
const Return = require('../models/Return');
const Barcode = require('../models/Barcode');
const ActivityLog = require('../models/ActivityLog');
const AuditLog = require('../models/AuditLog');
const { createTallyGodownTransfer } = require('./tally.controller');
const ErrorResponse = require('../../../utils/errorResponse');
const Notification = require('../../../models/Notification');
const { emitToUser } = require('../../../config/socket');

const sendNotification = async (companyId, userId, type, title, message, transactionId) => {
  try {
    if (!userId) return;
    const notif = await Notification.create({
      companyId,
      user: userId,
      title: title || 'Material Notification',
      description: message || title || 'Material Request update',
      type: 'general notification',
      targetType: 'Specific Employees',
      employees: [userId],
      status: 'sent'
    });
    if (typeof emitToUser === 'function') {
      emitToUser(userId.toString(), 'notification', notif);
    }
    return notif;
  } catch (err) {
    console.warn('Notification warning in storeTask:', err.message);
  }
};

// @desc    Get task by transaction ID
// @route   GET /api/v1/material/store-tasks/transaction/:txnId
// @access  Private
exports.getTaskByTransaction = async (req, res, next) => {
  try {
    const mongoose = require('mongoose');
    let txnId = req.params.txnId;
    let targetTxnObjectId = null;

    const companyId = req.user?.companyId || req.tenant?.companyId || null;
    const companyQuery = companyId ? { companyId } : {};
    let taskTypeParam = (req.query.taskType || '').toUpperCase().trim();
    let taskTypeQuery = taskTypeParam ? { taskType: taskTypeParam } : {};

    if (mongoose.isValidObjectId(txnId)) {
      targetTxnObjectId = txnId;
      if (!taskTypeParam) {
        const txnDoc = await Transaction.findOne({ _id: txnId, ...companyQuery }).select('status');
        if (txnDoc) {
          if (txnDoc.status === 'ready_for_return_checklist') {
            taskTypeQuery = { taskType: 'RETURN' };
          } else if (txnDoc.status === 'ready_for_dispatch_checklist') {
            taskTypeQuery = { taskType: 'DISPATCH' };
          }
        }
      }
    } else {
      const txnDoc = await Transaction.findOne({
        ...companyQuery,
        transactionId: txnId
      }).select('_id status');
      if (txnDoc) {
        targetTxnObjectId = txnDoc._id;
        if (!taskTypeParam) {
          if (txnDoc.status === 'ready_for_return_checklist') {
            taskTypeQuery = { taskType: 'RETURN' };
          } else if (txnDoc.status === 'ready_for_dispatch_checklist') {
            taskTypeQuery = { taskType: 'DISPATCH' };
          }
        }
      }
    }

    let storeTask = null;

    // 1. If looking for a Return task and txnId or query has returnId
    const directReturnId = req.query.returnId || (taskTypeParam === 'RETURN' && mongoose.isValidObjectId(txnId) ? txnId : null);
    if (directReturnId && mongoose.isValidObjectId(directReturnId)) {
      storeTask = await StoreTask.findOne({
        $or: [{ returnId: directReturnId }, { returnIds: directReturnId }],
        ...companyQuery
      })
      .sort({ updatedAt: -1 })
      .populate('assignedTo', 'fullName name employeeId role')
      .populate({
        path: 'transactionId',
        populate: [
          { path: 'requester', select: 'fullName name employeeId department' },
          { path: 'handler', select: 'fullName name employeeId' },
          { path: 'store', select: 'fullName name employeeId' },
        ]
      })
      .populate({
        path: 'returnId',
        populate: [
          { path: 'fromUser', select: 'fullName name employeeId department' },
          { path: 'returnHandler', select: 'fullName name employeeId' },
        ]
      })
      .populate({
        path: 'returnIds',
        populate: [
          { path: 'fromUser', select: 'fullName name employeeId department' },
          { path: 'returnHandler', select: 'fullName name employeeId' },
        ]
      });
    }

    // 2. Query by targetTxnObjectId matching taskType if requested, newest first
    if (!storeTask && targetTxnObjectId) {
      storeTask = await StoreTask.findOne({
        transactionId: targetTxnObjectId,
        ...taskTypeQuery,
        ...companyQuery
      })
      .sort({ updatedAt: -1 })
      .populate('assignedTo', 'fullName name employeeId role')
      .populate({
        path: 'transactionId',
        populate: [
          { path: 'requester', select: 'fullName name employeeId department' },
          { path: 'handler', select: 'fullName name employeeId' },
          { path: 'store', select: 'fullName name employeeId' },
        ]
      })
      .populate({
        path: 'returnId',
        populate: [
          { path: 'fromUser', select: 'fullName name employeeId department' },
          { path: 'returnHandler', select: 'fullName name employeeId' },
        ]
      })
      .populate({
        path: 'returnIds',
        populate: [
          { path: 'fromUser', select: 'fullName name employeeId department' },
          { path: 'returnHandler', select: 'fullName name employeeId' },
        ]
      });
    }

    // 3. Fallback: If not found by transactionId, check if txnId matches returnId or returnIds
    if (!storeTask) {
      const queryList = [];
      if (mongoose.isValidObjectId(txnId)) {
        queryList.push({ returnId: txnId }, { returnIds: txnId });
      }

      const retDoc = await Return.findOne({
        $or: [
          { transactionId: txnId },
          { bulkReturnId: txnId },
          { barcode: txnId },
          ...(mongoose.isValidObjectId(txnId) ? [{ _id: txnId }] : [])
        ]
      });

      if (retDoc) {
        queryList.push({ returnId: retDoc._id }, { returnIds: retDoc._id });
        if (retDoc.transactionId && !taskTypeParam) {
          const pTxn = await Transaction.findOne({ transactionId: retDoc.transactionId });
          if (pTxn) queryList.push({ transactionId: pTxn._id });
        }
      }

      if (queryList.length > 0) {
        storeTask = await StoreTask.findOne({
          $or: queryList,
          ...taskTypeQuery,
          ...companyQuery
        })
        .sort({ updatedAt: -1 })
        .populate('assignedTo', 'fullName name employeeId role')
        .populate({
          path: 'transactionId',
          populate: [
            { path: 'requester', select: 'fullName name employeeId department' },
            { path: 'handler', select: 'fullName name employeeId' },
            { path: 'store', select: 'fullName name employeeId' },
          ]
        })
        .populate({
          path: 'returnId',
          populate: [
            { path: 'fromUser', select: 'fullName name employeeId department' },
            { path: 'returnHandler', select: 'fullName name employeeId' },
          ]
        })
        .populate({
          path: 'returnIds',
          populate: [
            { path: 'fromUser', select: 'fullName name employeeId department' },
            { path: 'returnHandler', select: 'fullName name employeeId' },
          ]
        });
      }
    }

    if (!storeTask) {
      return res.status(200).json({ success: true, data: null });
    }

    res.status(200).json({ success: true, data: storeTask });
  } catch (error) {
    next(error);
  }
};

// @desc    Assign / Escalate a task
// @route   POST /api/v1/material/store-tasks/escalate
// @access  Private (Store TL)
exports.escalateTask = async (req, res, next) => {
  try {
    const { transactionId, taskType, returnId, returnIds, assignedTo } = req.body;
    const mongoose = require('mongoose');

    // Resolve Transaction ObjectId if provided
    let targetTxn = null;
    if (transactionId) {
      if (mongoose.isValidObjectId(transactionId)) {
        targetTxn = await Transaction.findById(transactionId);
      }
      if (!targetTxn) {
        targetTxn = await Transaction.findOne({ transactionId: String(transactionId) });
      }
    }

    const retIds = (Array.isArray(returnIds) && returnIds.length > 0)
      ? returnIds
      : (returnId ? [returnId] : []);

    if (!targetTxn && retIds.length > 0) {
      const rDoc = await Return.findById(retIds[0]);
      if (rDoc && rDoc.transactionId) {
        targetTxn = await Transaction.findOne({ transactionId: rDoc.transactionId });
      }
    }

    const storeTask = await StoreTask.create({
      companyId: req.user.companyId,
      transactionId: targetTxn ? targetTxn._id : (mongoose.isValidObjectId(transactionId) ? transactionId : null),
      taskType: taskType || 'DISPATCH',
      returnId: retIds.length > 0 ? retIds[0] : null,
      returnIds: retIds,
      assignedTo,
      assignedBy: req.user._id,
      status: 'ESCALATED',
      escalated: true,
    });

    // Update Transaction and/or Return to mark the assigned store user
    if (taskType === 'DISPATCH' && targetTxn) {
      await Transaction.updateOne(
        { _id: targetTxn._id },
        { $set: { assignedStoreUser: assignedTo } }
      );
    } else if (taskType === 'RETURN') {
      if (retIds.length > 0) {
        await Return.updateMany(
          { _id: { $in: retIds } },
          { $set: { assignedStoreUser: assignedTo } }
        );
        const sampleRet = await Return.findById(retIds[0]);
        if (sampleRet && sampleRet.bulkReturnId) {
          await Return.updateMany(
            { bulkReturnId: sampleRet.bulkReturnId },
            { $set: { assignedStoreUser: assignedTo } }
          );
        }
      }
      if (targetTxn) {
        await Return.updateMany(
          { transactionId: targetTxn.transactionId },
          { $set: { assignedStoreUser: assignedTo } }
        );
        await Transaction.updateOne(
          { _id: targetTxn._id },
          { $set: { assignedStoreUser: assignedTo } }
        );
      }
    }

    res.status(200).json({ success: true, data: storeTask });
  } catch (error) {
    next(error);
  }
};

// @desc    Submit task for check
// @route   POST /api/v1/material/store-tasks/:id/submit
// @access  Private (Store Employee / TL)
exports.submitTaskForCheck = async (req, res, next) => {
  try {
    const { checklistData } = req.body;
    const storeTask = await StoreTask.findById(req.params.id);

    if (!storeTask) return next(new ErrorResponse('Task not found', 404));

    storeTask.status = 'SUBMITTED_FOR_CHECK';
    storeTask.checklistData = checklistData;
    await storeTask.save();

    const Transaction = require('../models/Transaction');
    const ReturnModel = require('../models/Return');
    const mongoose = require('mongoose');

    if (storeTask.taskType === 'RETURN') {
      // Update Return documents to 'ready_for_return_checklist'
      const retIdList = storeTask.returnIds && storeTask.returnIds.length > 0
        ? storeTask.returnIds
        : (storeTask.returnId ? [storeTask.returnId] : []);

      let bulkRetId = null;
      if (retIdList.length > 0) {
        const sampleRet = await ReturnModel.findById(retIdList[0]);
        bulkRetId = sampleRet?.bulkReturnId || null;
      }
      const retFilter = bulkRetId ? { bulkReturnId: bulkRetId } : (retIdList.length > 0 ? { _id: { $in: retIdList } } : null);

      if (retFilter) {
        await ReturnModel.updateMany(
          retFilter,
          { 
            $set: { 
              status: 'ready_for_return_checklist',
              ...(storeTask.assignedTo ? { assignedStoreUser: storeTask.assignedTo } : (req.user?._id ? { assignedStoreUser: req.user._id } : {}))
            } 
          }
        );
      }

      if (storeTask.transactionId) {
        await Transaction.updateOne(
          { _id: storeTask.transactionId },
          { 
            $set: { 
              status: 'ready_for_return_checklist',
              ...(storeTask.assignedTo ? { assignedStoreUser: storeTask.assignedTo } : (req.user?._id ? { assignedStoreUser: req.user._id } : {}))
            } 
          }
        );
      }
    } else {
      // Dispatch task: update Transaction to 'ready_for_dispatch_checklist'
      const query = mongoose.isValidObjectId(storeTask.transactionId)
        ? { _id: storeTask.transactionId }
        : { transactionId: storeTask.transactionId };
      
      await Transaction.updateOne(
        query,
        { 
          $set: { 
            status: 'ready_for_dispatch_checklist',
            ...(storeTask.assignedTo ? { assignedStoreUser: storeTask.assignedTo } : (req.user?._id ? { assignedStoreUser: req.user._id } : {}))
          } 
        }
      );
    }

    res.status(200).json({ success: true, data: storeTask });
  } catch (error) {
    next(error);
  }
};

// @desc    Approve task
// @route   POST /api/v1/material/store-tasks/:id/approve
// @access  Private (Store TL)
exports.approveTask = async (req, res, next) => {
  try {
    const storeTask = await StoreTask.findById(req.params.id)
      .populate({
        path: 'transactionId',
        populate: { path: 'requester', select: 'fullName name employeeId department' }
      })
      .populate({
        path: 'returnId',
        populate: { path: 'fromUser', select: 'fullName name employeeId department' }
      });

    if (!storeTask) return next(new ErrorResponse('Task not found', 404));

    const txn = storeTask.transactionId;
    if (storeTask.taskType === 'DISPATCH' && !txn) {
      return next(new ErrorResponse('Associated transaction not found', 404));
    }

    let storeConfig = await StoreConfiguration.findOne({ companyId: req.user.companyId });
    if (!storeConfig) {
      storeConfig = { tallyGodownName: 'GOKUL SHIRGAON' };
    }

    const isSuperAdmin = ['super_admin', 'company_admin', 'admin'].includes(req.user.role) || req.user.scope === 'GLOBAL';
    const isConfiguredStoreTL = storeConfig?.teamLead && String(storeConfig.teamLead) === String(req.user._id);

    if (!isSuperAdmin && !isConfiguredStoreTL) {
      return next(new ErrorResponse('Not authorized. Only the configured Store Team Lead can approve the final checklist.', 403));
    }

    const defaultStoreGodown = storeConfig.tallyGodownName || 'GOKUL SHIRGAON';
    let tallyVoucherNumber = null;

    if (storeTask.taskType === 'DISPATCH') {
      const chkData = storeTask.checklistData || {};
      const dispatchMethod = chkData.dispatchMethod || 'direct';
      const handlerId = chkData.handlerId;
      const formMaterials = chkData.materials;
      const receiverId = chkData.receiver;
      const docPhotos = chkData.photos;
      const expectedReturnDate = chkData.expectedReturnDate;
      const remarks = chkData.remarks;
      const documentType = chkData.documentType;

      const isHandlerDispatch = (dispatchMethod === 'handler' || dispatchMethod === 'HANDLER') && handlerId;

      // 1. Update materials and barcodes from checklist form data if provided
      if (Array.isArray(formMaterials) && formMaterials.length > 0) {
        txn.materials = formMaterials.map((m) => ({
          name: m.name,
          description: m.description || '',
          quantity: Number(m.quantity) || 1,
          unit: m.unit || 'pcs',
          price: Number(m.price) || 0,
          barcodes: (m.barcodes || []).map((bcStr) => ({
            barcode: typeof bcStr === 'string' ? bcStr.trim() : String(bcStr.barcode || bcStr.code || '').trim(),
            status: 'pending_acceptance',
            owner: txn.requester?._id || txn.requester,
          })),
          photos: m.photos || [],
        }));
      }

      // Update secondary dispatch fields on txn
      if (receiverId) txn.receiver = receiverId;
      if (docPhotos && docPhotos.length > 0) txn.photos = docPhotos;
      if (expectedReturnDate) txn.expectedReturnDate = expectedReturnDate;
      if (documentType) txn.documentType = documentType;
      if (remarks) txn.remarks = remarks;

      // 2. Resolve accurate Godown names
      const sourceGodown = defaultStoreGodown;
      const requesterName = txn.requester?.fullName || txn.requester?.name || 'Main Location';
      const destGodown = txn.requesterGodownName || requesterName;
      const voucherDate = new Date();

      // 3. Generate actual Tally Voucher using Godown Transfer (fetch directly from live Tally)
      let rawVoucher = null;
      try {
        const tallyResult = await createTallyGodownTransfer(
          txn.transactionId,
          'transfer',
          sourceGodown,
          destGodown,
          txn.materials,
          voucherDate
        );
        rawVoucher = typeof tallyResult === 'string'
          ? tallyResult
          : (tallyResult?.voucherNumber || tallyResult?.vNum || null);
      } catch (tallyErr) {
        console.warn('Tally voucher creation error (non-blocking):', tallyErr.message);
      }

      // Only assign real voucher number from live Tally - never use dummy fallbacks
      tallyVoucherNumber = rawVoucher || null;
      storeTask.tallyVoucherNumber = tallyVoucherNumber;

      // 4. Register or update barcodes in Barcode collection
      if (Array.isArray(formMaterials) && formMaterials.length > 0) {
        for (const mat of formMaterials) {
          for (const bc of (mat.barcodes || [])) {
            const bcStr = typeof bc === 'string' ? bc.trim() : String(bc.barcode || bc.code || '').trim();
            if (!bcStr) continue;
            const existingBc = await Barcode.findOne({ companyId: req.user.companyId, barcode: bcStr });
            if (existingBc) {
              existingBc.transactionId = txn.transactionId;
              existingBc.transaction = txn._id;
              existingBc.materialName = mat.name;
              existingBc.status = 'pending_acceptance';
              existingBc.owner = txn.requester?._id || txn.requester;
              existingBc.ownerDepartment = txn.department;
              existingBc.ownershipHistory = existingBc.ownershipHistory || [];
              existingBc.ownershipHistory.push({
                user: txn.requester?._id || txn.requester,
                department: txn.department,
                action: 'dispatched',
                remarks: 'Dispatched from store - Pending requester acceptance',
              });
              existingBc.history = existingBc.history || [];
              existingBc.history.push({
                action: 'Dispatched from Store',
                user: req.user._id,
                remarks: `Dispatched from store via TL Final Checklist approval${tallyVoucherNumber ? ` - Voucher ${tallyVoucherNumber}` : ''}`,
              });
              await existingBc.save();
            } else {
              await Barcode.create({
                companyId: req.user.companyId,
                barcode: bcStr,
                transactionId: txn.transactionId,
                transaction: txn._id,
                materialName: mat.name,
                customerName: txn.customerName || '',
                purpose: txn.purpose || '',
                jobCardPhoto: txn.jobCardPhoto || (txn.jobCardPhotos?.[0] || ''),
                jobCardPhotos: txn.jobCardPhotos || (txn.jobCardPhoto ? [txn.jobCardPhoto] : []),
                previousJobCardPhoto: txn.previousJobCardPhoto || (txn.previousJobCardPhotos?.[0] || ''),
                previousJobCardPhotos: txn.previousJobCardPhotos || (txn.previousJobCardPhoto ? [txn.previousJobCardPhoto] : []),
                warrantyFormPhoto: txn.warrantyFormPhoto || (txn.warrantyFormPhotos?.[0] || ''),
                warrantyFormPhotos: txn.warrantyFormPhotos || (txn.warrantyFormPhoto ? [txn.warrantyFormPhoto] : []),
                status: 'pending_acceptance',
                owner: txn.requester?._id || txn.requester,
                ownerDepartment: txn.department,
                ownershipHistory: [
                  {
                    user: txn.requester?._id || txn.requester,
                    department: txn.department,
                    action: 'created',
                    remarks: 'Dispatched from store - Pending requester acceptance',
                  },
                ],
                history: [
                  {
                    action: 'Dispatched from Store',
                    user: req.user._id,
                    remarks: `Dispatched from store via TL Final Checklist approval${tallyVoucherNumber ? ` - Voucher ${tallyVoucherNumber}` : ''}`,
                  },
                ],
              });
            }
          }
        }
      } else {
        // Fallback: update any existing barcodes in txn.materials
        const barcodes = (txn.materials || []).reduce((acc, curr) => acc.concat((curr.barcodes || []).map(b => b.barcode).filter(Boolean)), []);
        if (barcodes.length > 0) {
          await Barcode.updateMany(
            { companyId: req.user.companyId, barcode: { $in: barcodes } },
            { $set: { owner: txn.requester?._id || txn.requester, status: 'pending_acceptance' } }
          );
        }
      }

      // 5. Update Transaction status, dispatch timestamp, voucher number, and history timeline
      if (isHandlerDispatch) {
        txn.status = 'handler_assigned';
        txn.handler = handlerId;
        txn.dispatchMethod = 'handler';
        txn.handlerAccepted = false;
        txn.handlerStatus = 'assigned';
        if (!txn.chatMembers) txn.chatMembers = [];
        if (!txn.chatMembers.includes(handlerId)) {
          txn.chatMembers.push(handlerId);
        }
      } else {
        txn.status = 'dispatched';
        txn.handler = null;
        txn.dispatchMethod = 'direct';
        txn.handlerStatus = 'dispatched_direct';
      }

      txn.dispatchedAt = new Date();
      txn.dispatchedBy = req.user._id;
      txn.tallyVoucherNumber = tallyVoucherNumber || '';
      txn.tallyStatus = rawVoucher ? 'synced' : 'pending';

      txn.timeline = txn.timeline || [];
      txn.timeline.push({
        action: isHandlerDispatch ? 'Assigned Handler for Dispatch' : 'Store Dispatched Materials',
        description: `Final checklist verified and approved by Team Lead ${req.user.fullName || req.user.name || 'Store TL'}. Materials ${isHandlerDispatch ? 'assigned to handler' : 'dispatched direct to requester'} from store warehouse (${sourceGodown} -> ${destGodown}).${tallyVoucherNumber ? ` Voucher: ${tallyVoucherNumber}.` : ''}`,
        user: req.user._id,
        timestamp: new Date(),
        metadata: {
          tallyVoucherNumber,
          sourceGodown,
          destGodown,
          storeTaskId: storeTask._id,
          dispatchMethod: isHandlerDispatch ? 'handler' : 'direct'
        }
      });
      await txn.save();

      // Notifications
      if (!isHandlerDispatch && txn.requester) {
        const requesterId = txn.requester?._id || txn.requester;
        await sendNotification(
          req.user.companyId,
          requesterId,
          'material_dispatched',
          'Materials Dispatched Direct',
          `Your requested materials for ${txn.transactionId} have been dispatched directly to you from store. Please inspect and receive materials.`,
          txn.transactionId
        );
      } else if (isHandlerDispatch && handlerId) {
        await sendNotification(
          req.user.companyId,
          handlerId,
          'handler_assigned',
          'Handler Job Assigned',
          `You have been assigned to deliver materials for request ${txn.transactionId}`,
          txn.transactionId
        );
      }

      // 5. Create immutable AuditLog for Material Movement Logs feed
      try {
        await AuditLog.create({
          companyId: req.user.companyId,
          action: 'STORE_DISPATCH',
          entity: 'Transaction',
          entityId: txn.transactionId,
          user: req.user._id,
          userName: req.user.fullName || req.user.name || 'Store Team Lead',
          description: `Store warehouse dispatched materials for requisition ${txn.transactionId} (${sourceGodown} -> ${destGodown}). Tally Voucher: ${tallyVoucherNumber}.`,
          after: {
            status: txn.status,
            dispatchMethod: txn.dispatchMethod,
            tallyVoucherNumber,
            dispatchedAt: txn.dispatchedAt,
            storeTaskId: storeTask._id
          }
        });
      } catch (auditErr) {
        console.warn('AuditLog creation warning in approveTask:', auditErr.message);
      }

    } else if (storeTask.taskType === 'RETURN') {
      const retIdList = storeTask.returnIds && storeTask.returnIds.length > 0
        ? storeTask.returnIds
        : (storeTask.returnId ? [storeTask.returnId] : []);

      let allReturns = await Return.find({ _id: { $in: retIdList } }).populate('fromUser', 'fullName name');
      if (allReturns.length > 0 && allReturns[0].bulkReturnId) {
        allReturns = await Return.find({ bulkReturnId: allReturns[0].bulkReturnId }).populate('fromUser', 'fullName name');
      }
      
      if (allReturns.length > 0) {
        const barcodesToReturn = allReturns.map(r => r.barcode).filter(Boolean);

        // Build materials list for Tally Godown Transfer voucher
        const returnMaterials = [];
        for (const retItem of allReturns) {
          const bcDoc = await Barcode.findOne({ barcode: retItem.barcode, companyId: req.user.companyId });
          returnMaterials.push({
            name: bcDoc?.materialName || 'Returned Material',
            quantity: 1,
            unit: bcDoc?.unit || 'pcs',
            price: bcDoc?.price || 0,
            barcodes: [retItem.barcode],
          });
        }

        const returnUserName = allReturns[0]?.fromUser?.fullName || allReturns[0]?.fromUser?.name || 'Main Location';
        const sourceGodown = returnUserName;
        const destGodown = defaultStoreGodown;
        const voucherDate = new Date();

        let rawVoucher = allReturns[0]?.tallyVoucherNumber || null;
        if (!rawVoucher) {
          try {
            const tallyResult = await createTallyGodownTransfer(
              allReturns[0]?.bulkReturnId || allReturns[0]?.transactionId || String(storeTask._id),
              'return',
              sourceGodown,
              destGodown,
              returnMaterials,
              voucherDate
            );
            rawVoucher = typeof tallyResult === 'string'
              ? tallyResult
              : (tallyResult?.voucherNumber || tallyResult?.vNum || null);
          } catch (tallyErr) {
            console.warn('Tally return voucher creation error:', tallyErr.message);
          }
          if (!rawVoucher) {
            return next(new ErrorResponse('Tally voucher creation failed. Cannot complete return without Tally entry. Tally Prime may be offline.', 400));
          }
        }

        tallyVoucherNumber = rawVoucher;
        storeTask.tallyVoucherNumber = tallyVoucherNumber;

        // Update each barcode with history and ownership
        const ExchangeRequest = require('../models/ExchangeRequest');
        for (const r of allReturns) {
          const bc = await Barcode.findOne({ barcode: r.barcode, companyId: req.user.companyId });
          if (bc) {
            bc.status = 'Returned';
            bc.owner = req.user._id;
            bc.history = bc.history || [];
            bc.history.push({
              action: 'Returned to Store (TL Approved)',
              user: req.user._id,
              remarks: `Final checklist verified and approved by ${req.user.fullName || req.user.name || 'Store TL'}${tallyVoucherNumber ? `. Voucher: ${tallyVoucherNumber}` : ''}`,
              timestamp: new Date()
            });
            bc.ownershipHistory = bc.ownershipHistory || [];
            bc.ownershipHistory.push({
              user: req.user._id,
              action: 'returned',
              remarks: `Returned to store${tallyVoucherNumber ? `. Voucher: ${tallyVoucherNumber}` : ''}`,
            });
            await bc.save();

            await ExchangeRequest.findOneAndUpdate(
              { companyId: req.user.companyId, oldBarcode: bc.barcode, status: 'approved' },
              { returnStatus: 'accepted_by_store' }
            );
          }
        }

        const allTargetRetIds = allReturns.map(r => r._id);
        await Return.updateMany(
          { _id: { $in: allTargetRetIds } },
          { 
            $set: { 
              status: 'completed',
              ...(tallyVoucherNumber ? { tallyVoucherNumber } : {})
            } 
          }
        );

        if (storeTask.transactionId) {
          const txnDoc = await Transaction.findById(storeTask.transactionId);
          if (txnDoc) {
            txnDoc.materials = (txnDoc.materials || []).map(m => {
              if (m.barcodes) {
                m.barcodes = m.barcodes.map(b => {
                  const bStr = typeof b === 'string' ? b : (b.barcode || b._id?.toString());
                  if (barcodesToReturn.includes(bStr)) {
                    b.status = 'Returned';
                  }
                  return b;
                });
              }
              return m;
            });
            txnDoc.returnedItems = (txnDoc.returnedItems || 0) + barcodesToReturn.length;

            const remainingActiveCount = await Barcode.countDocuments({
              transactionId: txnDoc.transactionId,
              status: { $in: ['Active', 'issued', 'Exchanged'] },
              companyId: req.user.companyId,
            });

            if (remainingActiveCount === 0) {
              txnDoc.status = 'closed';
              txnDoc.activeItems = 0;
              txnDoc.closedAt = new Date();
              txnDoc.closedBy = req.user._id;
              txnDoc.chatLocked = true;
            } else {
              txnDoc.status = 'partially_returned';
              txnDoc.activeItems = remainingActiveCount;
            }
            if (tallyVoucherNumber) {
              txnDoc.tallyVoucherNumber = tallyVoucherNumber;
            }
            await txnDoc.save();
          }
        }

        // Create immutable AuditLog for Return in Material Movement Logs
        try {
          await AuditLog.create({
            companyId: req.user.companyId,
            action: 'RETURN_COMPLETED',
            entity: 'Return',
            entityId: allReturns.map(r => r.barcode).join(', '),
            user: req.user._id,
            userName: req.user.fullName || req.user.name || 'Store Team Lead',
            description: `Store return verified and completed for barcode(s) ${allReturns.map(r => r.barcode).join(', ')} (${sourceGodown} -> ${destGodown}).${tallyVoucherNumber ? ` Voucher: ${tallyVoucherNumber}.` : ''}`,
            after: {
              status: 'completed',
              tallyVoucherNumber,
              storeTaskId: storeTask._id
            }
          });
        } catch (auditErr) {
          console.warn('AuditLog creation warning for return in approveTask:', auditErr.message);
        }
      }
    }

    storeTask.status = 'APPROVED';
    storeTask.completedAt = new Date();
    await storeTask.save();

    res.status(200).json({
      success: true,
      data: storeTask,
      tallyVoucherNumber: tallyVoucherNumber || null,
      voucherNumber: tallyVoucherNumber || null
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Send back task
// @route   POST /api/v1/material/store-tasks/:id/send-back
// @access  Private (Store TL)
exports.sendBackTask = async (req, res, next) => {
  try {
    const storeTask = await StoreTask.findById(req.params.id);
    if (!storeTask) return next(new ErrorResponse('Task not found', 404));

    const uRole = String(req.user?.role || '').toLowerCase().trim();
    const uRoleNorm = uRole.replace(/[-_ ]/g, '');
    const uRoleCode = String(req.user?.roleCode || '').toUpperCase().trim();

    const isSuperAdmin = ['super_admin', 'superadmin', 'company_admin', 'admin', 'store', 'store_admin', 'tcsa1'].includes(uRole) ||
      ['superadmin', 'companyadmin', 'admin', 'storeadmin'].includes(uRoleNorm) ||
      ['TCSA1', 'TCCA1', 'SUPER_ADMIN', 'COMPANY_ADMIN', 'ADMIN', 'STORE_ADMIN', 'TCSTR1'].includes(uRoleCode) ||
      req.user?.isSuperAdmin === true ||
      req.user?.isAdmin === true ||
      req.user?.scope === 'GLOBAL' ||
      uRole.includes('admin') ||
      uRole.includes('team_lead');

    const storeConfig = await StoreConfiguration.findOne({ companyId: req.user?.companyId || req.tenant?.companyId });
    const cfgTlId = storeConfig?.teamLead ? String(typeof storeConfig.teamLead === 'object' ? (storeConfig.teamLead._id || storeConfig.teamLead.id) : storeConfig.teamLead) : '';
    const isConfiguredStoreTL = cfgTlId && cfgTlId === String(req.user?._id || req.user?.id);

    if (!isSuperAdmin && !isConfiguredStoreTL) {
      return next(new ErrorResponse('Not authorized. Only the configured Store Team Lead can send back the checklist.', 403));
    }

    const reason = (req.body.reason || '').trim();
    const tlName = req.user.fullName || req.user.name || 'Store Team Lead';

    // 1. Update StoreTask status and reason
    storeTask.status = 'ESCALATED'; // Send back to employee
    storeTask.sendBackReason = reason;
    await storeTask.save();

    // 2. Revert Transaction.status back to 'mgt_approved' (for dispatch) or 'active' (for return)
    const mongoose = require('mongoose');
    let txn = null;
    if (storeTask.transactionId) {
      const txnQuery = mongoose.isValidObjectId(storeTask.transactionId)
        ? { _id: storeTask.transactionId }
        : { transactionId: storeTask.transactionId };
      txn = await Transaction.findOne(txnQuery);
    }

    if (storeTask.taskType === 'RETURN') {
      const retIdList = storeTask.returnIds && storeTask.returnIds.length > 0
        ? storeTask.returnIds
        : (storeTask.returnId ? [storeTask.returnId] : []);
      let bulkRetId = null;
      if (retIdList.length > 0) {
        const sampleRet = await Return.findById(retIdList[0]);
        bulkRetId = sampleRet?.bulkReturnId || null;
      }
      const orConditions = [];
      if (bulkRetId) orConditions.push({ bulkReturnId: bulkRetId });
      if (retIdList.length > 0) orConditions.push({ _id: { $in: retIdList } });
      orConditions.push({ storeTaskId: storeTask._id });
      if (storeTask.transactionId) {
        orConditions.push({ transactionId: storeTask.transactionId, status: { $in: ['ready_for_return_checklist', 'submitted_for_check'] } });
      }
      if (txn && txn.transactionId) {
        orConditions.push({ transactionId: txn.transactionId, status: { $in: ['ready_for_return_checklist', 'submitted_for_check'] } });
      }
      if (txn && txn._id) {
        orConditions.push({ transactionId: String(txn._id), status: { $in: ['ready_for_return_checklist', 'submitted_for_check'] } });
      }
      const retQuery = orConditions.length > 0 ? { $or: orConditions } : null;
      if (retQuery) {
        await Return.updateMany(
          retQuery,
          { 
            $set: { 
              status: 'pending', 
              remarks: reason || 'Sent back by Store TL for correction' 
            },
            $push: {
              timeline: {
                action: 'Return Task Sent Back by Team Lead',
                description: `Return task sent back by Team Lead ${tlName} for corrections${reason ? `: "${reason}"` : '.'}`,
                user: req.user._id,
                timestamp: new Date(),
                metadata: {
                  reason,
                  storeTaskId: storeTask._id,
                  sentBackBy: tlName
                }
              }
            }
          }
        );
      }

      if (txn) {
        txn.status = 'active';
        txn.timeline = txn.timeline || [];
        txn.timeline.push({
          action: 'Return Task Sent Back by Team Lead',
          description: `Return task sent back by Team Lead ${tlName} for corrections${reason ? `: "${reason}"` : '.'}`,
          user: req.user._id,
          timestamp: new Date(),
          metadata: {
            reason,
            storeTaskId: storeTask._id,
            sentBackBy: tlName
          }
        });
        await txn.save();
      } else if (storeTask.transactionId) {
        const tId = storeTask.transactionId;
        const txnFilter = mongoose.isValidObjectId(tId) ? { _id: tId } : { transactionId: tId };
        await Transaction.updateOne(txnFilter, { $set: { status: 'active' } });
      }
    } else if (txn) {
      txn.status = 'mgt_approved';
      if (reason) {
        txn.storeRemark = reason;
      }

      // 3. Append timeline entry
      txn.timeline = txn.timeline || [];
      txn.timeline.push({
        action: 'Task Sent Back by Team Lead',
        description: `Task sent back by Team Lead ${tlName} for corrections${reason ? `: "${reason}"` : '.'}`,
        user: req.user._id,
        timestamp: new Date(),
        metadata: {
          reason,
          storeTaskId: storeTask._id,
          sentBackBy: tlName
        }
      });
      await txn.save();

      // 4. Audit Log for Material Movement Logs
      try {
        await AuditLog.create({
          companyId: req.user.companyId,
          action: 'STORE_TASK_SENT_BACK',
          entity: 'Transaction',
          entityId: txn.transactionId,
          user: req.user._id,
          userName: tlName,
          description: `Store task for requisition ${txn.transactionId} sent back by Team Lead ${tlName} for corrections${reason ? `: "${reason}"` : '.'}`,
          after: {
            status: 'mgt_approved',
            reason,
            storeTaskId: storeTask._id
          }
        });
      } catch (auditErr) {
        console.warn('AuditLog creation warning in sendBackTask:', auditErr.message);
      }
    }

    res.status(200).json({ success: true, data: storeTask });
  } catch (error) {
    next(error);
  }
};

exports.getStoreEmployees = async (req, res) => {
  try {
    const storeConfig = await StoreConfiguration.findOne({ companyId: req.user.companyId })
      .populate('employees', '_id id name fullName email role')
      .populate('teamLead', '_id id name fullName email role');
      
    if (!storeConfig) {
      return res.json({ success: true, data: { teamLead: null, employees: [] } });
    }
    return res.json({ success: true, data: { teamLead: storeConfig.teamLead, employees: storeConfig.employees || [] } });
  } catch (error) {
    console.error('getStoreEmployees error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Get task by task ID
// @route   GET /api/v1/material/store-tasks/:id
// @access  Private
exports.getStoreTaskById = async (req, res, next) => {
  try {
    const storeTask = await StoreTask.findById(req.params.id)
      .populate('assignedTo', 'fullName name employeeId role')
      .populate('transactionId')
      .populate('returnId')
      .populate('returnIds');

    if (!storeTask) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }

    res.status(200).json({ success: true, data: storeTask });
  } catch (error) {
    next(error);
  }
};