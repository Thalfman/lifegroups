# Phase 5C.1 — Verification Checklist

This checklist verifies the Phase 5C.1 privacy hardening landed cleanly and
that the Phase 5C.0 guest pipeline + follow-up workflow continues to enforce
its leader/admin boundary end-to-end. See
`docs/PHASE_5C_1_PRIVACY_HARDENING.md` for the design intent.

## 1. Automated checks

All three must finish clean.

```bash
npm run lint
npm run typecheck
npm run build
```

Expected: lint ✓ no errors, typecheck no output (exit 0), build emits the
usual route table and exits 0.

## 2. Security greps

Run from the repo root.

### 2a. No service role / secret-key usage in app code

```bash
grep -rn "service_role" app/ components/ lib/
grep -rni "SUPABASE_SERVICE\|sb_secret" app/ components/ lib/
```

**Expected:** both empty.

### 2b. No client-side deletes in admin or leader routes

```bash
grep -rni "\.delete(" "app/(protected)/admin/" "app/(protected)/leader/" lib/
```

**Expected:** empty. Any apparent `.delete(` should be on a JS `Map` /
`Set`, not a Supabase query builder — re-inspect if so.

### 2c. `admin_private_note` exposure surface

```bash
# Full survey
grep -rn "admin_private_note" app/ components/ lib/ supabase/
```

**Expected paths**, each acceptable:

- `app/(protected)/admin/follow-ups/actions.ts` — admin server action that
  builds the RPC payload (admin path).
- `components/admin/follow-ups/follow-up-create-form.tsx` — admin-only
  create form input.
- `components/admin/follow-ups/follow-ups-shell.tsx` — admin-only render
  of the note inside an "Admin-private" labelled blockquote.
- `lib/admin/rpc.ts` — admin RPC wrapper type.
- `lib/admin/validation.ts` — admin payload validation.
- `lib/supabase/read-models.ts` — `LEADER_FOLLOW_UP_COLUMNS` comment +
  `LeaderFollowUpRow = Omit<FollowUpsRow, "admin_private_note">` (the
  privacy boundary itself).
- `supabase/migrations/20260517040000_phase2_schema.sql` — column
  definition.
- `supabase/migrations/20260518110000_phase5c0_guest_followup_writes.sql`
  — RPC bodies that read/write the column for admins.
