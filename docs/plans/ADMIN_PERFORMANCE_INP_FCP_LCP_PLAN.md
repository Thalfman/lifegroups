# Admin Performance Plan — INP, and /admin FCP · LCP · TTFP

The Vercel **Speed Insights** dashboard (`<SpeedInsights/>` in `app/layout.tsx`)
flags "Poor" INP (>500ms) across `/admin/*` routes, with eye-watering p75 values
(72s, 114s). The small numbers beside each route (4, 3, 2, 1) are **sample counts** —
those p75s are over a handful of real-user sessions, so they're noisy and likely
inflated by backgrounded tabs, but they point at genuine anti-patterns worth fixing.
Separately, mobile **FCP / LCP / TTFP** on `/admin` are weak because the home page is
`force-dynamic` and the largest contentful paint waits on the slowest of ~6 read
bundles (the 4-read Multiply grid + the 2nd-wave shepherd directory).

There is currently **no local web-vitals visibility** — signals only go to Vercel's
external (tiny-sample) dashboard — so this plan also adds lightweight instrumentation to
make the wins verifiable.

Two prior code-audit findings were corrected during research and are baked in below:

- `loadHiddenNavAreas()` is **already** `React.cache`-deduped via `loadAdminFeatureFlags`
  (`lib/nav/hidden-nav.ts:26-32`) — no change needed.
- **Settings/Care tabs do NOT call `history.replaceState`.** Only the People directory
  does. Settings uses the shared `Tabs` primitive (mounts only the active panel, so
  switching to a heavy lazy editor is the cost); Care renders **all** panels up front with
  `hidden`, so its cost is eager hydration of every `CareLeaderPanel`, not the switch.

The codebase is already well-optimized in places: Groups/People use `useDeferredValue`,
auth is `React.cache`-deduped, fonts are `display: swap`, and the home header+skeleton
already stream ahead of data behind `<Suspense>`. So this is targeted tightening, not a
rewrite. Four workstreams.

---

## Workstream 1 — INP quick wins

Goal: stop interactions from synchronously mounting/re-rendering large trees.

### 1a. Defer panel mount in the shared `Tabs` primitive

`components/ui/tabs.tsx` mounts only the active panel (good), but `onClick` calls
`setActiveId` synchronously (line 106). Switching to a heavy tab (e.g. Settings'
`ssr:false` editors) mounts the whole panel on the interaction frame → high INP.

- Wrap the selection in `startTransition` (`useTransition`) so the click (tab highlight)
  paints first and the new panel mounts as a low-priority render:
  `onClick={() => startTransition(() => setActiveId(tab.id))}`. Keep keyboard `focusTab`
  selection urgent for a11y (focus must move synchronously); mark only the _panel swap_ as
  a transition.
- One edit benefits every surface on the primitive (Settings, Multiply, …).

### 1b. People directory — make the URL write non-blocking

`components/admin/people-directory.tsx` `selectTab` (≈ line 82) does a synchronous
`window.history.replaceState(...)` inside the tab `onClick`. The scope/tab change already
re-renders the list.

- Move the `replaceState` so it doesn't block the interaction paint: run it inside a
  `startTransition` (or a `useEffect` keyed on the active tab). The visible tab state flips
  urgently; the URL bookkeeping follows.

### 1c. Memoize list-item components (Groups, People)

Long rosters re-render every row when a parent state toggles (the `listIsStale` opacity
flip, sort changes). `people-directory.tsx` already imports `memo` — extend the pattern.

- Extract the per-group card body in `components/admin/groups-directory.tsx`
  (`renderCardList`, ≈ line 490+) into a `React.memo`'d `GroupCard` keyed on `group.id` so
  unchanged cards skip the deferred re-render. Same for the table row component.
- Confirm the People profile/member row components are `memo`'d; wrap any that aren't.
- Pass stable callbacks (`useCallback`) so memo isn't defeated by new function identities.

> `/admin/groups` and `/admin/groups/[groupId]` already use `useDeferredValue` throughout —
> their headline 72s/114s figures are almost certainly single-sample noise. Memoization is
> the proportionate fix; do **not** introduce list virtualization in this pass (heavier
> change, unproven need at current roster sizes).

### Optional (only if cheap)

`components/admin/group-detail/group-roster-manager.tsx` renders 50–100 `<option>`s in the
assign dropdown. Low priority — leave unless trivially memoizable.

---

## Workstream 2 — `/admin` streaming split (mobile FCP · LCP · TTFP)

Today `AdminHomeData` (`app/(protected)/admin/page.tsx:106-149`) awaits **all six** read
bundles in one `Promise.all` before rendering `<DashboardClient>`, so the LCP element (top
"Needs attention" / vital-signs band) waits on the slowest read — the 4-read Multiply grid
and prospect counts that only feed **below-the-fold** overview cards (already collapsed
behind `CollapsibleOverview`).

Split into two Suspense boundaries so the above-the-fold paint no longer blocks on the slow
reads:

- **Boundary A (LCP path):** keep `AdminHomeData` fetching only what the top of the page
  needs — `getAdminDashboardData`, `isFrozenSurfaceLive`, `getMutedAttentionKeys`,
  `loadHiddenNavAreas` — and render the core `DashboardClient` content.
- **Boundary B (below-the-fold):** move `fetchProspectStateCounts` + `loadMultiplyGridData`
  (and the `interestFunnel` / `multiplyReadiness` derivation, page.tsx:152-180) into a
  **separate async server child** wrapped in its own `<Suspense fallback={…}>`, rendering
  just the Plan/Multiply overview cards. This child streams in after the main paint.

