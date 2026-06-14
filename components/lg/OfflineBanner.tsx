"use client";

import { useEffect, useState } from "react";

// App-like offline indicator (#559). Watches the browser's online/offline
// events and shows a calm, branded strip while the connection is down, instead
// of letting an installed PWA / native shell surface a bare browser error. No
// service worker and no offline data sync — this only reflects connectivity.
//
// `initialOffline` exists for the a11y harness to render the visible state for
// axe; in the app it defaults to false and the effect reconciles it with the
// real `navigator.onLine` on mount.
export function OfflineBanner({
  initialOffline = false,
}: {
  initialOffline?: boolean;
}) {
  const [offline, setOffline] = useState(initialOffline);

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
