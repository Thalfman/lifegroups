"use client";

import { useSearchParams } from "next/navigation";
import { BackToSetupLink } from "@/components/lg/admin/back-to-setup-link";
import {
  FROM_SETUP_PARAM,
  FROM_SETUP_VALUE,
} from "@/lib/dashboard/setup-recovery";

// ADR 0027: a self-gating "← Back to setup" affordance for surfaces deep inside
// a client tree where the page can't pass `fromSetup` down cheaply — notably the
// Super-Admin console's People-import panel, whose hash handler scrolls past any
// page-top link. Rendered AT the anchored target so the return path stays
// visible in the setup-import flow. Reads the marker itself via useSearchParams
// and renders nothing on a normal (non-setup) visit.
export function SetupReturnBanner({ className }: { className?: string }) {
  const params = useSearchParams();
  if (params.get(FROM_SETUP_PARAM) !== FROM_SETUP_VALUE) return null;
  return (
    <BackToSetupLink
      className={
        className ??
        "w-fit font-sans text-sm font-semibold text-ink2 no-underline hover:text-ink"
      }
    />
  );
}
