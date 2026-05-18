import { P, fontBody, fontSans } from "@/lib/pastoral";
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
      style={{
        display: "flex",
        gap: 10,
        alignItems: "center",
        flexWrap: "wrap",
      }}
    >
      <label
        htmlFor={selectId}
        style={{
          fontFamily: fontSans,
          fontSize: 11,
          letterSpacing: 1.6,
          textTransform: "uppercase",
          color: P.ink3,
          fontWeight: 600,
        }}
      >
        {label}
      </label>
      <select
        id={selectId}
        name="week"
        defaultValue={meetingWeek}
        style={{
          fontFamily: fontBody,
          fontSize: 14,
          padding: "8px 12px",
          background: P.surface,
          border: `1px solid ${P.line}`,
          borderRadius: 8,
          color: P.ink,
          minWidth: 220,
        }}
      >
        {weekOptions.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <button
        type="submit"
        style={{
          fontFamily: fontSans,
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: 0.4,
          padding: "9px 16px",
          background: P.ink,
          color: P.surface,
          border: `1px solid ${P.ink}`,
          borderRadius: 8,
          cursor: "pointer",
        }}
      >
        Show week
      </button>
    </form>
  );
}