Implementation: introduce a `MultiplyOverviewSection` async server component that does those
two reads and renders the overview cards currently fed via props. `DashboardClient` keeps
the above-the-fold cards and accepts the overview section as a `children`/slot, so the page
becomes:

```
<Suspense fallback={skeleton}>
  <AdminHomeData />            // core dashboard → LCP element
</Suspense>
```

with the overview section nested in its own `<Suspense>` inside that subtree.

Net effect: FCP roughly unchanged (header+skeleton already stream first), **LCP improves**
(top band paints without waiting on the Multiply grid), TTFP/main-thread parse improves
slightly (smaller first RSC chunk).

Critical files: `app/(protected)/admin/page.tsx`,
`components/lg/admin/dashboard/DashboardClient.tsx`.

---

## Workstream 3 — Care accordion lazy-mount

`/admin/care` eagerly mounts a `CareLeaderPanel` for **every** leader at page load.
`CareShell` (`components/admin/care/care-shell.tsx:143-153`) renders all tab panels and
merely toggles `hidden`, and `CareAccordion` (`care-accordion.tsx:108-114`) renders every
pane's leaders. Each `CareLeaderPanel` (`care-leader-panel.tsx`) carries a nested
`<details>` with `LeaderHealthGradeEditor`, one `GroupRubricGradeEntry` per led group, and
two `CareNoteWriteForm`s. At ~10 over-shepherds × ~10 leaders that's ~100 form-heavy
subtrees hydrated up front → long main-thread tasks that depress INP for the whole route.

Fix: render a `CarePane`'s leader panels (and each panel's internals) **only when opened**.

- Convert `CarePane` (or a thin client wrapper around it) to a client component that tracks
  the native `<details>` open state via `onToggle`, and renders
  `pane.leaders.map(<CareLeaderPanel/>)` only once opened (mount-on-first-open, then keep
  mounted so re-collapse is instant). The summary roll-up (`attentionCount`, leader count)
  stays server-rendered so a collapsed pane still signals where the work is — preserving the
  existing "collapsed pane signals load" contract in the file header comment.
- Optionally apply the same mount-on-open to `CareLeaderPanel`'s inner "Grades & notes"
  `<details>` so opening a pane doesn't immediately build every leader's editors either.
- Keep the no-JS disclosure semantics graceful: panes still use `<details>`; the client
  wrapper only gates the expensive children.

This is the single biggest DOM-node + hydration reduction on `/admin/care`; verify via the
perf-harness DOM-node count (below).

Critical files: `components/admin/care/care-accordion.tsx`,
`components/admin/care/care-leader-panel.tsx`.

---

## Workstream 4 — Web-vitals instrumentation (verification)

No local web-vitals capture exists today. Add a thin client reporter that feeds the existing
structured logger so INP/LCP/FCP/TTFB are visible in the log drain with route attribution —
independent of Vercel's small-sample dashboard.

- New client component using `useReportWebVitals` from `next/web-vitals` (built into Next 16
  — no new dependency). On each metric, `navigator.sendBeacon` a small JSON body
  (`{ name, value, rating, id, pathname }`) to a new route handler.
- New `app/api/vitals/route.ts` (POST) that emits via `lib/observability/logger.ts` as
  `event: "web_vital"` with `metric`, `value_ms`, `rating`, `route`. No PII; cheap and
  fire-and-forget.
- Mount the reporter in `app/layout.tsx` next to `<SpeedInsights/>`.
- CSP: the beacon is same-origin, so no `lib/security/headers.ts` change is needed (unlike
  the Vercel `vitals.vercel-insights.com` allowlist already present).

This makes every subsequent change measurable in `read_bundle`-style log lines.

---

## Verification

1. **Build & static checks:** `npm run typecheck`, `npm run lint`, `npm run test:run`
   (the pre-commit hook runs these too; keep the fitness suite green — no new `select("*")`,
   no direct writes, etc.).
2. **Bundle:** `npm run analyze` before/after — confirm no client-bundle regression from the
   new memo/transition wrappers and that the Care lazy-mount doesn't bloat the shell.
3. **Client render / long-tasks / DOM nodes:** run the perf harness
   (`NEXT_PUBLIC_A11Y_HARNESS=1 npm run build`, then
   `npx playwright test tests/a11y/perf-harness.spec.ts`) and diff the JSON artifact —
   expect a **lower DOM-node count and fewer/shorter long tasks** for the Care surface after
   Workstream 3, and no regression elsewhere.
4. **A11y unaffected:** `npm run test:a11y` — the tab `startTransition` and Care
   mount-on-open must keep ARIA tab/disclosure semantics and focus behavior intact.
5. **Web vitals locally:** with Workstream 4 in place, run `npm run start`, navigate
   `/admin`, `/admin/care`, `/admin/groups`, and confirm `web_vital` lines appear in the
   server log with sane LCP/INP values; use them as the before/after yardstick once deployed
   (the Vercel dashboard's tiny samples are too noisy to trust alone).

## Out of scope / explicitly not doing

- List virtualization (unproven need at current roster sizes).
- Changing `force-dynamic` / caching the dashboard reads (RLS-scoped, freshness-sensitive).
- Any schema, RPC, or RLS change — this is all client/render-layer work plus one same-origin
  logging route.
