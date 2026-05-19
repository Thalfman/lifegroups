# Phase 5C.0 — Verification

## Prerequisites

- `npm install` succeeds.
- The Phase 5C.0 migration
  (`supabase/migrations/20260518110000_phase5c0_guest_followup_writes.sql`)
  has been applied to the target Supabase project.
- At least one active leader / co_leader profile exists, that profile
  has at least one active `group_leaders` assignment, and the actor
  Auth user is linked to it (for the leader steps).

## Automated checks

Run all three and confirm green:

```
npm run lint
npm run typecheck
npm run build
```

## Security greps

| Command | Expected |
|---|---|
| `grep -r service_role .` | No matches in app code or migrations. (The string may appear in node_modules — that's fine.) |
| `grep -ri "SUPABASE_SERVICE\|sb_secret" .` | No matches outside `node_modules`. |
| `grep -ri "\.delete(" "app/(protected)/admin/" "app/(protected)/leader/" lib/` | No client-side deletes. |
| `grep -ri "admin_private_note" app/ components/ lib/` | Present only in admin paths (`app/(protected)/admin/follow-ups/...`, `components/admin/follow-ups/...`, `lib/admin/validation.ts`, `lib/admin/rpc.ts`, `lib/supabase/read-models.ts` LEADER_FOLLOW_UP_COLUMNS comment). **Never** under `app/(protected)/leader/`, `components/leader/`, or `lib/leader/`. |
| `grep -ri "create policy .*insert\\|create policy .*update\\|create policy .*delete" supabase/migrations/` | No matches in the Phase 5C.0 migration. (Existing matches in prior migrations remain unchanged.) |

## Access control

| Role | `/admin/guests` | `/admin/follow-ups` | `/leader` follow-up section |
|---|---|---|---|
| `super_admin` | ✅ | ✅ | n/a (route redirects away) |
| `ministry_admin` | ✅ | ✅ | n/a |
| `leader` | redirect → `/unauthorized` | redirect → `/unauthorized` | ✅ (scoped) |
| `co_leader` | redirect → `/unauthorized` | redirect → `/unauthorized` | ✅ (scoped) |
| `staff_viewer` | redirect → `/unauthorized` (role deprecated) | redirect → `/unauthorized` | redirect → `/unauthorized` |
| unauthenticated | redirect → `/login` | redirect → `/login` | redirect → `/login` |

## Happy-path admin workflow

1. Sign in as `ministry_admin`.
2. Open `/admin/guests`. Confirm the pipeline summary strip shows all
   seven stages with counts.
3. Submit the "Add guest" form with only `full_name = "Avery Verify"`.
   Confirm "Guest added." and that the new card appears under the
   `new` stage.
4. Click "Update" on that guest. Set pipeline stage to `contacted` and
   save. Confirm the badge updates and the card moves to the
   `contacted` group.
5. Update again: assign to an active group and pick a follow-up owner.
   Confirm both lines appear on the card.
6. Try assigning the same guest to a closed group — server action
   should fail with the `group_closed` friendly message.
7. Open `/admin/follow-ups`. Submit "New follow-up" with type=`guest`,
   title=`Verify follow-up`, related guest=`Avery Verify`, related
   group=(the assigned group), assigned_to=(a leader of that group),
   priority=`high`, due date=today, leader-visible note=`hi leader`,
   admin-private note=`admin only`. Confirm it lands under "Open".
8. Click "Start" on that follow-up. Confirm it moves to "In progress".
9. Repeat: click "Mark done". Confirm it moves to "Done" and the badge
   changes.
10. Click "Reopen" on the same item. Confirm it returns to "Open" and
    that `completed_at` has been cleared (see SQL spot-check below).

## Leader visibility / authorization

1. Sign in as the leader assigned to the group from step 5 above.
2. Open `/leader`. Confirm a "Follow-ups" card appears below the group
   card(s) and the seeded follow-up is visible.
3. View page source / dev tools: confirm `admin_private_note`'s body
   (`"admin only"`) is **not** present anywhere in the response HTML.
4. Click "Start" on the follow-up. Confirm it moves to "In progress".
5. Click "Mark done". Confirm it moves to "Done" and is no longer in
   the active list (and shows under "Recently closed").
6. (Negative case) From the leader's browser console, attempt:
   ```js
   await fetch("/api/anything-that-isn-t-here") // not relevant
   ```
   Or, in the Supabase SQL editor as the leader's Auth user, run
   `select * from public.leader_update_follow_up_status('00000000-0000-0000-0000-000000000000', 'done');`
   and confirm Postgres responds with `forbidden_target` (mapped to a
   friendly UI message when invoked via the form).
7. (Negative case) Sign in as a *different* leader who does **not**
   lead that group. Open `/leader` and confirm the follow-up is **not**
   visible.

## Audit trail (super_admin)

1. Sign in as `super_admin`.
2. Open `/admin/super-admin`. Confirm the audit log shows entries for
   each new action performed in the steps above:
   - `admin.create_guest`
   - `admin.update_guest_pipeline`
   - (optionally) `admin.mark_guest_not_now` if you exercised the
     archival path
   - `admin.create_follow_up`
   - `admin.update_follow_up_status`
   - `leader.update_follow_up_status`
3. Confirm friendly summaries render (e.g. "Created guest follow-up:
   Verify follow-up", "Avery Verify: new → contacted").
4. Sign in as `ministry_admin`. Open `/admin/super-admin` and confirm
   you are redirected to `/unauthorized` (RLS still restricts
   `audit_events` reads to super_admin).

## SQL spot-checks (super_admin only)

```sql
-- Last few writes for guests + follow-ups:
select id, full_name, pipeline_stage, assigned_group_id, follow_up_owner_id, created_at
  from public.guests order by created_at desc limit 5;
select id, type, title, status, completed_at, related_group_id, related_guest_id, assigned_to, created_at
  from public.follow_ups order by created_at desc limit 10;

-- Audit entries (super_admin can see these via RLS):
select action, entity_type, entity_id, jsonb_pretty(metadata) as metadata, created_at
  from public.audit_events
 where action in (
   'admin.create_guest','admin.update_guest_pipeline','admin.mark_guest_not_now',
   'admin.create_follow_up','admin.update_follow_up_status','leader.update_follow_up_status'
 )
 order by created_at desc limit 25;

-- Verify completed_at is set when status='done' and cleared when reopened:
select id, status, completed_at, updated_at from public.follow_ups
 where id = '<the follow-up you toggled>';
```

## Cross-route smoke

Verify nothing else regressed:

- `/admin` still loads, summary cards render, attention list shows.
- `/admin/check-ins` still loads, the week selector works, the
  `[groupId]` detail page still works.
- `/admin/people` and `/admin/groups` still load.
- `/admin/settings` still loads.
- `/admin/super-admin` still loads (as super_admin) and shows the
  audit log with new action labels.
- `/leader` still loads, the weekly check-in card still works, and the
  new follow-ups section is rendered below the group cards.
- `/admin-preview` and `/leader-preview` still render (fallback data
  paths are untouched in this phase).

## Pastoral copy

Spot-check that the new pages stay in the pastoral / warm voice:

- `/admin/guests` lede: "Add a guest, walk them through the pipeline,
  and assign a follow-up owner. Nothing here sends an SMS or an email
  — this is your manual record of who's coming and what comes next."
- `/admin/follow-ups` lede: "Every open thread tied to a group, a
  member, a guest, or a leader. Mark a follow-up in progress when you
  start it; mark it done when it lands. Leaders see only the items
  assigned to them or tied to their groups."
- `/leader` follow-ups empty state: "No follow-ups right now."

## Known follow-ups (not part of this phase)

- Column-level RLS for `admin_private_note`. The Phase 4
  `follow_ups_leader_read` policy still exposes the column at the row
  level; defense is currently at the read-path level via
  `LEADER_FOLLOW_UP_COLUMNS`. Migrating to a column-mask policy or a
  redacted view is a future cleanup, not a security regression for
  this phase.
- Leader follow-up creation, snooze, reopen. Out of scope for Phase
  5C.0 — leaders update status only.
- Surfacing new "Open follow-ups" / "Overdue follow-ups" counts on
  `/admin`. The Phase 6.0 dashboard already includes a follow-ups
  panel via the existing read model; expanding the summary card grid
  was scoped out to keep this phase focused on the new write paths.
