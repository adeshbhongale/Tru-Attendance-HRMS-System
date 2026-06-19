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
    const rawPoints = snappedPoints.map(point => {
      const lat = point.snappedLatitude || point.latitude;
      const lng = point.snappedLongitude || point.longitude;
      const isOffline = !!point.isOffline;
      return {
        userId: resolvedUserId,
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
        status: isOffline ? 'offline' : (point.status || 'valid'),
        isMock: point.isMock || false,
        isOffline,
        routeStatus: point.routeStatus || 'raw',
        processedTime: new Date(),
        provider: snapProvider
      };
    });

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
    let attendance = null;
    const firstPoint = uniqueRawPoints[0] || batch[0];

    // Attempt 1: Find by tripId if it's a valid ObjectId
    if (firstPoint && firstPoint.tripId && mongoose.Types.ObjectId.isValid(firstPoint.tripId)) {
      attendance = await Attendance.findById(firstPoint.tripId);
    }

    // Attempt 2: Find by checking the date of the batch points
    if (!attendance && firstPoint) {
      const pointDate = new Date(firstPoint.timestamp || firstPoint.time);
      const pointStart = new Date(pointDate);
      pointStart.setUTCHours(0, 0, 0, 0);
      const pointEnd = new Date(pointDate);
      pointEnd.setUTCHours(23, 59, 59, 999);

      attendance = await Attendance.findOne({
        user: resolvedUserId,
        date: { $gte: pointStart, $lte: pointEnd }
      }).sort('-date');
    }

    // Attempt 3: Find the latest active session (no punchOut)
    if (!attendance) {
      attendance = await Attendance.findOne({
        user: resolvedUserId,
        "punchOut.time": { $exists: false }
      }).sort('-date');
    }

    // Attempt 4: Ultimate fallback to today's date if no other matches
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

    if (attendance) {
      const logsToPush = uniqueRawPoints.map(p => ({
        time: p.timestamp,
        latitude: p.snappedLatitude || p.rawLatitude || p.location.coordinates[1],
        longitude: p.snappedLongitude || p.rawLongitude || p.location.coordinates[0],
        address: p.address || null,
        isSuspicious: p.status === 'suspicious',
        isOffline: !!p.isOffline || p.status === 'offline',
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

      try {
        const lastValidLog = deduplicatedLogs[deduplicatedLogs.length - 1];
        const mongoose = require('mongoose');
        if (lastValidLog && mongoose.connection.readyState === 1) {
          const User = require('../models/User');
          const Location = require('../models/Location');
          const { calculateDistance } = require('../utils/geofence');
          const userObj = await User.findById(resolvedUserId).populate('workingPlace');
          const office = userObj?.workingPlace || (await Location.findOne({ name: 'Office Main' }) || await Location.findOne());
          
          if (office) {
            const isOutside = calculateDistance(lastValidLog.latitude, lastValidLog.longitude, office.latitude, office.longitude) > office.radius;
            const previousOutside = attendance.isOutside;
            attendance.isOutside = isOutside;

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
      
      // Signal quality from accuracy & offline status
      if (lastPoint.isOffline || lastPoint.status === 'offline') {
        liveStatus.signalQuality = 'lost';
        liveStatus.currentStatus = 'offline';
        liveStatus.trackingStatus = 'offline';
      } else if (lastPoint.accuracy) {
        if (lastPoint.accuracy < 20) liveStatus.signalQuality = 'strong';
        else if (lastPoint.accuracy < 50) liveStatus.signalQuality = 'weak';
        else liveStatus.signalQuality = 'lost';
        
        liveStatus.currentStatus = 'online';
        liveStatus.trackingStatus = 'active';
      }
      
      if (lastPoint.battery) liveStatus.batteryLevel = lastPoint.battery;

      // Calculate stops for today on-the-fly and update liveStatus
      try {
        const startOfDay = new Date(lastPoint.timestamp);
        startOfDay.setUTCHours(0, 0, 0, 0);
        const endOfDay = new Date(lastPoint.timestamp);
        endOfDay.setUTCHours(23, 59, 59, 999);

        const query = RawTrackingPoint.find({
          userId: resolvedUserId,
          timestamp: { $gte: startOfDay, $lte: endOfDay }
        });
        const todayRawPoints = typeof query.sort === 'function' ? await query.sort('timestamp') : await query;

        let stopsCount = 0;
        let idleStart = null;
        for (const point of todayRawPoints) {
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
        liveStatus.stops = stopsCount;
      } catch (stopErr) {
        console.error('[EnterpriseTracking] Failed to calculate stops:', stopErr.message);
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
        reverseGeocodeAsync(resolvedUserId, uniqueRawPoints, lastPoint, socketIo).catch(err => {
          console.error('[EnterpriseTracking] Background geocoding invocation failed:', err);
        });
      }
    }

    await liveStatus.save();

    // Mark the user as online in the User model since they are actively sending tracking batches
    const User = require('../models/User');
    await User.findByIdAndUpdate(resolvedUserId, { isOnline: true });

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
async function reverseGeocodeAsync(userId, points, lastPoint = null, socketIo = null) {
  try {
    let pointsToProcess = [];
    let targetLastPoint = lastPoint;

    if (Array.isArray(points)) {
      pointsToProcess = points;
    } else if (points) {
      pointsToProcess = [points];
      if (!targetLastPoint) {
        targetLastPoint = points;
      }
    }

    if (pointsToProcess.length === 0) return;

    // Filter points in the batch to geocode:
    // Always include targetLastPoint.
    // Also include points that represent a different minute.
    const pointsToGeocode = [];
    const seenMinutes = new Set();

    // Loop from last to first so we prioritize geocoding the latest points first
    for (let i = pointsToProcess.length - 1; i >= 0; i--) {
      const p = pointsToProcess[i];
      const time = new Date(p.timestamp || p.processedTime);
      const minuteKey = `${time.getFullYear()}-${time.getMonth()}-${time.getDate()} ${time.getHours()}:${time.getMinutes()}`;

      const isLast = (p.timestamp && targetLastPoint && new Date(p.timestamp).getTime() === new Date(targetLastPoint.timestamp).getTime());

      if (isLast || !seenMinutes.has(minuteKey)) {
        pointsToGeocode.push(p);
        seenMinutes.add(minuteKey);
      }
    }

    // Process in chronological order
    pointsToGeocode.reverse();

    // Resolve addresses sequentially with a 1-second delay to respect Nominatim API rate limits
    for (let i = 0; i < pointsToGeocode.length; i++) {
      const point = pointsToGeocode[i];
      const lat = point.snappedLatitude || point.rawLatitude || point.location.coordinates[1];
      const lng = point.snappedLongitude || point.rawLongitude || point.location.coordinates[0];

      if (i > 0) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      const address = await reverseGeocodeLatLng(lat, lng);

      if (address) {
        // a) Update address in RawTrackingPoint
        await RawTrackingPoint.updateOne(
          { userId, timestamp: point.timestamp },
          { $set: { address } }
        );

        // b) Update address in Attendance.trackingLogs
        const pointTime = new Date(point.timestamp);
        let updateResult = await Attendance.updateOne(
          { 
            user: userId, 
            "trackingLogs.time": pointTime 
          },
          { 
            $set: { "trackingLogs.$.address": address } 
          }
        );

        if (updateResult.matchedCount === 0) {
          // JS Fallback in case exact Date object query fails
          const pointDateStart = new Date(pointTime);
          pointDateStart.setUTCHours(0, 0, 0, 0);
          const pointDateEnd = new Date(pointTime);
          pointDateEnd.setUTCHours(23, 59, 59, 999);

          const attendance = await Attendance.findOne({
            user: userId,
            date: { $gte: pointDateStart, $lte: pointDateEnd }
          });

          if (attendance && attendance.trackingLogs && attendance.trackingLogs.length > 0) {
            const logItem = attendance.trackingLogs.find(log => 
              Math.abs(new Date(log.time).getTime() - pointTime.getTime()) < 2000
            );

            if (logItem) {
              logItem.address = address;
              await attendance.save();
            }
          }
        }

        // c) If this is the last point, update LiveEmployeeStatus and emit socket update
        const isLastPoint = (targetLastPoint && new Date(point.timestamp).getTime() === new Date(targetLastPoint.timestamp).getTime());
        if (isLastPoint) {
          await LiveEmployeeStatus.updateOne(
            { userId },
            { 
              $set: { 
                lastAddress: address,
                lastGeocodedLocation: point.location,
                lastGeocodeTime: new Date()
              } 
            }
          );

          if (socketIo) {
            socketIo.emit('liveTrackingUpdate', {
              userId,
              latitude: point.snappedLatitude || point.location.coordinates[1],
              longitude: point.snappedLongitude || point.location.coordinates[0],
              rawLatitude: point.rawLatitude || point.location.coordinates[1],
              rawLongitude: point.rawLongitude || point.location.coordinates[0],
              speed: point.speed,
              address: address,
              timestamp: point.timestamp,
              provider: point.provider || 'none',
              path: [] // Empty path prevents duplicate path rendering on live append
            });
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
