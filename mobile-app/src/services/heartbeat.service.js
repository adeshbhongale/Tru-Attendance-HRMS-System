import socket from '../socket';
import * as Battery from 'expo-battery';
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
    try {
      const level = await Battery.getBatteryLevelAsync();
      if (level >= 0) {
        batteryLevel = Math.round(level * 100);
      }
    } catch (batErr) {
      console.warn('[HeartbeatService] Failed to read battery level:', batErr.message);
    }

    const lastGps = getLastGpsTimestamp();
    const trackingRunning = isTrackingActive();
    const network = socket && socket.connected ? 'online' : 'offline';

    const payload = {
      userId: currentUserId,
      tripId: currentTripId,
      lastGpsTime: lastGps > 0 ? new Date(lastGps).toISOString() : null,
      trackingRunning,
      battery: batteryLevel,
      network
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
