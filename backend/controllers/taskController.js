const Task = require('../models/Task');
const Holiday = require('../models/Holiday');

// Helper to sanitize & evaluate overdue status
const evaluateTaskOverdue = (task, today) => {
  if (task.status !== 'completed') {
    const due = new Date(task.dueDate);
    due.setHours(0, 0, 0, 0);
    if (due < today) {
      task.status = 'overdue';
    } else if (task.status === 'overdue') {
      task.status = 'pending';
    }
  }
  return task;
};

// @desc    Get Calendar Month Events (Tasks & Holidays)
// @route   GET /api/tasks/calendar
// @access  Private
exports.getCalendarMonthEvents = async (req, res) => {
  try {
    const userId = req.user._id;
    const companyId = req.user.companyId || req.companyId;

    const now = new Date();
    const year = parseInt(req.query.year) || now.getFullYear();
    const month = req.query.month !== undefined ? parseInt(req.query.month) : now.getMonth(); // 0-indexed

    // Calculate start & end of month in UTC/local
    const startOfMonth = new Date(year, month, 1, 0, 0, 0, 0);
    const endOfMonth = new Date(year, month + 1, 0, 23, 59, 59, 999);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Auto-update uncompleted past tasks to overdue in DB
    await Task.updateMany(
      {
        assignedTo: userId,
        status: { $in: ['pending', 'in_progress'] },
        dueDate: { $lt: today },
      },
      { $set: { status: 'overdue' } }
    );

    // Fetch tasks for the current month
    const tasks = await Task.find({
      assignedTo: userId,
      dueDate: { $gte: startOfMonth, $lte: endOfMonth },
    }).sort({ dueDate: 1, createdAt: 1 });

    // Fetch holidays for the current month
    let holidays = [];
    if (companyId) {
      holidays = await Holiday.find({
        companyId,
        holiday_date: { $gte: startOfMonth, $lte: endOfMonth },
        status: 'active',
      }).sort({ holiday_date: 1 });
    }

    const holidayDays = holidays.map((h) => new Date(h.holiday_date).getDate());
    const holidayDetails = holidays.map((h) => ({
      day: new Date(h.holiday_date).getDate(),
      date: h.holiday_date,
      name: h.holiday_name,
      type: h.holiday_type,
    }));

    // Group tasks by day (1..31)
    const dayGroups = {};
    let totalPending = 0;
    let totalInProgress = 0;
    let totalOverdue = 0;
    let totalCompleted = 0;

    tasks.forEach((t) => {
      evaluateTaskOverdue(t, today);
      const day = new Date(t.dueDate).getDate();

      if (!dayGroups[day]) {
        dayGroups[day] = [];
      }
      dayGroups[day].push(t);

      if (t.status === 'overdue') totalOverdue++;
      else if (t.status === 'in_progress') totalInProgress++;
      else if (t.status === 'completed') totalCompleted++;
      else totalPending++;
    });

    const events = Object.keys(dayGroups).map((dayStr) => {
      const day = parseInt(dayStr);
      const dayTasks = dayGroups[day];

      const hasOverdue = dayTasks.some((t) => t.status === 'overdue');
      const hasInProgress = dayTasks.some((t) => t.status === 'in_progress');
      const hasPending = dayTasks.some((t) => t.status === 'pending');
      const allCompleted = dayTasks.every((t) => t.status === 'completed');

      let textColor = '#1e293b';
      let mainStatus = 'pending';

      if (hasOverdue) {
        textColor = '#ef4444'; // Red
        mainStatus = 'overdue';
      } else if (hasInProgress) {
        textColor = '#f59e0b'; // Amber
        mainStatus = 'in_progress';
      } else if (hasPending) {
        textColor = '#1972e9'; // Blue
        mainStatus = 'pending';
      } else if (allCompleted) {
        textColor = '#10b981'; // Emerald
        mainStatus = 'completed';
      }

      // Collect custom labels or generate dynamic status labels
      const labels = [];
      dayTasks.forEach((t) => {
        if (t.labels && t.labels.length > 0) {
          t.labels.forEach((lbl) => {
            if (lbl.text && !labels.some((l) => l.text === lbl.text)) {
              labels.push({ text: lbl.text, color: lbl.color || textColor });
            }
          });
        }
      });

      if (labels.length === 0) {
        if (hasOverdue) labels.push({ text: 'Overdue', color: '#ef4444' });
        else if (hasInProgress) labels.push({ text: 'In Progress', color: '#f59e0b' });
        else if (allCompleted) labels.push({ text: 'Done', color: '#10b981' });
        else if (hasPending) labels.push({ text: 'Task', color: '#1972e9' });
      }

      return {
        day,
        date: new Date(year, month, day).toISOString(),
        textColor,
        status: mainStatus,
        labels,
        tasks: dayTasks.map((t) => ({
          _id: t._id,
          id: t._id,
          title: t.title,
          text: t.title,
          description: t.description || '',
          status: t.status,
          priority: t.priority,
          dueDate: t.dueDate,
          labels: t.labels || [],
        })),
      };
    });

    res.status(200).json({
      success: true,
      data: {
        year,
        month,
        events,
        holidays: holidayDays,
        holidayDetails,
        summary: {
          total: tasks.length,
          pending: totalPending,
          in_progress: totalInProgress,
          overdue: totalOverdue,
          completed: totalCompleted,
        },
      },
    });
  } catch (error) {
    console.error('getCalendarMonthEvents error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch calendar events',
      error: error.message,
    });
  }
};

