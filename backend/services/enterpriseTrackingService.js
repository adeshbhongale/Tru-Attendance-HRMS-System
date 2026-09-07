const { RawTrackingPoint, TrackingSession, TrackingLog, LiveEmployeeStatus } = require('../models/Tracking');
const geoService = require('./geoTrackingService');
const gpsFilter = require('./gpsFilterService');
const roadSnap = require('./roadSnapService');
const { reverseGeocodeLatLng } = require('../utils/googleMaps');
const Attendance = require('../models/Attendance');
const geofenceService = require('./geofenceService');
const cache = require('./trackingCache');

/**
 * Enterprise Tracking Service
 * Handles high-fidelity tracking pipeline:
 * Receive → Validate → GPS Filter → Road Snap → Save → Broadcast
 * 
 * KEY DESIGN DECISIONS (2026-06-30 Comprehensive Fix):
 * 1. Attendance stores ONLY summary fields (totalDistance, lastTrackedLocation, etc.)
 *    All GPS points live exclusively in RawTrackingPoint collection.
 * 2. Attendance updates use atomic $inc/$set — no full-document read-modify-write.
 * 3. Distance is calculated incrementally per-batch, not from historical points.
 * 4. Cross-day transitions produce a fresh segment (no straight line to yesterday).
 * 5. Aggregation uses immediate DB write, not in-memory setTimeout buffer.
 * 6. Distance units: KM in Attendance/LiveEmployeeStatus, meters in per-point.
 */

/**
 * Shared helper: Calculate stops and speed from an array of raw points.
 * Used by both enterprise tracking and reports controller.
 * @param {Array} rawPoints - Array of RawTrackingPoint documents
 * @returns {Object} { stops, avgSpeedKmh, maxSpeedKmh }
 */
exports.calculateStopsAndSpeed = (rawPoints) => {
  let stopsCount = 0;
  let idleStart = null;
  for (const point of rawPoints) {
    const speedKmh = (point.speed || 0) * 3.6;
    if (speedKmh < 1) {
      if (!idleStart) idleStart = new Date(point.timestamp);
    } else {
      if (idleStart) {
        const idleDuration = (new Date(point.timestamp) - idleStart) / 60000;
        if (idleDuration >= 2) stopsCount++;
        idleStart = null;
      }
    }
  }

  const speeds = rawPoints.map(p => p.speed || 0).filter(s => s > 0);
  const avgSpeedMs = speeds.length > 0 ? speeds.reduce((a, b) => a + b, 0) / speeds.length : 0;
  const maxSpeedMs = speeds.length > 0 ? Math.max(...speeds) : 0;

  return {
    stops: stopsCount,
    avgSpeedKmh: parseFloat((avgSpeedMs * 3.6).toFixed(1)),
    maxSpeedKmh: parseFloat((maxSpeedMs * 3.6).toFixed(1))
  };
};

