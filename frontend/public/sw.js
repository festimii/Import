const FALLBACK_ICON = "/vite.svg";
const FALLBACK_BADGE = "/vite.svg";

const buildTargetUrl = (notificationData = {}) => {
  if (notificationData.url) {
    return notificationData.url;
  }

  if (notificationData.requestId) {
    return `/requests/${notificationData.requestId}`;
  }

  return "/";
};

self.addEventListener("push", (event) => {
  const data = event.data?.json() || {};
  const title = data.title || "New Notification";

  const options = {
    body: data.body || "",
    data: data.data || {},
    actions: data.actions || [],
    badge: data.badge || FALLBACK_BADGE,
    icon: data.icon || FALLBACK_ICON,
    vibrate: data.vibrate || [100, 50, 100],
    requireInteraction:
      typeof data.requireInteraction === "boolean"
        ? data.requireInteraction
        : false,
    tag: data.tag || `import-tracker-${Date.now()}`,
    renotify: data.renotify ?? true,
    timestamp: Date.now(),
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = buildTargetUrl(event.notification.data);

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          const destination = new URL(targetUrl, self.location.origin).href;

          if (client.url === destination && "focus" in client) {
            return client.focus();
          }

          if ("navigate" in client) {
            client.navigate(destination);
            return client.focus();
          }
        }

        if (clients.openWindow) {
          return clients.openWindow(targetUrl);
        }

        return undefined;
      })
  );
});
