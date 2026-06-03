"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { memo, useCallback, useMemo, useRef, useState } from "react";
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";
import { ArchiveGroupButton } from "@/components/admin/forms/archive-group-button";
import { GroupCreateForm } from "@/components/admin/forms/group-create-form";
import { GroupEditForm } from "@/components/admin/forms/group-edit-form";
import { EditingSurface } from "@/components/lg/admin/editing-surface";
import { MEETING_DAYS_ORDERED } from "@/components/admin/forms/meeting-schedule-options";
import { PButton } from "@/components/pastoral/button";
import { PBadge, type PTone } from "@/components/pastoral/atoms";
import { mapHealthToBadge } from "@/lib/dashboard/badge-map";
import {
  healthStatusLabel,
  lifecycleStatusLabel,
} from "@/lib/dashboard/labels";
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
import type {
  AttendanceSessionStatus,
  GroupLifecycleStatus,
} from "@/types/enums";

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
type HealthFilter =
  | "all"
  | "healthy"
  | "watch"
  | "needs_follow_up"
  | "capacity_full"
  | "needs_leader_support"
  | "healthy_paused"
  | "restart_soon"
  | "overdue_restart";

// The one record being edited or created in the shared EditingSurface drawer
// (#266). Editing no longer expands inline beneath a card; both flows open the
// drawer, out of the list, so the list never reflows and its filter + scroll
// state survive the round trip.
type GroupEditorState = { mode: "create" } | { mode: "edit"; group: GroupsRow };

export function GroupsDirectory(props: GroupsDirectoryProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [lifecycleFilter, setLifecycleFilter] =
    useState<LifecycleFilter>("active");
  const [healthFilter, setHealthFilter] = useState<HealthFilter>("all");
  const [dayFilter, setDayFilter] = useState<string>("all");

  // Which record the drawer is editing/creating, plus two flags the open form
  // reports back: `dirtyRef` (edits pending → warn before discarding) and
  // `submittingRef` (a write in flight → block dismissal until it resolves).
  // Refs, not state, so neither typing nor an in-flight save re-renders the
  // list behind the drawer.
  const [editor, setEditor] = useState<GroupEditorState | null>(null);
  const dirtyRef = useRef(false);
  const submittingRef = useRef(false);

  const openCreate = useCallback(() => {
    dirtyRef.current = false;
    setEditor({ mode: "create" });
  }, []);
  const openEdit = useCallback((group: GroupsRow) => {
    dirtyRef.current = false;
    setEditor({ mode: "edit", group });
  }, []);
  const markDirty = useCallback(() => {
    dirtyRef.current = true;
  }, []);
  const reportPending = useCallback((pending: boolean) => {
    submittingRef.current = pending;
  }, []);
  const requestClose = useCallback(() => {
    // A save/create/archive is in flight: ignore every dismissal route
    // (Escape, overlay, ×, Cancel) so we don't unmount the form mid-write and
    // drop the close+refresh — it auto-closes via onSaved when the write lands.
    if (submittingRef.current) return;
    // Generic wording: the same close path serves both the edit and create
    // flows, and during create there is no group to name yet.
    if (dirtyRef.current && !window.confirm("Discard your unsaved changes?")) {
      return;
    }
    dirtyRef.current = false;
    setEditor(null);
  }, []);
  // Close after a successful save / create / archive and refresh so the list
  // reflects the change immediately (the server action revalidates too).
  const handleSaved = useCallback(() => {
    dirtyRef.current = false;
    submittingRef.current = false;
    setEditor(null);
    router.refresh();
  }, [router]);

  const profilesById = useMemo(
    () => new Map(props.profiles.map((p) => [p.id, p])),
    [props.profiles]
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
    [props.groupMetricSettings]
  );

  // Debounce the text query so the filter + localeCompare sort over the full
  // group list runs once typing settles, not on every keystroke. The input
  // stays bound to `query` so it still feels instant.
  const trimmed = useDebouncedValue(query.trim().toLowerCase(), 150);

  const filterFn = (g: GroupsRow): boolean => {
    if (lifecycleFilter === "active" && g.lifecycle_status === "closed")
      return false;
    if (lifecycleFilter === "closed" && g.lifecycle_status !== "closed")
      return false;
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
      const hay =
        `${g.name} ${g.description ?? ""} ${g.location_area ?? ""}`.toLowerCase();
      if (!hay.includes(trimmed)) return false;
    }
    return true;
  };

  const visible = useMemo(
    () =>
      props.groups
        .filter(filterFn)
        .sort((a, b) => a.name.localeCompare(b.name)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [props.groups, lifecycleFilter, healthFilter, dayFilter, trimmed]
  );

  return (
    <section style={{ display: "grid", gap: 18 }}>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <PButton type="button" tone="terra" size="sm" onClick={openCreate}>
          New group
        </PButton>
      </div>

      <FilterBar
        query={query}
        lifecycleFilter={lifecycleFilter}
        healthFilter={healthFilter}
        dayFilter={dayFilter}
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
        {props.latestWeek
          ? ` · check-in week of ${formatWeek(props.latestWeek)}`
          : ""}
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
                leaders={leadersByGroupId.get(g.id) ?? NO_LEADERS}
                profilesById={profilesById}
                activeMemberCount={activeMemberCountByGroup.get(g.id) ?? 0}
                latestSession={sessionByGroupId.get(g.id) ?? null}
                override={overrideByGroupId.get(g.id) ?? null}
                defaults={props.metricDefaults}
                onEdit={openEdit}
              />
            </li>
          ))}
        </ul>
      )}

      {/* One always-mounted drawer (open toggled) so Radix owns the focus trap
          and focus restore, matching the Group health reference (#259). It
          serves both flows — edit one group, or create a new one. */}
      <GroupEditorDrawer
        editor={editor}
        defaultCapacity={props.metricDefaults.default_group_capacity}
        onDirty={markDirty}
        onPendingChange={reportPending}
        onRequestClose={requestClose}
        onSaved={handleSaved}
      />
    </section>
  );
}

