import api from "../../../../api/axios";
import { Platform } from "react-native";

/**
 * Expense module API. Mutating calls return `{ success, data, message, errors, status, network }`
 * so screens can show field-level server validation (`errors[]`) and detect network failures.
 */

const toResult = (err) => ({
  success: false,
  status: err.response?.status || 0,
  network: !err.response, // no HTTP response => connectivity / timeout
  message:
    err.response?.data?.message ||
    (!err.response ? "Network problem. Please check your internet connection and retry." : err.message),
  errors: err.response?.data?.errors || [],
});

const call = async (fn) => {
  try {
    const res = await fn();
    return { success: true, status: res.status, ...res.data };
  } catch (err) {
    return toResult(err);
  }
};

/** Unique per form submission; reused on retry so the server never creates two claims. */
export const newRequestId = () =>
  `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 6)}`;

export const expenseApi = {
  getActivePolicy: async () => {
    try {
      const res = await api.get("/expense/policies/active");
      return res.data?.data || null;
    } catch (err) {
      return null;
    }
  },

  /** Types + limits for the NORMAL or LOGGING form. */
  getClaimConfig: (mode = "NORMAL") => call(() => api.get("/expense/claim-config", { params: { mode } })),

  getTypes: async () => {
    try {
      const res = await api.get("/expense/types");
      return res.data?.data || [];
    } catch (err) {
      return [];
    }
  },

  getEmployees: async (search = "") => {
    try {
      const res = await api.get("/expense/employees", { params: { search, limit: 500 } });
      return res.data?.data || [];
    } catch (err) {
      return [];
    }
  },

  /** Existing customer master (searchable). Falls back to free text in the UI. */
  searchCustomers: async (search = "") => {
    try {
      const res = await api.get("/customers", { params: { search, limit: 50 } });
      const list = res.data?.data?.data || res.data?.data || res.data?.customers || [];
      return Array.isArray(list) ? list : [];
    } catch (err) {
      return [];
    }
  },

  /** Destination city master (expense city classification). */
  getCities: async () => {
    try {
      const res = await api.get("/expense/cities");
      return res.data?.data || [];
    } catch (err) {
      return [];
    }
  },

  getTravelModes: async () => {
    try {
      const res = await api.get("/expense/travel-modes");
      return res.data?.data || [];
    } catch (err) {
      return [];
    }
  },

  /**
   * Upload of one receipt / proof (camera photo or gallery image).
   * Works reliably on both Web (Blob / base64) and Native (FormData).
   * onProgress(0..100) drives the per-file progress bar.
   */
  uploadFile: async ({ uri, name, type, file, base64 }, onProgress, purpose = "receipt") => {
    try {
      const fileName = name || `proof_${Date.now()}.jpg`;
      const mimeType = type || "image/jpeg";

      // Method 1: Direct JSON base64 upload for images (reliable on all platforms, zero multipart boundary or network errors)
      const isImg = !mimeType || mimeType.startsWith("image/");
      let b64 = isImg ? (base64 || (uri && uri.startsWith("data:image") ? uri : null)) : null;
      if (isImg && !b64 && uri && Platform.OS !== "web") {
        try {
          const FileSystem = require("expo-file-system");
          if (FileSystem && typeof FileSystem.readAsStringAsync === "function") {
            b64 = await FileSystem.readAsStringAsync(uri, { encoding: "base64" });
          }
        } catch (_) {}
      }

      if (b64) {
        const payloadImage = b64.startsWith("data:") ? b64 : `data:${mimeType};base64,${b64}`;
        const b64Res = await call(() =>
          api.post("/expense/uploads/base64", {
            image: payloadImage,
            name: fileName,
          })
        );
        if (b64Res.success && b64Res.data?.url) {
          if (onProgress) onProgress(100);
          return b64Res;
        }
      }

      // Method 2: Fallback to Multipart FormData
      const form = new FormData();
      if (Platform.OS === "web" || (typeof window !== "undefined" && typeof document !== "undefined")) {
        let blob = file;
        if (!blob && uri && (uri.startsWith("blob:") || uri.startsWith("data:"))) {
          try {
            const resp = await fetch(uri);
            blob = await resp.blob();
          } catch (_) {}
        }
        if (blob instanceof Blob) {
          form.append("file", blob, fileName);
        }
      } else {
        form.append("file", {
          uri: Platform.OS === "android" ? uri : uri.replace("file://", ""),
          name: fileName,
          type: mimeType,
        });
      }
      form.append("purpose", purpose);

      return await call(() =>
        api.post("/expense/uploads", form, {
          headers: { "Content-Type": "multipart/form-data" },
          timeout: 120000,
          onUploadProgress: (e) => {
            if (onProgress && e.total) onProgress(Math.min(99, Math.round((e.loaded / e.total) * 100)));
          },
        })
      );
    } catch (err) {
      return toResult(err);
    }
  },

  uploadProof: async (base64Image, name = "proof") => {
    try {
      const res = await api.post("/expense/uploads/base64", { image: base64Image, name });
      return res.data?.data || null;
    } catch (err) {
      return null;
    }
  },

  resolveCity: async (city) => {
    try {
      const res = await api.get(`/expense/cities/${encodeURIComponent(city)}`);
      return res.data?.data || { city, cityClass: "C" };
    } catch (err) {
      return { city, cityClass: "C" };
    }
  },

  /** Server-side validation + calculation without saving (review step). */
  previewClaim: (payload) => call(() => api.post("/expense/claims/preview", payload)),

  /** payload.submit = true creates + submits in one idempotent request. */
  createClaim: (payload) => call(() => api.post("/expense/claims", payload)),

  updateClaim: (id, payload) => call(() => api.put(`/expense/claims/${id}`, payload)),

  deleteClaim: (id) => call(() => api.delete(`/expense/claims/${id}`)),

  submitClaim: (id) => call(() => api.post(`/expense/claims/${id}/submit`)),

  /** After a timeout: did the claim with this request id reach the server? */
  findByRequestId: (requestId) => call(() => api.get(`/expense/claims/by-request/${encodeURIComponent(requestId)}`)),

  /** status: ALL | PENDING | SUBMITTED | APPROVED | REJECTED | PAID | LOCKED */
  getMyClaims: async (status = "ALL") => {
    const res = await call(() => api.get("/expense/claims/my", { params: { status } }));
    return res;
  },

  getClaimById: async (id) => {
    try {
      const res = await api.get(`/expense/claims/${id}`);
      return res.data?.data || null;
    } catch (err) {
      return null;
    }
  },

  getClaimAudit: async (claimId) => {
    try {
      const res = await api.get("/expense/audit", { params: { claimId, limit: 100 } });
      return res.data?.data || [];
    } catch (err) {
      return [];
    }
  },

  getEntitlements: async () => {
    try {
      const res = await api.get("/expense/entitlements");
      return res.data?.data || [];
    } catch (err) {
      return [];
    }
  },
};

export default expenseApi;
