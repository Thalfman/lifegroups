# Repo-Wide Audit Plan

An executable, self-contained brief for the **next periodic full-codebase
audit**. A future session runs this plan and produces a report-only findings
document; this file specifies scope, method, deliverable format, and ground
rules so that session needs no other context.

Successor to
[`../audits/2026-06-21-full-codebase-audit.md`](../audits/2026-06-21-full-codebase-audit.md)
(the "prior audit" throughout). Written 2026-07-03; if significant time passes
before execution, the delta lenses below (`--since=2026-06-21`) still apply —
the fresh pass covers everything regardless.

---

## 1. Purpose & ground rules

- **Fresh full audit** of the entire repo — not a delta pass — across four
  dimensions: **Security & RLS**, **Architecture & code health**, **Tests &
  CI**, and **Docs & domain-language drift**.
- **Report-only, read-only.** No code changes, no fixes, no refactors, no
  issues filed. Every recommendation is advisory. The only file changes on the
  audit branch are the report itself plus a one-line pointer update in
  [`../README.md`](../README.md) — the same posture the prior audit states in
  its preamble.
- **Required pre-reading** before any pass starts:
  - [`README.md`](../../README.md), [`CONTEXT.md`](../../CONTEXT.md),
    [`CLAUDE.md`](../../CLAUDE.md), [`AGENTS.md`](../../AGENTS.md) (the P0
    list and standing security-migration conventions)
  - [`docs/architecture/RLS_VISIBILITY.md`](../architecture/RLS_VISIBILITY.md)
    and
    [`docs/architecture/DATA_CLASSIFICATION.md`](../architecture/DATA_CLASSIFICATION.md)
    plus the typed manifest `lib/security/data-classification.ts`
  - The prior audit report (structure, rubric, findings, and its
    "already strong" confirmations)
  - [`docs/adr/0033-keep-off-nav-pre-pivot-surfaces.md`](../adr/0033-keep-off-nav-pre-pivot-surfaces.md)
    (the ratified keep decision for off-nav surfaces)

## 2. Deliverable

- **`docs/audits/YYYY-MM-DD-full-codebase-audit.md`** (dated the day of
  execution), mirroring the prior report's structure:
  1. Executive summary
  2. Findings-by-severity table (P0/P1/P2/P3 counts)
  3. Methodology & scope — including the green-baseline `npm run test:run`
     file/test counts and the severity rubric
  4. **Prior-findings status table** (new section — see §4)
  5. One section per dimension, each with an
     `ID | Sev | Location | What | Why it matters | Recommendation` table and
     a "confirmed clear / already strong" note
  6. Findings index by severity
  7. What's already strong (overall)
  8. Suggested order of attack
- **Finding IDs restart fresh** (`SEC-1`…, `ARCH-1`…, `TEST-1`…, `DOC-1`…).
  Where a finding carries over from 2026-06-21, cross-reference the old ID
  explicitly (e.g. "carries forward 2026-06 TEST-2").
- **Index pointer:** update the `audits/` row in
  [`docs/README.md`](../README.md) ("Latest: …") to point at the new report.

## 3. Severity rubric & scope boundaries

Reuse the prior audit's rubric verbatim:

- **P0 / Critical** — violates a documented security invariant or exposes
  sensitive data (private Care Note, `admin_private_note`, cross-tier
  leakage).
- **P1 / High** — a real correctness/security risk, or visible drift against
  a ratified decision, or a missing guardrail on an invariant that today
  relies only on review.
- **P2 / Medium** — maintainability, coverage gaps, drift that will bite
  later.
- **P3 / Low** — cosmetic, stylistic, or nice-to-have.

**Out of scope** (unchanged from the prior audit): code fixes/refactors,
filing issues, dependency/CVE scanning, and performance/accessibility
deep-dives. If a P0 surfaces incidentally in an out-of-scope area, report it
anyway.

## 4. Step 0 — re-verify the 2026-06-21 findings

