# Fvclifegroups Codex Repo Sweep Plan

## 1. Executive Summary

The Fvclifegroups app is a mature Next.js App Router application with a clear product boundary around Life Groups administration, leader workflows, over-shepherd coverage, and invite-based account onboarding. The codebase already has several strong foundations: explicit Supabase read allowlists, centralized auth/session guards, narrow RPC-backed write paths, extensive migration-level RLS/audit tests, a dedicated accessibility harness, and deployment runbooks that document production-sensitive Supabase behavior.

No confirmed P0 issue was found in this read-only sweep. The highest-leverage near-term work is stability and maintainability work that protects the current UI rather than redesigning it:

- Restore the local validation baseline. `npm.cmd run lint`, `npm.cmd run typecheck`, and `npm.cmd run test:run` all failed before reaching their underlying tools because local `node_modules/.bin` shims are missing or empty, while `npm.cmd ls --depth=0` and `npm.cmd audit --audit-level=moderate` succeeded.
- Add a top-level safety net to the shared server-action write runner so unexpected validator, RPC, or revalidation exceptions return typed form errors and finish action logs consistently.
- Normalize route-level unavailable, loading, and empty states where current leader/admin detail pages can still throw read failures to page boundaries.
- Add a regression guard around production Edge Function deployment so the test-only `manage-test-auth-users` function remains disabled and production continues to run only `invite-user` and `redeem-invite`.
- Refresh stale architecture documentation so future agents and maintainers do not rediscover route, role, and data-access boundaries from source alone.

Database, schema, policy, seed, and major UI redesign work should remain out of the practical near-term sweep unless split into explicit follow-up PRs with measured evidence and review.

## 2. Sweep Method

This sweep inspected the repo in read-only mode, with no source edits and no database changes during inspection.

Areas reviewed:

- App routing and layouts under `app/`, including public, protected, admin, leader, over-shepherd, account, invite, reset, support, and a11y harness routes.
- UI/component organization under `components/`, especially `components/lg`, `components/admin`, `components/pastoral`, and shared primitives.
- Auth/session/role boundaries in `lib/auth`, protected layouts, middleware, and route-specific guards.
- Supabase reads, write runners, RPC wrappers, Edge Functions, migrations, RLS/audit tests, and release docs.
- Loading, error, empty-state, mobile, and accessibility coverage.
- CI, lint/type/test/build/a11y scripts, package metadata, Husky/lint-staged, and dependency health.
- Documentation under `docs/`, including architecture, deployment, release, product definition, and store/readiness docs.

Commands and checks run:

```powershell
git status --short --branch
rg --files app components lib tests supabase docs .github scripts types
rg -n "select\(" app lib components supabase
rg -n "service_role|SERVICE_ROLE|SUPABASE_SERVICE|dangerouslySetInnerHTML|innerHTML|eval\(|new Function|console\.log|console\.error|TODO|FIXME|@ts-ignore| as any|: any|\bany\b" app lib components supabase scripts tests types
rg -n "\.delete\(|delete\(\)|delete from|truncate |drop policy|grant .* to authenticated|grant .* to anon|security definer|audit_events|set search_path" app lib supabase scripts tests
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run test:run
npm.cmd ls --depth=0
npm.cmd audit --audit-level=moderate
```

Observed command results:

- `git status --short --branch`: clean `main...origin/main`.
- `npm.cmd run lint`: failed at `scripts/verify-toolchain.mjs`; local ESLint binary was not found.
- `npm.cmd run typecheck`: failed at `scripts/verify-toolchain.mjs`; local TypeScript binary was not found.
- `npm.cmd run test:run`: failed at `scripts/verify-toolchain.mjs`; local Vitest binary was not found.
- `npm.cmd ls --depth=0`: succeeded and showed installed top-level dependencies.
- `npm.cmd audit --audit-level=moderate`: succeeded with `found 0 vulnerabilities`.
- `node_modules/.bin` exists, but the expected local command shims were not present, so the validation failures are currently best treated as local install integrity failures rather than source failures.

## 3. Current Architecture Map

