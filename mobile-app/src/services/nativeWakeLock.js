import { NativeModules, Platform } from 'react-native';

const { NativeWakeLock } = NativeModules;

/**
 * Acquire hardware CPU PARTIAL_WAKE_LOCK if a custom NativeWakeLock module is registered.
 * When running under Expo's LocationTaskService foreground service, Android wake locks
 * are already managed natively by expo-location via android.permission.WAKE_LOCK.
 */
export const acquireWakeLock = async () => {
  if (Platform.OS !== 'android') return false;
  if (!NativeWakeLock || typeof NativeWakeLock.acquireWakeLock !== 'function') {
    return false;
  }

  try {
    const success = await NativeWakeLock.acquireWakeLock('GeoTrack:DutyTracking');
    console.log('[NativeWakeLock] Hardware CPU WakeLock acquired:', success);
    return success;
  } catch (err) {
    console.warn('[NativeWakeLock] Acquire warning:', err?.message);
    return false;
  }
};

/**
 * Release hardware CPU PARTIAL_WAKE_LOCK upon punch-out.
 */
export const releaseWakeLock = async () => {
  if (Platform.OS !== 'android') return false;
  if (!NativeWakeLock || typeof NativeWakeLock.releaseWakeLock !== 'function') {
    return false;
  }

  try {
    const success = await NativeWakeLock.releaseWakeLock();
    console.log('[NativeWakeLock] Hardware CPU WakeLock released:', success);
    return success;
  } catch (err) {
    console.warn('[NativeWakeLock] Release warning:', err?.message);
    return false;
  }
};

export const isWakeLockHeld = async () => {
  if (Platform.OS !== 'android' || !NativeWakeLock) return false;
  try {
    return await NativeWakeLock.isHeld();
  } catch (_) {
    return false;
  }
};
