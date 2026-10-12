const ExpensePolicy = require('../models/ExpensePolicy');
const ExpenseType = require('../models/ExpenseType');
const CityClassification = require('../models/CityClassification');
const ExpenseEntitlement = require('../models/ExpenseEntitlement');
const TravelMode = require('../models/TravelMode');
const Level = require('../../../../models/Level');
const Grade = require('../../../../models/Grade');

/**
 * Seed default expense masters for a company when the module is used for the
 * first time. Values are loaded from the source policy (TCSL/ITP/1.8.26) as
 * INITIAL DATA ONLY. Super Admin must confirm the Level -> entitlement row
 * mapping; the engine itself never hard-codes business titles.
 */

const SOURCE_ENTITLEMENT_ROWS = [
  // Row index -> [A+, A, B, C]
  { row: 1, label: 'Row 1', levels: [1, 2, 3], lodging: [4000, 3500, 3000, 2000], food: [1000, 800, 600, 400] },
  { row: 2, label: 'Row 2', levels: [4, 5], lodging: [3500, 3000, 2500, 1500], food: [700, 600, 500, 400] },
  { row: 3, label: 'Row 3', levels: [6, 7], lodging: [3000, 2500, 2000, 1200], food: [650, 550, 475, 400] },
  { row: 4, label: 'Row 4', levels: [8, 9], lodging: [2500, 2000, 1500, 1200], food: [600, 500, 450, 400] },
  { row: 5, label: 'Row 5', levels: [10, 11, 12], lodging: [1500, 1200, 1000, 750], food: [500, 450, 400, 350] },
];

const CITY_CLASSES = {
  'A+': [
    'Delhi', 'Mumbai', 'Chennai', 'Bengaluru', 'Hyderabad',
    'Kolkata', 'Goa', 'Thane', 'Panjim', 'Mysore'
  ],
  'A': [
    'Begusarai', 'Belgaum', 'Coimbatore', 'Haridwar', 'Indore',
    'Kochi', 'Kolar', 'Komaram', 'Nagpur', 'Noida',
    'Panchgani', 'Palghar', 'Pune', 'Raebareli', 'Rangareddy',
    'Sangareddy', 'Umbergaon', 'Warangal', 'Jaipur', 'Ahmedabad',
    'Surat', 'Vapi', 'Telangana'
  ],
  'B': [
    'Ahilyanagar', 'Bastar', 'Bazpur', 'Dahej', 'Haryana',
    'Islampur', 'Jalgaon', 'Karad', 'Kolhapur', 'Satara',
    'Miraj', 'Modakurichi', 'Nanded', 'Ongole', 'Paithan',
    'Raniganj', 'Sambhajinagar', 'Sangli', 'Seoni', 'Shendra',
    'Shivamogga', 'Sitapur', 'Solapur', 'Tambati', 'Tumakuru',
    'Nashik', 'Kanlavli'
  ],
};

const CONVEYANCE_RATES = {
  twoWheeler: 3.5,
  car: 5.0,
  eBike: 1.0,
  eCar: 1.75,
};

const DEFAULT_TRAVEL_MODES = [
  { code: 'FLIGHT', name: 'Flight', order: 1 },
  { code: 'TRAIN', name: 'Train', order: 2 },
  { code: 'BUS', name: 'Bus', order: 3 },
  { code: 'CAB', name: 'Cab / Taxi', order: 4 },
  { code: 'OWN_VEHICLE', name: 'Own Vehicle', order: 5 },
  { code: 'COMPANY_VEHICLE', name: 'Company Vehicle', order: 6 },
];

