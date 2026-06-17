# Repo Consolidation & Simplification (behavior- and interface-preserving)

## Summary

Consolidate the repo by tightening internal architecture around the patterns the
app has **already chosen** — the Care / Plan / Multiply product spine, per-surface
read seams (ADR 0015), the shared write-action runner (ADR 0001/0005),
centralized validation (ADR 0012), shared UI primitives, and preserved
frozen/alias routes (ADR 0009/0016). This is a **behavior-preserving refactor
only**.

No public functionality, routes, server-action names, RPC names, database
schema, RLS policies, feature flags, user-facing permissions, or external
interfaces change. Old direct URLs and alias routes keep resolving (200, not
302). Every commit leaves the repo building with all suites green.

This document is a proposal. Each numbered area below is an independent wave that
can be scheduled, scoped down, or deferred on its own.

## Guiding constraints

- **No observable behavior change, no interface change.** This is stricter than
  the usual repo rules and governs every wave.
- **ADR-aligned.** Where a tempting simplification contradicts an ADR, it is NOT
  done here. Specifically:
  - **ADR 0011** — group-row assembly stays per-surface; do not merge the
    intentionally-separate group assemblers.
  - **ADR 0012** — validators stay clustered behind the `@/lib/admin/validation`
    barrel; do not inline validators into `app/**/actions.ts`.
  - **ADR 0015** — reads go through the per-surface reads seam; one reads
    interface per surface, never a global god interface.
  - **ADR 0009/0016** — frozen/off-nav surfaces are preserved compatibility
    interfaces (turned off, not deleted); their routes keep resolving.
- **Security invariants in `CLAUDE.md` are untouched** — no new writes, no
  `select("*")`, no service-role usage, no broadened RLS. This work introduces
  none of those.
- **Gated by the existing suites** every wave: `npm run typecheck`,
  `npm run lint`, `npm run test:run`, `npm run build`, plus `npm run test:a11y`
  for any UI-affecting wave. Green before and after is the contract that
  "nothing changed."

## Key changes by area

### 1. Preserve the product contract (the fixed points)

- Keep `/admin`, `/admin/care`, `/admin/plan`, `/admin/multiply`,
  `/admin/groups`, `/admin/people`, `/admin/settings`, `/admin/super-admin`,
  `/leader`, `/over-shepherd`, the public auth routes, and **all frozen/off-nav
  routes** (`/admin/planning`, `/admin/launch-planning`, `/admin/calendar`,
  `/admin/guests`, `/admin/follow-ups`, `/admin/group-health`,
  `/admin/leader-pipeline`, `/admin/check-ins/**`) resolving exactly as today.
  Note `/admin/leader-pipeline` is a Care-owned frozen alias in
  `lib/nav/active-nav.ts` with a live revalidation path in
  `app/(protected)/admin/leader-pipeline/actions.ts` — bookmarked URLs and that
  action must keep working.
- Keep the existing `ActionResult` form contract, server-action exports,
  Supabase RPC names, feature-flag keys, and route search-param compatibility
  (legacy `?tab=`/`?view=`/`?filter=` keys keep selecting the same canonical
  view via `normalizeCareTabKey` and `lib/nav/active-nav.ts`'s
  `NAV_ALIAS_TO_CANONICAL`, which stays the source of truth).
- No migrations, no RLS changes, no dropped tables/columns, no deleted frozen
  surfaces, no renamed user-facing concepts.

### 2. Standardize read loading (ADR 0015 read-seam wave)

There are **~85 direct `createSupabaseServerClient()` call sites**; many page
loaders already follow the seam shape (`buildXData(reads, options)` +
`supabaseXReads(client)` + `loadXData()`), but some still hand-roll reads and
degrade logic.

- Convert remaining direct-read loaders into the seam shape, one surface at a
  time, keeping exported loader names and page props unchanged.
- Use `lib/supabase/read-batch.ts`'s `readBatch` where surfaces hand-roll
  concurrent `ReadResult`-shaped fetches + degrade behavior.
- Start with high-churn admin loaders: Groups detail, People detail, Care
  detail, Over-Shepherd detail, Multiply, Settings, and the legacy alias hosts.
- **Preserve degrade semantics exactly**: a failed read suppresses derived
  output, never reports a false zero; missing-client/demo paths render typed
  fallback data unchanged; no `select("*")` introduced.

