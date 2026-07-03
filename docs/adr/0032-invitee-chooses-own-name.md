# Invitees choose their own name

**Status:** Accepted

The named invite flows (email invite and "Copy invite link" on the
super-admin Invite-someone card) required the inviter to type the invitee's
full name. `super_admin_complete_invite` wrote that name into
`profiles.full_name` at invite time — overwriting the existing name on the
relink-by-email path. The anonymous shareable link (Phase IL.1) already let
the invitee enter their own name at `/invite/<token>`, so the flows were
inconsistent: who names a person depended on which link they got.

## Decision

The invitee chooses their own name in **every** invite flow; the inviter
never types it.

- **The invite form drops the Full name field.** The inviter enters only
  email, optional phone, role, and optional group. The `invite-user` Edge
  Function no longer accepts or forwards `full_name`.
- **`profiles.full_name_pending`** (boolean, default false) tracks "this
  person hasn't chosen their name yet". `full_name` stays NOT NULL: a fresh
  invite stores the **canonical email as the placeholder** so admin lists
  stay recognizable while pending. The relink path (inviting someone who
  already exists, e.g. a roster Over-Shepherd getting a login) **keeps the
  existing name** — the overwrite is gone — and marks it pending so the
  person confirms or edits it.
- **The name is chosen on the set-password screen.** `/reset-password` shows
  a "Your name" field when the session's profile name is pending (prefilled
  with the existing name on relinks; the email placeholder maps to an empty
  field). The action saves the name **before** the password so a failed name
  write is fully retryable — the `lg_pw_setup` cookie keeps pinning the
  session to the screen if the user stops between the two.
- **`set_own_full_name`** is the new self-service `SECURITY DEFINER` RPC
  (the first of the `account.*` audit-action family): an authenticated user
  sets their **own** profile's name, **only while pending**. It clears the
  flag and writes a paired, content-free `account.set_own_full_name`
  audit row in the same transaction. Granted to `authenticated` only. It is
  deliberately not a general rename surface — once chosen, name edits stay
  an admin operation.
- **`/welcome` is the post-sign-in fallback gate.** An invite to an email
  that already has a login sends no setup email (new-users-only), so that
  person never sees `/reset-password`; abandoned setups can also slip
  through. The `(protected)` layout and the Home Hub redirect any
  authenticated session whose name is still pending to `/welcome` (a
  one-field page outside the protected group, so it cannot loop), which
  calls the same RPC. No middleware DB reads; the check rides the cached
  session profile read, whose pinned column allowlist deliberately widens by
  `full_name_pending`.

## Signature compatibility, not cleanup

`super_admin_complete_invite` keeps its 8-argument signature with
`p_full_name text default null` (which forces defaults onto the trailing
parameters too) and **ignores** the value. `CREATE OR REPLACE` over the same
argument types preserves the service-role-only EXECUTE grants, and the
default keeps an already-deployed Edge Function that still sends
`p_full_name` resolving during the deploy window. **Deploy order:** apply the
migration before deploying the Next app (the session select names the new
column) and before `supabase functions deploy invite-user`.

## What does NOT change

- The anonymous shareable-link flow (`/invite/<token>`, `redeem_invitation`)
  — already invitee-named; its profiles stay non-pending.
- The Over-Shepherd roster-create form — record creation, not an invite (no
  login is provisioned).
- The `super_admin.invite_user` audit metadata keys consumed by the audit
  summary (`email`, `role`, `groupAssignmentState`, …); the row gains
  `namePolicy: "invitee_chooses"` and pending-flag before/after values, and
  still records no name text.
