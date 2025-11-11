// src/notifications.js
const resolveBackendUrl = () => {
  if (typeof import.meta !== "undefined" && import.meta.env) {
    const { VITE_BACKEND_URL, VITE_API_BASE_URL } = import.meta.env;
    const candidates = [VITE_BACKEND_URL, VITE_API_BASE_URL]
      .filter(Boolean)
      .map((value) => value.replace(/\/$/, ""))
      .map((value) => value.replace(/\/api$/, ""));

    if (candidates.length > 0) {
      return candidates[0];
    }
  }

  return "http://192.168.100.35:5000";
};

const BACKEND_URL = resolveBackendUrl();

export function isPushSupported() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export async function registerServiceWorker() {
  if (!isPushSupported()) {
    throw new Error("Push notifications are not supported in this browser");
  }

  const reg = await navigator.serviceWorker.register("/sw.js");
  console.log("✅ Service Worker registered:", reg);
  return reg;
}

export async function askNotificationPermission() {
  if (!isPushSupported()) {
    throw new Error("Push notifications are not supported in this browser");
  }

  if (Notification.permission === "granted") {
    return "granted";
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Notification permission denied");
  }
  console.log("✅ Notification permission granted");
  return permission;
}

export async function subscribeUserToPush(registration) {
  const existingSubscription = await registration.pushManager.getSubscription();
  if (existingSubscription) {
    console.log("ℹ️ Existing push subscription found");
    return existingSubscription;
  }

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
  return subscription;
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

export async function enablePushNotifications() {
  if (!isPushSupported()) {
    throw new Error("Push notifications are not supported in this browser");
  }

  const registration = await registerServiceWorker();
  await askNotificationPermission();

  await subscribeUserToPush(registration);
  return registration;
}
