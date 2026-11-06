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

// Initial travel configuration (Admin may change everything later — nothing here is enforced by code).
const sub = (code, name, order, extra = {}) => ({ code, name, order, workflow: 'STANDARD', photosRequired: false, status: 'active', ...extra });
const buildVehicleSubtypes = (conveyanceRateKey) => [
  sub('COMPANY_VEHICLE', 'Company Vehicle', 1),
  sub('OWN_VEHICLE', 'Own Vehicle', 2, { workflow: 'KM_RATE', photosRequired: true, conveyanceRateKey }),
];
const DEFAULT_TRAVEL_MODES = [
  { code: 'TRAIN', name: 'Train', order: 1, subtypes: [sub('TRAIN_1AC', 'Train Ind AC Class', 1), sub('TRAIN_2AC', 'Train IInd AC Class', 2), sub('TRAIN_2ND', 'Train IInd Class', 3)] },
  { code: 'BUS', name: 'Bus', order: 2, subtypes: [sub('AC_LUXURY_BUS', 'AC Luxury Bus', 1)] },
  { code: 'FLIGHT', name: 'Flight', order: 3, subtypes: [sub('FLIGHT_ECONOMY', 'Flight Economy', 1)] },
  { code: 'TAXI_AUTO', name: 'Taxi/Auto', order: 4, subtypes: [] },
  { code: 'TWO_WHEELER_PETROL', name: '2-Wheeler Petrol', order: 5, conveyanceRateKey: 'twoWheeler', subtypes: buildVehicleSubtypes('twoWheeler') },
  { code: 'TWO_WHEELER_EV', name: '2-Wheeler EV', order: 6, conveyanceRateKey: 'eBike', subtypes: buildVehicleSubtypes('eBike') },
  { code: 'FOUR_WHEELER_PETROL', name: '4-Wheeler Petrol', order: 7, conveyanceRateKey: 'car', subtypes: buildVehicleSubtypes('car') },
  { code: 'FOUR_WHEELER_EV', name: '4-Wheeler EV', order: 8, conveyanceRateKey: 'eCar', subtypes: buildVehicleSubtypes('eCar') },
];

const VEHICLE_SPLIT_MODE_DEFS = DEFAULT_TRAVEL_MODES.slice(4);
const LEGACY_VEHICLE_MODE_CODES = ['TWO_WHEELER', 'FOUR_WHEELER', 'OWN_VEHICLE', 'COMPANY_VEHICLE'];

const upgradedVehicleOptionsCompanies = new Set();
const upgradeTravelPromises = new Map();

/**
 * One-time upgrade of companies seeded before travel subtypes existed or before 2-Wheeler / 4-Wheeler
 * were split into 4 separate Travel Modes (2-Wheeler Petrol, 2-Wheeler EV, 4-Wheeler Petrol, 4-Wheeler EV),
 * each with Company Vehicle (STANDARD) and Own Vehicle (KM_RATE) subtypes.
 */
