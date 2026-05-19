import Link from "next/link";
import { PastoralAppShell } from "@/components/pastoral/shell";
import { DataSourceBadge } from "@/components/dashboard/data-source-badge";
import { PublicPreviewNotice } from "@/components/dashboard/notices";
import {
  CalendarMonthGrid,
  describeSchedule,
} from "@/components/calendar/calendar-month-grid";
import {
  churchMonthIso,
  generateMonthOccurrences,
  mergeOverrides,
  monthLabel,
  shiftMonthIso,
  todayChurchIso,
} from "@/lib/calendar/occurrences";
import {
  previewArchiveCalendarEvent,
  previewCreateCalendarEvent,
  previewUpdateCalendarEvent,
} from "@/lib/calendar/preview-actions";
import { P, fontBody, fontSans } from "@/lib/pastoral";

export const dynamic = "force-dynamic";

const PREVIEW_NAV = [
  { href: "/", label: "Home" },
  { href: "/admin-preview", label: "Admin Preview" },
  { href: "/leader-preview", label: "Leader Preview" },
];

const DEMO_GROUP = {
  id: "fallback-leader-group",
  name: "Tuesday Night Life Group",
  meetingDay: "Tuesday",
  meetingTime: "19:00",
  meetingFrequency: "weekly" as const,
  meetingWeekParity: null,
};

const navLinkStyle: React.CSSProperties = {
  fontFamily: fontSans,
  fontSize: 12,
  color: P.ink,
  textDecoration: "none",
  padding: "6px 10px",
  borderRadius: 999,
  border: `1px solid ${P.line}`,
};

type Search = { month?: string };

export default async function LeaderPreviewCalendarPage({
  searchParams,
}: {
  searchParams?: Promise<Search>;
}) {
  const search = (await searchParams) ?? {};
  const monthIso =
    typeof search.month === "string" && /^\d{4}-\d{2}$/.test(search.month)
      ? search.month
      : churchMonthIso();
  const todayIso = todayChurchIso();
  const generated = generateMonthOccurrences(
    {
      meetingDay: DEMO_GROUP.meetingDay,
      meetingTime: DEMO_GROUP.meetingTime,
      meetingFrequency: DEMO_GROUP.meetingFrequency,
      meetingWeekParity: DEMO_GROUP.meetingWeekParity,
    },
    monthIso,
  );
  const resolved = mergeOverrides(generated, [], DEMO_GROUP.meetingTime);
  const scheduleSummary = describeSchedule({
    meetingDay: DEMO_GROUP.meetingDay,
    meetingTime: DEMO_GROUP.meetingTime,
    meetingFrequency: DEMO_GROUP.meetingFrequency,
    meetingWeekParity: DEMO_GROUP.meetingWeekParity,
  });
  const prevMonth = shiftMonthIso(monthIso, -1);
  const nextMonth = shiftMonthIso(monthIso, 1);

  return (
    <PastoralAppShell
      navItems={PREVIEW_NAV}
      eyebrow="Leader preview · Calendar"
      title={DEMO_GROUP.name}
      titleItalic="— calendar"
      lede="Public design preview of a leader's calendar. Generated meeting occurrences appear automatically from the group's schedule."
      contentMaxWidth={840}
      headerSlot={<DataSourceBadge source="fallback" />}
    >
      <div style={{ display: "grid", gap: 14 }}>
        <PublicPreviewNotice />
        <nav
          style={{
            display: "flex",
            gap: 12,
            alignItems: "center",
            fontFamily: fontSans,
            fontSize: 12,
            color: P.ink3,
            flexWrap: "wrap",
          }}
        >
          <Link href="/leader-preview" style={{ color: P.ink2, textDecoration: "none" }}>
            ← Back to leader preview
          </Link>
        </nav>
        <section
          style={{
            background: P.surface,
            border: `1px solid ${P.line}`,
            borderRadius: 14,
            padding: "14px 18px",
            display: "flex",
            gap: 14,
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "grid", gap: 4 }}>
            <div
              style={{
                fontFamily: fontSans,
                fontSize: 11,
                letterSpacing: 1.5,
                textTransform: "uppercase",
                color: P.ink3,
                fontWeight: 600,
              }}
            >
              {monthLabel(monthIso)}
            </div>
            <div style={{ fontFamily: fontBody, fontSize: 13, color: P.ink2, lineHeight: 1.4 }}>
              {scheduleSummary}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {prevMonth ? (
              <Link
                href={`/leader-preview/${DEMO_GROUP.id}/calendar?month=${prevMonth}`}
                style={navLinkStyle}
              >
                ← {monthLabel(prevMonth)}
              </Link>
            ) : null}
            <Link
              href={`/leader-preview/${DEMO_GROUP.id}/calendar`}
              style={navLinkStyle}
            >
              This month
            </Link>
            {nextMonth ? (
              <Link
                href={`/leader-preview/${DEMO_GROUP.id}/calendar?month=${nextMonth}`}
                style={navLinkStyle}
              >
                {monthLabel(nextMonth)} →
              </Link>
            ) : null}
          </div>
        </section>

        <CalendarMonthGrid
          monthIso={monthIso}
          todayIso={todayIso}
          occurrences={resolved}
          groupId={DEMO_GROUP.id}
          groupMeetingTime={DEMO_GROUP.meetingTime}
          actions={{
            create: previewCreateCalendarEvent,
            update: previewUpdateCalendarEvent,
            archive: previewArchiveCalendarEvent,
          }}
          canEdit={true}
          previewNotice="Preview mode: changes are not persisted in this public preview."
        />
      </div>
    </PastoralAppShell>
  );
}
