# Phase 6 Review — `types/` · `tests/` · config

Working notes. Read-only review against `coding-standards` + `/simplify`. Final
phase: `types/` (enums + hand-rolled DB types), `tests/` (a11y specs + harness +
integration + stubs), and the root config files, plus a light sweep of the
colocated `**/__tests__/**` unit suite.

**Headline:** the type boundary, configs, and test infrastructure are clean and
heavily (load-bearingly) commented. The **colocated unit suite is healthy** — a
grep sweep for vague names (`works`/`test`/`foo`) and empty describe blocks found
zero matches; sampled files use behavior-describing names + clear AAA + named
fixtures with no `any`/loose `as`. No systemic test-quality finding (this closes
the test-naming/AAA lens deferred from earlier phases). Findings are a few small
DRY/dead-code items; most of `types/` and config is correctly category C.

> Correction to scope: `types/database.ts` is **hand-rolled** (imports `./enums`,
> uses local `UUID`/`Timestamp` aliases — per CLAUDE.md "hand-rolled Supabase row
> types"), not generated. Treat substantive edits as schema-coupled (C); there's
> no "regenerate" path.

---

## (A) Safe auto-fixes — behavior-preserving

1. **`tailwind.config.ts:137` dead `transitionDuration: { "250": "250ms" }`** —
   zero `duration-250` usages anywhere (grep-confirmed, no dynamic class
   construction). Remove the block.
2. **`PHONE = { width: 375, height: 812 }` duplicated 5×** — `tests/a11y/
responsive-mobile.spec.ts:28`, `offline-error.spec.ts:10`,
   `mobile-flows.spec.ts:31`, inline in `groups.spec.ts:359`,
   `mobile-smoke.spec.ts:216`. Export `PHONE` from `tests/a11y/harness.ts` and
   import it. Pure constant move — asserts nothing.

---

## (B) Needs-judgment — behavior-preserving, modest payoff

1. **Shared base for the two vitest configs** — `vitest.config.ts` +
   `vitest.integration.config.ts` each redeclare `rootDir`, the `@` alias, and
   `environment: "node"`. Share only those bits (e.g. a `vitest.shared.ts`); keep
   each file's `include`/`exclude` globs inline + explicit (the disjoint globs are
   a guardrail — don't centralize them). Low risk, defensible to leave.
2. **a11y harness DRY (touches CI-gating specs — behavior-preserving, but verify
   via CI)** — all wrap byte-identical strings/logic, so nothing asserted changes:
   - surface-locator `page.locator('[data-a11y-surface="…"]')` repeated ~51× →
     `surface(page, id)` helper in `harness.ts`.
   - `signIn(page, email, password)` reimplemented 3× (`mobile-smoke.spec.ts:66`,
     `role-routing.spec.ts:42`, `leader-routes.spec.ts:39`) → shared helper.
   - seeded-auth creds + skip-reason boilerplate (`A11Y_*` env derivation) →
     `seededCreds()` helper (skip-reason wordings differ slightly — unify or
     parameterize).
   - `scrollWidth - clientWidth` overflow probe reimplemented 3× →
     `expectNoHorizontalOverflow(locator, label)` (needs a `label` param to keep
     per-site diagnostics).
   - `gotoSetupHome(page)` + the `setup-recovery-checklist` selector duplicated in
     `home.spec.ts` + `mobile-flows.spec.ts`.
3. **Prune the mostly-dead shadcn HSL color bridge** (`tailwind.config.ts:27`) —
   most bridge tokens (`bg-background`/`bg-primary`/…) have 0 usages; only
   `bg-card`/`bg-muted`/`ring-ring` are live. Tightening the comment to name the
   live subset is safer than pruning (theme tokens are cheap + easy to
   reintroduce). Judgment.

---

## (C) Invariant-adjacent — DEFER (do not touch)

- **`types/enums.ts`** — values mirror Postgres enums (DB trust boundary); no
  member rename/value change. (Observation only: `ShepherdCare*` uses the retired
  "Shepherd" prefix vs the "Leader" glossary, but these are 1:1 with Postgres enum
  type names — a coordinated schema migration, not a code edit.)
- **`types/database.ts`** — hand-rolled trust boundary (1712 lines), consistent
  with `enums.ts`, not stale (reflects recent ADRs). Schema-coupled — defer.
  The `varColor` `as unknown as string` in tailwind is a justified, documented
  resolver-type bridge — leave.
- **Config guardrails** — `next.config.ts` CSP/security headers + redirects
  (verified: the removed-route redirect sources are correct, destination lives);
  `eslint.config.mjs` (jsx-a11y→error, `no-alert: error`); `playwright.config.ts`
  testMatch/testIgnore mobile/desktop split + `next build` inside webServer;
  `tsconfig.json` paths/strict; `postcss.config.mjs`. Do not weaken.
- **a11y harness contract** — `tests/a11y/harness.ts` `expectNoBlockingAxeViolations`/
  `gotoHarness` route + 200-guard + critical/serious axe policy + the documented
  non-blocking-rule carve-out; the asserted `data-a11y-surface` ids +
  `FORBIDDEN_GENERIC_NAMES`. Any B2 helper must wrap these without changing the
  values.
- **Integration `support/`** — real-DB/RLS seam: service-role-in-fixtures-only,
  local-host refusal guards, SQL/DDL, and every RLS visibility assertion in
  `rls-visibility.test.ts`/`action-pipeline.test.ts`. No changes to SQL/RLS
  assertions or env wiring. (`data.id as string` casts are legitimate PostgREST
  row narrowing — leave.)

---

## Recommended fix set for the Phase 6 PR

Take **(A) #1–#2** (tailwind dead token + `PHONE` constant) + **(B) #1** (vitest
shared base) + **(B) #2** (the a11y harness DRY — `surface`, `signIn`,
`seededCreds`, overflow probe, `gotoSetupHome`; all behavior-preserving wrappers
of identical strings/logic). These are verifiable by typecheck/lint/build (which
typecheck the specs) with the a11y runtime confirmed by CI. Defer **(B) #3** (the
shadcn-color prune — comment-tighten only if at all). **(C)** untouched.
