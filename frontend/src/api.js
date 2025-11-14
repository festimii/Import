import axios from "axios";

const API = axios.create({
  baseURL: "http://192.168.100.35:5000/api",
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
