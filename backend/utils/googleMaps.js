const axios = require('axios');
const { calculateDistance } = require('./geofence');

// In-memory cache for road route distance (~1.1km grid precision: 2 decimal places)
const roadDistanceCache = new Map();

exports.getGoogleRoadDistance = async (lat1, lng1, lat2, lng2) => {
  if (lat1 == null || lng1 == null || lat2 == null || lng2 == null || isNaN(lat1) || isNaN(lng1) || isNaN(lat2) || isNaN(lng2)) {
    return null;
  }
  const numLat1 = Number(lat1);
  const numLng1 = Number(lng1);
  const numLat2 = Number(lat2);
  const numLng2 = Number(lng2);

  const cacheKey = `${numLat1.toFixed(2)},${numLng1.toFixed(2)}->${numLat2.toFixed(2)},${numLng2.toFixed(2)}`;
  if (roadDistanceCache.has(cacheKey)) {
    return roadDistanceCache.get(cacheKey);
  }

  // 1. Primary: Google Maps Distance Matrix API (when key & billing enabled)
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (apiKey) {
    try {
      const response = await axios.get(
        `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${numLat1},${numLng1}&destinations=${numLat2},${numLng2}&key=${apiKey}`,
        { timeout: 6000 }
      );
      const element = response.data?.rows?.[0]?.elements?.[0];
      if (response.data?.status === 'OK' && element?.status === 'OK' && element.distance?.value != null) {
        const km = element.distance.value / 1000;
        roadDistanceCache.set(cacheKey, km);
        return km;
      }
    } catch (err) {
      // Fall through to OSRM road route fallback
    }
  }

  // 2. Fallback: OSRM Driving Route API (actual highway/road route distance)
  try {
    const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${numLng1},${numLat1};${numLng2},${numLat2}?overview=false`;
    const osrmRes = await axios.get(osrmUrl, { timeout: 6000 });
    const routeDistMeters = osrmRes.data?.routes?.[0]?.distance;
    if (typeof routeDistMeters === 'number' && routeDistMeters > 0) {
      const km = routeDistMeters / 1000;
      roadDistanceCache.set(cacheKey, km);
      return km;
    }
  } catch (osrmErr) {
    console.warn('Road route distance lookup failed, falling back to straight-line:', osrmErr.message);
  }

  return null;
};

/**
 * Resolves the distance in meters from an employee's assigned workingPlace using road route distance
 * when straight-line distance is >= 80 km (so local/in-city checks require 0 external API calls).
 */
exports.resolveOutstationDistanceMeters = async (empLat, empLng, wpLat, wpLng) => {
  if (empLat == null || empLng == null || wpLat == null || wpLng == null || isNaN(empLat) || isNaN(empLng) || isNaN(wpLat) || isNaN(wpLng)) {
    return 0;
  }
  const straightMeters = calculateDistance(Number(empLat), Number(empLng), Number(wpLat), Number(wpLng));
  // Road distance cannot reach 150 km if straight-line is under 80 km
  if (straightMeters < 80000) {
    return straightMeters;
  }
  const roadKm = await exports.getGoogleRoadDistance(Number(wpLat), Number(wpLng), Number(empLat), Number(empLng));
  if (typeof roadKm === 'number' && roadKm > 0) {
    return Math.max(straightMeters, Math.round(roadKm * 1000));
  }
  return straightMeters;
};

exports.getCachedOutstationDistanceMeters = (empLat, empLng, wpLat, wpLng) => {
  if (empLat == null || empLng == null || wpLat == null || wpLng == null || isNaN(empLat) || isNaN(empLng) || isNaN(wpLat) || isNaN(wpLng)) {
    return 0;
  }
  const straightMeters = calculateDistance(Number(empLat), Number(empLng), Number(wpLat), Number(wpLng));
  if (straightMeters < 80000) return straightMeters;
  const cacheKey = `${Number(wpLat).toFixed(2)},${Number(wpLng).toFixed(2)}->${Number(empLat).toFixed(2)},${Number(empLng).toFixed(2)}`;
  const cachedRoadKm = roadDistanceCache.get(cacheKey);
  if (typeof cachedRoadKm === 'number' && cachedRoadKm > 0) {
    return Math.max(straightMeters, Math.round(cachedRoadKm * 1000));
  }
  return straightMeters;
};

/**
 * Calculates road distance between two points using Google Maps Distance Matrix API
 * @param {number} lat1 Origin Latitude
 * @param {number} lng1 Origin Longitude
 * @param {number} lat2 Destination Latitude
 * @param {number} lng2 Destination Longitude
 * @returns {Promise<number>} Distance in kilometers
 */
const _legacyGetGoogleRoadDistance = async (lat1, lng1, lat2, lng2) => {
  try {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      console.warn('GOOGLE_MAPS_API_KEY not found, falling back to straight-line distance');
      return null;
    }

    const response = await axios.get(
      `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${lat1},${lng1}&destinations=${lat2},${lng2}&key=${apiKey}`
    );

    if (response.data.status === 'OK' && response.data.rows[0].elements[0].status === 'OK') {
      // Distance is returned in meters, convert to kilometers
      return response.data.rows[0].elements[0].distance.value / 1000;
    } else {
      console.error('Google Distance Matrix Error:', response.data.status, response.data.rows[0].elements[0].status);
      return null;
    }
  } catch (err) {
    console.error('Google Distance Matrix Request Failed:', err.message);
    return null;
  }
};

// In-memory cache for reverse geocoding (~110m grid precision)
const addressCache = new Map();

/**
 * Performs reverse geocoding for a latitude/longitude point
 * @param {number} lat Latitude
 * @param {number} lng Longitude
 * @returns {Promise<string>} Formatted address
 */
exports.reverseGeocodeLatLng = async (lat, lng) => {
  if (lat == null || lng == null || isNaN(lat) || isNaN(lng)) {
    return 'Location not available';
  }

  const numLat = parseFloat(lat);
  const numLng = parseFloat(lng);

  // Cache key with 3 decimal places (~110m radius)
  const cacheKey = `${numLat.toFixed(3)},${numLng.toFixed(3)}`;
  if (addressCache.has(cacheKey)) {
    return addressCache.get(cacheKey);
  }

  try {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (apiKey) {
      const response = await axios.get(
        `https://maps.googleapis.com/maps/api/geocode/json?latlng=${numLat},${numLng}&key=${apiKey}`
      );

      if (response.data.status === 'OK' && response.data.results && response.data.results.length > 0) {
        // Find best non-PlusCode address (prefer street/locality over plus code)
        const nonPlus = response.data.results.find(r => r.formatted_address && !/^[A-Z0-9]{2,8}\+[A-Z0-9]{2,4}\b/i.test(r.formatted_address));
        let cleanAddress = nonPlus ? nonPlus.formatted_address : response.data.results[0].formatted_address;

        // If it still has a leading plus code (e.g. "R964+WJ Nipane, Maharashtra"), strip it
        cleanAddress = cleanAddress.replace(/^[A-Z0-9]{2,8}\+[A-Z0-9]{2,4}\s*,?\s*/i, '').trim();

        if (cleanAddress && cleanAddress.length > 3) {
          addressCache.set(cacheKey, cleanAddress);
          return cleanAddress;
        }
      } else {
        console.warn('Google Geocoding status:', response.data.status);
      }
    }

    // Free Nominatim (OpenStreetMap) Fallback
    const response = await axios.get(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${numLat}&lon=${numLng}`,
      {
        headers: {
          'User-Agent': 'Geo-Attendance-HRMS/1.0.0 (admin@hrms.com)',
          'Accept-Language': 'en'
        },
        timeout: 5000
      }
    );

    if (response.data && response.data.display_name) {
      const nominatimAddr = response.data.display_name;
      addressCache.set(cacheKey, nominatimAddr);
      return nominatimAddr;
    }
    
    const fallback = `Near Area (${numLat.toFixed(4)}, ${numLng.toFixed(4)})`;
    addressCache.set(cacheKey, fallback);
    return fallback;
  } catch (err) {
    console.error('Geocoding Request Failed (both Google and Nominatim):', err.message);
    const fallback = `Near Area (${numLat.toFixed(4)}, ${numLng.toFixed(4)})`;
    return fallback;
  }
};

