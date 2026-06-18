---
type: Route
title: Routes & Pages Map
description: The full user-facing route table with role gates, the (protected) route group, and the thin-page + shell convention.
resource: repo://app
tags: [routes, pages, app-router, role-gates, nav]
timestamp: 2026-06-18T00:00:00Z
---

# Purpose

Where every surface lives, who can reach it, and which are hidden-but-resolvable.
Needed before adding a route, changing a role gate, or debugging a redirect.

# Source of truth

- `app/(protected)/layout.tsx`, `app/(protected)/admin/layout.tsx`
- `lib/auth/roles.ts` (`navItemsForRole`, `ADMIN_AREAS`, `defaultLandingPathForRole`)
- `README.md` (Routes section), `docs/architecture/ARCHITECTURE.md`

# Key details

## Route group gating

`app/(protected)/` wraps all signed-in surfaces. Its layout calls
`getCurrentSession()` and redirects: anonymous → `/login`, `profile_missing` →
`/unauthorized`, `backend_error` → `/unauthorized?reason=unavailable`,
name-pending (ADR 0025) → `/welcome`. Nested layouts add role guards
(`admin/layout.tsx` → `requireAdmin()`).

## Public routes (no auth)

`/` (rewrites to `/login` for anon), `/login`, `/forgot-password`,
`/reset-password`, `/unauthorized`, `/invite/[token]` (self-signup),
`/auth/confirm` (token verify), `/support`, `/privacy`,
`/account-deletion`, `/a11y-harness` (build-gated by `NEXT_PUBLIC_A11Y_HARNESS`),
PWA: `/manifest.webmanifest`, `/icons/*`.

**`/welcome` is NOT a no-auth page** — it lives outside `(protected)` but
`app/welcome/page.tsx` creates a Supabase client, calls `auth.getUser()`, and
redirects anonymous visitors to `/login`. It is a **signed-in fallback gate**
for the choose-your-name step (ADR 0025), reachable only by an authenticated
name-pending session.

## Admin nav spine (ministry_admin + super_admin)

The Care · Plan · Multiply pivot (ADR 0016):

- `/admin` — home dashboard (needs-attention, snapshot, pivot cards)
- `/admin/care` — canonical Care surface (over-shepherds/leaders/coverage tabs).
  Aliases (200, not redirect): `/admin/shepherd-care`, `/admin/follow-ups`.
- `/admin/shepherd-care/[profileId]`, `/admin/shepherd-care/over-shepherds(/[id])`
  — Care detail surfaces
- `/admin/plan` — Interest Funnel board (Prospects)
- `/admin/multiply` (+`/criteria`, `/settings`) — 3 tabs: Plan, Readiness
  (cell grid), Leaders (apprentice pipeline)
- `/admin/groups` (+`/[groupId]`, `/[groupId]/calendar`) — group management
- `/admin/people` (+`/[kind]/[personId]`) — directory. The `[kind]` segment
  accepts only `profile` and `member` (anything else → `notFound()`); the People
  list still buckets people as leaders/members.
- `/admin/settings` — metric defaults, rubrics, multiplication setup, imports
- `/admin/super-admin` — **super_admin only** console

Groups & People tabs are seeded on per ADR 0024 (console can re-hide).

## Admin off-nav / frozen (resolve by direct URL, role-guarded, banner-annotated)

These are hidden from nav but still resolve, all `requireAdmin()`-guarded
(ADR 0009/0016). **Two distinct access levels — don't conflate:**

- **Flag-blocked** (`frozenSurfaceGate` — access actually gated by a feature
  flag): `/admin/guests` (`guests`), `/admin/check-ins(/[groupId])` (`check_ins`).
- **Banner-only** (just `requireAdmin()` + a `FrozenSurfaceBanner`, **no** flag
  gate — any admin can still open them): `/admin/planning`, `/admin/calendar`,
  `/admin/launch-planning`, `/admin/leader-pipeline`, `/admin/group-health`.

Hidden, not deleted. Do not overestimate the access controls on the banner-only
group — they are reachable by any admin via direct URL.

## Over-Shepherd (over_shepherd role)

`/over-shepherd` (My Leaders, coverage-scoped), `/over-shepherd/[profileId]`
(shepherd detail; `notFound()` if not covered).

## Leader (leader/co_leader, gated by `leader_surface` flag — on by default ADR 0024)

`/leader`, `/leader/[groupId]/care` (group-scoped Care Notes + Prayer Requests),
`/leader/[groupId]/calendar`, `/leader/[groupId]/checkin` (frozen separately
behind `check_ins`).

## Shared signed-in

`/account`.

## Page → shell convention

Thin async page → role guard → `<PageHeader>` (sync) → `<Suspense>` async data
child running `measureReadBundle` + `Promise.all` reads → `*-shell.tsx`
(`"use client"`) handles tabs/filters/inline edits via server actions.

# Relationships

- [/okf/auth/auth-overview.md](/okf/auth/auth-overview.md)
- [/okf/api/index.md](/okf/api/index.md)
- [/okf/architecture/request-lifecycle.md](/okf/architecture/request-lifecycle.md)
- [/okf/config/environment.md](/okf/config/environment.md) (frozen-surface flags)

# Gotchas

- `/admin/shepherd-care` and `/admin/follow-ups` **alias-render** `/admin/care`
  (200 status, reuse `CarePageView`) — they are not redirects and carry no
  "frozen" banner.
- Frozen surfaces still compile and resolve — don't treat an `/admin/*` dir as
  dead code.
- `leader_surface` gates `/leader/**` but check-ins are gated separately
  (`check_ins`) — two distinct switches.
- `app/auth/confirm/route.ts` does the **token verification in POST only**
  (avoids mail-scanner GET burning single-use tokens), but it **also defines a
  GET handler** that safely redirects to `/reset-password` **without** consuming
  the token. Don't delete that GET — it's the safety net that bounces
  scanner/bookmark requests instead of hitting an unhandled route.

# Citations

- `app/(protected)/layout.tsx:1-42`
- `app/(protected)/admin/layout.tsx:1-28`
- `lib/auth/roles.ts:58-307`
- `README.md:136-160`
