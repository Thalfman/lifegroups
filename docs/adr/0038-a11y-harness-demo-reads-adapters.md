# The a11y harness renders seam-backed surfaces through their real builders

**Status:** Accepted — 2026-07-07. Implements candidate 4 (safe slice) in the
[2026-07-06 architecture deepening review](../reviews/2026-07-06-architecture-deepening-review.html).
Generalizes the `launch-planning-snapshot` precedent ("the demo can't drift
from the live card's shape") and extends the reads seam (ADR 0015) with a
third adapter kind: demo.

The a11y harness mounts real view components — the good seam — but hand-typed
each surface's _derived_ payload as a literal, one layer above the
`buildXData(reads)` orchestration the live pages run. That literal is a second
source of truth: a builder or shape change can reshape what the live page
renders while the harness keeps rendering yesterday's fixture, and the
consuming Playwright specs skip in environments without the harness build.

## Decision

**For surfaces that have a reads-seam build function, the harness renders what
the real builder derives from in-memory demo adapters.**
`app/a11y-harness/demo-data.ts` holds small adapters over seed rows (reusing
`lib/dashboard/demo-seed.ts` rows and the `group-fixtures` factories) and one
`buildHarnessDemoData()` that awaits the same `buildAdminFollowUpsData`,
`buildSettingsData`, `buildPeopleDirectoryData` / `buildPeoplePipelineData`,
and `buildLeaderPipelineData` the live pages call.

**The build happens in the harness's server page, not the client module.**
Every one of these builders is server-bound — the `*-data.ts` modules import
`@/lib/supabase/server` (→ `next/headers`), and several of their read modules
are `import "server-only"` — so the `"use client"` harness cannot import them.
`app/a11y-harness/page.tsx` awaits `buildHarnessDemoData()` once and passes
the plain-JSON result down as a single `demo` prop; `harness-client.tsx`
imports only the `HarnessDemoData` **type**. The payloads are deterministic,
so the route's `force-static` holds.

**Four surfaces migrated in this slice (the clean 1:1 mappings):**

- **Follow-ups** (+ empty variant — an adapter whose queue read returns `[]`,
  proving the reference data survives the empty state).
- **Settings** (+ the #469 failing-reads variant): the error payload is now
  derived by failing exactly the four section reads, so the spec exercises the
  builder's **genuine degrade path** (empty rubric criteria, no saved-rubric
  flag, built-in readiness fallback) instead of hand-typed
  healthy-data-with-errors.
- **People** (directory + apprentice pipeline, sharing one adapter — the same
  memberships read feeds both, as in production).
- **Multiply Shepherds** (replacing the harness's by-hand
  `buildPipelineRollup` call — the one place it re-derived orchestration).

**A default-lane pin test** (`app/a11y-harness/__tests__/demo-data.test.ts`)
asserts the builder-derived values the a11y specs key on (queue titles, the
#478 override label source, saved-rubric decode, pipeline names/options, the
four failing error keys), so a builder or seed change surfaces in `test:run`
rather than as a Playwright failure two suites later.

### Accepted drifts (verified non-asserted by the specs)

- Builders sort groups and member options by name: the Multiply Shepherds
  group select lists Harbor Women first, and its member options sort
  alphabetically.
- The People directory gains a "Harbor Group" row and its two memberships, so
  the pipeline group isn't an orphan reference.
- `settings.readiness.ministryYear` is build-time
  `currentMinistryYear(new Date())` instead of a pinned `2026` — the one
  nondeterminism; no spec asserts the year.

## The boundary: what deliberately stays outside

- **The messier seam-backed surfaces** (future slices): Home (the widest reads
  map, plus `DashboardResult` unwrapping and snapshot/activity slot wiring),
  person-detail (two-phase spine/body composition), group-roster (a
  discriminated tab union), notes-feed / group-health / multiply-grid
  (decomposed props and extra context).
- **The ~15 surfaces with no reads seam** — pure presentational components
  (calendar family, care cards, banners, sidebar) — keep hand-typed fixtures
  by design: there is no orchestration for them to drift from.

## Consequences

- A `buildXData` shape change now breaks the harness at compile time and its
  pin test in the default lane, instead of drifting past CI.
- Anything new the harness mounts that has a build function should get a demo
  adapter here rather than a hand-typed derived payload.
- The harness client shrank by ~330 fixture lines; the payload source of truth
  for these four surfaces is the seed rows plus the production builders.
