const { RawTrackingPoint, TrackingSession, TrackingLog, LiveEmployeeStatus } = require('../models/Tracking');
const geoService = require('./geoTrackingService');

/**
 * Enterprise Tracking Service
 * Handles high-fidelity tracking, batching, and aggregation.
 */

// Memory buffer for 1-minute aggregation (Temporary store before DB write)
const aggregationBuffer = new Map(); 

exports.processTrackingBatch = async (userId, batch, socketIo) => {
  if (!batch || batch.length === 0) return;

  try {
    const validPoints = [];
    let batchDistance = 0;
    let lastValidPoint = null;

    // 1. Fetch or create Live Status for real-time broadcast
    let liveStatus = await LiveEmployeeStatus.findOne({ userId });
    if (!liveStatus) {
      liveStatus = new LiveEmployeeStatus({ userId });
    }

    // 2. Process each point in the 10-second batch
    for (const point of batch) {
      const { latitude, longitude, accuracy, speed, timestamp, isMock, heading } = point;

      // Basic Validation
      if (accuracy > 50) continue; // Skip noisy GPS
      if (isMock) {
        // Flag mock location usage
        liveStatus.movementState = 'Suspicious (Mock)';
      }

      const currentPoint = {
        userId,
        location: { type: 'Point', coordinates: [longitude, latitude] },
        accuracy,
        speed,
        heading,
        timestamp: new Date(timestamp),
        status: 'valid'
      };

      // Speed & Jump Validation against last known valid point
      const validation = geoService.validateLocation(lastValidPoint || {
        latitude: liveStatus.lastLocation?.coordinates[1],
        longitude: liveStatus.lastLocation?.coordinates[0],
        time: liveStatus.lastUpdate
      }, {
        latitude,
        longitude,
        accuracy,
        time: timestamp
      });

      if (!validation.isValid) {
        if (validation.isSuspicious) {
          currentPoint.status = 'suspicious';
        } else {
          continue; // Skip drift/noise
        }
      } else {
        batchDistance += validation.distance;
        lastValidPoint = { latitude, longitude, time: timestamp };
      }

      validPoints.push(currentPoint);
    }

    // 3. Batch insert raw points for route history
    if (validPoints.length > 0) {
      await RawTrackingPoint.insertMany(validPoints);

      // 4. Update Live Status
      const lastPoint = validPoints[validPoints.length - 1];
      liveStatus.lastLocation = lastPoint.location;
      liveStatus.currentSpeed = lastPoint.speed;
      liveStatus.lastUpdate = lastPoint.timestamp;
      liveStatus.totalDistanceToday += batchDistance;
      liveStatus.movementState = detectMovementState(lastPoint.speed);
      liveStatus.currentStatus = 'online';
      await liveStatus.save();

      // 5. Real-time broadcast to Admin (Socket.IO)
      if (socketIo) {
        socketIo.emit('liveTrackingUpdate', {
          userId,
          latitude: lastPoint.location.coordinates[1],
          longitude: lastPoint.location.coordinates[0],
          speed: lastPoint.speed,
          distance: liveStatus.totalDistanceToday,
          status: liveStatus.movementState,
          timestamp: lastPoint.timestamp,
          path: validPoints.map(p => ({ lat: p.location.coordinates[1], lng: p.location.coordinates[0] }))
        });
      }

      // 6. Handle 1-minute Aggregation
      await bufferForAggregation(userId, validPoints, batchDistance);
    }

    return { success: true, pointsProcessed: validPoints.length };
  } catch (err) {
    console.error('[EnterpriseTracking] Error processing batch:', err);
    throw err;
  }
};

/**
 * Buffers points for 1-minute aggregation
 */
async function bufferForAggregation(userId, points, distance) {
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
    
    const log = new TrackingLog({
      userId,
      startTime,
      endTime,
      startLocation: points[0].location,
      endLocation: points[points.length - 1].location,
      distance: parseFloat(distance.toFixed(3)),
      avgSpeed: parseFloat(avgSpeed.toFixed(2)),
      maxSpeed: parseFloat(maxSpeed.toFixed(2)),
      movementStatus: detectMovementState(avgSpeed),
      path: points.map(p => p.location.coordinates),
      avgAccuracy: points.reduce((acc, p) => acc + (p.accuracy || 0), 0) / points.length
    });

    await log.save();
    aggregationBuffer.delete(minuteKey);
    
    // Notify admin dashboard of new log row
    // (Could be via socket too)
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
