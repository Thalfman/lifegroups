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
    if (n < 1 || n > 5) {
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

  // The drawer always posts the follow-up flag's state (present in the payload),
  // so a submit always asserts a definite needs_follow_up value — including
  // clearing a flag on a group with no ratings. `needsFollowUpPresent` marks
  // that real-form case; a bare object without the key is the legacy no-op.
  const needsFollowUpPresent = "needs_follow_up" in input;
  const needsFollowUp = readBooleanFlag(input.needs_follow_up);

  // Reject an all-empty submit: it would wipe both ratings + the note and write
  // an audit row for a no-op. Clearing one rating while the other stands is
  // fine, and a follow-up toggle is itself content worth persisting.
  if (
    spiritualScore === null &&
    questionScore === null &&
    note === null &&
    !needsFollowUpPresent
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
