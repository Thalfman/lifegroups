"use client";

import { memo, useDeferredValue, useMemo, useState } from "react";
import { DeactivateMemberButton } from "@/components/admin/forms/deactivate-member-button";
import { DeactivateProfileButton } from "@/components/admin/forms/deactivate-profile-button";
import { ChangeLeaderRoleForm } from "@/components/admin/forms/change-leader-role-form";
import { PBadge } from "@/components/pastoral/atoms";
import { PLinkButton } from "@/components/pastoral/button";
import { ROLE_LABELS } from "@/lib/auth/roles";
import { P, fontBody, fontDisplay, fontSans } from "@/lib/pastoral";
import type {
  GroupLeadersRow,
  GroupMembershipsRow,
  GroupsRow,
  MembersRow,
  ProfilesRow,
} from "@/types/database";

// Directory = everyone; Leaders = login profiles filtered to leader/co-leader;
// Members = participant (non-login) records. The People shell renders one of
// these three scopes per tab (reduction plan §6). Directory keeps the
// login/member type filter; the two scoped tabs lock it so the tab label and
// the list can't disagree.
export type DirectoryScope = "directory" | "leaders" | "members";

type PeopleDirectoryProps = {
  scope: DirectoryScope;
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
  errors: {
    profiles: string | null;
    members: string | null;
    leaders: string | null;
    memberships: string | null;
  };
};

type StatusFilter = "all" | "active" | "inactive";

const LEADER_ROLES = new Set(["leader", "co_leader"]);

