"use client";

import { useMemo, useState } from "react";
import { SectionHeader } from "@/components/layout/shell";
import { P, fontBody, fontDisplay, fontSans } from "@/lib/pastoral";
import {
  followUpPriorityLabel,
  followUpTypeLabel,
} from "@/lib/dashboard/labels";
import { PBadge } from "@/components/pastoral/atoms";
import type {
  FollowUpsRow,
  GroupsRow,
  GuestsRow,
  MembersRow,
  ProfilesRow,
} from "@/types/database";
import type {
  FollowUpPriority,
  FollowUpStatus,
} from "@/types/enums";
import { FollowUpCreateForm } from "./follow-up-create-form";
import { FollowUpStatusControls } from "./follow-up-status-controls";
import {
  errorTextStyle,
  fieldInputStyle,
  fieldLabelStyle,
  fieldSelectStyle,
} from "@/components/admin/forms/field-styles";

export type AdminFollowUpsData = {
  followUps: FollowUpsRow[];
  groups: GroupsRow[];
  members: MembersRow[];
  guests: GuestsRow[];
  assigneeProfiles: ProfilesRow[];
  errors: {
    followUps: string | null;
    groups: string | null;
    members: string | null;
    guests: string | null;
    profiles: string | null;
  };
};

const STATUS_ORDER: FollowUpStatus[] = ["open", "in_progress", "snoozed", "done"];

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

export function AdminFollowUpsShell({ data }: { data: AdminFollowUpsData }) {
  const { followUps, groups, members, guests, assigneeProfiles, errors } = data;

  const [priorityFilter, setPriorityFilter] = useState<"all" | FollowUpPriority>("all");
  const [dueFilter, setDueFilter] = useState<DueFilter>("all");
  const [assigneeFilter, setAssigneeFilter] = useState<string>("all");
  const [groupFilter, setGroupFilter] = useState<string>("all");
  const [guestFilter, setGuestFilter] = useState<string>("all");

  const groupsById = useMemo(
    () => new Map(groups.map((g) => [g.id, g] as const)),
    [groups],
  );
  const membersById = useMemo(
    () => new Map(members.map((m) => [m.id, m] as const)),
    [members],
  );
  const guestsById = useMemo(
    () => new Map(guests.map((g) => [g.id, g] as const)),
    [guests],
  );
  const profilesById = useMemo(
    () => new Map(assigneeProfiles.map((p) => [p.id, p] as const)),
    [assigneeProfiles],
  );

  const { today, inSevenDays } = useMemo(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    const week = new Date(t);
    week.setDate(week.getDate() + 7);
    return { today: t, inSevenDays: week };
  }, []);

  const filtered = useMemo(() => {
    return followUps.filter((fu) => {
      if (priorityFilter !== "all" && fu.priority !== priorityFilter) return false;
      if (assigneeFilter !== "all" && fu.assigned_to !== assigneeFilter) return false;
      if (groupFilter !== "all" && fu.related_group_id !== groupFilter) return false;
      if (guestFilter !== "all" && fu.related_guest_id !== guestFilter) return false;
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
    priorityFilter,
    dueFilter,
    assigneeFilter,
    groupFilter,
    guestFilter,
    today,
    inSevenDays,
  ]);

  const grouped = useMemo(() => {
    const out: Record<FollowUpStatus, FollowUpsRow[]> = {
      open: [],
      in_progress: [],
      snoozed: [],
      done: [],
    };
    for (const fu of filtered) out[fu.status].push(fu);
    for (const status of STATUS_ORDER) {
      out[status].sort((a, b) => {
        // priority: high > normal > low; due_date asc nulls last; created_at desc
        const pOrder: Record<FollowUpPriority, number> = { high: 0, normal: 1, low: 2 };
        if (a.priority !== b.priority) return pOrder[a.priority] - pOrder[b.priority];
        if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date);
        if (a.due_date) return -1;
        if (b.due_date) return 1;
        return b.created_at.localeCompare(a.created_at);
      });
    }
    return out;
  }, [filtered]);

  const sortedGroups = useMemo(
    () => [...groups].sort((a, b) => a.name.localeCompare(b.name)),
    [groups],
  );
  const sortedGuests = useMemo(
    () => [...guests].sort((a, b) => a.full_name.localeCompare(b.full_name)),
    [guests],
  );
  const sortedAssignees = useMemo(
    () =>
      [...assigneeProfiles].sort((a, b) => a.full_name.localeCompare(b.full_name)),
    [assigneeProfiles],
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
          One or more reads failed. The page below shows what we did get; retry in
          a moment or check the Supabase connection.
          {errors.followUps ? (
            <p style={errorTextStyle}>{errors.followUps}</p>
          ) : null}
        </div>
      ) : null}

      <section style={{ display: "grid", gap: 18 }}>
        <SectionHeader
          eyebrow="New follow-up"
          title="Add a thread to track"
          description="Tie it to a group, a member, a guest, or a leader. Set a priority and a due date if it helps. Assign it to someone now or leave it unassigned for the team to pick up."
        />
        <Card>
          <FollowUpCreateForm
            groups={sortedGroups}
            members={members}
            guests={sortedGuests}
            assignees={sortedAssignees}
          />
        </Card>
      </section>

      <section style={{ display: "grid", gap: 18 }}>
        <SectionHeader
          eyebrow="The list"
          title="Every follow-up, by status"
          description="Filter by priority, due window, person, group, or guest. Open items come first."
        />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 12,
          }}
        >
          <div>
            <label htmlFor="fu-priority" style={fieldLabelStyle}>
              Priority
            </label>
            <select
              id="fu-priority"
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
              No follow-ups match these filters
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
              Adjust the filters above — or add a new follow-up at the top.
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
  followUp: FollowUpsRow;
  groupsById: Map<string, GroupsRow>;
  membersById: Map<string, MembersRow>;
  guestsById: Map<string, GuestsRow>;
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

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: P.surface,
        border: `1px solid ${P.line}`,
        borderRadius: 10,
        padding: "18px 22px",
        overflow: "hidden",
      }}
    >
      {children}
    </div>
  );
}

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
