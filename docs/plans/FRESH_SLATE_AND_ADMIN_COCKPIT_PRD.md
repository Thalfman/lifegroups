# PRD — Fresh Slate & Admin Cockpit (PRD-SAC6)

> **Status:** Proposed (design only — no code written yet).
> **Scope:** Super-Admin "Danger Zone" power tools + admin landing-page ergonomics.
> **Codename:** PRD-SAC6 "Fresh Slate & Admin Cockpit".

---

## Context & motivation

The app has been live ~1 month. Real users have accumulated a month of activity,
so groups now carry a **"history of bad health"** — attendance gaps, low
group-health grades, stale follow-ups — that no longer reflects reality now that
the ministry is actually organized. The Super Admin wants to **wipe that history
and start from a clean slate** WITHOUT losing the people, groups, and assignments
already set up, and WITHOUT any schema changes. They also want a few
quality-of-life tools: a CSV template for bulk import, an audit-log reset, and a
tighter admin landing page.

This PRD captures five features across two trust tiers. It is a **design
document**; the implementation is future work described here, not built by this
PRD.

### How writes work in this codebase (constraints every feature must honor)

All mutations go through Postgres `SECURITY DEFINER` RPCs that:

1. gate on `auth_role()` **inside the function** (the function body is the
   security boundary — no dynamic SQL),
2. perform the data change **and** insert an `audit_events` row in **one
   transaction**, and
3. return a `uuid` or `raise exception` with a fixed error token.

The app wraps these via `lib/admin/rpc.ts` (`callUuidRpc`), maps error tokens to
copy via `lib/admin/action-result.ts`, and runs them through
`runAdminWriteAction` (`lib/admin/run-action.ts`). Super-admin gating:
`requireSuperAdminSession()` (`lib/auth/session.ts`) plus the Postgres helper
`auth_role() = 'super_admin'`. **No hard deletes exist anywhere today**
(everything is deactivate / archive / close), and **no snapshot/restore mechanism
exists yet**. The UI uses the pastoral design system (`lib/pastoral.ts`,
`PButton`, `PBadge`, inline styles) — no shadcn; collapsibles are native
`<details>` (`components/admin/super-admin-collapsible-section.tsx`); view
preferences are localStorage-only (`lib/hooks/use-persisted-view-state.ts`,
`lib/admin/view-preferences.ts`) — there is no DB user-preferences table.

### Confirmed product decisions

| Decision | Choice |
| --- | --- |
| Clean Slate scope | **History only** — keep all people, groups, and assignments |
| Revert mechanism | **Single snapshot**, exportable to a JSON file and re-importable later (covers accidental wipe after the in-DB snapshot is gone) |
| Shepherd-care boundary | **Wipe the care log** (`shepherd_care_interactions` + `shepherd_care_follow_ups`); **keep** care profiles + private/admin notes |
| Audit reset | **Separate** standalone action (not coupled to Clean Slate) |
| CSV export | **Empty template** matching the existing import parser |

---

## Feature 1 — Super Admin: Clean Slate (history-only wipe) + revert + export/import

### 1.1 Scope

**KEEP intact** (structural / config / pastoral context): `profiles`, `members`,
`groups`, `group_leaders`, `group_memberships`, all settings/config,
`leader_pipeline`, `multiplication_candidates`, `over_shepherds`, coverage
assignments, `shepherd_care_profiles`, `shepherd_care_private_notes`,
`shepherd_care_admin_notes`, `group_calendar_events`, `group_metric_settings`,
`audit_events` (Feature 3 owns audit reset).

**WIPE (history/activity only)** — delete order is **children → parents** so no FK
constraint on a kept row can be violated and per-table counts stay exact:

1. `attendance_records` — child of `attendance_sessions`; delete explicitly (a
   `CASCADE` delete is invisible to `GET DIAGNOSTICS ROW_COUNT`).
2. `attendance_sessions`
3. `follow_ups` — has `related_guest_id → guests ON DELETE SET NULL`; delete
   **before** `guests` to avoid SET-NULL churn.
4. `guests`
5. `group_health_updates`
6. `group_health_assessments`
7. `group_status_history`
8. `church_attendance_snapshots`
9. `shepherd_care_follow_ups` — confirmed wipe (care task list).
10. `shepherd_care_interactions` — confirmed wipe (care touch log). Parent
    `shepherd_care_profiles` is kept; its `ON DELETE RESTRICT` never fires
    because we delete the child, not the parent.

**FK safety (verified across all migrations):** no inbound FK from any KEPT table
points into a wipe target, so a history-only delete can't violate a constraint on
a kept row. Relevant cascades: `attendance_records → attendance_sessions` is
`ON DELETE CASCADE`; `follow_ups → guests` is `ON DELETE SET NULL` (hence the
ordering). The original note's "care_profiles" maps to the real table
`shepherd_care_profiles`, which is **kept**.

