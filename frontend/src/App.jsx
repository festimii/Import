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

export default function App() {
  const token = localStorage.getItem("token");
  const role = localStorage.getItem("role");

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
