// Shared result shape returned by Phase 5A.1 server actions. Matches
// `lib/admin/validation.ts`'s ValidationResult on purpose so callers can
// thread validation failures and action failures through the same UI
// rendering path.

export type ActionResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: string[] };

export function actionOk<T>(value: T): ActionResult<T> {
  return { ok: true, value };
}

export function actionFail(errors: string[]): ActionResult<never> {
  return { ok: false, errors };
}

// Fixed error tokens raised by the Phase 5A.1 admin_* RPC functions.
// Mapped to user-facing messages by `mapRpcError`.
export const RPC_ERROR_MESSAGES: Record<string, string> = {
  insufficient_privilege:
    "You're not signed in as an admin, or your session expired. Sign in again and retry.",
  duplicate_email:
    "A profile with that email already exists. Check the leader list before adding a new one.",
  duplicate_assignment:
    "That assignment already exists. They're already part of the group.",
  missing_group: "We couldn't find that group. Refresh the page and try again.",
  missing_profile: "We couldn't find that profile. Refresh the page and try again.",
  missing_member: "We couldn't find that member. Refresh the page and try again.",
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
  group_not_closed:
    "That group is already active — there's nothing to reopen.",
  no_role_change:
    "That profile already has that role. Nothing to change.",
  missing_settings:
    "The settings record is missing. Refresh the page and try again.",
};

export function mapRpcError(raw: string | undefined | null): string {
  if (!raw) return "Something went wrong saving that change. Try again in a moment.";
  // Postgres prefixes a token-form message with nothing extra; supabase-js
  // surfaces the message via PostgrestError.message. Match exactly first,
  // then fall back to substring.
  if (RPC_ERROR_MESSAGES[raw]) return RPC_ERROR_MESSAGES[raw];
  for (const token of Object.keys(RPC_ERROR_MESSAGES)) {
    if (raw.includes(token)) return RPC_ERROR_MESSAGES[token];
  }
  return "Something went wrong saving that change. Try again in a moment.";
}
