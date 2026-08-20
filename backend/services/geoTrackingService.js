/**
 * Geo Tracking Service
 * Centralized logic for location and distance calculations
 */

/**
 * Calculates distance between two points in KM using Haversine formula
 * @param {Number} lat1 - Latitude of point 1
 * @param {Number} lon1 - Longitude of point 1
 * @param {Number} lat2 - Latitude of point 2
 * @param {Number} lon2 - Longitude of point 2
 * @returns {Number} Distance in KM
 */
exports.calculateDistance = (lat1, lon1, lat2, lon2) => {
  if (!lat1 || !lon1 || !lat2 || !lon2) return 0;

  const R = 6371; // Radius of the earth in km
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c; // Distance in km
  return parseFloat(d.toFixed(6));
};

function deg2rad(deg) {
  return deg * (Math.PI / 180);
}

/**
 * Calculates total distance for an array of tracking points
 * @param {Array} points - Array of tracking points with lat/lng
 * @returns {Number} Total distance in KM
 */
exports.calculateTotalDistance = (points) => {
  if (!points || points.length < 2) return 0;

  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    total += exports.calculateDistance(
      points[i].latitude,
      points[i].longitude,
      points[i + 1].latitude,
      points[i + 1].longitude
    );
  }
  return parseFloat(total.toFixed(6));
};

/**
 * Validates if a new location point is realistic compared to the last point
 * @param {Object} lastPoint - Previous location point
 * @param {Object} newPoint - New location point
 * @returns {Object} { isValid, isSuspicious, isWeak, isRecovery, distance, reason, status }
 */
exports.validateLocation = (lastPoint, newPoint) => {
  if (!lastPoint || !lastPoint.latitude || !lastPoint.longitude || !lastPoint.time) {
    return { isValid: true, isSuspicious: false, distance: 0 };
  }

  const distance = exports.calculateDistance(
    lastPoint.latitude,
    lastPoint.longitude,
    newPoint.latitude,
    newPoint.longitude
  );

  const timeDiff = (new Date(newPoint.time) - new Date(lastPoint.time)) / 1000; // in seconds

  // 1. GPS Lost -> GPS Recovered (Long Signal Gap)
  if (timeDiff > 120) {
    return {
      isValid: true,
      isRecovery: true,
      distance: 0, // Fresh segment starts, do not count jump distance
      reason: 'GPS Recovery after signal gap (> 120s)'
    };
  }

  // 2. Accuracy Check (Do not discard points where accuracy > 50m, mark them as 'weak')
  if (newPoint.accuracy && newPoint.accuracy > 50) {
    return {
      isValid: true,
      isWeak: true,
      status: 'weak',
      distance: 0, // Do not add distance for noisy GPS drift
      reason: 'Weak GPS signal (> 50m)'
    };
  }

  // 3. Stationary Drift Correction: If movement < 5m (0.005km), ignore it
  if (distance < 0.005) {
    return {
      isValid: false,
      isSuspicious: false,
      status: 'idle',
      distance: 0,
      reason: 'Stationary drift (< 5m)'
    };
  }

  // 4. Max Speed Validation (Bike/Vehicle standard: 120 km/h)
  const speedKmh = timeDiff > 0 ? (distance / (timeDiff / 3600)) : 0;
  if (speedKmh > 120) {
    return {
      isValid: false,
      isSuspicious: true,
      distance: 0,
      reason: `Suspiciously high speed (> 120km/h: ${speedKmh.toFixed(2)} km/h)`
    };
  }

  return { isValid: true, isSuspicious: false, distance };
};

const METERS_PER_DEG_LAT = 110540;   // meters per degree of latitude
const METERS_PER_DEG_LNG = 111320;   // meters per degree of longitude at equator

/**
 * Convert a distance in meters to degrees for latitude
 */
function metersToDegLat(meters) {
  return meters / METERS_PER_DEG_LAT;
}

/**
 * Convert a distance in meters to degrees for longitude at a given latitude
 */
function metersToDegLng(meters, lat) {
  return meters / (METERS_PER_DEG_LNG * Math.cos((lat * Math.PI) / 180));
}

/**
 * Applies a 2D Kalman filter on a batch of tracking points to smooth route jitter.
 * Dimensionally correct: both measurement noise (GPS accuracy) and process noise
 * (expected movement per sample) are expressed in METERS and converted to degrees^2
 * for the filter, so the gain never collapses to ~0 and the filter keeps tracking GPS.
 *
 * @param {Object} lastPoint - Last known location point (with coordinates + accuracy)
 * @param {Array} points - Array of points to smooth
 * @param {number} processNoise - Tunable process noise in METERS (default 3, floor 3)
 * @returns {Array} Smoothed points (rawLatitude/rawLongitude left untouched)
 */
