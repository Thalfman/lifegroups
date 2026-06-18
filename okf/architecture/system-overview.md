---
type: Architecture
title: System Overview
description: What LifeGroups is, its runtime stack, and the read/write boundaries that define the whole app.
resource: repo://README.md
tags: [architecture, nextjs, supabase, overview, rls]
timestamp: 2026-06-18T00:00:00Z
---

# Purpose

This is the orientation file for any agent new to the repo. LifeGroups is
**Julian's admin operating system for shepherding Life Group Leaders** — a
Next.js 16 (App Router) + React 19 + TypeScript + Tailwind app on Supabase
(Auth + Postgres + RLS), deployed on Vercel. Understanding the read/write
boundaries and the security posture here prevents the most common and most
dangerous mistakes (bypassing RPCs, leaking private notes, breaking RLS).

# Source of truth

- `README.md` — product framing, role model, route table, security posture
- `CLAUDE.md` — engineering invariants (the hard rules)
- `CONTEXT.md` — domain glossary (use this vocabulary)
- `docs/architecture/ARCHITECTURE.md` — behavior-level map
- `package.json` — stack + scripts
- `proxy.ts`, `lib/supabase/`, `lib/auth/`, `lib/shared/run-action.ts`

# Key details

**What it does.** Three areas form the navigation spine (the 2026-06 pivot,
ADR 0016):

- **Care** — how Leaders (and their members) are doing: an Over-Shepherd
  accordion, Leader Care Status, configurable A–F Group/Leader-Health grades,
  author-private Care Notes + Prayer Requests.
- **Plan** — the Interest Funnel: Prospects move Interested → Matched → Joined
  (or park as Not at this time).
- **Multiply** — whether to launch another group of a type, read from four
  pillars (Capacity · Interest · Group Health · Leader Health) and a
  Julian-owned trigger.

**Stack.** Next.js `^16.2.9`, React `19.0.0`, TypeScript strict, Tailwind 3,
`@supabase/ssr` + `@supabase/supabase-js`, Upstash Redis (forgot-password
throttle), Vercel Analytics + Speed Insights. Node pinned `>=20.19 <21`.

**Two data paths** (the core mental model):

- **Read path** — cookie-authenticated server client runs every query through
  Row Level Security, scoped to the signed-in user. Reads flow through the
  **reads seam** (ADR 0015) with explicit column allowlists (no `select("*")`).
  Reads degrade gracefully (a failed read suppresses derived output, never a
  false zero). Public preview routes render typed demo data, never call Supabase.
- **Write path** — Server Actions follow a fixed **validate → guard → RPC →
  revalidatePath → log** pipeline. Every app-driven write goes through a narrow
  `SECURITY DEFINER` RPC (`admin_*` / `leader_*` / `over_shepherd_*` /
  `super_admin_*`), and each RPC writes a paired `audit_events` row in the same
  transaction.

**Pages are thin async Server Components** that guard auth, load data, and hand
a typed shape to a stateful client **shell** (`*-shell.tsx`).

**Security posture (hard invariants):** no service-role key in Next runtime;
all writes through narrow RPCs; every mutation audit-paired; no hard deletes
(archive/soft-delete is the default); column allowlists everywhere; role-based
authz (no hardcoded Julian/Tom UUIDs). Several are machine-checked by the
fitness suite (`tests/fitness/**`) in CI.

# Relationships

- [/okf/architecture/request-lifecycle.md](/okf/architecture/request-lifecycle.md)
- [/okf/app/app-structure.md](/okf/app/app-structure.md)
- [/okf/auth/auth-overview.md](/okf/auth/auth-overview.md)
- [/okf/data/index.md](/okf/data/index.md)
- [/okf/routes/index.md](/okf/routes/index.md)
- [/okf/decisions/index.md](/okf/decisions/index.md)
- [/okf/glossary/index.md](/okf/glossary/index.md)

# Gotchas

- This is an **oversight tool, not a member app.** `member` is **not** an
  app-login role — members are non-auth participant records.
- The app builds and runs **without Supabase env vars** (demo mode): clients
  return `null`, protected routes redirect to `/login`, preview routes render
  typed fallback data. Don't assume a live DB locally.
- Pre-pivot surfaces (Planning, calendar, guests, check-ins) are **hidden, not
  deleted** — they still resolve by direct URL behind Super-Admin nav flags.
- Next 16 renames `middleware` to **`proxy.ts`** — easy to miss.

# Citations

- `README.md:1-253`
- `docs/architecture/ARCHITECTURE.md:1-174`
- `package.json:1-72`
- `CLAUDE.md` (security invariants section)
