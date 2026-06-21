// The generalized redirect-and-return convention (#776 Phase 0, generalizing
// ADR 0027's `from=setup` marker). One surface hands a user off to a dedicated
// route (a Settings editor, a config tab) and gets them back to where they
// started. Today the live origin is `setup`; later phases register `groups`
// (manage group types) and `group-health` (edit a rubric from its badge) here.
//
// This is the single source of truth for the marker param, the typed origin
// keys, the return target each maps to, and the encode/decode helpers. The
// `<ReturnBanner>` component and the `lib/dashboard/setup-recovery` aliases read
// from it; nothing should re-spell `from=...` by hand.

// The query param that carries the origin marker on a destination URL.
export const RETURN_PARAM = "from";

// Closed union of return origins. Add a key here (with its config below) when a
// new redirect-and-return flow lands — keeping the set typed means a banner or
// reader can never reference an origin that has no return target.
export type ReturnOrigin = "setup";

type ReturnOriginConfig = {
  // The marker value written as `from=<value>` (kept distinct from the key so a
  // key can be renamed without breaking live URLs).
  value: string;
  // Where the "← Back …" affordance routes, carrying the marker through so the
  // destination (e.g. Home) knows it is a return, not a fresh visit.
  returnHref: string;
  // The affordance text rendered by `<ReturnBanner>`.
  label: string;
};

const RETURN_ORIGINS: Record<ReturnOrigin, ReturnOriginConfig> = {
  setup: {
    value: "setup",
    returnHref: `/admin?${RETURN_PARAM}=setup`,
    label: "← Back to setup",
  },
};

export function returnOriginConfig(origin: ReturnOrigin): ReturnOriginConfig {
  return RETURN_ORIGINS[origin];
}

// Read a route's resolved `from` value (string | string[] | undefined) and test
// whether it marks the given origin. Generalizes ADR 0027's `isFromSetup`.
export function isReturning(
  origin: ReturnOrigin,
  value: string | string[] | undefined
): boolean {
  const first = Array.isArray(value) ? value[0] : value;
  return first === RETURN_ORIGINS[origin].value;
}

// Decorate a destination href with the origin marker, preserving an existing
// query string and fragment (e.g. `/admin/settings?tab=system#people-import` →
// `/admin/settings?tab=system&from=setup#people-import`). Generalizes ADR
// 0027's `withFromSetup`.
export function decorateReturn(href: string, origin: ReturnOrigin): string {
  const [path, hash] = href.split("#");
  const separator = path.includes("?") ? "&" : "?";
  const withMarker = `${path}${separator}${RETURN_PARAM}=${RETURN_ORIGINS[origin].value}`;
  return hash ? `${withMarker}#${hash}` : withMarker;
}
