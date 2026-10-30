self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// The Supreme workspace contains sensitive business/customer data.
// Never cache authenticated pages, API responses, or private records.
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/supreme") || url.pathname.startsWith("/admin") || url.pathname.startsWith("/api")) {
    event.respondWith(fetch(event.request, { cache: "no-store" }));
  }
});
