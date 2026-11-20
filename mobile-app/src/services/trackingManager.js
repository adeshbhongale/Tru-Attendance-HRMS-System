import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import Constants from 'expo-constants';
import * as Location from 'expo-location';
import { AppState, Platform } from 'react-native';
import { startHeartbeat, stopHeartbeat } from './heartbeat.service';
import { acquireWakeLock, releaseWakeLock } from './nativeWakeLock';
import { startSelfHealingWatchdog, stopSelfHealingWatchdog } from './selfHealingWatchdog';
import { forceSyncAll, startSyncLoop, stopSyncLoop } from './sync.service';
import { forceCollectPoint, startTracking as startFgTracking, stopTracking as stopFgTracking } from './tracking.service';

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
let appStateSubscription = null;
let pendingBgServiceStart = false;

const BACKGROUND_LOCATION_OPTIONS = {
  accuracy: Location.Accuracy.BestForNavigation,
  timeInterval: GPS_INTERVAL_MS,
  distanceInterval: 0,
  deferredUpdatesInterval: 0,
  deferredUpdatesDistance: 0,
  foregroundService: {
    notificationTitle: "Gatimaan",
    notificationBody: "Live duty tracking active while punched in",
    notificationColor: "#4f46e5",
    killServiceOnDestroy: false,
  },
  activityType: Location.ActivityType.Other,
  showsBackgroundLocationIndicator: true,
  pausesUpdatesAutomatically: false,
};

const ensureAppStateForegroundStartListener = () => {
  if (appStateSubscription) return;
  appStateSubscription = AppState.addEventListener('change', async (nextState) => {
    if (nextState === 'active' && pendingBgServiceStart && isManagerActive) {
      try {
        const hasStarted = await Location.hasStartedLocationUpdatesAsync(LOCATION_TRACKING_TASK).catch(() => false);
        if (!hasStarted) {
          await Location.startLocationUpdatesAsync(LOCATION_TRACKING_TASK, BACKGROUND_LOCATION_OPTIONS);
        }
        pendingBgServiceStart = false;
        stopForegroundPolling();
        console.log('[TrackingManager] Deferred background location FGS started on foreground transition.');
      } catch (err) {
        console.warn('[TrackingManager] Deferred FGS start notice:', err?.message);
      }
    }
  });
};

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

let remoteListenerAttached = false;
const setupRemoteTrackingListener = () => {
  if (remoteListenerAttached) return;
  try {
    const socketModule = require('../socket');
    const sock = socketModule.default || socketModule;
    if (sock && typeof sock.on === 'function') {
      sock.on('attendance:punched_out', async (data) => {
        console.log('[TrackingManager] Remote punch-out notification received:', data);
        await clearTrackingSession();
      });
      sock.on('tracking:force_stop', async (data) => {
        console.log('[TrackingManager] Remote force stop received:', data);
        await clearTrackingSession();
      });
      remoteListenerAttached = true;
      console.log('[TrackingManager] Remote punch-out socket listener attached.');
    }
  } catch (err) {
    console.warn('[TrackingManager] Remote listener setup notice:', err?.message);
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
          if (isBgTaskRunning && isManagerActive) {
            forceSyncAll().catch(() => { });
            return;
          }
        }

        // Prevent Android 12-16 ForegroundServiceStartNotAllowedException if app is in background without bg permission
        let hasBgPerm = false;
        if (isBackgroundLocationSupported() && typeof Location.getBackgroundPermissionsAsync === 'function') {
          const { status: bg } = await Location.getBackgroundPermissionsAsync().catch(() => ({ status: 'denied' }));
          hasBgPerm = bg === 'granted';
        }

        if (AppState.currentState !== 'active' && !hasBgPerm) {
          forceSyncAll().catch(() => { });
          return;
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
  setupRemoteTrackingListener();

  try {
    const configStr = await AsyncStorage.getItem('@mobileAccessConfig');
    if (configStr) {
      const config = JSON.parse(configStr);
      if (config.trackingEnabled === false) {
        console.log('[TrackingManager] Tracking is disabled for this user by admin config. Skipping initializeTracking.');
        await clearTrackingSession();
        return;
      }
    }
  } catch (_) { }

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

    const { getSecureToken } = require('../utils/secureStorage');
    const token = await getSecureToken();
    const activeTripId = await AsyncStorage.getItem('activeTripId');

    if (token) {
      try {
        const api = require('../api/axios').default;
        const res = await api.get('/auth/me');
        const todayAttendance = res.data?.todayAttendance;
        const isClockedIn = !!(todayAttendance && todayAttendance.punchIn?.time && !todayAttendance.punchOut?.time);

        if (isClockedIn) {
          console.log('[TrackingManager] Active duty session verified on server:', todayAttendance._id);
          await startTrackingSession(todayAttendance._id);
          return;
        } else if (activeTripId) {
          console.log('[TrackingManager] User is punched out on server. Clearing stale tracking session.');
          await clearTrackingSession();
          return;
        }
      } catch (netErr) {
        console.warn('[TrackingManager] Server check skipped (offline or network error):', netErr.message);
      }
    }

    if (activeTripId) {
      console.log('[TrackingManager] Offline resume for active trip:', activeTripId);
      await startTrackingSession(activeTripId);
    }
  } catch (err) {
    console.warn('[TrackingManager] Initialization warning:', err.message || err);
  }
};

