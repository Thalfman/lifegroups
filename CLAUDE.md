# CLAUDE.md

Operational guide for AI assistants doing engineering work in this repo. It
covers how to build and test, where things live, and the **hard invariants you
must not violate**. It deliberately does **not** restate the domain glossary or
architecture decisions — those live in dedicated docs. Read these first:

- **[`README.md`](./README.md)** — what the app is, the role model, the route
  table, and the security posture.
- **[`CONTEXT.md`](./CONTEXT.md)** — the domain glossary. **Use this
  vocabulary** in code, UX copy, and commit messages.
- **[`docs/README.md`](./docs/README.md)** — the documentation index (historical
  docs are retired to git history, not kept in-tree).
- **[`AGENTS.md`](./AGENTS.md)** — review priorities for the (advisory) Codex
  loop; the P0 list there is the source of the security invariants below.

## What this is

**Julian's admin operating system for shepherding Life Group Leaders.** Next.js
16 (App Router) + React 19 + TypeScript + Tailwind, on Supabase (Auth +
Postgres + RLS). As of the **2026-06 pivot (ADR 0016)** the navigation spine is
three areas — **Care · Plan · Multiply** — surfaced under `/admin`, joined by
the **Groups** and **People** management tabs (seeded back on by ADR 0024; the
Super-Admin console can re-hide them). The remaining pre-pivot surfaces
(Planning, master calendar, guests, check-ins, …) still resolve by direct URL
but stay hidden behind Super-Admin nav flags (turned off, not deleted).

## Commands

