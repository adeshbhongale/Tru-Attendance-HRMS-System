import { io } from 'socket.io-client';

const rawApiUrl = import.meta.env.VITE_API_URL || '';
const cleanApiUrl = rawApiUrl.trim().replace(/^["']|["']$/g, '').replace(/\/+$/, '');
const SOCKET_URL = cleanApiUrl ? cleanApiUrl.replace('/api', '') : 'http://localhost:5000';

const socket = io(SOCKET_URL, {
  autoConnect: true,
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 1000,
  transports: ['polling', 'websocket'], // Match server-allowed transports
  auth: (cb) => {
    const token = localStorage.getItem('adminToken') || localStorage.getItem('token') || '';
    cb({ token });
  }
});

export default socket;
