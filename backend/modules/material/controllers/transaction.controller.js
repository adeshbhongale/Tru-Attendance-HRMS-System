const mongoose = require('mongoose');
const Transaction = require('../models/Transaction');
const Barcode = require('../models/Barcode');
const Notification = require('../../../models/Notification');
const AuditLog = require('../models/AuditLog');
const TransactionChat = require('../models/TransactionChat');
const { emitToUser, emitToTransaction } = require('../../../config/socket');

// Helper to prevent CastError when matching mixed transactionId string vs ObjectId
const getQueryByIdOrTxnId = (id) => {
  if (!id) return { _id: null };
  if (mongoose.Types.ObjectId.isValid(id)) {
    return { _id: id };
  }
  return { transactionId: id };
};

// Helper: create notification safely and emit via socket
const createNotification = async (userId, type, title, message, transactionId) => {
  try {
    const notif = await Notification.create({
      user: userId,
      title: title || 'Material Notification',
      description: message || title || 'Material Request update',
      type: 'general notification',
      targetType: 'Specific Employees',
      employees: [userId],
      status: 'sent'
    });
    emitToUser(userId.toString(), 'notification', notif);
    return notif;
  } catch (err) {
    console.warn('Material notification creation warning (ignored):', err.message);
  }
};

// Helper: add timeline entry
const addTimeline = (transaction, action, description, userId, metadata = {}) => {
  transaction.timeline.push({ action, description, user: userId, metadata });
};

/**
 * Create a new material request
 */
exports.createTransaction = async (req, res) => {
  try {
    let {
      materials,
      description,
      priority,
      dueDate,
      documentType,
      remarks,
      teamLeadId,
      managementApproverId,
      storeId,
      isSimplified
    } = req.body;

    const isValidObjectId = (id) => id && mongoose.Types.ObjectId.isValid(id);

    // Sanitize optional IDs
    teamLeadId = isValidObjectId(teamLeadId) ? teamLeadId : null;
    managementApproverId = isValidObjectId(managementApproverId) ? managementApproverId : null;
    storeId = isValidObjectId(storeId) ? storeId : null;

    let deptId = req.body.department || req.user.department?._id || req.user.department;
    if (!deptId || !isValidObjectId(deptId)) {
      try {
        const Department = require('../../../models/Department');
        let defaultDept = await Department.findOne({ status: 'active' });
        if (!defaultDept) {
          defaultDept = await Department.findOne();
        }
        if (!defaultDept) {
          defaultDept = await Department.create({ name: 'General', prefix: 'GN', status: 'active' });
        }
        deptId = defaultDept._id;
      } catch (deptErr) {
        console.warn('Could not load default department:', deptErr.message);
      }
    }

    if (!materials || materials.length === 0) {
      return res.status(400).json({ message: 'At least one material is required.' });
    }

    if (!dueDate) {
      return res.status(400).json({ message: 'Expected return date is required.' });
    }

    if (!isSimplified) {
      // Validate each material has barcodes matching quantity
      for (const mat of materials) {
        if (!mat.name || !mat.quantity || mat.quantity < 1) {
          return res.status(400).json({ message: 'Each material needs a name and quantity >= 1.' });
        }
        if (!mat.barcodes || mat.barcodes.length !== mat.quantity) {
          return res.status(400).json({
            message: `Material "${mat.name}" requires ${mat.quantity} barcode(s). Got ${mat.barcodes?.length || 0}.`,
          });
        }
      }

      // Check for duplicate barcodes
      const allBarcodes = materials.flatMap((m) => m.barcodes.map((b) => b.barcode));
      const uniqueBarcodes = new Set(allBarcodes);
      if (uniqueBarcodes.size !== allBarcodes.length) {
        return res.status(400).json({ message: 'Duplicate barcodes found.' });
      }

      // Check if any barcode already exists
      const existingBarcodes = await Barcode.find({ barcode: { $in: allBarcodes } });
      if (existingBarcodes.length > 0) {
        return res.status(400).json({
          message: `Barcode(s) already exist: ${existingBarcodes.map((b) => b.barcode).join(', ')}`,
        });
      }
    } else {
      // For simplified form, just check name and quantity
      for (const mat of materials) {
        const qtyNum = Number(mat.quantity || mat.qty);
        if (!mat.name || !qtyNum || qtyNum < 1) {
          return res.status(400).json({ message: 'Each material needs a name and quantity >= 1.' });
        }
      }
    }

    // Calculate total items safely
    const totalItems = materials.reduce((sum, m) => sum + (Number(m.quantity || m.qty) || 1), 0);
    const userName = req.user.fullName || req.user.name || 'User';

    // Determine initial status based on requester role
    let initialStatus = 'submitted';
    const isBypassed = req.user.role === 'team_lead' || req.user.role === 'department_admin';
    if (isBypassed) {
      initialStatus = 'tl_approved';
    }

    let finalTLId = teamLeadId || managementApproverId || null;
    let finalMgtId = managementApproverId || teamLeadId || null;

    if (!finalTLId && !isBypassed) {
      const User = require('../../../models/User');
      const deptTL = await User.findOne({
        department: deptId,
        role: 'team_lead',
        status: 'active'
      });
      if (deptTL) {
        finalTLId = deptTL._id;
      }
    }

    const transaction = await Transaction.create({
      requester: req.user._id,
      department: deptId,
      teamLead: isBypassed ? null : finalTLId,
      managementApprover: finalMgtId,
      store: storeId || null,
      status: initialStatus,
      documentType: documentType || 'RDC',
      priority: priority || 'medium',
      dueDate,
      description,
      remarks,
      materials: materials.map((m) => ({
        name: m.name || m.materialName || '',
        description: m.description || '',
        quantity: Number(m.quantity || m.qty) || 1,
        unit: m.unit || 'pcs',
        price: Number(m.price || m.rate) || 0,
        barcodes: isSimplified ? [] : (m.barcodes || []).map((b) => ({
          barcode: b.barcode,
          status: 'Active',
          owner: req.user._id,
        })),
      })),
      totalItems: Number(totalItems) || 1,
      activeItems: isSimplified ? 0 : (Number(totalItems) || 1),
      chatMembers: [
        req.user._id,
        ...((teamLeadId && !isBypassed) ? [teamLeadId] : []),
        ...(managementApproverId ? [managementApproverId] : []),
        ...(storeId ? [storeId] : [])
      ],
      timeline: [
        {
          action: 'Request Created',
          description: `${userName} created material request`,
          user: req.user._id,
        },
      ],
    });

    if (!isSimplified) {
      // Create barcode documents
      for (const mat of materials) {
        for (const bc of (mat.barcodes || [])) {
          await Barcode.create({
            barcode: bc.barcode,
            transactionId: transaction.transactionId,
            transaction: transaction._id,
            materialName: mat.name || mat.materialName,
            status: 'Active',
            owner: req.user._id,
            ownerDepartment: req.user.department?._id || req.user.department || deptId,
            ownershipHistory: [
              {
                user: req.user._id,
                department: req.user.department?._id || req.user.department || deptId,
                action: 'created',
                remarks: 'Initial creation with request',
              },
            ],
            history: [
              {
                action: 'Request Created',
                user: req.user._id,
                remarks: remarks || 'Request Created',
              },
            ],
          });
        }
      }
    }

    // Notify team lead or next in line
    if (finalTLId) {
      await createNotification(
        finalTLId,
        'request_created',
        'New Material Request',
        `New request ${transaction.transactionId} created by ${userName}`,
        transaction.transactionId
      );
    } else if (managementApproverId) {
      await createNotification(
        managementApproverId,
        'request_created',
        'New Material Request',
        `New request ${transaction.transactionId} created by ${userName}`,
        transaction.transactionId
      );
    }

    // Audit log
    await AuditLog.create({
      action: 'CREATE',
      entity: 'Transaction',
      entityId: transaction.transactionId,
      user: req.user._id,
      userName: userName,
      description: `Created transaction ${transaction.transactionId} with ${totalItems} items`,
    });

    await transaction.populate([
      { path: 'requester', select: 'name fullName employeeId email role department' },
      { path: 'department', select: 'name' },
      { path: 'teamLead', select: 'name fullName employeeId' },
      { path: 'managementApprover', select: 'name fullName employeeId' },
    ]);

    res.status(201).json({ message: 'Transaction created successfully.', transaction });
  } catch (error) {
    console.error('Create transaction error:', error);
    res.status(500).json({ message: 'Server error creating transaction.' });
  }
};

/**
 * Get all transactions (role-filtered)
 */
