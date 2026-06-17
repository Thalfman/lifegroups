import { isUuid } from "@/lib/shared/uuid";
import type { ValidationResult } from "./shared";
import {
  isRecord,
  readBooleanFlag,
  readOptionalString,
  normalizeUuid,
  readOptionalInteger,
} from "./shared";

// Group-Health Grade rated dimensions (#128). The two net-new admin-entered
// 1–5 ratings — spiritual growth (+ optional pastoral note) and the relayed
// group question — captured together: the editor submits the full state of both
// for the group's month, so the payload IS the desired row (an empty score is an
// explicit clear). The leader-reported provenance of the group question is
// forced server-side in the RPC, so it is not a client input here.
// The inclusive bounds of a Group-Health rating (1–5). Exported so the editor's
// number inputs and this validator share one source of truth.
export const GROUP_HEALTH_RATING_MIN = 1;
export const GROUP_HEALTH_RATING_MAX = 5;

export type GroupHealthRatingsPayload = {
  group_id: string;
  spiritual_growth_score: number | null;
  spiritual_growth_note: string | null;
  group_question_score: number | null;
  // Admin IM 05 (#265): the open follow-up flag, toggled by the drawer
  // checkbox and persisted on the same save as the ratings.
  needs_follow_up: boolean;
};

export function validateGroupHealthRatingsPayload(
  input: unknown
): ValidationResult<GroupHealthRatingsPayload> {
  const errors: string[] = [];
  if (!isRecord(input))
    return { ok: false, errors: ["payload must be an object"] };

  if (!isUuid(input.group_id)) errors.push("group_id must be a uuid");

  // Each rating is a 1–5 or empty (an explicit clear → null).
  const readRating = (raw: unknown, label: string): number | null => {
    const n = readOptionalInteger(raw);
    if (n === "invalid") {
      errors.push(`${label} rating must be a whole number between 1 and 5.`);
      return null;
    }
    if (n === undefined) return null;
    if (n < GROUP_HEALTH_RATING_MIN || n > GROUP_HEALTH_RATING_MAX) {
      errors.push(`${label} rating must be between 1 and 5.`);
      return null;
    }
    return n;
  };

  const spiritualScore = readRating(
    input.spiritual_growth_score,
    "Spiritual-growth"
  );
  const questionScore = readRating(
    input.group_question_score,
    "Group-question"
  );

  const noteRaw = readOptionalString(input.spiritual_growth_note);
  let note: string | null = null;
  if (noteRaw !== undefined && noteRaw.length > 2000) {
    errors.push("Spiritual-growth note is too long (max 2000 characters).");
  } else {
    note = noteRaw ?? null;
  }

  const needsFollowUp = readBooleanFlag(input.needs_follow_up);
  // The currently-displayed (possibly carried-from-a-prior-month) flag, posted
  // as a hidden field so the no-op guard can tell "clearing an open flag" from
  // "a blank save on a never-flagged group". Client-supplied and only a UX
  // heuristic — the RPC stays the security boundary — so it is not persisted.
  const priorFollowUp = readBooleanFlag(input.prior_needs_follow_up);

  // Reject a true no-op: no ratings, no note, and no follow-up change. Setting
  // the flag (needsFollowUp) or clearing a flag that was open (priorFollowUp)
  // is meaningful and goes through; only a blank save on an unflagged group is
  // a no-op. (Keying this on the flag's *presence* would defeat the guard — the
  // action runner always lifts needs_follow_up into the payload, even unchecked.)
  if (
    spiritualScore === null &&
    questionScore === null &&
    note === null &&
    !needsFollowUp &&
    !priorFollowUp
  ) {
    errors.push("Enter at least one rating or a note.");
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      group_id: normalizeUuid(input.group_id as string),
      spiritual_growth_score: spiritualScore,
      spiritual_growth_note: note,
      group_question_score: questionScore,
      needs_follow_up: needsFollowUp,
    },
  };
}
