"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { memo, useCallback, useMemo, useRef, useState } from "react";
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";
import { ArchiveGroupButton } from "@/components/admin/forms/archive-group-button";
import { GroupCreateForm } from "@/components/admin/forms/group-create-form";
import { GroupEditForm } from "@/components/admin/forms/group-edit-form";
import { RestoreGroupButton } from "@/components/admin/forms/restore-group-button";
import { EditingSurface } from "@/components/lg/admin/editing-surface";
import { PButton } from "@/components/pastoral/button";
import { PBadge, type PTone } from "@/components/pastoral/atoms";
import {
  capacityCategory,
  healthCategory,
  setupCategory,
} from "@/lib/dashboard/group-status";
import {
  capacityCategoryLabel,
  healthCategoryLabel,
  lifecycleCategory,
  lifecycleCategoryLabel,
  setupCategoryLabel,
  type GroupCapacityCategory,
  type GroupHealthCategory,
  type GroupLifecycleCategory,
  type GroupSetupCategory,
} from "@/lib/dashboard/labels";
import { P, fontBody, fontDisplay, fontSans } from "@/lib/pastoral";
import {
  capacityStatus,
  effectiveCapacity,
  effectiveCapacityFullPct,
  effectiveCapacityWarningPct,
  isExcludedFromCapacityMetrics,
  unknownCapacity,
  type MetricDefaults,
} from "@/lib/admin/metrics";
import type { GroupHealthLetter } from "@/types/enums";
import type {
  AttendanceSessionsRow,
  GroupLeadersRow,
  GroupMembershipsRow,
  GroupMetricSettingsRow,
  GroupsRow,
  ProfilesRow,
} from "@/types/database";
import type { AttendanceSessionStatus } from "@/types/enums";

// Each of the four independent status categories carries its own badge tone.
// They are shown as four separate chips — never combined into one (issue #300).
const LIFECYCLE_TONE: Record<GroupLifecycleCategory, PTone> = {
  active: "healthy",
  paused: "pause",
  archived: "neutral",
};

const SETUP_TONE: Record<GroupSetupCategory, PTone> = {
  complete: "healthy",
  needs_setup: "watch",
  needs_leader: "followup",
  missing_meeting: "watch",
};

const HEALTH_TONE: Record<GroupHealthCategory, PTone> = {
  not_assessed: "neutral",
  no_concerns: "healthy",
  needs_attention: "followup",
};

const CAPACITY_TONE: Record<GroupCapacityCategory, PTone> = {
  open: "neutral",
  near_full: "watch",
  full: "followup",
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
  // Group-Health Grade (Q12 computed letter) per group id; absent/null = not
  // assessed. The Health zone reflects this grade, not the health_status enum.
  healthGradesByGroupId: Record<string, GroupHealthLetter | null>;
  // Director-tuned Watch threshold from Settings — a group graded at or below
  // it reads as "Needs attention".
  watchGrade: GroupHealthLetter;
};

// The five list tabs (issue #300). "all" lists every active group; "archived"
// lists closed groups; the three middle tabs are derived attention buckets.
type ListTab =
  | "all"
  | "needs_setup"
  | "needs_health_check"
  | "needs_attention"
  | "archived";

const TABS: { key: ListTab; label: string }[] = [
  { key: "all", label: "All Groups" },
  { key: "needs_setup", label: "Needs Setup" },
  { key: "needs_health_check", label: "Needs Health Check" },
  { key: "needs_attention", label: "Needs Attention" },
  { key: "archived", label: "Archived" },
];

// The four independent status categories for one group, derived from already-
// assembled inputs (ADR 0011: per-surface assembly, reusing shared rules only).
type GroupStatus = {
  lifecycle: GroupLifecycleCategory;
  setup: GroupSetupCategory;
  health: GroupHealthCategory;
  capacity: GroupCapacityCategory;
};

// The one record being edited or created in the shared EditingSurface drawer
// (#266). Editing no longer expands inline beneath a card; both flows open the
// drawer, out of the list, so the list never reflows and its tab + scroll
// state survive the round trip.
type GroupEditorState = { mode: "create" } | { mode: "edit"; group: GroupsRow };

