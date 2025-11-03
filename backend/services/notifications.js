import webpush from "web-push";
import dotenv from "dotenv";

dotenv.config();

const CONTACT_EMAIL = process.env.NOTIFICATIONS_CONTACT_EMAIL ||
  "mailto:you@example.com";

webpush.setVapidDetails(
  CONTACT_EMAIL,
  process.env.PUBLIC_KEY,
  process.env.PRIVATE_KEY
);

const subscriptions = new Map();

export const getPublicKey = () => process.env.PUBLIC_KEY || "";

export const storeSubscription = (subscription) => {
  if (!subscription?.endpoint) {
    return false;
  }

  subscriptions.set(subscription.endpoint, subscription);
  return true;
};

export const broadcastPushNotification = async (payload) => {
  const serializedPayload =
    typeof payload === "string" ? payload : JSON.stringify(payload);

  const results = [];

  for (const [endpoint, subscription] of subscriptions.entries()) {
    try {
      await webpush.sendNotification(subscription, serializedPayload);
      results.push({ endpoint, status: "fulfilled" });
    } catch (error) {
      if (error?.statusCode === 410 || error?.statusCode === 404) {
        subscriptions.delete(endpoint);
        console.log("🧹 Removed stale subscription:", endpoint);
      } else {
        console.error("Push send error:", error?.message || error);
      }

      results.push({
        endpoint,
        status: "rejected",
        reason: error?.message || "Unknown error",
      });
    }
  }

  return results;
};

const trimMessage = (message) => {
  if (typeof message !== "string") return "";
  return message.length > 400 ? message.slice(0, 400) : message;
};

export const createNotifications = async (
  pool,
  { requestId, message, type = "info", usernames, excludeUsername }
) => {
  const safeMessage = trimMessage(message);

  if (!requestId || !safeMessage) {
    return [];
  }

  if (Array.isArray(usernames) && usernames.length > 0) {
    const inserted = [];

    for (const username of usernames) {
      if (!username) continue;

      const result = await pool
        .request()
        .input("RequestID", requestId)
        .input("Username", username)
        .input("Message", safeMessage)
        .input("Type", type)
        .query(`INSERT INTO RequestNotifications (RequestID, Username, Message, Type)
                OUTPUT INSERTED.ID, INSERTED.RequestID, INSERTED.Username,
                       INSERTED.Message, INSERTED.Type, INSERTED.CreatedAt,
                       INSERTED.ReadAt
                VALUES (@RequestID, @Username, @Message, @Type)`);

      if (result.recordset.length > 0) {
        inserted.push(result.recordset[0]);
      }
    }

    return inserted;
  }

  const result = await pool
    .request()
    .input("RequestID", requestId)
    .input("Message", safeMessage)
    .input("Type", type)
    .input("ExcludeUsername", excludeUsername || null)
    .query(`INSERT INTO RequestNotifications (RequestID, Username, Message, Type)
            SELECT @RequestID, Username, @Message, @Type
            FROM Users
            WHERE (@ExcludeUsername IS NULL OR Username <> @ExcludeUsername)
            OUTPUT INSERTED.ID, INSERTED.RequestID, INSERTED.Username,
                   INSERTED.Message, INSERTED.Type, INSERTED.CreatedAt,
                   INSERTED.ReadAt`);

  return result.recordset;
};

