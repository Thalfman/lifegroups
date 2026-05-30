import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader, PageBody } from "@/components/lg/PageHeader";
import { Card } from "@/components/lg/Card";
import { AdminMasterCalendarShell } from "@/components/admin/admin-master-calendar-shell";
import { requireAdmin } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadMasterCalendar } from "@/lib/admin/master-calendar";
import {
  monthBounds,
  monthLabel,
  shiftMonthIso,
} from "@/lib/calendar/occurrences";
import { churchMonthIso, churchTodayIso } from "@/lib/shared/church-time";

export const dynamic = "force-dynamic";

type SearchParams = { month?: string | string[] };

function pickMonthParam(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== "string") return null;
  if (!/^\d{4}-\d{2}$/.test(raw)) return null;
  return monthBounds(raw) ? raw : null;
}

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

export default async function AdminMasterCalendarPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  await requireAdmin();
  const params = (await searchParams) ?? {};
  const monthIso = pickMonthParam(params.month) ?? churchMonthIso();

  const client = await createSupabaseServerClient();
  if (!client) notFound();

  const data = await loadMasterCalendar(client, { monthIso });
  const todayIso = churchTodayIso();
  const prevMonth = shiftMonthIso(monthIso, -1);
  const nextMonth = shiftMonthIso(monthIso, 1);
  const isCurrentMonth = monthIso === churchMonthIso();

  return (
    <>
      <PageHeader
        eyebrow="Calendar"
        title="Ministry"
        italic="calendar"
        lede="A read-only view of every active group's meetings, OFF weeks, and special gatherings. Click any occurrence to see the details or jump into that group's calendar to make changes."
      />
      <PageBody>
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
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                {prevMonth ? (
                  <Link href={`/admin/calendar?month=${prevMonth}`} style={navLinkStyle}>
                    ← {monthLabel(prevMonth)}
                  </Link>
                ) : null}
                <Link
                  href="/admin/calendar"
                  aria-current={isCurrentMonth ? "page" : undefined}
                  style={isCurrentMonth ? navLinkActiveStyle : navLinkStyle}
                >
                  This month
                </Link>
                {nextMonth ? (
                  <Link href={`/admin/calendar?month=${nextMonth}`} style={navLinkStyle}>
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
          />
        </div>
      </PageBody>
    </>
  );
}
