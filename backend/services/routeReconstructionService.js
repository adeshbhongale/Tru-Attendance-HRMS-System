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
  const rawCoords = points
    .map(p => {
      const lat = p.snappedLatitude || p.latitude || p.lat;
      const lng = p.snappedLongitude || p.longitude || p.lng;
      return { latitude: Number(lat), longitude: Number(lng), timestamp: p.timestamp || p.time };
    })
    .filter(c => c.latitude !== undefined && c.longitude !== undefined && !isNaN(c.latitude) && !isNaN(c.longitude));

  if (rawCoords.length < 2) {
    return { success: true, geometry: rawCoords, distanceKm: 0, provider: 'none' };
  }

  const coords = rawCoords;

  const googleApiKey = process.env.GOOGLE_MAPS_API_KEY;
  let provider = process.env.ROAD_SNAP_PROVIDER || (googleApiKey ? 'google' : 'osrm');
  if (provider === 'google' && !googleApiKey) {
    provider = 'osrm';
  }

  try {
    let result = null;
    if (provider === 'google') {
      try {
        result = await reconstructWithGoogle(coords);
      } catch (err) {
        result = await reconstructWithOSRM(coords);
      }
    } else {
      result = await reconstructWithOSRM(coords);
    }

    const rawGeom = result && result.geometry && result.geometry.length >= 2
      ? deduplicateAdjacent(result.geometry)
      : coords;

    // Apply heading-aware directional lane offset (1.8m) so return trips on the same road
    // trace their own separate driving lane close to return GPS fixes instead of overlapping
    const finalGeom = applyDirectionalLaneOffset(rawGeom, 1.8);

    return {
      success: true,
      geometry: finalGeom,
      distanceKm: result?.distanceKm || calculateStraightLineDistance(coords),
      provider: result?.provider || 'osrm'
    };
  } catch (err) {
    console.error('[RouteReconstruct] Route reconstruction failed, falling back to clean coordinates:', err.message);
    return {
      success: true,
      geometry: coords,
      distanceKm: calculateStraightLineDistance(coords),
      provider: 'none',
      error: err.message
    };
  }
};

/**
 * Calculate geographical bearing / heading in degrees (0-360) between two points
 */
function calculateHeading(p1, p2) {
  const lat1 = (p1.latitude || p1.lat) * (Math.PI / 180);
  const lat2 = (p2.latitude || p2.lat) * (Math.PI / 180);
  const dLon = ((p2.longitude || p2.lng) - (p1.longitude || p1.lng)) * (Math.PI / 180);

  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  const brng = Math.atan2(y, x) * (180 / Math.PI);
  return (brng + 360) % 360;
}

/**
 * Separate forward and return paths on the same road into distinct driving lanes
 * @param {Array} geom - Reconstructed road geometry points [{latitude, longitude}]
 * @param {Number} laneOffsetMeters - Offset distance in meters (e.g. 1.8m)
 * @returns {Array} Geometry with directional lane separation for return journeys
 */
function applyDirectionalLaneOffset(geom, laneOffsetMeters = 1.8) {
  if (!geom || geom.length < 3) return geom;

  const METERS_PER_DEG_LAT = 111320;

  return geom.map((pt, i) => {
    let headingDeg = 0;
    if (i < geom.length - 1) {
      headingDeg = calculateHeading(pt, geom[i + 1]);
    } else if (i > 0) {
      headingDeg = calculateHeading(geom[i - 1], pt);
    }

    const headingRad = headingDeg * (Math.PI / 180);
    // Normal vector perpendicular to heading (90 degrees to the driving side)
    const normalRad = headingRad + (Math.PI / 2);

    const cosLat = Math.cos(pt.latitude * (Math.PI / 180));
    const metersPerDegLng = METERS_PER_DEG_LAT * (cosLat !== 0 ? Math.abs(cosLat) : 1);

    // Shift by laneOffsetMeters along normal
    const dLat = (Math.cos(normalRad) * laneOffsetMeters) / METERS_PER_DEG_LAT;
    const dLng = (Math.sin(normalRad) * laneOffsetMeters) / metersPerDegLng;

    return {
      ...pt,
      latitude: parseFloat((pt.latitude + dLat).toFixed(7)),
      longitude: parseFloat((pt.longitude + dLng).toFixed(7))
    };
  });
}

