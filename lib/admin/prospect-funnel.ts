// Interest Funnel state machine (ADR 0016, #375). Pure, I/O-free, unit-tested.
// A Prospect moves through the funnel: interested → matched → joined, with
// not_at_this_time as a side park. The same legal-transition + invariant rules
// are enforced in two places — here for the UI/validation layer, and again in
// SQL inside admin_transition_prospect (the authoritative gate). The pure core
// lets the UI reason about what's allowed before a round-trip, and gives the
// invariants a fast unit-tested home; the RPC is the real guard.
//
// Invariants:
//   * interested → matched, interested → not_at_this_time
//   * matched → joined, matched → not_at_this_time, matched → interested (back)
//   * not_at_this_time → interested (revive)
//   * joined is terminal (archived; off the active board)
//   * matched / joined require a group_id
//   * joined sets the archived flag
//   * a no-op (from === to) is not a transition

import type { ProspectState } from "@/types/enums";
import type { GuestPipelineStage } from "@/types/enums";

// The error tokens the funnel rejects with. These mirror the fixed tokens the
// admin_transition_prospect RPC raises, so the UI maps the same set whether the
// rejection comes from the pure core or the database.
export type TransitionError =
  | "illegal_transition"
  | "group_required"
  | "missing_prospect";

// The legal next-states for each state (excluding the no-op self edge).
const LEGAL_TRANSITIONS: Record<ProspectState, readonly ProspectState[]> = {
  interested: ["matched", "not_at_this_time"],
  matched: ["joined", "interested", "not_at_this_time"],
  joined: [], // terminal — archived off the active board
  not_at_this_time: ["interested"],
};

// States that require a group to be set on the Prospect.
const GROUP_REQUIRED_STATES: ReadonlySet<ProspectState> =
  new Set<ProspectState>(["matched", "joined"]);

// States that archive the Prospect out of the active board.
const ARCHIVED_STATES: ReadonlySet<ProspectState> = new Set<ProspectState>([
  "joined",
]);

export type TransitionContext = {
  // The group the Prospect would be attached to after the transition. May be a
  // group already on the Prospect (carried forward) or a newly chosen one.
  groupId: string | null;
};

export type TransitionDecision =
  | { ok: true; archived: boolean }
  | { ok: false; error: TransitionError };

/** Does this state require a group_id to be present? */
export function stateRequiresGroup(state: ProspectState): boolean {
  return GROUP_REQUIRED_STATES.has(state);
}

/** Does landing in this state archive the Prospect off the active board? */
export function stateIsArchived(state: ProspectState): boolean {
  return ARCHIVED_STATES.has(state);
}

/** Is this state terminal (no legal onward transition)? */
export function stateIsTerminal(state: ProspectState): boolean {
  return LEGAL_TRANSITIONS[state].length === 0;
}

/**
 * Pure predicate: is `from → to` a legal edge, ignoring the group invariant? A
 * no-op (from === to) is never a transition. Use {@link validateTransition} to
 * also enforce the group-required invariant and learn the resulting archived
 * flag.
 */
export function canTransition(from: ProspectState, to: ProspectState): boolean {
  if (from === to) return false;
  return LEGAL_TRANSITIONS[from].includes(to);
}

/**
 * The full transition gate: legality, then the group-required invariant. On
 * success returns the archived flag the Prospect should carry in its new state
 * (true for joined, false otherwise). Mirrors the SQL in
 * admin_transition_prospect.
 */
export function validateTransition(
  from: ProspectState,
  to: ProspectState,
  ctx: TransitionContext
): TransitionDecision {
  if (!canTransition(from, to))
    return { ok: false, error: "illegal_transition" };
  if (stateRequiresGroup(to) && !ctx.groupId) {
    return { ok: false, error: "group_required" };
  }
  return { ok: true, archived: stateIsArchived(to) };
}

/**
 * Map a legacy guest_pipeline_stage to its Prospect state (acceptance #1).
 *   new / contacted / interested / attended → interested
 *   assigned                                → matched
 *   placed                                  → joined
 *   not_now                                 → not_at_this_time
 * This is the single source of truth for the mapping; the data-migration SQL
 * mirrors it, and the migration test asserts both stay aligned.
 */
export function mapGuestStageToProspectState(
  stage: GuestPipelineStage
): ProspectState {
  switch (stage) {
    case "new":
    case "contacted":
    case "interested":
    case "attended":
      return "interested";
    case "assigned":
      return "matched";
    case "placed":
      return "joined";
    case "not_now":
      return "not_at_this_time";
  }
}

// Display ordering + labels for the four board columns. `joined` is last because
// it is collapsed into the roll-up, not a live column.
export const PROSPECT_STATE_ORDER: readonly ProspectState[] = [
  "interested",
  "matched",
  "joined",
  "not_at_this_time",
];

export const PROSPECT_STATE_LABEL: Record<ProspectState, string> = {
  interested: "Interested",
  matched: "Matched",
  joined: "Joined",
  not_at_this_time: "Not at this time",
};
