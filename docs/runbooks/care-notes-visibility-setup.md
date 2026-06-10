# Runbook: Turning on the three Care-section note fields

**Audience:** Super Admin / Ministry Admin operating the live app.
**Goal:** Make the per-role Care note fields reachable and visible end-to-end for
**Leaders**, **Over-Shepherds**, and **Admins**.

> **The fields already exist in code** (Pivot slices 9 & 11 — ADR
> [0017](../adr/0017-reopen-leader-os-logins-and-care-notes.md),
> [0020](../adr/0020-leader-care-note-is-group-scoped.md)). They don't show up until the
> **gate in front of each surface** is opened. Nothing here requires a deploy — it is
> configuration plus one account decision.

## The model (what you're turning on)

| Role                   | Note field                                              | Stored in                                               | Visibility                                                                                                |
| ---------------------- | ------------------------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| **Leader / Co-Leader** | Care Notes + Prayer Requests **about their group**      | `care_notes` / `prayer_requests` (`subject_group_id`)   | Author-private. Sealed by default.                                                                        |
| **Over-Shepherd**      | Care Notes + Prayer Requests **about a covered leader** | `care_notes` / `prayer_requests` (`subject_profile_id`) | Author-private. Sealed by default.                                                                        |
| **Ministry Admin**     | Encrypted **Private note**                              | `shepherd_care_private_notes`                           | Creator-only — even Super Admin cannot read it (ADR [0003](../adr/0003-private-care-note-encryption.md)). |

Admins read a leader's / over-shepherd's sealed notes **only** when that leader's
per-person **transparency toggle** is ON (`note_transparency_grants`, Ministry-Admin
controlled, **default OFF / sealed**). Super Admin sees exactly what a Ministry Admin sees —
no broader bypass. Logic lives in `lib/admin/care-note-visibility.ts`; RLS enforces it in
`supabase/migrations/20260608090000_phase_pivot9_care_notes.sql`.

---

## 1. Leader notes — ON by default; verify, don't flip

The Leader surface is behind the `leader_surface` **frozen-surface flag** (verify-before-flip,
ADR [0009](../adr/0009-runtime-flags-may-reenable-frozen-surfaces.md)). It resolves live only
when `{ enabled: true, verified: true }` (`lib/admin/feature-flags.ts` → `resolveFlag`).

- `verified: true` was set by migration
  `supabase/migrations/20260608040000_phase_pivot10_leader_surface.sql` (the route + RLS
  re-audit landed with it).
- `enabled: true` is now **seeded by default** (ADR
  [0024](../adr/0024-default-on-leader-surface-and-groups-people-nav.md), migration
  `supabase/migrations/20260701020000_default_on_leader_surface_and_nav.sql`).
- The Super Admin Console toggle **only ever sets `enabled`** — never `verified`
  (`app/(protected)/admin/super-admin/feature-flag-actions.ts`) — so it remains the
  off-switch if you need to close Leader logins.

**Action (Super Admin):** none required. Confirm the **Super Admin Console** → **Feature
flags** card shows **"Leader surface"** as On; toggle it OFF only to close the surface.

While ON, `requireLeader` (`lib/auth/session.ts`) admits active `leader` / `co_leader` users,
and `/leader/<groupId>/care` (`app/(protected)/leader/[groupId]/care/page.tsx`) renders the
`GroupNoteWriteForm`.

> ⚠️ **Scope:** this opens the **entire** `/leader/*` surface (dashboard, care, calendar), not
> just care notes. Weekly check-ins stay frozen behind their own `check_ins` flag.

---

## 2. Over-Shepherd notes — data setup (in order)

No feature flag. An over-shepherd needs three things to line up: the **role**, a matching
**roster row** (the email login bridge), and an active **coverage assignment**.

1. **Add the roster row.** `/admin/shepherd-care/over-shepherds` → `OverShepherdCreateForm`
   (`admin_create_over_shepherd`). The **email** entered here is the bridge key.
2. **Give the person the role.** Either invite them as **Over-shepherd**
   (`components/admin/forms/invite-workflow-form.tsx`) or change an existing profile's role
   (`components/admin/forms/role-change-form.tsx` → `super_admin_update_profile_role`).
   - The profile email **must match the roster email** — case-insensitive, trimmed, and
     **exactly one** active roster row. Zero or multiple matches = no access
     (`supabase/migrations/20260529001000_phase_os2_over_shepherd_login_bridge.sql`,
     `auth_over_shepherd_id`).
3. **Assign coverage.** On each leader's `/admin/shepherd-care/<profileId>` →
   `CoverageAssignmentForm` (`admin_assign_shepherd_to_over_shepherd`), assign that leader to
   the over-shepherd. Reassignment is atomic (ends any prior active assignment).
4. **Use it.** The over-shepherd logs in → `/over-shepherd` ("My Leaders") → opens a covered
   leader → writes a Care Note / Prayer Request
   (`app/(protected)/over-shepherd/[profileId]/page.tsx`, `CareNoteWriteForm`).

---

## 3. Admin notes — account decision + enrollment

The encrypted **Private note** is **Ministry-Admin-only and hidden from Super Admin by design**
(ADR [0002](../adr/0002-oversight-ladder-and-leader-gating.md);
`app/(protected)/admin/shepherd-care/[profileId]/page.tsx` builds the tab only when
`actorRole === "ministry_admin"`).

- **If you're testing as Super Admin, the admin note field will never appear.** To use it,
  operate from a **Ministry Admin** account, open a leader's
  `/admin/shepherd-care/<profileId>` → **"Private note"** tab, enroll (passkey + recovery code),
  then write (`components/admin/shepherd-care/private-notes-section.tsx`). Losing every unlock
  method means the note is unrecoverable — there is no server-side reset.
- Want the admin note visible to Super Admin too? That is a deliberate boundary change to the
  creator-only encrypted model (ADR 0002 / 0003) and is a code task, not configuration.

**Admins writing Care Notes / Prayer Requests (ADR
[0023](../adr/0023-all-notes-feed-and-admin-authorship.md)):** a Ministry/Super Admin can now
author the same author-private Care Notes + Prayer Requests about any active leader — inline
from `/admin/care` (each leader panel's **"Grades & notes"** section hosts the write forms).
Admin-authored notes follow the same model: private to their author until the subject's
toggle is on.

**Admins reading leader / over-shepherd notes:** on the leader's
`/admin/shepherd-care/<profileId>` → **"Care notes & prayer"** tab — or inline from the Care
accordion or the **Notes** tab's sealed summary — flip that leader's transparency toggle ON
(`NoteTransparencyToggle`). Default OFF = sealed. The **Notes** tab (`/admin/care?view=notes`)
shows everything you can already read in one feed, plus counts of what stays sealed.

---

## Verification

1. **Flag:** Super Admin Console shows "Leader surface" as **On** (resolved `enabled` +
   `verified`). Optional read-only check: `platform_config.feature_flags.leader_surface`.
2. **Leader:** sign in as an active leader assigned to a group → `/leader/<groupId>/care` →
   write a Care Note → it reads back; another leader cannot see it.
3. **Over-Shepherd:** sign in as the over-shepherd → `/over-shepherd` lists covered leaders →
   open one → write a note → it reads back.
4. **Admin (Ministry Admin):** `/admin/shepherd-care/<profileId>` → enroll + write a Private
   note; flip the leader's transparency toggle ON and confirm the leader/OS notes become
   readable, OFF and confirm they seal again.

Visibility logic is pinned by existing tests (`lib/admin/__tests__/`,
`app/(protected)/leader/[groupId]/care/__tests__/care-actions.test.ts`).
