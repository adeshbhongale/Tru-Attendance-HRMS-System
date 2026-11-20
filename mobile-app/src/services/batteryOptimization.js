import { Alert, Linking, Platform } from 'react-native';

/**
 * Google Play Store Policy Compliance:
 * REQUEST_IGNORE_BATTERY_OPTIMIZATIONS is restricted by Google Play Policy.
 * Foreground Location Service (FOREGROUND_SERVICE_LOCATION) is used instead.
 */
export const isBatteryOptimizationIgnored = async () => {
  return true;
};

export const requestIgnoreBatteryOptimizations = async () => {
  if (Platform.OS !== 'android') return;
  try {
    Linking.openSettings();
  } catch (_) {}
};

export const promptDisableBatteryOptimization = () => {
  if (Platform.OS !== 'android') return;
  Alert.alert(
    'Battery Optimization Tip',
    'If background route tracking stops while your screen is locked, you can set Battery usage to Unrestricted in App Settings.',
    [
      { text: 'Later', style: 'cancel' },
      { text: 'Open Settings', onPress: () => Linking.openSettings() },
    ]
  );
};
