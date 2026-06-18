import * as SQLite from 'expo-sqlite';

const DB_NAME = 'geo_tracking.db';
let db = null;

/**
 * Database Service for local GPS tracking storage
 * Uses expo-sqlite for offline-first GPS point persistence
 */

/**
 * Initialize the database and create tables
 */
export const initDatabase = async () => {
  try {
    if (db) return db;
    
    db = await SQLite.openDatabaseAsync(DB_NAME);
    
    // Create tracking_points table
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS tracking_points (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tripId TEXT,
        deviceId TEXT,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        speed REAL DEFAULT 0,
        heading REAL DEFAULT 0,
        accuracy REAL DEFAULT 0,
        altitude REAL DEFAULT 0,
        battery REAL DEFAULT 100,
        timestamp INTEGER NOT NULL,
        syncStatus TEXT DEFAULT 'pending',
        roadStatus TEXT DEFAULT 'pending',
        retryCount INTEGER DEFAULT 0,
        createdAt TEXT DEFAULT (datetime('now'))
      );
    `);

    // Create index for faster queries
    await db.execAsync(`
      CREATE INDEX IF NOT EXISTS idx_sync_status ON tracking_points(syncStatus);
      CREATE INDEX IF NOT EXISTS idx_trip_timestamp ON tracking_points(tripId, timestamp);
    `);

    console.log('[DatabaseService] Initialized successfully');
    return db;
  } catch (err) {
    console.error('[DatabaseService] Init failed:', err);
    throw err;
  }
};

/**
 * Insert a GPS tracking point into SQLite
 * @param {Object} point - GPS point with lat, lng, speed, etc.
 * @returns {Promise<number>} Inserted row ID
 */
export const insertTrackingPoint = async (point) => {
  try {
    const database = await initDatabase();
    
    const result = await database.runAsync(
      `INSERT INTO tracking_points 
        (tripId, deviceId, latitude, longitude, speed, heading, accuracy, altitude, battery, timestamp, syncStatus, roadStatus)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'pending')`,
      [
        point.tripId || null,
        point.deviceId || null,
        point.latitude,
        point.longitude,
        point.speed || 0,
        point.heading || 0,
        point.accuracy || 0,
        point.altitude || 0,
        point.battery || 100,
        point.timestamp || Date.now()
      ]
    );

    return result.lastInsertRowId;
  } catch (err) {
    console.error('[DatabaseService] Insert failed:', err);
    throw err;
  }
};

/**
 * Get pending (unsynchronized) tracking points
 * @param {number} limit - Max number of points to retrieve
 * @returns {Promise<Array>} Array of pending tracking points
 */
export const getPendingPoints = async (limit = 100) => {
  try {
    const database = await initDatabase();
    
    const rows = await database.getAllAsync(
      `SELECT * FROM tracking_points 
       WHERE syncStatus = 'pending' OR (syncStatus = 'failed' AND retryCount < 5)
       ORDER BY timestamp ASC 
       LIMIT ?`,
      [limit]
    );

    return rows;
  } catch (err) {
    console.error('[DatabaseService] Get pending failed:', err);
    return [];
  }
};

/**
 * Mark points as synced after successful upload
 * @param {Array<number>} ids - Array of row IDs to mark as synced
 */
export const markPointsSynced = async (ids) => {
  try {
    if (!ids || ids.length === 0) return;
    const database = await initDatabase();
    
    const placeholders = ids.map(() => '?').join(',');
    await database.runAsync(
      `UPDATE tracking_points SET syncStatus = 'synced' WHERE id IN (${placeholders})`,
      ids
    );
  } catch (err) {
    console.error('[DatabaseService] Mark synced failed:', err);
  }
};

/**
 * Mark points as failed with incremented retry count
 * @param {Array<number>} ids - Array of row IDs to mark as failed
 */
export const markPointsFailed = async (ids) => {
  try {
    if (!ids || ids.length === 0) return;
    const database = await initDatabase();
    
    const placeholders = ids.map(() => '?').join(',');
    await database.runAsync(
      `UPDATE tracking_points SET syncStatus = 'failed', retryCount = retryCount + 1 WHERE id IN (${placeholders})`,
      ids
    );
  } catch (err) {
    console.error('[DatabaseService] Mark failed error:', err);
  }
};

/**
 * Delete synced points older than specified hours
 * @param {number} hours - Delete synced points older than this many hours
 */
export const cleanupSyncedPoints = async (hours = 24) => {
  try {
    const database = await initDatabase();
    const cutoffMs = Date.now() - (hours * 60 * 60 * 1000);
    
    await database.runAsync(
      `DELETE FROM tracking_points WHERE syncStatus = 'synced' AND timestamp < ?`,
      [cutoffMs]
    );
  } catch (err) {
    console.error('[DatabaseService] Cleanup failed:', err);
  }
};

/**
 * Get count of pending points (for UI status display)
 * @returns {Promise<number>} Count of pending points
 */
export const getPendingCount = async () => {
  try {
    const database = await initDatabase();
    const result = await database.getFirstAsync(
      `SELECT COUNT(*) as count FROM tracking_points WHERE syncStatus = 'pending'`
    );
    return result?.count || 0;
  } catch (err) {
    return 0;
  }
};

/**
 * Get all points for a specific trip
 * @param {string} tripId - Trip ID to query
 * @returns {Promise<Array>} Array of tracking points for the trip
 */
export const getPointsByTrip = async (tripId) => {
  try {
    const database = await initDatabase();
    const rows = await database.getAllAsync(
      `SELECT * FROM tracking_points WHERE tripId = ? ORDER BY timestamp ASC`,
      [tripId]
    );
    return rows;
  } catch (err) {
    console.error('[DatabaseService] Get by trip failed:', err);
    return [];
  }
};
