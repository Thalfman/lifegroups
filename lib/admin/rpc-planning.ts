// Planning & Multiply domain slice of the admin RPC gateway: metric defaults /
// per-group metric settings, church-attendance snapshots, multiplication
// candidate + group-capacity-target writes, launch-planning assumptions +
// scenarios, group-health assessments / ratings, the A–F health rubrics,
// readiness rule, and the leader/group rubric grades. The named arg shapes here
// predate the args map and are imported by action / validation modules, so they
// stay exported unchanged; the args-map slice references them by name.

import type {
  MultiplicationCandidateStatus,
  MultiplicationMeetingTime,
} from "@/types/enums";

export type AdminCreateLaunchPlanningScenarioArgs = {
  p_name: string;
  p_description: string | null;
  p_assumptions: Record<string, unknown>;
  p_make_current: boolean;
};

export type AdminUpdateLaunchPlanningScenarioArgs = {
  p_scenario_id: string;
  p_name: string;
  p_description: string | null;
  p_assumptions: Record<string, unknown>;
  p_make_current: boolean;
};

export type AdminUpsertGroupHealthAssessmentArgs = {
  p_group_id: string;
  p_period_month: string;
  p_attendance_pct: number | null;
  p_attendance_weeks_counted: number;
  p_computed_numeric: number | null;
  p_computed_letter: string | null;
};

export type AdminSetGroupHealthRatingsArgs = {
  p_group_id: string;
  p_period_month: string;
  p_spiritual_growth_score: number | null;
  p_spiritual_growth_note: string | null;
  p_group_question_score: number | null;
  // Admin IM 05 (#265): the open follow-up flag, set/cleared from the same
  // editor drawer save.
  p_needs_follow_up: boolean;
  p_attendance_pct: number | null;
  p_attendance_weeks_counted: number;
  p_computed_numeric: number | null;
  p_computed_letter: string | null;
};

export type AdminSetLeaderRubricGradeArgs = {
  p_profile_id: string;
  p_ministry_year: number;
  p_criterion_scores: Record<string, number>;
  p_computed_letter: string | null;
  p_override_letter: string | null;
  p_override_scope: "this_month" | "until_cleared" | null;
  p_override_period_month: string | null;
};

export type AdminSetGroupRubricGradeArgs = {
  p_group_id: string;
  p_ministry_year: number;
  p_criterion_scores: Record<string, number>;
  p_computed_letter: string | null;
  p_override_letter: string | null;
  p_override_scope: string | null;
  p_override_period_month: string | null;
};

