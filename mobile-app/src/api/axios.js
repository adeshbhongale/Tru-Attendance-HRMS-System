import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";

const rawApiUrl = process.env.EXPO_PUBLIC_API_URL || "http://localhost:5000/api";
const API_URL = rawApiUrl
  .trim()
  .replace(/^['"]|['"]$/g, "")
  .replace(/\/+$/, "");

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
