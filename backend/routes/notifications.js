import express from "express";
import webpush from "web-push";
import dotenv from "dotenv";
import { poolPromise } from "../db.js";
import { verifyRole } from "../middleware/auth.js";

dotenv.config();
const router = express.Router();
const allowedRoles = ["admin", "confirmer", "requester"];

// ===================
// VAPID CONFIGURATION
// ===================
webpush.setVapidDetails(
  "mailto:you@example.com", // contact email
  process.env.PUBLIC_KEY,
  process.env.PRIVATE_KEY
);

// store active push subscriptions in memory (you can persist later)
const subscriptions = [];

// ===========================================================
// 1️⃣  FRONTEND PUSH SUBSCRIPTION HANDLERS
// ===========================================================

// Public key endpoint (for React frontend)
router.get("/public-key", (req, res) => {
  res.json({ publicKey: process.env.PUBLIC_KEY });
});

// Subscribe endpoint — called by React once service worker registers
router.post("/subscribe", (req, res) => {
  const subscription = req.body;
  if (!subscription?.endpoint)
    return res.status(400).json({ error: "Invalid subscription" });

  const exists = subscriptions.some(
    (s) => s.endpoint === subscription.endpoint
  );
  if (!exists) subscriptions.push(subscription);

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
  const { title, body } = req.body;
  const payload = JSON.stringify({
    title: title || "New Notification",
    body: body || "You have a new message",
  });

  const results = await Promise.allSettled(
    subscriptions.map((sub) => webpush.sendNotification(sub, payload))
  );

  res.json({ status: "ok", results });
});

// ===========================================================
// 4️⃣  OPTIONAL: SEND PUSH WHEN NEW RECORD INSERTED
// ===========================================================

// ===========================================================
// 4️⃣  IMPROVED: SEND PUSH WHEN NEW RECORD INSERTED
// ===========================================================
router.post("/create", verifyRole(allowedRoles), async (req, res) => {
  const { RequestID, Message, Type, TargetUsername } = req.body;

  try {
    const pool = await poolPromise;

    // --- Insert DB record ---
    const result = await pool
      .request()
      .input("RequestID", RequestID)
      .input("Username", TargetUsername)
      .input("Message", Message)
      .input("Type", Type).query(`
        INSERT INTO RequestNotifications
          (RequestID, Username, Message, Type, CreatedAt)
        OUTPUT INSERTED.*
        VALUES (@RequestID, @Username, @Message, @Type, GETDATE())
      `);

    const newNotif = result.recordset[0];

    // --- Construct push payload ---
    const payload = JSON.stringify({
      title: "📦 Import Tracker",
      body: Message || "A new import request requires your attention.",
      data: {
        requestId: RequestID,
        username: TargetUsername,
        type: Type,
        createdAt: new Date().toISOString(),
      },
      actions: [
        { action: "open", title: "Open Dashboard" },
        { action: "dismiss", title: "Dismiss" },
      ],
    });

    // --- Send to all active subscriptions ---
    const sendResults = await Promise.allSettled(
      subscriptions.map((sub) =>
        webpush.sendNotification(sub, payload).catch((err) => {
          // Clean up invalid subscriptions (410 Gone)
          if (err.statusCode === 410 || err.statusCode === 404) {
            const idx = subscriptions.indexOf(sub);
            if (idx >= 0) subscriptions.splice(idx, 1);
            console.log("🧹 Removed stale subscription:", sub.endpoint);
          } else {
            console.error("Push send error:", err.message);
          }
        })
      )
    );

    console.log(
      `📨 Sent notification for RequestID=${RequestID} to ${subscriptions.length} clients`
    );

    res.status(201).json({ notification: newNotif, pushResults: sendResults });
  } catch (err) {
    console.error("❌ Notification create error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

export default router;
