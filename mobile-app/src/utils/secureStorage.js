import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

const TOKEN_KEY = "auth_jwt_token_v1";
const LEGACY_TOKEN_KEY = "token";

let SecureStore = null;
if (Platform.OS !== "web") {
  try {
    // Dynamic require so existing builds without native SecureStore binary still work seamlessly
    SecureStore = require("expo-secure-store");
  } catch (_) {
    SecureStore = null;
  }
}

const canUseSecureStore = () =>
  Boolean(
    SecureStore &&
      typeof SecureStore.getItemAsync === "function" &&
      typeof SecureStore.setItemAsync === "function" &&
      typeof SecureStore.deleteItemAsync === "function"
  );

export async function setSecureToken(token) {
  if (!token) {
    return removeSecureToken();
  }
  const value = String(token);
  if (canUseSecureStore()) {
    try {
      await SecureStore.setItemAsync(TOKEN_KEY, value);
      await AsyncStorage.removeItem(LEGACY_TOKEN_KEY);
      return;
    } catch (err) {
      console.warn("[secureStorage] SecureStore write failed:", err?.message);
      await AsyncStorage.setItem(LEGACY_TOKEN_KEY, value);
      return;
    }
  }
  if (Platform.OS === "web") {
    await AsyncStorage.setItem(LEGACY_TOKEN_KEY, value);
  }
}

export async function getSecureToken() {
  if (canUseSecureStore()) {
    try {
      const secureVal = await SecureStore.getItemAsync(TOKEN_KEY);
      if (secureVal) return secureVal;
    } catch (_) {}
  }
  const legacyVal = await AsyncStorage.getItem(LEGACY_TOKEN_KEY);
  if (legacyVal && canUseSecureStore()) {
    try {
      await SecureStore.setItemAsync(TOKEN_KEY, legacyVal);
      await AsyncStorage.removeItem(LEGACY_TOKEN_KEY);
    } catch (_) {}
  }
  return legacyVal;
}

export async function removeSecureToken() {
  if (canUseSecureStore()) {
    try {
      await SecureStore.deleteItemAsync(TOKEN_KEY);
    } catch (_) {}
  }
  await AsyncStorage.removeItem(LEGACY_TOKEN_KEY);
}

