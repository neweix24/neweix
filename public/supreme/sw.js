self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Deliberately do not cache Supreme pages, APIs, customer records, or sessions.
// This worker only enables the scoped installable app shell.
