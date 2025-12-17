import { useEffect } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import Login from "./pages/Login";
import Register from "./pages/Register";
import RequesterDashboard from "./pages/RequesterDashboard";
import ConfirmerDashboard from "./pages/ConfirmerDashboard";
import AdminDashboard from "./pages/AdminDashboard";
import PlanogramDashboard from "./pages/PlanogramDashboard";
import PlanogramEditor from "./pages/PlanogramEditor";
import RequesterHistory from "./pages/RequesterHistory";
import Help from "./pages/Help";
import ForgotPassword from "./pages/ForgotPassword";
import ChangePassword from "./pages/ChangePassword";

const decodeTokenPayload = (token) => {
  if (!token || typeof token !== "string") return null;
  const payloadSegment = token.split(".")[1];
  if (!payloadSegment) return null;
  try {
    const normalized = payloadSegment.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(
      normalized.length + ((4 - (normalized.length % 4)) % 4),
      "="
    );
    return JSON.parse(window.atob(padded));
  } catch {
    return null;
  }
};

const getTokenExpiryMs = (token) => {
  const payload = decodeTokenPayload(token);
  const exp = Number(payload?.exp);
  if (!Number.isFinite(exp)) return null;
  return exp * 1000;
};

export default function App() {
  const token = localStorage.getItem("token");
  const role = localStorage.getItem("role");

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const storedToken = localStorage.getItem("token");
    if (!storedToken) return undefined;

    const expiryMs = getTokenExpiryMs(storedToken);
    if (!expiryMs) return undefined;

    const timeoutMs = expiryMs - Date.now() - 1000;
    const clearAuth = () => {
      localStorage.removeItem("token");
      localStorage.removeItem("role");
    };

    if (timeoutMs <= 0) {
      clearAuth();
      window.location.replace("/");
      return undefined;
    }

    const handle = window.setTimeout(() => {
      clearAuth();
      window.location.replace("/");
    }, timeoutMs);

    return () => window.clearTimeout(handle);
  }, []);

  return (
    <Router>
      <Routes>
        <Route path="/help" element={<Help />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        {!token && (
          <>
            <Route path="/" element={<Login />} />
            <Route path="/register" element={<Register />} />
          </>
        )}

        {token && (
          <Route path="/change-password" element={<ChangePassword />} />
        )}
        {token && role === "requester" && (
          <>
            <Route path="/" element={<RequesterDashboard />} />
            <Route path="/history" element={<RequesterHistory />} />
          </>
        )}
        {token && role === "confirmer" && (
          <Route path="/" element={<ConfirmerDashboard />} />
        )}
        {token && role === "planogram" && (
          <>
            <Route path="/" element={<PlanogramDashboard />} />
            <Route path="/planogram" element={<PlanogramDashboard />} />
            <Route path="/planogram/editor" element={<PlanogramEditor />} />
          </>
        )}
        {token && role === "admin" && (
          <Route path="/" element={<AdminDashboard />} />
        )}

        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Router>
  );
}
