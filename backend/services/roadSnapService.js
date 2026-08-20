/**
 * Road Snap Service
 * Single responsibility: Snap GPS coordinates to nearest roads
 * 
 * Provider A (Primary): Google Roads API
 * Provider B (Fallback): OSRM Match Service
 * 
 * Configurable via ROAD_SNAP_PROVIDER env var ('google', 'osrm', 'none')
 */

const axios = require('axios');

// Configuration
const GOOGLE_ROADS_API = 'https://roads.googleapis.com/v1/snapToRoads';
const OSRM_MATCH_API = 'https://router.project-osrm.org/match/v1/driving';
const MAX_POINTS_PER_REQUEST = 100; // Google Roads API limit
const OSRM_CHUNK_SIZE = 50;         // OSRM /match chunk size (keep requests small)
const RETRY_DELAY_MS = 60000; // 1 minute retry on rate limit
const OSRM_RETRY_ATTEMPTS = 3;
const OSRM_RETRY_BASE_DELAY_MS = 500;

let isRateLimited = false;
let rateLimitTimer = null;

/**
 * Return the point's true RAW GPS coordinates (preferred) or its current lat/lng.
 * Keeps unmatched points on raw GPS instead of smoothed coordinates.
 */
function toRawCoords(p) {
  return {
    latitude: (p.rawLatitude !== undefined && p.rawLatitude !== null) ? p.rawLatitude : p.latitude,
    longitude: (p.rawLongitude !== undefined && p.rawLongitude !== null) ? p.rawLongitude : p.longitude
  };
}

/**
 * Build a raw fallback point (no snap) for an unmatched point.
 */
function rawFallbackPoint(p, provider, routeStatus = 'raw') {
  return {
    ...p,
    ...toRawCoords(p),
    candidateRoads: [],
    snappedLatitude: null,
    snappedLongitude: null,
    provider,
    routeStatus
  };
}

/**
 * Small retry/backoff wrapper for external snap requests.
 * Retries 429 / timeouts / transient 5xx with a short backoff; rethrows otherwise.
 */
