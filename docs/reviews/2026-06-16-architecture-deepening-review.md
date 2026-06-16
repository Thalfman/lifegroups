# Architecture deepening review — 2026-06-16

A search for **deepening opportunities** — refactors that turn shallow modules
into deeper ones, raising **leverage** for callers and **locality** for
maintainers. Run on top of the repo's hard invariants in
[`CLAUDE.md`](../../CLAUDE.md) and [`AGENTS.md`](../../AGENTS.md) and the
decisions in [`adr/`](../adr); those were treated as correct and not
re-litigated except where a candidate explicitly reopens one (flagged inline).

**Vocabulary.** Architecture terms — _module, interface, implementation, depth,
seam, adapter, leverage, locality_ — are used in the precise sense from the
deepening glossary. Domain terms follow [`CONTEXT.md`](../../CONTEXT.md).

**Method.** Four parallel passes over the write path, read path, domain
computation, and auth/nav seams, each claim then verified directly against the
source. Two candidates the passes proposed were **dropped on verification**: the
`care-needs-contact` waterfall already has a dedicated central test
(`lib/admin/__tests__/care-needs-contact.test.ts`) exercising every degrade
path, and the shallow `*-reads.ts` modules are earning their keep as the one
home for each column allowlist.

## Headline

The codebase is, on the whole, **deep**. There are single homes for `cellKey`
([`cell-coordinate.ts`](../../lib/admin/cell-coordinate.ts)), the rubric grade
resolver ([`rubric-grade-core.ts`](../../lib/admin/rubric-grade-core.ts)), the
Derived Capacity facets ([`cell-capacity.ts`](../../lib/admin/cell-capacity.ts)),
and the write-action skeleton ([`run-action.ts`](../../lib/shared/run-action.ts)).
The friction is at the edges, where that discipline thins out. Five candidates
survived verification, ranked.

