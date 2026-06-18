# Plan: "Archived" filter on the Groups list

## TL;DR — read this first

Before any code, the most important finding: **the Groups list already has an "Archived" filter.** It is the fifth tab in the existing tab bar (`All groups · Needs setup · Needs health check · Needs attention · Archived`). Selecting it shows only archived groups; every other tab already hides them. It is URL-addressable (`/admin/groups?tab=archived`), shows a live count on the pill, and has its own empty-state copy.

So the literal request — "let admins show or hide archived groups" — is, on the current `/admin/groups` surface, **already satisfied**. The honest recommendation is to confirm which surface and which interaction the user actually means before writing anything. This memo lays out the three real possibilities and gives a ready-to-build plan for the only one that involves new code.

I'm treating this as a **decision memo** rather than an implementation plan on purpose: handing back a confident "here's how to build the toggle" plan when the toggle largely exists would be planning the wrong thing.

---

## Request separation

- **Stated request:** Add an "Archived" filter toggle to the Groups list so admins can show/hide archived groups.
- **Underlying goal:** An admin can keep archived groups out of their normal view, and pull them up deliberately when needed (e.g. to restore one). Archive is a first-class lifecycle state in this app (ADR: "no hard deletes — Archive is the default"), so being able to _see_ archived groups without them cluttering the active list is the real outcome.
- **Load-bearing assumption in the request — and it's wrong as stated:** that no such filter exists. It does. The request also assumes a _toggle_ (binary show/hide) is the right control; the existing implementation uses a _tab_ (segmented bucket), which is arguably better here because it composes with the other four triage buckets and carries a count.
- **Missing context:** Which surface is the user looking at? There are several group lists. And: is the complaint "I can't find archived groups at all" (false on `/admin/groups`) or "archived groups clutter my list and I want a quicker show/hide than switching tabs" (a real, smaller UX ask)?

---

## What exists today (grounded in the repo)

The active Groups management surface is **`/admin/groups`**, and its archive filtering is already built end-to-end:

- **The data model.** There is no `is_archived` / `archived_at` boolean. "Archived" is the `lifecycle_status` enum value `"closed"` on `groups`, mapped to the `"archived"` display category by `lifecycleCategory()` in `lib/dashboard/labels.ts` (plus a `closed_at` timestamp). So "the data already has an archived flag" is true in spirit — it's a lifecycle enum, not a boolean.
- **The read.** `fetchAllGroups` (`lib/supabase/read-models.ts`) selects named columns including `lifecycle_status` and `closed_at` and returns **all** groups, active and archived. Filtering is entirely client-side. No DB or RLS change is needed for any option below.
- **The filter UI.** `components/admin/groups/tab-bar.tsx` renders the five tabs, including `{ key: "archived", label: "Archived" }`, each with a live count.
- **The filter logic.** `matchesListTab()` in `lib/dashboard/group-status.ts` is a pure, test-locked predicate: the `archived` tab matches `lifecycle === "archived"`, and **every other tab explicitly excludes archived groups** (`if (input.lifecycle === "archived") return false;`).
- **The wiring.** `app/(protected)/admin/groups/page.tsx` resolves `?tab=` via `resolveGroupListTab()` and passes `initialTab` into the shell; `groups-directory.tsx` filters `visible` through `matchesTab` and computes `tabCounts`.
- **Archive lifecycle is also already complete:** `adminCloseGroup` / `adminReopenGroup` server actions (`app/(protected)/admin/groups/actions.ts`), a dimmed card + `LifecycleBadge` for archived groups, and a "Restore" action in the per-group menu.

Key reference files:

| Purpose                                       | Path                                               |
| --------------------------------------------- | -------------------------------------------------- |
| Groups page (server, resolves `?tab=`)        | `app/(protected)/admin/groups/page.tsx`            |
| Data orchestration (reads seam)               | `components/admin/groups/group-management-data.ts` |
| Client directory (filter + counts)            | `components/admin/groups-directory.tsx`            |
| Tab bar UI                                    | `components/admin/groups/tab-bar.tsx`              |
| Tab keys + `?tab=` resolver                   | `lib/dashboard/group-list-tabs.ts`                 |
| Pure tab-membership predicates                | `lib/dashboard/group-status.ts`                    |
| `lifecycle_status` → category                 | `lib/dashboard/labels.ts`                          |
| `fetchAllGroups` + `GROUP_COLUMNS`            | `lib/supabase/read-models.ts`                      |
| `GroupsRow` (`lifecycle_status`, `closed_at`) | `types/database.ts`                                |

---

## Domain selection

```
Selected domains:
1. Product — the crux is "is this need already met, and by which control?" — a scope/value call, not a mechanism.
2. UX — tab vs. toggle, and which surface; this is an interaction-model question.
3. Technical (frontend) — any real change is client-side filter state in an existing React shell.
4. Testing — the existing predicates are test-locked; any change must extend, not break, that spec.

Excluded domains:
- Database — no schema, migration, or column change is implied; the column and read already exist.
- Security — no auth/role/RLS change; archived groups are already read under the same admin RLS, and there's no new write or exposure.
- DevOps — no env, infra, flags, or deploy concerns.
- Data/Analytics — no metrics or event tracking in scope.
```

