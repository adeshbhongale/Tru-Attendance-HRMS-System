import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";

const PRODUCTION_API_URL = "https://tru-attendance-hrms-system.onrender.com/api";

const getApiUrl = () => {
  const envUrl = process.env.EXPO_PUBLIC_API_URL;
  if (envUrl && envUrl.trim()) {
    const cleaned = envUrl.trim().replace(/^['"]|['"]$/g, "").replace(/\/+$/, "");
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
