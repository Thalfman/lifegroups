"use client";

import { useMemo, useState } from "react";
import { usePersistedViewState } from "@/lib/hooks/use-persisted-view-state";
import { SectionHeader } from "@/components/layout/shell";
import { EditingSurface } from "@/components/lg/admin/editing-surface";
import { useEditingDrawer } from "@/components/lg/admin/use-editing-drawer";
import { P, fontBody, fontDisplay, fontSans } from "@/lib/pastoral";
import {
  followUpPriorityLabel,
  followUpTypeLabel,
} from "@/lib/dashboard/labels";
import { PBadge } from "@/components/pastoral/atoms";
import { PButton } from "@/components/pastoral/button";
import type { GroupsRow, MembersRow, ProfilesRow } from "@/types/database";
import type { FollowUpPriority, FollowUpStatus } from "@/types/enums";
import type {
  AdminFollowUpEntry,
  GuestDirectoryEntry,
} from "@/lib/supabase/read-models";
import { FollowUpCreateForm } from "./follow-up-create-form";
import { FollowUpStatusControls } from "./follow-up-status-controls";
import {
  errorTextStyle,
  fieldInputStyle,
  fieldLabelStyle,
  fieldSelectStyle,
} from "@/components/admin/forms/field-styles";

export type AdminFollowUpsData = {
  followUps: AdminFollowUpEntry[];
  groups: GroupsRow[];
  members: MembersRow[];
  guests: GuestDirectoryEntry[];
  assigneeProfiles: ProfilesRow[];
  errors: {
    followUps: string | null;
    groups: string | null;
    members: string | null;
    guests: string | null;
    profiles: string | null;
  };
};

const STATUS_ORDER: FollowUpStatus[] = [
  "open",
  "in_progress",
  "snoozed",
  "done",
];

const STATUS_LABEL: Record<FollowUpStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  snoozed: "Snoozed",
  done: "Done",
};

const PRIORITY_FILTERS: { value: "all" | FollowUpPriority; label: string }[] = [
  { value: "all", label: "Any priority" },
  { value: "high", label: "High" },
  { value: "normal", label: "Normal" },
  { value: "low", label: "Low" },
];

const DUE_FILTERS: { value: DueFilter; label: string }[] = [
  { value: "all", label: "Any due date" },
  { value: "overdue", label: "Overdue" },
  { value: "this_week", label: "Due this week" },
  { value: "no_due_date", label: "No due date" },
];

type DueFilter = "all" | "overdue" | "this_week" | "no_due_date";

// The surface leads with open work, so the status filter defaults to "active"
// (everything not yet done). "all" shows every status; a single status narrows
// to it.
type StatusFilter = "active" | "all" | FollowUpStatus;

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "active", label: "Open items" },
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In progress" },
  { value: "snoozed", label: "Snoozed" },
  { value: "done", label: "Done" },
  { value: "all", label: "All statuses" },
];

// Saved views & filters (PRD req 12, #263): the persisted shape for this
// surface. Group/guest/assignee filters are free-form ids ("all" or a uuid),
// so they validate as plain strings — a stale id simply matches nothing and
// the list shows its empty state, the same as a no-match live filter.
type FollowUpsViewSnapshot = {
  showFilters: boolean;
  statusFilter: StatusFilter;
  priorityFilter: "all" | FollowUpPriority;
  dueFilter: DueFilter;
  assigneeFilter: string;
  groupFilter: string;
  guestFilter: string;
};

const STATUS_FILTER_VALUES = new Set<string>(
  STATUS_FILTERS.map((f) => f.value)
);
const PRIORITY_FILTER_VALUES = new Set<string>(
  PRIORITY_FILTERS.map((f) => f.value)
);
const DUE_FILTER_VALUES = new Set<string>(DUE_FILTERS.map((f) => f.value));

function isFollowUpsViewSnapshot(
  value: unknown
): value is FollowUpsViewSnapshot {
  if (value === null || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.showFilters === "boolean" &&
    typeof v.statusFilter === "string" &&
    STATUS_FILTER_VALUES.has(v.statusFilter) &&
    typeof v.priorityFilter === "string" &&
    PRIORITY_FILTER_VALUES.has(v.priorityFilter) &&
    typeof v.dueFilter === "string" &&
    DUE_FILTER_VALUES.has(v.dueFilter) &&
    typeof v.assigneeFilter === "string" &&
    typeof v.groupFilter === "string" &&
    typeof v.guestFilter === "string"
  );
}

