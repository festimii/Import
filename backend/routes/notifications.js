import express from "express";
import { poolPromise } from "../db.js";
import { verifyRole } from "../middleware/auth.js";

const router = express.Router();
const allowedRoles = ["admin", "confirmer", "requester"];

router.get("/", verifyRole(allowedRoles), async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool
      .request()
      .input("Username", req.user.username)
      .query(`SELECT ID,
                     RequestID,
                     Username,
                     Message,
                     Type,
                     CreatedAt,
                     ReadAt
              FROM RequestNotifications
              WHERE Username = @Username
              ORDER BY CreatedAt DESC`);
    res.json(result.recordset);
  } catch (err) {
    console.error("Notifications fetch error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

router.patch(
  "/:id/read",
  verifyRole(allowedRoles),
  async (req, res) => {
    try {
      const pool = await poolPromise;
      const result = await pool
        .request()
        .input("ID", req.params.id)
        .input("Username", req.user.username)
        .query(`UPDATE RequestNotifications
                SET ReadAt = ISNULL(ReadAt, GETDATE())
                OUTPUT INSERTED.ID,
                       INSERTED.RequestID,
                       INSERTED.Username,
                       INSERTED.Message,
                       INSERTED.Type,
                       INSERTED.CreatedAt,
                       INSERTED.ReadAt
                WHERE ID = @ID AND Username = @Username`);

      if (result.recordset.length === 0) {
        return res.status(404).json({ message: "Notification not found." });
      }

      res.json(result.recordset[0]);
    } catch (err) {
      console.error("Notification update error:", err.message);
      res.status(500).json({ message: "Server error" });
    }
  }
);

export default router;
