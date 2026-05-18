import { Phase5A1Notice } from "@/components/admin/phase-5a1-notice";
import { LeaderProfilesSection } from "@/components/admin/leader-profiles-section";
import { MembersSection } from "@/components/admin/members-section";
import { GroupAssignmentsSection } from "@/components/admin/group-assignments-section";
import { ROLE_LABELS } from "@/lib/auth/roles";
import { P, fontBody } from "@/lib/pastoral";
import type {
  GroupLeadersRow,
  GroupMembershipsRow,
  GroupsRow,
  MembersRow,
  ProfilesRow,
} from "@/types/database";

export type PeopleManagementData = {
  currentActorProfileId: string;
  profiles: ProfilesRow[];
  members: MembersRow[];
  groups: GroupsRow[];
  groupLeaders: GroupLeadersRow[];
  memberships: GroupMembershipsRow[];
  errors: {
    profiles: string | null;
    members: string | null;
    groups: string | null;
    leaders: string | null;
    memberships: string | null;
  };
};

export function PeopleManagementShell({ data }: { data: PeopleManagementData }) {
  const profilesById = new Map(data.profiles.map((p) => [p.id, p]));
  const membersById = new Map(data.members.map((m) => [m.id, m]));

  const leaderOptions = data.profiles
    .filter((p) => (p.role === "leader" || p.role === "co_leader") && p.status === "active")
    .map((p) => ({
      id: p.id,
      label: `${p.full_name} (${ROLE_LABELS[p.role]})`,
    }));

  const memberOptions = data.members
    .filter((m) => m.status === "active")
    .map((m) => ({ id: m.id, label: m.full_name }));

  const anyError =
    data.errors.profiles ||
    data.errors.members ||
    data.errors.groups ||
    data.errors.leaders ||
    data.errors.memberships;

  return (
    <div style={{ display: "grid", gap: 36 }}>
      <Phase5A1Notice />

      {anyError ? (
        <div
          role="alert"
          style={{
            background: P.terraSoft,
            border: `1px solid ${P.terra}`,
            borderRadius: 8,
            padding: "12px 14px",
            fontFamily: fontBody,
            fontSize: 13,
            color: "#7d3621",
          }}
        >
          Some sections couldn&rsquo;t load. The page below shows what we did get;
          retry in a moment or check the Supabase connection.
        </div>
      ) : null}

      <LeaderProfilesSection
        profiles={data.profiles}
        currentActorProfileId={data.currentActorProfileId}
        error={data.errors.profiles}
      />

      <MembersSection members={data.members} error={data.errors.members} />

      <GroupAssignmentsSection
        groups={data.groups}
        groupLeaders={data.groupLeaders}
        memberships={data.memberships}
        profilesById={profilesById}
        membersById={membersById}
        leaderOptions={leaderOptions}
        memberOptions={memberOptions}
        groupsError={data.errors.groups}
        leadersError={data.errors.leaders}
        membershipsError={data.errors.memberships}
      />
    </div>
  );
}
