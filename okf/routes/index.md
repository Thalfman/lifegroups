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
`/reset-password`, `/welcome`, `/unauthorized`, `/invite/[token]` (self-signup),
`/auth/confirm` (POST-only token verify), `/support`, `/privacy`,
`/account-deletion`, `/a11y-harness` (build-gated by `NEXT_PUBLIC_A11Y_HARNESS`),
PWA: `/manifest.webmanifest`, `/icons/*`.

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
- `/admin/people` (+`/[kind]/[personId]`) — directory (kind ∈ leader/member/guest)
- `/admin/settings` — metric defaults, rubrics, multiplication setup, imports
- `/admin/super-admin` — **super_admin only** console

Groups & People tabs are seeded on per ADR 0024 (console can re-hide).

## Admin off-nav / frozen (resolve by direct URL, role-guarded, banner-annotated)

`/admin/guests`, `/admin/check-ins(/[groupId])`, `/admin/leader-pipeline`,
`/admin/group-health`, `/admin/planning`, `/admin/launch-planning`,
`/admin/calendar`. Gated behind Super-Admin nav-visibility / frozen flags
(`guests`, `check_ins`, …) — hidden, not deleted (ADR 0009/0016).

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
- `app/auth/confirm/route.ts` is **POST-only** (avoids mail-scanner GET burning
  single-use tokens).

# Citations

- `app/(protected)/layout.tsx:1-42`
- `app/(protected)/admin/layout.tsx:1-28`
- `lib/auth/roles.ts:58-307`
- `README.md:136-160`
