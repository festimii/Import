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

const DEFAULT_PUSH_TITLE = "📦 Import Tracker";

const normalizeString = (value, fallback = "") => {
  if (value === null || value === undefined) return fallback;
  const stringValue = String(value).trim();
  return stringValue.length > 0 ? stringValue : fallback;
};

const uniqueArray = (values = []) => {
  const seen = new Set();
  values.forEach((value) => {
    if (typeof value === "string" && value.trim().length > 0) {
      seen.add(value.trim());
    }
  });
  return Array.from(seen);
};

async function getUsernamesByRoles(roles = [], poolInstance) {
  const normalizedRoles = uniqueArray(roles);
  if (normalizedRoles.length === 0) return [];

  const pool = poolInstance ?? (await poolPromise);
  const request = pool.request();

  const placeholders = normalizedRoles.map((role, index) => {
    const paramName = `Role${index}`;
    request.input(paramName, role);
    return `@${paramName}`;
  });

  const query = `SELECT Username FROM Users WHERE Role IN (${placeholders.join(", ")})`;
  const result = await request.query(query);

  return uniqueArray(result.recordset.map((row) => row.Username));
}

export async function dispatchNotification({
  requestId = null,
  message = "",
  type = "general",
  usernames = [],
  roles = [],
  actor,
  title = DEFAULT_PUSH_TITLE,
  data = {},
} = {}) {
  const trimmedMessage = normalizeString(message);
  if (!trimmedMessage) {
    return { notifications: [], pushResults: [], recipients: [] };
  }

  const pool = await poolPromise;
  const recipients = new Set(uniqueArray(usernames));

  const roleUsernames = await getUsernamesByRoles(roles, pool);
  roleUsernames.forEach((username) => recipients.add(username));

  if (actor) recipients.delete(actor);

  if (recipients.size === 0) {
    return { notifications: [], pushResults: [], recipients: [] };
  }

  const insertedNotifications = [];

  for (const username of recipients) {
    const insertResult = await pool
      .request()
      .input("RequestID", requestId)
      .input("Username", username)
      .input("Message", trimmedMessage)
      .input("Type", normalizeString(type, "general"))
      .query(`
        INSERT INTO RequestNotifications
          (RequestID, Username, Message, Type, CreatedAt)
        OUTPUT INSERTED.ID,
               INSERTED.RequestID,
               INSERTED.Username,
               INSERTED.Message,
               INSERTED.Type,
               INSERTED.CreatedAt,
               INSERTED.ReadAt
        VALUES (@RequestID, @Username, @Message, @Type, GETDATE())
      `);

    if (insertResult.recordset[0]) {
      insertedNotifications.push(insertResult.recordset[0]);
    }
  }

  const payload = JSON.stringify({
    title: normalizeString(title, DEFAULT_PUSH_TITLE),
    body: trimmedMessage,
    data: {
      requestId,
      type: normalizeString(type, "general"),
      actor: actor ?? null,
      recipients: Array.from(recipients),
      ...data,
    },
    actions: [
      { action: "open", title: "Open Dashboard" },
      { action: "dismiss", title: "Dismiss" },
    ],
  });

  const pushResults = await Promise.allSettled(
    subscriptions.map((sub) =>
      webpush.sendNotification(sub, payload).catch((err) => {
        if (err.statusCode === 410 || err.statusCode === 404) {
          const idx = subscriptions.indexOf(sub);
          if (idx >= 0) subscriptions.splice(idx, 1);
          console.log("🧹 Removed stale subscription:", sub.endpoint);
        } else {
          console.error("Push send error:", err.message);
        }
        throw err;
      })
    )
  );

  if (requestId) {
    console.log(
      `📨 Sent notification for RequestID=${requestId} to ${recipients.size} recipients`
    );
  }

  return {
    notifications: insertedNotifications,
    pushResults,
    recipients: Array.from(recipients),
  };
}

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
  const {
    RequestID,
    Message,
    Type,
    TargetUsername,
    TargetRoles,
    Title,
    Data,
  } = req.body;

  try {
    const result = await dispatchNotification({
      requestId: RequestID ?? null,
      message: Message,
      type: Type ?? "general",
      usernames: TargetUsername ? [TargetUsername] : [],
      roles: Array.isArray(TargetRoles) ? TargetRoles : [],
      actor: req.user?.username,
      title: Title ?? DEFAULT_PUSH_TITLE,
      data: Data && typeof Data === "object" ? Data : {},
    });

    res.status(201).json(result);
  } catch (err) {
    console.error("❌ Notification create error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

export default router;
