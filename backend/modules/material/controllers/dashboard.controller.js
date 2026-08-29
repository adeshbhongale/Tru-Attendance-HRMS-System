const Transaction = require('../models/Transaction');
const Barcode = require('../models/Barcode');
const Notification = require('../../../models/Notification');
const InternalReceipt = require('../models/InternalReceipt');
const ExternalReceipt = require('../models/ExternalReceipt');
const AuditLog = require('../models/AuditLog');

const getCompanyQuery = (companyId) => {
  if (!companyId) return {};
  return { $or: [{ companyId }, { company: companyId }, { companyId: null }] };
};

const getTxnFilterForUser = async (user, companyId) => {
  const userId = user._id;
  const userRole = String(user.role || '').toLowerCase();
  const adminType = String(user.departmentAdminType || user.adminType || '').toLowerCase();
  const userDept = user.department?._id || user.department;
  const companyQuery = getCompanyQuery(companyId);
  
  if (['super_admin', 'superadmin', 'admin', 'company_admin'].includes(userRole) || user.scope === 'GLOBAL') {
    return companyQuery;
  }

  if (userRole === 'department_admin') {
    if (adminType === 'store' || adminType === 'management' || adminType === 'accounts' || !adminType) {
      return companyQuery;
    }
  }

  if (['store', 'store_admin', 'management', 'accounts'].includes(userRole)) {
    return companyQuery;
  }
  
  const userBarcodes = await Barcode.find({ owner: userId, ...companyQuery });
  const userTxnIds = userBarcodes.map(b => b.transactionId);
  
  const baseFilter = {
    ...companyQuery,
    $or: [
      { requester: userId },
      { handler: userId },
      { teamLead: userId },
      { managementApprover: userId },
      { store: userId },
      { transactionId: { $in: userTxnIds } }
    ]
  };

  if (userRole === 'team_lead' || userRole === 'department_admin') {
    if (userDept) {
      baseFilter.$or.push({ department: userDept });
    }
  }

  return baseFilter;
};

exports.getStats = async (req, res) => {
  try {
    const userId = req.user._id;
    const userRole = req.user.role;
    const userDept = req.user.department?._id || req.user.department;

    const txnFilter = await getTxnFilterForUser(req.user, req.tenant.companyId);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    const [total, pending, accepted, rejected, completed, todayCount, monthCount, internalCount, externalCount] =
      await Promise.all([
        Transaction.countDocuments(txnFilter),
        Transaction.countDocuments({ ...txnFilter, status: { $in: ['submitted', 'tl_approved', 'mgt_approved'] } }),
        Transaction.countDocuments({ ...txnFilter, status: 'store_accepted' }),
        Transaction.countDocuments({ ...txnFilter, status: 'rejected' }),
        Transaction.countDocuments({ ...txnFilter, status: 'completed' }),
        Transaction.countDocuments({ ...txnFilter, createdAt: { $gte: today } }),
        Transaction.countDocuments({ ...txnFilter, createdAt: { $gte: firstDayOfMonth } }),
        InternalReceipt.countDocuments({ ...(req.tenant.companyId ? { companyId: req.tenant.companyId } : {}), ...(req.user.role === 'super_admin' ? {} : { receiver: userId }) }),
        ExternalReceipt.countDocuments({ ...(req.tenant.companyId ? { companyId: req.tenant.companyId } : {}), ...(req.user.role === 'super_admin' ? {} : { receiver: userId }) }),
      ]);

    res.json({
      data: {
        stats: {
          total,
          pending,
          accepted,
          rejected,
          completed,
          todayCount,
          monthCount,
          internalReceipts: internalCount,
          externalReceipts: externalCount,
        }
      }
    });
  } catch (error) {
    console.error('Stats dashboard error:', error);
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

exports.getChartData = async (req, res) => {
  try {
    const userId = req.user._id;
    const userRole = req.user.role;
    const userDept = req.user.department?._id || req.user.department;

    const txnFilter = await getTxnFilterForUser(req.user, req.tenant.companyId);

    // Daily transactions for last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [dailyTransactions, docTypeDistribution] = await Promise.all([
      Transaction.aggregate([
        { $match: { ...txnFilter, createdAt: { $gte: thirtyDaysAgo } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      Transaction.aggregate([
        { $match: txnFilter },
        { $group: { _id: '$documentType', count: { $sum: 1 } } },
      ]),
    ]);

    res.json({
      data: {
        charts: {
          dailyTransactions,
          docTypeDistribution,
        }
      }
    });
  } catch (error) {
    console.error('Charts dashboard error:', error);
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

exports.getRecentActivities = async (req, res) => {
  try {
    const audits = await AuditLog.find(req.tenant.companyId ? { companyId: req.tenant.companyId } : {})
      .populate('user', 'fullName employeeId profilePhoto')
      .sort({ createdAt: -1 })
      .limit(20);

    const mapped = (audits || []).map((a) => ({
      _id: a._id,
      user: a.user,
      action: a.action,
      details: a.description || `${a.entity} ${a.entityId}`,
      createdAt: a.createdAt,
    }));

    res.json({ data: mapped });
  } catch (error) {
    console.error('Recent activities dashboard error:', error);
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

exports.getDashboard = async (req, res) => {
  try {
    const userId = req.user._id;
    const userRole = req.user.role;
    const userDept = req.user.department?._id || req.user.department;

    const txnFilter = await getTxnFilterForUser(req.user, req.tenant.companyId);

    const [
      totalTransactions,
      activeItems,
      pendingCount,
      returnedCount,
      closedCount,
      recentTransactions,
      unreadNotifications,
    ] = await Promise.all([
      Transaction.countDocuments(txnFilter),
      Transaction.countDocuments({ ...txnFilter, status: { $in: ['received', 'active', 'partially_returned'] } }),
      Transaction.countDocuments({ ...txnFilter, status: { $in: ['submitted', 'tl_approved', 'mgt_approved'] } }),
      Transaction.countDocuments({ ...txnFilter, status: 'partially_returned' }),
      Transaction.countDocuments({ ...txnFilter, status: 'closed' }),
      Transaction.find(txnFilter)
        .populate('requester', 'fullName employeeId')
        .populate('department', 'name')
        .sort({ createdAt: -1 })
        .limit(5),
      Notification.countDocuments({ user: userId, read: false, ...(req.tenant.companyId ? { companyId: req.tenant.companyId } : {}) }),
    ]);

    // Status distribution for chart
    const statusCounts = await Transaction.aggregate([
      { $match: txnFilter },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);

    // Requests over time (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const requestsOverTime = await Transaction.aggregate([
      { $match: { ...txnFilter, createdAt: { $gte: thirtyDaysAgo } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // Barcode summary
    let barcodeFilter = req.tenant.companyId ? { companyId: req.tenant.companyId } : {};
    if (userRole !== 'super_admin') {
      barcodeFilter.owner = userId;
    }

    const [activeBarcodes, returnedBarcodes] = await Promise.all([
      Barcode.countDocuments({ ...barcodeFilter, status: 'Active' }),
      Barcode.countDocuments({ ...barcodeFilter, status: 'Returned' }),
    ]);

    res.json({
      kpi: {
        activeItems: activeBarcodes,
        pending: pendingCount,
        returned: returnedBarcodes,
        closed: closedCount,
        totalTransactions,
        unreadNotifications,
      },
      statusDistribution: statusCounts,
      requestsOverTime,
      recentTransactions,
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};