Before the four passes, walk **all 29 findings** from the prior audit and mark
each **closed / still open / partially closed**, citing concrete evidence
(file, migration, workflow, or PR — PR #789 "Action the 2026-06-21 full
codebase audit follow-ups" actioned many). Output is a compact status table in
the new report.

Statuses believed likely at planning time — **verify, don't assume**:

| Prior finding  | Believed status at planning time (2026-07-03)                                                                                       |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| DOC-1 / DOC-2  | Likely closed — "Lead"/"Leads" strings no longer grep-able in `components/`                                                         |
| DOC-4 / DOC-6  | Likely closed — collisions renumbered to ADR 0031/0032; catalog runs 0001–0033 and `docs/README.md` reflects it                     |
| DOC-5          | Likely closed — `CONTEXT.md` no longer says "default off" for Groups/People                                                         |
| SEC-1 / TEST-5 | Likely closed — `tests/fitness/care-note-visibility-divergence.test.ts`, `no-broad-rls.test.ts`, `no-hard-delete.test.ts` now exist |
| ARCH-1         | Likely closed/changed — the `read-models.ts` barrel was deleted in the reads-seam refactor; re-measure the new shape                |
| ARCH-8         | Resolved by decision — ADR 0033 ratified keeping the off-nav surfaces; audit conformance to it, not the decision                    |
| TEST-1         | Unknown — check whether the RLS integration harness is a **required** status check yet                                              |
| TEST-2         | Unknown — check for E2E specs covering the core Care/Plan/Multiply write flows                                                      |
| SEC-3          | Unknown — check whether `redeem-invite` gained `padToFloor`-style timing padding                                                    |
| All others     | Verify individually (DOC-3, DOC-7/8/9, SEC-2/4, ARCH-2…7, TEST-3/4/6/7/8)                                                           |

## 5. The four audit passes

Run as **four parallel read-only passes** (one subagent per dimension), each
returning a findings table; then synthesise and spot-verify (§6).

### What NOT to re-audit: the machine-checked invariants

The gating fitness suite (`tests/fitness/*.test.ts`, run by
`npm run test:run` in CI) already proves these on every build. **Enumerate the
suite at audit time** (it grows) and list it in the report as
"machine-checked, confirmed by green baseline" rather than re-deriving the
same conclusions by hand. At planning time it comprises 15 checks:

no service-role key in runtime (`no-service-role`), no `select("*")`
(`no-select-star`), no direct table writes (`no-direct-table-writes`), static
write-RPC audit pairing (`write-rpc-audit-pairing`), SECURITY DEFINER
`search_path` pinning (`security-definer-search-path`), no hard deletes
outside the danger zone (`no-hard-delete`), no broad RLS read policies
(`no-broad-rls`), RLS coverage completeness against the classification
manifest (`rls-coverage-completeness`), TS↔SQL care-note visibility
divergence (`care-note-visibility-divergence`), leader allowlists omit
admin-private columns (`leader-allowlist-no-admin-private`), no hardcoded
identity (`no-hardcoded-identity`), actions route through run-action
(`actions-use-run-action`), detail reads stay on the `readBatch` seam
(`detail-reads-use-read-batch`), no sensitive plaintext in `audit_events`
metadata (`audit-no-sensitive-plaintext`), and no sensitive columns keyed in
structured logs (`no-sensitive-data-in-logs`).

**The standing caveat (from `AGENTS.md`):** these scans are static and
conservative. They catch _new_ unaudited writes and _newly classified_ tables
— they cannot catch a **loosened `USING` clause on an existing policy**, drift
in audit-pairing _semantics_, or subtle role-boundary mistakes. That seam is
where the security pass earns its keep.

### Pass A — Security & RLS

- **RLS policy semantics.** Read every `CREATE POLICY` / `ALTER POLICY`
  `USING` clause for correctness against the oversight ladder
  (`RLS_VISIBILITY.md` is the spec). Use
  `git log --since=2026-06-21 -- supabase/migrations` as a delta lens for
  where to look hardest, but the fresh pass covers all policies.
- **The two opposite care-note conventions** (AGENTS.md SEC-1/SEC-2):
  `care_notes` / `prayer_requests` admin read is **grant-scoped** (the ladder
  peeks once a transparency grant exists); SC.4 private notes are
  **creator-scoped** and exclude even the Super Admin. Confirm no new
  care-adjacent table copied the wrong pattern.
- **Super-Admin-only tables** gate on `public.auth_role() = 'super_admin'`,
  **not** `public.auth_is_admin()` (which also admits the Ministry Admin), and
  have no write policy.
- **Audit-pairing semantics** (beyond the static check): paired
  `audit_events` rows carry the right metadata, in the same transaction, with
  no sensitive plaintext beyond the tested presence-flag rules; the
  `AUDIT_EXEMPT_WRITES` exemptions remain justified and tested.
- **Edge Functions** (`supabase/functions/{invite-user,redeem-invite,manage-test-auth-users}`):
  service-role key confinement, secret/PII redaction in errors and logs, and
  email-enumeration timing (prior SEC-3: `invite-user` pads latency,
  `redeem-invite` did not).
- **The auth/session path** — churned since the prior audit (parallelized
  auth waterfall, streamed admin nav, idle-timeout sign-out). Read
  `lib/auth/session.ts` and confirm the `getUser()` revocation gate wasn't
  weakened by the parallelization and the idle-timeout flow can't be bypassed
  or spoofed.
- **The two visibility exceptions end-to-end:** the Ministry Admin's Private
  Care Note (hidden even from the Super Admin) and author-private Care Notes
  (sealed until the transparency toggle flips). Confirm `admin_private_note`
  remains unreachable from leader routes and the deprecated `staff_viewer`
  role gained no access.
- **Public preview routes** render typed demo data only — no Supabase calls,
  no private data.

### Pass B — Architecture & code health

- **Pattern conformance:** thin async pages + stateful `*-shell.tsx` clients;
  the reads seam in its **post-refactor shape** (per-surface reads interfaces
  derived from the fetcher map; the `read-models.ts` barrel is gone);
  validate → guard → RPC → `revalidatePath` → log in every `actions.ts`;
  discriminated-union results switched on `kind`; graceful read degradation
  (no false zeros); named-column allowlists on every read.
- **Off-nav pre-pivot surfaces vs ADR 0033.** The keep decision is ratified —
  audit that the kept surfaces conform to it (annotations/comments in place,
  action handlers not drifting from canonical RPC contracts), not whether
  keeping was right.
- **Module size / duplication hotspots.** Re-measure the prior ARCH-1…ARCH-4
  hotspots after the refactor wave (`lib/admin/rpc.ts`, the run-action
  adapters, per-surface `RPC_ERROR_MESSAGES`) and flag any new >~800-LOC
  load-bearing modules.
- **`revalidatePath` coverage** (prior ARCH-6 carry-over): for a sample of
  high-fan-out writes (group health, care notes, readiness), cross-reference
  the revalidated paths against every surface rendering the affected entity.
- **Concept-reconciliation drift:** check
  [`CONCEPT_RECONCILIATION.md`](./CONCEPT_RECONCILIATION.md)'s backlog of
  pre-pivot concept residue against current code/schema/copy — what's been
  cleared, what still lingers.
- **Orphan/dead code** after the #801 orphan sweep and #798 desloppify
  backlog: any remaining exports with no importers, components with no
  mounting surface.

### Pass C — Tests & CI

- **Gating vs advisory lanes** (`.github/workflows/`): which jobs are
  **required** status checks. Prior TEST-1 carry-over — is the RLS/action
  integration harness required (at least on its path-matched set), and do its
  path filters still cover all RLS-relevant surfaces after the reads-seam
  refactor?
- **E2E coverage of core write flows** (prior TEST-2 carry-over): specs that
  drive a Care-Note write, a Prospect advance, and a Multiplication-readiness
  assessment end-to-end, or their continued absence.
- **Fitness-suite blind spots:** which invariants still rely on human review
  (audit-pairing semantics, RLS `USING` semantics, revalidate coverage, …)
  and which of those could become cheap static checks — the prior audit's
  highest-leverage recommendation category.
- **Coverage of code churned since 2026-06-21:** the session/auth changes
  (parallel waterfall, idle-timeout sign-out), the reads-seam refactor's new
  modules (e.g. `care-page-data`, `writeRubricGrade`), and the prior TEST-3/
  TEST-4 hook/observability gaps.
- **A11y suite health:** the Playwright + axe lane still covers the current
  surface list (new surfaces mounted in the harness), and the documented
  non-blocking-rule carve-outs in `tests/a11y/harness.ts` remain justified.

### Pass D — Docs & domain-language drift

- **ADR 0025 vocabulary in user-facing strings:** UX copy must say
  "Shepherd" / "Co-Shepherd" (never "Lead"/"Leads"), "Prospect" in the
  Interest Funnel (never "Guest"/"Lead"), "group type" (never "Cell").
  **The `leader` / `co_leader` code identity is intentional and is NOT a
  finding** — only rendered copy counts. Grep broadly (components, page
  metadata, toasts, aria-labels, empty states).
- **Canon accuracy vs shipped reality:** `CONTEXT.md`, `README.md`,
  `CLAUDE.md`, and `docs/README.md` against actual behavior — nav defaults
  per ADR 0024, the ADR catalog range, stack versions, route table, flag
  defaults.
- **ADR hygiene:** `Status:` headers present; supersession chains explicit
  (0008 → 0025, 0013 amended by 0016, …); no new numbering collisions.
- **Stale plan docs** in `docs/plans/`: each doc's shipped/proposed labels
  match reality (e.g. anything marked "Not yet built" that has since shipped,
  or vice versa), and `docs/README.md` table blurbs still describe them
  accurately.

## 6. Methodology & verification requirements

1. **Baseline first:** run `npm run test:run`; record file/test counts in the
   report. If red, stop and report the failure instead of auditing on a
   broken baseline.
2. **Four parallel read-only passes** (§5), each returning a findings table.
3. **Spot-verify every load-bearing claim** by reading the cited file/line
   before it enters the report — the prior audit caught real pass errors this
   way (a non-existent doc cited, a wrong framework version). Note
   corrections inline, as the prior report does.
4. **Every finding needs a concrete location:** `file:line`, migration
   filename + policy name, or workflow + job name. No un-cited findings.
5. **Branch & PR:** a fresh `claude/<slug>-<id>` branch; the diff contains
   only the report and the `docs/README.md` pointer; PR ready for review
   (not draft).

## 7. What NOT to do

- No fixes, no issue filing, no dependency upgrades, no test additions —
  report only.
- Don't re-litigate ratified decisions: the pivot ADRs (0016–0024), the
  ADR 0033 keep decision, and the ADR 0025 code-identity split. Audit
  **conformance to** those decisions, not the decisions themselves.
- Don't re-derive what the fitness suite proves (§5 preamble) — cite the
  green baseline instead.
- Don't count "confirmed clear" checks as findings; keep them in the
  per-section "already strong" notes, matching the prior report.