// ---------------------------------------------------------------------------
// Editing drawer (the propagated Editing Pattern, #266)
// ---------------------------------------------------------------------------

function GroupEditorDrawer({
  editor,
  defaultCapacity,
  onDirty,
  onPendingChange,
  onRequestClose,
  onSaved,
}: {
  editor: GroupEditorState | null;
  defaultCapacity: number | null;
  onDirty: () => void;
  onPendingChange: (pending: boolean) => void;
  onRequestClose: () => void;
  onSaved: () => void;
}) {
  const group = editor?.mode === "edit" ? editor.group : null;

  return (
    <EditingSurface
      open={editor !== null}
      onRequestClose={onRequestClose}
      eyebrow={group ? "Edit group" : "New group"}
      title={group ? group.name : "Start a Life Group"}
      description={
        group
          ? "Update this group's details. Saving affects only this group."
          : "Just a name is enough to get started — capacity, day, and leader can be filled in now or later."
      }
      closeLabel={group ? `Close ${group.name} editor` : "Close new group form"}
    >
      {editor?.mode === "edit" ? (
        // Keyed per group so the fields + action state reset when a different
        // group is opened, while the Dialog itself stays mounted.
        <div style={{ display: "grid", gap: 18 }} key={editor.group.id}>
          <GroupEditForm
            group={editor.group}
            onCancel={onRequestClose}
            onDirty={onDirty}
            onPendingChange={onPendingChange}
            onSaved={onSaved}
          />
          <ArchiveSection
            group={editor.group}
            onArchived={onSaved}
            onPendingChange={onPendingChange}
          />
        </div>
      ) : editor?.mode === "create" ? (
        <GroupCreateForm
          defaultCapacity={defaultCapacity}
          onCancel={onRequestClose}
          onDirty={onDirty}
          onPendingChange={onPendingChange}
          onSaved={onSaved}
        />
      ) : null}
    </EditingSurface>
  );
}

