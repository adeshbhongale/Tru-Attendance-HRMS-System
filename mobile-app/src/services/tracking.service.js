import * as Location from 'expo-location';
import * as Application from 'expo-application';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { insertTrackingPoint, initDatabase } from './database.service';

/**
 * Enterprise Location/Tracking Service
 * Single responsibility: Collect GPS data every 5 seconds
 * Validates, enriches, and stores to SQLite
 */

let watchSubscription = null;
let foregroundInterval = null;
let currentTripId = null;
let deviceId = null;
let isCollecting = false;

// Validation thresholds
const ACCURACY_THRESHOLD = 100; // meters — points above this are marked 'weak' but NOT discarded
const MIN_MOVEMENT_METERS = 3;  // ignore stationary drift
const MAX_SPEED_KMH = 150;     // reject teleportation jumps

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
const validatePoint = (point) => {
  // 1. Null coordinate check
  if (!point.latitude || !point.longitude || 
      isNaN(point.latitude) || isNaN(point.longitude)) {
    return { valid: false, status: 'rejected', reason: 'Null or invalid coordinates' };
  }

  // 2. Range check
  if (Math.abs(point.latitude) > 90 || Math.abs(point.longitude) > 180) {
    return { valid: false, status: 'rejected', reason: 'Coordinates out of range' };
  }

  // 3. Accuracy check — don't reject, mark as weak
  if (point.accuracy && point.accuracy > ACCURACY_THRESHOLD) {
    // Still save but mark as weak — never lose a point
    return { valid: true, status: 'weak', reason: `Weak GPS signal (accuracy: ${point.accuracy}m)` };
  }

  // 4. Duplicate check — same tripId + very close timestamp
  if (lastPoint && lastPoint.tripId === point.tripId) {
    const timeDiff = Math.abs(point.timestamp - lastPoint.timestamp);
    if (timeDiff < 1000) { // Less than 1 second apart
      return { valid: false, status: 'duplicate', reason: 'Duplicate point (< 1s)' };
    }
  }

  // 5. Jump detection — check speed
  if (lastPoint) {
    const dist = haversineDistance(
      lastPoint.latitude, lastPoint.longitude,
      point.latitude, point.longitude
    );
    const timeDiffSec = (point.timestamp - lastPoint.timestamp) / 1000;
    
    // Stationary drift
    if (dist < MIN_MOVEMENT_METERS && timeDiffSec < 30) {
      return { valid: false, status: 'drift', reason: `Stationary drift (${dist.toFixed(1)}m)` };
    }

    // Speed-based jump detection
    if (timeDiffSec > 0) {
      const speedKmh = (dist / timeDiffSec) * 3.6;
      if (speedKmh > MAX_SPEED_KMH) {
        return { valid: false, status: 'jump', reason: `GPS jump (${speedKmh.toFixed(0)} km/h)` };
      }
    }
  }

  return { valid: true, status: 'valid', reason: null };
};

/**
 * Collect a single GPS point, validate, and store to SQLite
 */
const collectPoint = async () => {
  if (isCollecting) return null;
  
  try {
    isCollecting = true;

    const loc = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
      timeout: 8000,
    });

    const { latitude, longitude, accuracy, speed, heading, altitude, mocked } = loc.coords;
    const devId = await getDeviceId();

    const point = {
      tripId: currentTripId,
      deviceId: devId,
      latitude,
      longitude,
      speed: speed || 0,
      heading: heading || 0,
      accuracy: accuracy || 0,
      altitude: altitude || 0,
      battery: 100, // Will be updated if battery API is available
      timestamp: Date.now(),
      isMock: mocked || false
    };

    // Validate the point
    const validation = validatePoint(point);

    if (!validation.valid) {
      console.log(`[LocationService] Point ${validation.status}: ${validation.reason}`);
      return null;
    }

    // Save to SQLite
    await insertTrackingPoint(point);

    // Update last known point for next validation
    lastPoint = {
      latitude: point.latitude,
      longitude: point.longitude,
      timestamp: point.timestamp,
      tripId: point.tripId
    };

    console.log(`[LocationService] Point saved: ${latitude.toFixed(6)}, ${longitude.toFixed(6)} (acc: ${accuracy?.toFixed(0)}m, status: ${validation.status})`);

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
 * Start GPS tracking for a trip
 * @param {string} tripId - Attendance/session ID to associate points with
 * @param {Function} onPointCollected - Callback when a point is successfully collected
 * @returns {boolean} Whether tracking started successfully
 */
export const startTracking = async (tripId, onPointCollected = null) => {
  try {
    // Initialize SQLite
    await initDatabase();

    // Request permissions
    const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
    if (fgStatus !== 'granted') {
      console.error('[LocationService] Foreground permission denied');
      return false;
    }

    currentTripId = tripId;
    lastPoint = null;

    // Cache trip ID and device ID in AsyncStorage for the background task to access
    const devId = await getDeviceId();
    await Promise.all([
      AsyncStorage.setItem('activeTripId', tripId),
      AsyncStorage.setItem('deviceId', devId)
    ]);

    console.log(`[LocationService] Starting tracking for trip: ${tripId}`);

    // Collect every 5 seconds
    foregroundInterval = setInterval(async () => {
      const point = await collectPoint();
      if (point && onPointCollected) {
        onPointCollected(point);
      }
    }, 5000);

    // Collect first point immediately
    const firstPoint = await collectPoint();
    if (firstPoint && onPointCollected) {
      onPointCollected(firstPoint);
    }

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
    if (foregroundInterval) {
      clearInterval(foregroundInterval);
      foregroundInterval = null;
    }

    if (watchSubscription) {
      await watchSubscription.remove();
      watchSubscription = null;
    }

    console.log(`[LocationService] Tracking stopped for trip: ${currentTripId}`);
    
    // Clear trip ID cache
    await AsyncStorage.removeItem('activeTripId');
    
    currentTripId = null;
    lastPoint = null;
  } catch (err) {
    console.error('[LocationService] Stop tracking failed:', err);
  }
};

/**
 * Check if tracking is currently active
 * @returns {boolean}
 */
export const isTrackingActive = () => {
  return foregroundInterval !== null;
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
