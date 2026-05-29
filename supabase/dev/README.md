# Supabase dev helpers (Phase 4 + Phase 4.1)

This directory holds **local-only** helpers for wiring Supabase Auth users to
`profiles` rows so you can exercise the role-based dashboards and verify Row
Level Security policies. None of these files contain production data and
**nothing in this directory should ever be committed with real UUIDs, real
emails, or passwords**.

There are two bootstrap workflows here:

- **Super admin bootstrap** (Phase 4.1) — link your own Supabase Auth user
  to a `super_admin` profile so you (the owner/operator) can sign in.
- **Seed test users** (Phase 4) — link the five demo profiles in
  `phase2_seed.sql` to Supabase Auth users so you can exercise every role.

## Bootstrap steps

1. **Apply the schema and seed.**
   - Run `supabase/migrations/20260517040000_phase2_schema.sql` in the SQL
     editor or via `supabase db push`.
   - Run `supabase/seed/phase2_seed.sql` to populate sample profiles and groups.
   - Run `supabase/migrations/20260518000000_phase4_rls.sql` to enable RLS.

2. **Create Supabase Auth users for each seed profile.**
   - In the Supabase dashboard go to **Authentication → Users → Add user**.
   - Create one user per seed profile email (see list below).
   - Pick a development-only password for each one. **Do not commit the
     password anywhere.** A password manager or local-only note is fine.

   Seed profile emails (from `supabase/seed/phase2_seed.sql`):

   | Email                          | Role             | Notes                                                       |
   |--------------------------------|------------------|-------------------------------------------------------------|
   | `avery.bennett@example.org`    | `ministry_admin` | Verifies admin dashboard access                             |
   | `jordan.hayes@example.org`     | `staff_viewer`   | Deprecated — routes to `/unauthorized` (Phase 5B.0 cleanup) |
   | `casey.morgan@example.org`     | `leader`         | Has 2 assigned groups (good test)                           |
   | `riley.cruz@example.org`       | `leader`         | Has 2 assigned groups                                       |
   | `taylor.kim@example.org`       | `leader`         | Has 1 assigned group                                        |

3. **Link each Supabase Auth user to its profile row.**
   - Copy the new auth user's UUID from the dashboard (under each user's
     details).
   - Copy `link_test_users.sql.example` to a local-only file:
     `cp supabase/dev/link_test_users.sql.example supabase/dev/link_test_users.sql`
     (the real `.sql` file is git-ignored).
   - Edit it, replacing the placeholder UUIDs with the real ones.
   - Run it via the Supabase SQL editor or `psql`.

4. **Verify the linkage.**
   ```sql
   select email, full_name, role, auth_user_id from profiles order by role, email;
   ```
   Every row you created an auth user for should now have a non-null
   `auth_user_id`.

## How to verify RLS is enforced

Once test users are linked, sign in to the app and confirm:

- The unauthenticated user is redirected to `/login` from `/admin`,
  `/admin/super-admin`, and `/leader`.
- `ministry_admin` lands on `/admin` and sees all 5 seeded groups.
  `/admin/super-admin` redirects them to `/unauthorized` (Phase 5A.3).
- `staff_viewer` is redirected to `/unauthorized` on sign-in (the
  `/staff` route was removed in the Phase 5B.0 cleanup; the role
  value is retained in the SQL enum for compat only).
- `leader` Casey lands on `/leader` and sees **both** assigned groups
  (Northside Young Adults and South Campus Women). They cannot reach
  `/admin` or `/admin/super-admin`.

You can also confirm RLS at the database level. In the Supabase SQL editor,
use the **Run as** dropdown to impersonate a specific user, then run:

```sql
select count(*) from groups;
```

Expected:
- Anonymous role → 0.
- Leader Casey → 2.
- Ministry admin → 5.

### SC.4 private care notes — boundary (the empirical cross-role + raw-DB check)

CI proves the SC.4 boundary statically (`lib/admin/__tests__/sc4-boundary-proof.test.ts`
asserts the creator-scoped RLS predicate, content-free audit, and ciphertext-only
note shape; `lib/supabase/__tests__/sc4-no-leak-exclusion.test.ts` proves no
non-admin / SC.2 / SC.3 read path references the tables; the crypto round-trip
tests prove ciphertext never contains the plaintext). The live RLS enforcement
across the full role matrix is verified here, the same "Run as" way as above.

After a `ministry_admin` has created a private note in the app, use the
**Run as** dropdown to impersonate each role and run:

```sql
select count(*) from shepherd_care_private_notes;
select count(*) from shepherd_care_note_key_slots;
```

Expected (the boundary): only the **creating** `ministry_admin` sees their own
rows. Everyone else sees **0** — a second `ministry_admin`, `super_admin`,
`over_shepherd`, `leader`, `co_leader`, and `staff_viewer` alike. The key-slot
table is fenced identically to the note table.

