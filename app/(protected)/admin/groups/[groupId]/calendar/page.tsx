import Link from "next/link";
import { notFound } from "next/navigation";
import { PastoralAppShell } from "@/components/pastoral/shell";
import { UserPill } from "@/components/auth/user-pill";
import { LogoutButton } from "@/components/auth/logout-button";
import { CalendarEventList } from "@/components/calendar/calendar-event-list";
import {
  CalendarMonthGrid,
  describeSchedule,
} from "@/components/calendar/calendar-month-grid";
import { ArchivedRestoreButton } from "@/components/calendar/calendar-archived-actions";
import { requireAdmin } from "@/lib/auth/session";
import { navItemsForRole } from "@/lib/auth/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  fetchGroupCalendarEvents,
  fetchGroupsByIds,
} from "@/lib/supabase/read-models";
import {
  churchMonthIso,
  generateMonthOccurrences,
  mergeOverrides,
  monthBounds,
  monthLabel,
  shiftMonthIso,
  todayChurchIso,
  toSavedOverrides,
} from "@/lib/calendar/occurrences";
import type { GroupsRow } from "@/types/database";
import { P, fontBody, fontSans } from "@/lib/pastoral";
import {
  adminArchiveCalendarEvent,
  adminCreateCalendarEvent,
  adminRestoreCalendarEvent,
  adminUpdateCalendarEvent,
} from "./actions";

export const dynamic = "force-dynamic";

type Params = { groupId: string };
type Search = { archived?: string; month?: string };

const navLinkStyle: React.CSSProperties = {
  fontFamily: fontSans,
  fontSize: 12,
  color: P.ink,
  textDecoration: "none",
  padding: "6px 10px",
  borderRadius: 999,
  border: `1px solid ${P.line}`,
};

