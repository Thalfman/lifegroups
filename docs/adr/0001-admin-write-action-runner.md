# ADR 0001: Admin write-action runner

**Status:** Accepted (partial rollout — `admin/people` migrated; remaining admin
action files pending)
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

## Consequences

- The action layer gets its first regression net: `lib/admin/__tests__/run-action.test.ts`
  exercises all branches against mocked `requireAdminSession` /
  `createSupabaseServerClient` / `revalidatePath` / logger.
- One deliberate, non-user-facing behavior change: log fields are now
  **consistent** across post-validation stages. Previously some actions omitted
  target fields on the `supabase_not_configured` stage (it had no async
  pre-compute to force them) and `change_leader_role` omitted `new_role` on the
  `rpc_no_data` stage. These omissions were incidental, not intentional; the
  runner emits the same `fields` on every post-validation stage. RPC calls,
  return values, and revalidation are byte-for-byte identical.

## Invariants preserved (see AGENTS.md)

All writes still flow through the narrow `admin_*` SECURITY DEFINER RPC
wrappers in `lib/admin/rpc.ts`; the runner only relocates the calling ceremony,
it does not touch the RPC boundary or the paired-audit-row discipline. No
service-role key enters the runtime. The self-target guard still runs before
the RPC as defense in depth.

## Follow-ups

- Migrate the remaining admin action files
  (`groups`, `guests`, `follow-ups`, `shepherd-care`, `settings`,
  `launch-planning`, `super-admin`, both `calendar` files).
- A sibling `runLeaderWriteAction` for `lib/leader`: the auth strategy
  (`requireLeaderActor` returns `{ profileId, assignedGroupIds }`, not a
  session), the error-message table, and the group-membership guard differ, so
  it is a parallel runner sharing the same shape, not the same function.
- Candidate 2 (RPC gateway) then falls out as the runner's single RPC caller.
  Note the latent bug it surfaces: `lib/leader/rpc.ts` casts `r.data as string`
  and skips `readUuidRpcData`, so leader RPC results are not uuid-validated the
  way admin's are. Fix when migrating the leader runner.
