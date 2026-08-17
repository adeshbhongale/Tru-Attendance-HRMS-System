const NotificationLog = require('../models/NotificationLog');
const Notification = require('../models/Notification');
const User = require('../models/User');

/**
 * Service to aggregate notification telemetry and delivery reports
 */

/**
 * Retrieves high-level notification delivery summary metrics
 */
const getGlobalAnalytics = async (companyId = null) => {
  // Aggregate log states
  const matchStage = companyId ? { companyId } : {};
  const stats = await NotificationLog.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: null,
        totalSent: { $sum: 1 },
        delivered: {
          $sum: {
            $cond: [
              { $in: ['$deliveryStatus', ['delivered', 'read']] },
              1,
              0
            ]
          }
        },
        read: {
          $sum: {
            $cond: [{ $eq: ['$isRead', true] }, 1, 0]
          }
        },
        unread: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $eq: ['$isRead', false] },
                  { $ne: ['$deliveryStatus', 'failed'] }
                ]
              },
              1,
              0
            ]
          }
        },
        failed: {
          $sum: {
            $cond: [{ $eq: ['$deliveryStatus', 'failed'] }, 1, 0]
          }
        }
      }
    }
  ]);

  const defaultStats = {
    totalSent: 0,
    delivered: 0,
    read: 0,
    unread: 0,
    failed: 0,
    openRate: 0
  };

  if (!stats || stats.length === 0) {
    return defaultStats;
  }

  const res = stats[0];
  delete res._id;

  // Calculate Open Rate: (Read / Delivered) * 100
  res.openRate = res.delivered > 0 ? Math.round((res.read / res.delivered) * 100) : 0;

  return res;
};

/**
 * Retrieves department-wise notification distribution, read, and failure stats
 */
const getDepartmentStats = async (companyId = null) => {
  // We need to resolve employee departments and join them with the notification logs
  const matchStage = companyId ? { companyId } : {};
  const departmentBreakdown = await NotificationLog.aggregate([
    { $match: matchStage },
    {
      $lookup: {
        from: 'users', // name of the collection in mongo (plural of User)
        localField: 'employeeId',
        foreignField: '_id',
        as: 'employee'
      }
    },
    {
      $unwind: '$employee'
    },
    {
      $group: {
        _id: '$employee.department',
        sentCount: { $sum: 1 },
        readCount: {
          $sum: { $cond: [{ $eq: ['$isRead', true] }, 1, 0] }
        },
        failedCount: {
          $sum: { $cond: [{ $eq: ['$deliveryStatus', 'failed'] }, 1, 0] }
        }
      }
    },
    {
      $project: {
        department: { $ifNull: ['$_id', 'Unassigned'] },
        sentCount: 1,
        readCount: 1,
        failedCount: 1,
        unreadCount: { $subtract: ['$sentCount', { $add: ['$readCount', '$failedCount'] }] }
      }
    },
    {
      $sort: { sentCount: -1 }
    }
  ]);

  return departmentBreakdown;
};

/**
 * Retrieves daily sending history for charts (e.g. over the last 14 days)
 */
const getDailyTrends = async (days = 14, companyId = null) => {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  const dailyStats = await NotificationLog.aggregate([
    {
      $match: {
        sentAt: { $gte: cutoffDate },
        ...(companyId ? { companyId } : {})
      }
    },
    {
      $group: {
        _id: {
          $dateToString: { format: '%Y-%m-%d', date: '$sentAt' }
        },
        sentCount: { $sum: 1 },
        readCount: {
          $sum: { $cond: [{ $eq: ['$isRead', true] }, 1, 0] }
        },
        failedCount: {
          $sum: { $cond: [{ $eq: ['$deliveryStatus', 'failed'] }, 1, 0] }
        }
      }
    },
    {
      $project: {
        date: '$_id',
        sentCount: 1,
        readCount: 1,
        failedCount: 1
      }
    },
    {
      $sort: { date: 1 }
    }
  ]);

  return dailyStats;
};

/**
 * Retrieves breakdown by notification types (General, Leave, Geofence, etc.)
 */
const getNotificationTypeBreakdown = async (companyId = null) => {
  const matchStage = companyId ? { companyId } : {};
  const typeStats = await NotificationLog.aggregate([
    { $match: matchStage },
    {
      $lookup: {
        from: 'notifications',
        localField: 'notificationId',
        foreignField: '_id',
        as: 'notification'
      }
    },
    {
      $unwind: '$notification'
    },
    {
      $group: {
        _id: '$notification.type',
        count: { $sum: 1 },
        readCount: {
          $sum: { $cond: [{ $eq: ['$isRead', true] }, 1, 0] }
        }
      }
    },
    {
      $project: {
        type: '$_id',
        count: 1,
        readCount: 1
      }
    },
    {
      $sort: { count: -1 }
    }
  ]);

  return typeStats;
};

/**
 * Combined dashboard reports package
 */
const getDashboardAnalytics = async (companyId = null) => {
  const [global, departments, daily, types] = await Promise.all([
    getGlobalAnalytics(companyId),
    getDepartmentStats(companyId),
    getDailyTrends(14, companyId),
    getNotificationTypeBreakdown(companyId)
  ]);

  // Count active employees and active device tokens
  const empBase = { role: 'employee', status: 'active', ...(companyId ? { companyId } : {}) };
  const activeEmployeeCount = await User.countDocuments(empBase);
  const registeredTokensCount = await User.countDocuments({
    ...empBase,
    fcmToken: { $ne: null }
  });

  return {
    global,
    departments,
    dailyTrends: daily,
    typesBreakdown: types,
    activeEmployeeCount,
    registeredTokensCount
  };
};

module.exports = {
  getGlobalAnalytics,
  getDepartmentStats,
  getDailyTrends,
  getNotificationTypeBreakdown,
  getDashboardAnalytics
};
