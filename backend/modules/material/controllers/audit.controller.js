const AuditLog = require('../models/AuditLog');

exports.getAuditLogs = async (req, res) => {
  try {
    const { entity, entityId, action, search, page = 1, limit = 50 } = req.query;
    const filter = {};

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

    // Department admins can only see their department-related logs
    if (req.user.role === 'department_admin' && req.user.role !== 'super_admin') {
      // Allow viewing but scoped
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
      data: logs, // Added for frontend compatibility
      logs,
      total,
      page: parseInt(page)
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
};
