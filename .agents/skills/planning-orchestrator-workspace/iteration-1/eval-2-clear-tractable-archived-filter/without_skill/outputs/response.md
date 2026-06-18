# Plan: "Archived" filter on the Groups list

## TL;DR — important finding before you build

The Groups list page **already has a full "Archived" tab**. It is the 5th tab in
the tab bar (`components/admin/groups/tab-bar.tsx`), backed by a real membership
predicate (`matchesListTab(tab, input)` in `lib/dashboard/group-status.ts`),
counted on the pill, and given its own empty-state and description copy.
Archived groups **are** loaded into the page (`fetchAllGroups` reads every
group regardless of lifecycle), and every other tab already excludes them.

So the literal request — "let admins show or hide archived groups" — is, in one
reading, already shipped: an admin clicks **Archived** to see them and any other
tab to hide them.

There are two things worth confirming with the requester before writing code,
because the right implementation depends on which they mean:

1. **They haven't noticed the existing Archived tab** → no code change; this is
   a discoverability/UX answer, not an engineering task.
2. **They want archived groups interleaved into the other tabs via a toggle**
   (e.g. an "Include archived" checkbox on the _All_ tab, so you see active +
   archived together) — this is a genuine, small feature. The rest of this plan
   covers that, since it's the only interpretation that yields new behavior.

I'd lead with this finding rather than silently building the toggle.

## One more data-model note

For **groups**, "archived" is **not** an `archived_at` flag. The task says "the
data already has an archived flag," but `GroupsRow` (`types/database.ts`) has no
`archived_at`. Archived state is modeled as `lifecycle_status === "closed"`
(with a `closed_at` timestamp), which `lifecycleCategory()` in
`lib/dashboard/labels.ts` maps to the `"archived"` display category. Other
tables in this repo do use `archived_at`, which is likely the source of the
confusion. Any filter must key off the **lifecycle category**, the same way the
existing Archived tab does — not a column that doesn't exist on groups.

---

## Recommended implementation (interpretation #2: an "Include archived" toggle)

A small, additive toggle that lets the operator overlay archived groups onto the
current tab, without disturbing the existing Archived tab. All the wiring is
client-side and pure-predicate; no new reads, RPCs, migrations, or server
actions are needed (archived rows are already in `props.groups`).

### Files to change

1. **`lib/dashboard/group-status.ts`** — the pure membership rule.
   - Today `matchesListTab` hard-excludes archived groups from every non-archived
     tab (`if (input.lifecycle === "archived") return false;`).
   - Add an `includeArchived` parameter (default `false`, so existing callers and
     tests are unaffected) that, when `true`, lets archived groups also satisfy
     the non-archived tabs. Keep the dedicated `archived` tab behaving exactly as
     now. Signature becomes
     `matchesListTab(tab, input, includeArchived = false)`.
   - This is the only logic change; everything else is plumbing and UI.

2. **`components/admin/groups-directory.tsx`** — state + UI for the toggle.
   - Add `const [includeArchived, setIncludeArchived] = useState(false);`
   - Mirror the existing deferred-value pattern: add a
     `deferredIncludeArchived = useDeferredValue(includeArchived)` and include it
     in the `listIsStale` check (so the list dims while catching up, like the
     other controls).
   - Pass it through in `matchesTab` (used by `visible`) and in the `tabCounts`
     loop so counts reflect the toggle.
   - Decide and document the toggle's scope: it's only meaningful on the
     non-archived tabs (on the `archived` tab everything is already archived).
     Simplest correct behavior: render the toggle only when
     `tab !== "archived"`, and force `includeArchived` to be ignored on the
     archived tab. Render it next to the search box / view controls
     (around the `flex` control row at lines ~525-543, or above the search input
     at ~555).
   - Use an existing primitive for the control (there's a `Button`/toggle
     vocabulary already in `components/admin/groups/view-controls.tsx` —
     `ViewModeToggle`/`DensityToggle` are the styling reference; a labeled
     checkbox styled to match is fine and is the most honest affordance for a
     binary include/exclude).

3. **`components/admin/groups/tab-bar.tsx`** _(only if you want counts to react)_
   — no change needed if you compute counts in the directory; the `counts` prop
   already flows in. The tab-count math lives in `groups-directory.tsx`
   (`tabCounts` useMemo), so the toggle's effect on counts is handled in file #2.

### Behavior decisions to confirm with the requester

- **Default state:** off (hide archived) — matches today's behavior and the
  "Active by default" posture of the rest of the surface.
- **Persistence:** Should the choice persist per-admin like the card⇄table view
  preference (`usePersistedViewState`, surface `"groups"`)? The cheapest version
  is ephemeral (resets on reload). Persisting it means adding the field to the
  `GroupsViewSnapshot` shape (`components/admin/groups/view-snapshot.ts`) and its
  validator — a slightly larger change. Recommend **ephemeral** for v1 unless
  asked.
- **Search + "N groups shown":** these already derive from `visible`, so they
  update automatically once `visible` respects the toggle. No extra work.

### Tests to add/update

- **`lib/dashboard/__tests__/group-status.test.ts`** — the home for the predicate
  spec. Add cases for `matchesListTab` with `includeArchived: true`: an archived
  group now matches `all` (and the relevant triage tabs) while a non-archived
  group is unchanged; with `includeArchived: false` behavior is identical to
  today (regression guard). The existing `baseInput()` helper and `lifecycle`
  override make this a few short cases.
- Optionally a directory-level component test asserting the toggle flips
  membership and counts, mirroring `components/admin/groups/__tests__/`.
- Run `npm run test:run` and `npm run typecheck`; the pre-commit hook gates on
  both. No a11y-route changes, but ensure the toggle has an accessible label
  (the a11y suite runs against `/a11y-harness`).

### What you do NOT need to touch

- **Reads / data layer** (`group-management-data.ts`, `read-models.ts`):
  `fetchAllGroups` already returns archived groups; no read change, no column
  allowlist change, no new RPC, no migration. This keeps the change inside the
  security invariants automatically (no new writes, no `select("*")`).
- **Server actions** (`app/(protected)/admin/groups/actions.ts`): archiving
  (close) and restoring (reopen) groups already exist (`adminCloseGroup` /
  `adminReopenGroup`); the filter is read-only UI.

---

## Effort estimate

If interpretation #2 is what's wanted: roughly **one small PR** — one ~5-line
change to a pure function, ~15-20 lines of state/UI in the directory shell, and a
handful of predicate tests. No backend, no schema, no new reads.

If interpretation #1 (they just didn't see the existing tab): **zero code** —
point them at the Archived tab.

## Recommended next step

Confirm with the requester which behavior they want: "the existing **Archived
tab** (click to show only archived, click any other tab to hide them)" vs. "an
**Include-archived toggle** that overlays archived groups onto the active list."
The plan above is ready to execute for the toggle the moment that's confirmed.
