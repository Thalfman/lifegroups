// Care next-action clarity (#332). Every care item must surface its ONE obvious
// next action — log contact, assign over-shepherd, schedule touchpoint, or
// resolve follow-up — instead of a vague "Open" / "Manage" or a label that
// ignores what the item actually needs next. This module is the single, pure
// decision point: given the small slice of an item's state, it returns the verb
// to show and which leader-detail tab the action lives on. It introduces NO new
// write paths — every action deep-links into an existing single-purpose form
// (coverage assignment, set-touchpoint, log-interaction) or the follow-up queue
// that already render on the per-leader detail page.

// The four canonical next actions a care item can surface. Ordered by the
// pastoral precedence the resolver applies: you cannot meaningfully shepherd a
// leader who has no over-shepherd, so coverage comes first; a scheduled
// touchpoint is what turns "needs contact" into a dated commitment; logging the
// contact is the steady-state cadence action; resolving an open follow-up is
// the close-out action for a task that already exists.
export type CareNextAction =
  | "assign-over-shepherd"
  | "schedule-touchpoint"
  | "log-contact"
  | "resolve-follow-up";

// The leader-detail tab each action lives on. Coverage assignment and the
// log/schedule forms render on Overview; the follow-up queue is its own tab.
// (The bare leader detail opens on Overview, so "overview" can be omitted from
// a href, but naming it keeps the deep-link explicit and testable.)
export type CareNextActionTab = "overview" | "follow-ups";

export type CareNextActionResult = {
  action: CareNextAction;
  // Imperative, record-context-free verb. The list layer prepends the person
  // ("Log contact for Jane Doe") so the accessible action name stays specific
  // (#332 / req 4) — this label is only the verb half.
  label: string;
  tab: CareNextActionTab;
};

// State a Needs-Contact item carries that the resolver reasons over. Kept to the
// minimum signals the decision needs so it stays a pure, unit-testable mapping.
export type CareContactState = {
  // True when no active over-shepherd covers this leader. An uncovered leader's
  // obvious next action is to get them coverage, not to log a one-off contact.
  hasOverShepherd: boolean;
  // True when the leader has a future/dated next-touchpoint commitment. With no
  // scheduled touchpoint, the obvious next action is to schedule one.
  hasScheduledTouchpoint: boolean;
};

const LABELS: Record<CareNextAction, string> = {
  "assign-over-shepherd": "Assign over-shepherd",
  "schedule-touchpoint": "Schedule touchpoint",
  "log-contact": "Log contact",
  "resolve-follow-up": "Resolve follow-up",
};

function result(
  action: CareNextAction,
  tab: CareNextActionTab
): CareNextActionResult {
  return { action, label: LABELS[action], tab };
}

// The obvious next action for a leader the attention engine flagged for
// outreach. Precedence: coverage first (an unassigned leader needs an
// over-shepherd before steady cadence makes sense), then a scheduled
// touchpoint, then logging the actual contact.
export function resolveContactNextAction(
  state: CareContactState
): CareNextActionResult {
  if (!state.hasOverShepherd) return result("assign-over-shepherd", "overview");
  if (!state.hasScheduledTouchpoint) {
    return result("schedule-touchpoint", "overview");
  }
  return result("log-contact", "overview");
}

// The obvious next action for an open care follow-up (overdue or due soon): work
// it to done on the leader's Follow-ups tab.
export function resolveOpenFollowUpNextAction(): CareNextActionResult {
  return result("resolve-follow-up", "follow-ups");
}

// Build the record-context accessible action name from the verb label + person,
// e.g. "Log contact for Jane Doe" (#332 / req 4 — never a bare "Log contact").
export function careActionAccessibleName(
  label: string,
  personName: string
): string {
  return `${label} for ${personName}`;
}
