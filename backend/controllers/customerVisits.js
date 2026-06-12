const CustomerVisit = require('../models/CustomerVisit');
const Customer = require('../models/Customer');
const User = require('../models/User');
const Attendance = require('../models/Attendance');
const { getISTDateComponents, getStartOfDayIST, getEndOfDayIST, createDateFromIST } = require('../utils/timezone');
const { uploadToCloudinary } = require('../utils/cloudinary');
const notificationService = require('../services/notificationService');
const XLSX = require('xlsx');

// Helper to calculate distance in meters between two coordinates
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  if (lat1 === undefined || lon1 === undefined || lat2 === undefined || lon2 === undefined || lat1 === null || lon1 === null || lat2 === null || lon2 === null) {
    return null;
  }
  const R = 6371e3; // metres
  const phi1 = lat1 * Math.PI / 180;
  const phi2 = lat2 * Math.PI / 180;
  const deltaPhi = (lat2 - lat1) * Math.PI / 180;
  const deltaLambda = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) *
    Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c); // in metres
};

// Helper to update visit statuses dynamically
const updateVisitStatuses = async (io = null) => {
  try {
    const now = new Date();
    const todayISTStart = getStartOfDayIST(now);
    const todayISTEnd = getEndOfDayIST(now);

    // 1. Upcoming -> To Do (if scheduledDate is today and status is Upcoming)
    await CustomerVisit.updateMany({
      status: 'Upcoming',
      scheduledDate: { $gte: todayISTStart, $lte: todayISTEnd }
    }, {
      $set: { status: 'To Do' }
    });

    // 2. To Do / Upcoming -> Over Due (if scheduledDate < todayISTStart and status is To Do or Upcoming)
    const overdueVisits = await CustomerVisit.find({
      status: { $in: ['Upcoming', 'To Do'] },
      scheduledDate: { $lt: todayISTStart }
    });

    if (overdueVisits.length > 0) {
      await CustomerVisit.updateMany({
        _id: { $in: overdueVisits.map(v => v._id) }
      }, {
        $set: { status: 'Over Due' }
      });

      // Send notifications for overdue visits
      for (const visit of overdueVisits) {
        try {
          await notificationService.createAndSendNotification({
            title: 'Visit Overdue',
            description: `Your scheduled visit to ${visit.customerName} is overdue.`,
            type: 'customer visit notification',
            autoType: 'Visit Over Due',
            targetType: 'Specific Employees',
            employees: [visit.employeeId],
            isAuto: true
          }, io);
        } catch (err) {
          console.error('Error sending overdue notification:', err);
        }
      }
    }
  } catch (error) {
    console.error('Error updating visit statuses:', error);
  }
};

