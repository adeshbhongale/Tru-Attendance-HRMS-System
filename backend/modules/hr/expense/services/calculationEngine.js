const {
  resolveCityClass,
  findEntitlement,
  getEmployeeLevelNumber,
  getEmployeeGradeCode,
} = require('./policyEngine');

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/**
 * Calculate allowed/excess for a single item. Returns an auditable object.
 */
async function calculateItem({
  item,
  employeeLevelNumber,
  employeeGradeCode,
  entitlements,
  cityClass,
  policy,
  sharedLodgingHigherEntitlement = null,
  sharedLodgingLowerEntitlement = null,
  priorAllowedOnDate = 0,
  priorClaimedOnDate = 0,
  totalClaimedOnDate = null,
  sameDateEntryIndex = 1,
  sameDateEntriesCount = 1,
  itemDate = '',
}) {
  const expenseTypeCode = (item.expenseType || 'OTHER').toUpperCase();
  const requested = round2(item.requestedAmount ?? item.amount ?? 0);
  const distance = round2(item.distanceKm || 0);

  let allowed = 0;
  let ruleCode = '';
  let formula = '';
  let baseEntitlement = null;
  const breakdown = {
    expenseType: expenseTypeCode,
    cityClass,
    levelNumber: employeeLevelNumber,
    gradeCode: employeeGradeCode,
    rule: '',
    sourceValues: {},
    steps: [],
  };

  // Locate entitlement row for entitlement-capped / rule-based types
  if (['LODGING', 'FOOD', 'TRAVEL'].includes(expenseTypeCode)) {
    baseEntitlement = findEntitlement(
      entitlements,
      employeeLevelNumber,
      employeeGradeCode,
      cityClass,
      expenseTypeCode
    );
  }

  const policyRates = (policy && policy.conveyanceRates) || {};
  const days = Math.max(1, Number(item.days || item.stayDays || item.nights || 1));

  switch (expenseTypeCode) {
    case 'LODGING': {
      const accommodationType = (item.accommodationType || 'NORMAL').toUpperCase();

      if (accommodationType === 'FRIEND_RELATIVE') {
        // Friend/relative accommodation = 50% of applicable lodging entitlement
        const base = baseEntitlement ? baseEntitlement.amount : 0;
        const totalBase = round2(base * days);
        const fullEligible = round2(totalBase * 0.5);
        const remainingLimit = Math.max(0, round2(fullEligible - priorAllowedOnDate));
        allowed = Math.min(requested, remainingLimit);
        ruleCode = 'FRIEND_RELATIVE_50';
        breakdown.rule = ruleCode;
        breakdown.sourceValues = {
          baseEntitlement: base,
          days,
          totalBaseEntitlement: totalBase,
          priorAllowedOnDate,
          priorClaimedOnDate,
          remainingDailyLimit: remainingLimit,
          sameDateEntryIndex,
          sameDateEntriesCount,
          itemDate: itemDate || 'N/A',
        };

        if (sameDateEntriesCount > 1) {
          formula = `MIN(actual ₹${requested}, remaining entitlement ₹${remainingLimit})`;
          breakdown.steps.push(`Friend/relative lodging: (₹${base}/day x ${days}d = ₹${totalBase}) x 50% = ₹${fullEligible} (${itemDate ? `Date: ${itemDate}, ` : ''}Entry ${sameDateEntryIndex} of ${sameDateEntriesCount})`);
          breakdown.steps.push(`Previously allowed today: ₹${priorAllowedOnDate} -> Remaining budget: ₹${remainingLimit}`);
          breakdown.steps.push(`MIN(${requested}, ${remainingLimit}) = ${allowed}`);
        } else {
          formula = days > 1
            ? `Friend/relative lodging: (₹${base}/day x ${days} days = ₹${totalBase}) x 50% = ₹${allowed}`
            : `Lodging entitlement x 50%`;
          breakdown.steps.push(`Friend/relative accommodation: ₹${base}/day x ${days} day(s) = ₹${totalBase} x 50% = ₹${allowed}`);
        }
        break;
      }

      if (item.sharedWith || (sharedLodgingHigherEntitlement !== null && sharedLodgingLowerEntitlement !== null)) {
        // Shared lodging — use the Super Admin / Company Admin selected rule from the policy
        const rule = (policy && policy.sharedLodgingRule) || 'HIGHER_PLUS_LOWER';
        const rawPercent = policy && policy.sharedLodgingPercent !== undefined
          ? Number(policy.sharedLodgingPercent)
          : (rule === 'RULE_75' ? 75 : rule === 'RULE_50' ? 50 : rule === 'HIGHER_PLUS_LOWER' ? 100 : 75);
        const percent = Math.max(1, Math.min(100, isNaN(rawPercent) ? 75 : rawPercent));

        const higherPerDay = sharedLodgingHigherEntitlement !== null
          ? sharedLodgingHigherEntitlement
          : (baseEntitlement ? baseEntitlement.amount : 0);
        const lowerPerDay = sharedLodgingLowerEntitlement !== null
          ? sharedLodgingLowerEntitlement
          : (baseEntitlement ? baseEntitlement.amount : 0);

        const higherTotal = round2(higherPerDay * days);
        const lowerTotal = round2(lowerPerDay * days);

        let sharedLimit = 0;
        let ruleCode = rule;

        if (rule === 'HIGHER_ONLY') {
          sharedLimit = round2(higherTotal);
          ruleCode = 'HIGHER_ONLY';
        } else {
          // Dynamic (Higher + Lower) * %
          sharedLimit = round2((higherTotal + lowerTotal) * (percent / 100));
          ruleCode = `SHARED_${percent}_PCT`;
        }

        const remainingSharedLimit = Math.max(0, round2(sharedLimit - priorAllowedOnDate));
        allowed = Math.min(requested, remainingSharedLimit);
        breakdown.rule = ruleCode;
        breakdown.sourceValues = {
          higherEntitlement: higherPerDay,
          lowerEntitlement: lowerPerDay,
          higherTotal,
          lowerTotal,
          days,
          selectedRule: rule,
          percent,
          sharedLimit,
          priorAllowedOnDate,
          priorClaimedOnDate,
          remainingDailyLimit: remainingSharedLimit,
          sameDateEntryIndex,
          sameDateEntriesCount,
          itemDate: itemDate || 'N/A',
        };

        if (sameDateEntriesCount > 1) {
          formula = `MIN(actual ₹${requested}, remaining shared limit ₹${remainingSharedLimit})`;
          breakdown.steps.push(`Shared lodging (${days}d, ${percent}%): Shared limit = ₹${sharedLimit} (${itemDate ? `Date: ${itemDate}, ` : ''}Entry ${sameDateEntryIndex} of ${sameDateEntriesCount})`);
          breakdown.steps.push(`Previously allowed today: ₹${priorAllowedOnDate} -> Remaining shared budget: ₹${remainingSharedLimit}`);
          breakdown.steps.push(`MIN(${requested}, ${remainingSharedLimit}) = ${allowed}`);
        } else {
          formula = days > 1
            ? `(Higher [₹${higherTotal}] + Lower [₹${lowerTotal}]) x ${percent}% = Limit ₹${sharedLimit} (${days} days) -> MIN(₹${requested}, ₹${sharedLimit}) = ₹${allowed}`
            : `(Higher [₹${higherTotal}] + Lower [₹${lowerTotal}]) x ${percent}% = Limit ₹${sharedLimit} -> MIN(₹${requested}, ₹${sharedLimit}) = ₹${allowed}`;
          breakdown.steps.push(`Shared lodging (${days} days): Higher (₹${higherPerDay}/day x ${days}d = ₹${higherTotal}) + Lower (₹${lowerPerDay}/day x ${days}d = ₹${lowerTotal})`);
          breakdown.steps.push(rule === 'HIGHER_ONLY'
            ? `Policy Rule: Higher Entitlement Only -> Shared limit = ₹${sharedLimit}`
            : `Policy Rule: (Higher + Lower) x ${percent}% -> Shared limit = ₹${sharedLimit}`
          );
          breakdown.steps.push(`MIN(requested ₹${requested}, shared limit ₹${sharedLimit}) = ₹${allowed}`);
        }
        break;
      }

      // Normal lodging: MIN(actual, remaining daily entitlement)
      const perDayEnt = baseEntitlement ? baseEntitlement.amount : 0;
      const totalEnt = round2(perDayEnt * days);
      const remainingDailyLimit = Math.max(0, round2(totalEnt - priorAllowedOnDate));
      allowed = Math.min(requested, remainingDailyLimit);
      ruleCode = 'LODGING_ENTITLEMENT';

      breakdown.rule = ruleCode;
      breakdown.sourceValues = {
        entitlementPerDay: perDayEnt,
        days,
        totalEntitlement: totalEnt,
        priorAllowedOnDate,
        priorClaimedOnDate,
        remainingDailyLimit,
        sameDateEntryIndex,
        sameDateEntriesCount,
        itemDate: itemDate || 'N/A',
      };

      if (sameDateEntriesCount > 1) {
        formula = `MIN(actual ₹${requested}, remaining daily entitlement ₹${remainingDailyLimit})`;
        breakdown.steps.push(`Daily Lodging Entitlement: ₹${perDayEnt}/day (${itemDate ? `Date: ${itemDate}, ` : ''}Entry ${sameDateEntryIndex} of ${sameDateEntriesCount})`);
        breakdown.steps.push(`Previously allowed today: ₹${priorAllowedOnDate} -> Remaining daily budget: ₹${remainingDailyLimit}`);
        breakdown.steps.push(`MIN(${requested}, ${remainingDailyLimit}) = ${allowed}`);
      } else {
        formula = days > 1
          ? `MIN(actual ₹${requested}, entitlement ₹${perDayEnt}/day x ${days} days = ₹${totalEnt}) = ₹${allowed}`
          : 'MIN(actual, daily entitlement)';
        breakdown.steps.push(days > 1
          ? `Lodging entitlement: ₹${perDayEnt}/day x ${days} day(s) = total entitlement ₹${totalEnt}`
          : `Daily Lodging Entitlement: ₹${perDayEnt}/day`);
        breakdown.steps.push(`MIN(${requested}, ${totalEnt}) = ${allowed}`);
      }
      break;
    }

    case 'FOOD': {
      const baseEnt = baseEntitlement ? baseEntitlement.amount : 0;
      if (baseEnt > 0) {
        // Date-accumulated daily limit enforcement
        const remainingDailyLimit = Math.max(0, round2(baseEnt - priorAllowedOnDate));
        allowed = Math.min(requested, remainingDailyLimit);
        ruleCode = 'FOOD_ENTITLEMENT';

        breakdown.rule = ruleCode;
        breakdown.sourceValues = {
          dailyEntitlement: baseEnt,
          priorAllowedOnDate,
          priorClaimedOnDate,
          remainingDailyLimit,
          sameDateEntryIndex,
          sameDateEntriesCount,
          itemDate: itemDate || 'N/A',
        };

        if (sameDateEntriesCount > 1) {
          formula = `MIN(actual ₹${requested}, remaining daily entitlement ₹${remainingDailyLimit})`;
          breakdown.steps.push(`Daily Food Entitlement: ₹${baseEnt}/day (${itemDate ? `Date: ${itemDate}, ` : ''}Entry ${sameDateEntryIndex} of ${sameDateEntriesCount})`);
          breakdown.steps.push(`Previously allowed today: ₹${priorAllowedOnDate} -> Remaining daily budget: ₹${remainingDailyLimit}`);
          breakdown.steps.push(`MIN(${requested}, ${remainingDailyLimit}) = ${allowed}`);
        } else {
          formula = 'MIN(actual, daily entitlement)';
          breakdown.steps.push(`Daily Food Entitlement: ₹${baseEnt}/day`);
          breakdown.steps.push(`MIN(${requested}, ${baseEnt}) = ${allowed}`);
        }
      } else {
        allowed = requested;
        ruleCode = 'FOOD_ACTUAL';
        formula = 'Actual eligible food expense';
        breakdown.rule = ruleCode;
        breakdown.sourceValues = { entitlement: 0 };
        breakdown.steps.push(`No fixed entitlement configured -> actual amount: ${allowed}`);
      }
      break;
    }

    case 'CONVEYANCE': {
      const vehicle = (item.vehicle || 'car').toLowerCase();
      const ownership = (item.vehicleOwnership || 'personal').toLowerCase();

      if (ownership === 'company' || vehicle === 'other' || !(distance > 0)) {
        // Company vehicle, "Other" vehicle (no configured rate), OR no distance entered = actual eligible expense
        allowed = requested;
        ruleCode = ownership === 'company' ? 'COMPANY_VEHICLE_ACTUAL' : 'CONVEYANCE_ACTUAL_AMOUNT';
        formula = 'Actual eligible expense';
        breakdown.rule = ruleCode;
        breakdown.sourceValues = { vehicle, ownership, distanceKm: distance };
        breakdown.steps.push(`No km rate for "${vehicle}" or no distance -> actual expense: ${allowed}`);
        break;
      }

      // Personal vehicle per-km rate
      const rateMap = {
        twowheeler: policyRates.twoWheeler,
        two_wheeler: policyRates.twoWheeler,
        'two-wheeler': policyRates.twoWheeler,
        car: policyRates.car,
        ebike: policyRates.eBike,
        e_bike: policyRates.eBike,
        'e-bike': policyRates.eBike,
        ecar: policyRates.eCar,
        e_car: policyRates.eCar,
        'e-car': policyRates.eCar,
      };
      const rate = rateMap[vehicle] ?? policyRates.car ?? 5;
      allowed = round2(distance * rate);
      ruleCode = 'CONVEYANCE_KM_RATE';
      formula = `${distance}km x ₹${rate}/km`;
      breakdown.rule = ruleCode;
      breakdown.sourceValues = { vehicle, rate, distanceKm: distance };
      breakdown.steps.push(`${distance} x ${rate} = ${allowed}`);
      break;
    }

    case 'OTHER': {
      // "OTHER" expense type has no limits — actual requested amount is fully allowed
      allowed = requested;
      ruleCode = 'OTHER_NO_LIMIT';
      formula = 'Actual amount (No limit)';
      breakdown.rule = ruleCode;
      breakdown.sourceValues = { requestedAmount: requested };
      breakdown.steps.push(`Other expense type has no policy limit -> actual requested amount ₹${requested} is fully allowed`);
      break;
    }

    case 'TRAVEL':
    default: {
      // Actual/eligible amount per configured travel rules, capped by entitlement if present
      const ent = baseEntitlement ? baseEntitlement.amount : 0;
      if (ent > 0) {
        allowed = Math.min(requested, ent);
        ruleCode = 'ENTITLEMENT_CAP';
        formula = 'MIN(actual, entitlement)';
        breakdown.sourceValues = { entitlement: ent };
        breakdown.steps.push(`MIN(${requested}, ${ent}) = ${allowed}`);
      } else {
        allowed = requested;
        ruleCode = 'ACTUAL_AMOUNT';
        formula = 'Actual amount';
        breakdown.steps.push(`No entitlement configured -> actual amount = ${allowed}`);
      }
      breakdown.rule = ruleCode;
      break;
    }
  }

  const excess = Math.max(0, round2(requested - allowed));

  // Build simple human-language explanation
  let limitText = '';
  let plainExplanation = '';

  if (expenseTypeCode === 'LODGING') {
    const isShared = item.sharedWith || (sharedLodgingHigherEntitlement !== null && sharedLodgingLowerEntitlement !== null);
    const limitVal = isShared ? (breakdown.sourceValues?.sharedLimit || allowed) : (baseEntitlement ? round2(baseEntitlement.amount * days) : allowed);
    limitText = days > 1 ? `₹${limitVal} (${days} days)` : `₹${limitVal}/day`;
    if (sameDateEntriesCount > 1) {
      const totClaimed = totalClaimedOnDate || (priorClaimedOnDate + requested);
      if (excess > 0) {
        plainExplanation = `Your lodging limit is ${limitText} (Total claimed today across ${sameDateEntriesCount} entries: ₹${totClaimed}). With ₹${priorAllowedOnDate} already allowed from earlier entry, ₹${allowed} is allowed and ₹${excess} is excess beyond your lodging limit.`;
      } else {
        plainExplanation = `Your lodging limit is ${limitText} (Total claimed today across ${sameDateEntriesCount} entries: ₹${totClaimed}). ₹${allowed} is allowed within your remaining lodging limit.`;
      }
    } else {
      if (excess > 0) {
        plainExplanation = `Your lodging limit is ${limitText} and your claimed bill is ₹${requested}. Therefore, ₹${allowed} is allowed and ₹${excess} is excess beyond policy limit.`;
      } else {
        plainExplanation = `Your lodging limit is ${limitText} and your claimed bill is ₹${requested}. Since your bill is within the limit, ₹${allowed} is fully allowed.`;
      }
    }
  } else if (expenseTypeCode === 'FOOD') {
    const limitVal = baseEntitlement ? baseEntitlement.amount : allowed;
    limitText = `₹${limitVal}/day`;
    if (sameDateEntriesCount > 1) {
      const totClaimed = totalClaimedOnDate || (priorClaimedOnDate + requested);
      if (excess > 0) {
        plainExplanation = `Your daily food limit is ${limitText} (Total claimed today across ${sameDateEntriesCount} entries: ₹${totClaimed}). With ₹${priorAllowedOnDate} already allowed from earlier entry, ₹${allowed} is allowed and ₹${excess} is excess beyond your daily limit.`;
      } else {
        plainExplanation = `Your daily food limit is ${limitText} (Total claimed today across ${sameDateEntriesCount} entries: ₹${totClaimed}). ₹${allowed} is allowed within your remaining daily limit.`;
      }
    } else {
      if (excess > 0) {
        plainExplanation = `Your daily food limit is ${limitText} and your claimed bill is ₹${requested}. Therefore, ₹${allowed} is allowed and ₹${excess} is excess beyond policy limit.`;
      } else {
        plainExplanation = `Your daily food limit is ${limitText} and your claimed bill is ₹${requested}. Since your bill is within your daily limit, ₹${allowed} is fully allowed.`;
      }
    }
  } else if (expenseTypeCode === 'CONVEYANCE') {
    const rate = breakdown.sourceValues?.rate;
    if (rate && distance > 0) {
      limitText = `${distance} km × ₹${rate}/km = ₹${allowed}`;
      if (excess > 0) {
        plainExplanation = `Your travel limit is ₹${allowed} (${distance} km at ₹${rate}/km) and your claimed value is ₹${requested}. Therefore, ₹${allowed} is allowed and ₹${excess} is excess.`;
      } else {
        plainExplanation = `Your travel limit is ₹${allowed} (${distance} km at ₹${rate}/km). Your claimed value is ₹${requested}, so ₹${allowed} is fully allowed.`;
      }
    } else {
      limitText = `₹${requested}`;
      plainExplanation = `Conveyance expense of ₹${allowed} is fully allowed based on eligible actuals.`;
    }
  } else if (expenseTypeCode === 'OTHER') {
    limitText = `Actuals (No limit)`;
    plainExplanation = `Other official expense has no fixed cap. Your claimed value of ₹${allowed} is fully allowed.`;
  } else {
    // TRAVEL
    const entVal = baseEntitlement ? baseEntitlement.amount : 0;
    if (entVal > 0) {
      limitText = `₹${entVal}`;
      if (excess > 0) {
        plainExplanation = `Your travel ticket limit is ${limitText} and your ticket fare is ₹${requested}. Therefore, ₹${allowed} is allowed and ₹${excess} is excess.`;
      } else {
        plainExplanation = `Your travel ticket limit is ${limitText} and your ticket fare is ₹${requested}. Since your ticket fare is within the limit, ₹${allowed} is fully allowed.`;
      }
    } else {
      limitText = `₹${requested}`;
      plainExplanation = `Travel ticket fare of ₹${allowed} is fully allowed based on actual booking receipt.`;
    }
  }

  breakdown.limitText = limitText;
  breakdown.plainExplanation = plainExplanation;
  breakdown.allowedAmount = allowed;
  breakdown.excessAmount = excess;
  breakdown.requestedAmount = requested;
  breakdown.rule = breakdown.rule || ruleCode;
  breakdown.formula = formula;

  return {
    requestedAmount: requested,
    allowedAmount: allowed,
    excessAmount: excess,
    ruleCode,
    formula,
    limitText,
    plainExplanation,
    calculationBreakdown: breakdown,
  };
}

