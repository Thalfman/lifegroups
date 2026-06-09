"use client";

// Phase USAGE.1: a render-nothing client beacon that records which top-level
// area a user opens. Mounted once in the protected layout, it watches the
// pathname and fires the recordAreaView server action whenever the derived area
// changes — deduped so sub-navigation within one area (e.g. /admin/care →
// /admin/care/123) doesn't re-log the same area.
//
// It is intentionally fire-and-forget: the server action no-ops when the
// usage_tracking flag is off or there is no active profile, so the beacon is a
// safe no-op until a Super Admin turns tracking on.

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { usageAreaForPathname } from "@/lib/usage/areas";
import { recordAreaView } from "@/lib/usage/actions";

export function UsageBeacon() {
  const pathname = usePathname();
  const lastArea = useRef<string | null>(null);

  useEffect(() => {
    const area = usageAreaForPathname(pathname);
    if (!area || area === lastArea.current) return;
    lastArea.current = area;
    void recordAreaView(area);
  }, [pathname]);

  return null;
}
