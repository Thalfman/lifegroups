# Discovery Brief: "Care Notes page feels slow" → caching layer

Before planning _how_ to cache, I want to flag the shape of this request: you've
named a **solution** ("add a caching layer") for a **symptom** ("feels slow")
that we haven't measured yet. Caching is one of the riskier levers to reach for
here, because the Care Notes page serves **per-viewer, privacy-gated data** under
the oversight ladder — and a shared cache is exactly where that ladder leaks.

So this is a discovery brief, not an implementation plan. The honest next step is
a cheap measurement pass to find _where_ the time actually goes, because the
evidence will point at a different (and safer) fix than caching in most of the
likely scenarios. I've grounded everything below in the real code.

---

## Stated request

Add a caching layer to speed up the Care Notes page, which "feels slow."

## What the "Care Notes page" actually is (grounded)

There's no standalone Care Notes page. The surface is the **Notes tab of the Care
area** (ADR 0023), served by `/admin/care`:

- Route: `app/(protected)/admin/care/page.tsx` — `export const dynamic = "force-dynamic"`, admin-guarded.
- The route loads the **entire Care workspace** in `loadCarePageData()`, not just notes. That batch is `Promise.all([loadAdminFollowUpsData(), loadCareData(today), loadCareAccordionEnrichmentSafe(...)])` **plus** the notes feed running concurrently.
- Notes feed orchestration: `components/admin/care/notes-feed-data.ts` (`buildNotesFeedData`).
- Reads: `lib/supabase/care-note-feed-reads.ts` — four parallel reads (care notes, prayer requests, broad notes, sealed counts) + a follow-up author-name read.
- Pure assembly: `lib/admin/care-note-feed.ts` (`buildCareNoteFeed`).

This already matters: "the Notes page is slow" might actually be "the **whole
Care page** is slow," since the tab can't render until the full workspace batch
resolves. That changes what we'd cache.

## Possible underlying goals

The real outcome you want is almost certainly one of these — and they lead to
different work:

1. **Time-to-first-paint** on the Care area feels laggy (chrome + tab content slow to appear).
2. **The notes read itself is slow** (the SQL behind the feed takes too long).
3. **The page does too much work** — the Notes tab waits on unrelated Care reads (follow-ups, directory, accordion enrichment) it doesn't need.
4. **Repeated navigation feels slow** — re-opening Care re-runs everything with no reuse within a request or across a short window.
5. **It's slow only at scale / only for the Ministry Admin** (the viewer who can read the most rows once transparency grants are on).

Caching only helps #4 and partially #1. For #2 and #3, caching would paper over a
query/architecture problem — and add a privacy-leak risk on top.

## Assumptions (label each — correct me if wrong)