// Archiving lives with editing but is deliberately set apart: it takes the
// group off the active roster (a lifecycle move), which is not the same as
// cancelling the edit above — the old inline panel conflated the two.
function ArchiveSection({
  group,
  onArchived,
  onPendingChange,
}: {
  group: GroupsRow;
  onArchived: () => void;
  onPendingChange: (pending: boolean) => void;
}) {
  return (
    <div
      style={{
        display: "grid",
        gap: 10,
        padding: "12px 16px",
        borderRadius: 10,
        border: `1px solid ${P.line}`,
        background: P.surface,
      }}
    >
      <div style={{ display: "grid", gap: 4 }}>
        <span
          style={{
            fontFamily: fontSans,
            fontSize: 10,
            letterSpacing: 1.6,
            textTransform: "uppercase",
            color: P.ink3,
            fontWeight: 600,
          }}
        >
          Lifecycle &middot; separate from edit
        </span>
        <span
          style={{
            fontFamily: fontBody,
            fontSize: 13,
            color: P.ink2,
            lineHeight: 1.45,
          }}
        >
          Archive takes the group off the active roster. The record stays and
          you can restore it later. This is not the same as cancelling your edit
          above.
        </span>
      </div>
      <ArchiveGroupButton
        groupId={group.id}
        groupName={group.name}
        onArchived={onArchived}
        onPendingChange={onPendingChange}
      />
    </div>
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
  onQueryChange,
  onLifecycleFilterChange,
  onHealthFilterChange,
  onDayFilterChange,
}: {
  query: string;
  lifecycleFilter: LifecycleFilter;
  healthFilter: HealthFilter;
  dayFilter: string;
  onQueryChange: (v: string) => void;
  onLifecycleFilterChange: (v: LifecycleFilter) => void;
  onHealthFilterChange: (v: HealthFilter) => void;
  onDayFilterChange: (v: string) => void;
}) {
  return (
    <div
      className="lg-m-filterbar"
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
        className="lg-m-input"
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
        onChange={(e) =>
          onLifecycleFilterChange(e.target.value as LifecycleFilter)
        }
        aria-label="Lifecycle filter"
        style={selectStyle}
      >
        <option value="active">Active</option>
        <option value="closed">Archived</option>
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
        {MEETING_DAYS_ORDERED.map((d) => (
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

// Memoized so that re-renders of the directory that don't change a card's
// props (e.g. each keystroke in the debounced search box, before the filtered
// list settles) skip re-rendering every card. Props are referentially stable:
// the lookup maps are memoized and the group rows come straight from props.
const GroupCard = memo(function GroupCard({
  group,
  leaders,
  profilesById,
  activeMemberCount,
  latestSession,
  override,
  defaults,
  onEdit,
}: {
  group: GroupsRow;
  leaders: GroupLeadersRow[];
  profilesById: Map<string, ProfilesRow>;
  activeMemberCount: number;
  latestSession: AttendanceSessionsRow | null;
  override: GroupMetricSettingsRow | null;
  defaults: MetricDefaults;
  // Opens the shared editing drawer for this group (#266). The card itself
  // stays a read-only row — editing no longer happens inline.
  onEdit: (group: GroupsRow) => void;
}) {
  const isClosed = group.lifecycle_status === "closed";
  // Repeated row actions (Edit / Calendar) name their group, but group names
  // are not unique in the data model. Append a stable, human-meaningful
  // discriminator — meeting area, else meeting day — so two groups that share
  // a name stay distinguishable to screen-reader users (issue 257 review).
  const groupContext =
    group.location_area?.trim() || group.meeting_day?.trim() || null;
  const groupLabel = groupContext
    ? `${group.name} (${groupContext})`
    : group.name;
  const effectiveHealth = effectiveHealthStatus(group, override);
  const cap = effectiveCapacity(group, override, defaults);
  const isCapacityUnknown = unknownCapacity(group, override, defaults);
  const excluded = isExcludedFromCapacityMetrics(override);
  const status = capacityStatus({
    activeMemberCount,
    effectiveCapacity: cap,
    warningPct: effectiveCapacityWarningPct(override, defaults),
    fullPct: effectiveCapacityFullPct(defaults),
    excluded,
    allowOverCapacity: Boolean(override?.allow_over_capacity),
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
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
            justifyContent: "flex-end",
          }}
        >
          <Link
            href={`/admin/groups/${group.id}/calendar`}
            aria-label={`Open ${groupLabel} calendar`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "6px 12px",
              borderRadius: 8,
              background: P.surface,
              border: `1px solid ${P.line}`,
              color: P.ink,
              fontFamily: fontBody,
              fontSize: 13,
              textDecoration: "none",
              fontWeight: 500,
            }}
          >
            Calendar
          </Link>
          {!isClosed ? (
            <PButton
              type="button"
              tone="terra"
              size="sm"
              aria-label={`Edit ${groupLabel}`}
              onClick={() => onEdit(group)}
            >
              Edit
            </PButton>
          ) : null}
        </div>
      </header>

      <div
        className="lg-m-grid-stack"
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
          tone={
            status === "full"
              ? "warn"
              : status === "warning"
                ? "watch"
                : undefined
          }
        />
        <Stat
          label="Latest check-in"
          value={latestCheckinText(latestSession)}
        />
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
});

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "warn" | "watch";
}) {
  const color =
    tone === "warn" ? "#7d3621" : tone === "watch" ? "#7a5118" : P.ink;
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
      <div style={{ fontFamily: fontBody, fontSize: 14, color, marginTop: 2 }}>
        {value}
      </div>
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
  const cadence = cadenceLabel(group);
  if (cadence) parts.push(cadence);
  return parts.length > 0 ? parts.join(" · ") : "No meeting day/time set";
}

function cadenceLabel(group: GroupsRow): string | null {
  if (group.meeting_frequency === "weekly") return null;
  if (group.meeting_frequency === "monthly") return "Monthly";
  // bi-weekly: include parity when known so the line tells the operator
  // which weeks the group actually meets.
  if (group.meeting_week_parity === "odd") return "Bi-weekly · odd weeks";
  if (group.meeting_week_parity === "even") return "Bi-weekly · even weeks";
  return "Bi-weekly";
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
  const label =
    map[session.status as AttendanceSessionStatus] ?? session.status;
  return `${label} · ${formatWeek(session.meeting_week)}`;
}

const listResetStyle = { listStyle: "none", padding: 0, margin: 0 } as const;

// Stable empty array so a leaderless group passes the same reference to the
// memoized GroupCard across renders (a fresh `[]` would defeat React.memo).
const NO_LEADERS: GroupLeadersRow[] = [];
