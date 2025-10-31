import express from "express";
import { poolPromise } from "../db.js";
import { verifyRole } from "../middleware/auth.js";

const router = express.Router();

// Create import request
router.post("/", verifyRole(["requester"]), async (req, res) => {
  const { requestDate, importer, article, palletCount } = req.body;

  if (!requestDate || !importer || !article || palletCount === undefined) {
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

  const requestDateValue = new Date(requestDate);

  if (Number.isNaN(requestDateValue.getTime())) {
    return res.status(400).json({ message: "Invalid request date provided." });
  }

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
