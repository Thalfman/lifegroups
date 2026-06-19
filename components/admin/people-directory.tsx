"use client";

import { Children, memo, useDeferredValue, useMemo, useState } from "react";
import { DeactivateMemberButton } from "@/components/admin/forms/deactivate-member-button";
import { DeactivateProfileButton } from "@/components/admin/forms/deactivate-profile-button";
import { ChangeLeaderRoleForm } from "@/components/admin/forms/change-leader-role-form";
import { SuperAdminInlineDelete } from "@/components/admin/super-admin/inline-delete";
import { Badge, STATUS_TONES } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import {
  fieldInputClassName,
  fieldSelectClassName,
} from "@/components/admin/forms/field-styles";
import { cn } from "@/lib/utils";
import { ROLE_LABELS } from "@/lib/auth/roles";
import type {
  GroupLeadersRow,
  GroupMembershipsRow,
  GroupsRow,
  MembersRow,
  ProfilesRow,
} from "@/types/database";
import type { UserRole } from "@/types/enums";

// The directory's people scope: Everyone, Leaders (login profiles filtered to
// leader/co-leader), or Members (participant, non-login records). Formerly
// three separate People tabs; now one filter control inside the directory, so
// the list is one destination and the scope is just a narrowing.
export type DirectoryScope = "directory" | "leaders" | "members";

type PeopleDirectoryProps = {
  profiles: ProfilesRow[];
  members: MembersRow[];
  groups: GroupsRow[];
  groupLeaders: GroupLeadersRow[];
  memberships: GroupMembershipsRow[];
  currentActorProfileId: string;
  // Profile ids of leaders/co-leaders whose care cadence has lapsed, so each
  // person row can show the Contact/Care indicator ("Needs contact" vs "No
  // current concerns"). Members have no care model, so they are never in here.
  needsContactProfileIds: ReadonlySet<string>;
  // SAD9: super-admin-only inline permanent delete of a person / member record.
  isSuperAdmin?: boolean;
  errors: {
    profiles: string | null;
    members: string | null;
    leaders: string | null;
    memberships: string | null;
  };
};

type StatusFilter = "all" | "active" | "inactive";

const LEADER_ROLES = new Set(["leader", "co_leader"]);

// The login-profile list renders as one section per role, ordered down the
// oversight ladder (Ministry Admin ▸ Over-Shepherd ▸ Leader ▸ Co-Leader).
// Titles pluralize ROLE_LABELS; descriptions compress CONTEXT.md's definitions
// to a line each. super_admin never reaches this component (filtered upstream
// in buildPeopleDirectoryData), so it carries no section. Exported for tests.
export const PROFILE_SECTIONS: {
  role: UserRole;
  title: string;
  description: string;
}[] = [
  {
    role: "ministry_admin",
    title: "Ministry Admins",
    description:
      "Ministry admins run the ministry day to day and oversee every group and shepherd.",
  },
  {
    role: "over_shepherd",
    title: "Over-Shepherds",
    description:
      "Over-shepherds coach a set of shepherds, between the shepherds and the ministry admin in the oversight ladder.",
  },
  {
    role: "leader",
    title: "Shepherds",
    description: "Shepherds care for a Life Group and the members in it.",
  },
  {
    role: "co_leader",
    title: "Co-Shepherds",
    description:
      "Co-shepherds share the care of a Life Group alongside its shepherd.",
  },
];

// Empty-state copy for the profile (leaders / oversight) section, factored out
// of the JSX so the section markup reads as data rather than a four-branch
// ternary. `filtered` = a search query or non-default status filter is active.
function emptyProfileMessage(args: {
  error: string | null;
  filtered: boolean;
  scope: DirectoryScope;
}): string {
  if (args.error) return `Couldn't load profiles: ${args.error}`;
  if (args.filtered) {
    return args.scope === "leaders"
      ? "No shepherds or co-shepherds match the current filters."
      : "No shepherds or oversight roles match the current filters.";
  }
  return args.scope === "leaders"
    ? "No shepherds or co-shepherds yet. Add a person, mark them as a shepherd, then assign them to a group."
    : "No shepherds or oversight roles yet. Add people, mark shepherds, then assign group shepherds.";
}

