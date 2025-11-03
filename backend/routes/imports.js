import express from "express";
import { poolPromise } from "../db.js";
import { verifyRole } from "../middleware/auth.js";
import { dispatchNotification } from "./notifications.js";

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
  const {
    requestDate,
    arrivalDate,
    importer,
    article,
    palletCount,
    comment,
  } = req.body;

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
    const sanitizedComment = (() => {
      if (comment === null || comment === undefined) {
        return null;
      }

      const stringValue = String(comment).trim();
      if (stringValue.length === 0) {
        return null;
      }

      return stringValue.slice(0, 1000);
    })();

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
      .input("Comment", sanitizedComment)
      .input("Useri", req.user.username)
      .query(`INSERT INTO ImportRequests (DataKerkeses, DataArritjes, Importuesi, Artikulli, NumriPaletave, Useri, Comment)
              OUTPUT INSERTED.ID,
                     INSERTED.DataKerkeses AS RequestDate,
                     INSERTED.DataArritjes AS ArrivalDate,
                     INSERTED.Importuesi AS Importer,
                     INSERTED.Artikulli AS Article,
                     INSERTED.NumriPaletave AS PalletCount,
                     INSERTED.Comment,
                     INSERTED.Useri AS Requester,
                     INSERTED.Status,
                     INSERTED.ConfirmedBy,
                     INSERTED.CreatedAt
              VALUES (@DataKerkeses, @DataArritjes, @Importuesi, @Artikulli, @NumriPaletave, @Useri, @Comment)`);
    const [record] = mapArticles(result.recordset);

    try {
      await dispatchNotification({
        requestId: record.ID,
        message: `New import request #${record.ID} created by ${req.user.username}.`,
        type: "request_created",
        roles: ["confirmer", "admin"],
        actor: req.user.username,
        data: {
          status: record.Status,
          importer: record.Importer,
          article: record.Article,
        },
      });
    } catch (notificationError) {
      console.error(
        "Notification dispatch error (create):",
        notificationError.message
      );
    }

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
                     Comment,
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
                     Comment,
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
  }
);

