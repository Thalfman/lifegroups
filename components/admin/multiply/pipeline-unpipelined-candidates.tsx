"use client";

import {
  segmentAnchorId,
  type CandidateView,
} from "@/lib/admin/multiplication";
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
//
// Candidates are grouped by their type segment so each type owns its
// `seg-<type>` deep-link anchor (the Readiness grid links to
// /admin/multiply?tab=pipeline#seg-<type>; a non-pipelined type with a saved
// candidate resolves here instead of the type-first section). No anchor collides
// with a pipelined type's PipelineTypeSection — by definition these segments are
// the ones that aren't pipelined. scroll-mt-24 keeps the anchored group off the
// viewport top after the hash scroll, matching the pipelined sections.
type FallbackGroup = {
  segment: string;
  anchorId: string;
  items: CandidateView[];
};

function groupBySegment(candidates: readonly CandidateView[]): FallbackGroup[] {
  const groups: FallbackGroup[] = [];
  const byKey = new Map<string, FallbackGroup>();
  for (const c of candidates) {
    const key = c.segment.toLowerCase();
    let group = byKey.get(key);
    if (!group) {
      group = {
        segment: c.segment,
        anchorId: segmentAnchorId(c.segment),
        items: [],
      };
      byKey.set(key, group);
      groups.push(group);
    }
    group.items.push(c);
  }
  return groups;
}

export function PipelineUnpipelinedCandidates({
  candidates,
}: {
  candidates: readonly CandidateView[];
}) {
  if (candidates.length === 0) return null;

  const groups = groupBySegment(candidates);

  return (
    <section
      aria-labelledby="pipeline-unpipelined-heading"
      className="grid gap-3 rounded-md border border-line bg-bg p-4"
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
      {groups.map((group) => (
        <div
          key={group.segment}
          id={group.anchorId}
          className="grid scroll-mt-24 gap-1"
        >
          <p className="m-0 font-sans text-xs font-semibold uppercase tracking-wide text-ink3">
            {group.segment}
          </p>
          <ul className="m-0 grid list-none gap-1.5 p-0">
            {group.items.map((c) => (
              <LockedInCandidateRow key={c.candidateId} candidate={c} />
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
