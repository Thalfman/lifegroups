// Cross-surface RPC error tokens (ARCH-4, audit 2026-06-21). Tokens that several
// server-action surfaces (admin, leader, over-shepherd) raise with the SAME
// user-facing copy live here once, so a token added for one surface can't
// silently degrade to the generic fallback on another. Each surface spreads this
// map into its own `RPC_ERROR_MESSAGES` and then adds/overrides surface-specific
// tokens (where the copy legitimately differs, e.g. `insufficient_privilege`
// naming the admin role vs. the generic leader session message).

import type { RpcErrorMessages } from "@/lib/shared/action-result";

export const COMMON_RPC_ERROR_MESSAGES: RpcErrorMessages = {
  missing_group: "We couldn't find that group. Refresh the page and try again.",
  missing_follow_up:
    "We couldn't find that follow-up. Refresh the page and try again.",
  // Group calendar tokens — identical across the admin and leader calendars.
  missing_event: "We couldn't find that calendar event. Refresh and try again.",
  event_already_archived:
    "That calendar event is already archived. Restore it before editing.",
  event_not_archived:
    "That calendar event isn't archived — there's nothing to restore.",
};
