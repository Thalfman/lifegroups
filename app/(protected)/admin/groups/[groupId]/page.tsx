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

import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader, PageBody } from "@/components/lg/PageHeader";
import { Card } from "@/components/lg/Card";
import { PBadge } from "@/components/pastoral/atoms";
import { requireAdmin } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isFrozenSurfaceLive } from "@/lib/admin/frozen-surface";
import {
  fetchActiveMemberships,
  fetchAllGroupLeaders,
  fetchAttendanceSessions,
  fetchGroupCalendarEvents,
  fetchGroupMetricSettings,
  fetchGroupsByIds,
  fetchMembersByIds,
  fetchOpenFollowUps,
  fetchProfilesForAdmin,
} from "@/lib/supabase/read-models";
import { fetchMetricDefaultsCached } from "@/lib/supabase/cached-config";
import { decodeMetricDefaults } from "@/lib/admin/metrics";
import {
  currentPeriodMonthIso,
  fetchGroupHealthRatings,
  getGroupHealthOverviewForGroup,
} from "@/lib/admin/group-health-read";
import {
  capacityCategoryLabel,
  followUpPriorityLabel,
  followUpTypeLabel,
  healthCategoryLabel,
  lifecycleCategoryLabel,
  lifecycleCategory,
  sessionStatusLabel,
  setupCategoryLabel,
} from "@/lib/dashboard/labels";
import {
  capacityCategory,
  healthCategory,
  setupCategory,
} from "@/lib/dashboard/group-status";
import {
  capacityStatus,
  effectiveCapacity,
  effectiveCapacityFullPct,
  effectiveCapacityWarningPct,
  isExcludedFromCapacityMetrics,
} from "@/lib/admin/metrics";
import {
  generateOccurrencesInRange,
  mergeOverrides,
  toSavedOverrides,
  type ResolvedOccurrence,
} from "@/lib/calendar/occurrences";
import { churchTodayIso } from "@/lib/shared/church-time";
import type { GroupsRow } from "@/types/database";
import type { AttendanceSessionStatus, GroupHealthLetter } from "@/types/enums";

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
  const tab = resolveTab(search.tab);

  await requireAdmin();

  const client = await createSupabaseServerClient();
  if (!client) notFound();

  const groupResult = await fetchGroupsByIds(client, [groupId]);
  if (groupResult.error) throw groupResult.error;
  const group = (groupResult.data ?? [])[0] as GroupsRow | undefined;
  if (!group) notFound();

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

          {tab === "overview" ? (
            <OverviewTab group={group} groupId={groupId} />
          ) : null}
          {tab === "people" ? <PeopleTab groupId={groupId} /> : null}
          {tab === "health" ? <HealthTab groupId={groupId} /> : null}
          {tab === "attendance" ? <AttendanceTab groupId={groupId} /> : null}
          {tab === "follow-ups" ? <FollowUpsTab groupId={groupId} /> : null}
          {tab === "events" ? (
            <EventsTab groupId={groupId} group={group} />
          ) : null}
        </div>
      </PageBody>
    </>
  );
}

// --- Overview: the four independent status labels + meeting details ---------

