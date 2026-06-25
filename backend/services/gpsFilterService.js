/**
 * GPS Filter Service
 * Single responsibility: Classify GPS points — NEVER delete valid coordinates.
 * 
 * Classification Pipeline:
 * 1. Reject impossible coordinates (null, NaN, out-of-range, 0,0)
 * 2. Remove exact duplicates (tripId + timestamp + deviceId)
 * 3. Classify remaining points: valid, weak, suspicious, idle
 * 4. Return categorized arrays for different consumers
 * 
 * KEY PRINCIPLE: Store everything valid. Classify, don't delete.
 * - rawPoints: All valid points (for audit/raw route display)
 * - displayPoints: Points suitable for map polyline (excludes extreme outliers)
 * - distancePoints: Points eligible for official distance calculation
 * - suspiciousPoints: Points flagged for admin review
 * - weakPoints: Points with poor accuracy but kept for continuity
 */

const geoService = require('./geoTrackingService');

const DEFAULT_OPTIONS = {
  maxGoodAccuracyMeters: 50,
  maxWeakAccuracyMeters: 150,
  suspiciousSpeedMps: 35,
  impossibleSpeedMps: 60,
  minDistanceMeters: 3,
  maxGapForDistanceSec: 120,
  maxGapForDisplaySec: 300
};

/**
 * Classify a single GPS point with context from the previous point.
 * Never rejects — always returns a status and eligibility flags.
 * 
 * @param {Object} point - Current GPS point
 * @param {Object|null} previousPoint - Previous GPS point (for speed/distance calc)
 * @param {Object} options - Threshold overrides
 * @returns {Object} { action, status, distanceEligible, displayEligible, reason }
 */
function classifyPoint(point, previousPoint, options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  if (!isValidCoordinate(point)) {
    return { action: 'reject', status: 'invalid', distanceEligible: false, displayEligible: false, reason: 'Invalid coordinates' };
  }

  let status = 'valid';
  let distanceEligible = true;
  let displayEligible = true;
  let reason = null;

  // Accuracy classification
  if (point.accuracy && point.accuracy > opts.maxGoodAccuracyMeters) {
    if (point.accuracy > opts.maxWeakAccuracyMeters) {
      status = 'weak';
      distanceEligible = false;
      reason = `Poor accuracy (${point.accuracy}m > ${opts.maxWeakAccuracyMeters}m)`;
    } else {
      status = 'weak';
      distanceEligible = false;
      reason = `Weak accuracy (${point.accuracy}m > ${opts.maxGoodAccuracyMeters}m)`;
    }
  }

  if (previousPoint && previousPoint.latitude && previousPoint.longitude) {
    const distance = geoService.calculateDistance(
      previousPoint.latitude, previousPoint.longitude,
      point.latitude, point.longitude
    );

    const timeDiffMs = (new Date(point.timestamp) - new Date(previousPoint.timestamp)) / 1000;
    const timeDiffSec = timeDiffMs > 0 ? timeDiffMs : 0;

    // GPS gap recovery — point is valid but distance skipped
    if (timeDiffSec > opts.maxGapForDistanceSec) {
      distanceEligible = false;
      displayEligible = true;
      status = status === 'weak' ? 'weak' : 'valid';
      reason = (reason ? reason + '; ' : '') + `GPS gap (${timeDiffSec.toFixed(0)}s), fresh segment started`;
    }

    // Stationary drift — point is valid but idle
    if (distance * 1000 < opts.minDistanceMeters && timeDiffSec < opts.maxGapForDistanceSec) {
      status = 'idle';
      distanceEligible = false;
      displayEligible = true;
      reason = (reason ? reason + '; ' : '') + `Stationary drift (< ${opts.minDistanceMeters}m)`;
    }

    // Speed-based classification
    if (timeDiffSec > 0) {
      const speedMps = (distance * 1000) / timeDiffSec;

      if (speedMps > opts.impossibleSpeedMps) {
        status = 'suspicious';
        distanceEligible = false;
        displayEligible = false;
        reason = (reason ? reason + '; ' : '') + `Impossible speed (${(speedMps * 3.6).toFixed(0)} km/h, threshold ${opts.impossibleSpeedMps} m/s)`;
      } else if (speedMps > opts.suspiciousSpeedMps) {
        status = 'suspicious';
        distanceEligible = false;
        reason = (reason ? reason + '; ' : '') + `Suspicious speed (${(speedMps * 3.6).toFixed(0)} km/h, threshold ${opts.suspiciousSpeedMps} m/s)`;
      }
    }
  }

  return {
    action: 'save',
    status,
    distanceEligible,
    displayEligible,
    reason
  };
}

