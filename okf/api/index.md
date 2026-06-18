---
type: API
title: APIs — Server Actions, RPCs & Route Handlers
description: How the app exposes write/read operations — Server Actions over SECURITY DEFINER RPCs, the few genuine route.ts handlers, and the Edge Function endpoints.
resource: repo://lib/admin/rpc.ts
tags: [api, server-actions, rpc, route-handlers, edge-functions]
timestamp: 2026-06-18T00:00:00Z
---

# Purpose

There is **no REST/GraphQL API layer**. App I/O is Server Actions calling
narrow Postgres `SECURITY DEFINER` RPCs, plus a handful of `route.ts` handlers
and two Edge Functions — one authenticated super-admin function (`invite-user`,
`verify_jwt=true`) and one public invite-redemption function (`redeem-invite`,
`verify_jwt=false`). Know this map before adding an endpoint.

# Source of truth

- `lib/admin/rpc.ts` (~819 lines — typed admin RPC arg maps)
- `lib/leader/rpc.ts`, `lib/over-shepherd/rpc.ts`, `lib/shared/rpc.ts`
- `app/**/actions.ts` (Server Actions)
- `app/auth/confirm/route.ts`, `app/(protected)/admin/super-admin/clean-slate/export/[snapshotId]/route.ts`, `app/(protected)/admin/settings/people-import-template/route.ts`
- `supabase/functions/{invite-user,redeem-invite,manage-test-auth-users}/`

# Key details

## Server Actions (primary write API)

Every mutation is a Server Action following validate→guard→RPC→revalidate→log
(see [request-lifecycle](/okf/architecture/request-lifecycle.md)). RPCs are
typed via literal-keyed arg maps: `adminRpc(client, "admin_create_group", {...})`.
Three RPC channels in `lib/shared/rpc.ts`: `callUuidRpc` (returns uuid),
`callJsonRpc` (returns json), `callTextRpc` (returns text/counts).

RPC families. **Domain-write** families each pair one `audit_events` row in the
same transaction; **service-role throttle/telemetry** RPCs deliberately do not
audit-pair (see the exception note below):

- `admin_*` — ministry-admin-callable writes (groups, people, prospects,
  care, calendar, follow-ups, categories/cells, readiness rules, member care)
- `leader_*` — leader/co-leader writes (group check-in, group care notes +
  prayer requests, group calendar, follow-up status)
- `over_shepherd_*` — over-shepherd writes (e.g. `over_shepherd_log_broad_note`)
- `super_admin_*` — platform ops (invites, permanent deletion + tombstones,
  clean-slate/history/audit/attention resets, feature flags, platform config)
- purpose-named domain writes: `set_note_transparency_grant`,
  `redeem_invitation`, `super_admin_complete_invite`
- self-service writes: `set_own_full_name`, `mark_first_run_orientation_seen`
  (these are the actual SQL function names; the TS wrappers in `lib/account/rpc.ts`
  are named e.g. `rpcSetOwnFullName`)
- **not audit-paired** (throttle/telemetry): `check_invite_redeem_rate` (mutates
  the rate-limit ledger), `log_usage_event` (appends usage telemetry). Do not add
  audit rows to these, and do not assume every named RPC here has an audit pair.

## Genuine route.ts handlers

| Path                                                 | Method | Auth                      | Purpose                                                                                     | Response      |
| ---------------------------------------------------- | ------ | ------------------------- | ------------------------------------------------------------------------------------------- | ------------- |
| `/auth/confirm`                                      | POST   | recovery token            | Verify reset/invite email token (`verifyOtp`/`exchangeCodeForSession`), set pw-setup cookie | 303 redirect  |
| `/admin/settings/people-import-template`             | GET    | `requireAdminSession`     | CSV import template                                                                         | CSV download  |
| `/admin/super-admin/clean-slate/export/[snapshotId]` | GET    | explicit super-admin gate | Export snapshot                                                                             | JSON download |
| `/icons/*`, `/manifest.webmanifest`                  | GET    | none                      | PWA assets                                                                                  | image / json  |

## Edge Functions (service-role; the only place service role lives)

- **invite-user** (prod, `verify_jwt=true`): super-admin invite. Verifies caller
  is active super_admin, creates/links auth user (`inviteUserByEmail` or
  `generateLink`), calls `super_admin_complete_invite`. Pads latency
  ~1200–1850ms to defeat user-enumeration timing side channel.
- **redeem-invite** (prod, `verify_jwt=false`, public): self-signup. Token =
  the credential (sha256 lookup), DB-backed per-IP throttle, creates auth user,
  calls `redeem_invitation`. Generic `email_unavailable` to avoid enumeration.
- **manage-test-auth-users** (`enabled=false`, never deployed to prod):
  local/test account CRUD. Canonical seeding is `npm run seed:test-auth`.

# Relationships

- [/okf/architecture/request-lifecycle.md](/okf/architecture/request-lifecycle.md)
- [/okf/auth/auth-overview.md](/okf/auth/auth-overview.md)
- [/okf/data/index.md](/okf/data/index.md)
- [/okf/integrations/index.md](/okf/integrations/index.md)

# Examples

```ts
// Typed RPC call inside a Server Action spec:
adminRpc(client, "admin_write_care_note", {
  p_subject_profile_id: value.subject_profile_id,
  p_body: value.body,
});
// RPC re-gates: auth_is_admin() OR auth_over_shepherd_covers(subject);
// inserts care_notes row + audit_events row in one transaction.
```

# Gotchas

- Direct `.from(...).insert|update|delete|upsert` is **banned** in app/lib —
  fitness test `no-direct-table-writes` fails the build. Always go via RPC.
- The Server Action's auth guard is defense-in-depth; the RPC's internal check
  is authoritative.
- `manage-test-auth-users` `enabled=false` is load-bearing: it stops the
  Supabase GitHub integration from redeploying it on push to main.
- Care-note/prayer bodies must never enter `audit_events.metadata`.

# Citations

- `lib/admin/rpc.ts:308-818`
- `lib/shared/rpc.ts:1-71`
- `app/auth/confirm/route.ts:1-105`
- `supabase/functions/invite-user/index.ts`, `supabase/functions/redeem-invite/index.ts`
