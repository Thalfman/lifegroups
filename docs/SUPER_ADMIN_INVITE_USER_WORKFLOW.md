# Super Admin Invite User Workflow

## Purpose

Lets the super admin invite a real human (Julian, another ministry admin,
or a new leader/co-leader) from `/admin/super-admin` in one audited
workflow. The workflow creates or reuses a Supabase Auth user, sends a
real invite email, links `public.profiles.auth_user_id` to the Supabase
Auth user id, sets `profiles.status='active'`, optionally
creates/reactivates a `group_leaders` assignment, and writes one
`audit_events` row — all in a single Postgres transaction.

Existing `/admin/people` "Add leader" creates a profile row but does NOT
create or link a Supabase Auth user, so an invited person can't actually
log in. This workflow closes that gap.

## Why an Edge Function

Supabase Auth Admin APIs (`auth.admin.inviteUserByEmail`,
`auth.admin.listUsers`) require the service-role key. To keep the
service-role key out of the Next runtime, all auth-admin calls happen in
a trusted Deno Edge Function (`supabase/functions/invite-user`). The
Next app only forwards a validated payload and the caller's JWT.

## Why no service role in Next runtime

Hard rule: `service_role`, `SUPABASE_SERVICE_ROLE_KEY`, `supabaseAdmin`,
`auth.admin.*`, and `inviteUserByEmail` must not appear in `app/`,
`components/`, `lib/`, or `middleware.ts`. The Next runtime can be
attacked through dependency compromise or developer error; the service
role would let an attacker create or delete arbitrary auth users. The
Edge Function isolates the blast radius behind:

1. A JWT verification step (anon client),
2. A profile-status + super_admin role gate,
3. A SECURITY DEFINER RPC that re-verifies the actor and is granted
   only to `service_role`.

## Role access

- Only an active super_admin profile can invoke the Edge Function.
- The Next server action (`superAdminInviteUser`) calls
  `requireSuperAdminSession()` before invoking the Edge Function.
- The Edge Function re-verifies the caller's profile via the service-role
  client.
- The SECURITY DEFINER RPC re-verifies the actor a third time.

Defense in depth: a request from a ministry_admin, leader, or co_leader
session will be rejected at every layer.

## Data flow

```
Browser (super admin)
  │
  │  POST  (Next server action)
  ▼
Next runtime
  │   - requireSuperAdminSession()
  │   - validateInviteUserPayload()
  │   - createSupabaseServerClient() (SSR — anon key + caller cookies)
  │
  │  client.functions.invoke("invite-user", { body })
  ▼
Supabase Edge Function (Deno, holds service-role key)
  │   - Verify caller JWT via anon client → callerAuthId
  │   - service-role profiles lookup (.limit 2) → super_admin gate
  │   - validatePayload()
  │   - findAuthUserByEmail() OR auth.admin.inviteUserByEmail()
  │
  │  service.rpc("super_admin_complete_invite", {...})
  ▼
Postgres (super_admin_complete_invite — SECURITY DEFINER, service_role only)
  │   - JWT-role gate (must be service_role)
  │   - Actor re-verify (super_admin + active)
  │   - Profile upsert (relink by canonical email OR insert)
  │   - Optional group_leaders upsert (leader/co_leader + group_id)
  │   - audit_events insert
  │   - one transaction; rolls back as a unit on any failure
```

## Auth user invite behavior

When no Supabase Auth user exists for the canonicalized email, the Edge
Function calls `auth.admin.inviteUserByEmail(email, { data: { full_name },
redirectTo })`. Supabase sends the standard invite email; the recipient
clicks through to `${SITE_URL}/reset-password?code=...`, the existing
reset-password page exchanges the code for a recovery session, the user
sets a password, and they land at `/login?reset=ok`. After login, the
existing role-based routing in `defaultLandingPathForRole` sends:

