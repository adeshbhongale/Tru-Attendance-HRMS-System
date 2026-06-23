import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { startTracking as startFgTracking, stopTracking as stopFgTracking } from './tracking.service';
import { startSyncLoop, stopSyncLoop, forceSyncAll } from './sync.service';
import { startHeartbeat, stopHeartbeat } from './heartbeat.service';
import { startSelfHealingWatchdog, stopSelfHealingWatchdog } from './selfHealingWatchdog';

const LOCATION_TRACKING_TASK = 'background-location-tracking';
let isManagerActive = false;

/**
 * Global Tracking Manager Service
 * Manages location tracking lifecycle independently of the UI.
 */

export const initializeTracking = async () => {
  try {
    // Ensure socket room is joined immediately on startup or login
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

    // Fallback: If they logged in but activeTripId is missing locally (e.g. fresh login/re-install)
    const token = await AsyncStorage.getItem('token');
    if (token) {
      console.log('[TrackingManager] Active trip not found locally, checking server...');
      const api = require('../api/axios').default; // import dynamically to avoid circular references
      const res = await api.get('/auth/me');
      const todayAttendance = res.data?.todayAttendance;
      if (todayAttendance && todayAttendance.punchIn?.time && !todayAttendance.punchOut?.time) {
        console.log('[TrackingManager] Active session found on server. Starting tracking session:', todayAttendance._id);
        await startTrackingSession(todayAttendance._id);
      }
    }
  } catch (err) {
    console.error('[TrackingManager] Initialization failed:', err);
  }
};

export const startTrackingSession = async (tripId) => {
  if (isManagerActive) return;
  isManagerActive = true;

  try {
    // 1. Cache the trip ID persistently
    await AsyncStorage.setItem('activeTripId', tripId);

    // 2. Ensure permissions
    const { status: fg } = await Location.requestForegroundPermissionsAsync();
    const { status: bg } = await Location.requestBackgroundPermissionsAsync();

    if (fg === 'granted') {
      // 3. Start foreground tracking
      await startFgTracking(tripId);
      // 4. Start synchronization background loop
      startSyncLoop();
    }

    if (fg === 'granted' && bg === 'granted') {
      // 5. Register and start standard background tracking updates
      // Always call startLocationUpdatesAsync to ensure the foreground service is active
      await Location.startLocationUpdatesAsync(LOCATION_TRACKING_TASK, {
        accuracy: Location.Accuracy.High,
        timeInterval: 10000,
        distanceInterval: 5,
        foregroundService: {
          notificationTitle: "Geo-Track HRMS",
          notificationBody: "Tracking active until punch out",
          notificationColor: "#4f46e5"
        }
      });
    }

    // Start tracking health monitoring services (heartbeat + local watchdog)
    const userId = await AsyncStorage.getItem('userId');
    if (userId) {
      startHeartbeat(userId, tripId);
      startSelfHealingWatchdog(userId);
    }

    console.log('[TrackingManager] Tracking session started successfully for trip:', tripId);
  } catch (err) {
    console.error('[TrackingManager] Failed to start tracking session:', err);
    isManagerActive = false;
  }
};

export const stopTrackingSession = async () => {
  try {
    // 1. Force uploading remaining points in SQLite before stop
    await forceSyncAll();

    // 2. Stop foreground watching
    await stopFgTracking();

    // 3. Stop sync loops
    stopSyncLoop();

    // 4. Stop background location updater
    const hasStarted = await Location.hasStartedLocationUpdatesAsync(LOCATION_TRACKING_TASK);
    if (hasStarted) {
      await Location.stopLocationUpdatesAsync(LOCATION_TRACKING_TASK);
    }

    // Stop tracking health monitoring services
    stopHeartbeat();
    stopSelfHealingWatchdog();

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

export const updateBackgroundInterval = async (timeInterval) => {
  try {
    const hasStarted = await Location.hasStartedLocationUpdatesAsync(LOCATION_TRACKING_TASK);
    if (!hasStarted) return;

    console.log(`[TrackingManager] Adjusting background tracking interval to ${timeInterval}ms`);
    
    await AsyncStorage.setItem('currentBgInterval', String(timeInterval));

    await Location.startLocationUpdatesAsync(LOCATION_TRACKING_TASK, {
      accuracy: Location.Accuracy.High,
      timeInterval: timeInterval,
      distanceInterval: 1, // smaller distance interval so time interval takes precedence
      foregroundService: {
        notificationTitle: "Geo-Track HRMS",
        notificationBody: "Tracking active until punch out",
        notificationColor: "#4f46e5"
      }
    });
  } catch (err) {
    console.error('[TrackingManager] Failed to update background interval:', err);
  }
};
