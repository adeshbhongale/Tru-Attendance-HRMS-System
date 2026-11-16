const mongoose = require('mongoose');
const { RawTrackingPoint, TrackingLog } = require('../models/Tracking');
const DailyRouteSummary = require('../models/DailyRouteSummary');
const { getStartOfDayIST } = require('../utils/timezone');

let lastCleanupDate = null;
let isCleanupRunning = false;
let hasCompactedExistingSummaries = false;

const IST_OFFSET_MS = 5.5 * 3600 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const DELETE_BATCH_SIZE = 2000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const round6 = (n) => Math.round(Number(n) * 1e6) / 1e6;

/**
 * Align cutoff strictly to IST start-of-day (00:00:00.000 IST) so mid-day server
 * restarts never split a calendar day in half.
 */
const getRetentionCutoff = (now = new Date()) => {
  const retentionDays = Math.max(1, Number(process.env.RAW_TRACKING_RETENTION_DAYS || 2));
  const rawCutoff = new Date(now.getTime() - (retentionDays * DAY_MS));
  return getStartOfDayIST(rawCutoff);
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
 * Matches reports.js 5-minute IST bucket key so Detailed Activity Table rows
 * (including 0m stationary check-ins) stay 100% identical after compaction.
 */
const getFiveMinBucketKeyIST = (tsMs) => {
  const istTime = new Date(tsMs + IST_OFFSET_MS);
  const roundedMinutes = Math.floor(istTime.getUTCMinutes() / 5) * 5;
  return `${istTime.getUTCFullYear()}-${istTime.getUTCMonth()}-${istTime.getUTCDate()} ${istTime.getUTCHours()}:${roundedMinutes}`;
};

/**
 * Compact [lng, lat, timestampMs] route points:
 * - Preserves 6-decimal GPS coordinates (~0.11m precision, matching UI table)
 * - Always keeps first & last point of the day
 * - Keeps first point of every 5-minute IST bucket (preserves all Activity Table rows)
 * - Keeps every movement >= 15 meters (preserves full map polyline & distance)
 */
const compactRoutePoints = (tuples) => {
  if (!Array.isArray(tuples) || tuples.length === 0) return [];

  const valid = [];
  for (let i = 0; i < tuples.length; i++) {
    const pt = tuples[i];
    if (!Array.isArray(pt) || pt.length < 3) continue;
    const lng = Number(pt[0]);
    const lat = Number(pt[1]);
    const ts = Number(pt[2]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat) || !Number.isFinite(ts)) continue;
    if (Math.abs(lng) < 0.0001 && Math.abs(lat) < 0.0001) continue;
    valid.push([round6(lng), round6(lat), Math.round(ts)]);
  }

  if (valid.length === 0) return [];
  valid.sort((a, b) => a[2] - b[2]);

  const result = [];
  const seenBuckets = new Set();
  let lastKept = null;

  for (let i = 0; i < valid.length; i++) {
    const curr = valid[i];
    // Skip exact duplicate timestamp at virtually identical spot
    if (lastKept && Math.abs(curr[2] - lastKept[2]) < 1000 && haversineKm(lastKept[1], lastKept[0], curr[1], curr[0]) < 0.002) {
      if (i < valid.length - 1) continue;
    }

    const bucketKey = getFiveMinBucketKeyIST(curr[2]);
    const isFirst = result.length === 0;
    const isLast = i === valid.length - 1;
    const isNewBucket = !seenBuckets.has(bucketKey);
    const moved15m = lastKept ? haversineKm(lastKept[1], lastKept[0], curr[1], curr[0]) >= 0.015 : false;

    if (isFirst || isLast || isNewBucket || moved15m) {
      result.push(curr);
      seenBuckets.add(bucketKey);
      lastKept = curr;
    }
  }

  return result;
};

