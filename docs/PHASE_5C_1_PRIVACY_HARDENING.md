# Phase 5C.1 — Guest and Follow-Up Privacy Hardening

## Context

Phase 5C.0 shipped the admin guest pipeline (`/admin/guests`), admin follow-up
workflow (`/admin/follow-ups`), and a leader-facing follow-up section on
`/leader`. It also added five `SECURITY DEFINER` RPCs and audit rows for every
guest/follow-up write. One column on the new `follow_ups` table —
`admin_private_note` — is intentionally invisible to leaders: only admins
should see it.

Phase 5C.0 implemented that privacy boundary at the **read path** rather than
the **column** level:

- `LEADER_FOLLOW_UP_COLUMNS` (`lib/supabase/read-models.ts`) is an explicit
  allowlist that omits `admin_private_note`.
- `LeaderFollowUpRow = Omit<FollowUpsRow, "admin_private_note">` is the
  matching TypeScript type returned by `fetchFollowUpsForLeader`.
- The `/leader` page maps `LeaderFollowUpRow` into a narrower
  `LeaderFollowUpItem` view-model that has only `leaderVisibleNote`.

That boundary works today, but it relies on convention: any future
developer who writes a `.select("*")` against `follow_ups` from a
leader path — or extends the `LeaderFollowUpItem` shape — could silently
regress it.

Phase 5C.1 is a **post-merge verification, privacy-hardening, and UX
cleanup pass** that locks the boundary down with documentation and explicit
contracts (without overbuilding column-level RLS).

## What changed in this phase

1. **`lib/supabase/read-models.ts`** — strengthened JSDoc contracts on the
   leader-side surface:
   - `LEADER_FOLLOW_UP_COLUMNS` now carries a privacy-contract docstring
     stating "every leader-facing query MUST select via this constant or a
     narrower allowlist, never `select("*")`" and points at this hardening
     doc and the verification doc.
   - `LeaderFollowUpRow` gets a matching docstring explaining it is the
     compile-time half of the boundary.
   - `fetchFollowUpsForLeader` gets a docstring describing the visibility
     rule (assignee OR active leader of related group, enforced both in the
     PostgREST predicate and at the RLS layer).
   - `fetchFollowUpsForAdmin` gets a "**Admin-only** — do not call from any
     leader code path" warning JSDoc.

2. **`components/leader/leader-follow-ups-section.tsx`** — added a privacy
   contract docstring above the `LeaderFollowUpItem` view-model type
   explaining that it has no `adminPrivateNote` field by design, the
   mapping in `/leader/page.tsx` never reads `admin_private_note`, and the
   upstream reader does not select the column. Anyone widening this type
   in the future is steered to check the upstream constraint.

3. **Empty states** (`/admin/guests`, `/admin/follow-ups`) now distinguish
   "no rows in the system yet" from "no rows match these filters". The
   former points users to the in-page create form with a short pastoral
   sentence; the latter keeps the existing "adjust filters" copy.

4. **Documentation** — this file plus `docs/PHASE_5C_1_VERIFICATION.md`,
   and the phase tracker in `README.md` + `docs/ROADMAP.md` is updated to
   mark 5C.0 ✅ and 5C.1 current.

No new RPCs, no new migrations, no new RLS policies, no new tables, no
schema changes, and no service-role usage. The Phase 5C.0 codepaths are
unchanged at runtime — only documentation and one client-side empty-state
branch are touched.

## Privacy boundary, end-to-end

```
follow_ups table  (admin_private_note column exists)
        │
        │  select * (admin) ─────────► fetchFollowUpsForAdmin → FollowUpsRow → /admin/follow-ups (admin only)
        │
        └─ select LEADER_FOLLOW_UP_COLUMNS (leader)
                              │
                              ▼
                       LeaderFollowUpRow                  ← Omit<FollowUpsRow, "admin_private_note">
                              │
                              ▼   (mapped in /leader/page.tsx)
                       LeaderFollowUpItem                 ← has leaderVisibleNote only
                              │
                              ▼
                   LeaderFollowUpsSection (RSC → HTML)
                              │
                              ▼
                       Leader's browser
                       (no admin_private_note anywhere
                        in component props, RSC payload,
                        rendered HTML, or page source)
```

Three independent layers prevent leakage to a leader:

1. **Runtime / SQL**: `fetchFollowUpsForLeader` selects via
   `LEADER_FOLLOW_UP_COLUMNS`, which does not list `admin_private_note`.
2. **Compile time**: `LeaderFollowUpRow` is `Omit<FollowUpsRow, "admin_private_note">`,
   so any future code that tries to read `row.admin_private_note` after a
   `fetchFollowUpsForLeader` call fails to compile.
3. **View model**: `LeaderFollowUpItem` (the prop type for the leader UI)
   has only `leaderVisibleNote`. The mapping in `/leader/page.tsx` never
   references `admin_private_note`.

## Leader visibility rules (verified this phase)

**Follow-ups** — a leader / co_leader sees a `follow_ups` row iff:
- `follow_up.assigned_to = current_profile.id`, **or**
- `follow_up.related_group_id` is a group on which the caller has an
  active `group_leaders` row (`role IN ('leader','co_leader')` and
  `removed_at IS NULL`).

Enforced in two places:
- The PostgREST `or(assigned_to.eq.<me>, related_group_id.in.(<ids>))`
  predicate in `fetchFollowUpsForLeader`.
