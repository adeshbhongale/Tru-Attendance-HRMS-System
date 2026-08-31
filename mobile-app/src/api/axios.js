import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";
import Constants from "expo-constants";
import { Platform } from "react-native";

const PRODUCTION_API_URL = "https://tru-attendance-hrms-system-production.up.railway.app/api";

const getLocalDevHost = () => {
  try {
    const hostUri = Constants?.expoConfig?.hostUri || Constants?.manifest2?.extra?.expoClient?.hostUri;
    if (hostUri) {
      return hostUri.split(":")[0];
    }
  } catch (_) {}
  return Platform.OS === "android" ? "10.0.2.2" : "localhost";
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
  } catch (_) {}
  return urlStr;
};

const getApiUrl = () => {

  const envUrl = process.env.EXPO_PUBLIC_API_URL;
  if (envUrl && envUrl.trim()) {
    let cleaned = envUrl.trim().replace(/^['"]|['"]$/g, "").replace(/\/+$/, "");

    // Resolve localhost/127.0.0.1 for mobile devices
    if (Platform.OS !== "web" && (cleaned.includes("localhost") || cleaned.includes("127.0.0.1"))) {
      const devHost = getLocalDevHost();
      cleaned = cleaned.replace("localhost", devHost).replace("127.0.0.1", devHost);
    }

    cleaned = ensurePortIfLocal(cleaned);

    if (cleaned.startsWith("http://") || cleaned.startsWith("https://")) {
      return cleaned;
    }
  }

  return PRODUCTION_API_URL;
};

const API_URL = getApiUrl();

const api = axios.create({
  baseURL: API_URL,
  timeout: 60000, // 60s timeout to allow Render cloud backend to spin up from sleep
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

// Auto-retry on network failure or Render cold-start connection drops
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error.config;
    if (!config) return Promise.reject(error);

    // If 401 Unauthorized, clear token and session
    if (error.response?.status === 401) {
      await AsyncStorage.clear();
      return Promise.reject(error);
    }

    // Check if error is network error or timeout (e.g. Render cold start or transient dropout)
    const isNetworkError = !error.response && (
      error.code === 'ECONNABORTED' ||
      error.code === 'ERR_NETWORK' ||
      (error.message && (
        error.message.includes('Network Error') ||
        error.message.includes('timeout') ||
        error.message.includes('Network request failed')
      ))
    );

    // Retry up to 2 times with a 1.5s delay
    config.__retryCount = config.__retryCount || 0;
    if (isNetworkError && config.__retryCount < 2) {
      config.__retryCount += 1;
      console.log(`[Axios] Auto-retrying request #${config.__retryCount} for ${config.url}...`);
      await new Promise((resolve) => setTimeout(resolve, 1500));
      return api(config);
    }

    return Promise.reject(error);
  }
);

export default api;
