import { PastoralAppShell } from "@/components/pastoral/shell";
import { UserPill } from "@/components/auth/user-pill";
import { LogoutButton } from "@/components/auth/logout-button";
import {
  AdminFollowUpsShell,
  type AdminFollowUpsData,
} from "@/components/admin/follow-ups/follow-ups-shell";
import { requireAdmin } from "@/lib/auth/session";
import { navItemsForRole } from "@/lib/auth/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  fetchAllGroups,
  fetchAllMembers,
  fetchFollowUpsForAdmin,
  fetchGuests,
  fetchProfilesForAdmin,
} from "@/lib/supabase/read-models";

export const dynamic = "force-dynamic";

const EMPTY_DATA: AdminFollowUpsData = {
  followUps: [],
  groups: [],
  members: [],
  guests: [],
  assigneeProfiles: [],
  errors: {
    followUps: "The database is not configured in this environment.",
    groups: "The database is not configured in this environment.",
    members: "The database is not configured in this environment.",
    guests: "The database is not configured in this environment.",
    profiles: "The database is not configured in this environment.",
  },
};

async function loadData(): Promise<AdminFollowUpsData> {
  const client = await createSupabaseServerClient();
  if (!client) return EMPTY_DATA;

  const [followUpsResult, groupsResult, membersResult, guestsResult, profilesResult] =
    await Promise.all([
      fetchFollowUpsForAdmin(client),
      fetchAllGroups(client),
      fetchAllMembers(client, { statuses: ["active"] }),
      fetchGuests(client),
      fetchProfilesForAdmin(client, {
        roles: ["super_admin", "ministry_admin", "leader", "co_leader"],
        statuses: ["active"],
      }),
    ]);

  return {
    followUps: followUpsResult.data ?? [],
    groups: groupsResult.data ?? [],
    members: membersResult.data ?? [],
    guests: guestsResult.data ?? [],
    assigneeProfiles: profilesResult.data ?? [],
    errors: {
      followUps: followUpsResult.error?.message ?? null,
      groups: groupsResult.error?.message ?? null,
      members: membersResult.error?.message ?? null,
      guests: guestsResult.error?.message ?? null,
      profiles: profilesResult.error?.message ?? null,
    },
  };
}

export default async function AdminFollowUpsPage() {
  const session = await requireAdmin();
  const data = await loadData();

  return (
    <PastoralAppShell
      navItems={navItemsForRole(session.profile.role)}
      currentUser={{
        name: session.profile.full_name,
        email: session.profile.email,
        role: session.profile.role,
      }}
      eyebrow="Follow-ups"
      title="Follow-ups"
      lede="Open follow-ups tied to a group, member, guest, or leader. Mark in progress when you start. Mark done when it lands. Leaders see only the items assigned to them."
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
      <AdminFollowUpsShell data={data} />
    </PastoralAppShell>
  );
}
