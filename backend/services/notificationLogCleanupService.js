const NotificationLog = require('../models/NotificationLog');

/**
 * Returns the cutoff date — any NotificationLog with sentAt before this
 * date is eligible for deletion.
 * Defaults to 15 days; override via NOTIFICATION_LOG_RETENTION_DAYS env var.
 */
const getRetentionCutoff = () => {
  const retentionDays = Number(process.env.NOTIFICATION_LOG_RETENTION_DAYS || 15);
  return new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
};

/**
 * Delete old NotificationLog records with a single efficient deleteMany.
 * Only deletes from the NotificationLog collection — no other collections are touched.
 */
const deleteOldNotificationLogs = async (cutoff) => {
  const result = await NotificationLog.deleteMany({ sentAt: { $lt: cutoff } });
  return result.deletedCount || 0;
};

/**
 * Run the full cleanup cycle.
 * Called once on server startup and once daily at midnight.
 */
const runCleanup = async () => {
  try {
    const cutoff = getRetentionCutoff();
    const deletedCount = await deleteOldNotificationLogs(cutoff);

    if (deletedCount > 0) {
      console.log(
        `[NotificationLogCleanup] Deleted ${deletedCount} old notification logs (cutoff: ${cutoff.toISOString()})`
      );
    }
  } catch (err) {
    console.error('[NotificationLogCleanup] Cleanup failed:', err.message);
  }
};

/**
 * Schedule cleanup to run once at the next midnight, then re-schedule.
 * Zero DB calls until midnight — no polling.
 */
const scheduleDailyCleanup = () => {
  const now = new Date();
  const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
  const msUntilMidnight = nextMidnight.getTime() - now.getTime();

  setTimeout(async () => {
    await runCleanup();
    // After running, schedule the next one (24 hours later)
    setInterval(runCleanup, 24 * 60 * 60 * 1000);
  }, msUntilMidnight);

  console.log(`[NotificationLogCleanup] Next cleanup scheduled at midnight (~${Math.round(msUntilMidnight / 60000)} min)`);
};

module.exports = {
  runCleanup,
  scheduleDailyCleanup,
};
