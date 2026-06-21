"use client";

import { useId, useState, useTransition } from "react";
import { PButton } from "@/components/pastoral/button";
import {
  adminArchiveMultiplicationCandidate,
  adminUpdateMultiplicationCandidate,
} from "@/app/(protected)/admin/launch-planning/actions";
import {
  CANDIDATE_STATUS_LABEL,
  CRITERION_LABEL,
  type CandidateView,
  type MultiplicationCriterion,
} from "@/lib/admin/multiplication";
import { errorTextClassName as ERROR } from "@/components/admin/forms/field-styles";

// The five readiness criteria in display order. Mirrors evaluateReadiness's key
// order (and readiness-checklist.tsx's CRITERIA_ORDER) so the inline toggle
// reads the same as the "Lock in" checklist it complements.
const CRITERIA_ORDER: readonly MultiplicationCriterion[] = [
  "enough_members",
  "established_long_enough",
  "co_shepherd_tenured",
  "shepherd_willing",
  "needs_similar_stage",
];

// Build the FormData for an inline readiness edit. admin_update_multiplication_candidate
// is a FULL update — any field absent from the form is cleared/defaulted — so we
// echo every current candidate value back and only vary the five readiness flags.
// Checkboxes follow the repo convention: presence = true, absence = false.
function buildReadinessUpdateForm(
  candidate: CandidateView,
  readiness: Record<MultiplicationCriterion, boolean>
): FormData {
  const formData = new FormData();
  formData.set("candidate_id", candidate.candidateId);
  // group_id is required by the validator; a locked-in candidate always anchors
  // to a concrete group, but guard defensively rather than post an empty uuid.
  if (candidate.groupId) formData.set("group_id", candidate.groupId);
  formData.set("status", candidate.status);
  if (candidate.targetYear != null)
    formData.set("target_year", String(candidate.targetYear));
  if (candidate.notes != null) formData.set("notes", candidate.notes);
  if (candidate.successorDesignate != null)
    formData.set("successor_designate", candidate.successorDesignate);
  if (candidate.meetingTime != null)
    formData.set("meeting_time", candidate.meetingTime);
  if (candidate.leaderPipelineId != null)
    formData.set("leader_pipeline_id", candidate.leaderPipelineId);
  if (candidate.manualMemberCount != null)
    formData.set("manual_member_count", String(candidate.manualMemberCount));
  for (const criterion of CRITERIA_ORDER) {
    if (readiness[criterion]) formData.set(criterion, "on");
  }
  return formData;
}

// ADR 0030 — the saved multiplication_candidates of a pipelined type (one per
// group), with status / target year / readiness chips. #757 wires Remove: a
// soft, audited archive via admin_archive_multiplication_candidate that returns
// the group to the potential list (the server re-partitions through
// buildPipelineView after revalidatePath("/admin/multiply")). No hard delete.
export function PipelineLockedInCandidates({
  candidates,
}: {
  candidates: readonly CandidateView[];
}) {
  return (
    <div className="grid gap-1">
      <p className="m-0 font-sans text-xs font-semibold uppercase tracking-wide text-ink3">
        Locked-in candidates
      </p>
      {candidates.length === 0 ? (
        <p className="m-0 font-sans text-sm text-ink3">None locked in yet.</p>
      ) : (
        <ul className="m-0 grid list-none gap-1.5 p-0">
          {candidates.map((c) => (
            <LockedInCandidateRow key={c.candidateId} candidate={c} />
          ))}
        </ul>
      )}
    </div>
  );
}

