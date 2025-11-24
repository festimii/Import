import axios from "axios";

const resolveBaseURL = () => {
  let envUrl = null;
  if (
    typeof import.meta !== "undefined" &&
    import.meta.env &&
    typeof import.meta.env.VITE_API_URL === "string"
  ) {
    envUrl = import.meta.env.VITE_API_URL.trim();
  }
  if (envUrl) {
    return envUrl;
  }

  if (typeof window === "undefined") {
    return "http://192.168.100.35:5000/api";
  }

  const hostname = window.location.hostname || "localhost";
  const protocol = window.location.protocol || "http:";
  const isLocal = hostname === "localhost" || hostname === "127.0.0.1";
  const targetHost = isLocal ? "localhost" : hostname;
  const port = "5000";

  return `${protocol}//${targetHost}:${port}/api`;
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
      localStorage.removeItem("token");
      localStorage.removeItem("role");
      if (typeof window !== "undefined") {
        const { pathname } = window.location;
        if (pathname !== "/" && pathname !== "/register") {
          window.location.replace("/");
        }
      }
    }

    return Promise.reject(error);
  }
);

export default API;
