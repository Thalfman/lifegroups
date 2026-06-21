// People domain slice of the admin RPC gateway: leader / member / profile
// creation + deactivation + role changes, the Leader Pipeline (apprentice)
// writes, the Interest Funnel (Prospect) writes, the (frozen) guest pipeline,
// and the general follow-up task writes. The named arg shapes here predate the
// args map and are imported by action / validation modules, so they stay
// exported unchanged; the args-map slice references them by name.

import type {
  FollowUpPriority,
  FollowUpStatus,
  FollowUpType,
  GuestPipelineStage,
  LeaderReadinessStage,
  ProspectState,
} from "@/types/enums";

export type AdminCreateGuestArgs = {
  p_full_name: string;
  p_email: string | null;
  p_phone: string | null;
  p_first_attended_group_id: string | null;
  p_first_attended_date: string | null;
  p_pipeline_stage: GuestPipelineStage;
  p_assigned_group_id: string | null;
  p_follow_up_owner_id: string | null;
  p_notes: string | null;
};

export type AdminUpdateGuestPipelineArgs = {
  p_guest_id: string;
  p_pipeline_stage: GuestPipelineStage;
  p_set_assigned_group_id: boolean;
  p_assigned_group_id: string | null;
  p_set_follow_up_owner_id: boolean;
  p_follow_up_owner_id: string | null;
  p_set_notes: boolean;
  p_notes: string | null;
};

export type AdminCreateFollowUpArgs = {
  p_type: FollowUpType;
  p_title: string;
  p_related_group_id: string | null;
  p_related_member_id: string | null;
  p_related_guest_id: string | null;
  p_assigned_to: string | null;
  p_priority: FollowUpPriority;
  p_due_date: string | null;
  p_leader_visible_note: string | null;
  p_admin_private_note: string | null;
};

export type AdminUpdateFollowUpStatusArgs = {
  p_follow_up_id: string;
  p_status: FollowUpStatus;
  p_set_leader_visible_note: boolean;
  p_leader_visible_note: string | null;
  p_set_admin_private_note: boolean;
  p_admin_private_note: string | null;
};

// The uuid-channel args-map slice for the people domain. Keys are the LITERAL
// Postgres function names; every RPC here returns a uuid on success.
export type PeopleUuidRpcArgs = {
  admin_create_leader_profile: {
    p_full_name: string;
    p_email: string;
    p_phone: string | null;
  };
  admin_create_member: {
    p_full_name: string;
    p_email: string | null;
    p_phone: string | null;
  };
  admin_deactivate_profile: { p_profile_id: string };
  admin_deactivate_member: { p_member_id: string };
  admin_change_leader_role: {
    p_profile_id: string;
    p_new_role: "leader" | "co_leader";
  };
  // Capacity & Multiplication #183: Leader Pipeline (apprentice) writes.
  admin_create_apprentice: {
    p_group_id: string;
    p_display_name: string;
    p_member_id: string | null;
    p_readiness_stage: LeaderReadinessStage;
    p_expected_ready_on: string | null;
    p_notes: string | null;
  };
  admin_update_apprentice: {
    p_apprentice_id: string;
    p_display_name: string;
    p_member_id: string | null;
    p_readiness_stage: LeaderReadinessStage;
    p_expected_ready_on: string | null;
    p_notes: string | null;
  };
  admin_advance_apprentice_stage: {
    p_apprentice_id: string;
    p_readiness_stage: LeaderReadinessStage;
  };
  admin_archive_apprentice: { p_apprentice_id: string };
  // Phase 5C.0 guest + follow-up admin RPCs.
  admin_create_guest: AdminCreateGuestArgs;
  admin_update_guest_pipeline: AdminUpdateGuestPipelineArgs;
  // #375 Interest Funnel: Prospect create + transition. The transition RPC is
  // the authoritative funnel gate (legal edges + group-required +
  // joined-archives), rejecting with the fixed tokens illegal_transition /
  // group_required / missing_prospect. A null p_group_id carries the current
  // group forward.
  admin_create_prospect: {
    p_full_name: string;
    p_email: string | null;
    p_phone: string | null;
    // #746: the optional free-text desired Group type (null = not set).
    p_desired_group_type: string | null;
  };
  admin_transition_prospect: {
    p_prospect_id: string;
    p_state: ProspectState;
    p_group_id: string | null;
  };
  // Admin UX: edit a Prospect's identity fields (no state change) and
  // soft-archive it for cleanup. Both gate on auth_is_admin() in the RPC body
  // and write a paired audit_events row; archive sets archived = true so the
  // board drops it.
  admin_update_prospect: {
    p_prospect_id: string;
    p_full_name: string;
    p_email: string | null;
    p_phone: string | null;
  };
  admin_archive_prospect: { p_prospect_id: string };
  // #379 pivot slice 7: set a Prospect's single current Next Step (type
  // connect_to_group_leader | follow_up + optional due date + detail) and a
  // separate Additional Note. The next_step jsonb shape is validated in the
  // action layer (validateSetProspectNextStepPayload) and re-validated
  // authoritatively in the RPC. No provider is wired — nothing is sent.
  admin_set_prospect_next_step: {
    p_prospect_id: string;
    p_next_step: Record<string, unknown> | null;
    p_additional_note: string | null;
  };
  admin_create_follow_up: AdminCreateFollowUpArgs;
  admin_update_follow_up_status: AdminUpdateFollowUpStatusArgs;
};