exports.getTransactions = async (req, res) => {
  try {
    const statusQuery = req.query.status || req.query.tab;
    const { search, page = 1, limit = 20 } = req.query;
    const filter = {};

    let userDeptId = null;
    if (req.user.department) {
      if (mongoose.Types.ObjectId.isValid(req.user.department._id)) {
        userDeptId = req.user.department._id;
      } else if (mongoose.Types.ObjectId.isValid(req.user.department)) {
        userDeptId = req.user.department;
      } else if (typeof req.user.department === 'string') {
        try {
          const Department = require('../../../models/Department');
          const dDoc = await Department.findOne({
            $or: [
              { name: new RegExp('^' + req.user.department + '$', 'i') },
              { prefix: req.user.department.toUpperCase() }
            ]
          }).lean();
          if (dDoc) {
            userDeptId = dDoc._id;
          }
        } catch (deptErr) {
          console.warn('Department ObjectId resolution warning:', deptErr.message);
        }
      }
    }

    // Role-based filtering
    if (req.user.role === 'employee') {
      const Barcode = require('../models/Barcode');
      const userBarcodes = await Barcode.find({
        $or: [
          { owner: req.user._id },
          { 'ownershipHistory.user': req.user._id }
        ]
      });
      const txnIds = userBarcodes.map(b => b.transactionId);

      // Find active return requests where the user is the return handler
      const ReturnModel = require('../models/Return');
      const activeReturns = await ReturnModel.find({
        returnHandler: req.user._id,
        status: { $in: ['handler_assigned', 'collected'] }
      });
      const activeReturnTxnIds = activeReturns.map(r => r.transactionId);

      // Find active barcode transfers where the user is recipient or sender
      const TransferModel = require('../models/Transfer');
      const activeTransfers = await TransferModel.find({
        $or: [
          { toUser: req.user._id },
          { fromUser: req.user._id }
        ],
        status: { $in: ['pending', 'approved', 'completed'] }
      });
      const transferTxnIds = activeTransfers.map(t => t.transactionId);

      filter.$or = [
        { requester: req.user._id },
        { managementApprover: req.user._id },
        { teamLead: req.user._id },
        // For dispatch handler, only show if delivery is still active/in-progress
        { handler: req.user._id, status: { $in: ['store_accepted', 'handler_assigned', 'dispatched'] } },
        // For pending handler transfer targets
        { 'pendingHandlerTransfer.toHandler': req.user._id, 'pendingHandlerTransfer.status': 'pending' },
        { transactionId: { $in: [...txnIds, ...activeReturnTxnIds, ...transferTxnIds] } }
      ];
    } else if (req.user.role === 'team_lead') {
      filter.$or = [
        { requester: req.user._id },
        { teamLead: req.user._id },
        { managementApprover: req.user._id },
        { handler: req.user._id },
        { status: 'submitted' },
        ...(userDeptId ? [{ department: userDeptId }] : []),
      ];
    } else if (req.user.role === 'department_admin') {
      if (req.user.departmentAdminType === 'store') {
        // Store only sees requests after management approved (exclude submitted & tl_approved)
        filter.status = { $nin: ['submitted', 'tl_approved'] };
      } else {
        filter.$or = [
          { requester: req.user._id },
          { managementApprover: req.user._id },
          { teamLead: req.user._id },
          { handler: req.user._id },
          { status: 'tl_approved' },
          ...(userDeptId ? [{ department: userDeptId }] : []),
        ];
      }
    }
    // super_admin sees all — no filter

    if (req.user.role !== 'super_admin') {
      const orConditions = [
        { status: { $ne: 'rejected' } },
        { requester: req.user._id },
        { teamLead: req.user._id },
        { managementApprover: req.user._id },
        { handler: req.user._id },
        { store: req.user._id }
      ];
      if (req.user.role === 'department_admin' && (req.user.departmentAdminType === 'store' || req.user.department?.name?.toLowerCase()?.includes('store'))) {
        orConditions.push({ status: 'rejected' });
      }
      const rejectedVisibility = { $or: orConditions };
      if (filter.$and) {
        filter.$and.push(rejectedVisibility);
      } else {
        filter.$and = [rejectedVisibility];
      }
    }

    if (statusQuery && statusQuery !== 'all') {
      if (statusQuery === 'in_progress') {
        filter.status = { $in: ['submitted', 'tl_approved', 'mgt_approved', 'store_accepted', 'handler_assigned', 'dispatched', 'received', 'active', 'partially_returned'] };
      } else if (statusQuery === 'pending') {
        filter.status = { $in: ['submitted', 'tl_approved', 'mgt_approved'] };
      } else if (statusQuery === 'completed') {
        filter.status = 'closed';
      } else {
        filter.status = statusQuery;
      }
    }

    if (search) {
      filter.$or = [
        ...(filter.$or || []),
        { transactionId: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ];
    }

    const allTransactions = await Transaction.find(filter)
      .populate('requester', 'name fullName employeeId email role')
      .populate('department', 'name')
      .populate('teamLead', 'name fullName employeeId')
      .populate('handler', 'name fullName employeeId')
      .populate('managementApprover', 'name fullName employeeId')
      .populate('store', 'name fullName employeeId')
      .populate('pendingHandlerTransfer.toHandler', 'name fullName employeeId')
      .populate('pendingHandlerTransfer.fromHandler', 'name fullName employeeId')
      .sort({ createdAt: -1 });

    let filteredTransactions = allTransactions;
    if (req.user.role === 'employee') {
      const txnIds = filteredTransactions.map(t => t.transactionId);
      const barcodesForTxns = await Barcode.find({ transactionId: { $in: txnIds } });
      const activePostDispatch = ['dispatched', 'received', 'active', 'partially_returned', 'closed', 'completed'];

      // Fetch active returns for the user to keep return handler transactions visible
      const ReturnModel = require('../models/Return');
      const activeReturnsForUser = await ReturnModel.find({
        returnHandler: req.user._id,
        status: { $in: ['handler_assigned', 'collected'] }
      });
      const activeReturnTxnIds = new Set(activeReturnsForUser.map(r => r.transactionId));

      // Fetch completed, pending, or approved barcode transfers for the user (recipient or sender)
      const TransferModel = require('../models/Transfer');
      const transfersForUser = await TransferModel.find({
        $or: [
          { toUser: req.user._id },
          { fromUser: req.user._id }
        ],
        status: { $in: ['pending', 'approved', 'completed'] }
      });
      const userTransferTxnIds = new Set(transfersForUser.map(t => t.transactionId));

      filteredTransactions = filteredTransactions.filter(txn => {
        const isRequester = (txn.requester?._id || txn.requester)?.toString() === req.user._id.toString();
        if (isRequester) {
          return true;
        }

        // Keep if the user is the assigned sourcing handler and delivery is in progress
        const isSourcingHandler = (txn.handler?._id || txn.handler)?.toString() === req.user._id.toString();
        if (isSourcingHandler && ['store_accepted', 'handler_assigned', 'dispatched'].includes(txn.status)) {
          return true;
        }

        // Keep if the user is the return handler for active return requests in this transaction
        if (activeReturnTxnIds.has(txn.transactionId)) {
          return true;
        }

        // Keep if there is a transfer associated with this user
        if (userTransferTxnIds.has(txn.transactionId)) {
          return true;
        }

        if (activePostDispatch.includes(txn.status)) {
          const txnBarcodes = barcodesForTxns.filter(b => b.transactionId === txn.transactionId);
          const hasActiveMaterial = txnBarcodes.some(b =>
            (b.owner?._id || b.owner)?.toString() === req.user._id.toString() ||
            b.ownershipHistory?.some(h => h.user?.toString() === req.user._id.toString())
          );
          if (!hasActiveMaterial) {
            return false;
          }
        }
        return true;
      });
    }

    const totalFiltered = filteredTransactions.length;
    const paginatedTransactions = filteredTransactions.slice((page - 1) * limit, page * limit);

    res.json({
      data: paginatedTransactions, // Added for frontend compatibility
      transactions: paginatedTransactions,
      pagination: {
        total: totalFiltered,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(totalFiltered / limit),
      },
    });
  } catch (error) {
    console.error('Get transactions error:', error);
    res.status(500).json({ message: 'Server error fetching transactions.' });
  }
};

exports.getPendingApprovals = exports.getTransactions;

/**
 * Get single transaction detail
 */
exports.getTransaction = async (req, res) => {
  try {
    const { id } = req.params;
    const transaction = await Transaction.findOne(getQueryByIdOrTxnId(id))
      .populate('requester', 'name fullName employeeId email role department designation')
      .populate('department', 'name')
      .populate('teamLead', 'name fullName employeeId email')
      .populate('handler', 'name fullName employeeId email')
      .populate('managementApprover', 'name fullName employeeId email')
      .populate('store', 'name fullName employeeId email')
      .populate('approvalChain.user', 'name fullName employeeId role')
      .populate('timeline.user', 'name fullName employeeId')
      .populate('chatMembers', 'name fullName employeeId profilePhoto')
      .populate('materials.barcodes.owner', 'name fullName employeeId')
      .populate('pendingHandlerTransfer.toHandler', 'name fullName employeeId email')
      .populate('pendingHandlerTransfer.fromHandler', 'name fullName employeeId email')
      .populate('pendingHandlerTransfer.requestedBy', 'name fullName employeeId');

    if (!transaction) {
      return res.status(404).json({ message: 'Transaction not found.' });
    }

    if (transaction.status === 'rejected' && req.user.role !== 'super_admin') {
      const userIdStr = req.user._id.toString();
      const isRequester = (transaction.requester?._id || transaction.requester)?.toString() === userIdStr;
      const isTeamLead = (transaction.teamLead?._id || transaction.teamLead)?.toString() === userIdStr;
      const isManagement = (transaction.managementApprover?._id || transaction.managementApprover)?.toString() === userIdStr;
      const isStoreAdmin = req.user.role === 'department_admin' && (req.user.departmentAdminType === 'store' || req.user.department?.name?.toLowerCase()?.includes('store'));
      const isAssignedStore = (transaction.store?._id || transaction.store)?.toString() === userIdStr;
      const isAssignedHandler = (transaction.handler?._id || transaction.handler)?.toString() === userIdStr;
      const isPendingTransferHandler = transaction.pendingHandlerTransfer?.toHandler &&
        (transaction.pendingHandlerTransfer.toHandler._id || transaction.pendingHandlerTransfer.toHandler)?.toString() === userIdStr;

      if (!isRequester && !isTeamLead && !isManagement && !isStoreAdmin && !isAssignedStore && !isAssignedHandler && !isPendingTransferHandler) {
        return res.status(403).json({ message: 'Access denied. You do not have permission to view this rejected transaction.' });
      }
    }

    // Parallelize barcode, return, and receipt queries for maximum speed
    const ReturnModel = require('../models/Return');
    const InternalReceipt = require('../models/InternalReceipt');
    const ExternalReceipt = require('../models/ExternalReceipt');
    const TransferModel = require('../models/Transfer');

    const [barcodes, returns, internalReceipts] = await Promise.all([
      Barcode.find({ transactionId: transaction.transactionId })
        .populate('owner', 'fullName employeeId department')
        .populate('ownerDepartment', 'name')
        .populate('history.user', 'fullName employeeId')
        .populate('closeRequest.managementApprover', 'fullName employeeId')
        .populate('closeRequest.requester', 'fullName employeeId')
        .lean(),
      ReturnModel.find({ transactionId: transaction.transactionId })
        .populate('fromUser', 'fullName employeeId')
        .populate('returnHandler', 'fullName employeeId')
        .lean(),
      InternalReceipt.find({ transaction: transaction._id })
        .populate('receiver', 'fullName employeeId')
        .lean(),
    ]);

    // Calculate chatLocked dynamically for the current user
    let dynamicChatLocked = transaction.chatLocked;
    const isTeamLead = (transaction.teamLead?._id || transaction.teamLead)?.toString() === req.user._id.toString();
    if (req.user.role === 'employee' && !isTeamLead) {
      const activePostDispatch = ['dispatched', 'received', 'active', 'partially_returned', 'closed', 'completed'];
      if (activePostDispatch.includes(transaction.status)) {
        const hasActiveMaterial = barcodes.some(b =>
          (b.owner?._id || b.owner)?.toString() === req.user._id.toString() ||
          b.ownershipHistory?.some(h => h.user?.toString() === req.user._id.toString())
        );

        const hasTransfer = await TransferModel.exists({
          transactionId: transaction.transactionId,
          $or: [
            { toUser: req.user._id },
            { fromUser: req.user._id }
          ]
        });

        const hasActiveReturnAssignment = returns.some(r =>
          (r.returnHandler?._id || r.returnHandler)?.toString() === req.user._id.toString() &&
          r.status !== 'completed'
        );

        const isPendingDispatchHandler = (transaction.handler?._id || transaction.handler)?.toString() === req.user._id.toString() &&
          ['store_accepted', 'handler_assigned'].includes(transaction.status);

        if (!hasActiveMaterial && !hasTransfer && !hasActiveReturnAssignment && !isPendingDispatchHandler) {
          dynamicChatLocked = true;
        }
      }
    }

    const externalReceipts = await ExternalReceipt.find({ 'materials.barcode': { $in: barcodes.map(b => b.barcode) } })
      .populate('receiver', 'fullName employeeId')
      .lean();
    const receipts = [...internalReceipts, ...externalReceipts];

    const transactionObj = transaction.toObject();
    transactionObj.chatLocked = dynamicChatLocked;

    res.json({
      data: transactionObj,
      transaction: transactionObj,
      barcodes,
      returns,
      receipts
    });
  } catch (error) {
    console.error('Get transaction error:', error);
    res.status(500).json({ message: 'Server error fetching transaction.' });
  }
};

/**
 * Approve transaction (Team Lead / Management)
 */
exports.approveTransaction = async (req, res) => {
  try {
    const { id } = req.params;
    const { remarks } = req.body;

    const transaction = await Transaction.findOne(getQueryByIdOrTxnId(id))
      .populate('requester', 'fullName employeeId role department');

    if (!transaction) {
      return res.status(404).json({ message: 'Transaction not found.' });
    }

    let newStatus;
    let notifyUsers = [];

    const isTLUser = req.user.role === 'team_lead' ||
      (transaction.teamLead && (transaction.teamLead._id || transaction.teamLead).toString() === req.user._id.toString());

    const isMgtUser = (
      (req.user.role === 'department_admin' && (req.user.departmentAdminType === 'management' || req.user.adminType === 'management' || !req.user.departmentAdminType)) ||
      req.user.role === 'management' ||
      ['super_admin', 'admin', 'company_admin'].includes(req.user.role) ||
      (transaction.managementApprover && (transaction.managementApprover._id || transaction.managementApprover).toString() === req.user._id.toString())
    );

    const isStoreUser = (
      (req.user.role === 'department_admin' && (req.user.departmentAdminType === 'store' || req.user.adminType === 'store')) ||
      req.user.role === 'store'
    );

    const uName = req.user.fullName || req.user.name || 'Approver';

    if (isTLUser && transaction.status === 'submitted') {
      newStatus = 'tl_approved';
      transaction.approvalChain.push({
        user: req.user._id,
        role: 'team_lead',
        action: 'approved',
        remarks,
      });
      addTimeline(transaction, 'Team Lead Approved', `Approved by ${uName}`, req.user._id);

      // Check if requester is TL → need management approval
      if ((transaction.requester && transaction.requester.role === 'team_lead') || transaction.crossDepartment) {
        newStatus = 'tl_approved'; // Still needs management approval
      }
    } else if (isMgtUser && (transaction.status === 'tl_approved' || transaction.status === 'submitted')) {
      newStatus = 'mgt_approved';
      transaction.approvalChain.push({
        user: req.user._id,
        role: 'management',
        action: 'approved',
        remarks,
      });
      addTimeline(transaction, 'Management Approved', `Approved by Management: ${uName}`, req.user._id);
    } else if (isStoreUser && ['mgt_approved', 'store_accepted'].includes(transaction.status)) {
      newStatus = 'store_accepted';
      transaction.approvalChain.push({
        user: req.user._id,
        role: 'store',
        action: 'approved',
        remarks,
      });
      addTimeline(transaction, 'Store Accepted', `Accepted by Store: ${uName}`, req.user._id);
    } else {
      return res.status(403).json({ message: 'You cannot approve this transaction in its current state.' });
    }

    transaction.status = newStatus;
    await transaction.save();

    // Notify requester
    await createNotification(
      transaction.requester._id,
      'request_approved',
      'Request Approved',
      `Your request ${transaction.transactionId} has been approved`,
      transaction.transactionId
    );

    await AuditLog.create({
      action: 'APPROVE',
      entity: 'Transaction',
      entityId: transaction.transactionId,
      user: req.user._id,
      userName: req.user.fullName,
      description: `Approved transaction ${transaction.transactionId} → ${newStatus}`,
    });

    res.json({ message: 'Transaction approved.', transaction });
  } catch (error) {
    console.error('Approve error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

/**
 * Reject transaction — reverts to previous approval phase
 */
exports.rejectTransaction = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    if (!reason) {
      return res.status(400).json({ message: 'Rejection reason is required.' });
    }

    const transaction = await Transaction.findOne(getQueryByIdOrTxnId(id));

    if (!transaction) {
      return res.status(404).json({ message: 'Transaction not found.' });
    }

    // Determine previous status based on current status
    const previousStatusMap = {
      'submitted': 'rejected',         // TL rejects → rejected permanently
      'tl_approved': 'rejected',       // Management rejects → rejected permanently
      'mgt_approved': 'tl_approved',   // Store rejects → back to tl_approved
      'store_accepted': 'mgt_approved', // Rejection at store accepted → back to mgt_approved
      'handler_assigned': 'store_accepted', // Handler decline handled separately but as fallback
      'dispatched': 'handler_assigned',
    };

    const oldStatus = transaction.status;
    const previousStatus = previousStatusMap[oldStatus] || 'submitted';
    const isPermanentRejection = previousStatus === 'rejected';

    transaction.status = previousStatus;
    transaction.rejectionReason = reason;
    transaction.approvalChain.push({
      user: req.user._id,
      role: req.user.role,
      action: 'rejected',
      remarks: reason,
    });

    const timelineDesc = isPermanentRejection
      ? `Rejected by ${req.user.fullName}: ${reason}.`
      : `Rejected by ${req.user.fullName}: ${reason}. Reverted to ${previousStatus.replace(/_/g, ' ')} stage.`;
    addTimeline(transaction, 'Request Rejected', timelineDesc, req.user._id);

    await transaction.save();

    if (isPermanentRejection) {
      // Cancel all barcodes associated with the transaction
      await Barcode.updateMany(
        { transactionId: transaction.transactionId },
        { status: 'Cancelled' }
      );
    }

    const notifMessage = isPermanentRejection
      ? `Your request ${transaction.transactionId} was rejected by ${req.user.fullName}: ${reason}.`
      : `Your request ${transaction.transactionId} was rejected by ${req.user.fullName}: ${reason}. It has been reverted for re-review.`;

    await createNotification(
      transaction.requester,
      'request_rejected',
      'Request Rejected',
      notifMessage,
      transaction.transactionId
    );

    const auditDesc = isPermanentRejection
      ? `Rejected transaction ${transaction.transactionId}: ${reason}. Status updated from ${oldStatus} to rejected.`
      : `Rejected transaction ${transaction.transactionId}: ${reason}. Status reverted from ${oldStatus} to ${previousStatus}.`;

    await AuditLog.create({
      action: 'REJECT',
      entity: 'Transaction',
      entityId: transaction.transactionId,
      user: req.user._id,
      userName: req.user.fullName,
      description: auditDesc,
    });

    const responseMsg = isPermanentRejection
      ? `Transaction rejected successfully.`
      : `Transaction rejected and reverted to ${previousStatus.replace(/_/g, ' ')} stage.`;

    res.json({ message: responseMsg, transaction });
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
};

/**
 * Store accepts transaction
 */
exports.storeAccept = async (req, res) => {
  try {
    const { id } = req.params;
    const transaction = await Transaction.findOne(getQueryByIdOrTxnId(id));

    if (!transaction) {
      return res.status(404).json({ message: 'Transaction not found.' });
    }

    if (!['submitted', 'tl_approved', 'mgt_approved'].includes(transaction.status)) {
      return res.status(400).json({ message: 'Transaction is not ready for store acceptance.' });
    }

    transaction.status = 'store_accepted';
    if (!transaction.chatMembers.includes(req.user._id)) {
      transaction.chatMembers.push(req.user._id);
    }
    addTimeline(transaction, 'Store Accepted', `Store accepted the request. ${req.user.fullName}`, req.user._id);

    await transaction.save();

    await createNotification(
      transaction.requester,
      'store_accepted',
      'Store Accepted',
      `Store has accepted your request ${transaction.transactionId}`,
      transaction.transactionId
    );

    await AuditLog.create({
      action: 'STORE_ACCEPT',
      entity: 'Transaction',
      entityId: transaction.transactionId,
      user: req.user._id,
      userName: req.user.fullName,
      description: `Store accepted transaction ${transaction.transactionId}`,
    });

    res.json({ message: 'Transaction accepted by store.', transaction });
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
};

/**
 * Assign handler
 */
exports.assignHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const { handlerId, remarks, expectedDeliveryDate } = req.body;

    if (!handlerId) {
      return res.status(400).json({ message: 'Handler is required.' });
    }

    const transaction = await Transaction.findOne(getQueryByIdOrTxnId(id));

    if (!transaction) {
      return res.status(404).json({ message: 'Transaction not found.' });
    }

    // Check authorization: store admin, super admin, or the current assigned handler
    const isStore = req.user.role === 'super_admin' || (req.user.role === 'department_admin' && req.user.departmentAdminType === 'store');
    const isCurrentHandler = transaction.handler && transaction.handler.toString() === req.user._id.toString();

    if (!isStore && !isCurrentHandler) {
      return res.status(403).json({ message: 'Access denied. You are not authorized to assign handler for this transaction.' });
    }

    const User = require('../../../models/User');
    const handlerUser = await User.findById(handlerId);
    const handlerName = handlerUser ? handlerUser.fullName : 'Handler';

    // If a handler-to-handler transfer, use two-step pending flow
    if (isCurrentHandler && !isStore) {
      // Check for existing pending transfer
      if (transaction.pendingHandlerTransfer && transaction.pendingHandlerTransfer.status === 'pending') {
        return res.status(400).json({ message: 'There is already a pending handler transfer request. Please wait for it to be resolved or cancel it first.' });
      }

      transaction.pendingHandlerTransfer = {
        toHandler: handlerId,
        fromHandler: req.user._id,
        requestedBy: req.user._id,
        requestedAt: new Date(),
        status: 'pending',
        remarks: remarks || '',
        rejectReason: '',
        resolvedAt: null,
      };

      if (!transaction.chatMembers.includes(handlerId)) {
        transaction.chatMembers.push(handlerId);
      }

      addTimeline(transaction, 'Handler Transfer Requested', `Handler transfer requested to ${handlerName}. Remarks: ${remarks || ''}`, req.user._id, { toHandlerId: handlerId });

      await transaction.save();

      const materialsStr = transaction.materials?.map(m => m.name).join(', ') || 'N/A';
      const barcodes = await Barcode.find({ transactionId: transaction.transactionId });
      const barcodesStr = barcodes.map(b => b.barcode).join(', ') || 'N/A';

      await createNotification(
        handlerId,
        'handler_transfer_request',
        'Handler Transfer Request',
        `You have received a handler assignment request.\n\nTransaction:\n${transaction.transactionId}\n\nMaterial:\n${materialsStr}\n\nBarcode:\n${barcodesStr}\n\nCurrent Handler:\n${req.user.fullName}`,
        transaction.transactionId
      );

      await AuditLog.create({
        action: 'HANDLER_TRANSFER_REQUEST',
        entity: 'Transaction',
        entityId: transaction.transactionId,
        user: req.user._id,
        userName: req.user.fullName,
        description: `Handler transfer requested to ${handlerName} for ${transaction.transactionId}`,
      });

      return res.json({ message: 'Handler transfer request sent. Waiting for acceptance.', transaction, pendingTransfer: true });
    }

    // Store admin / super admin: immediate assignment (existing behavior)
    transaction.handler = handlerId;
    transaction.status = 'handler_assigned';
    transaction.requesterRejected = false;
    transaction.rejectedDeliveryStatus = undefined;
    // Clear any pending transfer
    transaction.pendingHandlerTransfer = undefined;
    if (!transaction.chatMembers.includes(handlerId)) {
      transaction.chatMembers.push(handlerId);
    }

    // Reset barcodes to pending_acceptance
    await Barcode.updateMany(
      { transactionId: transaction.transactionId },
      { status: 'pending_acceptance' }
    );

    addTimeline(transaction, 'Handler Assigned', `Handler Assigned: ${handlerName}. Remarks: ${remarks || ''}`, req.user._id, { handlerId });

    await transaction.save();

    await createNotification(
      handlerId,
      'handler_assigned',
      'Handler Assignment',
      `You have been assigned as handler for ${transaction.transactionId}`,
      transaction.transactionId
    );

    await AuditLog.create({
      action: 'ASSIGN_HANDLER',
      entity: 'Transaction',
      entityId: transaction.transactionId,
      user: req.user._id,
      userName: req.user.fullName,
      description: `Assigned handler for ${transaction.transactionId}`,
    });

    res.json({ message: 'Handler assigned.', transaction });
  } catch (error) {
    console.error('Assign handler error:', error);
    try {
      const fs = require('fs');
      fs.writeFileSync('error.log', 'Assign handler error:\n' + (error.stack || error.message || String(error)));
    } catch (e) { }
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

/**
 * Cancel transaction (only before any approval)
 */
exports.cancelTransaction = async (req, res) => {
  try {
    const { id } = req.params;
    const transaction = await Transaction.findOne(getQueryByIdOrTxnId(id));

    if (!transaction) {
      return res.status(404).json({ message: 'Transaction not found.' });
    }

    if (transaction.status !== 'submitted' && transaction.status !== 'draft') {
      return res.status(400).json({ message: 'Cannot cancel transaction after approval.' });
    }

    if (transaction.requester.toString() !== req.user._id.toString() && req.user.role !== 'super_admin') {
      return res.status(403).json({ message: 'Only the requester can cancel.' });
    }

    transaction.status = 'cancelled';
    addTimeline(transaction, 'Cancelled', `Cancelled by ${req.user.fullName}`, req.user._id);
    transaction.chatLocked = true;

    await transaction.save();

    // Cancel all barcodes
    await Barcode.updateMany(
      { transactionId: transaction.transactionId },
      { status: 'Cancelled' }
    );

    res.json({ message: 'Transaction cancelled.', transaction });
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
};

/**
 * Get pending approvals for current user
 */
exports.getPendingApprovals = async (req, res) => {
  try {
    const { department, priority, dueToday, escalated } = req.query;
    const filter = {};

    if (req.user.role === 'team_lead') {
      filter.status = 'submitted';
      filter.department = req.user.department._id || req.user.department;
    } else if (req.user.role === 'department_admin' && req.user.departmentAdminType === 'management') {
      filter.status = 'tl_approved';
      filter.managementApprover = req.user._id;
    } else if (req.user.role === 'super_admin') {
      filter.status = { $in: ['submitted', 'tl_approved', 'mgt_approved'] };
    } else {
      return res.json({ approvals: [] });
    }

    if (department) filter.department = department;
    if (priority) filter.priority = priority;
    if (escalated === 'true') filter.escalated = true;
    if (dueToday === 'true') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      filter.dueDate = { $gte: today, $lt: tomorrow };
    }

    const approvals = await Transaction.find(filter)
      .populate('requester', 'fullName employeeId department')
      .populate('department', 'name')
      .populate('teamLead', 'fullName')
      .sort({ priority: -1, dueDate: 1, createdAt: -1 });

    res.json({
      data: approvals, // Added for frontend compatibility
      approvals
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
};

/**
 * Store Action (Accept / Assign Sourcing Handler / Direct Dispatch)
 */
exports.storeAction = async (req, res) => {
  try {
    const { id } = req.params;
    const { actionType, handlerId, remarks } = req.body;

    const transaction = await Transaction.findOne(getQueryByIdOrTxnId(id));
    if (!transaction) {
      return res.status(404).json({ message: 'Transaction not found.' });
    }

    if (actionType === 'accept') {
      transaction.status = 'store_accepted';
      addTimeline(transaction, 'Store Accepted', `Store accepted the request. ${remarks || ''}`, req.user._id);
    } else if (actionType === 'assign_handler') {
      if (!handlerId) {
        return res.status(400).json({ message: 'Handler is required.' });
      }
      transaction.handler = handlerId;
      transaction.status = 'handler_assigned';
      transaction.requesterRejected = false;
      transaction.rejectedDeliveryStatus = undefined;
      if (!transaction.chatMembers.includes(handlerId)) {
        transaction.chatMembers.push(handlerId);
      }

      // Reset barcodes to pending_acceptance
      await Barcode.updateMany(
        { transactionId: transaction.transactionId },
        { status: 'pending_acceptance' }
      );

      const User = require('../../../models/User');
      const handlerUser = await User.findById(handlerId);
      const handlerName = handlerUser ? handlerUser.fullName : 'Handler';
      addTimeline(transaction, 'Handler Assigned', `Handler Assigned: ${handlerName}. Remarks: ${remarks || ''}`, req.user._id, { handlerId });

      await createNotification(
        handlerId,
        'handler_assigned',
        'Handler Assignment',
        `You have been assigned as handler for ${transaction.transactionId}`,
        transaction.transactionId
      );
    } else if (actionType === 'direct_dispatch') {
      transaction.status = 'dispatched';
      addTimeline(transaction, 'Dispatched', `Direct dispatch bypassed handler: ${remarks || ''}`, req.user._id);
    } else if (actionType === 'accept_rejected_return') {
      if (transaction.rejectedDeliveryStatus !== 'sent_to_store') {
        return res.status(400).json({ message: 'Invalid transaction state for store acceptance.' });
      }
      transaction.status = 'rejected';
      transaction.rejectedDeliveryStatus = 'store_accepted';
      addTimeline(transaction, 'Store Accepted Return', `Store accepted returned materials from handler. ${remarks || ''}`, req.user._id);

      // Cancel all barcodes
      await Barcode.updateMany(
        { transactionId: transaction.transactionId },
        { status: 'Cancelled' }
      );
    } else {
      return res.status(400).json({ message: 'Invalid store action type.' });
    }

    await transaction.save();

    await AuditLog.create({
      action: 'STORE_ACTION',
      entity: 'Transaction',
      entityId: transaction.transactionId,
      user: req.user._id,
      userName: req.user.fullName,
      description: `Store action ${actionType} on transaction ${transaction.transactionId}`,
    });

    res.json({ message: 'Store action logged successfully.', transaction });
  } catch (error) {
    console.error('Store action error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

/**
 * Handler Action (pickup / transit confirmation)
 */
exports.handlerAction = async (req, res) => {
  try {
    const { id } = req.params;
    const { actionType, remarks } = req.body;

    const transaction = await Transaction.findOne(getQueryByIdOrTxnId(id));
    if (!transaction) {
      return res.status(404).json({ message: 'Transaction not found.' });
    }

    // Extract safe ObjectId values handling both populated and unpopulated states
    const handlerId = transaction.handler?._id || transaction.handler;
    const toHandlerId = transaction.pendingHandlerTransfer?.toHandler?._id || transaction.pendingHandlerTransfer?.toHandler;
    const fromHandlerId = transaction.pendingHandlerTransfer?.fromHandler?._id || transaction.pendingHandlerTransfer?.fromHandler;

    // Authorize: handler, pending toHandler, store admin, or super_admin
    const isStoreAdmin = req.user.role === 'department_admin' && req.user.departmentAdminType === 'store';
    const isAssignedHandler = handlerId && handlerId.toString() === req.user._id.toString();
    const isPendingToHandler = transaction.pendingHandlerTransfer?.status === 'pending' &&
      toHandlerId && toHandlerId.toString() === req.user._id.toString();

    if (req.user.role !== 'super_admin' && !isStoreAdmin && !isAssignedHandler && !isPendingToHandler) {
      return res.status(403).json({ message: 'You are not authorized to perform handler actions for this transaction.' });
    }

    if (actionType === 'dispatch') {
      transaction.status = 'dispatched';
      addTimeline(transaction, 'Dispatched', `Items dispatched to requester. ${remarks || ''}`, req.user._id);
    } else if (actionType === 'collect') {
      transaction.status = 'handler_assigned';
      addTimeline(transaction, 'Handler Accepted', `Handler collected materials from store. ${remarks || ''}`, req.user._id);
    } else if (actionType === 'decline' || actionType === 'reject') {
      transaction.status = 'store_accepted';
      transaction.handler = null;
      addTimeline(transaction, 'Handler Declined', `Sourcing assignment declined by handler. Reason: ${remarks || ''}`, req.user._id);
    } else if (actionType === 'send_to_store') {
      const wasRejected = transaction.timeline?.some(t =>
        t.action?.toLowerCase()?.includes('receipt rejected') ||
        t.action?.toLowerCase()?.includes('request rejected')
      );
      const isValidState = (transaction.status === 'dispatched' && transaction.rejectedDeliveryStatus === 'rejected_by_requester') ||
        (transaction.status === 'handler_assigned' && wasRejected);

      if (!isValidState) {
        return res.status(400).json({ message: 'Invalid transaction state for sending to store.' });
      }
      transaction.status = 'dispatched';
      transaction.rejectedDeliveryStatus = 'sent_to_store';
      addTimeline(transaction, 'Returned to Store', `Handler returned rejected materials to store. ${remarks || ''}`, req.user._id);
    } else if (actionType === 'accept_transfer') {
      // Handler-2 accepts pending transfer
      if (!transaction.pendingHandlerTransfer || transaction.pendingHandlerTransfer.status !== 'pending') {
        return res.status(400).json({ message: 'No pending handler transfer request found.' });
      }
      if (!toHandlerId || toHandlerId.toString() !== req.user._id.toString()) {
        return res.status(403).json({ message: 'You are not the target of this handler transfer request.' });
      }

      const User = require('../../../models/User');
      const newHandlerUser = await User.findById(req.user._id);
      const newHandlerName = newHandlerUser ? newHandlerUser.fullName : 'Handler';

      // Transfer ownership
      transaction.handler = req.user._id;
      transaction.pendingHandlerTransfer.status = 'accepted';
      transaction.pendingHandlerTransfer.resolvedAt = new Date();

      // Reset barcodes to pending_acceptance for the new handler
      await Barcode.updateMany(
        { transactionId: transaction.transactionId },
        { status: 'pending_acceptance' }
      );

      addTimeline(transaction, 'Handler Transfer Accepted', `Handler transfer accepted by ${newHandlerName}. ${remarks || ''}`, req.user._id, { fromHandler: fromHandlerId, toHandler: req.user._id });

      // Notify Handler-1
      await createNotification(
        fromHandlerId,
        'handler_transfer_accepted',
        'Handler Transfer Accepted',
        `${newHandlerName} has accepted the handler transfer for ${transaction.transactionId}. You are no longer the handler.`,
        transaction.transactionId
      );
    } else if (actionType === 'reject_transfer') {
      // Handler-2 rejects pending transfer
      if (!transaction.pendingHandlerTransfer || transaction.pendingHandlerTransfer.status !== 'pending') {
        return res.status(400).json({ message: 'No pending handler transfer request found.' });
      }
      if (!toHandlerId || toHandlerId.toString() !== req.user._id.toString()) {
        return res.status(403).json({ message: 'You are not the target of this handler transfer request.' });
      }

      const User = require('../../../models/User');
      const rejectingUser = await User.findById(req.user._id);
      const rejectingName = rejectingUser ? rejectingUser.fullName : 'Handler';

      transaction.pendingHandlerTransfer.status = 'rejected';
      transaction.pendingHandlerTransfer.rejectReason = remarks || 'No reason provided';
      transaction.pendingHandlerTransfer.resolvedAt = new Date();
      // handler field stays unchanged — Handler-1 retains ownership

      addTimeline(transaction, 'Handler Transfer Rejected', `Handler transfer rejected by ${rejectingName}. Reason: ${remarks || 'No reason provided'}`, req.user._id, { fromHandler: fromHandlerId, toHandler: req.user._id });

      // Notify Handler-1 (fromHandler)
      await createNotification(
        fromHandlerId,
        'handler_transfer_rejected',
        'Handler Assignment Rejected',
        `Handler: ${rejectingName}\nReason: ${remarks || 'No reason provided'}\n\nMaterial returned to your responsibility. Please assign another handler or deliver yourself.`,
        transaction.transactionId
      );

      // Notify Store Admin (if configured)
      if (transaction.store) {
        await createNotification(
          transaction.store,
          'handler_transfer_rejected_store',
          'Handler Transfer Rejected',
          `Handler transfer rejected. Current owner remains ${rejectingUser ? rejectingUser.fullName : 'Handler'}.`,
          transaction.transactionId
        );
      }
    } else if (actionType === 'cancel_transfer') {
      // Handler-1 cancels their own pending transfer
      if (!transaction.pendingHandlerTransfer || transaction.pendingHandlerTransfer.status !== 'pending') {
        return res.status(400).json({ message: 'No pending handler transfer request to cancel.' });
      }
      if (!fromHandlerId || fromHandlerId.toString() !== req.user._id.toString()) {
        return res.status(403).json({ message: 'You are not the initiator of this handler transfer request.' });
      }

      transaction.pendingHandlerTransfer.status = 'cancelled';
      transaction.pendingHandlerTransfer.rejectReason = 'Cancelled by sender';
      transaction.pendingHandlerTransfer.resolvedAt = new Date();

      addTimeline(transaction, 'Handler Transfer Cancelled', `Handler transfer request cancelled by ${req.user.fullName}.`, req.user._id);

      // Notify Handler-2
      await createNotification(
        toHandlerId,
        'handler_transfer_cancelled',
        'Handler Transfer Cancelled',
        `Handler transfer request for ${transaction.transactionId} has been cancelled by ${req.user.fullName}.`,
        transaction.transactionId
      );
    } else {
      return res.status(400).json({ message: 'Invalid handler action type.' });
    }

    await transaction.save();

    await AuditLog.create({
      action: 'HANDLER_ACTION',
      entity: 'Transaction',
      entityId: transaction.transactionId,
      user: req.user._id,
      userName: req.user.fullName,
      description: `Handler action ${actionType} on transaction ${transaction.transactionId}`,
    });

    res.json({ message: 'Handler action logged successfully.', transaction });
  } catch (error) {
    console.error('Handler action error:', error);
    try {
      const fs = require('fs');
      fs.writeFileSync('error.log', 'Handler action error:\n' + (error.stack || error.message || String(error)));
    } catch (e) { }
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

/**
 * Physical Receiving Confirmation & Barcode Inventory Activation
 */
exports.receiveTransaction = async (req, res) => {
  try {
    const { id } = req.params;
    const { receiverGeo, materialCondition, remarks, photo } = req.body;

    const transaction = await Transaction.findOne(getQueryByIdOrTxnId(id));
    if (!transaction) {
      return res.status(404).json({ message: 'Transaction not found.' });
    }

    if (['active', 'received', 'closed'].includes(transaction.status)) {
      return res.status(400).json({ message: 'Transaction has already been received.' });
    }

    transaction.status = 'active';
    addTimeline(transaction, 'Received', `Materials received in ${materialCondition} condition. ${remarks || ''}`, req.user._id);
    await transaction.save();

    // Distribute barcodes: Update their owner to the transaction requester, update status to Active, add history
    await Barcode.updateMany(
      { $or: [{ transactionId: transaction.transactionId }, { transaction: transaction._id }] },
      {
        owner: transaction.requester,
        ownerDepartment: transaction.department,
        status: 'Active'
      }
    );

    // Add history log to each barcode
    const barcodes = await Barcode.find({ $or: [{ transactionId: transaction.transactionId }, { transaction: transaction._id }] });
    for (const bc of barcodes) {
      bc.history.push({
        action: 'Received',
        user: req.user._id,
        remarks: remarks || 'GPS & Photo Captured',
        timestamp: new Date()
      });
      bc.ownershipHistory.push({
        user: transaction.requester,
        department: transaction.department,
        action: 'received',
        remarks: `Ownership transferred via transaction ${transaction.transactionId}`
      });
      if (photo) {
        bc.photos = bc.photos || [];
        bc.photos.push({ url: photo, uploadedAt: new Date() });
      }
      if (receiverGeo) {
        bc.gps = {
          lat: receiverGeo.lat || 18.5204,
          lng: receiverGeo.lng || 73.8567,
          address: receiverGeo.address || 'MIDC kolhapur, India'
        };
      }
      await bc.save();
    }

    await AuditLog.create({
      action: 'RECEIVE',
      entity: 'Transaction',
      entityId: transaction.transactionId,
      user: req.user._id,
      userName: req.user.fullName,
      description: `Physically received transaction ${transaction.transactionId}`,
    });

    // Post Gokul Shirgaon Godown Transfer to Tally using the exact employee/Godown name when they receive it
    try {
      const tallyController = require('./tally.controller');
      await transaction.populate('requester');
      const destinationGodown = transaction.requester ? transaction.requester.fullName : 'Main Location';
      const tallyVoucherNumber = await tallyController.createTallyStockJournal(transaction.transactionId, destinationGodown, transaction.materials);
      if (tallyVoucherNumber) {
        transaction.documentNumber = tallyVoucherNumber;
        await transaction.save();
        console.log(`Successfully updated transaction ${transaction.transactionId} with Tally voucher number: ${tallyVoucherNumber}`);
      }
    } catch (tallyInitErr) {
      console.error('Failed to initialize Tally Gokul Shirgaon Godown Transfer post:', tallyInitErr.message);
    }

    res.json({ message: 'Transaction received and barcodes activated.', transaction });
  } catch (error) {
    console.error('Receive error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

/**
 * Assign Management Approver for a transaction
 */
exports.assignManagementApprover = async (req, res) => {
  try {
    const { id } = req.params;
    const { managementId } = req.body;

    const transaction = await Transaction.findOne(getQueryByIdOrTxnId(id));
    if (!transaction) {
      return res.status(404).json({ message: 'Transaction not found.' });
    }

    if (!managementId) {
      return res.status(400).json({ message: 'Management approver is required.' });
    }

    const User = require('../../../models/User');
    const mgtUser = await User.findById(managementId);
    if (!mgtUser || (!['department_admin', 'admin', 'super_admin', 'company_admin'].includes(mgtUser.role) && mgtUser.effectiveRoleLevel !== 1)) {
      return res.status(400).json({ message: 'Selected user is not a valid manager or level 1 approver.' });
    }

    transaction.managementApprover = managementId;
    if (!transaction.chatMembers.includes(managementId)) {
      transaction.chatMembers.push(managementId);
    }

    addTimeline(transaction, 'Management Assigned', `Management approver assigned: ${mgtUser.fullName}`, req.user._id);
    await transaction.save();

    // Send notification to the assigned management user
    await createNotification(
      managementId,
      'request_created',
      'Management Approval Required',
      `You have been assigned to approve request ${transaction.transactionId}`,
      transaction.transactionId
    );

    res.json({ message: 'Management approver assigned successfully.', transaction });
  } catch (error) {
    console.error('Assign management error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

/**
 * Requester Rejects Material Receipt
 */
exports.rejectReceipt = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const transaction = await Transaction.findOne(getQueryByIdOrTxnId(id));
    if (!transaction) return res.status(404).json({ message: 'Transaction not found.' });

    // Validate that the user is the requester (or super_admin)
    if (transaction.requester.toString() !== req.user._id.toString() && req.user.role !== 'super_admin') {
      return res.status(403).json({ message: 'Only the requester can reject this receipt.' });
    }

    // Verify it is a direct dispatch (handler is null)
    if (transaction.handler) {
      return res.status(400).json({ message: 'Receipt rejection is only allowed for direct store dispatches.' });
    }

    // Must be in dispatched status
    if (transaction.status !== 'dispatched') {
      return res.status(400).json({ message: 'Transaction must be in dispatched status to reject receipt.' });
    }

    // Set transaction status to 'rejected'
    transaction.status = 'rejected';
    transaction.rejectionReason = reason || 'Rejected by requester upon direct delivery';

    // Add timeline entry
    addTimeline(transaction, 'Request Rejected', `Direct delivery receipt rejected by requester: ${reason || 'No remarks'}`, req.user._id);

    // Set all barcodes to 'Cancelled' in Barcode collection
    await Barcode.updateMany(
      { transactionId: transaction.transactionId },
      { status: 'Cancelled' }
    );

    // Update barcode status inside transaction materials barcodes list as well
    transaction.materials = transaction.materials.map(m => {
      if (m.barcodes) {
        m.barcodes = m.barcodes.map(b => {
          b.status = 'Cancelled';
          return b;
        });
      }
      return m;
    });

    await transaction.save();

    res.json({ message: 'Transaction rejected successfully.', data: transaction });
  } catch (error) {
    console.error('Reject receipt error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

/**
 * Store dispatches/registers a transaction request (fills barcodes, assigns handler or sends direct)
 */
exports.storeDispatchTransaction = async (req, res) => {
  try {
    const { transactionId } = req.params;
    const {
      receiver,
      otherReceiverName,
      documentType,
      documentNumber,
      expectedReturnDate,
      priority,
      costCenter,
      dcType,
      materials,
      dispatchMethod,
      handlerId,
      remarks
    } = req.body;

    const transaction = await Transaction.findOne(getQueryByIdOrTxnId(transactionId));
    if (!transaction) return res.status(404).json({ message: 'Transaction not found.' });

    // Validate barcodes
    for (const mat of materials) {
      if (!mat.barcodes || mat.barcodes.length !== mat.quantity) {
        return res.status(400).json({
          message: `Material "${mat.name}" requires ${mat.quantity} barcode(s). Got ${mat.barcodes?.length || 0}.`,
        });
      }
    }

    const allBarcodes = materials.flatMap((m) => m.barcodes);
    const uniqueBarcodes = new Set(allBarcodes);
    if (uniqueBarcodes.size !== allBarcodes.length) {
      return res.status(400).json({ message: 'Duplicate barcodes entered.' });
    }

    const existingBarcodes = await Barcode.find({ barcode: { $in: allBarcodes } });
    const User = require('../../../models/User');
    const storeAdmin = await User.findOne({ role: 'department_admin', departmentAdminType: 'store' });
    const storeAdminId = storeAdmin ? storeAdmin._id.toString() : null;

    for (const eb of existingBarcodes) {
      const isOwnedByStore = storeAdminId && eb.owner && eb.owner.toString() === storeAdminId;
      const isReturnedOrCancelled = ['Returned', 'Cancelled'].includes(eb.status);
      if (!isOwnedByStore && !isReturnedOrCancelled) {
        return res.status(400).json({
          message: `Barcode "${eb.barcode}" is currently active under another owner and cannot be dispatched.`,
        });
      }
    }

    // Save receiver and document details
    transaction.receiver = receiver || undefined;
    transaction.otherReceiverName = otherReceiverName || '';
    transaction.documentType = documentType || 'RDC';
    transaction.documentNumber = documentNumber;
    transaction.expectedReturnDate = expectedReturnDate;
    transaction.priority = priority || 'medium';
    transaction.costCenter = costCenter || '';
    transaction.dcType = dcType || 'DC-Internal';
    transaction.remarks = remarks || '';
    if (req.body.photos) {
      transaction.photos = req.body.photos;
    }

    // Update materials array inside transaction
    transaction.materials = materials.map((m) => ({
      name: m.name,
      description: m.description || '',
      quantity: m.quantity,
      unit: m.unit || 'pcs',
      price: m.price || 0,
      barcodes: m.barcodes.map((bcStr) => ({
        barcode: bcStr,
        status: 'Active',
        owner: transaction.requester,
      })),
      photos: m.photos || [],
    }));

    // Register or update each barcode inside the Barcode collection
    for (const mat of materials) {
      for (const bcStr of mat.barcodes) {
        const existingBc = existingBarcodes.find(b => b.barcode === bcStr);
        if (existingBc) {
          existingBc.transactionId = transaction.transactionId;
          existingBc.transaction = transaction._id;
          existingBc.materialName = mat.name;
          existingBc.status = 'Active';
          existingBc.owner = transaction.requester;
          existingBc.ownerDepartment = transaction.department;
          existingBc.ownershipHistory.push({
            user: transaction.requester,
            department: transaction.department,
            action: 'received',
            remarks: 'Re-dispatched from store',
          });
          existingBc.history.push({
            action: 'Dispatched from Store',
            user: req.user._id,
            remarks: remarks || 'Re-dispatched from store',
          });
          await existingBc.save();
        } else {
          await Barcode.create({
            barcode: bcStr,
            transactionId: transaction.transactionId,
            transaction: transaction._id,
            materialName: mat.name,
            status: 'Active',
            owner: transaction.requester,
            ownerDepartment: transaction.department,
            ownershipHistory: [
              {
                user: transaction.requester,
                department: transaction.department,
                action: 'created',
                remarks: 'Dispatched from store',
              },
            ],
            history: [
              {
                action: 'Dispatched from Store',
                user: req.user._id,
                remarks: remarks || 'Dispatched from store',
              },
            ],
          });
        }
      }
    }

    // Determine status and handler based on dispatchMethod
    if (dispatchMethod === 'direct') {
      transaction.status = 'dispatched';
      transaction.handler = null;
      addTimeline(transaction, 'Dispatched', 'Materials dispatched direct to requester', req.user._id);
    } else {
      transaction.status = 'handler_assigned';
      transaction.handler = handlerId;
      const User = require('../../../models/User');
      const handlerUser = await User.findById(handlerId);
      const handlerName = handlerUser ? handlerUser.fullName : 'Handler';
      addTimeline(transaction, 'Handler Assigned', `Handler Assigned: ${handlerName}. Remarks: Assigned handler for delivery`, req.user._id);
    }

    await transaction.save();

    // Create notifications
    await createNotification(
      transaction.requester,
      'material_dispatched',
      'Materials Dispatched',
      `Your request ${transaction.transactionId} has been dispatched from store.`,
      transaction.transactionId
    );

    if (dispatchMethod === 'handler' && handlerId) {
      await createNotification(
        handlerId,
        'handler_assigned',
        'Handler Job Assigned',
        `You have been assigned to deliver request ${transaction.transactionId}`,
        transaction.transactionId
      );
    }

    await AuditLog.create({
      action: 'DISPATCH',
      entity: 'Transaction',
      entityId: transaction.transactionId,
      user: req.user._id,
      userName: req.user.fullName,
      description: `Dispatched transaction ${transaction.transactionId} via ${dispatchMethod}`,
    });

    res.json({ message: 'Transaction dispatched successfully.', transaction });
  } catch (error) {
    console.error('Store dispatch transaction error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

/**
 * Update transaction (allows editing and resubmitting requests)
 */
exports.updateTransaction = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const transaction = await Transaction.findOne(getQueryByIdOrTxnId(id));
    if (!transaction) {
      return res.status(404).json({ message: 'Transaction not found.' });
    }

    if (transaction.status === 'rejected') {
      return res.status(400).json({ message: 'Cannot edit a rejected transaction.' });
    }

    if (transaction.requester.toString() !== req.user._id.toString() && req.user.role !== 'super_admin') {
      return res.status(403).json({ message: 'You are not authorized to edit this transaction.' });
    }

    // Update attributes
    if (updates.receiver !== undefined) transaction.receiver = updates.receiver || undefined;
    if (updates.otherReceiverName !== undefined) transaction.otherReceiverName = updates.otherReceiverName || '';
    if (updates.documentType !== undefined) transaction.documentType = updates.documentType;
    if (updates.documentNumber !== undefined) transaction.documentNumber = updates.documentNumber;
    if (updates.expectedReturnDate !== undefined) transaction.expectedReturnDate = updates.expectedReturnDate;
    if (updates.priority !== undefined) transaction.priority = updates.priority;
    if (updates.costCenter !== undefined) transaction.costCenter = updates.costCenter;
    if (updates.dcType !== undefined) transaction.dcType = updates.dcType;
    if (updates.description !== undefined) transaction.description = updates.description;

    if (updates.materials !== undefined) {
      transaction.materials = updates.materials.map(m => ({
        name: m.name,
        description: m.description || '',
        quantity: m.quantity || m.qty || 1,
        unit: m.unit || 'pcs',
        barcodes: m.barcodes || []
      }));
    }

    // If transaction was rejected, reset status to submitted
    if (transaction.status === 'rejected') {
      transaction.status = 'submitted';
      transaction.rejectionReason = '';
      transaction.approvalChain = [];
      addTimeline(transaction, 'Request Resubmitted', 'Requester edited and resubmitted the rejected request', req.user._id);
    } else {
      addTimeline(transaction, 'Request Updated', 'Requester edited transaction details', req.user._id);
    }

    await transaction.save();
    res.json({ message: 'Transaction updated successfully.', transaction });
  } catch (error) {
    console.error('Update transaction error:', error);
    res.status(500).json({ message: 'Server error updating transaction.' });
  }
};

exports.exportTransactionToExcel = async (req, res) => {
  try {
    const ExcelJS = require('exceljs');
    const transaction = await Transaction.findOne(getQueryByIdOrTxnId(req.params.id))
      .populate('requester', 'fullName employeeId')
      .populate('receiver', 'fullName employeeId')
      .populate('handler', 'fullName employeeId')
      .populate('department', 'name code');

    if (!transaction) {
      return res.status(404).json({ message: 'Transaction not found.' });
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Material Movement System';
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet(`Challan_${transaction.transactionId}`);

    worksheet.columns = [
      { header: 'Field', key: 'field', width: 25 },
      { header: 'Value', key: 'value', width: 55 },
    ];

    // Header styling
    worksheet.getRow(1).eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
    });

    worksheet.addRow({ field: 'Transaction ID', value: transaction.transactionId });
    worksheet.addRow({ field: 'Status', value: transaction.status.toUpperCase() });
    worksheet.addRow({ field: 'Document Type', value: transaction.documentType || 'N/A' });
    worksheet.addRow({ field: 'Document Number', value: transaction.documentNumber || 'N/A' });
    worksheet.addRow({ field: 'Date Created', value: new Date(transaction.createdAt).toLocaleDateString('en-IN') });
    worksheet.addRow({ field: 'Expected Return Date', value: transaction.expectedReturnDate ? new Date(transaction.expectedReturnDate).toLocaleDateString('en-IN') : 'N/A' });
    worksheet.addRow({ field: 'Priority', value: transaction.priority || 'medium' });
    worksheet.addRow({ field: 'Cost Center', value: transaction.costCenter || 'N/A' });
    worksheet.addRow({ field: 'DC Type', value: transaction.dcType || 'N/A' });
    worksheet.addRow({ field: 'Description / Purpose', value: transaction.description || '-' });
    worksheet.addRow({ field: 'Remarks', value: transaction.remarks || '-' });

    // Sender Details
    worksheet.addRow({ field: '--- Sender / Requester Details ---', value: '' });
    worksheet.addRow({ field: 'Name', value: transaction.requester?.fullName || 'N/A' });
    worksheet.addRow({ field: 'Employee ID', value: transaction.requester?.employeeId || 'N/A' });
    worksheet.addRow({ field: 'Department', value: transaction.department?.name || 'N/A' });

    // Receiver Details
    worksheet.addRow({ field: '--- Receiver Details ---', value: '' });
    worksheet.addRow({ field: 'Name', value: transaction.receiver?.fullName || transaction.otherReceiverName || 'N/A' });
    worksheet.addRow({ field: 'Employee ID', value: transaction.receiver?.employeeId || 'N/A' });

    // Handler Details
    if (transaction.handler) {
      worksheet.addRow({ field: '--- Handler Details ---', value: '' });
      worksheet.addRow({ field: 'Name', value: transaction.handler?.fullName || 'N/A' });
      worksheet.addRow({ field: 'Employee ID', value: transaction.handler?.employeeId || 'N/A' });
    }

    // Materials Breakdown
    worksheet.addRow({ field: '--- Materials Breakdown ---', value: '' });
    let grandTotal = 0;
    transaction.materials.forEach((mat, index) => {
      const price = mat.price || 0;
      const quantity = mat.quantity || 0;
      const total = price * quantity;
      grandTotal += total;

      worksheet.addRow({
        field: `Material ${index + 1}`,
        value: `${mat.name} - ${quantity} ${mat.unit} - Price: ₹${price} - Total: ₹${total}`
      });
      if (mat.description) {
        worksheet.addRow({ field: '  Description', value: mat.description });
      }
      if (mat.barcodes && mat.barcodes.length > 0) {
        const barcodesStr = mat.barcodes.map(b => b.barcode).join(', ');
        worksheet.addRow({ field: '  Barcodes', value: barcodesStr });
      }
    });

    worksheet.addRow({ field: 'Grand Total', value: `₹${grandTotal.toLocaleString('en-IN')}` });

    // Style data rows
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber > 1) {
        row.eachCell((cell) => {
          cell.border = { top: { style: 'thin', color: { argb: 'FFD1D5DB' } }, bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } }, left: { style: 'thin', color: { argb: 'FFD1D5DB' } }, right: { style: 'thin', color: { argb: 'FFD1D5DB' } } };
          cell.alignment = { vertical: 'middle' };
        });
      }
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=Challan_${transaction.transactionId}.xlsx`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Export transaction to excel error:', error);
    res.status(500).json({ message: 'Failed to export transaction to Excel.', error: error.message });
  }
};

exports.exportTransactionToPDF = async (req, res) => {
  try {
    const PDFDocument = require('pdfkit');
    const transaction = await Transaction.findOne(getQueryByIdOrTxnId(req.params.id))
      .populate('requester', 'fullName employeeId')
      .populate('receiver', 'fullName employeeId')
      .populate('handler', 'fullName employeeId')
      .populate('department', 'name code');

    if (!transaction) {
      return res.status(404).json({ message: 'Transaction not found.' });
    }

    const doc = new PDFDocument({ margin: 50 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=Challan_${transaction.transactionId}.pdf`);

    doc.pipe(res);

    // Title
    doc
      .fontSize(20)
      .text('Material Movement Challan', { align: 'center' })
      .moveDown();

    // General Details
    doc.fontSize(14).text('General Details', { underline: true });
    doc.fontSize(11).moveDown(0.5);
    doc.text(`Transaction ID: ${transaction.transactionId}`);
    doc.text(`Status: ${transaction.status.toUpperCase()}`);
    doc.text(`Document Type: ${transaction.documentType || 'N/A'}`);
    doc.text(`Document Number: ${transaction.documentNumber || 'N/A'}`);
    doc.text(`Created Date: ${new Date(transaction.createdAt).toLocaleDateString('en-IN')} ${new Date(transaction.createdAt).toLocaleTimeString('en-IN')}`);
    doc.text(`Expected Return Date: ${transaction.expectedReturnDate ? new Date(transaction.expectedReturnDate).toLocaleDateString('en-IN') : 'N/A'}`);
    doc.text(`Priority: ${transaction.priority || 'medium'}`);
    doc.text(`Cost Center: ${transaction.costCenter || 'N/A'}`);
    doc.text(`DC Type: ${transaction.dcType || 'N/A'}`);
    doc.text(`Purpose: ${transaction.description || '-'}`);
    doc.text(`Remarks: ${transaction.remarks || '-'}`);
    doc.moveDown();

    // Sender & Receiver Details
    doc.fontSize(14).text('Parties Details', { underline: true });
    doc.fontSize(11).moveDown(0.5);
    doc.text(`Sender (Requester): ${transaction.requester?.fullName || 'N/A'} (Emp ID: ${transaction.requester?.employeeId || 'N/A'})`);
    doc.text(`Sender Department: ${transaction.department?.name || 'N/A'}`);
    doc.text(`Receiver: ${transaction.receiver?.fullName || transaction.otherReceiverName || 'N/A'} (Emp ID: ${transaction.receiver?.employeeId || 'N/A'})`);
    if (transaction.handler) {
      doc.text(`Handler Assigned: ${transaction.handler?.fullName || 'N/A'} (Emp ID: ${transaction.handler?.employeeId || 'N/A'})`);
    }
    doc.moveDown();

    // Materials List
    doc.fontSize(14).text('Materials Breakdown', { underline: true });
    doc.fontSize(11).moveDown(0.5);

    let grandTotal = 0;
    if (transaction.materials && transaction.materials.length > 0) {
      transaction.materials.forEach((mat, index) => {
        const price = mat.price || 0;
        const quantity = mat.quantity || 0;
        const total = price * quantity;
        grandTotal += total;

        doc.text(`Material ${index + 1}: ${mat.name} - ${quantity} ${mat.unit} - Price: ₹${price} - Total: ₹${total}`, { bold: true });
        if (mat.description) doc.text(`  Description: ${mat.description}`);
        if (mat.barcodes && mat.barcodes.length > 0) {
          const barcodesStr = mat.barcodes.map(b => b.barcode).join(', ');
          doc.text(`  Barcodes: ${barcodesStr}`);
        }
        doc.moveDown(0.5);
      });
      doc.moveDown();
      doc.fontSize(13).text(`Grand Total: ₹${grandTotal.toLocaleString('en-IN')}`, { align: 'right' });
    } else {
      doc.text('No materials listed.');
    }

    doc.end();
  } catch (error) {
    console.error('Export transaction to pdf error:', error);
    res.status(500).json({ message: 'Failed to export transaction to PDF.', error: error.message });
  }
};

exports.deleteTransaction = async (req, res) => {
  try {
    // Helper function to query by ID or transactionId
    const query = mongoose.Types.ObjectId.isValid(req.params.id)
      ? { _id: req.params.id }
      : { transactionId: req.params.id };

    const transaction = await Transaction.findOne(query);

    if (!transaction) {
      return res.status(404).json({ message: 'Transaction request not found.' });
    }

    // Only allow deletion if the request status is "submitted" (before Team Lead approval)
    if (transaction.status !== 'submitted' && transaction.status !== 'draft') {
      return res.status(400).json({
        message: `Cannot delete request. Current status is "${transaction.status.toUpperCase()}", which means it is already processed or approved.`,
      });
    }

    // Check if the current user is the owner (requester) of the transaction, or a super admin
    const isOwner = transaction.requester.toString() === req.user._id.toString();
    const isSuperAdmin = req.user.role === 'super_admin';

    if (!isOwner && !isSuperAdmin) {
      return res.status(430).json({ message: 'You are not authorized to delete this transaction request.' });
    }

    // Perform deletion
    await Transaction.deleteOne({ _id: transaction._id });

    // Clean up associated barcodes (if any are linked to this transaction)
    const Barcode = require('../models/Barcode');
    await Barcode.deleteMany({ transaction: transaction._id });

    res.json({
      success: true,
      message: 'Transaction request deleted successfully.',
    });
  } catch (error) {
    console.error('Delete transaction error:', error);
    res.status(500).json({ message: 'Failed to delete transaction request.', error: error.message });
  }
};

