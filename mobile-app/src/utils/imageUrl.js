const PRODUCTION_API_URL = "https://tru-attendance-hrms-system-production.up.railway.app/api";

const getApiUrl = () => {
  const envUrl = process.env.EXPO_PUBLIC_API_URL;
  if (envUrl && envUrl.trim()) {
    const cleaned = envUrl.trim().replace(/^['"]|['"]$/g, "").replace(/\/+$/, "");
    if ((cleaned.startsWith("http://") || cleaned.startsWith("https://")) && !cleaned.includes("192.168.1.100")) {
      return cleaned;
    }
  }
  return PRODUCTION_API_URL;
};

const BASE_SERVER_URL = getApiUrl().replace(/\/api\/?$/, "");

/**
 * Resolves a profile image URL to a full valid URI for React Native Image component.
 * Handles Cloudinary URLs, Base64 strings, Local device file:// paths, and relative server upload paths.
 */
export function getFullProfileImageUrl(path) {
  if (!path || path === "skipped" || typeof path !== "string") {
    return null;
  }

  const str = path.trim();
  if (!str) return null;

  if (
    str.startsWith("http://") ||
    str.startsWith("https://") ||
    str.startsWith("file://") ||
    str.startsWith("data:image/")
  ) {
    return str;
  }

  // Relative upload path on backend (e.g. "uploads/profiles/xyz.webp" or "/uploads/...")
  if (str.startsWith("uploads/") || str.startsWith("/uploads/")) {
    const cleanPath = str.replace(/^\/+/, "");
    return `${BASE_SERVER_URL}/${cleanPath}`;
  }

  // Raw base64 string
  if (str.length > 50 && !str.includes("/")) {
    return `data:image/jpeg;base64,${str}`;
  }

  return str;
}
