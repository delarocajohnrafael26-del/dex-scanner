// Service worker for web/WebView notifications (e.g. webintoapp APKs).
// Keeps a list of scheduled expiry notifications and fires them at the right
// time, even when the page is in the background — as long as the OS keeps
// the service worker / WebView alive.

const CACHE = "dexscanner-notif-v1";
let timers = [];

self.addEventListener("install", (e) => {
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(self.clients.claim());
});

function clearTimers() {
  timers.forEach((t) => clearTimeout(t));
  timers = [];
}

function scheduleOne(n) {
  const delay = Math.max(0, n.at - Date.now());
  const id = setTimeout(() => {
    self.registration.showNotification(n.title, {
      body: n.body,
      tag: n.tag,
      icon: "/placeholder.svg",
      badge: "/placeholder.svg",
      requireInteraction: true,
      data: n.data || {},
    });
  }, delay);
  timers.push(id);
}

self.addEventListener("message", (event) => {
  const msg = event.data || {};
  if (msg.type === "SCHEDULE_NOTIFICATIONS") {
    clearTimers();
    (msg.notifications || []).forEach(scheduleOne);
  }
  if (msg.type === "SHOW_NOW") {
    const n = msg.notification;
    self.registration.showNotification(n.title, {
      body: n.body,
      tag: n.tag,
      icon: "/placeholder.svg",
      badge: "/placeholder.svg",
      requireInteraction: true,
      data: n.data || {},
    });
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((cs) => {
      for (const c of cs) {
        if ("focus" in c) return c.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow("/alerts");
    })
  );
});

// Periodic background sync (Chromium-based WebViews only).
self.addEventListener("periodicsync", (event) => {
  if (event.tag === "expiry-check") {
    event.waitUntil(
      self.clients.matchAll().then((cs) => {
        cs.forEach((c) => c.postMessage({ type: "RUN_SYNC" }));
      })
    );
  }
});