- `app/(protected)/leader/page.tsx` — **comment only** ("admin_private_note
  never reaches the page").
- `components/leader/leader-follow-ups-section.tsx` — **comment only**
  (the privacy-contract docstring on `LeaderFollowUpItem` mentioning
  what the type intentionally omits).

```bash
# Strict leader-path check: must contain only documentation lines, never data.
grep -rn "admin_private_note" "app/(protected)/leader/" components/leader/ lib/leader/
```

**Expected output**: the three lines below (or equivalent if line numbers
shift). They are documentation/comment text inside `// ...` or `/** ... */`
blocks, never inside a query, function call, prop, JSX attribute, or
returned object key.

```
app/(protected)/leader/page.tsx:NN:  // admin_private_note never reaches the page, even via SSR.
components/leader/leader-follow-ups-section.tsx:NN: * `adminPrivateNote` / `admin_private_note` field. The mapping from
components/leader/leader-follow-ups-section.tsx:NN: * never reads `admin_private_note`, and the upstream reader
```

`lib/leader/` should produce zero matches.

### 2d. No broad write RLS policies

```bash
grep -rniE "create policy" supabase/migrations/
grep -rniE "for (insert|update|delete)" supabase/migrations/
```

**Expected:**
- `create policy` matches are all SELECT policies (Phase 4 plus Phase
  5A.2's tightening of `audit_events`).
- `for update` / `for insert` / `for delete` matches are all SELECT ...
  FOR UPDATE row locks inside SECURITY DEFINER RPC bodies (you'll see
  `from public.X where id = ... for update;` patterns), never an RLS
  policy declaration. Look at the preceding 2-3 lines — if they say
  `from public.<table>` and `where id =`, it's a row lock, not a policy.
- No `CREATE POLICY ... FOR INSERT/UPDATE/DELETE` should appear anywhere.

## 3. Access-control matrix

Sign in as each role and confirm:

| Path | super_admin | ministry_admin | leader |
|---|---|---|---|
| `/admin/guests` | ✅ loads | ✅ loads | ❌ `/unauthorized` |
| `/admin/follow-ups` | ✅ loads | ✅ loads | ❌ `/unauthorized` |
| `/admin/super-admin` | ✅ audit log visible | ❌ `/unauthorized` | ❌ `/unauthorized` |
| `/leader` | ✅ loads (admins can see leader page too via role hierarchy) | n/a | ✅ loads with assigned content |
| `/admin` dashboard | ✅ | ✅ | ❌ |
| `/admin/check-ins/[groupId]` | ✅ | ✅ | ❌ |
| `/admin/people` | ✅ | ✅ | ❌ |
| `/admin/groups` | ✅ | ✅ | ❌ |
| `/admin/settings` | ✅ | ✅ | ❌ |
| `/leader/[groupId]/checkin` | n/a | n/a | ✅ for assigned groups |

## 4. Guest pipeline workflow (admin)

As a `super_admin` or `ministry_admin`:

- **Create with name only**: `/admin/guests` → "Add someone new" → enter
  `Full name` only → submit. Guest appears under `New` stage. An
  `audit_events` row with `action = 'admin.create_guest'` is written.
- **Email / phone optional**: same flow, leave both blank — succeeds.
  No fake email or phone is generated.
- **Notes max length**: paste >1000 characters into Notes → server
  returns `invalid_input`.
- **Move through stages**: open the guest's card → change stage to
  `contacted` → save. Repeat through `interested`, `assigned`,
  `attended`, `placed`. Each step writes an
  `admin.update_guest_pipeline` audit row.
- **Assign to closed group rejected**: try assigning the guest's
  `assigned_group_id` to a closed group → returns `group_closed` →
  guest is not modified.
- **first_attended_group can be historical**: closed group accepted as
  `first_attended_group_id` (intended for backfill / wrap-up).
- **Assign follow-up owner**: pick a leader/co_leader/admin → succeeds.
- **Mark "not now"**: change stage to `not_now` → both an
  `admin.update_guest_pipeline` row and a companion
  `admin.mark_guest_not_now` row are written. No row is hard-deleted.

## 5. Follow-up workflow (admin)

- **Create with both notes**: at `/admin/follow-ups` → "Add a follow-up"
  → fill `Title`, set `Type`, set `Assigned to` a real leader,
  optionally tie a `Related group`, set `Priority`, fill **both**
  `Leader-visible note` and `Admin-private note`. Submit. Card appears in
  Open. An `admin.create_follow_up` audit row is written.
- **Audit metadata excludes note bodies**: SQL spot-check (see §8) —
  metadata contains `note_present`/`admin_note_present` flags but not
  the strings themselves.
- **Status transitions**: open → in_progress → done. Then click
  Reopen → done → ... Each step writes an `admin.update_follow_up_status`
  audit row. `done` sets `completed_at`; moving away from `done` clears
  it.
- **Note labels are clear**: in the follow-up card, the leader-visible
  note renders inside a blockquote labelled "Leader-visible · ..." and
  the admin-private note renders inside a separate blockquote labelled
  "Admin-private · ..." (admin shell only).

## 6. Leader visibility

Use one leader account assigned to Group A, with no assignment to Group B.

- **Sees follow-up tied to Group A**: create a follow-up at
  `/admin/follow-ups` with `related_group_id = Group A` and no
  `assigned_to`. Sign in as the leader, load `/leader`. The follow-up
  appears in "Threads to close out".
- **Sees follow-up where assigned_to = me**: create one with
  `assigned_to` = the leader's profile id and **no** related group.
  Leader sees it.
- **Does NOT see unrelated follow-ups**: create one with
  `related_group_id = Group B` and `assigned_to` = some unrelated admin.
  Leader does not see it in `/leader`.
- **Status controls allow only forward transitions**: the leader can
  click Start (open → in_progress) and Mark done (open → done or
  in_progress → done). There is no snooze button, no reopen button,
  no note edit field.
- **RPC rejects unauthorized writes**: server action
  `leaderUpdateFollowUpStatus` against an unrelated follow-up id returns
  `forbidden_target`.

## 7. Leader page-source privacy check (headline test)

This is the one manual check that proves `admin_private_note` does not
escape via SSR / RSC payloads.

1. Sign in as admin. Create a follow-up assigned to a real leader (or
   tied to their group) with:
   ```
   leader_visible_note = "LEADER-VISIBLE-LV-CANARY"
   admin_private_note  = "ADMIN-PRIVATE-AP-CANARY"
   ```
2. Sign out. Sign in as that leader.
3. Load `/leader`.
4. Confirm visually that the leader-visible note appears with the
   `LV-CANARY` string and the admin-private note does **not** appear.
5. Open browser dev tools → Network → click the document request for
   `/leader` → Response tab. Search the full response text for:
   - `ADMIN-PRIVATE-AP-CANARY` — **must not be present**.
   - `admin_private_note` — **must not be present**.
   - `LEADER-VISIBLE-LV-CANARY` — must be present (sanity check).
6. Right-click → View page source. Search for the same three strings.
   Same expectations.
7. If the page uses any client-rendered fragments, also inspect the
   relevant `__next_f` chunks for `ADMIN-PRIVATE-AP-CANARY` and
   `admin_private_note` — must be absent.

## 8. SQL spot checks

Run against the live database with admin SQL access:

```sql
-- Latest guest audit events
select created_at, action, entity_id, metadata
from audit_events
where action in (
  'admin.create_guest',
  'admin.update_guest_pipeline',
  'admin.mark_guest_not_now'
)
order by created_at desc
limit 20;

-- Latest follow-up audit events
select created_at, action, entity_id, metadata
from audit_events
where action in (
  'admin.create_follow_up',
  'admin.update_follow_up_status',
  'leader.update_follow_up_status'
)
order by created_at desc
limit 20;

-- Confirm follow-ups carry admin_private_note in the DB even though
-- leaders never see it.
select id, status,
       leader_visible_note is not null as has_leader_note,
       admin_private_note  is not null as has_admin_note
from follow_ups
order by created_at desc
limit 10;

-- Confirm note bodies are NOT in audit metadata. Look at the JSON keys —
-- you should see boolean flags like `note_present`, `admin_note_present`,
-- `note_updated`, `admin_note_updated`, but no `admin_private_note` body.
select action, metadata
from audit_events
where action in ('admin.create_follow_up','admin.update_follow_up_status')
order by created_at desc
limit 5;
```

## 9. Super Admin audit summaries

At `/admin/super-admin` (super_admin only), the audit list should render
friendly summaries for all six new actions. Verify each by performing
the action above and refreshing the page:

| Action | Summary should read like |
|---|---|
| `admin.create_guest` | "Added guest Avery (new)" |
| `admin.update_guest_pipeline` | "Moved Avery from contacted to interested" |
| `admin.mark_guest_not_now` | "Marked Avery as \"not now\"" |
| `admin.create_follow_up` | "Created in_person follow-up: Reach out about Sunday" |
| `admin.update_follow_up_status` | "Reach out about Sunday: open → in_progress" |
| `leader.update_follow_up_status` | "Leader moved \"Reach out about Sunday\" in_progress → done" |

The fallback "by *Actor Name*" pill and the timestamp appear on the
right of each row. No raw enum values should leak into the headline.

A ministry_admin (non-super) should still get `/unauthorized` at this
route — confirm.

## 10. Regression smoke (other routes)

All Phase 4-5B surfaces must still load cleanly. Tick after a quick
sign-in:

- [ ] `/admin` dashboard (Phase 6.0 metrics).
- [ ] `/admin/check-ins` review list.
- [ ] `/admin/check-ins/[groupId]?week=YYYY-MM-DD` detail.
- [ ] `/admin/people` directory.
- [ ] `/admin/groups` directory + create/edit/close/reopen.
- [ ] `/admin/settings` defaults + per-group overrides.
- [ ] `/admin/super-admin` audit log + role-change form.
- [ ] `/leader` weekly check-ins still submit.
- [ ] `/leader/[groupId]/checkin` opens for an assigned group.

## 11. Empty-state polish (UX)

With a fresh database (zero guests / zero follow-ups):

- `/admin/guests` shows **"No guests yet"** with the create-form
  pointer copy. After at least one guest exists, the message reverts
  to "No guests match these filters" only when the user's filters
  actually exclude every row.
- `/admin/follow-ups` shows **"No follow-ups yet"** with the
  create-form pointer copy in the empty case, and reverts to the
  filter-mismatch copy once at least one follow-up exists.
- `/leader` (leader with zero follow-ups visible) shows "No follow-ups
  right now" — unchanged from 5C.0.

## 12. Sign-off

Tick when all 11 sections above pass and the PR is ready for review:

- [ ] Automated checks clean.
- [ ] Security greps match expectations (§2).
- [ ] Access-control matrix holds (§3).
- [ ] Guest pipeline workflow correct (§4).
- [ ] Follow-up workflow correct (§5).
- [ ] Leader visibility correct (§6).
- [ ] Page-source canary test passes — no `ADMIN-PRIVATE-AP-CANARY` /
      no `admin_private_note` in `/leader` HTML, RSC, or any chunk
      (§7).
- [ ] SQL spot checks confirm audit metadata excludes note bodies (§8).
- [ ] All six Super Admin summaries render friendly (§9).
- [ ] Regression smoke passes for other routes (§10).
- [ ] Empty-state copy reads correctly (§11).