router.get(
  "/metrics",
  verifyRole(["admin", "confirmer", "requester"]),
  async (req, res) => {
    try {
      const pool = await poolPromise;

      const summaryResult = await pool
        .request()
        .query(`SELECT COUNT(*) AS TotalRequests,
                       SUM(CASE WHEN Status = 'pending' THEN 1 ELSE 0 END) AS PendingCount,
                       SUM(CASE WHEN Status = 'approved' THEN 1 ELSE 0 END) AS ApprovedCount,
                       SUM(CASE WHEN Status = 'rejected' THEN 1 ELSE 0 END) AS RejectedCount,
                       SUM(CAST(NumriPaletave AS INT)) AS TotalPallets
                FROM ImportRequests`);

      const summary = summaryResult.recordset[0] ?? {};

      const totalRequests = Number(summary.TotalRequests ?? 0);
      const pendingCount = Number(summary.PendingCount ?? 0);
      const approvedCount = Number(summary.ApprovedCount ?? 0);
      const rejectedCount = Number(summary.RejectedCount ?? 0);
      const totalPalletsRaw = Number(summary.TotalPallets ?? 0);
      const totalPallets = Number.isFinite(totalPalletsRaw) ? totalPalletsRaw : 0;
      const averagePallets =
        totalRequests > 0 && totalPallets > 0
          ? Math.round((totalPallets / totalRequests) * 10) / 10
          : 0;

      const upcomingResult = await pool
        .request()
        .query(`SELECT COUNT(*) AS UpcomingWeek
                FROM ImportRequests
                WHERE Status = 'approved'
                  AND DataArritjes IS NOT NULL
                  AND CAST(DataArritjes AS DATE) >= CAST(GETDATE() AS DATE)
                  AND CAST(DataArritjes AS DATE) < DATEADD(day, 7, CAST(GETDATE() AS DATE))`);

      const upcomingWeek = Number(upcomingResult.recordset?.[0]?.UpcomingWeek ?? 0);

      const monthlyResult = await pool
        .request()
        .query(`SELECT FORMAT(DataKerkeses, 'yyyy-MM') AS Month,
                       COUNT(*) AS RequestCount,
                       SUM(CAST(NumriPaletave AS INT)) AS PalletTotal
                FROM ImportRequests
                GROUP BY FORMAT(DataKerkeses, 'yyyy-MM')
                ORDER BY Month ASC`);

      const monthlyRequests = monthlyResult.recordset.map((row) => ({
        month: row.Month,
        requestCount: Number(row.RequestCount ?? 0),
        palletTotal: Number(row.PalletTotal ?? 0),
      }));

      res.json({
        totalRequests,
        pendingCount,
        approvedCount,
        rejectedCount,
        totalPallets,
        averagePallets,
        upcomingWeek,
        monthlyRequests,
      });
    } catch (err) {
      console.error("Metrics fetch error:", err.message);
      res.status(500).json({ message: "Server error" });
    }
  }
);

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
        `SELECT DataArritjes AS CurrentArrivalDate,
                Useri AS Requester,
                Status AS CurrentStatus
         FROM ImportRequests
         WHERE ID = @ID`
      );

    if (existingResult.recordset.length === 0) {
      return res.status(404).json({ message: "Import request not found." });
    }

    const {
      CurrentArrivalDate,
      Requester: requesterUsername,
      CurrentStatus,
    } =
      existingResult.recordset[0];

    const previousArrivalDate = (() => {
      if (!CurrentArrivalDate) return null;
      const parsed = new Date(CurrentArrivalDate);
      if (Number.isNaN(parsed.getTime())) return null;
      return parsed.toISOString().split("T")[0];
    })();

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
                   INSERTED.Comment,
                   INSERTED.Useri AS Requester,
                   INSERTED.Status,
                   INSERTED.ConfirmedBy,
                   INSERTED.CreatedAt
            WHERE ID = @ID`);
    const [record] = mapArticles(result.recordset);

    const notificationsToDispatch = [];

    if (status && status !== CurrentStatus) {
      const normalizedStatus = String(status).toLowerCase();
      const statusMessageMap = {
        approved: `Import request #${record.ID} approved by ${req.user.username}.`,
        rejected: `Import request #${record.ID} rejected by ${req.user.username}.`,
        pending: `Import request #${record.ID} marked as pending by ${req.user.username}.`,
      };
      const statusMessage =
        statusMessageMap[normalizedStatus] ||
        `Import request #${record.ID} status updated to ${status} by ${req.user.username}.`;

      notificationsToDispatch.push({
        requestId: record.ID,
        message: statusMessage,
        type: `status_${normalizedStatus}`,
        usernames: requesterUsername ? [requesterUsername] : [],
        roles: ["admin", "confirmer"],
        actor: req.user.username,
        data: { status: normalizedStatus },
      });
    }

    if (arrivalDateSqlValue && requesterUsername) {
      if (arrivalDateSqlValue !== previousArrivalDate) {
        const message = previousArrivalDate
          ? `Arrival date changed from ${previousArrivalDate} to ${arrivalDateSqlValue} by ${req.user.username}.`
          : `Arrival date set to ${arrivalDateSqlValue} by ${req.user.username}.`;

        notificationsToDispatch.push({
          requestId: record.ID,
          message,
          type: "arrival_date_change",
          usernames: [requesterUsername],
          roles: ["admin", "confirmer"],
          actor: req.user.username,
          data: {
            previousArrivalDate,
            arrivalDate: arrivalDateSqlValue,
          },
        });
      }
    }

    if (notificationsToDispatch.length > 0) {
      const results = await Promise.allSettled(
        notificationsToDispatch.map((payload) => dispatchNotification(payload))
      );

      results.forEach((result) => {
        if (result.status === "rejected") {
          console.error(
            "Notification dispatch error (update):",
            result.reason?.message || result.reason
          );
        }
      });
    }

    res.json(record);
  } catch (err) {
    console.error("Update error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

export default router;
