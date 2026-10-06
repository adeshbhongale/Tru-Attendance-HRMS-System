import { NativeModules, Platform } from 'react-native';

const { NativeWakeLock } = NativeModules;

/**
 * Acquire hardware CPU PARTIAL_WAKE_LOCK to prevent Android OS
 * from sleeping or throttling GPS tracking during duty hours.
 */
export const acquireWakeLock = async () => {
  if (Platform.OS !== 'android') return false;
  if (!NativeWakeLock || typeof NativeWakeLock.acquireWakeLock !== 'function') {
    console.log('[NativeWakeLock] Native module unavailable (Expo Go / Web). Skipping.');
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
