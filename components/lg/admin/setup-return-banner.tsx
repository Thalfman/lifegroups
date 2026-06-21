"use client";

import { ReturnBanner } from "@/components/lg/admin/return-banner";

// ADR 0027: a self-gating "← Back to setup" affordance for surfaces deep inside
// a client tree where the page can't pass `fromSetup` down cheaply — notably the
// Super-Admin console's People-import panel, whose hash handler scrolls past any
// page-top link. Rendered AT the anchored target so the return path stays
// visible in the setup-import flow.
//
// Now a thin `setup` specialization of the generalized `<ReturnBanner>` (#776);
// the generic banner reads the marker itself and renders nothing on a normal
// (non-setup) visit.
export function SetupReturnBanner({ className }: { className?: string }) {
  return (
    <ReturnBanner
      originKey="setup"
      className={
        className ??
        "w-fit font-sans text-sm font-semibold text-ink2 no-underline hover:text-ink"
      }
    />
  );
}
