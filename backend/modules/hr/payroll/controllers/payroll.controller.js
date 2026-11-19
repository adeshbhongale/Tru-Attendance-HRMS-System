const mongoose = require('mongoose');
const ExcelJS = require('exceljs');
const { z } = require('zod');
const Employee = require('../../../../models/Employee');
const CompanySetting = require('../../../../models/CompanySetting');
const PayrollEntry = require('../models/PayrollEntry');
const { getPayrollData, recalculateSingleRow } = require('../services/payrollService');
const { formatDateDDMMYYYY } = require('../services/calendarService');
const { PAY_PER_DAY_DIVISOR, parseTime, roundUpRupee } = require('../services/payrollCalculator');

const strictIntParam = (min, max, fieldName) =>
  z
    .preprocess((val) => {
      if (val === undefined || val === null || String(val).trim() === '') return NaN;
      const str = String(val).trim();
      if (!/^\d+$/.test(str)) return NaN;
      return Number(str);
    }, z.number({ invalid_type_error: `${fieldName} must be an integer` }).int().min(min).max(max));

const monthYearQuerySchema = z.object({
  month: strictIntParam(1, 12, 'month'),
  year: strictIntParam(1970, 2100, 'year'),
});

const patchEntrySchema = z.object({
  employeeObjectId: z
    .string({ required_error: 'employeeObjectId is required' })
    .trim()
    .refine((v) => mongoose.Types.ObjectId.isValid(v), 'Invalid employeeObjectId'),
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(1970).max(2100),
  leaves: z
    .union([
      z.null(),
      z
        .number()
        .int('leaves must be a whole integer (0, 1, 2, ...)')
        .min(0, 'leaves must be >= 0'),
    ])
    .optional(),
  lateDeductionOverride: z
    .union([z.null(), z.number().int('lateDeductionOverride must be an integer').min(0)])
    .optional(),
  basicPay: z
    .number()
    .min(0, 'basicPay must be >= 0')
    .refine(Number.isFinite, 'basicPay must be a finite number')
    .optional(),
  uan: z.string().optional(),
});

const timeHHMMRegex = /^([01]\d|2[0-3]):[0-5]\d$/;

const payrollSettingsSchema = z
  .object({
    lateStartTime: z
      .string()
      .trim()
      .regex(timeHHMMRegex, 'lateStartTime must be in HH:MM (24-hour) format')
      .optional(),
    halfDayTime: z
      .string()
      .trim()
      .regex(timeHHMMRegex, 'halfDayTime must be in HH:MM (24-hour) format')
      .optional(),
    lateFlatAmount: z
      .number()
      .int('lateFlatAmount must be a whole rupee integer')
      .min(0, 'lateFlatAmount must be >= 0')
      .optional(),
    approvedLeaveMultiplier: z
      .number()
      .min(0, 'approvedLeaveMultiplier must be >= 0')
      .refine(Number.isFinite, 'approvedLeaveMultiplier must be finite')
      .optional(),
    uninformedAbsentMultiplier: z
      .number()
      .min(0, 'uninformedAbsentMultiplier must be >= 0')
      .refine(Number.isFinite, 'uninformedAbsentMultiplier must be finite')
      .optional(),
    rejectedLeaveAbsentMultiplier: z
      .number()
      .min(0, 'rejectedLeaveAbsentMultiplier must be >= 0')
      .refine(Number.isFinite, 'rejectedLeaveAbsentMultiplier must be finite')
      .optional(),
  })
  .refine(
    (data) => {
      if (data.lateStartTime && data.halfDayTime) {
        return parseTime(data.halfDayTime, '10:30') >= parseTime(data.lateStartTime, '09:30');
      }
      return true;
    },
    {
      message: 'halfDayTime must be on or after lateStartTime',
      path: ['halfDayTime'],
    }
  );

function resolveTenantCompany(req) {
  const cid = req.tenant?.companyId || req.companyId || null;
  if (!cid || !mongoose.Types.ObjectId.isValid(String(cid))) {
    return null;
  }
  return new mongoose.Types.ObjectId(String(cid));
}

