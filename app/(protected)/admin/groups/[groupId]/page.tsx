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
import { PBadge } from "@/components/pastoral/atoms";
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

const labelStyle: React.CSSProperties = {
  fontFamily: "var(--font-sans)",
  fontSize: 10,
  letterSpacing: 1.6,
  textTransform: "uppercase",
  color: "var(--c-ink3)",
  fontWeight: 600,
};

const bodyTextStyle: React.CSSProperties = {
  fontFamily: "var(--font-body)",
  fontSize: 14,
  color: "var(--c-ink2)",
  lineHeight: 1.5,
};

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
        <div style={{ display: "grid", gap: 18 }}>
          <Link
            href="/admin/groups"
            style={{
              fontFamily: "var(--font-body)",
              fontSize: 12,
              color: "var(--c-ink2)",
              textDecoration: "none",
            }}
          >
            ← Back to groups
          </Link>

          <nav
            role="tablist"
            aria-label="Group detail sections"
            style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
          >
            {TABS.map((t) => {
              const active = t.key === tab;
              return (
                <Link
                  key={t.key}
                  role="tab"
                  aria-selected={active}
                  href={`/admin/groups/${groupId}?tab=${t.key}`}
                  style={{
                    padding: "7px 14px",
                    borderRadius: 999,
                    border: `1px solid ${active ? "var(--c-ink)" : "var(--c-line)"}`,
                    background: active ? "var(--c-ink)" : "transparent",
                    color: active ? "var(--c-surface)" : "var(--c-ink2)",
                    fontFamily: "var(--font-sans)",
                    fontSize: 12,
                    fontWeight: 500,
                    textDecoration: "none",
                  }}
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
    <div style={{ display: "grid", gap: 14 }}>
      {data.statuses === null ? (
        <ErrorNote>
          This group&apos;s status couldn&apos;t be loaded right now — one or
          more reads failed. Retry in a moment or check the database connection.
        </ErrorNote>
      ) : (
        <>
          {/* Four independent labels — shown separately, never combined. */}
          <Card style={{ padding: "16px 18px" }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: 16,
              }}
            >
              <StatusZone label="Lifecycle">
                <PBadge>
                  {lifecycleCategoryLabel(data.statuses.lifecycle)}
                </PBadge>
              </StatusZone>
              <StatusZone label="Setup">
                <PBadge>{setupCategoryLabel(data.statuses.setup)}</PBadge>
              </StatusZone>
              <StatusZone label="Health">
                <PBadge>{healthCategoryLabel(data.statuses.health)}</PBadge>
              </StatusZone>
              <StatusZone label="Capacity">
                <PBadge>{capacityCategoryLabel(data.statuses.capacity)}</PBadge>
              </StatusZone>
            </div>
            {data.stale ? (
              <p style={{ ...bodyTextStyle, fontSize: 12, marginTop: 10 }}>
                Health grade is last-known — the live attendance read was
                unavailable.
              </p>
            ) : null}
          </Card>
        </>
      )}

      <Card style={{ padding: "16px 18px" }}>
        <div style={{ display: "grid", gap: 12 }}>
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
    <div style={{ display: "grid", gap: 14 }}>
      <Card style={{ padding: "16px 18px" }}>
        <div style={{ display: "grid", gap: 10 }}>
          <div style={labelStyle}>Leaders</div>
          {data.leaders === null ? (
            <p role="alert" style={bodyTextStyle}>
              Leaders couldn&apos;t be loaded right now.
            </p>
          ) : data.leaders.length === 0 ? (
            <div style={{ display: "grid", gap: 8 }}>
              <p style={bodyTextStyle}>No leader assigned yet.</p>
              <TabAction href="/admin/people">
                Assign a leader in People →
              </TabAction>
            </div>
          ) : (
            <ul style={listResetStyle}>
              {data.leaders.map((l) => (
                <li key={l.id} style={{ ...bodyTextStyle, marginBottom: 4 }}>
                  {l.name ?? "(unknown)"} ·{" "}
                  {l.isCoLeader ? "Co-Leader" : "Leader"}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      <Card style={{ padding: "16px 18px" }}>
        <div style={{ display: "grid", gap: 10 }}>
          <div style={labelStyle}>
            Active members
            {data.members === null ? "" : ` (${data.members.length})`}
          </div>
          {data.members === null ? (
            <p role="alert" style={bodyTextStyle}>
              Members couldn&apos;t be loaded right now.
            </p>
          ) : data.members.length === 0 ? (
            <div style={{ display: "grid", gap: 8 }}>
              <p style={bodyTextStyle}>No active members on the roster.</p>
              <TabAction href="/admin/people">
                Add a member in People →
              </TabAction>
            </div>
          ) : (
            <ul style={listResetStyle}>
              {data.members.map((m) => (
                <li key={m.id} style={{ ...bodyTextStyle, marginBottom: 4 }}>
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
      <div style={{ display: "grid", gap: 14 }}>
        <ErrorNote>
          The Group-Health Grade couldn&apos;t be loaded right now — a read
          failed. Retry in a moment.
        </ErrorNote>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <Card style={{ padding: "16px 18px" }}>
        <div style={{ display: "grid", gap: 12 }}>
          <StatusZone label={`Group-Health Grade · ${data.period}`}>
            <PBadge>{healthCategoryLabel(data.health)}</PBadge>
          </StatusZone>
          {data.stale ? (
            <p style={{ ...bodyTextStyle, fontSize: 12 }}>
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

      <p style={{ ...bodyTextStyle, fontSize: 13 }}>
        Group health is recomputed live from attendance consistency and the
        admin-entered 1–5 ratings. To edit this group&apos;s ratings, open it
        from the{" "}
        <Link href="/admin/group-health" style={{ color: "var(--c-clay)" }}>
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
    <div style={{ display: "grid", gap: 14 }}>
      <div
        role="note"
        style={{
          background: "var(--c-surface)",
          border: "1px dashed var(--c-line)",
          borderRadius: 10,
          padding: "12px 14px",
          ...bodyTextStyle,
          fontSize: 13,
        }}
      >
        {data.checkInsLive
          ? "Weekly check-ins are currently enabled. The sessions below are the group's recorded attendance history."
          : "Historical attendance, read-only. The weekly check-in flow is paused, so no new attendance is being recorded for this group."}
      </div>

      <Card style={{ padding: "16px 18px" }}>
        {data.sessions === null ? (
          <p role="alert" style={bodyTextStyle}>
            Attendance history couldn&apos;t be loaded right now — a read
            failed.
          </p>
        ) : data.sessions.length === 0 ? (
          <p style={bodyTextStyle}>No attendance sessions on record.</p>
        ) : (
          <ul style={listResetStyle}>
            {data.sessions.map((s) => (
              <li
                key={s.id}
                style={{
                  ...bodyTextStyle,
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  padding: "6px 0",
                  borderTop: "1px solid var(--c-line)",
                }}
              >
                <span>{weekLabel(s.meeting_week)}</span>
                <span style={{ color: "var(--c-ink3)" }}>
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
    <div style={{ display: "grid", gap: 14 }}>
      <Card style={{ padding: "16px 18px" }}>
        {data.followUps === null ? (
          <p role="alert" style={bodyTextStyle}>
            Follow-ups couldn&apos;t be loaded right now — a read failed. This
            is not a confirmation that the group has none.
          </p>
        ) : data.followUps.length === 0 ? (
          <p style={bodyTextStyle}>No open follow-ups for this group.</p>
        ) : (
          <ul style={listResetStyle}>
            {data.followUps.map((f) => (
              <li
                key={f.id}
                style={{
                  padding: "8px 0",
                  borderTop: "1px solid var(--c-line)",
                  display: "grid",
                  gap: 4,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    flexWrap: "wrap",
                  }}
                >
                  <span
                    style={{
                      fontFamily: "var(--font-body)",
                      fontSize: 14,
                      color: "var(--c-ink)",
                      fontWeight: 500,
                    }}
                  >
                    {f.title}
                  </span>
                  <PBadge>{followUpTypeLabel(f.type)}</PBadge>
                  <PBadge>{followUpPriorityLabel(f.priority)}</PBadge>
                </div>
                {f.leader_visible_note ? (
                  <span style={{ ...bodyTextStyle, fontSize: 13 }}>
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
      <div style={{ display: "grid", gap: 14 }}>
        <Card style={{ padding: "16px 18px" }}>
          <p style={bodyTextStyle} role="alert">
            Upcoming meetings are unavailable right now — the calendar read
            failed. Retry in a moment or open the group calendar.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <Card style={{ padding: "16px 18px" }}>
        {data.occurrences.length === 0 ? (
          <p style={bodyTextStyle}>No upcoming meetings or events scheduled.</p>
        ) : (
          <ul style={listResetStyle}>
            {data.occurrences.map((o) => (
              <li
                key={o.overrideId ?? `gen-${o.date}`}
                style={{
                  ...bodyTextStyle,
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  padding: "6px 0",
                  borderTop: "1px solid var(--c-line)",
                }}
              >
                <span>{occurrenceLabel(o)}</span>
                <span style={{ color: "var(--c-ink3)" }}>
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
      style={{
        fontFamily: "var(--font-body)",
        fontSize: 13,
        color: "var(--c-clay)",
        textDecoration: "none",
      }}
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
    <div style={{ display: "grid", gap: 6 }}>
      <span style={labelStyle}>{label}</span>
      <div>{children}</div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "grid", gap: 2 }}>
      <span style={labelStyle}>{label}</span>
      <span style={bodyTextStyle}>{value}</span>
    </div>
  );
}

// A read failed for this tab: say so plainly rather than letting a swallowed
// `?? []` / `?? null` render an empty or misleading state as if authoritative.
function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <Card style={{ padding: "16px 18px" }}>
      <p role="alert" style={{ ...bodyTextStyle, fontSize: 13 }}>
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

const listResetStyle: React.CSSProperties = {
  listStyle: "none",
  padding: 0,
  margin: 0,
};
