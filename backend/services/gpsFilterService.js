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
 * Extract numerical coordinate values from any coordinate-like object
 */
function getCoordinateValues(point) {
  if (!point) return null;
  const lat = point.latitude ?? point.lat ?? point.rawLatitude ?? (point.location?.coordinates ? point.location.coordinates[1] : null);
  const lng = point.longitude ?? point.lng ?? point.rawLongitude ?? (point.location?.coordinates ? point.location.coordinates[0] : null);
  if (lat === null || lat === undefined || lng === null || lng === undefined) return null;
  const numLat = Number(lat);
  const numLng = Number(lng);
  if (isNaN(numLat) || isNaN(numLng)) return null;
  return {
    latitude: numLat,
    longitude: numLng,
    timestamp: point.timestamp || point.time || null,
    accuracy: point.accuracy || null
  };
}

/**
 * Check if 3 consecutive points form a triangular GPS rebound spike or off-corridor detour spur (A -> B -> C)
 * Point B jumps away into a side lane/driveway and point C immediately rebounds back along the corridor near A.
 */
function isTriangularReboundSpike(pointA, pointB, pointC, options = {}) {
  const coordA = getCoordinateValues(pointA);
  const coordB = getCoordinateValues(pointB);
  const coordC = getCoordinateValues(pointC);
  if (!coordA || !coordB || !coordC) return false;

  const minSpikeDistMeters = options.minSpikeDistance || 40; // minimum excursion distance to qualify as large jump
  const distAB = geoService.calculateDistance(coordA.latitude, coordA.longitude, coordB.latitude, coordB.longitude) * 1000;
  const distBC = geoService.calculateDistance(coordB.latitude, coordB.longitude, coordC.latitude, coordC.longitude) * 1000;
  const distAC = geoService.calculateDistance(coordA.latitude, coordA.longitude, coordC.latitude, coordC.longitude) * 1000;

  // 1. Geometric rebound & hairpin detour spurs:
  if (distAB >= 10 && distBC >= 10) {
    const minExcursion = Math.min(distAB, distBC);
    // (a) Large excursion jump where direct AC is substantially smaller than excursions
    if (minExcursion >= minSpikeDistMeters && distAC <= minExcursion * 0.65) {
      return true;
    }
    // (b) Hairpin detour spur (angle ABC is acute < 65° and detour ratio (AB + BC) / AC is significant > 1.35)
    if (distAC > 0) {
      const detourRatio = (distAB + distBC) / distAC;
      const cosB = (distAB * distAB + distBC * distBC - distAC * distAC) / (2 * distAB * distBC);
      // cosB > 0.42 means angle at apex B is < 65° (sharp hairpin spur into side alley)
      if (cosB > 0.42 && detourRatio > 1.35) {
        return true;
      }
      // Extreme detour ratio (> 2.0) with excursion >= 12m
      if (detourRatio > 2.0 && minExcursion >= 12) {
        return true;
      }
    }
  }

  // 2. Speed-based rebound: jump at impossible or suspicious speed then return
  if (coordA.timestamp && coordB.timestamp && coordC.timestamp) {
    const dtAB = Math.max(0.5, (new Date(coordB.timestamp) - new Date(coordA.timestamp)) / 1000);
    const dtBC = Math.max(0.5, (new Date(coordC.timestamp) - new Date(coordB.timestamp)) / 1000);
    const dtAC = Math.max(0.5, (new Date(coordC.timestamp) - new Date(coordA.timestamp)) / 1000);

    const speedAB = distAB / dtAB; // m/s
    const speedBC = distBC / dtBC; // m/s
    const speedAC = distAC / dtAC; // m/s

    // Jump out at > 25 m/s (90 km/h) or > 35 m/s, but returning back near A (speedAC normal < 20 m/s and distAC < 250m)
    if ((speedAB > 25 || speedBC > 25) && speedAC < 20 && distAC < 250) {
      return true;
    }
  }

  return false;
}

/**
 * Check if 4 consecutive points form a 2-point rebound spike excursion / driveway loop (A -> B1 -> B2 -> C)
 */
