// Minimal service worker for installability only (no offline caching).
//
// Chrome/Edge require a registered service worker with a fetch handler before
// they treat the app as installable and fire `beforeinstallprompt`. This worker
// deliberately does NOT cache anything: the in-app OfflineBanner already covers
// the offline experience, and a cache here would risk serving stale data in an
// admin tool. The fetch handler is a transparent network passthrough.

self.addEventListener("install", () => {
  // Activate immediately so a first-time visitor becomes installable without a
  // reload.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", () => {
  // Network-only: by not calling event.respondWith, the browser performs its
  // default fetch. The empty handler is enough to satisfy the install check.
});
