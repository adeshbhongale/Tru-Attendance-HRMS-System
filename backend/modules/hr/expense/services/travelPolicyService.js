const mongoose = require('mongoose');

/**
 * Travel policy service — the single backend authority for:
 *  - validating the employee-selected Travel Mode / Subtype against the Admin configuration
 *  - Own Vehicle (KM_RATE) distance x configured rate
 *  - resolving the Level Entitlement that applies to a mode / subtype
 *  - splitting a valid amount into Allowed and Excess
 *
 * Visibility is NOT entitlement: every active mode / subtype is selectable by every employee;
 * the entitlement only decides how much of the amount is allowed. Pure functions only (the
 * controller loads TravelMode / ExpenseEntitlement documents and passes them in).
 */

const MAX_KM_PER_ENTRY = 3000;
const MAX_ODOMETER = 10000000;

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const sid = (v) => (v === null || v === undefined ? '' : String(v && typeof v === 'object' && v._id ? v._id : v));
const isActive = (x) => x && x.status !== 'inactive';
const formatINR = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

/** Active subtypes of a mode in display order (deduplicated by code). */
function activeSubtypes(mode) {
  const seenCodes = new Set();
  return (Array.isArray(mode?.subtypes) ? mode.subtypes : [])
    .filter((s) => {
      if (!isActive(s) || s.isActive === false) return false;
      const key = String(s.code || s._id || '').trim().toUpperCase();
      if (!key || seenCodes.has(key)) return false;
      seenCodes.add(key);
      return true;
    })
    .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
}

const requiresSubtype = (mode) => activeSubtypes(mode).length > 0;

const DEFAULT_RATES_BY_KEY = {
  twoWheeler: 3.5,
  car: 5.0,
  eBike: 1.0,
  eCar: 1.75,
};

const KM_RATE_SUBTYPE_CODES = new Set([
  'OWN_VEHICLE',
  'TWO_WHEELER_PETROL',
  'TWO_WHEELER_EV',
  'FOUR_WHEELER_PETROL',
  'FOUR_WHEELER_EV',
]);

function isKmRateSubtype(subtype) {
  if (!subtype) return false;
  if (subtype.workflow === 'KM_RATE') return true;
  const sCode = String(subtype.code || '').toUpperCase();
  return KM_RATE_SUBTYPE_CODES.has(sCode);
}

function inferRateKey(mode, subtype) {
  if (subtype?.conveyanceRateKey) return subtype.conveyanceRateKey;
  const sCode = String(subtype?.code || '').toUpperCase();
  const sName = String(subtype?.name || '').toUpperCase();
  const mCode = String(mode?.code || '').toUpperCase();
  const mName = String(mode?.name || '').toUpperCase();
  if (
    sCode.includes('TWO_WHEELER_EV') ||
    sCode.includes('2W_EV') ||
    sCode.includes('EBIKE') ||
    sCode.includes('E_BIKE') ||
    mCode.includes('TWO_WHEELER_EV') ||
    mCode.includes('2W_EV') ||
    ((mCode.includes('TWO') || mCode.includes('2W') || mName.includes('2-WHEELER')) && (/\bEV\b|ELECTRIC/.test(sName) || /\bEV\b|ELECTRIC/.test(mName)))
  ) {
    return 'eBike';
  }
  if (
    sCode.includes('FOUR_WHEELER_EV') ||
    sCode.includes('4W_EV') ||
    sCode.includes('ECAR') ||
    sCode.includes('E_CAR') ||
    mCode.includes('FOUR_WHEELER_EV') ||
    mCode.includes('4W_EV') ||
    ((mCode.includes('FOUR') || mCode.includes('4W') || mName.includes('4-WHEELER')) && (/\bEV\b|ELECTRIC/.test(sName) || /\bEV\b|ELECTRIC/.test(mName)))
  ) {
    return 'eCar';
  }
  if (mode?.conveyanceRateKey) return mode.conveyanceRateKey;
  if (sCode.includes('FOUR_WHEELER') || sCode.includes('4W') || sCode.includes('CAR')) {
    return 'car';
  }
  if (sCode.includes('TWO_WHEELER') || sCode.includes('2W') || sCode.includes('BIKE')) {
    return 'twoWheeler';
  }
  if (mCode.includes('FOUR_WHEELER') || mCode.includes('4W') || mCode.includes('CAR') || mName.includes('4-WHEELER') || mName.includes('CAR')) {
    return 'car';
  }
  if (mCode.includes('TWO_WHEELER') || mCode.includes('2W') || mCode.includes('BIKE') || mName.includes('2-WHEELER') || mName.includes('BIKE')) {
    return 'twoWheeler';
  }
  return '';
}

