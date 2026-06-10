// Group detail (issue #300). Groups is the single source of truth for a group's
// setup, health, attendance, capacity, lifecycle, and related activity — so a
// group's detail carries six tabs: Overview, People, Health, Attendance,
// Follow-ups, Events. The separate Group Health surface is folded in here (its
// route survives per ADR 0008/0009; the Health tab hosts the same Group-Health
// Grade read).
//
// Tabs are URL-driven (?tab=…) so each renders server-side with its own scoped
// read — the build gate server-renders this route, and a deep link to one tab
// works. Attendance is historical / read-only (the check-in flow is frozen per
// ADR 0002/0009): it never presents stale sessions as a live feed.
//
// All reads live behind the reads seam (ADR 0015): the loader binds the live
// client once and runs the pure buildGroupDetailData assembly (spine + only
// the requested tab's reads), so this page is guard → load → render and the
// tab components below are purely presentational.

import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader, PageBody } from "@/components/lg/PageHeader";
import { Card } from "@/components/lg/Card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { requireAdmin } from "@/lib/auth/session";
import {
  loadGroupDetailData,
  type GroupAttendanceTabData,
  type GroupDetailTab,
  type GroupEventsTabData,
  type GroupFollowUpsTabData,
  type GroupHealthTabData,
  type GroupOverviewTabData,
  type GroupPeopleTabData,
} from "@/components/admin/groups/group-detail-data";
import { currentPeriodMonthIso } from "@/lib/admin/ministry-year";
import {
  capacityCategoryLabel,
  followUpPriorityLabel,
  followUpTypeLabel,
  healthCategoryLabel,
  lifecycleCategoryLabel,
  sessionStatusLabel,
  setupCategoryLabel,
} from "@/lib/dashboard/labels";
import type { ResolvedOccurrence } from "@/lib/calendar/occurrences";
import { churchTodayIso } from "@/lib/shared/church-time";
import type { GroupsRow } from "@/types/database";
import type { AttendanceSessionStatus } from "@/types/enums";

export const dynamic = "force-dynamic";

type Params = { groupId: string };
type Search = { tab?: string };

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "people", label: "People" },
  { key: "health", label: "Health" },
  { key: "attendance", label: "Attendance" },
  { key: "follow-ups", label: "Follow-ups" },
  { key: "events", label: "Events" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

function resolveTab(raw: string | undefined): TabKey {
  return (TABS.find((t) => t.key === raw)?.key ?? "overview") as TabKey;
}

// The two text voices on this page: the small zone/detail label and the body
// copy. Same classes the migrated Care panels use for their slot labels.
const LABEL_TEXT =
  "font-sans text-xs font-semibold uppercase tracking-wide text-ink3";
const BODY_TEXT = "font-sans text-base text-ink2";

// A read failed for this tab's content: the claySoft degraded-read voice the
// migrated surfaces use, so the failure can't be mistaken for an empty state.
const READ_ERROR_TEXT =
  "m-0 rounded-md bg-claySoft px-3.5 py-2.5 font-sans text-sm text-clayDeep";

const LIST_RESET = "m-0 list-none p-0";

export default async function AdminGroupDetailPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams?: Promise<Search>;
}) {
  const { groupId } = await params;
  const search = (await searchParams) ?? {};
  const tab: GroupDetailTab = resolveTab(search.tab);

  await requireAdmin();

  const detail = await loadGroupDetailData({
    groupId,
    tab,
    periodMonth: currentPeriodMonthIso(),
    todayIso: churchTodayIso(),
  });
  if (detail.kind !== "ok") notFound();
  const { group, tabData } = detail;

  return (
    <>
      <PageHeader
        eyebrow="Groups"
        title={group.name}
        lede="The full record for this group: setup, the Group-Health Grade, capacity, lifecycle, and its people and activity."
        maxWidth={920}
      />
      <PageBody maxWidth={920}>
        <div className="grid gap-5">
          <Link
            href="/admin/groups"
            className="font-sans text-sm text-ink2 no-underline"
          >
            ← Back to groups
          </Link>

          <nav
            role="tablist"
            aria-label="Group detail sections"
            className="flex flex-wrap gap-1 self-start rounded-pill border border-line bg-surface p-[3px]"
          >
            {TABS.map((t) => {
              const active = t.key === tab;
              return (
                <Link
                  key={t.key}
                  role="tab"
                  aria-selected={active}
                  href={`/admin/groups/${groupId}?tab=${t.key}`}
                  className={cn(
                    "inline-flex items-center rounded-pill px-3.5 py-2 font-sans text-sm no-underline transition-colors duration-150",
                    active
                      ? "bg-clay font-bold text-surface"
                      : "bg-transparent font-medium text-ink3 hover:bg-surfaceAlt"
                  )}
                >
                  {t.label}
                </Link>
              );
            })}
          </nav>

          {tabData.tab === "overview" ? (
            <OverviewTab data={tabData} group={group} groupId={groupId} />
          ) : null}
          {tabData.tab === "people" ? <PeopleTab data={tabData} /> : null}
          {tabData.tab === "health" ? <HealthTab data={tabData} /> : null}
          {tabData.tab === "attendance" ? (
            <AttendanceTab data={tabData} groupId={groupId} />
          ) : null}
          {tabData.tab === "follow-ups" ? (
            <FollowUpsTab data={tabData} />
          ) : null}
          {tabData.tab === "events" ? (
            <EventsTab data={tabData} groupId={groupId} group={group} />
          ) : null}
        </div>
      </PageBody>
    </>
  );
}