export const startTrackingSession = async (tripId) => {
  if (isManagerActive) {
    if (AppState.currentState === 'active' && isBackgroundLocationSupported() && typeof Location.getBackgroundPermissionsAsync === 'function') {
      try {
        const { status: bg } = await Location.getBackgroundPermissionsAsync();
        if (bg === 'granted') {
          const hasStarted = await Location.hasStartedLocationUpdatesAsync(LOCATION_TRACKING_TASK).catch(() => false);
          if (!hasStarted) {
            await Location.startLocationUpdatesAsync(LOCATION_TRACKING_TASK, BACKGROUND_LOCATION_OPTIONS);
            pendingBgServiceStart = false;
            stopForegroundPolling();
          }
        }
      } catch (_) {}
    }
    return true;
  }

  // Guard: Check if tracking is disabled for this user by Super Admin configuration
  try {
    const configStr = await AsyncStorage.getItem('@mobileAccessConfig');
    if (configStr) {
      const config = JSON.parse(configStr);
      if (config.trackingEnabled === false) {
        console.log('[TrackingManager] Tracking is disabled for this user by admin config. Skipping startTrackingSession.');
        return false;
      }
    }
  } catch (_) { }

  try {
    // 1. Verify permissions without forcing unexpected OS dialogs if revoked
    if (typeof Location.getForegroundPermissionsAsync === 'function') {
      const { status: fg } = await Location.getForegroundPermissionsAsync();
      if (fg !== 'granted') {
        console.warn('[TrackingManager] Cannot start tracking: foreground location permission not granted');
        return false;
      }
    }

    let hasBgPerm = false;
    if (isBackgroundLocationSupported() && typeof Location.getBackgroundPermissionsAsync === 'function') {
      try {
        const { status: bg } = await Location.getBackgroundPermissionsAsync();
        hasBgPerm = bg === 'granted';
      } catch (bgErr) {
        hasBgPerm = false;
      }
    }

    // 2. Cache the trip ID persistently
    await AsyncStorage.setItem('activeTripId', tripId);

    // 3. Start foreground tracking (sets trip state + first point)
    await startFgTracking(tripId);
    // 4. Start synchronization background loop
    startSyncLoop();
    // 4b. Acquire real Android hardware CPU WakeLock
    await acquireWakeLock();

    // 5. GPS collection mechanism
    if (isBackgroundLocationSupported() && hasBgPerm) {
      try {
        const hasStarted = await Location.hasStartedLocationUpdatesAsync(LOCATION_TRACKING_TASK).catch(() => false);
        if (!hasStarted) {
          if (AppState.currentState === 'active') {
            await Location.startLocationUpdatesAsync(LOCATION_TRACKING_TASK, BACKGROUND_LOCATION_OPTIONS);
            console.log(`[TrackingManager] Background location updates started (fixed ${GPS_INTERVAL_MS}ms interval)`);
          } else {
            // Android 14-16 (API 34-36): Do not start a new Foreground Service while backgrounded
            console.log('[TrackingManager] App in background; deferring FGS start until foreground active.');
            pendingBgServiceStart = true;
            ensureAppStateForegroundStartListener();
            startForegroundPolling();
          }
        } else {
          console.log('[TrackingManager] Background location updates already running.');
        }
      } catch (bgTaskErr) {
        console.warn('[TrackingManager] Background location task notice:', bgTaskErr?.message);
        startForegroundPolling();
      }
    } else {
      console.log('[TrackingManager] Running in foreground GPS mode.');
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
    // 2b. Release hardware CPU WakeLock
    await releaseWakeLock();

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
    pendingBgServiceStart = false;
    if (appStateSubscription) {
      appStateSubscription.remove();
      appStateSubscription = null;
    }
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
  try {
    const { clearAllPoints } = require('./database.service');
    await clearAllPoints();
  } catch (_) { }
  try {
    const { clearQueue } = require('../utils/offlineQueue');
    await clearQueue();
  } catch (_) { }
  await AsyncStorage.removeItem('activeTripId');
  console.log('[TrackingManager] Active trip ID and local tracking queues cleared persistently');
};

/**
 * Restart tracking session (used for recovery)
 */
export const restartTracking = async () => {
  console.log('[TrackingManager] restartTracking called');
  const activeTripId = await AsyncStorage.getItem('activeTripId');
  if (!activeTripId) return false;

  try {
    if (typeof Location.getForegroundPermissionsAsync === 'function') {
      const { status: fg } = await Location.getForegroundPermissionsAsync();
      if (fg !== 'granted') {
        console.warn('[TrackingManager] Location permission was revoked. Stopping tracking session.');
        await stopTrackingSession();
        return false;
      }
    }

    let hasBgPerm = false;
    if (isBackgroundLocationSupported() && typeof Location.getBackgroundPermissionsAsync === 'function') {
      const { status: bg } = await Location.getBackgroundPermissionsAsync().catch(() => ({ status: 'denied' }));
      hasBgPerm = bg === 'granted';
    }

    if (isBackgroundLocationSupported() && hasBgPerm) {
      let isRunning = await Location.hasStartedLocationUpdatesAsync(LOCATION_TRACKING_TASK).catch(() => false);

      // Android 14-16 (API 34-36): Never stop & recreate the Foreground Service while backgrounded,
      // as stopping the FGS relinquishes background start exemptions and triggers ForegroundServiceStartNotAllowedException.
      if (AppState.currentState !== 'active') {
        if (isRunning) {
          console.log('[TrackingManager] restartTracking in background: keeping active FGS and sampling fresh point.');
          await forceCollectPoint();
        } else {
          console.log('[TrackingManager] restartTracking in background: deferring FGS start until foreground.');
          pendingBgServiceStart = true;
          ensureAppStateForegroundStartListener();
          await forceCollectPoint();
        }
      } else {
        if (isRunning && typeof Location.stopLocationUpdatesAsync === 'function') {
          await Location.stopLocationUpdatesAsync(LOCATION_TRACKING_TASK).catch(() => { });
          for (let attempt = 1; attempt <= 3; attempt++) {
            isRunning = await Location.hasStartedLocationUpdatesAsync(LOCATION_TRACKING_TASK).catch(() => false);
            if (!isRunning) break;
            await new Promise(resolve => setTimeout(resolve, attempt * 150));
          }
        }

        await Location.startLocationUpdatesAsync(LOCATION_TRACKING_TASK, BACKGROUND_LOCATION_OPTIONS);
      }
    } else {
      console.log('[TrackingManager] restartTracking: Collecting immediate GPS point');
      await forceCollectPoint();
      startForegroundPolling();
    }

    isManagerActive = true;
    startSyncLoop();
    await acquireWakeLock();

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
