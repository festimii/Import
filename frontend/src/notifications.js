// src/notifications.js
const BACKEND_URL = "http://localhost:5000"; // backend base URL

export async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    throw new Error("Service workers not supported in this browser");
  }

  const reg = await navigator.serviceWorker.register("/sw.js");
  console.log("✅ Service Worker registered:", reg);
  return reg;
}

export async function askNotificationPermission() {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Notification permission denied");
  }
  console.log("✅ Notification permission granted");
}

export async function subscribeUserToPush(registration) {
  // 1️⃣ Fetch the VAPID public key from backend
  const keyResponse = await fetch(
    `${BACKEND_URL}/api/notifications/public-key`
  );
  if (!keyResponse.ok) throw new Error("Failed to get public key");
  const { publicKey } = await keyResponse.json();

  // 2️⃣ Convert the VAPID key
  const convertedKey = urlBase64ToUint8Array(publicKey);

  // 3️⃣ Subscribe the user
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: convertedKey,
  });

  // 4️⃣ Send subscription to backend
  const resp = await fetch(`${BACKEND_URL}/api/notifications/subscribe`, {
    method: "POST",
    body: JSON.stringify(subscription),
    headers: { "Content-Type": "application/json" },
  });

  if (!resp.ok) {
    throw new Error(`Subscription failed with status ${resp.status}`);
  }

  console.log("✅ Push subscription sent to backend");
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i)
    outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}
