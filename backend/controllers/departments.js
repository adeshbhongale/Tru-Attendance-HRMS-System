const Department = require('../models/Department');
const User = require('../models/User');

// @desc    Get all departments
// @route   GET /api/departments
// @access  Private/Admin
exports.getDepartments = async (req, res, next) => {
  try {
    const departments = await Department.find();
    
    // Aggregate employee counts by department name
    const employeeCounts = await User.aggregate([
      { $match: { role: 'employee' } },
      { $group: { _id: '$department', count: { $sum: 1 } } }
    ]);

    const countMap = {};
    employeeCounts.forEach(item => {
      if (item._id) {
        countMap[item._id.toLowerCase()] = item.count;
      }
    });

    const dataWithCount = departments.map(dept => {
      const deptObj = dept.toObject();
      deptObj.employeeCount = countMap[dept.name.toLowerCase()] || 0;
      return deptObj;
    });

    res.status(200).json({ success: true, count: departments.length, data: dataWithCount });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    Create department
// @route   POST /api/departments
// @access  Private/Admin
exports.createDepartment = async (req, res, next) => {
  try {
    const department = await Department.create(req.body);
    res.status(201).json({ success: true, data: department });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    Update department
// @route   PUT /api/departments/:id
// @access  Private/Admin
exports.updateDepartment = async (req, res, next) => {
  try {
    const department = await Department.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!department) return res.status(404).json({ success: false, message: 'Department not found' });
    res.status(200).json({ success: true, data: department });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    Delete department
// @route   DELETE /api/departments/:id
// @access  Private/Admin
exports.deleteDepartment = async (req, res, next) => {
  try {
    const department = await Department.findByIdAndDelete(req.params.id);
    if (!department) return res.status(404).json({ success: false, message: 'Department not found' });
    res.status(200).json({ success: true, data: {} });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};
