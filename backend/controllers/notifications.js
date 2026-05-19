const Notification = require('../models/Notification');
const NotificationLog = require('../models/NotificationLog');
const EmployeeNotification = require('../models/EmployeeNotification');
const User = require('../models/User');
const Department = require('../models/Department');
const notificationService = require('../services/notificationService');
const notificationAnalyticsService = require('../services/notificationAnalyticsService');
const { dispatchNotificationDocument } = require('../services/notificationSchedulerService');
const PDFDocument = require('pdfkit');
const XLSX = require('xlsx');

/**
 * Controller to handle all notification-related requests
 */

// @desc    Create and potentially send a notification
// @route   POST /api/notifications
// @access  Private/Admin
exports.createNotification = async (req, res) => {
  try {
    const io = req.app.get('io');
    const notificationData = {
      ...req.body,
      createdBy: req.user.id,
    };

    const notification = await notificationService.createAndSendNotification(notificationData, io);
    res.status(201).json({ success: true, data: notification });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// @desc    Get all notifications (Admin panel management list)
// @route   GET /api/notifications
// @access  Private/Admin
exports.getNotifications = async (req, res) => {
  try {
    const { search = '', type, status, page = 1, limit = 10 } = req.query;

    // Only show campaigns created by admins or seeded campaigns (where createdBy is not null)
    // and exclude individual system/scheduler logs (which have createdBy = null)
    const query = { createdBy: { $ne: null } };

    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ];
    }

    if (type) {
      query.type = type;
    }

    if (status) {
      query.status = status;
    }

    const skip = (page - 1) * limit;

    const total = await Notification.countDocuments(query);
    const notifications = await Notification.find(query)
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit));

    // Get aggregated sent, read, unread metrics for each notification in the list
    const enrichedNotifications = await Promise.all(
      notifications.map(async (notif) => {
        const logs = await NotificationLog.aggregate([
          { $match: { notificationId: notif._id } },
          {
            $group: {
              _id: null,
              sent: { $sum: 1 },
              read: { $sum: { $cond: [{ $eq: ['$isRead', true] }, 1, 0] } },
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
              failed: { $sum: { $cond: [{ $eq: ['$deliveryStatus', 'failed'] }, 1, 0] } }
            }
          }
        ]);

        const counts = logs[0] || { sent: 0, read: 0, unread: 0, failed: 0 };
        return {
          ...notif.toObject(),
          sentCount: counts.sent,
          readCount: counts.read,
          unreadCount: counts.unread,
          failedCount: counts.failed
        };
      })
    );

    res.status(200).json({
      success: true,
      total,
      page: Number(page),
      limit: Number(limit),
      data: enrichedNotifications,
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// @desc    Get notification by ID with delivery metrics
// @route   GET /api/notifications/:id
// @access  Private/Admin
exports.getNotificationById = async (req, res) => {
  try {
    const notification = await Notification.findById(req.params.id).populate('createdBy', 'name email');
    if (!notification) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }

    const logs = await NotificationLog.aggregate([
      { $match: { notificationId: notification._id } },
      {
        $group: {
          _id: null,
          sent: { $sum: 1 },
          read: { $sum: { $cond: [{ $eq: ['$isRead', true] }, 1, 0] } },
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
          failed: { $sum: { $cond: [{ $eq: ['$deliveryStatus', 'failed'] }, 1, 0] } }
        }
      }
    ]);

    const counts = logs[0] || { sent: 0, read: 0, unread: 0, failed: 0 };

    res.status(200).json({
      success: true,
      data: {
        ...notification.toObject(),
        sentCount: counts.sent,
        readCount: counts.read,
        unreadCount: counts.unread,
        failedCount: counts.failed
      }
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// @desc    Update draft or scheduled notification
// @route   PUT /api/notifications/:id
// @access  Private/Admin
exports.updateNotification = async (req, res) => {
  try {
    let notification = await Notification.findById(req.params.id);
    if (!notification) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }

    // Allow modifying any created notification for complete administrator flexibility

    notification = await Notification.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    });

    res.status(200).json({ success: true, data: notification });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// @desc    Delete manual notification and associated logs/feeds
// @route   DELETE /api/notifications/:id
// @access  Private/Admin
exports.deleteNotification = async (req, res) => {
  try {
    const notification = await Notification.findById(req.params.id);
    if (!notification) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }

    // Delete related logs and employee feed entries
    await Promise.all([
      NotificationLog.deleteMany({ notificationId: notification._id }),
      EmployeeNotification.deleteMany({ notificationId: notification._id }),
      Notification.deleteOne({ _id: notification._id }),
    ]);

    res.status(200).json({ success: true, data: {} });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// @desc    Send a draft/scheduled notification immediately
// @route   POST /api/notifications/:id/send
// @access  Private/Admin
exports.sendNotificationImmediately = async (req, res) => {
  try {
    const io = req.app.get('io');
    const notification = await Notification.findById(req.params.id);
    if (!notification) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }

    // Allow manual sending of any notification at any time on-demand without constraints

    await dispatchNotificationDocument(notification, io);

    const reloaded = await Notification.findById(req.params.id);
    if (reloaded && reloaded.status === 'failed') {
      return res.status(400).json({
        success: false,
        message: 'Failed to broadcast: No matching active target employees were found.'
      });
    }

    res.status(200).json({ success: true, data: reloaded || notification });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// @desc    Get detailed notification reports with flexible filters & exports
// @route   GET /api/notifications/reports
// @access  Private/Admin
exports.getNotificationReports = async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      department,
      employeeId,
      type,
      readStatus,
      deliveryStatus,
      search = '',
      exportFormat,
    } = req.query;

    const matchQuery = {};

    // Date range parsing
    if (startDate || endDate) {
      matchQuery.sentAt = {};
      if (startDate) {
        const startStr = startDate.includes('T') ? startDate : `${startDate}T00:00:00.000Z`;
        matchQuery.sentAt.$gte = new Date(startStr);
      }
      if (endDate) {
        const endStr = endDate.includes('T') ? endDate : `${endDate}T23:59:59.999Z`;
        matchQuery.sentAt.$lte = new Date(endStr);
      }
    }

    if (deliveryStatus) {
      matchQuery.deliveryStatus = deliveryStatus;
    }

    if (readStatus) {
      matchQuery.isRead = readStatus === 'true';
    }

    const aggregationPipeline = [
      { $match: matchQuery },
      {
        $lookup: {
          from: 'users',
          localField: 'employeeId',
          foreignField: '_id',
          as: 'employee'
        }
      },
      { $unwind: '$employee' },
      {
        $lookup: {
          from: 'notifications',
          localField: 'notificationId',
          foreignField: '_id',
          as: 'notification'
        }
      },
      { $unwind: '$notification' }
    ];

    // Sub-matching for nested employee and notification fields
    const nestedMatches = {};

    if (department) {
      nestedMatches['employee.department'] = department;
    }

    if (employeeId) {
      nestedMatches['employee._id'] = new require('mongoose').Types.ObjectId(employeeId);
    }

    if (type) {
      nestedMatches['notification.type'] = type;
    }

    if (search) {
      nestedMatches.$or = [
        { 'employee.name': { $regex: search, $options: 'i' } },
        { 'employee.mobile': { $regex: search, $options: 'i' } },
        { 'notification.title': { $regex: search, $options: 'i' } },
      ];
    }

    if (Object.keys(nestedMatches).length > 0) {
      aggregationPipeline.push({ $match: nestedMatches });
    }

    aggregationPipeline.push({
      $project: {
        _id: 1,
        employee: {
          _id: '$employee._id',
          name: '$employee.name',
          mobile: '$employee.mobile',
          department: '$employee.department'
        },
        notification: {
          _id: '$notification._id',
          title: '$notification.title',
          description: '$notification.description',
          type: '$notification.type'
        },
        sentAt: 1,
        readAt: 1,
        deliveryStatus: 1,
        isRead: 1,
        deviceType: 1
      }
    });

    aggregationPipeline.push({ $sort: { sentAt: -1 } });

    const reports = await NotificationLog.aggregate(aggregationPipeline);

    // Dynamic Export Handler
    if (exportFormat) {
      const formattedReports = reports.map((r, index) => ({
        'S.No': index + 1,
        'Employee Name': r.employee?.name || 'N/A',
        'Mobile Number': r.employee?.mobile || 'N/A',
        'Notification Title': r.notification?.title || 'N/A',
        'Notification Type': r.notification?.type || 'N/A',
        'Sent Date': r.sentAt ? new Date(r.sentAt).toLocaleString() : 'N/A',
        'Read Date': r.readAt ? new Date(r.readAt).toLocaleString() : 'N/A',
        'Delivery Status': r.deliveryStatus ? r.deliveryStatus.toUpperCase() : 'N/A',
        'Is Read': r.isRead ? 'YES' : 'NO',
        'Device Type': r.deviceType || 'Web'
      }));

      if (exportFormat === 'csv') {
        const fields = Object.keys(formattedReports[0] || {});
        let csvContent = fields.join(',') + '\n';
        formattedReports.forEach((row) => {
          csvContent += fields.map(f => `"${String(row[f]).replace(/"/g, '""')}"`).join(',') + '\n';
        });
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=notification_report_${Date.now()}.csv`);
        return res.status(200).send(csvContent);
      } 
      
      if (exportFormat === 'xlsx') {
        const ws = XLSX.utils.json_to_sheet(formattedReports);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Notification Report');
        const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=notification_report_${Date.now()}.xlsx`);
        return res.status(200).send(buffer);
      }

      if (exportFormat === 'pdf') {
        const doc = new PDFDocument({ margin: 30 });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=notification_report_${Date.now()}.pdf`);
        doc.pipe(res);

        doc.fontSize(18).text('Geo Attendance HRMS Notification Report', { align: 'center' });
        doc.moveDown();

        formattedReports.forEach((r, i) => {
          doc.fontSize(10).text(`${i+1}. Name: ${r['Employee Name']} | Type: ${r['Notification Type']}`);
          doc.fontSize(9).text(`Title: ${r['Notification Title']}`);
          doc.fontSize(8).text(`Status: ${r['Delivery Status']} | Read: ${r['Is Read']} | Sent: ${r['Sent Date']}`, { fillColor: '#555555' });
          doc.moveDown(0.5);
          if (doc.y > 700) doc.addPage();
        });

        doc.end();
        return;
      }
    }

    res.status(200).json({ success: true, count: reports.length, data: reports });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// @desc    Get notification dashboard charts & telemetry
// @route   GET /api/notifications/analytics
// @access  Private/Admin
exports.getNotificationAnalytics = async (req, res) => {
  try {
    const analytics = await notificationAnalyticsService.getDashboardAnalytics();
    res.status(200).json({ success: true, data: analytics });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// @desc    Register employee's active device token for FCM
// @route   POST /api/notifications/register-token
// @access  Private
exports.registerDeviceToken = async (req, res) => {
  try {
    const { fcmToken, deviceType, lastActiveDevice } = req.body;
    if (!fcmToken) {
      return res.status(400).json({ success: false, message: 'FCM token required' });
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.user.id,
      {
        fcmToken,
        deviceType: deviceType || 'Mobile',
        lastActiveDevice: lastActiveDevice || 'Mobile App',
      },
      { new: true }
    );

    res.status(200).json({
      success: true,
      message: 'FCM Token registered successfully',
      data: {
        fcmToken: updatedUser.fcmToken,
        deviceType: updatedUser.deviceType,
        lastActiveDevice: updatedUser.lastActiveDevice
      }
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// @desc    Get current employee's notification history
// @route   GET /api/notifications/employee/feed
// @access  Private
exports.getEmployeeNotifications = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const total = await EmployeeNotification.countDocuments({ employeeId: req.user.id });
    const notifications = await EmployeeNotification.find({ employeeId: req.user.id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.status(200).json({
      success: true,
      total,
      page,
      limit,
      count: notifications.length,
      data: notifications
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// @desc    Get count of unread employee notifications
// @route   GET /api/notifications/employee/unread-count
// @access  Private
exports.getEmployeeUnreadCount = async (req, res) => {
  try {
    const unreadCount = await EmployeeNotification.countDocuments({
      employeeId: req.user.id,
      isRead: false,
    });

    res.status(200).json({ success: true, count: unreadCount });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// @desc    Mark a single in-app notification as read
// @route   PUT /api/notifications/employee/read/:id
// @access  Private
exports.markEmployeeNotificationRead = async (req, res) => {
  try {
    const io = req.app.get('io');
    const notification = await notificationService.markAsRead(req.user.id, req.params.id, io);

    if (!notification) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }

    res.status(200).json({ success: true, data: notification });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// @desc    Mark all in-app notifications as read for current employee
// @desc    Get notification types and autoTypes from schema
// @route   GET /api/notifications/types
// @access  Private/Admin
exports.getNotificationTypes = async (req, res) => {
  try {
    const types = Notification.schema.path('type').enumValues;
    const autoTypes = Notification.schema.path('autoType').enumValues.filter(val => val !== null);
    res.status(200).json({ success: true, data: { types, autoTypes } });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// @route   PUT /api/notifications/employee/read-all
// @access  Private
exports.markAllEmployeeNotificationsRead = async (req, res) => {
  try {
    const io = req.app.get('io');
    await notificationService.markAllAsRead(req.user.id, io);
    res.status(200).json({ success: true, message: 'All notifications marked as read' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// @desc    Delete a personal notification
// @route   DELETE /api/notifications/employee/:id
// @access  Private
exports.deleteEmployeeNotification = async (req, res) => {
  try {
    const deleted = await notificationService.deleteEmployeeNotification(req.user.id, req.params.id);
    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }

    res.status(200).json({ success: true, data: {} });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};
