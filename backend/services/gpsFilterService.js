/**
 * GPS Filter Service
 * Single responsibility: Clean and filter raw GPS data before storage
 * 
 * Pipeline:
 * 1. Duplicate Removal (tripId + timestamp + deviceId)
 * 2. Null/Invalid Coordinate Rejection
 * 3. Weak Accuracy Flagging (> 50m)
 * 4. Noise Reduction (Kalman filter smoothing)
 * 5. GPS Jump Detection (speed-based)
 * 6. Stationary Drift Correction
 */

const geoService = require('./geoTrackingService');

/**
 * Filter a batch of GPS points
 * @param {Array} batch - Array of raw GPS points
 * @param {Object} lastKnownPoint - Last known valid point (from LiveEmployeeStatus)
 * @returns {Object} { validPoints, rejectedCount, weakCount, duplicateCount }
 */
exports.filterBatch = (batch, lastKnownPoint = null) => {
  if (!batch || batch.length === 0) {
    return { validPoints: [], rejectedCount: 0, weakCount: 0, duplicateCount: 0 };
  }

  const stats = { rejectedCount: 0, weakCount: 0, duplicateCount: 0 };
  const seenKeys = new Set();
  const validPoints = [];
  let previousPoint = lastKnownPoint;

  for (const point of batch) {
    // Step 1: Null/Invalid coordinate rejection
    if (!isValidCoordinate(point)) {
      stats.rejectedCount++;
      console.log(`[GPSFilter] Rejected: Invalid coordinates (lat: ${point.latitude}, lng: ${point.longitude})`);
      continue;
    }

    // Step 2: Duplicate removal (tripId + timestamp + deviceId)
    const dedupeKey = `${point.tripId || ''}_${point.timestamp}_${point.deviceId || ''}`;
    if (seenKeys.has(dedupeKey)) {
      stats.duplicateCount++;
      continue;
    }
    seenKeys.add(dedupeKey);

    // Step 3: Weak accuracy flagging (> 50m)
    let status = 'valid';
    if (point.accuracy && point.accuracy > 50) {
      status = 'weak';
      stats.weakCount++;
      // Don't skip — store with weak status. Never lose a point.
    }

    // Step 4: GPS Jump Detection (speed-based)
    if (previousPoint && previousPoint.latitude && previousPoint.longitude) {
      const distance = geoService.calculateDistance(
        previousPoint.latitude, previousPoint.longitude,
        point.latitude, point.longitude
      );

      const timeDiffSec = previousPoint.time
        ? (new Date(point.timestamp) - new Date(previousPoint.time)) / 1000
        : (point.timestamp - (previousPoint.timestamp || 0)) / 1000;

      // Recovery after long GPS gap (> 120 seconds)
      if (timeDiffSec > 120) {
        // Accept as recovery point — fresh segment starts
        status = status === 'weak' ? 'weak' : 'valid';
        // Don't count distance for this jump
      }
      // Stationary drift correction: < 5 meters movement
      else if (distance < 0.005 && timeDiffSec < 30) {
        stats.rejectedCount++;
        continue; // Skip noise
      }
      // Speed-based jump detection
      else if (timeDiffSec > 0) {
        const speedKmh = (distance / (timeDiffSec / 3600));
        
        if (speedKmh > 200) {
          // Teleportation — reject completely
          stats.rejectedCount++;
          console.log(`[GPSFilter] Rejected: GPS jump (${speedKmh.toFixed(0)} km/h, ${(distance * 1000).toFixed(0)}m in ${timeDiffSec.toFixed(0)}s)`);
          continue;
        } else if (speedKmh > 120) {
          // Suspicious but not impossible — mark as suspicious
          status = 'suspicious';
        }
        // Speeds up to 120 km/h are normal for vehicles
      }
    }

    // Point passed all filters — add to valid list
    validPoints.push({
      ...point,
      status,
      filteredAt: new Date()
    });

    // Update previous point reference for next iteration
    previousPoint = {
      latitude: point.latitude,
      longitude: point.longitude,
      time: point.timestamp,
      timestamp: point.timestamp
    };
  }

  console.log(`[GPSFilter] Batch result: ${validPoints.length} valid, ${stats.rejectedCount} rejected, ${stats.weakCount} weak, ${stats.duplicateCount} duplicates`);

  return {
    validPoints,
    ...stats
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
