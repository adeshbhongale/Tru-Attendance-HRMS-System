import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert } from 'react-native';
import { io } from 'socket.io-client';
import { navigationRef } from './utils/navigation';


const PRODUCTION_SOCKET_URL = "https://tru-attendance-hrms-system-production.up.railway.app";

const getSocketUrl = () => {
  const socketUrl = process.env.EXPO_PUBLIC_SOCKET_URL;
  if (socketUrl && socketUrl.trim()) {
    const clean = socketUrl.trim().replace(/^["']|["']$/g, '').replace(/\/+$/, '');
    if ((clean.startsWith('http://') || clean.startsWith('https://')) && !clean.includes('192.168.1.100')) {
      return clean;
    }
  }

  const apiUrl = process.env.EXPO_PUBLIC_API_URL;
  if (apiUrl && apiUrl.trim()) {
    const clean = apiUrl.trim().replace(/^["']|["']$/g, '').replace(/\/+$/, '');
    const base = clean.replace(/\/api$/, '');
    if ((base.startsWith('http://') || base.startsWith('https://')) && !base.includes('192.168.1.100')) {
      return base;
    }
  }

  return PRODUCTION_SOCKET_URL;
};

const SOCKET_URL = getSocketUrl();

const isNode = typeof process !== 'undefined' && process.versions && process.versions.node;

/**
 * Create socket with JWT authentication
 * Token is sent in socket.handshake.auth for server-side verification.
 */
let authToken = null;

const socket = io(SOCKET_URL, {
  autoConnect: !isNode,
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  timeout: 20000,
  transports: ['polling', 'websocket'], // Start with HTTP polling handshake then seamlessly upgrade to WebSocket (supports both localhost & Railway)
  upgrade: true,
  forceNew: false,
  withCredentials: true,
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
          [{
            text: 'OK', onPress: () => {
              if (navigationRef.isReady()) {
                navigationRef.reset({ index: 0, routes: [{ name: 'Login' }] });
              }
            }
          }]
        );
      }
    }
  } catch (err) {
  }
});

export default socket;
