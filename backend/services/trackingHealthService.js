const Attendance = require('../models/Attendance');
const cache = require('./trackingCache');

/**
 * Process a heartbeat event from the mobile app.
 * OPTIMIZED: Uses in-memory cache instead of MongoDB.
 * Was: 2 MongoDB queries per heartbeat (findOne + save) × 120/hr = 240 queries/hr/employee.
 * Now: 0 MongoDB queries per heartbeat. Data flushes via cache every 30s.
 */
async function processHeartbeat(userId, heartbeatData, companyId) {
  try {
    // CACHE: Read/write LiveStatus from RAM (0 MongoDB queries)
    const liveStatus = await cache.liveStatus.get(userId, companyId);

    liveStatus.lastHeartbeat = new Date();
    
    if (heartbeatData.battery !== undefined) {
      liveStatus.heartbeatBattery = heartbeatData.battery;
      liveStatus.batteryLevel = heartbeatData.battery;
    }
    
    if (heartbeatData.network) {
      liveStatus.heartbeatNetwork = heartbeatData.network;
    }

    if (heartbeatData.lastGpsTime) {
      liveStatus.lastGpsTime = new Date(heartbeatData.lastGpsTime);
    }

    if (heartbeatData.trackingHealth) {
      liveStatus.trackingHealth = heartbeatData.trackingHealth;
      liveStatus.trackingHealthReason = heartbeatData.trackingHealthReason || '';
    } else if (liveStatus.lastGpsTime) {
      const timeSinceLastGps = Date.now() - new Date(liveStatus.lastGpsTime).getTime();
      if (timeSinceLastGps < 90000) {
        liveStatus.trackingHealth = 'healthy';
        liveStatus.trackingHealthReason = 'GPS is active and up to date';
        liveStatus.recoveryAttempts = 0;
      }
    }

    // Mark dirty — will flush to MongoDB in next 30s cycle
    cache.liveStatus.markDirty(userId, companyId);
    return liveStatus;
  } catch (err) {
    console.error('[TrackingHealthService] Error in processHeartbeat:', err.message);
  }
}

/**
 * Handle direct health status updates reported from the mobile app (e.g. permission_lost, battery_optimized)
 * OPTIMIZED: Uses in-memory cache instead of MongoDB.
 */
async function processHealthUpdate(userId, healthData, companyId) {
  try {
    // CACHE: Read/write LiveStatus from RAM (0 MongoDB queries)
    const liveStatus = await cache.liveStatus.get(userId, companyId);

    if (healthData.trackingHealth) {
      liveStatus.trackingHealth = healthData.trackingHealth;
      liveStatus.trackingHealthReason = healthData.trackingHealthReason || '';
    }
    
    liveStatus.lastUpdate = new Date();
    cache.liveStatus.markDirty(userId, companyId);
    return liveStatus;
  } catch (err) {
    console.error('[TrackingHealthService] Error in processHealthUpdate:', err.message);
  }
}

/**
 * Watchdog cycle runs every 30 seconds to monitor tracking health of active (punched-in) employees.
 * If GPS is unresponsive while heartbeat is active, emits 'restart_tracking' Socket event.
 * 
 * OPTIMIZED: Reads LiveEmployeeStatus from in-memory cache instead of batch MongoDB query.
 * The Attendance.find() query for active sessions is kept — it runs once per 30s (not per-employee)
 * and is needed to discover who is currently punched in.
 */
