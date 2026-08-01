const Transaction = require('../models/Transaction');
const Barcode = require('../models/Barcode');
const ExcelJS = require('exceljs');

// Helper function to build transaction filter based on query parameters and user role permissions
const buildReportFilter = async (req) => {
  const { 
    startDate, 
    endDate, 
    department, 
    status, 
    documentType, 
    sender, 
    receiver, 
    handler, 
    barcode, 
    expectedReturnDate,
    flow,
    scope
  } = req.query;

  const filter = {};

  // Status Filter
  if (status && status !== 'all' && status !== '') {
    filter.status = status;
  }

  // Document Type Filter
  if (documentType && documentType !== 'all' && documentType !== '') {
    filter.documentType = documentType;
  }

  // Date Range (Created At)
  if (startDate && endDate) {
    filter.createdAt = { $gte: new Date(startDate), $lte: new Date(endDate) };
  } else if (startDate) {
    filter.createdAt = { $gte: new Date(startDate) };
  } else if (endDate) {
    filter.createdAt = { $lte: new Date(endDate) };
  }

  // Expected Return Date Filter
  if (expectedReturnDate) {
    const targetDate = new Date(expectedReturnDate);
    const startOfDay = new Date(targetDate.setHours(0, 0, 0, 0));
    const endOfDay = new Date(targetDate.setHours(23, 59, 59, 999));
    filter.expectedReturnDate = { $gte: startOfDay, $lte: endOfDay };
  }

  // Department Filter
  if (department && department !== 'all' && department !== '') {
    filter.department = department;
  }

  // Sender (Requester) Filter
  if (sender) {
    filter.requester = sender;
  }

  // Receiver Filter
  if (receiver) {
    if (receiver === 'other') {
      filter.receiver = null;
    } else {
      filter.receiver = receiver;
    }
  }

  // Handler Filter
  if (handler) {
    filter.handler = handler;
  }

  // Flow Filter (Sent / Received)
  if (flow === 'sent') {
    filter.requester = req.user._id;
  } else if (flow === 'received') {
    filter.receiver = req.user._id;
  }

  // Scope (Internal / External)
  if (scope === 'internal') {
    filter.receiver = { $ne: null };
  } else if (scope === 'external') {
    filter.receiver = null;
  }

  // Barcode Search
  if (barcode && barcode.trim()) {
    filter['materials.barcodes.barcode'] = { $regex: barcode.trim(), $options: 'i' };
  }

  // Role-based visibility checks
  if (req.user.role === 'employee') {
    const userBarcodes = await Barcode.find({ owner: req.user._id });
    const txnIds = userBarcodes.map(b => b.transactionId);

    // Find all return requests (even completed/delivered ones) where the user was the return handler
    const ReturnModel = require('../models/Return');
    const returnDocs = await ReturnModel.find({ returnHandler: req.user._id });
    const returnTxnIds = returnDocs.map(r => r.transactionId);

    // Employees can only see transactions they are part of (requester, receiver, handler) or own barcodes for
    const userConditions = [
      { requester: req.user._id },
      { receiver: req.user._id },
      { handler: req.user._id },
      { transactionId: { $in: [...txnIds, ...returnTxnIds] } }
    ];

    if (filter.$or) {
      filter.$and = [
        { $or: filter.$or },
        { $or: userConditions }
      ];
      delete filter.$or;
    } else {
      filter.$or = userConditions;
    }
  } else if (req.user.role === 'team_lead') {
    // Team lead only sees department's transactions
    filter.department = req.user.department._id || req.user.department;
  } else if (req.user.role === 'department_admin') {
    if (req.user.departmentAdminType === 'store' || req.user.departmentAdminType === 'management' || req.user.departmentAdminType === 'accounts') {
      // Global department admins can view all transactions
    } else {
      // Other department admins see their own department
      filter.department = req.user.department._id || req.user.department;
    }
  }

  if (req.user.role !== 'super_admin') {
    const orConditions = [
      { status: { $ne: 'rejected' } },
      { requester: req.user._id },
      { teamLead: req.user._id },
      { managementApprover: req.user._id },
      { handler: req.user._id },
      { store: req.user._id }
    ];
    if (req.user.role === 'department_admin' && req.user.departmentAdminType === 'store') {
      orConditions.push({ status: 'rejected' });
    }
    const rejectedVisibility = { $or: orConditions };
    if (filter.$and) {
      filter.$and.push(rejectedVisibility);
    } else {
      filter.$and = [rejectedVisibility];
    }
  }

  return filter;
};

