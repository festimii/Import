import express from "express";
import { poolPromise } from "../db.js";
import { verifyRole } from "../middleware/auth.js";
import {
  broadcastPushNotification,
  createNotifications,
  getPublicKey,
  storeSubscription,
} from "../services/notifications.js";

const router = express.Router();
const allowedRoles = ["admin", "confirmer", "requester"];

// ===========================================================
// 1️⃣  FRONTEND PUSH SUBSCRIPTION HANDLERS
// ===========================================================

// Public key endpoint (for React frontend)
router.get("/public-key", (req, res) => {
  res.json({ publicKey: getPublicKey() });
});

// Subscribe endpoint — called by React once service worker registers
router.post("/subscribe", (req, res) => {
  const subscription = req.body;
  const stored = storeSubscription(subscription);

  if (!stored) {
    return res.status(400).json({ error: "Invalid subscription" });
  }

  console.log("✅ New push subscription:", subscription.endpoint);
  res.status(201).json({ message: "Subscribed successfully" });
});

// ===========================================================
// 2️⃣  DATABASE-BACKED NOTIFICATION API
// ===========================================================

// Fetch notifications from SQL Server
router.get("/", verifyRole(allowedRoles), async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().input("Username", req.user.username)
      .query(`SELECT ID, RequestID, Username, Message, Type, CreatedAt, ReadAt
              FROM RequestNotifications
              WHERE Username = @Username
              ORDER BY CreatedAt DESC`);
    res.json(result.recordset);
  } catch (err) {
    console.error("Notifications fetch error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

// Mark notification as read
router.patch("/:id/read", verifyRole(allowedRoles), async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool
      .request()
      .input("ID", req.params.id)
      .input("Username", req.user.username).query(`UPDATE RequestNotifications
              SET ReadAt = ISNULL(ReadAt, GETDATE())
              OUTPUT INSERTED.ID, INSERTED.RequestID, INSERTED.Username,
                     INSERTED.Message, INSERTED.Type,
                     INSERTED.CreatedAt, INSERTED.ReadAt
              WHERE ID = @ID AND Username = @Username`);

    if (result.recordset.length === 0)
      return res.status(404).json({ message: "Notification not found." });

    res.json(result.recordset[0]);
  } catch (err) {
    console.error("Notification update error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

// ===========================================================
// 3️⃣  PUSH SEND ENDPOINT (manual or auto trigger)
// ===========================================================

router.post("/send", verifyRole(["admin", "confirmer"]), async (req, res) => {
  const { title, body, data } = req.body;
  const payload = {
    title: title || "New Notification",
    body: body || "You have a new message",
    data: data || {},
  };

  const results = await broadcastPushNotification(payload);

  res.json({ status: "ok", results });
});

// ===========================================================
// 4️⃣  OPTIONAL: SEND PUSH WHEN NEW RECORD INSERTED
// ===========================================================

// ===========================================================
// 4️⃣  IMPROVED: SEND PUSH WHEN NEW RECORD INSERTED
// ===========================================================
router.post("/create", verifyRole(allowedRoles), async (req, res) => {
  const { RequestID, Message, Type, TargetUsername, Audience } = req.body;

  if (!RequestID || !Message) {
    return res.status(400).json({ message: "Missing required notification data." });
  }

  try {
    const pool = await poolPromise;
    const explicitAudience = [];

    if (TargetUsername) {
      explicitAudience.push(TargetUsername);
    }

    if (Array.isArray(Audience)) {
      for (const username of Audience) {
        if (username && !explicitAudience.includes(username)) {
          explicitAudience.push(username);
        }
      }
    }

    const created = await createNotifications(pool, {
      requestId: RequestID,
      message: Message,
      type: Type || "info",
      usernames: explicitAudience.length > 0 ? explicitAudience : undefined,
    });

    const pushResults = await broadcastPushNotification(
      {
        title: "📦 Import Tracker",
        body: Message || "A new import request requires your attention.",
        data: {
          requestId: RequestID,
          type: Type || "info",
          createdAt: new Date().toISOString(),
        },
        actions: [
          { action: "open", title: "Open Dashboard" },
          { action: "dismiss", title: "Dismiss" },
        ],
      },
      { notifyTeams: false }
    );

    res.status(201).json({ notification: created, pushResults });
  } catch (err) {
    console.error("❌ Notification create error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

export default router;