async function OverviewTab({
  group,
  groupId,
}: {
  group: GroupsRow;
  groupId: string;
}) {
  const client = await createSupabaseServerClient();
  if (!client) return null;

  const [leadersRes, membershipsRes, defaultsRes, healthRes, overrideRes] =
    await Promise.all([
      fetchAllGroupLeaders(client, { activeOnly: true }),
      fetchActiveMemberships(client, { groupId }),
      fetchMetricDefaultsCached(client),
      // Targeted single-group health read (#308): runs the same grade
      // computation as the bulk overview but only for this group, so opening
      // one detail page no longer recomputes every active group.
      getGroupHealthOverviewForGroup(client, groupId, currentPeriodMonthIso()),
      // Per-group metric overrides — resolved the SAME way the Groups list and
      // Settings do (defaults → per-group override precedence, ADR 0011) so the
      // detail capacity zone can't disagree with the list card for this group.
      fetchGroupMetricSettings(client, groupId),
    ]);

  const defaults = decodeMetricDefaults(defaultsRes.data ?? null);
  const override = overrideRes.data ?? null;
  const hasLeader = (leadersRes.data ?? []).some(
    (l) => l.group_id === groupId && l.active
  );
  const memberCount = (membershipsRes.data ?? []).length;
  const grade: GroupHealthLetter | null =
    healthRes.data?.computed_letter ?? null;

  const cap = effectiveCapacity(group, override, defaults);
  const status = capacityStatus({
    activeMemberCount: memberCount,
    effectiveCapacity: cap,
    warningPct: effectiveCapacityWarningPct(override, defaults),
    fullPct: effectiveCapacityFullPct(defaults),
    excluded: isExcludedFromCapacityMetrics(override),
    allowOverCapacity: Boolean(override?.allow_over_capacity),
  });

  const lifecycle = lifecycleCategory(group.lifecycle_status);
  const setup = setupCategory({
    hasLeader,
    meetingDay: group.meeting_day,
    meetingTime: group.meeting_time,
    // Same resolved capacity the zone shows; null keeps the group in Needs Setup.
    effectiveCapacity: cap,
  });
  const health = healthCategory(grade, defaults.group_health_watch_grade);
  const capacity = capacityCategory(status);

  // The four labels are only trustworthy if every read that feeds them
  // succeeded. On a failure, fail closed with a notice rather than rendering
  // a confidently-wrong "Not assessed" / "Needs leader" / "Open" status.
  const statusError =
    leadersRes.error ||
    membershipsRes.error ||
    defaultsRes.error ||
    overrideRes.error ||
    healthRes.error;
  // The live attendance read fell back to the last-saved grade — show the grade
  // but mark it so the letter isn't mistaken for a current reading.
  const stale = healthRes.data?.stale ?? false;

  return (
    <div style={{ display: "grid", gap: 14 }}>
      {statusError ? (
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
                <PBadge>{lifecycleCategoryLabel(lifecycle)}</PBadge>
              </StatusZone>
              <StatusZone label="Setup">
                <PBadge>{setupCategoryLabel(setup)}</PBadge>
              </StatusZone>
              <StatusZone label="Health">
                <PBadge>{healthCategoryLabel(health)}</PBadge>
              </StatusZone>
              <StatusZone label="Capacity">
                <PBadge>{capacityCategoryLabel(capacity)}</PBadge>
              </StatusZone>
            </div>
            {stale ? (
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
            value={membershipsRes.error ? "—" : `${memberCount}`}
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

      <Link
        href={`/admin/groups/${groupId}/calendar`}
        style={{
          fontFamily: "var(--font-body)",
          fontSize: 13,
          color: "var(--c-clay)",
        }}
      >
        Open the group calendar →
      </Link>
    </div>
  );
}

// --- People: leaders + active members (read-only roster) --------------------

async function PeopleTab({ groupId }: { groupId: string }) {
  const client = await createSupabaseServerClient();
  if (!client) return null;

  const [leadersRes, profilesRes, membershipsRes] = await Promise.all([
    fetchAllGroupLeaders(client, { activeOnly: true }),
    fetchProfilesForAdmin(client, { roles: ["leader", "co_leader"] }),
    fetchActiveMemberships(client, { groupId }),
  ]);

  const profilesById = new Map((profilesRes.data ?? []).map((p) => [p.id, p]));
  const leaders = (leadersRes.data ?? []).filter(
    (l) => l.group_id === groupId && l.active
  );
  const memberIds = (membershipsRes.data ?? []).map((m) => m.member_id);
  const membersRes = await fetchMembersByIds(client, memberIds);
  // An active group_memberships link does not guarantee the member record is
  // still active (a deactivated member's link may not have been cleaned up), so
  // filter on members.status — matching the other roster surfaces — to avoid
  // overstating the active roster.
  const members = (membersRes.data ?? [])
    .filter((m) => m.status === "active")
    .sort((a, b) => a.full_name.localeCompare(b.full_name));

  // Fail closed per section: a failed read must not render an empty roster as
  // if authoritative (leader names come from the profiles read).
  const leadersError = leadersRes.error || profilesRes.error;
  const membersError = membershipsRes.error || membersRes.error;

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <Card style={{ padding: "16px 18px" }}>
        <div style={{ display: "grid", gap: 10 }}>
          <div style={labelStyle}>Leaders</div>
          {leadersError ? (
            <p role="alert" style={bodyTextStyle}>
              Leaders couldn&apos;t be loaded right now.
            </p>
          ) : leaders.length === 0 ? (
            <p style={bodyTextStyle}>No leader assigned yet.</p>
          ) : (
            <ul style={listResetStyle}>
              {leaders.map((l) => {
                const profile = profilesById.get(l.profile_id);
                return (
                  <li key={l.id} style={{ ...bodyTextStyle, marginBottom: 4 }}>
                    {profile?.full_name ?? "(unknown)"} ·{" "}
                    {l.role === "co_leader" ? "Co-Leader" : "Leader"}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Card>

      <Card style={{ padding: "16px 18px" }}>
        <div style={{ display: "grid", gap: 10 }}>
          <div style={labelStyle}>
            Active members{membersError ? "" : ` (${members.length})`}
          </div>
          {membersError ? (
            <p role="alert" style={bodyTextStyle}>
              Members couldn&apos;t be loaded right now.
            </p>
          ) : members.length === 0 ? (
            <p style={bodyTextStyle}>No active members on the roster.</p>
          ) : (
            <ul style={listResetStyle}>
              {members.map((m) => (
                <li key={m.id} style={{ ...bodyTextStyle, marginBottom: 4 }}>
                  {m.full_name}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>
    </div>
  );
}

// --- Health: the Group-Health Grade (Q12), folded in from Group Health ------

async function HealthTab({ groupId }: { groupId: string }) {
  const client = await createSupabaseServerClient();
  if (!client) return null;

  const period = currentPeriodMonthIso();
  const [overviewRes, ratingsRes, defaultsRes] = await Promise.all([
    // Single-group health read (#308) — same grade logic, O(1) reads.
    getGroupHealthOverviewForGroup(client, groupId, period),
    fetchGroupHealthRatings(client, groupId, period),
    fetchMetricDefaultsCached(client),
  ]);

  const row = overviewRes.data ?? null;
  const ratings = ratingsRes.data;
  const watchGrade = decodeMetricDefaults(
    defaultsRes.data ?? null
  ).group_health_watch_grade;
  const grade = row?.computed_letter ?? null;
  const health = healthCategory(grade, watchGrade);
  // Fail closed: a failed health/ratings read must not masquerade as a genuine
  // "Not assessed" / "Not rated" grade.
  const healthError = overviewRes.error || ratingsRes.error || defaultsRes.error;
  const stale = row?.stale ?? false;

  if (healthError) {
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
          <StatusZone label={`Group-Health Grade · ${period}`}>
            <PBadge>{healthCategoryLabel(health)}</PBadge>
          </StatusZone>
          {stale ? (
            <p style={{ ...bodyTextStyle, fontSize: 12 }}>
              Grade is last-known — the live attendance read was unavailable.
            </p>
          ) : null}
          <DetailRow label="Grade" value={grade ?? "Not assessed"} />
          <DetailRow
            label="Attendance (8-wk avg)"
            value={
              row && row.attendance_pct !== null
                ? `${Math.round(row.attendance_pct)}% (${row.attendance_weeks_counted} wk)`
                : "—"
            }
          />
          <DetailRow
            label="Spiritual-growth rating"
            value={ratings?.spiritual_growth_score?.toString() ?? "Not rated"}
          />
          <DetailRow
            label="Group-question rating"
            value={ratings?.group_question_score?.toString() ?? "Not rated"}
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

async function AttendanceTab({ groupId }: { groupId: string }) {
  const client = await createSupabaseServerClient();
  if (!client) return null;

  // The check-in flow is frozen (ADR 0002/0009): attendance_sessions receive no
  // new data unless a Super Admin re-enables check-ins via the runtime flag. We
  // surface what's on record as explicitly historical and never frame it as a
  // live feed.
  const [sessionsRes, checkInsLive] = await Promise.all([
    fetchAttendanceSessions(client, { groupId, limit: 12 }),
    isFrozenSurfaceLive("check_ins"),
  ]);
  const sessions = sessionsRes.data ?? [];

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
        {checkInsLive
          ? "Weekly check-ins are currently enabled. The sessions below are the group's recorded attendance history."
          : "Historical attendance, read-only. The weekly check-in flow is paused, so no new attendance is being recorded for this group."}
      </div>

      <Card style={{ padding: "16px 18px" }}>
        {sessionsRes.error ? (
          <p role="alert" style={bodyTextStyle}>
            Attendance history couldn&apos;t be loaded right now — a read failed.
          </p>
        ) : sessions.length === 0 ? (
          <p style={bodyTextStyle}>No attendance sessions on record.</p>
        ) : (
          <ul style={listResetStyle}>
            {sessions.map((s) => (
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
    </div>
  );
}

// --- Follow-ups: open follow-ups related to this group ----------------------

async function FollowUpsTab({ groupId }: { groupId: string }) {
  const client = await createSupabaseServerClient();
  if (!client) return null;

  const followUpsRes = await fetchOpenFollowUps(client, { groupId });
  const followUps = followUpsRes.data ?? [];

  return (
    <Card style={{ padding: "16px 18px" }}>
      {followUpsRes.error ? (
        <p role="alert" style={bodyTextStyle}>
          Follow-ups couldn&apos;t be loaded right now — a read failed. This is
          not a confirmation that the group has none.
        </p>
      ) : followUps.length === 0 ? (
        <p style={bodyTextStyle}>No open follow-ups for this group.</p>
      ) : (
        <ul style={listResetStyle}>
          {followUps.map((f) => (
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
  );
}

// --- Events: upcoming calendar events for this group ------------------------

// How far ahead the Events tab lists upcoming scheduled meetings. Groups on the
// normal recurring schedule have no saved override rows, so a plain row read
// returns nothing even though meetings are coming up; like the calendar surface,
// we GENERATE occurrences from the group's schedule for this window so the tab
// matches what the full calendar shows.
const EVENTS_LOOKAHEAD_DAYS = 56; // ~8 weeks

async function EventsTab({
  groupId,
  group,
}: {
  groupId: string;
  group: GroupsRow;
}) {
  const client = await createSupabaseServerClient();
  if (!client) return null;

  const todayIso = churchTodayIso();
  const toIso = addDaysIso(todayIso, EVENTS_LOOKAHEAD_DAYS);

  // Pull the saved override rows over the same window so generated occurrences
  // pick up any per-date changes (cancelled, retyped, retitled) — the calendar
  // page merges the two the identical way (read-only here; no writes per ADR
  // 0009).
  const eventsRes = await fetchGroupCalendarEvents(client, {
    groupId,
    fromDate: todayIso,
    toDate: toIso,
  });

  // Fail closed if the override read failed: without it we cannot tell which
  // generated occurrences were cancelled / retyped / retitled, so showing the
  // un-overridden schedule would present stale dates as live meetings. Surface
  // the failure instead of guessing.
  if (eventsRes.error) {
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
  const events = eventsRes.data ?? [];

  // Reuse the calendar's occurrence-generation + override-merge helpers rather
  // than duplicating the cadence logic. Generated meetings from the group's
  // recurring schedule are surfaced even when no override row exists.
  const generated = generateOccurrencesInRange(
    {
      meetingDay: group.meeting_day,
      meetingTime: group.meeting_time,
      meetingFrequency: group.meeting_frequency,
      meetingWeekParity: group.meeting_week_parity,
    },
    todayIso,
    toIso
  );
  const resolved = mergeOverrides(
    generated,
    toSavedOverrides(events),
    group.meeting_time
  );

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <Card style={{ padding: "16px 18px" }}>
        {resolved.length === 0 ? (
          <p style={bodyTextStyle}>No upcoming meetings or events scheduled.</p>
        ) : (
          <ul style={listResetStyle}>
            {resolved.map((o) => (
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
      <Link
        href={`/admin/groups/${groupId}/calendar`}
        style={{
          fontFamily: "var(--font-body)",
          fontSize: 13,
          color: "var(--c-clay)",
        }}
      >
        Open the full calendar for {group.name} →
      </Link>
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

// Add a whole number of days to a YYYY-MM-DD date, UTC-anchored to avoid
// runtime-timezone drift (the calendar's own range helpers do the same).
function addDaysIso(iso: string, days: number): string {
  const anchor = new Date(`${iso}T00:00:00Z`);
  anchor.setUTCDate(anchor.getUTCDate() + days);
  return anchor.toISOString().slice(0, 10);
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