/**
 * Calculate an array of expense items for a single employee with date-awareness.
 * Multiple items on the same date for daily-capped types (like FOOD) share the single daily budget.
 */
async function calculateEmployeeItems({
  items,
  employeeLevelNumber,
  employeeGradeCode,
  entitlements,
  cityClass,
  policy,
  defaultDays = 1,
  isSharedLodgingClaim = false,
  sharedHigherEnt = null,
  sharedLowerEnt = null,
  sharedLodgingHigherEntitlement = null,
  sharedLodgingLowerEntitlement = null,
}) {
  const getDateKey = (it) => {
    const raw = it.date || it.expenseDate || it.tripDate || '';
    if (!raw) return 'NO_DATE';
    try {
      const d = new Date(raw);
      if (isNaN(d.getTime())) return String(raw).slice(0, 10);
      return d.toISOString().slice(0, 10);
    } catch (_) {
      return String(raw).slice(0, 10);
    }
  };

  // Group items by date and expense type to count entries and sum totals
  const dateTypeTotals = {};
  for (const it of items || []) {
    const dKey = getDateKey(it);
    const tKey = (it.expenseType || 'OTHER').toUpperCase();
    const compoundKey = `${dKey}___${tKey}`;
    if (!dateTypeTotals[compoundKey]) {
      dateTypeTotals[compoundKey] = { totalClaimed: 0, count: 0 };
    }
    dateTypeTotals[compoundKey].totalClaimed += round2(it.requestedAmount ?? it.amount ?? 0);
    dateTypeTotals[compoundKey].count += 1;
  }

  // Running trackers per date + expenseType
  const runningTrackers = {};

  const calculatedItems = [];
  for (const item of items || []) {
    const isLodgingItem = (item.expenseType || '') === 'LODGING';
    const itemDays = Math.max(1, Number(item.days || item.stayDays || item.nights || defaultDays));
    const dKey = getDateKey(item);
    const tKey = (item.expenseType || 'OTHER').toUpperCase();
    const compoundKey = `${dKey}___${tKey}`;

    if (!runningTrackers[compoundKey]) {
      runningTrackers[compoundKey] = { priorAllowed: 0, priorClaimed: 0, index: 0 };
    }
    runningTrackers[compoundKey].index += 1;

    const groupMeta = dateTypeTotals[compoundKey] || { totalClaimed: 0, count: 1 };
    const currentTracker = runningTrackers[compoundKey];

    const calc = await calculateItem({
      item: {
        ...item,
        days: itemDays,
        description: item.description || item.note || '',
      },
      employeeLevelNumber,
      employeeGradeCode,
      entitlements,
      cityClass,
      policy,
      sharedLodgingHigherEntitlement: isLodgingItem && isSharedLodgingClaim
        ? (sharedLodgingHigherEntitlement ?? sharedHigherEnt)
        : null,
      sharedLodgingLowerEntitlement: isLodgingItem && isSharedLodgingClaim
        ? (sharedLodgingLowerEntitlement ?? sharedLowerEnt)
        : null,
      priorAllowedOnDate: currentTracker.priorAllowed,
      priorClaimedOnDate: currentTracker.priorClaimed,
      totalClaimedOnDate: groupMeta.totalClaimed,
      sameDateEntryIndex: currentTracker.index,
      sameDateEntriesCount: groupMeta.count,
      itemDate: dKey !== 'NO_DATE' ? dKey : '',
    });

    currentTracker.priorAllowed = round2(currentTracker.priorAllowed + (calc.allowedAmount || 0));
    currentTracker.priorClaimed = round2(currentTracker.priorClaimed + (calc.requestedAmount || 0));

    calculatedItems.push({
      ...item,
      days: itemDays,
      description: item.description || item.note || '',
      ...calc,
    });
  }

  return calculatedItems;
}

