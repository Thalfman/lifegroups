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

1. **Set the Edge Function secrets.** Two equivalent paths — pick one.

   **Path A — Supabase CLI (laptop):** From the repo root with the
   Supabase CLI authenticated against the target project:

   ```sh
   supabase secrets set \
     ENABLE_TEST_AUTH_USERS=true \
     TEST_ADMIN_PASSWORD='...' \
     TEST_LEADER1_PASSWORD='...' \
     TEST_LEADER2_PASSWORD='...' \
     TEST_COLEADER_PASSWORD='...'
   ```

   **Path B — Supabase Dashboard (mobile or browser):** See
   [Adding Edge Function secrets from Supabase mobile/browser](#adding-edge-function-secrets-from-supabase-mobilebrowser)
   below.

   `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_ANON_KEY`
   are auto-injected by Supabase into every Edge Function — you don't
   set them yourself.

   `ALLOW_TEST_USERS_ON_REMOTE_SUPABASE` is **not** an Edge Function
   secret. It's only read by the manual Node CLI scripts in `scripts/`.
   Don't add it to the Edge Function.

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

### Adding Edge Function secrets from Supabase mobile/browser

The Supabase Dashboard works fine on mobile — you don't need a laptop
to set or rotate these secrets.

1. Open the Supabase Dashboard for the target project.
2. **Edge Functions** → tap **`manage-test-auth-users`** → **Secrets**
   tab → **Add new secret**.
3. Add each row below. Use real, strong passwords for the four
   `TEST_*_PASSWORD` entries — these placeholders are documentation
   only, not real values to copy:

   ```
   ENABLE_TEST_AUTH_USERS=true
   TEST_ADMIN_PASSWORD=<strong-password>
   TEST_LEADER1_PASSWORD=<strong-password>
   TEST_LEADER2_PASSWORD=<strong-password>
   TEST_COLEADER_PASSWORD=<strong-password>
   ```

4. After saving, redeploy the function (or wait for the next cold
   start — new secret values are picked up on the next invocation).
5. Reopen `/admin/super-admin` and tap **Refresh status** to confirm.

> ⚠️ **Vercel env vars are not Supabase Edge Function secrets.** Setting
> `TEST_ADMIN_PASSWORD` (etc.) in Vercel has no effect on the Edge
> Function. Vercel env vars and Supabase Edge Function secrets are
> two separate stores. Always add these in the Supabase Dashboard,
> never in Vercel.

> ⚠️ **Never commit real passwords.** The repo only knows secret
> *names*. Real values live only in Supabase Edge Function secrets and
> (for the manual scripts) the operator's local `.env.local`.

### Interpreting panel errors

The panel now surfaces the HTTP status and a structured error code
instead of the generic "Edge Function returned a non-2xx status code"
message. Mapping:

| Status / code                              | Meaning                                                                                              | Fix                                                                                                                  |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `401 missing_authorization_header`         | The Next.js app didn't send the signed-in user's bearer token to the Edge Function.                  | Sign out and back in at `/login`, then retry. If it persists, the SSR session cookie isn't being forwarded.          |
| `401 invalid_or_expired_session`           | Supabase Auth rejected the bearer token (expired, revoked, or for a different project).              | Sign out and back in at `/login`, then retry.                                                                        |
| `403 profile_not_found`                    | The auth user is valid but no row in `profiles` has `auth_user_id = <your-auth-user-id>`.            | Ask an existing super admin to create / link your profile.                                                           |
| `403 profile_not_active`                   | Your profile exists but `status` is not `active` (it's `inactive` or `invited`).                     | Ask an existing super admin to reactivate the profile.                                                               |
| `403 super_admin_required` / `forbidden`   | The signed-in profile is active but its `role` is not `super_admin`.                                 | Sign in as the real super_admin. The panel is only usable by the actual super_admin.                                 |
| `404 function_not_deployed_or_wrong_name`  | The function isn't deployed under that name in this project.                                         | `supabase functions deploy manage-test-auth-users`.                                                                  |
| `500 authorization_check_failed`           | The Edge Function hit a runtime error while querying `profiles` for your role (e.g. stale service-role key, schema mismatch). | Check the Supabase function logs for `event:"auth.profile"` — the structured log line names the `errorClass` / `pgCode`. Common cause: rotated `SUPABASE_SERVICE_ROLE_KEY` not picked up by the function. |
| `500 missing_edge_function_env`            | Required Edge Function secrets are missing. The panel lists which ones in a third bullet.            | Add the listed secrets in Supabase Dashboard → Edge Functions → `manage-test-auth-users` → Secrets, then redeploy.    |
| `500 test_account_seed_failed` (or other)  | The function ran but a step failed (schema mismatch, transient DB error, etc.).                      | Check Supabase function logs; check per-row `errors[]` in the panel; retry.                                          |

The panel never displays passwords, the service-role key, JWTs, or
stack traces. Free-text error fragments are redacted server-side and
client-side before render.

**Important constraints on the panel:**

- The Test Accounts panel is only usable when signed in as the real
  `super_admin`. None of the four `test.*@lifegroups.local` accounts
  can open it (they're not `super_admin`), so test accounts cannot
  enable or disable themselves.
- **Vercel environment variables do not replace Edge Function
  secrets.** `ENABLE_TEST_AUTH_USERS` and `TEST_*_PASSWORD` must be
  set in Supabase Dashboard → Edge Functions →
  `manage-test-auth-users` → Secrets, followed by a redeploy.
  Setting them in Vercel has no effect on the Edge Function runtime.

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
