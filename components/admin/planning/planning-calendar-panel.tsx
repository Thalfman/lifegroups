import Link from "next/link";
import { Card } from "@/components/lg/Card";
import { ErrorBanner } from "@/components/lg/ErrorBanner";
import { AdminMasterCalendarShell } from "@/components/admin/admin-master-calendar-shell";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadMasterCalendar } from "@/lib/admin/master-calendar";
import { monthLabel, shiftMonthIso } from "@/lib/calendar/occurrences";
import {
  churchMonthIso,
  churchTodayIso,
  isoWeekStart,
} from "@/lib/shared/church-time";

const navLinkStyle: React.CSSProperties = {
  fontFamily: "var(--font-body)",
  fontSize: 12,
  color: "var(--c-ink)",
  textDecoration: "none",
  padding: "6px 10px",
  borderRadius: 999,
  border: "1px solid var(--c-line)",
  background: "var(--c-surface)",
};

const navLinkActiveStyle: React.CSSProperties = {
  ...navLinkStyle,
  color: "var(--c-sageDeep)",
  background: "var(--c-sageSoft)",
  border: "1px solid transparent",
  fontWeight: 600,
};

// Add `days` to a YYYY-MM-DD date, returning YYYY-MM-DD. Pure calendar math on
// UTC midnight (the date is already a fixed calendar day), matching isoWeekStart.
function addDaysIso(iso: string, days: number): string {
  const anchor = new Date(`${iso}T00:00:00Z`);
  anchor.setUTCDate(anchor.getUTCDate() + days);
  return anchor.toISOString().slice(0, 10);
}

// The Calendar tab of the Planning area (#303, #331). It hosts the same master
// calendar as the frozen /admin/calendar route, but leads with opinionated
// saved views (This week / Needs coverage / Cancelled-OFF / By leader) as the
// PRIMARY affordance, moves the fine-grained filters into a collapsible
// secondary disclosure, and de-noises the repeated per-row "Open group
// calendar" links to one entry point per group. The status legend rides above
// every view so the event-type colors are explained.
// Month navigation reloads /admin/planning?month=… (the area defaults back to
// this Calendar tab), keeping month switching server-rendered without moving
// the frozen route.
export async function PlanningCalendarPanel({
  monthIso,
  viewerId,
  planningViews = false,
}: {
  monthIso: string;
  viewerId?: string | null;
  // Opt into the opinionated saved views (#331). Only the canonical
  // /admin/planning entry sets this; the frozen /admin/calendar alias leaves it
  // off so its calendar keeps its pre-#331 behavior (no view switcher, no
  // collapsed filters, no link de-noise, no adjacent-month widening). Routed
  // from the page through PlanningView so the two entries can't drift.
  planningViews?: boolean;
}) {
  const client = await createSupabaseServerClient();
  if (!client) {
    return (
      <ErrorBanner>
        The calendar is unavailable: the database is not configured in this
        environment.
      </ErrorBanner>
    );
  }

  // loadMasterCalendar throws when any underlying calendar read fails. Contain
  // that here so a calendar-only outage shows an ErrorBanner in this tab rather
  // than 500-ing all of /admin/planning and blocking the Launches / Capacity /
  // Scenarios / Multiplication tabs (whose loader renders partial-error panels).
  const todayIso = churchTodayIso();

  let data: Awaited<ReturnType<typeof loadMasterCalendar>>;
  try {
    data = await loadMasterCalendar(client, { monthIso });

    // "This week" (#331) filters the loaded set to the current ISO week
    // (Mon–Sun). The loader is month-bounded, so on the first/last days of a
    // month the current ISO week spans an adjacent month and that part would be
    // silently omitted. Widen the load — only when the opinionated views are on
    // (the only mode with a "This week" view) — by pulling any adjacent month
    // the current week overlaps and merging just the in-week occurrences. Most
    // months/days touch no boundary, so this adds a read only at the edges.
    if (planningViews) {
      const weekStart = isoWeekStart(todayIso);
      const weekEnd = addDaysIso(weekStart, 6);
      const adjacentMonths = new Set<string>();
      for (const edge of [weekStart, weekEnd]) {
        const edgeMonth = edge.slice(0, 7);
        if (edgeMonth !== monthIso) adjacentMonths.add(edgeMonth);
      }
      for (const adjMonth of adjacentMonths) {
        const adj = await loadMasterCalendar(client, { monthIso: adjMonth });
        const inWeek = adj.occurrences.filter(
          (o) => o.date >= weekStart && o.date <= weekEnd
        );
        data = { ...data, occurrences: [...data.occurrences, ...inWeek] };
      }
    }
  } catch (err) {
    return (
      <ErrorBanner>
        The calendar could not be loaded:{" "}
        {err instanceof Error ? err.message : "unknown error"}
      </ErrorBanner>
    );
  }
  const prevMonth = shiftMonthIso(monthIso, -1);
  const nextMonth = shiftMonthIso(monthIso, 1);
  const isCurrentMonth = monthIso === churchMonthIso();

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <Card style={{ padding: "14px 18px" }}>
        <div
          style={{
            display: "flex",
            gap: 14,
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
          }}
        >
          <div
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 18,
              color: "var(--c-ink)",
              fontWeight: 500,
            }}
          >
            {monthLabel(monthIso)}
          </div>
          <div
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            {prevMonth ? (
              <Link
                href={`/admin/planning?month=${prevMonth}`}
                style={navLinkStyle}
              >
                ← {monthLabel(prevMonth)}
              </Link>
            ) : null}
            <Link
              href="/admin/planning"
              aria-current={isCurrentMonth ? "page" : undefined}
              style={isCurrentMonth ? navLinkActiveStyle : navLinkStyle}
            >
              This month
            </Link>
            {nextMonth ? (
              <Link
                href={`/admin/planning?month=${nextMonth}`}
                style={navLinkStyle}
              >
                {monthLabel(nextMonth)} →
              </Link>
            ) : null}
          </div>
        </div>
      </Card>

      <AdminMasterCalendarShell
        monthIso={monthIso}
        todayIso={todayIso}
        occurrences={data.occurrences}
        groups={data.groups}
        leaderOptions={data.leaderOptions}
        viewerId={viewerId}
        defaultViewMode="list"
        persistSurface="planning-calendar"
        showLegendAlways
        planningViews={planningViews}
      />
    </div>
  );
}