exports.processTrackingBatch = async (userId, batch, socketIo, companyId = null) => {
  if (!batch || batch.length === 0) return { success: true, pointsProcessed: 0 };

  const mongoose = require('mongoose');
  
  // Convert string userId to ObjectId-compatible format
  const resolvedUserId = typeof userId === 'string' ? userId.trim() : userId;
  
  if (!resolvedUserId || !mongoose.Types.ObjectId.isValid(resolvedUserId)) {
    console.error('[EnterpriseTracking] Invalid or missing userId for tracking batch:', resolvedUserId);
    return { success: false, error: 'Invalid userId' };
  }

  try {
    console.log(`[EnterpriseTracking] Processing batch: ${batch.length} points for user ${resolvedUserId}`);

    // CACHE: User lookup (was: User.findById → 1 MongoDB query, now: in-memory, TTL 5 min)
    const user = await cache.getUser(resolvedUserId);
    const resolvedCompanyId = companyId || user?.companyId || user?.company;
    if (!resolvedCompanyId) return { success: false, error: 'Company context missing' };

    // Check if tracking is disabled for this user via MobileAppConfig.trackingControl
    try {
      const { getEffectiveLevelNumber, getEffectiveCategory } = require('../middleware/rbac');

      // CACHE: MobileAppConfig lookup (was: MobileAppConfig.findOne → 1 query, now: in-memory, TTL 5 min)
      const config = await cache.getConfig(resolvedCompanyId);
      if (config && config.trackingControl && user) {
        let userLevel = user.levelRef;
        // Level is already populated via cache.getUser(), no extra query needed

        let userLevelNumber = null;
        if (userLevel?.levelNumber != null) {
          userLevelNumber = Number(userLevel.levelNumber);
        } else if (user.roleLevel != null && user.roleLevel >= 1) {
          userLevelNumber = Number(user.roleLevel);
        } else {
          const lvl = getEffectiveLevelNumber(user);
          if (lvl && lvl !== 99) userLevelNumber = Number(lvl);
        }

        // Check blocked levels (e.g. L1, L2, L3, L4)
        if (config.trackingControl.blockedLevels && config.trackingControl.blockedLevels.length > 0 && userLevelNumber != null) {
          if (config.trackingControl.blockedLevels.map(Number).includes(userLevelNumber)) {
            console.log(`[EnterpriseTracking] Tracking is disabled for user ${resolvedUserId} (Level L${userLevelNumber}). Discarding points.`);
            return { success: true, pointsProcessed: 0, trackingDisabled: true };
          }
        }

        // Check blocked categories (e.g. DIRECTOR, MANAGEMENT)
        const userCat = userLevel?.category || getEffectiveCategory(user) || user.effectiveCategory;
        if (config.trackingControl.blockedCategories && config.trackingControl.blockedCategories.length > 0 && userCat) {
          if (config.trackingControl.blockedCategories.map(c => String(c).toUpperCase()).includes(String(userCat).toUpperCase())) {
            console.log(`[EnterpriseTracking] Tracking is disabled for user ${resolvedUserId} (Category ${userCat}). Discarding points.`);
            return { success: true, pointsProcessed: 0, trackingDisabled: true };
          }
        }

        // Check blocked role codes
        if (config.trackingControl.blockedRoleCodes && config.trackingControl.blockedRoleCodes.length > 0 && user.roleCode) {
          if (config.trackingControl.blockedRoleCodes.map(r => String(r).toUpperCase()).includes(String(user.roleCode).toUpperCase())) {
            console.log(`[EnterpriseTracking] Tracking is disabled for user ${resolvedUserId} (RoleCode ${user.roleCode}). Discarding points.`);
            return { success: true, pointsProcessed: 0, trackingDisabled: true };
          }
        }

        // Check blocked specific employees
        if (config.trackingControl.blockedEmployees && config.trackingControl.blockedEmployees.length > 0) {
          const empIds = config.trackingControl.blockedEmployees.map(id => (id._id || id.id || id).toString());
          if (empIds.includes(resolvedUserId.toString())) {
            console.log(`[EnterpriseTracking] Tracking is disabled for specific user ${resolvedUserId}. Discarding points.`);
            return { success: true, pointsProcessed: 0, trackingDisabled: true };
          }
        }
      }
    } catch (guardErr) {
      console.warn('[EnterpriseTracking] Tracking control check notice:', guardErr.message);
    }

    // CACHE: Geofence resolution (was: User.findById + Location.find + CompanySetting.findOne → 2-3 queries, now: in-memory, TTL 5 min)
    const geofenceList = await cache.getGeofences(resolvedUserId, resolvedCompanyId);

    // CACHE: LiveEmployeeStatus (was: LiveEmployeeStatus.findOne → 1 query, now: in-memory RAM mirror)
    let liveStatus = await cache.liveStatus.get(resolvedUserId, resolvedCompanyId);
    // liveStatus is always returned by cache (created in-memory if new)

    // Determine the last known point for classification
    const lastKnownPoint = liveStatus.lastLocation?.coordinates ? {
      latitude: liveStatus.lastLocation.coordinates[1],
      longitude: liveStatus.lastLocation.coordinates[0],
      time: liveStatus.lastUpdate,
      timestamp: liveStatus.lastUpdate,
      accuracy: 10
    } : null;

    // FIX 3(a): Order the batch — sort ascending by timestamp and drop points that
    // are older than (or equal to) the last accepted point. This preserves temporal
    // order and prevents offline-flush interleaving from corrupting the route.
    let orderedBatch = batch;
    try {
      orderedBatch = [...batch]
        .filter(p => p && p.timestamp !== undefined && p.timestamp !== null)
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    } catch (sortErr) {
      console.warn('[EnterpriseTracking] Batch sort failed, using original order:', sortErr.message);
    }

    if (lastKnownPoint && lastKnownPoint.timestamp) {
      const lastAcceptedTime = new Date(lastKnownPoint.timestamp).getTime();
      orderedBatch = orderedBatch.filter(p => new Date(p.timestamp).getTime() > lastAcceptedTime);
    }

    if (orderedBatch.length === 0) {
      console.log('[EnterpriseTracking] Batch empty after ordering/deduplication against last accepted point');
      return { success: true, pointsProcessed: 0, filtered: true };
    }

    // 2. GPS CLASSIFICATION SERVICE — Classify, don't delete
    const classifyResult = gpsFilter.classifyBatch(orderedBatch, lastKnownPoint);
    const { rawPoints: filteredPoints, displayPoints, distancePoints, suspiciousPoints, weakPoints } = classifyResult;

    if (filteredPoints.length === 0) {
      console.log('[EnterpriseTracking] All points rejected (invalid coordinates only)');
      
      const latestBatchPoint = orderedBatch[orderedBatch.length - 1];
      const latestTime = latestBatchPoint && (latestBatchPoint.timestamp || latestBatchPoint.time)
        ? new Date(latestBatchPoint.timestamp || latestBatchPoint.time)
        : new Date();
      
      liveStatus.lastUpdate = latestTime;
      liveStatus.currentStatus = 'online';
      liveStatus.trackingStatus = 'active';
      await liveStatus.save();
      
      return { success: true, pointsProcessed: 0, filtered: true };
    }

    // Preserve the true raw GPS coordinates and check geofence boundary for each point
    const rawOriginals = filteredPoints.map(p => {
      const rawLat = (p.rawLatitude !== undefined && p.rawLatitude !== null) ? p.rawLatitude : p.latitude;
      const rawLng = (p.rawLongitude !== undefined && p.rawLongitude !== null) ? p.rawLongitude : p.longitude;
      const geofenceCheck = geofenceService.checkPointGeofence(rawLat, rawLng, geofenceList);
      return {
        ...p,
        rawLatitude: rawLat,
        rawLongitude: rawLng,
        isInsideGeofence: geofenceCheck.isInside,
        isOutside: !geofenceCheck.isInside,
        matchedGeofence: geofenceCheck.matchedLocation?.name || null
      };
    });

    // ── GEOFENCE RESTRICTION ──
    // Only track, road-snap, and record points that are strictly OUTSIDE the geofence
    const outsideOriginals = rawOriginals.filter(p => !p.isInsideGeofence);

    // Filter out suspicious spike points before road-snapping and smoothing
    const cleanPoints = outsideOriginals.filter(p => p.status !== 'suspicious' && !p.isSuspicious);

    // 3. Apply Kalman filter smoothing only to clean outside points
    let validatedPoints = [];
    let snapProvider = 'none';

    if (cleanPoints.length > 0) {
      const startPoint = lastKnownPoint || {
        latitude: cleanPoints[0].latitude,
        longitude: cleanPoints[0].longitude,
        accuracy: cleanPoints[0].accuracy || 10
      };
      const smoothedPoints = geoService.smoothPoints(startPoint, cleanPoints);

      // 4. Perform road-snapping using Google Roads API or OSRM Match
      let snappedPoints = [];
      const rawSnapFallback = () => cleanPoints.map(p => ({
        ...p,
        candidateRoads: [],
        snappedLatitude: null,
        snappedLongitude: null,
        provider: 'none',
        routeStatus: 'raw'
      }));
      try {
        const snapResult = await roadSnap.snapToRoad(smoothedPoints);
        if (snapResult && snapResult.success) {
          snappedPoints = snapResult.snappedPoints;
          snapProvider = snapResult.provider;
        } else {
          snappedPoints = rawSnapFallback();
        }
      } catch (snapErr) {
        console.error('[EnterpriseTracking] Snapping failed, falling back to raw:', snapErr.message);
        snappedPoints = rawSnapFallback();
      }

      // Retrieve previous raw tracking points for road transition consensus context
      let historyPoints = [];
      try {
        historyPoints = await RawTrackingPoint.find({ userId: resolvedUserId })
          .sort({ timestamp: -1 })
          .limit(5)
          .lean();
        historyPoints.reverse();
      } catch (histErr) {
        console.error('[EnterpriseTracking] Failed to retrieve history for transition validator:', histErr.message);
      }

      // Apply the Road Snap Continuity, Heading & U-Turn consensus engine
      const roadValidationService = require('./roadValidationService');
      validatedPoints = roadValidationService.validateTransitions(snappedPoints, historyPoints);
    }

    // Map validated clean points by timestamp + deviceId
    const cleanMap = new Map();
    validatedPoints.forEach(p => {
      const key = `${new Date(p.timestamp).getTime()}_${p.deviceId || ''}`;
      cleanMap.set(key, p);
    });

    // 5. Save to RawTrackingPoint collection — ONLY outside-geofence points (ignore inside-geofence movements)
    const rawPoints = outsideOriginals.map(point => {
      const isSuspicious = point.status === 'suspicious' || point.isSuspicious === true;
      const key = `${new Date(point.timestamp).getTime()}_${point.deviceId || ''}`;
      const validatedPoint = cleanMap.get(key);

      if (isSuspicious || !validatedPoint) {
        const rawLat = point.rawLatitude || point.latitude;
        const rawLng = point.rawLongitude || point.longitude;
        return {
          userId: resolvedUserId,
          companyId: resolvedCompanyId,
          location: { type: 'Point', coordinates: [rawLng, rawLat] },
          rawLatitude: rawLat,
          rawLongitude: rawLng,
          snappedLatitude: null,
          snappedLongitude: null,
          accuracy: point.accuracy,
          speed: point.speed,
          heading: point.heading,
          altitude: point.altitude,
          battery: point.battery,
          tripId: point.tripId,
          deviceId: point.deviceId,
          timestamp: new Date(point.timestamp),
          status: 'suspicious',
          isSuspicious: true,
          isMock: point.isMock || false,
          isOffline: false,
          routeStatus: 'raw',
          processedTime: new Date(),
          provider: 'none',
          roadId: null,
          roadSegmentId: null,
          roadName: null,
          travelDirection: null,
          previousRoadId: null,
          previousSegmentId: null,
          matchedRoadConfidence: null,
          transitionReason: null,
          gpsConfidence: null,
          roadConfidence: null,
          candidateRoads: [],
          acceptedRoadId: null,
          acceptedSegmentId: null,
          visitNumber: 1,
          previousAcceptedRoad: null,
          roadTransitionType: null,
          gpsGap: null,
          isRecoveryPoint: false,
          qualityScore: null,
          decisionReason: point.classificationReason || 'Suspicious spike excluded from road snap'
        };
      }

      const lat = validatedPoint.snappedLatitude || validatedPoint.latitude;
      const lng = validatedPoint.snappedLongitude || validatedPoint.longitude;
      return {
        userId: resolvedUserId,
        companyId: resolvedCompanyId,
        location: { type: 'Point', coordinates: [lng, lat] },
        rawLatitude: validatedPoint.rawLatitude || validatedPoint.latitude,
        rawLongitude: validatedPoint.rawLongitude || validatedPoint.longitude,
        snappedLatitude: validatedPoint.snappedLatitude || null,
        snappedLongitude: validatedPoint.snappedLongitude || null,
        accuracy: validatedPoint.accuracy,
        speed: validatedPoint.speed,
        heading: validatedPoint.heading,
        altitude: validatedPoint.altitude,
        battery: validatedPoint.battery,
        tripId: validatedPoint.tripId,
        deviceId: validatedPoint.deviceId,
        timestamp: new Date(validatedPoint.timestamp),
        status: validatedPoint.status || 'valid',
        isSuspicious: validatedPoint.status === 'suspicious',
        isMock: validatedPoint.isMock || false,
        isOffline: false,
        routeStatus: validatedPoint.routeStatus || 'raw',
        processedTime: new Date(),
        provider: snapProvider,
        roadId: validatedPoint.roadId || null,
        roadSegmentId: validatedPoint.roadSegmentId || null,
        roadName: validatedPoint.roadName || null,
        travelDirection: validatedPoint.travelDirection || null,
        previousRoadId: validatedPoint.previousRoadId || null,
        previousSegmentId: validatedPoint.previousSegmentId || null,
        matchedRoadConfidence: validatedPoint.matchedRoadConfidence || null,
        transitionReason: validatedPoint.transitionReason || null,
        gpsConfidence: validatedPoint.gpsConfidence !== undefined ? validatedPoint.gpsConfidence : null,
        roadConfidence: validatedPoint.roadConfidence !== undefined ? validatedPoint.roadConfidence : null,
        candidateRoads: (validatedPoint.candidateRoads || []).slice(0, 2),
        acceptedRoadId: validatedPoint.acceptedRoadId || null,
        acceptedSegmentId: validatedPoint.acceptedSegmentId || null,
        visitNumber: validatedPoint.visitNumber !== undefined ? validatedPoint.visitNumber : 1,
        previousAcceptedRoad: validatedPoint.previousAcceptedRoad || null,
        roadTransitionType: validatedPoint.roadTransitionType || null,
        gpsGap: validatedPoint.gpsGap !== undefined ? validatedPoint.gpsGap : null,
        isRecoveryPoint: validatedPoint.isRecoveryPoint || false,
        qualityScore: validatedPoint.qualityScore !== undefined ? validatedPoint.qualityScore : null,
        decisionReason: validatedPoint.decisionReason || null
      };
    });

    // CACHE: Deduplicate against in-memory timestamp set (was: RawTrackingPoint.find → 1 query, now: 0 queries)
    const timestamps = rawPoints.map(p => p.timestamp);
    const unseenTimestamps = cache.dedup.filterUnseen(resolvedUserId, timestamps);
    const unseenTimeSet = new Set(unseenTimestamps.map(ts => new Date(ts).getTime()));
    const uniqueRawPoints = rawPoints.filter(p => unseenTimeSet.has(p.timestamp.getTime()));

    let lastPoint = null;
    if (uniqueRawPoints.length > 0) {
      // ESSENTIAL WRITE: This is the only MongoDB write that CANNOT be buffered
      const insertedPoints = await RawTrackingPoint.insertMany(uniqueRawPoints);
      lastPoint = insertedPoints[insertedPoints.length - 1];
      // Record inserted timestamps in dedup cache
      cache.dedup.recordInserted(resolvedUserId, uniqueRawPoints.map(p => p.timestamp));
      console.log(`[EnterpriseTracking] Saved ${insertedPoints.length} raw tracking points`);
    } else {
      lastPoint = await RawTrackingPoint.findOne({ companyId: resolvedCompanyId, userId: resolvedUserId }).sort('-timestamp');
    }

    // 6. Calculate INCREMENTAL distance — only from new batch points (#3 fix)
    let batchDistanceKm = 0;

    // ─── CROSS-DAY STRAIGHT LINE FIX ───
    let isCrossDayTransition = false;
    const firstBatchPoint = uniqueRawPoints[0] || batch[0];

    if (firstBatchPoint && liveStatus.lastUpdate) {
      const lastTrackedDate = new Date(liveStatus.lastUpdate);
      const firstBatchDate = new Date(firstBatchPoint.timestamp);
      const lastDay = `${lastTrackedDate.getUTCFullYear()}-${lastTrackedDate.getUTCMonth()}-${lastTrackedDate.getUTCDate()}`;
      const batchDay = `${firstBatchDate.getUTCFullYear()}-${firstBatchDate.getUTCMonth()}-${firstBatchDate.getUTCDate()}`;

      if (lastDay !== batchDay) {
        isCrossDayTransition = true;
        console.log(`[EnterpriseTracking] Cross-day transition detected: ${lastDay} -> ${batchDay}. Fresh segment.`);
      }
      const timeDiffMs = firstBatchDate.getTime() - lastTrackedDate.getTime();
      if (timeDiffMs > 2 * 60 * 60 * 1000) {
        isCrossDayTransition = true;
        console.log(`[EnterpriseTracking] Large time gap (${(timeDiffMs / 3600000).toFixed(1)}h). Fresh segment.`);
      }
    }

    // Calculate batch distance from valid-status outside-geofence points only
    const batchDistancePoints = uniqueRawPoints.filter(p => p.status === 'valid');
    if (batchDistancePoints.length >= 2) {
      for (let i = 1; i < batchDistancePoints.length; i++) {
        const prev = batchDistancePoints[i - 1];
        const curr = batchDistancePoints[i];
        const lat1 = prev.snappedLatitude || prev.rawLatitude || prev.location.coordinates[1];
        const lng1 = prev.snappedLongitude || prev.rawLongitude || prev.location.coordinates[0];
        const lat2 = curr.snappedLatitude || curr.rawLatitude || curr.location.coordinates[1];
        const lng2 = curr.snappedLongitude || curr.rawLongitude || curr.location.coordinates[0];
        const dist = geoService.calculateDistance(lat1, lng1, lat2, lng2);
        if (dist >= 0.005) { // >= 5 meters
          batchDistanceKm += dist;
        }
      }
    }

    // Bridge distance from last known point to first batch point (skip if cross-day or if last known point was inside geofence)
    const lastPointGeofenceCheck = lastKnownPoint ? geofenceService.checkPointGeofence(lastKnownPoint.latitude, lastKnownPoint.longitude, geofenceList) : null;
    const wasLastPointOutside = lastPointGeofenceCheck && !lastPointGeofenceCheck.isInside;

    if (!isCrossDayTransition && batchDistancePoints.length >= 1 && lastKnownPoint && wasLastPointOutside) {
      const first = batchDistancePoints[0];
      const firstLat = first.snappedLatitude || first.rawLatitude || first.location.coordinates[1];
      const firstLng = first.snappedLongitude || first.rawLongitude || first.location.coordinates[0];
      const bridgeDist = geoService.calculateDistance(
        lastKnownPoint.latitude, lastKnownPoint.longitude,
        firstLat, firstLng
      );
      if (bridgeDist >= 0.005 && bridgeDist < 5) {
        batchDistanceKm += bridgeDist;
      }
    }

    // CACHE: Attendance ID lookup (was: up to 4 Attendance.findOne queries, now: cached for 2 min)
    const attendanceId = await cache.getActiveAttendanceId(resolvedUserId, resolvedCompanyId, firstBatchPoint);
    let attendance = attendanceId ? { _id: attendanceId } : null;

    if (attendance && uniqueRawPoints.length > 0) {
      const validPointsInBatch = uniqueRawPoints.filter(p => p.status !== 'suspicious' && !p.isSuspicious);
      const lastValidRawPoint = validPointsInBatch.length > 0 ? validPointsInBatch[validPointsInBatch.length - 1] : uniqueRawPoints[uniqueRawPoints.length - 1];
      const firstValidRawPoint = validPointsInBatch.length > 0 ? validPointsInBatch[0] : uniqueRawPoints[0];
      const lastLat = lastValidRawPoint.snappedLatitude || lastValidRawPoint.rawLatitude || lastValidRawPoint.location.coordinates[1];
      const lastLng = lastValidRawPoint.snappedLongitude || lastValidRawPoint.rawLongitude || lastValidRawPoint.location.coordinates[0];
      const firstLat = firstValidRawPoint.snappedLatitude || firstValidRawPoint.rawLatitude || firstValidRawPoint.location.coordinates[1];
      const firstLng = firstValidRawPoint.snappedLongitude || firstValidRawPoint.rawLongitude || firstValidRawPoint.location.coordinates[0];

      const currentTotal = attendance.totalDistance || 0;
      const newTotal = currentTotal + parseFloat(batchDistanceKm.toFixed(6));

      const atomicUpdate = {
        $inc: {
          trackingPointCount: uniqueRawPoints.length,
        },
        $set: {
          totalDistance: parseFloat(newTotal.toFixed(6)),
          currentDistance: parseFloat(newTotal.toFixed(6)),
          distance: parseFloat(newTotal.toFixed(6)),
          lastTrackedLocation: {
            latitude: lastLat,
            longitude: lastLng,
            time: lastValidRawPoint.timestamp,
            address: null
          },
          lastTrackingTime: lastValidRawPoint.timestamp,
          battery: lastValidRawPoint.battery || 100,
          signalStatus: 'online'
        }
      };

      if (!attendance.firstTrackedLocation || !attendance.firstTrackedLocation.latitude) {
        atomicUpdate.$set.firstTrackedLocation = {
          latitude: firstLat,
          longitude: firstLng,
          time: firstValidRawPoint.timestamp,
          address: null
        };
      }

      // Geofence check using centralized geofenceService
      try {
        const latestPoint = lastValidRawPoint || uniqueRawPoints[uniqueRawPoints.length - 1] || batch[batch.length - 1];
        const latestLat = latestPoint?.snappedLatitude || latestPoint?.rawLatitude || latestPoint?.latitude || latestPoint?.location?.coordinates?.[1];
        const latestLng = latestPoint?.snappedLongitude || latestPoint?.rawLongitude || latestPoint?.longitude || latestPoint?.location?.coordinates?.[0];
        const geofenceCheck = geofenceService.checkPointGeofence(latestLat, latestLng, geofenceList);
        const isOutside = !geofenceCheck.isInside;
        const previousOutside = attendance.isOutside;
        atomicUpdate.$set.isOutside = isOutside;

        if (isOutside && !previousOutside) {
          const autoNotif = require('./autoNotificationService');
          const locName = geofenceCheck.matchedLocation?.name || 'Office';
          autoNotif.triggerOutsideGeofence(resolvedUserId, locName, socketIo);
        } else if (!isOutside && previousOutside) {
          const autoNotif = require('./autoNotificationService');
          const locName = geofenceCheck.matchedLocation?.name || 'Office';
          autoNotif.triggerGeofenceEntry(resolvedUserId, locName, socketIo);
        }
      } catch (geofenceErr) {
        console.error('[EnterpriseTracking] Geofence check in batch failed:', geofenceErr);
      }

      // BUFFER: Attendance update (was: Attendance.updateOne + findById → 2 queries, now: buffered, flushes every 30s)
      cache.attendanceBuffer.merge(attendance._id, atomicUpdate);
      // Apply updates locally for downstream use in this batch
      if (atomicUpdate.$set) Object.assign(attendance, atomicUpdate.$set);
      if (atomicUpdate.$inc) {
        for (const [k, v] of Object.entries(atomicUpdate.$inc)) {
          attendance[k] = (attendance[k] || 0) + v;
        }
      }
    }

    let avgSpeedKmh = 0;
    let maxSpeedKmh = 0;

    // 8. Update Live Employee Status (prefer last valid non-suspicious point, or latest raw ping)
    const validPointsForLive = uniqueRawPoints.filter(p => p.status !== 'suspicious' && !p.isSuspicious);
    const targetLivePoint = validPointsForLive.length > 0 ? validPointsForLive[validPointsForLive.length - 1] : (uniqueRawPoints[uniqueRawPoints.length - 1] || lastPoint);

    if (targetLivePoint) {
      const liveLat = targetLivePoint.rawLatitude || targetLivePoint.latitude || targetLivePoint.location?.coordinates[1];
      const liveLng = targetLivePoint.rawLongitude || targetLivePoint.longitude || targetLivePoint.location?.coordinates[0];
      const liveGeofenceCheck = geofenceService.checkPointGeofence(liveLat, liveLng, geofenceList);

      liveStatus.lastLocation = { type: 'Point', coordinates: [liveLng, liveLat] };
      liveStatus.lastRawLocation = { type: 'Point', coordinates: [liveLng, liveLat] };
      
      if (targetLivePoint.snappedLatitude && targetLivePoint.snappedLongitude) {
        liveStatus.lastSnappedLocation = { type: 'Point', coordinates: [targetLivePoint.snappedLongitude, targetLivePoint.snappedLatitude] };
      }
      
      liveStatus.currentSpeed = targetLivePoint.speed || 0;
      liveStatus.lastUpdate = targetLivePoint.timestamp;
      liveStatus.totalDistanceToday = attendance ? (attendance.totalDistance || 0) : (liveStatus.totalDistanceToday + batchDistanceKm);
      liveStatus.movementState = liveGeofenceCheck.isInside ? 'Inside Office' : detectMovementState(targetLivePoint.speed || 0);
      liveStatus.tripId = targetLivePoint.tripId;
      liveStatus.lastGpsTime = targetLivePoint.timestamp;
      liveStatus.trackingHealth = 'healthy';
      liveStatus.trackingHealthReason = liveGeofenceCheck.isInside ? 'Inside geofence boundary' : 'Active GPS updates received';
      liveStatus.recoveryAttempts = 0;

      const now = Date.now();
      const lastPointTime = new Date(targetLivePoint.timestamp).getTime();
      const timeDiff = now - lastPointTime;

      if (timeDiff < 120000) {
        liveStatus.currentStatus = 'online';
        liveStatus.trackingStatus = 'active';
      } else if (timeDiff < 300000) {
        liveStatus.currentStatus = 'poor signal';
        liveStatus.trackingStatus = 'active';
      } else {
        liveStatus.currentStatus = 'offline';
        liveStatus.trackingStatus = 'offline';
      }

      if (targetLivePoint.accuracy !== undefined && targetLivePoint.accuracy !== null) {
        liveStatus.signalQuality = targetLivePoint.accuracy <= 20 ? 'strong' : 'weak';
      }
      
      if (targetLivePoint.battery) liveStatus.batteryLevel = targetLivePoint.battery;

      // Calculate stops & speed INCREMENTALLY — no full-day query (#4 fix)
      try {
        const batchSpeeds = uniqueRawPoints.map(p => p.speed || 0).filter(s => s > 0);
        if (batchSpeeds.length > 0) {
          const batchAvgMs = batchSpeeds.reduce((a, b) => a + b, 0) / batchSpeeds.length;
          const batchMaxMs = Math.max(...batchSpeeds);
          avgSpeedKmh = parseFloat((batchAvgMs * 3.6).toFixed(1));
          maxSpeedKmh = parseFloat((Math.max(batchMaxMs * 3.6, liveStatus.avgSpeed || 0)).toFixed(1));
        } else {
          avgSpeedKmh = liveStatus.avgSpeed || 0;
        }
        liveStatus.avgSpeed = avgSpeedKmh;

        let batchStops = 0;
        let idleStart = null;
        for (const point of uniqueRawPoints) {
          const speedKmh = (point.speed || 0) * 3.6;
          if (speedKmh < 1) {
            if (!idleStart) idleStart = new Date(point.timestamp);
          } else {
            if (idleStart) {
              const idleDuration = (new Date(point.timestamp) - idleStart) / 60000;
              if (idleDuration >= 2) batchStops++;
              idleStart = null;
            }
          }
        }
        if (isCrossDayTransition) {
          liveStatus.stops = batchStops;
        } else {
          liveStatus.stops = (liveStatus.stops || 0) + batchStops;
        }
      } catch (stopErr) {
        console.error('[EnterpriseTracking] Failed to calculate stops & speed metrics:', stopErr.message);
      }
    }

    // 9. Background Geocoding (throttled)
    if (targetLivePoint) {
      const currentCoords = targetLivePoint.location.coordinates;
      let shouldGeocode = false;

      if (!liveStatus.lastAddress) {
        shouldGeocode = true;
      } else {
        const lastGeocodedCoords = liveStatus.lastGeocodedLocation?.coordinates || liveStatus.lastLocation?.coordinates;
        if (lastGeocodedCoords) {
          const distSinceLastGeocode = geoService.calculateDistance(
            lastGeocodedCoords[1], lastGeocodedCoords[0],
            currentCoords[1], currentCoords[0]
          );
          const timeSinceLastGeocode = liveStatus.lastGeocodeTime ? (Date.now() - new Date(liveStatus.lastGeocodeTime).getTime()) / 1000 : Infinity;
          if (distSinceLastGeocode > 0.1 || timeSinceLastGeocode > 300) {
            shouldGeocode = true;
          }
        } else {
          shouldGeocode = true;
        }
      }

      if (shouldGeocode) {
        reverseGeocodeAsync(resolvedUserId, uniqueRawPoints, targetLivePoint, socketIo, resolvedCompanyId).catch(err => {
          console.error('[EnterpriseTracking] Background geocoding invocation failed:', err);
        });
      }
    }

    // CACHE: LiveStatus save (was: liveStatus.save() → 1 query, now: mark dirty, flushes every 30s)
    cache.liveStatus.markDirty(resolvedUserId, resolvedCompanyId);

    // CACHE: User.isOnline (was: User.findByIdAndUpdate → 1 query every batch, now: debounced to once per 5 min)
    cache.userOnline.markOnline(resolvedUserId);

    // 10. Real-time broadcast — reduced payload (#25), room-targeted (#21)
    if (socketIo) {
      const broadcastPoint = targetLivePoint || lastPoint;
      const snappedLat = broadcastPoint?.snappedLatitude || broadcastPoint?.location?.coordinates[1];
      const snappedLng = broadcastPoint?.snappedLongitude || broadcastPoint?.location?.coordinates[0];

      let batchRoadGeometry = [];
      try {
        const routeReconstructService = require('./routeReconstructionService');
        const pointsForRecon = [];
        if (lastGeocodedCoords && typeof lastGeocodedCoords[1] === 'number' && typeof lastGeocodedCoords[0] === 'number') {
          pointsForRecon.push({ latitude: lastGeocodedCoords[1], longitude: lastGeocodedCoords[0] });
        }
        pointsForRecon.push(...uniqueRawPoints.filter(p => !p.isSuspicious && p.status !== 'suspicious').map(p => ({
          latitude: p.snappedLatitude || p.rawLatitude || p.location.coordinates[1],
          longitude: p.snappedLongitude || p.rawLongitude || p.location.coordinates[0]
        })));
        if (pointsForRecon.length >= 2) {
          const recon = await routeReconstructService.reconstructRoute(pointsForRecon);
          if (recon && recon.geometry && recon.geometry.length >= 2) {
            batchRoadGeometry = recon.geometry;
          }
        }
      } catch (err) {
        // Fall back gracefully to discrete points
      }
      
      const updatePayload = {
        userId: resolvedUserId ? resolvedUserId.toString() : userId,
        latitude: snappedLat,
        longitude: snappedLng,
        rawLatitude: broadcastPoint?.rawLatitude || broadcastPoint?.location?.coordinates[1],
        rawLongitude: broadcastPoint?.rawLongitude || broadcastPoint?.location?.coordinates[0],
        speed: broadcastPoint?.speed,
        distance: liveStatus.totalDistanceToday,
        status: liveStatus.movementState,
        trackingStatus: 'active',
        timestamp: broadcastPoint?.timestamp,
        address: liveStatus.lastAddress || 'Live Tracking...',
        battery: liveStatus.batteryLevel,
        accuracy: broadcastPoint?.accuracy,
        signalQuality: liveStatus.signalQuality,
        provider: snapProvider,
        avgSpeed: avgSpeedKmh,
        maxSpeed: maxSpeedKmh,
        stops: liveStatus.stops || 0,
        isCrossDayTransition,
        roadGeometry: batchRoadGeometry.length > 0 ? batchRoadGeometry : uniqueRawPoints.map(p => ({
          latitude: p.snappedLatitude || p.rawLatitude || p.location.coordinates[1],
          longitude: p.snappedLongitude || p.rawLongitude || p.location.coordinates[0]
        })),
        path: uniqueRawPoints.map(p => ({
          lat: p.snappedLatitude || p.rawLatitude || p.location.coordinates[1],
          lng: p.snappedLongitude || p.rawLongitude || p.location.coordinates[0],
          rawLat: p.rawLatitude || p.location.coordinates[1],
          rawLng: p.rawLongitude || p.location.coordinates[0],
          snappedLat: p.status === 'suspicious' || p.isSuspicious ? null : (p.snappedLatitude || null),
          snappedLng: p.status === 'suspicious' || p.isSuspicious ? null : (p.snappedLongitude || null),
          status: p.status,
          isSuspicious: p.status === 'suspicious' || p.isSuspicious === true,
          speed: p.speed,
          timestamp: p.timestamp
        })),
        segments: buildSegments(uniqueRawPoints)
      };

      // Emit to company admin + tracking rooms, as well as specific user rooms
      if (socketIo.to) {
        if (resolvedCompanyId) {
          socketIo.to(`company:${resolvedCompanyId}:admin`).emit('liveTrackingUpdate', updatePayload);
          socketIo.to(`company:${resolvedCompanyId}:tracking`).emit('liveTrackingUpdate', updatePayload);
        }
        socketIo.to(`user:${resolvedUserId}`).emit('liveTrackingUpdate', updatePayload);
        socketIo.to(resolvedUserId.toString()).emit('liveTrackingUpdate', updatePayload);
      }
      if (typeof socketIo.emit === 'function') {
        socketIo.emit('liveTrackingUpdate', updatePayload);
        socketIo.emit('locationUpdated', {
          userId: resolvedUserId ? resolvedUserId.toString() : userId,
          latitude: snappedLat,
          longitude: snappedLng,
          time: broadcastPoint?.timestamp,
          address: liveStatus.lastAddress || 'Live Tracking...',
          distanceFromPrevious: 0,
          totalDistance: liveStatus.totalDistanceToday,
          isSuspicious: broadcastPoint?.status === 'suspicious' || broadcastPoint?.isSuspicious === true
        });
      }
    }

    // 11. IMMEDIATE aggregation write (#22 fix)
    if (uniqueRawPoints.length > 0) {
      try {
        await writeTrackingLog(resolvedUserId, uniqueRawPoints, batchDistanceKm, resolvedCompanyId);
      } catch (aggErr) {
        console.error('[EnterpriseTracking] TrackingLog write failed:', aggErr.message);
      }
    }

    console.log(`[EnterpriseTracking] ✓ Batch complete: ${uniqueRawPoints.length} points processed (provider: ${snapProvider})`);
    return { success: true, pointsProcessed: uniqueRawPoints.length, provider: snapProvider };
  } catch (err) {
    console.error('[EnterpriseTracking] Error processing batch:', err);
    throw err;
  }
};

