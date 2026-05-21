# Phase 5C.0 — Guest pipeline + follow-up foundation

## Context

Phase 6.0 rebuilt `/admin` as a read-only ministry command center, but
Julian still had no structured place to track new people from "first
visit" through "placed in a group," and leaders had no way to see or
close follow-up tasks tied to their groups. Guests could only be added
via SQL, and follow-ups had no UI at all. Phase 5C.0 introduces the
first manual workflow for both:

- A ministry admin can add a guest, walk them through a seven-stage
  pipeline, and assign them to a group and a follow-up owner.
- A ministry admin can create follow-up tasks tied to a guest, member,
  group, or leader.
- A leader can see follow-ups assigned to them or tied to a group they
  actively lead, and mark allowed follow-ups in progress or done —
  without ever seeing the admin's private notes.
- Every write goes through a narrow `SECURITY DEFINER` RPC and records
  an `audit_events` row in the same transaction. No service role, no
  broad write RLS, no client-side writes, no hard deletes.

This phase is deliberately manual and operational. Explicitly out of
scope: SMS, calendar integration, public guest-signup forms, prayer
requests, care-sensitive notes, automated reminders / notifications,
exports, advanced analytics, bulk import, native mobile, and Auth
invitations.

## What changed

### New admin routes

- **`/admin/guests`** (super_admin + ministry_admin). A pipeline summary
  strip at the top (one card per stage with the live count), then a
  "New guest" form, then search / stage / group / owner filters, then
  the list of guests grouped by stage. Each guest card shows name,
  email or `—`, phone or `—`, stage badge, first-attended group + date
  if known, assigned group, follow-up owner, notes preview (first
  ~140 chars), and an "open follow-up count" badge sourced from a
  batched read. Inline update controls let you change stage, assigned
  group, follow-up owner, and notes — all through
  `admin_update_guest_pipeline`.

- **`/admin/follow-ups`** (super_admin + ministry_admin). Top-level
  "New follow-up" form (type, title, related group / member / guest,
  assignee, priority, due date, leader-visible note, admin-private
  note). Filters by priority, due window, assignee, related group,
  and related guest. The list is grouped by status (open → in
  progress → snoozed → done) and sorted by priority desc, due date
  asc nulls last, created_at desc. Each row exposes status-update
  buttons (Start / Mark done / Snooze / Reopen) gated by the
  current status. Admin-private notes render only on this page.

### Modified routes

- **`/leader`** gains a "Follow-ups" `StatusCard` rendered below the
  existing group cards. Two panes — Open / in-progress (rendered as
  one active list) and a collapsed "Recently closed" — show only
  follow-ups assigned to the caller or tied to a group they
  actively lead. Inline buttons offer only the allowed transitions
  per the leader RPC (open → in_progress, open → done, in_progress →
  done). `admin_private_note` is **never** sent to this page; the
  leader read helper explicitly excludes that column.

### Nav

`navItemsForRole` in `lib/auth/roles.ts` gains two items between
"Check-Ins" and "Settings":

```
Home · Admin · Manage People · Manage Groups · Check-Ins · Guests ·
Follow-Ups · Settings · [Super Admin]
```

### Five new SECURITY DEFINER RPCs

In `supabase/migrations/20260518110000_phase5c0_guest_followup_writes.sql`:

| RPC | Caller | Behavior |
|---|---|---|
| `admin_create_guest(...)` | `auth_is_admin()` | Inserts a `guests` row + `audit_events` (`admin.create_guest`). Validates assigned-group not closed; first-attended group may be closed (historical visit). |
| `admin_update_guest_pipeline(...)` | `auth_is_admin()` | Updates `pipeline_stage` and optionally `assigned_group_id` / `follow_up_owner_id` / `notes` (via `_set_` flags). Writes `admin.update_guest_pipeline`; writes a companion `admin.mark_guest_not_now` row when archiving. Row-locked. |
| `admin_create_follow_up(...)` | `auth_is_admin()` | Inserts a `follow_ups` row + `audit_events` (`admin.create_follow_up`). Note bodies are *not* stored in audit metadata — only presence is recorded. |
| `admin_update_follow_up_status(...)` | `auth_is_admin()` | Updates status, handles `completed_at` (set on `done`, cleared transitioning away from `done`), optionally updates either note. Writes `admin.update_follow_up_status`. |
| `leader_update_follow_up_status(...)` | active `leader` / `co_leader` | Allowed transitions only: `open → in_progress`, `open → done`, `in_progress → done`. Must be the assignee OR a leader of the related group. Writes `leader.update_follow_up_status`. |

Fixed error tokens raised by these RPCs (mapped to friendly UI copy in
`lib/admin/action-result.ts` and `lib/leader/action-result.ts`):

```
insufficient_privilege, invalid_input, missing_group, missing_profile,
missing_member, missing_guest, missing_follow_up, group_closed,
invalid_status, invalid_status_transition, forbidden_target.
```