const computeRouteDistanceKm = (route) => {
  if (!Array.isArray(route) || route.length < 2) return 0;
  let totalDistance = 0;
  let [lastLng, lastLat] = route[0];
  for (let i = 1; i < route.length; i++) {
    const [lng2, lat2] = route[i];
    const stepKm = haversineKm(lastLat, lastLng, lat2, lng2);
    if (stepKm >= 0.015) {
      totalDistance += stepKm;
      lastLng = lng2;
      lastLat = lat2;
    }
  }
  return totalDistance;
};

const deleteIdsInBatches = async (Model, ids, batchSize = DELETE_BATCH_SIZE) => {
  let totalDeleted = 0;
  let batchCount = 0;
  for (let i = 0; i < ids.length; i += batchSize) {
    const chunk = ids.slice(i, i + batchSize);
    const res = await Model.deleteMany({ _id: { $in: chunk } });
    totalDeleted += res.deletedCount || 0;
    batchCount += 1;
    if (i + batchSize < ids.length) await sleep(30);
  }
  return { deletedCount: totalDeleted, batchCount };
};

const deleteOldRawTrackingPointsInBatches = async (cutoff, batchSize = DELETE_BATCH_SIZE) => {
  let totalDeleted = 0;
  let batchCount = 0;

  while (true) {
    const ids = await RawTrackingPoint.find(
      { timestamp: { $lt: cutoff } },
      { _id: 1 }
    )
      .sort({ timestamp: 1 })
      .limit(batchSize)
      .lean();

    if (!ids.length) break;

    const idList = ids.map((doc) => doc._id);
    const result = await RawTrackingPoint.deleteMany({ _id: { $in: idList } });
    totalDeleted += result.deletedCount || 0;
    batchCount += 1;

    if (idList.length < batchSize) break;
    await sleep(30);
  }

  return { deletedCount: totalDeleted, batchCount };
};

const getGeofenceViolationCount = (tuples, geofenceList, geofenceService) => {
  let violations = 0;
  for (const pt of tuples) {
    const check = geofenceService.checkPointGeofence(pt[1], pt[0], geofenceList);
    if (!check.isInside) violations += 1;
  }
  return violations;
};

const resolveCompanyIdSafe = async (companyId, userId, userCompanyCache) => {
  if (companyId) return companyId;
  if (!userId) return null;
  const key = userId.toString();
  if (userCompanyCache.has(key)) return userCompanyCache.get(key);
  try {
    const User = mongoose.models.User || require('../models/User');
    const u = await User.findById(userId).select('companyId company').lean();
    const resolved = u?.companyId || u?.company || null;
    userCompanyCache.set(key, resolved);
    return resolved;
  } catch (_) {
    return null;
  }
};

/**
 * Safely merges points into DailyRouteSummary and verifies persistence in MongoDB
 * BEFORE allowing caller to delete any source RawTrackingPoint / TrackingLog rows.
 */
