import { notFound, redirect } from "next/navigation";
import { PastoralAppShell } from "@/components/pastoral/shell";
import { UserPill } from "@/components/auth/user-pill";
import { LogoutButton } from "@/components/auth/logout-button";
import { CalendarEventList } from "@/components/calendar/calendar-event-list";
import { CalendarEventForm } from "@/components/calendar/calendar-event-form";
import { CalendarEventActions } from "@/components/calendar/calendar-event-actions";
import { requireLeader } from "@/lib/auth/session";
import { navItemsForRole } from "@/lib/auth/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  fetchGroupCalendarEvents,
  fetchGroupsByIds,
} from "@/lib/supabase/read-models";
import { isoWeekStart } from "@/lib/leader/validation";
import type { GroupsRow } from "@/types/database";
import { P, fontBody, fontSans } from "@/lib/pastoral";
import {
  leaderArchiveCalendarEvent,
  leaderCreateCalendarEvent,
  leaderRestoreCalendarEvent,
  leaderUpdateCalendarEvent,
} from "./actions";

export const dynamic = "force-dynamic";

type Params = { groupId: string };
type Search = { archived?: string };

function addDays(iso: string, days: number): string {
  const anchor = new Date(`${iso}T00:00:00Z`);
  anchor.setUTCDate(anchor.getUTCDate() + days);
  return anchor.toISOString().slice(0, 10);
}

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

  const todayWeek = isoWeekStart(new Date());
  // 4 weeks past + 16 weeks future window.
  const fromDate = addDays(todayWeek, -28);
  const toDate = addDays(todayWeek, 16 * 7);

  const [groupResult, eventsResult] = await Promise.all([
    fetchGroupsByIds(client, [groupId]),
    fetchGroupCalendarEvents(client, {
      groupId,
      fromDate,
      toDate,
      // Archived tab scopes to archived-only; default tab stays
      // active-only. Avoid includeArchived (which returns both) so the
      // archived workflow never surfaces still-active rows.
      archivedOnly: showArchived,
    }),
  ]);

  if (groupResult.error) throw groupResult.error;
  const group = (groupResult.data ?? [])[0] as GroupsRow | undefined;
  if (!group) notFound();
  // Fail loudly on a calendar read failure rather than rendering an
  // empty calendar -- otherwise a leader could think there are no
  // events and create a conflicting one while existing rows are just
  // unreadable (permission glitch / transient DB error).
  if (eventsResult.error) throw eventsResult.error;

  const events = eventsResult.data ?? [];
  const groupClosed = group.lifecycle_status === "closed";

  return (
    <PastoralAppShell
      navItems={navItemsForRole(session.profile.role)}
      eyebrow="Leader · Calendar"
      title={group.name}
      titleItalic={showArchived ? "— archived" : "— upcoming"}
      lede={
        groupClosed
          ? "This group is closed, so leader edits are paused. Past events are kept here for reference; a ministry admin can make changes if you need them."
          : "Add events for your group: rotations, special nights, OFF weeks, or cancellations. The check-in due date follows whatever you publish here."
      }
      contentMaxWidth={780}
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
          }}
        >
          <a
            href={`/leader/${groupId}/calendar`}
            style={{
              textDecoration: showArchived ? "none" : "underline",
              fontWeight: showArchived ? 400 : 600,
              color: showArchived ? P.ink3 : P.ink,
            }}
          >
            Upcoming
          </a>
          <span aria-hidden="true">·</span>
          <a
            href={`/leader/${groupId}/calendar?archived=1`}
            style={{
              textDecoration: showArchived ? "underline" : "none",
              fontWeight: showArchived ? 600 : 400,
              color: showArchived ? P.ink : P.ink3,
            }}
          >
            Archived
          </a>
          <span aria-hidden="true" style={{ marginLeft: "auto" }}></span>
          <a href="/leader" style={{ color: P.ink2, textDecoration: "none" }}>
            ← Back to dashboard
          </a>
        </nav>

        {!groupClosed && !showArchived ? (
          <section
            style={{
              background: P.surface,
              border: `1px solid ${P.line}`,
              borderRadius: 14,
              padding: "18px 20px",
            }}
          >
            <h2
              style={{
                fontFamily: fontSans,
                fontSize: 12,
                letterSpacing: 1.5,
                textTransform: "uppercase",
                color: P.ink3,
                fontWeight: 600,
                margin: "0 0 10px",
              }}
            >
              Add a calendar event
            </h2>
            <CalendarEventForm
              action={leaderCreateCalendarEvent}
              mode="create"
              groupId={groupId}
              submitLabel="Add event"
              successMessage="Event added."
            />
          </section>
        ) : null}

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
            {showArchived ? "Archived events" : "Upcoming events"}
          </h2>
          <CalendarEventList
            events={events}
            emptyMessage={
              showArchived
                ? "No archived events for this group."
                : "Nothing on the calendar yet. Add the next meeting above when you're ready."
            }
            archivedSeparate={!showArchived}
            renderActions={(event) => (
              <CalendarEventActions
                event={event}
                groupId={groupId}
                disabled={groupClosed}
                actions={{
                  update: leaderUpdateCalendarEvent,
                  archive: leaderArchiveCalendarEvent,
                  restore: leaderRestoreCalendarEvent,
                }}
              />
            )}
          />
          {groupClosed ? (
            <p
              style={{
                fontFamily: fontBody,
                fontSize: 13,
                color: P.ink2,
                margin: 0,
                fontStyle: "italic",
              }}
            >
              Leader edits are paused while this group is closed.
            </p>
          ) : null}
        </section>
      </div>
    </PastoralAppShell>
  );
}
