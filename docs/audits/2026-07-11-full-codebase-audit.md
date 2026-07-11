# Full Codebase Audit — 2026-07-11

| Audit fact       | Value                                                                                         |
| ---------------- | --------------------------------------------------------------------------------------------- |
| Audit name       | **2026-07-11 Full Codebase Audit**                                                            |
| Auditor          | **Codex**                                                                                     |
| Canonical ref    | `origin/main`                                                                                 |
| Audited commit   | `7a28acfd1123f947b202ab4a428ed306907ee700`                                                    |
| Comparison audit | `docs/audits/2026-07-03-full-codebase-audit.md` at `bb7295cc247360433854090e6dadf05d6de48a84` |
| Report path      | `docs/audits/2026-07-11-full-codebase-audit.md`                                               |
| Change boundary  | Report only; no code, configuration, index, issue, or workflow changes                        |

This report covers Security and RLS, architecture and correctness, tests and CI,
and documentation/domain-language drift. Recommendations are advisory. The only
audit-authored tracked change is this file.

## 1. Executive summary

**Overall health is strong, with several important privacy and correctness seams
to close.** All **39 findings from the 2026-07-03 audit are resolved as scoped**:
37 closed through implementation or documentation, one closed by an explicit
architecture decision, and the former E2E-absence finding closed by substantive
coverage that now has successor gating and assertion-quality findings.

The required deterministic gate is green at the audited commit: lint, typecheck,
production build, and **394 Vitest files / 4,151 passing tests**. The exact
`origin/main` SHA also has both required GitHub contexts green. The repository now
has 24 top-level fitness invariants, a live-stack RLS lane, six real-stack E2E
specs, and a 26-spec accessibility lane.

The audit found **no P0 / critical cross-tier exposure**. It found **20 advisory
findings: 4 P1, 14 P2, and 2 P3**. The highest-priority work is:

1. Make account deletion truthful and irreversible: a full profile snapshot and
   denormalized audit identity currently survive “permanent” deletion.
2. Stop sending and storing raw client IPs where the public and internal contracts
   say keys are hashed, and bound the SQL throttle ledger globally.
3. Promote the now-stable E2E lane into a merge signal without creating a
   path-filtered required-check trap.
4. Correct the canonical Permanent deletion definition, which still says Auth
   identities are never touched although the shipped purge deletes them.

### Findings by severity

| Severity          | Count | Summary                                                                                                                                                                                                                                                         |
| ----------------- | ----: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P0 / Critical** |     0 | No current cross-tier data exposure or direct invariant violation found.                                                                                                                                                                                        |
| **P1 / High**     |     4 | Misstated account erasure, raw-IP retention/disclosure, advisory-only critical-flow E2E, and canonical deletion semantics contradicting the shipped Auth purge.                                                                                                 |
| **P2 / Medium**   |    14 | Telemetry trust, nullable-author coverage, snapshot classification, stale revalidation, church-time correctness, false-empty privileged reads, post-commit response semantics, danger-zone reachability, request fan-out, live-RLS breadth, and workflow gates. |
| **P3 / Low**      |     2 | Moving Supabase CLI version and stale fitness-suite counts.                                                                                                                                                                                                     |

## 2. Methodology, evidence, and limitations

The audit was executed against a detached checkout of the exact `origin/main`
commit above, then the original feature branch was restored before writing this
report. The comparison range contains **615 changed files, 30,512 insertions, and
17,786 deletions**, so prior findings were re-verified before looking for new
ones.

The pass pre-read the repository canon and prior report, inventoried runtime,
database, test, workflow, and documentation surfaces, and then performed four
focused reviews. Every included finding was checked against the cited source;
unconfirmed suspicions and style-only preferences were excluded. Current GitHub
branch protection and workflow history were also inspected read-only.

### Verification record

