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
    <div className="grid justify-items-center gap-1.5 rounded-lg border border-dashed border-line bg-surface px-[18px] py-8 text-center font-sans text-base text-ink2">
      <div className="font-semibold text-ink">{primary}</div>
      <div className="text-sm text-ink3">{secondary}</div>
    </div>
  );
}
