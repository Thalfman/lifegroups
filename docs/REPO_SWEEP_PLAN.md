# Fvclifegroups Repo Sweep Plan

> ⚠️ **Historical (re-statused 2026-07-03, #828).** This 2026-06-14 sweep
> predates the Next 16 upgrade and the 2026-07-03 full-codebase audit; its
> still-live items were re-triaged into that audit's issue set (see
> `docs/audits/`). Kept as the record of the two 2026-06-14 sweeps; do not
> work from it.
>
> A prioritized, implementation-ready improvement plan for the Life Group
> Operations app. **Consolidated from two independent read-only sweeps on
> 2026-06-14:** a Linux pass that ran and **verified** the full gate set
> (typecheck/lint/test/build), and a second pass (Windows toolchain) that could
> not verify the gates but surfaced additional findings — the write-runner
> exception net, an Edge-Function production allowlist guard, an architecture-doc
> refresh, an optional seeded-auth route smoke, and read-bundle timing. The two
> originals (`REPO_SWEEP_PLAN.md` and `CODEX_REPO_SWEEP_PLAN.md`) are replaced by
> this single doc. No source, schema, migration, policy, or seed data was changed
> in either pass.
>
> **How to use this doc:** Work the roadmap in phase order (§5). Each PR-sized
> task (§6) names the files involved, why it matters, and acceptance criteria.
> Before touching anything, read the **Do-Not-Break Checklist (§7)** — this app
> has hard security/privacy invariants that are currently fully satisfied, and
> the point of the sweep is to keep them that way while raising polish and
> resilience.

---

## 1. Executive Summary

The repo is in **strong, mature shape**. It is a Next.js 15 (App Router) +
React 19 + TypeScript + Tailwind admin app on Supabase (Auth + Postgres + RLS),
~145k LOC, organized around the 2026-06 **Care · Plan · Multiply** pivot.

**Baseline health (all verified locally on the Linux pass):**

| Gate                                          | Result                                                                                                          |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck` (tsc strict)              | ✅ pass                                                                                                         |
| `npm run lint` (eslint, next/core-web-vitals) | ✅ pass, **0 warnings**                                                                                         |
| `npm run test:run` (vitest)                   | ✅ **3351 passed**, 1 skipped, 269 files                                                                        |
| `npm run build` (next build)                  | ✅ pass                                                                                                         |
| `npm audit`                                   | ⚠️ 9 vulns — **all dev/transitive** (esbuild/vite/vitest chain, postcss-via-next); none in shipped runtime code |

> The second pass could not run lint/typecheck/test because its local
> `node_modules/.bin` shims were missing (a local install-integrity issue, not a
> source failure); `npm ci` resolves it. The verified results above are the
> source of truth.

**Biggest strengths.** The security posture is genuinely excellent and every
hard invariant in `CLAUDE.md` / `AGENTS.md` holds: no service-role key in Next
runtime, **zero direct table writes** (every mutation flows through a narrow
`SECURITY DEFINER` RPC with a paired `audit_events` row), **zero actual
`select("*")` calls** on any table (every read is column-allowlisted), the
`admin_private_note` is sealed with real client-side AES-256-GCM E2E encryption
(`lib/crypto/private-notes.ts`, a dependency-free Web Crypto module), and
authorization is role-based with no hardcoded identities. Tech debt is unusually
clean: **6** TODO/FIXME markers total, **0** `@ts-ignore`/`@ts-expect-error`.
Documentation (README, CONTEXT.md, 27 ADRs) tracks the code closely.

**Biggest risks (none are active data/security breaches — all are resilience &
process gaps):**

1. **CI never runs `npm run build`.** Lint/typecheck/test/a11y all gate, but a
   build-time failure (RSC/client-boundary, env inlining) can pass CI and only
   surface at deploy. Highest-leverage, lowest-risk fix in the repo.
2. **No HTTP security headers** (`next.config.ts` sets none): no CSP, HSTS,
   X-Frame-Options, X-Content-Type-Options, Referrer-Policy, or
   Permissions-Policy on an app handling sensitive pastoral-care data.
3. **The shared write-action runner has no top-level exception net.**
   `runWriteAction` (`lib/shared/run-action.ts`) is a linear pipeline with no
   try/catch/finally; an unexpected throw from validate/guard/fields/RPC/
   `revalidatePath` bypasses the `ActionResult` typed-error path and leaves an
   inconsistent action log.
4. **Server-action test coverage is thin** — ~15 of 45 action files have no
   tests; security-sensitive flows (`forgot-password`, `invite/[token]`,
   `people` writes) have none. RLS itself has no automated test.

**Highest-leverage opportunities.** Add a build gate + security headers + the
write-runner exception net + an Edge-Function production allowlist guard
(Phase 1, hours of work, protects deploys and hardens the app), then close the
mobile-table overflow and detail-route error/loading gaps (Phase 2, the most
visible UX wins), then broaden action/RLS test coverage (Phase 4). Most findings
are small, PR-sized, and carry low risk because the architecture is consistent
and well-tested.

**There are no P0 findings.** The codebase has no critical blocker, live data
leak, or broken invariant. This is a polish-and-harden sweep, not a rescue.

---

## 2. Sweep Method

**Read-only.** No source/schema/migration/policy/seed edits in either pass. The
only output is documentation.

**Commands run on the Linux pass (and their results):**

- `npm ci` — required first; the container shipped with `node_modules` absent,
  and the repo's `verify:toolchain` preflight correctly refused to run the
  tools until a clean install existed (this preflight is a DX strength). After
  install: 481 packages.
- `npm run typecheck` → **exit 0**.
- `npm run lint` → **exit 0**, 0 warnings.
- `npm run test:run` → **exit 0**, 3351 passed / 1 skipped / 269 files (~38s).
- `npm run build` → **exit 0**; reviewed the route/bundle table (shared First
  Load JS ~102 kB; middleware ~90 kB).
- `npm outdated` and `npm audit` — see §4 / Dependency findings.
- Targeted `grep`/`glob` sweeps: `select("*")` call sites, direct
  `.insert/.update/.delete/.upsert`, service-role usage, hardcoded emails/UUIDs,
  TODO/FIXME/`@ts-ignore`, `force-dynamic` (42 routes), `"use client"` (122/226
  components), `dark:` (0 uses), `loading.tsx`/`error.tsx`/`not-found.tsx`
  coverage, file sizes.
- Read key configs: `next.config.ts`, `.github/workflows/ci.yml`,
  `eslint.config.mjs`, `tsconfig.json`, `vitest.config.ts`, `.env.example`,
  `middleware.ts`, `lib/crypto/private-notes.ts`, `lib/supabase/read-models.ts`.

**The second pass** added a focused read of the shared write-action runner
(`lib/shared/run-action.ts`), the Edge-Function config
(`supabase/config.toml` — `manage-test-auth-users` is disabled; `invite-user` /
`redeem-invite` are the production set), release docs
(`docs/runbooks/RELEASE.md`), and `docs/architecture/ARCHITECTURE.md`. Its local
lint/typecheck/test invocations failed only because the install was incomplete;
they are not source failures.

**Areas reviewed (via parallel deep-dive sub-agents + direct inspection):**
architecture & app structure; routing & page organization; components & UI
consistency; UX flows; bugs/edge cases; Supabase/auth/RLS/data access;
performance & loading states; security & privacy; accessibility; error handling
& empty states; tests & validation; docs & maintainability; DX;
dependency/package health; mobile responsiveness; deployment readiness.

**Confidence notes.** Security/data-access findings were verified by grep across
the whole tree (high confidence). A few UX findings (e.g. group-detail loader
degradation behavior) are flagged **"verify first"** below where the conclusion
came from reading rather than running the path.

---

## 3. Current Architecture Map

**Stack.** Next.js 15 App Router, React 19, TypeScript (strict), Tailwind 3,
Supabase (`@supabase/ssr` cookie-auth client), Upstash rate-limiting, deployed
on Vercel (`@vercel/analytics` + `speed-insights`).

**Directory layout:**

```
app/            App Router. (protected)/ = role-gated:
                  admin/ (care, plan, multiply, groups, people, settings,
                  super-admin; + off-nav pre-pivot surfaces: planning,
                  launch-planning, follow-ups, guests, calendar, group-health,
                  check-ins, leader-pipeline, shepherd-care),
                  over-shepherd/, leader/. Public: login, forgot/reset-password,
                  invite/[token], welcome, unauthorized, support.