/** Authoritative per-km rate for a KM_RATE subtype or mode (company Travel rate takes priority over Local Conveyance). */
function travelRate(policy, mode, subtype = null) {
  const customSubRate = Number(subtype?.ratePerKm);
  if (Number.isFinite(customSubRate) && customSubRate > 0) return customSubRate;
  const customModeRate = Number(mode?.ratePerKm);
  if (Number.isFinite(customModeRate) && customModeRate > 0) return customModeRate;
  if (!subtype && Array.isArray(mode?.subtypes)) {
    const kmSub = mode.subtypes.find((s) => isActive(s) && isKmRateSubtype(s) && Number(s.ratePerKm) > 0);
    if (kmSub) return Number(kmSub.ratePerKm);
  }
  const key = inferRateKey(mode, subtype);
  if (!key) return 0;
  const r = Number(policy?.conveyanceRates?.[key]);
  if (Number.isFinite(r) && r > 0) return r;
  return DEFAULT_RATES_BY_KEY[key] || 0;
}

/** Client-facing shape of the active configuration (used by claim forms). */
function serializeModes(modes, policy) {
  const list = Array.isArray(modes) ? modes : [];
  const hasSplitVehicleModes = list.some(
    (m) =>
      isActive(m) &&
      ['TWO_WHEELER_PETROL', 'TWO_WHEELER_EV', 'FOUR_WHEELER_PETROL', 'FOUR_WHEELER_EV'].includes(String(m.code || '').toUpperCase())
  );
  const hasAnyVehicleModes =
    hasSplitVehicleModes ||
    list.some((m) => isActive(m) && ['TWO_WHEELER', 'FOUR_WHEELER'].includes(String(m.code || '').toUpperCase()));
  const seenModeCodes = new Set();
  return list
    .filter((m) => {
      if (!isActive(m) || m.isActive === false) return false;
      const code = String(m.code || m._id || '').trim().toUpperCase();
      if (!code || seenModeCodes.has(code)) return false;
      if (hasAnyVehicleModes && (code === 'OWN_VEHICLE' || code === 'COMPANY_VEHICLE')) return false;
      if (hasSplitVehicleModes && (code === 'TWO_WHEELER' || code === 'FOUR_WHEELER')) return false;
      seenModeCodes.add(code);
      return true;
    })
    .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0) || String(a.name).localeCompare(String(b.name)))
    .map((m) => ({
      _id: String(m._id),
      code: m.code,
      name: m.name,
      description: m.description || '',
      requiresSubtype: requiresSubtype(m),
      conveyanceRateKey: m.conveyanceRateKey || inferRateKey(m, null) || '',
      ratePerKm: travelRate(policy, m),
      subtypes: activeSubtypes(m).map((s) => {
        const subWf = isKmRateSubtype(s) ? 'KM_RATE' : (s.workflow || 'STANDARD');
        const subRateKey = inferRateKey(m, s);
        const subRate = subWf === 'KM_RATE' ? travelRate(policy, m, s) : 0;
        return {
          _id: String(s._id),
          code: s.code,
          name: s.name,
          workflow: subWf,
          photosRequired: subWf === 'KM_RATE' ? (s.photosRequired !== false) : !!s.photosRequired,
          conveyanceRateKey: subRateKey,
          rateKey: subRateKey,
          ratePerKm: subRate,
          order: s.order || 0,
        };
      }),
    }));
}