async function upgradeTravelModes(companyId) {
  if (!companyId) return;
  const companyKey = String(companyId);
  if (upgradedVehicleOptionsCompanies.has(companyKey)) return;
  if (upgradeTravelPromises.has(companyKey)) {
    await upgradeTravelPromises.get(companyKey);
    return;
  }

  const runUpgrade = (async () => {
    const existing = await TravelMode.find({ companyId }).lean();
    if (!existing.length) {
      upgradedVehicleOptionsCompanies.add(companyKey);
      return;
    }

    const byCode = new Map(existing.map((m) => [String(m.code || '').toUpperCase(), m]));

    // 1. Ensure public modes (Train, Bus, Flight, Taxi/Auto) have subtypes array
    for (const def of DEFAULT_TRAVEL_MODES.slice(0, 4)) {
      const cur = byCode.get(def.code) || (def.code === 'TAXI_AUTO' ? byCode.get('CAB') : null);
      if (cur) {
        if (!Array.isArray(cur.subtypes)) {
          const set = { subtypes: def.subtypes.map((s) => ({ ...s })) };
          if (cur.code === 'CAB' && cur.name === 'Cab / Taxi') set.name = 'Taxi/Auto';
          // eslint-disable-next-line no-await-in-loop
          await TravelMode.updateOne({ _id: cur._id }, { $set: set });
        }
      } else {
        // eslint-disable-next-line no-await-in-loop
        await TravelMode.create({
          ...def,
          subtypes: def.subtypes.map((s) => ({ ...s })),
          companyId,
          company: companyId,
          status: 'active',
        }).catch(() => {});
      }
    }

    // 2. Ensure the 4 separate Vehicle Travel Modes exist with Company Vehicle & Own Vehicle subtypes
    const ensuredVehicleModes = {};
    for (const def of VEHICLE_SPLIT_MODE_DEFS) {
      // eslint-disable-next-line no-await-in-loop
      let modeDoc = await TravelMode.findOne({ companyId, code: def.code });
      if (!modeDoc) {
        // eslint-disable-next-line no-await-in-loop
        modeDoc = await TravelMode.create({
          ...def,
          subtypes: def.subtypes.map((s) => ({ ...s })),
          companyId,
          company: companyId,
          status: 'active',
        }).catch(() => null);
        if (!modeDoc) {
          // eslint-disable-next-line no-await-in-loop
          modeDoc = await TravelMode.findOne({ companyId, code: def.code });
        }
      } else {
        let changed = false;
        if (modeDoc.status === 'inactive') {
          modeDoc.status = 'active';
          changed = true;
        }
        if (modeDoc.conveyanceRateKey !== def.conveyanceRateKey) {
          modeDoc.conveyanceRateKey = def.conveyanceRateKey;
          changed = true;
        }
        const existingSubs = Array.isArray(modeDoc.subtypes) ? modeDoc.subtypes : [];
        const compPrev = existingSubs.find((s) => String(s.code || '').toUpperCase() === 'COMPANY_VEHICLE');
        const ownPrev = existingSubs.find((s) => String(s.code || '').toUpperCase() === 'OWN_VEHICLE');
        const preservedOwnRate =
          (Number(ownPrev?.ratePerKm) > 0 ? Number(ownPrev.ratePerKm) : null) ??
          (Number(modeDoc.ratePerKm) > 0 ? Number(modeDoc.ratePerKm) : null);
        if (preservedOwnRate !== null && modeDoc.ratePerKm !== preservedOwnRate) {
          modeDoc.ratePerKm = preservedOwnRate;
          changed = true;
        }
        const targetSubs = [
          {
            ...(compPrev && compPrev._id ? { _id: compPrev._id } : {}),
            code: 'COMPANY_VEHICLE',
            name: compPrev?.name || 'Company Vehicle',
            order: 1,
            workflow: 'STANDARD',
            photosRequired: false,
            conveyanceRateKey: '',
            ratePerKm: null,
            status: compPrev?.status === 'inactive' ? 'inactive' : 'active',
          },
          {
            ...(ownPrev && ownPrev._id ? { _id: ownPrev._id } : {}),
            code: 'OWN_VEHICLE',
            name: ownPrev?.name || 'Own Vehicle',
            order: 2,
            workflow: 'KM_RATE',
            photosRequired: ownPrev?.photosRequired !== false,
            conveyanceRateKey: def.conveyanceRateKey,
            ratePerKm: preservedOwnRate,
            status: ownPrev?.status === 'inactive' ? 'inactive' : 'active',
          },
        ];
        const needsSubReset =
          existingSubs.length !== 2 ||
          String(existingSubs[0]?.code || '').toUpperCase() !== 'COMPANY_VEHICLE' ||
          String(existingSubs[1]?.code || '').toUpperCase() !== 'OWN_VEHICLE' ||
          existingSubs[1]?.workflow !== 'KM_RATE' ||
          existingSubs[1]?.conveyanceRateKey !== def.conveyanceRateKey;
        if (needsSubReset || changed) {
          modeDoc.subtypes = targetSubs;
          // eslint-disable-next-line no-await-in-loop
          await modeDoc.save().catch(() => {});
        }
      }
      if (modeDoc) ensuredVehicleModes[def.code] = modeDoc;
    }

    // 3. Migrate any existing TRAVEL Level Entitlements from legacy TWO_WHEELER / FOUR_WHEELER to the split modes
    const legacyEnts = await ExpenseEntitlement.find({
      companyId,
      expenseTypeCode: 'TRAVEL',
      travelModeCode: { $in: ['TWO_WHEELER', 'FOUR_WHEELER'] },
    }).lean();
    for (const oldEnt of legacyEnts) {
      const targetCodes = oldEnt.travelModeCode === 'TWO_WHEELER'
        ? ['TWO_WHEELER_PETROL', 'TWO_WHEELER_EV']
        : ['FOUR_WHEELER_PETROL', 'FOUR_WHEELER_EV'];
      const oldAllowedCodes = new Map(
        (oldEnt.allowedSubtypes || []).map((a) => [String(a.code || a.subtypeCode || '').toUpperCase(), a])
      );
      for (const tCode of targetCodes) {
        const targetMode = ensuredVehicleModes[tCode];
        if (!targetMode) continue;
        const allowedSubtypes = [];
        for (const s of (targetMode.subtypes || [])) {
          const sCode = String(s.code || '').toUpperCase();
          const matchedOld =
            oldAllowedCodes.get(sCode) ||
            (sCode === 'OWN_VEHICLE' ? oldAllowedCodes.get(tCode) : null);
          if (matchedOld) {
            allowedSubtypes.push({
              subtypeId: s._id,
              code: s.code,
              name: s.name,
              maxAmount: matchedOld.maxAmount === undefined ? null : matchedOld.maxAmount,
            });
          }
        }
        if (allowedSubtypes.length > 0 || (oldEnt.allowedSubtypes || []).length === 0) {
          const filter = {
            companyId,
            policyId: oldEnt.policyId,
            levelNumber: oldEnt.levelNumber,
            gradeCode: oldEnt.gradeCode || '',
            cityClass: oldEnt.cityClass || 'ALL',
            expenseTypeCode: 'TRAVEL',
            travelModeCode: targetMode.code,
          };
          // eslint-disable-next-line no-await-in-loop
          await ExpenseEntitlement.updateOne(
            filter,
            {
              $setOnInsert: {
                companyId,
                company: companyId,
                policyId: oldEnt.policyId,
                policyVersionId: oldEnt.policyVersionId || oldEnt.policyId,
                levelNumber: oldEnt.levelNumber,
                levelRef: oldEnt.levelRef || null,
                levelName: oldEnt.levelName || '',
                gradeCode: oldEnt.gradeCode || '',
                gradeRef: oldEnt.gradeRef || null,
                cityClass: oldEnt.cityClass || 'ALL',
                expenseTypeCode: 'TRAVEL',
                expenseTypeRef: oldEnt.expenseTypeRef || null,
                travelModeId: targetMode._id,
                travelModeCode: targetMode.code,
                travelModeName: targetMode.name,
                allowedSubtypes,
                maxAmount: oldEnt.maxAmount ?? null,
                amount: oldEnt.amount || 0,
                unit: oldEnt.unit || 'per_item',
                ruleCode: oldEnt.ruleCode || 'TRAVEL_ENTITLEMENT',
                formula: oldEnt.formula || 'MIN(claimed, entitlement); not entitled -> excess',
                status: oldEnt.status || 'active',
              },
            },
            { upsert: true }
          ).catch(() => {});
        }
      }
      // eslint-disable-next-line no-await-in-loop
      await ExpenseEntitlement.deleteOne({ _id: oldEnt._id }).catch(() => {});
    }

    // 4. Remove legacy combined/standalone vehicle modes so only the 4 clean modes remain
    await TravelMode.deleteMany({
      companyId,
      code: { $in: LEGACY_VEHICLE_MODE_CODES },
    }).catch(() => {});

    // 5. Deduplicate subtypes across all remaining travel modes
    const allModes = await TravelMode.find({ companyId });
    for (const mDoc of allModes) {
      if (!Array.isArray(mDoc.subtypes) || mDoc.subtypes.length <= 1) continue;
      const seenSubCodes = new Set();
      const uniqueSubs = [];
      let hadDup = false;
      for (const s of mDoc.subtypes) {
        const c = String(s.code || '').trim().toUpperCase();
        if (!c || seenSubCodes.has(c)) {
          hadDup = true;
          continue;
        }
        seenSubCodes.add(c);
        uniqueSubs.push(s);
      }
      if (hadDup) {
        mDoc.subtypes = uniqueSubs;
        // eslint-disable-next-line no-await-in-loop
        await mDoc.save().catch(() => {});
      }
    }

    upgradedVehicleOptionsCompanies.add(companyKey);
  })();

  upgradeTravelPromises.set(companyKey, runUpgrade);
  try {
    await runUpgrade;
  } finally {
    upgradeTravelPromises.delete(companyKey);
  }
}

