import AsyncStorage from '@react-native-async-storage/async-storage';
import { getPendingPoints, markPointsSynced, markPointsFailed, cleanupSyncedPoints, getPendingCount } from './database.service';
import socket from '../socket';
import api from '../api/axios';

/**
 * Enterprise Sync Service
 * Single responsibility: Upload pending SQLite records to the server
 * Handles batching, retries, and duplicate prevention
 */

const MAX_BATCH_SIZE = 100;
const MAX_RETRIES = 5;
const MIN_SYNC_INTERVAL = 3000; // Don't sync more often than every 3 seconds

let isSyncing = false;
let syncTimer = null;
let retryCount = 0;
let lastSyncTime = 0;

/**
 * Start the background sync loop
 * Runs every 5 seconds when there are pending points
 */
export const startSyncLoop = () => {
  if (syncTimer) return;

  syncTimer = setInterval(async () => {
    await syncPendingPoints();
  }, 5000);

  console.log('[SyncService] Background sync loop started');
};

/**
 * Stop the background sync loop
 */
export const stopSyncLoop = () => {
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
  }
  console.log('[SyncService] Background sync loop stopped');
};

/**
 * Sync pending points from SQLite to the server
 * Uses Socket.IO with acknowledgment, falls back to REST API
 */
export const syncPendingPoints = async () => {
  // Prevent concurrent syncs
  if (isSyncing) return;

  // Rate limiting
  const now = Date.now();
  if (now - lastSyncTime < MIN_SYNC_INTERVAL) return;

  try {
    isSyncing = true;
    lastSyncTime = now;

    // Get pending points from SQLite
    const pendingPoints = await getPendingPoints(MAX_BATCH_SIZE);
    if (pendingPoints.length === 0) {
      retryCount = 0;
      // Periodic cleanup of old synced records
      await cleanupSyncedPoints(24);
      return;
    }

    let userId = await AsyncStorage.getItem('userId');
    if (!userId) {
      const userStr = await AsyncStorage.getItem('user');
      if (userStr) {
        try {
          const user = JSON.parse(userStr);
          userId = user._id || user.id;
          if (userId) {
            await AsyncStorage.setItem('userId', userId);
          }
        } catch (e) {}
      }
    }

    if (!userId) {
      console.warn('[SyncService] No userId found, skipping sync');
      return;
    }

    // Convert SQLite rows to batch format expected by the server
    const batch = pendingPoints.map(row => ({
      latitude: row.latitude,
      longitude: row.longitude,
      speed: row.speed,
      heading: row.heading,
      accuracy: row.accuracy,
      altitude: row.altitude,
      battery: row.battery,
      tripId: row.tripId,
      deviceId: row.deviceId,
      timestamp: row.timestamp,
      isMock: false
    }));

    const pointIds = pendingPoints.map(row => row.id);

    console.log(`[SyncService] Uploading batch of ${batch.length} points...`);

    let success = false;

    // Try Socket.IO first (faster, real-time)
    if (socket && socket.connected) {
      success = await syncViaSocket(userId, batch);
    }

    // Fallback to REST API
    if (!success) {
      success = await syncViaREST(userId, batch);
    }

    if (success) {
      // Mark points as synced in SQLite
      await markPointsSynced(pointIds);
      retryCount = 0;
      console.log(`[SyncService] ✓ ${batch.length} points synced successfully`);

      // If there are more pending points, schedule another sync quickly
      const remaining = await getPendingCount();
      if (remaining > 0) {
        setTimeout(() => syncPendingPoints(), 500);
      }
    } else {
      // Mark as failed with retry counter
      await markPointsFailed(pointIds);
      retryCount = Math.min(retryCount + 1, MAX_RETRIES);
      const delay = Math.min(5000 * Math.pow(2, retryCount - 1), 60000);
      console.warn(`[SyncService] ✗ Sync failed (retry #${retryCount} in ${delay / 1000}s)`);
    }
  } catch (err) {
    console.error('[SyncService] Sync error:', err.message);
  } finally {
    isSyncing = false;
  }
};

/**
 * Sync via Socket.IO with acknowledgment callback
 */
const syncViaSocket = (userId, batch) => {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      console.warn('[SyncService] Socket acknowledgment timeout (10s)');
      resolve(false);
    }, 10000);

    socket.emit('trackingBatch', { userId, batch }, (response) => {
      clearTimeout(timeout);
      if (response && response.success) {
        resolve(true);
      } else {
        console.warn('[SyncService] Socket batch rejected:', response?.error || 'unknown');
        resolve(false);
      }
    });
  });
};

/**
 * Sync via REST API (fallback)
 */
const syncViaREST = async (userId, batch) => {
  try {
    const response = await api.post('/attendance/track-batch', { userId, batch });
    return response.data && response.data.success;
  } catch (err) {
    console.warn('[SyncService] REST sync failed:', err.message);
    return false;
  }
};

/**
 * Force an immediate sync (called on demand, e.g., before punch-out)
 */
export const forceSyncAll = async () => {
  let totalSynced = 0;
  let hasMore = true;

  while (hasMore) {
    const count = await getPendingCount();
    if (count === 0) {
      hasMore = false;
      break;
    }

    await syncPendingPoints();
    totalSynced += Math.min(count, MAX_BATCH_SIZE);

    // Safety limit — don't loop forever
    if (totalSynced > 10000) {
      console.warn('[SyncService] Force sync safety limit reached');
      break;
    }
  }

  console.log(`[SyncService] Force sync complete: ${totalSynced} points processed`);
  return totalSynced;
};

/**
 * Get sync status for UI display
 * @returns {Object} { pending, syncing, retryCount }
 */
export const getSyncStatus = async () => {
  const pending = await getPendingCount();
  return {
    pending,
    syncing: isSyncing,
    retryCount,
    connected: socket?.connected || false
  };
};