| Command                    | What it does                                |
| -------------------------- | ------------------------------------------- |
| `npm run dev`              | Next dev server (http://localhost:3000)     |
| `npm run build`            | Production build                            |
| `npm run analyze`          | Build + Turbopack bundle analyzer (sizes)   |
| `npm run start`            | Serve the production build                  |
| `npm run lint`             | ESLint CLI (`next/core-web-vitals`)         |
| `npm run typecheck`        | `tsc --noEmit` (strict)                     |
| `npm test`                 | Vitest, watch mode                          |
| `npm run test:run`         | Vitest once (what CI runs)                  |
| `npm run test:a11y`        | Playwright + axe accessibility suite        |
| `npm run seed:test-auth`   | Create local test Auth users (`tsx` script) |
| `npm run remove:test-auth` | Remove local test Auth users                |

- **Run a single test:** `npx vitest run path/to/file.test.ts` (add `-t "name"`
  to filter by test name).
- **Pre-commit hook** (`.husky/pre-commit`) runs `lint-staged` (Prettier on
  staged files) → `npm run typecheck` → `npm run test:run`. A commit therefore
  runs the full unit suite and a typecheck; keep both green before committing.
- Env vars are **optional** for build (`cp .env.example .env.local` only to wire
  up live Supabase data and sign-in). Without them, public preview routes render
  typed demo data and protected routes redirect to `/login`.
- **Performance baselines.** Next 16's Turbopack build no longer prints the
  per-route First Load JS table, so bundle sizing goes through
  `npm run analyze` — it writes a Turbopack-accurate report to
  `.next/diagnostics/analyze/` (drop `--output` from the script to explore it
  interactively on `:4000`). For **client render/paint** cost, the
  `tests/a11y/perf-harness.spec.ts` spec captures Navigation Timing, first
  paint, long tasks, and per-surface DOM-node counts against the gated
  `/a11y-harness` route and attaches a JSON artifact (measurement-only, no
  threshold gate). **Server** read latency is a production signal: the
  `measureReadBundle` wrappers (`lib/observability/read-timing.ts`) emit
  `read_bundle` lines collectable from the log drain — authed `/admin/*` routes
  can't be timed locally (they redirect to `/login` without Supabase env).

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
docs/                 adr/ (decisions), architecture/, agents/, plans/
proxy.ts              Refreshes the Supabase session cookie on every request
                        (Next 16's renamed `middleware` convention)
```

## Architecture & data flow

Pages are thin async Server Components that guard auth, load data, and hand a
typed shape to a stateful client **shell**. There are two paths:

- **Read path.** A cookie-authenticated server client (`@supabase/ssr`, set up
  in `lib/supabase/`) runs every query through **Row Level Security**, scoped to
  the signed-in user. Reads go through the **reads seam** (ADR 0015) so tests can
  inject in-memory adapters instead of a live database. Every table read uses
  explicit **column allowlists** (named columns, never `select("*")`) — there
  are no `select("*")` call sites, and the `profiles` / `members` reads (e.g.
  `lib/auth/session.ts` via `SESSION_PROFILE_COLUMNS`) select named columns like
  the rest. The former broad-read debt is closed; keep it that way by adding only
  named-column reads. Reads **degrade gracefully** — a failed read
  suppresses derived output rather than reporting a false zero. Public preview
  routes never call Supabase; they render typed demo data.

- **Write path.** Server Actions (`app/**/actions.ts`) follow a fixed pipeline:
  **validate → guard → RPC → `revalidatePath` → log**. Every app-driven write
  goes through a narrow **`SECURITY DEFINER` RPC** — mostly the `public.admin_*`
  / `leader_*` / `over_shepherd_*` / `super_admin_*` families, plus a few
  purpose-named ones such as `set_note_transparency_grant` (typed wrappers in
  `lib/**/rpc.ts`), and each RPC writes a paired **`audit_events`** row **in the
  same transaction**. The shared skeleton is the Write Action Runner (ADR
  0001/0005);
  per-surface adapters (`lib/admin/run-action.ts`, etc.) supply only the pure
  bits (validator, guard, RPC call, log fields, revalidate paths).

## Security invariants — MUST follow

These are hard rules. Violating one is a P0 (see `AGENTS.md` and the README
"Security posture"). Treat them as non-negotiable. Several are now
**machine-checked** by the fitness suite (`tests/fitness/**`) in the gating CI
lane (`npm run test:run`) — no service-role key, no `select("*")`, no direct
table writes, no hardcoded identity in `lib/auth/**`/RLS, and run-action routing
— so a regression fails the build. The scans are static; the audit-pairing,
no-broad-RLS, and no-hard-delete rules still rely on review.

- **No service-role key in Next runtime code.** The service role is confined to
  Supabase Edge Functions (`invite-user`, `manage-test-auth-users`,
  `redeem-invite`).
- **All writes go through the narrow `SECURITY DEFINER` RPCs above.** Never write
  tables directly from app code, and never add broad write RLS policies or
  migrations that grant wider access than intended.
- **Every mutation writes a paired `audit_events` row in the same transaction.**
- **No hard deletes** in normal workflows. **Archive** (soft — `archived_at` /
  status flags) is the default way anything leaves a surface. Permanent deletion
  is Super-Admin-only, writes a tombstone, and lives in the danger zone.
- **Every table read uses explicit column allowlists**, not `select("*")` —
  there are no `select("*")` call sites (including `profiles` / `members`). This
  is a satisfied invariant: keep it green by adding only named-column reads.
- **Authorization is role-based.** No Julian/Tom UUIDs or emails are hardcoded
  in code, migrations, or RLS — gate on `profiles.role`.
- **Respect the two visibility exceptions:** the Ministry Admin's **Private Care
  Note** (hidden even from the Super Admin) and author-private **Care Notes**
  (sealed to their author until the Ministry Admin flips that person's
  transparency toggle — after which the Super Admin can read them too, per the
  normal ladder; RLS gates both admins via `auth_is_admin()`). Never expose
  `admin_private_note` to leader routes; don't expand the deprecated
  `staff_viewer` role.

## Roles (oversight ladder)

A strict downward-visibility ladder — each tier sees what the tier below sees,
and more: **Super Admin (Tom) ▸ Ministry Admin (Julian) ▸ Over-Shepherd ▸
Leader**. The Leader login is **live by default** (ADR 0024 seeded the
verified `leader_surface` flag on per ADR 0017/0009; the Super-Admin console
can re-freeze it, and check-ins stay behind their own gate). `member` is
**not** an app-login role (members are non-auth records).
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

Defer to [`CONTEXT.md`](./CONTEXT.md) for definitions. Must-use terms:
**Shepherd** / **Co-Shepherd** in **user-facing copy** (ADR 0025 reversed ADR
0008 — but the **code identity stays `leader` / `co_leader`**: the role enum
values, `leader_*` RPCs, `/leader` routes, and `Leader*` types are deliberately
unchanged, mirroring the existing `shepherd_care_*` / `over_shepherd` naming —
never rename them to "shepherd"), **Over-Shepherd**, **Ministry Admin**, **Care
Note** and **Prayer Request** (distinct), **Prospect** in the **Interest Funnel**
(not "Guest" / "Lead" / "Guests pipeline"), **Group type** (a single free-text
label per group, chosen from the admin-managed list — the Audience × Category
"Cell" model was retired), **Multiplication**, **Archive** (soft delete). Use
these terms in UX copy and commit messages; in code identifiers, keep
`leader` / `co_leader`.

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
  PRD #371 (slices #372–#382), then amended by
  [`0022`](./docs/adr/0022-multiply-unifies-plan-readiness-leaders.md): Multiply
  now hosts the **Plan**, **Readiness**, and **Leaders** tabs (target the visible
  `/admin/multiply` surface, not the off-nav Planning / leader-pipeline hosts).
  [`0023`](./docs/adr/0023-all-notes-feed-and-admin-authorship.md) adds the Care
  area's aggregate **Notes** tab + admin Care-Note authorship, and
  [`0024`](./docs/adr/0024-default-on-leader-surface-and-groups-people-nav.md)
  defaults the Leader surface and the Groups/People nav tabs to on.
  `docs/adr/` holds the full decision record (0001 onward).
- **Engineering reference:**
  [`docs/architecture/ARCHITECTURE.md`](./docs/architecture/ARCHITECTURE.md),
  [`DATABASE_SCHEMA.md`](./docs/architecture/DATABASE_SCHEMA.md),
  [`DEPLOYMENT.md`](./docs/architecture/DEPLOYMENT.md).
- **Original North Star:**
  [`docs/julian-inputs/SYSTEMS_CONVERSATION.md`](./docs/julian-inputs/SYSTEMS_CONVERSATION.md)
  — Julian's twelve questions (re-shaped by the pivot, kept as the source of his
  words).