---

## Options

### Option A — Do nothing; point the user at the existing "Archived" tab

The filter exists. If the user is on `/admin/groups`, the feature is the **Archived** tab, deep-linkable at `?tab=archived`, with active tabs already hiding archived groups.

- **Buys:** Zero risk, zero code, immediate. Confirms the actual need.
- **Costs:** Feels like a non-answer if the user genuinely wants a different control or is on a different surface. Possible the tab is just undiscoverable to them — which is itself a finding worth surfacing.

### Option B — Add an "Include archived" toggle that composes _across_ the active tabs

Today archived groups are fully partitioned into their own tab. A toggle would instead let an admin keep their current tab (e.g. "All groups" or "Needs attention") and additively **fold archived groups in or out** of that view.

- **Buys:** A genuinely new capability — "show me everything including archived" without leaving my current bucket. Matches the literal "show/hide toggle" framing.
- **Costs:** Conceptually collides with the existing dedicated Archived tab (two controls expressing overlapping intent). Touches the test-locked `matchesListTab` contract, which currently _guarantees_ non-archived tabs exclude archived groups. Needs care to avoid two ways of saying the same thing.

### Option C — Add the show/hide archived control to a _different_ surface that lacks it

Other group lists exist (e.g. the settings groups catalog / directory, person-detail group pickers). If the user's pain is on one of those, the fix is to add filtering there — but the requirements differ per surface.

- **Buys:** Solves the real pain if `/admin/groups` isn't where they are.
- **Costs:** Can't be planned concretely until we know the surface; each list has its own read/component.

---

## Tradeoffs and recommended path

The single fact that decides this: **one clarifying answer flips the whole plan.** "Which page are you on, and what can't you do today?"

- If the answer is "the main Groups page, and I didn't realize the Archived tab existed" → **Option A**, plus a tiny optional discoverability tweak. No feature work.
- If the answer is "I want to keep my current bucket but also see archived ones inline" → **Option B**. This is the only option that is both new and tractable, so it's the one I've fully specified below.
- If the answer names a different list → **Option C**, re-plan against that surface.

**Recommended:** Ask the one question. **Default assumption (flag if wrong): the user means `/admin/groups` and wants the show/hide behaviour the tab already provides → Option A.** If they confirm they want an additive cross-tab toggle, execute the Option B plan.

**Rejected outright:** introducing a DB `archived` boolean or filtering archived groups out at the read/RPC layer. Archived groups must remain readable (restore depends on it), the column allowlist already includes `lifecycle_status`, and client-side filtering is the established pattern here. No migration. No new RPC. No RLS change.

---

## Implementation plan for Option B (only if the user confirms they want a real toggle)

### Goal

Let an admin on `/admin/groups` optionally include archived groups in the **current** active tab's results via a single show/hide control, without disturbing the dedicated Archived tab.

### Scope

- A binary "Include archived" control (checkbox/toggle) in the directory's control row, near the tab bar / search.
- When **on**, the four active tabs additionally include archived groups that otherwise match; when **off** (default), behaviour is exactly as today.
- The dedicated **Archived** tab is unaffected (it always shows archived only).
- Client-side only.

### Non-goals

- No change to the read, `GROUP_COLUMNS`, RPCs, RLS, or schema.
- No change to the Archived tab's meaning or to archive/restore actions.
- No new surface; `/admin/groups` only.
- No persisted preference unless the user asks (default off each visit keeps it simple and matches "hide by default").

### Assumptions

- (Load-bearing) The user wants _additive_ inclusion across active tabs, not a replacement for the Archived tab. If they actually want "a toggle instead of the tab," that's a different, larger UX change (removing/relabelling the tab) and must be re-confirmed.
- Default state is **off** (archived hidden), matching today's default and the "hide archived" half of the request.

### Proposed approach

Thread one extra piece of client state — `includeArchived: boolean` — through the existing directory filter, and make the _active_-tab predicates honor it. Do **not** rewrite `matchesListTab`'s archived semantics blindly; extend them explicitly so the test spec stays meaningful:

