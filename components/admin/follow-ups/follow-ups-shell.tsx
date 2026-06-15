"use client";

import { useMemo, useState } from "react";
import { usePersistedViewState } from "@/lib/hooks/use-persisted-view-state";
import { SectionHeader } from "@/components/layout/shell";
import { EditingSurface } from "@/components/lg/admin/editing-surface";
import { useEditingDrawer } from "@/components/lg/admin/use-editing-drawer";
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
import {
  FOLLOW_UP_DUE_FILTERS,
  FOLLOW_UP_PRIORITY_FILTERS,
  FOLLOW_UP_STATUS_FILTERS,
  FOLLOW_UP_STATUS_ORDER,
  coerceSavedIdFilter,
  filterFollowUps,
  followUpDueWindow,
  isFollowUpOverdue,
  isFollowUpsViewSnapshot,
  partitionFollowUpsByStatus,
  type FollowUpDueFilter,
  type FollowUpStatusFilter,
} from "@/lib/admin/follow-up-queue";
import { FollowUpCreateForm } from "./follow-up-create-form";
import { FollowUpStatusControls } from "./follow-up-status-controls";
import { SuperAdminInlineDelete } from "@/components/admin/super-admin/inline-delete";
import { EmptyState } from "@/components/ui/empty-state";
import {
  fieldLabelClassName as FIELD_LABEL,
  fieldInputBaseClassName as FIELD_INPUT,
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

const STATUS_LABEL: Record<FollowUpStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  snoozed: "Snoozed",
  done: "Done",
};

