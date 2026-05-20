import { Pill } from "@/components/pastoral/primitives";
import type { SetupGap, SetupGapRow, SetupGaps } from "@/lib/dashboard/types";

const GAP_LABEL: Record<SetupGap, string> = {
  capacity: "Capacity",
  leader: "Leader",
  meeting_day_time: "Day/time",
  members: "Members",
};

export function SetupGapsCard({ gaps }: { gaps: SetupGaps }) {
  // Invert the per-bucket rows into a per-group map so each group shows up
  // exactly once with chips for every missing field.
  const byGroup = new Map<string, { row: SetupGapRow; gaps: Set<SetupGap> }>();
  const ingest = (rows: SetupGapRow[]) => {
    for (const row of rows) {
      const entry = byGroup.get(row.groupId) ?? {
        row,
        gaps: new Set<SetupGap>(),
      };
      row.gaps.forEach((g) => entry.gaps.add(g));
      byGroup.set(row.groupId, entry);
    }
  };
  ingest(gaps.noCapacity);
  ingest(gaps.noLeader);
  ingest(gaps.noMeetingDayTime);
  ingest(gaps.noMembers);

  const rows = Array.from(byGroup.values());
  if (rows.length === 0) {
    return (
      <div
        style={{
          fontFamily: "var(--font-body)",
          fontSize: 13,
          color: "var(--c-ink3)",
          padding: "8px 4px",
          fontStyle: "italic",
        }}
      >
        Everything is configured. No setup gaps on active groups this week.
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 8 }}>
      {rows.map(({ row, gaps: gapSet }) => (
        <div
          key={row.groupId}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "10px 14px",
            borderRadius: 8,
            background: "var(--c-surfaceAlt)",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-body)",
              fontSize: 13.5,
              fontWeight: 600,
              color: "var(--c-ink)",
            }}
          >
            {row.name}
          </span>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {Array.from(gapSet).map((g) => (
              <Pill key={g} tone="ghost">
                {GAP_LABEL[g]}
              </Pill>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
