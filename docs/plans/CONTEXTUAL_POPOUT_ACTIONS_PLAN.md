# Plan: Guided, Contextual, Popout Actions for lifegroups

## Context

**Why this exists.** lifegroups is Julian's admin OS for shepherding Life Group
Leaders. Post-pivot (ADR 0016) the spine is Care · Plan · Multiply, with Groups,
People, Settings, and Super-Admin alongside. The app already has a rich set of
server actions (≈45 `admin_*` write actions) and a strong drawer-editing
pattern — but those actions are **unevenly surfaced**. In many places a user is
looking at exactly the thing they want to act on (a leader in the Care
accordion, a group on its detail page, a note in the Notes feed) yet has to
**leave that context** — navigate to a list, open a drawer that only exists on
another page, or detour into a Settings tab — to do the obvious next thing.

**The product goal.** Let users take the relevant action from wherever they are,
based on what they're looking at, without hunting for the right settings tab or
deep-config page. The good news from the audit: **almost every action already
exists as a server action**; the gap is presentation/routing, not new write
paths. This plan is a phased way to close that gap with one reusable contextual
layer rather than 30 bespoke wirings.

**Interpretation of "guided."** The product-goal sentence ("take relevant
actions from wherever they are, based on what they're looking at") scopes
"guided" as **context-aware surfacing of the right action** — not a product-tour
/ coachmark engine. This plan builds the former. A tour engine is called out as
a non-goal (see §6) and as the one open question (§7).

**Guiding principle — not everything is a popout; own the round trip.** A
contextual action does not have to resolve inside a drawer/popover/inline panel.
It is acceptable — sometimes correct — to move the user to the right route,
settings tab, or config flow when that is genuinely the best place to complete
the work. But when the app moves them, it **owns the round trip**:

> Users should be able to start the relevant action from where they are. The app
> may move them to the correct place to complete it, but it must own the round
> trip and return them to the exact context they came from.

The good news (see §3a/§3c): the repo **already has this pattern** — ADR 0027's
`?from=setup` marker (the one live origin), the reusable `BackToSetupLink` /
`isFromSetup` reader (`lib/dashboard/setup-recovery.ts`), and `SetupReturnFocus`
(scroll + focus restoration on return). An older `?from=plan` round-trip has
decayed to an orphaned reader (`GroupsReturnBanner`, no emitter). It is bespoke
today; this plan generalizes it into one `returnTo` convention (and cleans up the
dead `from=plan` reader) rather than inventing a new mechanism.

**Constraints inherited from the repo (must hold):** every write still flows
`validate → guard → RPC → revalidatePath → log` through the narrow
`SECURITY DEFINER` RPCs with a paired `audit_events` row; no direct table
writes; no service-role key in Next runtime; role-based gating only; the two
visibility exceptions (Private Care Note, author-private Care Notes) stay
enforced by RLS and must never leak into leader routes. The contextual layer is
**pure presentation + routing**; it must reuse existing actions, never bypass
them.

---

## 1. Executive Summary

The audit found a consistent shape of friction: **the data and the action live
on different pages.** Three patterns recur:

1. **Read-only list, action on the detail page** — the Care accordion and Notes
   feed show counts and summaries but can't add a Care Note, log an interaction,
   flip transparency, or create a follow-up; you must drill into
   `/admin/shepherd-care/[profileId]`.
2. **Action on the list, not the detail** — group **Edit** and **Archive** live
   only in the Groups list `GroupActionsMenu`; the group **detail** page
   (`/admin/groups/[groupId]`, six tabs of data) has no edit/archive affordance.
3. **Config dead-ends** — picking a value from an admin-managed list (group
   types, health rubric, metric thresholds) drops you into Settings and back.
   Only one place solves this well today — the prospect form's inline "add group
   type" (`adminAddGroupType`). That is the model to generalize.

The repo is **architecturally ready**: `EditingSurface` +
`useEditingDrawer` already give a focus-managed, unsaved-guarded, mobile/desktop
drawer host; `useActionForm` wires forms to server actions; `EmptyState`,
`ConfirmDialog`, `Badge`, and `field-styles` standardize the chrome. What's
missing is (a) a **reusable menu/popover primitive** (today's
`GroupActionsMenu` and `inline-delete` hand-roll portal positioning), (b) a
**shared contextual-action host** so any surface can open the right drawer
without re-owning drawer state, (c) an **entity→actions registry** so "what can
I do to this leader/group/person?" has one answer, and (d) a **creatable
picker** so admin-managed lists can be extended in place.

Recommended path: a small **Phase 0 foundation** (primitive + host + registry +
creatable picker, refactoring the two existing hand-rolled menus onto it with no
behavior change), then **three feature phases** ordered by value-over-cost —
Care inline actions first (highest friction, all actions already exist), then
group detail parity + config-in-context, then cross-surface "act from the
dashboard / candidate card."

---

## 2. Repo Map (relevant files, routes, components)

### Navigation & route ownership

| Concern                          | File                                                                              |
| -------------------------------- | --------------------------------------------------------------------------------- |
| Nav config / areas / role gating | `lib/auth/roles.ts` (`ADMIN_AREAS`, `adminNavGroups`, `navItemsForRole`)          |
| Active-state + alias resolution  | `lib/nav/active-nav.ts`, `lib/nav/route-registry.ts`, `lib/nav/hidden-nav.ts`     |
| App shell / sidebar / topbar     | `components/lg/shell/{LgAppShell,Sidebar,MobileSidebar,TopBar,NavLinkStatus}.tsx` |

### Key surfaces (where friction lives)

| Surface                                            | Route                                              | Shell component                                                                                                           |
| -------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Care (Over-Shepherds·All Leaders·Follow-ups·Notes) | `/admin/care`                                      | `components/admin/care/care-shell.tsx`, `care-accordion.tsx`, `care-leader-panel.tsx`, `notes-feed-shell.tsx`             |
| Care leader detail                                 | `/admin/shepherd-care/[profileId]`                 | `components/admin/shepherd-care/*`                                                                                        |
| Plan / Interest Funnel                             | `/admin/plan`                                      | `components/admin/plan/prospect-board.tsx`, `prospect-create-form.tsx`                                                    |
| Multiply (Readiness·Pipeline·Shepherds)            | `/admin/multiply`                                  | `components/admin/multiply/{multiply-shell,multiply-grid,pipeline-view,lazy-panels}.tsx`                                  |
| Groups list / detail                               | `/admin/groups`, `/admin/groups/[groupId]`         | `group-management-shell.tsx`, `group-detail-shell.tsx`, `group-actions-menu.tsx`, `group-detail/group-roster-manager.tsx` |
| People list / detail                               | `/admin/people`, `/admin/people/[kind]/[personId]` | `people-management-shell.tsx`, `person-detail-shell.tsx`                                                                  |
| Settings (Care·Groups·Multiply·Thresholds·System)  | `/admin/settings?tab=`                             | `settings-shell.tsx`, `settings/lazy-editors.tsx`                                                                         |

### Reusable UX primitives (reuse these — do not reinvent)

| Primitive                                                  | File                                                                     | Role in this plan                   |
| ---------------------------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------- |
| Drawer host (mobile/desktop, focus restore, unsaved scrim) | `components/lg/admin/editing-surface.tsx`                                | The popout container                |
| Drawer state machine (dirty/pending/discard)               | `components/lg/admin/use-editing-drawer.tsx`                             | Wrap once in the shared host        |
| Form↔server-action wiring                                  | `components/admin/forms/action-form.tsx` (`useActionForm`, `FormStatus`) | Every contextual form body          |
| Field styling constants                                    | `components/admin/forms/field-styles.ts`                                 | Visual consistency                  |
| Confirm gate (trigger + controlled)                        | `components/ui/confirm-dialog.tsx`                                       | Archive/destructive confirms        |
| Empty state w/ action slot                                 | `components/ui/empty-state.tsx`                                          | Empty-list CTAs                     |
| Status tones                                               | `components/ui/badge.tsx`                                                | Urgency cues on action chips        |
| **Hand-rolled portal menu**                                | `components/admin/groups/group-actions-menu.tsx`                         | To be replaced by the new primitive |
| **Hand-rolled inline popover**                             | `components/admin/super-admin/inline-delete.tsx`                         | To be replaced by the new primitive |
| **Inline config-add model**                                | `prospect-create-form.tsx` → `adminAddGroupType` (`plan/actions.ts`)     | Generalize into `CreatablePicker`   |

### Action inventory (already exists — surface, don't build)

- **Groups** (`admin/groups/actions.ts`): `adminCreateGroup`, `adminUpdateGroup`, `adminCloseGroup`, `adminReopenGroup`.
- **People** (`admin/people/actions.ts`): `adminCreate{LeaderProfile,Member}`, `adminAssign{Leader,Member}ToGroup`, `adminAddPersonToGroup` (atomic create-and-assign), `adminUnassignLeaderFromGroup`, `adminEndGroupMembership`, `adminChangeLeaderRole`, `adminDeactivate{Profile,Member}`.
- **Shepherd Care** (`admin/shepherd-care/actions.ts`): `adminUpsertShepherdCareProfile`, `adminLogShepherdCareInteraction`, `adminCreateShepherdCareFollowUp`, `adminUpdate/ArchiveShepherdCareFollowUp(+Status)`, `adminUpsertShepherdCarePrivateNote` (the **encrypted SC.4 Private Care Note** — distinct lane), coverage + over-shepherd actions.
- **Care Notes** (`admin/shepherd-care/care-notes-actions.ts`): `adminWriteCareNote`, `adminWritePrayerRequest` — the **author-private** Care Note / Prayer Request lane (this is what OPP-1's "Add Care Note / Prayer" uses, **not** the encrypted private-note action above).
- **Plan** (`admin/plan/actions.ts`): `adminCreateProspect`, `adminTransitionProspect`, `adminUpdateProspect`, `adminSetProspectNextStep`, `adminArchiveProspect`, `adminAddGroupType`.
- **Multiply / Launch / Pipeline**: `adminSetGroupTypeInPipeline` (`multiply/actions.ts`); `adminCreate/UpdateMultiplicationCandidate`, `adminSetGroupCapacityTarget` (`launch-planning/actions.ts`); `adminCreate/Advance/Archive Apprentice` (`leader-pipeline/actions.ts`).
- **Settings** (`admin/settings/actions.ts`): `adminSetGroupTypes`, `adminSetHealthRubric`, `adminUpdateMetricDefaults`, `adminSetReadinessRule`, etc.

**Gaps in the primitive layer:** no shared Popover/DropdownMenu, no Tooltip, no
Toast, no command palette, no tour/coachmark engine. Radix is already a
dependency (`@radix-ui/react-dialog`, `@radix-ui/react-alert-dialog`).

---

## 3. Prioritized Opportunity Inventory

Priority = product value × frequency ÷ cost. Complexity is S/M/L. All actions
referenced already exist unless noted.

### OPP-1 — Care Notes / Prayer / Interaction / Follow-up from the Care list ★ P0

- **Current experience:** Care accordion (`care-accordion.tsx` /
  `care-leader-panel.tsx`) and the Notes feed (`notes-feed-shell.tsx`) show
  counts and summaries ("3 care notes · 2 prayer requests") but are read-only.
- **User friction:** To add a note, log a call/visit, set the next touchpoint,
  flip transparency, or create a follow-up, the user must drill into
  `/admin/shepherd-care/[profileId]`, act, then navigate back to where they
  were scanning — repeated per leader during a triage sweep.
- **Recommended contextual behavior:** A per-leader action affordance (chip
  cluster or menu) on the accordion row / feed item that opens the shared
  contextual drawer pre-bound to that leader: "Add Care Note", "Add Prayer
  Request", "Log interaction", "Set touchpoint", "New follow-up", and the
  transparency toggle (admin-only; never on leader routes).
- **Likely repo location:** `components/admin/care/*`; the note/prayer body lives
  in `components/admin/shepherd-care/care-notes-section.tsx`, the log/status/
  summary body in `components/admin/shepherd-care/care-actions.tsx` — reuse both
  as contextual drawer bodies.
- **Actions (use the correct lanes — these are distinct):**
  - **Care Note / Prayer Request** → `adminWriteCareNote` /
    `adminWritePrayerRequest` (`app/(protected)/admin/shepherd-care/care-notes-actions.ts`),
    the **author-private** lane gated by `auth_is_admin()` + the transparency
    grant. **Not** `adminUpsertShepherdCarePrivateNote`, which is the **separate
    encrypted Private Care Note** (SC.4) lane and must stay out of this flow.
  - **Log interaction** → `adminLogShepherdCareInteraction`; **Set touchpoint /
    status / summary** → `adminUpsertShepherdCareProfile`; **New follow-up** →
    `adminCreateShepherdCareFollowUp`; transparency → `set_note_transparency_grant`
    wrapper.
- **Priority:** P0 · **Complexity:** M · **Dependencies:** Phase-0 host +
  registry. **Unknown:** which actions belong on the _aggregate_ Notes feed item
  vs. the leader row (feed items reference a note's author/subject).
- **Hard dependency — care profile id:** the note, follow-up, and touchpoint
  writes key on `care_profile_id`, but the Care accordion model exposes the
  leader `profileId`. The contextual layer must **resolve (or lazily create) the
  care profile** for that leader before offering these actions — never post the
  subject `profileId` as the `care_profile_id`, or the write fails
  validation/RPC. Treat care-profile resolution as a precondition gate on the
  affordance.
- **Invariant watch:** `admin_private_note` (the encrypted SC.4 note) and
  author-private notes must stay RLS-gated; do not expose transparency UI or the
  private-note lane on `/leader`.

### OPP-2 — Edit & Archive a group from its detail page ★ P0

- **Current experience:** `/admin/groups/[groupId]` shows six tabs of data but
  the only Edit/Archive affordance is the `GroupActionsMenu` on the **list**.
- **User friction:** Reviewing a group, the user must go back to the list, find
  the card/row, open the menu, then act — losing their place in the detail tabs.
- **Recommended contextual behavior:** Put the same action menu (Edit drawer,
  Calendar link, Archive/Restore, Super-Admin delete) in the detail-page header.
- **Likely repo location:** `app/(protected)/admin/groups/[groupId]/page.tsx`,
  `group-detail-shell.tsx`; reuse `group-editor-drawer.tsx`.
- **Actions:** `adminUpdateGroup`, `adminCloseGroup`, `adminReopenGroup`.
- **Priority:** P0 · **Complexity:** S (mostly relocating existing components) ·
  **Dependencies:** Phase-0 menu primitive (or ship interim with existing
  `GroupActionsMenu`). **Unknown:** none material.

### OPP-3 — Inline "create type" in the group create/edit form ★ P0

- **Current experience:** `group-create-form.tsx` group-type picker shows only
  existing types; an empty list is a dead end. The prospect form already solves
  this via `adminAddGroupType`.
- **User friction:** Creating a group with a not-yet-listed type forces
  Settings → add type → back to the form (and you've lost the half-filled form).
- **Recommended contextual behavior:** A `CreatablePicker` (generalized from the
  prospect form) wired to `adminAddGroupType`, used by group create/edit and any
  other group-type select.
- **Likely repo location:** new `components/admin/forms/creatable-picker.tsx`;
  consumers in `group-create-form.tsx`, `group-edit-form.tsx`.
- **Priority:** P0 · **Complexity:** S · **Dependencies:** none (action exists).

### OPP-4 — Create-and-assign a person from the group roster — ALREADY SHIPPED

- **Status:** **Already implemented — not a net-new opportunity.**
  `components/admin/group-detail/group-roster-manager.tsx` already opens an
  "Add person" drawer that renders `LeaderProfileForm` / `MemberForm` with
  `assignToGroup={{ groupId, groupName }}`, and those forms call
  `adminAddPersonToGroup` for the atomic create-and-assign write. No work
  required; listed here only so implementers recognize the shipped pattern (it
  is the model to mirror for OPP-1's care-profile create-on-the-fly). Moved to
  the **already-solved exemplars** list below.

### OPP-5 — Inline readiness toggle on Multiply candidate cards ★ P1

- **Already shipped (do not rebuild):** promoting a potential leader **is**
  done — `pipeline-potential-candidates.tsx` renders a **"Lock in"** button that
  expands `ReadinessChecklist` (status + target year + the five readiness boxes)
  and calls `adminCreateMultiplicationCandidate`. The "add as candidate" /
  lock-in path is complete; mirror it, don't duplicate it.
- **Genuinely missing (the only scope here):** editing readiness on an **already
  locked-in** candidate requires opening the full candidate edit form. There is
  no **inline, optimistic** readiness toggle on the locked-in candidate card.
- **Current experience:** `pipeline-locked-in-candidates.tsx` shows readiness as
  read-only; changing a box means opening the editor.
- **User friction:** A one-checkbox change costs a full drawer round-trip.
- **Recommended contextual behavior:** Inline readiness checkboxes on the
  locked-in candidate card (optimistic, → `adminUpdateMultiplicationCandidate`,
  reconcile + roll back on failure).
- **Likely repo location:** `components/admin/multiply/pipeline-locked-in-candidates.tsx`.
- **Priority:** P1 · **Complexity:** S (narrowed) · **Dependencies:**
  optimistic-update pattern. **Unknown:** whether inline readiness edits should
  confirm before persisting (review with Julian).

### OPP-6 — Act on a person/group from its detail header (parity) ★ P1

- **Current experience:** Person detail and group detail are largely read-only
  views; lifecycle/edit actions live on the lists.
- **User friction:** Same as OPP-2, generalized to people (deactivate, change
  role, end membership) and group sub-actions.
- **Recommended contextual behavior:** A standard `EntityActionMenu` in detail
  headers, driven by the entity→actions registry, so every detail page exposes
  its entity's actions consistently.
- **Likely repo location:** `person-detail-shell.tsx`, `group-detail-shell.tsx`.
- **Actions:** `adminChangeLeaderRole`, `adminDeactivate*`, `adminEndGroupMembership`, group lifecycle.
- **Priority:** P1 · **Complexity:** M · **Dependencies:** registry (Phase 0).

### OPP-7 — Follow-up / next-step from the dashboard attention queue ★ P2

- **Current experience:** Home dashboard surfaces "needs attention" items that
  link out to the owning surface to act.
- **User friction:** Triage starts on the dashboard but every action bounces you
  off it.
- **Recommended contextual behavior:** Attention-queue rows carry the same
  `EntityActionMenu` so the most-likely next action (log touchpoint, create
  follow-up, set prospect next step) happens in place.
- **Likely repo location:** `app/(protected)/admin/page.tsx`, care attention
  queue components.
- **Priority:** P2 · **Complexity:** M · **Dependencies:** OPP-1/-5 bodies exist.

### OPP-8 — Config "peek" from where the consequence shows ★ P2

- **Current experience:** Capacity warnings and health grades render the _result_
  of thresholds/rubrics, but the config lives in `/admin/settings`.
- **User friction:** To understand or adjust why something is flagged, the user
  leaves to Settings and loses the row.
- **Recommended contextual behavior (two cleanly separated parts):**
  1. **Read-only peek** — a lightweight popover next to the badge that _explains_
     the governing rule (no inline editing of global config).
  2. **"Edit rule" → redirect-and-return** — routes to the **existing Settings
     rubric/threshold editor** (`adminSetHealthRubric` / `adminUpdateMetricDefaults`
     on `/admin/settings`), edits happen on that audited page, then returns to
     the origin. Editing global config from an inline popover is a **non-goal**
     (§6); the only sanctioned edit path is the round-trip to Settings.
- **Likely repo location:** group detail health/overview tabs, care grade UI.
- **Priority:** P2 · **Complexity:** M/L · **Dependencies:** menu primitive +
  `returnTo` convention. **Unknown:** none material now that the edit path is the
  Settings round-trip, not inline global-config editing.

### Already-solved exemplars (do not rebuild — mirror them)

- Inline group-roster assign/remove **and create-and-assign** (`group-roster-manager.tsx`
  → `LeaderProfileForm`/`MemberForm` with `assignToGroup` → `adminAddPersonToGroup`)
  — this is OPP-4, already shipped.
- Inline "add group type" in prospect form (`adminAddGroupType`).
- Group health grade edit from group detail (`group-health-edit-button.tsx`).
- Multiply "Lock in" — promote a potential leader to a locked-in candidate
  (`pipeline-potential-candidates.tsx` → `ReadinessChecklist` →
  `adminCreateMultiplicationCandidate`) — the "add as candidate" half of OPP-5,
  already shipped.

---

## 3a. Interaction Model per Opportunity

Each opportunity gets the _lightest_ model that keeps the user in context. Most
are inline/drawer (because the host + actions already exist); redirect-and-return
is reserved for actions that genuinely belong on a dedicated config/admin route.

| Opp                                       | Recommended model                                                               | Why this model (not the others)                                                                                                                                             |
| ----------------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OPP-1 Care notes/prayer/log/follow-up     | **Drawer** (shared host) + **object-specific action menu** on the row           | Note/prayer body (`care-notes-section.tsx`) + log/status body (`care-actions.tsx`) already render in drawers; per-leader menu picks which (resolve `care_profile_id` first) |
| OPP-2 Group edit / archive from detail    | **Drawer** (edit) + **action menu** (archive via `ConfirmDialog`)               | Reuse `group-editor-drawer.tsx`; archive is a confirm, not a page                                                                                                           |
| OPP-3 Create group type in form           | **Inline action** (`CreatablePicker`)                                           | Single value append — never worth leaving the form                                                                                                                          |
| OPP-3b _Manage/rename/remove_ group types | **Redirect-and-return** → Settings › Groups                                     | List management is destructive/bulk; belongs on the real editor, then return                                                                                                |
| OPP-4 Create-and-assign person to roster  | _(already shipped — inline popout form)_                                        | Done: `group-roster-manager.tsx` add-person drawer → `adminAddPersonToGroup`                                                                                                |
| OPP-5 Inline readiness toggle (locked-in) | **Inline action** (optimistic)                                                  | Single-checkbox edit; "Lock in" promotion already exists, so only the inline toggle is new                                                                                  |
| OPP-6 Person/group detail header actions  | **Object-specific action menu** (registry-driven) + drawer/confirm bodies       | One consistent menu per entity; bodies reuse existing forms                                                                                                                 |
| OPP-7 Dashboard attention-queue actions   | **Action menu** → drawer body, **in place**                                     | Triage must not bounce off the dashboard                                                                                                                                    |
| OPP-8 Config "why?" from a badge          | **Popover** (read-only peek) + **redirect-and-return** ("Edit rule" → Settings) | Peek answers "why"; editing global config belongs on Settings, then return                                                                                                  |

**Guided flow / command-palette models** are intentionally _not_ assigned to any
opportunity in this plan (see §6 non-goals); the registry built here is what
would make a palette cheap later.

## 3b. Redirect-and-Return Requirements

Two opportunities use redirect-and-return: **OPP-3b** (manage group-type list)
and **OPP-8** (edit a rubric/threshold from where its consequence shows). Both
are modeled on the existing `?from=` convention.

**OPP-3b — Manage group types from a group form**

- **Origin route:** `/admin/groups` (group create/edit drawer). _Note: an older
  `from=plan` round-trip is now orphaned — `GroupsReturnBanner` still reads the
  marker but no surface emits it anymore (the Plan prospect form moved to the
  inline `GroupTypePicker`). This flow introduces a fresh `from=groups` origin
  rather than reviving the dead `from=plan` path._
- **Destination route:** `/admin/settings?tab=groups&from=groups`.
- **Context to preserve:** the originating route + that the user came to _manage
  types_; **any half-filled group form must survive the trip** (the one real
  state-preservation cost here).
- **Mechanism:** `from=<origin>` **query param** carries the return target
  (mirrors `FROM_SETUP_PARAM`). Unsaved form draft → **sessionStorage** keyed by
  a draft id passed in the URL (the only case needing more than a query param),
  reusing the `use-persisted-view-state` storage approach.
- **Completion:** on save in Settings, the existing `GroupsReturnBanner`-style
  affordance routes back to origin; the group form rehydrates from the draft and
  the new type is selectable.
- **Cancel / abandon:** the return affordance ("← Back to …") is always present;
  leaving without saving still returns and rehydrates the draft (no data loss).
- **Error:** Settings save errors surface via the existing inline `FormStatus`;
  the return affordance stays available so the user is never stranded.
- **Return target granularity:** same route, **same drawer reopened**, same form
  values (via draft), focus returned to the group-type field.
- **Signaling the move:** the destination renders a return banner ("← Back to the
  group you were editing"); we do _not_ silently dump the user into Settings.

**OPP-8 — Edit a rubric/threshold from a badge**

- **Origin route:** e.g. `/admin/groups/[groupId]?tab=health` (or a Care grade UI).
- **Destination route:** `/admin/settings?tab=care&from=group-health` (rubric) or
  `?tab=thresholds&from=...`.
- **Context to preserve:** origin route, **active tab, scroll position, and the
  specific group/row** the badge belonged to.
- **Mechanism:** `from=<origin>` query param for the return path; tab + item id
  already expressible as query params (the app's standard UI-state channel);
  scroll/focus restoration reuses the **`SetupReturnFocus` pattern** (a one-shot
  mount effect that `scrollIntoView` + `focus` a `targetId`).
- **Completion:** save → return affordance routes to origin route+tab; the badge
  now reflects the new rule.
- **Cancel:** return affordance routes back with no change.
- **Error:** inline `FormStatus`; user stays put until resolved, return link live.
- **Return target granularity:** same item, **same tab, same scroll position**,
  focus on the badge/row that triggered the trip.
- **Signaling the move:** return banner on the Settings tab naming where they'll
  go back to. Phase-3 may keep OPP-8 **read-only peek + deep link** first (lowest
  risk) and add editing later.

Because there is no toast system today, "Saved, returning you to where you were"
is communicated by the **return affordance/banner at the destination** plus the
restored focus on arrival — not a transient toast (a toaster is a non-goal, §6).

## 3c. Repo-Specific Support (what already exists)

The redirect-and-return pattern is **already implemented, just not generalized**:

| Capability                          | Exists?                   | Where                                                                                                                                                                                                    |
| ----------------------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `from`/`returnTo` param convention  | **Yes (one live origin)** | `?from=setup` is the only **live** marker (emitter + reader); `FROM_SETUP_PARAM`/`FROM_SETUP_VALUE` + `isFromSetup()` in `lib/dashboard/setup-recovery.ts`, `components/lg/admin/back-to-setup-link.tsx` |
| Return affordance/banner            | **Yes (bespoke)**         | `BackToSetupLink`; `components/admin/settings/groups-return-banner.tsx` reads `from=plan` but is **orphaned** (no emitter — Plan moved to inline `GroupTypePicker`)                                      |
| Scroll/focus restoration on return  | **Yes**                   | `components/lg/admin/dashboard/SetupReturnFocus.tsx`, `SetupRecoveryChecklist` (re-focus next step)                                                                                                      |
| Deep-link decoration helper         | **Yes**                   | `lib/dashboard/setup-recovery.ts` (decorates step hrefs with `from=setup`)                                                                                                                               |
| Query-param UI state                | **Yes (pervasive)**       | `?tab=` (Settings, Multiply), Care `?view=/?filter=/?coverage=`, Home `?period=`, Groups `?tab=&from=setup`                                                                                              |
| State persistence across nav        | **Partial**               | `lib/hooks/use-persisted-view-state.ts` (localStorage for filters/view); **no draft-form persistence yet**                                                                                               |
| Route guards                        | **Yes**                   | `requireAdmin`/`requireOverShepherd`/`requireLeader` (`lib/auth/*`) — destinations stay gated                                                                                                            |
| Existing config destinations        | **Yes**                   | `/admin/settings?tab={care,groups,multiply,thresholds,system}` already deep-linkable                                                                                                                     |
| Modal routes / layout-level drawers | **No**                    | drawers are component-state (`EditingSurface`), not URL-addressable routes                                                                                                                               |
| Toast / completion message          | **No**                    | inline `FormStatus` only; ADR 0027 chose return-affordance + focus over toasts                                                                                                                           |
| Wizard / multi-step flows           | **No**                    | none                                                                                                                                                                                                     |

**Verdict:** the repo **already supports redirect-and-return** — the setup chain
(`from=setup`) is the one fully-live origin, with reusable focus-restoration
(`SetupReturnFocus`); the `from=plan` round-trip has decayed to an orphaned
reader (`GroupsReturnBanner`) with no emitter. The gap is that the live origin
**hand-rolls** its marker value and its own return banner. The plan should
**generalize this into one `returnTo` convention + one return-banner component**,
either retiring or re-homing the dead `from=plan` reader as part of Phase 0 — not
introduce a new mechanism. The only net-new capability needed is
**unsaved-form-draft persistence** (sessionStorage) for OPP-3b — and only there.

---

## 4. Recommended Architecture Direction

A thin **Contextual Action layer** composed of four reusable pieces, all built
on existing primitives. It owns _presentation and routing only_; writes stay on
the established server-action pipeline.

**A. Menu/Popover primitive — `components/ui/{dropdown-menu,popover}.tsx`.**
Wrap Radix (`@radix-ui/react-dropdown-menu` / `react-popover`, siblings of the
dialog package already used). Replace the hand-rolled portal/positioning in
`group-actions-menu.tsx` and `super-admin/inline-delete.tsx` with no behavior
change. This removes bespoke viewport math and gives one accessible,
keyboard-correct menu everywhere. _Acceptance gate: the a11y suite stays green
and the two refactored menus behave identically._

**B. Shared contextual-action host — `ContextualActionProvider` +
`useContextualAction()`.** A React context mounted once in the admin shell that
internally owns a single `EditingSurface` driven by `useEditingDrawer`. Any
surface calls `openAction({ entity, action })` to render the right form body in
the drawer — so the Care accordion, Notes feed, dashboard queue, and detail
pages do **not** each re-implement drawer state. Reuse the existing
`care-actions.tsx` and `group-editor-drawer.tsx` bodies as the first registered
forms. This is the load-bearing piece: it's what makes "act from anywhere"
cheap.

**C. Entity→actions registry — `lib/admin/contextual-actions.ts`.** A typed map
from entity kind (`group | leader | person | prospect | over_shepherd | candidate
| follow_up`) to its available actions: label, icon, role gate, destructive
flag, and which drawer body / server action to invoke. `EntityActionMenu` and
empty-state CTAs read from it, so "what can I do to this thing?" has one
answer and role-gating lives in one place (reusing `lib/auth/roles.ts` checks).
Keeps the visibility exceptions centralized (e.g. transparency actions are
admin-only and absent on leader entities).

**D. Creatable picker — `components/admin/forms/creatable-picker.tsx`.**
Generalize the prospect form's inline add so any select bound to an
admin-managed list can append a value in place (initially group types via
`adminAddGroupType`). Resolves the config dead-ends without a new write path.

**E. Reusable redirect-and-return convention — generalize ADR 0027.** Promote
the live `from=setup` marker into one convention so any surface can hand off and
get the user back, and clean up the orphaned `from=plan` reader in the same pass.
Concretely:

- **One `returnTo` param convention** in `lib/nav/return-to.ts` (sibling to the
  existing `setup-recovery.ts`): an encoder/decoder for `from=<originKey>` plus
  the resolved return href (route + tab + item id), and an `isReturning()` reader
  generalizing `isFromSetup()`. Origin keys are a closed union (typed), gated by
  the same route guards.
- **One `<ReturnBanner originKey>` component** generalizing `BackToSetupLink` /
  `GroupsReturnBanner` — reads the param, renders nothing on a normal visit,
  routes back on click.
- **Reuse `SetupReturnFocus`** (rename/relocate to `lib/nav` as a generic
  `ReturnFocus`) for scroll + focus restoration of the originating item.
- **A small draft store** (`lib/nav/draft-store.ts`, sessionStorage) **only**
  for OPP-3b's unsaved group-form case, keyed by a draft id in the URL — built on
  the same storage approach as `use-persisted-view-state`. Most flows need no
  draft (they return to a navigational position, not unsaved input).

This keeps redirect-and-return a _first-class, reusable_ model alongside the
drawer host — the registry (C) records, per action, whether it resolves inline /
in-drawer / via redirect-and-return, so the affordance is chosen consistently.

**Why this shape:** it maximizes reuse (EditingSurface, useEditingDrawer,
useActionForm, ConfirmDialog, EmptyState, field-styles already exist), centralizes
the two things that are currently copy-pasted (menu positioning, drawer state),
and keeps every write on the audited RPC pipeline. The registry + host let later
opportunities (OPP-6/-7) be ~config additions rather than new plumbing.

**Explicitly client-only & presentation-only:** no new RPCs, no schema changes,
no new RLS. The fitness suite (`tests/fitness/**`) continues to enforce
no-direct-writes / no-service-role / run-action routing; this layer must pass it
unchanged.

---

## 5. Phased Roadmap (with acceptance criteria)

### Phase 0 — Foundation (enables everything; no user-visible feature)

**Scope:** menu/popover primitive (A), refactor `group-actions-menu.tsx` +
`inline-delete.tsx` onto it, `ContextualActionProvider`/`useContextualAction`
(B) wrapping one shared `EditingSurface`, the registry skeleton (C),
`CreatablePicker` (D), and the **`returnTo` convention (E)** —
`lib/nav/return-to.ts` + generic `<ReturnBanner>` + `ReturnFocus`, refactoring
the live `from=setup` callers onto it with no behavior change and retiring the
orphaned `from=plan` reader (`GroupsReturnBanner`).
**Acceptance:**

- New `ui/dropdown-menu` + `ui/popover` exist; the two prior hand-rolled menus
  use them with byte-equivalent behavior (open/close, keyboard, positioning).
- `ContextualActionProvider` mounted in the admin shell; a throwaway demo button
  can open a registered action drawer for a sample entity.
- `BackToSetupLink` is reimplemented on the generic `returnTo` convention and its
  existing tests (`back-to-setup-link.test.tsx`, `setup-recovery.test.ts`) stay
  green; the dead `from=plan` reader is removed (or re-homed onto the new
  convention if Phase 1's `from=groups` flow is brought forward).
- `npm run lint`, `npm run typecheck`, `npm run test:run`, and `npm run
test:a11y` all green; fitness suite unchanged.

### Phase 1 — Care inline actions + group-detail parity + first return flow

**Scope:** OPP-1 (Care list/feed actions), OPP-2 (group detail edit/archive),
OPP-3 (creatable group-type in group forms), and **one low-risk
redirect-and-return flow: "Edit rubric" from the group detail health tab →
Settings → back**. This is OPP-8's **edit half** and is deliberately _not_ the
risky inline-edit: the link routes to the **existing, audited Settings rubric
editor** (the legitimate place to change global config), edits happen there, and
the user is returned — it never edits global config from an inline popover (that
stays a non-goal). It is chosen as the Phase-1 return-flow demonstrator because
it needs **no draft persistence** (the origin is a navigational position, not
unsaved input). OPP-8's **read-only inline peek** lands later in Phase 3; the two
halves are complementary, not contradictory.
**Acceptance (contextual actions):**

- From the Care accordion row and a Notes-feed item, a user can add a Care Note,
  add a Prayer Request, log an interaction, set next touchpoint, and create a
  follow-up without leaving `/admin/care`; lists revalidate in place.
- Transparency toggle appears for admins on the Care row and **never** renders
  on `/leader` routes; `admin_private_note` remains unreadable per RLS (verified
  by existing tests/manual check).
- `/admin/groups/[groupId]` header exposes Edit (drawer), Archive/Restore, and
  (super-admin) Delete; acting returns the user to the same detail tab.
- Creating a group with a brand-new type works entirely within the create form.
  **Acceptance (redirect-and-return flow):**
- The user can **start** the action ("Edit rubric") from the group's health tab.
- The app **routes them** to `/admin/settings?tab=care&from=group-health&group=<id>`
  and the destination shows a `<ReturnBanner>` naming where they'll return to.
- The user can **complete** (save) or **cancel**; either way the return
  affordance is present and never strands them.
- On return they land on the **same group, same health tab, same scroll
  position**, focus restored to the rule/badge they came from (via `ReturnFocus`).
- The flow **reads as intentional** (titled return banner), not a dump into
  Settings.
- All four CI lanes green; new component tests colocated under `__tests__/`,
  including a test asserting the return href round-trips the origin context.

### Phase 2 — Inline readiness toggle, detail parity, draft-return

**Scope:** OPP-5 (inline readiness toggle on locked-in candidate cards — note
OPP-4 and the OPP-5 "Lock in" promotion are **already shipped**, so neither is in
scope), OPP-6, and **OPP-3b** (manage group types via redirect-and-return _with_
unsaved-form-draft persistence — the harder return flow, deferred here so the
draft store lands once and is proven).
**Acceptance:**

- Locked-in candidate cards (`pipeline-locked-in-candidates.tsx`) toggle
  readiness inline via `adminUpdateMultiplicationCandidate` with optimistic UI +
  error rollback — without opening the candidate editor.
- Person and group detail headers render `EntityActionMenu` from the registry;
  role gating matches `lib/auth/roles.ts`.
- From a half-filled group create/edit form, "Manage group types" routes to
  Settings › Groups with a `<ReturnBanner>`; on return the **drawer reopens with
  every field restored** and the newly managed types selectable — verified by a
  test that round-trips a draft through sessionStorage.
- CI green.

### Phase 3 — Cross-surface triage + config peeks

**Scope:** OPP-7 (dashboard attention-queue actions), OPP-8 **read-only peek
half** (the inline popover that explains the rule; the **edit** round-trip
already shipped in Phase 1, so this phase adds only the read-only peek + deep
link reusing the Phase-1 return flow).
**Acceptance:**

- Dashboard attention items expose their most-likely next action in place.
- A capacity/health badge offers a "why?" peek showing the governing
  threshold/rubric (read-only) with a deep link that reuses the Phase-1
  `returnTo` round-trip to the Settings editor.
- CI green; measure DOM-node/perf deltas via the existing
  `tests/a11y/perf-harness.spec.ts` to confirm the shared host didn't bloat
  surfaces.

---

## 6. Non-Goals & Overengineering Risks

**Non-goals (this plan deliberately excludes):**

- A **product-tour / coachmark / onboarding-walkthrough engine** (spotlights,
  step sequencing, "next/skip"). "Guided" here means context-aware action
  surfacing, not tours.
- A **command palette / global keyboard launcher** (⌘K). Tempting but orthogonal
  to "act on what you're looking at"; revisit only after the registry exists
  (it would make a palette cheap later).
- A **toast/notification system** — keep the existing inline `FormStatus`
  success/error line; the "Saved, returning you to where you were" signal is the
  destination's `<ReturnBanner>` + restored focus on arrival (the ADR 0027
  choice), **not** a new global toaster.
- **URL-addressable modal/drawer routes** — drawers stay component-state via the
  shared host; redirect-and-return uses query-param markers, not parallel modal
  routes.
- **New write paths, RPCs, schema, or RLS.** Every action already exists; this
  is surfacing only.
- Editing **global** config (rubrics/thresholds) from a single entity's context
  by default — read-only peek + deep link first (see §7).

**Overengineering risks to actively avoid:**

- _Registry over-abstraction._ Don't model every conceivable action up front;
  register actions as phases need them. The registry earns its keep at ~3+
  surfaces, not on day one.
- _A second drawer system._ Reuse `EditingSurface`/`useEditingDrawer` — do not
  fork a parallel modal stack. One host, many bodies.
- _Z-index / stacking regressions._ The app has defined layers (`z-dropdown`,
  `z-overlay`, `z-drawer`, `z-alert`); the new primitive must slot into them,
  not invent new ones.
- _Optimistic UI without rollback._ Inline toggles (OPP-5) must reconcile with
  the server result and revert on failure, or they'll misreport state — the
  same "false zero" failure mode the read path already guards against.
- _Leaking visibility exceptions._ The contextual layer touches Care; a careless
  registry entry could surface `admin_private_note` or transparency controls on
  a leader surface. Gate in the registry **and** rely on RLS as the backstop.
- _Over-using redirect-and-return._ Default to inline/drawer; only redirect when
  the work genuinely belongs on a dedicated route (list management, global
  config). A redirect that could have been a drawer is a regression, not a
  feature.
- _Reinventing the return mechanism._ Generalize ADR 0027's existing `from=`
  markers and `SetupReturnFocus` — do not add a second, competing navigation-state
  system. One `returnTo` convention, one `<ReturnBanner>`, one `ReturnFocus`.
- _Draft-store sprawl._ sessionStorage form drafts exist for exactly one case
  (OPP-3b). Don't persist every form; most returns restore a navigational
  position, not unsaved input.

---

## 7. Open Questions (only the blocking one)

1. **Does "guided" include a tour/coachmark engine, or only context-aware action
   surfacing?** This plan assumes the latter (the product-goal sentence points
   there) and treats a tour engine as a non-goal. _Recommended default:
   context-aware surfacing now; defer any tour engine._ If Julian actually wants
   first-run walkthroughs, that's a separate, larger track and the roadmap above
   would gain a Phase 4 rather than change Phases 0–3.

Everything else has a sensible repo-grounded default and is noted inline (e.g.
config peeks start read-only; inline readiness-edit confirmation is a Phase-2
review point with Julian) — none block starting Phase 0.

---

## Verification (when implementation begins)

- Run `npm run lint && npm run typecheck && npm run test:run` (the gated lane,
  also enforced by the pre-commit hook) plus `npm run test:a11y` after each
  phase.
- Add colocated component tests under `**/__tests__/**` for each new contextual
  surface, injecting in-memory reads via the reads seam (no live Supabase).
- Manually verify the visibility exceptions: confirm transparency/private-note
  controls are absent on `/leader/*` and that `admin_private_note` stays
  unreadable to non-admin sessions.
- Use `tests/a11y/perf-harness.spec.ts` against `/a11y-harness` to confirm the
  shared contextual host doesn't inflate DOM-node counts on Care/Groups.
- Confirm the fitness suite (`tests/fitness/**`) still passes — proof the layer
  added no direct writes, no service-role usage, and no new RPC bypass.