export function AdminFollowUpsShell({
  data,
  viewerId,
}: {
  data: AdminFollowUpsData;
  // Signed-in profile id, used only to scope this admin's saved filters (#263).
  viewerId?: string | null;
}) {
  const { followUps, groups, members, guests, assigneeProfiles, errors } = data;

  // Follow-up creation moved into the shared Editing Pattern drawer (#267):
  // it opens out of the list flow rather than expanding an inline Card, so the
  // status-grouped queue never reflows and its filter + scroll state survive
  // the round trip. The dirty/in-flight bookkeeping lives in the shared
  // useEditingDrawer hook; this is a create drawer, so it closes + refreshes on
  // save to surface the new follow-up.
  const drawer = useEditingDrawer();

  const [showFilters, setShowFilters] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [priorityFilter, setPriorityFilter] = useState<
    "all" | FollowUpPriority
  >("all");
  const [dueFilter, setDueFilter] = useState<DueFilter>("all");
  const [assigneeFilter, setAssigneeFilter] = useState<string>("all");
  const [groupFilter, setGroupFilter] = useState<string>("all");
  const [guestFilter, setGuestFilter] = useState<string>("all");

  const groupsById = useMemo(
    () => new Map(groups.map((g) => [g.id, g] as const)),
    [groups]
  );
  const membersById = useMemo(
    () => new Map(members.map((m) => [m.id, m] as const)),
    [members]
  );
  const guestsById = useMemo(
    () => new Map(guests.map((g) => [g.id, g] as const)),
    [guests]
  );
  const profilesById = useMemo(
    () => new Map(assigneeProfiles.map((p) => [p.id, p] as const)),
    [assigneeProfiles]
  );

  // Saved views & filters (PRD req 12, #263): remember the panel-open state and
  // every filter selection per admin across reloads and return visits. The
  // assignee/group/guest filters are free-form ids, so a saved id whose record
  // later left the loaded option lists (deactivated assignee, removed group or
  // guest) is coerced back to "all" on restore — otherwise the queue would
  // filter by an unselectable value and read as empty with no chip to clear,
  // especially when showFilters was also restored collapsed.
  usePersistedViewState({
    surface: "follow-ups",
    scopeId: viewerId,
    snapshot: {
      showFilters,
      statusFilter,
      priorityFilter,
      dueFilter,
      assigneeFilter,
      groupFilter,
      guestFilter,
    },
    restore: (saved) => {
      setShowFilters(saved.showFilters);
      setStatusFilter(saved.statusFilter);
      setPriorityFilter(saved.priorityFilter);
      setDueFilter(saved.dueFilter);
      setAssigneeFilter(
        saved.assigneeFilter === "all" || profilesById.has(saved.assigneeFilter)
          ? saved.assigneeFilter
          : "all"
      );
      setGroupFilter(
        saved.groupFilter === "all" || groupsById.has(saved.groupFilter)
          ? saved.groupFilter
          : "all"
      );
      setGuestFilter(
        saved.guestFilter === "all" || guestsById.has(saved.guestFilter)
          ? saved.guestFilter
          : "all"
      );
    },
    validate: isFollowUpsViewSnapshot,
  });

  const { today, inSevenDays } = useMemo(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    const week = new Date(t);
    week.setDate(week.getDate() + 7);
    return { today: t, inSevenDays: week };
  }, []);

  const filtered = useMemo(() => {
    return followUps.filter((fu) => {
      if (statusFilter === "active") {
        if (fu.status === "done") return false;
      } else if (statusFilter !== "all" && fu.status !== statusFilter) {
        return false;
      }
      if (priorityFilter !== "all" && fu.priority !== priorityFilter)
        return false;
      if (assigneeFilter !== "all" && fu.assigned_to !== assigneeFilter)
        return false;
      if (groupFilter !== "all" && fu.related_group_id !== groupFilter)
        return false;
      if (guestFilter !== "all" && fu.related_guest_id !== guestFilter)
        return false;
      if (dueFilter !== "all") {
        if (dueFilter === "no_due_date") {
          if (fu.due_date) return false;
        } else if (!fu.due_date) {
          return false;
        } else {
          const due = new Date(`${fu.due_date}T00:00:00`);
          if (dueFilter === "overdue") {
            if (due >= today) return false;
          } else if (dueFilter === "this_week") {
            if (due < today || due > inSevenDays) return false;
          }
        }
      }
      return true;
    });
  }, [
    followUps,
    statusFilter,
    priorityFilter,
    dueFilter,
    assigneeFilter,
    groupFilter,
    guestFilter,
    today,
    inSevenDays,
  ]);

  const grouped = useMemo(() => {
    const out: Record<FollowUpStatus, AdminFollowUpEntry[]> = {
      open: [],
      in_progress: [],
      snoozed: [],
      done: [],
    };
    for (const fu of filtered) out[fu.status].push(fu);
    for (const status of STATUS_ORDER) {
      out[status].sort((a, b) => {
        // due_date asc (nulls last); then priority high > normal > low; then
        // created_at desc. Due date leads so the default view answers "what's
        // due next" first.
        if (a.due_date && b.due_date && a.due_date !== b.due_date)
          return a.due_date.localeCompare(b.due_date);
        if (a.due_date && !b.due_date) return -1;
        if (!a.due_date && b.due_date) return 1;
        const pOrder: Record<FollowUpPriority, number> = {
          high: 0,
          normal: 1,
          low: 2,
        };
        if (a.priority !== b.priority)
          return pOrder[a.priority] - pOrder[b.priority];
        return b.created_at.localeCompare(a.created_at);
      });
    }
    return out;
  }, [filtered]);

  const sortedGroups = useMemo(
    () => [...groups].sort((a, b) => a.name.localeCompare(b.name)),
    [groups]
  );
  const sortedGuests = useMemo(
    () => [...guests].sort((a, b) => a.full_name.localeCompare(b.full_name)),
    [guests]
  );
  const sortedAssignees = useMemo(
    () =>
      [...assigneeProfiles].sort((a, b) =>
        a.full_name.localeCompare(b.full_name)
      ),
    [assigneeProfiles]
  );

  const anyError =
    errors.followUps ||
    errors.groups ||
    errors.members ||
    errors.guests ||
    errors.profiles;

  return (
    <div style={{ display: "grid", gap: 36 }}>
      {anyError ? (
        <div role="alert" style={alertStyle}>
          One or more reads failed. The page below shows what we did get; retry
          in a moment or check the database connection.
          {errors.followUps ? (
            <p style={errorTextStyle}>{errors.followUps}</p>
          ) : null}
        </div>
      ) : null}

      <section style={{ display: "grid", gap: 18 }}>
        <SectionHeader
          eyebrow="Follow-ups"
          title="The queue, open items first"
          description="The status-grouped queue leads, sorted by due date. Add a follow-up or open the filters when you need them."
        />
        <div
          style={{
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <PButton
            type="button"
            tone="terra"
            size="md"
            onClick={() => drawer.open(true)}
          >
            Add follow-up
          </PButton>
          <PButton
            type="button"
            tone="ghost"
            size="md"
            onClick={() => setShowFilters((v) => !v)}
          >
            {showFilters ? "Hide filters" : "Filter"}
          </PButton>
        </div>

        {showFilters ? (
          <div
            className="lg-m-filterbar"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 12,
            }}
          >
            <div>
              <label htmlFor="fu-status" style={fieldLabelStyle}>
                Status
              </label>
              <select
                id="fu-status"
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(e.target.value as StatusFilter)
                }
                style={fieldSelectStyle}
              >
                {STATUS_FILTERS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="fu-filter-priority" style={fieldLabelStyle}>
                Priority
              </label>
              <select
                id="fu-filter-priority"
                value={priorityFilter}
                onChange={(e) =>
                  setPriorityFilter(e.target.value as "all" | FollowUpPriority)
                }
                style={fieldSelectStyle}
              >
                {PRIORITY_FILTERS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="fu-due" style={fieldLabelStyle}>
                Due window
              </label>
              <select
                id="fu-due"
                value={dueFilter}
                onChange={(e) => setDueFilter(e.target.value as DueFilter)}
                style={fieldSelectStyle}
              >
                {DUE_FILTERS.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="fu-assignee" style={fieldLabelStyle}>
                Assignee
              </label>
              <select
                id="fu-assignee"
                value={assigneeFilter}
                onChange={(e) => setAssigneeFilter(e.target.value)}
                style={fieldSelectStyle}
              >
                <option value="all">Anyone (or none)</option>
                {sortedAssignees.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="fu-group" style={fieldLabelStyle}>
                Related group
              </label>
              <select
                id="fu-group"
                value={groupFilter}
                onChange={(e) => setGroupFilter(e.target.value)}
                style={fieldSelectStyle}
              >
                <option value="all">Any (or none)</option>
                {sortedGroups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                    {g.lifecycle_status === "closed" ? " (closed)" : ""}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="fu-guest" style={fieldLabelStyle}>
                Related guest
              </label>
              <select
                id="fu-guest"
                value={guestFilter}
                onChange={(e) => setGuestFilter(e.target.value)}
                style={fieldSelectStyle}
              >
                <option value="all">Any (or none)</option>
                {sortedGuests.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.full_name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ) : null}

        {filtered.length === 0 ? (
          <div style={emptyStyle}>
            <div
              style={{
                fontFamily: fontDisplay,
                fontSize: 18,
                color: P.ink,
                fontWeight: 500,
              }}
            >
              {followUps.length === 0
                ? // While the create drawer is open the "No follow-ups yet"
                  // prompt is redundant (the form is already open), so it is
                  // replaced with a quieter in-progress note (#267).
                  drawer.isOpen
                  ? "Creating your first follow-up…"
                  : "No follow-ups yet"
                : "No follow-ups match these filters"}
            </div>
            <p
              style={{
                fontFamily: fontBody,
                fontSize: 13.5,
                color: P.ink2,
                margin: "8px 0 0",
                lineHeight: 1.5,
              }}
            >
              {followUps.length === 0
                ? drawer.isOpen
                  ? "Fill in the details in the panel and save to create it."
                  : "Use Add follow-up to create the first one. Tie it to a guest, member, or group — and add a note if helpful."
                : "Adjust the filters — or add a new follow-up."}
            </p>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 28 }}>
            {STATUS_ORDER.map((status) => {
              const list = grouped[status];
              if (list.length === 0) return null;
              return (
                <div key={status} style={{ display: "grid", gap: 12 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "baseline",
                      justifyContent: "space-between",
                      gap: 12,
                      borderBottom: `1px solid ${P.line}`,
                      paddingBottom: 6,
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontFamily: fontSans,
                          fontSize: 10,
                          letterSpacing: 1.5,
                          textTransform: "uppercase",
                          color: P.ink3,
                          fontWeight: 600,
                          marginBottom: 4,
                        }}
                      >
                        Status
                      </div>
                      <div
                        style={{
                          fontFamily: fontDisplay,
                          fontSize: 20,
                          fontWeight: 500,
                          color: P.ink,
                          letterSpacing: -0.4,
                        }}
                      >
                        {STATUS_LABEL[status]}
                      </div>
                    </div>
                    <div
                      style={{
                        fontFamily: fontSans,
                        fontSize: 11.5,
                        color: P.ink2,
                        fontStyle: "italic",
                      }}
                    >
                      {list.length} item{list.length === 1 ? "" : "s"}
                    </div>
                  </div>
                  <ul style={listResetStyle}>
                    {list.map((fu) => (
                      <li key={fu.id} style={{ marginBottom: 12 }}>
                        <FollowUpRow
                          followUp={fu}
                          groupsById={groupsById}
                          membersById={membersById}
                          guestsById={guestsById}
                          profilesById={profilesById}
                          today={today}
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* One always-mounted drawer (open toggled) so Radix owns the focus trap
          and focus restore, matching the Groups create flow (#266). Creation
          opens here, out of the list flow, so the queue never reflows. */}
      <EditingSurface
        open={drawer.isOpen}
        onRequestClose={drawer.requestClose}
        eyebrow="New follow-up"
        title="Add a follow-up"
        description="Tie it to a guest, member, or group, and assign someone if you want them to own it. Saving adds it to the queue."
        closeLabel="Close new follow-up form"
      >
        <FollowUpCreateForm
          groups={sortedGroups}
          members={members}
          guests={sortedGuests}
          assignees={sortedAssignees}
          onCancel={drawer.requestClose}
          onDirty={drawer.markDirty}
          onPendingChange={drawer.reportPending}
          onSaved={drawer.markSaved}
        />
      </EditingSurface>
    </div>
  );
}

function FollowUpRow({
  followUp,
  groupsById,
  membersById,
  guestsById,
  profilesById,
  today,
}: {
  followUp: AdminFollowUpEntry;
  groupsById: Map<string, GroupsRow>;
  membersById: Map<string, MembersRow>;
  guestsById: Map<string, GuestDirectoryEntry>;
  profilesById: Map<string, ProfilesRow>;
  today: Date;
}) {
  const group = followUp.related_group_id
    ? groupsById.get(followUp.related_group_id)
    : null;
  const member = followUp.related_member_id
    ? membersById.get(followUp.related_member_id)
    : null;
  const guest = followUp.related_guest_id
    ? guestsById.get(followUp.related_guest_id)
    : null;
  const assignee = followUp.assigned_to
    ? profilesById.get(followUp.assigned_to)
    : null;

  const dueDate = followUp.due_date
    ? new Date(`${followUp.due_date}T00:00:00`)
    : null;
  const isOverdue =
    dueDate !== null && followUp.status !== "done" && dueDate < today;

  const links: string[] = [];
  if (group) links.push(`Group: ${group.name}`);
  if (member) links.push(`Member: ${member.full_name}`);
  if (guest) links.push(`Guest: ${guest.full_name}`);

  return (
    <article
      style={{
        background: P.surface,
        border: `1px solid ${P.line}`,
        borderRadius: 12,
        padding: "14px 18px",
        display: "grid",
        gap: 10,
      }}
    >
      <div
        style={{
          display: "flex",
          gap: 10,
          alignItems: "flex-start",
          justifyContent: "space-between",
          flexWrap: "wrap",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontFamily: fontDisplay,
              fontSize: 16,
              fontWeight: 500,
              color: P.ink,
              letterSpacing: -0.2,
            }}
          >
            {followUp.title}
          </div>
          <div
            style={{
              fontFamily: fontSans,
              fontSize: 11,
              color: P.ink3,
              letterSpacing: 0.4,
              textTransform: "uppercase",
              marginTop: 4,
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            <span>{followUpTypeLabel(followUp.type)}</span>
            {assignee ? <span>Assignee: {assignee.full_name}</span> : null}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <PBadge tone={priorityTone(followUp.priority)}>
            {followUpPriorityLabel(followUp.priority)}
          </PBadge>
          {followUp.due_date ? (
            <PBadge tone={isOverdue ? "followup" : "neutral"}>
              {isOverdue ? "Overdue · " : "Due "}
              {followUp.due_date}
            </PBadge>
          ) : null}
        </div>
      </div>
      {links.length > 0 ? (
        <div
          style={{
            fontFamily: fontBody,
            fontSize: 13,
            color: P.ink2,
            display: "flex",
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          {links.map((l) => (
            <span key={l}>{l}</span>
          ))}
        </div>
      ) : null}
      {followUp.leader_visible_note ? (
        <blockquote
          style={{
            background: P.bg,
            borderLeft: `3px solid ${P.sage}`,
            borderRadius: 10,
            padding: "10px 14px",
            margin: 0,
            fontFamily: fontBody,
            fontSize: 13,
            fontStyle: "italic",
            color: P.ink,
            lineHeight: 1.5,
          }}
        >
          <span style={labelInlineStyle}>Leader-visible · </span>
          {followUp.leader_visible_note}
        </blockquote>
      ) : null}
      {followUp.admin_private_note ? (
        <blockquote
          style={{
            background: P.bg,
            borderLeft: `3px solid ${P.terra}`,
            borderRadius: 10,
            padding: "10px 14px",
            margin: 0,
            fontFamily: fontBody,
            fontSize: 13,
            fontStyle: "italic",
            color: P.ink,
            lineHeight: 1.5,
          }}
        >
          <span style={labelInlineStyle}>Admin-private · </span>
          {followUp.admin_private_note}
        </blockquote>
      ) : null}
      <FollowUpStatusControls followUp={followUp} />
    </article>
  );
}

function priorityTone(priority: FollowUpPriority) {
  if (priority === "high") return "followup" as const;
  if (priority === "normal") return "watch" as const;
  return "neutral" as const;
}

const labelInlineStyle = {
  fontFamily: fontSans,
  fontSize: 10,
  letterSpacing: 1.2,
  textTransform: "uppercase",
  color: P.ink3,
  fontWeight: 600,
  fontStyle: "normal",
} as const;

const listResetStyle = { listStyle: "none", padding: 0, margin: 0 } as const;

const alertStyle = {
  background: P.terraSoft,
  border: `1px solid ${P.terra}`,
  borderRadius: 8,
  padding: "12px 14px",
  fontFamily: fontBody,
  fontSize: 13,
  color: "#7d3621",
} as const;

const emptyStyle = {
  background: P.bg,
  border: `1px dashed ${P.line}`,
  borderRadius: 14,
  padding: "28px 24px",
  textAlign: "center",
} as const;