// Level Entitlements v2 index adds travelModeCode; drop the legacy unique key once per process.
let entitlementIndexesChecked = false;
async function ensureEntitlementIndexes(force = false) {
  if (entitlementIndexesChecked && !force) return;
  try {
    const indexes = await ExpenseEntitlement.collection.indexes();
    for (const idx of indexes) {
      const isLegacyName = idx.name === 'uniq_entitlement_key';
      const isLegacyKey = idx.unique && idx.key && idx.key.expenseTypeCode && !idx.key.travelModeCode;
      if (isLegacyName || isLegacyKey) {
        // eslint-disable-next-line no-await-in-loop
        await ExpenseEntitlement.collection.dropIndex(idx.name).catch(() => {});
      }
    }
    await ExpenseEntitlement.collection.dropIndex('uniq_entitlement_key').catch(() => {});
    await ExpenseEntitlement.syncIndexes().catch(() => {});
    entitlementIndexesChecked = true;
  } catch (err) {
    await ExpenseEntitlement.collection.dropIndex('uniq_entitlement_key').catch(() => {});
    if (!/ns does not exist|NamespaceNotFound|buffering timed out|not connected/i.test(String(err && err.message))) {
      console.warn('[Expense] Level Entitlement index migration skipped:', err.message);
    }
  }
}