/**
 * Background Asynchronous Geocode Worker
 */
async function reverseGeocodeAsync(userId, points, lastPoint = null, socketIo = null, companyId = null) {
  try {
    let pointsToProcess = [];
    let targetLastPoint = lastPoint;

    if (Array.isArray(points)) {
      pointsToProcess = points;
    } else if (points) {
      pointsToProcess = [points];
      if (!targetLastPoint) targetLastPoint = points;
    }

    if (pointsToProcess.length === 0) return;

    const resolvedCompanyId = companyId || pointsToProcess[0]?.companyId || null;

    const pointsToGeocode = [];
    const seenMinutes = new Set();
    let lastGeocodedPoint = null;

    // CACHE: Read LiveStatus from RAM instead of MongoDB
    const liveStatus = await cache.liveStatus.get(userId, resolvedCompanyId);
    if (liveStatus?.lastGeocodedLocation?.coordinates) {
      lastGeocodedPoint = {
        latitude: liveStatus.lastGeocodedLocation.coordinates[1],
        longitude: liveStatus.lastGeocodedLocation.coordinates[0]
      };
    }

    for (let i = pointsToProcess.length - 1; i >= 0; i--) {
      const p = pointsToProcess[i];
      const time = new Date(p.timestamp || p.processedTime);
      const minuteKey = `${time.getFullYear()}-${time.getMonth()}-${time.getDate()} ${time.getHours()}:${time.getMinutes()}`;
      const currentLat = p.snappedLatitude || p.rawLatitude || p.location.coordinates[1];
      const currentLng = p.snappedLongitude || p.rawLongitude || p.location.coordinates[0];

      const isLast = (p.timestamp && targetLastPoint && new Date(p.timestamp).getTime() === new Date(targetLastPoint.timestamp).getTime());
      
      let distanceFromLastGeocoded = Infinity;
      if (lastGeocodedPoint) {
        distanceFromLastGeocoded = geoService.calculateDistance(
          lastGeocodedPoint.latitude, lastGeocodedPoint.longitude,
          currentLat, currentLng
        ) * 1000;
      }

      if (isLast || (!seenMinutes.has(minuteKey) && distanceFromLastGeocoded > 150)) {
        pointsToGeocode.push(p);
        seenMinutes.add(minuteKey);
        lastGeocodedPoint = { latitude: currentLat, longitude: currentLng };
      }
    }

    pointsToGeocode.reverse();

    for (let i = 0; i < pointsToGeocode.length; i++) {
      const point = pointsToGeocode[i];
      const lat = point.snappedLatitude || point.rawLatitude || point.location.coordinates[1];
      const lng = point.snappedLongitude || point.rawLongitude || point.location.coordinates[0];

      if (i > 0) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      const address = await reverseGeocodeLatLng(lat, lng);

      if (address) {
        await RawTrackingPoint.updateOne(
          { companyId: resolvedCompanyId, userId, timestamp: point.timestamp },
          { $set: { address } }
        );

        // Update Attendance lastTrackedLocation address atomically
        const pointTime = new Date(point.timestamp);
        const pointDateStart = new Date(pointTime);
        pointDateStart.setUTCHours(0, 0, 0, 0);
        const pointDateEnd = new Date(pointTime);
        pointDateEnd.setUTCHours(23, 59, 59, 999);

        await Attendance.updateOne(
          {
            companyId: resolvedCompanyId,
            user: userId,
            date: { $gte: pointDateStart, $lte: pointDateEnd },
            'lastTrackedLocation.time': pointTime
          },
          { $set: { 'lastTrackedLocation.address': address } }
        );

        const isLastPoint = (targetLastPoint && new Date(point.timestamp).getTime() === new Date(targetLastPoint.timestamp).getTime());
        if (isLastPoint) {
          // CACHE: Update LiveStatus in RAM (was: LiveEmployeeStatus.updateOne → 1 query)
          await cache.liveStatus.update(userId, resolvedCompanyId, {
            lastAddress: address,
            lastGeocodedLocation: point.location,
            lastGeocodeTime: new Date()
          });

          if (socketIo) {
            const updatePayload = {
              userId: userId ? userId.toString() : userId,
              latitude: point.snappedLatitude || point.location.coordinates[1],
              longitude: point.snappedLongitude || point.location.coordinates[0],
              rawLatitude: point.rawLatitude || point.location.coordinates[1],
              rawLongitude: point.rawLongitude || point.location.coordinates[0],
              speed: point.speed,
              address: address,
              timestamp: point.timestamp,
              provider: point.provider || 'none',
              path: []
            };
            if (socketIo.to) {
              if (resolvedCompanyId) {
                socketIo.to(`company:${resolvedCompanyId}:admin`).emit('liveTrackingUpdate', updatePayload);
                socketIo.to(`company:${resolvedCompanyId}:tracking`).emit('liveTrackingUpdate', updatePayload);
              }
              socketIo.to(`user:${userId}`).emit('liveTrackingUpdate', updatePayload);
              socketIo.to(userId.toString()).emit('liveTrackingUpdate', updatePayload);
            }
            if (typeof socketIo.emit === 'function') {
              socketIo.emit('liveTrackingUpdate', updatePayload);
            }
          }
        }
      }
    }
  } catch (err) {
    console.error('[EnterpriseTracking] Asynchronous reverse geocoding task failed:', err.message);
  }
}

