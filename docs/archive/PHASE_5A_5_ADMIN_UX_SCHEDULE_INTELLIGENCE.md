# Phase 5A.5 · Admin UX + group schedule intelligence

Phase that paves the way for the Phase 5C.1 privacy hardening by tidying
admin usability and grounding check-in due dates in each group's actual
meeting cadence.

## Deliverables

### 1. Meeting schedule fields (already shipped in Phase 5A.5 prep, hardened here)

- `groups.meeting_day` is a Sunday-Saturday dropdown (no free text). The
  Phase 5A.5 migration added the `groups_meeting_day_canonical` CHECK
  constraint and a backfill pass that maps abbreviations / plurals to
  the canonical Capitalized day name.
- `groups.meeting_time` (`time` column) is a `<input type="time">` field
  on both the create and edit forms.
- `groups.meeting_frequency` is a `meeting_frequency` enum
  (`weekly | biweekly | monthly`). Default `weekly`. Existing rows
  backfilled to `weekly`.
- `groups.meeting_week_parity` is a nullable `meeting_week_parity` enum
  (`odd | even`). The CHECK
  `groups_meeting_week_parity_only_biweekly` enforces parity is null
  unless frequency is `biweekly`; the RPC layer also coerces parity to
  null for weekly/monthly groups defensively.
- Parity field is hidden in the UI unless `Bi-weekly` is selected; helper
  copy reads "Used for bi-weekly groups only. Odd/even is based on the
  calendar week number."
- The `admin_create_group` / `admin_update_group` RPCs accept the new
  frequency + parity parameters, audit the change, and remain the only
  write path on `public.groups`.

### 2. Group edit UX

- `groups-directory.tsx`:
  - **Edit** is the only normal-state action button on each card. It's
    the prominent terra-toned button next to the badges.
  - Stats and description are hidden while editing so the edit form
    doesn't stack underneath duplicate information.
  - While editing, the card surface shifts to `P.bg` with a terra border
    and an "Editing" chip so the operator can see at a glance which
    card is in edit mode.
  - **Archive group** lives in a clearly-separate panel below the form,
    labeled "Lifecycle · separate from edit" with explanatory copy
    ("This is not the same as cancelling your edit above.").
- `group-edit-form.tsx`:
  - Save changes (terra) + Cancel (ghost) sit on a horizontal row above
    the lifecycle panel; the prior "Lifecycle actions move below"
    hand-wavy hint was removed.
  - Bi-weekly parity helper updated to the requested copy.
- `group-create-form.tsx`: same helper copy update.
- No "Close" verb is used anywhere as a destructive shortcut. The
  underlying RPC is still `admin_close_group`; the UI surface calls it
  "Archive".

### 3. Check-in due dates are group-specific

- New module `lib/admin/check-in-due.ts` exposes `computeCheckInDue`,
  `formatCheckInDueLabel`, and `formatCheckInDueRelative`.
  - "Due" = most recent occurrence of the group's `meeting_day` at
    `meeting_time` (church-local, America/Chicago) + the configured
    offset hours.
  - Falls back to `null` when meeting_day or meeting_time isn't set, so
    surfaces that need them can degrade gracefully.
- New global setting `metric_defaults.check_in_due_offset_hours`
  (default **24**). Editable from `/admin/settings`.
- New per-group override
  `group_metric_settings.check_in_due_offset_hours_override` (0..336
  hours, null = follow global). Editable from `/admin/settings`
  in the per-group overrides section.
- Admin dashboard attention list, admin check-ins review, and the
  leader check-in screen all call the same helper:
  - Admin reads use the per-group override when present.
  - Leader reads always pass `override: null` because
    `group_metric_settings` is admin-only via RLS. Documented in
    `app/(protected)/leader/[groupId]/checkin/page.tsx`.
- Worked examples from the brief:
  - Sunday 6 PM group, 24h offset → due Monday 6 PM.
  - Wednesday 7 PM group, 24h offset → due Thursday 7 PM.
  - Saturday 9 AM group, 36h offset → due Sunday 9 PM.
- Legacy `check_in_due_day_of_week` is retained on the settings row but
  marked "(legacy)" in the form. No surface still uses it for due-date
  computation; it stays for backwards-compat / future per-tenant tuning.

### 4. Reset defaults in `/admin/settings`

- New SECURITY DEFINER RPC `admin_reset_metric_defaults()`. Restores the
  documented baseline (mirrors `BUILT_IN_METRIC_DEFAULTS` in
  `lib/admin/metrics.ts`) and writes an `audit_events` row in the same
  transaction. Per-group overrides are **not** touched; the UI says so
  on the button hint and in the confirm dialog.
- New action `adminResetMetricDefaults` in
  `app/(protected)/admin/settings/actions.ts`.
- New `ResetMetricDefaultsButton` client component, wired into the
  global defaults card. Uses `window.confirm` before submitting.
- Success / error states render under the button. Both `revalidatePath`
  the settings, groups, admin, and leader paths so the new offset flows
  through immediately.
- The reset action is audited as `admin.reset_metric_defaults` and is
  visible only to super_admin via `/admin/super-admin` (RLS unchanged).

### 5. `/admin` dashboard declutter

