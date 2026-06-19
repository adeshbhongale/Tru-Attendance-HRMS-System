/**
 * Route Reconstruction Service
 * Single responsibility: Reconstruct full road geometry between GPS points
 * 
 * Provider A (Primary): Google Directions API
 * Provider B (Fallback): OSRM Route Service
 */

const axios = require('axios');
const geoService = require('./geoTrackingService');

/**
 * Helper to deduplicate adjacent coordinates that are very close (within ~11cm)
 */
function deduplicateAdjacent(points) {
  if (!points || points.length <= 1) return points;
  const result = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const prev = result[result.length - 1];
    const curr = points[i];
    const isDup = Math.abs(prev.latitude - curr.latitude) < 1e-6 &&
                  Math.abs(prev.longitude - curr.longitude) < 1e-6;
    if (!isDup) {
      result.push(curr);
    }
  }
  return result;
}

/**
 * Reconstruct route geometry from an array of points
 * @param {Array} points - Array of { latitude, longitude } or snapped coordinates
 * @returns {Object} { success, geometry, distanceKm, provider }
 */
exports.reconstructRoute = async (points) => {
  if (!points || points.length === 0) {
    return { success: true, geometry: [], distanceKm: 0, provider: 'none' };
  }

  // Extract valid latitude and longitude coordinates
  const coords = points
    .map(p => {
      const lat = p.snappedLatitude || p.latitude || p.lat;
      const lng = p.snappedLongitude || p.longitude || p.lng;
      return { latitude: lat, longitude: lng };
    })
    .filter(c => c.latitude !== undefined && c.longitude !== undefined && !isNaN(c.latitude) && !isNaN(c.longitude));

  if (coords.length < 2) {
    return { success: true, geometry: coords, distanceKm: 0, provider: 'none' };
  }

  const provider = process.env.ROAD_SNAP_PROVIDER || 'google';

  if (provider === 'none') {
    return {
      success: true,
      geometry: deduplicateAdjacent(coords),
      distanceKm: calculateStraightLineDistance(coords),
      provider: 'none'
    };
  }

  try {
    let result;
    if (provider === 'google') {
      try {
        result = await reconstructWithGoogle(coords);
      } catch (err) {
        console.warn('[RouteReconstruct] Google Directions failed, falling back to OSRM:', err.message);
        result = await reconstructWithOSRM(coords);
      }
    } else {
      result = await reconstructWithOSRM(coords);
    }

    if (result && result.geometry) {
      result.geometry = deduplicateAdjacent(result.geometry);
      // Fallback to straight line if API returned a single point or empty geometry for multiple points
      if (result.geometry.length < 2 && coords.length >= 2) {
        result.geometry = deduplicateAdjacent(coords);
        result.distanceKm = calculateStraightLineDistance(coords);
        result.provider = 'none';
      }
    }
    return result;
  } catch (err) {
    console.error('[RouteReconstruct] All route reconstruction providers failed:', err.message);
    return {
      success: false,
      geometry: deduplicateAdjacent(coords),
      distanceKm: calculateStraightLineDistance(coords),
      provider: 'none',
      error: err.message
    };
  }
};

/**
 * Reconstruct route using Google Directions API
 * Batches intermediate points into chunks to meet waypoint limits (max 23 intermediate waypoints)
 */