exports.reverseGeocodeAsync = reverseGeocodeAsync;

/**
 * Write tracking aggregation log to BUFFER (flushes every 30s via cache).
 * Was: immediate log.save() on every batch → 1 query per batch.
 * Now: buffered bulk insert → ~1 query per 30s regardless of batch count.
 */
async function writeTrackingLog(userId, points, distanceKm, companyId = null) {
  if (!points || points.length === 0) return;

  try {
    const resolvedCompanyId = companyId || points[0]?.companyId || null;
    const startTime = points[0].timestamp;
    const endTime = points[points.length - 1].timestamp;
    const avgSpeed = points.reduce((acc, p) => acc + (p.speed || 0), 0) / points.length;
    const maxSpeed = Math.max(...points.map(p => p.speed || 0));
    
    const rawPath = points.map(p => p.location?.coordinates || [p.rawLongitude || p.longitude, p.rawLatitude || p.latitude]);
    const snappedPath = points
      .map(p => [
        p.snappedLongitude || p.rawLongitude || p.location?.coordinates[0] || p.longitude,
        p.snappedLatitude || p.rawLatitude || p.location?.coordinates[1] || p.latitude
      ])
      .filter(p => p[0] != null && p[1] != null);

    // BUFFER: Push to cache buffer instead of immediate save
    cache.trackingLogBuffer.push({
      companyId: resolvedCompanyId,
      userId,
      startTime,
      endTime,
      startLocation: points[0].location || { type: 'Point', coordinates: rawPath[0] },
      endLocation: points[points.length - 1].location || { type: 'Point', coordinates: rawPath[rawPath.length - 1] },
      distance: parseFloat(distanceKm.toFixed(3)),
      rawDistance: parseFloat(distanceKm.toFixed(3)),
      avgSpeed: parseFloat(avgSpeed.toFixed(2)),
      maxSpeed: parseFloat(maxSpeed.toFixed(2)),
      movementStatus: detectMovementState(avgSpeed),
      path: rawPath,
      snappedPath: snappedPath.length > 0 ? snappedPath : undefined,
      avgAccuracy: points.reduce((acc, p) => acc + (p.accuracy || 0), 0) / points.length
    });
  } catch (err) {
    console.error('[EnterpriseTracking] TrackingLog buffer error:', err.message);
  }
}

