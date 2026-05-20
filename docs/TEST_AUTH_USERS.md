# Test auth users

Temporary, real Supabase Auth users for role / mobile / privacy testing.
They sign in through the normal `/login` page — there is no fake-login UI,
no role toggle, and no Supabase Auth bypass.

## Known test users

| Email                                 | App role         | Group                   |
| ------------------------------------- | ---------------- | ----------------------- |
| `test.admin@lifegroups.local`         | `ministry_admin` | none                    |
| `test.leader1@lifegroups.local`       | `leader`         | TEST Life Group A       |
| `test.leader2@lifegroups.local`       | `leader`         | TEST Life Group B       |
| `test.coleader@lifegroups.local`      | `co_leader`      | TEST Life Group A       |

Passwords are never stored or displayed in this repo. They live only in
the Edge Function's environment (set via `supabase secrets`) and, for
the optional manual scripts, in the operator's local `.env.local`.

`leader2` is intentionally on a different group from `leader1` so the
operator can verify cross-leader privacy isolation: leader1's data
(follow-ups, guests, attendance, private notes) must not be visible to
leader2.

## Two paths to enable / disable

The primary path is the **Edge Function + super-admin UI**. The
secondary path is a pair of **manual CLI scripts**. They share the
same `KNOWN_TEST_EMAILS` allow-list logic.

---

## Primary path: super-admin UI panel

A "Test accounts" panel under `/admin/super-admin` (visible only to
`super_admin`) calls the Supabase Edge Function
`manage-test-auth-users` with one of three actions: `status`,
`enable`, `disable`.

### One-time setup

1. **Set the Edge Function secrets.** From the repo root with the
   Supabase CLI authenticated against the target project:

   ```sh
   supabase secrets set \
     ENABLE_TEST_AUTH_USERS=true \
     TEST_ADMIN_PASSWORD='...' \
     TEST_LEADER1_PASSWORD='...' \
     TEST_LEADER2_PASSWORD='...' \
     TEST_COLEADER_PASSWORD='...'
   ```

   `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_ANON_KEY`
   are auto-injected by Supabase into every Edge Function — you don't
   set them yourself.

2. **Deploy the Edge Function:**

   ```sh
   supabase functions deploy manage-test-auth-users
   ```

   The function is registered in `supabase/config.toml` with
   `verify_jwt = true`, so the Supabase gateway will reject calls
   that don't carry a valid Supabase Auth JWT before the function
   even runs.

3. **Sign in as super_admin** and open `/admin/super-admin`. The
   "Test accounts" panel renders at the bottom of the page.

### From the panel

- **Refresh status** — read-only summary of which test users / groups
  currently exist. Safe to run any time.
