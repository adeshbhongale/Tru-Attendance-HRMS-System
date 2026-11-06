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
  // Part of priorAllowedOnDate already consumed by OTHER claims (shared food entitlement)
  priorOtherClaims = 0,
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

  // Locate the configured entitlement row (any type may have one; CONVEYANCE/OTHER
  // are only capped when Super Admin configured an entitlement for them)
  baseEntitlement = findEntitlement(
    entitlements,
    employeeLevelNumber,
    employeeGradeCode,
    cityClass,
    expenseTypeCode
  );

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
          breakdown.steps.push(`Friend/relative lodging: (₹${base}/night x ${days} nights = ₹${totalBase}) x 50% = ₹${fullEligible} (${itemDate ? `Date: ${itemDate}, ` : ''}Entry ${sameDateEntryIndex} of ${sameDateEntriesCount})`);
          breakdown.steps.push(`Previously allowed today: ₹${priorAllowedOnDate} -> Remaining budget: ₹${remainingLimit}`);
          breakdown.steps.push(`MIN(${requested}, ${remainingLimit}) = ${allowed}`);
        } else {
          formula = days > 1
            ? `Friend/relative lodging: (₹${base}/night x ${days} nights = ₹${totalBase}) x 50% = ₹${allowed}`
            : `Lodging entitlement x 50%`;
          breakdown.steps.push(`Friend/relative accommodation: ₹${base}/night x ${days} night(s) = ₹${totalBase} x 50% = ₹${allowed}`);
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
          breakdown.steps.push(`Shared lodging (${days} nights, ${percent}%): Shared limit = ₹${sharedLimit} (${itemDate ? `Date: ${itemDate}, ` : ''}Entry ${sameDateEntryIndex} of ${sameDateEntriesCount})`);
          breakdown.steps.push(`Previously allowed today: ₹${priorAllowedOnDate} -> Remaining shared budget: ₹${remainingSharedLimit}`);
          breakdown.steps.push(`MIN(${requested}, ${remainingSharedLimit}) = ${allowed}`);
        } else {
          formula = days > 1
            ? `(Higher [₹${higherTotal}] + Lower [₹${lowerTotal}]) x ${percent}% = Limit ₹${sharedLimit} (${days} nights) -> MIN(₹${requested}, ₹${sharedLimit}) = ₹${allowed}`
            : `(Higher [₹${higherTotal}] + Lower [₹${lowerTotal}]) x ${percent}% = Limit ₹${sharedLimit} -> MIN(₹${requested}, ₹${sharedLimit}) = ₹${allowed}`;
          breakdown.steps.push(`Shared lodging (${days} nights): Higher (₹${higherPerDay}/night x ${days} nights = ₹${higherTotal}) + Lower (₹${lowerPerDay}/night x ${days} nights = ₹${lowerTotal})`);
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
        breakdown.steps.push(`Daily Lodging Entitlement: ₹${perDayEnt}/night (${itemDate ? `Date: ${itemDate}, ` : ''}Entry ${sameDateEntryIndex} of ${sameDateEntriesCount})`);
        breakdown.steps.push(`Previously allowed today: ₹${priorAllowedOnDate} -> Remaining daily budget: ₹${remainingDailyLimit}`);
        breakdown.steps.push(`MIN(${requested}, ${remainingDailyLimit}) = ${allowed}`);
      } else {
        formula = days > 1
          ? `MIN(actual ₹${requested}, entitlement ₹${perDayEnt}/night x ${days} nights = ₹${totalEnt}) = ₹${allowed}`
          : 'MIN(actual, daily entitlement)';
        breakdown.steps.push(days > 1
          ? `Lodging entitlement: ₹${perDayEnt}/night x ${days} night(s) = total entitlement ₹${totalEnt}`
          : `Daily Lodging Entitlement: ₹${perDayEnt}/night`);
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
          priorOtherClaims,
        };

        if (sameDateEntriesCount > 1 || priorOtherClaims > 0) {
          formula = `MIN(actual ₹${requested}, remaining daily entitlement ₹${remainingDailyLimit})`;
          breakdown.steps.push(`Daily Food Entitlement: ₹${baseEnt}/day (${itemDate ? `Date: ${itemDate}, ` : ''}Entry ${sameDateEntryIndex} of ${sameDateEntriesCount})`);
          if (priorOtherClaims > 0) breakdown.steps.push(`Already claimed for this date in other claims: ₹${priorOtherClaims}`);
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
      const vClean = String(vehicle || 'car').toLowerCase().replace(/[\s_-]/g, '');
      const rateMap = {
        twowheeler: policyRates.twoWheeler,
        two_wheeler: policyRates.twoWheeler,
        'two-wheeler': policyRates.twoWheeler,
        bike: policyRates.twoWheeler,
        two: policyRates.twoWheeler,
        car: policyRates.car,
        fourwheeler: policyRates.car,
        four_wheeler: policyRates.car,
        'four-wheeler': policyRates.car,
        ebike: policyRates.eBike,
        e_bike: policyRates.eBike,
        'e-bike': policyRates.eBike,
        ecar: policyRates.eCar,
        e_car: policyRates.eCar,
        'e-car': policyRates.eCar,
      };
      const rate = rateMap[vClean] ?? rateMap[vehicle] ?? policyRates.car ?? 5;

      // Local Conveyance: Directly show all payment is allowed - no combined limit values
      allowed = requested;
      ruleCode = 'CONVEYANCE_FULLY_ALLOWED';
      formula = (rate && distance > 0) ? `${distance}km x ₹${rate}/km` : 'Actuals (Fully Allowed)';
      breakdown.rule = ruleCode;
      breakdown.sourceValues = { vehicle, rate, distanceKm: distance, requestedAmount: requested };
      breakdown.steps.push(distance > 0 ? `${distance}km x ₹${rate}/km = ₹${requested} -> all payment allowed` : `Local conveyance expense ₹${requested} is fully allowed`);
      break;
    }

    case 'STOCK_PURCHASE': {
      allowed = requested;
      ruleCode = 'STOCK_PURCHASE_FULLY_ALLOWED';
      formula = 'Stock Purchase (Fully Allowed)';
      breakdown.rule = ruleCode;
      breakdown.sourceValues = {
        requestedAmount: requested,
        materialName: item.materialName || '',
        barcodeNumber: item.barcodeNumber || '',
        quantity: item.quantity || '',
      };
      breakdown.steps.push(`Stock purchase expense has no combined limit -> all payment of ₹${requested} is allowed`);
      break;
    }

    case 'OTHER': {
      allowed = requested;
      ruleCode = 'OTHER_FULLY_ALLOWED';
      formula = 'Actual amount (Fully Allowed)';
      breakdown.rule = ruleCode;
      breakdown.sourceValues = { requestedAmount: requested, otherSubType: 'NORMAL' };
      breakdown.steps.push(`Other official expense has no combined limit -> all payment of ₹${requested} is allowed`);
      break;
    }

    case 'TRAVEL':
    default: {
      // Travel expense: no combined limit values, directly show all payment is allowed
      allowed = requested;
      ruleCode = 'TRAVEL_FULLY_ALLOWED';
      formula = 'Travel fare (Fully Allowed)';
      breakdown.rule = ruleCode;
      breakdown.sourceValues = { requestedAmount: requested };
      breakdown.steps.push(`Travel expense has no combined limit -> all payment of ₹${requested} is allowed`);
      break;
    }
  }

  const excess = Math.max(0, round2(requested - allowed));

  // Build simple human-language explanation
  let limitText = '';
  let plainExplanation = '';
  let policyLimit = requested;

  if (expenseTypeCode === 'LODGING') {
    const isShared = item.sharedWith || (sharedLodgingHigherEntitlement !== null && sharedLodgingLowerEntitlement !== null);
    const limitVal = isShared ? (breakdown.sourceValues?.sharedLimit || allowed) : (baseEntitlement ? round2(baseEntitlement.amount * days) : allowed);
    policyLimit = limitVal;
    limitText = days > 1 ? `₹${limitVal} (${days} nights)` : `₹${limitVal}/night`;
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
    policyLimit = limitVal;
    limitText = baseEntitlement ? `₹${limitVal}/day` : `Actuals (No limit)`;
    if (!baseEntitlement) {
      plainExplanation = `Food expense of ₹${allowed} is fully allowed based on eligible actuals.`;
    } else if (priorOtherClaims > 0) {
      const remLimit = breakdown.sourceValues?.remainingDailyLimit ?? Math.max(0, round2(limitVal - priorAllowedOnDate));
      const inClaim = round2(priorAllowedOnDate - priorOtherClaims);
      const usedText = `₹${priorOtherClaims} of it is already claimed for this date in other claims${inClaim > 0 ? ` and ₹${inClaim} in the above entry` : ''}`;
      plainExplanation = excess > 0
        ? `Your daily food limit is ${limitText}; ${usedText}, so the remaining limit was ₹${remLimit}. Therefore, ₹${allowed} is allowed and ₹${excess} is excess beyond your daily limit.`
        : `Your daily food limit is ${limitText}; ${usedText}, so the remaining limit was ₹${remLimit}, and ₹${allowed} is fully allowed within this remaining limit.`;
    } else if (sameDateEntriesCount > 1) {
      const remLimit = breakdown.sourceValues?.remainingDailyLimit ?? Math.max(0, round2(limitVal - priorAllowedOnDate));
      if (priorAllowedOnDate > 0) {
        if (excess > 0) {
          plainExplanation = `Your daily food limit is ${limitText}. Since ₹${priorAllowedOnDate} was used in above entry, your remaining limit was ₹${remLimit}. Therefore, ₹${allowed} is allowed and ₹${excess} is excess beyond your daily limit.`;
        } else {
          plainExplanation = `Your daily food limit is ${limitText}. Since ₹${priorAllowedOnDate} was used in above entry, your remaining limit was ₹${remLimit}, and ₹${allowed} is fully allowed within this remaining limit.`;
        }
      } else {
        if (excess > 0) {
          plainExplanation = `Your daily food limit is ${limitText} and your claimed bill is ₹${requested}. Therefore, ₹${allowed} is allowed and ₹${excess} is excess beyond policy limit.`;
        } else {
          plainExplanation = `Your daily food limit is ${limitText} and your claimed bill is ₹${requested}. Since your bill is within your daily limit, ₹${allowed} is fully allowed.`;
        }
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
    policyLimit = requested;
    limitText = (rate && distance > 0) ? `${distance} km × ₹${rate}/km` : `Actuals (Fully Allowed)`;
    plainExplanation = (rate && distance > 0)
      ? `Local conveyance of ₹${requested} (${distance} km at ₹${rate}/km) is fully allowed.`
      : `Local conveyance expense of ₹${requested} is fully allowed.`;
  } else if (expenseTypeCode === 'STOCK_PURCHASE') {
    policyLimit = requested;
    limitText = `Actuals (Fully Allowed)`;
    plainExplanation = `Stock purchase expense of ₹${requested} is fully allowed.`;
  } else if (expenseTypeCode === 'OTHER') {
    policyLimit = requested;
    limitText = `Actuals (Fully Allowed)`;
    plainExplanation = `Other official expense of ₹${requested} is fully allowed.`;
  } else {
    // TRAVEL
    policyLimit = requested;
    limitText = `Actuals (Fully Allowed)`;
    plainExplanation = `Travel ticket/fare of ₹${requested} is fully allowed based on actual booking receipt.`;
  }

  breakdown.policyLimit = policyLimit;
  breakdown.limitText = limitText;
  breakdown.plainExplanation = plainExplanation;
  breakdown.allowedAmount = allowed;
  breakdown.excessAmount = excess;
  breakdown.requestedAmount = requested;
  breakdown.rule = breakdown.rule || ruleCode;
  breakdown.formula = formula;

  return {
    policyLimit,
    requestedAmount: requested,
    allowedAmount: allowed,
    excessAmount: excess,
    remainingLimit: breakdown.sourceValues?.remainingDailyLimit ?? breakdown.sourceValues?.remainingLimit ?? null,
    priorAllowedOnDate,
    priorClaimedOnDate,
    sameDateEntriesCount,
    sameDateEntryIndex,
    ruleCode,
    formula,
    limitText,
    plainExplanation,
    calculationBreakdown: breakdown,
  };
}

module.exports = {
  calculateItem,
  round2,
};