function detectMovementState(speedMs) {
  const speedKmh = speedMs * 3.6;
  if (speedKmh < 1) return 'Idle';
  if (speedKmh < 6) return 'Walking';
  if (speedKmh < 25) return 'Bike';
  if (speedKmh < 100) return 'Vehicle';
  return 'Suspicious';
}

/**
 * Split a set of saved tracking points into drawable segments.
 * A new segment starts at any gap > 15 minutes or a cross-day boundary, so the
 * client never draws a straight line across a GPS gap.
 * @param {Array} points - Saved RawTrackingPoint-like docs (with timestamp)
 * @returns {Array<Array>} Array of path-point segments
 */
function buildSegments(points) {
  const segments = [];
  let current = [];
  let prevTime = null;
  for (const pt of points) {
    const t = new Date(pt.timestamp).getTime();
    if (prevTime !== null) {
      const dtMs = t - prevTime;
      const prevDate = new Date(prevTime);
      const currDate = new Date(t);
      const dayChanged = prevDate.getUTCFullYear() !== currDate.getUTCFullYear() ||
        prevDate.getUTCMonth() !== currDate.getUTCMonth() ||
        prevDate.getUTCDate() !== currDate.getUTCDate();
      if (dtMs > 15 * 60 * 1000 || dayChanged) {
        if (current.length > 0) segments.push(current);
        current = [];
      }
    }
    current.push(pt);
    prevTime = t;
  }
  if (current.length > 0) segments.push(current);
  return segments;
}
