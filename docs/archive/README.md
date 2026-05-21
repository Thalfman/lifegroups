# Docs Archive

## Purpose

This directory holds documentation that is **no longer part of the
active roadmap** but is preserved for implementation history.

Everything here describes work that has already shipped, has been
superseded, or is otherwise out of scope for the current direction. Use
these files as a reference when you need to understand how a particular
phase was built. **Do not** use them as the source of truth for what to
build next.

For the active roadmap, see:

- [`../PRODUCT_ROADMAP.md`](../PRODUCT_ROADMAP.md) — current ordered
  execution plan.
- [`../FEATURE_BACKLOG.md`](../FEATURE_BACKLOG.md) — broader feature
  inventory.
- [`../JULIAN_FEEDBACK_PIVOT.md`](../JULIAN_FEEDBACK_PIVOT.md) — context
  for the direction shift.

## Why archive instead of delete?

Old phase specs document the contracts, RPCs, audit events, and RLS
posture that the live app was built on. Deleting them would erase
useful history for security reviews, regressions, and onboarding.
Moving them here keeps the active `docs/` directory scannable while
preserving the record.

## Archived files (with one-line reasons)

### Phase 5A — admin people & group management (shipped)

- `PHASE_5A_ADMIN_MANAGEMENT.md` — scope outline for the Phase 5A
  people/role/group management track.
- `PHASE_5A_ACTION_CONTRACTS.md` — detailed admin-action / RPC / audit
  contracts from Phase 5A.
- `PHASE_5A_1_VERIFICATION.md` — manual verification checklist for
  Phase 5A.1 (admin people writes).
- `PHASE_5A_2_HARDENING_REPORT.md` — hardening report for Phase 5A.2
  (group management + audit visibility tightening).
- `PHASE_5A_2_VERIFICATION.md` — manual verification checklist for
  Phase 5A.2.
- `PHASE_5A_3_SUPER_ADMIN.md` — feature spec for the `/admin/super-admin`
  console.
- `PHASE_5A_3_VERIFICATION.md` — manual verification checklist for
  Phase 5A.3.
- `PHASE_5A_4_ADMIN_OPERATIONS_UX.md` — feature spec for filterable
  directories + metric settings foundation.
- `PHASE_5A_4_VERIFICATION.md` — manual verification checklist for
  Phase 5A.4.

### Phase 5A.5–5A.7 — schedule intelligence and calendars (shipped)

- `PHASE_5A_5_ADMIN_UX_SCHEDULE_INTELLIGENCE.md` — meeting cadence
  fields (day, time, frequency, parity).
- `PHASE_5A_6_GROUP_CALENDAR.md` — per-group calendar overrides MVP.
- `PHASE_5A_7_ADMIN_MASTER_CALENDAR.md` — read-only ministry-wide
  master calendar.

### Phase 5B — leader check-ins (shipped)

- `PHASE_5B_0_LEADER_CHECKINS.md` — leader weekly check-in feature
  spec.
- `PHASE_5B_0_HARDENING_REPORT.md` — RPC hardening report.
- `PHASE_5B_0_VERIFICATION.md` — manual verification checklist.
- `PHASE_5B_1_ADMIN_CHECKIN_REVIEW.md` — read-only admin check-in
  review.
- `PHASE_5B_1_VERIFICATION.md` — manual verification checklist.

### Phase 5C — guest pipeline and follow-ups (shipped)

- `PHASE_5C_0_GUEST_PIPELINE_FOLLOWUPS.md` — guest pipeline + follow-
  up foundation feature spec.
- `PHASE_5C_0_VERIFICATION.md` — manual verification checklist.
- `PHASE_5C_1_PRIVACY_HARDENING.md` — privacy hardening pass for
  `admin_private_note` boundary.
- `PHASE_5C_1_VERIFICATION.md` — manual verification checklist.

### Phase 6 — admin dashboard metrics (shipped)

- `PHASE_6_0_ADMIN_DASHBOARD_METRICS.md` — admin dashboard rewrite
  with metrics integration.
- `PHASE_6_0_VERIFICATION.md` — manual verification checklist.

### Phase 7 — design refresh (shipped)

- `PHASE_7_0_DESIGN_REFRESH.md` — warm-pastoral visual system spec.
- `PHASE_7_0_VERIFICATION.md` — manual verification checklist.

### Pre-launch polish (shipped)

- `PRELAUNCH_BRAND_AUTH_CLEANUP.md` — brand + auth UX cleanup
  checklist.
- `PRELAUNCH_MOBILE_UX_OVERHAUL.md` — mobile polish pass.

### Old completion roadmaps (superseded)

- `APP_COMPLETION_ROADMAP.md` — independent review snapshot from
  2026-05-19; superseded by the post-Julian pivot.
- `CLAUDE_APP_COMPLETION_ROADMAP.md` — extended review snapshot from
  2026-05-19; superseded by the post-Julian pivot.

### Old roadmap doc (superseded)

- `ROADMAP.md` — high-level phase progression summary; replaced by
  [`../PRODUCT_ROADMAP.md`](../PRODUCT_ROADMAP.md).

### One-shot design handoffs (shipped)

- `CLAUDE_DESIGN_EXTRACTION.md` — handoff notes from the Claude
  Design HTML prototype bundle; the visual system has shipped.
- `LAUNCH_POLISH_QA.md` — Phase 5A.0.1 launch polish QA checklist;
  closed.

## What is NOT archived

The following docs remain in `docs/` because they describe **current
operational reality** or active strategy and are still referenced by
the new roadmap:

- `ARCHITECTURE.md`
- `DATABASE_SCHEMA.md`
- `SEED_DATA.md`
- `DEPLOYMENT.md`
- `PRODUCT_BRIEF.md`
- `FREE_TIER_NOTES.md`
- `TEST_AUTH_USERS.md`
- `SUPER_ADMIN_INVITE_USER_WORKFLOW.md`
- `FINALIZED_HOLISTIC_PLAN.md`
- `JULIAN_FEEDBACK_PIVOT.md` (new)
- `PRODUCT_ROADMAP.md` (new)
- `FEATURE_BACKLOG.md` (new)
- `SHEPHERD_CARE_TRACKER_PLAN.md` (new)
- `LAUNCH_PLANNING_PLAN.md` (new)
