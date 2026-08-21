import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import * as Location from 'expo-location';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { startHeartbeat, stopHeartbeat } from './heartbeat.service';
import { startSelfHealingWatchdog, stopSelfHealingWatchdog } from './selfHealingWatchdog';
import { forceSyncAll, startSyncLoop, stopSyncLoop } from './sync.service';
import { startTracking as startFgTracking, stopTracking as stopFgTracking, forceCollectPoint } from './tracking.service';

const LOCATION_TRACKING_TASK = 'background-location-tracking';

export const isBackgroundLocationSupported = () => {
  if (Platform.OS === 'web') return false;
  try {
    const isExpoGo = Constants?.appOwnership === 'expo' || Constants?.executionEnvironment === 'storeClient';
    if (isExpoGo) return false;
    return (
      typeof Location?.startLocationUpdatesAsync === 'function' &&
      typeof Location?.hasStartedLocationUpdatesAsync === 'function'
    );
  } catch (e) {
    return false;
  }
};

/**
 * Fixed GPS collection interval (5 seconds).
 */
const GPS_INTERVAL_MS = 5000;

let isManagerActive = false;
let netInfoUnsubscribe = null;
let fgIntervalId = null;

const startForegroundPolling = () => {
  if (fgIntervalId) clearInterval(fgIntervalId);
  fgIntervalId = setInterval(async () => {
    try {
      await forceCollectPoint();
    } catch (e) {
      console.warn('[TrackingManager] Foreground GPS polling notice:', e.message);
    }
  }, GPS_INTERVAL_MS);
};

const stopForegroundPolling = () => {
  if (fgIntervalId) {
    clearInterval(fgIntervalId);
    fgIntervalId = null;
  }
};

const setupNetInfoListener = () => {
  if (netInfoUnsubscribe) return;

  try {
    netInfoUnsubscribe = NetInfo.addEventListener(async (state) => {
      if (!state.isConnected) return;

      try {
        const activeTripId = await AsyncStorage.getItem('activeTripId');
        if (!activeTripId) return;

        if (isBackgroundLocationSupported()) {
          const isBgTaskRunning = await Location.hasStartedLocationUpdatesAsync(LOCATION_TRACKING_TASK).catch(() => false);
          if (isBgTaskRunning && isManagerActive) return;
        }

        console.log('[TrackingManager] Network reconnected — recovering tracking for trip:', activeTripId);
        await restartTracking();
      } catch (e) {
        console.warn('[TrackingManager] NetInfo handler error:', e.message);
      }
    });
  } catch (netErr) {
    console.warn('[TrackingManager] Failed to subscribe NetInfo:', netErr.message);
  }
};

const removeNetInfoListener = () => {
  if (!netInfoUnsubscribe) return;
  try {
    netInfoUnsubscribe();
  } catch (err) {
    console.warn('[TrackingManager] Failed to remove NetInfo listener:', err.message);
  }
  netInfoUnsubscribe = null;
};

/**
 * Global Tracking Manager Service
 * Manages location tracking lifecycle independently of the UI.
 */
export const initializeTracking = async () => {
  setupNetInfoListener();

  try {
    const userId = await AsyncStorage.getItem('userId');
    if (userId) {
      const socket = require('../socket').default;
      if (socket) {
        console.log('[TrackingManager] Ensuring socket is joined for user:', userId);
        if (!socket.connected) {
          socket.connect();
        }
        socket.emit('join', userId);
      }
    }

    const activeTripId = await AsyncStorage.getItem('activeTripId');
    if (activeTripId) {
      console.log('[TrackingManager] Auto-resuming tracking for active trip:', activeTripId);
      await startTrackingSession(activeTripId);
      return;
    }

    const token = await AsyncStorage.getItem('token');
    if (token) {
      console.log('[TrackingManager] Active trip not found locally, checking server...');
      try {
        const api = require('../api/axios').default;
        const res = await api.get('/auth/me');
        const todayAttendance = res.data?.todayAttendance;
        if (todayAttendance && todayAttendance.punchIn?.time && !todayAttendance.punchOut?.time) {
          console.log('[TrackingManager] Active session found on server. Starting tracking session:', todayAttendance._id);
          await startTrackingSession(todayAttendance._id);
        }
      } catch (netErr) {
        console.warn('[TrackingManager] Server check skipped (offline or network error):', netErr.message);
      }
    }
  } catch (err) {
    console.warn('[TrackingManager] Initialization warning:', err.message || err);
  }
};