/**
 * Get the most recent classified point from rawPoints, or fall back to lastKnownPoint.
 */
function getPreviousForClassification(rawPoints, lastKnownPoint) {
  if (rawPoints.length > 0) {
    const last = rawPoints[rawPoints.length - 1];
    return {
      latitude: last.latitude,
      longitude: last.longitude,
      timestamp: last.timestamp
    };
  }
  if (lastKnownPoint) {
    return {
      latitude: lastKnownPoint.latitude,
      longitude: lastKnownPoint.longitude,
      timestamp: lastKnownPoint.timestamp
    };
  }
  return null;
}

/**
 * Process a batch of GPS points through the classification pipeline.
 * Returns categorized collections for different consumers.
 * 
 * @param {Array} batch - Array of raw GPS points
 * @param {Object} lastKnownPoint - Last known point (from LiveEmployeeStatus)
 * @param {Object} options - Threshold overrides
 * @returns {Object} { rawPoints, displayPoints, distancePoints, suspiciousPoints, weakPoints, rejectedCount, duplicateCount }
 */
exports.classifyBatch = (batch, lastKnownPoint = null, options = {}) => {
  if (!batch || batch.length === 0) {
    return {
      rawPoints: [],
      displayPoints: [],
      distancePoints: [],
      suspiciousPoints: [],
      weakPoints: [],
      rejectedCount: 0,
      duplicateCount: 0
    };
  }

  const opts = { ...DEFAULT_OPTIONS, ...options };
  const seenKeys = new Set();
  const rawPoints = [];
  const displayPoints = [];
  const distancePoints = [];
  const suspiciousPoints = [];
  const weakPoints = [];
  let rejectedCount = 0;
  let duplicateCount = 0;

  // For lookahead detection: keep a reference to previous classified point (not the original batch)
  for (let i = 0; i < batch.length; i++) {
    const point = batch[i];

    // Step 1: Reject impossible coordinates only
    const basicCheck = isValidCoordinate(point);
    if (!basicCheck) {
      rejectedCount++;
      console.log(`[GPSFilter] Rejected: Invalid coordinates (lat: ${point.latitude}, lng: ${point.longitude})`);
      continue;
    }

    // Step 2: Remove exact duplicates
    const dedupeKey = `${point.tripId || ''}_${point.timestamp}_${point.deviceId || ''}`;
    if (seenKeys.has(dedupeKey)) {
      duplicateCount++;
      continue;
    }
    seenKeys.add(dedupeKey);

    // Step 3: Lookahead for recovery detection
    // If this point has suspicious speed, check next point to see if it's a real trajectory shift
    const prevForClassification = getPreviousForClassification(rawPoints, lastKnownPoint);
    let classification = classifyPoint(point, prevForClassification, options);

    if (classification.status === 'suspicious' && i + 1 < batch.length) {
      const nextPoint = batch[i + 1];
      if (isValidCoordinate(nextPoint)) {
        const prevOrig = prevForClassification;
        const distCurrToNext = geoService.calculateDistance(
          point.latitude, point.longitude,
          nextPoint.latitude, nextPoint.longitude
        );
        const timeCurrToNext = (new Date(nextPoint.timestamp) - new Date(point.timestamp)) / 1000;
        const speedCurrToNext = timeCurrToNext > 0 ? (distCurrToNext * 1000) / timeCurrToNext : 0;

        const distPrevToNext = prevOrig
          ? geoService.calculateDistance(
              prevOrig.latitude, prevOrig.longitude,
              nextPoint.latitude, nextPoint.longitude
            )
          : 0;
        const timePrevToNext = prevOrig
          ? (new Date(nextPoint.timestamp) - new Date(prevOrig.timestamp)) / 1000
          : 0;
        const speedPrevToNext = timePrevToNext > 0 ? (distPrevToNext * 1000) / timePrevToNext : 0;

        // If current->next is realistic but prev->next is high, this is a genuine trajectory change (Recovery Mode)
        if (speedCurrToNext < opts.suspiciousSpeedMps && speedPrevToNext > opts.suspiciousSpeedMps) {
          classification = {
            action: 'save',
            status: 'suspicious',
            distanceEligible: false,
            displayEligible: true,
            reason: 'Recovery mode: trajectory shifted to new area'
          };
        }
      }
    }

    // Build the classified point
    const classifiedPoint = {
      ...point,
      status: classification.status,
      distanceEligible: classification.distanceEligible,
      displayEligible: classification.displayEligible,
      classificationReason: classification.reason,
      classifiedAt: new Date()
    };

    // Always add to rawPoints (all valid points kept)
    rawPoints.push(classifiedPoint);

    // Display eligibility
    if (classification.displayEligible) {
      displayPoints.push(classifiedPoint);
    }

    // Distance eligibility
    if (classification.distanceEligible) {
      distancePoints.push(classifiedPoint);
    }

    // Categorized tracking
    if (classification.status === 'suspicious') {
      suspiciousPoints.push(classifiedPoint);
    }
    if (classification.status === 'weak') {
      weakPoints.push(classifiedPoint);
    }
  }

  console.log(`[GPSFilter] Batch classification: ${rawPoints.length} raw, ${displayPoints.length} display, ${distancePoints.length} distance, ${suspiciousPoints.length} suspicious, ${weakPoints.length} weak, ${rejectedCount} rejected, ${duplicateCount} duplicates`);

  return {
    rawPoints,
    displayPoints,
    distancePoints,
    suspiciousPoints,
    weakPoints,
    rejectedCount,
    duplicateCount
  };
};