The app is a Next.js 15 App Router application using React 19, TypeScript, Tailwind, Supabase Auth/Postgres/RLS, Supabase Edge Functions, Vitest, Testing Library, Playwright, and axe-based accessibility checks.

Major directories and responsibilities:

- `app/`: Route tree and route-level server components/actions. Public flows include landing/login, forgot/reset password, invite redemption, welcome/name selection, support, account deletion, unauthorized, and the a11y harness. Protected flows include admin, super-admin tools, leader group detail workflows, over-shepherd coverage, account, frozen routes, and feature-flagged areas.
- `components/`: Reusable UI and feature components. `components/lg` contains the newer app shell/design-system surface; `components/admin` contains dense operational admin tools; `components/pastoral` supports leader/over-shepherd pastoral views; `components/ui` contains primitives.
- `lib/`: Domain logic, auth/session helpers, role checks, Supabase read seams, RPC wrappers, write-action runners, form handling, observability, crypto/private-note helpers, rate limiting, and shared utilities.
- `supabase/`: Migrations, seed material, templates, config, and Edge Functions. Production-intended Edge Functions are `invite-user` and `redeem-invite`; `manage-test-auth-users` is local/test tooling and is disabled in `supabase/config.toml`.
- `tests/`: Unit/component tests plus accessibility, mobile, live-route, and RLS-oriented regression coverage.
- `docs/`: Product, architecture, ADR, runbook, deployment, release, and store/readiness documentation.

Core data and auth patterns:

- Server-side Supabase access flows through `createSupabaseServerClient()` and related seams.
- `getCurrentSession()` loads the authenticated user, profile, role, and leader assignments through explicit selected columns and validation.
- Protected layouts and helpers centralize `requireAdmin`, `requireSuperAdmin`, `requireLeader`, and `requireOverShepherd` checks.
- Admin and leader writes generally flow through `runAdminWriteAction` / `runLeaderWriteAction`, shared `runWriteAction`, validators, RPC wrappers, and controlled `revalidatePath` targets.
- Supabase reads use explicit column allowlists and focused read modules. The sweep did not find live app usage of broad `select("*")` against privacy-sensitive tables.
- Service-role usage is confined to migrations/tests and Supabase Edge Functions in the inspected code paths, with release documentation calling out production function limits.

## 4. Priority Findings

