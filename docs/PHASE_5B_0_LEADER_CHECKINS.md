# Phase 5B.0 — Leader weekly check-ins

This phase turns the leader dashboard into a usable weekly workflow. An
assigned leader (or co-leader) can sign in, open this week's check-in
for their group, mark member attendance, leave a note, optionally set a
pulse, and submit. Submissions are durable, idempotent on
(`group_id`, `meeting_week`), and audit-logged.

## What's new for leaders

- `/leader` continues to show every Life Group the signed-in user is an
  active leader or co-leader of, via the existing `group_leaders`
  scoping in `requireLeader()`.
- Each group card now has a live primary CTA:
  - **Start check-in** when nothing's submitted for the current week.
  - **Update check-in** when a session row already exists for the week.
  - A small secondary **Group did not meet** button records a
    `did_not_meet` status in one tap (with a confirm prompt).
- The dashboard hero callout shows the current week's status
  (`Submitted`, `Did not meet`, `Planned pause`, or no badge when
  nothing has been submitted yet) plus the P/A/E counts when the
  status is `submitted`.
- A new route `/leader/[groupId]/checkin` renders the full check-in
  form (server-rendered shell, client-rendered form):
  - Pick the meeting status: submitted / did not meet / planned pause.
  - Pick an optional meeting date (defaults to today).
  - When the status is "submitted", tap **P / A / E** for each active
    member of the group.
  - Leave an optional leader note (≤ 1000 chars).
  - Optionally set a health pulse (healthy / watch / needs_follow_up)
    and tick "Group could use a follow-up this week".
  - Submit. The server validates, calls the RPC, redirects back to
    `/leader?checkin=saved`, and a sage-toned success banner appears.

The visual system is the same warm pastoral palette used elsewhere.
Tap targets on member rows are 40 px circles for elderly-friendly use,
the form is grouped into numbered steps, and the page is mobile-first
(content max width 720 px).

## What's new for admins

- Admin pages now include leader audit events alongside admin events in
  the audit trail section (still super_admin only — the Phase 5A.2
  `audit_events_super_admin_read` policy is unchanged).
  - `admin.%` and `leader.%` audit actions are fetched together.
  - Three new action labels appear:
    - `leader.submit_checkin` — "Submitted check-in"
    - `leader.update_checkin` — "Updated check-in"
    - `leader.mark_did_not_meet` — "Did not meet"
- The admin dashboard already reads `attendance_sessions`,
  `attendance_records`, and `group_health_updates` for the
  "Attendance this week" / "Missing check-ins" / "Group health"
  metrics. Once leaders start submitting via the new RPC, those
  numbers update automatically — no admin code change was needed.

## Database write architecture

Following Phase 5A.1 / 5A.2 exactly:

- **No service role key.** The server-rendered app uses the anon /
  publishable key, scoped by RLS.
- **No new broad INSERT / UPDATE / DELETE policies** on operational
  tables. RLS stays SELECT-only outside the SECURITY DEFINER surface.
- **One narrow SECURITY DEFINER RPC** is the only write path:
  `public.leader_submit_group_checkin(...)`.
- The RPC explicitly enforces, in order:
  1. `auth_profile_id()` is not null (active, signed-in profile).
  2. `p_group_id` and `p_meeting_week` are present; `p_status` is one
     of `submitted` / `did_not_meet` / `planned_pause`; the leader
     note is ≤ 1000 chars; the pulse, if supplied, is one of
     `healthy` / `watch` / `needs_follow_up`.
  3. The target group exists and `lifecycle_status <> 'closed'`.
  4. `auth_is_leader_of(p_group_id)` is true (active leader/co-leader
     of THIS group; admins not separately listed in `group_leaders`
     are rejected).
  5. When status is `submitted`, every member in the attendance JSON
     belongs to the group via an active `group_memberships` row.