export function PeopleDirectory(props: PeopleDirectoryProps) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");

  // Defer the inputs that drive the two list filters and the re-render of every
  // profile/member row. The search box (`query`) and the status select stay
  // bound to their urgent state for instant feedback, while the heavy filtering
  // keys off the deferred copies and runs as a low-priority, interruptible
  // render — keeping typing and filtering snappy (low INP) on a long directory
  // without a fixed debounce delay. The type filter only toggles section
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
    if (props.scope === "leaders" && !LEADER_ROLES.has(p.role)) return false;
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
    [props.profiles, props.scope, deferredStatusFilter, trimmed]
  );

  const visibleMembers = useMemo(
    () => props.members.filter(filterMember),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [props.members, deferredStatusFilter, trimmed]
  );

  const showLogin = props.scope === "directory" || props.scope === "leaders";
  const showMembers = props.scope === "directory" || props.scope === "members";

  const anyError =
    (showLogin && (props.errors.profiles || props.errors.leaders)) ||
    (showMembers && (props.errors.members || props.errors.memberships));

  return (
    <section style={{ display: "grid", gap: 18 }}>
      <FilterBar
        query={query}
        statusFilter={statusFilter}
        onQueryChange={setQuery}
        onStatusFilterChange={setStatusFilter}
      />

      {anyError ? (
        <div role="alert" style={alertStyle}>
          One or more reads failed. The page shows what we did get; retry in a
          moment or check the database connection.
        </div>
      ) : null}

      {showLogin ? (
        <DirectorySection
          headerEyebrow="Login profiles"
          headerTitle={
            props.scope === "leaders"
              ? "Leaders and co-leaders"
              : "People who sign in"
          }
          headerDescription={
            props.scope === "leaders"
              ? "Current leaders and co-leaders. They sign in to record check-ins and review their groups."
              : "Ministry admins, leaders, and co-leaders. They sign in to record check-ins and review groups."
          }
          countLabel={`${visibleProfiles.length} shown`}
          stale={listIsStale}
          empty={
            props.errors.profiles
              ? `Couldn't load profiles: ${props.errors.profiles}`
              : visibleProfiles.length === 0
                ? trimmed || statusFilter !== "all"
                  ? "No login profiles match the current filters."
                  : props.scope === "leaders"
                    ? "No leaders or co-leaders yet. Add one from Add Person."
                    : "No login profiles yet. Add one from Add Person."
                : null
          }
        >
          {visibleProfiles.map((p) => (
            <ProfileRow
              key={p.id}
              profile={p}
              assignedGroups={profileGroupMap.get(p.id) ?? NO_GROUPS}
              isSelf={p.id === props.currentActorProfileId}
              needsContact={props.needsContactProfileIds.has(p.id)}
            />
          ))}
        </DirectorySection>
      ) : null}

      {showMembers ? (
        <DirectorySection
          headerEyebrow="Members"
          headerTitle="Participants (non-login)"
          headerDescription="Members are people in the directory who don't sign in. Leaders mark their attendance and admins place them in groups."
          countLabel={`${visibleMembers.length} shown`}
          stale={listIsStale}
          empty={
            props.errors.members
              ? `Couldn't load members: ${props.errors.members}`
              : visibleMembers.length === 0
                ? trimmed || statusFilter !== "all"
                  ? "No members match the current filters."
                  : "No members yet. Add one from Add Person."
                : null
          }
        >
          {visibleMembers.map((m) => (
            <MemberRow
              key={m.id}
              member={m}
              assignedGroups={memberGroupMap.get(m.id) ?? NO_GROUPS}
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
  onQueryChange,
  onStatusFilterChange,
}: {
  query: string;
  statusFilter: StatusFilter;
  onQueryChange: (v: string) => void;
  onStatusFilterChange: (v: StatusFilter) => void;
}) {
  return (
    <div
      className="lg-m-filterbar"
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(220px, 1fr) auto",
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
        placeholder="Search by name or email…"
        aria-label="Search people"
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
        value={statusFilter}
        onChange={(e) => onStatusFilterChange(e.target.value as StatusFilter)}
        aria-label="Status filter"
        style={selectStyle}
      >
        <option value="active">Active</option>
        <option value="inactive">Inactive</option>
        <option value="all">All statuses</option>
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
// Section wrapper
// ---------------------------------------------------------------------------

function DirectorySection({
  headerEyebrow,
  headerTitle,
  headerDescription,
  countLabel,
  empty,
  stale = false,
  children,
}: {
  headerEyebrow: string;
  headerTitle: string;
  headerDescription: string;
  countLabel?: string;
  empty: string | null;
  // True while the rendered rows still reflect the previous filter input —
  // dims the list briefly so the stale rows read as catching up.
  stale?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section style={{ display: "grid", gap: 14 }}>
      <div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            gap: 12,
          }}
        >
          <div
            style={{
              fontFamily: fontSans,
              fontSize: 10,
              letterSpacing: 1.8,
              textTransform: "uppercase",
              color: P.ink3,
              fontWeight: 600,
            }}
          >
            {headerEyebrow}
          </div>
          {countLabel ? (
            <div
              style={{
                fontFamily: fontSans,
                fontSize: 11,
                color: P.ink3,
              }}
            >
              {countLabel}
            </div>
          ) : null}
        </div>
        <h3
          style={{
            margin: "4px 0 0",
            fontFamily: fontDisplay,
            fontSize: 22,
            fontWeight: 500,
            color: P.ink,
            letterSpacing: -0.4,
          }}
        >
          {headerTitle}
        </h3>
        <p
          style={{
            fontFamily: fontBody,
            fontSize: 13,
            color: P.ink2,
            margin: "6px 0 0",
            lineHeight: 1.55,
            maxWidth: 720,
          }}
        >
          {headerDescription}
        </p>
      </div>
      {empty ? (
        <div
          style={{
            background: P.surface,
            border: `1px dashed ${P.line}`,
            borderRadius: 10,
            padding: "18px 22px",
            fontFamily: fontBody,
            fontSize: 13,
            color: P.ink2,
            textAlign: "center",
          }}
        >
          {empty}
        </div>
      ) : (
        <div
          style={{
            background: P.surface,
            border: `1px solid ${P.line}`,
            borderRadius: 10,
            overflow: "hidden",
            opacity: stale ? 0.6 : 1,
            transition: "opacity 120ms ease",
          }}
        >
          <ul style={listResetStyle}>{children}</ul>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Care / contact indicator
// ---------------------------------------------------------------------------

// The per-row Contact/Care indicator (reduction plan §6 person row). Every row
// carries this field so the six-field layout is uniform across person types.
// Leaders and co-leaders carry a real care cadence, so they read "Needs
// contact" or "No current concerns". Everyone else — members and non-leader
// login profiles (admins, over-shepherds) — has no per-leader care model, so
// the field renders a neutral "No care model" placeholder rather than vanishing.
function CareIndicator({
  hasCareModel,
  needsContact,
}: {
  hasCareModel: boolean;
  needsContact: boolean;
}) {
  if (!hasCareModel) {
    return <PBadge tone="neutral">No care model</PBadge>;
  }
  return (
    <PBadge tone={needsContact ? "followup" : "healthy"}>
      {needsContact ? "Needs contact" : "No current concerns"}
    </PBadge>
  );
}

// Profile navigation reads as a primary affordance: a solid (ink) pill rather
// than a plain text link. The visible label stays "View person" so the a11y
// suite's link-name probe matches, while aria-label carries the person's name so
// the repeated row links stay uniquely named for screen-reader users.
function ViewPersonLink({ href, name }: { href: string; name: string }) {
  return (
    <PLinkButton
      href={href}
      tone="solid"
      size="sm"
      style={{ whiteSpace: "nowrap" }}
      aria-label={`View person ${name}`}
    >
      View person →
    </PLinkButton>
  );
}

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

// Memoized so unrelated directory re-renders (e.g. debounced-search keystrokes
// before the filtered list settles) don't re-render every row. Props are
// referentially stable: rows come from props and the group lists from memoized
// maps (empty → NO_GROUPS).
const ProfileRow = memo(function ProfileRow({
  profile,
  assignedGroups,
  isSelf,
  needsContact,
}: {
  profile: ProfilesRow;
  assignedGroups: GroupsRow[];
  isSelf: boolean;
  needsContact: boolean;
}) {
  const isLeaderType =
    profile.role === "leader" || profile.role === "co_leader";
  return (
    <li className="lg-m-grid-stack" style={rowStyle}>
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <div
            style={{
              fontFamily: fontDisplay,
              fontSize: 16,
              color: P.ink,
              fontWeight: 500,
            }}
          >
            {profile.full_name}
          </div>
          {/* Role and Status are distinct fields (reduction plan §6): a Role
              badge always, plus a Status badge so an inactive leader still
              reads its role rather than collapsing to "Inactive". */}
          <PBadge tone="neutral">{ROLE_LABELS[profile.role]}</PBadge>
          <PBadge tone={profile.status === "active" ? "healthy" : "pause"}>
            {profile.status === "active" ? "Active" : "Inactive"}
          </PBadge>
          <CareIndicator
            hasCareModel={isLeaderType}
            needsContact={needsContact}
          />
        </div>
        <div
          style={{
            fontFamily: fontBody,
            fontSize: 13,
            color: P.ink2,
            display: "flex",
            gap: 10,
            alignItems: "center",
            flexWrap: "wrap",
            marginTop: 4,
          }}
        >
          <span>{profile.email}</span>
          {profile.phone ? (
            <span style={{ color: P.ink3 }}>· {profile.phone}</span>
          ) : null}
        </div>
        {assignedGroups.length > 0 ? (
          <div
            style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}
          >
            {assignedGroups.map((g) => (
              <PBadge key={g.id} tone="neutral">
                {g.name}
              </PBadge>
            ))}
          </div>
        ) : null}
      </div>
      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "flex-start",
          flexWrap: "wrap",
          justifyContent: "flex-end",
        }}
      >
        <ViewPersonLink
          href={`/admin/people/profile/${profile.id}`}
          name={profile.full_name}
        />
        {isSelf ? (
          <span
            style={{
              fontFamily: fontSans,
              fontSize: 11,
              color: P.ink3,
              fontStyle: "italic",
            }}
          >
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
            {profile.status === "active" ? (
              <DeactivateProfileButton
                profileId={profile.id}
                fullName={profile.full_name}
              />
            ) : null}
          </>
        )}
      </div>
    </li>
  );
});

const MemberRow = memo(function MemberRow({
  member,
  assignedGroups,
}: {
  member: MembersRow;
  assignedGroups: GroupsRow[];
}) {
  return (
    <li className="lg-m-grid-stack" style={rowStyle}>
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <div
            style={{
              fontFamily: fontDisplay,
              fontSize: 16,
              color: P.ink,
              fontWeight: 500,
            }}
          >
            {member.full_name}
          </div>
          <PBadge tone="neutral">Member</PBadge>
          <PBadge tone={member.status === "active" ? "healthy" : "pause"}>
            {member.status === "active" ? "Active" : "Inactive"}
          </PBadge>
          <CareIndicator hasCareModel={false} needsContact={false} />
        </div>
        <div
          style={{
            fontFamily: fontBody,
            fontSize: 13,
            color: P.ink2,
            display: "flex",
            gap: 10,
            alignItems: "center",
            flexWrap: "wrap",
            marginTop: 4,
          }}
        >
          <span>{member.email ?? "—"}</span>
          {member.phone ? (
            <span style={{ color: P.ink3 }}>· {member.phone}</span>
          ) : null}
          {!member.email && !member.phone ? (
            <span style={{ color: P.ink3, fontStyle: "italic" }}>
              no contact details
            </span>
          ) : null}
        </div>
        {assignedGroups.length > 0 ? (
          <div
            style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}
          >
            {assignedGroups.map((g) => (
              <PBadge key={g.id} tone="neutral">
                {g.name}
              </PBadge>
            ))}
          </div>
        ) : null}
      </div>
      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "flex-start",
          flexWrap: "wrap",
          justifyContent: "flex-end",
        }}
      >
        <ViewPersonLink
          href={`/admin/people/member/${member.id}`}
          name={member.full_name}
        />
        {member.status === "active" ? (
          <DeactivateMemberButton
            memberId={member.id}
            fullName={member.full_name}
          />
        ) : null}
      </div>
    </li>
  );
});

// ---------------------------------------------------------------------------
// Shared styles
// ---------------------------------------------------------------------------

const listResetStyle = { listStyle: "none", padding: 0, margin: 0 } as const;

// Stable empty array so people with no assigned groups pass the same reference
// to the memoized rows across renders (a fresh `[]` would defeat React.memo).
const NO_GROUPS: GroupsRow[] = [];

const rowStyle = {
  padding: "14px 18px",
  borderBottom: `1px solid ${P.line2}`,
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) auto",
  gap: 12,
  alignItems: "start",
} as const;

const alertStyle = {
  background: P.terraSoft,
  border: `1px solid ${P.terra}`,
  borderRadius: 8,
  padding: "12px 14px",
  fontFamily: fontBody,
  fontSize: 13,
  color: "#7d3621",
} as const;
