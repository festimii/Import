import express from "express";
import { poolPromise } from "../db.js";
import { verifyRole } from "../middleware/auth.js";

const router = express.Router();

// ---------- CREATE REQUEST (Requester) ----------
router.post("/", verifyRole(["requester"]), async (req, res) => {
  const { requestDate, importer, article, palletCount } = req.body;

  if (!importer || !article || palletCount === undefined) {
    return res
      .status(400)
      .json({ message: "Missing required fields for import request." });
  }

  const parsedPalletCount = Number(palletCount);

  if (!Number.isFinite(parsedPalletCount) || parsedPalletCount < 0) {
    return res
      .status(400)
      .json({ message: "Pallet count must be a non-negative number." });
  }

  try {
    const requestDateValue = (() => {
      if (!requestDate) return new Date();

      const parsed = new Date(requestDate);
      if (Number.isNaN(parsed.getTime())) {
        throw new Error("Invalid request date provided.");
      }
      return parsed;
    })();

    const pool = await poolPromise;
    const result = await pool
      .request()
      .input("Requester", req.user.username)
      .input("RequestDate", requestDateValue.toISOString().split("T")[0])
      .input("Importer", importer)
      .input("Article", article)
      .input("PalletCount", parsedPalletCount)
      .query(`INSERT INTO ImportRequests (Requester, RequestDate, Importer, Article, PalletCount)
              OUTPUT INSERTED.* VALUES (@Requester, @RequestDate, @Importer, @Article, @PalletCount)`);
    res.json(result.recordset[0]);
  } catch (err) {
    console.error("Create error:", err.message);
    if (err.message === "Invalid request date provided.") {
      return res.status(400).json({ message: err.message });
    }
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

// ---------- GET APPROVED REQUESTS (Admin) ----------
router.get("/confirmed", verifyRole(["admin"]), async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool
      .request()
      .query(
        "SELECT * FROM ImportRequests WHERE Status = 'approved' ORDER BY RequestDate ASC, CreatedAt DESC"
      );
    res.json(result.recordset);
  } catch (err) {
    console.error("Fetch approved error:", err.message);
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
