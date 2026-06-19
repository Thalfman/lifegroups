import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PastoralAppShell } from "@/components/pastoral/shell";
import { UserPill } from "@/components/auth/user-pill";
import { LogoutButton } from "@/components/auth/logout-button";
import { CalendarEventList } from "@/components/calendar/calendar-event-list";
import {
  CalendarMonthGrid,
  describeSchedule,
} from "@/components/calendar/calendar-month-grid";
import { ArchivedRestoreButton } from "@/components/calendar/calendar-archived-actions";
import { buttonClassName } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { requireLeader } from "@/lib/auth/session";
import { toShellUser } from "@/lib/auth/shell-user";
import { navItemsForRole } from "@/lib/auth/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  fetchGroupCalendarEvents,
  fetchLeaderGroupsByIds,
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
import type { LeaderSafeGroupRow } from "@/lib/supabase/read-models";
import {
  leaderArchiveCalendarEvent,
  leaderCreateCalendarEvent,
  leaderRestoreCalendarEvent,
  leaderUpdateCalendarEvent,
} from "./actions";

export const dynamic = "force-dynamic";

type Params = { groupId: string };
type Search = { archived?: string; month?: string };

const monthNavLinkClassName = buttonClassName("ghost", "sm");

export default async function LeaderCalendarPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams?: Promise<Search>;
}) {
  const { groupId } = await params;
  const search = (await searchParams) ?? {};
  const showArchived = search.archived === "1";

  const session = await requireLeader();
  if (!session.assignedGroupIds.includes(groupId)) {
    redirect("/leader");
  }

  const client = await createSupabaseServerClient();
  if (!client) notFound();

  const monthIso =
    typeof search.month === "string" && /^\d{4}-\d{2}$/.test(search.month)
      ? search.month
      : churchMonthIso();
  const bounds = monthBounds(monthIso);
  if (!bounds) notFound();

  // Leader-calendar past-date rule (#376 criterion 6, ADR 0017):
  // READS span the full requested month, INCLUDING past dates. A leader can
  // page back to a prior month and SEE past occurrences — that read history is
  // intentional context for caring for the group (it mirrors the read-only
  // posture admins already have, and the underlying rows are RLS-scoped to the
  // leader's group via auth_is_leader_of). WRITES are a separate question: past
  // dates render but editing them is governed by the calendar grid's canEdit /
  // the RPC's own date checks, not by widening the read window. We deliberately
  // do NOT clamp fromDate to today, so the past stays visible (read) while the
  // surface remains group-scoped.
  const [groupResult, eventsResult] = await Promise.all([
    fetchLeaderGroupsByIds(client, [groupId]),
    fetchGroupCalendarEvents(client, {
      groupId,
      fromDate: bounds.firstIso,
      toDate: bounds.lastIso,
      archivedOnly: showArchived,
    }),
  ]);

  if (groupResult.error) throw groupResult.error;
  const group = (groupResult.data ?? [])[0] as LeaderSafeGroupRow | undefined;
  if (!group) notFound();
  if (eventsResult.error) throw eventsResult.error;

  const events = eventsResult.data ?? [];
  const groupClosed = group.lifecycle_status === "closed";
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
    <PastoralAppShell
      navItems={navItemsForRole(session.profile.role)}
      currentUser={toShellUser(session.profile)}
      eyebrow="Calendar"
      title={group.name}
      titleItalic={showArchived ? "— archived" : "— calendar"}
      lede={
        groupClosed
          ? "This group is closed, so shepherd edits are paused. Past occurrences are kept here for reference; a ministry admin can make changes if you need them."
          : "Click any date to set the gathering type or mark it OFF / Cancelled. Time is inherited from the group's schedule."
      }
      contentMaxWidth={840}
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
      <div className="grid gap-4">
        <nav className="flex flex-wrap items-center gap-3 font-sans text-xs text-ink3">
          <Link
            href={`/leader/${groupId}/calendar`}
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
            href={`/leader/${groupId}/calendar?archived=1&month=${monthIso}`}
            className={cn(
              showArchived
                ? "font-semibold text-ink underline"
                : "font-normal text-ink3 no-underline"
            )}
          >
            Archived
          </Link>
          <span aria-hidden="true" className="ml-auto"></span>
          <Link
            href="/leader"
            className="text-ink2 no-underline hover:text-ink"
          >
            ← Back to dashboard
          </Link>
        </nav>

        {!showArchived ? (
          <>
            <section className="flex flex-wrap items-center justify-between gap-3.5 rounded-lg border border-line bg-surface px-4 py-3.5">
              <div className="grid gap-1">
                <div className="font-display text-lg font-medium text-ink">
                  {monthLabel(monthIso)}
                </div>
                <div className="font-sans text-sm leading-normal text-ink2">
                  {scheduleSummary ?? <ScheduleGap />}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {prevMonth ? (
                  <Link
                    href={`/leader/${groupId}/calendar?month=${prevMonth}`}
                    className={monthNavLinkClassName}
                  >
                    ← {monthLabel(prevMonth)}
                  </Link>
                ) : null}
                <Link
                  href={`/leader/${groupId}/calendar`}
                  className={monthNavLinkClassName}
                >
                  This month
                </Link>
                {nextMonth ? (
                  <Link
                    href={`/leader/${groupId}/calendar?month=${nextMonth}`}
                    className={monthNavLinkClassName}
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
                create: leaderCreateCalendarEvent,
                update: leaderUpdateCalendarEvent,
                archive: leaderArchiveCalendarEvent,
              }}
              canEdit={!groupClosed}
              disabledReason={
                groupClosed
                  ? "This group is closed; shepherd edits are paused."
                  : undefined
              }
            />
            {groupClosed ? (
              <p className="m-0 font-sans text-sm italic text-ink2">
                Leader edits are paused while this group is closed. Contact an
                admin to make changes.
              </p>
            ) : null}
          </>
        ) : (
          <section className="grid gap-2.5">
            <h2 className="m-0 font-display text-lg font-medium text-ink">
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
              renderActions={(event) =>
                groupClosed ? null : (
                  <ArchivedRestoreButton
                    eventId={event.id}
                    groupId={groupId}
                    action={leaderRestoreCalendarEvent}
                  />
                )
              }
            />
          </section>
        )}
      </div>
    </PastoralAppShell>
  );
}

function ScheduleGap() {
  return (
    <>
      Schedule incomplete. Contact a ministry admin so they can finish the
      meeting cadence in group management. Special one-off events can still be
      added by clicking a date.
    </>
  );
}
