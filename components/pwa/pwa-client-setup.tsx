"use client";

import { useEffect } from "react";
import { startInstallPromptCapture } from "@/lib/pwa/install-prompt-store";

// App-wide PWA client setup, mounted once from the root layout. It does two
// things, in order:
//
//  1. Starts capturing the install lifecycle (`beforeinstallprompt` /
//     `appinstalled`) BEFORE registering the service worker, so the one-shot
//     install event is stashed even when it fires on a page that doesn't mount
//     the Add-to-Home-Screen button (e.g. /login, before the post-login soft
//     redirect into a home page).
//  2. Registers the minimal service worker (public/sw.js). The worker does no
//     caching — the OfflineBanner already owns the offline UX; its only job is
//     to satisfy the browser's installability check so `beforeinstallprompt`
//     fires at all.
//
// Renders nothing.
export function PwaClientSetup() {
  useEffect(() => {
    startInstallPromptCapture();

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