- The Phase 4 `follow_ups_leader_read` SELECT RLS policy on the
  `follow_ups` table.

**Guests** — leaders see guest *names* (`fetchGuestNamesByIds`) only for
guests they can already see through RLS (i.e. a guest linked to a
follow-up they can see, or via a group they lead). The leader UI renders
"Guest" without a name when the id is not present in the returned map.
No `guests.notes`, `assigned_group_id`, `pipeline_stage`, `email`,
`phone`, or other admin pipeline fields are ever fetched on the leader
path.

## Status transition guards (verified this phase)

**`leader_update_follow_up_status(p_follow_up_id, p_status)`** enforces:
- Caller has an active profile (`profiles.status = 'active'`) with role
  `leader` or `co_leader`.
- The follow-up exists.
- Caller is the assignee **or** an active leader/co_leader of the related
  group.
- Status is one of: `open → in_progress`, `open → done`,
  `in_progress → done`. Every other transition (including snooze, reopen,
  arbitrary jumps) is rejected with `invalid_status_transition`.
- On `done`, `completed_at = now()`.
- Notes are not read or written by this RPC. Leaders cannot edit
  `leader_visible_note` or `admin_private_note`.
- One `audit_events` row (`leader.update_follow_up_status`) is written in
  the same transaction.

**`admin_update_follow_up_status(...)`** enforces:
- Caller is `super_admin` or `ministry_admin` (`auth_is_admin()`).
- The follow-up exists.
- Status is one of the four enum values.
- On `done`, `completed_at = now()`. Moving away from `done` clears
  `completed_at`.
- Notes may be set via the `_set_leader_visible_note` / `_set_admin_private_note`
  flag pattern — but only by admins, never by leaders.
- One `audit_events` row (`admin.update_follow_up_status`) is written; the
  metadata records `note_updated` / `admin_note_updated` flags but does **not**
  include the note bodies.

## Audit summaries (no code change — verified)

`components/admin/audit-trail-section.tsx` already renders friendly
summaries for the six Phase 5C.0 actions. Each was sanity-checked this
phase:

| Action | Friendly summary |
|---|---|
| `admin.create_guest` | "Added guest *NAME* (*stage*)" |
| `admin.update_guest_pipeline` | "Moved *NAME* from *before* to *after*" or "Updated *NAME*'s pipeline" |
| `admin.mark_guest_not_now` | "Marked *NAME* as \"not now\"" |
| `admin.create_follow_up` | "Created *TYPE* follow-up: *TITLE*" |
| `admin.update_follow_up_status` | "*TITLE*: *before* → *after*" |
| `leader.update_follow_up_status` | "Leader moved \"*TITLE*\" *before* → *after*" |

The audit metadata records whether a note was changed (`note_updated` /
`admin_note_updated`), not the note body, so admin-private content never
appears in the audit feed either.

## Future hardening (deferred — explicit non-goals for 5C.1)

These are listed so they remain on the radar without distorting the
current phase. They are **out of scope** for 5C.1 by design:

- **Column-level RLS / `REVOKE` on `follow_ups.admin_private_note`.** The
  cleanest server-side enforcement, but it requires either (a) a leader-safe
  Postgres view that omits the column and repointing leader reads at the
  view, or (b) GRANT/REVOKE on a specific column to a specific role — a
  pattern this codebase has not yet established. The Phase 5C.1 brief
  explicitly says "do not overbuild column-level RLS unless required and
  low-risk." We are not.
- **A `follow_ups_leader` Postgres view** that pre-projects only the
  leader-safe columns. Same trade-off as above — would change deploy /
  migration choreography for a privacy property already enforced at the
  application layer.
- **A dev-only runtime invariant** (e.g., `process.env.NODE_ENV !==
  "production" && assert keys do not include admin_private_note`) inside
  `fetchFollowUpsForLeader`. Considered but not added because the type
  system already prevents the regression path the invariant would catch.
- **An automated privacy regression test** (Vitest / Node script). Useful
  long-term, but this codebase has no test runner today; adding one for a
  single assertion exceeds the phase's "no overbuild" guidance. The grep
  step documented in `docs/PHASE_5C_1_VERIFICATION.md` is the substitute.

If a future phase wants to upgrade the boundary, the recommended path is
the leader-safe view: it is the smallest change with the strongest
server-side guarantee, and re-pointing `fetchFollowUpsForLeader` at the
view is a one-line code change.

## File map (touched this phase)

- `lib/supabase/read-models.ts` — JSDoc privacy contracts on
  `LEADER_FOLLOW_UP_COLUMNS`, `LeaderFollowUpRow`,
  `fetchFollowUpsForLeader`, and `fetchFollowUpsForAdmin`.
- `components/leader/leader-follow-ups-section.tsx` — privacy contract
  docstring on `LeaderFollowUpItem`.
- `components/admin/guests/guests-shell.tsx` — distinguished
  "nothing yet" vs "filter mismatch" empty states.
- `components/admin/follow-ups/follow-ups-shell.tsx` — same.
- `README.md` — phase tracker (5C.0 ✅, 5C.1 current), doc index,
  closing scope note.
- `docs/ROADMAP.md` — phase tracker.
- `docs/PHASE_5C_1_PRIVACY_HARDENING.md` — this file.
- `docs/PHASE_5C_1_VERIFICATION.md` — manual + grep + SQL verification
  checklist.

No code outside these eight files changed.
