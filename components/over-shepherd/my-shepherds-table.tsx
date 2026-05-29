import type { ShepherdCareDirectoryEntry } from "@/lib/supabase/read-models";
import { CareDirectoryTable } from "@/components/admin/shepherd-care/care-directory-table-base";

// Focused "My Shepherds" directory for the Over-Shepherd surface. The shared
// care table with the "Over-shepherd" column dropped (the viewer IS the
// over-shepherd), Shepherd-flavored role labels, and links into the
// /over-shepherd care history rather than /admin.

const roleLabel: Record<string, string> = {
  leader: "Shepherd",
  co_leader: "Co-shepherd",
};

export function MyShepherdsTable({
  entries,
}: {
  entries: ShepherdCareDirectoryEntry[];
}) {
  return (
    <CareDirectoryTable
      entries={entries}
      firstColumnLabel="Shepherd"
      roleLabels={roleLabel}
      hrefForEntry={(entry) => `/over-shepherd/${entry.profile.id}`}
      emptyText="No Shepherds are assigned to your care yet."
    />
  );
}
