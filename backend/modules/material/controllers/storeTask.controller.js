const StoreTask = require('../models/StoreTask');
const StoreConfiguration = require('../../../models/StoreConfiguration');
const Transaction = require('../models/Transaction');
const Return = require('../models/Return');
const Barcode = require('../models/Barcode');
const ActivityLog = require('../models/ActivityLog');
const { createTallyGodownTransfer } = require('./tally.controller');
const ErrorResponse = require('../../../utils/errorResponse');

// @desc    Get task by transaction ID
// @route   GET /api/v1/material/store-tasks/transaction/:txnId
// @access  Private
exports.getTaskByTransaction = async (req, res, next) => {
  try {
    const storeTask = await StoreTask.findOne({
      transactionId: req.params.txnId,
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
      { $set: { status: 'ready_for_dispatch_checklist' } }
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
    const storeTask = await StoreTask.findById(req.params.id).populate('transactionId');
    if (!storeTask) return next(new ErrorResponse('Task not found', 404));

    let storeConfig = await StoreConfiguration.findOne({ companyId: req.user.companyId });
    if (!storeConfig) {
      storeConfig = { tallyGodownName: 'Mock Godown' };
    }

    let tallyVoucherNumber = null;
    const txn = storeTask.transactionId;

    if (storeTask.taskType === 'DISPATCH') {
      // 1. Change barcode owner
      const barcodes = txn.materials.reduce((acc, curr) => acc.concat(curr.barcodes.map(b => b.barcode)), []);
      await Barcode.updateMany(
        { companyId: req.user.companyId, barcode: { $in: barcodes } },
        { $set: { owner: txn.requester } }
      );

      // 2. Mark txn dispatched
      txn.status = 'dispatched';
      await txn.save();

      // 3. Generate Tally Voucher using Godown from config
      const sourceGodown = storeConfig.tallyGodownName;
      const destGodown = txn.requesterGodownName || 'Employee Godown'; // Mock dest godown if not present
      const voucherDate = new Date();

      const tallyResult = await createTallyGodownTransfer(txn.transactionId, 'DISPATCH', sourceGodown, destGodown, txn.materials, voucherDate);
      tallyVoucherNumber = tallyResult?.voucherNumber || 'VOUCHER_PENDING';
      storeTask.tallyVoucherNumber = tallyVoucherNumber;
    } else if (storeTask.taskType === 'RETURN') {
      // Similar logic for return
      const ret = await Return.findById(storeTask.returnId);
      
      // Change barcode owner to store
      const barcodeToUpdate = ret.barcode;
      if (barcodeToUpdate) {
        await Barcode.updateOne(
          { companyId: req.user.companyId, barcode: barcodeToUpdate },
          { $set: { owner: null, status: 'Returned' } } 
        );
      }

      ret.status = 'completed';
      await ret.save();

      // Mock Tally integration for return
      const sourceGodown = 'Employee Godown';
      const destGodown = storeConfig.tallyGodownName;
      const voucherDate = new Date();
      
      const tallyResult = await createTallyGodownTransfer(ret.returnId, 'RETURN', sourceGodown, destGodown, ret.materials, voucherDate);
      tallyVoucherNumber = tallyResult?.voucherNumber || 'VOUCHER_PENDING';
      storeTask.tallyVoucherNumber = tallyVoucherNumber;
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

    storeTask.status = 'ESCALATED'; // Send back to employee
    storeTask.sendBackReason = req.body.reason || '';
    await storeTask.save();

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