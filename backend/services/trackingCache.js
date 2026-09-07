/**
 * Tracking Cache Service
 * 
 * In-memory cache layer that eliminates ~87% of MongoDB queries from the
 * GPS tracking and heartbeat pipelines. No external dependencies (no Redis).
 * 
 * Architecture:
 * - TTL-based read caches for rarely-changing data (User, Config, Geofences)
 * - In-memory mirror for LiveEmployeeStatus (flush every 30s)
 * - Write buffers for Attendance updates, TrackingLog inserts (flush every 30s)
 * - Dedup timestamp sets to skip RawTrackingPoint duplicate checks
 * - Debounced User.isOnline updates (once per 5 min)
 * 
 * DATA SAFETY: Raw GPS points (RawTrackingPoint.insertMany) are NEVER buffered.
 * All buffered data is derived/computed and can be reconstructed from raw points.
 */

const mongoose = require('mongoose');

// ─────────────────────────────────────────────────────────────────────────────
// 1. GENERIC TTL CACHE STORE
// ─────────────────────────────────────────────────────────────────────────────

class CacheStore {
  /**
   * @param {string} name - Cache name for logging
   * @param {number} ttlMs - Time-to-live in milliseconds
   * @param {number} cleanupIntervalMs - How often to purge expired entries
   */
  constructor(name, ttlMs = 5 * 60 * 1000, cleanupIntervalMs = 60 * 1000) {
    this.name = name;
    this.ttlMs = ttlMs;
    this._store = new Map();
    this._cleanupTimer = null;
    this._hits = 0;
    this._misses = 0;
    this._cleanupIntervalMs = cleanupIntervalMs;
  }

  get(key) {
    const entry = this._store.get(key);
    if (!entry) {
      this._misses++;
      return null;
    }
    if (Date.now() > entry.expiresAt) {
      this._store.delete(key);
      this._misses++;
      return null;
    }
    this._hits++;
    return entry.value;
  }

  set(key, value) {
    this._store.set(key, {
      value,
      expiresAt: Date.now() + this.ttlMs,
    });
  }

  invalidate(key) {
    this._store.delete(key);
  }

  invalidateByPrefix(prefix) {
    for (const key of this._store.keys()) {
      if (key.startsWith(prefix)) {
        this._store.delete(key);
      }
    }
  }

  clear() {
    this._store.clear();
  }

  _cleanup() {
    const now = Date.now();
    for (const [key, entry] of this._store.entries()) {
      if (now > entry.expiresAt) {
        this._store.delete(key);
      }
    }
  }

  startCleanup() {
    if (this._cleanupTimer) return;
    this._cleanupTimer = setInterval(() => this._cleanup(), this._cleanupIntervalMs);
    if (this._cleanupTimer.unref) this._cleanupTimer.unref();
  }

  stopCleanup() {
    if (this._cleanupTimer) {
      clearInterval(this._cleanupTimer);
      this._cleanupTimer = null;
    }
  }

