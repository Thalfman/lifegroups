import { P, fontBody } from "@/lib/pastoral";

export function EmptyState({
  hasActiveFilters,
}: {
  hasActiveFilters: boolean;
}) {
  const primary = hasActiveFilters
    ? "No group meetings match these filters."
    : "No group meetings on the calendar for this month.";
  const secondary = hasActiveFilters
    ? "Try clearing a filter or pick a different month."
    : "Try a neighboring month, or check group schedules for OFF weeks.";
  return (
    <div
      style={{
        background: P.surface,
        border: `1px dashed ${P.line}`,
        borderRadius: 14,
        padding: "32px 18px",
        textAlign: "center",
        fontFamily: fontBody,
        fontSize: 14,
        color: P.ink2,
        display: "grid",
        gap: 6,
        justifyItems: "center",
      }}
    >
      <div style={{ fontWeight: 600, color: P.ink }}>{primary}</div>
      <div style={{ fontSize: 13, color: P.ink3 }}>{secondary}</div>
    </div>
  );
}
