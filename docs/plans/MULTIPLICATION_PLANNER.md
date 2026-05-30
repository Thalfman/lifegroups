# Multiplication Planner — PRD

> Build spec for promoting the multiplication pipeline into a dedicated,
> Google-Doc-replacing planner. Decision rationale lives in
> [ADR 0006](../adr/0006-multiplication-planner-supersedes-google-doc.md);
> North-Star trace is PRD Q9–Q11
> ([`../PRD.md`](../PRD.md)) and Julian's
> [`LG_MULTIPLICATION_PLAN_2026.md`](../julian-inputs/LG_MULTIPLICATION_PLAN_2026.md).

_Status legend:_ ✅ exists · 🟡 partial · 🆕 net-new (this PRD).

## Problem

Julian (the **Ministry Admin**) plans Life Group multiplication in a Google Doc:
which groups are ready to multiply, by gender category × stage of life, with a
target of **2026** or **2027** and his readiness notes. The app already has a
multiplication pipeline, but it is a panel buried in Launch Planning, it is
**empty** (the Doc's data was never loaded), and it lacks a couple of the Doc's
fields. So the Doc stays master by default — not because it is better, but
because the app has never been made the obviously-better place to do this work.

## Solution

Make the in-app planner displace the Doc **by being better**, not by decree
(ADR 0006). Three moves: promote it to its own tab, seed it from the Doc, and
close the small field gaps.

## What already exists (reuse, do not rebuild)

| Capability | Where | State |
|---|---|---|
| Candidate records (target year, status, notes, manual flags) | `multiplication_candidates` (migration `20260528160000`) | ✅ |
| Readiness vs. Julian's 5 criteria | `lib/admin/multiplication.ts` | ✅ |
| Audience × life-stage segmentation | `groups.audience_category` / `groups.life_stage` (migration `20260528150000`) | ✅ |
| Add / edit / archive candidate UI + audited writes | `components/admin/launch-planning/multiplication-pipeline-panel.tsx`, `app/(protected)/admin/launch-planning/actions.ts` | ✅ |
| Live member counts | from `group_memberships` | ✅ |

## Requirements

### R1 — A dedicated Multiplication tab 🟡
Promote the pipeline from a Launch-Planning panel to its own admin surface
(`/admin/launch-planning/multiplication` or a top-level nav item — build-slice
call), reachable from the admin nav (`lib/auth/roles.ts`). Cleaner and more
scannable than the Doc: grouped by audience × life stage, with target-year and
readiness visible at a glance, inline-editable.

### R2 — Seed from the Doc 🆕
Load the ~30 named groups + segments from
[`LG_MULTIPLICATION_PLAN_2026.md`](../julian-inputs/LG_MULTIPLICATION_PLAN_2026.md)
so Julian opens a **populated** planner. Carry the Doc's `(?)` markers and the
reconciliation caveats (e.g. the women's "6 groups" vs. seven-listed mismatch)
into notes. Seeding maps Doc groups → `groups` rows (with audience/life-stage)
and → `multiplication_candidates`. **Real-people data** goes into a seed file;
this is consistent with the names already committed in the markdown source.

### R3 — Capture the missing Doc fields 🆕
- **Successor / leader-designate** — the Doc's second `(Name)`; the apprentice
  intended to carry the multiplied group. Net-new field on
  `multiplication_candidates`. Distinct from the derived co-shepherd-tenure
  readiness signal.
- **Meeting time** (`during the day` / `evening`) — surfaced and editable;
  table-vs-candidate placement is a build-slice call.

### R4 — Target year as in-app data, not a paper decision 🟡
The 2026/2027 split is genuinely unresolvable from the Doc (ADR 0006). Julian
sets each group's `target_year` **in the planner** (the field exists); the
planner should make the split easy to see and set (e.g. group/filter by target
year), so resolving it is a few clicks, not a governance ruling.

## Out of scope (deferred)

- **"Launch from scratch" interest lists** — people interested in a
  not-yet-existent group (Doc's "couples interested in joining this type of
  group"). Needs a net-new prospective-group model (can't FK to a real group);
  separate later slice. **Deferred** (confirmed 2026-05-30).
- **Retiring the markdown source** — stays as provenance until the seeded data
  is confirmed in-app.
- **Changing the readiness criteria or capacity math** — unchanged.

## Architecture / constraints

- All writes through `runAdminWriteAction` → `SECURITY DEFINER` RPC + paired
  `audit_events`; admin-only RLS; no hard deletes (archive via `archived_at`) —
  matching the existing pipeline.
- New fields additive and nullable; no breaking migration.
- No leader-facing surface (LDR.1 unaffected).

## Proposed slices (for triage)

1. **Field extensions** — successor/leader-designate + meeting time: migration,
   RPC params, validator, type. (Tracer: smallest end-to-end.)
2. **Seed** — Doc → groups + candidates seed file, with provenance notes.
3. **Dedicated tab** — route + nav entry + promoted/cleaned UI, target-year
   grouping/filter.

Cut against ADR 0006; slice boundaries to be finalised in triage.
