# ADR 0001: Admin write-action runner

**Status:** Accepted (all admin action files migrated; leader runner + RPC
gateway pending)
**Date:** 2026-05-28

## Context

Every `admin_*` server action in `app/(protected)/admin/**/actions.ts` repeats
the same skeleton:

```
startActionLog -> requireAdminSession -> readFromForm -> validate
  -> (optional guard) -> createSupabaseServerClient -> rpc
  -> map error token -> handle no-data -> revalidatePath -> log outcome
```

That is roughly 50-60 lines per action, of which ~5 lines are the action's
actual identity (validator, RPC call, revalidate target) and the rest is
ceremony. The `readFromForm` helper was copied byte-for-byte across nine action
files, and the five error branches (`auth_denied`, `validation_failed`,
`supabase_not_configured`, `rpc_error`, `rpc_no_data`) were re-spelled in each
action. None of the action layer had any test coverage, because the logic was
welded to module-level `requireAdminSession` / `createSupabaseServerClient`
calls with no seam to test against.

## Decision

Introduce `runAdminWriteAction(spec, prev, input)` in `lib/admin/run-action.ts`.
It owns the entire skeleton and its five error branches. An action declares an
`AdminWriteActionSpec` — `name`, form `keys`, `validate`, optional `guard`,
`rpc`, `revalidate`, `noDataError`, and two pure log-field extractors — and
exposes a thin `export async function` that delegates to the runner.

The per-stage observability variation collapses into two tiers instead of N:

- `fields(actor, value)` — emitted on every post-validation stage
  (`supabase_not_configured`, `rpc_error`, `rpc_no_data`, `ok`); may be `async`
  so derived values such as a hashed email are computed exactly once.
- `okFields(value, id)` — merged only into the success line (e.g. the new row
  id, or an echoed input that is only interesting on success).

Action files keep `export async function name(prev, input)` (not
`export const name = factory(...)`) so the `"use server"` export contract is
unambiguous and the public callback signature consumed by `useActionState`
is unchanged.

## Why this overrides the note in `lib/observability/instrument.ts`

`instrument.ts` argues for keeping `ctx.finish` calls imperative rather than
wrapping actions in a higher-order function, "because the existing actions
return discriminated `ActionResult<T>` shapes with many early exits — keeping
control flow in the action avoids forcing every callsite into a closure."

That reasoning targets a wrapper that hands the *imperative body with its early
exits* to a closure. The runner does the opposite: it **owns** the control flow
and every early exit, and the action author supplies only pure data — a
validator and two field-extractors — never a closure threading mutable logging
state. There are no early exits left in the caller to obscure, so the
legibility concern does not apply. The imperative `startActionLog`/`finish`
primitive is unchanged; only its callers are.

## Spec extensions for the remaining files

Migrating the other eight files surfaced four shapes the `people` file did not
exercise. Each became a backward-compatible spec field (the `people` specs are
unchanged):

- `auth?: AuthGate` — defaults to `requireAdminSession`; `super-admin` passes
  `requireSuperAdminSession`. Both gates return the same `{ ok, session }`
  shape, so this is a seam, not a forked runner.
- `read?: (input) => Record<string, unknown>` — for actions whose FormData
  mapping is not a flat key-lift: `settings` and `launch-planning` (checkbox
  presence, empty-string-to-null, empty-diff skipping) and the calendar files
  (lift all entries). Defaults to lifting `keys`.
- `raw` threaded into `revalidate`/`okFields`/`fields` — the calendar id-keyed
  actions revalidate and log a `group_id` that lives outside the validated
  payload (it carries through `raw` only).
- `guard` outcome override + chaining — a guard may return `outcome: "fail"`
  for non-authorization bails (`empty_diff` in `settings`/`launch-planning`)
  rather than the default `denied`, and `super-admin` chains three distinct
  guards behind one slot, returning the first denial with its own `error_code`.

The runner's `input` param is typed `unknown` rather than `ActionInput<V>`: it
re-parses input through `read`/`keys` before `V` exists, so `ActionInput<V>`
only fought generic inference at callsites whose public param is wider than the
spec's `V`. `V` flows from the spec.

## Consequences

- The action layer gets its first regression net: `lib/admin/__tests__/run-action.test.ts`
  exercises all branches against mocked `requireAdminSession` /
  `createSupabaseServerClient` / `revalidatePath` / logger.
- Two deliberate, non-user-facing log-field changes, both in the spirit of
  **consistency** across stages; RPC calls, return values, and revalidation are
  byte-for-byte identical:
  1. The runner emits the same `fields` on every post-validation stage
     (`supabase_not_configured`, `rpc_error`, `rpc_no_data`, `ok`). Previously
     some actions omitted target fields on `supabase_not_configured`, and
     `change_leader_role` / `super_admin.update_profile_role` omitted
     `new_role` on `rpc_no_data`. These omissions were incidental.
  2. The `validation_failed` line now carries `error_count` for every action
     (previously only `super_admin.update_profile_role` did). A uniform
     diagnostic field, harmless to the others.

## Invariants preserved (see AGENTS.md)

All writes still flow through the narrow `admin_*` SECURITY DEFINER RPC
wrappers in `lib/admin/rpc.ts`; the runner only relocates the calling ceremony,
it does not touch the RPC boundary or the paired-audit-row discipline. No
service-role key enters the runtime. The self-target guard still runs before
the RPC as defense in depth.

## Follow-ups

- ~~Migrate the remaining admin action files~~ — done. All nine admin action
  files (`people`, `groups`, `calendar`, `guests`, `follow-ups`,
  `shepherd-care`, `settings`, `launch-planning`, `super-admin`) delegate to
  `runAdminWriteAction`.
- ~~A sibling `runLeaderWriteAction` for `lib/leader`~~ — done
  (`lib/leader/run-action.ts`). Parallel, not shared: auth is
  `requireLeaderActor` (`{ profileId, assignedGroupIds }`, logged as
  `actor_profile_id`), the error table is the pastoral leader one, and it has
  **two** guard tiers — a pre-validation `guardRaw` (calendar update/archive/
  restore check ownership from a hidden `group_id` before the event_id is even
  validated) and a post-validation `guard` (check-in and calendar create trust
  the validated `group_id`). The two tiers exist because the timing changes
  which fields appear on the `validation_failed` line. As with the admin
  runner, this added one consistency change: post-validation `fields` now
  appear on the `supabase_not_configured` stage too (e.g. `target_event_id` on
  the calendar id-keyed actions). The six group-scoped leader writes delegate;
  `leaderSubmitCheckinAndReturn` stays hand-written (it redirects after
  delegating) and `leader/follow-up-actions.ts` stays hand-written (its local
  auth gate splits `backend_error` into a `fail`+`stage` line rather than a
  `denied` one, a deliberately richer failure taxonomy the shared gate drops).
- ~~Latent bug: `lib/leader/rpc.ts` skipped `readUuidRpcData`~~ — fixed. All
  six leader RPC wrappers now uuid-validate their result. `readUuidRpcData`
  moved to `@/lib/shared/uuid` (its natural home beside `UUID_RE`);
  `lib/admin/rpc-helpers.ts` re-exports it so the admin wrappers' import path is
  unchanged.
- Candidate 2 (RPC gateway): collapse the ~47 pass-through wrappers in
  `lib/admin/rpc.ts` + `lib/leader/rpc.ts` into one generic
  `callUuidRpc<Args>(client, name, args)` — the runners are now the single RPC
  callers, so this falls out cleanly.
