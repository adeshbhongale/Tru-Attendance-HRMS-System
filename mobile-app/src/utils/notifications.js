import { Platform, Alert } from 'react-native';
import api from '../api/axios';
import { navigateGlobal } from './navigation';

let Notifications = null;
let isExpoGo = false;

try {
  const Constants = require('expo-constants').default;
  isExpoGo =
    Constants?.appOwnership === 'expo' ||
    Constants?.executionEnvironment === 'storeClient';
} catch (e) {}

if (!isExpoGo && Platform.OS !== 'web') {
  try {
    Notifications = require('expo-notifications');
  } catch (err) {
    console.log('Could not require expo-notifications:', err.message);
  }
}

const processedPushIds = new Set();

// Configure notification behavior
if (Notifications && typeof Notifications.setNotificationHandler === 'function') {
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const data = notification.request.content.data;

      // Local notifications triggered manually by our app shouldn't be blocked
      if (data && data.isLocal) {
        return {
          shouldShowAlert: true,
          shouldPlaySound: true,
          shouldSetBadge: true,
        };
      }

      // Check for duplicates from push notifications
      if (data && data.notificationId) {
        const idStr = data.notificationId.toString();
        if (processedPushIds.has(idStr)) {
          // Suppress duplicate alert (already processed/shown by socket)
          return {
            shouldShowAlert: false,
            shouldPlaySound: false,
            shouldSetBadge: true,
          };
        }
        processedPushIds.add(idStr);
        if (processedPushIds.size > 100) {
          const first = processedPushIds.values().next().value;
          processedPushIds.delete(first);
        }
      }

      return {
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
      };
    },
  });
}

export async function registerPushToken(requestIfUndetermined = true) {
  try {
    if (Platform.OS === 'web') return;

    if (isExpoGo || !Notifications) {
      if (__DEV__) {
        const simulatedToken = `expo_go_simulated_${Platform.OS}_${Math.random().toString(36).substring(7)}`;
        await api.post('/notifications/register-token', {
          fcmToken: simulatedToken,
          deviceType: Platform.OS.toUpperCase()
        });
      }
      return;
    }

    // Create the required Android Notification Channel with maximum importance for background alerts
    if (Platform.OS === 'android' && typeof Notifications.setNotificationChannelAsync === 'function') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default Channel',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
        showBadge: true,
      });
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted' && requestIfUndetermined) {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      if (__DEV__) {
        const simulatedToken = `sandbox_token_${Platform.OS}_${Math.random().toString(36).substring(7)}`;
        await api.post('/notifications/register-token', {
          fcmToken: simulatedToken,
          deviceType: Platform.OS.toUpperCase()
        });
      }
      return;
    }

    let token = null;
    try {
      // Prioritize raw native device push tokens (FCM/APNs) required by firebase-admin SDK
      const deviceTokenObj = await Notifications.getDevicePushTokenAsync().catch(() => null);
      if (deviceTokenObj && deviceTokenObj.data) {
        token = deviceTokenObj.data;
      } else {
        const expoTokenObj = await Notifications.getExpoPushTokenAsync().catch(() => null);
        token = expoTokenObj ? expoTokenObj.data : null;
      }

      if (!token && __DEV__) {
        token = `expo_simulated_${Platform.OS}_${Math.random().toString(36).substring(7)}`;
      }
    } catch (tokenErr) {
      if (__DEV__) {
        token = `expo_simulated_${Platform.OS}_${Math.random().toString(36).substring(7)}`;
      }
    }

    if (!token) return;

    await api.post('/notifications/register-token', {
      fcmToken: token,
      deviceType: Platform.OS.toUpperCase()
    });
  } catch (err) {
    if (__DEV__) {
      console.log('Push registration failed. Running simulator fallback...', err.message);
      try {
        const simulatedToken = `fallback_token_${Platform.OS}_${Math.random().toString(36).substring(7)}`;
        await api.post('/notifications/register-token', {
          fcmToken: simulatedToken,
          deviceType: Platform.OS.toUpperCase()
        });
      } catch (fallbackErr) {
        console.log('Push token fallback failed:', fallbackErr.message);
      }
    }
  }
}

