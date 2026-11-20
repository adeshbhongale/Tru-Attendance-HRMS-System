import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import * as Application from 'expo-application';
import * as Battery from 'expo-battery';
import * as Location from 'expo-location';
import { Platform } from 'react-native';
import { initDatabase, insertTrackingPoint } from './database.service';
import { validateTrackingPoint } from './livenessService';
import { syncPendingPoints } from './sync.service';

/**
 * Enterprise Location/Tracking Service
 * 
 * ARCHITECTURE (Post-Fix):
 * - This service manages trip state and provides the collectPoint() utility.
 * - All continuous GPS collection is handled by a SINGLE system:
 *   startLocationUpdatesAsync() in trackingManager.js (works in BOTH foreground & background).
 * - watchPositionAsync has been REMOVED to prevent dual-system conflicts
 *   that caused GPS to silently die on Realme/OPPO/ColorOS devices.
 */

let currentTripId = null;
let deviceId = null;
let isCollecting = false;
let isTrackingFlag = false;
let savedOnPointCollected = null;
let lastPoint = null;

/**
 * Get unique device identifier
 */
const getDeviceId = async () => {
  if (deviceId) return deviceId;
  try {
    if (Platform.OS === 'android') {
      deviceId = Application.getAndroidId() || 'android-unknown';
    } else {
      deviceId = await Application.getIosIdForVendorAsync() || 'ios-unknown';
    }
    await AsyncStorage.setItem('deviceId', deviceId);
  } catch {
    deviceId = `device-${Date.now()}`;
  }
  return deviceId;
};

/**
 * Calculate Haversine distance between two points (in meters)
 */
const haversineDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371e3; // Earth radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

/**
 * Validate a GPS point before saving
 * @param {Object} point - GPS point
 * @returns {Object} { valid: boolean, status: string, reason: string }
 */
export const validatePoint = (point, prevPoint = lastPoint, now = Date.now()) =>
  validateTrackingPoint(point, prevPoint, now);

/**
 * Collect a single GPS point, validate, and store to SQLite.
 * Called by the background task (App.js) and for immediate first-point seeding.
 */
export const collectPoint = async (loc = null) => {
  if (isCollecting) return null;

  try {
    isCollecting = true;

    // Use passed location object if available, otherwise fallback to getCurrentPositionAsync
    const locationData = loc || await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
      timeout: 8000,
    });

    const { latitude, longitude, accuracy, speed, heading, altitude, mocked } = locationData.coords;
    const devId = await getDeviceId();

    let batteryLevel = 100;
    try {
      const level = await Battery.getBatteryLevelAsync();
      if (level >= 0) {
        batteryLevel = Math.round(level * 100);
      }
    } catch (batErr) {
      console.warn('[LocationService] Failed to read battery level:', batErr.message);
    }

    let isOffline = false;
    try {
      const net = await NetInfo.fetch();
      isOffline = !(net?.isConnected && net?.isInternetReachable !== false);
    } catch (_) {}

    const point = {
      tripId: currentTripId,
      deviceId: devId,
      latitude,
      longitude,
      speed: speed || 0,
      heading: heading || 0,
      accuracy: accuracy || 0,
      altitude: altitude || 0,
      battery: batteryLevel,
      timestamp: locationData.timestamp || Date.now(),
      isMock: Boolean(locationData.mocked || mocked),
      isOffline,
    };

    // Validate the point
    const validation = validatePoint(point, lastPoint);

    if (!validation.valid) {
      console.log(`[LocationService] Point ${validation.status} [${validation.code}]: ${validation.reason}`);
      return null;
    }

    // Save to SQLite
    await insertTrackingPoint(point);

    // Trigger immediate upload in the background to show results instantly on the dashboard
    syncPendingPoints().catch(err => {
      console.warn('[LocationService] Instant sync failed:', err.message);
    });

    // Update last known point for next validation
    lastPoint = {
      latitude: point.latitude,
      longitude: point.longitude,
      timestamp: point.timestamp,
      tripId: point.tripId
    };

    console.log(`[LocationService] Point saved: ${latitude.toFixed(6)}, ${longitude.toFixed(6)} (acc: ${accuracy?.toFixed(0)}m, status: ${validation.status})`);

    // Notify UI callback if registered
    if (savedOnPointCollected) {
      savedOnPointCollected({
        latitude,
        longitude,
        accuracy,
        speed,
        heading,
        status: validation.status
      });
    }

    return {
      latitude,
      longitude,
      accuracy,
      speed,
      heading,
      status: validation.status
    };
  } catch (err) {
    console.warn('[LocationService] GPS collection error:', err.message);
    return null;
  } finally {
    isCollecting = false;
  }
};