export function AdminFollowUpsShell({
  data,
  viewerId,
  isSuperAdmin = false,
}: {
  data: AdminFollowUpsData;
  // Signed-in profile id, used only to scope this admin's saved filters (#263).
  viewerId?: string | null;
  // SAD9: super-admin-only inline permanent delete of a follow-up row.
  isSuperAdmin?: boolean;
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
  const [statusFilter, setStatusFilter] =
    useState<FollowUpStatusFilter>("active");
  const [priorityFilter, setPriorityFilter] = useState<
    "all" | FollowUpPriority
  >("all");
  const [dueFilter, setDueFilter] = useState<FollowUpDueFilter>("all");
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
        coerceSavedIdFilter(saved.assigneeFilter, profilesById)
      );
      setGroupFilter(coerceSavedIdFilter(saved.groupFilter, groupsById));
      setGuestFilter(coerceSavedIdFilter(saved.guestFilter, guestsById));
    },
    validate: isFollowUpsViewSnapshot,
  });

  const dueWindow = useMemo(() => followUpDueWindow(new Date()), []);
  const { today } = dueWindow;

  const filtered = useMemo(
    () =>
      filterFollowUps(
        followUps,
        {
          statusFilter,
          priorityFilter,
          dueFilter,
          assigneeFilter,
          groupFilter,
          guestFilter,
        },
        dueWindow
      ),
    [
      followUps,
      statusFilter,
      priorityFilter,
      dueFilter,
      assigneeFilter,
      groupFilter,
      guestFilter,
      dueWindow,
    ]
  );

  const grouped = useMemo(
    () => partitionFollowUpsByStatus(filtered),
    [filtered]
  );

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
    <div className="grid gap-9">
      {anyError ? (
        <div
          role="alert"
          className="rounded-sm border border-clay bg-claySoft px-3.5 py-3 font-sans text-sm text-clayDeep"
        >
          One or more reads failed. The page below shows what we did get; retry
          in a moment or check the database connection.
          {errors.followUps ? (
            <p className="mb-0 mt-2 font-sans text-sm text-clayDeep">
              {errors.followUps}
            </p>
          ) : null}
        </div>
      ) : null}

      <section className="grid gap-[18px]">
        {/* Subject-first heading (#479): this is the GENERAL queue — group and
            task follow-ups — distinct from the care follow-ups about Leaders
            that lead the Care Follow-ups tab above this shell. */}
        <SectionHeader
          eyebrow="Follow-ups"
          title="General follow-ups — groups and tasks"
          description="The status-grouped queue leads with open items, sorted by due date. Add a follow-up or open the filters when you need them."
        />
        <div className="flex flex-wrap items-center gap-2.5">
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
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 md:grid-cols-[repeat(auto-fit,minmax(180px,1fr))] md:gap-3">
            <div>
              <label htmlFor="fu-status" className={FIELD_LABEL}>
                Status
              </label>
              <select
                id="fu-status"
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(e.target.value as FollowUpStatusFilter)
                }
                className={FIELD_INPUT}
              >
                {FOLLOW_UP_STATUS_FILTERS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="fu-filter-priority" className={FIELD_LABEL}>
                Priority
              </label>
              <select
                id="fu-filter-priority"
                value={priorityFilter}
                onChange={(e) =>
                  setPriorityFilter(e.target.value as "all" | FollowUpPriority)
                }
                className={FIELD_INPUT}
              >
                {FOLLOW_UP_PRIORITY_FILTERS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="fu-due" className={FIELD_LABEL}>
                Due window
              </label>
              <select
                id="fu-due"
                value={dueFilter}
                onChange={(e) =>
                  setDueFilter(e.target.value as FollowUpDueFilter)
                }
                className={FIELD_INPUT}
              >
                {FOLLOW_UP_DUE_FILTERS.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="fu-assignee" className={FIELD_LABEL}>
                Assignee
              </label>
              <select
                id="fu-assignee"
                value={assigneeFilter}
                onChange={(e) => setAssigneeFilter(e.target.value)}
                className={FIELD_INPUT}
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
              <label htmlFor="fu-group" className={FIELD_LABEL}>
                Related group
              </label>
              <select
                id="fu-group"
                value={groupFilter}
                onChange={(e) => setGroupFilter(e.target.value)}
                className={FIELD_INPUT}
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
              <label htmlFor="fu-guest" className={FIELD_LABEL}>
                Related guest
              </label>
              <select
                id="fu-guest"
                value={guestFilter}
                onChange={(e) => setGuestFilter(e.target.value)}
                className={FIELD_INPUT}
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
          <EmptyState
            title={
              followUps.length === 0
                ? // While the create drawer is open the "No follow-ups yet"
                  // prompt is redundant (the form is already open), so it is
                  // replaced with a quieter in-progress note (#267).
                  drawer.isOpen
                  ? "Creating your first follow-up…"
                  : "No follow-ups yet"
                : "No follow-ups match these filters"
            }
            description={
              followUps.length === 0
                ? drawer.isOpen
                  ? "Fill in the details in the panel and save to create it."
                  : "Use Add follow-up to create the first one. Tie it to a guest, member, or group — and add a note if helpful."
                : "Adjust the filters — or add a new follow-up."
            }
          />
        ) : (
          <div className="grid gap-7">
            {FOLLOW_UP_STATUS_ORDER.map((status) => {
              const list = grouped[status];
              if (list.length === 0) return null;
              return (
                <div key={status} className="grid gap-3">
                  <div className="flex items-baseline justify-between gap-3 border-b border-line pb-1.5">
                    <div>
                      <div className="mb-1 font-sans text-xs font-semibold text-ink3">
                        Status
                      </div>
                      <div className="font-display text-xl font-medium text-ink">
                        {STATUS_LABEL[status]}
                      </div>
                    </div>
                    <div className="font-sans text-sm italic text-ink2">
                      {list.length} item{list.length === 1 ? "" : "s"}
                    </div>
                  </div>
                  <ul className="m-0 list-none p-0">
                    {list.map((fu) => (
                      <li key={fu.id} className="mb-3">
                        <FollowUpRow
                          followUp={fu}
                          groupsById={groupsById}
                          membersById={membersById}
                          guestsById={guestsById}
                          profilesById={profilesById}
                          today={today}
                          isSuperAdmin={isSuperAdmin}
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
  isSuperAdmin,
}: {
  followUp: AdminFollowUpEntry;
  groupsById: Map<string, GroupsRow>;
  membersById: Map<string, MembersRow>;
  guestsById: Map<string, GuestDirectoryEntry>;
  profilesById: Map<string, ProfilesRow>;
  today: Date;
  isSuperAdmin: boolean;
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

  const isOverdue = isFollowUpOverdue(followUp, today);

  const links: string[] = [];
  if (group) links.push(`Group: ${group.name}`);
  if (member) links.push(`Member: ${member.full_name}`);
  if (guest) links.push(`Guest: ${guest.full_name}`);

  return (
    <article className="grid gap-2.5 rounded-md border border-line bg-surface px-[18px] py-3.5">
      <div className="flex flex-wrap items-start justify-between gap-2.5">
        <div className="min-w-0">
          <div className="font-display text-lg font-medium text-ink">
            {followUp.title}
          </div>
          <div className="mt-1 flex flex-wrap gap-2 font-sans text-sm text-ink3">
            <span>{followUpTypeLabel(followUp.type)}</span>
            {assignee ? <span>Assignee: {assignee.full_name}</span> : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
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
        <div className="flex flex-wrap gap-3 font-sans text-sm text-ink2">
          {links.map((l) => (
            <span key={l}>{l}</span>
          ))}
        </div>
      ) : null}
      {/* Note visibility tone is a leading status dot on a surfaceAlt strip
          (sage = leader-visible, clay = admin-private) — never a side stripe. */}
      {followUp.leader_visible_note ? (
        <blockquote className="m-0 rounded-sm bg-surfaceAlt px-3.5 py-2.5 font-sans text-sm italic leading-normal text-ink">
          <span
            aria-hidden="true"
            className="mr-1.5 inline-block h-1.5 w-1.5 rounded-pill bg-sage align-middle"
          />
          <span className="font-sans text-xs font-semibold not-italic text-ink3">
            Leader-visible ·{" "}
          </span>
          {followUp.leader_visible_note}
        </blockquote>
      ) : null}
      {followUp.admin_private_note ? (
        <blockquote className="m-0 rounded-sm bg-surfaceAlt px-3.5 py-2.5 font-sans text-sm italic leading-normal text-ink">
          <span
            aria-hidden="true"
            className="mr-1.5 inline-block h-1.5 w-1.5 rounded-pill bg-clay align-middle"
          />
          <span className="font-sans text-xs font-semibold not-italic text-ink3">
            Admin-private ·{" "}
          </span>
          {followUp.admin_private_note}
        </blockquote>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <FollowUpStatusControls followUp={followUp} />
        {isSuperAdmin ? (
          <SuperAdminInlineDelete
            entityType="follow_up"
            id={followUp.id}
            label={followUp.title}
          />
        ) : null}
      </div>
    </article>
  );
}

function priorityTone(priority: FollowUpPriority) {
  if (priority === "high") return "followup" as const;
  if (priority === "normal") return "watch" as const;
  return "neutral" as const;
}
