# Fvclifegroups Repo Sweep Plan

> A prioritized, implementation-ready improvement plan for the Life Group
> Operations app. Produced from a full read-only sweep on **2026-06-14**. No
> source, schema, migration, policy, or seed data was changed in this pass.
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

**Baseline health (all verified locally this pass):**

| Gate                                          | Result                                                                                                          |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck` (tsc strict)              | ✅ pass                                                                                                         |
| `npm run lint` (eslint, next/core-web-vitals) | ✅ pass, **0 warnings**                                                                                         |
| `npm run test:run` (vitest)                   | ✅ **3351 passed**, 1 skipped, 269 files                                                                        |
| `npm run build` (next build)                  | ✅ pass                                                                                                         |
| `npm audit`                                   | ⚠️ 9 vulns — **all dev/transitive** (esbuild/vite/vitest chain, postcss-via-next); none in shipped runtime code |

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
3. **Server-action test coverage is thin** — ~9 of 45 action files have tests;
   security-sensitive flows (`forgot-password`, `invite/[token]`,
   `people` writes) have none. RLS itself has no automated test.

**Highest-leverage opportunities.** Add a build gate + security headers (Phase
1, hours of work, protects deploys and hardens the app), then close the
mobile-table overflow and detail-route error/loading gaps (Phase 2, the most
visible UX wins), then broaden action/RLS test coverage (Phase 4). Most findings
are small, PR-sized, and carry low risk because the architecture is consistent
and well-tested.

**There are no P0 findings.** The codebase has no critical blocker, live data
leak, or broken invariant. This is a polish-and-harden sweep, not a rescue.

---

## 2. Sweep Method

**Read-only.** No source/schema/migration/policy/seed edits. The only file
created is this document.

**Commands run (and their results):**

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

**Areas reviewed (via four parallel deep-dive sub-agents + direct inspection):**
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
                auth/. 226 files, 122 are "use client".
lib/            auth/ (session, roles, guards, leader-surface flag),
                supabase/ (server client + reads seam + column-allowlisted
                read models), admin/ (validators, typed RPC wrappers,
                run-action), leader/ over-shepherd/ shared/ crypto/
                observability/ security/ (rate limit).
types/          Hand-rolled Supabase row types + enums (the trust boundary).
supabase/       119 migrations (schema + RLS), seed/, functions/ (Edge:
                invite-user, redeem-invite, manage-test-auth-users), dev/.
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
  Ministry Admin ▸ Over-Shepherd ▸ Leader**, on `profiles.role`. Two visibility
  exceptions: the Ministry Admin's encrypted Private Care Note and author-private
  Care Notes (sealed until a transparency grant). Leader surface is live by
  default behind a verified feature flag (ADR 0024).

**Important dependencies / config.** `next.config.ts` tunes
`experimental.staleTimes` (dynamic 30s / static 180s) for instant admin nav with
a deliberately short staleness window, and permanently redirects two retired
routes. **No `headers()` block.** CI (`.github/workflows/ci.yml`) runs two jobs:
`lint + typecheck + test` and a Playwright+axe a11y job (Node 20, `npm ci`).
Pre-commit hook runs `verify:toolchain → lint-staged → typecheck → test:run`.

---

## 4. Priority Findings

Priority key: **P0** critical blocker/security-data risk · **P1** high-impact ·
**P2** meaningful improvement · **P3** nice-to-have polish · **Later** larger
modernization.

> **No P0 findings.** All hard invariants hold and all quality gates pass.

| Priority  | Area             | Finding                                                                                                                                                                                                                                                                                                      | Impact                                                                                               | Recommended Action                                                                                                                                           | Risk                                                                              |
| --------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| **P1**    | CI / Deploy      | `.github/workflows/ci.yml` runs lint+typecheck+test+a11y but **never `npm run build`**. Local build passes; a future RSC/client-boundary or env-inlining break would pass CI and fail only at deploy.                                                                                                        | Broken deploys slip past green CI.                                                                   | Add a `next build` step (or a dedicated `build` job) to CI.                                                                                                  | Very low — additive.                                                              |
| **P1**    | Security         | `next.config.ts` sets **no HTTP security headers** — no CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy. App handles sensitive pastoral-care data.                                                                                                                   | Clickjacking, MIME-sniff, referrer-leak, downgrade exposure; weaker defense-in-depth atop solid RLS. | Add a `headers()` block; start with a report-only CSP to avoid breakage, then enforce.                                                                       | Low–medium — CSP needs care (Next inline styles/scripts); ship report-only first. |
| **P1**    | Tests            | ~**15 of 45** server-action files have **zero tests**, incl. security-sensitive `app/forgot-password/actions.ts`, `app/invite/[token]/actions.ts`, `app/(protected)/admin/people/actions.ts`, `groups/actions.ts`, `plan/actions.ts`, `shepherd-care/actions.ts`.                                            | Validation/guard/revalidate regressions reach prod uncaught.                                         | Add focused action tests using the reads-seam/mocking pattern already in tested actions; prioritize auth + people/groups writes.                             | Low.                                                                              |
| **P1**    | Error handling   | Data-heavy dynamic detail routes have **no segment `error.tsx`**: `admin/groups/[groupId]`, `admin/people/[kind]/[personId]`, `admin/shepherd-care/[profileId]`, `over-shepherd/[profileId]`, `admin/check-ins/[groupId]`. A read failure bubbles to the single protected-layout boundary (full-page reset). | A failed detail read becomes a whole-surface error with no local "back/retry".                       | Add per-segment `error.tsx` rendering the existing `AppErrorState` with back + retry.                                                                        | Low — additive, mirrors existing `(protected)/error.tsx`.                         |
| **P1**    | Mobile / a11y    | Wide data tables are **not wrapped in horizontal-scroll containers**: `components/admin/groups-directory.tsx`, `shepherd-care/care-directory-table-base.tsx`, `over-shepherd-list.tsx`, `multiply/multiply-grid.tsx`, `launch-planning/scenarios-panel.tsx`. At 375px these overflow the viewport.           | Core admin tables break layout / clip content on phones.                                             | Wrap each `<table>` in `overflow-x-auto` (or a shared `<ScrollableTable>`); covered by `tests/a11y/responsive-mobile.spec.ts`.                               | Low.                                                                              |
| **P2**    | Loading states   | Only **2** `loading.tsx` (admin, over-shepherd); 40+ routes share one generic skeleton. Detail/editor routes show a list-shaped skeleton.                                                                                                                                                                    | Perceived-performance + layout-shift on detail pages.                                                | Add route-level `loading.tsx` (or Suspense) with layout-matched skeletons for the heaviest detail routes.                                                    | Low.                                                                              |
| **P2**    | Empty states     | No shared `EmptyState` primitive; 7+ components redefine padding/tone/copy inline. `groups-directory.tsx` renders an empty table with **no prompt** when there are no groups.                                                                                                                                | Inconsistent empty UX; one missing empty state.                                                      | Extract a shared `EmptyState`; adopt it where empty copy is duplicated; add the groups empty state.                                                          | Low.                                                                              |
| **P2**    | UI consistency   | No `Input`/`Select`/`Tabs` primitives. `components/admin/forms/field-styles.ts` exists but is **not universally imported** — form class strings (`FIELD_LABEL`/`FIELD_INPUT`) are re-declared in `follow-up-create-form.tsx`, `group-health-editor.tsx`, `prospect-create-form.tsx`, etc.                    | Drift in form styling/a11y; duplicated strings.                                                      | Add `ui/Input` + `ui/Select` + `ui/Tabs` (thin wrappers); migrate duplicated declarations to import the shared styles.                                       | Low–medium (broad, mechanical).                                                   |
| **P2**    | DX / Config      | **No typed env validation.** `process.env.X?.trim()` is read ad hoc; misconfig fails late with a cryptic read error rather than fast-fail at boot.                                                                                                                                                           | Slow, confusing prod/dev misconfig diagnosis.                                                        | Add a small typed env module (zod or hand-rolled, no new heavy dep needed) that parses required vars once and is imported by the Supabase config.            | Low.                                                                              |
| **P2**    | Routing          | **No custom `not-found.tsx`.** Bad `[groupId]`/`[personId]`/`[profileId]` and mistyped URLs render the default Next 404, off-brand and without nav back.                                                                                                                                                     | Off-brand dead-ends.                                                                                 | Add `app/not-found.tsx` (and optionally `(protected)/not-found.tsx`) using app shell + a "back to Home" link.                                                | Low.                                                                              |
| **P2**    | Docs drift       | README "Security posture" and `CLAUDE.md` describe broad `select("*")` reads on `profiles`/`members` as open **tracked debt** — but grep finds **zero** `.select("*")` calls; `session.ts` uses `SESSION_PROFILE_SELECT`, groups use `GROUP_SELECT`, etc. The debt appears effectively closed.               | Misleads contributors about current state.                                                           | Verify each `profiles`/`members` read is allowlisted, then update README/CLAUDE.md to mark the debt resolved (or pinpoint the exact remaining read).         | Low — docs only.                                                                  |
| **P2**    | Dependencies     | `npm audit`: 9 vulns, all **dev/transitive** — esbuild→vite→vitest (high, dev-server only) and postcss→next (moderate). `npm outdated`: `next` 15.5.19→16.x, `@supabase/ssr` 0.10→0.12, `lucide-react` 0.468→1.x, `tailwind-merge` 2→3 (majors).                                                             | No runtime exposure today, but drift accumulates.                                                    | Bump vitest to clear the esbuild advisory (breaking-ish, contained to tests). Defer Next 16 / Tailwind-merge 3 / lucide 1 majors to a deliberate upgrade PR. | Low for vitest; medium for majors.                                                |
| **P2**    | Maintainability  | Three shells exceed ~1200 LOC: `groups-directory.tsx` (1732), `admin-master-calendar-shell.tsx` (1320), `super-admin-console-shell.tsx` (1222).                                                                                                                                                              | Hard to review/test/modify safely.                                                                   | Decompose `groups-directory` and the calendar shell into table/filters/row-actions/badges sub-components.                                                    | Medium — behavior-preserving refactor; do incrementally with tests.               |
| **P2**    | Engine pinning   | No `.nvmrc` / `engines` in `package.json`. CI uses Node 20; local is unpinned.                                                                                                                                                                                                                               | Version-skew bugs between local and CI/prod.                                                         | Add `.nvmrc` (`20`) and `"engines": { "node": ">=20 <21" }`.                                                                                                 | Very low.                                                                         |
| **P2**    | UX (auth)        | Invite/reset flows lack proactive "already enrolled"/"already set" detection. Re-using a redeemed invite or clicking a stale reset link after the password is set yields a generic error rather than a clear message. _(verify exact reset-state check first.)_                                              | Confusing rare-path UX; possible duplicate-submit.                                                   | Detect confirmed-password / consumed-invite earlier and render an explicit message + sign-in link.                                                           | Low.                                                                              |
| **P3**    | Error handling   | `revalidatePath` loop in `lib/shared/run-action.ts` is unguarded — a (rare) throw turns a _successful_ RPC into a 500, risking duplicate resubmits.                                                                                                                                                          | Rare but costly false-failure.                                                                       | Wrap each `revalidatePath` in try/catch; log `revalidate_error` and still return success.                                                                    | Very low.                                                                         |
| **P3**    | UX               | Off-nav frozen surfaces (`/admin/guests`, `/admin/check-ins`, `/admin/leader-pipeline`) still render fully with no in-UI "frozen / not maintained" banner.                                                                                                                                                   | Users may file bugs on intentionally-frozen surfaces.                                                | Add a shared dashed "preserved, not actively maintained" banner to off-nav surfaces.                                                                         | Very low.                                                                         |
| **P3**    | a11y regressions | No lint rule prevents future icon-only buttons without `aria-label`; current ones are labeled but unprotected.                                                                                                                                                                                               | Silent a11y regressions.                                                                             | Add `eslint-plugin-jsx-a11y` (or targeted rules) to the flat config.                                                                                         | Low — may surface existing nits to fix.                                           |
| **P3**    | Deploy / Ops     | No `/health` (readiness) route; no `/api/health`.                                                                                                                                                                                                                                                            | External monitors can't cheaply probe liveness.                                                      | Add a tiny static health route (optionally pinging Supabase).                                                                                                | Very low.                                                                         |
| **P3**    | Tests            | `vitest.config.ts` has no coverage reporting/thresholds.                                                                                                                                                                                                                                                     | No visibility into coverage gaps.                                                                    | Enable `coverage` (v8) and a non-blocking report; consider a floor later.                                                                                    | Very low.                                                                         |
| **P3**    | DB ops           | 119 migrations with no in-tree index/runbook of apply order or branch-deploy caveats.                                                                                                                                                                                                                        | Manual schema reasoning is `ls`-driven.                                                              | Add `supabase/migrations/README.md` indexing notable migrations + apply guidance.                                                                            | Very low — docs only.                                                             |
| **Later** | Tests            | **No RLS test harness.** The 4-tier visibility ladder is the security boundary; RLS bugs are silent (wrong rows, no error). Vitest unit tests + a11y don't exercise it.                                                                                                                                      | A future RLS/policy change could leak across tiers undetected.                                       | Stand up an integration harness against a seeded local Supabase that runs the same query as each tier and asserts visibility.                                | Medium–high effort.                                                               |
| **Later** | Tests            | No end-to-end test of the full action pipeline (client→action→validate→guard→RPC→audit→revalidate).                                                                                                                                                                                                          | Pipeline regressions only caught in pieces.                                                          | Add a thin integration layer (Playwright or seeded Supabase) asserting an audit row + persisted state after a write.                                         | Medium.                                                                           |
| **Later** | UI system        | No `sm:` breakpoint and no responsive type scale (global `text-base`); 375→768 jumps straight to multi-column.                                                                                                                                                                                               | Coarse mobile/tablet layouts.                                                                        | Introduce a responsive type scale + `sm:` adoption pass.                                                                                                     | Medium.                                                                           |
| **Later** | Perf             | Detail routes block on all reads (no Suspense streaming); largest shells ship as big client bundles.                                                                                                                                                                                                         | Slower first paint on heavy pages.                                                                   | Stream detail routes with Suspense; push static subtrees back to server components.                                                                          | Medium.                                                                           |

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
- Add `.nvmrc` + `engines` (P2).
- Bump `vitest` to clear the esbuild dev-chain advisory (P2).
- Wrap `revalidatePath` in try/catch in the Write Action Runner (P3).

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
- Verify all `profiles`/`members` reads are allowlisted, then correct the
  README/CLAUDE.md debt language (P2, docs only).
- _(Recommendation only)_ design an RLS test harness (Phase 4 / Later) — do not
  change policies or schema in this sweep.

### Phase 4 — Tests & Quality Gates

- Add tests for the ~15 untested server actions, auth-sensitive first (P1).
- Enable vitest coverage reporting (non-blocking) (P3).
- Add `eslint-plugin-jsx-a11y` rules to prevent a11y regressions (P3).
- Stand up the RLS / pipeline integration harness (Later).

### Phase 5 — Larger Modernization Options (only if justified)

- Decompose the 1200–1700 LOC shells (P2/Later).
- Introduce a `Input`/`Select`/`Tabs` primitive layer and migrate forms (P2).
- Responsive type scale + `sm:` breakpoint adoption (Later).
- Suspense streaming for detail routes (Later).
- Deliberate dependency-major upgrade PR: Next 16, tailwind-merge 3, lucide 1,
  `@supabase/ssr` 0.12 (Later).

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

### 3. `.nvmrc` + `engines` + vitest bump

- **Why:** Pin Node; clear the esbuild/vite/vitest dev-chain advisory.
- **Files:** `.nvmrc`, `package.json`, `package-lock.json`, possibly
  `vitest.config.ts`.
- **Acceptance:** `.nvmrc`=`20`; `engines.node` set; `npm audit` no longer
  reports the esbuild high advisory; `npm run test:run` still green.
- **Risk:** Low. **Order:** 3.

### 4. Wrap wide tables in horizontal scroll

- **Why:** Core admin tables overflow at 375px.
- **Files:** `components/admin/groups-directory.tsx`,
  `components/admin/shepherd-care/care-directory-table-base.tsx`,
  `components/admin/over-shepherd-list.tsx`,
  `components/admin/multiply/multiply-grid.tsx`,
  `components/admin/launch-planning/scenarios-panel.tsx` (+ optional shared
  `components/ui/scrollable-table.tsx`).
- **Acceptance:** Each table scrolls horizontally within its container at 375px
  with no page overflow; `tests/a11y/responsive-mobile.spec.ts` passes.
- **Risk:** Low. **Order:** 4.

### 5. Per-segment `error.tsx` for detail routes

- **Why:** A failed detail read shouldn't reset the whole surface.
- **Files:** new `error.tsx` in `app/(protected)/admin/groups/[groupId]/`,
  `admin/people/[kind]/[personId]/`, `admin/shepherd-care/[profileId]/`,
  `over-shepherd/[profileId]/`, `admin/check-ins/[groupId]/`; reuse
  `components/.../AppErrorState`.
- **Acceptance:** Forcing a detail-load failure renders an inline error card
  with back + retry, app shell intact; existing `(protected)/error.tsx`
  unchanged.
- **Risk:** Low. **Order:** 5.

### 6. Custom `not-found.tsx`

- **Why:** Off-brand default 404 on bad ids / mistyped URLs.
- **Files:** `app/not-found.tsx` (+ optional `app/(protected)/not-found.tsx`).
- **Acceptance:** A bad route renders a branded 404 with a link home; existing
  `notFound()` calls in detail pages now hit it.
- **Risk:** Low. **Order:** 6.

### 7. Shared `EmptyState` + groups empty state

- **Why:** Inconsistent empty UX; groups renders an empty table with no prompt.
- **Files:** `components/ui/empty-state.tsx` (new); adopt in
  `groups-directory.tsx`, `shepherd-care/care-follow-up-list.tsx`,
  `over-shepherd-list.tsx`, `interaction-timeline.tsx`,
  `follow-ups/follow-ups-shell.tsx`.
- **Acceptance:** One `EmptyState` component; an empty groups list shows a
  prompt; pastoral copy preserved; a11y harness still green.
- **Risk:** Low. **Order:** 7.

### 8. Detail-route `loading.tsx` with matched skeletons

- **Why:** Generic skeleton mis-shapes detail/editor pages.
- **Files:** new `loading.tsx` in the heaviest detail routes (groups, people,
  shepherd-care); optional skeleton variants in `components/lg/`.
- **Acceptance:** Navigating to a detail route shows a layout-matched skeleton;
  no layout shift on data arrival.
- **Risk:** Low. **Order:** 8.

### 9. Tests for untested server actions (auth-sensitive first)

- **Why:** ~15 action files have no tests, incl. forgot-password/invite/people.
- **Files:** new `__tests__/` beside `app/forgot-password/actions.ts`,
  `app/invite/[token]/actions.ts`, `app/(protected)/admin/people/actions.ts`,
  `groups/actions.ts`, `plan/actions.ts`, `shepherd-care/actions.ts`, etc.;
  reuse the mocking pattern from already-tested actions.
- **Acceptance:** Each covered action asserts validate→guard→RPC call shape and
  revalidate targets for success + at least one failure path; suite green.
- **Risk:** Low. **Order:** 9.

### 10. Typed env validation

- **Why:** Misconfig fails late and cryptically.
- **Files:** `lib/env.ts` (new) imported by `lib/supabase/config.ts`.
- **Acceptance:** Required vars parsed once; missing required var produces a
  clear startup error; optional vars (Upstash, proxy) stay optional and degrade
  as today; `npm run build` green.
- **Risk:** Low. **Order:** 10.

### 11. Guard `revalidatePath`; correct `select("*")` docs; frozen-surface banner

- **Why:** Three small hardening/clarity fixes.
- **Files:** `lib/shared/run-action.ts` (try/catch), `README.md` + `CLAUDE.md`
  (debt language after verification), `app/(protected)/admin/guests/page.tsx` /
  `check-ins/page.tsx` / `leader-pipeline/page.tsx` (banner).
- **Acceptance:** A thrown `revalidatePath` logs `revalidate_error` and still
  returns success; docs match reality; off-nav surfaces show the banner.
- **Risk:** Very low. **Order:** 11.

### 12. UI primitives (`Input`/`Select`/`Tabs`) + form-style consolidation

- **Why:** Remove duplicated form class strings; consistent a11y.
- **Files:** `components/ui/input.tsx`, `select.tsx`, `tabs.tsx` (new); migrate
  `follow-up-create-form.tsx`, `group-health-editor.tsx`,
  `prospect-create-form.tsx`, `assign-leader-form.tsx`, and others to import
  `components/admin/forms/field-styles.ts` / the new primitives.
- **Acceptance:** No locally-redeclared `FIELD_INPUT`/`FIELD_LABEL`; forms look
  and behave identically; a11y harness green.
- **Risk:** Low–medium (broad, mechanical). **Order:** 12.

### 13. Decompose oversized shells (incremental)

- **Why:** `groups-directory.tsx` (1732) and `admin-master-calendar-shell.tsx`
  (1320) are hard to maintain.
- **Files:** the two shells → extracted table/filters/row-actions/badges
  components.
- **Acceptance:** Behavior-preserving; tests + a11y unchanged; each new file
  well under ~600 LOC.
- **Risk:** Medium (do behind tests, one shell per PR). **Order:** 13.

### 14. (Later) RLS / pipeline integration harness; dependency majors

- **Why:** Close the deepest test gap; stay current.
- **Files:** new `tests/integration/**`; later a dedicated deps-upgrade PR.
- **Acceptance:** Per-tier RLS visibility asserted against seeded Supabase; an
  action write asserts a persisted row + audit row. Majors upgraded with green
  build/test/a11y.
- **Risk:** Medium–high. **Order:** 14.

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
      reads-seam pattern (ADR 0015) so tests can inject adapters.
- [ ] Server actions keep returning the **`ActionResult` discriminated union**
      and surfacing errors via form state (no catch-and-ignore).
- [ ] `middleware.ts` keeps refreshing the session cookie and excluding static
      assets; it does **no** authorization (that lives in `getCurrentSession`).
- [ ] All gates stay green: typecheck, lint (0 warnings), 3351 vitest tests,
      build, Playwright+axe a11y. Don't regress the a11y harness coverage.
- [ ] Public preview / unauthenticated paths keep rendering typed demo data and
      **never** call Supabase or expose private data.

---

## 8. Open Questions

Only the questions that genuinely change implementation (everything else was
resolved by inspection):

1. **CSP strictness & third parties.** A strict CSP must allowlist
   `@vercel/analytics`, `@vercel/speed-insights`, and the Supabase origin, and
   Next's inline styles/runtime. Is a **strict** CSP desired, or is a pragmatic
   policy (frame-ancestors + nonce-less style-src) acceptable for v1? (Affects
   Task 2 scope.)
2. **Dependency-major appetite.** Is a Next 15→16 (plus tailwind-merge 3,
   lucide 1, `@supabase/ssr` 0.12) upgrade in scope soon, or should the sweep
   stay on the current majors and only clear the dev-chain advisory? (Affects
   whether Task 14's upgrade is scheduled or deferred.)
3. **RLS test harness infra.** Standing up per-tier RLS integration tests needs
   a seeded Supabase target (local CLI stack or an ephemeral project) in CI. Is
   provisioning that infra acceptable, or should RLS stay covered by review +
   migration discipline for now? (Affects the "Later" test work.)
4. **Group-detail partial-failure UX (verify first).** Today a top-level
   detail-loader failure calls `notFound()` even when the group spine loaded.
   Should detail pages render **partial** data with per-tab error banners
   instead of 404-ing the whole page? (Confirm current behavior by running the
   path before changing it.)
