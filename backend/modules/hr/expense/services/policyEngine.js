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

const CITY_CLASSES_FALLBACK = {
  'A+': [
    'DELHI', 'MUMBAI', 'CHENNAI', 'BENGALURU', 'BANGALORE', 'HYDERABAD',
    'KOLKATA', 'GOA', 'THANE', 'PANJIM', 'MYSORE'
  ],
  'A': [
    'BEGUSARAI', 'BELGAUM', 'COIMBATORE', 'HARIDWAR', 'INDORE',
    'KOCHI', 'KOLAR', 'KOMARAM', 'NAGPUR', 'NOIDA',
    'PANCHGANI', 'PALGHAR', 'PUNE', 'RAEBARELI', 'RANGAREDDY',
    'SANGAREDDY', 'UMBERGAON', 'WARANGAL', 'JAIPUR', 'AHMEDABAD',
    'SURAT', 'VAPI', 'TELANGANA', 'GURGAON', 'GURUGRAM'
  ],
  'B': [
    'AHILYANAGAR', 'BASTAR', 'BAZPUR', 'DAHEJ', 'HARYANA',
    'ISLAMPUR', 'JALGAON', 'KARAD', 'KOLHAPUR', 'SATARA',
    'MIRAJ', 'MODAKURICHI', 'NANDED', 'ONGOLE', 'PAITHAN',
    'RANIGANJ', 'SAMBHAJINAGAR', 'SANGLI', 'SEONI', 'SHENDRA',
    'SHIVAMOGGA', 'SITAPUR', 'SOLAPUR', 'TAMBATI', 'TUMAKURU',
    'NASHIK', 'KANLAVLI'
  ],
};

async function resolveCityClass(companyId, city) {
  if (!city) return 'C';
  const trimmed = String(city).trim();
  const normalized = trimmed.toUpperCase();
  if (companyId) {
    try {
      const match = await CityClassification.findOne({
        companyId,
        status: 'active',
        $or: [
          { city: normalized },
          { city: trimmed },
          { city: { $regex: new RegExp(`^${trimmed}$`, 'i') } },
          { aliases: normalized },
          { aliases: trimmed },
          { aliases: { $regex: new RegExp(`^${trimmed}$`, 'i') } },
        ]
      }).lean();
      if (match && match.cityClass) return match.cityClass;
    } catch (_) {}
  }

  // Fallback to standard policy city classifications
  if (CITY_CLASSES_FALLBACK['A+'].some(c => c === normalized || normalized.includes(c))) return 'A+';
  if (CITY_CLASSES_FALLBACK['A'].some(c => c === normalized || normalized.includes(c))) return 'A';
  if (CITY_CLASSES_FALLBACK['B'].some(c => c === normalized || normalized.includes(c))) return 'B';

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
  const numLevel = Number(levelNumber) || 8;
  const grade = String(gradeCode || '').toLowerCase().trim();
  const cClass = String(cityClass || 'C').toUpperCase().trim();
  const typeCode = String(expenseTypeCode || 'OTHER').toUpperCase().trim();

  if (Array.isArray(entitlements) && entitlements.length > 0) {
    // 1. Exact level, cityClass, typeCode, matching grade
    const exact = entitlements.find(e =>
      Number(e.levelNumber) === numLevel &&
      String(e.cityClass).toUpperCase() === cClass &&
      String(e.expenseTypeCode).toUpperCase() === typeCode &&
      (!e.gradeCode || String(e.gradeCode).toLowerCase().trim() === grade)
    );
    if (exact) return exact;

    // 2. Exact level, 'ALL' city class, matching grade
    const allCity = entitlements.find(e =>
      Number(e.levelNumber) === numLevel &&
      String(e.cityClass).toUpperCase() === 'ALL' &&
      String(e.expenseTypeCode).toUpperCase() === typeCode &&
      (!e.gradeCode || String(e.gradeCode).toLowerCase().trim() === grade)
    );
    if (allCity) return allCity;

    // 3. Exact level, cityClass, no grade restriction
    const noGrade = entitlements.find(e =>
      Number(e.levelNumber) === numLevel &&
      String(e.cityClass).toUpperCase() === cClass &&
      String(e.expenseTypeCode).toUpperCase() === typeCode
    );
    if (noGrade) return noGrade;

    // 4. Exact level, 'ALL' city class, no grade restriction
    const anyCitySameLevel = entitlements.find(e =>
      Number(e.levelNumber) === numLevel &&
      String(e.cityClass).toUpperCase() === 'ALL' &&
      String(e.expenseTypeCode).toUpperCase() === typeCode
    );
    if (anyCitySameLevel) return anyCitySameLevel;

    // 5. Match by level and expense type if present
    const sameLevelAnyCity = entitlements.find(e =>
      Number(e.levelNumber) === numLevel &&
      String(e.expenseTypeCode).toUpperCase() === typeCode
    );
    if (sameLevelAnyCity) return sameLevelAnyCity;
  }

  // Standard company policy table fallback for the exact employee level and city class
  const FALLBACK_ROWS = [
    { levels: [1, 2, 3], lodging: [4000, 3500, 3000, 2000], food: [1000, 800, 600, 400] },
    { levels: [4, 5], lodging: [3500, 3000, 2500, 1500], food: [700, 600, 500, 400] },
    { levels: [6, 7], lodging: [3000, 2500, 2000, 1200], food: [650, 550, 475, 400] },
    { levels: [8, 9], lodging: [2500, 2000, 1500, 1200], food: [600, 500, 450, 400] },
    { levels: [10, 11, 12], lodging: [1500, 1200, 1000, 750], food: [500, 450, 400, 350] },
  ];

  if (typeCode === 'LODGING' || typeCode === 'FOOD') {
    let row = FALLBACK_ROWS.find(r => r.levels.includes(numLevel));
    if (!row) {
      if (numLevel <= 3) row = FALLBACK_ROWS[0];
      else if (numLevel <= 5) row = FALLBACK_ROWS[1];
      else if (numLevel <= 7) row = FALLBACK_ROWS[2];
      else if (numLevel <= 9) row = FALLBACK_ROWS[3];
      else row = FALLBACK_ROWS[4];
    }
    const classIdx = cClass === 'A+' ? 0 : cClass === 'A' ? 1 : cClass === 'B' ? 2 : 3;
    const amount = typeCode === 'LODGING' ? row.lodging[classIdx] : row.food[classIdx];
    return {
      amount,
      unit: 'per_day',
      ruleCode: `${typeCode}_ENTITLEMENT`,
      formula: 'MIN(actual, entitlement)',
      cityClass: cClass,
      levelNumber: numLevel,
      expenseTypeCode: typeCode,
    };
  }

  return null;
}

function getEmployeeLevelNumber(user) {
  if (!user) return 8;
  if (user.levelRef && typeof user.levelRef === 'object' && user.levelRef.levelNumber !== undefined) {
    return Number(user.levelRef.levelNumber);
  }
  if (user.levelNumber !== undefined && user.levelNumber !== null) return Number(user.levelNumber);
  if (user.roleLevel !== undefined && user.roleLevel !== null) return Number(user.roleLevel);

  // Fallback by role if levelRef is not explicitly configured
  const role = String(user.role || '').toLowerCase();
  if (role === 'superadmin' || role === 'admin') return 1;
  if (role === 'manager' || role === 'team_lead' || role === 'hr') return 4;
  if (role === 'employee' || role === 'user') return 8;

  return 8;
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
