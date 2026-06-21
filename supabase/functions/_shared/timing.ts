// Shared latency-padding helper for the invite edge functions (audit SEC-3).
//
// Both invite functions reach branches whose wall-clock latency depends on
// whether an email is already known: `invite-user` (super-admin gated) and the
// PUBLIC `redeem-invite` self-signup flow. The "already registered" branch is a
// single indexed lookup; the "new email" branch runs a paginated `listUsers`
// scan and an auth-user create. Without padding, a caller can distinguish the
// two by response time — an email-enumeration timing oracle. `padToFloor` levels
// every branch (success AND early-return) to the same floor + jitter so the
// elapsed time leaks nothing.
//
// `performance.now()` is available in the Deno edge runtime. This lives under
// `functions/_shared/` (the standard Supabase convention) so both functions
// import the SAME implementation — a fix to the floor or jitter can't drift
// between them. Relative imports within `functions/` bundle correctly; only the
// Next.js workspace (`@/lib/*`) is unreachable from Deno.

// Floor dominates observed p99 `listUsers` latency on tenants up to ~10k auth
// users; the jitter window adds 250–650ms of noise on top, so the total elapsed
// at the padded point settles in ~1450–1850ms regardless of which branch ran.
export const INVITE_TIMING_FLOOR_MS = 1200;

export function jitterMs(): number {
  return 250 + Math.floor(Math.random() * 400);
}

// Sleep until `floorMs` (plus jitter) has elapsed since `startMs`. A no-op when
// the work already took longer than the floor.
export async function padToFloor(
  startMs: number,
  floorMs: number
): Promise<void> {
  const elapsed = performance.now() - startMs;
  const remaining = floorMs - elapsed + jitterMs();
  if (remaining > 0) {
    await new Promise<void>((r) => setTimeout(r, remaining));
  }
}
