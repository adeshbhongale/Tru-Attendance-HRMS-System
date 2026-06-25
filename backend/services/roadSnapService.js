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

      const response = await axios.get('https://roads.googleapis.com/v1/nearestRoads', {
        params: {
          points: pointsParam,
          key: apiKey
        },
        timeout: 5000
      });

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
            rawLatitude: original.latitude,
            rawLongitude: original.longitude,
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
          allSnapped.push({
            ...original,
            rawLatitude: original.latitude,
            rawLongitude: original.longitude,
            candidateRoads: [],
            snappedLatitude: null,
            snappedLongitude: null,
            provider: 'google',
            routeStatus: 'raw'
          });
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
 * Snap points using OSRM nearest service to get candidate roads
 */
async function fetchCandidatesWithOSRM(points) {
  try {
    const geoService = require('./geoTrackingService');

    const promises = points.map(async (original) => {
      const url = `https://router.project-osrm.org/nearest/v1/driving/${original.longitude},${original.latitude}`;
      try {
        const response = await axios.get(url, {
          params: {
            number: 5
          },
          timeout: 3000 // Increased timeout per point to 3 seconds
        });

        if (response.data && response.data.code === 'Ok' && response.data.waypoints) {
          const waypoints = response.data.waypoints;

          const candidateRoads = waypoints.map(w => {
            const dist = geoService.calculateDistance(original.latitude, original.longitude, w.location[1], w.location[0]) * 1000;
            return {
              placeId: w.hint || `${w.location[0].toFixed(5)}_${w.location[1].toFixed(5)}`,
              roadName: w.name || 'Unnamed Road',
              heading: null, // heading will be validated against route history
              distance: parseFloat(dist.toFixed(1)),
              latitude: w.location[1],
              longitude: w.location[0]
            };
          });

          candidateRoads.sort((a, b) => a.distance - b.distance);

          return {
            ...original,
            rawLatitude: original.latitude,
            rawLongitude: original.longitude,
            candidateRoads: candidateRoads.slice(0, 5),
            snappedLatitude: candidateRoads[0]?.latitude || null,
            snappedLongitude: candidateRoads[0]?.longitude || null,
            provider: 'osrm',
            routeStatus: candidateRoads.length > 0 ? 'snapped' : 'raw'
          };
        }
      } catch (err) {
        // Individual point query failed, log it but continue
        console.warn(`[RoadSnap] OSRM nearest failed for point (${original.latitude}, ${original.longitude}):`, err.message);
      }

      // If snapping failed for this point, return raw
      return {
        ...original,
        rawLatitude: original.latitude,
        rawLongitude: original.longitude,
        candidateRoads: [],
        snappedLatitude: null,
        snappedLongitude: null,
        provider: 'osrm',
        routeStatus: 'raw'
      };
    });

    const allSnapped = await Promise.all(promises);
    return {
      snappedPoints: allSnapped,
      provider: 'osrm',
      success: true
    };
  } catch (err) {
    console.error('[RoadSnap] OSRM candidates API error (batch):', err.message);
    // Fallback to raw points for entire batch
    return {
      snappedPoints: points.map(p => ({
        ...p,
        rawLatitude: p.latitude,
        rawLongitude: p.longitude,
        candidateRoads: [],
        snappedLatitude: null,
        snappedLongitude: null,
        provider: 'osrm',
        routeStatus: 'raw'
      })),
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
