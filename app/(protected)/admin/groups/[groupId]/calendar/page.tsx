import Link from "next/link";
import { notFound } from "next/navigation";
import { PastoralAppShell } from "@/components/pastoral/shell";
import { UserPill } from "@/components/auth/user-pill";
import { LogoutButton } from "@/components/auth/logout-button";
import { CalendarEventList } from "@/components/calendar/calendar-event-list";
import { CalendarEventForm } from "@/components/calendar/calendar-event-form";
import { CalendarEventActions } from "@/components/calendar/calendar-event-actions";
import { requireAdmin } from "@/lib/auth/session";
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
  adminArchiveCalendarEvent,
  adminCreateCalendarEvent,
  adminRestoreCalendarEvent,
  adminUpdateCalendarEvent,
} from "./actions";

export const dynamic = "force-dynamic";

type Params = { groupId: string };
type Search = { archived?: string };

function addDays(iso: string, days: number): string {
  const anchor = new Date(`${iso}T00:00:00Z`);
  anchor.setUTCDate(anchor.getUTCDate() + days);
  return anchor.toISOString().slice(0, 10);
}

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

  const todayWeek = isoWeekStart(new Date());
  // Admins get a wider window: 12 weeks past + 26 weeks future.
  const fromDate = addDays(todayWeek, -12 * 7);
  const toDate = addDays(todayWeek, 26 * 7);

  const [groupResult, eventsResult] = await Promise.all([
    fetchGroupsByIds(client, [groupId]),
    fetchGroupCalendarEvents(client, {
      groupId,
      fromDate,
      toDate,
      // Archived tab scopes to archived-only; default tab stays
      // active-only. Mirrors the leader calendar route.
      archivedOnly: showArchived,
    }),
  ]);

  if (groupResult.error) throw groupResult.error;
  const group = (groupResult.data ?? [])[0] as GroupsRow | undefined;
  if (!group) notFound();
  // Fail loudly on a calendar read failure rather than rendering an
  // empty calendar -- an admin could think there are no events and
  // create a conflicting one while existing rows are just unreadable.
  if (eventsResult.error) throw eventsResult.error;

  const events = eventsResult.data ?? [];

  return (
    <PastoralAppShell
      navItems={navItemsForRole(session.profile.role)}
      eyebrow="Admin · Group calendar"
      title={group.name}
      titleItalic={showArchived ? "— archived" : "— calendar"}
      lede={
        group.lifecycle_status === "closed"
          ? "This group is closed. Admins can still correct calendar events here; leaders cannot edit while it is closed."
          : "Manage the group's calendar — rotations, special nights, OFF weeks, and cancellations. Changes flow through audit so you can see who set what."
      }
      contentMaxWidth={880}
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
            Upcoming
          </Link>
          <span aria-hidden="true">·</span>
          <Link
            href={`/admin/groups/${groupId}/calendar?archived=1`}
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
              action={adminCreateCalendarEvent}
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
            {showArchived ? "Archived events" : "Calendar"}
          </h2>
          <CalendarEventList
            events={events}
            emptyMessage={
              showArchived
                ? "No archived events for this group."
                : "No calendar events yet. Add the first one above."
            }
            archivedSeparate={!showArchived}
            renderActions={(event) => (
              <CalendarEventActions
                event={event}
                groupId={groupId}
                actions={{
                  update: adminUpdateCalendarEvent,
                  archive: adminArchiveCalendarEvent,
                  restore: adminRestoreCalendarEvent,
                }}
              />
            )}
          />
        </section>
      </div>
    </PastoralAppShell>
  );
}
