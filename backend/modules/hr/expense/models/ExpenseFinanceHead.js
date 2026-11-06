const mongoose = require('mongoose');
try { require('../../../../models/Company'); } catch (_) {}
try { require('../../../../models/User'); } catch (_) {}

/**
 * CFO / Finance Head of a company (strictly one per company).
 * Gives the 2nd approval on Full Payment and Stock Purchase claims, after the
 * Reporting Manager has approved and before the claim reaches Accounts Admin.
 * Selected from the employee master on the Expense Management page
 * (Super Admin / Company Admin can add or change, HR Admin can only view).
 */
const expenseFinanceHeadSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, unique: true, index: true },
  company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null },
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  employeeName: { type: String, default: '' },
  applyOnFullPayment: { type: Boolean, default: true },
  applicableClaimTypes: {
    type: [String],
    default: ['STOCK_PURCHASE'],
  },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  updatedByName: { type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.models.ExpenseFinanceHead
  || mongoose.model('ExpenseFinanceHead', expenseFinanceHeadSchema);