async function reconstructWithGoogle(coords) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    throw new Error('GOOGLE_MAPS_API_KEY not configured');
  }

  const maxWaypoints = 23; // Google Directions waypoint limit (origin + 23 waypoints + destination = 25 points)
  const geometry = [];
  let totalDistanceMeters = 0;

  for (let i = 0; i < coords.length - 1; i += maxWaypoints) {
    const origin = coords[i];
    const endIdx = Math.min(i + maxWaypoints, coords.length - 1);
    const destination = coords[endIdx];
    const waypoints = coords.slice(i + 1, endIdx);

    // Build waypoints using 'via:' to ensure smooth routing without split legs
    let waypointsParam = '';
    if (waypoints.length > 0) {
      waypointsParam = waypoints.map(w => `via:${w.latitude},${w.longitude}`).join('|');
    }

    const params = {
      origin: `${origin.latitude},${origin.longitude}`,
      destination: `${destination.latitude},${destination.longitude}`,
      key: apiKey
    };
    if (waypointsParam) {
      params.waypoints = waypointsParam;
    }

    const response = await axios.get('https://maps.googleapis.com/maps/api/directions/json', {
      params,
      timeout: 12000
    });

    if (response.data.status !== 'OK') {
      throw new Error(`Google Directions API error: ${response.data.status}. ${response.data.error_message || ''}`);
    }

    const route = response.data.routes[0];
    if (route) {
      const decoded = decodePolyline(route.overview_polyline.points);
      
      // Merge route geometry without duplicating endpoints
      if (geometry.length === 0) {
        geometry.push(...decoded);
      } else {
        const lastPoint = geometry[geometry.length - 1];
        const firstPoint = decoded[0];
        const isDuplicate = lastPoint && firstPoint &&
          Math.abs(lastPoint.latitude - firstPoint.latitude) < 1e-6 &&
          Math.abs(lastPoint.longitude - firstPoint.longitude) < 1e-6;
        
        const startIdx = isDuplicate ? 1 : 0;
        for (let k = startIdx; k < decoded.length; k++) {
          geometry.push(decoded[k]);
        }
      }

      // Sum legs distances
      if (route.legs) {
        for (const leg of route.legs) {
          if (leg.distance && leg.distance.value) {
            totalDistanceMeters += leg.distance.value;
          }
        }
      }
    }
  }

  return {
    success: true,
    geometry,
    distanceKm: parseFloat((totalDistanceMeters / 1000).toFixed(6)),
    provider: 'google'
  };
}

/**
 * Reconstruct route using OSRM Route API
 * Batches coordinate segments to prevent too long URLs
 */
async function reconstructWithOSRM(coords) {
  const maxChunkSize = 40; // Safely fit within OSRM URI length limits
  const geometry = [];
  let totalDistanceMeters = 0;

  for (let i = 0; i < coords.length - 1; i += maxChunkSize) {
    const endIdx = Math.min(i + maxChunkSize, coords.length - 1);
    const chunk = coords.slice(i, endIdx + 1);

    const coordsParam = chunk.map(w => `${w.longitude},${w.latitude}`).join(';');
    const url = `https://router.project-osrm.org/route/v1/driving/${coordsParam}`;

    const response = await axios.get(url, {
      params: {
        geometries: 'geojson',
        overview: 'full'
      },
      timeout: 12000
    });

    if (response.data && response.data.code === 'Ok' && response.data.routes && response.data.routes.length > 0) {
      const route = response.data.routes[0];
      const routeCoords = route.geometry.coordinates.map(c => ({
        latitude: c[1],
        longitude: c[0]
      }));

      // Merge route geometry without duplicating endpoints
      if (geometry.length === 0) {
        geometry.push(...routeCoords);
      } else {
        const lastPoint = geometry[geometry.length - 1];
        const firstPoint = routeCoords[0];
        const isDuplicate = lastPoint && firstPoint &&
          Math.abs(lastPoint.latitude - firstPoint.latitude) < 1e-6 &&
          Math.abs(lastPoint.longitude - firstPoint.longitude) < 1e-6;
        
        const startIdx = isDuplicate ? 1 : 0;
        for (let k = startIdx; k < routeCoords.length; k++) {
          geometry.push(routeCoords[k]);
        }
      }

      totalDistanceMeters += route.distance || 0;
    } else {
      throw new Error(`OSRM Route API error: ${response.data ? response.data.code : 'unknown response'}`);
    }
  }

  return {
    success: true,
    geometry,
    distanceKm: parseFloat((totalDistanceMeters / 1000).toFixed(6)),
    provider: 'osrm'
  };
}

/**
 * Decode Google Encoded Polyline algorithm string
 * @param {string} encoded - Encoded polyline points
 * @returns {Array} Array of { latitude, longitude }
 */
function decodePolyline(encoded) {
  if (!encoded) return [];
  const points = [];
  let index = 0;
  const len = encoded.length;
  let lat = 0;
  let lng = 0;

  while (index < len) {
    let b;
    let shift = 0;
    let result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = ((result & 1) ? ~(result >> 1) : (result >> 1));
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = ((result & 1) ? ~(result >> 1) : (result >> 1));
    lng += dlng;

    points.push({
      latitude: lat / 1e5,
      longitude: lng / 1e5
    });
  }
  return points;
}

/**
 * Calculates straight line distance using Haversine fallback
 */
function calculateStraightLineDistance(coords) {
  let total = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    const p1 = coords[i];
    const p2 = coords[i + 1];
    total += geoService.calculateDistance(p1.latitude, p1.longitude, p2.latitude, p2.longitude);
  }
  return parseFloat(total.toFixed(6));
}

// Export decodePolyline for unit test access
exports.decodePolyline = decodePolyline;