| Priority | Area                                | Finding                                                                                                                                                                  | Impact                                                                                                                                | Recommended Action                                                                                                                                                                                 | Risk   |
| -------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| P0       | Critical blocker/security           | No confirmed P0 was found in this read-only sweep.                                                                                                                       | No immediate critical blocker was verified.                                                                                           | Continue treating auth, RLS, audit, service-role, and privacy boundaries as highest priority during future PR review.                                                                              | Low    |
| P1       | Developer experience / validation   | Local validation commands cannot currently run because expected `node_modules/.bin` shims for ESLint, TypeScript, and Vitest are missing.                                | Future source changes cannot be trusted locally until lint/type/test commands reach their actual tools.                               | Repair the local install with `npm ci` or a carefully controlled `npm install`, then rerun lint, typecheck, unit tests, a11y, and build. Avoid lockfile churn unless intentional.                  | Low    |
| P1       | Server actions / stability          | Shared `runWriteAction` does not have a top-level exception safety net, even though observability comments describe an `unhandled_exception` finish pattern.             | Unexpected throws from parsing, guards, RPC mapping, or revalidation can bypass typed form errors and leave inconsistent action logs. | Add catch/finally behavior to the shared runner and focused tests for thrown validators, guards, RPC calls, and revalidation. Preserve existing expected validation/auth failures.                 | Medium |
| P1       | UX / error handling                 | Some high-traffic leader/admin detail routes still throw read failures to route boundaries while dashboard-style loaders degrade by section.                             | A partial Supabase/read failure can feel like a broken workflow instead of a recoverable unavailable state.                           | Add route-local unavailable/empty states where safe, especially leader group care/calendar/check-in and admin group detail/calendar views. Keep auth, ownership, and privacy failures fail-closed. | Medium |
| P2       | Deployment / security guardrails    | `manage-test-auth-users` is correctly disabled in `supabase/config.toml`, but release docs record that it previously returned to production after deployment automation. | A future blanket function deploy could reintroduce local/test-only privileged tooling.                                                | Add a static guard or test that fails if production function config/docs drift from the allowlist: `invite-user` and `redeem-invite` only.                                                         | Low    |
| P2       | Documentation / maintainability     | `docs/architecture/ARCHITECTURE.md` lags the current route tree and product docs.                                                                                        | Future maintainers and agents can make poor assumptions about routes, role surfaces, and Edge Functions.                              | Refresh the architecture map and cross-link to product definition, RLS visibility, email delivery, and release docs.                                                                               | Low    |
| P2       | Role/auth validation                | Live role-route and mobile smoke tests depend on seeded credentials and can skip when credentials are absent.                                                            | Static and unit tests are strong, but role regressions may escape normal CI if no live/staging smoke path runs.                       | Add a documented optional or scheduled seeded-auth smoke workflow for admin, leader, over-shepherd, unauthorized, and mobile routes.                                                               | Medium |
| P2       | Performance / loading               | Several admin and leader views load large read bundles with uneven loading/degraded behavior.                                                                            | Slow Supabase reads can look like app failure, especially on mobile or weaker connections.                                            | Add lightweight timing instrumentation and route-level loading states before rewriting queries. Use measured slow paths to justify later query/index work.                                         | Low    |
| P3       | Components / UI consistency         | The app has strong newer shell patterns, but some admin, pastoral, leader, and over-shepherd surfaces still vary in empty/loading/error treatment.                       | Inconsistent polish creates friction without necessarily breaking behavior.                                                           | Incrementally align existing components and states. Do not redesign navigation or page structure in the sweep.                                                                                     | Low    |
| Later    | Architecture                        | Some read-model modules remain dense despite useful seams and extracted helpers.                                                                                         | Long-term maintenance remains harder in heavily loaded data modules.                                                                  | Extract by domain only when touching those flows, with tests preserved. Avoid a broad rewrite.                                                                                                     | Medium |
| Later    | Database/schema recommendation only | Index, RLS, or policy changes may be useful after real profiling or advisor evidence.                                                                                    | Schema changes are higher-risk and outside the current requested sweep.                                                               | Treat schema/database changes as future recommendations only, requiring separate migration PRs and measured evidence.                                                                              | Medium |

## 5. Recommended Sweep Roadmap

### Phase 1: Stabilize

Small, low-risk fixes that protect the app:

- Repair local dependency shims and establish a green validation baseline.
- Add the shared `runWriteAction` exception safety net and tests.
- Add an Edge Function production allowlist guard for `invite-user` and `redeem-invite`.
- Confirm `npm.cmd run lint`, `npm.cmd run typecheck`, `npm.cmd run test:run`, `npm.cmd run test:a11y`, and `npm.cmd run build` after install repair.

### Phase 2: Polish Core UX

Improve existing flows without redesigning the UI:

- Normalize loading, unavailable, and empty states for leader group care, calendar, and check-in routes.
- Normalize admin group detail/calendar read-failure behavior where a section can safely degrade.
- Keep the current app shell, navigation, dense admin tables, and role-specific page organization.
- Add regression coverage for the specific unavailable states so future query changes do not regress to full-page crashes.

### Phase 3: Strengthen Data/Auth

Recommendations around Supabase, auth, access rules, validation, and data handling:

- Preserve the current pattern of explicit column allowlists and narrow RPC-backed writes.
- Add static or unit guards for sensitive assumptions: no broad sensitive `select("*")`, service-role use only in Edge Functions/scripts/migrations, and test-only Edge Function disabled in committed config.
- Add optional live/staging route smoke for role boundaries. Keep regular CI deterministic and skip clearly when seeded credentials are absent.
- Do not implement schema, migration, RLS, or seed changes in this sweep.

### Phase 4: Tests and Quality Gates

Regression protection:

- Once local install integrity is repaired, re-establish the baseline command set: lint, typecheck, unit tests, a11y, and build.
- Add focused tests around shared write-action exception handling.
- Add tests or static checks for Edge Function deployment config.
- Add route/component tests for leader/admin unavailable states.
- Document any live/staging smoke requirements so skipped credential-dependent tests are intentional.

