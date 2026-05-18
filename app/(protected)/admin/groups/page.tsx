import { PastoralAppShell } from "@/components/pastoral/shell";
import { UserPill } from "@/components/auth/user-pill";
import { LogoutButton } from "@/components/auth/logout-button";
import {
  GroupManagementShell,
  type GroupManagementData,
} from "@/components/admin/group-management-shell";
import { requireAdmin } from "@/lib/auth/session";
import { navItemsForRole } from "@/lib/auth/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  fetchAllGroups,
  fetchAllMembers,
  fetchProfilesForAdmin,
} from "@/lib/supabase/read-models";

export const dynamic = "force-dynamic";

const EMPTY_DATA: GroupManagementData = {
  groups: [],
  profiles: [],
  members: [],
  errors: {
    groups: "Supabase is not configured in this environment.",
    profiles: null,
    members: null,
  },
};

async function loadData(): Promise<GroupManagementData> {
  const client = await createSupabaseServerClient();
  if (!client) return EMPTY_DATA;

  const [groupsResult, profilesResult, membersResult] = await Promise.all([
    fetchAllGroups(client),
    fetchProfilesForAdmin(client, { statuses: ["active", "inactive"] }),
    fetchAllMembers(client, { statuses: ["active", "inactive"] }),
  ]);

  return {
    groups: groupsResult.data ?? [],
    profiles: profilesResult.data ?? [],
    members: membersResult.data ?? [],
    errors: {
      groups: groupsResult.error?.message ?? null,
      profiles: profilesResult.error?.message ?? null,
      members: membersResult.error?.message ?? null,
    },
  };
}

export default async function AdminGroupsPage() {
  const session = await requireAdmin();
  const data = await loadData();

  return (
    <PastoralAppShell
      navItems={navItemsForRole(session.profile.role)}
      eyebrow="Phase 5A.2 · Manage groups"
      title="Every Life Group,"
      titleItalic="held in view."
      lede="Create new groups, polish the details, and quietly close ones that have run their course. Nothing is ever deleted — closed groups stay in the record and can be reopened later."
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
      <GroupManagementShell data={data} />
    </PastoralAppShell>
  );
}
