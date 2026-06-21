# Full Codebase Audit — 2026-06-21

A read-only audit of the Lifegroups admin operating system (Next.js 16 / React
19 / TypeScript / Supabase). Scope, per request: **Security & RLS**,
**Architecture & code quality**, **Test coverage**, and **Docs & domain drift**.

This is a **report-only** pass — no code was changed, no issues were filed. Every
recommendation below is advisory. The only file changes in this branch are this
report and a one-line pointer added to `docs/README.md`.

---

## 1. Executive summary

**Overall health: strong.** This is a mature, security-conscious codebase whose
hardest invariants are machine-checked by a gating fitness suite
(`tests/fitness/**`) and whose docs (30 ADRs, a domain glossary, an RLS
visibility matrix) are unusually complete. The audit found **no open P0/critical
issues**. The genuine findings concentrate in two predictable places: (a)
**guardrails that still rely on human review** rather than an automated check,
and (b) **drift** — a handful of user-facing strings and index/glossary lines
that lagged behind the recent 2026-06 pivot.

### Findings by severity

| Severity          | Count | Nature                                                                                                                                                                                                                                                 |
| ----------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **P0 / Critical** | 0     | None found. The two highest-risk items the security pass surfaced (`app_settings` once world-readable to any authed user) were **already remediated** before this audit — see "What's already strong".                                                 |
| **P1 / High**     | 6     | Visible vocabulary drift against ADR 0025 (code strings still say "Lead"/"Leads"); a glossary line that contradicts ADR 0024; duplicate ADR numbers; the integration/RLS suite not a _required_ check; no end-to-end coverage of the core write flows. |
| **P2 / Medium**   | 15    | Maintainability (two large modules), review-only security seams worth a divergence test, coverage debt in hooks/observability, stale index lines.                                                                                                      |
| **P3 / Low**      | 8     | Cosmetic naming, missing ADR `Status:` headers, a stale framework-version line, presentational components covered only indirectly.                                                                                                                     |

The single highest-value follow-up is **closing the review-only security
guardrails with cheap static fitness checks** (no-broad-RLS / no-hard-delete /
TS↔SQL visibility divergence), because those are the invariants where one
careless migration could regress silently. The second is **fixing the
user-facing "Lead/Leads/Cell" strings** that violate the project's own
vocabulary rules (ADR 0025 / `CONTEXT.md`).

---

## 2. Methodology & scope

