import type { WeekOption } from "@/lib/admin/check-ins";

// Shared week selector used by /admin and /admin/check-ins. Renders a
// simple GET form so the page server-component reads the `?week=` param
// and re-renders without any client-side state. Phase 6.0 extracted this
// from check-in-review-shell so both pages stay visually identical.
export function WeekSelector({
  meetingWeek,
  weekOptions,
  formAction,
  label = "Showing",
  selectId = "admin-week-select",
}: {
  meetingWeek: string;
  weekOptions: WeekOption[];
  formAction: string;
  label?: string;
  selectId?: string;
}) {
  return (
    <form
      method="GET"
      action={formAction}
      className="flex flex-wrap items-center gap-2.5"
    >
      <label
        htmlFor={selectId}
        className="font-sans text-2xs font-semibold uppercase tracking-[1.6px] text-ink3"
      >
        {label}
      </label>
      <select
        id={selectId}
        name="week"
        defaultValue={meetingWeek}
        className="min-w-[220px] rounded-[8px] border border-line bg-surface px-3 py-2 font-sans text-base text-ink"
      >
        {weekOptions.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <button
        type="submit"
        className="cursor-pointer rounded-[8px] border border-ink bg-ink px-4 py-[9px] font-sans text-xs font-semibold tracking-[0.4px] text-surface"
      >
        Show week
      </button>
    </form>
  );
}
