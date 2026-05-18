"use client";

import { useMemo, useState } from "react";
import { CloseGroupButton } from "@/components/admin/forms/close-group-button";
import { EditGroupToggle } from "@/components/admin/forms/group-edit-form";
import { PBadge, type PTone } from "@/components/pastoral/atoms";
import { mapHealthToBadge } from "@/lib/dashboard/badge-map";
import { healthStatusLabel, lifecycleStatusLabel } from "@/lib/dashboard/labels";
import { P, fontBody, fontDisplay, fontSans } from "@/lib/pastoral";
import {
  capacityStatus,
  effectiveCapacity,
  effectiveCapacityFullPct,
  effectiveCapacityWarningPct,
  effectiveHealthStatus,
  isExcludedFromCapacityMetrics,
  unknownCapacity,
  type MetricDefaults,
} from "@/lib/admin/metrics";
import type {
  AttendanceSessionsRow,
  GroupLeadersRow,
  GroupMembershipsRow,
  GroupMetricSettingsRow,
  GroupsRow,
  ProfilesRow,
} from "@/types/database";
import type { AttendanceSessionStatus, GroupLifecycleStatus } from "@/types/enums";

const LIFECYCLE_TONE: Record<GroupLifecycleStatus, PTone> = {
  active: "healthy",
  planned_pause: "pause",
  seasonal_break: "pause",
  launching_soon: "watch",
  needs_leader: "followup",
  at_risk: "followup",
  closed: "neutral",
};

type GroupsDirectoryProps = {
  groups: GroupsRow[];
  groupLeaders: GroupLeadersRow[];
  profiles: ProfilesRow[];
  memberships: GroupMembershipsRow[];
  latestSessions: AttendanceSessionsRow[]; // for the week represented by `latestWeek`
  latestWeek: string | null;
  metricDefaults: MetricDefaults;
  groupMetricSettings: GroupMetricSettingsRow[];
};

type LifecycleFilter = "all" | "active" | "closed";
type HealthFilter = "all" | "healthy" | "watch" | "needs_follow_up" | "capacity_full" | "needs_leader_support" | "healthy_paused" | "restart_soon" | "overdue_restart";

