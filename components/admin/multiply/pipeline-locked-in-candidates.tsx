"use client";

import {
  CANDIDATE_STATUS_LABEL,
  CRITERION_LABEL,
  type CandidateView,
  type MultiplicationCriterion,
} from "@/lib/admin/multiplication";

// ADR 0030 — the saved multiplication_candidates of a pipelined type (one per
// group), with status / target year / readiness chips. Read-only today;
// removing a locked-in candidate (soft, audited archive via
// admin_archive_multiplication_candidate, returning the group to the potential
// list) and editing it arrive in #757, which owns this component.
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
            <li
              key={c.candidateId}
              className="grid gap-1 rounded-sm border border-line bg-bg px-2.5 py-1.5"
            >
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
                <span className="font-sans text-xs text-ink3">
                  {c.readiness.metCount}/{c.readiness.totalCount} ready
                </span>
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
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