export default async function AdminGroupCalendarPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams?: Promise<Search>;
}) {
  const { groupId } = await params;
  const search = (await searchParams) ?? {};
  const showArchived = search.archived === "1";

  const session = await requireAdmin();

  const client = await createSupabaseServerClient();
  if (!client) notFound();

  const monthIso =
    typeof search.month === "string" && /^\d{4}-\d{2}$/.test(search.month)
      ? search.month
      : churchMonthIso();
  const bounds = monthBounds(monthIso);
  if (!bounds) notFound();

  const [groupResult, eventsResult] = await Promise.all([
    fetchGroupsByIds(client, [groupId]),
    fetchGroupCalendarEvents(client, {
      groupId,
      fromDate: bounds.firstIso,
      toDate: bounds.lastIso,
      archivedOnly: showArchived,
    }),
  ]);

  if (groupResult.error) throw groupResult.error;
  const group = (groupResult.data ?? [])[0] as GroupsRow | undefined;
  if (!group) notFound();
  if (eventsResult.error) throw eventsResult.error;

  const events = eventsResult.data ?? [];
  const todayIso = todayChurchIso();
  const generated = generateMonthOccurrences(
    {
      meetingDay: group.meeting_day,
      meetingTime: group.meeting_time,
      meetingFrequency: group.meeting_frequency,
      meetingWeekParity: group.meeting_week_parity,
    },
    monthIso,
  );
  const resolved = mergeOverrides(generated, toSavedOverrides(events), group.meeting_time);
  const scheduleSummary = describeSchedule({
    meetingDay: group.meeting_day,
    meetingTime: group.meeting_time,
    meetingFrequency: group.meeting_frequency,
    meetingWeekParity: group.meeting_week_parity,
  });
  const prevMonth = shiftMonthIso(monthIso, -1);
  const nextMonth = shiftMonthIso(monthIso, 1);

  return (
    <PastoralAppShell
      navItems={navItemsForRole(session.profile.role)}
      eyebrow="Admin · Group calendar"
      title={group.name}
      titleItalic={showArchived ? "— archived" : "— calendar"}
      lede={
        group.lifecycle_status === "closed"
          ? "This group is closed. Admins can still correct calendar occurrences here; leaders cannot edit while it is closed."
          : "Click any date to set the gathering type or mark it OFF / Cancelled. Time is inherited from the group's schedule."
      }
      contentMaxWidth={920}
      headerSlot={
        <>
          <UserPill
            name={session.profile.full_name}
            email={session.profile.email}
            role={session.profile.role}
          />
          <LogoutButton />
        </>
      }
    >
      <div style={{ display: "grid", gap: 18 }}>
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
          <Link href="/admin/groups" style={{ color: P.ink2, textDecoration: "none" }}>
            ← Back to groups
          </Link>
          <span aria-hidden="true">·</span>
          <Link
            href={`/admin/groups/${groupId}/calendar`}
            style={{
              textDecoration: showArchived ? "none" : "underline",
              fontWeight: showArchived ? 400 : 600,
              color: showArchived ? P.ink3 : P.ink,
            }}
          >
            Calendar
          </Link>
          <span aria-hidden="true">·</span>
          <Link
            href={`/admin/groups/${groupId}/calendar?archived=1&month=${monthIso}`}
            style={{
              textDecoration: showArchived ? "underline" : "none",
              fontWeight: showArchived ? 600 : 400,
              color: showArchived ? P.ink : P.ink3,
            }}
          >
            Archived
          </Link>
        </nav>

        {!showArchived ? (
          <>
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
                <div
                  style={{
                    fontFamily: fontBody,
                    fontSize: 13,
                    color: P.ink2,
                    lineHeight: 1.4,
                  }}
                >
                  {scheduleSummary ?? <ScheduleGap group={group} />}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                {prevMonth ? (
                  <Link
                    href={`/admin/groups/${groupId}/calendar?month=${prevMonth}`}
                    style={navLinkStyle}
                  >
                    ← {monthLabel(prevMonth)}
                  </Link>
                ) : null}
                <Link
                  href={`/admin/groups/${groupId}/calendar`}
                  style={navLinkStyle}
                >
                  This month
                </Link>
                {nextMonth ? (
                  <Link
                    href={`/admin/groups/${groupId}/calendar?month=${nextMonth}`}
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
              groupId={groupId}
              groupMeetingTime={group.meeting_time}
              actions={{
                create: adminCreateCalendarEvent,
                update: adminUpdateCalendarEvent,
                archive: adminArchiveCalendarEvent,
              }}
              canEdit={true}
            />
          </>
        ) : (
          <section style={{ display: "grid", gap: 10 }}>
            <h2
              style={{
                fontFamily: fontSans,
                fontSize: 12,
                letterSpacing: 1.5,
                textTransform: "uppercase",
                color: P.ink3,
                fontWeight: 600,
                margin: 0,
              }}
            >
              Archived overrides · {monthLabel(monthIso)}
            </h2>
            <p
              style={{
                fontFamily: fontBody,
                fontSize: 13,
                color: P.ink2,
                margin: 0,
              }}
            >
              Past overrides that were cleared. Restoring re-applies the override on the calendar grid.
            </p>
            <CalendarEventList
              events={events}
              emptyMessage="No archived overrides for this month."
              archivedSeparate={false}
              renderActions={(event) => (
                <ArchivedRestoreButton
                  eventId={event.id}
                  groupId={groupId}
                  action={adminRestoreCalendarEvent}
                />
              )}
            />
          </section>
        )}
      </div>
    </PastoralAppShell>
  );
}

function ScheduleGap({ group }: { group: GroupsRow }) {
  const missing: string[] = [];
  if (!group.meeting_day) missing.push("meeting day");
  if (!group.meeting_time) missing.push("meeting time");
  if (
    group.meeting_frequency === "biweekly" &&
    group.meeting_week_parity == null
  ) {
    missing.push("bi-weekly parity");
  }
  return (
    <>
      Schedule incomplete (missing {missing.join(", ") || "fields"}). Set them in{" "}
      <Link href={`/admin/groups`} style={{ color: P.terra, textDecoration: "underline" }}>
        group management
      </Link>
      {" "}so the calendar can generate occurrences. Special one-off events can still be added by clicking a date.
    </>
  );
}