- `components/dashboard/admin/admin-dashboard.tsx` rewritten as a
  command-center summary:
  - Summary cards (high-level stats).
  - Week selector.
  - **Attention list** capped at 6 items (was 12), with "see all in
    Groups" + "review check-ins" drill-down links surfaced inline.
  - Six concise `DrillDownCard`s: Capacity / Health / Setup gaps /
    Guests / Follow-ups / Settings — each shows 3-4 headline numbers
    and a CTA to its full page.
- The bulky `CapacitySection`, `HealthSection`, `SetupGapsSection`,
  `GuestPipelineSection`, `FollowUpsSection` components were deleted
  (no other consumer); their detail belongs on
  `/admin/groups`, `/admin/check-ins`, `/admin/guests`, and
  `/admin/follow-ups`.
- The "Export week / Send nudges" disabled buttons (and their long
  helper note) were removed from the admin header to slim the chrome.

### 6. Preview behavior

- `/admin-preview` and `/leader-preview` continue to render exclusively
  from `ADMIN_FALLBACK` / `LEADER_FALLBACK` (`lib/dashboard/fallback-data.ts`)
  and do not touch Supabase.
- The fallback `AttentionItem` rows were extended with the new
  `dueLabel` / `dueRelative` / `isOverdue` fields so the preview still
  renders cleanly. The Westside Families fallback (Sunday 5 PM group,
  missing check-in) now shows "Overdue · was due Monday, May 18 at
  5:00 PM" so the preview demonstrates the new behavior.
- `LeaderGroupCard` (preview's view) was unchanged.

## Migrations

- `supabase/migrations/20260518130000_phase5a5_check_in_due_offset_and_reset.sql`
  - Adds `group_metric_settings.check_in_due_offset_hours_override`
    column + CHECK 0..336.
  - Seeds `check_in_due_offset_hours = 24` into
    `app_settings.metric_defaults` if missing (repair-merge).
  - Extends `admin_update_metric_defaults(jsonb)` whitelist + bounds.
  - Adds new RPC `admin_reset_metric_defaults()`.
  - Drops & recreates `admin_upsert_group_metric_settings(...)` with
    a new 8th parameter `p_check_in_due_offset_hours_override`.
  - All grants follow the Phase 5A.2 pattern (revoke from
    public/anon/authenticated, grant execute to authenticated only;
    body enforces `auth_is_admin()`).

The Phase 5A.5 group meeting schedule migration
(`20260518120000_phase5a5_group_meeting_schedule.sql`) already added
the meeting cadence schema; this phase's migration extends only the
settings / overrides surface.

## Architecture compliance

- ✅ No `service_role` / `SERVICE_ROLE` / `supabaseAdmin` usage in app
  code.
- ✅ All writes flow through SECURITY DEFINER RPCs
  (`admin_create_group`, `admin_update_group`, `admin_close_group`,
  `admin_reopen_group`, `admin_update_metric_defaults`,
  `admin_reset_metric_defaults`,
  `admin_upsert_group_metric_settings`). No new INSERT / UPDATE /
  DELETE policies were added.
- ✅ Every write pairs with an `audit_events` row in the same
  transaction.
- ✅ No hard deletes.
- ✅ `admin_private_note` is not surfaced on any leader-facing route or
  fallback payload.
- ✅ Audit logs (including `admin.reset_metric_defaults`) remain
  visible only to super_admin via `/admin/super-admin`.
- ✅ `staff_viewer` is not revived as an active product role.
- ✅ Preview routes still depend only on fallback data.

## Known limitations / follow-ups

- The check-in due-date helper uses church-local wall-clock minutes
  for relative arithmetic. Around DST transitions, the relative
  display ("due in 24h") may be off by ±1 hour during the transition
  window. Acceptable for "due 24 hours after the meeting" messaging;
  if minute-precision matters later, swap to a proper timezone library.
- Monthly meeting frequency is captured but the "due" computation
  treats it like weekly anchored on the meeting_day (most recent
  occurrence). A richer monthly recurrence engine — day-of-month
  vs. nth-weekday-of-month — would need an additional field; out of
  scope here.
- Per-group overrides are admin-only (RLS), so the leader check-in
  page renders due-dates using the global default offset only. The
  admin dashboard / admin check-ins surface use both. Same helper,
  same logic — just different override input.
- Legacy `check_in_due_day_of_week` is no longer consulted by any
  due-date calculation, but it remains on the metric_defaults row
  (and in the form, marked "legacy") in case a future ministry-wide
  reminder cadence needs it.

## Automated checks

- `npm run lint` — passes, no warnings or errors.
- `npm run typecheck` — passes, no errors.
- `npm test` — no test script defined in `package.json`. Documented.
- `npm run build` — succeeds; all 17 routes compile.

## Security grep results

| Pattern | Result |
| --- | --- |
| `service_role` / `SERVICE_ROLE` / `supabaseAdmin` in app/lib/components | 0 hits |
| `admin_private_note` in leader-facing files | 0 read sites; only defensive doc comments |
| `staff_viewer` reintroduced as active role | none — still gated out in `roles.ts` and `validation.ts` |
| `delete from groups` / direct hard-delete patterns in SQL | none |
| `.from('groups').delete()` (or app_settings) | none |
| New write policies on groups / app_settings / group_metric_settings | none — RPC is the only write path |
| Leader page imports `admin_metric_notes`-bearing helpers | none |
