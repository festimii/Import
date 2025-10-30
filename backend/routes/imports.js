import express from "express";
import { poolPromise } from "../db.js";
import { verifyRole } from "../middleware/auth.js";

const router = express.Router();

// ---------- CREATE REQUEST (Requester) ----------
router.post("/", verifyRole(["requester"]), async (req, res) => {
  const { description, items } = req.body;
  try {
    const pool = await poolPromise;
    const result = await pool
      .request()
      .input("Requester", req.user.username)
      .input("Description", description)
      .input("Items", JSON.stringify(items))
      .query(`INSERT INTO ImportRequests (Requester, Description, Items)
              OUTPUT INSERTED.* VALUES (@Requester, @Description, @Items)`);
    res.json(result.recordset[0]);
  } catch (err) {
    console.error("Create error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

// ---------- GET PENDING REQUESTS (Confirmer) ----------
router.get("/", verifyRole(["confirmer"]), async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool
      .request()
      .query(
        "SELECT * FROM ImportRequests WHERE Status = 'pending' ORDER BY CreatedAt DESC"
      );
    res.json(result.recordset);
  } catch (err) {
    console.error("Fetch error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

// ---------- APPROVE/REJECT REQUEST ----------
router.patch("/:id", verifyRole(["confirmer"]), async (req, res) => {
  const { status } = req.body;
  try {
    const pool = await poolPromise;
    const result = await pool
      .request()
      .input("ID", req.params.id)
      .input("Status", status)
      .input("ConfirmedBy", req.user.username).query(`UPDATE ImportRequests
              SET Status = @Status, ConfirmedBy = @ConfirmedBy
              OUTPUT INSERTED.* WHERE ID = @ID`);
    res.json(result.recordset[0]);
  } catch (err) {
    console.error("Update error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

export default router;
