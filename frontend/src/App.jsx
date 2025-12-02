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
import RequesterHistory from "./pages/RequesterHistory";
import Help from "./pages/Help";
import ForgotPassword from "./pages/ForgotPassword";
import ChangePassword from "./pages/ChangePassword";

export default function App() {
  const token = localStorage.getItem("token");
  const role = localStorage.getItem("role");

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
        {token && role === "admin" && (
          <Route path="/" element={<AdminDashboard />} />
        )}

        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Router>
  );
}
