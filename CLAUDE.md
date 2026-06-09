# CLAUDE.md

Operational guide for AI assistants doing engineering work in this repo. It
covers how to build and test, where things live, and the **hard invariants you
must not violate**. It deliberately does **not** restate the domain glossary or
architecture decisions — those live in dedicated docs. Read these first:

- **[`README.md`](./README.md)** — what the app is, the role model, the route
  table, and the security posture.
- **[`CONTEXT.md`](./CONTEXT.md)** — the domain glossary. **Use this
  vocabulary** in code, UX copy, and commit messages.
- **[`docs/README.md`](./docs/README.md)** — the documentation index (what's
  live, what's archived).
- **[`AGENTS.md`](./AGENTS.md)** — review priorities for the (advisory) Codex
  loop; the P0 list there is the source of the security invariants below.

## What this is

**Julian's admin operating system for shepherding Life Group Leaders.** Next.js
15 (App Router) + React 19 + TypeScript + Tailwind, on Supabase (Auth +
Postgres + RLS). As of the **2026-06 pivot (ADR 0016)** the live navigation
spine is three areas — **Care · Plan · Multiply** — surfaced under `/admin`.
Older number/assignment surfaces still resolve by direct URL but are hidden
behind Super-Admin nav flags (off by default — turned off, not deleted).

## Commands

| Command                    | What it does                                 |
| -------------------------- | -------------------------------------------- |
| `npm run dev`              | Next dev server (http://localhost:3000)      |
| `npm run build`            | Production build                             |
| `npm run start`            | Serve the production build                   |
| `npm run lint`             | ESLint (`next lint`, `next/core-web-vitals`) |
| `npm run typecheck`        | `tsc --noEmit` (strict)                      |
| `npm test`                 | Vitest, watch mode                           |
| `npm run test:run`         | Vitest once (what CI runs)                   |
| `npm run test:a11y`        | Playwright + axe accessibility suite         |
| `npm run seed:test-auth`   | Create local test Auth users (`tsx` script)  |
| `npm run remove:test-auth` | Remove local test Auth users                 |

- **Run a single test:** `npx vitest run path/to/file.test.ts` (add `-t "name"`
  to filter by test name).
- **Pre-commit hook** (`.husky/pre-commit`) runs `lint-staged` (Prettier on
  staged files) → `npm run typecheck` → `npm run test:run`. A commit therefore
  runs the full unit suite and a typecheck; keep both green before committing.
- Env vars are **optional** for build (`cp .env.example .env.local` only to wire
  up live Supabase data and sign-in). Without them, public preview routes render
  typed demo data and protected routes redirect to `/login`.

## Repo map

```
app/                  Next.js App Router. (protected)/ holds role-gated routes:
                        admin/ (Care · Plan · Multiply · Settings · super-admin),
                        over-shepherd/, leader/ (flag-gated). Public: login,
                        forgot-password, reset-password, unauthorized.
components/           lg/  app shell, page headers, shared primitives
                      admin/ feature UI (care, plan, multiply, …)
                      ui/   low-level primitives    auth/ auth-flow UI
lib/                  auth/         session, roles, leader-surface flag
                      supabase/     server client, read models, reads seam
                      admin/        validators, typed RPC wrappers, run-action
                      shared/       action results, uuid, dates, RPC base
                      observability/ structured logging
                      over-shepherd/, leader/, nav/, home/
types/                Hand-rolled Supabase row types + enums (the trust boundary)
supabase/             migrations/ (schema + RLS), seed/, functions/ (Edge), dev/
tests/                a11y/ Playwright specs + harness, stubs/
docs/                 adr/ (decisions), architecture/, agents/, plans/, archive/
middleware.ts         Refreshes the Supabase session cookie on every request
```

## Architecture & data flow

Pages are thin async Server Components that guard auth, load data, and hand a
typed shape to a stateful client **shell**. There are two paths:

- **Read path.** A cookie-authenticated server client (`@supabase/ssr`, set up
  in `lib/supabase/`) runs every query through **Row Level Security**, scoped to
  the signed-in user. Reads go through the **reads seam** (ADR 0015) so tests can
  inject in-memory adapters instead of a live database. Sensitive tables use
  explicit **column allowlists** (named columns, never `select("*")`). Reads
  **degrade gracefully** — a failed read suppresses derived output rather than
  reporting a false zero. Public preview routes never call Supabase; they render
  typed demo data.

- **Write path.** Server Actions (`app/**/actions.ts`) follow a fixed pipeline:
  **validate → guard → RPC → `revalidatePath` → log**. Every app-driven write
  goes through a narrow `public.admin_*` / `leader_*` / `over_shepherd_*` /
  `super_admin_*` **`SECURITY DEFINER` RPC** (typed wrappers in `lib/**/rpc.ts`),
  and each RPC writes a paired **`audit_events`** row **in the same
  transaction**. The shared skeleton is the Write Action Runner (ADR 0001/0005);
  per-surface adapters (`lib/admin/run-action.ts`, etc.) supply only the pure
  bits (validator, guard, RPC call, log fields, revalidate paths).

## Security invariants — MUST follow

These are hard rules. Violating one is a P0 (see `AGENTS.md` and the README
"Security posture"). Treat them as non-negotiable.

- **No service-role key in Next runtime code.** The service role is confined to
  Supabase Edge Functions (`invite-user`, `manage-test-auth-users`).
- **All writes go through the narrow `SECURITY DEFINER` RPCs above.** Never write
  tables directly from app code, and never add broad write RLS policies or
  migrations that grant wider access than intended.
- **Every mutation writes a paired `audit_events` row in the same transaction.**
- **No hard deletes** in normal workflows. **Archive** (soft — `archived_at` /
  status flags) is the default way anything leaves a surface. Permanent deletion
  is Super-Admin-only, writes a tombstone, and lives in the danger zone.
- **Sensitive tables use explicit column allowlists**, not `select("*")`.
- **Authorization is role-based.** No Julian/Tom UUIDs or emails are hardcoded
  in code, migrations, or RLS — gate on `profiles.role`.
- **Respect the two visibility exceptions:** the Ministry Admin's **Private Care
  Note** (hidden even from the Super Admin) and author-private **Care Notes**
  (readable by the Ministry Admin only via the per-person transparency toggle).
  Never expose `admin_private_note` to leader routes; don't expand the
  deprecated `staff_viewer` role.

## Roles (oversight ladder)

A strict downward-visibility ladder — each tier sees what the tier below sees,
and more: **Super Admin (Tom) ▸ Ministry Admin (Julian) ▸ Over-Shepherd ▸
Leader**. The Leader login is built and RLS-re-audited but **gated behind the
`leader_surface` flag** (ADR 0017/0009); leaders land on `/unauthorized` until
it flips. `member` is **not** an app-login role (members are non-auth records).
See the README for the full model and route table. Auth helpers:
`lib/auth/roles.ts` and `lib/auth/session.ts` — use redirect-guards
(`requireAdmin`, `requireOverShepherd`, `requireLeader`) in pages and
result-returning guards (`requireAdminSession`, …) in server actions.

## Code conventions

- **TypeScript strict.** Import via the `@/*` path alias (e.g. `@/lib/...`,
  `@/components/...`) — no deep relative paths.
- **Prettier** (`.prettierrc`: 2-space indent, 80 columns, double quotes,
  semicolons, es5 trailing commas, always-parens arrows). Match it so the
  pre-commit hook doesn't reflow your edits.
- **File-name conventions:** `*-shell.tsx` (stateful `"use client"` container),
  `*-data.ts` (read orchestration / reads-seam binding), `*-reads.ts` (RLS
  reads with column allowlists), `*-validation.ts` (pure validators returning a
  result), `*-rpc.ts` / `rpc.ts` (typed RPC wrappers), `actions.ts` /
  `*-actions.ts` (server actions).
- **Patterns to mirror:** thin async pages + stateful shells; **discriminated
  unions** for outcomes (`SessionResult`, action results — switch on `kind`);
  the validate → guard → RPC pipeline; structured logging via
  `lib/observability` (`event`, `outcome`, `actor_role`, …).

## Testing

- **Unit/component:** Vitest. Tests are colocated under
  `**/__tests__/**/*.test.ts(x)` (most live in `lib/admin/__tests__/`). The reads
  seam lets tests inject in-memory adapters — no live Supabase needed.
- **Accessibility:** Playwright + `@axe-core/playwright` under `tests/a11y/`,
  driven against the `NEXT_PUBLIC_A11Y_HARNESS` build route. Shared helpers and
  the documented non-blocking-rule carve-out live in `tests/a11y/harness.ts`.
- Add or update tests alongside behavior changes; CI gates on both suites.

## Git / PR / CI

- **Branches:** `claude/<slug>-<id>`. **Commits:** concise, imperative subjects
  that describe intent (not implementation), e.g. "Gate invite/recovery sessions
  to set-password until a password exists".
- **CI** (`.github/workflows/ci.yml`, on PRs and push to `main`): one job runs
  `lint` → `typecheck` → `test:run`; a second job runs the Playwright a11y
  suite. The **Codex review loop is advisory only** — it never auto-merges,
  enables auto-merge, or deletes branches.
- Issue tracker and triage-label conventions live in
  [`docs/agents/`](./docs/agents/).

## Domain vocabulary (use it)

Defer to [`CONTEXT.md`](./CONTEXT.md) for definitions. Must-use terms: **Leader**
(not "Shepherd" / "group leader"), **Over-Shepherd**, **Ministry Admin**, **Care
Note** and **Prayer Request** (distinct), **Prospect** in the **Interest Funnel**
(not "Guest" / "Lead" / "Guests pipeline"), **Cell** = Audience × Category,
**Multiplication**, **Archive** (soft delete). Use these terms in code
identifiers, UX copy, and commit messages.

## Where to look (docs map)

- **The pivot (current direction):** ADRs
  [`0016`](./docs/adr/0016-pivot-to-care-plan-multiply.md) (Care · Plan ·
  Multiply), [`0017`](./docs/adr/0017-reopen-leader-os-logins-and-care-notes.md)
  (Leader/OS logins + Care Notes),
  [`0018`](./docs/adr/0018-configurable-af-health-rubrics.md) (A–F rubrics),
  [`0019`](./docs/adr/0019-multiplication-by-type-and-pillars.md) and
  [`0021`](./docs/adr/0021-three-tier-multiplication-trigger.md) (multiplication
  by type / trigger),
  [`0020`](./docs/adr/0020-leader-care-note-is-group-scoped.md) — delivered via
  PRD #371 (slices #372–#382). `docs/adr/` holds the full decision record
  (0001 onward; 0022 is the latest).
- **Engineering reference:**
  [`docs/architecture/ARCHITECTURE.md`](./docs/architecture/ARCHITECTURE.md),
  [`DATABASE_SCHEMA.md`](./docs/architecture/DATABASE_SCHEMA.md),
  [`DEPLOYMENT.md`](./docs/architecture/DEPLOYMENT.md).
- **Original North Star:**
  [`docs/julian-inputs/SYSTEMS_CONVERSATION.md`](./docs/julian-inputs/SYSTEMS_CONVERSATION.md)
  — Julian's twelve questions (re-shaped by the pivot, kept as the source of his
  words).
