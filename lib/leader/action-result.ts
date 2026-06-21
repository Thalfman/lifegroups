// Leader server-action results: the shared envelope (lib/shared/action-result)
// plus the leader-specific RPC error table. Same envelope as the admin surface
// so form components render either path through one render branch; only the
// leader_* token copy and the fallback message live here.

import {
  makeRpcErrorMapper,
  type RpcErrorMessages,
} from "@/lib/shared/action-result";
import { COMMON_RPC_ERROR_MESSAGES } from "@/lib/shared/rpc-errors";

export type { ActionResult } from "@/lib/shared/action-result";
export { actionOk, actionFail } from "@/lib/shared/action-result";

// Fixed error tokens raised by the Phase 5B.0 leader_* RPC functions.
// Mapped to user-facing messages by `mapRpcError`. Keep the language
// pastoral and forgiving -- elderly leaders are part of the audience.
// Cross-surface tokens with identical copy (missing_group, missing_follow_up,
// the calendar tokens) come from COMMON_RPC_ERROR_MESSAGES; everything below is
// leader-specific copy.
export const RPC_ERROR_MESSAGES: RpcErrorMessages = {
  ...COMMON_RPC_ERROR_MESSAGES,
  insufficient_privilege:
    "You're not signed in, or your session expired. Sign in again and retry.",
  invalid_input:
    "Something in this check-in didn't look right. Refresh and try again.",
  group_closed: "That group is closed, so check-ins are turned off for it.",
  not_leader_of_group:
    "Only the assigned shepherd or co-shepherd can submit this group's check-in.",
  invalid_member:
    "One of the people on the attendance list isn't in this group anymore. Refresh and try again.",
  // Phase 5C.0 leader follow-up tokens (missing_follow_up is shared).
  invalid_status:
    "Shepherds can mark a follow-up in progress or done — nothing else.",
  invalid_status_transition:
    "That follow-up has already been closed or moved past this step. Refresh to see the latest.",
  forbidden_target:
    "That follow-up isn't yours to update. Only the assigned person or a group shepherd can move it.",
  // Phase 5A.6 group calendar tokens (missing_event / event_already_archived /
  // event_not_archived are shared via COMMON_RPC_ERROR_MESSAGES).
  date_conflict:
    "There's already an active event on that date for your group. Edit or archive the existing one first.",
};

export const mapRpcError = makeRpcErrorMapper(
  RPC_ERROR_MESSAGES,
  "We couldn't save the check-in just now. Try again in a moment."
);
