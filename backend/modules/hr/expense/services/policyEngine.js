const ExpensePolicy = require('../models/ExpensePolicy');
const ExpenseType = require('../models/ExpenseType');
const CityClassification = require('../models/CityClassification');
const ExpenseEntitlement = require('../models/ExpenseEntitlement');

/**
 * Policy Engine — resolves the active policy, city classification and
 * entitlements for a company. All inputs are persisted so the calculation
 * engine can produce auditable snapshots.
 */

async function getActivePolicy(companyId) {
  if (!companyId) return null;
  return ExpensePolicy.findOne({ companyId, status: 'active' })
    .sort({ effectiveFrom: -1, createdAt: -1 })
    .lean();
}

async function getPolicyById(policyId) {
  if (!policyId) return null;
  return ExpensePolicy.findById(policyId).lean();
}

async function getExpenseTypes(companyId) {
  return ExpenseType.find({ companyId, status: 'active' }).sort({ order: 1 }).lean();
}

async function resolveCityClass(companyId, city) {
  if (!city) return 'C';
  const normalized = String(city).trim().toUpperCase();
  const match = await CityClassification.findOne({ companyId, city: normalized, status: 'active' }).lean();
  if (match) return match.cityClass;
  // Try alias
  const aliasMatch = await CityClassification.findOne({ companyId, aliases: normalized, status: 'active' }).lean();
  if (aliasMatch) return aliasMatch.cityClass;
  return 'C'; // C = all other cities not listed
}

async function getEntitlements(companyId, policyId, expenseTypeCodes, cityClass) {
  const typeCodes = Array.isArray(expenseTypeCodes) ? expenseTypeCodes : [expenseTypeCodes];
  const filter = {
    companyId,
    status: 'active',
    expenseTypeCode: { $in: typeCodes },
  };
  if (policyId) filter.policyId = policyId;
  if (cityClass) {
    filter.$or = [{ cityClass }, { cityClass: 'ALL' }];
  }
  return ExpenseEntitlement.find(filter).lean();
}

/**
 * Find the entitlement for a specific employee level/grade.
 * gradeCode optional refinement; falls back to any-grade entitlement if no
 * grade-specific row exists. No hard-coded business titles.
 */
function findEntitlement(entitlements, levelNumber, gradeCode, cityClass, expenseTypeCode) {
  if (!entitlements || !Array.isArray(entitlements)) return null;
  const grade = (gradeCode || '').toLowerCase();

  const exactLevelCityType = entitlements.find(e =>
    e.levelNumber === levelNumber &&
    e.cityClass === cityClass &&
    e.expenseTypeCode === expenseTypeCode &&
    (!e.gradeCode || e.gradeCode === grade)
  );

  if (exactLevelCityType) return exactLevelCityType;

  // Fallback to ALL city class
  const allCity = entitlements.find(e =>
    e.levelNumber === levelNumber &&
    (e.cityClass === 'ALL') &&
    e.expenseTypeCode === expenseTypeCode &&
    (!e.gradeCode || e.gradeCode === grade)
  );

  if (allCity) return allCity;

  // Fallback to no-grade row for the level
  const noGrade = entitlements.find(e =>
    e.levelNumber === levelNumber &&
    e.cityClass === cityClass &&
    e.expenseTypeCode === expenseTypeCode &&
    !e.gradeCode
  );
  if (noGrade) return noGrade;

  return null;
}

function getEmployeeLevelNumber(user) {
  if (!user) return null;
  if (user.levelRef && typeof user.levelRef === 'object' && user.levelRef.levelNumber !== undefined) {
    return Number(user.levelRef.levelNumber);
  }
  if (user.levelNumber !== undefined && user.levelNumber !== null) return Number(user.levelNumber);
  if (user.roleLevel !== undefined && user.roleLevel !== null) return Number(user.roleLevel);
  return null;
}

function getEmployeeGradeCode(user) {
  if (!user) return '';
  if (user.gradeRef && typeof user.gradeRef === 'object' && user.gradeRef.code) {
    return String(user.gradeRef.code).toLowerCase();
  }
  if (user.gradeCode) return String(user.gradeCode).toLowerCase();
  if (user.roleGrade) return String(user.roleGrade).toLowerCase();
  return '';
}

module.exports = {
  getActivePolicy,
  getPolicyById,
  getExpenseTypes,
  resolveCityClass,
  getEntitlements,
  findEntitlement,
  getEmployeeLevelNumber,
  getEmployeeGradeCode,
};
