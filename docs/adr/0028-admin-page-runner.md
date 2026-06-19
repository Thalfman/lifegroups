# ADR 0028: Admin page runner (read-side twin of ADR 0001)

**Status:** Accepted (runner landed in `lib/admin/admin-page.tsx`; the standard
admin pages migrated — plan, multiply, groups, people, settings, check-ins,
leader-pipeline, guests)
**Date:** 2026-06-19

## Context

The write path hides its `auth -> parse -> validate -> guard -> RPC ->
revalidate -> log` skeleton behind `runAdminWriteAction` (ADR 0001). The
read/page side never got the symmetric treatment, so ~20 admin pages copy-pasted
the same wiring:

```
requireAdmin -> unwrap searchParams / route params -> resolve params
  -> load data -> render PageHeader + body
```

Of which ~5 lines are the page's actual identity (its loader, its header copy,
its body) and the rest is ceremony — the guard, the `await searchParams`, the
header element, and (on the streaming pages) the `<Suspense>` wrap. The guard +
header policy was re-spelled per page, and nothing pinned the shape, so a page
could quietly forget the guard or the header.

## Decision

Introduce `adminPage(spec)` in `lib/admin/admin-page.tsx`. It returns the async
page component used directly as a route's `export default`, and owns the
skeleton. A page supplies only the pure bits:

- `params?: (raw) => TParams` — resolve typed params from the awaited
  `searchParams` / route `params` (`raw` is both, normalised to plain records).
  Omit for pages with no params.
- `load: (params, session) => Promise<TData>` — an **arbitrary** async loader;
  all bespoke loading (parallel `Promise.all`, `measureReadBundle`, multiple
  reads) lives here, so the runner never models it. Receives the resolved params
  and the admin session.
- `header: (params) => { eyebrow?, title, italic?, lede? }` — PageHeader copy,
  derived from params (or static) so it renders **above** any Suspense boundary.
- `render: (data, params) => ReactNode` — the body (owning its own `<PageBody>`),
  given the loaded data and params.
- `fallback?: ReactNode` — optional. When present, the runner wraps the body in
  `<Suspense>` with this fallback and lets the loader stream (header renders
  immediately, body suspends). When absent, the runner awaits the loader inline.
- `frozenBanner?: boolean` — optional. Render the shared `FrozenSurfaceBanner`
  above the header (the off-nav surfaces that still resolve by direct URL).

The runner owns: `requireAdmin()`, awaiting + threading `searchParams` / route
`params`, the optional banner, the `PageHeader`, and the optional Suspense wrap.
The session it resolves is passed to `load`, so pages that needed the viewer id
/ super-admin flag no longer re-read the session (it is the same React-cached
session the guard resolved).

## Scope

Targeted the **standard admin pages** — the `requireAdmin` pages with the
guard → load → header → body shape. Migrated: **plan, multiply, groups, people,
settings, check-ins, leader-pipeline, guests**.

Left out of the in-scope set, each for a concrete reason:

- **care** — its guard / header / Suspense wiring lives in the shared
  `CarePageView` (reused by the frozen `/admin/shepherd-care` and
  `/admin/follow-ups` aliases) and takes an `initialTab`, which the page-runner
  interface (one `export default` per route) does not model.
- **group-health** — the header copy (its `lede`) and the
  `FrozenSurfaceBanner`-above-header vary by **degraded-read status** (no-db /
  error / ok). The runner's header is derived from params, not loaded data, so
  it cannot reproduce that branch without changing the degraded UI.

Excluded by the decided scope and untouched: the tiny alias/redirect pages
(`follow-ups`, `multiply/criteria`, `multiply/settings`), the two giant bespoke
detail pages (`groups/[groupId]`, `shepherd-care/[profileId]`), and the
non-admin (`requireLeader` / `requireOverShepherd`) pages.

## Consequences

- **Behavioural parity.** No change to rendered output, redirects, or streaming
  behaviour. Streaming pages (those passing `fallback`) still render the header
  immediately and suspend the body inside `<Suspense>`; the loader runs in an
  async child so it streams rather than blocking the page. The migrated pages'
  `dynamic = "force-dynamic"` exports are unchanged.
- Each migrated page now reads as a spec (params resolver + loader + header +
  render), not hand-rolled wiring, and no page re-does the guard or param-unwrap
  itself.
- The read-timing seam is untouched: pages that wrapped their load in
  `measureReadBundle` keep doing so inside `load`, so the production
  `read_bundle` lines are byte-for-byte identical.

## Invariants preserved (see AGENTS.md)

A pure refactor of page wiring — no schema, RLS, or RPC surface changes. Reads
still go through the reads seam with explicit column allowlists, still degrade
gracefully (the loaders' empty-shape / per-card error behaviour is unchanged),
and no service-role key enters the runtime. The admin guard now runs in exactly
one place (the runner) for every migrated page.
