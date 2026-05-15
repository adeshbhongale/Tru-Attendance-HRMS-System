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
        const employees = await User.find({ role: 'employee' })
            .populate('shift')
            .sort('-createdAt');

        const now = new Date();
        const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
        const todayEnd = new Date(todayStart);
        todayEnd.setUTCDate(todayEnd.getUTCDate() + 1);

        const [todayAttendance, leaveStats] = await Promise.all([
            Attendance.find({
                date: { $gte: todayStart, $lt: todayEnd },
                "punchIn.time": { $exists: true },
                "punchOut.time": { $exists: false }
            }),
            Leave.aggregate([
                { $match: { status: 'Approved' } },
                { $group: { _id: '$user', count: { $sum: 1 } } }
            ])
        ]);

        const onlineUserIds = new Set(todayAttendance.map(a => a.user.toString()));
        const leaveMap = leaveStats.reduce((acc, curr) => {
            acc[curr._id.toString()] = curr.count;
            return acc;
        }, {});

        const employeesWithStatus = employees.map(emp => {
            const empObj = emp.toObject();
            return {
                ...empObj,
                isOnline: onlineUserIds.has(emp._id.toString()),
                approvedLeaves: leaveMap[emp._id.toString()] || 0
            };
        });

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
        const { email, mobile } = req.body;

        const existingUser = await User.findOne({ $or: [{ email }, { mobile }] });
        if (existingUser) {
            const field = existingUser.email === email ? 'Email' : 'Mobile number';
            return res.status(400).json({ success: false, message: `${field} already exists in our records.` });
        }

        const { name, department, designation, shift, status, password } = req.body;

        const employeeData = {
            name,
            email,
            mobile,
            department,
            designation,
            shift,
            status: status || 'active',
            role: 'employee'
        };

        if (password) {
            employeeData.password = password;
        }

        const employee = await User.create(employeeData);

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
        const { email, mobile, password } = req.body;

        // Check if new email/mobile already exists for another user
        const existingUser = await User.findOne({
            _id: { $ne: req.params.id },
            $or: [{ email }, { mobile }]
        });

        if (existingUser) {
            const field = existingUser.email === email ? 'Email' : 'Mobile number';
            return res.status(400).json({ success: false, message: `${field} already belongs to another staff member.` });
        }

        const allowedFields = ['name', 'email', 'mobile', 'department', 'designation', 'shift', 'status', 'joiningDate'];
        let updateData = {};
        allowedFields.forEach(field => {
            if (req.body[field] !== undefined) updateData[field] = req.body[field];
        });

        // Handle profile image upload
        if (req.file) {
            const base64Image = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
            const uploadResult = await uploadProfileImage(base64Image, req.params.id);
            if (uploadResult) {
                updateData.profileImage = uploadResult.url;
            }
        }

        let employee = await User.findById(req.params.id);
        if (!employee) return res.status(404).json({ success: false, message: 'Employee not found' });

        if (password) {
            employee.password = password;
        }

        Object.assign(employee, updateData);
        await employee.save();

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
        const employeeId = req.params.id;
        const employee = await User.findByIdAndDelete(employeeId);

        if (!employee) {
            return res.status(404).json({ success: false, message: 'Employee not found' });
        }

        // Force logout via Socket.io
        const io = req.app.get('io');
        if (io) {
            io.emit('forceLogout', employeeId);
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
                const foundKey = Object.keys(row).find(k => {
                    const cleanK = k.toLowerCase().trim();
                    return keys.some(key => cleanK === key || cleanK.includes(key));
                });
                const val = foundKey ? row[foundKey] : 'NA';
                return val === undefined || val === null || val === '' ? 'NA' : val;
            };

            const name = findVal(['name', 'full name', 'employee name', 'staff name']).toString().trim();
            let mobile = findVal(['mobile', 'contact', 'phone', 'phone number', 'contact details', 'contact no']).toString().trim();
            let email = findVal(['email', 'email address', 'mail']).toString().toLowerCase().trim();

            // Special case: "Contact" might contain email in some formats
            if (email === 'na' || !email) {
                const contactVal = findVal(['contact']).toString();
                if (contactVal.includes('@')) {
                    email = contactVal.toLowerCase().trim();
                }
            }

            // Fallback: If email is missing but mobile exists, generate a dummy email to allow upload
            if ((email === 'na' || !email) && (mobile !== 'na' && mobile)) {
                email = `${mobile}@hrms.com`;
            }

            // Skip if still missing critical data or is a duplicate
            if (name === 'na' || !name || email === 'na' || !email || mobile === 'na' || !mobile) continue;
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

            const deptDesig = findVal(['designation /department', 'designation/department']);
            let department = findVal(['department', 'dept']);
            let designation = findVal(['designation', 'role', 'post']);

            if (deptDesig !== 'NA') {
                const parts = deptDesig.split('/');
                if (parts.length >= 2) {
                    if (designation === 'NA') designation = parts[0].trim();
                    if (department === 'NA') department = parts[1].trim();
                } else if (parts.length === 1) {
                    if (designation === 'NA') designation = parts[0].trim();
                }
            }

            const passwordVal = findVal(['password']);
            const finalPassword = (passwordVal === 'NA' || !passwordVal) ? null : String(passwordVal);

            formattedData.push({
                name: name,
                email: email,
                mobile: mobile,
                department: department === 'NA' ? 'Internal' : department,
                designation: designation === 'NA' ? 'Staff' : designation,
                shift: matchedShift ? matchedShift._id : shifts[0]?._id,
                status: status,
                password: finalPassword,
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
            'Emp ID': emp._id.toString().slice(-8),
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
