// Leader server-action results: the shared envelope (lib/shared/action-result)
// plus the leader-specific RPC error table. Same envelope as the admin surface
// so form components render either path through one render branch; only the
// leader_* token copy and the fallback message live here.

import {
  makeRpcErrorMapper,
  type RpcErrorMessages,
} from "@/lib/shared/action-result";

export type { ActionResult } from "@/lib/shared/action-result";
export { actionOk, actionFail } from "@/lib/shared/action-result";

// Fixed error tokens raised by the Phase 5B.0 leader_* RPC functions.
// Mapped to user-facing messages by `mapRpcError`. Keep the language
// pastoral and forgiving -- elderly leaders are part of the audience.
export const RPC_ERROR_MESSAGES: RpcErrorMessages = {
  insufficient_privilege:
    "You're not signed in, or your session expired. Sign in again and retry.",
  invalid_input:
    "Something in this check-in didn't look right. Refresh and try again.",
  missing_group: "We couldn't find that group. Refresh the page and try again.",
  group_closed: "That group is closed, so check-ins are turned off for it.",
  not_leader_of_group:
    "Only the assigned shepherd or co-shepherd can submit this group's check-in.",
  invalid_member:
    "One of the people on the attendance list isn't in this group anymore. Refresh and try again.",
  // Phase 5C.0 leader follow-up tokens.
  missing_follow_up:
    "We couldn't find that follow-up. Refresh the page and try again.",
  invalid_status:
    "Shepherds can mark a follow-up in progress or done — nothing else.",
  invalid_status_transition:
    "That follow-up has already been closed or moved past this step. Refresh to see the latest.",
  forbidden_target:
    "That follow-up isn't yours to update. Only the assigned person or a group shepherd can move it.",
  // Phase 5A.6 group calendar tokens.
  missing_event: "We couldn't find that calendar event. Refresh and try again.",
  event_already_archived:
    "That calendar event is already archived. Restore it before editing.",
  event_not_archived:
    "That calendar event isn't archived — there's nothing to restore.",
  date_conflict:
    "There's already an active event on that date for your group. Edit or archive the existing one first.",
};

export const mapRpcError = makeRpcErrorMapper(
  RPC_ERROR_MESSAGES,
  "We couldn't save the check-in just now. Try again in a moment."
);