### RLS posture

No new RLS policies. Existing Phase 4 SELECT-only policies cover every
new read path:

- Admins / staff see all guests and all follow-ups.
- Leaders see guests tied to a group they lead (`first_attended_group_id`
  or `assigned_group_id`), and follow-ups assigned to them or tied to a
  group they lead.
- `audit_events` reads remain super_admin-only.

### `admin_private_note` redaction

The Phase 4 `follow_ups_leader_read` SELECT policy still exposes the
`admin_private_note` column at the row level. Rather than reshape RLS
in this phase, we defend at the read path: the leader follow-up read
helper `fetchFollowUpsForLeader` selects an explicit, leader-safe
column list (`LEADER_FOLLOW_UP_COLUMNS`) that **omits**
`admin_private_note`. Any future leader code path that touches the
`follow_ups` table should reuse this constant or follow the same
pattern. Column-level RLS for `admin_private_note` is documented as a
future follow-up rather than overbuilt here.

### Read helpers

Added to `lib/supabase/read-models.ts`:

| Helper | Purpose |
|---|---|
| `fetchFollowUpsForAdmin` | All follow-ups, optionally filtered by status; admin-only. |
| `fetchFollowUpsForLeader` | Leader-safe column list, filtered by `assigned_to = me OR related_group_id ∈ my groups`. |
| `fetchGuestFollowUpCounts` | Batched count of open + in_progress follow-ups per guest id. No N+1. |
| `fetchGuestNamesByIds` | `{ id, full_name }[]` for guests visible to the caller via RLS. Used by the leader follow-up section to render guest names when safe. |
| `LEADER_FOLLOW_UP_COLUMNS` (const) | The leader-safe column list — reuse this for any new leader follow-up query. |

### Audit-trail labels

`components/admin/audit-trail-section.tsx` gains six new entries in
`ACTION_LABELS` and matching `summarize()` cases:

```
admin.create_guest, admin.update_guest_pipeline, admin.mark_guest_not_now,
admin.create_follow_up, admin.update_follow_up_status,
leader.update_follow_up_status
```

The summarizer surfaces the guest's full name from metadata, the
follow-up's title, and the `before → after` status transition where
relevant.

### Validation

`lib/admin/validation.ts` gains four new pure validators:

- `validateCreateGuestPayload`
- `validateUpdateGuestPipelinePayload` (handles the `_set_` flags)
- `validateCreateFollowUpPayload`
- `validateAdminUpdateFollowUpStatusPayload`
- `validateLeaderUpdateFollowUpStatusPayload`

Each returns the same `ValidationResult<T>` envelope as Phase 5A.x
validators, so the existing inline error-list rendering path is reused
verbatim.

### Why no dashboard expansion

Per the phase spec, `/admin` was not rebuilt. The dashboard's
`FollowUpsSection` (Phase 6.0) already consumes the existing
`fetchOpenFollowUps` read model, so existing open-follow-up totals
continue to work unchanged. Adding "overdue follow-ups" as a top-line
metric was scoped out of this phase to keep the dashboard read-only.

## File map

**New files**

```
supabase/migrations/20260518110000_phase5c0_guest_followup_writes.sql
app/(protected)/admin/guests/page.tsx
app/(protected)/admin/guests/actions.ts
app/(protected)/admin/follow-ups/page.tsx
app/(protected)/admin/follow-ups/actions.ts
app/(protected)/leader/follow-up-actions.ts
components/admin/guests/guests-shell.tsx
components/admin/guests/guest-create-form.tsx
components/admin/guests/guest-card.tsx
components/admin/follow-ups/follow-ups-shell.tsx
components/admin/follow-ups/follow-up-create-form.tsx
components/admin/follow-ups/follow-up-status-controls.tsx
components/leader/leader-follow-ups-section.tsx
components/leader/leader-follow-up-status-button.tsx
docs/PHASE_5C_0_GUEST_PIPELINE_FOLLOWUPS.md
docs/PHASE_5C_0_VERIFICATION.md
```

**Modified files**

```
lib/auth/roles.ts                          # "Guests" and "Follow-Ups" nav items
lib/admin/action-result.ts                 # new error tokens
lib/admin/rpc.ts                           # 4 new admin RPC wrappers
lib/admin/validation.ts                    # 5 new validators + readBooleanFlag
lib/leader/action-result.ts                # new leader-side error tokens
lib/leader/rpc.ts                          # leader follow-up RPC wrapper
lib/supabase/read-models.ts                # 4 new read helpers + LEADER_FOLLOW_UP_COLUMNS
types/database.ts                          # 5 new RPC Args/Returns entries
components/admin/audit-trail-section.tsx   # 6 new labels + summarize() cases
app/(protected)/leader/page.tsx            # renders LeaderFollowUpsSection
README.md                                  # Phase 6.0 marked complete; 5C.0 current; routes documented
docs/ROADMAP.md                            # synced through 5C.0
```
