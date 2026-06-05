// Prospect Next Step + armed follow-ups (#379). Pure, I/O-free, unit-tested.
//
// Each Prospect carries a single current Next Step — a {type, dueDate?, detail?}
// — plus a SEPARATE Additional Note field (free text, unrelated to the step).
// The two Next Step types are deliberately asymmetric:
//
//   * "follow_up" — a back-office task. A Follow Up WITH a due date is "armed":
//     on/after that date it surfaces as a due task (a reminder the admin owes
//     the Prospect). A Follow Up with NO due date is just a noted intent, not a
//     due task. NO email/SMS provider is wired — the mechanism is ready to fire
//     once one is configured, but nothing is actually sent (see the UI's "to be
//     configured" indicator). Keeping the firing decision here, pure, is what
//     lets a future provider hook read `dueFollowUps` without re-deriving it.
//
//   * "connect_to_group_leader" — purely back-office. It records that the admin
//     intends to hand the Prospect to a group leader, but it NEVER produces a
//     due task and NEVER surfaces on any Leader surface (acceptance: choosing it
//     changes nothing a Leader sees). It is encoded here as a step that can
//     never be due so the rule has one tested home, mirrored by the RPC.
//
// As with prospect-funnel.ts, the same normalize/validate rules are enforced
// twice — here for the UI/validation layer, and again in SQL inside
// admin_set_prospect_next_step (the authoritative gate).

import { isIsoDate } from "@/lib/admin/validation/shared";

// The two Next Step kinds. connect_to_group_leader is back-office only.
export type NextStepType = "connect_to_group_leader" | "follow_up";

export const NEXT_STEP_TYPES: readonly NextStepType[] = [
  "connect_to_group_leader",
  "follow_up",
];

export const NEXT_STEP_TYPE_LABEL: Record<NextStepType, string> = {
  connect_to_group_leader: "Connect to Group Leader",
  follow_up: "Follow Up",
};

// The longest a Next Step detail / Additional Note may be. Mirrors the SQL
// CHECK + the RPC length guards.
export const NEXT_STEP_DETAIL_MAX = 2000;
export const ADDITIONAL_NOTE_MAX = 2000;

// The normalized Next Step shape. dueDate is an ISO `YYYY-MM-DD` string or null;
// detail is trimmed-non-empty or null. A null NextStep means "no current step".
export type NextStep = {
  type: NextStepType;
  dueDate: string | null;
  detail: string | null;
};

export type NextStepError =
  | "invalid_type"
  | "invalid_due_date"
  | "detail_too_long";

export type NextStepResult =
  | { ok: true; value: NextStep }
  | { ok: false; error: NextStepError };

export function isNextStepType(value: unknown): value is NextStepType {
  return (
    typeof value === "string" && NEXT_STEP_TYPES.includes(value as NextStepType)
  );
}

/**
 * Normalize + validate a raw Next Step. `type` must be one of the two kinds;
 * `dueDate` is optional (null/undefined/"" → null) but, when present, must be an
 * ISO `YYYY-MM-DD`; `detail` is optional, trimmed, and length-bounded. Returns
 * the canonical {@link NextStep} or a fixed error token. Mirrors the SQL shape
 * check in admin_set_prospect_next_step.
 */
export function normalizeNextStep(input: {
  type: unknown;
  dueDate?: unknown;
  detail?: unknown;
}): NextStepResult {
  if (!isNextStepType(input.type)) return { ok: false, error: "invalid_type" };

  let dueDate: string | null = null;
  if (input.dueDate !== undefined && input.dueDate !== null) {
    if (typeof input.dueDate !== "string") {
      return { ok: false, error: "invalid_due_date" };
    }
    const trimmed = input.dueDate.trim();
    if (trimmed.length > 0) {
      if (!isIsoDate(trimmed)) return { ok: false, error: "invalid_due_date" };
      dueDate = trimmed;
    }
  }

  let detail: string | null = null;
  if (input.detail !== undefined && input.detail !== null) {
    if (typeof input.detail !== "string") {
      return { ok: false, error: "detail_too_long" };
    }
    const trimmed = input.detail.trim();
    if (trimmed.length > 0) {
      if (trimmed.length > NEXT_STEP_DETAIL_MAX) {
        return { ok: false, error: "detail_too_long" };
      }
      detail = trimmed;
    }
  }

  return { ok: true, value: { type: input.type, dueDate, detail } };
}

/**
 * Normalize an Additional Note: trimmed-non-empty or null, length-bounded.
 * It is entirely separate from the Next Step — a Prospect may carry a note with
 * no step, a step with no note, both, or neither. Returns the canonical value or
 * null on absence; returns the special "too_long" token when over the cap.
 */
export function normalizeAdditionalNote(
  input: unknown
): { ok: true; value: string | null } | { ok: false; error: "note_too_long" } {
  if (input === undefined || input === null) return { ok: true, value: null };
  if (typeof input !== "string") return { ok: false, error: "note_too_long" };
  const trimmed = input.trim();
  if (trimmed.length === 0) return { ok: true, value: null };
  if (trimmed.length > ADDITIONAL_NOTE_MAX) {
    return { ok: false, error: "note_too_long" };
  }
  return { ok: true, value: trimmed };
}

/**
 * Is this Next Step an armed Follow Up that is due on/before `todayIso`? Only a
 * "follow_up" with a due date can ever be due, and only once that date has
 * arrived (dueDate <= today). "connect_to_group_leader" is never due — it is
 * back-office and produces no due task / leader effect. A null step is never
 * due.
 */
export function isFollowUpDue(
  nextStep: NextStep | null,
  todayIso: string
): boolean {
  if (nextStep === null) return false;
  if (nextStep.type !== "follow_up") return false;
  if (nextStep.dueDate === null) return false;
  // Lexicographic comparison is exact for `YYYY-MM-DD`.
  return nextStep.dueDate <= todayIso;
}

// A Prospect, reduced to the shape dueFollowUps needs: identity + its current
// Next Step. Callers pass their own richer rows; this keeps the helper pure.
export type ProspectWithNextStep = {
  id: string;
  full_name: string;
  next_step: NextStep | null;
};

// An armed Follow Up that has come due — the "due task" surface item.
export type DueFollowUp = {
  id: string;
  full_name: string;
  dueDate: string;
  detail: string | null;
};

/**
 * The armed Follow-Up steps across `prospects` that are due on/before
 * `todayIso`, soonest-due first. connect_to_group_leader steps and undated
 * follow-ups never appear (no due task, no leader effect). This is the single
 * pure source the due-task UI — and any future provider auto-fire — reads.
 */
export function dueFollowUps(
  prospects: readonly ProspectWithNextStep[],
  todayIso: string
): DueFollowUp[] {
  const due: DueFollowUp[] = [];
  for (const p of prospects) {
    if (isFollowUpDue(p.next_step, todayIso) && p.next_step) {
      due.push({
        id: p.id,
        full_name: p.full_name,
        // isFollowUpDue guarantees a non-null dueDate here.
        dueDate: p.next_step.dueDate as string,
        detail: p.next_step.detail,
      });
    }
  }
  return due.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

/**
 * Decode an unknown jsonb value (as read from prospects.next_step) into a
 * {@link NextStep} or null. Anything that doesn't normalize cleanly decodes to
 * null — a defensive read at the DB trust boundary, never a throw. The stored
 * shape uses snake_case keys (type / due_date / detail) to match the SQL.
 */
export function decodeNextStep(value: unknown): NextStep | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const result = normalizeNextStep({
    type: record.type,
    dueDate: record.due_date,
    detail: record.detail,
  });
  return result.ok ? result.value : null;
}
