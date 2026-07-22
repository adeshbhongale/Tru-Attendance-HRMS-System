import { createSlice } from '@reduxjs/toolkit';

const ADMIN_ROLES = ['admin', 'super_admin', 'company_admin'];

const getUserFromStorage = () => {
  try {
    const user = localStorage.getItem('user');
    // Guard against 'undefined' or 'null' strings which cause JSON.parse to fail
    if (!user || user === 'undefined' || user === 'null') return null;
    const parsed = JSON.parse(user);
    if (parsed && !ADMIN_ROLES.includes(parsed.role)) {
      localStorage.removeItem('user');
      localStorage.removeItem('token');
      return null;
    }
    return parsed;
  } catch (_) {
    return null;
  }
};

const initialState = {
  user: getUserFromStorage(),
  token: localStorage.getItem('token') || null,
  isAuthenticated: !!localStorage.getItem('token') && ADMIN_ROLES.includes(getUserFromStorage()?.role),
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
    logout: (state) => {
      state.user = null;
      state.token = null;
      state.isAuthenticated = false;
      localStorage.removeItem('user');
      localStorage.removeItem('token');
    },
  },
});

export const { setCredentials, logout } = authSlice.actions;
export default authSlice.reducer;