async function requestWithRetry(url, params, attempts = OSRM_RETRY_ATTEMPTS, baseDelayMs = OSRM_RETRY_BASE_DELAY_MS, timeout = 8000) {
  let lastErr = null;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await axios.get(url, { params, timeout });
    } catch (err) {
      const status = err.response && err.response.status;
      const retryable = status === 429 || status === 408 ||
        status === 500 || status === 502 || status === 503 || status === 504 ||
        err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT' || err.code === 'ENOTFOUND' || !err.response;
      if (retryable && attempt < attempts) {
        const delay = baseDelayMs * Math.pow(2, attempt - 1);
        console.warn(`[RoadSnap] Request failed (${err.message || status}), retry ${attempt}/${attempts - 1} in ${delay}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
        lastErr = err;
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

/**
 * Snap an array of GPS points to the nearest road candidates
 * @param {Array} points - Array of { latitude, longitude, timestamp }
 * @returns {Object} { snappedPoints, provider, success }
 */
exports.snapToRoad = async (points) => {
  if (!points || points.length === 0) {
    return { snappedPoints: [], provider: 'none', success: false };
  }

  let provider = process.env.ROAD_SNAP_PROVIDER || 'osrm'; // Default to OSRM since it doesn't need API key
  const googleApiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (provider === 'google' && !googleApiKey) {
    provider = 'osrm';
  }

  if (isRateLimited && provider === 'google') {
    console.log('[RoadSnap] Google API rate limited, trying OSRM candidates fallback...');
    return await fetchCandidatesWithOSRM(points);
  }

  try {
    if (provider === 'google') {
      const result = await fetchCandidatesWithGoogle(points);
      if (result.success) return result;

      console.log('[RoadSnap] Google nearestRoads failed, falling back to OSRM...');
      return await fetchCandidatesWithOSRM(points);
    } else if (provider === 'osrm') {
      return await fetchCandidatesWithOSRM(points);
    } else {
      return {
        snappedPoints: points.map(p => ({
          ...p,
          candidateRoads: [],
          snappedLatitude: null,
          snappedLongitude: null,
          provider: 'none',
          routeStatus: 'raw'
        })),
        provider: 'none',
        success: false
      };
    }
  } catch (err) {
    console.error('[RoadSnap] Candidates resolution failed:', err.message);
    return {
      snappedPoints: points.map(p => ({
        ...p,
        candidateRoads: [],
        snappedLatitude: null,
        snappedLongitude: null,
        provider: 'none',
        routeStatus: 'failed'
      })),
      provider: 'none',
      success: false
    };
  }
};

/**
 * Snap points using Google nearestRoads API to get candidate roads
 */
async function fetchCandidatesWithGoogle(points) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    console.warn('[RoadSnap] GOOGLE_MAPS_API_KEY not configured, skipping Google snapping');
    return { success: false, snappedPoints: [], provider: 'google' };
  }

  try {
    const allSnapped = [];
    const geoService = require('./geoTrackingService');

    // Process in batches of 100
    for (let i = 0; i < points.length; i += MAX_POINTS_PER_REQUEST) {
      const batch = points.slice(i, i + MAX_POINTS_PER_REQUEST);
      const pointsParam = batch
        .map(p => `${p.latitude},${p.longitude}`)
        .join('|');

      const response = await requestWithRetry('https://roads.googleapis.com/v1/nearestRoads', {
        points: pointsParam,
        key: apiKey
      }, 2, 400, 5000);

      if (response.data && response.data.snappedPoints) {
        const googleSnapped = response.data.snappedPoints;

        for (let j = 0; j < batch.length; j++) {
          const original = batch[j];
          const matches = googleSnapped.filter(sp => sp.originalIndex === j);

          const candidateRoads = matches.map(m => {
            const dist = geoService.calculateDistance(original.latitude, original.longitude, m.location.latitude, m.location.longitude) * 1000;
            return {
              placeId: m.placeId,
              roadName: `Road Segment (${m.placeId.substring(0, 6)})`,
              heading: null, // Google nearestRoads doesn't supply heading, will be computed in validation
              distance: parseFloat(dist.toFixed(1)),
              latitude: m.location.latitude,
              longitude: m.location.longitude
            };
          });

          // Sort candidates by proximity
          candidateRoads.sort((a, b) => a.distance - b.distance);

          allSnapped.push({
            ...original,
            ...toRawCoords(original),
            candidateRoads: candidateRoads.slice(0, 5),
            snappedLatitude: candidateRoads[0]?.latitude || null,
            snappedLongitude: candidateRoads[0]?.longitude || null,
            provider: 'google',
            routeStatus: candidateRoads.length > 0 ? 'snapped' : 'raw'
          });
        }
      } else {
        // Fallback to raw if no data returned
        batch.forEach(original => {
          allSnapped.push(rawFallbackPoint(original, 'google', 'raw'));
        });
      }
    }

    return {
      success: allSnapped.length > 0,
      snappedPoints: allSnapped,
      provider: 'google'
    };
  } catch (err) {
    if (err.response && err.response.status === 429) {
      handleRateLimit();
    }
    console.error('[RoadSnap] Google nearestRoads API error:', err.message);
    return { success: false, snappedPoints: [], provider: 'google' };
  }
}

/**
 * Snap a single GPS point using OSRM Nearest Service (/nearest/v1/driving/{lng},{lat})
 * Used when batches contain 1 coordinate (since /match requires at least 2 points)
 * or as a per-point fallback when /match returns NoSegment.
 */
async function fetchCandidatesWithOSRMNearest(point, heading = null) {
  const geoService = require('./geoTrackingService');
  const lng = point.rawLongitude ?? point.longitude;
  const lat = point.rawLatitude ?? point.latitude;

  if (lat == null || lng == null || isNaN(lat) || isNaN(lng)) {
    return rawFallbackPoint(point, 'osrm', 'raw');
  }

  const url = `https://router.project-osrm.org/nearest/v1/driving/${lng},${lat}`;
  const params = { number: 3 };
  if (typeof heading === 'number' && !isNaN(heading)) {
    params.bearings = `${Math.round(heading)},45`;
  }

  try {
    let response = null;
    try {
      response = await requestWithRetry(url, params, OSRM_RETRY_ATTEMPTS, OSRM_RETRY_BASE_DELAY_MS, 5000);
    } catch (headErr) {
      // Retry without bearings if bearings search failed
      response = await requestWithRetry(url, { number: 3 }, OSRM_RETRY_ATTEMPTS, OSRM_RETRY_BASE_DELAY_MS, 5000);
    }

    if (response && response.data && response.data.code === 'Ok' && response.data.waypoints && response.data.waypoints.length > 0) {
      const waypoints = response.data.waypoints;
      const candidateRoads = waypoints.map(wp => {
        const dist = geoService.calculateDistance(
          lat, lng,
          wp.location[1], wp.location[0]
        ) * 1000;
        return {
          placeId: wp.hint || `${wp.location[0].toFixed(5)}_${wp.location[1].toFixed(5)}`,
          roadName: wp.name || 'Unnamed Road',
          heading: null,
          distance: parseFloat(dist.toFixed(1)),
          latitude: wp.location[1],
          longitude: wp.location[0]
        };
      });

      return {
        ...point,
        ...toRawCoords(point),
        candidateRoads: candidateRoads.slice(0, 2),
        snappedLatitude: candidateRoads[0]?.latitude || null,
        snappedLongitude: candidateRoads[0]?.longitude || null,
        provider: 'osrm',
        routeStatus: candidateRoads.length > 0 ? 'snapped' : 'raw'
      };
    }
  } catch (err) {
    console.warn(`[RoadSnap] OSRM nearest API error for (${lat}, ${lng}): ${err.message}`);
  }
  return rawFallbackPoint(point, 'osrm', 'raw');
}

/**
 * Snap points using OSRM match service (BATCH API) to get candidate roads.
 * Uses /nearest for 1-point inputs and /match for multi-point trajectories.
 * Chunks requests (OSRM_CHUNK_SIZE), retries transient failures with backoff,
 * and gracefully returns raw GPS for unmatched points.
 */
async function fetchCandidatesWithOSRM(points) {
  try {
    const geoService = require('./geoTrackingService');
    const allSnapped = [];
    let anySnapped = false;

    // If only 1 point, use OSRM /nearest API (since /match requires at least 2 coordinates)
    if (points.length === 1) {
      const singleRes = await fetchCandidatesWithOSRMNearest(points[0]);
      return {
        snappedPoints: [singleRes],
        provider: 'osrm',
        success: singleRes.routeStatus === 'snapped'
      };
    }

    // Process in chunks to keep match requests small and reliable
    for (let i = 0; i < points.length; i += OSRM_CHUNK_SIZE) {
      const chunk = points.slice(i, i + OSRM_CHUNK_SIZE);

      if (chunk.length === 1) {
        const singleRes = await fetchCandidatesWithOSRMNearest(chunk[0]);
        if (singleRes.routeStatus === 'snapped') anySnapped = true;
        allSnapped.push(singleRes);
        continue;
      }

      // Build chunk coordinates: lng,lat;lng,lat;...
      const coordsParam = chunk
        .map(p => `${p.longitude},${p.latitude}`)
        .join(';');

      // Build timestamps for better matching accuracy
      const timestamps = chunk
        .map(p => Math.floor(new Date(p.timestamp || Date.now()).getTime() / 1000))
        .join(';');

      let response = null;
      try {
        response = await requestWithRetry(`${OSRM_MATCH_API}/${coordsParam}`, {
          timestamps: timestamps,
          geometries: 'geojson',
          overview: 'full',
          annotations: 'true'
        }, OSRM_RETRY_ATTEMPTS, OSRM_RETRY_BASE_DELAY_MS, 6000);
      } catch (matchErr) {
        const nearestResults = await Promise.all(chunk.map(pt => fetchCandidatesWithOSRMNearest(pt)));
        nearestResults.forEach(res => {
          if (res.routeStatus === 'snapped') anySnapped = true;
          allSnapped.push(res);
        });
        continue;
      }

      // 'NoSegment' / empty matchings — graceful parallel nearest fallback for the whole chunk
      if (!response || !response.data || response.data.code !== 'Ok' || !response.data.matchings || response.data.matchings.length === 0) {
        const nearestResults = await Promise.all(chunk.map(pt => fetchCandidatesWithOSRMNearest(pt)));
        nearestResults.forEach(res => {
          if (res.routeStatus === 'snapped') anySnapped = true;
          allSnapped.push(res);
        });
        continue;
      }

      const tracepoints = response.data.tracepoints || [];

      for (let j = 0; j < chunk.length; j++) {
        const original = chunk[j];
        const tracepoint = tracepoints[j];

        if (tracepoint && tracepoint.location) {
          const dist = geoService.calculateDistance(
            original.latitude, original.longitude,
            tracepoint.location[1], tracepoint.location[0]
          ) * 1000;

          const candidateRoads = [{
            placeId: tracepoint.hint || `${tracepoint.location[0].toFixed(5)}_${tracepoint.location[1].toFixed(5)}`,
            roadName: tracepoint.name || 'Unnamed Road',
            heading: null,
            distance: parseFloat(dist.toFixed(1)),
            latitude: tracepoint.location[1],
            longitude: tracepoint.location[0]
          }];

          anySnapped = true;
          allSnapped.push({
            ...original,
            ...toRawCoords(original),
            candidateRoads: candidateRoads.slice(0, 2), // Top 2 only (#10 fix)
            snappedLatitude: tracepoint.location[1],
            snappedLongitude: tracepoint.location[0],
            provider: 'osrm',
            routeStatus: 'snapped'
          });
        } else {
          // If tracepoint is null in match, try /nearest for this single point
          const fallbackNearest = await fetchCandidatesWithOSRMNearest(original);
          if (fallbackNearest.routeStatus === 'snapped') anySnapped = true;
          allSnapped.push(fallbackNearest);
        }
      }
    }

    return {
      snappedPoints: allSnapped,
      provider: 'osrm',
      success: anySnapped
    };
  } catch (err) {
    console.error('[RoadSnap] OSRM batch match API error:', err.message);
    return {
      snappedPoints: points.map(p => rawFallbackPoint(p, 'osrm', 'raw')),
      provider: 'osrm',
      success: false
    };
  }
}

/**
 * Snap points using Google Roads API
 * @param {Array} points - GPS points to snap
 * @returns {Object} { snappedPoints, provider, success }
 */
async function snapWithGoogle(points) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    console.warn('[RoadSnap] GOOGLE_MAPS_API_KEY not configured, skipping Google snap');
    return { snappedPoints: [], provider: 'google', success: false };
  }

  try {
    // Process in batches of 100 (API limit)
    const allSnapped = [];

    for (let i = 0; i < points.length; i += MAX_POINTS_PER_REQUEST) {
      const batch = points.slice(i, i + MAX_POINTS_PER_REQUEST);

      // Build path parameter: lat,lng|lat,lng|...
      const pathParam = batch
        .map(p => `${p.latitude},${p.longitude}`)
        .join('|');

      const startTime = Date.now();

      const response = await requestWithRetry(GOOGLE_ROADS_API, {
          path: pathParam,
          interpolate: true,
          key: apiKey
        }, 2, 400, 5000);

      const responseTime = Date.now() - startTime;
      console.log(`[RoadSnap] Google API: ${batch.length} points snapped (${responseTime}ms)`);

      if (response.data && response.data.snappedPoints) {
        // Map Google's response back to our points
        const googleSnapped = response.data.snappedPoints;

        for (let j = 0; j < batch.length; j++) {
          const original = batch[j];
          // Find the closest snapped point by originalIndex
          const snapped = googleSnapped.find(sp => sp.originalIndex === j);

          if (snapped) {
            allSnapped.push({
              ...original,
              ...toRawCoords(original),
              snappedLatitude: snapped.location.latitude,
              snappedLongitude: snapped.location.longitude,
              provider: 'google',
              routeStatus: 'snapped',
              placeId: snapped.placeId || null
            });
          } else {
            // No snap found for this point — keep raw
            allSnapped.push(rawFallbackPoint(original, 'google', 'raw'));
          }
        }
      } else {
        batch.forEach(original => allSnapped.push(rawFallbackPoint(original, 'google', 'raw')));
      }
    }

    return {
      snappedPoints: allSnapped,
      provider: 'google',
      success: allSnapped.length > 0
    };
  } catch (err) {
    if (err.response && err.response.status === 429) {
      // Rate limited — activate cooldown
      handleRateLimit();
    }
    console.error('[RoadSnap] Google API error:', err.message);
    return { snappedPoints: [], provider: 'google', success: false };
  }
}

