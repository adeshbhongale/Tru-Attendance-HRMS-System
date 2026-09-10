const axios = require('axios');

/**
 * Calculates road distance between two points using Google Maps Distance Matrix API
 * @param {number} lat1 Origin Latitude
 * @param {number} lng1 Origin Longitude
 * @param {number} lat2 Destination Latitude
 * @param {number} lng2 Destination Longitude
 * @returns {Promise<number>} Distance in kilometers
 */
exports.getGoogleRoadDistance = async (lat1, lng1, lat2, lng2) => {
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