const upsertVerifiedDailySummary = async ({
  companyId,
  userId,
  dayStart,
  newTuples,
  rawPointCount = 0,
  geofenceViolations = 0,
  isFallbackFromLog = false,
  userCompanyCache,
}) => {
  const resolvedCompanyId = await resolveCompanyIdSafe(companyId, userId, userCompanyCache);
  if (!resolvedCompanyId || !userId || !dayStart) {
    return { verified: false, reason: 'missing_identifiers' };
  }

  const existing = await DailyRouteSummary.findOne({
    companyId: resolvedCompanyId,
    userId,
    date: dayStart,
  }).lean();

  let combinedTuples = [];
  const hasExistingRoute = existing && Array.isArray(existing.route) && existing.route.length > 0;

  if (!hasExistingRoute) {
    combinedTuples = newTuples;
  } else if (isFallbackFromLog) {
    // Existing summary came from exact RawTrackingPoint timestamps — keep it intact
    // and only backfill any time window outside [exFirst - 60s, exLast + 60s].
    const exFirst = Number(existing.route[0][2]);
    const exLast = Number(existing.route[existing.route.length - 1][2]);
    const missingWindowTuples = newTuples.filter((pt) => pt[2] < exFirst - 60000 || pt[2] > exLast + 60000);
    if (missingWindowTuples.length === 0) {
      const compactedExisting = compactRoutePoints(existing.route);
      if (compactedExisting.length > 0 && compactedExisting.length < existing.route.length) {
        await DailyRouteSummary.updateOne(
          { _id: existing._id },
          { $set: { route: compactedExisting, pointCount: compactedExisting.length } }
        );
      }
      return { verified: true, skippedWrite: true };
    }
    combinedTuples = [...existing.route, ...missingWindowTuples];
  } else {
    combinedTuples = [...existing.route, ...newTuples];
  }

  const compacted = compactRoutePoints(combinedTuples);
  if (compacted.length === 0) {
    // Only safe to delete source docs if they genuinely contained zero valid coordinates
    if (newTuples.length === 0 && !hasExistingRoute) {
      return { verified: true, emptySource: true };
    }
    return { verified: false, reason: 'empty_compaction' };
  }

  const firstCheckIn = new Date(compacted[0][2]);
  const lastCheckOut = new Date(compacted[compacted.length - 1][2]);
  const workingHours = Number(((lastCheckOut.getTime() - firstCheckIn.getTime()) / (60 * 60 * 1000)).toFixed(2));
  const computedDist = computeRouteDistanceKm(compacted);
  const totalDistance = parseFloat(Math.max(existing?.totalDistance || 0, computedDist).toFixed(4));
  const finalViolations = Math.max(existing?.geofenceViolations || 0, geofenceViolations || 0);
  const finalTotalPoints = Math.max(existing?.totalGpsPoints || 0, rawPointCount || compacted.length);

  const saved = await DailyRouteSummary.findOneAndUpdate(
    {
      companyId: resolvedCompanyId,
      userId,
      date: dayStart,
    },
    {
      $set: {
        companyId: resolvedCompanyId,
        userId,
        date: dayStart,
        firstCheckIn,
        lastCheckOut,
        totalDistance,
        workingHours,
        geofenceViolations: finalViolations,
        totalGpsPoints: finalTotalPoints,
        route: compacted,
        pointCount: compacted.length,
      },
    },
    { upsert: true, new: true }
  ).select('_id pointCount').lean();

  const verified = Boolean(saved && saved._id && saved.pointCount > 0);
  return { verified };
};

/**
 * Process RawTrackingPoint one IST calendar day at a time (bounded memory)
 * and delete ONLY groups whose DailyRouteSummary was verified on disk.
 */
