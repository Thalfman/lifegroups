"use client";

import { useEffect, useState } from "react";

// The branded offline strip — visual only, no connectivity logic. Rendered by
// OfflineBanner when offline, and directly by the a11y harness to exercise the
// visible state for axe (so the shipped component needs no test-only prop).
export function OfflineBannerView() {
  return (
    <div
      role="status"
      className="sticky top-0 z-toast flex items-center justify-center gap-2 border-b border-clay bg-claySoft px-4 py-2 text-center font-sans text-sm font-medium text-clayDeep"
    >
      You&rsquo;re offline. Some things may not work until your connection
      returns.
    </div>
  );
}

// App-like offline indicator (#559). Watches the browser's online/offline
// events and shows the branded strip while the connection is down, instead of
// letting an installed PWA / native shell surface a bare browser error. No
// service worker and no offline data sync — this only reflects connectivity.
export function OfflineBanner() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  if (!offline) return null;
  return <OfflineBannerView />;
}