/**
 * Start GPS tracking for a trip.
 * This only sets up trip state and collects the first point.
 * Continuous collection is handled by startLocationUpdatesAsync in trackingManager.js.
 * 
 * @param {string} tripId - Attendance/session ID to associate points with
 * @param {Function} onPointCollected - Callback when a point is successfully collected
 * @returns {boolean} Whether tracking started successfully
 */
export const startTracking = async (tripId, onPointCollected = null) => {
  try {
    // Initialize SQLite
    await initDatabase();

    // Verify permissions without triggering unexpected OS dialogs from background/service context
    const { status: fgStatus } = await Location.getForegroundPermissionsAsync();
    if (fgStatus !== 'granted') {
      console.error('[LocationService] Foreground permission not granted');
      return false;
    }

    currentTripId = tripId;
    lastPoint = null;
    savedOnPointCollected = onPointCollected;
    isTrackingFlag = true;

    // Cache trip ID and device ID in AsyncStorage for the background task to access
    const devId = await getDeviceId();
    await Promise.all([
      AsyncStorage.setItem('activeTripId', tripId),
      AsyncStorage.setItem('deviceId', devId)
    ]);

    console.log(`[LocationService] Starting tracking for trip: ${tripId}`);

    // Collect first point immediately to seed location fast
    try {
      const firstLoc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
        timeout: 4000,
      });
      const firstPoint = await collectPoint(firstLoc);
      if (firstPoint && onPointCollected) {
        onPointCollected(firstPoint);
      }
    } catch (e) {
      console.warn('[LocationService] First point getCurrentPositionAsync warning:', e.message);
    }

    // NOTE: No watchPositionAsync here!
    // GPS collection is handled entirely by startLocationUpdatesAsync
    // in trackingManager.js, which works in BOTH foreground and background.

    return true;
  } catch (err) {
    console.error('[LocationService] Start tracking failed:', err);
    return false;
  }
};

/**
 * Stop GPS tracking
 */
export const stopTracking = async () => {
  try {
    console.log(`[LocationService] Tracking stopped for trip: ${currentTripId}`);

    currentTripId = null;
    lastPoint = null;
    savedOnPointCollected = null;
    isTrackingFlag = false;
  } catch (err) {
    console.error('[LocationService] Stop tracking failed:', err);
  }
};

/**
 * Check if tracking is currently active
 * @returns {boolean}
 */
export const isTrackingActive = () => {
  return isTrackingFlag;
};

/**
 * Get current trip ID
 * @returns {string|null}
 */
export const getCurrentTripId = () => currentTripId;

/**
 * Set trip ID (used when attendance record is created)
 * @param {string} tripId
 */
export const setTripId = (tripId) => {
  currentTripId = tripId;
};

/**
 * Get the timestamp of the last collected GPS point
 * @returns {number}
 */
export const getLastGpsTimestamp = () => {
  return lastPoint ? lastPoint.timestamp : 0;
};

/**
 * Get the full details of the last collected GPS point
 * @returns {Object|null}
 */
export const getLastGpsPoint = () => {
  return lastPoint;
};

/**
 * Force-collect a fresh GPS point (used by watchdog for recovery).
 * Does NOT restart any watcher — just gets one point via getCurrentPositionAsync.
 * @returns {Promise<boolean>}
 */
export const forceCollectPoint = async () => {
  console.log('[LocationService] forceCollectPoint called');
  try {
    const freshLoc = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
      timeout: 4000,
    });
    await collectPoint(freshLoc);
    return true;
  } catch (e) {
    console.warn('[LocationService] forceCollectPoint failed:', e.message);
    return false;
  }
};

/**
 * Explicitly set the lastPoint (used by background task to update last known GPS time)
 */
export const setLastPoint = (point) => {
  lastPoint = point;
};

/**
 * Restart GPS watcher (used by heartbeat and self-healing watchdog)
 * For this architecture, it restarts the location updates via trackingManager
 */
export const restartGpsWatcher = async () => {
  console.log('[LocationService] restartGpsWatcher called');
  try {
    // Import trackingManager dynamically to avoid circular dependencies
    const { restartTracking } = require('./trackingManager');
    if (restartTracking) {
      await restartTracking();
    } else {
      // Fallback to forceCollectPoint if restartTracking doesn't exist
      await forceCollectPoint();
    }
    return true;
  } catch (e) {
    console.warn('[LocationService] restartGpsWatcher failed:', e.message);
    // Fallback to forceCollectPoint
    try {
      await forceCollectPoint();
      return true;
    } catch (fallbackErr) {
      console.error('[LocationService] restartGpsWatcher fallback also failed:', fallbackErr.message);
      return false;
    }
  }
};