| Check                          | Result at audit time                                                                                                                                                                                                                                                     |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm.cmd run verify:toolchain` | **Pass.** Audit shell: Node `v22.16.0`, npm `11.6.0`; the repo declares Node `>=20.19` and `.nvmrc` pins `20`.                                                                                                                                                           |
| `npm.cmd run lint`             | **Pass.**                                                                                                                                                                                                                                                                |
| `npm.cmd run typecheck`        | **Pass.**                                                                                                                                                                                                                                                                |
| `npm.cmd run test:run`         | **Pass.** 394 files; 4,151 passed, 1 intentional conditional skip, 0 failed.                                                                                                                                                                                             |
| `npm.cmd run build`            | **Pass.** Next.js 16.2.9 production build completed and generated 18 static pages.                                                                                                                                                                                       |
| `npm.cmd run test:integration` | **Not exercised locally.** The command exited successfully but skipped all 4 files / 144 tests because `RUN_RLS_INTEGRATION=true` and a local Supabase stack were unavailable. This is not counted as a pass.                                                            |
| `CI=1 npm.cmd run test:a11y`   | **Partially exercised locally.** 233 passed and 41 intentionally skipped; 28 WebKit cases were environment-blocked because the local Playwright WebKit executable was absent. Chromium cases passed. The exact audited SHA's required remote a11y context is green.      |
| Real-stack E2E                 | **Not run locally.** Supabase CLI/`psql` and the seeded local stack were unavailable. The latest scheduled E2E, seeded-auth route smoke, and RLS integration runs inspected from 2026-07-06 were green; recent E2E history meets the workflow's own promotion criterion. |
| GitHub protection              | `main` is strict and requires exactly `lint + typecheck + build + test` and `accessible-name check (playwright + axe)`. The exact SHA's CI run is green: <https://github.com/Thalfman/lifegroups/actions/runs/29159118662>.                                              |

Local process-spawn sandboxing initially produced `spawn EPERM` for Vitest; the
identical command passed in the approved process context. Generated
`next-env.d.ts` churn was restored before report creation.

This was not a dependency/CVE scan, production-data inspection, load test, or
manual accessibility deep-dive. Performance findings are derived from request
shape, not production traces. Remote workflow evidence is a dated snapshot, and
the local limitations above are kept explicit rather than represented as green
coverage.

### Severity rubric

- **P0 / Critical** — exposes sensitive data, crosses a documented role/RLS
  boundary, or creates an immediate destructive-integrity failure.
- **P1 / High** — a material privacy/correctness risk, a false public or canonical
  contract, or a missing merge guard on a critical invariant.
- **P2 / Medium** — a concrete correctness, maintainability, performance, or
  coverage gap that should be scheduled.
- **P3 / Low** — low-risk drift or reproducibility polish.

## 3. Status of every 2026-07-03 finding

**39 resolved as scoped; none carried forward under the old rationale.** New
findings later in this report are successors where the repository materially
advanced and exposed a narrower next seam.

### Security dispositions

| Prior ID | Status                      | Current evidence                                                                                                                                           |
| -------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SEC-1    | **Closed**                  | `RLS_VISIBILITY.md` now carries the 56-table matrix, deletion-request table, and both NO_READ tables; `rls-visibility-doc-sync.test.ts` pins it.           |
| SEC-2    | **Closed by hardening**     | `lib/auth/idle-timeout.ts` and middleware now fail closed for authenticated sessions with missing/malformed activity markers.                              |
| SEC-3    | **Closed**                  | The group-types write takes the shared advisory lock before its snapshot read in `20260713000000_security_polish_group_types_lock_and_presence_flags.sql`. |
| SEC-4    | **Closed by documentation** | `RLS_VISIBILITY.md` now documents the `profiles_read` self arm and why it intentionally lacks an active-status filter.                                     |
| SEC-5    | **Closed**                  | Contact auditing uses presence flags; the retained full name is explicitly the audit-attribution identity.                                                 |
| SEC-6    | **Closed**                  | Fallback data references only the env-gated `/a11y-harness`; preview routes are gone.                                                                      |

### Architecture dispositions

| Prior ID | Status                 | Current evidence                                                                                                           |
| -------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| ARCH-1   | **Closed**             | Group-grade invalidation includes canonical Care, the bare alias, and the typed detail wildcard.                           |
| ARCH-2   | **Closed**             | Leader-pipeline and health writes now invalidate `/admin`; a central revalidation fitness map exists.                      |
| ARCH-3   | **Closed as scoped**   | Shepherd reads and validation were split along directory, follow-up, interaction, private-note, and core seams.            |
| ARCH-4   | **Closed**             | All five cited orphan component symbols/files were removed.                                                                |
| ARCH-5   | **Closed**             | Group and Shepherd Care detail server pages now delegate to typed view components.                                         |
| ARCH-6   | **Closed**             | Leader Pipeline has the canonical-home and ADR 0033 annotations at its page and actions boundaries.                        |
| ARCH-7   | **Closed**             | `CLAUDE.md` now distinguishes static fitness rules from semantic review work.                                              |
| ARCH-8   | **Closed**             | Concept-reconciliation items B and E are marked resolved with implementation references.                                   |
| ARCH-9   | **Closed by decision** | Root desloppify backlogs were removed; ADR 0034 explicitly permits lagging internal `cell-*` identifiers until next touch. |
| ARCH-10  | **Closed**             | Leader and Over-Shepherd reads use `bindReads` and domain-specific read modules.                                           |
| ARCH-11  | **Closed**             | The recompute seam is now `GroupHealthRecomputeReads`, eliminating the type-name collision.                                |

### Test and CI dispositions

| Prior ID | Status                      | Current evidence                                                                                                                                                                                                    |
| -------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TEST-1   | **Closed**                  | Live RLS steps run inside the required CI job behind a step-level path gate.                                                                                                                                        |
| TEST-2   | **Closed, with successors** | Six real-stack specs now cover Care writes, Prospect advance, Multiplication readiness, group create/staff/archive, and invite redemption. Current TEST-1/2 concern gating and assertion truthfulness, not absence. |
| TEST-3   | **Closed**                  | The RLS gate includes permanent-deletion and own-name inputs and documents the orchestration-only exclusion.                                                                                                        |
| TEST-4   | **Closed**                  | The a11y harness and specs now cover contextual actions plus Multiply Pipeline/Shepherds.                                                                                                                           |
| TEST-5   | **Closed**                  | Revalidation, classification, RPC-copy, and read-allowlist checks are static gating tests.                                                                                                                          |
| TEST-6   | **Closed**                  | Launch runbook contexts match live branch protection and describe the in-job RLS harness.                                                                                                                           |

### Documentation dispositions

| Prior ID | Status     | Current evidence                                                                                              |
| -------- | ---------- | ------------------------------------------------------------------------------------------------------------- |
| DOC-1    | **Closed** | `CONTEXT.md` now teaches the group-type model rather than the retired cell matrix.                            |
| DOC-2    | **Closed** | `CONTEXT.md` reflects the live Leader surface and oversight ladder.                                           |
| DOC-3    | **Closed** | README product language and rendered vocabulary use group types and Shepherd labels.                          |
| DOC-4    | **Closed** | `PRODUCT_DEFINITION.md` was reconciled to group types and current role terms.                                 |
| DOC-5    | **Closed** | The live Multiply lede no longer says “cells.”                                                                |
| DOC-6    | **Closed** | Adjacent danger-zone cards consistently use “Shepherds.”                                                      |
| DOC-7    | **Closed** | Fresh Slate / Admin Cockpit status and index copy reflect shipped tooling.                                    |
| DOC-8    | **Closed** | Consolidation plan and index show the executed/remaining state.                                               |
| DOC-9    | **Closed** | README, Guests page, and ADR 0033 now distinguish the legacy Guests table from the canonical Prospect funnel. |
| DOC-10   | **Closed** | Architecture prose and diagram sources say Next.js 16.                                                        |
| DOC-11   | **Closed** | ADR 0034 records the cell-to-group-type collapse and repairs the supersession chain.                          |
| DOC-12   | **Closed** | Plan/index coverage and dead “supersedes below” pointers were reconciled.                                     |
| DOC-13   | **Closed** | ADR status headers and index status chain are complete and normalized.                                        |
| DOC-14   | **Closed** | Frozen-surface comments no longer point to removed product documents.                                         |
| DOC-15   | **Closed** | The stale “Lead” test fixture now uses “Shepherd.”                                                            |
| DOC-16   | **Closed** | Route orientation includes Leader Pipeline and current Multiply tab names.                                    |

## 4. Current findings index

| ID     | Sev | Finding                                                                                          | Effort | Fix risk    | Confidence                       |
| ------ | --- | ------------------------------------------------------------------------------------------------ | ------ | ----------- | -------------------------------- |
| SEC-1  | P1  | Account deletion retains recoverable profile PII after promising permanent removal               | L      | High        | High                             |
| SEC-2  | P1  | Rate-limit paths send/store raw client IPs and the SQL ledger lacks a global retention bound     | M      | Medium      | High                             |
| TEST-1 | P1  | The stable real-stack E2E lane is still not a merge signal                                       | M      | Medium      | High                             |
| DOC-1  | P1  | Canonical Permanent deletion says Auth identities are untouched, contradicting the shipped purge | S      | Low         | High                             |
| SEC-3  | P2  | Public telemetry accepts caller-controlled log values; Vitals buffers an uncapped body           | S–M    | Low         | High                             |
| SEC-4  | P2  | Care-note differential coverage omits nullable-author states introduced by profile purge         | S–M    | Low         | High                             |
| SEC-5  | P2  | Human classification taxonomy omits sensitive `cleanup_snapshot` payloads                        | S      | Low         | High                             |
| ARCH-1 | P2  | Shared Care writes do not revalidate every route that hosts them                                 | S      | Low         | High                             |
| ARCH-2 | P2  | Care surfaces use UTC “today” despite church-local business-date canon                           | S–M    | Low–Medium  | High                             |
| ARCH-3 | P2  | Privileged read failures render as healthy empty states                                          | M      | Low–Medium  | High                             |
| ARCH-4 | P2  | Cache-invalidation failure converts a committed write into a failure response                    | M      | Medium      | High behavior / Medium frequency |
| ARCH-5 | P2  | Permanent-deletion target caps and count-only blockers make records unreachable                  | L      | Medium      | High                             |
| ARCH-6 | P2  | Group Health performs two attendance queries per active group                                    | L      | Medium–High | High                             |
| ARCH-7 | P2  | Super Admin eagerly loads every workspace and at least about 61 Supabase requests                | L      | Medium–High | High                             |
| TEST-2 | P2  | E2E “without reload” assertions can pass only after reload                                       | L      | High        | High                             |
| TEST-3 | P2  | Live RLS assertions cover 8 sensitive tables and defer 26                                        | L      | Medium      | High                             |
| TEST-4 | P2  | The RLS path gate omits its runner, dependency, and Supabase config inputs                       | S      | Low         | High                             |
| DOC-2  | P2  | Privacy/data inventory still teaches the retired cell model and dropped tables                   | S      | Low         | High                             |
| TEST-5 | P3  | Verification workflows use the moving Supabase CLI `latest` tag                                  | S      | Low         | High                             |
| DOC-3  | P3  | Agent docs say 21 fitness checks; 24 top-level invariants exist                                  | S      | Low         | High                             |

## 5. Security and RLS

### SEC-1 — Account deletion retains recoverable profile PII after promising permanent removal (P1)

**Observed evidence.** `app/account-deletion/page.tsx:34-35,71-83` says the
sign-in account and profile name/email/phone are permanently removed. The
deletion RPC instead snapshots the complete profile with `to_jsonb` into
`tombstones.row_snapshot` before deletion
(`20260604010000_phase_sad1_permanent_deletion_foundation.sql:43-63,234-261`).
The tombstone is outside the deletable registry, supports full re-insertion, and
is retained even after restore
(`20260604040000_phase_sad4_permanent_deletion_recovery.sql:66-80,147-148`).
Audit history also intentionally retains actor name and email
(`20260604030000_phase_sad3_permanent_deletion_profiles.sql:37-46,63-95`). No
expiry or irreversible erasure path exists, although
`DATA_CLASSIFICATION.md:26` calls for an expiry/archive policy.

**Impact.** The public deletion promise is materially false. Data remains
recoverable indefinitely by Super Admin, enlarging privacy and breach impact
even though no cross-tier exposure exists today.

**Recommendation.** Separate operator recovery from data-subject erasure. Use a
PII-redacted tombstone or a short-lived encrypted snapshot whose key is destroyed
at expiry for account-deletion requests; define audit-identity retention; purge or
pseudonymize where policy permits; add expiry enforcement and irreversible-path
tests; then make public wording disclose exactly what remains.

### SEC-2 — Raw client IPs reach both rate-limit stores without global SQL retention (P1)

**Observed evidence.** `supabase/functions/redeem-invite/index.ts:214-242`
passes `peerIp` directly as `p_key`. The SQL ledger stores it verbatim and only
deletes old rows when that same key returns
(`20260604130000_phase_il2_invite_redeem_throttle.sql:21-28,70-95`), so one-off
IPs can persist indefinitely. `lib/security/rate-limit.ts:120-134,168-184`
also passes raw IPs to `@upstash/ratelimit`. This contradicts
`DATA_CLASSIFICATION.md:25`, `docs/store/data-inventory.md:60-64`, and the
public promise at `app/privacy/page.tsx:163-169` that a hashed key is used.

**Impact.** Raw IPs are unnecessarily retained internally and sent to an
external processor contrary to published contracts. Rotating sources can also
grow the database ledger without a global TTL.

**Recommendation.** HMAC IPs with a server-only rotation-managed secret before
both sinks, purge legacy literal-IP rows, add indexed global retention, and test
that raw IPs can never reach Redis identifiers or `throttle_key`. Update the
processor inventory to cover both password reset and invite redemption.

### SEC-3 — Public telemetry trusts caller-controlled log content (P2)

**Observed evidence.** `proxy.ts:18-23` exempts `/api/vitals` and
`/api/client-error` from session middleware. Both accept requests with no
`Sec-Fetch-Site`. The client-error path caps body size but logs caller-supplied
name, message, digest, and normalized path (`client-errors.ts:43-71`); truncation
is not redaction. The Vitals route calls `request.text()` without a declared- or
parser-size cap (`app/api/vitals/route.ts:17-33`), accepts any non-empty metric
name, and does not bound preserved route segments (`web-vitals.ts:43-50,63-106`).

**Impact.** Legitimate runtime errors can leak personal/secret-bearing message
text to logs, while unauthenticated callers can poison or amplify telemetry and
application memory/log volume.

**Recommendation.** Preflight and parser-cap both endpoints, allowlist metric
names, bound every string and recognized route pattern, omit raw client error
messages in favor of digest/class/safe codes, and add rate limiting plus hostile
route-handler tests.

### SEC-4 — Nullable Care-note authors are outside the differential guard (P2)

**Observed evidence.** Profile purge makes Care Note and Prayer Request
`author_profile_id` nullable
(`20260715000000_purge_profile_dependent_strategies.sql:102-133`). Production
spec types and the advertised 270-row matrix still require a non-null author
(`care-note-visibility.ts:70-102`; `care-note-visibility-matrix.ts:31-45,74-93`).
The live purge test proves retention/anonymization but not effective RLS reads for
purged-author profile-subject and group-subject rows.

**Impact.** SQL and TypeScript can regress on retained pastoral content while the
“complete” differential test remains green. The current policy is fail-closed;
this is a missing guardrail, not a current leak.

**Recommendation.** Make author and applicable-grant IDs nullable in the
executable spec. Add both purged-author shapes: subject grant controls a
profile-subject row, while an authorless group-subject row remains sealed for all
viewers. Exercise the same states against live RLS.

### SEC-5 — The human classification spec omits `cleanup_snapshot` (P2)

**Observed evidence.** The typed manifest correctly classifies
`tombstones.cleanup_snapshot` and notes it may contain full administrative Care
summary rows (`lib/security/data-classification.ts:362-374`). The reviewer-facing
taxonomy lists only `row_snapshot` and `set_null_dependents`
(`DATA_CLASSIFICATION.md:16-27`).

**Impact.** Retention and review work can underestimate the sensitive operational
rows now carried in tombstones. RLS and the executable manifest are currently
correct.

**Recommendation.** Add `cleanup_snapshot`, enumerate its full-row content, and
pin the prose examples to the manifest with a small semantic sync check.

### Security strengths confirmed

- Effective Care Note/Prayer Request policies remain author-or-admin-with-grant;
  SC.4 private notes remain creator-scoped with no Super-Admin bypass.
- The 56-table visibility matrix, Super-Admin-only role gates, NO_READ tables,
  RPC search paths, no-broad-RLS, no-direct-write, no-hard-delete, and
  audit-pairing invariants are gating checks.
- Profile purge locks before evaluation, writes tombstone and audit in one
  transaction, and re-verifies the active Super Admin before the service-role
  Auth deletion.
- Retired `staff_viewer` effective policy access is removed.

## 6. Architecture and correctness

### ARCH-1 — Revalidate every route hosting shared Care writes (P2)

`care-notes-actions.ts:39-43,65,95,125` invalidates `/admin/care` and a typed
admin detail path, but the same forms are mounted at
`/over-shepherd/[profileId]` without an `onSaved` refresh and at the bare
`/admin/shepherd-care` alias. Leader-grade invalidation also omits the bare
alias. The fitness map pins these incomplete sets, so it proves code-to-map
agreement rather than host coverage. Add the Over-Shepherd and alias paths,
update the map, and test every mounted host.

### ARCH-2 — Use church-local “today” on Care surfaces (P2)

`lib/shared/church-time.ts:1-24,38-47` establishes `America/Chicago`, but Care
production callers use `currentUtcDateIso()` across Admin Care, People, group
management, person detail, Shepherd detail, and directory reads. Date-only due
and contact comparisons therefore move to tomorrow around 6–7 p.m. Central,
marking work overdue or stale a day early. Replace these defaults with
`churchTodayIso(now)`, inject the date into builders, and add an evening-boundary
test.

### ARCH-3 — Privileged read failures look like valid empty states (P2)

The 22-entity permanent-deletion registry commonly destructures only `data` and
maps nullish results to `[]` (`lib/admin/permanent-deletion.ts:36-55`). Normal
PostgREST errors are ignored in deletion/tombstone readers, and coverage errors
also become empty arrays. The UI turns that into “No backups yet. Nothing has
been permanently deleted” (`permanent-delete-card.tsx:318-333`). Return explicit
loaded/empty/failed states, render “Unavailable,” and disable dependent recovery
or destructive controls on failed reads.

### ARCH-4 — Preserve committed success if revalidation fails (P2)

`lib/shared/run-action.ts:348-390` commits the RPC before calling
`revalidatePath`; a revalidation exception falls into the outer failure handler
at `:220-240`. A test at `lib/admin/__tests__/run-action.test.ts:367-387` pins
this behavior. Non-idempotent inserts then tell the user to retry even though the
row exists, inviting duplicates. Create a post-commit boundary: log degraded
cache invalidation separately and return committed success, with tests for normal
and `treatAsOk` paths.

### ARCH-5 — Make every deletion target and blocker reachable (P2)

The deletion registry says every blocker must be independently targetable, but
21 loaders cap at 200 rows and the snapshot loader at 50
(`lib/admin/permanent-deletion.ts:246-255,765-789`). The UI offers only those
preloaded records, no search/pagination/direct ID, while preflight reports blocker
counts without record IDs (`permanent-delete-card.tsx:153-193,273-289`). Add
stable server-side search/pagination and direct blocker links while preserving
Super-Admin authorization, preflight, and confirmation safeguards.

### ARCH-6 — Batch Group Health attendance reads (P2)

`buildGroupAttendanceWeeks` performs two reads for one group
(`group-health-read.ts:277-323`) and the overview maps it across every active
group (`:409-423`). Sixty groups therefore create roughly 120 concurrent
attendance requests before fixed reads. Replace this with one or a few bounded
bulk reads/RPCs while preserving windowing, trend calculation, per-group stale
fallback, and partial-failure semantics. Pin request count independently of
group count.

### ARCH-7 — Load only the active Super Admin workspace (P2)

The console starts 18 top-level reads, expanding to 10 Clean Slate counts, 11
History Reset reads, 4 Attention Reset reads, and 22 deletion-target queries
before the client selects one of seven workspaces. Opening the default tab thus
causes at least about 61 Supabase requests, plus a sequential Edge status call,
and can prepare up to 4,250 hidden Danger options. Make workspace selection
server-visible, load a small shared summary plus only the active workspace, and
load deletion targets after choosing an entity type.

### Architecture strengths confirmed

- ADR 0011 boundaries remain intentional: reusable rules/adapters are shared,
  while per-surface assembly stays local.
- Admin, Leader, and Over-Shepherd reads now use the same typed, instrumented
  seam.
- The shared action runner, typed RPC registry, explicit read allowlists, and
  revalidation map are strong foundations; findings are semantic edge cases, not
  arguments to remove them.
- Recent large-module work deepened Shepherd Care by subdomain and turned detail
  pages into guard/load/typed-view composition.

## 7. Tests, CI, and developer tooling

### TEST-1 — Promote real-stack E2E into a merge signal (P1)

`.github/workflows/e2e.yml:9-17` says the lane should be promoted after about
four consecutive green runs; current history satisfies that threshold, but the
lane remains advisory and branch protection requires only the deterministic and
a11y contexts. PR paths at `:29-45` omit runtime `app/**`, `components/**`,
`lib/**`, and even `supabase/functions/**`. The invite spec is the only
real-boundary proof of the redeem-invite Edge Function, yet changing that
function does not trigger the lane.

Use an always-reporting context on every PR with expensive steps gated inside
the job, or fold a targeted real-stack step into an existing required context.
Include at least the runtime surfaces and Edge Functions covered by the six
flows, then change branch protection in the same rollout. Do not make a
workflow-level path-filtered job directly required.

### TEST-2 — Make no-reload E2E assertions truthful (P2)

Care Note and Prospect specs catch a 15-second live-update miss, reload, and then
make the passing assertion (`care-note-write.spec.ts:176-204`;
`prospect-funnel-advance.spec.ts:103-130`). Multiplication readiness only logs
whether live repaint happened and asserts after reload. The suite proves
persistence/fresh-read visibility, not the no-reload behavior its names promise.
Resolve the documented action-response stall, split live-refresh and persistence
contracts, and require the former to pass before any reload while retaining
traces and POST telemetry.

### TEST-3 — Ratchet live RLS coverage past eight tables (P2)

The integration manifest has **8 live-asserted and 26 deferred sensitive
tables** (`rls-coverage-manifest.ts:70-195`), while the fitness check requires
only `asserted.length >= 8`. Static SQL scanning is valuable but cannot prove
effective migration-order, grant, and per-tier behavior. Add positive/negative
live cases in risk order—deletion, invitation, snapshot, then leader-scoped
operational tables—and replace the fixed floor with a ratcheted maximum-deferred
count.

### TEST-4 — Put all RLS harness inputs in its CI path gate (P2)

`.github/workflows/ci.yml:59-80` includes integration tests and workflows but
omits `vitest.integration.config.ts`, `vitest.shared.ts`, `package.json`,
`package-lock.json`, and `supabase/config.toml`. Those files control selection,
the invoked command/dependencies, and local Edge Function behavior, yet changes
can skip the live required steps. Add them and pin the path manifest with a
fitness test.

### TEST-5 — Pin the Supabase CLI version (P3)

CI, RLS integration, E2E, and seeded-auth smoke all use
`supabase/setup-cli@v1` with `version: latest`. A release can change results
without a repository diff. Pin one verified version across all four workflows
and upgrade it deliberately.

### Test and tooling strengths confirmed

- The deterministic gate covers 394 files and 24 top-level fitness invariants.
- Live integration fails loudly once opted in with unsafe/missing credentials;
  it does not silently target a hosted database.
- Real-boundary coverage now includes Care transaction/audit atomicity, full
  profile/Auth purge and rollback behavior, invite redemption/single use/audit,
  and tiered Care visibility.
- E2E is serial, has zero retries, keeps traces, emits action-response telemetry,
  and prevents the test service-role key from entering Next runtime.
- Accessibility remains a required context with 26 spec files; pre-commit stays
  fast while CI owns full lint, types, build, and tests.

## 8. Documentation and domain language

### DOC-1 — Canonical Permanent deletion contradicts the Auth purge (P1)

`CONTEXT.md:98-105` says Permanent deletion “never reaches ... `auth.users`
identities (only `public.profiles`).” The shipped `purge-profile-auth` Edge
Function explicitly removes the linked Auth identity after the transactional
profile purge (`supabase/functions/purge-profile-auth/index.ts:1-7,313-400`),
with an idempotent service-role audit envelope
(`20260716000000_record_profile_auth_purge.sql:104-107`). Because `CONTEXT.md`
is the single-context glossary and the statement affects deletion safety, this
is P1 canon drift. Update the definition to distinguish the database RPC from
the complete two-system workflow and preserve the Super-Admin/private-content
limits.

### DOC-2 — Store/privacy inventory still teaches the retired cell model (P2)

`docs/store/data-inventory.md:29,32` describes Audience × Category “cells,” a
“desired cell,” and the dropped `group_categories` / `category_type_targets`
tables. The public privacy page similarly says groups carry audience/category
(`app/privacy/page.tsx:81-83`). Migration
`20260708000000_collapse_cells_to_group_type_list.sql:72-149` dropped the matrix
and moved Groups/Prospects to free-text group types. Update both descriptions and
add a small canon check because this inventory feeds app-store privacy forms.

### DOC-3 — Fitness-suite counts are stale (P3)

`AGENTS.md:35` and `CLAUDE.md:134-135` say the suite has 21 checks; there are 24
top-level `tests/fitness/*.test.ts` invariants plus six support test files. Either
update the number or remove the hard-coded count in favor of an enumerated or
generated inventory.

### Documentation strengths confirmed

- All 16 July 3 documentation findings are resolved as scoped.
- ADR 0034 records the group-type collapse and repairs the decision chain;
  retired rendered vocabulary is regression-tested.
- The ADR index/status chain, plans index, shipped-state labels, frozen-surface
  annotations, route list, and Next.js 16 architecture references are current.
- `RLS_VISIBILITY.md` is pinned to the executable 56-table visibility matrix.

## 9. Recommended order of attack

1. **Privacy and deletion contract:** SEC-1, SEC-2, DOC-1, SEC-5, and DOC-2.
   Decide retention/erasure policy first; implementation, migration, disclosure,
   and tests must land together.
2. **User-visible correctness:** ARCH-1 through ARCH-5 and SEC-3. These are
   bounded fixes that remove stale pages, wrong business dates, false empty
   states, duplicate-retry risk, unreachable destructive targets, and unsafe
   telemetry semantics.
3. **Merge confidence:** TEST-1, TEST-2, TEST-4, then TEST-3 and SEC-4. Promote
   real flows carefully, make the assertions honest, and expand live policy
   depth without weakening the fast gate.
4. **Measured request reduction:** ARCH-6 and ARCH-7. Add request-count tests and
   production timing before/after; preserve partial-failure behavior.
5. **Low-risk reproducibility/drift:** TEST-5 and DOC-3.

## 10. Overall assessment

This repository has a notably mature enforcement layer: narrow audited RPC
writes, role-specific RLS, explicit privacy allowlists, a typed read/write seam,
24 gating fitness invariants, required accessibility, and growing live-stack
coverage. The prior-audit closure rate—39 of 39 resolved as scoped in eight
days—is strong evidence that the feedback loop works.

The current risks are concentrated at system boundaries rather than basic code
hygiene: database deletion versus Auth deletion, recovery versus erasure,
documented hashing versus actual identifiers, committed writes versus cache
invalidation, static path maps versus actual mounted hosts, and deterministic CI
versus real-stack merge confidence. Closing those seams should take priority over
another broad refactor.
