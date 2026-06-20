"use client";

import type { PipelinePotentialCandidate } from "@/lib/admin/multiplication";

// ADR 0030 — the auto-listed active groups of a pipelined type that have no
// saved candidate row yet (the potential-candidate pool, partitioned by
// buildPipelineView). Read-only today; the lock-in flow (select a potential →
// tick the five-box readiness checklist → save through the audited
// admin_create_multiplication_candidate RPC, moving the group to locked-in)
// arrives in #757, which owns this component.
export function PipelinePotentialCandidates({
  candidates,
}: {
  candidates: readonly PipelinePotentialCandidate[];
}) {
  return (
    <div className="grid gap-1">
      <p className="m-0 font-sans text-xs font-semibold uppercase tracking-wide text-ink3">
        Potential candidates
      </p>
      {candidates.length === 0 ? (
        <p className="m-0 font-sans text-sm text-ink3">
          No active groups of this type yet.
        </p>
      ) : (
        <ul className="m-0 grid list-none gap-1 p-0">
          {candidates.map((g) => (
            <li
              key={g.groupId}
              className="rounded-sm border border-line bg-bg px-2.5 py-1.5 font-sans text-sm text-ink"
            >
              {g.groupName}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
