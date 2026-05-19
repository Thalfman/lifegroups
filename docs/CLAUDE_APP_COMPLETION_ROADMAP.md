# Life Group Operations — App Completion Roadmap

> **Generated:** 2026-05-19
> **Branch:** `claude/app-completion-roadmap-74pxP`
> **Commit SHA:** `7332b57b90a4ecfbd7765e2041e9a81e5117b72d`
> **Reviewer:** Independent automated repo review. No code, migrations, or configs were changed during this evaluation — the only file added is this document.

---

## Executive Summary

- **Current state.** The app is a Next.js 15 + Supabase RSC app at the end of **Phase 5C.1 (privacy hardening)** with Phase 6.0 admin dashboard already merged. Every operational table has RLS; every write goes through a narrowly scoped SECURITY DEFINER RPC; every mutation writes an `audit_events` row in the same transaction. 17 routes build cleanly (`lint`, `typecheck`, `build` all green at this SHA).
- **Coverage.** Admin can manage people, groups, settings, check-in review, guests, and follow-ups; super_admin gets a dedicated console with audit log and role management; leaders run the weekly check-in loop and act on follow-ups assigned to them or their groups.
- **Foundations are strong, top of stack is thin.** Auth + RLS + RPC + audit + types + fallback demo data + 23 phase verification docs are excellent. There is **zero automated test coverage** (no Vitest, no Playwright, no `test` script), one **column-level privacy gap** (`follow_ups.admin_private_note` is application-redacted only), several **missing indexes** on RLS-predicate columns, and **stale deployment docs**.
- **Biggest strength.** The discipline of "RLS SELECT-only + RPC-only writes + paired audit row + fixed error tokens" is consistently applied across 20 write RPCs in 6 phases. There is no `service_role` key path anywhere in app code (verified).
- **Biggest risk.** `follow_ups.admin_private_note` is exposed at the table-level RLS layer; leader-side protection is purely an application-layer column allowlist (`LEADER_FOLLOW_UP_COLUMNS`). One regression that uses `.select("*")` from a leader path leaks pastoral-confidential notes. Compounded by zero automated regression tests, this is the most consequential single gap.
- **Recommended next move.** **Phase 7 — Immediate Stabilization**: close the `admin_private_note` column-level gap with a SECURITY INVOKER view / column mask, add the missing indexes, fix stale `docs/DEPLOYMENT.md`, and stand up a minimal Vitest harness covering `lib/admin/validation.ts`, `lib/admin/metrics.ts`, and `mapRpcError`. Concrete copy-paste prompt is at the bottom of this document.

---

## Current App Map

Maturity legend: **Mature** = shipped + verification doc + audit trail; **Solid** = shipped + verified; **Beta** = working but unverified; **Stub** = scaffolded.

| Route | Role(s) | Purpose | Maturity | Notes |
|---|---|---|---|---|
| `/` | Public | Landing + role-aware redirect | Solid | `app/page.tsx` |
| `/login` | Public | Supabase Auth sign-in form | Solid | `app/login/` |
| `/unauthorized` | Public | Catch-all for inactive/`staff_viewer` accounts | Solid | |
| `/admin-preview` | Public | Always-demo admin dashboard | Solid | Never calls Supabase |
| `/leader-preview` | Public | Always-demo leader dashboard | Solid | Never calls Supabase |
| `/admin` | super_admin, ministry_admin | Ministry command center (6 summary cards, attention queue, capacity/health buckets, setup gaps) | **Mature** | Phase 6.0; routes all math through `lib/admin/metrics.ts` |
| `/admin/people` | super_admin, ministry_admin | Filterable people directory, create leaders/members, assign to groups, inline leader⇄co_leader swap, deactivate | **Mature** | Phase 5A.4 |
| `/admin/groups` | super_admin, ministry_admin | Filterable group directory, create/edit/close/reopen | **Mature** | Phase 5A.2 + 5A.4 |
| `/admin/settings` | super_admin, ministry_admin | Global metric defaults + per-group overrides | **Mature** | Phase 5A.4 |
| `/admin/check-ins` | super_admin, ministry_admin | Read-only weekly check-in review (last 8 Mondays) | **Mature** | Phase 5B.1 |
| `/admin/check-ins/[groupId]` | super_admin, ministry_admin | Per-group week detail | **Mature** | Phase 5B.1 |
| `/admin/guests` | super_admin, ministry_admin | 7-stage guest pipeline | **Solid** | Phase 5C.0 (no automated tests) |
| `/admin/follow-ups` | super_admin, ministry_admin | Follow-up task tracking + admin private note | **Solid** | Phase 5C.0 (privacy hardened in 5C.1) |
| `/admin/super-admin` | super_admin only | Audit log + role management + 8-row status checklist + staff_viewer deprecation note | **Mature** | Phase 5A.3 |
| `/leader` | leader, co_leader | Assigned groups + weekly status + follow-ups | **Mature** | Phase 5B.0 + 5C.0 + 5C.1 |
| `/leader/[groupId]/checkin` | leader, co_leader of group | Weekly attendance + health pulse + note + follow-up signal | **Mature** | Phase 5B.0 |

