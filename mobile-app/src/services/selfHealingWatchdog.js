import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import socket from '../socket';
import { 
  getLastGpsTimestamp, 
  getLastGpsPoint, 
  isTrackingActive, 
  restartGpsWatcher 
} from './tracking.service';

let watchdogInterval = null;
let currentUserId = null;
let localRestartAttempts = 0;
let lastGpsResetTimestamp = 0;

// Stuck GPS tracking variables
let recentPoints = [];
const MAX_RECENT_POINTS = 5;
const STUCK_GPS_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Executes a single self-healing check on the device
 */
const runSelfHealingCheck = async () => {
  if (!currentUserId) return;
  if (!isTrackingActive()) {
    console.log('[SelfHealingWatchdog] Tracking is inactive. Skipping check.');
    return;
  }

  try {
    // 1. Permission check
    const { status: fg } = await Location.getForegroundPermissionsAsync();
    if (fg !== 'granted') {
      console.warn('[SelfHealingWatchdog] Foreground location permission revoked!');
      socket.emit('trackingHealthUpdate', {
        userId: currentUserId,
        trackingHealth: 'permission_lost',
        trackingHealthReason: 'Location permissions were revoked by the user.'
      });
      return;
    }

    // 2. GPS enabled check
    const gpsEnabled = await Location.hasServicesEnabledAsync();
    if (!gpsEnabled) {
      console.warn('[SelfHealingWatchdog] GPS/Location services are disabled!');
      socket.emit('trackingHealthUpdate', {
        userId: currentUserId,
        trackingHealth: 'gps_lost',
        trackingHealthReason: 'Device GPS / Location Services are turned off.'
      });
      return;
    }

    // 3. Foreground / Background Service check
    const LOCATION_TRACKING_TASK = 'background-location-tracking';
    const isBgTaskRunning = await Location.hasStartedLocationUpdatesAsync(LOCATION_TRACKING_TASK);
    if (!isBgTaskRunning) {
      console.warn('[SelfHealingWatchdog] Background tracking task is not running! Restarting background service...');
      try {
        const intervalStr = await AsyncStorage.getItem('currentBgInterval') || '5000';
        const interval = parseInt(intervalStr);
        await Location.startLocationUpdatesAsync(LOCATION_TRACKING_TASK, {
          accuracy: Location.Accuracy.High,
          timeInterval: interval,
          distanceInterval: 1,
          foregroundService: {
            notificationTitle: "Geo-Track HRMS",
            notificationBody: "Tracking active until punch out",
            notificationColor: "#4f46e5"
          }
        });
        
        socket.emit('trackingHealthUpdate', {
          userId: currentUserId,
          trackingHealth: 'service_restarting',
          trackingHealthReason: 'Background task was dead. Watchdog auto-restarted it.'
        });
      } catch (bgErr) {
        console.error('[SelfHealingWatchdog] Failed to restart background task:', bgErr.message);
      }
    }

    // 4. GPS Freshness & Stuck GPS Detection
    const lastGpsTime = getLastGpsTimestamp();
    const lastPoint = getLastGpsPoint();
    const now = Date.now();

    // Reset local restart attempts if we got a new GPS point since our last reset
    if (lastGpsTime > lastGpsResetTimestamp) {
      if (localRestartAttempts > 0) {
        console.log('[SelfHealingWatchdog] GPS point received. Resetting local restart attempts.');
        localRestartAttempts = 0;
      }
      lastGpsResetTimestamp = lastGpsTime;
    }

    // Track recent coordinates for stuck detection
    if (lastPoint) {
      const latFixed = parseFloat(lastPoint.latitude.toFixed(6));
      const lngFixed = parseFloat(lastPoint.longitude.toFixed(6));
      const ptKey = `${latFixed},${lngFixed}`;
      
      // Add if new point or empty
      if (recentPoints.length === 0 || recentPoints[recentPoints.length - 1].timestamp !== lastPoint.timestamp) {
        recentPoints.push({
          key: ptKey,
          timestamp: lastPoint.timestamp
        });
        if (recentPoints.length > MAX_RECENT_POINTS) {
          recentPoints.shift();
        }
      }
    }

    // A. Check for Stuck GPS (Same coordinate for > 5 minutes)
    if (recentPoints.length === MAX_RECENT_POINTS) {
      const firstPoint = recentPoints[0];
      const lastPoint = recentPoints[recentPoints.length - 1];
      const allIdentical = recentPoints.every(p => p.key === firstPoint.key);
      const timeElapsed = lastPoint.timestamp - firstPoint.timestamp;

      if (allIdentical && timeElapsed >= STUCK_GPS_TIMEOUT_MS) {
        console.warn(`[SelfHealingWatchdog] Stuck GPS detected! Lat/Lng unchanged for ${Math.round(timeElapsed/60000)} minutes.`);
        recentPoints = []; // reset queue
        
        socket.emit('trackingHealthUpdate', {
          userId: currentUserId,
          trackingHealth: 'recovering',
          trackingHealthReason: 'Stuck GPS coordinates detected. Restarting watcher...'
        });

        await restartGpsWatcher();
        localRestartAttempts++;
        return;
      }
    }

    // B. Check for GPS Freshness (No coordinates collected for > 60s)
    const timeSinceLastGps = lastGpsTime > 0 ? (now - lastGpsTime) : (now - lastGpsResetTimestamp);
    if (timeSinceLastGps > 60000) {
      console.warn(`[SelfHealingWatchdog] GPS is stale. No new points for ${Math.round(timeSinceLastGps/1000)} seconds.`);
      
      if (localRestartAttempts < 3) {
        localRestartAttempts++;
        console.log(`[SelfHealingWatchdog] Attempting local GPS watcher restart #${localRestartAttempts}...`);
        
        socket.emit('trackingHealthUpdate', {
          userId: currentUserId,
          trackingHealth: 'recovering',
          trackingHealthReason: `Local GPS stale for ${Math.round(timeSinceLastGps/1000)}s. Restart attempt #${localRestartAttempts}`
        });

        await restartGpsWatcher();
      } else {
        console.error('[SelfHealingWatchdog] Local restart attempts exhausted. Escalating to backend.');
        socket.emit('trackingHealthUpdate', {
          userId: currentUserId,
          trackingHealth: 'gps_lost',
          trackingHealthReason: `GPS unresponsive. Local restarts exhausted.`
        });
      }
    }
  } catch (err) {
    console.error('[SelfHealingWatchdog] Error in runSelfHealingCheck:', err.message);
  }
};

/**
 * Start the self-healing watchdog cycle
 */
export const startSelfHealingWatchdog = (userId) => {
  if (watchdogInterval) {
    clearInterval(watchdogInterval);
  }

  currentUserId = userId;
  localRestartAttempts = 0;
  lastGpsResetTimestamp = Date.now();
  recentPoints = [];

  console.log(`[SelfHealingWatchdog] Started self-healing watchdog for user ${userId}`);

  // Run immediately, then every 30s
  setTimeout(runSelfHealingCheck, 5000);
  watchdogInterval = setInterval(runSelfHealingCheck, 30000);
};

/**
 * Stop the self-healing watchdog cycle
 */
export const stopSelfHealingWatchdog = () => {
  console.log('[SelfHealingWatchdog] Stopping self-healing watchdog');
  if (watchdogInterval) {
    clearInterval(watchdogInterval);
    watchdogInterval = null;
  }
  currentUserId = null;
};