/**
 * GET /api/payroll?month=<1-12>&year=<yyyy>
 */
exports.getPayroll = async (req, res) => {
  try {
    const companyId = resolveTenantCompany(req);
    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: 'Company context is required. Please select a company.',
      });
    }

    const parsed = monthYearQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => i.message).join('; ');
      return res.status(400).json({
        success: false,
        message: `Invalid month or year: ${msg}`,
      });
    }

    const { month, year } = parsed.data;
    const data = await getPayrollData({ companyId, month, year });

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to load payroll data.',
    });
  }
};

/**
 * PATCH /api/payroll/entry
 */
exports.updatePayrollEntry = async (req, res) => {
  try {
    const companyId = resolveTenantCompany(req);
    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: 'Company context is required. Please select a company.',
      });
    }

    const parsed = patchEntrySchema.safeParse(req.body);
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
      return res.status(400).json({
        success: false,
        message: `Validation error: ${msg}`,
      });
    }

    const {
      employeeObjectId,
      month,
      year,
      leaves,
      lateDeductionOverride,
      basicPay,
      uan,
    } = parsed.data;

    // Verify the employee belongs to the caller's company
    const employee = await Employee.findOne({
      _id: employeeObjectId,
      companyId,
    });

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found in this company.',
      });
    }

    // Persist salary master fields on Employee (applies to all future months)
    let employeeModified = false;
    if (basicPay !== undefined) {
      const roundedBasic = roundUpRupee(basicPay);
      employee.basicPay = roundedBasic;
      employee.payPerDay = roundUpRupee(roundedBasic / PAY_PER_DAY_DIVISOR);
      employeeModified = true;
    }
    if (uan !== undefined) {
      employee.uan = uan.trim();
      employeeModified = true;
    }
    if (employeeModified) {
      await employee.save();
    }

    // Persist monthly manual inputs in PayrollEntry
    if (leaves !== undefined || lateDeductionOverride !== undefined) {
      const setFields = {
        updatedBy: req.user?._id || req.user?.id || null,
      };
      if (leaves !== undefined) {
        setFields.leaves = leaves === null ? null : Math.max(0, Math.floor(leaves));
      }
      if (lateDeductionOverride !== undefined) {
        setFields.lateDeductionOverride =
          lateDeductionOverride === null ? null : Math.round(lateDeductionOverride);
      }

      await PayrollEntry.findOneAndUpdate(
        {
          companyId,
          employee: employee._id,
          month,
          year,
        },
        {
          $set: setFields,
          $setOnInsert: {
            companyId,
            employee: employee._id,
            month,
            year,
          },
        },
        {
          upsert: true,
          new: true,
          runValidators: true,
        }
      );
    }

    const updatedRow = await recalculateSingleRow({
      companyId,
      employeeId: employee._id,
      month,
      year,
    });

    return res.status(200).json({
      success: true,
      data: updatedRow,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to update payroll entry.',
    });
  }
};

/**
 * GET /api/payroll/export?month=<1-12>&year=<yyyy>
 */
