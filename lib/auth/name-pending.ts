import type { SessionResult } from "./session";

// Choose-your-name gate (ADR 0032). An invited person normally picks their
// name on /reset-password alongside their password, but two paths skip that
// screen: an invite to an email that already had a login (no setup email is
// sent), and an abandoned setup. This helper is the post-sign-in net: both
// chokepoints — app/(protected)/layout.tsx and the Home Hub (app/page.tsx,
// which lives outside the protected group) — redirect to /welcome while the
// session's profile name is still pending.
//
// Kept free of Next.js imports so the decision logic stays pure and
// unit-testable; callers do the redirect.
export function namePendingRedirectTarget(
  session: SessionResult
): "/welcome" | null {
  if (session.kind !== "authenticated") return null;
  return session.profile.full_name_pending ? "/welcome" : null;
}