- `ministry_admin` (Julian's case) → `/admin`
- `leader` / `co_leader` → `/leader`

`redirectTo` reads `SITE_URL` (fallback `NEXT_PUBLIC_SITE_URL`) from the
Edge Function secrets. When unset, Supabase Auth uses the project's
configured Site URL.

## Existing Auth user behavior

When an Auth user already exists for the email (e.g. they were created
manually or by a previous invite attempt), the Edge Function reuses that
auth user id and skips the invite email. The response sets
`authUserState='existing_reused'`. The user can sign in with their
existing credentials, or use Forgot password if needed.

## Existing profile row behavior

The Edge Function resolves a profile by canonical (lowercased) email:

- **No row exists** → insert new profile with the resolved auth user id,
  status='active', and the submitted fields. State: insert.
- **One row exists, role ≠ super_admin** → update its `auth_user_id`,
  `full_name`, `phone`, `role`, and force `status='active'`. The audit
  `before` field records the prior role/status and whether the
  auth_user_id changed.
- **One row exists, role = super_admin** → refuse with
  `forbidden_target`. The form cannot modify an existing super_admin row.
- **Multiple rows exist for the same email** → `profile_write_conflict`
  is impossible in practice (`profiles.email` is `unique`), but if the
  insert path races a concurrent writer, the unique-violation maps to
  `profile_write_conflict` and the caller can retry.

A migration in this phase backfills `profiles.email` to lowercase and
adds a `profiles_email_lowercase` CHECK constraint so the relink path
cannot miss matches due to mixed case.

## Profile status behavior

Invited profiles are set to `status='active'` immediately. The current
login flow blocks any profile whose status is not `active`, so any other
choice would force the invitee to wait for a second admin action before
they could log in. Introducing an "invited" lifecycle state is out of
scope for this phase.

## Leader group assignment behavior

Only meaningful for `role` ∈ {`leader`, `co_leader`} and only when a
`group_id` is selected:

- The group must exist (`missing_group` otherwise).
- The Edge Function looks up the existing `(group_id, profile_id, role)`
  row:
  - missing → insert with `active=true`, state `created`
  - exists and `active=true` → state `already_active` (no write)
  - exists and `active=false` → set `active=true`, state `reactivated`

`ministry_admin` + a `group_id` is rejected at every layer
(`group_not_allowed_for_ministry_admin`).

## Audit behavior

Every successful invite writes exactly one row to `public.audit_events`
inside the same Postgres transaction as the profile and group_leaders
writes. Shape:

| Column            | Value |
|-------------------|-------|
| `actor_profile_id` | Verified caller (super_admin) profile id |
| `action`          | `super_admin.invite_user` |
| `entity_type`     | `profiles` |
| `entity_id`       | Resolved/new profile id |
| `metadata`        | See below |

Metadata:

```json
{
  "email": "julian@example.com",
  "role": "ministry_admin",
  "authUserState": "invited",
  "groupAssignmentState": "none",
  "groupId": null,
  "method": "edge_function",
  "before": {
    "role": null,
    "status": null
  },
  "after": { "role": "ministry_admin", "status": "active" }
}
```

When relinking an existing profile, `before` includes the prior role,
status, whether the auth_user_id was already set, and whether the
auth_user_id changed in this call.

The audit row is visible in the Audit panel on `/admin/super-admin`
(audit_events RLS already allows super_admin reads).

## Manual verification checklist

- [ ] `npm run lint` clean
- [ ] `npx tsc --noEmit` clean
- [ ] `npm run build` succeeds
- [ ] Sign in as super_admin → `/admin/super-admin` shows the Invite
      user card under the Access section. Role select shows only
      Ministry Admin / Leader / Co-Leader.
- [ ] Sign in as ministry_admin → cannot reach `/admin/super-admin`.
- [ ] Sign in as leader / co_leader → cannot reach
      `/admin/super-admin`.
- [ ] Invite Julian as Ministry Admin, no group → success banner →
      receive invite email → click → set password → land on `/admin`.
- [ ] Invite a Leader, pick a group → success banner → invite email →
      set password → land on `/leader`; the assigned group appears in
      their leader assignments.
- [ ] Invite a Co-Leader, no group → success banner with
      `groupAssignmentState=none`.
- [ ] Re-invite the same email → `authUserState=existing_reused`,
      `groupAssignmentState=already_active` (when the same group is
      selected). No duplicate profile row.
- [ ] Tamper to send a `group_id` with `role=ministry_admin` → action
      rejects (`invalid_payload`) without hitting the Edge Function.
- [ ] Invite using an email already used by a super_admin profile →
      `cannot_modify_super_admin_profile`, no DB change.
- [ ] Audit Trail panel shows a `super_admin.invite_user` row with the
      correct metadata.
- [ ] `/admin/people` reflects the new profile after revalidation.
- [ ] Existing login, `/forgot-password`, `/reset-password` flows still
      work.
- [ ] Existing test-accounts workflow (other Edge Function) still
      works.
- [ ] On mobile at 390 px and 430 px, `/admin/super-admin` has no
      horizontal overflow.

## Known limitations

1. **Auth user can be created without a profile if the RPC fails.**
   Order is auth-then-RPC: a freshly-created Supabase Auth user
   persists if the subsequent RPC call fails. Recovery: retry with the
   same email; `findAuthUserByEmail` reuses the existing auth user and
   completes the profile write. We don't auto-delete the auth user
   because hard deletes are forbidden and a transient RPC failure
   shouldn't destroy a real auth user. Warnings in the action response
   surface this case to the operator.
2. **`profiles.phone` has no uniqueness constraint.** Multiple profiles
   can share a phone (family). Intentional.
3. **Invite email delivery is not transactional with the DB write.**
   Supabase Auth handles delivery; the atomic guarantee is over the
   database state (profiles + group_leaders + audit_events).
4. **No "invited" lifecycle state.** Status is forced to `active`. A
   future phase could add a transitional `invited` status with a login
   guard that allows password-set but blocks other reads.

## Rollback notes

Code:

```
git revert <commit>
```

This reverts the Edge Function, server action, form, shell, page, and
docs changes. The migration must be rolled back separately if it was
applied. To roll back the migration on a database, apply a follow-up
migration like:

```sql
drop function if exists public.super_admin_complete_invite(
  uuid, uuid, text, text, public.user_role, text, uuid, text
);

alter table public.profiles drop constraint if exists profiles_email_lowercase;
```

The email backfill is non-destructive — no rollback needed.

To undeploy the Edge Function:

```
supabase functions delete invite-user
```

## Future improvements

- Add a transitional `profile_status='invited'` and have login allow
  password-set only for that status. Trade-off: changes the login state
  machine and forces a second admin action to flip the user to
  `active`.
- Surface invite email delivery status in the form (Supabase doesn't
  return delivery confirmation today; would need a webhook).
- Generic "resend invite" affordance from `/admin/people` once an
  invited person hasn't logged in for N days.
- Promote `super_admin_complete_invite` arguments from positional to a
  single jsonb payload if the call site grows additional parameters.
