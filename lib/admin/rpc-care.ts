// Care domain slice of the admin RPC gateway: the shepherd-care tracker
// (profiles, interactions, follow-ups), the SC.4 encrypted private care notes +
// key-slot lifecycle, the over-shepherd coverage tracking, and the author-
// private Care Notes / Prayer Requests + per-subject transparency toggle. The
// named arg shapes here predate the args map and are imported by action /
// validation modules, so they stay exported unchanged; the args-map slice
// references them by name.

import type {
  ShepherdCareFollowUpStatus,
  ShepherdCareInteractionType,
  ShepherdCareStatus,
} from "@/types/enums";

export type AdminUpsertShepherdCareProfileArgs = {
  p_shepherd_profile_id: string;
  p_current_status: ShepherdCareStatus;
  p_set_current_status: boolean;
  p_next_touchpoint_due: string | null;
  p_set_next_touchpoint_due: boolean;
  p_admin_summary: string | null;
  p_set_admin_summary: boolean;
};

export type AdminLogShepherdCareInteractionArgs = {
  p_shepherd_profile_id: string;
  p_interaction_at: string;
  p_interaction_type: ShepherdCareInteractionType;
  p_notes: string | null;
  p_set_next_touchpoint_due: boolean;
  p_next_touchpoint_due: string | null;
  p_set_current_status: boolean;
  p_current_status: ShepherdCareStatus;
};

export type AdminCreateShepherdCareFollowUpArgs = {
  p_care_profile_id: string;
  p_title: string;
  p_due_date: string | null;
  p_notes: string | null;
};

export type AdminUpdateShepherdCareFollowUpStatusArgs = {
  p_follow_up_id: string;
  p_new_status: ShepherdCareFollowUpStatus;
};

export type AdminUpdateShepherdCareFollowUpArgs = {
  p_follow_up_id: string;
  p_title: string;
  p_set_due_date: boolean;
  p_due_date: string | null;
  p_set_notes: boolean;
  p_notes: string | null;
};

export type AdminEnrollPrivateNoteKeysArgs = {
  p_dek_version: number;
  p_slots: Array<Record<string, unknown>>;
};

export type AdminUpsertShepherdCarePrivateNoteArgs = {
  p_care_profile_id: string;
  p_ciphertext: string | null;
  p_iv: string | null;
  p_dek_version: number;
  p_set_body: boolean;
};

export type AdminAddPrivateNoteKeySlotArgs = {
  p_slot_type: string;
  p_credential_id: string | null;
  p_label: string | null;
  p_prf_salt: string | null;
  p_hkdf_salt: string;
  p_wrapped_dek: string;
  p_wrap_iv: string;
};

export type AdminRotatePrivateNoteRecoveryArgs = {
  p_hkdf_salt: string;
  p_wrapped_dek: string;
  p_wrap_iv: string;
  p_label: string | null;
};

export type AdminCreateOverShepherdArgs = {
  p_full_name: string;
  p_email: string | null;
  p_phone: string | null;
  p_notes: string | null;
};

export type AdminUpdateOverShepherdArgs = {
  p_over_shepherd_id: string;
  p_full_name: string;
  p_email: string | null;
  p_phone: string | null;
  p_notes: string | null;
  p_active: boolean;
};

export type AdminAssignShepherdToOverShepherdArgs = {
  p_shepherd_profile_id: string;
  p_over_shepherd_id: string;
  p_assigned_at: string | null;
};

export type AdminEndShepherdCoverageAssignmentArgs = {
  p_assignment_id: string;
  p_ended_at: string | null;
};

export type AdminWriteCareNoteArgs = {
  p_subject_profile_id: string;
  p_body: string;
};

export type AdminWritePrayerRequestArgs = {
  p_subject_profile_id: string;
  p_body: string;
};

export type SetNoteTransparencyGrantArgs = {
  p_subject_profile_id: string;
  p_granted: boolean;
};

// The uuid-channel args-map slice for the care domain. Keys are the LITERAL
// Postgres function names; every RPC here returns a uuid on success.
export type CareUuidRpcArgs = {
  // Phase 5D.0 shepherd care tracker admin RPCs.
  admin_upsert_shepherd_care_profile: AdminUpsertShepherdCareProfileArgs;
  admin_log_shepherd_care_interaction: AdminLogShepherdCareInteractionArgs;
  // Phase SC.1B shepherd care follow-up (task list) admin RPCs.
  admin_create_shepherd_care_follow_up: AdminCreateShepherdCareFollowUpArgs;
  admin_update_shepherd_care_follow_up_status: AdminUpdateShepherdCareFollowUpStatusArgs;
  admin_update_shepherd_care_follow_up: AdminUpdateShepherdCareFollowUpArgs;
  // Admin UX: soft-archive a care follow-up (sets archived_at) so it leaves
  // every queue. Status/completed_at are untouched; the RPC writes a paired
  // audit row.
  admin_archive_shepherd_care_follow_up: { p_follow_up_id: string };
  // Phase SC.4 private care notes admin RPCs. The bytea columns travel as
  // base64 strings (the RPC decodes them); the server only ever holds
  // ciphertext. admin_enroll_private_note_keys returns the mandatory recovery
  // slot's id (see the migration header deviation).
  admin_enroll_private_note_keys: AdminEnrollPrivateNoteKeysArgs;
  admin_upsert_shepherd_care_private_note: AdminUpsertShepherdCarePrivateNoteArgs;
  // Phase SC.4 (#113) key-slot lifecycle RPCs. bytea columns travel as base64.
  admin_add_private_note_key_slot: AdminAddPrivateNoteKeySlotArgs;
  admin_rotate_private_note_recovery: AdminRotatePrivateNoteRecoveryArgs;
  admin_remove_private_note_key_slot: { p_slot_id: string };
  // Phase 5D.1 over-shepherd coverage tracking admin RPCs.
  admin_create_over_shepherd: AdminCreateOverShepherdArgs;
  admin_update_over_shepherd: AdminUpdateOverShepherdArgs;
  // Admin UX: a focused active toggle so a list/detail "Archive"/"Restore"
  // button can soft-archive or restore an over-shepherd without re-sending the
  // whole record. Maintains archived_at; writes a paired audit row.
  admin_set_over_shepherd_active: {
    p_over_shepherd_id: string;
    p_active: boolean;
  };
  admin_assign_shepherd_to_over_shepherd: AdminAssignShepherdToOverShepherdArgs;
  admin_end_shepherd_coverage_assignment: AdminEndShepherdCoverageAssignmentArgs;
  // Pivot slice 9 (#381 / ADR 0017): author-private Care Notes + Prayer
  // Requests + the per-subject transparency toggle. The note/prayer body
  // travels as plaintext text; the RPC derives the author server-side and
  // gates authorship on the over-shepherd coverage predicate. The transparency
  // toggle is Ministry-Admin controlled. DISTINCT from the SC.4 encrypted
  // private care note.
  admin_write_care_note: AdminWriteCareNoteArgs;
  admin_write_prayer_request: AdminWritePrayerRequestArgs;
  set_note_transparency_grant: SetNoteTransparencyGrantArgs;
};