components/     lg/ (app shell, sidebar, page primitives, skeletons),
                admin/ (feature UI), ui/ (Button/Badge/Dialog primitives),
                auth/, pastoral/. 226 files, 122 are "use client".
lib/            auth/ (session, roles, guards, leader-surface flag),
                supabase/ (server client + reads seam + column-allowlisted
                read models), admin/ (validators, typed RPC wrappers,
                run-action), leader/ over-shepherd/ shared/ crypto/
                observability/ security/ (rate limit).
types/          Hand-rolled Supabase row types + enums (the trust boundary).
supabase/       119 migrations (schema + RLS), seed/, functions/ (Edge:
                invite-user, redeem-invite, manage-test-auth-users [disabled]),
                dev/.
docs/           27 ADRs, architecture/, runbooks/, agents/, plans/.
middleware.ts   Refreshes Supabase session cookie on every request.
```

**Core flows.**

- **Read path.** Thin async Server Component pages call `requireAdmin` /
  `requireOverShepherd` / `requireLeader` guards (`lib/auth/session.ts`), load
  data through the **reads seam** (ADR 0015 — injectable `ReadClient` so tests
  use in-memory adapters), and hand a typed shape to a stateful `*-shell.tsx`
  client container. Every query runs under RLS scoped to the signed-in user;
  reads **degrade gracefully** (a failed read suppresses derived output rather
  than reporting a false zero). Sensitive reads use explicit column allowlists
  (e.g. `LEADER_FOLLOW_UP_COLUMNS` deliberately omits `admin_private_note`).
- **Write path.** Server Actions (`app/**/actions.ts`) follow a fixed pipeline
  **validate → guard → RPC → revalidatePath → log**, implemented once in the
  Write Action Runner (`lib/shared/run-action.ts`, ADR 0001/0005) with
  per-surface adapters (`lib/admin/run-action.ts`, etc.). Every write goes
  through an `admin_*`/`leader_*`/`over_shepherd_*`/`super_admin_*`
  `SECURITY DEFINER` RPC that writes a paired `audit_events` row in the same
  transaction. RPC errors map to user copy via a large `RPC_ERROR_MESSAGES`
  table.
- **Auth/role model.** Strict downward-visibility ladder: **Super Admin ▸
  Ministry Admin ▸ Over-Shepherd ▸ Leader** (plus `co_leader` alongside leader),
  on `profiles.role`. Two visibility exceptions: the Ministry Admin's encrypted
  Private Care Note and author-private Care Notes (sealed until a transparency
  grant). Leader surface is live by default behind a verified feature flag
  (ADR 0024).
- **Edge Functions.** Production-intended functions are exactly `invite-user`
  and `redeem-invite`; `manage-test-auth-users` is local/test-only tooling and
  is `enabled = false` in `supabase/config.toml`.

**Important dependencies / config.** `next.config.ts` tunes
`experimental.staleTimes` (dynamic 30s / static 180s) for instant admin nav with
a deliberately short staleness window, and permanently redirects two retired
routes. **No `headers()` block.** CI (`.github/workflows/ci.yml`) runs two jobs:
`lint + typecheck + test` and a Playwright+axe a11y job (Node 20, `npm ci`) —
**no `npm run build` step.** Pre-commit hook runs
`verify:toolchain → lint-staged → typecheck → test:run`.

---

## 4. Priority Findings

Priority key: **P0** critical blocker/security-data risk · **P1** high-impact ·
**P2** meaningful improvement · **P3** nice-to-have polish · **Later** larger
modernization.

> **No P0 findings.** All hard invariants hold and all quality gates pass.

| Priority  | Area                         | Finding                                                                                                                                                                                                                                                                                                                                                | Impact                                                                                                           | Recommended Action                                                                                                                                                                                                | Risk                                                                                             |
| --------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| **P1**    | CI / Deploy                  | `.github/workflows/ci.yml` runs lint+typecheck+test+a11y but **never `npm run build`**. Local build passes; a future RSC/client-boundary or env-inlining break would pass CI and fail only at deploy.                                                                                                                                                  | Broken deploys slip past green CI.                                                                               | Add a `next build` step (or a dedicated `build` job) to CI.                                                                                                                                                       | Very low — additive.                                                                             |
| **P1**    | Security                     | `next.config.ts` sets **no HTTP security headers** — no CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy. App handles sensitive pastoral-care data.                                                                                                                                                             | Clickjacking, MIME-sniff, referrer-leak, downgrade exposure; weaker defense-in-depth atop solid RLS.             | Add a `headers()` block; start with a report-only CSP to avoid breakage, then enforce.                                                                                                                            | Low–medium — CSP needs care (Next inline styles/scripts); ship report-only first.                |
| **P1**    | Server actions               | Shared `runWriteAction` (`lib/shared/run-action.ts`) has **no top-level exception safety net** — it's a linear validate→guard→fields→RPC→revalidate→log pipeline with no try/catch/finally. An unexpected throw (parsing, guard, RPC mapping, or `revalidatePath`) bypasses the `ActionResult` typed-error path and leaves an inconsistent action log. | Rare throws become uncaught 500s / inconsistent logs instead of typed form errors; possible duplicate resubmits. | Wrap the runner in catch/finally: return a generic typed error (no detail leak) and finish the action log with an `unhandled_exception` signal. Cover thrown validators/guards/RPC/revalidate with focused tests. | Medium — broad stability boundary; keep existing auth/validation/RPC/success behavior unchanged. |
| **P1**    | Tests                        | ~**15 of 45** server-action files have **zero tests**, incl. security-sensitive `app/forgot-password/actions.ts`, `app/invite/[token]/actions.ts`, `app/(protected)/admin/people/actions.ts`, `groups/actions.ts`, `plan/actions.ts`, `shepherd-care/actions.ts`.                                                                                      | Validation/guard/revalidate regressions reach prod uncaught.                                                     | Add focused action tests using the reads-seam/mocking pattern already in tested actions; prioritize auth + people/groups writes.                                                                                  | Low.                                                                                             |
| **P1**    | Error handling               | Data-heavy dynamic detail routes have **no segment `error.tsx`**: `admin/groups/[groupId]`, `admin/people/[kind]/[personId]`, `admin/shepherd-care/[profileId]`, `over-shepherd/[profileId]`, `admin/check-ins/[groupId]`. A read failure bubbles to the single protected-layout boundary (full-page reset).                                           | A failed detail read becomes a whole-surface error with no local "back/retry".                                   | Add per-segment `error.tsx` rendering the existing `AppErrorState` with back + retry.                                                                                                                             | Low — additive, mirrors existing `(protected)/error.tsx`.                                        |
| **P1**    | Mobile / a11y                | Wide data tables are **not wrapped in horizontal-scroll containers**: `components/admin/groups-directory.tsx`, `shepherd-care/care-directory-table-base.tsx`, `over-shepherd-list.tsx`, `multiply/multiply-grid.tsx`, `launch-planning/scenarios-panel.tsx`. At 375px these overflow the viewport.                                                     | Core admin tables break layout / clip content on phones.                                                         | Wrap each `<table>` in `overflow-x-auto` (or a shared `<ScrollableTable>`); covered by `tests/a11y/responsive-mobile.spec.ts`.                                                                                    | Low.                                                                                             |
| **P2**    | Deploy / security guardrails | `manage-test-auth-users` is correctly `enabled = false` in `supabase/config.toml`, but release docs record that it previously returned to production after blanket deployment automation. The prod function set should be exactly `invite-user` + `redeem-invite`.                                                                                     | A future blanket function deploy could reintroduce local/test-only privileged tooling.                           | Add a static guard/test that fails if `manage-test-auth-users` is enabled or the config drifts from the `invite-user`/`redeem-invite` allowlist; keep `RELEASE.md` consistent.                                    | Low.                                                                                             |
| **P2**    | Loading states               | Only **2–3** `loading.tsx` (admin, over-shepherd); 40+ routes share one generic skeleton. Detail/editor routes show a list-shaped skeleton.                                                                                                                                                                                                            | Perceived-performance + layout-shift on detail pages.                                                            | Add route-level `loading.tsx` (or Suspense) with layout-matched skeletons for the heaviest detail routes.                                                                                                         | Low.                                                                                             |
| **P2**    | Empty states                 | No shared `EmptyState` primitive; 7+ components redefine padding/tone/copy inline. `groups-directory.tsx` renders an empty table with **no prompt** when there are no groups.                                                                                                                                                                          | Inconsistent empty UX; one missing empty state.                                                                  | Extract a shared `EmptyState`; adopt it where empty copy is duplicated; add the groups empty state.                                                                                                               | Low.                                                                                             |
| **P2**    | UI consistency               | No `Input`/`Select`/`Tabs` primitives. `components/admin/forms/field-styles.ts` exists but is **not universally imported** — form class strings (`FIELD_LABEL`/`FIELD_INPUT`) are re-declared in `follow-up-create-form.tsx`, `group-health-editor.tsx`, `prospect-create-form.tsx`, etc.                                                              | Drift in form styling/a11y; duplicated strings.                                                                  | Add `ui/Input` + `ui/Select` + `ui/Tabs` (thin wrappers); migrate duplicated declarations to import the shared styles.                                                                                            | Low–medium (broad, mechanical).                                                                  |
| **P2**    | DX / Config                  | **No typed env validation.** `process.env.X?.trim()` is read ad hoc; misconfig fails late with a cryptic read error rather than fast-fail at boot.                                                                                                                                                                                                     | Slow, confusing prod/dev misconfig diagnosis.                                                                    | Add a small typed env module (zod or hand-rolled, no new heavy dep needed) that parses required vars once and is imported by the Supabase config.                                                                 | Low.                                                                                             |
| **P2**    | Routing                      | **No custom `not-found.tsx`.** Bad `[groupId]`/`[personId]`/`[profileId]` and mistyped URLs render the default Next 404, off-brand and without nav back.                                                                                                                                                                                               | Off-brand dead-ends.                                                                                             | Add `app/not-found.tsx` (and optionally `(protected)/not-found.tsx`) using app shell + a "back to Home" link.                                                                                                     | Low.                                                                                             |
| **P2**    | Docs / maintainability       | `docs/architecture/ARCHITECTURE.md` exists and is broadly current, but should be confirm-aligned with the Care·Plan·Multiply route tree and Edge-Function boundaries, and cross-linked to RLS/email/release docs so future agents don't re-derive boundaries from source. (Light refresh, not a rewrite.)                                              | Future maintainers/agents can make poor assumptions about routes, role surfaces, and functions.                  | Refresh/verify the architecture map; cross-link `PRODUCT_DEFINITION.md`, `RLS_VISIBILITY.md`, `EMAIL_DELIVERY.md`, `runbooks/RELEASE.md` instead of duplicating detail.                                           | Low — docs only.                                                                                 |
| **P2**    | Docs drift                   | README "Security posture" and `CLAUDE.md` describe broad `select("*")` reads on `profiles`/`members` as open **tracked debt** — but grep finds **zero** `.select("*")` calls; `session.ts` uses `SESSION_PROFILE_SELECT`, groups use `GROUP_SELECT`, etc. The debt appears effectively closed.                                                         | Misleads contributors about current state.                                                                       | Verify each `profiles`/`members` read is allowlisted, then update README/CLAUDE.md to mark the debt resolved (or pinpoint the exact remaining read).                                                              | Low — docs only.                                                                                 |
| **P2**    | Role/auth validation         | Live role-route and mobile smoke tests depend on seeded credentials and skip when they're absent. Static + unit tests are strong, but role regressions could escape CI if no live/staging smoke path runs.                                                                                                                                             | Role regressions may escape normal CI.                                                                           | Add a documented optional/scheduled seeded-auth smoke workflow for admin/leader/over-shepherd/unauthorized/mobile routes; keep normal CI deterministic and skip clearly when creds are absent.                    | Medium.                                                                                          |
| **P2**    | Dependencies                 | `npm audit`: 9 vulns, all **dev/transitive** — esbuild→vite→vitest (high, dev-server only) and postcss→next (moderate). `npm outdated`: `next` 15.5.19→16.x, `@supabase/ssr` 0.10→0.12, `lucide-react` 0.468→1.x, `tailwind-merge` 2→3 (majors).                                                                                                       | No runtime exposure today, but drift accumulates.                                                                | Bump vitest to clear the esbuild advisory (breaking-ish, contained to tests). Defer Next 16 / Tailwind-merge 3 / lucide 1 majors to a deliberate upgrade PR.                                                      | Low for vitest; medium for majors.                                                               |
| **P2**    | Maintainability              | Three shells exceed ~1200 LOC: `groups-directory.tsx` (1732), `admin-master-calendar-shell.tsx` (1320), `super-admin-console-shell.tsx` (1222). Read-model modules (`lib/supabase/read-models.ts`) also remain dense.                                                                                                                                  | Hard to review/test/modify safely.                                                                               | Decompose `groups-directory` and the calendar shell into table/filters/row-actions/badges sub-components; extract read-models by domain when those flows are touched.                                             | Medium — behavior-preserving refactor; do incrementally with tests.                              |
| **P2**    | Performance / loading        | Several admin/leader views load large read bundles with uneven loading/degraded behavior. There's no timing visibility to tell genuine slow reads from app failure.                                                                                                                                                                                    | Slow Supabase reads can look like app failure, esp. on mobile/weak connections.                                  | Add lightweight read-bundle timing instrumentation (via `lib/observability`, no private data) to identify slow reads **before** any query/index rewrite; pair with route loading states.                          | Low.                                                                                             |
| **P2**    | Engine pinning               | No `.nvmrc` / `engines` in `package.json`. CI uses Node 20; local is unpinned.                                                                                                                                                                                                                                                                         | Version-skew bugs between local and CI/prod.                                                                     | Add `.nvmrc` (`20`) and `"engines": { "node": ">=20 <21" }`.                                                                                                                                                      | Very low.                                                                                        |
| **P2**    | UX (auth)                    | Invite/reset flows lack proactive "already enrolled"/"already set" detection. Re-using a redeemed invite or clicking a stale reset link after the password is set yields a generic error rather than a clear message. _(verify exact reset-state check first.)_                                                                                        | Confusing rare-path UX; possible duplicate-submit.                                                               | Detect confirmed-password / consumed-invite earlier and render an explicit message + sign-in link.                                                                                                                | Low.                                                                                             |
| **P3**    | UX                           | Off-nav frozen surfaces (`/admin/guests`, `/admin/check-ins`, `/admin/leader-pipeline`) still render fully with no in-UI "frozen / not maintained" banner.                                                                                                                                                                                             | Users may file bugs on intentionally-frozen surfaces.                                                            | Add a shared dashed "preserved, not actively maintained" banner to off-nav surfaces.                                                                                                                              | Very low.                                                                                        |
| **P3**    | a11y regressions             | No lint rule prevents future icon-only buttons without `aria-label`; current ones are labeled but unprotected.                                                                                                                                                                                                                                         | Silent a11y regressions.                                                                                         | Add `eslint-plugin-jsx-a11y` (or targeted rules) to the flat config.                                                                                                                                              | Low — may surface existing nits to fix.                                                          |
| **P3**    | Deploy / Ops                 | No `/health` (readiness) route; no `/api/health`.                                                                                                                                                                                                                                                                                                      | External monitors can't cheaply probe liveness.                                                                  | Add a tiny static health route (optionally pinging Supabase).                                                                                                                                                     | Very low.                                                                                        |
| **P3**    | Tests                        | `vitest.config.ts` has no coverage reporting/thresholds.                                                                                                                                                                                                                                                                                               | No visibility into coverage gaps.                                                                                | Enable `coverage` (v8) and a non-blocking report; consider a floor later.                                                                                                                                         | Very low.                                                                                        |
| **P3**    | DB ops                       | 119 migrations with no in-tree index/runbook of apply order or branch-deploy caveats.                                                                                                                                                                                                                                                                  | Manual schema reasoning is `ls`-driven.                                                                          | Add `supabase/migrations/README.md` indexing notable migrations + apply guidance.                                                                                                                                 | Very low — docs only.                                                                            |
| **Later** | Tests                        | **No RLS test harness.** The 4-tier visibility ladder is the security boundary; RLS bugs are silent (wrong rows, no error). Vitest unit tests + a11y don't exercise it.                                                                                                                                                                                | A future RLS/policy change could leak across tiers undetected.                                                   | Stand up an integration harness against a seeded local Supabase that runs the same query as each tier and asserts visibility.                                                                                     | Medium–high effort.                                                                              |
| **Later** | Tests                        | No end-to-end test of the full action pipeline (client→action→validate→guard→RPC→audit→revalidate).                                                                                                                                                                                                                                                    | Pipeline regressions only caught in pieces.                                                                      | Add a thin integration layer (Playwright or seeded Supabase) asserting an audit row + persisted state after a write.                                                                                              | Medium.                                                                                          |
| **Later** | UI system                    | No `sm:` breakpoint and no responsive type scale (global `text-base`); 375→768 jumps straight to multi-column.                                                                                                                                                                                                                                         | Coarse mobile/tablet layouts.                                                                                    | Introduce a responsive type scale + `sm:` adoption pass.                                                                                                                                                          | Medium.                                                                                          |
| **Later** | Perf                         | Detail routes block on all reads (no Suspense streaming); largest shells ship as big client bundles.                                                                                                                                                                                                                                                   | Slower first paint on heavy pages.                                                                               | Stream detail routes with Suspense; push static subtrees back to server components.                                                                                                                               | Medium.                                                                                          |

**Explicitly NOT a finding:** dark mode. `tailwind.config.ts` carries
`darkMode: ["class"]` (shadcn boilerplate) with **0** `dark:` usages, but
`DESIGN.md` defines a deliberate **warm-pastoral light** palette ("cream paper
surfaces, warm ink"). Light-only is intentional; do not add dark mode as
"fixing a gap."

---

## 5. Recommended Sweep Roadmap

### Phase 1 — Stabilize (small, low-risk; protect the app)

- Add `npm run build` to CI (P1).
- Add HTTP security headers via `next.config.ts` `headers()`, CSP **report-only
  first** (P1).
- Add a top-level exception safety net to `runWriteAction`
  (`lib/shared/run-action.ts`) — catch/finally returning a typed error +
  `unhandled_exception` log (P1). _(Absorbs the previously-separate
  `revalidatePath` try/catch item.)_
- Add an Edge-Function production allowlist guard (`invite-user`,
  `redeem-invite` only; `manage-test-auth-users` stays disabled) (P2).
- Add `.nvmrc` + `engines` (P2).
- Bump `vitest` to clear the esbuild dev-chain advisory (P2).

### Phase 2 — Polish Core UX (existing flows, layout, mobile, loading, empty)

- Wrap wide tables in horizontal-scroll containers (P1, mobile).
- Add per-segment `error.tsx` to data-heavy detail routes (P1).
- Add a custom `not-found.tsx` (P2).
- Add layout-matched `loading.tsx` for the heaviest detail routes (P2).
- Extract a shared `EmptyState`; fix the missing groups empty state (P2).
- Add the "frozen surface" banner to off-nav routes (P3).
- Proactive auth-flow messaging for already-enrolled/already-set (P2).

### Phase 3 — Strengthen Data/Auth (recommendations; **no schema changes**)

- Add typed env validation that fast-fails on missing required vars (P2).
- Add the Edge-Function config guard/test (Phase 1 item; verify here) and keep
  `RELEASE.md` consistent (P2).
- Refresh/verify `docs/architecture/ARCHITECTURE.md` against the current route
  tree + Edge-Function boundaries; cross-link RLS/email/release docs (P2).
- Add an optional/scheduled seeded-auth route-smoke workflow for role boundaries
  that skips cleanly without credentials; keep regular CI deterministic (P2).
- Verify all `profiles`/`members` reads are allowlisted, then correct the
  README/CLAUDE.md debt language (P2, docs only).
- _(Recommendation only)_ design an RLS test harness (Phase 4 / Later) — do not
  change policies or schema in this sweep.

### Phase 4 — Tests & Quality Gates

- Add tests for the ~15 untested server actions, auth-sensitive first (P1).
- Add focused tests for the `runWriteAction` exception path (validator/guard/
  RPC/revalidate throws) (P1).
- Add lightweight read-bundle timing instrumentation to guide later query work
  with measured evidence (P2).
- Enable vitest coverage reporting (non-blocking) (P3).
- Add `eslint-plugin-jsx-a11y` rules to prevent a11y regressions (P3).
- Stand up the RLS / pipeline integration harness (Later).

### Phase 5 — Larger Modernization Options (only if justified)

- Decompose the 1200–1700 LOC shells and dense read-model modules (P2/Later).
- Introduce a `Input`/`Select`/`Tabs` primitive layer and migrate forms (P2).
- Responsive type scale + `sm:` breakpoint adoption (Later).
- Suspense streaming for detail routes (Later).
- Deliberate dependency-major upgrade PR: Next 16, tailwind-merge 3, lucide 1,
  `@supabase/ssr` 0.12 (Later) — _decision: take now, one PR per major (#608)._
- Schema/index/RLS changes only after measured slow queries, Supabase advisor
  output, or concrete security-review evidence (Later).

---

## 6. PR-Sized Task List

Ordered by suggested execution. Each is independently shippable.

### 1. Add a build gate to CI

- **Why:** Build-time breakage currently passes green CI and fails at deploy.
- **Files:** `.github/workflows/ci.yml`.
- **Acceptance:** CI runs `npm run build` (own step or job) on every PR; a
  deliberate build break fails CI; lint/typecheck/test/a11y unchanged.
- **Risk:** Very low. **Order:** 1.

### 2. Add HTTP security headers (CSP report-only first)

- **Why:** No CSP/HSTS/X-Frame-Options/etc. atop sensitive care data.
- **Files:** `next.config.ts` (`headers()`); optionally a `lib/security/headers.ts`.
- **Acceptance:** Responses carry `Strict-Transport-Security`, `X-Frame-Options:
DENY` (or frame-ancestors CSP), `X-Content-Type-Options: nosniff`,
  `Referrer-Policy`, `Permissions-Policy`, and a **report-only** CSP; app
  renders with no console CSP errors in local + preview before enforcing.
- **Risk:** Low–medium (CSP). **Order:** 2.

### 3. Harden `runWriteAction` exception handling

- **Why:** The shared runner is the stability boundary for admin/leader writes;
  an unexpected throw must not bypass typed form handling or action logs.
- **Files:** `lib/shared/run-action.ts`; tests in
  `lib/admin/__tests__/run-action.test.ts`,
  `lib/leader/__tests__/run-action.test.ts`.
- **Acceptance:** Thrown validators/guards/fields/RPC/mappers/`revalidatePath`
  are caught; the action log finishes with a consistent `unhandled_exception`
  signal; the returned `ActionResult` is a generic typed error (no detail leak);
  existing auth/validation/RPC-error/success/typed-revalidate behavior is
  unchanged. (Subsumes guarding the `revalidatePath` loop specifically.)
- **Risk:** Medium. **Order:** 3.

### 4. Edge-Function production allowlist guard

- **Why:** `manage-test-auth-users` is intentionally local/test-only and has
  previously reappeared in production after blanket automation.
- **Files:** `supabase/config.toml`, `docs/runbooks/RELEASE.md`, a small
  test/script following existing repo conventions.
- **Acceptance:** A committed check fails if `manage-test-auth-users` is enabled
  or the prod set drifts from exactly `invite-user` + `redeem-invite`; release
  docs stay consistent; **no** schema/policy/migration/seed files change.
- **Risk:** Low. **Order:** 4.

### 5. `.nvmrc` + `engines` + vitest bump

- **Why:** Pin Node; clear the esbuild/vite/vitest dev-chain advisory.
- **Files:** `.nvmrc`, `package.json`, `package-lock.json`, possibly
  `vitest.config.ts`.
- **Acceptance:** `.nvmrc`=`20`; `engines.node` set; `npm audit` no longer
  reports the esbuild high advisory; `npm run test:run` still green.
- **Risk:** Low. **Order:** 5.

### 6. Wrap wide tables in horizontal scroll

- **Why:** Core admin tables overflow at 375px.
- **Files:** `components/admin/groups-directory.tsx`,
  `components/admin/shepherd-care/care-directory-table-base.tsx`,
  `components/admin/over-shepherd-list.tsx`,
  `components/admin/multiply/multiply-grid.tsx`,
  `components/admin/launch-planning/scenarios-panel.tsx` (+ optional shared
  `components/ui/scrollable-table.tsx`).
- **Acceptance:** Each table scrolls horizontally within its container at 375px
  with no page overflow; `tests/a11y/responsive-mobile.spec.ts` passes.
- **Risk:** Low. **Order:** 6.

### 7. Per-segment `error.tsx` for detail routes

- **Why:** A failed detail read shouldn't reset the whole surface.
- **Files:** new `error.tsx` in `app/(protected)/admin/groups/[groupId]/`,
  `admin/people/[kind]/[personId]/`, `admin/shepherd-care/[profileId]/`,
  `over-shepherd/[profileId]/`, `admin/check-ins/[groupId]/`; reuse
  `components/.../AppErrorState`.
- **Acceptance:** Forcing a detail-load failure renders an inline error card
  with back + retry, app shell intact; existing `(protected)/error.tsx`
  unchanged. Auth/ownership/privacy failures stay fail-closed.
- **Risk:** Low. **Order:** 7.

### 8. Custom `not-found.tsx`

- **Why:** Off-brand default 404 on bad ids / mistyped URLs.
- **Files:** `app/not-found.tsx` (+ optional `app/(protected)/not-found.tsx`).
- **Acceptance:** A bad route renders a branded 404 with a link home; existing
  `notFound()` calls in detail pages now hit it.
- **Risk:** Low. **Order:** 8.

### 9. Shared `EmptyState` + groups empty state

- **Why:** Inconsistent empty UX; groups renders an empty table with no prompt.
- **Files:** `components/ui/empty-state.tsx` (new); adopt in
  `groups-directory.tsx`, `shepherd-care/care-follow-up-list.tsx`,
  `over-shepherd-list.tsx`, `interaction-timeline.tsx`,
  `follow-ups/follow-ups-shell.tsx`.
- **Acceptance:** One `EmptyState` component; an empty groups list shows a
  prompt; pastoral copy preserved; a11y harness still green.
- **Risk:** Low. **Order:** 9.

### 10. Detail-route `loading.tsx` with matched skeletons

- **Why:** Generic skeleton mis-shapes detail/editor pages.
- **Files:** new `loading.tsx` in the heaviest detail routes (groups, people,
  shepherd-care); optional skeleton variants in `components/lg/`.
- **Acceptance:** Navigating to a detail route shows a layout-matched skeleton;
  no layout shift on data arrival.
- **Risk:** Low. **Order:** 10.

### 11. Tests for untested server actions (auth-sensitive first)

- **Why:** ~15 action files have no tests, incl. forgot-password/invite/people.
- **Files:** new `__tests__/` beside `app/forgot-password/actions.ts`,
  `app/invite/[token]/actions.ts`, `app/(protected)/admin/people/actions.ts`,
  `groups/actions.ts`, `plan/actions.ts`, `shepherd-care/actions.ts`, etc.;
  reuse the mocking pattern from already-tested actions.
- **Acceptance:** Each covered action asserts validate→guard→RPC call shape and
  revalidate targets for success + at least one failure path; suite green.
- **Risk:** Low. **Order:** 11.

### 12. Typed env validation

- **Why:** Misconfig fails late and cryptically.
- **Files:** `lib/env.ts` (new) imported by `lib/supabase/config.ts`.
- **Acceptance:** Required vars parsed once; missing required var produces a
  clear startup error; optional vars (Upstash, proxy) stay optional and degrade
  as today; `npm run build` green.
- **Risk:** Low. **Order:** 12.

### 13. Refresh architecture documentation

- **Why:** Docs should match the route tree and data/auth model so future work
  doesn't begin from stale assumptions.
- **Files:** `docs/architecture/ARCHITECTURE.md`, possibly `docs/README.md`.
- **Acceptance:** Public/admin/super-admin/leader/over-shepherd/frozen/invite/
  support/account routes accurately summarized; data/auth/write patterns
  described at behavior level; Edge-Function responsibilities match
  `supabase/config.toml` + `RELEASE.md`; cross-links to `PRODUCT_DEFINITION.md`,
  `RLS_VISIBILITY.md`, `EMAIL_DELIVERY.md`, `runbooks/RELEASE.md` instead of
  duplicating detail.
- **Risk:** Low. **Order:** 13.

### 14. Correct `select("*")` docs; frozen-surface banner

- **Why:** Two small clarity/UX fixes.
- **Files:** `README.md` + `CLAUDE.md` (debt language after verification),
  `app/(protected)/admin/guests/page.tsx` / `check-ins/page.tsx` /
  `leader-pipeline/page.tsx` (banner).
- **Acceptance:** Docs match reality (debt resolved or pinpointed); off-nav
  surfaces show the "preserved, not maintained" banner.
- **Risk:** Very low. **Order:** 14.

### 15. Read-bundle timing instrumentation + loading polish

- **Why:** Performance work should follow measured slow routes, not guesses.
- **Files:** heaviest read loaders, `lib/observability` helpers, route
  `loading.tsx` where missing.
- **Acceptance:** Slow read bundles surface in dev/logs without exposing private
  data; page layouts and data contracts unchanged; later index/query work links
  back to measured evidence.
- **Risk:** Low. **Order:** 15.

### 16. Optional seeded-auth route-smoke workflow

- **Why:** Role-bound pages need at least one trustworthy live/staging
  validation path beyond static + unit tests.
- **Files:** `tests/a11y/leader-routes.spec.ts`, `tests/a11y/mobile-smoke.spec.ts`,
  `.github/workflows/*`, runbook docs.
- **Acceptance:** Normal CI stays deterministic and needs no production secrets;
  the smoke path runs only when explicit credentials + base URL are present;
  admin/leader/over-shepherd/unauthorized/mobile routes represented; skips are
  reported clearly when credentials are absent.
- **Risk:** Medium. **Order:** 16.

### 17. UI primitives (`Input`/`Select`/`Tabs`) + form-style consolidation

- **Why:** Remove duplicated form class strings; consistent a11y.
- **Files:** `components/ui/input.tsx`, `select.tsx`, `tabs.tsx` (new); migrate
  `follow-up-create-form.tsx`, `group-health-editor.tsx`,
  `prospect-create-form.tsx`, `assign-leader-form.tsx`, and others to import
  `components/admin/forms/field-styles.ts` / the new primitives.
- **Acceptance:** No locally-redeclared `FIELD_INPUT`/`FIELD_LABEL`; forms look
  and behave identically; a11y harness green.
- **Risk:** Low–medium (broad, mechanical). **Order:** 17.

### 18. Decompose oversized shells / dense read-models (incremental)

- **Why:** `groups-directory.tsx` (1732), `admin-master-calendar-shell.tsx`
  (1320), and dense `lib/supabase/read-models.ts` are hard to maintain.
- **Files:** the two shells → extracted table/filters/row-actions/badges
  components; read-models extracted by domain **only when already touched**.
- **Acceptance:** Behavior-preserving; tests + a11y unchanged; each new file
  well under ~600 LOC; no data-contract changes.
- **Risk:** Medium (do behind tests, one shell per PR). **Order:** 18.

### 19. (Later) RLS / pipeline integration harness; dependency majors

- **Why:** Close the deepest test gap; stay current.
- **Files:** new `tests/integration/**`; later a dedicated deps-upgrade PR.
- **Acceptance:** Per-tier RLS visibility asserted against seeded Supabase; an
  action write asserts a persisted row + audit row. Majors upgraded with green
  build/test/a11y.
- **Decision:** RLS harness runs on a **local Supabase CLI stack**, opt-in/
  scheduled off the default lane (#607); dependency majors land **one PR per
  major** (#608 → #611–#614).
- **Risk:** Medium–high. **Order:** 19.

---

## 7. Do-Not-Break Checklist

These hold today and **must** keep holding (sources: `CLAUDE.md`, `AGENTS.md`,
`README.md`, verified this sweep):

**Security / data invariants**

- [ ] **No service-role key in Next runtime.** Service role stays only in
      `supabase/functions/*` Edge Functions and the manual `scripts/` (gated by
      opt-in env). Never import it into `app/` or `lib/`.
- [ ] **All writes go through narrow `SECURITY DEFINER` RPCs** (`admin_*`,
      `leader_*`, `over_shepherd_*`, `super_admin_*`). **No direct**
      `.insert/.update/.delete/.upsert` from app code (currently zero).
- [ ] **Every mutation writes a paired `audit_events` row in the same
      transaction.** Don't add a write RPC without its audit row.
- [ ] **No hard deletes** in normal workflows; **Archive** (soft) is default.
      Permanent deletion stays Super-Admin-only via `super_admin_*`, writes a
      tombstone, and never touches Private Care Notes / audit logs / auth.users.
- [ ] **Reads stay column-allowlisted** (no `select("*")` — currently zero call
      sites). Don't widen reads, especially on care tables.
- [ ] **Authorization stays role-based** on `profiles.role`. No hardcoded
      Julian/Tom UUIDs or emails in code/migrations/RLS.
- [ ] **Production Edge-Function set stays exactly `invite-user` +
      `redeem-invite`**; `manage-test-auth-users` stays `enabled = false` and out
      of production.

**Visibility exceptions (privacy)**

- [ ] **`admin_private_note` never reaches leader/over-shepherd routes**; it
      stays client-side AES-256-GCM encrypted (`lib/crypto/private-notes.ts` is
      the published, dependency-free crypto surface — don't add deps or move
      crypto out of it).
- [ ] **Author-private Care Notes stay sealed** until a transparency grant; RLS
      gates admins via `auth_is_admin()`. Don't expose them earlier.
- [ ] **`staff_viewer` stays deprecated** (routed to `/unauthorized`); don't
      expand it.

**Roles / routes / flows**

- [ ] Preserve the **Care · Plan · Multiply** nav spine and the seeded-on
      **Groups/People** tabs (ADR 0024); the Super-Admin console keeps the
      off-switches.
- [ ] Preserve role routing/visibility for `admin`, `super_admin`,
      `over_shepherd`, `leader`, and `co_leader`.
- [ ] **Off-nav pre-pivot surfaces** (planning, launch-planning, follow-ups,
      guests, calendar, group-health, leader-pipeline, check-ins) **still
      resolve by direct URL and stay role-guarded** — frozen, not deleted.
- [ ] **Leader surface** stays live-by-default behind the verified
      `leader_surface` flag; **check-ins stay frozen** behind their own gate.
- [ ] **Care alias routes** (`/admin/shepherd-care`, `/admin/follow-ups`,
      `/admin/calendar`, …) keep rendering the canonical view with the right
      `initialTab` (alias-render, not redirect).
- [ ] The two permanent redirects in `next.config.ts`
      (`/admin/capacity-board`, `/admin/multiplication` → `/admin/launch-planning`)
      keep working.

**Behavior / quality**

- [ ] Reads keep **degrading gracefully** (no false zeros) — preserve the
      reads-seam pattern (ADR 0015) so tests can inject adapters. Auth,
      ownership, and privacy failures stay fail-closed (denied/not-found).
- [ ] Server actions keep returning the **`ActionResult` discriminated union**
      and surfacing errors via form state (no catch-and-ignore).
- [ ] `middleware.ts` keeps refreshing the session cookie and excluding static
      assets; it does **no** authorization (that lives in `getCurrentSession`).
- [ ] All gates stay green: typecheck, lint (0 warnings), 3351 vitest tests,
      build, Playwright+axe a11y. Don't regress the a11y harness coverage.
- [ ] **CI stays deterministic** — regular CI must not depend on live production
      secrets or mutable external state (seeded-auth smoke is opt-in only).
- [ ] Public preview / unauthenticated paths keep rendering typed demo data and
      **never** call Supabase or expose private data.
- [ ] **No database schema, migration, RLS policy, or seed changes** unless a
      future task explicitly calls for a separate, reviewed migration PR.

---

## 8. Open Questions

Only the questions that genuinely change implementation (everything else was
resolved by inspection):

1. **CSP strictness & third parties.** A strict CSP must allowlist
   `@vercel/analytics`, `@vercel/speed-insights`, and the Supabase origin, and
   Next's inline styles/runtime. Is a **strict** CSP desired, or is a pragmatic
   policy (frame-ancestors + nonce-less style-src) acceptable for v1? (Affects
   Task 2 scope.)
   **Resolved (#904, 2026-07):** the pragmatic policy is accepted for v1 and is
   now served **enforcing** (`lib/security/headers.ts`); a strict nonce-based
   policy stays future work alongside the inline-style burn-down (#908).
2. **Dependency-major appetite.** Is a Next 15→16 (plus tailwind-merge 3,
   lucide 1, `@supabase/ssr` 0.12) upgrade in scope soon, or should the sweep
   stay on the current majors and only clear the dev-chain advisory? (Affects
   whether Task 19's upgrade is scheduled or deferred.)
   **✅ Resolved (2026-06-15):** take the majors now, **one PR per major**
   (tracked under #608 → children #611–#614). No runtime exposure today (the
   dev-chain advisory was already cleared by vitest 3, #584) — staying-current
   work.
3. **RLS test harness infra.** Standing up per-tier RLS integration tests needs
   a seeded Supabase target (local CLI stack or an ephemeral project) in CI. Is
   provisioning that infra acceptable, or should RLS stay covered by review +
   migration discipline for now? (Affects the "Later" test work.)
   **✅ Resolved (2026-06-15):** provision a **local Supabase CLI stack**, seeded
   via existing tooling, run **opt-in/scheduled off the deterministic default
   lane** (like the #597 smoke); no production secrets. An ephemeral/staging
   cloud target stays a documented future option (tracked under #607).
4. **Seeded-auth smoke target.** Should the optional route-smoke workflow target
   a production-like staging environment only, or also support a local Supabase
   when developers have seeded test accounts? (Affects Task 16 scope.)
5. **First UX-polish PR.** After stabilization, which route family goes first —
   leader group care/calendar/check-in, or admin group detail/calendar? (Affects
   Phase-2 ordering.)
6. **Group-detail partial-failure UX (verify first).** Today a top-level
   detail-loader failure calls `notFound()` even when the group spine loaded.
   Should detail pages render **partial** data with per-tab error banners
   instead of 404-ing the whole page? (Confirm current behavior by running the
   path before changing it.)