/**
 * Calculate an entire combined claim payload (multi-employee).
 * payload shape:
 * {
 *   trip: {...},
 *   employeeClaims: [ { employeeId, items: [...], sharedWithEmployeeId } ]
 * }
 */
async function calculateClaim(payload, { policy, entitlements, employeesById, companyId }) {
  const policyObj = policy || {};
  const itemsResolved = payload.items;
  const cityClass = payload.cityClass || (await resolveCityClass(companyId, payload.destination || '')) || 'C';

  // For shared lodging, build a map of employee level numbers to entitlements
  const levelEntitlementMap = {};
  Object.values(employeesById || {}).forEach(emp => {
    const ln = getEmployeeLevelNumber(emp);
    if (ln === null) return;
    const ent = findEntitlement(entitlements, ln, getEmployeeGradeCode(emp), cityClass, 'LODGING');
    if (ent) levelEntitlementMap[ln] = ent.amount;
  });

  const calculatedItems = await calculateEmployeeItems({
    items: itemsResolved,
    employeeLevelNumber: payload.levelNumber,
    employeeGradeCode: payload.gradeCode,
    entitlements,
    cityClass,
    policy: policyObj,
  });

  const requestedTotal = round2(calculatedItems.reduce((s, i) => s + (i.requestedAmount || 0), 0));
  const allowedTotal = round2(calculatedItems.reduce((s, i) => s + (i.allowedAmount || 0), 0));
  const excessTotal = round2(calculatedItems.reduce((s, i) => s + (i.excessAmount || 0), 0));

  return {
    cityClass,
    items: calculatedItems,
    requestedTotal,
    allowedTotal,
    excessTotal,
  };
}

module.exports = {
  calculateItem,
  calculateEmployeeItems,
  calculateClaim,
  round2,
};
