const { LiveEmployeeStatus } = require('../models/Tracking');
const Attendance = require('../models/Attendance');

/**
 * Process a heartbeat event from the mobile app.
 * Updates LiveEmployeeStatus with latest battery, network, and gps time.
 */
async function processHeartbeat(userId, heartbeatData) {
  try {
    let liveStatus = await LiveEmployeeStatus.findOne({ userId });
    if (!liveStatus) {
      liveStatus = new LiveEmployeeStatus({ userId });
    }

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
      const timeSinceLastGps = Date.now() - liveStatus.lastGpsTime.getTime();
      if (timeSinceLastGps < 90000) {
        liveStatus.trackingHealth = 'healthy';
        liveStatus.trackingHealthReason = 'GPS is active and up to date';
        liveStatus.recoveryAttempts = 0;
      }
    }

    await liveStatus.save();
    return liveStatus;
  } catch (err) {
    console.error('[TrackingHealthService] Error in processHeartbeat:', err.message);
  }
}

/**
 * Handle direct health status updates reported from the mobile app (e.g. permission_lost, battery_optimized)
 */
async function processHealthUpdate(userId, healthData) {
  try {
    let liveStatus = await LiveEmployeeStatus.findOne({ userId });
    if (!liveStatus) {
      liveStatus = new LiveEmployeeStatus({ userId });
    }

    if (healthData.trackingHealth) {
      liveStatus.trackingHealth = healthData.trackingHealth;
      liveStatus.trackingHealthReason = healthData.trackingHealthReason || '';
    }
    
    liveStatus.lastUpdate = new Date();
    await liveStatus.save();
    return liveStatus;
  } catch (err) {
    console.error('[TrackingHealthService] Error in processHealthUpdate:', err.message);
  }
}

/**
 * Watchdog cycle runs every 30 seconds to monitor tracking health of active (punched-in) employees.
 * If GPS is unresponsive while heartbeat is active, emits 'restart_tracking' Socket event.
 */
async function runWatchdogCycle(io) {
  try {
    const cutoffTime = new Date(Date.now() - 300000); // 5 minutes cutoff for offline transition
    
    // Find punched-in attendances in the last 24 hours
    const activeAttendances = await Attendance.find({
      "punchIn.time": { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      "punchOut.time": { $exists: false }
    }).populate('user');

    for (const att of activeAttendances) {
      if (!att.user) continue;
      
      let liveStatus = await LiveEmployeeStatus.findOne({ userId: att.user._id });
      if (!liveStatus) {
        liveStatus = new LiveEmployeeStatus({ userId: att.user._id });
      }

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

          // Send telemetry alarm notification to admin if they are offline
          try {
            const minutesDiff = lastHb ? ((now - lastHb.getTime()) / 60000).toFixed(1) : 'unknown';
            const notificationService = require('./notificationService');
            await notificationService.createAndSendNotification({
              title: 'Tracking Unresponsive 🚨',
              description: `Employee ${att.user.name} (${att.user.email}) app heartbeat has stopped for ${minutesDiff} minutes.`,
              type: 'emergancy notification',
              frequency: 'Instant',
              targetType: 'Role-based Employees',
              targetRole: 'admin',
              isAuto: false
            }, io);
          } catch (notifErr) {
            console.error('[TrackingWatchdog Notif Error]:', notifErr.message);
          }
        }
      } 
      // 2. Heartbeat is active, but GPS updates are delayed (> 90s)
      else if (timeSinceLastGps > 90000) {
        liveStatus.currentStatus = 'online';
        
        if (liveStatus.recoveryAttempts < 3) {
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
        await liveStatus.save();
        
        // Emit live update to admins
        io.emit('liveTrackingUpdate', {
          userId: att.user._id,
          trackingHealth: liveStatus.trackingHealth,
          trackingHealthReason: liveStatus.trackingHealthReason,
          currentStatus: liveStatus.currentStatus
        });
      }
    }
  } catch (err) {
    console.error('[TrackingWatchdog] Error in runWatchdogCycle:', err.message);
  }
}

module.exports = {
  processHeartbeat,
  processHealthUpdate,
  runWatchdogCycle
};
