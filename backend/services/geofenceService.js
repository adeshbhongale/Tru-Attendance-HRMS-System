const { calculateDistance } = require('../utils/geofence');
const Location = require('../models/Location');
const CompanySetting = require('../models/CompanySetting');
const User = require('../models/User');

/**
 * Resolves all applicable geofence boundaries for a user / company.
 * Priority:
 *   1. User's assigned workingPlace (if configured and geofenceEnabled !== false)
 *   2. Active Location documents for the company (with geofenceEnabled !== false)
 *   3. CompanySetting officeLocation (if geofenceEnabled !== false)
 * 
 * @param {string|ObjectId} userId
 * @param {string|ObjectId} companyId
 * @returns {Promise<Array<{name: string, latitude: number, longitude: number, radius: number}>>}
 */
async function resolveUserGeofences(userId, companyId) {
  const geofences = [];

  try {
    let user = null;
    if (userId) {
      user = await User.findById(userId).populate('workingPlace').select('workingPlace companyId company').lean();
    }

    const resolvedCompanyId = companyId || user?.companyId || user?.company;

    // 1. Check user's assigned workingPlace
    if (user?.workingPlace && typeof user.workingPlace === 'object') {
      const wp = user.workingPlace;
      if (wp.latitude && wp.longitude && wp.geofenceEnabled !== false) {
        geofences.push({
          id: wp._id?.toString(),
          name: wp.name || 'Assigned Workplace',
          latitude: wp.latitude,
          longitude: wp.longitude,
          radius: wp.radius && wp.radius > 0 ? wp.radius : 200,
        });
      }
    }

    // 2. Load company Locations
    if (resolvedCompanyId) {
      const locations = await Location.find({
        companyId: resolvedCompanyId,
        geofenceEnabled: { $ne: false }
      }).lean();

      for (const loc of locations) {
        if (loc.latitude && loc.longitude) {
          // Avoid duplicate if already added as user's workingPlace
          const alreadyAdded = geofences.some(g => g.id === loc._id?.toString());
          if (!alreadyAdded) {
            geofences.push({
              id: loc._id?.toString(),
              name: loc.name || 'Office Location',
              latitude: loc.latitude,
              longitude: loc.longitude,
              radius: loc.radius && loc.radius > 0 ? loc.radius : 200,
            });
          }
        }
      }

      // 3. Fallback to CompanySetting officeLocation if no locations found
      if (geofences.length === 0) {
        const settings = await CompanySetting.findOne({ companyId: resolvedCompanyId }).lean();
        if (settings?.officeLocation && settings.officeLocation.geofenceEnabled !== false) {
          const ol = settings.officeLocation;
          if (ol.latitude && ol.longitude) {
            geofences.push({
              id: 'company-setting-office',
              name: ol.address || 'Office Headquarters',
              latitude: ol.latitude,
              longitude: ol.longitude,
              radius: ol.radius && ol.radius > 0 ? ol.radius : 200,
            });
          }
        }
      }
    }
  } catch (err) {
    console.error('[GeofenceService] Error resolving user geofences:', err.message);
  }

  return geofences;
}

/**
 * Checks whether a given lat/lng coordinate is INSIDE any active geofence boundary.
 * 
 * @param {number} latitude 
 * @param {number} longitude 
 * @param {Array} geofences - Array returned by resolveUserGeofences
 * @returns {{ isInside: boolean, matchedLocation: Object|null, minDistance: number }}
 */
function checkPointGeofence(latitude, longitude, geofences = []) {
  if (typeof latitude !== 'number' || typeof longitude !== 'number' || isNaN(latitude) || isNaN(longitude)) {
    return { isInside: false, matchedLocation: null, minDistance: Infinity };
  }

  if (!geofences || geofences.length === 0) {
    // If no geofence defined for company, entire area is considered outside
    return { isInside: false, matchedLocation: null, minDistance: Infinity };
  }

  let minDistance = Infinity;
  let matchedLocation = null;

  for (const fence of geofences) {
    const distMeters = calculateDistance(latitude, longitude, fence.latitude, fence.longitude);
    if (distMeters < minDistance) {
      minDistance = distMeters;
    }

    const radiusMeters = fence.radius || 200;
    if (distMeters <= radiusMeters) {
      matchedLocation = {
        name: fence.name,
        distance: distMeters,
        radius: radiusMeters,
        fence
      };
      return { isInside: true, matchedLocation, minDistance };
    }
  }

  return { isInside: false, matchedLocation: null, minDistance };
}

/**
 * Classifies an array of tracking points into outside vs inside geofence points.
 * Attaches `isInsideGeofence` flag to each point.
 * 
 * @param {Array} points 
 * @param {Array} geofences 
 * @returns {{ outsidePoints: Array, insidePoints: Array, allClassified: Array }}
 */
function classifyPointsByGeofence(points = [], geofences = []) {
  const outsidePoints = [];
  const insidePoints = [];
  const allClassified = [];

  for (const point of points) {
    const lat = point.latitude || point.rawLatitude || point.location?.coordinates?.[1];
    const lng = point.longitude || point.rawLongitude || point.location?.coordinates?.[0];

    const result = checkPointGeofence(lat, lng, geofences);
    const isInside = result.isInside;

    const classified = {
      ...point,
      isInsideGeofence: isInside,
      isOutside: !isInside,
      geofenceDistance: result.minDistance,
    };

    allClassified.push(classified);
    if (isInside) {
      insidePoints.push(classified);
    } else {
      outsidePoints.push(classified);
    }
  }

  return { outsidePoints, insidePoints, allClassified };
}

module.exports = {
  resolveUserGeofences,
  checkPointGeofence,
  classifyPointsByGeofence,
};