export const startTrackingSession = async (tripId) => {
  if (isManagerActive) return;

  try {
    // 1. Cache the trip ID persistently
    await AsyncStorage.setItem('activeTripId', tripId);

    // 2. Ensure permissions
    if (typeof Location.requestForegroundPermissionsAsync === 'function') {
      const { status: fg } = await Location.requestForegroundPermissionsAsync();
      if (fg !== 'granted') {
        console.warn('[TrackingManager] Cannot start tracking: foreground location permission missing');
        return false;
      }
    }

    if (isBackgroundLocationSupported() && typeof Location.requestBackgroundPermissionsAsync === 'function') {
      try {
        await Location.requestBackgroundPermissionsAsync();
      } catch (bgErr) {
        console.warn('[TrackingManager] Background permission notice:', bgErr.message);
      }
    }

    // 3. Start foreground tracking (sets trip state + first point)
    await startFgTracking(tripId);
    // 4. Start synchronization background loop
    startSyncLoop();

    // 5. GPS collection mechanism
    if (isBackgroundLocationSupported()) {
      try {
        const hasStarted = await Location.hasStartedLocationUpdatesAsync(LOCATION_TRACKING_TASK).catch(() => false);
        if (!hasStarted) {
          await Location.startLocationUpdatesAsync(LOCATION_TRACKING_TASK, {
            accuracy: Location.Accuracy.High,
            timeInterval: GPS_INTERVAL_MS,
            distanceInterval: 0,
            foregroundService: {
              notificationTitle: "Geo-Track HRMS",
              notificationBody: "Tracking active until punch out",
              notificationColor: "#4f46e5"
            },
            activityType: Location.ActivityType.AutomotiveNavigation,
            showsBackgroundLocationIndicator: true,
          });
          console.log(`[TrackingManager] Background location updates started (fixed ${GPS_INTERVAL_MS}ms interval)`);
        } else {
          console.log('[TrackingManager] Background location updates already running.');
        }
      } catch (bgTaskErr) {
        console.warn('[TrackingManager] Background location task notice:', bgTaskErr?.message);
        startForegroundPolling();
      }
    } else {
      console.log('[TrackingManager] Platform running in foreground GPS mode (Web / Expo Go).');
      startForegroundPolling();
    }

    isManagerActive = true;

    // Start tracking health monitoring services (heartbeat + local watchdog)
    const userId = await AsyncStorage.getItem('userId');
    if (userId) {
      startHeartbeat(userId, tripId);
      startSelfHealingWatchdog(userId);
    }

    console.log('[TrackingManager] Tracking session started successfully for trip:', tripId);
    return true;
  } catch (err) {
    console.error('[TrackingManager] Failed to start tracking session:', err);
    isManagerActive = false;
    return false;
  }
};

export const stopTrackingSession = async () => {
  try {
    stopForegroundPolling();

    // 1. Force uploading remaining points in SQLite before stop
    await forceSyncAll();

    // 2. Stop foreground tracking state
    await stopFgTracking();

    // 3. Stop sync loops
    stopSyncLoop();

    // 4. Stop background location updater
    if (isBackgroundLocationSupported()) {
      try {
        const hasStarted = await Location.hasStartedLocationUpdatesAsync(LOCATION_TRACKING_TASK).catch(() => false);
        if (hasStarted && typeof Location.stopLocationUpdatesAsync === 'function') {
          await Location.stopLocationUpdatesAsync(LOCATION_TRACKING_TASK);
        }
      } catch (stopErr) {
        console.warn('[TrackingManager] Stop background updates notice:', stopErr?.message);
      }
    }

    // Stop tracking health monitoring services
    stopHeartbeat();
    stopSelfHealingWatchdog();
    removeNetInfoListener();

    console.log('[TrackingManager] Tracking session stopped');
  } catch (err) {
    console.error('[TrackingManager] Failed to stop tracking session:', err);
  } finally {
    isManagerActive = false;
  }
};

export const clearTrackingSession = async () => {
  await stopTrackingSession();
  await AsyncStorage.removeItem('activeTripId');
  console.log('[TrackingManager] Active trip ID cleared persistently');
};

/**
 * Restart tracking session (used for recovery)
 */
export const restartTracking = async () => {
  console.log('[TrackingManager] restartTracking called');
  const activeTripId = await AsyncStorage.getItem('activeTripId');
  if (!activeTripId) return false;

  try {
    if (isBackgroundLocationSupported()) {
      let isRunning = await Location.hasStartedLocationUpdatesAsync(LOCATION_TRACKING_TASK).catch(() => false);
      if (isRunning && typeof Location.stopLocationUpdatesAsync === 'function') {
        await Location.stopLocationUpdatesAsync(LOCATION_TRACKING_TASK).catch(() => {});
        for (let attempt = 1; attempt <= 3; attempt++) {
          isRunning = await Location.hasStartedLocationUpdatesAsync(LOCATION_TRACKING_TASK).catch(() => false);
          if (!isRunning) break;
          await new Promise(resolve => setTimeout(resolve, attempt * 150));
        }
      }

      await Location.startLocationUpdatesAsync(LOCATION_TRACKING_TASK, {
        accuracy: Location.Accuracy.High,
        timeInterval: GPS_INTERVAL_MS,
        distanceInterval: 0,
        foregroundService: {
          notificationTitle: "Geo-Track HRMS",
          notificationBody: "Tracking active until punch out",
          notificationColor: "#4f46e5"
        },
        activityType: Location.ActivityType.AutomotiveNavigation,
        showsBackgroundLocationIndicator: true,
      });
    } else {
      console.log('[TrackingManager] restartTracking: Collecting immediate GPS point');
      await forceCollectPoint();
      startForegroundPolling();
    }

    isManagerActive = true;

    const userId = await AsyncStorage.getItem('userId');
    if (userId) {
      startHeartbeat(userId, activeTripId);
      startSelfHealingWatchdog(userId);
    }

    console.log('[TrackingManager] GPS tracking session active/recovered');
    return true;
  } catch (err) {
    console.error('[TrackingManager] restartTracking failed:', err);
    isManagerActive = false;
    return false;
  }
};
