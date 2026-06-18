# Plan: speeding up the Care Notes page

Before I plan a caching layer, I want to flag something, because I read through how this page is actually built and I don't think caching is the first move. "Add a caching layer" is a solution — but we haven't yet pinned down _what's slow_ or _why_. If we cache the wrong thing we'll add real complexity (and risk to your privacy invariants) without moving the number that matters. Let me lay out what I found, then propose a plan that starts with measurement and keeps caching as one option rather than the goal.

## What the Care page already does

The Care area lives at `app/(protected)/admin/care/page.tsx`, feeding the `CareShell` with several tabs, including the ADR 0023 **Notes** feed. It is already fairly well-optimized:

- **`export const dynamic = "force-dynamic"`** — every load is a fresh RLS-scoped read (correct for per-user, privacy-gated data).
- **Suspense streaming** — the page header flushes immediately and the read fan-out streams in behind `<Suspense>` (`CarePageView` → `CareData`).
- **Concurrent batching** — `loadCarePageData` runs three loaders in a `Promise.all` batch (`loadAdminFollowUpsData`, `loadCareData`, `loadCareAccordionEnrichmentSafe`), and kicks off the Notes feed (`loadNotesFeedSafe`) _concurrently_, sharing already-resolved names as promise "seeds" so it doesn't re-fetch them.
- **Inner parallelism** — `buildCareData` (`components/admin/care/care-data.ts`) and `buildNotesFeedData` (`notes-feed-data.ts`) each fan their own reads out in parallel.
- **Existing timing instrumentation** — every load is wrapped in `measureReadBundle` (`lib/observability/read-timing.ts`), emitting `read_bundle` log lines with `surface` + `latency_ms` for `care_page`, `care_dashboard`, etc. **The data to diagnose this already exists in your log drain.**
- **An existing caching precedent** — `lib/supabase/cached-config.ts` already uses Next's `unstable_cache` with tag-based busting for the one read that's safe to cache: `metric_defaults`, which is global and identity-independent.

That last point matters: the team has already drawn a careful line about _what's cacheable_. The cached read is global config that's identical for every user. Almost everything on the Care Notes page is the opposite.

## Why caching is the risky default here

The Notes feed reads (`lib/supabase/care-note-feed-reads.ts`) pull **per-viewer, RLS-scoped, privacy-gated** rows: `fetchAllReadableCareNotes`, `fetchAllReadablePrayerRequests`, `fetchBroadNoteInteractionsForAdmin`, plus `admin_sealed_note_counts`. Per CLAUDE.md and ADR 0023, what a given admin may read depends on author-private Care Notes, the Ministry Admin's Private Care Note, and per-person transparency grants.

A caching layer over those reads is dangerous in a specific way: **the cache key would have to encode the full visibility state of the viewer**, or you risk serving one user rows they're not allowed to see. That's a P0-class privacy regression, not a perf tweak. So caching here isn't a quick win — it's a high-stakes change that needs to be the _last_ resort, only after we've confirmed the round-trips themselves are the bottleneck and can't be fixed more cheaply.

## What we don't know yet (and need to)

1. **Is the slowness server or client?** The page streams; "feels slow" could be the read fan-out (server) _or_ rendering a large feed / heavy tabs / layout shift (client). These have completely different fixes.
2. **Which read is the long pole?** The `read_bundle` logs already separate `care_page`, `care_dashboard`, and the notes feed. One of them dominates; we should read the logs before guessing.
3. **Is it the query or the data volume?** The feed reads cap at `DEFAULT_FEED_LIMIT = 100` per source and `order by created_at desc` — if those columns aren't indexed, the slowness is a missing index, and a cache would just paper over a one-line migration fix.
4. **Is it cold-start / waterfall, not throughput?** `requireAdmin()` runs a session/profile read before the batch; that and Supabase connection cost can dominate on an otherwise-fast query set.

## Proposed plan: diagnose first, then fix the actual bottleneck

**Phase 0 — Measure (do this before deciding anything).**

- Pull the `read_bundle` lines for `care_page` / `care_dashboard` / the notes feed from the log drain to see real production `latency_ms` per surface. (Per CLAUDE.md, authed `/admin/*` routes can't be timed locally — they redirect to `/login` without Supabase env — so production logs are the signal.)
- Use the `tests/a11y/perf-harness.spec.ts` harness for client-side paint / long-task / DOM-node cost on the Care surface.
- Outcome: a one-paragraph finding — "the slow part is X, taking Y ms" — that picks the branch below. This is cheap and it's the only step that makes the rest non-speculative.

**Phase 1 — Cheap, safe wins (likely sufficient).** Depending on Phase 0:

- **DB indexes** on the feed's sort/filter columns (`care_notes.created_at`, `prayer_requests.created_at`, the `shepherd_care_interactions` predicates) if the query plans show seq scans. Highest likely ROI, no privacy surface.
- **Query/limit tuning** — lower the per-source feed limit, or defer the heaviest tab behind its own `<Suspense>` so the Notes tab doesn't block first paint.
- **Client render** — virtualize/paginate the feed list if Phase 0 shows the cost is DOM size, not the read.

**Phase 2 — Caching, only if Phase 0/1 prove the round-trips are the bottleneck _and_ indexing can't close the gap.** And even then, scoped narrowly:

- Identify any read on this page that is genuinely **identity-independent** (like `metric_defaults` already is) and route it through the existing `unstable_cache` + tag-bust pattern in `cached-config.ts`. That's the _only_ caching this codebase currently considers safe, and it's the model to extend.
- Do **not** cache the RLS-scoped note/prayer/broad-note reads cross-user. If we ever want request-scoped dedup there, use React's per-request `cache()` (no cross-user leakage) rather than a shared data cache — and we'd write/extend tests for the privacy invariants first.
- Any cached note read must bust its tag in the relevant Care write actions (the way settings actions already bust `config:metric-defaults`), or you'll serve stale notes after an edit.

## What I'd want from you

- **What does "slow" mean concretely** — slow to first paint, or slow to show the notes once the page is up? On which tab? Roughly how many notes/leaders in the real data?
- Are you OK starting with **measurement (Phase 0)** rather than committing to caching up front? If the logs show a missing index, we save ourselves a risky privacy-sensitive cache layer entirely.

If you'd rather I just proceed, my recommendation is: start at Phase 0, and I'll come back with the actual bottleneck and a targeted fix instead of a speculative cache.

### Key files (for reference)

- `app/(protected)/admin/care/page.tsx` — route, guard, Suspense, read orchestration
- `components/admin/care/care-data.ts` — Care dashboard read fan-out
- `components/admin/care/notes-feed-data.ts` — Notes feed assembly (ADR 0023)
- `lib/supabase/care-note-feed-reads.ts` — the RLS-scoped, capped note/prayer/broad-note reads
- `lib/supabase/cached-config.ts` — the existing safe caching pattern (`unstable_cache` + tag bust)
- `lib/observability/read-timing.ts` — `measureReadBundle`, the timing already in place