// Empty-state copy for the members section. Returns null when there are members
// to show (the section renders rows instead of an empty state).
function emptyMemberMessage(args: {
  error: string | null;
  hasMembers: boolean;
  filtered: boolean;
}): string | null {
  if (args.error) return `Couldn't load members: ${args.error}`;
  if (args.hasMembers) return null;
  return args.filtered
    ? "No members match the current filters."
    : "No members yet. Add people first, then assign shepherds and groups so care coverage can turn on.";
}

export function PeopleDirectory(props: PeopleDirectoryProps) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [scope, setScope] = useState<DirectoryScope>("directory");

  // Defer the inputs that drive the two list filters and the re-render of every
  // profile/member row. The search box (`query`) and the status select stay
  // bound to their urgent state for instant feedback, while the heavy filtering
  // keys off the deferred copies and runs as a low-priority, interruptible
  // render — keeping typing and filtering snappy (low INP) on a long directory
  // without a fixed debounce delay. The scope filter only toggles section
  // visibility, so it stays urgent.
  const deferredQuery = useDeferredValue(query);
  const deferredStatusFilter = useDeferredValue(statusFilter);
  const trimmed = deferredQuery.trim().toLowerCase();
  const listIsStale =
    query !== deferredQuery || statusFilter !== deferredStatusFilter;

  const groupsById = useMemo(
    () => new Map(props.groups.map((g) => [g.id, g])),
    [props.groups]
  );

  const profileGroupMap = useMemo(() => {
    const m = new Map<string, GroupsRow[]>();
    for (const link of props.groupLeaders) {
      if (!link.active) continue;
      const g = groupsById.get(link.group_id);
      if (!g) continue;
      const arr = m.get(link.profile_id) ?? [];
      arr.push(g);
      m.set(link.profile_id, arr);
    }
    return m;
  }, [props.groupLeaders, groupsById]);

  const memberGroupMap = useMemo(() => {
    const m = new Map<string, GroupsRow[]>();
    for (const link of props.memberships) {
      const g = groupsById.get(link.group_id);
      if (!g) continue;
      const arr = m.get(link.member_id) ?? [];
      arr.push(g);
      m.set(link.member_id, arr);
    }
    return m;
  }, [props.memberships, groupsById]);

  const filterProfile = (p: ProfilesRow): boolean => {
    if (scope === "leaders" && !LEADER_ROLES.has(p.role)) return false;
    if (deferredStatusFilter !== "all" && p.status !== deferredStatusFilter)
      return false;
    if (trimmed) {
      const hay = `${p.full_name} ${p.email}`.toLowerCase();
      if (!hay.includes(trimmed)) return false;
    }
    return true;
  };

  const filterMember = (m: MembersRow): boolean => {
    if (deferredStatusFilter !== "all" && m.status !== deferredStatusFilter)
      return false;
    if (trimmed) {
      const hay = `${m.full_name} ${m.email ?? ""}`.toLowerCase();
      if (!hay.includes(trimmed)) return false;
    }
    return true;
  };

  const visibleProfiles = useMemo(
    () => props.profiles.filter(filterProfile),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [props.profiles, scope, deferredStatusFilter, trimmed]
  );

  const visibleMembers = useMemo(
    () => props.members.filter(filterMember),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [props.members, deferredStatusFilter, trimmed]
  );

  // Single-pass partition of the filtered profiles into their role sections.
  const profilesByRole = useMemo(() => {
    const m = new Map<UserRole, ProfilesRow[]>();
    for (const p of visibleProfiles) {
      const arr = m.get(p.role) ?? [];
      arr.push(p);
      m.set(p.role, arr);
    }
    return m;
  }, [visibleProfiles]);

  // The Leaders scope narrows to the two leading roles; Everyone walks the
  // full ladder.
  const sectionsForScope =
    scope === "leaders"
      ? PROFILE_SECTIONS.filter((s) => LEADER_ROLES.has(s.role))
      : PROFILE_SECTIONS;

  const showLogin = scope === "directory" || scope === "leaders";
  const showMembers = scope === "directory" || scope === "members";

  const anyError =
    (showLogin && (props.errors.profiles || props.errors.leaders)) ||
    (showMembers && (props.errors.members || props.errors.memberships));

  return (
    <section className="grid gap-[18px]">
      <FilterBar
        query={query}
        statusFilter={statusFilter}
        scope={scope}
        onQueryChange={setQuery}
        onStatusFilterChange={setStatusFilter}
        onScopeChange={setScope}
      />

      {anyError ? (
        <div
          role="alert"
          className="rounded-sm border border-clay bg-claySoft px-3.5 py-3 font-sans text-sm text-clayDeep"
        >
          One or more reads failed. The page shows what we did get; retry in a
          moment or check the database connection.
        </div>
      ) : null}

      {showLogin ? (
        props.errors.profiles || visibleProfiles.length === 0 ? (
          // Failed read or nothing to show: one aggregate section carries the
          // error / empty state, instead of four sections repeating it.
          <DirectorySection
            headerTitle={
              scope === "leaders"
                ? "Shepherds and co-shepherds"
                : "Shepherds and oversight"
            }
            headerDescription={
              scope === "leaders"
                ? "Current shepherds and co-shepherds who care for their groups."
                : "Ministry admins, over-shepherds, shepherds, and co-shepherds who care for and oversee groups."
            }
            countLabel={`${visibleProfiles.length} shown`}
            stale={listIsStale}
            empty={emptyProfileMessage({
              error: props.errors.profiles,
              filtered: Boolean(trimmed) || deferredStatusFilter !== "active",
              scope,
            })}
          >
            {null}
          </DirectorySection>
        ) : (
          sectionsForScope.map((section) => {
            const rows = profilesByRole.get(section.role) ?? [];
            // A role with no one in it stays off the page rather than
            // stacking empty sections.
            if (rows.length === 0) return null;
            return (
              <DirectorySection
                key={section.role}
                headerTitle={section.title}
                headerDescription={section.description}
                countLabel={`${rows.length} shown`}
                stale={listIsStale}
                empty={null}
              >
                {rows.map((p) => (
                  <ProfileRow
                    key={p.id}
                    profile={p}
                    assignedGroups={profileGroupMap.get(p.id) ?? NO_GROUPS}
                    isSelf={p.id === props.currentActorProfileId}
                    needsContact={props.needsContactProfileIds.has(p.id)}
                    isSuperAdmin={props.isSuperAdmin ?? false}
                  />
                ))}
              </DirectorySection>
            );
          })
        )
      ) : null}

      {showMembers ? (
        <DirectorySection
          headerTitle="Members"
          headerDescription="Members take part in groups but don’t sign in. Shepherds record their attendance; admins assign them to groups."
          countLabel={`${visibleMembers.length} shown`}
          stale={listIsStale}
          empty={emptyMemberMessage({
            error: props.errors.members,
            hasMembers: visibleMembers.length > 0,
            filtered: Boolean(trimmed) || deferredStatusFilter !== "active",
          })}
        >
          {visibleMembers.map((m) => (
            <MemberRow
              key={m.id}
              member={m}
              assignedGroups={memberGroupMap.get(m.id) ?? NO_GROUPS}
              isSuperAdmin={props.isSuperAdmin ?? false}
            />
          ))}
        </DirectorySection>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Filter bar
// ---------------------------------------------------------------------------

function FilterBar({
  query,
  statusFilter,
  scope,
  onQueryChange,
  onStatusFilterChange,
  onScopeChange,
}: {
  query: string;
  statusFilter: StatusFilter;
  scope: DirectoryScope;
  onQueryChange: (v: string) => void;
  onStatusFilterChange: (v: StatusFilter) => void;
  onScopeChange: (v: DirectoryScope) => void;
}) {
  return (
    <div className="grid grid-cols-1 items-center gap-2.5 rounded-md border border-line bg-surface p-3 sm:grid-cols-2 sm:gap-3 md:grid-cols-[minmax(220px,1fr)_auto_auto] md:px-3.5">
      <input
        type="search"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder="Search by name or email…"
        aria-label="Search people"
        className={cn(fieldInputClassName, "sm:col-span-2 md:col-span-1")}
      />
      {/* Scope narrows who's listed — formerly the Leaders / Members tabs. */}
      <select
        value={scope}
        onChange={(e) => onScopeChange(e.target.value as DirectoryScope)}
        aria-label="People type"
        className={fieldSelectClassName}
      >
        <option value="directory">Everyone</option>
        <option value="leaders">Shepherds</option>
        <option value="members">Members</option>
      </select>
      <select
        value={statusFilter}
        onChange={(e) => onStatusFilterChange(e.target.value as StatusFilter)}
        aria-label="Status filter"
        className={fieldSelectClassName}
      >
        <option value="active">Active</option>
        <option value="inactive">Inactive</option>
        <option value="all">All statuses</option>
      </select>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section wrapper
// ---------------------------------------------------------------------------

function DirectorySection({
  headerTitle,
  headerDescription,
  countLabel,
  empty,
  stale = false,
  children,
}: {
  headerTitle: string;
  headerDescription: string;
  countLabel?: string;
  empty: string | null;
  // True while the rendered rows still reflect the previous filter input —
  // dims the list briefly so the stale rows read as catching up.
  stale?: boolean;
  children: React.ReactNode;
}) {
  // No section eyebrow: the page header carries the one eyebrow per page
  // (design direction §4) and the old eyebrows just echoed the title.
  return (
    <section className="grid gap-3.5">
      <div>
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="m-0 font-display text-xl font-medium text-ink">
            {headerTitle}
          </h3>
          {countLabel ? (
            <div className="font-sans text-xs text-ink3">{countLabel}</div>
          ) : null}
        </div>
        <p className="m-0 mt-1.5 max-w-lede font-sans text-sm text-ink2">
          {headerDescription}
        </p>
      </div>
      {empty ? (
        <div className="rounded-md border border-dashed border-line bg-surface px-5 py-4 text-center font-sans text-sm text-ink2">
          {empty}
        </div>
      ) : (
        <div
          className={cn(
            "overflow-hidden rounded-md border border-line bg-surface transition-opacity duration-150",
            stale ? "opacity-60" : "opacity-100"
          )}
        >
          <ul className="m-0 list-none p-0">{children}</ul>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Care / contact indicator
// ---------------------------------------------------------------------------

// The per-row care indicator. Only an attention state renders: an active
// leader / co-leader whose care cadence has lapsed reads "Needs contact";
// everyone else shows nothing. The old uniform field ("No care model" on every
// member, "No current concerns" on every quiet leader) was row noise — and the
// positive state was a lie for inactive leaders, whose cadence isn't tracked.
// The person detail Overview keeps the explicit positive state.
function CareIndicator({
  hasCareModel,
  needsContact,
}: {
  hasCareModel: boolean;
  needsContact: boolean;
}) {
  if (!hasCareModel || !needsContact) return null;
  return (
    <Badge tone={STATUS_TONES.followUp} dot>
      Needs contact
    </Badge>
  );
}

// Profile navigation reads as a primary affordance: a solid (ink) pill rather
// than a plain text link. The visible label stays "View person" so the a11y
// suite's link-name probe matches, while aria-label carries the person's name so
// the repeated row links stay uniquely named for screen-reader users.
function ViewPersonLink({ href, name }: { href: string; name: string }) {
  return (
    <LinkButton
      href={href}
      variant="solid"
      size="sm"
      aria-label={`View person ${name}`}
    >
      View person →
    </LinkButton>
  );
}

// A per-row "More" menu (#645). It holds the lower-frequency, heavier actions —
// Archive (the reversible soft-delete) for any admin, plus the Super-Admin-only
// permanent Delete — so the row's default state isn't a prominent destructive
// button. Renders nothing when there are no menu actions for this row (e.g. an
// already-archived person viewed by a non-super-admin).
function RowMoreMenu({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  const items = Children.toArray(children).filter(Boolean);
  if (items.length === 0) return null;
  return (
    <details className="relative inline-flex">
      <summary
        className="lg-sac-summary inline-flex rounded-pill border border-line bg-surface px-3 py-1.5 font-sans text-sm font-semibold text-ink2 hover:bg-surfaceAlt"
        aria-label={`More actions for ${label}`}
      >
        More
      </summary>
      <div className="absolute right-0 top-[calc(100%+6px)] z-dropdown grid gap-2 rounded-md border border-line bg-surface p-2 shadow-softLg">
        {items}
      </div>
    </details>
  );
}

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

// One directory row: identity block left, row actions right; stacks to a
// single column on mobile.
// NOTE: no `content-visibility` here. Each row hosts RowMoreMenu, whose dropdown
// is absolutely positioned below the row (top-[calc(100%+6px)]); content-
// visibility's paint containment would clip that popover and hide the
// deactivate/delete actions. Rows without overflow popovers (Notes feed,
// Follow-ups, calendar list) keep the lg-cv-row optimization.
const ROW_CLASS =
  "grid grid-cols-1 items-start gap-3 border-b border-lineSoft px-4 py-3.5 sm:grid-cols-[minmax(0,1fr)_auto]";
const ROW_NAME_CLASS = "font-display text-md font-medium text-ink";
const ROW_BADGES_CLASS = "flex flex-wrap items-center gap-2.5";
const ROW_CONTACT_CLASS =
  "mt-1 flex flex-wrap items-center gap-2.5 font-sans text-sm text-ink2";
const ROW_GROUPS_CLASS = "mt-2 flex flex-wrap gap-1.5";
const ROW_ACTIONS_CLASS = "flex flex-wrap items-start justify-end gap-2";

// Memoized so unrelated directory re-renders (e.g. debounced-search keystrokes
// before the filtered list settles) don't re-render every row. Props are
// referentially stable: rows come from props and the group lists from memoized
// maps (empty → NO_GROUPS).
const ProfileRow = memo(function ProfileRow({
  profile,
  assignedGroups,
  isSelf,
  needsContact,
  isSuperAdmin,
}: {
  profile: ProfilesRow;
  assignedGroups: GroupsRow[];
  isSelf: boolean;
  needsContact: boolean;
  isSuperAdmin: boolean;
}) {
  const isLeaderType =
    profile.role === "leader" || profile.role === "co_leader";
  return (
    <li className={ROW_CLASS}>
      <div className="min-w-0">
        <div className={ROW_BADGES_CLASS}>
          <div className={ROW_NAME_CLASS}>{profile.full_name}</div>
          {/* A Role badge always; Status only when it's news (inactive) and
              the care indicator only when contact has lapsed — active is the
              norm, so a typical row carries one quiet badge, not three. */}
          <Badge tone="neutral" dot>
            {ROLE_LABELS[profile.role]}
          </Badge>
          {profile.status !== "active" ? (
            <Badge tone="neutral" dot>
              Inactive
            </Badge>
          ) : null}
          <CareIndicator
            // Only an *active* leader's cadence is tracked — an inactive one
            // must not read as "no concerns" (or anything) here.
            hasCareModel={isLeaderType && profile.status === "active"}
            needsContact={needsContact}
          />
        </div>
        <div className={ROW_CONTACT_CLASS}>
          <span>{profile.email}</span>
          {profile.phone ? (
            <span className="text-ink3">· {profile.phone}</span>
          ) : null}
        </div>
        {assignedGroups.length > 0 ? (
          <div className={ROW_GROUPS_CLASS}>
            {assignedGroups.map((g) => (
              <Badge key={g.id} tone="neutral" dot>
                {g.name}
              </Badge>
            ))}
          </div>
        ) : null}
      </div>
      <div className={ROW_ACTIONS_CLASS}>
        <ViewPersonLink
          href={`/admin/people/profile/${profile.id}`}
          name={profile.full_name}
        />
        {isSelf ? (
          <span className="font-sans text-xs italic text-ink3">
            That&rsquo;s you
          </span>
        ) : (
          <>
            {isLeaderType && profile.status === "active" ? (
              <ChangeLeaderRoleForm
                profileId={profile.id}
                profileName={profile.full_name}
                currentRole={profile.role as "leader" | "co_leader"}
              />
            ) : null}
            <RowMoreMenu label={profile.full_name}>
              {profile.status === "active" ? (
                <DeactivateProfileButton
                  profileId={profile.id}
                  fullName={profile.full_name}
                />
              ) : null}
              {isSuperAdmin ? (
                <SuperAdminInlineDelete
                  entityType="profile"
                  id={profile.id}
                  label={profile.full_name}
                />
              ) : null}
            </RowMoreMenu>
          </>
        )}
      </div>
    </li>
  );
});

const MemberRow = memo(function MemberRow({
  member,
  assignedGroups,
  isSuperAdmin,
}: {
  member: MembersRow;
  assignedGroups: GroupsRow[];
  isSuperAdmin: boolean;
}) {
  return (
    <li className={ROW_CLASS}>
      <div className="min-w-0">
        <div className={ROW_BADGES_CLASS}>
          <div className={ROW_NAME_CLASS}>{member.full_name}</div>
          <Badge tone="neutral" dot>
            Member
          </Badge>
          {/* Status only when it's news; members carry no care model, so no
              care indicator at all (the old "No care model" badge was noise). */}
          {member.status !== "active" ? (
            <Badge tone="neutral" dot>
              Inactive
            </Badge>
          ) : null}
        </div>
        <div className={ROW_CONTACT_CLASS}>
          <span>{member.email ?? "—"}</span>
          {member.phone ? (
            <span className="text-ink3">· {member.phone}</span>
          ) : null}
          {!member.email && !member.phone ? (
            <span className="italic text-ink3">no contact details</span>
          ) : null}
        </div>
        {assignedGroups.length > 0 ? (
          <div className={ROW_GROUPS_CLASS}>
            {assignedGroups.map((g) => (
              <Badge key={g.id} tone="neutral" dot>
                {g.name}
              </Badge>
            ))}
          </div>
        ) : null}
      </div>
      <div className={ROW_ACTIONS_CLASS}>
        <ViewPersonLink
          href={`/admin/people/member/${member.id}`}
          name={member.full_name}
        />
        <RowMoreMenu label={member.full_name}>
          {member.status === "active" ? (
            <DeactivateMemberButton
              memberId={member.id}
              fullName={member.full_name}
            />
          ) : null}
          {isSuperAdmin ? (
            <SuperAdminInlineDelete
              entityType="member"
              id={member.id}
              label={member.full_name}
            />
          ) : null}
        </RowMoreMenu>
      </div>
    </li>
  );
});

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

// Stable empty array so people with no assigned groups pass the same reference
// to the memoized rows across renders (a fresh `[]` would defeat React.memo).
const NO_GROUPS: GroupsRow[] = [];