/**
 * Snap points using OSRM Match Service (free, no API key needed)
 * @param {Array} points - GPS points to snap
 * @returns {Object} { snappedPoints, provider, success }
 */
async function snapWithOSRM(points) {
  try {
    if (!points || points.length === 0) {
      return { snappedPoints: [], provider: 'osrm', success: false };
    }

    if (points.length === 1) {
      const single = await fetchCandidatesWithOSRMNearest(points[0]);
      return {
        snappedPoints: [single],
        provider: 'osrm',
        success: single.routeStatus === 'snapped'
      };
    }

    // OSRM expects coordinates as lng,lat;lng,lat;...
    const coordsParam = points
      .map(p => `${p.longitude},${p.latitude}`)
      .join(';');

    // Build timestamps parameter (OSRM uses Unix timestamps for matching)
    const timestamps = points
      .map(p => Math.floor(new Date(p.timestamp).getTime() / 1000))
      .join(';');

    const startTime = Date.now();

    const response = await axios.get(`${OSRM_MATCH_API}/${coordsParam}`, {
      params: {
        timestamps: timestamps,
        geometries: 'geojson',
        overview: 'full',
        radiuses: points.map(() => '50').join(';'), // 50 meter matching radius
        annotations: 'true'
      },
      timeout: 5000
    });

    const responseTime = Date.now() - startTime;
    console.log(`[RoadSnap] OSRM API: ${points.length} points processed (${responseTime}ms)`);

    if (response.data && response.data.code === 'Ok' && response.data.matchings) {
      const allSnapped = [];
      const tracepoints = response.data.tracepoints || [];

      for (let i = 0; i < points.length; i++) {
        const original = points[i];
        const tracepoint = tracepoints[i];

        if (tracepoint && tracepoint.location) {
          allSnapped.push({
            ...original,
            ...toRawCoords(original),
            snappedLatitude: tracepoint.location[1], // OSRM returns [lng, lat]
            snappedLongitude: tracepoint.location[0],
            provider: 'osrm',
            routeStatus: 'snapped'
          });
        } else {
          allSnapped.push(rawFallbackPoint(original, 'osrm', 'raw'));
        }
      }

      return {
        snappedPoints: allSnapped,
        provider: 'osrm',
        success: allSnapped.some(p => p.routeStatus === 'snapped')
      };
    }

    return { snappedPoints: [], provider: 'osrm', success: false };
  } catch (err) {
    console.error('[RoadSnap] OSRM API error:', err.message);
    return { snappedPoints: [], provider: 'osrm', success: false };
  }
}

