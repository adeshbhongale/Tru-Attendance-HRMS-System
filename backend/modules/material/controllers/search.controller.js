const Transaction = require('../models/Transaction');
const User = require('../../../models/User');
const ExternalReceipt = require('../models/ExternalReceipt');

// GET /api/search
const globalSearch = async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 2) {
      return res.status(400).json({ message: 'Search query must be at least 2 characters.' });
    }

    const searchRegex = { $regex: q, $options: 'i' };

    const searchFilter = {
      $or: [
        { transactionId: searchRegex },
        { documentNumber: searchRegex },
        { 'materials.name': searchRegex },
        { 'materials.barcode': searchRegex },
      ],
    };

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
      searchFilter.$and = [{ $or: orConditions }];
    }

    const [transactions, employees, externalReceipts] = await Promise.all([
      Transaction.find(searchFilter)
        .populate('sender', 'fullName employeeId')
        .populate('receiver', 'fullName employeeId')
        .limit(10)
        .select('transactionId status documentType documentNumber createdAt'),

      User.find({
        $or: [
          { fullName: searchRegex },
          { employeeId: searchRegex },
          { email: searchRegex },
        ],
      })
        .populate('department', 'name')
        .limit(10)
        .select('fullName employeeId email department status profilePhoto'),

      ExternalReceipt.find({
        $or: [
          { receiptId: searchRegex },
          { vendorName: searchRegex },
          { customerName: searchRegex },
          { prNumber: searchRegex },
          { poNumber: searchRegex },
          { documentNumber: searchRegex },
        ],
      })
        .limit(10)
        .select('receiptId type vendorName customerName createdAt'),
    ]);

    res.json({
      data: {
        transactions,
        employees,
        externalReceipts,
      },
      total: transactions.length + employees.length + externalReceipts.length,
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

module.exports = { globalSearch };
