# Retro — Admin IM 04 · Group health triage + Editing Pattern reference

_Admin Interaction Model PRD execution step 04 of 17 (#259). Run after the
reference slice, before propagating the pattern to Groups and Follow-ups
(intake → plan → execute → **retro** loop, PRD Sequencing step 2)._

## What shipped

- A reusable **EditingSurface** drawer/sheet
  (`components/lg/admin/editing-surface.tsx`): desktop right-side drawer, mobile
  full-screen sheet (`.lg-m-editing-surface`), focus/keyboard checklist
  delegated to Radix Dialog + explicit focus-restore.
- **Group health is now a triage table**
  (`components/lg/admin/group-health-triage.tsx`): one row per group, no per-row
  save buttons, no inline edit form. Opening a group edits it in the drawer;
  saving affects only that group via the existing audited actions.
- Read model extended with `last_check_in_week` and `last_saved_at`
  (`lib/admin/group-health-read.ts`).
- a11y coverage: the Group health surface is in the gated harness and
  `tests/a11y/group-health.spec.ts` proves the table shape, record-context
  control names, and the full focus/keyboard checklist.

## Documented data fallbacks (no invented placeholder logic)

The triage table is the **ungated shell**; the final filter logic is gated to
step 05. Where a required field had no honest source today, it was omitted with
a reason or derived from a director-approved source — never faked:

| Field / filter                              | Decision                                                                                                                                                                                                                |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Last check-in**                           | Derived from the most recent recorded attendance week (`attendance_sessions`) — the same director-approved source the grade already reads. Null → "—".                                                                  |
| **Attendance trend**                        | Shown as the rolling 8-week average % (the existing computed dimension). The directional arrow ("declining") needs a two-window comparison tied to the gated threshold, so it is **deferred to step 05**, not invented. |
| **Last saved**                              | `group_health_assessments.updated_at`. A live recompute-on-read does not move it; only a save does. Null → "—".                                                                                                         |
| **"Watch" filter**                          | Needs the director's grade/attendance threshold (gated). **Omitted** rather than hard-coded.                                                                                                                            |
| **"Needs follow-up" filter**                | No follow-up/flag column exists on the assessment row — **omitted** with this reason.                                                                                                                                   |
| **"Not assessed" / "Needs rating" filters** | Derivable today with no director input, so they ship as working provisional filters.                                                                                                                                    |

## Notes for propagation (Groups, Follow-ups)

- EditingSurface is the unit to reuse; pass record context into both `title`
  and `closeLabel` so repeated surfaces keep unique accessible names.
- **Keep the surface mounted and toggle `open`** (don't conditionally unmount
  the drawer), matching the existing `AdminMasterCalendarDrawer`. EditingSurface
  itself captures the opener and restores focus on close (Radix only
  auto-restores to a `DialogTrigger`, which list-opened surfaces don't have), so
  consumers get correct focus return for free — they must not re-implement it.
- Guard discard in the consumer: track dirty via the form's `onChange`, gate
  `onRequestClose` with a confirm, and disable any action (e.g. "Save grade
  only") that would persist around unsaved edits.
- The harness + a11y spec are the template: drop the new surface into
  `app/a11y-harness/harness-client.tsx` and assert the same checklist.
- Follow-up (not this slice): `AdminMasterCalendarDrawer` predates EditingSurface
  and duplicates the drawer chrome; fold it into EditingSurface when convenient
  so there is one drawer shell.