### 1.2 Migration

**New file:** `supabase/migrations/20260603130000_phase_cs1_clean_slate_history_wipe.sql`
(timestamp after the latest existing `20260603120000_phase_gh3_*`).

**`clean_slate_snapshots` table** — single logical snapshot store:

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` pk | `default gen_random_uuid()` |
| `created_by` | `uuid` | `→ profiles(id)` |
| `created_at` | `timestamptz` | `default now()` |
| `kind` | `text` | `default 'wipe'` |
| `payload` | `jsonb` | per-table row arrays + `schema_version: 1` |
| `row_counts` | `jsonb` | denormalized counts per table |
| `total_rows` | `integer` | denormalized total |
| `restored_at` | `timestamptz` | set on revert |
| `restored_by` | `uuid` | `→ profiles(id)` |

RLS enabled with a **single SELECT policy** gated on `auth_role() = 'super_admin'`
(mirrors the `audit_events` precedent); **no** INSERT/UPDATE/DELETE policy — all
writes flow through the SECURITY DEFINER functions. Index on `(created_at desc)`.

**RPCs (all SECURITY DEFINER, `set search_path = public, pg_temp`, return `uuid`):**

- **`super_admin_clean_slate_wipe()`** — gate `auth_role() = 'super_admin'`;
  `pg_advisory_xact_lock(hashtext('clean_slate'))`; build the snapshot payload
  with **explicit per-table** `coalesce(jsonb_agg(to_jsonb(t.*)), '[]'::jsonb)`
  (one statement per table — **no dynamic loop**, per repo convention); compute
  `row_counts` / `total_rows`; `raise 'nothing_to_wipe'` if total is 0; INSERT the
  snapshot row **first**; DELETE in the order above; INSERT `audit_events`
  (`super_admin.clean_slate_wipe`, `metadata = row_counts`). Snapshot + deletes +
  audit are one atomic transaction. A new wipe overwrites the prior snapshot
  (single-snapshot policy).

- **`super_admin_clean_slate_revert(p_snapshot_id uuid default null)`** — gate +
  advisory lock; resolve target (explicit id, else latest un-restored snapshot,
  `for update`); `raise 'missing_snapshot'` if none; **`target_not_empty` guard**
  — refuse if any wipe table is non-empty (prevents PK collisions / silent
  merge); re-insert **parent → child** (reverse of the wipe) via
  `jsonb_populate_recordset(null::public.<table>, payload->'<key>')`, preserving
  original `id` / `created_at` / FK linkage; set `restored_at` / `restored_by`;
  audit `super_admin.clean_slate_revert`.

- **`super_admin_clean_slate_import(p_payload jsonb)`** — gate + lock; validate
  `schema_version = 1` (`unsupported_snapshot_version`) and that every expected
  key is a JSON array (`malformed_snapshot`); same `target_not_empty` guard; same
  parent → child insert body (factor it so review sees one ordered list); audit
  `super_admin.clean_slate_import`. `jsonb_populate_recordset` ignores unknown
  JSON keys, so an export from a slightly newer schema (extra columns) still
  imports its known columns.

**Grants** (per existing pattern, per function):
`revoke all on function ... from public, anon, authenticated; grant execute on
function ... to authenticated;`

**Referential assumption (document in the migration header):** restore relies on
referenced parents (profile / member / group) still existing. This is safe under
the current write surface — profiles/members are deactivate-only, groups are
close/reopen-only, and no hard-delete RPC exists. If a parent were ever
hard-deleted, the restore INSERT would raise and roll back the whole transaction
(fail-safe).

### 1.3 App layer

- **`lib/admin/rpc.ts`** — add `rpcSuperAdminCleanSlateWipe(client)`,
  `rpcSuperAdminCleanSlateRevert(client, { p_snapshot_id })`,
  `rpcSuperAdminCleanSlateImport(client, { p_payload })`. All return the snapshot
  `uuid` via `callUuidRpc`. **Do not** funnel a count through the uuid channel —
  the existing `rpcSuperAdminBulkImportPeople` does this and `readUuidRpcData`
  rejects non-UUIDs (a latent null bug); instead read counts back from
  `clean_slate_snapshots` by id for the success summary.

- **`lib/admin/action-result.ts`** — add error tokens `nothing_to_wipe`,
  `missing_snapshot`, `target_not_empty`, `unsupported_snapshot_version`,
  `malformed_snapshot` (reuse the existing `insufficient_privilege`).

- **NEW `app/(protected)/admin/super-admin/clean-slate-actions.ts`** (`"use
  server"`, custom-action shape like `people-import-actions.ts`): each action does
  `requireSuperAdminSession()` → server client → RPC wrapper → `mapRpcError` →
  `revalidatePath("/admin/super-admin")` → `ActionResult<CleanSlateSummary>`. Wipe
  and revert **re-verify the type-to-confirm phrase server-side**. Import reads the
  uploaded `File` from `FormData`, `await file.text()` + `JSON.parse` in a
  try/catch (friendly fail on parse error), then calls the import RPC (the RPC does
  the authoritative validation).

