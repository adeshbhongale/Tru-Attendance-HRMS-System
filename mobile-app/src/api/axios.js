import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";

import Constants from "expo-constants";
import { Platform } from "react-native";

const getApiUrl = () => {
  // 1. If running on Web platform, connect to the browser's hostname (e.g. localhost:5000)
  if (Platform.OS === 'web') {
    const envUrl = process.env.EXPO_PUBLIC_API_URL;
    if (envUrl && envUrl.trim() && !envUrl.includes('10.192.19.106')) {
      return envUrl.trim().replace(/^['"]|['"]$/g, "").replace(/\/+$/, "");
    }
    const hostname = typeof window !== 'undefined' && window.location.hostname ? window.location.hostname : 'localhost';
    return `http://${hostname}:5000/api`;
  }

  // 2. Extract host IP dynamically from Expo Constants (Metro dev server for mobile apps)
  const hostUri = Constants.expoConfig?.hostUri || Constants.manifest?.debuggerHost;
  if (hostUri) {
    const ip = hostUri.split(":")[0];
    if (ip) return `http://${ip}:5000/api`;
  }

  // 3. Environment variable fallback
  const envUrl = process.env.EXPO_PUBLIC_API_URL;
  if (envUrl && envUrl.trim()) {
    return envUrl.trim().replace(/^['"]|['"]$/g, "").replace(/\/+$/, "");
  }

  // 4. Fallbacks for Android Emulator / iOS Simulator
  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:5000/api';
  }

  return "http://localhost:5000/api";
};

const API_URL = getApiUrl();

const api = axios.create({
  baseURL: API_URL,
  timeout: 30000,
});

// Attach token to every request automatically
api.interceptors.request.use(
  async (config) => {
    const token = await AsyncStorage.getItem("token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Handle response errors globally
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      await AsyncStorage.clear();
    }
    return Promise.reject(error);
  }
);

export default api;