- **A1 (load-bearing):** "slow" is real and reproducible, not a one-off cold start or a dev-server artifact. _Not yet verified._
- **A2 (load-bearing):** the slow surface is `/admin/care`'s Notes tab as above, not the per-leader `shepherd-care/[profileId]` detail page or the Leader-facing `leader/[groupId]/care` page.
- **A3:** the data volume is small-to-moderate today (this is Julian's admin OS — a handful of admins, not thousands of concurrent users), so this is about per-request latency, not cache-for-throughput.
- **A4:** correctness/freshness of care notes matters — an admin who just wrote a note expects to see it immediately (the write path already calls `revalidatePath`).

## Unknowns (what we'd need to know to be confident)

- **Where the time goes.** No latency number is in hand. Is it server read time, RLS query time, render/paint, or network?
- **Which read dominates.** Of the four feed reads + the three Care batch reads, which is the long pole?
- **Row counts and the RLS cost.** How many `care_notes` / `prayer_requests` rows does the heaviest viewer (Ministry Admin with grants on) actually pull through RLS?
- **Cold vs warm.** Is it slow every time, or only first hit?

## Evidence that already exists or is cheap to get

You are not starting from zero — the instrumentation is already wired:

- **`read_bundle` production logs.** `app/(protected)/admin/care/page.tsx` wraps the load in `measureReadBundle("care_page", ...)` (`lib/observability/read-timing.ts`), emitting a `latency_ms` line per load to the log drain. **Pull these first** — they answer "is the server read actually slow, and how slow?" with measured numbers, privacy-safe (counts only). Note: this currently times the _whole_ `care_page` bundle, not the notes feed alone.
- **Client paint cost.** `tests/a11y/perf-harness.spec.ts` against `/a11y-harness` captures Navigation Timing, first paint, long tasks, and DOM-node counts — this tells you if the cost is render, not read.
- **Bundle size.** `npm run analyze` (Turbopack report) flags client JS bloat.
- **Query plans.** Running `EXPLAIN ANALYZE` on the feed queries as the relevant viewer (locally or via the Supabase MCP against a non-prod branch) would directly confirm/deny the index suspicion below.

## The strongest non-caching hypotheses (why caching may be the wrong lever)

Reading the code surfaced two concrete suspects that caching would _hide_ rather
than _fix_:

1. **Missing `created_at` index for the feed's sort.** The feed reads do
   `order("created_at", { ascending: false }).limit(100)` on `care_notes` and
   `prayer_requests` (`care-note-feed-reads.ts`). The migration
   (`20260608090000_phase_pivot9_care_notes.sql`) creates indexes on
   `subject`, `author`, and `subject_group` — but **none on `created_at`**. The
   newest-first feed query has no subject filter (it's cross-subject by design),
   so Postgres likely does a sort over the whole RLS-filtered set. A
   `created_at desc` index is a one-migration fix that's cheaper, safer, and more
   durable than a cache.

2. **Per-row correlated subquery in RLS.** The `care_notes` /
   `prayer_requests` SELECT policies gate ladder reads with
   `auth_is_admin() and exists (select 1 from note_transparency_grants g where g.subject_profile_id = care_notes.subject_profile_id and g.granted)`.
   That `EXISTS` is evaluated per candidate row. The auth helpers are correctly
   `stable` (good — they won't re-run per row), but the grant lookup still wants
   an index on `note_transparency_grants(subject_profile_id) where granted`, and
   the policy could potentially be reshaped. This is a query-tuning problem, not
   a caching one.

3. **Tab waits on the whole workspace.** `loadCarePageData` resolves follow-ups,
   the care directory, and accordion enrichment before the page renders. If the
   Notes tab is the complaint, the cheaper win may be to stream the Notes tab
   independently (it already starts concurrently — but the page `await`s the full
   batch before returning). That's an architecture tweak, not a cache.

## Why caching is specifically risky here (the privacy constraint)

This is the part that makes "just add caching" dangerous, and it's a hard
invariant in this repo:

- The Care Notes feed is **per-viewer and RLS-scoped**. Two admins see different
  rows; the **Ministry Admin's Private Care Note is hidden even from the Super
  Admin**, and author-private Care Notes are sealed until a transparency toggle
  flips. A naive shared/data cache keyed by route would **serve one viewer's
  sealed notes to another** — a P0 security violation (CLAUDE.md "visibility
  exceptions"; AGENTS.md P0 list).
- The existing cache precedent in this repo is deliberately narrow:
  `lib/supabase/cached-config.ts` uses `unstable_cache` **only for non-private,
  shared config** (metric defaults), and `lib/auth/session.ts` uses React
  `cache()` only for **per-request** dedup. There is no precedent for caching
  per-user private content, and for good reason.
- So any caching that did make the cut would have to be either (a) per-request
  memoization only (no cross-request reuse — limited speed benefit), or (b)
  strictly keyed by viewer profile id **and** invalidated on every note write /
  transparency-toggle change. Option (b) is real work with a real leak surface,
  and it should only be undertaken if measurement proves the read is the
  bottleneck _and_ the query itself can't be made fast enough.

## Suggested investigation (cheap, in order)

1. Pull the `read_bundle` `care_page` `latency_ms` lines from the log drain. Establish a baseline. _(Confirms A1; tells you if it's server-side at all.)_
2. If server-side and slow: `EXPLAIN ANALYZE` the four feed reads as the heaviest viewer. Look for sorts/seq-scans on `care_notes`/`prayer_requests` and the cost of the grant `EXISTS`. _(Tests hypotheses 1 & 2.)_
3. If server-side latency is _fine_: run `perf-harness.spec.ts` and `npm run analyze` to check render/paint/bundle. _(Tests hypothesis #1 from "possible goals.")_
4. Decide whether the Notes tab needs to wait on the full Care workspace batch at all. _(Tests hypothesis #3.)_

Each step is hours, not days, and each one redirects the fix.

## Recommended next planning target

**Localize the latency before choosing a remedy.** Run steps 1–2 above, then pick
the fix the evidence supports:

- If it's the **sort / query** → add a `created_at` index (+ the grant index) and re-measure. _Most likely outcome; smallest, safest change; a one-migration implementation plan._
- If it's the **page doing too much** → stream the Notes tab independently of the rest of the Care workspace.
- If it's **render/bundle** → a frontend/Suspense/streaming plan, not a data cache.
- **Only if** the read is provably the bottleneck _and_ irreducible by indexing → plan a **per-viewer, write-invalidated** cache as a deliberate, security-reviewed change (Review Plan, not a quick add), respecting the visibility exceptions.

I'd resist building a cache first: it adds a privacy-leak surface, masks the
likely real cause (a missing index), and complicates the existing
`revalidatePath`-based freshness model.

## Domain selection (why these lenses)

```
Selected domains:
1. Data — the whole question is "where does the time actually go"; we have
   read_bundle + perf-harness evidence sitting unused.
2. Database — the leading hypotheses (missing created_at index, per-row RLS
   EXISTS subquery) live in the schema/query layer.
3. Technical — the page over-fetches the full Care workspace before the Notes
   tab can render; the seam for any fix is here.
4. Security — caching per-viewer, ladder-gated private notes is a P0 leak risk;
   any cache must be viewer-keyed and write-invalidated.
5. Testing — "fast enough" needs an observable acceptance bar, and a cache needs
   regression tests proving no cross-viewer leakage.

Excluded domains:
- Product/UX — the goal (latency) is a mechanism, not a flow change; no screens
  or copy move. (Revisit only if the fix becomes "show a skeleton / paginate.")
- DevOps — no deploy/infra/env change implied by a query index or render tweak.
- AI / Compliance / Documentation — nothing model-driven, no new regulated data
  class, no handoff doc beyond this brief.
```

## Questions that would materially change direction

1. **Is the slowness measured or felt?** If you already have a number (e.g. "Notes tab takes 4s"), share it — it lets me skip straight to the right fix's plan. If it's "feels slow," step 1 (pull the logs) is the move.
2. **Is it slow for everyone, or specifically when transparency grants are on (the Ministry Admin's heavy view)?** "Only the heavy view" strongly implicates the RLS `EXISTS` / row volume, not caching.
3. **Slow on every open, or only after writing/navigating?** "Every open" → query/index. "Only re-opens feel redundant" → the one scenario where per-request/short-TTL reuse genuinely helps.

---

## Handoff: what a follow-up session should do

There is no implementation handoff yet **by design** — we shouldn't plan how to
cache until measurement says caching is the right lever. The correct next session
is a **measurement pass**, scoped as:

```text
Fresh investigation session prompt:

Goal: Localize the latency behind the Care area's Notes tab (/admin/care) before
choosing a remedy. Do NOT add a caching layer yet — the prior planning pass found
caching is likely the wrong (and privacy-risky) lever.

Scope:
1. Pull the production `read_bundle` lines for surface "care_page"
   (emitted by app/(protected)/admin/care/page.tsx via
   lib/observability/read-timing.ts). Report observed latency_ms distribution.
2. If server-side latency is the issue, EXPLAIN ANALYZE the four feed reads in
   lib/supabase/care-note-feed-reads.ts (fetchAllReadableCareNotes,
   fetchAllReadablePrayerRequests, fetchBroadNoteInteractionsForAdmin,
   fetchSealedNoteCounts) as a Ministry Admin viewer with transparency grants on.
   Specifically check whether the `order by created_at desc limit 100` on
   care_notes / prayer_requests sorts the full RLS set (no created_at index
   exists today — only subject/author/subject_group indexes from
   20260608090000_phase_pivot9_care_notes.sql), and the cost of the per-row
   note_transparency_grants EXISTS in the SELECT policies.
3. If server reads are fine, run tests/a11y/perf-harness.spec.ts and
   `npm run analyze` to check render/paint/bundle instead.

Non-goals:
- No caching implementation. No schema changes in this session — measure only.
- Do not touch the visibility/RLS invariants (the Ministry Admin's private note
  and author-private care notes must stay sealed per CLAUDE.md).

Deliverable: a one-page finding that names the dominant cost and recommends ONE
of: (a) add a created_at (+ grant) index, (b) stream the Notes tab independently
of the Care workspace batch, (c) a frontend/render fix, or (d) — only if reads
are provably the irreducible bottleneck — a per-viewer, write-invalidated cache
to be planned separately as a security-reviewed Review Plan.

Acceptance criteria for the eventual fix (whichever path):
- A measured before/after latency improvement on the heaviest (Ministry Admin)
  viewer.
- No regression in note freshness after a write (revalidatePath path still works).
- If a cache is ever introduced: a test proving viewer A never sees viewer B's
  sealed care notes / prayer requests, and that a transparency-toggle change
  invalidates affected entries.
```
