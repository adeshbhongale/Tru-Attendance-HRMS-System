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
 * Perpendicular distance from a point to a line segment
 */
function perpendicularDistance(point, lineStart, lineEnd) {
  const x = point.longitude || point.lng;
  const y = point.latitude || point.lat;
  const x1 = lineStart.longitude || lineStart.lng;
  const y1 = lineStart.latitude || lineStart.lat;
  const x2 = lineEnd.longitude || lineEnd.lng;
  const y2 = lineEnd.latitude || lineEnd.lat;

  const numerator = Math.abs((y2 - y1) * x - (x2 - x1) * y + x2 * y1 - y2 * x1);
  const denominator = Math.sqrt(Math.pow(y2 - y1, 2) + Math.pow(x2 - x1, 2));
  if (denominator === 0) {
    const dx = x - x1;
    const dy = y - y1;
    return Math.sqrt(dx * dx + dy * dy);
  }
  return numerator / denominator;
}

/**
 * Douglas-Peucker line simplification algorithm
 */
function douglasPeucker(points, epsilon) {
  if (points.length <= 2) return points;

  let dmax = 0;
  let index = 0;
  const end = points.length - 1;

  for (let i = 1; i < end; i++) {
    const d = perpendicularDistance(points[i], points[0], points[end]);
    if (d > dmax) {
      index = i;
      dmax = d;
    }
  }

  if (dmax > epsilon) {
    const results1 = douglasPeucker(points.slice(0, index + 1), epsilon);
    const results2 = douglasPeucker(points.slice(index), epsilon);
    return results1.slice(0, results1.length - 1).concat(results2);
  } else {
    return [points[0], points[end]];
  }
}

/**
 * Simplify a route to contain at most maxPoints using Douglas-Peucker downsampling
 */
function simplifyRoute(points, maxPoints = 40) {
  if (points.length <= maxPoints) return points;

  let epsilon = 0.00005; // ~5 meters starting threshold
  let simplified = points;
  let iterations = 0;

  while (simplified.length > maxPoints && iterations < 10) {
    simplified = douglasPeucker(points, epsilon);
    epsilon *= 2;
    iterations++;
  }

  if (simplified.length > maxPoints) {
    const step = (simplified.length - 1) / (maxPoints - 1);
    const finalPoints = [];
    for (let i = 0; i < maxPoints - 1; i++) {
      finalPoints.push(simplified[Math.round(i * step)]);
    }
    finalPoints.push(simplified[simplified.length - 1]);
    return finalPoints;
  }

  return simplified;
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

  // If the straight line distance is less than 10 meters (0.01 km), the user is stationary
  const straightLineDistKm = calculateStraightLineDistance(coords);
  if (straightLineDistKm < 0.01) {
    return { success: true, geometry: coords, distanceKm: straightLineDistKm, provider: 'none' };
  }

  let provider = process.env.ROAD_SNAP_PROVIDER || 'osrm'; // Default to OSRM if not set, since it doesn't need API key
  const googleApiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (provider === 'google' && !googleApiKey) {
    provider = 'osrm'; // Fall back to OSRM if Google key is missing
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
        result.geometry = coords;
        result.distanceKm = calculateStraightLineDistance(coords);
        result.provider = 'none';
        result.success = true; // Still success, just using raw
      }

      // Keep the complete route history. The 7-stage engine handles consensus and visit counts,
      // so return loops should not be pruned from the final geometry store.
      console.log(`[RouteReconstruct] Route reconstruction successful. Preserving full history (${result.geometry.length} points).`);
    }
    return result;
  } catch (err) {
    console.error('[RouteReconstruct] All route reconstruction providers failed, falling back to raw coordinates:', err.message);
    return {
      success: true, // Mark as success since we're falling back to raw
      geometry: coords,
      distanceKm: calculateStraightLineDistance(coords),
      provider: 'none',
      error: err.message
    };
  }
};

/**
 * Reconstruct route using new Google Routes API v2
 */
