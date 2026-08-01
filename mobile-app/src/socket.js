import { io } from 'socket.io-client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { navigationRef } from './utils/navigation';
import { Alert } from 'react-native';

import Constants from 'expo-constants';
import { Platform } from 'react-native';

const getSocketUrl = () => {
  const envUrl = process.env.EXPO_PUBLIC_API_URL;
  if (envUrl && envUrl.trim()) {
    const clean = envUrl.trim().replace(/^["']|["']$/g, '').replace(/\/+$/, '');
    return clean.replace('/api', '');
  }

  const hostUri = Constants.expoConfig?.hostUri || Constants.manifest?.debuggerHost;
  if (hostUri) {
    const ip = hostUri.split(':')[0];
    if (ip) return `http://${ip}:5000`;
  }

  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:5000';
  }

  return 'http://localhost:5000';
};

const SOCKET_URL = getSocketUrl();

const isNode = typeof process !== 'undefined' && process.versions && process.versions.node;

/**
 * Create socket with JWT authentication (#11 fix)
 * Token is sent in socket.handshake.auth for server-side verification.
 * This prevents fake/wrong userId attacks.
 */
let authToken = null;

const socket = io(SOCKET_URL, {
  autoConnect: !isNode,
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  transports: ['websocket'], // Force WebSocket for speed & connection stability
  auth: (cb) => {
    // Dynamic auth: fetch token from AsyncStorage on each connection attempt
    AsyncStorage.getItem('token')
      .then(token => {
        authToken = token;
        cb({ token: token || '' });
      })
      .catch(() => cb({ token: '' }));
  }
});

// Sync offline queue and rejoin room upon connection/reconnection
socket.on('connect', async () => {
  try {
    const userId = await AsyncStorage.getItem('userId');
    if (userId) {
      socket.emit('join', userId);
    }
    const { syncQueue } = require('./utils/offlineQueue');
    await syncQueue();
  } catch (err) {
    console.error('[Socket] Connection sync failed:', err);
  }
});

// Global Force Logout Listener
socket.on('forceLogout', async (deletedUserId) => {
  try {
    const userStr = await AsyncStorage.getItem('user');
    if (userStr) {
      const user = JSON.parse(userStr);
      if (user._id === deletedUserId) {
        await AsyncStorage.clear();
        Alert.alert(
          'Account Removed',
          'Your account has been deleted by administrator. You will be logged out.',
          [{ text: 'OK', onPress: () => {
            if (navigationRef.isReady()) {
              navigationRef.reset({ index: 0, routes: [{ name: 'Login' }] });
            }
          }}]
        );
      }
    }
  } catch (err) {
  }
});

export default socket;
