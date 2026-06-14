"use client";

import { useEffect } from "react";

// Registers the minimal service worker (public/sw.js) on mount. The worker
// itself does no caching — the OfflineBanner already owns the offline UX and an
// admin tool shouldn't risk serving stale data. Its only job is to satisfy the
// browser's installability check so Chrome/Edge fire `beforeinstallprompt`,
// which the Add-to-Home-Screen button listens for. Renders nothing.
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }
    // Register after load so it never competes with first paint.
    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Best-effort: a failed registration only means no native install
        // prompt; the app and the iOS guided path are unaffected.
      });
    };
    if (document.readyState === "complete") {
      register();
      return;
    }
    window.addEventListener("load", register);
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
