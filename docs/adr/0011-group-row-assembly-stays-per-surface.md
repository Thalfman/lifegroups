# ADR 0011: Group-row assembly stays per-surface; only shared rules get extracted

**Status:** Accepted
**Date:** 2026-06-01

## Context

An architecture review (2026-06-01) flagged that a group's derived row —
effective capacity + capacity status, effective health, check-in due — is
assembled in three places: `lib/dashboard/admin-group-model.ts` (the admin
overview), `lib/admin/capacity-board.ts` (the capacity board), and
`lib/admin/launch-planning.ts` (launch inputs). It proposed a single deep
`groupRow(inputs)` module that owns assembly and precedence, with each surface
projecting the fields it needs.

## Decision

**Do not introduce a unified group-row module.** Keep the three assemblers.
Extract only genuinely duplicated _rules_ — the first being the guest-pipeline
"active stage" predicate (`isActivePipelineStage` in `lib/dashboard/labels.ts`),
which had drifted into two copies (the live read and the fallback data) plus a
third in a test.

## Why

- **The math is already shared.** Effective capacity, capacity status, and
  effective health are pure functions in `lib/admin/metrics.ts`; all three
  assemblers call them. The leaf logic is not duplicated.
- **The three outputs genuinely differ.** The admin overview builds a
  `DerivedGroupRow` with attention items and setup gaps; the capacity board
  builds a capacity-sorted board; launch planning builds scenario inputs. A
  single row type would be a union of three shapes that each caller then
  narrows — a pass-through, not depth. The deletion test agrees: collapsing
  them concentrates no complexity, it just adds an indirection.
- **Precedence is not actually forked.** The review's worry was that a
  precedence change (e.g. "planned pause beats capacity") must be re-applied per
  assembler. In practice the precedence lives in the `metrics.ts` predicates the
  assemblers call, not in the assembly sites.

## What we did instead

Extracted the one rule that was really duplicated — `isActivePipelineStage` —
so the live headline count and the fallback count derive from one definition.

## Revisit if

A second concrete rule (beyond the pipeline predicate) turns out to be copied
across the assemblers, or the three row outputs converge to the same shape — at
which point a shared assembler stops being a pass-through and earns its keep.