Confirm the at-rest guarantee with a raw read (service role / SQL editor, which
bypasses RLS): the `ciphertext`/`iv` and the key-slot `wrapped_dek` come back as
`\x…` bytea with **no plaintext** anywhere in the row, and there is no
server-side key to decrypt them.

```sql
select id, care_profile_id, ciphertext, iv, dek_version from shepherd_care_private_notes;
-- ciphertext is opaque bytea; scan the row for your known note text and confirm it is absent.
```

## Super admin bootstrap (Phase 4.1)

`super_admin` is the top-level owner/operator role. It is **not** seeded —
the owner brings their own Supabase Auth user and links it to a
`super_admin` profile via the helper below. Future write workflows
(Phase 5A) will let `super_admin` manage other admin and leader profiles
from inside the app, but for the very first owner, this is the only
bootstrap path.

1. **Create your own Supabase Auth user manually.** In the Supabase
   dashboard, go to **Authentication → Users → Add user** and create an
   account with your real email and a development-only password. Do not
   commit the password anywhere.
2. **Copy the Auth user UUID** from the user's detail panel.
3. **Copy the bootstrap helper to a git-ignored local file:**
   ```bash
   cp supabase/dev/link_super_admin.sql.example supabase/dev/link_super_admin.sql
   ```
   (`supabase/dev/link_super_admin.sql` is git-ignored.)
4. **Edit the local copy.** Inside the `do $$ … $$` block, replace all
   three placeholder values with your real ones:
   - `v_auth_user_id` (`00000000-0000-0000-0000-000000000000`)
   - `v_full_name` (`Owner Admin`)
   - `v_email` (`owner@example.org`)

   The block hard-aborts with a `raise exception` if any of the three
   placeholders is still present, so running the file unedited never
   creates a bogus super_admin row — you must edit all three before the
   insert/upsert will execute.
5. **Run it in the Supabase SQL Editor.** The insert uses
   `INSERT … ON CONFLICT (email) DO UPDATE`, so it works whether or not a
   placeholder profile already exists for that email.
6. **Verify:**
   ```sql
   select email, full_name, role, auth_user_id
     from public.profiles
    where role = 'super_admin';
   ```
   You should see exactly one row, with your real `auth_user_id` populated.

After this, sign in at `/login` with the email + password you set in
step 1.

## Manual test checklist (Phase 4.1 + Phase 5A.3)

Run this checklist after the seed test users and at least one
`super_admin` are linked. Each item is a manual sign-in test against the
deployed app or a local `npm run dev` instance.

- [ ] `super_admin` can access `/admin`, `/admin/people`,
      `/admin/groups`, and `/admin/super-admin`.
- [ ] `super_admin` **cannot** access `/leader` at all — they are
      redirected to `/unauthorized`. This is expected: `requireLeader()`
      in `lib/auth/session.ts` calls `requireRole(["leader", "co_leader"])`,
      which rejects on role *before* any `group_leaders` assignments are
      considered. Adding a `group_leaders` row to a super_admin profile
      does **not** grant `/leader` access. If the owner needs to see the
      leader view in practice, that is a Phase 5A design question (e.g.
      an explicit "view as leader" affordance) and not a bug in the
      current role gating.
- [ ] `ministry_admin` can access `/admin`, `/admin/people`, and
      `/admin/groups`.
- [ ] `ministry_admin` is redirected to `/unauthorized` from
      `/admin/super-admin` (Phase 5A.3).
- [ ] `staff_viewer` is redirected to `/unauthorized` on sign-in. The
      `/staff` route was removed in the Phase 5B.0 cleanup; the enum
      value remains for compatibility but is no longer promoted in
      navigation.
- [ ] `leader` can access `/leader` only and sees their assigned groups
      only.
- [ ] A signed-in Auth user with **no** linked `profiles` row is sent to
      `/unauthorized`.
- [ ] A logged-out visitor of `/admin`, `/admin/super-admin`, or
      `/leader` is sent to `/login`.
- [ ] In the Supabase SQL editor, the `anon` database role sees zero
      operational rows after RLS (`select count(*) from groups;` → 0).
- [ ] Casey leader (`casey.morgan@example.org`) still sees exactly two
      assigned groups in seed data (Northside Young Adults and South
      Campus Women).
- [ ] On `/admin/super-admin`, the super_admin can change a test leader
      to `ministry_admin` and back, and each change records an
      `super_admin.update_profile_role` row in the Audit log panel
      above. Self-target, `super_admin`, and `staff_viewer` choices are
      rejected.

## What's intentionally excluded

- No service role usage anywhere in the app code.
- No real church data beyond the operator's own auth account.
- No real passwords committed; passwords stay in a password manager or a
  local-only note.
- No INSERT / UPDATE / DELETE policies for app workflows; the first narrow
  set ships in Phase 5A (`docs/PHASE_5A_ADMIN_MANAGEMENT.md`), and the
  broader operational write workflows ship in Phase 5B.