export function GroupsDirectory(props: GroupsDirectoryProps) {
  const [query, setQuery] = useState("");
  const [lifecycleFilter, setLifecycleFilter] = useState<LifecycleFilter>("active");
  const [healthFilter, setHealthFilter] = useState<HealthFilter>("all");
  const [dayFilter, setDayFilter] = useState<string>("all");

  const profilesById = useMemo(
    () => new Map(props.profiles.map((p) => [p.id, p])),
    [props.profiles],
  );

  const leadersByGroupId = useMemo(() => {
    const m = new Map<string, GroupLeadersRow[]>();
    for (const link of props.groupLeaders) {
      if (!link.active) continue;
      const arr = m.get(link.group_id) ?? [];
      arr.push(link);
      m.set(link.group_id, arr);
    }
    return m;
  }, [props.groupLeaders]);

  const activeMemberCountByGroup = useMemo(() => {
    const m = new Map<string, number>();
    for (const link of props.memberships) {
      m.set(link.group_id, (m.get(link.group_id) ?? 0) + 1);
    }
    return m;
  }, [props.memberships]);

  const sessionByGroupId = useMemo(() => {
    const m = new Map<string, AttendanceSessionsRow>();
    for (const s of props.latestSessions) {
      m.set(s.group_id, s);
    }
    return m;
  }, [props.latestSessions]);

  const overrideByGroupId = useMemo(
    () => new Map(props.groupMetricSettings.map((s) => [s.group_id, s])),
    [props.groupMetricSettings],
  );

  const dayOptions = useMemo(() => {
    const set = new Set<string>();
    for (const g of props.groups) {
      const d = g.meeting_day?.trim();
      if (d) set.add(d);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [props.groups]);

  const trimmed = query.trim().toLowerCase();

  const filterFn = (g: GroupsRow): boolean => {
    if (lifecycleFilter === "active" && g.lifecycle_status === "closed") return false;
    if (lifecycleFilter === "closed" && g.lifecycle_status !== "closed") return false;
    if (healthFilter !== "all") {
      const override = overrideByGroupId.get(g.id) ?? null;
      const effective = effectiveHealthStatus(g, override);
      if (effective !== healthFilter) return false;
    }
    if (dayFilter !== "all") {
      const d = g.meeting_day?.trim() ?? "";
      if (d !== dayFilter) return false;
    }
    if (trimmed) {
      const hay = `${g.name} ${g.description ?? ""} ${g.location_area ?? ""}`.toLowerCase();
      if (!hay.includes(trimmed)) return false;
    }
    return true;
  };

  const visible = useMemo(
    () => props.groups.filter(filterFn).sort((a, b) => a.name.localeCompare(b.name)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [props.groups, lifecycleFilter, healthFilter, dayFilter, trimmed],
  );

  return (
    <section style={{ display: "grid", gap: 18 }}>
      <FilterBar
        query={query}
        lifecycleFilter={lifecycleFilter}
        healthFilter={healthFilter}
        dayFilter={dayFilter}
        dayOptions={dayOptions}
        onQueryChange={setQuery}
        onLifecycleFilterChange={setLifecycleFilter}
        onHealthFilterChange={setHealthFilter}
        onDayFilterChange={setDayFilter}
      />

      <div
        style={{
          fontFamily: fontSans,
          fontSize: 11,
          color: P.ink3,
          textAlign: "right",
        }}
      >
        {visible.length} group{visible.length === 1 ? "" : "s"} shown
        {props.latestWeek ? ` · check-in week of ${formatWeek(props.latestWeek)}` : ""}
      </div>

      {visible.length === 0 ? (
        <div
          style={{
            background: P.surface,
            border: `1px dashed ${P.line}`,
            borderRadius: 10,
            padding: "22px 24px",
            textAlign: "center",
            fontFamily: fontBody,
            fontSize: 13,
            color: P.ink2,
          }}
        >
          No groups match the current filters.
        </div>
      ) : (
        <ul style={listResetStyle}>
          {visible.map((g) => (
            <li key={g.id} style={{ marginBottom: 14 }}>
              <GroupCard
                group={g}
                leaders={leadersByGroupId.get(g.id) ?? []}
                profilesById={profilesById}
                activeMemberCount={activeMemberCountByGroup.get(g.id) ?? 0}
                latestSession={sessionByGroupId.get(g.id) ?? null}
                override={overrideByGroupId.get(g.id) ?? null}
                defaults={props.metricDefaults}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Filter bar
// ---------------------------------------------------------------------------

function FilterBar({
  query,
  lifecycleFilter,
  healthFilter,
  dayFilter,
  dayOptions,
  onQueryChange,
  onLifecycleFilterChange,
  onHealthFilterChange,
  onDayFilterChange,
}: {
  query: string;
  lifecycleFilter: LifecycleFilter;
  healthFilter: HealthFilter;
  dayFilter: string;
  dayOptions: string[];
  onQueryChange: (v: string) => void;
  onLifecycleFilterChange: (v: LifecycleFilter) => void;
  onHealthFilterChange: (v: HealthFilter) => void;
  onDayFilterChange: (v: string) => void;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(220px, 1fr) repeat(3, auto)",
        gap: 12,
        alignItems: "center",
        background: P.surface,
        border: `1px solid ${P.line}`,
        borderRadius: 10,
        padding: "12px 14px",
      }}
    >
      <input
        type="search"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder="Search by name, description, location…"
        aria-label="Search groups"
        style={{
          padding: "10px 12px",
          borderRadius: 8,
          border: `1px solid ${P.line}`,
          background: P.bg,
          fontFamily: fontBody,
          fontSize: 14,
          color: P.ink,
          outline: "none",
        }}
      />
      <select
        value={lifecycleFilter}
        onChange={(e) => onLifecycleFilterChange(e.target.value as LifecycleFilter)}
        aria-label="Lifecycle filter"
        style={selectStyle}
      >
        <option value="active">Active</option>
        <option value="closed">Closed</option>
        <option value="all">All lifecycle</option>
      </select>
      <select
        value={healthFilter}
        onChange={(e) => onHealthFilterChange(e.target.value as HealthFilter)}
        aria-label="Health filter"
        style={selectStyle}
      >
        <option value="all">All health</option>
        <option value="healthy">Healthy</option>
        <option value="watch">Watch</option>
        <option value="needs_follow_up">Needs follow-up</option>
        <option value="capacity_full">Capacity full</option>
        <option value="needs_leader_support">Needs leader support</option>
        <option value="healthy_paused">Healthy (paused)</option>
        <option value="restart_soon">Restart soon</option>
        <option value="overdue_restart">Overdue restart</option>
      </select>
      <select
        value={dayFilter}
        onChange={(e) => onDayFilterChange(e.target.value)}
        aria-label="Meeting day filter"
        style={selectStyle}
      >
        <option value="all">Any day</option>
        {dayOptions.map((d) => (
          <option key={d} value={d}>
            {d}
          </option>
        ))}
      </select>
    </div>
  );
}

const selectStyle = {
  padding: "10px 12px",
  borderRadius: 8,
  border: `1px solid ${P.line}`,
  background: P.bg,
  fontFamily: fontBody,
  fontSize: 13,
  color: P.ink,
  outline: "none",
} as const;

// ---------------------------------------------------------------------------
// Group card
// ---------------------------------------------------------------------------

function GroupCard({
  group,
  leaders,
  profilesById,
  activeMemberCount,
  latestSession,
  override,
  defaults,
}: {
  group: GroupsRow;
  leaders: GroupLeadersRow[];
  profilesById: Map<string, ProfilesRow>;
  activeMemberCount: number;
  latestSession: AttendanceSessionsRow | null;
  override: GroupMetricSettingsRow | null;
  defaults: MetricDefaults;
}) {
  const isClosed = group.lifecycle_status === "closed";
  const effectiveHealth = effectiveHealthStatus(group, override);
  const cap = effectiveCapacity(group, override, defaults);
  const isCapacityUnknown = unknownCapacity(group, override);
  const excluded = isExcludedFromCapacityMetrics(override);
  const status = capacityStatus({
    activeMemberCount,
    effectiveCapacity: cap,
    warningPct: effectiveCapacityWarningPct(override, defaults),
    fullPct: effectiveCapacityFullPct(defaults),
    excluded,
  });

  const lifecycleTone = LIFECYCLE_TONE[group.lifecycle_status];
  const lifecycleLabel = lifecycleStatusLabel(group.lifecycle_status);
  const healthBadge = mapHealthToBadge(effectiveHealth);
  const healthLabel = healthStatusLabel(effectiveHealth);

  return (
    <article
      style={{
        background: P.surface,
        border: `1px solid ${P.line}`,
        borderRadius: 12,
        padding: "18px 22px",
        display: "grid",
        gap: 14,
        opacity: isClosed ? 0.7 : 1,
      }}
    >
      <header
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) auto",
          gap: 12,
          alignItems: "start",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: 8,
            }}
          >
            <h3
              style={{
                margin: 0,
                fontFamily: fontDisplay,
                fontSize: 20,
                fontWeight: 500,
                color: P.ink,
                letterSpacing: -0.3,
              }}
            >
              {group.name}
            </h3>
            <PBadge tone={lifecycleTone}>{lifecycleLabel}</PBadge>
            <PBadge tone={healthBadge.tone}>
              {override?.manual_health_status_override
                ? `${healthLabel} (manual)`
                : healthLabel}
            </PBadge>
            {excluded ? (
              <PBadge tone="followup">Excluded from capacity</PBadge>
            ) : null}
          </div>
          <div
            style={{
              fontFamily: fontBody,
              fontSize: 13,
              color: P.ink3,
              marginTop: 4,
            }}
          >
            {metaLine(group)}
          </div>
        </div>
        {!isClosed ? (
          <div
            style={{
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              justifyContent: "flex-end",
            }}
          >
            <EditGroupToggle group={group} />
            <CloseGroupButton groupId={group.id} groupName={group.name} />
          </div>
        ) : null}
      </header>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: 14,
          fontFamily: fontBody,
          fontSize: 13,
          color: P.ink2,
        }}
      >
        <Stat
          label="Leaders"
          value={
            leaders.length === 0
              ? "Unassigned"
              : leaders
                  .map((l) => {
                    const profile = profilesById.get(l.profile_id);
                    if (!profile) return "(unknown)";
                    return `${profile.full_name} · ${l.role === "co_leader" ? "Co" : "Lead"}`;
                  })
                  .join(" · ")
          }
        />
        <Stat
          label="Active members"
          value={`${activeMemberCount}${
            isCapacityUnknown ? " / Unknown" : ` / ${cap ?? "—"}`
          }`}
          tone={status === "full" ? "warn" : status === "warning" ? "watch" : undefined}
        />
        <Stat label="Latest check-in" value={latestCheckinText(latestSession)} />
      </div>

      {group.description ? (
        <p
          style={{
            margin: 0,
            fontFamily: fontBody,
            fontSize: 13,
            color: P.ink2,
            lineHeight: 1.5,
          }}
        >
          {group.description}
        </p>
      ) : null}
    </article>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "warn" | "watch";
}) {
  const color = tone === "warn" ? "#7d3621" : tone === "watch" ? "#7a5118" : P.ink;
  return (
    <div>
      <div
        style={{
          fontFamily: fontSans,
          fontSize: 10,
          letterSpacing: 1.6,
          textTransform: "uppercase",
          color: P.ink3,
          fontWeight: 600,
        }}
      >
        {label}
      </div>
      <div style={{ fontFamily: fontBody, fontSize: 14, color, marginTop: 2 }}>{value}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function metaLine(group: GroupsRow): string {
  const parts: string[] = [];
  if (group.location_area) parts.push(group.location_area);
  const day = group.meeting_day?.trim();
  const time = formatMeetingTime(group.meeting_time);
  if (day && time) parts.push(`${day} · ${time}`);
  else if (day) parts.push(day);
  else if (time) parts.push(time);
  return parts.length > 0 ? parts.join(" · ") : "No meeting day/time set";
}

function formatMeetingTime(value: string | null): string | null {
  if (!value) return null;
  const match = /^(\d{2}):(\d{2})/.exec(value);
  if (!match) return value;
  const hour = Number.parseInt(match[1], 10);
  const minute = match[2];
  const suffix = hour >= 12 ? "p" : "a";
  const display = ((hour + 11) % 12) + 1;
  return `${display}:${minute}${suffix}`;
}

function formatWeek(iso: string): string {
  try {
    const d = new Date(`${iso}T00:00:00Z`);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  } catch {
    return iso;
  }
}

function latestCheckinText(session: AttendanceSessionsRow | null): string {
  if (!session) return "Not submitted";
  const map: Record<AttendanceSessionStatus, string> = {
    submitted: "Submitted",
    not_submitted: "Missing",
    did_not_meet: "Did not meet",
    planned_pause: "Planned pause",
    admin_entered: "Admin entered",
  };
  const label = map[session.status as AttendanceSessionStatus] ?? session.status;
  return `${label} · ${formatWeek(session.meeting_week)}`;
}

const listResetStyle = { listStyle: "none", padding: 0, margin: 0 } as const;
