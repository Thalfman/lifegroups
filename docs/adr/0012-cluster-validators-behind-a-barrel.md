# ADR 0012: Cluster admin validators behind a barrel

**Status:** Accepted
**Date:** 2026-06-02
**Supersedes:** [ADR 0005](./0005-centralized-write-validation.md)

## Context

[ADR 0005](./0005-centralized-write-validation.md) declined splitting the
centralized admin validation module and co-locating each write's validator with
its action file. It kept validators centralized in `lib/admin/validation.ts`,
called by the shared runner per [ADR 0001](./0001-admin-write-action-runner.md).
It set an explicit trigger to revisit:

> The validation file's discovery cost becomes acute in practice (e.g. it grows
> well past its current size, or validators stop clustering cleanly by domain).

That trigger has fired. The module recorded in ADR 0005 at **2,635 lines** has
grown to **~3,297 lines (+25%)** as guests, follow-ups, shepherd-care,
launch-planning, leader-pipeline, and the encrypted private-note key lifecycle
landed. The file is now long enough that discovery — finding the right validator
by scrolling — is the friction ADR 0005 named, even though the validators still
cluster cleanly by domain.

## Decision

Split `lib/admin/validation.ts` into domain-clustered files re-exported through a
barrel at `lib/admin/validation/index.ts`. The clusters mirror the admin action
domains:

- `groups.ts`, `people.ts`, `guests.ts`, `follow-ups.ts`, `settings.ts`,
  `super-admin.ts`, `shepherd-care.ts`, `launch-planning.ts`,
  `group-health.ts`, `leader-pipeline.ts`
- `shared.ts` holds the cross-cutting primitives (`ValidationResult`,
  `isRecord`, `normalizeUuid`, the string/date/number readers) the clusters
  import.

This is a **pure relocation**: every validator keeps its name and behavior, and
the public import surface is unchanged — callers still
`import { ... } from "@/lib/admin/validation"`, which now resolves to the
barrel. No caller import path changes.

## Why

- **The reuse argument from ADR 0005 still holds — and is honored.** Validators
  stay **centralized and shared**, not duplicated. `validateGroupIdPayload`
  still backs both calendar and groups; the barrel keeps every validator
  reachable from one import path. The change is to the _file envelope_, not to
  where validators live conceptually.
- **It cuts the discovery cost ADR 0005 flagged as the only real friction.** A
  ~3,297-line file is split into domain files in the low hundreds of lines each,
  so the validator for a given action sits next to its siblings and is found by
  opening the cluster, not scrolling the monolith.
- **The barrel preserves [ADR 0001](./0001-admin-write-action-runner.md).**
  Actions still supply pure data to `runAdminWriteAction`; the validators remain
  pure functions in a pure-functions module. Only the module's internal layout
  changes.

## What stays rejected

**Clustering behind a barrel is not co-location.** ADR 0005 rejected moving each
write's validator into its `"use server"` action file, and that rejection
stands. The distinction:

- **Co-location (still rejected):** a validator lives beside its action in
  `app/(protected)/admin/**/actions.ts`. Shared validators would force either
  duplication or cross-`actions.ts` imports, and validators would leak into the
  `"use server"` boundary — both cut against ADR 0001 and ADR 0005's reuse
  argument.
- **Clustering behind a barrel (this ADR):** validators stay in the centralized,
  shared `lib/admin/validation/` module, grouped by domain, exposed through one
  barrel. They remain pure, reusable, and tested as a set.

The trigger in ADR 0005 named two reasons to reopen co-location: file size
_or_ validators becoming mostly single-use. Only the first fired, and it argues
for re-foldering — not for co-location. Most validators are still shared across
the runner and the test suite, so the reuse argument that kept co-location out
is intact.

## Scope

Admin validation only. Leader validation (`lib/leader/validation.ts`, ~213
lines) is well under the trigger and is untouched.

## Consequences

- `lib/admin/validation.ts` becomes the directory `lib/admin/validation/`; the
  import specifier `@/lib/admin/validation` is unchanged.
- New admin validators are added to the matching domain cluster (or a new
  cluster file) and surface automatically through the barrel.
- typecheck, lint, and the validation test suite pass against the unchanged
  public surface.