async function reconstructWithGoogle(coords) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    throw new Error('GOOGLE_MAPS_API_KEY not configured');
  }

  // Downsample coordinates to at most 25 points to fit within Routes API limits (origin + 23 intermediates + destination)
  const simplifiedCoords = simplifyRoute(coords, 25);

  if (simplifiedCoords.length < 2) {
    return {
      success: true,
      geometry: simplifiedCoords,
      distanceKm: 0,
      provider: 'google'
    };
  }

  const origin = simplifiedCoords[0];
  const destination = simplifiedCoords[simplifiedCoords.length - 1];
  const intermediates = simplifiedCoords.slice(1, simplifiedCoords.length - 1).map(c => ({
    location: {
      latLng: {
        latitude: c.latitude,
        longitude: c.longitude
      }
    },
    via: true
  }));

  const requestBody = {
    origin: {
      location: {
        latLng: {
          latitude: origin.latitude,
          longitude: origin.longitude
        }
      }
    },
    destination: {
      location: {
        latLng: {
          latitude: destination.latitude,
          longitude: destination.longitude
        }
      }
    },
    travelMode: 'DRIVE',
    routingPreference: 'TRAFFIC_UNAWARE',
    computeAlternativeRoutes: false,
    units: 'METRIC'
  };

  if (intermediates.length > 0) {
    requestBody.intermediates = intermediates;
  }

  const response = await axios.post(
    'https://routes.googleapis.com/directions/v2:computeRoutes',
    requestBody,
    {
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline,routes.legs'
      },
      timeout: 5000
    }
  );

  const data = response.data;
  if (!data || !data.routes || data.routes.length === 0) {
    throw new Error('Google Routes API returned no routes');
  }

  const route = data.routes[0];
  let geometry = [];
  if (route.polyline && route.polyline.encodedPolyline) {
    geometry = decodePolyline(route.polyline.encodedPolyline);
  } else {
    geometry = simplifiedCoords;
  }

  const totalDistanceMeters = route.distanceMeters || 0;

  return {
    success: true,
    geometry,
    distanceKm: parseFloat((totalDistanceMeters / 1000).toFixed(6)),
    provider: 'google'
  };
}

/**
 * Reconstruct route using OSRM Route API
 */
async function reconstructWithOSRM(coords) {
  // Simplify/downsample to max 50 points (OSRM can handle more, but keep it reasonable)
  const simplifiedCoords = simplifyRoute(coords, 50);

  if (simplifiedCoords.length < 2) {
    return {
      success: true,
      geometry: simplifiedCoords,
      distanceKm: 0,
      provider: 'osrm'
    };
  }

  const coordsParam = simplifiedCoords.map(w => `${w.longitude},${w.latitude}`).join(';');
  const url = `https://router.project-osrm.org/route/v1/driving/${coordsParam}`;

  console.log(`[RouteReconstruct] Requesting OSRM route from ${url}`);
  const response = await axios.get(url, {
    params: {
      geometries: 'geojson',
      overview: 'full',
      alternatives: false,
      steps: false
    },
    timeout: 15000 // Increased timeout to 15 seconds for robustness
  });

  if (response.data && response.data.code === 'Ok' && response.data.routes && response.data.routes.length > 0) {
    const route = response.data.routes[0];
    const routeCoords = route.geometry.coordinates.map(c => ({
      latitude: c[1],
      longitude: c[0]
    }));

    console.log(`[RouteReconstruct] OSRM route reconstruction successful, ${routeCoords.length} points`);
    return {
      success: true,
      geometry: routeCoords,
      distanceKm: parseFloat(((route.distance || 0) / 1000).toFixed(6)),
      provider: 'osrm'
    };
  } else {
    console.error('[RouteReconstruct] OSRM response error:', response.data?.code || 'unknown error');
    throw new Error(`OSRM Route API error: ${response.data?.code || 'unknown response'}`);
  }
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

/**
 * Prunes U-turn loops from a route geometry
 * (i.e. detects sections that double-back on themselves and cuts them out)
 */
function pruneUturnLoops(geometry) {
  if (!geometry || geometry.length < 5) return geometry;

  let result = [...geometry];
  let changed = true;
  let iterations = 0;

  // Keep pruning until no more loops are found, safety cap at 5 iterations
  while (changed && iterations < 5) {
    changed = false;
    iterations++;

    // Calculate cumulative distance along the current geometry
    const cumulativeDist = [0];
    for (let i = 1; i < result.length; i++) {
      const d = geoService.calculateDistance(
        result[i - 1].latitude, result[i - 1].longitude,
        result[i].latitude, result[i].longitude
      ) * 1000; // in meters
      cumulativeDist.push(cumulativeDist[cumulativeDist.length - 1] + d);
    }

    let bestI = -1;
    let bestJ = -1;
    let maxSavedDist = 0;

    // Find the pair of points that are geographically close (< 20m)
    // but far apart along the route (> 80m) to prune the loop
    for (let i = 0; i < result.length; i++) {
      for (let j = i + 2; j < result.length; j++) {
        const pathDist = cumulativeDist[j] - cumulativeDist[i];
        if (pathDist > 80) {
          const geoDist = geoService.calculateDistance(
            result[i].latitude, result[i].longitude,
            result[j].latitude, result[j].longitude
          ) * 1000; // in meters

          if (geoDist < 20) {
            const savedDist = pathDist - geoDist;
            if (savedDist > maxSavedDist) {
              maxSavedDist = savedDist;
              bestI = i;
              bestJ = j;
            }
          }
        }
      }
    }

    if (bestI !== -1 && bestJ !== -1) {
      // Prune the points in between, keeping result[bestI] and result[bestJ]
      result.splice(bestI + 1, bestJ - bestI - 1);
      changed = true;
    }
  }

  return result;
}

// Export decodePolyline for unit test access
exports.decodePolyline = decodePolyline;
