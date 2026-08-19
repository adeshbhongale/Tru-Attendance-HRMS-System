import axios from 'axios';

const rawApiUrl = import.meta.env.VITE_API_URL || '';
const cleanApiUrl = rawApiUrl.trim().replace(/^["']|["']$/g, '').replace(/\/+$/, '');

const api = axios.create({
  baseURL: cleanApiUrl || 'http://localhost:5000/api',
});

const rawImageUrl = import.meta.env.VITE_IMAGE_URL || '';
const cleanImageUrl = rawImageUrl.trim().replace(/^["']|["']$/g, '').replace(/\/+$/, '');
export const IMAGE_BASE_URL = cleanImageUrl || (cleanApiUrl ? cleanApiUrl.replace('/api', '') : 'http://localhost:5000');

// ── Request Interceptor: attach Bearer token and selected tenant company header ──
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    const selectedCompanyId = localStorage.getItem('selectedCompanyId');
    if (selectedCompanyId) {
      config.headers['x-company-id'] = selectedCompanyId;
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
        localStorage.removeItem('selectedCompanyId');
        localStorage.removeItem('selectedCompany');
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;
