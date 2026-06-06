# Life Group Operations

**Julian's admin operating system for shepherding Life Group Leaders and
planning group launches.** A web app for the ministry's oversight tiers — and,
with the 2026-06 pivot, the Leaders they care for (ADR 0017). Built with Next.js
(App Router) + TypeScript + Tailwind on top of Supabase (Auth + Postgres + RLS).

> 🔄 **Pivot in progress (2026-06).** The app is being re-scoped to **three
> areas — Care · Plan · Multiply** — with the old group-assignment and number
> surfaces turned off behind Super-Admin flags (turned off, not deleted). The
> decisions are recorded in **ADR 0016–0020**; the spec is **PRD
> [#371](https://github.com/Thalfman/lifegroups/issues/371)** and the
> implementation slices are **#372–#382**. The sections below describe the **new
> north star** and what exists **today** versus what the pivot adds. The prior
> "three jobs" framing (Care, Launch Planning, Group Health) is superseded by
> ADR 0016; the original Q1–Q12 record lives on in
> [`docs/julian-inputs/SYSTEMS_CONVERSATION.md`](./docs/julian-inputs/SYSTEMS_CONVERSATION.md).

## What this app is for

Julian (the Ministry Admin) oversees 60+ Life Group Leaders. The app's north
star is **three areas** (ADR 0016) — each the focus of one job:

1. **Care** — how my Leaders (and their members) are doing: an Over-Shepherd
   accordion, Leader Care Status, configurable **A–F** Group- and Leader-Health
   grades, and author-private **Care Notes** + **Prayer Requests**.
2. **Plan** — the **Interest Funnel**: people interested in joining a group move
   **Interested → Matched → Joined** (or park as **Not at this time**), each with
   a Next Step and armed (provider-deferred) follow-ups.
3. **Multiply** — whether to launch another group of a **type** (Men's / Women's
   / Mixed), read from four pillars (Capacity · Interest · Group Health · Leader
   Health) and a Julian-owned trigger.

Leaders **and** Over-Shepherds log in to their own slice of Care (ADR 0017 —
re-opening the previously frozen Leader surface behind a verified flag). The old
group-assignment, capacity, roster, calendar, and follow-up surfaces are hidden
behind Super-Admin nav flags (default off) — **turned off, not deleted**
(ADR 0016).

## What "done" looks like

"Done" is **outcome-based, not a feature checklist**: the app is done when it
does Julian's three jobs _reliably_ — now framed as the three areas. Each row
names what the pivot delivers and what exists **today** (the pivot is in flight;
the running app is still largely the pre-pivot one). The authoritative spec is
**PRD [#371](https://github.com/Thalfman/lifegroups/issues/371)**, sliced into
issues **#372–#382**.

| Area         | The pivot delivers…                                                                                                                                                                                        | Today                                                                                                                                                                                                                                            |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Care**     | One Over-Shepherd accordion consolidating Leader-care + coverage + health grading; configurable **A–F** Group- _and_ Leader-Health rubrics; author-private Care Notes + Prayer Requests; Leader/OS logins. | **In flight.** The separate Leader-care, over-shepherd, and (A–D) group-health surfaces and private-to-Julian encrypted notes (SC.\*) exist today. Consolidation + rubrics + notes + logins are slices #373, #374, #376, #377, #378, #381, #382. |
| **Plan**     | The Interest Funnel — Prospects moving Interested → Matched → Joined / Not at this time — with a Next Step and armed follow-ups; replaces the Guests pipeline.                                             | **In flight.** A 7-stage Guests pipeline exists but is frozen (off-nav). The funnel reframe is slices #375 / #379.                                                                                                                               |
| **Multiply** | Three boards by group **type** + four pillars + a Julian-owned trigger; Capacity is Julian-fed.                                                                                                            | **In flight.** Today's per-group multiplication planner (seeded from Julian's Doc, ADR 0006) exists; the per-type pillar reframe is slice #380.                                                                                                  |

**In one line:** the three jobs are unchanged in spirit but re-shaped into Care ·
Plan · Multiply (ADR 0016), with Leaders/OS now logging in (ADR 0017),
configurable A–F health rubrics (ADR 0018), and multiplication by type
(ADR 0019). Implementation is tracked in PRD #371 and slices #372–#382; the
old number/assignment surfaces are flagged off, not removed.

## Where to look next

- **🔄 The pivot (current direction):** ADRs
  [`0016`](./docs/adr/0016-pivot-to-care-plan-multiply.md) (Care/Plan/Multiply),
  [`0017`](./docs/adr/0017-reopen-leader-os-logins-and-care-notes.md) (Leader/OS
  logins + Care Notes), [`0018`](./docs/adr/0018-configurable-af-health-rubrics.md)
  (A–F rubrics), [`0019`](./docs/adr/0019-multiplication-by-type-and-pillars.md)
  (multiplication by type), [`0020`](./docs/adr/0020-leader-care-note-is-group-scoped.md)
  (Leader Care Note is group-scoped, amending 0017) — and
  **PRD [#371](https://github.com/Thalfman/lifegroups/issues/371)**,
  sliced into **#372–#382**.
- [`CONTEXT.md`](./CONTEXT.md) — the domain glossary (Care Note, Prayer Request,
  Prospect, Over-Shepherd, Ministry Year, …). Use this vocabulary.
- [`docs/julian-inputs/SYSTEMS_CONVERSATION.md`](./docs/julian-inputs/SYSTEMS_CONVERSATION.md)
  — ⭐ **the original North Star:** Julian's twelve questions. The pivot re-shapes
  these into Care/Plan/Multiply (ADR 0016); the Q&A remains the source of his words.
- [`docs/PRD.md`](./docs/PRD.md) — the prior 1:1 PRD (Q1–Q12); superseded in framing
  by PRD #371, kept as the historical record.
- [`docs/adr/0004-systems-conversation-architecture.md`](./docs/adr/0004-systems-conversation-architecture.md)
  — the architecture decisions mapped to Q1–Q12 (pre-pivot).
- [`docs/README.md`](./docs/README.md) — the documentation index (what's live, what's archived).
- [`docs/archive/`](./docs/archive/README.md) — everything off the North-Star path.
  History, not current truth.

## The oversight ladder (role model)

The app is an oversight operating system for the ministry's upper tiers. Roles
form a strict **downward-visibility ladder** — each tier sees what the tier
below sees, and more. There are **two deliberate exceptions**: the Ministry
Admin's own **Private Care Note** (hidden even from the Super Admin; ADR
0002/0003) and the author-private **Care Note** (an OS's or Leader's note,
readable by Julian only when he grants that person's transparency toggle;
ADR 0017):

> **Super Admin ▸ Ministry Admin ▸ Over-Shepherd ▸ Leader**

App-login roles live on `profiles.role` (the `user_role` enum):

- **`super_admin`** (Tom) — platform owner. Everything a Ministry Admin sees
  **plus** platform/account administration (`/admin/super-admin`). Bootstrapped
  manually (see Sign-in setup).
- **`ministry_admin`** (Julian) — all ministry/operational data. Lands on
  `/admin`. This is the primary persona.
- **`over_shepherd`** — a coach scoped to **only the Leaders they cover** (via
  `shepherd_coverage_assignments`). Lands on `/over-shepherd`: a focused,
  coverage-scoped care surface, not `/admin`. The pivot adds author-private
  **Care Notes** + **Prayer Requests** about their Leaders (ADR 0017, slice #381).
- **`leader` / `co_leader`** — **being re-opened (ADR 0017).** The Leader surface
  was frozen (ADR 0002); the pivot re-opens it so a Leader logs in to a care
  surface over their group's members (Care Notes + Prayer Requests + calendar).
  The flag flips only after a route + RLS re-audit (verify-before-flip, ADR 0009)
  and Julian's LDR.1 go-ahead — tracked in #376 / #382. Dormant until then.
- **`staff_viewer`** — **deprecated.** Retained in the SQL enum for backwards
  compatibility; routed to `/unauthorized`.

Two clarifications:

- **`member` is not an app-login role.** Members are non-auth participant
  records in the `members` table, linked to groups via `group_memberships`.
  They never sign in.
- **`group_memberships.role`** is a separate enum (`role_in_group`:
  `member | leader | co_leader`) describing a person's role _within a group_,
  not their app-login role.

## Routes

- **Public:** `/`, `/login`, `/forgot-password`, `/reset-password`,
  `/unauthorized`. The landing page is a minimal sign-in entry point.
- **Protected (sign-in required), each with its own role gate via Supabase
  Auth / RLS:**
  - **Ministry/Super Admin** — `/admin`, `/admin/shepherd-care` (+
    `/[profileId]`, `/over-shepherds`), `/admin/launch-planning`,
    `/admin/follow-ups`, `/admin/people`, `/admin/groups` (+ `/[groupId]/calendar`),
    `/admin/guests`, `/admin/calendar`, `/admin/settings`. `/admin/super-admin`
    is **super_admin only**; the rest accept `ministry_admin` and `super_admin`.
  - **Over-Shepherd** — `/over-shepherd` (+ `/[profileId]`), scoped to covered
    Shepherds.
  - **Dormant** — `/admin/check-ins/**` (reachable by direct URL, removed from
    nav) and the entire `/leader/**` surface (gated; leaders land on
    `/unauthorized`).

## How data loads

- Protected routes use a cookie-authenticated server client built with
  `@supabase/ssr`. Every query runs through Row Level Security and is
  automatically scoped to the signed-in user.
- Public preview routes always render typed fallback demo data; they do not
  call Supabase.
- When Supabase env vars are missing, protected routes redirect to `/login` and
  the preview routes still render demo data.

## Security posture

- **No service role key** in Next runtime code. All app-driven writes flow
  through narrow `public.admin_*`, `public.leader_*`, and `public.super_admin_*`
  `SECURITY DEFINER` RPCs, each writing a paired `audit_events` row in the same
  transaction. The service role is confined to Supabase Edge Functions
  (`invite-user`, `manage-test-auth-users`).
- **No hard deletes** outside RPC bodies in normal workflows; operational tables
  use soft-deactivation.
- **The most sensitive tables use explicit column allowlists** — the
  shepherd-care reads select named columns, never `select("*")`. Constraining
  the remaining broad `select("*")` reads (e.g. `profiles` / `members`) is still
  **tracked debt**, not done (blueprint §G, P2.9).
- Authorization is **role-based** — no Julian/Tom UUIDs or emails are hardcoded
  in code, migrations, or RLS.

## Local development

1. Install dependencies:
   ```bash
   npm install
   ```
2. (Optional) connect to a real Supabase project to see live data:
   ```bash
   cp .env.example .env.local
   # then fill in NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
   # (legacy NEXT_PUBLIC_SUPABASE_ANON_KEY is still accepted as a fallback)
   ```
   Without env vars, the app renders typed fallback demo data on every public
   preview page and redirects protected routes to `/login`.
3. Run the dev server:
   ```bash
   npm run dev
   ```

### Scripts

- `npm run dev`
- `npm run lint`
- `npm run typecheck`
- `npm run build`

## Sign-in setup

1. Apply `supabase/migrations/20260517040000_phase2_schema.sql`,
   `supabase/seed/phase2_seed.sql`, and
   `supabase/migrations/20260518000000_phase4_rls.sql` (then later migrations in
   timestamp order).
2. Create one Supabase Auth user per seed profile email
   (`avery.bennett@example.org`, `jordan.hayes@example.org`,
   `casey.morgan@example.org`, etc.) with a development-only password.
3. Link each auth user to its profile row by following `supabase/dev/README.md`.
4. **Super admin bootstrap:** create your own Supabase Auth user and link it to a
   `super_admin` profile by following the "Super admin bootstrap" section of
   `supabase/dev/README.md`.
5. Visit `/login` and sign in with the email + password you set.

Real users (e.g. Julian as `ministry_admin`, over-shepherds, additional leaders)
are invited from `/admin/super-admin` once a `super_admin` is signed in. See
[`docs/archive/SUPER_ADMIN_INVITE_USER_WORKFLOW.md`](./docs/archive/SUPER_ADMIN_INVITE_USER_WORKFLOW.md).

## Supabase notes

- Schema migration: `supabase/migrations/20260517040000_phase2_schema.sql`
- RLS migration: `supabase/migrations/20260518000000_phase4_rls.sql`
- Seed file: `supabase/seed/phase2_seed.sql`
- Dev auth bootstrap: `supabase/dev/README.md`
- Schema docs: [`docs/architecture/DATABASE_SCHEMA.md`](./docs/architecture/DATABASE_SCHEMA.md)
- Env vars are **optional** for build; required only for sign-in and live data.

## Personas

Julian is the primary `ministry_admin` and operator persona used throughout
admin-facing copy. Tom holds the owner / `super_admin` account for bootstrap,
oversight, and emergency access.

## Implementation history

Historical phase specs and verification logs have been moved to
[`docs/archive/`](./docs/archive/README.md) so this README stays focused on
current state. See the archive README for the full listing.
