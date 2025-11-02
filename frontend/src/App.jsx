import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import { useEffect } from "react";

import Login from "./pages/Login";
import Register from "./pages/Register";
import RequesterDashboard from "./pages/RequesterDashboard";
import ConfirmerDashboard from "./pages/ConfirmerDashboard";
import AdminDashboard from "./pages/AdminDashboard";
import {
  registerServiceWorker,
  askNotificationPermission,
  subscribeUserToPush,
} from "./notifications"; // from step 3 earlier

export default function App() {
  const token = localStorage.getItem("token");
  const role = localStorage.getItem("role");

  // ---------- INITIALIZE PUSH NOTIFICATIONS ----------
  useEffect(() => {
    (async () => {
      try {
        const registration = await registerServiceWorker();
        await askNotificationPermission();
        await subscribeUserToPush(registration);
      } catch (err) {
        console.warn("Push setup failed:", err.message);
      }
    })();
  }, []);
  // ----------------------------------------------------

  return (
    <Router>
      <Routes>
        {!token && (
          <>
            <Route path="/" element={<Login />} />
            <Route path="/register" element={<Register />} />
          </>
        )}

        {token && role === "requester" && (
          <Route path="/" element={<RequesterDashboard />} />
        )}
        {token && role === "confirmer" && (
          <Route path="/" element={<ConfirmerDashboard />} />
        )}
        {token && role === "admin" && (
          <Route path="/" element={<AdminDashboard />} />
        )}

        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Router>
  );
}
