import NetInfo from '@react-native-community/netinfo';
import * as Battery from 'expo-battery';
import * as Location from 'expo-location';
import { AppState } from 'react-native';
import socket from '../socket';
import { getLastGpsTimestamp, isTrackingActive, restartGpsWatcher } from './tracking.service';

let heartbeatInterval = null;
let currentUserId = null;
let currentTripId = null;

/**
 * Sends a single heartbeat payload to the backend via Socket.IO
 */
const sendHeartbeat = async () => {
  if (!currentUserId) return;

  try {
    let batteryLevel = 100;
    let isCharging = false;
    let lowPowerMode = false;
    try {
      const [level, state, powerSave] = await Promise.all([
        Battery.getBatteryLevelAsync(),
        Battery.getBatteryStateAsync().catch(() => null),
        Battery.isLowPowerModeEnabledAsync().catch(() => false),
      ]);
      if (level >= 0) {
        batteryLevel = Math.round(level * 100);
      }
      isCharging = state === Battery.BatteryState.CHARGING || state === Battery.BatteryState.FULL;
      lowPowerMode = Boolean(powerSave);
    } catch (batErr) {
      console.warn('[HeartbeatService] Failed to read battery level:', batErr.message);
    }

    let networkType = socket && socket.connected ? 'online' : 'offline';
    try {
      const net = await NetInfo.fetch();
      if (!net?.isConnected || net?.isInternetReachable === false) {
        networkType = 'offline';
      } else if (net.type) {
        networkType = net.type;
      }
    } catch (_) {}

    let gpsServicesEnabled = true;
    try {
      gpsServicesEnabled = await Location.hasServicesEnabledAsync();
    } catch (_) {}

    const lastGps = getLastGpsTimestamp();
    const trackingRunning = isTrackingActive();
    const network = socket && socket.connected ? 'online' : 'offline';

    const payload = {
      userId: currentUserId,
      tripId: currentTripId,
      lastGpsTime: lastGps > 0 ? new Date(lastGps).toISOString() : null,
      trackingRunning,
      battery: batteryLevel,
      isCharging,
      lowPowerMode,
      network,
      networkType,
      gpsServicesEnabled,
      appState: AppState.currentState,
    };

    console.log('[HeartbeatService] Emitting heartbeat:', payload);
    socket.emit('heartbeat', payload);
  } catch (err) {
    console.error('[HeartbeatService] Failed to send heartbeat:', err.message);
  }
};

/**
 * Socket listener for 'restart_tracking' event sent by the backend watchdog
 */
const handleRestartTracking = async (data) => {
  console.log('[HeartbeatService] Received restart_tracking event from backend:', data);
  try {
    if (data && data.userId === currentUserId) {
      if (AppState.currentState !== 'active' && typeof Location.getBackgroundPermissionsAsync === 'function') {
        const { status: bg } = await Location.getBackgroundPermissionsAsync().catch(() => ({ status: 'denied' }));
        if (bg !== 'granted') {
          console.log('[HeartbeatService] Skipping remote restart while backgrounded without background location permission.');
          return;
        }
      }
      console.log('[HeartbeatService] Match found for current user. Restarting GPS watcher...');
      await restartGpsWatcher();
      
      // Update health state to recovering immediately
      socket.emit('trackingHealthUpdate', {
        userId: currentUserId,
        trackingHealth: 'recovering',
        trackingHealthReason: `Remote restart triggered. Attempt #${data.attempt || 1}`
      });
    }
  } catch (err) {
    console.error('[HeartbeatService] Error executing remote GPS restart:', err.message);
  }
};

/**
 * Start the heartbeat sender loop and socket listeners
 */
export const startHeartbeat = (userId, tripId) => {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
  }

  currentUserId = userId;
  currentTripId = tripId;

  console.log(`[HeartbeatService] Starting heartbeat for user ${userId}, trip ${tripId}`);
  
  // Register socket recovery event listener
  socket.off('restart_tracking', handleRestartTracking);
  socket.on('restart_tracking', handleRestartTracking);

  // Send first heartbeat immediately
  sendHeartbeat();

  // Start 30s interval
  heartbeatInterval = setInterval(sendHeartbeat, 30000);
};

/**
 * Stop the heartbeat sender loop and remove socket listeners
 */
export const stopHeartbeat = () => {
  console.log('[HeartbeatService] Stopping heartbeat service');
  
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }

  socket.off('restart_tracking', handleRestartTracking);
  
  currentUserId = null;
  currentTripId = null;
};
