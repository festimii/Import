import "../styles.css";

export default function RequestCard({ req, onDecision }) {
  return (
    <div className="card request-card">
      <div>
        <h4>{req.Description}</h4>
        <p>Items: {JSON.parse(req.Items).join(", ")}</p>
        <small>Requester: {req.Requester}</small>
      </div>
      <div className="buttons">
        <button
          className="approve"
          onClick={() => onDecision(req.ID, "approved")}
        >
          Approve
        </button>
        <button
          className="reject"
          onClick={() => onDecision(req.ID, "rejected")}
        >
          Reject
        </button>
      </div>
    </div>
  );
}
