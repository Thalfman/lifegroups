"use client";

import { STAGE_LABEL, type MatchedShepherd } from "@/lib/admin/leader-pipeline";

// ADR 0030 (#758) — the supply side under a pipelined type: the apprentices
// whose home group is this type, Ready-to-lead first. A pipelined type with no
// matched shepherd still renders cleanly (never block). #758 owns this
// component and the matchShepherdsToType matcher that fills `shepherds`; the
// seam ships rendering the empty state.
export function PipelineMatchedShepherds({
  shepherds,
}: {
  shepherds: readonly MatchedShepherd[];
}) {
  return (
    <div className="grid gap-1">
      <p className="m-0 font-sans text-xs font-semibold uppercase tracking-wide text-ink3">
        Matched shepherds
      </p>
      {shepherds.length === 0 ? (
        <p className="m-0 font-sans text-sm text-ink3">
          No matched shepherds yet.
        </p>
      ) : (
        <ul className="m-0 grid list-none gap-1 p-0">
          {shepherds.map((s) => (
            <li
              key={s.id}
              className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-sm border border-line bg-bg px-2.5 py-1.5"
            >
              <span className="font-sans text-sm font-medium text-ink">
                {s.displayName}
              </span>
              <span className="font-sans text-xs text-ink3">{s.groupName}</span>
              <span
                className={
                  s.readyToLead
                    ? "rounded-sm bg-tealSoft px-1.5 py-0.5 font-sans text-xs text-ink2"
                    : "rounded-sm bg-surface px-1.5 py-0.5 font-sans text-xs text-ink2"
                }
              >
                {STAGE_LABEL[s.stage]}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