// The uuid-channel args-map slice for the planning / multiply domain. Keys are
// the LITERAL Postgres function names; every RPC here returns a uuid on success.
export type PlanningUuidRpcArgs = {
  // Phase 5A.4 admin settings RPCs.
  admin_update_metric_defaults: { p_settings: Record<string, unknown> };
  admin_upsert_group_metric_settings: {
    p_group_id: string;
    p_capacity_override: number | null;
    p_capacity_warning_threshold_pct_override: number | null;
    p_healthy_attendance_pct_override: number | null;
    p_manual_health_status_override: string | null;
    p_exclude_from_capacity_metrics: boolean;
    p_admin_metric_notes: string | null;
    p_check_in_due_offset_hours_override: number | null;
    p_allow_over_capacity: boolean;
  };
  // Phase 5A.5 reset-to-defaults helper. Takes no arguments; the RPC
  // snapshots the current values, restores the baseline, and writes the
  // audit row in one transaction.
  admin_reset_metric_defaults: Record<string, never>;
  // Julian P2: record/upsert a church attendance snapshot by date.
  admin_record_church_attendance_snapshot: {
    p_snapshot_date: string;
    p_attendance_count: number;
    p_note: string | null;
  };
  // Julian P4: multiplication candidate writes.
  admin_create_multiplication_candidate: {
    // A candidate always anchors to a concrete group; its type is the group's
    // group_type (type-only watches were retired with the cell model).
    p_group_id: string;
    p_target_year: number | null;
    p_status: MultiplicationCandidateStatus;
    p_shepherd_willing: boolean;
    p_needs_similar_stage: boolean;
    p_notes: string | null;
    p_successor_designate: string | null;
    p_meeting_time: MultiplicationMeetingTime | null;
    p_leader_pipeline_id: string | null;
    // ADR 0022: Julian-fed headcount. Null falls back to the in-app roster count.
    p_manual_member_count: number | null;
    // ADR 0029: the three manually-ticked readiness flags.
    p_enough_members: boolean;
    p_established_long_enough: boolean;
    p_co_shepherd_tenured: boolean;
  };
  admin_update_multiplication_candidate: {
    p_candidate_id: string;
    p_target_year: number | null;
    p_status: MultiplicationCandidateStatus;
    p_shepherd_willing: boolean;
    p_needs_similar_stage: boolean;
    p_notes: string | null;
    p_successor_designate: string | null;
    p_meeting_time: MultiplicationMeetingTime | null;
    p_leader_pipeline_id: string | null;
    // ADR 0022: Julian-fed headcount. Null falls back to the in-app roster count.
    p_manual_member_count: number | null;
    // The multiplying group this candidate anchors to.
    p_group_id: string;
    // ADR 0029: the three manually-ticked readiness flags.
    p_enough_members: boolean;
    p_established_long_enough: boolean;
    p_co_shepherd_tenured: boolean;
  };
  admin_archive_multiplication_candidate: { p_candidate_id: string };
  // Capacity & Multiplication #185: set a group's target size (effective
  // source).
  admin_set_group_capacity_target: {
    p_group_id: string;
    p_target: number | null;
  };
  // LP.1 launch planning RPC.
  admin_update_launch_planning_assumptions: {
    p_settings: Record<string, unknown>;
  };
  // LP.2 launch planning scenario RPCs.
  admin_create_launch_planning_scenario: AdminCreateLaunchPlanningScenarioArgs;
  admin_update_launch_planning_scenario: AdminUpdateLaunchPlanningScenarioArgs;
  admin_archive_launch_planning_scenario: { p_scenario_id: string };
  admin_set_current_launch_planning_scenario: { p_scenario_id: string };
  // #127 group-health tracer: persist a group's monthly attendance dimension +
  // computed A-D grade. The rolling-window math is done in TS first
  // (lib/admin/group-health.ts); this just writes the already-computed values.
  admin_upsert_group_health_assessment: AdminUpsertGroupHealthAssessmentArgs;
  // #128 group-health rated dimensions: persist the admin-entered
  // spiritual-growth and relayed group-question 1–5 ratings (+ recomputed
  // grade) for a group's month. The composite math is done in TS first; the
  // RPC forces the group-question leader-reported provenance flag from the
  // score's presence.
  admin_set_group_health_ratings: AdminSetGroupHealthRatingsArgs;
  // #374 / ADR 0018 Health Rubric: upsert the current rubric for a kind
  // (group/leader). p_criteria is the validated {key,label,weight} array; the
  // weight-to-100 check is done in TS first, the RPC re-guards the JSON shape.
  admin_set_health_rubric: {
    p_kind: "group" | "leader";
    p_criteria: Array<Record<string, unknown>>;
  };
  // The single GLOBAL readiness rule for a ministry year (interest/capacity/
  // group+leader health in natural units). The rule jsonb is validated in TS
  // first; the RPC re-guards its object shape.
  admin_set_readiness_rule: {
    p_ministry_year: number;
    p_rule: Record<string, unknown>;
  };
  // #378 / ADR 0018 (pivot slice 5) Leader-Health Grade: upsert a leader's
  // grade for a ministry year. The roll-up + override resolution are done in
  // TS first (lib/admin/leader-rubric-grade.ts); this persists the
  // already-computed letter (+ raw per-criterion scores and any override)
  // through the audited RPC. The override letter + scope travel together
  // (both null, or both set).
  admin_set_leader_rubric_grade: AdminSetLeaderRubricGradeArgs;
  // #377 / ADR 0018 Group-Health Grade by rubric: upsert a group's rubric
  // grade for a ministry year (per-criterion 0–100 scores + the computed A–F
  // letter + an optional letter override under this-month / until-cleared
  // scope). The letter is recomputed in TS first via the pure facade
  // (lib/admin/group-rubric-grade.ts); the RPC re-validates score range +
  // letters.
  admin_set_group_rubric_grade: AdminSetGroupRubricGradeArgs;
};
