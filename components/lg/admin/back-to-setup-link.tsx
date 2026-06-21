import Link from "next/link";
import { isReturning, returnOriginConfig } from "@/lib/nav/return-to";

// ADR 0027: the reusable "← Back to setup" affordance. Setup deep-links from
// Home's checklist carry `?from=setup`; the surfaces they land on render this so
// the admin can return to the guided chain (Home then re-focuses the next
// incomplete step). Returning carries the marker through so Home knows it's a
// setup return, not a normal Home visit.
//
// This is the `setup` specialization of the generalized `returnTo` convention
// (#776, `lib/nav/return-to.ts`); `isFromSetup` centralizes reading the marker
// out of a route's resolved searchParams (string | string[] | undefined) so
// each page does not re-spell it.
export function isFromSetup(value: string | string[] | undefined): boolean {
  return isReturning("setup", value);
}

export function BackToSetupLink({ className }: { className?: string }) {
  const { returnHref, label } = returnOriginConfig("setup");
  return (
    <Link
      href={returnHref}
      className={
        className ??
        "w-fit font-sans text-xs font-semibold text-ink2 no-underline transition-colors duration-150 hover:text-ink"
      }
    >
      {label}
    </Link>
  );
}
