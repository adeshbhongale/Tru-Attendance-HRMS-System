const { LiveEmployeeStatus } = require('../models/Tracking');
const Attendance = require('../models/Attendance');

/**
 * Process a heartbeat event from the mobile app.
 * Updates LiveEmployeeStatus with latest battery, network, and gps time.
 */
async function processHeartbeat(userId, heartbeatData, companyId) {
  try {
    let liveStatus = await LiveEmployeeStatus.findOne({ userId, ...(companyId ? { companyId } : {}) });
    if (!liveStatus) {
      liveStatus = new LiveEmployeeStatus({ userId, companyId: companyId || null });
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
async function processHealthUpdate(userId, healthData, companyId) {
  try {
    let liveStatus = await LiveEmployeeStatus.findOne({ userId, ...(companyId ? { companyId } : {}) });
    if (!liveStatus) {
      liveStatus = new LiveEmployeeStatus({ userId, companyId: companyId || null });
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
 * 
 * FIX #19: Uses batch query for LiveEmployeeStatus instead of N+1 queries.
 * FIX #29: Uses lastGpsTime timestamp for stuck detection instead of limited raw point count.
 */
async function runWatchdogCycle(io) {
  try {
    // Find punched-in attendances in the last 24 hours
    const activeAttendances = await Attendance.find({
      "punchIn.time": { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      "punchOut.time": { $exists: false }
    }).populate('user');

    if (activeAttendances.length === 0) return;

    // FIX #19: Batch query all LiveEmployeeStatus records at once
    const activeUserIds = activeAttendances
      .filter(att => att.user)
      .map(att => att.user._id);
    
    const allLiveStatuses = await LiveEmployeeStatus.find({
      userId: { $in: activeUserIds }
    });
    
    // Build a Map for O(1) lookup instead of N queries
    const liveStatusMap = new Map();
    for (const ls of allLiveStatuses) {
      liveStatusMap.set(ls.userId.toString(), ls);
    }

    // Track which statuses need saving (batch save at end)
    const statusesToSave = [];

    for (const att of activeAttendances) {
      if (!att.user) continue;
      
      const userIdStr = att.user._id.toString();
      const attCompanyId = att.user.companyId || att.user.company || null;
      let liveStatus = liveStatusMap.get(userIdStr);
      if (!liveStatus) {
        liveStatus = new LiveEmployeeStatus({ userId: att.user._id, companyId: attCompanyId });
        liveStatusMap.set(userIdStr, liveStatus);
      }

      const now = Date.now();
      // FIX #29: Use lastGpsTime for stuck detection — not limited raw point count
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

          // Send telemetry alarm notification to admin
          try {
            const minutesDiff = lastHb ? ((now - lastHb.getTime()) / 60000).toFixed(1) : 'unknown';
            const notificationService = require('./notificationService');
            await notificationService.createAndSendNotification({
              companyId: attCompanyId,
              title: 'Tracking Unresponsive 🚨',
              description: `Employee ${att.user.name} (${att.user.email}) app heartbeat has stopped for ${minutesDiff} minutes.`,
              type: 'emergency notification', // FIX #20: Fixed typo from 'emergancy'
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
        statusesToSave.push(liveStatus);
        
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

    // Batch save all changed statuses
    if (statusesToSave.length > 0) {
      await Promise.all(statusesToSave.map(s => s.save()));
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
