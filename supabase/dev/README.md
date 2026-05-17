# Supabase dev helpers (Phase 4)

This directory holds **local-only** helpers for wiring Supabase Auth users to
the seed `profiles` rows so you can exercise the role-based dashboards and
verify Row Level Security policies. None of these files contain production
data and **nothing in this directory should ever be committed with real UUIDs,
real emails, or passwords**.

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

   | Email                          | Role             | Notes                              |
   |--------------------------------|------------------|------------------------------------|
   | `avery.bennett@example.org`    | `ministry_admin` | Verifies admin dashboard access    |
   | `jordan.hayes@example.org`     | `staff_viewer`   | Verifies staff read-only view      |
   | `casey.morgan@example.org`     | `leader`         | Has 2 assigned groups (good test)  |
   | `riley.cruz@example.org`       | `leader`         | Has 2 assigned groups              |
   | `taylor.kim@example.org`       | `leader`         | Has 1 assigned group               |

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
  `/leader`, and `/staff`.
- `ministry_admin` lands on `/admin` and sees all 5 seeded groups.
- `staff_viewer` lands on `/staff` and sees the same data with a read-only
  badge. They cannot reach `/admin` (redirected to `/unauthorized`).
- `leader` Casey lands on `/leader` and sees **both** assigned groups
  (Northside Young Adults and South Campus Women). They cannot reach
  `/admin` or `/staff`.

You can also confirm RLS at the database level. In the Supabase SQL editor,
use the **Run as** dropdown to impersonate a specific user, then run:

```sql
select count(*) from groups;
```

Expected:
- Anonymous role → 0.
- Leader Casey → 2.
- Ministry admin → 5.

## What's intentionally excluded

- No service role usage anywhere in the app code.
- No real church data, no real people, no real passwords.
- No INSERT / UPDATE / DELETE policies; those ship in Phase 5.
