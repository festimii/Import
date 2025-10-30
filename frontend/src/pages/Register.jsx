import { useState } from "react";
import API from "../api";
import "../styles.css";

export default function Register() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState("");

  const handleRegister = async (e) => {
    e.preventDefault();
    if (password !== confirm) {
      setMessage("❌ Passwords do not match");
      return;
    }

    try {
      await API.post("/auth/register", { username, password });
      setMessage("✅ Registered successfully! Redirecting...");
      setTimeout(() => (window.location.href = "/"), 1500);
    } catch (err) {
      setMessage("❌ Registration failed (user may exist)");
    }
  };

  return (
    <div className="container">
      <form onSubmit={handleRegister} className="card login-card">
        <h2>Register</h2>
        <input
          type="text"
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder="Confirm Password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
        />
        <button type="submit">Register</button>
        {message && <p>{message}</p>}
        <p style={{ marginTop: "10px" }}>
          Already have an account?{" "}
          <a href="/" style={{ color: "#003366", textDecoration: "none" }}>
            Login here
          </a>
        </p>
      </form>
    </div>
  );
}
