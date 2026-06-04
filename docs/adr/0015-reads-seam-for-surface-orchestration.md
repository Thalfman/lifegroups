# ADR 0015: Every surface's read-orchestration is a function of a reads seam

**Status:** Accepted
**Date:** 2026-06-04

## Context

An architecture review (2026-06-04) found the read side asymmetric. The admin
dashboard had already split its orchestration into a pure
`buildAdminDashboardData(reads)` plus a thin `supabaseAdminDashboardReads(client)`
adapter, with the seam machinery (`OmitClient`, `bindClientToReads`) private to
`lib/dashboard/queries.ts`. That surface is fully testable through an in-memory
adapter.

Every other surface — `groups`, `group-health`, `launch-planning`,
`follow-ups`, `shepherd-care`, and the rest — bound `createSupabaseServerClient()`
directly inside the page (or a thin loader) and assembled inline. The assembly
that decides what an admin sees — error precedence, care-concern sets,
grade maps, the per-section capacity gate — rode on the live client and could
only be exercised against a real database. One surface proved the seam; ~15
re-spelled the gather-and-degrade rule by hand.

## Decision

Generalise the one good pattern. Three pieces:

1. **`lib/supabase/reads-seam.ts`** holds the shared scaffold — `OmitClient`
   (strip the leading `client` argument from a read-model fetcher) and
   `bindReads(client, fetchers)` (curry the live client across a map of
   fetchers). The dashboard's private copy is deleted; it imports these.

2. **`lib/supabase/read-batch.ts`** holds `readBatch(reads)` — run N
   `ReadResult` thunks concurrently and fold them into `{ results, errors,
firstError, ok }`. Each surface keeps its own empty shape and error
   precedence as _data_ (which keys it reads, in what order), not as
   re-implemented control flow. Reads with bespoke per-section error shapes
   (the launch-planning inputs bundle, capacity extras) stay raw — `readBatch`
   is for the `ReadResult`-shaped reads, not a universal flattener.

3. **Each surface** exposes a pure `buildXData(reads, options)` plus a thin
   `supabaseXReads(client)` adapter. The `loadX()` wrapper binds the live
   client (or returns the documented empty shape when the DB isn't configured);
   the build function is a function of the seam.

The seam interface is per-surface — each declares exactly the subset of reads
it needs — not one app-wide `Reads` god-interface.

## Why

- **The interface is the test surface.** Callers and tests cross the same seam.
  Today's ad-hoc PostgREST builder mocks test a read's column allowlist; they
  cannot test orchestration. A per-surface reads interface makes the assembly —
  the part with real branching — testable with an in-memory adapter and no
  database.
- **Two adapters, one seam.** The live `supabaseXReads` and the in-memory test
  fake both satisfy `XReads`. That is a real seam, not a hypothetical one.
- **Locality.** The gather-and-degrade rule lives in `readBatch`; the
  seam-binding scaffold lives in `reads-seam.ts`. A change to either has one
  home instead of N.
- **It generalises an existing, accepted pattern** rather than inventing a new
  one — the dashboard already shipped this shape.

## Scope and non-goals

- This does **not** unify the three group-row assemblers — ADR 0011 declined
  that and still holds. The seam is about _where the live client binds_, not
  about merging distinct output models.
- `loadX()` wrappers keep their signatures, so calling pages are unchanged.
- Migration is per-surface and incremental; a surface is "done" when its
  assembly is a pure function of its reads interface with a test.