- Writes that happen in a single transaction:
  - **Upsert** the `attendance_sessions` row on
    (`group_id`, `meeting_week`). The unique index guarantees one row
    per group per week; concurrent submits serialize through
    `FOR UPDATE`.
  - **Replace** the `attendance_records` for that session. The DELETE
    is confined to the RPC and to the one session id; the parent
    session row is never hard-deleted; client code never issues a
    `.delete()`.
  - When a pulse is supplied, **upsert** the matching row in
    `group_health_updates` on (`group_id`, `update_week`). The leader
    columns (`pulse`, `follow_up_needed`, `leader_note`,
    `submitted_by`) are overwritten; `admin_note` is intentionally
    left alone.
  - Insert an `audit_events` row with one of three action tokens:
    - `leader.submit_checkin` — new session row, status submitted /
      planned_pause.
    - `leader.update_checkin` — existing session row, status submitted
      / planned_pause.
    - `leader.mark_did_not_meet` — status set to `did_not_meet`
      regardless of whether the row existed.

If the audit insert fails, the entire submission rolls back. Matches
Phase 5A.1 / 5A.2 behaviour.

## Fixed error tokens

The RPC raises these tokens; the calling server action maps them to
friendly UI text in `lib/leader/action-result.ts`.

| Token | When | UI text |
|---|---|---|
| `insufficient_privilege` | no signed-in active profile | "You're not signed in, or your session expired." |
| `invalid_input` | missing required field, bad enum, leader_note > 1000 chars | "Something in this check-in didn't look right." |
| `missing_group` | `p_group_id` doesn't match any row | "We couldn't find that group." |
| `group_closed` | target group is `lifecycle_status = 'closed'` | "That group is closed, so check-ins are turned off for it." |
| `not_leader_of_group` | caller is not an active leader/co-leader of the target | "Only the assigned leader or co-leader can submit this group's check-in." |
| `invalid_member` | attendance entry references a member not in the group | "One of the people on the attendance list isn't in this group anymore." |

The action layer also short-circuits before hitting the RPC:

- Reject any caller whose role is not `leader` or `co_leader`.
- Reject any payload whose `group_id` isn't in the session's
  `assignedGroupIds`. (The RPC re-checks via `auth_is_leader_of` — this
  is defense in depth.)

## Out of scope

Per the Phase 5B.0 brief, these intentionally do not ship in this
phase:

- SMS / calendar integration / push notifications.
- Prayer requests, guest pipeline, follow-up actions for leaders.
- Reminders / automated nudges.
- Admin review queue for missed weeks.
- Care notes / sensitive care notes.
- Bulk import, exports, advanced metric tuning.

Anything in that list will land in a later phase with its own RPC,
validation, RLS surface, and verification doc.

## File map

New files in this phase:

- `supabase/migrations/20260518080000_phase5b0_leader_checkin_writes.sql`
- `lib/leader/validation.ts`
- `lib/leader/action-result.ts`
- `lib/leader/rpc.ts`
- `app/(protected)/leader/actions.ts`
- `app/(protected)/leader/[groupId]/checkin/page.tsx`
- `components/leader/check-in-form.tsx`
- `components/leader/quick-did-not-meet.tsx`
- `docs/PHASE_5B_0_LEADER_CHECKINS.md` (this file)
- `docs/PHASE_5B_0_VERIFICATION.md`

Touched files:

- `types/database.ts` — added the new RPC signature to the typed
  `Database` interface.
- `lib/dashboard/types.ts` — added `LeaderCurrentWeek` and a
  `currentWeek` field on `LeaderGroupDashboard`.
- `lib/dashboard/queries.ts` — derives the current-week status / counts
  from existing read models.
- `lib/dashboard/fallback-data.ts` — includes a `currentWeek` block on
  the leader fallback record so `/leader-preview` keeps rendering.
- `lib/supabase/read-models.ts` — `fetchRecentAuditEvents` now accepts
  a `string[]` for `actionsLike` and composes a PostgREST `or(...)`
  expression.
- `components/dashboard/leader-group-card.tsx` — replaced the
  "Phase 5B" placeholder with live CTAs (Start / Update check-in,
  Group did not meet) and a current-week status badge.
- `components/admin/audit-trail-section.tsx` — added labels and
  summaries for the three leader actions.
- `app/(protected)/leader/page.tsx` — saved-banner on
  `?checkin=saved`.
- `app/(protected)/admin/people/page.tsx`,
  `app/(protected)/admin/groups/page.tsx` — fetch admin **and** leader
  audit events for the super_admin audit trail.
- `app/leader-preview/page.tsx` — passes `preview` so the public
  preview disables the live CTAs.
