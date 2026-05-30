# Life Group Operations

**Julian's admin operating system for shepherding Life Group leaders and
planning group launches.** A web app for the ministry's oversight tiers —
not (currently) for group leaders themselves. Built with Next.js (App
Router) + TypeScript + Tailwind on top of Supabase (Auth + Postgres + RLS).

## What this app is for

Julian (the Ministry Admin) oversees 60+ Life Group leaders. When asked what
would make this tool genuinely useful week to week, he named **three jobs**
(see [`docs/julian-inputs/SYSTEMS_CONVERSATION.md`](./docs/julian-inputs/SYSTEMS_CONVERSATION.md)
Q12). These three jobs are the app's north star — every shipped and planned
feature serves one of them:

1. **Know how my leaders are doing** — care status, last contact, what's owed
   next, and a history per shepherd. → *Shepherd Care (SC.\*)*
2. **Know what groups need to be launched, and when** — capacity, seasonality,
   and a multiplication pipeline. → *Launch Planning (LP.\*)*
3. **Know the health of a Life Group** — a grading rubric for attendance and
   spiritual growth. → *Group Health (P5)*

Anything outside these three jobs (leader-facing tools, external/comms
surfaces) is deliberately **deferred** and is **not** required for the app to
be considered done.

## What "done" looks like

"Done" is **outcome-based, not a feature checklist**: the app is done when it
does Julian's three jobs *reliably*. Each job below has a done bar and its
current state. The authoritative requirements, mapped 1:1 to Julian's twelve
questions, live in the PRD ([`docs/PRD.md`](./docs/PRD.md)) — this section is the
target those requirements are measured against.

| # | Job | Done when… | Today |
|---|---|---|---|
| 1 | **Leaders' health is visible** | Julian can record care status, log interactions, track the next step he owes each leader, and triage who needs attention — privately. | **Shipped.** Care profiles, interaction log, follow-up task list (SC.1B), over-shepherd coverage, the triage dashboard, and private-to-Julian encrypted notes (SC.4) have all shipped. See PRD Q1–Q8. |
| 2 | **Launch timing is clear** | Julian can see capacity, forecast group demand by season, and track which groups are ready to multiply and in what year. | **Shipped.** Capacity (=12 + opt-to-stay-open), forecast scenarios, seasonality quick-fills, and the multiplication pipeline have shipped. Remaining: Julian's call on pipeline ownership and reliable church-attendance capture. See PRD Q9–Q11. |
| 3 | **Group health is gradeable** | Julian can grade a group's health on consistent dimensions (attendance, spiritual growth, …) and see it surfaced. | **The one gap left.** In **discovery** ([`GROUP_HEALTH_RUBRIC_DISCOVERY.md`](./docs/plans/GROUP_HEALTH_RUBRIC_DISCOVERY.md)) — Julian is still designing the rubric, so it can't be specced yet. See PRD Q12. |

**In one line:** jobs 1 and 2 (Q1–Q11) are shipped; job 3's rubric (Q12) is the
one North-Star item left, blocked on Julian. The open decisions that gate the
remaining work are listed under "Decisions owed by Julian" in the
[PRD](./docs/PRD.md#decisions-owed-by-julian).

## Where to look next

- [`docs/julian-inputs/SYSTEMS_CONVERSATION.md`](./docs/julian-inputs/SYSTEMS_CONVERSATION.md)
  — ⭐ **the North Star:** Julian's twelve questions and answers. Everything traces here.
- [`docs/PRD.md`](./docs/PRD.md) — 📌 **THE PRD:** requirements mapped 1:1 to Q1–Q12,
  with shipped / blocked status for each.
- [`docs/adr/0004-systems-conversation-architecture.md`](./docs/adr/0004-systems-conversation-architecture.md)
  — 🏛️ **THE ADR:** the architecture decisions, mapped 1:1 to Q1–Q12.
- [`docs/README.md`](./docs/README.md) — the documentation index (what's live, what's archived).
- [`docs/julian-inputs/`](./docs/julian-inputs/README.md) — **source of record**
  for Julian's own words (the Q&A, the care spreadsheet, the multiplication plan).
- [`docs/archive/`](./docs/archive/README.md) — everything off the North-Star path
  (the former blueprint, roadmap, backlog, and historical specs). History, not current truth.
- [`CONTEXT.md`](./CONTEXT.md) — the domain glossary (Shepherd, Over-Shepherd,
  Ministry Admin, …). Use this vocabulary.

## The oversight ladder (role model)

The app is an oversight operating system for the ministry's upper tiers. Roles
form a strict **downward-visibility ladder** — each tier sees what the tier
below sees, and more (the one deliberate exception is private care notes; see
[ADR 0002](./docs/adr/0002-oversight-ladder-and-leader-gating.md)):

> **Super Admin ▸ Ministry Admin ▸ Over-Shepherd ▸ Shepherd**

App-login roles live on `profiles.role` (the `user_role` enum):

- **`super_admin`** (Tom) — platform owner. Everything a Ministry Admin sees
  **plus** platform/account administration (`/admin/super-admin`). Bootstrapped
  manually (see Sign-in setup).
- **`ministry_admin`** (Julian) — all ministry/operational data. Lands on
  `/admin`. This is the primary persona.
- **`over_shepherd`** — a coach scoped to **only the Shepherds they cover** (via
  `shepherd_coverage_assignments`). Lands on `/over-shepherd` ("My Shepherds"):
  a focused, read-scoped care surface, not `/admin`. Cannot see launch planning,
  the full directory, or platform admin.
- **`leader` / `co_leader`** (Shepherd) — **gated off.** No login surface for
  now; routed to `/unauthorized`. The `app/(protected)/leader/**` code remains
  in the repo, dormant (deferred, not deleted).
- **`staff_viewer`** — **deprecated.** Retained in the SQL enum for backwards
  compatibility; routed to `/unauthorized`.

Two clarifications:

- **`member` is not an app-login role.** Members are non-auth participant
  records in the `members` table, linked to groups via `group_memberships`.
  They never sign in.
- **`group_memberships.role`** is a separate enum (`role_in_group`:
  `member | leader | co_leader`) describing a person's role *within a group*,
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
