import webpush from "web-push";
import dotenv from "dotenv";
import fetch from "node-fetch";

dotenv.config();

const CONTACT_EMAIL =
  process.env.NOTIFICATIONS_CONTACT_EMAIL || "mailto:you@example.com";

webpush.setVapidDetails(
  CONTACT_EMAIL,
  process.env.PUBLIC_KEY,
  process.env.PRIVATE_KEY
);

const subscriptions = new Map();
const teamsWebhookUrl = process.env.TEAMS_WEBHOOK_URL;
const teamsDashboardUrl = process.env.TEAMS_DASHBOARD_URL;

const resolveThemeColor = (type = "info") => {
  const normalized = type.toLowerCase();

  if (normalized.includes("error") || normalized.includes("reject")) {
    return "C4314B"; // red
  }

  if (normalized.includes("success") || normalized.includes("approve")) {
    return "2E8540"; // green
  }

  if (normalized.includes("warning") || normalized.includes("pending")) {
    return "FFAA44"; // amber
  }

  return "0078D4"; // Teams blue default
};

const sendTeamsNotification = async ({
  title,
  message,
  type,
  requestId,
  audience,
}) => {
  if (!teamsWebhookUrl) {
    return { status: "skipped", reason: "Missing TEAMS_WEBHOOK_URL" };
  }

  const cardTitle = title || "📦 Import Tracker";
  const lines = [];

  if (message) {
    lines.push(message);
  }

  if (requestId) {
    lines.push(`**Request ID:** ${requestId}`);
  }

  if (Array.isArray(audience) && audience.length > 0) {
    lines.push(`**Audience:** ${audience.join(", ")}`);
  }

  if (lines.length === 0) {
    lines.push("A new notification was generated.");
  }

  const payload = {
    "@type": "MessageCard",
    "@context": "http://schema.org/extensions",
    summary: cardTitle,
    themeColor: resolveThemeColor(type),
    title: cardTitle,
    text: lines.join("\n\n"),
  };

  if (teamsDashboardUrl) {
    payload.potentialAction = [
      {
        "@type": "OpenUri",
        name: "Open Dashboard",
        targets: [
          {
            os: "default",
            uri: teamsDashboardUrl,
          },
        ],
      },
    ];
  }

  try {
    const response = await fetch(teamsWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Teams webhook responded with ${response.status} ${response.statusText}: ${errorText}`
      );
    }

    return { status: "fulfilled" };
  } catch (error) {
    console.error("Microsoft Teams notification error:", error.message || error);
    return { status: "rejected", reason: error.message || "Unknown error" };
  }
};

export const getPublicKey = () => process.env.PUBLIC_KEY || "";

export const storeSubscription = (subscription) => {
  if (!subscription?.endpoint) {
    return false;
  }

  subscriptions.set(subscription.endpoint, subscription);
  return true;
};

export const broadcastPushNotification = async (
  payload,
  { notifyTeams = true } = {}
) => {
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

  if (notifyTeams && typeof payload === "object" && payload !== null) {
    const teamsAudience = Array.isArray(payload?.data?.usernames)
      ? payload.data.usernames
      : undefined;

    await sendTeamsNotification({
      title: payload.title,
      message: payload.body,
      type: payload.data?.type || payload.type,
      requestId: payload.data?.requestId,
      audience: teamsAudience,
    });
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
        .input("ExcludeUsername", excludeUsername || null)
        .query(`INSERT INTO RequestNotifications (RequestID, Username, Message, Type)
        OUTPUT INSERTED.ID, INSERTED.RequestID, INSERTED.Username,
               INSERTED.Message, INSERTED.Type, INSERTED.CreatedAt,
               INSERTED.ReadAt
        SELECT @RequestID, Username, @Message, @Type
        FROM Users
        WHERE (@ExcludeUsername IS NULL OR Username <> @ExcludeUsername)`);

      if (result.recordset.length > 0) {
        inserted.push(result.recordset[0]);
      }
    }

    if (inserted.length > 0) {
      await sendTeamsNotification({
        message: safeMessage,
        type,
        requestId,
        audience: usernames,
      });
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
            OUTPUT INSERTED.ID, INSERTED.RequestID, INSERTED.Username,
                   INSERTED.Message, INSERTED.Type, INSERTED.CreatedAt,
                   INSERTED.ReadAt
            SELECT @RequestID, Username, @Message, @Type
            FROM Users
            WHERE (@ExcludeUsername IS NULL OR Username <> @ExcludeUsername)`);

  if (result.recordset.length > 0) {
    const audience = result.recordset.map((row) => row.Username);

    await sendTeamsNotification({
      message: safeMessage,
      type,
      requestId,
      audience,
    });
  }

  return result.recordset;
};
