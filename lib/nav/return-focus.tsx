"use client";

import { useEffect } from "react";

// The generalized scroll + focus restoration helper for redirect-and-return
// flows (#776 Phase 0, generalizing ADR 0027's `SetupReturnFocus`). When a user
// lands back on the origin route after a `from=<origin>` round-trip, the origin
// marks the element to restore with `targetId`; this one-shot mount effect
// scrolls it into view and focuses it when `active`.
//
// Kept as a mount effect (not a router-event listener) because the arrival is a
// full navigation — the component mounts fresh each time.
export function ReturnFocus({
  targetId,
  active,
}: {
  targetId: string;
  active: boolean;
}) {
  useEffect(() => {
    if (!active) return;
    const el = document.getElementById(targetId);
    if (!el) return;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    // Focus without a second scroll jump; the smooth scroll above handles it.
    el.focus({ preventScroll: true });
  }, [targetId, active]);

  return null;
}