export async function showLocalNotification(title, body, data = {}) {
  try {
    if (data && data.notificationId) {
      const idStr = data.notificationId.toString();
      if (processedPushIds.has(idStr)) {
        // Already shown, do not show again
        return;
      }
      processedPushIds.add(idStr);
      if (processedPushIds.size > 100) {
        const first = processedPushIds.values().next().value;
        processedPushIds.delete(first);
      }
    }

    if (Notifications && typeof Notifications.scheduleNotificationAsync === 'function') {
      await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          data: { ...data, isLocal: true },
          sound: 'default',
        },
        trigger: null,
      });
    } else {
      Alert.alert(title, body);
    }
  } catch (err) {
    console.log('Local notification failed:', err.message);
  }
}

/**
 * Resolve navigation screen & params for notification items / push payloads
 */
export function resolveNotificationTarget(data = {}) {
  const meta = data?.metadata && typeof data.metadata === 'object' ? data.metadata : {};
  const autoType = String(data?.autoType || meta?.autoType || '').trim();
  const title = String(data?.title || '').toLowerCase();
  const leaveId = data?.leaveId || meta?.leaveId || data?.params?.leaveId || null;
  const claimId = data?.claimId || meta?.claimId || null;
  const requestId = data?.requestId || meta?.requestId || null;
  const tab = data?.tab || meta?.tab || null;
  let screen = data?.screen || meta?.screen || null;

  if (!screen) {
    if (autoType === 'Leave requested' || title.includes('new leave request')) {
      screen = 'LeaveApprovals';
    } else if (
      autoType === 'Leave approved' ||
      autoType === 'Leave rejected' ||
      title.includes('leave request approved') ||
      title.includes('leave request rejected')
    ) {
      screen = 'Leave';
    }
  }

  if (screen && screen !== 'Main' && screen !== 'Home') {
    return {
      screen,
      params: {
        ...(data?.params && typeof data.params === 'object' ? data.params : {}),
        ...(leaveId ? { leaveId: String(leaveId) } : {}),
        ...(claimId ? { claimId: String(claimId) } : {}),
        ...(requestId ? { requestId: String(requestId) } : {}),
        ...(tab ? { tab: String(tab) } : {}),
        timestamp: Date.now(),
      },
    };
  }
  return null;
}

/**
 * Handle routing when user taps a push notification
 */
export function handleNotificationClick(data = {}) {
  try {
    const target = resolveNotificationTarget(data);
    if (target) {
      navigateGlobal(target.screen, target.params);
    } else {
      // Default: navigate to Dashboard and open the Notification Drawer
      navigateGlobal('Main', { openNotifications: true, timestamp: Date.now() });
    }
  } catch (err) {
    console.warn('[Notifications] handleNotificationClick error:', err?.message);
  }
}

/**
 * Setup listener for when user taps on a notification while app is in background or foreground
 */
export function setupNotificationResponseListener() {
  if (!Notifications || typeof Notifications.addNotificationResponseReceivedListener !== 'function') {
    return () => {};
  }

  try {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const content = response?.notification?.request?.content || {};
      const data = content.data || {};
      handleNotificationClick({ ...data, title: content.title || data?.title || '' });
    });

    return () => {
      if (subscription && typeof subscription.remove === 'function') {
        subscription.remove();
      }
    };
  } catch (err) {
    console.warn('[Notifications] setupNotificationResponseListener error:', err?.message);
    return () => {};
  }
}

/**
 * Handle notification tap when the app was launched from a completely closed (killed) state
 */
export async function checkInitialNotificationResponse() {
  if (!Notifications || typeof Notifications.getLastNotificationResponseAsync !== 'function') {
    return;
  }
  try {
    const lastResponse = await Notifications.getLastNotificationResponseAsync();
    if (lastResponse) {
      const content = lastResponse?.notification?.request?.content || {};
      const data = content.data || {};
      handleNotificationClick({ ...data, title: content.title || data?.title || '' });
    }
  } catch (err) {
    console.warn('[Notifications] checkInitialNotificationResponse error:', err?.message);
  }
}
