import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader, PageBody } from "@/components/lg/PageHeader";
import { Card } from "@/components/lg/Card";
import { buttonClassName } from "@/components/ui/button";
import { CalendarEventList } from "@/components/calendar/calendar-event-list";
import {
  CalendarMonthGrid,
  describeSchedule,
} from "@/components/calendar/calendar-month-grid";
import { ArchivedRestoreButton } from "@/components/calendar/calendar-archived-actions";
import { cn } from "@/lib/utils";
import { requireAdmin } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  fetchGroupCalendarEvents,
  fetchGroupsByIds,
} from "@/lib/supabase/read-models";
import {
  generateMonthOccurrences,
  mergeOverrides,
  monthBounds,
  monthLabel,
  shiftMonthIso,
  toSavedOverrides,
} from "@/lib/calendar/occurrences";
import { churchMonthIso, churchTodayIso } from "@/lib/shared/church-time";
import type { GroupsRow } from "@/types/database";
import {
  adminArchiveCalendarEvent,
  adminCreateCalendarEvent,
  adminRestoreCalendarEvent,
  adminUpdateCalendarEvent,
} from "./actions";

export const dynamic = "force-dynamic";

type Params = { groupId: string };
type Search = { archived?: string; month?: string };

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

  await requireAdmin();

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
  const todayIso = churchTodayIso();
  const generated = generateMonthOccurrences(
    {
      meetingDay: group.meeting_day,
      meetingTime: group.meeting_time,
      meetingFrequency: group.meeting_frequency,
      meetingWeekParity: group.meeting_week_parity,
    },
    monthIso
  );
  const resolved = mergeOverrides(
    generated,
    toSavedOverrides(events),
    group.meeting_time
  );
  const scheduleSummary = describeSchedule({
    meetingDay: group.meeting_day,
    meetingTime: group.meeting_time,
    meetingFrequency: group.meeting_frequency,
    meetingWeekParity: group.meeting_week_parity,
  });
  const prevMonth = shiftMonthIso(monthIso, -1);
  const nextMonth = shiftMonthIso(monthIso, 1);

  return (
    <>
      <PageHeader
        eyebrow="Admin · Group calendar"
        title={group.name}
        italic={showArchived ? "— archived" : "— calendar"}
        lede={
          group.lifecycle_status === "closed"
            ? "This group is closed. Admins can still correct calendar occurrences here; shepherds cannot edit while it is closed."
            : "Click any date to set the gathering type or mark it OFF / Cancelled. Time is inherited from the group's schedule."
        }
        maxWidth={920}
      />
      <PageBody maxWidth={920}>
        <div className="grid gap-5">
          <nav className="flex flex-wrap items-center gap-3 font-sans text-sm text-ink3">
            <Link href="/admin/groups" className="text-ink2 no-underline">
              ← Back to groups
            </Link>
            <span aria-hidden="true">·</span>
            <Link
              href={`/admin/groups/${groupId}/calendar`}
              className={cn(
                showArchived
                  ? "font-normal text-ink3 no-underline"
                  : "font-semibold text-ink underline"
              )}
            >
              Calendar
            </Link>
            <span aria-hidden="true">·</span>
            <Link
              href={`/admin/groups/${groupId}/calendar?archived=1&month=${monthIso}`}
              className={cn(
                showArchived
                  ? "font-semibold text-ink underline"
                  : "font-normal text-ink3 no-underline"
              )}
            >
              Archived
            </Link>
          </nav>

          {!showArchived ? (
            <>
              <Card>
                <div className="flex flex-wrap items-center justify-between gap-3.5">
                  <div className="grid gap-1">
                    <div className="font-display text-lg font-medium text-ink">
                      {monthLabel(monthIso)}
                    </div>
                    <div className="font-sans text-sm leading-snug text-ink2">
                      {scheduleSummary ?? <ScheduleGap group={group} />}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {prevMonth ? (
                      <Link
                        href={`/admin/groups/${groupId}/calendar?month=${prevMonth}`}
                        className={buttonClassName("ghost", "sm")}
                      >
                        ← {monthLabel(prevMonth)}
                      </Link>
                    ) : null}
                    <Link
                      href={`/admin/groups/${groupId}/calendar`}
                      className={buttonClassName("ghost", "sm")}
                    >
                      This month
                    </Link>
                    {nextMonth ? (
                      <Link
                        href={`/admin/groups/${groupId}/calendar?month=${nextMonth}`}
                        className={buttonClassName("ghost", "sm")}
                      >
                        {monthLabel(nextMonth)} →
                      </Link>
                    ) : null}
                  </div>
                </div>
              </Card>

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
            <section className="grid gap-2.5">
              <h2 className="m-0 font-sans text-xs font-semibold uppercase tracking-wide text-ink3">
                Archived overrides · {monthLabel(monthIso)}
              </h2>
              <p className="m-0 font-sans text-sm text-ink2">
                Past overrides that were cleared. Restoring re-applies the
                override on the calendar grid.
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
      </PageBody>
    </>
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
      Schedule incomplete (missing {missing.join(", ") || "fields"}). Set them
      in{" "}
      <Link href={`/admin/groups`} className="text-clay underline">
        group management
      </Link>{" "}
      so the calendar can generate occurrences. Special one-off events can still
      be added by clicking a date.
    </>
  );
}