const summarizeAndCleanupRawPoints = async (cutoff, geofenceService, userCompanyCache) => {
  let totalDeleted = 0;
  let summarizedDays = 0;
  let failedGroups = 0;
  let cursorTime = new Date(0);

  while (cursorTime < cutoff) {
    const oldest = await RawTrackingPoint.findOne({
      timestamp: { $gte: cursorTime, $lt: cutoff },
    }).sort({ timestamp: 1 }).select('timestamp').lean();

    if (!oldest || !oldest.timestamp) break;

    const windowStart = getStartOfDayIST(new Date(oldest.timestamp));
    const nextDayProbe = new Date(windowStart.getTime() + 36 * 3600 * 1000);
    const rawWindowEnd = getStartOfDayIST(nextDayProbe);
    const windowEnd = rawWindowEnd <= windowStart ? new Date(windowStart.getTime() + DAY_MS) : rawWindowEnd;
    const boundedEnd = windowEnd < cutoff ? windowEnd : cutoff;

    const points = await RawTrackingPoint.find({
      timestamp: { $gte: windowStart, $lt: boundedEnd },
    })
      .select('_id companyId userId rawLatitude rawLongitude snappedLatitude snappedLongitude location timestamp')
      .sort({ timestamp: 1 })
      .lean();

    const groups = new Map();
    for (const p of points) {
      if (!p.userId) continue;
      const dayStart = getStartOfDayIST(new Date(p.timestamp));
      const cKey = p.companyId ? p.companyId.toString() : 'none';
      const uKey = p.userId.toString();
      const key = `${cKey}::${uKey}::${dayStart.getTime()}`;
      if (!groups.has(key)) {
        groups.set(key, { companyId: p.companyId, userId: p.userId, dayStart, ids: [], tuples: [] });
      }
      const g = groups.get(key);
      g.ids.push(p._id);
      const lng = p.snappedLongitude ?? p.rawLongitude ?? p.location?.coordinates?.[0];
      const lat = p.snappedLatitude ?? p.rawLatitude ?? p.location?.coordinates?.[1];
      const ts = new Date(p.timestamp).getTime();
      if (lng != null && lat != null && Number.isFinite(ts)) {
        g.tuples.push([Number(lng), Number(lat), ts]);
      }
    }

    const verifiedIds = [];
    for (const [key, g] of groups.entries()) {
      try {
        const resolvedComp = await resolveCompanyIdSafe(g.companyId, g.userId, userCompanyCache);
        const geofenceList = resolvedComp
          ? await geofenceService.resolveUserGeofences(g.userId, resolvedComp)
          : [];
        const violations = g.tuples.length > 0
          ? getGeofenceViolationCount(g.tuples, geofenceList, geofenceService)
          : 0;

        const check = await upsertVerifiedDailySummary({
          companyId: resolvedComp,
          userId: g.userId,
          dayStart: g.dayStart,
          newTuples: g.tuples,
          rawPointCount: g.tuples.length,
          geofenceViolations: violations,
          isFallbackFromLog: false,
          userCompanyCache,
        });

        if (check.verified) {
          verifiedIds.push(...g.ids);
          summarizedDays += 1;
        } else {
          failedGroups += 1;
        }
      } catch (err) {
        failedGroups += 1;
        console.error(`[TrackingCleanup] RawPoint summary failed for ${key}:`, err.message);
      }
    }

    if (verifiedIds.length > 0) {
      const del = await deleteIdsInBatches(RawTrackingPoint, verifiedIds);
      totalDeleted += del.deletedCount;
    }

    cursorTime = boundedEnd;
    await sleep(40);
  }

  return { deletedCount: totalDeleted, summarizedDays, failedGroups };
};

/**
 * Stream TrackingLog one IST calendar day at a time using a MongoDB cursor (O(1) memory),
 * backfill/merge into DailyRouteSummary so Detailed Activity Table & Map retain 100% of
 * historical logs, and delete ONLY verified days in small batches.
 */