/**
 * Reconstruct route using Google Roads snapToRoads API with road interpolation
 */
async function reconstructWithGoogle(coords) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    throw new Error('GOOGLE_MAPS_API_KEY not configured');
  }

  const allSnapped = [];
  const MAX_BATCH = 100;

  for (let i = 0; i < coords.length; i += (MAX_BATCH - 1)) {
    const batch = coords.slice(i, i + MAX_BATCH);
    if (batch.length < 2) {
      if (batch.length === 1 && allSnapped.length === 0) {
        allSnapped.push({ latitude: batch[0].latitude, longitude: batch[0].longitude });
      }
      continue;
    }

    const pathParam = batch.map(p => `${p.latitude},${p.longitude}`).join('|');
    const response = await axios.get('https://roads.googleapis.com/v1/snapToRoads', {
      params: {
        path: pathParam,
        interpolate: true,
        key: apiKey
      },
      timeout: 8000
    });

    if (response.data && response.data.snappedPoints && response.data.snappedPoints.length > 0) {
      const snappedBatch = response.data.snappedPoints.map(sp => ({
        latitude: sp.location.latitude,
        longitude: sp.location.longitude
      }));
      allSnapped.push(...snappedBatch);
    } else {
      allSnapped.push(...batch.map(p => ({ latitude: p.latitude, longitude: p.longitude })));
    }
  }

  const cleanGeometry = deduplicateAdjacent(allSnapped);
  const distanceKm = calculateStraightLineDistance(cleanGeometry);

  return {
    success: true,
    geometry: cleanGeometry.length >= 2 ? cleanGeometry : coords,
    distanceKm: parseFloat(distanceKm.toFixed(6)),
    provider: 'google'
  };
}

/**
 * Filter out any generated route points that wander onto far-away streets (> 35m away from all raw GPS points)
 */
function filterFarAwayPoints(generatedGeom, originalCoords, maxDistanceMeters = 35) {
  if (!generatedGeom || !originalCoords || originalCoords.length === 0) return generatedGeom;
  const geoService = require('./geoTrackingService');
  return generatedGeom.filter(pt => {
    let minDist = Infinity;
    for (const orig of originalCoords) {
      const d = geoService.calculateDistance(pt.latitude, pt.longitude, orig.latitude, orig.longitude) * 1000;
      if (d < minDist) {
        minDist = d;
      }
      if (minDist <= maxDistanceMeters) return true;
    }
    return minDist <= maxDistanceMeters;
  });
}

/**
 * Reconstruct route using OSRM Map Match / Route API with direction-aware bearings and radius constraints
 */
