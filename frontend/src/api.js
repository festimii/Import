import axios from "axios";

const normalizeUrl = (value) => {
  if (!value || typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const withoutTrailingSlash = trimmed.replace(/\/+$/, "");
  if (withoutTrailingSlash.endsWith("/api")) {
    return withoutTrailingSlash;
  }
  return `${withoutTrailingSlash}/api`;
};

const resolveBaseURL = () => {
  const env =
    (typeof import.meta !== "undefined" && import.meta.env) || undefined;

  const envCandidates = [
    env?.VITE_API_URL,
    env?.VITE_API_BASE_URL,
    env?.VITE_BACKEND_URL,
  ]
    .filter(Boolean)
    .map((v) => normalizeUrl(v))
    .filter(Boolean);

  if (envCandidates.length > 0) {
    return envCandidates[0];
  }

  // Default to the LAN backend if nothing is configured.
  if (typeof window === "undefined") {
    return "http://localhost:5000/api";
  }

  const hostname = window.location.hostname || "localhost";
  const protocol = window.location.protocol || "http:";
  const port = "5000";

  return `${protocol}//${hostname}:${port}/api`;
};

const API = axios.create({
  baseURL: resolveBaseURL(),
});

API.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

API.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    if (status === 401 || status === 403) {
      const hadToken = Boolean(localStorage.getItem("token"));
      localStorage.removeItem("token");
      localStorage.removeItem("role");
      if (typeof window !== "undefined" && hadToken) {
        window.location.replace("/");
      }
    }

    return Promise.reject(error);
  }
);

export default API;
