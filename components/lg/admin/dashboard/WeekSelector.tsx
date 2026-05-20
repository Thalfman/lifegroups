import { Icon } from "@/components/lg/Icon";
import type { WeekOption } from "@/lib/admin/check-ins";

// Stays a GET form so the page server-component re-reads `?week=` and
// re-renders. Restyled for the warm-pastoral system.
export function WeekSelector({
  meetingWeek,
  weekOptions,
  formAction,
  selectId = "admin-week-select",
}: {
  meetingWeek: string;
  weekOptions: WeekOption[];
  formAction: string;
  selectId?: string;
}) {
  return (
    <form
      method="GET"
      action={formAction}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "4px 4px 4px 12px",
        background: "var(--c-surfaceAlt)",
        border: "1px solid var(--c-line)",
        borderRadius: 999,
        fontFamily: "var(--font-body)",
        fontSize: 12,
        color: "var(--c-ink2)",
      }}
    >
      <Icon name="cal" size={13} color="var(--c-ink3)" />
      <label htmlFor={selectId} className="sr-only">
        Week
      </label>
      <select
        id={selectId}
        name="week"
        defaultValue={meetingWeek}
        style={{
          fontFamily: "var(--font-body)",
          fontSize: 12,
          background: "transparent",
          border: "none",
          color: "var(--c-ink2)",
          outline: "none",
          padding: "2px 0",
          minWidth: 140,
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
        aria-label="Show week"
        style={{
          background: "var(--c-surface)",
          width: 26,
          height: 26,
          borderRadius: "50%",
          display: "grid",
          placeItems: "center",
          cursor: "pointer",
          border: "1px solid var(--c-line)",
          color: "var(--c-ink2)",
        }}
      >
        <Icon name="chev" size={11} color="var(--c-ink3)" />
      </button>
    </form>
  );
}