/**
 * Handle API rate limiting with cooldown period
 */
function handleRateLimit() {
  isRateLimited = true;
  console.warn(`[RoadSnap] Google API rate limited. Cooling down for ${RETRY_DELAY_MS / 1000}s`);

  if (rateLimitTimer) clearTimeout(rateLimitTimer);
  rateLimitTimer = setTimeout(() => {
    isRateLimited = false;
    console.log('[RoadSnap] Google API rate limit cooldown expired');
  }, RETRY_DELAY_MS);
}

/**
 * Calculate road distance using snapped coordinates
 * Falls back to Haversine if no snapped points
 * @param {Array} points - Array of snapped points
 * @returns {number} Distance in kilometers
 */
exports.calculateSnappedDistance = (points) => {
  if (!points || points.length < 2) return 0;

  let total = 0;
  const geoService = require('./geoTrackingService');

  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];

    // Prefer snapped coordinates, fallback to raw
    const lat1 = p1.snappedLatitude || p1.latitude || p1.rawLatitude;
    const lng1 = p1.snappedLongitude || p1.longitude || p1.rawLongitude;
    const lat2 = p2.snappedLatitude || p2.latitude || p2.rawLatitude;
    const lng2 = p2.snappedLongitude || p2.longitude || p2.rawLongitude;

    if (lat1 && lng1 && lat2 && lng2) {
      total += geoService.calculateDistance(lat1, lng1, lat2, lng2);
    }
  }

  return parseFloat(total.toFixed(6));
};

/**
 * Get current provider status
 * @returns {Object} { provider, rateLimited, available }
 */
exports.getProviderStatus = () => {
  // FIX #17: Default to 'osrm' to match snapToRoad() default
  const provider = process.env.ROAD_SNAP_PROVIDER || 'osrm';
  return {
    provider,
    rateLimited: isRateLimited,
    googleKeyConfigured: !!process.env.GOOGLE_MAPS_API_KEY,
    available: provider !== 'none'
  };
};