/**
 * Legacy wrapper — delegates to classifyBatch for backward compatibility.
 * @deprecated Use classifyBatch instead.
 */
exports.filterBatch = (batch, lastKnownPoint = null) => {
  const result = exports.classifyBatch(batch, lastKnownPoint);
  return {
    validPoints: result.rawPoints,
    rejectedCount: result.rejectedCount,
    weakCount: result.weakPoints.length,
    duplicateCount: result.duplicateCount
  };
};

/**
 * Apply Kalman filter smoothing to a batch of filtered points
 * @param {Object} startPoint - Starting reference point for smoothing
 * @param {Array} points - Array of filtered GPS points
 * @returns {Array} Smoothed points
 */
exports.smoothBatch = (startPoint, points) => {
  return geoService.smoothPoints(startPoint, points);
};

/**
 * Remove consecutive duplicate coordinates from a route
 * A -> A -> A -> B becomes A -> B
 * @param {Array} points - Array of GPS points
 * @returns {Array} Deduplicated sequential points
 */
exports.removeSequentialDuplicates = (points) => {
  if (!points || points.length < 2) return points;

  const result = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const prev = result[result.length - 1];
    const curr = points[i];
    
    // If coordinates are different (more than 1 meter apart), keep it
    const dist = geoService.calculateDistance(
      prev.latitude, prev.longitude,
      curr.latitude, curr.longitude
    );
    
    if (dist > 0.001) { // > 1 meter
      result.push(curr);
    }
  }

  return result;
};

/**
 * Validate that a coordinate object has valid lat/lng values
 * @param {Object} point - Point with latitude and longitude
 * @returns {boolean}
 */
function isValidCoordinate(point) {
  if (!point) return false;
  
  const { latitude, longitude } = point;
  
  if (latitude === null || latitude === undefined || 
      longitude === null || longitude === undefined) {
    return false;
  }
  
  if (isNaN(latitude) || isNaN(longitude)) return false;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return false;
  if (latitude === 0 && longitude === 0) return false; // Null island
  
  return true;
}

/**
 * Calculate road distance from an array of sequential points
 * Uses Haversine as base — snapped coordinates will override in RoadSnapService
 * @param {Array} points - Array of { latitude, longitude } objects
 * @returns {number} Distance in kilometers
 */
exports.calculateRouteDistance = (points) => {
  return geoService.calculateTotalDistance(points);
};
