// Admin server-action results: the shared envelope (lib/shared/action-result)
// plus the admin-specific RPC error table. The result shape and the matcher
// live in the shared module; this file supplies only the admin_* token copy.

import {
  makeRpcErrorMapper,
  type RpcErrorMessages,
} from "@/lib/shared/action-result";

export type { ActionResult } from "@/lib/shared/action-result";
export { actionOk, actionFail } from "@/lib/shared/action-result";

// Fixed error tokens raised by the Phase 5A.1 admin_* RPC functions.
// Mapped to user-facing messages by `mapRpcError`.
export const RPC_ERROR_MESSAGES: RpcErrorMessages = {
  insufficient_privilege:
    "You're not signed in as an admin, or your session expired. Sign in again and retry.",
  duplicate_email:
    "A profile with that email already exists. Check the leader list before adding a new one.",
  duplicate_assignment:
    "That assignment already exists. They're already part of the group.",
  missing_group: "We couldn't find that group. Refresh the page and try again.",
  missing_profile:
    "We couldn't find that profile. Refresh the page and try again.",
  missing_member:
    "We couldn't find that member. Refresh the page and try again.",
  forbidden_target:
    "That target isn't allowed through this screen. super_admin must be set via the documented bootstrap procedure, and ministry admins can't deactivate the super admin.",
  self_target_not_allowed:
    "You can't deactivate, reassign, or change your own role through this screen.",
  invalid_role:
    "That role isn't allowed here. Leaders and co-leaders are managed through the leader assignment workflow.",
  inactive_target:
    "That person isn't currently active. Reactivation isn't part of this phase yet.",
  invalid_input: "Some required fields are missing or malformed.",
  group_already_closed:
    "That group is already closed. Reopen it if you need to make changes.",
  group_not_closed: "That group is already active — there's nothing to reopen.",
  no_role_change: "That profile already has that role. Nothing to change.",
  missing_settings:
    "The settings record is missing. Refresh the page and try again.",
  // Phase 5C.0 tokens.
  missing_guest: "We couldn't find that guest. Refresh the page and try again.",
  missing_follow_up:
    "We couldn't find that follow-up. Refresh the page and try again.",
  missing_care_profile:
    "We couldn't find that care profile. Log an interaction or set the care profile first, then try again.",
  group_closed:
    "That group is closed. Reopen it before assigning new guests or placements.",
  invalid_status:
    "That status isn't allowed here. Leaders can mark follow-ups in progress or done.",
  invalid_status_transition:
    "That follow-up has already been closed or moved past this step. Refresh to see the latest state.",
  // Phase 5A.6 group calendar tokens.
  missing_event: "We couldn't find that calendar event. Refresh and try again.",
  event_already_archived:
    "That calendar event is already archived. Restore it before editing.",
  event_not_archived:
    "That calendar event isn't archived — there's nothing to restore.",
  date_conflict:
    "There's already an active event on that date for this group. Edit or archive the existing one first.",
  // Phase 5D.1 over-shepherd coverage tokens.
  missing_over_shepherd:
    "We couldn't find that over-shepherd. Refresh the page and try again.",
  inactive_over_shepherd:
    "That over-shepherd is inactive. Reactivate them before assigning coverage.",
  missing_assignment:
    "That assignment isn't active. Refresh the page and try again.",
  // Phase LDR.1 (#126) over-shepherd broad-note token: the caller tried to
  // write a note on a Leader outside their active coverage.
  not_covered:
    "That Leader isn't in your coverage. Refresh your list and try again.",
  invalid_assigned_at_before_prior:
    "That assigned date is earlier than the previous assignment's start. Pick a date on or after the prior assignment began.",
  invalid_ended_at_before_start:
    "The end date can't be earlier than the assignment's start date.",
  // Capacity & Multiplication (#183/#184) leader-pipeline tokens.
  missing_apprentice:
    "We couldn't find that apprentice. Refresh the page and try again.",
  apprentice_group_mismatch:
    "That apprentice belongs to a different group. An apprentice can only lead the next group out of its own group.",
  // LP.2 launch planning scenario tokens.
  missing_scenario:
    "We couldn't find that scenario. Refresh the page and try again.",
  scenario_archived:
    "That scenario is archived. Restore or duplicate it before editing.",
  // Phase SC.4 private care note tokens.
  missing_recovery_slot:
    "Enrollment needs a recovery code as a backup unlock method. Generate one and try again.",
  already_enrolled:
    "Private notes are already set up for your account. Refresh the page to manage your unlock methods.",
  not_enrolled:
    "Set up private notes (and save your recovery code) before writing one. Refresh the page and try again.",
  // Phase SC.4 (#113) key-lifecycle tokens.
  missing_slot:
    "We couldn't find that unlock method. Refresh the page and try again.",
  cannot_remove_last_slot:
    "You can't remove your last unlock method. Add another passkey first, or rotate your recovery code.",
  // PRD-SAC6 (#288) Clean Slate token: the wipe found no history to clear.
  nothing_to_wipe:
    "There's no accumulated history to clear right now — everything is already a clean slate.",
  // PRD-SAC6 (#293/#294) Clean Slate revert + import tokens.
  missing_snapshot:
    "There's no recoverable snapshot to restore. Import a previously exported snapshot file instead.",
  target_not_empty:
    "There's already history in the database. Clear it first (Clean Slate) before restoring a snapshot, so the restore can't collide with existing rows.",
  // PRD-SAC6 follow-up: per-category history reset token — the category key sent
  // to the reset RPC wasn't one of the known history categories.
  invalid_category:
    "That isn't a resettable history category. Refresh the page and try again.",
  unsupported_snapshot_version:
    "That snapshot file is from an unsupported version. Export a fresh snapshot from this app and try again.",
  malformed_snapshot:
    "That snapshot file is missing or has the wrong shape. Use a file exported by this app's Clean Slate Export.",
  // ADR 0014 (#312–#316) permanent-deletion tokens.
  missing_entity:
    "We couldn't find that record. It may already have been deleted — refresh the page and try again.",
  has_blocking_dependents:
    "That record still has dependent data that would be erased. Archive or clear the blockers listed above first, then delete it.",
  has_confidential_records:
    "This person has confidential records and cannot be permanently deleted; disable instead.",
  missing_tombstone:
    "We couldn't find that tombstone. Refresh the page and try again.",
  already_restored:
    "That record has already been restored from this tombstone.",
  id_already_exists:
    "A record with that id already exists again, so the restore can't run without overwriting it. Remove the conflicting record first.",
  missing_parent:
    "The restore can't run because a record it depends on no longer exists. Restore that parent record first.",
  // Phase IL.1 shareable invite-link tokens.
  group_not_allowed:
    "Only leaders and co-leaders can be tied to a group. Clear the group or pick a leader role.",
  invalid_expiry:
    "That expiry isn't allowed. Pick a time in the future, at most 90 days out.",
};

export const mapRpcError = makeRpcErrorMapper(
  RPC_ERROR_MESSAGES,
  "Something went wrong saving that change. Try again in a moment."
);
