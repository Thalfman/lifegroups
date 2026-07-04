"use client";

import { useLinkStatus } from "next/link";
import { cn } from "@/lib/utils";

// Instant per-link feedback. Rendered as a child of a sidebar <Link>,
// useLinkStatus() reports the pending state of *that* link between click and
// navigation commit — so the clicked item shows a spinner immediately, before
// the route-level skeleton even paints. No prop drilling: each indicator tracks
// its nearest ancestor <Link>.
export function NavLinkStatus() {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden="true"
      className={cn(
        "ml-auto h-[13px] w-[13px] shrink-0 rounded-pill border-[1.5px] border-line border-t-sageDeep transition-opacity duration-[120ms] ease-in-out",
        pending
          ? "animate-[lg-spin_0.6s_linear_infinite] opacity-100"
          : "opacity-0"
      )}
    />
  );
}
