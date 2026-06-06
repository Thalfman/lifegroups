# Docs Archive

This directory holds documentation that is **off the North-Star path** —
preserved for implementation history. Use these files as a reference when you
need to understand how a particular phase was built. **Do not** use them as the
source of truth for what to build next.

The North Star is Julian's systems conversation. For current truth, see:

- [`../julian-inputs/SYSTEMS_CONVERSATION.md`](../julian-inputs/SYSTEMS_CONVERSATION.md)
  — ⭐ the North Star (Q1–Q12).
- [`../PRD.md`](../PRD.md) — 📌 the PRD (requirements, 1:1 with Q1–Q12).
- [`../adr/0004-systems-conversation-architecture.md`](../adr/0004-systems-conversation-architecture.md)
  — 🏛️ the ADR (decisions, 1:1 with Q1–Q12).

The former planning docs — `MASTER_BLUEPRINT.md`, `PRODUCT_ROADMAP.md` (the old
PRD), `FEATURE_BACKLOG.md`, `STATUS_CHECKLIST.md` — now live **here** in the
archive, superseded by the PRD/ADR pair above. Per-feature specs
(`SC_4_*`, `SUPER_ADMIN_INVITE_USER_WORKFLOW.md`), process docs
(`CODEX_REVIEW_LOOP.md`, `TEST_AUTH_USERS.md`), and `LAUNCH_PLANNING_PLAN.md`
were archived in the same pass.

## Why archive instead of delete?

Old phase specs document the contracts, RPCs, audit events, and RLS
posture the live app was built on. Deleting them would erase useful
history for security reviews, regressions, and onboarding. Moving them
here keeps the active `docs/` directory scannable.

## Archived files

### Julian spine implementation specs (shipped)

These are the as-built specs for the SC._ / LP._ phases. The shepherd-care plan
(`SHEPHERD_CARE_TRACKER_PLAN.md`) remains live in `docs/plans/`;
`LAUNCH_PLANNING_PLAN.md` is now archived here.

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

Two 2026-05-19 review snapshots once competed here. To leave a single source
of truth, **`CLAUDE_APP_COMPLETION_ROADMAP.md` is the authoritative one**; the
earlier `APP_COMPLETION_ROADMAP.md` is the duplicate, superseded by it. Both
are themselves off the North-Star path (current truth is the PRD/ADR pair
above) and are kept for implementation history only.

- `CLAUDE_APP_COMPLETION_ROADMAP.md` — ✅ authoritative archived completion
  roadmap; the extended review snapshot from 2026-05-19.
- `APP_COMPLETION_ROADMAP.md` — 🗑️ superseded duplicate; the earlier
  independent review snapshot from 2026-05-19, replaced by the file above.

### Old roadmap doc (superseded)

- `ROADMAP.md` — high-level phase progression summary; replaced by
  `../PRODUCT_ROADMAP.md`.

### One-shot design handoffs (shipped)

- `CLAUDE_DESIGN_EXTRACTION.md` — handoff notes from the Claude Design
  HTML prototype bundle; the visual system has shipped.
- `LAUNCH_POLISH_QA.md` — Phase 5A.0.1 launch polish QA; closed.

### Pre-pivot planning PRDs (superseded by the pivot)

Audit/planning docs that fed the IA-reduction work and the Care/Plan/Multiply
pivot. The decisions they argued toward now live in the pivot ADRs
([`../adr/0016`](../adr/0016-pivot-to-care-plan-multiply.md)–[`0020`](../adr/0020-leader-care-note-is-group-scoped.md))
and PRD #371; these are kept for the reasoning that got there.

- `REDUCTIONPLAN.md` — UI/UX reduction plan proposing a six-item nav
  (Home/Groups/Care/People/Planning/Settings); the foundation of ADR 0013,
  reshaped by the pivot's Home/Care/Plan/Multiply/Settings nav (ADR 0016).
- `IA_CONSOLIDATION_PRD.md` — information-architecture consolidation PRD;
  shipped as the six-area spine (ADR 0013), then reshaped by ADR 0016.
- `SURFACE_SIMPLIFICATION_PRD.md` — surface-simplification audit at commit
  `c335a8a`, predating the pivot.
- `ADMIN_UX_IMPROVEMENT_PRD.md` — admin scan-speed / IA / a11y PRD built on
  ADR 0013 and the two PRDs above; superseded in framing by ADR 0016.
- `MULTIPLICATION_PLANNER.md` — the narrower "replace the Google Doc"
  planner spec (ADR 0006); superseded by
  [`../plans/CAPACITY_AND_MULTIPLICATION_PRD.md`](../plans/CAPACITY_AND_MULTIPLICATION_PRD.md).