const toNum = (v) => (v === '' || v === null || v === undefined ? null : Number(v));

/**
 * Validate one TRAVEL entry and resolve its mode / subtype. Mutates `entry` with the server
 * values (requestedAmount / distanceKm for Own Vehicle, cleared fields for other workflows) and
 * attaches `entry.travel` (snapshot used by the calculation). Returns field errors.
 */
function resolveTravelEntry(entry, { modes, policy, prefix = '' }) {
  const errors = [];
  const add = (field, code, message, required = false) => errors.push({ field: `${prefix}${field}`, code, message, required });
  const modeId = sid(entry.travelModeId);
  const modeCode = String(entry.travelModeCode || '').trim().toUpperCase();
  const subtypeId = sid(entry.travelSubtypeId);
  const subtypeCode = String(entry.travelSubtypeCode || '').trim().toUpperCase();
  const activeModes = (modes || []).filter(isActive);

  entry.travel = null;
  if (!modeId && !modeCode) {
    if (activeModes.length) add('travelModeId', 'TRAVEL_MODE_REQUIRED', 'Please select the Travel Mode.', true);
    return errors;
  }
  let mode = activeModes.find(
    (m) => (modeId && String(m._id) === modeId)
      || (modeId && String(m.code || '').toUpperCase() === modeId.toUpperCase())
      || (modeCode && String(m.code || '').toUpperCase() === modeCode)
  );
  let effectiveSubtypeCode = subtypeCode;

  // Seamless migration fallback if an older claim/test specifies TWO_WHEELER / FOUR_WHEELER against the 4 split modes
  if (!mode) {
    const rawModeKey = modeCode || modeId.toUpperCase();
    if (rawModeKey === 'TWO_WHEELER') {
      const targetModeCode = (subtypeCode === 'TWO_WHEELER_EV' || subtypeId.toUpperCase() === 'TWO_WHEELER_EV')
        ? 'TWO_WHEELER_EV'
        : 'TWO_WHEELER_PETROL';
      mode = activeModes.find((m) => String(m.code || '').toUpperCase() === targetModeCode);
      if (mode && ['TWO_WHEELER_PETROL', 'TWO_WHEELER_EV', 'TWO_WHEELER_OWN_VEHICLE'].includes(subtypeCode)) {
        effectiveSubtypeCode = 'OWN_VEHICLE';
      }
    } else if (rawModeKey === 'FOUR_WHEELER') {
      const targetModeCode = (subtypeCode === 'FOUR_WHEELER_EV' || subtypeId.toUpperCase() === 'FOUR_WHEELER_EV')
        ? 'FOUR_WHEELER_EV'
        : 'FOUR_WHEELER_PETROL';
      mode = activeModes.find((m) => String(m.code || '').toUpperCase() === targetModeCode);
      if (mode && ['FOUR_WHEELER_PETROL', 'FOUR_WHEELER_EV', 'FOUR_WHEELER_OWN_VEHICLE'].includes(subtypeCode)) {
        effectiveSubtypeCode = 'OWN_VEHICLE';
      }
    }
  }

  if (!mode) {
    add('travelModeId', 'TRAVEL_MODE_INVALID', 'The selected Travel Mode is not available. Please select another mode.');
    return errors;
  }

  const subtypes = activeSubtypes(mode);
  let subtype = null;
  if (subtypes.length) {
    if (!subtypeId && !effectiveSubtypeCode) {
      add('travelSubtypeId', 'TRAVEL_SUBTYPE_REQUIRED', `Please select the ${mode.name} type.`, true);
    } else {
      subtype = subtypes.find(
        (s) => (subtypeId && String(s._id) === subtypeId)
          || (subtypeId && String(s.code || '').toUpperCase() === subtypeId.toUpperCase())
          || (effectiveSubtypeCode && String(s.code || '').toUpperCase() === effectiveSubtypeCode)
      ) || null;
      if (!subtype && ['TWO_WHEELER_OWN_VEHICLE', 'FOUR_WHEELER_OWN_VEHICLE', 'TWO_WHEELER_PETROL', 'TWO_WHEELER_EV', 'FOUR_WHEELER_PETROL', 'FOUR_WHEELER_EV'].includes(effectiveSubtypeCode)) {
        subtype = subtypes.find((s) => String(s.code || '').toUpperCase() === 'OWN_VEHICLE') || null;
      }
      if (!subtype) add('travelSubtypeId', 'TRAVEL_SUBTYPE_INVALID', `The selected type is not available for ${mode.name}.`);
    }
  }
  // A subtype sent for a mode without subtypes is ignored (mode change on the client)
  const workflow = isKmRateSubtype(subtype) ? 'KM_RATE' : 'STANDARD';

  const travel = {
    modeId: String(mode._id),
    modeCode: mode.code,
    modeName: mode.name,
    subtypeId: subtype ? String(subtype._id) : null,
    subtypeCode: subtype?.code || '',
    subtypeName: subtype?.name || '',
    workflow,
    photosRequired: workflow === 'KM_RATE' ? (subtype?.photosRequired !== false) : !!subtype?.photosRequired,
    ratePerKm: 0,
    startKm: null,
    endKm: null,
    distanceKm: 0,
  };

  if (workflow === 'KM_RATE') {
    const startKm = toNum(entry.startKm);
    const endKm = toNum(entry.endKm);
    const directDistanceKm = toNum(entry.distanceKm);
    const rate = travelRate(policy, mode, subtype);
    let ok = true;
    let distance = 0;

    // Prefer direct total KM input (Distance × Rate); only fall back to startKm/endKm when directDistanceKm is not supplied
    const hasDirectDistance = directDistanceKm !== null && Number.isFinite(directDistanceKm) && directDistanceKm > 0 && (startKm === null || endKm === null || (startKm === 0 && endKm === 0));
    const hasStartOrEnd = !hasDirectDistance && (startKm !== null || endKm !== null) && !(startKm === 0 && endKm === 0);
    if (!hasStartOrEnd) {
      if (directDistanceKm === null || !Number.isFinite(directDistanceKm) || directDistanceKm <= 0) {
        add('distanceKm', 'DISTANCE_REQUIRED', 'Please enter the total distance in kilometres.', true);
        ok = false;
      } else if (directDistanceKm > MAX_KM_PER_ENTRY) {
        add('distanceKm', 'DISTANCE_TOO_HIGH', `A single entry can cover at most ${MAX_KM_PER_ENTRY} km.`);
        ok = false;
      } else {
        distance = round2(directDistanceKm);
      }
    } else {
      if (startKm === null) { add('startKm', 'START_KM_REQUIRED', 'Please enter the start kilometre reading.', true); ok = false; }
      else if (!Number.isFinite(startKm) || startKm < 0 || startKm > MAX_ODOMETER) { add('startKm', 'START_KM_INVALID', 'Please enter a valid start kilometre reading.'); ok = false; }
      if (endKm === null) { add('endKm', 'END_KM_REQUIRED', 'Please enter the end kilometre reading.', true); ok = false; }
      else if (!Number.isFinite(endKm) || endKm < 0 || endKm > MAX_ODOMETER) { add('endKm', 'END_KM_INVALID', 'Please enter a valid end kilometre reading.'); ok = false; }
      if (ok && endKm <= startKm) { add('endKm', 'DISTANCE_INVALID', 'End kilometre reading must be greater than the start reading.'); ok = false; }
      distance = ok ? round2(endKm - startKm) : 0;
      if (ok && distance > MAX_KM_PER_ENTRY) { add('endKm', 'DISTANCE_TOO_HIGH', `A single entry can cover at most ${MAX_KM_PER_ENTRY} km.`); ok = false; }
    }

    if (!rate) add('travelSubtypeId', 'RATE_NOT_CONFIGURED', `No per-km rate is configured for ${subtype?.name || mode.name}. Please contact HR / Admin.`);

    if (ok) {
      const computed = round2(distance * rate);
      if (hasStartOrEnd) {
        // Never trust client totals: a differing distance / amount means a stale or manipulated form.
        const clientKm = toNum(entry.distanceKm);
        if (clientKm !== null && clientKm !== 0 && Math.abs(clientKm - distance) > 0.01) {
          add('distanceKm', 'DISTANCE_MISMATCH', `Total kilometres must be ${distance} km (end − start reading).`);
        }
      }
      const clientAmt = toNum(entry.requestedAmount);
      if (rate && clientAmt !== null && clientAmt !== 0 && Math.abs(clientAmt - computed) > 0.01) {
        add('requestedAmount', 'AMOUNT_MISMATCH', `Claim amount must be ${formatINR(computed)} (${distance} km × ${formatINR(rate)}/km). Please refresh the form.`);
      }
      travel.startKm = hasStartOrEnd ? startKm : null;
      travel.endKm = hasStartOrEnd ? endKm : null;
      travel.distanceKm = distance;
      travel.ratePerKm = rate;
      entry.distanceKm = distance;
      entry.requestedAmount = rate ? computed : null;
    }

    if (travel.photosRequired) {
      const labels = { numberPlatePhotos: 'vehicle', startKmPhotos: 'start odometer', endKmPhotos: 'end odometer' };
      const codes = { numberPlatePhotos: 'VEHICLE_PHOTO_REQUIRED', startKmPhotos: 'START_KM_PHOTO_REQUIRED', endKmPhotos: 'END_KM_PHOTO_REQUIRED' };
      Object.keys(labels).forEach((f) => {
        if (!(entry[f] || []).length) add(f, codes[f], `Please upload the ${labels[f]} photo for ${travel.subtypeName || 'Own Vehicle'}.`, true);
      });
    }
    entry.receipts = entry.receipts || [];
  } else {
    // Normal travel fields only: kilometre readings / odometer photos never apply
    entry.startKm = null;
    entry.endKm = null;
    entry.distanceKm = 0;
    entry.numberPlatePhotos = [];
    entry.startKmPhotos = [];
    entry.endKmPhotos = [];
  }

  entry.travelModeId = travel.modeId;
  entry.travelModeCode = travel.modeCode;
  entry.travelModeName = travel.modeName;
  entry.travelSubtypeId = travel.subtypeId;
  entry.travelSubtypeCode = travel.subtypeCode;
  entry.travelSubtypeName = travel.subtypeName;
  entry.travelWorkflow = workflow;
  entry.travel = travel;
  return errors;
}

