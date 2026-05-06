const User = require('../models/User');
const xlsx = require('xlsx');

// @desc    Get all employees
// @route   GET /api/employees
// @access  Private/Admin
exports.getEmployees = async (req, res, next) => {
  try {
    const employees = await User.find({ role: 'employee' }).populate('shift');
    res.status(200).json({
      success: true,
      count: employees.length,
      data: employees,
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    Add employee
// @route   POST /api/employees
// @access  Private/Admin
exports.addEmployee = async (req, res, next) => {
  try {
    const employee = await User.create({
      ...req.body,
      role: 'employee',
    });

    res.status(201).json({
      success: true,
      data: employee,
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    Update employee
// @route   PUT /api/employees/:id
// @access  Private/Admin
exports.updateEmployee = async (req, res, next) => {
  try {
    const employee = await User.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    if (!employee) {
      return res.status(404).json({ success: false, message: 'Employee not found' });
    }

    res.status(200).json({
      success: true,
      data: employee,
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    Delete employee
// @route   DELETE /api/employees/:id
// @access  Private/Admin
exports.deleteEmployee = async (req, res, next) => {
  try {
    const employee = await User.findByIdAndDelete(req.params.id);

    if (!employee) {
      return res.status(404).json({ success: false, message: 'Employee not found' });
    }

    res.status(200).json({
      success: true,
      data: {},
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// @desc    Bulk upload employees via Excel
// @route   POST /api/employees/bulk-upload
// @access  Private/Admin
exports.bulkUpload = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Please upload an excel file' });
    }

    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

    const employees = await User.insertMany(data.map(emp => ({
      ...emp,
      role: 'employee',
      password: emp.password || 'password123', // Default password
    })));

    res.status(201).json({
      success: true,
      count: employees.length,
      data: employees,
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};