const summarizeAndCleanupTrackingLogs = async (cutoff, geofenceService, userCompanyCache) => {
  let totalDeleted = 0;
  let backfilledDays = 0;
  let failedGroups = 0;
  let cursorTime = new Date(0);

  while (cursorTime < cutoff) {
    const oldest = await TrackingLog.findOne({
      createdAt: { $gte: cursorTime, $lt: cutoff },
    }).sort({ createdAt: 1 }).select('createdAt').lean();

    if (!oldest || !oldest.createdAt) break;

    const windowStart = getStartOfDayIST(new Date(oldest.createdAt));
    const nextDayProbe = new Date(windowStart.getTime() + 36 * 3600 * 1000);
    const rawWindowEnd = getStartOfDayIST(nextDayProbe);
    const windowEnd = rawWindowEnd <= windowStart ? new Date(windowStart.getTime() + DAY_MS) : rawWindowEnd;
    const boundedEnd = windowEnd < cutoff ? windowEnd : cutoff;

    const groups = new Map();
    const cursor = TrackingLog.find({
      createdAt: { $gte: windowStart, $lt: boundedEnd },
    })
      .select('_id companyId userId startTime endTime createdAt path snappedPath startLocation endLocation')
      .sort({ createdAt: 1 })
      .lean()
      .cursor({ batchSize: 1000 });

    for await (const log of cursor) {
      if (!log.userId) continue;
      const baseTime = new Date(log.startTime || log.createdAt);
      if (!Number.isFinite(baseTime.getTime()) || baseTime >= cutoff) continue;

      const dayStart = getStartOfDayIST(baseTime);
      if (dayStart >= cutoff) continue;

      const cKey = log.companyId ? log.companyId.toString() : 'none';
      const uKey = log.userId.toString();
      const key = `${cKey}::${uKey}::${dayStart.getTime()}`;

      if (!groups.has(key)) {
        groups.set(key, { companyId: log.companyId, userId: log.userId, dayStart, ids: [], tuples: [], rawCount: 0 });
      }
      const g = groups.get(key);
      g.ids.push(log._id);

      let coords = (Array.isArray(log.snappedPath) && log.snappedPath.length > 0)
        ? log.snappedPath
        : (Array.isArray(log.path) && log.path.length > 0 ? log.path : []);

      if (coords.length === 0 && log.startLocation?.coordinates?.length >= 2) {
        coords = [log.startLocation.coordinates];
        if (log.endLocation?.coordinates?.length >= 2) {
          coords.push(log.endLocation.coordinates);
        }
      }

      const startMs = baseTime.getTime();
      const rawEndMs = log.endTime ? new Date(log.endTime).getTime() : startMs;
      const endMs = Number.isFinite(rawEndMs) && rawEndMs >= startMs ? rawEndMs : startMs;
      const n = coords.length;

      for (let i = 0; i < n; i++) {
        const c = coords[i];
        if (!Array.isArray(c) || c.length < 2 || c[0] == null || c[1] == null) continue;
        const ts = n === 1 ? startMs : Math.round(startMs + (i / (n - 1)) * (endMs - startMs));
        g.tuples.push([Number(c[0]), Number(c[1]), ts]);
        g.rawCount += 1;
      }

      // Periodically compact large in-memory tuple buffers so a busy day stays tiny in RAM
      if (g.tuples.length > 5000) {
        g.tuples = compactRoutePoints(g.tuples);
      }
    }

    const verifiedIds = [];
    for (const [key, g] of groups.entries()) {
      try {
        const resolvedComp = await resolveCompanyIdSafe(g.companyId, g.userId, userCompanyCache);
        const compactedTuples = compactRoutePoints(g.tuples);
        const geofenceList = resolvedComp
          ? await geofenceService.resolveUserGeofences(g.userId, resolvedComp)
          : [];
        const violations = compactedTuples.length > 0
          ? getGeofenceViolationCount(compactedTuples, geofenceList, geofenceService)
          : 0;

        const check = await upsertVerifiedDailySummary({
          companyId: resolvedComp,
          userId: g.userId,
          dayStart: g.dayStart,
          newTuples: compactedTuples,
          rawPointCount: g.rawCount,
          geofenceViolations: violations,
          isFallbackFromLog: true,
          userCompanyCache,
        });

        if (check.verified) {
          verifiedIds.push(...g.ids);
          if (!check.skippedWrite && !check.emptySource) backfilledDays += 1;
        } else {
          failedGroups += 1;
        }
      } catch (err) {
        failedGroups += 1;
        console.error(`[TrackingCleanup] TrackingLog backfill failed for ${key}:`, err.message);
      }
    }

    if (verifiedIds.length > 0) {
      const del = await deleteIdsInBatches(TrackingLog, verifiedIds);
      totalDeleted += del.deletedCount;
    }

    cursorTime = boundedEnd;
    await sleep(50);
  }

  return { deletedCount: totalDeleted, backfilledDays, failedGroups };
};

/**
 * One-time safe compaction of existing bloated DailyRouteSummary docs (~42 KB -> ~2 KB)
 * without deleting any summary document or losing any 5-minute table bucket / >=15m move.
 */
