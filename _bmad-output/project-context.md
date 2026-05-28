---
project_name: 'lifegroups'
user_name: 'Root'
date: '2026-05-28'
sections_completed: ['technology_stack', 'critical_implementation_rules']
status: 'complete'
optimized_for_llm: true
---

# Project Context for AI Agents

_This file contains critical rules and patterns that AI agents must follow when implementing code in this project. Focus on unobvious details that agents might otherwise miss._

---

## Technology Stack & Versions

- Next.js 15 (App Router) + React 19, TypeScript 5.7 (`strict: true`, `moduleResolution: bundler`, path alias `@/* -> ./*`).
- Tailwind CSS 3.4 + Radix Dialog + lucide-react. `clsx` + `tailwind-merge` via `lib/utils.ts`.
- Supabase: `@supabase/ssr` 0.10 + `@supabase/supabase-js` 2.106 (Auth + Postgres + RLS). Cookie-auth server client only.
- Upstash Redis + Ratelimit for `lib/security/rate-limit.ts`.
- Tooling: ESLint `next/core-web-vitals`, Vitest 2.1 (node env), `tsx` for scripts. Package manager: npm (`package-lock.json`).
- Scripts: `npm run dev | build | lint | typecheck | test | test:run`.

## Critical Implementation Rules

> Rules are obligations, not descriptions. Each carries the failure mode it prevents. Self-check every change against them.

### Write path (get this wrong and writes silently fail)
- All app writes go through `SECURITY DEFINER` Postgres RPCs named `admin_*` / `leader_*` / `super_admin_*`. There are **no table-level write RLS policies** — a direct `.insert()`/`.update()` from Next fails. A new write = new RPC + migration.
- **Every write RPC MUST insert an `audit_events` row in the same transaction as the mutation, and audit failure MUST roll back the write.** Never wrap the audit insert in an error-swallowing `EXCEPTION` block. (Verified: all 50 audit inserts follow this.)
- **The audit actor MUST be `public.auth_profile_id()`** (the human resolved from `auth.uid()` where `status='active'`), null-checked with `raise insufficient_privilege`. Never attribute to the definer role — that is what keeps the trail non-repudiable.
- Call RPCs only through the typed wrappers in `lib/*/rpc.ts`. They cast args `as never` because `types/database.ts` is hand-rolled and doesn't satisfy supabase-js `.rpc()` generics. Keep the `{ data, error }` shape; run `readUuidRpcData()` on results.
- **No hard deletes.** Soft-deactivate via the per-table sentinel: `status` / `archived_at` / `ended_at` / `active`.

### `types/database.ts` & `as never` (highest-value rule)
- **Never regenerate `types/database.ts`** (`supabase gen types` is banned) — it is hand-authored; the generator clobbers the narrowed shapes and guards we depend on.
- **Hand-edit `types/database.ts` in the SAME change** as any migration that adds/changes a column or RPC. A migration without the matching type edit ships a lie: compiler passes, runtime reads columns that no longer exist.
- **`as never` is permitted ONLY in `lib/*/rpc.ts` RPC arg casts.** Anywhere else it is a banned type suppressor that defers failure to runtime (grep/lint gate).

