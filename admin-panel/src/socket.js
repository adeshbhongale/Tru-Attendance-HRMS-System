import { io } from 'socket.io-client';

const rawApiUrl = import.meta.env.VITE_API_URL || '';
const cleanApiUrl = rawApiUrl.trim().replace(/^["']|["']$/g, '').replace(/\/+$/, '');
const SOCKET_URL = cleanApiUrl ? cleanApiUrl.replace('/api', '') : 'http://localhost:5000';

const getToken = () => localStorage.getItem('token') || localStorage.getItem('adminToken') || '';

const socket = io(SOCKET_URL, {
  autoConnect: true,
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 1000,
  transports: ['websocket', 'polling'],
  auth: (cb) => {
    cb({ token: getToken() });
  }
});

socket.on('connect_error', (err) => {
  if (err?.message === 'Authentication failed' || err?.message === 'Authentication required') {
    socket.disconnect();
  }
});

export default socket;
