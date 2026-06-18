# LifeGroups — Open Knowledge Format Bundle

High-signal knowledge for AI agents and human maintainers working on
**LifeGroups**, Julian's admin operating system for shepherding Life Group
Leaders. This bundle captures the reusable context a future agent would
otherwise have to rediscover. Start here.

## What the app is (in 8 bullets)

- A **Next.js 16 (App Router) + React 19 + TypeScript + Tailwind** web app on
  **Supabase** (Auth + Postgres + RLS), deployed on **Vercel**.
- An **oversight operating system** for a ministry's upper tiers — not a member
  app. `member` is a non-auth record, never a login.
- Organized as three areas (the 2026-06 pivot, ADR 0016): **Care** (how Leaders
  are doing), **Plan** (the Interest Funnel of Prospects), **Multiply** (when to
  launch another group, by cell).
- Roles form a strict downward-visibility ladder: **Super Admin ▸ Ministry Admin
  ▸ Over-Shepherd ▸ Leader/Co-Leader**.
- **Reads** run through RLS + a reads seam with explicit column allowlists (no
  `select("*")`); they degrade gracefully and render typed demo data when no DB.
- **Writes** follow one pipeline — validate → guard → `SECURITY DEFINER` RPC →
  revalidatePath → log — and every mutation writes a paired `audit_events` row
  in the same transaction.
- Several hard security invariants (no service-role key in Next, no direct table
  writes, no `select("*")`, no hardcoded identity, run-action routing) are
  **machine-checked** by the fitness suite in CI. Others — **no hard deletes**,
  no broad RLS, and audit-pairing details — are policy invariants that rely on
  **manual review**, not a static scan.
- Pre-pivot surfaces (guests, planning, calendar, check-ins) are **hidden behind
  flags, not deleted** — they still resolve by direct URL.

## Major sections

- **Architecture** — [system overview](/okf/architecture/system-overview.md) ·
  [request lifecycle (read/write paths)](/okf/architecture/request-lifecycle.md)
- **App** — [structure & conventions](/okf/app/app-structure.md)
- **Routes** — [routes & pages map](/okf/routes/index.md)
- **API** — [Server Actions, RPCs & route handlers](/okf/api/index.md)
- **Data** — [tables, enums, RLS & conventions](/okf/data/index.md)
- **Auth** — [auth & permissions](/okf/auth/auth-overview.md)
- **Config** — [environment & feature flags](/okf/config/environment.md)
- **Workflows** — [local dev](/okf/workflows/local-development.md) ·
  [testing](/okf/workflows/testing.md) ·
  [deployment](/okf/workflows/deployment.md)
- **Integrations** — [external services](/okf/integrations/index.md)
- **Runbooks** — [operational triage](/okf/runbooks/index.md)
- **Decisions** — [ADR index](/okf/decisions/index.md)
- **Glossary** — [domain vocabulary](/okf/glossary/index.md)
- **Log** — [generation log & gaps](/okf/log.md)

## Most important source directories

- `app/(protected)/` — role-gated routes (admin / over-shepherd / leader) +
  Server Actions (`*-actions.ts`).
- `lib/shared/run-action.ts` + `lib/admin/run-action.ts` — the write pipeline.
- `lib/auth/` (`session.ts`, `roles.ts`) — sessions, guards, the role ladder.
- `lib/supabase/` — server client, reads seam, read models (column allowlists).
- `lib/admin/` — typed RPC wrappers + domain logic (`cell.ts`, `cell-health.ts`,
  `health-rubric.ts`).
- `supabase/migrations/` — schema + RLS + all `SECURITY DEFINER` RPCs (ground
  truth for data behavior).
- `supabase/functions/` — Edge Functions (the only service-role usage).
- `tests/fitness/` — machine-checked security invariants.
- `types/` — hand-rolled row types + enums (the trust boundary).

## Most important runtime flows

1. **Request gating** — `proxy.ts` refreshes session → `(protected)/layout.tsx`
   branches on `SessionResult` → role redirect-guard per page.
2. **Read path** — thin page → guard → async data child → `measureReadBundle` +
   `Promise.all` reads through the reads seam (RLS-scoped, allowlisted).
3. **Write path** — Server Action → validate → guard → typed RPC → audited
   write → revalidate → structured log.
4. **Auth flows** — login, reset/invite (`/auth/confirm` POST + pw-setup
   cookie), self-signup (Edge `redeem-invite`), choose-your-name (`/welcome`).

## Highest-risk gotchas

- **Migrations never auto-deploy** — code ships on merge to main, schema is
  applied manually (schema-first). Drift has happened in production.
- **RPC is the authoritative authz boundary** — never write tables directly;
  action-level guards are defense-in-depth only.
- **Two distinct private-note systems** — encrypted Private Care Notes vs
  plaintext author-private Care Notes + transparency grant. Don't conflate; never
  leak `admin_private_note` to leader routes.
- **Frozen ≠ deleted** — retired surfaces still compile and resolve by URL.
- **Demo mode** — no Supabase env → clients are `null`, protected routes
  redirect to `/login`. Don't assume a live DB locally.
- **Rate limiting fails open** — missing Upstash config silently weakens prod
  abuse protection.
- **Email templates hard-code the origin** — re-paste in the Supabase dashboard
  after an origin change.

## Unknowns needing human review

- Exact set of enabled feature flags / nav-visibility state in **production** is
  runtime data (`platform_config`), not in the repo.
- `types/database.ts` is hand-rolled and may **drift** from the SQL migrations;
  treat migrations as ground truth and verify when precision matters.
- Whether the husky pre-commit hook is enforced or developer-optional — sources
  differ (CLAUDE.md says active; one inspection suggested optional). Verify.
- Production Supabase project ref / SMTP config / Upstash instance — operational
  secrets, intentionally not documented here.
- Some `admin_*`/`super_admin_*` RPC signatures were enumerated from type maps
  and may lag the latest migrations.