function isTwoPointReboundSpike(pointA, pointB1, pointB2, pointC, options = {}) {
  const coordA = getCoordinateValues(pointA);
  const coordB1 = getCoordinateValues(pointB1);
  const coordB2 = getCoordinateValues(pointB2);
  const coordC = getCoordinateValues(pointC);
  if (!coordA || !coordB1 || !coordB2 || !coordC) return false;

  const distAB1 = geoService.calculateDistance(coordA.latitude, coordA.longitude, coordB1.latitude, coordB1.longitude) * 1000;
  const distB1B2 = geoService.calculateDistance(coordB1.latitude, coordB1.longitude, coordB2.latitude, coordB2.longitude) * 1000;
  const distB2C = geoService.calculateDistance(coordB2.latitude, coordB2.longitude, coordC.latitude, coordC.longitude) * 1000;
  const distAC = geoService.calculateDistance(coordA.latitude, coordA.longitude, coordC.latitude, coordC.longitude) * 1000;

  if (distAB1 >= 10 && distB2C >= 10) {
    const minExcursion = Math.min(distAB1, distB2C);
    if (minExcursion >= 40 && distAC <= minExcursion * 0.65) {
      return true;
    }
    if (distAC > 0) {
      const totalDetour = distAB1 + distB1B2 + distB2C;
      const detourRatio = totalDetour / distAC;
      // Loop or driveway excursion off the corridor that immediately returns
      if (detourRatio > 1.4 && minExcursion >= 12 && distAC <= minExcursion * 1.2) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Scrub an array of points by eliminating triangular rebound spikes and reconnecting clean points.
 * 
 * @param {Array} points - Array of GPS point objects
 * @param {Object} options - Threshold overrides
 * @returns {Array} Array of clean points
 */
exports.filterSpikes = (points, options = {}) => {
  if (!points || !Array.isArray(points) || points.length < 3) {
    return points ? [...points] : [];
  }

  // Filter out any explicitly flagged suspicious/invalid points first
  const validCandidates = points.filter(p => {
    if (!p) return false;
    if (p.status === 'suspicious' || p.isSuspicious === true) return false;
    const coords = getCoordinateValues(p);
    return coords && isValidCoordinate(coords);
  });

  if (validCandidates.length < 3) {
    return validCandidates;
  }

  const clean = [validCandidates[0]];

  for (let i = 1; i < validCandidates.length - 1; i++) {
    const prev = clean[clean.length - 1];
    const curr = validCandidates[i];
    const next = validCandidates[i + 1];

    // Check single-point triangular spike (A -> B -> C)
    if (isTriangularReboundSpike(prev, curr, next, options)) {
      continue;
    }

    // Check two-point spike (A -> B1 -> B2 -> C)
    if (i + 2 < validCandidates.length) {
      const nextNext = validCandidates[i + 2];
      if (isTwoPointReboundSpike(prev, curr, next, nextNext, options)) {
        continue;
      }
    }

    clean.push(curr);
  }

  // Include the last point if it is valid and within realistic bounds
  const lastPoint = validCandidates[validCandidates.length - 1];
  if (clean.length > 0) {
    const prev = clean[clean.length - 1];
    const cPrev = getCoordinateValues(prev);
    const cLast = getCoordinateValues(lastPoint);
    if (cPrev && cLast) {
      const dist = geoService.calculateDistance(cPrev.latitude, cPrev.longitude, cLast.latitude, cLast.longitude) * 1000;
      const timeSec = (cLast.timestamp && cPrev.timestamp) ? Math.max(1, (new Date(cLast.timestamp) - new Date(cPrev.timestamp)) / 1000) : 10;
      const speed = dist / timeSec;
      if (dist < 500 || speed < 30) {
        clean.push(lastPoint);
      }
    } else {
      clean.push(lastPoint);
    }
  } else {
    clean.push(lastPoint);
  }

  return clean;
};

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

  // Track the most recent clean (non-suspicious) point to avoid chain corruption on spikes
  let lastCleanPoint = lastKnownPoint ? {
    latitude: lastKnownPoint.latitude,
    longitude: lastKnownPoint.longitude,
    timestamp: lastKnownPoint.timestamp || lastKnownPoint.time
  } : null;

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

    // Step 3: Triangular rebound spike detection using lookahead
    let isSpike = false;
    if (lastCleanPoint && i + 1 < batch.length) {
      const nextPoint = batch[i + 1];
      if (isValidCoordinate(nextPoint)) {
        if (isTriangularReboundSpike(lastCleanPoint, point, nextPoint, options)) {
          isSpike = true;
        } else if (i + 2 < batch.length && isValidCoordinate(batch[i + 2])) {
          if (isTwoPointReboundSpike(lastCleanPoint, point, nextPoint, batch[i + 2], options)) {
            isSpike = true;
          }
        }
      }
    }

    let classification;
    if (isSpike) {
      classification = {
        action: 'save',
        status: 'suspicious',
        isSuspicious: true,
        distanceEligible: false,
        displayEligible: false,
        reason: 'Triangular GPS rebound spike'
      };
    } else {
      // Step 4: Classify point against the last clean reference
      classification = classifyPoint(point, lastCleanPoint, options);

      // Lookahead recovery detection: If speed is high, check if trajectory genuinely shifted
      if (classification.status === 'suspicious' && i + 1 < batch.length) {
        const nextPoint = batch[i + 1];
        if (isValidCoordinate(nextPoint)) {
          const distCurrToNext = geoService.calculateDistance(
            point.latitude, point.longitude,
            nextPoint.latitude, nextPoint.longitude
          );
          const timeCurrToNext = (new Date(nextPoint.timestamp) - new Date(point.timestamp)) / 1000;
          const speedCurrToNext = timeCurrToNext > 0 ? (distCurrToNext * 1000) / timeCurrToNext : 0;

          const distPrevToNext = lastCleanPoint
            ? geoService.calculateDistance(
                lastCleanPoint.latitude, lastCleanPoint.longitude,
                nextPoint.latitude, nextPoint.longitude
              )
            : 0;
          const timePrevToNext = lastCleanPoint
            ? (new Date(nextPoint.timestamp) - new Date(lastCleanPoint.timestamp)) / 1000
            : 0;
          const speedPrevToNext = timePrevToNext > 0 ? (distPrevToNext * 1000) / timePrevToNext : 0;

          // If current->next is realistic but prev->next is high, this is a genuine trajectory change (Recovery Mode)
          if (speedCurrToNext < opts.suspiciousSpeedMps && speedPrevToNext > opts.suspiciousSpeedMps) {
            classification = {
              action: 'save',
              status: 'suspicious',
              isSuspicious: true,
              distanceEligible: false,
              displayEligible: true,
              reason: 'Recovery mode: trajectory shifted to new area'
            };
          }
        }
      }
    }

    // Build the classified point
    const classifiedPoint = {
      ...point,
      status: classification.status,
      isSuspicious: classification.status === 'suspicious',
      distanceEligible: classification.distanceEligible,
      displayEligible: classification.displayEligible,
      classificationReason: classification.reason,
      classifiedAt: new Date()
    };

    // Always add to rawPoints (all valid points kept for audit)
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

    // Advance lastCleanPoint ONLY if the point is clean/valid/weak/idle (NOT suspicious/spike)
    if (classification.status !== 'suspicious' && !isSpike) {
      lastCleanPoint = {
        latitude: point.latitude,
        longitude: point.longitude,
        timestamp: point.timestamp
      };
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

/**
 * Calculate travel heading/bearing between two coordinates (0 to 359 degrees)
 * @param {Object} p1 - Source coordinate { latitude, longitude }
 * @param {Object} p2 - Destination coordinate { latitude, longitude }
 * @returns {number} Bearing in degrees [0, 360)
 */
function calculateHeading(p1, p2) {
  if (!p1 || !p2) return 0;
  const lat1 = (p1.latitude ?? p1.lat) * Math.PI / 180;
  const lat2 = (p2.latitude ?? p2.lat) * Math.PI / 180;
  const dLon = ((p2.longitude ?? p2.lng) - (p1.longitude ?? p1.lng)) * Math.PI / 180;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  const brng = Math.atan2(y, x) * 180 / Math.PI;
  return Math.round((brng + 360) % 360);
}

/**
 * Smooth corridor jitter by discarding micro reverse-direction oscillations (< 35m) on moving trajectories
 * @param {Array} points - Array of GPS coordinates
 * @returns {Array} Smoothed points
 */
function smoothCorridorJitter(points) {
  if (!points || points.length < 3) return points ? [...points] : [];
  
  const result = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const prev = result[result.length - 1];
    const curr = points[i];
    const next = points[i + 1];

    const distPrevCurr = geoService.calculateDistance(prev.latitude, prev.longitude, curr.latitude, curr.longitude) * 1000;
    const distPrevNext = geoService.calculateDistance(prev.latitude, prev.longitude, next.latitude, next.longitude) * 1000;

    // If point oscillates backward along the corridor (< 35m backward step) while general motion moves forward
    if (distPrevCurr < 35 && distPrevNext > 0) {
      const headingPrevNext = calculateHeading(prev, next);
      const headingPrevCurr = calculateHeading(prev, curr);
      const headingDiff = Math.abs(headingPrevNext - headingPrevCurr);
      const angleDiff = headingDiff > 180 ? 360 - headingDiff : headingDiff;

      // If heading is in opposite direction (> 120° reversal) while overall progression is forward
      if (angleDiff > 120) {
        continue;
      }
    }
    result.push(curr);
  }
  result.push(points[points.length - 1]);
  return result;
}

exports.calculateHeading = calculateHeading;
exports.smoothCorridorJitter = smoothCorridorJitter;
