self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// The registration scope is limited to /supreme. No authenticated pages,
// API responses, customer records, or session state are cached.
