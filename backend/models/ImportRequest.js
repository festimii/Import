import express from "express";
import { poolPromise } from "../db.js";
import { verifyRole } from "../middleware/auth.js";

const router = express.Router();

// Create import request
router.post("/", verifyRole(["requester"]), async (req, res) => {
  const { description, items } = req.body;
  const pool = await poolPromise;
  const result = await pool
    .request()
    .input("Requester", req.user.username)
    .input("Description", description)
    .input("Items", JSON.stringify(items))
    .query(`INSERT INTO ImportRequests (Requester, Description, Items)
            OUTPUT INSERTED.* VALUES (@Requester, @Description, @Items)`);
  res.json(result.recordset[0]);
});

// Get pending requests (confirmer)
router.get("/", verifyRole(["confirmer"]), async (req, res) => {
  const pool = await poolPromise;
  const result = await pool
    .request()
    .query(
      `SELECT * FROM ImportRequests WHERE Status = 'pending' ORDER BY CreatedAt DESC`
    );
  res.json(result.recordset);
});

// Approve/Reject request
router.patch("/:id", verifyRole(["confirmer"]), async (req, res) => {
  const { status } = req.body;
  const pool = await poolPromise;
  const result = await pool
    .request()
    .input("ID", req.params.id)
    .input("Status", status)
    .input("ConfirmedBy", req.user.username).query(`UPDATE ImportRequests
            SET Status = @Status, ConfirmedBy = @ConfirmedBy
            OUTPUT INSERTED.* WHERE ID = @ID`);
  res.json(result.recordset[0]);
});

export default router;
