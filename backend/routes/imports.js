import express from "express";
import { poolPromise } from "../db.js";
import { verifyRole } from "../middleware/auth.js";

const router = express.Router();

// ---------- CREATE REQUEST (Requester) ----------
const normalizeArticleCode = (value) => {
  if (value === null || value === undefined) {
    return value;
  }

  const stringValue = String(value).trim();
  if (/^\d{1,6}$/.test(stringValue)) {
    return stringValue.padStart(6, "0");
  }

  return stringValue;
};

const mapArticles = (records) =>
  records.map((record) => ({
    ...record,
    Article: normalizeArticleCode(record.Article),
  }));

router.post("/", verifyRole(["requester"]), async (req, res) => {
  const { requestDate, arrivalDate, importer, article, palletCount } = req.body;

  if (!importer || !article || palletCount === undefined || !arrivalDate) {
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

    const arrivalDateValue = (() => {
      const parsed = new Date(arrivalDate);
      if (Number.isNaN(parsed.getTime())) {
        throw new Error("Invalid arrival date provided.");
      }
      return parsed;
    })();

    const requestDateSqlValue = requestDateValue.toISOString().split("T")[0];
    const arrivalDateSqlValue = arrivalDateValue.toISOString().split("T")[0];

    const normalizedArticle = normalizeArticleCode(article);

    const pool = await poolPromise;
    const result = await pool
      .request()
      .input("DataKerkeses", requestDateSqlValue)
      .input("DataArritjes", arrivalDateSqlValue)
      .input("Importuesi", importer)
      .input("Artikulli", normalizedArticle)
      .input("NumriPaletave", parsedPalletCount)
      .input("Useri", req.user.username)
      .query(`INSERT INTO ImportRequests (DataKerkeses, DataArritjes, Importuesi, Artikulli, NumriPaletave, Useri)
              OUTPUT INSERTED.ID,
                     INSERTED.DataKerkeses AS RequestDate,
                     INSERTED.DataArritjes AS ArrivalDate,
                     INSERTED.Importuesi AS Importer,
                     INSERTED.Artikulli AS Article,
                     INSERTED.NumriPaletave AS PalletCount,
                     INSERTED.Useri AS Requester,
                     INSERTED.Status,
                     INSERTED.ConfirmedBy,
                     INSERTED.CreatedAt
              VALUES (@DataKerkeses, @DataArritjes, @Importuesi, @Artikulli, @NumriPaletave, @Useri)`);
    const [record] = mapArticles(result.recordset);
    res.json(record);
  } catch (err) {
    console.error("Create error:", err.message);
    if (
      err.message === "Invalid request date provided." ||
      err.message === "Invalid arrival date provided."
    ) {
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
                     DataArritjes AS ArrivalDate,
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
    res.json(mapArticles(result.recordset));
  } catch (err) {
    console.error("Fetch error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

// ---------- GET APPROVED REQUESTS (Admin) ----------
router.get(
  "/confirmed",
  verifyRole(["admin", "confirmer", "requester"]),
  async (req, res) => {
    try {
      const pool = await poolPromise;
      const result = await pool
        .request()
        .query(`SELECT ID,
                     DataKerkeses AS RequestDate,
                     DataArritjes AS ArrivalDate,
                     Importuesi AS Importer,
                     Artikulli AS Article,
                     NumriPaletave AS PalletCount,
                     Useri AS Requester,
                     Status,
                     ConfirmedBy,
                     CreatedAt
              FROM ImportRequests
              WHERE Status = 'approved'
              ORDER BY DataArritjes ASC, CreatedAt DESC`);
    res.json(mapArticles(result.recordset));
  } catch (err) {
    console.error("Fetch approved error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

// ---------- APPROVE/REJECT REQUEST ----------
router.patch("/:id", verifyRole(["confirmer"]), async (req, res) => {
  const { status, arrivalDate } = req.body;

  if (!status && !arrivalDate) {
    return res
      .status(400)
      .json({ message: "No updates were provided for this request." });
  }

  try {
    const pool = await poolPromise;
    const existingResult = await pool
      .request()
      .input("ID", req.params.id)
      .query(
        `SELECT DataArritjes AS CurrentArrivalDate, Useri AS Requester
         FROM ImportRequests
         WHERE ID = @ID`
      );

    if (existingResult.recordset.length === 0) {
      return res.status(404).json({ message: "Import request not found." });
    }

    const { CurrentArrivalDate, Requester: requesterUsername } =
      existingResult.recordset[0];

    let arrivalDateSqlValue;
    if (arrivalDate) {
      const arrivalDateValue = new Date(arrivalDate);
      if (Number.isNaN(arrivalDateValue.getTime())) {
        return res.status(400).json({ message: "Invalid arrival date provided." });
      }
      arrivalDateSqlValue = arrivalDateValue.toISOString().split("T")[0];
    }

    const updateRequest = pool
      .request()
      .input("ID", req.params.id)
      .input("ConfirmedBy", req.user.username);

    const setClauses = ["ConfirmedBy = @ConfirmedBy"];

    if (status) {
      updateRequest.input("Status", status);
      setClauses.push("Status = @Status");
    }

    if (arrivalDateSqlValue) {
      updateRequest.input("DataArritjes", arrivalDateSqlValue);
      setClauses.push("DataArritjes = @DataArritjes");
    }

    if (setClauses.length === 1) {
      return res
        .status(400)
        .json({ message: "No valid fields provided for update." });
    }

    const result = await updateRequest.query(`UPDATE ImportRequests
            SET ${setClauses.join(", ")}
            OUTPUT INSERTED.ID,
                   INSERTED.DataKerkeses AS RequestDate,
                   INSERTED.DataArritjes AS ArrivalDate,
                   INSERTED.Importuesi AS Importer,
                   INSERTED.Artikulli AS Article,
                   INSERTED.NumriPaletave AS PalletCount,
                   INSERTED.Useri AS Requester,
                   INSERTED.Status,
                   INSERTED.ConfirmedBy,
                   INSERTED.CreatedAt
            WHERE ID = @ID`);
    const [record] = mapArticles(result.recordset);

    if (arrivalDateSqlValue && requesterUsername) {
      const previousDate = (() => {
        if (!CurrentArrivalDate) return null;
        const parsed = new Date(CurrentArrivalDate);
        if (Number.isNaN(parsed.getTime())) return null;
        return parsed.toISOString().split("T")[0];
      })();

      const message = previousDate
        ? `Arrival date changed from ${previousDate} to ${arrivalDateSqlValue} by ${req.user.username}.`
        : `Arrival date set to ${arrivalDateSqlValue} by ${req.user.username}.`;

      try {
        await pool
          .request()
          .input("RequestID", record.ID)
          .input("Username", requesterUsername)
          .input("Message", message)
          .input("Type", "arrival_date_change")
          .query(`INSERT INTO RequestNotifications (RequestID, Username, Message, Type)
                  VALUES (@RequestID, @Username, @Message, @Type)`);
      } catch (notificationError) {
        console.error(
          "Notification insert error:",
          notificationError.message
        );
      }
    }

    res.json(record);
  } catch (err) {
    console.error("Update error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

export default router;
