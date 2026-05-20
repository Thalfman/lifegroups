import { PastoralAppShell } from "@/components/pastoral/shell";
import { UserPill } from "@/components/auth/user-pill";
import { LogoutButton } from "@/components/auth/logout-button";
import {
  PeopleManagementShell,
  type PeopleManagementData,
} from "@/components/admin/people-management-shell";
import { requireAdmin } from "@/lib/auth/session";
import { navItemsForRole } from "@/lib/auth/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  fetchAllGroupLeaders,
  fetchAllGroups,
  fetchAllMembers,
  fetchActiveMemberships,
  fetchProfilesForAdmin,
} from "@/lib/supabase/read-models";

export const dynamic = "force-dynamic";

const EMPTY_DATA = (currentActorProfileId: string): PeopleManagementData => ({
  currentActorProfileId,
  profiles: [],
  members: [],
  groups: [],
  groupLeaders: [],
  memberships: [],
  errors: {
    profiles: null,
    members: null,
    groups: null,
    leaders: null,
    memberships: null,
  },
});

async function loadData(currentActorProfileId: string): Promise<PeopleManagementData> {
  const client = await createSupabaseServerClient();
  if (!client) return EMPTY_DATA(currentActorProfileId);

  const [
    profilesResult,
    membersResult,
    groupsResult,
    leadersResult,
    membershipsResult,
  ] = await Promise.all([
    fetchProfilesForAdmin(client, { statuses: ["active", "inactive"] }),
    fetchAllMembers(client, { statuses: ["active", "inactive"] }),
    fetchAllGroups(client),
    fetchAllGroupLeaders(client, { activeOnly: true }),
    fetchActiveMemberships(client),
  ]);

  return {
    currentActorProfileId,
    profiles: profilesResult.data ?? [],
    members: membersResult.data ?? [],
    groups: groupsResult.data ?? [],
    groupLeaders: leadersResult.data ?? [],
    memberships: membershipsResult.data ?? [],
    errors: {
      profiles: profilesResult.error?.message ?? null,
      members: membersResult.error?.message ?? null,
      groups: groupsResult.error?.message ?? null,
      leaders: leadersResult.error?.message ?? null,
      memberships: membershipsResult.error?.message ?? null,
    },
  };
}

export default async function AdminPeoplePage() {
  const session = await requireAdmin();
  const data = await loadData(session.profile.id);

  return (
    <PastoralAppShell
      navItems={navItemsForRole(session.profile.role)}
      currentUser={{
        name: session.profile.full_name,
        email: session.profile.email,
        role: session.profile.role,
      }}
      eyebrow="People"
      title="People"
      lede="Search the directory, swap leader / co-leader roles, add new people, and place them in groups. Members are non-login participant records — they never sign in."
      headerSlot={
        <>
          <UserPill
            name={session.profile.full_name}
            email={session.profile.email}
            role={session.profile.role}
          />
          <LogoutButton />
        </>
      }
    >
      <PeopleManagementShell data={data} />
    </PastoralAppShell>
  );
}
