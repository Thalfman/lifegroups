import { Pill } from "@/components/lg/Pill";
import type { SetupGaps as SetupGapsData } from "@/lib/dashboard/types";

interface AggregatedGap {
  groupId: string;
  name: string;
  labels: string[];
}

export function SetupGaps({ data }: { data: SetupGapsData }) {
  const byGroup = new Map<string, AggregatedGap>();
  function add(groupId: string, name: string, label: string) {
    if (!byGroup.has(groupId)) {
      byGroup.set(groupId, { groupId, name, labels: [] });
    }
    byGroup.get(groupId)!.labels.push(label);
  }
  data.noLeader.forEach((g) => add(g.groupId, g.name, "Leader"));
  data.noCapacity.forEach((g) => add(g.groupId, g.name, "Capacity"));
  data.noMeetingDayTime.forEach((g) => add(g.groupId, g.name, "Day/time"));
  data.noMembers.forEach((g) => add(g.groupId, g.name, "Members"));

  const rows = Array.from(byGroup.values()).slice(0, 6);

  if (rows.length === 0) {
    return (
      <div
        style={{
          fontFamily: "var(--font-body)",
          fontSize: 13,
          color: "var(--c-ink3)",
          fontStyle: "italic",
        }}
      >
        Every group has its basics in place.
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 8 }}>
      {rows.map((g) => (
        <div
          key={g.groupId}
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
            {g.name}
          </span>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {g.labels.map((m) => (
              <Pill key={m} tone="ghost">
                {m}
              </Pill>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