### Phase 5: Larger Modernization Options

Only justified as later work:

- Continue extracting large read-model modules by domain as those areas are touched.
- Consider schema/index/RLS changes only after measured slow queries, Supabase advisor output, or concrete security review evidence.
- Consider shell consolidation across admin, leader, and over-shepherd surfaces only if it can preserve current workflows and mobile behavior.
- Consider richer observability for slow read bundles after the shared action logging and local validation baseline are stable.

## 6. PR-Sized Task List

### 1. Restore local validation baseline

- Why it matters: Future agents and maintainers need lint, typecheck, tests, a11y, and build to run before trusting source changes.
- Files likely involved: none. If an install command updates `package-lock.json`, inspect carefully and avoid committing lockfile churn unless intentional.
- Acceptance criteria:
  - `npm.cmd run lint` reaches ESLint.
  - `npm.cmd run typecheck` reaches TypeScript.
  - `npm.cmd run test:run` reaches Vitest.
  - `npm.cmd audit --audit-level=moderate` remains clean.
  - Any install or lockfile changes are understood and deliberate.
- Risk level: Low.
- Suggested order: 1.

### 2. Harden shared write-action exception handling

- Why it matters: The shared action runner is a broad stability boundary for admin and leader mutations. Unexpected exceptions should not bypass typed form handling or action logs.
- Files likely involved: `lib/shared/run-action.ts`, `lib/admin/__tests__/run-action.test.ts`, `lib/leader/__tests__/run-action.test.ts`.
- Acceptance criteria:
  - Unexpected validator, guard, RPC, mapper, and revalidation throws are covered by focused tests.
  - The action log finishes with a consistent `unhandled_exception` signal.
  - The returned action result is a generic typed error that does not leak sensitive details.
  - Existing auth, validation, RPC error, success, and typed revalidation behavior remains unchanged.
- Risk level: Medium.
- Suggested order: 2.

### 3. Add production Edge Function allowlist guard

- Why it matters: `manage-test-auth-users` is intentionally local/test-only and has previously reappeared in production after automation.
- Files likely involved: `supabase/config.toml`, `docs/runbooks/RELEASE.md`, a small test or script following existing repo conventions.
- Acceptance criteria:
  - A committed check fails if `manage-test-auth-users` is enabled.
  - The check documents or verifies that production-intended functions are exactly `invite-user` and `redeem-invite`.
  - Release docs remain consistent with the guard.
  - No Supabase schema, policy, migration, or seed files are changed.
- Risk level: Low.
- Suggested order: 3.

### 4. Normalize leader detail unavailable states

- Why it matters: Leader-facing workflows should remain usable and understandable when non-auth read dependencies fail.
- Files likely involved: `app/(protected)/leader/[groupId]/care/page.tsx`, `app/(protected)/leader/[groupId]/calendar/page.tsx`, `app/(protected)/leader/[groupId]/checkin/page.tsx`, nearby components/tests.
- Acceptance criteria:
  - Recoverable read failures show clear unavailable states inside the existing page layout.
  - Auth, membership, group ownership, and privacy failures remain denied, not found, or fail-closed as they are today.
  - Existing successful leader flows and mobile layout are preserved.
  - Tests cover at least one recoverable read failure per touched route family.
- Risk level: Medium.
- Suggested order: 4.

### 5. Normalize admin group detail/calendar unavailable states

- Why it matters: Admin pages are dense operational tools; partial read failures should not unnecessarily break the entire page when a section can degrade safely.
- Files likely involved: admin group detail/calendar pages, existing admin group data loaders, and related tests.
- Acceptance criteria:
  - Recoverable section failures render scoped unavailable states.
  - Security-sensitive or identity-sensitive failures remain fail-closed.
  - Existing tables, filters, drawers, and action flows are not redesigned.
- Risk level: Medium.
- Suggested order: 5.

### 6. Refresh architecture documentation