async function ensureExpenseMasters(companyId) {
  if (!companyId) return null;

  // Seed default travel modes whenever the module is used (idempotent)
  if ((await TravelMode.countDocuments({ companyId })) === 0) {
    const travelModes = DEFAULT_TRAVEL_MODES.map(m => ({
      ...m,
      companyId,
      company: companyId,
      status: 'active',
    }));
    await TravelMode.insertMany(travelModes, { ordered: false }).catch(() => { });
  }

  let policyDoc = await ExpensePolicy.findOne({ companyId, status: 'active' }).sort({ createdAt: -1 });

  // Seed a default active policy + master data
  const companyIdStr = companyId.toString();

  const typesData = [
    { code: 'LODGING', name: 'Lodging', category: 'LODGING', calculationMethod: 'ENTITLEMENT_CAP', proofRequired: false, selfAttestationAllowed: true, order: 1, claimMode: 'LOGGING', sameDateLimit: 0, allowOverlap: false },
    { code: 'FOOD', name: 'Food', category: 'FOOD', calculationMethod: 'RULE_BASED', proofRequired: false, selfAttestationAllowed: true, order: 2, claimMode: 'NORMAL', sameDateLimit: 1 },
    { code: 'CONVEYANCE', name: 'Local Conveyance', category: 'CONVEYANCE', calculationMethod: 'KM_RATE', proofRequired: false, selfAttestationAllowed: true, order: 3, claimMode: 'NORMAL', sameDateLimit: 0 },
    { code: 'TRAVEL', name: 'Travel', category: 'TRAVEL', calculationMethod: 'ACTUAL', proofRequired: false, selfAttestationAllowed: false, order: 4, claimMode: 'NORMAL', sameDateLimit: 1 },
    { code: 'OTHER', name: 'Other Official Expense', category: 'OTHER', calculationMethod: 'ACTUAL', proofRequired: false, selfAttestationAllowed: true, order: 5, claimMode: 'NORMAL', sameDateLimit: 0 },
  ];

  const existingTypes = await ExpenseType.find({ companyId }).select('code').lean();
  const existingTypeCodes = new Set(existingTypes.map(t => t.code));
  const typesToInsert = typesData.filter(t => !existingTypeCodes.has(t.code)).map(t => ({ ...t, companyId, company: companyId }));

  const cityDocs = [];
  Object.entries(CITY_CLASSES).forEach(([cls, cities]) => {
    cities.forEach(c => cityDocs.push({ companyId, company: companyId, city: c, cityClass: cls }));
  });

  if (!policyDoc) {
    try {
      const createdPolicy = await ExpensePolicy.create({
        companyId,
        company: companyId,
        name: 'Inland Travel & Expense Policy',
        code: 'TCSL/ITP',
        version: '1.0',
        policyVersion: '1.0',
        status: 'active',
        effectiveFrom: new Date('2026-08-01'),
        source: 'TCSL/ITP/1.8.26',
        approvalRequired: false,
        approvalEngine: 'NONE',
        sharedLodgingRule: 'RULE_75',
        lodgingRules: {
          singleEmployee: { ruleType: 'INDIVIDUAL_100', percent: 100, description: '100% of individual category stay entitlement' },
          twoEmployees: { ruleType: 'COMBINED_PERCENT', percent: 75, description: '75% of combined allowed budget of both' },
          threeEmployees: { ruleType: 'HIGHEST_PLUS_LOWEST', percent: 75, description: 'Combined of highest and lowest allowance amongst the 3' },
          fourPlusEmployees: { ruleType: 'SPLIT_IN_PAIRS_75', percent: 75, description: 'Split allowance in 2s (75% combined per pair)' },
        },
        conveyanceRates: CONVEYANCE_RATES,
        localTravelFoodAllowed: false,
        deadlineRules: [],
        sharedLodgingConfig: {
          rule75: { enabled: true, formula: '(Higher + Lower) x 75%' },
          rule50: { enabled: true, formula: '(Higher + Lower) x 50%' },
          higherOnly: { enabled: true, formula: 'Higher only' },
          higherPlusLower: { enabled: true, formula: 'Higher + Lower' },
        },
      });
      policyDoc = createdPolicy;
    } catch (err) {
      policyDoc = await ExpensePolicy.findOne({ companyId, status: 'active' }).sort({ createdAt: -1 });
    }
  }

  if (typesToInsert.length > 0) {
    await ExpenseType.insertMany(typesToInsert, { ordered: false }).catch(() => { });
  }

  const existingCities = await CityClassification.find({ companyId }).select('city').lean();
  const existingCitySet = new Set(existingCities.map(c => c.city.toUpperCase()));
  const citiesToInsert = cityDocs.filter(c => !existingCitySet.has(c.city.toUpperCase()));
  if (citiesToInsert.length > 0) {
    await CityClassification.insertMany(citiesToInsert, { ordered: false }).catch(() => { });
  }

  // Seed entitlements for the default policy
  if (policyDoc && (await ExpenseEntitlement.countDocuments({ companyId, policyId: policyDoc._id })) === 0) {
    const entitlements = [];
    const levels = await Level.find({ companyId }).lean();
    const levelMap = {};
    levels.forEach(l => { levelMap[l.levelNumber] = l; });

    const classes = ['A+', 'A', 'B', 'C'];
    const typeDocs = await ExpenseType.find({ companyId, status: 'active' }).lean();
    const typeMap = {};
    typeDocs.forEach(t => { typeMap[t.code] = t; });

    SOURCE_ENTITLEMENT_ROWS.forEach(row => {
      row.levels.forEach(ln => {
        const levelDoc = levelMap[ln];
        classes.forEach((cls, idx) => {
          if (typeMap['LODGING']) {
            entitlements.push({
              companyId, company: companyId,
              policyId: policyDoc._id, policyVersionId: policyDoc._id,
              levelNumber: ln, levelRef: levelDoc?._id || null, levelName: levelDoc?.name || `Level ${ln}`,
              gradeCode: '', cityClass: cls, expenseTypeCode: 'LODGING', expenseTypeRef: typeMap['LODGING']._id,
              amount: row.lodging[idx], unit: 'per_day', ruleCode: 'LODGING_ENTITLEMENT',
              formula: 'MIN(actual, entitlement)', status: 'active',
            });
          }
          if (typeMap['FOOD']) {
            entitlements.push({
              companyId, company: companyId,
              policyId: policyDoc._id, policyVersionId: policyDoc._id,
              levelNumber: ln, levelRef: levelDoc?._id || null, levelName: levelDoc?.name || `Level ${ln}`,
              gradeCode: '', cityClass: cls, expenseTypeCode: 'FOOD', expenseTypeRef: typeMap['FOOD']._id,
              amount: row.food[idx], unit: 'per_day', ruleCode: 'FOOD_ENTITLEMENT',
              formula: 'MIN(actual, entitlement)', status: 'active',
            });
          }
        });
      });
    });

    if (entitlements.length > 0) {
      await ExpenseEntitlement.insertMany(entitlements, { ordered: false }).catch(() => { });
    }
  }

  return policyDoc;
}

module.exports = { ensureExpenseMasters, SOURCE_ENTITLEMENT_ROWS, CITY_CLASSES, CONVEYANCE_RATES, DEFAULT_TRAVEL_MODES };
