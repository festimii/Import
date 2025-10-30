import { useState } from "react";
import API from "../api";
import "../styles.css";

export default function RequesterDashboard() {
  const [description, setDescription] = useState("");
  const [items, setItems] = useState("");
  const [message, setMessage] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await API.post("/imports", { description, items: items.split(",") });
      setMessage("✅ Import request created!");
      setDescription("");
      setItems("");
    } catch {
      setMessage("❌ Failed to create request");
    }
  };

  const logout = () => {
    localStorage.clear();
    window.location.reload();
  };

  return (
    <div className="dashboard">
      <header>
        <h1>Requester Dashboard</h1>
        <button onClick={logout}>Logout</button>
      </header>

      <form onSubmit={handleSubmit} className="card">
        <h3>Create Import Request</h3>
        <input
          type="text"
          placeholder="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required
        />
        <input
          type="text"
          placeholder="Items (comma separated)"
          value={items}
          onChange={(e) => setItems(e.target.value)}
          required
        />
        <button type="submit">Submit</button>
        {message && <p>{message}</p>}
      </form>
    </div>
  );
}