### 3. Internal code dedup (lowest risk, highest signal)

**3a. Centralize duplicated test helpers.** ~24 colocated test files privately
re-define the identical reads-seam stubs:

```ts
const ok = <T>(data: T): ReadResult<T> => ({ data, error: null });
const fail = (message: string): ReadResult<never> => ({ data: null, error: new Error(message) });
```

(e.g. `components/admin/multiply/__tests__/multiply-plan-data.test.ts`,
`components/admin/care/__tests__/care-data.test.ts`,
`lib/supabase/__tests__/read-batch.test.ts`). Create `tests/support/read-result.ts`
exporting them against the canonical `ReadResult` type and import it in each
file. Leave per-file row builders alone (they genuinely vary). Ensure the helper
isn't matched by `vitest.config.ts` spec globs.

**3b. Pull behavior-identical validation primitives into the shared module.**
The seam already exists — `lib/shared/validation-primitives.ts`
(`ValidationResult`, `isRecord`, `normalizeUuid`) and `lib/shared/uuid.ts`
(`UUID_RE`, `isUuid`) — and its header comment documents this exact debt and the
rule: **only behavior-identical pieces move; genuinely different per-surface
contracts stay.** Respecting ADR 0012, the `@/lib/admin/validation` barrel stays
stable.

- `lib/calendar/payload.ts` is the main offender: it privately re-declares
  `ValidationResult`, `isRecord`, `trimString`, `readOptionalString`, `UUID_RE`,
  `isUuid` — all behavior-identical. Replace with shared imports. **Keep its
  stricter `isIsoDate` local** (it round-trips the date; admin's is regex-only).
- `lib/leader/group-note-validation.ts` privately re-declares `isRecord` (which
  IS identical — import it) **and `trimString` (which is NOT)**: the leader local
  `trimString` returns `null` for whitespace-only input and feeds a
  `body === null` non-empty check, whereas the shared/admin helper returns the
  trimmed string (including `""`). Swapping it in would let blank/whitespace
  leader Care Notes + Prayer Requests pass validation — a behavior change. Keep
  this `trimString` local (or replace it with an explicit non-empty-string
  helper); only share `isRecord`.
- Promote the genuinely cross-surface string helpers out of
  `lib/admin/validation/shared.ts` into `lib/shared/validation-helpers.ts`
  (`trimString`, the `undefined`-returning `readOptionalString`,
  `isNonEmptyString`, `isEmail`, `isPhone`, `readOptionalInteger`,
  `readBooleanFlag`) and **re-export from the admin module** so every existing
  importer keeps resolving; point `calendar/payload.ts` at the new module.
- **Do NOT touch `lib/leader/validation.ts`** — its `isIsoDate` (round-trips),
  `readBool` (also accepts `"yes"`), and `readOptionalString` (returns `null`,
  not `undefined`) are deliberately different contracts.

**3c. Consolidate shared UI primitives.** Prefer the existing `components/ui`
primitives for repeated button/input/select/tabs/empty-state/dialog/
scrollable-table behavior; replace duplicated field-class constants with imports
from `components/admin/forms/field-styles.ts`. Keep visual output equivalent
(only bug-level consistency fixes already covered by tests). No redesigns, no
workflow/placement changes.

### 4. Extract a shared `TabShell` primitive

`components/admin/care/care-shell.tsx` and
`components/admin/multiply/multiply-shell.tsx` carry near-identical WAI-ARIA
`role="tablist"` markup + roving-tabindex keyboard handling, differing only in id
prefix, `aria-label`, active-state source (Care = local `useState` + prop
re-seed; Multiply = URL `?tab=` history sync), and minor className tokens.

- Create `components/lg/tab-shell.tsx` owning **presentation + ARIA keyboard
  only** (props: `tabs`, `activeKey`, `onSelect`, `idPrefix`, `ariaLabel`,
  className overrides). Each shell becomes a thin adapter keeping its own state
  logic and rendering `<TabShell/>`; public props/exports unchanged.
- **Parity is the bar**: keep ids (`care-tab-*`, `multiply-tab-*`), roles,
  `aria-selected`/`aria-controls` byte-identical, **and keep each shell's exact
  keyboard set**. Care handles only Arrow Left/Right + Home/End; Multiply also
  Arrow Up/Down. To honor "no behavior change", make the supported key set a
  per-shell prop and preserve Care's current set as-is — do NOT default to the
  union, since that would make Up/Down newly activate Care tabs (observable).
  Adopting the full ARIA key set in Care is a deliberate accessibility
  improvement to decide separately, not part of this behavior-preserving wave.
  `test:a11y` + the shell tests are the gate.

### 5. Simplify write-action structure (no contract change)

- Keep the shared `runWriteAction` pipeline as the **only** write pipeline and
  the admin/leader/over-shepherd adapters (`lib/**/run-action.ts`) thin.
- Move repeated action-spec helpers, `revalidatePath` target lists, and
  action-copy/error-token maps into area-local constants where the repetition is
  real and behavior is identical.
- Keep all action exports, RPC names, and RPC argument shapes stable. Do not
  inline validators into actions (ADR 0012). Remove only **proven orphan
  exports** (zero importers, no public route/API role) — audited, not assumed.

### 6. Shared form / note primitives (medium risk)

Land after waves 1–4 are green. Extract a generic `AssignmentForm` from
`components/admin/forms/{assign-leader,assign-member,coverage-assign}-form.tsx`
+ `components/admin/shepherd-care/coverage-assignment-form.tsx`, and a shared
`NoteForm` body from `care-note-write-form.tsx` / `group-note-write-form.tsx`
(keeping role/visibility gating + per-surface actions intact). The action called,
field names posted, and validation contract must be identical before/after.
**Only extract where shapes genuinely converge** — forced unification behind many
conditional props is not simplification.

### 7. Split oversized monoliths (behavior-preserving extraction)

Pure mechanical decomposition: extract cohesive sub-sections (table rendering,
filters, row actions, cards, summary builders, pure mappers) into sibling files;
the top-level component keeps its name, props, and exports; rendered output
unchanged. Verified targets (>600 LOC):
`components/admin/settings/groups-catalog-editor.tsx` (1030),
`components/admin/multiplication/multiplication-planner.tsx` (953),
`components/admin/settings/multiply-trigger-editor.tsx` (740),
`components/admin/people-directory.tsx` (702),
`components/admin/settings-shell.tsx` (657),
`components/admin/groups-directory.tsx` (619),
`components/admin/launch-planning/scenarios-panel.tsx` (607). Avoid changing
exported data shapes; do not export children beyond the feature unless already
needed. Highest-effort / lowest-urgency wave — deferrable without affecting the
rest.

### 8. Rationalize legacy / frozen-surface implementation

Keep frozen routes and direct URLs alive, but make frozen/alias pages render
**through canonical area components/loaders** rather than duplicating them.
Centralize alias-to-canonical mapping and tab/search-param normalization so old
links stay stable while internals stop duplicating loaders.
`NAV_ALIAS_TO_CANONICAL` and its tests remain the source of truth for active-nav
behavior.

### 9. Documentation hygiene

- **Resolve the ADR-0022 filename collision.** Two files share `0022`:
  `docs/adr/0022-multiply-unifies-plan-readiness-leaders.md` (canonical, cited as
  0022 in README/CLAUDE.md) and
  `docs/adr/0022-admin-jsonb-write-reguard-and-audit-locks.md` (misnumbered).
  Renumber the jsonb ADR to **0028** (next free; ADRs run 0001–0027) and update
  `docs/README.md`. Updating slug references (`grep -rn "0022-admin-jsonb"`) is
  not enough: do a **contextual search for bare "ADR 0022" citations of the
  jsonb/audit-lock ADR** — they appear in migration SQL (e.g.
  `supabase/migrations/20260617000000_phase_groups7_audit_before_advisory_locks.sql`)
  and tests (`lib/admin/__tests__/audit-before-advisory-locks-migration.test.ts`)
  — and repoint only those to 0028. Bare "ADR 0022" elsewhere refers to the
  Multiply ADR and must stay; verify each citation's subject before editing.
- **Archive the superseded `docs/PRD.md`** to git history per the documented docs
  convention (marked superseded by PRD #371). Before removing it, **update or
  replace every inbound link** so nothing dangles — it is referenced from
  `README.md`, `docs/README.md`, `docs/architecture/ARCHITECTURE.md`, and several
  `docs/adr/*` files (confirm with `grep -rn "PRD.md"`); also confirm no code
  imports it. Skip the removal if the user prefers to keep it in-tree; do the ADR
  renumber regardless.
- After implementation, refresh `docs/architecture/ARCHITECTURE.md` to describe
  the consolidated internal patterns. ADRs stay authoritative.

## Out of scope (to honor "no interface change")

- Changing how any route or alias resolves. Each keeps its **current** behavior:
  the alias hosts (`/admin/calendar`, `/admin/shepherd-care`,
  `/admin/follow-ups`, `/admin/launch-planning`) render 200 today and must keep
  rendering; the `/admin/multiply/criteria` and `/admin/multiply/settings` pages
  **`redirect()` today** (to `/admin/settings?tab=…`) and must keep redirecting —
  do not convert a redirect into a rendered page or vice-versa.
- Renaming the `components/admin/multiplication/` ↔ `multiply/` directories or
  any exported component/type (would break importers — an internal interface).
- Any migration, RPC, RLS, feature-flag-key, or `types/` change.
- Merging the per-surface group-row assemblers (ADR 0011).
- Removing CI/seed scripts (`scripts/codex-review-loop.mjs`,
  `generate-multiplication-seed.ts`) — audit separately if desired.

## Implementation sequence (waves)

1. **Baseline & guardrails** — capture `git status --short --branch`; run
   typecheck, lint, `test:run`, build. If any baseline gate fails, record it
   before refactoring. Turn this doc into a tracking checklist.
2. **Read-seam wave** (§2) — one surface loader at a time to
   `buildXData`/`supabaseXReads`; add/extend pure builder tests per surface;
   commit each surface independently.
3. **Internal dedup wave** (§3) — test helpers, validation primitives, UI
   primitive/field-style imports; one family per commit.
4. **TabShell wave** (§4) — extract, refactor both shells to adapters, verify
   a11y parity.
5. **Alias/frozen-route wave** (§8) — thin alias pages delegate to canonical;
   tests prove old URLs still 200 and nav ownership is correct; commit per alias
   family.
6. **Oversized-file extraction wave** (§7) — mechanical splits along obvious
   boundaries; each independently tested.
7. **Write/action cleanup wave** (§5 + §6) — dedupe specs/copy/revalidate lists;
   extract converging forms; tests around any shared helper introduced.
8. **Docs & final verification** (§9) — refresh docs; run full gates again,
   including `test:a11y` for UI-affecting waves; smoke the main route families if
   a dev server is available.

## Public interfaces & types (explicit no-change list)

- No database migrations; no RLS changes.
- No route removals or redirects beyond existing behavior.
- No server-action export renames; no RPC renames or argument changes.
- No feature-flag key changes; no user-facing role/permission changes.
- Internal TypeScript exports may move only when all repo imports are updated and
  the old path is not a documented interface; canonical barrels (esp.
  `@/lib/admin/validation`) remain stable.

## Test plan

- **Baseline gates:** `typecheck`, `lint`, `test:run`, `build`.
- **Read-seam:** pure `buildXData` tests for success, failed-read degradation,
  missing-client fallback, and permission/not-found behavior; existing column-
  allowlist tests stay green; no `select("*")` introduced.
- **Route compatibility:** frozen & alias routes still render (200, not 302);
  legacy search params still select the same canonical tab/view; active nav maps
  aliases to the correct canonical area.
- **Write-action:** existing action tests stay green; any deduplicated helper
  gets tests for validation failure, guard failure, RPC error mapping, success,
  and revalidate targets; no direct `.insert/.update/.delete/.upsert` from
  app/runtime code.
- **UI/a11y:** component tests for shared primitives; existing Playwright/axe
  specs for Home, Care, Settings, Groups, People, Leader, Over-Shepherd, and
  frozen routes; responsive specs where table/primitive changes touch layout.

## Assumptions

- "Functionality or interfaces" means no externally observable product, route,
  auth, action, RPC, schema, feature-flag, or user-facing behavior change.
- Internal file paths and private helper names may change when tests prove
  behavior is unchanged.
- Frozen and alias routes are compatibility interfaces and must be preserved.
- Consolidation follows current ADRs (esp. 0011, 0012, 0015, 0016, 0022, 0024)
  and `CONTEXT.md` vocabulary.
- Work is split into small commits where every commit leaves the repo building
  and tests passing.
