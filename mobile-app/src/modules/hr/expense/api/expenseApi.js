import api from "../../../../api/axios";

export const expenseApi = {
  getActivePolicy: async () => {
    try {
      const res = await api.get("/expense/policies/active");
      return res.data?.data || null;
    } catch (err) {
      return null;
    }
  },

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
      const res = await api.get("/expense/employees", {
        params: { search, limit: 500 },
      });
      return res.data?.data || [];
    } catch (err) {
      return [];
    }
  },

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

  previewClaim: async (payload) => {
    try {
      const res = await api.post("/expense/claims/preview", payload);
      return res.data;
    } catch (err) {
      return {
        success: false,
        message: err.response?.data?.message || err.message,
      };
    }
  },

  createClaim: async (payload) => {
    try {
      const res = await api.post("/expense/claims", payload);
      return res.data;
    } catch (err) {
      return {
        success: false,
        message: err.response?.data?.message || err.message,
      };
    }
  },

  updateClaim: async (id, payload) => {
    try {
      const res = await api.put(`/expense/claims/${id}`, payload);
      return res.data;
    } catch (err) {
      return {
        success: false,
        message: err.response?.data?.message || err.message,
      };
    }
  },

  deleteClaim: async (id) => {
    try {
      const res = await api.delete(`/expense/claims/${id}`);
      return res.data;
    } catch (err) {
      return {
        success: false,
        message: err.response?.data?.message || err.message,
      };
    }
  },

  submitClaim: async (id) => {
    try {
      const res = await api.post(`/expense/claims/${id}/submit`);
      return res.data;
    } catch (err) {
      return {
        success: false,
        message: err.response?.data?.message || err.message,
      };
    }
  },

  getMyClaims: async (status = "") => {
    try {
      const res = await api.get("/expense/claims", {
        params: status ? { status } : {},
      });
      return res.data?.data || [];
    } catch (err) {
      return [];
    }
  },

  getClaimById: async (id) => {
    try {
      const res = await api.get(`/expense/claims/${id}`);
      return res.data?.data || null;
    } catch (err) {
      return null;
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
