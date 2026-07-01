import type {
  ActiveShepherdCoverageAssignmentSummary,
  ShepherdCareDirectoryEntry,
} from "@/lib/supabase/shepherd-care-reads";
import {
  CareDirectoryTable,
  type CareDirectoryEmptyAction,
} from "./care-directory-table-base";

const roleLabel: Record<string, string> = {
  leader: "Shepherd",
  co_leader: "Co-shepherd",
};

// Admin roster: the shared care table plus an "Over-shepherd" coverage column
// and admin link targets / labels. `emptyText` lets the caller name WHY the
// table is empty (#477 — a needs-attention-filtered roster with no flagged
// rows must not read like an empty roster).
export function ShepherdCareDirectoryTable({
  entries,
  coverageByShepherdId,
  emptyText = "No shepherds to show.",
  emptyAction,
}: {
  entries: ShepherdCareDirectoryEntry[];
  coverageByShepherdId: Map<string, ActiveShepherdCoverageAssignmentSummary>;
  emptyText?: string;
  emptyAction?: CareDirectoryEmptyAction;
}) {
  return (
    <CareDirectoryTable
      entries={entries}
      firstColumnLabel="Shepherd"
      roleLabels={roleLabel}
      hrefForEntry={(entry) => `/admin/shepherd-care/${entry.profile.id}`}
      emptyText={emptyText}
      emptyAction={emptyAction}
      extraColumn={{
        header: "Over-shepherd",
        render: (entry) => {
          const coverage = coverageByShepherdId.get(entry.profile.id) ?? null;
          return coverage ? (
            <span className="text-ink">{coverage.over_shepherd.full_name}</span>
          ) : (
            <span className="text-ink3">—</span>
          );
        },
      }}
    />
  );
}
