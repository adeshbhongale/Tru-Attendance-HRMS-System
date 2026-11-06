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

    if (!config.headers['x-company-id']) {
      let effectiveCompanyId = localStorage.getItem('selectedCompanyId') || '';
      try {
        const rawUser = localStorage.getItem('user');
        if (rawUser && rawUser !== 'undefined' && rawUser !== 'null') {
          const parsedUser = JSON.parse(rawUser);
          const role = String(parsedUser?.role || '').trim().toLowerCase().replace(/[-\s]/g, '_');
          const roleCode = String(parsedUser?.roleCode || '').trim().toUpperCase().replace(/[-\s]/g, '_');
          const isSuper =
            parsedUser?.scope === 'GLOBAL' ||
            role === 'superadmin' ||
            role === 'super_admin' ||
            roleCode === 'TCSA1';
          if (!isSuper) {
            const userComp =
              parsedUser?.companyId?._id ||
              parsedUser?.companyId ||
              parsedUser?.company?._id ||
              parsedUser?.company ||
              '';
            if (userComp) {
              effectiveCompanyId = String(userComp);
            }
          }
        }
      } catch (_) {}

      if (effectiveCompanyId) {
        config.headers['x-company-id'] = effectiveCompanyId;
      }
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
