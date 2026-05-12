const User = require('../models/User');
const Attendance = require('../models/Attendance');
const Leave = require('../models/Leave');
const xlsx = require('xlsx');
const { uploadProfileImage } = require('../utils/cloudinary');

// @desc    Get all employees
// @route   GET /api/employees
// @access  Private/Admin
exports.getEmployees = async (req, res, next) => {
    try {
        // Sort by createdAt descending so new employees show at the top
        const employees = await User.find({ role: 'employee' }).populate('shift').sort('-createdAt');

        // Check online status based on today's active sessions (punched in but not out)
        const now = new Date();
        const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
        const todayEnd = new Date(todayStart);
        todayEnd.setUTCDate(todayEnd.getUTCDate() + 1);

        const todayAttendance = await Attendance.find({
            date: { $gte: todayStart, $lt: todayEnd },
            "punchIn.time": { $exists: true },
            "punchOut.time": { $exists: false }
        });

        const onlineUserIds = todayAttendance.map(a => a.user.toString());

        // Calculate approved leaves for each employee for consistent data reporting
        const employeesWithStatus = await Promise.all(employees.map(async (emp) => {
            const approvedLeaves = await Leave.countDocuments({
                user: emp._id,
                status: 'Approved'
            });

            return {
                ...emp._doc,
                isOnline: onlineUserIds.includes(emp._id.toString()),
                approvedLeaves
            };
        }));

        res.status(200).json({
            success: true,
            count: employees.length,
            data: employeesWithStatus,
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
        let profileImageUrl = req.body.profileImage;

        // Create user first to get ID for Cloudinary public_id
        const employee = await User.create({
            ...req.body,
            role: 'employee',
        });

        if (req.file) {
            const base64Image = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
            const uploadResult = await uploadProfileImage(base64Image, employee._id);
            if (uploadResult) {
                employee.profileImage = uploadResult.url;
                await employee.save();
            }
        }

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
        let updateData = { ...req.body };

        if (req.file) {
            const base64Image = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
            const uploadResult = await uploadProfileImage(base64Image, req.params.id);
            if (uploadResult) {
                updateData.profileImage = uploadResult.url;
            }
        }

        const employee = await User.findByIdAndUpdate(req.params.id, updateData, {
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
        const rawData = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

        const Shift = require('../models/Shift');
        const shifts = await Shift.find();

        const formattedData = [];
        const seenEmails = new Set();
        const seenMobiles = new Set();
        
        // Fetch all existing emails and mobiles to check for duplicates
        const existingUsers = await User.find({}, 'email mobile');
        const existingEmails = new Set(existingUsers.map(u => u.email.toLowerCase()));
        const existingMobiles = new Set(existingUsers.map(u => u.mobile));

        for (const row of rawData) {
            const findVal = (keys) => {
                const foundKey = Object.keys(row).find(k => keys.includes(k.toLowerCase().trim()));
                const val = foundKey ? row[foundKey] : 'NA';
                return val === undefined || val === null || val === '' ? 'NA' : val;
            };

            const email = findVal(['email', 'email address', 'mail']).toString().toLowerCase().trim();
            const mobile = findVal(['mobile', 'contact', 'phone', 'phone number', 'contact details', 'contact no']).toString().trim();
            const name = findVal(['name', 'full name', 'employee name', 'staff name']).toString().trim();
            
            // Skip if critical data is missing or is a duplicate
            if (!email || email === 'na' || !mobile || mobile === 'na' || !name || name === 'na') continue;
            if (seenEmails.has(email) || existingEmails.has(email)) continue;
            if (seenMobiles.has(mobile) || existingMobiles.has(mobile)) continue;

            seenEmails.add(email);
            seenMobiles.add(mobile);

            const shiftName = findVal(['shift', 'work shift']);
            const matchedShift = shifts.find(s => s.name.toLowerCase() === shiftName.toString().toLowerCase());
            
            let status = findVal(['status', 'active status']).toString().toLowerCase();
            if (!['active', 'inactive'].includes(status)) {
                status = 'active';
            }

            formattedData.push({
                name: name,
                email: email,
                mobile: mobile,
                department: findVal(['department', 'dept']),
                designation: findVal(['designation', 'role', 'post']),
                shift: matchedShift ? matchedShift._id : shifts[0]?._id,
                status: status,
                password: findVal(['password']) === 'NA' ? 'password123' : String(findVal(['password'])),
                role: 'employee'
            });
        }

        if (formattedData.length === 0) {
            return res.status(200).json({
                success: true,
                message: 'Staff list processed. No new unique records were found.',
                count: 0,
                data: []
            });
        }

        const employees = await User.insertMany(formattedData, { ordered: false });

        res.status(201).json({
            success: true,
            message: `Upload complete. ${employees.length} new staff members added.`,
            count: employees.length,
            data: employees,
        });
    } catch (err) {
        res.status(200).json({ success: true, message: 'Processed with some skips: ' + err.message });
    }
};

// @desc    Export all employees to Excel with credentials
// @route   GET /api/employees/export
// @access  Private/Admin
exports.exportEmployees = async (req, res, next) => {
    try {
        const employees = await User.find({ role: 'employee' }).populate('shift').select('+password');
        
        const data = employees.map(emp => ({
            'Staff ID': emp._id.toString(),
            'Name': emp.name,
            'Email': emp.email,
            'Mobile': emp.mobile,
            'Department': emp.department || 'N/A',
            'Designation': emp.designation || 'N/A',
            'Shift': emp.shift?.name || 'General Shift',
            'Joining Date': new Date(emp.createdAt).toLocaleDateString()
        }));

        const workbook = xlsx.utils.book_new();
        const worksheet = xlsx.utils.json_to_sheet(data);
        xlsx.utils.book_append_sheet(workbook, worksheet, 'Employees');
        
        const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
        
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=Employees_Data.xlsx');
        res.send(buffer);
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
};
