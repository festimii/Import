import { useEffect, useState } from "react";
import API from "../api";
import RequestCard from "../components/RequestCard";
import "../styles.css";

export default function ConfirmerDashboard() {
  const [requests, setRequests] = useState([]);

  const loadRequests = async () => {
    const res = await API.get("/imports");
    setRequests(res.data);
  };

  useEffect(() => {
    loadRequests();
  }, []);

  const handleDecision = async (id, status) => {
    await API.patch(`/imports/${id}`, { status });
    loadRequests();
  };

  const logout = () => {
    localStorage.clear();
    window.location.reload();
  };

  return (
    <div className="dashboard">
      <header>
        <h1>Confirmer Dashboard</h1>
        <button onClick={logout}>Logout</button>
      </header>

      <div className="list">
        {requests.length === 0 ? (
          <p>No pending requests</p>
        ) : (
          requests.map((r) => (
            <RequestCard key={r.ID} req={r} onDecision={handleDecision} />
          ))
        )}
      </div>
    </div>
  );
}