- **Enable test accounts** — creates/updates the four auth users
  (with `email_confirm: true`), upserts the matching profiles, and
  assigns leaders/co-leader to `TEST Life Group A` / `TEST Life
  Group B` (created with safe schedules — Wed 18:30 / Thu 18:30
  weekly — if they don't already exist). Requires confirmation;
  remote-Supabase targets show a stronger warning.
- **Disable test accounts** — deletes the four test auth users,
  deactivates the matching profiles (`status='inactive'`,
  `auth_user_id=null`), deactivates their `group_leaders` rows
  (`active=false`), and archives `TEST Life Group A` / `B` when
  unambiguously test-owned (single row, no active leaders left,
  not already closed). Hard-deletes nothing. Always requires
  confirmation.

The panel never displays passwords, the service-role key, or stack
traces. Errors and warnings are pre-redacted server-side.

### Phone walkthrough

1. **Push your branch and let Vercel deploy.**
2. **Sign in as your real super_admin** at the deployed `/login`.
3. Open `/admin/super-admin` on the phone. Tap **Refresh status**, then
   **Enable test accounts**. Confirm.
4. **Sign out.** Sign back in as each test user in turn from the
   phone:
   - `test.admin@lifegroups.local` — confirm `/admin`, `/admin/people`,
     `/admin/groups` work; confirm `/admin/super-admin` redirects
     them to `/unauthorized`.
   - `test.leader1@lifegroups.local` — confirm `/leader` shows
     `TEST Life Group A` only.
   - `test.leader2@lifegroups.local` — confirm `/leader` shows
     `TEST Life Group B` only, with **no** leader1 data visible
     (follow-ups, guests, attendance, private notes).
   - `test.coleader@lifegroups.local` — confirm co-leader access to
     `TEST Life Group A` works.
5. Sign back in as super_admin. Open `/admin/super-admin`. Tap
   **Disable test accounts**, confirm. Tap **Refresh status** —
   every row should report `deleted` / `inactive` /
   `deactivated`.

---

## Secondary path: manual CLI scripts

Useful for headless workflows. Same allow-list logic; never wired
into `build`, `dev`, `start`, `postinstall`, or any deploy hook.

### Required env (in `.env.local`)

```sh
ENABLE_TEST_AUTH_USERS=true
ALLOW_TEST_USERS_ON_REMOTE_SUPABASE=true   # only when intentionally targeting remote Supabase
CONFIRM_REMOVE_TEST_AUTH_USERS=true        # only when running remove:test-auth

NEXT_PUBLIC_SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...

TEST_ADMIN_EMAIL=test.admin@lifegroups.local
TEST_ADMIN_PASSWORD=...
TEST_LEADER1_EMAIL=test.leader1@lifegroups.local
TEST_LEADER1_PASSWORD=...
TEST_LEADER2_EMAIL=test.leader2@lifegroups.local
TEST_LEADER2_PASSWORD=...
TEST_COLEADER_EMAIL=test.coleader@lifegroups.local
TEST_COLEADER_PASSWORD=...
```

### Run

```sh
npm run seed:test-auth                # create / update test users
npm run seed:test-auth -- --dry-run   # preview without mutating

npm run remove:test-auth              # delete auth users + deactivate
npm run remove:test-auth -- --dry-run # preview without mutating
```

The scripts refuse to run unless:

- `ENABLE_TEST_AUTH_USERS=true`
- `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set
- all four `TEST_*_EMAIL` / `TEST_*_PASSWORD` pairs are set
- every test email matches one of `KNOWN_TEST_EMAILS`
- if the URL is not local (`localhost`, `127.0.0.1`, `::1`, or a
  `.supabase.internal` host): `ALLOW_TEST_USERS_ON_REMOTE_SUPABASE=true`
- if `NODE_ENV=production`: `ALLOW_TEST_USERS_ON_REMOTE_SUPABASE=true`
- for `remove:test-auth`: also `CONFIRM_REMOVE_TEST_AUTH_USERS=true`

`--dry-run` validates env + guards and prints the planned actions
without calling `createUser` / `updateUserById` / `deleteUser` and
without mutating any database row.

---

## Why the service-role key is safe here

- It is **only** held by (a) the Supabase Edge Function (Supabase's
  trusted runtime) and (b) the operator-local manual scripts.
- It is **never** imported into `app/`, `components/`, `lib/`,
  `middleware.ts`, route handlers, server actions, or shared app
  helpers. Verify any time with:

  ```sh
  rg -n "service_role|SERVICE_ROLE|SUPABASE_SERVICE|sb_secret|supabaseAdmin" \
      app components lib middleware.ts
  ```

  Expected output: no hits.

The Edge Function does write directly to `profiles`, `groups`, and
`group_leaders` via the service-role client. That pattern lives only
in the Edge Function and the manual scripts — do not copy it into the
Next app.

---

## Before-launch cleanup checklist

- [ ] Sign in as super_admin → `/admin/super-admin` → **Disable test
      accounts** → **Refresh status**. Confirm every test row shows
      `deleted` / `inactive` / `deactivated`.
- [ ] Search production Supabase Auth (dashboard) for `test.` and
      `lifegroups.local`. Remove any remaining users manually.
- [ ] Confirm none of the known passwords work at the deployed
      `/login`.
- [ ] On the production Edge Function: set
      `ENABLE_TEST_AUTH_USERS=false` (or unset it) via
      `supabase secrets unset ENABLE_TEST_AUTH_USERS`. After this,
      the Edge Function's `enable` and `disable` actions refuse to
      run — `status` continues to work for verification.
- [ ] Confirm `ALLOW_TEST_USERS_ON_REMOTE_SUPABASE` is not set in any
      production-adjacent local environment.
- [ ] Run the service-role greps above and confirm zero hits in
      `app/`, `components/`, `lib/`, `middleware.ts`.
- [ ] Confirm `package.json` does not wire `seed:test-auth` or
      `remove:test-auth` into `build`, `dev`, `start`, or
      `postinstall`.
- [ ] Confirm no fake-login UI, role toggle, `staff_viewer` test
      user, or extra `super_admin` test user exists.

---

## Known limitations

- Cleanup deactivates `profiles` and `group_leaders` rows rather than
  deleting them, to preserve referential integrity with
  `audit_events` / attendance / follow_ups / group history.
- `TEST Life Group A` / `B` are archived (`lifecycle_status='closed'`,
  `closed_at` set) when unambiguously test-owned — never
  hard-deleted.
- The Edge Function uses direct INSERT/UPDATE via the service-role
  client rather than the admin RPCs, because a service-role context
  has no signed-in admin `auth.uid()` for an `auth_is_admin()` gate.
  The Next app continues to use the RPC path.
- `KNOWN_TEST_EMAILS` is duplicated between
  `supabase/functions/manage-test-auth-users/known-test-emails.ts`
  (Deno) and `scripts/test-auth-shared.ts` (Node). The two lists
  must stay identical; the allow-list is only four strings.