// --- Overview: the four independent status labels + meeting details ---------

function OverviewTab({
  data,
  group,
  groupId,
}: {
  data: GroupOverviewTabData;
  group: GroupsRow;
  groupId: string;
}) {
  return (
    <div className="grid gap-3.5">
      {data.statuses === null ? (
        <ErrorNote>
          This group&apos;s status couldn&apos;t be loaded right now — one or
          more reads failed. Retry in a moment or check the database connection.
        </ErrorNote>
      ) : (
        <>
          {/* Four independent labels — shown separately, never combined. */}
          <Card>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-[repeat(auto-fit,minmax(180px,1fr))]">
              <StatusZone label="Lifecycle">
                <Badge dot>
                  {lifecycleCategoryLabel(data.statuses.lifecycle)}
                </Badge>
              </StatusZone>
              <StatusZone label="Setup">
                <Badge dot>{setupCategoryLabel(data.statuses.setup)}</Badge>
              </StatusZone>
              <StatusZone label="Health">
                <Badge dot>{healthCategoryLabel(data.statuses.health)}</Badge>
              </StatusZone>
              <StatusZone label="Capacity">
                <Badge dot>
                  {capacityCategoryLabel(data.statuses.capacity)}
                </Badge>
              </StatusZone>
            </div>
            {data.stale ? (
              <p className={cn("mb-0 mt-2.5", BODY_TEXT, "text-sm")}>
                Health grade is last-known — the live attendance read was
                unavailable.
              </p>
            ) : null}
          </Card>
        </>
      )}

      <Card>
        <div className="grid gap-3">
          <DetailRow
            label="Members"
            value={data.memberCount === null ? "—" : `${data.memberCount}`}
          />
          <DetailRow label="Meeting" value={meetingSummary(group)} />
          <DetailRow
            label="Location"
            value={group.location_area ?? "Not set"}
          />
          {group.description ? (
            <DetailRow label="About" value={group.description} />
          ) : null}
        </div>
      </Card>

      <TabAction href={`/admin/groups/${groupId}/calendar`}>
        Open the group calendar →
      </TabAction>
    </div>
  );
}

// --- People: leaders + active members (read-only roster) --------------------