async function runWatchdogCycle(io) {
  try {
    // This single query runs once per 30s globally — acceptable overhead
    const activeAttendances = await Attendance.find({
      "punchIn.time": { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      "punchOut.time": { $exists: false }
    }).populate('user');

    if (activeAttendances.length === 0) return;

    // Track which statuses changed (for socket broadcast)
    const changedStatuses = [];

    for (const att of activeAttendances) {
      if (!att.user) continue;
      
      const userIdStr = att.user._id.toString();
      const attCompanyId = att.user.companyId || att.user.company || null;
      
      // CACHE: Read LiveStatus from RAM (was: LiveEmployeeStatus.find batch query)
      const liveStatus = await cache.liveStatus.get(userIdStr, attCompanyId);

      const now = Date.now();
      const lastGps = liveStatus.lastGpsTime ? new Date(liveStatus.lastGpsTime) : null;
      const lastHb = liveStatus.lastHeartbeat ? new Date(liveStatus.lastHeartbeat) : null;
      
      const timeSinceLastGps = lastGps ? (now - lastGps.getTime()) : Infinity;
      const timeSinceLastHeartbeat = lastHb ? (now - lastHb.getTime()) : Infinity;

      let changed = false;

      // 1. Check if heartbeat is dead (no heartbeat for > 120s)
      if (timeSinceLastHeartbeat > 120000) {
        if (liveStatus.currentStatus !== 'offline') {
          liveStatus.currentStatus = 'offline';
          liveStatus.trackingStatus = 'offline';
          liveStatus.trackingHealth = 'gps_lost';
          liveStatus.trackingHealthReason = 'App unresponsive (no heartbeat for > 120s)';
          changed = true;
        }
      } 
      // 2. Heartbeat is active, but GPS updates are delayed (> 90s)
      else if (timeSinceLastGps > 90000) {
        liveStatus.currentStatus = 'online';
        
        if ((liveStatus.recoveryAttempts || 0) < 3) {
          liveStatus.trackingHealth = 'recovering';
          liveStatus.trackingHealthReason = `GPS delayed by ${Math.round(timeSinceLastGps / 1000)}s. Attempting remote restart...`;
          liveStatus.recoveryAttempts = (liveStatus.recoveryAttempts || 0) + 1;
          liveStatus.lastRecoveryTime = new Date();
          changed = true;

          console.log(`[TrackingWatchdog] Emitting restart_tracking to user ${att.user._id} (${att.user.email}). Attempt ${liveStatus.recoveryAttempts}`);
          
          // Emit socket event to the user's specific room
          io.to(att.user._id.toString()).emit('restart_tracking', {
            userId: att.user._id.toString(),
            attempt: liveStatus.recoveryAttempts,
            reason: 'GPS inactive while heartbeat connected'
          });
        } else if (liveStatus.trackingHealth !== 'gps_lost') {
          liveStatus.trackingHealth = 'gps_lost';
          liveStatus.trackingHealthReason = 'GPS missing. Restart attempts exhausted.';
          changed = true;
        }
      }
      // 3. GPS is healthy and fresh (< 90s)
      else {
        if (liveStatus.trackingHealth !== 'healthy' || liveStatus.recoveryAttempts !== 0) {
          liveStatus.trackingHealth = 'healthy';
          liveStatus.trackingHealthReason = 'GPS is active and up to date';
          liveStatus.recoveryAttempts = 0;
          liveStatus.currentStatus = 'online';
          liveStatus.trackingStatus = 'active';
          changed = true;
        }
      }

      if (changed) {
        // CACHE: Mark dirty — will flush in next 30s cycle (was: individual .save() per status)
        cache.liveStatus.markDirty(userIdStr, attCompanyId);
        
        // Emit live update to admins via company-scoped room
        const updatePayload = {
          userId: att.user._id,
          companyId: attCompanyId,
          trackingHealth: liveStatus.trackingHealth,
          trackingHealthReason: liveStatus.trackingHealthReason,
          currentStatus: liveStatus.currentStatus
        };
        if (io.to && attCompanyId) {
          io.to(`company:${attCompanyId}:admin`).emit('liveTrackingUpdate', updatePayload);
        }
      }
    }

    // No explicit flush needed — the global 30s flush timer handles it
  } catch (err) {
    console.error('[TrackingWatchdog] Error in runWatchdogCycle:', err.message);
  }
}

module.exports = {
  processHeartbeat,
  processHealthUpdate,
  runWatchdogCycle
};