Four parallel read-only passes (one per dimension) analysed the tree, each
returning a findings table; the results were then synthesised and the
load-bearing claims **spot-verified by reading the cited files directly** before
inclusion. Corrections made during verification (and during the Codex review of
this report) are noted inline — e.g. a pass that cited a non-existent doc; a
glossary fix that had to include **Groups** as well as People; the framework
version (Next 16, not 15); and the RLS integration trigger (it _does_ run on
RLS-touching PRs, it just isn't a required check).

**Baseline:** `npm run test:run` is green at audit time — **311 test files, 3552
tests passing, 1 skipped**.

**Severity rubric**

- **P0 / Critical** — violates a documented security invariant or exposes
  sensitive data (private Care Note, `admin_private_note`, cross-tier leakage).
- **P1 / High** — a real correctness/security risk, or visible drift against a
  ratified decision, or a missing guardrail on an invariant that today relies
  only on review.
- **P2 / Medium** — maintainability, coverage gaps, drift that will bite later.
- **P3 / Low** — cosmetic, stylistic, or nice-to-have.

**Out of scope** (not requested): code fixes/refactors, filing issues,
dependency/CVE scanning, and performance/accessibility deep-dives. Where a P0
might have surfaced incidentally in those areas, none did.

---

## 3. Security & RLS

The fitness suite already proves, on every build: no service-role key in
runtime, no `select("*")`, no direct table writes, audit-pairing (static),
SECURITY DEFINER `search_path` pinning, the leader allowlist omits
`admin_private_note`, and no hardcoded identity. Those were confirmed sound and
are **not** re-listed as findings. The effort went to the seams only review
covers. **Result: low risk; no open P0/P1.**

| ID    | Sev | Location                                                                                                                                                                                                   | What                                                                                                                                                                                                                                                                           | Why it matters                                                                                                                                                                                                                                      | Recommendation                                                                                                                                                                                                                                                          |
| ----- | --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SEC-1 | P2  | `lib/admin/care-note-visibility.ts` (resolver) ↔ `supabase/migrations/20260608090000_phase_pivot9_care_notes.sql` (RLS)                                                                                    | The Care Note visibility truth table is expressed **twice** — once in TypeScript (UI copy), once in SQL RLS (the real boundary). They must be hand-synchronised.                                                                                                               | A UI-side change without the matching migration (or vice versa) creates silent divergence. RLS is authoritative, so the risk is the TS resolver _under_-showing or misrepresenting what the DB allows.                                              | Add a test (unit or integration) that parses the policy `USING` clause and asserts it matches `canReadNote`. Pin the relationship with a comment in both files.                                                                                                         |
| SEC-2 | P2  | `supabase/migrations/20260608090000_…care_notes.sql` (grant-scoped admin read) vs `supabase/migrations/20260529008000_phase_sc4_private_care_notes.sql:116–118` (creator-scoped, **excludes** super_admin) | Two visually similar care-note tables with **opposite** admin rules: `care_notes` lets the ladder peek once a transparency grant exists; SC.4 private notes are ministry-admin-creator-only and exclude the Super Admin by name.                                               | Easy to confuse when adding RLS to a care-adjacent table; a copy-paste of the wrong pattern would either leak or over-seal.                                                                                                                         | Add a header comment to each migration stating the distinction ("admin read is grant-scoped here, NOT creator-scoped like SC.4"). Flag both as a Codex review seam.                                                                                                     |
| SEC-3 | P2  | `supabase/functions/invite-user/index.ts` (pads), `supabase/functions/redeem-invite/index.ts` (does **not**)                                                                                               | Both service-role edge functions redact secrets/PII from errors, but only `invite-user` pads latency (`padToFloor`) against email-enumeration timing attacks — `redeem-invite` returns early on the existing-profile / existing-Auth-user branches with no equivalent padding. | The service-role key lives in these trusted Deno runtimes. Redaction is in place on both; the **timing side channel on the public redeem flow is unmitigated**, so an attacker may distinguish "already-registered" from "new" by response latency. | Assess whether `redeem-invite` needs the same `padToFloor` floor on its early-return branches; either add it or document why the redeem flow's enumeration risk is acceptable. Confirm on release that neither function's logs echo raw emails or are customer-visible. |
| SEC-4 | P3  | `supabase/migrations/20260704000000_account_deletion_requests.sql`                                                                                                                                         | New sensitive table is Super-Admin-only SELECT (correctly excludes Ministry Admin), soft-archive, audit-paired, no write policy — confirms the tier ladder is applied consistently to new tables.                                                                              | Confirmation, not a defect. Worth a standing rule for future tables.                                                                                                                                                                                | When adding Super-Admin-only tables, gate on `auth_role() = 'super_admin'`, not `auth_is_admin()`. Capture this as a Codex note.                                                                                                                                        |

**Confirmed clear (no findings):** no write RLS policies exist across all 126
migrations (writes are RPC-only); audit-pairing atomicity is _proven_ by
`tests/integration/action-pipeline.test.ts:165–201` (a forced audit-insert
failure rolls back the data write); author-private Care Notes and the
Ministry-Admin Private Care Note both enforce their documented exceptions; the
3 `AUDIT_EXEMPT_WRITES` exemptions remain justified and each carries a test;
RLS coverage is complete against the `data-classification.ts` manifest.

> **Hard-delete posture — clarification (not "fully clear").** Permanent,
> destructive deletes are confined to the Super-Admin danger zone
> (`super_admin_permanent_delete` + clean-slate/reset helpers, all audit-paired
> and tombstoned). **But** the _normal_ leader check-in RPC does hard-delete in
> a delete-then-reinsert pattern:
> `supabase/migrations/20260518080000_phase5b0_leader_checkin_writes.sql` deletes
> `attendance_records` (lines 207, 259) and `group_health_updates` (line 301)
> within the RPC transaction. These are scoped, in-transaction "replace the
> week's rows" operations rather than data loss — but they are real
> `DELETE FROM`s in a normal workflow, so the no-hard-delete invariant is **not**
> "deletes only exist in the danger zone". Any future static check (TEST-5) must
> allowlist this RPC; a reviewer relying on "danger-zone-only" would wrongly flag
> or wrongly trust it.

> **Already remediated (would have been P0):** `app_settings` was briefly
> readable by any authenticated user (`20260518000000_phase4_rls.sql:278–279`,
> `auth.uid() is not null`). Migration `20260629000000_seal_app_settings_to_admin.sql`
> sealed it (non-admins read only `metric_defaults`). No action beyond confirming
> the seal is present on all branches.

---

## 4. Architecture & code quality

The write pipeline (validate → guard → RPC → revalidate → log) and the reads
seam (ADR 0015) are well-designed and consistently used. Findings are
maintainability-leaning; **no invariant breaks.**

| ID     | Sev | Location                                                                                                         | What                                                                                                                                                                                                                  | Why it matters                                                                                                                                                                                                  | Recommendation                                                                                                                                                                                                                                                                                                                                                   |
| ------ | --- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ARCH-1 | P2  | `lib/supabase/read-models.ts` (~1,656 LOC)                                                                       | Very large read module. It re-exports focused `*-reads.ts` files but still hosts hundreds of fetch helpers, allowlists, type guards, and bundle assemblers.                                                           | A single load-bearing file this size is a review/onboarding/AI-navigation bottleneck and invites over-broad imports.                                                                                            | Split by domain (`group-reads.ts`, `membership-reads.ts`, `assessment-reads.ts`, …, each <400 LOC) and keep `read-models.ts` as a thin re-export barrel — the pattern already used for shepherd-care/follow-up reads. Incremental; barrel preserves the public API.                                                                                              |
| ARCH-2 | P2  | `lib/admin/rpc.ts` (~771 LOC)                                                                                    | The admin RPC gateway holds ~40+ entry points in one file; every new RPC diffs the same module.                                                                                                                       | Trust-boundary code that's hard to navigate and a merge-conflict magnet.                                                                                                                                        | Group args/wrappers by feature (`rpc-groups.ts`, `rpc-people.ts`, `rpc-super-admin.ts`, …) behind an `rpc.ts` barrel. No call-site changes.                                                                                                                                                                                                                      |
| ARCH-3 | P2  | `lib/admin/run-action.ts`, `lib/leader/run-action.ts`                                                            | The two per-surface adapters re-spell the same FormData-lift + auth→actor→baseFields pipeline, differing only at known variation points (auth gate, baseFields shape, error table, guard signature).                  | A fix or new hook (e.g. added audit context) must be ported twice and can drift.                                                                                                                                | Extract the shared skeleton into one internal helper parameterised by the variation points; leave specialisation minimal.                                                                                                                                                                                                                                        |
| ARCH-4 | P2  | `lib/admin/action-result.ts`, `lib/leader/action-result.ts`                                                      | Each surface has its own `RPC_ERROR_MESSAGES`; a token added to one but not the other silently degrades to a generic fallback for shared RPCs.                                                                        | Inconsistent, less-clear error UX across surfaces.                                                                                                                                                              | Hoist cross-surface tokens into a shared `COMMON_RPC_ERROR_MESSAGES` in `lib/shared/`; optionally a type-level check that admin tokens exist in leader (or are marked surface-only).                                                                                                                                                                             |
| ARCH-5 | P2  | admin action files (e.g. `app/(protected)/admin/follow-ups/actions.ts`, `…/shepherd-care/actions.ts`)            | Several admin actions rely entirely on RLS for subject scoping with no client-side `guard` (the RPC enforces `auth_is_admin`, but there's no defence-in-depth or denial-logging layer).                               | Fine today (admins are global), but when a _scoped_ admin (e.g. regional) lands, retrofitting a guard pattern is costly; today it also means denials surface as generic RPC errors, not clean logged decisions. | Adopt the `guard` hook proactively for subject-scoped actions; at minimum mark the high-risk ones with a comment noting where a scope check belongs.                                                                                                                                                                                                             |
| ARCH-6 | P2  | e.g. `app/(protected)/admin/group-health/actions.ts`                                                             | `revalidate` path coverage is not systematically verified; a write to group health affects several surfaces (`/admin/group-health`, `/admin/plan`, `/admin/care`) and a missed path leaves stale router-cached state. | Users may see stale grades/status after a successful write.                                                                                                                                                     | Cross-reference each action's `revalidate` against every page that renders the affected entity; document the intended coverage in a comment; consider a test asserting the path set.                                                                                                                                                                             |
| ARCH-7 | P3  | `lib/supabase/follow-up-reads.ts`, `care-note-reads.ts`                                                          | Allowlist naming is inconsistent (`LEADER_…`, `…_SAFE_…`, `ADMIN_…`); newcomers can't tell which list to reuse.                                                                                                       | Discoverability/consistency only.                                                                                                                                                                               | Adopt `[SURFACE]_[ENTITY]_COLUMNS`, reserving a `_SAFE` suffix for lists that actively omit sensitive columns (a trust-boundary signal).                                                                                                                                                                                                                         |
| ARCH-8 | P2  | `app/(protected)/admin/{guests,planning,launch-planning,group-health,calendar,check-ins,shepherd-care}/page.tsx` | Pre-pivot surfaces are hidden from nav (banner-annotated, flag-gated per ADR 0009/0013) but still resolve by URL **with working action handlers**. Their specs can drift from the canonical surfaces.                 | A frozen action whose RPC contract changes can break silently or behave unexpectedly.                                                                                                                           | Decide per surface: keep (accept the maintenance cost, add an ADR-referencing comment), retire (deprecation banner + warn-log on invoke), or re-export the canonical actions to remove duplication. _(Note: a prior pass cited `docs/PRODUCT_SURFACE_AUDIT_2026-05.md` for this — that file does not exist; the governing decisions are ADR 0009 and ADR 0013.)_ |

**What's already strong (architecture):** the centralised `runWriteAction` core
with correct falsy-RPC-return handling (`lib/shared/run-action.ts`); pure,
composable validators; consistent reads-seam + `readBatch` graceful degradation
(no false zeros); type-derived leader allowlists that omit admin-only columns;
exemplary leader-calendar guards (`guardRaw` pre-validation ownership +
post-validation membership); `@/*` alias used everywhere (only test files use
relatives); no native dialogs (ESLint `no-alert` clean).

---

## 5. Test coverage

~3,550 unit tests, 13 gating fitness checks, 24 gating a11y specs, plus 2
opt-in RLS/pipeline integration specs. Strong foundations; the gaps are
**flow-level coverage** and **a gating gap on the integration suite**.

| ID     | Sev | Location                                                                 | What                                                                                                                                                                                                                                                                                                                                                                            | Why it matters                                                                                                                                                                                                                                                                                           | Recommendation                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------ | --- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TEST-1 | P1  | `tests/integration/**` + `.github/workflows/rls-integration.yml:27–39`   | RLS + action-pipeline integration tests **do** run on RLS-touching PRs (a path-filtered `pull_request` trigger covers `supabase/migrations/**`, `lib/**/*read*.ts`, `lib/**/*rpc*.ts`, `app/**/*actions.ts`, etc.) — but the job is **not a required status check**, so a red result does not block merge, and a PR that touches RLS via a non-matching path skips it entirely. | An RLS drift (e.g. an Over-Shepherd gaining sight of a sealed note) or a broken audit pairing can be merged **despite a red (or skipped) harness run**. The static fitness checks catch _new_ unaudited writes and _new_ classified tables, but **not a loosened `USING` clause on an existing policy**. | Make the harness a **required check** in branch protection (at least for the path-matched set), so a red run blocks merge; review the path filters for RLS-relevant surfaces not currently covered. The trigger already exists — the gap is "advisory" vs "required".                                                                                                                                                              |
| TEST-2 | P1  | `tests/a11y/**` (24 specs); core write flows                             | The a11y suite is axe/accessible-name focused — it proves the UI is _navigable_, not that the **core write flows complete**. There is no end-to-end test for: create a Care Note, advance a Prospect, assess Multiplication readiness.                                                                                                                                          | A regression in form submission, RPC ordering, or post-write RLS visibility passes static + unit checks (which mock the success case) and only fails in manual QA.                                                                                                                                       | Add ~3 happy-path Playwright specs reusing the seeded-auth harness: care-note write (+ audit read-back), prospect advance (+ visibility change), multiplication readiness (+ persisted state). ~100 lines each.                                                                                                                                                                                                                    |
| TEST-3 | P2  | `lib/hooks/use-persisted-view-state.ts`, `lib/hooks/use-value-change.ts` | **Zero tests** on two foundational hooks. `usePersistedViewState` does hydration-safe localStorage sync across many admin surfaces (~12 callers); `useValueChange` drives render-time diffing for form resets.                                                                                                                                                                  | A regression causes cross-surface state to persist wrongly or hydration mismatches — high blast radius, hard to spot.                                                                                                                                                                                    | Unit-test both: hydration, scope changes, storage-unavailable, corrupt values (`usePersistedViewState`); identity-based change detection + async updates (`useValueChange`).                                                                                                                                                                                                                                                       |
| TEST-4 | P2  | `lib/observability/{logger,instrument,identifiers}.ts`                   | Only `read-timing.ts` is tested; the logger, write-side instrument, and correlation-ID helpers are not.                                                                                                                                                                                                                                                                         | Observability is incident-response infrastructure; a broken logger/tracer silently drops diagnostics. The modules are thin, so cheap to cover.                                                                                                                                                           | Smoke tests: assert emitted event shape + context keys (`logger`), return-value/error-rethrow preservation (`instrument`), and ID derivation (`identifiers`). Reuse the `read-timing.test.ts` pattern.                                                                                                                                                                                                                             |
| TEST-5 | P2  | (advisory) `tests/fitness/**`                                            | Three review-only invariants could become _static_ fitness checks.                                                                                                                                                                                                                                                                                                              | Converting review-only rules to machine checks is the highest-leverage way to keep this codebase safe over time (cross-refs SEC-1, and §3 "confirmed clear").                                                                                                                                            | Feasibility: (a) **no-hard-delete** — scan migrations for `delete from` outside the danger-zone RPCs (copy `no-direct-table-writes.test.ts`), **with an explicit allowlist for the leader check-in delete-then-reinsert** (see §3) so the legitimate case doesn't force the check off; (b) **no-broad-RLS** — flag `using (true)` / `auth.uid() is not null` in `create policy`; (c) **TS↔SQL visibility divergence** — see SEC-1. |
| TEST-6 | P3  | `lib/home/hub-stats.ts`                                                  | No test on the home-stats aggregator (already resilient via `Promise.allSettled`).                                                                                                                                                                                                                                                                                              | Low consequence (nav aids), but the read contracts deserve one happy-path guard.                                                                                                                                                                                                                         | One ~15-line smoke test using the in-memory adapter pattern.                                                                                                                                                                                                                                                                                                                                                                       |
| TEST-7 | P3  | `components/auth/{logout-button,user-pill,landing-hint-refresher}.tsx`   | No tests on auth-related client components (render on every page).                                                                                                                                                                                                                                                                                                              | Moderate: thin wrappers, but a broken signout/role badge surfaces late.                                                                                                                                                                                                                                  | Optional: a `UserPill` variant render test; a `LogoutButton` check in the seeded-auth flow.                                                                                                                                                                                                                                                                                                                                        |
| TEST-8 | P3  | `components/{calendar,pastoral,pwa,dashboard}/**`                        | Presentational components have no direct tests.                                                                                                                                                                                                                                                                                                                                 | Low: covered **indirectly** — calendar/dashboard by the a11y flows and the surfaces that mount them, the pastoral DSL by 100+ component tests, PWA features degrade gracefully.                                                                                                                          | No action needed. If a specific atom needs a contract, assert DOM shape (not snapshots). Verify dashboard `badges`/`cards` appear in the a11y harness surface list.                                                                                                                                                                                                                                                                |

**What's already strong (testing):** behaviourally-focused unit tests with
in-memory reads adapters (no snapshots, real degradation cases); a comprehensive
gating fitness suite whose support utilities are themselves tested
(`tests/fitness/support/**`); integration specs that prove per-tier visibility
and audit atomicity; a fast deterministic default CI lane with specialist lanes
split off cleanly.

---

## 6. Docs & domain drift

Root canon (README, CONTEXT, CLAUDE, ADRs 0016–0030) accurately describes the
landed pivot. Findings are localised drift; building on the 2026-06-18 doc
sweep, only new/changed items are reported. **Reminder: the `leader`/`co_leader`
code identity vs. "Shepherd" UI split is intentional (ADR 0025) and is NOT
flagged.** The items below are places UI _copy_ still says "Lead/Leads/Cell".

| ID    | Sev | Location                                                                                                                          | What                                                                                                                                                                                                               | Why it matters                                                                                                                                                                        | Recommendation                                                                                                                                                                                                                                                               |
| ----- | --- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DOC-1 | P1  | `components/admin/groups/groups-helpers.ts:25`                                                                                    | The groups Leader-column text renders `… · ${role === "co_leader" ? "Co" : "Lead"}` — user-visible.                                                                                                                | ADR 0025 / `CONTEXT.md`: user-facing copy must read "Shepherd"/"Co-Shepherd", never "Lead".                                                                                           | Render `"Co-Shepherd"` / `"Shepherd"`. (Verify the a11y accessible-name specs that read this column still pass.)                                                                                                                                                             |
| DOC-2 | P1  | `components/admin/person-detail/person-detail-shell.tsx:293`                                                                      | The person's group list renders `person.kind === "profile" ? "Leads" : "Member of"` — user-visible "Leads".                                                                                                        | Same ADR 0025 violation in a prominent detail surface.                                                                                                                                | Render `"Shepherds"` for the profile case.                                                                                                                                                                                                                                   |
| DOC-3 | P2  | `components/lg/admin/dashboard/MultiplyOverviewCard.tsx:39,53,59`; `components/lg/admin/dashboard/VitalSignsBand.tsx:170,177,178` | User-facing dashboard strings say "Cell readiness", "No active cells yet", "Cells ready", "Cells ready to multiply" — "Cell" is retired jargon that must not appear in UI.                                         | `CONTEXT.md` retired the Cell model; surfaces should say "group type".                                                                                                                | Replace with group-type phrasing. **Note:** these exact strings are asserted in `vital-signs-band.test.tsx` and `dashboard-client-structure.test.tsx`, so the copy change must update those tests in lockstep.                                                               |
| DOC-4 | P1  | `docs/adr/`                                                                                                                       | **Duplicate ADR numbers:** two `0022-*` (`admin-jsonb-write-reguard-and-audit-locks`, `multiply-unifies-plan-readiness-leaders`) and two `0025-*` (`invitee-chooses-own-name`, `rename-leader-label-to-shepherd`). | Cross-references and supersession chains become ambiguous; "ADR 0025" is now under-specified.                                                                                         | Renumber the two later-arriving collisions to the next free numbers (0031/0032) and fix inbound references.                                                                                                                                                                  |
| DOC-5 | P1  | `CONTEXT.md:338–340`                                                                                                              | The Admin OS entry says "the former **Groups**, Planning, **People**, Calendar, and Follow-ups tabs are hidden behind Super-Admin nav-visibility flags, default off."                                              | Contradicts ADR 0024, which defaults **both** `nav_show_groups` and `nav_show_people` ON (seed `20260701020000`). The glossary misstates the shipped default for _two_ tabs, not one. | Remove **both Groups and People** from the "default off" list (keep Planning/Calendar/Follow-ups); state Groups and People are default-on per ADR 0024.                                                                                                                      |
| DOC-6 | P2  | `docs/README.md:70`                                                                                                               | The ADR index says "0001–0025; the pivot is 0016–0022, amended by 0023–0024" but ADRs run to **0030** (and to **0032** once DOC-4's duplicates are renumbered).                                                    | Readers/agents under-count the decision catalog and miss 0026–0030.                                                                                                                   | Update the range to the true catalog **after** the DOC-4 renumber — i.e. "0001–0032 …; later amendments 0026–0032 (flag reads, home workspace, page runner, manual Plan readiness, Multiply type-intent, + the two renumbered collisions)". Keep DOC-4 and DOC-6 consistent. |
| DOC-7 | P3  | `docs/adr/` (e.g. 0008, 0009, 0010, 0013, 0016–0020, 0023, 0024)                                                                  | Several ADRs lack an explicit `Status:` header that others have.                                                                                                                                                   | Decision state (accepted/superseded/amended) must be inferred from prose; note 0008 is superseded by 0025.                                                                            | Add `Status:` headers; mark supersession (0008 → 0025; 0013 amended by 0016).                                                                                                                                                                                                |
| DOC-8 | P3  | `docs/doc-sweeps/2026-06-18-0356/report.md`                                                                                       | The prior sweep's actionable checklist (ADR collision, CONTEXT.md Admin OS line, index drift, missing Status headers, PRD retire/keep calls) appears **unexecuted** — several items recur above.                   | Drift identified once but not closed compounds.                                                                                                                                       | Execute the prior sweep's checklist alongside DOC-1…DOC-7.                                                                                                                                                                                                                   |
| DOC-9 | P3  | `CLAUDE.md` ("Next.js 15 (App Router)") vs `package.json:36` (`"next": "^16.2.9"`)                                                | `CLAUDE.md` (and pre-pivot docs) describe the stack as **Next.js 15**, but the repo runs **Next 16** — `proxy.ts` and other comments already reference "Next 16" conventions.                                      | A version mismatch in the canonical agent guide points contributors/agents at the wrong Next.js conventions and migration assumptions.                                                | Update `CLAUDE.md` (and any other "Next.js 15" mention) to Next 16. _(This report's own stack line was corrected during review.)_                                                                                                                                            |

**What's already strong (docs):** the root canon and all 8 `docs/architecture/*`
files are current with the pivot; the intentional leader/Shepherd code-vs-UI
split is clearly documented; Over-Shepherd and Interest-Funnel ("Prospect",
"Desired group type", funnel states) vocabulary is held cleanly with no
"Coach"/"Guest"/"Lead" pollution in core surfaces; runbooks and review/retro
history are correctly labelled.

---

## 7. Findings index (by severity)

**P1 / High (6)**

- DOC-1 — `groups-helpers.ts:25` renders "Lead" (ADR 0025).
- DOC-2 — `person-detail-shell.tsx:293` renders "Leads" (ADR 0025).
- DOC-4 — duplicate ADR numbers (0022 ×2, 0025 ×2).
- DOC-5 — `CONTEXT.md:338–340` marks Groups **and** People nav default-off (contradicts ADR 0024).
- TEST-1 — integration/RLS harness is not a _required_ check (red/skipped runs can merge).
- TEST-2 — no end-to-end coverage of the core Care/Plan/Multiply write flows.

**P2 / Medium (15)** — SEC-1, SEC-2, SEC-3, ARCH-1, ARCH-2, ARCH-3, ARCH-4,
ARCH-5, ARCH-6, ARCH-8, DOC-3, DOC-6, TEST-3, TEST-4, TEST-5.

**P3 / Low (8)** — SEC-4, ARCH-7, DOC-7, DOC-8, DOC-9, TEST-6, TEST-7, TEST-8.

_(Totals: 6 P1 + 15 P2 + 8 P3 = 29 actionable findings. The "What's already
strong" confirmations in §§3–5 are not counted as findings.)_

### Suggested order of attack

1. **Cheap, high-trust:** DOC-1, DOC-2, DOC-3 (string fixes + their tests),
   DOC-4/5/6 (renumber + index/glossary edits). Small, visible, closes ADR-0025
   / ADR-0024 drift.
2. **Highest safety leverage:** TEST-5 (turn review-only invariants into static
   fitness checks) and TEST-1 (gate the integration suite on RLS PRs).
3. **Flow confidence:** TEST-2 (three happy-path E2E specs).
4. **Maintainability, as capacity allows:** ARCH-1/ARCH-2 (split the two large
   modules behind barrels), then ARCH-3/4/5/6.

---

## 8. What's already strong (overall)

- **Machine-checked invariants.** The fitness suite turns most P0 security rules
  into build failures: no service-role key in runtime, no `select("*")`, no
  direct table writes, audit-pairing, SECURITY DEFINER `search_path` pinning,
  leader allowlist hygiene, no hardcoded identity, RLS-coverage completeness.
- **Writes are RPC-only.** Zero write RLS policies across 126 migrations; every
  mutation flows through a narrow SECURITY DEFINER RPC with a paired
  `audit_events` row, and the atomicity is _proven_ by an integration test.
- **Privacy model holds.** Author-private Care Notes and the Ministry-Admin
  Private Care Note enforce their documented exceptions; `admin_private_note` is
  unreachable from leader surfaces by type _and_ column allowlist _and_ a
  fitness test.
- **Clean architecture seams.** The write-action runner and reads seam (ADR 0015) are centralised, well-tested, and used consistently with graceful
  degradation.
- **Documentation discipline.** 30 ADRs, a domain glossary, an RLS visibility
  matrix, runbooks, and a prior doc sweep — far above the norm.

The net message: this codebase is in good shape. The work ahead is **converting
human-review guardrails into automated checks** and **clearing post-pivot drift**
— not fixing structural defects.
