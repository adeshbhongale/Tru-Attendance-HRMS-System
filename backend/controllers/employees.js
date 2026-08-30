const mongoose = require('mongoose');
const User = require('../models/User');
const Employee = require('../models/Employee');
const AuditLog = require('../models/AuditLog');
const Attendance = require('../models/Attendance');
const Leave = require('../models/Leave');
const Department = require('../models/Department');
const Designation = require('../models/Designation');
const Shift = require('../models/Shift');
const Location = require('../models/Location');
const LeaveType = require('../models/LeaveType');
const Level = require('../models/Level');
const Grade = require('../models/Grade');
const LeaveBalance = require('../models/LeaveBalance');
const LeaveLedger = require('../models/LeaveLedger');
const Notification = require('../models/Notification');
const EmployeeNotification = require('../models/EmployeeNotification');
const { RawTrackingPoint, LiveEmployeeStatus, TrackingSession } = require('../models/Tracking');
const CustomerVisit = require('../models/CustomerVisit');
const xlsx = require('xlsx');
const { uploadProfileImage, uploadToCloudinary } = require('../config/cloudinary');
const { getStartOfDayIST } = require('../utils/timezone');
const CompanySetting = require('../models/CompanySetting');
const { generateRoleCode } = require('../middleware/rbac');

