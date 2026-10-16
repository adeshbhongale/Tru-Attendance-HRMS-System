import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Alert, Platform } from 'react-native';
import { io } from 'socket.io-client';
import { navigationRef } from './utils/navigation';

const PRODUCTION_SOCKET_URL = "https://tru-attendance-hrms-system-production.up.railway.app";

const isLocalOrLanHost = (hostPart) => {
  if (!hostPart) return false;
  if (
    hostPart.includes('railway.app') ||
    hostPart.includes('vercel.app') ||
    hostPart.includes('render.com')
  ) {
    return false;
  }
  return (
    hostPart.includes('localhost') ||
    hostPart.includes('127.0.0.1') ||
    hostPart.includes('10.0.2.2') ||
    /^(https?:\/\/)?(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.)/.test(hostPart)
  );
};

const getLocalDevHost = () => {
  try {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.hostname) {
      return window.location.hostname;
    }
    const hostUri = Constants?.expoConfig?.hostUri || Constants?.manifest2?.extra?.expoClient?.hostUri;
    if (hostUri) {
      return hostUri.split(':')[0];
    }
  } catch (_) { }
  return Platform.OS === 'android' ? '10.0.2.2' : 'localhost';
};

const ensurePortIfLocal = (urlStr) => {
  if (!urlStr) return urlStr;
  try {
    const match = urlStr.match(/^(https?:\/\/[^/:]+)(\/.*)?$/);
    if (match) {
      const hostPart = match[1];
      const rest = match[2] || '';
      if (!hostPart.includes('railway.app') && !hostPart.includes('vercel.app') && !hostPart.includes('render.com') && !hostPart.includes('herokuapp.com')) {
        if (/^(https?:\/\/)(192\.168\.|10\.|172\.|localhost|127\.0\.0\.1)/.test(hostPart)) {
          return `${hostPart}:5000${rest}`;
        }
      }
    }
  } catch (_) { }
  return urlStr;
};

const getSocketUrl = () => {
  const socketUrl = process.env.EXPO_PUBLIC_SOCKET_URL || process.env.EXPO_PUBLIC_API_URL;
  if (socketUrl && socketUrl.trim()) {
    let clean = socketUrl.trim().replace(/^["']|["']$/g, '').replace(/\/+$/, '');
    clean = clean.replace(/\/api$/, '');

    // STRICT SAFEGUARD: Never connect to deprecated Render backend under any circumstance
    if (clean.includes('render.com') || clean.includes('onrender.com')) {
      return PRODUCTION_SOCKET_URL;
    }

    // SAFEGUARD: In release/preview/production builds (!__DEV__), localhost is unreachable on physical devices
    if (!__DEV__ && (clean.includes('localhost') || clean.includes('127.0.0.1') || clean.includes('10.0.2.2'))) {
      console.warn('[Socket] Localhost detected in release/preview build. Falling back to Railway production socket.');
      return PRODUCTION_SOCKET_URL;
    }

    // Auto-resolve local development hosts dynamically (handles IP changes & web localhost)
    if (isLocalOrLanHost(clean)) {
      const devHost = getLocalDevHost();
      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.hostname) {
        clean = clean.replace(/^(https?:\/\/)([^/:]+)/, `$1${window.location.hostname}`);
      } else if (devHost) {
        clean = clean.replace(/^(https?:\/\/)([^/:]+)/, `$1${devHost}`);
      }
    }

    clean = ensurePortIfLocal(clean);

    if (clean.startsWith('http://') || clean.startsWith('https://')) {
      return clean;
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
  timeout: 10000,
  transports: ['websocket', 'polling'], // Prefer WebSocket first, fall back to HTTP polling
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