exports.getTransactionReport = async (req, res) => {
  try {
    const { reportType = 'transaction' } = req.query;
    if (reportType === 'exchange') {
      const ExchangeRequest = require('../models/ExchangeRequest');
      const { barcode: bcQuery, startDate, endDate, sender, documentType } = req.query;

      const exchangeFilter = { status: 'approved' };

      if (documentType && documentType !== 'all' && documentType !== '') {
        exchangeFilter.newDocumentType = documentType;
      }

      if (bcQuery && bcQuery.trim()) {
        const queryUpper = bcQuery.trim().toUpperCase();
        exchangeFilter.$or = [
          { oldBarcode: { $regex: queryUpper, $options: 'i' } },
          { newBarcode: { $regex: queryUpper, $options: 'i' } }
        ];
      }

      if (sender) {
        exchangeFilter.requester = sender;
      }

      if (startDate && endDate) {
        exchangeFilter.approvedAt = { $gte: new Date(startDate), $lte: new Date(endDate) };
      }

      if (req.user.role === 'employee') {
        exchangeFilter.requester = req.user._id;
      } else if (req.user.role === 'team_lead') {
        const User = require('../models/User');
        const deptUsers = await User.find({ department: req.user.department }).select('_id');
        const deptUserIds = deptUsers.map(u => u._id);
        exchangeFilter.requester = { $in: deptUserIds };
      } else if (req.user.role === 'department_admin') {
        if (req.user.departmentAdminType !== 'store' && req.user.departmentAdminType !== 'management' && req.user.departmentAdminType !== 'accounts') {
          const User = require('../models/User');
          const deptUsers = await User.find({ department: req.user.department }).select('_id');
          const deptUserIds = deptUsers.map(u => u._id);
          exchangeFilter.requester = { $in: deptUserIds };
        }
      }

      const exchangesRaw = await ExchangeRequest.find(exchangeFilter)
        .populate('requester', 'fullName employeeId department')
        .populate('approvedBy', 'fullName employeeId')
        .sort({ approvedAt: -1 });

      const Transaction = require('../models/Transaction');
      const exchanges = await Promise.all(exchangesRaw.map(async (ex) => {
        const txnObj = await Transaction.findOne({ transactionId: ex.transactionId }).select('_id').lean();
        const obj = ex.toObject();
        obj.transactionDbId = txnObj ? txnObj._id : null;
        return obj;
      }));

      return res.json({
        data: exchanges,
        report: exchanges,
        summary: {
          totalTransactions: exchanges.length,
          totalValue: exchanges.filter(e => e.newDocumentType === 'Invoice').length,
          avgValue: exchanges.filter(e => e.newDocumentType !== 'Invoice').length
        },
        total: exchanges.length
      });
    }

    if (reportType === 'conversions') {
      const CloseRequest = require('../models/CloseRequest');
      const Barcode = require('../models/Barcode');
      const { barcode: bcQuery, startDate, endDate, sender, documentType, department } = req.query;
      
      const convFilter = { status: 'approved' };

      if (documentType && documentType !== 'all' && documentType !== '') {
        convFilter.documentType = documentType;
      } else {
        convFilter.documentType = { $in: ['DC Internal', 'DC FOC', 'Invoice'] };
      }

      if (bcQuery && bcQuery.trim()) {
        convFilter.barcode = { $regex: bcQuery.trim().toUpperCase(), $options: 'i' };
      }

      if (sender) {
        convFilter.requester = sender;
      }

      if (startDate && endDate) {
        convFilter.approvedAt = { $gte: new Date(startDate), $lte: new Date(endDate) };
      }

      if (req.user.role === 'employee') {
        convFilter.requester = req.user._id;
      } else if (req.user.role === 'team_lead') {
        const User = require('../models/User');
        const deptUsers = await User.find({ department: req.user.department }).select('_id');
        const deptUserIds = deptUsers.map(u => u._id);
        convFilter.requester = { $in: deptUserIds };
      } else if (req.user.role === 'department_admin') {
        if (req.user.departmentAdminType !== 'store' && req.user.departmentAdminType !== 'management' && req.user.departmentAdminType !== 'accounts') {
          const User = require('../models/User');
          const deptUsers = await User.find({ department: req.user.department }).select('_id');
          const deptUserIds = deptUsers.map(u => u._id);
          convFilter.requester = { $in: deptUserIds };
        }
      }

      if (department && department !== 'all' && department !== '' && req.user.role !== 'employee' && req.user.role !== 'team_lead') {
        const User = require('../models/User');
        const deptUsers = await User.find({ department }).select('_id');
        const deptUserIds = deptUsers.map(u => u._id);
        convFilter.requester = { $in: deptUserIds };
      }

      const conversions = await CloseRequest.find(convFilter)
        .populate('requester', 'fullName employeeId department')
        .populate('approvedBy', 'fullName employeeId')
        .sort({ approvedAt: -1 });

      const enrichedConversions = [];
      for (const conv of conversions) {
        const bc = await Barcode.findOne({ barcode: conv.barcode });
        enrichedConversions.push({
          ...conv.toObject(),
          materialName: bc ? bc.materialName : 'N/A'
        });
      }

      return res.json({
        data: enrichedConversions,
        report: enrichedConversions,
        summary: {
          totalTransactions: enrichedConversions.length,
          totalValue: enrichedConversions.filter(c => c.documentType === 'Invoice').length,
          avgValue: enrichedConversions.filter(c => c.documentType !== 'Invoice').length
        },
        total: enrichedConversions.length
      });
    }

    if (reportType === 'returns') {
      const Return = require('../models/Return');
      const { status, barcode, startDate, endDate, handler } = req.query;
      const returnFilter = {};

      if (status && status !== 'all' && status !== '') {
        returnFilter.status = status;
      }
      if (barcode && barcode.trim()) {
        returnFilter.barcode = { $regex: barcode.trim().toUpperCase(), $options: 'i' };
      }
      if (handler) {
        returnFilter.returnHandler = handler;
      }
      if (startDate && endDate) {
        returnFilter.createdAt = { $gte: new Date(startDate), $lte: new Date(endDate) };
      }

      const returns = await Return.find(returnFilter)
        .populate('fromUser', 'fullName employeeId')
        .populate('returnHandler', 'fullName employeeId')
        .sort({ createdAt: -1 });

      return res.json({
        data: returns,
        report: returns,
        summary: {
          totalTransactions: returns.length,
          totalValue: returns.filter(r => r.condition === 'good').length,
          avgValue: returns.filter(r => r.condition !== 'good').length
        },
        total: returns.length
      });
    }

    if (reportType === 'handler') {
      const { handler } = req.query;
      const filter = await buildReportFilter(req);

      delete filter.$or;
      delete filter.$and;

      const targetHandlerId = req.user.role === 'employee' ? req.user._id : handler;
      const isGlobalAdmin = req.user.role === 'super_admin' || 
                           (req.user.role === 'department_admin' && 
                            ['store', 'management', 'accounts'].includes(req.user.departmentAdminType));

      if (targetHandlerId) {
        if (!isGlobalAdmin && targetHandlerId.toString() !== req.user._id.toString()) {
          // Keep department filter
          filter.department = req.user.department?._id || req.user.department;
        } else {
          delete filter.department;
        }
        const ReturnModel = require('../models/Return');
        const returnDocs = await ReturnModel.find({ returnHandler: targetHandlerId });
        const returnTxnIds = returnDocs.map(r => r.transactionId);

        filter.$or = [
          { handler: targetHandlerId },
          { 'pendingHandlerTransfer.toHandler': targetHandlerId },
          { 'pendingHandlerTransfer.fromHandler': targetHandlerId },
          { transactionId: { $in: returnTxnIds } },
          { 'timeline': { 
              $elemMatch: { 
                $or: [
                  { 'metadata.handlerId': targetHandlerId },
                  { 'metadata.toHandlerId': targetHandlerId },
                  { 'metadata.fromHandlerId': targetHandlerId },
                  { 'metadata.fromHandler': targetHandlerId },
                  { 'metadata.toHandler': targetHandlerId },
                  { user: targetHandlerId, action: { $in: ['Handler Assigned', 'Handler Accepted', 'Handler Transfer Accepted', 'Handler Picked Up', 'Handler Delivered', 'Return Handler Reassigned'] } }
                ] 
              } 
            } 
          }
        ];
      } else {
        filter.handler = { $ne: null };
        if (!isGlobalAdmin) {
          filter.$or = [
            { department: req.user.department?._id || req.user.department },
            { handler: req.user._id }
          ];
          delete filter.department;
        }
      }

      const transactions = await Transaction.find(filter)
        .populate('requester', 'fullName employeeId')
        .populate('receiver', 'fullName employeeId department')
        .populate('handler', 'fullName employeeId')
        .populate('department', 'name')
        .sort({ createdAt: -1 });

      return res.json({
        data: transactions,
        report: transactions,
        summary: {
          totalTransactions: transactions.length,
          totalValue: transactions.filter(t => ['received', 'completed', 'closed'].includes(t.status)).length,
          avgValue: transactions.filter(t => !['received', 'completed', 'closed', 'rejected'].includes(t.status)).length
        },
        total: transactions.length
      });
    }

    // Default: Transaction Report
    const filter = await buildReportFilter(req);
    const transactions = await Transaction.find(filter)
      .populate('requester', 'fullName employeeId')
      .populate('receiver', 'fullName employeeId department')
      .populate('handler', 'fullName employeeId')
      .populate('department', 'name')
      .sort({ createdAt: -1 });

    const totalTransactions = transactions.length;
    const totalValue = transactions.reduce((sum, t) => sum + (t.grandTotal || 0), 0);
    const avgValue = totalTransactions > 0 ? totalValue / totalTransactions : 0;

    res.json({
      data: transactions,
      report: transactions,
      summary: {
        totalTransactions,
        totalValue,
        avgValue
      },
      total: totalTransactions
    });
  } catch (error) {
    console.error('Error generating report:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

exports.exportTransactionReport = async (req, res) => {
  try {
    const { reportType = 'transaction' } = req.query;
    const workbook = new ExcelJS.Workbook();

    if (reportType === 'exchange') {
      const ExchangeRequest = require('../models/ExchangeRequest');
      const { barcode: bcQuery, startDate, endDate, sender, documentType } = req.query;

      const exchangeFilter = { status: 'approved' };

      if (documentType && documentType !== 'all' && documentType !== '') {
        exchangeFilter.newDocumentType = documentType;
      }

      if (bcQuery && bcQuery.trim()) {
        const queryUpper = bcQuery.trim().toUpperCase();
        exchangeFilter.$or = [
          { oldBarcode: { $regex: queryUpper, $options: 'i' } },
          { newBarcode: { $regex: queryUpper, $options: 'i' } }
        ];
      }

      if (sender) {
        exchangeFilter.requester = sender;
      }

      if (startDate && endDate) {
        exchangeFilter.approvedAt = { $gte: new Date(startDate), $lte: new Date(endDate) };
      }

      if (req.user.role === 'employee') {
        exchangeFilter.requester = req.user._id;
      } else if (req.user.role === 'team_lead') {
        const User = require('../models/User');
        const deptUsers = await User.find({ department: req.user.department }).select('_id');
        const deptUserIds = deptUsers.map(u => u._id);
        exchangeFilter.requester = { $in: deptUserIds };
      } else if (req.user.role === 'department_admin') {
        if (req.user.departmentAdminType !== 'store' && req.user.departmentAdminType !== 'management' && req.user.departmentAdminType !== 'accounts') {
          const User = require('../models/User');
          const deptUsers = await User.find({ department: req.user.department }).select('_id');
          const deptUserIds = deptUsers.map(u => u._id);
          exchangeFilter.requester = { $in: deptUserIds };
        }
      }

      const exchanges = await ExchangeRequest.find(exchangeFilter)
        .populate('requester', 'fullName employeeId department')
        .populate('approvedBy', 'fullName employeeId')
        .sort({ approvedAt: -1 });

      const sheet = workbook.addWorksheet('Barcode Exchanges');
      sheet.columns = [
        { header: 'Transaction ID', key: 'transactionId', width: 20 },
        { header: 'Old Barcode', key: 'oldBarcode', width: 15 },
        { header: 'New Barcode', key: 'newBarcode', width: 15 },
        { header: 'Material Name', key: 'materialName', width: 25 },
        { header: 'New Doc Type', key: 'newDocumentType', width: 15 },
        { header: 'Requester Name', key: 'requesterName', width: 25 },
        { header: 'Employee ID', key: 'employeeId', width: 15 },
        { header: 'Warranty Reason', key: 'warrantyReason', width: 35 },
        { header: 'Approved By', key: 'approvedBy', width: 25 },
        { header: 'Approved Date', key: 'approvedDate', width: 20 }
      ];

      for (const e of exchanges) {
        const approvedDateStr = (e.approvedAt && typeof e.approvedAt.toLocaleDateString === 'function') ? e.approvedAt.toLocaleDateString('en-IN') : 'N/A';
        sheet.addRow({
          transactionId: e.transactionId,
          oldBarcode: e.oldBarcode,
          newBarcode: e.newBarcode || 'Pending',
          materialName: e.materialName,
          newDocumentType: e.newDocumentType,
          requesterName: e.requester?.fullName || 'N/A',
          employeeId: e.requester?.employeeId || 'N/A',
          warrantyReason: e.warrantyReason || '',
          approvedBy: e.approvedBy?.fullName || 'N/A',
          approvedDate: approvedDateStr
        });
      }
      sheet.getRow(1).font = { bold: true };
    } else if (reportType === 'conversions') {
      const CloseRequest = require('../models/CloseRequest');
      const Barcode = require('../models/Barcode');
      const { barcode: bcQuery, startDate, endDate, sender, documentType, department } = req.query;
      
      const convFilter = { status: 'approved' };

      if (documentType && documentType !== 'all' && documentType !== '') {
        convFilter.documentType = documentType;
      } else {
        convFilter.documentType = { $in: ['DC Internal', 'DC FOC', 'Invoice'] };
      }

      if (bcQuery && bcQuery.trim()) {
        convFilter.barcode = { $regex: bcQuery.trim().toUpperCase(), $options: 'i' };
      }

      if (sender) {
        convFilter.requester = sender;
      }

      if (startDate && endDate) {
        convFilter.approvedAt = { $gte: new Date(startDate), $lte: new Date(endDate) };
      }

      if (req.user.role === 'employee') {
        convFilter.requester = req.user._id;
      } else if (req.user.role === 'team_lead') {
        const User = require('../models/User');
        const deptUsers = await User.find({ department: req.user.department }).select('_id');
        const deptUserIds = deptUsers.map(u => u._id);
        convFilter.requester = { $in: deptUserIds };
      } else if (req.user.role === 'department_admin') {
        if (req.user.departmentAdminType !== 'store' && req.user.departmentAdminType !== 'management' && req.user.departmentAdminType !== 'accounts') {
          const User = require('../models/User');
          const deptUsers = await User.find({ department: req.user.department }).select('_id');
          const deptUserIds = deptUsers.map(u => u._id);
          convFilter.requester = { $in: deptUserIds };
        }
      }

      if (department && department !== 'all' && department !== '' && req.user.role !== 'employee' && req.user.role !== 'team_lead') {
        const User = require('../models/User');
        const deptUsers = await User.find({ department }).select('_id');
        const deptUserIds = deptUsers.map(u => u._id);
        convFilter.requester = { $in: deptUserIds };
      }

      const conversions = await CloseRequest.find(convFilter)
        .populate('requester', 'fullName employeeId department')
        .populate('approvedBy', 'fullName employeeId')
        .sort({ approvedAt: -1 });

      const sheet = workbook.addWorksheet('DC & Invoice Conversions');
      sheet.columns = [
        { header: 'Transaction ID', key: 'transactionId', width: 20 },
        { header: 'Barcode', key: 'barcode', width: 15 },
        { header: 'Material Name', key: 'materialName', width: 25 },
        { header: 'Document Type', key: 'documentType', width: 15 },
        { header: 'Document Number', key: 'documentNumber', width: 18 },
        { header: 'Remarks', key: 'remarks', width: 30 },
        { header: 'Requester Name', key: 'requesterName', width: 25 },
        { header: 'Employee ID', key: 'employeeId', width: 15 },
        { header: 'Approved/Closed By', key: 'approvedBy', width: 25 },
        { header: 'Closed Date', key: 'closedDate', width: 20 }
      ];

      for (const c of conversions) {
        const bc = await Barcode.findOne({ barcode: c.barcode });
        const closedDateStr = (c.approvedAt && typeof c.approvedAt.toLocaleDateString === 'function') ? c.approvedAt.toLocaleDateString('en-IN') : 'N/A';
        sheet.addRow({
          transactionId: c.transactionId,
          barcode: c.barcode,
          materialName: bc ? bc.materialName : 'N/A',
          documentType: c.documentType,
          documentNumber: c.documentNumber,
          remarks: c.remarks || '',
          requesterName: c.requester?.fullName || 'N/A',
          employeeId: c.requester?.employeeId || 'N/A',
          approvedBy: c.approvedBy?.fullName || 'N/A',
          closedDate: closedDateStr
        });
      }
      sheet.getRow(1).font = { bold: true };
    } else if (reportType === 'returns') {
      const Return = require('../models/Return');
      const { status, barcode, startDate, endDate, handler } = req.query;
      const returnFilter = {};

      if (status && status !== 'all' && status !== '') {
        returnFilter.status = status;
      }
      if (barcode && barcode.trim()) {
        returnFilter.barcode = { $regex: barcode.trim().toUpperCase(), $options: 'i' };
      }
      if (handler) {
        returnFilter.returnHandler = handler;
      }
      if (startDate && endDate) {
        returnFilter.createdAt = { $gte: new Date(startDate), $lte: new Date(endDate) };
      }

      const returns = await Return.find(returnFilter)
        .populate('fromUser', 'fullName employeeId')
        .populate('returnHandler', 'fullName employeeId')
        .sort({ createdAt: -1 });

      const sheet = workbook.addWorksheet('Returns');
      sheet.columns = [
        { header: 'Transaction ID', key: 'transactionId', width: 20 },
        { header: 'Barcode', key: 'barcode', width: 15 },
        { header: 'Returned By', key: 'fromUser', width: 25 },
        { header: 'Return Handler', key: 'returnHandler', width: 25 },
        { header: 'Condition', key: 'condition', width: 15 },
        { header: 'Status', key: 'status', width: 15 },
        { header: 'Reason', key: 'reason', width: 30 },
        { header: 'Remarks', key: 'remarks', width: 30 },
        { header: 'Created Date', key: 'createdAt', width: 20 }
      ];

      returns.forEach(r => {
        const createdAtStr = (r.createdAt && typeof r.createdAt.toLocaleDateString === 'function') ? r.createdAt.toLocaleDateString('en-IN') : 'N/A';
        sheet.addRow({
          transactionId: r.transactionId,
          barcode: r.barcode,
          fromUser: r.fromUser?.fullName || 'N/A',
          returnHandler: r.returnHandler?.fullName || 'N/A',
          condition: r.condition,
          status: r.status,
          reason: r.reason,
          remarks: r.remarks,
          createdAt: createdAtStr
        });
      });
      sheet.getRow(1).font = { bold: true };
    } else if (reportType === 'handler') {
      const { handler } = req.query;
      const sheet = workbook.addWorksheet('Handler Sourcing');
      sheet.columns = [
        { header: 'Transaction ID', key: 'transactionId', width: 20 },
        { header: 'Handler Name', key: 'handler', width: 25 },
        { header: 'Requester', key: 'requester', width: 25 },
        { header: 'Receiver', key: 'receiver', width: 25 },
        { header: 'Status', key: 'status', width: 15 },
        { header: 'Grand Total', key: 'grandTotal', width: 15 },
        { header: 'Created Date', key: 'createdAt', width: 20 }
      ];
      sheet.getRow(1).font = { bold: true };

      const filter = await buildReportFilter(req);

      delete filter.$or;
      delete filter.$and;

      const targetHandlerId = req.user.role === 'employee' ? req.user._id : handler;
      const isGlobalAdmin = req.user.role === 'super_admin' || 
                           (req.user.role === 'department_admin' && 
                            ['store', 'management', 'accounts'].includes(req.user.departmentAdminType));

      if (targetHandlerId) {
        if (!isGlobalAdmin && targetHandlerId.toString() !== req.user._id.toString()) {
          // Keep department filter
          filter.department = req.user.department?._id || req.user.department;
        } else {
          delete filter.department;
        }
        const ReturnModel = require('../models/Return');
        const returnDocs = await ReturnModel.find({ returnHandler: targetHandlerId });
        const returnTxnIds = returnDocs.map(r => r.transactionId);

        filter.$or = [
          { handler: targetHandlerId },
          { 'pendingHandlerTransfer.toHandler': targetHandlerId },
          { 'pendingHandlerTransfer.fromHandler': targetHandlerId },
          { transactionId: { $in: returnTxnIds } },
          { 'timeline': { 
              $elemMatch: { 
                $or: [
                  { 'metadata.handlerId': targetHandlerId },
                  { 'metadata.toHandlerId': targetHandlerId },
                  { 'metadata.fromHandlerId': targetHandlerId },
                  { 'metadata.fromHandler': targetHandlerId },
                  { 'metadata.toHandler': targetHandlerId },
                  { user: targetHandlerId, action: { $in: ['Handler Assigned', 'Handler Accepted', 'Handler Transfer Accepted', 'Handler Picked Up', 'Handler Delivered', 'Return Handler Reassigned'] } }
                ] 
              } 
            } 
          }
        ];
      } else {
        filter.handler = { $ne: null };
        if (!isGlobalAdmin) {
          filter.$or = [
            { department: req.user.department?._id || req.user.department },
            { handler: req.user._id }
          ];
          delete filter.department;
        }
      }

      const transactions = await Transaction.find(filter)
        .populate('requester', 'fullName employeeId')
        .populate('receiver', 'fullName employeeId department')
        .populate('handler', 'fullName employeeId')
        .populate('department', 'name')
        .sort({ createdAt: -1 });

      transactions.forEach(t => {
        const createdAtStr = (t.createdAt && typeof t.createdAt.toLocaleDateString === 'function') ? t.createdAt.toLocaleDateString('en-IN') : 'N/A';
        sheet.addRow({
          transactionId: t.transactionId,
          handler: t.handler?.fullName || 'N/A',
          requester: t.requester?.fullName || 'N/A',
          receiver: t.receiver?.fullName || t.otherReceiverName || 'N/A',
          status: t.status,
          grandTotal: t.grandTotal || 0,
          createdAt: createdAtStr
        });
      });
    } else {
      // Default: Transaction Report
      const filter = await buildReportFilter(req);
      const transactions = await Transaction.find(filter)
        .populate('requester', 'fullName employeeId')
        .populate('receiver', 'fullName employeeId department')
        .populate('handler', 'fullName employeeId')
        .populate('department', 'name');

      const sheet = workbook.addWorksheet('Transactions');
      sheet.columns = [
        { header: 'Transaction ID', key: 'transactionId', width: 20 },
        { header: 'Requester', key: 'requester', width: 25 },
        { header: 'Date', key: 'date', width: 15 },
        { header: 'Expected Return Date', key: 'expectedReturnDate', width: 22 },
        { header: 'Status', key: 'status', width: 18 },
        { header: 'Progress', key: 'progress', width: 15 }
      ];

      transactions.forEach(t => {
        const dateStr = (t.createdAt && typeof t.createdAt.toLocaleDateString === 'function') ? t.createdAt.toLocaleDateString('en-IN') : 'N/A';
        const expectedReturnDateStr = (t.dueDate && typeof t.dueDate.toLocaleDateString === 'function') ? t.dueDate.toLocaleDateString('en-IN') : 'N/A';
        
        let progress = 10;
        if (t.status === 'tl_approved') progress = 30;
        else if (t.status === 'mgt_approved' || t.status === 'ready_for_dispatch') progress = 45;
        else if (t.status === 'store_accepted') progress = 60;
        else if (t.status === 'handler_assigned') progress = 70;
        else if (t.status === 'dispatched') progress = 85;
        else if (t.status === 'received') progress = 95;
        else if (t.status === 'completed' || t.status === 'closed') progress = 100;
        else if (t.status === 'rejected') progress = 100;
        else if (t.status === 'partially_returned') progress = 90;
        else if (t.status === 'active') progress = 95;

        sheet.addRow({
          transactionId: t.transactionId,
          requester: t.requester?.fullName || 'N/A',
          date: dateStr,
          expectedReturnDate: expectedReturnDateStr,
          status: t.status ? t.status.replace('_', ' ').toUpperCase() : 'N/A',
          progress: `${progress}%`
        });
      });
      sheet.getRow(1).font = { bold: true };
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=IMS_Report_${reportType}.xlsx`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

exports.exportDcEmployeeReport = async (req, res) => {
  try {
    const { employeeId } = req.query;
    if (!employeeId) {
      return res.status(400).json({ message: 'Employee ID is required.' });
    }

    const CloseRequest = require('../models/CloseRequest');
    const Barcode = require('../models/Barcode');

    // Find all approved CloseRequests for this employee that are 'DC Internal' or 'DC FOC'
    const closeRequests = await CloseRequest.find({
      requester: employeeId,
      status: 'approved',
      documentType: { $in: ['DC Internal', 'DC FOC'] }
    }).populate('requester').populate('approvedBy');

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('DC Report');

    sheet.columns = [
      { header: 'Transaction ID', key: 'transactionId', width: 20 },
      { header: 'Barcode', key: 'barcode', width: 15 },
      { header: 'Material Name', key: 'materialName', width: 25 },
      { header: 'Document Type', key: 'documentType', width: 15 },
      { header: 'Document Number', key: 'documentNumber', width: 18 },
      { header: 'Remarks', key: 'remarks', width: 30 },
      { header: 'Requester Name', key: 'requesterName', width: 25 },
      { header: 'Employee ID', key: 'employeeId', width: 15 },
      { header: 'Approved By', key: 'approvedBy', width: 25 },
      { header: 'Closed Date', key: 'closedDate', width: 20 }
    ];

    for (const reqObj of closeRequests) {
      const bc = await Barcode.findOne({ barcode: reqObj.barcode });
      const closedDateStr = (reqObj.approvedAt && typeof reqObj.approvedAt.toLocaleDateString === 'function') ? reqObj.approvedAt.toLocaleDateString('en-IN') : 'N/A';
      sheet.addRow({
        transactionId: reqObj.transactionId,
        barcode: reqObj.barcode,
        materialName: bc ? bc.materialName : 'N/A',
        documentType: reqObj.documentType,
        documentNumber: reqObj.documentNumber,
        remarks: reqObj.remarks || '',
        requesterName: reqObj.requester?.fullName || 'N/A',
        employeeId: reqObj.requester?.employeeId || 'N/A',
        approvedBy: reqObj.approvedBy?.fullName || 'N/A',
        closedDate: closedDateStr
      });
    }

    sheet.getRow(1).font = { bold: true };

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=IMS_DC_Report_${employeeId}.xlsx`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Export DC employee report error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};
