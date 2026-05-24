# Docs Archive

This directory holds documentation that is **no longer part of the
active roadmap** but is preserved for implementation history. Use these
files as a reference when you need to understand how a particular phase
was built. **Do not** use them as the source of truth for what to build
next.

For the active roadmap, see:

- [`../PRODUCT_ROADMAP.md`](../PRODUCT_ROADMAP.md) — current ordered
  execution plan (pivot rationale and reliability / security debt
  appendix included).
- [`../FEATURE_BACKLOG.md`](../FEATURE_BACKLOG.md) — broader feature
  inventory.

## Why archive instead of delete?

Old phase specs document the contracts, RPCs, audit events, and RLS
posture the live app was built on. Deleting them would erase useful
history for security reviews, regressions, and onboarding. Moving them
here keeps the active `docs/` directory scannable.

## Archived files

### Julian spine implementation specs (shipped)

These are the as-built specs for the SC.* / LP.* phases. The
forward-looking plans (`SHEPHERD_CARE_TRACKER_PLAN.md`,
`LAUNCH_PLANNING_PLAN.md`) remain in `docs/`.

- `SC_1A_SHEPHERD_CARE_FOUNDATION.md` — shepherd care directory + detail
  page, `shepherd_care_profiles` / `shepherd_care_interactions` tables,
  `admin_upsert_shepherd_care_profile` + `admin_log_shepherd_care_interaction`
  RPCs.
- `SC_2_OVER_SHEPHERD_COVERAGE_TRACKING.md` — `over_shepherds` and
  `shepherd_coverage_assignments` tables, four coverage RPCs, directory
  grouping by over-shepherd.
- `SC_3_JULIAN_CARE_DASHBOARD.md` — dashboard summary cards + attention
  queue + coverage view above `/admin/shepherd-care`.
- `LP_1_CAPACITY_LAUNCH_PLANNING.md` — `/admin/launch-planning` MVP,
  `app_settings.launch_planning` JSON storage,
  `admin_update_launch_planning_assumptions` RPC,
  `computeLaunchPlan()` helper.
- `LP_2_FORECAST_SCENARIOS.md` — `launch_planning_scenarios` table,
  four scenario RPCs, side-by-side compare view.

### Pivot + debt-track context (folded into PRODUCT_ROADMAP.md)

- `JULIAN_FEEDBACK_PIVOT.md` — Julian's verbatim feedback and the
  product implications. Distilled into `PRODUCT_ROADMAP.md` §2.
- `FINALIZED_HOLISTIC_PLAN.md` — P0/P1/P2 reliability + security debt
  list. Folded into `PRODUCT_ROADMAP.md` Appendix A.

### Review playbooks (closed)

One-shot operator and engineer checklists from the Julian live-review
window in May 2026. Closed.

- `JULIAN_LIVE_REVIEW_PREP.md` — operator-facing prep playbook (what to
  click before Julian came back in).
- `JULIAN_REVIEW_READINESS_QA.md` — engineer-facing QA pass over the
  Julian spine before the review.

### Phase 5A — admin people & group management (shipped)

- `PHASE_5A_ADMIN_MANAGEMENT.md` — scope outline.
- `PHASE_5A_ACTION_CONTRACTS.md` — admin-action / RPC / audit contracts.
- `PHASE_5A_1_VERIFICATION.md` — admin people writes.
- `PHASE_5A_2_HARDENING_REPORT.md` — group management + audit
  visibility hardening.
- `PHASE_5A_2_VERIFICATION.md` — Phase 5A.2 checklist.
- `PHASE_5A_3_SUPER_ADMIN.md` — `/admin/super-admin` console spec.
- `PHASE_5A_3_VERIFICATION.md` — Phase 5A.3 checklist.
- `PHASE_5A_4_ADMIN_OPERATIONS_UX.md` — filterable directories + metric
  defaults.
- `PHASE_5A_4_VERIFICATION.md` — Phase 5A.4 checklist.

### Phase 5A.5–5A.7 — schedule intelligence and calendars (shipped)

- `PHASE_5A_5_ADMIN_UX_SCHEDULE_INTELLIGENCE.md` — meeting cadence
  fields.
- `PHASE_5A_6_GROUP_CALENDAR.md` — per-group calendar overrides MVP.
- `PHASE_5A_7_ADMIN_MASTER_CALENDAR.md` — ministry-wide master
  calendar.

### Phase 5B — leader check-ins (shipped)

- `PHASE_5B_0_LEADER_CHECKINS.md` — leader weekly check-in spec.
- `PHASE_5B_0_HARDENING_REPORT.md` — RPC hardening.
- `PHASE_5B_0_VERIFICATION.md` — Phase 5B.0 checklist.
- `PHASE_5B_1_ADMIN_CHECKIN_REVIEW.md` — admin check-in review.
- `PHASE_5B_1_VERIFICATION.md` — Phase 5B.1 checklist.

### Phase 5C — guest pipeline and follow-ups (shipped)

- `PHASE_5C_0_GUEST_PIPELINE_FOLLOWUPS.md` — pipeline foundation.
- `PHASE_5C_0_VERIFICATION.md` — Phase 5C.0 checklist.
- `PHASE_5C_1_PRIVACY_HARDENING.md` — `admin_private_note` boundary.
- `PHASE_5C_1_VERIFICATION.md` — Phase 5C.1 checklist.

### Phase 6 — admin dashboard metrics (shipped)

- `PHASE_6_0_ADMIN_DASHBOARD_METRICS.md` — dashboard rewrite.
- `PHASE_6_0_VERIFICATION.md` — Phase 6.0 checklist.

### Phase 7 — design refresh (shipped)

- `PHASE_7_0_DESIGN_REFRESH.md` — warm-pastoral visual system.
- `PHASE_7_0_VERIFICATION.md` — Phase 7.0 checklist.

### Pre-launch polish (shipped)

- `PRELAUNCH_BRAND_AUTH_CLEANUP.md` — brand + auth UX cleanup.
- `PRELAUNCH_MOBILE_UX_OVERHAUL.md` — mobile polish pass.

### Old completion roadmaps (superseded)

- `APP_COMPLETION_ROADMAP.md` — independent review snapshot from
  2026-05-19; superseded by the post-Julian pivot.
- `CLAUDE_APP_COMPLETION_ROADMAP.md` — extended review snapshot from
  2026-05-19; superseded by the post-Julian pivot.

### Old roadmap doc (superseded)

- `ROADMAP.md` — high-level phase progression summary; replaced by
  `../PRODUCT_ROADMAP.md`.

### One-shot design handoffs (shipped)

- `CLAUDE_DESIGN_EXTRACTION.md` — handoff notes from the Claude Design
  HTML prototype bundle; the visual system has shipped.
- `LAUNCH_POLISH_QA.md` — Phase 5A.0.1 launch polish QA; closed.