function PeopleTab({ data }: { data: GroupPeopleTabData }) {
  return (
    <div className="grid gap-3.5">
      <Card>
        <div className="grid gap-2.5">
          <div className={LABEL_TEXT}>Leaders</div>
          {data.leaders === null ? (
            <p role="alert" className={READ_ERROR_TEXT}>
              Leaders couldn&apos;t be loaded right now.
            </p>
          ) : data.leaders.length === 0 ? (
            <div className="grid gap-2">
              <p className={cn("m-0", BODY_TEXT)}>No leader assigned yet.</p>
              <TabAction href="/admin/people">
                Assign a leader in People →
              </TabAction>
            </div>
          ) : (
            <ul className={LIST_RESET}>
              {data.leaders.map((l) => (
                <li key={l.id} className={cn("mb-1", BODY_TEXT)}>
                  {l.name ?? "(unknown)"} ·{" "}
                  {l.isCoLeader ? "Co-Leader" : "Leader"}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      <Card>
        <div className="grid gap-2.5">
          <div className={LABEL_TEXT}>
            Active members
            {data.members === null ? "" : ` (${data.members.length})`}
          </div>
          {data.members === null ? (
            <p role="alert" className={READ_ERROR_TEXT}>
              Members couldn&apos;t be loaded right now.
            </p>
          ) : data.members.length === 0 ? (
            <div className="grid gap-2">
              <p className={cn("m-0", BODY_TEXT)}>
                No active members on the roster.
              </p>
              <TabAction href="/admin/people">
                Add a member in People →
              </TabAction>
            </div>
          ) : (
            <ul className={LIST_RESET}>
              {data.members.map((m) => (
                <li key={m.id} className={cn("mb-1", BODY_TEXT)}>
                  {m.fullName}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      <TabAction href="/admin/people">
        Manage leaders &amp; members in People →
      </TabAction>
    </div>
  );
}

// --- Health: the Group-Health Grade (Q12), folded in from Group Health ------

function HealthTab({ data }: { data: GroupHealthTabData }) {
  if (data.failed) {
    return (
      <div className="grid gap-3.5">
        <ErrorNote>
          The Group-Health Grade couldn&apos;t be loaded right now — a read
          failed. Retry in a moment.
        </ErrorNote>
      </div>
    );
  }

  return (
    <div className="grid gap-3.5">
      <Card>
        <div className="grid gap-3">
          <StatusZone label={`Group-Health Grade · ${data.period}`}>
            <Badge dot>{healthCategoryLabel(data.health)}</Badge>
          </StatusZone>
          {data.stale ? (
            <p className={cn("m-0", BODY_TEXT, "text-sm")}>
              Grade is last-known — the live attendance read was unavailable.
            </p>
          ) : null}
          <DetailRow label="Grade" value={data.grade ?? "Not assessed"} />
          <DetailRow
            label="Attendance (8-wk avg)"
            value={
              data.attendancePct !== null
                ? `${Math.round(data.attendancePct)}% (${data.attendanceWeeksCounted} wk)`
                : "—"
            }
          />
          <DetailRow
            label="Spiritual-growth rating"
            value={data.spiritualGrowthScore?.toString() ?? "Not rated"}
          />
          <DetailRow
            label="Group-question rating"
            value={data.groupQuestionScore?.toString() ?? "Not rated"}
          />
        </div>
      </Card>

      <p className={cn("m-0", BODY_TEXT, "text-sm")}>
        Group health is recomputed live from attendance consistency and the
        admin-entered 1–5 ratings. To edit this group&apos;s ratings, open it
        from the{" "}
        <Link href="/admin/group-health" className="text-clay">
          Group health triage
        </Link>
        .
      </p>
    </div>
  );
}

// --- Attendance: historical / read-only (check-in flow is frozen) -----------

function AttendanceTab({
  data,
  groupId,
}: {
  data: GroupAttendanceTabData;
  groupId: string;
}) {
  return (
    <div className="grid gap-3.5">
      <div
        role="note"
        className={cn(
          "rounded-md border border-dashed border-line bg-surface px-3.5 py-3",
          BODY_TEXT,
          "text-sm"
        )}
      >
        {data.checkInsLive
          ? "Weekly check-ins are currently enabled. The sessions below are the group's recorded attendance history."
          : "Historical attendance, read-only. The weekly check-in flow is paused, so no new attendance is being recorded for this group."}
      </div>

      <Card>
        {data.sessions === null ? (
          <p role="alert" className={READ_ERROR_TEXT}>
            Attendance history couldn&apos;t be loaded right now — a read
            failed.
          </p>
        ) : data.sessions.length === 0 ? (
          <p className={cn("m-0", BODY_TEXT)}>
            No attendance sessions on record.
          </p>
        ) : (
          <ul className={LIST_RESET}>
            {data.sessions.map((s) => (
              <li
                key={s.id}
                className={cn(
                  "flex justify-between gap-3 border-t border-line py-1.5",
                  BODY_TEXT
                )}
              >
                <span>{weekLabel(s.meeting_week)}</span>
                <span className="text-ink3">
                  {sessionStatusLabel(s.status as AttendanceSessionStatus)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <TabAction href={`/admin/groups/${groupId}/calendar`}>
        Open the group calendar →
      </TabAction>
    </div>
  );
}

// --- Follow-ups: open follow-ups related to this group ----------------------

function FollowUpsTab({ data }: { data: GroupFollowUpsTabData }) {
  return (
    <div className="grid gap-3.5">
      <Card>
        {data.followUps === null ? (
          <p role="alert" className={READ_ERROR_TEXT}>
            Follow-ups couldn&apos;t be loaded right now — a read failed. This
            is not a confirmation that the group has none.
          </p>
        ) : data.followUps.length === 0 ? (
          <p className={cn("m-0", BODY_TEXT)}>
            No open follow-ups for this group.
          </p>
        ) : (
          <ul className={LIST_RESET}>
            {data.followUps.map((f) => (
              <li key={f.id} className="grid gap-1 border-t border-line py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-sans text-base font-medium text-ink">
                    {f.title}
                  </span>
                  <Badge dot>{followUpTypeLabel(f.type)}</Badge>
                  <Badge dot>{followUpPriorityLabel(f.priority)}</Badge>
                </div>
                {f.leader_visible_note ? (
                  <span className={cn(BODY_TEXT, "text-sm")}>
                    {f.leader_visible_note}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <TabAction href="/admin/care">Open Care →</TabAction>
    </div>
  );
}

// --- Events: upcoming calendar events for this group ------------------------

function EventsTab({
  data,
  groupId,
  group,
}: {
  data: GroupEventsTabData;
  groupId: string;
  group: GroupsRow;
}) {
  // Fail closed if the override read failed: without it we cannot tell which
  // generated occurrences were cancelled / retyped / retitled, so showing the
  // un-overridden schedule would present stale dates as live meetings. Surface
  // the failure instead of guessing.
  if (data.occurrences === null) {
    return (
      <div className="grid gap-3.5">
        <Card>
          <p role="alert" className={READ_ERROR_TEXT}>
            Upcoming meetings are unavailable right now — the calendar read
            failed. Retry in a moment or open the group calendar.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="grid gap-3.5">
      <Card>
        {data.occurrences.length === 0 ? (
          <p className={cn("m-0", BODY_TEXT)}>
            No upcoming meetings or events scheduled.
          </p>
        ) : (
          <ul className={LIST_RESET}>
            {data.occurrences.map((o) => (
              <li
                key={o.overrideId ?? `gen-${o.date}`}
                className={cn(
                  "flex justify-between gap-3 border-t border-line py-1.5",
                  BODY_TEXT
                )}
              >
                <span>{occurrenceLabel(o)}</span>
                <span className="text-ink3">
                  {weekLabel(o.date)}
                  {o.meetingTime ? ` · ${o.meetingTime}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <TabAction
        href={`/admin/groups/${groupId}/calendar`}
        aria-label={`Open the full calendar for ${group.name}`}
      >
        Open the full calendar for {group.name} →
      </TabAction>
    </div>
  );
}

// A human label for one resolved occurrence: the saved title when present, else
// the gathering type, with a "Cancelled / Off" suffix so paused dates read
// honestly rather than as live meetings.
function occurrenceLabel(o: ResolvedOccurrence): string {
  const base = o.title?.trim() || eventTypeLabel(o.eventType);
  if (o.status === "cancelled") return `${base} · Cancelled`;
  if (o.status === "off") return `${base} · Off`;
  return base;
}

function eventTypeLabel(type: ResolvedOccurrence["eventType"]): string {
  return type
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// --- Small presentational helpers -------------------------------------------

// A small, consistent "go to the canonical workflow" link for a tab. Group
// detail stays read-only (centralized editing lives on People / Group health /
// Care / the calendar), so each tab points to where the next task is done
// rather than turning into an edit screen.
function TabAction({
  href,
  children,
  "aria-label": ariaLabel,
}: {
  href: string;
  children: React.ReactNode;
  "aria-label"?: string;
}) {
  return (
    <Link
      href={href}
      aria-label={ariaLabel}
      className="font-sans text-sm text-clay no-underline"
    >
      {children}
    </Link>
  );
}

function StatusZone({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <span className={LABEL_TEXT}>{label}</span>
      <div>{children}</div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-0.5">
      <span className={LABEL_TEXT}>{label}</span>
      <span className={BODY_TEXT}>{value}</span>
    </div>
  );
}

// A read failed for this tab: say so plainly rather than letting a swallowed
// `?? []` / `?? null` render an empty or misleading state as if authoritative.
function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <Card>
      <p role="alert" className={READ_ERROR_TEXT}>
        {children}
      </p>
    </Card>
  );
}

function meetingSummary(group: GroupsRow): string {
  const day = group.meeting_day?.trim();
  const time = group.meeting_time?.slice(0, 5);
  if (day && time) return `${day} · ${time}`;
  if (day) return day;
  if (time) return time;
  return "No meeting day/time set";
}

function weekLabel(iso: string): string {
  try {
    const d = new Date(`${iso}T00:00:00Z`);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  } catch {
    return iso;
  }
}