// @desc    Get All Tasks (Filtered)
// @route   GET /api/tasks
// @access  Private
exports.getTasks = async (req, res) => {
  try {
    const userId = req.user._id;
    const { status, priority, search } = req.query;

    const query = { assignedTo: userId };

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Auto-update overdue
    await Task.updateMany(
      {
        assignedTo: userId,
        status: { $in: ['pending', 'in_progress'] },
        dueDate: { $lt: today },
      },
      { $set: { status: 'overdue' } }
    );

    if (status) {
      query.status = status;
    }
    if (priority) {
      query.priority = priority;
    }
    if (search) {
      query.title = { $regex: search, $options: 'i' };
    }

    const tasks = await Task.find(query).sort({ dueDate: 1, createdAt: -1 });

    res.status(200).json({
      success: true,
      count: tasks.length,
      data: tasks,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch tasks',
      error: error.message,
    });
  }
};

// @desc    Create a New Task
// @route   POST /api/tasks
// @access  Private
exports.createTask = async (req, res) => {
  try {
    const { title, description, dueDate, priority, status, labels, assignedTo } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ success: false, message: 'Task title is required' });
    }

    const targetDueDate = dueDate ? new Date(dueDate) : new Date();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const dueDay = new Date(targetDueDate);
    dueDay.setHours(0, 0, 0, 0);

    let initialStatus = status || 'pending';
    if (initialStatus !== 'completed' && dueDay < today) {
      initialStatus = 'overdue';
    }

    const task = await Task.create({
      companyId: req.user.companyId || req.companyId,
      assignedTo: assignedTo || req.user._id,
      createdBy: req.user._id,
      title: title.trim(),
      description: description ? description.trim() : '',
      dueDate: targetDueDate,
      priority: priority || 'medium',
      status: initialStatus,
      labels: Array.isArray(labels) ? labels : [],
      completedAt: initialStatus === 'completed' ? new Date() : null,
    });

    res.status(201).json({
      success: true,
      message: 'Task created successfully',
      data: task,
    });
  } catch (error) {
    console.error('createTask error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create task',
      error: error.message,
    });
  }
};

// @desc    Update Task
// @route   PUT /api/tasks/:id
// @access  Private
exports.updateTask = async (req, res) => {
  try {
    const task = await Task.findOne({
      _id: req.params.id,
      $or: [{ assignedTo: req.user._id }, { createdBy: req.user._id }],
    });

    if (!task) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }

    const { title, description, dueDate, priority, status, labels } = req.body;

    if (title) task.title = title.trim();
    if (description !== undefined) task.description = description.trim();
    if (dueDate) task.dueDate = new Date(dueDate);
    if (priority) task.priority = priority;
    if (labels !== undefined) task.labels = labels;

    if (status) {
      task.status = status;
      if (status === 'completed') {
        task.completedAt = new Date();
      } else {
        task.completedAt = null;
        // Check overdue
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const due = new Date(task.dueDate);
        due.setHours(0, 0, 0, 0);
        if (due < today) {
          task.status = 'overdue';
        }
      }
    }

    await task.save();

    res.status(200).json({
      success: true,
      message: 'Task updated successfully',
      data: task,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to update task',
      error: error.message,
    });
  }
};

// @desc    Update Task Status Quick Toggle
// @route   PATCH /api/tasks/:id/status
// @access  Private
exports.updateTaskStatus = async (req, res) => {
  try {
    const { status } = req.body;
    if (!status) {
      return res.status(400).json({ success: false, message: 'Status is required' });
    }

    const task = await Task.findOne({
      _id: req.params.id,
      assignedTo: req.user._id,
    });

    if (!task) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }

    task.status = status;
    if (status === 'completed') {
      task.completedAt = new Date();
    } else {
      task.completedAt = null;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const due = new Date(task.dueDate);
      due.setHours(0, 0, 0, 0);
      if (due < today) {
        task.status = 'overdue';
      }
    }

    await task.save();

    res.status(200).json({
      success: true,
      message: `Task status updated to ${task.status}`,
      data: task,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to update task status',
      error: error.message,
    });
  }
};

// @desc    Delete Task
// @route   DELETE /api/tasks/:id
// @access  Private
exports.deleteTask = async (req, res) => {
  try {
    const task = await Task.findOneAndDelete({
      _id: req.params.id,
      $or: [{ assignedTo: req.user._id }, { createdBy: req.user._id }],
    });

    if (!task) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }

    res.status(200).json({
      success: true,
      message: 'Task deleted successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to delete task',
      error: error.message,
    });
  }
};