exports.smoothPoints = (lastPoint, points, processNoise = 3) => {
  if (!points || points.length === 0) return [];

  const MIN_PROCESS_NOISE_METERS = 3;
  const MIN_ERROR_METERS = 0.5; // error floor so gain can never collapse to ~0

  const procNoiseMeters = Math.max(
    (typeof processNoise === 'number' && processNoise > 0) ? processNoise : MIN_PROCESS_NOISE_METERS,
    MIN_PROCESS_NOISE_METERS
  );

  const lastLat = lastPoint ? lastPoint.latitude : null;
  const lastLng = lastPoint ? lastPoint.longitude : null;
  const lastAccuracy = (lastPoint && lastPoint.accuracy && lastPoint.accuracy > 0) ? lastPoint.accuracy : 10;
  const firstLat = lastLat !== null && lastLat !== undefined ? lastLat : (points[0] ? points[0].latitude : 0);

  const latFilter = {
    value: lastLat,
    error: Math.pow(metersToDegLat(lastAccuracy), 2)
  };
  const lngFilter = {
    value: lastLng,
    error: Math.pow(metersToDegLng(lastAccuracy, firstLat), 2)
  };

  let prevTimestamp = lastPoint ? (lastPoint.timestamp || lastPoint.time || null) : null;

  return points.map(p => {
    const accuracy = (p.accuracy && p.accuracy > 0) ? p.accuracy : 10;
    const lat = p.latitude;
    const lng = p.longitude;
    const timestamp = p.timestamp || p.time || null;

    // Per-step process noise: expected movement between samples in meters.
    // Use speed*dt when available, otherwise fall back to the configured floor.
    let moveMeters = procNoiseMeters;
    if (prevTimestamp && timestamp) {
      const dt = (new Date(timestamp) - new Date(prevTimestamp)) / 1000;
      if (dt > 0 && dt < 600) {
        const speedMps = (p.speed && p.speed > 0) ? p.speed : 0;
        moveMeters = Math.max(speedMps * dt, MIN_PROCESS_NOISE_METERS);
      }
    }
    prevTimestamp = timestamp;

    // Measurement noise from GPS accuracy (meters -> degrees^2)
    const measNoiseLat = Math.pow(metersToDegLat(accuracy), 2);
    const measNoiseLng = Math.pow(metersToDegLng(accuracy, lat), 2);

    // Process noise (meters -> degrees^2)
    const procNoiseLat = Math.pow(metersToDegLat(moveMeters), 2);
    const procNoiseLng = Math.pow(metersToDegLng(moveMeters, lat), 2);

    // Error floor (degrees^2) — keeps gain from collapsing to zero
    const minErrorLat = Math.pow(metersToDegLat(MIN_ERROR_METERS), 2);
    const minErrorLng = Math.pow(metersToDegLng(MIN_ERROR_METERS, lat), 2);

    // Latitude update
    if (latFilter.value === null) {
      latFilter.value = lat;
      latFilter.error = measNoiseLat;
    } else {
      latFilter.error = Math.max(latFilter.error + procNoiseLat, minErrorLat);
      const gain = latFilter.error / (latFilter.error + measNoiseLat);
      latFilter.value = latFilter.value + gain * (lat - latFilter.value);
      latFilter.error = (1 - gain) * latFilter.error;
    }

    // Longitude update
    if (lngFilter.value === null) {
      lngFilter.value = lng;
      lngFilter.error = measNoiseLng;
    } else {
      lngFilter.error = Math.max(lngFilter.error + procNoiseLng, minErrorLng);
      const gain = lngFilter.error / (lngFilter.error + measNoiseLng);
      lngFilter.value = lngFilter.value + gain * (lng - lngFilter.value);
      lngFilter.error = (1 - gain) * lngFilter.error;
    }

    return {
      ...p,
      latitude: parseFloat(latFilter.value.toFixed(6)),
      longitude: parseFloat(lngFilter.value.toFixed(6))
    };
  });
};

/**
 * Filter out 1-2 outlier GPS points (spikes/glitches) from a sequence of points.
 * @deprecated This is a no-op. Use gpsFilterService.classifyBatch() instead,
 * which classifies points as valid/weak/suspicious/idle without deleting them.
 * @param {Array} points - Array of points with latitude/longitude
 * @returns {Array} Returns all points unchanged (no-op)
 */
exports.filterOutliers = (points) => {
  // Return ALL points, no filtering!
  // Real classification happens in gpsFilterService.classifyBatch()
  return points;
};


