const { RawTrackingPoint } = require('../models/Tracking');
const DailyRouteSummary = require('../models/DailyRouteSummary');
const { getStartOfDayIST } = require('../utils/timezone');

let lastCleanupDate = null;

/**
 * Summarize raw tracking points into compact DailyRouteSummary documents
 * before deletion. Groups by companyId + userId + day.
 */
const summarizeAndDeleteOldPoints = async () => {
  try {
    const now = new Date();
    const todayStartIST = getStartOfDayIST(now);

    // Only run once per day
    const todayStr = todayStartIST.toISOString().split('T')[0];
    if (lastCleanupDate === todayStr) {
      return { skipped: true, reason: 'Already cleaned up today' };
    }

    // Find all raw points from before today
    const oldPoints = await RawTrackingPoint.find({
      timestamp: { $lt: todayStartIST }
    }).sort('timestamp').lean();

    if (oldPoints.length === 0) {
      lastCleanupDate = todayStr;
      console.log(`[TrackingCleanup] No old raw tracking points to clean up.`);
      return { success: true, deletedCount: 0, summarizedDays: 0 };
    }

    // Group points by companyId + userId + day
    const groups = {};
    for (const point of oldPoints) {
      const companyId = point.companyId ? point.companyId.toString() : 'unknown';
      const userId = point.userId ? point.userId.toString() : 'unknown';
      const dayStart = getStartOfDayIST(new Date(point.timestamp));
      const dayKey = `${companyId}::${userId}::${dayStart.toISOString()}`;

      if (!groups[dayKey]) {
        groups[dayKey] = {
          companyId: point.companyId,
          userId: point.userId,
          date: dayStart,
          points: [],
        };
      }
      groups[dayKey].points.push(point);
    }

    // Create compact DailyRouteSummary for each group
    const geofenceService = require('./geofenceService');
    let summarizedDays = 0;
    for (const key of Object.keys(groups)) {
      const group = groups[key];
      try {
        const geofenceList = await geofenceService.resolveUserGeofences(group.userId, group.companyId);

        // Filter points to strictly OUTSIDE geofence
        const outsidePoints = group.points.filter(p => {
          const lat = p.snappedLatitude || p.rawLatitude || (p.location?.coordinates?.[1]);
          const lng = p.snappedLongitude || p.rawLongitude || (p.location?.coordinates?.[0]);
          if (lat == null || lng == null) return false;
          const check = geofenceService.checkPointGeofence(lat, lng, geofenceList);
          return !check.isInside;
        });

        // Build compact route array: [longitude, latitude, timestampMs]
        // Use snapped coordinates where available, fall back to raw
        const route = outsidePoints.map(p => {
          const lng = p.snappedLongitude || p.rawLongitude || (p.location?.coordinates?.[0]) || 0;
          const lat = p.snappedLatitude || p.rawLatitude || (p.location?.coordinates?.[1]) || 0;
          const ts = new Date(p.timestamp).getTime();
          return [lng, lat, ts];
        });

        // Calculate total distance (simple haversine between consecutive outside points)
        let totalDistance = 0;
        for (let i = 1; i < route.length; i++) {
          const [lng1, lat1] = route[i - 1];
          const [lng2, lat2] = route[i];
          totalDistance += haversineKm(lat1, lng1, lat2, lng2);
        }

        // Upsert the summary (in case partial data exists from a previous failed run)
        await DailyRouteSummary.findOneAndUpdate(
          {
            companyId: group.companyId,
            userId: group.userId,
            date: group.date,
          },
          {
            companyId: group.companyId,
            userId: group.userId,
            date: group.date,
            route,
            totalDistance: parseFloat(totalDistance.toFixed(4)),
            pointCount: route.length,
          },
          { upsert: true, new: true }
        );
        summarizedDays++;
      } catch (upsertErr) {
        console.error(`[TrackingCleanup] Failed to summarize group ${key}:`, upsertErr.message);
      }
    }

    // Now delete the old raw points
    const result = await RawTrackingPoint.deleteMany({
      timestamp: { $lt: todayStartIST }
    });

    lastCleanupDate = todayStr;
    console.log(`[TrackingCleanup] Summarized ${summarizedDays} user-days, deleted ${result.deletedCount} raw points older than ${todayStr}`);

    return { success: true, deletedCount: result.deletedCount, summarizedDays, date: todayStr };
  } catch (err) {
    console.error('[TrackingCleanup] Error in summarizeAndDeleteOldPoints:', err.message);
    return { success: false, error: err.message };
  }
};

/**
 * Simple Haversine distance in KM
 */
const haversineKm = (lat1, lng1, lat2, lng2) => {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

/**
 * Check if cleanup should run (call this frequently, e.g. every 60 seconds).
 * It will only actually run once per day after midnight IST.
 */
const checkAndRunCleanup = async () => {
  try {
    const now = new Date();
    // IST is UTC+5:30
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istNow = new Date(now.getTime() + istOffset);
    const istHour = istNow.getUTCHours();

    // Run cleanup between midnight and 1am IST
    if (istHour === 0) {
      await summarizeAndDeleteOldPoints();
    }
  } catch (err) {
    console.error('[TrackingCleanup] checkAndRunCleanup error:', err.message);
  }
};

module.exports = {
  summarizeAndDeleteOldPoints,
  checkAndRunCleanup,
};
