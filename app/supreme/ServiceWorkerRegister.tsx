"use client";

import { useEffect } from "react";

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator && window.isSecureContext) {
      void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((error) => {
        console.error("Supreme PWA service worker registration failed:", error);
      });
    }
  }, []);

  return null;
}
