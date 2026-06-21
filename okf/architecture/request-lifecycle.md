---
type: Architecture
title: Request Lifecycle (Read & Write Paths)
description: How a request flows from proxy session refresh through auth gating, the read path (RLS + reads seam) and the write path (validate→guard→RPC→revalidate→log).
resource: repo://lib/shared/run-action.ts
tags: [request-flow, write-path, read-path, rls, server-actions]
timestamp: 2026-06-18T00:00:00Z
---

# Purpose

This is the single most important flow to understand before changing any
data-touching code. Every read is RLS-scoped; every write goes through one
shared pipeline that audits itself. Getting this wrong breaks security
invariants that CI machine-checks.

# Source of truth

- `proxy.ts` — Next 16 renamed middleware (session refresh)
- `lib/supabase/middleware.ts` — `updateSupabaseSession()` (~145 lines)
- `app/(protected)/layout.tsx` — auth gate + name-pending redirect
- `lib/auth/session.ts` — `getCurrentSession()`, guards (~443 lines)
- `lib/shared/run-action.ts` — `runWriteAction()` core (~292 lines)
- `lib/admin/run-action.ts` — `runAdminWriteAction()` adapter
- `lib/supabase/reads-seam.ts`, `lib/supabase/read-core.ts`, `read-models.ts`

# Key details

## 1. Every request: proxy session refresh

`proxy.ts` delegates to `updateSupabaseSession(request)`. It calls
`getClaims()` (local JWT verify via Web Crypto, near-zero cost) to refresh auth
cookies, pins the password-setup cookie (`PW_SETUP_COOKIE`) so invite/recovery
sessions stay on the password screen until `resetPasswordAction` clears it,
rewrites `/` → `/login` for anonymous visitors, and forwards auth email-link
query params. The matcher excludes static assets and the manifest.

## 2. Protected route entry: auth gating

`app/(protected)/layout.tsx` calls `getCurrentSession()` and branches on the
`SessionResult` discriminated union:

- `anonymous` → redirect `/login`
- `profile_missing` → redirect `/unauthorized`
- `backend_error` → redirect `/unauthorized?reason=unavailable`
- `authenticated` → name-pending gate (ADR 0032) may redirect `/welcome`,
  else renders the shell.

Each nested layout/page then applies its own **role redirect-guard**
(`requireAdmin`, `requireOverShepherd`, `requireLeader`) from
`lib/auth/session.ts`. `requireLeader` additionally checks the
`leader_surface` frozen flag.

## 3. Read path

Thin async page → guard → async data child that runs `measureReadBundle(...)`
around `Promise.all([...])` reads. Reads go through the **reads seam**:
`bindReads(client, fetchers)` curries the Supabase client into read-model
fetchers so tests inject in-memory adapters. Every fetcher names its columns
(allowlists like `SESSION_PROFILE_COLUMNS`, `LEADER_FOLLOW_UP_COLUMNS` which
omits `admin_private_note`) — there are **no** `select("*")` call sites. RLS
scopes every row to the signed-in user. **Many** reads degrade gracefully
(`ReadResult<T>` union; derived output suppressed, never a false zero) — but this
is **not universal**: some critical reads deliberately **throw / surface** the
error instead (e.g. `app/(protected)/leader/page.tsx` throws `groupsResult.error`;
`lib/dashboard/queries.ts` throws failed member/attendance reads). Don't blanket-
swallow read errors — match the surrounding surface's existing behavior.

## 4. Write path — the fixed pipeline

A Server Action declares a spec and calls `runAdminWriteAction` /
`runLeaderWriteAction` / `runOverShepherdWriteAction`, all wrapping the shared
`runWriteAction` core. Stages (in order):

1. **authenticate** — result-returning guard (`requireAdminSession`, …) →
   `{ actor, baseFields: { actor_role } }`
2. **read** — lift input (FormData via `keys`, or custom `read`)
3. **guardRaw** (optional) — pre-validation ownership gate
4. **validate** — pure validator → `ValidationResult<V>`
5. **guard** (optional) — post-validation gate (self-target, empty-diff)
6. **fields** — async derivation (hashing/lookup), threaded into logs
7. **RPC** — `adminRpc(client, "admin_*", {...})` → `SECURITY DEFINER` proc
   that does the write **and** the paired `audit_events` insert in one tx
8. **revalidatePath** — invalidate affected routes
9. **log** — `startActionLog` + idempotent `ctx.finish(outcome, fields)`

Exit outcomes: `auth_denied`, `validation_failed`, `denied`,
`supabase_not_configured`, `rpc_error`, `rpc_no_data`, `ok`. Returns an
`ActionResult<T>` = `{ ok: true; value } | { ok: false; errors }`.

# Relationships

- [/okf/auth/auth-overview.md](/okf/auth/auth-overview.md)
- [/okf/api/index.md](/okf/api/index.md)
- [/okf/data/index.md](/okf/data/index.md)
- [/okf/decisions/index.md](/okf/decisions/index.md) (ADR 0001/0005/0015)

# Examples

`adminWriteCareNote` (app/(protected)/admin/shepherd-care/care-notes-actions.ts):
validate payload → `requireOverShepherdOrAdminSession` → `adminRpc(client,
"admin_write_care_note", { p_subject_profile_id, p_body })` (RPC re-gates via
`auth_is_admin()` OR `auth_over_shepherd_covers(subject)`; body never enters
audit metadata) → revalidate `/admin/care` + `/admin/shepherd-care/{profileId}`
→ log with `has_body: true`.

# Gotchas

- The RPC is the **authoritative** authz boundary; the action-level guard is
  defense-in-depth, not the only check. Never write tables directly.
- Audit body privacy: care-note/prayer bodies must NOT appear in
  `audit_events.metadata` — only presence flags.
- `getCurrentSession()` uses `getUser()` (validates against auth server) in
  session.ts but the proxy uses `getClaims()` (local) — different cost/trust.
- When Supabase env is absent the client is `null` → outcome
  `supabase_not_configured`, not a crash.

# Citations

- `lib/shared/run-action.ts:59-291`
- `lib/admin/run-action.ts:1-163`
- `lib/auth/session.ts:20-267`
- `lib/supabase/middleware.ts:53-127`
- `app/(protected)/layout.tsx:1-42`
