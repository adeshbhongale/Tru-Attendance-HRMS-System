import { io } from 'socket.io-client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { navigationRef } from './utils/navigation';
import { Alert } from 'react-native';

import Constants from 'expo-constants';
import { Platform } from 'react-native';

const PRODUCTION_SOCKET_URL = "https://tru-attendance-hrms-system.onrender.com";

const getSocketUrl = () => {
  const socketUrl = process.env.EXPO_PUBLIC_SOCKET_URL;
  if (socketUrl && socketUrl.trim()) {
    return socketUrl.trim().replace(/^["']|["']$/g, '').replace(/\/+$/, '');
  }

  const apiUrl = process.env.EXPO_PUBLIC_API_URL;
  if (apiUrl && apiUrl.trim()) {
    const clean = apiUrl.trim().replace(/^["']|["']$/g, '').replace(/\/+$/, '');
    return clean.replace(/\/api$/, '');
  }

  return PRODUCTION_SOCKET_URL;
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
  transports: ['websocket', 'polling'], // Allow WebSocket with Polling fallback for network resiliency
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

// Connection state listeners
socket.on('connect', async () => {
  console.log('[Socket] Connected successfully to:', SOCKET_URL);
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

socket.on('connect_error', (err) => {
  console.warn('[Socket] Connection error (will auto-retry):', err?.message);
});

socket.on('disconnect', (reason) => {
  console.log('[Socket] Disconnected:', reason);
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
