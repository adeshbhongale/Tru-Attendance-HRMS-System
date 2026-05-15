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
 * @returns {Object} { isValid, isSuspicious, distance, reason }
 */
exports.validateLocation = (lastPoint, newPoint) => {
  if (!lastPoint) return { isValid: true, isSuspicious: false, distance: 0 };

  // Accuracy Check (Recommended <= 50m)
  if (newPoint.accuracy && newPoint.accuracy > 50) {
    return {
      isValid: false,
      isSuspicious: true,
      distance: 0,
      reason: 'Low accuracy (> 50m)'
    };
  }

  const distance = exports.calculateDistance(
    lastPoint.latitude,
    lastPoint.longitude,
    newPoint.latitude,
    newPoint.longitude
  );

  const timeDiff = (new Date(newPoint.time) - new Date(lastPoint.time)) / 1000; // in seconds

  // Stationary Drift Correction: If movement < 5m (0.005km), ignore it
  if (distance < 0.005) {
    return {
      isValid: false,
      isSuspicious: false,
      distance: 0,
      reason: 'Stationary drift (< 5m)'
    };
  }

  // Max Speed Validation: Max human speed 30 km/h (Recommended)
  const speedKmh = timeDiff > 0 ? (distance / (timeDiff / 3600)) : 0;
  if (speedKmh > 30) {
    return {
      isValid: false,
      isSuspicious: true,
      distance,
      reason: `Unrealistic speed (> 30km/h: ${speedKmh.toFixed(2)} km/h)`
    };
  }

  // Jump Validation: Max jump distance 85m (0.085km) in 10s (Consistent with 30km/h)
  if (timeDiff <= 15 && distance > 0.085) {
    return {
      isValid: false,
      isSuspicious: true,
      distance,
      reason: 'Sudden jump detected (> 85m)'
    };
  }

  return { isValid: true, isSuspicious: false, distance };
};