- **Export = Route Handler**
  `app/(protected)/admin/super-admin/clean-slate/export/[snapshotId]/route.ts`
  (`GET`). Route handlers do **not** inherit the `(protected)` layout, so the
  super-admin check must be **explicit** here (return a `403` `Response` if not
  super-admin); read the snapshot via the server client (RLS is the second layer)
  and return JSON with
  `Content-Disposition: attachment; filename="clean-slate-<created_at>.json"`.
  This would be the app's first `route.ts`.

### 1.4 UI

Replace the static "Blocked" placeholder inside the existing `#danger-zone`
`CommandSection` (`components/admin/super-admin-console-shell.tsx`, ~lines
627–657; keep the `accent` tone `blocked`) with a **new client component**
`components/admin/clean-slate-card.tsx` (`"use client"`, pastoral `P` / `PButton`
/ `PBadge`, matching `AccountManagementCard` and `test-accounts-panel.tsx`).
Thread a `latestSnapshot` summary into `SuperAdminConsoleData` from the console
page loader. The card surfaces:

- **Impact preview** — current per-table row counts (loaded server-side), so the
  admin sees exactly what will be wiped.
- **Wipe** — `useActionState(superAdminCleanSlateWipe)` with **type-to-confirm**
  (`CLEAR HISTORY`): submit `disabled` until the exact phrase is typed; the phrase
  is sent in FormData and re-checked server-side.
- **Revert** — type-to-confirm (`RESTORE`), disabled when there is no
  un-restored snapshot; shows the snapshot timestamp + counts.
- **Export** — `<a href=".../export/{snapshotId}" download>` styled as a button.
- **Import** — `<input type="file" accept="application/json">` form →
  `superAdminCleanSlateImport`, also type-to-confirm gated.
- Pending/disabled state via `useActionState` pending; errors and success render
  through the existing `StatusBadge` + inline error-list patterns.

### 1.5 Audit action tokens

`super_admin.clean_slate_wipe`, `super_admin.clean_slate_revert`,
`super_admin.clean_slate_import`. (`audit_events.action` is `text`, so no enum
migration is needed.)

### 1.6 Edge cases

| Edge case | Handling |
| --- | --- |
| Nothing to wipe | Wipe raises `nothing_to_wipe` when `total_rows = 0`; no snapshot, no audit, no-op. |
| Double-wipe | Second wipe finds targets empty → `nothing_to_wipe`. Advisory lock blocks a concurrent-wipe race. |
| Revert after new data added | `target_not_empty` guard refuses (avoids PK collisions / silent merge). |
| Revert with no snapshot | `missing_snapshot`; UI points to the import-a-file path. |
| Double-revert of same snapshot | `restored_at` set on first revert; latest-un-restored query skips it. |
| Import of stale/mismatched schema | RPC checks `schema_version` (`unsupported_snapshot_version`) and that each key is a JSON array (`malformed_snapshot`); extra columns ignored. |
| Non-JSON / garbage file | Server action `JSON.parse` try/catch returns a friendly failure before the RPC. |
| Referenced parent gone between wipe & revert | Safe under current write surface (deactivate-only); otherwise the restore raises and rolls back (fail-safe). |
| Large payload | jsonb in a single TOAST-backed row; export streams via the route handler. A future slice could move to per-table snapshot rows if payloads grow huge. |

---

## Feature 2 — Super Admin: CSV export template for bulk import

An **empty template** matching the existing import parser exactly.

- Source of truth for the header/columns: `lib/admin/people-import.ts` plus the
  form `components/admin/forms/people-import-form.tsx`. Header is
  `full_name,email,phone,role` where `role ∈ {leader, member}` and leaders
  require an email.
- Add a small route handler, e.g.
  `app/(protected)/admin/super-admin/people-import-template/route.ts`, returning a
  `text/csv` download: the header row plus one example/commented row.
- Add a **"Download CSV template"** `PButton` (anchor) next to the import form in
  the Super Admin Console `people-import` section.
- No DB, RPC, or audit needed — this is read-only generation.

---

## Feature 3 — Super Admin: Reset audit logs (separate purge)

A standalone Danger-Zone action, independent of Clean Slate.

