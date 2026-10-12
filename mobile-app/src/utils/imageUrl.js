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
 * Resolves profile image URL.
 */
export function getFullProfileImageUrl(path) {
  if (!path || path === "skipped" || typeof path !== "string") return null;
  const str = path.trim();
  if (!str) return null;
  if (str.startsWith("http://") || str.startsWith("https://") || str.startsWith("file://") || str.startsWith("data:image/")) {
    return str;
  }
  if (str.startsWith("uploads/") || str.startsWith("/uploads/")) {
    return `${BASE_SERVER_URL}/${str.replace(/^\/+/, "")}`;
  }
  if (str.length > 50 && !str.includes("/")) {
    return `data:image/jpeg;base64,${str}`;
  }
  return str;
}

/**
 * Resolves bill, receipt, or proof document URL for React Native Image.
 * Cloudinary URLs are guaranteed HTTPS for Android security.
 */
export function resolveProofImageUrl(pathOrObj) {
  if (!pathOrObj) return null;
  const url = typeof pathOrObj === "string" ? pathOrObj : (pathOrObj.url || pathOrObj.secure_url || pathOrObj.fileUrl || pathOrObj.uri);
  if (!url || typeof url !== "string") return null;
  const trimmed = url.trim();
  if (!trimmed || trimmed === "null" || trimmed === "undefined") return null;
  // Upgrade insecure Cloudinary HTTP to HTTPS for Android cleartext traffic policy
  return trimmed.replace(/^http:\/\/res\.cloudinary\.com\//, "https://res.cloudinary.com/");
}