const migratedPurchaseClaimsCompanies = new Set();

/**
 * Idempotently migrate historical `OTHER` claims that were submitted with `otherSubType === 'PURCHASE'`
 * into the dedicated `STOCK_PURCHASE` claim type while preserving all IDs, amounts, attachments,
 * approval history, payment history, and audit records.
 */
async function migrateOtherPurchaseClaims(companyId, { force = false } = {}) {
  if (!companyId) return { migrated: 0 };
  const companyKey = String(companyId);
  if (!force && migratedPurchaseClaimsCompanies.has(companyKey)) return { migrated: 0 };
  const ExpenseClaim = require('../models/ExpenseClaim');
  const claims = await ExpenseClaim.find({
    companyId,
    $or: [
      { 'entries.otherSubType': 'PURCHASE' },
      { 'employeeClaims.items.otherSubType': 'PURCHASE' },
    ],
  });
  let migrated = 0;
  for (const claim of claims) {
    let changed = false;
    if (Array.isArray(claim.entries)) {
      let entriesChanged = false;
      for (const e of claim.entries) {
        if (String(e.otherSubType || '').toUpperCase() === 'PURCHASE') {
          e.expenseType = 'STOCK_PURCHASE';
          e.otherSubType = '';
          entriesChanged = true;
          changed = true;
        }
      }
      if (entriesChanged) claim.markModified('entries');
    }
    if (Array.isArray(claim.employeeClaims)) {
      for (const ec of claim.employeeClaims) {
        if (Array.isArray(ec.items)) {
          for (const it of ec.items) {
            if (String(it.otherSubType || '').toUpperCase() === 'PURCHASE') {
              it.expenseType = 'STOCK_PURCHASE';
              it.expenseTypeName = 'Stock Purchase';
              it.otherSubType = '';
              changed = true;
            }
          }
        }
      }
    }
    const primaryEntryType = claim.entries?.[0]?.expenseType || claim.employeeClaims?.[0]?.items?.[0]?.expenseType;
    if (String(claim.claimType || '').toUpperCase() === 'OTHER' && primaryEntryType === 'STOCK_PURCHASE') {
      claim.claimType = 'STOCK_PURCHASE';
      changed = true;
    }
    if (changed) {
      // eslint-disable-next-line no-await-in-loop
      await claim.save().catch(() => {});
      migrated++;
    }
  }
  migratedPurchaseClaimsCompanies.add(companyKey);
  return { migrated };
}