exports.exportPayroll = async (req, res) => {
  try {
    const companyId = resolveTenantCompany(req);
    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: 'Company context is required. Please select a company.',
      });
    }

    const parsed = monthYearQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => i.message).join('; ');
      return res.status(400).json({
        success: false,
        message: `Invalid month or year: ${msg}`,
      });
    }

    const { month, year } = parsed.data;
    const { rows, totals } = await getPayrollData({ companyId, month, year });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'TruAttendance HRMS';
    const monthPadded = String(month).padStart(2, '0');
    const sheet = workbook.addWorksheet(`Payroll ${year}-${monthPadded}`, {
      views: [{ state: 'frozen', xSplit: 3, ySplit: 2 }],
    });

    const topHeaders = [
      'Serial Number',
      'Employee ID',
      'Name',
      'Designation',
      'Department',
      'Date of Joining',
      'UAN No.',
      'Basic Pay',
      'Days of Month',
      'Sunday',
      'Pay Per Day',
      'Working Days',
      'Total',
      'Leaves',
      'Half Days',
      'Late Marks',
      'Deduction',
      '',
      'Net Pay',
    ];

    const subHeaders = [
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      'Leave',
      'Late Marks',
      '',
    ];

    sheet.addRow(topHeaders);
    sheet.addRow(subHeaders);

    // Merge vertical headers for non-grouped columns and horizontal header for Deduction
    for (let col = 1; col <= 16; col += 1) {
      sheet.mergeCells(1, col, 2, col);
    }
    sheet.mergeCells(1, 17, 1, 18); // Deduction -> Leave + Late Marks
    sheet.mergeCells(1, 19, 2, 19); // Net Pay

    const headerBorder = {
      top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    };

    [1, 2].forEach((rowNum) => {
      const r = sheet.getRow(rowNum);
      r.height = 22;
      r.eachCell({ includeEmpty: true }, (cell) => {
        cell.font = { bold: true, size: 10, color: { argb: 'FF0F172A' } };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF1F5F9' },
        };
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        cell.border = headerBorder;
      });
    });

    // Data rows
    rows.forEach((row, idx) => {
      const dataRow = sheet.addRow([
        idx + 1,
        row.employeeId || '',
        row.name || '',
        row.designation || '',
        row.department || '',
        formatDateDDMMYYYY(row.dateOfJoining),
        row.uan ? String(row.uan) : '0',
        row.basicPay,
        row.daysOfMonth,
        row.sunday,
        row.payPerDay,
        row.workingDays,
        row.total,
        row.leaves,
        row.totalHalfDays ?? ((row.lateCounts?.halfDays ?? 0) + (row.halfDayLeaves?.total ?? 0) + (row.extraLeaveHalfDays ?? 0)),
        row.lateCounts?.flatDays ?? 0,
        row.leaveDeduction,
        row.lateDeduction,
        row.netPay,
      ]);

      dataRow.getCell(1).numFmt = '0';
      dataRow.getCell(8).numFmt = '#,##0';
      dataRow.getCell(9).numFmt = '0';
      dataRow.getCell(10).numFmt = '0';
      dataRow.getCell(11).numFmt = '#,##0';
      dataRow.getCell(12).numFmt = '0';
      dataRow.getCell(13).numFmt = '#,##0';
      dataRow.getCell(14).numFmt = '0';
      dataRow.getCell(15).numFmt = '0';
      dataRow.getCell(16).numFmt = '0';
      dataRow.getCell(17).numFmt = '#,##0';
      dataRow.getCell(18).numFmt = '#,##0';
      dataRow.getCell(19).numFmt = '#,##0';

      if (row.netPay < 0) {
        dataRow.getCell(19).font = { bold: true, color: { argb: 'FFDC2626' } };
      }

      dataRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        cell.border = headerBorder;
        if ([8, 11, 13, 17, 18, 19].includes(colNumber)) {
          cell.alignment = { vertical: 'middle', horizontal: 'right' };
        } else if ([1, 6, 9, 10, 12, 14, 15, 16].includes(colNumber)) {
          cell.alignment = { vertical: 'middle', horizontal: 'center' };
        } else {
          cell.alignment = { vertical: 'middle', horizontal: 'left' };
        }
      });
    });

    // Totals row
    const totalsRow = sheet.addRow([
      '',
      '',
      'Total',
      '',
      '',
      '',
      '',
      totals.basicPay,
      '',
      '',
      '',
      '',
      totals.total,
      '',
      '',
      '',
      totals.leaveDeduction,
      totals.lateDeduction,
      totals.netPay,
    ]);

    totalsRow.height = 24;
    [8, 13, 17, 18, 19].forEach((colIdx) => {
      totalsRow.getCell(colIdx).numFmt = '#,##0';
    });
    totalsRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      cell.font = {
        bold: true,
        size: 10,
        color: { argb: colNumber === 19 && totals.netPay < 0 ? 'FFDC2626' : 'FF0F172A' },
      };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE2E8F0' },
      };
      cell.border = headerBorder;
      if ([8, 13, 17, 18, 19].includes(colNumber)) {
        cell.alignment = { vertical: 'middle', horizontal: 'right' };
      }
    });

    // Column widths
    const widths = [10, 15, 24, 20, 18, 15, 16, 14, 14, 10, 14, 14, 14, 10, 12, 12, 14, 14, 15];
    widths.forEach((w, i) => {
      sheet.getColumn(i + 1).width = w;
    });

    const filename = `Payroll_${year}-${monthPadded}.xlsx`;
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    await workbook.xlsx.write(res);
    return res.end();
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to export payroll Excel.',
    });
  }
};