// @desc    Get all employees / users with dynamic RBAC filters
// @route   GET /api/employees
// @access  Private/Admin
exports.getEmployees = async (req, res, next) => {
    try {
        const { role, allDepartments, all, allCompanies, responsibility, limit, search } = req.query;
        const companyId = req.tenant?.companyId;
        const isSuperAdmin = (req.user && (req.user.role === 'super_admin' || req.user.role === 'superadmin')) || req.tenant?.isSuperAdmin;

        let filter = { status: { $in: ['active', 'ACTIVE'] } };

        // Enforce Company Tenant Scoping unless Super Admin requests all companies
        if (companyId && !(isSuperAdmin && (allCompanies === 'true' || all === 'true'))) {
            filter.$or = [{ companyId }, { company: companyId }];
        }

        // Handle role / approvers filtering dynamically
        if (role && role !== 'all' && !allDepartments && !all) {
            if (role === 'department_admin') {
                filter.$or = [
                    { role: 'department_admin' },
                    { role: 'admin' },
                    { role: 'super_admin' },
                    { departmentAdminType: 'management' },
                    { responsibilityCodes: 'MANAGEMENT_APPROVER' },
                    { roleLevel: { $lte: 2 } }
                ];
            } else {
                filter.role = role;
            }
        }

        if (responsibility) {
            filter.responsibilityCodes = responsibility;
        }

        if (search) {
            const searchRegex = new RegExp(search, 'i');
            filter.$or = [
                { name: searchRegex },
                { fullName: searchRegex },
                { email: searchRegex },
                { employeeId: searchRegex },
                { roleCode: searchRegex }
            ];
        }

        let query = User.find(filter)
            .populate('department', 'name code')
            .populate('shift')
            .populate('workingPlace')
            .populate('company')
            .populate('levelRef')
            .populate('gradeRef')
            .populate('reportsTo', 'name fullName email role roleCode employeeId')
            .populate('responsibilities')
            .sort('-createdAt');

        if (limit) {
            query = query.limit(Number(limit));
        }

        const employees = await query;

        const now = new Date();
        const todayStart = getStartOfDayIST(now);
        const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

        const [todayAttendance, leaveStats] = await Promise.all([
            Attendance.find({
                companyId,
                date: { $gte: todayStart, $lt: todayEnd },
                "punchIn.time": { $exists: true },
                "punchOut.time": { $exists: false }
            }),
            Leave.aggregate([
                { $match: { companyId, status: 'Approved' } },
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
                fullName: emp.fullName || emp.name,
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
        // Validation: At least one Department, Designation, Shift, Working Place, Leave Type must exist

        const targetCompanyId = req.tenant.companyId;
        const [deptCount, desigCount, shiftCount, locCount, leaveTypeCount] = await Promise.all([
            Department.countDocuments({ companyId: targetCompanyId }),
            Designation.countDocuments({ companyId: targetCompanyId }),
            Shift.countDocuments({ companyId: targetCompanyId }),
            Location.countDocuments({ companyId: targetCompanyId }),
            LeaveType.countDocuments({ companyId: targetCompanyId })
        ]);

        if (deptCount === 0 || desigCount === 0 || shiftCount === 0 || locCount === 0 || leaveTypeCount === 0) {
            return res.status(400).json({
                success: false,
                message: 'Please complete office setup (Departments, Designations, Shifts, Working Places, and Leave Types) before adding employees.'
            });
        }

        const { email, mobile, employeeId } = req.body;
        if (!mobile || !mobile.trim()) {
            return res.status(400).json({ success: false, message: 'Mobile number is required.' });
        }

        // Check uniqueness within company
        const existingUser = await User.findOne({
            companyId: targetCompanyId,
            $or: [{ email: email.toLowerCase() }, { mobile }]
        });
        if (existingUser) {
            const field = existingUser.email === email.toLowerCase() ? 'Email' : 'Mobile number';
            return res.status(400).json({ success: false, message: `${field} already exists in this company's records.` });
        }

        const { name, department, designation, shift, workingPlace, gender, status, password, joiningDate, role, roleLevel, roleGrade, levelRef, gradeRef, reportsTo, approver, responsibilities, responsibilityCodes, dataScope, address, dob, bloodGroup, referenceName1, referenceNumber1, referenceName2, referenceNumber2, documents } = req.body;

        // Cross-company manager validation
        if (reportsTo) {
            const managerUser = await User.findById(reportsTo);
            if (!managerUser) {
                return res.status(400).json({ success: false, message: 'Reporting manager not found.' });
            }
            const managerCompanyId = managerUser.companyId || managerUser.company;
            if (managerCompanyId && managerCompanyId.toString() !== targetCompanyId.toString()) {
                return res.status(400).json({ success: false, message: 'Reporting manager belongs to another company.' });
            }
        }

        let roleCode = req.body.roleCode ? req.body.roleCode.trim().toUpperCase() : null;
        let finalRoleLevel = roleLevel ? Number(roleLevel) : null;
        let finalLevelRef = levelRef || null;
        let levelDoc = null;

        if (finalRoleLevel) {
            levelDoc = await Level.findOne({ companyId: targetCompanyId, levelNumber: finalRoleLevel }).lean();
        }
        if (!levelDoc && finalLevelRef) {
            levelDoc = await Level.findOne({ _id: finalLevelRef, companyId: targetCompanyId }).lean();
        }

        if (levelDoc) {
            finalLevelRef = levelDoc._id;
            finalRoleLevel = levelDoc.levelNumber;
            if (!roleCode) {
                const settings = await CompanySetting.findOne({ companyId: targetCompanyId });
                const orgCode = settings?.orgCode || 'TC';
                const gradeDoc = gradeRef ? await Grade.findOne({ _id: gradeRef, companyId: targetCompanyId }).lean() : null;
                const gradeCode = gradeDoc?.code || roleGrade || 'a';
                let deptPrefix = null;
                if (department) {
                    const dept = await Department.findOne({ companyId: targetCompanyId, name: department });
                    deptPrefix = dept?.prefix || null;
                }
roleCode = await generateRoleCode(orgCode, levelDoc, gradeCode, deptPrefix, targetCompanyId);
            }
        }

        let parsedDocs = [];
        if (documents) {
            try {
                parsedDocs = typeof documents === 'string' ? JSON.parse(documents) : documents;
            } catch (e) {
                parsedDocs = [];
            }
        }

        const generatedEmployeeId = (employeeId || `EMP${Date.now().toString().slice(-4)}`).toUpperCase();

        const employeeData = {
            companyId: targetCompanyId,
            company: targetCompanyId,
            employeeIdCode: generatedEmployeeId,
            name,
            email: email.toLowerCase(),
            mobile,
            department,
            designation,
            shift,
            workingPlace,
            gender,
            status: status || 'ACTIVE',
            role: role || 'employee',
            roleLevel: finalRoleLevel || roleLevel || null,
            roleGrade: roleGrade || null,
            roleCode: roleCode,
            levelRef: finalLevelRef || levelRef || null,
            gradeRef: gradeRef || null,
            reportsTo: reportsTo || null,
            approver: approver || null,
            responsibilities: responsibilities || [],
            responsibilityCodes: responsibilityCodes || [],
            dataScope: dataScope || 'SELF',
            address: address || '',
            dob: dob ? new Date(dob) : null,
            bloodGroup: bloodGroup || '',
            referenceName1: referenceName1 || '',
            referenceNumber1: referenceNumber1 || '',
            referenceName2: referenceName2 || '',
            referenceNumber2: referenceNumber2 || '',
            documents: Array.isArray(parsedDocs) ? parsedDocs : []
        };

        if (joiningDate) {
            employeeData.joiningDate = new Date(joiningDate);
        }

        if (password) {
            employeeData.password = password;
        }

        const employee = await User.create(employeeData);

        // Also create HR Employee Record
        await Employee.create({
            companyId: targetCompanyId,
            employeeId: generatedEmployeeId,
            userId: employee._id,
            name,
            email: email.toLowerCase(),
            phone: mobile,
            reportingTo: reportsTo || null,
            joiningDate: joiningDate ? new Date(joiningDate) : new Date(),
            status: 'ACTIVE',
        }).catch(err => console.log('[Employee Record Warning]:', err.message));

        if (req.file) {
            const base64Image = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
            const uploadResult = await uploadProfileImage(base64Image, employee._id);
            if (uploadResult) {
                employee.profileImage = uploadResult.url;
                await employee.save();
            }
        }

        const populatedEmployee = await User.findById(employee._id)
            .populate('companyId', 'name companyName code companyCode')
            .lean();

        res.status(201).json({
            success: true,
            data: {
                ...employee.toObject(),
                companyCode: populatedEmployee?.companyId?.companyCode || populatedEmployee?.companyId?.code || '',
                companyId: populatedEmployee?.companyId || employee.companyId
            },
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
        if (mobile !== undefined && (!mobile || !mobile.trim())) {
            return res.status(400).json({ success: false, message: 'Mobile number cannot be empty.' });
        }
        const checkOr = [];
        if (email && email.trim()) checkOr.push({ email: email.trim() });
        if (mobile && mobile.trim()) checkOr.push({ mobile: mobile.trim() });

        if (checkOr.length > 0) {
            const existingUser = await User.findOne({
                companyId: req.tenant.companyId,
                _id: { $ne: req.params.id },
                $or: checkOr
            });

            if (existingUser) {
                const field = (email && existingUser.email === email.trim()) ? 'Email' : 'Mobile number';
                return res.status(400).json({ success: false, message: `${field} already belongs to another staff member.` });
            }
        }

        const allowedFields = [
          'name', 'email', 'mobile', 'department', 'designation', 'shift', 'workingPlace', 'gender', 'status',
          'joiningDate', 'roleLevel', 'roleGrade', 'roleCode', 'role', 'company', 'levelRef', 'gradeRef', 'reportsTo',
          'approver', 'responsibilities', 'responsibilityCodes', 'dataScope', 'address', 'dob', 'bloodGroup',
          'referenceName1', 'referenceNumber1', 'referenceName2', 'referenceNumber2', 'documents'
        ];
        const objectIdFields = ['company', 'levelRef', 'gradeRef', 'reportsTo', 'approver'];

        let updateData = {};
        allowedFields.forEach(field => {
            if (req.body[field] !== undefined) {
                if (field === 'documents') {
                    try {
                        updateData.documents = typeof req.body.documents === 'string' ? JSON.parse(req.body.documents) : req.body.documents;
                    } catch (e) {
                        updateData.documents = [];
                    }
                } else if (field === 'dob') {
                    updateData.dob = (req.body.dob && req.body.dob !== 'null') ? new Date(req.body.dob) : null;
                } else if (objectIdFields.includes(field)) {
                    const val = req.body[field];
                    if (val && val !== 'null' && val !== 'undefined' && mongoose.Types.ObjectId.isValid(val)) {
                        updateData[field] = val;
                    } else {
                        updateData[field] = null;
                    }
                } else {
                    updateData[field] = req.body[field];
                }
            }
        });

        // Auto-regenerate roleCode & populate levelRef/roleLevel if levelRef or roleLevel changed
        const newLevelRef = updateData.levelRef || (req.body.levelRef && mongoose.Types.ObjectId.isValid(req.body.levelRef) ? req.body.levelRef : null);
        const newGradeRef = updateData.gradeRef || (req.body.gradeRef && mongoose.Types.ObjectId.isValid(req.body.gradeRef) ? req.body.gradeRef : null);
        const roleLvlNum = req.body.roleLevel ? Number(req.body.roleLevel) : null;

        let levelDoc = null;
        if (roleLvlNum && !isNaN(roleLvlNum)) {
            levelDoc = await Level.findOne({ levelNumber: roleLvlNum, companyId: req.tenant.companyId }).lean();
        }
        if (!levelDoc && newLevelRef && mongoose.Types.ObjectId.isValid(newLevelRef)) {
            levelDoc = await Level.findOne({ _id: newLevelRef, companyId: req.tenant.companyId }).lean();
        }

        if (levelDoc) {
            updateData.levelRef = levelDoc._id;
            updateData.roleLevel = levelDoc.levelNumber;
            if (req.body.roleCode && req.body.roleCode.trim()) {
                updateData.roleCode = req.body.roleCode.trim().toUpperCase();
            } else {
                const settings = await CompanySetting.findOne({ companyId: req.tenant.companyId });
                const orgCode = settings?.orgCode || 'TC';
                const gradeDoc = (newGradeRef && mongoose.Types.ObjectId.isValid(newGradeRef)) ? await Grade.findOne({ _id: newGradeRef, companyId: req.tenant.companyId }).lean() : null;
                const gradeCode = gradeDoc?.code || updateData.roleGrade || 'a';
                let deptPrefix = null;
                const deptName = updateData.department || (await User.findOne({ _id: req.params.id, companyId: req.tenant.companyId }))?.department;
                if (deptName) {
                    const dept = await Department.findOne({ name: deptName, companyId: req.tenant.companyId });
                    deptPrefix = dept?.prefix || null;
                }
                updateData.roleCode = await generateRoleCode(orgCode, levelDoc, gradeCode, deptPrefix, req.tenant.companyId);
            }
        } else if (req.body.roleCode && req.body.roleCode.trim()) {
            updateData.roleCode = req.body.roleCode.trim().toUpperCase();
        }

        // Handle profile image upload
        if (req.file) {
            const base64Image = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
            const uploadResult = await uploadProfileImage(base64Image, req.params.id);
            if (uploadResult) {
                updateData.profileImage = uploadResult.url;
            }
        }

        let employee = await User.findOne({ _id: req.params.id, companyId: req.tenant.companyId });
        if (!employee) return res.status(404).json({ success: false, message: 'Employee not found' });

        if (updateData.reportsTo && mongoose.Types.ObjectId.isValid(updateData.reportsTo)) {
            const managerDoc = await User.findOne({ _id: updateData.reportsTo, companyId: req.tenant.companyId }).populate('levelRef').lean();
            if (managerDoc) {
                const mgrLvl = Number(managerDoc.levelRef?.levelNumber || managerDoc.roleLevel);
                const targetLvl = Number(updateData.roleLevel || employee.roleLevel || levelDoc?.levelNumber);
                if (mgrLvl && targetLvl && mgrLvl >= targetLvl) {
                    if (mgrLvl === targetLvl) {
                        return res.status(400).json({
                            success: false,
                            message: `Cannot assign ${managerDoc.name} (Level ${mgrLvl}) as Reporting Manager. Reporting Manager cannot be at the SAME level.`
                        });
                    } else {
                        return res.status(400).json({
                            success: false,
                            message: `Cannot assign ${managerDoc.name} (Level ${mgrLvl}) as Reporting Manager. Reporting Manager must be from a higher level than Level ${targetLvl}.`
                        });
                    }
                }
            }
        }

        const oldWorkingPlace = employee.workingPlace ? employee.workingPlace.toString() : null;
        const oldShift = employee.shift ? employee.shift.toString() : null;

        if (password && password.trim()) {
            employee.password = password.trim();
        }

        Object.assign(employee, updateData);
        await employee.save();

        // Trigger notifications if workingPlace or shift was updated
        try {
            const autoNotif = require('../services/autoNotificationService');
            const io = req.app.get('io');

            // 1. Workplace Relocation
            if (updateData.workingPlace && updateData.workingPlace.toString() !== oldWorkingPlace) {
                const Location = require('../models/Location');
                const locDoc = await Location.findById(updateData.workingPlace);
                const locName = locDoc ? (locDoc.name || locDoc.address || 'New Office') : 'New Office';
                await autoNotif.triggerWorkplaceRelocated(employee._id, locName, io);
            }

            // 2. Shift Update
            if (updateData.shift && updateData.shift.toString() !== oldShift) {
                const Shift = require('../models/Shift');
                const shiftDoc = await Shift.findById(updateData.shift);
                const timingStr = shiftDoc ? `${shiftDoc.name} (${shiftDoc.startTime} - ${shiftDoc.endTime})` : 'your shift';
                await autoNotif.triggerShiftStartingReminder(employee._id, timingStr, io);
            }
        } catch (notifErr) {
            console.error('Employee update notification error:', notifErr.message);
        }

        res.status(200).json({
            success: true,
            data: employee,
        });
    } catch (err) {
        console.error('updateEmployee error:', err);
        res.status(400).json({ success: false, message: err.message });
    }
};

// @desc    Upload employee document directly to Cloudinary
// @route   POST /api/employees/upload-document
// @access  Private/Admin
exports.uploadEmployeeDocument = async (req, res) => {
    try {
        const { file, docType, docName } = req.body;
        if (!file) {
            return res.status(400).json({ success: false, message: 'Please provide file data' });
        }

        const uploadRes = await uploadToCloudinary(file, 'hrms/employee_documents');
        if (!uploadRes || !uploadRes.url) {
            return res.status(500).json({ success: false, message: 'Cloudinary upload failed' });
        }

        res.status(200).json({
            success: true,
            url: uploadRes.url,
            publicId: uploadRes.publicId,
            docType: docType || 'Other',
            docName: docName || 'Document'
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Delete employee permanently from database
// @route   DELETE /api/employees/:id
// @access  Private/Admin
exports.deleteEmployee = async (req, res, next) => {
    try {
        const employeeId = req.params.id;
        const tenantCompanyId = req.tenant?.companyId || req.user?.companyId || req.user?.company;

        let user = await User.findById(employeeId);
        if (!user) {
            const empDoc = await Employee.findById(employeeId);
            if (empDoc && empDoc.userId) {
                user = await User.findById(empDoc.userId);
            }
        }

        if (!user) {
            await Employee.deleteMany({
                $or: [{ userId: employeeId }, { _id: employeeId }]
            });
            return res.status(200).json({ success: true, message: 'Employee record removed', data: {} });
        }

        // Scope check for Company Admin
        if (req.user && req.user.scope !== 'GLOBAL' && req.user.role !== 'superadmin' && req.user.role !== 'TCSA1') {
            const userCompId = user.companyId || user.company;
            const reqCompId = req.user.companyId || req.user.company;
            if (userCompId && reqCompId && userCompId.toString() !== reqCompId.toString()) {
                return res.status(403).json({ success: false, message: 'Forbidden: Employee belongs to another company' });
            }
        }

        const empCode = user.employeeIdCode || user.employeeId;
        const effectiveCompanyId = user.companyId || user.company || req.tenant.companyId;

        // 1. Unlink any subordinate employees who report to this employee
        await User.updateMany(
            { companyId: effectiveCompanyId, reportsTo: user._id },
            { $unset: { reportsTo: "" } }
        );

        // 2. Cascade delete all records across all collections permanently
        await Promise.all([
            User.findByIdAndDelete(employeeId),
            Employee.deleteMany({ companyId: effectiveCompanyId, $or: [{ userId: user._id }, { employeeId: empCode }] }),
            Attendance.deleteMany({ companyId: effectiveCompanyId, user: user._id }),
            Leave.deleteMany({ companyId: effectiveCompanyId, user: user._id }),
            LeaveBalance.deleteMany({ companyId: effectiveCompanyId, user: user._id }),
            LeaveLedger.deleteMany({ companyId: effectiveCompanyId, user: user._id }),
            RawTrackingPoint.deleteMany({ companyId: effectiveCompanyId, userId: user._id }),
            LiveEmployeeStatus.deleteMany({ companyId: effectiveCompanyId, userId: user._id }),
            TrackingSession.deleteMany({ companyId: effectiveCompanyId, userId: user._id }),
            CustomerVisit.deleteMany({ companyId: effectiveCompanyId, userId: user._id }),
            Notification.deleteMany({ user: user._id }),
            EmployeeNotification.deleteMany({ employeeId: user._id })
        ]);

        // 3. Force logout active sessions via Socket.io
        const io = req.app.get('io');
        if (io) {
            io.to(`company:${effectiveCompanyId}`).emit('forceLogout', employeeId);
            io.to(`company:${effectiveCompanyId}`).emit('employeeDeleted', employeeId);
        }

        res.status(200).json({
            success: true,
            message: 'Employee permanently deleted from database and removed from all views.',
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
        // Validation: At least one Department, Designation, Shift, Working Place, Leave Type must exist

        const [deptCount, desigCount, shiftCount, locCount, leaveTypeCount] = await Promise.all([
            Department.countDocuments({ companyId: req.tenant.companyId }),
            Designation.countDocuments({ companyId: req.tenant.companyId }),
            Shift.countDocuments({ companyId: req.tenant.companyId }),
            Location.countDocuments({ companyId: req.tenant.companyId }),
            LeaveType.countDocuments({ companyId: req.tenant.companyId })
        ]);

        if (deptCount === 0 || desigCount === 0 || shiftCount === 0 || locCount === 0 || leaveTypeCount === 0) {
            return res.status(400).json({
                success: false,
                message: 'Please complete office setup (Departments, Designations, Shifts, Working Places, and Leave Types) before adding employees.'
            });
        }

        if (!req.file) {
            return res.status(400).json({ success: false, message: 'Please upload an excel file' });
        }

        const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const rawData = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

        const shifts = await Shift.find({ companyId: req.tenant.companyId });
        const locations = await Location.find({ companyId: req.tenant.companyId });

        const formattedData = [];
        const seenEmails = new Set();
        const seenMobiles = new Set();

        // Fetch all existing emails and mobiles to check for duplicates
        const existingUsers = await User.find({ companyId: req.tenant.companyId }, 'email mobile');
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

            const firstName = findVal(['first name', 'firstname']);
            const lastName = findVal(['last name', 'lastname']);
            let name = '';
            if (firstName !== 'NA' && lastName !== 'NA') {
                name = `${firstName} ${lastName}`;
            } else if (firstName !== 'NA') {
                name = firstName;
            } else if (lastName !== 'NA') {
                name = lastName;
            }
            if (!name || name === 'NA') {
                name = findVal(['name', 'full name', 'employee name', 'staff name']).toString().trim();
            }

            let mobile = findVal(['mobile', 'contact', 'contact number', 'phone number', 'contact no', 'number']).toString().trim();
            let email = findVal(['email', 'email address', 'mail']).toString().toLowerCase().trim();
            let gender = findVal(['gender', 'sex']).toString().trim();

            // Normalize gender
            if (gender !== 'NA') {
                gender = gender.charAt(0).toUpperCase() + gender.slice(1).toLowerCase();
                if (!['Male', 'Female'].includes(gender)) gender = 'Male';
            } else {
                gender = 'Male'; // Default
            }

            // Special case: "Contact" might contain email in some formats
            if (email === 'na' || !email) {
                const contactVal = findVal(['contact']).toString();
                if (contactVal.includes('@')) {
                    email = contactVal.toLowerCase().trim();
                }
            }

            // Fallback: If email is missing but mobile exists, generate a dummy email to allow upload
            if ((email === 'na' || !email) && (mobile !== 'na' && mobile)) {
                email = `${name.replace(/\s/g, '')}@gmail.com`;
                mobile = "0000000000";
            }

            // Skip if still missing critical data or is a duplicate
            if (name === 'na' || !name || email === 'na' || !email || mobile === 'na' || !mobile) continue;
            if (seenEmails.has(email) || existingEmails.has(email)) continue;
            if (seenMobiles.has(mobile) || existingMobiles.has(mobile)) continue;

            seenEmails.add(email);
            seenMobiles.add(mobile);

            const shiftName = findVal(['shift', 'work shift']);
            const matchedShift = shifts.find(s => s.name.toLowerCase() === shiftName.toString().toLowerCase());

            const locName = findVal(['present working place', 'working place', 'location', 'office']);
            const matchedLoc = locations.find(l => l.name.toLowerCase() === locName.toString().toLowerCase());

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
                gender: gender,
                department: department === 'NA' ? 'Internal' : department,
                designation: designation === 'NA' ? 'Staff' : designation,
                shift: matchedShift ? matchedShift._id : (shifts[0]?._id),
                workingPlace: matchedLoc ? matchedLoc._id : (locations[0]?._id),
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
        const employees = await User.find({ role: 'employee' }).populate('shift').populate('workingPlace').select('+password');

        const data = employees.map(emp => ({
            'Emp ID': emp._id.toString().slice(-8),
            'Full Name': emp.name,
            'Email': emp.email,
            'Contact Number': emp.mobile,
            'Gender': emp.gender || 'Male',
            'Role Code': emp.roleCode || 'N/A',
            'Shift': emp.shift?.name || 'General Shift',
            'Department': emp.department || 'N/A',
            'Designation': emp.designation || 'N/A',
            'Present Working Place': emp.workingPlace?.name || 'N/A',
            'Address': emp.address || 'N/A',
            'Date of Birth': emp.dob ? new Date(emp.dob).toLocaleDateString() : 'N/A',
            'Blood Group': emp.bloodGroup || 'N/A',
            'Reference 1': emp.referenceNumber1 ? `${emp.referenceName1 || ''} (${emp.referenceNumber1})`.trim() : 'N/A',
            'Reference 2': emp.referenceNumber2 ? `${emp.referenceName2 || ''} (${emp.referenceNumber2})`.trim() : 'N/A',
            'Documents Count': emp.documents?.length || 0,
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