async function ensureExpenseMasters(companyId) {
  if (!companyId) return null;
  await ensureEntitlementIndexes();

  // Seed default travel modes whenever the module is used (idempotent)
  if ((await TravelMode.countDocuments({ companyId })) === 0) {
    const travelModes = DEFAULT_TRAVEL_MODES.map(m => ({
      ...m,
      subtypes: m.subtypes.map((s) => ({ ...s })),
      companyId,
      company: companyId,
      status: 'active',
    }));
    await TravelMode.insertMany(travelModes, { ordered: false }).catch(() => { });
  } else {
    await upgradeTravelModes(companyId);
  }

  // Idempotent initialisation of the relative-stay setting for policies created before it
  // existed (value comes from the ExpensePolicy schema default; existing values are never touched).
  await ExpensePolicy.updateMany(
    { companyId, relativeStayPercent: { $exists: false } },
    { $set: { relativeStayPercent: ExpensePolicy.schema.path('relativeStayPercent').defaultValue } }
  );

  let policyDoc = await ExpensePolicy.findOne({ companyId, status: 'active' }).sort({ createdAt: -1 });

  // Seed a default active policy + master data
  const companyIdStr = companyId.toString();

  const typesData = [
    { code: 'LODGING', name: 'Lodging', category: 'LODGING', calculationMethod: 'ENTITLEMENT_CAP', proofRequired: false, selfAttestationAllowed: true, order: 1, claimMode: 'LODGING', sameDateLimit: 0, allowOverlap: false, payLimitEnabled: false, cfoApprovalRequired: false },
    { code: 'FOOD', name: 'Food', category: 'FOOD', calculationMethod: 'RULE_BASED', proofRequired: false, selfAttestationAllowed: true, order: 2, claimMode: 'NORMAL', sameDateLimit: 1, payLimitEnabled: false, cfoApprovalRequired: false },
    { code: 'CONVEYANCE', name: 'Local Conveyance', category: 'CONVEYANCE', calculationMethod: 'KM_RATE', proofRequired: false, selfAttestationAllowed: true, order: 3, claimMode: 'NORMAL', sameDateLimit: 0, payLimitEnabled: false, cfoApprovalRequired: false },
    { code: 'TRAVEL', name: 'Travel', category: 'TRAVEL', calculationMethod: 'ACTUAL', proofRequired: false, selfAttestationAllowed: false, order: 4, claimMode: 'NORMAL', sameDateLimit: 0, payLimitEnabled: false, cfoApprovalRequired: false },
    { code: 'OTHER', name: 'Other Official Expense', category: 'OTHER', calculationMethod: 'ACTUAL', proofRequired: false, selfAttestationAllowed: true, order: 5, claimMode: 'NORMAL', sameDateLimit: 0, payLimitEnabled: true, cfoApprovalRequired: false },
    { code: 'STOCK_PURCHASE', name: 'Stock Purchase', category: 'STOCK_PURCHASE', calculationMethod: 'ACTUAL', proofRequired: false, selfAttestationAllowed: true, order: 6, claimMode: 'NORMAL', sameDateLimit: 0, payLimitEnabled: false, cfoApprovalRequired: true },
  ];

  // Ensure existing TRAVEL, CONVEYANCE, OTHER, and STOCK_PURCHASE types do not enforce sameDateLimit > 0
  await ExpenseType.updateMany(
    { companyId, code: { $in: ['TRAVEL', 'CONVEYANCE', 'OTHER', 'STOCK_PURCHASE'] }, sameDateLimit: { $gt: 0 } },
    { $set: { sameDateLimit: 0 } }
  );

  await migrateOtherPurchaseClaims(companyId).catch(() => {});

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

module.exports = { ensureExpenseMasters, upgradeTravelModes, ensureEntitlementIndexes, migrateOtherPurchaseClaims, SOURCE_ENTITLEMENT_ROWS, CITY_CLASSES, CONVEYANCE_RATES, DEFAULT_TRAVEL_MODES };
