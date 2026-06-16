import Link from "next/link";
import {
  FROM_SETUP_PARAM,
  FROM_SETUP_VALUE,
} from "@/lib/dashboard/setup-recovery";

// ADR 0027: the reusable "← Back to setup" affordance. Setup deep-links from
// Home's checklist carry `?from=setup`; the surfaces they land on render this so
// the admin can return to the guided chain (Home then re-focuses the next
// incomplete step). Returning carries the marker through so Home knows it's a
// setup return, not a normal Home visit.
//
// `isFromSetup` centralizes reading the marker out of a route's resolved
// searchParams (string | string[] | undefined), so each page does not re-spell it.
export function isFromSetup(value: string | string[] | undefined): boolean {
  return (Array.isArray(value) ? value[0] : value) === FROM_SETUP_VALUE;
}

export function BackToSetupLink({ className }: { className?: string }) {
  return (
    <Link
      href={`/admin?${FROM_SETUP_PARAM}=${FROM_SETUP_VALUE}`}
      className={
        className ??
        "w-fit font-sans text-xs font-semibold text-ink2 no-underline transition-colors duration-150 hover:text-ink"
      }
    >
      ← Back to setup
    </Link>
  );
}
