# ADR 0005: Validation stays centralized, not co-located with each write

**Status:** Accepted
**Date:** 2026-05-30

## Context

An architecture review (2026-05-30) flagged that understanding one admin
write means crossing three files: the validator in `lib/admin/validation.ts`
(2635 lines, 43 validators), the RPC alias in `lib/admin/rpc.ts`, and the
`AdminWriteActionSpec` in the relevant `app/(protected)/admin/**/actions.ts`.
It proposed co-locating each write's validator + RPC alias + spec beside its
action to improve locality. This ADR records that we considered and **declined**
that move, so future reviews don't re-suggest it.

## Decision

Keep validators centralized in `lib/admin/validation.ts` (and
`lib/leader/validation.ts`), called by the shared runner per ADR-0001. Do not
co-locate per-write validators with their action files.

## Why

- **Validators are pure, reusable, and tested as a set.** Several are shared
  across surfaces — e.g. `validateGroupIdPayload` backs both the calendar and
  groups actions. Co-location would force either duplication or a tangle of
  cross-`actions.ts` imports.
- **It cuts against the grain of ADR-0001.** The whole point of
  `runAdminWriteAction` is that an action supplies only *pure data* — a
  validator and field-extractors — to a runner that owns the control flow.
  The validator's natural home is the pure-functions module, not the
  `"use server"` action file.
- **The locality cost is mild and tooling-addressable.** The friction is
  discovery (scrolling a long file), not correctness or coupling. The single
  `ValidationResult<T>` shape and the per-domain clustering keep the file
  navigable; editor symbol-search closes the rest of the gap.

## Revisit if

The validation file's discovery cost becomes acute in practice (e.g. it grows
well past its current size, or validators stop clustering cleanly by domain),
**or** if a future change makes most validators single-use rather than shared —
at which point the reuse argument weakens and co-location is worth reopening.
