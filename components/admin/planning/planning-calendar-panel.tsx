import Link from "next/link";
import { Card } from "@/components/lg/Card";
import { ErrorBanner } from "@/components/lg/ErrorBanner";
import { AdminMasterCalendarShell } from "@/components/admin/admin-master-calendar-shell";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadMasterCalendar } from "@/lib/admin/master-calendar";
import { monthLabel, shiftMonthIso } from "@/lib/calendar/occurrences";
import { churchMonthIso, churchTodayIso } from "@/lib/shared/church-time";

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

// The Calendar tab of the Planning area (#303). It hosts the same master
// calendar as the frozen /admin/calendar route, but leads with the list /
// upcoming view so the most scannable answer to "what's coming next?" is first;
// the month grid stays one tap away via the in-calendar view toggle, and the
// status legend rides above every view so the event-type colors are explained.
// Month navigation reloads /admin/planning?month=… (the area defaults back to
// this Calendar tab), keeping month switching server-rendered without moving
// the frozen route.
export async function PlanningCalendarPanel({
  monthIso,
  viewerId,
}: {
  monthIso: string;
  viewerId?: string | null;
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
  let data: Awaited<ReturnType<typeof loadMasterCalendar>>;
  try {
    data = await loadMasterCalendar(client, { monthIso });
  } catch (err) {
    return (
      <ErrorBanner>
        The calendar could not be loaded:{" "}
        {err instanceof Error ? err.message : "unknown error"}
      </ErrorBanner>
    );
  }
  const todayIso = churchTodayIso();
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
      />
    </div>
  );
}
