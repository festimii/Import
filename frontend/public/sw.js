self.addEventListener("push", (event) => {
  const data = event.data?.json() || {};
  const title = data.title || "New Notification";

  const options = {
    body: data.body || "",
    data: data.data || {},
    actions: data.actions || [],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  if (event.action === "open" && event.notification.data?.requestId) {
    event.waitUntil(
      clients.openWindow(`/requests/${event.notification.data.requestId}`)
    );
  } else {
    event.waitUntil(clients.openWindow("/"));
  }
});