- Why it matters: Current docs should match the route tree and data/auth model so future work does not begin with stale assumptions.
- Files likely involved: `docs/architecture/ARCHITECTURE.md`, possibly `docs/README.md`.
- Acceptance criteria:
  - Public, admin, super-admin, leader, over-shepherd, frozen, invite, support, and account routes are accurately summarized.
  - Data/auth/write patterns are described at the behavior level.
  - Edge Function responsibilities and production deployment boundaries match `supabase/config.toml` and release docs.
  - The doc points to `docs/PRODUCT_DEFINITION.md`, `docs/architecture/RLS_VISIBILITY.md`, and `docs/runbooks/RELEASE.md` instead of duplicating too much detail.
- Risk level: Low.
- Suggested order: 6.

### 7. Add optional seeded-auth route smoke workflow

- Why it matters: Role-bound pages need at least one trustworthy live/staging validation path beyond static and unit tests.
- Files likely involved: `tests/a11y/leader-routes.spec.ts`, `tests/a11y/mobile-smoke.spec.ts`, `.github/workflows/*`, and runbook docs.
- Acceptance criteria:
  - Normal CI remains deterministic and does not require production secrets.
  - The live/staging smoke path runs only when explicit credentials and base URL are present.
  - Admin, leader, over-shepherd, unauthorized, and mobile routes are represented.
  - Skips are reported clearly when credentials are absent.
- Risk level: Medium.
- Suggested order: 7.

### 8. Add read-bundle timing and loading polish

- Why it matters: Performance work should be guided by measured slow routes rather than broad query rewrites.
- Files likely involved: dashboard/admin/leader read loaders, existing observability helpers, and route loading components where missing.
- Acceptance criteria:
  - Slow read bundles can be identified in development or logs without exposing private data.
  - Existing page layouts and data contracts are unchanged.
  - Loading states reduce perceived breakage on slower connections.
  - Any later index/query recommendation links back to measured evidence.
- Risk level: Low.
- Suggested order: 8.

### 9. Incrementally split dense read-model modules

- Why it matters: Large read modules increase the cost of safe changes.
- Files likely involved: `lib/supabase/read-models.ts` and related domain read modules, only when already touched by another PR.
- Acceptance criteria:
  - Extraction is domain-scoped and behavior-preserving.
  - Existing imports either remain compatible or are migrated in a small, tested PR.
  - No schema or data contract changes are introduced.
- Risk level: Medium.
- Suggested order: Later.

## 7. Do-Not-Break Checklist

Preserve these behaviors and assumptions during future implementation:

- Role routing and authorization for `admin`, `super_admin`, `leader`, `co_leader`, and `over_shepherd`.
- Feature-flag behavior for leader-facing surfaces and check-ins.
- Existing login, forgot-password, reset-password, invite redemption, welcome/name-selection, support, and account-deletion flows.
- Current admin navigation, dense tables, filters, drawers, operational actions, and frozen/alias routes.
- Leader group care, calendar, and check-in workflows, including fail-closed behavior where data ambiguity affects attendance or privacy.
- Over-shepherd coverage and profile visibility boundaries.
- Private data boundaries: no leader exposure of `admin_private_note`; no admin-only shepherd-care data on leader routes; no broad privacy-sensitive `select("*")`.
- Supabase RLS/RPC/audit model: writes should continue through narrow server actions/RPCs, with audit expectations preserved.
- Service-role confinement to Supabase Edge Functions or controlled scripts/migrations; never introduce service-role usage into normal Next runtime.
- Production Edge Function set: `invite-user` and `redeem-invite`; keep `manage-test-auth-users` disabled and out of production.
- Soft-delete/tombstone behavior; avoid hard deletes except explicit super-admin danger-zone workflows.
- Existing mobile shell behavior, skip links, accessible names, modal/dialog semantics, and a11y harness assumptions.
- CI determinism: regular CI should not depend on live production secrets or mutable external state.
- No database schema, migration, RLS policy, or seed changes unless the future task explicitly calls for a separate migration PR.

## 8. Open Questions

- Should the optional seeded-auth route smoke workflow target a production-like staging environment only, or should it also support local Supabase when developers have seeded test accounts?
- Which route family should be the first UX polish PR after stabilization: leader group care/calendar/check-in, or admin group detail/calendar?
- Should architecture docs remain one concise current map, or should route, data-access, and security maps be split once the first refresh is complete?
