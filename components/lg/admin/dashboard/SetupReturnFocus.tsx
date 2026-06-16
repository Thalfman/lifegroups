"use client";

import { useEffect } from "react";

// ADR 0027: when an admin returns to Home from a setup deep-link (the target
// surface's "← Back to setup" affordance links to /admin?from=setup), Home
// re-focuses the next incomplete setup step so they never lose their place in
// the guided chain. The checklist marks that step's element with `targetId`; this
// tiny client effect moves focus + scroll to it on mount when `active`.
//
// Kept as a one-shot mount effect (not a router-event listener) because the
// arrival is a full navigation to Home — the component mounts fresh each time.
export function SetupReturnFocus({
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