### Server-action pipeline (`app/**/actions.ts`, `"use server"`)
- Mandatory order — never reorder or skip: `requireXSession()` → `validateXPayload()` → `rpcX()` → on error `mapRpcError(error.message)` → `revalidatePath(PATH)` on success. Return discriminated `ActionResult<T>` via `actionOk`/`actionFail`. **Never throw to the client.**
  - Auth first: no logic runs for an unauthenticated caller (no work/data leak before knowing who's asking).
  - `mapRpcError` mandatory: raw Postgres errors leak schema and produce unstable strings the UI can't switch on.
- Instrument with `startActionLog("domain.area.verb")`; call `ctx.finish(outcome, fields)` on **every** return branch (`ok|fail|denied|throttled`).
- Actions accept `FormData | object` (the `useActionState` `(prevState, input)` signature); read via the `readFromForm` helper.
- **Error tokens are an API contract.** A new RPC failure mode = new stable snake_case token AND a new `mapRpcError` case, together. Renaming a token is a breaking change (clients match the exact string).

### Auth & session (trust boundaries)
- Read session only via `getCurrentSession()` — React `cache()`-memoized per request, so call it freely; **keep it side-effect-free** (a side effect runs once or never depending on call order).
- **Handle all four `SessionResult` variants exhaustively** (`anonymous | authenticated | profile_missing | backend_error`). Never collapse `backend_error` into `anonymous` — that masks an outage as a logged-out user.
- Pages guard with `requireRole`/`requireAdmin`/`requireSuperAdmin`/`requireLeader` (these `redirect()`). Actions guard with `requireAdminSession`/`requireSuperAdminSession`/`requireLeaderActor` (typed result, no redirect).
- **No DB row enters typed app code without a guard.** `as` on a raw query result is forbidden — validate with `isProfilesRow`/`isUuid`/`isUserRole` first (the cast after the guard is intentional). These predicates are the only runtime defense against hand-rolled-type drift.
- Defense in depth: re-check leader group membership against `assignedGroupIds` before the RPC, even though RLS enforces it too.
- `staff_viewer` is legacy/no-access — **explicitly deny it in every new write check** (`auth_is_admin()` already excludes it). `super_admin` is set only via the documented bootstrap — no RPC/migration may elevate to it otherwise.
- Deactivation auto-revokes capability: `auth_profile_id()` filters `status='active'`, so deactivated users lose actor + leader-scoped access automatically. Preserve this — don't bypass the helper.

### Read path & privacy (two-layer enforcement)
- Privacy is enforced at two layers — preserve both: **RLS** controls table access (leaders can't read shepherd-care tables at all; `audit_events` is super_admin-only); **TypeScript column allowlists** in `lib/supabase/read-models.ts` subset columns within readable tables (e.g. `LEADER_FOLLOW_UP_COLUMNS` omits `admin_private_note`).
- **Never `select("*")` on sensitive tables.** New read endpoints inherit an existing allowlist; never redefine one inline. **Widening an allowlist is a privacy decision** needing RLS-level scrutiny.
- **Every read of a soft-deletable table MUST exclude deactivated rows** (check the per-table sentinel).
- Reads return `ReadResult<T>`/`DashboardResult<T>` with `source: "live" | "fallback"`. The client is `null` when env vars are unset — fall back (`lib/dashboard/fallback-data.ts`), never assume a client.

### Security & runtime boundaries
- **Never import or use a service-role key in `app/` or server-action code** — it bypasses RLS. Need a privileged write? Author an RPC. Service role lives ONLY in Supabase Edge Functions (`invite-user`, `manage-test-auth-users`).
- Env vars are optional for build — clients return `null` when missing; never throw at import time.
- Rate-limiting (forgot-password) **fails open** by design and skips the per-IP bucket when no trusted IP exists (`ip: null`). It is a best-effort throttle, **not authorization** — don't change it to fail-closed (an Upstash outage would take down the path).
- Logging: one structured JSON line via `log.{info,warn,error}` / `startActionLog`. **Never log passwords, raw emails, or PII** — hash emails with `hashEmail`, correlate with `request_id`. Auth errors stay generic ("Invalid email or password").

### TypeScript & conventions
- `strict: true`, `moduleResolution: bundler`. Import via the `@/*` alias; ESM only.
- Enums are the single source of truth in `types/enums.ts`.
- Components: PascalCase `.tsx`. Prefer the in-house design system `components/lg/` over ad-hoc styling. RSC by default; add `"use client"` only when needed.

### Testing & Definition of Done
Vitest runs in the **node env** (no DOM). Tests live in `__tests__/*.test.ts` colocated with code; `@` alias is wired in `vitest.config.ts`; `supabase/functions/**` is excluded. Functions take the Supabase client as a parameter — test by passing typed fakes, never a live Supabase.

**Definition of Done — a change adding/altering a server action + RPC is NOT done until:**
- [ ] `npm run typecheck && npm run test:run && npm run lint` all green.
- [ ] Action instrumented: `startActionLog("domain.area.verb")` at entry; `ctx.finish(outcome)` on EVERY return branch (auth, validation, rpc-fail, success).
- [ ] `mapRpcError` updated for every new `RAISE` token, with one test per token.
- [ ] New write RPC has a paired `audit_events` insert in the same txn — **reviewer-verified against the migration SQL** (node-env tests cannot prove this).
- [ ] `types/database.ts` hand-edited for any new column / RPC / changed signature.
- [ ] No new `as never` outside `lib/**/rpc.ts` (grep/lint gate).
- [ ] `revalidatePath(...)` asserted in the action test for every mutating success branch.

**Minimum tests for a new action + RPC (4 layers):**
1. `validateXPayload` — happy path + one rejection per field, incl. an enum violation vs `types/enums.ts`.
2. `rpcX` wrapper — assert the literal param-object keys match the SQL signature (the only place the `as never` cast is policed).
3. `mapRpcError` — every token → a distinct `ActionResult` failure; an unmapped token must surface explicitly, never as silent success.
4. The action — auth rejection → `actionFail` (not throw); success → `revalidatePath` called; `ctx.finish` on every branch.

Predicates (`isProfilesRow`, etc.) are mandatory at every read boundary; each needs a test feeding a malformed row to prove rejection.

**Node-env tests do NOT cover** RLS enforcement, the audit/rollback invariant, or whether RPC param keys match the real Postgres signature — those are verified only by reviewer reading the migration SQL plus a DB-backed/integration gate.

### Migrations
- Timestamped SQL in `supabase/migrations/` (`YYYYMMDDHHMMSS_phaseX_description.sql`). A new write feature = migration (RPC + grants + paired audit) + hand-edit to `types/database.ts` + typed wrapper + action — all in the same change.

### Open Decisions (need owner sign-off — safe defaults applied until decided)
Policy/product calls, not coding rules. Override as needed.

| # | Decision | Default applied |
|---|----------|-----------------|
| 1 | Audit reads of sensitive data? (audit is currently write-only) | Log reads of shepherd-care notes + `admin_private_note` with `auth.uid()`; broader read-logging deferred |
| 2 | Right-to-erasure vs "no hard deletes" | Erasure routes to a manual super_admin process; soft-deactivate is intentional, erasure exceptional + audited |
| 3 | Deactivated subject visibility | Hidden from default lists; visible to admins via explicit filter |
| 4 | co_leader vs leader capability delta | co_leader == leader minus destructive/structural actions (no member removal, no group config) |
| 5 | Rate-limit fail-open scope | Fail-open for non-sensitive writes; fail-closed for auth / role-change / erasure paths |

---

## Usage Guidelines

**For AI Agents:**
- Read this file before implementing any code.
- Follow ALL rules exactly as documented. When in doubt, prefer the more restrictive option.
- The Open Decisions table carries safe defaults — honor them until the owner overrides; never silently invent a different stance.
- If a new pattern emerges, surface it for inclusion rather than diverging.

**For Humans:**
- Keep this file lean and focused on agent needs.
- Update when the technology stack or core patterns change; resolve Open Decisions as the product matures and promote them into firm rules.
- Review periodically and remove rules that become obvious over time.

Last Updated: 2026-05-28
