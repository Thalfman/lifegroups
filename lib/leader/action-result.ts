// Phase 5B.0 result shape for leader server actions. Same envelope as
// `lib/admin/action-result.ts` so the form components can render either
// path through one render branch.

export type ActionResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: string[] };

export function actionOk<T>(value: T): ActionResult<T> {
  return { ok: true, value };
}

export function actionFail(errors: string[]): ActionResult<never> {
  return { ok: false, errors };
}

// Fixed error tokens raised by the Phase 5B.0 leader_* RPC functions.
// Mapped to user-facing messages by `mapRpcError`. Keep the language
// pastoral and forgiving -- elderly leaders are part of the audience.
export const RPC_ERROR_MESSAGES: Record<string, string> = {
  insufficient_privilege:
    "You're not signed in, or your session expired. Sign in again and retry.",
  invalid_input:
    "Something in this check-in didn't look right. Refresh and try again.",
  missing_group: "We couldn't find that group. Refresh the page and try again.",
  group_closed:
    "That group is closed, so check-ins are turned off for it.",
  not_leader_of_group:
    "Only the assigned leader or co-leader can submit this group's check-in.",
  invalid_member:
    "One of the people on the attendance list isn't in this group anymore. Refresh and try again.",
  // Phase 5C.0 leader follow-up tokens.
  missing_follow_up:
    "We couldn't find that follow-up. Refresh the page and try again.",
  invalid_status:
    "Leaders can mark a follow-up in progress or done — nothing else.",
  invalid_status_transition:
    "That follow-up has already been closed or moved past this step. Refresh to see the latest.",
  forbidden_target:
    "That follow-up isn't yours to update. Only the assigned person or a group leader can move it.",
  // Phase 5A.6 group calendar tokens.
  missing_event:
    "We couldn't find that calendar event. Refresh and try again.",
  event_already_archived:
    "That calendar event is already archived. Restore it before editing.",
  event_not_archived:
    "That calendar event isn't archived — there's nothing to restore.",
  date_conflict:
    "There's already an active event on that date for your group. Edit or archive the existing one first.",
};

export function mapRpcError(raw: string | undefined | null): string {
  if (!raw)
    return "We couldn't save the check-in just now. Try again in a moment.";
  if (RPC_ERROR_MESSAGES[raw]) return RPC_ERROR_MESSAGES[raw];
  for (const token of Object.keys(RPC_ERROR_MESSAGES)) {
    if (raw.includes(token)) return RPC_ERROR_MESSAGES[token];
  }
  return "We couldn't save the check-in just now. Try again in a moment.";
}