/**
 * Level Entitlement for a travel mode / subtype.
 * rows: active TRAVEL entitlement rows of the policy. Precedence (most specific first):
 *   level → "All Levels" (0); exact grade → any grade; destination class → ALL.
 * Returns { configured, row, entitled, maxAmount } where maxAmount null = actuals (no cap).
 */
function resolveTravelEntitlement(rows, { levelNumber, gradeCode, cityClass, modeId, modeCode, subtypeId, subtypeCode, requiresSubtype: modeRequiresSubtype = false }) {
  const list = (rows || []).filter((r) => isActive(r) && String(r.expenseTypeCode || '').toUpperCase() === 'TRAVEL');
  const configured = list.length > 0;
  if (!configured) return { configured, row: null, entitled: true, maxAmount: null };

  const forMode = list.filter((r) => (r.travelModeId && modeId && String(r.travelModeId) === String(modeId))
    || (r.travelModeCode && modeCode && String(r.travelModeCode).toUpperCase() === String(modeCode).toUpperCase()));
  const grade = String(gradeCode || '').toLowerCase().trim();
  const cls = String(cityClass || 'C').toUpperCase().trim();
  const lvl = Number(levelNumber);

  let row = null;
  const grades = grade ? [grade, ''] : [''];
  for (const l of [lvl, 0]) {
    for (const g of grades) {
      for (const c of [cls, 'ALL']) {
        row = forMode.find((r) => Number(r.levelNumber) === l
          && String(r.gradeCode || '').toLowerCase().trim() === g
          && String(r.cityClass || 'ALL').toUpperCase() === c);
        if (row) break;
      }
      if (row) break;
    }
    if (row) break;
  }
  if (!row) return { configured, row: null, entitled: false, maxAmount: 0 };

  const rowSubtypes = Array.isArray(row.allowedSubtypes) ? row.allowedSubtypes : [];
  if (subtypeId || subtypeCode) {
    const allowed = rowSubtypes.find(
      (s) => (subtypeId && s.subtypeId && String(s.subtypeId) === String(subtypeId))
        || (subtypeCode && (s.subtypeCode || s.code) && String(s.subtypeCode || s.code).toUpperCase() === String(subtypeCode).toUpperCase())
        || (subtypeId && (s.subtypeCode || s.code) && String(s.subtypeCode || s.code).toUpperCase() === String(subtypeId).toUpperCase())
    );
    if (!allowed) return { configured, row, entitled: false, maxAmount: 0 };
    return { configured, row, entitled: true, maxAmount: allowed.maxAmount === undefined ? null : allowed.maxAmount };
  }
  if (modeRequiresSubtype || rowSubtypes.length > 0) {
    return { configured, row, entitled: false, maxAmount: 0 };
  }
  return { configured, row, entitled: true, maxAmount: row.maxAmount === undefined ? null : row.maxAmount };
}