const compactExistingSummariesOnce = async () => {
  if (hasCompactedExistingSummaries) return 0;
  let compactedDocs = 0;
  try {
    const cursor = DailyRouteSummary.find({ pointCount: { $gt: 120 } })
      .select('_id route pointCount')
      .lean()
      .cursor({ batchSize: 100 });

    for await (const doc of cursor) {
      if (!Array.isArray(doc.route) || doc.route.length <= 2) continue;
      const compacted = compactRoutePoints(doc.route);
      if (compacted.length > 0 && compacted.length < doc.route.length) {
        await DailyRouteSummary.updateOne(
          { _id: doc._id },
          { $set: { route: compacted, pointCount: compacted.length } }
        );
        compactedDocs += 1;
      }
    }
    hasCompactedExistingSummaries = true;
  } catch (err) {
    console.warn('[TrackingCleanup] Existing summary compaction notice:', err.message);
  }
  return compactedDocs;
};

/**
 * Summarize old RawTrackingPoint + TrackingLog into compact DailyRouteSummary documents
 * and delete verified old records in small non-blocking batches.
 */
const summarizeAndDeleteOldPoints = async () => {
  if (isCleanupRunning) {
    return { skipped: true, reason: 'Cleanup already in progress' };
  }

  // Wait briefly if Mongoose is still establishing initial connection on startup
  if (mongoose.connection.readyState !== 1) {
    for (let i = 0; i < 15 && mongoose.connection.readyState !== 1; i++) {
      await sleep(1000);
    }
    if (mongoose.connection.readyState !== 1) {
      return { skipped: true, reason: 'Database not connected yet' };
    }
  }

  isCleanupRunning = true;
  try {
    const now = new Date();
    const cutoff = getRetentionCutoff(now);
    const todayStartIST = getStartOfDayIST(now);
    const todayStr = todayStartIST.toISOString().split('T')[0];

    if (lastCleanupDate === todayStr) {
      return { skipped: true, reason: 'Already cleaned up today' };
    }

    const geofenceService = require('./geofenceService');
    const userCompanyCache = new Map();

    const rawRes = await summarizeAndCleanupRawPoints(cutoff, geofenceService, userCompanyCache);
    const logRes = await summarizeAndCleanupTrackingLogs(cutoff, geofenceService, userCompanyCache);
    const compactedSummaries = await compactExistingSummariesOnce();

    if (rawRes.failedGroups === 0 && logRes.failedGroups === 0) {
      lastCleanupDate = todayStr;
    }

    console.log(
      `[TrackingCleanup] Completed (cutoff < ${cutoff.toISOString()}): ` +
      `rawDeleted=${rawRes.deletedCount} (${rawRes.summarizedDays} user-days), ` +
      `trackingLogsDeleted=${logRes.deletedCount} (${logRes.backfilledDays} backfilled user-days), ` +
      `compactedSummaries=${compactedSummaries}`
    );

    return {
      success: true,
      cutoff: cutoff.toISOString(),
      date: todayStr,
      deletedCount: rawRes.deletedCount,
      summarizedDays: rawRes.summarizedDays,
      trackingLogsDeleted: logRes.deletedCount,
      trackingLogsBackfilledDays: logRes.backfilledDays,
      compactedSummaries,
    };
  } catch (err) {
    console.error('[TrackingCleanup] Error in summarizeAndDeleteOldPoints:', err.message);
    return { success: false, error: err.message };
  } finally {
    isCleanupRunning = false;
  }
};

/**
 * Check if cleanup should run (call frequently, e.g. every 60 seconds).
 * Runs once per day after midnight IST.
 */
const checkAndRunCleanup = async () => {
  try {
    const now = new Date();
    const istNow = new Date(now.getTime() + IST_OFFSET_MS);
    const istHour = istNow.getUTCHours();

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
  deleteOldRawTrackingPointsInBatches,
  compactRoutePoints,
  getRetentionCutoff,
};
