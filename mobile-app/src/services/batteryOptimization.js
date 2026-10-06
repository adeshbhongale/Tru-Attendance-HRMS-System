import { Linking, NativeModules, Platform } from 'react-native';

const { NativeWakeLock } = NativeModules;

/**
 * Checks whether battery optimization is currently ignored (exempted) for this app.
 */
export const isBatteryOptimizationIgnored = async () => {
  if (Platform.OS !== 'android') return true;
  if (NativeWakeLock && typeof NativeWakeLock.isIgnoringBatteryOptimizations === 'function') {
    try {
      return await NativeWakeLock.isIgnoringBatteryOptimizations();
    } catch (_) {
      return false;
    }
  }
  return false;
};

/**
 * Directly requests Android OS to exempt the app from battery optimization (Doze mode)
 * using the official Android Settings ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS intent.
 */
export const requestIgnoreBatteryOptimizations = async () => {
  if (Platform.OS !== 'android') return;

  // 1. Try Native Android Module for direct system prompt dialog
  if (NativeWakeLock && typeof NativeWakeLock.requestIgnoreBatteryOptimizations === 'function') {
    try {
      const res = await NativeWakeLock.requestIgnoreBatteryOptimizations();
      if (res) return;
    } catch (nativeErr) {
      console.warn('[BatteryOpt] Native module notice:', nativeErr?.message);
    }
  }

  // 2. Fallback via Linking intents
  try {
    await Linking.sendIntent('android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS');
  } catch (err1) {
    try {
      await Linking.sendIntent('android.settings.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS', [
        { key: 'package', value: 'package:com.adesh.trackflow' }
      ]);
    } catch (err2) {
      Linking.openSettings();
    }
  }
};
