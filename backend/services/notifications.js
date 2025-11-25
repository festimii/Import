import webpush from "web-push";
import dotenv from "dotenv";

dotenv.config();

const CONTACT_EMAIL =
  process.env.NOTIFICATIONS_CONTACT_EMAIL || "mailto:you@example.com";

webpush.setVapidDetails(
  CONTACT_EMAIL,
  process.env.PUBLIC_KEY,
  process.env.PRIVATE_KEY
);

const subscriptions = new Map();

const isNonEmptyString = (value) =>
  typeof value === "string" && value.trim().length > 0;

const normalizeUsername = (value) => {
  if (!isNonEmptyString(value)) return null;
  return value.trim();
};

const uniqueStrings = (values = []) => {
  const set = new Set();

  for (const value of values) {
    const normalized = normalizeUsername(value);
    if (normalized) {
      set.add(normalized);
    }
  }

  return Array.from(set);
};

const fetchRoleUsernames = async (pool, roles = []) => {
  const filteredRoles = roles.filter(isNonEmptyString).map((role) => role.trim());

  if (filteredRoles.length === 0) {
    return [];
  }

  const request = pool.request();
  const placeholders = [];

  filteredRoles.forEach((role, index) => {
    const param = `Role${index}`;
    request.input(param, role);
    placeholders.push(`@${param}`);
  });

  const query = `SELECT Username FROM Users WHERE Role IN (${placeholders.join(", ")})`;
  const result = await request.query(query);

  return uniqueStrings(result.recordset?.map((row) => row.Username) || []);
};

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
    const uniqueUsernames = uniqueStrings(usernames);
    if (uniqueUsernames.length === 0) {
      return [];
    }

    // Skip if the same notification already exists for a user (same request, type, and message)
    const lookup = pool.request();
    lookup.input("RequestID", requestId);
    lookup.input("Message", safeMessage);
    lookup.input("Type", type);

    const usernameParams = uniqueUsernames.map((username, index) => {
      const param = `Username${index}`;
      lookup.input(param, username);
      return `@${param}`;
    });

    const existingResult = await lookup.query(
      `SELECT Username
       FROM RequestNotifications
       WHERE RequestID = @RequestID
         AND Type = @Type
         AND Message = @Message
         AND Username IN (${usernameParams.join(", ")})`
    );

    const alreadyNotified = new Set(
      existingResult.recordset?.map((row) => row.Username) || []
    );

    const recipients = uniqueUsernames.filter(
      (username) => !alreadyNotified.has(username)
    );

    if (recipients.length === 0) {
      return [];
    }

    const inserted = [];

    for (const username of recipients) {
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
              AND NOT EXISTS (
                SELECT 1
                FROM RequestNotifications rn
                WHERE rn.RequestID = @RequestID
                  AND rn.Type = @Type
                  AND rn.Message = @Message
                  AND rn.Username = Users.Username
              )
            OUTPUT INSERTED.ID, INSERTED.RequestID, INSERTED.Username,
                   INSERTED.Message, INSERTED.Type, INSERTED.CreatedAt,
                   INSERTED.ReadAt`);

  return result.recordset;
};

export const dispatchNotificationEvent = async (
  pool,
  {
    requestId,
    message,
    type = "info",
    usernames,
    roles,
    excludeUsername,
    push,
  } = {}
) => {
  if (!pool || typeof pool.request !== "function") {
    throw new Error("A valid database connection pool is required.");
  }

  if (!requestId) {
    throw new Error("A requestId is required to create a notification.");
  }

  const stringMessage = isNonEmptyString(message)
    ? message.trim()
    : typeof message === "string"
    ? message
    : message === undefined || message === null
    ? ""
    : String(message);

  if (!isNonEmptyString(stringMessage)) {
    throw new Error("A message is required to create a notification.");
  }

  const audience = new Set(uniqueStrings(usernames));

  if (Array.isArray(roles) && roles.length > 0) {
    const roleUsernames = await fetchRoleUsernames(pool, roles);
    for (const username of roleUsernames) {
      audience.add(username);
    }
  }

  const excluded = normalizeUsername(excludeUsername);
  if (excluded) {
    audience.delete(excluded);
  }

  if (audience.size === 0 && !excluded) {
    throw new Error("No valid notification audience provided.");
  }

  const notificationPayload = {
    requestId,
    message: stringMessage,
    type,
  };

  if (audience.size > 0) {
    notificationPayload.usernames = Array.from(audience);
  } else if (excluded) {
    notificationPayload.excludeUsername = excluded;
  }

  const created = await createNotifications(pool, notificationPayload);

  let pushResults;

  if (push && typeof push === "object") {
    const payload = {
      title: push.title || "Import Tracker",
      body: push.body || stringMessage,
      data: { ...((push && push.data) || {}), requestId },
    };

    if (push.tag) {
      payload.tag = push.tag;
    }

    if (push.renotify !== undefined) {
      payload.renotify = push.renotify;
    }

    if (Array.isArray(push.actions)) {
      payload.actions = push.actions;
    }

    pushResults = await broadcastPushNotification(payload);
  }

  return { created, pushResults };
};