/**
 * Allowed = min(valid amount, entitlement); Excess = valid amount − allowed.
 * Not entitled → Allowed 0, Excess = valid amount (the claim can still be submitted).
 */
function applyTravelEntitlement(amount, ent, { label = 'This travel mode', levelNumber = null } = {}) {
  const amt = round2(Math.max(0, Number(amount) || 0));
  const lvl = levelNumber !== null && levelNumber !== undefined ? ` (Level ${levelNumber})` : '';
  if (!ent || !ent.configured) {
    return { allowed: amt, excess: 0, policyLimit: amt, status: 'NOT_CONFIGURED', excessReason: '', limitText: 'Actuals (no travel entitlement configured)' };
  }
  if (!ent.entitled) {
    return {
      allowed: 0,
      excess: amt,
      policyLimit: 0,
      status: 'NOT_ENTITLED',
      excessReason: `${label} is not covered by your current travel entitlement${lvl}. The amount is treated as excess.`,
      limitText: 'Not covered by entitlement',
    };
  }
  if (ent.maxAmount === null || ent.maxAmount === undefined) {
    return { allowed: amt, excess: 0, policyLimit: amt, status: 'ACTUALS', excessReason: '', limitText: 'Actuals (entitled)' };
  }
  const limit = round2(ent.maxAmount);
  const allowed = round2(Math.min(amt, limit));
  const excess = round2(amt - allowed);
  return {
    allowed,
    excess,
    policyLimit: limit,
    status: excess > 0 ? 'PARTIAL' : 'ENTITLED',
    excessReason: excess > 0 ? `Your entitlement for ${label}${lvl} is ${formatINR(limit)}; ${formatINR(excess)} above it is treated as excess.` : '',
    limitText: `${formatINR(limit)} per claim`,
  };
}

const validObjectId = (v) => mongoose.Types.ObjectId.isValid(sid(v));

module.exports = {
  MAX_KM_PER_ENTRY,
  activeSubtypes,
  requiresSubtype,
  travelRate,
  serializeModes,
  resolveTravelEntry,
  resolveTravelEntitlement,
  applyTravelEntitlement,
  validObjectId,
};