---

## Architecture Assessment

### Auth + RLS
- **Layered.** Cookie-authenticated server client (`@supabase/ssr`) + page-level `requireAdmin()` / `requireSuperAdmin()` / `requireLeader()` redirects + server-action `requireAdminSession()` / `requireSuperAdminSession()` typed results — see `lib/auth/session.ts:61-111`.
- **Role model.** Five enum values (`super_admin`, `ministry_admin`, `staff_viewer` [deprecated], `leader`, `co_leader`); `member` is **non-auth** (participant records only). See `lib/auth/roles.ts` + README §"Role model".
- **DB helpers.** Six SECURITY DEFINER helpers (`auth_profile_id`, `auth_role`, `auth_is_admin`, `auth_is_admin_or_staff`, `auth_is_staff_viewer`, `auth_is_leader_of`) gate every RLS predicate. Revoked from `public`/`anon`; granted only to `authenticated`.

### RPC Write Model
- **20 SECURITY DEFINER write RPCs** across phases 5A.1, 5A.2, 5A.3, 5A.4, 5B.0, 5C.0. Pattern is consistent: role gate → input validation in SQL → existence checks raising fixed tokens → data write + audit row in one transaction → `FOR UPDATE` row locks where concurrency matters.
- **No broad write RLS policies anywhere.** Verified by `grep -rEni "create policy .*(insert|update|delete)" supabase/migrations/` — the only matches are SELECT policies whose **names** happen to contain "update" (`group_health_updates_*_read`).
- **No client-side deletes.** Verified by `grep -rn "\.delete(" app/ components/ lib/` → zero results. The single delete in the codebase is inside `leader_submit_group_checkin` RPC for the controlled attendance-record replacement.

