"use client";

import { useEffect } from "react";

export default function ServiceWorkerRegister({ privatePath }: { privatePath: string }) {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || !window.isSecureContext) return;

    void navigator.serviceWorker
      .register("/supreme-worker.js", { scope: privatePath, updateViaCache: "none" })
      .catch((error: unknown) => {
        console.error("NEWEIX Supreme service worker registration failed:", error);
      });
  }, []);

  return null;
}
