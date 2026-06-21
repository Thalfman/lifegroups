"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  RETURN_PARAM,
  isReturning,
  resolveReturnHref,
  returnOriginConfig,
  type ReturnOrigin,
} from "@/lib/nav/return-to";

// The generalized, self-gating return affordance (#776 Phase 0, generalizing
// ADR 0027's `BackToSetupLink` / the orphaned `GroupsReturnBanner`). A surface
// reached via a `from=<origin>` redirect renders this so the user can step back
// to where they came from; on a normal (non-return) visit it reads the marker
// and renders nothing. The label + return target come from the origin's config
// in `lib/nav/return-to.ts`, so callers only name the origin.
export function ReturnBanner({
  originKey,
  className,
}: {
  originKey: ReturnOrigin;
  className?: string;
}) {
  const params = useSearchParams();
  if (!isReturning(originKey, params.get(RETURN_PARAM) ?? undefined)) {
    return null;
  }
  // Resolve the return href against the arriving URL — dynamic origins (e.g.
  // group-health) build it from a param like `?group=<id>`.
  const returnHref = resolveReturnHref(originKey, params);
  const { label } = returnOriginConfig(originKey);
  return (
    <Link
      href={returnHref}
      className={
        className ??
        "w-fit font-sans text-sm font-semibold text-ink2 no-underline transition-colors duration-150 hover:text-ink"
      }
    >
      {label}
    </Link>
  );
}