// @desc    Create / schedule a visit
// @route   POST /api/visits
// @access  Private
exports.createVisit = async (req, res) => {
  try {
    const { visitType, customerId, customerName, scheduledDate, scheduledTime, reason, employeeId } = req.body;

    const resolvedVisitType = customerId ? 'customer' : 'self';
    let targetCustomerName = customerName;

    if (resolvedVisitType === 'customer') {
      const customer = await Customer.findById(customerId);
      if (!customer) {
        return res.status(404).json({ success: false, message: 'Customer not found' });
      }
      targetCustomerName = customer.customerName;
    } else {
      if (!customerName) {
        return res.status(400).json({ success: false, message: 'Location name is required for self visits' });
      }
    }

    let targetEmployee = req.user;
    if (req.user.role === 'admin') {
      if (!employeeId) {
        return res.status(400).json({ success: false, message: 'Please specify an employee to assign this visit' });
      }
      targetEmployee = await User.findById(employeeId);
      if (!targetEmployee) {
        return res.status(404).json({ success: false, message: 'Employee not found' });
      }
    }

    const schedDate = new Date(scheduledDate);
    const now = new Date();
    const todayStart = getStartOfDayIST(now);
    const todayEnd = getEndOfDayIST(now);

    let status = 'Upcoming';
    if (schedDate >= todayStart && schedDate <= todayEnd) {
      status = 'To Do';
    } else if (schedDate < todayStart) {
      status = 'Over Due';
    }

    const visit = await CustomerVisit.create({
      visitType: resolvedVisitType,
      customerId: resolvedVisitType === 'customer' ? customerId : undefined,
      customerName: targetCustomerName,
      employeeId: targetEmployee._id,
      employeeName: targetEmployee.name,
      scheduledDate: schedDate,
      scheduledTime,
      reason,
      status,
      createdBy: req.user.id
    });

    // Send Notification
    try {
      const io = req.app.get('io');
      const notificationDesc = resolvedVisitType === 'self'
        ? `You have scheduled a self-visit at ${targetCustomerName} on ${new Date(scheduledDate).toLocaleDateString('en-GB')} at ${scheduledTime}.`
        : `You have been assigned a new visit to ${targetCustomerName} on ${new Date(scheduledDate).toLocaleDateString('en-GB')} at ${scheduledTime}.`;

      await notificationService.createAndSendNotification({
        title: resolvedVisitType === 'self' ? 'Self Visit Scheduled' : 'Visit Assigned',
        description: notificationDesc,
        type: 'customer visit notification',
        autoType: 'Visit Assigned',
        targetType: 'Specific Employees',
        employees: [targetEmployee._id],
        isAuto: true
      }, io);
    } catch (e) {
      console.error('FCM assignment notification failed:', e.message);
    }

    res.status(201).json({ success: true, data: visit });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// @desc    Get all visits (Admin sees all, Employee sees only theirs)
// @route   GET /api/visits
// @access  Private
exports.getVisits = async (req, res) => {
  try {
    const io = req.app.get('io');
    await updateVisitStatuses(io);

    const { employeeId, customerId, status, startDate, endDate, search = '' } = req.query;

    const query = {};

    if (req.user.role === 'employee') {
      query.employeeId = req.user.id;
    } else if (employeeId) {
      query.employeeId = employeeId;
    }

    if (customerId) {
      query.customerId = customerId;
    }

    if (status) {
      query.status = status;
    }

    if (startDate || endDate) {
      query.scheduledDate = {};
      if (startDate) {
        query.scheduledDate.$gte = getStartOfDayIST(new Date(startDate));
      }
      if (endDate) {
        query.scheduledDate.$lte = getEndOfDayIST(new Date(endDate));
      }
    }

    if (search) {
      query.$or = [
        { customerName: { $regex: search, $options: 'i' } },
        { employeeName: { $regex: search, $options: 'i' } },
        { reason: { $regex: search, $options: 'i' } },
        { startReason: { $regex: search, $options: 'i' } },
        { completeReason: { $regex: search, $options: 'i' } }
      ];
    }

    const visits = await CustomerVisit.find(query)
      .populate({
        path: 'customerId',
        select: 'latitude longitude customerName address customerCode'
      })
      .sort({ scheduledDate: -1, scheduledTime: -1 });
    res.status(200).json({ success: true, count: visits.length, data: visits });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// @desc    Get single visit
// @route   GET /api/visits/:id
// @access  Private
exports.getVisitById = async (req, res) => {
  try {
    const visit = await CustomerVisit.findById(req.params.id);
    if (!visit) {
      return res.status(404).json({ success: false, message: 'Visit not found' });
    }

    // Security check
    if (req.user.role === 'employee' && visit.employeeId.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Not authorized to view this visit' });
    }

    res.status(200).json({ success: true, data: visit });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// @desc    Update visit details (Admin only: Edit/Reassign/Cancel)
// @route   PUT /api/visits/:id
// @access  Private/Admin
exports.updateVisit = async (req, res) => {
  try {
    let visit = await CustomerVisit.findById(req.params.id);
    if (!visit) {
      return res.status(404).json({ success: false, message: 'Visit not found' });
    }

    // Allow admins OR the assigned employee to update
    if (req.user.role !== 'admin' && visit.employeeId.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Only Admins or the assigned employee can modify visit records' });
    }

    const { employeeId, customerId, customerName, visitType, scheduledDate, scheduledTime, reason, status } = req.body;

    const updatePayload = {};

    if (visitType) updatePayload.visitType = visitType;

    // Handle customerId / customerName changes
    if (visitType === 'customer' || (!visitType && customerId)) {
      if (customerId) {
        const customer = await Customer.findById(customerId);
        if (customer) {
          updatePayload.customerId = customerId;
          updatePayload.customerName = customer.customerName;
        }
      }
    } else if (visitType === 'self' || (!visitType && !customerId && customerName)) {
      updatePayload.customerId = null; // clear customerId if switching/updating to a self visit custom location
      if (customerName) updatePayload.customerName = customerName;
    }

    if (req.user.role === 'admin') {
      if (employeeId) {
        const employee = await User.findById(employeeId);
        if (employee) {
          updatePayload.employeeId = employeeId;
          updatePayload.employeeName = employee.name;

          // Trigger assigned notification if employee reassigned
          if (visit.employeeId.toString() !== employeeId) {
            try {
              const io = req.app.get('io');
              await notificationService.createAndSendNotification({
                title: 'Visit Reassigned',
                description: `You have been reassigned a visit to ${updatePayload.customerName || visit.customerName} on ${new Date(scheduledDate || visit.scheduledDate).toLocaleDateString('en-GB')} at ${scheduledTime || visit.scheduledTime}.`,
                type: 'customer visit notification',
                autoType: 'Visit Assigned',
                targetType: 'Specific Employees',
                employees: [employeeId],
                isAuto: true
              }, io);
            } catch (e) {
              console.error('Reassignment notification failed:', e);
            }
          }
        }
      }
      if (status) updatePayload.status = status;
    }

    if (scheduledDate) updatePayload.scheduledDate = new Date(scheduledDate);
    if (scheduledTime) updatePayload.scheduledTime = scheduledTime;
    if (reason !== undefined) updatePayload.reason = reason;

    visit = await CustomerVisit.findByIdAndUpdate(req.params.id, updatePayload, { new: true, runValidators: true });
    res.status(200).json({ success: true, data: visit });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// @desc    Delete/Cancel visit
// @route   DELETE /api/visits/:id
// @access  Private/Admin
exports.deleteVisit = async (req, res) => {
  try {
    const visit = await CustomerVisit.findById(req.params.id);
    if (!visit) {
      return res.status(404).json({ success: false, message: 'Visit not found' });
    }

    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Only Admins can cancel/delete visit records' });
    }

    await CustomerVisit.deleteOne({ _id: req.params.id });
    res.status(200).json({ success: true, data: {} });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// @desc    Start Customer Visit (Employee Check-in)
// @route   POST /api/visits/:id/start
// @access  Private
exports.startVisit = async (req, res) => {
  try {
    const { latitude, longitude, address, selfie, reason } = req.body;

    if (!latitude || !longitude || !selfie) {
      return res.status(400).json({ success: false, message: 'GPS coordinates and selfie capture are required to start a visit' });
    }

    // 1. Check if employee is punched in today for attendance
    const now = new Date();
    const todayStart = getStartOfDayIST(now);
    const todayEnd = getEndOfDayIST(now);

    const attendance = await Attendance.findOne({
      user: req.user.id,
      date: { $gte: todayStart, $lte: todayEnd }
    });

    if (!attendance || !attendance.punchIn || !attendance.punchIn.time) {
      return res.status(400).json({ success: false, message: 'You must punch in for attendance before you can start a visit.' });
    }

    // 2. Enforce only one active visit at a time
    const activeVisit = await CustomerVisit.findOne({
      employeeId: req.user.id,
      status: 'In Progress'
    });
    if (activeVisit) {
      return res.status(400).json({ success: false, message: `You already have an active visit in progress with "${activeVisit.customerName}". Complete it first.` });
    }

    let visit = await CustomerVisit.findById(req.params.id);
    if (!visit) {
      return res.status(404).json({ success: false, message: 'Visit not found' });
    }

    // Security check
    if (visit.employeeId.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'This visit is not assigned to you' });
    }

    if (visit.status === 'Completed') {
      return res.status(400).json({ success: false, message: 'Visit has already been completed' });
    }

    visit.status = 'In Progress';
    visit.startTime = now;
    visit.startLatitude = latitude;
    visit.startLongitude = longitude;
    visit.startAddress = address || 'Address not captured';
    visit.startLocation = address || 'Location not captured';
    visit.startSelfie = null; // Background uploaded
    visit.startReason = reason || 'Visit started';

    await visit.save();

    res.status(200).json({ success: true, message: 'Visit started successfully', data: visit });

    // Background upload selfie
    if (selfie && selfie !== 'skipped') {
      uploadToCloudinary(selfie, 'hrms/visits/selfies')
        .then(async (selfieData) => {
          if (selfieData?.url) {
            await CustomerVisit.updateOne({ _id: visit._id }, { $set: { startSelfie: selfieData.url } });
            console.log('Background start visit selfie upload completed:', selfieData.url);
          }
        })
        .catch(err => {
          console.error('Background start visit selfie upload failed:', err.message);
        });
    }

    // Trigger Notification
    try {
      const io = req.app.get('io');
      await notificationService.createAndSendNotification({
        title: 'Visit Started',
        description: `You started the customer visit to ${visit.customerName} at ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`,
        type: 'customer visit notification',
        autoType: 'Visit Started',
        targetType: 'Specific Employees',
        employees: [visit.employeeId],
        isAuto: true
      }, io);
    } catch (e) {
      console.error('Start visit notification failed:', e);
    }

  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// @desc    Complete Customer Visit (Employee Check-out)
// @route   POST /api/visits/:id/complete
// @access  Private
exports.completeVisit = async (req, res) => {
  try {
    const { latitude, longitude, address, selfie, reason } = req.body;

    if (!latitude || !longitude || !selfie) {
      return res.status(400).json({ success: false, message: 'GPS coordinates and selfie capture are required to complete a visit' });
    }

    let visit = await CustomerVisit.findById(req.params.id);
    if (!visit) {
      return res.status(404).json({ success: false, message: 'Visit not found' });
    }

    // Security check
    if (visit.employeeId.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'This visit is not assigned to you' });
    }

    if (visit.status !== 'In Progress') {
      return res.status(400).json({ success: false, message: 'Only active in-progress visits can be completed' });
    }

    const now = new Date();

    visit.status = 'Completed';
    visit.endTime = now;
    visit.endLatitude = latitude;
    visit.endLongitude = longitude;
    visit.endAddress = address || 'Address not captured';
    visit.endLocation = address || 'Location not captured';
    visit.endSelfie = null; // Background uploaded
    visit.completeReason = reason || 'Completed';

    await visit.save();

    res.status(200).json({ success: true, message: 'Visit completed successfully', data: visit });

    // Background upload selfie
    if (selfie && selfie !== 'skipped') {
      uploadToCloudinary(selfie, 'hrms/visits/selfies')
        .then(async (selfieData) => {
          if (selfieData?.url) {
            await CustomerVisit.updateOne({ _id: visit._id }, { $set: { endSelfie: selfieData.url } });
            console.log('Background complete visit selfie upload completed:', selfieData.url);
          }
        })
        .catch(err => {
          console.error('Background complete visit selfie upload failed:', err.message);
        });
    }

    // Trigger Notification
    try {
      const io = req.app.get('io');
      await notificationService.createAndSendNotification({
        title: 'Visit Completed',
        description: `You completed the customer visit to ${visit.customerName} at ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`,
        type: 'customer visit notification',
        autoType: 'Visit Completed',
        targetType: 'Specific Employees',
        employees: [visit.employeeId],
        isAuto: true
      }, io);
    } catch (e) {
      console.error('Complete visit notification failed:', e);
    }

  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// @desc    Get Customer Visit Dashboard Analytics
// @route   GET /api/visits/dashboard
// @access  Private/Admin
exports.getDashboardAnalytics = async (req, res) => {
  try {
    const io = req.app.get('io');
    await updateVisitStatuses(io);

    const { startDate, endDate } = req.query;

    let matchQuery = {};
    if (startDate || endDate) {
      const dateRangeQuery = {};
      if (startDate) dateRangeQuery.$gte = getStartOfDayIST(new Date(startDate));
      if (endDate) dateRangeQuery.$lte = getEndOfDayIST(new Date(endDate));

      matchQuery = {
        $or: [
          { scheduledDate: dateRangeQuery },
          { status: 'Upcoming' }
        ]
      };
    }

    // Overall Counts
    const allVisitsInRange = await CustomerVisit.find(matchQuery);

    const summary = {
      total: allVisitsInRange.length,
      todo: allVisitsInRange.filter(v => v.status === 'To Do').length,
      inProgress: allVisitsInRange.filter(v => v.status === 'In Progress').length,
      completed: allVisitsInRange.filter(v => v.status === 'Completed').length,
      overdue: allVisitsInRange.filter(v => v.status === 'Over Due').length,
      upcoming: allVisitsInRange.filter(v => v.status === 'Upcoming').length
    };

    // Customer Wise Aggregation (exclude self visits as they do not have client customer documents)
    const customerStats = await CustomerVisit.aggregate([
      { $match: { ...matchQuery, visitType: { $ne: 'self' } } },
      {
        $group: {
          _id: '$customerId',
          customerName: { $first: '$customerName' },
          total: { $sum: 1 },
          todo: { $sum: { $cond: [{ $eq: ['$status', 'To Do'] }, 1, 0] } },
          inProgress: { $sum: { $cond: [{ $eq: ['$status', 'In Progress'] }, 1, 0] } },
          completed: { $sum: { $cond: [{ $eq: ['$status', 'Completed'] }, 1, 0] } },
          overdue: { $sum: { $cond: [{ $eq: ['$status', 'Over Due'] }, 1, 0] } },
          upcoming: { $sum: { $cond: [{ $eq: ['$status', 'Upcoming'] }, 1, 0] } }
        }
      },
      {
        $lookup: {
          from: 'customers',
          localField: '_id',
          foreignField: '_id',
          as: 'customerDetails'
        }
      },
      {
        $project: {
          customerId: '$_id',
          customerName: 1,
          total: 1,
          todo: 1,
          inProgress: 1,
          completed: 1,
          overdue: 1,
          upcoming: 1
        }
      },
      { $sort: { customerName: 1 } }
    ]);

    // Employee Wise Aggregation
    const employeeStats = await CustomerVisit.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: '$employeeId',
          employeeName: { $first: '$employeeName' },
          total: { $sum: 1 },
          todo: { $sum: { $cond: [{ $eq: ['$status', 'To Do'] }, 1, 0] } },
          inProgress: { $sum: { $cond: [{ $eq: ['$status', 'In Progress'] }, 1, 0] } },
          completed: { $sum: { $cond: [{ $eq: ['$status', 'Completed'] }, 1, 0] } },
          overdue: { $sum: { $cond: [{ $eq: ['$status', 'Over Due'] }, 1, 0] } },
          upcoming: { $sum: { $cond: [{ $eq: ['$status', 'Upcoming'] }, 1, 0] } }
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'userDetails'
        }
      },
      {
        $unwind: {
          path: '$userDetails',
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $lookup: {
          from: 'locations',
          localField: 'userDetails.workingPlace',
          foreignField: '_id',
          as: 'workingPlaceDetails'
        }
      },
      {
        $project: {
          employeeId: '$_id',
          employeeName: 1,
          designation: { $ifNull: ['$userDetails.designation', 'Employee'] },
          workingPlace: { $ifNull: [{ $arrayElemAt: ['$workingPlaceDetails.name', 0] }, 'NA'] },
          total: 1,
          todo: 1,
          inProgress: 1,
          completed: 1,
          overdue: 1,
          upcoming: 1
        }
      },
      { $sort: { employeeName: 1 } }
    ]);

    // Date Wise Aggregation
    const dateStats = await CustomerVisit.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$scheduledDate' } },
          total: { $sum: 1 },
          todo: { $sum: { $cond: [{ $eq: ['$status', 'To Do'] }, 1, 0] } },
          inProgress: { $sum: { $cond: [{ $eq: ['$status', 'In Progress'] }, 1, 0] } },
          completed: { $sum: { $cond: [{ $eq: ['$status', 'Completed'] }, 1, 0] } },
          overdue: { $sum: { $cond: [{ $eq: ['$status', 'Over Due'] }, 1, 0] } },
          upcoming: { $sum: { $cond: [{ $eq: ['$status', 'Upcoming'] }, 1, 0] } }
        }
      },
      { $project: { date: '$_id', total: 1, todo: 1, inProgress: 1, completed: 1, overdue: 1, upcoming: 1 } },
      { $sort: { date: -1 } }
    ]);

    res.status(200).json({
      success: true,
      data: {
        summary,
        customerStats,
        employeeStats,
        dateStats
      }
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// @desc    Get Detailed Visits Report (with filtering, sorting, pagination, and Excel/CSV exporting)
// @route   GET /api/visits/reports
// @access  Private/Admin
exports.getVisitReports = async (req, res) => {
  try {
    const io = req.app.get('io');
    await updateVisitStatuses(io);

    const {
      startDate,
      endDate,
      customerId,
      employeeId,
      status,
      search = '',
      exportFormat
    } = req.query;

    const query = {};

    if (customerId) query.customerId = customerId;
    if (employeeId) query.employeeId = employeeId;
    if (status) query.status = status;

    if (startDate || endDate) {
      query.scheduledDate = {};
      if (startDate) query.scheduledDate.$gte = getStartOfDayIST(new Date(startDate));
      if (endDate) query.scheduledDate.$lte = getEndOfDayIST(new Date(endDate));
    }

    if (search) {
      query.$or = [
        { customerName: { $regex: search, $options: 'i' } },
        { employeeName: { $regex: search, $options: 'i' } },
        { reason: { $regex: search, $options: 'i' } },
        { startReason: { $regex: search, $options: 'i' } },
        { completeReason: { $regex: search, $options: 'i' } }
      ];
    }

    const reports = await CustomerVisit.find(query)
      .populate({
        path: 'customerId',
        select: 'latitude longitude customerName address customerCode'
      })
      .sort({ scheduledDate: -1 });

    if (exportFormat) {
      const formattedReports = reports.map((v, index) => {
        const custLat = v.visitType === 'self' ? null : v.customerId?.latitude;
        const custLon = v.visitType === 'self' ? null : v.customerId?.longitude;
        const startDev = custLat && custLon ? calculateDistance(custLat, custLon, v.startLatitude, v.startLongitude) : null;
        const endDev = custLat && custLon ? calculateDistance(custLat, custLon, v.endLatitude, v.endLongitude) : null;

        return {
          'S.No': index + 1,
          'Customer Name': v.customerName || 'N/A',
          'Employee Name': v.employeeName || 'N/A',
          'Scheduled Date': v.scheduledDate ? new Date(v.scheduledDate).toLocaleDateString('en-GB') : 'N/A',
          'Scheduled Time': v.scheduledTime || 'N/A',
          'Start Time': v.startTime ? new Date(v.startTime).toLocaleTimeString() : 'N/A',
          'Start Address': v.startAddress || 'N/A',
          'Start Deviation': startDev !== null ? `${startDev}m` : 'N/A',
          'End Time': v.endTime ? new Date(v.endTime).toLocaleTimeString() : 'N/A',
          'End Address': v.endAddress || 'N/A',
          'End Deviation': endDev !== null ? `${endDev}m` : 'N/A',
          'Start Selfie': v.startSelfie || 'N/A',
          'End Selfie': v.endSelfie || 'N/A',
          'Status': v.status ? v.status.toUpperCase() : 'N/A',
          'Reason/Notes': v.reason || 'N/A'
        };
      });

      if (exportFormat === 'csv') {
        const fields = Object.keys(formattedReports[0] || {});
        let csvContent = '\ufeff' + fields.join(',') + '\n';
        formattedReports.forEach((row) => {
          csvContent += fields.map(f => `"${String(row[f]).replace(/"/g, '""')}"`).join(',') + '\n';
        });
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=customer_visit_report_${Date.now()}.csv`);
        return res.status(200).send(csvContent);
      }

      if (exportFormat === 'xlsx') {
        const ws = XLSX.utils.json_to_sheet(formattedReports);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Visits Report');
        const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=customer_visit_report_${Date.now()}.xlsx`);
        return res.status(200).send(buffer);
      }
    }

    res.status(200).json({ success: true, count: reports.length, data: reports });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};
