# OKF Generation Log

**Generated:** 2026-06-18 (ISO 8601: 2026-06-18T00:00:00Z)
**Repo:** thalfman/lifegroups · **Branch:** claude/okf-knowledge-bundle-l9ckpx
**Format:** Open Knowledge Format (OKF) — Google Cloud knowledge-catalog structure

## Summary of files created

Navigation files (no frontmatter):

- `okf/index.md` — bundle entry point (what/structure/flows/gotchas/unknowns)
- `okf/log.md` — this file

Concept files (YAML frontmatter, non-empty `type`):

- `okf/architecture/system-overview.md` — Architecture
- `okf/architecture/request-lifecycle.md` — Architecture (read/write paths)
- `okf/app/app-structure.md` — App Module
- `okf/routes/index.md` — Route
- `okf/api/index.md` — API (Server Actions, RPCs, route handlers, Edge Functions)
- `okf/data/index.md` — Data Model (schema, enums, RLS, conventions)
- `okf/auth/auth-overview.md` — Auth
- `okf/config/environment.md` — Configuration
- `okf/workflows/local-development.md` — Workflow
- `okf/workflows/testing.md` — Workflow
- `okf/workflows/deployment.md` — Workflow
- `okf/integrations/index.md` — Integration
- `okf/runbooks/index.md` — Runbook
- `okf/decisions/index.md` — Decision (ADR index)
- `okf/glossary/index.md` — Glossary Term

Total: 15 concept files + 2 navigation files = 17 files.

## Source areas inspected

- Root docs: `README.md`, `CLAUDE.md`, `CONTEXT.md`, `AGENTS.md`, `package.json`
- `docs/architecture/` (ARCHITECTURE, DATABASE_SCHEMA, DEPLOYMENT), `docs/adr/`
  (0001–0027 by filename), `docs/runbooks/` (index)
- `app/` — route group `(protected)/`, public routes, `*-actions.ts`, genuine
  `route.ts` handlers, auth flows
- `lib/` — `shared/run-action.ts`, `admin/run-action.ts`, `auth/session.ts` +
  `roles.ts`, `supabase/` (server, middleware, reads seam, read models),
  `admin/` domain logic (cell, cell-health, health-rubric), `observability/`,
  `security/rate-limit.ts`
- `proxy.ts`, `types/database.ts` + `enums.ts`
- `supabase/migrations/` (base schema + RLS + RPC families across pivot phases),
  `supabase/functions/` (invite-user, redeem-invite, manage-test-auth-users),
  `supabase/config.toml`
- `tests/fitness/**`, `tests/integration/**`, `tests/a11y/**`; vitest/playwright
  configs; `.github/workflows/` (ci, rls-integration, seeded-auth-route-smoke)
- `.env.example` (names only)

Four parallel research agents mapped: data model, lib/read-write paths,
routes/actions, and config/integrations/CI.

## Source areas skipped (deliberately)

- `node_modules/`, `.next/`, lockfiles, generated artifacts
- Component-level UI under `components/**` (documented at directory level, not
  per-file — out of scope for high-signal knowledge)
- Full per-ADR contents (indexed, not transcribed)
- Individual migration internals beyond schema/RLS/RPC structure
- `docs/julian-inputs/`, retired/archived docs in git history

## Known uncertainty

- `types/database.ts` is hand-rolled and may drift from SQL migrations — SQL is
  ground truth.
- Exact production feature-flag / nav-visibility state is runtime data
  (`platform_config`), not in-repo.
- Some RPC signatures were enumerated from typed arg maps and may lag the newest
  migrations.
- Husky pre-commit enforcement: CLAUDE.md says active; one inspection suggested
  developer-optional — flagged for human verification.
- Production project ref / SMTP / Upstash instance: operational secrets, omitted.

## No secrets exposed

No tokens, keys, passwords, or private credentials were written. A production
Supabase project ref surfaced during research was intentionally excluded.
Env vars are documented by name and purpose only.

## Recommended next improvements

- Split `data/index.md` into per-domain Data Model files (care, multiplication,
  audit/compliance) if deeper schema detail is needed.
- Add `api/edge-functions.md` with full request/response contracts for
  `invite-user` / `redeem-invite`.
- Add a dedicated `auth/rls-visibility.md` mirroring
  `docs/architecture/RLS_VISIBILITY.md` with a per-table policy matrix.
- Add `workflows/migrations.md` detailing the schema-first release discipline
  and `supabase db push` verification steps.
- Add a runbook per failure mode (separate files) once incident patterns emerge.
- Re-validate RPC signatures directly against the latest migration SQL.
