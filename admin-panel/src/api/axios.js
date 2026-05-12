import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
});

export const IMAGE_BASE_URL = import.meta.env.VITE_IMAGE_URL || import.meta.env.VITE_API_URL?.replace('/api', '');

// ── Request Interceptor: attach Bearer token from localStorage ──────────────
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ── Response Interceptor: handle 401 (expired/invalid token) globally ────────
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token is expired or invalid — clear storage and redirect to login
      const currentPath = window.location.pathname;
      if (currentPath !== '/login') {
        console.warn('[API] 401 received — clearing session and redirecting to login.');
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;
