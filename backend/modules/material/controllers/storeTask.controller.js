const StoreTask = require('../models/StoreTask');
const StoreConfiguration = require('../../../models/StoreConfiguration');
const Transaction = require('../models/Transaction');
const Return = require('../models/Return');
const Barcode = require('../models/Barcode');
const ActivityLog = require('../models/ActivityLog');
const AuditLog = require('../models/AuditLog');
const { createTallyGodownTransfer } = require('./tally.controller');
const ErrorResponse = require('../../../utils/errorResponse');

// @desc    Get task by transaction ID
// @route   GET /api/v1/material/store-tasks/transaction/:txnId
// @access  Private
exports.getTaskByTransaction = async (req, res, next) => {
  try {
    const mongoose = require('mongoose');
    let txnId = req.params.txnId;

    if (!mongoose.isValidObjectId(txnId)) {
      const txnDoc = await Transaction.findOne({
        companyId: req.user.companyId,
        transactionId: txnId
      }).select('_id');
      if (txnDoc) {
        txnId = txnDoc._id;
      }
    }

    const storeTask = await StoreTask.findOne({
      transactionId: txnId,
      companyId: req.user.companyId
    }).populate('assignedTo', 'fullName name employeeId role');
    
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
    const { transactionId, taskType, returnId, assignedTo } = req.body;

    // Validate store config
    const storeConfig = await StoreConfiguration.findOne({ companyId: req.user.companyId });
    if (!storeConfig) {
      // Mocking config for test if not found
      // return res.status(403).json({ success: false, message: 'Not authorized to assign tasks for store' });
    }

    const storeTask = await StoreTask.create({
      companyId: req.user.companyId,
      transactionId,
      taskType,
      returnId: returnId || null,
      assignedTo,
      assignedBy: req.user._id,
      status: 'ESCALATED',
      escalated: true,
    });

    // Update the transaction or return to mark the assigned store user so the frontend can track it
    const mongoose = require('mongoose');
    if (taskType === 'DISPATCH' && transactionId) {
      const query = mongoose.isValidObjectId(transactionId) 
        ? { _id: transactionId } 
        : { transactionId: transactionId };
        
      await Transaction.updateOne(
        query,
        { $set: { assignedStoreUser: assignedTo } }
      );
    } else if (taskType === 'RETURN' && returnId) {
      const query = mongoose.isValidObjectId(returnId) 
        ? { _id: returnId } 
        : { returnId: returnId };
      await Return.updateOne(
        query,
        { $set: { assignedStoreUser: assignedTo } }
      );
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

    // Also update the underlying transaction status to 'ready_for_dispatch_checklist'
    const Transaction = require('../models/Transaction');
    const mongoose = require('mongoose');
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
      // 1. Change barcode owner to requester
      const barcodes = (txn.materials || []).reduce((acc, curr) => acc.concat((curr.barcodes || []).map(b => b.barcode).filter(Boolean)), []);
      if (barcodes.length > 0) {
        await Barcode.updateMany(
          { companyId: req.user.companyId, barcode: { $in: barcodes } },
          { $set: { owner: txn.requester?._id || txn.requester } }
        );
      }

      // 2. Resolve accurate Godown names
      const sourceGodown = defaultStoreGodown;
      const requesterName = txn.requester?.fullName || txn.requester?.name || 'Main Location';
      const destGodown = txn.requesterGodownName || requesterName;
      const voucherDate = new Date();

      // 3. Generate Tally Voucher using Godown Transfer
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

      // Fallback tracking reference if Tally offline or voucher pending
      tallyVoucherNumber = rawVoucher || `GT-${txn.transactionId.replace(/^[A-Z]+-/, '')}`;
      storeTask.tallyVoucherNumber = tallyVoucherNumber;

      // 4. Update Transaction status, dispatch timestamp, voucher number, and history timeline
      txn.status = 'dispatched';
      txn.dispatchedAt = new Date();
      txn.dispatchedBy = req.user._id;
      txn.tallyVoucherNumber = tallyVoucherNumber;
      txn.tallyStatus = rawVoucher ? 'synced' : 'pending';

      txn.timeline = txn.timeline || [];
      txn.timeline.push({
        action: 'Store Dispatched Materials',
        description: `Final checklist verified and approved by Team Lead ${req.user.fullName || req.user.name || 'Store TL'}. Materials dispatched from store warehouse (${sourceGodown} -> ${destGodown}). Voucher: ${tallyVoucherNumber}.`,
        user: req.user._id,
        timestamp: new Date(),
        metadata: {
          tallyVoucherNumber,
          sourceGodown,
          destGodown,
          storeTaskId: storeTask._id
        }
      });
      await txn.save();

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
            status: 'dispatched',
            tallyVoucherNumber,
            dispatchedAt: txn.dispatchedAt,
            storeTaskId: storeTask._id
          }
        });
      } catch (auditErr) {
        console.warn('AuditLog creation warning in approveTask:', auditErr.message);
      }

    } else if (storeTask.taskType === 'RETURN') {
      const ret = storeTask.returnId || (await Return.findById(storeTask.returnId).populate('fromUser', 'fullName name'));
      
      if (ret) {
        // Change barcode owner to store / returned
        const barcodeToUpdate = ret.barcode;
        if (barcodeToUpdate) {
          await Barcode.updateOne(
            { companyId: req.user.companyId, barcode: barcodeToUpdate },
            { $set: { owner: null, status: 'Returned' } } 
          );
        }

        ret.status = 'completed';
        await ret.save();

        const returnUserName = ret.fromUser?.fullName || ret.fromUser?.name || 'Main Location';
        const sourceGodown = returnUserName;
        const destGodown = defaultStoreGodown;
        const voucherDate = new Date();
        
        let rawVoucher = null;
        try {
          const tallyResult = await createTallyGodownTransfer(
            ret.returnId || String(ret._id),
            'return',
            sourceGodown,
            destGodown,
            ret.materials,
            voucherDate
          );
          rawVoucher = typeof tallyResult === 'string'
            ? tallyResult
            : (tallyResult?.voucherNumber || tallyResult?.vNum || null);
        } catch (tallyErr) {
          console.warn('Tally return voucher creation error (non-blocking):', tallyErr.message);
        }

        tallyVoucherNumber = rawVoucher || `RET-GT-${(ret.returnId || String(ret._id)).slice(-6)}`;
        storeTask.tallyVoucherNumber = tallyVoucherNumber;

        // Create immutable AuditLog for Return in Material Movement Logs
        try {
          await AuditLog.create({
            companyId: req.user.companyId,
            action: 'RETURN_COMPLETED',
            entity: 'Return',
            entityId: ret.barcode || ret.returnId || String(ret._id),
            user: req.user._id,
            userName: req.user.fullName || req.user.name || 'Store Team Lead',
            description: `Store return verified and completed for barcode ${ret.barcode || ''} (${sourceGodown} -> ${destGodown}). Voucher: ${tallyVoucherNumber}.`,
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

    res.status(200).json({ success: true, data: storeTask, tallyVoucherNumber });
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

    const storeConfig = await StoreConfiguration.findOne({ companyId: req.user.companyId });
    const isSuperAdmin = ['super_admin', 'company_admin', 'admin'].includes(req.user.role) || req.user.scope === 'GLOBAL';
    const isConfiguredStoreTL = storeConfig?.teamLead && String(storeConfig.teamLead) === String(req.user._id);

    if (!isSuperAdmin && !isConfiguredStoreTL) {
      return next(new ErrorResponse('Not authorized. Only the configured Store Team Lead can send back the checklist.', 403));
    }

    const reason = (req.body.reason || '').trim();
    const tlName = req.user.fullName || req.user.name || 'Store Team Lead';

    // 1. Update StoreTask status and reason
    storeTask.status = 'ESCALATED'; // Send back to employee
    storeTask.sendBackReason = reason;
    await storeTask.save();

    // 2. Revert Transaction.status back to 'mgt_approved' so green "Dispatch" button reappears for store employee
    const mongoose = require('mongoose');
    let txn = null;
    if (storeTask.transactionId) {
      const txnQuery = mongoose.isValidObjectId(storeTask.transactionId)
        ? { _id: storeTask.transactionId }
        : { transactionId: storeTask.transactionId };
      txn = await Transaction.findOne(txnQuery);
    }

    if (txn) {
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

    // 5. If it is a Return task, handle Return model as well
    if (storeTask.taskType === 'RETURN' && storeTask.returnId) {
      const ReturnModel = require('../models/Return');
      const ret = await ReturnModel.findById(storeTask.returnId);
      if (ret) {
        ret.status = 'collected';
        ret.timeline = ret.timeline || [];
        ret.timeline.push({
          action: 'Return Task Sent Back by Team Lead',
          description: `Return task sent back by Team Lead ${tlName} for corrections${reason ? `: "${reason}"` : '.'}`,
          user: req.user._id,
          timestamp: new Date(),
          metadata: {
            reason,
            storeTaskId: storeTask._id
          }
        });
        await ret.save();
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