### Read Models + Fallback
- `lib/dashboard/queries.ts` returns `DashboardResult<T> = { source: "live" | "fallback"; data; error? }`. When the client is null or Supabase errors, demo data from `lib/dashboard/fallback-data.ts` is returned with `source: "fallback"` and surfaced via `DataSourceBadge`.
- `FALLBACK_WEEK = "2026-05-18"` is **hardcoded** — fine for now, but worth a TODO note for production launches (won't refresh on each week).
- `lib/supabase/read-models.ts` defines `LEADER_FOLLOW_UP_COLUMNS` + `LeaderFollowUpRow = Omit<FollowUpsRow, "admin_private_note">` as the privacy boundary for `/leader`.

### Type Safety
- Hand-written `types/database.ts` (12+ row types) and `types/enums.ts`. **No Supabase codegen** — schema drift is silent until runtime.
- `lib/admin/validation.ts` (~270 lines, pure TS, no I/O) + `lib/admin/action-result.ts` (27 fixed error tokens) are reused across all admin server actions.

### Migrations
- 10 migration files; numbered chronologically. Each phase migration is paired with a verification doc and (for write phases) a hardening report. Numbers are non-contiguous (5B.0 sits between 5A.2 and 5A.3) — the ordering by date prefix is correct, but the dual phase/date naming is mildly confusing.

### Audit Trail
- `audit_events` is **super_admin-only read** (tightened in Phase 5A.2). Ministry admins lost audit visibility intentionally.
- Every write RPC includes `insert into audit_events ...` in the same transaction. Audit summaries surface in `/admin/super-admin` for all 6 new Phase 5C.0 actions.

### Deployment Assumptions
- Vercel + Supabase free tier. Env vars optional for build (verified — `next build` succeeds with no env). Protected routes redirect to `/login` at request time when env is missing.
- **No CI configured** — no GitHub Actions workflows referenced. *Not verified from repo.*
- **`docs/DEPLOYMENT.md` is stale** (still says "Phase 5A.0.1 — launch polish, read-only"; references removed `/staff` route; only lists migrations through Phase 5A.2).

---

## Product Workflow Assessment

### Admin Workflow
1. Sign in → `/admin` command center surfaces 6 cards + attention queue.
2. From attention queue, jump to specific group, check-in, or follow-up.
3. Manage people / groups / settings as needed (CRUD via narrow RPCs, no hard deletes — only deactivation).
4. Review weekly check-ins; create follow-ups; manage guest pipeline.
5. Super admin only: audit log + role management via `/admin/super-admin`.

**Gap.** Guest → Member conversion is **undefined** — there's no RPC and no UI flow for the placement step. The pipeline ends at `placed` but the placement act (creating a `members` row + `group_memberships` row from a guest) is implicit/manual.

### Leader Workflow
1. Sign in → `/leader` lists assigned groups + open follow-ups (`admin_private_note` redacted).
2. For each group: "Start check-in" or "Update check-in" → `/leader/[groupId]/checkin`.
3. Submit attendance + optional health pulse + optional note + optional follow-up signal.
4. Update follow-up status (limited transitions: `open→in_progress`, `open→done`, `in_progress→done`).

**Gap.** Leaders cannot **edit** a follow-up (title, due date, note) — status-only. Listed as future enhancement in README.

### Guest Workflow
Manual end-to-end: admin creates a guest → walks them through 7 stages (`new` → `contacted` → `interested` → `assigned` → `attended` → `placed` / `not_now`). No public form. No SMS. No auto-reminder. Acceptable for MVP.

### Follow-up Workflow
Admin creates → assigns to person or leaves group-tied → assignee acts → status flows. Admin private note never reaches leaders (column allowlist; **table-level RLS still exposes the column** — see Security section).

### Dashboard Workflow
Prioritized attention queue with stable ordering: follow-ups → missing → full → warning → needs-follow-up → watch → unknown → no leader → no members → missing day/time. Capacity has explicit "unknown" + "excluded" buckets. Read-only.

### Super Admin Workflow
Single workflow that can change a profile role; rejects `super_admin` escalation, rejects `staff_viewer` assignment, rejects self-target. Audit log read-only. 8-row system status checklist for at-a-glance health.

---

## UX Assessment

| Dimension | Current state | Notes |
|---|---|---|
| Admin usability | Strong | Dense but well-structured. Filter chips, search, inline forms. |
| Leader usability | Strong | Simple — 1-2 actions per group card; 40px P/A/E targets are mobile-friendly. |
| Mobile friendliness | Reasonable | *Not verified from repo* — no responsive QA doc; Tailwind utilities suggest mobile is considered but no breakpoints audit available. |
| Non-technical user friendliness | Strong | Plain-language copy. Personas (Julian, Tom) referenced in copy. Eyebrow phase labels may confuse non-technical users — minor. |
| Information overload | Watchpoint | `/admin` is dense (6 cards + 5 sections). One more bucket and it tips. |
| Empty states | Strong | Phase 5C.1 split "nothing yet" vs "filter mismatch" — good. |
| Forms | Server-validated only | No inline validation feedback; errors surface after submit. Acceptable for MVP. |
| Navigation | Role-driven | `navItemsForRole()` keeps surface clean per role. |
| Accessibility | *Not verified* | No axe-core / Lighthouse pass documented. ESLint extends `next/core-web-vitals` which catches some a11y issues. |

---

## Security and Privacy Assessment

### Role Boundaries
- ✅ Clean separation. `super_admin` ⊃ `ministry_admin` for reads; `super_admin` exclusively for role mgmt + audit; leaders scoped to assigned groups via `auth_is_leader_of()`.
- ⚠️ `requireAdminOrStaff()` (`lib/auth/session.ts:73-74`) still accepts `staff_viewer`. No active route calls it, but it remains in the API surface — risk of a future caller mistakenly accepting the deprecated role.

### `admin_private_note` Handling — **HIGH PRIORITY**
- ✅ Application layer is correct: `LEADER_FOLLOW_UP_COLUMNS`, `LeaderFollowUpRow`, `fetchOpenFollowUps` narrowed in SQL, JSDoc warnings on `fetchFollowUpsForAdmin`. Leader-side files reference `admin_private_note` only in **comments** (verified: `app/(protected)/leader/page.tsx:49`, `components/leader/leader-follow-ups-section.tsx:19,21`).
- ❌ **Database layer is not.** RLS policy on `follow_ups` exposes all columns to any reader who satisfies the row predicate. The "leader can read follow-ups they are assigned to OR tied to a group they lead" predicate is enforced by RLS, but **column-level redaction is not**. The current `5C.1` doc explicitly defers column-level RLS to a future hardening item.
- **Risk.** Anyone with `leader` role who runs `select *` against `follow_ups` for a row they have row-access to will see `admin_private_note`. The app code does not do this — but the DB does not stop it. Even an authenticated DB browser session would.

### Guest / Member Data Exposure
- ✅ All guest reads are admin-only (RLS).
- ✅ Members are non-auth — no client surface beyond admin pages.
- ⚠️ `members.care_sensitivity_flag` is plaintext readable by `super_admin` and `ministry_admin`. Acceptable for MVP; consider column encryption (pgcrypto) at production-scale.

### Audit Visibility
- ⚠️ Audit log is **super_admin only**. Ministry admins cannot audit their own actions. Operationally, this means compliance / "who closed this group last month?" requires the super_admin. Revisit when there are multiple ministry admins.

### RLS Risks (column-level)
- High: `follow_ups.admin_private_note` (above).
- Medium: `members.care_sensitivity_flag`, `members.email`, `members.phone`, `members.household` — readable by all admin/staff_viewer roles by RLS. Acceptable but document the model.

### SECURITY DEFINER Risks
- ✅ Well-bounded. Each RPC re-checks role, uses fixed error tokens, never accepts elevated arguments without checks. `super_admin_update_profile_role` correctly rejects `super_admin` escalation and self-target.
- ⚠️ `app_settings` is a singleton (no multi-tenant key). Hard-coded single ministry. Acceptable for MVP; flag for any future multi-org scenario.

### Hardening Recommendations (post-MVP)
1. Column-mask `follow_ups.admin_private_note` via SECURITY INVOKER view + revoke direct table grants for leaders (preferred), OR raise an error if a leader-context query selects it.
2. Add indexes on `follow_ups.assigned_to`, `guests.assigned_group_id`, `guests.follow_up_owner_id`, `audit_events.actor_profile_id`.
3. Generate types from Supabase schema (drift-proof). Replace hand-written `types/database.ts`.
4. Optional column encryption for `members.care_sensitivity_flag` and any future "prayer/care notes" feature.
5. Re-evaluate ministry_admin audit-read visibility when adding a second admin.
6. Upgrade Next.js from `15.1.11` to `≥15.5.18` to clear critical CVE (see Verification Checks section).

---

## Data and Metrics Assessment

### Capacity Logic
- `lib/admin/metrics.ts` provides `effectiveCapacity(group, settings, defaults)` with override chain: per-group override → group column → ministry default → unknown.
- `capacityStatus()` returns `full | warning | ok | unknown | excluded`. Configurable warning/full % via `/admin/settings`.
- ✅ Solid. Excluded groups (one-on-one, prayer, etc.) supported via flag.

### Health Logic
- 8 enum values on `groups.health_status` + 7 weekly buckets on the dashboard. Per-group manual override supported. Threshold-driven (`healthy_attendance_percent`) for "watch" vs "healthy".
- ⚠️ Logic depth and configurability mean an admin can tune themselves into confusion. Suggest "Reset to defaults" affordance + an "explain this status" tooltip.

### Check-in Logic
- Mon-anchored weekly grain. Last 8 Mondays in admin review. `FALLBACK_WEEK = "2026-05-18"` hardcoded in fallback data — fine while in development, flag for production removal.
- "Missing" rule shared between dashboard and admin review (good — single source of truth).

### Guest Pipeline Metrics
- 7-stage funnel + live counts on `/admin/guests`. No conversion analytics yet (e.g., "% of `interested` that reached `placed`"). Defer until there is enough data.

### Follow-up Metrics
- Open / in-progress / done / snoozed surfaced per-list. No SLA / aging dashboard yet.

### Setup Completeness
- "Setup gaps" panel on `/admin` flags groups missing leader, day/time, members, or capacity. Surfaces operational reality cleanly.

### Configurable vs Not
- **Should remain configurable:** ministry defaults, per-group overrides, capacity exclusion flag, health override, admin metric notes.
- **Should NOT become configurable (yet):** attention-queue ordering, audit retention, role enum values, RPC error tokens. Custom formulas / dashboard builder are explicitly deferred in the README — keep that line.

---

## Testing and Verification Assessment

### What exists
- ✅ **23 verification docs** covering every phase 5+ feature with copy-paste manual QA steps.
- ✅ **Hardening reports** post-merge for the most consequential phases (5A.2, 5B.0).
- ✅ Lint, typecheck, build all pass at this SHA.

### What is missing
- ❌ **No automated tests.** No `test` script in `package.json`. No Vitest / Jest / Playwright / Cypress installed. The only validation is manual.
- ❌ No CI workflow configured (not verified from repo).
- ❌ No role-based regression matrix automated.

### Recommended layered test plan
1. **Unit (Vitest)** — `lib/admin/validation.ts`, `lib/admin/metrics.ts`, `lib/admin/action-result.ts (mapRpcError)`, `lib/auth/roles.ts`. Pure functions, no I/O. ~1 day to set up; high ROI for catching regressions on every change.
2. **Integration (Vitest + a local Postgres test container)** — exercise each SECURITY DEFINER RPC's auth gate + happy path + fixed error token paths. Higher cost; defer to Phase 9.
3. **E2E smoke (Playwright)** — three scenarios: admin signs in + sees dashboard; leader signs in + submits a check-in; super admin changes a role and audit log reflects it. Defer to Phase 8/9.

### Role-based QA Matrix (recommended template)

| Action | super_admin | ministry_admin | leader | co_leader | staff_viewer | anon |
|---|---|---|---|---|---|---|
| Read `/admin` dashboard | ✓ | ✓ | ✗ redirect | ✗ redirect | ✗ /unauthorized | ✗ /login |
| Create leader profile | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| Change profile role | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Read audit log | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Submit weekly check-in | ✗ | ✗ | ✓ (own group) | ✓ (own group) | ✗ | ✗ |
| Read `admin_private_note` | ✓ | ✓ | ✗ (app) **but DB exposes** | ✗ (app) **but DB exposes** | ✗ | ✗ |
| Create follow-up | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| Update follow-up status | ✓ | ✓ | ✓ (assigned/own group) | ✓ | ✗ | ✗ |
| Hard delete | ✗ (no RPC) | ✗ | ✗ | ✗ | ✗ | ✗ |

This matrix is **not** captured in any single file today — recommend codifying it.

---

## Recommended Roadmap

### Phase 7 — Immediate Stabilization

- **Goal.** Close the highest-impact gaps without changing user-facing behavior.
- **Why it matters.** `admin_private_note` is a privacy contract today; one wrong query and it leaks. Zero automated tests means every regression is caught manually. Stale `DEPLOYMENT.md` blocks new operator onboarding.
- **Key tasks:**
  - Column-level masking for `follow_ups.admin_private_note` (SECURITY INVOKER view `leader_follow_ups_view`, revoke leader access to the base table, route leader reads through the view; OR add a column-level RLS policy with `CASE auth_role() WHEN ... END` masking).
  - Add indexes: `follow_ups(assigned_to)`, `follow_ups(related_group_id)`, `guests(assigned_group_id)`, `guests(follow_up_owner_id)`, `audit_events(actor_profile_id)`, `audit_events(created_at DESC)`.
  - Generate types from the Supabase schema and replace `types/database.ts` (or add a CI check that compares hand-written types to schema).
  - Rewrite `docs/DEPLOYMENT.md` to reflect Phase 5C.1 reality: list all 10 migrations, remove `/staff` reference, update phase labels.
  - Add a Vitest harness + tests for `lib/admin/validation.ts`, `lib/admin/metrics.ts`, `lib/admin/action-result.ts (mapRpcError)`, `lib/auth/roles.ts`.
  - Add `npm test` script; wire to CI (GitHub Action) on PR.
  - Confirm `requireAdminOrStaff()` has zero call sites; delete it (or document why it remains).
  - Decide on `ministry_admin` audit-read visibility (re-grant or document the gap).
  - Upgrade Next.js to `≥15.5.18` to clear CVEs (1 critical + 1 moderate in `npm audit`).
- **Out of scope.** New features, UI redesign, leader follow-up editing, automated reminders, SMS, exports.
- **Acceptance criteria.**
  - A `leader`-role SQL session selecting `*` from `follow_ups` does NOT return `admin_private_note`.
  - `EXPLAIN` plans on the five high-traffic RLS paths show index usage.
  - `npm test` runs and passes on every push; lint + typecheck + build remain green.
  - `docs/DEPLOYMENT.md` is current.
  - `npm audit --production` reports 0 critical vulnerabilities.
- **Risk:** Low–Medium. Mostly additive. The view/mask change requires careful rollout but is reversible.

### Phase 8 — Strong MVP Completion

- **Goal.** Close the operational loop so a real Life Group ministry can use the app without spreadsheets.
- **Why it matters.** The pipeline ends at `placed` but the placement act is implicit. Leaders can update status but not edit follow-ups. There is no operator-friendly first-boot flow. Real-world usage demands all three.
- **Key tasks:**
  - **Guest → Member conversion** RPC (`admin_convert_guest_to_member`): atomically create `members` row + `group_memberships` row, mark guest as `placed`, write audit. Wire to a single-click action on `/admin/guests`.
  - **Leader follow-up edit** (Phase 5C.0 stopped at status-only): allow leaders to edit title, due date, leader-visible note for follow-ups assigned to them. **Do NOT** expose `admin_private_note`. New RPC `leader_update_follow_up`.
  - **Production launch checklist** doc: bootstrap super_admin, swap seed for prod data, configure metric defaults, create real groups, verify RLS in a fresh project.
  - **Server-side notification on follow-up assignment** (email only — no SMS): send a templated email when a follow-up is assigned to a leader. Use Supabase's built-in email or a transactional provider.
  - **Monitoring**: integrate Vercel Analytics + Sentry (or equivalent error reporting). Capture server-action failures with the existing error tokens.
  - **First-run wizard**: when no groups exist, route `/admin` to a small "Welcome — let's set up your first group" flow.
- **Out of scope.** Public guest forms, SMS, calendar, prayer/care notes, exports, native mobile.
- **Acceptance criteria.**
  - A guest can be converted to a placed member in one click, with audit + membership creation atomic.
  - Leaders can edit their own follow-up content (not the admin private note).
  - A new ministry can go live by following the launch checklist in <60 minutes.
  - Server errors are visible in a dashboard within 1 minute.
- **Risk:** Medium. Real users; real data; email deliverability adds a new failure mode.

### Phase 9 — Production Polish

- **Goal.** Make the app feel premium and durable.
- **Why it matters.** Ministry operators are mostly non-technical and rely on at-a-glance comprehension. Reliability and gentle onboarding determine whether the tool actually replaces spreadsheets.
- **Key tasks:**
  - In-app help / glossary tooltips for capacity, health, and follow-up types.
  - Mobile responsive audit + fixes (admin pages especially; leader pages already strong).
  - Accessibility pass: axe-core or Lighthouse a11y run; fix any AA violations.
  - Automated regression suite: Playwright smoke for the three critical journeys (admin dashboard, leader check-in, super admin role change).
  - CI gates: lint + typecheck + build + unit tests + playwright smoke must pass for merge.
  - Uptime monitoring (Vercel deployment health checks; Supabase health).
  - Rate-limiting on write RPCs (`pg_throttle` extension or function wrappers) for defense-in-depth.
  - Backup/restore runbook for Supabase data.
- **Out of scope.** New features.
- **Acceptance criteria.**
  - Lighthouse a11y score ≥ 95 on every protected route.
  - Mobile sweep verified at 375×667 and 414×896 viewports.
  - Playwright smoke + Vitest both run in CI on every PR.
- **Risk:** Medium. Long task list; needs careful scoping to avoid scope-creep.

### Phase 10 — Future Enhancements (deferred)

- SMS / consent / phone login
- Public guest intake forms
- Calendar integration (Google / iCal)
- Prayer / care-sensitive notes (separate confidentiality tier)
- Data exports (CSV / JSON)
- Native mobile app (React Native / Expo)
- Advanced formula editor
- Complex automation / scheduled jobs
- Bulk import (CSV / spreadsheet)
- Auth invitations / self-service member login

Risk for each is **High** (scope, privacy, or complexity), and none are essential to MVP. Acceptance criteria deferred to that phase.

---

## Do Not Build Yet

| Feature | Why it should wait |
|---|---|
| **SMS** | Consent, telephony cost, opt-out plumbing, deliverability. Adds privacy compliance burden (TCPA in US). Email covers the MVP notification need. |
| **Public guest intake forms** | Spam, captcha, validation, public-API surface. Manual entry by an admin covers all MVP use cases. |
| **Prayer / care notes** | Highest-confidentiality data class. Requires separate authorization model (pastors only?), audit, encryption-at-rest. Defer until the column-level RLS pattern is proven on `admin_private_note` (Phase 7). |
| **Calendar integration** | OAuth scopes, token refresh, edge cases. Manual meeting day/time on `groups` covers operational need. |
| **Exports (CSV/JSON)** | Re-exposes redacted fields if not careful (e.g., `admin_private_note`). Needs a dedicated export RPC per audience. |
| **Native mobile app** | App-store overhead, push notification infra, parity with web. Mobile web already strong for leaders. |
| **Advanced formula editor** | Custom metric formulas are a power-user trap; current metric defaults + per-group overrides cover the operational need. |
| **Complex automation** | "When X happens, do Y" requires a scheduler + retry semantics + observability. Build foundations first. |
| **Bulk import (CSV)** | Validation rabbit hole; better to wait until export exists (round-trip integrity). |
| **Auth invitations / self-service member login** | Members are explicitly non-auth participant records. Promoting members to auth users is a bigger product decision (privacy, child safeguarding, scope). |

---

## Verification Checks

All commands run at commit `7332b57b90a4ecfbd7765e2041e9a81e5117b72d` after `npm install`.

### `npm run lint` — ✅ Pass

```
> lifegroups@0.1.0 lint
> next lint
✔ No ESLint warnings or errors
```

### `npm run typecheck` — ✅ Pass

```
> lifegroups@0.1.0 typecheck
> tsc --noEmit
(no output; exit 0)
```

### `npm run build` — ✅ Pass

```
> lifegroups@0.1.0 build
> next build
 ✓ Compiled successfully
 ✓ Generating static pages (3/3)
   Route (app)                              Size     First Load JS
   ┌ ƒ /                                    172 B           109 kB
   ├ ○ /_not-found                          979 B           106 kB
   ├ ƒ /admin                               1.54 kB         111 kB
   ├ ƒ /admin-preview                       926 B           110 kB
   ├ ƒ /admin/check-ins                     1.54 kB         111 kB
   ├ ƒ /admin/check-ins/[groupId]           1.54 kB         111 kB
   ├ ƒ /admin/follow-ups                    6.83 kB         116 kB
   ├ ƒ /admin/groups                        7.22 kB         116 kB
   ├ ƒ /admin/guests                        7.09 kB         116 kB
   ├ ƒ /admin/people                        6.68 kB         116 kB
   ├ ƒ /admin/settings                      4.49 kB         114 kB
   ├ ƒ /admin/super-admin                   2.83 kB         112 kB
   ├ ƒ /leader                              4.44 kB         113 kB
   ├ ƒ /leader-preview                      1.66 kB         111 kB
   ├ ƒ /leader/[groupId]/checkin            5.13 kB         114 kB
   ├ ƒ /login                               1.8 kB          111 kB
   └ ƒ /unauthorized                        172 B           109 kB
 + First Load JS shared by all              105 kB
 ƒ Middleware                               86.9 kB
```

Two webpack-cache warnings about big-string serialization — cosmetic; do not block the build.

### `npm audit` — ⚠️ 1 critical, 1 moderate

- `next@15.1.11`: critical (umbrella of multiple Next.js CVEs incl. CVE-2025-29927 middleware auth bypass, image-optimization issues, SSRF in middleware redirects, cache-poisoning, XSS in CSP-nonce flow, etc.).
- `postcss <8.5.10` (transitive via next): moderate XSS via unescaped `</style>`.
- Fix: `npm audit fix --force` would upgrade to `next@15.5.18`. **Not fixed in this review** per scope; recommended in Phase 7.

### `grep -rn "service_role" .` (excluding `node_modules`)

Only matches are in `docs/` (verification checklists describing the policy). **Zero hits in `app/`, `components/`, `lib/`, or `supabase/migrations/`** — confirmed clean.

### `grep -rni "SUPABASE_SERVICE|sb_secret" .` (excluding `node_modules`)

Only matches are in `docs/`. **Zero hits in code.**

### `grep -rn "admin_private_note" app/ components/ lib/` — 33 hits across 8 files

```
app/(protected)/admin/follow-ups/actions.ts
app/(protected)/leader/page.tsx               (comment only — line 49)
components/admin/follow-ups/follow-up-create-form.tsx
components/admin/follow-ups/follow-ups-shell.tsx
components/leader/leader-follow-ups-section.tsx (JSDoc only — lines 19,21)
lib/admin/rpc.ts
lib/admin/validation.ts
lib/supabase/read-models.ts
```

All leader-path references are **comments/JSDoc only** documenting the redaction boundary. Privacy boundary at the application layer is intact. **Database layer still exposes the column** — see Security section.

### `grep -rEni "create policy .*(insert|update|delete)" supabase/migrations/` — 2 hits, both false positives

```
supabase/migrations/20260518000000_phase4_rls.sql:248: create policy group_health_updates_admin_staff_read ...
supabase/migrations/20260518000000_phase4_rls.sql:251: create policy group_health_updates_leader_read ...
```

Both are **SELECT** policies whose policy *names* contain "updates". No broad write RLS policies exist anywhere — confirmed clean.

### `grep -rn "\.delete(" app/ components/ lib/` — ✅ Zero hits

No client-side `.delete(` calls anywhere. Only delete in the codebase is inside the `leader_submit_group_checkin` RPC (controlled attendance-record cleanup), as designed.

---

## Best Next Prompt

Copy-paste-ready prompt for the next implementation phase (**Phase 7 — Immediate Stabilization, Slice 1: column-mask `admin_private_note` + Vitest harness**):

```text
You are working on the lifegroups repo on branch claude/phase-7-stabilization-1.

Goal: Close the column-level privacy gap on follow_ups.admin_private_note
at the database layer, and stand up a minimal Vitest harness.

Background: The app currently relies on application-layer column allowlists
(LEADER_FOLLOW_UP_COLUMNS, fetchFollowUpsForLeader, fetchOpenFollowUps narrowed
SQL) to keep admin_private_note out of leader reads. Table-level RLS on
follow_ups still exposes the column. Any future regression that uses
.select("*") from a leader code path would leak pastoral notes. See
docs/CLAUDE_APP_COMPLETION_ROADMAP.md (Security and Privacy Assessment) for the
full risk write-up.

Scope (in scope):
1. Create a new migration supabase/migrations/<next-timestamp>_phase7_follow_up_column_mask.sql
   that does ONE of:
   (a) Creates a SECURITY INVOKER view `public.leader_follow_ups_view` that
       selects every column of follow_ups EXCEPT admin_private_note, with
       the same row predicate as today (assigned_to OR
       auth_is_leader_of(related_group_id)). Revoke direct table SELECT from
       the authenticated role for follow_ups; grant SELECT on the view.
       Adjust admin path to either keep the table-level grant (admins only)
       or use a separate admin view. Update lib/supabase/read-models.ts to
       route leader reads through the view.
   OR
   (b) Replace the leader SELECT policy on follow_ups with a column-mask
       policy using a SECURITY DEFINER function that returns NULL for
       admin_private_note unless auth_is_admin().
   Pick (a). It's more explicit, easier to audit, and matches the existing
   "narrow surface area" idiom.
2. Add an index migration in the same file (or a sibling) for:
     create index if not exists follow_ups_assigned_to_idx on follow_ups (assigned_to);
     create index if not exists follow_ups_related_group_id_idx on follow_ups (related_group_id);
     create index if not exists guests_assigned_group_id_idx on guests (assigned_group_id);
     create index if not exists guests_follow_up_owner_id_idx on guests (follow_up_owner_id);
     create index if not exists audit_events_actor_profile_id_idx on audit_events (actor_profile_id);
     create index if not exists audit_events_created_at_desc_idx on audit_events (created_at desc);
3. Install Vitest as a devDependency and add an "npm test" script.
4. Write tests for:
   - lib/admin/validation.ts (every exported validator: valid + invalid cases).
   - lib/admin/action-result.ts (mapRpcError: every fixed token + unknown token).
   - lib/admin/metrics.ts (effectiveCapacity, capacityStatus, effectiveHealthStatus,
     hasActiveOverrides, isExcludedFromCapacityMetrics).
   - lib/auth/roles.ts (isAdminRole, isLeaderRole, isAdminOrStaffRole,
     defaultLandingPathForRole, navItemsForRole).
5. Update docs/PHASE_7_FOLLOW_UP_COLUMN_MASK.md (new) with the design,
   migration plan, and rollback plan. Include a manual verification script:
     -- as a leader-role JWT, select * from follow_ups returns 0 rows when
     -- not assigned and not leader of the group, AND for accessible rows
     -- admin_private_note is NOT present in the column list of the view.

Out of scope (do NOT do in this slice):
- UI changes
- New features
- Server-action changes beyond updating the read helper
- Email / monitoring
- Guest → Member conversion
- Leader follow-up editing
- Removing requireAdminOrStaff() — separate slice
- Upgrading Next.js — separate slice
- Rewriting docs/DEPLOYMENT.md — separate slice

Acceptance criteria:
- `npm run lint && npm run typecheck && npm run build && npm test` all pass.
- A new docs/PHASE_7_FOLLOW_UP_COLUMN_MASK.md describes the design.
- A new migration file applies cleanly to a fresh Supabase project on top
  of all existing migrations.
- The Vitest suite has ≥ 30 assertions across the four target files and
  runs in under 5 seconds.
- The app behaves identically to the user — admins still see
  admin_private_note on /admin/follow-ups; leaders still see follow-ups
  without it; the leader dashboard still shows the same counts.

Do NOT:
- Modify any code unrelated to the listed scope.
- Change RLS for any table other than follow_ups.
- Add deletes or grant broader privileges.
- Use a service role key anywhere.
- Commit dependency upgrades beyond Vitest.

When done, post a 5-bullet summary, the new migration filename, the test
count, and the verification commands you ran.
```

---

## Appendix: Document Honesty Notes

- **"Not verified from repo"** items: CI configuration (no `.github/` directory inspected in detail), mobile responsive behavior, accessibility scores, production deployment.
- **Acceptable-for-MVP risks** clearly called out: hand-written types (drift risk), ministry_admin audit invisibility, `FALLBACK_WEEK` hardcode, `app_settings` singleton, lack of rate-limiting, `requireAdminOrStaff()` lingering.
- **Open question for the operator:** does Phase 7 ship as one PR, or split into the four sub-slices (column mask, indexes, type generation, Vitest)? Recommended: split — each is independently mergeable and reversible.