export function GroupsDirectory(props: GroupsDirectoryProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<ListTab>("all");

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

  // Derive the four independent status categories per group once. The capacity
  // leg reuses the shared capacityStatus rule (ADR 0011) rather than re-rolling
  // the threshold math here.
  const statusByGroupId = useMemo(() => {
    const m = new Map<string, GroupStatus>();
    for (const g of props.groups) {
      const override = overrideByGroupId.get(g.id) ?? null;
      const cap = effectiveCapacity(g, override, props.metricDefaults);
      const status = capacityStatus({
        activeMemberCount: activeMemberCountByGroup.get(g.id) ?? 0,
        effectiveCapacity: cap,
        warningPct: effectiveCapacityWarningPct(override, props.metricDefaults),
        fullPct: effectiveCapacityFullPct(props.metricDefaults),
        excluded: isExcludedFromCapacityMetrics(override),
        allowOverCapacity: Boolean(override?.allow_over_capacity),
      });
      m.set(g.id, {
        lifecycle: lifecycleCategory(g.lifecycle_status),
        setup: setupCategory({
          hasLeader: (leadersByGroupId.get(g.id) ?? NO_LEADERS).length > 0,
          meetingDay: g.meeting_day,
          meetingTime: g.meeting_time,
        }),
        health: healthCategory(
          props.healthGradesByGroupId[g.id] ?? null,
          props.watchGrade
        ),
        capacity: capacityCategory(status),
      });
    }
    return m;
  }, [
    props.groups,
    props.metricDefaults,
    props.healthGradesByGroupId,
    props.watchGrade,
    overrideByGroupId,
    activeMemberCountByGroup,
    leadersByGroupId,
  ]);

  // Debounce the text query so the filter + localeCompare sort over the full
  // group list runs once typing settles, not on every keystroke. The input
  // stays bound to `query` so it still feels instant.
  const trimmed = useDebouncedValue(query.trim().toLowerCase(), 150);

  const matchesTab = useCallback(
    (g: GroupsRow): boolean => {
      const s = statusByGroupId.get(g.id);
      if (!s) return false;
      switch (tab) {
        case "all":
          // Every active (non-archived) group.
          return s.lifecycle !== "archived";
        case "needs_setup":
          return s.lifecycle !== "archived" && s.setup !== "complete";
        case "needs_health_check":
          // Group-Health Grade never recorded yet.
          return s.lifecycle !== "archived" && s.health === "not_assessed";
        case "needs_attention":
          // The grade flags a concern.
          return s.lifecycle !== "archived" && s.health === "needs_attention";
        case "archived":
          return s.lifecycle === "archived";
      }
    },
    [tab, statusByGroupId]
  );

  const visible = useMemo(
    () =>
      props.groups
        .filter((g) => {
          if (!matchesTab(g)) return false;
          if (trimmed) {
            const hay =
              `${g.name} ${g.description ?? ""} ${g.location_area ?? ""}`.toLowerCase();
            if (!hay.includes(trimmed)) return false;
          }
          return true;
        })
        .sort((a, b) => a.name.localeCompare(b.name)),
    [props.groups, matchesTab, trimmed]
  );

  const isArchivedTab = tab === "archived";

  return (
    <section style={{ display: "grid", gap: 18 }}>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <PButton type="button" tone="terra" size="sm" onClick={openCreate}>
          New group
        </PButton>
      </div>

      <TabBar tab={tab} onTabChange={setTab} />

      <div
        className="lg-m-filterbar"
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(220px, 1fr)",
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
          onChange={(e) => setQuery(e.target.value)}
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
      </div>

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
          {isArchivedTab
            ? "No archived groups."
            : "No groups match the current tab."}
        </div>
      ) : (
        <ul style={listResetStyle}>
          {visible.map((g) => (
            <li key={g.id} style={{ marginBottom: 14 }}>
              <GroupCard
                group={g}
                status={statusByGroupId.get(g.id)!}
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
// Tab bar
// ---------------------------------------------------------------------------

function TabBar({
  tab,
  onTabChange,
}: {
  tab: ListTab;
  onTabChange: (t: ListTab) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Group list view"
      style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
    >
      {TABS.map((t) => {
        const active = tab === t.key;
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onTabChange(t.key)}
            style={{
              padding: "7px 14px",
              borderRadius: 999,
              border: `1px solid ${active ? P.ink : P.line}`,
              background: active ? P.ink : "transparent",
              color: active ? P.surface : P.ink2,
              fontFamily: fontSans,
              fontSize: 12,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            {t.label}
          </button>
        );
      })}
    </div>
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
// Group card — six labelled zones (issue #300)
// ---------------------------------------------------------------------------

// Zones: Header (name + lifecycle), Setup (leader + setup completeness),
// Health (Group-Health Grade), Capacity (size vs capacity), Meeting (day/time/
// location), Actions (View group). The four status categories show as four
// separate chips, never a combined one.
//
// Memoized so re-renders that don't change a card's props (e.g. each keystroke
// in the debounced search) skip re-rendering every card. Props are referentially
// stable: the lookup maps are memoized and the rows come straight from props.
const GroupCard = memo(function GroupCard({
  group,
  status,
  leaders,
  profilesById,
  activeMemberCount,
  latestSession,
  override,
  defaults,
  onEdit,
}: {
  group: GroupsRow;
  status: GroupStatus;
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
  const isArchived = status.lifecycle === "archived";
  // Repeated row actions (View / Edit / Calendar / Restore) name their group,
  // but group names are not unique in the data model. Append a stable,
  // human-meaningful discriminator — meeting area, else meeting day — so two
  // groups that share a name stay distinguishable to screen-reader users.
  const groupContext =
    group.location_area?.trim() || group.meeting_day?.trim() || null;
  const groupLabel = groupContext
    ? `${group.name} (${groupContext})`
    : group.name;

  const cap = effectiveCapacity(group, override, defaults);
  const isCapacityUnknown = unknownCapacity(group, override, defaults);
  const excluded = isExcludedFromCapacityMetrics(override);

  const leaderText =
    leaders.length === 0
      ? "Unassigned"
      : leaders
          .map((l) => {
            const profile = profilesById.get(l.profile_id);
            if (!profile) return "(unknown)";
            return `${profile.full_name} · ${
              l.role === "co_leader" ? "Co" : "Lead"
            }`;
          })
          .join(" · ");

  return (
    <article
      style={{
        background: P.surface,
        border: `1px solid ${P.line}`,
        borderRadius: 12,
        padding: "18px 22px",
        display: "grid",
        gap: 14,
        opacity: isArchived ? 0.7 : 1,
      }}
    >
      {/* Zone 1 — Header: name + lifecycle (only). The other three categories
          live in their own zones below, so the header never combines them. */}
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
            <PBadge tone={LIFECYCLE_TONE[status.lifecycle]}>
              {lifecycleCategoryLabel(status.lifecycle)}
            </PBadge>
          </div>
        </div>
        {/* Zone 6 — Actions */}
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
            href={`/admin/groups/${group.id}`}
            aria-label={`View ${groupLabel}`}
            style={primaryLinkStyle}
          >
            View group
          </Link>
          {isArchived ? (
            <RestoreGroupButton groupId={group.id} groupName={group.name} />
          ) : (
            <>
              <Link
                href={`/admin/groups/${group.id}/calendar`}
                aria-label={`Open ${groupLabel} calendar`}
                style={secondaryLinkStyle}
              >
                Calendar
              </Link>
              <PButton
                type="button"
                tone="terra"
                size="sm"
                aria-label={`Edit ${groupLabel}`}
                onClick={() => onEdit(group)}
              >
                Edit
              </PButton>
            </>
          )}
        </div>
      </header>

      <div
        className="lg-m-grid-stack"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 14,
        }}
      >
        {/* Zone 2 — Setup: leader + setup completeness */}
        <Zone label="Setup">
          <PBadge tone={SETUP_TONE[status.setup]}>
            {setupCategoryLabel(status.setup)}
          </PBadge>
          <ZoneText>{leaderText}</ZoneText>
        </Zone>

        {/* Zone 3 — Health: the Group-Health Grade (Q12), not care status */}
        <Zone label="Health">
          <PBadge tone={HEALTH_TONE[status.health]}>
            {healthCategoryLabel(status.health)}
          </PBadge>
        </Zone>

        {/* Zone 4 — Capacity: size vs capacity */}
        <Zone label="Capacity">
          <PBadge tone={CAPACITY_TONE[status.capacity]}>
            {capacityCategoryLabel(status.capacity)}
          </PBadge>
          <ZoneText>
            {excluded
              ? "Excluded from capacity"
              : `${activeMemberCount}${
                  isCapacityUnknown ? " / Unknown" : ` / ${cap ?? "—"}`
                } members`}
          </ZoneText>
        </Zone>

        {/* Zone 5 — Meeting: day/time/location */}
        <Zone label="Meeting">
          <ZoneText>{metaLine(group)}</ZoneText>
          <ZoneText muted>{latestCheckinText(latestSession)}</ZoneText>
        </Zone>
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

function Zone({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "grid", gap: 6, alignContent: "start" }}>
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
      {children}
    </div>
  );
}

function ZoneText({
  children,
  muted = false,
}: {
  children: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <div
      style={{
        fontFamily: fontBody,
        fontSize: 13,
        color: muted ? P.ink3 : P.ink2,
        lineHeight: 1.4,
      }}
    >
      {children}
    </div>
  );
}

const primaryLinkStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "6px 12px",
  borderRadius: 8,
  background: P.ink,
  border: `1px solid ${P.ink}`,
  color: P.surface,
  fontFamily: fontBody,
  fontSize: 13,
  textDecoration: "none",
  fontWeight: 500,
};

const secondaryLinkStyle: React.CSSProperties = {
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
};

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
  if (!session) return "No check-in on record";
  const map: Record<AttendanceSessionStatus, string> = {
    submitted: "Submitted",
    not_submitted: "Missing",
    did_not_meet: "Did not meet",
    planned_pause: "Planned pause",
    admin_entered: "Admin entered",
  };
  const label =
    map[session.status as AttendanceSessionStatus] ?? session.status;
  return `Latest check-in: ${label} · ${formatWeek(session.meeting_week)}`;
}

const listResetStyle = { listStyle: "none", padding: 0, margin: 0 } as const;

// Stable empty array so a leaderless group passes the same reference to the
// memoized GroupCard across renders (a fresh `[]` would defeat React.memo).
const NO_LEADERS: GroupLeadersRow[] = [];
