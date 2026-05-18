# Life Group Operations Dashboard

This repository contains the Life Group Operations Dashboard web app built with Next.js, TypeScript, and Tailwind.

## Phase status
- Phase 0: app foundation. ✅
- Phase 1: visual design system + admin/leader preview experiences. ✅
- Phase 2: Supabase schema, enums, seed data, and docs. ✅
- Phase 3: safe Supabase read integration with fallback demo data. ✅
- Phase 4: security foundation — Supabase Auth, protected routes, role-aware access, assigned leader scoping, and Row Level Security policy enforcement. ✅
- Phase 4.1: docs + dev-helper patch — super admin bootstrap, role model clarification, Phase 5A scope outline. No app write code. ✅
- Phase 5A.0: admin people & role management UI/UX scaffold — protected `/admin/people` route, disabled action cards, polished empty states, validation helpers, throwing server-action stubs. ✅
- **Phase 5A.1 (current): people foundation writes — admins can add leader profiles, add member records, assign leaders/co-leaders to groups, place members in groups, deactivate either, and review an audit trail. Writes flow through six narrow `public.admin_*` SECURITY DEFINER Postgres RPC functions so each data change and its `audit_events` row commit atomically. RLS stays SELECT-only; no service role; no deletes. See `docs/PHASE_5A_ADMIN_MANAGEMENT.md`, `docs/PHASE_5A_ACTION_CONTRACTS.md`, and `docs/PHASE_5A_1_VERIFICATION.md`.**
- Phase 5B (after 5A.1): operational write workflows — attendance submission, guest capture, follow-up updates, admin review queues. These arrive alongside the operational INSERT / UPDATE / DELETE RLS policies.

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
3. Run dev server:
   ```bash
   npm run dev
   ```

## Scripts
- `npm run dev`
- `npm run lint`
- `npm run typecheck`
- `npm run build`

## Public vs. protected routes
- **Public**: `/`, `/admin-preview`, `/leader-preview`, `/login`, `/unauthorized`. The
  preview routes always render fallback demo data so the design demo stays
  visible without secrets.
- **Protected (sign-in required)**: `/admin`, `/leader`, `/staff`. Each enforces
  its own role gate and reads through Supabase Auth / RLS.

## Role model
App-login roles live on `profiles.role` (the `user_role` enum). The five
values, in order from most to least privileged:

- `super_admin` — top-level owner/operator. Treated as a superset of
  `ministry_admin` for read access. Bootstrapped manually (see Sign-in setup
  below); future workflows for managing other admins live in Phase 5A.
- `ministry_admin` — ministry operations admin. Sees `/admin` and `/staff`.
- `staff_viewer` — read-only ministry-wide view. Sees `/staff` only.
- `leader` — app-login role scoped to assigned groups only via active
  `group_leaders` rows. Sees `/leader`.
- `co_leader` — same scoping as `leader`.

Two clarifications worth calling out:

- **`member` is not an app-login role.** Members are non-auth participant
  records in the `members` table and are linked to groups through
  `group_memberships`. They never sign in. `profiles.role` does not contain
  `member`.
- **`group_memberships.role` is a separate enum** (`role_in_group`:
  `member | leader | co_leader`) describing a person's role *within a
  specific group*, not their app-login role.

Phase 5A will introduce narrow admin workflows for creating and updating
admin, leader, and member records — see
`docs/PHASE_5A_ADMIN_MANAGEMENT.md`.

## Sign-in setup
1. Apply `supabase/migrations/20260517040000_phase2_schema.sql`,
   `supabase/seed/phase2_seed.sql`, and
   `supabase/migrations/20260518000000_phase4_rls.sql`.
2. Create one Supabase Auth user per seed profile email
   (`avery.bennett@example.org`, `jordan.hayes@example.org`,
   `casey.morgan@example.org`, etc.) with a development-only password.
3. Link each auth user to its profile row by following
   `supabase/dev/README.md`.
4. **Super admin bootstrap (Phase 4.1):** create your own Supabase Auth
   user and link it to a `super_admin` profile by following the "Super
   admin bootstrap" section of `supabase/dev/README.md`.
5. Visit `/login` and sign in with the email + password you set.

## How data loads
- Protected routes use a cookie-authenticated server client built with
  `@supabase/ssr`. Every query runs through Row Level Security and is
  automatically scoped to the signed-in user.
- Public preview routes always render fallback demo data; they do not call
  Supabase.
- When Supabase env vars are missing, protected routes redirect to `/login`
  and the preview routes still render demo data.

## Personas

Julian is the primary ministry admin and operator persona used throughout
admin-facing copy. Tom holds the owner/super_admin account for bootstrap,
oversight, and emergency access. Authorization is role-based — no Julian
or Tom UUIDs or emails are hardcoded in code, migrations, or RLS.

## Supabase notes
- Schema migration: `supabase/migrations/20260517040000_phase2_schema.sql`
- RLS migration: `supabase/migrations/20260518000000_phase4_rls.sql`
- Phase 5A.1 admin write functions: `supabase/migrations/20260518050000_phase5a1_admin_people_writes.sql`
- Seed file: `supabase/seed/phase2_seed.sql`
- Dev auth bootstrap: `supabase/dev/README.md`
- Schema docs: `docs/DATABASE_SCHEMA.md` and `docs/SEED_DATA.md`
- Phase 5A scope outline: `docs/PHASE_5A_ADMIN_MANAGEMENT.md`
- Phase 5A action contracts: `docs/PHASE_5A_ACTION_CONTRACTS.md`
- Phase 5A.1 verification checklist: `docs/PHASE_5A_1_VERIFICATION.md`
- Env vars are **optional** for build; required only for sign-in and live data.
- No service role key is used or expected anywhere in app code. Phase 5A.1
  is the first phase with live writes; they are limited to admin people
  and assignment management and flow through narrow RPC functions only.
  Broader operational write workflows ship in Phase 5B.
