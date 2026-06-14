"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { markFirstRunOrientationSeenAction } from "@/app/(protected)/orientation-actions";

export type OrientationVariant = "leader" | "over_shepherd";

// One shared orientation, role-aware only where Leader vs Over-Shepherd
// genuinely differ (#560) — which is just the body. Draft copy, approved at PR
// review.
const TITLE = "Welcome to your care space";

const BODY: Record<OrientationVariant, string> = {
  leader:
    "This is where you care for the group(s) you lead. Open Care notes or the calendar for a group from its card below.",
  over_shepherd:
    "This is where you oversee the Leaders you cover. Open a Leader to see how their care is going and where to follow up.",
};

// First-run welcome card (#560). One-time and dismissible: shown only when the
// server says the user hasn't dismissed it. "Got it" hides it optimistically
// and persists the dismissal server-side so it never returns on any device. It
// does not gate access — the surface is fully usable behind and after it.
export function FirstRunCard({ variant }: { variant: OrientationVariant }) {
  const [dismissed, setDismissed] = useState(false);
  const [pending, startTransition] = useTransition();

  if (dismissed) return null;

  const handleDismiss = () => {
    // Optimistically hide, then persist in the background. A failed write
    // leaves the flag unset, so the card simply reappears on a later load.
    setDismissed(true);
    startTransition(async () => {
      await markFirstRunOrientationSeenAction();
    });
  };

  return (
    <section
      aria-labelledby="first-run-heading"
      className="mb-4 max-w-card rounded-lg border border-sageSoft bg-sageTint p-card md:p-6"
    >
      <h2
        id="first-run-heading"
        className="m-0 mb-1.5 font-display text-lg font-medium text-ink"
      >
        {TITLE}
      </h2>
      <p className="m-0 mb-4 font-sans text-base text-ink2">{BODY[variant]}</p>
      <Button
        type="button"
        variant="primary"
        onClick={handleDismiss}
        disabled={pending}
      >
        Got it
      </Button>
    </section>
  );
}