async function reconstructWithOSRM(coords) {
  const gpsFilter = require('./gpsFilterService');
  const smoothedCoords = gpsFilter.smoothCorridorJitter(coords);
  // Simplify/downsample to max 50 points (OSRM can handle more, but keep it reasonable)
  const simplifiedCoords = simplifyRoute(smoothedCoords.length >= 2 ? smoothedCoords : coords, 50);

  if (simplifiedCoords.length < 2) {
    return {
      success: true,
      geometry: simplifiedCoords,
      distanceKm: 0,
      provider: 'osrm'
    };
  }

  const coordsParam = simplifiedCoords.map(w => `${w.longitude},${w.latitude}`).join(';');
  const radiusesParam = simplifiedCoords.map(() => 25).join(';');

  // 1. Primary: Try OSRM Map Matching (/match) with tight 25m radiuses
  const matchUrl = `https://router.project-osrm.org/match/v1/driving/${coordsParam}`;
  try {
    const matchRes = await axios.get(matchUrl, {
      params: {
        geometries: 'geojson',
        overview: 'full',
        radiuses: radiusesParam
      },
      timeout: 10000
    });

    if (matchRes.data && matchRes.data.code === 'Ok' && matchRes.data.matchings && matchRes.data.matchings.length > 0) {
      const matchedCoords = [];
      let totalDist = 0;
      for (const m of matchRes.data.matchings) {
        if (m.geometry && m.geometry.coordinates) {
          matchedCoords.push(...m.geometry.coordinates.map(c => ({ latitude: c[1], longitude: c[0] })));
        }
        totalDist += (m.distance || 0);
      }

      if (matchedCoords.length >= 2) {
        const cleanMatched = filterFarAwayPoints(matchedCoords, simplifiedCoords, 45);
        if (cleanMatched.length >= 2) {
          console.log(`[RouteReconstruct] OSRM /match successful (${cleanMatched.length} road-aligned points)`);
          return {
            success: true,
            geometry: cleanMatched,
            distanceKm: parseFloat((totalDist / 1000).toFixed(6)),
            provider: 'osrm'
          };
        }
      }
    }
  } catch (matchErr) {
    console.warn('[RouteReconstruct] OSRM /match failed, falling back to /route:', matchErr.message);
  }

  // 2. Secondary fallback: OSRM /route with bearings and corridor guard
  const routeUrl = `https://router.project-osrm.org/route/v1/driving/${coordsParam}`;
  const bearingsList = [];
  for (let i = 0; i < simplifiedCoords.length; i++) {
    let heading = 0;
    if (i < simplifiedCoords.length - 1) {
      heading = gpsFilter.calculateHeading(simplifiedCoords[i], simplifiedCoords[i + 1]);
    } else if (i > 0) {
      heading = gpsFilter.calculateHeading(simplifiedCoords[i - 1], simplifiedCoords[i]);
    }
    bearingsList.push(`${heading},45`);
  }
  const bearingsParam = bearingsList.join(';');

  let response = null;
  try {
    response = await axios.get(routeUrl, {
      params: {
        geometries: 'geojson',
        overview: 'full',
        alternatives: false,
        steps: false,
        bearings: bearingsParam,
        continue_straight: true
      },
      timeout: 15000
    });
  } catch (bearingErr) {
    response = await axios.get(routeUrl, {
      params: {
        geometries: 'geojson',
        overview: 'full',
        alternatives: false,
        steps: false,
        continue_straight: true
      },
      timeout: 15000
    });
  }

  if (response.data && response.data.code === 'Ok' && response.data.routes && response.data.routes.length > 0) {
    const route = response.data.routes[0];
    const routeCoords = route.geometry.coordinates.map(c => ({
      latitude: c[1],
      longitude: c[0]
    }));

    // Filter out any points that wander onto far-away streets (> 45m away from GPS track)
    const cleanRouteCoords = filterFarAwayPoints(routeCoords, simplifiedCoords, 45);
    const finalGeom = cleanRouteCoords.length >= 2 ? cleanRouteCoords : simplifiedCoords;

    console.log(`[RouteReconstruct] OSRM route successful (${finalGeom.length} points within corridor)`);
    return {
      success: true,
      geometry: finalGeom,
      distanceKm: parseFloat(((route.distance || 0) / 1000).toFixed(6)),
      provider: 'osrm'
    };
  } else {
    return {
      success: true,
      geometry: simplifiedCoords,
      distanceKm: calculateStraightLineDistance(simplifiedCoords),
      provider: 'none'
    };
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

// NOTE: pruneUturnLoops() has been removed (2026-06-30, #16 fix).
// It was dead code — never called at runtime.

// Export decodePolyline for unit test access
exports.decodePolyline = decodePolyline;