1. Add `includeArchived` state in `groups-directory.tsx` (mirror the existing `tab` / `query` `useState` + `useDeferredValue` pattern; reuse the segmented-control / checkbox styling from `view-controls.tsx`).
2. Change the filter so that for a non-archived tab, a group matches if `matchesListTab(tab, status)` **or** (`includeArchived` **and** `status.lifecycle === "archived"` **and** it would match the tab were it active). Keep the pure rule in `lib/dashboard/group-status.ts` (e.g. a new `matchesListTabIncludingArchived(tab, input, includeArchived)` wrapper) so the contract stays test-locked rather than smeared into the component.
3. Leave the `archived` tab branch untouched; the toggle is a no-op while that tab is selected (and should render disabled there, so the control's irrelevance is visible rather than silently dead).
4. `tabCounts` stays as-is (counts size the bucket, not the current query) — confirm with the user, but I'd leave it.

### Acceptance criteria

- Default load of `/admin/groups`: identical to today (archived hidden on active tabs).
- Toggle on while on "All groups": archived groups appear in the list (dimmed card / archived badge intact).
- Toggle on while on "Needs attention" (etc.): only archived groups that _also_ meet that tab's rule appear.
- "Archived" tab: unchanged regardless of toggle; toggle control is disabled/hidden there.
- Search + sort still compose correctly with the toggle on.
- No `select("*")`, no new read, no write, no RLS/migration touched (the security fitness suite stays green by construction).

### Test plan

- **Unit (Vitest), the cheapest place the real risk lives:** extend `lib/dashboard/__tests__` (the `matchesListTab` spec) to cover the new include-archived wrapper — for each active tab, archived-in vs. archived-out; and assert the Archived tab is invariant to the flag. The reads seam means no live Supabase needed.
- **Component:** directory renders the toggle; toggling re-filters `visible`; toggle disabled on the Archived tab.
- **Unhappy paths:** a group with no status entry (`statusByGroupId` miss) is still excluded; empty result shows the right empty-state copy (search-empty vs. bucket-empty distinction already exists).
- **a11y:** the new control is a labelled, keyboard-reachable input matching the existing radiogroup/checkbox patterns in `view-controls.tsx` (the a11y suite gates this).

### Risks and mitigations

- **Two overlapping controls (tab + toggle) confuse admins.** → Disable the toggle on the Archived tab; consider copy like "Include archived in this view." Re-confirm with the user that both should coexist.
- **Drift from the test-locked spec.** → Keep the new logic as a pure function beside `matchesListTab` with its own tests; don't inline archived semantics into the component.
- **Scope creep into persistence / other surfaces.** → Explicitly out per non-goals.

### Ordered checklist

1. Confirm with the user that Option B (additive cross-tab toggle) is what they want — not the existing tab.
2. Add a pure `matchesListTabIncludingArchived` (or equivalent) in `lib/dashboard/group-status.ts` + unit tests.
3. Add `includeArchived` state + control in `groups-directory.tsx`, styled per `view-controls.tsx`; disable on the Archived tab.
4. Route `visible` filtering through the new predicate.
5. Component + a11y tests.
6. Run `npm run typecheck` and `npm run test:run` (the gating lane).

### Definition of done

On `/admin/groups`, an admin can include or exclude archived groups within any active tab via one accessible control, default off, with the Archived tab and all archive/restore behaviour unchanged, and the unit/a11y/fitness suites green.

---

## The one question that decides everything

> On which page are you looking at groups, and what can't you do there today? On the main **`/admin/groups`** list there's already an **Archived** tab (with active tabs hiding archived groups) — does that cover it, or do you want to keep your current tab and fold archived groups in/out on top of it (or is this a different group list entirely)?

If the answer is "the main page and the tab is fine" → no code, Option A. If "I want it inline on top of my current tab" → Option B plan above. If "a different list" → Option C, re-plan against that surface.

---

## Fresh implementation session prompt

```text
You are implementing the plan below. Follow the execution order. Do not
re-scope unless blocked. Preserve the stated non-goals. Validate against the
acceptance criteria and test plan. Surface blockers before making
architectural changes.

CONTEXT: The /admin/groups list already has an "Archived" tab (the 5th tab in
components/admin/groups/tab-bar.tsx). "Archived" is the groups.lifecycle_status
enum value "closed", mapped by lifecycleCategory() in lib/dashboard/labels.ts —
there is no boolean archived flag. fetchAllGroups (lib/supabase/read-models.ts)
already returns all groups including archived; filtering is client-side in
components/admin/groups-directory.tsx via the pure, test-locked matchesListTab()
in lib/dashboard/group-status.ts. NO database, RLS, RPC, or read change is
needed or wanted.

PRECONDITION: Only proceed if the user has confirmed they want an ADDITIVE
"Include archived" toggle that folds archived groups into the CURRENT active tab
— NOT the existing dedicated Archived tab (which already satisfies plain
show/hide). If unconfirmed, stop and ask.

GOAL: On /admin/groups, an "Include archived" control lets an admin optionally
include archived groups in the current active tab. Default off (archived hidden,
as today). The dedicated Archived tab is unchanged; the toggle is disabled while
it's selected.

SCOPE / NON-GOALS / FILES / APPROACH / ACCEPTANCE / TESTS: as specified in the
"Implementation plan for Option B" section above.

EXECUTION ORDER:
1. Add a pure matchesListTabIncludingArchived (or equivalent wrapper) in
   lib/dashboard/group-status.ts with unit tests in lib/dashboard/__tests__.
2. Add includeArchived state + an accessible control in groups-directory.tsx,
   styled per components/admin/groups/view-controls.tsx; disable it on the
   Archived tab.
3. Route the `visible` filter through the new predicate.
4. Add component + a11y tests.
5. Run `npm run typecheck` and `npm run test:run`; keep both green.

DONE WHEN: an admin can include/exclude archived groups within any active tab
via one accessible, default-off control, with the Archived tab and all
archive/restore behaviour unchanged, and the gating suites green.
```
