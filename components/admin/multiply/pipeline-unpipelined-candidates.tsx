"use client";

import type { CandidateView } from "@/lib/admin/multiplication";
import { LockedInCandidateRow } from "@/components/admin/multiply/pipeline-locked-in-candidates";

// ADR 0030 fallback: saved (locked-in) candidates whose type is NOT explicitly
// pipelined — including Untyped groups. The type-first Pipeline only renders
// pipelined types, and the legacy MultiplicationPlanner that used to surface
// every saved candidate is retired from this tab, so without this section those
// candidates would silently disappear from Multiply. They render read-only here
// (with the same status / year / member-count / readiness summary and Remove as
// the in-pipeline locked-in rows) so no saved plan is lost; pipelining the
// candidate's type moves it up into that type's section. Renders nothing when
// there are none.
export function PipelineUnpipelinedCandidates({
  candidates,
}: {
  candidates: readonly CandidateView[];
}) {
  if (candidates.length === 0) return null;

  return (
    <section
      aria-labelledby="pipeline-unpipelined-heading"
      className="grid gap-2 rounded-md border border-line bg-bg p-4"
    >
      <div className="grid gap-1">
        <h3
          id="pipeline-unpipelined-heading"
          className="m-0 font-sans text-sm font-semibold text-ink"
        >
          Saved candidates not in a pipelined type
        </h3>
        <p className="m-0 font-sans text-sm text-ink2">
          These groups have a saved multiplication plan but their type
          isn&rsquo;t in the pipeline (or has no type yet). Pipeline the type to
          manage them in place, or remove a plan you&rsquo;re no longer
          pursuing.
        </p>
      </div>
      <ul className="m-0 grid list-none gap-1.5 p-0">
        {candidates.map((c) => (
          <LockedInCandidateRow key={c.candidateId} candidate={c} />
        ))}
      </ul>
    </section>
  );
}
