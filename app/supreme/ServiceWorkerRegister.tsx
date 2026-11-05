"use client";

import { useEffect } from "react";

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || !window.isSecureContext) return;

    void navigator.serviceWorker
      .register("/supreme/sw.js", { scope: "/supreme/", updateViaCache: "none" })
      .catch((error: unknown) => {
        console.error("NEWEIX Supreme service worker registration failed:", error);
      });
  }, []);

  return null;
}
