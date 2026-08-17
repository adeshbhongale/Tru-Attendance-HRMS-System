const { RawTrackingPoint, TrackingSession, TrackingLog, LiveEmployeeStatus } = require('../models/Tracking');
const geoService = require('./geoTrackingService');
const gpsFilter = require('./gpsFilterService');
const roadSnap = require('./roadSnapService');
const { reverseGeocodeLatLng } = require('../utils/googleMaps');
const Attendance = require('../models/Attendance');

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

    const User = require('../models/User');
    const user = await User.findById(resolvedUserId).select('companyId company').lean();
    const resolvedCompanyId = companyId || user?.companyId || user?.company;
    if (!resolvedCompanyId) return { success: false, error: 'Company context missing' };

    // 1. Fetch Live Status for validation reference
    let liveStatus = await LiveEmployeeStatus.findOne({ companyId: resolvedCompanyId, userId: resolvedUserId });
    if (!liveStatus) {
      liveStatus = new LiveEmployeeStatus({ companyId: resolvedCompanyId, userId: resolvedUserId });
    }

    // Determine the last known point for classification
    const lastKnownPoint = liveStatus.lastLocation?.coordinates ? {
      latitude: liveStatus.lastLocation.coordinates[1],
      longitude: liveStatus.lastLocation.coordinates[0],
      time: liveStatus.lastUpdate,
      timestamp: liveStatus.lastUpdate,
      accuracy: 10
    } : null;

    // 2. GPS CLASSIFICATION SERVICE — Classify, don't delete
    const classifyResult = gpsFilter.classifyBatch(batch, lastKnownPoint);
    const { rawPoints: filteredPoints, displayPoints, distancePoints, suspiciousPoints, weakPoints } = classifyResult;

    if (filteredPoints.length === 0) {
      console.log('[EnterpriseTracking] All points rejected (invalid coordinates only)');
      
      const latestBatchPoint = batch[batch.length - 1];
      const latestTime = latestBatchPoint && (latestBatchPoint.timestamp || latestBatchPoint.time)
        ? new Date(latestBatchPoint.timestamp || latestBatchPoint.time)
        : new Date();
      
      liveStatus.lastUpdate = latestTime;
      liveStatus.currentStatus = 'online';
      liveStatus.trackingStatus = 'active';
      await liveStatus.save();
      
      return { success: true, pointsProcessed: 0, filtered: true };
    }

    // 3. Apply Kalman filter smoothing
    const startPoint = lastKnownPoint || {
      latitude: filteredPoints[0].latitude,
      longitude: filteredPoints[0].longitude,
      accuracy: filteredPoints[0].accuracy || 10
    };
    const smoothedPoints = geoService.smoothPoints(startPoint, filteredPoints);

    // 4. Perform road-snapping using Google Roads API or OSRM Match
    let snappedPoints = [];
    let snapProvider = 'none';
    try {
      const snapResult = await roadSnap.snapToRoad(smoothedPoints);
      if (snapResult && snapResult.success) {
        snappedPoints = snapResult.snappedPoints;
        snapProvider = snapResult.provider;
      } else {
        snappedPoints = smoothedPoints.map(p => ({
          ...p,
          snappedLatitude: null,
          snappedLongitude: null,
          provider: 'none',
          routeStatus: 'raw'
        }));
      }
    } catch (snapErr) {
      console.error('[EnterpriseTracking] Snapping failed, falling back to raw:', snapErr.message);
      snappedPoints = smoothedPoints.map(p => ({
        ...p,
        snappedLatitude: null,
        snappedLongitude: null,
        provider: 'none',
        routeStatus: 'raw'
      }));
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
    const validatedPoints = roadValidationService.validateTransitions(snappedPoints, historyPoints);

    // 5. Save to RawTrackingPoint collection
    const rawPoints = validatedPoints.map(point => {
      const lat = point.snappedLatitude || point.latitude;
      const lng = point.snappedLongitude || point.longitude;
      return {
        userId: resolvedUserId,
        companyId: resolvedCompanyId,
        location: { type: 'Point', coordinates: [lng, lat] },
        rawLatitude: point.rawLatitude || point.latitude,
        rawLongitude: point.rawLongitude || point.longitude,
        snappedLatitude: point.snappedLatitude || null,
        snappedLongitude: point.snappedLongitude || null,
        accuracy: point.accuracy,
        speed: point.speed,
        heading: point.heading,
        altitude: point.altitude,
        battery: point.battery,
        tripId: point.tripId,
        deviceId: point.deviceId,
        timestamp: new Date(point.timestamp),
        status: point.status || 'valid',
        isMock: point.isMock || false,
        isOffline: false,
        routeStatus: point.routeStatus || 'raw',
        processedTime: new Date(),
        provider: snapProvider,
        roadId: point.roadId || null,
        roadSegmentId: point.roadSegmentId || null,
        roadName: point.roadName || null,
        travelDirection: point.travelDirection || null,
        previousRoadId: point.previousRoadId || null,
        previousSegmentId: point.previousSegmentId || null,
        matchedRoadConfidence: point.matchedRoadConfidence || null,
        transitionReason: point.transitionReason || null,
        gpsConfidence: point.gpsConfidence !== undefined ? point.gpsConfidence : null,
        roadConfidence: point.roadConfidence !== undefined ? point.roadConfidence : null,
        candidateRoads: (point.candidateRoads || []).slice(0, 2), // Store top 2 only (#10 fix)
        acceptedRoadId: point.acceptedRoadId || null,
        acceptedSegmentId: point.acceptedSegmentId || null,
        visitNumber: point.visitNumber !== undefined ? point.visitNumber : 1,
        previousAcceptedRoad: point.previousAcceptedRoad || null,
        roadTransitionType: point.roadTransitionType || null,
        gpsGap: point.gpsGap !== undefined ? point.gpsGap : null,
        isRecoveryPoint: point.isRecoveryPoint || false,
        qualityScore: point.qualityScore !== undefined ? point.qualityScore : null,
        decisionReason: point.decisionReason || null
      };
    });

    // Deduplicate against existing records
    const timestamps = rawPoints.map(p => p.timestamp);
    const existingRawPoints = await RawTrackingPoint.find({
      companyId: resolvedCompanyId,
      userId: resolvedUserId,
      timestamp: { $in: timestamps }
    });
    const existingTimes = new Set(existingRawPoints.map(p => p.timestamp.getTime()));
    const uniqueRawPoints = rawPoints.filter(p => !existingTimes.has(p.timestamp.getTime()));

    let lastPoint = null;
    if (uniqueRawPoints.length > 0) {
      const insertedPoints = await RawTrackingPoint.insertMany(uniqueRawPoints);
      lastPoint = insertedPoints[insertedPoints.length - 1];
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

    // Calculate batch distance from valid-status points only
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

    // Bridge distance from last known point to first batch point (skip if cross-day)
    if (!isCrossDayTransition && batchDistancePoints.length >= 1 && lastKnownPoint) {
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

    // 7. ATOMIC Attendance update (#2 fix)
    let attendance = null;

    if (firstBatchPoint && firstBatchPoint.tripId && mongoose.Types.ObjectId.isValid(firstBatchPoint.tripId)) {
      attendance = await Attendance.findById(firstBatchPoint.tripId);
    }
    if (!attendance && firstBatchPoint) {
      const pointDate = new Date(firstBatchPoint.timestamp || firstBatchPoint.time);
      const pointStart = new Date(pointDate);
      pointStart.setUTCHours(0, 0, 0, 0);
      const pointEnd = new Date(pointDate);
      pointEnd.setUTCHours(23, 59, 59, 999);
      attendance = await Attendance.findOne({
        user: resolvedUserId,
        date: { $gte: pointStart, $lte: pointEnd }
      }).sort('-date');
    }
    if (!attendance) {
      attendance = await Attendance.findOne({
        user: resolvedUserId,
        "punchOut.time": { $exists: false }
      }).sort('-date');
    }
    if (!attendance) {
      const todayStart = new Date();
      todayStart.setUTCHours(0, 0, 0, 0);
      const todayEnd = new Date();
      todayEnd.setUTCHours(23, 59, 59, 999);
      attendance = await Attendance.findOne({
        user: resolvedUserId,
        date: { $gte: todayStart, $lte: todayEnd }
      }).sort('-date');
    }

    if (attendance && uniqueRawPoints.length > 0) {
      const lastValidRawPoint = uniqueRawPoints[uniqueRawPoints.length - 1];
      const firstValidRawPoint = uniqueRawPoints[0];
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

      // Geofence check
      try {
        if (mongoose.connection.readyState === 1) {
          const User = require('../models/User');
          const Location = require('../models/Location');
          const { calculateDistance } = require('../utils/geofence');
          const userObj = await User.findById(resolvedUserId).populate('workingPlace');
          const office = userObj?.workingPlace || (await Location.findOne({ name: 'Office Main' }) || await Location.findOne());
          
          if (office) {
            const isOutside = calculateDistance(lastLat, lastLng, office.latitude, office.longitude) > office.radius;
            const previousOutside = attendance.isOutside;
            atomicUpdate.$set.isOutside = isOutside;

            if (isOutside && !previousOutside) {
              const autoNotif = require('./autoNotificationService');
              autoNotif.triggerOutsideGeofence(resolvedUserId, office.name || 'Office Main', socketIo);
            } else if (!isOutside && previousOutside) {
              const autoNotif = require('./autoNotificationService');
              autoNotif.triggerGeofenceEntry(resolvedUserId, office.name || 'Office Main', socketIo);
            }
          }
        }
      } catch (geofenceErr) {
        console.error('[EnterpriseTracking] Geofence check in batch failed:', geofenceErr);
      }

      await Attendance.updateOne({ _id: attendance._id }, atomicUpdate);
      attendance = await Attendance.findById(attendance._id).lean();
    }

    let avgSpeedKmh = 0;
    let maxSpeedKmh = 0;

    // 8. Update Live Employee Status
    if (lastPoint) {
      liveStatus.lastLocation = lastPoint.location;
      liveStatus.lastRawLocation = { type: 'Point', coordinates: [lastPoint.rawLongitude || lastPoint.location.coordinates[0], lastPoint.rawLatitude || lastPoint.location.coordinates[1]] };
      
      if (lastPoint.snappedLatitude && lastPoint.snappedLongitude) {
        liveStatus.lastSnappedLocation = { type: 'Point', coordinates: [lastPoint.snappedLongitude, lastPoint.snappedLatitude] };
      }
      
      liveStatus.currentSpeed = lastPoint.speed;
      liveStatus.lastUpdate = lastPoint.timestamp;
      liveStatus.totalDistanceToday = attendance ? (attendance.totalDistance || 0) : (liveStatus.totalDistanceToday + batchDistanceKm);
      liveStatus.movementState = detectMovementState(lastPoint.speed);
      liveStatus.tripId = lastPoint.tripId;
      liveStatus.lastGpsTime = lastPoint.timestamp;
      liveStatus.trackingHealth = 'healthy';
      liveStatus.trackingHealthReason = 'Active GPS updates received';
      liveStatus.recoveryAttempts = 0;

      const now = Date.now();
      const lastPointTime = new Date(lastPoint.timestamp).getTime();
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

      if (lastPoint.accuracy !== undefined && lastPoint.accuracy !== null) {
        liveStatus.signalQuality = lastPoint.accuracy <= 20 ? 'strong' : 'weak';
      }
      
      if (lastPoint.battery) liveStatus.batteryLevel = lastPoint.battery;

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
    if (lastPoint) {
      const currentCoords = lastPoint.location.coordinates;
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
        reverseGeocodeAsync(resolvedUserId, uniqueRawPoints, lastPoint, socketIo, resolvedCompanyId).catch(err => {
          console.error('[EnterpriseTracking] Background geocoding invocation failed:', err);
        });
      }
    }

    await liveStatus.save();

    await mongoose.model('User').findByIdAndUpdate(resolvedUserId, { isOnline: true });

    // 10. Real-time broadcast — reduced payload (#25), room-targeted (#21)
    if (socketIo) {
      const broadcastPoint = lastPoint;
      const snappedLat = broadcastPoint?.snappedLatitude || broadcastPoint?.location?.coordinates[1];
      const snappedLng = broadcastPoint?.snappedLongitude || broadcastPoint?.location?.coordinates[0];
      
      const updatePayload = {
        userId: resolvedUserId,
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
        path: uniqueRawPoints.map(p => ({ 
          lat: p.snappedLatitude || p.location.coordinates[1], 
          lng: p.snappedLongitude || p.location.coordinates[0],
          rawLat: p.rawLatitude || p.location.coordinates[1],
          rawLng: p.rawLongitude || p.location.coordinates[0],
          status: p.status,
          speed: p.speed,
          timestamp: p.timestamp
        }))
      };

      // Emit only to this company's admin + tracking rooms
      if (socketIo.to) {
        socketIo.to(`company:${resolvedCompanyId}:admin`).emit('liveTrackingUpdate', updatePayload);
        socketIo.to(`company:${resolvedCompanyId}:tracking`).emit('liveTrackingUpdate', updatePayload);
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

    const liveStatus = await LiveEmployeeStatus.findOne({ companyId: resolvedCompanyId, userId });
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
          await LiveEmployeeStatus.updateOne(
            { companyId: resolvedCompanyId, userId },
            { $set: { lastAddress: address, lastGeocodedLocation: point.location, lastGeocodeTime: new Date() } }
          );

          if (socketIo) {
            const updatePayload = {
              userId,
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
              socketIo.to(`company:${resolvedCompanyId}:admin`).emit('liveTrackingUpdate', updatePayload);
              socketIo.to(`company:${resolvedCompanyId}:tracking`).emit('liveTrackingUpdate', updatePayload);
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
 * Write tracking aggregation log IMMEDIATELY to DB.
 * Replaces the old in-memory setTimeout buffer (#22 fix).
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

    const log = new TrackingLog({
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

    await log.save();
  } catch (err) {
    console.error('[EnterpriseTracking] TrackingLog write error:', err.message);
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
