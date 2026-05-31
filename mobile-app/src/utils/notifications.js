import { Platform, Alert } from 'react-native';
import api from '../api/axios';

let Notifications = null;
let isExpoGo = false;

try {
  const Constants = require('expo-constants').default;
  isExpoGo = Constants?.appOwnership === 'expo';
} catch (e) {}

if (!isExpoGo && Platform.OS !== 'web') {
  try {
    Notifications = require('expo-notifications');
  } catch (err) {
    console.log('Could not require expo-notifications:', err.message);
  }
}

// Configure notification behavior
if (Notifications && typeof Notifications.setNotificationHandler === 'function') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
}

export async function registerPushToken() {
  try {
    if (Platform.OS === 'web') return;

    if (isExpoGo || !Notifications) {
      const simulatedToken = `expo_go_simulated_${Platform.OS}_${Math.random().toString(36).substring(7)}`;
      await api.post('/notifications/register-token', {
        fcmToken: simulatedToken,
        deviceType: Platform.OS.toUpperCase()
      });
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

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      const simulatedToken = `sandbox_token_${Platform.OS}_${Math.random().toString(36).substring(7)}`;
      await api.post('/notifications/register-token', {
        fcmToken: simulatedToken,
        deviceType: Platform.OS.toUpperCase()
      });
      return;
    }

    let token;
    try {
      // Prioritize raw native device push tokens (FCM/APNs) required by firebase-admin SDK
      const deviceTokenObj = await Notifications.getDevicePushTokenAsync().catch(() => null);
      if (deviceTokenObj && deviceTokenObj.data) {
        token = deviceTokenObj.data;
      } else {
        const expoTokenObj = await Notifications.getExpoPushTokenAsync().catch(() => null);
        token = expoTokenObj ? expoTokenObj.data : null;
      }

      if (!token) {
        token = `expo_simulated_${Platform.OS}_${Math.random().toString(36).substring(7)}`;
      }
    } catch (tokenErr) {
      token = `expo_simulated_${Platform.OS}_${Math.random().toString(36).substring(7)}`;
    }

    await api.post('/notifications/register-token', {
      fcmToken: token,
      deviceType: Platform.OS.toUpperCase()
    });
  } catch (err) {
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

export async function showLocalNotification(title, body, data = {}) {
  try {
    if (Notifications && typeof Notifications.scheduleNotificationAsync === 'function') {
      await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          data,
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
