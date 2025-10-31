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

    const requestDateSqlValue = requestDateValue.toISOString().split("T")[0];

    const pool = await poolPromise;
    const result = await pool
      .request()
      .input("DataKerkeses", requestDateSqlValue)
      .input("Importuesi", importer)
      .input("Artikulli", article)
      .input("NumriPaletave", parsedPalletCount)
      .input("Useri", req.user.username)
      .query(`INSERT INTO ImportRequests (DataKerkeses, Importuesi, Artikulli, NumriPaletave, Useri)
              OUTPUT INSERTED.ID,
                     INSERTED.DataKerkeses AS RequestDate,
                     INSERTED.Importuesi AS Importer,
                     INSERTED.Artikulli AS Article,
                     INSERTED.NumriPaletave AS PalletCount,
                     INSERTED.Useri AS Requester,
                     INSERTED.Status,
                     INSERTED.ConfirmedBy,
                     INSERTED.CreatedAt
              VALUES (@DataKerkeses, @Importuesi, @Artikulli, @NumriPaletave, @Useri)`);
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
      .query(`SELECT ID,
                     DataKerkeses AS RequestDate,
                     Importuesi AS Importer,
                     Artikulli AS Article,
                     NumriPaletave AS PalletCount,
                     Useri AS Requester,
                     Status,
                     ConfirmedBy,
                     CreatedAt
              FROM ImportRequests
              WHERE Status = 'pending'
              ORDER BY CreatedAt DESC`);
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
      .query(`SELECT ID,
                     DataKerkeses AS RequestDate,
                     Importuesi AS Importer,
                     Artikulli AS Article,
                     NumriPaletave AS PalletCount,
                     Useri AS Requester,
                     Status,
                     ConfirmedBy,
                     CreatedAt
              FROM ImportRequests
              WHERE Status = 'approved'
              ORDER BY DataKerkeses ASC, CreatedAt DESC`);
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
      .input("ConfirmedBy", req.user.username)
      .query(`UPDATE ImportRequests
              SET Status = @Status, ConfirmedBy = @ConfirmedBy
              OUTPUT INSERTED.ID,
                     INSERTED.DataKerkeses AS RequestDate,
                     INSERTED.Importuesi AS Importer,
                     INSERTED.Artikulli AS Article,
                     INSERTED.NumriPaletave AS PalletCount,
                     INSERTED.Useri AS Requester,
                     INSERTED.Status,
                     INSERTED.ConfirmedBy,
                     INSERTED.CreatedAt
              WHERE ID = @ID`);
    res.json(result.recordset[0]);
  } catch (err) {
    console.error("Update error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

export default router;
