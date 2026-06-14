// Defense-in-depth HTTP security headers, applied to every response by
// `next.config.ts`'s `headers()` block. RLS is the real access boundary; these
// headers are the belt-and-braces layer at the HTTP edge (clickjacking,
// MIME-sniffing, referrer leak, transport downgrade) for an app that handles
// sensitive pastoral-care data.
//
// The Content-Security-Policy here is intentionally **report-only**: it is
// emitted as `Content-Security-Policy-Report-Only` so violations are reported
// (browser console) without blocking anything. Flipping CSP to enforcing — and
// choosing strict (nonce-based) vs pragmatic — is a separate, deliberate
// decision (see docs/REPO_SWEEP_PLAN.md §8 Q1) and is out of scope here. The
// builder is split out from next.config so its values are unit-testable.

export type HttpHeader = { key: string; value: string };

// The third parties the app actually talks to, so the report-only CSP doesn't
// flag legitimate traffic:
//   - the Supabase origin (REST + Realtime websocket) — derived at config time
//   - Vercel Analytics / Speed Insights (script host + vitals beacon)
const VERCEL_SCRIPT_ORIGIN = "https://va.vercel-scripts.com";
const VERCEL_VITALS_ORIGIN = "https://vitals.vercel-insights.com";

/**
 * Resolve the Supabase project origin (scheme + host) from the same env vars the
 * server client reads, so the CSP `connect-src` can allowlist its REST and
 * Realtime endpoints. Returns null when Supabase isn't configured (e.g. public
 * preview / CI builds) — the CSP then simply omits the Supabase entries.
 */
export function getSupabaseOrigin(): string | null {
  const url =
    process.env.SUPABASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/**
 * Build the report-only Content-Security-Policy string. `'unsafe-inline'` /
 * `'unsafe-eval'` are accepted for v1 (Next ships inline styles and a dev-time
 * eval runtime); a future enforcing policy can tighten these via nonces.
 */
export function buildContentSecurityPolicy(
  supabaseOrigin: string | null = getSupabaseOrigin()
): string {
  const supabaseConnect = supabaseOrigin
    ? [supabaseOrigin, supabaseOrigin.replace(/^https:/i, "wss:")]
    : [];

  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "base-uri": ["'self'"],
    "object-src": ["'none'"],
    "frame-ancestors": ["'none'"],
    "form-action": ["'self'"],
    "img-src": ["'self'", "data:", "blob:"],
    "font-src": ["'self'", "data:"],
    "style-src": ["'self'", "'unsafe-inline'"],
    "script-src": [
      "'self'",
      "'unsafe-inline'",
      "'unsafe-eval'",
      VERCEL_SCRIPT_ORIGIN,
    ],
    "connect-src": [
      "'self'",
      ...supabaseConnect,
      VERCEL_SCRIPT_ORIGIN,
      VERCEL_VITALS_ORIGIN,
    ],
  };

  return Object.entries(directives)
    .map(([directive, values]) => `${directive} ${values.join(" ")}`)
    .join("; ");
}

/**
 * The full security header set applied to every route. CSP is report-only.
 */
export function buildSecurityHeaders(
  supabaseOrigin: string | null = getSupabaseOrigin()
): HttpHeader[] {
  return [
    {
      key: "Strict-Transport-Security",
      value: "max-age=63072000; includeSubDomains; preload",
    },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
    },
    {
      key: "Content-Security-Policy-Report-Only",
      value: buildContentSecurityPolicy(supabaseOrigin),
    },
  ];
}
