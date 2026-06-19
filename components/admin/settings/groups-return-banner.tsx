"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

// A self-gating "← Back to the Interest Funnel" affordance for Settings › Groups.
// The Plan Add-Prospect form's "+ Add a group type" shortcut deep-links here with
// `?from=plan`; this renders the return path so the admin can step back to the
// funnel (where their half-filled prospect is restored). It reads the marker
// itself and renders nothing on a normal (non-Plan) visit — mirroring
// SetupReturnBanner's pattern.
export function GroupsReturnBanner() {
  const params = useSearchParams();
  if (params.get("from") !== "plan") return null;
  return (
    <Link
      href="/admin/plan"
      className="w-fit font-sans text-sm font-semibold text-ink2 no-underline transition-colors duration-150 hover:text-ink"
    >
      ← Back to the Interest Funnel
    </Link>
  );
}