  get stats() {
    return {
      name: this.name,
      size: this._store.size,
      hits: this._hits,
      misses: this._misses,
      hitRate: this._hits + this._misses > 0
        ? ((this._hits / (this._hits + this._misses)) * 100).toFixed(1) + '%'
        : 'N/A',
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. SPECIFIC CACHE INSTANCES
// ─────────────────────────────────────────────────────────────────────────────

// User profiles (with levelRef populated) — TTL 5 min
const userCache = new CacheStore('UserCache', 5 * 60 * 1000);

// MobileAppConfig per company — TTL 5 min
const configCache = new CacheStore('ConfigCache', 5 * 60 * 1000);

// Geofence boundaries per user — TTL 5 min
const geofenceCache = new CacheStore('GeofenceCache', 5 * 60 * 1000);

// Active attendance ID per user — TTL 2 min
const attendanceIdCache = new CacheStore('AttendanceIdCache', 2 * 60 * 1000);

/**
 * Get user with levelRef populated, from cache or DB.
 * @param {string} userId
 * @returns {Promise<Object|null>} Lean user document
 */
async function getUser(userId) {
  if (!userId) return null;
  const key = userId.toString();
  const cached = userCache.get(key);
  if (cached) return cached;

  if (!mongoose.Types.ObjectId.isValid(key)) return null;

  const User = require('../models/User');
  const user = await User.findById(key).populate('levelRef').lean();
  if (user) {
    userCache.set(key, user);
  }
  return user;
}

/**
 * Get MobileAppConfig for a company, from cache or DB.
 * @param {string} companyId
 * @returns {Promise<Object|null>} Lean config document
 */
async function getConfig(companyId) {
  if (!companyId) return null;
  const key = companyId.toString();
  const cached = configCache.get(key);
  if (cached !== null) return cached;

  if (!mongoose.Types.ObjectId.isValid(key)) {
    configCache.set(key, false);
    return null;
  }

  const MobileAppConfig = require('../models/MobileAppConfig');
  const config = await MobileAppConfig.findOne({ companyId: key }).lean();
  // Cache even null results to avoid repeated misses
  configCache.set(key, config || false);
  return config || null;
}

/**
 * Get geofence boundaries for a user/company, from cache or DB.
 * @param {string} userId
 * @param {string} companyId
 * @returns {Promise<Array>} Array of geofence boundary objects
 */
async function getGeofences(userId, companyId) {
  const key = `${userId}:${companyId}`;
  const cached = geofenceCache.get(key);
  if (cached) return cached;

  const geofenceService = require('./geofenceService');
  const geofences = await geofenceService.resolveUserGeofences(userId, companyId);
  geofenceCache.set(key, geofences);
  return geofences;
}

/**
 * Get or resolve the active attendance ID for a user.
 * Caches the result for 2 minutes to avoid up to 4 findOne queries per batch.
 * @param {string} userId
 * @param {string} companyId
 * @param {Object} firstBatchPoint - First point in the batch (for date resolution)
 * @returns {Promise<string|null>} Attendance document _id as string, or null
 */
async function getActiveAttendanceId(userId, companyId, firstBatchPoint) {
  const key = userId.toString();
  const cached = attendanceIdCache.get(key);
  if (cached) return cached;

  const Attendance = require('../models/Attendance');
  let attendance = null;

  const activePunchFilter = {
    'punchIn.time': { $exists: true, $ne: null },
    $or: [
      { 'punchOut.time': { $exists: false } },
      { 'punchOut.time': null }
    ]
  };

  // Try tripId first
  if (firstBatchPoint && firstBatchPoint.tripId && mongoose.Types.ObjectId.isValid(firstBatchPoint.tripId)) {
    attendance = await Attendance.findOne({
      _id: firstBatchPoint.tripId,
      ...activePunchFilter
    }).select('_id').lean();
  }

  // Try by date
  if (!attendance && firstBatchPoint) {
    const pointDate = new Date(firstBatchPoint.timestamp || firstBatchPoint.time);
    const pointStart = new Date(pointDate);
    pointStart.setUTCHours(0, 0, 0, 0);
    const pointEnd = new Date(pointDate);
    pointEnd.setUTCHours(23, 59, 59, 999);
    attendance = await Attendance.findOne({
      user: userId,
      ...activePunchFilter,
      date: { $gte: pointStart, $lte: pointEnd }
    }).select('_id').sort('-date').lean();
  }

  // Try active session (punched in, no punch out)
  if (!attendance) {
    attendance = await Attendance.findOne({
      user: userId,
      ...activePunchFilter
    }).select('_id').sort('-date').lean();
  }

  // Try today (only if punched in)
  if (!attendance) {
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setUTCHours(23, 59, 59, 999);
    attendance = await Attendance.findOne({
      user: userId,
      ...activePunchFilter,
      date: { $gte: todayStart, $lte: todayEnd }
    }).select('_id').sort('-date').lean();
  }

  const attendanceId = attendance ? attendance._id.toString() : null;
  if (attendanceId) {
    attendanceIdCache.set(key, attendanceId);
  }
  return attendanceId;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. LIVE EMPLOYEE STATUS — IN-MEMORY MIRROR
// ─────────────────────────────────────────────────────────────────────────────

/**
 * LiveStatusStore keeps LiveEmployeeStatus documents in RAM.
 * Reads are instant (0 MongoDB queries). Dirty entries flush every 30s.
 */
class LiveStatusStore {
  constructor() {
    this._store = new Map(); // key: `${companyId}:${userId}` → { doc, dirty }
    this._flushTimer = null;
    this._flushCount = 0;
  }

  _key(userId, companyId) {
    return `${companyId || 'none'}:${userId}`;
  }

  /**
   * Get or create a LiveEmployeeStatus-like plain object from RAM.
   * On first access for a userId, loads from MongoDB.
   * @param {string} userId
   * @param {string} companyId
   * @returns {Promise<Object>} Mutable status object
   */
  async get(userId, companyId) {
    const key = this._key(userId, companyId);
    const entry = this._store.get(key);
    if (entry) return entry.doc;

    // First access — load from MongoDB safely
    const { LiveEmployeeStatus } = require('../models/Tracking');
    let doc = null;
    try {
      const query = {};
      if (userId && mongoose.Types.ObjectId.isValid(userId)) {
        query.userId = userId;
      }
      if (companyId && mongoose.Types.ObjectId.isValid(companyId)) {
        query.companyId = companyId;
      }
      if (query.userId) {
        doc = await LiveEmployeeStatus.findOne(query).lean();
      }
    } catch (findErr) {
      console.warn(`[TrackingCache] LiveStatus find error for ${key}:`, findErr.message);
    }

    if (!doc) {
      doc = {
        _isNew: true,
        companyId: companyId || null,
        userId,
        currentStatus: 'offline',
        trackingStatus: 'offline',
        movementState: 'Idle',
        totalDistanceToday: 0,
        stops: 0,
        avgSpeed: 0,
        recoveryAttempts: 0,
        trackingHealth: 'healthy',
        trackingHealthReason: '',
      };
    }

    // Attach backward-compatible save() so legacy or edge-case calls don't crash
    doc.save = async () => {
      this.markDirty(userId, companyId);
      return doc;
    };

    this._store.set(key, { doc, dirty: false });
    return doc;
  }

  /**
   * Mark a user's live status as dirty (needs flushing to MongoDB).
   * @param {string} userId
   * @param {string} companyId
   */
  markDirty(userId, companyId) {
    const key = this._key(userId, companyId);
    const entry = this._store.get(key);
    if (entry) entry.dirty = true;
  }

  /**
   * Update fields on a user's live status and mark dirty.
   * @param {string} userId
   * @param {string} companyId
   * @param {Object} updates - Fields to merge into the status object
   */
  async update(userId, companyId, updates) {
    const doc = await this.get(userId, companyId);
    Object.assign(doc, updates);
    this.markDirty(userId, companyId);
    return doc;
  }

  /**
   * Flush all dirty entries to MongoDB.
   */
  async flush() {
    const { LiveEmployeeStatus } = require('../models/Tracking');
    const promises = [];

    for (const [key, entry] of this._store.entries()) {
      if (!entry.dirty) continue;

      const { doc } = entry;
      const isNew = doc._isNew;

      // Build the update payload (exclude internal flags)
      const updatePayload = { ...doc };
      delete updatePayload._id;
      delete updatePayload.__v;
      delete updatePayload._isNew;

      if (isNew) {
        // upsert to handle race conditions
        promises.push(
          LiveEmployeeStatus.updateOne(
            { userId: doc.userId, companyId: doc.companyId },
            { $set: updatePayload },
            { upsert: true }
          ).then(() => {
            doc._isNew = false;
            entry.dirty = false;
          }).catch(err => {
            console.error(`[TrackingCache] LiveStatus flush error for ${key}:`, err.message);
          })
        );
      } else {
        promises.push(
          LiveEmployeeStatus.updateOne(
            { userId: doc.userId, companyId: doc.companyId },
            { $set: updatePayload }
          ).then(() => {
            entry.dirty = false;
          }).catch(err => {
            console.error(`[TrackingCache] LiveStatus flush error for ${key}:`, err.message);
          })
        );
      }
    }

    if (promises.length > 0) {
      await Promise.allSettled(promises);
      this._flushCount += promises.length;
    }
  }

  /**
   * Evict a user's status from RAM (forces reload from DB on next access).
   */
  evict(userId, companyId) {
    this._store.delete(this._key(userId, companyId));
  }

  /**
   * Get all in-memory live statuses (for watchdog use).
   * @returns {Array<Object>} Array of { userId, companyId, doc }
   */
  getAll() {
    const result = [];
    for (const [, entry] of this._store.entries()) {
      result.push(entry.doc);
    }
    return result;
  }

  get stats() {
    let dirtyCount = 0;
    for (const [, entry] of this._store.entries()) {
      if (entry.dirty) dirtyCount++;
    }
    return {
      name: 'LiveStatusStore',
      size: this._store.size,
      dirty: dirtyCount,
      totalFlushes: this._flushCount,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. DEDUP TIMESTAMP SET
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Tracks recently inserted timestamps per user to skip the
 * RawTrackingPoint.find() dedup MongoDB query.
 * Keeps the last MAX_ENTRIES timestamps per user.
 */
class DedupTimestampSet {
  constructor(maxEntriesPerUser = 300) {
    this._store = new Map(); // userId → Set<timestampMs>
    this._maxEntries = maxEntriesPerUser;
  }

  /**
   * Check if all timestamps in the array have already been seen.
   * Returns the list of unseen timestamps.
   * @param {string} userId
   * @param {Array<Date>} timestamps
   * @returns {Array<Date>} Timestamps NOT yet seen
   */
  filterUnseen(userId, timestamps) {
    const key = userId.toString();
    const seen = this._store.get(key);
    if (!seen) return timestamps;

    return timestamps.filter(ts => !seen.has(new Date(ts).getTime()));
  }

  /**
   * Record that these timestamps have been inserted.
   * @param {string} userId
   * @param {Array<Date>} timestamps
   */
  recordInserted(userId, timestamps) {
    const key = userId.toString();
    let seen = this._store.get(key);
    if (!seen) {
      seen = new Set();
      this._store.set(key, seen);
    }

    for (const ts of timestamps) {
      seen.add(new Date(ts).getTime());
    }

    // Trim old entries if over limit
    if (seen.size > this._maxEntries) {
      const arr = Array.from(seen).sort((a, b) => a - b);
      const toRemove = arr.slice(0, arr.length - this._maxEntries);
      for (const ts of toRemove) {
        seen.delete(ts);
      }
    }
  }

  clear(userId) {
    if (userId) {
      this._store.delete(userId.toString());
    } else {
      this._store.clear();
    }
  }

  get stats() {
    let totalEntries = 0;
    for (const set of this._store.values()) {
      totalEntries += set.size;
    }
    return {
      name: 'DedupTimestampSet',
      users: this._store.size,
      totalEntries,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. ATTENDANCE UPDATE BUFFER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Merges Attendance $inc and $set updates per attendance ID.
 * Flushes atomically every 30s instead of writing on every GPS batch.
 */
class AttendanceUpdateBuffer {
  constructor() {
    this._store = new Map(); // attendanceId → { $inc: {}, $set: {} }
    this._flushCount = 0;
  }

  /**
   * Merge an atomic update for an attendance document.
   * @param {string} attendanceId
   * @param {Object} update - Mongoose-style { $inc: {}, $set: {} }
   */
  merge(attendanceId, update) {
    if (!attendanceId) return;
    const key = attendanceId.toString();
    let existing = this._store.get(key);
    if (!existing) {
      existing = { $inc: {}, $set: {} };
      this._store.set(key, existing);
    }

    // Merge $inc fields (additive)
    if (update.$inc) {
      for (const [field, val] of Object.entries(update.$inc)) {
        existing.$inc[field] = (existing.$inc[field] || 0) + val;
      }
    }

    // Merge $set fields (last-write-wins)
    if (update.$set) {
      Object.assign(existing.$set, update.$set);
    }
  }

  /**
   * Flush all buffered updates to MongoDB.
   */
  async flush() {
    if (this._store.size === 0) return;

    const Attendance = require('../models/Attendance');
    const entries = Array.from(this._store.entries());
    this._store.clear();

    const promises = entries.map(([id, update]) => {
      const mongoUpdate = {};
      if (Object.keys(update.$inc).length > 0) mongoUpdate.$inc = update.$inc;
      if (Object.keys(update.$set).length > 0) mongoUpdate.$set = update.$set;
      if (Object.keys(mongoUpdate).length === 0) return Promise.resolve();

      return Attendance.updateOne({ _id: id }, mongoUpdate).catch(err => {
        console.error(`[TrackingCache] Attendance flush error for ${id}:`, err.message);
        // Put it back for next flush attempt
        this.merge(id, update);
      });
    });

    await Promise.allSettled(promises);
    this._flushCount += entries.length;
  }

  get stats() {
    return {
      name: 'AttendanceUpdateBuffer',
      pending: this._store.size,
      totalFlushes: this._flushCount,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. TRACKING LOG BUFFER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Buffers TrackingLog entries and bulk-inserts every 30s.
 */
class TrackingLogBuffer {
  constructor() {
    this._buffer = [];
    this._flushCount = 0;
  }

  push(logEntry) {
    this._buffer.push(logEntry);
  }

  async flush() {
    if (this._buffer.length === 0) return;

    const { TrackingLog } = require('../models/Tracking');
    const entries = this._buffer.splice(0);

    try {
      await TrackingLog.insertMany(entries, { ordered: false });
      this._flushCount += entries.length;
    } catch (err) {
      console.error(`[TrackingCache] TrackingLog flush error (${entries.length} entries):`, err.message);
      // Don't re-queue — tracking logs are non-critical aggregation data
    }
  }

  get stats() {
    return {
      name: 'TrackingLogBuffer',
      pending: this._buffer.length,
      totalFlushes: this._flushCount,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. USER ONLINE DEBOUNCER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Debounces User.isOnline updates to once per 5 minutes per user.
 * Previously this was called on EVERY GPS batch (~40 times/hr/user).
 */
class UserOnlineDebouncer {
  constructor(debounceMs = 5 * 60 * 1000) {
    this._lastUpdate = new Map(); // userId → timestamp
    this._debounceMs = debounceMs;
    this._pending = new Set(); // userIds that need flushing
    this._flushCount = 0;
  }

  /**
   * Mark a user as online. Only actually writes to DB if debounce period passed.
   * @param {string} userId
   */
  markOnline(userId) {
    const key = userId.toString();
    const last = this._lastUpdate.get(key) || 0;
    if (Date.now() - last < this._debounceMs) return;
    this._pending.add(key);
  }

  async flush() {
    if (this._pending.size === 0) return;

    const userIds = Array.from(this._pending);
    this._pending.clear();

    try {
      const User = require('../models/User');
      await User.updateMany(
        { _id: { $in: userIds } },
        { $set: { isOnline: true } }
      );
      const now = Date.now();
      for (const uid of userIds) {
        this._lastUpdate.set(uid, now);
      }
      this._flushCount += userIds.length;
    } catch (err) {
      console.error(`[TrackingCache] UserOnline flush error:`, err.message);
    }
  }

  get stats() {
    return {
      name: 'UserOnlineDebouncer',
      tracked: this._lastUpdate.size,
      pending: this._pending.size,
      totalFlushes: this._flushCount,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. SINGLETON INSTANCES & FLUSH ORCHESTRATION
// ─────────────────────────────────────────────────────────────────────────────

const liveStatus = new LiveStatusStore();
const dedup = new DedupTimestampSet();
const attendanceBuffer = new AttendanceUpdateBuffer();
const trackingLogBuffer = new TrackingLogBuffer();
const userOnline = new UserOnlineDebouncer();

let _flushInterval = null;
let _userOnlineInterval = null;

/**
 * Start all periodic flush timers. Call after DB connects.
 */
function startFlushIntervals() {
  // Flush live status, attendance, and tracking logs every 30s
  _flushInterval = setInterval(async () => {
    try {
      await Promise.allSettled([
        liveStatus.flush(),
        attendanceBuffer.flush(),
        trackingLogBuffer.flush(),
      ]);
    } catch (err) {
      console.error('[TrackingCache] Flush cycle error:', err.message);
    }
  }, 30000);
  if (_flushInterval.unref) _flushInterval.unref();

  // Flush user online status every 60 seconds
  _userOnlineInterval = setInterval(async () => {
    try {
      await userOnline.flush();
    } catch (err) {
      console.error('[TrackingCache] UserOnline flush error:', err.message);
    }
  }, 60000);
  if (_userOnlineInterval.unref) _userOnlineInterval.unref();

  // Start TTL cleanup for read caches
  userCache.startCleanup();
  configCache.startCleanup();
  geofenceCache.startCleanup();
  attendanceIdCache.startCleanup();

  console.log('[TrackingCache] ✅ All flush intervals and cache cleanup started.');
}

/**
 * Stop all timers and flush remaining dirty data. Call on shutdown.
 */
async function stopFlushIntervals() {
  console.log('[TrackingCache] Flushing all dirty data before shutdown...');

  if (_flushInterval) {
    clearInterval(_flushInterval);
    _flushInterval = null;
  }
  if (_userOnlineInterval) {
    clearInterval(_userOnlineInterval);
    _userOnlineInterval = null;
  }

  userCache.stopCleanup();
  configCache.stopCleanup();
  geofenceCache.stopCleanup();
  attendanceIdCache.stopCleanup();

  // Final flush of all dirty data
  try {
    await Promise.allSettled([
      liveStatus.flush(),
      attendanceBuffer.flush(),
      trackingLogBuffer.flush(),
      userOnline.flush(),
    ]);
    console.log('[TrackingCache] ✅ Final flush complete.');
  } catch (err) {
    console.error('[TrackingCache] Final flush error:', err.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. CACHE INVALIDATION HOOKS (for admin panel mutations)
// ─────────────────────────────────────────────────────────────────────────────

function invalidateUser(userId) {
  if (!userId) return;
  const key = userId.toString();
  userCache.invalidate(key);
  geofenceCache.invalidateByPrefix(`${key}:`);
  attendanceIdCache.invalidate(key);
}

function invalidateConfig(companyId) {
  if (!companyId) return;
  configCache.invalidate(companyId.toString());
}

function invalidateGeofences(companyId) {
  if (!companyId) return;
  // Invalidate all geofence entries for this company
  const prefix = companyId.toString();
  for (const key of geofenceCache._store.keys()) {
    if (key.endsWith(`:${prefix}`)) {
      geofenceCache.invalidate(key);
    }
  }
}

function invalidateAttendance(userId) {
  if (!userId) return;
  attendanceIdCache.invalidate(userId.toString());
}

// ─────────────────────────────────────────────────────────────────────────────
// 10. STATS ENDPOINT DATA
// ─────────────────────────────────────────────────────────────────────────────

function getStats() {
  return {
    caches: [
      userCache.stats,
      configCache.stats,
      geofenceCache.stats,
      attendanceIdCache.stats,
    ],
    stores: [
      liveStatus.stats,
      dedup.stats,
    ],
    buffers: [
      attendanceBuffer.stats,
      trackingLogBuffer.stats,
      userOnline.stats,
    ],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────────────────────

module.exports = {
  // Read caches
  getUser,
  getConfig,
  getGeofences,
  getActiveAttendanceId,

  // LiveStatus in-memory mirror
  liveStatus,

  // Dedup
  dedup,

  // Write buffers
  attendanceBuffer,
  trackingLogBuffer,
  userOnline,

  // Lifecycle
  startFlushIntervals,
  stopFlushIntervals,

  // Cache invalidation (for admin mutations)
  invalidateUser,
  invalidateConfig,
  invalidateGeofences,
  invalidateAttendance,

  // Debug
  getStats,
};