| #   | Candidate                                                                                                                | Strength                  | Area       |
| --- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------- | ---------- |
| 1   | [Danger-zone writes behind the Write Action Runner](#1--pull-the-danger-zone-writes-back-behind-the-write-action-runner) | **Strong** ✅ Implemented | write path |
| 2   | [Give the Super-Admin Console a reads seam](#2--give-the-super-admin-console-a-reads-seam)                               | **Strong** ✅ Implemented | read path  |
| 3   | [Move authorization guards out of the validation barrel](#3--move-authorization-guards-out-of-the-validation-barrel)     | Worth exploring           | write path |
| 4   | [Name the cell-capacity precondition at the seam](#4--name-the-cell-capacity-precondition-at-the-seam)                   | Worth exploring           | read path  |
| 5   | [Collapse the manual payload → RPC-args mapping](#5--collapse-the-manual-payload--rpc-args-mapping)                      | Speculative               | write path |

---

## 1 · Pull the danger-zone writes back behind the Write Action Runner

**Status:** ✅ Implemented 2026-06-16 — the runner result seam now carries
JSON/text returns (`RpcResult<D>`), and the danger-zone writes (Clean Slate
wipe/revert, permanent delete/inline-delete/restore, the activity/history/
attention resets, reset-all, launch-prep, people-import) are runner specs that
log once through `startActionLog`. Holdouts (documented in code): clean-slate
import, preflight (a read), invite-link (already logs), invite-user/
test-accounts (Edge-Function-backed), account password reset (Supabase Auth).

**Strength:** Strong · **Dependency:** in-process

**Files**

- [`lib/shared/run-action.ts`](../../lib/shared/run-action.ts) · [`lib/admin/run-action.ts`](../../lib/admin/run-action.ts)
- `app/(protected)/admin/super-admin/{activity,history,attention,audit-?}-reset-actions.ts`
- `app/(protected)/admin/super-admin/{clean-slate,permanent-delete,people-import,reset-all,launch-prep,account,invite-user,test-accounts,invite-link}-actions.ts` (13 files in total hand-roll the pipeline)

**Problem.** Thirteen Super-Admin danger-zone writes hand-roll the
auth → client → RPC → map-error → revalidate pipeline and never call
`startActionLog`, so the riskiest mutations in the app — Clean Slate, Permanent
deletion, audit reset — are the ones missing a structured action log. Every
write that goes through `runWriteAction` logs in exactly one place; these
thirteen do not.

**Why they escaped the seam.** The runner's RPC result is typed
`RpcResult = { data: string | null }` and its success value defaults to
`{ id: data }` — it assumes the RPC returns a bare uuid. The danger-zone RPCs
return structured JSON or text instead (a reset's baseline date, an import
**count**, a permanent-deletion preflight report), so the actions drop out of
the runner and re-spell the whole control flow by hand.

```
Before — two write paths                After — one skeleton, JSON-aware

 runner actions (~32)   danger-zone(13)   specs (uuid · json · text)
      thin spec          auth→client→rpc        │
        │                →mapErr→revalidate      ▼
        ▼                ✗ no startActionLog   runWriteAction<Actor,V,T>
  runWriteAction                                widened result seam
  + structured log                              every write logged once
```

**Solution.** Widen the runner's result seam so a JSON- or text-returning RPC
threads its parsed value into the success type `T`, then re-express the thirteen
as specs. The skeleton already owns the five error branches and the exception
net; only the success-value shape needs to vary.

**Wins**

- locality: every write logs in one place
- leverage: one skeleton serves the json/text branch too
- danger-zone writes regain observability
- delete 13× hand-rolled control flow
- the interface absorbs the result-shape variation
- tests hit the runner, not thirteen copies

**ADR.** Aligns with [`ADR 0001`](../adr/0001-admin-write-action-runner.md) /
[`0005`](../adr/0005-centralized-write-validation.md) rather than contradicting
them — the runner already claims to own this control flow; these thirteen are
the exceptions that slipped the seam because their return shape didn't fit.

---

## 2 · Give the Super-Admin Console a reads seam

**Status:** ✅ Implemented 2026-06-16 — `console-data.ts` now hosts a
`SuperAdminConsoleReads` interface, the `supabaseSuperAdminConsoleReads`
production adapter (via `bindReads`), and a pure `buildSuperAdminConsoleData`
builder plus `buildSuperAdminChecklist`. The page is a thin loader call; the
checklist degrade rules are unit-tested against an in-memory adapter.

**Strength:** Strong · **Dependency:** local-substitutable

**Files**

- [`app/(protected)/admin/super-admin/page.tsx`](<../../app/(protected)/admin/super-admin/page.tsx>) — 453 lines, ~16 read-model fetchers imported and called inline
- [`components/admin/super-admin/console-data.ts`](../../components/admin/super-admin/console-data.ts) — types only; no loader, no adapter

**Problem.** The console page imports sixteen fetchers (`fetchAllGroups`,
`fetchProfilesForAdmin`, `fetchRecentAuditEvents`,
`fetchPermanentDeletionTargets`, …) and computes the system **checklist** inline,
so [`ADR 0015`](../adr/0015-reads-seam-for-surface-orchestration.md)'s "two
adapters, one seam" promise is unmet on the most consequential surface in the
app. The checklist's degrade rules (which row reads "error", "not configured",
"ok") are interleaved with the I/O in the page component, so they can only be
exercised against a live Supabase client.

```
Before                              After

 page.tsx                           page.tsx
   ├─ fetchAllGroups                  └─ loadSuperAdminConsoleData
   ├─ fetchAllMembers                      ┆ SuperAdminConsoleReads (seam)
   ├─ …14 more reads                       ├─ supabase adapter (prod)
   └─ buildChecklist (inline)              └─ in-memory adapter (test)
   ✗ no seam, no test path                       │
                                            buildSuperAdminConsoleData (pure)
```

**Solution.** Lift the reads behind a `SuperAdminConsoleReads` interface and the
checklist rules into a pure `buildSuperAdminConsoleData`, mirroring
[`multiply-grid-data.ts`](../../components/admin/multiply/multiply-grid-data.ts) —
the surface that already does this well (a typed reads interface, a production
adapter via `bindReads`, and a pure builder testable with plain fixtures).
`console-data.ts` already holds the types; it just needs the loader and adapter.

**Wins**

- the interface becomes the test surface
- checklist degrade rules become unit-testable
- locality: read rules leave the page component
- two adapters justify the seam (prod + in-memory)

---

## 3 · Move authorization guards out of the validation barrel

**Strength:** Worth exploring · **Dependency:** in-process

**Files**

- [`lib/admin/validation/people.ts`](../../lib/admin/validation/people.ts) — `guardAgainstSelfTarget`, `guardAgainstSelfRoleChange`, `guardAgainstSuperAdminAssignment` (lines 321–348)
- [`lib/admin/validation/index.ts`](../../lib/admin/validation/index.ts) · [`app/(protected)/admin/people/actions.ts`](<../../app/(protected)/admin/people/actions.ts>)

**Problem.** The validation barrel mixes two return contracts under one name.
Pure validators are `raw → ValidationResult<T>`; the `guardAgainst*` family is
`actor × value → string | null` — authorization checks, not validation. They
share a home and a barrel but answer different questions, and each action
re-spells the guard's error **code** at the call site:

```ts
guard: (actor, value) => {
  const error = guardAgainstSelfTarget(actor.id, value.profile_id);
  return error ? { error, code: "self_guard" } : null;
},
```

**Solution.** Split the `guardAgainst*` family into a guards module returning a
typed denial (`{ error, code } | null`) so the runner's `guard` slot consumes it
directly, and the validation barrel keeps a single return contract. The barrel's
name then matches what it ships.

**Wins**

- one return contract per module
- locality: authorization rules sit together
- error codes stop scattering to call sites
- the barrel name matches its contents

**ADR.** Touches [`ADR 0012`](../adr/0012-cluster-validators-behind-a-barrel.md)
(cluster validators behind a barrel). It does **not** contradict it — it keeps
the barrel pure by evicting the non-validators — but the ADR is the place to
record the guards' new home.

---

## 4 · Name the cell-capacity precondition at the seam

**Strength:** Worth exploring · **Dependency:** in-process

**Files**

- [`lib/admin/cell-capacity.ts`](../../lib/admin/cell-capacity.ts) — `computeCellCapacityIssue`
- [`lib/admin/cell-coverage.ts`](../../lib/admin/cell-coverage.ts) — `COVERAGE_LIFECYCLE_STATES`
- [`components/admin/multiply/multiply-grid-data.ts`](../../components/admin/multiply/multiply-grid-data.ts) — the caller that coordinates them

**Problem.** `computeCellCapacityIssue` silently assumes its caller has already
filtered to **active** groups, while `cell-coverage` counts **active +
launching_soon**. The same Group-lifecycle policy (per CONTEXT.md's _Derived
Capacity_ and _Target & Coverage_) is spelled two ways, and the capacity
precondition lives nowhere in its own interface — a caller must just _know_ to
pre-shape the input.

```
Before                                  After

 lifecycle rows ─▶ coverage             lifecycle rows
              ╲   (active+launching)         │
               ╲                             ▼
   unwritten ───▶ capacity            computeCellCapacityIssue(rows, policy)
   "active-only" rule  (assumes              owns the active filter
                        active sizes)        precondition in the interface
```

**Solution.** Let the capacity module take raw lifecycle rows and own the
active-group filter itself, sharing the lifecycle-policy constant with coverage.
The rule then has one home and the precondition can't be forgotten by a caller.

**Wins**

- the precondition moves into the interface
- lifecycle policy: one home, two readers
- locality: a filter bug fixes once
- the caller stops pre-shaping inputs

---

## 5 · Collapse the manual payload → RPC-args mapping

**Strength:** Speculative · **Dependency:** in-process

**Files**

- [`lib/admin/rpc.ts`](../../lib/admin/rpc.ts) — `AdminUuidRpcArgs` (53 channels, 812 lines)
- `app/(protected)/admin/**/actions.ts` — ~120 hand-written `*RpcArgs` mappers and `*_KEYS` arrays

**Problem.** Every write keeps **three** hand-synced spellings of its fields: the
validated payload type, a `*_KEYS` form-extraction array, and a `*RpcArgs`
mapper to the `p_*` arguments. A single field rename is a three-place edit, with
an untested, single-call-site mapper in the middle:

```ts
const createLeaderRpcArgs = (value: CreateLeaderPayload) => ({
  p_full_name: value.full_name,
  p_email: value.email,
  p_phone: value.phone ?? null,
});
```

**Solution.** Move the field↔`p_arg` correspondence into a declarative map on the
RPC channel so the mapping is **data**, derived once, instead of re-spelled per
action.

**Wins**

- leverage: one map, N actions
- field renames become single-site
- removes ~120 untested mappers
- locality: the shape lives by the channel

**⚠ ADR / decision tension.** This reopens the **explicit-spelling** decision in
[issue #636](https://github.com/Thalfman/lifegroups/issues/636), which keeps the
per-field mapper deliberately "eyeball-able" as the write-side trust boundary
(it pins the validator output and the RPC args at both ends so a desync fails
`typecheck`). Reopen only if the three-place drift actually bites in practice —
otherwise the redundancy is the point. **Speculative** for that reason.

---

## Top recommendation

Start with **#1 — the danger-zone writes behind the runner.** It is the only
candidate where the friction is also a gap in a stated invariant: every mutation
should log through the observability seam, yet the thirteen riskiest writes skip
`startActionLog` because they re-roll the pipeline by hand. Widening the runner's
result seam to carry json/text returns deletes that duplication, restores logging
**locality**, and brings the hardest-to-reach writes back under one **deep**
skeleton. **#2** is the natural follow-on: the same surface that hosts those
writes also lacks a reads seam.
