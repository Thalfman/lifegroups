"use client";

import { useState, useTransition } from "react";
import { PButton } from "@/components/pastoral/button";
import { adminArchiveMultiplicationCandidate } from "@/app/(protected)/admin/launch-planning/actions";
import {
  CANDIDATE_STATUS_LABEL,
  CRITERION_LABEL,
  type CandidateView,
  type MultiplicationCriterion,
} from "@/lib/admin/multiplication";
import { errorTextClassName as ERROR } from "@/components/admin/forms/field-styles";

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
          {c.readiness.metCount}/{c.readiness.totalCount} ready
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
      {/* Render all five criteria with met / unmet styling (not just
          the ticked ones) so the summary carries the full readiness
          state — a 0/5 candidate still shows which boxes are unchecked.
          The ✓ / ○ prefix is a non-colour cue for the met/unmet split. */}
      <ul className="m-0 flex flex-wrap list-none gap-1 p-0">
        {(
          Object.entries(c.readiness.criteria) as [
            MultiplicationCriterion,
            boolean,
          ][]
        ).map(([criterion, met]) => (
          <li
            key={criterion}
            className={
              met
                ? "rounded-sm bg-tealSoft px-1.5 py-0.5 font-sans text-xs text-ink2"
                : "rounded-sm bg-surface px-1.5 py-0.5 font-sans text-xs text-ink3"
            }
          >
            {met ? "✓" : "○"} {CRITERION_LABEL[criterion]}
          </li>
        ))}
      </ul>
      {error ? (
        <p role="alert" className={ERROR}>
          {error}
        </p>
      ) : null}
    </li>
  );
}
