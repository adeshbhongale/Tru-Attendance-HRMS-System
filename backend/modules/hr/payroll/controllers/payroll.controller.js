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
  halfDayDeductionOverride: z
    .union([z.null(), z.number().int('halfDayDeductionOverride must be an integer').min(0)])
    .optional(),
  otherDeduction: z
    .number()
    .min(0, 'otherDeduction must be >= 0')
    .refine(Number.isFinite, 'otherDeduction must be finite')
    .optional(),
  basicPay: z
    .number()
    .min(0, 'basicPay must be >= 0')
    .refine(Number.isFinite, 'basicPay must be a finite number')
    .optional(),
  uan: z
    .string()
    .trim()
    .refine((v) => v === '' || /^\d{12}$/.test(v), 'UAN must be exactly 12 numeric digits')
    .optional(),
  pf: z.number().min(0, 'pf must be >= 0').refine(Number.isFinite, 'pf must be finite').optional(),
  esic: z.number().min(0, 'esic must be >= 0').refine(Number.isFinite, 'esic must be finite').optional(),
  pt: z.number().min(0, 'pt must be >= 0').refine(Number.isFinite, 'pt must be finite').optional(),
  ptOverride: z
    .union([z.null(), z.number().min(0, 'ptOverride must be >= 0').refine(Number.isFinite)])
    .optional(),
  statutoryTotalOverride: z
    .union([z.null(), z.number().min(0, 'statutoryTotalOverride must be >= 0').refine(Number.isFinite)])
    .optional(),
  retentionOverride: z
    .union([z.null(), z.number().min(0, 'retentionOverride must be >= 0').refine(Number.isFinite)])
    .optional(),
  advance: z.number().min(0, 'advance must be >= 0').refine(Number.isFinite, 'advance must be finite').optional(),
  loan: z.number().min(0, 'loan must be >= 0').refine(Number.isFinite, 'loan must be finite').optional(),
  verified: z.boolean().optional(),
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
      halfDayDeductionOverride,
      otherDeduction,
      basicPay,
      uan,
      pf,
      esic,
      pt,
      ptOverride,
      statutoryTotalOverride,
      retentionOverride,
      advance,
      loan,
      verified,
    } = parsed.data;

    // Verify the employee belongs to the caller's company
    const employee = await Employee.findOne({
      _id: employeeObjectId,
      companyId,
    }).populate('userId', 'employmentStatus');

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found in this company.',
      });
    }

    const effectiveEmploymentStatus =
      employee.userId?.employmentStatus || employee.employmentStatus || 'Training';
    const isPermanent = String(effectiveEmploymentStatus).trim().toLowerCase() === 'permanent';

    // Persist salary master fields on Employee (applies to all future months)
    let employeeModified = false;
    if (basicPay !== undefined) {
      const roundedBasic = roundUpRupee(basicPay);
      employee.basicPay = roundedBasic;
      employee.payPerDay = roundUpRupee(roundedBasic / PAY_PER_DAY_DIVISOR);
      employeeModified = true;
    }
    if (uan !== undefined) {
      const trimmedUan = uan.trim();
      if (!isPermanent && trimmedUan !== '') {
        return res.status(400).json({
          success: false,
          message: `UAN is only applicable for Permanent employees (current status: ${effectiveEmploymentStatus}).`,
        });
      }
      employee.uan = trimmedUan;
      employeeModified = true;
    }
    if (employeeModified) {
      await employee.save();
    }

    // Persist monthly manual inputs in PayrollEntry
    const hasMonthlyChange =
      leaves !== undefined ||
      lateDeductionOverride !== undefined ||
      halfDayDeductionOverride !== undefined ||
      otherDeduction !== undefined ||
      pf !== undefined ||
      esic !== undefined ||
      pt !== undefined ||
      ptOverride !== undefined ||
      statutoryTotalOverride !== undefined ||
      retentionOverride !== undefined ||
      advance !== undefined ||
      loan !== undefined ||
      verified !== undefined;

    if (hasMonthlyChange) {
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
      if (halfDayDeductionOverride !== undefined) {
        setFields.halfDayDeductionOverride =
          halfDayDeductionOverride === null ? null : Math.round(halfDayDeductionOverride);
      }
      if (otherDeduction !== undefined) {
        setFields.otherDeduction = otherDeduction > 0 ? roundUpRupee(otherDeduction) : 0;
      }
      if (pf !== undefined) {
        const nextPf = pf > 0 ? roundUpRupee(pf) : 0;
        setFields.pf = nextPf;
        // PF and Retention are mutually exclusive: when PF is entered, clear retention override so retention = 0
        if (nextPf > 0) {
          setFields.retentionOverride = null;
        }
      }
      if (esic !== undefined) {
        setFields.esic = esic > 0 ? roundUpRupee(esic) : 0;
      }
      if (pt !== undefined) {
        const nextPt = pt > 0 ? roundUpRupee(pt) : 0;
        setFields.pt = nextPt;
        setFields.ptOverride = nextPt;
      }
      if (ptOverride !== undefined) {
        setFields.ptOverride =
          ptOverride === null ? null : ptOverride > 0 ? roundUpRupee(ptOverride) : 0;
      }
      if (statutoryTotalOverride !== undefined) {
        setFields.statutoryTotalOverride =
          statutoryTotalOverride === null ? null : roundUpRupee(statutoryTotalOverride);
      }
      if (retentionOverride !== undefined) {
        if (retentionOverride === null) {
          setFields.retentionOverride = null;
        } else {
          const nextRet = retentionOverride > 0 ? roundUpRupee(retentionOverride) : 0;
          setFields.retentionOverride = nextRet;
          // PF and Retention are mutually exclusive: when Retention > 0 is entered, clear PF
          if (nextRet > 0) {
            setFields.pf = 0;
          }
        }
      }
      if (advance !== undefined) {
        setFields.advance = advance > 0 ? roundUpRupee(advance) : 0;
      }
      if (loan !== undefined) {
        setFields.loan = loan > 0 ? roundUpRupee(loan) : 0;
      }
      if (verified !== undefined) {
        setFields.verified = Boolean(verified);
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
    const { rows, totals, settings } = await getPayrollData({ companyId, month, year });

    const unverifiedCount = rows.filter((r) => !r.verified).length;
    if (rows.length > 0 && unverifiedCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Please verify all employees before exporting to Excel (${rows.length - unverifiedCount}/${rows.length} verified).`,
      });
    }

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
      'Working Days',
      'Pay Per Day',
      'Total',
      'Leaves',
      'Half Days',
      'Late Marks',
      'Deduction',
      '',
      '',
      '',
      'Net Pay',
      'Statutory',
      '',
      '',
      '',
      'Final Pay',
      'Retention',
      'Advance',
      'Loan',
      'Bank Pay',
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
      'Half Day',
      'Late Marks',
      'Other',
      '',
      'PF',
      'ESIC',
      'PT',
      'Total',
      '',
      '',
      '',
      '',
      '',
    ];

    sheet.addRow(topHeaders);
    sheet.addRow(subHeaders);

    // Merge vertical headers for non-grouped columns and horizontal headers for Deduction & Statutory
    for (let col = 1; col <= 16; col += 1) {
      sheet.mergeCells(1, col, 2, col);
    }
    sheet.mergeCells(1, 17, 1, 20); // Deduction -> Leave + Half Day + Late Marks + Other
    sheet.mergeCells(1, 21, 2, 21); // Net Pay
    sheet.mergeCells(1, 22, 1, 25); // Statutory -> PF + ESIC + PT + Total
    for (let col = 26; col <= 30; col += 1) {
      sheet.mergeCells(1, col, 2, col); // Final Pay, Retention, Advance, Loan, Bank Pay
    }

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
    const lateStartTime = settings?.lateStartTime || '09:30';
    const halfDayTime = settings?.halfDayTime || '10:30';

    rows.forEach((row, idx) => {
      // Leaves cell with UI breakdown details (full-day leaves & absents only; half-days are in Half Day column)
      const bd = row.leaveBreakdown || {};
      const appDays = Number(bd.approvedLeaveDays) || 0;
      const uninfDays = Number(bd.uninformedAbsentDays) || 0;
      const rejDays = Number(bd.rejectedLeaveAbsentDays) || 0;
      const s1 = row.halfDayLeaves?.session1 ?? 0;
      const s2 = row.halfDayLeaves?.session2 ?? 0;
      const leaveDetails = [];
      if (appDays > 0) leaveDetails.push(`${appDays} Approved`);
      if (uninfDays > 0) leaveDetails.push(`${uninfDays} Absent (No Leave)`);
      if (rejDays > 0) leaveDetails.push(`${rejDays} Rejected (Still Absent)`);
      const leavesCellValue =
        leaveDetails.length > 0 ? `${row.leaves}\n${leaveDetails.join('\n')}` : row.leaves;

      // Half Days cell with UI breakdown details (both approved half-day leaves and late half-days)
      const rowLateStart = row.lateRuleWindow?.lateStartTime || lateStartTime;
      const rowHalfDayTime = row.lateRuleWindow?.halfDayTime || halfDayTime;
      const lateHalf = row.lateCounts?.halfDays ?? 0;
      const extraHalf = row.extraLeaveHalfDays ?? 0;
      const displayedHalfDays =
        row.totalHalfDays ??
        (lateHalf + (row.halfDayLeaves?.total ?? 0) + extraHalf);
      const halfDayDetails = [];
      if (lateHalf > 0) halfDayDetails.push(`${lateHalf} Late (>${rowHalfDayTime})`);
      if (s1 > 0) halfDayDetails.push(`${s1} (1st Shift Leave)`);
      if (s2 > 0) halfDayDetails.push(`${s2} (2nd Shift Leave)`);
      if (extraHalf > 0) halfDayDetails.push(`${extraHalf} (0.5 Leave)`);
      const halfDaysCellValue =
        halfDayDetails.length > 0
          ? `${displayedHalfDays}\n${halfDayDetails.join('\n')}`
          : displayedHalfDays;

      // Late Marks cell with UI breakdown details (flat late marks only; half-days are in Half Day column)
      const flatDays = row.lateCounts?.flatDays ?? 0;
      const lateMarkDetails = [];
      if (flatDays > 0) lateMarkDetails.push(`${flatDays} Late (${rowLateStart}–${rowHalfDayTime})`);
      const lateMarksCellValue =
        lateMarkDetails.length > 0
          ? `${flatDays}\n${lateMarkDetails.join('\n')}`
          : 0;

      const dataRow = sheet.addRow([
        idx + 1,
        row.employeeId || '',
        row.name || '',
        row.designation || '',
        row.department || '',
        formatDateDDMMYYYY(row.dateOfJoining),
        String(row.employmentStatus || '').toLowerCase() === 'permanent'
          ? (row.uan ? String(row.uan) : '-')
          : '-',
        row.basicPay,
        row.daysOfMonth,
        row.sunday,
        row.workingDays,
        row.payPerDay,
        row.total,
        leavesCellValue,
        halfDaysCellValue,
        lateMarksCellValue,
        row.leaveDeduction,
        row.halfDayDeduction ?? 0,
        row.lateDeduction,
        row.otherDeduction ?? 0,
        row.netPay,
        row.pf ?? 0,
        row.esic ?? 0,
        row.pt ?? 0,
        row.statutoryTotal ?? 0,
        row.finalPay ?? 0,
        row.retention ?? 0,
        row.advance ?? 0,
        row.loan ?? 0,
        row.bankPay ?? 0,
      ]);

      const maxLines = Math.max(
        1,
        leaveDetails.length > 0 ? leaveDetails.length + 1 : 1,
        halfDayDetails.length > 0 ? halfDayDetails.length + 1 : 1,
        lateMarkDetails.length > 0 ? lateMarkDetails.length + 1 : 1
      );
      if (maxLines > 1) {
        dataRow.height = maxLines * 15 + 6;
      }

      dataRow.getCell(1).numFmt = '0';
      dataRow.getCell(8).numFmt = '#,##0';
      dataRow.getCell(9).numFmt = '0';
      dataRow.getCell(10).numFmt = '0';
      dataRow.getCell(11).numFmt = '0';
      dataRow.getCell(12).numFmt = '#,##0';
      dataRow.getCell(13).numFmt = '#,##0';
      if (typeof leavesCellValue === 'number') dataRow.getCell(14).numFmt = '0';
      if (typeof halfDaysCellValue === 'number') dataRow.getCell(15).numFmt = '0';
      if (typeof lateMarksCellValue === 'number') dataRow.getCell(16).numFmt = '0';
      [17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30].forEach((colIdx) => {
        dataRow.getCell(colIdx).numFmt = '#,##0';
      });

      if (row.netPay < 0) {
        dataRow.getCell(21).font = { bold: true, color: { argb: 'FFDC2626' } };
      }
      if ((row.finalPay ?? 0) < 0) {
        dataRow.getCell(26).font = { bold: true, color: { argb: 'FFDC2626' } };
      }
      if ((row.bankPay ?? 0) < 0) {
        dataRow.getCell(30).font = { bold: true, color: { argb: 'FFDC2626' } };
      }

      dataRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        cell.border = headerBorder;
        if ([8, 12, 13, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30].includes(colNumber)) {
          cell.alignment = { vertical: 'middle', horizontal: 'right' };
        } else if ([14, 15, 16].includes(colNumber)) {
          cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        } else if ([1, 6, 9, 10, 11].includes(colNumber)) {
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
      totals.halfDayDeduction ?? 0,
      totals.lateDeduction,
      totals.otherDeduction ?? 0,
      totals.netPay,
      totals.pf ?? 0,
      totals.esic ?? 0,
      totals.pt ?? 0,
      totals.statutoryTotal ?? 0,
      totals.finalPay ?? 0,
      totals.retention ?? 0,
      totals.advance ?? 0,
      totals.loan ?? 0,
      totals.bankPay ?? 0,
    ]);

    totalsRow.height = 24;
    const currencyTotalCols = [8, 13, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30];
    currencyTotalCols.forEach((colIdx) => {
      totalsRow.getCell(colIdx).numFmt = '#,##0';
    });
    totalsRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const isNegativeHighlight =
        (colNumber === 21 && totals.netPay < 0) ||
        (colNumber === 26 && (totals.finalPay ?? 0) < 0) ||
        (colNumber === 30 && (totals.bankPay ?? 0) < 0);
      cell.font = {
        bold: true,
        size: 10,
        color: { argb: isNegativeHighlight ? 'FFDC2626' : 'FF0F172A' },
      };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE2E8F0' },
      };
      cell.border = headerBorder;
      if (currencyTotalCols.includes(colNumber)) {
        cell.alignment = { vertical: 'middle', horizontal: 'right' };
      }
    });

    // Column widths
    const widths = [
      10, 15, 24, 20, 18, 15, 16, 14, 14, 10, 14, 14, 14, 26, 24, 22, 14, 14, 14, 12, 15,
      12, 12, 12, 14, 15, 14, 14, 14, 15,
    ];
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
