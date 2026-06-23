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

/**
 * Applies a 2D Kalman filter on a batch of tracking points to smooth route jitter
 * @param {Object} lastPoint - Last known location point (with coordinates)
 * @param {Array} points - Array of points to smooth
 * @param {number} processNoise - Tunable process noise
 * @returns {Array} Smoothed points
 */
exports.smoothPoints = (lastPoint, points, processNoise = 0.0000001) => {
  if (!points || points.length === 0) return [];

  let latFilter = {
    value: lastPoint ? lastPoint.latitude : null,
    error: lastPoint ? (lastPoint.accuracy || 10) : 10
  };
  let lngFilter = {
    value: lastPoint ? lastPoint.longitude : null,
    error: lastPoint ? (lastPoint.accuracy || 10) : 10
  };

  return points.map(p => {
    const accuracy = p.accuracy || 10;
    const measurementNoise = accuracy * accuracy;

    // Latitude update
    if (latFilter.value === null) {
      latFilter.value = p.latitude;
      latFilter.error = measurementNoise;
    } else {
      latFilter.error = latFilter.error + processNoise;
      const gain = latFilter.error / (latFilter.error + measurementNoise);
      latFilter.value = latFilter.value + gain * (p.latitude - latFilter.value);
      latFilter.error = (1 - gain) * latFilter.error;
    }

    // Longitude update
    if (lngFilter.value === null) {
      lngFilter.value = p.longitude;
      lngFilter.error = measurementNoise;
    } else {
      lngFilter.error = lngFilter.error + processNoise;
      const gain = lngFilter.error / (lngFilter.error + measurementNoise);
      lngFilter.value = lngFilter.value + gain * (p.longitude - lngFilter.value);
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
 * @param {Array} points - Array of points with latitude/longitude
 * @returns {Array} Cleaned array of points
 */
exports.filterOutliers = (points) => {
  if (!points || points.length < 3) return points;

  // Standardize the points to make sure we access lat/lng correctly
  const stdPoints = points.map(p => {
    let lat = p.latitude || p.lat;
    let lng = p.longitude || p.lng;
    
    // Handle Mongoose location coordinates [lng, lat]
    if (lat === undefined && p.location && Array.isArray(p.location.coordinates)) {
      lat = p.location.coordinates[1];
    }
    if (lng === undefined && p.location && Array.isArray(p.location.coordinates)) {
      lng = p.location.coordinates[0];
    }

    return {
      ...p,
      latitude: lat,
      longitude: lng,
      originalPoint: p
    };
  }).filter(p => p.latitude !== undefined && p.longitude !== undefined && !isNaN(p.latitude) && !isNaN(p.longitude));

  if (stdPoints.length < 3) return points;

  const isOutlier = new Array(stdPoints.length).fill(false);

  // Helper to calculate distance in KM
  const getDist = (p1, p2) => {
    return exports.calculateDistance(p1.latitude, p1.longitude, p2.latitude, p2.longitude);
  };

  // Helper to get perpendicular distance from p2 to line connecting p1 and p3 in meters
  const getPerpDistanceMeters = (p1, p2, p3) => {
    const a = getDist(p1, p2); // km
    const b = getDist(p2, p3); // km
    const c = getDist(p1, p3); // km
    if (c < 0.001) {
      return a * 1000;
    }
    const s = (a + b + c) / 2;
    const areaSquared = s * (s - a) * (s - b) * (s - c);
    if (areaSquared <= 0) return 0;
    const area = Math.sqrt(areaSquared);
    const h = (2 * area) / c;
    return h * 1000; // to meters
  };

  // Pass 1: 1-point spikes (out and back)
  for (let i = 1; i < stdPoints.length - 1; i++) {
    const prev = stdPoints[i - 1];
    const curr = stdPoints[i];
    const next = stdPoints[i + 1];

    const d1 = getDist(prev, curr); // km
    const d2 = getDist(curr, next); // km
    const dDirect = getDist(prev, next); // km

    const h = getPerpDistanceMeters(prev, curr, next); // meters

    // A single point spike jumps out and comes right back.
    if (h > 20 && d1 > 0.015 && d2 > 0.015) {
      const ratio = (d1 + d2) / (dDirect + 0.001);
      if (ratio > 1.3 || dDirect < 0.005) {
        isOutlier[i] = true;
      }
    }
    
    // Also handle points with extremely poor accuracy (> 80m) that deviate
    const accuracy = curr.accuracy || curr.originalPoint?.accuracy || 0;
    if (accuracy > 80 && h > 15 && (d1 > 0.01 || d2 > 0.01)) {
      isOutlier[i] = true;
    }
  }

  // Pass 2: 2-point spikes (two consecutive points jumping out and back)
  for (let i = 1; i < stdPoints.length - 2; i++) {
    if (isOutlier[i] || isOutlier[i + 1]) continue;

    const p0 = stdPoints[i - 1];
    const p1 = stdPoints[i];
    const p2 = stdPoints[i + 1];
    const p3 = stdPoints[i + 2];

    const d1 = getDist(p0, p1);
    const d2 = getDist(p1, p2);
    const d3 = getDist(p2, p3);
    const dDirect = getDist(p0, p3);

    const h1 = getPerpDistanceMeters(p0, p1, p3);
    const h2 = getPerpDistanceMeters(p0, p2, p3);

    if (h1 > 20 && h2 > 20 && d1 > 0.015 && d3 > 0.015) {
      const pathLen = d1 + d2 + d3;
      const ratio = pathLen / (dDirect + 0.001);
      if (ratio > 1.3 || dDirect < 0.005) {
        isOutlier[i] = true;
        isOutlier[i + 1] = true;
      }
    }
  }

  return stdPoints
    .filter((_, idx) => !isOutlier[idx])
    .map(p => p.originalPoint);
};


