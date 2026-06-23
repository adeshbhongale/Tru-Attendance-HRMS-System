import { io } from 'socket.io-client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { navigationRef } from './utils/navigation';
import { Alert } from 'react-native';

const rawApiUrl = process.env.EXPO_PUBLIC_API_URL || '';
const cleanApiUrl = rawApiUrl.trim().replace(/^["']|["']$/g, '').replace(/\/+$/, '');
const SOCKET_URL = cleanApiUrl.replace('/api', '');

const isNode = typeof process !== 'undefined' && process.versions && process.versions.node;
const socket = io(SOCKET_URL, {
  autoConnect: !isNode,
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  transports: ['websocket'], // Force WebSocket for speed & connection stability
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
