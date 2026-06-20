import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../api/axios';
import socket from '../socket';

const OFFLINE_QUEUE_KEY = 'location_offline_queue';
const MAX_BATCH_SIZE = 20;
const MAX_RETRIES = 5;

let isSyncing = false;
let retryCount = 0;
let retryTimer = null;

/**
 * Appends a tracking point to the offline persistent queue
 * @param {Object} point GPS location coordinates and metadata
 */
export const addPointToQueue = async (point) => {
  try {
    const queueStr = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
    const queue = queueStr ? JSON.parse(queueStr) : [];
    queue.push(point);
    await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
  } catch (err) {
    console.error('[OfflineQueue] Failed to add point:', err);
  }
};

/**
 * Retrieves all points currently in the queue
 * @returns {Promise<Array>} Array of queued tracking points
 */
export const getQueue = async () => {
  try {
    const queueStr = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
    return queueStr ? JSON.parse(queueStr) : [];
  } catch (err) {
    console.error('[OfflineQueue] Failed to get queue:', err);
    return [];
  }
};

/**
 * Removes the first N items from the queue (only after successful upload)
 * @param {number} count Number of items to remove from the front
 */
const removeProcessedPoints = async (count) => {
  try {
    const queueStr = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
    const queue = queueStr ? JSON.parse(queueStr) : [];
    const remaining = queue.slice(count);
    await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(remaining));
  } catch (err) {
    console.error('[OfflineQueue] Failed to remove processed points:', err);
  }
};

/**
 * Empties the queue
 */
export const clearQueue = async () => {
  try {
    await AsyncStorage.removeItem(OFFLINE_QUEUE_KEY);
  } catch (err) {
    console.error('[OfflineQueue] Failed to clear queue:', err);
  }
};

/**
 * Synchronizes the queued offline points with the server.
 * Uses Socket.IO with acknowledgment callback, with HTTP REST fallback.
 * Only clears points AFTER server confirms successful processing.
 */
export const syncQueue = async () => {
  // Prevent concurrent sync operations
  if (isSyncing) return;

  try {
    isSyncing = true;

    const queue = await getQueue();
    if (queue.length === 0) {
      retryCount = 0;
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
      console.warn('[OfflineQueue] No userId found, skipping sync');
      return;
    }

    // Take a batch (max 100 points at a time)
    const batch = queue.slice(0, MAX_BATCH_SIZE);

    if (socket && socket.connected) {
      // Use Socket.IO with acknowledgment callback
      const success = await new Promise((resolve) => {
        const timeout = setTimeout(() => {
          console.warn('[OfflineQueue] Socket acknowledgment timeout (10s)');
          resolve(false);
        }, 10000);

        socket.emit('trackingBatch', { userId, batch }, (response) => {
          clearTimeout(timeout);
          if (response && response.success) {
            resolve(true);
          } else {
            console.warn('[OfflineQueue] Server rejected batch:', response?.error || 'unknown');
            resolve(false);
          }
        });
      });

      if (success) {
        // Only remove points that were successfully processed
        await removeProcessedPoints(batch.length);
        retryCount = 0;

        // If there are more points, schedule another sync
        const remaining = queue.length - batch.length;
        if (remaining > 0) {
          setTimeout(() => syncQueue(), 500);
        }
      } else {
        handleSyncFailure();
      }
    } else {
      // REST API fallback
      try {
        const response = await api.post('/attendance/track-batch', { userId, batch });
        if (response.data && response.data.success) {
          await removeProcessedPoints(batch.length);
          retryCount = 0;

          const remaining = queue.length - batch.length;
          if (remaining > 0) {
            setTimeout(() => syncQueue(), 500);
          }
        } else {
          handleSyncFailure();
        }
      } catch (apiErr) {
        console.warn('[OfflineQueue] REST API sync failed:', apiErr.message);
        handleSyncFailure();
      }
    }
  } catch (err) {
    console.warn('[OfflineQueue] Synchronisation failed:', err.message);
    handleSyncFailure();
  } finally {
    isSyncing = false;
  }
};

/**
 * Handles sync failures with exponential backoff retry
 */
function handleSyncFailure() {
  retryCount = Math.min(retryCount + 1, MAX_RETRIES);
  const delay = Math.min(5000 * Math.pow(2, retryCount - 1), 60000); // 5s, 10s, 20s, 40s, 60s

  if (retryTimer) clearTimeout(retryTimer);

  retryTimer = setTimeout(() => {
    retryTimer = null;
    syncQueue();
  }, delay);

  console.log(`[OfflineQueue] Retry #${retryCount} scheduled in ${delay / 1000}s`);
}
