// public/sw.js
self.addEventListener("push", (event) => {
  const data = event.data?.json() || {};
  const title = data.title || "New Notification";
  const options = {
    body: data.body || "",
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow("/"));
});
