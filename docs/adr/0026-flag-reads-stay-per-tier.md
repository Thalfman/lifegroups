# ADR 0026: Feature-flag reads stay per-tier; no unified flag facade

**Status:** Accepted
**Date:** 2026-06-11

## Context

An architecture review (2026-06-11) flagged the feature-flag read side as a
deepening candidate: flag resolution is reachable through differently-shaped
seams (the admin-readable `admin_read_feature_flags` config map feeding the
pure `resolveFlag` / `resolveHiddenNav`, versus the leader-safe
`read_frozen_surface_flag(p_key)` RPC returning a single resolved boolean),
and the code-level nav default ("all hidden") differs from the seeded default
(Groups/People on, ADR 0024). It proposed one flag facade per tier with an
explicit allowlist, and a single authoritative default.

## Decision

**Keep the per-tier flag reads as they are.** No unified facade, no merged
default.

## Why

- **The split is an RLS boundary, not duplication.** The admin path may see
  the whole flag map (the RPC gates on `auth_is_admin()`); the leader path may
  only ever learn one resolved frozen-surface boolean (the leader-safe RPC
  resolves enabled AND verified server-side and refuses every other key). A
  facade that unifies them would either widen what a leader context can ask
  for or re-implement the RPC's allowlist in TypeScript — the database is the
  right home for that guarantee (ADR 0009).
- **The resolution rule already has one home.** `resolveFlag` /
  `resolveHiddenNav` in `lib/admin/feature-flags.ts` are pure and shared by
  every admin consumer (`lib/nav/hidden-nav.ts`, the admin page, the console).
  The proposed facade would be a pass-through over them — the deletion test
  fails.
- **The dual default is deliberate fail-safety, not drift.** Code default
  (no config readable) hides all nav-visibility tabs — a read failure falls
  back to the pivot spine. The seed (ADR 0024, `20260701020000`) turns
  Groups/People on as _data_. Absence of data and seeded data are different
  states and should resolve differently. The seed shape and the flag-key ↔
  area mapping are each pinned by tests
  (`lib/admin/__tests__/default-on-flags-migration.test.ts`, the nav drift
  test), so neither can silently diverge.

## Revisit if

A third tier needs its own flag read (the per-tier RPC pattern stops scaling),
or a leader-context caller legitimately needs a non-frozen-surface flag — at
which point the allowlist question must be re-decided in SQL, not TS.
