import { createSlice } from '@reduxjs/toolkit';

const ADMIN_ROLES = ['admin', 'super_admin', 'company_admin'];

const getUserFromStorage = () => {
  try {
    const user = localStorage.getItem('user');
    // Guard against 'undefined' or 'null' strings which cause JSON.parse to fail
    if (!user || user === 'undefined' || user === 'null') return null;
    const parsed = JSON.parse(user);
    if (!parsed) return null;

    const roleLower = (parsed.role || parsed.roleCode || '').toLowerCase();
    const isGlobal = parsed.scope === 'GLOBAL';
    const isAllowedRole = isGlobal || ADMIN_ROLES.includes(roleLower) || roleLower.includes('admin');

    if (!isAllowedRole) {
      localStorage.removeItem('user');
      localStorage.removeItem('token');
      return null;
    }
    return parsed;
  } catch (_) {
    return null;
  }
};

const initialUser = getUserFromStorage();
const initialToken = localStorage.getItem('token') || null;

const initialState = {
  user: initialUser,
  token: initialToken,
  isAuthenticated: !!initialToken && !!initialUser,
  unreadCount: 0,
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setCredentials: (state, action) => {
      const payload = action.payload;
      if (!payload) return;

      // Ensure we don't spread null/undefined
      const currentUser = state.user || {};

      if (payload.user) {
        // Payload structure: { user: {...}, token: "..." }
        state.user = { ...currentUser, ...payload.user };
        if (payload.token) {
          state.token = payload.token;
          state.isAuthenticated = true;
        }
      } else {
        // Payload structure: just the user object {...}
        state.user = { ...currentUser, ...payload };
      }

      // Final safety check: if we have a token, we are authenticated
      if (state.token) {
        state.isAuthenticated = true;
      }

      // Persist to storage
      if (state.user) {
        localStorage.setItem('user', JSON.stringify(state.user));
      }
      if (state.token) {
        localStorage.setItem('token', state.token);
      }
    },
    setUnreadCount: (state, action) => {
      state.unreadCount = typeof action.payload === 'number' ? action.payload : 0;
    },
    incrementUnreadCount: (state, action) => {
      state.unreadCount = (state.unreadCount || 0) + (typeof action.payload === 'number' ? action.payload : 1);
    },
    logout: (state) => {
      state.user = null;
      state.token = null;
      state.isAuthenticated = false;
      state.unreadCount = 0;
      localStorage.removeItem('user');
      localStorage.removeItem('token');
    },
  },
});

export const { setCredentials, logout, setUnreadCount, incrementUnreadCount } = authSlice.actions;
export default authSlice.reducer;
