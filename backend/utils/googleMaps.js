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

/**
 * Performs reverse geocoding for a latitude/longitude point
 * @param {number} lat Latitude
 * @param {number} lng Longitude
 * @returns {Promise<string>} Formatted address
 */
exports.reverseGeocodeLatLng = async (lat, lng) => {
  try {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (apiKey) {
      const response = await axios.get(
        `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${apiKey}`
      );

      if (response.data.status === 'OK' && response.data.results.length > 0) {
        return response.data.results[0].formatted_address;
      } else {
        console.error('Google Geocoding Error:', response.data.status);
      }
    }

    // Free Nominatim (OpenStreetMap) Fallback
    console.log('[Geocoding] Google Geocoding failed or not configured, trying Nominatim fallback...');
    const response = await axios.get(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`,
      {
        headers: {
          'User-Agent': 'Geo-Attendance-HRMS/1.0.0 (admin@hrms.com)'
        },
        timeout: 5000
      }
    );

    if (response.data && response.data.display_name) {
      return response.data.display_name;
    }
    return `Location near ${lat.toFixed(6)}, ${lng.toFixed(6)}`;
  } catch (err) {
    console.error('Geocoding Request Failed (both Google and Nominatim):', err.message);
    return `Location near ${lat.toFixed(6)}, ${lng.toFixed(6)}`;
  }
};
