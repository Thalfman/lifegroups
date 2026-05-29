import { P } from "@/lib/pastoral";
import type {
  ActiveShepherdCoverageAssignmentSummary,
  ShepherdCareDirectoryEntry,
} from "@/lib/supabase/read-models";
import { CareDirectoryTable } from "./care-directory-table-base";

const roleLabel: Record<string, string> = {
  leader: "Leader",
  co_leader: "Co-leader",
};

// Admin directory: the shared care table plus an "Over-shepherd" coverage
// column and admin link targets / labels.
export function ShepherdCareDirectoryTable({
  entries,
  coverageByShepherdId,
}: {
  entries: ShepherdCareDirectoryEntry[];
  coverageByShepherdId: Map<string, ActiveShepherdCoverageAssignmentSummary>;
}) {
  return (
    <CareDirectoryTable
      entries={entries}
      firstColumnLabel="Leader"
      roleLabels={roleLabel}
      hrefForEntry={(entry) => `/admin/shepherd-care/${entry.profile.id}`}
      emptyText="No leaders to show."
      extraColumn={{
        header: "Over-shepherd",
        render: (entry) => {
          const coverage = coverageByShepherdId.get(entry.profile.id) ?? null;
          return coverage ? (
            <span style={{ color: P.ink }}>{coverage.over_shepherd.full_name}</span>
          ) : (
            <span style={{ color: P.ink3 }}>—</span>
          );
        },
      }}
    />
  );
}
