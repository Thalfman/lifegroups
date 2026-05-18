import { SectionHeader } from "@/components/layout/shell";
import { Phase5A4Notice } from "@/components/admin/phase-5a4-notice";
import { PeopleDirectory } from "@/components/admin/people-directory";
import { GroupAssignmentsSection } from "@/components/admin/group-assignments-section";
import { LeaderProfileForm } from "@/components/admin/forms/leader-profile-form";
import { MemberForm } from "@/components/admin/forms/member-form";
import { ROLE_LABELS } from "@/lib/auth/roles";
import { P, fontBody, fontDisplay, fontSans } from "@/lib/pastoral";
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

  return (
    <div style={{ display: "grid", gap: 36 }}>
      <Phase5A4Notice />

      <PeopleDirectory
        profiles={data.profiles}
        members={data.members}
        groups={data.groups}
        groupLeaders={data.groupLeaders}
        memberships={data.memberships}
        currentActorProfileId={data.currentActorProfileId}
        errors={{
          profiles: data.errors.profiles,
          members: data.errors.members,
          leaders: data.errors.leaders,
          memberships: data.errors.memberships,
        }}
      />

      <section style={{ display: "grid", gap: 18 }}>
        <SectionHeader
          eyebrow="Add new"
          title="Add a leader or a member"
          description="Leader profiles get a sign-in. Members are participant records only — they don't sign in. Use the assign section below to place them in a group."
        />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 16,
          }}
        >
          <Card>
            <CardHeader title="Add leader profile" caption="Creates a sign-in profile." />
            <LeaderProfileForm />
          </Card>
          <Card>
            <CardHeader
              title="Add member"
              caption="Non-login participant record. Email is optional."
            />
            <MemberForm />
          </Card>
        </div>
      </section>

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

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: P.surface,
        border: `1px solid ${P.line}`,
        borderRadius: 10,
        padding: "18px 22px",
      }}
    >
      {children}
    </div>
  );
}

function CardHeader({ title, caption }: { title: string; caption: string }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div
        style={{
          fontFamily: fontDisplay,
          fontSize: 17,
          color: P.ink,
          fontWeight: 500,
        }}
      >
        {title}
      </div>
      <p
        style={{
          fontFamily: fontBody,
          fontSize: 12,
          color: P.ink3,
          margin: "2px 0 0",
          letterSpacing: 0.1,
        }}
      >
        <span style={{ fontFamily: fontSans }}>{caption}</span>
      </p>
    </div>
  );
}
