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
const RETRY_DELAY_MS = 60000; // 1 minute retry on rate limit

let isRateLimited = false;
let rateLimitTimer = null;

/**
 * Snap an array of GPS points to the nearest road
 * @param {Array} points - Array of { latitude, longitude, timestamp }
 * @returns {Object} { snappedPoints, provider, success }
 */
exports.snapToRoad = async (points) => {
  if (!points || points.length === 0) {
    return { snappedPoints: [], provider: 'none', success: false };
  }

  const provider = process.env.ROAD_SNAP_PROVIDER || 'google';

  // If rate limited, use fallback or return raw
  if (isRateLimited && provider === 'google') {
    console.log('[RoadSnap] Google API rate limited, trying OSRM fallback...');
    return await snapWithOSRM(points);
  }

  try {
    if (provider === 'google') {
      const result = await snapWithGoogle(points);
      if (result.success) return result;

      // Fallback to OSRM if Google fails
      console.log('[RoadSnap] Google failed, falling back to OSRM...');
      return await snapWithOSRM(points);
    } else if (provider === 'osrm') {
      return await snapWithOSRM(points);
    } else {
      // Provider is 'none' — skip snapping
      return {
        snappedPoints: points.map(p => ({
          ...p,
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
    console.error('[RoadSnap] All providers failed:', err.message);
    return {
      snappedPoints: points.map(p => ({
        ...p,
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

      const response = await axios.get(GOOGLE_ROADS_API, {
        params: {
          path: pathParam,
          interpolate: true,
          key: apiKey
        },
        timeout: 5000
      });

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
              rawLatitude: original.latitude,
              rawLongitude: original.longitude,
              snappedLatitude: snapped.location.latitude,
              snappedLongitude: snapped.location.longitude,
              provider: 'google',
              routeStatus: 'snapped',
              placeId: snapped.placeId || null
            });
          } else {
            // No snap found for this point — keep raw
            allSnapped.push({
              ...original,
              rawLatitude: original.latitude,
              rawLongitude: original.longitude,
              snappedLatitude: null,
              snappedLongitude: null,
              provider: 'google',
              routeStatus: 'raw'
            });
          }
        }
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
            rawLatitude: original.latitude,
            rawLongitude: original.longitude,
            snappedLatitude: tracepoint.location[1], // OSRM returns [lng, lat]
            snappedLongitude: tracepoint.location[0],
            provider: 'osrm',
            routeStatus: 'snapped'
          });
        } else {
          allSnapped.push({
            ...original,
            rawLatitude: original.latitude,
            rawLongitude: original.longitude,
            snappedLatitude: null,
            snappedLongitude: null,
            provider: 'osrm',
            routeStatus: 'raw'
          });
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
  const provider = process.env.ROAD_SNAP_PROVIDER || 'google';
  return {
    provider,
    rateLimited: isRateLimited,
    googleKeyConfigured: !!process.env.GOOGLE_MAPS_API_KEY,
    available: provider !== 'none'
  };
};