export function LockedInCandidateRow({
  candidate: c,
}: {
  candidate: CandidateView;
}) {
  const [error, setError] = useState<string | undefined>(undefined);
  const [pending, startTransition] = useTransition();
  // OPP-5 (#781): readiness is editable inline now, so the row owns an optimistic
  // copy of the five flags. Seeded from the candidate's stored readiness; updated
  // on toggle before the write resolves and rolled back per-criterion on failure.
  // The server's revalidatePath("/admin/multiply") repaints the summary on
  // success, but the optimistic copy keeps the checkbox in sync in the meantime.
  const [readiness, setReadiness] = useState<
    Record<MultiplicationCriterion, boolean>
  >(c.readiness.criteria);
  const fieldsetId = useId();

  const metCount = CRITERIA_ORDER.filter((k) => readiness[k]).length;

  function remove() {
    setError(undefined);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("candidate_id", c.candidateId);
      const result = await adminArchiveMultiplicationCandidate(
        undefined,
        formData
      );
      if (!result.ok) {
        setError(result.errors[0] ?? "That wasn't removed. Try again.");
      }
      // On success, revalidatePath("/admin/multiply") in the action re-partitions
      // the group back onto the potential list.
    });
  }

  // OPP-5: optimistic, no-confirm readiness toggle. Flip the flag in place, post
  // the full update, and roll back only that one criterion if the write fails —
  // never report a false "ready" (the same false-zero failure mode the read path
  // guards against). A per-criterion functional rollback keeps a concurrent
  // toggle of another box intact.
  function toggleCriterion(criterion: MultiplicationCriterion) {
    const nextValue = !readiness[criterion];
    setError(undefined);
    setReadiness((cur) => ({ ...cur, [criterion]: nextValue }));
    startTransition(async () => {
      const next = { ...readiness, [criterion]: nextValue };
      const result = await adminUpdateMultiplicationCandidate(
        undefined,
        buildReadinessUpdateForm(c, next)
      );
      if (!result.ok) {
        setReadiness((cur) => ({ ...cur, [criterion]: !nextValue }));
        setError(result.errors[0] ?? "That readiness change wasn't saved.");
      }
    });
  }

  return (
    <li className="grid gap-1 rounded-sm border border-line bg-bg px-2.5 py-1.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="font-sans text-sm font-medium text-ink">
          {c.groupName}
        </span>
        <span className="rounded-sm bg-surface px-1.5 py-0.5 font-sans text-xs text-ink2">
          {CANDIDATE_STATUS_LABEL[c.status]}
        </span>
        {/* target_year is nullable (TBD is a valid state) — show it
            explicitly so a candidate with no year set still reads as a
            tracked fact, not a missing field. */}
        <span className="rounded-sm bg-surface px-1.5 py-0.5 font-sans text-xs text-ink2">
          {c.targetYear != null ? c.targetYear : "Year TBD"}
        </span>
        {/* ADR 0030 keeps the roster count visible on the candidate summary
            after the member-count input was dropped from the form. "(entered)"
            marks a manually-entered headcount vs. the live roster count. */}
        <span className="font-sans text-xs text-ink3">
          {c.memberCount} members
          {c.manualMemberCount != null ? " (entered)" : ""}
        </span>
        <span className="font-sans text-xs text-ink3">
          {metCount}/{CRITERIA_ORDER.length} ready
        </span>
        <PButton
          type="button"
          tone="ghost"
          size="sm"
          onClick={remove}
          disabled={pending}
          aria-label={`Remove ${c.groupName} from the plan`}
          style={{ marginLeft: "auto" }}
        >
          {pending ? "Removing…" : "Remove"}
        </PButton>
      </div>
      {/* OPP-5 (#781): the five criteria are inline checkboxes now — a one-box
          change no longer costs a full drawer round trip. Each toggle is
          optimistic and audited through adminUpdateMultiplicationCandidate; the
          checkbox is the met/unmet cue (no separate ✓ / ○ glyph needed). */}
      <fieldset className="m-0 flex flex-wrap gap-x-3 gap-y-1 border-0 p-0">
        <legend className="sr-only">Readiness for {c.groupName}</legend>
        {CRITERIA_ORDER.map((criterion) => {
          const id = `${fieldsetId}-${criterion}`;
          return (
            <label
              key={criterion}
              htmlFor={id}
              className="inline-flex cursor-pointer items-center gap-1 font-sans text-xs text-ink2"
            >
              <input
                id={id}
                type="checkbox"
                checked={readiness[criterion]}
                onChange={() => toggleCriterion(criterion)}
                // Serialize toggles: while a readiness write is in flight the
                // boxes are disabled, so a second toggle can't post a full update
                // built from a stale snapshot and let an out-of-order response
                // silently revert the newer change (Codex P2).
                disabled={pending}
                className="h-3.5 w-3.5 accent-teal"
              />
              {CRITERION_LABEL[criterion]}
            </label>
          );
        })}
      </fieldset>
      {error ? (
        <p role="alert" className={ERROR}>
          {error}
        </p>
      ) : null}
    </li>
  );
}
