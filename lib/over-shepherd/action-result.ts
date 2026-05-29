// Result shape + RPC error mapping for Over-Shepherd server actions. Same
// envelope as lib/leader/action-result.ts and lib/admin/action-result.ts so
// the form components render either path through one branch.

export type ActionResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: string[] };

export function actionOk<T>(value: T): ActionResult<T> {
  return { ok: true, value };
}

export function actionFail(errors: string[]): ActionResult<never> {
  return { ok: false, errors };
}

// Fixed error tokens raised by the over_shepherd_* RPC functions, mapped to
// user-facing messages. `not_covered` is the load-bearing one: the RPC denies
// logging against a Shepherd the caller doesn't actively cover, regardless of
// UI state.
export const RPC_ERROR_MESSAGES: Record<string, string> = {
  insufficient_privilege:
    "You're not signed in as an Over-Shepherd, or your session expired. Sign in again and retry.",
  not_covered:
    "That Shepherd isn't in your care. You can only log interactions for the Shepherds you cover.",
  invalid_input:
    "Something in this interaction didn't look right. Refresh and try again.",
  missing_profile:
    "We couldn't find that Shepherd, or they're no longer active. Refresh and try again.",
};

export function mapRpcError(raw: string | undefined | null): string {
  const fallback = "We couldn't save the interaction just now. Try again in a moment.";
  if (!raw) return fallback;
  if (RPC_ERROR_MESSAGES[raw]) return RPC_ERROR_MESSAGES[raw];
  for (const token of Object.keys(RPC_ERROR_MESSAGES)) {
    if (raw.includes(token)) return RPC_ERROR_MESSAGES[token];
  }
  return fallback;
}
