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
 */

// Memory buffer for 1-minute aggregation (Temporary store before DB write)
const aggregationBuffer = new Map(); 

exports.processTrackingBatch = async (userId, batch, socketIo) => {
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

    // 1. Fetch Live Status for validation reference
    let liveStatus = await LiveEmployeeStatus.findOne({ userId: resolvedUserId });
    if (!liveStatus) {
      liveStatus = new LiveEmployeeStatus({ userId: resolvedUserId });
    }

    // Determine the last known point for filtering
    const lastKnownPoint = liveStatus.lastLocation?.coordinates ? {
      latitude: liveStatus.lastLocation.coordinates[1],
      longitude: liveStatus.lastLocation.coordinates[0],
      time: liveStatus.lastUpdate,
      accuracy: 10
    } : null;

    // 2. GPS FILTER SERVICE — Clean and validate batch
    const filterResult = gpsFilter.filterBatch(batch, lastKnownPoint);
    let { validPoints: filteredPoints } = filterResult;

    if (filteredPoints.length === 0) {
      console.log('[EnterpriseTracking] All points filtered out');
      return { success: true, pointsProcessed: 0, filtered: true };
    }

    // 3. Apply Kalman filter smoothing
    const startPoint = lastKnownPoint || {
      latitude: filteredPoints[0].latitude,
      longitude: filteredPoints[0].longitude,
      accuracy: filteredPoints[0].accuracy || 10
    };
    const smoothedPoints = geoService.smoothPoints(startPoint, filteredPoints);

    // 4. ROAD SNAP SERVICE — Snap to roads (async, non-blocking)
    let snappedPoints = smoothedPoints;
    let snapProvider = 'none';
    
    try {
      const snapResult = await roadSnap.snapToRoad(smoothedPoints);
      if (snapResult.success && snapResult.snappedPoints.length > 0) {
        snappedPoints = snapResult.snappedPoints;
        snapProvider = snapResult.provider;
        console.log(`[EnterpriseTracking] Road snap: ${snapResult.snappedPoints.length} points snapped via ${snapResult.provider}`);
      }
    } catch (snapErr) {
      console.warn('[EnterpriseTracking] Road snap failed, using raw coordinates:', snapErr.message);
    }

    // 5. Save to RawTrackingPoint collection
    const rawPoints = snappedPoints.map(point => ({
      userId: resolvedUserId,
      location: { type: 'Point', coordinates: [point.longitude, point.latitude] },
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
      routeStatus: point.routeStatus || 'raw',
      processedTime: new Date(),
      provider: snapProvider
    }));

    // Deduplicate against existing records
    const timestamps = rawPoints.map(p => p.timestamp);
    const existingRawPoints = await RawTrackingPoint.find({
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
      lastPoint = await RawTrackingPoint.findOne({ userId: resolvedUserId }).sort('-timestamp');
    }

    // 6. Calculate distance using snapped coordinates (road distance)
    let batchDistance = 0;
    if (snappedPoints.length >= 2) {
      batchDistance = roadSnap.calculateSnappedDistance(snappedPoints);
    }

    // 7. Update Attendance tracking logs
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setUTCHours(23, 59, 59, 999);
    
    const attendance = await Attendance.findOne({
      user: resolvedUserId,
      date: { $gte: todayStart, $lte: todayEnd }
    }).sort('-date');

    if (attendance) {
      const logsToPush = uniqueRawPoints.map(p => ({
        time: p.timestamp,
        latitude: p.snappedLatitude || p.rawLatitude || p.location.coordinates[1],
        longitude: p.snappedLongitude || p.rawLongitude || p.location.coordinates[0],
        isSuspicious: p.status === 'suspicious',
        accuracy: p.accuracy,
        speed: p.speed,
        heading: p.heading
      }));

      const mergedLogs = [...attendance.trackingLogs, ...logsToPush];
      mergedLogs.sort((a, b) => new Date(a.time) - new Date(b.time));

      const deduplicatedLogs = [];
      const seenTimes = new Set();
      for (const log of mergedLogs) {
        const timeMs = new Date(log.time).getTime();
        if (!seenTimes.has(timeMs)) {
          seenTimes.add(timeMs);
          deduplicatedLogs.push(log);
        }
      }

      let accumulatedDistance = 0;
      for (let i = 0; i < deduplicatedLogs.length; i++) {
        if (i === 0) {
          deduplicatedLogs[i].distanceFromPrevious = 0;
          deduplicatedLogs[i].totalDistanceTillNow = 0;
        } else {
          const prev = deduplicatedLogs[i - 1];
          const curr = deduplicatedLogs[i];
          const dist = geoService.calculateDistance(
            prev.latitude, prev.longitude,
            curr.latitude, curr.longitude
          );
          const validDist = dist >= 0.005 ? dist : 0;
          deduplicatedLogs[i].distanceFromPrevious = parseFloat((validDist * 1000).toFixed(2));
          accumulatedDistance += validDist;
          deduplicatedLogs[i].totalDistanceTillNow = parseFloat(accumulatedDistance.toFixed(6));
        }
      }

      attendance.trackingLogs = deduplicatedLogs;
      attendance.totalDistance = parseFloat(accumulatedDistance.toFixed(6));
      attendance.distance = attendance.totalDistance;
      await attendance.save();
    }

    // 8. Update Live Employee Status
    if (lastPoint) {
      liveStatus.lastLocation = lastPoint.location;
      liveStatus.lastRawLocation = { type: 'Point', coordinates: [lastPoint.rawLongitude || lastPoint.location.coordinates[0], lastPoint.rawLatitude || lastPoint.location.coordinates[1]] };
      
      if (lastPoint.snappedLatitude && lastPoint.snappedLongitude) {
        liveStatus.lastSnappedLocation = { type: 'Point', coordinates: [lastPoint.snappedLongitude, lastPoint.snappedLatitude] };
      }
      
      liveStatus.currentSpeed = lastPoint.speed;
      liveStatus.lastUpdate = lastPoint.timestamp;
      liveStatus.totalDistanceToday = attendance ? attendance.totalDistance : (liveStatus.totalDistanceToday + batchDistance);
      liveStatus.movementState = detectMovementState(lastPoint.speed);
      liveStatus.currentStatus = 'online';
      liveStatus.trackingStatus = 'active';
      liveStatus.tripId = lastPoint.tripId;
      
      // Signal quality from accuracy
      if (lastPoint.accuracy) {
        if (lastPoint.accuracy < 20) liveStatus.signalQuality = 'strong';
        else if (lastPoint.accuracy < 50) liveStatus.signalQuality = 'weak';
        else liveStatus.signalQuality = 'lost';
      }
      
      if (lastPoint.battery) liveStatus.batteryLevel = lastPoint.battery;
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
        reverseGeocodeAsync(resolvedUserId, lastPoint).catch(err => {
          console.error('[EnterpriseTracking] Background geocoding invocation failed:', err);
        });
      }
    }

    await liveStatus.save();

    // 10. Real-time broadcast to Admin (Socket.IO)
    if (socketIo) {
      const broadcastPoint = lastPoint;
      const snappedLat = broadcastPoint?.snappedLatitude || broadcastPoint?.location?.coordinates[1];
      const snappedLng = broadcastPoint?.snappedLongitude || broadcastPoint?.location?.coordinates[0];
      
      socketIo.emit('liveTrackingUpdate', {
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
        path: uniqueRawPoints.map(p => ({ 
          lat: p.snappedLatitude || p.location.coordinates[1], 
          lng: p.snappedLongitude || p.location.coordinates[0],
          rawLat: p.rawLatitude || p.location.coordinates[1],
          rawLng: p.rawLongitude || p.location.coordinates[0],
          status: p.status,
          speed: p.speed,
          timestamp: p.timestamp
        }))
      });
    }

    // 11. Handle 1-minute Aggregation
    await bufferForAggregation(resolvedUserId, uniqueRawPoints, batchDistance);

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
async function reverseGeocodeAsync(userId, lastPoint) {
  try {
    const [longitude, latitude] = lastPoint.location.coordinates;
    const address = await reverseGeocodeLatLng(latitude, longitude);

    if (address) {
      // 1. Update Live Employee Status
      await LiveEmployeeStatus.updateOne(
        { userId },
        { 
          $set: { 
            lastAddress: address,
            lastGeocodedLocation: lastPoint.location,
            lastGeocodeTime: new Date()
          } 
        }
      );

      // 2. Update the address on the RawTrackingPoint itself
      await RawTrackingPoint.updateOne(
        { _id: lastPoint._id },
        { $set: { address } }
      );

      // 3. Update active Attendance tracking log
      const attendance = await Attendance.findOne({
        user: userId,
        "punchOut.time": { $exists: false }
      }).sort('-date');

      if (attendance && attendance.trackingLogs.length > 0) {
        const lastLogIndex = attendance.trackingLogs.length - 1;
        await Attendance.updateOne(
          { _id: attendance._id, "trackingLogs._id": attendance.trackingLogs[lastLogIndex]._id },
          { $set: { "trackingLogs.$.address": address } }
        );
      }
    }
  } catch (err) {
    console.error('[EnterpriseTracking] Asynchronous reverse geocoding task failed:', err.message);
  }
}

exports.reverseGeocodeAsync = reverseGeocodeAsync;

/**
 * Buffers points for 1-minute aggregation
 */
async function bufferForAggregation(userId, points, distance) {
  if (!points || points.length === 0) return;
  
  const now = new Date();
  const minuteKey = `${userId}_${now.getFullYear()}_${now.getMonth()}_${now.getDate()}_${now.getHours()}_${now.getMinutes()}`;
  
  let buffer = aggregationBuffer.get(minuteKey);
  if (!buffer) {
    buffer = {
      userId,
      points: [],
      distance: 0,
      startTime: points[0].timestamp,
      count: 0
    };
    aggregationBuffer.set(minuteKey, buffer);
    
    // Schedule flush after 1 minute
    setTimeout(() => flushAggregation(minuteKey), 65000);
  }

  buffer.points.push(...points);
  buffer.distance += distance;
  buffer.count += points.length;
}

/**
 * Flushes 1-minute buffer to TrackingLog collection
 */
async function flushAggregation(minuteKey) {
  const buffer = aggregationBuffer.get(minuteKey);
  if (!buffer) return;

  try {
    const { userId, points, distance, startTime } = buffer;
    if (points.length === 0) return;

    const endTime = points[points.length - 1].timestamp;
    const avgSpeed = points.reduce((acc, p) => acc + (p.speed || 0), 0) / points.length;
    const maxSpeed = Math.max(...points.map(p => p.speed || 0));
    
    // Build both raw and snapped paths
    const rawPath = points.map(p => p.location?.coordinates || [p.rawLongitude || p.longitude, p.rawLatitude || p.latitude]);
    const snappedPath = points
      .filter(p => p.snappedLatitude && p.snappedLongitude)
      .map(p => [p.snappedLongitude, p.snappedLatitude]);

    const log = new TrackingLog({
      userId,
      startTime,
      endTime,
      startLocation: points[0].location || { type: 'Point', coordinates: rawPath[0] },
      endLocation: points[points.length - 1].location || { type: 'Point', coordinates: rawPath[rawPath.length - 1] },
      distance: parseFloat(distance.toFixed(3)),
      rawDistance: parseFloat(distance.toFixed(3)),
      avgSpeed: parseFloat(avgSpeed.toFixed(2)),
      maxSpeed: parseFloat(maxSpeed.toFixed(2)),
      movementStatus: detectMovementState(avgSpeed),
      path: rawPath,
      snappedPath: snappedPath.length > 0 ? snappedPath : undefined,
      avgAccuracy: points.reduce((acc, p) => acc + (p.accuracy || 0), 0) / points.length
    });

    await log.save();
    aggregationBuffer.delete(minuteKey);
  } catch (err) {
    console.error('[EnterpriseTracking] Flush Error:', err);
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
