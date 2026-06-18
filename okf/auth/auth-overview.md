---
type: Auth
title: Auth & Permissions Overview
description: Supabase Auth sessions, the role oversight ladder, redirect vs result guards, route/RPC protection, and the leader-surface flag.
resource: repo://lib/auth/session.ts
tags: [auth, authorization, roles, rls, sessions, supabase-auth]
timestamp: 2026-06-18T00:00:00Z
---

# Purpose

Authorization is the heart of this app. Roles form a strict downward-visibility
ladder enforced at three layers (route guards, action guards, RLS/RPC). Misplace
a guard and you breach the ladder or leak private notes.

# Source of truth

- `lib/auth/session.ts` (~443), `lib/auth/roles.ts` (~308)
- `lib/auth/password-setup.ts`, `lib/supabase/middleware.ts`
- `app/login/actions.ts`, `app/reset-password/actions.ts`, `app/auth/confirm/route.ts`
- `app/welcome/actions.ts`, `app/invite/[token]/actions.ts`
- RLS helpers: `supabase/migrations/20260518000000_phase4_rls.sql`

# Key details

## Auth backend

Supabase Auth (GoTrue) with `@supabase/ssr` cookie sessions. `proxy.ts` →
`updateSupabaseSession()` refreshes cookies each request via `getClaims()`
(local JWT verify). Clients return `null` when env vars are missing (demo mode).

## The oversight ladder

**Super Admin (Tom) ▸ Ministry Admin (Julian) ▸ Over-Shepherd ▸ Leader/Co-Leader.**
Each tier sees what the tier below sees, plus more. App-login role lives on
`profiles.role`. `member` is **not** an app-login role. `staff_viewer` is
deprecated (routed to `/unauthorized`).

## Session resolution

`getCurrentSession()` (memoized per request) returns a `SessionResult`
discriminated union: `anonymous`, `authenticated` (authUser + profile +
assignedGroupIds), `profile_missing`, `backend_error` (stage +
message). Uses `getUser()` (validates against auth server, catches revoked
users). Loads active `group_leaders` rows for leader scoping. `isProfilesRow`
validates the row against `types/` enums (trust boundary).

## Two guard families

- **Redirect-guards** (pages): `requireRole(allowed)`, `requireAdmin`,
  `requireSuperAdmin`, `requireOverShepherd`, `requireLeader` — redirect to
  `/login` or `/unauthorized`. `requireLeader` also checks the `leader_surface`
  frozen flag.
- **Result-returning guards** (actions): `requireAdminSession`,
  `requireSuperAdminSession`, `requireOverShepherdSession`, `requireLeaderActor`,
  `requireOverShepherdOrAdminSession` — return `{ ok, session } | { ok: false,
error }`. `resolveGuardVerdict` checks: session kind → status active → role in
  allowed set → (optional) leader_surface live.

## Three-layer authorization

1. Page redirect-guard (role gate)
2. Action result-guard + optional business guard (e.g., group assignment)
3. RPC `SECURITY DEFINER` re-check + RLS — **authoritative**

## Auth flows

- **Login:** `loginAction` → `signInWithPassword` → profile lookup → status
  check → redirect to `defaultLandingPathForRole(role)`. Generic "Invalid email
  or password" only (passwords never logged).
- **Reset/invite:** email link → POST `/auth/confirm` (`verifyOtp` or
  `exchangeCodeForSession`) → sets `PW_SETUP_COOKIE` → `/reset-password` →
  `resetPasswordAction` updates password + optionally name, clears cookie.
- **Self-signup:** `/invite/[token]` → `redeemInviteAction` → Edge Function
  `redeem-invite`.
- **Choose-your-name (ADR 0025):** name-pending → `/welcome` → `chooseNameAction`.

## leader_surface flag

Leader login is gated by the `leader_surface` feature flag — **on by default**
(ADR 0024) but the Super-Admin console can re-freeze it (leaders then land on
`/unauthorized`). Check-ins are a separate `check_ins` gate.

# Relationships

- [/okf/architecture/request-lifecycle.md](/okf/architecture/request-lifecycle.md)
- [/okf/data/index.md](/okf/data/index.md) (RLS helpers + policies)
- [/okf/routes/index.md](/okf/routes/index.md)
- [/okf/config/environment.md](/okf/config/environment.md) (feature flags)
- [/okf/runbooks/index.md](/okf/runbooks/index.md) (auth issues)

# Gotchas

- Deactivated accounts (`status≠active`) get NULL from `auth_profile_id()` → RLS
  denies them even with a valid session.
- Over-shepherd identity is bridged by **email** (`auth_over_shepherd_id()`
  requires exactly one active match; 0 or >1 → NULL, no guessing).
- No hardcoded Julian/Tom UUIDs/emails anywhere — fitness test
  `no-hardcoded-identity` enforces it.
- The password-setup cookie pins invite/recovery sessions to the password
  screen until `resetPasswordAction` clears it.

# Citations

- `lib/auth/session.ts:20-267`
- `lib/auth/roles.ts:1-307`
- `supabase/migrations/20260518000000_phase4_rls.sql:17-94`
- `app/login/actions.ts:21-171`