/**
 * POST/PUT/PATCH /api/payroll/settings
 * Updates CompanySetting.payroll (lateStartTime, halfDayTime, lateFlatAmount) for the caller's company.
 */
exports.updatePayrollSettings = async (req, res) => {
  try {
    const companyId = resolveTenantCompany(req);
    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: 'Company context is required. Please select a company.',
      });
    }

    const toOptNum = (v) => (v !== undefined && v !== null && v !== '' ? Number(v) : undefined);

    const parsed = payrollSettingsSchema.safeParse({
      lateStartTime: req.body?.lateStartTime,
      halfDayTime: req.body?.halfDayTime,
      lateFlatAmount: toOptNum(req.body?.lateFlatAmount),
      approvedLeaveMultiplier: toOptNum(req.body?.approvedLeaveMultiplier),
      uninformedAbsentMultiplier: toOptNum(req.body?.uninformedAbsentMultiplier),
      rejectedLeaveAbsentMultiplier: toOptNum(req.body?.rejectedLeaveAbsentMultiplier),
    });

    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
      return res.status(400).json({
        success: false,
        message: `Validation error: ${msg}`,
      });
    }

    const {
      lateStartTime,
      halfDayTime,
      lateFlatAmount,
      approvedLeaveMultiplier,
      uninformedAbsentMultiplier,
      rejectedLeaveAbsentMultiplier,
    } = parsed.data;

    const setPayload = { updatedAt: new Date() };
    if (lateStartTime !== undefined) setPayload['payroll.lateStartTime'] = lateStartTime;
    if (halfDayTime !== undefined) setPayload['payroll.halfDayTime'] = halfDayTime;
    if (lateFlatAmount !== undefined) setPayload['payroll.lateFlatAmount'] = Math.round(lateFlatAmount);
    if (approvedLeaveMultiplier !== undefined) {
      setPayload['payroll.approvedLeaveMultiplier'] = Math.round(approvedLeaveMultiplier * 100) / 100;
    }
    if (uninformedAbsentMultiplier !== undefined) {
      setPayload['payroll.uninformedAbsentMultiplier'] = Math.round(uninformedAbsentMultiplier * 100) / 100;
    }
    if (rejectedLeaveAbsentMultiplier !== undefined) {
      setPayload['payroll.rejectedLeaveAbsentMultiplier'] = Math.round(rejectedLeaveAbsentMultiplier * 100) / 100;
    }

    const updated = await CompanySetting.findOneAndUpdate(
      { companyId },
      {
        $set: setPayload,
        $setOnInsert: {
          companyId,
        },
      },
      {
        upsert: true,
        new: true,
        runValidators: true,
      }
    ).lean();

    return res.status(200).json({
      success: true,
      data: {
        lateStartTime: updated?.payroll?.lateStartTime || '09:30',
        halfDayTime: updated?.payroll?.halfDayTime || '10:30',
        lateFlatAmount: updated?.payroll?.lateFlatAmount ?? 300,
        approvedLeaveMultiplier: updated?.payroll?.approvedLeaveMultiplier ?? 1,
        uninformedAbsentMultiplier: updated?.payroll?.uninformedAbsentMultiplier ?? 2,
        rejectedLeaveAbsentMultiplier: updated?.payroll?.rejectedLeaveAbsentMultiplier ?? 2.5,
      },
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to update payroll late-mark settings.',
    });
  }
};