- **New RPC `super_admin_reset_audit_logs()`** — super-admin gate; **archive**
  current `audit_events` into an `audit_events_archive` backup table; delete
  `audit_events`; then insert **one** fresh `audit_events` row
  `super_admin.reset_audit_logs` (with the prior row count in `metadata`) so the
  purge itself is auditable.
- **Default: archive-then-purge** (reversible) rather than a hard purge. This is
  the recommended default; can be revisited at build time.
- **UI:** a separate guarded card in the Danger Zone, type-to-confirm
  (`RESET AUDIT LOGS`), showing the current row count.
- Wrapper in `lib/admin/rpc.ts`, server action via `runAdminWriteAction`, error
  tokens in `lib/admin/action-result.ts`.

---

## Feature 4 — Admin: Top next actions at top of the page

The ranked "Top next actions" list **already exists** at the bottom of the admin
landing (`components/lg/admin/dashboard/NeedsAttentionArea.tsx`, rendered last in
`DashboardClient.tsx` ~lines 98–101, built from `lib/dashboard/needs-attention.ts`).

- **Move** the `Top next actions` block to the **top** of `DashboardClient.tsx`
  — above `VitalSignsBand`, or directly beneath it. Reuse the existing component
  as-is; just reorder the JSX. No new logic.
- Preserve the existing degraded-state suppression behavior.

---

## Feature 5 — Admin: Overview cards collapsed with a default toggle

The overview cards are the 2-column and 3-column grids in `DashboardClient.tsx`
(~lines 70–96): LeaderCare, LaunchPlanning, HealthDistribution, GuestPipeline,
LeaderPipeline (and optionally the Activity band).

- `DashboardClient` is a **server** component. Extract the overview-card grids
  into a new **client** component
  `components/lg/admin/dashboard/CollapsibleOverview.tsx` that wraps them in a
  native `<details>` / toggle (reuse the pattern from
  `components/admin/super-admin-collapsible-section.tsx`).
- Persist the open/closed state per-admin via the existing `usePersistedViewState`
  hook (`lib/hooks/use-persisted-view-state.ts`) + `lib/admin/view-preferences.ts`,
  with a surface key such as `admin-overview-cards`, scoped by profile id. The
  admin's **last choice becomes their default** (per browser/user) — this matches
  the repo's localStorage-only preference pattern; **no DB table** is introduced.
- Hydration-safe: render the default (open) on SSR, then restore the persisted
  choice after mount (the hook already handles this).

---

## Files this PRD would touch (when implemented)

- **NEW** `supabase/migrations/20260603130000_phase_cs1_clean_slate_history_wipe.sql`
  — `clean_slate_snapshots` table + wipe/revert/import RPCs + grants.
- **NEW** (optional second migration) audit-reset: `audit_events_archive` +
  `super_admin_reset_audit_logs()`.
- `lib/admin/rpc.ts` — new wrappers (clean-slate wipe/revert/import, audit reset).
- `lib/admin/action-result.ts` — new error tokens.
- **NEW** `app/(protected)/admin/super-admin/clean-slate-actions.ts` — server
  actions + import parse.
- **NEW** route handlers: clean-slate snapshot export; CSV import template.
- `components/admin/super-admin-console-shell.tsx` — wire real Danger Zone cards +
  CSV template button.
- **NEW** `components/admin/clean-slate-card.tsx` (client).
- `components/lg/admin/dashboard/DashboardClient.tsx` — reorder next-actions to
  top; extract overview grids.
- **NEW** `components/lg/admin/dashboard/CollapsibleOverview.tsx` (client).

---

## Verification (when implemented)

- **Migrations:** apply to a dev branch (Supabase MCP `apply_migration`); run
  `list_tables` first. Confirm RPCs reject non-super-admin callers (`auth_role`)
  and RLS blocks `clean_slate_snapshots` SELECT for non-super-admin.
- **Clean Slate:** seed activity rows → wipe → assert history tables empty,
  people/groups/assignments untouched, snapshot row populated, audit row written.
  Revert → assert rows restored with identical `id`/`created_at` and FK linkage
  (`attendance_records.session_id`, `follow_ups.related_guest_id`). Export JSON →
  wipe again → import the file → assert restored. Edge cases (double-wipe,
  revert-after-new-data, stale-schema import, non-JSON file) all rejected
  gracefully with the right tokens. Confirm the export route returns `403` for a
  non-super-admin session.
- **Audit reset:** purge → assert `audit_events_archive` populated and only the
  single `reset_audit_logs` row remains.
- **CSV template:** download, paste back into the import form unmodified → parses
  (zero rows / example row handled).
- **Dashboard:** next actions render at the top; overview collapse toggles and the
  choice survives reload (localStorage key present).
- `npm run lint` + typecheck + build.
